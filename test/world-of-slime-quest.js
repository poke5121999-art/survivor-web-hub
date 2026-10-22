/*
 * Thế Giới Slime (games/world-of-slime): chuỗi nhiệm vụ mở đầu "Village of Rough Waves" chơi bằng phím/chuột thật từ bản
 * lưu trống (?fresh): q1 An Unfamiliar Place (Amy) -> q2 Allen of Larus Storage -> q3 Heal the Slime (89 Vàng) -> q4 The Herb
 * in the Box (hộp rỗng cạnh nhà Benjamin, hộp có Thảo mộc cạnh quầy Vivian) -> q5 Hidden Power (Tiềm năng, Learn SP 1, Level Up)
 * -> q6 Talk with Lucy -> q7 nhận, Rudga chặn cổng tây + thông báo "chưa có" -> Vivian bán 3 Cube (500) -> tải lại trang,
 * bản lưu còn. Kiểm: chữ HUD theo dõi nhiệm vụ, băng chữ, log EXP, Vàng, không lỗi trang / console / HTTP >= 400.
 * Ảnh chụp từng bước vào D:\wos-ref\proof\quest\web\ (so với khung clip bằng skill parity-compare).
 *
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   node test/world-of-slime-quest.js
 * Trên Pages: WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-quest.js
 * Biến: WOS_BASE, WOS_ASSETS (rỗng = asset Pages), WOS_SHOTS (mặc định D:/wos-ref/proof/quest/web; "" = không chụp).
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/quest/web' : process.env.WOS_SHOTS;
const Q = s => (ASSETS ? '&assets=' + encodeURIComponent(ASSETS) : '') + s;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };
const wait = (page, ms) => page.waitForTimeout(ms);
const st = page => page.evaluate(() => {
  const E = WOS.quest, sv = E.save;
  const qi = document.querySelector('[data-hud="questItem"]'), qe = document.querySelector('[data-hud="questEmpty"]');
  return { map: String(WOS.map.data.id), x: +WOS.P.x.toFixed(2), z: +WOS.P.z.toFixed(2), switching: !!WOS.switching, modal: WOS.state.modal,
    tracker: qi ? qi.innerText.replace(/\s+/g, ' ').trim() : qe ? qe.innerText.trim() : '', gold: sv.gold, level: sv.level, sp: sv.sp, exp: sv.exp,
    items: sv.items, quests: Object.fromEntries(Object.entries(sv.quests).map(([k, v]) => [k, v.s])), warn: WOS.state.warnStamina,
    interact: WOS.hud.el.interact.hidden ? null : WOS.hud.el.interact.dataset.k, errors: WOS.errors.slice(),
    events: E.events.map(e => e.kind + (e.q ? ':' + e.q : '') + (e.n != null ? ':' + e.n : '') + (e.level ? ':' + e.level : '')) };
});

// BFS trên ô 0.5 m tới ô đi được gần (tx, tz) nhất trong vòng [minD, near] m; trả các điểm rẽ (toạ độ Unity)
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
const waitMap = (page, id, ms = 30000) => page.waitForFunction(id => String(WOS.map.data.id) === id && !WOS.switching && WOS.npcs.length > 0, id, { timeout: ms }).then(() => true, () => false);
async function goTo(page, label, tx, tz, near, minD, opts) {
  const pts = await plan(page, tx, tz, near, minD);
  check('có đường tới ' + label, !!pts, pts ? pts.length + ' điểm' : 'không có');
  if (pts && pts.length) await walk(page, pts, opts);
  else if (pts) { /* đã ở đó */ }
  return pts;
}
// đi qua cửa: tới gần cửa rồi bước vào vùng cửa
async function door(page, label, tx, tz, push, id) {
  const pts = await plan(page, tx, tz, 0.6);
  if (pts) { pts.push(push); await walk(page, pts, { untilMap: id, timeout: 70000 }); }
  const ok = await waitMap(page, id);
  check(label, ok, (await st(page)).map);
  await wait(page, 600);
}

// đọc hội thoại: Space chạy hết dòng / sang dòng; gặp lựa chọn thì lấy picks lần lượt (chuột hoặc mũi tên + Space)
async function converse(page, picks = [], { shots = {}, mouse = false, max = 60 } = {}) {
  const seen = [];
  for (let n = 0; n < max; n++) {
    const d = await page.evaluate(() => { const s = WOS.story.dlg; if (!s) return null;
      return { id: s.id, typing: !!s.timer, choices: s.choices ? s.choices.length : 0, speaker: s.D.root.dataset.speaker, text: s.D.tw.innerText, illust: !s.D.illust.hidden }; });
    if (!d) return seen;
    if (!seen.length || seen[seen.length - 1].id !== d.id) seen.push(d);
    if (shots[d.id]) {
      if (d.typing) { await wait(page, 150); continue; }
      await wait(page, d.choices ? 350 : 150); await shot(page, shots[d.id]); delete shots[d.id];
    }
    if (d.typing) { await page.keyboard.press('Space'); await wait(page, 90); continue; }
    if (d.choices) {
      const k = picks.length ? picks.shift() : 0;
      if (mouse) {
        const els = await page.$$('[data-hud="choice"]'); const b = await els[k].boundingBox();
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      } else {
        for (let i = 0; i < k; i++) { await page.keyboard.press('ArrowDown'); await wait(page, 40); }
        await page.keyboard.press('Space');
      }
      await wait(page, 150); continue;
    }
    await page.keyboard.press('Space'); await wait(page, 140);
  }
  return seen;
}
async function interact(page, kind, label) {
  const ok = await page.waitForFunction(k => !WOS.hud.el.interact.hidden && WOS.hud.el.interact.dataset.k === k, kind, { timeout: 6000 }).then(() => true, () => false);
  check('nút tương tác hiện (' + label + ')', ok, kind);
  await page.keyboard.press('Space');
  return page.waitForFunction(() => !!WOS.story.dlg, null, { timeout: 4000 }).then(() => true, () => false);
}
const fxText = page => page.evaluate(() => [...document.querySelectorAll('[data-hud="questStart"],[data-hud="questComplete"],[data-hud="levelUp"],[data-hud="placeTitle"],[data-hud="log"]')]
  .map(e => e.dataset.hud + ':' + (e.dataset.title || e.dataset.level || e.dataset.text || '')));
async function fxSeen(page, want, ms = 9000) {      // đợi băng chữ / log xuất hiện trong DOM (chúng tự tắt sau ~2.6 s)
  const t0 = Date.now(); const got = new Set();
  while (Date.now() - t0 < ms) { for (const f of await fxText(page)) got.add(f); if (want.every(w => [...got].some(g => g.includes(w)))) break; await wait(page, 120); }
  return [...got];
}

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const kill = setTimeout(() => { console.log('FAIL timeout 840 s'); process.exit(2); }, 840000);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('requestfailed', r => { if (!/\.ogg$/.test(r.url()) || !/ERR_ABORTED/.test((r.failure() || {}).errorText)) problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText); });
    page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
    await page.goto(BASE + 'index.html?fresh' + Q(''));
    await page.waitForFunction(() => window.__ready || (window.__wosErrors || []).length, null, { timeout: 120000 });
    await waitMap(page, '257', 20000);
    await page.mouse.click(640, 300);
    await wait(page, 1500);
    let s = await st(page);
    console.log('Mở game từ bản lưu trống');
    check('chưa có nhiệm vụ: "Không có nhiệm vụ."', s.tracker === 'Không có nhiệm vụ.', s.tracker);
    check('cảnh báo thể lực thấp lúc tỉnh dậy (1:12)', s.warn === true);
    check('Vàng mở đầu 10,000', s.gold === 10000, s.gold);
    await shot(page, '01_wake');

    console.log('q1 An Unfamiliar Place: đi tới Amy');
    await goTo(page, 'Amy', 26.7, 27.8, 2.0, 1.0);
    let fx = await fxSeen(page, ['questStart:Nơi Xa Lạ'], 4000);
    s = await st(page);
    // băng q1 hiện lúc mới đi được 2 m và tắt trước khi tới Amy: kiểm sự kiện; băng của q2..q7 kiểm trong DOM bên dưới
    check('nhiệm vụ 1 bắt đầu khi rời giường (sự kiện start:q1)', s.events.includes('start:q1'), fx.join(','));
    check('HUD theo dõi "Nơi Xa Lạ / Nói chuyện với Amy"', /Nơi Xa Lạ.*Nói chuyện với Amy/.test(s.tracker), s.tracker);
    await shot(page, '02_q1_tracker');
    check('mở hội thoại Amy bằng Space', await interact(page, 'npc', 'Amy'));
    let seen = await converse(page, [0, 0, 0, 0, 0, 0], { shots: { amy1: '03_amy_line', amy2: '04_amy_choices', amy14: '05_amy_tutorial' } });
    check('Amy nói đủ mạch 1:23-1:44', ['amy1', 'amy2', 'amy6', 'amy12', 'amy14', 'amy15'].every(i => seen.some(d => d.id === i)), seen.map(d => d.id).join(','));
    check('thẻ hướng dẫn Chữa Slime ở dòng "…trong nháy mắt"', seen.some(d => d.id === 'amy14' && d.illust));
    fx = await fxSeen(page, ['questComplete:Nơi Xa Lạ', 'questStart:Allen Ở Kho Larus']);
    await shot(page, '06_q1_complete');
    s = await st(page);
    check('băng hoàn thành q1 + bắt đầu q2', fx.some(f => f === 'questComplete:Nơi Xa Lạ') && fx.some(f => f === 'questStart:Allen Ở Kho Larus'), fx.join(','));
    check('log "EXP Người Chơi + 10"', fx.some(f => /log:EXP Người Chơi\+ 10/.test(f)), fx.filter(f => f.startsWith('log')).join(','));
    check('HUD theo dõi "Allen Ở Kho Larus / Nói chuyện với Allen"', /Allen Ở Kho Larus.*Nói chuyện với Allen/.test(s.tracker), s.tracker);

    console.log('q2: quán trọ -> làng -> kho');
    await door(page, 'ra làng (110)', 33.0, 20.0, [36, 20], '110');
    fx = await fxSeen(page, ['placeTitle:Larus Village'], 3000);
    check('băng tên bản đồ "Larus Village"', fx.includes('placeTitle:Larus Village'), fx.join(','));
    await shot(page, '07_village_title');
    await door(page, 'vào kho (478)', 83.5, 92.0, [83.5, 94], '478');
    await shot(page, '08_storage_title');
    await goTo(page, 'Allen', 32.5, 41.0, 3.6, 1.0);
    s = await st(page);
    check('dấu ✓ trên đầu Allen', await page.evaluate(() => { const t = WOS.hud.npcTags.find(t => t.name === 'Allen'); return t && t.mk.dataset.k; }) === 'complete');
    await shot(page, '09_allen_marker');
    check('mở hội thoại Allen', await interact(page, 'npc', 'Allen'));
    seen = await converse(page, [0, 0, 0], { shots: { al1q2: '10_allen_choices' } });
    s = await st(page);
    check('q2 xong, q3 Chữa Cho Slime đang làm', s.quests.q2 === 'done' && s.quests.q3 === 'active', JSON.stringify(s.quests));
    await wait(page, 300);
    check('HUD "Chữa Cho Slime / Chữa slime 0/1"', /Chữa Cho Slime.*Chữa slime 0\/1/.test(s.tracker), s.tracker);

    console.log('q3 Heal the Slime: chữa 89 Vàng');
    await interact(page, 'npc', 'Allen');
    seen = await converse(page, [1, 0], { mouse: true, shots: { alH: '11_heal_cost' } });
    s = await st(page);
    check('Vàng 10,000 -> 9,911 sau khi chữa', s.gold === 9911, s.gold);
    check('cảnh báo thể lực tắt', s.warn === false);
    check('HUD "Chữa slime 1/1"', /Chữa slime 1\/1/.test(s.tracker), s.tracker);
    await shot(page, '12_healed');
    await interact(page, 'npc', 'Allen');
    seen = await converse(page, [0, 0, 0]);
    fx = await fxSeen(page, ['questComplete:Chữa Cho Slime', 'log:EXP Người Chơi+ 40', 'questStart:Thảo Mộc Trong Hộp']);
    await shot(page, '13_q3_complete_exp40');
    s = await st(page);
    check('log "EXP Người Chơi + 40" (2:57)', fx.some(f => f === 'log:EXP Người Chơi+ 40'), fx.join(','));
    check('HUD "Thảo Mộc Trong Hộp / Thảo mộc 0/1"', /Thảo Mộc Trong Hộp.*Thảo mộc 0\/1/.test(s.tracker), s.tracker);

    console.log('Nhật ký nhiệm vụ (J)');
    await page.keyboard.press('KeyJ'); await wait(page, 900);
    const ql = await page.evaluate(() => ({ title: (document.querySelector('[data-hud="questDetailTitle"]') || {}).textContent, obj: [...document.querySelectorAll('[data-hud="questObjective"]')].map(e => e.innerText.trim()), rows: document.querySelectorAll('[data-hud="questRow"]').length }));
    check('nhật ký: chi tiết "Thảo Mộc Trong Hộp", mục "Thảo mộc 0/1"', ql.title === 'Thảo Mộc Trong Hộp' && ql.obj[0] === 'Thảo mộc 0/1', JSON.stringify(ql));
    await shot(page, '14_questlog');
    await page.click('[data-hud="questTab"][data-tab="done"]'); await wait(page, 400);
    const done = await page.evaluate(() => document.querySelectorAll('[data-hud="questRow"]').length);
    check('tab Hoàn Thành có 3 nhiệm vụ', done === 3, done);
    await page.keyboard.press('Escape'); await wait(page, 300);

    console.log('q4 The Herb in the Box: hộp rỗng rồi hộp cạnh Vivian');
    await door(page, 'ra làng', 32.5, 20.0, [32.5, 19.6], '110');
    await goTo(page, 'hộp cạnh nhà Benjamin', 37.6, 52.6, 1.9, 1.0);
    await shot(page, '15_box_magnifier');
    check('xem hộp (kính lúp)', await interact(page, 'box', 'hộp 1'));
    seen = await converse(page, [0], { shots: { bx1: '16_box_dialog' } });
    s = await st(page);
    check('hộp 1 rỗng: "Bên trong không có gì."', seen.some(d => d.id === 'bxEmpty') && !(s.items[773] > 0), seen.map(d => d.id).join(','));
    await goTo(page, 'hộp cạnh quầy Vivian', 42.2, 71.0, 1.9, 1.0);
    check('xem hộp 3', await interact(page, 'box', 'hộp Vivian'));
    seen = await converse(page, [0]);
    fx = await fxSeen(page, ['log:Thảo mộc × 1'], 3000);
    s = await st(page);
    check('nhận "Thảo mộc × 1", HUD "Thảo mộc 1/1"', s.items[773] === 1 && /Thảo mộc 1\/1/.test(s.tracker), s.tracker + ' ' + fx.join(','));
    await shot(page, '17_herb');

    console.log('q4 trả Allen -> q5 Hidden Power (Tiềm năng)');
    await door(page, 'vào kho', 83.5, 92.0, [83.5, 94], '478');
    await goTo(page, 'Allen', 32.5, 41.0, 3.6, 1.0);
    await interact(page, 'npc', 'Allen');
    seen = await converse(page, [0]);
    const perkOpen = await page.waitForFunction(() => WOS.state.modal === 'perk', null, { timeout: 4000 }).then(() => true, () => false);
    s = await st(page);
    check('q4 xong (+40) -> Lv2, 1 SP, bảng Tiềm năng mở', perkOpen && s.quests.q4 === 'done' && s.level === 2 && s.sp === 1, `lv ${s.level} sp ${s.sp} ${s.modal}`);
    await shot(page, '18_perk_open');
    const nb = await (await page.$('[data-hud="perkNode"]')).boundingBox();
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); await wait(page, 300);
    const lb = await (await page.$('[data-hud="perkLearn"]')).boundingBox();
    await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2); await wait(page, 300);
    let perk = await page.evaluate(() => ({ lv: document.querySelector('[data-hud="perkLevel"]').textContent, sp: document.querySelector('[data-hud="perkSP"]').textContent }));
    check('Learn SP 1: nút 1/3, Tiềm năng còn 0', perk.lv === '1/3' && perk.sp === '0', JSON.stringify(perk));
    await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2); await wait(page, 250);
    const toast = await page.evaluate(() => WOS.hud.el.toast.hidden ? '' : WOS.hud.el.toastText.textContent);
    check('học lần 2: "Không đủ tiềm năng. Học kỹ năng thất bại."', toast === 'Không đủ tiềm năng. Học kỹ năng thất bại.', toast);
    await shot(page, '19_perk_learned');
    const cb = await (await page.$('[data-hud="perk"] [data-hud="close"]')).boundingBox();
    await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    fx = await fxSeen(page, ['questComplete:Thảo Mộc Trong Hộp', 'levelUp:2', 'questStart:Sức Mạnh Tiềm Ẩn'], 11000);
    check('băng hoàn thành q4, Lên cấp 2, bắt đầu "Sức Mạnh Tiềm Ẩn"', ['questComplete:Thảo Mộc Trong Hộp', 'levelUp:2', 'questStart:Sức Mạnh Tiềm Ẩn'].every(w => fx.includes(w)), fx.join(','));
    s = await st(page);
    check('HUD "Sức Mạnh Tiềm Ẩn / Đánh thức tiềm năng 1/1"', /Sức Mạnh Tiềm Ẩn.*Đánh thức tiềm năng 1\/1/.test(s.tracker), s.tracker);
    await interact(page, 'npc', 'Allen');
    seen = await converse(page, [0, 0, 0]);
    fx = await fxSeen(page, ['questComplete:Sức Mạnh Tiềm Ẩn', 'questStart:Nói Chuyện Với Lucy']);
    await shot(page, '20_q5_complete');
    s = await st(page);
    check('q5 xong (+10), q6 Nói Chuyện Với Lucy', s.quests.q5 === 'done' && /Nói Chuyện Với Lucy/.test(s.tracker), s.tracker);

    console.log('q6 Talk with Lucy');
    await door(page, 'ra làng', 32.5, 20.0, [32.5, 19.6], '110');
    await goTo(page, 'Lucy', 65.8, 76.0, 2.0, 1.0);
    check('dấu ✓ trên đầu Lucy', await page.evaluate(() => { const t = WOS.hud.npcTags.find(t => t.name === 'Lucy'); return t && t.mk.dataset.k; }) === 'complete');
    await interact(page, 'npc', 'Lucy');
    seen = await converse(page, [0, 0], { shots: { lu2: '21_lucy' } });
    fx = await fxSeen(page, ['questComplete:Nói Chuyện Với Lucy', 'questStart:Giúp Lucy']);
    s = await st(page);
    check('q6 xong, q7 "Giúp Lucy" 0/2 + 0/1', s.quests.q6 === 'done' && /Giúp Lucy.*Hạ Junior Floralime 0\/2.*Mảnh slime nhỏ 0\/1/.test(s.tracker), s.tracker);
    await shot(page, '22_q7_tracker');

    console.log('Rudga chặn cổng tây');
    const gp = await plan(page, 21.0, 58.5, 0.8);
    check('có đường tới cổng tây', !!gp);
    if (gp) await walk(page, gp, { untilModal: true, timeout: 70000 });
    const ru = await page.waitForFunction(() => WOS.story.dlg && WOS.story.dlg.D.root.dataset.speaker === 'Rudga', null, { timeout: 8000 }).then(() => true, () => false);
    check('Rudga mở hội thoại khi bước ra cổng', ru);
    seen = await converse(page, [0], { shots: { ru1: '23_rudga', ru4: '24_rudga_whistle' } });
    check('Rudga nói 3 dòng + thẻ Huýt Sáo', ['ru1', 'ru2', 'ru3', 'ru4'].every(i => seen.some(d => d.id === i)) && seen.some(d => d.id === 'ru4' && d.illust), seen.map(d => d.id).join(','));
    const nt = await page.waitForSelector('[data-hud="popup"]', { timeout: 4000 }).then(() => true, () => false);
    await shot(page, '25_notbuilt');
    check('thông báo "Chưa có trong bản web"', nt && /Chưa có trong bản web/.test(await page.innerText('[data-hud="popup"]')));
    await page.click('[data-hud="popupBtn"]'); await wait(page, 500);
    s = await st(page);
    check('bị đẩy về làng (x 29.5), vẫn ở 110', s.map === '110' && Math.abs(s.x - 29.5) < 0.6 && !s.modal, s.map + ' ' + s.x + ',' + s.z);

    console.log('Vivian bán 3 Cube');
    await goTo(page, 'Vivian', 33.4, 73.0, 4.6, 1.0);
    check('mở hội thoại Vivian', await interact(page, 'npc', 'Vivian'));
    seen = await converse(page, [0, 0], { shots: { vi1: '26_vivian' } });
    const shop = await page.waitForFunction(() => WOS.state.modal === 'shop', null, { timeout: 4000 }).then(() => true, () => false);
    check('quầy hàng mở sau "Mua"', shop);
    await wait(page, 600); await shot(page, '27_shop');
    let sh = await page.evaluate(() => ({ gold: document.querySelector('[data-hud="shopGold"]').textContent, bag: document.querySelector('[data-hud="shopBag"]').textContent }));
    check('quầy: Vàng 9,911, Túi 0/28', sh.gold === '9,911' && sh.bag === '0/28', JSON.stringify(sh));
    await page.click('[data-hud="shopBuy"]'); await wait(page, 400);
    await page.click('[data-hud="buyPlus"]'); await wait(page, 120); await page.click('[data-hud="buyPlus"]'); await wait(page, 200);
    const bp = await page.evaluate(() => ({ n: document.querySelector('[data-hud="buyCount"]').textContent, c: document.querySelector('[data-hud="buyCost"]').textContent }));
    check('Mua: số lượng 3, giá 1,500', bp.n === '3' && bp.c === '1,500', JSON.stringify(bp));
    await shot(page, '28_buy_popup');
    await page.click('[data-hud="buyOk"]'); await wait(page, 400);
    await shot(page, '29_confirm');
    await page.click('[data-hud="popupBtn"][data-v="true"]'); await wait(page, 350);
    await shot(page, '30_thanks');
    sh = await page.evaluate(() => ({ gold: document.querySelector('[data-hud="shopGold"]').textContent, bag: document.querySelector('[data-hud="shopBag"]').textContent,
      owned: document.querySelector('[data-hud="shopOwned"]').textContent, toast: (document.querySelector('[data-hud="npcToast"]') || {}).innerText }));
    s = await st(page);
    check('"Cảm ơn quý khách!", Vàng 8,411, Cube 3, Túi 1/28', sh.gold === '8,411' && s.gold === 8411 && sh.owned === '3' && s.items[4] === 3 && sh.bag === '1/28' && /Cảm ơn quý khách!/.test(sh.toast || ''), JSON.stringify(sh));
    await page.keyboard.press('Escape'); await wait(page, 500);

    s = await st(page);
    check('không có lỗi WOS.errors', s.errors.length === 0, s.errors.join(' | '));
    check('không có lỗi trang / console / HTTP', problems.length === 0, problems.slice(0, 6).join(' | '));
    console.log('Sự kiện: ' + s.events.filter(e => /^(start|complete|levelup|heal|buy)/.test(e)).join(' '));

    console.log('Tải lại trang: bản lưu (localStorage wos.save v1) còn nguyên');
    await page.goto(BASE + 'index.html?x=1' + Q(''));
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    await wait(page, 1200);
    s = await st(page);
    check('sau tải lại: q7 đang làm, Lv2, Vàng 8,411, Cube 3', s.quests.q7 === 'active' && s.level === 2 && s.gold === 8411 && s.items[4] === 3 && /Giúp Lucy/.test(s.tracker), s.tracker + ' ' + s.gold);
    await ctx.close();
  } finally {
    clearTimeout(kill);
    await browser.close();
  }
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
