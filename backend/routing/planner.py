from datetime import datetime, timedelta, timezone
import math

from .domain import classify_weather, recommend, sample_route, summarize_route, ValidationError
from .providers import get_routes, get_weather, location_key, ProviderError


def at_hour(series, instant):
    # Precipitation is accumulated over the preceding hour: use the interval
    # ending at or immediately after ETA, not weather at departure for every stop.
    instant = instant.astimezone(timezone.utc)
    hour = instant.replace(minute=0, second=0, microsecond=0)
    if instant > hour:
        hour += timedelta(hours=1)
    return series.get(hour)


def corridor_points(routes):
    """Bounded corridor grid: at most 24 center samples, plus 8-mile lateral offsets."""
    candidates = [p for route in routes for p in route["checkpoints"]]
    stride = max(1, math.ceil(len(candidates)/24))
    centers = candidates[::stride]
    result = []
    for point in centers:
        # A small east/west transect makes the overlay a corridor, not just markers.
        delta = 8/69.172/max(.1, math.cos(math.radians(point["latitude"])))
        for offset in (-delta, 0, delta):
            result.append({"latitude": point["latitude"], "longitude": (point["longitude"]+offset+180)%360-180})
    return list({location_key(p): p for p in result}.values())


def make_plan(inputs):
    raw_routes, warnings = get_routes(inputs["origin"], inputs["destination"])
    routes = []
    for i, raw in enumerate(raw_routes):
        try:
            checkpoints, segments, miles, duration = sample_route(raw, inputs["spacing_miles"], inputs["departure"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderError("Routing service returned unusable route geometry or timing.") from exc
        if duration > 120*3600:
            raise ValidationError("This journey exceeds the prototype's 120-hour travel limit. Choose a shorter trip.")
        routes.append({"id": f"route-{i+1}", "name": f"Route {i+1}", "distance_miles": miles, "duration_seconds": duration, "geometry": raw["geometry"]["coordinates"], "checkpoints": checkpoints, "segments": segments, "warnings": []})
    points = [point for route in routes for point in route["checkpoints"]]
    if len(points) > 300:
        raise ValidationError("This trip creates more than 300 checkpoints across all routes. Increase the checkpoint spacing or choose a shorter trip.")
    corridor = corridor_points(routes)
    weather_by_point, weather_warnings = get_weather(points+corridor)
    warnings.extend(weather_warnings)
    for route in routes:
        for point in route["checkpoints"]:
            point["weather"] = at_hour(weather_by_point.get(location_key(point), {}), datetime.fromisoformat(point["eta"]))
            point["risk"] = classify_weather(point["weather"], inputs["load_lb"])
        route["summary"] = summarize_route(route["checkpoints"], route["segments"])
        if route["summary"]["risk_miles"]["unknown"]:
            route["warnings"].append("Incomplete forecast coverage: this route cannot be recommended.")
        if route["summary"]["risk_miles"]["no_travel"]:
            route["warnings"].append("No Travel conditions: this route cannot be recommended.")
    for point in corridor:
        series = weather_by_point.get(location_key(point), {})
        point["hours"] = []
        for offset in range(49):
            weather = at_hour(series, inputs["departure"]+timedelta(hours=offset))
            point["hours"].append({**weather, "risk": classify_weather(weather, inputs["load_lb"])} if weather else None)
    chosen, reason = recommend(routes)
    warnings.extend([
        "OSRM driving routes are not truck-restriction-aware. They do not validate bridge clearance, axle/load limits, hazmat rules, or road closures.",
        "ETAs exclude live traffic, loading, breaks, and hours-of-service requirements. Forecasts and this assessment's risk rules are not a safety guarantee.",
        "Weather is sampled at checkpoints, using hourly forecasts; hazards between samples can be missed. Check official alerts before travel.",
    ])
    return {"routes": routes, "recommended_route_id": chosen, "recommendation_reason": reason, "warnings": list(dict.fromkeys(warnings)), "corridor": {"base_time": inputs["departure"].isoformat(), "points": corridor}, "providers": {"routing": "OSRM / OpenStreetMap", "weather": "Open-Meteo", "geocoding": "Open-Meteo / GeoNames"}, "generated_at": datetime.now(timezone.utc).isoformat(), "inputs": {**inputs, "departure": inputs["departure"].isoformat()}}
