"""Public API adapters. Failure is explicit; this module never generates demo weather."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import logging
import math

from django.conf import settings
from django.core.cache import cache
import httpx

logger = logging.getLogger(__name__)


class ProviderError(RuntimeError):
    pass


def fetch_json(url, params, label, ttl=600):
    key = "provider:" + hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        response = httpx.get(url, params=params, timeout=httpx.Timeout(25.0, connect=8.0), headers={"User-Agent": "SpotterAssessmentPrototype/1.0"}, follow_redirects=False)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("%s request failed: %s", label, type(exc).__name__)
        raise ProviderError(f"{label} is unavailable or rate-limited. Please try again shortly.") from exc
    cache.set(key, data, ttl)
    return data


def search_places(query):
    # City names are case-insensitive. Reuse warm provider results across both
    # input fields and superficial whitespace/capitalization variations.
    query = " ".join(query.split()).casefold()
    data = fetch_json(settings.GEOCODING_URL, {"name": query, "count": 6, "language": "en", "format": "json"}, "Geocoding service", ttl=86400)
    if not isinstance(data, dict) or not isinstance(data.get("results", []), list):
        raise ProviderError("Geocoding service returned an invalid response.")
    results = []
    for item in data.get("results", []):
        if not isinstance(item, dict) or not all(isinstance(item.get(key), (int, float)) and not isinstance(item[key], bool) and math.isfinite(item[key]) for key in ("latitude", "longitude")):
            raise ProviderError("Geocoding service returned invalid coordinates.")
        if not -90 <= item["latitude"] <= 90 or not -180 <= item["longitude"] <= 180:
            raise ProviderError("Geocoding service returned invalid coordinates.")
        results.append({"name": ", ".join(dict.fromkeys(str(x) for x in (item.get("name"), item.get("admin1"), item.get("country")) if x)), "latitude": item["latitude"], "longitude": item["longitude"]})
    return results


def get_routes(origin, destination):
    positions = f'{origin["longitude"]},{origin["latitude"]};{destination["longitude"]},{destination["latitude"]}'
    data = fetch_json(settings.OSRM_URL.rstrip("/") + f"/route/v1/driving/{positions}", {"alternatives": "2", "overview": "full", "geometries": "geojson", "annotations": "duration,distance", "steps": "false"}, "Routing service", ttl=3600)
    if not isinstance(data, dict) or data.get("code") != "Ok" or not isinstance(data.get("routes"), list) or not data["routes"]:
        raise ProviderError("The routing service found no drivable route between these places.")
    unique, seen = [], set()
    for route in data["routes"]:
        if not isinstance(route, dict):
            raise ProviderError("Routing service returned an invalid route.")
        fingerprint = json.dumps(route.get("geometry"), separators=(",", ":"))
        if fingerprint not in seen:
            unique.append(route)
            seen.add(fingerprint)
    warnings = []
    if len(unique) < 3:
        warnings.append(f"Routing provider returned {len(unique)} distinct route option(s), not three. No artificial alternatives were added.")
    waypoints = data.get("waypoints", [])
    if not isinstance(waypoints, list):
        raise ProviderError("Routing service returned invalid waypoints.")
    if any(isinstance(item, dict) and isinstance(item.get("distance"), (int, float)) and item["distance"] > 5000 for item in waypoints):
        warnings.append("A selected location was snapped more than 5 km to a routable road. Check the route endpoints.")
    return unique[:3], warnings


def location_key(point):
    return round(point["latitude"], 4), round(point["longitude"], 4)


def _to_inches(value, unit):
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        return None
    if unit in ("inch", "in"):
        return value
    if unit == "mm":
        return value / 25.4
    if unit == "cm":
        return value / 2.54
    return None


def parse_weather(data):
    """Verify every returned unit, including snowfall; never assume cm versus inches."""
    if not isinstance(data, dict):
        return {}
    hourly, units = data.get("hourly", {}), data.get("hourly_units", {})
    if not isinstance(hourly, dict) or not isinstance(units, dict) or not isinstance(hourly.get("time", []), list):
        return {}
    result = {}
    for i, stamp in enumerate(hourly.get("time", [])):
        try:
            instant = datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc)
            wind = hourly["wind_speed_10m"][i]
            if units.get("wind_speed_10m") != "mp/h" and units.get("wind_speed_10m") != "mph":
                wind = None
            rain = _to_inches(hourly["rain"][i], units.get("rain"))
            showers = _to_inches(hourly["showers"][i], units.get("showers"))
            snow = _to_inches(hourly["snowfall"][i], units.get("snowfall"))
            if any(v is None or isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in (wind, rain, showers, snow)):
                result[instant] = None
            else:
                result[instant] = {"wind_mph": wind, "rain_in_hr": rain+showers, "snow_in_hr": snow, "time": instant.isoformat()}
        except (IndexError, KeyError, ValueError, TypeError):
            continue
    return result


def _weather_batch(points):
    data = fetch_json(settings.WEATHER_URL, {"latitude": ",".join(str(p[0]) for p in points), "longitude": ",".join(str(p[1]) for p in points), "hourly": "wind_speed_10m,rain,showers,snowfall", "wind_speed_unit": "mph", "precipitation_unit": "inch", "timezone": "UTC", "forecast_days": 7}, "Weather service", ttl=600)
    items = data if isinstance(data, list) else [data]
    if len(items) != len(points):
        raise ProviderError("Weather service returned incomplete location coverage.")
    return {point: parse_weather(item) for point, item in zip(points, items)}


def get_weather(points):
    locations = list(dict.fromkeys(location_key(point) for point in points))
    batches = [locations[i:i+20] for i in range(0, len(locations), 20)]
    results, warnings = {}, []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(_weather_batch, batch) for batch in batches]
        for future in as_completed(futures):
            try:
                results.update(future.result())
            except ProviderError as exc:
                warnings.append(str(exc))
    if warnings:
        warnings.append("Missing weather is shown as unknown and is never treated as safe.")
    return results, list(dict.fromkeys(warnings))
