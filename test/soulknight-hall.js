/*
 * Sảnh (phòng khách) của Hiệp Sĩ Linh Hồn (games/soulknight/js/hall.js), đi đúng luồng gốc bằng chuột + phím thật:
 * mở game → sảnh "Chọn nhân vật" → chạm Hiệp Sĩ → màn chọn nhân vật → Bắt đầu → điều khiển trong sảnh → đi lên cửa →
 * bảng chế độ chơi → Bắt đầu → 1-1.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-hall.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-hall');
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
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  try {
    await p.goto(URL);
    await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 8000);
    await sleep(800);
    const s0 = await p.evaluate(() => SK.hall.state);
    check('mở game vào sảnh, chế độ chọn nhân vật', s0.mode === 'select', JSON.stringify(s0));
    check('Hiệp Sĩ (đã mở sẵn) đứng trong sảnh', s0.npcs.indexOf('knight') >= 0, s0.npcs.join(','));
    const lit = await p.evaluate(() => { const c = SK.hudCtx, d = c.getImageData(0, 0, c.canvas.width, c.canvas.height).data; let n = 0; for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n / (d.length / 400); });
    check('ảnh nền sảnh vẽ ra (không phải màn đen)', lit > 0.15, (lit * 100).toFixed(0) + '% điểm sáng');
    await p.screenshot({ path: path.join(SHOTS, 'hall-select.png') });

    const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
    await p.mouse.click(at.x, at.y);
    const sel = await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
    check('chạm Hiệp Sĩ → màn chọn nhân vật', sel, JSON.stringify(at));

    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
    const s1 = await p.evaluate(() => SK.hall.state);
    check('Bắt đầu → về sảnh, điều khiển Hiệp Sĩ', s1.mode === 'walk' && s1.me && s1.me.id === 'knight', JSON.stringify(s1.me));

    await p.keyboard.down('KeyD'); await sleep(500); await p.keyboard.up('KeyD');
    const s2 = await p.evaluate(() => SK.hall.state.me);
    check('giữ D thì nhân vật đi sang phải', s2.x > s1.me.x + 1, s1.me.x.toFixed(2) + ' → ' + s2.x.toFixed(2));

    await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 5; });
    await p.keyboard.down('KeyS'); await sleep(2500); await p.keyboard.up('KeyS');
    const blocked = await p.evaluate(() => SK.hall.state.me.y);
    check('tường dưới chặn lại (không đi ra ngoài sảnh)', blocked > -11, 'y ' + blocked.toFixed(2));
    await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
    await p.screenshot({ path: path.join(SHOTS, 'hall-walk.png') });
    await p.keyboard.down('KeyW');
    const modes = await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
    await p.keyboard.up('KeyW');
    check('đi lên cửa vào hầm → bảng chế độ chơi', modes);

    await p.click('#hs-mode-go');
    const run = await until(p, () => SK_GAME.state === 'stage' && SK_GAME.stage === '1-1', null, 4000);
    check('Bắt đầu chế độ màn chơi → 1-1 với Hiệp Sĩ', run && (await p.evaluate(() => SK.G.player.hero)) === 'knight');
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ảnh: ${SHOTS}\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
