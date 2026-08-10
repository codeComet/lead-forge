// Rendering for outreach email bodies.
//
// Cold 1:1 outreach lands in Gmail's Promotions tab when it carries bulk-mail
// markers: a tracking pixel, links rewritten to a domain that doesn't match the
// sending domain, a marketing-styled footer, and no text/plain part. This
// renders the opposite — a message shaped like one a person typed.
//
// Opens are deliberately not tracked. Apple Mail Privacy Protection preloads
// images (phantom opens) and Gmail proxies or blocks them (missed opens), so
// pixel data was noise; clicks reflect a deliberate action and are kept.

/** Strip the trailing slash so `${base}/api/...` never doubles up. */
function trim(url) {
  return String(url || "").replace(/\/+$/, "");
}

/**
 * Base URL for tracked links. Point TRACKING_URL at a subdomain of the sending
 * domain (e.g. https://track.devbishal.com) so the link domain aligns with the
 * From domain — a mismatch is itself a promotions/spam signal.
 */
export function trackingBase(env = process.env) {
  return trim(env.TRACKING_URL || env.NEXT_PUBLIC_TRACK_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
}

export function appBase(env = process.env) {
  return trim(env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
}

export function unsubscribeLink(trackingId, toEmail, env = process.env) {
  return `${trackingBase(env)}/api/unsubscribe?email=${encodeURIComponent(toEmail)}&id=${trackingId}`;
}

/**
 * Turn a raw body (plain text or HTML) into the HTML part: links rewritten
 * through the click tracker, plus a plain-text-style unsubscribe signature.
 */
export function instrument(rawBody, trackingId, toEmail, env = process.env) {
  // Plain text: linkify bare URLs (so they're clickable + tracked), then turn
  // newlines into <br> before the href rewrite below.
  const looksHtml = /<[a-z][\s\S]*>/i.test(rawBody);
  const html = looksHtml
    ? rawBody
    : rawBody
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
        .replace(/\n/g, "<br>");

  const clickBase = `${trackingBase(env)}/api/track/click?id=${trackingId}&url=`;
  const tracked = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_, url) => `href="${clickBase}${encodeURIComponent(url)}"`);

  // `-- ` is the conventional signature separator in personal mail; no styled
  // wrapper, no colours, no image. Keeps the compliance opt-out without the
  // marketing-footer look.
  const unsub = unsubscribeLink(trackingId, toEmail, env);
  const footer = `<br><br>--<br>Don't want to hear from me? <a href="${unsub}">Unsubscribe</a>.`;
  return `${tracked}${footer}`;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/**
 * text/plain alternative for the HTML body. Every real mail client sends one;
 * an HTML-only message is a bulk-mail tell. Anchors keep their (tracked) URL so
 * plain-text readers get the same links.
 */
export function toPlainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      // A bare URL as the label is the common case (the body was plain text and
      // got linkified) — print it alone rather than "url (tracked-url)", which
      // looks machine-generated. Anchors with real link text keep the URL.
      if (!text) return href;
      return /^https?:\/\//i.test(text) ? text : `${text} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
