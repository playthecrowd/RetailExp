/**
 * Local-only prototype profile storage for the Quick Account screen. No
 * password is ever collected or stored, and no account is actually
 * created — this exists purely so the mock "save your place" flow has
 * somewhere to put the name/email the visitor typed.
 *
 * Adapter seam for Phase 7: once Supabase auth is connected, replace the
 * body of `saveLocalProfile` with a real signup/upsert call (keeping the
 * same `KameleonProfileDraft` shape and call site in QuickAccount.tsx) —
 * nothing else in the app reads this data yet, so the swap is isolated here.
 */
export interface KameleonProfileDraft {
  firstName: string;
  lastName: string;
  email: string;
}

const PROFILE_STORAGE_KEY = "retailexp:kameleon:profile:v1";

export function saveLocalProfile(profile: KameleonProfileDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Non-fatal — the profile simply won't persist across reloads.
  }
}

export function loadLocalProfile(): KameleonProfileDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.firstName === "string" &&
      typeof parsed.lastName === "string" &&
      typeof parsed.email === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
