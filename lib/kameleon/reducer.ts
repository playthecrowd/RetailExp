import { createInitialProgress } from "./pathway-model";
import { getPathway } from "@/lib/kameleon/live-content";
import { createInitialOpeningGate, type KameleonSessionState } from "./types";
import type { KameleonAction } from "./actions";

function nowIso() {
  return new Date().toISOString();
}

export function createInitialSessionState(): KameleonSessionState {
  return {
    ...createInitialOpeningGate(),
    screen: "tap-to-begin",
    hydrated: false,
    progress: createInitialProgress(),
    activeNodeId: null,
    activePathwayId: null,
  };
}

/** Where to land once the required opening sequence (commercial + AR + account) is done. */
function postOpeningScreen(state: KameleonSessionState): KameleonSessionState["screen"] {
  if (state.enteredJourneyThisSession) {
    if (state.progress.playerStatus === "terminal-complete") return "journey-complete";
    if (state.progress.currentNodeId) return "journey-player";
    return "choose-path";
  }
  if (state.progress.history.length > 0 && state.progress.playerStatus !== "not-started") {
    return "resume-choice";
  }
  return "choose-path";
}

export function kameleonReducer(
  state: KameleonSessionState,
  action: KameleonAction,
): KameleonSessionState {
  switch (action.type) {
    case "HYDRATE": {
      const next: KameleonSessionState = {
        ...state,
        ...action.openingGate,
        progress: action.progress,
        hydrated: true,
      };
      let screen: KameleonSessionState["screen"] = "tap-to-begin";
      if (next.commercialCompleted && next.authed) {
        screen = postOpeningScreen(next);
      } else if (next.commercialCompleted) {
        screen = "ar-permission";
      }
      return { ...next, screen };
    }

    case "BEGIN":
      return { ...state, screen: "commercial" };

    case "COMMERCIAL_COMPLETE":
      return { ...state, commercialCompleted: true };

    case "CONTINUE_TO_AR":
      if (!state.commercialCompleted) return state;
      return { ...state, screen: "ar-permission" };

    case "ENTER_JOURNEY":
    case "CONTINUE_WITHOUT_AR_FALLBACK":
      return { ...state, screen: "quick-account" };

    case "COMPLETE_ACCOUNT": {
      const authedState = { ...state, authed: true };
      return { ...authedState, screen: postOpeningScreen(authedState) };
    }

    case "RESUME_SAVED_JOURNEY": {
      const entered = { ...state, enteredJourneyThisSession: true };
      return { ...entered, screen: postOpeningScreen(entered) };
    }

    case "START_NEW_JOURNEY":
      return {
        ...state,
        enteredJourneyThisSession: true,
        activeNodeId: null,
        progress: createInitialProgress(),
        screen: "choose-path",
      };

    case "SELECT_ENTRY_PATHWAY": {
      const pathway = getPathway(action.pathwayId);
      if (!pathway) return state;
      return {
        ...state,
        enteredJourneyThisSession: true,
        activeNodeId: pathway.rootNodeId,
        activePathwayId: pathway.id,
        screen: "selected-path-preview",
      };
    }

    case "BEGIN_NODE": {
      // Reached only from selected-path-preview, always at a pathway's root
      // — always a fresh start of that pathway's tree.
      if (!state.activeNodeId || !state.activePathwayId) return state;
      return {
        ...state,
        screen: "journey-player",
        progress: {
          ...createInitialProgress(),
          pathwayId: state.activePathwayId,
          currentNodeId: state.activeNodeId,
          playerStatus: "playing",
        },
      };
    }

    case "CHOOSE_ANOTHER_PATH":
      return { ...state, activeNodeId: null, activePathwayId: null, screen: "choose-path" };

    case "PLAYER_PROGRESS_UPDATE":
      return {
        ...state,
        progress: { ...state.progress, ...action.patch, lastUpdatedIso: nowIso() },
      };

    case "VIEW_PATH_MAP":
      return { ...state, screen: "story-map" };

    case "BACK_TO_PATHS":
      return { ...state, screen: "choose-path" };

    case "RESUME_FROM_MAP":
      if (!state.progress.currentNodeId) return { ...state, screen: "choose-path" };
      return { ...state, screen: "journey-player" };

    case "REPLAY_JOURNEY":
    case "EXPLORE_DIFFERENT_PATH":
      return {
        ...state,
        activeNodeId: null,
        activePathwayId: null,
        progress: createInitialProgress(),
        screen: "choose-path",
      };

    case "VIEW_COMPLETION":
      return { ...state, screen: "journey-complete" };

    case "RESTART_EXPERIENCE":
      return createInitialSessionState();

    default:
      return state;
  }
}
