import { useEffect, useId, useRef, useState } from "react";
import { Check, MapPin, Search, X } from "lucide-react";
import { SUGGESTED_CITIES } from "./placeSuggestions";
import { usePlaceSearch } from "./usePlaceSearch";
import type { Place } from "./types";

export default function PlaceInput({
  label,
  value,
  onChange,
  onPickMap,
  picking = false,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  onPickMap?: () => void;
  picking?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(value?.name || "");
  const [manual, setManual] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [lat, setLat] = useState(value ? String(value.latitude) : "");
  const [lon, setLon] = useState(value ? String(value.longitude) : "");
  const lastEmitted = useRef<Place | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = usePlaceSearch(query, open && !manual && !value);
  const local = SUGGESTED_CITIES.filter(
    (place) =>
      !query.trim() ||
      place.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const hasRemoteResults =
    search.complete && !search.error && search.results.length > 0;
  const options = hasRemoteResults ? search.results : local;
  const showOptions = open && !manual && !value;

  // Pins and example trips are external selections, and must update both views.
  // Locally emitted nulls must not erase the text the person is still typing.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    setQuery(value?.name || "");
    setLat(value ? String(value.latitude) : "");
    setLon(value ? String(value.longitude) : "");
    setOpen(false);
    setActive(-1);
  }, [value]);
  useEffect(() => {
    setActive(-1);
  }, [query, search.results]);

  function emit(place: Place | null) {
    lastEmitted.current = place;
    onChange(place);
  }
  function choose(place: Place) {
    setQuery(place.name);
    setLat(String(place.latitude));
    setLon(String(place.longitude));
    setOpen(false);
    setActive(-1);
    emit(place);
  }
  function coordinates(a: string, b: string) {
    setOpen(false);
    setLat(a);
    setLon(b);
    const latitude = Number(a),
      longitude = Number(b);
    const valid =
      a.trim() &&
      b.trim() &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 85 &&
      Math.abs(longitude) <= 180;
    const place = valid
      ? { name: `${latitude}, ${longitude}`, latitude, longitude }
      : null;
    if (place) setQuery(place.name);
    emit(place);
  }
  const invalidCoordinates =
    manual &&
    !!lat &&
    !!lon &&
    (!Number.isFinite(Number(lat)) ||
      !Number.isFinite(Number(lon)) ||
      Math.abs(Number(lat)) > 85 ||
      Math.abs(Number(lon)) > 180);

  return (
    <div
      className="place-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={`${id}-search`}>{label}</label>
      <div className={`search-row ${value ? "resolved" : ""}`}>
        <span className="search-icon" aria-hidden="true">
          {value ? <Check size={14} /> : <Search size={14} />}
        </span>
        <input
          id={`${id}-search`}
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showOptions && options.length > 0}
          aria-controls={showOptions ? `${id}-results` : undefined}
          aria-activedescendant={
            showOptions && active >= 0 && options[active]
              ? `${id}-option-${active}`
              : undefined
          }
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          value={query}
          placeholder={
            label === "Origin" ? "From which city?" : "To which city?"
          }
          onFocus={() => {
            if (!value) setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setLat("");
            setLon("");
            setManual(false);
            setOpen(true);
            setActive(-1);
            emit(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (options.length)
                setActive((previous) =>
                  event.key === "ArrowDown"
                    ? (previous + 1) % options.length
                    : previous <= 0
                      ? options.length - 1
                      : previous - 1,
                );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (showOptions && active >= 0 && options[active])
                choose(options[active]);
              else if (!value) setOpen(true);
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              setQuery("");
              setLat("");
              setLon("");
              setManual(false);
              setOpen(true);
              setActive(-1);
              emit(null);
              inputRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showOptions && (
        <div className="suggestion-panel">
          <div className="suggestion-label">
            {hasRemoteResults
              ? "City search results"
              : query.trim()
                ? "Quick city suggestions"
                : "Suggested cities"}
          </div>
          <ul
            id={`${id}-results`}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="search-results"
          >
            {options.map((place, index) => (
              <li key={`${place.name}-${place.latitude}-${place.longitude}`}>
                <button
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active === index}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(place)}
                >
                  <MapPin size={13} aria-hidden="true" />
                  <span>{place.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {search.busy && (
            <p className="search-status" role="status">
              <span className="search-spinner" />
              Searching cities…
            </p>
          )}
          {search.complete && !search.error && !options.length && (
            <p className="search-status" role="status">
              No cities found. Try a city name, a map pin, or coordinates.
            </p>
          )}
          {search.error && (
            <p className="field-error" role="status">
              {search.error}{" "}
              <button
                type="button"
                className="text-button"
                onClick={search.retry}
              >
                Retry city search
              </button>
            </p>
          )}
          {query.trim().length === 1 && (
            <p className="search-status">
              Type one more letter to search cities.
            </p>
          )}
        </div>
      )}
      <p className="location-hint" id={`${id}-hint`}>
        {value
          ? `${value.latitude.toFixed(4)}, ${value.longitude.toFixed(4)}`
          : "Cities & towns. Use a pin for an exact spot."}
      </p>
      <div className="place-actions">
        {onPickMap && (
          <button
            type="button"
            className={`pick-map-button ${picking ? "active" : ""}`}
            aria-pressed={picking}
            onClick={() => {
              setOpen(false);
              onPickMap();
            }}
          >
            <MapPin size={12} />
            {picking ? "Cancel pin" : "Pick on map"}
          </button>
        )}
        <button
          className="text-button coordinates-toggle"
          type="button"
          aria-expanded={manual}
          aria-controls={`${id}-coordinates`}
          onClick={() => {
            setManual(!manual);
            setOpen(false);
          }}
        >
          {manual ? "Hide coordinates" : "Enter coordinates manually"}
        </button>
      </div>
      {manual && (
        <div className="coordinate-fields" id={`${id}-coordinates`}>
          <input
            aria-label={`${label} latitude`}
            type="number"
            step="any"
            min="-85"
            max="85"
            placeholder="Latitude"
            value={lat}
            onChange={(event) => coordinates(event.target.value, lon)}
          />
          <input
            aria-label={`${label} longitude`}
            type="number"
            step="any"
            min="-180"
            max="180"
            placeholder="Longitude"
            value={lon}
            onChange={(event) => coordinates(lat, event.target.value)}
          />
        </div>
      )}
      {invalidCoordinates && (
        <p className="field-error" role="status">
          Latitude must be −85 to 85; longitude −180 to 180.
        </p>
      )}
    </div>
  );
}
