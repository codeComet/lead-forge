// Reply detection.
//
// Replies are the signal that matters — for the CRM pipeline, and for the
// warm-up phase, where a seed contact answering is the whole point. SMTP can't
// tell us about them, so poll the mailbox over IMAP (same credentials that
// write the Sent copy) and match incoming mail back to what we sent.
//
// Matching is by Message-ID: every send stores the id the SMTP server returned
// in emails.provider_id, and a well-behaved client echoes it in In-Reply-To /
// References. Sender address is the fallback for clients that don't.

import { ImapFlow } from "imapflow";
import { supabase } from "../lib/supabase.js";
import { imapConfig } from "../lib/mailer.js";

// How far back to look. Generous enough to survive a worker outage, short
// enough that the fetch stays small.
const LOOKBACK_DAYS = 14;

function idsFrom(header = "") {
  return String(header).match(/<[^>]+>/g) || [];
}

/** `"Jane Doe" <jane@x.com>` → `jane@x.com` */
function addressOf(header = "") {
  const m = String(header).match(/<([^>]+)>/);
  return (m ? m[1] : String(header)).trim().toLowerCase();
}

async function recordReply(email, meta) {
  // One 'replied' event per email.
  const { data: existing } = await supabase
    .from("email_events")
    .select("id")
    .eq("email_id", email.id)
    .eq("type", "replied")
    .maybeSingle();
  if (existing) return false;

  await supabase.from("email_events").insert({
    org_id: email.org_id,
    email_id: email.id,
    type: "replied",
    meta,
  });

  if (email.lead_id) {
    // A reply outranks contacted/opened, but never drags a won/lost lead back.
    await supabase
      .from("leads")
      .update({ status: "replied" })
      .eq("id", email.lead_id)
      .in("status", ["new", "contacted", "opened"]);
  }

  // Warm-up seeds: mark the contact as having answered.
  if (email.kind === "warmup") {
    await supabase
      .from("warmup_contacts")
      .update({ replied_at: new Date().toISOString() })
      .eq("org_id", email.org_id)
      .eq("email", email.to_email)
      .is("replied_at", null);
  }
  return true;
}

export async function processPollReplies() {
  const cfg = imapConfig();
  if (!cfg) return { skipped: "IMAP not configured" };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  // Candidate sends to match against — recent, actually delivered.
  const { data: sent } = await supabase
    .from("emails")
    .select("id, org_id, lead_id, to_email, provider_id, kind, sent_at")
    .eq("status", "sent")
    .gte("sent_at", since.toISOString())
    .order("sent_at", { ascending: false })
    .limit(2000);
  if (!sent?.length) return { candidates: 0 };

  const byMessageId = new Map();
  const byRecipient = new Map();
  for (const e of sent) {
    if (e.provider_id) byMessageId.set(e.provider_id.trim(), e);
    const to = e.to_email?.trim().toLowerCase();
    // Newest send per recipient wins the address fallback.
    if (to && !byRecipient.has(to)) byRecipient.set(to, e);
  }

  const client = new ImapFlow(cfg);
  let scanned = 0;
  let matched = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(process.env.IMAP_INBOX_FOLDER || "INBOX");
    try {
      for await (const msg of client.fetch({ since }, { envelope: true, headers: ["in-reply-to", "references"] })) {
        scanned++;
        const headers = msg.headers?.toString("utf8") || "";
        const inReplyTo = headers.match(/^in-reply-to:\s*(.*)$/im)?.[1] || "";
        const references = headers.match(/^references:\s*([\s\S]*?)(?=\r?\n\S|$)/im)?.[1] || "";

        let email = null;
        for (const id of [...idsFrom(inReplyTo), ...idsFrom(references)]) {
          email = byMessageId.get(id.trim());
          if (email) break;
        }
        if (!email) {
          const from = addressOf(msg.envelope?.from?.[0]?.address || msg.envelope?.from?.[0]?.name || "");
          const candidate = byRecipient.get(from);
          // Only trust the address fallback for mail that arrived after we sent.
          if (candidate && msg.envelope?.date && new Date(msg.envelope.date) > new Date(candidate.sent_at)) {
            email = candidate;
          }
        }
        if (!email) continue;

        const created = await recordReply(email, {
          subject: msg.envelope?.subject || null,
          from: msg.envelope?.from?.[0]?.address || null,
          at: msg.envelope?.date || null,
        });
        if (created) matched++;
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    console.error("[inbox] poll failed:", e.message);
    throw e;
  } finally {
    await client.logout().catch(() => {});
  }

  if (matched) console.log(`[inbox] ${matched} new repl${matched === 1 ? "y" : "ies"} recorded`);
  return { scanned, matched };
}
