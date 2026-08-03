// Brand-colour sniffer for the demo generator.
//
// When a business already has a website, we fetch its homepage and guess the
// brand colour so the generated demo can be recoloured to match (instead of the
// default per-business hue rotation). HTML-only, same cheap fetch path as the
// audit — no headless browser, no external CSS fetches.
//
// Heuristic: tally every colour token that appears in the markup, weighting the
// strong signals (a <meta name="theme-color">, CSS custom props named
// primary/brand/accent) far above incidental ones, drop near-neutral colours
// (greys / near-black / near-white), and return the highest-scoring hex.

import { fetchSite } from "../audit/website.js";

// ── colour parsing ───────────────────────────────────────────
function clampByte(n) {
  return Math.min(255, Math.max(0, Math.round(n)));
}
function toHex(r, g, b) {
  const h = (n) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Parse a single colour token (#rgb, #rrggbb, rgb()/rgba()) → #rrggbb or null.
function parseColor(token) {
  const t = String(token || "").trim().toLowerCase();
  let m = t.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const [a, b, c] = m[1];
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  m = t.match(/^#([0-9a-f]{6})$/);
  if (m) return `#${m[1]}`;
  m = t.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return toHex(+m[1], +m[2], +m[3]);
  return null;
}

function rgbToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  const d = max - min;
  if (d !== 0) s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return [s, l];
}

// A usable brand colour is chromatic and mid-range — not a grey, not near-white
// or near-black (those are backgrounds/text, never the brand).
function isBrandCandidate(hex) {
  const [s, l] = rgbToHsl(hex);
  return s >= 0.18 && l >= 0.12 && l <= 0.88;
}

/**
 * Fetch a homepage and guess its brand colour.
 * @returns {string|null} a #rrggbb hex, or null if nothing convincing was found.
 */
export async function extractBrandColor(rawUrl) {
  if (!rawUrl) return null;
  let site;
  try {
    site = await fetchSite(rawUrl);
  } catch {
    return null;
  }
  if (!site?.ok || !site.html) return null;
  const html = site.html;

  const scores = new Map();
  const add = (token, weight) => {
    const hex = parseColor(token);
    if (!hex || !isBrandCandidate(hex)) return;
    scores.set(hex, (scores.get(hex) || 0) + weight);
  };

  // Strongest signal: an explicit theme colour.
  const theme = html.match(
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
  );
  if (theme) add(theme[1], 14);

  // CSS custom properties whose name reads like a brand/primary/accent colour.
  for (const m of html.matchAll(
    /--[\w-]*(?:primary|brand|accent|main|theme)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))/gi,
  )) {
    add(m[1], 6);
  }

  // Every remaining colour token in the markup / inline <style> — one point each,
  // so the most-repeated chromatic colour wins by sheer prevalence.
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/gi)) {
    add(m[0], 1);
  }

  if (scores.size === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const [hex, score] of scores) {
    if (score > bestScore) {
      best = hex;
      bestScore = score;
    }
  }
  return best;
}
