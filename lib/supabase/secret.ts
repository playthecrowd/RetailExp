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
 * `server-only` npm package here (it is not installed and is not a declared
 * dependency of this project) — instead, a runtime guard below throws
 * immediately if this module is ever evaluated in a browser context, and the
 * secret variable is intentionally NOT prefixed with NEXT_PUBLIC_, so Next.js
 * never inlines it into the client bundle in the first place even if this
 * guard were somehow bypassed. See scripts/verify-supabase-key-usage.mjs for
 * the static check that fails the build if this file (or the key itself) is
 * ever referenced from a "use client" file or a public-configuration surface.
 *
 * Use only for genuinely administrative server-side operations that RLS
 * can't or shouldn't express (e.g. reading the moderation queue, which no
 * browser role holds any privilege on). Every other operation should go
 * through lib/supabase/client.ts or server.ts, under normal RLS.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/supabase/secret.ts must never be imported from client-side code.");
}

/** The only environment variables this module is permitted to read. */
type RequiredServerEnv = "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SECRET_KEY";

/**
 * Reads a required server-side variable, or throws naming only the variable.
 *
 * This replaced `process.env.X!` on both values. The non-null assertion
 * satisfied TypeScript and did nothing at runtime, so an unset variable passed
 * `undefined` straight into the SDK and surfaced as `supabaseKey is required.`
 * — a message that says nothing about which deployment is misconfigured or
 * which variable is missing. That is exactly how the Phase 3 Preview failure
 * presented, and it cost a full diagnostic cycle to attribute.
 *
 * The thrown message contains the variable NAME and nothing else. The value is
 * never logged, returned, interpolated, or included in the error — not even
 * its length, which would leak whether a key is present but truncated. An
 * empty or whitespace-only value is treated as missing, because a variable set
 * to "" in a dashboard is a misconfiguration, not a credential.
 */
function requireServerEnv(name: RequiredServerEnv): string {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";

  if (value.length === 0) {
    throw new Error(
      `Supabase server configuration error: ${name} is not set. ` +
        "Set it for this environment in the deployment platform's configuration.",
    );
  }

  return value;
}

/**
 * Throws a configuration error before constructing anything if either variable
 * is absent. Callers are server-side only, and the moderation loader's failure
 * is already contained by the route's error boundary, so this surfaces to the
 * browser as the same generic message as before while the real cause is
 * recorded in the server log.
 *
 * There is deliberately no fallback to the publishable key: quietly degrading
 * to a weaker credential would turn a loud configuration error into a silent
 * authorization change. And nothing here accepts a key from request data.
 */
export function createSecretClient() {
  const url = requireServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireServerEnv("SUPABASE_SECRET_KEY");

  return createSupabaseClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
