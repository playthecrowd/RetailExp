import { getPathway, getNode } from "@/lib/kameleon/live-content";
import { Button } from "@/components/ui/Button";
import { CheckCircleIcon } from "@/components/kameleon/icons";
import type { ViewerProgress } from "@/lib/kameleon/pathway-model";
import { playKameleonSound } from "@/lib/kameleon/sound";

export function SelectedPathPreview({
  pathwayId,
  progress,
  onBegin,
  onChooseAnother,
}: {
  pathwayId: string;
  progress: ViewerProgress;
  onBegin: () => void;
  onChooseAnother: () => void;
}) {
  const pathway = getPathway(pathwayId);
  if (!pathway) return null;
  const root = getNode(pathway.rootNodeId);
  const chapterNumber = progress.history.length + 1;

  function handleBegin() {
    playKameleonSound("videoStart");
    onBegin();
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Full-bleed pathway photo — fills the entire screen behind every
          control below, never a separate rectangular hero element. */}
      {root?.posterSource && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={root.posterSource} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {/* Cinematic vignette: dark near the top (nav legibility), a lighter
          center so the environment stays visible, stronger darkening behind
          the description/CTA at the bottom, plus a subtle warm/red tint
          matching the Kameleon brand. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/15 to-black/85" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-kameleon-red/15 via-transparent to-transparent" aria-hidden="true" />

      <div className="relative z-10 flex flex-1 flex-col px-4">
        <div className="flex items-center justify-between pt-3">
          <button
            type="button"
            onClick={onChooseAnother}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-black/40 px-3 py-2 text-sm text-kameleon-text backdrop-blur-sm hover:text-kameleon-copper-light"
          >
            <span aria-hidden="true">←</span>
            Back to Pathways
          </button>
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-kameleon-text-muted">Kameleon</p>
            <p className="text-[11px] text-kameleon-text-muted">Chapter {chapterNumber} of your journey</p>
          </div>
          <span className="w-4" aria-hidden="true" />
        </div>

        <div className="mt-auto flex flex-col items-center gap-3 pb-6 pt-8 text-center">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
            {pathway.label}
          </h1>
          <p className="text-xs uppercase tracking-widest text-kameleon-text-muted drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
            {pathway.subtitle}
          </p>
          <p className="max-w-xs text-sm text-kameleon-text drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">{pathway.description}</p>
          <p className="text-xs uppercase tracking-widest text-kameleon-text-muted">
            Interactive Experience <span className="text-kameleon-red">•</span>{" "}
            {root ? Math.round(root.duration / 60) : 4} min{" "}
            <span className="text-kameleon-red">•</span> Headphones recommended
          </p>

          <div className="mt-3 flex w-full flex-col items-center gap-3">
            <Button brand="kameleon" size="lg" fullWidth onClick={handleBegin}>
              Begin {pathway.label}
            </Button>
            <button
              type="button"
              onClick={onChooseAnother}
              className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
            >
              Choose another path
            </button>
            <p className="flex items-center gap-1.5 text-xs text-kameleon-text-muted">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              Progress saved locally
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
