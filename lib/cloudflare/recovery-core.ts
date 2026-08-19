/**
 * Orphan recovery — PURE, paginated, and fail-closed.
 *
 * WHAT THIS IS FOR
 *   If a create call times out, Cloudflare may hold an asset whose identifier
 *   never reached us. The opaque reference we generated BEFORE the call is the
 *   only thing both sides share, so recovery means asking the provider what it
 *   holds for that reference.
 *
 * THE REFERENCE TRAVELS TWICE, ON BOTH PRODUCTS
 *   `creator` is a documented optional form-data parameter of the Images v2
 *   direct-upload creation request, alongside `metadata`; Stream documents
 *   `creator` on its own direct-upload creation request. We set BOTH channels
 *   on both products as defence in depth: a single dropped or truncated field
 *   then costs a filter, not the whole recovery.
 *
 *   Images recovery queries BOTH filters together, which the list endpoint
 *   documents as AND logic:
 *       creator=<ref>
 *       meta.ref[eq:string]=<ref>
 *
 *   Sources (accessed 18 August 2026):
 *     https://developers.cloudflare.com/api/resources/images/subresources/v2/subresources/direct_uploads/methods/create/
 *     https://developers.cloudflare.com/images/storage/upload-images/direct-creator-upload/
 *     https://developers.cloudflare.com/api/resources/images/subresources/v2/methods/list/
 *     https://developers.cloudflare.com/api/resources/stream/subresources/direct_upload/methods/create/
 *     https://developers.cloudflare.com/api/resources/stream/methods/list/
 *
 * THE PROVIDER'S FILTER IS NOT THE AUTHORITY
 *   Every returned item is re-validated in application code regardless of what
 *   we asked for. A filter we cannot see the implementation of is a hint; the
 *   fields on the item are the evidence. An item must match the reference in
 *   BOTH channels, match this deployment's environment, and already require
 *   signed URLs — an unsigned asset is never recoverable, because attaching it
 *   would make private media publicly readable.
 *
 * FAIL CLOSED, ALWAYS
 *   Zero valid matches is "not found". More than one is ambiguous and is never
 *   auto-attached or auto-deleted, because deleting the wrong asset is worse
 *   than leaving a known-ambiguous one for a human. And a failure to ask —
 *   network, parse, auth, any non-2xx, an unterminated or looping pagination,
 *   or a request cap reached — is NEVER reported as "not found".
 */

/** Images metadata is capped at 1024 bytes. Stream documents no length for
 *  `creator`, so this bound is ours and deliberately far below anything
 *  plausible. */
export const MAX_OPAQUE_REFERENCE_LENGTH = 64;

/** Hard caps on a recovery sweep. Reaching either is UNRESOLVED, not "no
 *  match": we stopped asking before the provider said it had finished. */
export const MAX_RECOVERY_PAGES = 5;
export const MAX_RECOVERY_REQUESTS = 5;
export const RECOVERY_PAGE_SIZE = 100;

export type RecoveryOutcome =
  | { status: "recovered"; providerAssetId: string }
  | { status: "no_match" }
  | { status: "ambiguous"; count: number }
  | { status: "unresolved"; reason: RecoveryUnresolvedReason };

export type RecoveryUnresolvedReason =
  | "network_error"
  | "parse_error"
  | "auth_error"
  | "api_error"
  | "pagination_exhausted"
  | "pagination_loop"
  | "reference_too_long";

/** One page as the caller fetched it. `ok: false` carries the HTTP status, or
 *  null when the request never completed. */
export type PageResult =
  | { ok: true; items: unknown[]; continuationToken: string | null }
  | { ok: false; status: number | null };

export type FetchPage = (query: URLSearchParams) => Promise<PageResult>;

/**
 * Validates the reference against every provider limit before it is sent. A
 * reference the provider silently truncates would be unrecoverable, which is
 * the exact failure this mechanism exists to prevent.
 */
export function referenceFitsProviderLimits(reference: string): boolean {
  if (typeof reference !== "string") return false;
  if (reference.length === 0 || reference.length > MAX_OPAQUE_REFERENCE_LENGTH) return false;
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify({ ref: reference, env: "production" }),
  ).length;
  return metadataBytes <= 1024;
}

/**
 * Builds the Images recovery query.
 *
 * Every name and value goes through URLSearchParams, so the bracket syntax in
 * `meta.ref[eq:string]` is encoded by the URL layer rather than by hand. A
 * hand-built query string is exactly where an injected or malformed reference
 * would do damage.
 */
export function imagesRecoveryQuery(
  reference: string,
  continuationToken: string | null = null,
): URLSearchParams {
  const query = new URLSearchParams();
  query.set("creator", reference);
  query.set("meta.ref[eq:string]", reference);
  query.set("per_page", String(RECOVERY_PAGE_SIZE));
  if (continuationToken !== null) query.set("continuation_token", continuationToken);
  return query;
}

export function streamRecoveryQuery(reference: string): URLSearchParams {
  const query = new URLSearchParams();
  query.set("creator", reference);
  query.set("limit", String(RECOVERY_PAGE_SIZE));
  return query;
}

/**
 * Re-validates one Images list item against everything we know.
 *
 * Returns the asset id only when EVERY condition holds. Note the last one:
 * `requireSignedURLs` must already be true. An asset that would be publicly
 * readable is not a thing we are willing to adopt.
 */
export function validateImagesCandidate(
  raw: unknown,
  reference: string,
  environment: string,
): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as {
    id?: unknown;
    creator?: unknown;
    meta?: unknown;
    metadata?: unknown;
    requireSignedURLs?: unknown;
  };

  if (typeof item.id !== "string" || item.id.length === 0) return null;
  if (item.creator !== reference) return null;

  const meta = (item.metadata ?? item.meta ?? {}) as Record<string, unknown>;
  if (meta.ref !== reference) return null;
  if (meta.env !== environment) return null;
  if (item.requireSignedURLs !== true) return null;

  return item.id;
}

/** The Stream equivalent. Stream mirrors the reference into `meta.ref` as well
 *  as `creator`, and both must agree for the same reason. */
export function validateStreamCandidate(
  raw: unknown,
  reference: string,
  environment: string,
): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as {
    uid?: unknown;
    creator?: unknown;
    meta?: unknown;
    requireSignedURLs?: unknown;
  };

  if (typeof item.uid !== "string" || item.uid.length === 0) return null;
  if (item.creator !== reference) return null;

  const meta = (item.meta ?? {}) as Record<string, unknown>;
  if (meta.ref !== reference) return null;
  if (meta.env !== environment) return null;
  if (item.requireSignedURLs !== true) return null;

  return item.uid;
}

/**
 * Maps an HTTP status to an outcome for a recovery LISTING call.
 *
 * Note what is absent: no status maps to `no_match`. "Nothing came back" is a
 * property of a successfully parsed result set, never of a failure to ask. A
 * 404 on a LIST endpoint means the endpoint was wrong, not that the account
 * holds no such asset.
 */
export function classifyRecoveryFailure(httpStatus: number | null): RecoveryOutcome | null {
  if (httpStatus === null) return { status: "unresolved", reason: "network_error" };
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: "unresolved", reason: "auth_error" };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { status: "unresolved", reason: "api_error" };
  }
  return null;
}

/** Decides an outcome from the ids that survived validation. */
export function decideRecovery(matches: readonly string[]): RecoveryOutcome {
  const unique = Array.from(new Set(matches));
  if (unique.length === 0) return { status: "no_match" };
  if (unique.length > 1) return { status: "ambiguous", count: unique.length };
  return { status: "recovered", providerAssetId: unique[0] };
}

interface SweepOptions {
  reference: string;
  environment: string;
  buildQuery: (reference: string, continuationToken: string | null) => URLSearchParams;
  validate: (raw: unknown, reference: string, environment: string) => string | null;
  /** Stream's list endpoint is not continuation-token paginated in the same
   *  way, so a single request is the whole sweep there. */
  paginated: boolean;
}

/**
 * Runs a bounded recovery sweep.
 *
 * Pagination is explicit and defensive: the loop stops at a page cap AND a
 * request cap, refuses a repeated continuation token (which would otherwise
 * spin forever against a buggy or hostile response), and treats reaching
 * either cap as unresolved rather than as an empty result.
 */
export async function sweepForRecovery(
  fetchPage: FetchPage,
  options: SweepOptions,
): Promise<RecoveryOutcome> {
  const { reference, environment, buildQuery, validate, paginated } = options;

  if (!referenceFitsProviderLimits(reference)) {
    return { status: "unresolved", reason: "reference_too_long" };
  }

  const matches: string[] = [];
  const seenTokens = new Set<string>();
  let token: string | null = null;
  let requests = 0;

  for (let page = 0; page < MAX_RECOVERY_PAGES; page += 1) {
    if (requests >= MAX_RECOVERY_REQUESTS) {
      return { status: "unresolved", reason: "pagination_exhausted" };
    }

    requests += 1;
    let result: PageResult;
    try {
      result = await fetchPage(buildQuery(reference, token));
    } catch {
      return { status: "unresolved", reason: "network_error" };
    }

    if (!result.ok) {
      return classifyRecoveryFailure(result.status) ?? { status: "unresolved", reason: "api_error" };
    }
    if (!Array.isArray(result.items)) {
      return { status: "unresolved", reason: "parse_error" };
    }

    for (const item of result.items) {
      const id = validate(item, reference, environment);
      if (id !== null) matches.push(id);
    }

    const next = result.continuationToken;
    if (!paginated || next === null || next === "") {
      // The provider says it has finished. Only now may an empty match set
      // mean "not found".
      return decideRecovery(matches);
    }

    if (typeof next !== "string" || seenTokens.has(next)) {
      // The same token twice would loop forever.
      return { status: "unresolved", reason: "pagination_loop" };
    }
    seenTokens.add(next);
    token = next;
  }

  // The page cap was reached and the provider still had more. We stopped
  // asking, so we cannot claim the asset is absent.
  return { status: "unresolved", reason: "pagination_exhausted" };
}

export function recoverImagesAsset(
  fetchPage: FetchPage,
  reference: string,
  environment: string,
): Promise<RecoveryOutcome> {
  return sweepForRecovery(fetchPage, {
    reference,
    environment,
    buildQuery: imagesRecoveryQuery,
    validate: validateImagesCandidate,
    paginated: true,
  });
}

export function recoverStreamAsset(
  fetchPage: FetchPage,
  reference: string,
  environment: string,
): Promise<RecoveryOutcome> {
  return sweepForRecovery(fetchPage, {
    reference,
    environment,
    buildQuery: (ref) => streamRecoveryQuery(ref),
    validate: validateStreamCandidate,
    paginated: false,
  });
}
