"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { KameleonWordmark } from "@/components/kameleon/Wordmark";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { KameleonBottle } from "@/components/kameleon/art/Bottle";
import { playKameleonSound } from "@/lib/kameleon/sound";

export function TapToBegin({ onBegin }: { onBegin: () => void }) {
  const [connected] = useState(true);

  function handleBegin() {
    // The very first real user gesture in the experience — this is what
    // unlocks the shared AudioContext for every later sound cue.
    playKameleonSound("tapBegin");
    onBegin();
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-8 text-center">
      {/* Directional red/blue lighting either side of the bottle, per screen 01. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-kameleon-blue/25 via-transparent to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-kameleon-red/25 via-transparent to-transparent" />

      <KameleonEmblem className="relative h-8 w-auto" />
      <KameleonBottle className="relative h-56 w-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.6)]" />

      <div className="relative flex flex-col items-center gap-3">
        <KameleonWordmark className="text-3xl" />
        <p className="max-w-xs text-xs uppercase tracking-widest text-kameleon-text-muted">
          Every pour is a transformation.
        </p>
        <p className="max-w-xs text-xs text-kameleon-text-muted">
          Four cities. Four lives. One moment. One connection.
        </p>
      </div>

      <Button brand="kameleon" variant="secondary" size="lg" fullWidth onClick={handleBegin} className="relative max-w-sm">
        Tap to begin your journey
      </Button>

      <p className="relative flex items-center gap-1.5 text-[11px] text-kameleon-text-muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M4 12a8 8 0 0 1 16 0" />
          <path d="M7 12a5 5 0 0 1 10 0" />
          <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
        </svg>
        {connected ? "Bottle connected (demo)" : "Bottle not detected"}
      </p>
    </div>
  );
}
