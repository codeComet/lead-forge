// Google PageSpeed Insights (Lighthouse) — performance / SEO / accessibility
// scores without running Lighthouse ourselves. Best-effort: returns null if no
// key is configured or the call fails.

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function runPageSpeed(url) {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key || !url) return null;

  const params = new URLSearchParams({ url, key, strategy: "mobile" });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) {
    params.append("category", c);
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 45000);
    const res = await fetch(`${PSI_URL}?${params}`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();

    const cats = json?.lighthouseResult?.categories ?? {};
    const audits = json?.lighthouseResult?.audits ?? {};
    const pct = (c) => (cats[c]?.score != null ? Math.round(cats[c].score * 100) : null);

    // Loading Experience field data (real-world) if present.
    const lcp = audits["largest-contentful-paint"]?.numericValue ?? null;
    const tti = audits["interactive"]?.numericValue ?? null;

    // Mobile-friendliness is about layout, NOT speed. Lighthouse's `viewport`
    // audit (has a configured <meta viewport>) is the real signal; a slow but
    // responsive site is still mobile-friendly. Only fall back to null (not a
    // perf guess) when the audit is absent.
    const viewportScore = audits["viewport"]?.score;
    return {
      performance: pct("performance"),
      seo: pct("seo"),
      accessibility: pct("accessibility"),
      bestPractices: pct("best-practices"),
      lcpMs: lcp != null ? Math.round(lcp) : null,
      ttiMs: tti != null ? Math.round(tti) : null,
      mobileFriendly: viewportScore != null ? viewportScore === 1 : null,
    };
  } catch {
    return null;
  }
}
