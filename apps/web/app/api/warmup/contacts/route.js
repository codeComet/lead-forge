import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Seed recipients for warm-up: addresses the operator controls or trusts.
// Stored lowercase — the send gate looks recipients up by exact match.

export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, orgId } = session;

  const { email, name, emails } = await request.json().catch(() => ({}));

  // Accept one address or a pasted list (comma / newline separated).
  const list = (emails ? String(emails).split(/[\s,;]+/) : [email])
    .map((e) => String(e || "").trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return NextResponse.json({ error: "An email address is required." }, { status: 400 });

  const invalid = list.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) {
    return NextResponse.json({ error: `Not a valid email: ${invalid.join(", ")}` }, { status: 400 });
  }

  const rows = list.map((e) => ({
    org_id: orgId,
    email: e,
    name: list.length === 1 && name ? String(name).trim() : null,
  }));

  const { data, error } = await supabase
    .from("warmup_contacts")
    .upsert(rows, { onConflict: "org_id,email", ignoreDuplicates: true })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ added: data?.length ?? 0 });
}

export async function DELETE(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, orgId } = session;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("warmup_contacts").delete().eq("id", id).eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
