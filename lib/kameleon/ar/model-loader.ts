import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { SAMPLE_MODEL_URL, type ARError } from "./ar-types";

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

let cachedLoader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (!cachedLoader) cachedLoader = new GLTFLoader();
  return cachedLoader;
}

/**
 * Loads the local prototype GLB (never a remote URL — see
 * docs/KAMELEON_AR_ASSET_MANIFEST.md). Rejects with a typed ARError so the
 * UI can show a real retry action instead of a raw loader exception.
 */
export function loadSampleModel(url: string = SAMPLE_MODEL_URL): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    getLoader().load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
      undefined,
      () => {
        reject({
          code: "model-load-failed",
          message: "The sample 3D model could not be loaded.",
          recoverable: true,
        } satisfies ARError);
      },
    );
  });
}

/**
 * The Fox sample's raw glTF units read as roughly human-height; this scale
 * brings it down to a small tabletop/floor object. Approximate — intended to
 * be tuned once verified on a physical device, and replaced entirely once
 * the real Kameleon bottle GLB (built at its own real-world scale) lands.
 */
export const SAMPLE_MODEL_SCALE = 0.01;

/**
 * The Fox is a rigged/skinned, animated model — a plain `Object3D.clone()`
 * does not correctly duplicate its skeleton/bone bindings, so every
 * placement needs a fresh `SkeletonUtils.clone()` of the one loaded scene
 * graph rather than reloading the GLB from disk each time.
 */
export function cloneLoadedModel(scene: THREE.Object3D): THREE.Object3D {
  return cloneSkinned(scene);
}

export function applyPlacementScale(object: THREE.Object3D, scale: number = SAMPLE_MODEL_SCALE): void {
  object.scale.setScalar(scale);
}

export function disposeModel(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
    }
  });
}
