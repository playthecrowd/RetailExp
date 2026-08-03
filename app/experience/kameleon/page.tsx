"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useKameleonSession } from "@/lib/kameleon/useKameleonSession";
import { disposeKameleonSound, handleKameleonVisibilityChange } from "@/lib/kameleon/sound";
import { LoadingState } from "@/components/ui/states";
import { RestartExperience } from "@/components/kameleon/RestartExperience";
import { SoundToggle } from "@/components/kameleon/SoundToggle";

import { TapToBegin } from "@/components/kameleon/screens/TapToBegin";
import { CommercialVideo } from "@/components/kameleon/screens/CommercialVideo";
import { QuickAccount } from "@/components/kameleon/screens/QuickAccount";
import { ResumeChoice } from "@/components/kameleon/screens/ResumeChoice";
import { ChooseFirstPath } from "@/components/kameleon/screens/ChooseFirstPath";
import { SelectedPathPreview } from "@/components/kameleon/screens/SelectedPathPreview";
import { JourneyPlayer } from "@/components/kameleon/JourneyPlayer";
import { StoryPathMap } from "@/components/kameleon/screens/StoryPathMap";
import { JourneyCompletion } from "@/components/kameleon/screens/JourneyCompletion";

/**
 * The real WebXR/Three.js AR experience must never run during SSR (it
 * touches `window`/`navigator.xr`/WebGL at module-evaluation-adjacent
 * points) — `ssr: false` guarantees it's only ever loaded and mounted in
 * the browser. See docs/RETAILEXP_PHASE_TRACKER.md's Phase 5 record.
 */
const KameleonARExperience = dynamic(
  () => import("@/components/kameleon/ar/KameleonARExperience").then((m) => m.KameleonARExperience),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState brand="kameleon" message="Loading AR…" />
      </div>
    ),
  },
);

export default function KameleonExperiencePage() {
  const [state, dispatch] = useKameleonSession();

  useEffect(() => {
    document.addEventListener("visibilitychange", handleKameleonVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleKameleonVisibilityChange);
      disposeKameleonSound();
    };
  }, []);

  if (!state.hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState brand="kameleon" message="Loading Kameleon…" />
      </div>
    );
  }

  return (
    <>
      {renderScreen()}
      <div className="flex items-center justify-center gap-4 pb-3 pt-1">
        <SoundToggle />
        <RestartExperience onConfirm={() => dispatch({ type: "RESTART_EXPERIENCE" })} />
      </div>
    </>
  );

  function renderScreen() {
    switch (state.screen) {
      case "tap-to-begin":
        return <TapToBegin onBegin={() => dispatch({ type: "BEGIN" })} />;

      case "commercial":
        return (
          <CommercialVideo
            completed={state.commercialCompleted}
            onComplete={() => dispatch({ type: "COMMERCIAL_COMPLETE" })}
            onContinue={() => dispatch({ type: "CONTINUE_TO_AR" })}
          />
        );

      case "ar-permission":
        // Hosts the entire real WebXR ground-plane AR flow, including its
        // own internal unsupported-device fallback — see
        // components/kameleon/ar/KameleonARExperience.tsx.
        return (
          <KameleonARExperience
            onEnterJourney={() => dispatch({ type: "ENTER_JOURNEY" })}
            onSkipAr={() => dispatch({ type: "CONTINUE_WITHOUT_AR_FALLBACK" })}
          />
        );

      case "quick-account":
        return <QuickAccount onComplete={() => dispatch({ type: "COMPLETE_ACCOUNT" })} />;

      case "resume-choice":
        return (
          <ResumeChoice
            progress={state.progress}
            onResume={() => dispatch({ type: "RESUME_SAVED_JOURNEY" })}
            onStartNew={() => dispatch({ type: "START_NEW_JOURNEY" })}
          />
        );

      case "choose-path":
        return (
          <ChooseFirstPath
            onSelect={(pathwayId) => dispatch({ type: "SELECT_ENTRY_PATHWAY", pathwayId })}
            onViewMap={() => dispatch({ type: "VIEW_PATH_MAP" })}
          />
        );

      case "selected-path-preview":
        if (!state.activePathwayId) return null;
        return (
          <SelectedPathPreview
            pathwayId={state.activePathwayId}
            progress={state.progress}
            onBegin={() => dispatch({ type: "BEGIN_NODE" })}
            onChooseAnother={() => dispatch({ type: "CHOOSE_ANOTHER_PATH" })}
          />
        );

      case "journey-player":
        return (
          <JourneyPlayer
            progress={state.progress}
            onProgressUpdate={(patch) => dispatch({ type: "PLAYER_PROGRESS_UPDATE", patch })}
            onTerminalComplete={() => dispatch({ type: "VIEW_COMPLETION" })}
            onExit={() => dispatch({ type: "BACK_TO_PATHS" })}
            onViewMap={() => dispatch({ type: "VIEW_PATH_MAP" })}
          />
        );

      case "story-map":
        return (
          <StoryPathMap
            progress={state.progress}
            onBack={() => dispatch({ type: "BACK_TO_PATHS" })}
            onResume={() => dispatch({ type: "RESUME_FROM_MAP" })}
            onExploreAnother={() => dispatch({ type: "EXPLORE_DIFFERENT_PATH" })}
            onViewCompletion={() => dispatch({ type: "VIEW_COMPLETION" })}
          />
        );

      case "journey-complete":
        return (
          <JourneyCompletion
            progress={state.progress}
            onExploreAnother={() => dispatch({ type: "EXPLORE_DIFFERENT_PATH" })}
            onReplay={() => dispatch({ type: "REPLAY_JOURNEY" })}
          />
        );

      default:
        return null;
    }
  }
}
