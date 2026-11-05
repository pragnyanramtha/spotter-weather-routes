import { afterEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import PlaceInput from "./PlaceInput";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("location input", () => {
  it("discards pending search results when manual coordinates replace the search", async () => {
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
    const onChange = vi.fn();
    render(<PlaceInput label="Origin" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Chicago" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search origin" }));
    fireEvent.click(screen.getByText("Enter coordinates manually"));
    fireEvent.change(screen.getByLabelText("Origin latitude"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("Origin longitude"), {
      target: { value: "-90" },
    });
    await act(async () => {
      finish({
        ok: true,
        json: async () => ({
          results: [{ name: "Old result", latitude: 41, longitude: -87 }],
        }),
      });
    });
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      name: "Chicago",
      latitude: 40,
      longitude: -90,
    });
  });
  it("accepts valid manual coordinates and rejects out-of-range coordinates", () => {
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
  });
  it("requires an actual search selection", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { name: "Chicago, IL", latitude: 41.88, longitude: -87.63 },
          ],
        }),
      }),
    );
    render(<PlaceInput label="Origin" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Chicago" },
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Search origin" }));
    fireEvent.click(await screen.findByText("Chicago, IL"));
    expect(onChange).toHaveBeenLastCalledWith({
      name: "Chicago, IL",
      latitude: 41.88,
      longitude: -87.63,
    });
  });
  it("shows provider errors without making up places", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Provider rate limit reached" }),
      }),
    );
    render(<PlaceInput label="Origin" value={null} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Chicago" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search origin" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Provider rate limit reached",
      ),
    );
  });
});
