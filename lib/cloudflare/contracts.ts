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
 *     https://developers.cloudflare.com/images/storage/upload-images/direct-creator-upload/
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
 * PHASE 4C STATUS. This file remains the reviewable shape of the boundary;
 * the implementation lives in sibling modules (client, images, stream,
 * webhook, signing) rather than behind the MediaProvider interface, because
 * the two products differ enough that a single interface hid the differences
 * that matter — Images is polled and has no verifiable webhook, Stream is
 * webhook-driven with authenticated reconciliation.
 *
 * PROVIDER FACTS, ALL THREE NOW VERIFIED against the live account on
 * 19 August 2026. Each was previously a launch blocker.
 *
 *   1. `maxDurationSeconds` REJECTS an over-length upload; it does not
 *      truncate and it is not advisory. A 90-second clip against a 60-second
 *      limit terminated as status.state = "error" with
 *      errorReasonCode = ERR_DURATION_EXCEED_CONSTRAINT. This is the outcome
 *      the design assumed, so the 60-second product limit is enforced at the
 *      provider and needs no post-hoc rejection in reconcileVideo.
 *
 *   2. The Stream thumbnail endpoint DOES honour the playback token. With
 *      requireSignedURLs set, the unsigned thumbnail returned 401 and the
 *      signed one 200 - matching the manifest controls (401 unsigned, 200
 *      signed). Poster images are therefore as private as playback, which is
 *      what the Gallery and the moderation dashboard both depend on.
 *
 *   3. No Images variant carries `neverRequireSignedURLs`. Both `public`
 *      (1366x768) and `kameleongallery` (1600x1600, scale-down, metadata
 *      stripped) return an EXPLICIT false, not an absent field - which also
 *      confirms assessVariantSafety() will pass rather than fail closed on a
 *      missing key.
 *
 * Verified by direct provider probes with capture gates and the consent
 * registry closed; both test assets were deleted and the ledger stayed empty.
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
