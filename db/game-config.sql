-- ===========================================================================
-- game_config: thông số game do admin chỉnh trên trang game-config.html.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file này > Run.
-- An toàn khi chạy lại (idempotent). Cần db/roles.sql đã chạy trước (hàm is_admin()).
--
-- Mô hình:
--   * game_config: mỗi game một hàng; cột data là JSON LỒNG NHAU chỉ chứa phần GHI ĐÈ
--     so với số gốc trong game (không có khoá = dùng số gốc).
--   * game_config_history: bản sao chỉ-thêm của mỗi lần lưu, để khôi phục khi lưu nhầm.
--   * Game đọc bằng khoá anon: GET /rest/v1/game_config?game_id=eq.<id>&select=data
--   * Chỉ admin được ghi (và đọc lịch sử). Người thường/anon chỉ đọc game_config.
-- ===========================================================================

create table if not exists public.game_config (
  game_id    text primary key,
  data       jsonb not null default '{}'::jsonb,
  version    int not null default 1,
  updated_by uuid,
  updated_at timestamptz default now()
);

create table if not exists public.game_config_history (
  id       bigint generated always as identity primary key,
  game_id  text not null,
  data     jsonb not null,
  version  int not null,
  saved_by uuid,
  saved_at timestamptz not null default now()
);
create index if not exists game_config_history_game_idx
  on public.game_config_history (game_id, saved_at desc, id desc);

-- updated_at / updated_by / version do server đặt, client không giả được.
create or replace function public.game_config_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.version := coalesce(old.version, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists game_config_stamp on public.game_config;
create trigger game_config_stamp
  before insert or update on public.game_config
  for each row execute function public.game_config_stamp();

-- Mỗi lần lưu chép vào lịch sử. SECURITY DEFINER để ghi được dù bảng lịch sử không có
-- policy insert cho ai.
create or replace function public.game_config_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.game_config_history (game_id, data, version, saved_by)
  values (new.game_id, new.data, new.version, new.updated_by);
  return new;
end;
$$;

drop trigger if exists game_config_log on public.game_config;
create trigger game_config_log
  after insert or update on public.game_config
  for each row execute function public.game_config_log();

alter table public.game_config enable row level security;
alter table public.game_config_history enable row level security;

drop policy if exists "game_config_select" on public.game_config;
create policy "game_config_select" on public.game_config
  for select to anon, authenticated using (true);

drop policy if exists "game_config_insert_admin" on public.game_config;
create policy "game_config_insert_admin" on public.game_config
  for insert to authenticated with check (public.is_admin());

drop policy if exists "game_config_update_admin" on public.game_config;
create policy "game_config_update_admin" on public.game_config
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Lịch sử: chỉ admin đọc; không có policy insert/update/delete = không ai sửa được qua API.
drop policy if exists "game_config_history_select_admin" on public.game_config_history;
create policy "game_config_history_select_admin" on public.game_config_history
  for select to authenticated using (public.is_admin());

grant select on public.game_config to anon, authenticated;
grant insert, update on public.game_config to authenticated;
grant select on public.game_config_history to authenticated;
