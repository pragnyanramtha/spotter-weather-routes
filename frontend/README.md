# Spotter route workspace

React + TypeScript + Vite interface for the Django weather-routing API.

## Run

```sh
npm ci
npm run dev
```

Vite forwards `/api/*` to Django at `http://127.0.0.1:8000`. Open the Vite URL shown in the terminal. The base map fetches OpenStreetMap tiles directly; fonts are optional Google Fonts with local sans-serif fallbacks. These services require internet access. Map failures show an explicit warning.

```sh
npm test
npm run build
```

Production files are generated in `dist/`. This project does not deploy anything.

## Behavior and safeguards

- Search locations explicitly with the arrow button or Enter; select a returned result. Manual coordinates work without geocoding.
- Browser-local departure values are sent as explicit UTC ISO timestamps; departures are limited to the next 48 hours.
- Repeated plan submissions and input changes during a request are disabled. Editing an existing trip marks displayed results stale until replanning.
- Real alternatives only. No seeded/demo weather or routes. Provider errors stay visible.
- Recommendations reject routes with any unknown or No Travel segment or checkpoint.
- Route colors use backend conservative `segments` along actual road geometry. Missing segments render gray rather than guessing.
- Checkpoint tooltips display forecast, risk reasoning, and estimated arrival in browser-local time.
- The corridor canvas draws spatial gradient kernels around actual forecast sample points, using the selected departure-relative hour. It is a sampled risk overlay, not live radar or interpolated meteorological truth. Unavailable forecasts are gray.
- OSRM driving routes are explicitly not truck-restriction, traffic, stop, or HOS aware.

## API

GET `/api/geocode/?q=...` returns `{results:[{name,latitude,longitude}]}`.
POST `/api/plan/` accepts `{origin,destination,departure,load_lb,spacing_miles}`.
Types for the plan response are in `src/types.ts`. Route `segments` contain `coordinates` in longitude/latitude order and nullable `risk`. All route and checkpoint coordinates are converted to Leaflet's latitude/longitude order at the view boundary. The forecast slider selects `corridor.points[].hours[0..48]`.
