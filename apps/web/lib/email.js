import nodemailer from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM = process.env.EMAIL_FROM || `Redwan <${process.env.SMTP_USER || ""}>`;

let transporter;
function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true, // implicit TLS on 465
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// Convert a plain-text/HTML body into a tracked HTML email: rewrite links
// through the click tracker, append the compliance footer + open pixel.
export function instrument(rawBody, trackingId, toEmail) {
  // Treat as plain text if it has no tags. For plain text, turn bare URLs into
  // anchors first (so the click-tracker rewrite below catches them), then
  // convert newlines to <br>.
  const looksHtml = /<[a-z][\s\S]*>/i.test(rawBody);
  let html = looksHtml
    ? rawBody
    : rawBody
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
        .replace(/\n/g, "<br>");

  const clickBase = `${APP_URL}/api/track/click?id=${trackingId}&url=`;
  html = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_, url) => `href="${clickBase}${encodeURIComponent(url)}"`);

  const pixel = `<img src="${APP_URL}/api/track/open?id=${trackingId}" width="1" height="1" style="display:none" alt=""/>`;
  const unsub = `${APP_URL}/api/unsubscribe?email=${encodeURIComponent(toEmail)}&id=${trackingId}`;
  const footer = `<div style="margin-top:24px;font-size:12px;color:#888">You're receiving this because we thought it was relevant to your business. <a href="${unsub}">Unsubscribe</a>.</div>`;
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#222">${html}${footer}${pixel}</div>`;
}

/** Send via Gmail SMTP. Returns { id } or throws. Returns null id if not configured. */
export async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return { id: null, skipped: "SMTP_USER/SMTP_PASS not configured" };
  const info = await t.sendMail({ from: FROM, to, subject, html });
  return { id: info?.messageId ?? null };
}
