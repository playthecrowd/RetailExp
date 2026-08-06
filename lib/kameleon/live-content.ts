"use client";

import { createClient } from "@/lib/supabase/client";
import type { Pathway, VideoChoice, VideoNode, NodeStatus, ChoicePosition } from "./pathway-model";

/**
 * Live, Supabase-backed replacement for lib/mock-data/kameleon-pathways.ts.
 * Fetches once (client-side) and caches via ES module live bindings — every
 * importer reads `kameleonPathways`/`getPathway()`/`getNode()` inline inside
 * a render/handler body (never destructured into a module-level constant at
 * import time), so a live-binding reassignment after the async fetch
 * resolves is transparently visible everywhere. Call loadKameleonContent()
 * once (e.g. on mount of app/experience/kameleon/page.tsx) and gate
 * rendering on it — every consumer below assumes the cache is already
 * populated by the time it's called.
 */

const BUCKET = "platform-media";
const SIGNED_URL_TTL_SECONDS = 3600;

export let kameleonPathways: Pathway[] = [];
export let kameleonNodesById: Record<string, VideoNode> = {};

export interface CommercialContent {
  title: string;
  description: string;
  videoSource: string;
  posterSource: string;
  durationSeconds: number;
}

let commercialContent: CommercialContent | undefined;
let loaded = false;
let inFlight: Promise<void> | null = null;

export function isKameleonContentLoaded(): boolean {
  return loaded;
}

export async function loadKameleonContent(): Promise<void> {
  if (loaded) return;
  if (!inFlight) {
    inFlight = fetchAndAssignCache().catch((error) => {
      inFlight = null; // allow a subsequent call to actually retry, not re-await a stale rejection
      throw error;
    });
  }
  await inFlight;
}

export function getPathway(pathwayId: string): Pathway | undefined {
  return kameleonPathways.find((p) => p.id === pathwayId);
}

export function getNode(nodeId: string): VideoNode | undefined {
  return kameleonNodesById[nodeId];
}

export function getPathwayForNode(nodeId: string): Pathway | undefined {
  const node = kameleonNodesById[nodeId];
  if (!node) return undefined;
  return getPathway(node.pathwayId);
}

export function getCommercialNode(): CommercialContent | undefined {
  return commercialContent;
}

interface MediaRow {
  id: string;
  storage_path: string;
}

function resolveUrl(assetId: string | null, urlByAssetId: Map<string, string>): string {
  if (!assetId) return "";
  return urlByAssetId.get(assetId) ?? "";
}

async function fetchAndAssignCache(): Promise<void> {
  const supabase = createClient();

  const { data: experience, error: expErr } = await supabase
    .from("experiences")
    .select("id, commercial_content_node_id")
    .eq("slug", "kameleon")
    .single();
  if (expErr || !experience) throw new Error(`Could not load Kameleon experience: ${expErr?.message}`);

  const [{ data: pathwayRows, error: pathwaysErr }, { data: nodeRows, error: nodesErr }] = await Promise.all([
    supabase.from("pathways").select("*").eq("experience_id", experience.id).order("sort_order"),
    supabase.from("content_nodes").select("*").eq("experience_id", experience.id).order("sort_order"),
  ]);
  if (pathwaysErr) throw new Error(`Could not load pathways: ${pathwaysErr.message}`);
  if (nodesErr) throw new Error(`Could not load content_nodes: ${nodesErr.message}`);

  const nodeIds = (nodeRows ?? []).map((n) => n.id);
  const { data: choiceRows, error: choicesErr } = await supabase.from("choices").select("*").in("source_node_id", nodeIds);
  if (choicesErr) throw new Error(`Could not load choices: ${choicesErr.message}`);

  // Collect every distinct media_assets id referenced by nodes/choices, then resolve all
  // of them to signed URLs in one batched call.
  const assetIds = new Set<string>();
  for (const n of nodeRows ?? []) {
    if (n.primary_video_asset_id) assetIds.add(n.primary_video_asset_id);
    if (n.poster_asset_id) assetIds.add(n.poster_asset_id);
    if (n.captions_asset_id) assetIds.add(n.captions_asset_id);
  }
  for (const c of choiceRows ?? []) {
    if (c.thumbnail_asset_id) assetIds.add(c.thumbnail_asset_id);
    if (c.preview_video_asset_id) assetIds.add(c.preview_video_asset_id);
  }

  const { data: mediaRows, error: mediaErr } = await supabase
    .from("media_assets")
    .select("id, storage_path")
    .in("id", Array.from(assetIds));
  if (mediaErr) throw new Error(`Could not load media_assets: ${mediaErr.message}`);

  const urlByAssetId = new Map<string, string>();
  const objectPaths: string[] = [];
  const localAssetIds: { id: string; path: string }[] = [];
  for (const row of (mediaRows ?? []) as MediaRow[]) {
    if (row.storage_path.startsWith("/")) {
      localAssetIds.push({ id: row.id, path: row.storage_path });
    } else {
      objectPaths.push(row.storage_path);
    }
  }
  for (const { id, path } of localAssetIds) urlByAssetId.set(id, path);

  if (objectPaths.length > 0) {
    const { data: signedUrls, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(objectPaths, SIGNED_URL_TTL_SECONDS);
    if (signErr) throw new Error(`Could not create signed URLs: ${signErr.message}`);
    const pathToAssetId = new Map((mediaRows ?? []).map((r) => [r.storage_path, r.id]));
    for (const entry of signedUrls ?? []) {
      if (entry.error || !entry.signedUrl) continue;
      const assetId = pathToAssetId.get(entry.path ?? "");
      if (assetId) urlByAssetId.set(assetId, entry.signedUrl);
    }
  }

  // Group choices by source node.
  const choicesByNode = new Map<string, VideoChoice[]>();
  for (const c of choiceRows ?? []) {
    if (!c.destination_node_id) {
      console.warn(`Skipping choice ${c.id} — no destination_node_id`);
      continue;
    }
    const choice: VideoChoice = {
      id: c.id,
      sourceNodeId: c.source_node_id,
      destinationNodeId: c.destination_node_id,
      label: c.title,
      description: c.description ?? "",
      previewImage: resolveUrl(c.thumbnail_asset_id, urlByAssetId),
      position: (c.display_order === 0 ? "left" : "right") as ChoicePosition,
      status: (c.active ? "published" : "archived") as NodeStatus,
    };
    const list = choicesByNode.get(c.source_node_id) ?? [];
    list.push(choice);
    choicesByNode.set(c.source_node_id, list);
  }

  const nodesById: Record<string, VideoNode> = {};
  let commercial: CommercialContent | undefined;

  for (const n of nodeRows ?? []) {
    if (n.node_type === "commercial") {
      commercial = {
        title: n.title,
        description: n.description ?? "",
        videoSource: resolveUrl(n.primary_video_asset_id, urlByAssetId),
        posterSource: resolveUrl(n.poster_asset_id, urlByAssetId),
        durationSeconds: n.duration_seconds ?? 0,
      };
      continue;
    }
    // pathway_id is legitimately null for a shared convergence node (e.g.
    // PP-FINAL, node_type "journey_completion") reachable from every
    // pathway's leaves — only pathway_chapter nodes are required to have one.
    if (!n.pathway_id && n.node_type === "pathway_chapter") continue;

    nodesById[n.id] = {
      id: n.id,
      clientId: n.client_id,
      experienceId: n.experience_id,
      pathwayId: n.pathway_id ?? "",
      chapterNumber: n.chapter_number ?? 0,
      displayName: n.chapter_label ?? n.internal_name,
      branchCode: n.branch_code ?? "",
      title: n.title,
      description: n.description ?? "",
      videoSource: resolveUrl(n.primary_video_asset_id, urlByAssetId),
      posterSource: resolveUrl(n.poster_asset_id, urlByAssetId),
      captionsSource: resolveUrl(n.captions_asset_id, urlByAssetId),
      duration: n.duration_seconds ?? 0,
      isRoot: n.is_root,
      isTerminal: n.is_terminal,
      parentNodeId: n.parent_node_id,
      choices: choicesByNode.get(n.id) ?? [],
      status: n.publication_status as NodeStatus,
      sortOrder: n.sort_order,
      decisionTiming: (n.decision_timing as VideoNode["decisionTiming"]) ?? undefined,
    };
  }

  const pathways: Pathway[] = (pathwayRows ?? []).map((p) => ({
    id: p.slug,
    slug: p.slug,
    label: p.title,
    subtitle: p.subtitle ?? "",
    description: p.description ?? "",
    motif: p.slug as Pathway["motif"],
    accent: (p.accent_color as Pathway["accent"]) ?? "red",
    rootNodeId: p.root_node_id ?? "",
    sortOrder: p.sort_order,
  }));

  // pathwayId on nodes/choices above is the DB uuid; re-key nodesById's pathwayId references
  // to the pathway *slug* (matching Pathway.id) so getPathwayForNode()/getPathway() line up,
  // the same convention lib/mock-data/kameleon-pathways.ts used (pathway "id" = its slug).
  const pathwayUuidToSlug = new Map((pathwayRows ?? []).map((p) => [p.id, p.slug]));
  for (const node of Object.values(nodesById)) {
    const slug = pathwayUuidToSlug.get(node.pathwayId);
    if (slug) node.pathwayId = slug;
  }

  kameleonPathways = pathways;
  kameleonNodesById = nodesById;
  commercialContent = commercial;
  loaded = true;
}
