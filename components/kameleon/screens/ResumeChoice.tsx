import { Button } from "@/components/ui/Button";
import { getPathway } from "@/lib/mock-data/kameleon-pathways";
import type { ViewerProgress } from "@/lib/kameleon/pathway-model";

/**
 * Shown once per session, after the required commercial + AR + account
 * opening is complete, only when saved story progress already exists
 * (Phase 3 correction — required commercial-opening behavior).
 */
export function ResumeChoice({
  progress,
  onResume,
  onStartNew,
}: {
  progress: ViewerProgress;
  onResume: () => void;
  onStartNew: () => void;
}) {
  const pathway = progress.pathwayId ? getPathway(progress.pathwayId) : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-8 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
          Welcome back
        </h1>
        <p className="mt-2 max-w-xs text-sm text-kameleon-text-muted">
          {pathway
            ? `You have a saved journey in progress on ${pathway.label} (${progress.history.length} chapter${progress.history.length === 1 ? "" : "s"} in).`
            : "You have saved story progress from a previous visit."}
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button brand="kameleon" size="lg" fullWidth onClick={onResume}>
          Resume saved journey
        </Button>
        <Button brand="kameleon" variant="secondary" size="lg" fullWidth onClick={onStartNew}>
          Start a new journey
        </Button>
      </div>
    </div>
  );
}
