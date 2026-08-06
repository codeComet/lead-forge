// Static, pre-designed industry templates that bypass AI generation entirely.
//
// Some industries have a hand-built HTML template checked into `site_templates/`
// at the repo root. When a build selects one, we serve that file verbatim and
// only swap the business identity — every occurrence of the template's original
// name becomes the new business name, and the <title> is reduced to that name.
// No model call, no tokens, no per-industry cache. The design stays exactly as
// authored; only the name changes.
//
// The registry is keyed by a stable template `id`. The same ids appear in the
// shared catalog (packages/shared/src/constants.js → STATIC_TEMPLATES) so the
// UI dropdown and this worker agree on what can be selected.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// apps/worker/src/lib → repo root is four levels up.
const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, "..", "..", "..", "..", "site_templates");

// Registry of static templates. `names` lists every form of the original name
// baked into the file, ordered LONGEST-FIRST so a partial variant never clobbers
// a longer one. `match` auto-selects the template from a business_type when no
// template is explicitly chosen in the UI.
const REGISTRY = {
  dentist: {
    file: "dentist.html",
    names: [
      "Zahnarztordination Dr. Aleksandar Joldzic",
      "Dr. Aleksandar Joldzic",
      "Aleksandar Joldzic",
      "Dr. Joldzic",
    ],
    match: /dent/,
  },
  restaurant: {
    file: "restaurant.html",
    // "Margot Lorel" is the chef persona (a person, not the business) — left alone.
    names: ["Maison Lorel"],
    match: /restaurant|bistro|brasserie|dining|eatery|café|cafe|trattoria|osteria/,
  },
  "gym-hallen": {
    file: "gym-template-1-hallen.html",
    names: ["Hallen — Strength & Conditioning", "HALLEN", "Hallen"],
    // Default auto-pick for gyms; the Volt variant is dropdown-only.
    match: /gym|fitness|crossfit|strength/,
  },
  "gym-volt": {
    file: "gym-template-2-volt.html",
    // lowercase "volt" is CSS (vars/classes) — case-sensitive replace leaves it.
    names: ["VOLT Berlin", "VOLT", "Volt"],
    match: null,
  },
};

// Minimal HTML-text escape for the injected business name.
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Validate an explicit template id chosen in the UI. Returns the id if known,
// else null (so the caller falls back to auto-detect or AI generation).
export function staticTemplateById(id) {
  return id && REGISTRY[id] ? id : null;
}

// Auto-detect a static template from a business_type keyword. Returns a template
// id or null. Used only when no template was explicitly selected.
export function staticTemplateFor(business) {
  const type = String(business?.business_type || "").toLowerCase();
  for (const [id, def] of Object.entries(REGISTRY)) {
    if (def.match && def.match.test(type)) return id;
  }
  return null;
}

// Load a static template by id and swap the business identity in EVERYWHERE.
export async function buildStaticSite(id, business) {
  const def = REGISTRY[id];
  if (!def) throw new Error(`unknown static template: ${id}`);

  const raw = await readFile(join(TEMPLATES_DIR, def.file), "utf8");
  const name = esc(business?.name || "The Business");

  let html = raw;
  for (const original of def.names) {
    html = html.replaceAll(original, name);
  }
  // Force a clean, name-only page title (the original had a location tagline).
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${name}</title>`);
  return html;
}
