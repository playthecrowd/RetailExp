"use client";

import { useActionState } from "react";
import { affirmAgeAction } from "@/app/experience/kameleon/welcome/actions";
import { IDLE_AGE_GATE_STATE } from "@/lib/pilot/age-gate-state";

/**
 * The date-of-birth form.
 *
 * THREE FIELDS, NOT A DATE PICKER. A native date input on mobile opens a
 * calendar that starts at the current month, which is a poor way to reach 1987
 * and a worse way on a phone held one-handed. Month / Day / Year are typed.
 *
 * `inputMode="numeric"` brings up the number pad without `type="number"`,
 * which on several mobile browsers adds spinners, accepts "e" and silently
 * drops leading zeros.
 *
 * NOTHING IS VALIDATED HERE THAT MATTERS. The server recomputes the whole
 * thing against its own clock; the `required` attributes are a courtesy that
 * saves a round trip, not a control. One polite live region announces the
 * result — errors are few and deliberate, so it does not chatter.
 */
export function AgeGateForm() {
  const [state, action, pending] = useActionState(affirmAgeAction, IDLE_AGE_GATE_STATE);

  const field =
    "w-full rounded-lg border border-kameleon-copper/35 bg-black/30 px-3 py-3 text-center text-base " +
    "text-kameleon-text placeholder:text-kameleon-text-muted/60 " +
    "focus:border-kameleon-copper focus:outline-none focus:ring-2 focus:ring-kameleon-copper/50";

  return (
    <form action={action} className="flex w-full max-w-xs flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Your date of birth</legend>

        <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="birthMonth" className="text-[11px] uppercase tracking-widest text-kameleon-text-muted">
              Month
            </label>
            <input
              id="birthMonth"
              name="birthMonth"
              inputMode="numeric"
              autoComplete="bday-month"
              maxLength={2}
              required
              placeholder="MM"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="birthDay" className="text-[11px] uppercase tracking-widest text-kameleon-text-muted">
              Day
            </label>
            <input
              id="birthDay"
              name="birthDay"
              inputMode="numeric"
              autoComplete="bday-day"
              maxLength={2}
              required
              placeholder="DD"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="birthYear" className="text-[11px] uppercase tracking-widest text-kameleon-text-muted">
              Year
            </label>
            <input
              id="birthYear"
              name="birthYear"
              inputMode="numeric"
              autoComplete="bday-year"
              maxLength={4}
              required
              placeholder="YYYY"
              className={field}
            />
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-gradient-to-r from-kameleon-copper to-kameleon-copper-light px-5 py-3.5 text-sm font-medium uppercase tracking-widest text-kameleon-bg transition-opacity focus:outline-none focus:ring-2 focus:ring-kameleon-copper-light focus:ring-offset-2 focus:ring-offset-kameleon-bg disabled:opacity-60"
      >
        {pending ? "Checking…" : "Enter Experience"}
      </button>

      <a
        href="https://www.responsibility.org"
        className="text-center text-xs uppercase tracking-widest text-kameleon-text-muted underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-kameleon-copper/60"
      >
        Exit
      </a>

      {/* One region for the whole form. Empty until there is something to say,
          so a screen reader is not told "no errors" on every keystroke. */}
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-sm text-kameleon-text">
        {state.status === "error" ? state.message : ""}
      </p>
    </form>
  );
}
