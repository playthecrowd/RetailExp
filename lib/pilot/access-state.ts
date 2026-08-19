/**
 * Form state for the stakeholder access gate.
 *
 * WHY THIS IS NOT IN THE ACTION FILE
 *   A `"use server"` module may export ONLY async functions. Everything it
 *   exports becomes a callable server endpoint, so Next refuses a module that
 *   exports anything else — at build time with "a 'use server' file can only
 *   export async functions, found object".
 *
 *   IDLE_ACCESS_STATE is an object, so it lived there illegally and took the
 *   POST down with it while the GET page still rendered fine. lib/kameleon/
 *   visitor-session.ts documents the same rule for the same reason; this is
 *   the shared-constant module the access gate should have had from the start.
 *
 * Deliberately NOT server-only: the form is a Client Component and needs the
 * initial state. It carries no secret and no configuration — just the shape of
 * a form result.
 */

export interface AccessState {
  status: "idle" | "error";
  message: string | null;
}

export const IDLE_ACCESS_STATE: AccessState = { status: "idle", message: null };
