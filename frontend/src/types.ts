export type Place = { name: string; latitude: number; longitude: number };
export type Risk = { level: number; label: string; reasons: string[] };
export type Weather = {
  wind_mph: number | null;
  rain_in_hr: number | null;
  snow_in_hr: number | null;
  time?: string;
  risk?: Risk | null;
};
export type Checkpoint = Place & {
  distance_miles: number;
  eta: string;
  risk: Risk | null;
  weather: Weather | null;
  segment_miles: number;
};
export type Route = {
  id: string;
  name: string;
  distance_miles: number;
  duration_seconds: number;
  geometry: [number, number][];
  segments?: {
    coordinates: [number, number][];
    distance_miles: number;
    risk: Risk | null;
  }[];
  checkpoints: Checkpoint[];
  summary: {
    risk_miles: Record<string, number>;
    average_risk: number | null;
    eligible: boolean;
  };
  warnings: string[];
};
export type Plan = {
  routes: Route[];
  recommended_route_id: string | null;
  recommendation_reason: string;
  warnings: string[];
  corridor: {
    base_time: string;
    points: {
      latitude: number;
      longitude: number;
      hours: (Weather | null)[];
    }[];
  };
  providers: { routing: string; weather: string; geocoding: string };
  generated_at: string;
};
