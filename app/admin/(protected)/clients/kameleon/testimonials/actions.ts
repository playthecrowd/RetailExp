"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFreshAdminAccess } from "@/lib/auth/admin";
import {
  isImmediatePurgeReason,
  isValidRejectionReason,
  MAX_MODERATION_NOTE_LENGTH,
} from "@/lib/testimonials/rejection-reasons";
import {
  createModerationPreview,
  type SignedModerationPreview,
} from "@/lib/testimonials/moderation";
import { createSecretClient } from "@/lib/supabase/secret";
import { MODERATION_ROUTE, GALLERY_ROUTE } from "@/lib/testimonials/routes";

/**
 * Moderation decisions.
 *
 * The read path (lib/testimonials/moderation.ts) uses the trusted client,
 * because no browser role can read the queue view. The WRITE path deliberately
 * does the opposite: it uses the signed-in administrator's own session, so
 * auth.uid() inside moderate_testimonial_submission() is the real reviewer and
 * the trigger records them in reviewed_by. Using the trusted client here would
 * make auth.uid() null and destroy review provenance — which is the whole
 * reason the RPC exists.
 *
 * There is no direct UPDATE of testimonial_submissions anywhere in this file,
 * and there could not usefully be one: `authenticated` holds UPDATE on the
 * caption column only.
 */


const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ModerationActionState {
  status: "idle" | "success" | "error";
  message: string | null;
  /** Which submission the result refers to, so the UI can show feedback on
   *  the right card without re-deriving it. */
  submissionId: string | null;
}

export const IDLE_MODERATION_STATE: ModerationActionState = {
  status: "idle",
  message: null,
  submissionId: null,
};

/**
 * One message for every refusal that is not a plain validation error.
 *
 * The RPC already returns the same error for "no such submission" and "not
 * authorized" so a moderator cannot probe which ids exist; this keeps that
 * property intact on the way back out.
 */
const GENERIC_FAILURE = "That moderation decision could not be completed.";

function normalizeNote(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (value.length === 0) return null;
  return value.slice(0, MAX_MODERATION_NOTE_LENGTH);
}

/**
 * Approve — makes the submission Gallery-eligible once every delivery
 * requirement is met.
 *
 * READINESS IS NOT TAKEN FROM THE BROWSER. The only values read from FormData
 * are the submission id and an optional note; there is no deliveryReady field
 * to forge, and the UI disabling the button is a courtesy, not the control.
 * The database re-checks every approval requirement inside the RPC's trigger —
 * delivery_ready_at must be set, and video additionally needs trusted
 * duration, size and dimensions — and a refusal surfaces here as the same
 * generic message as any other failure, exposing no SQL, table name, provider
 * state or internal identifier.
 */
export async function approveSubmissionAction(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  // Fresh, uncached authorization on every mutation. A decision computed
  // during an earlier render is not evidence about this request.
  await requireFreshAdminAccess();

  const submissionId = formData.get("submissionId");
  if (typeof submissionId !== "string" || !UUID_PATTERN.test(submissionId)) {
    return { status: "error", message: GENERIC_FAILURE, submissionId: null };
  }

  const note = normalizeNote(formData.get("moderationNote"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_testimonial_submission", {
    p_submission_id: submissionId,
    p_decision: "approved",
    // The generated Args type models the RPC's DEFAULT NULL parameters as
    // optional, so absence is expressed as undefined rather than null.
    // Postgres receives its own default either way.
    p_moderation_note: note ?? undefined,
  });

  if (error) {
    return { status: "error", message: GENERIC_FAILURE, submissionId };
  }

  revalidatePath(MODERATION_ROUTE);
  revalidatePath(GALLERY_ROUTE);

  return { status: "success", message: "Approved. It will appear in the Gallery once delivery is ready.", submissionId };
}

/**
 * Reject — requires a reason from the server-side allow-list. The reason is
 * stored by id, never by label, so rewording UI copy cannot change the meaning
 * of an existing audit record.
 */
export async function rejectSubmissionAction(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  await requireFreshAdminAccess();

  const submissionId = formData.get("submissionId");
  if (typeof submissionId !== "string" || !UUID_PATTERN.test(submissionId)) {
    return { status: "error", message: GENERIC_FAILURE, submissionId: null };
  }

  const reason = formData.get("rejectionReason");
  // Re-checked here rather than trusted from the <select>. A Server Action is
  // a public POST endpoint; the dropdown is a convenience, not a constraint.
  if (!isValidRejectionReason(reason)) {
    return {
      status: "error",
      message: "Choose a rejection reason from the list.",
      submissionId,
    };
  }

  const note = normalizeNote(formData.get("moderationNote"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_testimonial_submission", {
    p_submission_id: submissionId,
    p_decision: "rejected",
    p_moderation_note: note ?? undefined,
    p_rejection_reason: reason,
  });

  if (error) {
    return { status: "error", message: GENERIC_FAILURE, submissionId };
  }

  revalidatePath(MODERATION_ROUTE);
  revalidatePath(GALLERY_ROUTE);

  return {
    status: "success",
    message: "Rejected. The media is retained privately for 30 days, then deleted at the provider.",
    submissionId,
  };
}

/**
 * Remove — takes an approved or rejected submission down.
 *
 * WHY THIS IS THE ONLY WAY BACK
 *   There is no publication kill switch by design, so approval IS publication.
 *   The Gallery stops showing a removed item immediately — the lifecycle
 *   trigger clears published_at and the Gallery view requires it — and the
 *   media is deleted by the next retention sweep.
 *
 * TWO REASONS PURGE IMMEDIATELY
 *   The trigger schedules deletion 30 days out for every removal, a window
 *   that exists for moderation reversibility and abuse-report retention.
 *   Neither applies when the person who submitted it asked for it to come
 *   down, and both are outweighed when the submitter turned out not to be an
 *   adult. For those two the purge is brought forward to the next sweep.
 *
 *   That is a SECOND call, deliberately. The decision goes through
 *   moderate_testimonial_submission under the administrator's own session, so
 *   the trigger records the real reviewer; the purge is a trusted-tier write
 *   that cannot move any lifecycle state. Merging them would mean either
 *   losing review provenance or giving the moderation RPC a deletion power it
 *   has no business holding.
 *
 * A FAILED PURGE IS NOT A FAILED REMOVAL. If the second call fails, the item
 * is still down and its media is still scheduled — 30 days out instead of
 * now. Reporting that as an error would tell a moderator the removal did not
 * happen, which would be false and would invite them to try again.
 */
export async function removeSubmissionAction(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  await requireFreshAdminAccess();

  const submissionId = formData.get("submissionId");
  if (typeof submissionId !== "string" || !UUID_PATTERN.test(submissionId)) {
    return { status: "error", message: GENERIC_FAILURE, submissionId: null };
  }

  const reason = formData.get("rejectionReason");
  // Re-checked here rather than trusted from the <select>, exactly as reject
  // does. A Server Action is a public POST endpoint.
  if (!isValidRejectionReason(reason)) {
    return {
      status: "error",
      message: "Choose a removal reason from the list.",
      submissionId,
    };
  }

  const note = normalizeNote(formData.get("moderationNote"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_testimonial_submission", {
    p_submission_id: submissionId,
    p_decision: "removed",
    p_moderation_note: note ?? undefined,
    p_rejection_reason: reason,
  });

  if (error) {
    return { status: "error", message: GENERIC_FAILURE, submissionId };
  }

  let purgedNow = false;
  if (isImmediatePurgeReason(reason)) {
    const { error: purgeError } = await createSecretClient()
      .rpc("purge_testimonial_media_now", {
        p_submission_id: submissionId,
        p_reason: reason,
      })
      .single();
    purgedNow = !purgeError;
  }

  revalidatePath(MODERATION_ROUTE);
  revalidatePath(GALLERY_ROUTE);

  return {
    status: "success",
    message: purgedNow
      ? "Removed. It is out of the Gallery now and its media is queued for deletion on the next sweep."
      : "Removed. It is out of the Gallery now and its media is deleted within 30 days.",
    submissionId,
  };
}

/**
 * Mints a short-lived signed preview for one submission.
 *
 * Separate from the page render on purpose: signing an image re-reads the
 * Cloudflare variant every time, deliberately uncached, so minting for a whole
 * page would cost one API round trip per card before anything appeared.
 *
 * Returns null for every refusal — unknown id, wrong tenant, not eligible,
 * unconfigured. The reviewer sees "no preview" and learns nothing about which
 * of those it was.
 */
export async function requestPreviewAction(
  submissionId: string,
): Promise<SignedModerationPreview | null> {
  // createModerationPreview re-authorizes freshly and re-reads the row through
  // the queue view scoped to the caller's own tenant, so this is not the
  // authorization boundary — it is the input guard in front of it.
  if (typeof submissionId !== "string" || !UUID_PATTERN.test(submissionId)) return null;
  return createModerationPreview(submissionId);
}
