"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PILOT_COOKIE_NAME,
  PILOT_COOKIE_MAX_AGE_SECONDS,
  derivePilotCookie,
  submittedCodeMatches,
} from "@/lib/pilot/access-gate";

/**
 * Unlocks the stakeholder evaluation for this browser.
 *
 * All of the comparison logic lives in lib/pilot/access-gate.ts, which reads
 * no configuration and is therefore testable; this only supplies the real code
 * and writes the cookie.
 *
 * ONE MESSAGE FOR EVERY REFUSAL. A wrong code and an unconfigured deployment
 * are indistinguishable from the outside. There is nothing useful a
 * stakeholder can do with the difference and something useful an attacker
 * could.
 *
 * NO RATE LIMIT HERE, STATED PLAINLY RATHER THAN IMPLIED. This is a shared
 * code for a closed evaluation of a few dozen people, sitting behind an
 * unlisted URL; the mitigation is a long random code, not a counter. If the
 * evaluation ever widens, this is the first thing that needs revisiting.
 */

export interface AccessState {
  status: "idle" | "error";
  message: string | null;
}

export const IDLE_ACCESS_STATE: AccessState = { status: "idle", message: null };

const REFUSED = "That access code was not recognised.";

export async function unlockPilotAction(
  _previous: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const submitted = formData.get("accessCode");
  const code = process.env.KAMELEON_PILOT_ACCESS_CODE;

  if (typeof submitted !== "string" || !submittedCodeMatches(submitted, code)) {
    return { status: "error", message: REFUSED };
  }

  const store = await cookies();
  store.set({
    name: PILOT_COOKIE_NAME,
    // Derived from the code, never the code itself: a stolen cookie does not
    // reveal the shared secret, and rotating the code invalidates every
    // outstanding cookie at once with no server-side state to clear.
    value: derivePilotCookie(code as string),
    httpOnly: true,
    // Not readable by script, not sent cross-site, and never sent in the
    // clear. `secure` is unconditional: this only ever runs over HTTPS on
    // Vercel, and a cookie that silently downgrades on http is worse than one
    // that fails visibly.
    secure: true,
    sameSite: "lax",
    path: "/experience/kameleon",
    maxAge: PILOT_COOKIE_MAX_AGE_SECONDS,
  });

  redirect("/experience/kameleon");
}
