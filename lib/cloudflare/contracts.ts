import "server-only";

/**
 * The Cloudflare boundary — TYPES ONLY. Nothing here calls Cloudflare.
 *
 * Phase 4B deliberately stops before the upload step. No credential is read,
 * no request is made, no URL is constructed, no provider identifier is
 * invented, and no mock upload destination is returned. A flow that pretended
 * to upload would produce submissions that look real, occupy the moderation
 * queue, and could not be distinguished later from genuine ones.
 *
 * These interfaces exist so Phase 4C is an implementation of a settled
 * contract rather than a redesign, and so the shape of what will cross this
 * boundary is reviewable now.
 *
 * Verified against official Cloudflare documentation on 18 August 2026:
 *   Images direct creator upload
 *     https://developers.cloudflare.com/images/upload-images/direct-creator-upload/
 *   Images limits
 *     https://developers.cloudflare.com/images/get-started/limits/
 *   Images private/signed delivery
 *     https://developers.cloudflare.com/images/manage-images/serve-images/serve-private-images/
 *   Stream direct creator uploads
 *     https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 *   Stream webhooks
 *     https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 *   Stream signed playback
 *     https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
 *
 * TWO FACTS REMAIN UNVERIFIED and must be settled before 4C, against the docs
 * and then the live account:
 *   1. the permitted range of Stream's `maxDurationSeconds`
 *   2. the authoritative Stream status enum (a search result listed
 *      pendingupload/downloading/queued/inprogress/ready/error, but the pages
 *      actually fetched documented only `ready` and `error`)
 */

/** Which environment a provider asset belongs to. Written as a provider-side
 *  marker so a Preview asset can never be mistaken for a Production one, and
 *  so no bulk operation can cross the boundary by accident. */
export type ProviderEnvironment = "preview" | "production";

/**
 * A one-time destination the BROWSER posts to. Deliberately minimal: the
 * caller receives a URL and nothing else it could persist or leak. The
 * provider's own asset identifier is returned separately and is written to the
 * database by trusted server code only — it never travels to the browser.
 */
export interface DirectUploadDestination {
  /** One-time upload URL. Never stored, never logged, never re-served. */
  uploadUrl: string;
  /** The provider's identifier for the asset being created. SERVER ONLY. */
  providerAssetId: string;
  /** When the destination stops being accepted. */
  expiresAt: Date;
  /** How the browser must send the file. */
  transport: "multipart-post";
  /** The multipart field name. Cloudflare uses `file` for both products. */
  fileFieldName: "file";
}

export interface CreateImageUploadInput {
  submissionId: string;
  environment: ProviderEnvironment;
  /** Cloudflare Images metadata is capped at 1024 bytes. Must never carry
   *  visitor contact data — only opaque correlation values. */
  metadata: Record<string, string>;
  expiresAt: Date;
  requireSignedUrls: true;
}

export interface CreateVideoUploadInput {
  submissionId: string;
  environment: ProviderEnvironment;
  /** Stream enforces this; the browser cannot police duration for a native
   *  camera file input, so this is the real 60-second control. */
  maxDurationSeconds: number;
  creator: string;
  allowedOrigins: readonly string[];
  expiresAt: Date;
  requireSignedUrls: true;
}

/** The result of asking the provider what it actually received — never the
 *  browser's account of it. */
export interface ProviderVerification {
  providerAssetId: string;
  detectedMimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  codec: string | null;
  deliveryReady: boolean;
  posterReady: boolean;
  /** Provider-neutral status string, never a raw payload. */
  processingStatus: string | null;
  errorCode: string | null;
}

/**
 * A webhook that has ALREADY had its signature verified. Constructing one of
 * these is the only way to reach the processing code, so an unverified payload
 * has no path to a database write.
 *
 * Stream signs `Webhook-Signature: time=<unix>,sig1=<hex>` as
 * HMAC-SHA256(secret, `${time}.${rawBody}`). The raw body must be used
 * verbatim — re-serializing parsed JSON changes the bytes and breaks the
 * comparison.
 */
export interface VerifiedProviderEvent {
  provider: string;
  providerEventId: string;
  eventType: string;
  providerAssetId: string | null;
  /** sha256 of the raw body. The payload itself is never stored. */
  payloadHash: string;
  signatureVerifiedAt: Date;
  receivedAt: Date;
  verification: ProviderVerification | null;
}

/** A short-lived signed URL, minted per request and never persisted. */
export interface SignedDelivery {
  url: string;
  expiresAt: Date;
}

/**
 * The full boundary. Phase 4C implements this; Phase 4B only declares it.
 *
 * Every method takes opaque identifiers and returns provider handles that stay
 * server-side. Nothing in this interface accepts a value that originated in a
 * browser, and nothing returns a provider identifier to one.
 */
export interface MediaProvider {
  createImageUpload(input: CreateImageUploadInput): Promise<DirectUploadDestination>;
  createVideoUpload(input: CreateVideoUploadInput): Promise<DirectUploadDestination>;
  verifyUpload(providerAssetId: string, environment: ProviderEnvironment): Promise<ProviderVerification>;
  verifyWebhook(rawBody: string, signatureHeader: string): Promise<VerifiedProviderEvent | null>;
  createSignedPreview(providerDeliveryId: string, ttlSeconds: number): Promise<SignedDelivery>;
  deleteAsset(providerAssetId: string, environment: ProviderEnvironment): Promise<void>;
}

/**
 * Phase 4B has no provider. This is not a stub that returns fake data — it
 * refuses, so any code path that reaches for a provider before 4C fails
 * loudly during development instead of silently fabricating a submission.
 */
export function getMediaProvider(): MediaProvider {
  throw new Error(
    "No media provider is configured. Cloudflare integration lands in Phase 4C; " +
      "testimonial capture must not reach the upload step before then.",
  );
}
