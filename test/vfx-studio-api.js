// Gọi vào function vfx-studio ĐÃ DEPLOY: một job đi trọn queued → running → done, cộng huỷ, chạy lại, nhường ưu tiên.
// Cần ~/.vfx-worker-key và ~/.rc-bot-password (bot hub rc-bot-a). Chạy: node test/vfx-studio-api.js
const fs = require('fs'), os = require('os'), path = require('path');
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
const BASE = cfgSrc.match(/url: "([^"]+)"/)[1], ANON = cfgSrc.match(/anonKey: "([^"]+)"/)[1];
const FN = `${BASE}/functions/v1/vfx-studio`;
const WKEY = fs.readFileSync(path.join(os.homedir(), '.vfx-worker-key'), 'utf8').trim();
const BOT_PW = process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8').trim();

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

async function post(body, headers) {
  const r = await fetch(FN, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const asWorker = (b) => post(b, { 'x-vfx-worker-key': WKEY });

async function botToken() {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'rc-bot-a@rc-bot.example.com', password: BOT_PW }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`bot login failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

(async () => {
  const tok = await botToken();
  const asArt = (b) => post(b, { Authorization: `Bearer ${tok}` });

  const me = await asArt({ action: 'me' });
  ok(me.status === 200 && me.body.user, `me trả user (role ${me.body.user?.role ?? me.body.error?.message})`);
  if (me.status !== 200) process.exit(1);

  const W = 'test:apitest';
  await asWorker({ action: 'hello', worker: { id: W, label: 'test api', host: 'test', account: 'test', defaults: { priority: 50, claim_delay_s: 0 } } });

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005d2b3f3e0000000049454e44ae426082', 'hex');
  const up = await asArt({ action: 'upload_urls', files: [{ name: 'ảnh mẫu.png', type: 'image/png', size: png.length }] });
  ok(up.status === 200 && up.body.files?.length === 1, 'upload_urls ký 1 URL');
  const put = await fetch(up.body.files[0].uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
  ok(put.ok, `PUT ảnh lên Storage (${put.status})`);
  const got = await fetch(up.body.files[0].publicUrl);
  ok(got.ok && (await got.arrayBuffer()).byteLength === png.length, 'ảnh đọc lại được qua publicUrl');

  const sub = await asArt({ action: 'submit', prompt: 'test api: một tia lửa nhỏ', refs: [{ path: up.body.files[0].path, kind: 'image', name: 'mẫu' }], params: { kind: 'oneshot', size: 'S', palette: ['#102', '#f80', '#fff'], only_worker: W } });
  ok(sub.status === 200 && sub.body.job?.status === 'queued', `submit → queued (${sub.body.error?.message ?? ''})`);
  const id = sub.body.job.id;
  ok(sub.body.job.params.palette.length === 3 && sub.body.job.params.size === 'S', 'params được lọc và giữ');

  const bad = await asArt({ action: 'submit', prompt: 'x', refs: [{ path: 'refs/khac/x.png' }] });
  ok(bad.status === 400, 'ref của người khác bị từ chối');

  const W2 = 'test:apitest-slow';
  await asWorker({ action: 'hello', worker: { id: W2, label: 'test chậm', host: 'test', account: 'test', defaults: { priority: 51, claim_delay_s: 600 } } });
  const yieldJob = await asArt({ action: 'submit', prompt: 'test api: nhường', params: { only_worker: W + ',' + W2 } });
  const slow = await asWorker({ action: 'claim', worker_id: W2 });
  ok(slow.body.job === null, 'máy ưu tiên thấp nhường job khi máy ưu tiên cao đang rảnh');
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'busy' });
  const slow2 = await asWorker({ action: 'claim', worker_id: W2 });
  ok(slow2.body.job?.id === yieldJob.body.job.id, 'máy ưu tiên cao bận thì máy thấp nhận ngay');
  await asWorker({ action: 'bye', worker_id: W2 });
  await asArt({ action: 'cancel', id: yieldJob.body.job.id });
  await asArt({ action: 'delete', id: yieldJob.body.job.id });
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'idle' });

  const c = await asWorker({ action: 'claim', worker_id: W });
  const claimed = c.body.job && c.body.job.id === id ? c.body.job : null;
  ok(claimed && claimed.status === 'running' && claimed.worker === W, 'worker claim được job → running');

  const pr = await asWorker({ action: 'progress', worker_id: W, job_id: id, stage: 'drafting', msg: 'đang vẽ nháp' });
  ok(pr.body.job_status === 'running', 'progress ghi được');
  const hb = await asWorker({ action: 'heartbeat', worker_id: W, status: 'busy', job_id: id });
  ok(hb.body.job_status === 'running', 'heartbeat thấy job còn chạy');

  const outs = await asWorker({ action: 'upload_urls', job_id: id, files: [{ name: 'x.js', type: 'text/javascript' }, { name: 'x.bundle.js', type: 'text/javascript' }] });
  ok(outs.body.files?.[0]?.path === `out/${id}/x.js`, 'worker ký URL dưới out/<job>/');
  for (const f of outs.body.files) await fetch(f.uploadUrl, { method: 'PUT', headers: { 'content-type': 'text/javascript' }, body: 'export const meta={}' });
  const js = await fetch(outs.body.files[1].publicUrl);
  ok(js.ok && /javascript/.test(js.headers.get('content-type') || ''), `bundle phục vụ với content-type ${js.headers.get('content-type')} và CORS ${js.headers.get('access-control-allow-origin')}`);

  const done = await asWorker({ action: 'complete', worker_id: W, job_id: id, result: { effect_id: 'studio/x', name: 'X', desc: 'd', meta: { size: [32, 32] }, files: { src: outs.body.files[0].path, bundle: outs.body.files[1].path } } });
  ok(done.body.job?.status === 'done', 'complete → done');

  const g = await asArt({ action: 'get', id });
  ok(g.body.job.log.length >= 4 && g.body.job.result.files.bundle, `get có log (${g.body.job.log.length} dòng) và result`);
  { const badLog = g.body.job.log.find((l) => !(l && typeof l === 'object' && /^\d{4}-/.test(l.t) && typeof l.msg === 'string')); ok(!badLog, `mỗi dòng log là object {t, stage, msg} (lạc: ${JSON.stringify(badLog)})`); }
  const l = await asArt({ action: 'list', mine: true, limit: 5 });
  ok(l.body.jobs.some((j) => j.id === id) && !('log' in l.body.jobs[0]), 'list có job, không kèm log');

  const sub2 = await asArt({ action: 'submit', prompt: 'test api: huỷ', parent_id: id });
  ok(sub2.body.job?.parent_id === id, 'sửa tiếp: job con mang parent_id');
  const can = await asArt({ action: 'cancel', id: sub2.body.job.id });
  ok(can.body.job?.status === 'canceled', 'cancel job đang chờ');
  const re = await asArt({ action: 'retry', id: sub2.body.job.id });
  ok(re.body.job?.status === 'queued', 'retry đưa về hàng đợi');
  await asArt({ action: 'cancel', id: sub2.body.job.id });

  const ws = await asArt({ action: 'workers' });
  ok(ws.body.workers.some((w) => w.id === W && w.status !== 'offline'), 'workers liệt kê máy test, đang online');
  const wu = await asArt({ action: 'worker_update', id: W, patch: { enabled: false } });
  ok(me.body.isAdmin ? wu.body.worker?.enabled === false : wu.status === 403, `worker_update đúng quyền (admin=${me.body.isAdmin})`);

  const del = await asArt({ action: 'delete', id });
  await asArt({ action: 'delete', id: sub2.body.job.id });
  ok(del.body.deleted === id && (await asArt({ action: 'get', id })).status === 404, 'xoá job của mình');
  await asWorker({ action: 'bye', worker_id: W });
  ok(!(await asArt({ action: 'workers' })).body.workers.some((w) => w.id === W), 'bye gỡ máy test');
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
