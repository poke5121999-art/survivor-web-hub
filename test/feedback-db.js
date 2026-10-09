/*
 * Kiểm db/feedback.sql trên Postgres WASM (PGlite) với role anon/authenticated giả lập Supabase.
 * Dùng:  node test/feedback-db.js      PGLITE_PATH ghi đè đường dẫn module.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PGLITE = process.env.PGLITE_PATH || path.join(require('os').homedir(), '.cache/pglite-node/node_modules/@electric-sql/pglite/dist/index.cjs');
const DB = path.join(__dirname, '..', 'db');
const KEY = 'test-key-' + crypto.randomBytes(8).toString('hex');
const USER = '11111111-1111-1111-1111-111111111111';

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
insert into auth.users (id, email) values ('${USER}', 'a@b.c');
`;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

async function as(db, role, sub, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ''}', false); set role ${role};`);
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role;'); }
}

(async () => {
  const { PGlite } = require(PGLITE);
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(fs.readFileSync(path.join(DB, 'schema.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(DB, 'policies.sql'), 'utf8'));
  const sql = fs.readFileSync(path.join(DB, 'feedback.sql'), 'utf8');
  const hash = crypto.createHash('sha256').update(KEY).digest('hex');
  await db.exec(sql);
  await db.exec(sql);
  await db.query('insert into public.hub_feedback_keys (hash) values ($1)', [hash]);
  check('feedback.sql chạy hai lần không lỗi', true);

  const ins = 'insert into public.hub_feedback (game_id, kind, title, body, reporter_name, env) values ($1,$2,$3,$4,$5,$6) returning id, status, reporter';
  const guest = await as(db, 'anon', '', ins, ['dredge', 'bug', 'Thuyền kẹt ở đá', 'Bơi vào góc trái thì kẹt', 'Khách', { ua: 'x' }]);
  check('khách gửi được phiếu', guest.rows && guest.rows[0].status === 'open' && guest.rows[0].reporter === null, JSON.stringify(guest.rows || guest.error));

  const member = await as(db, 'authenticated', USER, ins, ['hic', 'feedback', 'Thêm nút tắt nhạc', '', 'An', {}]);
  check('thành viên gửi được phiếu, reporter = auth.uid()', member.rows && member.rows[0].reporter === USER, JSON.stringify(member.rows || member.error));

  const forged = await as(db, 'anon', '', "insert into public.hub_feedback (game_id, kind, title, status) values ('hic','bug','abc','closed')");
  check('client không tự đặt status', /permission denied/.test(forged.error || ''), forged.error);

  const badKind = await as(db, 'anon', '', "insert into public.hub_feedback (game_id, kind, title) values ('hic','spam','abc')");
  check('kind lạ bị chặn', /check constraint/.test(badKind.error || ''), badKind.error);

  const tooLong = await as(db, 'anon', '', ins, ['hic', 'bug', 'abc', 'x'.repeat(4001), 'K', {}]);
  check('body quá 4000 ký tự bị chặn', /check constraint/.test(tooLong.error || ''), tooLong.error);

  const list = await as(db, 'anon', '', 'select id, title from public.hub_feedback order by id');
  check('khách đọc được mọi phiếu', list.rows && list.rows.length === 2, list.rows && list.rows.length);

  const upd = await as(db, 'authenticated', USER, "update public.hub_feedback set status = 'closed'");
  check('update thẳng bị chặn', /permission denied/.test(upd.error || ''), upd.error);

  const del = await as(db, 'anon', '', 'delete from public.hub_feedback');
  check('delete bị chặn', /permission denied/.test(del.error || ''), del.error);

  const keys = await as(db, 'anon', '', 'select * from public.hub_feedback_keys');
  check('bảng hash khoá không đọc được', /permission denied/.test(keys.error || ''), keys.error);

  const id = guest.rows[0].id;
  const rpc = 'select id, status, resolution from public.fb_set_status($1, $2, $3, $4)';
  const wrong = await as(db, 'anon', '', rpc, [id, 'closed', 'x', 'sai-khoa']);
  check('fb_set_status từ chối khoá sai', /triage key rejected/.test(wrong.error || ''), wrong.error);

  const doing = await as(db, 'anon', '', rpc, [id, 'doing', null, KEY]);
  check('fb_set_status đổi sang doing', doing.rows && doing.rows[0].status === 'doing' && doing.rows[0].resolution === null, JSON.stringify(doing.rows || doing.error));

  const closed = await as(db, 'anon', '', rpc, [id, 'closed', 'Sửa ở abc123', KEY]);
  check('fb_set_status đóng phiếu kèm kết quả', closed.rows && closed.rows[0].status === 'closed' && closed.rows[0].resolution === 'Sửa ở abc123', JSON.stringify(closed.rows || closed.error));

  const badStatus = await as(db, 'anon', '', rpc, [id, 'done', null, KEY]);
  check('status lạ bị chặn', /check constraint/.test(badStatus.error || ''), badStatus.error);

  const missing = await as(db, 'anon', '', rpc, [99999, 'closed', null, KEY]);
  check('phiếu không tồn tại báo rõ', /feedback 99999 not found/.test(missing.error || ''), missing.error);

  const touched = (await db.query('select created_at < updated_at as t from public.hub_feedback where id = $1', [id])).rows[0].t;
  check('updated_at được làm mới', touched === true, touched);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
