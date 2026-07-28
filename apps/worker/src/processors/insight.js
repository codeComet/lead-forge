import { buildInsightRequest } from "@leadforge/shared/prompts";
import { MODELS } from "@leadforge/shared/constants";
import { supabase } from "../lib/supabase.js";
import { structuredCall } from "../lib/anthropic.js";

// Turn an audit into a structured, human-readable insight via Claude, and store
// it on the lead. Non-fatal: if the AI call fails the lead still has its
// deterministic score + reasons from the audit stage.
export async function processInsight(job) {
  const { businessId } = job.data;

  const [{ data: business }, { data: audit }, { data: lead }] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).single(),
    supabase.from("audits").select("*").eq("business_id", businessId).single(),
    supabase.from("leads").select("*").eq("business_id", businessId).single(),
  ]);
  if (!business || !audit) throw new Error(`missing business/audit for ${businessId}`);

  const auditObj = {
    website: audit.website,
    seo: audit.seo,
    tech: audit.tech,
    gbp: audit.gbp,
    social: audit.social,
  };

  const { system, user, tool } = buildInsightRequest(business, auditObj);
  const { data } = await structuredCall({
    model: MODELS.default,
    system,
    user,
    tool,
    maxTokens: 2048,
  });

  await supabase
    .from("leads")
    .update({
      insight: {
        summary: data.summary,
        problems: data.problems ?? [],
        improvements: data.improvements ?? [],
        estimatedMissedCustomersPerMonth: data.estimatedMissedCustomersPerMonth ?? null,
        estimatedLostRevenuePerMonth: data.estimatedLostRevenuePerMonth ?? null,
      },
    })
    .eq("id", lead?.id ?? businessId)
    .eq("business_id", businessId);

  return { businessId, summarized: true };
}
