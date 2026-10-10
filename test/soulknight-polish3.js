/*
 * Đợt polish 3 của Hiệp Sĩ Linh Hồn: màn tải (dòng mẹo ở 92%, kim cương quay), cột sáng vào ải, trùm nổi giận, hộp thoại + SKIP,
 * công tắc "Bỏ qua cốt truyện" của Thần Điện (games/soulknight/js/loading.js, polish3.js, bosses.js, defence3.js).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-polish3.js   (SK_URL: bản khác; SK_SHOTS: thư mục ảnh)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const os = require('os');
const fs = require('fs');

const BASE = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-polish3');
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
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(60); }
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await p.goto(BASE + '?quick=1&themes=forest,castle,volcano');
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261010); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 5000);
    await p.evaluate(() => SK_GAME.debug.god(true));

    // ============ 1. màn tải: dòng mẹo 92%, kim cương
    await p.evaluate(() => { SK.G.hold = true; SK.G.phase = 'portal'; SK.emit('portalEnter', SK.G, SK.G.stage); if (SK.ROOMS && SK.ROOMS.choice) SK.ROOMS.choice.open = false; });
    await until(p, () => SK.loading.on && SK.loading.t > 0.5 && SK.loading.diamond.drawn > 0, null, 5000);
    const m = await p.evaluate(() => {
      const ch = SK.ROOMS && SK.ROOMS.choice; window.__ch = ch && ch.open;
      const c = SK.hudCtx.canvas, r = SK.loading.rect('Tip'), d = SK.loading.diamond;
      return { H: c.height, W: c.width, tipMid: (r.y + r.h / 2) / c.height, tipTxt: SK.loading.text('Tip'), dx: d.x / c.width, dy: d.y / c.height, ds: d.s / c.height, drawn: d.drawn, rot: d.rot };
    });
    check('dòng mẹo có chữ và nằm ở 92% chiều cao (gốc 266/288 = 92,4%)', m.tipTxt && Math.abs(m.tipMid - 0.92) < 0.012, 'giữa dòng ở ' + (m.tipMid * 100).toFixed(1) + '%');
    check('kim cương quay vẽ ở góc phải dưới (95% x 86%) như clip', m.drawn > 0 && Math.abs(m.dx - 0.95) < 0.01 && Math.abs(m.dy - 0.86) < 0.01, 'tâm ' + (m.dx * 100).toFixed(1) + '% x ' + (m.dy * 100).toFixed(1) + '%, đã vẽ ' + m.drawn + ' lần');
    const r1 = await p.evaluate(() => SK.loading.diamond.rot); await sleep(300);
    const r2 = await p.evaluate(() => SK.loading.diamond.rot);
    check('kim cương đang quay (góc đổi theo thời gian)', Math.abs(r2 - r1) > 1e-3, r1.toFixed(3) + ' → ' + r2.toFixed(3));
    // điểm ảnh: ô quanh tâm kim cương phải trắng, nền ở chỗ trống phải xám tối
    const px = await p.evaluate(() => {
      const c = SK.hudCtx.canvas, x = c.getContext('2d'), d = SK.loading.diamond;
      const at = (a, b) => Array.from(x.getImageData(Math.round(a), Math.round(b), 1, 1).data);
      return { mid: at(d.x, d.y), far: at(c.width * 0.8, c.height * 0.86) };
    });
    check('điểm ảnh tại tâm kim cương sáng, chỗ nền cạnh đó tối', px.mid[0] > 140 && px.far[0] < 60, JSON.stringify(px));
    await p.screenshot({ path: path.join(SHOTS, 'loading.png') });
    await p.evaluate(() => { SK.G.hold = false; });

    // ============ 2. cột sáng vào ải
    await p.evaluate(() => { SK.loading.on = false; SK.emit('stageEnter', SK.G, SK.G.stage); });
    await until(p, () => SK.polish3.beam.on && SK.polish3.beam.w > 8, null, 3000);
    const bm = await p.evaluate(() => {
      const c = SK.hudCtx.canvas, x = c.getContext('2d'), G = SK.G, cam = G.view || G.cam, v = SK.view;
      const k = c.width / v.w, px = (G.player.x - cam.x) * k, py = (G.player.y - cam.y) * k;
      const at = (a, b) => Array.from(x.getImageData(Math.round(a), Math.round(b), 1, 1).data);
      return { w: SK.polish3.beam.w, above: at(px, py * 0.2), side: at(px + SK.polish3.beam.w * 3 * k, py * 0.2), top: at(px, 3) };
    });
    check('cột sáng hiện khi vào ải: rộng, điểm ảnh trên đầu nhân vật trắng, bên cạnh tối', bm.w > 8 && bm.above[0] > 200 && bm.above[1] > 200 && bm.above[2] > 200 && bm.side[0] < 100, JSON.stringify(bm));
    await p.screenshot({ path: path.join(SHOTS, 'beam1.png') });
    await until(p, () => SK.polish3.beam.on && SK.polish3.beam.w < 4, null, 3000);
    const thin = await p.evaluate(() => SK.polish3.beam.w);
    check('cột thu mảnh dần (như ?t=5.4 của clip)', thin < 4, 'rộng ' + thin.toFixed(2));
    await p.screenshot({ path: path.join(SHOTS, 'beam2.png') });
    check('cột sáng tắt sau ~0,9 s', await until(p, () => !SK.polish3.beam.on, null, 3000));

    // ============ 3. trùm dưới ngưỡng máu đổi trạng thái
    await p.evaluate(() => { SK.bossDebug.force = 'boss08'; SK_GAME.debug.stage('1-5'); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
    await until(p, () => SK_GAME.phase === 'play', null, 5000);
    await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
    check('trùm boss08 xuất hiện', await until(p, () => SK.G.enemies.some(e => e.bossKey === 'boss08'), null, 5000));
    await until(p, () => SK.bossHud.visible, null, 6000);
    const er = await p.evaluate(() => new Promise(res => {
      const e = SK.G.enemies.find(x => x.bossKey === 'boss08'); window.BOSS = e;
      e.hp = e.hpMax * 0.56;
      setTimeout(() => {
        const before = e.enraged === true; e.hp = e.hpMax * 0.39;
        setTimeout(() => res({ before, after: e.enraged === true, pct: +(e.hp / e.hpMax).toFixed(2) }), 600);
      }, 600);
    }));
    check('trùm ở 56% máu chưa nổi giận, xuống 39% thì nổi giận (e.enraged)', er.before === false && er.after === true, JSON.stringify(er));
    

    // ============ 4. hộp thoại + SKIP
    await p.evaluate(() => { SK.polish3.say('Zulan Di Tích', ['Ngươi phải... bảo vệ...', 'Câu hai.']); });
    check('hộp thoại hiện, có vùng SKIP', await until(p, () => SK.polish3.dialog.on && SK.polish3.dialog.skipRect, null, 3000));
    const dr = await p.evaluate(() => {
      const c = SK.hudCtx.canvas, v = SK.view, k = c.width / v.w, d = SK.polish3.dialog, r = c.getBoundingClientRect();
      const s = d.skipRect;
      return { cx: r.left + (s.x + s.w / 2) / v.w * r.width, cy: r.top + (s.y + s.h / 2) / v.h * r.height, y0: 0.75 * c.height, dim: Array.from(c.getContext('2d').getImageData(c.width * 0.5, c.height * 0.8, 1, 1).data) };
    });
    check('hộp tối ở 75% chiều cao tới đáy (điểm ảnh tối, khác nền màn)', dr.dim[0] < 70 && dr.dim[1] < 70, JSON.stringify(dr.dim));
    await p.screenshot({ path: path.join(SHOTS, 'dialog.png') });
    await p.mouse.click(dr.cx, dr.cy);
    check('bấm SKIP đóng hộp thoại (cả hai câu)', await until(p, () => !SK.polish3.dialog.on, null, 2000));
    // trùm boss30 chết thì có thoại
    const kill = await p.evaluate(() => { SK.emit('enemyKill', SK.G, { id: 'boss30', x: 0, y: 0, _dropped: true }); return SK.polish3.dialog.on; });
    check('Zulan Di Tích chết thì hộp thoại tự hiện', kill === true);
    await p.evaluate(() => SK.polish3.skip());

    // ============ 5. công tắc Bỏ qua cốt truyện
    await p.evaluate(() => { localStorage.removeItem('sk_defence_skipplot'); document.getElementById('sk-lobby').hidden = false; SK.lobby.openModes(); document.querySelector('.hs-mode[data-mode="defence"]').click(); });
    check('thẻ Thần Điện chọn thì hiện công tắc', await until(p, () => { const e = document.getElementById('hs-skipplot'); return e && !e.hidden; }, null, 2000));
    const s0 = await p.evaluate(() => ({ flag: SK.defence.skipPlot, txt: document.querySelector('#hs-skipplot button').textContent }));
    await p.click('#hs-skipplot button');
    const s1 = await p.evaluate(() => ({ flag: SK.defence.skipPlot, txt: document.querySelector('#hs-skipplot button').textContent, ls: localStorage.getItem('sk_defence_skipplot') }));
    await p.click('#hs-skipplot button');
    const s2 = await p.evaluate(() => SK.defence.skipPlot);
    check('mặc định Tắt; bấm một lần bật skipPlot, bấm lần hai tắt lại', s0.flag === false && s1.flag === true && /Bật/.test(s1.txt) && s1.ls === '1' && s2 === false, JSON.stringify([s0, s1, s2]));
    await p.screenshot({ path: path.join(SHOTS, 'skipplot.png') });
    await p.evaluate(() => document.querySelector('.hs-mode[data-mode="level"]').click());
    check('đổi sang thẻ khác thì công tắc ẩn', await p.evaluate(() => document.getElementById('hs-skipplot').hidden));
    check('không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('chạy không ngoại lệ', false, e.stack || String(e));
  }
  console.log(out.join('\n'));
  console.log('\nĐẠT ' + pass + ' / HỎNG ' + fail + '   (ảnh: ' + SHOTS + ')');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
