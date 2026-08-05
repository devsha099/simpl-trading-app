import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

/**
 * Admin Supabase client — uses the service-role key, which bypasses RLS.
 * Only the backend holds this key; it's how we write to alpaca_accounts
 * (clients can only read their own row — see the 0001_init.sql migration)
 * and verify session tokens sent by the app.
 *
 * Validated lazily, on first use, not at import time: the server should
 * still boot and serve /api/alpaca/* even before Supabase is configured.
 */
let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
        "Add them to .env (Supabase dashboard -> Settings -> API).",
    );
  }

  client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
