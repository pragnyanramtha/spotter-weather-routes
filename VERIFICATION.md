# Verification record

Last local verification: 2026-11-05 UTC.

## Passed

- Django system check: no issues.
- Backend: **61 tests passed**, no skips or expected failures.
- Frontend: **32 tests passed** across four files.
- TypeScript checking and Vite production build passed.
- Full npm dependency audit (including development dependencies): **0 known vulnerabilities reported** after updating Vitest to 4.1.12.
- Python source compiled successfully.
- Vercel configuration data checked against the current published schema: no data-validation errors. See VERCEL.md for the schema meta-validation caveat.

## Live external-service checks

Executed against actual public providers, not runtime mocks:

- Open-Meteo city search returned Chicago, Illinois, United States.
- OSRM returned real road geometry and per-edge distance/duration annotations.
- Open-Meteo returned 168 hourly values with unit metadata; missing fields are not imputed.
- Chicago → Indianapolis: one provider route, nine ETA checkpoints and 27 corridor locations ×49 hourly states. Full plan completed in about 8.7 seconds.
- Chicago → Detroit through a locally running Gunicorn HTTP server: HTTP 200, two alternatives, 13 checkpoints each, 39 corridor samples ×49 hourly states. Approximately 11.6 seconds and 854 KB JSON. At that test departure the provider returned Low weather risk throughout, so the faster route was recommended.
- HTML, current JavaScript/CSS bundles, health and geocoding endpoints returned HTTP 200. An unknown API path returned 404 rather than the SPA page.

Live numbers are observations from these tests, not sample data embedded in the app. Weather changes and routing providers can return a different number of alternatives later.

## Hosted Vercel verification

- [Live app](https://spotter-weather-routes-nine.vercel.app): initial production deployment reached READY on 2026-11-05.
- Public HTML, JavaScript/CSS assets, geocoding and `/api/health/` returned HTTP 200.
- A real hosted Chicago–Detroit plan returned HTTP 200 with two alternatives, 26 checkpoints and 39 corridor samples ×49 hourly states. First observed request: approximately 1.78 seconds; repeat: 0.314 seconds.
- These timings do not establish genuine platform cold-start duration.
- Browser inspection of the initial deployment completed a real Chicago–Detroit flow, rendered two route cards and 13 checkpoints per route, selected the alternative route, expanded checkpoint details, moved the forecast slider to +48h, and toggled the heatmap off. The browser console showed extension-related errors, with no application error observed in that flow. Vercel warning/error runtime logs returned no matches for the checked 30-minute window.
- Initial search round trips observed from the test environment took roughly 2.5–8 seconds. This prompted autocomplete, instant common-city choices, pin selection and repeated-query caching. Those are UX improvements, not a guarantee of provider response time.

## Coverage

Tests include exact weather thresholds and overlap choices, strict load boundaries, invalid numbers and booleans, timezone/departure validation, variable-speed edge timing, provider-total duration normalization, terminal zero-distance edge timing, road geometry, mileage conservation, final-checkpoint risk, unknown/No Travel exclusion, lexicographic ranking, unit conversion, malformed/partial provider responses, API methods and failures, request rate limits, route/checkpoint limits, 49-hour corridor windows, response byte limits, Vercel settings and requirements synchronization. Frontend tests cover debounced/cached autocomplete, cancellation and stale responses, keyboard/manual/external location selection, example trips, map pin placement and dragging, busy-state and cancel guards, map view stability, departure reset, route planning input/time conversion, provider errors, risk guards and selected forecast state.

## Not verified yet

- Browser verification of the latest location-picker update is pending deployment; the initial production flow above passed. Unit/component and HTTP checks are not a substitute for visual QA.
- Isolated Vercel cold-start measurements. Hosted build/runtime and the API checks above passed.
- Three alternatives on every possible trip: no such guarantee is made. The routing provider is asked for three, and unavailable alternatives are disclosed.
- Docker image build and execution.
- Employer submission or Loom recording.

Before submission, verify the final hosted URL in a browser, test the actual hosted API, record the walkthrough, and review the repository audience and submission links.
