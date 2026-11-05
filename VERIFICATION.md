# Verification record

Last local verification: 2026-11-05 UTC.

## Passed

- Django system check: no issues.
- Backend: **59 tests passed**, no skips or expected failures.
- Frontend: **13 tests passed** across three files.
- TypeScript checking and Vite production build passed.
- Production npm dependency audit: **0 known vulnerabilities reported** at check time.
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

## Coverage

Tests include exact weather thresholds and overlap choices, strict load boundaries, invalid numbers and booleans, timezone/departure validation, variable-speed edge timing, provider-total duration normalization, terminal zero-distance edge timing, road geometry, mileage conservation, final-checkpoint risk, unknown/No Travel exclusion, lexicographic ranking, unit conversion, malformed/partial provider responses, API methods and failures, request rate limits, route/checkpoint limits, 49-hour corridor windows, response byte limits, Vercel settings and requirements synchronization. Frontend tests cover search/manual location selection, stale searches and results, route planning input/time conversion, provider errors, risk guards and selected forecast state.

## Not verified yet

- Real-browser visual/console/end-to-end inspection: the local Chromium process was blocked by the execution environment's socket restriction; a launcher attempt also failed before browser execution. Unit/component and HTTP checks are not a substitute for visual QA.
- Vercel build/runtime and genuine platform cold-start behavior: no hosted deployment is asserted by this record.
- Three alternatives on every possible trip: no such guarantee is made. The routing provider is asked for three, and unavailable alternatives are disclosed.
- Docker image build and execution.
- Employer submission or Loom recording.

Before submission, verify the final hosted URL in a browser, test the actual hosted API, record the walkthrough, and review the repository audience and submission links.
