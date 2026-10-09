-- Hộp thư báo lỗi / góp ý của hub (feedback.html) — chạy SAU schema.sql và policies.sql.
-- Chạy lại vô hại.
--
-- Ai làm được gì:
--   anon, authenticated  đọc mọi phiếu; gửi phiếu mới (chỉ các cột nội dung, status luôn là 'open').
--   fb_set_status, fb_delete  đổi / xoá phiếu. Người gọi phải là tài khoản có email trong hub_feedback_admins
--                        (feedback-admin.html), hoặc đưa p_key khớp một hash trong hub_feedback_keys (tools/feedback.js
--                        của Claude). Khoá thật ở ~/.config/survivor-hub/feedback.key, repo chỉ giữ SHA-256 của nó.

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

-- Đường dẫn ảnh trong bucket hub-feedback, dạng <game_id>/<uuid>.<webp|jpg|png>, tối đa 3 ảnh.
alter table public.hub_feedback add column if not exists shots text[] not null default '{}'
  check (cardinality(shots) <= 3
         and array_to_string(shots, ' ') ~ '^([a-z0-9-]{1,40}/[0-9a-f-]{36}\.(webp|jpg|png)( |$))*$');

drop trigger if exists touch_hub_feedback on public.hub_feedback;
create trigger touch_hub_feedback
  before update on public.hub_feedback
  for each row execute function public.touch_updated_at();

alter table public.hub_feedback enable row level security;

-- Supabase cấp ALL cho anon/authenticated trên mọi bảng mới; thu lại rồi cấp đúng phần cần.
-- Quyền insert theo cột nên client không đặt được status, resolution, reporter hay id.
revoke all on public.hub_feedback from anon, authenticated;
grant select on public.hub_feedback to anon, authenticated;
grant insert (game_id, kind, title, body, reporter_name, env, shots) on public.hub_feedback to anon, authenticated;

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

create or replace function public.fb_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hub_feedback_keys
    where hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  );
$$;

create table if not exists public.hub_feedback_admins (email text primary key check (email = lower(email)));
alter table public.hub_feedback_admins enable row level security;
revoke all on public.hub_feedback_admins from anon, authenticated;
insert into public.hub_feedback_admins (email) values ('poke5121999@gmail.com'), ('thuongbui.hlo@gmail.com'), ('tamphan@gmail.com')
  on conflict do nothing;

-- Email lấy từ auth.users theo auth.uid() chứ không từ claim trong JWT, để chỉ tài khoản có thật mới khớp.
create or replace function public.fb_can_manage(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fb_key_ok(p_key) or exists (
    select 1 from auth.users u
    join public.hub_feedback_admins a on a.email = lower(u.email)
    where u.id = auth.uid()
  );
$$;

create or replace function public.fb_set_status(p_id bigint, p_status text, p_resolution text, p_key text)
returns public.hub_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.hub_feedback;
begin
  if not public.fb_can_manage(p_key) then
    raise exception 'feedback manage denied' using errcode = '42501';
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

-- Xoá phiếu rác từ feedback-admin.html. Ảnh của phiếu ở lại trong bucket: xoá thẳng storage.objects bằng SQL
-- không xoá file thật, phải xoá ở Storage trên Dashboard.
create or replace function public.fb_delete(p_id bigint, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fb_can_manage(p_key) then
    raise exception 'feedback manage denied' using errcode = '42501';
  end if;
  delete from public.hub_feedback where id = p_id;
  if not found then
    raise exception 'feedback % not found', p_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fb_key_ok(text) from public;
grant execute on function public.fb_key_ok(text) to anon, authenticated;
revoke all on function public.fb_can_manage(text) from public;
grant execute on function public.fb_can_manage(text) to anon, authenticated;
revoke all on function public.fb_delete(bigint, text) from public;
grant execute on function public.fb_delete(bigint, text) to anon, authenticated;

-- Ảnh đính kèm: bucket công khai (xem bằng URL /object/public/ không cần policy), chỉ cho tải lên,
-- không ghi đè, không xoá. Trình duyệt nén ảnh còn tối đa 1600px trước khi gửi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('hub-feedback', 'hub-feedback', true, 1572864, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hub_feedback_shots_upload" on storage.objects;
create policy "hub_feedback_shots_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'hub-feedback'
              and name ~ '^[a-z0-9-]{1,40}/[0-9a-f-]{36}\.(webp|jpg|png)$');
