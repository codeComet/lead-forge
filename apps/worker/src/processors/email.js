import nodemailer from "nodemailer";
import { supabase } from "../lib/supabase.js";

const transporter =
  process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true, // implicit TLS on 465
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM = process.env.EMAIL_FROM || `Redwan <${process.env.SMTP_USER || ""}>`;

// Rewrite links for click tracking and append an open pixel + compliant footer.
function instrument(rawBody, trackingId, toEmail) {
  // Plain-text bodies: linkify bare URLs (so the demo link is clickable +
  // tracked) and convert newlines before rewriting links for click tracking.
  const looksHtml = /<[a-z][\s\S]*>/i.test(rawBody);
  const html = looksHtml
    ? rawBody
    : rawBody
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
        .replace(/\n/g, "<br>");

  const clickBase = `${APP_URL}/api/track/click?id=${trackingId}&url=`;
  let out = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_, url) => `href="${clickBase}${encodeURIComponent(url)}"`);

  const pixel = `<img src="${APP_URL}/api/track/open?id=${trackingId}" width="1" height="1" style="display:none" alt=""/>`;
  const unsub = `${APP_URL}/api/unsubscribe?email=${encodeURIComponent(toEmail)}&id=${trackingId}`;
  const footer = `<div style="margin-top:24px;font-size:12px;color:#888">You're receiving this because we thought it was relevant to your business. <a href="${unsub}">Unsubscribe</a>.</div>`;
  return `${out}${footer}${pixel}`;
}

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

    return { emailId, providerId: data?.id };
  } catch (e) {
    await supabase.from("emails").update({ status: "failed", error: e.message }).eq("id", emailId);
    throw e;
  }
}
