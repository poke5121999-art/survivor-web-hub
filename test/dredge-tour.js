/*
 * DREDGE — Biển Mù: tour qua một danh mục trạng thái cố định, mỗi trạng thái một ảnh 1280x720 để so cạnh khung hình từ video gameplay thật.
 *
 * Chạy:  node test/dredge-tour.js [key ...]          (không đối số = cả danh mục)
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-tour.js   (chạy trên Pages)
 * Ra:    SHOTS (mặc định %TEMP%/dredge-tour)/<key>.png  và  tour.json = [{key, ok, note, info}], info = DR_DEBUG.info() lúc chụp.
 * Mỗi trạng thái tải trang mới (fresh=1) trong context riêng; một trạng thái hỏng không cản các trạng thái khác.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SW = 'destination.gm-shipwright', FM = 'destination.gm-fishmonger', SWU = 'destination.gm-shipwright-upgrades';
const ev = (page, f, a) => page.evaluate(f, a);

// ---- bước chuẩn bị chung -------------------------------------------------------------------------------------------
async function load(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
}
// ván mới, mở sẵn điểm đến, tiền, rồi bỏ cảnh mở đầu
async function newGame(page, { skip = true } = {}) {
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, ([d]) => { DR.s.availableDestinations.push(...d); DR.s.funds = 150; }, [[SW, FM, SWU]]);
  if (skip) {
    await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
    await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  }
}
// đi hết hội thoại cho tới khi giao diện bến hiện
async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}
// mở điểm đến bằng nút ở bến, đi hết hội thoại tới khi `until` đúng
async function openDest(page, id, until) {
  const sel = '.dk-dest[data-dest="' + id + '"]';
  try { await page.click(sel, { timeout: 3000 }); } catch (e) { await page.dispatchEvent(sel, 'click'); }
  for (let i = 0; i < 120; i++) {
    if (await ev(page, until)) break;
    const st = await ev(page, () => { const s = window.DRDialogue && DRDialogue.isOpen() && DRDialogue.state(); return s ? s.kind : null; });
    if (st === 'options') { await sleep(700); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(350);
  }
  if (!(await ev(page, until))) throw new Error('destination never opened: ' + id);
  await sleep(1000);
}
// ra biển: rời bến, đặt thuyền trên mặt nước thoáng quanh bến, đặt giờ
async function toSea(page, time) {
  await dockReady(page);
  await ev(page, () => DR.setMode('sail'));
  await sleep(500);
  await ev(page, () => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await ev(page, t => DR_DEBUG.setTime(t), time);
  await sleep(1200);
}
async function seaAt(page, time, lights) {
  await newGame(page);
  await toSea(page, time);
  if (lights) await ev(page, () => DRBoat.setLights(true));
}
async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await sleep(ms);
}
async function release(page, keys) { for (const k of keys) await page.keyboard.up(k); }
// tới điểm câu có loài ids (đêm thì sang giờ đêm), cần câu/gầu đã lắp
async function toSpot(page, ids, dredge) {
  await newGame(page);
  await dockReady(page);
  await ev(page, () => DR.setMode('sail'));
  await sleep(500);
  await ev(page, d => { DR_DEBUG.give(d ? 'dredge1' : 'tir-rod1'); DRBoat.refresh(); DR_DEBUG.setTime(0.4); }, dredge);
  const sp = await ev(page, i => DR_DEBUG.spotNear(i, 0, 0), ids);
  if (!sp) throw new Error('no spot for ' + ids);
  await ev(page, s => { const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = 2; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, sp);
  await page.waitForFunction(() => DR.view.nearSpot, null, { timeout: 8000 }).catch(() => {});
  await sleep(900);
  let ns = await ev(page, () => DR.view.nearSpot);
  if (ns && ns.status === 'wrong_time') {
    await ev(page, s => { DR_DEBUG.setTime(0.9); const o = DR.s.spots[s.id]; o.stock = Math.max(o.maxStock || 1, 1); o.lastUpdate = DR.s.time; }, sp);
    await sleep(1300);
    ns = await ev(page, () => DR.view.nearSpot);
  }
  if (!ns || ns.status !== 'ok') throw new Error('spot status ' + JSON.stringify(ns));
  return { sp, ns };
}
async function startMinigame(page) {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest' && DRMinigame.isShown(), null, { timeout: 6000 });
  await sleep(2600);                       // camera blend 2 s
  await page.keyboard.press('Space');      // bắt đầu
  await sleep(1300);
}
async function catchFish(page) {
  await toSpot(page, ['mackerel']);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest', null, { timeout: 6000 });
  await sleep(2600);
  await page.keyboard.press('Space');
  await sleep(1300);
  // bot bấm hoàn hảo cho FISHING_RADIAL (như test/dredge-fishing.js)
  await page.evaluate(async () => {
    const t0 = performance.now(); let last = -1e9;
    while (DRMinigame.phase() === 'running' && performance.now() - t0 < 60000) {
      const d = DRMinigame._debug(); if (!d) break;
      if (d.penalty <= 0) d.targets.forEach((t, i) => {
        if (!d.hitThis.includes(i) && !(t.special && !d.trophyShowing) && d.angle > t.a - t.w / 2 + 3 && d.angle < t.a + t.w / 2 - 3 && performance.now() - last > 90) { last = performance.now(); DRMinigame._press(); }
      });
      await new Promise(r => requestAnimationFrame(r));
    }
  });
}

// ---- danh mục: đây là hợp đồng dữ liệu -----------------------------------------------------------------------------
const STATES = [
  { key: 'title', go: async (page) => { await sleep(1500); } },
  { key: 'intro', go: async (page) => {
      await newGame(page, { skip: false });
      await page.waitForFunction(() => window.DRIntro && DRIntro.stage === 'illustrated', null, { timeout: 5000 }).catch(() => {});
      await sleep(4200);
    } },
  { key: 'dock-arrive', go: async (page) => { await newGame(page); await dockReady(page); await sleep(1500); } },
  { key: 'sail-day', go: async (page) => { await seaAt(page, 0.5); await hold(page, ['KeyW'], 2000); } },
  { key: 'tutorial-first', go: async (page) => {       // những giây đầu lái sau hội thoại mở đầu: hộp hướng dẫn WASD (V09)
      await newGame(page); await dockReady(page);
      await ev(page, () => DR.setMode('sail'));
      await sleep(3600);
    } },
  { key: 'sail-dusk', go: async (page) => { await seaAt(page, 0.8); await hold(page, ['KeyW'], 2000); } },
  { key: 'sail-night', go: async (page) => { await seaAt(page, 0.95, true); await hold(page, ['KeyW'], 2000); } },
  { key: 'sail-turn', go: async (page) => { await seaAt(page, 0.5); await hold(page, ['KeyW', 'KeyA'], 1500); } },
  { key: 'spot-near', go: async (page) => { await toSpot(page, ['mackerel']); await sleep(800); } },
  { key: 'fish-minigame', go: async (page) => { await toSpot(page, ['mackerel']); await startMinigame(page); } },
  { key: 'dredge-minigame', go: async (page) => { await toSpot(page, ['flag-1', 'flag-2', 'metal'], true); await startMinigame(page); } },
  { key: 'catch-cursor', go: async (page) => {
      await catchFish(page);
      await page.waitForFunction(() => DRCargo.held(), null, { timeout: 8000 });
      await sleep(2500);
    } },
  { key: 'cargo', go: async (page) => {
      await seaAt(page, 0.5);
      await ev(page, () => { for (const f of ['mackerel', 'cod', 'black-sea-bass', 'grey-mullet']) try { DR_DEBUG.give(f); } catch (e) { /* */ } });
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 });
      await sleep(1000);
    } },
  { key: 'fishmonger', go: async (page) => {
      await newGame(page); await dockReady(page);
      await ev(page, () => { for (const f of ['mackerel', 'cod']) try { DR_DEBUG.give(f); } catch (e) { /* */ } });
      await openDest(page, FM, () => DRShop.isOpen() && DRCargo.isOpen());
    } },
  { key: 'shipwright', go: async (page) => {
      await newGame(page); await dockReady(page);
      await openDest(page, SWU, () => DRUpgrade.isOpen());
    } },
  { key: 'shop', go: async (page) => {
      await newGame(page); await dockReady(page);
      await openDest(page, SW, () => DRShop.isOpen() && DRCargo.isOpen());
    } },
  { key: 'dialogue', go: async (page) => {
      await newGame(page, { skip: false });
      await page.waitForFunction(() => DRIntro.stage === 'illustrated', null, { timeout: 5000 }).catch(() => {});
      await sleep(2500);
      await page.keyboard.down('Space'); await sleep(2400); await page.keyboard.up('Space');
      await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 40000 });
      for (let i = 0; i < 14; i++) {      // đi qua lời kể tới dòng có tên người nói (chân dung)
        const st = await ev(page, () => DRDialogue.state());
        if (st && st.kind === 'line' && st.name && !st.typing) break;
        if (st && st.kind === 'options') { await sleep(800); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
        else await page.keyboard.press('Space');
        await sleep(700);
      }
      const st = await ev(page, () => DRDialogue.state());
      if (!(st && st.name)) throw new Error('no dialogue line with speaker');
      await sleep(600);
    } },
  { key: 'map', go: async (page) => {                       // phím M ở biển gần Greater Marrow (vbook: js/map.js)
      await seaAt(page, 0.5);
      await ev(page, () => { DR.s.vars['has-visited-dock-dock.greater-marrow'] = true; DR.s.vars['has-visited-dock-dock.little-marrow'] = true; });
      await page.keyboard.press('KeyM');
      await page.waitForFunction(() => window.DRMap && DRMap.isOpen(), null, { timeout: 5000 });
      await sleep(1200);
    } },  { key: 'encyclopedia', go: async (page) => {              // phím L ở bến; cá tuyết bắt 3 con, đã bán, lớn nhất 78,6 cm (vbook: js/encyclopedia.js)
      await newGame(page); await dockReady(page);
      await ev(page, () => { DR.s.caught.cod = 3; DR.s.vars['enc-largest-cod'] = (78.6 - 50) / 70; DR.s.vars['enc-sold-cod'] = 1; });
      await page.keyboard.press('KeyL');
      await page.waitForFunction(() => window.DREncyclopedia && DREncyclopedia.isOpen(), null, { timeout: 5000 });
      await sleep(1200);
    } },  { key: 'panic-high', go: async (page) => {
      await seaAt(page, 0.97, true);
      // vwater (V14): xúc tu đỏ của sự kiện TentacleAttack chỉ bốc ở chỗ sâu > 10 m (CheckDepthRelativePoint), nên đưa thuyền ra vùng sâu,
      // đặt worldPhase 2 và bốc thăm bằng chính hàm của WorldEventManager (js/tentacle.js)
      await ev(page, () => {
        DR.s.sanity = 0.08; DR.s.worldPhase = 2;
        for (let x = -150; x <= 150; x += 6) for (let z = -150; z <= 150; z += 6)
          if (DRWorld.depth01(x, z) > 0.2 && DRWorld.sdf(x, z) > 12 && DRWorld.zoneAt(x, z) === 'THE_MARROWS') { DR_DEBUG.teleport(x, z - 20, Math.PI); return; }
      });
      await sleep(800);
      await ev(page, () => { DR.s.sanity = 0.08; DR.s.worldPhase = 2; });
      for (let i = 0; i < 40 && !(await ev(page, () => DRTentacle.debug.active)); i++) { await ev(page, () => { DR.s.sanity = 0.08; DRTentacle.debug.roll(); }); }
      await sleep(3600);
    } },
  { key: 'rain', go: async (page) => {
      await seaAt(page, 0.5);
      const name = await ev(page, () => {
        const n = Object.keys(DR_WEATHER).find(k => /rain/i.test(k) && !/storm/i.test(k)) || Object.keys(DR_WEATHER).find(k => DR_WEATHER[k].parameters && DR_WEATHER[k].parameters.hasRain);
        if (!n) return null;
        DRSky.weather.pin(n); DRSky.weather.set(n); return n;
      });
      if (!name) throw new Error('no rain weather');
      await hold(page, ['KeyW'], 1500);
      await sleep(1500);
      return name;
    } },
  { key: 'damage', go: async (page) => {
      await seaAt(page, 0.5);
      await ev(page, () => DR_DEBUG.hit());
      await sleep(250);
    } },
  { key: 'banner', go: async (page) => {
      await catchFish(page);
      await page.waitForFunction(() => window.DRBanner && DRBanner._debug().showing, null, { timeout: 8000 });
      await sleep(900);
    } },
];

// ---- chạy ----------------------------------------------------------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const ROOT = path.resolve(__dirname, '..');
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  return errors;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms / 1000 + 's')), ms))]);

(async () => {
  const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-tour');
  fs.mkdirSync(SHOTS, { recursive: true });
  const want = process.argv.slice(2);
  const list = want.length ? STATES.filter(s => want.includes(s.key)) : STATES;
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const t00 = Date.now(), results = [];
  for (const st of list) {
    const t0 = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    let ok = true, note = '', info = null, skip = false;
    try {
      await withTimeout((async () => {
        await load(page, base);
        const r = await st.go(page);
        if (typeof r === 'string') note = r;
      })(), 150000);
    } catch (e) { ok = false; note = e.message.split('\n')[0]; skip = !!e.skip; }
    if (!skip) {
      try { info = await withTimeout(page.evaluate(() => window.DR_DEBUG && DR_DEBUG.info()), 5000); } catch (e) { /* */ }
      try { await withTimeout(page.screenshot({ path: path.join(SHOTS, st.key + '.png') }), 15000); } catch (e) { ok = false; note += ' [shot failed: ' + e.message + ']'; }
    }
    if (errors.length) note += (note ? ' | ' : '') + 'errors: ' + [...new Set(errors)].slice(0, 5).join(' ; ');
    results.push({ key: st.key, ok, note, info });
    console.log((ok ? 'OK    ' : 'FAIL  ') + st.key.padEnd(16) + ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's  ' + note);
    await ctx.close().catch(() => {});
  }
  fs.writeFileSync(path.join(SHOTS, 'tour.json'), JSON.stringify(results, null, 1));
  console.log('total ' + ((Date.now() - t00) / 1000).toFixed(0) + 's -> ' + SHOTS);
  await browser.close();
  if (srv) srv.close();
})().catch(e => { console.error(e); process.exit(1); });

module.exports = { STATES };
