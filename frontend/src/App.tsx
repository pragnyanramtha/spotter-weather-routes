import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  CloudSun,
  Route as RouteIcon,
  Truck,
  ShieldCheck,
  Layers,
  Clock,
  MapPin,
  ChevronRight,
  Compass,
} from "lucide-react";
import PlaceInput from "./PlaceInput";
import MapWorkspace from "./MapWorkspace";
import { EXAMPLE_TRIPS } from "./placeSuggestions";
import {
  COLORS,
  LABELS,
  canRecommend,
  departureISO,
  duration,
  localInputDate,
} from "./helpers";
import type { Place, Plan, Route } from "./types";
export default function App() {
  const [origin, setOrigin] = useState<Place | null>(null),
    [destination, setDestination] = useState<Place | null>(null);
  const [departure, setDeparture] = useState(
    localInputDate(new Date(Date.now() + 5 * 60000)),
  );
  const [load, setLoad] = useState("35000");
  const [spacing, setSpacing] = useState(25);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hour, setHour] = useState(0);
  const [heat, setHeat] = useState(true);
  const [stale, setStale] = useState(false);
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const recommended = plan?.routes.find(
    (r) => r.id === plan.recommended_route_id && canRecommend(r),
  );
  const current = plan?.routes.find((r) => r.id === selected);
  function edit(callback: () => void) {
    callback();
    if (plan) setStale(true);
  }
  function pickOnMap(endpoint: "origin" | "destination" | null) {
    if (busy) return;
    setPicking(endpoint);
    if (endpoint) {
      document.getElementById("map-workspace")?.scrollIntoView?.({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "instant"
          : "smooth",
        block: "center",
      });
    }
  }
  function changePlace(
    endpoint: "origin" | "destination",
    place: Place | null,
  ) {
    if (busy) return;
    edit(() =>
      endpoint === "origin" ? setOrigin(place) : setDestination(place),
    );
    setPicking(null);
  }
  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!origin || !destination) {
      setError(
        "Choose both locations from city suggestions, map pins, or valid coordinates.",
      );
      return;
    }
    const weight = Number(load);
    if (!load.trim() || !Number.isFinite(weight) || weight < 0) {
      setError("Enter a non-negative load weight in pounds.");
      return;
    }
    let iso;
    try {
      iso = departureISO(departure);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (
      new Date(iso).getTime() < Date.now() - 60000 ||
      new Date(iso).getTime() > Date.now() + 48 * 3600000
    ) {
      setError("Choose a departure between now and 48 hours from now.");
      return;
    }
    setPicking(null);
    setBusy(true);
    try {
      const response = await fetch("/api/plan/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination,
          departure: iso,
          load_lb: weight,
          spacing_miles: spacing,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ||
            data.detail ||
            "The route service is unavailable. Please try again.",
        );
      if (!Array.isArray(data.routes))
        throw new Error("The route service returned an invalid response.");
      setPlan(data);
      const eligible = data.routes.find(
        (r: Route) => r.id === data.recommended_route_id && canRecommend(r),
      );
      setSelected(eligible?.id || data.routes[0]?.id || null);
      setHour(0);
      setStale(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to plan this route.");
    } finally {
      setBusy(false);
    }
  }
  const forecastTime = plan
    ? new Date(new Date(plan.corridor.base_time).getTime() + hour * 3600000)
    : null;
  return (
    <div className="app">
      <header className="topbar">
        <a href="#" className="brand" aria-label="Spotter home">
          <span className="brand-symbol">
            <Compass size={23} />
          </span>
          spotter<span className="brand-dot">.</span>
        </a>
        <div className="product-breadcrumb">
          <span />
          Route intelligence
        </div>
        <div className="topbar-right">
          <span className="prototype-pill">ASSESSMENT PROTOTYPE</span>
          <span className="avatar">S</span>
        </div>
      </header>
      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <div className="eyebrow">PLAN WITH CONFIDENCE</div>
            <h1>A better way ahead.</h1>
            <p>Your route. Your load. The weather ahead.</p>
          </div>
          <form onSubmit={generate}>
            <fieldset disabled={busy}>
              <div className="trip-points">
                <div className="point-rail">
                  <i />
                  <span />
                  <MapPin size={15} />
                </div>
                <div>
                  <PlaceInput
                    label="Origin"
                    value={origin}
                    onChange={(p) => changePlace("origin", p)}
                    picking={picking === "origin"}
                    onPickMap={() =>
                      pickOnMap(picking === "origin" ? null : "origin")
                    }
                  />
                  <PlaceInput
                    label="Destination"
                    value={destination}
                    onChange={(p) => changePlace("destination", p)}
                    picking={picking === "destination"}
                    onPickMap={() =>
                      pickOnMap(
                        picking === "destination" ? null : "destination",
                      )
                    }
                  />
                </div>
              </div>
              <div className="example-trips">
                <div className="example-trips-heading">Try an example trip</div>
                <div className="example-trip-buttons">
                  {EXAMPLE_TRIPS.map((trip) => (
                    <button
                      type="button"
                      key={trip.label}
                      onClick={() => {
                        edit(() => {
                          setOrigin(trip.origin);
                          setDestination(trip.destination);
                        });
                        setPicking(null);
                        setError("");
                      }}
                    >
                      {trip.label}
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <p>
                  Fills city centers only. Generate routes for live route and
                  forecast data.
                </p>
              </div>
              <div className="form-divider" />
              <label className="label-icon" htmlFor="departure">
                <Clock size={14} />
                Departure <span>Local time</span>
              </label>
              <input
                id="departure"
                type="datetime-local"
                value={departure}
                onChange={(e) => edit(() => setDeparture(e.target.value))}
                required
              />
              <button
                className="text-button departure-reset"
                type="button"
                onClick={() =>
                  edit(() => {
                    setDeparture(
                      localInputDate(new Date(Date.now() + 5 * 60000)),
                    );
                    setError("");
                  })
                }
              >
                Leave in 5 minutes
              </button>
              <label className="label-icon" htmlFor="load">
                <Truck size={15} />
                Truck load weight <span>lbs</span>
              </label>
              <div className="load-input">
                <input
                  id="load"
                  type="number"
                  min="0"
                  step="1"
                  value={load}
                  onChange={(e) => edit(() => setLoad(e.target.value))}
                  required
                />
                <span>lbs</span>
              </div>
              <label className="label-icon" id="spacing-label">
                <RouteIcon size={14} />
                Weather checkpoint spacing
              </label>
              <div
                className="segmented"
                role="group"
                aria-labelledby="spacing-label"
              >
                {[10, 25, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={spacing === n}
                    className={spacing === n ? "active" : ""}
                    onClick={() => edit(() => setSpacing(n))}
                  >
                    {n} <span>mi</span>
                  </button>
                ))}
              </div>
              <p className="field-hint">
                Closer checkpoints give a more detailed risk picture.
              </p>
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
              <button className="generate-button" disabled={busy} type="submit">
                {busy ? (
                  <>
                    <span className="spinner" />
                    Checking routes & weather…
                  </>
                ) : (
                  <>
                    Generate routes
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </fieldset>
          </form>
          <div className="sidebar-note">
            <ShieldCheck size={18} />
            <p>
              Weather-aware planning.
              <br />
              <span>Built for the road ahead, not a safety guarantee.</span>
            </p>
          </div>
          <div className="limitations">
            <b>Planning preview</b>
            <p>
              OSRM driving routes do not account for truck restrictions, live
              traffic, stops, or hours of service. Confirm road closures and
              official alerts before travel.
            </p>
          </div>
        </aside>
        <section className="main-panel">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">ROUTE WORKSPACE</div>
              <h2>
                {plan
                  ? "Compare your way forward"
                  : "Every mile, a clearer picture."}
              </h2>
            </div>
            <div className="weather-badge">
              <CloudSun size={19} />
              <span>Weather-aware routing</span>
            </div>
          </div>
          <MapWorkspace
            plan={plan}
            selected={selected}
            onSelect={setSelected}
            hour={hour}
            heat={heat}
            origin={origin}
            destination={destination}
            picking={picking}
            onPickMode={pickOnMap}
            onPlace={changePlace}
            disabled={busy}
          />
          <div className="forecast-bar">
            <div className="forecast-title">
              <CloudSun size={21} />
              <div>
                <strong>Corridor forecast</strong>
                <span>
                  {forecastTime
                    ? forecastTime.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Available after you plan a trip"}
                </span>
              </div>
            </div>
            <div className="slider-area">
              <div className="slider-labels">
                <span>Departure</span>
                <b>+{hour}h</b>
                <span>+48h</span>
              </div>
              <input
                aria-label="Forecast hours after departure"
                type="range"
                min="0"
                max="48"
                step="1"
                value={hour}
                disabled={!plan}
                onChange={(e) => setHour(Number(e.target.value))}
              />
            </div>
            <button
              className={`layer-toggle ${heat ? "active" : ""}`}
              aria-pressed={heat}
              onClick={() => setHeat(!heat)}
            >
              <Layers size={16} />
              Heatmap
            </button>
          </div>
          <div className="results">
            <div className="results-heading">
              <h2>Route options {plan && <span>{plan.routes.length}</span>}</h2>
              <span>
                {plan
                  ? "Weather sampled at estimated arrival times"
                  : "Your next move starts here"}
              </span>
            </div>
            {stale && (
              <div className="notice">
                Trip details changed. Generate routes again to update this
                comparison.
              </div>
            )}
            {busy && (
              <div role="status" className="notice">
                Finding available alternatives and checking weather along each
                route. This can take a moment.
              </div>
            )}
            {plan ? (
              <>
                <div className="route-cards">
                  {plan.routes.map((r, i) => (
                    <RouteCard
                      key={r.id}
                      route={r}
                      index={i}
                      selected={r.id === selected}
                      recommended={r.id === recommended?.id}
                      onClick={() => setSelected(r.id)}
                    />
                  ))}
                </div>
                {!plan.routes.length && (
                  <div className="empty-results">
                    No routes available for these locations. Try nearby road
                    coordinates.
                  </div>
                )}
                <div
                  className={`recommendation ${recommended ? "" : "caution"}`}
                >
                  <ShieldCheck size={19} />
                  <div>
                    <strong>
                      {recommended
                        ? `${recommended.name} is the recommended option`
                        : "No fully assessed, travel-eligible recommendation"}
                    </strong>
                    <p>
                      {recommended
                        ? plan.recommendation_reason
                        : "Routes with No Travel conditions or missing forecasts are not recommended. Review the conditions and adjust your plan."}
                    </p>
                  </div>
                </div>
                {[...plan.warnings, ...(current?.warnings || [])]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((warning, i) => (
                    <p className="provider-warning" key={i}>
                      {warning}
                    </p>
                  ))}
                {current && (
                  <details className="checkpoint-details">
                    <summary>
                      Checkpoint weather details{" "}
                      <span>{current.checkpoints.length} checkpoints</span>
                    </summary>
                    <div
                      className="exposure-breakdown"
                      aria-label="Selected route weather exposure"
                    >
                      {[
                        "low",
                        "moderate",
                        "high",
                        "severe",
                        "no_travel",
                        "unknown",
                      ].map((key, index) => (
                        <span key={key}>
                          <i
                            style={{ background: COLORS[index] || "#8a969d" }}
                          />
                          {LABELS[index] || "Unknown"}:{" "}
                          <b>
                            {(current.summary.risk_miles[key] || 0).toFixed(1)}{" "}
                            mi
                          </b>
                        </span>
                      ))}
                    </div>
                    <ol className="checkpoint-list">
                      {current.checkpoints.map((point, index) => (
                        <li key={index}>
                          <div>
                            <strong>
                              Checkpoint {index + 1} ·{" "}
                              {point.distance_miles.toFixed(1)} mi
                            </strong>
                            <span>{new Date(point.eta).toLocaleString()}</span>
                          </div>
                          <b>{point.risk?.label || "Unknown forecast"}</b>
                          <p>
                            Wind {point.weather?.wind_mph ?? "—"} mph · Rain{" "}
                            {point.weather?.rain_in_hr ?? "—"} in/hr · Snow{" "}
                            {point.weather?.snow_in_hr ?? "—"} in/hr
                          </p>
                          <p>
                            {point.risk?.reasons?.join(" · ") ||
                              (point.risk
                                ? "No risk threshold exceeded."
                                : "Weather data unavailable.")}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                <p className="data-note" role="status">
                  {
                    plan.corridor.points.filter(
                      (point) => !point.hours[hour]?.risk,
                    ).length
                  }{" "}
                  of {plan.corridor.points.length} corridor sample points have
                  unavailable forecasts at +{hour}h.
                </p>
                <p className="data-note">
                  Corridor colors show sampled forecast risk at the selected
                  hour, not radar or a continuous weather field. Gray means
                  unavailable. Route colors use ETA-based risk and do not change
                  with this slider.
                </p>
                <div className="sources">
                  Routing: {plan.providers.routing} · Weather:{" "}
                  {plan.providers.weather}
                  <span>
                    Updated{" "}
                    {new Date(plan.generated_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </>
            ) : (
              <div className="empty-results">
                <div className="empty-route-icon">
                  <RouteIcon size={23} />
                </div>
                <div>
                  <strong>A smarter route starts with the forecast.</strong>
                  <p>
                    Enter your trip details to compare up to three real routes,
                    <br />
                    see weather exposure, and find the lowest-risk eligible
                    option.
                  </p>
                </div>
                <ArrowUpRight size={22} />
              </div>
            )}
          </div>
        </section>
      </main>
      <footer>
        <span>SPOTTER / ROUTE INTELLIGENCE</span>
        <span>Plan thoughtfully. Drive safely.</span>
      </footer>
    </div>
  );
}
function RouteCard({
  route,
  index,
  selected,
  recommended,
  onClick,
}: {
  route: Route;
  index: number;
  selected: boolean;
  recommended: boolean;
  onClick: () => void;
}) {
  const risks = ["low", "moderate", "high", "severe", "no_travel", "unknown"];
  const total = Object.values(route.summary.risk_miles).reduce(
    (a, b) => a + b,
    0,
  );
  const unknown = route.summary.risk_miles.unknown || 0;
  return (
    <button
      className={`route-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className="route-card-top">
        <span className="route-number">0{index + 1}</span>
        {recommended ? (
          <span className="recommended-tag">
            <ShieldCheck size={11} />
            Recommended
          </span>
        ) : (
          <span className="route-type">
            {route.summary.risk_miles.no_travel > 0
              ? "No travel"
              : unknown > 0
                ? "Incomplete forecast"
                : "Alternative"}
          </span>
        )}
        <span className="selection-radio" />
      </div>
      <h3>{route.name}</h3>
      <div className="route-stats">
        <strong>
          {Math.round(route.distance_miles).toLocaleString()}
          <small> mi</small>
        </strong>
        <span />
        <b>{duration(route.duration_seconds)}</b>
      </div>
      <div className="risk-track">
        {risks.map((risk, i) => (
          <span
            key={risk}
            style={{
              background: COLORS[i] || "#8a969d",
              width: `${total ? ((route.summary.risk_miles[risk] || 0) / total) * 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <div className="risk-summary">
        <span>
          {Math.round(
            (route.summary.risk_miles.high || 0) +
              (route.summary.risk_miles.severe || 0) +
              (route.summary.risk_miles.no_travel || 0),
          )}{" "}
          mi high risk or above
        </span>
        <ChevronRight size={14} />
      </div>
      {unknown > 0 && (
        <div className="unknown-note">
          {Math.round(unknown)} mi without forecast coverage
        </div>
      )}
    </button>
  );
}
