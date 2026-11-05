# Design decisions

## Product structure

The user plans a journey in a compact sidebar, then compares routes beside a map. The map remains the dominant surface. Risk colors are supplemented with text and values. Changing the selected route does not refetch weather. The forecast slider reads preloaded hourly data, so it does not trigger 49 separate API calls while dragging.

The visible empty state, loading/cancellation, service errors, missing weather and all-routes-blocked states are part of the design, not hidden exceptions. Real outputs are displayed only after the backend returns real provider data.

## Risk interpretation

Severity is the maximum of wind, liquid precipitation and snow, after wind/load overrides. Levels are ordinal scores 0–4, not a statistical probability of an accident.

| Condition | Low (0) | Moderate (1) | High (2) | Severe (3) | No Travel (4) |
|---|---|---|---|---|---|
| Wind mph | <25 | 25 ≤ x <35 | 35 ≤ x <45 | 45 ≤ x <55 | ≥55 |
| Rain in/hour | <0.10 | 0.10 ≤ x <0.25 | 0.25 ≤ x <0.50 | 0.50 ≤ x ≤1.00 | >1.00 |
| Snow in/hour | <0.5 | 0.5 ≤ x <1.0 | 1.0 ≤ x <2.0 | 2.0 ≤ x ≤3.0 | >3.0 |

The brief overlaps rain at 0.25/0.50 and snow at 1.0/2.0. This implementation explicitly chooses the higher severity at those shared boundaries. The brief explicitly uses strict `>` for rain >1.00 and snow >3.0, so equality stays Severe. Integer-looking wind ranges are interpreted continuously without gaps: 34.9 mph is Moderate, 44.9 mph is High and 54.9 mph is Severe before load overrides.

Load overrides are strict, as written:

- Wind ≥55 mph: No Travel for every load.
- 45 ≤ wind <55 mph and load **>30,000 lb**: No Travel.
- 35 ≤ wind <45 mph and load **>40,000 lb**: at least Severe.

Exactly 30,000 or 40,000 lb does not trigger the associated override. A load override never reduces a more severe rain/snow classification. The rules are implemented as given even though they are not a validated real-world truck safety model.

## Checkpoints, ETA and exposure

OSRM supplies a full GeoJSON line and per-edge distance/duration arrays. The backend walks cumulative road distance and interpolates within the edge at 10, 25 or 50-mile intervals. ETA is cumulative **edge duration**, not straight-line distance or a uniform average speed. OSRM's route total can include turn costs omitted from its edge annotations, so edge durations are proportionally normalized to the provider's route total. This preserves relative speed differences and ensures the destination ETA matches the routing provider. Origin and destination are always included.

Coordinates are rounded to four decimals only for weather-query deduplication, approximately 11 m in latitude, far finer than forecast model resolution. This is not interpolation between forecast cells.

Open-Meteo reports precipitation accumulated over the preceding hour. For an ETA of 12:20 UTC, the 13:00 value represents the interval containing that arrival. Exact 12:00 uses the 12:00 value. Wind uses that same hourly forecast timestamp. Rain and showers are summed; snowfall is kept as snowfall depth. The adapter reads unit metadata and converts inches, mm or cm to inches, rather than assuming snow has the same unit as rain. No temperatures are used by the required rules.

Each interval between checkpoints is assigned the **maximum risk at its two endpoints**, a conservative sampled estimate. Its distance is added to that severity's mileage bucket. If either endpoint is missing, the interval is unknown. The final destination's risk therefore affects the last interval. Risk miles sum to route distance; the average is the distance-weighted ordinal risk of known intervals. If some intervals are unknown, the average is partial and the route is ineligible regardless of its value.

## Recommendation

First exclude any route with No Travel or unknown miles. This is an explicit safety gate added because the brief's ordering omits No Travel. Among the rest, compare the tuple:

1. Severe miles
2. High miles
3. Distance-weighted average risk
4. Travel seconds

This is lexicographic, not an arbitrary weighted sum. A shorter trip cannot outweigh even a small increase in Severe miles. Stable provider order breaks an exact tie. If none is eligible, return `recommended_route_id: null` and explain why; never present the least-bad blocked option as safe.

## Corridor overlay

At most 24 checkpoint centers are distributed across all candidate routes. Each center gets two additional forecast queries 8 miles east/west, creating up to 72 geographic weather samples in a coarse trip corridor. The overlay is a visual interpolation of sampled risk, **not radar or a continuous-resolution forecast**. These transects are geographic east/west, not perpendicular to every road heading. Nearby parallel routes share cached weather locations.

Each point carries 49 hourly states, from departure +0 to +48 hours. The slider does not change checkpoint ETAs or silently rerank the route: a new departure requires a new plan. Unknown heatmap samples remain distinct from Low risk.

## Architecture and operations

- `backend/routing/domain.py`: pure validation, risk, geometry, risk-mile integration and ranking.
- `providers.py`: time-bounded HTTP adapters, response caching, unit conversion and batched forecast concurrency (20 locations/batch, max 3 concurrent batches).
- `planner.py`: coordinates providers, checkpoint timing, weather and corridor responses.
- `views.py`: small JSON endpoints and basic abuse limits.
- `frontend/`: typed React UI, Leaflet layers and a reusable canvas heat overlay.

The app is intentionally stateless, with no accounts, cookies used for authentication, payment flows or persistent trip storage. `/api/plan/` is POST because the input is structured and potentially large, but only performs read operations against external providers. There is no mutation requiring cookie-based CSRF protection. Input size, number/range validation, journey length and checkpoint caps bound work.

No private email, original assessment PDF, employer invitation URL, user account identifiers or secrets belong in the repository. A future publication must be reviewed separately.

## API summary

- `GET /api/health/`: service liveness only; does not claim upstream health.
- `GET /api/geocode/?q=Chicago`: `{results: [{name, latitude, longitude}]}`.
- `POST /api/plan/`: `{origin, destination, departure, load_lb, spacing_miles}`. Places contain `name`, `latitude`, `longitude`; departure is ISO 8601 with timezone; load is a finite 0–200,000 lb number; spacing is 10, 25 or 50. Returns routes, checkpoints, geometry-preserving segments, risk-mile summaries, recommendation, warnings, provider attribution and corridor hour arrays.
- Validation: HTTP 400; wrong content type: 415; local rate limit: 429; routing/geocoding provider unavailable: 503. Partial weather failure can return HTTP 200 with explicit unknown coverage and no unsafe recommendation.

## Intentional next steps

Before actual truck operations: validated weather safety model, official alerts, truck-aware routing, forecast confidence, crosswind/gust exposure, grade/road restrictions, driver rest stops and monitoring. Before a public multiuser demo: external quota strategy, shared cache/rate limiter, trusted reverse proxy config and provider-policy review. None is represented as already implemented.
