import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PILOT_COOKIE_NAME,
  cookieUnlocksPilot,
  pilotGateConfigured,
} from "./access-gate";

/**
 * Server-side enforcement of the stakeholder gate.
 *
 * proxy.ts also redirects, but that is an optimistic pre-filter and nothing
 * more — it runs on prefetches and must stay cheap. THIS is the boundary, for
 * exactly the reason the admin area states in its own layout: Next's guidance
 * is explicit that proxy "should not be your only line of defense". Deleting
 * the proxy redirect would cost a redirect; deleting this would open the
 * evaluation.
 */

export const PILOT_GATE_ROUTE = "/experience/kameleon/access";

function accessCode(): string | undefined {
  return process.env.KAMELEON_PILOT_ACCESS_CODE;
}

export function pilotGateIsConfigured(): boolean {
  return pilotGateConfigured(accessCode());
}

export async function pilotUnlocked(): Promise<boolean> {
  const store = await cookies();
  return cookieUnlocksPilot(store.get(PILOT_COOKIE_NAME)?.value, accessCode());
}

/**
 * Redirects to the gate unless this browser holds a valid unlock cookie.
 *
 * Called from the experience layout, so it covers every page beneath it —
 * including the Gallery — without each one having to remember.
 */
export async function requirePilotAccess(): Promise<void> {
  if (await pilotUnlocked()) return;
  redirect(PILOT_GATE_ROUTE);
}
