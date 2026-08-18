import { createSecretClient } from "@/lib/supabase/secret";
import { requireAdminAccess } from "@/lib/auth/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only data access for the testimonial moderation dashboard.
 *
 * Two rules shape everything in this file.
 *
 * 1. NO BROWSER ROLE CAN READ THE QUEUE. `anon` and `authenticated` hold no
 *    privilege at all on testimonial_moderation_queue (20260817193000), and
 *    the view runs with security_invoker = false. So reads must go through
 *    the trusted server client — but only ever AFTER requireAdminAccess()
 *    has confirmed the caller is an owner/admin of Kameleon or a platform
 *    admin. The order matters: authorize, then reach for the trusted client.
 *
 * 2. THE VIEW IS NOT BROWSER-SAFE. It carries client_id, experience_id,
 *    reviewed_by and the provider handles. Every row is mapped into
 *    ModerationItem below before it can reach a Client Component, and that
 *    type has no field capable of carrying any of them.
 */

if (typeof window !== "undefined") {
  throw new Error("lib/testimonials/moderation.ts must never be imported from client-side code.");
}

type MediaType = Database["public"]["Enums"]["testimonial_media_type"];
type ModerationStatus = Database["public"]["Enums"]["testimonial_moderation_status"];
type UploadStatus = Database["public"]["Enums"]["testimonial_upload_status"];
type ValidationStatus = Database["public"]["Enums"]["testimonial_validation_status"];

/**
 * The generated Row type for the view, straight from the linked schema.
 *
 * This replaced a hand-maintained interface that existed only while
 * 20260818161500 was unapplied. There is deliberately no second copy of the
 * shape now: a duplicated schema type is a thing that silently goes stale.
 *
 * Note the nullability. Postgres cannot prove non-nullness through a view, so
 * the generator marks every column `| null` even where the base column is NOT
 * NULL. The mapping below therefore treats each field on its own merits rather
 * than asserting the nulls away wholesale — and the two attestations are read
 * with a strict `=== true`, so an unexpected null renders as "consent
 * incomplete" rather than as consent given.
 */
type ModerationQueueRow =
  Database["public"]["Views"]["testimonial_moderation_queue"]["Row"];

/**
 * Everything a Client Component is allowed to see about a submission.
 *
 * Note what CANNOT be expressed here: there is no field for client_id,
 * experience_id, reviewed_by, provider, provider_delivery_id,
 * provider_poster_id, auth_user_id, experience_user_id, or any visitor name,
 * email or phone number. Leaking one is not a matter of remembering to strip
 * it — it would require adding a field to this type first.
 */
export interface ModerationItem {
  submissionId: string;
  mediaType: MediaType | null;
  caption: string | null;
  submittedAt: string | null;
  moderationStatus: ModerationStatus | null;
  uploadStatus: UploadStatus | null;
  validationStatus: ValidationStatus | null;
  /** Provider-neutral processing state. Never a provider identifier, URL or
   *  payload. */
  processingStatus: string | null;
  /** Whether a delivery rendition exists. The approval trigger refuses while
   *  this is false, so the UI can explain the block instead of failing. */
  deliveryReady: boolean;
  posterReady: boolean;
  reviewedAt: string | null;
  publishedAt: string | null;
  moderationNote: string | null;
  rejectionReason: string | null;
  /** When provider media is scheduled for deletion. Drives the retention copy
   *  so a purged row leaving the queue does not read as data loss. */
  mediaPurgeAfter: string | null;
  consentScope: string | null;
  consentVersion: string | null;
  attestedNoMinors: boolean;
  attestedSubjectsConsented: boolean;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  detectedMimeType: string | null;
  /**
   * Whether a signed preview COULD be produced for this item.
   *
   * Deliberately a boolean, not a URL and not a handle. Cloudflare is not
   * configured, so this is false for everything today; when signed delivery is
   * added the URL will be minted server-side per request and still never
   * stored. See createSignedPreviewUrl() at the bottom of this file.
   */
  previewAvailable: boolean;
}

export const MODERATION_TABS = ["pending", "approved", "rejected", "removed", "all"] as const;
export type ModerationTab = (typeof MODERATION_TABS)[number];

export const MEDIA_FILTERS = ["all", "image", "video"] as const;
export type MediaFilter = (typeof MEDIA_FILTERS)[number];

export const SORT_ORDERS = ["newest", "oldest"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const PAGE_SIZE = 12;
/** Hard ceiling on how far a caller may page, so a huge ?page= value cannot
 *  turn into an expensive range scan. */
const MAX_PAGE = 500;

export interface ModerationQuery {
  tab: ModerationTab;
  media: MediaFilter;
  sort: SortOrder;
  page: number;
}

/**
 * Parses URL search params into a query, by allow-list.
 *
 * Every parameter falls back to a safe default rather than erroring, and no
 * value from the URL is ever used as a tenant identifier — the client id comes
 * from the authorization result alone.
 */
export function parseModerationQuery(
  params: Record<string, string | string[] | undefined>,
): ModerationQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const tabRaw = first(params.tab) ?? "";
  const mediaRaw = first(params.media) ?? "";
  const sortRaw = first(params.sort) ?? "";
  const pageRaw = first(params.page);

  const parsedPage = Number.parseInt(pageRaw ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, MAX_PAGE) : 1;

  return {
    tab: (MODERATION_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as ModerationTab) : "pending",
    media: (MEDIA_FILTERS as readonly string[]).includes(mediaRaw) ? (mediaRaw as MediaFilter) : "all",
    sort: (SORT_ORDERS as readonly string[]).includes(sortRaw) ? (sortRaw as SortOrder) : "newest",
    page,
  };
}

export interface ModerationPage {
  items: ModerationItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: Record<ModerationTab, number>;
}

/** A row the view returned with a usable identity. See the filter in
 *  loadModerationQueue for why this narrowing exists. */
type IdentifiedRow = ModerationQueueRow & { submission_id: string };

function toItem(row: IdentifiedRow): ModerationItem {
  return {
    submissionId: row.submission_id,
    mediaType: row.media_type,
    caption: row.caption,
    submittedAt: row.submitted_at,
    moderationStatus: row.moderation_status,
    uploadStatus: row.upload_status,
    validationStatus: row.validation_status,
    processingStatus: row.provider_processing_status,
    deliveryReady: row.delivery_ready_at !== null,
    posterReady: row.poster_ready_at !== null,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    moderationNote: row.moderation_note,
    rejectionReason: row.rejection_reason,
    mediaPurgeAfter: row.media_purge_after,
    consentScope: row.consent_scope,
    consentVersion: row.consent_version,
    // Strict: a null attestation is NOT consent. Rendering it as
    // "attested" because the column happened to be null is exactly the
    // failure this project has corrected elsewhere.
    attestedNoMinors: row.attested_no_minors === true,
    attestedSubjectsConsented: row.attested_subjects_consented === true,
    width: row.validated_width,
    height: row.validated_height,
    durationSeconds: row.validated_duration_seconds,
    sizeBytes: row.validated_size_bytes,
    detectedMimeType: row.detected_mime_type,
    // Signed delivery is not built yet, and no provider handle leaves this
    // function regardless. Always false until createSignedPreviewUrl() exists.
    previewAvailable: false,
  };
}

/**
 * Loads one page of the moderation queue for the caller's authorized tenant.
 *
 * requireAdminAccess() runs FIRST and redirects on any denial, so the trusted
 * client below is unreachable for an unauthorized caller. The tenant filter
 * uses access.clientId — the value the authorization helper resolved — and
 * never a search parameter, so there is no cross-tenant read to attempt.
 */
export async function loadModerationQueue(query: ModerationQuery): Promise<ModerationPage> {
  // FIRST. The trusted client below is unreachable until this has confirmed
  // the caller is an owner/admin of Kameleon or a platform admin, and every
  // query in this function — counts included — runs after it.
  const access = await requireAdminAccess();

  const supabase = createSecretClient();

  /**
   * Every query starts here, so the tenant filter cannot be forgotten on one
   * of them. access.clientId is the value AUTHORIZATION resolved; no search
   * parameter, form field or header contributes to it.
   */
  const scoped = () =>
    supabase.from("testimonial_moderation_queue").select("*", { count: "exact", head: true })
      .eq("client_id", access.clientId);

  // ---- Status counts: whole dataset, never the loaded page ---------------
  //
  // Each is a separate COUNT executed by Postgres with `head: true`, so no
  // rows are transferred and the number is the complete total for that status
  // — pagination cannot influence it. Deriving these from `items.length` or
  // from the paginated array would silently report "12" forever once a status
  // exceeded one page.
  //
  // The media filter IS applied, so a tab count always matches what selecting
  // that tab will actually show. The status filter is not, because each count
  // IS the count for its own status.
  const counts = {} as Record<ModerationTab, number>;
  for (const tab of MODERATION_TABS) {
    let countQuery = scoped();
    if (tab !== "all") countQuery = countQuery.eq("moderation_status", tab);
    if (query.media !== "all") countQuery = countQuery.eq("media_type", query.media);
    const { count, error } = await countQuery;
    if (error) throw new Error(`Could not count ${tab} submissions: ${error.message}`);
    counts[tab] = count ?? 0;
  }

  // ---- The page itself ---------------------------------------------------
  let rows = supabase
    .from("testimonial_moderation_queue")
    .select("*", { count: "exact" })
    .eq("client_id", access.clientId);

  if (query.tab !== "all") rows = rows.eq("moderation_status", query.tab);
  if (query.media !== "all") rows = rows.eq("media_type", query.media);

  const ascending = query.sort === "oldest";
  const from = (query.page - 1) * PAGE_SIZE;

  const { data, count, error } = await rows
    // Primary order. nullsFirst is pinned so an unsubmitted row cannot drift
    // between pages depending on sort direction.
    .order("submitted_at", { ascending, nullsFirst: false })
    // Deterministic tie-break. Without it, two submissions sharing a
    // submitted_at have no defined relative order, and Postgres is free to
    // return them differently per query — which shows up as a row appearing
    // on two pages, or on neither. submission_id is unique, so adding it
    // makes the total order strict.
    .order("submission_id", { ascending })
    // Database-side window. PAGE_SIZE rows at most ever leave Postgres; there
    // is no unbounded fetch anywhere in this function.
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(`Could not load the moderation queue: ${error.message}`);

  const total = count ?? 0;

  return {
    // An out-of-range page returns an empty array here rather than being
    // clamped, so the UI states truthfully that there is nothing on this page
    // instead of silently showing a different page than the URL claims.
    // A row whose submission_id is null cannot be keyed, previewed or acted
    // on, so it is dropped rather than rendered as a card with no identity.
    // The generator marks the column nullable because Postgres cannot prove
    // non-nullness through a view; the base column is NOT NULL, so in practice
    // this filter removes nothing — it just makes that assumption explicit
    // instead of asserting it away with a cast.
    items: (data ?? [])
      .filter((row): row is IdentifiedRow => row.submission_id !== null)
      .map(toItem),
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts,
  };
}

/**
 * The seam where signed preview generation will live.
 *
 * Not implemented, and deliberately not stubbed with a guess. When Cloudflare
 * is configured this will: re-authorize, re-read the row server-side to
 * confirm it is still queue-eligible, exchange provider_delivery_id for a
 * SHORT-LIVED signed token using a server-only secret, and return that URL to
 * be rendered once. The handle must never be sent to the browser, no URL is
 * ever persisted, and no URL is ever built by concatenating a provider
 * hostname.
 */
export async function createSignedPreviewUrl(submissionId: string): Promise<null> {
  // The id shape is validated even though nothing is minted yet, so the guard
  // is already in place when the provider exchange is added rather than being
  // something to remember later.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
    return null;
  }
  return null;
}
