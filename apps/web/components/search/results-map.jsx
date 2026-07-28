"use client";

import * as React from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin } from "lucide-react";

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

export function ResultsMap({ businesses = [], selectedId, onSelect }) {
  const ref = React.useRef(null);
  const mapRef = React.useRef(null);
  const markersRef = React.useRef([]);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // Load the SDK + create the map once.
  React.useEffect(() => {
    if (!BROWSER_KEY) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    const loader = new Loader({ apiKey: BROWSER_KEY, version: "weekly" });
    loader
      .importLibrary("maps")
      .then(({ Map }) => {
        if (cancelled || !ref.current) return;
        mapRef.current = new Map(ref.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          disableDefaultUI: true,
          zoomControl: true,
          mapId: "DEMO_MAP_ID",
        });
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync markers to the current businesses.
  React.useEffect(() => {
    if (!ready || !mapRef.current || !window.google) return;
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    const pts = businesses.filter((b) => b.lat != null && b.lng != null);
    if (pts.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    for (const b of pts) {
      const marker = new window.google.maps.Marker({
        position: { lat: b.lat, lng: b.lng },
        map: mapRef.current,
        title: b.name,
      });
      marker.addListener("click", () => onSelect?.(b.id));
      markersRef.current.push(marker);
      bounds.extend({ lat: b.lat, lng: b.lng });
    }
    mapRef.current.fitBounds(bounds, 60);
    if (pts.length === 1) mapRef.current.setZoom(14);
  }, [ready, businesses, onSelect]);

  // Pan to the selected business.
  React.useEffect(() => {
    if (!ready || !mapRef.current || !selectedId) return;
    const b = businesses.find((x) => x.id === selectedId);
    if (b?.lat != null) {
      mapRef.current.panTo({ lat: b.lat, lng: b.lng });
      mapRef.current.setZoom(15);
    }
  }, [selectedId, ready, businesses]);

  if (failed) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-center text-sm text-muted-foreground">
        <MapPin className="h-6 w-6" />
        <p>Map unavailable.</p>
        <p className="text-xs">Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY to enable the map.</p>
      </div>
    );
  }

  return <div ref={ref} className="h-full min-h-[300px] w-full overflow-hidden rounded-xl border border-border" />;
}
