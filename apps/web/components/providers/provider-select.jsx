"use client";

import * as React from "react";
import { toast } from "sonner";

// Dropdown of AI providers for website generation. Only providers with an API
// key configured are selectable; the rest are shown disabled so it's clear WHY
// they're unavailable. Selecting persists the choice to the org and calls
// onChange(value) with the selected id ("" = auto → first available key).
export function ProviderSelect({ onChange, className }) {
  const [options, setOptions] = React.useState([]);
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/providers")
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        setOptions(json.options ?? []);
        const sel = json.selected ?? "";
        setValue(sel);
        onChange?.(sel);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(next) {
    const prev = value;
    setValue(next);
    onChange?.(next);
    setSaving(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: next || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
    } catch (e) {
      setValue(prev);
      onChange?.(prev);
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const anyAvailable = options.some((o) => o.available);

  return (
    <select
      value={value}
      disabled={loading || saving || !anyAvailable}
      onChange={(e) => save(e.target.value)}
      className={
        className ||
        "h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      }
    >
      {!anyAvailable && !loading && <option value="">No AI provider configured</option>}
      {anyAvailable && <option value="">Auto (first available)</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={!o.available}>
          {o.label}
          {o.available ? "" : " (no API key)"}
        </option>
      ))}
    </select>
  );
}
