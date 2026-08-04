# Phase 7 — Role/PII Matrix and Private Media Delivery Strategy

Written in response to the Checkpoint 7.2 review's Corrections 3 and 4.
Correction 3 is implemented in this checkpoint's migrations (not
committed until reviewed again). Correction 4 is a **design document
only** — the actual signed-URL API route is later work (Checkpoint 7.5 in
`docs/PHASE7_PLATFORM_ARCHITECTURE_PREFLIGHT.md` §14), since this
checkpoint's scope is schema + RLS + storage design, not application code.

## Role / PII matrix

| Capability | Owner | Admin | Editor | Viewer | Platform admin |
|---|---|---|---|---|---|
| Manage memberships (invite/remove/change role) | ✅ | ✅ | ❌ | ❌ | ✅ (any client) |
| Change their own role | ❌ (nobody can) | ❌ | ❌ | ❌ | ❌ |
| View experience_users PII (email/display name) | ✅ | ✅ | ❌ | ❌ | ✅ |
| Manage experiences/pathways/content_nodes/choices/media | ✅ | ✅ | ✅ | ❌ | ✅ |
| Preview draft/unpublished content | ✅ | ✅ | ✅ | ✅ (read-only) | ✅ |
| View analytics (`engagement_events`) | ✅ | ✅ | ✅ | ✅ (aggregate) | ✅ |
| Delete a client | ❌ | ❌ | ❌ | ❌ | ✅ only |

Implementation (all in `supabase/migrations/*_rls_policies.sql` and
`*_role_promotion_protections.sql`):

- `can_edit_client(client_id)` — owner/admin/editor — gates content writes.
- `can_manage_members(client_id)` — owner/admin only — gates
  `client_memberships` insert/update. An editor's write attempt is
  rejected by RLS before it ever reaches the
  `protect_membership_role_changes` trigger.
- `is_client_owner(client_id)` — owner only — gates membership delete and
  (via the trigger) actual role-value changes.
- `can_view_experience_user_pii(client_id)` — owner/admin only — gates all
  read access to `experience_users` (which carries `email`/`display_name`)
  other than a user's own row. Editor and viewer currently have **zero**
  direct visibility into `experience_users`, not even a masked view — the
  review's own phrasing ("unless explicitly granted later") is taken
  literally: nothing is granted now, and a future masked/non-PII view is
  explicitly left as later work rather than guessed at today.
- `profiles_protect_platform_admin_flag` trigger — nobody but a
  secret-key operation can grant platform-admin access, including an
  existing platform admin trying to grant it to someone else through a
  normal client update.

**Profiles cannot be enumerated across tenants:** `profiles_select_own_or_
teammate` (in `rls_policies.sql`) only reveals another profile when the
requester shares a `client_memberships` row for the **same** `client_id`
as that profile — not merely because both are authenticated. Verified by
Checkpoint 2's `tenant_isolation_check.sql` Check 2 (a Kameleon admin
cannot see the other tenant's membership row) and Check 7 (an editor
cannot read `experience_users` PII even within their own client).

**`auth.users` is never exposed directly:** nothing in these migrations
grants `anon`/`authenticated` any privilege on the `auth` schema — Supabase's
API gateway only exposes the `public` (and `storage`) schemas by default,
and `public.profiles` is the only public-schema surface that mirrors
`auth.users`, deliberately narrowed to non-sensitive fields
(`display_name`, `avatar_url`, `is_platform_admin`) plus the RLS policy
above.

## Private media delivery strategy (design only — not implemented this checkpoint)

The `platform-media` Storage bucket is **not public** (Correction 4 of
the review). Every read — including for anonymous customers watching a
published pathway video — goes through a **short-lived signed URL**, not
a permanent public link.

**Server-side signed-URL generation.** A future Route Handler (e.g.
`app/api/media/[assetId]/route.ts`) will:
1. Create a Supabase server client (`lib/supabase/server.ts` — the
   **publishable-key** client, not the secret-key one) using the
   requester's own session/cookies.
2. `SELECT` the requested `media_assets` row through that client. This
   read is subject to the exact same RLS policies already written
   (`media_assets_select_members` / `media_assets_select_published_public`)
   — if the row doesn't come back, the requester was never authorized,
   full stop; there is no separate authorization check to keep in sync.
3. Only if that read succeeds, call
   `supabase.storage.from('platform-media').createSignedUrl(storage_path, expiresInSeconds)`,
   using the **same** session-bound client. `createSignedUrl` is itself
   subject to the Storage RLS policies already written
   (`platform_media_select_members` / `platform_media_select_published_public`)
   — so **no secret key is needed for this operation at all**. The
   two independent RLS layers (table + storage) have to agree before a
   URL is ever produced.

**Expiration.** Recommend 300–600 seconds (5–10 minutes) for video/audio
playback URLs — long enough to cover typical viewing plus seeking, short
enough to limit the value of a leaked/shared link. Poster/thumbnail
images (low sensitivity, small, frequently reused) can use a longer
expiry or be fetched once and cached client-side.

**Tenant and publication validation before signing:** not a separate
check — it's the same RLS read described above. There is deliberately no
second, hand-rolled authorization path to drift out of sync with the
table policies.

**Range requests / seeking:** Supabase Storage is S3-compatible and signed
URLs serve the object with standard HTTP `Range` support — a `<video>`
element seeks against a signed URL exactly as it would against a public
one. No special handling is needed in the player.

**No secret key in the client bundle:** never required by this flow
in the first place (see above) — the browser only ever receives the
short-lived signed URL itself, never any key.

**No signing of unpublished media for anonymous visitors:** structural,
not a convention to remember — an anonymous request's session only
carries the `anon` role, and `media_assets_select_published_public` /
`platform_media_select_published_public` are the *only* policies that
apply to it. Attempting to sign a draft/unpublished asset's path as
`anon` fails at step 2 above (no row returned), so `createSignedUrl` is
never even reached.

**Authorized preview access for client editors/admins:** already covered
— `media_assets_select_members` and `platform_media_select_members` grant
read (and therefore signing) access to draft/unpublished assets for any
client member, so the identical route serves both public playback and
admin preview without a separate "preview mode."

**Refresh strategy when a signed URL expires mid-session:** the player
component catches a failed load/seek (an HTTP 403 from the expired
signed URL, surfaced as the `<video>` element's `error` event), re-calls
the same signing route, swaps in the fresh URL, and resumes from the last
known `currentTime` — the same "detect failure → clean up → fresh attempt"
shape already used by this project's Camera Kit error recovery
(`components/kameleon/ar/KameleonCameraKitExperience.tsx`), not a new
pattern to invent.

**Delivery-ready vs. source/master assets:** `media_assets.is_source_master`
(added in this checkpoint) marks a raw/master upload that is never meant
to be played directly by a customer. Both public policies
(`media_assets_select_published_public` in `rls_policies.sql` and
`platform_media_select_published_public` in
`storage_buckets_and_policies.sql`) exclude `is_source_master = true`
**unconditionally** — even if such an asset were somehow referenced by a
published node (which shouldn't happen, since nodes should only ever
reference the delivery-ready encode), it still could never be publicly
signed or read. This is metadata-driven, not filename-driven, per the
review's explicit guidance.

**Previous unpublished versions / another client's media:** `media_assets`
carries its own `version` integer, and a node/choice's asset FK columns
always point at exactly one current asset id — an older version's row
only stays publicly readable if it's still actually referenced by a
currently-published node (which would be unusual but not incorrect); the
common case is that publishing a new version repoints the node's FK,
after which the old version row simply stops matching either public
policy's `exists (...)` check and becomes unreadable by anonymous
requests. Another client's media can never match, full stop — every
`media_assets` row has a real, trigger-validated `client_id`, and the
public policies never reference `client_id` at all (they gate purely on
publication status of the referencing node/choice), so cross-client
exposure isn't just prevented, it isn't a code path that could exist —
the public policy has no dependency on identity at all, only on
publication state and `is_source_master`.
