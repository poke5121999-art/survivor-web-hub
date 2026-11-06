/*
 * Thế Giới Slime (games/world-of-slime) pha F3: bắt slime + đội + túi + kho + bách khoa, bằng phím/chuột/chạm thật.
 * Bản lưu dựng sẵn (v1 như sau trận Rudga: q1..q6 xong, q7 đang làm, save.duel) -> bản web đổi lên v2, tạo slime khởi đầu
 * "Roasted" (gà lửa, ?slime=SL_ElecChicken_WindFire), rồi:
 *   làng 110: Vivian bán 10 Cube + 2 Bình Thuốc 30 HP (Cube tự vào ô E, thuốc ô Q) -> tải lại vào Shadow Forest Entrance
 *   -> Space đánh Junior Floralime tới dưới nửa máu, chuột chỉ vào nó, E = ngắm, nhả = ném Cube -> lắc 1-3 lần -> bắt được (thử lại tới khi được)
 *   -> hỏi biệt danh -> "Mochi" -> ô 2 thanh đội, bách khoa (B) "Tame"; phím 2 đổi sang Mochi (thẻ tên), phím 1 lúc đang hồi = báo hồi
 *   -> Q dùng thuốc (HP + 30) -> I túi (Bag n/28) -> tải lại vào kho 478: Allen "Kho Slime" -> Cất Giữ Mochi -> Lấy Ra
 *   -> tải lại: đội, biệt danh, bách khoa, số đồ còn nguyên -> mobile.html: kéo nút Cube về phía slime rồi thả = ném.
 * Kiểm: không lỗi trang/console/HTTP >= 400. Ảnh: D:\wos-ref\proof\tame\web\ (so với khung clip bằng skill parity-compare).
 *
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   node test/world-of-slime-tame.js
 * Trên Pages: WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-tame.js
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/tame/web' : process.env.WOS_SHOTS;
const Q = s => '?intro=0&seed=11&slime=SL_ElecChicken_WindFire' + (ASSETS ? '&assets=' + encodeURIComponent(ASSETS) : '') + s;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };

// bản lưu v1 (trước F3) như world-of-slime-combat.js sau trận Rudga
const PRESET = { v: 1, quests: { q1: { s: 'done', c: {} }, q2: { s: 'done', c: {} }, q3: { s: 'done', c: { heal: 1 } }, q4: { s: 'done', c: { herb: 1 } },
  q5: { s: 'done', c: { perk: 1 } }, q6: { s: 'done', c: {} }, q7: { s: 'active', c: {} } }, gold: 9911, exp: 10, level: 2, sp: 0, duel: true,
  perks: { companion1: 1 }, items: {}, boxes: ['box_vivian'], slime: { hp: 1, mp: 1, st: 1 }, seen: {} };

const st = page => page.evaluate(() => {
  const E = WOS.quest, sv = E.save, R = WOS.roster;
  const nm = document.querySelector('[data-hud="monsterHud"]');
  return { map: String(WOS.map.data.id), modal: WOS.state.modal, v: sv.v, gold: sv.gold, items: { ...sv.items }, quick: sv.quick.slice(),
    party: R.partyRecs().map(r => ({ uid: r.uid, typeId: r.typeId, nick: r.nickname, lv: r.level, hp: +r.hp.toFixed(3) })), storage: R.storageRecs().map(r => r.nickname || r.typeId),
    active: R.active() && R.active().uid, equipped: WOS.state.equipped, dex: { ...sv.dex }, slimeModel: WOS.slime.variant && WOS.slime.variant.id,
    tag: nm ? nm.innerText.trim() : '', slots: [...document.querySelectorAll('[data-hud^="slimeSlot"]')].filter(e => !e.hidden).map(e => e.dataset.name),
    toast: (document.querySelector('[data-hud="toast"]') || {}).hidden === false ? document.querySelector('[data-hud="toast"]').innerText : '',
    errors: WOS.errors.slice() };
});
const evs = page => page.evaluate(() => WOS.quest.events.map(e => e.kind + (e.result != null ? ':' + e.result : '') + (e.n != null ? ':' + e.n : '')));

// BFS trên ô 0.5 m (như world-of-slime-combat.js)
const plan = (page, tx, tz, near = 0.6, minD = 0) => page.evaluate(([tx, tz, near, minD]) => {
  const m = WOS.map, k = 2, W = m.width * k, H = m.height * k;
  const id = (x, z) => x + z * W, sx = Math.floor(WOS.P.x * k), sz = Math.floor(WOS.P.z * k);
  const prev = new Int32Array(W * H).fill(-1), q = [id(sx, sz)]; prev[q[0]] = q[0];
  const ok = (x, z, fx, fz) => x >= 0 && z >= 0 && x < W && z < H && m.canStand((x + 0.5) / k, (z + 0.5) / k, m.getHeight((fx + 0.5) / k, (fz + 0.5) / k))
    && [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([a, b]) => m.canStand((x + 0.5) / k + a, (z + 0.5) / k + b));
  let best = -1, bd = Infinity;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, z = (c / W) | 0;
    const d = Math.hypot((x + 0.5) / k - tx, (z + 0.5) / k - tz);
    if (d >= minD && d <= near && d < bd) { bd = d; best = c; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = id(x + dx, z + dz);
      if (prev[n] < 0 && ok(x + dx, z + dz, x, z) && (dx === 0 || dz === 0 || (ok(x + dx, z, x, z) && ok(x, z + dz, x, z)))) { prev[n] = c; q.push(n); }
    }
  }
  if (best < 0) return null;
  const path = []; for (let c = best; c !== id(sx, sz); c = prev[c]) path.push([(c % W + 0.5) / k, (((c / W) | 0) + 0.5) / k]);
  path.reverse();
  return path.filter((p, i) => i % 3 === 2 || i === path.length - 1);
}, [tx, tz, near, minD]);
async function walk(page, pts, { timeout = 40000 } = {}) {
  const k = page.keyboard, held = new Set(), t0 = Date.now();
  const hold = want => { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { if (want.includes(c) && !held.has(c)) { held.add(c); k.down(c); } else if (!want.includes(c) && held.has(c)) { held.delete(c); k.up(c); } } };
  let i = 0;
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(() => ({ x: WOS.P.x, z: WOS.P.z, modal: WOS.state.modal }));
    if (s.modal) break;
    while (i < pts.length - 1 && Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z) < 0.45) i++;
    const [tx, tz] = pts[i], dx = tx - s.x, dz = tz - s.z;
    if (i === pts.length - 1 && Math.hypot(dx, dz) < 0.4) break;
    const want = []; const e = 0.15;
    if (dx > e) want.push('KeyD'); else if (dx < -e) want.push('KeyA');
    if (dz > e) want.push('KeyW'); else if (dz < -e) want.push('KeyS');
    hold(want); await wait(page, 40);
  }
  hold([]);
}
async function until(page, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await wait(page, 100); }
  return false;
}
async function converse(page, picks = [], max = 40) {
  const seen = [];
  for (let n = 0; n < max; n++) {
    const d = await page.evaluate(() => { const s = WOS.story.dlg; if (!s || !s.D.root.isConnected) return null; return { id: s.id, typing: !!s.timer, choices: s.choices ? s.choices.length : 0 }; });
    if (!d) return seen;
    if (!seen.length || seen[seen.length - 1] !== d.id) seen.push(d.id);
    if (d.typing) { await page.keyboard.press('Space'); await wait(page, 90); continue; }
    if (d.choices) { const k = picks.length ? picks.shift() : 0; for (let i = 0; i < k; i++) { await page.keyboard.press('ArrowDown'); await wait(page, 40); } await page.keyboard.press('Space'); await wait(page, 160); continue; }
    await page.keyboard.press('Space'); await wait(page, 140);
  }
  return seen;
}
// toạ độ màn hình của một slime hoang (chiếu bằng camera của game)
const screenOf = (page, id) => page.evaluate(id => {
  const m = WOS.combat.mons.find(x => x.def.id === id); if (!m) return null;
  const v = new WOS.THREE.Vector3(-m.x, m.y + 0.3, m.z).project(WOS.camera.cam);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, hp: m.hp, maxHp: m.maxHp, dead: m.dead, trapped: !!m.trapped, d: Math.hypot(m.x - WOS.P.x, m.z - WOS.P.z) };
}, id);
const nearestFlo = page => page.evaluate(() => {
  let b = null, bd = Infinity;
  for (const m of WOS.combat.mons) { if (m.dead || m.trapped || m.def.model !== 'SL_Slime_Grass') continue; const d = Math.hypot(m.x - WOS.P.x, m.z - WOS.P.z); if (d < bd) { bd = d; b = { id: m.def.id, x: m.x, z: m.z, d }; } }
  return b;
});
async function buy(page, idx, n) {   // ô idx của quầy, mua n cái bằng chuột
  const cells = await page.$$('[data-hud="shopCell"]'); await cells[idx].click(); await wait(page, 200);
  await page.click('[data-hud="shopBuy"]'); await wait(page, 350);
  for (let i = 1; i < n; i++) { await page.click('[data-hud="buyPlus"]'); await wait(page, 60); }
  await page.click('[data-hud="buyOk"]'); await wait(page, 350);
  await page.click('[data-hud="popupBtn"][data-v="true"]'); await wait(page, 350);
}

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const kill = setTimeout(() => { console.log('timeout: tắt trình duyệt'); browser.close(); process.exit(2); }, 480000);
  const problems = [];
  const watch = page => {
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
    page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ' ' + r.url()); });
  };
  const ready = page => page.waitForFunction(() => window.__ready && WOS.npcs !== undefined, null, { timeout: 120000 });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(p => { if (!sessionStorage.getItem('wosPreset')) { sessionStorage.setItem('wosPreset', '1'); localStorage.setItem('wos.save', p); } }, JSON.stringify(PRESET));
    const page = await ctx.newPage(); watch(page);

    console.log('Làng 110: bản lưu v1 -> v2, slime khởi đầu, mua Cube + thuốc ở Vivian');
    await page.goto(BASE + 'index.html' + Q('&map=110&at=33.4,69.2'));
    await ready(page); await until(page, () => WOS.npcs.length > 0, null, 20000); await wait(page, 1200);
    let s = await st(page);
    check('bản lưu v1 đổi lên v2: một slime khởi đầu gà lửa, biệt danh "Roasted"', s.v === 2 && s.party.length === 1 && s.party[0].typeId === 'SL_ElecChicken_WindFire' && s.party[0].nick === 'Roasted', JSON.stringify(s.party));
    check('thẻ tên trên đầu slime + ô đội = biệt danh (không phải id loài)', /Roasted/.test(s.tag) && s.slots[0] === 'Roasted', s.tag + ' / ' + s.slots.join(','));
    await page.keyboard.press('Space'); await until(page, () => !!WOS.story.dlg, null, 4000);
    await converse(page, [1]);   // vi1: Mua (ô 2)
    check('quầy Vivian mở', await until(page, () => WOS.state.modal === 'shop', null, 4000));
    await buy(page, 0, 10); await buy(page, 1, 2);
    await shot(page, 'shop_after');
    await page.keyboard.press('Escape'); await wait(page, 500);
    s = await st(page);
    check('mua 10 Cube + 2 thuốc: Vàng 9,911 - 6,000 = 3,911', s.items[4] === 10 && s.items[1] === 2 && s.gold === 3911, JSON.stringify(s.items) + ' ' + s.gold);
    check('ô nhanh: Q = 30 HP Potion (1), E = Cube (4)', s.quick[0] === 1 && s.quick[1] === 4 && s.quick[2] == null, JSON.stringify(s.quick));
    const qhud = await page.evaluate(() => [0, 1, 2].map(i => { const b = document.querySelector('[data-hud="item' + i + '"]'); return { item: b.dataset.item, n: b.querySelector('.itemcount').innerText.trim(), img: !b.querySelector('img.itemicon').hidden && b.querySelector('img.itemicon').complete && b.querySelector('img.itemicon').naturalWidth > 0 }; }));
    check('HUD Q/E/R: ảnh + số còn (2, 10)', qhud[0].item === '1' && qhud[0].n === '2' && qhud[1].item === '4' && qhud[1].n === '10' && qhud[0].img && qhud[1].img && !qhud[2].item, JSON.stringify(qhud));
    await shot(page, 'hud_quickslots');

    console.log('Shadow Forest Entrance: làm yếu Junior Floralime rồi ném Cube (E + chuột)');
    await page.goto(BASE + 'index.html' + Q('&map=shadow_forest_entrance'));
    await ready(page); await until(page, () => WOS.combat.mons.length >= 9, null, 20000); await wait(page, 1500);
    s = await st(page);
    check('tải lại giữ đồ + ô nhanh', s.items[4] === 10 && s.quick[1] === 4 && s.party[0].nick === 'Roasted', JSON.stringify(s.items));
    let caught = false, throws = 0, shakesSeen = [], freed = 0;
    for (let round = 0; round < 8 && !caught; round++) {
      const t = await nearestFlo(page); if (!t) break;
      if (t.d > 4.5) { const pts = await plan(page, t.x, t.z, 4.0, 2.0); if (pts && pts.length) await walk(page, pts); }
      const bat = await page.evaluate(() => WOS.state.battle);
      if (!bat) { await page.keyboard.press('Space'); await wait(page, 200); }
      // đợi máu xuống dưới 50% (đồng hành tự đánh), hoặc con khác bị nhắm
      const t0 = Date.now(); let sc = null;
      while (Date.now() - t0 < 20000) {
        const tg = await page.evaluate(() => WOS.combat.pt.target && WOS.combat.pt.target.def.id);
        sc = tg ? await screenOf(page, tg) : null;
        if (sc && !sc.dead && sc.hp / sc.maxHp < 0.5) { sc.id = tg; break; }
        if (!tg && !(await page.evaluate(() => WOS.state.battle))) { await page.keyboard.press('Space'); }
        await wait(page, 120);
      }
      if (!sc || sc.dead) continue;
      sc = await screenOf(page, sc.id);
      await page.mouse.move(sc.x, sc.y); await wait(page, 60);
      await page.keyboard.down('KeyE'); await wait(page, 220);
      const guide = await page.evaluate(() => WOS.tame.ring.visible && WOS.tame.line.visible);
      if (round === 0) { check('giữ E: hiện đường ngắm + vòng cubeGuide', guide); await shot(page, 'tame_aim'); }
      await page.keyboard.up('KeyE'); throws++;
      const hit = await until(page, () => WOS.quest.events.some(e => e.kind === 'cubeHit' && e.t > performance.now() - 4000) || WOS.quest.events.some(e => e.kind === 'cubeMiss' && e.t > performance.now() - 4000), null, 5000);
      if (round === 0) { await wait(page, 900); await shot(page, 'tame_trapped'); }
      const done = await until(page, () => !WOS.tame.busy, null, 12000);
      const last = await page.evaluate(() => { const h = WOS.quest.events.filter(e => e.kind === 'cubeHit').pop(); const sh = WOS.quest.events.filter(e => e.kind === 'cubeShake'); return { h, shakes: sh.length }; });
      if (last.h) shakesSeen.push(last.h.shakes + (last.h.result === 0 ? 'C' : 'F') + '@' + last.h.chance);
      if (last.h && last.h.result === 0 && done) caught = true; else if (last.h) freed++;
      void hit;
      if (!caught) await wait(page, 5200);   // hồi Cube 5000 ms (coolTimeMillis)
    }
    check('ném Cube trúng, lắc 1-3 lần mỗi lần', throws > 0 && shakesSeen.length > 0 && shakesSeen.every(x => /^[123][CF]/.test(x)), shakesSeen.join(' '));
    check('bắt được Junior Floralime (thử lại khi thoát)', caught, throws + ' lần ném, ' + freed + ' lần thoát');
    const ask = await until(page, () => WOS.state.modal === 'nickAsk', null, 5000);
    await wait(page, 700); await shot(page, 'tame_nickname_ask');
    const askText = ask ? await page.innerText('[data-hud="nickAskText"]') : '';
    check('hỏi biệt danh: "...đặt biệt danh cho Junior Floralime..."', ask && /Junior Floralime/.test(askText), askText);
    await page.click('[data-hud="nickYes"]'); await until(page, () => WOS.state.modal === 'nickInput', null, 3000);
    await page.fill('[data-hud="nickField"]', ''); await page.keyboard.type('Mochi'); await wait(page, 150);
    await shot(page, 'tame_nickname_input');
    await page.click('[data-hud="nickOk"]'); await wait(page, 500);
    s = await st(page);
    const mochi = s.party.find(r => r.nick === 'Mochi');
    check('Mochi vào đội ô 2, bách khoa SL_Slime_Grass = 2 (Tame), Cube còn ' + (10 - throws), mochi && s.party[1] && s.party[1].nick === 'Mochi' && s.dex.SL_Slime_Grass === 2 && s.items[4] === 10 - throws, JSON.stringify(s.party.map(r => r.nick)) + ' dex ' + s.dex.SL_Slime_Grass + ' cube ' + s.items[4]);
    check('thanh đội hiện 2 ô: Roasted, Mochi', s.slots.join(',') === 'Roasted,Mochi', s.slots.join(','));
    const tagState = await page.evaluate(() => { const r = document.querySelector('[data-hud="tameTag"]'); return r ? r.innerText.trim() : null; });
    void tagState;

    console.log('Đổi slime (2, 1), thẻ Tame trên slime hoang');
    await page.keyboard.press('Digit2'); await until(page, () => (WOS.swaps || 0) >= 1, null, 8000); await wait(page, 600);
    s = await st(page);
    check('phím 2: Mochi đồng hành (mô hình SL_Slime_Grass, thẻ tên "Mochi")', s.equipped === 1 && s.slimeModel === 'SL_Slime_Grass' && /Mochi/.test(s.tag), s.equipped + ' ' + s.slimeModel + ' ' + s.tag);
    await shot(page, 'party_bar_switch');
    await page.keyboard.press('Digit1'); await wait(page, 200);
    s = await st(page);
    check('phím 1 ngay sau đó: "Không thể đổi khi đang hồi."', s.equipped === 1 && /hồi/.test(s.toast), s.toast);
    const cdShown = await page.evaluate(() => [...document.querySelectorAll('[data-hud^="slimeSlot"]')].some(e => !e.hidden && [...e.querySelectorAll('.u')].some(x => /^\d\.\d$/.test(x.innerText.trim()) && x.offsetParent)));
    check('ô slime kia hiện đếm hồi (CoolTime)', cdShown);
    // thẻ Tame trên slime hoang cùng loài
    const t2 = await nearestFlo(page);
    if (t2 && t2.d > 4.5) { const pts = await plan(page, t2.x, t2.z, 4.0, 2.0); if (pts) await walk(page, pts); }
    await page.keyboard.press('Space');
    const tagOk = await until(page, () => { const r = document.querySelector('[data-hud="combatTarget"]'); const t = document.querySelector('[data-hud="tameTag"]'); return r && !r.hidden && t && /Bắt Được|Tame/.test(t.innerText); }, null, 5000);
    await shot(page, 'tame_target_tag');
    check('ô mục tiêu: "Junior Floralime" + thẻ "Bắt Được" (Tame)', tagOk);
    await page.keyboard.press('Space'); await wait(page, 3300);   // huýt về, đợi hết hồi đổi
    await page.keyboard.press('Digit1'); await until(page, () => (WOS.swaps || 0) >= 2, null, 8000); await wait(page, 400);
    s = await st(page);
    check('hết hồi: phím 1 về Roasted', s.equipped === 0 && s.slimeModel === 'SL_ElecChicken_WindFire' && /Roasted/.test(s.tag), s.equipped + ' ' + s.tag);

    console.log('Thuốc từ Q, túi (I), bách khoa (B)');
    await page.evaluate(() => { const r = WOS.roster.active(); r.hp = 0.25; WOS.quest.persist(); });   // dựng máu thấp để thấy thuốc hồi
    await wait(page, 400);
    const hp0 = await page.evaluate(() => Math.round(WOS.combat.hp));
    await page.keyboard.press('KeyQ'); await wait(page, 500);
    const pu = await page.evaluate(() => ({ hp: Math.round(WOS.combat.hp), max: WOS.combat.maxHp, n: WOS.quest.save.items[1], ev: WOS.quest.events.filter(e => e.kind === 'useItem').pop() }));
    check('Q: Bình Thuốc 30 HP hồi 30 HP cho Roasted, còn 1', pu.n === 1 && pu.ev && pu.ev.after === undefined && pu.hp >= Math.min(pu.max, hp0 + 29), hp0 + ' -> ' + pu.hp + '/' + pu.max + ' còn ' + pu.n);
    await shot(page, 'potion_used');
    await page.keyboard.press('KeyQ'); await wait(page, 200);
    s = await st(page);
    check('Q lần nữa trong 3 s: vật phẩm đang hồi', /hồi/.test(s.toast) && s.items[1] === 1, s.toast);
    await page.keyboard.press('KeyI'); const bagOpen = await until(page, () => WOS.state.modal === 'bag', null, 3000); await wait(page, 900);
    await shot(page, 'bag');
    const bag = await page.evaluate(() => ({ count: document.querySelector('[data-hud="bagCount"]').innerText, cells: document.querySelectorAll('[data-hud="bagCell"]').length, name: (document.querySelector('[data-hud="bagItemName"]') || {}).innerText }));
    check('I: Túi Đồ, "Bag 3/28" (Cube, thuốc, mảnh?)', bagOpen && /^\d+\/28$/.test(bag.count) && bag.cells >= 2, JSON.stringify(bag));
    await page.keyboard.press('Escape'); await wait(page, 400);
    await page.keyboard.press('KeyB'); const dexOpen = await until(page, () => WOS.state.modal === 'dex', null, 5000); await wait(page, 1500);
    const dex = await page.evaluate(() => ({ cells: document.querySelectorAll('[data-hud="dexCell"]').length, flo: (document.querySelector('[data-hud="dexCell"][data-id="SL_Slime_Grass"]') || {}).dataset, caught: document.querySelector('[data-hud="dexCaught"]').innerText, point: document.querySelector('[data-hud="dexPoint"]').innerText }));
    await shot(page, 'slimepedia');
    check('B: Bách Khoa 218 loài, Junior Floralime số 002 bậc Tame, "Slime Đã Bắt 2"', dexOpen && dex.cells === 218 && dex.flo && dex.flo.degree === '2' && /2/.test(dex.caught), JSON.stringify(dex));
    await page.click('[data-hud="dexCell"][data-id="SL_Slime_Grass"]'); await wait(page, 1500);
    const dd = await page.evaluate(() => ({ no: document.querySelector('[data-hud="dexNo"]').innerText, name: document.querySelector('[data-hud="dexName"]').innerText, img: !!document.querySelector('[data-hud="dexPortrait"] img[data-hud="slimePortrait"]') }));
    await shot(page, 'slimepedia_detail');
    check('ô chi tiết: No. 002 Junior Floralime + ảnh 3D', dd.no === '002' && dd.name === 'Junior Floralime' && dd.img, JSON.stringify(dd));
    await page.keyboard.press('Escape'); await wait(page, 400);

    console.log('Kho 478: Allen -> Kho Slime -> Cất Giữ / Lấy Ra');
    await page.goto(BASE + 'index.html' + Q('&map=478&at=32.5,37.6'));
    await ready(page); await until(page, () => WOS.npcs.length > 0, null, 20000); await wait(page, 1200);
    await page.keyboard.press('Space'); await until(page, () => !!WOS.story.dlg, null, 4000);
    const seen = await converse(page, [1]);   // al1idle: Chữa slime / Kho Slime / Kết thúc
    check('Allen: lựa chọn "Kho Slime" -> câu thoại kho -> mở kho', seen.includes('alSt') && await until(page, () => WOS.state.modal === 'storage', null, 4000), seen.join(','));
    await wait(page, 1500); await shot(page, 'storage');
    await page.click('[data-hud="storagePod"][data-name="Mochi"]'); await wait(page, 900);
    await shot(page, 'storage_detail');
    await page.click('[data-hud="storageArchive"]'); await wait(page, 500);
    s = await st(page);
    const sb = await page.innerText('[data-hud="storageBag"]');
    check('Cất Giữ Mochi: đội 1, kho 1, "Túi Đồ 1/16"', s.party.length === 1 && s.storage[0] === 'Mochi' && sb === '1/16', JSON.stringify(s.storage) + ' ' + sb);
    await page.click('[data-hud="storageCell"][data-name="Mochi"]'); await wait(page, 600);
    await shot(page, 'storage_take');
    await page.click('[data-hud="storageTake"]'); await wait(page, 500);
    s = await st(page);
    check('Lấy Ra: Mochi về đội ô 2, kho trống', s.party.length === 2 && s.party[1].nick === 'Mochi' && s.storage.length === 0, JSON.stringify(s.party.map(r => r.nick)));
    await page.click('[data-hud="storagePod"][data-name="Roasted"]'); await wait(page, 300);
    await page.click('[data-hud="storageArchive"]'); await wait(page, 300);
    s = await st(page);
    check('cất slime đang đồng hành: "Không thể dùng slime đồng hành."', s.party.length === 2 && /đồng hành/.test(s.toast), s.toast);
    await page.keyboard.press('Escape'); await wait(page, 400);

    console.log('Tải lại: giữ hết');
    await page.reload(); await ready(page); await wait(page, 1500);
    s = await st(page);
    check('sau tải lại: Roasted + Mochi, bách khoa, Cube ' + (10 - throws) + ', thuốc 1, ô nhanh', s.party.map(r => r.nick).join(',') === 'Roasted,Mochi' && s.dex.SL_Slime_Grass === 2 && s.items[4] === 10 - throws && s.items[1] === 1 && s.quick[0] === 1 && s.quick[1] === 4, JSON.stringify({ p: s.party.map(r => r.nick), items: s.items, quick: s.quick }));
    check('nút Bách khoa hiện trên HUD sau khi bắt', await page.evaluate(() => !document.querySelector('[data-hud="menuIndex"]').hidden));
    const errs = s.errors.filter(e => !/AudioContext/.test(e));
    check('không lỗi trong WOS.errors (PC)', !errs.length, errs.join(' | '));
    await ctx.close();

    console.log('mobile.html: kéo nút Cube về phía slime rồi thả');
    const mctx = await browser.newContext({ viewport: { width: 1280, height: 590 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const saved = await (async () => { const c2 = await browser.newContext(); const p2 = await c2.newPage(); void p2; await c2.close(); return null; })(); void saved;
    await mctx.addInitScript(p => { if (!sessionStorage.getItem('wosPreset')) { sessionStorage.setItem('wosPreset', '1'); localStorage.setItem('wos.save', p); } }, JSON.stringify({ ...PRESET, items: { 4: 5 } }));
    const mp = await mctx.newPage(); watch(mp);
    await mp.goto(BASE + 'mobile.html' + Q('&map=shadow_forest_entrance&at=72,33'));   // mobile không có WASD: đứng sẵn cạnh flo6
    await ready(mp); await until(mp, () => WOS.combat.mons.length >= 9, null, 20000); await wait(mp, 1500);
    const mq = await mp.evaluate(() => WOS.quest.save.quick.slice());
    check('mobile: Cube tự vào ô E', mq[1] === 4, JSON.stringify(mq));
    const mt2 = await nearestFlo(mp), msc = await screenOf(mp, mt2.id);
    const btn = await mp.evaluate(() => { const r = document.querySelector('[data-hud="item1"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const pl = await mp.evaluate(() => { const v = new WOS.THREE.Vector3(-WOS.P.x, WOS.P.y, WOS.P.z).project(WOS.camera.cam); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
    // kéo theo hướng người chơi -> slime trên màn hình, độ dài tỉ lệ khoảng cách (150 đơn vị canvas = 6 m)
    const dx = msc.x - pl.x, dy = msc.y - pl.y, dl = Math.hypot(dx, dy) || 1, s0 = await mp.evaluate(() => WOS.hud.s);
    const len = Math.min(1, mt2.d / 6) * 150 * s0;
    const cdp = await mp.context().newCDPSession(mp);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
    await touch('touchStart', btn.x, btn.y); await wait(mp, 80);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', btn.x + dx / dl * len * k / 6, btn.y + dy / dl * len * k / 6); await wait(mp, 40); }
    const mguide = await mp.evaluate(() => WOS.tame.ring.visible);
    await shot(mp, 'mobile_drag_aim');
    await touch('touchEnd', 0, 0);
    const mthrow = await until(mp, () => WOS.quest.events.some(e => e.kind === 'cubeThrow'), null, 3000);
    await wait(mp, 1200); await shot(mp, 'mobile_throw');
    const mev = await mp.evaluate(() => ({ th: WOS.quest.events.filter(e => e.kind === 'cubeThrow').pop(), n: WOS.quest.save.items[4] }));
    check('mobile: kéo nút E hiện vòng ngắm, thả = ném về phía slime (Cube 5 -> 4)', mguide && mthrow && mev.n === 4 && mev.th && mev.th.target, JSON.stringify(mev));
    await until(mp, () => !WOS.tame.busy, null, 12000);
    await mctx.close();
  } catch (e) {
    check('chạy hết kịch bản', false, e.message.split('\n')[0]);
  }
  clearTimeout(kill);
  const real = problems.filter(p => !/favicon/.test(p));
  check('không lỗi trang / console / HTTP >= 400', !real.length, real.slice(0, 6).join(' | '));
  await browser.close();
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main();
