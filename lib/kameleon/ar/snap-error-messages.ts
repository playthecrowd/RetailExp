/**
 * Maps Camera Kit's own named error types (see @snap/camera-kit's
 * namedErrors.d.ts — the actual list this project verified by reading the
 * installed package's source, not guessed) plus raw browser
 * `getUserMedia` DOMExceptions to honest, customer-facing copy. Every
 * mapped error also carries whether a "Try again" action makes sense, and a
 * normalized `category` (the matched error/DOMException name, or a fixed
 * label for non-SDK failure paths) so the isolated diagnostics screen can
 * show *which kind* of failure occurred without ever showing the raw
 * error object (which could otherwise leak stack traces/host info).
 *
 * Shared by BOTH the isolated diagnostic route
 * (`/experience/kameleon/ar-snap-test`) and the production Kameleon AR
 * screen (`KameleonCameraKitExperience`) — every message here must be
 * appropriate for a real customer to read, not just an internal tester.
 */

export interface SnapArError {
  message: string;
  recoverable: boolean;
  category: string;
}

const DEFAULT_CATEGORY = "Unknown";

const DEFAULT_ERROR: SnapArError = {
  message: "AR couldn't start. You can try again or continue without it.",
  recoverable: true,
  category: DEFAULT_CATEGORY,
};

/** DOMException.name values from a failed navigator.mediaDevices.getUserMedia() call. */
const CAMERA_PERMISSION_MESSAGES: Record<string, Omit<SnapArError, "category">> = {
  NotAllowedError: {
    message: "Camera access was denied. Allow camera access in your browser settings to continue.",
    recoverable: true,
  },
  NotFoundError: {
    message: "No usable rear camera was found on this device.",
    recoverable: false,
  },
  NotReadableError: {
    message: "The camera couldn't be started — it may be in use by another app.",
    recoverable: true,
  },
  OverconstrainedError: {
    message: "This device's camera doesn't support the required settings.",
    recoverable: false,
  },
  SecurityError: {
    message: "Camera access requires a secure (HTTPS) connection.",
    recoverable: false,
  },
  AbortError: {
    message: "Camera startup was interrupted. Try again.",
    recoverable: true,
  },
};

/** Camera Kit's own named error types (Error.prototype.name) — full list per namedErrors.d.ts. */
const CAMERA_KIT_NAMED_ERROR_MESSAGES: Record<string, Omit<SnapArError, "category">> = {
  PlatformNotSupportedError: {
    message: "This browser doesn't support AR on this device.",
    recoverable: false,
  },
  BootstrapError: {
    message: "The AR engine couldn't be loaded. Check your connection and try again.",
    recoverable: true,
  },
  ConfigurationError: {
    message: "AR configuration is invalid.",
    recoverable: false,
  },
  WebGLError: {
    message: "This device/browser couldn't start the AR renderer.",
    recoverable: false,
  },
  BenchmarkError: {
    message: "This device couldn't be evaluated for AR performance.",
    recoverable: false,
  },
  CameraKitSourceError: {
    message: "The camera couldn't be started for AR.",
    recoverable: true,
  },
  LensError: {
    message: "The AR effect couldn't be loaded.",
    recoverable: true,
  },
  LensAssetError: {
    message: "Part of the AR effect couldn't be downloaded. Check your connection and try again.",
    recoverable: true,
  },
  LensContentValidationError: {
    message: "The AR effect couldn't be verified and was not loaded.",
    recoverable: false,
  },
  LensExecutionError: {
    message: "The AR effect stopped unexpectedly.",
    recoverable: true,
  },
  LensAbortError: {
    message: "AR became unavailable and needs to be restarted.",
    recoverable: true,
  },
  LensImagePickerError: {
    message: "The AR effect couldn't access an image it needed.",
    recoverable: true,
  },
  LensVideoPlaybackMutedError: {
    message: "Video in this AR effect is muted by your browser.",
    recoverable: true,
  },
  CacheKeyNotFoundError: {
    message: "The AR effect's cached data couldn't be found and needs to be reloaded.",
    recoverable: true,
  },
  PersistentStoreError: {
    message: "The AR effect couldn't save its data on this device.",
    recoverable: true,
  },
  ArgumentValidationError: {
    message: "AR configuration is invalid.",
    recoverable: false,
  },
  LegalError: {
    message: "You'll need to accept Snap's terms to continue with AR.",
    recoverable: true,
  },
};

function isDOMException(value: unknown): value is DOMException {
  return typeof DOMException !== "undefined" && value instanceof DOMException;
}

function isErrorLike(value: unknown): value is { name?: string; message?: string; cause?: unknown } {
  return typeof value === "object" && value !== null;
}

/**
 * Walks a possible error/cause chain (Camera Kit often wraps the original
 * browser DOMException as `.cause` on its own named error) looking for a
 * recognized name, camera-permission error first since it's the most
 * common real-world case. The returned `category` is always just the
 * matched name (or "Unknown") — never the raw error/message/stack, so it's
 * safe to render directly in the isolated diagnostics UI.
 */
export function mapSnapArError(error: unknown): SnapArError {
  let current: unknown = error;
  for (let i = 0; i < 5 && isErrorLike(current); i++) {
    const name = current.name;
    if (typeof name === "string") {
      if (CAMERA_PERMISSION_MESSAGES[name]) return { ...CAMERA_PERMISSION_MESSAGES[name], category: name };
      if (CAMERA_KIT_NAMED_ERROR_MESSAGES[name]) return { ...CAMERA_KIT_NAMED_ERROR_MESSAGES[name], category: name };
    }
    if (isDOMException(current) && CAMERA_PERMISSION_MESSAGES[current.name]) {
      return { ...CAMERA_PERMISSION_MESSAGES[current.name], category: current.name };
    }
    current = current.cause;
  }
  return DEFAULT_ERROR;
}

/** Missing/invalid configuration — distinct from a runtime SDK error. */
export const CONFIG_MISSING_ERROR: SnapArError = {
  message: "AR configuration is missing.",
  recoverable: false,
  category: "ConfigMissing",
};

export const UNSUPPORTED_BROWSER_ERROR: SnapArError = {
  message: "This browser doesn't support AR.",
  recoverable: false,
  category: "UnsupportedBrowser",
};

/** The session never produced a rendered frame within the timeout window. */
export const NO_FRAME_TIMEOUT_ERROR: SnapArError = {
  message: "AR didn't finish starting in time.",
  recoverable: true,
  category: "NoFrameTimeout",
};
