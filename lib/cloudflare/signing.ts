import "server-only";

import { createHmac, createSign } from "node:crypto";

import {
  imagesDeliveryHost,
  imagesSigningKey,
  streamCustomerSubdomain,
  streamSigningKeyId,
  streamSigningKeyPem,
} from "./config";
import { requireSafeDeliveryVariant } from "./variants";
import type { SignedDelivery } from "./contracts";

/**
 * Signed delivery for both products.
 *
 * Every URL produced here is minted per request and returned to exactly one
 * authorized caller. None is persisted, cached, logged, or included in
 * analytics — a signed URL is a bearer credential for the duration of its
 * lifetime, and storing one is equivalent to storing a password.
 *
 * Verified against official documentation on 18 August 2026:
 *   https://developers.cloudflare.com/images/manage-images/serve-images/serve-private-images/
 *   https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
 */

/** Short by default. The moderation dashboard re-mints on each render, and the
 *  Gallery re-mints per page load, so a long lifetime buys nothing and only
 *  widens the window if a URL leaks through a referrer or a screenshot. */
export const DEFAULT_SIGNED_TTL_SECONDS = 300;

/**
 * Images signed URL.
 *
 * Cloudflare signs `url.pathname + "?" + url.searchParams.toString()` with
 * HMAC-SHA256 and appends `exp` and `sig`.
 *
 * The variant is resolved through requireSafeDeliveryVariant(), which asks
 * the ACCOUNT whether that variant sets `neverRequireSignedURLs` — Cloudflare
 * documents that flag as letting a variant "access an image without a
 * signature, regardless of image access control", so it would silently defeat
 * every signature this function produces. An unverifiable variant throws
 * rather than delivering.
 */
export async function signImageDelivery(
  imageId: string,
  ttlSeconds: number = DEFAULT_SIGNED_TTL_SECONDS,
): Promise<SignedDelivery> {
  const variant = await requireSafeDeliveryVariant();
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;

  const url = new URL(
    `https://${imagesDeliveryHost()}/${encodeURIComponent(imageId)}/${encodeURIComponent(variant)}`,
  );
  url.searchParams.set("exp", String(expiry));

  const signature = createHmac("sha256", imagesSigningKey())
    .update(`${url.pathname}?${url.searchParams.toString()}`, "utf8")
    .digest("hex");

  url.searchParams.set("sig", signature);

  return { url: url.toString(), expiresAt: new Date(expiry * 1000) };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Stream signed playback token.
 *
 * Self-signed with the account signing key rather than calling the `/token`
 * endpoint: Cloudflare documents both, and self-signing avoids a network
 * round trip on every render of the moderation queue. Claims used are the
 * documented ones — `sub`, `kid`, `exp`, `nbf`.
 *
 * `downloadable` is deliberately NOT set. A downloadable token would let a
 * reviewer or Gallery visitor retrieve the original MP4, which is a wider
 * grant than viewing needs.
 */
export async function signStreamPlayback(
  uid: string,
  ttlSeconds: number = DEFAULT_SIGNED_TTL_SECONDS,
): Promise<SignedDelivery & { token: string }> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + ttlSeconds;
  const keyId = streamSigningKeyId();

  const header = base64url(JSON.stringify({ alg: "RS256", kid: keyId }));
  const payload = base64url(
    JSON.stringify({ sub: uid, kid: keyId, exp: expiry, nbf: now - 5 }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();

  // The PEM is stored base64-encoded in configuration, matching how Cloudflare
  // returns it from the keys endpoint.
  const pem = Buffer.from(streamSigningKeyPem(), "base64").toString("utf8");
  const signature = base64url(signer.sign(pem));

  const token = `${header}.${payload}.${signature}`;

  return {
    token,
    // Cloudflare substitutes the token for the video id in playback URLs.
    url: `https://${streamCustomerSubdomain()}/${token}/manifest/video.m3u8`,
    expiresAt: new Date(expiry * 1000),
  };
}

/**
 * Stream poster/thumbnail.
 *
 * VERIFIED against the live account on 19 August 2026: the thumbnail endpoint
 * DOES honour the playback token. With requireSignedURLs set, the unsigned
 * thumbnail returned 401 and the signed one 200, alongside manifest controls
 * of 401 unsigned and 200 signed.
 *
 * The documentation still does not state this, which is why it was probed
 * rather than assumed. It matters because the Gallery and the moderation
 * dashboard both render posters: had thumbnails been public, every submission
 * would have had a permanently unauthenticated preview frame regardless of how
 * carefully playback was signed.
 */
export async function signStreamPoster(
  uid: string,
  ttlSeconds: number = DEFAULT_SIGNED_TTL_SECONDS,
): Promise<SignedDelivery> {
  const { token, expiresAt } = await signStreamPlayback(uid, ttlSeconds);
  return {
    url: `https://${streamCustomerSubdomain()}/${token}/thumbnails/thumbnail.jpg`,
    expiresAt,
  };
}
