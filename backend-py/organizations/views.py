import uuid
from django.utils import timezone
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters import rest_framework as filters

from .models import (
    Organization, OrganizationMembership, OrgSSOConfig,
    Workspace, AuditEvent, ExportRequest, DeletionRequest,
)
from .serializers import (
    OrganizationSerializer, OrganizationCreateSerializer,
    OrganizationMembershipSerializer, InviteMemberSerializer, ChangeRoleSerializer,
    OrgSSOConfigSerializer, WorkspaceSerializer,
    AuditEventSerializer, ExportRequestSerializer, DeletionRequestSerializer,
)
from .permissions import IsOrgAdminOrOwner, IsOrgOwner
from .audit import record_audit


# ──────────────────────────────────────────────────────────────────────────
# Organization ViewSet
# ──────────────────────────────────────────────────────────────────────────
class OrganizationViewSet(mixins.CreateModelMixin,
                          mixins.RetrieveModelMixin,
                          mixins.ListModelMixin,
                          mixins.UpdateModelMixin,
                          viewsets.GenericViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Users can only see orgs they belong to."""
        user = self.request.user
        return Organization.objects.filter(memberships__user=user)

    def perform_create(self, serializer):
        org = serializer.save(created_by=self.request.user)
        # Auto-create owner membership
        OrganizationMembership.objects.create(
            user=self.request.user,
            organization=org,
            role="owner",
        )
        record_audit(
            organization_id=org.id,
            actor_id=self.request.user.id,
            action_type="organization_created",
            target_object=org.name,
            metadata={"slug": org.slug},
            ip_address=self._client_ip(),
        )

    def _client_ip(self) -> str | None:
        xff = self.request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return self.request.META.get("REMOTE_ADDR")

    def get_serializer_class(self):
        if self.action == "create":
            return OrganizationCreateSerializer
        return OrganizationSerializer


# ──────────────────────────────────────────────────────────────────────────
# Membership ViewSet (nested under /organizations/{pk}/members)
# ──────────────────────────────────────────────────────────────────────────
class MembershipViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrganizationMembershipSerializer
    permission_classes = [IsAuthenticated, IsOrgAdminOrOwner]

    def get_queryset(self):
        return OrganizationMembership.objects.filter(
            organization_id=self.kwargs["organization_pk"]
        ).select_related("user")

    @action(detail=False, methods=["post"], permission_classes=[IsOrgAdminOrOwner])
    def invite(self, request, organization_pk=None):
        ser = InviteMemberSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        from accounts.models import User
        try:
            target = User.objects.get(email__iexact=ser.validated_data["email"])
        except User.DoesNotExist:
            return Response(
                {"error": "User with this email not found. They must register first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        membership, created = OrganizationMembership.objects.get_or_create(
            user=target,
            organization_id=organization_pk,
            defaults={"role": ser.validated_data["role"]},
        )
        if not created:
            return Response({"error": "User is already a member"}, status=status.HTTP_409_CONFLICT)

        record_audit(
            organization_id=organization_pk,
            actor_id=request.user.id,
            action_type="member_invited",
            target_object=target.email,
            metadata={"role": membership.role},
            ip_address=self._client_ip(request),
        )
        return Response(OrganizationMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], permission_classes=[IsOrgAdminOrOwner])
    def change_role(self, request, organization_pk=None, pk=None):
        membership = self.get_object()
        ser = ChangeRoleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        old_role = membership.role
        membership.role = ser.validated_data["new_role"]
        membership.save(update_fields=["role"])

        record_audit(
            organization_id=organization_pk,
            actor_id=request.user.id,
            action_type="member_role_changed",
            target_object=str(membership.user_id),
            metadata={"old_role": old_role, "new_role": membership.role},
            ip_address=self._client_ip(request),
        )
        return Response(OrganizationMembershipSerializer(membership).data)

    @action(detail=True, methods=["delete"], permission_classes=[IsOrgAdminOrOwner])
    def remove(self, request, organization_pk=None, pk=None):
        membership = self.get_object()
        user_id = membership.user_id
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _client_ip(self, request) -> str | None:
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")


# ──────────────────────────────────────────────────────────────────────────
# SSO Config ViewSet (nested under /organizations/{pk}/sso)
# ──────────────────────────────────────────────────────────────────────────
class SSOConfigViewSet(mixins.RetrieveModelMixin,
                       mixins.UpdateModelMixin,
                       viewsets.GenericViewSet):
    serializer_class = OrgSSOConfigSerializer
    permission_classes = [IsAuthenticated, IsOrgAdminOrOwner]

    def get_object(self):
        org_id = self.kwargs["organization_pk"]
        config, _ = OrgSSOConfig.objects.get_or_create(organization_id=org_id)
        return config


# ──────────────────────────────────────────────────────────────────────────
# Workspace ViewSet (nested under /organizations/{pk}/workspaces)
# ──────────────────────────────────────────────────────────────────────────
class OrgWorkspaceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated, IsOrgAdminOrOwner]

    def get_queryset(self):
        return Workspace.objects.filter(organization_id=self.kwargs["organization_pk"])


# ──────────────────────────────────────────────────────────────────────────
# Audit Log ViewSet (nested under /organizations/{pk}/audit-logs)
# ──────────────────────────────────────────────────────────────────────────
class AuditEventFilter(filters.FilterSet):
    action_type = filters.CharFilter(lookup_expr="exact")
    actor_id = filters.UUIDFilter()
    workspace_id = filters.UUIDFilter()
    date_from = filters.DateTimeFilter(field_name="timestamp", lookup_expr="gte")
    date_to = filters.DateTimeFilter(field_name="timestamp", lookup_expr="lte")

    class Meta:
        model = AuditEvent
        fields = ["action_type", "actor_id", "workspace_id", "date_from", "date_to"]


class AuditEventViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditEventSerializer
    permission_classes = [IsAuthenticated, IsOrgAdminOrOwner]
    filterset_class = AuditEventFilter
    ordering_fields = ["timestamp"]
    ordering = ["-timestamp"]

    def get_queryset(self):
        return AuditEvent.objects.filter(
            organization_id=self.kwargs["organization_pk"]
        ).select_related("actor", "workspace")

    @action(detail=False, methods=["get"])
    def csv(self, request, organization_pk=None):
        """Export audit log as CSV."""
        qs = self.filter_queryset(self.get_queryset())
        import csv
        from django.http import HttpResponse

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f"attachment; filename=audit-{organization_pk}.csv"
        writer = csv.writer(response)
        writer.writerow(["Timestamp", "Actor", "Action", "Target", "IP", "Workspace"])
        for e in qs:
            writer.writerow([
                e.timestamp.isoformat(),
                e.actor.email if e.actor else "System",
                e.action_type,
                e.target_object,
                e.ip_address or "",
                e.workspace.name if e.workspace else "",
            ])
        return response


# ──────────────────────────────────────────────────────────────────────────
# GDPR Endpoints (nested under /organizations/{pk}/gdpr)
# ──────────────────────────────────────────────────────────────────────────
class GDPRViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"])
    def export(self, request, organization_pk=None):
        """Request a data export."""
        export = ExportRequest.objects.create(
            user=request.user,
            organization_id=organization_pk,
        )
        # Trigger Celery task (see tasks.py)
        from .tasks import process_export
        process_export.delay(str(export.id))

        return Response(
            {"message": "Export requested. You will receive a download link when ready.", "id": export.id},
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=False, methods=["post"])
    def delete_account(self, request, organization_pk=None):
        """Initiate account deletion (30-day grace period)."""
        from accounts.models import User
        user = request.user

        if user.marked_for_deletion:
            return Response({"error": "Deletion already in progress"}, status=status.HTTP_409_CONFLICT)

        deletion = DeletionRequest.objects.create(
            user=user,
            organization_id=organization_pk,
            status="pending_confirmation",
            scheduled_hard_delete=timezone.now() + timezone.timedelta(days=30),
        )

        # Send confirmation email (stub)
        print(f"[GDPR] Confirmation email sent to {user.email} for deletion {deletion.id}")

        return Response({
            "message": "Confirmation email sent. Please verify to start the 30-day grace period.",
            "deletion_id": deletion.id,
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=["post"])
    def confirm_deletion(self, request, organization_pk=None):
        """Confirm deletion after email verification."""
        token = request.data.get("token")
        if not token:
            return Response({"error": "Token required"}, status=status.HTTP_400_BAD_REQUEST)

        deletion = DeletionRequest.objects.filter(
            user=request.user,
            status="pending_confirmation",
        ).last()
        if not deletion:
            return Response({"error": "No pending deletion request"}, status=status.HTTP_404_NOT_FOUND)

        deletion.status = "grace_period"
        deletion.confirmed_at = timezone.now()
        deletion.save(update_fields=["status", "confirmed_at"])

        # Soft-delete user
        request.user.marked_for_deletion = True
        request.user.is_active = False
        request.user.save(update_fields=["marked_for_deletion", "is_active"])

        # Schedule hard-delete via Celery
        from .tasks import process_hard_delete
        process_hard_delete.apply_async(args=[str(deletion.id)], eta=deletion.scheduled_hard_delete)

        return Response({
            "message": "Deletion confirmed. Your account will be permanently deleted after 30 days.",
            "scheduled_hard_delete": deletion.scheduled_hard_delete,
        })

    @action(detail=False, methods=["post"])
    def cancel_deletion(self, request, organization_pk=None):
        """Cancel a pending deletion request."""
        deletion = DeletionRequest.objects.filter(
            user=request.user,
            status__in=["pending_confirmation", "grace_period"],
        ).last()
        if not deletion:
            return Response({"error": "No active deletion request"}, status=status.HTTP_404_NOT_FOUND)

        deletion.status = "cancelled"
        deletion.save(update_fields=["status"])

        request.user.marked_for_deletion = False
        request.user.is_active = True
        request.user.save(update_fields=["marked_for_deletion", "is_active"])

        return Response({"message": "Deletion cancelled."})
