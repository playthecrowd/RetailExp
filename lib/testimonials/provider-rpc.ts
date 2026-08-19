import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A compatibility layer for TWO PROVEN GENERATOR GAPS — nothing else.
 *
 * This is NOT the Phase 4B "pending generated types" shim, which existed only
 * until a migration was applied and was deleted the moment it was. The types
 * here ARE generated and applied. What is missing is expressiveness.
 *
 * WHY POSTGRESQL CANNOT EXPRESS THIS
 *   A PostgreSQL function argument has a TYPE but no nullability: `p_width
 *   integer` accepts NULL and there is no `integer not null` for a parameter.
 *   Column nullability lives in pg_attribute.attnotnull; there is no
 *   equivalent for pg_proc arguments, and none for RETURNS TABLE columns
 *   either. So the catalog Supabase generates from simply does not carry the
 *   fact, and `supabase gen types` emits `p_width: number` and
 *   `submission_id: string` for values that are legitimately null.
 *
 *   Passing NULL is correct behaviour here, not a workaround:
 *     - Cloudflare Images documents NO size, duration or dimensions on its
 *       image-details response, which is exactly why the base table's CHECK
 *       requires that metadata for video only. reconcileImage must pass null.
 *     - The polling path has no provider event, so p_event_id is null.
 *     - A Stream callback without an error carries no error code.
 *     - Both functions return NULL for submission_id (and environment_marker)
 *       on their not-found and not-eligible branches.
 *
 * SCOPE — deliberately two names
 *   Only validate_testimonial_provider_asset and
 *   record_testimonial_provider_progress are affected. The other six Phase 4C
 *   RPCs carry no nullable argument or return, compile against the generated
 *   Database type unchanged, and are called through createSecretClient()
 *   directly. This interface cannot reach them: it is not a general rpc()
 *   escape hatch, and adding a name to it is a visible, reviewable change.
 *
 * EVERY TYPE BELOW IS DERIVED FROM THE GENERATED ONES
 *   Each argument and row type is `Omit<generated, …> & { …the null unions }`,
 *   so a future regeneration that renames or retypes anything breaks the build
 *   here rather than silently drifting. Nothing is retyped by hand, and no
 *   `any`, bare `unknown` or index-signature type appears in any signature.
 */

type Functions = Database["public"]["Functions"];

type ValidateFn = Functions["validate_testimonial_provider_asset"];
type ProgressFn = Functions["record_testimonial_provider_progress"];

/** Images legitimately has no size/dimensions/duration, and polling has no
 *  provider event. Everything else is exactly as generated. */
export type ValidateArgs = Omit<
  ValidateFn["Args"],
  "p_size_bytes" | "p_duration_seconds" | "p_width" | "p_height" | "p_event_id"
> & {
  p_size_bytes: number | null;
  p_duration_seconds: number | null;
  p_width: number | null;
  p_height: number | null;
  p_event_id: string | null;
};

/** Both are NULL on the not-found and not-eligible branches. */
export type ValidateRow = Omit<
  ValidateFn["Returns"][number],
  "submission_id" | "environment_marker"
> & {
  submission_id: string | null;
  environment_marker: string | null;
};

/** A callback without an error carries no code; the state may be absent. */
export type ProgressArgs = Omit<
  ProgressFn["Args"],
  "p_error_code" | "p_event_id" | "p_processing_status"
> & {
  p_error_code: string | null;
  p_event_id: string | null;
  p_processing_status: string | null;
};

/** NULL when the asset is unknown or superseded. */
export type ProgressRow = Omit<ProgressFn["Returns"][number], "submission_id"> & {
  submission_id: string | null;
};

/** The `.single()` shape these two call sites use, and no other method. */
interface SingleRow<TRow> {
  single(): Promise<{ data: TRow | null; error: { message: string } | null }>;
}

/**
 * The complete surface. Two overloads, two RPC names, one method each.
 *
 * There is no generic `rpc(name: string, …)` signature, so this cannot be used
 * to reach any other function — including the six that correctly use the
 * generated types.
 */
export interface NullableArgumentRpc {
  rpc(name: "validate_testimonial_provider_asset", args: ValidateArgs): SingleRow<ValidateRow>;
  rpc(name: "record_testimonial_provider_progress", args: ProgressArgs): SingleRow<ProgressRow>;
}

/**
 * THE ONE TYPE ASSERTION IN THIS FILE, and why it is unavoidable.
 *
 * The value returned is the SAME client createSecretClient() builds — same
 * credential, same server-only boundary, same runtime object. Only the type
 * view is narrowed, because the generated `rpc` overloads reject `null` for
 * arguments PostgreSQL accepts as null but cannot declare as nullable (see the
 * header). There is no type-level way to widen a generated overload without
 * asserting, and no runtime way to detect the difference.
 *
 * It transforms nothing. This function's entire body is a return: no wrapper
 * object, no proxy, no argument rewriting, no response mapping. A value that
 * goes in reaches Supabase exactly as written, and a row that comes back is
 * the row Supabase returned. Anything else would make the assertion a lie the
 * type system could not catch.
 *
 * `server-only` above keeps the whole module out of any browser bundle, and it
 * reads no environment variable itself — the credential boundary stays in
 * lib/supabase/secret.ts, where scripts/verify-supabase-key-usage.mjs checks it.
 */
export function nullableArgumentRpc(): NullableArgumentRpc {
  return createSecretClient() as unknown as NullableArgumentRpc;
}
