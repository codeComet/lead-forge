// Homepage scraper for the custom / redesign website generator.
//
// When a user pastes a URL into the custom demo prompt, we fetch that homepage
// and distil it into a compact digest (nav, sections, headings, copy, CTAs,
// images, footer) that Claude can rebuild from while preserving the site's
// existing structure. HTML-only — no headless browser (that decision is
// deliberate: cheerio is the cheap parse-only path, same as the audit).

import * as cheerio from "cheerio";
import { fetchSite } from "../audit/website.js";

// Pull the first http(s) URL out of a free-text instruction. Users paste a link
// somewhere in their prompt ("redesign https://acme.com keeping all sections").
const URL_RE = /https?:\/\/[^\s"'<>)]+/i;
export function extractUrl(text) {
  const m = String(text || "").match(URL_RE);
  return m ? m[0].replace(/[.,;:]+$/, "") : null;
}

// Keep the digest token-bounded: cap counts and truncate long strings so a
// bloated source page can't blow the prompt budget.
const clip = (s, n) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};
const NAV_MAX = 12;
const SECTION_MAX = 14;
const IMG_MAX = 16;

// Resolve a possibly-relative asset/link URL against the page's final URL so the
// redesign can reuse the original images verbatim.
function absolutize(src, base) {
  if (!src) return null;
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

/**
 * Fetch + parse a homepage into a compact digest for the redesign prompt.
 * Returns null if the page can't be fetched or has no usable HTML. Shape:
 *   { finalUrl, title, description, nav[], headings[], sections[], ctas[],
 *     images[], footer }
 */
export async function scrapeHomepage(rawUrl) {
  const site = await fetchSite(rawUrl);
  if (!site?.ok || !site.html) return null;

  const base = site.finalUrl || rawUrl;
  const $ = cheerio.load(site.html);
  // Drop noise that would pollute the text extraction.
  $("script, style, noscript, svg, iframe").remove();

  const title = clip($("title").first().text(), 160);
  const description =
    clip($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content"), 300) ||
    null;

  // Nav links — the site's information architecture.
  const nav = [];
  const seenNav = new Set();
  $("header a, nav a").each((_, el) => {
    const text = clip($(el).text(), 40);
    const href = $(el).attr("href");
    if (!text || seenNav.has(text.toLowerCase())) return;
    seenNav.add(text.toLowerCase());
    nav.push({ text, href: href || null });
  });

  // Section-level content in DOM order: each <section>/<main> child or top-level
  // block contributes its heading + a snippet of its text.
  const sections = [];
  const blocks = $("section, main > div, body > div, article").toArray();
  for (const el of blocks) {
    if (sections.length >= SECTION_MAX) break;
    const $el = $(el);
    const heading = clip($el.find("h1, h2, h3").first().text(), 120);
    const text = clip($el.text(), 600);
    if (!text || text.length < 20) continue;
    // Skip a wrapper whose text is just its child section repeated.
    if (sections.some((s) => s.text && text.startsWith(s.text.slice(0, 80)))) continue;
    sections.push({ heading: heading || null, text });
  }
  // Fallback: if the DOM had no useful section blocks, grab headings + paragraphs.
  if (sections.length === 0) {
    $("h1, h2, h3, p").each((_, el) => {
      if (sections.length >= SECTION_MAX) return;
      const text = clip($(el).text(), 400);
      if (text && text.length > 20) sections.push({ heading: null, text });
    });
  }

  // Headings outline.
  const headings = [];
  $("h1, h2, h3").each((_, el) => {
    if (headings.length >= 30) return;
    const text = clip($(el).text(), 120);
    if (text) headings.push({ level: el.name || "h3", text });
  });

  // Buttons / CTAs.
  const ctas = [];
  const seenCta = new Set();
  $("a.btn, a.button, button, a[class*='cta'], a[href^='tel:'], a[href^='mailto:']").each((_, el) => {
    const text = clip($(el).text(), 40);
    if (!text || seenCta.has(text.toLowerCase())) return;
    seenCta.add(text.toLowerCase());
    ctas.push(text);
  });

  // Real images from the source — reused verbatim in the redesign where they fit.
  const images = [];
  const seenImg = new Set();
  $("img").each((_, el) => {
    if (images.length >= IMG_MAX) return;
    const raw = $(el).attr("src") || $(el).attr("data-src");
    const src = absolutize(raw, base);
    if (!src || src.startsWith("data:") || seenImg.has(src)) return;
    seenImg.add(src);
    images.push({ src, alt: clip($(el).attr("alt"), 100) || null });
  });

  const footer = clip($("footer").first().text(), 400) || null;

  return {
    finalUrl: base,
    title: title || null,
    description,
    nav: nav.slice(0, NAV_MAX),
    headings,
    sections,
    ctas: ctas.slice(0, 16),
    images,
    footer,
  };
}
