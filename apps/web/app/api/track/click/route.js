import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const target = searchParams.get("url");

  // Only redirect to valid absolute http(s) URLs (avoid open-redirect abuse).
  let dest = "/";
  try {
    const u = new URL(target || "");
    if (u.protocol === "http:" || u.protocol === "https:") dest = u.toString();
  } catch {
    /* fall through to "/" */
  }

  try {
    if (id) {
      const supabase = createServiceClient();
      const { data: email } = await supabase
        .from("emails")
        .select("id, org_id, lead_id")
        .eq("tracking_id", id)
        .maybeSingle();
      if (email) {
        await supabase.from("email_events").insert({
          org_id: email.org_id,
          email_id: email.id,
          type: "clicked",
          meta: { url: dest },
        });
        // A click implies an open.
        const { data: opened } = await supabase
          .from("email_events")
          .select("id")
          .eq("email_id", email.id)
          .eq("type", "opened")
          .maybeSingle();
        if (!opened) {
          await supabase.from("email_events").insert({ org_id: email.org_id, email_id: email.id, type: "opened" });
        }
      }
    }
  } catch {
    /* ignore tracking errors */
  }

  return NextResponse.redirect(dest, 302);
}
