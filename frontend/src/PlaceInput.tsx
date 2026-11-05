import { useRef, useState } from "react";
import type { Place } from "./types";
export default function PlaceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
}) {
  const [query, setQuery] = useState(value?.name || "");
  const [results, setResults] = useState<Place[]>([]);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  async function search() {
    const id = ++request.current;
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const response = await fetch(
        `/api/geocode/?q=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ||
            "Location search is unavailable. Enter coordinates instead.",
        );
      if (id !== request.current) return;
      setResults(data.results || []);
      if (!data.results?.length)
        setError(
          "No locations found. Try a city and state or enter coordinates.",
        );
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : "Location search failed.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  function coordinates(a: string, b: string) {
    request.current++;
    setBusy(false);
    setResults([]);
    setError("");
    setLat(a);
    setLon(b);
    const latitude = Number(a),
      longitude = Number(b);
    onChange(
      a.trim() &&
        b.trim() &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 85 &&
        Math.abs(longitude) <= 180
        ? {
            name: query.trim() || `${latitude}, ${longitude}`,
            latitude,
            longitude,
          }
        : null,
    );
  }
  return (
    <div className="place-field">
      <label htmlFor={`${label}-search`}>{label}</label>
      <div className={`search-row ${value ? "resolved" : ""}`}>
        <input
          id={`${label}-search`}
          value={query}
          placeholder={
            label === "Origin" ? "City or town" : "Where are you headed?"
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setLat("");
            setLon("");
            setError("");
            onChange(null);
            setResults([]);
            request.current++;
            setBusy(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!busy && query.trim().length >= 2) void search();
            }
          }}
        />
        <button
          type="button"
          aria-label={`Search ${label.toLowerCase()}`}
          disabled={busy || query.trim().length < 2}
          onClick={search}
        >
          {busy ? "…" : value ? "✓" : "↗"}
        </button>
      </div>
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setQuery(p.name);
                  setLat(String(p.latitude));
                  setLon(String(p.longitude));
                  setResults([]);
                  setError("");
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="status" className="field-error">
          {error}
        </p>
      )}
      <button
        className="text-button coordinates-toggle"
        type="button"
        aria-expanded={manual}
        aria-controls={`${label}-coordinates`}
        onClick={() => setManual(!manual)}
      >
        {manual ? "Hide coordinates" : "Enter coordinates manually"}
      </button>
      {manual && (
        <div className="coordinate-fields" id={`${label}-coordinates`}>
          <input
            aria-label={`${label} latitude`}
            type="number"
            step="any"
            min="-85"
            max="85"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => coordinates(e.target.value, lon)}
          />
          <input
            aria-label={`${label} longitude`}
            type="number"
            step="any"
            min="-180"
            max="180"
            placeholder="Longitude"
            value={lon}
            onChange={(e) => coordinates(lat, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
