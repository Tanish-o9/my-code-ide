"""
Signal-based audit hooks.

These connect to Django model signals so that existing modules (workspace CRUD,
membership changes, etc.) automatically produce audit events without needing
manual wiring in every view.
"""
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import OrganizationMembership, Workspace, OrgSSOConfig
from .audit import record_audit


# ── Membership changes ────────────────────────────────────────────────────
@receiver(post_save, sender=OrganizationMembership)
def audit_membership_save(sender, instance, created, **kwargs):
    if created:
        record_audit(
            organization_id=instance.organization_id,
            actor_id=instance.user_id,
            action_type="member_added",
            target_object=instance.user.email if hasattr(instance.user, "email") else str(instance.user_id),
            metadata={"role": instance.role},
        )


@receiver(pre_delete, sender=OrganizationMembership)
def audit_membership_delete(sender, instance, **kwargs):
    record_audit(
        organization_id=instance.organization_id,
        actor_id=instance.user_id,
        action_type="member_removed",
        target_object=str(instance.user_id),
        metadata={"role": instance.role},
    )


# ── Workspace CRUD ────────────────────────────────────────────────────────
@receiver(post_save, sender=Workspace)
def audit_workspace_save(sender, instance, created, **kwargs):
    if created:
        record_audit(
            organization_id=instance.organization_id,
            workspace_id=instance.id,
            actor_id=instance.owner_id,
            action_type="workspace_created",
            target_object=instance.name,
        )


@receiver(pre_delete, sender=Workspace)
def audit_workspace_delete(sender, instance, **kwargs):
    record_audit(
        organization_id=instance.organization_id,
        workspace_id=instance.id,
        actor_id=instance.owner_id,
        action_type="workspace_deleted",
        target_object=instance.name,
    )


# ── SSO config changes ────────────────────────────────────────────────────
@receiver(post_save, sender=OrgSSOConfig)
def audit_sso_config_save(sender, instance, created, **kwargs):
    record_audit(
        organization_id=instance.organization_id,
        action_type="sso_config_changed",
        target_object=f"SSO ({instance.provider})",
        metadata={
            "sso_enabled": instance.sso_enabled,
            "enforce_sso": instance.enforce_sso,
        },
    )
