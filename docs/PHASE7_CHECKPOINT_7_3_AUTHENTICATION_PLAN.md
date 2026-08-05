# Phase 7 Checkpoint 7.3 — Real Authentication Implementation Plan

**Status: PLANNING ONLY. Nothing in this document has been implemented.**
No migration, no application code, no Supabase Auth provider setting has
been created or changed as part of this plan. Do not begin implementation
until this plan is reviewed and approved.

**Scope:** replacing the two remaining mock-authentication surfaces with
real Supabase Auth — (A) client/admin sign-in for the future admin
dashboard (currently `components/admin/DevAuthNotice.tsx`, a placeholder
that does nothing), and (B) end-customer identity for Quick Account
(currently `lib/kameleon/profile.ts`, a pure `localStorage` mock with no
backend at all). **Not in scope:** migrating the Kameleon journey/pathway
*content* itself off `lib/mock-data/kameleon-pathways.ts` onto the new
Supabase tables — that's the separate, later "data-layer swap" already
tracked as Checkpoint 7.4 in `docs/PHASE7_PLATFORM_ARCHITECTURE_PREFLIGHT.md`
§14, and this plan deliberately does not conflate the two: authentication
(who is signed in) and content delivery (what pathway data they see) are
independent concerns that happen to touch some of the same tables.

---

## 1. Two authentication surfaces

### A. Admin/client-user authentication (`client_memberships`)

Who this is for: the future client dashboard (Experiences, Pathways,
Content Nodes, Choices, Media Library, etc. — Phase 8 scope) and, in the
nearer term, just replacing `DevAuthNotice`'s placeholder so `/admin/**`
isn't wide open.

**Recommended sign-in method: magic link (passwordless email OTP).**
Rationale: this is a small, trusted admin user base (client owners/admins/
editors), not a consumer product — magic link avoids building and
maintaining password-reset UX, email verification flows, and password-
strength/breach-checking entirely, while Supabase Auth's
`signInWithOtp()` handles the whole mechanism. Alternative considered:
email+password — more familiar, but adds real surface area (reset flow,
credential-stuffing exposure) for a user base that doesn't need frequent,
instant re-authentication. **This is a recommendation, not a decision —
flag if you'd prefer password-based instead.**

**Who creates the first membership for a new client:** cannot be
self-service (same reasoning as the trigger bug fixed in Checkpoint 2 —
`client_memberships` writes require an existing `owner`/`admin` row to
already exist for that client). For Kameleon specifically, and for any
future client, the first `owner` membership must be created via a
trusted server-side operation (the secret-key client,
`lib/supabase/secret.ts`) — either you running a one-off script, or (if
recurring) a small platform-admin-only "create client + first owner"
server action. Proposed for this checkpoint: a one-off, manually-run
script (not a standing UI) — a real "invite a new client" admin UI is
Phase 8/9 scope, not needed yet since there's only one client.

**Session handling:** `@supabase/ssr`'s standard Next.js App Router
pattern requires a `middleware.ts` at the project root that calls
`supabase.auth.getUser()` on every request to refresh the session cookie
— without it, a session can silently go stale between visits. This
project doesn't have a `middleware.ts` yet (flagged already as a known
gap in `lib/supabase/server.ts`'s own comment). Proposed: add it, scoped
to refresh the session on `/admin/**` (and, once built, wherever the
end-customer session needs refreshing too — see B below) — not on every
route, to avoid adding latency to the public Kameleon experience pages
that don't need a session at all.

**Route protection:** `/admin/**` currently has zero protection —
`DevAuthNotice` is a static banner, not a gate. Proposed:
`middleware.ts` redirects to a new `/admin/login` page if no session
exists; a server-side check in `app/admin/layout.tsx` (using
`lib/supabase/server.ts`) additionally confirms the signed-in user has
at least one `client_memberships` row, redirecting to an
"access pending"/"no client" state otherwise — two layers, matching the
existing "RLS + trigger" defense-in-depth pattern already used
throughout Checkpoint 2's schema.

**New UI needed:** `/admin/login` (email input → magic link sent →
confirmation state), a sign-out action, and removal of
`DevAuthNotice.tsx`'s placeholder copy once real auth is live.

### B. End-customer authentication (`experience_users`, via Quick Account)

Who this is for: the actual Kameleon visitors currently completing the
local-only Quick Account form.

**Recommended approach: Supabase Anonymous Sign-In**, not magic link/OTP
for customers. Rationale: Quick Account's current UX is deliberately
frictionless — name, email, terms checkbox, immediate continue, no
verification wait. Anonymous sign-in preserves that exactly: it creates a
**real** `auth.users` row (and, via the existing `handle_new_user`
trigger, a real `profiles` row) instantly, client-side, with no email
round-trip — which is what actually matters here, since the goal is
giving `experience_users.auth_user_id` a real, non-null identity so RLS
(`experience_users_select_own`, `journey_progress_*_own`) works as
designed, not necessarily giving the visitor a durable cross-device
account. Supabase supports later "linking" an anonymous user to a real
email if persistent account recovery ever becomes a requirement — not
needed for this checkpoint.

**Manual step required from you:** Anonymous sign-ins are disabled by
default on a new Supabase project and must be enabled in the Dashboard
(Authentication → Providers → Anonymous Sign-Ins) — this is a project
setting, not something a migration can turn on, and not something I
should toggle without your explicit go-ahead, consistent with how every
other Supabase project setting has been handled so far.

**Enrollment flow — decided explicitly, per your instruction not to leave
this ambiguous:**
1. Quick Account submit → if no Supabase Auth session exists yet, create
   one via anonymous sign-in (client-side, `lib/supabase/client.ts`).
2. Call a **server action** (not a raw client-side table insert) that:
   validates the target experience is actually published; checks whether
   an `experience_users` row already exists for this `auth_user_id` +
   `experience_id` (idempotent — don't create a duplicate on a page
   refresh); if not, inserts the row.
3. This server action runs under the user's own now-real session (via
   `lib/supabase/server.ts`, the publishable-key client — **not** the
   secret-key client), relying on RLS, not bypassing it — matching the
   Checkpoint 2 diagnosis's finding that `experience_users_write_own`
   already correctly permits a real self-insert; the fix needed isn't a
   new bypass, it's tightening that same policy (below) and moving the
   "is this experience actually enrollment-eligible" check into the
   action itself rather than trusting a raw open policy alone.

**RLS tightening needed for `experience_users` (Checkpoint 2 gaps this
plan closes):**
- Add a `unique (experience_id, auth_user_id)` constraint — currently
  missing, so nothing today stops a user from self-inserting multiple
  rows for the same experience, fragmenting their own `journey_progress`.
- Tighten `experience_users_write_own`'s `WITH CHECK` to also require
  the target `experience_id` have `publication_status = 'published'` —
  currently a user can self-enroll into any experience, including a
  draft one or another client's, which doesn't leak anything (no SELECT
  policy is gated by `experience_users` existence) but is needless
  surface area worth closing now that it's identified.

---

## 2. Database changes this checkpoint would need (not yet written)

A new additive migration (`CREATE OR REPLACE` / `ALTER TABLE ADD
CONSTRAINT` only, same pattern as every migration so far) would add:
- `unique (experience_id, auth_user_id)` on `experience_users`.
- A tightened `WITH CHECK` on `experience_users_write_own` (published-only
  self-enrollment).

No changes needed to `profiles`, `client_memberships`, or any
role-promotion trigger — Checkpoint 2's design already covers admin
identity correctly; this checkpoint only touches the end-customer side.

## 3. Application code changes this checkpoint would need (not yet written)

- `middleware.ts` (new) — session refresh, scoped to the routes that need it.
- `app/admin/login/page.tsx` (new) — magic-link sign-in form.
- `app/admin/layout.tsx` (edit) — server-side session + membership check.
- `components/admin/DevAuthNotice.tsx` — retired once real auth lands.
- A new server action (e.g. `app/experience/kameleon/actions.ts`) for
  experience enrollment, called from `components/kameleon/screens/
  QuickAccount.tsx` in place of (or alongside, during a transition)
  today's `saveLocalProfile`.
- `lib/kameleon/profile.ts` — decide whether the local-mock path is
  removed outright or kept as a fallback while this rolls out; **default
  recommendation: replace outright**, since maintaining two parallel
  "who is this visitor" sources would be confusing and the local mock
  was always explicitly a placeholder (per that file's own header
  comment) — flag if you'd rather keep a fallback for a transition period.

## 4. Testing/verification plan

Same rigor as Checkpoint 2: a `supabase/tests/` SQL script exercising the
new RLS/constraint behavior (anonymous sign-in can create its own
`experience_users` row; cannot create one for another `auth_user_id`;
cannot enroll into a draft/unpublished or another client's experience;
duplicate enrollment attempt is rejected by the new unique constraint) —
run manually in the Dashboard SQL Editor exactly like
`tenant_isolation_check.sql`, before any migration touches the linked
project. Plus the usual `tsc`/`eslint`/`next build`/secret scan/structural
checks on the application-code side.

## 5. Explicitly deferred (not this checkpoint)

- OAuth/social login for either surface.
- MFA.
- Password-based admin auth (unless you prefer it over magic link).
- A real "invite a new client" admin UI — first-owner provisioning stays
  a manual script for now, since there's only one client.
- Linking an anonymous customer account to a real, durable email.
- Migrating the Kameleon pathway/content *data* itself onto these tables
  (Checkpoint 7.4) — this checkpoint only makes identity real, not content.
- Rate-limiting/abuse prevention beyond Supabase's own defaults.

## 6. Open decisions for you to confirm before implementation

1. Magic link vs. password for admin sign-in (recommendation: magic link).
2. Anonymous sign-in vs. magic link/OTP for Quick Account (recommendation:
   anonymous, to preserve the current frictionless UX).
3. Replace `lib/kameleon/profile.ts`'s local mock outright, or keep a
   fallback during rollout (recommendation: replace outright).
4. Confirm you're willing to manually enable Anonymous Sign-Ins in the
   Supabase Dashboard once implementation begins (required either way —
   not something a migration can do).

Not starting implementation until you've reviewed this and answered (or
explicitly deferred) the four items above.
