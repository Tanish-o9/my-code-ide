"""
Management command to backfill personal Organizations for existing workspaces
that don't have an organization_id set.

Run:  python manage.py backfill_personal_orgs

This is the Django equivalent of the existing TS org-migration.ts script.
It is idempotent — safe to run multiple times.
"""
from django.core.management.base import BaseCommand
from organizations.models import Organization, OrganizationMembership, Workspace
from accounts.models import User


class Command(BaseCommand):
    help = "Backfill personal Organizations for workspaces missing an organization_id"

    def handle(self, *args, **options):
        unlinked = Workspace.objects.filter(organization__isnull=True)
        count = unlinked.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS("No unlinked workspaces found."))
            return

        self.stdout.write(f"Found {count} unlinked workspace(s). Backfilling...")

        for ws in unlinked.select_related("owner"):
            owner = ws.owner
            slug = f"personal-{owner.id}"

            org, _ = Organization.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": f"{owner.name}'s Personal Organization",
                    "created_by": owner,
                    "billing_plan": "free",
                },
            )

            OrganizationMembership.objects.get_or_create(
                user=owner,
                organization=org,
                defaults={"role": "owner"},
            )

            ws.organization = org
            ws.save(update_fields=["organization"])

            self.stdout.write(f"  Linked workspace '{ws.name}' → org '{org.name}'")

        self.stdout.write(self.style.SUCCESS("Backfill complete."))
