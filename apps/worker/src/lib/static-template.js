// Static, pre-designed industry templates that bypass AI generation entirely.
//
// Some industries have a hand-built HTML template checked into `site_templates/`
// at the repo root. When a business matches one, we serve that file verbatim and
// only swap the business identity (page <title> + header brand name) — no model
// call, no tokens, no per-industry cache. The design stays byte-for-byte as
// designed; only the name changes.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// apps/worker/src/lib → repo root is four levels up.
const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, "..", "..", "..", "..", "site_templates");

// Minimal HTML-text escape for the injected business name.
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Which static template (if any) covers this business. Returns a template file
// name or null. Dentists match on any "dent…" business type (Dentist, Dental
// Clinic, Dental Practice, …).
export function staticTemplateFor(business) {
  const type = String(business?.business_type || "").toLowerCase();
  if (/dent/.test(type)) return "dentist.html";
  return null;
}

// The original business name (and its variants) baked into each static template,
// ordered LONGEST-FIRST so a partial variant never clobbers a longer one.
const TEMPLATE_NAMES = {
  "dentist.html": [
    "Zahnarztordination Dr. Aleksandar Joldzic",
    "Dr. Aleksandar Joldzic",
    "Aleksandar Joldzic",
    "Dr. Joldzic",
  ],
};

// Load a static template and swap the business identity in EVERYWHERE — every
// occurrence of the template's original name (header, about, footer, copyright,
// JSON-LD, meta) becomes the new business name. The <title> is then reduced to
// just the business name. Everything else stays exactly as authored.
export async function buildStaticSite(fileName, business) {
  const raw = await readFile(join(TEMPLATES_DIR, fileName), "utf8");
  const name = esc(business?.name || "Dental Practice");

  let html = raw;
  for (const original of TEMPLATE_NAMES[fileName] || []) {
    html = html.replaceAll(original, name);
  }
  // Force a clean, name-only page title (the original had a location tagline).
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${name}</title>`);
  return html;
}
