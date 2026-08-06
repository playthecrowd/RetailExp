import type { EnvironmentMotif } from "@/components/kameleon/art/EnvironmentArt";
import type { VideoNode } from "./pathway-model";
import { getPathway } from "@/lib/kameleon/live-content";

/**
 * Real production photography, supplied 2026-08-03. Only full-screen (9:16,
 * 941x1672) source images were actually delivered — dedicated 16:9 pathway-
 * card and 3:2 decision-thumbnail crops were requested but never arrived
 * (see docs/KAMELEON_ASSET_MANIFEST.md). Every usage site below crops this
 * same source photo to its own aspect ratio via object-position rather than
 * waiting on separate files, and is documented as such — not a fabricated
 * substitute, the same approved photograph.
 */
export const kameleonFullscreenPhotos: Record<EnvironmentMotif, string> = {
  "private-pour": "/assets/kameleon/fullscreen/private-pour-fullscreen.png",
  "social-shift": "/assets/kameleon/fullscreen/social-shift-fullscreen.png",
  create: "/assets/kameleon/fullscreen/create-fullscreen.png",
  arrive: "/assets/kameleon/fullscreen/arrive-fullscreen.png",
  "the-table": "/assets/kameleon/fullscreen/journey-completion-fullscreen.png",
};

export const PHOTO_INTRINSIC_WIDTH = 941;
export const PHOTO_INTRINSIC_HEIGHT = 1672;

/**
 * Dedicated crops, supplied 2026-08-03 (see public/assets/kameleon/
 * ASSET-MANIFEST.md). Only 4 of the 5 motifs have one — "the-table" is a
 * terminal/flavor destination, never a selectable pathway card, and no
 * decision-choice thumbnail was supplied for it either (deep flavor nodes
 * like "Midnight Anthem" or "Golden Hour" that structurally resolve to
 * "the-table" via getNodeMotif() fall back to the full-screen photo crop
 * in EnvironmentArt rather than a missing dedicated file).
 */
export const kameleonPathwayThumbnails: Partial<Record<EnvironmentMotif, string>> = {
  "private-pour": "/assets/kameleon/pathway-thumbnails/private-pour-card-16x9.png",
  "social-shift": "/assets/kameleon/pathway-thumbnails/social-shift-card-16x9.png",
  create: "/assets/kameleon/pathway-thumbnails/create-card-16x9.png",
  arrive: "/assets/kameleon/pathway-thumbnails/arrive-card-16x9.png",
};

export const kameleonDecisionThumbnails: Partial<Record<EnvironmentMotif, string>> = {
  "private-pour": "/assets/kameleon/decision-thumbnails/private-pour-choice-3x2.png",
  "social-shift": "/assets/kameleon/decision-thumbnails/social-shift-choice-3x2.png",
  create: "/assets/kameleon/decision-thumbnails/create-choice-3x2.png",
  arrive: "/assets/kameleon/decision-thumbnails/arrive-choice-3x2.png",
};

/**
 * Per-motif focal point for object-position when cropping the full-screen
 * source into narrower frames (cards, player background, decision
 * thumbnails). Chosen by eye per image so the bottle/subject stays in
 * frame rather than defaulting to dead center for every photo.
 */
export const kameleonPhotoFocalPoint: Record<EnvironmentMotif, string> = {
  "private-pour": "center 65%",
  "social-shift": "center 55%",
  create: "center 60%",
  arrive: "center 45%",
  "the-table": "center 30%",
};

const TITLE_TO_MOTIF: Record<string, EnvironmentMotif> = {
  "private pour": "private-pour",
  "social shift": "social-shift",
  create: "create",
  arrive: "arrive",
  "the table": "the-table",
};

/**
 * Every pathway tree is built entirely under its own root pathwayId (see
 * lib/kameleon/build-pathway-tree.ts), but branch nodes are narratively
 * titled after *other* environments (e.g. Private Pour's right branch is
 * titled "Arrive"). Photography exists per environment, not per structural
 * tree, so this resolves the node's title against the 5 photographed
 * environments first, falling back to its structural pathway's motif only
 * for flavor nodes with no dedicated environment name (e.g. "Last Call").
 */
export function getNodeMotif(node: VideoNode): EnvironmentMotif {
  const byTitle = TITLE_TO_MOTIF[node.title.trim().toLowerCase()];
  if (byTitle) return byTitle;
  return getPathway(node.pathwayId)?.motif ?? "the-table";
}
