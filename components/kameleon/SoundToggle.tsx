"use client";

import { useKameleonSound } from "@/lib/kameleon/useKameleonSound";
import { SoundIcon, MuteIcon } from "./icons";

/** Persistent, always-reachable mute control (audio requirements: user must always be able to mute). */
export function SoundToggle() {
  const { muted, toggleMuted } = useKameleonSound();

  return (
    <button
      type="button"
      onClick={toggleMuted}
      aria-pressed={muted}
      aria-label={muted ? "Unmute Kameleon sound" : "Mute Kameleon sound"}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-kameleon-text-muted/70 hover:text-kameleon-text-muted"
    >
      {muted ? <MuteIcon className="h-3.5 w-3.5" /> : <SoundIcon className="h-3.5 w-3.5" />}
      {muted ? "Sound off" : "Sound on"}
    </button>
  );
}
