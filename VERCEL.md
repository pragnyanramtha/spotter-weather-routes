# Vercel Functions deployment

## Live deployment

[Open the hosted app](https://spotter-weather-routes-nine.vercel.app). The initial production deployment reached READY on 2026-11-05. Public HTML/assets, health, geocoding and a real route plan returned HTTP 200. A Chicago–Detroit plan returned two alternatives, 26 ETA checkpoints and 39 corridor samples ×49 hourly states in approximately 1.78 seconds; a repeated request took 0.314 seconds. These are observed request times, not isolated cold-start measurements.

Interactive browser validation remains pending. See [VERIFICATION.md](VERIFICATION.md) for the current scope of verification.

## Architecture

The root `vercel.json` uses **Vercel Services, currently beta**:

- `frontend/`: Vite builds React into static CDN assets.
- `backend/`: Python 3.12 loads `config.wsgi:application` as a Django WSGI Function.
- `/api/*` goes to Django; all other requests go to the frontend. The original `/api/` prefix is preserved and already exists in Django URLs.
- Both components share the same origin. No CORS workaround, second hosting provider, database or always-on server is required.

The backend service owns its own pinned `requirements.txt`, identical to the root development lockfile. Keep the two synchronized when dependencies change. No credentials, email attachments or unrelated workspace files should be uploaded.

## Verified platform limits

Checked against the current official documentation on 2026-11-05:

- Fluid Compute Hobby function duration: **300 seconds default and maximum**. This app configures 300 seconds for `config/wsgi.py`.
- Python function uncompressed bundle: **500 MB**.
- Request/response payload: **4.5 MB**. The API caps requests at 16 KiB and refuses generated responses larger than 4,000,000 bytes with a useful error.
- Hobby function memory: **2 GB / 1 vCPU**.
- Services is beta on all plans. The Hobby plan includes functions within its usage limits; that is not a guarantee that an account has quota remaining.

Sources: [Functions limits](https://vercel.com/docs/functions/limitations), [Django](https://vercel.com/docs/frameworks/full-stack/django), [Services](https://vercel.com/docs/services), [Python version](https://vercel.com/docs/functions/runtimes/python/python-version).

## Configuration

Vercel provides `VERCEL=1`, so the backend defaults to `DEBUG=false`. Exact deployment and production hosts are read from `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_BRANCH_URL`. If using a custom domain, add it through `ALLOWED_HOSTS`; never set `*`.

This prototype has **no login, sessions, signed cookies or persistent signatures**. Django still requires a secret key, so a cryptographically random process-local key is generated when `DJANGO_SECRET_KEY` is absent. It is not stored, printed or uploaded. Before adding sessions or any cross-invocation signing feature, configure a stable private `DJANGO_SECRET_KEY` using the hosting provider's environment controls.

Optional environment variables:

- `OSRM_URL`, `WEATHER_URL`, `GEOCODING_URL`: use an approved provider endpoint instead of the public development defaults.
- `ALLOWED_HOSTS`: comma-separated additional exact hostnames.
- `DEBUG`: leave false in any hosted deployment.

The application does not need a persistent filesystem. Process-local forecast caching is an optimization, not durable state or a shared abuse limit. Cold starts and parallel instances may refetch the same forecast. Keep demo traffic modest; a larger public application needs a shared quota/cache plan.

## Verification performed locally

- Real OSRM + Open-Meteo HTTP flow from Gunicorn: Chicago to Detroit, two genuine alternatives, 26 ETA checkpoints and 39 corridor samples ×49 hourly states. Plan response: HTTP 200 in approximately **11.6 seconds**, **854 KB** before compression.
- One route Chicago to Indianapolis: full real planner execution in approximately **8.7 seconds**.
- Local Python WSGI import/startup: approximately **0.18 seconds**. This is **not a measurement of a Vercel cold start**. Vercel startup and regional upstream latency must be measured after a successful deployment.
- Root HTML, bundled JS/CSS, geocoding and health endpoints returned HTTP 200 through Gunicorn.
- `vercel.json` data validated against the current Vercel schema using a modern JSON Schema validator. The published schema's own draft metadata mixes newer keywords, so a strict draft-04 schema self-check fails on unrelated queue definitions; no app config data errors were found.

Frontend/browser visual inspection is not asserted by these server and unit checks. Verify the hosted app in a real browser before submission.

## Deployment checklist

1. Confirm the intended Vercel account and its remaining usage limits. Use an existing authorized connection; don't upgrade plans or create paid resources implicitly.
2. Deploy only this project directory and its source files, excluding dependencies, local builds, caches, secrets and unrelated workspace files.
3. Wait for the deployment to reach READY. Inspect build logs and the resolved Python function configuration.
4. Check root HTML, assets, `/api/health/`, location search, a real plan, route selection and the forecast slider.
5. Check the response on the public URL without an authenticated dashboard session. Do not bypass deployment protection by changing account permissions silently.
6. Record actual cold/warm request timings, any provider warnings and any remaining unverified UI behavior.

The initial hosted deployment and API checks above are verified. Future source changes still require a successful deployment and repeat checks before they are considered live.
