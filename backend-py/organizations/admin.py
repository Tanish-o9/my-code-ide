from django.contrib import admin
from .models import (
    Organization, OrganizationMembership, OrgSSOConfig,
    Workspace, AuditEvent, ExportRequest, DeletionRequest,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "billing_plan", "created_by", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("billing_plan",)


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "joined_at")
    list_filter = ("role",)


@admin.register(OrgSSOConfig)
class OrgSSOConfigAdmin(admin.ModelAdmin):
    list_display = ("organization", "provider", "sso_enabled", "enforce_sso")
    list_filter = ("provider", "sso_enabled", "enforce_sso")


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "owner", "container_status", "created_at")
    list_filter = ("container_status",)


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "organization", "action_type", "actor", "target_object")
    list_filter = ("action_type", "organization")
    readonly_fields = [f.name for f in AuditEvent._meta.fields]

    def has_change_permission(self, request, obj=None) -> bool:
        return False  # immutable

    def has_delete_permission(self, request, obj=None) -> bool:
        return False  # immutable


@admin.register(ExportRequest)
class ExportRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "status", "created_at")
    list_filter = ("status",)


@admin.register(DeletionRequest)
class DeletionRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "status", "scheduled_hard_delete", "created_at")
    list_filter = ("status",)
