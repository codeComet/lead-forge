import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// User-scoped client for Server Components / Route Handlers / Server Actions.
// Reads the session from cookies so RLS applies as the logged-in user.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // set() from a Server Component — safe to ignore; middleware
            // refreshes the session cookie on each request.
          }
        },
      },
    },
  );
}

// Service-role client: bypasses RLS. Use ONLY in trusted server code
// (never expose to the browser). For cross-org admin ops / tracking writes.
export function createServiceClient() {
  const { createClient: createSb } = require("@supabase/supabase-js");
  return createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
