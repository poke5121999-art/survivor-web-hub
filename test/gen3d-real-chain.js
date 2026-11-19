// Chạy một chuỗi THẬT qua function gen3d-studio đã deploy, như trang gửi: tải ảnh → shape (Texture bật) → texture tự ra → rig.
// Cần worker thật đang chạy (tools/gen3d-worker/worker.py, pipelines.json), ~/.rc-bot-password, ~/.gen3d-worker-key không cần.
//   node test/gen3d-real-chain.js run --worker pc:gen3d front=D:\a.png [back=.. left=.. right=..]   in id từng bước, chờ tới rig xong
//   node test/gen3d-real-chain.js get <id> | delete <id>
const fs = require('fs'), os = require('os'), path = require('path');
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
const BASE = cfgSrc.match(/url: "([^"]+)"/)[1], ANON = cfgSrc.match(/anonKey: "([^"]+)"/)[1];
const FN = `${BASE}/functions/v1/gen3d-studio`;
const BOT_PW = process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIMIT_S = +(process.env.GEN3D_CHAIN_TIMEOUT_S || 5400);

let tok;
async function art(body) {
  const r = await fetch(FN, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  if (!j.ok) throw new Error(`${body.action}: ${j.error?.code} ${j.error?.message}`);
  return j;
}
async function login() {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'rc-bot-a@rc-bot.example.com', password: BOT_PW }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('bot login: ' + JSON.stringify(j));
  tok = j.access_token;
}
async function waitDone(id, t0) {
  let last = '';
  for (;;) {
    const { job } = await art({ action: 'get', id });
    const s = `${job.kind} ${job.status} ${job.stage || ''} ${(job.log || []).slice(-1)[0]?.msg || ''}`;
    if (s !== last) { console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${job.id.slice(0, 8)} ${s}`); last = s; }
    if (['done', 'failed', 'canceled'].includes(job.status)) return job;
    if ((Date.now() - t0) / 1000 > LIMIT_S) throw new Error(`quá ${LIMIT_S} s, job ${id} vẫn ${job.status}`);
    await sleep(5000);
  }
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  await login();
  if (cmd === 'get') return console.log(JSON.stringify((await art({ action: 'get', id: args[0] })).job, null, 1));
  if (cmd === 'delete') return console.log(JSON.stringify(await art({ action: 'delete', id: args[0] })));
  if (cmd !== 'run') throw new Error('lệnh: run | get <id> | delete <id>');
  const wi = args.indexOf('--worker');
  const only = wi >= 0 ? args.splice(wi, 2)[1] : null;
  const views = Object.fromEntries(args.map((a) => a.split(/=(.*)/s).slice(0, 2)));
  const names = Object.keys(views);
  const up = await art({ action: 'upload_urls', files: names.map((v) => ({ name: `${v}-${path.basename(views[v])}`, type: 'image/png', size: fs.statSync(views[v]).size })) });
  for (let i = 0; i < names.length; i++) {
    const r = await fetch(up.files[i].uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: fs.readFileSync(views[names[i]]) });
    if (!r.ok) throw new Error('tải ảnh lên lỗi ' + r.status);
  }
  const params = { views: Object.fromEntries(names.map((v, i) => [v, up.files[i].path])), ultra: false, topology: 'triangle', polycount: 20000, seed: 42,
    texture: { quality: process.env.GEN3D_TEX_QUALITY || '2K', ai_complete: false, remove_lighting: true, pbr: true }, ...(only ? { only_worker: only } : {}) };
  const t0 = Date.now();
  const { job: shape } = await art({ action: 'submit', kind: 'shape', title: 'E2E thật ' + new Date().toISOString().slice(0, 16), params });
  console.log('shape', shape.id);
  const s = await waitDone(shape.id, t0);
  if (s.status !== 'done') throw new Error('shape ' + s.status + ': ' + s.error);
  console.log('shape result', JSON.stringify(s.result));
  const chain = await art({ action: 'chain', id: shape.id });
  const tex = chain.jobs.find((j) => j.kind === 'texture');
  if (!tex) throw new Error('không thấy job texture tự ra');
  console.log('texture', tex.id);
  const t = await waitDone(tex.id, t0);
  if (t.status !== 'done') throw new Error('texture ' + t.status + ': ' + t.error);
  console.log('texture result', JSON.stringify(t.result));
  const { job: rig } = await art({ action: 'submit', kind: 'rig', parent_id: tex.id, params: { skeleton: 'mixamo' } });
  console.log('rig', rig.id);
  const r = await waitDone(rig.id, t0);
  if (r.status !== 'done') throw new Error('rig ' + r.status + ': ' + r.error);
  console.log('rig result', JSON.stringify(r.result));
  console.log(`XONG ${((Date.now() - t0) / 1000).toFixed(0)} s: shape ${shape.id} texture ${tex.id} rig ${rig.id}`);
})().catch((e) => { console.error('LỖI', e.message); process.exit(1); });
