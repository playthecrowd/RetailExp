import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client for Server Components/Actions/Route
 * Handlers — still uses the publishable key (RLS applies exactly as it
 * would for a browser request; see lib/supabase/client.ts), just reads
 * the session from cookies instead of browser storage. For operations
 * that must bypass RLS entirely (e.g. creating the first
 * client_memberships row for a brand-new client), use ./secret.ts
 * instead, and only from trusted server code.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component that can't set cookies — safe
            // to ignore because session refresh also runs in proxy.ts, whose
            // matcher covers both /experience/kameleon/:path* and
            // /admin/:path*. If a third authenticated area is ever added,
            // its path must be added to that matcher or sessions there will
            // silently go stale at the JWT expiry.
          }
        },
      },
    },
  );
}
