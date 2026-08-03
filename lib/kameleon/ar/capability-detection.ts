import type { ARCapabilityResult } from "./ar-types";

/**
 * UA-based iOS/iPadOS detection — used only for copy/labeling, never as the
 * capability gate itself (that's `detectQuickLookSupport` below). iPadOS
 * since iOS 13 reports its UA as a normal Mac, so it's distinguished by
 * touch-point support instead.
 */
function detectIsIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIPhoneOrIPod = /iPhone|iPod/.test(ua);
  const isIPadOS = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIPhoneOrIPod || isIPadOS;
}

/**
 * The standards-based feature check for Apple AR Quick Look support: every
 * iOS/iPadOS browser (Safari, Chrome, Edge, Firefox) runs on WebKit per
 * Apple's App Store policy, so this is true across all of them, not just
 * Safari — this is why detection must not key off `navigator.xr` alone or
 * off browser-name sniffing.
 */
function detectQuickLookSupport(): boolean {
  if (typeof document === "undefined") return false;
  const a = document.createElement("a");
  return !!(a.relList && a.relList.supports && a.relList.supports("ar"));
}

/**
 * Resolves which real AR path this device/browser can take. Order matters:
 * WebXR is checked first (the richer, embedded ground-plane experience);
 * Quick Look is only considered once WebXR is confirmed unavailable. Never
 * claims a pathway is available before the relevant check actually
 * completes.
 */
export async function detectARCapability(): Promise<ARCapabilityResult> {
  const isSecureContext = typeof window !== "undefined" && window.isSecureContext;
  const isIOS = detectIsIOS();

  if (!isSecureContext) {
    return {
      pathway: "unsupported",
      reason: "AR requires a secure (HTTPS) connection. This page was loaded over an insecure connection.",
      isSecureContext: false,
      hasNavigatorXR: false,
      isIOS,
    };
  }

  const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
  const hasNavigatorXR = !!xr;

  if (xr) {
    try {
      const immersiveArSupported = await xr.isSessionSupported("immersive-ar");
      if (immersiveArSupported) {
        return {
          pathway: "webxr",
          reason: "Immersive AR is available.",
          isSecureContext: true,
          hasNavigatorXR: true,
          isIOS,
        };
      }
    } catch {
      // Fall through to the Quick Look / unsupported checks below.
    }
  }

  if (detectQuickLookSupport()) {
    return {
      pathway: "quicklook",
      reason: "Apple AR Quick Look is available on this device.",
      isSecureContext: true,
      hasNavigatorXR,
      isIOS,
    };
  }

  return {
    pathway: "unsupported",
    reason: hasNavigatorXR
      ? "This device/browser reports it cannot start an immersive AR session, and Apple AR Quick Look isn't available here."
      : "This browser doesn't support embedded WebXR AR or Apple AR Quick Look.",
    isSecureContext: true,
    hasNavigatorXR,
    isIOS,
  };
}
