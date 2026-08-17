from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path("register/", views.register, name="auth-register"),
    path("login/", views.login, name="auth-login"),
    path("refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("sso/callback/", views.sso_callback, name="auth-sso-callback"),
    path("me/", views.me, name="auth-me"),
]
