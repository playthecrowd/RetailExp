import type { NextConfig } from "next";

/**
 * Minimal, narrowly-scoped CSP for the isolated Phase 5B Snap Camera Kit
 * test route only (/experience/kameleon/ar-snap-test) — every other route
 * in this project has no CSP at all (verified before writing this; see
 * docs/RETAILEXP_PHASE_TRACKER.md's Phase 5B Checkpoint 1 record), and
 * this intentionally does not change that for the rest of the site.
 *
 * Every third-party host below was found by reading @snap/camera-kit's own
 * installed source (grep for hardcoded hostnames), not guessed or copied
 * from unrelated documentation:
 * - `camera-kit-api.snapar.com` — configuration.js's default `apiHostname`.
 * - `cf-st.sc-cdn.net` — lensCoreWasmVersions.js, the WASM/JS render-engine
 *   glue CDN.
 * - `bolt-gcdn.sc-cdn.net` — cameraKitLensSource.js, the Lens asset CDN.
 *   Covered by the `*.sc-cdn.net` wildcard alongside the host above.
 *
 * `'wasm-unsafe-eval'` (not the broader `'unsafe-eval'`) is requested for
 * the render engine's WebAssembly compilation — the narrower, WASM-specific
 * CSP keyword modern browsers support specifically so sites don't have to
 * grant blanket `eval()` access just for WASM.
 *
 * `'unsafe-inline'` on script-src, documented here rather than silently
 * added: without it, this route got physically, reproducibly stuck on its
 * `next/dynamic` loading state in `next dev` (Turbopack) — confirmed via a
 * controlled isolation test (CSP off: loads correctly; CSP with only
 * `'wasm-unsafe-eval'`: stuck; CSP with `'wasm-unsafe-eval' 'unsafe-eval'`
 * added: still stuck; CSP with `'unsafe-inline'` added: loads correctly).
 * That sequence also physically ruled out `'unsafe-eval'` as unnecessary —
 * it was tried and removed again rather than left in "just in case." Root
 * cause: Next's dev-mode client bootstrap sets `self.__next_r` via an
 * inline `<script>` it injects into the document, which `'unsafe-inline'`
 * (not `'unsafe-eval'`) is what actually permits. This dev-mode-specific
 * requirement has not been re-tested against a production build, which may
 * not need it (production doesn't ship the same dev bootstrap script) —
 * flagged as an open item before this CSP should be considered final.
 */
const SNAP_CAMERA_KIT_CSP = [
  "default-src 'self'",
  "script-src 'self' https://cf-st.sc-cdn.net blob: 'wasm-unsafe-eval' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.snapar.com https://*.sc-cdn.net",
  "img-src 'self' data: blob: https://*.sc-cdn.net",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/experience/kameleon/ar-snap-test",
        headers: [
          { key: "Content-Security-Policy", value: SNAP_CAMERA_KIT_CSP },
          { key: "Permissions-Policy", value: "camera=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
