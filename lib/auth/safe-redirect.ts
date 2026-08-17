/**
 * Open-redirect prevention for the `?next=` parameter on /admin/login.
 *
 * Deliberately an allow-list, not a block-list: a value is rejected unless it
 * is provably a local path inside the admin area. Block-lists for this have a
 * long history of being defeated by an encoding nobody thought of, so the only
 * accepted shape is a single leading slash followed by `admin`.
 *
 * Kept free of any server-only import so the structural check in
 * scripts/verify-admin-auth.mjs can exercise it directly.
 */

/** Where an administrator lands when no valid destination was supplied. */
export const ADMIN_HOME = "/admin";

/**
 * The paths that must never be a post-login destination, because landing on
 * them would immediately bounce the administrator back out again.
 */
const NON_DESTINATIONS = new Set(["/admin/login", "/admin/access-denied"]);

/**
 * True if the string contains any character that has no business in a path we
 * generated: C0 controls (NUL, CR, LF, tab), space, and DEL. Written as an
 * explicit code-point scan rather than a regex so there is no escaping
 * subtlety to get wrong, and so it cannot silently stop matching if the file
 * is ever re-encoded.
 */
function hasUnsafeCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns a safe local path to redirect to after a successful sign-in.
 *
 * Rejects, and falls back to ADMIN_HOME:
 *   - absolute URLs of any scheme (`https://evil.example`, `javascript:…`)
 *   - protocol-relative URLs (`//evil.example`) — these are the classic miss
 *   - backslash variants (`/\evil.example`, `\\evil.example`) that some
 *     browsers normalise into a protocol-relative URL
 *   - anything containing a control character, space or DEL
 *   - paths outside /admin, so a valid-looking `/experience/...` can't be used
 *     to bounce an administrator into the visitor flow
 *   - /admin/login and /admin/access-denied, which would loop
 */
export function resolveSafeAdminRedirect(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return ADMIN_HOME;

  if (hasUnsafeCharacters(raw)) return ADMIN_HOME;

  // A backslash is never legitimate in a path we generate, and browsers
  // disagree about how they normalise it. Reject rather than interpret.
  if (raw.includes("\\")) return ADMIN_HOME;

  // Must be exactly one leading slash. `//host` and `///host` are
  // protocol-relative and would leave the site.
  if (!raw.startsWith("/") || raw.startsWith("//")) return ADMIN_HOME;

  // No scheme, no credentials, no host — a local path has none of these.
  if (raw.includes(":") || raw.includes("@")) return ADMIN_HOME;

  // Confine the destination to the admin area. Compared against the path
  // alone so a query string can't smuggle in a different prefix.
  const path = raw.split(/[?#]/, 1)[0];
  if (path !== "/admin" && !path.startsWith("/admin/")) return ADMIN_HOME;

  if (NON_DESTINATIONS.has(path)) return ADMIN_HOME;

  return raw;
}
