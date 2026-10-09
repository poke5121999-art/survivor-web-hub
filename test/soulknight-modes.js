/*
 * Chế độ chơi của Hiệp Sĩ Linh Hồn (games/soulknight): độ khó Lợi Hại của Chế độ Ải.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-modes.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-modes/.
 *
 * 1. Hồ sơ mới: nút "Độ khó Lợi Hại" khoá (chưa vượt Chế độ Ải lần nào).
 * 2. Hồ sơ đã thắng một lượt: bấm "Độ khó Lợi Hại" → chọn được, vào trận mang cờ Lợi Hại.
 * 3. Trong trận Lợi Hại: trúng 1 sát thương mất 2; đợt quái đông hơn và ≥ 40% tinh anh; trùm máu ×1,5 vẽ tô đỏ tinh anh.
 * 4. Thắng Lợi Hại lần đầu: thưởng thêm 5000 đá quý.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-modes');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
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

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => SK.lobby.openModes());
  const locked = await p.evaluate(() => {
    const bt = document.querySelector('#hs-mode-diff button[data-d="badass"]');
    return { shown: !!bt, dis: bt && bt.disabled, txt: bt && bt.textContent, set: SK.profile.setBadass(true), bad: SK.profile.badass };
  });
  check('hồ sơ mới: nút "Độ khó Lợi Hại" khoá, không bật được', locked.shown && locked.dis && !locked.set && !locked.bad, JSON.stringify(locked));

  await p.evaluate(() => { localStorage.setItem('sk.profile.v1', JSON.stringify({ won: { knight: 1 }, gems: 0 })); });
  await p.reload();
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => SK.lobby.openModes());
  await p.click('#hs-mode-diff button[data-d="badass"]');
  await sleep(150);
  await p.screenshot({ path: path.join(SHOTS, 'modes-badass.png') });
  const picked = await p.evaluate(() => ({ sel: document.querySelector('#hs-mode-diff button.sel').dataset.d, bad: SK.profile.badass }));
  check('đã thắng một lượt: bấm "Độ khó Lợi Hại" → chọn được', picked.sel === 'badass' && picked.bad, JSON.stringify(picked));

  await p.evaluate(() => { document.getElementById('hs-modes').hidden = true; SK_GAME.debug.seed(5); });
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 6000);
  const run = await p.evaluate(() => {
    const G = SK.G, pl = G.player;
    const a0 = pl.armor, h0 = pl.hp;
    pl.invulT = 0;
    SK.hurtPlayer(G, 1);
    const lost = (a0 - pl.armor) + (h0 - pl.hp);
    const room = G.map.rooms.find(r => r.type === 'battle');
    const sample = on => {
      G.badass = on; let n = 0, ex = 0;
      for (let i = 0; i < 40; i++) for (const w of G.buildWaves(room)) for (const id of w) { n++; if (id.startsWith('ex_')) ex++; }
      return { n: n / 40, ex: ex / Math.max(1, n) };
    };
    const nor = sample(false), bad = sample(true);
    return { flag: G.badass, lost, nor, bad };
  });
  check('vào trận mang cờ Lợi Hại', run.flag === true);
  check('Lợi Hại: trúng 1 sát thương mất 2 (+1 mọi nguồn)', run.lost === 2, 'mất ' + run.lost);
  check('Lợi Hại: đợt quái đông hơn, ≥ 35% tinh anh', run.bad.n > run.nor.n * 1.15 && run.bad.ex >= 0.35,
    'thường ' + run.nor.n.toFixed(1) + ' quái/' + (run.nor.ex * 100).toFixed(0) + '% · Lợi Hại ' + run.bad.n.toFixed(1) + '/' + (run.bad.ex * 100).toFixed(0) + '%');

  const boss = await p.evaluate(() => {
    SK.bossDebug.force = 'boss08'; SK.bossDebug.hold = true;
    SK_GAME.debug.god(true); SK_GAME.debug.stage('1-5');
    return true;
  });
  await until(p, () => SK_GAME.phase === 'play', null, 5000);
  await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  const spawned = await until(p, () => SK.G.enemies.some(e => e.bossKey === 'boss08'), null, 6000);
  await sleep(3500);
  await p.screenshot({ path: path.join(SHOTS, 'boss-badass.png') });
  const bi = await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey === 'boss08'); return e && { hp: e.hpMax, bad: e.badass }; });
  check('Lợi Hại: Thầy Tế Goblin máu 480 × 1,5 = 720, vẽ tô đỏ tinh anh', boss && spawned && bi && bi.hp === 720 && bi.bad, JSON.stringify(bi));

  const gem = await p.evaluate(() => {
    const g0 = SK.profile.gems;
    SK.emit('runEnd', SK.G, { won: true, stage: '3-5', kills: 0, gold: 0 });
    return SK.profile.gems - g0;
  });
  check('thắng Lợi Hại lần đầu: +5000 đá quý thưởng', gem >= 5000, '+' + gem);

  // ---- Khu Thí Luyện: 15 ải, ải nào cũng chỉ phòng khởi đầu + rương + phòng phụ + phòng trùm, trùm không lặp
  await p.evaluate(() => { SK.bossDebug.force = null; SK.bossDebug.hold = false; SK.profile.setBadass(false); SK.lobby.enter(); SK_GAME.debug.seed(9); SK.lobby.launch('knight', 'bossrush'); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 6000);
  const br = await p.evaluate(() => ({
    mode: SK_GAME.mode, n: SK.STAGES.length, allBoss: SK.STAGES.every(s => s.boss && s.br), labels: SK.STAGES.map(s => s.label).join(','),
    rooms: SK_GAME.rooms.map(r => r.type).sort().join(','), badass: SK.G.badass
  }));
  check('Khu Thí Luyện: 15 ải 1-1..3-5, ải nào cũng là trận trùm', br.mode === 'bossrush' && br.n === 15 && br.allBoss, br.labels);
  check('Khu Thí Luyện: ải chỉ có khởi đầu, rương, phòng phụ, phòng trùm, cổng (không phòng quái)', br.rooms === 'boss,chest,end,special,start', br.rooms);
  const seen = [];
  for (const label of ['1-1', '1-2', '1-3']) {
    await p.evaluate(l => { if (SK_GAME.stage !== l) SK_GAME.debug.stage(l); SK_GAME.debug.god(true); }, label);
    await until(p, () => SK_GAME.phase === 'play', null, 5000);
    await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
    const ok = await until(p, () => SK.G.enemies.some(e => e.bossKey && e.room === SK.G.room), null, 6000);
    seen.push(ok ? await p.evaluate(() => SK.G.enemies.find(e => e.bossKey && e.room === SK.G.room).bossGroup + '@' + SK.G.stage.theme) : 'không có');
  }
  await p.screenshot({ path: path.join(SHOTS, 'bossrush-1-3.png') });
  const keys = seen.map(x => x.split('@')[0]);
  check('Khu Thí Luyện: ba ải đầu đều có trùm tầng 1, không lặp', keys.every(k => k !== 'không có') && new Set(keys).size === 3, seen.join(' · '));
  check('không lỗi trang', !errs.length, errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail + '   Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
