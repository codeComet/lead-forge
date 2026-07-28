import { NextResponse } from "next/server";
import { buildProposalRequest } from "@leadforge/shared/prompts";
import { MODELS } from "@leadforge/shared/constants";
import { getUserAndOrg } from "@/lib/org";
import { textCall } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, orgId, user } = session;

  const { leadId } = await request.json().catch(() => ({}));
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("org_id", orgId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [{ data: business }, { data: audit }] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", lead.business_id).single(),
    supabase.from("audits").select("*").eq("business_id", lead.business_id).maybeSingle(),
  ]);

  const auditObj = audit
    ? { website: audit.website, seo: audit.seo, tech: audit.tech, gbp: audit.gbp, social: audit.social }
    : {};

  const { system, user: userPrompt } = buildProposalRequest(business, auditObj, lead);

  let body;
  let usage;
  try {
    const r = await textCall({ model: MODELS.default, system, user: userPrompt, maxTokens: 1024 });
    body = r.text;
    usage = r.usage;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      org_id: orgId,
      lead_id: leadId,
      subject: `A quick idea for ${business?.name ?? "your business"}`,
      body,
      model: MODELS.default,
      tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposal });
}
