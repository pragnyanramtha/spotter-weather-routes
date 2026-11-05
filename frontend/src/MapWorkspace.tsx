import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  useMapEvents,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { COLORS, LABELS, riskColor, routeSegments } from "./helpers";
import type { Place, Plan } from "./types";
import "./MapWorkspace.css";
type Endpoint = "origin" | "destination";
const endpointIcons = {
  origin: L.divIcon({
    className: "endpoint-marker origin-marker",
    html: "<span>A</span>",
    iconSize: [30, 36],
    iconAnchor: [15, 36],
  }),
  destination: L.divIcon({
    className: "endpoint-marker destination-marker",
    html: "<span>B</span>",
    iconSize: [30, 36],
    iconAnchor: [15, 36],
  }),
};
function updateMarkerLabel(marker: L.Marker | null, label: string) {
  const element = marker?.getElement();
  element?.setAttribute("aria-label", label);
  // React-Leaflet updates marker position, but Leaflet's initial title option
  // is not reactive. Keep the native hover/help text in sync after moving.
  element?.setAttribute("title", label);
}
function pinPlace(
  endpoint: Endpoint,
  latitude: number,
  longitude: number,
): Place {
  // Leaflet allows horizontal world wrapping; store canonical coordinates.
  longitude = ((((longitude + 180) % 360) + 360) % 360) - 180;
  latitude = Math.max(-85, Math.min(85, latitude));
  return {
    name: `${endpoint === "origin" ? "Origin" : "Destination"} pin (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    latitude,
    longitude,
  };
}
function FitLocations({
  plan,
  origin,
  destination,
  skipFit,
}: {
  plan: Plan | null;
  origin: Place | null;
  destination: Place | null;
  skipFit: React.RefObject<string | null>;
}) {
  const map = useMap();
  const routeKey = useMemo(
    () => JSON.stringify(plan?.routes.map((r) => r.geometry) || []),
    [plan],
  );
  const endpointKey = JSON.stringify([
    origin && [origin.latitude, origin.longitude],
    destination && [destination.latitude, destination.longitude],
  ]);
  const previousRouteKey = useRef("");
  useEffect(() => {
    const newRoute = routeKey !== previousRouteKey.current;
    previousRouteKey.current = routeKey;
    if (skipFit.current === endpointKey && !newRoute) {
      skipFit.current = null;
      return;
    }
    skipFit.current = null;
    const routes: [number, number][][] = JSON.parse(routeKey);
    const endpoints: ([number, number] | null)[] = JSON.parse(endpointKey);
    const points =
      newRoute && routes.some((r) => r.length)
        ? routes.flatMap((r) => r.map(([lon, lat]) => L.latLng(lat, lon)))
        : endpoints
            .filter((p): p is [number, number] => p !== null)
            .map(([lat, lon]) => L.latLng(lat, lon));
    if (points.length)
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 12 });
  }, [routeKey, endpointKey, map, skipFit]);
  return null;
}
function PickLocation({
  picking,
  disabled,
  onPlace,
}: {
  picking: Endpoint | null;
  disabled: boolean;
  onPlace: (endpoint: Endpoint, place: Place) => void;
}) {
  useMapEvents({
    click(event) {
      if (!picking || disabled) return;
      const target = event.originalEvent?.target;
      if (
        target instanceof Element &&
        target.closest("button, a, .leaflet-control, .endpoint-marker")
      )
        return;
      onPlace(picking, pinPlace(picking, event.latlng.lat, event.latlng.lng));
    },
  });
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
  origin,
  destination,
  picking,
  onPickMode,
  onPlace,
  disabled,
}: {
  plan: Plan | null;
  selected: string | null;
  onSelect: (id: string) => void;
  hour: number;
  heat: boolean;
  origin: Place | null;
  destination: Place | null;
  picking: Endpoint | null;
  onPickMode: (mode: Endpoint | null) => void;
  onPlace: (endpoint: Endpoint, place: Place) => void;
  disabled: boolean;
}) {
  const [tileError, setTileError] = useState(false);
  const skipFit = useRef<string | null>(null);
  function placePin(endpoint: Endpoint, place: Place) {
    if (disabled) return;
    // Keep the current view after direct map work, so placing A never jumps
    // away from where the person is about to place B.
    skipFit.current = JSON.stringify([
      endpoint === "origin"
        ? [place.latitude, place.longitude]
        : origin && [origin.latitude, origin.longitude],
      endpoint === "destination"
        ? [place.latitude, place.longitude]
        : destination && [destination.latitude, destination.longitude],
    ]);
    onPlace(endpoint, place);
  }
  useEffect(() => {
    if (!picking) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") onPickMode(null);
    };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [picking, onPickMode]);
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
    <section
      id="map-workspace"
      className="map-workspace"
      aria-label="Route map"
    >
      <div className="map-pick-toolbar">
        <div className="map-pick-actions" aria-label="Choose a map endpoint">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={picking === "origin"}
            onClick={() => onPickMode(picking === "origin" ? null : "origin")}
          >
            <b>A</b> Pick origin
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={picking === "destination"}
            onClick={() =>
              onPickMode(picking === "destination" ? null : "destination")
            }
          >
            <b>B</b> Pick destination
          </button>
          {picking && (
            <button
              type="button"
              className="map-pick-cancel"
              onClick={() => onPickMode(null)}
            >
              Cancel
            </button>
          )}
        </div>
        <p role="status">
          {picking
            ? `Click or tap the map to place your ${picking}. Pan or zoom first. Esc to cancel.`
            : "Search a city or pick A and B on the map. Drag pins to adjust."}{" "}
          <span>Keyboard users can enter coordinates in the trip form.</span>
        </p>
      </div>
      <div className={`map-shell${picking && !disabled ? " is-picking" : ""}`}>
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
          <FitLocations
            plan={plan}
            origin={origin}
            destination={destination}
            skipFit={skipFit}
          />
          <PickLocation
            picking={picking}
            disabled={disabled}
            onPlace={placePin}
          />
          {(["origin", "destination"] as const).map((endpoint) => {
            const place = endpoint === "origin" ? origin : destination;
            if (!place) return null;
            const label = `${endpoint === "origin" ? "Origin A" : "Destination B"}: ${place.name}. ${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}. Drag to move or use the trip form coordinates.`;
            return (
              <Marker
                key={endpoint}
                ref={(marker) => {
                  updateMarkerLabel(marker, label);
                }}
                position={[place.latitude, place.longitude]}
                icon={endpointIcons[endpoint]}
                draggable={!disabled}
                title={label}
                alt={label}
                bubblingMouseEvents={false}
                eventHandlers={{
                  add: (event) => {
                    updateMarkerLabel(event.target as L.Marker, label);
                  },
                  dragend: (event) => {
                    if (disabled) return;
                    const position = (event.target as L.Marker).getLatLng();
                    placePin(
                      endpoint,
                      pinPlace(endpoint, position.lat, position.lng),
                    );
                  },
                }}
              >
                <Tooltip>
                  {endpoint === "origin" ? "A · Origin" : "B · Destination"}:{" "}
                  {place.name}
                  <br />
                  {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                </Tooltip>
              </Marker>
            );
          })}
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
    </section>
  );
}
function MapControls() {
  const map = useMap();
  return (
    <div
      className="map-controls"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button aria-label="Zoom in" onClick={() => map.zoomIn()}>
        +
      </button>
      <button aria-label="Zoom out" onClick={() => map.zoomOut()}>
        −
      </button>
    </div>
  );
}
