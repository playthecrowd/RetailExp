"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFreshAdminAccess } from "@/lib/auth/admin";
import {
  isValidRejectionReason,
  MAX_MODERATION_NOTE_LENGTH,
} from "@/lib/testimonials/rejection-reasons";
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
