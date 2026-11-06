/*
 * Tốc Độ: Thời Trang (js/ui/fashion.js, art/outfits) ở 1366×650 (chuột) và 844×390 (chạm).
 * - Thanh dưới có "Thời Trang"; màn có mục Bộ / Tóc / Trang Phục, Nam / Nữ, thẻ có giá; nút trong màn, ≥ 44 px, tâm trúng nút.
 * - Mua Bộ trừ đúng xu, tự mặc; thiếu xu báo "Vàng không đủ", không trừ. Tay đua trưng bày nạp glb của bộ (nút gốc mang id bộ).
 * - Mua Tóc của bộ khác: tóc mới gắn vào bộ xương của bộ đang mặc, tóc cũ ẩn. Xem thử không đổi bản lưu.
 * - Bản lưu hỏng được sửa (norms); TD.fashion.grant cho nhánh Gacha.
 * - Vào trận: xe người chơi dùng glb của bộ, bộ trộn hoạt ảnh lái có đủ clip và xương chuyển động; bot mặc bộ khác nhau.
 * Chạy: btest.sh node test/toc-do-fashion.js. Ảnh: $TD_SHOTS (mặc định /tmp/toc-do-shots).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./toc-do-lib');

async function shot(page, name) {
  fs.mkdirSync(T.SHOTS, { recursive: true });
  const f = path.join(T.SHOTS, name + '.png');
  await page.screenshot({ path: f, timeout: 180000 });
  console.log('  ảnh: ' + f);
}
const wait = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 200 }).then(() => true, () => false);
async function hitCheck(page, sel) {
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y), ok = hit && hit.closest('button') === el;
    const inside = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    return { id: el.dataset.act || el.dataset.tab || el.dataset.g || el.dataset.pick || el.dataset.buy || el.dataset.wear || el.className, ok, inside, min: Math.round(Math.min(r.width, r.height)) };
  }), sel);
}
function report(name, rows) {
  const bad = rows.filter((r) => !r.ok || !r.inside || r.min < 44);
  T.check(name, rows.length > 0 && bad.length === 0, bad.length ? bad.map((r) => `${r.id} ok=${r.ok} in=${r.inside} ${r.min}px`).join(', ') : rows.length + ' nút');
}
async function tap(page, sel, touch) { if (touch) await page.tap(sel); else await page.click(sel); }
// Tay đua trưng bày đã nạp xong (kể cả tóc thay): trả tên nút gốc của glb tay đua.
const showDriver = (page, want) => wait(page, (w) => {
  const v = TD.main.show && TD.main.show.view;
  return v && v.ready && v.driver && v.driver.children[0] && v.driver.children[0].name === w;
}, want, 120000);

async function run(br, base, w, h, touch) {
  console.log(`${w}×${h}${touch ? ', chạm' : ''}`);
  const { page, problems } = await T.open(br, base, 'index.html', { width: w, height: h }, touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : {});
  try {
    T.check('sảnh mở', await wait(page, () => window.TD && TD.main && TD.main.state === 'lobby' && document.querySelector('.lb-home'), null, 120000));
    const bar = await page.evaluate(() => [...document.querySelectorAll('.lb-bar [data-entry]')].map((e) => e.dataset.entry + ':' + e.textContent.trim()));
    T.check('thanh dưới có "Thời Trang"', bar.indexOf('fashion:Thời Trang') >= 0, bar.join(','));
    await page.evaluate(() => { TD.save.d.coins = 5000; });
    await tap(page, '[data-entry="fashion"]', touch);
    T.check('mở màn Thời Trang', await wait(page, () => document.querySelector('.fs .fs-title') && document.querySelector('.fs-title').textContent === 'Thời Trang', null, 5000));
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.fs-tabs button')].map((b) => b.textContent));
    T.check('mục: Bộ, Tóc, Trang Phục', tabs.join('|') === 'Bộ|Tóc|Trang Phục', tabs.join('|'));
    const cards = await page.evaluate(() => [...document.querySelectorAll('.fs-card b')].map((b) => b.textContent));
    T.check('mục Bộ (Nam): 9 thẻ, đầu là Bộ Tân Thủ', cards.length === 9 && cards[0] === 'Bộ Tân Thủ', cards.join('|'));
    T.check('Bộ Tân Thủ đang mặc', await page.evaluate(() => document.querySelector('.fs-card.worn [data-pick="m00500"]') !== null));
    T.check('ảnh thẻ đã tải', await wait(page, () => [...document.querySelectorAll('.fs-pick img')].every((i) => i.complete && i.naturalWidth > 0), null, 30000));
    report('nút màn Thời Trang: trong màn, ≥ 44 px, tâm trúng nút', await hitCheck(page, '.fs-top button, .fs-tabs button, .fs-card:nth-child(-n+3) button'));

    if (!touch) {
      // Kiểm trên đĩa (HEAD qua máy chủ thử bị Chromium báo requestfailed khi luồng đóng sớm).
      const urls = await page.evaluate(() => [...new Set(Object.values(TD.OUTFITS).flatMap((o) => [o.glb, o.icon]).filter(Boolean))]);
      const files = { n: urls.length, bad: urls.filter((u) => !fs.existsSync(path.join(T.GAME, u))) };
      T.check('mọi glb/ảnh thẻ trong TD.OUTFITS có trên đĩa', files.n === 70 && files.bad.length === 0, files.n + ' tệp; ' + files.bad.join(', '));
      // ---------- mua Bộ ----------
      await tap(page, '[data-buy="m01889"]', touch);
      const b1 = await page.evaluate(() => ({ coins: TD.save.d.coins, on: TD.save.d.outfits.on.nam, owned: TD.save.d.outfits.owned.slice(), toast: (document.querySelector('.fs-toast') || {}).textContent }));
      T.check('mua Bộ Khoác Lá Non: -2.600 xu, có món, tự mặc', b1.coins === 2400 && b1.on === 'm01889' && b1.owned.join() === 'm01889' && b1.toast === 'Mua thành công', JSON.stringify(b1));
      T.check('tay đua trưng bày nạp art/outfits/m01889.glb', await showDriver(page, 'm01889'));
      T.check('thẻ Bộ Khoác Lá Non: "Đã mặc"', await page.evaluate(() => { const b = document.querySelector('.fs-card.worn button.fs-btn'); return b && b.disabled && b.textContent === 'Đã mặc' && !!b.closest('.fs-card').querySelector('[data-pick="m01889"]'); }));
      await tap(page, '[data-buy="m00617"]', touch);
      const b2 = await page.evaluate(() => ({ coins: TD.save.d.coins, on: TD.save.d.outfits.on.nam, toast: (document.querySelector('.fs-toast') || {}).textContent }));
      T.check('thiếu xu: "Vàng không đủ", không trừ, không đổi đồ', b2.coins === 2400 && b2.on === 'm01889' && b2.toast === 'Vàng không đủ', JSON.stringify(b2));

      // ---------- xem thử ----------
      await tap(page, '[data-pick="m00617"]', touch);
      T.check('xem thử Bộ Mèo Cam: tay đua đổi bộ, bản lưu giữ nguyên', await showDriver(page, 'm00617') && await page.evaluate(() => TD.save.d.outfits.on.nam === 'm01889'));
      await tap(page, '[data-pick="m00617"]', touch);
      T.check('bấm lại thẻ: bỏ xem thử', await showDriver(page, 'm01889'));

      // ---------- mọi bộ ngồi trên xe trưng bày (tư thế lái) ----------
      const looks = await page.evaluate(() => Object.values(TD.OUTFITS).filter((o) => o.kind === 'bo' && o.glb).map((o) => o.id));
      const loaded = [];
      for (const id of looks) {
        await page.evaluate((x) => { TD.fashion.g = TD.OUTFITS[x].g; TD.fashion.preview = x; TD.fashion.open('bo'); }, id);
        if (await showDriver(page, id)) loaded.push(id);
        await page.waitForTimeout(400);
        fs.mkdirSync(T.SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(T.SHOTS, `fashion-look-${id}.png`), clip: { x: Math.round(w * 0.5), y: Math.round(h * 0.12), width: Math.round(w * 0.45), height: Math.round(h * 0.8) }, timeout: 180000 });
      }
      T.check('16 bộ đều nạp lên xe trưng bày (ảnh fashion-look-<id>.png)', loaded.length === 16 && looks.length === 16, loaded.length + '/' + looks.length);
      await page.evaluate(() => { TD.fashion.g = 'nam'; TD.fashion.preview = null; TD.fashion.open('bo'); });
      T.check('bỏ xem thử: về bộ đang mặc', await showDriver(page, 'm01889'));

      // ---------- Tóc ----------
      await tap(page, '[data-tab="toc"]', touch);
      const hairPrice = await page.evaluate(() => TD.OUTFITS.m00013_hair.price);
      await tap(page, '[data-buy="m00013_hair"]', touch);
      const b3 = await page.evaluate(() => ({ coins: TD.save.d.coins, hair: TD.save.d.outfits.hair.nam, on: TD.save.d.outfits.on.nam }));
      T.check('mua Tóc Đồng Phục Xanh: trừ giá tóc, đội lên bộ đang mặc', b3.coins === 2400 - hairPrice && b3.hair === 'm00013_hair' && b3.on === 'm01889', JSON.stringify(b3));
      const hs = await wait(page, () => {
        const v = TD.main.show.view;
        if (!v || !v.driver || v.driver.children[0].name !== 'm01889') return false;
        const nw = v.driver.getObjectByName('HairSwap'), old = v.driver.getObjectByName('Hair');
        return nw && old && !old.visible && nw.skeleton.bones.every((b) => { let p = b; while (p && p !== v.driver) p = p.parent; return p === v.driver; });
      }, null, 120000);
      T.check('tóc mới gắn vào bộ xương của tay đua, tóc cũ ẩn', hs);
      await shot(page, `fashion-hair-${w}`);

      // ---------- Trang Phục: giữ tóc ----------
      await page.evaluate(() => { TD.fashion.grant('m00166_do'); });
      await tap(page, '[data-tab="do"]', touch);
      await tap(page, '[data-wear="m00166_do"]', touch);
      const b4 = await page.evaluate(() => ({ on: TD.save.d.outfits.on.nam, hair: TD.save.d.outfits.hair.nam }));
      T.check('mặc Trang Phục Mùa Hè Đỏ: đổi bộ, giữ tóc đang để', b4.on === 'm00166' && b4.hair === 'm00013_hair', JSON.stringify(b4));
      await tap(page, '[data-tab="bo"]', touch);
      await tap(page, '[data-wear="m01889"]', touch);
      const b5 = await page.evaluate(() => ({ on: TD.save.d.outfits.on.nam, hair: TD.save.d.outfits.hair.nam }));
      T.check('mặc lại Bộ: tóc về tóc của bộ', b5.on === 'm01889' && b5.hair === null, JSON.stringify(b5));
      await tap(page, '[data-tab="toc"]', touch);
      await tap(page, '[data-wear="m00013_hair"]', touch);

      // ---------- Nữ, grant, norms ----------
      await tap(page, '[data-g="nu"]', touch);
      const nu = await page.evaluate(() => [...document.querySelectorAll('.fs-card b')].map((b) => b.textContent));
      T.check('Nữ: thẻ tóc của bộ nữ', nu.length === 9 && nu[0] === 'Tóc Tân Thủ', nu.join('|'));
      const gr = await page.evaluate(() => [TD.fashion.grant('f00032'), TD.fashion.grant('f00032'), TD.fashion.owns('f00032_hair'), TD.fashion.owns('f00032_do'), TD.fashion.grant('xx')]);
      T.check('grant: món mới true, lần hai false, Bộ gồm tóc + trang phục, id lạ false', gr.join() === 'true,false,true,true,false', gr.join());
      const nm = await page.evaluate(() => {
        const o = { outfits: { owned: ['m00617', 'm00617', 'zz', 'm00500'], on: { nam: 'f01889', nu: 'f00617' }, hair: { nam: 'm00013_hair', nu: 7 } } };
        for (const f of TD.save.norms) f(o);
        return o.outfits;
      });
      T.check('bản lưu hỏng: bỏ id lạ/trùng/miễn phí, bộ chưa có hoặc sai giới về Tân Thủ, tóc chưa có bỏ',
        JSON.stringify(nm) === JSON.stringify({ owned: ['m00617'], on: { nam: 'm00500', nu: 'f00500' }, hair: { nam: null, nu: null } }), JSON.stringify(nm));
      await tap(page, '[data-g="nam"]', touch);
      await tap(page, '[data-tab="bo"]', touch);
      await shot(page, `fashion-${w}`);

      // ---------- vào trận ----------
      await tap(page, '.fs-back', touch);
      T.check('nút quay lại về sảnh', await wait(page, () => document.querySelector('.lb-home') && !document.querySelector('.fs'), null, 5000));
      await page.evaluate(() => { TD.save.d.driver = 'nam'; TD.save.d.track = Object.keys(TD.TRACKS)[0]; TD.main.startRace({ mode: 'speed' }); });
      T.check('vào trận', await wait(page, () => TD.main.state === 'race' && TD.main.race && TD.main.views.every((v) => v.ready), null, 240000));
      const rc = await page.evaluate(() => {
        const me = TD.main.views.find((v) => v.kart.ctrl === 'human');
        const drv = TD.DRIVERS[me.kart.driverId];
        const blend = drv.blend.move.points.map((p) => p[0]);
        return {
          url: TD.kartView.hooks.driverGlb.map((f) => f(me.kart, drv)).find(Boolean),
          root: me.driver.children[0].name,
          clips: blend.filter((n) => me.acts[n] && me.acts[n].getClip().tracks.length > 0).length, need: blend.length,
          bots: TD.main.views.filter((v) => v.kart.ctrl !== 'human' && v.driver).map((v) => v.driver.children[0].name),
        };
      });
      T.check('xe người chơi: hook trả art/outfits/m01889.glb, tay đua nạp đúng glb', rc.url === 'art/outfits/m01889.glb' && rc.root === 'm01889', JSON.stringify(rc));
      T.check('mixer có đủ clip blend lái (drivers.js blend.move)', rc.clips === rc.need && rc.need === 10, rc.clips + '/' + rc.need);
      T.check('bot mặc ít nhất 2 bộ khác nhau', new Set(rc.bots).size >= 2, rc.bots.join(','));
      T.check('tóc mua riêng có trong trận', await wait(page, () => { const v = TD.main.views.find((x) => x.kart.ctrl === 'human'); return !!v.driver.getObjectByName('HairSwap'); }, null, 60000));
      const moved = await page.evaluate(async () => {
        const v = TD.main.views.find((x) => x.kart.ctrl === 'human');
        const bones = [];
        v.driver.traverse((o) => { if (o.isBone) bones.push(o); });
        TD.main.timeScale = 4;
        const t0 = v.mixer.time, q0 = bones.map((b) => b.quaternion.clone()), moved = new Set();
        for (let i = 0; i < 40 && moved.size < 3; i++) {
          await new Promise((r) => setTimeout(r, 250));
          bones.forEach((b, j) => { if (b.quaternion.angleTo(q0[j]) > 1e-3) moved.add(b.name); q0[j].copy(b.quaternion); });
        }
        return { dt: v.mixer.time - t0, bones: bones.length, moved: [...moved] };
      });
      T.check('hoạt ảnh chạy: mixer tiến, xương xoay', moved.dt > 0.2 && moved.moved.length >= 1, JSON.stringify(moved));
      // Tự lái tới khi chạy nhanh: camera đuổi sau xe thấy rõ tay đua mặc bộ đã mua.
      await page.evaluate(() => { const me = TD.main.me; me.ctrl = 'bot'; TD.Bot.init(me, TD.main.race, 0.9); });
      T.check('xe người chơi chạy (tay đua trong tư thế lái)', await wait(page, () => TD.main.me.speed > 15, null, 120000));
      await page.evaluate(() => { TD.main.timeScale = 1; });
      await shot(page, `fashion-race-${w}`);
    } else {
      await tap(page, '[data-pick="m00166"]', touch);
      T.check('chạm thẻ: xem thử trên tay đua', await showDriver(page, 'm00166'));
      await shot(page, `fashion-${w}`);
      await tap(page, '[data-g="nu"]', touch);
      T.check('chạm Nữ: tay đua nữ', await wait(page, () => { const v = TD.main.show.view; return v && v.ready && v.kart.driverId === 'nu'; }, null, 120000));
      await shot(page, `fashion-nu-${w}`);
    }
    T.check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  } finally {
    await page.context().close();
  }
}

(async () => {
  const srv = await T.serve();
  const br = await T.browser();
  try {
    await run(br, srv.base, 1366, 650, false);
    await run(br, srv.base, 844, 390, true);
  } catch (e) {
    T.check('không ném lỗi', false, e && e.stack);
  } finally {
    await br.close();
    srv.close();
    T.done();
  }
})();
