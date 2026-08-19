import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";

/**
 * TEMPORARY. Delete this file once types are regenerated.
 *
 * WHY IT EXISTS
 *   20260821090000_stakeholder_pilot_schema.sql adds three functions and
 *   changes the signature of two more. `supabase gen types` reads the LIVE
 *   database, so none of that can appear in lib/supabase/database.types.ts
 *   until the migration is applied — and applying it is deliberately gated on
 *   an explicit go-ahead. Without this shim the retention runtime could not be
 *   written until then, which would serialise work that has no reason to be
 *   serialised.
 *
 *   This is the same situation as the Phase 4B `PendingRpcClient`, and it gets
 *   the same treatment: a narrow, named, temporary surface that is deleted in
 *   one commit the moment the generator can speak for itself. It is NOT the
 *   situation lib/testimonials/provider-rpc.ts addresses — that one is
 *   permanent, because PostgreSQL genuinely cannot express argument
 *   nullability and no amount of regeneration will fix it.
 *
 * REMOVAL, CONCRETELY
 *   1. Apply the migration.
 *   2. Regenerate lib/supabase/database.types.ts.
 *   3. Delete this file and import createSecretClient() directly in
 *      lib/testimonials/cleanup.ts — the call sites need no other change,
 *      because the shapes below are exactly what the generator will produce.
 *
 * WHAT KEEPS IT HONEST IN THE MEANTIME
 *   Five names, five shapes, no generic `rpc(name: string, …)` overload — so
 *   it cannot be used to reach any other function, and adding a name is a
 *   visible change in review. Every type is written to match the migration's
 *   RETURNS TABLE exactly; if the generator later disagrees, step 3 turns that
 *   disagreement into a compile error rather than a silent drift.
 *
 *   `server-only` keeps it out of every browser bundle, and it reads no
 *   environment variable itself: the credential boundary stays in
 *   lib/supabase/secret.ts where verify-supabase-key-usage.mjs checks it.
 */

export type MediaEnvironmentArg = "preview" | "production";

export interface DeletableAssetRow {
  ledger_id: string;
  provider: string;
  provider_asset_id: string;
  environment_marker: string;
  reason: string;
  deletion_attempt_count: number;
}

export interface MarkDeletedRow {
  ledger_id: string;
  deletion_status: string;
  deletion_attempt_count: number;
}

export interface PurgeableSubmissionRow {
  submission_id: string;
  environment_marker: string | null;
  provider_assets_seen: number;
}

export interface MediaPurgedRow {
  submission_id: string;
  media_deleted_at: string;
  provider_deletion_status: string;
}

export interface PurgeNowRow {
  submission_id: string;
  media_purge_after: string;
}

interface SetResult<TRow> {
  then<TResult>(
    onfulfilled: (value: { data: TRow[] | null; error: { message: string } | null }) => TResult,
  ): Promise<TResult>;
}

interface SingleResult<TRow> {
  single(): Promise<{ data: TRow | null; error: { message: string } | null }>;
}

/**
 * The complete surface. Nothing generic, nothing open-ended.
 */
export interface PendingSchemaRpc {
  rpc(
    name: "list_deletable_testimonial_provider_assets",
    args: { p_environment: MediaEnvironmentArg; p_limit: number },
  ): SetResult<DeletableAssetRow>;

  rpc(
    name: "list_purgeable_testimonial_submissions",
    args: { p_environment: MediaEnvironmentArg; p_limit: number },
  ): SetResult<PurgeableSubmissionRow>;

  rpc(
    name: "mark_testimonial_provider_asset_deleted",
    args: { p_ledger_id: string; p_status: "pending" | "deleted" | "not_found" | "failed" },
  ): SingleResult<MarkDeletedRow>;

  rpc(
    name: "record_testimonial_media_purged",
    args: { p_submission_id: string; p_status: "deleted" | "not_found" | "none" },
  ): SingleResult<MediaPurgedRow>;

  rpc(
    name: "purge_testimonial_media_now",
    args: { p_submission_id: string; p_reason: "visitor_withdrawal" | "underage_submitter" },
  ): SingleResult<PurgeNowRow>;
}

/**
 * The same client createSecretClient() builds — same credential, same
 * server-only boundary, same runtime object. Only the type view differs, and
 * this function's entire body is a return: no wrapper, no proxy, no argument
 * rewriting, no response mapping. A value that goes in reaches Supabase
 * exactly as written.
 */
export function pendingSchemaRpc(): PendingSchemaRpc {
  return createSecretClient() as unknown as PendingSchemaRpc;
}
