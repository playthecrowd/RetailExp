import type { ViewerProgress } from "./pathway-model";

/**
 * The Kameleon mobile experience is one continuous client-side flow (not
 * separate routes) — these screens map onto the 18 "Kameleon Mobile States"
 * from the master spec, corrected per the 2026-08-03 Phase 3 reviews:
 *
 * - "End-of-Video Decision" is no longer a screen — it's the ChoiceOverlay
 *   rendered inside `journey-player`, which stays mounted across connected
 *   nodes (see docs/RETAILEXP_PHASE_TRACKER.md Phase 3 correction record).
 * - "Loading Next Chapter" is a brief internal sub-state of `journey-player`,
 *   not a separate screen.
 * - "Ground Scanning" / "Portal Placement" / a separate "AR Intro" screen /
 *   "AR Unsupported" are all REMOVED as distinct top-level screens as of
 *   Phase 5: `ar-permission` now hosts the entire real WebXR ground-plane AR
 *   experience (`components/kameleon/ar/KameleonARExperience.tsx`), which
 *   owns its own internal phase state machine (capability check → start
 *   screen → scanning → surface found → placed → tracking lost / error /
 *   unsupported) rather than each phase being a separate top-level `screen`.
 *   See `docs/RETAILEXP_PHASE_TRACKER.md`'s Phase 5 record.
 * - "AR Tracking Lost" and the unsupported-device fallback are both internal
 *   phases of that one component now, not separate top-level screens.
 * - "Replay" and "Explore Another Path" remain actions, not screens.
 * - "Resume Saved Journey vs. Start a New Journey" is a new screen
 *   (`resume-choice`) required by the corrected commercial-opening rules.
 */
export type KameleonScreen =
  | "tap-to-begin"
  | "commercial"
  // Phase 4B: a choice between the AR experience and sharing a testimonial.
  // Inserted BEFORE ar-permission so the AR screen, its component, callbacks,
  // rewards and fallback behaviour are all untouched.
  | "experience-choice"
  | "ar-permission"
  | "testimonial-capture"
  | "quick-account"
  | "resume-choice"
  | "choose-path"
  | "selected-path-preview"
  | "journey-player"
  | "story-map"
  | "journey-complete";

/**
 * Opening-gate state (has the commercial/AR intro been completed, is the
 * viewer "signed in") is session-scoped — it lives in sessionStorage and is
 * never allowed to let old saved story progress skip the commercial. Story
 * progress itself (SavedProgress) is the only thing kept in localStorage.
 */
export interface OpeningGateState {
  commercialCompleted: boolean;
  arAvailable: boolean;
  authed: boolean;
  /**
   * True once AR has been completed or explicitly skipped (Phase 7:
   * account creation now happens before AR, so `authed` alone no longer
   * implies AR is done — HYDRATE needs its own flag to resume correctly).
   */
  arCompleted: boolean;
  /**
   * True once a testimonial has been successfully submitted this session.
   *
   * Deliberately SEPARATE from arCompleted. Sharing a story is not doing AR:
   * it must not set the AR flag and must not award any AR reward. Either flag
   * opens the journey, but they are never conflated.
   */
  testimonialSubmitted: boolean;
  /** True once the viewer has passed the resume-choice gate this session. */
  enteredJourneyThisSession: boolean;
}

export function createInitialOpeningGate(): OpeningGateState {
  return {
    commercialCompleted: false,
    arAvailable: true,
    authed: false,
    arCompleted: false,
    testimonialSubmitted: false,
    enteredJourneyThisSession: false,
  };
}

export interface KameleonSessionState extends OpeningGateState {
  screen: KameleonScreen;
  hydrated: boolean;
  /**
   * A testimonial was submitted moments ago and the visitor has just been
   * returned to the experience choice.
   *
   * ONE-TIME, and session-only. Deliberately NOT part of OpeningGateState, so
   * saveOpeningGate() never writes it to sessionStorage: it is a message about
   * what just happened, not a fact about the session, and a banner that
   * survived a reload would be lying about "just".
   */
  justSubmittedTestimonial: boolean;
  progress: ViewerProgress;
  /** Node/pathway being previewed (choose-path -> selected-path-preview), before committed to progress.currentNodeId. */
  activeNodeId: string | null;
  activePathwayId: string | null;
}
