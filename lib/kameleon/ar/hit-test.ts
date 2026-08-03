import type * as THREE from "three";
import type { ARError, ARHitPose } from "./ar-types";

export interface HitTestController {
  source: XRHitTestSource;
  dispose: () => void;
}

/**
 * Sets up a hit-test source anchored to the viewer (the phone itself), so
 * every frame's hit-test results represent "what surface is currently in
 * front of the camera" — the standard ground/surface-detection pattern.
 */
export async function createHitTestSource(session: XRSession): Promise<HitTestController> {
  if (typeof session.requestHitTestSource !== "function") {
    throw {
      code: "hit-test-unavailable",
      message: "This device does not support surface detection.",
      recoverable: false,
    } satisfies ARError;
  }

  const viewerSpace = await session.requestReferenceSpace("viewer");
  const source = await session.requestHitTestSource({ space: viewerSpace });
  if (!source) {
    throw {
      code: "hit-test-unavailable",
      message: "This device does not support surface detection.",
      recoverable: false,
    } satisfies ARError;
  }

  return {
    source,
    dispose: () => {
      source.cancel();
    },
  };
}

/**
 * Reads the closest current hit-test result, if any, for this frame. Returns
 * null when no surface is currently detected under the viewer — the normal,
 * expected state while the user is still moving the phone to find one.
 */
export function getHitPose(
  frame: XRFrame,
  hitTestSource: XRHitTestSource,
  referenceSpace: XRReferenceSpace,
): ARHitPose | null {
  const results = frame.getHitTestResults(hitTestSource);
  if (results.length === 0) return null;

  const pose = results[0].getPose(referenceSpace);
  if (!pose) return null;

  const { position, orientation } = pose.transform;
  return {
    position: [position.x, position.y, position.z],
    quaternion: [orientation.x, orientation.y, orientation.z, orientation.w],
  };
}

/** Positions/orients a Three.js object at a hit-test pose (reticle or placed model). */
export function applyHitPose(object: THREE.Object3D, pose: ARHitPose): void {
  object.position.set(...pose.position);
  object.quaternion.set(...pose.quaternion);
}
