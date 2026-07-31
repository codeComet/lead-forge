import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";
import { enqueueWebsite } from "@/lib/queue";
import { availableProviders } from "@leadforge/shared/providers";

export const runtime = "nodejs";

// Short, URL-safe public preview code (base62). 8 chars ≈ 218 trillion values —
// collisions are negligible, and the unique index would reject one anyway.
const B62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function shortCode(len = 8) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += B62[bytes[i] % 62];
  return out;
}

// Kick off (or re-generate) an AI demo website for a business. Creates a
// website_demos row in `pending` and enqueues the worker job.
export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, orgId, user } = session;

  const { businessId, provider, force } = await request.json().catch(() => ({}));
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  // Optional per-build provider override. Ignore anything without a key set —
  // the worker falls back to the org's saved choice / first available.
  const providerOverride =
    provider && availableProviders().includes(provider) ? provider : undefined;

  // Ownership check.
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const { data: demo, error } = await supabase
    .from("website_demos")
    .insert({
      org_id: orgId,
      business_id: businessId,
      status: "pending",
      created_by: user.id,
      slug: shortCode(),
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let queued = false;
  try {
    queued = await enqueueWebsite(demo.id, businessId, orgId, providerOverride, force);
  } catch (e) {
    console.error("[website] enqueue failed:", e.message);
  }
  if (!queued) {
    await supabase
      .from("website_demos")
      .update({ status: "failed", error: "Queue unavailable — is Redis + the worker running?" })
      .eq("id", demo.id);
    return NextResponse.json(
      { error: "Queue unavailable — is Redis + the worker running?" },
      { status: 503 },
    );
  }

  return NextResponse.json({ demoId: demo.id, queued: true });
}
