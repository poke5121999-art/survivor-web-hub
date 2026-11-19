// Gọi vào function gen3d-studio ĐÃ DEPLOY: shape → done → texture con, chặn texture thiếu cha, lọc caps, nhường ưu tiên,
// huỷ, chạy lại, xoá. Cần ~/.gen3d-worker-key và ~/.rc-bot-password (bot hub rc-bot-a). Chạy: node test/gen3d-studio-api.js
const fs = require('fs'), os = require('os'), path = require('path');
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
const BASE = cfgSrc.match(/url: "([^"]+)"/)[1], ANON = cfgSrc.match(/anonKey: "([^"]+)"/)[1];
const FN = `${BASE}/functions/v1/gen3d-studio`;
const WKEY = fs.readFileSync(path.join(os.homedir(), '.gen3d-worker-key'), 'utf8').trim();
const BOT_PW = process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8').trim();

let fails = 0, passes = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (cond) passes++; else fails++; };

async function post(body, headers) {
  const r = await fetch(FN, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}
const asWorker = (b) => post(b, { 'x-gen3d-worker-key': WKEY });

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
  const cleanup = [];

  const me = await asArt({ action: 'me' });
  ok(me.status === 200 && me.body.user, `me trả user (role ${me.body.user?.role ?? me.body.error?.message})`);
  if (me.status !== 200) process.exit(1);

  const W = 'test:g3d-api', WS = 'test:g3d-shapeonly', WR = 'test:g3d-rigonly';
  const hello = (id, caps, priority, delay) => asWorker({ action: 'hello', worker: { id, label: id, host: 'test', caps, gpu: { name: 'Fake GPU', vram_total_mb: 8192, vram_free_mb: 6000 }, mem: { commit_free_gb: 20 }, defaults: { priority, claim_delay_s: delay } } });
  const h1 = await hello(W, ['shape', 'texture', 'rig'], 50, 0);
  ok(h1.body.config?.caps?.length === 3 && h1.body.config.gpu?.name === 'Fake GPU', 'hello ghi caps và gpu');

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005d2b3f3e0000000049454e44ae426082', 'hex');
  const up = await asArt({ action: 'upload_urls', files: [{ name: 'mặt trước.png', type: 'image/png', size: png.length }, { name: 'trái.png', type: 'image/png', size: png.length }] });
  ok(up.status === 200 && up.body.files?.length === 2, 'upload_urls ký 2 URL');
  for (const f of up.body.files) await fetch(f.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
  const got = await fetch(up.body.files[0].publicUrl);
  ok(got.ok && (await got.arrayBuffer()).byteLength === png.length, 'ảnh đọc lại được qua publicUrl');
  const badType = await asArt({ action: 'upload_urls', files: [{ name: 'x.mp4', type: 'video/mp4' }] });
  ok(badType.status === 400, 'upload_urls từ chối video');

  const views = { front: up.body.files[0].path, left: up.body.files[1].path };
  const sub = await asArt({ action: 'submit', kind: 'shape', title: 'test api gen3d', params: { views, ultra: true, topology: 'quad', polycount: 99999999, texture: null, only_worker: W } });
  ok(sub.status === 200 && sub.body.job?.status === 'queued', `submit shape → queued (${sub.body.error?.message ?? ''})`);
  const id = sub.body.job.id;
  cleanup.push(id);
  ok(sub.body.job.root_id === id && sub.body.job.kind === 'shape', 'shape: root_id = id');
  ok(sub.body.job.params.polycount === 2000000 && sub.body.job.params.topology === 'quad' && sub.body.job.params.views.left, 'params được kẹp và giữ');

  ok((await asArt({ action: 'submit', kind: 'shape', params: { views: {} } })).status === 400, 'shape không ảnh bị từ chối');
  ok((await asArt({ action: 'submit', kind: 'shape', params: { views: { front: 'refs/khac/x.png' } } })).status === 400, 'ảnh của người khác bị từ chối');
  const early = await asArt({ action: 'submit', kind: 'texture', parent_id: id, params: { quality: '2K' } });
  ok(early.status === 400, `texture khi cha chưa xong bị từ chối (${early.body.error?.message})`);
  ok((await asArt({ action: 'submit', kind: 'texture', params: {} })).status === 400, 'texture không parent_id bị từ chối');

  // caps: máy priority 0 chỉ có rig không nhận shape, và máy priority 60 (delay 600 s) không phải nhường nó
  const WC = 'test:g3d-capslow';
  await hello(WR, ['rig'], 0, 0);
  await hello(WC, ['shape'], 60, 600);
  const capJob = await asArt({ action: 'submit', kind: 'shape', title: 'test caps', params: { views, only_worker: `${WR},${WC}` } });
  cleanup.push(capJob.body.job.id);
  ok((await asWorker({ action: 'claim', worker_id: WR })).body.job === null, 'máy chỉ có cap rig không nhận job shape');
  const wc = await asWorker({ action: 'claim', worker_id: WC });
  ok(wc.body.job?.id === capJob.body.job.id, 'không nhường cho máy ưu tiên cao nhưng thiếu cap');
  await asWorker({ action: 'fail', worker_id: WC, job_id: capJob.body.job.id, error: 'test xong' });
  await asWorker({ action: 'bye', worker_id: WR });
  await asWorker({ action: 'bye', worker_id: WC });

  // nhường ưu tiên: WS (priority 51, delay 600) nhường cho W (priority 50) đang rảnh và có cap shape
  await hello(WS, ['shape'], 51, 600);
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'idle' });
  const yieldJob = await asArt({ action: 'submit', kind: 'shape', title: 'test nhường', params: { views, only_worker: `${W},${WS}` } });
  cleanup.push(yieldJob.body.job.id);
  ok((await asWorker({ action: 'claim', worker_id: WS })).body.job === null, 'máy ưu tiên thấp nhường khi máy ưu tiên cao rảnh');
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'lowmem', note: 'commit trống 3 GB' });
  const ws = await asArt({ action: 'workers' });
  ok(ws.body.workers.find((w) => w.id === W)?.status === 'lowmem', 'heartbeat lowmem hiện ở danh sách máy');
  const slow2 = await asWorker({ action: 'claim', worker_id: WS });
  ok(slow2.body.job?.id === yieldJob.body.job.id, 'máy ưu tiên cao lowmem thì máy thấp nhận ngay');
  const rq = await asWorker({ action: 'fail', worker_id: WS, job_id: yieldJob.body.job.id, error: 'thiếu VRAM', requeue: true });
  ok(rq.body.job?.status === 'queued' && rq.body.job.attempts === 0, 'fail requeue trả job về hàng đợi, không tính lượt');
  await asWorker({ action: 'bye', worker_id: WS });
  await asArt({ action: 'cancel', id: yieldJob.body.job.id });
  await asWorker({ action: 'heartbeat', worker_id: W, status: 'idle' });

  const c = await asWorker({ action: 'claim', worker_id: W });
  ok(c.body.job?.id === id && c.body.job.status === 'running' && c.body.job.worker === W, 'worker claim job shape → running');
  ok((await asWorker({ action: 'progress', worker_id: W, job_id: id, stage: 'generate', msg: 'TripoSG đang dựng' })).body.job_status === 'running', 'progress ghi được');
  ok((await asWorker({ action: 'heartbeat', worker_id: W, status: 'busy', job_id: id })).body.job_status === 'running', 'heartbeat thấy job còn chạy');
  const outs = await asWorker({ action: 'upload_urls', job_id: id, files: [{ name: 'model.glb', type: 'model/gltf-binary' }, { name: 'thumb.png', type: 'image/png' }, { name: 'views_clean/front.png', type: 'image/png' }] });
  ok(outs.body.files?.[0]?.path === `out/${id}/model.glb` && outs.body.files[2].path === `out/${id}/views_clean/front.png`, 'worker ký URL dưới out/<job>/');
  for (const f of outs.body.files) await fetch(f.uploadUrl, { method: 'PUT', headers: { 'content-type': f.type }, body: f.type === 'image/png' ? png : Buffer.from('glTF') });
  const glbGet = await fetch(outs.body.files[0].publicUrl);
  ok(glbGet.ok, `glb đọc lại được (content-type ${glbGet.headers.get('content-type')})`);
  ok((await asWorker({ action: 'complete', worker_id: W, job_id: id, result: { files: { thumb: outs.body.files[1].path } } })).status === 400, 'complete thiếu glb bị từ chối');
  const done = await asWorker({ action: 'complete', worker_id: W, job_id: id, result: { files: { glb: outs.body.files[0].path, thumb: outs.body.files[1].path, views_clean: { front: outs.body.files[2].path } }, stats: { tris: 1234, verts: 700, seconds: 3 } } });
  ok(done.body.job?.status === 'done' && done.body.job.result.stats.tris === 1234 && done.body.job.result.files.views_clean.front, 'complete → done, giữ stats và views_clean');
  ok(done.body.child_id === null, 'shape không bật Texture thì không tự ra job texture');

  const tex = await asArt({ action: 'submit', kind: 'texture', parent_id: id, params: { quality: '8K', pbr: true, remove_lighting: true, ai_complete: true } });
  ok(tex.status === 200 && tex.body.job.parent_id === id && tex.body.job.root_id === id && tex.body.job.params.quality === '8K', `texture con: parent_id, root_id, params (${tex.body.error?.message ?? ''})`);
  ok(tex.body.job.params.only_worker === W && tex.body.job.title === 'test api gen3d', 'job con kế only_worker và tên của gốc');
  const tc = await asWorker({ action: 'claim', worker_id: W });
  ok(tc.body.job?.id === tex.body.job.id && tc.body.job.parent?.result?.files?.glb && tc.body.job.root?.params?.views?.front, 'claim texture kèm parent (glb) và root (ảnh)');
  const tout = await asWorker({ action: 'upload_urls', job_id: tex.body.job.id, files: [{ name: 'model.glb', type: 'model/gltf-binary' }] });
  await asWorker({ action: 'complete', worker_id: W, job_id: tex.body.job.id, result: { files: { glb: tout.body.files[0].path } } });
  const texRig = await asArt({ action: 'submit', kind: 'texture', parent_id: tex.body.job.id, params: {} });
  ok(texRig.status === 400, 'texture trên texture bị từ chối');
  const rig = await asArt({ action: 'submit', kind: 'rig', parent_id: tex.body.job.id, params: {} });
  ok(rig.body.job?.kind === 'rig' && rig.body.job.params.skeleton === 'mixamo' && rig.body.job.root_id === id, 'rig sau texture: chung root');

  const ch = await asArt({ action: 'chain', id: rig.body.job.id });
  ok(ch.body.root_id === id && ch.body.jobs.length === 3, `chain trả 3 phiên bản của model (${ch.body.jobs?.length})`);

  // Texture bật lúc gửi shape: complete tự ra job texture con
  const auto = await asArt({ action: 'submit', kind: 'shape', title: 'test auto texture', params: { views, texture: { quality: '2K', pbr: false }, only_worker: W } });
  cleanup.push(auto.body.job.id);
  await asArt({ action: 'cancel', id: rig.body.job.id });
  const ac = await asWorker({ action: 'claim', worker_id: W });
  ok(ac.body.job?.id === auto.body.job.id, 'claim shape có bật texture');
  const aout = await asWorker({ action: 'upload_urls', job_id: ac.body.job.id, files: [{ name: 'model.glb', type: 'model/gltf-binary' }] });
  const ad = await asWorker({ action: 'complete', worker_id: W, job_id: ac.body.job.id, result: { files: { glb: aout.body.files[0].path } } });
  const child = ad.body.child_id && (await asArt({ action: 'get', id: ad.body.child_id })).body.job;
  ok(child && child.kind === 'texture' && child.parent_id === auto.body.job.id && child.params.quality === '2K' && child.status === 'queued', 'complete shape bật Texture tự ra job texture con');

  const g = await asArt({ action: 'get', id });
  ok(g.body.job.log.length >= 4 && !g.body.job.log.some((l) => !(l && /^\d{4}-/.test(l.t) && typeof l.msg === 'string')), `get có log hợp lệ (${g.body.job.log.length} dòng)`);
  const l = await asArt({ action: 'list', mine: true, limit: 10 });
  ok(l.body.jobs.some((j) => j.id === id) && !('log' in l.body.jobs[0]), 'list có job, không kèm log');

  const can = await asArt({ action: 'cancel', id: child.id });
  ok(can.body.job?.status === 'canceled', 'cancel job đang chờ');
  const re = await asArt({ action: 'retry', id: child.id });
  ok(re.body.job?.status === 'queued', 'retry đưa về hàng đợi');
  const cr = await asWorker({ action: 'claim', worker_id: W });
  await asArt({ action: 'cancel', id: cr.body.job.id });
  ok((await asWorker({ action: 'heartbeat', worker_id: W, status: 'busy', job_id: cr.body.job.id })).body.job_status === 'canceled', 'heartbeat báo job đã huỷ để worker dừng');
  ok((await asWorker({ action: 'complete', worker_id: W, job_id: cr.body.job.id, result: { files: { glb: `out/${cr.body.job.id}/model.glb` } } })).status === 409, 'complete job đã huỷ bị từ chối');

  const wu = await asArt({ action: 'worker_update', id: W, patch: { priority: 49, enabled: false } });
  ok(me.body.isAdmin ? wu.body.worker?.priority === 49 : wu.status === 403, `worker_update đúng quyền (admin=${me.body.isAdmin})`);

  const del = await asArt({ action: 'delete', id });
  ok(del.body.deleted === id && (await asArt({ action: 'get', id })).status === 404 && (await asArt({ action: 'get', id: tex.body.job.id })).status === 404, 'xoá shape xoá luôn các phiên bản con');
  for (const x of cleanup) await asArt({ action: 'delete', id: x });
  await asWorker({ action: 'bye', worker_id: W });
  ok(!(await asArt({ action: 'workers' })).body.workers.some((w) => w.id.startsWith('test:g3d')), 'bye gỡ các máy test');
  console.log(fails ? `${passes} PASS, ${fails} FAIL` : `ALL PASS (${passes})`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
