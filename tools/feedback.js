#!/usr/bin/env node
/*
 * Hộp thư báo lỗi / góp ý của hub (bảng hub_feedback, xem db/feedback.sql), phía Claude.
 *
 *   node tools/feedback.js list [--game <id>] [--status open,doing|all] [--json]
 *   node tools/feedback.js show <id> [--json] [--shots <thư mục tải ảnh về>]
 *   node tools/feedback.js set <id> <open|doing|closed|wontfix> ["kết quả: commit, vì sao"]
 *   node tools/feedback.js log <id> [--out <tệp .json>]     data log của phiếu gửi bằng F9 trong game
 *   node tools/feedback.js delete <id>                      xoá phiếu (phiếu thử, rác)
 *
 * `set`, `delete` cần khoá triage: biến HUB_FEEDBACK_KEY hoặc tệp ~/.config/survivor-hub/feedback.key.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const STATUSES = ['open', 'doing', 'closed', 'wontfix'];
const COLUMNS = 'id,game_id,kind,title,body,status,resolution,reporter_name,shots,env,created_at,updated_at';

function config() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
  const url = /url:\s*"([^"]+)"/.exec(src);
  const anon = /anonKey:\s*"([^"]+)"/.exec(src);
  if (!url || !anon) throw new Error('js/supabase-config.js has no url/anonKey');
  return { url: url[1].replace(/\/+$/, ''), anon: anon[1] };
}

function triageKey() {
  if (process.env.HUB_FEEDBACK_KEY) return process.env.HUB_FEEDBACK_KEY.trim();
  const f = path.join(os.homedir(), '.config', 'survivor-hub', 'feedback.key');
  if (!fs.existsSync(f)) throw new Error('triage key not found: set HUB_FEEDBACK_KEY or create ' + f);
  return fs.readFileSync(f, 'utf8').trim();
}

async function rest(method, route, body) {
  const c = config();
  const res = await fetch(c.url + '/rest/v1/' + route, {
    method,
    headers: { apikey: c.anon, Authorization: 'Bearer ' + c.anon, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (data && (data.code === 'PGRST205' || data.code === 'PGRST202')) {
    throw new Error('hub_feedback is not installed: paste db/feedback.sql into Supabase SQL Editor');
  }
  if (!res.ok) throw new Error(`${method} ${route.split('?')[0]} -> ${res.status} ${data && (data.message || data.hint) || text}`);
  return data;
}

function shotUrl(p) {
  return config().url + '/storage/v1/object/public/hub-feedback/' + p;
}

async function saveShots(f, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const p of f.shots || []) {
    const res = await fetch(shotUrl(p));
    if (!res.ok) throw new Error('GET ' + p + ' -> ' + res.status);
    const file = path.join(dir, `fb${f.id}-${path.basename(p)}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    out.push(file);
  }
  return out;
}

// Phiếu gửi bằng F9 trong game có env.log = đường dẫn một tấm PNG trong bucket; JSON nén nằm trong chunk
// iTXt "hub-feedback-log" (ghi bởi FB.logPng ở js/feedback-core.js).
async function readLog(f) {
  const p = f.env && f.env.log;
  if (!p) throw new Error('feedback #' + f.id + ' has no data log');
  const res = await fetch(shotUrl(p));
  if (!res.ok) throw new Error('GET ' + p + ' -> ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  for (let at = 8; at + 12 <= buf.length;) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    if (type === 'iTXt') {
      const data = buf.subarray(at + 8, at + 8 + len);
      const z = data.indexOf(0);
      if (data.toString('utf8', 0, z) === 'hub-feedback-log') {
        const flag = data[z + 1];
        let i = data.indexOf(0, z + 3);
        i = data.indexOf(0, i + 1) + 1;
        const body = data.subarray(i);
        return JSON.parse((flag ? require('zlib').inflateSync(body) : body).toString('utf8'));
      }
    }
    at += 12 + len;
  }
  throw new Error('log chunk missing from ' + p);
}

function flags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else out._.push(argv[i]);
  }
  return out;
}

function line(f) {
  const shots = f.shots && f.shots.length ? `  [${f.shots.length} ảnh]` : '';
  return `#${f.id}  [${f.status}] ${f.kind === 'bug' ? 'BUG ' : 'IDEA'}  ${f.game_id}  ${f.title}${shots}  (${f.reporter_name || 'ẩn danh'}, ${f.created_at.slice(0, 10)})`;
}

function detail(f) {
  return [
    line(f),
    '',
    f.body || '(không có mô tả)',
    '',
    'env: ' + JSON.stringify(f.env),
    ...(f.shots || []).map((p) => 'ảnh: ' + shotUrl(p)),
    'kết quả: ' + (f.resolution || '-'),
    'cập nhật: ' + f.updated_at
  ].join('\n');
}

async function main() {
  const a = flags(process.argv.slice(2));
  const [cmd, id, status, ...note] = a._;

  if (cmd === 'list') {
    const st = a.status === 'all' ? null : String(a.status || 'open,doing');
    let q = 'hub_feedback?select=' + COLUMNS + '&order=id.asc';
    if (st) q += '&status=in.(' + st + ')';
    if (a.game) q += '&game_id=eq.' + encodeURIComponent(a.game);
    const rows = await rest('GET', q);
    console.log(a.json ? JSON.stringify(rows, null, 2) : rows.length ? rows.map(line).join('\n') : 'Không có phiếu nào.');
    return;
  }
  if (cmd === 'show' && id) {
    const rows = await rest('GET', 'hub_feedback?select=' + COLUMNS + '&id=eq.' + Number(id));
    if (!rows.length) throw new Error('feedback #' + id + ' not found');
    console.log(a.json ? JSON.stringify(rows[0], null, 2) : detail(rows[0]));
    if (a.shots) (await saveShots(rows[0], String(a.shots))).forEach((f) => console.log('đã tải: ' + f));
    return;
  }
  if (cmd === 'log' && id) {
    const rows = await rest('GET', 'hub_feedback?select=' + COLUMNS + '&id=eq.' + Number(id));
    if (!rows.length) throw new Error('feedback #' + id + ' not found');
    const log = await readLog(rows[0]);
    if (a.out) {
      fs.writeFileSync(String(a.out), JSON.stringify(log, null, 2));
      console.log('đã lưu: ' + a.out);
      return;
    }
    console.log(`${log.at}  ${log.game.id} rev ${log.game.rev || '-'}  ${log.env.viewport}@${log.env.dpr}  fps ${log.perf.fps}`);
    log.errors.forEach((e) => console.log('LỖI  ' + e.m + (e.src ? ' @ ' + e.src : '')));
    log.console.slice(-40).forEach((c) => console.log(`${(c.t / 1000).toFixed(1)}s ${c.l}  ${c.m}${c.n ? '  x' + c.n : ''}`));
    if (log.state !== undefined) console.log('state: ' + JSON.stringify(log.state).slice(0, 2000));
    return;
  }
  if (cmd === 'delete' && id) {
    await rest('POST', 'rpc/fb_delete', { p_id: Number(id), p_key: triageKey() });
    console.log('đã xoá #' + id);
    return;
  }
  if (cmd === 'set' && id && STATUSES.includes(status)) {
    const row = await rest('POST', 'rpc/fb_set_status', {
      p_id: Number(id), p_status: status, p_resolution: note.length ? note.join(' ') : null, p_key: triageKey()
    });
    console.log(line(row) + (row.resolution ? '\n  kết quả: ' + row.resolution : ''));
    return;
  }
  console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(3, 9).map((s) => s.replace(/^ \* ?/, '')).join('\n'));
  process.exit(2);
}

main().catch((e) => { console.error('feedback: ' + e.message); process.exit(1); });
