import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ON_VERCEL = os.getenv("VERCEL") == "1"
DEBUG = os.getenv("DEBUG", "false" if ON_VERCEL else "true").lower() == "true"
# This app has no sessions, login, signed cookies or persistent signing. A fresh
# process-local key avoids shipping a hardcoded secret. Set a stable private key
# BEFORE adding any feature that needs signatures to survive a cold start.
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or secrets.token_urlsafe(50)
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,[::1],testserver").split(",")
for host in (os.getenv("VERCEL_URL"), os.getenv("VERCEL_PROJECT_PRODUCTION_URL"), os.getenv("VERCEL_BRANCH_URL")):
    if host and host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
INSTALLED_APPS = ["django.contrib.staticfiles", "routing"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
]
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [BASE_DIR.parent / "frontend" / "dist"], "APP_DIRS": True}]
USE_TZ = True
TIME_ZONE = "UTC"
STATIC_URL = "/assets/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR.parent / "frontend" / "dist" / "assets"] if (BASE_DIR.parent / "frontend" / "dist" / "assets").exists() else []
STORAGES = {"staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"}}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "spotter", "OPTIONS": {"MAX_ENTRIES": 4000}}}
DATA_UPLOAD_MAX_MEMORY_SIZE = 16_384
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
OSRM_URL = os.getenv("OSRM_URL", "https://router.project-osrm.org")
WEATHER_URL = os.getenv("WEATHER_URL", "https://api.open-meteo.com/v1/forecast")
GEOCODING_URL = os.getenv("GEOCODING_URL", "https://geocoding-api.open-meteo.com/v1/search")
