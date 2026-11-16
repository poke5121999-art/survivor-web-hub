/*
 * Kiểm db/art-sets.sql trên Postgres WASM (PGlite) với role anon/authenticated giả lập Supabase.
 * Dùng:  node test/art-sets-db.js      PGLITE_PATH ghi đè đường dẫn module.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PGLITE = process.env.PGLITE_PATH || path.join(require('os').homedir(), '.cache/pglite-node/node_modules/@electric-sql/pglite/dist/index.cjs');
const DB = path.join(__dirname, '..', 'db');
const [MEMBER, ARTIST, ADMIN] = ['1', '2', '3'].map(n => n.repeat(8) + '-' + n.repeat(4) + '-' + n.repeat(4) + '-' + n.repeat(4) + '-' + n.repeat(12));

const STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.profiles (id uuid primary key, role text not null default 'pending');
create function public.is_admin() returns boolean language sql security definer stable as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
insert into public.profiles values ('${MEMBER}', 'member'), ('${ARTIST}', 'artist'), ('${ADMIN}', 'admin');
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
`;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
async function as(db, role, sub, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ''}', false); set role ${role};`);
  try { const r = await db.query(sql, params); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role;'); }
}

(async () => {
  const { PGlite } = require(PGLITE);
  const db = new PGlite();
  await db.exec(STUB);
  const sql = fs.readFileSync(path.join(DB, 'art-sets.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  check('chạy lại file không lỗi', true);

  const items = JSON.stringify([{ path: 'art/crew/bao', file: 'x/art/crew/bao.png', w: 1, h: 1, isNew: false }]);
  const ins = (who, extra) => as(db, who ? 'authenticated' : 'anon', who, `insert into art_sets (title, items ${extra ? ', status, review_note' : ''}) values ('t', $1 ${extra ? ", 'approved', 'tự duyệt'" : ''}) returning id, status, author_id, review_note`, [items]);

  let r = await ins(null);
  check('anon không thêm được', !!r.error, r.error);
  r = await ins(MEMBER);
  check('member không thêm được', !!r.error, r.error);
  r = await ins(ARTIST);
  check('artist thêm được, author_id = người gọi', r.rows && r.rows[0].author_id === ARTIST, r.error);
  const id = r.rows && r.rows[0].id;
  r = await ins(ARTIST, true);
  check('artist không tự đặt status/review_note', r.rows && r.rows[0].status === 'submitted' && r.rows[0].review_note === null, JSON.stringify(r.rows || r.error));

  r = await as(db, 'anon', null, 'select id from art_sets');
  check('anon đọc được', r.rows && r.rows.length === 2, r.error);

  const upd = (who) => as(db, 'authenticated', who, `update art_sets set status = 'approved', review_note = 'ok' where id = $1`, [id]);
  for (const [n, w] of [['member', MEMBER], ['artist (người gửi)', ARTIST]]) {
    r = await upd(w);
    check(n + ' không đổi được status', !r.error && r.n === 0, r.error || 'rows=' + r.n);
  }
  r = await as(db, 'anon', null, `update art_sets set status = 'approved'`);
  check('anon không đổi được status', !!r.error || r.n === 0, r.error || 'rows=' + r.n);
  r = await upd(ADMIN);
  check('admin đổi được status', r.n === 1, r.error);
  r = await as(db, 'authenticated', ADMIN, `update art_sets set status = 'banana' where id = $1`, [id]);
  check('status ngoài danh sách bị chặn', !!r.error, r.error);
  r = await as(db, 'authenticated', ARTIST, `delete from art_sets where id = $1`, [id]);
  check('artist không xoá được', r.n === 0, r.error);

  const putObj = (who, role, name) => as(db, role, who, `insert into storage.objects (bucket_id, name) values ('artsets', $1)`, [name]);
  r = await putObj(null, 'anon', 'a/b.png');
  check('anon không tải ảnh lên được', !!r.error, r.error);
  r = await putObj(MEMBER, 'authenticated', 'a/b.png');
  check('member không tải ảnh lên được', !!r.error, r.error);
  r = await putObj(ARTIST, 'authenticated', 'a/b.png');
  check('artist tải ảnh lên được', !r.error, r.error);
  r = await as(db, 'anon', null, `select name from storage.objects where bucket_id = 'artsets'`);
  check('anon đọc được danh sách ảnh', r.rows && r.rows.length === 1, r.error);
  r = await as(db, 'authenticated', ARTIST, `delete from storage.objects where bucket_id = 'artsets'`);
  check('artist không xoá được ảnh', r.n === 0, r.error);
  r = await as(db, 'authenticated', ADMIN, `delete from storage.objects where bucket_id = 'artsets'`);
  check('admin xoá được ảnh', r.n === 1, r.error);
  r = await as(db, 'authenticated', ADMIN, `delete from art_sets`);
  check('admin xoá được dòng', r.n === 2, r.error);

  console.log(`\n${pass} đạt, ${fail} hỏng`);
  process.exit(fail ? 1 : 0);
})();
