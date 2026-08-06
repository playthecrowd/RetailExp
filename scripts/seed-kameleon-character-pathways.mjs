// Replaces the generic bridge pathway data (private-pour/social-shift/create/
// arrive) with the real 4-character Perfect Pour pathway tree — Lena,
// Marcus, Julian, Ashley — each a 7-node tree (root + 2 chapters + 4 leaves)
// converging on one shared PP-FINAL node. Posters are the real approved
// Drive photography (final assets); videos are short ffmpeg Ken-Burns clips
// over those same photos (honest, clearly-labelled placeholders — no
// Higgsfield story video exists yet for these nodes, that generation is
// still on hold per project instruction).
//
// One-off, run-once script (not part of the Next.js app bundle). Run with:
//   node --env-file=.env.local scripts/seed-kameleon-character-pathways.mjs

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Run with: node --env-file=.env.local scripts/seed-kameleon-character-pathways.mjs",
  );
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "platform-media";
const FFMPEG = "C:\\Users\\cotye\\AppData\\Roaming\\Python\\Python314\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe";
const SCRATCH = "C:\\Users\\cotye\\AppData\\Local\\Temp\\claude\\C--Users-cotye-Documents-RetailExp-retail-exp\\5b38ec90-21f4-44ea-91d2-f89348e703af\\scratchpad";
const IMG_DIR = join(SCRATCH, "kameleon-character-images");
const CLIP_DIR = join(SCRATCH, "kameleon-character-clips");
const OLD_PATHWAY_SLUGS = ["private-pour", "social-shift", "create", "arrive"];

function log(msg) {
  console.log(`[seed-characters] ${msg}`);
}

function measureVideo(filePath) {
  let stderr = "";
  try {
    execFileSync(FFMPEG, ["-i", filePath], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    stderr = err.stderr?.toString() ?? "";
  }
  const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const dimMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  return {
    duration: durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : null,
    width: dimMatch ? Number(dimMatch[1]) : null,
    height: dimMatch ? Number(dimMatch[2]) : null,
  };
}

function measureImage(filePath) {
  let stderr = "";
  try {
    execFileSync(FFMPEG, ["-i", filePath], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    stderr = err.stderr?.toString() ?? "";
  }
  const dimMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  return { width: dimMatch ? Number(dimMatch[1]) : null, height: dimMatch ? Number(dimMatch[2]) : null };
}

function fileStats(filePath) {
  const buf = readFileSync(filePath);
  return { sizeBytes: statSync(filePath).size, checksum: createHash("sha256").update(buf).digest("hex") };
}

async function uploadFile(localPath, storagePath, contentType) {
  const buf = readFileSync(localPath);
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, { contentType, upsert: false });
    if (!error) return;
    lastError = error;
    log(`  upload attempt ${attempt} failed for ${storagePath}: ${error.message} — retrying...`);
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
  throw new Error(`Upload failed for ${storagePath} after 4 attempts: ${lastError.message}`);
}

async function insertMediaAsset(row) {
  const { data, error } = await supabase.from("media_assets").insert(row).select("id").single();
  if (error) throw new Error(`media_assets insert failed (${row.storage_path}): ${error.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Real character pathway data — titles/routing verbatim from Trello cards
// PP-LENA-*, PP-MARC-*, PP-JULI-*, PP-ASHL-*, PP-FINAL (board "Retail
// Experience Platform — Winery & Kameleon", lists V2-01..V2-04). Descriptions
// below are original summaries of each card's Higgsfield scene prompt, not
// verbatim reproductions.
// ---------------------------------------------------------------------------
const CHARACTERS = [
  {
    slug: "lena", title: "Lena", subtitle: "Fortune 500 Executive",
    description: "Leadership Under Pressure", accent: "red", sortOrder: 0,
    nodes: {
      "00": { title: "The Room Is Waiting", runtime: 10, desc: "At a private Atlanta dinner, senior leaders wait as Lena arrives with an acquisition proposal and a KAMELEON bottle catches the light beside her seat." },
      "01": { title: "Lead With the Vision", runtime: 15, desc: "Lena presents a bold growth vision while a skeptical board member hesitates and a longtime partner watches closely." },
      "01a": { title: "The Bold Proposal", runtime: 12, desc: "Lena commits fully to the ambitious proposal, and the board falls in behind her vision." },
      "01b": { title: "The Protected Partnership", runtime: 12, desc: "Lena reshapes the proposal to protect her longtime partner, and trust is restored around the table." },
      "02": { title: "Listen Before You Lead", runtime: 15, desc: "Lena pauses the meeting to ask the question no one else was willing to raise." },
      "02a": { title: "The Hidden Risk", runtime: 12, desc: "An overlooked risk comes to light, and Lena steers the room toward solving it before it's too late." },
      "02b": { title: "The Voice That Changes the Room", runtime: 12, desc: "Lena hands the floor to a quieter voice, and a stronger plan emerges." },
    },
    choices: {
      "00": [["Lead With the Vision", "01"], ["Listen Before You Lead", "02"]],
      "01": [["Make the Bold Proposal", "01a"], ["Protect the Partnership", "01b"]],
      "02": [["Ask the Question No One Asked", "02a"], ["Let Another Voice Lead", "02b"]],
    },
  },
  {
    slug: "marcus", title: "Marcus", subtitle: "Serial Entrepreneur",
    description: "Opportunity or Discernment", accent: "blue", sortOrder: 1,
    nodes: {
      "00": { title: "The Opportunity Lights Up", runtime: 10, desc: "In Marcus's Atlanta wine-and-cigar club, his phone lights up with an investor's call while trusted founders wait at the table." },
      "01": { title: "Take the Call", runtime: 15, desc: "Marcus takes the call as a lucrative offer arrives with a deadline of tonight." },
      "01a": { title: "The Window Opens", runtime: 12, desc: "Marcus signs on his own terms, ready before the offer ever came in." },
      "01b": { title: "The Question Behind the Offer", runtime: 12, desc: "Marcus pushes back on a restrictive clause and negotiates a fairer deal." },
      "02": { title: "Stay at the Table", runtime: 15, desc: "Marcus silences the call to hear out his founders before answering the money." },
      "02a": { title: "The Right Partner Was Already There", runtime: 12, desc: "Marcus shares his full vision, and the right partner is already in the room." },
      "02b": { title: "The Warning That Saves the Company", runtime: 12, desc: "A founder's warning stops Marcus from a costly mistake." },
    },
    choices: {
      "00": [["Take the Call", "01"], ["Stay at the Table", "02"]],
      "01": [["Move Before the Window Closes", "01a"], ["Ask One More Question", "01b"]],
      "02": [["Share the Vision", "02a"], ["Hear the Warning", "02b"]],
    },
  },
  {
    slug: "julian", title: "Julian", subtitle: "Luxury Fashion Buyer",
    description: "Instinct or the Forecast", accent: "red", sortOrder: 2,
    nodes: {
      "00": { title: "The Piece No One Ordered", runtime: 10, desc: "Inside an exclusive Atlanta boutique, Julian discovers an extraordinary garment by an unknown designer that his market data says to ignore." },
      "01": { title: "Trust Your Instinct", runtime: 15, desc: "Julian moves the unknown collection toward the runway despite the show director's warning." },
      "01a": { title: "The Breakout Collection", runtime: 12, desc: "The new designer's collection becomes the event's defining moment." },
      "01b": { title: "The Quiet Discovery", runtime: 12, desc: "One signature piece opens the door for a rising talent." },
      "02": { title: "Follow the Forecast", runtime: 15, desc: "Julian studies the safe, proven data — and notices every competitor reached the same conclusion." },
      "02a": { title: "The Flawless Event", runtime: 12, desc: "Julian executes the proven collection with flawless precision." },
      "02b": { title: "The Forecast Changes", runtime: 12, desc: "Julian breaks from the forecast, and demand begins to shift." },
    },
    choices: {
      "00": [["Trust Your Instinct", "01"], ["Follow the Forecast", "02"]],
      "01": [["Feature the New Designer", "01a"], ["Test One Signature Piece", "01b"]],
      "02": [["Choose the Proven House", "02a"], ["Challenge the Forecast", "02b"]],
    },
  },
  {
    slug: "ashley", title: "Ashley", subtitle: "Realtor and Young Mother",
    description: "Ambition and Balance", accent: "blue", sortOrder: 3,
    nodes: {
      "00": { title: "One More Call Tonight", runtime: 10, desc: "After her children are asleep, Ashley reviews a client file as competing offers threaten to cost her clients their dream home." },
      "01": { title: "Respond Tonight", runtime: 15, desc: "Ashley calls the listing agent under pressure to submit an offer immediately." },
      "01a": { title: "The Winning Offer", runtime: 12, desc: "Ashley structures a strong, safe offer — and it wins." },
      "01b": { title: "The Detail That Changes Everything", runtime: 12, desc: "Ashley uncovers a hidden issue just in time to protect her clients." },
      "02": { title: "Protect the Quiet Moment", runtime: 15, desc: "Ashley keeps her evening protected and records one honest message instead of rushing a reply." },
      "02a": { title: "Trust Is the Advantage", runtime: 12, desc: "Her clients choose to trust Ashley's pace, and the deal holds." },
      "02b": { title: "Morning Clarity", runtime: 12, desc: "In the morning, Ashley finds an even better listing for her clients." },
    },
    choices: {
      "00": [["Respond Tonight", "01"], ["Protect the Quiet Moment", "02"]],
      "01": [["Fight for the Home", "01a"], ["Slow Down and Verify", "01b"]],
      "02": [["Send One Honest Message", "02a"], ["Begin Fresh in the Morning", "02b"]],
    },
  },
];
const LEAF_KEYS = ["01a", "01b", "02a", "02b"];
const FINAL_DESC = "On an Atlanta rooftop, Lena, Marcus, Julian and Ashley come together and raise a glass around one KAMELEON bottle.";

async function main() {
  log("Resolving experience...");
  const { data: experience, error: expErr } = await supabase
    .from("experiences")
    .select("id, client_id")
    .eq("slug", "kameleon")
    .single();
  if (expErr) throw new Error(`Could not resolve Kameleon experience: ${expErr.message}`);
  const clientId = experience.client_id;
  const experienceId = experience.id;
  log(`client_id=${clientId} experience_id=${experienceId}`);

  // --- Step 0: tear down the old bridge pathway data ------------------------
  log("Removing old bridge pathway data (private-pour/social-shift/create/arrive)...");
  const { data: oldPathways, error: oldPathwaysErr } = await supabase
    .from("pathways")
    .select("id")
    .eq("experience_id", experienceId)
    .in("slug", OLD_PATHWAY_SLUGS);
  if (oldPathwaysErr) throw new Error(`Could not query old pathways: ${oldPathwaysErr.message}`);

  if (oldPathways && oldPathways.length > 0) {
    const oldPathwayIds = oldPathways.map((p) => p.id);
    const { data: oldNodes, error: oldNodesErr } = await supabase
      .from("content_nodes")
      .select("id, primary_video_asset_id, poster_asset_id")
      .in("pathway_id", oldPathwayIds);
    if (oldNodesErr) throw new Error(`Could not query old content_nodes: ${oldNodesErr.message}`);
    const oldNodeIds = (oldNodes ?? []).map((n) => n.id);
    const oldAssetIds = (oldNodes ?? []).flatMap((n) => [n.primary_video_asset_id, n.poster_asset_id]).filter(Boolean);

    if (oldNodeIds.length > 0) {
      const { error } = await supabase.from("choices").delete().in("source_node_id", oldNodeIds);
      if (error) throw new Error(`Deleting old choices failed: ${error.message}`);
    }
    // null out the circular pathway->root_node_id FK before deleting nodes
    { const { error } = await supabase.from("pathways").update({ root_node_id: null }).in("id", oldPathwayIds);
      if (error) throw new Error(`Clearing old pathways.root_node_id failed: ${error.message}`); }
    if (oldNodeIds.length > 0) {
      const { error } = await supabase.from("content_nodes").delete().in("id", oldNodeIds);
      if (error) throw new Error(`Deleting old content_nodes failed: ${error.message}`);
    }
    { const { error } = await supabase.from("pathways").delete().in("id", oldPathwayIds);
      if (error) throw new Error(`Deleting old pathways failed: ${error.message}`); }

    if (oldAssetIds.length > 0) {
      const { data: oldAssets, error: assetsErr } = await supabase.from("media_assets").select("id, storage_path").in("id", oldAssetIds);
      if (assetsErr) throw new Error(`Could not query old media_assets: ${assetsErr.message}`);
      const objectPaths = (oldAssets ?? []).map((a) => a.storage_path).filter((p) => !p.startsWith("/"));
      if (objectPaths.length > 0) {
        const { error } = await supabase.storage.from(BUCKET).remove(objectPaths);
        if (error) log(`WARNING: storage cleanup failed (continuing): ${error.message}`);
      }
      const { error } = await supabase.from("media_assets").delete().in("id", oldAssetIds);
      if (error) throw new Error(`Deleting old media_assets failed: ${error.message}`);
    }
    log(`Removed ${oldPathwayIds.length} old pathways, ${oldNodeIds.length} old nodes.`);
  } else {
    log("No old bridge pathway data found — nothing to remove.");
  }

  // idempotency guard for the new data
  const { data: existingLena } = await supabase.from("pathways").select("id").eq("experience_id", experienceId).eq("slug", "lena").limit(1);
  if (existingLena && existingLena.length > 0) {
    log("Character pathways already seeded — nothing to do. Exiting.");
    return;
  }

  // --- Step 1: upload PP-FINAL node (shared convergence node) ---------------
  log("Uploading PP-FINAL...");
  async function uploadNodeAssets(key) {
    const videoPath = join(CLIP_DIR, `${key}.mp4`);
    const posterPath = join(IMG_DIR, `${key}.png`);
    const videoMeta = measureVideo(videoPath);
    const videoStats = fileStats(videoPath);
    const posterMeta = measureImage(posterPath);
    const posterStats = fileStats(posterPath);

    const videoAssetUuid = crypto.randomUUID();
    const videoStoragePath = `${clientId}/${experienceId}/${videoAssetUuid}/v1/${key}.mp4`;
    await uploadFile(videoPath, videoStoragePath, "video/mp4");
    const videoAssetId = await insertMediaAsset({
      id: videoAssetUuid, client_id: clientId, experience_id: experienceId,
      media_type: "video", role: "node-video-placeholder", storage_path: videoStoragePath,
      mime_type: "video/mp4", file_size_bytes: videoStats.sizeBytes, duration_seconds: videoMeta.duration,
      width: videoMeta.width, height: videoMeta.height, processing_status: "ready",
      is_placeholder: true, checksum: videoStats.checksum,
    });

    const posterAssetUuid = crypto.randomUUID();
    const posterStoragePath = `${clientId}/${experienceId}/${posterAssetUuid}/v1/${key}-poster.png`;
    await uploadFile(posterPath, posterStoragePath, "image/png");
    const posterAssetId = await insertMediaAsset({
      id: posterAssetUuid, client_id: clientId, experience_id: experienceId,
      media_type: "image", role: "node-poster", storage_path: posterStoragePath,
      mime_type: "image/png", file_size_bytes: posterStats.sizeBytes,
      width: posterMeta.width, height: posterMeta.height, processing_status: "ready",
      is_placeholder: false, checksum: posterStats.checksum,
    });

    return { videoAssetId, posterAssetId, duration: videoMeta.duration };
  }

  const finalAssets = await uploadNodeAssets("final");
  const { data: finalNode, error: finalErr } = await supabase
    .from("content_nodes")
    .insert({
      client_id: clientId, experience_id: experienceId, pathway_id: null, parent_node_id: null,
      node_type: "journey_completion", internal_name: "final",
      title: "Every Pour Is a Transformation", description: FINAL_DESC,
      is_root: false, is_terminal: true,
      primary_video_asset_id: finalAssets.videoAssetId, poster_asset_id: finalAssets.posterAssetId,
      duration_seconds: finalAssets.duration, sort_order: 0,
      publication_status: "draft", processing_status: "ready",
    })
    .select("id")
    .single();
  if (finalErr) throw new Error(`PP-FINAL insert failed: ${finalErr.message}`);
  log(`PP-FINAL content_node: ${finalNode.id}`);

  // --- Step 2: per-character pathway + 7-node tree ---------------------------
  let totalNodes = 1; // final
  let totalChoices = 0;

  for (const character of CHARACTERS) {
    log(`Seeding pathway "${character.slug}"...`);
    const { data: pathwayRow, error: pathwayErr } = await supabase
      .from("pathways")
      .insert({
        experience_id: experienceId, slug: character.slug, title: character.title,
        subtitle: character.subtitle, description: character.description,
        accent_color: character.accent, root_node_id: null, sort_order: character.sortOrder,
        publication_status: "draft",
      })
      .select("id")
      .single();
    if (pathwayErr) throw new Error(`pathway insert failed (${character.slug}): ${pathwayErr.message}`);
    const pathwayId = pathwayRow.id;

    const nodeIdByKey = {};
    let sortOrder = 0;

    async function insertNode(nodeKey, parentNodeId, branchCode, chapterNumber) {
      const spec = character.nodes[nodeKey];
      const assetKey = `${character.slug.slice(0, 4)}-${nodeKey}`;
      const assets = await uploadNodeAssets(assetKey);
      const isRoot = nodeKey === "00";
      const isTerminal = false; // every leaf continues on to PP-FINAL

      const { data: nodeRow, error: nodeErr } = await supabase
        .from("content_nodes")
        .insert({
          client_id: clientId, experience_id: experienceId, pathway_id: pathwayId, parent_node_id: parentNodeId,
          node_type: "pathway_chapter", internal_name: assetKey,
          title: spec.title, chapter_label: `Chapter ${chapterNumber}`, description: spec.desc,
          chapter_number: chapterNumber, branch_code: branchCode,
          is_root: isRoot, is_terminal: isTerminal,
          primary_video_asset_id: assets.videoAssetId, poster_asset_id: assets.posterAssetId,
          duration_seconds: assets.duration, sort_order: sortOrder++,
          publication_status: "draft", processing_status: "ready",
        })
        .select("id")
        .single();
      if (nodeErr) throw new Error(`content_node insert failed (${assetKey}): ${nodeErr.message}`);
      nodeIdByKey[nodeKey] = nodeRow.id;
      totalNodes++;
      return nodeRow.id;
    }

    const rootId = await insertNode("00", null, "", 1);
    for (const chapterKey of ["01", "02"]) {
      const branch = chapterKey === "01" ? "A" : "B";
      await insertNode(chapterKey, rootId, branch, 2);
    }
    for (const [chapterKey, leafPair] of [["01", ["01a", "01b"]], ["02", ["02a", "02b"]]]) {
      const chapterBranch = chapterKey === "01" ? "A" : "B";
      for (const [i, leafKey] of leafPair.entries()) {
        const leafBranch = `${chapterBranch}.${i === 0 ? "A" : "B"}`;
        await insertNode(leafKey, nodeIdByKey[chapterKey], leafBranch, 3);
      }
    }

    // choices: 00 -> 01/02, 01 -> 01a/01b, 02 -> 02a/02b
    for (const [sourceKey, options] of Object.entries(character.choices)) {
      let displayOrder = 0;
      for (const [label, destKey] of options) {
        const { error } = await supabase.from("choices").insert({
          client_id: clientId, source_node_id: nodeIdByKey[sourceKey], destination_node_id: nodeIdByKey[destKey],
          title: label, description: character.nodes[destKey].desc, display_order: displayOrder++, active: true,
        });
        if (error) throw new Error(`choice insert failed (${character.slug} ${sourceKey}->${destKey}): ${error.message}`);
        totalChoices++;
      }
    }

    // leaves -> PP-FINAL (single continuation choice each)
    for (const leafKey of LEAF_KEYS) {
      const { error } = await supabase.from("choices").insert({
        client_id: clientId, source_node_id: nodeIdByKey[leafKey], destination_node_id: finalNode.id,
        title: "Continue to the Ending", description: FINAL_DESC, display_order: 0, active: true,
      });
      if (error) throw new Error(`choice insert failed (${character.slug} ${leafKey}->final): ${error.message}`);
      totalChoices++;
    }

    const { error: rootUpdateErr } = await supabase.from("pathways").update({ root_node_id: rootId }).eq("id", pathwayId);
    if (rootUpdateErr) throw new Error(`pathways.root_node_id update failed (${character.slug}): ${rootUpdateErr.message}`);

    log(`  ${character.slug}: 7 nodes, root=${rootId}`);
  }

  // --- Step 3: publish --------------------------------------------------------
  log("Publishing...");
  { const { error } = await supabase.from("content_nodes").update({ publication_status: "published" }).eq("experience_id", experienceId);
    if (error) throw new Error(`content_nodes publish failed: ${error.message}`); }
  { const { error } = await supabase.from("pathways").update({ publication_status: "published" }).eq("experience_id", experienceId);
    if (error) throw new Error(`pathways publish failed: ${error.message}`); }

  // --- Step 4: publication_versions -------------------------------------------
  log("Recording publication_versions...");
  const { data: pubVersion, error: pubErr } = await supabase
    .from("publication_versions")
    .insert({
      experience_id: experienceId, version_number: 2, status: "published", published_at: new Date().toISOString(),
      snapshot: { pathwayCount: CHARACTERS.length, nodeCount: totalNodes, choiceCount: totalChoices, seededAt: new Date().toISOString(), source: "character-pathways" },
    })
    .select("id")
    .single();
  if (pubErr) throw new Error(`publication_versions insert failed: ${pubErr.message}`);
  { const { error } = await supabase.from("experiences").update({ current_version_id: pubVersion.id }).eq("id", experienceId);
    if (error) throw new Error(`experiences.current_version_id update failed: ${error.message}`); }

  log(`DONE. ${totalNodes} content_nodes, ${CHARACTERS.length} pathways, ${totalChoices} choices, publication_version ${pubVersion.id}.`);
}

main().catch((err) => {
  console.error("[seed-characters] FAILED:", err);
  process.exit(1);
});
