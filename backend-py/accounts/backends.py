from django.contrib.auth.backends import BaseBackend
from .models import User


class SSOAuthBackend(BaseBackend):
    """Authenticate a user by email only (trusted IdP assertion)."""

    def authenticate(self, request, email=None, **kwargs) -> User | None:
        if email is None:
            return None
        try:
            return User.objects.get(email__iexact=email.strip())
        except User.DoesNotExist:
            return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
