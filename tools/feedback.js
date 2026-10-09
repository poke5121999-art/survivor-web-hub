#!/usr/bin/env node
/*
 * Hộp thư báo lỗi / góp ý của hub (bảng hub_feedback, xem db/feedback.sql), phía Claude.
 *
 *   node tools/feedback.js list [--game <id>] [--status open,doing|all] [--json]
 *   node tools/feedback.js show <id> [--json]
 *   node tools/feedback.js set <id> <open|doing|closed|wontfix> ["kết quả: commit, vì sao"]
 *
 * `set` cần khoá triage: biến HUB_FEEDBACK_KEY hoặc tệp ~/.config/survivor-hub/feedback.key.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const STATUSES = ['open', 'doing', 'closed', 'wontfix'];
const COLUMNS = 'id,game_id,kind,title,body,status,resolution,reporter_name,env,created_at,updated_at';

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
  return `#${f.id}  [${f.status}] ${f.kind === 'bug' ? 'BUG ' : 'IDEA'}  ${f.game_id}  ${f.title}  (${f.reporter_name || 'ẩn danh'}, ${f.created_at.slice(0, 10)})`;
}

function detail(f) {
  return [
    line(f),
    '',
    f.body || '(không có mô tả)',
    '',
    'env: ' + JSON.stringify(f.env),
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
    return;
  }
  if (cmd === 'set' && id && STATUSES.includes(status)) {
    const row = await rest('POST', 'rpc/fb_set_status', {
      p_id: Number(id), p_status: status, p_resolution: note.length ? note.join(' ') : null, p_key: triageKey()
    });
    console.log(line(row) + (row.resolution ? '\n  kết quả: ' + row.resolution : ''));
    return;
  }
  console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(3, 7).map((s) => s.replace(/^ \* ?/, '')).join('\n'));
  process.exit(2);
}

main().catch((e) => { console.error('feedback: ' + e.message); process.exit(1); });
