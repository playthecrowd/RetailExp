"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useKameleonSession } from "@/lib/kameleon/useKameleonSession";
import { disposeKameleonSound, handleKameleonVisibilityChange } from "@/lib/kameleon/sound";
import { loadKameleonContent } from "@/lib/kameleon/live-content";
import { unlockKameleonReward } from "@/app/experience/kameleon/actions";
import { LoadingState, ErrorState } from "@/components/ui/states";
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
import { ExperienceChoice } from "@/components/kameleon/screens/ExperienceChoice";
import { TestimonialCapture } from "@/components/kameleon/testimonials/TestimonialCapture";
import { isCaptureAvailableAction } from "@/app/experience/kameleon/testimonial-actions";

/**
 * The embedded Snap Camera Kit AR experience must never run during SSR (it
 * touches `navigator.mediaDevices`/`window`/WebGL at module-evaluation-
 * adjacent points) — `ssr: false` guarantees it's only ever loaded and
 * mounted in the browser. See docs/RETAILEXP_PHASE_TRACKER.md's Phase 5B
 * record. This replaced the earlier WebXR/Three.js `KameleonARExperience`
 * as the production AR pathway on both iPhone and Android — that
 * component still exists (kept intact, not deleted, in case it's ever
 * needed again) but is no longer mounted anywhere in the production
 * journey.
 */
const KameleonCameraKitExperience = dynamic(
  () =>
    import("@/components/kameleon/ar/KameleonCameraKitExperience").then(
      (m) => m.KameleonCameraKitExperience,
    ),
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
  const [contentLoaded, setContentLoaded] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Server-evaluated feature gate. Defaults FALSE and stays false unless the
  // server says otherwise, so a failed lookup degrades to "coming soon" rather
  // than offering a flow whose actions would reject anyway. Hiding is never
  // the control - every testimonial action re-checks the gate server-side.
  const [captureAvailable, setCaptureAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    isCaptureAvailableAction()
      .then((enabled) => {
        if (active) setCaptureAvailable(enabled);
      })
      .catch(() => {
        if (active) setCaptureAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.addEventListener("visibilitychange", handleKameleonVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleKameleonVisibilityChange);
      disposeKameleonSound();
    };
  }, []);

  useEffect(() => {
    loadKameleonContent()
      .then(() => setContentLoaded(true))
      .catch((error) => setContentError(error instanceof Error ? error.message : String(error)));
  }, []);

  if (contentError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ErrorState
          brand="kameleon"
          title="Couldn't load Kameleon"
          message={contentError}
          retryLabel="Retry"
          onRetry={() => {
            setContentError(null);
            loadKameleonContent()
              .then(() => setContentLoaded(true))
              .catch((error) => setContentError(error instanceof Error ? error.message : String(error)));
          }}
        />
      </div>
    );
  }

  if (!state.hydrated || !contentLoaded) {
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
            onContinue={() => dispatch({ type: "CONTINUE_TO_ACCOUNT" })}
          />
        );

      case "experience-choice":
        return (
          <ExperienceChoice
            justSubmittedTestimonial={state.justSubmittedTestimonial}
            captureAvailable={captureAvailable}
            onChooseAr={() => dispatch({ type: "CHOOSE_AR" })}
            onChooseTestimonial={() => dispatch({ type: "CHOOSE_TESTIMONIAL" })}
            onContinueToJourney={() => dispatch({ type: "CONTINUE_TO_JOURNEY" })}
          />
        );

      case "testimonial-capture":
        return (
          // TESTIMONIAL_SUBMITTED fires only from the success screen's
          // "Continue Experience" button — never as a side effect of
          // submitting — and returns to the experience choice, where the
          // banner appears and AR is still one press away. It awards no AR
          // reward and leaves journey progress untouched.
          <TestimonialCapture
            onCancel={() => dispatch({ type: "CANCEL_TESTIMONIAL" })}
            onContinueExperience={() => dispatch({ type: "TESTIMONIAL_SUBMITTED" })}
          />
        );

      case "ar-permission":
        // Hosts the entire embedded Snap Camera Kit AR flow, including its
        // own internal capability check and unsupported-device fallback —
        // see components/kameleon/ar/KameleonCameraKitExperience.tsx.
        return (
          <KameleonCameraKitExperience
            onEnterJourney={() => {
              unlockKameleonReward("ruby_portal").catch(console.error);
              dispatch({ type: "ENTER_JOURNEY" });
            }}
            onSkipAr={() => {
              unlockKameleonReward("ruby_portal").catch(console.error);
              dispatch({ type: "CONTINUE_WITHOUT_AR_FALLBACK" });
            }}
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
