import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import PlaceInput from "./PlaceInput";
import { SUGGESTED_CITIES } from "./placeSuggestions";
import { clearPlaceSearchCache, SEARCH_DEBOUNCE_MS } from "./usePlaceSearch";
const remotePlace = {
  name: "Seattle, Washington, US",
  latitude: 47.6062,
  longitude: -122.3321,
};
function response(places = [remotePlace]) {
  return { ok: true, json: async () => ({ results: places }) };
}
async function advance(ms = SEARCH_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function type(query: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Origin" }), {
    target: { value: query },
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  clearPlaceSearchCache();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("location input", () => {
  it("shows instant city suggestions and selects without waiting for a network search", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const onChange = vi.fn();
    render(<PlaceInput label="Origin" value={null} onChange={onChange} />);
    fireEvent.focus(screen.getByLabelText("Origin"));
    expect(screen.getAllByRole("option")).toHaveLength(6);
    type("Chic");
    fireEvent.click(
      screen.getByRole("option", { name: "Chicago, Illinois, US" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      name: "Chicago, Illinois, US",
      latitude: 41.8781,
      longitude: -87.6298,
    });
    await advance();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("debounces typing and requires a real selection rather than just text", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetch);
    const onChange = vi.fn();
    render(<PlaceInput label="Origin" value={null} onChange={onChange} />);
    type("Se");
    await advance(100);
    type("Seat");
    await advance(199);
    expect(fetch).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(null);
    await advance(1);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("/api/geocode/?q=seat");
    fireEvent.click(screen.getByRole("option", { name: remotePlace.name }));
    expect(onChange).toHaveBeenLastCalledWith(remotePlace);
  });
  it("aborts old requests and ignores late results even when the provider ignores abort", async () => {
    let finishOld!: (value: unknown) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetch);
    render(<PlaceInput label="Origin" value={null} onChange={vi.fn()} />);
    type("Portland");
    await advance();
    const oldSignal: AbortSignal = fetch.mock.calls[0][1].signal;
    type("Seattle");
    expect(oldSignal.aborted).toBe(true);
    await advance();
    await act(async () => {
      finishOld(
        response([
          { name: "Old Portland result", latitude: 45, longitude: -122 },
        ]),
      );
    });
    expect(screen.queryByText("Old Portland result")).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: remotePlace.name }),
    ).toBeInTheDocument();
  });
  it("reuses normalized cached results immediately across location fields", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetch);
    const onChange = vi.fn();
    const { unmount } = render(
      <PlaceInput label="Origin" value={null} onChange={onChange} />,
    );
    type("Seattle");
    await advance();
    unmount();
    render(<PlaceInput label="Destination" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Destination"), {
      target: { value: "  SEATTLE  " },
    });
    expect(
      screen.getByRole("option", { name: remotePlace.name }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: remotePlace.name }));
    await advance();
    expect(fetch).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(remotePlace);
  });
  it("discards pending results when manual coordinates replace a search", async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const onChange = vi.fn();
    render(<PlaceInput label="Origin" value={null} onChange={onChange} />);
    type("Seattle");
    await advance();
    fireEvent.click(screen.getByText("Enter coordinates manually"));
    fireEvent.change(screen.getByLabelText("Origin latitude"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("Origin longitude"), {
      target: { value: "-90" },
    });
    await act(async () => {
      finish(response());
    });
    expect(screen.queryByText(remotePlace.name)).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      name: "40, -90",
      latitude: 40,
      longitude: -90,
    });
  });
  it("accepts valid coordinates and rejects out-of-range ones", () => {
    const onChange = vi.fn();
    render(<PlaceInput label="Origin" value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("Enter coordinates manually"));
    fireEvent.change(screen.getByLabelText("Origin latitude"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("Origin longitude"), {
      target: { value: "-90" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      name: "40, -90",
      latitude: 40,
      longitude: -90,
    });
    fireEvent.change(screen.getByLabelText("Origin latitude"), {
      target: { value: "99" },
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("status")).toHaveTextContent("Latitude must be");
  });
  it("supports keyboard selection and Escape dismissal without submitting", () => {
    const onChange = vi.fn();
    render(<PlaceInput label="Origin" value={null} onChange={onChange} />);
    const input = screen.getByLabelText("Origin");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[0].id,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Chicago, Illinois, US" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear origin" }));
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("syncs external map pins and example selections into text and coordinates", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetch);
    const onChange = vi.fn();
    const { rerender } = render(
      <PlaceInput label="Origin" value={null} onChange={onChange} />,
    );
    type("Seattle");
    const pin = { name: "Origin pin", latitude: 40.25, longitude: -90.5 };
    rerender(<PlaceInput label="Origin" value={pin} onChange={onChange} />);
    expect(screen.getByLabelText("Origin")).toHaveValue("Origin pin");
    fireEvent.click(screen.getByText("Enter coordinates manually"));
    expect(screen.getByLabelText("Origin latitude")).toHaveValue(40.25);
    expect(screen.getByLabelText("Origin longitude")).toHaveValue(-90.5);
    await advance();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("syncs a previously emitted city object again after an external pin replaces it", () => {
    const onChange = vi.fn();
    const original = SUGGESTED_CITIES[0];
    const { rerender } = render(
      <PlaceInput label="Origin" value={null} onChange={onChange} />,
    );
    fireEvent.focus(screen.getByLabelText("Origin"));
    fireEvent.click(screen.getByRole("option", { name: original.name }));
    expect(onChange).toHaveBeenLastCalledWith(original);
    rerender(
      <PlaceInput label="Origin" value={original} onChange={onChange} />,
    );
    const pin = {
      name: "Origin pin (40.0000, -75.0000)",
      latitude: 40,
      longitude: -75,
    };
    rerender(<PlaceInput label="Origin" value={pin} onChange={onChange} />);
    expect(screen.getByLabelText("Origin")).toHaveValue(pin.name);
    rerender(
      <PlaceInput label="Origin" value={original} onChange={onChange} />,
    );
    expect(screen.getByLabelText("Origin")).toHaveValue(original.name);
    fireEvent.click(screen.getByText("Enter coordinates manually"));
    expect(screen.getByLabelText("Origin latitude")).toHaveValue(
      original.latitude,
    );
    expect(screen.getByLabelText("Origin longitude")).toHaveValue(
      original.longitude,
    );
  });
  it("closes suggestions for map picking and invokes the requested mode", () => {
    const onPickMap = vi.fn();
    render(
      <PlaceInput
        label="Origin"
        value={null}
        onChange={vi.fn()}
        onPickMap={onPickMap}
      />,
    );
    fireEvent.focus(screen.getByLabelText("Origin"));
    fireEvent.click(screen.getByRole("button", { name: "Pick on map" }));
    expect(onPickMap).toHaveBeenCalledOnce();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("shows provider failure and supports retry without inventing locations", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Provider rate limit reached" }),
      })
      .mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetch);
    render(<PlaceInput label="Origin" value={null} onChange={vi.fn()} />);
    type("Seattle");
    await advance();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Provider rate limit reached",
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry city search" }));
    await advance();
    expect(
      screen.getByRole("option", { name: remotePlace.name }),
    ).toBeInTheDocument();
  });
  it("dismisses on blur and cannot reopen from a late response", async () => {
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
    render(<PlaceInput label="Origin" value={null} onChange={vi.fn()} />);
    type("Seattle");
    await advance();
    fireEvent.blur(screen.getByLabelText("Origin"), {
      relatedTarget: document.body,
    });
    await act(async () => {
      finish(response());
    });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
