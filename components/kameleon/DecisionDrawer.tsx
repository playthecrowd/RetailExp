import type { VideoNode } from "@/lib/kameleon/pathway-model";
import type { RevealStage } from "@/lib/kameleon/decision-timing";
import { getNode } from "@/lib/mock-data/kameleon-pathways";
import { getNodeMotif } from "@/lib/kameleon/production-assets";
import { EnvironmentArt } from "./art/EnvironmentArt";
import { CheckCircleIcon, ReplayIcon } from "./icons";
import { cn } from "@/lib/cn";

/**
 * The timed decision experience (Phase 3 second-review correction): a
 * subtle cue, then a bottom handle, then a drawer that rises over the
 * still-playing video — never a full-screen takeover, and never a
 * navigation to a separate page. Screen 09's approved two-choice visual
 * language is preserved inside the drawer's resting state.
 */
export function DecisionDrawer({
  stage,
  completedNode,
  chapterNumber,
  prompt,
  selectedChoiceId,
  onSelectChoice,
  onReplay,
  onViewMap,
  onExit,
}: {
  stage: RevealStage;
  completedNode: VideoNode;
  chapterNumber: number;
  prompt: string;
  selectedChoiceId: string | null;
  onSelectChoice: (choiceId: string) => void;
  onReplay: () => void;
  onViewMap: () => void;
  onExit: () => void;
}) {
  if (stage === "none") return null;

  return (
    <>
      {stage === "cue" && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-[10px] uppercase tracking-widest text-kameleon-copper-light backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-kameleon-copper" aria-hidden="true" />
          A decision is approaching
        </div>
      )}

      {(stage === "handle" || stage === "drawer") && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t border-kameleon-copper/40 bg-gradient-to-t from-black via-black/90 to-black/60 transition-transform duration-500 ease-out",
            stage === "drawer" ? "translate-y-0" : "translate-y-[calc(100%-14px)]",
          )}
          role={stage === "drawer" ? "dialog" : undefined}
          aria-modal={stage === "drawer" ? true : undefined}
          aria-label={stage === "drawer" ? "Choose what happens next" : undefined}
        >
          <div className="flex justify-center pt-2" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-kameleon-copper/60" />
          </div>

          <div className="flex flex-col gap-4 px-4 pb-5 pt-3">
            <div className="flex flex-col items-center gap-1 text-center">
              <CheckCircleIcon className="h-5 w-5 text-kameleon-copper-light" />
              <p className="text-[11px] uppercase tracking-widest text-kameleon-text-muted">
                {completedNode.title} · Chapter {chapterNumber}
              </p>
              <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
                {prompt}
              </h2>
            </div>

            <div className="flex flex-col gap-2.5">
              {completedNode.choices.map((choice) => {
                const selected = choice.id === selectedChoiceId;
                const destinationNode = getNode(choice.destinationNodeId);
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => onSelectChoice(choice.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-w-0 gap-3 overflow-hidden rounded-xl border-2 bg-kameleon-surface/90 text-left transition-colors",
                      choice.position === "left"
                        ? "border-kameleon-red/60 hover:border-kameleon-red"
                        : "border-kameleon-blue/60 hover:border-kameleon-blue",
                      selected && "ring-2 ring-kameleon-copper-light",
                    )}
                  >
                    {destinationNode && (
                      <EnvironmentArt
                        motif={getNodeMotif(destinationNode)}
                        className="aspect-[3/2] w-24 shrink-0"
                        gradientOverlay={false}
                        thumbnailKind="decision"
                      />
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5 py-3 pr-3">
                      <span className="font-display text-base font-semibold uppercase tracking-wide text-kameleon-text">
                        {choice.label}
                      </span>
                      <span className="text-xs text-kameleon-text-muted">{choice.description}</span>
                      {destinationNode && (
                        <span className="mt-0.5 text-[10px] uppercase tracking-widest text-kameleon-copper-light">
                          {destinationNode.title}
                        </span>
                      )}
                      {selected && <span className="text-[10px] uppercase tracking-widest text-kameleon-copper-light">Selected</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <button
                type="button"
                onClick={onReplay}
                className="flex flex-col items-center gap-1 rounded-md border border-kameleon-border py-2 text-kameleon-text-muted hover:text-kameleon-text"
              >
                <ReplayIcon className="h-3.5 w-3.5" />
                Replay
              </button>
              <button
                type="button"
                onClick={onViewMap}
                className="rounded-md border border-kameleon-border py-2 text-kameleon-text-muted hover:text-kameleon-text"
              >
                View Path
              </button>
              <button
                type="button"
                onClick={onExit}
                className="rounded-md border border-kameleon-border py-2 text-kameleon-text-muted hover:text-kameleon-text"
              >
                Exit Journey
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
