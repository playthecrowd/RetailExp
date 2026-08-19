import "server-only";

import { accountPath, cloudflareRequest } from "./client";
import { imagesApiToken } from "./config";
import type { ProviderEnvironment } from "./contracts";

/**
 * Cloudflare Images — direct creator upload and authenticated verification.
 *
 * Verified against official documentation on 18 August 2026:
 *   https://developers.cloudflare.com/images/storage/upload-images/direct-creator-upload/
 *   https://developers.cloudflare.com/api/resources/images/subresources/v2/subresources/direct_uploads/methods/create/
 *   https://developers.cloudflare.com/images/get-started/limits/
 *
 * NO WEBHOOK IS CONSUMED. Cloudflare documents that an Images webhook fires
 * "when an image either successfully uploads or fails to upload", but
 * publishes no payload schema, no signature header, no algorithm, no
 * timestamp and no retry semantics. An unverifiable callback must never
 * mutate the database, so readiness is established by AUTHENTICATED POLLING
 * of the image-details endpoint instead — which is strictly stronger, because
 * it is a request we make with our own credential rather than an unsigned
 * request someone else makes to us.
 *
 * NO UPLOAD-ORIGIN RESTRICTION EXISTS. Unlike Stream's `allowedOrigins`
 * (which governs display, not upload), the Images direct_upload contract has
 * no origin parameter. The real controls are: the one-time URL, its short
 * expiry, server-side authorization before it is minted, and the opaque
 * reference carried in provider-held metadata.
 */

/** Cloudflare's documented default is 30 minutes; the bounds are 2 minutes to
 *  6 hours. Matched to the Phase 4B intent window. */
export const IMAGES_UPLOAD_EXPIRY_MINUTES = 30;

interface DirectUploadResult {
  id: string;
  uploadURL: string;
}

export interface ImageUploadDestination {
  /** One-time URL. Returned to exactly one authorized caller and never
   *  persisted, logged or re-served. */
  uploadUrl: string;
  providerAssetId: string;
  expiresAt: Date;
}

/**
 * Requests a one-time destination.
 *
 * `metadata` carries only the opaque reference and the environment. Cloudflare
 * caps Images metadata at 1024 bytes and states it "is never shared with
 * end-users"; regardless, nothing identifying a visitor is placed in it.
 */
export async function createImageUploadDestination(input: {
  opaqueReference: string;
  environment: ProviderEnvironment;
  expiresAt: Date;
}): Promise<ImageUploadDestination> {
  const form = new FormData();
  form.set("requireSignedURLs", "true");
  // THE REFERENCE TRAVELS TWICE, deliberately.
  //
  // `creator` is a documented optional form-data parameter of this creation
  // request, and `metadata` is documented alongside it. Both carry the same
  // opaque reference so recovery has two independent filters to match on: if
  // one field is ever dropped or truncated, the sweep loses a filter rather
  // than the whole recovery. The list endpoint documents AND logic across
  // filters, so querying both narrows rather than widens.
  form.set("creator", input.opaqueReference);
  form.set("expiry", input.expiresAt.toISOString());
  form.set(
    "metadata",
    JSON.stringify({ ref: input.opaqueReference, env: input.environment }),
  );

  // This endpoint takes multipart form data, not JSON, so it does not go
  // through cloudflareRequest's JSON body path.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4${accountPath("/images/v2/direct_upload")}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${imagesApiToken()}` },
        body: form,
        signal: controller.signal,
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("cloudflare_images_direct_upload_unreachable");
  } finally {
    clearTimeout(timeout);
  }

  const parsed = (await response.json().catch(() => null)) as
    | { success?: boolean; result?: DirectUploadResult }
    | null;

  if (!response.ok || parsed?.success !== true || !parsed.result?.id || !parsed.result?.uploadURL) {
    throw new Error("cloudflare_images_direct_upload_failed");
  }

  return {
    uploadUrl: parsed.result.uploadURL,
    providerAssetId: parsed.result.id,
    expiresAt: input.expiresAt,
  };
}

/** Exactly what the image-details endpoint tells us, and nothing inferred. */
export interface ImageDetails {
  id: string;
  /** Cloudflare removes `draft` once the creator has uploaded. Its ABSENCE is
   *  the authoritative "the image exists" signal. */
  draft: boolean;
  requireSignedURLs: boolean;
  metadata: Record<string, unknown>;
}

export async function getImageDetails(imageId: string): Promise<ImageDetails> {
  const result = await cloudflareRequest<{
    id: string;
    draft?: boolean;
    requireSignedURLs?: boolean;
    meta?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>({
    operation: "images.get",
    token: imagesApiToken(),
    method: "GET",
    path: accountPath(`/images/v1/${encodeURIComponent(imageId)}`),
  });

  return {
    id: result.id,
    // Absent means uploaded. Treating an absent field as `false` is the whole
    // point of the check, so it is written explicitly rather than coerced.
    draft: result.draft === true,
    requireSignedURLs: result.requireSignedURLs === true,
    metadata: result.metadata ?? result.meta ?? {},
  };
}

export async function deleteImage(imageId: string): Promise<"deleted" | "not_found"> {
  try {
    await cloudflareRequest<unknown>({
      operation: "images.delete",
      token: imagesApiToken(),
      method: "DELETE",
      path: accountPath(`/images/v1/${encodeURIComponent(imageId)}`),
    });
    return "deleted";
  } catch (error) {
    // A 404 means the provider is no longer storing it, which is the outcome
    // deletion exists to achieve.
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 404) {
      return "not_found";
    }
    throw error;
  }
}
