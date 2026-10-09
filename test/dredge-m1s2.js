/*
 * DREDGE — Biển Mù, vòng 7, đơn vị S2 seams-data (m1s2): kiểm dữ liệu và hàm nền cho các mối đe doạ ở The Marrows.
 *
 * Chạy:  node test/dredge-m1s2.js
 * Kiểm:
 *   1. Tên hệ hạt trong S2 (MONSTERS.md §3.1) đều là khoá của DR_PARTICLES; tên clip đều tra được bằng DRAudio.resolve (tên gốc của clip).
 *   2. data/safezones.js: đúng 38 collider layer 27 (MONSTERS.md §0.1).
 *   3. Trên trang thật: DRSafeZones.hit đúng tại bến Greater Marrow (Unity (9, 1) = three (8,6; −0,99)) và sai ở 200 m ngoài khơi;
 *      mỗi vùng Marrows trong §0.1 trúng ở tâm của nó.
 *   4. DRNav.path giữa hai điểm nước Marrows không bao giờ cắt đất (mẫu landmask 0,5 m một bước) và phải vòng khi đường thẳng cắt đất;
 *      DRNav.ray chặn đường thẳng qua đất; DRNav.sample đưa điểm trên đất về nước.
 *   5. Độ khớp bitmap navmesh với landmask trong đĩa Marrows (tâm Unity (58, 27), r 150): ô nước cách đất > 2 m phải đi được ≥ 99 %
 *      (bản generic), và in ra con số.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const G = path.join(ROOT, 'games/dredge');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m1s2');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

// ---- 1. tên hạt và tiếng (không cần trình duyệt)
const PARTICLES = ['Ravens', 'SplashWorldEvent', 'ParasiteWorldEvent', 'EyeParticles', 'Waterspout', 'Waterspout_Corrupt', 'WaterspoutImpactfx',
  'GhostWindEvent', 'DestinationWindEffect', 'MarrowMonsterWake', 'MarrowMonsterAttackSplash', 'MarrowMonsterBoatDamageFX', 'MonsterRayBoatDamageFX',
  'PhantomSharkAppear', 'PhantomSharkDisappear', 'PhantomSharkWake', 'FogDevilParticles', 'FogDevilAggroParticles',
  'TentacleTipParticles', 'TentacleBaseParticles', 'TentacleBigSplash'];
const CLIPS = ['World Event - Eyes', 'World Event - Ghost Wind', 'Waterspout Normal', 'Waterspout Corrupt', 'Waterspout Strike Player',
  'Waterspout Corrupt Strike Player', 'Monster Ray - Swim_Loop', 'Monster Ray - Dissolve_1', 'Monster Ray - Chomp 1_1', 'Monster Ray - Chomp 2_1',
  'Monster Ray - Chomp 3_1', 'Monster Ray -Tail Swipe 1_1', 'Monster Ray -Tail Swipe 2_1', 'Monster Ray -Tail Swipe 3_1',
  'Phantom Shark - Appear', 'Phantom Shark - Movement Loop', 'Phantom Shark - Impact', 'Leviathan Distant Call', 'Flickering Lights',
  'foghorn-loop-far', 'foghorn-end-far', 'Marrow Monster - Call 1', 'Marrow Monster - Call 2', 'Marrow Monster - Call 3',
  'Marrow Monster - Aggro Call 1', 'Marrow Monster - Aggro Call 2', 'Marrow Monster - Aggro Call 3',
  'monster-attack-small-1', 'monster-attack-small-2', 'monster-attack-small-3', 'Insanity Ambience 4', 'Marrow Monster - Attack',
  'Marrow Monster - Idle Loop', 'Marrow Monster - Aggro Loop', 'Marrow Monster - Retreat', 'whispering-sounds', 'Raven Swarm Loop', 'monster-splash'];
{
  const box = { console: { warn() {}, log() {}, error() {} } };
  box.window = box; box.globalThis = box; vm.createContext(box);
  for (const f of ['data/audio.js', 'js/audio.js', 'data/particles.js', 'data/safezones.js'])
    vm.runInContext(fs.readFileSync(path.join(G, f), 'utf8'), box, { filename: f });
  const miss = PARTICLES.filter(n => !box.DR_PARTICLES[n]);
  check('hệ hạt S2 có trong DR_PARTICLES (' + PARTICLES.length + ')', !miss.length, miss.join(', '));
  const missA = CLIPS.filter(n => !box.DRAudio.resolve(n));
  check('clip S2 tra được bằng tên gốc (' + CLIPS.length + ')', !missA.length, missA.join(', '));
  const files = Object.entries(box.DR_AUDIO).filter(([, d]) => !fs.existsSync(path.join(G, d.src)));
  check('mọi tệp mp3 của data/audio.js có trên đĩa (' + Object.keys(box.DR_AUDIO).length + ')', !files.length, files.map(f => f[0]).join(', '));
  check('data/safezones.js: 38 collider layer 27', box.DR_SAFEZONES.count === 38 && box.DR_SAFEZONES.zones.length === 38, String(box.DR_SAFEZONES.zones.length));
  const pf = Object.keys(box.DR_PARTICLES).filter(k => !box.DR_PARTICLES[k].nodes.length);
  check('hệ hạt mới không rỗng', !pf.length, pf.join(', '));
}

(async () => {
  const srv = await serve(), base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + '/games/dredge/index.html?fresh=1&t=0.42');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });
  await page.waitForFunction(() => window.DRNav && DRNav.ready, null, { timeout: 60000 }).catch(() => {});
  const R = await page.evaluate(() => {
    const o = { mode: DRNav.mode, stats: DRNav.stats() };
    // 3. vùng an toàn: hộp Greater Marrow, 200 m ngoài khơi, tâm các vùng Marrows
    const dock = { x: 8.6, z: -0.99 };
    o.dockHit = DRSafeZones.hit(dock.x, dock.z);
    o.dockWhich = DRSafeZones.which(dock.x, dock.z);
    let off = null;
    for (let a = 0; a < 6.283 && !off; a += 0.1) {
      const x = dock.x + Math.cos(a) * 200, z = dock.z + Math.sin(a) * 200;
      if (DR_DEBUG.sdf(x, z) > 20 && !DRSafeZones.hit(x, z)) off = { x, z };
    }
    o.off = off; o.offHit = off ? DRSafeZones.hit(off.x, off.z) : null;
    o.offAllSdf = off ? DR_DEBUG.sdf(off.x, off.z) : null;
    // §0.1: Little Marrow (140, 6), Steel Point (96, 194), Outcast Isle (83, −112), Shrine_Cod (11, 76), GM1 (−46, 9), GM2 (307, 215), Castaway (208, 208), Courier (−86, 233) (Unity x, z)
    const C = { LittleMarrow: [140, 6], SteelPoint: [96, 194], OutcastIsle: [83, -112], ShrineCod: [11, 76], GM1: [-46, 9], GM2: [307, 215], Castaway: [208, 208], Courier: [-86, 233] };
    o.centres = {};
    for (const [k, [x, z]] of Object.entries(C)) o.centres[k] = DRSafeZones.hit(x, -z) || DRSafeZones.hit(x, -z - 0.5);
    // 4. đường đi: điểm đầu/cuối là các điểm đường tuần của MarrowMonster (MONSTERS.md §2.1), đổi z sang three
    const A = [[-118.8, -71.9], [-98.7, -56.5], [-78.5, -46.7], [-45.3, -41.3], [-28.1, -58.8], [5.0, -88.0], [-3.1, -124.6], [-52.4, -137.0], [-98.6, -127.3], [-119.8, -102.7]];
    const B = [[340.6, 246.5], [308.3, 312.4], [235.7, 325.5], [149.4, 327.3], [84.0, 242.7], [48.2, 143.0], [103.2, 106.1], [208.2, 105.5], [327.0, 119.6], [350.2, 178.4]];
    const pts = [...A, ...B].map(([x, z]) => ({ x, z: -z }));
    const crossesLand = (p, q) => { const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.5); for (let i = 0; i <= n; i++) if (DR_DEBUG.sdf(p.x + (q.x - p.x) * i / n, p.z + (q.z - p.z) * i / n) < 0) return true; return false; };
    const pathLand = pa => { for (let i = 1; i < pa.length; i++) if (crossesLand(pa[i - 1], pa[i])) return true; return false; };
    o.pairs = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 330) continue;
      const t0 = performance.now(), pa = DRNav.path(a, b), dt = performance.now() - t0;
      const len = pa ? pa.reduce((s, p, k) => k ? s + Math.hypot(p.x - pa[k - 1].x, p.z - pa[k - 1].z) : 0, 0) : null;
      o.pairs.push({ i, j, found: !!pa, land: pa ? pathLand(pa) : null, straightLand: crossesLand(a, b), len, direct: Math.hypot(a.x - b.x, a.z - b.z), ms: +dt.toFixed(1), n: pa && pa.length });
    }
    // ray / sample
    const land = (() => { for (let r = 3; r < 200; r += 3) for (let a = 0; a < 6.28; a += 0.3) { const x = 9 + Math.cos(a) * r, z = Math.sin(a) * r; if (DR_DEBUG.sdf(x, z) < -6) return { x, z }; } return null; })();
    o.land = land;
    if (land) {
      const s = DRNav.sample(land, 30), w = DRNav.walkable(land.x, land.z);
      o.sample = s && { x: s.x, z: s.z, sdf: DR_DEBUG.sdf(s.x, s.z), d: Math.hypot(s.x - land.x, s.z - land.z) }; o.landWalkable = w;
      const far = { x: land.x + (land.x - 9) * 3, z: land.z + land.z * 3 };
      o.ray = DRNav.ray({ x: 9, z: 0 }, land);
    }
    // 5. độ khớp trong đĩa Marrows (Unity (58, 27) -> three (58, −27), r 150)
    o.cmpGeneric = DRNav.compare(58, -27, 150, 'generic');
    o.cmpRay = DRNav.compare(58, -27, 150, 'ray');
    // ray-kind path in shallows: tìm hai điểm đi được của bản ray gần nhau
    const rp = [];
    for (let z = -100; z < 100 && rp.length < 2; z += 4) for (let x = 0; x < 200 && rp.length < 2; x += 4) if (DRNav.walkable(x, z, 'ray') && (rp.length === 0 || Math.hypot(x - rp[0].x, z - rp[0].z) > 40)) rp.push({ x, z });
    o.rayPath = rp.length === 2 ? (() => { const p = DRNav.path(rp[0], rp[1], 'ray'); return p && { n: p.length, land: pathLand(p), allRay: p.every(q => DRNav.walkable(q.x, q.z, 'ray')) }; })() : null;
    return o;
  });
  check('DRNav nạp navmask (mode navmesh)', R.mode === 'navmesh', R.mode + ' ' + JSON.stringify(R.stats));
  check('DRSafeZones.hit đúng tại bến Greater Marrow (8,6; −0,99)', R.dockHit === true, String(R.dockWhich));
  check('DRSafeZones.hit sai ở 200 m ngoài khơi', R.off && R.offHit === false, JSON.stringify(R.off));
  const miss = Object.entries(R.centres).filter(([, v]) => !v).map(([k]) => k);
  check('tâm 8 vùng an toàn Marrows còn lại trúng', !miss.length, miss.join(', ') || Object.keys(R.centres).join(','));
  const ok = R.pairs.filter(p => p.found), bad = ok.filter(p => p.land), detour = ok.filter(p => p.straightLand);
  check('DRNav.path: ' + ok.length + '/' + R.pairs.length + ' cặp điểm tuần có đường', ok.length >= R.pairs.length * 0.9, 'không đường: ' + R.pairs.filter(p => !p.found).map(p => p.i + '-' + p.j).join(' '));
  check('mọi đường tìm được không cắt đất (mẫu 0,5 m)', ok.length > 0 && !bad.length, bad.map(p => p.i + '-' + p.j).join(' '));
  check('có cặp mà đường thẳng cắt đất và đường tìm được vòng qua (' + detour.length + ')', detour.length >= 1 && detour.every(p => p.len > p.direct), '');
  const slow = Math.max(...R.pairs.map(p => p.ms));
  check('thời gian một lần tìm đường < 150 ms (lâu nhất ' + slow + ' ms)', slow < 150, '');
  check('DRNav.ray chặn đường thẳng qua đất', R.land && R.ray && R.ray.d < Math.hypot(R.land.x - 9, R.land.z), JSON.stringify(R.ray));
  check('DRNav.sample đưa điểm trên đất về nước', R.sample && R.sample.sdf > 0 && R.landWalkable === false, JSON.stringify(R.sample));
  const c = R.cmpGeneric, r = R.cmpRay;
  const frac = c.waterFarWalkable / c.waterFar;
  check('generic: ô nước cách đất > 2 m đi được ≥ 99 % (' + (100 * frac).toFixed(2) + ' %)', frac >= 0.99, JSON.stringify(c));
  check('ray: chỉ vùng nông, ít hơn generic (' + (100 * r.waterFarWalkable / r.waterFar).toFixed(1) + ' % nước xa bờ)', r.waterFarWalkable < c.waterFarWalkable && r.waterFarWalkable > 0, JSON.stringify(r));
  check('ray: đường đi trong vùng nông không cắt đất', R.rayPath && R.rayPath.n >= 2 && !R.rayPath.land && R.rayPath.allRay, JSON.stringify(R.rayPath));
  out.push('  . navmesh generic trong Marrows: nước ' + c.water + ' ô, đi được ' + c.waterWalkable + ', nước xa bờ ' + c.waterFar + ' → đi được ' + c.waterFarWalkable +
    '; đất ' + c.land + ' ô mà navmesh gốc cũng phủ ' + c.rawLandWalkable + ' (đã loại bằng landmask)');
  out.push('  . navmesh ray trong Marrows: nước ' + r.water + ' ô, đi được ' + r.waterWalkable + ', nước xa bờ đi được ' + r.waterFarWalkable + '/' + r.waterFar);
  out.push('  . đường: ' + R.pairs.map(p => p.i + '-' + p.j + ':' + (p.found ? p.n + 'đ ' + Math.round(p.len) + 'm/' + Math.round(p.direct) + 'm ' + p.ms + 'ms' : 'x')).join('  '));
  // spawn thử mọi hệ hạt S2: không ném lỗi, có hạt sống sau 1 s
  const sp = await page.evaluate(async (names) => {
    const res = {};
    for (const n of names) {
      let h = null, err = null;
      try { h = DRParticles.spawn(n, { pos: [20, 1, -30], loop: true }); } catch (e) { err = String(e); }
      res[n] = { has: DRParticles.has(n), h: !!h, err };
    }
    await new Promise(r => setTimeout(r, 1200));
    return { res, stats: DRParticles.stats() };
  }, PARTICLES);
  const badSp = Object.entries(sp.res).filter(([, v]) => !v.has || v.err || !v.h).map(([k, v]) => k + (v.err ? ':' + v.err : ''));
  check('DRParticles.spawn chạy được cả ' + PARTICLES.length + ' hệ S2', !badSp.length, badSp.join(', '));
  // 6 hệ chỉ phát theo quãng đường (rateOverTime 0, rateOverDistance > 0: vệt nước theo thân quái, hạt sương FogDevil, hạt xúc tu) nên đứng yên thì không có hạt
  const DIST_ONLY = ['MarrowMonsterWake', 'PhantomSharkWake', 'FogDevilParticles', 'FogDevilAggroParticles', 'TentacleTipParticles', 'TentacleBaseParticles'];
  const dead = PARTICLES.filter(k => !DIST_ONLY.includes(k) && !(sp.stats.byName[k] && sp.stats.byName[k].particles));
  check('mỗi hệ S2 phát theo thời gian có hạt sống sau 1,2 s (' + (PARTICLES.length - DIST_ONLY.length - dead.length) + '/' + (PARTICLES.length - DIST_ONLY.length) + ')', !dead.length, dead.join(', '));
  await page.screenshot({ path: path.join(SHOTS, 's2-spawn.png') });
  check('không lỗi trang', !errors.length, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
  console.log(out.join('\n'));
  console.log(fail ? `\n${fail} lỗi, ${pass} đạt` : `\nđạt ${pass}/${pass}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
