/*
 * Kiểm thử vũ khí của Hiệp Sĩ Linh Hồn (games/soulknight).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-weapons.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-weapons/.
 *
 * Vào 1-1, dịch sang phòng đánh đầu, gom quái đứng trước mặt (máu 999, choáng để khỏi chạy),
 * rồi với từng vũ khí mẫu: SK_GAME.debug.give(id), GIỮ PHÍM J THẬT (cung/vũ khí nạp: giữ rồi nhả),
 * đo máu quái giảm và năng lượng trừ đúng cost wiki × số phát (đếm bằng SK.on('fire')).
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

// id → ảnh chụp (một ảnh cho mỗi kind). Chọn trải đủ kind, có đạn chùm, nạp, xuyên, nổ.
const SAMPLE = [
  ['bad_pistol'], ['shotgun', 'gun'], ['uzi'], ['sniper_rifle'], ['grenade_pistol'],
  ['magic_staff'], ['staff_of_flame', 'staff'], ['banishing_staff'],
  ['bow', 'bow'], ['crossbow'], ['hero_bow'],
  ['arbitrator', 'laser'], ['ice_breaker'], ['prototype_railgun'],
  ['bazooka', 'launcher'], ['worn_bazooka'],
  ['broadsword', 'melee'], ['flame_sword'], ['caliburn']
];

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
    await sleep(80);
  }
  return false;
}

// Gom mọi quái còn sống ra trước mặt người chơi, máu 999, choáng dài: số đo không lẫn quái chạy / chết.
function stage(dist) {
  const G = SK.G, p = G.player;
  G.pickups = [];
  G.bullets = [];
  let i = 0;
  for (const e of G.enemies) {
    if (e.st === 'dead') continue;
    e.st = 'stun'; e.stT = 30; e.kx = e.ky = 0;
    e.hp = e.hpMax = 999;
    e.x = p.x + dist + (i % 2) * 6; e.y = p.y + ((i % 3) - 1) * 5;
    i++;
  }
  p.energy = p.energyMax;
  return i;
}

// Dừng khung hình (bước game bỏ qua khi state khác 'stage', vẽ vẫn chạy) rồi chụp vùng quanh người chơi.
async function snap(p, name) {
  await p.evaluate(() => { window.__st = SK.G.state; SK.G.state = 'frozen'; });
  await sleep(60);
  await p.screenshot({ path: path.join(SHOTS, name + '.png'), clip: { x: 320, y: 150, width: 640, height: 420 } });
  await p.evaluate(() => { SK.G.state = window.__st; });
}

async function main(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.evaluate(() => SK_GAME.debug.seed(20260929));
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  await p.evaluate(() => { SK_GAME.debug.god(true); window.__fires = 0; SK.on('fire', () => { window.__fires++; }); });

  // Kho vũ khí: mọi id trong SK_WIKI có def, kind có hàm bắn, sprite có trong atlas.
  const inv = await p.evaluate(() => {
    const bad = [];
    for (const id of Object.keys(SK_WIKI.weapons)) {
      const d = SK_DESIGN.weapons[id];
      if (!d) { bad.push(id + ':thiếu def'); continue; }
      if (!SK.WEAPON_KINDS[d.kind]) bad.push(id + ':kind ' + d.kind);
      if (!SK.frame(d.sprite)) bad.push(id + ':sprite ' + d.sprite);
      if (d.bullet && !SK.frame(d.bullet)) bad.push(id + ':đạn ' + d.bullet);
    }
    const lv = [1, 2, 3].map(l => {
      const g = {};
      for (let k = 0; k < 400; k++) for (const id of [SK.pick(SK.weaponPool(l, 'chest'))]) { const gr = SK_DESIGN.weapons[id].grade; g[gr] = (g[gr] || 0) + 1; }
      return g;
    });
    return { n: Object.keys(SK_WIKI.weapons).length, bad, lv, pool1: SK_DESIGN.chestPool.length };
  });
  check('mọi vũ khí wiki dùng được (def + kind + sprite + đạn)', inv.bad.length === 0, inv.n + ' món' + (inv.bad.length ? ' · lỗi ' + inv.bad.slice(0, 6).join(', ') : ''));
  const gr = inv.lv.map(g => Object.keys(g).map(Number));
  check('rương theo tầng: 1-x bậc 1-2, 2-x bậc 2-3, 3-x bậc 3-5',
    gr[0].every(x => x <= 2) && gr[1].every(x => x >= 2 && x <= 3) && gr[2].every(x => x >= 3 && x <= 5) && (inv.lv[0][1] || 0) > (inv.lv[0][2] || 0),
    inv.lv.map((g, i) => (i + 1) + '-x ' + JSON.stringify(g)).join(' · ') + ' · chestPool ' + inv.pool1);

  // ---- vào phòng đánh
  const ok = await p.evaluate(() => SK_GAME.debug.teleportTo('battle'));
  await until(p, () => SK_GAME.enemyCount > 0, null, 4000);
  await sleep(900);
  check('vào phòng đánh 1-1, có quái', ok && await p.evaluate(() => SK_GAME.enemyCount > 0), 'số quái ' + await p.evaluate(() => SK_GAME.enemyCount));

  for (const [id, shotKind] of SAMPLE) {
    const d = await p.evaluate(id => {
      SK_GAME.debug.give(id);
      const w = SK.G.player.weapons[SK.G.player.cur]; w.cd = 0;
      const x = SK_DESIGN.weapons[id];
      return { kind: x.kind, cost: x.cost, charge: x.charge || 0, rps: x.rps, name: x.name, moveMod: x.moveMod || 0 };
    }, id);
    const n = await p.evaluate(stage, d.kind === 'melee' ? 14 : d.kind === 'laser' ? 60 : 100);
    if (!n) { check(id + ': còn quái để thử', false); continue; }
    await sleep(120);
    const before = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, en: SK.G.player.energy, fires: window.__fires }));
    await p.keyboard.down('KeyJ');
    let moveMul = null;
    if (d.charge) {
      await sleep(Math.round(d.charge * 1000) + 250);
      moveMul = await p.evaluate(() => SK.G.player.moveMul);
      if (shotKind) await snap(p, shotKind + '-charge');
      await p.keyboard.up('KeyJ');
      if (shotKind) { await sleep(60); await snap(p, shotKind); }
    } else {
      const hold = Math.max(90, Math.min(400, 1000 / d.rps + 30));
      await sleep(shotKind === 'laser' || shotKind === 'melee' ? 30 : shotKind === 'launcher' ? 150 : Math.min(hold, 120));
      if (shotKind) await snap(p, shotKind);
      moveMul = await p.evaluate(() => SK.G.player.moveMul);
      await sleep(Math.max(0, hold - 150));
      await p.keyboard.up('KeyJ');
    }
    await sleep(1000);
    const after = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, en: SK.G.player.energy, fires: window.__fires, mm: SK.G.player.moveMul }));
    const fires = after.fires - before.fires, spent = before.en - after.en;
    check(id + ' (' + d.kind + ') bắn trúng: máu quái giảm, năng lượng −cost×phát',
      fires >= 1 && after.hp < before.hp && Math.abs(spent - d.cost * fires) < 1e-6,
      d.name + ' · ' + fires + ' phát · máu ' + before.hp + '→' + after.hp + ' · nl −' + spent + ' (cost ' + d.cost + ')' +
      (d.moveMod ? ' · tốc khi giữ ×' + (moveMul == null ? '?' : moveMul.toFixed(2)) + ' → nhả ×' + after.mm : ''));
    if (d.moveMod) check(id + ' moveMod áp khi giữ, gỡ khi nhả', Math.abs(moveMul - (1 + d.moveMod)) < 1e-6 && Math.abs(after.mm - 1) < 1e-6, (1 + d.moveMod).toFixed(3));
  }
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
