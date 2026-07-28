import { createClient } from "@/lib/supabase/server";

// Resolve the logged-in user and their active org. MVP: a user belongs to one
// org (their personal workspace, auto-created on signup). Returns null when
// unauthenticated so callers can redirect.
export async function getUserAndOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { user, orgId: null, orgName: null, role: null, supabase };

  return {
    user,
    orgId: membership.org_id,
    orgName: membership.organizations?.name ?? "Workspace",
    role: membership.role,
    supabase,
  };
}
