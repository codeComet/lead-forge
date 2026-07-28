import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// PostgREST embeds a to-one relation (unique FK, e.g. audits/leads keyed by a
// unique business_id) as an object, but a to-many as an array. Normalize both
// to a single row (or null) so callers don't have to guess.
export function one(rel) {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

export function formatNumber(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function formatCurrency(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
