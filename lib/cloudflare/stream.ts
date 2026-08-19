import "server-only";

import { accountPath, cloudflareRequest } from "./client";
import { streamAllowedOrigins, streamApiToken } from "./config";
import type { ProviderEnvironment } from "./contracts";
import { MAX_VIDEO_DURATION_SECONDS } from "@/lib/testimonials/limits";

/**
 * Cloudflare Stream — direct creator upload and authenticated reconciliation.
 *
 * Verified against official documentation on 18 August 2026:
 *   https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 *   https://developers.cloudflare.com/api/resources/stream/subresources/direct_upload/methods/create/
 *   https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/
 *
 * WHY NO tus. Cloudflare requires tus only "to upload a video that is over
 * 200 MB"; below that a single multipart POST is supported, and tus is merely
 * recommended for unreliable connections. Our product limit is 100 MB, so the
 * basic path is sufficient and tus is deliberately not implemented — it would
 * add a client-side protocol implementation and a second upload surface for
 * no capability we need. If the size limit is ever raised past 200 MB, tus
 * becomes mandatory and this decision must be revisited.
 */

interface DirectUploadResult {
  uid: string;
  uploadURL: string;
}

export interface VideoUploadDestination {
  uploadUrl: string;
  providerAssetId: string;
  expiresAt: Date;
}

/**
 * `maxDurationSeconds` is REQUIRED by Cloudflare and is the only real duration
 * control: a browser cannot police the length of a file chosen from a native
 * camera input, and any duration the browser reports is spoofable.
 *
 * Cloudflare documents no minimum or maximum for this parameter, so the value
 * is ours. Its enforcement was VERIFIED against the live account on
 * 19 August 2026: a 90-second upload against a 60-second limit terminated as
 * status.state = "error" with errorReasonCode = ERR_DURATION_EXCEED_CONSTRAINT.
 * It rejects rather than truncating, so the product's 60-second limit holds at
 * the provider and reconcileVideo needs no duration check of its own.
 *
 * `creator` carries the opaque reference. Cloudflare describes it as "a
 * user-defined identifier for the media creator" and echoes it back on the
 * webhook, which is exactly the correlation channel we need — and it is never
 * a visitor identifier.
 */
export async function createVideoUploadDestination(input: {
  opaqueReference: string;
  environment: ProviderEnvironment;
  expiresAt: Date;
}): Promise<VideoUploadDestination> {
  const result = await cloudflareRequest<DirectUploadResult>({
    operation: "stream.direct_upload",
    token: streamApiToken(),
    method: "POST",
    path: accountPath("/stream/direct_upload"),
    body: {
      maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
      expiry: input.expiresAt.toISOString(),
      requireSignedURLs: true,
      creator: input.opaqueReference,
      // Display control only — Cloudflare documents allowedOrigins as the
      // origins allowed to DISPLAY the video, not to upload it.
      allowedOrigins: streamAllowedOrigins(),
      meta: { ref: input.opaqueReference, env: input.environment },
    },
  });

  if (!result?.uid || !result?.uploadURL) {
    throw new Error("cloudflare_stream_direct_upload_failed");
  }

  return {
    uploadUrl: result.uploadURL,
    providerAssetId: result.uid,
    expiresAt: input.expiresAt,
  };
}

/** The documented Stream processing states. `live-inprogress` is included so
 *  it can be explicitly rejected rather than silently treated as unknown. */
export const STREAM_STATES = [
  "pendingupload",
  "downloading",
  "queued",
  "inprogress",
  "ready",
  "error",
  "live-inprogress",
] as const;
export type StreamState = (typeof STREAM_STATES)[number];

export function isStreamState(value: unknown): value is StreamState {
  return typeof value === "string" && (STREAM_STATES as readonly string[]).includes(value);
}

export interface VideoDetails {
  uid: string;
  readyToStream: boolean;
  state: StreamState | null;
  /** Documented: a video in `ready` "may still be encoding certain quality
   *  levels until the pctComplete reaches 100". */
  pctComplete: number | null;
  errorReasonCode: string | null;
  requireSignedURLs: boolean;
  durationSeconds: number | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  creator: string | null;
  meta: Record<string, unknown>;
}

/** Cloudflare returns pctComplete as a string in some responses. Parsed
 *  defensively: anything non-finite becomes null rather than 0, so a missing
 *  value can never read as "not complete but present". */
export function parsePctComplete(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberOrNull(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function normalizeVideo(result: Record<string, unknown>): VideoDetails {
  const status = (result.status ?? {}) as Record<string, unknown>;
  const input = (result.input ?? {}) as Record<string, unknown>;
  const meta = (result.meta ?? {}) as Record<string, unknown>;

  return {
    uid: typeof result.uid === "string" ? result.uid : "",
    readyToStream: result.readyToStream === true,
    state: isStreamState(status.state) ? status.state : null,
    pctComplete: parsePctComplete(status.pctComplete),
    errorReasonCode:
      typeof status.errorReasonCode === "string" && status.errorReasonCode.length > 0
        ? status.errorReasonCode
        : null,
    requireSignedURLs: result.requireSignedURLs === true,
    durationSeconds: numberOrNull(result.duration),
    sizeBytes: numberOrNull(result.size),
    width: numberOrNull(input.width),
    height: numberOrNull(input.height),
    creator: typeof result.creator === "string" ? result.creator : null,
    meta,
  };
}

export async function getVideoDetails(uid: string): Promise<VideoDetails> {
  const result = await cloudflareRequest<Record<string, unknown>>({
    operation: "stream.get",
    token: streamApiToken(),
    method: "GET",
    path: accountPath(`/stream/${encodeURIComponent(uid)}`),
  });
  return normalizeVideo(result);
}

export async function deleteVideo(uid: string): Promise<"deleted" | "not_found"> {
  try {
    await cloudflareRequest<unknown>({
      operation: "stream.delete",
      token: streamApiToken(),
      method: "DELETE",
      path: accountPath(`/stream/${encodeURIComponent(uid)}`),
    });
    return "deleted";
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 404) {
      return "not_found";
    }
    throw error;
  }
}
