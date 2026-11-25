// Gọi vào function anim-studio ĐÃ DEPLOY: ảnh → job → máy test nhận → tiến độ → xong, cộng nhường ưu tiên, lowmem, huỷ, chạy lại, xoá.
// Cần ~/.anim-worker-key và ~/.rc-bot-password (bot rc-bot-a, rc-bot-b). Chạy: node test/anim-studio-api.js
const fs = require('fs'), os = require('os'), path = require('path');
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
const BASE = cfgSrc.match(/url: "([^"]+)"/)[1], ANON = cfgSrc.match(/anonKey: "([^"]+)"/)[1];
const FN = `${BASE}/functions/v1/anim-studio`;
const WKEY = fs.readFileSync(path.join(os.homedir(), '.anim-worker-key'), 'utf8').trim();
const BOT_PW = process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8').trim();

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

async function post(body, headers) {
  const r = await fetch(FN, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const asWorker = (b) => post(b, { 'x-anim-worker-key': WKEY });

async function botToken(name = 'rc-bot-a') {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}@rc-bot.example.com`, password: BOT_PW }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`bot login failed: ${JSON.stringify(j)}`);
  return j.access_token;
}
const put = (url, type, body) => fetch(url, { method: 'PUT', headers: { 'content-type': type }, body });

(async () => {
  const tok = await botToken();
  const asArt = (b) => post(b, { Authorization: `Bearer ${tok}` });
  const me = await asArt({ action: 'me' });
  ok(me.status === 200 && me.body.user, `me trả user (role ${me.body.user?.role ?? me.body.error?.message})`);
  if (me.status !== 200) process.exit(1);

  const W = 'test:animtest', W2 = 'test:animtest-slow';
  await asWorker({ action: 'hello', worker: { id: W, label: 'test anim', host: 'test', account: 'test', defaults: { priority: 50, claim_delay_s: 0, min_free_gb: 7 } } });
  const wk = (await asArt({ action: 'workers' })).body.workers.find((w) => w.id === W);
  ok(wk && wk.min_free_gb === 7 && wk.engine_default === 'auto', 'hello giữ min_free_gb, engine_default mặc định auto');

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005d2b3f3e0000000049454e44ae426082', 'hex');
  const badUp = await asArt({ action: 'upload_urls', files: [{ name: 'a.gif', type: 'image/gif', size: 10 }] });
  ok(badUp.status === 400, 'upload_urls từ chối gif');
  const bigUp = await asArt({ action: 'upload_urls', files: [{ name: 'a.png', type: 'image/png', size: 16 * 1024 * 1024 }] });
  ok(bigUp.status === 400, 'upload_urls từ chối ảnh > 15 MB');
  const up = await asArt({ action: 'upload_urls', files: [{ name: 'nhân vật.png', type: 'image/png', size: png.length }] });
  ok(up.status === 200 && up.body.files?.length === 1, 'upload_urls ký 1 URL');
  const p1 = await put(up.body.files[0].uploadUrl, 'image/png', png);
  ok(p1.ok, `PUT ảnh lên Storage (${p1.status})`);
  const imgPath = up.body.files[0].path;

  const noImg = await asArt({ action: 'submit', prompt: 'x', image: { path: 'refs/khac/x.png' } });
  ok(noImg.status === 400, 'ảnh của người khác bị từ chối');
  const noPrompt = await asArt({ action: 'submit', prompt: '  ', image: { path: imgPath } });
  ok(noPrompt.status === 400, 'thiếu mô tả bị từ chối');

  const sub = await asArt({ action: 'submit', prompt: 'test api: nhân vật vẫy tay', image: { path: imgPath, name: 'nv.png', w: 1, h: 1 },
    params: { engine: 'ltx', seconds: 9, seed: 7, remove_bg: true, only_worker: W } });
  ok(sub.status === 200 && sub.body.job?.status === 'queued', `submit → queued (${sub.body.error?.message ?? ''})`);
  const id = sub.body.job.id, pa = sub.body.job.params;
  ok(pa.engine === 'ltx' && pa.seconds === 5 && pa.seed === 7 && pa.remove_bg === true && pa.rewrite === true && pa.steps === null, `params được lọc (seconds kẹp 5, rewrite mặc định true): ${JSON.stringify(pa)}`);
  const def = await asArt({ action: 'submit', prompt: 'test mặc định', image: { path: imgPath }, params: { engine: 'xxx', only_worker: 'khong:ai' } });
  ok(def.body.job.params.engine === 'auto' && def.body.job.params.seconds === 2 && def.body.job.params.seed === null, 'engine lạ về auto, seconds mặc định 2, seed null');
  await asArt({ action: 'cancel', id: def.body.job.id }); await asArt({ action: 'delete', id: def.body.job.id });

  // ---- nhường ưu tiên + lowmem ----
  await asWorker({ action: 'hello', worker: { id: W2, label: 'test chậm', host: 'test', account: 'test', defaults: { priority: 51, claim_delay_s: 600 } } });
  const yj = await asArt({ action: 'submit', prompt: 'test api: nhường', image: { path: imgPath }, params: { only_worker: W + ',' + W2 } });
  const slow = await asWorker({ action: 'claim', worker_id: W2 });
  ok(slow.body.job === null, 'máy ưu tiên thấp nhường job khi máy ưu tiên cao đang rảnh');
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'lowmem', note: 'RAM trống 3 GB' });
  const lm = await asWorker({ action: 'claim', worker_id: W });
  ok(lm.body.job === null && lm.body.config.status === 'lowmem', 'máy lowmem không nhận job');
  const slow2 = await asWorker({ action: 'claim', worker_id: W2 });
  ok(slow2.body.job?.id === yj.body.job.id, 'máy ưu tiên cao lowmem thì máy thấp nhận ngay, không phải đợi');
  await asWorker({ action: 'bye', worker_id: W2 });
  await asArt({ action: 'cancel', id: yj.body.job.id });
  await asArt({ action: 'delete', id: yj.body.job.id });
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'idle' });

  const c = await asWorker({ action: 'claim', worker_id: W });
  const claimed = c.body.job && c.body.job.id === id ? c.body.job : null;
  ok(claimed && claimed.status === 'running' && claimed.worker === W && claimed.image.path === imgPath, 'worker claim được job → running, có image');

  const pr = await asWorker({ action: 'progress', worker_id: W, job_id: id, stage: 'sample', step: 5, total: 20, msg: 'đang sample', prompt_en: 'The character waves.' });
  ok(pr.body.job_status === 'running', 'progress ghi được');
  const g0 = (await asArt({ action: 'get', id })).body.job;
  ok(g0.stage === 'sample' && g0.progress?.step === 5 && g0.progress?.total === 20 && g0.prompt_en === 'The character waves.', `progress step/total + prompt_en lưu (${JSON.stringify(g0.progress)})`);
  const hb = await asWorker({ action: 'heartbeat', worker_id: W, status: 'busy', job_id: id });
  ok(hb.body.job_status === 'running', 'heartbeat thấy job còn chạy');

  const names = ['video.mp4', 'meta.json', 'frames/0001.png', 'frames/0002.png', 'frames/0003.png'];
  const types = ['video/mp4', 'application/json', 'image/png', 'image/png', 'image/png'];
  const outs = await asWorker({ action: 'upload_urls', job_id: id, files: names.map((name, i) => ({ name, type: types[i] })) });
  ok(outs.body.files?.[2]?.path === `out/${id}/frames/0001.png`, 'worker ký URL dưới out/<job>/frames/');
  for (const [i, f] of outs.body.files.entries()) await put(f.uploadUrl, types[i], i === 1 ? '{}' : png);
  const fr = await fetch(outs.body.files[2].publicUrl);
  ok(fr.ok && /png/.test(fr.headers.get('content-type') || ''), `khung đọc được, content-type ${fr.headers.get('content-type')}`);
  const noFrames = await asWorker({ action: 'complete', worker_id: W, job_id: id, result: { fps: 16, files: { frames: [] } } });
  ok(noFrames.status === 400, 'complete không có khung bị từ chối');
  const done = await asWorker({ action: 'complete', worker_id: W, job_id: id, result: { engine: 'fake', fps: 16, width: 1, height: 1, frames: 3, seconds: 2, seed: 7, timings: { sample: 1.5 },
    files: { video: outs.body.files[0].path, meta: outs.body.files[1].path, frames: outs.body.files.slice(2).map((f) => f.path) } } });
  ok(done.body.job?.status === 'done' && done.body.job.result.frames === 3 && done.body.job.progress === null, 'complete → done, progress xoá');

  const g = await asArt({ action: 'get', id });
  ok(g.body.job.log.length >= 3 && g.body.job.result.files.frames.length === 3, `get có log (${g.body.job.log.length} dòng) và 3 khung`);
  { const bad = g.body.job.log.find((l) => !(l && typeof l === 'object' && /^\d{4}-/.test(l.t) && typeof l.msg === 'string')); ok(!bad, 'mỗi dòng log là object {t, stage, msg}'); }
  const l = await asArt({ action: 'list', mine: true, limit: 5 });
  ok(l.body.jobs.some((j) => j.id === id) && !('log' in l.body.jobs[0]), 'list có job, không kèm log');

  const sub2 = await asArt({ action: 'submit', prompt: 'test api: huỷ', image: { path: imgPath }, parent_id: id, params: { only_worker: W } });
  ok(sub2.body.job?.parent_id === id, 'job con mang parent_id');

  // ---- requeue khi hết hạn mức, fail, retry, cancel ----
  const rq = await asWorker({ action: 'claim', worker_id: W });
  ok(rq.body.job?.id === sub2.body.job.id && rq.body.job.attempts === 1, 'máy test nhận job con');
  await asWorker({ action: 'fail', worker_id: W, job_id: sub2.body.job.id, error: 'hết hạn mức', requeue: true });
  const afterRq = (await asArt({ action: 'get', id: sub2.body.job.id })).body.job;
  ok(afterRq.status === 'queued' && afterRq.attempts === 0, 'fail requeue: về hàng đợi, không tính lượt');
  await asWorker({ action: 'claim', worker_id: W });
  await asWorker({ action: 'fail', worker_id: W, job_id: sub2.body.job.id, error: 'engine hỏng' });
  const failed = (await asArt({ action: 'get', id: sub2.body.job.id })).body.job;
  ok(failed.status === 'failed' && failed.error === 'engine hỏng', 'fail → failed kèm error');
  const re = await asArt({ action: 'retry', id: sub2.body.job.id });
  ok(re.body.job?.status === 'queued' && re.body.job.error === null && re.body.job.progress === null, 'retry đưa failed về hàng đợi');
  const can = await asArt({ action: 'cancel', id: sub2.body.job.id });
  ok(can.body.job?.status === 'canceled', 'cancel job đang chờ');
  const reC = await asArt({ action: 'retry', id: sub2.body.job.id });
  ok(reC.body.job?.status === 'queued', 'retry cả job đã huỷ');

  // cancel khi đang chạy: heartbeat báo canceled
  const cj = await asWorker({ action: 'claim', worker_id: W });
  ok(cj.body.job?.id === sub2.body.job.id, 'nhận lại job để thử huỷ lúc đang gen');
  const delRun = await asArt({ action: 'delete', id: sub2.body.job.id });
  ok(delRun.status === 409, `xoá job đang gen bị từ chối (${delRun.status})`);
  await asArt({ action: 'cancel', id: sub2.body.job.id });
  const hbc = await asWorker({ action: 'heartbeat', worker_id: W, status: 'busy', job_id: sub2.body.job.id });
  ok(hbc.body.job_status === 'canceled', 'heartbeat báo job đã huỷ → worker dừng engine');
  const prc = await asWorker({ action: 'progress', worker_id: W, job_id: sub2.body.job.id, stage: 'sample', step: 1, total: 2 });
  ok(prc.body.job_status === 'canceled', 'progress sau khi huỷ trả canceled');
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'idle' });

  // ---- quyền + chia trang ----
  const tokB = await botToken('rc-bot-b');
  const asB = (b) => post(b, { Authorization: `Bearer ${tokB}` });
  const meB = await asB({ action: 'me' });
  ok(meB.status === 200 && !meB.body.isAdmin, `bot b là art không admin (role ${meB.body.user?.role ?? meB.body.error?.message})`);
  const delB = await asB({ action: 'delete', id });
  ok(delB.status === 403, `người khác xoá job → ${delB.status}`);
  const P1 = await asArt({ action: 'list', page: 1, page_size: 5 });
  ok(P1.status === 200 && P1.body.page === 1 && P1.body.jobs.length === Math.min(5, P1.body.total), `list chia trang (total ${P1.body.total})`);
  const noAuth = await post({ action: 'list' }, {});
  ok(noAuth.status === 401, 'không đăng nhập → 401');

  const ws = await asArt({ action: 'workers' });
  ok(ws.body.workers.some((w) => w.id === W && w.status !== 'offline'), 'workers liệt kê máy test, đang online');
  const wu = await asArt({ action: 'worker_update', id: W, patch: { min_free_gb: 9, engine_default: 'wan5b' } });
  ok(me.body.isAdmin ? wu.body.worker?.min_free_gb === 9 && wu.body.worker.engine_default === 'wan5b' : wu.status === 403, `worker_update đúng quyền (admin=${me.body.isAdmin})`);

  const del = await asArt({ action: 'delete', id });
  const del2 = await asArt({ action: 'delete', id: sub2.body.job.id });
  ok(del.body.deleted === id && (await asArt({ action: 'get', id })).status === 404, 'xoá job của mình');
  ok(del.body.files_removed === 5 && !del.body.files_error, `xoá dọn 5 file trong out/, ảnh giữ vì job con còn dùng (${del.body.files_removed} ${del.body.files_error ?? ''})`);
  ok(del2.body.files_removed === 1, `xoá job con (người cuối dùng ảnh) dọn luôn ảnh (${del2.body.files_removed})`);
  const gone = await Promise.all([up.body.files[0].publicUrl, ...outs.body.files.map((f) => f.publicUrl)].map(async (u) => (await fetch(u + '?t=' + Date.now())).status));
  ok(gone.every((st) => st >= 400), `ảnh + khung + video không còn đọc được (${gone.join(',')})`);
  await asWorker({ action: 'bye', worker_id: W });
  ok(!(await asArt({ action: 'workers' })).body.workers.some((w) => w.id === W), 'bye gỡ máy test');
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
