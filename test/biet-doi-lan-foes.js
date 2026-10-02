/*
 * BIỆT ĐỘI LẶN — bộ kiểm hệ quái (data/foes.js, js/foes.js, js/engine/fish.js + shark.js).
 *
 * Chạy:  node test/biet-doi-lan-foes.js
 * Ảnh chụp ra %TEMP%/bdl-foes-shots (đổi bằng SHOTS=...). Chạy ở 1280×720, map 0 và map 4.
 * BASE=https://.../ kiểm bản trên mạng.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-foes-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail !== undefined && detail !== '' ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// cùng bộ trộn số với js/foes.js: chọn hạt giống cho lượt "ngủ" hoặc "bỏ qua ngủ"
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seedFor(mapId, wantSkip) {
  for (let s = 1; s < 500; s++) if ((mulberry(s + mapId * 7919)() < 0.2) === wantSkip) return s;
  throw new Error('không có hạt giống');
}

async function open(browser, base, map, seed, W = 1280, H = 720) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  await page.goto(base + '/games/biet-doi-lan/index.html?map=' + map + '&seed=' + seed);
  const ok = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive' && BDL_DEBUG.foes, null, { timeout: 120000 }).then(() => true, () => false);
  if (ok) await sleep(2500);
  return { page, errors, ok };
}

const FOES = page => page.evaluate(() => BDL_DEBUG.foes.list());
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });

// chỗ nước thoáng cách Dave dx mét theo phương ngang, thẳng tầm nhìn: trả {x, y} hoặc null
const clearSpot = (page, dx) => page.evaluate(dx0 => {
  const G = HX.game, d = G.diver.pos, W = G.world;
  for (const dx of [dx0, -dx0, dx0 * 0.8, -dx0 * 0.8, dx0 * 1.2, -dx0 * 1.2, dx0 * 0.6, -dx0 * 0.6]) {
    for (const dy of [0, 0.8, -0.8, 1.6, -1.6]) {
      const x = d.x + dx, y = d.y + dy;
      if (W.open(x, y, 1.0) && !W.raycast(d.x, d.y, x, y) && y < HX_TUNING.water.surfaceY - 3) return { x, y };
    }
  }
  return null;
}, dx);

// Dave tới chỗ thoáng giữa nước có chỗ để chạy các kịch bản
async function openWaterDave(page) {
  return page.evaluate(() => {
    const G = HX.game, W = G.world, top = HX_TUNING.water.surfaceY;
    for (let y = top - 6; y > top - 14; y -= 1) for (let x = -50; x < 60; x += 2) {
      let good = true;
      for (const dx of [-8, -6, 6, 8]) if (!W.open(x + dx, y, 1.0) || W.raycast(x, y, x + dx, y)) { good = false; break; }
      if (good && W.open(x, y, 1.0)) { BDL_DEBUG.teleport(x, y); return { x, y }; }
    }
    return null;
  });
}

async function mapZero(browser, base) {
  console.log('— map 0 (cấp 1) 1280x720, hạt giống ngủ');
  const seed = seedFor(0, false);
  const { page, errors, ok } = await open(browser, base, 0, seed);
  check('vào dive, có BDL_DEBUG.foes', ok);
  if (!ok) { check('không lỗi trang', false, errors.slice(0, 3).join(' | ')); await page.close(); return; }

  const ro = await page.evaluate(() => BDL_DEBUG.foes.roster());
  check('bộ quái nhà 1: 2 loại (kẻ húc, bom con), 3 ổ', ro.kinds.join() === 'rook,banger' && ro.count === 3, JSON.stringify(ro));
  let list = await FOES(page);
  const bodies = ro.kinds.length && list.length;
  check('quái có mặt (≥ số ổ), bom con thành bầy 4', list.length >= 3 && list.some(f => f.key === 'banger' && f.pack === 4), list.length + ' con: ' + list.map(f => f.key).join(','));
  const near = list.filter(f => f.dist < 30);
  check('mọi quái cách Dave ≥ 30 m lúc đầu', near.length === 0, 'gần nhất ' + Math.min(...list.map(f => f.dist)).toFixed(1) + ' m');
  const boat = await page.evaluate(() => BDL_DEBUG.foes.stats().boat);
  check('mọi quái cách điểm xuất phát thuyền ≥ 30 m', list.every(f => Math.hypot(f.x - boat.x, f.y - boat.y) >= 30), 'boat ' + boat.x.toFixed(1) + ',' + boat.y.toFixed(1));
  const fl = await page.evaluate(() => { const G = HX.game; return G.diver.pos.y > 0 ? list0() : 0; function list0() { return 0; } });
  const lastY1 = await page.evaluate(() => HX.game.floors[HX.game.floors.length - 1].y1);
  check('mọi quái nằm trong các tầng (trên vùng áp suất)', list.every(f => f.y >= lastY1 && f.y < 20.5), 'y từ ' + Math.min(...list.map(f => f.y)).toFixed(1));
  check('lúc đầu mọi quái đang ngủ', list.every(f => f.asleep && f.state === 'sleep'), list.map(f => f.state).join(','));
  const si = await page.evaluate(() => BDL_DEBUG.foes.sleepInfo());
  check('giờ ngủ 40-60 s (cấp 1, không bỏ qua)', !si.skipped && si.total >= 40 && si.total <= 60.01 && si.left > 35, JSON.stringify(si));
  const noAllocShark = await page.evaluate(() => HX.game.fishes.allocs.filter(a => a.shark).length + HX.game.fishes.list.filter(f => f.sp.shark && !f.isFoe).length);
  check('bộ sinh cá không sinh cá mập', noAllocShark === 0, noAllocShark);

  // ảnh con ngủ có Z: đưa Dave tới cạnh một con đang ngủ
  const first = list[0];
  const tp = await page.evaluate(f => {
    const G = HX.game, W = G.world;
    for (const [dx, dy] of [[-4, 0.5], [4, 0.5], [-5, 1], [5, 1], [-3, 2], [3, -1]]) {
      const x = f.x + dx, y = f.y + dy;
      if (W.open(x, y, 0.6) && !W.raycast(x, y, f.x, f.y)) { BDL_DEBUG.teleport(x, y); return { x, y }; }
    }
    return null;
  }, first);
  await sleep(900);
  await shot(page, 'foe-sleeping-z');
  const stillAsleep = (await FOES(page)).filter(f => f.id === first.id)[0];
  check('đứng cạnh con ngủ (không ồn) nó vẫn ngủ', !!tp && stillAsleep.asleep, tp ? '' : 'không có chỗ');

  // tiếng động: con gần thức, con xa vẫn ngủ
  list = await FOES(page);
  const far = list.filter(f => f.id !== first.id).sort((a, b) => Math.hypot(b.x - first.x, b.y - first.y) - Math.hypot(a.x - first.x, a.y - first.y))[0];
  const heard = await page.evaluate(f => BDL.noise(f.x, f.y, 3, 1), first);
  await sleep(200);
  list = await FOES(page);
  const a1 = list.find(f => f.id === first.id), a2 = list.find(f => f.id === far.id);
  check('tiếng động bán kính 3 m đánh thức con ở đó', heard >= 1 && !a1.asleep && a1.wokeBy === 'noise', JSON.stringify({ heard, asleep: a1.asleep, by: a1.wokeBy }));
  check('con ở xa vẫn ngủ', a2.asleep, 'cách ' + Math.hypot(far.x - first.x, far.y - first.y).toFixed(0) + ' m');

  // đòn của quái không quá 72% O₂ tối đa khi đầy
  await page.evaluate(() => { HX.game.diver.o2 = 100; HX.game.diver.invuln = 0; });
  const capO2 = await page.evaluate(() => { BDL_DEBUG.hurt(500); return HX.game.diver.o2; });
  check('một đòn tối đa 72% O₂ khi còn đầy', capO2 >= 27.9 && capO2 < 100, 'O₂ còn ' + capO2.toFixed(1));

  // hết giờ ngủ thì cả lượt thức
  const left = await page.evaluate(() => BDL_DEBUG.foes.sleepLeft());
  await page.evaluate(s => BDL_DEBUG.foes.advance(s + 1), left);
  await sleep(300);
  list = await FOES(page);
  check('hết giờ ngủ: mọi quái tỉnh', list.every(f => !f.asleep), list.map(f => f.asleep ? 'Z' : 'o').join(''));

  // dọn quái tự nhiên để chạy kịch bản riêng
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());

  // ---- kẻ húc: báo trước rồi lao ----
  console.log('· kịch bản riêng');
  const dv = await openWaterDave(page);
  check('có chỗ nước thoáng để chạy kịch bản', !!dv, dv ? dv.x + ',' + dv.y : '');
  await page.evaluate(() => { HX.game.diver.o2 = 100; HX.game.diver.invuln = 0; });
  await sleep(1200);
  let sp = await clearSpot(page, 6);
  const rid = await page.evaluate(p => BDL_DEBUG.foes.spawn('rook', p.x, p.y, { alert: true })[0], sp);
  const modes = new Set();
  let telegraphShot = false, chargeShot = false, o2end = 100;
  for (let i = 0; i < 90; i++) {
    await sleep(100);
    const f = await page.evaluate(id => BDL_DEBUG.foes.get(id), rid);
    if (!f) break;
    modes.add(f.mode);
    if (f.mode === 'telegraph' && !telegraphShot && i > 3) { telegraphShot = true; await shot(page, 'foe-rook-telegraph'); }
    if (f.mode === 'charge' && !chargeShot) { chargeShot = true; await shot(page, 'foe-rook-charge'); }
    o2end = await page.evaluate(() => HX.game.diver.o2);
    if (f.hitDave) break;
  }
  check('kẻ húc: báo trước rồi lao', modes.has('telegraph') && modes.has('charge'), [...modes].join('>'));
  check('kẻ húc lao trúng: O₂ Dave tụt', o2end < 100, 'O₂ ' + o2end.toFixed(1));
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());

  // ---- kẻ húc đâm đá thì choáng ----
  const stun = await page.evaluate(() => {
    const G = HX.game, W = G.world, d = G.diver.pos;
    for (let a = 0; a < 360; a += 15) {
      const ang = a * Math.PI / 180, dx = Math.cos(ang), dy = Math.sin(ang);
      for (const [px, py] of [[d.x, d.y + 1], [d.x - 6, d.y + 1], [d.x + 6, d.y + 1], [d.x, d.y + 3], [d.x, d.y - 2]]) {
        if (!W.open(px, py, 1.0)) continue;
        const h = W.raycast(px, py, px + dx * 7, py + dy * 7);
        if (!h || h.t < 0.35 || h.t > 0.8) continue;
        if ((px - d.x) * dx + (py - d.y) * dy > -1 && Math.hypot(px + dx * 7 * h.t - d.x, py + dy * 7 * h.t - d.y) < 3) continue;
        const id = BDL_DEBUG.foes.spawn('rook', px, py, {})[0];
        BDL_DEBUG.foes.charge(id, dx, dy);
        return { id, px, py, dx, dy };
      }
    }
    return null;
  });
  let stunned = null;
  if (stun) for (let i = 0; i < 40 && !(stunned && stunned.stunned); i++) { await sleep(100); stunned = await page.evaluate(id => BDL_DEBUG.foes.get(id), stun.id); }
  check('kẻ húc đâm đá thì choáng (mode stun, 6 s)', !!stunned && stunned.stunned >= 1 && stunned.mode === 'stun', stun ? JSON.stringify({ stunned: stunned && stunned.stunned, mode: stunned && stunned.mode }) : 'không tìm được vách');
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());

  // ---- kẻ bắn ----
  await page.evaluate(() => { HX.game.diver.o2 = 100; HX.game.diver.invuln = 0; });
  sp = await clearSpot(page, 7);
  const gid = await page.evaluate(p => BDL_DEBUG.foes.spawn('gunner', p.x, p.y, { alert: true })[0], sp);
  let gshot = false, g = null;
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    const st = await page.evaluate(() => BDL_DEBUG.foes.stats().shots);
    if (st > 0 && !gshot) { gshot = true; await sleep(120); await shot(page, 'foe-gunner-shot'); }
    g = await page.evaluate(id => BDL_DEBUG.foes.get(id), gid);
    const o2 = await page.evaluate(() => HX.game.diver.o2);
    if (g.shots >= 1 && o2 < 100 && gshot) break;
  }
  const o2g = await page.evaluate(() => HX.game.diver.o2);
  check('kẻ bắn bắn gai', gshot && g.shots >= 1, 'shots=' + g.shots);
  check('gai trúng Dave: O₂ tụt ~22', o2g < 100 && o2g > 100 - 30, 'O₂ ' + o2g.toFixed(1));
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());

  // ---- bom con ----
  await page.evaluate(() => { HX.game.diver.o2 = 100; HX.game.diver.invuln = 0; });
  sp = await clearSpot(page, 5);
  const bids = await page.evaluate(p => BDL_DEBUG.foes.spawn('banger', p.x, p.y, { alert: true }), sp);
  check('bom con sinh thành bầy 4', bids.length === 4);
  let exploded = 0;
  for (let i = 0; i < 100 && !exploded; i++) {
    await sleep(100);
    const l = await FOES(page);
    exploded = l.filter(f => f.key === 'banger' && f.exploded).length || (await FOES(page)).filter(f => f.exploded).length;
    const all = await page.evaluate(ids => ids.map(id => BDL_DEBUG.foes.get(id)), bids);
    exploded = all.filter(f => f && f.exploded).length;
  }
  await sleep(200);
  const o2b = await page.evaluate(() => HX.game.diver.o2);
  check('bom con nổ sau ngòi', exploded >= 1, exploded + ' con nổ');
  check('vụ nổ làm Dave đau', o2b < 100, 'O₂ ' + o2b.toFixed(1));
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());

  // ---- lũ rỉa cắn món đồ đang kéo ----
  await page.evaluate(() => { HX.game.diver.o2 = 100; HX.game.diver.invuln = 0; });
  sp = await clearSpot(page, 4);
  const gn = await page.evaluate(p => {
    const d = HX.game.diver.pos, hits = [];
    window.__stub = { pos: { x: d.x + (p.x > d.x ? 1 : -1), y: d.y }, vel: { x: 0, y: 0 }, mass: 5, tethered: true, hit: function (n) { hits.push(n); } };
    window.__stubHits = hits;
    window.__tetherOrig = BDL.tether && BDL.tether.target;
    BDL.tether = BDL.tether || {};
    BDL.tether.target = () => window.__stub;
    return BDL_DEBUG.foes.spawn('gnome', p.x, p.y, { alert: true });
  }, sp);
  check('lũ rỉa sinh thành bầy 3', gn.length === 3);
  let bites = 0;
  for (let i = 0; i < 60 && bites < 2; i++) { await sleep(100); bites = await page.evaluate(() => window.__stubHits.length); }
  const gl = await page.evaluate(ids => ids.map(id => BDL_DEBUG.foes.get(id)), gn);
  const daveBites = gl.reduce((s, f) => s + f.daveBites, 0);
  const o2n = await page.evaluate(() => HX.game.diver.o2);
  check('lũ rỉa cắn món đồ (target.hit được gọi)', bites >= 1, bites + ' lần, sát thương lần đầu ' + (await page.evaluate(() => window.__stubHits[0])));
  check('lũ rỉa cắn đồ nhiều hơn cắn Dave', bites > daveBites && o2n === 100, 'đồ ' + bites + ' / Dave ' + daveBites);

  // ---- kẻ cướp giật đồ ----
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());
  sp = await clearSpot(page, 4);
  const br = await page.evaluate(p => {
    const d = HX.game.diver.pos;
    window.__released = 0;
    window.__stub2 = { pos: { x: d.x + (p.x > d.x ? 1 : -1) * 1.5, y: d.y }, vel: { x: 0, y: 0 }, mass: 5, tethered: true, hit() {} };
    BDL.tether.target = () => window.__released ? null : window.__stub2;
    BDL.tether.release = () => { window.__released++; };
    return BDL_DEBUG.foes.spawn('brat', p.x, p.y, { alert: true })[0];
  }, sp);
  let bg = null;
  for (let i = 0; i < 80; i++) { await sleep(100); bg = await page.evaluate(id => BDL_DEBUG.foes.get(id), br); if (bg && bg.grabs) break; }
  const moved = await page.evaluate(() => Math.hypot(window.__stub2.pos.x - HX.game.diver.pos.x, window.__stub2.pos.y - HX.game.diver.pos.y));
  await sleep(1500);
  const moved2 = await page.evaluate(() => Math.hypot(window.__stub2.pos.x - HX.game.diver.pos.x, window.__stub2.pos.y - HX.game.diver.pos.y));
  check('kẻ cướp giật đồ: BDL.tether.release() được gọi và mang đồ đi', bg && bg.grabs >= 1 && (await page.evaluate(() => window.__released)) >= 1 && moved2 > moved, 'cách Dave ' + moved.toFixed(1) + ' → ' + moved2.toFixed(1) + ' m');
  await page.evaluate(() => { BDL.tether.target = window.__tetherOrig || (() => null); BDL_DEBUG.foes.clearAll(); });

  // ---- sứa ma: miễn sát thương ----
  sp = await clearSpot(page, 5);
  const gh = await page.evaluate(p => BDL_DEBUG.foes.spawn('ghost', p.x, p.y, {})[0], sp);
  const ghr = await page.evaluate(id => {
    const f = HX.game.fishes.list.find(x => x.foe && x.foe.id === id), hp0 = f.hp;
    const r = f.damage(500, f.pos.x - 1, f.pos.y, true);
    return { r, hp0, hp1: f.hp, state: f.state };
  }, gh);
  check('sứa ma miễn sát thương thường', ghr.r === 'alive' && ghr.hp1 === ghr.hp0 && ghr.state !== 'dying', JSON.stringify(ghr));
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());

  // ---- cá mập săn: chết để xác có giá ----
  sp = await clearSpot(page, 8);
  const cid = await page.evaluate(p => BDL_DEBUG.foes.spawn('chaser', p.x, p.y, {})[0], sp);
  await sleep(600);
  await page.evaluate(() => { HX.game.diver.o2 = 100; });
  const killed = await page.evaluate(() => BDL_DEBUG.foes.killNearest('chaser'));
  await sleep(300);
  const c1 = await page.evaluate(id => {
    const v = BDL_DEBUG.foes.get(id), f = HX.game.fishes.list.find(x => x.foe && x.foe.id === id);
    return { v, item: f && f.deckItem(), expect: BDL.run.price('foe', BDL.foeValue(v.hpMax, v.dmg)) };
  }, cid);
  check('giết cá mập săn: để lại xác có giá', killed === cid && c1.v.dead && c1.v.corpse && c1.item.kind === 'foe' && c1.item.key === 'chaser' && c1.item.value === c1.expect && c1.item.value > 0,
    'giá ' + c1.item.value + ' (giá gốc REPO qua quỹ map ' + c1.expect + ')');
  const rs = await page.evaluate(() => BDL_DEBUG.foes.respawns());
  check('con vừa chết xếp hàng hồi sinh sau ~45 s', rs.length === 1 && rs[0].key === 'chaser' && rs[0].in > 40 && rs[0].in <= 45, JSON.stringify(rs));

  // ---- hồi sinh sau 45 s (chạy nhanh) ----
  await page.evaluate(() => BDL_DEBUG.foes.advance(46));
  await sleep(400);
  const rl = await FOES(page);
  const back = rl.filter(f => f.key === 'chaser' && !f.dead);
  check('sau 45 s quái hồi sinh', back.length === 1, back.length + ' con còn sống');
  check('chỗ hồi sinh xa Dave (≥ 16 m, thường ≥ 30)', back.length === 1 && back[0].dist >= 16, back.length ? back[0].dist.toFixed(1) + ' m' : '');
  check('không còn hàng đợi hồi sinh', (await page.evaluate(() => BDL_DEBUG.foes.respawns())).length === 0);

  // ---- trần bán 3 lần ----
  const cap = await page.evaluate(() => {
    const out = {};
    const f0 = HX.game.fishes.list.find(x => x.foe && x.foe.key === 'chaser' && x.foe.corpse);
    const item = f0 ? f0.deckItem() : { kind: 'foe', key: 'chaser', label: 'Xác cá mập săn', value: 1000, icon: '' };
    out.before = BDL.run.sellable('chaser');
    for (let i = 0; i < 3; i++) BDL.run.deliver(Object.assign({}, item));
    out.after = BDL.run.sellable('chaser');
    out.sold = BDL.run.dive.sold.chaser;
    return out;
  });
  check('bán 3 xác cùng loại → loại đó hết được bán', cap.before && !cap.after && cap.sold === 3, JSON.stringify(cap));
  await sleep(300);
  const old = (await FOES(page)).find(f => f.id === cid);
  check('xác cũ chưa kịp bán thì tan mất khi đã đủ trần', !old || !old.corpse, old ? JSON.stringify({ corpse: old.corpse, state: old.state }) : 'đã dọn');
  const live = (await FOES(page)).find(f => f.key === 'chaser' && !f.dead);
  await page.evaluate(() => BDL_DEBUG.foes.killNearest('chaser'));
  await sleep(400);
  const fourth = await page.evaluate(id => BDL_DEBUG.foes.get(id), live.id);
  check('lần thứ 4 giết cùng loại: mất xác (tan, không có xác)', fourth && fourth.dead && !fourth.corpse && fourth.dissolvedByCap && (fourth.state === 'reeled'), JSON.stringify({ dead: fourth && fourth.dead, corpse: fourth && fourth.corpse, state: fourth && fourth.state }));
  const rs2 = await page.evaluate(() => BDL_DEBUG.foes.respawns());
  check('con mất xác vẫn hồi sinh (không phải bầy)', rs2.some(r => r.key === 'chaser'));

  // bầy không bao giờ hồi sinh, không để xác
  await page.evaluate(() => { BDL_DEBUG.foes.clearAll(); });
  sp = await clearSpot(page, 5);
  await page.evaluate(p => { BDL_DEBUG.foes.spawn('banger', p.x, p.y, {}); for (let i = 0; i < 4; i++) BDL_DEBUG.foes.killNearest('banger'); }, sp);
  await sleep(300);
  const pk = await page.evaluate(() => ({ r: BDL_DEBUG.foes.respawns().filter(x => x.key === 'banger').length, l: BDL_DEBUG.foes.list().filter(f => f.key === 'banger' && f.corpse).length }));
  check('bầy bom con chết: không xác, không hồi sinh', pk.r === 0 && pk.l === 0, JSON.stringify(pk));

  const errs = await page.evaluate(() => BDL_DEBUG.info().errors);
  check('không lỗi trang / console / HTTP / G.errors (map 0)', errors.length === 0 && errs.length === 0, errors.concat(errs).slice(0, 3).join(' | '));
  await page.close();
}

async function skipRoll(browser, base) {
  console.log('— map 0, hạt giống bỏ qua ngủ (20%)');
  const seed = seedFor(0, true);
  const { page, errors, ok } = await open(browser, base, 0, seed);
  check('vào dive', ok);
  if (!ok) { await page.close(); return; }
  const list = await FOES(page), si = await page.evaluate(() => BDL_DEBUG.foes.sleepInfo());
  check('lượt bỏ qua ngủ: mọi quái thức ngay', si.skipped && list.length >= 3 && list.every(f => !f.asleep), JSON.stringify(si));
  check('vẫn cách Dave ≥ 30 m', list.every(f => f.dist >= 30), Math.min(...list.map(f => f.dist)).toFixed(1));
  check('không lỗi trang', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

async function roaming(browser, base) {
  console.log('— map 0, lượt bỏ qua ngủ: quái đi lang thang khắp map, nghe tiếng thì tới xem');
  const { page, errors, ok } = await open(browser, base, 0, seedFor(0, true));
  check('vào dive', ok);
  if (!ok) { await page.close(); return; }
  const start = await FOES(page);
  const seen = {}, rock = [];
  start.forEach(f => { seen[f.id] = { x0: f.x, y0: f.y, maxD: 0, floors: new Set(), kinds: new Set() }; });
  for (let i = 0; i < 80; i++) {
    const snap = await page.evaluate(() => {
      BDL_DEBUG.foes.tick(0.5);
      const G = HX.game; G.diver.o2 = 100; G.diver.invuln = 0;
      return BDL_DEBUG.foes.list().map(f => ({ id: f.id, x: f.x, y: f.y, mode: f.mode, aware: f.aware, roam: f.roam, dead: f.dead, open: G.world.open(f.x, f.y, 0.2), floor: BDL.floorAt(f.y, G.floors), key: f.key }));
    });
    for (const f of snap) {
      const r = seen[f.id]; if (!r || f.dead) continue;
      r.maxD = Math.max(r.maxD, Math.hypot(f.x - r.x0, f.y - r.y0));
      r.floors.add(f.floor); if (f.roam) r.kinds.add(f.roam);
      if (!f.aware && f.mode === 'patrol' && !f.open && f.key !== 'ghost') rock.push(f.key + '@' + f.x.toFixed(1) + ',' + f.y.toFixed(1));
    }
  }
  const rs = Object.values(seen);
  const movers = rs.filter(r => r.maxD > 20), multi = rs.filter(r => r.floors.size >= 2);
  console.log('    ' + start.map(f => f.key + ' ' + seen[f.id].maxD.toFixed(0) + ' m, tầng ' + [...seen[f.id].floors].join('/')).join(' · '));
  check('40 s: ≥ 2 quái đi xa > 20 m khỏi chỗ sinh', movers.length >= 2, movers.length + '/' + rs.length);
  check('40 s: ≥ 2 quái ghé ≥ 2 tầng khác nhau', multi.length >= 2, multi.length + '/' + rs.length);
  check('quái đi lang thang không đứng trong đá', rock.length === 0, rock.slice(0, 3).join(' '));

  // tiếng động tại chỗ Dave: quái tàng hình-Dave (không thấy) vẫn tới trong 12 m
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());
  const dv = await openWaterDave(page);
  // đặt một kẻ húc xa Dave ≥ 40 m ở nước thông (lấy vị trí con vừa dọn)
  const far = start.map(f => ({ x: f.x, y: f.y, d: Math.hypot(f.x - dv.x, f.y - dv.y), key: f.key })).sort((a, b) => b.d - a.d)[0];
  const id = await page.evaluate(p => { BDL_DEBUG.foes.spawn('rook', p.x, p.y, {}); return BDL_DEBUG.foes.list()[0].id; }, far);
  const before = await page.evaluate(i => BDL_DEBUG.foes.get(i), id);
  await page.evaluate(() => { BDL.foes.blind(500); const d = HX.game.diver.pos; BDL.noise(d.x, d.y, 400, 1); });
  let arrived = null, t = 0;
  for (let i = 0; i < 160 && !arrived; i++) {
    const r = await page.evaluate(i => { BDL_DEBUG.foes.tick(1); const f = BDL_DEBUG.foes.get(i), d = HX.game.diver.pos; return f && { dist: Math.hypot(f.x - d.x, f.y - d.y), mode: f.mode, aware: f.aware }; }, id);
    t++;
    if (r && r.dist < 12) arrived = r;
  }
  check('nghe tiếng động ở chỗ Dave: quái tới trong 12 m', !!arrived, before.dist.toFixed(0) + ' m lúc đầu, ' + (arrived ? 'tới sau ' + t + ' s' : 'không tới'));
  check('không lỗi trang (đi lang thang)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

async function mapFour(browser, base) {
  console.log('— map 4 (cấp 15) 1280x720');
  const { page, errors, ok } = await open(browser, base, 4, seedFor(4, false));
  check('vào dive', ok);
  if (!ok) { check('không lỗi trang', false, errors.slice(0, 3).join(' | ')); await page.close(); return; }
  const ro = await page.evaluate(() => BDL_DEBUG.foes.roster());
  check('bộ quái nhà 5: 6 loại, 11 ổ, hp ×1,5', ro.kinds.length === 6 && ro.count === 11 && Math.abs(ro.hpMul - 1.5) < 1e-9, JSON.stringify(ro));
  check('sát thương × map × (1+0,05×14) = 1,35 × 1,7', Math.abs(ro.dmgMul - 1.35 * 1.7) < 1e-9, ro.dmgMul);
  const list = await FOES(page), si = await page.evaluate(() => BDL_DEBUG.foes.sleepInfo());
  check('cấp ≥ 11: không ngủ, quái thức từ đầu', si.total === 0 && list.length >= 11 && list.every(f => !f.asleep), JSON.stringify(si) + ' · ' + list.length + ' con');
  check('mọi quái cách Dave ≥ 28 m (thức từ đầu nên đã bơi ~2,5 s)', list.every(f => f.dist >= 28), Math.min(...list.map(f => f.dist)).toFixed(1));
  const kinds = new Set(list.map(f => f.key));
  check('đủ loại của nhà 5 (không có bom con)', ['rook', 'chaser', 'gunner', 'gnome', 'brat', 'ghost'].every(k => kinds.has(k)) && !kinds.has('banger'), [...kinds].join());
  const lastY1 = await page.evaluate(() => HX.game.floors[HX.game.floors.length - 1].y1);
  check('quái trong các tầng', list.every(f => f.y >= lastY1), 'y min ' + Math.min(...list.map(f => f.y)).toFixed(1));
  const avgY = k => { const l = list.filter(f => f.key === k); return l.reduce((s, f) => s + f.y, 0) / (l.length || 1); };
  console.log('    độ cao trung bình: rook ' + avgY('rook').toFixed(0) + ', ghost ' + avgY('ghost').toFixed(0) + ', brat ' + avgY('brat').toFixed(0));
  // cá mập săn thật sự đuổi: đặt gần Dave rồi cho cắn
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());
  await sleep(1000);
  const dv = await openWaterDave(page);
  await page.evaluate(() => { HX.game.diver.o2 = 100; HX.game.diver.invuln = 0; });
  const sp = await clearSpot(page, 7);
  const cid = await page.evaluate(p => BDL_DEBUG.foes.spawn('chaser', p.x, p.y, { alert: true })[0], sp);
  let bit = false;
  for (let i = 0; i < 120 && !bit; i++) { await sleep(100); bit = (await page.evaluate(() => HX.game.diver.o2)) < 100; }
  check('cá mập săn đuổi và cắn (AI gốc): O₂ tụt', bit, 'O₂ ' + (await page.evaluate(() => HX.game.diver.o2)).toFixed(1));
  check('không lỗi trang (map 4)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await mapZero(browser, base);
    await skipRoll(browser, base);
    await roaming(browser, base);
    await mapFour(browser, base);
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
