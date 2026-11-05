# Spotter · Weather-aware route planning

A React + TypeScript and Django assessment prototype that compares real routing alternatives against ETA-specific weather. No runtime mock forecasts, generated roads, or artificial alternatives.

## Run locally

Requires Python 3.12+ and Node 22+.

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python backend/manage.py runserver 127.0.0.1:8000
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open the Vite URL shown in the terminal, usually http://localhost:5173. Its `/api` proxy talks to Django on port 8000. No database, registration, or API key is needed for the public development services. Search city names and select a result, or enter explicit coordinates. Choose a departure within 48 hours, load in pounds and a 10/25/50-mile sample interval.

`.env.example` documents settings; the backend reads environment variables, not a `.env` file automatically. Export your settings or use your deployment provider's environment controls.

## Verify

```sh
python backend/manage.py check
python backend/manage.py test routing.tests
cd frontend
npm test -- --run
npm run build
```

All network adapters are mocked **only in automated tests** for deterministic assertions. Live API smoke tests should be reported separately; passing unit tests does not establish external-service availability.

## What the app does

- Requests a primary OSRM driving route plus up to two alternatives, retaining their actual road geometry.
- Places checkpoints at the chosen distance interval plus both endpoints, using each road edge's distance and duration to calculate ETA.
- Fetches Open-Meteo hourly wind, rain, showers and snowfall for those locations; evaluates the forecast hour containing each checkpoint's ETA.
- Applies weather severity and load overrides, integrates conservative risk miles, then selects among eligible routes by the brief's lexicographic ranking.
- Displays route alternatives, risk-colored road segments, checkpoints, forecast details, arrival times and summaries.
- Builds a small weather grid along and beside the routes, then preloads 49 hourly states for a smooth departure-to-48-hour corridor heatmap slider. Moving the slider changes the exploratory overlay, not the route recommendation or departure time.
- Shows explicit missing-weather, provider, input and no-route states. Unknown forecasts never count as safe.

## Explicit limits

This is a route-weather comparison **prototype, not a truck navigation or safety system**.

1. **Three alternatives are requested, not fabricated.** OSRM may return only one or two distinct routes for a journey. The app shows what the provider returns with a warning. A commercial routing provider with guaranteed alternatives would be the production upgrade.
2. **OSRM's public driving profile is not truck-aware.** It does not validate height/weight/axle/hazmat restrictions, bridge clearances or closures. The entered load affects only the assessment's weather rules. ETAs do not include live traffic, loading, rest stops or hours-of-service rules.
3. Forecasts are hourly model estimates, not observations or guaranteed conditions. Hazards can occur between spatial samples or forecast hours. Check official weather/road advisories before driving. Wind is sustained 10 m wind speed, not gusts or crosswind relative to the truck.
4. Forecast coverage is seven days from the provider's current date. Departures are limited to the next 48 hours; trips to 120 driving hours; at most 300 checkpoints across all alternatives. Missing or out-of-horizon weather makes a route ineligible.
5. Public services have rate limits and no uptime guarantee. The frontend basemap uses OpenStreetMap tiles. For public commercial use, review each provider's licensing and usage policy and configure suitable production services. Open-Meteo's free API is intended for non-commercial use.
6. The server uses process-local caching and a basic per-process rate limit. Public deployment needs a shared limiter/cache, appropriate proxy/IP settings, monitoring, provider quota controls, HTTPS, and review of request timeouts. No user accounts or location history are stored by the app. Coordinates are sent to routing/weather providers; city searches are sent to geocoding; map tiles go to the tile provider.

See [DESIGN.md](DESIGN.md) for boundary interpretations, mathematical choices, architecture and API contract. [WALKTHROUGH.md](WALKTHROUGH.md) is a 5–10 minute demo outline.

## Production build preparation

The same Django service can serve the built frontend with WhiteNoise:

```sh
cd frontend && npm ci && npm run build && cd ..
python backend/manage.py collectstatic --noinput
# Set DEBUG=false and ALLOWED_HOSTS appropriately first.
gunicorn --chdir backend config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 150
```

A multistage Dockerfile is included for a reproducible deployment starting point. Building the image or hosting the app is a separate step; inclusion of deployment instructions does not mean it was deployed.

### Vercel Functions

`vercel.json` defines Vercel Services (currently beta): a Vite static frontend and one Django Python WSGI function, with `/api/*` routed to Django on the same origin. No Render instance or separate backend provider is needed. See [VERCEL.md](VERCEL.md) for exact limits, deployment settings, validation and known caveats.

## Sources and attribution

- [OSRM route service](https://project-osrm.org/docs/v5.24.0/api/#route-service)
- [Open-Meteo weather documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms)
- [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api), based on GeoNames
- [OpenStreetMap attribution](https://www.openstreetmap.org/copyright) and [tile policy](https://operations.osmfoundation.org/policies/tiles/)

The assessment's company name identifies the brief; this prototype is not endorsed by Spotter.
