"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AGE_COOKIE_NAME,
  AGE_COOKIE_MAX_AGE_SECONDS,
  checkAgeAffirmation,
  deriveAgeCookie,
} from "@/lib/pilot/age-gate";
import {
  UNDERAGE_MESSAGE,
  type AgeGateState,
} from "@/lib/pilot/age-gate-state";

/**
 * Records a 21+ affirmation for this browser.
 *
 * THE DATE OF BIRTH LIVES AND DIES IN THIS FUNCTION.
 *   Three numbers arrive, one boolean comes out, and nothing else happens to
 *   them. They are not written to the cookie, not stored, not logged, and not
 *   sent to Supabase, Cloudflare or any analytics — there is no analytics in
 *   this experience at all. The cookie is a signed CONSTANT: it says "this
 *   browser affirmed" and cannot be run backwards into a birthday.
 *
 * THE SERVER'S CLOCK DECIDES.
 *   The date arithmetic is in lib/pilot/age-gate.ts and takes "today" as a
 *   parameter, so the boundary cases are testable; here it is given the
 *   server's own date. A browser cannot move the boundary by changing its
 *   clock, because the browser's clock is never consulted.
 *
 * FAILS CLOSED. With no signing secret there is no affirmation that can be
 * verified later, so none is issued.
 */

const GENERIC_INVALID = "Please enter a valid date of birth.";
const UNAVAILABLE = "The experience isn't available right now. Please try again later.";

export async function affirmAgeAction(
  _previous: AgeGateState,
  formData: FormData,
): Promise<AgeGateState> {
  const secret = process.env.KAMELEON_AGE_GATE_SECRET;
  if (typeof secret !== "string" || secret.trim().length === 0) {
    return { status: "error", message: UNAVAILABLE };
  }

  const now = new Date();
  const result = checkAgeAffirmation(
    {
      year: formData.get("birthYear"),
      month: formData.get("birthMonth"),
      day: formData.get("birthDay"),
    },
    { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
  );

  if (!result.ok) {
    // Underage gets the specific wording the experience is required to show.
    // Everything else gets one message: a person who typed 31 February and a
    // person who typed a future date both need the same correction.
    return {
      status: "error",
      message: result.reason === "underage" ? UNDERAGE_MESSAGE : GENERIC_INVALID,
    };
  }

  const store = await cookies();
  store.set({
    name: AGE_COOKIE_NAME,
    value: deriveAgeCookie(secret),
    httpOnly: true,
    // Secure everywhere it can be. Conditioned only so local development over
    // http still works; every deployed environment is https.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/experience/kameleon",
    maxAge: AGE_COOKIE_MAX_AGE_SECONDS,
  });

  redirect("/experience/kameleon");
}
