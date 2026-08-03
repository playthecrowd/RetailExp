import type * as THREE from "three";
import { AR_OPTIONAL_FEATURES, AR_REQUIRED_FEATURES, type ARError } from "./ar-types";

export interface StartARSessionOptions {
  renderer: THREE.WebGLRenderer;
  /** Required when requesting the optional "dom-overlay" feature. */
  domOverlayRoot?: HTMLElement;
  onSessionEnd: () => void;
}

export interface StartARSessionResult {
  session: XRSession;
  /** Reference space used for rendering/anchoring — "local" is broadly supported. */
  referenceSpace: XRReferenceSpace;
}

/**
 * Maps a WebXR session-request failure to an honest, user-facing ARError.
 * DOMException names are the standard way browsers report *why* a WebXR
 * request failed (see https://immersive-web.github.io/webxr/#dom-xrsessioninit).
 */
export function mapSessionRequestError(error: unknown): ARError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return {
        code: "permission-denied",
        message: "Camera/AR permission was denied. Allow camera access to continue.",
        recoverable: true,
      };
    }
    if (error.name === "NotSupportedError") {
      return {
        code: "hit-test-unavailable",
        message: "This device does not support the surface-detection feature AR needs here.",
        recoverable: false,
      };
    }
    if (error.name === "SecurityError") {
      return {
        code: "insecure-context",
        message: "AR requires a secure (HTTPS) connection.",
        recoverable: false,
      };
    }
    if (error.name === "InvalidStateError") {
      return {
        code: "session-interrupted",
        message: "An AR session is already active or was interrupted. Try again.",
        recoverable: true,
      };
    }
  }
  return {
    code: "unknown",
    message: "AR could not start on this device. You can continue without AR.",
    recoverable: true,
  };
}

/**
 * Requests an immersive-ar session (must be called from a real user gesture,
 * e.g. inside a button's onClick — WebXR rejects requestSession calls that
 * don't originate from user activation) and prepares it for rendering with
 * the given Three.js renderer.
 */
export async function startARSession({
  renderer,
  domOverlayRoot,
  onSessionEnd,
}: StartARSessionOptions): Promise<StartARSessionResult> {
  const xr = navigator.xr;
  if (!xr) {
    throw { code: "no-xr", message: "WebXR is not available in this browser.", recoverable: false } satisfies ARError;
  }

  const sessionInit: XRSessionInit = {
    requiredFeatures: [...AR_REQUIRED_FEATURES],
    optionalFeatures: [...AR_OPTIONAL_FEATURES],
  };
  if (domOverlayRoot) {
    sessionInit.domOverlay = { root: domOverlayRoot };
  }

  let session: XRSession;
  try {
    session = await xr.requestSession("immersive-ar", sessionInit);
  } catch (error) {
    throw mapSessionRequestError(error);
  }

  session.addEventListener("end", onSessionEnd, { once: true });

  renderer.xr.enabled = true;
  // "local" is the broadly-supported baseline; "local-floor" is requested as
  // optional above and used automatically by the renderer's XR reference
  // space handling when granted — ground placement still works on "local"
  // alone via the hit-test pose itself, per the phase spec.
  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);

  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!referenceSpace) {
    await endARSession(session);
    throw {
      code: "unknown",
      message: "Could not establish an AR reference space.",
      recoverable: true,
    } satisfies ARError;
  }

  return { session, referenceSpace };
}

export async function endARSession(session: XRSession | null | undefined): Promise<void> {
  if (!session) return;
  try {
    await session.end();
  } catch {
    // Session may already be ending/ended — nothing further to do.
  }
}
