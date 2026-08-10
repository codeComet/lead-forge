import nodemailer from "nodemailer";
import { instrument, toPlainText } from "@leadforge/shared/email-render";
import { supabase } from "../lib/supabase.js";

const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const transporter =
  process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: SMTP_PORT,
        // 465 = implicit TLS; 587/25 = STARTTLS (secure must be false or you get
        // "wrong version number" from a TLS handshake on a plaintext port)
        secure: SMTP_PORT === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;
const FROM = process.env.EMAIL_FROM || `Redwan <${process.env.SMTP_USER || ""}>`;

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

  const html = instrument(email.body_html, email.tracking_id, email.to_email);

  try {
    const info = await transporter.sendMail({
      from: FROM,
      to: email.to_email,
      subject: email.subject,
      html,
      text: toPlainText(html),
    });

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
