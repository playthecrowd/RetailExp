import type { ARCapabilityResult } from "./ar-types";

/**
 * Determines whether this browser/device can even attempt immersive AR,
 * without ever claiming support before the check actually completes. Must
 * only run client-side (relies on `window`/`navigator`), so every caller is
 * expected to be inside a "use client" component that has already mounted.
 *
 * Hit-test itself isn't independently queryable ahead of a real session
 * request — the WebXR spec has no "isFeatureSupported('hit-test')" API — so
 * a `hit-test`-specific failure surfaces later, when webxr-session.ts's
 * actual `requestSession` call rejects (mapped to the `hit-test-unavailable`
 * ARError there), not here.
 */
export async function detectARCapability(): Promise<ARCapabilityResult> {
  const isSecureContext = typeof window !== "undefined" && window.isSecureContext;
  if (!isSecureContext) {
    return {
      status: "unsupported-insecure-context",
      reason: "AR requires a secure (HTTPS) connection. This page was loaded over an insecure connection.",
      isSecureContext: false,
      hasNavigatorXR: false,
    };
  }

  const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
  if (!xr) {
    return {
      status: "unsupported-no-xr",
      reason: "This browser does not expose the WebXR API. Try the latest Chrome on a compatible Android device.",
      isSecureContext: true,
      hasNavigatorXR: false,
    };
  }

  try {
    const immersiveArSupported = await xr.isSessionSupported("immersive-ar");
    if (!immersiveArSupported) {
      return {
        status: "unsupported-immersive-ar",
        reason: "This device/browser reports it cannot start an immersive AR session.",
        isSecureContext: true,
        hasNavigatorXR: true,
      };
    }
  } catch {
    return {
      status: "unsupported-immersive-ar",
      reason: "This device/browser could not confirm immersive AR support.",
      isSecureContext: true,
      hasNavigatorXR: true,
    };
  }

  return {
    status: "supported",
    reason: "Immersive AR is available.",
    isSecureContext: true,
    hasNavigatorXR: true,
  };
}
