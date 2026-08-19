import "server-only";

import { signImageDelivery, signStreamPlayback, signStreamPoster } from "@/lib/cloudflare/signing";
import type { SignedDelivery } from "@/lib/cloudflare/contracts";
import type { CaptureMediaType } from "./limits";

/**
 * Signed delivery for the moderation dashboard and the public Gallery.
 *
 * Every URL is minted per request and returned to exactly one authorized
 * caller. None is persisted, cached, logged, or placed in analytics — a signed
 * URL is a bearer credential for its lifetime, so storing one is equivalent to
 * storing a password.
 *
 * Two audiences, two lifetimes. A reviewer holds a page open while working
 * through a queue; a Gallery visitor loads and watches. Neither needs a URL
 * that outlives the page, and a short lifetime bounds the damage if one leaks
 * through a referrer header, a screenshot or a shared link.
 */

/** Long enough to review an item without re-rendering; short enough that a
 *  leaked URL is stale by the time it travels. */
export const MODERATION_PREVIEW_TTL_SECONDS = 600;

/** Long enough to start and finish a 60-second clip with headroom. */
export const GALLERY_TTL_SECONDS = 900;

export interface DeliveryBundle {
  media: SignedDelivery;
  /** Video only. Images have no separate poster. */
  poster: SignedDelivery | null;
}

async function signFor(
  mediaType: CaptureMediaType,
  providerDeliveryId: string,
  ttlSeconds: number,
): Promise<DeliveryBundle> {
  if (mediaType === "image") {
    return { media: await signImageDelivery(providerDeliveryId, ttlSeconds), poster: null };
  }

  const [media, poster] = await Promise.all([
    signStreamPlayback(providerDeliveryId, ttlSeconds),
    signStreamPoster(providerDeliveryId, ttlSeconds),
  ]);

  return { media: { url: media.url, expiresAt: media.expiresAt }, poster };
}

/**
 * Moderation preview.
 *
 * The caller must already have resolved owner/admin authorization for the
 * submission's client — this function signs, it does not authorize, and it is
 * deliberately not exported through any browser-reachable surface.
 */
export function signModerationPreview(
  mediaType: CaptureMediaType,
  providerDeliveryId: string,
): Promise<DeliveryBundle> {
  return signFor(mediaType, providerDeliveryId, MODERATION_PREVIEW_TTL_SECONDS);
}

/**
 * Public Gallery delivery.
 *
 * Reached only for rows the Production-only gallery view already returned, so
 * a Preview asset can never be signed here: the view's
 * `environment_marker = 'production'` predicate excludes it before this is
 * called.
 */
export function signGalleryDelivery(
  mediaType: CaptureMediaType,
  providerDeliveryId: string,
): Promise<DeliveryBundle> {
  return signFor(mediaType, providerDeliveryId, GALLERY_TTL_SECONDS);
}
