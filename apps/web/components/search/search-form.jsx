"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/components/search/place-autocomplete";

const RADIUS_OPTIONS = [
  { label: "1 km", value: 1000 },
  { label: "5 km", value: 5000 },
  { label: "10 km", value: 10000 },
  { label: "25 km", value: 25000 },
  { label: "50 km", value: 50000 },
];

const PRESETS = [
  "Dentist", "Restaurant", "Law Firm", "Roofing Company",
  "Gym", "Hotel", "Hair Salon", "Construction Company",
];

export function SearchForm({ onSearch, loading }) {
  const [form, setForm] = React.useState({
    businessType: "",
    city: "",
    country: "",
    radius: 5000,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setField = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e) {
    e.preventDefault();
    if (!form.businessType.trim() || loading) return;
    onSearch({ ...form, radius: Number(form.radius) });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="businessType">Business type</Label>
          <Input
            id="businessType"
            placeholder="e.g. Dentist"
            value={form.businessType}
            onChange={set("businessType")}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <PlaceAutocomplete id="city" kind="(cities)" placeholder="Manchester" value={form.city} onChange={setField("city")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <PlaceAutocomplete id="country" kind="country" placeholder="United Kingdom" value={form.country} onChange={setField("country")} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Label htmlFor="radius">Radius</Label>
          <select
            id="radius"
            value={form.radius}
            onChange={set("radius")}
            className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" size="lg" disabled={loading || !form.businessType.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Searching…" : "Search businesses"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setForm((f) => ({ ...f, businessType: p }))}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            {p}
          </button>
        ))}
      </div>
    </form>
  );
}
