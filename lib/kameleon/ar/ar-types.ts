/**
 * Shared types/constants for the Phase 5 real WebXR ground-plane AR
 * prototype. Kept separate from the rest of lib/kameleon so the AR
 * pipeline (capability detection, session lifecycle, hit testing, model
 * loading, animation) stays independently testable from the React layer.
 */

/**
 * Single source of truth for the animated GLB path (Android/WebXR path and
 * the inline 3D preview) — see docs/KAMELEON_AR_ASSET_MANIFEST.md.
 */
export const SAMPLE_MODEL_URL = "/assets/kameleon/ar/sample-animated-model.glb";

/**
 * The iPhone/iPad AR Quick Look asset. Deliberately NOT a conversion of the
 * animated Fox — an original static (non-animated) placeholder, since a
 * glTF -> USDZ conversion of the Fox could not be reliably produced or
 * verified in this environment. See docs/KAMELEON_AR_ASSET_MANIFEST.md for
 * the full explanation; animation for the Quick Look path is documented
 * there as pending, not claimed here.
 */
// Served through a route handler (app/api/ar/usdz/route.ts), not the direct
// public/ path, so the response always carries the exact
// `model/vnd.usdz+zip` content-type Quick Look expects — see that file.
export const SAMPLE_MODEL_USDZ_URL = "/api/ar/usdz";

/** The GLB's available clips, in the order the prototype should prefer them. Not applicable to the USDZ (static). */
export const SAMPLE_MODEL_ANIMATIONS = ["Survey", "Walk", "Run"] as const;
export type SampleModelAnimation = (typeof SAMPLE_MODEL_ANIMATIONS)[number];

/**
 * Which real AR path this device/browser can actually take, decided by
 * capability, never by guessing from device name alone:
 * - "webxr": `navigator.xr` + `isSessionSupported("immersive-ar")` — real
 *   ground-plane hit-test AR embedded in the page (Android Chrome today).
 * - "quicklook": Apple AR Quick Look is available (`HTMLAnchorElement
 *   .relList.supports("ar")`, the standards-based feature check — true in
 *   Safari AND Chrome/Edge/Firefox on iOS/iPadOS, since Apple requires every
 *   iOS browser to run on WebKit). Launches the native OS AR viewer, not an
 *   embedded page experience.
 * - "unsupported": neither is available — honest inline 3D fallback only.
 */
export type ARPathway = "checking" | "webxr" | "quicklook" | "unsupported";

export interface ARCapabilityResult {
  pathway: ARPathway;
  /** Human-readable reason, safe to show directly in the fallback UI. */
  reason: string;
  isSecureContext: boolean;
  hasNavigatorXR: boolean;
  /** UA-based, used only for copy/labeling ("iPhone uses Apple AR Quick Look") — never the sole capability gate. */
  isIOS: boolean;
}

/**
 * Internal phase of a single *WebXR* AR attempt, owned by
 * KameleonARExperience — only relevant once `ARPathway` has already
 * resolved to "webxr". Distinct from the top-level Kameleon session
 * `screen` (lib/kameleon/types.ts) — the outer session only ever sees "the
 * AR screen is active" or "the user left it"; this is the finer-grained
 * state machine *within* the WebXR branch of that screen. The Quick Look
 * and unsupported branches have no comparable session lifecycle, so they
 * aren't modeled here.
 */
export type ARPhase =
  | "start-screen"
  | "requesting-session"
  | "scanning"
  | "surface-found"
  | "placed"
  | "tracking-lost"
  | "error";

export type ARErrorCode =
  | "permission-denied"
  | "insecure-context"
  | "no-xr"
  | "unsupported-immersive-ar"
  | "hit-test-unavailable"
  | "no-surface-found"
  | "session-interrupted"
  | "tracking-lost"
  | "model-load-failed"
  | "session-ended-unexpectedly"
  | "unknown";

export interface ARError {
  code: ARErrorCode;
  /** Short, honest, user-facing explanation — never a raw browser error string. */
  message: string;
  /** Whether "Try again" makes sense for this error. */
  recoverable: boolean;
}

/** A single WebXR hit-test result reduced to what the reticle/placement logic needs. */
export interface ARHitPose {
  position: [number, number, number];
  /** Rotation as a quaternion [x, y, z, w]. */
  quaternion: [number, number, number, number];
}

export const AR_REQUIRED_FEATURES = ["hit-test"] as const;
export const AR_OPTIONAL_FEATURES = ["dom-overlay", "anchors", "light-estimation", "local-floor"] as const;
