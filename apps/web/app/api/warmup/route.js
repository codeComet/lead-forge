import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";
import { loadEmailSettings, countSentToday } from "@leadforge/shared/send-planner";
import { dailyCap, rampDay, warmupDaysLeft, isWarmupComplete, RAMP, RAMP_CEILING } from "@leadforge/shared/send-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Warm-up state + seed contacts. The worker owns graduation (it flips mode to
// 'live' on the first tick past the last day); this route only reports state and
// records the operator's intent.

async function state(supabase, orgId) {
  const settings = await loadEmailSettings(supabase, orgId);
  const now = new Date();
  const [sentToday, { data: contacts }] = await Promise.all([
    countSentToday(supabase, orgId, settings, now),
    supabase
      .from("warmup_contacts")
      .select("id, email, name, last_sent_at, replied_at, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  const cap = dailyCap(settings, now);
  return {
    settings,
    contacts: contacts ?? [],
    day: settings.warmup_started_at ? rampDay(settings, now) : 0,
    daysLeft: warmupDaysLeft(settings, now),
    complete: isWarmupComplete(settings, now),
    sentToday,
    cap: cap === Infinity ? null : cap,
    ramp: [...RAMP, { untilDay: null, cap: RAMP_CEILING }],
    repliesSeen: (contacts ?? []).filter((c) => c.replied_at).length,
  };
}

export async function GET() {
  const session = await getUserAndOrg();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await state(session.supabase, session.orgId));
}

/**
 * POST { action }
 *  - "start"  → begin warm-up now (needs at least one seed contact)
 *  - "stop"   → back to idle: unmetered sending, leads unblocked
 *  - "finish" → graduate early: capped sending, leads unblocked
 *  - "settings" → patch timezone / window / warmup_days / daily_cap_override
 */
export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, orgId } = session;

  const body = await request.json().catch(() => ({}));
  const { action } = body;

  const patch = { org_id: orgId, updated_at: new Date().toISOString() };

  if (action === "start") {
    const { count } = await supabase
      .from("warmup_contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (!count) {
      return NextResponse.json({ error: "Add at least one warm-up contact first." }, { status: 400 });
    }
    patch.mode = "warming";
    patch.warmup_started_at = new Date().toISOString();
    if (body.warmupDays) patch.warmup_days = Number(body.warmupDays);
  } else if (action === "stop") {
    patch.mode = "idle";
    patch.warmup_started_at = null;
  } else if (action === "finish") {
    patch.mode = "live";
  } else if (action === "settings") {
    if (body.timezone) patch.timezone = String(body.timezone);
    if (body.windowStartHour != null) patch.window_start_hour = Number(body.windowStartHour);
    if (body.windowEndHour != null) patch.window_end_hour = Number(body.windowEndHour);
    if (body.warmupDays != null) patch.warmup_days = Number(body.warmupDays);
    if (body.sendDays) patch.send_days = body.sendDays.map(Number);
    if ("dailyCapOverride" in body) {
      patch.daily_cap_override = body.dailyCapOverride ? Number(body.dailyCapOverride) : null;
    }
    if (patch.window_end_hour != null && patch.window_start_hour != null && patch.window_end_hour <= patch.window_start_hour) {
      return NextResponse.json({ error: "Send window must end after it starts." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await supabase.from("email_settings").upsert(patch, { onConflict: "org_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await state(supabase, orgId));
}
