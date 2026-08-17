"""
Celery tasks for GDPR data export and hard-deletion.
"""
from __future__ import annotations
import json
import zipfile
import io
import uuid
from datetime import timedelta
from celery import shared_task
from django.utils import timezone
from django.conf import settings
from django.core.files.storage import default_storage


@shared_task(bind=True, max_retries=3)
def process_export(self, export_id: str) -> None:
    """
    Collect user data across all workspaces, package as JSON+attachments zip,
    upload to S3, and update the ExportRequest with a signed download URL.
    """
    from .models import ExportRequest, Workspace, OrganizationMembership
    from accounts.models import User

    try:
        export = ExportRequest.objects.select_related("user").get(id=export_id)
    except ExportRequest.DoesNotExist:
        return

    export.status = "processing"
    export.save(update_fields=["status"])

    try:
        user = export.user
        data: dict = {
            "profile": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "created_at": user.created_at.isoformat(),
            },
            "memberships": [],
            "workspaces": [],
        }

        # Collect memberships
        memberships = OrganizationMembership.objects.filter(user=user).select_related("organization")
        for m in memberships:
            data["memberships"].append({
                "organization": m.organization.name,
                "role": m.role,
                "joined_at": m.joined_at.isoformat(),
            })

        # Collect workspaces
        workspaces = Workspace.objects.filter(owner=user)
        for w in workspaces:
            data["workspaces"].append({
                "id": str(w.id),
                "name": w.name,
                "template": w.template_used,
                "created_at": w.created_at.isoformat(),
            })

        # Build ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("export.json", json.dumps(data, indent=2, default=str))

        zip_buffer.seek(0)

        # Upload to S3
        key = f"exports/{export_id}.zip"
        default_storage.save(key, zip_buffer)

        # Generate signed URL
        url = default_storage.url(key, expire=settings.EXPORT_URL_EXPIRY_SECONDS)

        export.status = "completed"
        export.download_url = url
        export.expires_at = timezone.now() + timedelta(seconds=settings.EXPORT_URL_EXPIRY_SECONDS)
        export.save(update_fields=["status", "download_url", "expires_at"])

        # Notify user (stub — integrate with mailer)
        print(f"[GDPR] Export ready for {user.email}: {url}")

    except Exception as exc:
        export.status = "failed"
        export.save(update_fields=["status"])
        raise self.retry(exc=exc)


@shared_task
def process_hard_delete(deletion_id: str) -> None:
    """
    Permanently delete user data after the 30-day grace period.
    Scrubs PII from audit logs while preserving non-PII audit trail.
    """
    from .models import DeletionRequest, AuditEvent, OrganizationMembership, Workspace
    from accounts.models import User

    try:
        deletion = DeletionRequest.objects.select_related("user").get(id=deletion_id)
    except DeletionRequest.DoesNotExist:
        return

    if deletion.status != "grace_period":
        return  # Was cancelled or already processed

    user = deletion.user

    # 1. Reassign or delete owned workspaces (configurable policy: delete for now)
    Workspace.objects.filter(owner=user).delete()

    # 2. Remove memberships
    OrganizationMembership.objects.filter(user=user).delete()

    # 3. Scrub PII from audit logs (keep the event, null out actor)
    AuditEvent.objects.filter(actor=user).update(
        actor=None,
        metadata={"scrubbed": True, "original_action_type": "user_deleted"},
    )

    # 4. Hard-delete user
    user.delete()

    deletion.status = "deleted"
    deletion.save(update_fields=["status"])

    print(f"[GDPR] Hard-delete completed for user {user.email} (deletion {deletion_id})")


@shared_task
def purge_expired_audit_logs() -> None:
    """
    Periodic task (runs daily via celery-beat) that deletes audit events
    older than each organization's configured retention period.
    """
    from .models import Organization, AuditEvent
    from django.db.models import Q
    from django.utils import timezone

    now = timezone.now()
    for org in Organization.objects.iterator():
        cutoff = now - timezone.timedelta(days=org.audit_retention_days)
        deleted, _ = AuditEvent.objects.filter(
            organization=org, timestamp__lt=cutoff
        ).delete()
        if deleted:
            print(f"[Audit] Purged {deleted} events for org {org.slug} (retention: {org.audit_retention_days}d)")
