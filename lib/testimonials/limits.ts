/**
 * Approved Phase 4A product limits.
 *
 * These are OUR limits, deliberately tighter than the provider ceilings, and
 * they are shared with the browser so the capture UI can reject an obviously
 * unusable file before anyone waits for an upload.
 *
 * That client-side use is UX ONLY. Every value here is re-checked server-side,
 * and the authoritative decision is the provider's validation plus the
 * database's trusted-valid gate — a caption length or a byte count arriving
 * from a browser is a claim, not a fact.
 *
 * Provider ceilings are recorded next to each limit so the headroom is
 * visible: if someone later raises one of these, they can see immediately
 * whether it is still inside what Cloudflare accepts.
 * Verified against official Cloudflare documentation on 18 August 2026.
 */

export const MEDIA_TYPES = ["image", "video"] as const;
export type CaptureMediaType = (typeof MEDIA_TYPES)[number];

/** Cloudflare Images hard ceiling is 10 MB. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Cloudflare Stream basic (non-TUS) upload ceiling is 200 MB. Staying at
 *  100 MB keeps v1 on a single multipart POST with no resumable-upload
 *  machinery. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Cloudflare Images maximum dimension is 12,000 px per side. */
export const MAX_PHOTO_DIMENSION_PX = 12_000;

/** Enforced by Cloudflare Stream via maxDurationSeconds, not by the browser.
 *  A native camera file input cannot police duration before upload. */
export const MAX_VIDEO_DURATION_SECONDS = 60;

/** Accepted image formats. SVG is deliberately EXCLUDED even though
 *  Cloudflare accepts it: it is scriptable, and no phone camera produces one,
 *  so accepting it would only ever admit something that is not a photo. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** MP4/H.264/AAC is what both iOS and Android produce. WebM is accepted only
 *  once provider validation confirms it decoded — never on the browser's word. */
export const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

/** Characters, counted after NFC normalization and trimming. */
export const MAX_CAPTION_LENGTH = 300;

/** Upload attempts per submission, enforced in the database. */
export const MAX_UPLOAD_ATTEMPTS = 3;

/** Matches testimonial_submissions.upload_expires_at's existing default. */
export const UPLOAD_INTENT_EXPIRY_MINUTES = 30;

/** How long past expiry before a sweeper may mark an intent abandoned. */
export const ABANDON_GRACE_MINUTES = 15;

/** `accept` attribute values for the native capture inputs. */
export const CAPTURE_ACCEPT: Record<CaptureMediaType, string> = {
  image: "image/*",
  video: "video/*",
};

/**
 * `capture` attribute values, per the approved decision.
 *
 * Photo uses the rear camera and video the front camera, because a testimonial
 * is someone speaking to camera while a photo is usually of the bottle or the
 * room. Note that `capture` is a HINT: some browsers ignore it and open a
 * picker instead, which is why the copy never promises a specific camera.
 */
export const CAPTURE_FACING: Record<CaptureMediaType, "environment" | "user"> = {
  image: "environment",
  video: "user",
};

export function maxBytesFor(mediaType: CaptureMediaType): number {
  return mediaType === "image" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
}

export function allowedMimeTypesFor(mediaType: CaptureMediaType): readonly string[] {
  return mediaType === "image" ? ALLOWED_IMAGE_MIME_TYPES : ALLOWED_VIDEO_MIME_TYPES;
}

/** Human-readable size, for UI copy only. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

/**
 * Normalizes a caption exactly the way the server will.
 *
 * Shared so the character counter in the UI cannot disagree with the limit the
 * server enforces — a counter that says 300 while the server trims to 297 is a
 * bug report waiting to happen.
 */
export function normalizeCaption(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

export type CaptionValidation =
  | { status: "valid"; caption: string }
  | { status: "empty" }
  | { status: "too-long"; length: number };

export function validateCaption(raw: string): CaptionValidation {
  const caption = normalizeCaption(raw);
  if (caption.length === 0) return { status: "empty" };
  if (caption.length > MAX_CAPTION_LENGTH) return { status: "too-long", length: caption.length };
  return { status: "valid", caption };
}

export type FileCheck =
  | { status: "ok" }
  | { status: "too-large"; limitBytes: number }
  | { status: "wrong-type"; received: string };

/**
 * A pre-upload sanity check. Rejects the two things a visitor can see and fix
 * immediately. It is not a security control: a File's reported `type` comes
 * from the browser and is trivially wrong or absent, which is exactly why the
 * provider re-detects the real MIME type and the database refuses to mark
 * anything valid without that trusted evidence.
 */
export function checkCapturedFile(mediaType: CaptureMediaType, file: File): FileCheck {
  const limit = maxBytesFor(mediaType);
  if (file.size > limit) return { status: "too-large", limitBytes: limit };

  const allowed = allowedMimeTypesFor(mediaType);
  // An empty type is allowed through: iOS sometimes reports "" for camera
  // captures, and rejecting those would break the primary happy path on the
  // exact device this flow is designed for.
  if (file.type && !allowed.includes(file.type)) {
    return { status: "wrong-type", received: file.type };
  }
  return { status: "ok" };
}
