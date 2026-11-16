-- ===========================================================================
-- art_sets: bộ art họa sĩ gửi từ bản web DEV của game (games/boohaul) để chủ dự án duyệt.
-- Hợp đồng dữ liệu: D:/REPO_Meta/docs/art-sets-contract.md (repo Meta). Trang xem/duyệt: art-sets.html.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run (hoặc
--   npx supabase db query --remote=<ref> --yes -f db/art-sets.sql). Chạy lại vô hại (idempotent).
-- Cần db/roles.sql đã chạy trước (profiles.role, is_admin()).
--
-- Quyền:
--   * art_sets: ai cũng đọc; artist/admin thêm dòng; chỉ admin đổi status/review_note/pulled_commit
--     (và xoá). Người gửi KHÔNG sửa được dòng của mình sau khi gửi (gửi lại = bộ mới).
--   * bucket artsets: đọc công khai; artist/admin tải lên (kể cả ghi đè); chỉ admin xoá.
-- ===========================================================================

-- 1) Thêm role 'artist' (được vào game như member, thêm quyền gửi art).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('pending', 'member', 'artist', 'admin', 'blocked'));

-- Người đang gọi có phải artist hoặc admin không. SECURITY DEFINER để đọc profiles không qua RLS.
create or replace function public.is_artist()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('artist', 'admin')
  );
$$;
revoke all on function public.is_artist() from public;
grant execute on function public.is_artist() to anon, authenticated;

-- 2) Bảng
create table if not exists public.art_sets (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  note          text,
  author_id     uuid default auth.uid(),
  author_name   text,
  status        text not null default 'submitted'
                check (status in ('submitted', 'approved', 'rejected', 'pulled')),
  base_version  text,
  items         jsonb not null,
  review_note   text,
  pulled_commit text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists art_sets_created_idx on public.art_sets (created_at desc);

create or replace function public.art_sets_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists art_sets_touch on public.art_sets;
create trigger art_sets_touch
  before update on public.art_sets
  for each row execute function public.art_sets_touch();

-- Dòng mới: người gửi không tự đặt trạng thái duyệt / ghi chú / commit; author_id luôn là người gọi.
create or replace function public.art_sets_guard_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() then
    new.status := 'submitted';
    new.review_note := null;
    new.pulled_commit := null;
  end if;
  new.author_id := coalesce(auth.uid(), new.author_id);
  return new;
end;
$$;

drop trigger if exists art_sets_guard_insert on public.art_sets;
create trigger art_sets_guard_insert
  before insert on public.art_sets
  for each row execute function public.art_sets_guard_insert();

alter table public.art_sets enable row level security;

drop policy if exists "art_sets_select" on public.art_sets;
create policy "art_sets_select" on public.art_sets
  for select to anon, authenticated using (true);

drop policy if exists "art_sets_insert_artist" on public.art_sets;
create policy "art_sets_insert_artist" on public.art_sets
  for insert to authenticated with check (public.is_artist());

drop policy if exists "art_sets_update_admin" on public.art_sets;
create policy "art_sets_update_admin" on public.art_sets
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "art_sets_delete_admin" on public.art_sets;
create policy "art_sets_delete_admin" on public.art_sets
  for delete to authenticated using (public.is_admin());

grant select on public.art_sets to anon, authenticated;
grant insert, update, delete on public.art_sets to authenticated;

-- 3) Bucket ảnh: đọc công khai qua /object/public/artsets/<id>/<path>.png
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('artsets', 'artsets', true, 8388608, array['image/png'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "artsets_insert_artist" on storage.objects;
create policy "artsets_insert_artist" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'artsets' and public.is_artist());

-- Ghi đè (upsert) cần cả update lẫn select trên đối tượng.
drop policy if exists "artsets_update_artist" on storage.objects;
create policy "artsets_update_artist" on storage.objects
  for update to authenticated
  using (bucket_id = 'artsets' and public.is_artist())
  with check (bucket_id = 'artsets' and public.is_artist());

drop policy if exists "artsets_select_public" on storage.objects;
create policy "artsets_select_public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'artsets');

drop policy if exists "artsets_delete_admin" on storage.objects;
create policy "artsets_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'artsets' and public.is_admin());
