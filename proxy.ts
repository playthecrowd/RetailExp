import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase Auth session cookie on every request to the
 * Kameleon experience — required for real sessions (Phase 7 Anonymous
 * Sign-In) to survive between the client-side sign-in and later
 * server-action reads; without this, a session can silently go stale.
 * Scoped narrowly (see `config.matcher` below) rather than site-wide, so
 * routes that never need a session don't pay the extra request cost.
 * Standard `@supabase/ssr` Next.js App Router pattern, using this Next.js
 * version's `proxy` file convention (renamed from `middleware` in v16 —
 * see node_modules/next/dist/docs/.../proxy.md).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/experience/kameleon/:path*"],
};
