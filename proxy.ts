import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase Auth session cookie on every request to the
 * Kameleon experience and the admin area — required for real sessions
 * (Phase 7 Anonymous Sign-In for visitors, Phase 2.5 email/password for
 * administrators) to survive between a client-side sign-in and later
 * server-action reads; without this, a session can silently go stale.
 * Scoped narrowly (see `config.matcher` below) rather than site-wide, so
 * routes that never need a session don't pay the extra request cost.
 * Standard `@supabase/ssr` Next.js App Router pattern, using this Next.js
 * version's `proxy` file convention (renamed from `middleware` in v16 —
 * see node_modules/next/dist/docs/.../proxy.md).
 *
 * IMPORTANT — this is NOT the authorization boundary.
 *
 * The redirect below is an optimistic pre-filter only: it checks whether an
 * auth cookie is present, nothing more. It cannot tell an administrator from
 * an anonymous Kameleon visitor, and it deliberately performs no database
 * lookup, because proxy runs on prefetches too. Real authorization lives in
 * app/admin/(protected)/layout.tsx and lib/auth/admin.ts, which re-check
 * every request regardless of what happened here. Next.js's own guidance is
 * explicit that proxy "should not be your only line of defense".
 *
 * Deleting this redirect would not create a security hole; deleting the
 * layout gate would.
 */

/** Public admin routes. They must never be redirected to the sign-in page —
 *  /admin/login redirecting to /admin/login is the classic infinite loop. */
const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/admin/access-denied"]);

/** The stakeholder gate itself, for the same reason. */
const PILOT_GATE_PATH = "/experience/kameleon/access";

/** Presence only. See the redirect below for why this does not verify. */
const PILOT_COOKIE = "kameleon_pilot_access";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // The stakeholder evaluation is closed. Same division of labour as the
  // admin branch below: this checks only whether an unlock cookie is PRESENT,
  // never whether it is valid. Verifying it here would mean computing an HMAC
  // on every prefetch, and would put a security decision in the one place
  // Next's own guidance says must not be the only line of defence. The real
  // check is app/experience/kameleon/(gated)/layout.tsx, which recomputes the
  // derivation and redirects on a mismatch.
  //
  // Note what is NOT matched: /api/* is outside this proxy's matcher entirely,
  // so the Cloudflare Stream webhook and the retention cron are unaffected. A
  // gate that blocked them would have broken video reconciliation silently.
  if (
    pathname.startsWith("/experience/kameleon") &&
    pathname !== PILOT_GATE_PATH &&
    !request.cookies.has(PILOT_COOKIE)
  ) {
    return NextResponse.redirect(new URL(PILOT_GATE_PATH, request.url));
  }

  if (pathname.startsWith("/admin") && !PUBLIC_ADMIN_PATHS.has(pathname)) {
    // Only the total absence of a user is acted on here. An anonymous
    // visitor session reaches the layout gate and is rejected there, by the
    // component that can actually tell the difference — resolving that
    // distinction in the proxy would mean trusting a check that runs on
    // prefetch requests and CDN-cached paths.
    if (!user) {
      const signInUrl = new URL("/admin/login", request.url);
      signInUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/experience/kameleon/:path*", "/admin/:path*"],
};
