from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"organizations", views.OrganizationViewSet, basename="organization")

# Nested routes are registered manually for clarity
urlpatterns = [
    path("", include(router.urls)),
    # Nested: /organizations/{pk}/members/
    path(
        "organizations/<uuid:organization_pk>/members/",
        views.MembershipViewSet.as_view({"get": "list"}),
        name="org-members-list",
    ),
    path(
        "organizations/<uuid:organization_pk>/members/invite/",
        views.MembershipViewSet.as_view({"post": "invite"}),
        name="org-members-invite",
    ),
    path(
        "organizations/<uuid:organization_pk>/members/<uuid:pk>/change-role/",
        views.MembershipViewSet.as_view({"patch": "change_role"}),
        name="org-members-change-role",
    ),
    path(
        "organizations/<uuid:organization_pk>/members/<uuid:pk>/remove/",
        views.MembershipViewSet.as_view({"delete": "remove"}),
        name="org-members-remove",
    ),
    # Nested: /organizations/{pk}/sso/
    path(
        "organizations/<uuid:organization_pk>/sso/",
        views.SSOConfigViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="org-sso-config",
    ),
    # Nested: /organizations/{pk}/workspaces/
    path(
        "organizations/<uuid:organization_pk>/workspaces/",
        views.OrgWorkspaceViewSet.as_view({"get": "list"}),
        name="org-workspaces-list",
    ),
    # Nested: /organizations/{pk}/audit-logs/
    path(
        "organizations/<uuid:organization_pk>/audit-logs/",
        views.AuditEventViewSet.as_view({"get": "list"}),
        name="org-audit-logs",
    ),
    path(
        "organizations/<uuid:organization_pk>/audit-logs/csv/",
        views.AuditEventViewSet.as_view({"get": "csv"}),
        name="org-audit-logs-csv",
    ),
    # Nested: /organizations/{pk}/gdpr/
    path(
        "organizations/<uuid:organization_pk>/gdpr/export/",
        views.GDPRViewSet.as_view({"post": "export"}),
        name="org-gdpr-export",
    ),
    path(
        "organizations/<uuid:organization_pk>/gdpr/delete-account/",
        views.GDPRViewSet.as_view({"post": "delete_account"}),
        name="org-gdpr-delete-account",
    ),
    path(
        "organizations/<uuid:organization_pk>/gdpr/confirm-deletion/",
        views.GDPRViewSet.as_view({"post": "confirm_deletion"}),
        name="org-gdpr-confirm-deletion",
    ),
    path(
        "organizations/<uuid:organization_pk>/gdpr/cancel-deletion/",
        views.GDPRViewSet.as_view({"post": "cancel_deletion"}),
        name="org-gdpr-cancel-deletion",
    ),
]
