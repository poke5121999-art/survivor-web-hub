/*
 * HUD dựng từ prefab gốc (games/soulknight/tools/ui, js/ugui.js): thanh trạng thái, nút tạm dừng, bảng tạm dừng.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-hud.js   (SK_URL để chạy trên Pages)
 * Bấm bằng chuột thật vào đúng rect mà HUD vẽ (SK.hud.rect), không gọi thẳng hàm tạm dừng.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const rect = path => p.evaluate(q => SK.hud.rect(q), path);
  const clickNode = async path => { const r = await rect(path); await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await sleep(250); };
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
    await p.evaluate(() => SK_GAME.debug.seed(20260929));
    await p.click('#sk-start');
    await p.waitForFunction(() => SK_GAME.state === 'stage', null, { timeout: 15000 });
    await sleep(2500);
    await p.evaluate(() => SK_GAME.debug.god(true));

    const full = await rect('state_bar/hp_bar/img');
    await p.evaluate(() => { const pl = SK.G.player; pl.hp = pl.hpMax / 2; });
    await sleep(100);
    const half = await rect('state_bar/hp_bar/img');
    check('thanh máu co theo máu (sizeDelta.x = rộng × hiện tại/tối đa)', Math.abs(half.w / full.w - 0.5) < 0.02,
      (half.w / full.w).toFixed(3));
    check('thanh trạng thái nằm góc trên trái', full.x < 200 && full.y < 120, `x ${full.x.toFixed(0)} y ${full.y.toFixed(0)}`);
    const mm = await rect('map_info_root/miniMap');
    check('bản đồ nhỏ ở góc phải, cách mép 20 đơn vị canvas', Math.abs(1280 - (mm.x + mm.w) - 20) < 2,
      `mép phải ${(mm.x + mm.w).toFixed(1)}`);

    await p.keyboard.press('Escape'); await sleep(250);
    check('Esc mở bảng tạm dừng, thế giới đứng yên', await p.evaluate(() => SK_GAME.state) === 'pause');
    const t0 = await p.evaluate(() => SK.G.player.x);
    await p.keyboard.down('KeyD'); await sleep(400); await p.keyboard.up('KeyD');
    check('lúc tạm dừng nhân vật không đi', await p.evaluate(() => SK.G.player.x) === t0);
    await clickNode('window_pause/btn_bar1/btn_continue');
    check('bấm nút tiếp tục → về ải', await p.evaluate(() => SK_GAME.state) === 'stage');

    await clickNode('info_bar/btn_pause');
    check('bấm nút tạm dừng trên HUD mở bảng', await p.evaluate(() => SK_GAME.state) === 'pause');
    await clickNode('window_pause/btn_bar1/btn_home');
    check('nút về sảnh hỏi lại trước (hàng nút xác nhận hiện ra)', (await rect('window_pause/btn_bar2/btn_yes')).w > 0 &&
      await p.evaluate(() => SK_GAME.state) === 'pause');
    await clickNode('window_pause/btn_bar2/btn_no');
    check('bấm "không" vẫn ở bảng tạm dừng', await p.evaluate(() => SK_GAME.state) === 'pause');
    await clickNode('window_pause/btn_bar1/btn_home');
    await clickNode('window_pause/btn_bar2/btn_yes');
    check('xác nhận về sảnh → sảnh', await p.evaluate(() => SK_GAME.state) === 'lobby');
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
