/*
 * Chủ đề ngẫu nhiên mỗi tầng cho Hiệp Sĩ Linh Hồn (games/soulknight).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-themes.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-themes/.
 *
 * 1. Không ghim: 60 lượt chơi với 60 seed, chủ đề mỗi tầng thuộc đúng tầng đó, cả 5 ải của tầng cùng chủ đề,
 *    và đủ 13 chủ đề xuất hiện.
 * 2. Ghim từng chủ đề bằng ?themes=: ải đầu tầng đúng chủ đề, phòng đánh khoá và có quái,
 *    ải x-5 có trùm xuất hiện, không lỗi trang.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-themes');
fs.mkdirSync(SHOTS, { recursive: true });
const ANCHOR = ['forest', 'castle', 'volcano'];

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
async function open(b, query) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(BASE + query);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  return { p, errs };
}

async function rolls(b) {
  const { p, errs } = await open(b, '');
  const r = await p.evaluate(() => {
    const out = { bad: [], seen: {}, tiers: {} };
    for (let s = 1; s <= 60; s++) {
      SK_GAME.debug.seed(s);
      SK.startRun('knight');
      for (const level of [1, 2, 3]) {
        const themes = [...new Set(SK.STAGES.filter(st => st.level === level).map(st => st.theme))];
        if (themes.length !== 1 || !SK.tierThemes(level).includes(themes[0])) out.bad.push(s + ':' + level + ':' + themes.join('/'));
        out.seen[themes[0]] = (out.seen[themes[0]] || 0) + 1;
      }
    }
    for (const level of [1, 2, 3]) out.tiers[level] = SK.tierThemes(level);
    out.first = SK_GAME.stage + ' ' + SK.G.stage.theme;
    return out;
  });
  check('mỗi tầng một chủ đề, đúng tầng (60 lượt)', !r.bad.length, r.bad.slice(0, 5).join(' '));
  const all = [].concat(r.tiers[1], r.tiers[2], r.tiers[3]);
  const missing = all.filter(t => !r.seen[t]);
  check('đủ ' + all.length + ' chủ đề xuất hiện', all.length === 13 && !missing.length, JSON.stringify(r.seen) + (missing.length ? ' thiếu ' + missing : ''));
  check('không lỗi trang khi bốc chủ đề', !errs.length, errs.slice(0, 3).join(' | '));
  await p.close();
  return r.tiers;
}

async function theme(b, level, t) {
  const pin = ANCHOR.slice(); pin[level - 1] = t;
  const { p, errs } = await open(b, '&themes=' + pin.join(','));
  await p.evaluate(() => SK_GAME.debug.seed(7));
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage', null, 4000);
  const first = level + '-1';
  const st = await p.evaluate(label => {
    if (SK_GAME.stage !== label) SK_GAME.debug.stage(label);
    SK_GAME.debug.god(true); SK_GAME.debug.pet(false);
    return SK_GAME.stage + ' ' + SK.G.stage.theme;
  }, first);
  check(t + ': ' + first + ' đúng chủ đề', st === first + ' ' + t, st);
  await until(p, () => SK_GAME.phase === 'play', null, 4000);
  await p.evaluate(() => { SK_GAME.debug.teleportTo('battle'); });
  const fought = await until(p, () => SK_GAME.room != null && SK_GAME.rooms[SK_GAME.room].state === 'locked' && SK_GAME.enemyCount > 0, null, 6000);
  const n = await p.evaluate(() => SK_GAME.enemyCount);
  check(t + ': phòng đánh khoá và có quái', fought, n + ' quái');
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, t + '-battle.png') });

  const boss = level + '-5';
  await p.evaluate(label => SK_GAME.debug.stage(label), boss);
  await until(p, () => SK_GAME.phase === 'play', null, 4000);
  await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  const spawned = await until(p, () => SK.G.enemies.some(e => e.bossKey), null, 6000);
  const info = await p.evaluate(() => SK.G.stage.theme + ' ' + SK.G.enemies.filter(e => e.bossKey).map(e => e.bossKey).join('+'));
  check(t + ': ' + boss + ' có trùm', spawned && info.startsWith(t + ' '), info);
  await sleep(1400);
  await p.screenshot({ path: path.join(SHOTS, t + '-boss.png') });
  check(t + ': không lỗi trang', !errs.length, errs.slice(0, 3).join(' | '));
  await p.close();
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const tiers = await rolls(b);
    for (const level of [1, 2, 3]) for (const t of tiers[level]) await theme(b, level, t);
  } catch (e) {
    check('chạy hết kịch bản', false, e.message);
  }
  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail + '   Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
