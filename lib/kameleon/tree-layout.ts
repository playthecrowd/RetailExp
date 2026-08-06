import { kameleonNodesById } from "@/lib/kameleon/live-content";
import type { VideoNode } from "./pathway-model";

/**
 * Returns a node's children in left/right order, resolved through its
 * choices' destinationNodeId — never inferred from labels. Used by the
 * Story Path Map's recursive renderer (rebuilt as a vertically-indented
 * tree, not a horizontally-scrolling row layout, per the second Phase 3
 * review — a fixed-width horizontal row layout was exactly what produced
 * the rejected horizontal scrollbar).
 */
export function getChildren(node: VideoNode): VideoNode[] {
  return node.choices
    .slice()
    .sort((a, b) => (a.position === b.position ? 0 : a.position === "left" ? -1 : 1))
    .map((choice) => kameleonNodesById[choice.destinationNodeId])
    .filter((n): n is VideoNode => Boolean(n));
}
