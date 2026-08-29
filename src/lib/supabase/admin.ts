import { createClient } from "@supabase/supabase-js";

// Server-only. Never import this from a "use client" file — the service role key
// bypasses Row Level Security entirely.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
