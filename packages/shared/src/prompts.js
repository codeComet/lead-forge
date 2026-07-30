// Claude prompt builders. Pure string/schema construction — no SDK calls here
// (the worker owns the Anthropic client). Keeping these separate makes the
// prompts easy to review and tweak without touching transport code.

/** Compact, token-friendly digest of a business + audit for prompt context. */
function digest(business, audit) {
  const w = audit?.website ?? {};
  const seo = audit?.seo ?? {};
  const tech = audit?.tech ?? {};
  const gbp = audit?.gbp ?? {};
  const social = audit?.social ?? {};
  return JSON.stringify(
    {
      name: business?.name,
      industry: business?.business_type,
      city: business?.city,
      rating: gbp.rating ?? business?.rating,
      reviews: gbp.reviews ?? business?.reviews,
      website: business?.website || null,
      audit: {
        hasWebsite: w.exists,
        https: w.https,
        mobileFriendly: w.mobileFriendly,
        responsive: w.responsive,
        fast: w.fast,
        modernDesign: w.modern,
        contactForm: w.contactForm,
        trustIndicators: w.trustIndicators,
        loadTimeMs: w.loadTimeMs,
        seo: {
          metaTitle: seo.metaTitle,
          metaDescription: seo.metaDescription,
          h1: seo.h1,
          missingAltCount: seo.missingAltCount,
          sitemap: seo.sitemap,
          robots: seo.robots,
          pageSpeedScore: seo.pageSpeedScore,
          seoScore: seo.seoScore,
          accessibilityScore: seo.accessibilityScore,
        },
        tech: { stack: tech.stack, age: tech.age, obsolete: tech.obsolete },
        social,
      },
    },
    null,
    0,
  );
}

// ─── AI Insight ──────────────────────────────────────────────
// We force structured output via a tool so the result is machine-usable.
export const INSIGHT_TOOL = {
  name: "record_insight",
  description: "Record the structured AI audit insight for a business.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "2-4 sentence plain-language summary of the business's online weaknesses.",
      },
      problems: {
        type: "array",
        items: { type: "string" },
        description: "Concrete problems found, most impactful first.",
      },
      improvements: {
        type: "array",
        items: { type: "string" },
        description: "Prioritised suggested improvements.",
      },
      estimatedMissedCustomersPerMonth: {
        type: "integer",
        description: "Rough estimate of monthly customers lost to these issues.",
      },
      estimatedLostRevenuePerMonth: {
        type: "integer",
        description: "Rough estimate of monthly revenue lost, in USD.",
      },
    },
    required: ["summary", "problems", "improvements"],
  },
};

export function buildInsightRequest(business, audit) {
  const system =
    "You are a senior web + local-SEO consultant. Given audit data about a local " +
    "business, identify concrete weaknesses in their online presence and estimate " +
    "the business impact. Be specific and reference the actual findings. Never " +
    "invent facts not supported by the data. Always respond by calling the " +
    "record_insight tool.";
  const user =
    `Analyse this business and record your insight.\n\nDATA:\n${digest(business, audit)}`;
  return { system, user, tool: INSIGHT_TOOL };
}

// ─── Proposal ────────────────────────────────────────────────
// When `demoUrl` is provided, we've already built a free demo site for the
// business — the email should invite them to view it and frame next steps as
// "if you like it, we take it from there".
export function buildProposalRequest(business, audit, lead, demoUrl = null) {
  const reasons = (lead?.reasons ?? []).map((r) => r.reason || r).join(", ");
  const demoRules = demoUrl
    ? " I have ALREADY built them a free demo of how their new website could look. " +
      "Tell them clearly that I've already made a demo for them so they can see how " +
      "their business could look online, and that we can go through it together and " +
      "see if it fits what they need — friendly and low-pressure. Put the demo link " +
      "on its own line exactly as given, unaltered, near the end before the sign-off. " +
      "Do not wrap it in markdown."
    : "";
  const system =
    "You write short, warm, personalised B2B outreach emails for a web design & " +
    "digital marketing agency. Write in the first person singular — always use " +
    "'I', never 'we' or 'our team'. Tone: friendly, helpful, and genuinely engaging " +
    "— like a real person reaching out, never spammy, never pushy, no hype or " +
    "buzzwords. Use easy, simple English: short sentences, everyday words, no jargon. " +
    "A non-native English speaker should understand it easily. Open with a specific, " +
    "human hook about their business (not 'I hope this email finds you well'). " +
    "Reference the recipient's actual website problems in plain terms and how a modern " +
    "site helps them get more customers." +
    demoRules +
    " 120-180 words. Plain text, no subject " +
    "line, sign off as an individual (e.g. 'Best,' on its own line). Do not " +
    "fabricate specifics not in the data.";
  const user =
    `Write a personalised outreach email to this business.\n\n` +
    `Key problems found: ${reasons || "general online presence gaps"}.\n\n` +
    (demoUrl ? `Demo site link (include verbatim): ${demoUrl}\n\n` : "") +
    `DATA:\n${digest(business, audit)}`;
  return { system, user };
}

// Distinct aesthetic directions so the N variants per industry each look
// different (not the same layout recoloured). Indexed by variant slot; cycles
// if there are more slots than directions.
const VARIANT_DIRECTIONS = [
  "EDITORIAL LUXURY: warm, refined, magazine-like. A serif display face for " +
    "headings, airy generous whitespace, large elegant photography, subtle motion. " +
    "Understated premium — think a high-end brand's flagship site.",
  "BOLD & VIBRANT: high-energy and modern. Saturated colour blocks, oversized " +
    "sans-serif type, strong asymmetry, punchy CTAs, playful micro-interactions. " +
    "Confident and eye-catching without looking cheap.",
  "DARK PREMIUM: a deep dark theme with glassmorphism, luminous gradient or " +
    "neon/gold accents, moody full-bleed imagery, and layered depth. Sleek, " +
    "cinematic, high-contrast — a boutique agency feel.",
];

export function variantDirection(variant = 0) {
  return VARIANT_DIRECTIONS[((variant % VARIANT_DIRECTIONS.length) + VARIANT_DIRECTIONS.length) % VARIANT_DIRECTIONS.length];
}

// ─── Demo website generator (TEMPLATE mode) ──────────────────
// Produces a complete, single-file HTML document themed to the business's
// INDUSTRY — but reusable across every business in that industry. Instead of
// baking in one business's name/city/phone/colour, the output uses placeholder
// tokens and a fixed CSS-variable palette. The worker generates a few distinct
// VARIANTS per industry (see `variant`), then fills each per business in code
// (shared/template.js). Same-industry demos reuse a variant → no model call.
export function buildWebsiteRequest(business, variant = 0) {
  const industry = business?.business_type || "local business";
  const direction = variantDirection(variant);

  const system =
    "You are an award-winning web designer + front-end engineer. You output a " +
    "COMPLETE, production-quality, single-file HTML document: a reusable TEMPLATE " +
    "for a STRIKINGLY MODERN, eye-catching small-business marketing website in a " +
    "given industry. This must look like a bespoke award-winning agency build, NOT " +
    "a generic template — bold, memorable, and premium. Hard requirements:\n" +
    "- One file: <!doctype html> … </html>. Inline everything. No build step.\n" +
    "- Tailwind via <script src=\"https://cdn.tailwindcss.com\"></script> in <head>.\n" +
    "- Google Fonts via <link> is allowed. Pick a distinctive type pairing (a display " +
    "font for headings + a clean body font) that matches the industry mood.\n" +
    "\n" +
    "PLACEHOLDER TOKENS — MANDATORY. This is a template, so DO NOT invent or hard-code a " +
    "specific business name, city, phone number, or rating anywhere. Use these EXACT literal " +
    "tokens instead, and use them everywhere that value would appear (nav/logo, hero, about, " +
    "footer, contact, <title>, alt text, tel: links):\n" +
    "  {{BUSINESS_NAME}}  — the business name\n" +
    "  {{CITY}}           — the city / area it serves\n" +
    "  {{PHONE}}          — phone number (also usable in href=\"tel:{{PHONE}}\")\n" +
    "  {{RATING}}         — Google rating number, e.g. shown as \"{{RATING}}★ on Google\"\n" +
    "Write the tokens verbatim with the double braces. Everything else (menu items, service " +
    "names, testimonials, copy) should be realistic, industry-specific placeholder content.\n" +
    "\n" +
    "COLOUR PALETTE — MANDATORY, define it as CSS variables so colours are swappable:\n" +
    "- In a <style> in <head>, define EXACTLY these six variables on :root, each as a #RRGGBB " +
    "hex value (no rgb(), hsl(), or colour names — hex only):\n" +
    "    :root{--brand:#______;--brand-2:#______;--accent:#______;--ink:#______;--bg:#______;--surface:#______;}\n" +
    "  --brand = primary brand colour; --brand-2 = a darker brand shade; --accent = CTA/highlight; " +
    "--ink = dark body-text colour (for light backgrounds); --bg = light page background; " +
    "--surface = card/section background.\n" +
    "- Theme these to the industry mood (restaurant = warm/appetising; law firm = navy/trustworthy; " +
    "gym = bold/energetic; salon = soft/elegant). Pick colours with strong contrast.\n" +
    "- Reference brand colours ONLY through these variables, via Tailwind arbitrary values, e.g. " +
    "bg-[var(--brand)], text-[color:var(--ink)], border-[color:var(--accent)]. Do NOT hard-code " +
    "brand hex anywhere else and do NOT rely on unregistered Tailwind colour classes (they render " +
    "BLACK). white/black text over dark brand backgrounds or scrims is fine.\n" +
    "\n" +
    "CONTRAST & READABILITY — non-negotiable, WCAG AA (≥4.5:1 for body text):\n" +
    "- Light text ONLY on dark backgrounds; dark text (var(--ink)) ONLY on light backgrounds. " +
    "Never leave default black text on a dark or mid-tone section.\n" +
    "- Any text over a photo/hero image MUST sit on a dark scrim: an absolute gradient/solid " +
    "overlay (e.g. bg-black/50) between the image and white/light text. No text over images " +
    "without an overlay.\n" +
    "- Set an explicit colour on every heading/paragraph in a coloured section — never rely on " +
    "inheritance or defaults.\n" +
    "- NAV BAR: a solid or light/glass floating header (bg = --surface/--bg/white) MUST use dark " +
    "text — logo wordmark AND every menu link in var(--ink), not white. Light/white nav text is " +
    "allowed ONLY when the nav is transparent and sits directly over a dark hero image/scrim. " +
    "When in doubt, make logo + menu links var(--ink).\n" +
    "\n" +
    "IMAGERY — critical. Every image MUST visually match THIS industry.\n" +
    "- Silently decide 6-10 concrete subject keywords for this industry (e.g. restaurant → " +
    "'restaurant,food,pasta,plating,chef,dining,wine'; gym → 'gym,fitness,workout,dumbbell,training'; " +
    "salon → 'salon,haircut,hairstyle,beauty'; law firm → 'lawyer,office,courthouse,handshake,justice'; " +
    "dentist → 'dentist,dental,teeth,clinic').\n" +
    "- Use loremflickr for real, subject-matched photos:\n" +
    "  https://loremflickr.com/<w>/<h>/<comma-separated-keywords>?lock=<uniqueInt>\n" +
    "  Use only 1-3 STRONG keywords per image. Vary <uniqueInt> per image so each is different " +
    "but deterministic.\n" +
    "- The HERO image must show the industry's single most recognisable subject (restaurant → " +
    "FOOD/a plated dish; gym → people training; salon → hair/styling). Not an empty room.\n" +
    "- NEVER use picsum.photos or generic random images. NEVER leave a broken/empty <img>. " +
    "Every <img> needs width/height and a descriptive alt.\n" +
    "\n" +
    "LAYOUT & DESIGN — must look bespoke, NOT a generic template:\n" +
    "- Modern editorial layout: a bold asymmetric hero with a large image, generous whitespace, " +
    "oversized headings, and at least one bento-grid or offset two-column section. Avoid the " +
    "stacked-identical-centered-cards look.\n" +
    "- Sections tailored to the industry, not just 'services'. A restaurant gets a real MENU with " +
    "named dishes + prices and a reservation CTA; a gym gets class schedule + membership tiers + " +
    "trainers; a salon gets a price list + booking CTA. Also include: sticky nav (working mobile " +
    "hamburger), hero, about/story, the industry-specific section, gallery grid, testimonials, " +
    "contact with a (non-functional) form + map placeholder + hours + phone, footer.\n" +
    "- Glassmorphism accents, soft shadows, rounded cards, layered depth, tasteful gradients.\n" +
    "\n" +
    "RESPONSIVE — mobile-first, non-negotiable:\n" +
    "- Design for 375px first, then scale up with sm/md/lg breakpoints. Test mentally at " +
    "375 / 768 / 1280.\n" +
    "- Nav collapses to a working hamburger on mobile. Grids reflow to 1 column. No horizontal " +
    "scroll. Tap targets ≥44px. Images use max-w-full and never overflow.\n" +
    "\n" +
    "INTERACTION — polished, vanilla JS only, inline in one <script> before </body>:\n" +
    "- Smooth scroll, scroll-reveal animations (IntersectionObserver), hover states, working " +
    "mobile menu toggle, a testimonial slider or gallery lightbox.\n" +
    "\n" +
    "Output ONLY the raw HTML. No markdown, no code fences, no commentary before or after.";

  const user =
    `Design and build a complete, reusable demo marketing website TEMPLATE for a ` +
    `"${industry}" business. It must look strikingly modern and eye-catching — bespoke, ` +
    `not a generic template.\n\n` +
    `AESTHETIC DIRECTION for this variant — commit to it fully so it looks clearly ` +
    `different from other variants:\n${direction}\n\n` +
    `Make the imagery, sections, palette, and copy all read as a real ${industry} site. ` +
    `Use the {{BUSINESS_NAME}}, {{CITY}}, {{PHONE}}, and {{RATING}} placeholder tokens for the ` +
    `business-specific values (do not invent a real name), and define the six-variable :root ` +
    `colour palette exactly as specified — themed to both the industry and this aesthetic direction.`;

  return { system, user };
}

/** Optional Opus refinement pass over a draft proposal. */
export function buildProposalRefineRequest(draft, business) {
  const system =
    "You are an expert copy editor. Tighten this outreach email: keep it warm and " +
    "specific, remove any spammy or generic phrasing, ensure it reads naturally. " +
    "Keep the first-person singular voice ('I', never 'we'). " +
    "Preserve any URLs exactly as written (keep the demo link on its own line). " +
    "Return only the improved email text.";
  const user = `Business: ${business?.name}\n\nDRAFT:\n${draft}`;
  return { system, user };
}
