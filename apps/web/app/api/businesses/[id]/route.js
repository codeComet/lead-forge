import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";

export const runtime = "nodejs";

// Add https:// if the user pasted a bare domain; return null to clear the field.
function normalizeWebsite(raw) {
  if (raw == null) return undefined; // field not provided → leave unchanged
  const v = String(raw).trim();
  if (!v) return null; // explicit clear
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

// Manually edit a business's website and/or contact email from the lead page.
// A user-entered email is authoritative, so it's stored with confidence
// "verified" (never overwritten later by a scraped "likely" address).
export async function PATCH(request, { params }) {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, orgId } = session;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const website = normalizeWebsite(body.website);
  const emailRaw = typeof body.contactEmail === "string" ? body.contactEmail.trim() : undefined;
  if (emailRaw && !EMAIL_RE.test(emailRaw)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Ownership check.
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  if (website !== undefined) {
    const { error } = await supabase
      .from("businesses")
      .update({ website, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (emailRaw !== undefined) {
    const patch =
      emailRaw === ""
        ? { contact_email: null } // clear, keep confidence as-is
        : { contact_email: emailRaw.toLowerCase(), email_confidence: "verified" };
    const { error } = await supabase
      .from("leads")
      .update(patch)
      .eq("business_id", id)
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, website: website === undefined ? undefined : website });
}
