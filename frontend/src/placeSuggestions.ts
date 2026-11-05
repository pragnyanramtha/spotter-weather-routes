import type { Place } from "./types";

// Real city-center coordinates, offered only as starting points. Routes and
// weather are always requested from providers after Generate routes is pressed.
export const SUGGESTED_CITIES: Place[] = [
  { name: "Chicago, Illinois, US", latitude: 41.8781, longitude: -87.6298 },
  { name: "Detroit, Michigan, US", latitude: 42.3314, longitude: -83.0458 },
  { name: "Dallas, Texas, US", latitude: 32.7767, longitude: -96.797 },
  { name: "Austin, Texas, US", latitude: 30.2672, longitude: -97.7431 },
  { name: "New York, New York, US", latitude: 40.7128, longitude: -74.006 },
  { name: "Boston, Massachusetts, US", latitude: 42.3601, longitude: -71.0589 },
];

export const EXAMPLE_TRIPS = [
  {
    label: "Chicago → Detroit",
    origin: SUGGESTED_CITIES[0],
    destination: SUGGESTED_CITIES[1],
  },
  {
    label: "Dallas → Austin",
    origin: SUGGESTED_CITIES[2],
    destination: SUGGESTED_CITIES[3],
  },
  {
    label: "New York → Boston",
    origin: SUGGESTED_CITIES[4],
    destination: SUGGESTED_CITIES[5],
  },
];
