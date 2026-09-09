/*
 * Bộ kiểm thử cho hai thứ thêm vào Ca Trực Đêm ngày 2026-09-09:
 *   1. NÉM MÓN ĐANG ÔM — sát thương lên quái và lên đồng đội, và cái giá phải trả bằng chính món đồ.
 *   2. CỬA HÀNG NGOÀI MENU — két sắt trong localStorage, mua sẵn một món, mang vào ca là mất.
 *
 * Chạy: node test/nem-shop-suite.js
 * Tách khỏi repo-suite.js vì repo-suite đã dài mười mấy phút, và hai thứ này là hai cơ chế
 * mới nguyên nên chúng cần chạy được RIÊNG trong lúc còn đang sửa tới sửa lui.
 *
 * WHY dựng cảnh bằng cách GHIM TOẠ ĐỘ thay vì để bot tự đi tới: căn nhà sinh ngẫu nhiên
 * (`Math.random()`, không hạt giống), nên "đặt con quái cách 3 ô" có ngày rơi vào giữa một bức
 * tường và cả bài test sập vì một chuyện chẳng liên quan gì tới cú ném. Con quái đặt ngay
 * trước mặt, 34px — trong tầm bay của mọi cỡ đồ, và không có chỗ nào cho một bức tường chen vào.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const R2D = root + '/games/repo2d/index.html';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else    { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

async function moGame(b) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 820 },
    isMobile: false, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(R2D);
  await p.waitForTimeout(1200);
  return { ctx, p, errs };
}
// Bấm "Vào ca" cho tới khi thế giới thật sự chạy. Tấm màn tiêu đề có một cái chốt chống
// "bóng ma của cú chạm" nên một lần bấm không phải lúc nào cũng ăn — xem showVeil().
async function vaoCa(p) {
  for (let i = 0; i < 30; i++) {
    if (await p.evaluate(() => REPO.S.ticks || 0)) return true;
    await p.waitForTimeout(150);
    await p.evaluate(() => { const v = document.getElementById('veilBtn');
      if (v && !document.getElementById('veil').hidden) v.click(); });
  }
  return false;
}

// =====================================================================
// CỬA HÀNG NGOÀI MENU
async function cuaHangSuite(b) {
  results.push('\n── cửa hàng ngoài menu: một món, và mang vào là mất ──');
  const { ctx, p, errs } = await moGame(b);

  const nut = await p.evaluate(() => {
    const b2 = document.getElementById('shopBtn');
    return b2 ? { hidden: b2.hidden, text: b2.textContent } : null;
  });
  check('màn tiêu đề có nút Cửa hàng', !!nut && !nut.hidden, nut && nut.text);

  await p.click('#shopBtn');
  await p.waitForTimeout(250);
  const shop = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.mitem[data-mua]'));
    return { n: rows.length,
             // HÌNH THẬT, không phải một cái <img> rỗng. Chủ dự án: "các đồ bán trong shop cần
             // hình thù rõ ràng" — mà một thẻ <img src=""> thì trông y hệt một thẻ chưa tải xong.
             hinh: rows.filter(r => { const i = r.querySelector('img');
                                      return i && /^data:image/.test(i.getAttribute('src') || ''); }).length,
             mua: rows.filter(r => !r.disabled).map(r => r.getAttribute('data-mua')),
             ket: (document.querySelector('.wallet') || {}).textContent };
  });
  check('cửa hàng bày đủ năm món', shop.n === 5, shop.n + ' món');
  check('món nào cũng có HÌNH thật, không phải ô trống', shop.hinh === 5, shop.hinh + '/5');
  check('két lần đầu đủ tiền mua ít nhất một món', shop.mua.length >= 1, shop.ket);

  await p.evaluate(() => document.querySelector('.mitem[data-mua="gun"]').click());
  await p.waitForTimeout(200);
  const sauMua = await p.evaluate(() => ({ kho: REPO.khoDoc(), boRa: !!document.querySelector('[data-bo]') }));
  check('mua khẩu súng lục thì két giữ lại đúng nó',
    !!sauMua.kho.mang && sauMua.kho.mang.kind === 'gun', JSON.stringify(sauMua.kho));
  check('và bảng hiện nút "Bỏ ra" để đổi ý', sauMua.boRa);
  const khoa = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.mitem[data-mua]')).every(r => r.disabled));
  check('mua rồi thì không mua thêm món thứ hai — "tối đa 1"', khoa);

  await p.click('#veilBtn');                      // "Quay lại"
  await p.waitForTimeout(250);
  const ve = await p.evaluate(() => ({ t: document.getElementById('veilTitle').textContent,
                                       btn: document.getElementById('veilBtn').textContent,
                                       shop: !document.getElementById('shopBtn').hidden }));
  check('bấm Quay lại thì dựng lại đúng màn tiêu đề',
    ve.btn === 'Vào ca' && ve.shop, JSON.stringify(ve));

  await p.click('#veilBtn');                      // "Vào ca"
  await p.waitForTimeout(1600);
  const vao = await p.evaluate(() => ({ inv: REPO.S.player.inv.map(i => i && (i.kind + 'x' + i.uses)),
                                        kho: REPO.khoDoc() }));
  check('vào ca thì khẩu súng nằm sẵn trên tay', vao.inv[0] === 'gunx20', JSON.stringify(vao.inv));
  check('và két KHÔNG còn giữ nó nữa — "mang vào xong là mất"',
    !vao.kho.mang, JSON.stringify(vao.kho));

  check('cửa hàng: không lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// =====================================================================
// NÉM
async function nemSuite(b) {
  results.push('\n── ném món đang ôm ──');
  const { ctx, p, errs } = await moGame(b);
  check('vào được ca để đo', await vaoCa(p));

  // --- 1. ném vào quái: quái mất máu, và món đồ trả giá
  const nem = await p.evaluate(async () => {
    const S = REPO.S;
    S.monsters.length = 0;
    const pl = S.player;
    pl.hand = -1; pl.swingCd = 0; pl.stam = pl.stamMax; pl.dir = 0;
    const l = S.loot.find(x => !x.gone && !x.isHead && !x.held);
    if (!l) return { boQua: true };
    l.x = pl.x + 14; l.y = pl.y; l.onPad = null; l.inCart = false;
    l.value = l.value0 = 5000;
    l.mat = { key:'gốm', frag:1.0, thresh:95, col:'#cfd8dc', edge:'#8fa2ab', shatter:true, hit:0.85 };
    REPO.pickUp(pl);
    const camDuoc = pl.held === l;
    const m = REPO.spawnFoe('gnome', 0, 0);
    m.hp = m.hpMax = 400; m.alert = 0; m.sleep = 99;      // đứng yên làm bia
    m.x = pl.x + 34; m.y = pl.y;
    const hp0 = m.hp, gia0 = l.value;
    const nemDuoc = REPO.throwHeld(pl, 0);
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) await new Promise(r => requestAnimationFrame(r));
    return { camDuoc, nemDuoc, dmg: Math.round(hp0 - m.hp), gia0, gia: Math.round(l.value),
             vo: !!l.gone, nut: l.cracks, conCam: !!pl.held };
  });
  check('dựng được cảnh: đang ôm một món, quái đứng trước mặt', !nem.boQua && nem.camDuoc);
  check('bấm ném thì món rời tay', !nem.boQua && nem.nemDuoc && !nem.conCam);
  check('món bay vào QUÁI thì quái mất máu', !nem.boQua && nem.dmg > 0, nem.dmg + ' sát thương');
  // Vế thứ hai của luật, và là vế chủ dự án nhắc riêng: "loot ném vào quái có thể mất giá
  // hoặc bể lun nha". Món gốm cỡ nhỏ/vừa thì vỡ hẳn; cỡ to thì mất một phần. Nên phép đo là
  // "mất giá HOẶC vỡ", không phải "vỡ".
  check('và chính món đồ mất giá hoặc vỡ luôn', !nem.boQua && (nem.vo || nem.gia < nem.gia0),
    nem.vo ? 'vỡ luôn' : (nem.gia0 + ' → ' + nem.gia));

  // --- 2. ném vào đồng đội: đau thật, nhưng không một phát gục từ máu đầy
  const ff = await p.evaluate(async () => {
    const S = REPO.S;
    S.monsters.length = 0;
    const pl = S.player, a = (S.mates || [])[0];
    if (!a) return { boQua: true };
    pl.hand = -1; pl.swingCd = 0; pl.dir = 0;
    const l = S.loot.find(x => !x.gone && !x.isHead && !x.held);
    if (!l) return { boQua: true };
    l.x = pl.x + 14; l.y = pl.y; l.value = l.value0 = 5000;
    REPO.pickUp(pl);
    a.down = false; a.hp = a.hpMax;
    const hp0 = a.hp;
    REPO.throwHeld(pl, 0);
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      a.x = pl.x + 34; a.y = pl.y;                        // ghim chân: nó phải ăn trọn cú ném
      await new Promise(r => requestAnimationFrame(r));
    }
    return { dmg: Math.round(hp0 - a.hp), max: a.hpMax, guc: !!a.down };
  });
  check('món bay vào ĐỒNG ĐỘI cũng gây sát thương', !ff.boQua && ff.dmg > 0, ff.dmg + ' sát thương');
  check('nhưng không bao giờ một phát gục từ máu đầy', ff.boQua || (!ff.guc && ff.dmg < ff.max),
    ff.dmg + '/' + ff.max);

  // --- 3. cái đầu đồng đội: ném được, và không làm ai đau
  const dau = await p.evaluate(async () => {
    const S = REPO.S;
    S.monsters.length = 0;
    const pl = S.player;
    pl.hand = -1; pl.swingCd = 0; pl.dir = 0;
    const h = S.loot.find(x => x.isHead && !x.gone);
    if (!h) return { boQua: true };
    h.held = false; h.onPad = null; h.inCart = false;
    h.x = pl.x + 14; h.y = pl.y;
    REPO.pickUp(pl);
    if (pl.held !== h) return { boQua: true };
    const m = REPO.spawnFoe('gnome', 0, 0);
    m.hp = m.hpMax = 400; m.sleep = 99;
    m.x = pl.x + 34; m.y = pl.y;
    const hp0 = m.hp;
    REPO.throwHeld(pl, 0);
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) await new Promise(r => requestAnimationFrame(r));
    return { dmg: Math.round(hp0 - m.hp), conCam: !!pl.held };
  });
  // `boQua` khi trong nhà chưa ai gục — bình thường, và không phải một cái hỏng.
  check('cái đầu đồng đội ném được mà không làm ai đau',
    dau.boQua || (!dau.conCam && dau.dmg === 0),
    dau.boQua ? 'chưa có ai gục để lấy đầu — bỏ qua' : dau.dmg + ' sát thương');

  // --- 4. KIM LOẠI cũng phải sứt. Lỗ hổng đo được trên bản đã đẩy lên Pages: món to bằng kim
  // loại ném rất chậm nên cú va rơi dưới ngưỡng 260 của nó — ăn 200 sát thương, mất ĐÚNG 0 đồng,
  // nhặt lên ném lại vô hạn. Sàn ở throwLand() vá chỗ đó, và đây là phép giữ nó.
  const kim = await p.evaluate(async () => {
    const S = REPO.S;
    S.monsters.length = 0;
    const pl = S.player;
    pl.hand = -1; pl.swingCd = 0; pl.dir = 0;
    const l = S.loot.find(x => !x.gone && !x.isHead && !x.held);
    if (!l) return { boQua: true };
    l.x = pl.x + 14; l.y = pl.y; l.onPad = null; l.inCart = false;
    l.mass = 58; l.r = 16; l.sizeIdx = 2;                 // món TO nhất, ném chậm nhất
    l.value = l.value0 = 9000; l.cracks = 0;
    l.mat = { key:'kim loại', frag:0.18, thresh:260, col:'#98a0a8', edge:'#5f676f',
              shatter:false, hit:1.25 };
    REPO.pickUp(pl);
    if (pl.held !== l) return { boQua: true };
    const m = REPO.spawnFoe('gnome', 0, 0);
    m.hp = m.hpMax = 900; m.sleep = 99; m.x = pl.x + 34; m.y = pl.y;
    const hp0 = m.hp, gia0 = l.value;
    REPO.throwHeld(pl, 0);
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) await new Promise(r => requestAnimationFrame(r));
    return { dmg: Math.round(hp0 - m.hp), gia0, gia: Math.round(l.value), nut: l.cracks };
  });
  check('món TO bằng KIM LOẠI vẫn đau, mà cũng vẫn phải trả giá',
    !kim.boQua && kim.dmg > 0 && kim.gia < kim.gia0,
    kim.boQua ? 'bỏ qua' : kim.dmg + ' sát thương · ' + kim.gia0 + ' → ' + kim.gia);

  // --- 5. thang đo: món nặng đau hơn món nhẹ, cùng một sức
  const thang = await p.evaluate(() => {
    const gia = (mass, r, hit) => {
      const l = { mass, r, mat: { hit } };
      return REPO.throwDamage(l, REPO.throwSpeed(REPO.S.player, l));
    };
    return { nho: gia(8, 7, 1), vua: gia(24, 11, 1), to: gia(58, 16, 1) };
  });
  check('thang đo: nặng hơn thì đau hơn, đúng thứ tự ba cỡ',
    thang.nho < thang.vua && thang.vua < thang.to,
    'nhỏ ' + thang.nho + ' · vừa ' + thang.vua + ' · to ' + thang.to);
  // Dải của bản gốc: 5..120 cho đồ thường, 50/100/150 cho ba cỡ orb. Ngưỡng nới tới 200 vì
  // món to bằng kim loại vượt 120, và nó đáng vượt — xem RESEARCH.md mục 7.
  check('và cả ba nằm trong dải bản gốc (5..200)',
    thang.nho >= 5 && thang.to <= 200, JSON.stringify(thang));

  check('ném: không lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  try {
    await cuaHangSuite(b);
    await nemSuite(b);
  } catch (e) {
    check('bộ test chạy trọn', false, (e && e.message) || String(e));
  }
  await b.close();
  console.log(results.join('\n'));
  console.log('\n════════════════════════════════════════════════════');
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})();
