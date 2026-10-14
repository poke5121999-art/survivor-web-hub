/*
 * HUD lần hai (so với ảnh chụp bản gốc): nút bắn đổi sang "!!" cạnh vật tương tác, nhãn + hiệu ứng của cổng,
 * bảng tạm dừng gọn (làm tối nền, hàng buff đủ ô và đủ icon).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-hud2.js   (SK_URL để đổi địa chỉ,
 * SK_SHOTS = thư mục lưu ảnh chụp).
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || '';
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
  const shot = async name => { if (SHOTS) await p.screenshot({ path: SHOTS + '/' + name + '.png' }); };
  // Số điểm ảnh gần trắng (>= 245 cả ba kênh) trong rect CSS của một nút HUD: "!!" trắng, tâm ngắm xám ~175.
  const whites = path => p.evaluate(q => {
    const r = SK.hud.rect(q), c = SK.hudCtx.canvas, d = SK.view.dpr;
    const im = SK.hudCtx.getImageData(Math.round(r.x * d), Math.round(r.y * d), Math.round(r.w * d), Math.round(r.h * d)).data;
    let n = 0;
    for (let i = 0; i < im.length; i += 4) if (im[i] >= 245 && im[i + 1] >= 245 && im[i + 2] >= 245 && im[i + 3] > 200) n++;
    return n;
  }, path);
  const nextFrames = n => p.evaluate(k => new Promise(res => { let i = 0; const f = () => ++i >= k ? res() : requestAnimationFrame(f); f(); }), n);
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
    await p.evaluate(() => SK_GAME.debug.seed(20261014));
    await p.click('#sk-start');
    await p.waitForFunction(() => SK_GAME.state === 'stage', null, { timeout: 15000 });
    await sleep(2500);
    await p.evaluate(() => SK_GAME.debug.god(true));
    check('ảnh "!!" (event_normal) đã nạp', await p.evaluate(() => SK.hud.eventIconReady()));

    // --- 1. nút bắn: rương cạnh nhân vật
    await p.evaluate(() => { SK.G.interactTarget = null; });
    await sleep(200);
    const far = await whites('control/btn_atk/Image');
    check('xa vật tương tác: nút bắn vẫn là tâm ngắm (không có điểm trắng của "!!")',
      !(await p.evaluate(() => SK.G.interactTarget)) && far < 30, 'trắng ' + far);
    await shot('01-atk-crosshair');
    await p.evaluate(() => { const pl = SK.G.player; SK.G.chests.push({ kind: 'weapon', x: pl.x + 12, y: pl.y, open: false, t: 0, openT: 0, _t: 1 }); });
    await sleep(300);
    const near = await whites('control/btn_atk/Image');
    check('cạnh rương: có vật tương tác', !!(await p.evaluate(() => SK.G.interactTarget)));
    check('cạnh rương: nút bắn đổi sang "!!" (nhiều điểm trắng)', near > far + 150, `gần ${near} xa ${far}`);
    await shot('02-atk-interact');
    await p.evaluate(() => { const pl = SK.G.player; SK.G.chests.length = 0; SK.G.interactTarget = null; });
    await sleep(300);
    check('rời rương: nút bắn về tâm ngắm', (await whites('control/btn_atk/Image')) < 30);

    // --- 2. cổng: nhãn + hiệu ứng thật
    await p.evaluate(() => SK_GAME.debug.teleportTo('end'));
    await sleep(1500);
    const pt = await p.evaluate(() => SK.G.portal && { x: SK.G.portal.x, y: SK.G.portal.y });
    check('phòng cuối có cổng', !!pt);
    await p.evaluate(() => { const pl = SK.G.player, pt = SK.G.portal; pl.x = pt.x - 30; pl.y = pt.y; });
    await sleep(2200);   // chờ clip create_gate chạy xong
    const tgt = await p.evaluate(() => { const t = SK.G.interactTarget; return t && { portal: !!t.portal, label: t.label }; });
    check('đứng cách cổng ~30: vật tương tác là cổng, nhãn tên cổng', !!tgt && tgt.portal && tgt.label === 'Cửa Dịch Chuyển', JSON.stringify(tgt));
    const fx = await p.evaluate(() => { const h = SK.G._portalFx; return h && { name: h.name, tap: h.tapNode && h.tapNode.vis, particles: h.sys.reduce((n, s) => n + s.parts.length, 0), drawn: h.drawn }; });
    check('cổng là hiệu ứng transfer_gate gốc, có hạt', !!fx && fx.name === 'transfer_gate' && fx.particles > 0, JSON.stringify(fx));
    check('mũi tên chỉ xuống (tap) bật khi ở gần', !!fx && fx.tap === true);
    // chữ nhãn trắng nằm trên hud canvas: đếm điểm trắng quanh vị trí nhãn
    const lab = await p.evaluate(() => {
      const t = SK.G.interactTarget, v = SK.G.view, k = SK.view.scale * SK.view.dpr, c = SK.hudCtx;
      const x = (t.x - v.x) * k, y = (t.y - v.y) * k, w = 90 * k, h = 14 * k;
      const im = c.getImageData(Math.max(0, Math.round(x - w / 2)), Math.max(0, Math.round(y - h / 2)), Math.round(w), Math.round(h)).data;
      let n = 0;
      for (let i = 0; i < im.length; i += 4) if (im[i] >= 245 && im[i + 1] >= 245 && im[i + 2] >= 245 && im[i + 3] > 200) n++;
      return n;
    });
    check('nhãn cổng được vẽ (chữ trắng trên HUD)', lab > 40, 'điểm trắng ' + lab);
    check('cạnh cổng nút bắn là "!!"', (await whites('control/btn_atk/Image')) > 150);
    await shot('03-portal-near');
    await p.evaluate(() => { const pl = SK.G.player, pt = SK.G.portal; pl.x = pt.x - 80; pl.y = pt.y; });
    await sleep(400);
    check('đi xa cổng: không còn nhãn, mũi tên tắt',
      !(await p.evaluate(() => SK.G.interactTarget)) && (await p.evaluate(() => SK.G._portalFx.tapNode.vis)) === false);
    await shot('04-portal-far');
    // chạm nút "!!" vào cổng
    await p.evaluate(() => { const pl = SK.G.player, pt = SK.G.portal; pl.x = pt.x - 28; pl.y = pt.y; });
    await sleep(300);
    await p.evaluate(() => { SK.input.touchMode = true; });
    const r = await p.evaluate(() => SK.hud.rect('control/btn_atk'));
    await p.mouse.move(r.x + r.w / 2, r.y + r.h / 2); await p.mouse.down(); await sleep(80); await p.mouse.up();
    await sleep(300);
    check('bấm nút "!!" cạnh cổng → vào cổng', await p.evaluate(() => SK.G.phase) === 'portal');
    await p.evaluate(() => { SK.input.touchMode = false; });
    // Cổng có thể kéo theo bảng chọn buff giữ người chơi (G.hold): chọn thẻ đầu để đi tiếp, đồng thời đếm buff.
    await sleep(1200);
    const hold = await p.evaluate(() => ({ hold: !!SK.G.hold, choice: SK.ROOMS.choice.open, cards: SK.ROOMS.choice.cards.length, state: SK_GAME.state, phase: SK.G.phase }));
    out.push('  · sau cổng: ' + JSON.stringify(hold));
    if (hold.choice) { await p.evaluate(() => SK.ROOMS.pick(0)); await sleep(500); }
    await p.waitForFunction(() => SK.G.stageIdx > 0 && SK.G.phase === 'play' && SK_GAME.state === 'stage', null, { timeout: 30000 });
    check('qua cổng sang ải kế', await p.evaluate(() => SK.G.stageIdx) === 1);
    await sleep(500);

    // --- 3. bảng tạm dừng
    await p.evaluate(() => { for (let i = 1; i < 40; i++) if (SK.ROOMS.takeBuff(i)) break; });
    const nBuf = await p.evaluate(() => SK.G.player.buffs.length);
    await p.keyboard.press('Escape'); await sleep(600);
    await nextFrames(3);
    const win = await p.evaluate(() => SK.hud.rect('window_pause'));
    const k = 720 / 720;
    check('bảng tạm dừng gọn: không lớn hơn kích thước prefab (820x550 trên 1280x720)', win.w <= 820 * k + 1 && win.h <= 550 * k + 1 && win.h < 450,
      `${win.w.toFixed(0)}x${win.h.toFixed(0)}`);
    check('bảng nằm trọn trong màn', win.x >= 0 && win.y >= 0 && win.x + win.w <= 1280 && win.y + win.h <= 720);
    const dim = await p.evaluate(() => SK.hudCtx.getImageData(5, 5, 1, 1).data[3] / 255);
    check('nền sau bảng được làm tối', dim > 0.4, 'alpha ' + dim.toFixed(2));
    const bar = await p.evaluate(() => SK.hud.rect('window_pause/btn_bar1/btn_continue'));
    check('hàng nút nằm trong bảng', bar.y + bar.h <= win.y + win.h + 1 && bar.y >= win.y);
    const cells = await p.evaluate(() => ({ ...SK.hud.drawn, buffs: SK.G.player.buffs.length }));
    check('số icon buff vẽ = số buff đã chọn (' + nBuf + ')', cells.buffIcons === nBuf && nBuf >= 1, JSON.stringify(cells));
    check('hàng buff có thêm ô trống (+)', cells.buffCells > cells.buffIcons);
    await shot('05-pause-1buff');
    await p.evaluate(() => { for (let i = 1; i < 40; i++) if (SK.ROOMS.takeBuff(i)) break; });
    await nextFrames(3);
    const c2 = await p.evaluate(() => ({ ...SK.hud.drawn, buffs: SK.G.player.buffs.length }));
    check('chọn thêm buff → icon tăng theo', c2.buffIcons === c2.buffs && c2.buffs === nBuf + 1, JSON.stringify(c2));
    await shot('06-pause-2buff');
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
