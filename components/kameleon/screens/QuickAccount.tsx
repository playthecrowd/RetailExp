"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";
import { ProgressSteps, type ProgressStep } from "@/components/ui/ProgressSteps";
import { kameleonPathways, getNode } from "@/lib/kameleon/live-content";
import { createClient } from "@/lib/supabase/client";
import { enrollKameleonUser } from "@/app/experience/kameleon/actions";
import { normalizePhoneInput } from "@/lib/kameleon/phone";

const PASSPORT_STEPS: ProgressStep[] = [
  { id: "intro", label: "Intro Complete", status: "complete" },
  { id: "passport", label: "Create Passport", status: "current" },
  { id: "ar", label: "AR Experience", status: "upcoming" },
  { id: "rewards", label: "Earn Rewards", status: "upcoming" },
];

type SubmitStatus = "idle" | "enrolling" | "created" | "error";

/**
 * Real identity as of Phase 7 Journey/Rewards: submit creates a genuine
 * Supabase Anonymous Sign-In session (if none exists yet) and enrolls a
 * real experience_users row via the enrollKameleonUser server action —
 * replacing the old lib/kameleon/profile.ts localStorage mock outright
 * (see docs/PHASE7_CHECKPOINT_7_3_AUTHENTICATION_PLAN.md). The
 * "PASSPORT CREATED" transition only shows after that real enrollment
 * succeeds; onComplete()/COMPLETE_ACCOUNT still fire exactly as before.
 */
export function QuickAccount({ onComplete }: { onComplete: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // Phone is optional: an empty field is a valid submission ("empty"), and
  // only an actively malformed entry blocks the button. The message is held
  // back until blur so a half-typed number never scolds mid-keystroke.
  const phoneResult = normalizePhoneInput(phone);
  const phoneError = phoneTouched && phoneResult.status === "invalid" ? phoneResult.message : null;
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    emailValid &&
    phoneResult.status !== "invalid" &&
    termsAccepted;
  const submitting = status === "enrolling";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setError(null);
    setStatus("enrolling");
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;
      }
      await enrollKameleonUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        phone,
      });
      setStatus("created");
      window.setTimeout(() => onComplete(), 1100);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong creating your passport. Please try again.");
    }
  }

  const portraits = kameleonPathways
    .slice(0, 4)
    .map((pathway) => ({ id: pathway.id, name: pathway.label, src: getNode(pathway.rootNodeId)?.posterSource ?? "" }))
    .filter((p) => p.src);

  if (status === "created") {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <EnvironmentArt motif="the-table" className="absolute inset-0" priority />
        <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="passport-pulse h-14 w-14 rounded-full border-2 border-kameleon-copper-light" aria-hidden="true" />
          <p className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
            Passport Created
          </p>
          <p className="text-sm text-kameleon-text-muted">Continue to AR.</p>
        </div>
        <style>{`
          .passport-pulse { animation: kameleon-passport-pulse 1.1s ease-out; }
          @keyframes kameleon-passport-pulse {
            0% { transform: scale(0.6); opacity: 0.3; }
            60% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <EnvironmentArt motif="the-table" className="absolute inset-0" priority />
      <div className="kameleon-passport-glow pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <header className="flex justify-center px-4 pt-5">
          <ProgressSteps
            steps={PASSPORT_STEPS}
            brand="kameleon"
            className="flex-wrap gap-x-2 gap-y-1.5 text-[10px]"
          />
        </header>

        <div className="flex flex-1 flex-col items-center gap-5 px-6 py-5 text-center">
          <KameleonEmblem className="h-7 w-auto" />

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-kameleon-copper-light">
              Intro Complete &middot; Your Journey Starts Now
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-text">
              You&apos;re Just Getting Started
            </h1>
            <p className="mt-1 font-display text-sm font-semibold uppercase tracking-wide text-kameleon-copper-light">
              Create Your KAMELEON Passport
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-kameleon-text-muted">
              Get ready to choose a journey. Four different lives. Four pathways. Earn points and
              unlock rewards along the way.
            </p>
          </div>

          {portraits.length === 4 && (
            <div className="grid w-full max-w-xs grid-cols-4 gap-1.5" aria-hidden="true">
              {portraits.map((p, i) => (
                <div
                  key={p.id}
                  className="kameleon-portrait-drift relative aspect-[3/4] overflow-hidden rounded-lg border border-kameleon-border"
                  style={{ animationDelay: `${i * 0.4}s` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-kameleon-copper/30 bg-kameleon-surface/70 px-3.5 py-2 text-left text-xs text-kameleon-text-muted">
            <span className="text-base" aria-hidden="true">✦</span>
            <span>Earn points as you explore pathways — redeemable for rewards.</span>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-kameleon-border bg-kameleon-bg/80 p-5 text-left backdrop-blur-sm"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="quick-first-name" className="mb-1.5 block text-sm text-kameleon-text-muted">
                  First name
                </label>
                <input
                  id="quick-first-name"
                  type="text"
                  autoComplete="given-name"
                  required
                  disabled={submitting}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring disabled:opacity-60"
                  placeholder="Jordan"
                />
              </div>
              <div>
                <label htmlFor="quick-last-name" className="mb-1.5 block text-sm text-kameleon-text-muted">
                  Last name
                </label>
                <input
                  id="quick-last-name"
                  type="text"
                  autoComplete="family-name"
                  required
                  disabled={submitting}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring disabled:opacity-60"
                  placeholder="Rivera"
                />
              </div>
            </div>

            <div>
              <label htmlFor="quick-email" className="mb-1.5 block text-sm text-kameleon-text-muted">
                Email address
              </label>
              <input
                id="quick-email"
                type="email"
                autoComplete="email"
                required
                disabled={submitting}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring disabled:opacity-60"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="quick-phone"
                className="mb-1.5 flex items-baseline justify-between gap-2 text-sm text-kameleon-text-muted"
              >
                <span>Phone number</span>
                <span className="text-xs text-kameleon-text-muted/70">Optional</span>
              </label>
              <input
                id="quick-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                disabled={submitting}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setPhoneTouched(true)}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? "quick-phone-error" : "quick-phone-hint"}
                className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring disabled:opacity-60"
                placeholder="(212) 555-0123"
              />
              {phoneError ? (
                <p id="quick-phone-error" role="alert" className="mt-1.5 text-sm text-kameleon-red">
                  {phoneError}
                </p>
              ) : (
                <p id="quick-phone-hint" className="mt-1.5 text-xs text-kameleon-text-muted/80">
                  You can add a mobile number to your KAMELEON profile.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-sm text-kameleon-text-muted">
              <input
                type="checkbox"
                checked={termsAccepted}
                disabled={submitting}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-kameleon-border accent-kameleon-copper disabled:opacity-60"
              />
              <span>
                I agree to the{" "}
                <span className="text-kameleon-copper-light underline-offset-4" title="Not available in this preview">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="text-kameleon-copper-light underline-offset-4" title="Not available in this preview">
                  Privacy Policy
                </span>
                .
              </span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-kameleon-red">
                {error}
              </p>
            )}

            <Button brand="kameleon" size="lg" fullWidth type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Creating Your Passport…" : "Start Journey"}
            </Button>

            <p className="text-center text-xs text-kameleon-text-muted/70">
              Next: Continue to AR. This saves your name, email, and phone number (if you add one)
              to your KAMELEON passport, used only for your KAMELEON experience — see the Privacy
              Policy above. No password is created.
            </p>
          </form>
        </div>
      </div>

      <style>{`
        .kameleon-passport-glow {
          background: radial-gradient(60% 40% at 50% 0%, rgba(201,138,75,0.16), transparent 70%);
          animation: kameleon-glow-drift 8s ease-in-out infinite;
        }
        @keyframes kameleon-glow-drift {
          0%, 100% { opacity: 0.6; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(6px); }
        }
        .kameleon-portrait-drift {
          animation: kameleon-portrait-parallax 6s ease-in-out infinite;
        }
        @keyframes kameleon-portrait-parallax {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @media (prefers-reduced-motion: reduce) {
          .kameleon-passport-glow, .kameleon-portrait-drift, .passport-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
