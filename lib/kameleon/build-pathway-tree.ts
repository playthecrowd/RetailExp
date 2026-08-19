import type { VideoNode, VideoChoice, NodeStatus } from "./pathway-model";

/**
 * Compact authoring shape for a binary video tree. Expanded into flat
 * VideoNode/Choice records by buildPathwayTree() below. The builder is
 * fully generic over depth — nothing here limits a tree to the two or three
 * levels used in the current mock content.
 */
export interface NodeSpec {
  title: string;
  description: string;
  durationSeconds: number;
  left?: { label: string; description: string; child: NodeSpec };
  right?: { label: string; description: string; child: NodeSpec };
}

const STATUS: NodeStatus = "published";

function placeholderPaths(pathwayId: string, branchCode: string) {
  const key = `${pathwayId}${branchCode ? `-${branchCode.toLowerCase()}` : ""}`;
  return {
    videoSource: `/media/kameleon/placeholder/${key}.mp4`,
    // No placeholder 360 asset exists, and inventing one would put a 16:9
    // video behind a 360 button. Absent is the honest value.
    video360Source: "",
    posterSource: `/media/kameleon/placeholder/${key}-poster.jpg`,
    captionsSource: `/media/kameleon/placeholder/${key}.vtt`,
    previewImage: `/media/kameleon/placeholder/${key}-preview.jpg`,
  };
}

export function buildPathwayTree(
  clientId: string,
  experienceId: string,
  pathwayId: string,
  root: NodeSpec,
): { nodes: Record<string, VideoNode>; rootNodeId: string } {
  const nodes: Record<string, VideoNode> = {};
  let sortOrder = 0;

  function walk(spec: NodeSpec, branchCode: string, parentId: string | null, depth: number): string {
    const id = branchCode ? `${pathwayId}-${branchCode.toLowerCase().replace(/\./g, "")}` : `${pathwayId}-root`;
    const displayName = branchCode ? `Chapter 1 Video ${branchCode}` : "Chapter 1 Video";
    const paths = placeholderPaths(pathwayId, branchCode);
    const isTerminal = !spec.left && !spec.right;

    const node: VideoNode = {
      id,
      clientId,
      experienceId,
      pathwayId,
      chapterNumber: depth + 1,
      displayName,
      branchCode,
      title: spec.title,
      description: spec.description,
      videoSource: paths.videoSource,
      video360Source: paths.video360Source,
      posterSource: paths.posterSource,
      captionsSource: paths.captionsSource,
      duration: spec.durationSeconds,
      isRoot: branchCode === "",
      isTerminal,
      parentNodeId: parentId,
      choices: [],
      status: STATUS,
      sortOrder: sortOrder++,
    };
    nodes[id] = node;

    const choices: VideoChoice[] = [];
    if (spec.left) {
      const childCode = branchCode ? `${branchCode}.A` : "A";
      const childId = walk(spec.left.child, childCode, id, depth + 1);
      choices.push({
        id: `${id}-choice-left`,
        sourceNodeId: id,
        destinationNodeId: childId,
        label: spec.left.label,
        description: spec.left.description,
        previewImage: placeholderPaths(pathwayId, childCode).previewImage,
        position: "left",
        status: STATUS,
      });
    }
    if (spec.right) {
      const childCode = branchCode ? `${branchCode}.B` : "B";
      const childId = walk(spec.right.child, childCode, id, depth + 1);
      choices.push({
        id: `${id}-choice-right`,
        sourceNodeId: id,
        destinationNodeId: childId,
        label: spec.right.label,
        description: spec.right.description,
        previewImage: placeholderPaths(pathwayId, childCode).previewImage,
        position: "right",
        status: STATUS,
      });
    }
    node.choices = choices;

    return id;
  }

  const rootNodeId = walk(root, "", null, 0);
  return { nodes, rootNodeId };
}
