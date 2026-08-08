import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM = process.env.EMAIL_FROM || `Redwan <${process.env.SMTP_USER || ""}>`;

let transporter;
function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      // 465 = implicit TLS; 587/25 = STARTTLS (secure must be false or you get
      // "wrong version number" from a TLS handshake on a plaintext port)
      secure: port === 465,
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

// Build the full raw MIME message (Buffer) for a mail, so an identical copy can
// be appended to the mailbox's Sent folder. streamTransport just renders the
// message — it doesn't send anything.
async function buildRaw(opts) {
  const s = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "\r\n" });
  const built = await s.sendMail(opts);
  return built.message; // Buffer
}

// SMTP only relays outbound mail — it never writes to the mailbox's Sent folder
// (that's IMAP-managed, done by webmail/clients). So drop a copy in Sent over
// IMAP ourselves. Best-effort: if IMAP isn't configured or fails, the send
// still succeeds. Creds fall back to the SMTP ones (same mailbox in most setups).
async function appendToSent(raw) {
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;
  if (!host || !user || !pass) return; // IMAP not configured → skip silently
  const port = Number(process.env.IMAP_PORT) || 993;
  const mailbox = process.env.IMAP_SENT_FOLDER || "Sent";
  const client = new ImapFlow({
    host,
    port,
    secure: process.env.IMAP_SECURE ? process.env.IMAP_SECURE === "true" : port === 993,
    auth: { user, pass },
    logger: false,
  });
  try {
    await client.connect();
    await client.append(mailbox, raw, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Send via SMTP + drop a copy in the mailbox Sent folder over IMAP. Returns { id } or throws. */
export async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return { id: null, skipped: "SMTP_USER/SMTP_PASS not configured" };
  const info = await t.sendMail({ from: FROM, to, subject, html });
  // Best-effort Sent-folder copy — reuse the delivered Message-ID so the copy
  // matches. Never let an IMAP failure fail the (already-delivered) send.
  try {
    const raw = await buildRaw({ from: FROM, to, subject, html, messageId: info?.messageId || undefined });
    await appendToSent(raw);
  } catch (e) {
    console.error("IMAP append to Sent failed:", e.message);
  }
  return { id: info?.messageId ?? null };
}
