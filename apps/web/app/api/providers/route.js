import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/org";
import { createServiceClient } from "@/lib/supabase/server";
import { providerOptions, availableProviders } from "@leadforge/shared/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: which providers have an API key (no keys leaked) + the org's saved choice.
export async function GET() {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service client: membership already verified via getUserAndOrg.
  const svc = createServiceClient();
  const { data: org } = await svc
    .from("organizations")
    .select("website_provider")
    .eq("id", session.orgId)
    .maybeSingle();

  return NextResponse.json({
    options: providerOptions(), // reads server env — presence only
    selected: org?.website_provider ?? null, // null = auto
  });
}

// POST: save the org's provider choice. Accepts null/"" (auto) or an available id.
export async function POST(request) {
  const session = await getUserAndOrg();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider } = await request.json().catch(() => ({}));
  let value = null;
  if (provider) {
    if (!availableProviders().includes(provider)) {
      return NextResponse.json({ error: "Provider not available (no API key set)." }, { status: 400 });
    }
    value = provider;
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("organizations")
    .update({ website_provider: value })
    .eq("id", session.orgId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ selected: value });
}
