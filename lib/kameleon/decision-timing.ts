import type { VideoNode } from "./pathway-model";

export type TransitionMode = "atVideoEnd" | "immediate";
export type FinalFrameBehavior = "hold" | "loop";

export interface DecisionTiming {
  /** Subtle "a decision is approaching" cue appears this many seconds before the video ends. */
  decisionCueSeconds: number;
  /** Bottom handle/tab begins revealing this many seconds before the video ends. */
  handleRevealSeconds: number;
  /** Full decision drawer rises this many seconds before the video ends. */
  drawerRevealSeconds: number;
  /** Whether an early selection swaps the video immediately or waits for natural completion. */
  transitionMode: TransitionMode;
  finalFrameBehavior: FinalFrameBehavior;
  ambientAfterCompletion: boolean;
  soundCueId: string;
  decisionPrompt: string;
}

/**
 * Defaults live here rather than inline in the player component, so a node
 * can override any of them (see VideoNode.decisionTiming) without the
 * timing constants being embedded in JourneyPlayer/ChoiceDrawer.
 */
export const DEFAULT_DECISION_TIMING: DecisionTiming = {
  decisionCueSeconds: 10,
  handleRevealSeconds: 7,
  drawerRevealSeconds: 5,
  transitionMode: "atVideoEnd",
  finalFrameBehavior: "hold",
  ambientAfterCompletion: true,
  soundCueId: "decision-approaching",
  decisionPrompt: "What do you follow next?",
};

export function getDecisionTiming(node: VideoNode): DecisionTiming {
  return { ...DEFAULT_DECISION_TIMING, ...node.decisionTiming };
}

export type RevealStage = "none" | "cue" | "handle" | "drawer";

export function getRevealStage(currentTime: number, duration: number, timing: DecisionTiming): RevealStage {
  const remaining = duration - currentTime;
  if (remaining <= timing.drawerRevealSeconds) return "drawer";
  if (remaining <= timing.handleRevealSeconds) return "handle";
  if (remaining <= timing.decisionCueSeconds) return "cue";
  return "none";
}
