import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone


# ──────────────────────────────────────────────────────────────────────────
# 1. Organization
# ──────────────────────────────────────────────────────────────────────────
class Organization(models.Model):
    BILLING_PLANS = [
        ("free", "Free"),
        ("pro", "Pro"),
        ("enterprise", "Enterprise"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, max_length=128)
    billing_plan = models.CharField(max_length=20, choices=BILLING_PLANS, default="free")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # Audit retention (configurable per org for compliance)
    audit_retention_days = models.PositiveIntegerField(default=365)

    class Meta:
        db_table = "organizations_organization"
        verbose_name = "Organization"
        verbose_name_plural = "Organizations"

    def __str__(self) -> str:
        return self.name


# ──────────────────────────────────────────────────────────────────────────
# 2. Organization Membership
# ──────────────────────────────────────────────────────────────────────────
class OrganizationMembership(models.Model):
    ROLES = [
        ("owner", "Owner"),
        ("admin", "Admin"),
        ("member", "Member"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="org_memberships")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=ROLES, default="member")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "organizations_membership"
        unique_together = [("user", "organization")]

    def __str__(self) -> str:
        return f"{self.user.email} @ {self.organization.name} ({self.role})"


# ──────────────────────────────────────────────────────────────────────────
# 3. Organization SSO Configuration
# ──────────────────────────────────────────────────────────────────────────
class OrgSSOConfig(models.Model):
    SSO_PROVIDERS = [
        ("saml", "SAML 2.0"),
        ("oidc", "OpenID Connect"),
        ("okta", "Okta"),
        ("azure_ad", "Azure AD"),
        ("google_workspace", "Google Workspace"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="sso_config")
    provider = models.CharField(max_length=32, choices=SSO_PROVIDERS, default="saml")
    sso_enabled = models.BooleanField(default=False)
    enforce_sso = models.BooleanField(default=False)
    verified_domains = models.JSONField(default=list, blank=True)  # ["example.com"]

    # SAML-specific
    idp_metadata_url = models.URLField(blank=True, default="")
    idp_entity_id = models.CharField(max_length=512, blank=True, default="")
    sp_entity_id = models.CharField(max_length=512, blank=True, default="")
    sp_acs_url = models.URLField(blank=True, default="")

    # OIDC-specific
    oidc_client_id = models.CharField(max_length=255, blank=True, default="")
    oidc_client_secret = models.CharField(max_length=255, blank=True, default="")
    oidc_authorization_url = models.URLField(blank=True, default="")
    oidc_token_url = models.URLField(blank=True, default="")
    oidc_userinfo_url = models.URLField(blank=True, default="")
    oidc_scopes = models.CharField(max_length=255, blank=True, default="openid email profile")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organizations_sso_config"

    def __str__(self) -> str:
        return f"SSO({self.provider}) for {self.organization.name}"


# ──────────────────────────────────────────────────────────────────────────
# 4. Workspace (mirror of the TS model, owned by an Organization)
# ──────────────────────────────────────────────────────────────────────────
class Workspace(models.Model):
    CONTAINER_STATUS = [
        ("stopped", "Stopped"),
        ("running", "Running"),
        ("provisioning", "Provisioning"),
        ("error", "Error"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="workspaces")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_workspaces")
    template_used = models.CharField(max_length=128, default="Blank")
    storage_path = models.CharField(max_length=1024)
    container_status = models.CharField(max_length=20, choices=CONTAINER_STATUS, default="provisioning")
    last_accessed_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "organizations_workspace"

    def __str__(self) -> str:
        return f"{self.name} ({self.organization.name})"


# ──────────────────────────────────────────────────────────────────────────
# 5. Audit Event (immutable)
# ──────────────────────────────────────────────────────────────────────────
class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="audit_events")
    workspace = models.ForeignKey(Workspace, on_delete=models.SET_NULL, null=True, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action_type = models.CharField(max_length=128, db_index=True)
    target_object = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "organizations_audit_event"
        ordering = ["-timestamp"]
        # Enforce immutability at the DB level: no update allowed
        permissions = [
            ("view_auditlog", "Can view audit log"),
        ]

    def save(self, *args, **kwargs):
        if self._state.adding is False:
            raise RuntimeError("AuditEvent is immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("AuditEvent is immutable and cannot be deleted.")

    def __str__(self) -> str:
        return f"[{self.timestamp}] {self.action_type} by {self.actor_id}"


# ──────────────────────────────────────────────────────────────────────────
# 6. GDPR Export Request
# ──────────────────────────────────────────────────────────────────────────
class ExportRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="export_requests")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    download_url = models.URLField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "organizations_export_request"

    def __str__(self) -> str:
        return f"Export {self.id} ({self.status})"


# ──────────────────────────────────────────────────────────────────────────
# 7. GDPR Deletion Request
# ──────────────────────────────────────────────────────────────────────────
class DeletionRequest(models.Model):
    STATUS_CHOICES = [
        ("pending_confirmation", "Pending Confirmation"),
        ("grace_period", "Grace Period"),
        ("deleted", "Deleted"),
        ("cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deletion_requests")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True)
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default="pending_confirmation")
    confirmed_at = models.DateTimeField(null=True, blank=True)
    scheduled_hard_delete = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "organizations_deletion_request"

    def __str__(self) -> str:
        return f"Deletion {self.id} ({self.status})"
