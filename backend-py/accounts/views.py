from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer, SSOCallbackSerializer,
)


def _jwt_response(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    ser = RegisterSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    user = User.objects.create_user(
        email=ser.validated_data["email"],
        name=ser.validated_data["name"],
        password=ser.validated_data["password"],
    )
    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at"])
    return Response(_jwt_response(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    ser = LoginSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    user = authenticate(
        request,
        email=ser.validated_data["email"],
        password=ser.validated_data["password"],
    )
    if user is None:
        return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    # SSO-enforcement check
    from organizations.models import OrganizationMembership, OrgSSOConfig
    org_ids = OrganizationMembership.objects.filter(user=user).values_list("organization_id", flat=True)
    if OrgSSOConfig.objects.filter(
        organization_id__in=org_ids, sso_enabled=True, enforce_sso=True
    ).exists():
        return Response(
            {"error": "SSO is enforced for your organization. Please sign in via Enterprise SSO."},
            status=status.HTTP_403_FORBIDDEN,
        )

    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at"])
    return Response(_jwt_response(user))


@api_view(["POST"])
@permission_classes([AllowAny])
def sso_callback(request):
    ser = SSOCallbackSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    email = ser.validated_data["email"]
    name = ser.validated_data["name"]
    idp = ser.validated_data["idp"]
    org_id = ser.validated_data.get("organization_id")

    user, created = User.objects.get_or_create(
        email=email,
        defaults={"name": name, "password": User.objects.make_random_password()},
    )

    from organizations.models import OrgSSOConfig, OrganizationMembership
    from organizations.audit import record_audit

    if org_id:
        OrganizationMembership.objects.get_or_create(
            user=user, organization_id=org_id, defaults={"role": "member"}
        )
    else:
        domain = email.split("@")[1] if "@" in email else ""
        for cfg in OrgSSOConfig.objects.filter(
            verified_domains__contains=[domain], sso_enabled=True
        ):
            _, was_new = OrganizationMembership.objects.get_or_create(
                user=user, organization=cfg.organization, defaults={"role": "member"}
            )
            if was_new:
                record_audit(
                    organization_id=cfg.organization_id,
                    actor_id=user.id,
                    action_type="member_auto_joined_sso",
                    target_object=user.email,
                    metadata={"domain": domain, "idp": idp},
                )

    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at"])

    resp = _jwt_response(user)
    resp["is_new_user"] = created
    return Response(resp)


@api_view(["GET"])
def me(request):
    return Response(UserSerializer(request.user).data)
