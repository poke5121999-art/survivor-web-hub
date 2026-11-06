/*
 * Thế Giới Slime (games/world-of-slime) pha F4: nhiệm vụ 7 (trả) tới 14 theo clip DcGavHFwqtk 6:36-11:06, bằng phím/chuột thật.
 * Bản lưu dựng sẵn (v1: q1..q6 xong, q7 "Grant Lucy's Request" đủ 2/2 + 1/1, đã thắng Rudga, Vàng 9,911) rồi:
 *   rừng: Martin "!" -> nhận "Grant Martin's Request" (0/10) -> làng: trả Lucy (thẻ Túi Đồ, + 30 HP Potion × 3, EXP + 20)
 *   -> màn chỉ nút túi + ô Q -> "Recovery Complete!": dùng thuốc trong túi (I + Use) = 1/1, dùng thêm bằng Q -> trả Lucy (EXP + 10)
 *   -> Mysterious Researcher gọi từ xa -> nói chuyện (thẻ Friendly Slime, Shop) -> "Suspicious Researcher" (Purchase Cube 0/3)
 *   -> Billy -> "Patrol" -> HUD: Martin ★ + Suspicious Researcher + Patrol (8:33) -> Vivian mua 3 Cube (3/3)
 *   -> rừng: hạ 10 Junior Floralime (Martin 10/10 và Patrol 10/10 cùng đếm) -> trả Martin (EXP + 30)
 *   -> làng: trả Researcher (thẻ Tame, màn chỉ ba ô Q/E/R) -> "Quest complete! Suspicious Researcher", EXP + 20,
 *      "Suspicious Part-Time Job" bắt đầu (chưa có trong bản web) -> HUD: Patrol ★ 0/1 + 10/10 + Suspicious Part-Time Job (11:03)
 *   -> rừng: bắt một Junior Floralime bằng Cube (E + chuột) -> tuần tra tới đầu tây (Patrol 1/1) -> tải lại tiếng Việt.
 * Kiểm: chữ HUD, băng chữ, phần thưởng, EXP, không lỗi trang/console/HTTP >= 400.
 * Ảnh: D:\wos-ref\proof\quest2\web\ (so với khung clip bằng skill parity-compare).
 *
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   node test/world-of-slime-quest2.js
 * Trên Pages: WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-quest2.js
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/quest2/web' : process.env.WOS_SHOTS;
const Q = (s, lang = 'en') => '?intro=0&seed=7&lang=' + lang + '&name=GogetaSup&slime=SL_ElecChicken_WindFire' + (ASSETS ? '&assets=' + encodeURIComponent(ASSETS) : '') + s;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };

// bản lưu v1 như sau 6:27 của clip: q1..q6 xong, q7 đủ mục tiêu, đã thắng Rudga, 1 Mảnh slime nhỏ, Lv2 (EXP 10)
const PRESET = { v: 1, quests: { q1: { s: 'done', c: {} }, q2: { s: 'done', c: {} }, q3: { s: 'done', c: { heal: 1 } }, q4: { s: 'done', c: { herb: 1 } },
  q5: { s: 'done', c: { perk: 1 } }, q6: { s: 'done', c: {} }, q7: { s: 'active', c: { kill: 2, frag: 1 } } }, gold: 9911, exp: 10, level: 2, sp: 0, duel: true,
  perks: { companion1: 1 }, items: { 215: 1 }, boxes: ['box_vivian'], slime: { hp: 1, mp: 1, st: 1 }, seen: {} };

const st = page => page.evaluate(() => {
  const E = WOS.quest, sv = E.save;
  const qi = document.querySelector('[data-hud="questItem"]');
  return { map: String(WOS.map.data.id), x: +WOS.P.x.toFixed(2), z: +WOS.P.z.toFixed(2), modal: WOS.state.modal,
    tracker: qi ? qi.innerText.replace(/\s+/g, ' ').trim() : '', more: [...document.querySelectorAll('[data-hud="questMore"]')].map(e => e.innerText.trim()),
    quests: Object.fromEntries(Object.entries(sv.quests).map(([k, v]) => [k, v.s + JSON.stringify(v.c)])), items: { ...sv.items }, gold: sv.gold, exp: sv.exp, level: sv.level,
    quick: sv.quick.slice(), errors: WOS.errors.slice() };
});
const logs = page => page.evaluate(() => [...document.querySelectorAll('[data-hud="log"]')].map(e => e.dataset.text));
// thưởng đã trao (sự kiện engine; dòng log trái hiện sau băng chữ nên không đợi nó)
const gotExp = (page, n) => until(page, n => WOS.quest.events.some(e => e.kind === 'exp' && e.n === n && e.t > performance.now() - 30000), n, 8000);

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

async function walk(page, pts, { untilModal, timeout = 40000 } = {}) {
  const k = page.keyboard, held = new Set(), t0 = Date.now();
  const hold = want => { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { if (want.includes(c) && !held.has(c)) { held.add(c); k.down(c); } else if (!want.includes(c) && held.has(c)) { held.delete(c); k.up(c); } } };
  let i = 0, s = null;
  while (Date.now() - t0 < timeout) {
    s = await page.evaluate(() => ({ x: WOS.P.x, z: WOS.P.z, modal: WOS.state.modal }));
    if (untilModal && s.modal) break;
    if (s.modal) { hold([]); await wait(page, 100); continue; }
    while (i < pts.length - 1 && Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z) < 0.45) i++;
    const [tx, tz] = pts[i], dx = tx - s.x, dz = tz - s.z;
    if (i === pts.length - 1 && Math.hypot(dx, dz) < 0.4) break;
    const want = []; const e = 0.15;
    if (dx > e) want.push('KeyD'); else if (dx < -e) want.push('KeyA');
    if (dz > e) want.push('KeyW'); else if (dz < -e) want.push('KeyS');
    hold(want); await wait(page, 40);
  }
  hold([]);
  return s;
}
async function until(page, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await wait(page, 100); }
  return false;
}
// hội thoại: Space qua dòng, lựa chọn đầu (hoặc picks), chụp ở các node trong `shots` khi chữ đã chạy xong
async function converse(page, { picks = [], shots = {}, max = 80 } = {}) {
  const seen = [], done = new Set();
  for (let n = 0; n < max; n++) {
    const d = await page.evaluate(() => { const s = WOS.story.dlg; if (!s || !s.D.root.isConnected) return null; return { id: s.id, typing: !!s.timer, choices: s.choices ? s.choices.length : 0 }; });
    if (!d) return seen;
    if (!seen.length || seen[seen.length - 1] !== d.id) seen.push(d.id);
    if (d.typing) { if (shots[d.id] && !done.has(d.id)) { await wait(page, 120); continue; } await page.keyboard.press('Space'); await wait(page, 90); continue; }
    if (shots[d.id] && !done.has(d.id)) { done.add(d.id); await wait(page, 450); await shot(page, shots[d.id]); }
    if (d.choices) { const k = picks.length ? picks.shift() : 0; for (let i = 0; i < k; i++) { await page.keyboard.press('ArrowDown'); await wait(page, 40); } await page.keyboard.press('Space'); await wait(page, 160); continue; }
    await page.keyboard.press('Space'); await wait(page, 140);
  }
  return seen;
}
const npcAt = (page, name) => page.evaluate(n => { const a = WOS.npcs.find(k => k.def.name === n); return a ? { x: a.def.x, z: a.def.z } : null; }, name);
async function talkTo(page, name, opt = {}) {
  const p = await npcAt(page, name);
  if (!p) { check('có NPC ' + name, false); return []; }
  const pts = await plan(page, p.x, p.z + (opt.dz || 0), opt.near || 1.7);
  if (pts && pts.length) await walk(page, pts, { timeout: 45000 });
  await wait(page, 300);
  let open = false;
  for (let k = 0; k < 6 && !open; k++) {
    // đang đánh (slime hoang gây hấn) thì Space là huýt sáo: gọi slime về rồi mới nói chuyện
    if (await page.evaluate(() => WOS.state.battle)) { await page.keyboard.press('Enter'); await until(page, () => !WOS.state.battle, null, 5000); }
    await page.keyboard.press('Space');
    open = await until(page, () => !!WOS.story.dlg, null, 2500);
  }
  if (!open) { check('mở hội thoại với ' + name, false, JSON.stringify(await st(page))); return []; }
  return converse(page, opt);
}
// băng chữ: đợi phần tử [data-hud=kind] có data-title khớp, chụp
async function banner(page, kind, re, name, ms = 12000) {
  const ok = await until(page, ([k, src]) => [...document.querySelectorAll('[data-hud="' + k + '"]')].some(e => new RegExp(src).test(e.dataset.title || '')), [kind, re.source], ms);
  if (ok && name) { await wait(page, 450); await shot(page, name); }
  return ok;
}
const nearestFlo = page => page.evaluate(() => {
  let b = null, bd = Infinity;
  for (const m of WOS.combat.mons) { if (m.dead || m.trapped || m.team !== 'wild' || m.def.model !== 'SL_Slime_Grass') continue; const d = Math.hypot(m.x - WOS.P.x, m.z - WOS.P.z); if (d < bd) { bd = d; b = { id: m.def.id, x: m.x, z: m.z, d }; } }
  return b;
});
const screenOf = (page, id) => page.evaluate(id => {
  const m = WOS.combat.mons.find(x => x.def.id === id); if (!m) return null;
  const v = new WOS.THREE.Vector3(-m.x, m.y + 0.3, m.z).project(WOS.camera.cam);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, hp: m.hp, maxHp: m.maxHp, dead: m.dead, d: Math.hypot(m.x - WOS.P.x, m.z - WOS.P.z) };
}, id);
async function killOne(page) {
  const m = await nearestFlo(page); if (!m) { await wait(page, 1000); return false; }
  if (m.d > 5) { const pts = await plan(page, m.x, m.z, 4.5, 2.0); if (pts && pts.length) await walk(page, pts, { timeout: 25000 }); }
  if (!(await page.evaluate(() => WOS.state.battle))) { await page.keyboard.press('Space'); await wait(page, 200); }
  await until(page, () => !!WOS.combat.pt.target, null, 4000);
  const tgt = await page.evaluate(() => WOS.combat.pt.target && WOS.combat.pt.target.def.id);
  if (!tgt) return false;
  return until(page, id => !WOS.combat.mons.find(m => m.def.id === id && !m.dead), tgt, 30000);
}

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const kill = setTimeout(() => { console.log('timeout: tắt trình duyệt'); browser.close(); process.exit(2); }, 900000);
  const problems = [];
  const watch = page => {
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
    page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ' ' + r.url()); });
  };
  const ready = page => page.waitForFunction(() => window.__ready && WOS.npcs !== undefined, null, { timeout: 120000 });
  const go = async (page, q, lang) => { await page.goto(BASE + 'index.html' + Q(q, lang)); await ready(page); await until(page, () => WOS.npcs.length > 0, null, 20000); await wait(page, 1500); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(p => { if (!sessionStorage.getItem('wosPreset')) { sessionStorage.setItem('wosPreset', '1'); localStorage.setItem('wos.save', p); } }, JSON.stringify(PRESET));
    const page = await ctx.newPage(); watch(page);

    console.log('Rừng: Martin (6:36-6:57)');
    await go(page, '&map=shadow_forest_entrance&at=63,27.5');
    let s = await st(page);
    check('bản lưu: q7 đủ 2/2 + 1/1, HUD "Grant Lucy\'s Request"', /Grant Lucy's Request/.test(s.tracker) && /2\/2/.test(s.tracker) && /1\/1/.test(s.tracker), s.tracker);
    const mk = await page.evaluate(() => WOS.quest.markerFor('Martin'));
    check('Martin có dấu "!" (có việc giao)', mk === 'before', mk);
    let seen = await talkTo(page, 'Martin', { shots: { mt2: 'martin_come', mt3o: 'martin_liquor', mt9: 'martin_getrid', mt11: 'martin_10' } });
    check('Martin: mt1..mt11 (Hey! *hic* ... 10 of them)', ['mt1', 'mt3o', 'mt4', 'mt9', 'mt11'].every(i => seen.includes(i)), seen.join(','));
    check('băng "Grant Martin\'s Request / Village of Rough Waves"', await banner(page, 'questStart', /Grant Martin's Request/, 'banner_martin'));
    s = await st(page);
    check('HUD: Grant Lucy\'s Request ★ + Grant Martin\'s Request (6:54)', /Grant Lucy's Request/.test(s.tracker) && s.more.join('|') === "Grant Martin's Request", s.tracker + ' | ' + s.more.join('|'));
    check('Martin đổi sang dấu "?" (đang làm)', (await page.evaluate(() => WOS.quest.markerFor('Martin'))) === 'progress');

    console.log('Làng: trả Lucy, thẻ Túi Đồ, màn chỉ nút (7:18-7:30)');
    await go(page, '&map=110&at=66,72');
    seen = await talkTo(page, 'Lucy', { shots: { lr7: 'lucy_potion', lr11: 'lucy_bagcard' } });
    check('Lucy: lu1q7 -> lr1..lr12', ['lu1q7', 'lr1', 'lr5', 'lr7', 'lr11', 'lr12'].every(i => seen.includes(i)), seen.join(','));
    const g1 = await until(page, () => { const g = document.querySelector('[data-hud="guide"]'); return g && g.dataset.prefab === 'Tutorial_INVENTORY_BUTTON'; }, null, 5000);
    await wait(page, 700); await shot(page, 'guide_inventory');
    const gt1 = await page.evaluate(() => { const g = document.querySelector('[data-hud="guide"]'); return g ? g.dataset.text + ' rings=' + g.querySelectorAll('[data-hud="guideRing"]').length : ''; });
    check('màn chỉ nút túi: "There are 2 ways to use the potion." + một vòng', g1 && /2 ways to use the potion/.test(gt1) && /rings=1/.test(gt1), gt1);
    const rewards = await page.evaluate(() => [...document.querySelectorAll('[data-hud="questComplete"]')].map(e => e.dataset.title + ':' + [...e.querySelectorAll('[data-reward]')].map(r => r.dataset.reward).join(',')));
    const lg = await logs(page);
    const ev7 = await page.evaluate(() => WOS.quest.events.filter(e => e.kind === 'exp' || e.kind === 'item').map(e => e.kind + ':' + (e.item || '') + ':' + e.n).join(' '));
    check('Quest complete! Grant Lucy\'s Request: ô thưởng EXP 20 + 30 HP Potion × 3', rewards.some(r => /Grant Lucy's Request:exp:20,item1:3/.test(r)) && /item:1:3/.test(ev7) && /exp::20/.test(ev7), rewards.join(' ') + ' | ' + ev7 + ' | ' + lg.join(' | '));
    await page.keyboard.press('Space');
    const g2 = await until(page, () => { const g = document.querySelector('[data-hud="guide"]'); return g && g.dataset.prefab === 'Tutorial_QUICK_SLOT_0_BUTTON'; }, null, 4000);
    await wait(page, 600); await shot(page, 'guide_quick');
    check('màn chỉ ô Q: "You can easily use the equipped potion too."', g2 && /equipped potion/.test(await page.evaluate(() => document.querySelector('[data-hud="guide"]').dataset.text)));
    await page.keyboard.press('Space'); await until(page, () => !document.querySelector('[data-hud="guide"]'), null, 3000);
    check('băng "Recovery Complete!" bắt đầu', await banner(page, 'questStart', /Recovery Complete!/, null, 8000));
    s = await st(page);
    check('HUD: Grant Martin\'s Request ★ 0/10 + Recovery Complete! (7:30)', /Grant Martin's Request/.test(s.tracker) && /Defeat Junior Floralime \d+\/10/.test(s.tracker) && s.more.join('|') === 'Recovery Complete!', s.tracker + ' | ' + s.more.join('|'));
    check('túi: 3 thuốc, ô Q = thuốc, mảnh slime giữ nguyên', s.items[1] === 3 && s.quick[0] === 1 && s.items[215] >= 1, JSON.stringify(s.items) + ' ' + JSON.stringify(s.quick));

    console.log('Dùng thuốc: túi (I + Use), rồi ô Q');
    await page.evaluate(() => { const r = WOS.roster.active(); r.hp = 0.3; WOS.quest.persist(); WOS.combat.loadPartner(); });
    await page.keyboard.press('KeyI'); await until(page, () => WOS.state.modal === 'bag', null, 3000); await wait(page, 700);
    await page.click('[data-hud="bagCell"][data-item="1"]'); await wait(page, 300);
    await page.click('[data-hud="bagUse"]'); await wait(page, 300);
    const goal = await until(page, () => [...document.querySelectorAll('[data-hud="goalDone"]')].some(e => /Recovery Complete!/.test(e.dataset.title) && /Use 30 HP Potion 1\/1/.test(e.textContent)), null, 3000);
    await shot(page, 'recovery_goal_bag');
    await page.keyboard.press('Escape'); await wait(page, 500);
    s = await st(page);
    check('túi -> Use: "Use 30 HP Potion 1/1" + dòng mục tiêu vừa đủ', goal && s.quests.q9 === 'active{"potion":1}' && s.items[1] === 2, s.quests.q9 + ' thuốc ' + s.items[1]);
    await shot(page, 'recovery_goal');
    await wait(page, 3100);   // hồi 3000 ms (coolTimeMillis)
    await page.keyboard.press('KeyQ'); await wait(page, 500);
    s = await st(page);
    check('ô Q: dùng thêm một bình (còn 1), q9 không đếm quá 1/1', s.items[1] === 1 && s.quests.q9 === 'active{"potion":1}', s.items[1] + ' ' + s.quests.q9);

    console.log('Trả "Recovery Complete!" (7:33-7:42), Researcher gọi (7:46)');
    seen = await talkTo(page, 'Lucy', { shots: { lr15: 'lucy_telling' } });
    check('Lucy: lu1q9r -> lr13..lr19', ['lu1q9r', 'lr13', 'lr16', 'lr19'].every(i => seen.includes(i)), seen.join(','));
    check('Quest complete! Recovery Complete! (EXP + 10)', await banner(page, 'questComplete', /Recovery Complete!/, 'complete_recovery') && await gotExp(page, 10));
    const call = await until(page, () => WOS.story.dlg && WOS.story.dlg.id === 'rs0', null, 12000);
    await wait(page, 1200); await shot(page, 'researcher_call');
    check('Mysterious Researcher gọi từ xa: "Hey, you there! Hold on."', call);
    await converse(page);
    check('Researcher có dấu "!"', (await page.evaluate(() => WOS.quest.markerFor('Mysterious Researcher'))) === 'before');
    seen = await talkTo(page, 'Mysterious Researcher', { dz: -1.2, shots: { rs1: 'researcher_rare', rs5: 'card_friendly', rs12: 'researcher_cube', rs21: 'card_shop' } });
    check('Researcher: rs1..rs21 (thẻ Friendly Slime ở rs5, Shop ở rs21)', ['rs1', 'rs5', 'rs11', 'rs17', 'rs21'].every(i => seen.includes(i)), seen.join(','));
    check('băng "Suspicious Researcher / Suspicious Side Job"', await banner(page, 'questStart', /Suspicious Researcher/, 'banner_researcher'));

    console.log('Billy: Patrol (8:18-8:30)');
    seen = await talkTo(page, 'Billy', { shots: { bi1: 'billy_hello', bi13: 'billy_10' } });
    check('Billy: bi0o -> bi1..bi13', ['bi0o', 'bi1', 'bi7', 'bi13'].every(i => seen.includes(i)), seen.join(','));
    check('băng "Patrol / Shadow Forest Patrol"', await banner(page, 'questStart', /^Patrol$/, 'banner_patrol'));
    await wait(page, 2600);
    s = await st(page);
    await shot(page, 'tracker_833');
    check('HUD: Martin ★ 0/10 + Suspicious Researcher + Patrol (8:33)', /Grant Martin's Request/.test(s.tracker) && /\d+\/10/.test(s.tracker) && s.more.join('|') === 'Suspicious Researcher|Patrol', s.tracker + ' | ' + s.more.join('|'));

    console.log('Vivian: mua 3 Cube như 10:45, rồi 7 Cube nữa để đủ ném khi bắt slime');
    const vp = await plan(page, 33.4, 69.2, 0.8); if (vp) await walk(page, vp, { timeout: 45000 });
    await page.keyboard.press('Space'); await until(page, () => !!WOS.story.dlg, null, 4000);
    await converse(page, { picks: [1] });
    check('quầy Vivian mở', await until(page, () => WOS.state.modal === 'shop', null, 4000));
    const cells = await page.$$('[data-hud="shopCell"]'); await cells[0].click(); await wait(page, 200);
    await page.click('[data-hud="shopBuy"]'); await wait(page, 350);
    for (let i = 1; i < 3; i++) { await page.click('[data-hud="buyPlus"]'); await wait(page, 60); }
    await page.click('[data-hud="buyOk"]'); await wait(page, 350);
    await page.click('[data-hud="popupBtn"][data-v="true"]'); await wait(page, 500);
    await page.keyboard.press('Escape'); await wait(page, 600);
    s = await st(page);
    check('mua 3 Cube: Vàng 9,911 - 1,500 = 8,411, "Purchase Cube 3/3"', s.items[4] === 3 && s.gold === 8411 && s.quests.q10 === 'active{"cube":3}' && s.quick[1] === 4, JSON.stringify(s.items) + ' ' + s.gold + ' ' + s.quests.q10);
    await page.keyboard.press('Space'); await until(page, () => !!WOS.story.dlg, null, 4000); await converse(page, { picks: [1] });
    if (await until(page, () => WOS.state.modal === 'shop', null, 4000)) {
      const c2 = await page.$$('[data-hud="shopCell"]'); await c2[0].click(); await wait(page, 200); await page.click('[data-hud="shopBuy"]'); await wait(page, 350);
      for (let i = 1; i < 7; i++) { await page.click('[data-hud="buyPlus"]'); await wait(page, 60); }
      await page.click('[data-hud="buyOk"]'); await wait(page, 350); await page.click('[data-hud="popupBtn"][data-v="true"]'); await wait(page, 500);
      await page.keyboard.press('Escape'); await wait(page, 600);
    }
    s = await st(page);
    check('mua thêm 7 Cube: "Purchase Cube" vẫn 3/3 (không đếm quá)', s.items[4] === 10 && s.quests.q10 === 'active{"cube":3}', JSON.stringify(s.items) + ' ' + s.quests.q10);
    check('Researcher đổi sang dấu ✓ (trả được)', (await page.evaluate(() => WOS.quest.markerFor('Mysterious Researcher'))) === 'complete');

    console.log('Rừng: hạ 10 Junior Floralime (8:42-9:54), trả Martin (10:15)');
    await go(page, '&map=shadow_forest_entrance&at=63,27.5');
    await until(page, () => WOS.combat.mons.length >= 7, null, 20000);
    let kills = 0, goal8 = false; const tK = Date.now();
    while (Date.now() - tK < 300000) {
      // slime hoang gây hấn có thể bị hạ trước khi Billy giao Patrol: đánh tới khi cả Martin lẫn Patrol đủ 10
      const c = await page.evaluate(() => [WOS.quest.count('q8', 'kill'), WOS.quest.count('q11', 'kill')]);
      if (c[0] >= 10 && !goal8) { goal8 = await until(page, () => [...document.querySelectorAll('[data-hud="goalDone"]')].some(e => /Grant Martin's Request/.test(e.dataset.title)), null, 3000); if (goal8) await shot(page, 'martin_goal'); }
      if (c[0] >= 10 && c[1] >= 10) break;
      if (await killOne(page)) kills++;
      if (kills === 1) await shot(page, 'forest_fight');
    }
    s = await st(page);
    check('Martin 10/10 và Patrol 10/10 cùng đếm', /"kill":10/.test(s.quests.q8) && /"kill":10/.test(s.quests.q11), s.quests.q8 + ' ' + s.quests.q11 + ' (' + kills + ' lần hạ)');
    check('dòng "Grant Martin\'s Request ✓ Defeat Junior Floralime 10/10" (9:54)', goal8);
    await page.keyboard.press('Enter'); await wait(page, 1500);   // huýt sáo gọi slime về (Return) nếu còn đánh
    seen = await talkTo(page, 'Martin', { shots: { mtR: 'martin_done', mt18: 'martin_doze' } });
    check('Martin: mtR -> mt12..mt20', ['mtR', 'mt12', 'mt16', 'mt18', 'mt20'].every(i => seen.includes(i)), seen.join(','));
    const rw8 = await until(page, () => [...document.querySelectorAll('[data-hud="questComplete"]')].some(e => /Grant Martin's Request/.test(e.dataset.title) && e.querySelector('[data-reward="exp:30"]')), null, 10000);
    await wait(page, 450); await shot(page, 'complete_martin');
    check('Quest complete! Grant Martin\'s Request, ô thưởng EXP 30 + EXP + 30', rw8 && await gotExp(page, 30));
    await wait(page, 3200);
    s = await st(page);
    check('HUD: Suspicious Researcher ★ Purchase Cube 3/3 + Patrol (10:15)', /Suspicious Researcher/.test(s.tracker) && /Purchase Cube 3\/3/.test(s.tracker) && s.more.join('|') === 'Patrol', s.tracker + ' | ' + s.more.join('|'));

    console.log('Làng: trả Researcher, thẻ Tame, màn chỉ Q/E/R (10:51-11:03)');
    await go(page, '&map=110&at=54,86');
    seen = await talkTo(page, 'Mysterious Researcher', { dz: -1.2, shots: { rt3: 'researcher_parttime', rt6: 'card_tame' } });
    check('Researcher: rsR -> rt1..rt8', ['rsR', 'rt1', 'rt6', 'rt8'].every(i => seen.includes(i)), seen.join(','));
    const g3 = await until(page, () => { const g = document.querySelector('[data-hud="guide"]'); return g && g.dataset.prefab === 'Tutorial_QUICK_SLOT_ALL_BUTTON'; }, null, 5000);
    await wait(page, 700); await shot(page, 'guide_tame');
    const gt3 = await page.evaluate(() => { const g = document.querySelector('[data-hud="guide"]'); return g ? g.dataset.text + ' rings=' + g.querySelectorAll('[data-hud="guideRing"]').length : ''; });
    check('màn chỉ ba ô Q/E/R: "Use the equipped cube ..." + ba vòng', g3 && /Use the equipped cube/.test(gt3) && /rings=3/.test(gt3), gt3);
    const before = await page.evaluate(() => WOS.quest.save.quests.q10.s);
    check('nhiệm vụ chưa xong khi màn chỉ còn mở (11:01 -> 11:03)', before === 'active', before);
    await page.keyboard.press('Space');
    check('Quest complete! Suspicious Researcher', await banner(page, 'questComplete', /Suspicious Researcher/, 'complete_researcher'));
    check('EXP + 20 (11:03)', await gotExp(page, 20));
    check('băng "Suspicious Part-Time Job"', await banner(page, 'questStart', /Suspicious Part-Time/, null, 9000));
    await wait(page, 3200);
    s = await st(page);
    await shot(page, 'tracker_1103');
    check('HUD: Patrol ★ "Patrol Shadow Forest Entrance 0/1" + "Defeat Junior Floralime 10/10" + Suspicious Part-Time Job (11:03)',
      /^Patrol/.test(s.tracker) && /Patrol Shadow Forest Entrance 0\/1/.test(s.tracker) && /Defeat Junior Floralime 10\/10/.test(s.tracker) && s.more.join('|') === 'Suspicious Part-Time Job', s.tracker + ' | ' + s.more.join('|'));
    check('EXP: 10 + 20 + 10 + 30 + 20 = 90, Lv2', s.exp === 90 && s.level === 2, s.exp + ' Lv' + s.level);
    await page.keyboard.press('KeyJ'); await until(page, () => WOS.state.modal === 'questlog', null, 3000); await wait(page, 800);
    const qlog = await page.evaluate(() => [...document.querySelectorAll('[data-hud="questRow"]')].map(e => e.dataset.q).join(','));
    await shot(page, 'questlog');
    check('nhật ký J: Patrol + Suspicious Part-Time Job đang làm', /q11/.test(qlog) && /q12/.test(qlog), qlog);
    await page.keyboard.press('Escape'); await wait(page, 400);

    console.log('Rừng: bắt một Junior Floralime (E + chuột), tuần tra tới đầu tây');
    await go(page, '&map=shadow_forest_entrance&at=63,27.5');
    await until(page, () => WOS.combat.mons.filter(m => !m.dead && m.def.model === 'SL_Slime_Grass').length >= 3, null, 30000);
    let caught = false, throws = 0;
    for (let round = 0; round < 9 && !caught; round++) {
      const t = await nearestFlo(page); if (!t) { await wait(page, 2000); continue; }
      if (t.d > 4.5) { const pts = await plan(page, t.x, t.z, 4.0, 2.0); if (pts && pts.length) await walk(page, pts); }
      if (!(await page.evaluate(() => WOS.state.battle))) { await page.keyboard.press('Space'); await wait(page, 200); }
      const t0 = Date.now(); let sc = null, tg = null;
      while (Date.now() - t0 < 20000) {
        tg = await page.evaluate(() => WOS.combat.pt.target && WOS.combat.pt.target.def.id);
        sc = tg ? await screenOf(page, tg) : null;
        if (sc && !sc.dead && sc.hp / sc.maxHp < 0.5) break;
        if (!tg && !(await page.evaluate(() => WOS.state.battle))) await page.keyboard.press('Space');
        await wait(page, 120);
      }
      if (!sc || sc.dead) continue;
      sc = await screenOf(page, tg);
      await page.mouse.move(sc.x, sc.y); await wait(page, 60);
      await page.keyboard.down('KeyE'); await wait(page, 220); await page.keyboard.up('KeyE'); throws++;
      await until(page, () => WOS.quest.events.some(e => (e.kind === 'cubeHit' || e.kind === 'cubeMiss') && e.t > performance.now() - 4000), null, 5000);
      await until(page, () => !WOS.tame.busy, null, 12000);
      const h = await page.evaluate(() => WOS.quest.events.filter(e => e.kind === 'cubeHit').pop());
      if (h && h.result === 0) caught = true; else await wait(page, 5200);
    }
    check('bắt được Junior Floralime bằng Cube', caught, throws + ' lần ném');
    if (await until(page, () => WOS.state.modal === 'nickAsk', null, 5000)) { await shot(page, 'tame_nick'); await page.keyboard.press('Escape'); await wait(page, 600); }
    if (await page.evaluate(() => WOS.state.modal)) { await page.keyboard.press('Escape'); await wait(page, 400); }
    await page.keyboard.press('Enter'); await wait(page, 1200);
    const wp = await plan(page, 17, 30, 3.5);
    if (wp) await walk(page, wp, { timeout: 60000 });
    const reached = await until(page, () => WOS.quest.count('q11', 'patrol') >= 1, null, 4000);
    s = await st(page);
    await shot(page, 'patrol_reached');
    check('tuần tra tới đầu tây: "Patrol Shadow Forest Entrance 1/1", Billy có dấu ✓', reached && /1\/1/.test(s.tracker) && (await page.evaluate(() => WOS.quest.markerFor('Billy'))) === 'complete', s.tracker + ' @' + s.x + ',' + s.z);

    console.log('Tải lại tiếng Việt (bản dịch)');
    await go(page, '&map=110&at=66,66', 'vi');
    s = await st(page);
    check('HUD tiếng Việt: Tuần Tra ★ + Việc Làm Thêm Đáng Ngờ', /Tuần Tra/.test(s.tracker) && s.more.join('|') === 'Việc Làm Thêm Đáng Ngờ', s.tracker + ' | ' + s.more.join('|'));
    seen = await talkTo(page, 'Billy');
    const notice = await until(page, () => WOS.state.modal === 'notice' || !!document.querySelector('[data-hud="popupBtn"]'), null, 3000);
    await shot(page, 'billy_notbuilt');
    check('trả Patrol ở Billy: báo "Chưa có trong bản web"', seen.includes('biR') && notice, seen.join(','));
    await page.keyboard.press('Escape'); await wait(page, 300);
    s = await st(page);
    check('không lỗi trong game (WOS.errors)', !s.errors.length, s.errors.join(' | '));
  } catch (e) {
    check('chạy không ném lỗi', false, e.stack);
  }
  check('không lỗi trang / console / HTTP >= 400', !problems.length, problems.slice(0, 8).join(' | '));
  clearTimeout(kill);
  await browser.close();
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main();
