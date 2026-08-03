"use client";

import { useState } from "react";

/**
 * Visible development/testing action (required by the Phase 3 correction):
 * clears both the session-scoped opening gate and the locally-saved story
 * progress, then returns to Tap to Begin. Uses an inline two-step
 * confirmation instead of window.confirm() so it stays keyboard/AT
 * accessible and testable via automation (native confirm() dialogs block
 * the page).
 */
export function RestartExperience({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-kameleon-red/40 bg-kameleon-surface px-2 py-1 text-[11px] text-kameleon-text-muted">
        <span>Restart and lose progress?</span>
        <button
          type="button"
          onClick={onConfirm}
          className="font-semibold text-kameleon-red underline-offset-2 hover:underline"
        >
          Yes, restart
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="hover:underline">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md px-2 py-1 text-[11px] text-kameleon-text-muted/60 underline-offset-2 hover:text-kameleon-text-muted hover:underline"
    >
      Dev: Restart Experience
    </button>
  );
}
