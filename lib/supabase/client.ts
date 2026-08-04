"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser-side Supabase client — uses the publishable key only (replaces
 * the legacy "anon key" naming; same underlying `anon` Postgres role and
 * privilege level — see lib/supabase/secret.ts for the citation). Safe to
 * ship to the client because every table has RLS enabled (see
 * supabase/migrations/*_rls_policies.sql) and this key can never bypass
 * it. Never import the secret-key client (./secret.ts) from anywhere
 * reachable by client code.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
