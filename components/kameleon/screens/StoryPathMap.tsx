import { Button } from "@/components/ui/Button";
import { CheckCircleIcon, LockIcon } from "@/components/kameleon/icons";
import { getNodeStatus, type NodeMapStatus } from "@/lib/kameleon/path-map";
import { getChildren } from "@/lib/kameleon/tree-layout";
import { getPathway, getNode } from "@/lib/mock-data/kameleon-pathways";
import type { ViewerProgress, VideoNode } from "@/lib/kameleon/pathway-model";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";
import { getNodeMotif } from "@/lib/kameleon/production-assets";
import { cn } from "@/lib/cn";

const statusCardStyles: Record<NodeMapStatus, string> = {
  complete: "border-kameleon-copper/60",
  current: "border-kameleon-red",
  available: "border-kameleon-blue",
  locked: "border-kameleon-border opacity-50",
};

/**
 * Rebuilt as a vertically-indented recursive tree (second Phase 3 review):
 * every row is at most two cards wide (a node's own two children, nested
 * under it), so the map never needs a horizontally-scrolling container —
 * depth grows downward, not sideways. min-w-0 is set on every grid/flex
 * child to guarantee text truncates instead of forcing overflow.
 */
function NodeCard({
  node,
  status,
}: {
  node: VideoNode;
  status: NodeMapStatus;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-lg border-2 bg-kameleon-surface", statusCardStyles[status])}>
      <EnvironmentArt motif={getNodeMotif(node)} className="h-10 w-full" />
      <div className="flex min-w-0 items-center justify-between gap-1 p-2">
        <p className="min-w-0 truncate font-display text-xs font-semibold uppercase tracking-wide text-kameleon-text">
          {node.title}
        </p>
        {status === "complete" && <CheckCircleIcon className="h-4 w-4 shrink-0 text-kameleon-copper-light" />}
        {status === "current" && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-kameleon-red" aria-label="Current" />}
        {status === "available" && (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-kameleon-blue" aria-label="Available" />
        )}
        {status === "locked" && <LockIcon className="h-3.5 w-3.5 shrink-0 text-kameleon-text-muted" />}
      </div>
    </div>
  );
}

function TreeBranch({
  node,
  progress,
  depth = 0,
}: {
  node: VideoNode;
  progress: ViewerProgress;
  depth?: number;
}) {
  const status = getNodeStatus(node, progress);
  const children = getChildren(node);

  // Only the first branch point splits into two columns — nesting grid-cols-2
  // at every level would halve the available width at each depth and
  // eventually collapse cards to a few px wide on narrow viewports. Deeper
  // levels stack single-column (still indented) so width never compounds.
  const useTwoColumns = depth === 0 && children.length > 1;

  return (
    <div className="min-w-0">
      <NodeCard node={node} status={status} />
      {children.length > 0 && (
        <div
          className={cn(
            "mt-2 grid min-w-0 gap-2 border-l-2 border-kameleon-copper/30 pl-3",
            useTwoColumns ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {children.map((child) => (
            <TreeBranch key={child.id} node={child} progress={progress} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function flattenTree(node: VideoNode): VideoNode[] {
  return [node, ...getChildren(node).flatMap(flattenTree)];
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export function StoryPathMap({
  progress,
  onBack,
  onResume,
  onExploreAnother,
  onViewCompletion,
}: {
  progress: ViewerProgress;
  onBack: () => void;
  onResume: () => void;
  onExploreAnother: () => void;
  onViewCompletion: () => void;
}) {
  const pathway = progress.pathwayId ? getPathway(progress.pathwayId) : undefined;

  if (!pathway) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-kameleon-text-muted">
        No active journey yet — choose a path to start your map.
      </div>
    );
  }

  const root = getNode(pathway.rootNodeId);
  if (!root) return null;
  const allNodes = flattenTree(root);
  const discovered = allNodes.filter((n) => getNodeStatus(n, progress) !== "locked").length;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm text-kameleon-text-muted hover:text-kameleon-text"
        >
          <span aria-hidden="true">←</span>
          Back to Pathways
        </button>
        <p className="text-sm font-semibold uppercase tracking-widest text-kameleon-text">Kameleon</p>
        <span className="w-4" aria-hidden="true" />
      </div>

      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
          Your journey
        </h1>
        <p className="mt-1 text-sm text-kameleon-text-muted">Every choice reveals a different side of the night.</p>
      </div>

      <nav aria-label="Jump to section" className="flex justify-center gap-4 text-xs">
        <button type="button" onClick={() => scrollToSection("journey-your-path")} className="text-kameleon-copper-light underline-offset-4 hover:underline">
          Your Path
        </button>
        <button type="button" onClick={() => scrollToSection("journey-actions")} className="text-kameleon-copper-light underline-offset-4 hover:underline">
          Continue
        </button>
      </nav>

      <div id="journey-your-path" className="min-w-0 scroll-mt-4">
        <TreeBranch node={root} progress={progress} />
      </div>

      <p className="text-center text-xs text-kameleon-text-muted">
        {discovered} of {allNodes.length} nodes discovered
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-kameleon-text-muted">
        <span className="flex items-center gap-1">
          <CheckCircleIcon className="h-3.5 w-3.5" /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-kameleon-red" /> Current
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-kameleon-blue" /> Available
        </span>
        <span className="flex items-center gap-1">
          <LockIcon className="h-3.5 w-3.5" /> Locked
        </span>
      </div>

      {/* Accessible text alternative to the visual tree. */}
      <details className="text-xs text-kameleon-text-muted">
        <summary className="cursor-pointer text-kameleon-copper-light">Text summary of your journey</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {allNodes.map((node) => (
            <li key={node.id}>
              {node.title} — {getNodeStatus(node, progress)}
            </li>
          ))}
        </ol>
      </details>

      <div id="journey-actions" className="mt-auto flex scroll-mt-4 flex-col gap-3">
        {progress.playerStatus === "terminal-complete" ? (
          <Button brand="kameleon" size="lg" fullWidth onClick={onViewCompletion}>
            View journey completion
          </Button>
        ) : progress.currentNodeId ? (
          <Button brand="kameleon" size="lg" fullWidth onClick={onResume}>
            Continue Journey
          </Button>
        ) : null}
        <Button brand="kameleon" variant="secondary" size="lg" fullWidth onClick={onExploreAnother}>
          Explore another path
        </Button>
      </div>
    </div>
  );
}
