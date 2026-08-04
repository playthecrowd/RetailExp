/**
 * Maps Camera Kit's own named error types (see @snap/camera-kit's
 * namedErrors.d.ts — the actual list this project verified by reading the
 * installed package's source, not guessed) plus raw browser
 * `getUserMedia` DOMExceptions to honest, customer-facing copy. Every
 * mapped error also carries whether a "Try again" action makes sense.
 */

export interface SnapArError {
  message: string;
  recoverable: boolean;
}

const DEFAULT_ERROR: SnapArError = {
  message: "The AR test couldn't start. You can try again or exit.",
  recoverable: true,
};

/** DOMException.name values from a failed navigator.mediaDevices.getUserMedia() call. */
const CAMERA_PERMISSION_MESSAGES: Record<string, SnapArError> = {
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
};

/** Camera Kit's own named error types (Error.prototype.name). */
const CAMERA_KIT_NAMED_ERROR_MESSAGES: Record<string, SnapArError> = {
  PlatformNotSupportedError: {
    message: "This browser doesn't support the AR test on this device.",
    recoverable: false,
  },
  BootstrapError: {
    message: "The AR engine couldn't be loaded. Check your connection and try again.",
    recoverable: true,
  },
  ConfigurationError: {
    message: "AR test configuration is invalid.",
    recoverable: false,
  },
  WebGLError: {
    message: "This device/browser couldn't start the AR renderer.",
    recoverable: false,
  },
  CameraKitSourceError: {
    message: "The camera couldn't be started for the AR test.",
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
    message: "The AR test became unavailable and needs to be restarted.",
    recoverable: true,
  },
  LegalError: {
    message: "You'll need to accept Snap's terms to continue the AR test.",
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
 * common real-world case.
 */
export function mapSnapArError(error: unknown): SnapArError {
  let current: unknown = error;
  for (let i = 0; i < 5 && isErrorLike(current); i++) {
    const name = current.name;
    if (typeof name === "string") {
      if (CAMERA_PERMISSION_MESSAGES[name]) return CAMERA_PERMISSION_MESSAGES[name];
      if (CAMERA_KIT_NAMED_ERROR_MESSAGES[name]) return CAMERA_KIT_NAMED_ERROR_MESSAGES[name];
    }
    if (isDOMException(current) && CAMERA_PERMISSION_MESSAGES[current.name]) {
      return CAMERA_PERMISSION_MESSAGES[current.name];
    }
    current = current.cause;
  }
  return DEFAULT_ERROR;
}

/** Missing/invalid configuration — distinct from a runtime SDK error. */
export const CONFIG_MISSING_ERROR: SnapArError = {
  message: "AR test configuration is missing.",
  recoverable: false,
};

export const UNSUPPORTED_BROWSER_ERROR: SnapArError = {
  message: "This browser doesn't support the AR test.",
  recoverable: false,
};
