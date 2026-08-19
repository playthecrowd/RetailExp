/**
 * The reserve → create → attach sequence, as pure orchestration.
 *
 * Every dependency is injected, and this module imports no configuration, no
 * database client and no `server-only`. That is deliberate: the ordering and
 * failure guarantees below are the security-critical part, and they can only
 * be PROVEN by driving each failure with a fake. A version wired directly to
 * the real client could only ever be inspected, not tested.
 *
 * THE GUARANTEES, in the order they are enforced:
 *   1. no provider request happens before the database reservation succeeds
 *   2. a second reservation while one is active cannot produce a destination
 *   3. no upload URL is returned unless the asset was attached to that
 *      reservation
 *   4. if attachment fails, an immediate successful deletion resolves it
 *   5. if deletion fails, the orphan is PERSISTED BEFORE failure is returned
 *   6. the caller never receives an orphaned provider id, or any provider id
 */

export type DestinationOutcome =
  | { ok: true; destination: { uploadUrl: string; expiresAt: string } }
  | { ok: false; reason: DestinationFailure };

export type DestinationFailure =
  | "reservation_refused"
  | "provider_unavailable"
  | "attachment_orphan_deleted"
  | "attachment_orphan_recorded"
  | "attachment_orphan_unrecoverable";

export interface ReservationResult {
  ok: boolean;
  ledgerId?: string;
  opaqueReference?: string;
}

export interface DestinationDeps {
  reserve(): Promise<ReservationResult>;
  createDestination(opaqueReference: string): Promise<{
    providerAssetId: string;
    uploadUrl: string;
  }>;
  attach(ledgerId: string, providerAssetId: string): Promise<{ ok: boolean }>;
  deleteAsset(providerAssetId: string): Promise<"deleted" | "not_found" | "failed">;
  recordOrphan(
    ledgerId: string,
    providerAssetId: string,
    status: "pending" | "failed",
  ): Promise<{ ok: boolean }>;
  markDeleted(ledgerId: string, status: "deleted" | "not_found"): Promise<void>;
  failAttempt(ledgerId: string, reason: string): Promise<void>;
  log(event: string, code?: string): void;
}

export async function runDestinationSequence(
  deps: DestinationDeps,
  expiresAt: Date,
): Promise<DestinationOutcome> {
  // ---- STEP A: reserve ----------------------------------------------------
  // Nothing touches the provider until this succeeds. A refusal here — an
  // exhausted attempt budget, a closed gate, or an attempt that is already
  // active — returns before any asset can exist to orphan.
  const reservation = await deps.reserve();
  if (!reservation.ok || !reservation.ledgerId || !reservation.opaqueReference) {
    return { ok: false, reason: "reservation_refused" };
  }

  const { ledgerId, opaqueReference } = reservation;

  // ---- STEP B: provider ---------------------------------------------------
  let providerAssetId: string;
  let uploadUrl: string;
  try {
    const created = await deps.createDestination(opaqueReference);
    providerAssetId = created.providerAssetId;
    uploadUrl = created.uploadUrl;
  } catch {
    // No identifier reached us, so there is nothing local to record. The
    // ambiguous case — provider created an asset but the response was lost —
    // is resolved by the reference-based recovery sweep, not here.
    await deps.failAttempt(ledgerId, "provider_create_failed");
    deps.log("destination_create_failed");
    return { ok: false, reason: "provider_unavailable" };
  }

  // ---- STEP C: attach -----------------------------------------------------
  const attachment = await deps.attach(ledgerId, providerAssetId);

  if (!attachment.ok) {
    // The provider created an asset and we could not record it normally. The
    // identifier is in memory and this is the only moment it will ever be, so
    // it is never discarded.
    let deletion: "deleted" | "not_found" | "failed";
    try {
      deletion = await deps.deleteAsset(providerAssetId);
    } catch {
      deletion = "failed";
    }

    if (deletion === "deleted" || deletion === "not_found") {
      // Resolved: the provider is no longer storing it.
      await deps.recordOrphan(ledgerId, providerAssetId, "pending");
      await deps.markDeleted(ledgerId, deletion);
      deps.log("attachment_failed", "orphan_deleted");
      return { ok: false, reason: "attachment_orphan_deleted" };
    }

    // Deletion failed or was indeterminate. The identifier MUST be persisted
    // before this function returns, or it is lost for good.
    const recorded = await deps.recordOrphan(ledgerId, providerAssetId, "failed");
    const reason = recorded.ok
      ? "attachment_orphan_recorded"
      : "attachment_orphan_unrecoverable";
    deps.log("attachment_failed", reason);
    return { ok: false, reason };
  }

  // Only now — reserved, created AND attached — may a URL be handed back. Note
  // what is NOT returned: the provider asset id never leaves the server.
  deps.log("destination_created");
  return {
    ok: true,
    destination: { uploadUrl, expiresAt: expiresAt.toISOString() },
  };
}
