// Warm-up sender.
//
// Runs on a timer (see index.js). For every org in warm-up it asks the same
// planner the outreach path uses: is a slot due right now, and is there quota
// left today? If yes it mails one seed contact — the least recently mailed one
// — with a short personal note that asks for a reply. One email per tick keeps
// the spacing honest; the tick interval is shorter than the smallest gap, so
// the planner, not the timer, decides the pace.
//
// Graduation is checked here too: once the configured number of days has
// passed, the org flips to 'live' and cold outreach unlocks.

import { isWarmupComplete, rampDay, warmupDaysLeft, dailyCap, startOfLocalDay } from "@leadforge/shared/send-schedule";
import { planNextSend } from "@leadforge/shared/send-planner";
import { warmupEmail } from "@leadforge/shared/warmup-content";
import { supabase } from "../lib/supabase.js";
import { sendMail, transporter, FROM } from "../lib/mailer.js";

// A send is "due" if its slot is at most this far ahead — the tick is coarse,
// so treat anything landing inside the next interval as now.
const DUE_WINDOW_MS = 6 * 60_000;

// One warm-up email per contact per day. With a short seed list the ramp cap
// would otherwise mail the same few people 8× a day, which is neither natural
// nor useful — the cap is a ceiling, not a target.
const MAX_PER_CONTACT_PER_DAY = Number(process.env.WARMUP_MAX_PER_CONTACT_PER_DAY) || 1;

/** Address to notify the operator on — the mailbox we send from. */
function operatorAddress() {
  return (
    process.env.WARMUP_NOTIFY_EMAIL ||
    process.env.SMTP_USER ||
    (FROM.match(/<([^>]+)>/)?.[1] ?? "").trim() ||
    null
  );
}

// Graduation is easy to miss (it's just a state flip), so mail the operator a
// summary. Best-effort: never let a failed notification block the flip.
async function notifyGraduated(settings, now) {
  const to = operatorAddress();
  if (!to) return;

  const { data: contacts } = await supabase
    .from("warmup_contacts")
    .select("email, replied_at")
    .eq("org_id", settings.org_id);
  const seeds = contacts?.length ?? 0;
  const replied = contacts?.filter((c) => c.replied_at).length ?? 0;
  // Day after the ramp's warm-up phase → the cap that applies from now on.
  const cap = dailyCap({ ...settings, mode: "live" }, now);

  const lines = [
    "Warm-up finished — cold outreach is unlocked.",
    "",
    `Seed contacts: ${seeds}`,
    `Replied: ${replied} of ${seeds}`,
    `Daily cap from now: ${cap} emails/day (it keeps ramping to 50)`,
    `Send window: ${String(settings.window_start_hour).padStart(2, "0")}:00–${String(settings.window_end_hour).padStart(2, "0")}:00 ${settings.timezone}, Mon–Fri`,
    "",
    replied < Math.ceil(seeds / 2)
      ? "Heads up: fewer than half your seeds replied, so the reputation signal is thin. Consider adding contacts and running another warm-up before sending at volume."
      : "Reply rate looks healthy. Ramp into real outreach gradually and watch Google Postmaster Tools.",
  ];

  try {
    await sendMail({
      to,
      subject: "Warm-up complete — outreach unlocked",
      html: lines.join("\n").replace(/\n/g, "<br>"),
    });
  } catch (e) {
    console.error("[warmup] graduation notice failed:", e.message);
  }
}

async function graduate(settings, now) {
  await supabase
    .from("email_settings")
    .update({ mode: "live", updated_at: new Date().toISOString() })
    .eq("org_id", settings.org_id);
  console.log(`[warmup] org ${settings.org_id} graduated → cold outreach unlocked`);
  await notifyGraduated(settings, now);
}

async function sendOne(settings, now) {
  const orgId = settings.org_id;

  // Least recently mailed seed first, so the list cycles evenly.
  const { data: contact } = await supabase
    .from("warmup_contacts")
    .select("*")
    .eq("org_id", orgId)
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (!contact) return { skipped: "no warm-up contacts" };

  // The least recently mailed contact has already had its share today → the
  // whole list has, so there's nothing to send until tomorrow.
  const dayStart = startOfLocalDay(now, settings.timezone).toISOString();
  const { count: sentToContactToday } = await supabase
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("kind", "warmup")
    .eq("to_email", contact.email)
    .eq("status", "sent")
    .gte("sent_at", dayStart);
  if ((sentToContactToday || 0) >= MAX_PER_CONTACT_PER_DAY) {
    return { skipped: "every contact already mailed today" };
  }

  const { subject, body } = warmupEmail({ name: contact.name, from: FROM });

  // Record first so the row owns a tracking_id (used to match replies).
  const { data: email, error } = await supabase
    .from("emails")
    .insert({
      org_id: orgId,
      to_email: contact.email,
      subject,
      body_html: body,
      status: "queued",
      kind: "warmup",
      scheduled_at: now.toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`warmup insert failed: ${error.message}`);

  // No click tracking or unsubscribe footer on warm-up mail: these are people
  // who agreed to help, and a bare personal note is the point.
  const html = body.replace(/\n/g, "<br>");

  try {
    const info = await sendMail({ to: contact.email, subject, html });
    await supabase
      .from("emails")
      .update({ status: "sent", provider_id: info?.messageId ?? null, sent_at: new Date().toISOString() })
      .eq("id", email.id);
    await supabase.from("email_events").insert({ org_id: orgId, email_id: email.id, type: "sent" });
    await supabase.from("warmup_contacts").update({ last_sent_at: new Date().toISOString() }).eq("id", contact.id);
    return { sent: contact.email, day: rampDay(settings, now) };
  } catch (e) {
    await supabase.from("emails").update({ status: "failed", error: e.message }).eq("id", email.id);
    throw e;
  }
}

export async function processWarmupTick() {
  if (!transporter) return { skipped: "SMTP not configured" };

  const { data: orgs } = await supabase.from("email_settings").select("*").eq("mode", "warming");
  if (!orgs?.length) return { orgs: 0 };

  const now = new Date();
  const results = [];

  for (const settings of orgs) {
    try {
      if (isWarmupComplete(settings, now)) {
        await graduate(settings, now);
        results.push({ org: settings.org_id, graduated: true });
        continue;
      }

      const plan = await planNextSend(supabase, settings.org_id, { now, settings });
      if (plan.at.getTime() - now.getTime() > DUE_WINDOW_MS) {
        results.push({ org: settings.org_id, next: plan.at.toISOString(), capReached: plan.capReached });
        continue;
      }

      const r = await sendOne(settings, now);
      results.push({ org: settings.org_id, ...r, daysLeft: warmupDaysLeft(settings, now) });
    } catch (e) {
      console.error(`[warmup] org ${settings.org_id} failed:`, e.message);
      results.push({ org: settings.org_id, error: e.message });
    }
  }

  return { results };
}
