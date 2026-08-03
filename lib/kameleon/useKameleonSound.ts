"use client";

import { useEffect, useState } from "react";
import {
  isKameleonSoundMuted,
  playKameleonSound,
  setKameleonSoundMuted,
  subscribeKameleonSoundMuted,
  type SoundId,
} from "./sound";

/** Reactive wrapper around the shared Kameleon sound module (see sound.ts). */
export function useKameleonSound() {
  // SoundToggle (the only consumer) mounts post-hydration only, so reading
  // the shared module state directly here is safe — no SSR/CSR mismatch.
  const [muted, setMuted] = useState(isKameleonSoundMuted);

  useEffect(() => subscribeKameleonSoundMuted(setMuted), []);

  return {
    muted,
    toggleMuted: () => setKameleonSoundMuted(!isKameleonSoundMuted()),
    play: (id: SoundId) => playKameleonSound(id),
  };
}
