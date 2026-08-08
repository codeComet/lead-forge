import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
     <body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0b0b0d;color:#eee">
       <div style="max-width:420px;text-align:center;padding:32px;border:1px solid #222;border-radius:16px;background:#141416">
         <h1 style="font-size:20px;margin:0 0 8px">${message}</h1>
         <p style="color:#999;font-size:14px;margin:0">You will not receive further outreach from us.</p>
       </div>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// Suppress the address (scoped to the org resolved from the tracking id) and
// mark the lead opted-out. Shared by the GET (link click) and POST (one-click).
async function suppress(email, id) {
  if (!email) return;
  try {
    const supabase = createServiceClient();
    // Resolve org from the tracking id so the suppression is scoped correctly.
    let orgId = null;
    let leadId = null;
    if (id) {
      const { data: em } = await supabase
        .from("emails")
        .select("org_id, lead_id")
        .eq("tracking_id", id)
        .maybeSingle();
      orgId = em?.org_id ?? null;
      leadId = em?.lead_id ?? null;
    }
    if (orgId) {
      await supabase.from("suppressions").upsert(
        { org_id: orgId, email: email.toLowerCase(), reason: "unsubscribed" },
        { onConflict: "org_id,email" },
      );
      if (leadId) await supabase.from("leads").update({ opted_out: true }).eq("id", leadId);
    }
  } catch {
    /* ignore */
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const id = searchParams.get("id");
  if (!email) return page("Invalid unsubscribe link");
  await suppress(email, id);
  return page("You've been unsubscribed");
}

// RFC 8058 one-click unsubscribe: Gmail/Outlook POST here directly from the
// List-Unsubscribe-Post header. No HTML — just a 200.
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  await suppress(searchParams.get("email"), searchParams.get("id"));
  return new Response(null, { status: 200 });
}
