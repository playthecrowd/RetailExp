"use client";

import type { ReactNode } from "react";
import { SoundIcon, MuteIcon, RecenterIcon, HelpIcon, ExitIcon, ReplayIcon } from "@/components/kameleon/icons";

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-kameleon-copper-light hover:bg-white/10"
    >
      {children}
    </button>
  );
}

/**
 * Bottom control tray rendered inside the WebXR DOM overlay while a session
 * is active. All controls stay reachable regardless of AR phase — none of
 * these require a surface to already be detected.
 */
export function ARControls({
  soundMuted,
  placed,
  onToggleSound,
  onReposition,
  onReset,
  onHelp,
  onExitAr,
  onEnterJourney,
}: {
  soundMuted: boolean;
  /** Only once the object is actually placed does "Continue Your Journey" appear. */
  placed: boolean;
  onToggleSound: () => void;
  onReposition: () => void;
  onReset: () => void;
  onHelp: () => void;
  onExitAr: () => void;
  onEnterJourney: () => void;
}) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-center gap-1 rounded-full bg-black/55 px-2 py-2 backdrop-blur-sm">
        <IconButton label={soundMuted ? "Unmute Kameleon sound" : "Mute Kameleon sound"} onClick={onToggleSound}>
          {soundMuted ? <MuteIcon className="h-5 w-5" /> : <SoundIcon className="h-5 w-5" />}
        </IconButton>
        <IconButton label="Reposition object" onClick={onReposition}>
          <RecenterIcon className="h-5 w-5" />
        </IconButton>
        <IconButton label="Reset placement" onClick={onReset}>
          <ReplayIcon className="h-5 w-5" />
        </IconButton>
        <IconButton label="AR help" onClick={onHelp}>
          <HelpIcon className="h-5 w-5" />
        </IconButton>
        <IconButton label="Exit AR" onClick={onExitAr}>
          <ExitIcon className="h-5 w-5" />
        </IconButton>
      </div>
      {placed && (
        <button
          type="button"
          onClick={onEnterJourney}
          className="min-h-11 w-full max-w-xs rounded-full bg-kameleon-copper-light px-6 py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper"
        >
          Continue Your Journey
        </button>
      )}
    </div>
  );
}
