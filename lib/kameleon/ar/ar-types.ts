/**
 * Shared types/constants for the Phase 5 real WebXR ground-plane AR
 * prototype. Kept separate from the rest of lib/kameleon so the AR
 * pipeline (capability detection, session lifecycle, hit testing, model
 * loading, animation) stays independently testable from the React layer.
 */

/** Single source of truth for the prototype model path — see docs/KAMELEON_AR_ASSET_MANIFEST.md. */
export const SAMPLE_MODEL_URL = "/assets/kameleon/ar/sample-animated-model.glb";

/** The model's available clips, in the order the prototype should prefer them. */
export const SAMPLE_MODEL_ANIMATIONS = ["Survey", "Walk", "Run"] as const;
export type SampleModelAnimation = (typeof SAMPLE_MODEL_ANIMATIONS)[number];

export type ARCapabilityStatus =
  | "checking"
  | "supported"
  | "unsupported-insecure-context"
  | "unsupported-no-xr"
  | "unsupported-immersive-ar"
  | "unsupported-hit-test";

export interface ARCapabilityResult {
  status: ARCapabilityStatus;
  /** Human-readable reason, safe to show directly in the fallback UI. */
  reason: string;
  isSecureContext: boolean;
  hasNavigatorXR: boolean;
}

export function isCapabilitySupported(result: ARCapabilityResult): boolean {
  return result.status === "supported";
}

/**
 * Internal phase of a single AR attempt, owned by KameleonARExperience.
 * Distinct from the top-level Kameleon session `screen` (lib/kameleon/types.ts)
 * — the outer session only ever sees "the AR screen is active" or "the user
 * left it"; this is the finer-grained state machine *within* that screen.
 */
export type ARPhase =
  | "capability-check"
  | "start-screen"
  | "requesting-session"
  | "scanning"
  | "surface-found"
  | "placed"
  | "tracking-lost"
  | "error"
  | "unsupported";

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
