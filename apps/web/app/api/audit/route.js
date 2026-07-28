import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";
import { enqueueAudits } from "@/lib/queue";

export const runtime = "nodejs";

// Opt-in auditing. Accepts { businessIds: string[] } and enqueues an audit job
// per business the caller's org actually owns. Returns how many were queued.
export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, orgId } = session;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ids = Array.from(new Set((payload.businessIds || []).filter(Boolean)));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No businesses selected" }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: "Too many at once (max 100)" }, { status: 400 });
  }

  // Only audit businesses that belong to this org.
  const { data: owned, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("org_id", orgId)
    .in("id", ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ownedIds = (owned ?? []).map((b) => b.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: "No matching businesses" }, { status: 404 });
  }

  // Mark them queued for instant UI feedback (realtime picks this up).
  await supabase
    .from("audits")
    .upsert(
      ownedIds.map((id) => ({ business_id: id, org_id: orgId, status: "pending", error: null })),
      { onConflict: "business_id" },
    );

  let queued = false;
  try {
    queued = await enqueueAudits(ownedIds.map((id) => ({ businessId: id, orgId })));
  } catch (e) {
    console.error("[audit] enqueue failed:", e.message);
  }
  if (!queued) {
    return NextResponse.json(
      { error: "Queue unavailable — is Redis + the worker running?" },
      { status: 503 },
    );
  }

  return NextResponse.json({ queued: true, count: ownedIds.length });
}
