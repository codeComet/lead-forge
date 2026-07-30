import { buildProposalRequest, buildProposalRefineRequest } from "@leadforge/shared/prompts";
import { MODELS } from "@leadforge/shared/constants";
import { supabase } from "../lib/supabase.js";
import { textCall } from "../lib/anthropic.js";

// Generate a personalised outreach proposal for a lead. `refine: true` runs a
// second Opus pass to tighten the copy.
export async function processProposal(job) {
  const { leadId, orgId, refine = true, createdBy = null } = job.data;

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (!lead) throw new Error(`lead ${leadId} not found`);

  const [{ data: business }, { data: audit }, { data: demo }] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", lead.business_id).single(),
    supabase.from("audits").select("*").eq("business_id", lead.business_id).single(),
    // Newest ready demo site for this business, if one has been generated.
    supabase
      .from("website_demos")
      .select("id, slug")
      .eq("business_id", lead.business_id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const auditObj = audit
    ? { website: audit.website, seo: audit.seo, tech: audit.tech, gbp: audit.gbp, social: audit.social }
    : {};

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Short /p/<slug> link (falls back to the uuid path for pre-slug demos).
  const demoUrl = demo?.slug
    ? `${appUrl}/p/${demo.slug}`
    : demo?.id
      ? `${appUrl}/preview/${demo.id}`
      : null;

  const { system, user } = buildProposalRequest(business, auditObj, lead, demoUrl);
  let { text: body, usage } = await textCall({
    model: MODELS.default,
    system,
    user,
    maxTokens: 1024,
  });

  let model = MODELS.default;
  if (refine && body) {
    try {
      const refined = await textCall({
        ...buildProposalRefineRequest(body, business),
        model: MODELS.longform,
        maxTokens: 1024,
        thinking: false,
      });
      if (refined.text) {
        body = refined.text;
        model = MODELS.longform;
        usage = refined.usage;
      }
    } catch (e) {
      console.error("[proposal] refine failed, keeping draft:", e.message);
    }
  }

  const subject = `A quick idea for ${business?.name ?? "your business"}`;
  const tokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

  // Regenerating replaces the lead's existing proposal instead of stacking a new
  // one. Update the newest row in place (keeps its id so any sent email's
  // proposal_id stays linked) and drop older duplicates.
  const { data: existing } = await supabase
    .from("proposals")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  const fields = { org_id: orgId, lead_id: leadId, subject, body, model, tokens, created_by: createdBy };

  let proposal;
  if (existing?.length) {
    const [keep, ...stale] = existing;
    ({ data: proposal } = await supabase
      .from("proposals")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", keep.id)
      .select()
      .single());
    if (stale.length) {
      await supabase.from("proposals").delete().in("id", stale.map((p) => p.id));
    }
  } else {
    ({ data: proposal } = await supabase.from("proposals").insert(fields).select().single());
  }

  return { proposalId: proposal?.id, leadId };
}
