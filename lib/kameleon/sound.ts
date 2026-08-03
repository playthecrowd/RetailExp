/**
 * Restrained, luxury-oriented interaction sounds — short synthesized tones
 * via the Web Audio API only. No external audio files, no paid sound
 * library, no AI-generated audio (per the standing service restrictions).
 *
 * A single AudioContext is shared module-wide (not per-component) so that
 * the very first real user gesture in the experience (tapping "Tap to
 * Begin") unlocks it for every later programmatic play() call, including
 * ones triggered from timers (e.g. the decision-approaching cue), which
 * browsers would otherwise refuse to start on their own.
 */

export type SoundId =
  | "tapBegin"
  | "commercialComplete"
  | "arComplete"
  | "pathwaySelected"
  | "videoStart"
  | "decisionApproaching"
  | "drawerOpen"
  | "choiceSelected"
  | "pathwayComplete"
  | "journeyComplete";

const MUTE_STORAGE_KEY = "retailexp:kameleon:sound-muted";
const MASTER_GAIN = 0.05; // conservative default volume
const DEDUPE_WINDOW_MS = 150; // avoids stacked duplicate cues (e.g. React effect double-fires in dev)

let audioContext: AudioContext | null = null;
let muted = loadMutedPreference();
const listeners = new Set<(muted: boolean) => void>();
const lastPlayedAt = new Map<SoundId, number>();

function loadMutedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMutedPreference(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

interface Note {
  freq: number;
  start: number;
  duration: number;
  gain?: number;
}

function playTones(ctx: AudioContext, notes: Note[]) {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);
  for (const note of notes) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + note.start;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(note.gain ?? 1, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + note.duration + 0.05);
  }
}

const SOUND_LIBRARY: Record<SoundId, Note[]> = {
  tapBegin: [{ freq: 660, start: 0, duration: 0.25 }],
  commercialComplete: [
    { freq: 523, start: 0, duration: 0.2 },
    { freq: 659, start: 0.15, duration: 0.25 },
  ],
  arComplete: [
    { freq: 587, start: 0, duration: 0.2 },
    { freq: 740, start: 0.15, duration: 0.25 },
  ],
  pathwaySelected: [{ freq: 587, start: 0, duration: 0.18, gain: 0.7 }],
  videoStart: [{ freq: 440, start: 0, duration: 0.12, gain: 0.5 }],
  decisionApproaching: [
    { freq: 784, start: 0, duration: 0.2, gain: 0.4 },
    { freq: 988, start: 0.18, duration: 0.22, gain: 0.4 },
  ],
  drawerOpen: [{ freq: 220, start: 0, duration: 0.3, gain: 0.3 }],
  choiceSelected: [{ freq: 698, start: 0, duration: 0.2 }],
  pathwayComplete: [
    { freq: 523, start: 0, duration: 0.2 },
    { freq: 659, start: 0.15, duration: 0.2 },
    { freq: 784, start: 0.3, duration: 0.35 },
  ],
  journeyComplete: [
    { freq: 523, start: 0, duration: 0.22 },
    { freq: 659, start: 0.18, duration: 0.22 },
    { freq: 880, start: 0.36, duration: 0.5 },
  ],
};

export function playKameleonSound(id: SoundId): void {
  if (muted) return;
  const now = Date.now();
  const last = lastPlayedAt.get(id);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  lastPlayedAt.set(id, now);

  const ctx = ensureContext();
  if (!ctx) return;
  playTones(ctx, SOUND_LIBRARY[id]);
}

export function isKameleonSoundMuted(): boolean {
  return muted;
}

export function setKameleonSoundMuted(next: boolean): void {
  muted = next;
  saveMutedPreference(next);
  for (const listener of listeners) listener(muted);
}

export function subscribeKameleonSoundMuted(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pauses audio when the tab is hidden, resumes when visible again (if unmuted). */
export function handleKameleonVisibilityChange(): void {
  if (!audioContext) return;
  if (document.hidden) {
    audioContext.suspend().catch(() => {});
  } else if (!muted) {
    audioContext.resume().catch(() => {});
  }
}

/** Called when leaving the experience — disposes the shared AudioContext. */
export function disposeKameleonSound(): void {
  audioContext?.close().catch(() => {});
  audioContext = null;
  lastPlayedAt.clear();
}
