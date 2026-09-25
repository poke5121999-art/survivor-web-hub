/*
 * VOID DIVER — VFX: phát hiệu ứng gốc (art/vfx/*.json) trong tools/vfx_view.html, chụp khung ở các mốc thời gian.
 *
 * Chạy:  node test/voiddiver-vfx.js [tên prefab ...]
 *   - dựng http server tĩnh tại gốc repo, mở trình xem bằng Chromium headless (Playwright)
 *   - mỗi hiệu ứng: bước thời gian cố định 1/60 s tới 0.05 / 0.15 / 0.3 / 0.6 s, chụp vào %TEMP%/voiddiver-vfx-shots/
 *     (thêm một ảnh phóng 3× ở 0.15 s để soi chi tiết)
 *   - đo tải: 30 hiệu ứng cùng lúc trong 4 s (fps, thời gian mô phỏng CPU, số hạt, draw call)
 *   - hỏng nếu có pageerror, console error, hoặc response >= 400
 * Xem ảnh bằng mắt sau khi chạy. Không có ảnh thì không tính là xong.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'voiddiver-vfx-shots');
const OPT = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const TIMES = OPT.times ? OPT.times.split(',').map(Number) : [0.05, 0.15, 0.3, 0.6];
const ZOOM = OPT.zoom ? +OPT.zoom : 1;          // --zoom=3: phóng mọi ảnh (soi chi tiết)
const YAW = OPT.yaw || '90';

// 3 mẫu + 10 hiệu ứng nhân vật/quái khác
const DEFAULT = [
  '1001_01_SwordAttack_Cast_1st',              // chém kiếm (mẫu)
  '1001_01_SwordAttack_Hit_Fire',              // trúng đòn lửa (mẫu)
  '100003_attack_1_ShotgunAttack_Cast',        // lửa nòng shotgun (mẫu)
  '1001_01_SwordAttack_Cast_2nd',
  '200019_attack_1_Spider_Swing_Cast',         // (1001_02_SwordSkill_01_Chain là MeshRenderer + script, không có hạt)
  '1001_01_SwordAttack_Hit_None',
  '100003_attack_1_ShotgunAttack_Hit_None',
  '100005_attack_1_Raven_Shot_Cast',
  '1003_01_CasterSkill_NormalAttack_Cast',
  '1003_07_CasterSkill_PsyonicExplosion',
  'EnemySummon',
  'CommonEnemyPrejectile_Hit_1_3_fire',
  'Zombie_ToxicPool_Pool',
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.css': 'text/css' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

function safe(n) { return n.replace(/[^A-Za-z0-9_.-]/g, '_'); }

(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const names = args.length ? args : DEFAULT;
  fs.mkdirSync(OUT, { recursive: true });
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'games/voiddiver/art/vfx/index.json'), 'utf8'));
  const srv = await serve();
  const port = srv.address().port;
  // --gpu=1: GPU thật (ANGLE D3D11) để đo fps; mặc định SwiftShader cho ổn định ảnh chụp
  const GPU = OPT.gpu === '1';
  const browser = await chromium.launch({ args: GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  const shots = [];
  for (const name of names) {
    if (!index.fx[name]) { errors.push('không có trong index.json: ' + name); continue; }
    for (const zoom of (ZOOM === 1 ? [1, 3] : [ZOOM])) {
      const url = `http://127.0.0.1:${port}/games/voiddiver/tools/vfx_view.html?manual=1&w=960&h=540&zoom=${zoom}&yaw=${YAW}&fx=${encodeURIComponent(name)}`;
      await page.goto(url);
      await page.waitForFunction(() => window.vfxView && (window.vfxView.ready || window.vfxView.error), null, { timeout: 20000 });
      await page.evaluate(n => window.vfxView.play(n), name);
      let tPrev = 0;
      const times = zoom === 1 || ZOOM !== 1 ? TIMES : [0.15];
      for (const t of times) {
        const st = await page.evaluate(dt => window.vfxView.step(dt), t - tPrev);
        tPrev = t;
        const f = path.join(OUT, `${safe(name)}_${zoom === 1 ? '' : 'z' + zoom + '_'}${t.toFixed(2)}.png`);
        await page.screenshot({ path: f });
        shots.push(f);
        if (zoom === 1 || ZOOM !== 1) console.log(`${name.padEnd(48)} t=${t.toFixed(2)}  hạt ${String(st.particles).padStart(4)}  hệ ${st.systems}  draw ${st.drawCalls}`);
      }
    }
  }

  // hiệu ứng trạng thái (StatusEffectTag, VfxDuration −1 = còn buff là còn): play({loop:true}) phải còn hạt
  // sau 4 s, và stop() phải tắt hẳn. Tên thiếu prefab ở đợt quét skill 2026-09-25 cũng phải có trong index.
  if (!args.length) {
    for (const n of ['Purification', 'Damage_Tick_Bleeding', 'Slow', '1003_04_CasterSkill_ToyBomb_Projectile_State_Sitting_Ring', 'Heal'])
      if (!index.fx[n]) errors.push('thiếu prefab trong index.json: ' + n);
    for (const name of ['Slow', 'Stun', 'Weakening']) {
      if (!index.fx[name]) { errors.push('thiếu prefab trạng thái: ' + name); continue; }
      await page.goto(`http://127.0.0.1:${port}/games/voiddiver/tools/vfx_view.html?manual=1&w=960&h=540&zoom=3&fx=${name}`);
      await page.waitForFunction(() => window.vfxView && window.vfxView.ready, null, { timeout: 20000 });
      await page.evaluate(n => window.vfxView.play(n, { loop: true }), name);
      const st = await page.evaluate(() => window.vfxView.step(4));
      const f = path.join(OUT, `${safe(name)}_loop_4.00.png`);
      await page.screenshot({ path: f });
      shots.push(f);
      await page.evaluate(() => window.vfxView.stop(false));
      await page.evaluate(() => window.vfxView.step(6));
      const alive = await page.evaluate(() => window.vfxView.alive());
      console.log(`${(name + ' (loop)').padEnd(48)} t=4.00  hạt ${String(st.particles).padStart(4)}  sau stop()+6 s còn sống: ${alive}`);
      if (!st.particles) errors.push(`${name}: loop:true mà sau 4 s không còn hạt`);
      if (alive) errors.push(`${name}: stop() rồi 6 s vẫn chưa tắt`);
    }
    // đồ vật thế giới: cửa thoát bốt điện thoại theo trạng thái (phonebooth_end có startDelay gốc 0,55–1,1 s),
    // vùng SpecialField, đồ rơi, bẫy
    const world = [['WaveExit', 'phonebooth_begin', 0.3], ['WaveExit', 'phonebooth_end', 1.3], ['SphereFieldExit', null, 1],
      ['SphereOilField', null, 1], ['SphereBlockedField', null, 1], ['DropGoods', null, 1], ['Trap_Fire_FireThrower', null, 0.5],
      ['Trap_Electric', null, 0.5]];
    for (const [name, only, t] of world) {
      if (!index.fx[name]) { errors.push('thiếu prefab đồ vật: ' + name); continue; }
      await page.goto(`http://127.0.0.1:${port}/games/voiddiver/tools/vfx_view.html?manual=1&w=960&h=540&zoom=2&y=0&fx=${name}`);
      await page.waitForFunction(() => window.vfxView && window.vfxView.ready, null, { timeout: 20000 });
      await page.evaluate(([n, o]) => window.vfxView.play(n, o ? { only: o } : {}), [name, only]);
      const st = await page.evaluate(dt => window.vfxView.step(dt), t);
      const f = path.join(OUT, `world_${safe(name)}${only ? '_' + only : ''}_${t.toFixed(2)}.png`);
      await page.screenshot({ path: f });
      shots.push(f);
      console.log(`${(name + (only ? ' only=' + only : '')).padEnd(48)} t=${t.toFixed(2)}  hạt ${String(st.particles).padStart(4)}  hệ ${st.systems}`);
      if (!st.particles) errors.push(`${name}${only ? ' only=' + only : ''}: không có hạt ở t=${t}`);
    }
  }

  if (OPT.noperf) {   // --noperf=1: bỏ đo tải
    await browser.close(); srv.close();
    if (errors.length) { console.error('LỖI:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
    console.log('OK (không đo tải)');
    return;
  }
  // tải: 30 hiệu ứng cùng lúc. Hai bộ:
  //  - "trận đánh": 13 hiệu ứng chụp ảnh ở trên (chém, trúng đòn, nòng súng, quái) lặp đủ 30 — phải giữ 60 fps với --gpu=1;
  //  - "nặng nhất": 30 prefab nhiều hệ hạt nhất (vụ nổ lớn, bão linh hồn của boss…) — chỉ in số, không đánh trượt:
  //    vài prefab là mesh particle nhiều đa giác (SoulStorm ~9k tam giác/bản), 30 bản cùng lúc không xảy ra trong game.
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const e = c && c.getExtension('WEBGL_debug_renderer_info');
    return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?';
  });
  const heavy = Object.keys(index.fx).sort((x, y) => index.fx[y].systems - index.fx[x].systems).slice(0, 30);
  const sets = [['trận đánh', names, true], ['nặng nhất', heavy, false]];
  console.log('\n30 hiệu ứng cùng lúc (Chromium headless, ' + gl + '):');
  for (const [label, list, gate] of sets) {
    await page.goto(`http://127.0.0.1:${port}/games/voiddiver/tools/vfx_view.html?manual=1&w=960&h=540`);
    await page.waitForFunction(() => window.vfxView && window.vfxView.ready, null, { timeout: 20000 });
    const perf = await page.evaluate(n => window.vfxView.stress(n, 5), list);
    await page.screenshot({ path: path.join(OUT, 'stress_30_' + (gate ? 'combat' : 'heavy') + '.png') });
    console.log('  [%s] khung bận (update + render + chờ GPU) tb %s ms / max %s ms  → ~%s fps nếu chỉ có VFX',
      label, perf.frameBusyAvgMs.toFixed(2), perf.frameBusyMaxMs.toFixed(1), (1000 / perf.frameBusyAvgMs).toFixed(0));
    console.log('     mô phỏng CPU tb %s ms / max %s ms  hạt max %d  draw call max %d',
      perf.simAvgMs.toFixed(2), perf.simMaxMs.toFixed(2), perf.particlesMax, perf.drawCallsMax);
    if (GPU && gate && perf.frameBusyAvgMs > 1000 / 60) errors.push('30 hiệu ứng "' + label + '" không giữ được 60 fps: ' + perf.frameBusyAvgMs.toFixed(2) + ' ms/khung');
  }
  const unsupported = await page.evaluate(() => window.vfxView.unsupported());
  console.log('module bỏ qua gặp trong các hiệu ứng đã phát:', JSON.stringify(unsupported));
  console.log('\nẢnh:', OUT, `(${shots.length + 1} tệp)`);

  await browser.close();
  srv.close();
  if (errors.length) {
    console.error('\nLỖI:\n  ' + [...new Set(errors)].join('\n  '));
    process.exit(1);
  }
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
