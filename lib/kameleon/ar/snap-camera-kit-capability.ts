import { getSnapCameraKitConfigStatus } from "./snap-camera-kit-config";

export interface SnapCameraKitCapabilityResult {
  supported: boolean;
  /** Human-readable, customer-safe reason — never mentions configuration/env details. */
  reason: string;
}

/**
 * Feature-detection only, never browser-name sniffing (same philosophy as
 * lib/kameleon/ar/capability-detection.ts's Quick Look check) — every
 * target browser (iPhone Safari/Chrome/Firefox, Android Chrome/Samsung
 * Internet) already satisfies these checks, so there's no need to allowlist
 * by user agent, and it avoids blocking a browser that happens to also
 * support the same APIs.
 */
export function detectSnapCameraKitCapability(): SnapCameraKitCapabilityResult {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return { supported: false, reason: "AR requires a secure (HTTPS) connection." };
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { supported: false, reason: "This browser doesn't support camera access for AR." };
  }
  // A missing/incomplete Camera Kit configuration (e.g. a preview deployment
  // without the Vercel environment variables set) is a deployment issue, not
  // a browser limitation — but it must degrade the same way for the
  // customer: an honest "AR isn't available" message, never a broken screen,
  // and never any detail about which configuration is missing.
  if (!getSnapCameraKitConfigStatus().configured) {
    return { supported: false, reason: "AR isn't available right now." };
  }
  return { supported: true, reason: "" };
}
