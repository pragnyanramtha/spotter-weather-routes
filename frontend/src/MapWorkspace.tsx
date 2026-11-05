import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { COLORS, LABELS, riskColor, routeSegments } from "./helpers";
import type { Plan } from "./types";
function FitRoutes({ plan }: { plan: Plan | null }) {
  const map = useMap();
  useEffect(() => {
    if (plan?.routes.some((r) => r.geometry.length)) {
      const points = plan.routes.flatMap((r) =>
        r.geometry.map(([lon, lat]) => L.latLng(lat, lon)),
      );
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
    }
  }, [plan, map]);
  return null;
}
function HeatLayer({
  plan,
  hour,
  visible,
}: {
  plan: Plan | null;
  hour: number;
  visible: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!visible || !plan) return;
    const pane = map.getPane("weather-heat") || map.createPane("weather-heat");
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";
    const canvas = L.DomUtil.create("canvas", "weather-canvas", pane);
    const draw = () => {
      const size = map.getSize();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = size.x * ratio;
      canvas.height = size.y * ratio;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      for (const p of plan.corridor.points) {
        const risk = p.hours[hour]?.risk;
        const point = map.latLngToContainerPoint([p.latitude, p.longitude]);
        const radius = Math.max(
          24,
          Math.min(
            100,
            map.distance(
              map.containerPointToLatLng([0, 0]),
              map.containerPointToLatLng([100, 0]),
            ) > 0
              ? 2000000 /
                  map.distance(
                    map.containerPointToLatLng([0, 0]),
                    map.containerPointToLatLng([100, 0]),
                  )
              : 40,
          ),
        );
        const color = riskColor(risk);
        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius,
        );
        gradient.addColorStop(0, color + "90");
        gradient.addColorStop(0.45, color + "55");
        gradient.addColorStop(1, color + "00");
        ctx.fillStyle = gradient;
        ctx.fillRect(
          point.x - radius,
          point.y - radius,
          radius * 2,
          radius * 2,
        );
      }
    };
    draw();
    map.on("move zoom resize", draw);
    return () => {
      map.off("move zoom resize", draw);
      canvas.remove();
    };
  }, [plan, hour, visible, map]);
  return null;
}
export default function MapWorkspace({
  plan,
  selected,
  onSelect,
  hour,
  heat,
}: {
  plan: Plan | null;
  selected: string | null;
  onSelect: (id: string) => void;
  hour: number;
  heat: boolean;
}) {
  const [tileError, setTileError] = useState(false);
  const selectedRoute = plan?.routes.find((r) => r.id === selected);
  const segments = useMemo(
    () =>
      (plan?.routes || [])
        .flatMap((route) =>
          routeSegments(route).map((segment) => ({
            ...segment,
            routeId: route.id,
          })),
        )
        .sort(
          (a, b) =>
            Number(a.routeId === selected) - Number(b.routeId === selected),
        ),
    [plan, selected],
  );
  return (
    <div className="map-shell">
      <MapContainer
        center={[38.4, -97.2]}
        zoom={4}
        zoomControl={false}
        className="map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        <FitRoutes plan={plan} />
        <HeatLayer plan={plan} hour={hour} visible={heat} />
        {plan?.routes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.geometry.map(([lon, lat]) => [lat, lon])}
            pathOptions={{
              color: route.id === selected ? "#fff" : "#6e8194",
              weight: route.id === selected ? 9 : 5,
              opacity: 0.85,
            }}
            eventHandlers={{ click: () => onSelect(route.id) }}
          >
            <Tooltip>
              {route.name} · {Math.round(route.distance_miles)} mi
            </Tooltip>
          </Polyline>
        ))}
        {segments.map((s, i) => (
          <Polyline
            key={i}
            positions={s.positions}
            pathOptions={{
              color: s.color,
              weight: s.routeId === selected ? 5 : 3,
              opacity: s.routeId === selected ? 1 : 0.6,
            }}
            eventHandlers={{ click: () => onSelect(s.routeId) }}
          />
        ))}
        {selectedRoute?.checkpoints.map((c, i) => (
          <CircleMarker
            key={i}
            center={[c.latitude, c.longitude]}
            radius={5}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: riskColor(c.risk),
              fillOpacity: 1,
            }}
          >
            <Tooltip>
              <div className="checkpoint-tooltip">
                <strong>
                  Checkpoint {i + 1} · {Math.round(c.distance_miles)} mi
                </strong>
                <span>ETA {new Date(c.eta).toLocaleString()}</span>
                <b style={{ color: riskColor(c.risk) }}>
                  {c.risk?.label || "Unknown forecast"}
                </b>
                <span>
                  Wind {c.weather?.wind_mph ?? "—"} mph · Rain{" "}
                  {c.weather?.rain_in_hr ?? "—"} in/hr
                </span>
                <span>Snow {c.weather?.snow_in_hr ?? "—"} in/hr</span>
                <span>
                  {c.risk?.reasons?.join(" · ") ||
                    (c.risk
                      ? "No risk threshold exceeded."
                      : "Weather data unavailable for this checkpoint.")}
                </span>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
        <MapControls />
      </MapContainer>
      {tileError && (
        <div className="tile-warning">
          Base map unavailable. Route overlays still work.
        </div>
      )}
      <div className="map-label">
        <span className="live-dot" /> WEATHER INTELLIGENCE{" "}
        <span className="label-divider" /> CORRIDOR FORECAST
      </div>
      {!plan && (
        <div className="map-empty">
          <div className="empty-crosshair">⌖</div>
          <h2>Know what’s ahead.</h2>
          <p>
            Plan a trip to compare route conditions
            <br />
            and see weather along your corridor.
          </p>
        </div>
      )}
      <div className="legend">
        <span>WEATHER RISK</span>
        <div>
          {LABELS.map((label, i) => (
            <span key={label}>
              <i style={{ background: COLORS[i] }} />
              {label}
            </span>
          ))}
          <span>
            <i style={{ background: "#8a969d" }} />
            Unknown
          </span>
        </div>
      </div>
    </div>
  );
}
function MapControls() {
  const map = useMap();
  return (
    <div className="map-controls">
      <button aria-label="Zoom in" onClick={() => map.zoomIn()}>
        +
      </button>
      <button aria-label="Zoom out" onClick={() => map.zoomOut()}>
        −
      </button>
    </div>
  );
}
