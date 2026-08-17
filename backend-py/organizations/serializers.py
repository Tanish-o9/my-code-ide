from rest_framework import serializers
from .models import (
    Organization, OrganizationMembership, OrgSSOConfig,
    Workspace, AuditEvent, ExportRequest, DeletionRequest,
)


# ── Organization ──────────────────────────────────────────────────────────
class OrganizationSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    workspace_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "id", "name", "slug", "billing_plan", "created_by",
            "created_at", "audit_retention_days", "member_count", "workspace_count",
        )
        read_only_fields = ("id", "created_by", "created_at", "member_count", "workspace_count")

    def get_member_count(self, obj) -> int:
        return obj.memberships.count()

    def get_workspace_count(self, obj) -> int:
        return obj.workspaces.count()

    def validate_slug(self, value: str) -> str:
        if Organization.objects.filter(slug=value).exclude(pk=self.instance.pk if self.instance else None).exists():
            raise serializers.ValidationError("Slug already in use")
        return value.lower().strip()


class OrganizationCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=128)


# ── Membership ────────────────────────────────────────────────────────────
class OrganizationMembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ("id", "user", "user_email", "user_name", "organization", "role", "joined_at")
        read_only_fields = ("id", "joined_at")


class InviteMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=OrganizationMembership.ROLES, default="member")


class ChangeRoleSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    new_role = serializers.ChoiceField(choices=OrganizationMembership.ROLES)


# ── SSO Config ────────────────────────────────────────────────────────────
class OrgSSOConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgSSOConfig
        exclude = ("oidc_client_secret",)
        read_only_fields = ("id", "created_at", "updated_at")


# ── Workspace ─────────────────────────────────────────────────────────────
class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = "__all__"
        read_only_fields = ("id", "created_at")


# ── Audit ─────────────────────────────────────────────────────────────────
class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True, allow_null=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True, allow_null=True)

    class Meta:
        model = AuditEvent
        fields = "__all__"
        read_only_fields = "__all__"


# ── GDPR ──────────────────────────────────────────────────────────────────
class ExportRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExportRequest
        fields = "__all__"
        read_only_fields = ("id", "status", "download_url", "expires_at", "created_at")


class DeletionRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeletionRequest
        fields = "__all__"
        read_only_fields = ("id", "status", "confirmed_at", "scheduled_hard_delete", "created_at")
