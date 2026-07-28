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

export function detectFeatures($, html) {
  const h = html.toLowerCase();
  const hasForm = $("form").length > 0 || /mailto:/i.test(html);
  const ctaWords = ["contact", "book", "get a quote", "call now", "sign up", "get started", "buy", "order", "schedule"];
  const cta =
    ctaWords.some((w) => h.includes(w)) &&
    ($("a,button").filter((_, el) => ctaWords.some((w) => $(el).text().toLowerCase().includes(w))).length > 0);
  const trustWords = ["testimonial", "review", "certified", "guarantee", "trusted", "award", "accredited", "5 star"];
  const trustIndicators = trustWords.some((w) => h.includes(w));
  const hasViewport = $('meta[name="viewport"]').length > 0;
  return { contactForm: hasForm, cta, trustIndicators, hasViewport };
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

  return {
    finalUrl: site.finalUrl,
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
      contactForm: features.contactForm,
      cta: features.cta,
      trustIndicators: features.trustIndicators,
      brokenPages: false,
    },
    seo: { ...seo, ...aux },
    tech,
    social,
  };
}
