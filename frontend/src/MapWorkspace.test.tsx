import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import MapWorkspace from "./MapWorkspace";
import type { Plan } from "./types";

const mock = vi.hoisted(() => ({
  click: null as null | ((event: unknown) => void),
  fitBounds: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  markers: [] as any[],
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Marker: (props: any) => {
    mock.markers.push(props);
    return <div aria-label={props.alt}>{props.children}</div>;
  },
  useMap: () => mock,
  useMapEvents: (handlers: any) => {
    mock.click = handlers.click;
    return mock;
  },
}));
const base = {
  plan: null,
  selected: null,
  onSelect: vi.fn(),
  hour: 0,
  heat: false,
  origin: null,
  destination: null,
  picking: null,
  onPickMode: vi.fn(),
  onPlace: vi.fn(),
  disabled: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.markers = [];
});
afterEach(cleanup);
describe("map endpoint picking", () => {
  it("replaces the blocking welcome overlay with a helper outside map imagery", () => {
    render(<MapWorkspace {...base} />);
    expect(screen.queryByText("Know what’s ahead.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status").closest('[data-testid="map"]'),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Pick origin/ }));
    expect(base.onPickMode).toHaveBeenCalledWith("origin");
    fireEvent.click(screen.getByRole("button", { name: /Pick destination/ }));
    expect(base.onPickMode).toHaveBeenCalledWith("destination");
  });
  it("places only the selected endpoint and wraps longitude", () => {
    render(<MapWorkspace {...base} picking="destination" />);
    mock.click?.({
      latlng: { lat: 40, lng: 285 },
      originalEvent: { target: screen.getByTestId("map") },
    });
    expect(base.onPlace).toHaveBeenCalledExactlyOnceWith("destination", {
      name: "Destination pin (40.0000, -75.0000)",
      latitude: 40,
      longitude: -75,
    });
  });
  it("keeps map placement within supported latitude and does not jump after placing a pin", () => {
    const { rerender } = render(<MapWorkspace {...base} picking="origin" />);
    mock.click?.({ latlng: { lat: 89, lng: 10 } });
    const changed = base.onPlace.mock.calls[0][1];
    expect(changed.latitude).toBe(85);
    rerender(<MapWorkspace {...base} origin={changed} />);
    expect(mock.fitBounds).not.toHaveBeenCalled();
    mock.click?.({ latlng: { lat: 42, lng: -71 } });
    expect(base.onPlace).toHaveBeenCalledOnce();
  });
  it("does not place a pin from zoom controls or when disabled", () => {
    const { rerender } = render(<MapWorkspace {...base} picking="origin" />);
    const zoom = screen.getByRole("button", { name: "Zoom in" });
    mock.click?.({
      latlng: { lat: 40, lng: -75 },
      originalEvent: { target: zoom },
    });
    fireEvent.click(zoom);
    expect(mock.zoomIn).toHaveBeenCalledOnce();
    expect(base.onPlace).not.toHaveBeenCalled();
    rerender(<MapWorkspace {...base} picking="origin" disabled />);
    mock.click?.({ latlng: { lat: 40, lng: -75 } });
    expect(base.onPlace).not.toHaveBeenCalled();
  });
  it("cancels with a button or Escape without placing an endpoint", () => {
    render(<MapWorkspace {...base} picking="origin" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(base.onPickMode).toHaveBeenCalledTimes(2);
    expect(base.onPickMode).toHaveBeenLastCalledWith(null);
    expect(base.onPlace).not.toHaveBeenCalled();
  });
  it("renders draggable named endpoints and avoids refitting after a drag or hour change", () => {
    const origin = { name: "Boston", latitude: 42, longitude: -71 };
    const { rerender } = render(<MapWorkspace {...base} origin={origin} />);
    expect(mock.fitBounds).toHaveBeenCalledOnce();
    const marker = mock.markers.at(-1);
    expect(marker.draggable).toBe(true);
    expect(marker.alt).toContain("Origin A: Boston");
    marker.eventHandlers.dragend({
      target: { getLatLng: () => ({ lat: 43, lng: -70 }) },
    });
    const changed = base.onPlace.mock.calls[0][1];
    rerender(<MapWorkspace {...base} origin={changed} />);
    expect(mock.fitBounds).toHaveBeenCalledOnce();
    rerender(<MapWorkspace {...base} origin={changed} hour={2} />);
    expect(mock.fitBounds).toHaveBeenCalledOnce();
    rerender(<MapWorkspace {...base} origin={changed} disabled />);
    expect(mock.markers.at(-1).draggable).toBe(false);
  });
  it("updates native marker title and accessible label after moving a city pin", () => {
    const origin = { name: "Boston", latitude: 42, longitude: -71 };
    const element = document.createElement("div");
    const leafletMarker = { getElement: () => element };
    const { rerender } = render(<MapWorkspace {...base} origin={origin} />);
    mock.markers.at(-1).ref(leafletMarker);
    expect(element.title).toContain("Origin A: Boston");
    const pin = {
      name: "Origin pin (43.0000, -70.0000)",
      latitude: 43,
      longitude: -70,
    };
    rerender(<MapWorkspace {...base} origin={pin} />);
    mock.markers.at(-1).ref(leafletMarker);
    expect(element.title).toContain(pin.name);
    expect(element.getAttribute("aria-label")).toBe(element.title);
    element.removeAttribute("title");
    mock.markers.at(-1).eventHandlers.add({ target: leafletMarker });
    expect(element.title).toContain(pin.name);
  });
  it("fits endpoints when chosen outside the map", () => {
    const { rerender } = render(<MapWorkspace {...base} />);
    expect(mock.fitBounds).not.toHaveBeenCalled();
    rerender(
      <MapWorkspace
        {...base}
        origin={{ name: "Boston", latitude: 42, longitude: -71 }}
      />,
    );
    expect(mock.fitBounds).toHaveBeenCalledOnce();
  });
  it("fits a new route but not selection or forecast-hour changes", () => {
    const plan: Plan = {
      routes: [
        {
          id: "main",
          name: "Main",
          geometry: [
            [-71, 42],
            [-70, 43],
          ],
          distance_miles: 90,
          duration_seconds: 3600,
          checkpoints: [],
          summary: { risk_miles: {}, average_risk: 0, eligible: true },
          warnings: [],
        },
      ],
      recommended_route_id: "main",
      recommendation_reason: "",
      warnings: [],
      corridor: { base_time: "", points: [] },
      providers: { routing: "", weather: "", geocoding: "" },
      generated_at: "",
    };
    const { rerender } = render(<MapWorkspace {...base} plan={plan} />);
    expect(mock.fitBounds).toHaveBeenCalledOnce();
    rerender(<MapWorkspace {...base} plan={plan} selected="main" hour={4} />);
    expect(mock.fitBounds).toHaveBeenCalledOnce();
    const changed = {
      ...plan,
      routes: [
        {
          ...plan.routes[0],
          geometry: [
            [-71, 42],
            [-69, 44],
          ] as [number, number][],
        },
      ],
    };
    rerender(<MapWorkspace {...base} plan={changed} />);
    expect(mock.fitBounds).toHaveBeenCalledTimes(2);
  });
});
