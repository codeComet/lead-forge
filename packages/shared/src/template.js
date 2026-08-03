// Fill a reusable, industry-themed website template for a specific business.
//
// The AI generates a template ONCE per industry (see prompts.js → template
// mode). It contains placeholder tokens for the per-business text and a small,
// fixed CSS-variable palette. This module turns that template into a concrete
// demo site purely in code — no model call:
//   1. Replace {{BUSINESS_NAME}} / {{CITY}} / {{PHONE}} / {{RATING}} tokens.
//   2. Rotate the brand hues in :root by a per-business offset, so two shops in
//      the same industry don't render in identical colours. Only hue changes —
//      lightness/saturation are preserved, so text/overlay contrast is safe.

// Minimal HTML-text escape for values injected into markup + attributes.
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Small deterministic string hash (stable across runs — no Math.random).
function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// Curated hue offsets (degrees). Includes 0 so the template's origin business
// can render exactly as designed; others shift to a distinct-but-related hue.
const HUE_OFFSETS = [0, 18, -18, 32, -32, 48];

function offsetFor(seed) {
  return HUE_OFFSETS[hash(seed) % HUE_OFFSETS.length];
}

// ── hex ⇄ hsl, hue rotation ──────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  const to = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function rotateHex(hex, deg) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h + deg, s, l);
  return rgbToHex(nr, ng, nb);
}

// Hue (degrees) of a #rrggbb colour, or null if unparseable.
function hueOf(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
  if (!m) return null;
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b)[0];
}

// The template's own --brand hue (the origin of the palette we're rotating).
function currentBrandHue(html) {
  const m = html.match(/--brand\s*:\s*(#[0-9a-fA-F]{6})\b/i);
  return m ? hueOf(m[1]) : null;
}

// Rotate only the brand/accent hues inside :root. Neutral vars (--ink/--bg/
// --surface) are left alone so contrast against text/overlays is preserved.
// No-ops safely if the palette can't be parsed (site still renders).
function rotateBrandHues(html, deg) {
  if (!deg) return html;
  try {
    return html.replace(/(:root\s*\{)([\s\S]*?)(\})/i, (_m, open, body, close) => {
      const rotated = body.replace(
        /(--(?:brand-2|brand|accent)\s*:\s*)(#[0-9a-fA-F]{6})\b/g,
        (_mm, prefix, hex) => prefix + rotateHex(hex, deg),
      );
      return open + rotated + close;
    });
  } catch {
    return html;
  }
}

// Build the {{HOURS}} replacement: Places gives opening_hours as an array of
// weekday strings ("Monday: 9 AM – 5 PM"). Escape each line (external data) and
// join with <br> so the template's single wrapper renders one line per day.
// Falls back to a neutral prompt when a business has no published hours.
function formatHours(openingHours) {
  const lines = Array.isArray(openingHours)
    ? openingHours.map((l) => String(l).trim()).filter(Boolean)
    : [];
  if (lines.length === 0) return "Open by appointment — call for hours";
  return lines.map(esc).join("<br>");
}

/**
 * Turn an industry template into a concrete demo site for one business.
 * Pure function — no side effects, no model calls.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.brandColor] A #rrggbb brand colour sniffed from the
 *   business's existing website. When given, the whole brand palette is rotated
 *   so its --brand lands on this colour's hue (relationships between brand/
 *   brand-2/accent and all lightness/saturation are preserved, keeping contrast
 *   safe). When absent, a per-business hue offset is used instead so same-
 *   industry demos don't look identical.
 */
export function fillTemplate(templateHtml, business, opts = {}) {
  if (!templateHtml) return templateHtml;
  const name = business?.name || "The Business";
  const city = business?.city || business?.address || "your area";
  const phone = business?.phone || "";
  const rating = business?.rating != null ? String(business.rating) : "5.0";
  const address = business?.address || city;

  let html = templateHtml
    .replaceAll("{{BUSINESS_NAME}}", esc(name))
    .replaceAll("{{CITY}}", esc(city))
    .replaceAll("{{PHONE}}", esc(phone))
    .replaceAll("{{RATING}}", esc(rating))
    .replaceAll("{{ADDRESS}}", esc(address))
    // HOURS is intentionally NOT esc()'d here — formatHours already escapes each
    // day line and injects the <br> separators the layout needs.
    .replaceAll("{{HOURS}}", formatHours(business?.opening_hours));

  // Match the business's real brand hue when we sniffed one; otherwise spread
  // same-industry demos apart with a deterministic per-business offset.
  let deg = null;
  const targetHue = hueOf(opts?.brandColor);
  if (targetHue != null) {
    const currentHue = currentBrandHue(html);
    if (currentHue != null) deg = Math.round(targetHue - currentHue);
  }
  if (deg == null) deg = offsetFor(business?.id || name);

  return rotateBrandHues(html, deg);
}
