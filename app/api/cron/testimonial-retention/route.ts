import { deletionConfigurationComplete } from "@/lib/cloudflare/config";
import { logProviderEvent } from "@/lib/testimonials/provider-assets";
import { runRetention } from "@/lib/testimonials/cleanup";
import { authorizeCronRequest } from "@/lib/testimonials/retention-core";

/**
 * The scheduled retention sweep.
 *
 * WHAT IT DOES
 *   Deletes provider assets the product will never serve again — superseded
 *   retries, failed attempts, orphans, and the media of submissions whose
 *   retention window has expired — then records that each affected
 *   submission's media is gone. Both halves are in lib/testimonials/cleanup.ts
 *   and lib/testimonials/retention-core.ts; this file is authentication,
 *   configuration and a deadline.
 *
 * WHY IT EXISTS AT ALL
 *   media_purge_after has been set correctly by the lifecycle triggers since
 *   Phase 4A and acted on by nothing. Until this route runs on a schedule, the
 *   retention timelines in the schema are a description of an intention.
 *
 * AUTHENTICATION IS THE SECRET, AND ONLY THE SECRET
 *   Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is
 *   set. `x-vercel-cron` is deliberately NOT consulted: it is a header, and a
 *   header is whatever the caller wrote. The comparison is constant-time and
 *   lives in retention-core.ts so its branches are reachable from a test.
 *
 * NO REQUEST INPUT IS HONOURED. No `?limit=`, no `?environment=`, no body. A
 * caller-supplied batch size is an amplification lever, and the environment
 * must come from the deployment or it is not a boundary at all.
 *
 * NOT BEHIND THE SESSION PROXY. proxy.ts matches only /experience/kameleon/*
 * and /admin/*, so this path is already outside it. Vercel's own cron
 * invocations also bypass Deployment Protection; a manual invocation against a
 * protected Preview needs the protection bypass header IN ADDITION to the
 * bearer, not instead of it.
 *
 * RESPONSE MATRIX
 *   CRON_SECRET missing or empty              -> 503, request not processed
 *   Cloudflare deletion config incomplete     -> 503, nothing deleted
 *   missing / malformed / wrong bearer        -> 401, zero writes
 *   any method other than GET                 -> 405
 *   ran, with any mix of outcomes             -> 200 + counts
 *
 * PER-ASSET FAILURES ARE DATA, NOT A STATUS CODE. Vercel does not retry a
 * failed cron invocation, so answering 500 because three deletions failed
 * would throw away the sixteen that succeeded and change nothing about the
 * three. Failures are counted, logged, and retried on the next run after the
 * database-side backoff.
 *
 * LOGGING. A ledger id, the provider, a safe event name and counts. Never a
 * provider asset id, a submission id, a visitor identifier, a caption, a
 * token, or any part of the Authorization header — including truncated.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Fraction of maxDuration after which no NEW deletion is started. Each
 * provider call is bounded at 10s by cloudflareRequest, so a worst-case batch
 * of 50 would far outrun any platform limit; the deadline is what makes the
 * run resumable instead of truncated. Leftovers are picked up next run.
 */
const DEADLINE_FRACTION = 0.8;

function json(status: number, body: Record<string, string | number | boolean>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const authorization = authorizeCronRequest(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );

  if (authorization === "unconfigured") {
    // Distinguished from 401 on purpose. It tells an operator that the
    // deployment has no scheduler secret — which is what they need to know
    // when a cron appears to run and do nothing — and tells an attacker
    // nothing they can use, since there is no header that opens it.
    logProviderEvent({
      correlationId: "retention",
      provider: "cloudflare",
      event: "cron_unconfigured",
      code: "no_secret",
    });
    return json(503, { error: "unconfigured" });
  }

  if (authorization === "unauthorized") {
    // Nothing about what was presented is logged. Not the header, not its
    // length, not a prefix.
    logProviderEvent({
      correlationId: "retention",
      provider: "cloudflare",
      event: "cron_rejected",
      code: "unauthorized",
    });
    return json(401, { error: "unauthorized" });
  }

  // Checked AFTER authentication, so an unauthenticated caller cannot probe
  // which Cloudflare variables a deployment holds.
  if (!deletionConfigurationComplete()) {
    logProviderEvent({
      correlationId: "retention",
      provider: "cloudflare",
      event: "cron_unconfigured",
      code: "no_provider_config",
    });
    return json(503, { error: "unconfigured" });
  }

  const summary = await runRetention(Date.now() + maxDuration * DEADLINE_FRACTION * 1000);

  return json(200, {
    expired: summary.expired,
    examined: summary.examined,
    deleted: summary.deleted,
    notFound: summary.notFound,
    failed: summary.failed,
    purged: summary.purged,
    purgeRefused: summary.purgeRefused,
    stoppedOnDeadline: summary.stoppedOnDeadline,
    needingAttention: summary.needingAttention,
  });
}

/** Vercel cron issues GET. Anything else is not the scheduler. */
export async function POST(): Promise<Response> {
  return json(405, { error: "method_not_allowed" });
}
