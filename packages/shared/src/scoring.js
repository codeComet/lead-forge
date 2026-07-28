// Deterministic, explainable lead scoring.
//
// A HIGH score = a HIGH-value outreach opportunity: the business has many
// problems we can fix (no site, slow, weak SEO, poor reputation). The AI layer
// only supplies prose around these rule-based reasons — the number itself is
// always reproducible from the audit data.

// Each rule: given the audit, return points to add + a human reason when it
// fires. Rules are intentionally small and independent so the breakdown is
// auditable.
const RULES = [
  // — Website existence (dominant signal) —
  {
    key: "no-website",
    weight: 72,
    reason: "No website found",
    test: (a) => a?.website?.exists === false,
  },

  // The rest only matter when a site exists.
  {
    key: "no-ssl",
    weight: 12,
    reason: "No SSL / HTTPS",
    test: (a) => a?.website?.exists && (a.website.https === false || a.website.ssl === false),
  },
  {
    key: "not-mobile-friendly",
    weight: 12,
    reason: "Not mobile friendly",
    test: (a) => a?.website?.exists && a.website.mobileFriendly === false,
  },
  {
    key: "not-responsive",
    weight: 8,
    reason: "Layout not responsive",
    test: (a) => a?.website?.exists && a.website.responsive === false,
  },
  {
    key: "slow",
    weight: 8,
    reason: "Slow page load",
    test: (a) => a?.website?.exists && a.website.fast === false,
  },
  {
    key: "outdated-design",
    weight: 8,
    reason: "Outdated design",
    test: (a) => a?.website?.exists && a.website.modern === false,
  },
  {
    key: "broken-pages",
    weight: 5,
    reason: "Broken pages detected",
    test: (a) => a?.website?.exists && a.website.brokenPages === true,
  },
  {
    key: "no-contact-form",
    weight: 4,
    reason: "No contact form",
    test: (a) => a?.website?.exists && a.website.contactForm === false,
  },
  {
    key: "weak-cta",
    weight: 3,
    reason: "Weak call-to-action",
    test: (a) => a?.website?.exists && a.website.cta === false,
  },
  {
    key: "no-trust",
    weight: 3,
    reason: "Missing trust indicators",
    test: (a) => a?.website?.exists && a.website.trustIndicators === false,
  },

  // — SEO —
  {
    key: "no-meta-title",
    weight: 4,
    reason: "Missing meta title",
    test: (a) => a?.website?.exists && a?.seo && !a.seo.metaTitle,
  },
  {
    key: "no-meta-desc",
    weight: 3,
    reason: "Missing meta description",
    test: (a) => a?.website?.exists && a?.seo && !a.seo.metaDescription,
  },
  {
    key: "no-h1",
    weight: 3,
    reason: "Missing H1 heading",
    test: (a) => a?.website?.exists && a?.seo && !a.seo.h1,
  },
  {
    key: "missing-alt",
    weight: 2,
    reason: "Images missing alt text",
    test: (a) => a?.website?.exists && a?.seo && Number(a.seo.missingAltCount) > 0,
  },
  {
    key: "no-sitemap",
    weight: 2,
    reason: "No sitemap.xml",
    test: (a) => a?.website?.exists && a?.seo && a.seo.sitemap === false,
  },
  {
    key: "no-robots",
    weight: 1,
    reason: "No robots.txt",
    test: (a) => a?.website?.exists && a?.seo && a.seo.robots === false,
  },
  {
    key: "low-pagespeed",
    weight: 6,
    reason: "Low PageSpeed score",
    test: (a) => a?.website?.exists && a?.seo && Number.isFinite(a.seo.pageSpeedScore) && a.seo.pageSpeedScore < 50,
  },
  {
    key: "low-seo",
    weight: 5,
    reason: "Low SEO score",
    test: (a) => a?.website?.exists && a?.seo && Number.isFinite(a.seo.seoScore) && a.seo.seoScore < 50,
  },

  // — Reputation (Google Business) —
  {
    key: "low-rating",
    weight: 6,
    reason: "Low Google rating",
    test: (a) => Number.isFinite(a?.gbp?.rating) && a.gbp.rating > 0 && a.gbp.rating < 4.0,
  },
  {
    key: "few-reviews",
    weight: 5,
    reason: "Very few reviews",
    test: (a) => Number.isFinite(a?.gbp?.reviews) && a.gbp.reviews < 20,
  },

  // — Social presence —
  {
    key: "no-social",
    weight: 6,
    reason: "No social media presence",
    test: (a) => {
      const s = a?.social;
      if (!s) return false;
      return !s.facebook && !s.instagram && !s.linkedin && !s.tiktok && !s.youtube;
    },
  },
];

/**
 * Compute a lead score from an audit object.
 * @param {object} audit
 * @returns {{ score: number, color: "green"|"orange"|"red", reasons: {key:string,reason:string,weight:number}[] }}
 */
export function computeLeadScore(audit) {
  const reasons = [];
  let raw = 0;

  for (const rule of RULES) {
    try {
      if (rule.test(audit)) {
        raw += rule.weight;
        reasons.push({ key: rule.key, reason: rule.reason, weight: rule.weight });
      }
    } catch {
      // A malformed audit field must never crash scoring.
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  reasons.sort((a, b) => b.weight - a.weight);

  return { score, color: scoreColor(score), reasons };
}

/** Map a 0–100 score to a traffic-light colour. */
export function scoreColor(score) {
  if (score >= 70) return "green";
  if (score >= 40) return "orange";
  return "red";
}
