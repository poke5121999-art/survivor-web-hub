/*
 * Kiểm thử trùm cho Hiệp Sĩ Linh Hồn (games/soulknight/js/bosses.js + data/sk-bosses86.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-bosses.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-bosses/.  Chọn trùm: SK_BOSSES="1-5:boss08,3-5:boss18".
 *
 * Mỗi trùm (ép chọn qua SK.bossDebug.force): nhảy tới màn x-5, vào phòng trùm, bật god, xem màn giới thiệu.
 * 1. Đối chiếu số đo từ bản 8.6: máu = enemies.Hp × 1.2, số viên mỗi loạt của vài đòn (ép đòn bằng SK.bossDebug.next).
 * 2. GIỮ PHÍM J bắn thật bằng súng khởi đầu (p.dmgMul nguyên để mỗi trận ~18 giây): thanh máu hiện, trùm dùng
 *    ≥2 kiểu đánh, đòn trúng người chơi, trùm chết, phòng mở, có rương trùm, đi qua cổng sang màn kế (3-5 → chiến thắng).
 * Số trong bảng dưới chép tay từ dữ liệu gốc (không đọc lại từ sk-bosses86.js) để kiểm thử không dùng chung giả định với mã.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1';
const ROOT = path.join(__dirname, '..', 'games', 'soulknight');
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

// Máu [ĐO config/enemies.json Hp × 1.2 — khớp wiki 480/600/720/960...]
const HP = {
  boss08: 480, boss07: 600, boss14: 510, boss19: 480, boss25: 480,
  boss01: 720, boss01_2: 960, boss02: 600, boss20: 840,
  boss11: 960, boss12_1: 600, boss12_2: 600, boss18: 984
};
// Số viên mỗi loạt: [đòn, {prefab đạn: số viên}, nguồn]. '%8' = bội số của 8.
const PROBES = {
  boss08: [['atk4', { bullet_e_30: 6, bullet_e_1: 18 }, 'WIKI 6 cầu + ĐO RGBDelayDivision c_count 3']],
  boss14: [['atk5', { bullet_e_50: 1, bullet_e_1: '%8' }, 'ĐO RGSBullet01 angle 45 → 8 viên mỗi nhịp']],
  boss25: [['ring', { bullet_e_88: 126 }, 'ĐO Boss25Skill 3 lượt × 6 cụm × 7 viên'], ['follow', { bullet_e_87: 4 }, 'ĐO prefab 4 cầu']],
  boss01: [['boss01_atk3', { bullet_e_7: 6 }, 'WIKI 6 cầu']],
  boss02: [['boss02_atk4', { bullet_e_5: 32, bullet_e_9: 24, bullet_e_10: 24 }, 'ĐO prefab đội hình 16/12/12 × 2 sự kiện InAtk04 của clip']],
  boss11: [['atk2', { bullet_e_39: 8 }, 'WIKI 8 viên (chưa nổi giận)']],
  boss18: [['boss02_atk2', { bullet_e_77: 3 }, 'ĐO prefab 3 cầu (Anubis dùng clip boss02_*)']]
};
const GROUP = { boss12_parent: ['boss12_1', 'boss12_2'] };

const FIGHTS = (process.env.SK_BOSSES ||
  '1-5:boss08,1-5:boss07,1-5:boss14,1-5:boss19,1-5:boss25,2-5:boss01,2-5:boss01_2,2-5:boss02,2-5:boss20,3-5:boss11,3-5:boss18,3-5:boss12_parent')
  .split(',').map(s => s.split(':'));
const NEXT = { '1-5': '2-1', '2-5': '3-1' };

async function probe(p, atk, ms) {
  await until(p, () => { const e = SK.G.enemies.find(x => x.bossKey && x.st !== 'dead'); return e && !e.atk && e.st !== 'spawn'; }, null, 8000);
  return p.evaluate(([atk, ms]) => new Promise(res => {
    const G = SK.G, e = G.enemies.find(x => x.bossKey && x.st !== 'dead'), P = G.player;
    const [x, y] = SK.freeNear([e.x + 50, e.y + 90]); P.x = x; P.y = y;
    for (const b of G.bullets) if (b.side === 'e') b.dead = true;
    const seen = new Set(), cnt = {};
    SK.bossDebug.next = atk; e.cd = 0; e.busy = 0;
    const t0 = performance.now();
    (function tick() {
      for (const b of G.bullets) if (b.side === 'e' && !seen.has(b)) { seen.add(b); const k = b.pname || '?'; cnt[k] = (cnt[k] || 0) + 1; }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else res({ cnt, started: !SK.bossDebug.next, used: e.lastAtk });
    })();
  }), [atk, ms]);
}

async function fight(p, label, key) {
  const tag = label + ' ' + key;
  const ok = await p.evaluate(([label, key]) => {
    SK.bossDebug.force = key; SK.bossDebug.hold = true;
    if (!SK_GAME.debug.stage(label)) return false;
    SK_GAME.debug.god(true); SK_GAME.debug.pet(false);
    window.__hurt = 0;
    return true;
  }, [label, key]);
  check(tag + ': vào màn + phòng trùm', ok);
  if (!ok) return;
  await until(p, () => SK_GAME.phase === 'play', null, 4000);
  await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  const want = GROUP[key] || [key];
  const spawned = await until(p, w => w.every(k => SK.G.enemies.some(e => e.bossKey === k)), want, 4000);
  check(tag + ': trùm xuất hiện', spawned);
  if (!spawned) return;
  await until(p, () => SK.bossHud.intro, null, 2000);
  await sleep(1400);
  await p.screenshot({ path: path.join(SHOTS, key + '-intro.png') });
  const introSeen = await p.evaluate(() => SK.bossHud.intro);
  await until(p, () => SK.bossHud.visible, null, 4000);

  const hps = await p.evaluate(w => w.map(k => Math.round(SK.G.enemies.find(e => e.bossKey === k).hpMax)), want);
  const hpWant = want.map(k => HP[k]);
  check(tag + ': máu trùm đúng số đo', hps.join() === hpWant.join(), hps.join('+') + ' (cần ' + hpWant.join('+') + ')');

  for (const [atk, exp, src] of PROBES[key] || []) {
    const r = await probe(p, atk, 2600);
    const bad = Object.entries(exp).filter(([k, n]) => n === '%8' ? !(r.cnt[k] > 0 && r.cnt[k] % 8 === 0) : r.cnt[k] !== n);
    check(tag + ': đòn ' + atk + ' đúng số viên', r.started && !bad.length, JSON.stringify(r.cnt) + ' · ' + src);
  }
  await p.evaluate(() => { SK.bossDebug.hold = false; });

  // Súng khởi đầu của Hiệp Sĩ + p.dmgMul nguyên (lõi làm tròn sát thương) để mỗi trận ~18 giây.
  const setup = await p.evaluate(() => {
    const pl = SK.G.player, w = pl.weapons[0].def, id = pl.weapons[0].id;
    pl.cur = 0;
    const dps = w.dmg * w.rps * (w.pellets || 1);
    const hp = SK.G.enemies.filter(e => e.bossKey && e.room === SK.G.room).reduce((s, e) => s + e.hpMax, 0);
    pl.dmgMul = Math.max(1, Math.round(hp / (dps * 0.6 * 18)));
    return { best: id, dps, mul: pl.dmgMul, hp };
  });
  await p.keyboard.down('KeyJ');
  const t0 = Date.now();
  let mid = false, dead = false, hudSeen = false, barShot = false;
  while (Date.now() - t0 < 80000) {
    const s = await p.evaluate(() => {
      const bs = SK.G.enemies.filter(e => e.bossKey && e.room === SK.G.room);
      SK.G.player.energy = SK.G.player.energyMax;
      return { dead: bs.every(b => b.st === 'dead'), hud: SK.bossHud.visible };
    });
    hudSeen = hudSeen || s.hud;
    if (s.hud && !barShot) { barShot = true; await p.screenshot({ path: path.join(SHOTS, key + '-bar.png'), clip: { x: 300, y: 0, width: 680, height: 90 } }); }
    if (!mid && Date.now() - t0 > 5500) { mid = true; await p.screenshot({ path: path.join(SHOTS, key + '-fight.png') }); }
    if (s.dead) { dead = true; break; }
    await sleep(150);
  }
  await sleep(700);
  await p.screenshot({ path: path.join(SHOTS, key + '-death.png') });
  const after = await p.evaluate(() => {
    const bs = SK.G.enemies.filter(e => e.bossKey && e.room === SK.G.room), used = {};
    for (const b of bs) for (const k in b.used) used[k] = (used[k] || 0) + b.used[k];
    return { used, hurt: window.__hurt, left: bs.reduce((s, b) => s + Math.max(0, b.hp), 0) };
  });
  check(tag + ': màn giới thiệu trùm', introSeen);
  check(tag + ': thanh máu trùm hiện', hudSeen);
  const kinds = Object.keys(after.used);
  check(tag + ': dùng ≥2 kiểu đánh', kinds.length >= 2, kinds.map(k => k + '×' + after.used[k]).join(' '));
  check(tag + ': đòn của trùm trúng người chơi', after.hurt > 0, after.hurt + ' lần');
  check(tag + ': bắn thật hạ được trùm', dead, setup.best + ' ×' + setup.mul + ' · máu ' + setup.hp + ' · còn ' + Math.round(after.left) + ' · ' + Math.round((Date.now() - t0) / 1000) + 's');
  // Slime Lớn chết còn nhả Slime con: vẫn giữ J để dọn phòng.
  const cleared = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, dead ? 12000 : 500);
  await p.keyboard.up('KeyJ');
  if (!dead) return;
  await sleep(1800);
  const room = await p.evaluate(() => {
    const r = SK_GAME.rooms.find(x => x.type === 'boss');
    return { st: r.state, door: SK_GAME.doorBlocked(r.id), chest: SK.G.chests.some(c => c.kind === 'weapon' && SK.world.roomAt(SK.G.map, c.x, c.y - 4, 0) === SK.G.map.rooms[r.id]),
      hudGone: !SK.bossHud.visible };
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
  // Chưa có thẻ <script src="data/sk-bosses86.js"> trong index.html thì nạp kèm ngay trước bosses.js.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tagged = /data\/sk-bosses86\.js/.test(html);
  if (!tagged) {
    await p.route('**/js/bosses.js*', route => route.fulfill({ contentType: 'application/javascript',
      body: fs.readFileSync(path.join(ROOT, 'data', 'sk-bosses86.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'js', 'bosses.js'), 'utf8') }));
  }
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
  if (!tagged) console.log('\n  lưu ý: index.html chưa nạp data/sk-bosses86.js — kiểm thử tự chèn trước bosses.js');
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
