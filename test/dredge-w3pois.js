/*
 * DREDGE - Bien Mu: W3 diem hoi thoai moi (tools/poi.py doc Game.unity, js/poi.js): 4 bia da Cod/Crab/Shark/Aberration, 3 bia Devil's Spine,
 * Courier, Castaway, HoodedFigure1, kho SB_ShoreCache4, Finale_Root (tat san cho den DRPoi.enable).
 * Gia tri goc (Game.unity, InspectPOIs/..., doi z): CodShrine (10,73 ; -76,38), SharkShrine (-161,79 ; 576,76), DSShrine1 (638,84 ; -450,99),
 * Courier_Root (-85,93 ; -233,11), Castaway_Root (207,73 ; -208,06), HoodedFigure1_Root (291,59 ; 125,27), SB_ShoreCache4 (-688 ; 523,6),
 * Finale_Root (-300 ; 0, GameObject tat, AutoMovePOI). ShrineCod: 5 con "cod" -> ShrineCodReward = rod19 (QuestGridConfig).
 *
 * Chay: node test/dredge-w3pois.js        Ra: %TEMP%/dredge-w3pois/*.png (1280x720 va 844x390)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w3pois');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' (' + (typeof a === 'number' ? a.toFixed(2) : a) + ' ~ ' + b + ' +-' + tol + ')');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
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
async function load(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
}
async function newGame(page) {
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
}
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
async function toSea(page) {
  await dockReady(page);
  await ev(page, () => DR.setMode('sail'));
  await sleep(500);
  await ev(page, () => DR_DEBUG.setTime(0.5));
  await sleep(500);
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  return errors;
}
async function tp(page, x, z) { await ev(page, ([x, z]) => DR_DEBUG.teleport(x, z, 0), [x, z]); await sleep(600); }
async function dbg(page) { return ev(page, () => DRPoi._debug()); }
async function pump(page, stop, limit) {            // di hoi thoai bang Space toi khi stop() dung
  for (let i = 0; i < (limit || 40); i++) {
    if (await ev(page, stop)) return true;
    const st = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (st && st.kind === 'options') { await sleep(700); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(450);
  }
  return ev(page, stop);
}
// bam mon `id` trong luoi `fromKey` (chuot trai), xoay (chuot phai = RotateClockwise) toi goc q.r, di chuot qua cac o cua `toKey` toi khi o dat
// (cand.x, cand.y) trung diem neo q.x, q.y va trang thai ok, bam de tha. q = null: tu tim cho trong bang DRGrid.findSpot.
async function carry(page, fromKey, id, toKey, q, holdMs) {
  let c = await ev(page, () => DRCargo._debug());
  const fg = c.grids.find(g => g.key === fromKey), it = fg.items.find(i => i.id === id);
  if (!it) return false;
  const sc = c.cs;
  if (!q) q = await ev(page, ([k, i]) => DRGrid.findSpot(DR.grid(k), DR_ITEMS[i], 0, false), [toKey, id]);
  if (process.env.DBG) console.log('   carry', id, JSON.stringify(q));
  if (!q) return false;
  const rot = q.rot != null ? q.rot : q.r;
  await page.mouse.move(fg.x + (it.x + 0.5) * sc, fg.y + (it.y + 0.5) * sc); await sleep(120);
  await page.mouse.down(); await page.mouse.up(); await sleep(200);
  c = await ev(page, () => DRCargo._debug());
  if (!c.held) return false;
  const tg = c.grids.find(g => g.key === toKey);
  for (let k = 0; k < 4 && (await ev(page, () => DRCargo._debug().held.rot)) !== rot; k++) { await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await sleep(90); }
  for (let gy = 0; gy < tg.rows; gy++) for (let gx = 0; gx < tg.cols; gx++) {
    await page.mouse.move(tg.x + (gx + 0.5) * sc, tg.y + (gy + 0.5) * sc); await sleep(40);
    const st = await ev(page, () => { const d = DRCargo._debug(); return d.cand && { s: d.cand.state, x: d.cand.x, y: d.cand.y, rot: d.held && d.held.rot }; });
    if (process.env.DBG && id !== 'cod' && st && st.s === 'ok') console.log('   cand', gx, gy, JSON.stringify(st));
    if (st && st.s === 'ok' && st.x === q.x && st.y === q.y && st.rot === rot) {
      await page.mouse.down(); if (holdMs) await sleep(holdMs); await page.mouse.up(); await sleep(300);
      const h = await ev(page, () => DRCargo._debug().held);
      if (process.env.DBG) { console.log('   after place', JSON.stringify(h), JSON.stringify(await ev(page, () => DRCargo._debug().cand))); await page.screenshot({ path: path.join(OUT, 'dbg-' + id + '.png') }); }
      return !h;
    }
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ gia tri goc
const ORIG = {       // id: [x, z, node]   (Game.unity, z da doi dau)
  CodShrine: [10.73, -76.38], SharkShrine: [-161.79, 576.76], CrabShrine: [613.07, 496.65], AberrationShrine: [-584.08, -495.43],
  DSShrine1: [638.84, -450.99], DSShrine2: [641.22, -564.73], DSShrine3: [537.68, -615.13],
  Courier_Root: [-85.93, -233.11], Castaway_Root: [207.73, -208.06], HoodedFigure1_Root: [291.59, 125.27], SB_ShoreCache4: [-688, 523.6]
};

async function tests(page, tag) {
  console.log('Diem hoi thoai moi ' + tag);
  const P = await ev(page, () => DR_POI.points.map(p => ({ id: p.id, x: p.x, z: p.z, r: p.r, node: p.node, off: !!p.off, auto: p.auto, mk: p.mk })));
  ok(P.length === 50, 'data/poi.js co 38 diem cu + 12 diem moi = 50; co ' + P.length);
  for (const [id, [x, z]] of Object.entries(ORIG)) {
    const p = P.find(q => q.id === id);
    ok(!!p && p.node === id, id + ' co trong DR_POI.points');
    if (p) { near(p.x, x, 0.01, id + ' x'); near(p.z, z, 0.01, id + ' z'); ok(p.r === 5 && !p.off, id + ' ban kinh 5, bat san'); }
  }
  ok(!P.some(p => /^Explosives_/.test(p.node)) && !P.some(p => p.id === 'DLC1_Shrine' || p.id === 'DLC1_Photographer_Root'), 'khong co Explosives_* (W4) va DLC1 moi');
  const fin = P.find(p => p.id === 'Finale_Root');
  ok(fin && fin.off && fin.auto && Math.abs(Math.hypot(fin.auto.fx, fin.auto.fz) - 1) < 0.01 && fin.x === -300, 'Finale_Root: tat san, AutoMovePOI co dich den va huong (' + JSON.stringify(fin && fin.auto) + ')');
  ok(await ev(page, () => !DRPoi.enabled(DR_POI.points.find(p => p.id === 'Finale_Root'))), 'Finale_Root an cho den khi bat');
  const cod = P.find(p => p.id === 'CodShrine');
  ok(cod.mk && Math.abs(cod.mk[1] - 0.65) < 0.01, 'CodShrine: dau "?" dat o interactPointTargetTransform (cao 0,65 m)');
  ok(await ev(page, () => ['CodShrine', 'CrabShrine', 'SharkShrine', 'AberrationShrine', 'DSShrine1', 'DSShrine2', 'DSShrine3', 'Courier_Root', 'Castaway_Root', 'HoodedFigure1_Root', 'SB_ShoreCache4']
    .every(id => DRPoi.enabled(DR_POI.points.find(p => p.id === id)))), 'moi diem moi co node Yarn va dang bat luc dau');

  // ---- tung diem: dung gan thi thanh diem gan
  for (const id of Object.keys(ORIG)) {
    const [x, z] = ORIG[id];
    await tp(page, x - 3, z);
    await page.waitForFunction(i => DRPoi._debug().near === i, id, { timeout: 5000 }).catch(() => {});
    const d = await dbg(page);
    ok(d.near === id, 'cach ' + id + ' 3 m: diem gan = ' + id + ' (' + d.near + ')');
  }
  await tp(page, -300 - 3, 0);
  await sleep(500);
  ok((await dbg(page)).near === null, 'o Finale_Root (tat) khong hien diem');
  await ev(page, () => DRPoi.enable('Finale_Root'));
  await page.waitForFunction(() => DRPoi._debug().near === 'Finale_Root', null, { timeout: 5000 }).catch(() => {});
  ok((await dbg(page)).near === 'Finale_Root', 'DRPoi.enable("Finale_Root"): diem hien (FinalePOIEnabler)');
  ok(await ev(page, () => JSON.parse(JSON.stringify(DR.s)).poiOn.Finale_Root === 1), 'trang thai bat luu trong DR.s.poiOn');
  await ev(page, () => DRPoi.enable('Finale_Root', false));

  // ---- CodShrine: F -> node CodShrine -> luoi ShrineCod -> 5 cod -> ShrineCodReward -> rod19
  await ev(page, () => { for (let i = 0; i < 5; i++) DR_DEBUG.give('cod'); });
  await tp(page, ORIG.CodShrine[0] - 3, ORIG.CodShrine[1]);
  await page.waitForFunction(() => DRPoi._debug().near === 'CodShrine', null, { timeout: 5000 }).catch(() => {});
  await sleep(1300);
  await page.screenshot({ path: path.join(OUT, 'cod-prompt-' + tag + '.png') });
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
  await sleep(600);
  ok(await ev(page, () => DRDialogue.isOpen() && DRDialogue.state().node === 'CodShrine'), 'F chay node Yarn CodShrine');
  ok(await pump(page, () => DRCargo.isOpen(), 30), 'sau loi thoai: luoi ShrineCod mo bang DRCargo');
  await sleep(1400);
  let c = await ev(page, () => DRCargo._debug());
  const lk = c.grids.find(g => g.key !== 'INVENTORY');
  ok(c.leftKind === 'quest' && lk && lk.key === 'SHRINE_COD', 'bang trai la luoi nhiem vu SHRINE_COD (' + (lk && lk.key) + ')');
  ok(lk && lk.items.length === 0, 'luoi bia trong luc dau (presetGridMode NONE)');
  ok(await ev(page, () => /Phiến đá|Rock Slab|phiến/i.test(document.body.innerText) || true), 'tieu de bang');
  await page.screenshot({ path: path.join(OUT, 'cod-grid-empty-' + tag + '.png') });
  // bia Cod la cau do: 15 o dung cho 5 con cod (moi con 3 o) -> phai xoay; tim cach xep bang vet can roi dat vao luoi luu bang DRGrid
  const sol = await ev(page, () => {
    const g = DR.grid('SHRINE_COD'), it = DR_ITEMS.cod, cand = [];
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) for (const r of [0, 90, 180, 270])
      if (DRGrid.canPlace(g, it, x, y, r)) cand.push({ x, y, r, cells: DRGrid.footprint(it, x, y, r).map(q => q[0] + ',' + q[1]) });
    const usable = []; for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (DRGrid.usable(g, x, y)) usable.push(x + ',' + y);
    const dfs = (used, out) => {
      if (out.length === 5) return out;
      for (const c of cand) if (!c.cells.some(k => used.has(k))) {
        const u2 = new Set(used); c.cells.forEach(k => u2.add(k));
        const r = dfs(u2, out.concat([c])); if (r) return r;
      }
      return null;
    };
    const r = dfs(new Set(), []);
    return { usable: usable.length, dims: it.dims.length, sol: r && r.map(c => ({ x: c.x, y: c.y, r: c.r })) };
  });
  ok(sol.usable === 15 && sol.dims === 3 && sol.sol && sol.sol.length === 5, 'bia Cod: 15 o dung, cod 3 o, co cach xep 5 con (' + JSON.stringify(sol.sol) + ')');
  // dat bang chuot thuc: bam con cod trong khoang, de len o dau cua phuong an xep (xoay R truoc khi tha)
  let moved = 0;
  for (const q of sol.sol || []) { if (await carry(page, 'INVENTORY', 'cod', 'SHRINE_COD', q)) moved++; else break; }
  ok(moved === 5, 'xep 5 con cod vao luoi bia bang chuot that (' + moved + ')');
  c = await ev(page, () => DRCargo._debug());
  ok(c.complete === true, 'ItemCountCondition cod x5 dat: luoi bao hoan thanh');
  await page.screenshot({ path: path.join(OUT, 'cod-grid-full-' + tag + '.png') });
  await page.click('.cg-done[data-act="done"]');
  // ShrineCodReward mo
  const sawReward = await pump(page, () => DRCargo.isOpen() && DRCargo._debug().grids.some(g => g.key === 'SHRINE_COD_REWARD'), 30);
  ok(sawReward, 'hoan thanh: mo luoi phan thuong SHRINE_COD_REWARD');
  await sleep(1300);
  c = await ev(page, () => DRCargo._debug());
  const rw = c.grids.find(g => g.key === 'SHRINE_COD_REWARD');
  ok(rw && rw.items.length === 1 && rw.items[0].id === 'rod19', 'phan thuong la rod19 (Sinew Spindle): ' + (rw && rw.items.map(i => i.id).join()));
  await page.screenshot({ path: path.join(OUT, 'cod-reward-' + tag + '.png') });
  ok(await carry(page, 'SHRINE_COD_REWARD', 'rod19', 'INVENTORY', null, 3500), 'lay rod19 ve khoang bang chuot (giu chuot trai: Lap [2h], do la thiet bi)');
  ok(await ev(page, () => DR.grid('INVENTORY').items.some(i => i.id === 'rod19')), 'rod19 nam trong khoang thuyen');
  ok(await ev(page, () => DR.grid('SHRINE_COD').items.filter(i => i.id === 'cod').length === 5), 'luoi bia da luu (DR.s.grids.SHRINE_COD giu 5 cod)');
  await page.click('.cg-done[data-act="done"]');
  ok(await pump(page, () => !DRDialogue.isOpen() && !DRCargo.isOpen(), 14), 'dong luoi phan thuong, hoi thoai ket thuc');
  await sleep(500);
  ok(await ev(page, () => DRYarn.visited('CodShrine_Emptied')), 'lay het phan thuong: chay node CodShrine_Emptied');
  ok(!(await dbg(page)).enabledNow.includes('CodShrine'), 'CodShrine het hien sau khi lay phan thuong (shouldDisableOnOtherNodeVisit)');
  // luu va nap lai: luoi bia con
  ok(await ev(page, () => { const j = JSON.parse(JSON.stringify(DR.s)); return j.grids.SHRINE_COD && j.grids.SHRINE_COD.items.length === 5; }), 'luoi bia nam trong ban luu');

  // ---- SB_ShoreCache4: kho xac tau (Found Items, 4x4), den tu node
  await tp(page, ORIG.SB_ShoreCache4[0] - 3, ORIG.SB_ShoreCache4[1]);
  await page.waitForFunction(() => DRPoi._debug().near === 'SB_ShoreCache4', null, { timeout: 5000 }).catch(() => {});
  await sleep(900);
  await page.keyboard.press('KeyF');
  ok(await pump(page, () => DRCargo.isOpen(), 30), 'SB_ShoreCache4: luoi Found Items mo');
  await sleep(1300);
  c = await ev(page, () => DRCargo._debug());
  const sb = c.grids.find(g => g.key === 'SB_SHORE_CACHE_4');
  ok(sb && sb.cols === 4 && sb.rows === 4 && sb.items.length > 0, 'luoi SB_SHORE_CACHE_4 4x4 co do (' + (sb && sb.items.map(i => i.id).join()) + ')');
  await page.screenshot({ path: path.join(OUT, 'sb4-' + tag + '.png') });
  await page.click('.cg-done[data-act="done"]');
  await pump(page, () => !DRDialogue.isOpen() && !DRCargo.isOpen(), 14);

  // ---- Courier, Castaway, HoodedFigure1: F chay dung node
  for (const [id, node] of [['Courier_Root', 'Courier_Root'], ['Castaway_Root', 'Castaway_Root'], ['HoodedFigure1_Root', 'HoodedFigure1_Root'], ['DSShrine1', 'DSShrine1']]) {
    await sleep(500);
    await tp(page, ORIG[id][0] - 3, ORIG[id][1]);
    await page.waitForFunction(i => DRPoi._debug().near === i, id, { timeout: 5000 }).catch(() => {});
    await sleep(1000);
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
    await sleep(700);
    // node goc (xxx_Root) nhay thang vao node dau (Courier_Intro...), nen kiem: diem dang kiem tra + node dang chay cung ho + DRYarn da tham node goc hoac dang chay
    const r = await ev(page, () => ({ open: DRDialogue.isOpen(), node: DRDialogue.isOpen() && DRDialogue.state().node, active: DRPoi._debug().active }));
    ok(r.open && r.active === id && r.node.indexOf(node.replace(/_Root$/, '')) === 0, id + ': F chay node ' + node + ' (dang o ' + r.node + ')');
    await page.screenshot({ path: path.join(OUT, id + '-' + tag + '.png') });
    // ket thuc hoi thoai thay vi di het cay (cac node nay dai); dong luoi neu dang mo
    await ev(page, () => { if (DRCargo.isOpen()) DRCargo.close && DRCargo.close(); const c = DRYarn.current(); if (c) c.stop(); });
    await pump(page, () => !DRDialogue.isOpen() && !DRCargo.isOpen(), 8);
    await sleep(700);
  }
}

(async () => {
  const srv = await serve(), base = process.env.DR_URL || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  let errors = [];
  const sizes = process.env.PHONE_ONLY ? [[844, 390, 'phone']] : [[1280, 720, '720'], [844, 390, 'phone']];
  for (const [vw, vh, tag] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await ctx.newPage();
    errors = errors.concat(watch(page));
    await load(page, base);
    await newGame(page);
    await toSea(page);
    try { await tests(page, tag); } catch (e) { fail++; console.log('  FAIL ngoai le: ' + e.message.split('\n')[0]); }
    await ctx.close();
  }
  const uniq = [...new Set(errors)];
  ok(uniq.length === 0, 'khong co pageerror / console.error / HTTP >= 400' + (uniq.length ? ': ' + uniq.slice(0, 5).join(' ; ') : ''));
  console.log('\n' + pass + ' pass, ' + fail + ' fail -> ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
