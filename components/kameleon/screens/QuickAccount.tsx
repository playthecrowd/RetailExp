"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";

/**
 * Mock authentication only (checkpoint 3.8) — no account is actually
 * created and no credentials leave the browser. Real Supabase email/
 * password + magic-link auth replaces this in Phase 7.
 */
export function QuickAccount({ onComplete }: { onComplete: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = emailValid && password.length >= 8 && ageConfirmed;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (canSubmit) onComplete();
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
              Create a quick account to choose your path, save progress, and return anytime.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-kameleon-border bg-kameleon-bg/80 p-5 text-left backdrop-blur-sm"
          >
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

            <div>
              <label htmlFor="quick-password" className="mb-1.5 block text-sm text-kameleon-text-muted">
                Create password
              </label>
              <div className="relative">
                <input
                  id="quick-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2.5 pr-16 text-sm text-kameleon-text placeholder:text-kameleon-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-kameleon-text-muted hover:text-kameleon-text"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-kameleon-text-muted">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-kameleon-border accent-kameleon-copper"
              />
              I&apos;m 21 or older
            </label>

            <Button brand="kameleon" size="lg" fullWidth type="submit" disabled={!canSubmit}>
              Continue the experience
            </Button>

            <div className="flex items-center gap-3 text-xs text-kameleon-text-muted">
              <span className="h-px flex-1 bg-kameleon-border" />
              or
              <span className="h-px flex-1 bg-kameleon-border" />
            </div>

            <div>
              <button
                type="button"
                disabled
                aria-describedby="oauth-unavailable"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-kameleon-border text-sm text-kameleon-text-muted/50"
              >
                Continue with Apple
              </button>
            </div>
            <div>
              <button
                type="button"
                disabled
                aria-describedby="oauth-unavailable"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-kameleon-border text-sm text-kameleon-text-muted/50"
              >
                Continue with Google
              </button>
            </div>
            <p id="oauth-unavailable" className="text-center text-[11px] text-kameleon-text-muted/60">
              Apple &amp; Google sign-in are disabled in this preview — available once Supabase auth
              (Phase 7) is connected.
            </p>

            <p className="text-center text-xs text-kameleon-text-muted/70">
              Preview mode — this creates a local mock session only. No account is created and nothing is
              sent anywhere until Supabase auth is connected.
            </p>
          </form>

          <p className="text-sm text-kameleon-text-muted">
            Already have an account?{" "}
            <span className="text-kameleon-copper-light underline-offset-4" title="Not available in this preview">
              Sign in
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
