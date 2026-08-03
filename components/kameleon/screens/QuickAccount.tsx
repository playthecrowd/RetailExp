"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";
import { saveLocalProfile } from "@/lib/kameleon/profile";

/**
 * Local prototype persistence only (checkpoint 3.8) — no permanent account
 * is created, nothing is sent anywhere, and no password is collected or
 * stored. Real Supabase signup replaces this in Phase 7 (see
 * lib/kameleon/profile.ts for the adapter seam).
 */
export function QuickAccount({ onComplete }: { onComplete: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && emailValid && termsAccepted;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    saveLocalProfile({ firstName: firstName.trim(), lastName: lastName.trim(), email });
    onComplete();
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <EnvironmentArt motif="the-table" className="absolute inset-0" priority />
      <div className="relative flex flex-1 flex-col">
        <KameleonFlowHeader
          underlineCurrent
          steps={[
            { id: "commercial", label: "Commercial", status: "complete" },
            { id: "ar", label: "AR", status: "complete" },
            { id: "journey", label: "Your Journey", status: "current" },
          ]}
        />

        <div className="flex flex-1 flex-col items-center gap-6 px-6 py-6 text-center">
          <KameleonEmblem className="h-8 w-auto" />
          <div>
            <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
              Save your place in the story
            </h1>
            <p className="mt-2 max-w-xs text-sm text-kameleon-text-muted">
              A quick note so we can pick up where you left off — no account, no password.
            </p>
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
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring"
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
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring"
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring"
                placeholder="you@example.com"
              />
            </div>

            <label className="flex items-start gap-2.5 text-sm text-kameleon-text-muted">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-kameleon-border accent-kameleon-copper"
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

            <Button brand="kameleon" size="lg" fullWidth type="submit" disabled={!canSubmit}>
              Continue the experience
            </Button>

            <p className="text-center text-xs text-kameleon-text-muted/70">
              Preview mode — this saves your name and email on this device only. No account is
              created, no password is collected, and nothing is sent anywhere until Supabase is
              connected.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
