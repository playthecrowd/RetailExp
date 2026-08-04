import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Secret-key Supabase client — bypasses RLS entirely (replaces the legacy
 * "service role key" naming; same underlying `service_role` Postgres
 * role/JWT claim and privilege level as before — Supabase's own docs:
 * "You can substitute the sb_publishable_... and sb_secret_... values
 * anywhere you used the anon and service_role keys respectively, as they
 * work roughly the same in terms of permissions and data access."
 * https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
 * — verified against that page rather than assumed, per the review's
 * explicit instruction. Supabase's own API gateway additionally now
 * rejects secret-key requests sent from a browser (HTTP 401) as a second,
 * independent layer beyond the guard below).
 *
 * This must never be reachable from browser code. Not using the
 * `server-only` npm package here (not part of the Supabase packages this
 * checkpoint is scoped to install) — instead, a runtime guard below
 * throws immediately if this module is ever evaluated in a browser
 * context, and SUPABASE_SECRET_KEY is intentionally NOT prefixed with
 * NEXT_PUBLIC_, so Next.js never inlines it into the client bundle in the
 * first place even if this guard were somehow bypassed. See
 * scripts/verify-supabase-key-usage.mjs for the static check that fails
 * the build if this file (or the key itself) is ever referenced from a
 * "use client" file or a public-configuration surface.
 *
 * Use only for genuinely administrative server-side operations that RLS
 * can't or shouldn't express (e.g. provisioning the first
 * client_memberships row for a brand-new client). Every other operation
 * should go through lib/supabase/client.ts or server.ts, under normal RLS.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/supabase/secret.ts must never be imported from client-side code.");
}

export function createSecretClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
