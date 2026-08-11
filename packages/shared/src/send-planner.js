// Turns the pacing rules in send-schedule.js into a concrete "send this one at
// T" decision, by reading the org's settings and how much it has already sent.
//
// Takes the supabase client as an argument rather than importing one, so the
// web app (RLS client) and the worker (service client) share the same logic.

import { nextSendSlot, startOfLocalDay, withDefaults, leadsBlocked, dailyCap } from "./send-schedule.js";

/** email_settings row for an org, or defaults when it has none yet. */
export async function loadEmailSettings(supabase, orgId) {
  const { data } = await supabase.from("email_settings").select("*").eq("org_id", orgId).maybeSingle();
  return withDefaults(data || {});
}

/**
 * Emails already sent today, local to the org's timezone. Warm-up mail counts:
 * the cap is about what the domain emits, not what it's for.
 */
export async function countSentToday(supabase, orgId, settings, now = new Date()) {
  const since = startOfLocalDay(now, settings.timezone).toISOString();
  const { count } = await supabase
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "sent")
    .gte("sent_at", since);
  return count || 0;
}

/**
 * Latest instant already spoken for — the newest send or pending schedule — so
 * consecutive sends are spaced instead of all landing on the same slot.
 */
export async function lastCommittedAt(supabase, orgId) {
  const [{ data: scheduled }, { data: sent }] = await Promise.all([
    supabase
      .from("emails")
      .select("scheduled_at")
      .eq("org_id", orgId)
      .eq("status", "queued")
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("emails")
      .select("sent_at")
      .eq("org_id", orgId)
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const times = [scheduled?.scheduled_at, sent?.sent_at].filter(Boolean).map((t) => new Date(t).getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * When the next email for this org may go out.
 * @returns { at, capReached, cap, sentToday, settings }
 */
export async function planNextSend(supabase, orgId, { now = new Date(), rand = Math.random, settings } = {}) {
  const s = settings || (await loadEmailSettings(supabase, orgId));
  const [sentToday, lastAt] = await Promise.all([
    countSentToday(supabase, orgId, s, now),
    lastCommittedAt(supabase, orgId),
  ]);
  const slot = nextSendSlot({ settings: s, now, sentToday, lastScheduledAt: lastAt, rand });
  return { ...slot, sentToday, settings: s };
}

/**
 * Whether `email` may be mailed right now. Cold outreach is refused while
 * warm-up runs — that's the whole point of the phase — but seed contacts (and
 * warm-up mail itself) go through.
 */
export async function isRecipientAllowed(supabase, orgId, toEmail, { settings, now = new Date(), kind = "outreach" } = {}) {
  const s = settings || (await loadEmailSettings(supabase, orgId));
  if (kind === "warmup" || !leadsBlocked(s, now)) return { allowed: true, settings: s };
  const { data: seed } = await supabase
    .from("warmup_contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", String(toEmail || "").trim().toLowerCase())
    .maybeSingle();
  return { allowed: !!seed, settings: s, reason: seed ? null : "warmup" };
}

export { dailyCap, leadsBlocked };
