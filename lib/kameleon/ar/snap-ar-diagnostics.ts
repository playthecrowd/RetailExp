/**
 * Fine-grained lifecycle stages for the isolated Snap Camera Kit test route.
 *
 * These are deliberately more granular than @snap/react-camera-kit's own
 * three-bucket status (`sdkStatus` / `source.status` / `lens.status`) —
 * that coarseness is exactly why this route no longer uses the React
 * wrapper (see SnapArTestScreen.tsx's top comment). Every stage here maps
 * to one specific, directly-observable call against the core
 * `@snap/camera-kit` API.
 *
 * "terms-consent" has no dedicated public API to hook into directly — the
 * SDK's legal-prompt handling is internal (LegalPromptFactory is not part
 * of the public API surface). It's included here because a LegalError can
 * surface from bootstrap/session calls, in which case the failed stage is
 * attributed to "terms-consent" rather than the call that happened to
 * throw it. This is intentionally not a private-API workaround — it's
 * error-name-based attribution.
 */
export type SnapArStage =
  | "configuration"
  | "sdk-bootstrap"
  | "terms-consent"
  | "camera-request"
  | "camera-ready"
  | "lens-lookup"
  | "lens-load"
  | "lens-apply"
  | "session-play"
  | "first-frame"
  | "active-session"
  | "cleanup";

export const STAGE_LABELS: Record<SnapArStage, string> = {
  configuration: "Configuration",
  "sdk-bootstrap": "Camera Kit SDK bootstrap",
  "terms-consent": "Terms / consent",
  "camera-request": "Camera request",
  "camera-ready": "Camera ready",
  "lens-lookup": "Lens group lookup",
  "lens-load": "Lens content load",
  "lens-apply": "Lens apply",
  "session-play": "Session play",
  "first-frame": "First rendered frame",
  "active-session": "Active session",
  cleanup: "Cleanup",
};

/** Order the stages normally occur in — used to render a simple progress list. */
export const STAGE_ORDER: SnapArStage[] = [
  "configuration",
  "sdk-bootstrap",
  "terms-consent",
  "camera-request",
  "camera-ready",
  "lens-lookup",
  "lens-load",
  "lens-apply",
  "session-play",
  "first-frame",
  "active-session",
];

export type TriState = "yes" | "no" | "pending";
export type PassFail = "pass" | "fail" | "pending";

/**
 * Every field here is safe to render directly in the UI — none of them can
 * ever contain an API token, Lens ID, Lens Group ID, or any other
 * environment-variable value. Only stage names, booleans, and normalized
 * error categories (see mapSnapArError's `category`) are stored here.
 */
export interface SnapArDiagnostics {
  lastSuccessfulStage: SnapArStage | null;
  failedStage: SnapArStage | null;
  errorCategory: string | null;
  sdkInitialized: TriState;
  cameraStarted: TriState;
  lensGroupQueried: TriState;
  lensFoundInGroup: PassFail;
  lensLoaded: TriState;
  lensApplied: TriState;
  sessionPlaying: TriState;
  firstFrameReceived: TriState;
  cleanupCompleted: TriState;
}

export function createInitialDiagnostics(): SnapArDiagnostics {
  return {
    lastSuccessfulStage: null,
    failedStage: null,
    errorCategory: null,
    sdkInitialized: "pending",
    cameraStarted: "pending",
    lensGroupQueried: "pending",
    lensFoundInGroup: "pending",
    lensLoaded: "pending",
    lensApplied: "pending",
    sessionPlaying: "pending",
    firstFrameReceived: "pending",
    cleanupCompleted: "pending",
  };
}
