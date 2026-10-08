/*
 * Vực Săn: một trận trọn vẹn từ sảnh tới màn kết quả, lái bằng chuột và phím thật.
 * 1366x650 chơi phe thợ lặn, 844x390 chơi phe cá mập. Sau phần lái tay, VS_DEBUG.step tua tới hết trận (bot cả hai phe).
 * Chạy: node test/vuc-san-play.js   (VS_URL=<gốc> để chạy trên Pages)
 */
'use strict';
const T = require('./vuc-san-lib');

const info = (page) => page.evaluate(() => {
  const m = VS_DEBUG.match(), me = m && m.actors[VS.state.viewer.id];
  return m && { mode: VS.state.mode, phase: m.phase, t: m.t, mapId: m.mapId, result: m.result,
    me: { id: me.id, team: me.team, ctrl: me.ctrl, st: me.st, x: me.x, y: me.y, light: me.light, o2: me.o2, hp: me.hp },
    humans: m.actors.filter((a) => a.ctrl === 'human').length, divers: m.actors.filter((a) => a.team === 'diver').length,
    sharks: m.actors.filter((a) => a.team === 'shark').length };
});

// độ sáng trung bình của ảnh chụp, đo trong trang (WebGL không giữ bộ đệm nên không đọc thẳng canvas được)
async function luma(page) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async (src) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < d.length; i += 16) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 16);
  }, b64);
}

// giữ phím tới khi mô phỏng chạy thêm 1 s: trên SwiftShader một khung vẽ lâu nên m.t chậm hơn đồng hồ thật nhiều lần
async function holdUntilMoved(page, keys, me0) {
  for (const k of keys) {
    const t0 = await page.evaluate(() => VS_DEBUG.match().t);
    await page.keyboard.down(k);
    await page.waitForFunction((t0) => VS_DEBUG.match().t >= t0 + 1, t0, { timeout: 30000 });
    await page.keyboard.up(k);
    const me = (await info(page)).me;
    const d = Math.hypot(me.x - me0.x, me.y - me0.y);
    if (d > 1) return { key: k, d };
  }
  return { key: null, d: 0 };
}

async function play(br, base, vp, team) {
  const P = '[' + vp.width + 'x' + vp.height + ' ' + team + '] ';
  console.log(P + 'sảnh → tìm trận → chơi → kết quả');
  const { page, problems } = await T.open(br, base, 'index.html', vp);
  await page.waitForFunction(() => window.__ready && VS.lobby.screen() === 'lobby', null, { timeout: 60000 });
  if (team === 'shark') {
    await page.click('.vs-side-shark');
    await page.waitForFunction(() => document.querySelector('.vs-side-shark').classList.contains('on'));
  }
  const save0 = await page.evaluate(() => JSON.parse(JSON.stringify(VS.save.current)));
  await page.click('[data-act=find]');
  await page.waitForFunction(() => VS.lobby.screen() === 'map' && document.querySelector('[data-landed="1"]'), null, { timeout: 30000 });
  const landed = await page.evaluate(() => document.querySelector('[data-landed="1"]').dataset.map);
  await page.waitForFunction(() => VS.state.mode === 'match', null, { timeout: 60000 });
  let s = await info(page);
  T.check(P + 'vào trận đúng bản đồ vừa bốc, 4 thợ lặn 2 cá mập, đúng một người chơi thuộc phe đã chọn',
    s.mapId === landed && s.divers === 4 && s.sharks === 2 && s.humans === 1 && s.me.team === team && s.me.ctrl === 'human', JSON.stringify([landed, s.mapId, s.me.team]));
  const hits = await page.evaluate(() => [[0.5, 0.5], [0.3, 0.6], [0.7, 0.4]].map(([fx, fy]) => { const el = document.elementFromPoint(innerWidth * fx, innerHeight * fy); return el && el.tagName; }));
  T.check(P + 'elementFromPoint ở ba điểm vùng chơi đều trúng canvas (HUD không nuốt cú bấm)', hits.every((t) => t === 'CANVAS'), hits.join(','));

  await page.waitForFunction(() => VS_DEBUG.match().phase === 'play', null, { timeout: 15000 });
  await T.shot(page, 'play-start-' + team + '-' + vp.width + 'x' + vp.height);
  s = await info(page);
  const mv = await holdUntilMoved(page, ['KeyD', 'KeyA', 'KeyW', 'KeyS'], s.me);
  T.check(P + 'giữ phím thật thì nhân vật bơi đi (> 1 m)', mv.key !== null, mv.key + ' ' + mv.d.toFixed(2) + ' m');

  if (team === 'diver') {
    const before = await page.evaluate(() => VS_DEBUG.match().projs.length);
    await page.mouse.move(vp.width * 0.75, vp.height * 0.5);
    await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    const shotFired = await page.waitForFunction((id) => VS_DEBUG.match().projs.some((p) => p.owner === id && p.kind === 'harpoon'), s.me.id, { timeout: 2000 }).then(() => true, () => false);
    T.check(P + 'bấm chuột trái vào vùng chơi thì bắn ra một mũi xiên', shotFired, before + ' đạn trước khi bấm');

    const lit = await luma(page), on0 = (await info(page)).me.light;
    await page.keyboard.press('KeyF');
    await page.waitForFunction((v) => VS_DEBUG.match().actors[VS.state.viewer.id].light !== v, on0, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    const dark = await luma(page), on1 = (await info(page)).me.light;
    await T.shot(page, 'play-light-off-' + vp.width + 'x' + vp.height);
    T.check(P + 'phím F tắt đèn pin và màn hình tối đi', on0 === true && on1 === false && dark < lit, 'đèn ' + on0 + '→' + on1 + ', độ sáng ' + lit.toFixed(1) + '→' + dark.toFixed(1));
    await page.keyboard.press('KeyF');
  } else {
    const st0 = await page.evaluate(() => VS_DEBUG.match().events.length);
    await page.mouse.move(vp.width * 0.75, vp.height * 0.5);
    await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    const lunged = await page.waitForFunction((id) => VS_DEBUG.match().actors[id].st === 'lunge', s.me.id, { timeout: 1500 }).then(() => true, () => false);
    T.check(P + 'bấm chuột trái thì cá mập lao về phía con trỏ', lunged, st0 + ' sự kiện trước khi bấm');
  }

  // tua: VS_DEBUG.step chạy bước mô phỏng như vòng lặp khung, bot hai phe tự đánh tới khi trận ngã ngũ
  let guard = 0;
  while (guard++ < 60) {
    const ph = await page.evaluate(() => { VS_DEBUG.step(600); return VS_DEBUG.match().phase; });
    if (ph === 'end') break;
  }
  s = await info(page);
  T.check(P + 'trận kết thúc với người thắng và lý do', s.phase === 'end' && s.result && /^(diver|shark)$/.test(s.result.winner) && !!s.result.reason, JSON.stringify(s.result) + ' t=' + s.t.toFixed(1));
  await page.waitForFunction(() => VS.state.mode === 'result' && VS.lobby.screen() === 'result', null, { timeout: 15000 });
  const res = await page.evaluate(() => ({ t: document.querySelector('.vs-banner-t').textContent, rows: document.querySelectorAll('.vs-tbl tr').length }));
  const want = s.result.winner === team ? 'THẮNG' : 'THUA';
  T.check(P + 'màn kết quả ghi ' + want + ' khớp người thắng, bảng có đủ 6 người', res.t === want && res.rows >= 7, JSON.stringify(res));
  await T.shot(page, 'play-result-' + team + '-' + vp.width + 'x' + vp.height);
  const save1 = await page.evaluate(() => JSON.parse(localStorage.getItem(VS.save.KEY)));
  T.check(P + 'quyết toán ghi vào localStorage: exp hoặc ngọc trai tăng', save1 && (save1.exp > save0.exp || save1.level > save0.level || save1.pearls > save0.pearls),
    'exp ' + save0.exp + '→' + (save1 && save1.exp) + ', ngọc ' + save0.pearls + '→' + (save1 && save1.pearls));

  await page.click('[data-act=leave]');
  const back = await page.waitForFunction(() => VS.lobby.screen() === 'lobby' && VS.state.mode === 'lobby', null, { timeout: 5000 }).then(() => true, () => false);
  T.check(P + 'bấm VỀ SẢNH ở màn kết quả thì về lại sảnh', back);
  T.check(P + 'không pageerror, console error, requestfailed, response >= 400', problems.length === 0, problems.slice(0, 3).join(' | ') || 'sạch');
  await page.context().close();
}

async function main() {
  const srv = await T.serve();
  const br = await T.browser();
  try {
    await play(br, srv.base, { width: 1366, height: 650 }, 'diver');
    await play(br, srv.base, { width: 844, height: 390 }, 'shark');
  } finally {
    await br.close();
    srv.close();
  }
  console.log('ảnh chụp: ' + T.SHOTS);
  T.done();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
