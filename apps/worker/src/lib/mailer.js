// Shared SMTP transport for every worker send path (outreach + warm-up).
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { toPlainText } from "@leadforge/shared/email-render";

const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

export const transporter =
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

export const FROM = process.env.EMAIL_FROM || `Redwan <${process.env.SMTP_USER || ""}>`;

/** IMAP connection settings, falling back to the SMTP mailbox credentials. */
export function imapConfig() {
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.IMAP_PORT) || 993;
  return {
    host,
    port,
    secure: process.env.IMAP_SECURE ? process.env.IMAP_SECURE === "true" : port === 993,
    auth: { user, pass },
    logger: false,
  };
}

/** Render the full MIME message without sending it (for the Sent-folder copy). */
async function buildRaw(opts) {
  const s = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "\r\n" });
  const built = await s.sendMail(opts);
  return built.message;
}

// SMTP only relays — it never writes the mailbox's Sent folder (that's IMAP,
// normally done by the mail client). Drop the copy in ourselves so scheduled
// sends show up in webmail like anything else. Best-effort.
async function appendToSent(raw) {
  const cfg = imapConfig();
  if (!cfg) return;
  const client = new ImapFlow(cfg);
  try {
    await client.connect();
    await client.append(process.env.IMAP_SENT_FOLDER || "Sent", raw, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Send with a text/plain alternative always attached (HTML-only reads as bulk). */
export async function sendMail({ to, subject, html, headers }) {
  if (!transporter) throw new Error("SMTP_USER/SMTP_PASS not configured");
  const opts = { from: FROM, to, subject, html, text: toPlainText(html), headers };
  const info = await transporter.sendMail(opts);
  try {
    await appendToSent(await buildRaw({ ...opts, messageId: info?.messageId || undefined }));
  } catch (e) {
    console.error("[mailer] IMAP append to Sent failed:", e.message);
  }
  return info;
}
