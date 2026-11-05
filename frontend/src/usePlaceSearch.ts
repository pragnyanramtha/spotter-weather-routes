import { useEffect, useRef, useState } from "react";
import type { Place } from "./types";

export const SEARCH_DEBOUNCE_MS = 200;
const CACHE_LIFETIME_MS = 10 * 60 * 1000;
const EMPTY_RESULTS: Place[] = [];
const cache = new Map<string, { places: Place[]; time: number }>();
export function clearPlaceSearchCache() {
  cache.clear();
}
function cachedPlaces(key: string) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.time > CACHE_LIFETIME_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.places;
}
function isPlace(value: unknown): value is Place {
  const place = value as Place | null;
  return (
    !!place &&
    typeof place.name === "string" &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    Math.abs(place.latitude) <= 85 &&
    Math.abs(place.longitude) <= 180
  );
}
export function usePlaceSearch(query: string, enabled: boolean) {
  const key = query.trim().replace(/\s+/g, " ").toLowerCase();
  const [state, setState] = useState<{
    key: string;
    results: Place[];
    busy: boolean;
    error: string;
    complete: boolean;
  }>({ key: "", results: [], busy: false, error: "", complete: false });
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    const id = ++sequence.current;
    if (!enabled || key.length < 2) return;
    const cached = cachedPlaces(key);
    if (cached !== undefined) {
      setState({
        key,
        results: cached,
        busy: false,
        error: "",
        complete: true,
      });
      return;
    }
    const controller = new AbortController();
    setState({ key, results: [], busy: true, error: "", complete: false });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/geocode/?q=${encodeURIComponent(key)}`,
          {
            signal: controller.signal,
          },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ||
              "City search is unavailable. Try a map pin or coordinates.",
          );
        if (!Array.isArray(data.results))
          throw new Error(
            "City search returned an invalid response. Try a map pin instead.",
          );
        // Abort alone is insufficient when a provider or test ignores its signal.
        if (controller.signal.aborted || id !== sequence.current) return;
        const results = data.results.filter(isPlace);
        cache.set(key, { places: results, time: Date.now() });
        if (cache.size > 50) cache.delete(cache.keys().next().value!);
        setState({ key, results, busy: false, error: "", complete: true });
      } catch (error) {
        if (controller.signal.aborted || id !== sequence.current) return;
        setState({
          key,
          results: [],
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "City search failed. Try a map pin or coordinates.",
          complete: true,
        });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, enabled, retry]);

  // Never flash results from the previous query while the next effect starts.
  const current = enabled && key.length >= 2 && state.key === key;
  return {
    results: current ? state.results : EMPTY_RESULTS,
    busy: current && state.busy,
    error: current ? state.error : "",
    complete: current && state.complete,
    retry: () => setRetry((n) => n + 1),
  };
}
