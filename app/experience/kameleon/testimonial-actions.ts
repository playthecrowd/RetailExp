"use server";

import { createClient } from "@/lib/supabase/server";
import { createSecretClient } from "@/lib/supabase/secret";
import { isAnonymousVisitor } from "@/lib/kameleon/visitor-session";
import {
  isTestimonialCaptureEnabled,
  CAPTURE_DISABLED_MESSAGE,
} from "@/lib/testimonials/feature-gate";
import {
  MAX_CAPTION_LENGTH,
  normalizeCaption,
  type CaptureMediaType,
} from "@/lib/testimonials/limits";
import {
  createUploadDestination,
  type UploadDestination,
} from "@/lib/testimonials/provider-assets";
import { finalizeUpload, type FinalizeState } from "@/lib/testimonials/finalize";

/**
 * Visitor-facing testimonial actions.
 *
 * TWO CLIENTS, TWO JOBS.
 *
 * Identity is established with the VISITOR's own client: getUser() validates
 * the session against the Auth server, and only an explicitly anonymous
 * identity may proceed. Nothing about that step is delegated.
 *
 * The capture RPCs are then invoked with the SERVER-ONLY secret client,
 * because they are granted to service_role alone. An earlier draft granted
 * them to `authenticated` and relied on auth.uid() inside the function — but
 * the environment feature flag is a Node variable PostgreSQL cannot see, and
 * the database gate lives on a row shared by Preview and Production. Once
 * that row was enabled for Production, a Preview browser could have called
 * the RPC directly through PostgREST and skipped the environment gate
 * entirely. Making the RPCs unreachable from any browser role is what makes
 * that gate real.
 *
 * The verified user id is passed explicitly. The RPC does not take it on
 * trust: it re-resolves the id against auth.users, requires is_anonymous to
 * be explicitly true, and re-checks enrollment, tenancy and every gate.
 *
 * NO ACTION HERE MARKS AN UPLOAD COMPLETE ON THE BROWSER'S SAY-SO.
 * finalizeTestimonialUploadAction below is a PROMPT to go and look, not a
 * report to be believed: the decision is made by an authenticated read from
 * Cloudflare inside lib/testimonials/finalize.ts, and no provider identifier
 * is accepted from, or returned to, the browser at any point.
 */

const GENERIC_FAILURE = "That didn't work. Please try again.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * THE LEGAL GATE is enforced in the database, not here.
 *
 * An earlier draft passed a sentinel version string into the RPC, which only
 * checked that it was non-empty — so enabling the two capture gates would have
 * stored "unavailable-pending-legal-documents" as a genuine consent record.
 * A negative check would not have been enough either: rejecting one known-bad
 * string still admits any invented one.
 *
 * The RPC now resolves the version itself from public.consent_document_versions,
 * an authoritative registry that is empty until real Terms and Privacy
 * documents are published and a row is deliberately made active. No version
 * travels from this file, and none can be invented by a caller.
 */
const LEGAL_DOCUMENTS_UNAVAILABLE =
  "Sharing your story isn't available yet — the terms you'd be agreeing to aren't published.";

export interface CaptureActionResult<T = undefined> {
  status: "ok" | "error";
  message: string | null;
  data?: T;
}

function failure(message: string = GENERIC_FAILURE): CaptureActionResult<never> {
  return { status: "error", message };
}

/**
 * The gate every action passes through first.
 *
 * Returns the visitor's Supabase client only when capture is genuinely
 * available AND the caller is an explicitly anonymous visitor. A permanent
 * account — an administrator — is refused here exactly as it is refused from
 * enrollment and rewards.
 */
/**
 * Establishes the caller's identity, with NO feature gate.
 *
 * Split out because the two needs genuinely differ: creating or mutating a
 * submission requires capture to be switched on, but READING the status of
 * something already submitted must keep working after it is switched off.
 * Both paths share this identity check so there is exactly one definition of
 * "an acceptable visitor", and `visitorId` is only ever the value it verified.
 */
async function requireAnonymousVisitor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, result: failure(GENERIC_FAILURE) };

  // Strict: only an explicitly anonymous identity may proceed. An
  // administrator, or an identity whose anonymity cannot be established, is
  // refused. Same rule and same helper as the rest of the visitor flow.
  if (!isAnonymousVisitor(user)) {
    return { ok: false as const, result: failure(GENERIC_FAILURE) };
  }

  return { ok: true as const, supabase, visitorId: user.id };
}

async function requireEnabledVisitor() {
  // The feature gate is checked BEFORE the identity lookup, so a disabled
  // deployment does no auth work and returns the same message either way.
  if (!isTestimonialCaptureEnabled()) {
    return { ok: false as const, result: failure(CAPTURE_DISABLED_MESSAGE) };
  }

  // Identity verified here. From this point the RPCs are called with the
  // trusted client, and `visitorId` is the value that was checked - never
  // anything the browser sent.
  return requireAnonymousVisitor();
}

// NOTE: this file deliberately computes no environment marker. Even a
// server-derived one would be asserted by the submission's creator; the
// trusted validation path stamps it later from provider configuration, and
// nothing can become valid, moderated or published without it.

export interface TestimonialIntent {
  submissionId: string;
  mediaType: CaptureMediaType;
  uploadStatus: string;
  uploadExpiresAt: string;
  uploadAttemptCount: number;
}

/**
 * Creates (or re-returns) a live upload intent.
 *
 * Idempotent by state inside the RPC: a visitor who reloads mid-flow gets
 * their existing intent back instead of accumulating orphaned rows.
 *
 * Note what is NOT a parameter: no client id, experience id, auth id,
 * submission key or provider identifier. The RPC resolves tenancy from the
 * caller's own enrollment, so there is nothing here for a browser to redirect.
 */
export async function createTestimonialIntentAction(
  mediaType: CaptureMediaType,
  attestedSubmitterAdult: boolean,
): Promise<CaptureActionResult<TestimonialIntent>> {
  const gate = await requireEnabledVisitor();
  if (!gate.ok) return gate.result;

  if (mediaType !== "image" && mediaType !== "video") return failure();

  // Strict === true. A missing, undefined or truthy-but-not-true value is NOT
  // an attestation, and the RPC refuses anything other than true anyway — this
  // just makes the refusal happen without a round trip.
  if (attestedSubmitterAdult !== true) return failure();

  // Two content arguments and the verified visitor id. The consent version and
  // the environment marker are both resolved by trusted code — neither is
  // supplied from here, and neither can be supplied by a browser. The 18+
  // attestation IS supplied, because it is a statement the visitor made and
  // nobody else can make it for them.
  const { data, error } = await createSecretClient()
    .rpc("create_testimonial_intent", {
      p_visitor_id: gate.visitorId,
      p_media_type: mediaType,
      p_attested_submitter_adult: attestedSubmitterAdult,
    })
    .single();

  // A closed legal gate surfaces as a refusal from the RPC. The message is
  // specific because it is not a fault the visitor can fix or should doubt.
  if (error || !data) return failure(LEGAL_DOCUMENTS_UNAVAILABLE);

  const row = data;

  return {
    status: "ok",
    message: null,
    data: {
      submissionId: row.submission_id,
      mediaType: row.media_type,
      uploadStatus: row.upload_status,
      uploadExpiresAt: row.upload_expires_at,
      uploadAttemptCount: row.upload_attempt_count,
    },
  };
}

/**
 * The upload step.
 *
 * Returns a ONE-TIME provider destination and nothing else. The provider's
 * asset identifier is deliberately NOT returned: it is written to the ledger
 * by trusted server code and never travels to a browser.
 *
 * The sequence is reserve -> create -> attach, in that order, so a provider
 * asset can never exist without a database row that knows about it. See
 * lib/testimonials/provider-assets.ts for why the two-step matters.
 *
 * `visitorId` is the value this action verified against the visitor's own
 * session. The reservation RPC re-resolves it against auth.users and
 * re-checks anonymity, ownership, both capture gates, the active consent
 * version, lifecycle and the attempt budget, so nothing here is taken on
 * trust merely because it reached this line.
 */
export async function requestUploadDestinationAction(
  submissionId: string,
  mediaType: CaptureMediaType,
): Promise<CaptureActionResult<UploadDestination>> {
  const gate = await requireEnabledVisitor();
  if (!gate.ok) return gate.result;

  if (!UUID_PATTERN.test(submissionId)) return failure();
  if (mediaType !== "image" && mediaType !== "video") return failure();

  const result = await createUploadDestination(gate.visitorId, submissionId, mediaType);

  // The reason is a sanitized internal code; the visitor gets the generic
  // message. A refusal must not tell a caller which of the gates rejected it.
  if (!result.ok) return failure();

  return { status: "ok", message: null, data: result.destination };
}

/**
 * Finalizes an upload the browser believes it has completed.
 *
 * WHY THIS EXISTS AT ALL, AND ONLY FOR ONE OF THE TWO MEDIA TYPES' SAKE
 *   A video is reconciled by the signed Stream webhook. Cloudflare Images
 *   publishes no webhook this codebase can verify, so a photo had NO path to
 *   validation - reconcileImage() sat uncalled since Phase 4C and every image
 *   submission expired unvalidated. This is that path.
 *
 *   Video is accepted here too, as a fallback for a webhook that never
 *   arrives. It costs one authenticated provider read and removes a silent
 *   stall; the webhook remains the primary route and neither can produce a
 *   different outcome, because both end at the same trusted reconciliation.
 *
 * The visitor learns one of three words and never a reason. `processing` is
 * the only one worth retrying.
 */
export async function finalizeTestimonialUploadAction(
  submissionId: string,
): Promise<CaptureActionResult<{ state: FinalizeState }>> {
  const gate = await requireEnabledVisitor();
  if (!gate.ok) return gate.result;
  if (!UUID_PATTERN.test(submissionId)) return failure();

  // gate.visitorId is the id verified against the visitor's own session. It is
  // re-checked against the submission's owner inside finalizeUpload, so
  // reaching this line is not by itself authority over this submission.
  const state = await finalizeUpload(gate.visitorId, submissionId);

  return { status: "ok", message: null, data: { state } };
}

export async function retryTestimonialUploadAction(
  submissionId: string,
): Promise<CaptureActionResult<{ uploadAttemptCount: number }>> {
  const gate = await requireEnabledVisitor();
  if (!gate.ok) return gate.result;
  if (!UUID_PATTERN.test(submissionId)) return failure();

  const { data, error } = await createSecretClient()
    .rpc("retry_testimonial_upload", {
      p_visitor_id: gate.visitorId,
      p_submission_id: submissionId,
    })
    .single();

  if (error || !data) return failure();

  const row = data;
  return { status: "ok", message: null, data: { uploadAttemptCount: row.upload_attempt_count } };
}

export async function abandonTestimonialAction(
  submissionId: string,
): Promise<CaptureActionResult> {
  const gate = await requireEnabledVisitor();
  if (!gate.ok) return gate.result;
  if (!UUID_PATTERN.test(submissionId)) return failure();

  const { error } = await createSecretClient()
    .rpc("abandon_testimonial_submission", {
      p_visitor_id: gate.visitorId,
      p_submission_id: submissionId,
    })
    .single();

  if (error) return failure();
  return { status: "ok", message: null };
}

export async function updateTestimonialCaptionAction(
  submissionId: string,
  caption: string,
): Promise<CaptureActionResult<{ caption: string | null }>> {
  const gate = await requireEnabledVisitor();
  if (!gate.ok) return gate.result;
  if (!UUID_PATTERN.test(submissionId)) return failure();

  // Normalized here as well as in the RPC. The RPC is authoritative; this
  // catches an over-long caption before a round trip and keeps the message
  // specific rather than generic.
  const normalized = normalizeCaption(caption);
  if (normalized.length > MAX_CAPTION_LENGTH) {
    return failure(`Captions are limited to ${MAX_CAPTION_LENGTH} characters.`);
  }

  const { data, error } = await createSecretClient()
    .rpc("update_testimonial_caption", {
      p_visitor_id: gate.visitorId,
      p_submission_id: submissionId,
      p_caption: normalized,
    })
    .single();

  if (error) return failure();
  return { status: "ok", message: null, data: { caption: data.caption } };
}

export interface MySubmissionSummary {
  submissionId: string;
  mediaType: CaptureMediaType | null;
  uploadStatus: string | null;
  validationStatus: string | null;
  moderationStatus: string | null;
  caption: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  uploadAttemptCount: number | null;
}

/**
 * The visitor's own submission status.
 *
 * This used to read public.testimonial_my_submissions directly from the
 * browser's own client, on the argument that the view was self-protecting:
 * SELECT-only, scoped by auth.uid(), no provider or reviewer columns.
 *
 * That argument was incomplete. The view is not security_invoker, so it reads
 * the base table as its owner and RLS never applies; its auth.uid() predicate
 * enforces OWNERSHIP but not ANONYMITY. A permanent account with an enrollment
 * row could have read status straight from PostgREST and never passed the
 * isAnonymousVisitor() check below — the same shape of hole that moved the
 * capture RPCs off `authenticated`.
 *
 * The view is now revoked from every browser role, and this reads through a
 * service_role-only RPC that re-resolves the visitor id against auth.users and
 * requires is_anonymous to be explicitly true. Identity is still established
 * with the visitor's own client first; only the read is delegated.
 */
export async function listMySubmissionsAction(): Promise<CaptureActionResult<MySubmissionSummary[]>> {
  // Identity only — deliberately NOT requireEnabledVisitor(). Reading the
  // status of an existing submission stays available after capture is
  // switched off; it creates and mutates nothing.
  const gate = await requireAnonymousVisitor();
  if (!gate.ok) return { status: "ok", message: null, data: [] };

  // Unlike the capture RPCs this returns a SET, so it is not .single().
  const { data, error } = await createSecretClient()
    .rpc("list_my_testimonial_submissions", { p_visitor_id: gate.visitorId });

  if (error) return failure();

  // Mapped from the RPC's generated row type - no cast, so a column renamed
  // in a future migration becomes a compile error here rather than a silently
  // undefined field in the UI.
  return {
    status: "ok",
    message: null,
    data: (data ?? []).map((r) => ({
      submissionId: r.submission_id,
      mediaType: r.media_type ?? null,
      uploadStatus: r.upload_status ?? null,
      validationStatus: r.validation_status ?? null,
      moderationStatus: r.moderation_status ?? null,
      caption: r.caption ?? null,
      rejectionReason: r.rejection_reason ?? null,
      submittedAt: r.submitted_at ?? null,
      uploadAttemptCount: r.upload_attempt_count ?? null,
    })),
  };
}

/** Server-evaluated availability, for rendering the choice screen honestly.
 *  The browser is told only true/false — never why. */
export async function isCaptureAvailableAction(): Promise<boolean> {
  return isTestimonialCaptureEnabled();
}
