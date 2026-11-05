import json
import time
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from .domain import validate_plan, ValidationError
from .planner import make_plan
from .providers import search_places, ProviderError


def limit(request, scope, allowance):
    # Prototype per-process limiter. Replace with a shared Redis-backed limiter
    # and trusted proxy configuration before a public multi-worker deployment.
    key = f"rate:{scope}:{request.META.get('REMOTE_ADDR', 'unknown')}:{int(time.time()/60)}"
    if cache.add(key, 1, 65):
        return False
    try:
        return cache.incr(key) > allowance
    except ValueError:
        return False


@require_GET
def health(request):
    return JsonResponse({"status": "ok", "service": "spotter-routing", "external_services_checked": False})


@require_GET
def geocode(request):
    if limit(request, "search", 60):
        return JsonResponse({"error": "Too many searches. Please wait one minute."}, status=429)
    query = request.GET.get("q", "").strip()
    if not 2 <= len(query) <= 160:
        return JsonResponse({"error": "Enter a city name between 2 and 160 characters."}, status=400)
    try:
        response = JsonResponse({"results": search_places(query)})
        # City results are public and not personalized. Browser and CDN caching
        # avoid another function/provider round trip for repeated suggestions.
        # Errors/rate limits deliberately never receive these cache headers.
        response["Cache-Control"] = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        return response
    except ProviderError as exc:
        return JsonResponse({"error": str(exc)}, status=503)


@require_POST
def plan(request):
    if limit(request, "plan", 8):
        return JsonResponse({"error": "Too many route requests. Please wait one minute."}, status=429)
    if request.content_type != "application/json":
        return JsonResponse({"error": "Use application/json."}, status=415)
    try:
        data = json.loads(request.body)
        inputs = validate_plan(data)
        response = JsonResponse(make_plan(inputs))
        if len(response.content) > 4_000_000:
            return JsonResponse({"error": "This route response exceeds the hosted payload limit. Choose a shorter trip or wider checkpoint spacing."}, status=400)
        return response
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Request body must be valid JSON."}, status=400)
    except ValidationError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except ProviderError as exc:
        return JsonResponse({"error": str(exc)}, status=503)
