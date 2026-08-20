/**
 * Form state for the moderation actions.
 *
 * Same reason as lib/pilot/age-gate-state.ts: a `"use server"` module may
 * export ONLY async functions, and IDLE_MODERATION_STATE is an object. It would
 * have failed the build identically to the visitor gate — the moderation
 * dashboard's POSTs, not its GET — so it moves here rather than waiting to be
 * discovered.
 *
 * Not server-only: ModerationActions is a Client Component and needs the
 * initial state. Carries no privileged value.
 */

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
