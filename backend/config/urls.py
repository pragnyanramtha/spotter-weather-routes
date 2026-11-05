from django.urls import path, re_path
from django.views.generic import TemplateView
from routing import views

urlpatterns = [
    path("api/health/", views.health),
    path("api/geocode/", views.geocode),
    path("api/plan/", views.plan),
    re_path(r"^(?!api/|assets/).*$", TemplateView.as_view(template_name="index.html")),
]
