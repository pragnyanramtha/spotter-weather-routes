"""Pure routing geometry and assessment risk rules; no service or Django dependency."""
from bisect import bisect_left
from datetime import datetime, timedelta, timezone
import math

METERS_PER_MILE = 1609.344
LABELS = ("Low", "Moderate", "High", "Severe", "No Travel")
KEYS = ("low", "moderate", "high", "severe", "no_travel")


class ValidationError(ValueError):
    pass


def finite_number(value, name, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValidationError(f"{name} must be a finite number.")
    if not minimum <= value <= maximum:
        raise ValidationError(f"{name} must be between {minimum} and {maximum}.")
    return float(value)


def validate_plan(data, now=None):
    if not isinstance(data, dict):
        raise ValidationError("The request must be a JSON object.")
    result = {}
    for key in ("origin", "destination"):
        place = data.get(key)
        if not isinstance(place, dict):
            raise ValidationError(f"Select a valid {key}.")
        result[key] = {
            "latitude": finite_number(place.get("latitude"), f"{key} latitude", -85, 85),
            "longitude": finite_number(place.get("longitude"), f"{key} longitude", -180, 180),
            "name": str(place.get("name", key))[:160],
        }
    if haversine([result["origin"]["longitude"], result["origin"]["latitude"]], [result["destination"]["longitude"], result["destination"]["latitude"]]) < 100:
        raise ValidationError("Choose an origin and destination at least 100 meters apart.")
    result["load_lb"] = finite_number(data.get("load_lb"), "Load weight", 0, 200000)
    if isinstance(data.get("spacing_miles"), bool) or data.get("spacing_miles") not in (10, 25, 50):
        raise ValidationError("Checkpoint spacing must be 10, 25 or 50 miles.")
    result["spacing_miles"] = data["spacing_miles"]
    try:
        departure = datetime.fromisoformat(data["departure"].replace("Z", "+00:00"))
        if departure.tzinfo is None:
            raise ValueError()
        departure = departure.astimezone(timezone.utc)
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        raise ValidationError("Departure must be an ISO date/time with a timezone offset.")
    now = now or datetime.now(timezone.utc)
    # Five-minute input grace, not historical weather support.
    if departure < now - timedelta(minutes=5) or departure > now + timedelta(hours=48):
        raise ValidationError("Choose a departure from now through the next 48 hours.")
    result["departure"] = departure
    return result


def classify_weather(weather, load_lb):
    """Shared rain/snow boundaries choose higher severity; 1in/3in remain Severe."""
    if weather is None:
        return None
    values = [weather.get(key) for key in ("wind_mph", "rain_in_hr", "snow_in_hr")]
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0 for x in values):
        return None
    wind, rain, snow = values
    wind_level = 4 if wind >= 55 else 3 if wind >= 45 else 2 if wind >= 35 else 1 if wind >= 25 else 0
    rain_level = 4 if rain > 1 else 3 if rain >= .5 else 2 if rain >= .25 else 1 if rain >= .1 else 0
    snow_level = 4 if snow > 3 else 3 if snow >= 2 else 2 if snow >= 1 else 1 if snow >= .5 else 0
    reasons = []
    if 45 <= wind < 55 and load_lb > 30000:
        wind_level = 4
        reasons.append("Wind 45–54.9 mph with load over 30,000 lb: No Travel.")
    elif 35 <= wind < 45 and load_lb > 40000:
        wind_level = 3
        reasons.append("Wind 35–44.9 mph with load over 40,000 lb: Severe.")
    for condition, level, value, unit in (("Wind", wind_level, wind, "mph"), ("Rain", rain_level, rain, "in/hr"), ("Snow", snow_level, snow, "in/hr")):
        if level:
            reasons.append(f"{condition} {value:g} {unit}: {LABELS[level]}.")
    return {"level": max(wind_level, rain_level, snow_level), "label": LABELS[max(wind_level, rain_level, snow_level)], "reasons": reasons or ["All sampled conditions are below the Moderate thresholds."]}


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    angle = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(angle)))


def interpolate(a, b, ratio):
    # Shortest longitude arc also works near the antimeridian.
    lon_delta = (b[0] - a[0] + 180) % 360 - 180
    return [((a[0] + lon_delta * ratio + 180) % 360) - 180, a[1] + (b[1]-a[1])*ratio]


def sample_route(route, spacing_miles, departure):
    """Use routing-engine edge distances AND edge durations to place timed checkpoints."""
    coords = route["geometry"]["coordinates"]
    if not isinstance(coords, list) or any(not isinstance(p, (list, tuple)) or len(p) != 2 or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in p) or not -180 <= p[0] <= 180 or not -90 <= p[1] <= 90 for p in coords):
        raise ValueError("Routing provider returned invalid coordinates.")
    distances, durations = [], []
    for leg in route["legs"]:
        distances.extend(leg["annotation"]["distance"])
        durations.extend(leg["annotation"]["duration"])
    if len(coords) < 2 or len(distances) != len(coords)-1 or len(durations) != len(distances):
        raise ValueError("Routing provider did not supply aligned geometry and edge timing.")
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0 for x in distances+durations):
        raise ValueError("Routing provider returned invalid edge measurements.")
    cumulative_d, cumulative_t = [0.0], [0.0]
    for distance, duration in zip(distances, durations):
        cumulative_d.append(cumulative_d[-1]+distance)
        cumulative_t.append(cumulative_t[-1]+duration)
    # OSRM edge annotations can omit turn costs included in route.duration.
    # Preserve relative edge timing while reconciling to the provider's total ETA.
    declared_duration = route.get("duration", cumulative_t[-1])
    if isinstance(declared_duration, bool) or not isinstance(declared_duration, (int, float)) or not math.isfinite(declared_duration) or declared_duration < 0:
        raise ValueError("Routing provider returned an invalid route duration.")
    if cumulative_t[-1] > 0:
        scale = declared_duration / cumulative_t[-1]
        durations = [value*scale for value in durations]
        cumulative_t = [value*scale for value in cumulative_t]
    elif declared_duration > 0:
        raise ValueError("Routing provider returned no usable edge timing.")
    total = cumulative_d[-1]
    if total <= 0:
        raise ValueError("Routing provider returned an empty route.")
    targets = [i*spacing_miles*METERS_PER_MILE for i in range(math.ceil(total/(spacing_miles*METERS_PER_MILE)))] + [total]
    points = []
    for target in targets:
        edge = max(0, min(len(distances)-1, bisect_left(cumulative_d, target)-1))
        ratio = (target-cumulative_d[edge])/distances[edge] if distances[edge] else 0
        if target == total:
            # A terminal zero-distance edge may still carry time (a ferry wait,
            # intersection cost, etc.). Arrival must include the complete route.
            edge, ratio = len(distances)-1, 1
        position = interpolate(coords[edge], coords[edge+1], ratio)
        seconds = cumulative_t[edge]+durations[edge]*ratio
        points.append({"latitude": position[1], "longitude": position[0], "distance_miles": target/METERS_PER_MILE, "eta": (departure+timedelta(seconds=seconds)).isoformat(), "segment_miles": 0, "_edge": edge, "_ratio": ratio})
    segments = []
    for previous, current in zip(points, points[1:]):
        miles = current["distance_miles"]-previous["distance_miles"]
        previous["segment_miles"] = miles
        # Preserve the actual road geometry between the sampled endpoints.
        line = [[previous["longitude"], previous["latitude"]]] + coords[previous["_edge"]+1:current["_edge"]+1] + [[current["longitude"], current["latitude"]]]
        segments.append({"coordinates": line, "distance_miles": miles})
    for point in points:
        point.pop("_edge")
        point.pop("_ratio")
    return points, segments, total/METERS_PER_MILE, cumulative_t[-1]


def summarize_route(checkpoints, segments):
    miles = dict.fromkeys((*KEYS, "unknown"), 0.0)
    weighted, known = 0.0, 0.0
    for start, end, segment in zip(checkpoints, checkpoints[1:], segments):
        risks = (start["risk"], end["risk"])
        risk = max(risks, key=lambda r: r["level"]) if all(r is not None for r in risks) else None
        segment["risk"] = risk
        distance = segment["distance_miles"]
        miles[KEYS[risk["level"]] if risk else "unknown"] += distance
        if risk:
            weighted += risk["level"]*distance
            known += distance
    return {"risk_miles": miles, "average_risk": weighted/known if known else None, "eligible": miles["no_travel"] == 0 and miles["unknown"] == 0}


def recommend(routes):
    eligible = [r for r in routes if r["summary"]["eligible"]]
    if not eligible:
        return None, "No route can be recommended: each has No Travel conditions or incomplete forecast coverage. Change departure time or wait for updated forecasts."
    winner = min(eligible, key=lambda r: (r["summary"]["risk_miles"]["severe"], r["summary"]["risk_miles"]["high"], r["summary"]["average_risk"], r["duration_seconds"]))
    return winner["id"], "Among routes without No Travel or missing forecasts, this has the fewest Severe miles, then High miles, then lowest distance-weighted average risk, then shortest travel time."
