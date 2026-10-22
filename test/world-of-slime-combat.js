/*
 * Thế Giới Slime (games/world-of-slime) pha F1: đấu tay đôi với Rudga + Shadow Forest Entrance + chiến đấu, bằng phím/chạm thật.
 * Bản lưu dựng sẵn (q1..q6 xong, q7 "Giúp Lucy" đang làm) ghi vào localStorage trước khi trang chạy, rồi:
 *   cổng tây làng 110 -> Rudga nói + chọn "Lucy nhờ tôi..." -> sân đấu (dựng theo clip): băng TEAM A vs TEAM B, thanh trên cùng
 *   (Lv, tên, 05:00, Rudga), đếm 3-2-1, bóng thoại Rudga, slime đồng hành tự đánh -> thắng -> về làng, cổng tây mở
 *   -> Shadow Forest Entrance (nhãn "dựng theo clip", Martin) -> Space đánh Junior Floralime tới khi q7 đủ 2/2 + 1/1
 *   (log "<tên> EXP Slime + 2", "Mảnh slime nhỏ × 1", "Lv2"), huýt sáo gọi về giữa trận, slime hoang sinh lại
 *   -> mobile.html: nút đánh / huýt sáo / cần ảo trong rừng. Kiểm: không lỗi trang/console/HTTP >= 400, fps >= 30.
 * Ảnh chụp: D:\wos-ref\proof\combat\web\ (so với khung clip bằng skill parity-compare).
 *
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   node test/world-of-slime-combat.js
 * Trên Pages: WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-combat.js
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/combat/web' : process.env.WOS_SHOTS;
const Q = s => '?intro=0&seed=5' + (ASSETS ? '&assets=' + encodeURIComponent(ASSETS) : '') + s;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };

// bản lưu: q1..q6 xong (như sau 4:45), q7 đang làm, Lv2 (4:00), Vàng 9,911 (10,000 - chữa 89)
const PRESET = { v: 1, quests: { q1: { s: 'done', c: {} }, q2: { s: 'done', c: {} }, q3: { s: 'done', c: { heal: 1 } }, q4: { s: 'done', c: { herb: 1 } },
  q5: { s: 'done', c: { perk: 1 } }, q6: { s: 'done', c: {} }, q7: { s: 'active', c: {} } }, gold: 9911, exp: 10, level: 2, sp: 0,
  perks: { companion1: 1 }, items: {}, boxes: ['box_vivian'], slime: { hp: 1, mp: 1, st: 1 }, seen: {} };

const st = page => page.evaluate(() => {
  const E = WOS.quest, sv = E.save, C = WOS.combat;
  const qi = document.querySelector('[data-hud="questItem"]');
  return { map: String(WOS.map.data.id), x: +WOS.P.x.toFixed(2), z: +WOS.P.z.toFixed(2), sx: +WOS.S.x.toFixed(2), sz: +WOS.S.z.toFixed(2), modal: WOS.state.modal,
    switching: !!WOS.switching, tracker: qi ? qi.innerText.replace(/\s+/g, ' ').trim() : '', q7: sv.quests.q7, items: sv.items, duel: !!sv.duel,
    battle: WOS.state.battle, target: C.pt.target ? C.pt.target.def.id : null, lv: C.lv, exp: C.exp, hp: Math.round(C.hp), fps: WOS.stats.fps,
    errors: WOS.errors.slice(), label: document.getElementById('devlabel').hidden ? '' : document.getElementById('devlabel').textContent };
});
const cev = page => page.evaluate(() => WOS.combat.events.map(e => e.kind + (e.id ? ':' + e.id : '') + (e.phase ? ':' + e.phase : '') + (e.win != null ? ':' + e.win : '') + (e.lv ? ':' + e.lv : '')));

// BFS trên ô 0.5 m (như world-of-slime-quest.js)
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

async function walk(page, pts, { untilMap, untilModal, timeout = 60000 } = {}) {
  const k = page.keyboard, held = new Set(), t0 = Date.now();
  const hold = want => { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { if (want.includes(c) && !held.has(c)) { held.add(c); k.down(c); } else if (!want.includes(c) && held.has(c)) { held.delete(c); k.up(c); } } };
  let i = 0, s = null;
  while (Date.now() - t0 < timeout) {
    s = await page.evaluate(() => ({ map: String(WOS.map.data.id), x: WOS.P.x, z: WOS.P.z, switching: !!WOS.switching, modal: WOS.state.modal }));
    if (untilMap && (s.map === untilMap || s.switching)) break;
    if (untilModal && s.modal) break;
    if (s.switching || s.modal) { hold([]); await wait(page, 100); continue; }
    while (i < pts.length - 1 && Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z) < 0.45) i++;
    const [tx, tz] = pts[i], dx = tx - s.x, dz = tz - s.z;
    if (!untilMap && !untilModal && i === pts.length - 1 && Math.hypot(dx, dz) < 0.4) break;
    const want = []; const e = 0.15;
    if (dx > e) want.push('KeyD'); else if (dx < -e) want.push('KeyA');
    if (dz > e) want.push('KeyW'); else if (dz < -e) want.push('KeyS');
    hold(want); await wait(page, 40);
  }
  hold([]);
  return s;
}
// đợi điều kiện bằng cách hỏi từng 100 ms (page.waitForFunction polling raf bị nghẽn trong trang này: hết giờ dù điều kiện đã đúng)
async function until(page, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await wait(page, 100); }
  return false;
}
async function waitMap(page, id, ms = 40000) {   // hỏi từng 100 ms (waitForFunction raf bị nghẽn khi trang đang dựng bản đồ)
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) { s = await page.evaluate(() => [String(WOS.map.data.id), !!WOS.switching]); if (s[0] === id && !s[1]) return true; await wait(page, 100); }
  console.log('    waitMap ' + id + ': ' + JSON.stringify(s)); return false;
}

async function converse(page, picks = [], max = 60) {
  const seen = [];
  for (let n = 0; n < max; n++) {
    const d = await page.evaluate(() => { const s = WOS.story.dlg; if (!s) return null; return { id: s.id, typing: !!s.timer, choices: s.choices ? s.choices.length : 0 }; });
    if (!d) return seen;
    if (!seen.length || seen[seen.length - 1] !== d.id) seen.push(d.id);
    if (d.typing) { await page.keyboard.press('Space'); await wait(page, 90); continue; }
    if (d.choices) { const k = picks.length ? picks.shift() : 0; for (let i = 0; i < k; i++) { await page.keyboard.press('ArrowDown'); await wait(page, 40); } }
    await page.keyboard.press('Space'); await wait(page, 150);
  }
  return seen;
}
// slime hoang còn sống gần người chơi nhất
const nearestMon = page => page.evaluate(() => {
  let b = null, bd = 1e9;
  for (const m of WOS.combat.mons) { if (m.dead || m.team !== 'wild' || m.def.model !== 'SL_Slime_Grass') continue;   /* F3: rừng có thêm Mandrake */ const d = Math.hypot(m.x - WOS.P.x, m.z - WOS.P.z); if (d < bd) { bd = d; b = { id: m.def.id, x: m.x, z: m.z, d }; } }
  return b;
});
// đi tới gần một Junior Floralime rồi nhấn Space (KeyboardInteractAttack), đợi nó chết
async function fightOne(page, label) {
  const m = await nearestMon(page);
  if (!m) { check('còn slime hoang để đánh (' + label + ')', false); return null; }
  if (m.d > 5) { const pts = await plan(page, m.x, m.z, 4.5, 2.0); if (pts && pts.length) await walk(page, pts, { timeout: 30000 }); }
  const t0 = Date.now();
  const s0 = await st(page);
  if (!s0.battle) { await page.keyboard.press('Space'); await wait(page, 200); }
  const eng = await until(page, () => !!WOS.combat.pt.target, null, 4000);
  const tgt = (await st(page)).target;
  const killed = await until(page, id => WOS.combat.events.some(e => e.kind === 'kill' && e.id === id && e.t > performance.now() - 30000) && !WOS.combat.mons.find(m => m.def.id === id && !m.dead), tgt, 30000);
  const sec = (Date.now() - t0) / 1000;
  check(`hạ Junior Floralime (${label})`, eng && killed, `${tgt} trong ${sec.toFixed(1)} s`);
  return { id: tgt, sec };
}

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const kill = setTimeout(() => { console.log('timeout: tắt trình duyệt'); browser.close(); process.exit(2); }, 420000);
  const problems = [];
  const watch = page => {
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
    page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ' ' + r.url()); });
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(p => { if (!sessionStorage.getItem('wosPreset')) { sessionStorage.setItem('wosPreset', '1'); localStorage.setItem('wos.save', p); } }, JSON.stringify(PRESET));
    const page = await ctx.newPage(); watch(page);
    await page.goto(BASE + 'index.html' + Q('&map=110&at=30.5,58.5'));
    await page.waitForFunction(() => window.__ready && WOS.npcs.length > 0, null, { timeout: 120000 });
    await wait(page, 1200);
    let s = await st(page);
    check('bản lưu dựng sẵn: q7 đang làm, 0/2 + 0/1', s.q7 && s.q7.s === 'active' && /Junior Floralime 0\/2/.test(s.tracker) && /0\/1/.test(s.tracker), s.tracker);

    console.log('Cổng tây -> Rudga -> sân đấu');
    const gp = await plan(page, 21.0, 58.5, 0.8);
    if (gp) await walk(page, gp, { untilModal: true, timeout: 60000 });
    const ru = await until(page, () => WOS.story.dlg && WOS.story.dlg.D.root.dataset.speaker === 'Rudga', null, 8000);
    check('Rudga chặn cổng tây', ru);
    const seen = await converse(page, [0]);
    check('Rudga: ru1..ru4 rồi vào trận', ['ru1', 'ru3', 'ru4'].every(i => seen.includes(i)), seen.join(','));
    check('sang sân đấu rudga_arena', await waitMap(page, 'rudga_arena'));
    const vs = await page.waitForSelector('[data-hud="pvpVs"]', { timeout: 5000 }).then(() => true, () => false);
    await wait(page, 500); await shot(page, 'duel_vs');
    const vsText = vs ? await page.innerText('[data-hud="pvpVs"]') : '';
    check('băng TEAM A vs TEAM B', vs && /TEAM A/.test(vsText) && /TEAM B/.test(vsText) && /Rudga/.test(vsText), vsText.replace(/\s+/g, ' '));
    const bar = await page.innerText('[data-hud="pvpTopBar"]').catch(() => '');
    check('thanh trên: Lv2, tên, 00:00, Rudga', /Lv2/.test(bar) && /00:00/.test(bar) && /Rudga/.test(bar) && /TEAM A/.test(bar), bar.replace(/\s+/g, ' '));
    s = await st(page);
    check('nhãn "dựng theo clip" trên sân đấu', s.label === 'dựng theo clip', s.label);
    const counts = [];
    const tC = Date.now();
    while (Date.now() - tC < 9000) { const k = await page.evaluate(() => { const e = document.querySelector('[data-hud="pvpCount"]'); return e && e.dataset.k; }); if (k && counts[counts.length - 1] !== k) { counts.push(k); if (k === '1') await shot(page, 'duel_count1'); } if (k === 'Start') break; await wait(page, 60); }
    check('đếm ngược 3-2-1-Start', counts.join(',') === '3,2,1,Start', counts.join(','));
    await wait(page, 2500); await shot(page, 'duel_fight');
    const bub = await page.waitForSelector('[data-hud="bubble"]', { timeout: 9000 }).then(() => true, () => false);
    const bubText = bub ? await page.evaluate(() => [...document.querySelectorAll('[data-hud="bubble"]')].map(e => e.dataset.text).join(' / ')) : '';
    if (bub) await shot(page, 'duel_bubble');
    check('bóng thoại Rudga trong trận', bub && /fight|chiến/.test(bubText), bubText);
    const won = await until(page, () => WOS.combat.events.some(e => e.kind === 'duel' && e.phase === 'end'), null, 60000);
    const ev = await cev(page);
    check('trận kết thúc, đồng hành thắng', won && ev.includes('duel:end:true'), ev.filter(e => /duel|kill|faint/.test(e)).join(' '));
    await wait(page, 300); await shot(page, 'duel_win');
    check('về làng 110 sau trận', await waitMap(page, '110', 20000));
    await wait(page, 800);
    s = await st(page);
    check('cổng tây mở (save.duel)', s.duel && Math.abs(s.x - 28.5) < 1.5, s.x + ',' + s.z);

    console.log('Cổng tây -> Shadow Forest Entrance');
    const gp2 = await plan(page, 21.0, 58.5, 0.8);
    if (gp2) await walk(page, gp2, { untilMap: 'shadow_forest_entrance', timeout: 60000 });
    check('vào Shadow Forest Entrance', await waitMap(page, 'shadow_forest_entrance'));
    await until(page, () => WOS.npcs.length > 0 && WOS.combat.mons.length > 0, null, 20000);
    await wait(page, 1500); await shot(page, 'forest_entrance');
    s = await st(page);
    const info = await page.evaluate(() => ({ npcs: WOS.npcs.map(n => n.def.name), mons: WOS.combat.mons.filter(m => m.def.model === 'SL_Slime_Grass').length, man: WOS.combat.mons.filter(m => m.def.model === 'SL_Mandrake_Grass').length, title: [...document.querySelectorAll('[data-hud="placeTitle"]')].map(e => e.dataset.title), map: WOS.state.map }));
    check('nhãn "dựng theo clip", Martin, 7 Junior Floralime + 2 Mandrake (F3)', s.label === 'dựng theo clip' && info.npcs.includes('Martin') && info.mons === 7 && info.man === 2, JSON.stringify(info.npcs) + ' ' + info.mons + '+' + info.man);
    check('HUD: Shadow Forest / Shadow Forest Entrance', info.map.name === 'Shadow Forest' && info.map.detail === 'Shadow Forest Entrance', JSON.stringify(info.map));

    console.log('Đánh Junior Floralime');
    const fights = [];
    let f = await fightOne(page, '1'); if (f) fights.push(f);
    await shot(page, 'forest_kill1');
    f = await fightOne(page, '2'); if (f) fights.push(f);
    s = await st(page);
    check('q7 "Hạ Junior Floralime 2/2"', s.q7 && s.q7.c.kill >= 2 && /Junior Floralime 2\/2/.test(s.tracker), s.tracker);
    for (let n = 3; n <= 7 && (!(s.items[215] > 0) || n <= 3); n++) { f = await fightOne(page, String(n)); if (f) fights.push(f); s = await st(page); }
    check('rơi Mảnh slime nhỏ (item 215), q7 1/1', s.items[215] >= 1 && s.q7.c.frag >= 1 && /1\/1/.test(s.tracker), JSON.stringify(s.items) + ' ' + s.tracker);
    const evs = await cev(page);
    const logs = await page.evaluate(() => WOS.__logs || []);
    void logs;
    check('mỗi trận 4-12 s (clip ~6-9 s)', fights.every(x => x.sec >= 4 && x.sec <= 12), fights.map(x => x.sec.toFixed(1)).join(', '));
    // log EXP slime / đồ rơi / lên cấp: dòng log tự tắt sau 4.2 s, nên đọc nhật ký combat + DOM của trận cuối
    check('EXP slime + lên cấp slime Lv2 (3 con)', evs.filter(e => e === 'slimeExp').length >= 3 && evs.some(e => e === 'slimeLevel:2'), evs.filter(e => /slime/.test(e)).join(' '));
    check('Junior Floralime dùng đòn attack_type 1 lên đồng hành', evs.some(e => /^monAttack/.test(e)) && evs.some(e => e === 'partnerHit'), '');
    check('đồng hành dùng kỹ năng (skill_type) và đòn thường', evs.some(e => /^cast/.test(e)) && evs.some(e => /^attack/.test(e)), '');

    console.log('Huýt sáo giữa trận');
    const m = await nearestMon(page);
    if (m && m.d > 5) { const pts = await plan(page, m.x, m.z, 4.5, 2.0); if (pts) await walk(page, pts, { timeout: 30000 }); }
    if (!(await st(page)).battle) await page.keyboard.press('Space');
    await until(page, () => !!WOS.combat.pt.target, null, 4000);
    await wait(page, 1200);
    s = await st(page);
    const btn = await page.evaluate(() => WOS.hud.el.attack.dataset.mode);
    await shot(page, 'forest_whistle');
    check('đang đánh: nút lớn là huýt sáo đỏ', s.battle && btn === 'return', btn);
    const fpsFight = s.fps;
    await page.keyboard.press('Space'); await wait(page, 400);
    s = await st(page);
    check('Space = huýt sáo: dừng trận, đồng hành về cạnh người chơi', !s.battle && !s.target && Math.hypot(s.sx - s.x, s.sz - s.z) < 2.5, `battle ${s.battle} target ${s.target} d ${Math.hypot(s.sx - s.x, s.sz - s.z).toFixed(2)}`);
    check('fps >= 30 khi đánh', fpsFight >= 30, fpsFight);
    const resp = await until(page, () => WOS.combat.events.some(e => e.kind === 'respawn'), null, 15000);
    check('slime hoang sinh lại', resp);
    s = await st(page);
    check('không có lỗi WOS.errors', s.errors.length === 0, s.errors.join(' | '));
    await ctx.close();

    console.log('mobile.html: cần ảo + nút đánh / huýt sáo trong rừng');
    const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pre2 = { ...PRESET, duel: true };
    await mctx.addInitScript(p => { if (!sessionStorage.getItem('wosPreset')) { sessionStorage.setItem('wosPreset', '1'); localStorage.setItem('wos.save', p); } }, JSON.stringify(pre2));
    const mp = await mctx.newPage(); watch(mp);
    await mp.goto(BASE + 'mobile.html' + Q('&map=shadow_forest_entrance&at=44,30'));
    await mp.waitForFunction(() => window.__ready && WOS.combat.mons.length > 0, null, { timeout: 120000 });
    await wait(mp, 1500);
    const cdp = await mctx.newCDPSession(mp);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const joy = await mp.evaluate(() => { const r = WOS.hud.el.joyArea.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 4 }; });
    const p0 = await st(mp);
    await touch('touchStart', [{ x: joy.x, y: joy.y, id: 1 }]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: joy.x - joy.r * i / 8, y: joy.y, id: 1 }]); await wait(mp, 40); }
    await wait(mp, 700); await touch('touchEnd', []);
    const p1 = await st(mp);
    check('cần ảo: đi sang trái', p1.x < p0.x - 1, p0.x + ' -> ' + p1.x);
    const tapAct = async act => { const b = await mp.evaluate(a => { const r = document.querySelector('[data-act="' + a + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, act);
      await touch('touchStart', [{ x: b.x, y: b.y, id: 2 }]); await wait(mp, 80); await touch('touchEnd', []); await wait(mp, 200); };
    const mm = await nearestMon(mp);
    if (mm && mm.d > 5) {   // tới gần bằng cần ảo theo hướng con gần nhất
      const ang = Math.atan2(mm.z - p1.z, mm.x - p1.x);
      await touch('touchStart', [{ x: joy.x, y: joy.y, id: 1 }]);
      await touch('touchMove', [{ x: joy.x + Math.cos(ang) * joy.r, y: joy.y - Math.sin(ang) * joy.r, id: 1 }]);
      await wait(mp, Math.min(4000, (mm.d - 4) / 3.6 * 1000)); await touch('touchEnd', []);
    }
    await tapAct('interactAttack');
    const meng = await until(mp, () => !!WOS.combat.pt.target && WOS.state.battle, null, 5000);
    await wait(mp, 1000); await shot(mp, 'mobile_fight');
    const mmode = await mp.evaluate(() => WOS.hud.el.attack.dataset.mode);
    check('mobile: chạm nút đánh -> đồng hành đánh, nút thành huýt sáo', meng && mmode === 'return', mmode);
    await tapAct('interactAttack');
    const ms = await st(mp);
    check('mobile: chạm huýt sáo -> dừng trận', !ms.battle && !ms.target, `battle ${ms.battle}`);
    check('mobile: không có lỗi WOS.errors', ms.errors.length === 0, ms.errors.join(' | '));
    await mctx.close();
    check('không có lỗi trang / console / HTTP', problems.length === 0, problems.slice(0, 6).join(' | '));
  } finally {
    clearTimeout(kill);
    await browser.close();
  }
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
