"use client";

import { useEffect, useReducer } from "react";
import { createInitialSessionState, kameleonReducer } from "./reducer";
import { loadOpeningGate, loadProgress, saveOpeningGate, saveProgress } from "./storage";
import type { KameleonAction } from "./actions";
import type { KameleonSessionState } from "./types";

export function useKameleonSession(): [KameleonSessionState, React.Dispatch<KameleonAction>] {
  const [state, dispatch] = useReducer(kameleonReducer, undefined, createInitialSessionState);

  // Hydrate from session/local storage once, after mount, to avoid SSR/CSR
  // mismatches. Malformed data is already normalized to safe defaults by
  // loadOpeningGate()/loadProgress() (see lib/kameleon/storage.ts).
  useEffect(() => {
    dispatch({ type: "HYDRATE", openingGate: loadOpeningGate(), progress: loadProgress() });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    saveOpeningGate({
      commercialCompleted: state.commercialCompleted,
      arAvailable: state.arAvailable,
      authed: state.authed,
      arCompleted: state.arCompleted,
      enteredJourneyThisSession: state.enteredJourneyThisSession,
    });
  }, [
    state.hydrated,
    state.commercialCompleted,
    state.arAvailable,
    state.authed,
    state.arCompleted,
    state.enteredJourneyThisSession,
  ]);

  useEffect(() => {
    if (!state.hydrated) return;
    saveProgress(state.progress);
  }, [state.hydrated, state.progress]);

  return [state, dispatch];
}
