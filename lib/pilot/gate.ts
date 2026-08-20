import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AGE_COOKIE_NAME, ageGateConfigured, cookieAffirmsAge } from "./age-gate";

/**
 * Server-side enforcement of the 21+ age gate.
 *
 * This replaced a shared-password gate. The password was right for a closed
 * technical pilot and wrong for the thing this actually is: a beverage
 * experience, which is expected to ask about age rather than about an invite
 * code.
 *
 * proxy.ts also redirects, but that is an optimistic pre-filter and nothing
 * more — it runs on prefetches and must stay cheap. THIS is the boundary, the
 * same division proxy.ts already documents for /admin. Deleting the proxy
 * redirect would cost a redirect; deleting this would open the experience.
 */

export const AGE_GATE_ROUTE = "/experience/kameleon/welcome";

function ageSecret(): string | undefined {
  return process.env.KAMELEON_AGE_GATE_SECRET;
}

export function ageGateIsConfigured(): boolean {
  return ageGateConfigured(ageSecret());
}

export async function ageAffirmed(): Promise<boolean> {
  const store = await cookies();
  return cookieAffirmsAge(store.get(AGE_COOKIE_NAME)?.value, ageSecret());
}

/**
 * Redirects to the age gate unless this browser holds a valid affirmation.
 *
 * Called from the experience layout, so it covers every page beneath it —
 * the Gallery included — without each one having to remember.
 */
export async function requireAgeAffirmation(): Promise<void> {
  if (await ageAffirmed()) return;
  redirect(AGE_GATE_ROUTE);
}
