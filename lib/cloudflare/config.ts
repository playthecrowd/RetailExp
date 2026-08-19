import "server-only";

import type { ProviderEnvironment } from "./contracts";

/**
 * Cloudflare configuration — server-only, validated, never logged.
 *
 * Same posture as lib/supabase/secret.ts: a missing variable throws naming
 * ONLY the variable. No value is ever returned in an error, interpolated into
 * a message, or measured — not even its length, which would leak whether a
 * credential is present but truncated.
 *
 * Nothing here is prefixed NEXT_PUBLIC_. Every one of these is either a
 * credential or a value that identifies our account, and neither belongs in a
 * browser bundle. scripts/verify-supabase-key-usage.mjs and
 * scripts/verify-admin-auth.mjs both assert that.
 */

/** Every variable this module is permitted to read. Deliberately a closed
 *  union: a typo becomes a compile error rather than a silent undefined. */
export type CloudflareEnvVar =
  | "CLOUDFLARE_ACCOUNT_ID"
  | "CLOUDFLARE_IMAGES_API_TOKEN"
  | "CLOUDFLARE_STREAM_API_TOKEN"
  | "CLOUDFLARE_STREAM_WEBHOOK_SECRET"
  | "CLOUDFLARE_IMAGES_SIGNING_KEY"
  | "CLOUDFLARE_STREAM_SIGNING_KEY_ID"
  | "CLOUDFLARE_STREAM_SIGNING_KEY_PEM"
  | "CLOUDFLARE_IMAGES_DELIVERY_HOST"
  | "CLOUDFLARE_IMAGES_VARIANT"
  | "CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN"
  | "CLOUDFLARE_STREAM_ALLOWED_ORIGINS"
  | "KAMELEON_MEDIA_ENVIRONMENT";

export class CloudflareConfigError extends Error {
  constructor(variable: CloudflareEnvVar, detail: string) {
    super(`Cloudflare configuration error: ${variable} ${detail}.`);
    this.name = "CloudflareConfigError";
  }
}

function readEnv(name: CloudflareEnvVar): string {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length === 0) {
    throw new CloudflareConfigError(
      name,
      "is not set. Set it for this environment in the deployment platform's configuration",
    );
  }
  return value;
}

/**
 * The deployment's own environment.
 *
 * THIS IS THE ROOT OF THE ENVIRONMENT TRUST CHAIN. It is read only here, and
 * only two callers may use it: provider-destination creation (which writes it
 * into the ledger reservation and into provider-held metadata) and validation
 * (which compares provider-held metadata against the ledger). It is never
 * sent to a browser, never accepted from a request, and never passed to the
 * validation RPC — that RPC reads the environment from the ledger row instead.
 *
 * Fail-closed: anything other than exactly "preview" or "production" throws.
 * There is no default, because defaulting would let a misconfigured
 * deployment silently mark its uploads as the wrong environment.
 */
export function mediaEnvironment(): ProviderEnvironment {
  const value = readEnv("KAMELEON_MEDIA_ENVIRONMENT");
  if (value !== "preview" && value !== "production") {
    throw new CloudflareConfigError(
      "KAMELEON_MEDIA_ENVIRONMENT",
      'must be exactly "preview" or "production"',
    );
  }
  return value;
}

export function accountId(): string {
  return readEnv("CLOUDFLARE_ACCOUNT_ID");
}

export function imagesApiToken(): string {
  return readEnv("CLOUDFLARE_IMAGES_API_TOKEN");
}

export function streamApiToken(): string {
  return readEnv("CLOUDFLARE_STREAM_API_TOKEN");
}

export function streamWebhookSecret(): string {
  return readEnv("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
}

export function imagesSigningKey(): string {
  return readEnv("CLOUDFLARE_IMAGES_SIGNING_KEY");
}

export function streamSigningKeyId(): string {
  return readEnv("CLOUDFLARE_STREAM_SIGNING_KEY_ID");
}

export function streamSigningKeyPem(): string {
  return readEnv("CLOUDFLARE_STREAM_SIGNING_KEY_PEM");
}

export function imagesDeliveryHost(): string {
  return readEnv("CLOUDFLARE_IMAGES_DELIVERY_HOST");
}

export function streamCustomerSubdomain(): string {
  return readEnv("CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN");
}

/**
 * Origins Stream will permit the video to be DISPLAYED on.
 *
 * Note what this is not: Cloudflare documents `allowedOrigins` as controlling
 * playback embedding, not where an upload may be posted from. Neither Images
 * nor Stream offers an upload-origin restriction, so this is a delivery
 * control only — see requireSignedDeliveryVariant() and the Images notes.
 */
export function streamAllowedOrigins(): string[] {
  return readEnv("CLOUDFLARE_STREAM_ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * The Images variant used for delivery.
 *
 * This returns a NAME ONLY. Whether that variant is safe to deliver private
 * media through cannot be answered by configuration: an earlier version read a
 * variable that DECLARED the variant safe, which merely let configuration
 * assert what only the account can establish.
 *
 * Safety is verified against Cloudflare in lib/cloudflare/variants.ts and must
 * pass before capture is enabled. See requireSafeDeliveryVariant().
 */
export function imagesDeliveryVariant(): string {
  return readEnv("CLOUDFLARE_IMAGES_VARIANT");
}

/**
 * Whether the Cloudflare webhook path is completely configured.
 *
 * FAIL CLOSED ON PARTIAL CONFIGURATION. A deployment with a Stream token but
 * no webhook secret, or a secret but no account id, must not accept callbacks:
 * it could neither verify a signature nor act on one coherently. The route
 * checks this before touching the request and answers 503 rather than
 * pretending to be a working endpoint.
 */
export function webhookConfigurationComplete(): boolean {
  for (const name of [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_STREAM_API_TOKEN",
    "CLOUDFLARE_STREAM_WEBHOOK_SECRET",
    "KAMELEON_MEDIA_ENVIRONMENT",
  ] as const) {
    const raw = process.env[name];
    if (typeof raw !== "string" || raw.trim().length === 0) return false;
  }
  return true;
}

/**
 * Whether the deletion path is completely configured.
 *
 * A sweep that could reach only one of the two products would delete images
 * and silently skip videos, or the reverse, while reporting a clean run. Both
 * tokens are therefore required even though a given batch may contain only one
 * kind of asset — the run must be able to handle whatever the ledger holds.
 *
 * KAMELEON_MEDIA_ENVIRONMENT is required for a different reason: it is what
 * scopes the sweep to this deployment's own media. Without it there is no safe
 * value to pass, and the listing RPC refuses a missing one rather than
 * defaulting to "all".
 */
export function deletionConfigurationComplete(): boolean {
  for (const name of [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_IMAGES_API_TOKEN",
    "CLOUDFLARE_STREAM_API_TOKEN",
    "KAMELEON_MEDIA_ENVIRONMENT",
  ] as const) {
    const raw = process.env[name];
    if (typeof raw !== "string" || raw.trim().length === 0) return false;
  }
  return true;
}
