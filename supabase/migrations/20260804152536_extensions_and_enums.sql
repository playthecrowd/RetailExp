-- Phase 7 Checkpoint 2 — extensions and enum types.
-- Universal multi-tenant platform schema. No table, enum, or column here is
-- named after Kameleon, wine, bottles, or a specific campaign — see
-- docs/PHASE7_PLATFORM_ARCHITECTURE_PREFLIGHT.md for the full rationale.

create extension if not exists "pgcrypto" with schema extensions;

create type public.client_status as enum ('active', 'inactive', 'archived');

create type public.membership_role as enum ('owner', 'admin', 'editor', 'viewer');

create type public.publication_status as enum ('draft', 'published', 'archived');

create type public.processing_status as enum ('pending', 'processing', 'ready', 'failed');

create type public.media_type as enum ('video', 'image', 'captions', 'audio');

-- Not a closed set of "screen kinds" — deliberately covers every
-- video-bearing moment in an experience (commercial, AR intro, branching
-- chapters, journey completion) in one table (content_nodes), per Decision 2.
create type public.content_node_type as enum (
  'commercial',
  'ar_intro',
  'pathway_chapter',
  'journey_completion',
  'other'
);

create type public.player_status as enum (
  'not_started',
  'playing',
  'awaiting_choice',
  'terminal_complete'
);
