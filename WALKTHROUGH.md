# 5–10 minute walkthrough outline

This is a recording guide, not a claim that a Loom video has been recorded.

## 0:00–1:00 · Problem and choices

Explain the goal: compare real routes using weather expected when the truck reaches each checkpoint. Show React/TypeScript + Django. Note that risk rules follow the assessment and this is not production truck navigation.

## 1:00–3:00 · Live planning flow

1. Select the Chicago → Detroit example trip, or type cities and choose automatic suggestions. Show how Pick origin/Pick destination places map pins and how dragging adjusts them. These set trip inputs only; they do not invent routes or weather.
2. Choose a near-future departure, load weight and 25-mile spacing.
3. Generate a plan. Explain that OSRM is asked for three distinct alternatives and may return fewer; the app makes that visible rather than inventing options.
4. Compare distance, time, eligibility and severity mileage. Select another route and inspect its checkpoint ETA, wind, rain/snow and reason.

Use actual returned conditions. If weather is mild, do not imply the app has found a storm. Demonstrate severe thresholds through the automated tests instead.

## 3:00–4:00 · Map and forecast

Show all alternative lines, actual road-following colored segments and checkpoint tooltips. Move the 0–48-hour forecast slider. Explain its sampled corridor model, unknown data and difference from rerunning a new departure plan.

## 4:00–6:00 · Correctness

Open the pure domain code and show strict load boundaries, conservative shared rain/snow thresholds, cumulative edge timing and segment exposure. Explain the No Travel/unknown gate and lexicographic ranking. Run the backend tests. Show one boundary test and one route recommendation test.

## 6:00–8:00 · Architecture, tests and limits

Show provider separation, cached batched calls, input validation, provider failure handling and frontend tests/build. Explain the free public API limitations, truck profile caveat, absence of fabricated data, and what would change for production. Finish with repository and hosted URL only once they really exist.

## Submission checklist

- [ ] Review the source and understand the risk/ETA decisions.
- [ ] Re-run all tests and a current live route request.
- [x] Publish the reviewed source to GitHub.
- [x] Deploy to Vercel and verify public frontend assets and a real hosted API request.
- [x] Complete production desktop-browser/console verification, including the location-picker update and repeated-selection regression fix.
- [ ] Record a genuine 5–10 minute Loom walkthrough.
- [ ] Review the final three links before submitting them to the employer.

Live app: https://spotter-weather-routes-nine.vercel.app

Repository: https://github.com/pragnyanramtha/spotter-weather-routes

Recording and employer submission remain separate, unfinished steps.
