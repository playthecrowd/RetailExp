"use client";

import { useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { getNode, getPathway } from "@/lib/kameleon/live-content";
import { getDecisionTiming, getRevealStage, type RevealStage } from "@/lib/kameleon/decision-timing";
import type { ViewerProgress } from "@/lib/kameleon/pathway-model";
import { MockVideoPlayer } from "./MockVideoPlayer";
import { DecisionDrawer } from "./DecisionDrawer";
import { EnvironmentArt } from "./art/EnvironmentArt";
import { LoadingState } from "@/components/ui/states";
import { playKameleonSound } from "@/lib/kameleon/sound";
import { unlockKameleonReward } from "@/app/experience/kameleon/actions";

/**
 * Loaded on demand and never during SSR. It builds a WebGL context and touches
 * `window` on mount, and — more practically — three.js has no business in the
 * initial bundle of a journey whose chapters mostly have no 360 version.
 */
const Video360Viewer = nextDynamic(
  () => import("./Video360Viewer").then((m) => m.Video360Viewer),
  { ssr: false },
);

/**
 * The continuous player for screens 08+09 combined. Stays mounted for the
 * whole run of a pathway — moving between connected nodes never navigates
 * to a new screen; it only swaps which node is loaded internally. The
 * decision experience (Phase 3 second-review correction) is a timed reveal
 * — cue, handle, drawer — layered over the still-playing video, not a
 * post-completion full-screen takeover.
 */
export function JourneyPlayer({
  progress,
  onProgressUpdate,
  onTerminalComplete,
  onExit,
  onViewMap,
}: {
  progress: ViewerProgress;
  onProgressUpdate: (patch: Partial<ViewerProgress>) => void;
  onTerminalComplete: () => void;
  onExit: () => void;
  onViewMap: () => void;
}) {
  const startingNode = progress.currentNodeId ? getNode(progress.currentNodeId) : undefined;
  const startingTiming = startingNode ? getDecisionTiming(startingNode) : undefined;
  const startedAwaitingChoice = progress.playerStatus === "awaiting-choice";

  const [nodeId, setNodeId] = useState(progress.currentNodeId);
  const [playKey, setPlayKey] = useState(0);
  const [videoEnded, setVideoEnded] = useState(startedAwaitingChoice);
  const [pendingChoiceId, setPendingChoiceId] = useState<string | null>(null);
  const [revealStage, setRevealStage] = useState<RevealStage>(() => {
    if (startedAwaitingChoice) return "drawer";
    if (startingNode && startingTiming) {
      return getRevealStage(progress.currentNodeElapsedSeconds, startingNode.duration, startingTiming);
    }
    return "none";
  });
  const [transitioning, setTransitioning] = useState(false);
  const [viewing360, setViewing360] = useState(false);
  const lastPersistedSecondRef = useRef(-1);

  if (!nodeId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState brand="kameleon" message="Loading your journey…" />
      </div>
    );
  }

  const node = getNode(nodeId);
  if (!node) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState brand="kameleon" message="This chapter could not be found." />
      </div>
    );
  }

  const pathway = getPathway(node.pathwayId);
  const chapterNumber = progress.history.length + 1;
  const timing = getDecisionTiming(node);

  function handleProgress(currentTime: number) {
    if (!node) return;
    const second = Math.floor(currentTime);
    if (second % 5 === 0 && second !== lastPersistedSecondRef.current) {
      lastPersistedSecondRef.current = second;
      onProgressUpdate({ currentNodeElapsedSeconds: currentTime });
    }

    if (node.isTerminal) return;
    const nextStage = getRevealStage(currentTime, node.duration, timing);
    setRevealStage((prev) => {
      if (prev === nextStage) return prev;
      if (nextStage === "cue" && prev === "none") playKameleonSound("decisionApproaching");
      if (nextStage === "drawer" && prev !== "drawer") playKameleonSound("drawerOpen");
      return nextStage;
    });
  }

  function executeTransition(choiceId: string) {
    if (!node) return;
    const choice = node.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    unlockKameleonReward("perfect_pour_fountain").catch(console.error);

    const completedNodeIds = progress.completedNodeIds.includes(node.id)
      ? progress.completedNodeIds
      : [...progress.completedNodeIds, node.id];

    onProgressUpdate({
      completedNodeIds,
      history: [
        ...progress.history,
        {
          sourceNodeId: node.id,
          choiceId: choice.id,
          destinationNodeId: choice.destinationNodeId,
          selectedAt: new Date().toISOString(),
        },
      ],
      playerStatus: "playing",
      currentNodeId: choice.destinationNodeId,
      currentNodeElapsedSeconds: 0,
    });
    setTransitioning(true);
    window.setTimeout(() => {
      setNodeId(choice.destinationNodeId);
      setVideoEnded(false);
      setPendingChoiceId(null);
      setRevealStage("none");
      setTransitioning(false);
      playKameleonSound("videoStart");
    }, 900);
  }

  function handleVideoComplete() {
    if (!node) return;
    if (node.isTerminal) {
      const completedNodeIds = progress.completedNodeIds.includes(node.id)
        ? progress.completedNodeIds
        : [...progress.completedNodeIds, node.id];
      onProgressUpdate({
        completedNodeIds,
        playerStatus: "terminal-complete",
        currentNodeElapsedSeconds: node.duration,
      });
      // The atlanta_rooftop_gathering reward is qualified by
      // JourneyCompletion.tsx on mount instead of here, to avoid a race
      // between this fire-and-forget call and the completion screen
      // immediately needing to know whether to show the claim popup.
      playKameleonSound("journeyComplete");
      onTerminalComplete();
      return;
    }

    setVideoEnded(true);
    setRevealStage("drawer");
    onProgressUpdate({ playerStatus: "awaiting-choice", currentNodeElapsedSeconds: node.duration });

    if (pendingChoiceId) {
      executeTransition(pendingChoiceId);
    }
  }

  function handleReplay() {
    setPlayKey((k) => k + 1);
    setVideoEnded(false);
    setPendingChoiceId(null);
    setRevealStage("none");
    onProgressUpdate({ currentNodeElapsedSeconds: 0, playerStatus: "playing" });
  }

  function handleSelectChoice(choiceId: string) {
    playKameleonSound("choiceSelected");
    if (timing.transitionMode === "immediate" || videoEnded) {
      executeTransition(choiceId);
    } else {
      // Selected early — save immediately, but let the video reach its
      // natural end before transitioning (per the timed-decision spec).
      setPendingChoiceId(choiceId);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6">
      <div className="flex items-center justify-between">
        {progress.history.length === 0 ? (
          <button
            type="button"
            onClick={onExit}
            className="flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm text-kameleon-text-muted hover:text-kameleon-text"
          >
            <span aria-hidden="true">←</span>
            Back to Pathways
          </button>
        ) : (
          <button
            type="button"
            onClick={onViewMap}
            aria-label="Back to path map"
            className="flex min-h-11 min-w-11 items-center justify-center text-kameleon-text-muted hover:text-kameleon-text"
          >
            ←
          </button>
        )}
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-kameleon-copper-light">{pathway?.label ?? node.title}</p>
          <p className="text-[11px] text-kameleon-text-muted">
            Chapter {chapterNumber} · {node.title}
          </p>
        </div>
        <span className="w-4" aria-hidden="true" />
      </div>

      <div className="relative">
        {transitioning ? (
          <div className="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-kameleon-surface">
            <LoadingState brand="kameleon" message="Loading connected video…" />
          </div>
        ) : (
          <>
            <MockVideoPlayer
              key={`${nodeId}-${playKey}`}
              title={node.title}
              durationSeconds={node.duration}
              posterLabel={`${node.title} — placeholder`}
              captionText={node.description}
              video360Src={node.video360Source || undefined}
              onOpen360={() => setViewing360(true)}
              completionThreshold={1}
              initialTime={startedAwaitingChoice && playKey === 0 ? node.duration : progress.currentNodeElapsedSeconds}
              startPaused={startedAwaitingChoice && playKey === 0}
              onComplete={handleVideoComplete}
              onProgress={handleProgress}
              background={
                pathway && (
                  <EnvironmentArt motif={pathway.motif} photoSrc={node.posterSource} className="h-full w-full" priority />
                )
              }
              src={node.videoSource}
              posterSrc={node.posterSource}
              captionsSrc={node.captionsSource}
            />

            {/* Opened over the chapter, closed back to it. Chapter and
                pathway state are untouched because this is an overlay in the
                same component, not a route — leaving 360 cannot lose progress
                because nothing about the journey moved while it was open. */}
            {viewing360 && node.video360Source && (
              <Video360Viewer
                src={node.video360Source}
                poster={node.posterSource}
                title={node.title}
                startTime={progress.currentNodeElapsedSeconds}
                onExit={(currentTime) => {
                  // The 360 view's position becomes the chapter's position, so
                  // returning resumes where the visitor actually got to rather
                  // than where they left the standard player.
                  handleProgress(currentTime);
                  setViewing360(false);
                }}
              />
            )}

            {!node.isTerminal && (
              <DecisionDrawer
                stage={revealStage}
                completedNode={node}
                chapterNumber={chapterNumber}
                prompt={timing.decisionPrompt}
                selectedChoiceId={pendingChoiceId}
                onSelectChoice={handleSelectChoice}
                onReplay={handleReplay}
                onViewMap={onViewMap}
                onExit={onExit}
              />
            )}
          </>
        )}
      </div>

      {revealStage === "none" && (
        <button
          type="button"
          onClick={onExit}
          className="text-center text-xs text-kameleon-text-muted underline-offset-4 hover:underline"
        >
          Exit experience
        </button>
      )}
    </div>
  );
}
