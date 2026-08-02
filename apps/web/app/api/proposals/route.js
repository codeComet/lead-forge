import { NextResponse } from "next/server";
import { buildProposalRequest, parseLocalizedProposal } from "@leadforge/shared/prompts";
import { MODELS } from "@leadforge/shared/constants";
import { getUserAndOrg } from "@/lib/org";
import { textCall } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, orgId, user } = session;

  const { leadId, channel: rawChannel, instructions } = await request.json().catch(() => ({}));
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });
  const channel = rawChannel === "instagram" ? "instagram" : "email";
  // Optional sender-supplied extra points to weave into the proposal.
  const extraPoints = typeof instructions === "string" ? instructions.slice(0, 2000) : "";

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("org_id", orgId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [{ data: business }, { data: audit }, { data: demo }] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", lead.business_id).single(),
    supabase.from("audits").select("*").eq("business_id", lead.business_id).maybeSingle(),
    // Newest ready demo for this business — the Instagram DM is built around its
    // preview link, so we fetch it up front.
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

  // Instagram DMs revolve around the demo preview link; the email flow adds the
  // link separately in the UI, so only pass it here for the Instagram channel.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const demoUrl =
    channel === "instagram" && demo
      ? demo.slug
        ? `${appUrl}/p/${demo.slug}`
        : `${appUrl}/preview/${demo.id}`
      : null;

  const { system, user: userPrompt } = buildProposalRequest(business, auditObj, lead, demoUrl, channel, extraPoints);

  let raw;
  let usage;
  try {
    // Larger cap: the model returns the local-language message AND an English
    // translation, so the response is roughly twice a single-language draft.
    const r = await textCall({ model: MODELS.default, system, user: userPrompt, maxTokens: 2048 });
    raw = r.text;
    usage = r.usage;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  // Split the local-language body from its English translation. `body` (local
  // language) is what actually gets sent; the translation is for the sender to
  // verify the wording.
  const { language, body, translation } = parseLocalizedProposal(raw);

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      org_id: orgId,
      lead_id: leadId,
      channel,
      subject:
        channel === "instagram"
          ? `Instagram DM for ${business?.name ?? "your business"}`
          : `A quick idea for ${business?.name ?? "your business"}`,
      body,
      body_translation: translation,
      language,
      model: MODELS.default,
      tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposal });
}
