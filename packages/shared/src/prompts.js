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

// ─── Demo website generator ──────────────────────────────────
// Produces a complete, single-file, self-contained HTML document themed to the
// business's industry. Served publicly and linked from outreach emails.
export function buildWebsiteRequest(business) {
  const name = business?.name || "The Business";
  const industry = business?.business_type || "local business";
  const city = business?.city || business?.address || "";
  const rating = business?.rating != null ? `${business.rating}★` : null;
  const phone = business?.phone || "";

  const system =
    "You are an award-winning web designer + front-end engineer. You output a " +
    "COMPLETE, production-quality, single-file HTML document for a modern small-" +
    "business marketing website. Hard requirements:\n" +
    "- One file: <!doctype html> … </html>. Inline everything. No build step.\n" +
    "- Tailwind via <script src=\"https://cdn.tailwindcss.com\"></script> in <head>.\n" +
    "- Google Fonts via <link> is allowed. Pick a distinctive type pairing (a display " +
    "font for headings + a clean body font) that matches the industry mood.\n" +
    "\n" +
    "TAILWIND CONFIG — MANDATORY, do this or the site breaks:\n" +
    "- Any custom colour you use as a utility class (text-brand, bg-brand, border-brand, " +
    "etc.) MUST be registered first. Immediately AFTER the CDN <script>, add:\n" +
    "  <script>tailwind.config={theme:{extend:{colors:{ /* your palette here */ }}}}</script>\n" +
    "  Only then do classes like text-cream / bg-forest actually produce a colour. If you " +
    "skip this, those classes do NOTHING and the text falls back to default BLACK — the #1 " +
    "bug to avoid. Do NOT reference a Tailwind colour class you did not register.\n" +
    "- Alternatively use arbitrary values with a CSS var, e.g. text-[color:var(--gold)] or " +
    "bg-[var(--forest)] — those work without config. Pick ONE approach and be consistent.\n" +
    "\n" +
    "CONTRAST & READABILITY — non-negotiable, WCAG AA (≥4.5:1 for body text):\n" +
    "- Every text colour must contrast strongly with its actual background. Light text ONLY " +
    "on dark backgrounds; dark text ONLY on light backgrounds. Never leave default black " +
    "text sitting on a dark or mid-tone section.\n" +
    "- Any text placed over a photo/hero image MUST sit on a dark scrim: put an absolute " +
    "gradient/solid overlay (e.g. bg-black/50 or a linear-gradient) between the image and the " +
    "text, and make the text white/light. Text over images is never allowed without an overlay.\n" +
    "- Set an explicit body text colour and an explicit colour on every heading/paragraph in " +
    "a coloured section — do not rely on inheritance or defaults.\n" +
    "\n" +
    "IMAGERY — this is critical. Every image MUST visually match THIS business's industry.\n" +
    "- First, silently decide 6-10 concrete subject keywords that depict this exact " +
    "industry (e.g. restaurant → 'restaurant,food,pasta,plating,chef,dining,wine'; " +
    "gym → 'gym,fitness,workout,dumbbell,training'; salon → 'salon,haircut,hairstyle,beauty'; " +
    "law firm → 'lawyer,office,courthouse,handshake,justice'; dentist → 'dentist,dental,teeth,clinic').\n" +
    "- Use loremflickr for real, subject-matched photos:\n" +
    "  https://loremflickr.com/<w>/<h>/<comma-separated-keywords>?lock=<uniqueInt>\n" +
    "  Use only 1-3 STRONG keywords per image (too many tags returns weak/no matches). " +
    "Vary <uniqueInt> per image so each is different but deterministic.\n" +
    "- The HERO image must show the industry's single most recognisable subject: a restaurant " +
    "hero shows FOOD/a plated dish (e.g. 'food,dish' or 'pasta'), a gym shows people training, " +
    "a salon shows hair/styling. Not an empty room or abstract shot.\n" +
    "- NEVER use picsum.photos or generic random images. NEVER leave a broken/empty <img>. " +
    "Every <img> needs width/height and a descriptive alt.\n" +
    "\n" +
    "LAYOUT & DESIGN — must look bespoke, NOT a generic template:\n" +
    "- Theme palette + vibe to the industry (restaurant = warm, appetising; law firm = " +
    "navy/serif/trustworthy; gym = bold/energetic; salon = soft/elegant). Commit to a real " +
    "colour system (define CSS custom properties), not default Tailwind blue/gray.\n" +
    "- Use a modern editorial layout: a bold asymmetric hero with a large image, generous " +
    "whitespace, oversized headings, and at least one bento-grid or offset two-column section. " +
    "Avoid the stacked-identical-centered-cards look.\n" +
    "- Sections tailored to the industry, not just 'services'. A restaurant gets a real MENU " +
    "with named dishes + prices and a reservation CTA; a gym gets class schedule + membership " +
    "tiers + trainers; a salon gets a price list + booking CTA. Also include: sticky nav (working " +
    "mobile hamburger), hero, about/story, the industry-specific section, gallery grid, " +
    "testimonials, contact with a (non-functional) form + map placeholder + hours + phone, footer.\n" +
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
    "COPY — realistic, specific to the industry and business name (clearly placeholder but not " +
    "lorem ipsum). Reference the city where natural.\n" +
    "Output ONLY the raw HTML. No markdown, no code fences, no commentary before or after.";

  const details = [
    `Business name: ${name}`,
    `Industry / type: ${industry}`,
    city && `Location: ${city}`,
    rating && `Google rating: ${rating}`,
    phone && `Phone: ${phone}`,
  ]
    .filter(Boolean)
    .join("\n");

  const user =
    `Design and build a complete demo marketing website for this business. ` +
    `Make it look bespoke to their industry and name — the imagery, sections, palette, and copy ` +
    `must all read as a real ${industry} site, not a generic template.\n\n${details}`;

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
