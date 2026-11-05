import { afterEach, describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
import type { ComponentProps } from "react";
import type MapWorkspace from "./MapWorkspace";
const map = vi.hoisted(() => ({
  props: null as ComponentProps<typeof MapWorkspace> | null,
}));
vi.mock("./MapWorkspace", () => ({
  default: (props: ComponentProps<typeof MapWorkspace>) => {
    map.props = props;
    return <div id="map-workspace" data-testid="map" />;
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function enterTrip() {
  fireEvent.click(screen.getAllByText("Enter coordinates manually")[0]);
  fireEvent.change(screen.getByLabelText("Origin latitude"), {
    target: { value: "41" },
  });
  fireEvent.change(screen.getByLabelText("Origin longitude"), {
    target: { value: "-87" },
  });
  fireEvent.click(screen.getByText("Enter coordinates manually"));
  fireEvent.change(screen.getByLabelText("Destination latitude"), {
    target: { value: "42" },
  });
  fireEvent.change(screen.getByLabelText("Destination longitude"), {
    target: { value: "-88" },
  });
}
const result = {
  routes: [
    {
      id: "1",
      name: "Route 1",
      distance_miles: 100,
      duration_seconds: 7200,
      geometry: [],
      checkpoints: [
        {
          risk: null,
          distance_miles: 0,
          eta: new Date().toISOString(),
          weather: null,
        },
      ],
      summary: {
        eligible: true,
        risk_miles: { unknown: 100, no_travel: 0, high: 0, severe: 0 },
      },
      warnings: [],
    },
  ],
  recommended_route_id: "1",
  recommendation_reason: "This should not be recommended",
  warnings: [],
  corridor: { base_time: new Date().toISOString(), points: [] },
  providers: { routing: "OSRM", weather: "Open-Meteo", geocoding: "Nominatim" },
  generated_at: new Date().toISOString(),
};
describe("route planning workflow", () => {
  it("does not submit unresolved locations", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose both locations",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("submits coordinates and explicit timezone, rejects unsafe recommendation, and flags edits", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    enterTrip();
    fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));
    await screen.findByText(
      "No fully assessed, travel-eligible recommendation",
    );
    expect(
      screen.queryByText("This should not be recommended"),
    ).not.toBeInTheDocument();
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.origin.latitude).toBe(41);
    expect(request.departure).toMatch(/Z$/);
    expect(request.spacing_miles).toBe(25);
    fireEvent.change(screen.getByLabelText(/Truck load weight/), {
      target: { value: "10000" },
    });
    expect(screen.getByText(/Trip details changed/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Forecast hours after departure"), {
      target: { value: "48" },
    });
    expect(screen.getByText("+48h", { selector: "b" })).toBeInTheDocument();
  });
  it("surfaces provider failure and restores submit control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Weather provider timed out" }),
      }),
    );
    render(<App />);
    enterTrip();
    fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Weather provider timed out",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Generate routes" }),
    ).toBeEnabled();
  });
});

describe("quick trip setup", () => {
  it("fills an example trip without generating routes or fetching forecasts", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Chicago → Detroit/ }));
    expect(screen.getByLabelText("Origin")).toHaveValue(
      "Chicago, Illinois, US",
    );
    expect(screen.getByLabelText("Destination")).toHaveValue(
      "Detroit, Michigan, US",
    );
    expect(map.props?.origin?.latitude).toBe(41.8781);
    expect(map.props?.destination?.longitude).toBe(-83.0458);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("connects map picking to the form and clears picking after placement", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Pick on map" })[0]);
    expect(map.props?.picking).toBe("origin");
    act(() =>
      map.props?.onPlace("origin", {
        name: "Origin pin",
        latitude: 40,
        longitude: -75,
      }),
    );
    expect(screen.getByLabelText("Origin")).toHaveValue("Origin pin");
    expect(map.props?.picking).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Pick on map" })[1]);
    expect(map.props?.picking).toBe("destination");
    act(() => map.props?.onPickMode(null));
    expect(map.props?.picking).toBeNull();
    expect(map.props?.destination).toBeNull();
  });
  it("locks map endpoints while a plan is pending and marks later pin edits stale", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Chicago → Detroit/ }));
    fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));
    expect(map.props?.disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: /Dallas → Austin/ }),
    ).toBeDisabled();
    const pin = { name: "Origin pin", latitude: 40, longitude: -75 };
    act(() => map.props?.onPlace("origin", pin));
    expect(screen.getByLabelText("Origin")).toHaveValue(
      "Chicago, Illinois, US",
    );
    await act(async () => {
      finish({ ok: true, json: async () => result });
    });
    expect(map.props?.disabled).toBe(false);
    act(() => map.props?.onPlace("origin", pin));
    expect(screen.getByText(/Trip details changed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Origin")).toHaveValue("Origin pin");
  });
  it("refreshes an expired departure with Leave in 5 minutes", () => {
    render(<App />);
    const input = screen.getByLabelText(/Departure/);
    fireEvent.change(input, { target: { value: "2020-01-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Leave in 5 minutes" }));
    const refreshed = new Date((input as HTMLInputElement).value).getTime();
    expect(refreshed).toBeGreaterThan(Date.now() + 4 * 60000);
    expect(refreshed).toBeLessThanOrEqual(Date.now() + 5 * 60000);
  });
});
