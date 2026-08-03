import * as THREE from "three";

/**
 * Thin wrapper around Three.js's AnimationMixer for a single placed model.
 * The Fox sample's three clips (Survey/Walk/Run) all drive the same joints,
 * so only one is ever meant to play at once — this controller enforces that.
 */
export class AnimationController {
  private mixer: THREE.AnimationMixer;
  private clips: THREE.AnimationClip[];
  private currentAction: THREE.AnimationAction | null = null;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips;
  }

  /** Plays a clip by name (case-insensitive). Returns false if no clip matches. */
  playByName(name: string): boolean {
    const clip =
      THREE.AnimationClip.findByName(this.clips, name) ??
      this.clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!clip) return false;

    this.currentAction?.stop();
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.reset().play();
    this.currentAction = action;
    return true;
  }

  /** Tries each name in order (e.g. ["Survey", "Walk", "Run"]), falling back to the first available clip. */
  playPreferred(preferenceOrder: readonly string[]): boolean {
    for (const name of preferenceOrder) {
      if (this.playByName(name)) return true;
    }
    const fallback = this.clips[0];
    if (!fallback) return false;
    const action = this.mixer.clipAction(fallback);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.reset().play();
    this.currentAction = action;
    return true;
  }

  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.currentAction = null;
  }
}
