-- Survivor Web Hub — shared player database schema (Supabase / Postgres)
-- =====================================================================
-- Run this FIRST in the Supabase SQL editor (Dashboard → SQL Editor → New query),
-- then run policies.sql. Re-runnable (idempotent) — safe to paste again.
--
-- What this creates:
--   profiles    — one row per signed-in player (identity + display fields)
--   game_saves  — one row per (player, game); the save payload every hub game reads/writes
--   handle_new_user() — auto-creates a profile row when a player signs up
--   touch_updated_at() — keeps updated_at fresh on writes
--
-- Security lives in policies.sql (Row Level Security). This file only defines structure.
-- SEE: web-hub/db/README.md for the full setup runbook + key-safety rules.

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated player. id == auth.users.id (1:1).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- game_saves: one row per (player, game). Adding a game later is a new game_id
-- string, never a schema change — this is the "one database, many games" shape.
-- ---------------------------------------------------------------------------
create table if not exists public.game_saves (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  game_id    text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  version    integer     not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id),
  -- WHY: cap each save so one player cannot exhaust the shared free-tier 500 MB DB.
  -- ROOT-CAUSE: an uncapped jsonb column on a shared, per-player-writable table is an
  --   unbounded-write surface. pg_column_size() is the on-disk (TOAST-compressed) byte
  --   size; ~100 KB is generous for a game save blob.
  -- SEE: web-hub/db/README.md (payload cap rationale)
  constraint game_saves_payload_max_size check (pg_column_size(payload) <= 102400)
);

-- The (user_id, game_id) primary key has user_id as its leading column, so the RLS
-- filter `auth.uid() = user_id` (policies.sql) is already index-backed. No extra index.

-- ---------------------------------------------------------------------------
-- Auto-create a profile row on sign-up.
-- WHY: profiles.id must equal the new auth.users.id. Doing the insert in a
--   SECURITY DEFINER trigger means the client never inserts its own profile and
--   therefore cannot forge a row under another player's id.
-- ROOT-CAUSE: client-side profile creation would let a caller pick any id.
-- SEE: https://supabase.com/docs/guides/auth/managing-user-data
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh so newer-wins conflict resolution (Phase 5.3 sync policy)
-- has a reliable timestamp without trusting the client to set it.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_game_saves on public.game_saves;
create trigger touch_game_saves
  before update on public.game_saves
  for each row execute function public.touch_updated_at();
