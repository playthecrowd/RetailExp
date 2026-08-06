// Seeds real Supabase content for the Kameleon experience: the real
// Director's Edit commercial (uploaded to Storage) plus the full 4-pathway,
// 30-node, 26-choice branching tree backed by short ffmpeg-generated
// placeholder title-card videos (real, playable files — no per-character
// Higgsfield videos exist yet, that generation work is on hold).
//
// This is a one-off, run-once script (idempotency-guarded below), not part
// of the Next.js app bundle. It constructs its own service-role Supabase
// client inline via @supabase/supabase-js rather than importing
// lib/supabase/secret.ts, since that file is TypeScript with a relative
// import plain `node` can't resolve without a bundler.
//
// Run with:
//   node --env-file=.env.local scripts/seed-kameleon-content.mjs

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Run with: node --env-file=.env.local scripts/seed-kameleon-content.mjs",
  );
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "platform-media";
const FFMPEG = "C:\\Users\\cotye\\AppData\\Roaming\\Python\\Python314\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe";
const CLIPS_DIR = "C:\\Users\\cotye\\AppData\\Local\\Temp\\claude\\C--Users-cotye-Documents-RetailExp-retail-exp\\5b38ec90-21f4-44ea-91d2-f89348e703af\\scratchpad\\kameleon-placeholder-clips";
const COMMERCIAL_MP4 = "C:\\Users\\cotye\\Documents\\RetailExp\\Perfect_Pour_Directors_Edit_v1.mp4";
const COMMERCIAL_POSTER = join(CLIPS_DIR, "commercial-poster.png");

function log(msg) {
  console.log(`[seed] ${msg}`);
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
  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : null;
  const width = dimMatch ? Number(dimMatch[1]) : null;
  const height = dimMatch ? Number(dimMatch[2]) : null;
  return { duration, width, height };
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
  return {
    sizeBytes: statSync(filePath).size,
    checksum: createHash("sha256").update(buf).digest("hex"),
  };
}

async function uploadFile(localPath, storagePath, contentType) {
  const buf = readFileSync(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
}

async function insertMediaAsset(row) {
  const { data, error } = await supabase.from("media_assets").insert(row).select("id").single();
  if (error) throw new Error(`media_assets insert failed (${row.storage_path}): ${error.message}`);
  return data.id;
}

// Same 4 trees as lib/mock-data/kameleon-pathways.ts, titles/descriptions copied verbatim.
const TREES = {
  "private-pour": {
    slug: "private-pour", title: "Private Pour", subtitle: "Reflection. Reset. Breathe.",
    description: "A space for clarity, reflection, and stillness.", accent: "red", sortOrder: 0,
    root: {
      title: "Private Pour",
      description: "A space for clarity. Step away from the noise and discover what becomes visible in stillness.",
      left: { label: "Follow the Energy", description: "Step through the door and join the gathering.", child: {
        title: "Social Shift", description: "The gathering pulls you in. Connection sharpens the night into focus.",
        left: { label: "Follow the Craft", description: "Slip away to where the night is being made by hand.", child: {
          title: "Create", description: "Imagine. Inspire. Build. The night takes shape in your hands.",
          left: { label: "Bring It to the Table", description: "Everything you've made leads to one last room.", child: { title: "The Table", description: "Four cities. Four lives. One connection." } },
          right: { label: "One More Round", description: "The night isn't ready to end just yet.", child: { title: "Last Call", description: "One more pour before the room empties out." } },
        }},
        right: { label: "Follow the Toast", description: "Stay for the moment everyone has been waiting for.", child: { title: "The Table", description: "Four cities. Four lives. One connection." } },
      }},
      right: { label: "Follow the View", description: "Move toward the skyline and a moment of clarity.", child: {
        title: "Arrive", description: "Move toward the skyline. Every step is elevation.",
        left: { label: "Chase the Skyline", description: "Keep climbing toward where the night is still being built.", child: { title: "The Table", description: "Four cities. Four lives. One connection." } },
        right: { label: "Arrive at the Table", description: "The celebration has already found its center.", child: { title: "The Table", description: "Four cities. Four lives. One connection." } },
      }},
    },
  },
  "social-shift": {
    slug: "social-shift", title: "Social Shift", subtitle: "Connect. Share. Belong.",
    description: "The gathering pulls you in.", accent: "blue", sortOrder: 1,
    root: {
      title: "Social Shift", description: "Connect. Share. Belong. The gathering pulls you in.",
      left: { label: "Follow the Music", description: "The bass pulls you toward the dance floor.", child: {
        title: "Dance Floor", description: "The night moves faster here.",
        left: { label: "Lose Yourself", description: "Stop counting the hours.", child: { title: "Midnight Anthem", description: "The room sings the same line back at once." } },
        right: { label: "Step Outside", description: "Catch your breath under the skyline.", child: { title: "City Air", description: "The noise fades into the skyline for a moment." } },
      }},
      right: { label: "Follow the Conversation", description: "A quieter corner, a familiar face.", child: {
        title: "Fireside Chat", description: "Some connections happen in the quiet corners.",
        left: { label: "Open Up", description: "Say the thing you've been holding onto.", child: { title: "New Friend", description: "A stranger an hour ago, now part of the story." } },
        right: { label: "Listen In", description: "Let someone else's night in.", child: { title: "Old Story", description: "Every city has one — tonight, you hear it." } },
      }},
    },
  },
  "create": {
    slug: "create", title: "Create", subtitle: "Imagine. Inspire. Build.",
    description: "The night takes shape in your hands.", accent: "red", sortOrder: 2,
    root: {
      title: "Create", description: "Imagine. Inspire. Build. The night takes shape in your hands.",
      left: { label: "Pick Up the Brush", description: "Color says what words can't.", child: {
        title: "First Stroke", description: "The canvas is still mostly blank.",
        left: { label: "Chase the Color", description: "Follow whatever feels true.", child: { title: "Finished Canvas", description: "It wasn't the plan, but it's exactly right." } },
        right: { label: "Chase the Shadow", description: "Sometimes what's missing is the point.", child: { title: "Unfinished Sketch", description: "Some nights are better left incomplete." } },
      }},
      right: { label: "Pick Up the Pen", description: "The story writes itself if you let it.", child: {
        title: "First Line", description: "The page is patient. You aren't.",
        left: { label: "Write the Truth", description: "The honest version is harder, and better.", child: { title: "Torn Page", description: "Some drafts only exist to be let go." } },
        right: { label: "Write the Story", description: "Let the night become something worth telling.", child: { title: "Closing Line", description: "Every good night ends on the right sentence." } },
      }},
    },
  },
  "arrive": {
    slug: "arrive", title: "Arrive", subtitle: "Celebrate. Elevate. Arrive.",
    description: "Every step is elevation.", accent: "blue", sortOrder: 3,
    root: {
      title: "Arrive", description: "Celebrate. Elevate. Arrive.",
      left: { label: "Chase the Skyline", description: "Higher always feels closer to arriving.", child: {
        title: "Rooftop Air", description: "The city looks different from up here.",
        left: { label: "Watch the Sunset", description: "Let the color fade before the lights take over.", child: { title: "Golden Hour", description: "The last warm light before the city turns electric." } },
        right: { label: "Watch the City", description: "Stay for the moment the lights come on.", child: { title: "First Light", description: "The skyline wakes up one window at a time." } },
      }},
      right: { label: "Chase the Lights", description: "The street has its own kind of arrival.", child: {
        title: "City Below", description: "Ground level has an energy the rooftop can't match.",
        left: { label: "Walk the Street", description: "Let the city move around you.", child: { title: "Neon Reflection", description: "The wet pavement doubles every light in the block." } },
        right: { label: "Hail a Ride", description: "One more stop before the night closes.", child: { title: "Last Stop", description: "Every road tonight leads back to the same table." } },
      }},
    },
  },
};

async function main() {
  log("Resolving client + experience...");
  const { data: client, error: clientErr } = await supabase.from("clients").select("id").eq("slug", "kameleon").single();
  if (clientErr) throw new Error(`Could not resolve Kameleon client: ${clientErr.message}`);
  const { data: experience, error: expErr } = await supabase
    .from("experiences")
    .select("id, client_id")
    .eq("slug", "kameleon")
    .single();
  if (expErr) throw new Error(`Could not resolve Kameleon experience: ${expErr.message}`);
  const clientId = client.id;
  const experienceId = experience.id;
  log(`client_id=${clientId} experience_id=${experienceId}`);

  const { data: existingPathways, error: existErr } = await supabase
    .from("pathways")
    .select("id")
    .eq("experience_id", experienceId)
    .limit(1);
  if (existErr) throw new Error(`Idempotency check failed: ${existErr.message}`);
  if (existingPathways && existingPathways.length > 0) {
    log("Pathways already exist for this experience — nothing to do. Exiting.");
    return;
  }

  // --- Step 1+2: commercial video + poster -> Storage + media_assets ------
  log("Measuring commercial video...");
  const commercialMeta = measureVideo(COMMERCIAL_MP4);
  const commercialStats = fileStats(COMMERCIAL_MP4);
  const posterMeta = measureImage(COMMERCIAL_POSTER);
  const posterStats = fileStats(COMMERCIAL_POSTER);

  log("Uploading commercial video to Storage (this may take a while, 167MB)...");
  const commercialAssetId = crypto.randomUUID();
  const commercialStoragePath = `${clientId}/${experienceId}/${commercialAssetId}/v1/perfect-pour-directors-edit-v1.mp4`;
  await uploadFile(COMMERCIAL_MP4, commercialStoragePath, "video/mp4");
  const commercialMediaAssetId = await insertMediaAsset({
    id: commercialAssetId,
    client_id: clientId,
    experience_id: experienceId,
    media_type: "video",
    role: "commercial-video",
    storage_path: commercialStoragePath,
    mime_type: "video/mp4",
    file_size_bytes: commercialStats.sizeBytes,
    duration_seconds: commercialMeta.duration,
    width: commercialMeta.width,
    height: commercialMeta.height,
    processing_status: "ready",
    is_placeholder: false,
    checksum: commercialStats.checksum,
  });
  log(`Commercial video media_asset: ${commercialMediaAssetId}`);

  log("Uploading commercial poster...");
  const posterAssetId = crypto.randomUUID();
  const posterStoragePath = `${clientId}/${experienceId}/${posterAssetId}/v1/perfect-pour-directors-edit-poster.png`;
  await uploadFile(COMMERCIAL_POSTER, posterStoragePath, "image/png");
  const commercialPosterAssetId = await insertMediaAsset({
    id: posterAssetId,
    client_id: clientId,
    experience_id: experienceId,
    media_type: "image",
    role: "commercial-poster",
    storage_path: posterStoragePath,
    mime_type: "image/png",
    file_size_bytes: posterStats.sizeBytes,
    width: posterMeta.width,
    height: posterMeta.height,
    processing_status: "ready",
    is_placeholder: false,
    checksum: posterStats.checksum,
  });
  log(`Commercial poster media_asset: ${commercialPosterAssetId}`);

  log("Inserting commercial content_node...");
  const { data: commercialNode, error: commercialNodeErr } = await supabase
    .from("content_nodes")
    .insert({
      client_id: clientId,
      experience_id: experienceId,
      pathway_id: null,
      parent_node_id: null,
      node_type: "commercial",
      internal_name: "commercial",
      title: "The Perfect Pour",
      description: "Four cities. Four lives. One moment.",
      is_root: false,
      is_terminal: false,
      primary_video_asset_id: commercialMediaAssetId,
      poster_asset_id: commercialPosterAssetId,
      duration_seconds: commercialMeta.duration,
      sort_order: 0,
      publication_status: "draft",
      processing_status: "ready",
    })
    .select("id")
    .single();
  if (commercialNodeErr) throw new Error(`commercial content_node insert failed: ${commercialNodeErr.message}`);
  log(`Commercial content_node: ${commercialNode.id}`);

  // --- Step 3+4: pathways + tree nodes + choices --------------------------
  const allContentNodeIds = [commercialNode.id];
  const pathwayIds = {};
  const pathwayRootIds = {};

  for (const [pathwayKey, spec] of Object.entries(TREES)) {
    log(`Seeding pathway "${pathwayKey}"...`);
    const { data: pathwayRow, error: pathwayErr } = await supabase
      .from("pathways")
      .insert({
        experience_id: experienceId,
        slug: spec.slug,
        title: spec.title,
        subtitle: spec.subtitle,
        description: spec.description,
        accent_color: spec.accent,
        root_node_id: null,
        sort_order: spec.sortOrder,
        publication_status: "draft",
      })
      .select("id")
      .single();
    if (pathwayErr) throw new Error(`pathway insert failed (${pathwayKey}): ${pathwayErr.message}`);
    pathwayIds[pathwayKey] = pathwayRow.id;

    let sortOrder = 0;
    async function walk(node, branchCode, parentNodeId, depth) {
      const key = `${pathwayKey}${branchCode ? `-${branchCode.toLowerCase()}` : ""}`;
      const mp4Path = join(CLIPS_DIR, `${key}.mp4`);
      const posterPath = join(CLIPS_DIR, `${key}-poster.jpg`);
      const isTerminal = !node.left && !node.right;

      const videoMeta = measureVideo(mp4Path);
      const videoStats = fileStats(mp4Path);
      const clipPosterMeta = measureImage(posterPath);
      const clipPosterStats = fileStats(posterPath);

      const videoAssetUuid = crypto.randomUUID();
      const videoStoragePath = `${clientId}/${experienceId}/${videoAssetUuid}/v1/${key}.mp4`;
      await uploadFile(mp4Path, videoStoragePath, "video/mp4");
      const videoAssetId = await insertMediaAsset({
        id: videoAssetUuid,
        client_id: clientId,
        experience_id: experienceId,
        media_type: "video",
        role: "node-video-placeholder",
        storage_path: videoStoragePath,
        mime_type: "video/mp4",
        file_size_bytes: videoStats.sizeBytes,
        duration_seconds: videoMeta.duration,
        width: videoMeta.width,
        height: videoMeta.height,
        processing_status: "ready",
        is_placeholder: true,
        checksum: videoStats.checksum,
      });

      const posterAssetUuid = crypto.randomUUID();
      const posterStoragePath2 = `${clientId}/${experienceId}/${posterAssetUuid}/v1/${key}-poster.jpg`;
      await uploadFile(posterPath, posterStoragePath2, "image/jpeg");
      const nodePosterAssetId = await insertMediaAsset({
        id: posterAssetUuid,
        client_id: clientId,
        experience_id: experienceId,
        media_type: "image",
        role: "node-poster-placeholder",
        storage_path: posterStoragePath2,
        mime_type: "image/jpeg",
        file_size_bytes: clipPosterStats.sizeBytes,
        width: clipPosterMeta.width,
        height: clipPosterMeta.height,
        processing_status: "ready",
        is_placeholder: true,
        checksum: clipPosterStats.checksum,
      });

      const { data: nodeRow, error: nodeErr } = await supabase
        .from("content_nodes")
        .insert({
          client_id: clientId,
          experience_id: experienceId,
          pathway_id: pathwayIds[pathwayKey],
          parent_node_id: parentNodeId,
          node_type: "pathway_chapter",
          internal_name: key,
          title: node.title,
          chapter_label: branchCode ? `Chapter 1 Video ${branchCode}` : "Chapter 1 Video",
          description: node.description,
          chapter_number: depth + 1,
          branch_code: branchCode,
          is_root: branchCode === "",
          is_terminal: isTerminal,
          primary_video_asset_id: videoAssetId,
          poster_asset_id: nodePosterAssetId,
          duration_seconds: videoMeta.duration,
          sort_order: sortOrder++,
          publication_status: "draft",
          processing_status: "ready",
        })
        .select("id")
        .single();
      if (nodeErr) throw new Error(`content_node insert failed (${key}): ${nodeErr.message}`);
      allContentNodeIds.push(nodeRow.id);

      if (branchCode === "") pathwayRootIds[pathwayKey] = nodeRow.id;

      let displayOrder = 0;
      if (node.left) {
        const childCode = branchCode ? `${branchCode}.A` : "A";
        const childId = await walk(node.left.child, childCode, nodeRow.id, depth + 1);
        const { error: choiceErr } = await supabase.from("choices").insert({
          client_id: clientId,
          source_node_id: nodeRow.id,
          destination_node_id: childId,
          title: node.left.label,
          description: node.left.description,
          display_order: displayOrder++,
          active: true,
        });
        if (choiceErr) throw new Error(`choice insert failed (${key} left): ${choiceErr.message}`);
      }
      if (node.right) {
        const childCode = branchCode ? `${branchCode}.B` : "B";
        const childId = await walk(node.right.child, childCode, nodeRow.id, depth + 1);
        const { error: choiceErr } = await supabase.from("choices").insert({
          client_id: clientId,
          source_node_id: nodeRow.id,
          destination_node_id: childId,
          title: node.right.label,
          description: node.right.description,
          display_order: displayOrder++,
          active: true,
        });
        if (choiceErr) throw new Error(`choice insert failed (${key} right): ${choiceErr.message}`);
      }

      return nodeRow.id;
    }

    await walk(spec.root, "", null, 0);
  }

  // --- Step 5: circular FK fixups -----------------------------------------
  log("Wiring root_node_id / commercial_content_node_id...");
  for (const [pathwayKey, rootId] of Object.entries(pathwayRootIds)) {
    const { error } = await supabase.from("pathways").update({ root_node_id: rootId }).eq("id", pathwayIds[pathwayKey]);
    if (error) throw new Error(`pathways.root_node_id update failed (${pathwayKey}): ${error.message}`);
  }
  {
    const { error } = await supabase
      .from("experiences")
      .update({ commercial_content_node_id: commercialNode.id })
      .eq("id", experienceId);
    if (error) throw new Error(`experiences.commercial_content_node_id update failed: ${error.message}`);
  }

  // --- Step 6: publish -----------------------------------------------------
  log("Publishing...");
  {
    const { error } = await supabase
      .from("content_nodes")
      .update({ publication_status: "published" })
      .eq("experience_id", experienceId);
    if (error) throw new Error(`content_nodes publish failed: ${error.message}`);
  }
  {
    const { error } = await supabase.from("pathways").update({ publication_status: "published" }).eq("experience_id", experienceId);
    if (error) throw new Error(`pathways publish failed: ${error.message}`);
  }
  {
    const { error } = await supabase.from("experiences").update({ publication_status: "published" }).eq("id", experienceId);
    if (error) throw new Error(`experiences publish failed: ${error.message}`);
  }

  // --- Step 7: publication_versions ----------------------------------------
  log("Recording publication_versions...");
  const { data: pubVersion, error: pubErr } = await supabase
    .from("publication_versions")
    .insert({
      experience_id: experienceId,
      version_number: 1,
      status: "published",
      published_at: new Date().toISOString(),
      snapshot: {
        pathwayCount: Object.keys(TREES).length,
        nodeCount: allContentNodeIds.length,
        seededAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();
  if (pubErr) throw new Error(`publication_versions insert failed: ${pubErr.message}`);
  {
    const { error } = await supabase.from("experiences").update({ current_version_id: pubVersion.id }).eq("id", experienceId);
    if (error) throw new Error(`experiences.current_version_id update failed: ${error.message}`);
  }

  log(`DONE. ${allContentNodeIds.length} content_nodes, ${Object.keys(pathwayIds).length} pathways, publication_version ${pubVersion.id}.`);
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
