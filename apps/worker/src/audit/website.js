import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (compatible; LeadForgeBot/1.0; +https://leadforge.app/bot)";

function normalizeUrl(url) {
  if (!url) return null;
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

async function fetchWithTimeout(url, ms, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      ...opts,
    });
  } finally {
    clearTimeout(t);
  }
}

// Fetch the homepage HTML + timing + final URL.
export async function fetchSite(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { exists: false };

  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, 15000);
    const html = await res.text();
    const loadTimeMs = Date.now() - started;
    const finalUrl = res.url || url;
    return {
      exists: true,
      ok: res.ok,
      status: res.status,
      finalUrl,
      https: finalUrl.startsWith("https://"),
      loadTimeMs,
      html,
      headers: Object.fromEntries(res.headers.entries()),
    };
  } catch (e) {
    // A dead / unreachable site is itself a strong lead signal.
    return { exists: true, ok: false, reachable: false, error: e.message, https: false };
  }
}

export function parseSeo($) {
  const metaTitle = $("title").first().text().trim() || $('meta[property="og:title"]').attr("content") || "";
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || "";
  const h1 = $("h1").first().text().trim() || "";
  let missingAltCount = 0;
  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    if (!alt || !alt.trim()) missingAltCount++;
  });
  const structuredData = $('script[type="application/ld+json"]').length > 0;
  return {
    metaTitle: metaTitle || null,
    metaDescription: metaDescription || null,
    h1: h1 || null,
    missingAltCount,
    structuredData,
  };
}

export function detectTech(html, headers, $) {
  const h = html.toLowerCase();
  const hdr = JSON.stringify(headers || {}).toLowerCase();
  const generator = ($('meta[name="generator"]').attr("content") || "").toLowerCase();
  const stack = [];
  let age = null;
  let obsolete = false;

  if (h.includes("/wp-content/") || h.includes("/wp-includes/") || generator.includes("wordpress")) {
    stack.push("WordPress");
    const m = generator.match(/wordpress\s+([\d.]+)/);
    if (m) age = `WordPress ${m[1]}`;
  }
  if (hdr.includes("wix") || h.includes("wixstatic.com") || h.includes("wix.com")) stack.push("Wix");
  if (h.includes("squarespace") || hdr.includes("squarespace")) stack.push("Squarespace");
  if (h.includes("cdn.shopify.com") || hdr.includes("shopify")) stack.push("Shopify");
  if (h.includes("/_next/") || h.includes("__next_data__")) stack.push("Next.js");
  else if (h.includes("data-reactroot") || h.includes("react")) stack.push("React");
  if (generator.includes("joomla")) stack.push("Joomla");
  if (generator.includes("drupal") || h.includes("/sites/default/files")) stack.push("Drupal");

  const bootstrap = h.match(/bootstrap[.-]?v?([\d.]+)?/);
  if (bootstrap) {
    stack.push("Bootstrap");
    const ver = bootstrap[1];
    if (ver && parseInt(ver, 10) <= 3) {
      obsolete = true;
      age = age || `Bootstrap ${ver} (outdated)`;
    }
  }

  // No modern framework / builder → likely legacy hand-coded or very old CMS.
  const modern = stack.some((s) => ["Next.js", "React", "Shopify", "Squarespace", "Wix"].includes(s));

  return { stack, age, obsolete, modern };
}

export function detectSocial($) {
  const find = (re) => {
    let hit = null;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (re.test(href)) {
        hit = href;
        return false;
      }
    });
    return hit;
  };
  return {
    facebook: find(/facebook\.com/i),
    instagram: find(/instagram\.com/i),
    linkedin: find(/linkedin\.com/i),
    tiktok: find(/tiktok\.com/i),
    youtube: find(/youtube\.com|youtu\.be/i),
  };
}

// Third-party form / booking widgets are embedded via <iframe> or <script>, so
// a native <form> is often absent even though the page clearly has a way to get
// in touch. Treat any of these as a contact mechanism.
const EMBED_FORM_RE =
  /(typeform|hubspot|jotform|wufoo|formstack|docs\.google\.com\/forms|forms\.gle|tally\.so|calendly|acuityscheduling|squarespace-cdn\.com\/.*form|gravity|contact-form-7|wpcf7|elementor-form)/i;

export function detectFeatures($, html) {
  const h = html.toLowerCase();
  const hasNativeForm = $("form").length > 0;
  const hasEmbed =
    EMBED_FORM_RE.test(html) ||
    $("iframe[src]").toArray().some((el) => EMBED_FORM_RE.test($(el).attr("src") || ""));
  const hasForm = hasNativeForm || hasEmbed || /mailto:/i.test(html);
  const ctaWords = ["contact", "book", "get a quote", "call now", "sign up", "get started", "buy", "order", "schedule"];
  const cta =
    ctaWords.some((w) => h.includes(w)) &&
    ($("a,button").filter((_, el) => ctaWords.some((w) => $(el).text().toLowerCase().includes(w))).length > 0);
  const trustWords = ["testimonial", "review", "certified", "guarantee", "trusted", "award", "accredited", "5 star"];
  const trustIndicators = trustWords.some((w) => h.includes(w));
  const hasViewport = $('meta[name="viewport"]').length > 0;
  return { contactForm: hasForm, cta, trustIndicators, hasViewport, email: extractEmail($, html) };
}

// First real contact email on the page — prefer an explicit mailto: link, then
// fall back to a plain-text address. Skips obvious noise (asset filenames,
// sentry/wix/example placeholders).
export function extractEmail($, html) {
  const clean = (e) => e?.trim().toLowerCase().replace(/[.,;:)]+$/, "");
  const bad = /(sentry|wixpress|example\.|\.png|\.jpg|\.gif|\.svg|@2x|domain\.com|email\.com|yourdomain)/i;
  for (const el of $('a[href^="mailto:"]').toArray()) {
    const raw = clean(($(el).attr("href") || "").replace(/^mailto:/i, "").split("?")[0]);
    if (raw && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(raw) && !bad.test(raw)) return raw;
  }
  const m = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  for (const cand of m) {
    const e = clean(cand);
    if (e && !bad.test(e)) return e;
  }
  return null;
}

// Find a same-origin "contact us" page so a form living off the homepage still
// counts. Returns an absolute URL or null.
export function findContactUrl($, baseUrl) {
  const re = /(contact|kontakt|get in touch|reach us|enquir|inquir|book now|booking)/i;
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return null;
  }
  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href") || "";
    const text = $(el).text() || "";
    if (!re.test(href) && !re.test(text)) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.origin === origin && abs.href.replace(/#.*$/, "") !== baseUrl.replace(/#.*$/, "")) {
        return abs.href;
      }
    } catch {
      /* skip malformed href */
    }
  }
  return null;
}

// Check robots.txt + sitemap.xml existence off the site origin.
export async function checkAuxFiles(finalUrl) {
  let robots = false;
  let sitemap = false;
  try {
    const origin = new URL(finalUrl).origin;
    const [r, s] = await Promise.allSettled([
      fetchWithTimeout(`${origin}/robots.txt`, 6000),
      fetchWithTimeout(`${origin}/sitemap.xml`, 6000),
    ]);
    robots = r.status === "fulfilled" && r.value.ok;
    sitemap = s.status === "fulfilled" && s.value.ok;
  } catch {
    /* ignore */
  }
  return { robots, sitemap };
}

// Full HTML-based analysis of a site. Returns the `website`, `seo`, `tech`,
// `social` sub-objects (PageSpeed + screenshots layered on by the caller).
export async function analyzeWebsite(rawUrl) {
  const site = await fetchSite(rawUrl);
  if (!site.exists) {
    return {
      website: { exists: false },
      seo: null,
      tech: null,
      social: null,
    };
  }
  if (!site.ok || !site.html) {
    return {
      website: {
        exists: true,
        reachable: false,
        https: site.https,
        error: site.error || `HTTP ${site.status}`,
      },
      seo: null,
      tech: null,
      social: null,
    };
  }

  const $ = cheerio.load(site.html);
  const seo = parseSeo($);
  const tech = detectTech(site.html, site.headers, $);
  const social = detectSocial($);
  const features = detectFeatures($, site.html);
  const aux = await checkAuxFiles(site.finalUrl);

  // The homepage often has no form because "Contact us" is its own page (or the
  // form/email lives there). If we didn't see a contact mechanism or email up
  // front, follow the contact link once and re-check before concluding "none".
  let contactForm = features.contactForm;
  let contactEmail = features.email;
  if (!contactForm || !contactEmail) {
    const contactUrl = findContactUrl($, site.finalUrl);
    if (contactUrl) {
      const sub = await fetchSite(contactUrl);
      if (sub.ok && sub.html) {
        const $$ = cheerio.load(sub.html);
        const subFeat = detectFeatures($$, sub.html);
        contactForm = contactForm || subFeat.contactForm;
        contactEmail = contactEmail || subFeat.email;
      }
    }
  }

  return {
    finalUrl: site.finalUrl,
    contactEmail: contactEmail || null,
    website: {
      exists: true,
      reachable: true,
      https: site.https,
      ssl: site.https,
      loadTimeMs: site.loadTimeMs,
      fast: site.loadTimeMs < 3000,
      modern: tech.modern,
      responsive: features.hasViewport, // refined by PageSpeed later
      mobileFriendly: features.hasViewport, // refined by PageSpeed later
      contactForm,
      cta: features.cta,
      trustIndicators: features.trustIndicators,
      contactEmail: contactEmail || null,
      brokenPages: false,
    },
    seo: { ...seo, ...aux },
    tech,
    social,
  };
}
