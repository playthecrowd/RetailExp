/**
 * Branching-video data model (Phase 3 correction — replaces the earlier
 * ad-hoc journey graph in lib/types/journey.ts, which modeled a single
 * asymmetric graph rather than a true per-pathway binary tree).
 *
 * Each pathway is its own binary tree of VideoNodes. Non-terminal nodes have
 * exactly two outgoing choices; a terminal node has none and ends the
 * pathway. Navigation is always resolved through Choice.destinationNodeId —
 * never through display text or hardcoded conditionals — so this shape maps
 * directly onto future Supabase tables (Phase 7) and a later client
 * content-management UI (not built in this phase).
 */

export type NodeStatus = "draft" | "published" | "archived";
export type ChoicePosition = "left" | "right";
export type AccentColor = "red" | "blue";

export interface VideoChoice {
  id: string;
  sourceNodeId: string;
  destinationNodeId: string;
  label: string;
  description: string;
  previewImage: string;
  position: ChoicePosition;
  status: NodeStatus;
}

export interface VideoNode {
  id: string;
  clientId: string;
  experienceId: string;
  pathwayId: string;
  chapterNumber: number;
  /** Structural placeholder name, e.g. "Chapter 1 Video A.B". */
  displayName: string;
  /** "" for the root, then "A" | "B" | "A.A" | "A.B" | "B.A.A" ... */
  branchCode: string;
  /** Narrative flavor title shown to the viewer, e.g. "Follow the Energy". */
  title: string;
  description: string;
  videoSource: string;
  /**
   * OPTIONAL 2:1 equirectangular version of this chapter.
   *
   * Empty string means this chapter has no 360 version and the player must
   * hide its "View in 360°" control. A normal 16:9 video is not
   * equirectangular, so substituting videoSource here would render a smeared
   * sphere rather than a 360 experience — absent has to mean absent.
   */
  video360Source: string;
  posterSource: string;
  captionsSource: string;
  duration: number;
  isRoot: boolean;
  isTerminal: boolean;
  parentNodeId: string | null;
  choices: VideoChoice[];
  status: NodeStatus;
  sortOrder: number;
  /** Optional per-node override of the timed-decision-drawer timing; see lib/kameleon/decision-timing.ts for defaults. */
  decisionTiming?: Partial<import("./decision-timing").DecisionTiming>;
}

export interface Pathway {
  id: string;
  slug: string;
  label: string;
  subtitle: string;
  description: string;
  /** Which reusable icon glyph + environment-art motif to use (see components/kameleon/art). */
  motif: "private-pour" | "social-shift" | "create" | "arrive";
  accent: AccentColor;
  rootNodeId: string;
  sortOrder: number;
}

export interface PathHistoryEntry {
  sourceNodeId: string;
  choiceId: string;
  destinationNodeId: string;
  selectedAt: string;
}

export type PlayerStatus = "not-started" | "playing" | "awaiting-choice" | "terminal-complete";

export interface ViewerProgress {
  pathwayId: string | null;
  currentNodeId: string | null;
  playerStatus: PlayerStatus;
  /** Approximate resume position for the current node, seconds. */
  currentNodeElapsedSeconds: number;
  history: PathHistoryEntry[];
  completedNodeIds: string[];
  lastUpdatedIso: string;
}

export function createInitialProgress(): ViewerProgress {
  return {
    pathwayId: null,
    currentNodeId: null,
    playerStatus: "not-started",
    currentNodeElapsedSeconds: 0,
    history: [],
    completedNodeIds: [],
    lastUpdatedIso: new Date(0).toISOString(),
  };
}

/** Type guard used when hydrating from storage — malformed data must fail safe. */
export function isValidViewerProgress(value: unknown): value is ViewerProgress {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.pathwayId === null || typeof v.pathwayId === "string") &&
    (v.currentNodeId === null || typeof v.currentNodeId === "string") &&
    typeof v.playerStatus === "string" &&
    ["not-started", "playing", "awaiting-choice", "terminal-complete"].includes(v.playerStatus as string) &&
    typeof v.currentNodeElapsedSeconds === "number" &&
    Array.isArray(v.history) &&
    Array.isArray(v.completedNodeIds) &&
    typeof v.lastUpdatedIso === "string"
  );
}

export function buildBreadcrumb(
  history: PathHistoryEntry[],
  nodesById: Record<string, VideoNode>,
  rootNodeId: string,
): VideoNode[] {
  const root = nodesById[rootNodeId];
  if (!root) return [];
  const trail: VideoNode[] = [root];
  for (const entry of history) {
    const node = nodesById[entry.destinationNodeId];
    if (node) trail.push(node);
  }
  return trail;
}

export function resolveDestination(
  choice: VideoChoice,
  nodesById: Record<string, VideoNode>,
): VideoNode | undefined {
  return nodesById[choice.destinationNodeId];
}
