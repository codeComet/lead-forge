"use client";

import { one } from "@/lib/utils";

const selectCls =
  "h-8 rounded-lg border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LeadFilters({ value, onChange, count, total }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {count} of {total} shown
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select className={selectCls} value={value.website} onChange={set("website")}>
          <option value="any">Any website</option>
          <option value="none">No website</option>
          <option value="has">Has website</option>
        </select>
        <select className={selectCls} value={value.score} onChange={set("score")}>
          <option value="any">Any score</option>
          <option value="green">Green (hot)</option>
          <option value="orange">Orange</option>
          <option value="red">Red</option>
        </select>
        <select className={selectCls} value={value.rating} onChange={set("rating")}>
          <option value="any">Any rating</option>
          <option value="lt4">Rating &lt; 4.0</option>
          <option value="lt3">Rating &lt; 3.0</option>
        </select>
        <select className={selectCls} value={value.audit} onChange={set("audit")}>
          <option value="any">Any audit</option>
          <option value="done">Audited</option>
          <option value="pending">Not audited</option>
        </select>
      </div>
    </div>
  );
}

export const DEFAULT_FILTERS = { website: "any", score: "any", rating: "any", audit: "any" };

export function applyFilters(list, f) {
  return list.filter((b) => {
    const audit = one(b.audits);
    const lead = one(b.leads);

    if (f.website === "none" && b.website) return false;
    if (f.website === "has" && !b.website) return false;

    if (f.score !== "any" && lead?.color !== f.score) return false;

    if (f.rating === "lt4" && !(b.rating != null && b.rating < 4.0)) return false;
    if (f.rating === "lt3" && !(b.rating != null && b.rating < 3.0)) return false;

    if (f.audit === "done" && audit?.status !== "done") return false;
    if (f.audit === "pending" && audit?.status === "done") return false;

    return true;
  });
}
