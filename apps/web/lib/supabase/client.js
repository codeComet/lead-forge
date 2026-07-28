import { createBrowserClient } from "@supabase/ssr";

let client;

// Singleton browser client for Client Components (auth UI, realtime subscriptions).
export function createClient() {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return client;
}
