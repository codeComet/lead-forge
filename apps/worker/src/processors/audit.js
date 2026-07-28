import { computeLeadScore } from "@leadforge/shared/scoring";
import { QUEUE_NAMES, JOB_NAMES } from "@leadforge/shared/constants";
import { supabase } from "../lib/supabase.js";
import { analyzeWebsite } from "../audit/website.js";
import { runPageSpeed } from "../audit/pagespeed.js";
import { captureScreenshots } from "../audit/screenshot.js";

// Quality score for the site itself (HIGH = good site). Distinct from the lead
// score (HIGH = good opportunity).
function websiteQuality(website, pagespeed) {
  if (!website?.exists) return 0;
  if (!website.reachable) return 5;
  let s = 100;
  if (!website.https) s -= 20;
  if (website.mobileFriendly === false) s -= 20;
  if (website.fast === false) s -= 15;
  if (website.modern === false) s -= 15;
  if (website.contactForm === false) s -= 10;
  if (website.trustIndicators === false) s -= 10;
  s = Math.max(0, Math.min(100, s));
  if (pagespeed?.performance != null) s = Math.round((s + pagespeed.performance) / 2);
  return s;
}

function seoQuality(seo, pagespeed) {
  if (pagespeed?.seo != null) return pagespeed.seo;
  if (!seo) return 0;
  let s = 100;
  if (!seo.metaTitle) s -= 20;
  if (!seo.metaDescription) s -= 15;
  if (!seo.h1) s -= 15;
  if (seo.missingAltCount > 0) s -= 10;
  if (!seo.sitemap) s -= 10;
  if (!seo.robots) s -= 5;
  if (!seo.structuredData) s -= 10;
  return Math.max(0, Math.min(100, s));
}

export async function processAudit(job) {
  const { businessId, orgId } = job.data;

  // Mark running.
  await supabase
    .from("audits")
    .upsert({ business_id: businessId, org_id: orgId, status: "running" }, { onConflict: "business_id" });

  const { data: business, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();
  if (error || !business) throw new Error(`business ${businessId} not found`);

  // 1. HTML analysis.
  const analysis = await analyzeWebsite(business.website);

  // 2. PageSpeed + screenshots (only if the site is actually reachable).
  let pagespeed = null;
  let shots = { desktop: null, mobile: null };
  if (analysis.website?.exists && analysis.website?.reachable && analysis.finalUrl) {
    [pagespeed, shots] = await Promise.all([
      runPageSpeed(analysis.finalUrl),
      captureScreenshots({ orgId, businessId, url: analysis.finalUrl }).catch((e) => {
        console.error("[audit] screenshot error:", e.message);
        return { desktop: null, mobile: null };
      }),
    ]);
  }

  // Refine mobile/responsive/accessibility from PageSpeed where available.
  const website = { ...(analysis.website ?? {}) };
  const seo = { ...(analysis.seo ?? {}) };
  if (pagespeed) {
    if (pagespeed.mobileFriendly != null) {
      website.mobileFriendly = pagespeed.mobileFriendly;
      website.responsive = pagespeed.mobileFriendly;
    }
    if (pagespeed.performance != null) website.fast = pagespeed.performance >= 50;
    seo.pageSpeedScore = pagespeed.performance;
    seo.accessibilityScore = pagespeed.accessibility;
  }

  // 3. Google Business signals (from the Places record).
  const gbp = { rating: business.rating, reviews: business.reviews };

  const websiteScore = websiteQuality(website, pagespeed);
  const seoScore = seoQuality(seo, pagespeed);
  seo.seoScore = seoScore;

  const auditObj = { website, seo, tech: analysis.tech, gbp, social: analysis.social };

  // 4. Lead score (deterministic, shared with the web app).
  const { score, color, reasons } = computeLeadScore(auditObj);

  // 5. Persist audit.
  await supabase
    .from("audits")
    .update({
      status: "done",
      website,
      seo,
      tech: analysis.tech,
      gbp,
      social: analysis.social,
      website_score: websiteScore,
      seo_score: seoScore,
      overall_score: score,
      screenshot_desktop: shots.desktop,
      screenshot_mobile: shots.mobile,
      error: null,
    })
    .eq("business_id", businessId);

  // 6. Update the lead.
  await supabase
    .from("leads")
    .update({ lead_score: score, color, reasons })
    .eq("business_id", businessId);

  // 7. Queue the AI insight (P3). Best-effort — imported lazily to avoid a hard
  // dependency during earlier phases.
  try {
    const { insightQueue } = await import("../queues.js");
    await insightQueue.add(
      JOB_NAMES.generateInsight,
      { businessId, orgId },
      { attempts: 2, removeOnComplete: 500, removeOnFail: 200 },
    );
  } catch (e) {
    console.error("[audit] could not enqueue insight:", e.message);
  }

  return { businessId, score, color };
}

export const AUDIT_QUEUE = QUEUE_NAMES.audit;
