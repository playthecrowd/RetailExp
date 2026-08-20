// Installs the Kameleon Decision Lounge 360° video and attaches it to every
// pathway decision point.
//
// WHAT THIS IS
//   The accelerated pilot uses ONE 360° environment at every decision, not a
//   different lounge per chapter. So this registers a single media_assets row
//   and points every decision node's video360_asset_id at it. Producing 28
//   near-identical clips would cost 28x the render and give the visitor
//   nothing they could tell apart.
//
// WHY video360_asset_id AND NOT A STREAM UID
//   content_nodes.video360_asset_id is a foreign key to media_assets, and
//   media_assets.storage_path is a Supabase Storage object path that
//   lib/kameleon/live-content.ts signs in the same batch as every other
//   asset. That is the design already in place; a Cloudflare Stream UID in
//   this column would resolve to nothing.
//
// WHICH NODES
//   Every node that actually presents a decision — that is, every node with
//   at least one choice. That is measured from the choices table rather than
//   assumed from node_type, because "has a decision popup" is exactly "has
//   choices" and nothing else. Terminal and commercial nodes have none and
//   are left alone.
//
// IDEMPOTENT
//   Re-running replaces the object at the same storage path and re-points the
//   same nodes. It does not accumulate duplicate media_assets rows.
//
// Run with:
//   node --env-file=.env.local scripts/install-360-lounge-asset.mjs <path-to-mp4>

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Run with: node --env-file=.env.local scripts/install-360-lounge-asset.mjs <mp4>",
  );
}

const MP4 = process.argv[2];
if (!MP4) throw new Error("Usage: node --env-file=.env.local scripts/install-360-lounge-asset.mjs <mp4>");

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "platform-media";
const EXPERIENCE_SLUG = "kameleon";
const ROLE = "node-video-360";
const KEY = "kameleon-decision-lounge-360-v1.mp4";
// A stable id, so a re-run updates the same row instead of creating a second
// one and orphaning the first.
const ASSET_ID = "3c0f7a52-6b1e-4d9a-9f21-8ad4c7e05b60";

const log = (msg) => console.log(`[360] ${msg}`);

/** ffprobe is the arbiter of what was actually encoded, not the render script's
 *  intent. A 2:1 ratio is the one property that cannot be wrong. */
function probe(filePath) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,r_frame_rate,pix_fmt,codec_name",
      "-show_entries", "format=duration",
      "-of", "json",
      filePath,
    ],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  const stream = parsed.streams[0];
  const [num, den] = stream.r_frame_rate.split("/").map(Number);
  return {
    width: stream.width,
    height: stream.height,
    fps: num / den,
    pixFmt: stream.pix_fmt,
    codec: stream.codec_name,
    duration: Number(parsed.format.duration),
  };
}

const media = probe(MP4);
log(
  `probe: ${media.width}x${media.height} ${media.codec}/${media.pixFmt} ` +
    `${media.fps}fps ${media.duration.toFixed(2)}s`,
);

// Refuse rather than upload something that will look like a defect on a
// sphere. This is the same rule the player enforces, applied one step earlier.
if (media.width !== media.height * 2) {
  throw new Error(`Not 2:1 equirectangular: ${media.width}x${media.height}`);
}
if (media.codec !== "h264") throw new Error(`Expected h264, got ${media.codec}`);
if (media.pixFmt !== "yuv420p") throw new Error(`Expected yuv420p, got ${media.pixFmt}`);

const { data: experience, error: expErr } = await supabase
  .from("experiences")
  .select("id, client_id")
  .eq("slug", EXPERIENCE_SLUG)
  .single();
if (expErr || !experience) throw new Error(`Could not load experience: ${expErr?.message}`);

const storagePath = `${experience.client_id}/${experience.id}/${ASSET_ID}/v1/${KEY}`;
const bytes = readFileSync(MP4);
log(`uploading ${(statSync(MP4).size / 1_000_000).toFixed(1)} MB -> ${storagePath}`);

// A direct request rather than supabase.storage.upload().
//
// The client's uploader fails on this file with an opaque "fetch failed" and
// no cause, for both a Buffer and a Blob body. The identical request issued
// by hand - same URL, same headers, same bytes - returns 200 in under five
// seconds, so this is the library's body handling and not the network, the
// bucket (no size limit set) or the key. Storage's object API is one POST;
// going straight at it removes the failure and a dependency at the same time.
// Everything below still goes through supabase-js, where it works.
const uploadResponse = await fetch(
  `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
  {
    method: "POST",
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "video/mp4",
      // Idempotent: a re-run replaces the object instead of colliding.
      "x-upsert": "true",
    },
    body: bytes,
  },
);
if (!uploadResponse.ok) {
  throw new Error(`Upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
}
log("uploaded");

const { error: assetErr } = await supabase.from("media_assets").upsert(
  {
    id: ASSET_ID,
    client_id: experience.client_id,
    experience_id: experience.id,
    media_type: "video",
    role: ROLE,
    storage_path: storagePath,
    mime_type: "video/mp4",
    file_size_bytes: bytes.length,
    width: media.width,
    height: media.height,
    duration_seconds: media.duration,
    processing_status: "ready",
    // Honest: this IS the pilot's placeholder environment, reused everywhere,
    // and the dashboard's "missing media" warning should keep saying so until
    // per-chapter lounges exist.
    is_placeholder: true,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  },
  { onConflict: "id" },
);
if (assetErr) throw new Error(`media_assets upsert failed: ${assetErr.message}`);
log(`registered media_assets ${ASSET_ID}`);

// Every node that presents a decision popup — measured, not assumed.
const { data: choices, error: choiceErr } = await supabase
  .from("choices")
  .select("source_node_id")
  .eq("active", true);
if (choiceErr) throw new Error(`Could not load choices: ${choiceErr.message}`);

const { data: nodes, error: nodeErr } = await supabase
  .from("content_nodes")
  .select("id, internal_name")
  .eq("experience_id", experience.id);
if (nodeErr) throw new Error(`Could not load content_nodes: ${nodeErr.message}`);

const inExperience = new Set(nodes.map((n) => n.id));
const decisionNodeIds = [...new Set(choices.map((c) => c.source_node_id))].filter((id) =>
  inExperience.has(id),
);
log(`${decisionNodeIds.length} decision nodes`);

const { error: attachErr } = await supabase
  .from("content_nodes")
  .update({ video360_asset_id: ASSET_ID })
  .in("id", decisionNodeIds);
if (attachErr) throw new Error(`Attach failed: ${attachErr.message}`);

const { count, error: countErr } = await supabase
  .from("content_nodes")
  .select("id", { count: "exact", head: true })
  .eq("experience_id", experience.id)
  .eq("video360_asset_id", ASSET_ID);
if (countErr) throw new Error(`Verify failed: ${countErr.message}`);

log(`attached to ${count} nodes`);
if (count !== decisionNodeIds.length) {
  throw new Error(`Expected ${decisionNodeIds.length} attached, found ${count}`);
}
log("done");
