/*
 * Kiểm thử trùm cho Hiệp Sĩ Linh Hồn (games/soulknight/js/bosses.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-bosses.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-bosses/.
 *
 * Mỗi trùm (ép chọn qua SK.bossDebug.force): nhảy tới màn x-5, dịch chuyển vào phòng trùm, bật god,
 * xem màn giới thiệu, rồi GIỮ PHÍM J bắn thật bằng súng khởi đầu (thêm p.dmgMul nguyên để mỗi trận
 * ~18 giây). Kiểm: thanh máu hiện, trùm dùng ≥2 kiểu đánh, đòn trúng người chơi, trùm chết,
 * phòng mở, rương trùm có, đi vào cổng sang màn kế (3-5 → chiến thắng).
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-bosses');
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
    await sleep(100);
  }
  return false;
}

const FIGHTS = (process.env.SK_BOSSES || '1-5:goblin_priest,1-5:devils_snare,2-5:grand_knight,2-5:grand_wizard,3-5:volcanic_sandworm')
  .split(',').map(s => s.split(':'));
const NEXT = { '1-5': '2-1', '2-5': '3-1' };

async function fight(p, label, key) {
  const tag = label + ' ' + key;
  const ok = await p.evaluate(([label, key]) => {
    SK.bossDebug.force = key;
    if (!SK_GAME.debug.stage(label)) return false;
    SK_GAME.debug.god(true);
    window.__hurt = 0;
    return true;
  }, [label, key]);
  check(tag + ': vào màn + phòng trùm', ok);
  if (!ok) return;
  await until(p, () => SK_GAME.phase === 'play', null, 4000);
  await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  const spawned = await until(p, k => SK.G.enemies.some(e => e.bossKey === k), key, 4000);
  check(tag + ': trùm xuất hiện', spawned);
  if (!spawned) return;
  await until(p, () => SK.bossHud.intro, null, 2000);
  await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, key + '-intro.png') });
  const introSeen = await p.evaluate(() => SK.bossHud.intro);
  await until(p, () => SK.bossHud.visible, null, 4000);

  // Súng khởi đầu của Hiệp Sĩ + p.dmgMul nguyên (lõi làm tròn sát thương) để mỗi trận ~18 giây.
  const setup = await p.evaluate(() => {
    const pl = SK.G.player, w = pl.weapons[0].def, id = pl.weapons[0].id;
    pl.cur = 0;
    const dps = w.dmg * w.rps * (w.pellets || 1);
    const boss = SK.G.enemies.find(e => e.bossKey);
    pl.dmgMul = Math.max(1, Math.round(boss.hpMax / (dps * 0.6 * 18)));
    return { best: id, dps, mul: pl.dmgMul, hp: boss.hpMax };
  });
  await p.keyboard.down('KeyJ');
  const t0 = Date.now();
  let mid = false, dead = false, hudSeen = false, barShot = false;
  while (Date.now() - t0 < 70000) {
    const s = await p.evaluate(() => {
      const b = SK.G.enemies.find(e => e.bossKey);
      SK.G.player.energy = SK.G.player.energyMax;
      return { hp: b.hp, max: b.hpMax, dead: b.st === 'dead', hud: SK.bossHud.visible, used: Object.keys(b.used).length };
    });
    hudSeen = hudSeen || s.hud;
    if (s.hud && !barShot) { barShot = true; await p.screenshot({ path: path.join(SHOTS, key + '-bar.png'), clip: { x: 300, y: 0, width: 680, height: 80 } }); }
    if (!mid && Date.now() - t0 > 5500) { mid = true; await p.screenshot({ path: path.join(SHOTS, key + '-fight.png') }); }
    if (s.dead) { dead = true; break; }
    await sleep(150);
  }
  await p.keyboard.up('KeyJ');
  await sleep(700);
  await p.screenshot({ path: path.join(SHOTS, key + '-death.png') });
  const after = await p.evaluate(() => {
    const b = SK.G.enemies.find(e => e.bossKey);
    return { used: b.used, hurt: window.__hurt, dead: b.st === 'dead', left: b.hp };
  });
  check(tag + ': màn giới thiệu trùm', introSeen);
  check(tag + ': thanh máu trùm hiện', hudSeen);
  const kinds = Object.keys(after.used);
  check(tag + ': dùng ≥2 kiểu đánh', kinds.length >= 2, kinds.map(k => k + '×' + after.used[k]).join(' '));
  check(tag + ': đòn của trùm trúng người chơi', after.hurt > 0, after.hurt + ' lần');
  check(tag + ': bắn thật hạ được trùm', dead, setup.best + ' ×' + setup.mul.toFixed(1) + ' · máu ' + setup.hp + ' · còn ' + Math.round(after.left) + ' · ' + Math.round((Date.now() - t0) / 1000) + 's');
  if (!dead) return;

  const cleared = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, 3000);
  await sleep(1800);
  const room = await p.evaluate(() => {
    const r = SK_GAME.rooms.find(x => x.type === 'boss');
    return { st: r.state, door: SK_GAME.doorBlocked(r.id), chest: SK.G.chests.some(c => c.kind === 'weapon' && SK.world.roomAt(SK.G.map, c.x, c.y - 4, 0) === SK.G.map.rooms[r.id]),
      hudGone: !SK.bossHud.visible, props: SK.G.props.length };
  });
  check(tag + ': phòng trùm mở, có rương trùm, thanh máu tắt', cleared && room.door === false && room.chest && room.hudGone, JSON.stringify(room));
  await p.screenshot({ path: path.join(SHOTS, key + '-cleared.png') });

  await p.evaluate(() => SK_GAME.debug.teleportTo('end'));
  await sleep(300);
  await p.keyboard.down('KeyW');
  const next = NEXT[label];
  // Cổng sau 1-5 / 2-5 dừng cho chọn buff (như SK): bấm 1 khi ba thẻ hiện ra.
  const t0p = Date.now(); let went = false;
  while (Date.now() - t0p < 9000) {
    const st = await p.evaluate(() => ({ stage: SK_GAME.stage, state: SK_GAME.state, buffs: !!(document.getElementById('sk-buffs') && !document.getElementById('sk-buffs').hidden) }));
    if (next ? st.stage === next : st.state === 'victory') { went = true; break; }
    if (st.buffs) await p.keyboard.press('Digit1');
    await sleep(150);
  }
  await p.keyboard.up('KeyW');
  check(tag + ': tới được cổng → ' + (next || 'chiến thắng'), went, await p.evaluate(() => SK_GAME.stage + ' ' + SK_GAME.state));
  if (!next) await p.evaluate(() => SK.startRun());
  else await sleep(300);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /\[SK\].*(boss|AI class SKBoss)/i.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20260929); SK.on('playerHurt', () => { window.__hurt++; }); });
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    for (const [label, key] of FIGHTS) {
      try { await fight(p, label, key); } catch (e) { check(label + ' ' + key + ': chạy trọn', false, e.message.split('\n')[0]); }
    }
  } catch (e) { check('chạy trọn', false, e.message.split('\n')[0]); }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 4).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
