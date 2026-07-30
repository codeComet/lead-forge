import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function gif() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Content-Length": String(PIXEL.length),
    },
  });
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return gif();

  try {
    const supabase = createServiceClient();
    const { data: email } = await supabase
      .from("emails")
      .select("id, org_id, lead_id, sent_at")
      .eq("tracking_id", id)
      .maybeSingle();

    // Suppress the sender's own open: pixel hits within 15s of send are almost
    // always the sender peeking at their Sent folder, not the recipient.
    const OPEN_GRACE_MS = 15_000;
    const tooSoon =
      email?.sent_at && Date.now() - new Date(email.sent_at).getTime() < OPEN_GRACE_MS;

    if (email && !tooSoon) {
      // Record one 'opened' event per email (dedupe repeated pixel loads).
      const { data: existing } = await supabase
        .from("email_events")
        .select("id")
        .eq("email_id", email.id)
        .eq("type", "opened")
        .maybeSingle();
      if (!existing) {
        await supabase.from("email_events").insert({ org_id: email.org_id, email_id: email.id, type: "opened" });
        if (email.lead_id) {
          await supabase.from("leads").update({ status: "opened" }).eq("id", email.lead_id).in("status", ["new", "contacted"]);
        }
      }
    }
  } catch {
    // Never let tracking failures block the pixel response.
  }
  return gif();
}
