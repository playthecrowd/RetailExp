import "server-only";

import { streamWebhookSecret } from "./config";
import {
  verifyStreamSignature,
  type WebhookVerification,
} from "./webhook-core";

/**
 * Server-side wrapper: supplies the secret and the clock to the pure verifier.
 *
 * The verification logic itself lives in webhook-core.ts, which imports no
 * configuration and no `server-only`, so every rejection branch is reachable
 * from a plain Node test with fixtures. This file exists only to bind the
 * secret, which is the one thing a test must not need.
 */
export function verifyStreamWebhook(
  rawBody: Uint8Array,
  signatureHeader: string | null,
): WebhookVerification {
  return verifyStreamSignature(
    rawBody,
    signatureHeader,
    streamWebhookSecret(),
    Math.floor(Date.now() / 1000),
  );
}

export { deriveEventId, WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS } from "./webhook-core";
export type { WebhookRejection, WebhookVerification } from "./webhook-core";
