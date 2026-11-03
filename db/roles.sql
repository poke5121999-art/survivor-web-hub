-- Survivor Web Hub — role & duyệt tài khoản (Supabase / Postgres)
-- =====================================================================
-- Chạy SAU schema.sql và policies.sql, trong Supabase SQL Editor. Re-runnable (idempotent).
--
-- Thêm cột profiles.role điều khiển ai được chơi game:
--   pending  — tài khoản mới đăng ký, CHƯA chơi được (chờ admin duyệt)   ← mặc định
--   member   — đã duyệt, chơi được mọi game
--   admin    — chơi được + mở được trang duyệt role (admin.html, roles.html)
--   blocked  — bị khoá, không chơi được
--
-- Mọi tài khoản ĐÃ TẠO trước khi chạy file này được nâng lên 'member' (grandfather),
-- đúng như "các tài khoản từ trước tới giờ là member hết". Tài khoản đăng ký SAU đó
-- rơi vào 'pending' và phải được duyệt.
--
-- Cổng phía client (js/game-gate.js) đọc role đã cache trong session để chặn/cho chơi;
-- host tĩnh không chặn được server-side nên đây là cổng UX, không phải access control thật.

-- ---------------------------------------------------------------------------
-- 1) Thêm cột role + grandfather, CHỈ chạy lần đầu (khi cột chưa có).
--    Phải grandfather TRƯỚC khi tạo trigger canh role ở bước 4, nếu không update
--    hàng loạt pending→member sẽ bị chính trigger đó chặn.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    alter table public.profiles add column role text not null default 'pending';
    update public.profiles set role = 'member';  -- mọi tài khoản hiện có → member
  end if;
end $$;

-- Ràng buộc giá trị role hợp lệ (idempotent: bỏ rồi tạo lại).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('pending', 'member', 'admin', 'blocked'));

-- ---------------------------------------------------------------------------
-- 2) is_admin(): true nếu người đang gọi có role 'admin'. SECURITY DEFINER nên nó
--    đọc profiles KHÔNG qua RLS — tránh đệ quy vô hạn khi policy của chính bảng
--    profiles lại truy vấn profiles (bẫy RLS kinh điển của Supabase).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) RLS cho admin: đọc MỌI profile và sửa MỌI profile. Thêm vào cạnh các policy
--    *_own sẵn có (RLS là phép HOẶC của các permissive policy) — admin có thêm
--    quyền, người thường vẫn chỉ thấy/sửa hàng của mình.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Chặn tự nâng role: người thường qua policy profiles_update_own vẫn sửa được
--    hàng của mình (đổi display_name), nhưng KHÔNG được đổi role của chính mình.
--    auth.uid() IS NULL = ngữ cảnh dashboard / service role (toàn quyền) → cho qua,
--    để bootstrap admin đầu tiên ở bước 5 và sửa tay trong dashboard vẫn chạy.
-- ---------------------------------------------------------------------------
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'chi admin moi doi duoc role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ---------------------------------------------------------------------------
-- 5) Bootstrap admin ĐẦU TIÊN — bắt buộc làm tay một lần, thay email của bạn vào.
--    Không có admin nào thì trang duyệt role không mở được cho ai. Chạy dòng này
--    trong dashboard (auth.uid() null nên trigger ở bước 4 cho qua):
--
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'YOU@EXAMPLE.COM');
-- ---------------------------------------------------------------------------
