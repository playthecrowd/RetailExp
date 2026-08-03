"use client";

import { Button } from "@/components/ui/Button";
import type { ARError } from "@/lib/kameleon/ar/ar-types";

/**
 * Full-screen error state — rendered after the AR session (if any) has
 * already been cleanly ended, replacing the AR screen's content entirely
 * rather than floating over a partially-torn-down camera view.
 */
export function ARErrorState({
  error,
  onRetry,
  onContinueWithoutAr,
}: {
  error: ARError;
  onRetry: () => void;
  onContinueWithoutAr: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-red">
        AR couldn&apos;t continue
      </h1>
      <p className="max-w-xs text-sm text-kameleon-text-muted">{error.message}</p>
      <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-3">
        {error.recoverable && (
          <Button brand="kameleon" size="lg" fullWidth onClick={onRetry}>
            Try again
          </Button>
        )}
        <button
          type="button"
          onClick={onContinueWithoutAr}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          Continue without AR
        </button>
      </div>
    </div>
  );
}
