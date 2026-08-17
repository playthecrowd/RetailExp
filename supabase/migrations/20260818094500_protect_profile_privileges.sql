-- Corrective migration — remove inherited default privileges from
-- public.profiles, close the profile UPDATE policy, and revoke browser-role
-- TRUNCATE across the core tenant tables.
--
-- Found by the Phase 2.5A administrator-authorization audit. The same root
-- cause as 20260817193000, in the place it matters most: the table that
-- carries the platform-administrator flag.
--
-- WHAT IS WRONG
--   Supabase grants a broad default privilege set on new objects in the public
--   schema to `anon` and `authenticated`. Nothing ever revoked it on profiles.
--   Verified against the live schema:
--
--     public.profiles   anon, authenticated:
--       DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     column-level UPDATE and INSERT for both roles covered ALL six columns,
--     including is_platform_admin.
--
--   Three consequences, in descending severity:
--
--   1. ESCALATION HAD A SINGLE BARRIER. `authenticated` — which every Kameleon
--      visitor holds via Anonymous Sign-In — holds UPDATE on the
--      is_platform_admin column, and profiles_update_own permits the row
--      (`using (id = auth.uid())`). The ONLY thing preventing a visitor
--      promoting themselves to platform administrator is the BEFORE UPDATE
--      trigger protect_platform_admin_flag(). That trigger is correct and
--      currently holds — the Phase 2.5A test confirms it — but a single layer
--      is not the model used everywhere else in this schema, and a platform
--      administrator can read every tenant's PII.
--
--   2. THE UPDATE POLICY HAD NO WITH CHECK. profiles_update_own specified
--      `using (id = auth.uid())` and nothing else. USING decides which rows may
--      be TARGETED; WITH CHECK decides what a row may BECOME. Without it,
--      `update profiles set id = <another uuid> where id = auth.uid()` passes
--      RLS. In practice the primary key collides, because handle_new_user()
--      gives every auth user a profile — so this is a missing half of a policy
--      rather than a demonstrated exploit, and it is closed here regardless.
--
--   3. TRUNCATE ON 14 CORE TABLES. TRUNCATE is not subject to RLS and does not
--      fire row-level triggers, so none of the protections on these tables
--      apply to it. No foreign key references profiles, so nothing would block
--      it at the database layer either. PostgREST exposes no TRUNCATE verb, so
--      there is no known reachable path through the Supabase API today; this is
--      defence in depth against a future SECURITY INVOKER function running
--      dynamic SQL, or any direct database access as those roles.
--
-- APPROACH
--   Revoke ALL from public/anon/authenticated on profiles, then re-grant the
--   minimum each surface actually needs. Revoking from `public` as well is
--   defensive: no PUBLIC grant exists today, but a future `grant ... to public`
--   would otherwise be inherited silently.
--
--   No applied migration is edited. handle_new_user() is not touched: it is
--   SECURITY DEFINER, so profile creation on signup and on Anonymous Sign-In is
--   unaffected by removing browser INSERT. protect_platform_admin_flag() is
--   also left exactly as it is — this migration adds a second, independent
--   layer in front of it rather than replacing it.

-- ---------------------------------------------------------------------------
-- 1. profiles — read for both browser roles, self-edit of presentation only
-- ---------------------------------------------------------------------------
revoke all on public.profiles from public, anon, authenticated;

-- SELECT is required by the existing policy surface. profiles_select_own_or_
-- teammate is `id = auth.uid() or is_platform_admin() or <shares a client>`,
-- so an `anon` caller (auth.uid() is null) matches no row and sees nothing;
-- the grant is kept for both roles so a visitor whose session is mid-refresh
-- degrades to an empty result rather than a privilege error.
grant select on public.profiles to anon, authenticated;

-- The only two columns any legitimate caller edits. Verified read-only across
-- app/, lib/, components/ and scripts/: NO application code writes to
-- public.profiles at all today, so this grant is the ceiling for future work
-- rather than a description of current behaviour.
--
-- Deliberately absent, and each for a reason:
--   id                 identity; must never change (also now blocked by the
--                      WITH CHECK added below)
--   is_platform_admin  trusted tier; service_role only, enforced by
--                      protect_platform_admin_flag() AND, from here, by the
--                      absence of the column privilege
--   created_at         immutable provenance
--   updated_at         maintained by the profiles_set_updated_at trigger
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- No INSERT: profile rows are created exclusively by handle_new_user(), which
-- is SECURITY DEFINER and therefore unaffected by this revoke.
-- No DELETE, TRUNCATE, REFERENCES, TRIGGER or MAINTAIN for any browser role.
-- service_role and the table owner (postgres) are untouched by every statement
-- above: none of them names either role.

-- ---------------------------------------------------------------------------
-- 2. Close the profile UPDATE policy
-- ---------------------------------------------------------------------------
-- Superseded rather than edited in place, following the pattern established by
-- 20260804210404. The USING clause is preserved exactly; only the missing
-- WITH CHECK is added, so no currently-permitted row becomes unreachable.
--
-- The role list is also narrowed. The original (20260804152549) has no `to`
-- clause, so it applies to PUBLIC — meaning any role, present or future,
-- inherits it automatically. Scoping it to `authenticated` states the intended
-- model instead of relying on the absence of a grant:
--
--   * every Kameleon visitor already holds the `authenticated` database role
--     via Anonymous Sign-In, so no legitimate caller is excluded;
--   * `anon` has no UPDATE grant after the revoke above, so the policy was
--     never reachable for it anyway;
--   * a future `grant update ... to <some new role>` will NOT silently pick up
--     this policy, which is the failure mode a PUBLIC policy invites.
--
-- service_role is unaffected: it holds BYPASSRLS (verified against the live
-- cluster), so no policy on this table constrains it. That is what keeps the
-- trusted path — including protect_platform_admin_flag()'s service_role
-- branch, and the eventual first-administrator bootstrap — working after this
-- change. The database owner (postgres) likewise holds BYPASSRLS.
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

comment on policy profiles_update_own on public.profiles is
  'Scoped TO authenticated. A signed-in user may edit only their own profile row (USING), and the row must still be their own afterwards (WITH CHECK). Column privileges decide WHICH columns: authenticated holds UPDATE on display_name and avatar_url only. is_platform_admin is unreachable by column privilege and additionally guarded by protect_platform_admin_flag(). service_role holds BYPASSRLS and is not constrained by this policy.';

-- ---------------------------------------------------------------------------
-- 3. Revoke browser-role TRUNCATE across the audited core tables
-- ---------------------------------------------------------------------------
-- Exactly the 14 tables the audit found granting TRUNCATE to anon and
-- authenticated. profiles is already covered by the `revoke all` above and is
-- listed again here so this statement is a complete, self-describing inventory
-- that can be diffed against a future audit.
--
-- Scoped deliberately to TRUNCATE alone. SELECT, INSERT, UPDATE and DELETE on
-- the other 13 tables are NOT altered here — those roles' read/write surface
-- is a separate question needing its own audit, and bundling it into a
-- security fix would make this migration impossible to review.
--
-- Verified before writing this: no migration, test, script, application file,
-- RPC or database function (SECURITY DEFINER or INVOKER) issues TRUNCATE
-- anywhere in this repository or schema. `PUBLIC` currently holds TRUNCATE on
-- zero tables; it is named anyway so a future default grant cannot reinstate
-- this quietly. service_role retains TRUNCATE throughout.
revoke truncate on
  public.brand_settings,
  public.choices,
  public.client_memberships,
  public.clients,
  public.content_nodes,
  public.engagement_events,
  public.experience_user_rewards,
  public.experience_users,
  public.experiences,
  public.journey_progress,
  public.media_assets,
  public.pathways,
  public.profiles,
  public.publication_versions
from public, anon, authenticated;

comment on table public.profiles is
  'One row per auth.users identity, created by handle_new_user() (SECURITY DEFINER). Browser roles hold SELECT plus UPDATE on display_name and avatar_url only. is_platform_admin is writable exclusively by service_role, enforced twice: by the absence of a column privilege and by protect_platform_admin_flag().';
