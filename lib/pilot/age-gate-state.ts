/**
 * Form state for the age gate.
 *
 * A `"use server"` module may export ONLY async functions — everything it
 * exports becomes a callable server endpoint — so the initial state and its
 * type live here, not beside the action. The same rule that took the access
 * POST down in Production once already.
 *
 * Not server-only: the form is a Client Component and needs the initial state.
 * It carries no secret, no configuration and, deliberately, no date of birth —
 * the entered date exists only for the length of one server action.
 */

export interface AgeGateState {
  status: "idle" | "error";
  /** A message a person can act on. Never echoes what they typed. */
  message: string | null;
}

export const IDLE_AGE_GATE_STATE: AgeGateState = { status: "idle", message: null };

/** The exact wording the experience uses when somebody is not old enough. */
export const UNDERAGE_MESSAGE =
  "You must be 21 years of age or older to enter this experience.";
