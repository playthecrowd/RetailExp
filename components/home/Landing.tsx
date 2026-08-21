import Link from "next/link";

/**
 * The Retail eXp landing page.
 *
 * DELIBERATELY SMALL
 *   One name, one sentence, two ways in. No navigation, no feature grid, no
 *   imagery — a platform front door whose job is to say what this is and let
 *   the two audiences who arrive here (someone shown the demo, and a client
 *   signing in) get where they are going without reading a page first.
 *
 * SELF-CONTAINED BY CONSTRUCTION
 *   Every colour is written out here rather than taken from a shared token,
 *   and there is no new global CSS. Nothing about this file can reach the
 *   Kameleon experience, the Gifting Demo or the admin area — it only links
 *   to two of them.
 */

const INK = "#2f3134";
const INK_SOFT = "#6b6f75";
const INK_FAINT = "#9aa0a6";
const ACCENT = "#a8874a";
const SURFACE = "#faf9f6";
const HAIRLINE = "#e6e2da";

export function Landing() {
  return (
    <div
      className="flex min-h-dvh w-full flex-col"
      style={{
        background: SURFACE,
        color: INK,
        // Nothing sits under a notch or a home indicator, on either platform.
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-full max-w-[34rem]">
          {/* The wordmark is text, so it stays crisp at any size and needs no
              asset to load or maintain. */}
          <p className="text-[clamp(2rem,7vw,2.75rem)] font-light leading-none tracking-tight">
            Retail{" "}
            <span style={{ color: ACCENT, fontWeight: 500 }}>eXp</span>
          </p>
          <p
            className="mt-2 text-[11px] uppercase tracking-[0.3em]"
            style={{ color: INK_FAINT }}
          >
            Experience Platform
          </p>

          <div
            className="mx-auto mt-8 h-px w-16"
            style={{ background: HAIRLINE }}
            aria-hidden="true"
          />

          <h1 className="mt-8 text-[clamp(1.45rem,5.2vw,2rem)] font-light leading-[1.25] tracking-tight">
            Create retail experiences people remember.
          </h1>
          <p
            className="mx-auto mt-4 max-w-[30rem] text-[15px] leading-relaxed"
            style={{ color: INK_SOFT }}
          >
            Deliver personalized gifting, interactive video journeys and connected customer
            experiences from one platform.
          </p>

          {/* One action. Full width on a phone, its own width once there is
              room, and tall enough to be hit with a thumb either way. */}
          <div className="mt-10 flex flex-col items-stretch sm:flex-row sm:justify-center">
            <Link
              href="/admin/login"
              className="inline-flex min-h-14 items-center justify-center rounded-full border px-10 text-[14px] font-medium tracking-wide transition-colors hover:border-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ borderColor: HAIRLINE, color: INK }}
            >
              Client Sign In
            </Link>
          </div>
        </div>
      </main>

      <footer
        className="px-6 pb-8 pt-4 text-center text-[12px]"
        style={{ color: INK_FAINT }}
      >
        © 2026 Retail eXp. All rights reserved.
      </footer>
    </div>
  );
}
