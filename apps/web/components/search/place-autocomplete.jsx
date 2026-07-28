"use client";

import * as React from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

// Lazily load the Places library once for the whole app.
let placesPromise;
function loadPlaces() {
  if (!BROWSER_KEY) return Promise.reject(new Error("no key"));
  if (!placesPromise) {
    placesPromise = new Loader({ apiKey: BROWSER_KEY, version: "weekly" }).importLibrary("places");
  }
  return placesPromise;
}

/**
 * Controlled text input with Google Places autocomplete.
 * @param {"(cities)"|"country"} kind — which place types to suggest.
 */
export function PlaceAutocomplete({ value, onChange, placeholder, id, kind = "(cities)" }) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const libRef = React.useRef(null);
  const tokenRef = React.useRef(null);
  const debounceRef = React.useRef(null);
  const boxRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    loadPlaces()
      .then((lib) => {
        if (cancelled) return;
        libRef.current = lib;
        tokenRef.current = new lib.AutocompleteSessionToken();
      })
      .catch(() => {}); // no key / load failure → plain input, still typeable
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function fetchSuggestions(input) {
    const lib = libRef.current;
    if (!lib || !input.trim()) {
      setSuggestions([]);
      return;
    }
    lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      includedPrimaryTypes: [kind],
      sessionToken: tokenRef.current,
    })
      .then(({ suggestions: s }) => {
        setSuggestions(
          (s ?? []).map((item) => {
            const p = item.placePrediction;
            return { main: p.mainText?.text ?? p.text?.text ?? "", full: p.text?.text ?? "" };
          }),
        );
        setOpen(true);
        setActive(-1);
      })
      .catch(() => setSuggestions([]));
  }

  function handleChange(e) {
    const v = e.target.value;
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  }

  function choose(s) {
    onChange(s.main);
    setOpen(false);
    setSuggestions([]);
    // Start a fresh session after a selection (billing best practice).
    if (libRef.current) tokenRef.current = new libRef.current.AutocompleteSessionToken();
  }

  function onKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {suggestions.map((s, i) => (
            <li
              key={`${s.full}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-2 text-sm",
                active === i ? "bg-accent text-accent-foreground" : "text-foreground",
              )}
            >
              <span className="font-medium">{s.main}</span>
              {s.full && s.full !== s.main && (
                <span className="ml-1 text-xs text-muted-foreground">{s.full}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
