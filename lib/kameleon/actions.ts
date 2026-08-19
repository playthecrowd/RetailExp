import type { OpeningGateState } from "./types";
import type { ViewerProgress } from "./pathway-model";

export type KameleonAction =
  | { type: "HYDRATE"; openingGate: OpeningGateState; progress: ViewerProgress }
  | { type: "BEGIN" }
  | { type: "COMMERCIAL_COMPLETE" }
  /** Commercial's "Start Your Journey" button — leads to Quick Account (Phase 7: account creation now precedes AR). */
  | { type: "CONTINUE_TO_ACCOUNT" }
  /** AR placed (or the user chose to move on) — see KameleonARExperience's onEnterJourney. */
  | { type: "ENTER_JOURNEY" }
  /** AR skipped, exited mid-session, or unsupported and dismissed — see onSkipAr. Both this and ENTER_JOURNEY land on the same screen today; kept distinct for the Phase 5 analytics plan (AR completed vs. continued without AR). */
  | { type: "CONTINUE_WITHOUT_AR_FALLBACK" }
  // Phase 4B. CHOOSE_AR is the only route into the untouched AR screen.
  | { type: "CHOOSE_AR" }
  | { type: "CHOOSE_TESTIMONIAL" }
  | { type: "CANCEL_TESTIMONIAL" }
  // Sets testimonialSubmitted only. Never arCompleted, never an AR reward.
  | { type: "TESTIMONIAL_SUBMITTED" }
  /**
   * The explicit skip: go to the Journey without doing AR or capture.
   *
   * Deliberately NOT ENTER_JOURNEY, which sets arCompleted - that action means
   * "AR is finished with", and reusing it here would record AR completion for
   * somebody who declined AR. This one changes no gate flag at all: it reuses
   * the SCREEN transition and nothing else.
   */
  | { type: "CONTINUE_TO_JOURNEY" }
  | { type: "COMPLETE_ACCOUNT" }
  | { type: "RESUME_SAVED_JOURNEY" }
  | { type: "START_NEW_JOURNEY" }
  | { type: "SELECT_ENTRY_PATHWAY"; pathwayId: string }
  | { type: "BEGIN_NODE" }
  | { type: "CHOOSE_ANOTHER_PATH" }
  | { type: "PLAYER_PROGRESS_UPDATE"; patch: Partial<ViewerProgress> }
  | { type: "VIEW_PATH_MAP" }
  | { type: "BACK_TO_PATHS" }
  | { type: "RESUME_FROM_MAP" }
  | { type: "REPLAY_JOURNEY" }
  | { type: "EXPLORE_DIFFERENT_PATH" }
  | { type: "VIEW_COMPLETION" }
  | { type: "RESTART_EXPERIENCE" };
