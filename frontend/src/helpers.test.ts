import { describe, it, expect } from "vitest";
import {
  canRecommend,
  departureISO,
  duration,
  localInputDate,
  riskColor,
  routeSegments,
} from "./helpers";
import type { Route } from "./types";
const route = {
  id: "1",
  geometry: [
    [-90, 40],
    [-89, 41],
  ],
  checkpoints: [{ risk: { level: 0, label: "Low", reasons: [] } }],
  summary: {
    eligible: true,
    risk_miles: { low: 100, no_travel: 0, unknown: 0 },
  },
} as unknown as Route;
describe("safety-aware presentation", () => {
  it("treats malformed risk levels as unavailable", () => {
    for (const level of [-1, 0.5, 5, Number.NaN]) {
      const risk = { level, label: "Invalid", reasons: [] };
      expect(riskColor(risk)).toBe("#8a969d");
      expect(
        canRecommend({
          ...route,
          checkpoints: [{ ...route.checkpoints[0], risk }],
        }),
      ).toBe(false);
    }
  });
  it("never styles unavailable weather as low risk", () =>
    expect(riskColor(null)).toBe("#8a969d"));
  it("excludes No Travel and unknown from recommendations", () => {
    expect(canRecommend(route)).toBe(true);
    expect(
      canRecommend({
        ...route,
        summary: { ...route.summary, risk_miles: { unknown: 1 } },
      }),
    ).toBe(false);
    expect(
      canRecommend({
        ...route,
        summary: { ...route.summary, risk_miles: { no_travel: 1 } },
      }),
    ).toBe(false);
    expect(
      canRecommend({
        ...route,
        checkpoints: [{ ...route.checkpoints[0], risk: null }],
      }),
    ).toBe(false);
  });
  it("uses backend road-following conservative segment risk", () => {
    const segments = routeSegments({
      ...route,
      segments: [
        {
          coordinates: [
            [-90, 40],
            [-89.5, 40.7],
            [-89, 41],
          ],
          distance_miles: 100,
          risk: null,
        },
      ],
    });
    expect(segments[0].positions).toEqual([
      [40, -90],
      [40.7, -89.5],
      [41, -89],
    ]);
    expect(segments[0].color).toBe("#8a969d");
  });
  it("converts a local datetime into an explicit UTC instant", () => {
    const value = "2026-11-05T12:30";
    expect(departureISO(value)).toBe(new Date(value).toISOString());
    expect(departureISO(value)).toMatch(/Z$/);
    expect(localInputDate(new Date(value))).toBe(value);
    expect(() => departureISO("bad")).toThrow();
  });
  it("rounds time without displaying 60 minutes", () =>
    expect(duration(7199)).toBe("2h 0m"));
});
