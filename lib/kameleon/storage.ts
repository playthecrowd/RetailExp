import { createInitialProgress, isValidViewerProgress, type ViewerProgress } from "./pathway-model";
import { createInitialOpeningGate, type OpeningGateState } from "./types";

/**
 * Two separate stores, deliberately:
 *
 * - Opening-gate state (commercial/AR/account completion) lives in
 *   sessionStorage. It resets whenever the browser tab/window session ends,
 *   so a brand-new visit always starts at Tap to Begin — old saved story
 *   progress can never skip the commercial (Phase 3 correction, review
 *   failure #1).
 * - Story progress (which pathway, which node, history) lives in
 *   localStorage and may legitimately persist across sessions during the
 *   mock phase — that's what "Resume Saved Journey" reads.
 *
 * Both reads fail safe: malformed/corrupt data is treated as absent rather
 * than thrown, and always resolves to the safe default (fresh opening gate,
 * empty progress) rather than crashing or guessing.
 */
const SESSION_KEY = "retailexp:kameleon:session:v2";
const PROGRESS_KEY = "retailexp:kameleon:progress:v2";

function isValidOpeningGate(value: unknown): value is OpeningGateState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.commercialCompleted === "boolean" &&
    typeof v.arAvailable === "boolean" &&
    typeof v.authed === "boolean" &&
    typeof v.arCompleted === "boolean" &&
    typeof v.enteredJourneyThisSession === "boolean"
  );
}

/**
 * Adds fields introduced after a stored session was written.
 *
 * testimonialSubmitted arrived in Phase 4B. Requiring it in the type guard
 * would invalidate every session saved before it existed and drop a visitor
 * mid-experience back to the start, so it is normalized instead — and
 * normalized to FALSE unless explicitly true, which is the fail-closed
 * reading: an old session cannot have submitted a testimonial.
 */
function withDefaults(gate: OpeningGateState): OpeningGateState {
  return {
    ...gate,
    testimonialSubmitted:
      (gate as Partial<OpeningGateState>).testimonialSubmitted === true,
  };
}

export function loadOpeningGate(): OpeningGateState {
  if (typeof window === "undefined") return createInitialOpeningGate();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return createInitialOpeningGate();
    const parsed = JSON.parse(raw);
    return isValidOpeningGate(parsed) ? withDefaults(parsed) : createInitialOpeningGate();
  } catch {
    return createInitialOpeningGate();
  }
}

export function saveOpeningGate(state: OpeningGateState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal — the opening gate simply won't survive this tab session.
  }
}

export function clearOpeningGate(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function loadProgress(): ViewerProgress {
  if (typeof window === "undefined") return createInitialProgress();
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw);
    return isValidViewerProgress(parsed) ? parsed : createInitialProgress();
  } catch {
    return createInitialProgress();
  }
}

export function saveProgress(progress: ViewerProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Non-fatal — progress simply won't persist across reloads.
  }
}

export function clearProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}

/** Used by "Restart Experience" — clears both stores. */
export function clearAllKameleonStorage(): void {
  clearOpeningGate();
  clearProgress();
}
