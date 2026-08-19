"use client";

import { useActionState } from "react";
import {
  unlockPilotAction,
  IDLE_ACCESS_STATE,
} from "@/app/experience/kameleon/access/actions";

/**
 * The access-code form.
 *
 * The input is `type="password"` and `autoComplete="one-time-code"`: the value
 * is a shared secret, so it should not be shoulder-readable and should not be
 * offered back as a saved username on a shared device — which is exactly the
 * device this evaluation runs on.
 *
 * Nothing is validated here beyond requiredness. The Server Action compares in
 * constant time and returns one message for every refusal, so a wrong code and
 * an unconfigured deployment look identical from the browser.
 */
export function AccessForm() {
  const [state, action, pending] = useActionState(unlockPilotAction, IDLE_ACCESS_STATE);

  return (
    <form action={action} className="flex w-full max-w-xs flex-col gap-3">
      <label htmlFor="access-code" className="sr-only">
        Access code
      </label>
      <input
        id="access-code"
        name="accessCode"
        type="password"
        autoComplete="one-time-code"
        required
        maxLength={256}
        placeholder="Access code"
        className="w-full rounded-full border border-kameleon-text/25 bg-transparent px-5 py-3 text-center text-sm text-kameleon-text placeholder:text-kameleon-text/40 focus:border-kameleon-text/60 focus:outline-none"
      />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-kameleon-text px-5 py-3 text-sm font-medium text-kameleon-bg disabled:opacity-60"
      >
        {pending ? "Checking…" : "Enter"}
      </button>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-kameleon-text/80">
          {state.message}
        </p>
      )}
    </form>
  );
}
