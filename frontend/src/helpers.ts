import type { Risk, Route } from "./types";
export const COLORS = ["#258978", "#b2a92f", "#e1973f", "#d56349", "#923e63"];
export const LABELS = ["Low", "Moderate", "High", "Severe", "No travel"];
export const riskColor = (risk: Risk | null | undefined) =>
  risk && Number.isInteger(risk.level) && risk.level >= 0 && risk.level <= 4
    ? COLORS[risk.level]
    : "#8a969d";
export function localInputDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
export function departureISO(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error("Choose a valid departure date and time.");
  return date.toISOString();
}
export function duration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function canRecommend(route: Route) {
  return (
    route.summary.eligible &&
    !(route.summary.risk_miles.no_travel > 0) &&
    !(route.summary.risk_miles.unknown > 0) &&
    route.checkpoints.length > 0 &&
    route.checkpoints.every(
      (c) =>
        c.risk &&
        Number.isInteger(c.risk.level) &&
        c.risk.level >= 0 &&
        c.risk.level < 4,
    )
  );
}
export function milesBetween(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dlat = (b[1] - a[1]) * rad,
    dlon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
// Split the actual route polyline, not straight-line connections between checkpoints.
export function routeSegments(route: Route) {
  if (route.segments)
    return route.segments.map((s) => ({
      positions: s.coordinates.map(
        ([lon, lat]) => [lat, lon] as [number, number],
      ),
      color: riskColor(s.risk),
    }));
  return [
    {
      positions: route.geometry.map(
        ([lon, lat]) => [lat, lon] as [number, number],
      ),
      color: riskColor(null),
    },
  ];
}
