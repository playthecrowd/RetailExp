import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role Supabase client — bypasses RLS entirely. This must never
 * be reachable from browser code. Not using the `server-only` npm package
 * here (not part of the Supabase packages this checkpoint is scoped to
 * install) — instead, a runtime guard below throws immediately if this
 * module is ever evaluated in a browser context, and
 * SUPABASE_SERVICE_ROLE_KEY is intentionally NOT prefixed with
 * NEXT_PUBLIC_, so Next.js never inlines it into the client bundle in the
 * first place even if this guard were somehow bypassed.
 *
 * Use only for genuinely administrative server-side operations that RLS
 * can't or shouldn't express (e.g. provisioning the first
 * client_memberships row for a brand-new client). Every other operation
 * should go through lib/supabase/client.ts or server.ts, under normal RLS.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/supabase/service-role.ts must never be imported from client-side code.");
}

export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
