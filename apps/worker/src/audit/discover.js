// Best-effort discovery of a business's real website + social profiles when
// Google Places didn't return a website URL.
//
// Many Places listings simply omit `websiteUri` even though the business has a
// perfectly good site — so an audit falsely reports "no website". Before
// concluding that, we run a plain web search for the business name + city and
// pick the most likely official domain, skipping directories and social hosts.
// Social profile URLs found along the way are returned too, so a business with
// no website is still enriched with its Facebook/Instagram/etc.
//
// This is best-effort and must never throw: search engines rate-limit and
// change markup, so every failure path returns empty and the audit continues.

import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Hosts that are never the business's own website — directories, aggregators,
// social networks, maps, review sites. A hit here is a social link at best.
const NON_SITE_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "youtube.com",
  "youtu.be", "twitter.com", "x.com", "pinterest.com", "yelp.com", "google.com",
  "goo.gl", "maps.google", "g.page", "tripadvisor.", "foursquare.com",
  "yellowpages.", "yell.com", "bbb.org", "trustpilot.com", "booking.com",
  "opentable.", "ubereats.com", "doordash.com", "grubhub.com", "wa.me",
  "whatsapp.com", "bing.com", "duckduckgo.com", "wikipedia.org", "amazon.",
  "apple.com", "play.google.com", "justdial.com", "indeed.com", "glassdoor.",
  "zomato.com", "thumbtack.com", "angi.com", "houzz.com", "nextdoor.com",
];

const SOCIAL_MATCHERS = [
  ["facebook", /(?:^|\.)facebook\.com$/i],
  ["instagram", /(?:^|\.)instagram\.com$/i],
  ["linkedin", /(?:^|\.)linkedin\.com$/i],
  ["tiktok", /(?:^|\.)tiktok\.com$/i],
  ["youtube", /(?:^|\.)(youtube\.com|youtu\.be)$/i],
];

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isNonSiteHost(host) {
  return NON_SITE_HOSTS.some((h) => host === h || host.includes(h) || host.endsWith("." + h));
}

// Significant lowercased tokens from the business name (drop common suffixes and
// short filler words) — used to judge whether a domain plausibly belongs to it.
function nameTokens(name) {
  const stop = new Set([
    "the", "and", "of", "for", "ltd", "llc", "inc", "co", "company", "group",
    "services", "service", "and", "&", "restaurant", "cafe", "salon", "clinic",
  ]);
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
}

// Does a domain look like it belongs to this business? True when the domain's
// second-level label shares a meaningful token with the name.
function domainMatchesName(host, tokens) {
  if (!host) return false;
  const label = host.split(".")[0].replace(/[^a-z0-9]/g, "");
  if (!label) return false;
  return tokens.some((t) => label.includes(t) || t.includes(label));
}

async function fetchText(url, ms = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// DuckDuckGo's HTML endpoint wraps every result href in a redirect that carries
// the true URL in the `uddg` query param — unwrap it.
function unwrapDdg(href) {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const target = u.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : href;
  } catch {
    return href;
  }
}

// Return an ordered list of candidate result URLs from a search engine.
async function searchResults(query) {
  const q = encodeURIComponent(query);

  // 1. DuckDuckGo HTML (no key, stable-ish markup).
  const ddg = await fetchText(`https://html.duckduckgo.com/html/?q=${q}`);
  if (ddg) {
    const $ = cheerio.load(ddg);
    const urls = $("a.result__a")
      .toArray()
      .map((el) => unwrapDdg($(el).attr("href") || ""))
      .filter((u) => /^https?:\/\//i.test(u));
    if (urls.length) return urls;
  }

  // 2. Bing fallback.
  const bing = await fetchText(`https://www.bing.com/search?q=${q}&setlang=en`);
  if (bing) {
    const $ = cheerio.load(bing);
    const urls = $("li.b_algo h2 a, h2 a")
      .toArray()
      .map((el) => $(el).attr("href") || "")
      .filter((u) => /^https?:\/\//i.test(u));
    if (urls.length) return urls;
  }

  return [];
}

/**
 * Find a business's likely official website + social profiles via web search.
 * @param {{name?:string, city?:string, address?:string}} business
 * @returns {Promise<{website:string|null, social:object}>}
 */
export async function discoverBusiness(business) {
  const empty = { website: null, social: {} };
  const name = (business?.name || "").trim();
  if (!name) return empty;

  const place = business?.city || business?.address || "";
  const query = `${name} ${place}`.trim() + " official website";

  let results;
  try {
    results = await searchResults(query);
  } catch {
    return empty;
  }
  if (!results?.length) return empty;

  const tokens = nameTokens(name);
  const social = {};
  let bestMatch = null; // domain matches the name → high confidence
  let firstSite = null; // first plausible non-directory site → fallback

  for (const url of results) {
    const host = hostOf(url);
    if (!host) continue;

    // Capture the first profile per social platform (only if we don't have one).
    for (const [key, re] of SOCIAL_MATCHERS) {
      if (!social[key] && re.test(host)) social[key] = url.split("#")[0];
    }

    if (isNonSiteHost(host)) continue;
    if (!firstSite) firstSite = url.split("#")[0];
    if (!bestMatch && domainMatchesName(host, tokens)) bestMatch = url.split("#")[0];
    if (bestMatch && Object.keys(social).length >= 2) break;
  }

  return { website: bestMatch || firstSite || null, social };
}
