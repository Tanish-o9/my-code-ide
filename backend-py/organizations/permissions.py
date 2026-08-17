from rest_framework.permissions import BasePermission
from .models import OrganizationMembership


class HasOrgRole(BasePermission):
    """
    Permission class that checks the requesting user has one of the allowed
    roles in the organization identified by a URL kwarg.

    Usage:
        class SomeView(APIView):
            permission_classes = [HasOrgRole]
            allowed_org_roles = ['owner', 'admin']
    """

    allowed_org_roles: list[str] = ["owner", "admin", "member"]

    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        org_id = view.kwargs.get("organization_id") or view.kwargs.get("pk")
        if not org_id:
            return False

        roles = getattr(view, "allowed_org_roles", self.allowed_org_roles)
        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=org_id,
            role__in=roles,
        ).exists()


class IsOrgAdminOrOwner(HasOrgRole):
    allowed_org_roles = ["owner", "admin"]


class IsOrgOwner(HasOrgRole):
    allowed_org_roles = ["owner"]
