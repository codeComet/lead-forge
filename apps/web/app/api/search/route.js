import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";
import { searchBusinesses } from "@/lib/places";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, orgId, user } = session;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const businessType = (payload.businessType || "").trim();
  if (!businessType) {
    return NextResponse.json({ error: "Business type is required" }, { status: 400 });
  }
  const country = (payload.country || "").trim() || null;
  const city = (payload.city || "").trim() || null;
  const radiusM = Number(payload.radius) || 5000;

  // Record the search.
  const { data: search, error: searchErr } = await supabase
    .from("searches")
    .insert({
      org_id: orgId,
      created_by: user.id,
      country,
      city,
      radius_m: radiusM,
      business_type: businessType,
      status: "running",
    })
    .select()
    .single();
  if (searchErr) {
    return NextResponse.json({ error: searchErr.message }, { status: 500 });
  }

  let places;
  try {
    places = await searchBusinesses({ country, city, radiusM, businessType });
  } catch (e) {
    await supabase.from("searches").update({ status: "failed" }).eq("id", search.id);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  if (places.length === 0) {
    await supabase.from("searches").update({ status: "done", result_count: 0 }).eq("id", search.id);
    return NextResponse.json({ searchId: search.id, businesses: [] });
  }

  // Upsert businesses (dedupe on org_id + place_id).
  const rows = places.map((p) => ({
    org_id: orgId,
    search_id: search.id,
    place_id: p.place_id,
    name: p.name,
    business_type: businessType,
    rating: p.rating,
    reviews: p.reviews,
    address: p.address,
    city,
    phone: p.phone,
    website: p.website,
    opening_hours: p.opening_hours,
    lat: p.lat,
    lng: p.lng,
    maps_url: p.maps_url,
  }));

  const { data: businesses, error: upsertErr } = await supabase
    .from("businesses")
    .upsert(rows, { onConflict: "org_id,place_id" })
    .select();
  if (upsertErr) {
    await supabase.from("searches").update({ status: "failed" }).eq("id", search.id);
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Ensure a CRM lead exists per business (ignore if already present).
  const leadRows = businesses.map((b) => ({
    org_id: orgId,
    business_id: b.id,
    status: "new",
    contact_email: null,
  }));
  await supabase.from("leads").upsert(leadRows, { onConflict: "business_id", ignoreDuplicates: true });

  // Audits are opt-in — the user picks which businesses to audit from the table
  // (per-row or bulk) via POST /api/audit. Search itself never spends audit API.

  await supabase
    .from("searches")
    .update({ status: "done", result_count: businesses.length })
    .eq("id", search.id);

  return NextResponse.json({ searchId: search.id, businesses });
}
