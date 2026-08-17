from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth
    path("api/auth/", include("accounts.urls")),
    # Organization layer
    path("api/", include("organizations.urls")),
    # IDE productivity features
    path("api/snippets/", include("snippets.urls")),
    path("api/tasks/", include("tasks.urls")),
    path("api/tests/", include("tests.urls")),
    path("api/search/", include("search.urls")),
]
