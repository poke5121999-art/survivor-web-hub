/*
 * Hiệp Sĩ Linh Hồn: Animator súng quái và layer char_* dùng chung chạy theo đồ thị controller gốc (SK_DATA.ctrl).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-anim-weapon.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-anim-weapon/, tiền tố $SK_SHOT_TAG (mặc định "after").
 *
 * Số chuẩn [ĐO từ bundle 8.6 level/1/a, lượt build 2026-09-30]:
 * - e_orc03 (cung, EGun004): controller weapon_bow, state mặc định w_bow0; atk_b bật -> w_bow1 (giương: nút w lùi
 *   0.2 -> 0.5 đơn vị = 3,2 -> 8 px trong 0,5 s, xoay +45°), atk_b tắt -> w_bow2 (bật dây) -> w_bow0.
 *   EGun004.s_ide = weapons2_11, s_atk = weapons2_10 (SetAttack đổi sprite).
 * - e_orc01 (súng lục, EGun001): weapon_pistol, atk_b -> weapon_pistol (clip w_pistol: w lùi 3,2 px, xoay 5° ở 0,0333 s).
 * - char_hit: clip rỗng dài 0,0667 s, chỉ có sự kiện HitBack ở 0,0667 s; layer 1 của controller quái, vào bằng trigger "hit".
 * - L2.char_dizzy chơi clip char_atk: dấu "!" (biaoqing_9) ở nút dead_tap; L2.char_tap_dead: hồn ma biaoqing_11.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-anim-weapon');
const TAG = process.env.SK_SHOT_TAG || 'after';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(40);
  }
  return false;
}
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-3);
const DEG = Math.PI / 180;

async function main(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });

  // ---- (c) dữ liệu
  const d = await p.evaluate(() => {
    const D = SK.D, E = Object.values(D.enemies), W = E.flatMap(e => e.weapons || []);
    const o3 = D.enemies.e_orc03, w3 = o3.weapons[0];
    return {
      nEnemies: E.length, nWeapons: W.length, nWCtrl: W.filter(w => w.ctrl).length,
      nWStates: W.reduce((s, w) => s + Object.keys(w.anims || {}).length, 0),
      nCharHit: E.filter(e => Object.keys(e.anims).some(k => /^L\d\.char_hit$/.test(k))).length,
      nTap: E.filter(e => e.nodes && e.nodes.dead_tap).length,
      nHeroHit: Object.values(D.heroes).filter(h => h.s0.layers && Object.keys(h.s0.layers).some(k => /^L\d\.char_hit$/.test(k))).length,
      nCtrl: Object.keys(D.ctrl).length,
      bow: { ctrl: w3.ctrl, anims: w3.anims, spr: w3.spr, g: D.ctrl[w3.ctrl], w1: D.anims[w3.anims.w_bow1] },
      hit: D.anims[o3.anims['L1.char_hit']], rootL1: D.ctrl[o3.ctrl].L[1], tap: o3.nodes.dead_tap,
      dizzy: D.anims[o3.anims['L2.char_dizzy']]
    };
  });
  check('súng quái mang Animator: 218/220 (2 EGunSelfExplode không có)', d.nWeapons === 220 && d.nWCtrl === 218, d.nWCtrl + '/' + d.nWeapons);
  check('tổng state súng quái = 1055', d.nWStates === 1055, String(d.nWStates));
  check('char_hit có ở 294/296 quái và 42/42 nhân vật', d.nEnemies === 296 && d.nCharHit === 294 && d.nHeroHit === 42,
    d.nCharHit + '/' + d.nEnemies + ', hero ' + d.nHeroHit);
  check('nút dead_tap ở 294 quái, 159 controller', d.nTap === 294 && d.nCtrl === 159, d.nTap + ' · ' + d.nCtrl);
  check('e_orc03 cung: ctrl weapon_bow, 3 state, s_ide/s_atk',
    d.bow.ctrl === 'weapon_bow' && JSON.stringify(Object.keys(d.bow.anims).sort()) === '["w_bow0","w_bow1","w_bow2"]' &&
    d.bow.spr.s_ide === 'weapons2_11' && d.bow.spr.s_atk === 'weapons2_10', JSON.stringify(d.bow.spr));
  check('đồ thị weapon_bow: w_bow0 -atk_b-> w_bow1 -!atk_b-> w_bow2 -exit 1-> w_bow0',
    JSON.stringify(d.bow.g.L[0].st) === '{"w_bow0":[["w_bow1",[[1,"atk_b",0]],null,0]],"w_bow2":[["w_bow0",[],1,0]],"w_bow1":[["w_bow2",[[2,"atk_b",0]],null,0]]}' &&
    d.bow.g.L[0].def === 'w_bow0', JSON.stringify(d.bow.g.L[0].st));
  check('w_bow1.tr.w = p [[0,3.2,0],[0.5,8,0],[0.6667,8,0]], r [[0,45]]',
    JSON.stringify(d.bow.w1.tr.w) === '{"p":[[0,3.2,0],[0.5,8,0],[0.6667,8,0]],"r":[[0,45]]}', JSON.stringify(d.bow.w1.tr));
  check('char_hit = clip rỗng 0,0667 s + sự kiện HitBack',
    JSON.stringify(d.hit) === '{"f":[],"d":[],"loop":false,"ev":[[0.0667,"HitBack"]],"len":0.0667}', JSON.stringify(d.hit));
  check('layer 1 gốc: override, trọng số 1, Any -hit-> L1.char_hit -exit 1-> L1.New State',
    d.rootL1.add === 0 && d.rootL1.w === 1 && JSON.stringify(d.rootL1.any) === '[["L1.char_hit",[[1,"hit",0]],null,0]]' &&
    JSON.stringify(d.rootL1.st['L1.char_hit']) === '[["L1.New State",[],1,0.05]]', JSON.stringify(d.rootL1));
  check('L2.char_dizzy = "!" biaoqing_9 ở nút dead_tap', d.dizzy.fp === 'dead_tap' && d.dizzy.f[0] === 'biaoqing_9' &&
    JSON.stringify(d.tap) === '{"at":[12.8,19.2],"f":"biaoqing_11","on":0,"o":0}', JSON.stringify(d.tap));

  // ---- khi chơi
  await p.evaluate(() => SK_GAME.debug.seed(20260930));
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  await p.evaluate(() => SK_GAME.debug.god(true));
  await sleep(500);
  // Móc vẽ: ghi sprite + tư thế súng mỗi lần vẽ quái thử, và sprite "!"/hồn ma; móc sự kiện Animator.
  await p.evaluate(() => {
    window.__gun = []; window.__drawn = []; window.__ev = []; window.__l1 = [];
    const g0 = SK.drawGun;
    SK.drawGun = function (c, sprite, hx, hy, ang, off, o) {
      const e = window.__e;
      if (e && o && o.xf !== undefined && Math.abs(hx - e.x) < 20 && Math.abs(hy - e.y) < 30)
        window.__gun.push({ t: +e.t.toFixed(3), st: e.st, ws: SK.smState(e.wsm), sprite, xf: o.xf });
      return g0.apply(this, arguments);
    };
    const d0 = SK.draw;
    SK.draw = function (c, name, x, y, o) {
      if (name === 'biaoqing_9' || name === 'biaoqing_11') window.__drawn.push({ name, t: window.__e ? +window.__e.t.toFixed(3) : 0, stT: window.__e ? +window.__e.stT.toFixed(3) : 0 });
      return d0.apply(this, arguments);
    };
    SK.on('animEvent', (G, who, fn) => window.__ev.push({ who: who === G.player ? 'player' : who === window.__e ? 'e' : '?', fn, t: who.t }));
    const s0 = SK.smStep;
    SK.smStep = function (sm, dt, cb) {
      s0(sm, dt, cb);
      const e = window.__e;
      if (e && sm === e.sm) window.__l1.push([+e.t.toFixed(4), sm.L[1].st]);
    };
    window.__spawn = id => {
      const G = SK.G, pl = G.player;
      G.enemies = G.enemies.filter(x => x.room !== G.room);
      const e = SK.makeEnemy(G, id, pl.x + 44, pl.y, G.room);
      e.st = 'idle'; e.stT = 0.05; e.cd = 0; e.p = Object.assign({}, e.p, { attackProbability: 10, shoot_cd: 0.6 });
      G.enemies.push(e); window.__e = e; window.__gun = []; window.__drawn = []; window.__ev = []; window.__l1 = [];
      return true;
    };
    window.__pin = () => { const e = window.__e, pl = SK.G.player; if (e && e.st !== 'dead') { e.x = pl.x + 44; e.y = pl.y; } };
  });

  // (a) cung: giương (w_bow1, s_atk, xoay 45°, lùi 8 px) rồi bắn (w_bow2, s_ide)
  await p.evaluate(() => window.__spawn('e_orc03'));
  const sawAttack = await until(p, () => { window.__pin(); return window.__gun.some(g => g.st === 'attack'); }, null, 6000);
  await sleep(150);
  const g = await p.evaluate(() => window.__gun);
  const idle = g.filter(x => x.ws === 'w_bow0');
  const aim = g.filter(x => x.st === 'aim' && x.ws === 'w_bow1');
  const aimLate = aim.filter(x => x.xf && x.xf.dx > 7.99);
  const shot = g.filter(x => x.st === 'attack' && x.ws === 'w_bow2');
  check('cung trước khi giương: w_bow0, sprite weapons2_11, tư thế nghỉ', idle.length > 0 &&
    idle.every(x => x.sprite === 'weapons2_11' && x.xf && near(x.xf.dx, 0) && near(x.xf.rot, 0)), idle.length + ' lần vẽ');
  check('cung giương (e.st aim): w_bow1, sprite weapons2_10, xoay 45° (rot -0,7854)', sawAttack && aim.length > 5 &&
    aim.every(x => x.sprite === 'weapons2_10' && near(x.xf.rot, -45 * DEG)), aim.length + ' lần vẽ, rot ' + (aim[0] && aim[0].xf.rot.toFixed(4)));
  check('cung giương đủ 0,5 s: nút w lùi 8 px', aimLate.length > 0, aimLate.length + ' lần vẽ ở dx 8');
  check('cung bắn (e.st attack): w_bow2, sprite về weapons2_11, xoay > 45°', shot.length > 0 &&
    shot.every(x => x.sprite === 'weapons2_11') && Math.min(...shot.map(x => x.xf.rot)) < -45 * DEG - 0.05,
    shot.length + ' lần vẽ, rot nhỏ nhất ' + (shot.length ? Math.min(...shot.map(x => x.xf.rot)).toFixed(4) : '-'));
  const tap = await p.evaluate(() => window.__drawn.filter(x => x.name === 'biaoqing_9').length);
  check('lần giao chiến đầu: dấu "!" (biaoqing_9) được vẽ', tap > 0, tap + ' lần vẽ');
  await p.screenshot({ path: path.join(SHOTS, TAG + '-bow.png') });

  // (a') súng lục: bắn -> weapon_pistol, giật 3,2 px + 5°
  await p.evaluate(() => window.__spawn('e_orc01'));
  await until(p, () => { window.__pin(); return window.__gun.some(g => g.ws === 'weapon_pistol' && g.xf.dx < -2.5); }, null, 6000);
  const gp = await p.evaluate(() => window.__gun);
  const fire = gp.filter(x => x.ws === 'weapon_pistol');
  const minDx = fire.length ? Math.min(...fire.map(x => x.xf.dx)) : 0, minRot = fire.length ? Math.min(...fire.map(x => x.xf.rot)) : 0;
  check('súng lục trước khi bắn: w_ide, tư thế nghỉ', gp.some(x => x.ws === 'w_ide' && near(x.xf.dx, 0) && near(x.xf.rot, 0)));
  check('súng lục khi bắn: weapon_pistol, giật về tới -3,2 px và xoay tới 5°', fire.length > 0 && minDx < -2.5 && minDx >= -3.2 - 1e-6 &&
    minRot < -3 * DEG && minRot >= -5 * DEG - 1e-6, fire.length + ' lần vẽ, dx ' + minDx.toFixed(2) + ', rot ' + (minRot / DEG).toFixed(2) + '°');

  // (b) char_hit trong 0,2 s sau khi trúng đòn
  await p.evaluate(() => { const e = window.__e; e.cls = '__Hold'; SK.AI.__Hold = () => {}; window.__l1 = []; window.__ev = []; window.__hitT = e.t; SK.hurtEnemy(SK.G, e, 1, false, 0, 0); });
  await sleep(400);
  const hb = await p.evaluate(() => ({ l1: window.__l1, ev: window.__ev, t0: window.__hitT }));
  const inHit = hb.l1.filter(r => r[1] === 'L1.char_hit');
  const firstHit = inHit.length ? inHit[0][0] - hb.t0 : 99;
  const hitEv = hb.ev.find(x => x.who === 'e' && x.fn === 'HitBack');
  const back = hb.l1.find(r => r[1] === 'L1.New State' && inHit.length && r[0] > inHit[0][0]);
  check('quái trúng đòn: layer 1 vào L1.char_hit trong 0,2 s', firstHit <= 0.2, 'sau ' + firstHit.toFixed(3) + ' s, ' + inHit.length + ' bước');
  check('char_hit bắn HitBack rồi về L1.New State (~0,0667 s)', !!hitEv && hitEv.t - hb.t0 <= 0.2 && !!back && back[0] - inHit[0][0] < 0.12,
    hitEv ? 'HitBack sau ' + (hitEv.t - hb.t0).toFixed(3) + ' s, về sau ' + (back ? (back[0] - inHit[0][0]).toFixed(3) : '-') + ' s' : 'không có HitBack');
  // nhân vật
  const ph = await p.evaluate(async () => {
    const G = SK.G, pl = G.player; window.__ev = []; pl.invulT = 0; const t0 = pl.t;
    const ok = SK.hurtPlayer(G, 1);
    let st = null, stT = null;
    const t1 = performance.now();
    while (performance.now() - t1 < 300) {
      const l = pl.sm && pl.sm.L.find(x => /char_hit/.test(x.st));
      if (l && !st) { st = l.st; stT = pl.t - t0; }
      await new Promise(r => requestAnimationFrame(r));
    }
    const ev = window.__ev.find(x => x.who === 'player' && x.fn === 'HitBack');
    return { ok, ctrl: !!pl.sm, st, stT, ev: ev ? ev.t - t0 : null };
  });
  check('nhân vật trúng đòn: char_hit trong 0,2 s + HitBack', ph.ok && ph.ctrl && /char_hit/.test(ph.st || '') && ph.stT <= 0.2 && ph.ev != null && ph.ev <= 0.2,
    ph.st + ' sau ' + (ph.stT == null ? '-' : ph.stT.toFixed(3)) + ' s, HitBack sau ' + (ph.ev == null ? '-' : ph.ev.toFixed(3)) + ' s');

  // quái chết: hồn ma dead_tap từ 0,625 s
  await p.evaluate(() => { window.__drawn = []; SK.hurtEnemy(SK.G, window.__e, 99999, false, 0, 0); const e = window.__e; e.kx = e.ky = 0; });
  await sleep(1500);
  const ghost = await p.evaluate(() => window.__drawn.filter(x => x.name === 'biaoqing_11'));
  check('quái chết: hồn ma biaoqing_11 hiện sau 0,625 s', ghost.length > 0 && Math.min(...ghost.map(x => x.stT)) >= 0.6,
    ghost.length + ' lần vẽ, sớm nhất stT ' + (ghost.length ? Math.min(...ghost.map(x => x.stT)).toFixed(3) : '-'));
  await p.screenshot({ path: path.join(SHOTS, TAG + '-ghost.png') });
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  results.push('  ảnh: ' + SHOTS);
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  try { await main(b); } catch (e) { check('chạy trọn', false, e.message.split('\n')[0]); }
  await b.close();
  console.log(results.join('\n'));
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
