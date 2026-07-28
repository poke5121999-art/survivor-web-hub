-- Survivor Web Hub — Row Level Security (RLS) policies
-- ====================================================
-- Run this AFTER schema.sql. Re-runnable (drops each policy before recreating).
--
-- WHY deny-by-default: a Postgres table with RLS ENABLED and NO permissive policy
--   denies all access to everyone. That is the intended posture here — every table
--   below enables RLS and then adds ONLY owner-scoped policies. There is deliberately
--   no `true` / public / anon-readable policy anywhere.
-- ROOT-CAUSE this guards: CVE-2025-48757 (May 2025) — 10.3% of analyzed Supabase apps
--   shipped public-readable tables because RLS was left off by default. Enabling RLS on
--   every table + owner-only policies is the direct mitigation.
-- SEE: https://vibeappscanner.com/best-practices/supabase
--      https://supabase.com/docs/guides/database/postgres/row-level-security

alter table public.profiles   enable row level security;
alter table public.game_saves enable row level security;

-- WHY (select auth.uid()) instead of bare auth.uid(): wrapping the auth call in a
--   scalar subselect lets Postgres evaluate it once per statement instead of once per
--   row — the documented Supabase RLS performance pattern. Functionally identical,
--   materially faster on multi-row scans.

-- ---------------------------------------------------------------------------
-- profiles — a player may read and edit only their own profile row.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- No delete policy: profile rows are removed only via the auth.users ON DELETE CASCADE.

-- ---------------------------------------------------------------------------
-- game_saves — a player may read/write only rows they own.
-- WITH CHECK on writes stops a player from inserting or moving a row under some
-- other player's user_id.
-- ---------------------------------------------------------------------------
drop policy if exists "game_saves_select_own" on public.game_saves;
create policy "game_saves_select_own" on public.game_saves
  for select using ((select auth.uid()) = user_id);

drop policy if exists "game_saves_insert_own" on public.game_saves;
create policy "game_saves_insert_own" on public.game_saves
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "game_saves_update_own" on public.game_saves;
create policy "game_saves_update_own" on public.game_saves
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "game_saves_delete_own" on public.game_saves;
create policy "game_saves_delete_own" on public.game_saves
  for delete using ((select auth.uid()) = user_id);
