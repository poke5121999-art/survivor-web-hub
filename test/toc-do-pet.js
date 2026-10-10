/*
 * Tốc Độ: PET (js/ui/pet.js) ở 1366×650 (chuột) và 844×390 (chạm).
 * - Màn PET mở từ thanh dưới sảnh: mua / mang theo / xóa / nâng cấp với số xu cụ thể, từ chối khi thiếu xu, nút đủ 44 px.
 * - Bản lưu: pets bị sửa bậy (cấp 99, id lạ, on không có) được dọn khi nạp lại; TD.pet.grant (gacha): mới → cấp 1, trùng → hoàn 1/5 giá.
 * - Trận: pet mang theo gắn vào xe mình (mô hình nạp xong), bot có pet cho vui; kỹ năng đo được (bình nitro lúc GO, xu/XP ở màn thưởng,
 *   tốc độ lúc GO, né đạo cụ).
 * Chạy: node test/toc-do-pet.js   (TD_URL=<gốc> để chạy trên Pages). Ảnh: $TD_SHOTS (mặc định /tmp/toc-do-shots).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./toc-do-lib');

async function shot(page, name) {
  fs.mkdirSync(T.SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(T.SHOTS, name + '.png'), timeout: 180000 });
}
const wait = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 200 }).then(() => true, () => false);
const st = (page) => page.evaluate(() => ({ coins: TD.save.d.coins, owned: TD.save.d.pets.owned, on: TD.save.d.pets.on }));
const near = (a, b) => Math.abs(a - b) < 1e-6;

async function run(br, base, w, h, touch, withRace) {
  console.log(`${w}×${h}${touch ? ', chạm' : ''}`);
  const { page, problems } = await T.open(br, base, 'index.html', { width: w, height: h }, touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : {});
  const click = (sel) => (touch ? page.tap(sel) : page.click(sel));
  T.check('sảnh mở', await wait(page, () => window.TD && TD.main && TD.main.state === 'lobby' && document.querySelector('.lb-home'), null, 90000));
  await page.evaluate(() => { TD.save.d.coins = 10000; TD.save.d.pets = { owned: {}, on: '' }; TD.save.save(); TD.lobby.show(); });
  T.check('thanh dưới có nút PET', await page.evaluate(() => { const b = document.querySelector('.lb-bar [data-entry="pet"] span'); return !!b && b.textContent === 'PET'; }));

  await click('[data-entry="pet"]');
  T.check('màn PET mở: 8 thẻ pet, tổng "0/8"', await wait(page, () => document.querySelectorAll('.pt-card').length === 8 && document.querySelector('.pt-title small').textContent === 'Tổng số PET: 0/8', null, 20000));
  T.check('mô hình xem trước nạp xong', await wait(page, () => { const g = TD.main.show.scene.children.find((o) => o.petBody); return g && g.petBody.children[0] && g.petBody.children[0].children.length > 0; }, null, 60000));
  await shot(page, `pet-list-${w}`);

  // ---------- mua / nâng cấp ----------
  await click('[data-pet="00002"]');
  await click('[data-do="buy"]');
  let s = await st(page);
  T.check('mua Cánh Cụt Hồng (Thường 1500): xu 10000 → 8500, cấp 1, tự mang theo', s.coins === 8500 && s.owned['00002'] === 1 && s.on === '00002', JSON.stringify(s));
  await click('[data-do="up"]');
  s = await st(page);
  T.check('nâng cấp 1→2 tốn 200: xu 8300', s.coins === 8300 && s.owned['00002'] === 2, JSON.stringify(s));
  await click('[data-do="up"]');
  s = await st(page);
  T.check('nâng cấp 2→3 tốn 400: xu 7900', s.coins === 7900 && s.owned['00002'] === 3, JSON.stringify(s));
  T.check('chữ kỹ năng Lv.3 và Lv.4 theo công thức', await page.evaluate(() => {
    const t = document.querySelector('.pt-skill').textContent, n = document.querySelector('.gnote').textContent;
    return t === 'Lúc xuất phát nạp sẵn 8% bình nitro' && n === 'Lv.4: Lúc xuất phát nạp sẵn 10% bình nitro';
  }));
  await click('[data-pet="00010"]');
  await click('[data-do="buy"]');
  s = await st(page);
  T.check('mua Cáo Xanh (Hiếm 4000): xu 3900, đang mang vẫn là Cánh Cụt Hồng', s.coins === 3900 && s.owned['00010'] === 1 && s.on === '00002', JSON.stringify(s));
  await click('[data-pet="00098"]');
  await click('[data-do="buy"]');
  s = await st(page);
  T.check('thiếu xu mua Gấu Cam (Cực Phẩm 9000, còn 3900): không mua, báo lý do', s.coins === 3900 && !s.owned['00098'] &&
    await page.evaluate(() => document.querySelector('.gmsg').textContent === 'Không đủ xu: cần 9.000, còn 3.900'));
  await click('[data-pet="00010"]');
  await click('[data-do="on"]');
  T.check('mang theo Cáo Xanh', (await st(page)).on === '00010');
  await click('[data-do="off"]');
  T.check('"Xóa PET" bỏ pet đang mang', (await st(page)).on === '');
  await click('[data-do="on"]');
  T.check('tổng số PET 2/8, thẻ có dấu mang theo', await page.evaluate(() => document.querySelector('.pt-title small').textContent === 'Tổng số PET: 2/8' && !!document.querySelector('.pt-eq')));
  const hit = await page.evaluate(() => [...document.querySelectorAll('.pt button')].map((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect(), hitEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { id: el.dataset.do || el.dataset.pet, by: hitEl ? hitEl.className || hitEl.tagName : '', ok: hitEl && hitEl.closest('button') === el, inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, min: Math.round(Math.min(r.width, r.height)) };
  }));
  const bad = hit.filter((r) => !r.ok || !r.inside || r.min < 44);
  T.check('mọi nút: trong màn, ≥ 44 px, tâm trúng nút', hit.length > 0 && bad.length === 0, bad.map((r) => r.id + ' ' + r.min + 'px by=' + r.by + ' ok=' + r.ok + ' in=' + r.inside).join(', ') || hit.length + ' nút');
  await shot(page, `pet-owned-${w}`);

  // ---------- bản lưu, gacha ----------
  const lv = await page.evaluate(() => {
    TD.save.d.pets = { owned: { '00002': 99, zzz: 4, '00003': 0 }, on: '00010' };
    TD.save.save(); TD.save.load();
    return TD.save.d.pets;
  });
  T.check('bản lưu hỏng được dọn: cấp 99 → 10, id lạ và cấp 0 bị bỏ, pet mang không có → rỗng', JSON.stringify(lv) === '{"owned":{"00002":10,"00003":1},"on":""}', JSON.stringify(lv));
  const g = await page.evaluate(() => {
    TD.save.d.pets = { owned: { '00002': 3 }, on: '00002' }; TD.save.d.coins = 100;
    const a = TD.pet.grant('00021'), b = TD.pet.grant('00021'), c = TD.pet.grant('khong-co');
    return { a, b, c: c.ok, coins: TD.save.d.coins, lv: TD.pet.level('00021'), on: TD.save.d.pets.on };
  });
  T.check('grant: mới → cấp 1, giữ pet đang mang; trùng → hoàn 1800 xu (9000/5); id lạ → ok=false',
    g.a.isNew && g.lv === 1 && !g.b.isNew && g.b.refund === 1800 && g.coins === 1900 && g.c === false && g.on === '00002', JSON.stringify(g));

  // ---------- kỹ năng (gọi plugin trận với trận giả) ----------
  const sk = await page.evaluate(() => {
    const P = TD.pet, out = {};
    const run = (id, lv, fn) => {
      TD.save.d.pets = { owned: { [id]: lv }, on: id };
      const ctx = { me: { nitro: { gauge: 0 }, speed: 0, fx: { stunT: 2, slowT: 2, slowMul: 0.5 } } };
      P.plugin.start(ctx); fn(ctx); return ctx;
    };
    out.gauge = run('00002', 3, (c) => P.plugin.event({ type: 'go' }, false, c)).me.nitro.gauge;
    out.gauge10 = run('00021', 10, (c) => P.plugin.event({ type: 'go' }, false, c)).me.nitro.gauge;
    out.kick = run('00010', 1, (c) => P.plugin.event({ type: 'go' }, false, c)).me.speed;
    P.roll = () => 0.05;
    const a = run('00015', 1, (c) => P.plugin.event({ type: 'item_hit' }, true, c)); out.shieldOn = [a.me.fx.stunT, a.me.fx.slowT, a.petBlocked];
    P.roll = () => 0.5;
    const b = run('00015', 1, (c) => P.plugin.event({ type: 'item_hit' }, true, c)); out.shieldOff = [b.me.fx.stunT, b.me.fx.slowT, b.petBlocked];
    const f = { reward: 200, xp: 50, dnf: false, cards: [] };
    TD.save.d.coins = 0;
    run('00003', 2, (c) => P.plugin.settle(f, c)); out.coin = [f.reward, TD.save.d.coins, f.cards.length];
    const f2 = { reward: 100, xp: 40, dnf: false, cards: [] };
    TD.save.d.xp = 0;
    run('00027', 1, (c) => P.plugin.settle(f2, c)); out.xp = [f2.xp, TD.save.d.xp, f2.reward];
    return out;
  });
  T.check('Nạp Sẵn Bình Lv.3 = 0,08 bình; Lv.10 = 0,22', near(sk.gauge, 0.08) && near(sk.gauge10, 0.22), sk.gauge + ' / ' + sk.gauge10);
  T.check('Đà Xuất Phát Lv.1: +3 km/h = 0,8333 m/s', near(sk.kick, 3 / 3.6), String(sk.kick));
  T.check('Né Đạo Cụ Lv.1 (8%): roll 0,05 né được, roll 0,5 thì không', JSON.stringify(sk.shieldOn) === '[0,0,1]' && JSON.stringify(sk.shieldOff) === '[2,2,0]', JSON.stringify(sk));
  T.check('Thêm Xu Lv.2 (+7%): thưởng 200 → 214, xu +14, một thẻ', JSON.stringify(sk.coin) === '[214,14,1]', JSON.stringify(sk.coin));
  T.check('Thêm Kinh Nghiệm Lv.1 (+5%): XP 40 → 42, xu thưởng giữ 100', JSON.stringify(sk.xp) === '[42,2,100]', JSON.stringify(sk.xp));

  if (withRace) {
    // ---------- trong trận ----------
    await page.evaluate(() => {
      TD.save.d.pets = { owned: { '00002': 3 }, on: '00002' }; TD.save.save();
      window.goGauge = null;
      TD.racePlugins.push({ event(e, mine, ctx) { if (e.type === 'go' && window.goGauge == null) window.goGauge = ctx.me.nitro.gauge; } });
      TD.main.startRace({ mode: 'speed' });
    });
    T.check('vào trận', await wait(page, () => TD.main.state === 'race' && TD.main.race, null, 120000));
    T.check('đến GO: bình nitro đúng 0,08 (Cánh Cụt Hồng Lv.3), không lái gì', await wait(page, () => window.goGauge != null, null, 120000) && near(await page.evaluate(() => window.goGauge), 0.08), String(await page.evaluate(() => window.goGauge)));
    const v = await page.evaluate(() => {
      const me = TD.main.me, view = TD.main.views[me.id], p = view.petv;
      let meshes = 0; if (p) p.g.traverse((o) => { if (o.isMesh) meshes++; });
      return { has: !!p, parent: p && p.g.parent === view.root, id: p && p.def.id, meshes, botPets: TD.main.views.filter((x) => x !== view && x.petv).length };
    });
    T.check('pet đúng gắn vào xe mình, mô hình có mesh', v.has && v.parent && v.id === '00002' && v.meshes > 0, JSON.stringify(v));
    T.check('có bot mang pet cho vui', v.botPets >= 1, 'bot có pet: ' + v.botPets);
    await page.evaluate(() => { TD.main.timeScale = 3; });
    await wait(page, () => TD.main.race.phase !== 'countdown' && TD.main.race.t - TD.main.race.goT > 3, null, 120000);
    await shot(page, `pet-race-${w}`);
    const bob = await page.evaluate(() => { const view = TD.main.views[TD.main.me.id], a = view.petv.g.position.y; return { a, near: Math.hypot(view.petv.g.position.x, view.petv.g.position.z) }; });
    T.check('pet lơ lửng cạnh xe (cách xe 1–3 m, cao > 1 m)', bob.near > 1 && bob.near < 3 && bob.a > 1, JSON.stringify(bob));
  }
  T.check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  await page.context().close();
}

(async () => {
  const srv = await T.serve();
  const br = await T.browser();
  try {
    await run(br, srv.base, 1366, 650, false, true);
    await run(br, srv.base, 844, 390, true, false);
  } finally { await br.close(); srv.close(); }
  T.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
