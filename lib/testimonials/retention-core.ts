import { timingSafeEqual } from "node:crypto";

/**
 * Retention enforcement — PURE.
 *
 * Deliberately has no `server-only` import, reads no configuration and calls
 * no provider: the database, Cloudflare, the clock and the logger all arrive
 * as parameters. That is what makes every failure branch below reachable from
 * a plain Node test with fakes, which is the only way a deletion path gets
 * genuinely exercised rather than assumed. The same reasoning as
 * lib/cloudflare/webhook-core.ts and lib/testimonials/destination-sequence.ts.
 *
 * WHAT THIS SOLVES
 *   media_purge_after has been set correctly by the lifecycle triggers since
 *   Phase 4A, and nothing has ever acted on it. A retention timeline that is
 *   recorded but never executed is worse than none: it reads as a promise in
 *   the schema and in any Privacy page derived from it.
 *
 * TWO TIERS, IN THIS ORDER, ALWAYS
 *   1. The LEDGER sweep deletes provider assets and records each outcome.
 *   2. The SUBMISSION purge records that a submission's media is gone.
 *
 *   Tier 2 must never run ahead of tier 1. A submission marked purged while a
 *   provider asset survives is a false record of a deletion — the one failure
 *   mode a retention statement cannot survive. The database refuses it too
 *   (record_testimonial_media_purged raises 55000), so this ordering is belt
 *   and braces rather than the only guard.
 */

/** The RPC clamps to 200; 50 is its default and comfortably fits one run. */
export const SWEEP_BATCH = 50;
export const PURGE_BATCH = 50;

/**
 * Attempts after which a row is worth a human look. Nothing branches on this
 * — the row keeps being retried on its normal backoff — it only decides
 * whether a line is logged loudly enough to notice.
 */
export const ATTEMPT_ALERT_THRESHOLD = 10;

export type DeletionOutcome = "deleted" | "not_found" | "failed";

export interface DeletableAsset {
  ledgerId: string;
  provider: string;
  providerAssetId: string;
  reason: string;
  deletionAttemptCount: number;
}

export interface PurgeableSubmission {
  submissionId: string;
  providerAssetsSeen: number;
}

export interface RetentionDeps {
  listDeletable(limit: number): Promise<DeletableAsset[]>;
  /** Marks the START of an attempt (`pending`) or its outcome. */
  markAttempt(ledgerId: string, status: "pending" | DeletionOutcome): Promise<void>;
  /** Resolves to the provider's answer; throws for anything else. */
  deleteAsset(provider: string, providerAssetId: string): Promise<"deleted" | "not_found">;
  listPurgeable(limit: number): Promise<PurgeableSubmission[]>;
  recordPurged(submissionId: string, status: "deleted" | "none"): Promise<void>;
  /** Sanitized. Never a provider asset id, submission id or contact value. */
  log(event: string, code?: string, ledgerId?: string): void;
  /** Injectable so the deadline is testable without waiting. */
  now(): number;
}

export interface RetentionSummary {
  examined: number;
  deleted: number;
  notFound: number;
  failed: number;
  purged: number;
  purgeRefused: number;
  /** True when the wall-clock budget ran out with work still listed. */
  stoppedOnDeadline: boolean;
  /** Rows past ATTEMPT_ALERT_THRESHOLD, seen this run. */
  needingAttention: number;
}

const EMPTY: RetentionSummary = {
  examined: 0,
  deleted: 0,
  notFound: 0,
  failed: 0,
  purged: 0,
  purgeRefused: 0,
  stoppedOnDeadline: false,
  needingAttention: 0,
};

/**
 * One sweep.
 *
 * NO RETRY WITHIN A RUN, and that is a decision rather than an omission. The
 * dominant failure modes are a provider outage and a timeout, neither of which
 * resolves inside the seconds an in-request retry would spend — it would burn
 * the budget on exactly the assets least likely to benefit while starving ones
 * that would have succeeded. A failure is recorded, the row stays eligible,
 * and the next scheduled run picks it up after its backoff.
 *
 * IDEMPOTENT ACROSS RUNS
 *   `not_found` counts as success: the goal is that the provider is no longer
 *   storing the asset, and a 404 proves that as well as a 200 does. A crash
 *   between the pending mark and the outcome mark leaves the row visibly
 *   in-progress, and the next run resolves it as deleted or 404.
 *
 * @param deadlineMs absolute epoch-ms after which no NEW deletion is started.
 *        Work already begun is always finished and recorded.
 */
export async function runRetentionSweep(
  deps: RetentionDeps,
  deadlineMs: number,
): Promise<RetentionSummary> {
  const summary: RetentionSummary = { ...EMPTY };

  const deletable = await deps.listDeletable(SWEEP_BATCH);

  for (const asset of deletable) {
    // Checked BEFORE the pending mark, so a row we never touch is not left
    // looking as though an attempt was made against it.
    if (deps.now() >= deadlineMs) {
      summary.stoppedOnDeadline = true;
      deps.log("retention_deadline", `remaining=${deletable.length - summary.examined}`);
      break;
    }

    if (asset.deletionAttemptCount >= ATTEMPT_ALERT_THRESHOLD) {
      summary.needingAttention += 1;
      deps.log("retention_attention", `attempts=${asset.deletionAttemptCount}`, asset.ledgerId);
    }

    summary.examined += 1;

    // Marked pending first, so an asset whose deletion crashes mid-flight is
    // visibly in progress rather than silently untouched — and so the backoff
    // window starts even if this process dies before recording an outcome.
    await deps.markAttempt(asset.ledgerId, "pending");

    let outcome: DeletionOutcome;
    try {
      outcome = await deps.deleteAsset(asset.provider, asset.providerAssetId);
    } catch {
      outcome = "failed";
    }

    if (outcome === "deleted") summary.deleted += 1;
    else if (outcome === "not_found") summary.notFound += 1;
    else summary.failed += 1;

    await deps.markAttempt(asset.ledgerId, outcome);
    deps.log("retention_cleanup", `${asset.reason}:${outcome}`, asset.ledgerId);
  }

  // ---- Tier 2, strictly after tier 1 --------------------------------------
  //
  // Eligibility is re-evaluated in SQL rather than inferred from the counters
  // above: a concurrent run may have finished a submission this one did not
  // touch, and a reservation may have appeared since the listing.
  const purgeable = await deps.listPurgeable(PURGE_BATCH);

  for (const submission of purgeable) {
    try {
      await deps.recordPurged(
        submission.submissionId,
        submission.providerAssetsSeen === 0 ? "none" : "deleted",
      );
      summary.purged += 1;
    } catch {
      // The database refused — almost certainly a provider asset appeared
      // between the listing and this call. Correct behaviour: leave the
      // submission unpurged and try again next run.
      summary.purgeRefused += 1;
      deps.log("retention_purge_refused");
    }
  }

  deps.log(
    "retention_sweep",
    `examined=${summary.examined} deleted=${summary.deleted} notfound=${summary.notFound}` +
      ` failed=${summary.failed} purged=${summary.purged} refused=${summary.purgeRefused}`,
  );

  return summary;
}

// ---------------------------------------------------------------------------
// Scheduler authentication
// ---------------------------------------------------------------------------

export type CronAuthorization = "ok" | "unconfigured" | "unauthorized";

const BEARER = "Bearer ";

/**
 * Constant-time comparison. Lengths are checked first because timingSafeEqual
 * throws on a mismatch, and a secret's length is not the secret.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Authorizes a scheduled invocation.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when that variable is
 * set. Two deliberate deviations from the documented example:
 *
 *   1. The comparison is constant-time. Vercel's sample uses `!==`. The leak
 *      is marginal, but this codebase already compares webhook signatures in
 *      constant time and an inconsistency here is not worth defending later.
 *
 *   2. `x-vercel-cron` is NOT consulted, here or in the route. It is a header,
 *      and headers are supplied by whoever is calling. The secret is the only
 *      thing that authenticates anything.
 *
 * FAILS CLOSED. A missing, empty or whitespace-only secret returns
 * `unconfigured` for EVERY header, including one that would otherwise match —
 * there is no value of the header that opens an unconfigured deployment.
 */
export function authorizeCronRequest(
  header: string | null | undefined,
  secret: string | null | undefined,
): CronAuthorization {
  if (typeof secret !== "string" || secret.trim().length === 0) return "unconfigured";
  if (typeof header !== "string" || !header.startsWith(BEARER)) return "unauthorized";
  return constantTimeEquals(header.slice(BEARER.length), secret) ? "ok" : "unauthorized";
}
