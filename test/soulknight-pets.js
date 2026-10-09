/*
 * Thú cưng đi theo của Hiệp Sĩ Linh Hồn (games/soulknight/js/pets.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-pets.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-pets');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));

    const pet = () => p.evaluate(() => { const a = SK.G.pet, pl = SK.G.player; return a && { id: a.id, st: a.st, d: Math.hypot(a.x - pl.x, a.y - pl.y) }; });
    const s0 = await pet();
    check('vào 1-1 có mèo đen pet0 cạnh người chơi', s0 && s0.id === 'pet0' && s0.d < 40, JSON.stringify(s0));

    await p.keyboard.down('KeyD'); await sleep(1500); await p.keyboard.up('KeyD');
    await sleep(600);
    const s1 = await pet();
    check('người chơi chạy 1,5 s thì thú cưng chạy theo, dừng lại trong 3 đv', s1.d < 3 * 16 + 8, 'cách ' + s1.d.toFixed(1) + ' px');

    await p.evaluate(() => { const pl = SK.G.player, a = SK.G.pet; a.x = pl.x + 25 * 16; });
    await sleep(300);
    const s2 = await pet();
    check('bị bỏ xa quá 20 đv thì bay về chủ', s2.d < 3 * 16, 'cách ' + s2.d.toFixed(1) + ' px');

    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    await until(p, () => SK_GAME.enemyCount > 0, null, 5000);
    const sawAtk = await p.evaluate(() => new Promise(res => {
      const hp0 = SK_GAME.enemyHp, t0 = performance.now();
      let atk = false;
      (function poll() {
        if (SK.G.pet && SK.G.pet.st === 'atk') atk = true;
        if (performance.now() - t0 > 12000 || (atk && SK_GAME.enemyHp < hp0)) return res({ atk, hp0, hp: SK_GAME.enemyHp });
        requestAnimationFrame(poll);
      })();
    }));
    await p.screenshot({ path: path.join(SHOTS, 'pet-fight.png') });
    check('không bắn, thú cưng tự cắn làm máu quái giảm', sawAtk.atk && sawAtk.hp < sawAtk.hp0, JSON.stringify(sawAtk));

    await p.evaluate(() => SK_GAME.debug.stage('1-2'));
    await sleep(500);
    const s3 = await pet();
    check('sang ải mới thú cưng đi cùng', s3 && s3.d < 40, JSON.stringify(s3));
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ảnh: ${SHOTS}\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
