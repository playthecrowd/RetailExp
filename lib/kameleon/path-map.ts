import type { ViewerProgress, VideoNode } from "./pathway-model";

export type NodeMapStatus = "complete" | "current" | "available" | "locked";

/**
 * Status for a single node within the pathway tree currently being viewed.
 * "Available" means it's one of the two choices standing open from the
 * node the viewer is presently deciding on; once a choice is made, the
 * untraveled sibling becomes "locked" like the rest of the untraveled tree
 * (a real consequence of a binary-choice story, not a bug).
 */
export function getNodeStatus(node: VideoNode, progress: ViewerProgress): NodeMapStatus {
  if (progress.completedNodeIds.includes(node.id)) return "complete";
  if (node.id === progress.currentNodeId) return "current";
  if (progress.playerStatus === "awaiting-choice" && node.parentNodeId === progress.currentNodeId) {
    return "available";
  }
  return "locked";
}
