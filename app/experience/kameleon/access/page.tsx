import type { Metadata } from "next";
import { AccessForm } from "@/components/kameleon/AccessForm";

/**
 * The stakeholder gate.
 *
 * Deliberately OUTSIDE the (gated) route group — a gate that redirected to
 * itself would loop — while still inside the Kameleon layout, so it carries
 * the experience's own chrome.
 *
 * It says what this is and who it is for. A stakeholder who mistypes a code
 * should not be left wondering whether they are in the right place, and
 * somebody who finds the URL by accident should be able to tell that they are
 * not the audience without being told anything about the evaluation itself.
 */
export const metadata: Metadata = {
  title: "Kameleon — evaluation access",
  robots: { index: false, follow: false },
};

export default function PilotAccessPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-kameleon-text/60">
          Closed evaluation
        </p>
        <h1 className="font-[family-name:var(--font-kameleon-display)] text-3xl">
          Kameleon
        </h1>
        <p className="mx-auto max-w-sm text-sm text-kameleon-text/70">
          This is a private stakeholder evaluation, not a public release. Enter the
          access code you were sent to continue.
        </p>
      </div>

      <AccessForm />

      <p className="mx-auto max-w-sm text-xs text-kameleon-text/50">
        Administered by Plotabl for the Kameleon Beverages project. If you were not
        given a code, this evaluation is not open to you yet.
      </p>
    </main>
  );
}
