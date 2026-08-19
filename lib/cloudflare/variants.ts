/**
 * Images delivery-variant safety — PURE assessment plus a server-side fetch.
 *
 * WHY CONFIGURATION CANNOT ANSWER THIS
 *   An earlier version read an environment variable that DECLARED whether the
 *   variant bypassed signed URLs. That is not a security control: it lets
 *   configuration assert the account is safe, and a wrong or stale assertion
 *   reads exactly like a correct one. The account is the only authority.
 *
 * WHAT MAKES A VARIANT UNSAFE
 *   Cloudflare documents `requireSignedURLs` on the IMAGE, and a separate
 *   per-variant `neverRequireSignedURLs`: "Indicates whether the variant can
 *   access an image without a signature, REGARDLESS of image access control."
 *
 *   So a single variant carrying that flag makes every image served through it
 *   public, no matter what we set per image. Signed delivery would appear to
 *   work while protecting nothing.
 *
 * FAIL CLOSED
 *   Safe only on an explicit `neverRequireSignedURLs === false`. Missing,
 *   malformed, unreachable or ambiguous all resolve to unsafe, because an
 *   answer we could not verify is not an answer.
 *
 * The assessment below is pure and fixture-tested. No Cloudflare call is made
 * in this phase.
 */

export type VariantSafety =
  | { safe: true; variantId: string }
  | { safe: false; reason: VariantUnsafeReason; variantId: string };

export type VariantUnsafeReason =
  | "signed_urls_bypassed"
  | "variant_not_found"
  | "malformed_response"
  | "unverifiable";

/**
 * Assesses a Cloudflare variant-details response.
 *
 * @param variantId the variant we intend to deliver through
 * @param body the parsed response body, or null when the call failed
 * @param httpStatus the response status, or null when the call never completed
 */
export function assessVariantSafety(
  variantId: string,
  body: unknown,
  httpStatus: number | null,
): VariantSafety {
  if (httpStatus === null) {
    return { safe: false, reason: "unverifiable", variantId };
  }
  if (httpStatus === 404) {
    return { safe: false, reason: "variant_not_found", variantId };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { safe: false, reason: "unverifiable", variantId };
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { safe: false, reason: "malformed_response", variantId };
  }

  const envelope = body as { success?: unknown; result?: unknown };
  if (envelope.success !== true) {
    return { safe: false, reason: "unverifiable", variantId };
  }

  const result = envelope.result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { safe: false, reason: "malformed_response", variantId };
  }

  const variant = (result as { variant?: unknown }).variant;
  if (variant === null || typeof variant !== "object" || Array.isArray(variant)) {
    return { safe: false, reason: "malformed_response", variantId };
  }

  const record = variant as { id?: unknown; neverRequireSignedURLs?: unknown };

  // The variant we were told about must be the variant we asked about.
  if (typeof record.id !== "string" || record.id !== variantId) {
    return { safe: false, reason: "malformed_response", variantId };
  }

  const bypass = record.neverRequireSignedURLs;

  // Explicit true is the dangerous case.
  if (bypass === true) {
    return { safe: false, reason: "signed_urls_bypassed", variantId };
  }

  // Explicit false is the ONLY safe answer. Absent or any other type means the
  // account did not tell us, and an unanswered question is not a safe one.
  if (bypass !== false) {
    return { safe: false, reason: "malformed_response", variantId };
  }

  return { safe: true, variantId };
}

/** Human-readable, safe to log and safe to surface in a setup check. */
export function describeVariantSafety(safety: VariantSafety): string {
  if (safety.safe) return `variant ${safety.variantId} requires signed URLs`;
  switch (safety.reason) {
    case "signed_urls_bypassed":
      return `variant ${safety.variantId} sets neverRequireSignedURLs and would serve private media publicly`;
    case "variant_not_found":
      return `variant ${safety.variantId} does not exist in this account`;
    case "malformed_response":
      return `variant ${safety.variantId} returned a response that does not state its signed-URL setting`;
    case "unverifiable":
      return `variant ${safety.variantId} could not be verified against the account`;
  }
}

/**
 * Verifies the configured delivery variant against the account.
 *
 * Server-only by dynamic import, so the pure assessment above stays testable
 * from plain Node. No Cloudflare call happens in this phase: this is the
 * contract the deployment setup check and the delivery path will use once
 * credentials exist.
 *
 * Result is intentionally NOT cached across requests here. A variant can be
 * reconfigured in the dashboard at any time, and a cached "safe" answer would
 * outlive the fact it was based on.
 */
export async function verifyDeliveryVariant(): Promise<VariantSafety> {
  const { accountPath } = await import("./client");
  const { imagesApiToken, imagesDeliveryVariant } = await import("./config");

  const variantId = imagesDeliveryVariant();

  let status: number | null = null;
  let body: unknown = null;
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4${accountPath(`/images/v1/variants/${encodeURIComponent(variantId)}`)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${imagesApiToken()}` },
        cache: "no-store",
      },
    );
    status = response.status;
    body = await response.json().catch(() => null);
  } catch {
    return assessVariantSafety(variantId, null, null);
  }

  return assessVariantSafety(variantId, body, status);
}

/**
 * The gate. Throws unless the account confirms the variant enforces signed
 * URLs, so an unverifiable variant blocks delivery rather than silently
 * serving private media through a bypassing variant.
 */
export async function requireSafeDeliveryVariant(): Promise<string> {
  const safety = await verifyDeliveryVariant();
  if (!safety.safe) {
    throw new Error(`Cloudflare Images delivery refused: ${describeVariantSafety(safety)}.`);
  }
  return safety.variantId;
}
