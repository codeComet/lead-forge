import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";

export const runtime = "nodejs";

// Fetch the raw generated HTML for one demo (for the in-app editor).
export async function GET(_request, { params }) {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, orgId } = session;
  const { id } = await params;

  const { data: demo, error } = await supabase
    .from("website_demos")
    .select("id, html, status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!demo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(demo);
}

// Save hand-edited HTML for a demo. Reflected immediately in the preview URL
// (the preview route reads website_demos.html with no caching).
export async function PUT(request, { params }) {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, orgId } = session;
  const { id } = await params;

  const { html } = await request.json().catch(() => ({}));
  if (typeof html !== "string" || !html.trim()) {
    return NextResponse.json({ error: "html is required" }, { status: 400 });
  }
  if (!/<html|<!doctype/i.test(html)) {
    return NextResponse.json(
      { error: "Content must be a full HTML document (missing <html> / <!doctype>)." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("website_demos")
    .update({ html, status: "done" })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
