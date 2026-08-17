"""
Audit helper — a thin wrapper so any module can write an audit event without
importing the model directly.
"""
from __future__ import annotations
import uuid
from typing import Any
from django.utils import timezone


def record_audit(
    organization_id: uuid.UUID | str,
    actor_id: uuid.UUID | str | None = None,
    workspace_id: uuid.UUID | str | None = None,
    action_type: str = "",
    target_object: str = "",
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> Any:
    """
    Create an immutable audit log entry.

    This is the single entry-point for all audit logging.  Call it from
    signal handlers, views, Celery tasks, etc.
    """
    from .models import AuditEvent

    return AuditEvent.objects.create(
        organization_id=organization_id,
        actor_id=actor_id,
        workspace_id=workspace_id,
        action_type=action_type,
        target_object=target_object,
        metadata=metadata or {},
        ip_address=ip_address,
        timestamp=timezone.now(),
    )
