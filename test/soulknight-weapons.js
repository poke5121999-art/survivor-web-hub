/*
 * Kiểm thử vũ khí + đạn của Hiệp Sĩ Linh Hồn (games/soulknight) theo dữ liệu thật 8.6 (data/sk-weapons86.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-weapons.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-weapons/.
 *
 * Số kỳ vọng là số đọc tay từ D:\sk86-ref\decoded (weapons.json, luban pseudorandom_tbweapongroup, localization_en_vi)
 * và từ mô phỏng Animator (tools/weapons86): AK-47 bắn 6 phát/giây, Gatling 4 viên × 10 lần/giây...
 * index.html chưa có thẻ data/sk-weapons86.js thì kiểm thử tự chèn (ghi chú trong kết quả).
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-weapons');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Số thật [ĐO decoded/weapons.json + MB súng weapon.ab]; rps = weapon_speed × sự kiện Attack / chu kỳ clip giữ nút.
const REAL = {
  bad_pistol: { prefab: 'weapon_000', vi: 'Súng Ngắn Cũ', dmg: 3, cost: 0, crit: 0, spread: 5, rps: 3, bulletSpeed: 36, bullet: 'bullet_0' },
  ak_47: { prefab: 'weapon_002', vi: 'AK47', dmg: 3, cost: 1, crit: 12, spread: 10, rps: 6, bulletSpeed: 40, bullet: 'bullet_14' },
  shotgun: { prefab: 'weapon_003', vi: 'Súng Đạn Ria', dmg: 3, cost: 3, crit: 0, spread: 25, rps: 1.2, pellets: 5, bullet: 'bullet_14' },
  gatling_gun: { prefab: 'weapon_041', vi: 'Súng Gatling', dmg: 2, cost: 2, spread: 20, rps: 10, pellets: 4 },
  broadsword: { prefab: 'weapon_063', vi: 'Dao Lớn', dmg: 12, cost: 0, rps: 1.5, bullet: 'sword_2_5' },
  staff_of_thunder: { prefab: 'weapon_114', vi: 'Gậy Sấm Chớp', dmg: 4, cost: 4, rps: 1.5, pellets: 13 },
  bow: { prefab: 'weapon_080', vi: 'Cung', dmg: 4, cost: 2, charge: 0.6 },
  bazooka: { prefab: 'weapon_111', dmg: 8, cost: 4, rps: 1, bullet: 'bullet_28' }
};
const POOL1 = ['ak_47', 'shotgun', 'weapon_109', 'magic_staff', 'weapon_lighter']; // [ĐO WG_level1: weapon_002/003/109/112/lighter]

function stage(dist) {
  const G = SK.G, p = G.player;
  G.pickups = []; G.bullets = []; G.vfx = [];
  let i = 0;
  for (const e of G.enemies) {
    if (e.st === 'dead' && !e._keep) continue;
    e.st = 'stun'; e.stT = 30; e.kx = e.ky = 0; e._keep = 1;
    e.hp = e.hpMax = 999;
    e.x = p.x + dist + (i % 2) * 6; e.y = p.y + ((i % 3) - 1) * 5;
    i++;
  }
  p.energy = p.energyMax;
  return i;
}
async function snap(p, name) {
  await p.evaluate(() => { window.__st = SK.G.state; SK.G.state = 'frozen'; });
  await sleep(60);
  await p.screenshot({ path: path.join(SHOTS, name + '.png'), clip: { x: 360, y: 180, width: 560, height: 360 } });
  await p.evaluate(() => { SK.G.state = window.__st; });
}

async function main(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  let injected = false;
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.route('**/games/soulknight/index.html', async route => {
    const r = await route.fetch(); let t = await r.text();
    if (!/sk-weapons86/.test(t)) { injected = true; t = t.replace('<script src="js/design.js', '<script src="data/sk-weapons86.js"></script>\n<script src="js/design.js'); }
    route.fulfill({ response: r, body: t, headers: Object.assign({}, r.headers(), { 'content-type': 'text/html; charset=utf-8' }) });
  });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => SK_GAME.debug.seed(20260929));
  await p.click('#sk-start');
  await p.waitForFunction(() => SK_GAME.state === 'stage', null, { timeout: 5000 });
  await p.evaluate(() => { SK_GAME.debug.god(true); window.__fires = 0; SK.on('fire', () => { window.__fires++; }); return SK.vfx && SK.vfx.load(); });
  if (injected) results.push('  (index.html chưa có <script src="data/sk-weapons86.js">: kiểm thử tự chèn)');

  // ---- dữ liệu
  const inv = await p.evaluate(REAL => {
    const X = window.SK_W86, out = { bad: [], mism: [], missingWiki: [] };
    if (!X) return null;
    for (const id of Object.keys(SK_WIKI.weapons)) if (!SK_DESIGN.weapons[id]) out.missingWiki.push(id);
    for (const [id, d] of Object.entries(SK_DESIGN.weapons)) {
      if (id === '_claw') continue;
      if (!SK.frame(d.sprite)) out.bad.push(id + ':sprite ' + d.sprite);
      if (d.w86 && !SK.WEAPON_KINDS[d.kind]) out.bad.push(id + ':kind ' + d.kind);
      if (d.w86 && d.bullet && !X.bullets[d.bullet]) out.bad.push(id + ':đạn ' + d.bullet);
    }
    for (const [id, r] of Object.entries(REAL)) {
      const d = SK_DESIGN.weapons[id];
      if (!d) { out.mism.push(id + ': thiếu'); continue; }
      for (const k of Object.keys(r)) {
        const v = k === 'vi' ? d.name : d[k];
        if (typeof r[k] === 'number' ? Math.abs(v - r[k]) > 0.02 : v !== r[k]) out.mism.push(id + '.' + k + ' ' + v + ' ≠ ' + r[k]);
      }
    }
    out.n = Object.keys(SK_DESIGN.weapons).length;
    out.wiki = Object.keys(SK_WIKI.weapons).length;
    out.heroes = Object.entries(SK_DESIGN.heroes).map(([f, h]) => [f, h.weapon, !!(SK_DESIGN.weapons[h.weapon] && SK_DESIGN.weapons[h.weapon].prefab)]);
    out.pool1 = [...new Set(SK_DESIGN.weaponPools['1'])];
    out.draw = [...new Set(Array.from({ length: 300 }, () => SK.pick(SK.weaponPool(1, 'chest'))))];
    out.fx = X.bullets.bullet_14 && X.bullets.bullet_14.fx && !!X.fx.bullet_14;
    return out;
  }, REAL);
  check('data/sk-weapons86.js đã nạp (SK_W86)', !!inv);
  if (!inv) { await ctx.close(); return; }
  check('mọi vũ khí có sprite trong atlas, kind có hàm bắn, prefab đạn có dữ liệu', inv.bad.length === 0,
    inv.n + ' món' + (inv.bad.length ? ' · lỗi ' + inv.bad.slice(0, 6).join(', ') : ''));
  check('vũ khí wiki còn dùng được (trừ món 8.6 không có)', inv.missingWiki.length <= 1 && inv.missingWiki.every(x => x === 'laser_plunger'),
    (inv.wiki - inv.missingWiki.length) + '/' + inv.wiki + (inv.missingWiki.length ? ' · thiếu ' + inv.missingWiki.join(',') : ''));
  check('số thật 8.6: sát thương, năng lượng, crit, độ lệch, tốc bắn, số viên, tên Việt chính thức', inv.mism.length === 0,
    inv.mism.length ? inv.mism.slice(0, 8).join(' · ') : Object.keys(REAL).join(', '));
  const badHero = inv.heroes.filter(h => !h[2]);
  check('42 nhân vật cầm vũ khí khởi đầu thật (weapon_init_*), Hiệp Sĩ = Súng Ngắn Cũ',
    inv.heroes.length === 42 && !badHero.length && inv.heroes.find(h => h[0] === 'knight')[1] === 'bad_pistol',
    inv.heroes.length + ' nhân vật' + (badHero.length ? ' · thiếu ' + badHero.map(h => h[0]).join(',') : ''));
  check('rương 1-x = bể WG_level1 (33 món) [ĐO luban]', inv.pool1.length === 33 && POOL1.every(x => inv.pool1.indexOf(x) >= 0) &&
    inv.draw.every(x => inv.pool1.indexOf(x) >= 0), inv.pool1.length + ' món, bốc 300 lần ra ' + inv.draw.length + ' món khác nhau');

  // ---- vào phòng đánh
  await p.evaluate(() => SK_GAME.debug.teleportTo('battle'));
  await p.waitForFunction(() => SK_GAME.enemyCount > 0, null, { timeout: 5000 }).catch(() => {});
  await sleep(900);
  check('vào phòng đánh 1-1, có quái', await p.evaluate(() => SK_GAME.enemyCount > 0), 'số quái ' + await p.evaluate(() => SK_GAME.enemyCount));

  // AK-47: giữ 1 s thật -> ~6 phát (chu kỳ clip w_m4 0,1667 s), đạn bullet_14 có hình vfx, trúng -> hit_orange, súng giật (clip).
  await p.evaluate(() => { SK_GAME.debug.give('ak_47'); });
  await p.evaluate(stage, 90);
  await sleep(100);
  let before = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, en: SK.G.player.energy, f: window.__fires }));
  const seen = await p.evaluate(() => { window.__seen = { b: {}, vfx: {}, px: [] }; SK.on('fire', () => {}); return true; });
  await p.evaluate(() => {
    window.__probe = setInterval(() => {
      const G = SK.G;
      for (const b of G.bullets) if (b.v86) window.__seen.b[b.v86] = (window.__seen.b[b.v86] || 0) + (b.fxh ? 1 : 0);
      for (const h of G.vfx || []) window.__seen.vfx[h.name] = 1;
      const w = G.player.weapons[G.player.cur], P = SK.w86.pose(w), wn = P.find(q => q.n.n === 'w');
      if (wn) window.__seen.px.push(wn.M[4]);
    }, 16);
  });
  await p.keyboard.down('KeyJ');
  await sleep(250); await snap(p, 'ak47');
  await sleep(760);
  await p.keyboard.up('KeyJ');
  await sleep(700);
  let after = await p.evaluate(() => { clearInterval(window.__probe); return { hp: SK_GAME.enemyHp, en: SK.G.player.energy, f: window.__fires, seen: window.__seen }; });
  let fires = after.f - before.f;
  check('AK-47 giữ 1 s: 5–8 phát (6/giây thật), năng lượng −1/phát, máu quái giảm', fires >= 5 && fires <= 8 && before.en - after.en === fires && after.hp < before.hp,
    fires + ' phát · nl −' + (before.en - after.en) + ' · máu ' + before.hp + '→' + after.hp);
  check('đạn AK là prefab thật bullet_14 vẽ bằng SK.vfx, trúng đích ra hit_orange (RGBulletTrigger.hit_object)',
    after.seen.b.bullet_14 > 0 && after.seen.vfx['W:bullet_14'] && after.seen.vfx.hit_orange, Object.keys(after.seen.vfx).join(', '));
  const px = after.seen.px, minPx = Math.min(...px);
  check('súng giật theo clip w_m4 thật (nút w lùi về sau khi bắn)', minPx < -0.05 && Math.max(...px) <= 0.01, 'px nhỏ nhất ' + minPx.toFixed(3) + ' đơn vị');

  // Shotgun: một phát = 5 viên; Gatling: một lần = 4 viên. Đếm đạn 8.6 mới sinh trong phát đầu.
  for (const [id, n] of [['shotgun', 5], ['gatling_gun', 4], ['staff_of_thunder', 13]]) {
    await p.evaluate(id => { SK_GAME.debug.give(id); }, id);
    await p.evaluate(stage, 120);
    await sleep(80);
    await p.evaluate(() => { window.__nb = 0; window.__first = null; window.__cnt = setInterval(() => { const k = SK.G.bullets.filter(b => b.v86 && b.t < 0.05).length; if (k && window.__first == null) window.__first = k; }, 4); });
    await p.keyboard.down('KeyJ'); await sleep(id === 'staff_of_thunder' ? 420 : 60); await p.keyboard.up('KeyJ');
    await sleep(400);
    await snap(p, id);
    const k = await p.evaluate(() => { clearInterval(window.__cnt); return window.__first; });
    check(id + ': ' + n + ' viên mỗi phát [ĐO multiCount]', k === n, 'đếm ' + k);
  }

  // Bazooka: rocket nổ explode_hit_enemy (ExplodeEffectTrigger.creation), sát thương vùng 8 [ĐO Explode.damage].
  await p.evaluate(() => { SK_GAME.debug.give('bazooka'); });
  const nb = await p.evaluate(stage, 70);
  await sleep(80);
  before = await p.evaluate(() => ({ hp: SK_GAME.enemyHp }));
  await p.evaluate(() => { window.__vx = {}; window.__vp = setInterval(() => { for (const h of SK.G.vfx || []) window.__vx[h.name] = 1; }, 10); });
  await p.keyboard.down('KeyJ'); await sleep(60); await p.keyboard.up('KeyJ');
  await sleep(180); await snap(p, 'bazooka');
  await sleep(500);
  after = await p.evaluate(() => { clearInterval(window.__vp); return { hp: SK_GAME.enemyHp, vx: window.__vx }; });
  check('bazooka: nổ thật explode_hit_enemy, trúng cả đám (8 trực tiếp + 8 vùng mỗi con)', after.vx.explode_hit_enemy && before.hp - after.hp >= 8 * nb,
    'máu −' + (before.hp - after.hp) + ' (' + nb + ' quái) · ' + Object.keys(after.vx).filter(k => /explode|W:/.test(k)).join(', '));

  // Dao lớn: vệt chém sword_2_5 thật, trúng nhiều quái một nhát, xoá đạn địch trong vệt.
  await p.evaluate(() => { SK_GAME.debug.give('broadsword'); });
  const nm = await p.evaluate(stage, 20);
  await p.evaluate(() => {
    const G = SK.G, P = G.player;
    for (let i = 0; i < 3; i++) SK.spawnBullet86(G, 'e', 'bullet_e_1', P.x + 22, P.y - 8 + i * 4, Math.PI, { spd: 0.5, dmg: 1, h: 8 });
  });
  before = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, e: SK.G.bullets.filter(b => b.side === 'e').length }));
  await p.keyboard.down('KeyJ'); await sleep(140); await snap(p, 'broadsword'); await sleep(60); await p.keyboard.up('KeyJ');
  await sleep(500);
  after = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, e: SK.G.bullets.filter(b => b.side === 'e').length }));
  check('dao lớn: một nhát trúng nhiều quái (12 mỗi con), chém tan đạn địch', before.hp - after.hp >= 12 * Math.min(2, nm) && after.e < before.e,
    'máu −' + (before.hp - after.hp) + ' · đạn địch ' + before.e + '→' + after.e);

  // Cung: giữ đủ max_time 0,6 s rồi nhả. bulletsInfo[1] là phần cộng khi tụ đầy [ĐO Gun005.Attack]: tốc 30 + (int)(k×10).
  await p.evaluate(() => { SK_GAME.debug.give('bow'); });
  const speeds = [];
  for (const hold of [60, 800]) {
    await p.evaluate(stage, 150);
    await p.evaluate(() => { window.__sp = null; window.__bp = setInterval(() => { const b = SK.G.bullets.find(x => x.v86 === 'bullet_35'); if (b && window.__sp == null) window.__sp = Math.hypot(b.vx, b.vy); }, 4); });
    await p.keyboard.down('KeyJ'); await sleep(hold);
    if (hold > 100) await snap(p, 'bow-charge');
    await p.keyboard.up('KeyJ'); await sleep(250);
    speeds.push(await p.evaluate(() => { clearInterval(window.__bp); return window.__sp; }));
  }
  check('cung: nhả ngay tên 30 đơn vị/giây, tụ đủ 0,6 s tên 40 đơn vị/giây', speeds[0] && speeds[1] && near(speeds[0] / 16, 30, 3.01) && near(speeds[1] / 16, 40, 0.01),
    speeds.map(s => s && (s / 16).toFixed(1)).join(' → ') + ' đơn vị/giây');

  // Tia: Arbitrator bắn tia tức thì (RGShortLaser) trúng quái.
  await p.evaluate(() => { SK_GAME.debug.give('arbitrator'); });
  await p.evaluate(stage, 90);
  before = await p.evaluate(() => ({ hp: SK_GAME.enemyHp }));
  await p.keyboard.down('KeyJ'); await sleep(120); await snap(p, 'arbitrator'); await p.keyboard.up('KeyJ');
  await sleep(700);
  after = await p.evaluate(() => ({ hp: SK_GAME.enemyHp }));
  check('Trọng Tài: tia laser tức thì trúng quái', after.hp < before.hp, 'máu ' + before.hp + '→' + after.hp);

  // ---- độ lệch so với mã gốc 8.6 (tools/sk_method.py): bắn một lần qua SK.WEAPON_KINDS với ngẫu nhiên ghim ở cận trên
  // (SK.randf -> hi, SK.rand -> 0,49) để so với số đo cứng.
  const dv = await p.evaluate(() => {
    const G = SK.G, P = G.player, out = {};
    P.face = 1; P.aim = 0;
    const r0 = SK.randf, q0 = SK.rand, c0 = P.crit;
    P.crit = 0;   // crit của nhân vật = 0 để chỉ crit của đạn quyết định (rand 0,49 -> crit khi tỉ lệ ≥ 50)
    const one = (id, o) => {
      SK_GAME.debug.give(id);
      const w = P.weapons[P.cur];
      G.bullets = []; w.q = [];
      SK.randf = (a, b) => b; SK.rand = () => 0.49;
      try { SK.WEAPON_KINDS[w.def.kind].fire(G, P, w, Object.assign({ x: P.x + 40, y: P.y - 20, ang: 0 }, o)); }
      finally { SK.randf = r0; SK.rand = q0; }
      return G.bullets.filter(b => b.v86).map(b => ({ pf: b.v86, x: b.x - P.x, y: b.y - P.y, ang: b.ang * 180 / Math.PI, spd: Math.hypot(b.vx, b.vy) / 16,
        dmg: b.crit ? b.dmg / SK_DESIGN.rules.critMult : b.dmg, crit: b.crit, size: b.size, flip: b.flip, fxd: b.fxh ? (b.fxh.ang - b.ang) * 180 / Math.PI : null, fxf: b.fxh ? b.fxh.flip : null }));
    };
    out.ak = one('ak_47')[0];
    out.bubble = one('dormant_bubble_machine');
    out.sword = one('broadsword')[0];
    out.sword2 = one('broadsword', { flip: true })[0];
    out.shield = one('blade_shield')[0];
    out.bowFull = one('bow', { charge: 1 })[0];
    out.bowTap = one('bow', { charge: 0 })[0];
    out.staffFull = one('banishing_staff', { charge: 1 })[0];
    out.staffTap = one('banishing_staff', { charge: 0 })[0];
    out.rail = one('weapon_045', { charge: 1 })[0];
    out.railHalf = one('weapon_045', { charge: 0.5 })[0];
    out.flail = one('sacred_flail', { charge: 1 })[0];
    P.crit = c0;
    out.hand = { knight: SK_DESIGN.heroes.knight.hand, viking: SK_DESIGN.heroes.viking.hand };
    out.hx = P.x + SK_DESIGN.heroes[P.hero].hand[0] - P.x; out.hy = -SK_DESIGN.heroes[P.hero].hand[1];
    return out;
  });
  const n2 = (a, b) => Math.abs(a - b) < 0.01;
  check('độ lệch = ±deviation, không phải ±deviation/2: AK-47 lệch tối đa 10° [ĐO GameUtil.GetFinalDeviation]',
    dv.ak && n2(dv.ak.ang, 10), 'góc ' + (dv.ak && dv.ak.ang.toFixed(2)) + '°');
  check('speed_correction cộng đơn vị/giây: Máy Bong Bóng 12 + 5 = 17 [ĐO Gun002.CreateBullet]',
    dv.bubble.length === 5 && dv.bubble.every(b => n2(b.spd, 17)), dv.bubble.map(b => b.spd.toFixed(2)).join(','));
  check('vệt chém sinh ở tay (h1), không ở mũi kiếm [ĐO Gun006.CreateBullet: transform.parent.position]',
    dv.sword && n2(dv.sword.x, dv.hx) && n2(dv.sword.y, dv.hy), dv.sword && ('(' + dv.sword.x.toFixed(2) + ', ' + dv.sword.y.toFixed(2) + ') tay (' + dv.hx + ', ' + dv.hy + ')'));
  check('nhát Attack2 lật trục Y cục bộ: hộp lật, hình vẽ góc + 180° kèm flip [ĐO Gun006.CreateBullet localScale.y = -1]',
    dv.sword2 && dv.sword2.flip && n2(Math.abs(dv.sword2.fxd), 180) && dv.sword2.fxf === true && dv.sword && !dv.sword.flip, JSON.stringify(dv.sword2 && { fxd: dv.sword2.fxd, fxf: dv.sword2.fxf }));
  check('cỡ vệt chém = bulletsInfo.size / cỡ nút b: Khiên & Kiếm 2/1,5 = 1,333; Dao Lớn 2,5/2,5 = 1 [ĐO RGSword.ResetSize]',
    dv.shield && n2(dv.shield.size, 2 / 1.5) && n2(dv.sword.size, 1), dv.shield && dv.shield.size.toFixed(3));
  check('cung tụ đầy: 8 sát thương, 40 đơn vị/giây, crit +50; nhả ngay: 4, 30, không crit [ĐO Gun005.Attack bulletDelta]',
    dv.bowFull && dv.bowFull.dmg === 8 && n2(dv.bowFull.spd, 40) && dv.bowFull.crit === true && dv.bowTap.dmg === 4 && n2(dv.bowTap.spd, 30) && dv.bowTap.crit === false,
    JSON.stringify([dv.bowFull, dv.bowTap].map(b => b && [b.dmg, b.spd, b.crit])));
  check('Gậy Trục Xuất (Hiệp Sĩ Bí Pháp) tụ đầy 12 sát thương cỡ 1,85; nhả ngay 3 [ĐO WeaponChargeStaff.CreateBullet]',
    dv.staffFull && dv.staffFull.dmg === 12 && n2(dv.staffFull.size, 1.85) && dv.staffTap.dmg === 3 && n2(dv.staffTap.size, 1),
    JSON.stringify([dv.staffFull, dv.staffTap].map(b => b && [b.dmg, b.size])));
  check('Súng Ray Ion: đầy 6+14 = 20, cỡ 1,95, tốc 35; nửa 6+7 = 13 [ĐO Gun007.<CreateBullet>]',
    dv.rail && dv.rail.dmg === 20 && n2(dv.rail.size, 1.95) && n2(dv.rail.spd, 35) && dv.railHalf && dv.railHalf.dmg === 13,
    JSON.stringify([dv.rail, dv.railHalf].map(b => b && [b.dmg, b.size, b.spd])));
  check('Chuỳ Thánh tụ đầy: 6 + max_atk_add 4 = 10, cỡ max_scale 1,7', dv.flail && dv.flail.dmg === 10 && n2(dv.flail.size, 1.7),
    JSON.stringify(dv.flail && [dv.flail.dmg, dv.flail.size]));
  check('tay cầm súng từ nút h1 + pivot: Hiệp Sĩ [3,92; 6,8], Chiến Binh Cuồng [-0,53; 6] [ĐO hero.ab c00/c13]',
    n2(dv.hand.knight[0], 3.92) && n2(dv.hand.knight[1], 6.8) && n2(dv.hand.viking[0], -0.53) && n2(dv.hand.viking[1], 6), JSON.stringify(dv.hand));

  // Vũ khí khởi đầu của cả 42 nhân vật bắn được và gây sát thương.
  const starters = await p.evaluate(() => [...new Set(Object.values(SK_DESIGN.heroes).map(h => h.weapon))]);
  const dead = [];
  for (const id of starters) {
    await p.evaluate(id => { SK_GAME.debug.give(id); }, id);
    await p.evaluate(stage, 36);
    const b0 = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, f: window.__fires }));
    const ch = await p.evaluate(id => SK_DESIGN.weapons[id].charge || 0, id);
    await p.keyboard.down('KeyJ'); await sleep(ch ? ch * 1000 + 150 : 600); await p.keyboard.up('KeyJ');
    await sleep(450);
    const a0 = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, f: window.__fires }));
    if (!(a0.f > b0.f)) dead.push(id + '(không bắn)');
  }
  check('vũ khí khởi đầu của 42 nhân vật: giữ nút là bắn', dead.length === 0, starters.length + ' món' + (dead.length ? ' · ' + dead.join(', ') : ''));

  // Quái bắn: đạn là prefab EGun thật (orc cung -> bullet_e_1 ...), có hình vfx, trúng người chơi ra hit_red.
  const eb = await p.evaluate(() => {
    const G = SK.G, P = G.player;
    G.bullets = [];
    const e = SK.makeEnemy(G, 'e_orc01', P.x + 60, P.y, G.room);
    e.st = 'aim'; e.stT = 0.01; e.cd = 99;
    G.enemies.push(e);
    return e.w && e.w.bullet;
  });
  await sleep(400);
  const ebs = await p.evaluate(() => ({ list: SK.G.bullets.filter(b => b.side === 'e').map(b => b.v86 + (b.fxh ? '+fx' : '')), vfx: (SK.G.vfx || []).map(h => h.name) }));
  check('quái bắn đạn prefab thật (' + eb + ') có hình SK.vfx', ebs.list.some(x => x === eb + '+fx') || ebs.vfx.indexOf('hit_red') >= 0,
    'đạn ' + ebs.list.join(',') + ' · vfx ' + ebs.vfx.slice(0, 5).join(','));

  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  try { await main(b); } catch (e) { check('chạy trọn', false, e.message.split('\n')[0]); }
  await b.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
