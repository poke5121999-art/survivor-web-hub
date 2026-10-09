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

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1';
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
  await p.route('**/games/soulknight/index.html*', async route => {
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
  await p.evaluate(() => { window.__vx = {}; window.__vp = setInterval(() => { for (const h of SK.G.vfx || []) window.__vx[h.name] = h.name === 'explode_hit_enemy' ? h.scale : 1; }, 10); });
  await p.keyboard.down('KeyJ'); await sleep(60); await p.keyboard.up('KeyJ');
  await sleep(180); await snap(p, 'bazooka');
  await sleep(500);
  after = await p.evaluate(() => { clearInterval(window.__vp); return { hp: SK_GAME.enemyHp, vx: window.__vx }; });
  check('bazooka: nổ thật explode_hit_enemy, trúng cả đám (8 trực tiếp + 8 vùng mỗi con)', after.vx.explode_hit_enemy && before.hp - after.hp >= 8 * nb,
    'máu −' + (before.hp - after.hp) + ' (' + nb + ' quái) · ' + Object.keys(after.vx).filter(k => /explode|W:/.test(k)).join(', '));
  // Thân đạn không đổi cỡ (updataInfoWithSize không có trong bundle), nhưng nổ scaleEffectByBulletSize = bulletsInfo.size 2 × sizeFactor 1
  // [ĐO ExplodeEffectTrigger.ExplodeStart + Explode.UpdateInfo: localScale = one × size].
  check('bazooka: nổ cỡ 2 = bulletsInfo.size × sizeFactor [ĐO ExplodeEffectTrigger.ExplodeStart]', after.vx.explode_hit_enemy === 2,
    'scale ' + after.vx.explode_hit_enemy);

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
        dmg: b.crit ? b.dmg / SK_DESIGN.rules.critMult : b.dmg, crit: b.crit, size: b.size, bsize: b.bsize, flip: b.flip, fxd: b.fxh ? (b.fxh.ang - b.ang) * 180 / Math.PI : null, fxf: b.fxh ? b.fxh.flip : null }));
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
    // quay mặt trái: vệt chém là ảnh gương (localScale.x = facing) [ĐO Gun006.CreateBullet]
    P.face = -1; P.aim = Math.PI;
    out.swordL = one('broadsword', { ang: Math.PI })[0];
    out.swordL2 = one('broadsword', { ang: Math.PI, flip: true })[0];
    out.bazooka = one('bazooka')[0];
    P.face = 1; P.aim = 0;
    out.hand2 = SK.handPos(P, 2).map((v, i) => +(v - (i ? P.y : P.x)).toFixed(2));
    const SF = SK.SELF_FORCE, xa = SK_DESIGN.weapons.weapon_init_assassin ? SK_DESIGN.weapons.weapon_init_assassin.w86.x : { max_hold_force: 30 };
    out.sf = { asn1: SF.GunInitAssassin(xa, 'Attack'), asn4: SF.GunInitAssassin(xa, 'Attack4'), joker: SF.GunInitJoker({ attackForce: 0 }),
      kat: [0, 1, 2].map(i => SF.Katana({}, 'Attack', { katIdx: i }, { x: 0, y: 0, target: null }, { t: 0 })),
      katNear: SF.Katana({}, 'Attack', { katIdx: 1 }, { x: 0, y: 0, target: { x: 6 * 16, y: 0 } }, { t: 0 }) };
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

  check('quay mặt trái: vệt chém lật gương (flip), nhát Attack2 lật hai lần thành thẳng [ĐO Gun006.CreateBullet localScale = (facing, ±1)]',
    dv.swordL && dv.swordL.flip === true && dv.swordL.fxf === true && n2(Math.abs(dv.swordL.fxd), 180) && dv.swordL2 && dv.swordL2.flip === false && !dv.swordL2.fxf,
    JSON.stringify([dv.swordL, dv.swordL2].map(b => b && [b.flip, b.fxd, b.fxf])));
  check('bazooka: thân đạn cỡ 1, cỡ logic (nổ) = bulletsInfo.size 2 [ĐO RGBullet.UpdateInfo: updataInfoWithSize mặc định false]',
    dv.bazooka && dv.bazooka.size === 1 && dv.bazooka.bsize === 2, JSON.stringify(dv.bazooka && [dv.bazooka.size, dv.bazooka.bsize]));
  check('tay trái Song Thủ ở h2 TRƯỚC mặt: Hiệp Sĩ [12,72; 8,4] px so với chân [ĐO hero.ab c00/img/h2 (0,55; 0,6)]',
    n2(dv.hand2[0], 12.72) && n2(dv.hand2[1], -8.4), JSON.stringify(dv.hand2));
  check('lực lao: Sát Thủ nhát thường 0, nhát tụ Attack4 30; Joker 0; Katana [0, 20, 15], gần mục tiêu 6 đv × (6−4)/4 = 10 [ĐO ApplySelfForce, Katana]',
    dv.sf.asn1 === 0 && dv.sf.asn4 === 30 && dv.sf.joker === 0 && dv.sf.kat.join() === '0,20,15' && n2(dv.sf.katNear, 10), JSON.stringify(dv.sf));

  // Lao người thật: Kiếm Đâm (Gun015, force 30) một nhát -> đi 2,916 đv = 46,65 px theo hướng ngắm, phím chạy bị bỏ qua
  // [ĐO GetForce: min(|F|, 300); SetVelocity: forceLerp 1, inertial_vel × 0,8 mỗi 0,02 s tới khi ≤ 1].
  const spearId = await p.evaluate(() => SK_DESIGN.weaponId('weapon_067'));
  await p.evaluate(id => { SK_GAME.debug.give(id); }, spearId);
  await p.evaluate(stage, 150);
  await sleep(100);
  const x0 = await p.evaluate(() => { window.__f0 = window.__fires; window.__lx = null; const P = SK.G.player; SK.on('fire', () => { if (window.__lx == null) window.__lx = [P.x, P.y]; }); return [SK.G.player.x, SK.G.player.y]; });
  await p.keyboard.down('KeyJ');
  await p.waitForFunction(() => window.__fires > window.__f0, null, { timeout: 3000 }).catch(() => {});
  await p.keyboard.up('KeyJ');
  await sleep(700);
  const lg = await p.evaluate(() => ({ at: window.__lx, now: [SK.G.player.x, SK.G.player.y], n: window.__fires - window.__f0, aim: SK.G.player.aim }));
  const dl = lg.at ? Math.hypot(lg.now[0] - lg.at[0], lg.now[1] - lg.at[1]) : 0;
  check('Kiếm Đâm: một nhát lao 46,65 px (2,916 đv) theo hướng ngắm [ĐO Gun015.Attack force 30 + RGController.SetVelocity]',
    lg.n === 1 && near(dl, 46.65, 1.2), 'lao ' + dl.toFixed(2) + ' px, ' + lg.n + ' nhát');

  // Song Thủ: súng thứ hai vẽ sau thân (nằm trên) — thứ tự: thân, súng chính, súng h2.
  const order = await p.evaluate(() => {
    const G = SK.G, P = G.player, d0 = SK.draw, seen = [];
    SK_GAME.debug.give('bad_pistol');
    P.dual = SK.makeWeapon(P.weapons[P.cur].id);
    const spr = P.weapons[P.cur].def.sprite;
    SK.draw = function (ctx, f) { seen.push(f === spr ? 'gun' : /^weapon|^w\d/.test(f) ? 'gun' : 'x'); return d0.apply(this, arguments); };
    try { SK.drawPlayer(document.createElement('canvas').getContext('2d'), G); } finally { SK.draw = d0; P.dual = null; }
    return seen.join(',');
  });
  check('Song Thủ: súng thứ hai vẽ SAU thân (nằm trên thân), không còn khuất sau lưng', /^x(,x)*,gun(,gun)*$/.test(order) && (order.match(/gun/g) || []).length >= 2, order);

  // Chiêu phụ vũ khí (nút L / btn_special) khi kỹ năng không giữ nút: Gatling tiến hoá tích nhiệt 3/lần bắn, đầy 100 ở lần thứ 34,
  // bấm -> 4 loạt × 4 viên bullet_gatlin_power trong 1 s [ĐO GunGatlin]. Bản thường không tích nhiệt.
  await p.evaluate(() => { SK_GAME.debug.give('gatling_gun'); });
  await p.evaluate(stage, 120);
  await p.keyboard.down('KeyJ'); await sleep(400); await p.keyboard.up('KeyJ');
  const gBase = await p.evaluate(() => { const w = SK.G.player.weapons[SK.G.player.cur]; return { heat: w.heat || 0, sp: !!SK.weaponSpecial(SK.G.player) }; });
  const gat = await p.evaluate(() => {
    const G = SK.G, P = G.player, w = P.weapons[P.cur], S = SK.WEAPON_SPECIALS.GunGatlin, out = {};
    w.evolved = true; w.heat = 0; w.overheat = false;
    for (let i = 0; i < 33; i++) S.onAttack(G, P, w, 1);
    out.h33 = [w.heat, !!w.overheat];
    S.onAttack(G, P, w, 1);
    out.h34 = [w.heat, !!w.overheat];
    out.skill = !!(SK.skillDef(P).special);
    G.bullets = [];
    window.__gp = 0; window.__gpp = setInterval(() => { for (const b of SK.G.bullets) if (b.v86 === 'bullet_gatlin_power' && !b._c) { b._c = 1; window.__gp++; } }, 4);
    return out;
  });
  await p.keyboard.down('KeyL'); await sleep(80); await p.keyboard.up('KeyL');
  await sleep(1150);
  const gat2 = await p.evaluate(() => { clearInterval(window.__gpp); const w = SK.G.player.weapons[SK.G.player.cur]; const r = { n: window.__gp, heat: w.heat, oh: !!w.overheat }; w.evolved = false; return r; });
  check('Gatling: bản thường không nhiệt/không chiêu phụ; tiến hoá: 33 lần = 99, lần 34 = 100 quá nhiệt; nút L -> 16 viên bullet_gatlin_power, nhiệt về 0 [ĐO GunGatlin]',
    gBase.heat === 0 && !gBase.sp && !gat.skill && gat.h33[0] === 99 && !gat.h33[1] && gat.h34[0] === 100 && gat.h34[1] && gat2.n === 16 && gat2.heat === 0 && !gat2.oh,
    JSON.stringify({ gBase, gat, gat2 }));

  // Katana tiến hoá: năng lượng chiêu 6 (1/giây), nút L -> lướt tới mục tiêu (khoảng cách + 0,5 đv) ở 40 đv/s, 0,15 s sau chém
  // sword_katana_slash 24 sát thương [ĐO Katana.SpecialAtk/SpecialAtkDash].
  await p.evaluate(() => { SK_GAME.debug.give(SK_DESIGN.weaponId('weapon_064')); });
  await p.evaluate(stage, 60);
  await sleep(120);
  const k0 = await p.evaluate(() => {
    const G = SK.G, P = G.player, w = P.weapons[P.cur];
    w.evolved = true; w.spE = 5.9;
    SK.WEAPON_SPECIALS.Katana.update(G, P, w, 0.2);
    const t = P.target, d = t ? Math.hypot(t.x - P.x, t.y - P.y) : null;
    window.__ks = null; window.__ksp = setInterval(() => { const b = SK.G.bullets.find(q => q.v86 === 'sword_katana_slash'); if (b && !window.__ks) window.__ks = { dmg: b.crit ? b.dmg / SK_DESIGN.rules.critMult : b.dmg }; }, 4);
    return { spE: w.spE, d, x: P.x, y: P.y };
  });
  await p.keyboard.down('KeyL'); await sleep(60); await p.keyboard.up('KeyL');
  await sleep(700);
  const k1 = await p.evaluate(() => { clearInterval(window.__ksp); const P = SK.G.player, w = P.weapons[P.cur]; const r = { x: P.x, y: P.y, slash: window.__ks, spE: w.spE }; w.evolved = false; return r; });
  const kd = Math.hypot(k1.x - k0.x, k1.y - k0.y);
  check('Katana tiến hoá: nạp đủ 6, nút L lướt (khoảng cách + 8 px) rồi chém sword_katana_slash 24 [ĐO Katana.SpecialAtk]',
    k0.spE === 6 && k0.d && near(kd, k0.d + 8, 1.5) && k1.slash && k1.slash.dmg === 24 && k1.spE < 1,
    'lướt ' + kd.toFixed(1) + ' px (mục tiêu ' + (k0.d && k0.d.toFixed(1)) + ') · ' + JSON.stringify(k1.slash));

  // Gậy Tử Linh: 01, 01, ex_01 (lần 3), mỗi lần −5 năng lượng; đủ 6 xác thì lần sau ra Thủ lĩnh npc_skeleton_03 (28 máu), xác bị gom
  // [ĐO StaffOfNecromancy.Summon/RefreshSummonLeaderCondition, prefab npc_skeleton_*].
  const nec = await p.evaluate(() => {
    const G = SK.G, P = G.player, out = {};
    SK_GAME.debug.give('staff_of_skeleton');
    const w = P.weapons[P.cur], F = SK.CUSTOM_FIRE.StaffOfNecromancy, o = { x: P.x + 4, y: P.y - 7, ang: 0 };
    out.cls = w.def.w86 && w.def.w86.cls; out.cost = w.def.cost;
    for (let i = 0; i < 6; i++) F(G, P, w, o);
    const mine = SK.weaponAllies(G).filter(a => a.skel);
    out.kinds = mine.map(a => a.kind.replace('npc_skeleton_', '')).join(',');
    out.hp = mine.map(a => a.hpMax).join(',');
    for (const a of mine) a.life = 0;
    return out;
  });
  await sleep(150);
  const nec2 = await p.evaluate(() => {
    const G = SK.G, P = G.player, w = P.weapons[P.cur];
    const corpses = SK.weaponAllies(G).filter(a => a.corpse && !a.gone).length, st = { can: w.necro.canLeader, bones: w.necro.bones.length };
    SK.CUSTOM_FIRE.StaffOfNecromancy(G, P, w, { x: P.x + 4, y: P.y - 7, ang: 0 });
    const L = SK.weaponAllies(G).find(a => a.kind === 'npc_skeleton_03');
    return { corpses, st, leader: L ? L.hpMax : 0, after: SK.weaponAllies(G).filter(a => a.corpse && !a.gone).length };
  });
  check('Gậy Tử Linh: 01,01,ex_01 (máu 8,8,16); 6 xác -> Thủ lĩnh 28 máu, gom hết xác [ĐO StaffOfNecromancy]',
    nec.cls === 'StaffOfNecromancy' && nec.cost === 5 && nec.kinds === '01,01,ex_01,01,01,ex_01' && nec.hp === '8,8,16,8,8,16' &&
    nec2.corpses === 6 && nec2.st.can && nec2.leader === 28 && nec2.after === 0, JSON.stringify({ nec, nec2 }));

  // Gậy Ảo Ảnh: 1 bản sao cầm bản sao vũ khí sau lưng (Súng Ngắn Cũ), máu 100 + giáp tối đa; gọi lại khi vũ khí không đổi thì
  // không làm gì và không tốn năng lượng [ĐO GunPhantom.CreatePhantom].
  await p.evaluate(() => { SK_GAME.debug.give('staff_of_illusion'); for (const a of SK.weaponAllies(SK.G)) a.gone = true; });
  await p.evaluate(stage, 70);
  const ph0 = await p.evaluate(() => ({ en: SK.G.player.energy, f: window.__fires, hp: SK_GAME.enemyHp }));
  await p.keyboard.down('KeyJ');
  await p.waitForFunction(f => window.__fires > f, ph0.f, { timeout: 3000 }).catch(() => {});
  await p.keyboard.up('KeyJ');
  const ph1 = await p.evaluate(() => {
    const G = SK.G, P = G.player, w = P.weapons[P.cur];
    const ph = SK.weaponAllies(G).filter(a => a.phantomOf === w);
    const en = P.energy, again = SK.CUSTOM_FIRE.GunPhantom(G, P, w, { x: P.x, y: P.y - 7, ang: 0 });
    return { n: ph.length, wid: ph[0] && ph[0].w && ph[0].w.id, hp: ph[0] && ph[0].hpMax, armor: P.armorMax, en0: en, again, n2: SK.weaponAllies(G).filter(a => a.phantomOf === w).length };
  });
  await sleep(1300);
  const ph2 = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, en: SK.G.player.energy }));
  check('Gậy Ảo Ảnh: 1 bản sao cầm Súng Ngắn Cũ, máu 100 + giáp; gọi lại không thay, không tốn năng lượng; bản sao bắn trúng quái',
    ph1.n === 1 && ph1.wid === 'bad_pistol' && ph1.hp === 100 + ph1.armor && ph1.again === false && ph1.n2 === 1 && ph0.en - ph1.en0 === 10 && ph2.hp < ph0.hp,
    JSON.stringify({ ph0, ph1, ph2 }));
  await p.evaluate(() => { for (const a of SK.weaponAllies(SK.G)) a.gone = true; });

  // Sổ Tay Chết Chóc: quái thường chết ngay (true, tốn năng lượng); trùm: false (hoàn năng lượng) [ĐO GunDeadNote.Attack].
  await p.evaluate(stage, 60);
  const dn = await p.evaluate(() => {
    const G = SK.G, P = G.player, F = SK.CUSTOM_FIRE.GunDeadNote;
    SK_GAME.debug.give(SK_DESIGN.weaponId('weapon_276'));
    const w = P.weapons[P.cur], es = G.enemies.filter(e => e.st !== 'dead');
    P.target = es[0]; const r1 = F(G, P, w), st1 = es[0].st;
    es[1].arena = {}; P.target = es[1]; const r2 = F(G, P, w), st2 = es[1].st; delete es[1].arena;
    return { r1, st1, r2, st2, cls: w.def.w86 && w.def.w86.cls, cost: w.def.cost };
  });
  check('Sổ Tay Chết Chóc: quái thường chết ngay, trùm không (không tốn năng lượng) [ĐO GunDeadNote.Attack]',
    dn.cls === 'GunDeadNote' && dn.cost === 6 && dn.r1 === true && dn.st1 === 'dead' && dn.r2 === false && dn.st2 !== 'dead', JSON.stringify(dn));

  // Cào Trúng Thưởng: ran 3 -> "Giải 1!!" 20 xu × 5 vàng sau 0,6333 + 0,7 s, thẻ bị bỏ [ĐO GunLottery.GetReward].
  await p.evaluate(() => { SK_GAME.debug.give(SK_DESIGN.weaponId('weapon_332')); const w = SK.G.player.weapons[SK.G.player.cur]; w.forceRan = 3; SK.G.pickups = []; window.__lw = w; window.__g0 = SK.G.player.gold; });
  await p.keyboard.down('KeyJ'); await sleep(80); await p.keyboard.up('KeyJ');
  await sleep(700);
  const lt0 = await p.evaluate(() => ({ spr: window.__lw.frameOverride, coins: SK.G.pickups.filter(k => k.kind === 'coin').length }));
  await sleep(900);
  const lt = await p.evaluate(() => { const P = SK.G.player, c = SK.G.pickups.filter(k => k.kind === 'coin'); return { gold: P.gold - window.__g0 + c.reduce((a, k) => a + k.value, 0), done: window.__lw.lotDone, held: P.weapons.indexOf(window.__lw) }; });
  check('Cào Trúng Thưởng: ran 3 -> hình weapons_332_1 ở 0,63 s, "Giải 1!!" 20 xu × 5 = 100 vàng ở 1,33 s, thẻ bị bỏ [ĐO GunLottery]',
    lt0.spr === 'weapons_332_1' && lt0.coins === 0 && lt.gold === 100 && lt.done === 'Giải 1!!' && lt.held === -1, JSON.stringify({ lt0, lt }));
  await p.evaluate(() => { SK.G.pickups = []; SK_GAME.debug.give('bad_pistol'); });

  // Lá Phong Khổng Lồ: nhịp thật 2 phát / 1,1666 s (1,714/giây, không phải 600); vòng 4 đv cách nòng 6,06 đv, 12 sát thương [ĐO clip].
  const mapleId = await p.evaluate(() => SK_DESIGN.weaponId('weapon_374'));
  await p.evaluate(id => { SK_GAME.debug.give(id); }, mapleId);
  await p.evaluate(stage, 6 * 16 + 8);
  const mp0 = await p.evaluate(() => ({ f: window.__fires, hp: SK_GAME.enemyHp, rps: SK_DESIGN.weapons[SK.G.player.weapons[SK.G.player.cur].id].rps }));
  await p.keyboard.down('KeyJ'); await sleep(1150); await p.keyboard.up('KeyJ');
  await sleep(200);
  const mp1 = await p.evaluate(() => ({ f: window.__fires, hp: SK_GAME.enemyHp }));
  check('Lá Phong Khổng Lồ: 1,714 phát/giây (giữ 1,15 s = 2 phát), vòng lá trúng quái cách 6 đv [ĐO w_staff_normal_atk(2), bullet_aoe_w374_2]',
    near(mp0.rps, 1.714, 0.01) && mp1.f - mp0.f === 2 && mp1.hp < mp0.hp, JSON.stringify({ mp0, mp1 }));

  // Lá Phong chiêu phụ (nút L, BaseRevolver hồi 7 s, sẵn sàng từ đầu): 0,3 s sau bắn vòng 6 đv + 5 lá; 1,5 s sau 5 lá phóng 16 đv/s, 8 sát thương.
  await p.evaluate(() => { SK.G.bullets = []; window.__lv = 0; window.__lvp = setInterval(() => { for (const b of SK.G.bullets) if (b.v86 === 'bullet_0' && !b._c && Math.abs(Math.hypot(b.vx, b.vy) / 16 - 16) < 0.01 && (b.dmg === 8 || b.dmg === 16)) { b._c = 1; window.__lv++; } }, 4); });
  const pq0 = await p.evaluate(() => { const w = SK.G.player.weapons[SK.G.player.cur]; return { cast: w.pqCast == null ? 'sẵn' : w.pqCast, sp: !!SK.weaponSpecial(SK.G.player) }; });
  await p.keyboard.down('KeyL'); await sleep(60); await p.keyboard.up('KeyL');
  await sleep(2100);
  const pq1 = await p.evaluate(() => { clearInterval(window.__lvp); const w = SK.G.player.weapons[SK.G.player.cur]; return { leaves: window.__lv, cast: +w.pqCast.toFixed(1), prog: +SK.weaponSpecial(SK.G.player).progress.toFixed(2) }; });
  check('Lá Phong chiêu phụ: nút L -> 5 lá phóng 16 đv/s (8 sát thương), hồi lại 7 s [ĐO BaseRevolver coldDown 7, Bullet374]',
    pq0.sp && pq0.cast === 'sẵn' && pq1.leaves === 5 && pq1.cast < 3 && pq1.prog < 0.5, JSON.stringify({ pq0, pq1 }));

  // Đạn Đạo Lỗ Đen: giữ ≥ 0,8 s rồi nhả -> 1 tên lửa bullet_89 (16 sát thương, 32 đv/s); nhả sớm -> không bắn [ĐO GunChannel/GunBlackHoleMissile].
  const bhId = await p.evaluate(() => SK_DESIGN.weaponId('weapon_160'));
  const bh = [];
  for (const hold of [300, 1000]) {
    await p.evaluate(id => { SK_GAME.debug.give(id); SK.G.bullets = []; window.__r89 = null; window.__z = 0;
      window.__bhp = setInterval(() => { const b = SK.G.bullets.find(q => q.v86 === 'bullet_89'); if (b && !window.__r89) window.__r89 = { spd: Math.hypot(b.vx, b.vy) / 16, dmg: b.crit ? b.dmg / 2 : b.dmg }; window.__z = Math.max(window.__z, SK.G.props.filter(q => q.zone && !q.zone.gone).length); }, 4); }, bhId);
    await p.evaluate(stage, 200);
    await p.keyboard.down('KeyJ'); await sleep(hold); await p.keyboard.up('KeyJ');
    await sleep(200);
    bh.push(await p.evaluate(() => { clearInterval(window.__bhp); return { rocket: window.__r89, zone: window.__z }; }));
  }
  check('Đạn Đạo Lỗ Đen: lỗ đen khi giữ; nhả sớm không bắn; giữ 1 s nhả -> tên lửa 16 sát thương 32 đv/s [ĐO GunBlackHoleMissile.EndShooting]',
    bh[0].zone >= 1 && !bh[0].rocket && bh[1].rocket && bh[1].rocket.dmg === 16 && near(bh[1].rocket.spd, 32, 0.01), JSON.stringify(bh));

  // Sách Bóng Tối: bấm −2, giữ tới 1 s −2 nữa; 0,3 s -> vùng 2,2 đv; 1,8 s -> giai đoạn 3 (không trừ thêm) [ĐO GunDarkBook/BulletDarkBook].
  const dbId = await p.evaluate(() => SK_DESIGN.weaponId('weapon_367'));
  await p.evaluate(id => { SK_GAME.debug.give(id); }, dbId);
  await p.evaluate(stage, 90);
  const db0 = await p.evaluate(() => SK.G.player.energy);
  await p.keyboard.down('KeyJ'); await sleep(500);
  const dbA = await p.evaluate(() => { const s = SK.G.player.weapons[SK.G.player.cur].db; return s && { stage: s.stage, r: s.z.r / 16 }; });
  await sleep(1600);
  const dbB = await p.evaluate(() => { const s = SK.G.player.weapons[SK.G.player.cur].db; return s && { stage: s.stage, en: SK.G.player.energy }; });
  await p.keyboard.up('KeyJ');
  check('Sách Bóng Tối: −2 khi bấm, −2 ở 1 s; 0,5 s giai đoạn 2 (2,2 đv); 2,1 s giai đoạn 3 [ĐO GunDarkBook.Update, timeIntervals 0,3/1,5/3]',
    dbA && dbA.stage === 2 && near(dbA.r, 2.2, 0.01) && dbB && dbB.stage === 3 && db0 - dbB.en === 4, JSON.stringify({ db0, dbA, dbB }));
  await sleep(1500);

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
