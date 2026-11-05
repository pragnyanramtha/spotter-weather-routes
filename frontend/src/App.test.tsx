import { afterEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
vi.mock("./MapWorkspace", () => ({ default: () => <div data-testid="map" /> }));
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
