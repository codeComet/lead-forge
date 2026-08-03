// Claude prompt builders. Pure string/schema construction — no SDK calls here
// (the worker owns the Anthropic client). Keeping these separate makes the
// prompts easy to review and tweak without touching transport code.

/** Compact, token-friendly digest of a business + audit for prompt context. */
function digest(business, audit, lead) {
  const w = audit?.website ?? {};
  const seo = audit?.seo ?? {};
  const tech = audit?.tech ?? {};
  const gbp = audit?.gbp ?? {};
  const social = audit?.social ?? {};
  const ins = lead?.insight ?? null;
  return JSON.stringify(
    {
      name: business?.name,
      industry: business?.business_type,
      city: business?.city,
      address: business?.address,
      rating: gbp.rating ?? business?.rating,
      reviews: gbp.reviews ?? business?.reviews,
      website: business?.website || null,
      // AI insight, when available — concrete problems + the impact estimate.
      // The proposal may reference these to make the pitch tangible.
      insight: ins
        ? {
            problems: ins.problems,
            improvements: ins.improvements,
            estimatedMissedCustomersPerMonth: ins.estimatedMissedCustomersPerMonth,
            estimatedLostRevenuePerMonth: ins.estimatedLostRevenuePerMonth,
          }
        : undefined,
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
// The human sending outreach. Every proposal signs off as this person — never
// a name the model invents.
export const SENDER_NAME = "Redwan";

// Sentinel markers the model wraps its output in so we can split the local-
// language message from its English translation deterministically.
const LANG_MARK = "<<<LANG>>>";
const SUBJECT_MARK = "<<<SUBJECT>>>";
const MSG_MARK = "<<<MESSAGE>>>";
const TRANS_MARK = "<<<TRANSLATION>>>";

// Optional-facts instruction: the DATA may carry an AI insight (concrete
// problems + an impact estimate). Let the model use it to make the pitch
// tangible, but keep it warm — a figure only when it flows, never forced.
const INSIGHT_HINT =
  " If the DATA has an `insight` (specific problems, or estimatedMissedCustomers" +
  "PerMonth / estimatedLostRevenuePerMonth), you MAY weave in ONE concrete point " +
  "— e.g. gently note the customers or revenue they're likely missing right now — " +
  "but only when it reads naturally and stays warm and helpful, never alarmist or " +
  "salesy. Soften and round any number ('maybe around N customers a month'). Use at " +
  "most one figure. Never invent problems or numbers that aren't in the DATA.";

// Shared instruction: write the outreach in the location's local language, then
// give an English translation, in a strict machine-parseable format. Appended
// to both the email and Instagram system prompts. `includeSubject` adds a
// localized email subject line to the contract (email only — DMs have none).
function localizeRules(includeSubject = false) {
  const subjectLine = includeSubject
    ? SUBJECT_MARK + "\n" +
      "<a short, specific email subject line in the SAME local language — no " +
      "\"Subject:\" prefix, one line, not salesy>\n"
    : "";
  return (
    "\n\nLANGUAGE — CRITICAL: work out the primary local language the owner and " +
    "customers at this location actually speak, from the city/address/country in " +
    "the DATA (e.g. Linz, Austria → German as spoken in Austria; Paris → French; " +
    "Milan → Italian; Zürich → Swiss-style German). Write the ENTIRE message in " +
    "that local language, sounding native and natural to that specific region — a " +
    "real local person's phrasing and greetings, never a stiff textbook " +
    "translation. Localise the sign-off too (e.g. 'Beste Grüße' in German), still " +
    "signing as " + SENDER_NAME + ". If the local language is English, just write " +
    "in English." +
    (includeSubject ? " Write the subject line in that same local language too." : "") +
    "\n\n" +
    "OUTPUT FORMAT — return EXACTLY this and nothing else, no preamble:\n" +
    LANG_MARK + " <the language you wrote in, named in English, e.g. Austrian German>\n" +
    subjectLine +
    MSG_MARK + "\n" +
    "<the full message in the local language>\n" +
    TRANS_MARK + "\n" +
    "<a faithful, natural English translation of that message; if it's already " +
    "English, repeat it here>"
  );
}

/**
 * Parse a localized proposal response into its parts. Tolerant of a model that
 * ignored the format: falls back to treating the whole text as the message with
 * no translation. Returns { language, subject, body, translation }. `subject` is
 * null unless the model emitted a <<<SUBJECT>>> section (email prompts only).
 */
export function parseLocalizedProposal(raw) {
  const text = (raw || "").trim();
  const li = text.indexOf(LANG_MARK);
  const si = text.indexOf(SUBJECT_MARK);
  const mi = text.indexOf(MSG_MARK);
  const ti = text.indexOf(TRANS_MARK);

  if (mi === -1 || ti === -1 || ti < mi) {
    // Model didn't follow the format — keep the whole thing as the body.
    return {
      language: null,
      subject: null,
      body: text.replace(LANG_MARK, "").trim() || text,
      translation: null,
    };
  }

  // The subject section, when present, sits between LANG and MESSAGE.
  const hasSubject = si !== -1 && si < mi && (li === -1 || si > li);
  const language =
    li !== -1 && li < mi
      ? text.slice(li + LANG_MARK.length, hasSubject ? si : mi).trim() || null
      : null;
  const subject = hasSubject
    ? text.slice(si + SUBJECT_MARK.length, mi).trim() || null
    : null;
  const body = text.slice(mi + MSG_MARK.length, ti).trim();
  let translation = text.slice(ti + TRANS_MARK.length).trim() || null;
  // Drop a redundant translation when the message was already English.
  if (translation && translation === body) translation = null;
  return { language, subject, body: body || text, translation };
}

// Turn user-supplied "extra points" into a prompt instruction. These are the
// sender's own asks (pricing, a promo, a specific service to pitch) — they must
// be woven in naturally, never dumped verbatim or allowed to break the tone.
function extraPointsBlock(instructions) {
  const t = (instructions || "").trim();
  if (!t) return "";
  return (
    "\n\nADDITIONAL POINTS the sender explicitly wants included — weave each one " +
    "in naturally, in the same first-person voice and warm tone, without making " +
    "them sound bolted-on or salesy, and without inventing facts around them:\n" +
    t
  );
}

export function buildProposalRequest(business, audit, lead, demoUrl = null, channel = "email", instructions = "") {
  if (channel === "instagram") return buildInstagramProposalRequest(business, audit, lead, demoUrl, instructions);

  const reasons = (lead?.reasons ?? []).map((r) => r.reason || r).join(", ");
  const demoRules = demoUrl
    ? " I have ALREADY built them a free demo of how their new website could look — " +
      "step 7 of the structure is built around it. Put the demo link on its own line, " +
      "exactly as given, unaltered, no markdown."
    : " I have NOT built a demo yet, so SKIP the demo line (step 7): instead, at that " +
      "point offer to put together a free demo of how their site could look if they're " +
      "interested. There is no link — never invent one.";
  const system =
    "You write warm, personalised B2B outreach emails for a solo web developer. Write " +
    "in the first person singular — always 'I', never 'we' or 'our team'. Tone: " +
    "professional, warm, respectful and genuinely helpful — like a real person who took " +
    "the time to look at their site, never spammy, pushy, or salesy, no hype or " +
    "buzzwords. Use clear, simple English a non-native speaker understands easily.\n\n" +
    "Follow this EXACT structure, in order:\n" +
    "1. GREETING: 'Dear <Business Name> Team,' on its own line (use the business's real " +
    "name from the DATA).\n" +
    "2. GENUINE PRAISE: one or two warm, specific sentences on what they've built or the " +
    "value they clearly offer — sincere, not flattery. Start it naturally (e.g. 'First " +
    "of all, ...').\n" +
    "3. THE ISSUES: a short transition like 'While browsing the website, I noticed a few " +
    "areas where the experience and search visibility could be improved:' followed by a " +
    "bulleted list (each line starting with '* ') of 3-5 CONCRETE issues drawn from the " +
    "actual problems in the DATA — e.g. dated design, weak/missing social media " +
    "integration, unclear calls-to-action, missing image alt text, technical-SEO gaps " +
    "(sitemap, on-page). Phrase each kindly and constructively. Never invent problems " +
    "not supported by the DATA.\n" +
    "4. THE BRIDGE: one sentence like 'For a business as established as <name>, these " +
    "improvements could enhance the experience for their customers while increasing " +
    "visibility and engagement.'\n" +
    "5. CREDENTIAL: 'I'm a web developer specializing in modern, high-performance " +
    "websites with a strong focus on usability, accessibility, and SEO.'\n" +
    "6. (merged into 7).\n" +
    "7. THE DEMO: 'I've already created a demo to show how <name> could look with a more " +
    "modern design and improved user experience:' then the demo link on its own line.\n" +
    "8. LOW-PRESSURE CLOSE: 'We can go through it together and see whether it aligns with " +
    "your vision — absolutely no pressure or obligation. Even if you decide not to move " +
    "forward, I'd be happy to share my thoughts on where the site could be improved.'\n" +
    "9. THE ASK: 'Would you be open to a brief conversation?'\n" +
    "10. SIGN-OFF: 'Kind regards,' then '" + SENDER_NAME + "' on the next line. Never use " +
    "any other name.\n\n" +
    "Keep it tight — roughly 180-240 words. Plain text; put NO subject line inside the " +
    "body (the subject is returned separately per the output format below). Do not " +
    "fabricate specifics not in the data." +
    demoRules +
    INSIGHT_HINT +
    localizeRules(true);
  const user =
    `Write a personalised outreach email to this business.\n\n` +
    `Key problems found: ${reasons || "general online presence gaps"}.\n\n` +
    (demoUrl ? `Demo site link (include verbatim): ${demoUrl}\n\n` : "") +
    `DATA:\n${digest(business, audit, lead)}` +
    extraPointsBlock(instructions);
  return { system, user };
}

// Instagram DM variant. Businesses with no email/website are only reachable via
// Instagram, and the full email proposal is far too long for a DM. This writes a
// tight, punchy DM built around the free demo preview link.
export function buildInstagramProposalRequest(business, audit, lead, demoUrl = null, instructions = "") {
  const reasons = (lead?.reasons ?? []).map((r) => r.reason || r).join(", ");
  const linkRules = demoUrl
    ? "The message is built around a free demo I ALREADY made for them. At step 4, tell them " +
      "I built a quick free demo of how their site could look and invite them to tap the " +
      "link. Put the link on its own line, verbatim, exactly as given — no markdown, no " +
      "shortening. Keep it before the ask."
    : "At step 4, tell them I can build a free demo of how their site could look and ask if " +
      "they want me to send it over. There is no link — never invent one.";
  const system =
    "You write short, punchy Instagram DMs for a solo web developer reaching out to local " +
    "businesses. This is the SHORT, DM-native version of the outreach email — same warm, " +
    "professional-but-casual voice, same flow, far fewer words. First person singular — " +
    "always 'I', never 'we'. Never spammy or pushy. 1-2 tasteful emoji max, short lines. " +
    "Easy, simple English a non-native speaker understands.\n\n" +
    "STRUCTURE, in order — same shape as the email but compressed:\n" +
    "1. PRAISE — one short, specific, genuine compliment about their business or page.\n" +
    "2. THE ISSUES — one or two quick lines naming the biggest concrete problems from the " +
    "DATA (e.g. dated/hard-to-find site, weak social presence, unclear next step, SEO " +
    "gaps). Kind and constructive, not a bulleted list — keep it conversational. Never " +
    "invent problems not in the DATA.\n" +
    "3. THE 'WHY' — one short line on why it matters (people search online first; a better " +
    "site brings more bookings/calls and trust). Warm, never scary.\n" +
    "4. THE DEMO — I already built a free demo of how their site could look (see link " +
    "rules).\n" +
    "5. THE ASK — a light, optional nudge: open to a quick chat to walk through it? " +
    "Absolutely no pressure.\n\n" +
    linkRules +
    " CRITICAL — must fit an Instagram DM: keep it SHORT and skimmable, 60-100 words total, " +
    `short lines. No subject line. End with a light sign-off signing as ${SENDER_NAME} on ` +
    "its own line. Never use any other name. Do not fabricate specifics not in the data." +
    INSIGHT_HINT +
    localizeRules(false);
  const user =
    `Write a short Instagram DM to this business.\n\n` +
    `Key problems found: ${reasons || "room to modernise their online presence"}.\n\n` +
    (demoUrl ? `Demo site link (include verbatim): ${demoUrl}\n\n` : "") +
    `DATA:\n${digest(business, audit, lead)}` +
    extraPointsBlock(instructions);
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

// ─── Frontend-design-skills (Awwwards / 21st.dev elevation layer) ─────
// Distilled from the installed `@flitzrrr/frontend-design-skills` pack
// (skills-src/* — design-trends, visual-direction, ui-patterns, landing-pages,
// web-typography, color-theory), whose rules are derived from Awwwards / CSSDA /
// Godly / SiteInspire winners and 21st.dev component quality. The skills are a
// Claude Code harness construct; the demo generator runs in the worker (plain
// Node + Anthropic SDK) and can't invoke them, so we fold their design system
// into the generation prompt instead.
//
// COMPATIBILITY — the demo pipeline hard-constrains what we can adopt:
//   • Output stays a single self-contained HTML file on the Tailwind CDN — no
//     build step, no React/Next, no external CSS/JS beyond fonts + Tailwind.
//   • The six :root palette vars (--brand/--brand-2/--accent/--ink/--bg/
//     --surface) MUST remain #RRGGBB hex — template.js rotateBrandHues()
//     regex-parses them per business. Derived tints (color-mix / oklch(from …))
//     that reference those hex vars are fine; the six roots stay hex.
//   • JS IntersectionObserver reveal stays the baseline (fires in Playwright
//     screenshots + all browsers); native scroll-driven timelines are layered
//     on top as progressive enhancement, never the sole mechanism.
const MODERN_FRONTEND_SKILL =
  "\n\nAWARD-WINNING DESIGN SYSTEM (2026, ref: Awwwards / CSSDA / Godly winners + " +
  "21st.dev component quality) — apply this on top of everything above. The bar: it " +
  "must look worthy of an Awwwards feature, like a real agency shipped it — NEVER a " +
  "generic AI template. Where this section sharpens an earlier rule, THIS wins.\n" +
  "- MOTION AS MEANING: every animation must direct attention, show state, or carry " +
  "narrative — never decoration. Interactions ≤400ms (only long scroll sequences may " +
  "exceed). Micro-interaction (hover/focus/active) on EVERY interactive element: " +
  "buttons, links, cards, form fields. A brand-flavoured touch, never a generic " +
  "spinner. 60fps, GPU-only (transform/opacity), honour prefers-reduced-motion on all " +
  "of it. Subtle parallax only — no scroll-hijacking.\n" +
  "- TYPOGRAPHY AS HERO: type IS the layout. Exactly TWO families — one expressive " +
  "(variable) display + one neutral body; ≤3 weights total; no system fonts in the " +
  "hero. Display is large and confident but NOT wall-filling: ~44-76px desktop, ~2.4-3× body, via " +
  "clamp() (e.g. clamp(2.25rem,1rem+4vw,4.75rem)) — bold, never oversized or overflowing. " +
  "The clamp must actually scale: min ≤2.75rem so it never overflows a 390px " +
  "phone, max ≤5.25rem, and max at least 1.8× min — never a near-fixed clamp like " +
  "clamp(4.6rem,1rem+2vw,4.9rem). Tight negative tracking (~-0.03em) and " +
  "leading-[0.95] on the hero headline. Body ≥16px, text measure 65-75ch. One kinetic / " +
  "gradient-text headline moment, used ONCE.\n" +
  "- COLOUR — REDUCED + ACCENT: a restrained palette, monochrome/neutral base + ONE " +
  "strong accent = the primary action; ≤2 chromatic colours on large areas, saturation " +
  "only in small accents. Deep tinted darks (#0A0A0A–#1A1A1A), never pure #000; off-" +
  "white/warm neutrals, never pure #FFF flatness. Derive every tint/hover/border/scrim " +
  "FROM the six hex :root vars (color-mix(in oklch, var(--brand) 12%, var(--surface)), " +
  "oklch(from var(--brand) calc(l + .12) c h)) — no unrelated raw hex, no hue drift in " +
  "gradients. Alternate section temperature (dark → light → dark) for rhythm. All text " +
  "≥ WCAG AA 4.5:1.\n" +
  "- LAYOUT — REDUCTION WITH DEPTH: deliberately break the grid (asymmetric balance, " +
  "not everything centered); bento grids of varied visual weight for feature/service " +
  "sections; alternate full-bleed media with constrained text (≤720px, 65-75ch); " +
  "generous vertical rhythm (section spacing ~120-160px desktop → ~64px mobile). Depth " +
  "via a restrained shadow system (3-5 levels) + subtle blur/texture, not flat blocks. " +
  "Commit to ONE visual style per variant — no style collage.\n" +
  "- HERO (pick the variant that fits the aesthetic direction): STATEMENT (huge type + " +
  "subline + CTA, minimal imagery), SPLIT (copy one side / industry photo the other), or " +
  "IMMERSIVE (full-bleed photo/scrim + overlay type). Headline ≤15 words, primary CTA " +
  "above the fold. NEVER a slider/carousel in the hero.\n" +
  "- UI PATTERNS (21st.dev-grade): ONE primary CTA per viewport — filled, high-contrast, " +
  "action+benefit label ('Book a table', 'Call now', 'Get a quote'), never 'Submit'/" +
  "'Click here'; ≤2 CTAs side by side, repeat the primary after major sections. Cards: " +
  "image→title→short benefit→meta→CTA, the WHOLE card clickable, hover = lift + " +
  "shadow-deepen + scale ~1.02 + image zoom. Sticky top nav (logo left, links, CTA " +
  "right), ≤7 items, auto-hide on scroll-down / reveal on scroll-up, active state marked. " +
  "Forms single-column, labels ABOVE fields. Pricing/tiers = 3 options with ONE " +
  "highlighted. Testimonials with real-sounding name + role (+ photo). A marquee logo/" +
  "social-proof strip and a mega-footer CTA block.\n" +
  "- ABOVE THE FOLD earns the scroll: clear benefit headline + subline + hero visual + " +
  "primary CTA + one trust signal (rating/{{RATING}}★, review count, or guarantee). " +
  "Realistic industry copy and plausible numbers — zero lorem ipsum.\n" +
  "- ANTI-SLOP (Awwwards judges reject these): no generic purple-blue / purple-pink-" +
  "orange gradient; no trend collage (glass + brutalism + neumorphism together — one " +
  "style); no identical-card walls; no stock-photo mush or mismatched image treatment; " +
  "no fake 3D/WebGL for its own sake; never copy an Awwwards winner verbatim — adapt. " +
  "Commit fully to this variant's aesthetic direction.";

/** The distilled skill guidance, exported so it can be reused/tested. */
export function modernFrontendGuidance() {
  return MODERN_FRONTEND_SKILL;
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
    "  {{ADDRESS}}        — full street address (use in the contact/footer/map area)\n" +
    "  {{HOURS}}          — opening hours. Put this token ALONE inside a single container " +
    "(e.g. <div class=\"hours\">{{HOURS}}</div>); it is replaced with pre-formatted " +
    "day/time lines separated by <br>. Do NOT write your own weekday list around it — style " +
    "the wrapper only (padding, font, a leading clock icon), and let the token supply the lines.\n" +
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
    "GLASS HEADER — MANDATORY, build it exactly like this:\n" +
    "- A fixed floating header: position:fixed; top:0; width:100%; z-50. NOT a plain static bar.\n" +
    "- Frosted glass: backdrop-blur-lg (backdrop-filter: blur), a SEMI-transparent background " +
    "(e.g. bg-white/70 or rgba of --surface at ~0.7 alpha), a hairline bottom border " +
    "(border-b border-white/20 or 1px of --ink at low alpha), and a soft shadow.\n" +
    "- On scroll (JS): add a class that increases opacity/blur + shadow and SHRINKS the header " +
    "padding (e.g. py-5 → py-3) with a CSS transition. Header state must visibly change once the " +
    "user scrolls past ~40px.\n" +
    "- Add smooth padding/background/shadow transitions (transition-all duration-300) so the shrink " +
    "animates. Menu links get an animated underline on hover (a pseudo-element or span that scales " +
    "from 0→100% width). Nav must clear the hero (add top padding/margin so content isn't hidden).\n" +
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
    "- Use AT LEAST 3-4 distinct real photos across the page (hero + gallery + service/section " +
    "images), each a DIFFERENT subject keyword and uniqueInt so no two repeat. An industry site " +
    "with only one image is a FAIL.\n" +
    "- NEVER use picsum.photos or generic random images. NEVER leave a broken/empty <img>. " +
    "Every <img> needs width/height and a descriptive alt.\n" +
    "\n" +
    "LAYOUT & DESIGN — must look bespoke, NOT a generic template. A plain stack of centered " +
    "white cards with a heading and three columns is an AUTOMATIC FAIL. Every section must have a " +
    "distinct visual treatment:\n" +
    "- HERO — the make-or-break section; it must feel ANIMATED, modern and premium the instant the " +
    "page loads: full-height (min-h-screen) bold ASYMMETRIC layout — a large industry photo on one " +
    "side / oversized headline on the other, or a full-bleed hero image under a dark scrim with a huge " +
    "display headline. The hero image MUST be this industry's single most recognisable subject/service " +
    "(restaurant → a plated dish, gym → people training, salon → a fresh cut) — never an empty room or " +
    "generic stock. Layer real depth: at least two soft blurred gradient blobs (absolute, rounded-full, " +
    "blur-3xl, low opacity, from --brand/--accent), a subtle glassmorphism card floating over the image " +
    "(rating pill / quick-info / primary CTA on frosted glass), and on-load entrance motion (headline " +
    "words or the glass card fade + slide/scale in via CSS keyframes, staggered). Add a gentle looping " +
    "ambient touch (slow gradient shift, floating blob drift, or hero-image parallax on scroll) and a " +
    "scroll-cue at the bottom. Include TWO hero CTAs: a solid primary (--accent) 'Book/Call/Order' and a " +
    "glass/outline secondary.\n" +
    "- SERVICES — a dedicated, richly-designed section (not a plain 3-column card row): a bento or " +
    "offset asymmetric grid of the industry's real services, each card with its own matching photo, an " +
    "icon or number, a short benefit line, and a hover-lift + image-zoom. Give at least one card a " +
    "larger feature span. Glassmorphism / gradient accents welcome.\n" +
    "- BUSINESS HOURS — a clear, well-designed opening-hours block using the {{HOURS}} token (see tokens): " +
    "a frosted-glass or --surface card with a clock/heading, placed in or beside the contact section, " +
    "styled so the day/time lines read cleanly.\n" +
    "- CTA — besides the hero, include at least one bold full-width CTA band (dark brand or gradient " +
    "background) with a big headline + a prominent 'tel:{{PHONE}}' call button and a book/contact button, " +
    "and repeat a clear CTA in the sticky nav.\n" +
    "- Bold section headings (text-4xl→text-6xl, NOT larger), generous whitespace, at least one bento-grid " +
    "AND one offset/overlapping two-column section. Vary section backgrounds (alternate --bg / " +
    "--surface / one dark brand section) so the page has rhythm — never all-white.\n" +
    "- Sections tailored to the industry, not just 'services'. A restaurant gets a real MENU with " +
    "named dishes + prices and a reservation CTA; a gym gets class schedule + membership tiers + " +
    "trainers; a salon gets a price list + booking CTA. Also include: glass sticky nav (working " +
    "mobile hamburger), hero, a stats/number strip (animated count-up), about/story, the " +
    "industry-specific section, gallery grid, testimonials, contact with a (non-functional) form + " +
    "map placeholder + hours + phone, footer.\n" +
    "- VARY THE STRUCTURE — do NOT ship the same skeleton every time. Beyond the required " +
    "nav / hero / contact / footer, pick a DIFFERENT mix, order, and layout of optional sections " +
    "for this build, chosen from: process/how-it-works steps, FAQ accordion, pricing/membership " +
    "tiers, awards/press or trust-badge strip, team/staff, before-&-after, booking/reservation " +
    "widget, tips/blog teaser, guarantee band, feature spotlight. No two demos should read as the " +
    "same template recoloured.\n" +
    "- Cards: rounded-2xl/3xl, layered soft shadows, subtle borders, glassmorphism accents where it " +
    "fits, gradient or image accents — with hover states (see INTERACTION). Add tasteful depth: " +
    "gradients, blurred blobs, and overlapping elements, not flat blocks.\n" +
    "\n" +
    "RESPONSIVE — mobile-first, non-negotiable:\n" +
    "- Design for 375px first, then scale up with sm/md/lg breakpoints. Test mentally at " +
    "375 / 768 / 1280.\n" +
    "- Nav collapses to a working hamburger on mobile. Grids reflow to 1 column. No horizontal " +
    "scroll. Tap targets ≥44px. Images use max-w-full and never overflow.\n" +
    "\n" +
    "INTERACTION & MOTION — MANDATORY, polished, vanilla JS only, inline in one <script> before " +
    "</body>. A static page with no motion is a FAIL. Implement ALL of these:\n" +
    "- Scroll-reveal: EVERY major section fades + slides up (opacity 0→1, translateY 24px→0) as it " +
    "enters the viewport via IntersectionObserver. STAGGER children (cards/list items) with " +
    "incremental transition-delays so they cascade in, not all at once.\n" +
    "- Sticky glass header that shrinks + gains shadow on scroll (see GLASS HEADER).\n" +
    "- Working mobile hamburger that toggles an animated menu (slide/fade), and animated underline " +
    "on nav links.\n" +
    "- Count-up animation on the stats/number strip (numbers tick up from 0 when scrolled into view).\n" +
    "- Card hover: lift (translateY -6px) + stronger shadow + slight scale on the image, all with " +
    "CSS transitions. Buttons: hover scale/glow/gradient shift. Everything transitions smoothly " +
    "(no instant jumps).\n" +
    "- A testimonial slider (auto-advance + dots/arrows) OR a gallery lightbox — real, working JS.\n" +
    "- Smooth in-page scrolling for nav anchor links.\n" +
    "- Optional tasteful extras: subtle hero parallax, gradient-animated headline, marquee logo " +
    "strip. Keep it smooth and performant, never janky.\n" +
    "- Respect prefers-reduced-motion: wrap non-essential motion so it's disabled when the user " +
    "prefers reduced motion.\n" +
    MODERN_FRONTEND_SKILL +
    "\n\nOutput ONLY the raw HTML. No markdown, no code fences, no commentary before or after.";

  const user =
    `Design and build a complete, reusable demo marketing website TEMPLATE for a ` +
    `"${industry}" business. It must look strikingly modern and eye-catching — bespoke, ` +
    `not a generic template.\n\n` +
    `AESTHETIC DIRECTION for this variant — commit to it fully so it looks clearly ` +
    `different from other variants:\n${direction}\n\n` +
    `Make the imagery, sections, palette, and copy all read as a real ${industry} site. ` +
    `Use the {{BUSINESS_NAME}}, {{CITY}}, {{PHONE}}, and {{RATING}} placeholder tokens for the ` +
    `business-specific values (do not invent a real name), and define the six-variable :root ` +
    `colour palette exactly as specified — themed to both the industry and this aesthetic direction.\n\n` +
    `NON-NEGOTIABLE: a fixed frosted-GLASS header that shrinks on scroll, a full-height asymmetric ` +
    `hero with blurred gradient blobs, alternating section backgrounds, and real motion on EVERY ` +
    `section (staggered scroll-reveal, count-up stats, card hover-lift, a working testimonial ` +
    `slider/lightbox). A flat page of centered white cards with no animation is a rejection.`;

  return { system, user };
}

// ─── Custom / redesign website generator (PER-BUSINESS mode) ─────────
// Unlike buildWebsiteRequest (a cached, reusable industry TEMPLATE with
// placeholder tokens), this builds a ONE-OFF site for a single business from the
// user's own instructions — and, when they paste a URL, a redesign of that
// site's homepage. The output bakes the REAL business values in directly (no
// {{TOKENS}}, no fillTemplate step, no template cache): every custom build is a
// fresh model call. It reuses the same award-winning design system so the result
// still looks bespoke and premium.

// Real business facts, formatted for the prompt. These are baked straight into
// the HTML (no placeholder tokens), so the model must use them verbatim.
function businessFacts(business) {
  const b = business || {};
  const lines = [
    ["Business name", b.name],
    ["Industry", b.business_type],
    ["City / area", b.city],
    ["Address", b.address],
    ["Phone", b.phone],
    ["Rating", b.rating != null ? `${b.rating}★ on Google` : null],
    ["Reviews", b.reviews],
    ["Existing website", b.website],
  ].filter(([, v]) => v != null && v !== "");
  return lines.map(([k, v]) => `- ${k}: ${v}`).join("\n");
}

/**
 * Build a custom / redesign website request.
 *   business     — the businesses row (real values are baked into the HTML)
 *   instructions — the user's free-text prompt (may contain a pasted URL)
 *   sourceSite   — optional homepage digest scraped from a pasted URL:
 *                  { finalUrl, title, description, nav, headings, sections,
 *                    ctas, images, footer }. When present, PRESERVE its sections.
 * Returns { system, user }. Output is final, business-specific HTML.
 */
export function buildCustomWebsiteRequest(business, instructions, sourceSite = null) {
  const industry = business?.business_type || "local business";
  const redesign = !!sourceSite;

  const modeRules = redesign
    ? "MODE — REDESIGN. The user pasted a link to their EXISTING homepage; the " +
      "scraped content is in SOURCE_SITE below. Rebuild THAT homepage: keep the SAME " +
      "sections, in the same order, with the same information architecture and the same " +
      "real copy/content (headings, paragraphs, nav items, menu/service lists, contact " +
      "details, links). Do NOT drop sections the original has, and do NOT invent whole new " +
      "sections unless the user's instructions ask for one. Your job is to make it look " +
      "strikingly modern and premium — new layout, typography, colour, spacing, motion — " +
      "while preserving what the page actually says. Reuse the original image URLs from " +
      "SOURCE_SITE where they fit; only fall back to loremflickr (rules below) for images " +
      "the source lacks. Only the homepage / front page — do not build other pages."
    : "MODE — FROM SCRATCH. Build a complete one-page marketing homepage for this business " +
      "following the user's instructions and the industry conventions. Invent realistic, " +
      "industry-specific sections and copy.";

  const system =
    "You are an award-winning web designer + front-end engineer. You output a COMPLETE, " +
    "production-quality, single-file HTML homepage for ONE specific real business. It must " +
    "look like a bespoke award-winning agency build, NOT a generic AI template. Hard " +
    "requirements:\n" +
    "- One file: <!doctype html> … </html>. Inline everything. No build step.\n" +
    "- Tailwind via <script src=\"https://cdn.tailwindcss.com\"></script> in <head>.\n" +
    "- Google Fonts via <link> allowed. Pick a distinctive display + body pairing.\n" +
    "\n" +
    "REAL VALUES — this is a live site for a real business, NOT a template. Use the actual " +
    "business facts from BUSINESS below (name, city, phone, address, rating) verbatim " +
    "everywhere they belong (nav/logo, hero, about, footer, contact, <title>, alt text, " +
    "tel: links). Do NOT emit {{PLACEHOLDER}} tokens and do NOT invent a different business " +
    "name. If a fact is missing, omit it gracefully — never write a fake phone/address.\n" +
    "\n" +
    modeRules +
    "\n\n" +
    "COLOUR PALETTE — define CSS variables on :root as #RRGGBB hex: " +
    ":root{--brand:#______;--brand-2:#______;--accent:#______;--ink:#______;--bg:#______;--surface:#______;} " +
    "(--brand primary, --brand-2 darker shade, --accent CTA/highlight, --ink dark body text, " +
    "--bg light page bg, --surface card bg). Theme them to the business/industry mood" +
    (redesign ? " — take cues from the original site's brand colours where they read as intentional" : "") +
    ". Reference brand colour ONLY through these vars via Tailwind arbitrary values " +
    "(bg-[var(--brand)], text-[color:var(--ink)]). Never rely on unregistered Tailwind colour " +
    "classes (they render BLACK).\n" +
    "\n" +
    "CONTRAST & READABILITY — WCAG AA (≥4.5:1 body text): light text ONLY on dark backgrounds, " +
    "dark text (var(--ink)) ONLY on light backgrounds; any text over a photo sits on a dark " +
    "scrim overlay; set an explicit colour on every heading/paragraph in a coloured section; " +
    "a light/glass nav uses dark var(--ink) links, white nav links only over a dark hero.\n" +
    "\n" +
    "GLASS HEADER — a fixed floating frosted-glass header (backdrop-blur, semi-transparent " +
    "bg, hairline border, soft shadow) that SHRINKS + gains shadow on scroll past ~40px via a " +
    "JS class toggle + CSS transition. Working mobile hamburger. Animated underline on nav " +
    "links. Nav clears the hero.\n" +
    "\n" +
    "IMAGERY — every image must visually match this industry. For any image the source doesn't " +
    "already provide, use loremflickr with 1-3 strong subject keywords: " +
    "https://loremflickr.com/<w>/<h>/<keywords>?lock=<uniqueInt> (vary uniqueInt per image). " +
    "Use AT LEAST 3-4 distinct photos across the page (hero + gallery + section images), each a " +
    "different subject + uniqueInt. Never picsum.photos, never a broken/empty <img>; every <img> " +
    "needs width/height + a descriptive alt.\n" +
    "\n" +
    "LAYOUT & MOTION — must look bespoke: a full-height asymmetric HERO with an industry photo " +
    "+ oversized display headline, blurred gradient blobs, a floating glass info/CTA card, and " +
    "on-load entrance motion; richly-designed sections (bento / offset grids, not a flat stack " +
    "of centered white cards — that's an automatic FAIL); alternating section backgrounds for " +
    "rhythm; oversized display headings; layered soft shadows + glassmorphism accents. " +
    "Mobile-first responsive (375 → 768 → 1280), grids reflow to one column, no horizontal " +
    "scroll, tap targets ≥44px. Motion (vanilla JS, one <script> before </body>): staggered " +
    "IntersectionObserver scroll-reveal on every section, the shrinking glass header, working " +
    "hamburger, count-up stats, card hover-lift + image-zoom, a working testimonial slider or " +
    "gallery lightbox, smooth anchor scrolling. Respect prefers-reduced-motion. A static page " +
    "with no motion is a FAIL.\n" +
    MODERN_FRONTEND_SKILL +
    "\n\nThe user's OWN INSTRUCTIONS below are the top priority — follow them exactly where " +
    "they conflict with the generic guidance above.\n" +
    "\n\nOutput ONLY the raw HTML. No markdown, no code fences, no commentary before or after.";

  const sourceBlock = redesign
    ? `\n\nSOURCE_SITE (scraped homepage to redesign — preserve its sections & content):\n${JSON.stringify(sourceSite, null, 0)}`
    : "";

  const user =
    `Build a complete, single-file homepage for this real "${industry}" business. It must ` +
    `look strikingly modern and bespoke — never a generic template.\n\n` +
    `BUSINESS:\n${businessFacts(business)}\n\n` +
    `USER INSTRUCTIONS (highest priority):\n${(instructions || "").trim() || "(none — use your best judgement for a premium " + industry + " homepage)"}` +
    sourceBlock +
    `\n\nNON-NEGOTIABLE: a fixed frosted-GLASS header that shrinks on scroll, a full-height ` +
    `asymmetric hero with blurred gradient blobs, alternating section backgrounds, and real ` +
    `motion on every section. Bake in the real business values above — no placeholder tokens.`;

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
