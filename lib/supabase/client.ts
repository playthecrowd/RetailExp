"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser-side Supabase client — uses the anon key only, which is safe to
 * ship to the client because every table has RLS enabled (see
 * supabase/migrations/*_rls_policies.sql). Never import the service-role
 * client (./service-role.ts) from anywhere reachable by client code.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
