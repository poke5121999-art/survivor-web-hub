/*
 * Tốc Độ: sảnh chính, chọn chế độ, ghép phòng, màn tải, Huấn Luyện (js/ui/lobby.js) ở 1366×650 (chuột) và 844×390 (chạm).
 * - Sảnh: mọi ô và nút thanh dưới nằm trong màn, elementFromPoint ở tâm trúng đúng nút, ô Cốt Truyện mở bản đồ chương.
 * - Xuất Phát → Tốc Độ-Đội → đổi đường → Ghép phòng: 6 thẻ (3 xanh, 3 đỏ) → màn tải có thẻ + tên chế độ → trận đúng chế độ,
 *   đúng đường, tên bot theo danh sách đã ghép. Hủy ghép quay về chọn chế độ, không vào trận.
 * - Tạm dừng → Về sảnh: canvas HUD đã xoá. Huấn Luyện → Bắt đầu: vào Huấn luyện tự do.
 * Chạy: node test/toc-do-lobby.js   (TD_URL=<gốc> để chạy trên Pages). Ảnh: $TD_SHOTS (mặc định /tmp/toc-do-shots).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./toc-do-lib');

// Trên swiftshader một khung sảnh 3D mất vài trăm ms, chụp màn có thể quá 30 s mặc định.
async function shot(page, name) {
  fs.mkdirSync(T.SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(T.SHOTS, name + '.png'), timeout: 180000 });
}
const wait = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 200 }).then(() => true, () => false);

// Mỗi nút: nằm trong màn, cạnh ngắn ≥ 44 px, tâm trúng chính nó.
async function hitCheck(page, sel) {
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y), ok = hit && hit.closest('button') === el;
    const inside = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    return { id: el.dataset.act || el.dataset.tab || el.dataset.mode || el.dataset.track || el.className, ok, inside, min: Math.round(Math.min(r.width, r.height)) };
  }), sel);
}
function report(name, rows) {
  const bad = rows.filter((r) => !r.ok || !r.inside || r.min < 44);
  T.check(name, rows.length > 0 && bad.length === 0, bad.length ? bad.map((r) => `${r.id} ok=${r.ok} in=${r.inside} ${r.min}px`).join(', ') : rows.length + ' nút');
}
async function tap(page, sel, touch) { if (touch) await page.tap(sel); else await page.click(sel); }

async function run(br, base, w, h, touch) {
  console.log(`${w}×${h}${touch ? ', chạm' : ''}`);
  const { page, problems } = await T.open(br, base, 'index.html', { width: w, height: h }, touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : {});
  T.check('sảnh mở', await wait(page, () => window.TD && TD.main && TD.main.state === 'lobby' && document.querySelector('.lb-home'), null, 90000));
  await page.waitForTimeout(1500);
  const tracks = await page.evaluate(() => Object.keys(TD.TRACKS));

  // ---------- sảnh ----------
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.lb-tile .lb-tl')].map((e) => e.textContent));
  T.check('sảnh có 5 ô: Giải Đấu, Xuất Phát, Huấn Luyện, Cốt Truyện, Khu Giải Trí',
    tiles.join('|') === 'Giải Đấu|Xuất Phát|Huấn Luyện|Cốt Truyện|Khu Giải Trí', tiles.join('|'));
  const bar = await page.evaluate(() => [...document.querySelectorAll('.lb-bar .lb-bt')].map((e) => (e.dataset.tab || e.dataset.entry) + ':' + e.querySelector('span').textContent));
  T.check('thanh dưới: PET, Đội Đua, Cặp Đôi, Thời Trang, Xưởng, Gara, Kỹ Năng, Thành Tựu, Cửa Hàng, Nhiệm Vụ',
    bar.join(',') === 'pet:PET,club:Đội Đua,couple:Cặp Đôi,fashion:Thời Trang,gacha:Xưởng,cars:Gara,skills:Kỹ Năng,ach:Thành Tựu,shop:Cửa Hàng,quests:Nhiệm Vụ', bar.join(','));
  report('ô sảnh, thanh dưới, cài đặt: trong màn, ≥ 44 px, tâm trúng nút', await hitCheck(page, '.lb-home button'));
  const me = await page.evaluate(() => ({ lv: document.querySelector('.lb-lv em').textContent, want: String(TD.LEVEL.of(TD.save.d.xp).lv), coins: document.querySelector('.lb-coins b').textContent }));
  T.check('góc trên: cấp theo XP, xu theo bản lưu', me.lv === me.want && me.coins === '0', JSON.stringify(me));
  const cam = await page.evaluate(() => { const c = TD.main.camera, v = new THREE.Vector3(0, 0.4, 0).project(c); return (v.x + 1) / 2; });
  T.check('xe 3D nằm nửa trái màn', cam > 0.15 && cam < 0.4, 'x = ' + (cam * 100).toFixed(0) + '%');
  await shot(page, `lobby-home-${w}`);
  await tap(page, '.t-story', touch);
  T.check('ô Cốt Truyện mở bản đồ chương', await wait(page, () => !!document.querySelector('.st .st-ctitle'), null, 5000));
  await tap(page, '.st-back', touch);
  T.check('"Về sảnh" từ Cốt Truyện', await wait(page, () => !!document.querySelector('.lb-home'), null, 5000));

  // ---------- chọn chế độ ----------
  await tap(page, '[data-act="start"]', touch);
  T.check('Xuất Phát mở "Chọn kiểu phòng đua"', await wait(page, () => document.querySelector('.lb-pick .lb-title b') && document.querySelector('.lb-title b').textContent === 'Chọn kiểu phòng đua', null, 5000));
  const modes = await page.evaluate(() => [...document.querySelectorAll('.lb-mode span')].map((e) => e.textContent));
  T.check('5 kiểu phòng: Tốc Độ-Đơn, Tốc Độ-Đội, Đạo Cụ-Đơn, Đạo Cụ-Đội, Đua Đạo Cụ-Đôi', modes.join('|') === 'Tốc Độ-Đơn|Tốc Độ-Đội|Đạo Cụ-Đơn|Đạo Cụ-Đội|Đua Đạo Cụ-Đôi', modes.join('|'));
  T.check('đủ ô chọn đường cho mọi đường trong TD.TRACKS', await page.evaluate(() => document.querySelectorAll('.lb-th').length === Object.keys(TD.TRACKS).length));
  await tap(page, '[data-mode="speedTeam"]', touch);
  await tap(page, `[data-track="${tracks[1]}"]`, touch);
  const pick = await page.evaluate(() => ({ mode: TD.save.d.mode, track: TD.save.d.track, on: document.querySelector('.lb-mode.on').dataset.mode, name: document.querySelector('.lb-tname b').textContent }));
  T.check('chọn Tốc Độ-Đội và đường thứ hai, lưu vào bản lưu', pick.mode === 'speedTeam' && pick.on === 'speedTeam' && pick.track === tracks[1] &&
    pick.name === await page.evaluate((id) => TD.TRACKS[id].name, tracks[1]), JSON.stringify(pick));
  report('nút màn chọn chế độ: trong màn, ≥ 44 px, tâm trúng nút', await hitCheck(page, '.lb-pick .lb-back, .lb-pick .lb-mode, .lb-pick .lb-go, .lb-pick .lb-th.on'));
  await shot(page, `lobby-modes-${w}`);
  await tap(page, '.lb-back', touch);
  T.check('nút quay lại về sảnh', await wait(page, () => document.querySelector('.lb-home'), null, 5000));
  await tap(page, '[data-act="start"]', touch);
  T.check('mở lại vẫn nhớ chế độ và đường đã chọn', await wait(page, (t) => document.querySelector('.lb-mode.on') && document.querySelector('.lb-mode.on').dataset.mode === 'speedTeam' &&
    document.querySelector('.lb-th.on').dataset.track === t, tracks[1], 5000));

  // ---------- hủy ghép ----------
  // Bấm Ghép phòng rồi Hủy ghép trong cùng một lượt JS: máy chậm không kịp ghép xong giữa hai lần bấm. Kiểm thêm tâm nút Hủy.
  await page.evaluate(() => { TD._calls = 0; TD._sr = TD.main.startRace; TD.main.startRace = (o) => { TD._calls++; TD._held = o; }; });
  const cancel = await page.evaluate(() => {
    document.querySelector('[data-act="go"]').click();
    const st = document.querySelector('.lb-mstate'), b = document.querySelector('.lb-cancel'), r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const out = { st: st && st.textContent, hit: !!hit && hit.closest('button') === b, inside: r.bottom <= innerHeight && r.right <= innerWidth, min: Math.round(Math.min(r.width, r.height)) };
    b.click();
    return out;
  });
  T.check('Ghép phòng mở màn "Đang ghép...", nút Hủy ghép trong màn, ≥ 44 px, tâm trúng nút', cancel.st === 'Đang ghép...' && cancel.hit && cancel.inside && cancel.min >= 44, JSON.stringify(cancel));
  await page.waitForTimeout(4500);
  T.check('Hủy ghép về chọn chế độ, không vào trận', await page.evaluate(() => !!document.querySelector('.lb-pick') && TD._calls === 0 && TD.main.state === 'lobby'));

  // ---------- ghép phòng → màn tải → trận ----------
  await tap(page, '[data-act="go"]', touch);
  T.check('đủ người thì gọi startRace với chế độ đã chọn', await wait(page, () => TD._calls === 1, null, 60000) && await page.evaluate(() => TD._held.mode === 'speedTeam'));
  const room = await page.evaluate(() => ({ n: document.querySelectorAll('.lb-match .lb-card:not(.wait)').length, blue: document.querySelectorAll('.lb-col.c0 .lb-card').length,
    red: document.querySelectorAll('.lb-col.c1 .lb-card.red').length, gold: document.querySelectorAll('.lb-col.c0 .lb-card.gold').length, st: document.querySelector('.lb-mstate').textContent }));
  T.check('màn ghép: 6 thẻ đủ, cột Xanh 3 (mình vàng), cột Đỏ 3', room.n === 6 && room.blue === 3 && room.gold === 1 && room.red === 3 && room.st === 'Ghép thành công', JSON.stringify(room));
  await shot(page, `lobby-match-${w}`);
  const roster = await page.evaluate(() => TD.lobby.roster.list.map((p) => p.name));
  await page.evaluate(() => { TD.main.startRace = TD._sr; TD.main.startRace(TD._held); });
  T.check('màn tải có tên chế độ và 6 thẻ người chơi', await wait(page, () => document.querySelector('.loading .ld-head small') && document.querySelector('.loading .ld-head small').textContent === 'Tốc Độ-Đội' &&
    document.querySelectorAll('.loading .ld-cards .lb-card').length === 6, null, 30000));
  await shot(page, `lobby-loading-${w}`);
  T.check('vào trận', await wait(page, () => TD.main.state === 'race' && TD.main.race, null, 180000));
  const race = await page.evaluate(() => ({ mode: TD.main.race.mode.id, track: TD.main.race.trackId, n: TD.main.race.karts.length, names: TD.main.race.karts.map((k) => k.name) }));
  T.check('trận đúng chế độ Tốc Độ-Đội, đúng đường đã chọn', race.mode === 'speedTeam' && race.track === tracks[1] && race.n === 6, JSON.stringify(race).slice(0, 120));
  T.check('tên bot trong trận theo danh sách đã ghép', race.names.slice(0, 5).join('|') === roster.slice(0, 5).join('|'), race.names.join('|'));

  // ---------- tạm dừng → về sảnh ----------
  await page.evaluate(() => { TD.main.introT = 99; });
  if (touch) await page.tap('.pause'); else await page.keyboard.press('Escape');
  T.check('tạm dừng mở bảng', await wait(page, () => document.querySelector('.pausebox'), null, 20000));
  await tap(page, '[data-p="lobby"]', touch);
  T.check('Về sảnh trở lại sảnh chính', await wait(page, () => TD.main.state === 'lobby' && document.querySelector('.lb-home'), null, 20000));
  const hudClear = await page.evaluate(() => { const c = document.getElementById('hud'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i]; return a; });
  T.check('canvas HUD của trận đã xoá ở sảnh', hudClear === 0, 'alpha tổng ' + hudClear);

  // ---------- Huấn Luyện ----------
  await tap(page, '[data-act="practice"]', touch);
  const prac = await page.evaluate(() => [...document.querySelectorAll('.lb-mode')].map((e) => e.dataset.mode + ':' + e.querySelector('span').textContent));
  T.check('Huấn Luyện liệt kê 3 chế độ luyện tập', prac.join(',') === 'free:Huấn luyện tự do,itemPractice:Khu Luyện Tập Đạo Cụ,shadow:Thách Đấu Ảo Ảnh', prac.join(','));
  report('nút màn Huấn Luyện: trong màn, ≥ 44 px, tâm trúng nút', await hitCheck(page, '.lb-pick .lb-back, .lb-pick .lb-mode, .lb-pick .lb-go'));
  await shot(page, `lobby-practice-${w}`);
  await tap(page, '.lb-back', touch);
  T.check('quay lại từ Huấn Luyện về sảnh', await wait(page, () => document.querySelector('.lb-home'), null, 5000));
  await tap(page, '[data-act="practice"]', touch);
  await tap(page, '[data-mode="free"]', touch);
  await tap(page, '[data-act="go"]', touch);
  T.check('Bắt đầu vào Huấn luyện tự do (1 xe)', await wait(page, () => TD.main.state === 'race' && TD.main.race && TD.main.race.mode.id === 'free' && TD.main.race.karts.length === 1, null, 180000));
  await page.evaluate(() => TD.main.toLobby());

  // ---------- Giải Đấu, Gara (màn của nhánh khác) quay về sảnh ----------
  if (await page.evaluate(() => !!(TD.ranked && TD.ranked.show))) {
    await tap(page, '[data-act="ranked"]', touch);
    T.check('Giải Đấu mở màn xếp hạng', await wait(page, () => document.querySelector('.rk'), null, 5000));
    await tap(page, '.rk-back', touch);
    T.check('từ xếp hạng về sảnh', await wait(page, () => document.querySelector('.lb-home'), null, 5000));
  }
  if (await page.evaluate(() => !!(TD.garage && TD.garage.open))) {
    await tap(page, '[data-tab="cars"]', touch);
    T.check('Gara mở', await wait(page, () => document.querySelector('.gr'), null, 5000));
    await tap(page, '.gback', touch);
    T.check('từ Gara về sảnh', await wait(page, () => document.querySelector('.lb-home'), null, 5000));
  }

  // Ảnh thu nhỏ đường (art/maps) do nhánh Đường đua thêm: thiếu (404 lúc chạy) thì báo riêng, không lẫn vào lỗi trang.
  const noMap = tracks.filter((id) => problems.some((p) => p.indexOf('art/maps/' + id + '.jpg') >= 0));
  T.check('mọi đường có ảnh thu nhỏ art/maps/<id>.jpg', noMap.length === 0, noMap.length ? 'thiếu ' + noMap.join(', ') : null);
  // Mỗi 404 ảnh thu nhỏ kéo theo một dòng console "Failed to load resource ... 404": bỏ đúng số dòng đó.
  let skip = problems.filter((p) => noMap.some((id) => p.indexOf('art/maps/' + id + '.jpg') >= 0)).length;
  const real = problems.filter((p) => {
    if (noMap.some((id) => p.indexOf('art/maps/' + id + '.jpg') >= 0)) return false;
    if (skip > 0 && /^console: Failed to load resource: .* 404/.test(p)) { skip--; return false; }
    return true;
  });
  T.check(`không lỗi trang (${w})`, real.length === 0, real.slice(0, 5).join(' | '));
  await page.context().close();
}

(async () => {
  const srv = await T.serve();
  const br = await T.browser();
  try {
    await run(br, srv.base, 1366, 650, false);
    await run(br, srv.base, 844, 390, true);
  } catch (e) { T.check('chạy hết không ném lỗi', false, e.message.split('\n')[0]); }
  await br.close(); srv.close();
  console.log('ảnh: ' + T.SHOTS);
  T.done();
})();
