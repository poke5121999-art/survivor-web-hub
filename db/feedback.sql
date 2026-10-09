-- Hộp thư báo lỗi / góp ý của hub (feedback.html) — chạy SAU schema.sql và policies.sql.
-- Chạy lại vô hại.
--
-- Ai làm được gì:
--   anon, authenticated  đọc mọi phiếu; gửi phiếu mới (chỉ các cột nội dung, status luôn là 'open').
--   fb_set_status(...)   đổi status + ghi kết quả. Chỉ chạy khi p_key khớp một hash trong
--                        hub_feedback_keys. Khoá thật nằm ở máy chủ hub (~/.config/survivor-hub/feedback.key),
--                        repo chỉ giữ SHA-256 của nó. tools/feedback.js là người gọi duy nhất.

create table if not exists public.hub_feedback (
  id            bigint      generated always as identity primary key,
  game_id       text        not null check (game_id ~ '^[a-z0-9-]{1,40}$'),
  kind          text        not null check (kind in ('bug', 'feedback')),
  title         text        not null check (char_length(title) between 3 and 120),
  body          text        not null default '' check (char_length(body) <= 4000),
  status        text        not null default 'open' check (status in ('open', 'doing', 'closed', 'wontfix')),
  resolution    text        check (char_length(resolution) <= 2000),
  reporter      uuid        default auth.uid() references auth.users (id) on delete set null,
  reporter_name text        check (char_length(reporter_name) <= 40),
  env           jsonb       not null default '{}'::jsonb check (pg_column_size(env) <= 2048),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists touch_hub_feedback on public.hub_feedback;
create trigger touch_hub_feedback
  before update on public.hub_feedback
  for each row execute function public.touch_updated_at();

alter table public.hub_feedback enable row level security;

-- Supabase cấp ALL cho anon/authenticated trên mọi bảng mới; thu lại rồi cấp đúng phần cần.
-- Quyền insert theo cột nên client không đặt được status, resolution, reporter hay id.
revoke all on public.hub_feedback from anon, authenticated;
grant select on public.hub_feedback to anon, authenticated;
grant insert (game_id, kind, title, body, reporter_name, env) on public.hub_feedback to anon, authenticated;

-- Bảng công khai có chủ đích: người chơi xem được phiếu của nhau để khỏi báo trùng, và khách
-- chưa đăng nhập cũng báo lỗi được. Giới hạn độ dài ở bảng chặn một phiếu phình to.
drop policy if exists "hub_feedback_select_all" on public.hub_feedback;
create policy "hub_feedback_select_all" on public.hub_feedback
  for select to anon, authenticated using (true);

drop policy if exists "hub_feedback_insert_any" on public.hub_feedback;
create policy "hub_feedback_insert_any" on public.hub_feedback
  for insert to anon, authenticated with check (status = 'open' and resolution is null);

create table if not exists public.hub_feedback_keys (hash text primary key);
alter table public.hub_feedback_keys enable row level security;
revoke all on public.hub_feedback_keys from anon, authenticated;
insert into public.hub_feedback_keys (hash)
  values ('b3e0fc55c03a9fe2e5c47c4b9fadb4867e91ed0f76e6a3995e5d7c39f615f18e')
  on conflict do nothing;

create or replace function public.fb_set_status(p_id bigint, p_status text, p_resolution text, p_key text)
returns public.hub_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.hub_feedback;
begin
  if not exists (
    select 1 from public.hub_feedback_keys
    where hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  ) then
    raise exception 'triage key rejected' using errcode = '42501';
  end if;
  update public.hub_feedback
     set status = p_status,
         resolution = coalesce(p_resolution, resolution)
   where id = p_id
  returning * into r;
  if r.id is null then
    raise exception 'feedback % not found', p_id using errcode = 'P0002';
  end if;
  return r;
end;
$$;

revoke all on function public.fb_set_status(bigint, text, text, text) from public;
grant execute on function public.fb_set_status(bigint, text, text, text) to anon, authenticated;
