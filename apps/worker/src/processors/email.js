import { instrument } from "@leadforge/shared/email-render";
import { isRecipientAllowed, planNextSend } from "@leadforge/shared/send-planner";
import { supabase } from "../lib/supabase.js";
import { sendMail, transporter } from "../lib/mailer.js";
import { scheduleEmail } from "../lib/queues.js";

// A job may fire early (clock drift), late (worker restart), or after the org
// already spent today's quota through another path. Re-plan on arrival rather
// than trusting the delay that was computed at enqueue time.
const SLOT_TOLERANCE_MS = 60_000;

export async function processEmail(job) {
  const { emailId } = job.data;

  const { data: email } = await supabase.from("emails").select("*").eq("id", emailId).single();
  if (!email) throw new Error(`email ${emailId} not found`);
  if (email.status === "sent") return { emailId, skipped: "already sent" };

  // Compliance: honour org suppression list.
  const { data: suppressed } = await supabase
    .from("suppressions")
    .select("email")
    .eq("org_id", email.org_id)
    .eq("email", email.to_email)
    .maybeSingle();
  if (suppressed) {
    await supabase.from("emails").update({ status: "failed", error: "recipient suppressed" }).eq("id", emailId);
    return { emailId, skipped: "suppressed" };
  }

  if (!transporter) {
    await supabase.from("emails").update({ status: "failed", error: "SMTP_USER/SMTP_PASS not configured" }).eq("id", emailId);
    throw new Error("SMTP_USER/SMTP_PASS not configured");
  }

  // Warm-up may have started (or been restarted) after this was queued.
  const { allowed, settings } = await isRecipientAllowed(supabase, email.org_id, email.to_email, { kind: email.kind });
  if (!allowed) {
    await supabase
      .from("emails")
      .update({ status: "failed", error: "blocked: warm-up in progress, recipient is not a warm-up contact" })
      .eq("id", emailId);
    return { emailId, skipped: "warmup" };
  }

  // Re-check pacing at run time: if this slot is no longer valid (cap spent,
  // outside the window, fired early), push the job to the next real slot.
  const now = new Date();
  const plan = await planNextSend(supabase, email.org_id, { now, settings });
  if (plan.at.getTime() - now.getTime() > SLOT_TOLERANCE_MS) {
    const delay = plan.at.getTime() - now.getTime();
    await supabase.from("emails").update({ scheduled_at: plan.at.toISOString() }).eq("id", emailId);
    await scheduleEmail(emailId, email.org_id, delay);
    return { emailId, rescheduled: plan.at.toISOString(), capReached: plan.capReached };
  }

  const html = instrument(email.body_html, email.tracking_id, email.to_email);

  try {
    const info = await sendMail({ to: email.to_email, subject: email.subject, html });

    await supabase
      .from("emails")
      .update({ status: "sent", provider_id: info?.messageId ?? null, sent_at: new Date().toISOString(), error: null })
      .eq("id", emailId);

    await supabase.from("email_events").insert({ org_id: email.org_id, email_id: emailId, type: "sent" });

    // Advance the lead pipeline (new -> contacted).
    if (email.lead_id) {
      await supabase.from("leads").update({ status: "contacted" }).eq("id", email.lead_id).eq("status", "new");
    }

    return { emailId, providerId: info?.messageId ?? null };
  } catch (e) {
    await supabase.from("emails").update({ status: "failed", error: e.message }).eq("id", emailId);
    throw e;
  }
}
