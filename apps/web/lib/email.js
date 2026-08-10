import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { toPlainText as _toPlainText } from "@leadforge/shared/email-render";

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

// Body rendering (click tracking, plain-text part, unsubscribe signature) lives
// in @leadforge/shared so the worker's send path renders identical mail.
export { instrument, toPlainText, unsubscribeLink } from "@leadforge/shared/email-render";

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
export async function sendEmail({ to, subject, html, unsubscribeUrl }) {
  const t = getTransporter();
  if (!t) return { id: null, skipped: "SMTP_USER/SMTP_PASS not configured" };

  // Always send multipart/alternative — an HTML-only message reads as bulk mail
  // to Gmail and is one of the things that pushes outreach into Promotions.
  const mailOpts = { from: FROM, to, subject, html, text: _toPlainText(html) };
  // List-Unsubscribe (+ RFC 8058 one-click) marks the message as *bulk*: it
  // helps large senders stay out of spam, but it also routes 1:1 outreach
  // straight to Gmail's Promotions tab. Off unless explicitly enabled — the
  // unsubscribe link in the body keeps the opt-out compliant either way.
  if (unsubscribeUrl && process.env.EMAIL_LIST_UNSUBSCRIBE === "true") {
    const mailto = `mailto:${process.env.SMTP_USER || ""}?subject=Unsubscribe`;
    mailOpts.headers = {
      "List-Unsubscribe": `<${unsubscribeUrl}>, <${mailto}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  const info = await t.sendMail(mailOpts);
  // Best-effort Sent-folder copy — reuse the delivered Message-ID + headers so
  // the copy matches. Never let an IMAP failure fail the (already-delivered) send.
  try {
    const raw = await buildRaw({ ...mailOpts, messageId: info?.messageId || undefined });
    await appendToSent(raw);
  } catch (e) {
    console.error("IMAP append to Sent failed:", e.message);
  }
  return { id: info?.messageId ?? null };
}
