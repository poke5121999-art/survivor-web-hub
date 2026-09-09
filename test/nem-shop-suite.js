/*
 * Bộ kiểm thử cho hai thứ thêm vào Ca Trực Đêm ngày 2026-09-09:
 *   1. NÉM MÓN ĐANG ÔM — sát thương lên quái và lên đồng đội, và cái giá phải trả bằng chính món đồ.
 *   2. CỬA HÀNG NGOÀI MENU — két sắt trong localStorage, mua sẵn một món, mang vào ca là mất.
 *   3. BA CHIẾC XE lấy từ Soul Knight — tám hướng mỗi chiếc, và góc phải khớp hướng.
 *   4. MẶT XÁC bên Biệt Đội — chân dung vẽ bằng charset thật, không phải emoji.
 *   5. CỬA HÀNG ĐỒ NGHỀ bên Biệt Đội — cùng luật, ví riêng.
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
const SQUAD = root + '/games/repo-squad/index.html';

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

// =====================================================================
// CỬA VÀO CỬA HÀNG, VÀ ĐẠN PHẢI KHỚP VỚI KHẨU SÚNG
//
// Chủ dự án, 2026-09-09 (lần thứ hai): "chưa thấy chỗ mua weapon để trang bị bên ngoài, cái
// loại đạn bắn ra chưa khớp với weapon, bomb cũng vậy".
//
// Vế đầu KHÔNG phải lỗi bố cục — đo bốn khổ màn hình, kể cả 375x553 đã trừ thanh địa chỉ, thì
// nút "Cửa hàng" trên màn tiêu đề lần nào cũng nằm trong khung nhìn. Lỗi là màn tiêu đề chỉ
// sống vài giây rồi mất, và sau đó đường duy nhất quay lại nó là chết hoặc tải lại trang. Nên
// phép thử ở đây đo đúng cái đã thiếu: **mở được cửa hàng TRONG LÚC ĐANG CHƠI**.
async function cuaVaCoSuite(b) {
  results.push('\n── cửa hàng phải mở được giữa ca, và đạn phải ra hình khẩu súng ──');
  const { ctx, p, errs } = await moGame(b);
  check('vào được ca để đo', await vaoCa(p));

  const nut = await p.evaluate(() => {
    const t = document.getElementById('shopTopBtn');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { an: t.hidden, chu: t.textContent.trim(),
             thay: r.top >= 0 && r.bottom <= innerHeight && r.width > 10 };
  });
  check('thanh trên có nút Cửa hàng, và nó nhìn thấy được GIỮA CA',
    !!nut && !nut.an && nut.thay, nut ? nut.chu : 'không có nút');

  await p.click('#shopTopBtn');
  await p.waitForTimeout(450);
  const giua = await p.evaluate(() => ({
    hien: !document.getElementById('veil').hidden,
    tieuDe: document.getElementById('veilTitle').textContent,
    noiRo: /giữa ca/i.test(document.getElementById('veilBody').textContent),
    dung: !REPO.S.running,
    hang: document.querySelectorAll('.mitem[data-mua]').length }));
  check('bấm giữa ca thì mở đúng bảng cửa hàng', giua.hien && giua.tieuDe === 'Cửa hàng' && giua.hang === 5,
    JSON.stringify(giua));
  // Cùng luật với Sổ tay: bảng bấm được giữa ca thì thế giới phải DỪNG. Để con quái đi lại sau
  // tấm màn trong lúc người chơi đang chọn hàng là một cái bẫy, không phải một tính năng.
  check('và thế giới dừng lại trong lúc chọn hàng', giua.dung);
  check('bảng nói rõ món mua bây giờ là của CA SAU', giua.noiRo);
  await p.click('#veilBtn');                       // "Quay lại"
  await p.waitForTimeout(450);
  const ve = await p.evaluate(() => ({ an: document.getElementById('veil').hidden, chay: REPO.S.running }));
  check('đóng lại thì về đúng ca đang chơi, KHÔNG nhảy về màn tiêu đề', ve.an && ve.chay,
    JSON.stringify(ve));

  // ---- đạn: mỗi khẩu một hình, đo trên MỘT CANVAS SẠCH
  //
  // Đo trên khung hình thật thì không được, và đã thử: chỗ viên đạn bay qua nằm trong lõi nón
  // đèn pin, vốn đã cháy trắng trước khi viên đạn được vẽ lên, nên điểm sáng nhất trả về
  // rgb(255,255,255) cho mọi loại đạn. Chụp hai lần rồi trừ nhau cũng không xong: cả lớp
  // hiệu ứng lẫn HUD đều nhúc nhích giữa hai lần chụp và phần lệch của chúng át phần lệch của
  // viên đạn.
  //
  // `veDan()` là một hàm THUẦN — nhận ngữ cảnh và một viên đạn, vẽ ra. Gọi thẳng nó lên một
  // canvas trống là đo đúng cái đang cần đo: HÌNH của viên đạn, không kèm gì khác.
  const mau = await p.evaluate(() => {
    const ve = kind => {
      const cv = document.createElement('canvas');
      cv.width = 60; cv.height = 40;
      const c = cv.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, 60, 40);
      REPO.veDan(c, { x: 30, y: 20, vx: 500, vy: 0, kind });
      const d = c.getImageData(0, 0, 60, 40).data;
      // MÀU TRUNG BÌNH của phần có mực, KHÔNG phải điểm sáng nhất.
      //
      // Bản cũ lấy điểm sáng nhất, và nó hỏng ngay ngày viên đạn đổi từ hình vector sang
      // sprite Soul Knight: hình vẽ tay có chỗ sáng nhất là cái lõi đồng, còn sprite thật
      // có một CHẤM BẮT SÁNG trắng tinh ở mũi — nên phép đo trả về rgb(255,255,255) cho
      // khẩu lục, tức là "viên đạn màu trắng", tức là bài test đo cái chấm chứ không đo
      // viên đạn. Trung bình thì một hai điểm trắng không lật được cả nắm điểm vàng.
      let r = 0, g2 = 0, b2 = 0, muc = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] + d[i + 1] + d[i + 2] <= 30) continue;
        r += d[i]; g2 += d[i + 1]; b2 += d[i + 2]; muc++;
      }
      const n = Math.max(1, muc);
      return { sang: [Math.round(r / n), Math.round(g2 / n), Math.round(b2 / n)], muc };
    };
    return { gun: ve('gun'), tranq: ve('tranq'), shot: ve('shot') };
  });
  const g = mau.gun.sang, t = mau.tranq.sang, sh = mau.shot.sang;
  check('cả ba loại đạn đều vẽ ra một hình thật',
    mau.gun.muc > 20 && mau.tranq.muc > 20 && mau.shot.muc > 5,
    'mực: lục ' + mau.gun.muc + ' · mê ' + mau.tranq.muc + ' · hoa cải ' + mau.shot.muc);
  check('đạn súng lục ra màu ĐỒNG ẤM (đỏ trội hơn xanh lá)', g[0] > g[1] + 6,
    'rgb(' + g.join(',') + ')');
  check('đạn súng gây mê ra màu XANH của mũi tiêm (xanh lá trội hơn đỏ)', t[1] > t[0] + 6,
    'rgb(' + t.join(',') + ')');
  // Hoa cải khác súng lục ở CỠ, không ở độ sáng: nó là một hạt chì ngắn ngủn với vệt gần như
  // không có, còn khẩu lục là một viên đạn có vệt sáng kéo dài. Đo bằng lượng mực chứ đừng đo
  // bằng điểm sáng nhất — cái chấm bắt sáng trên hạt chì vẫn sáng ngang đầu đạn đồng, và bảy
  // hạt cùng lúc phải đọc ra là MỘT NÓN chứ không phải bảy phát bắn.
  check('hạt hoa cải ngắn hơn hẳn viên đạn súng lục',
    mau.gun.muc > mau.shot.muc * 1.5,
    'mực: lục ' + mau.gun.muc + ' · hoa cải ' + mau.shot.muc);
  check('ba khẩu KHÔNG còn dùng chung một cái chấm',
    (g[0] - g[1]) - (t[0] - t[1]) > 20,
    'lệch đỏ-lục: súng lục ' + (g[0] - g[1]) + ' · mê ' + (t[0] - t[1]));

  check('cửa hàng giữa ca + đạn: không lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// =====================================================================
// ÁNH SÁNG TRÊN ĐỒ ĐẠC
//
// Chủ dự án, 2026-09-09: "phần ánh sáng lúc nhìn lên bàn, ghế, cây dừa chưa hợp lý".
//
// Gốc rễ và số đo đầy đủ: `games/repo2d/art/room/README.md`, mục "Miếng đồ CAO HƠN ô của nó".
// Tóm tắt: lưới đánh dấu MỘT ô là có đồ, mà 145/194 miếng hình cao hơn một ô. Đèn đi theo lưới
// nên nó tắt đúng ở mép ô, cắt ngang thân cái tủ / cây dừa — đo được 222 tụt xuống 7 trên 255,
// qua một vạch rộng 1–2 đơn vị thế giới.
//
// PHÉP ĐO BUỘC HAI CON SỐ VÀO NHAU, và đó là chỗ khiến nó không mục:
//   - món CÓ tràn ra khỏi ô (`propUp > 1,5`) thì mép sáng phải MƯỢT;
//   - món KHÔNG tràn thì mép cứng ở biên ô là ĐÚNG, không phải lỗi — art dừng ở đó thật.
// Một phép chỉ đòi "mọi mép đều mượt" là đòi sai, và cách duy nhất làm nó xanh sẽ là soi sáng
// bừa cả những chỗ chẳng có gì.
async function anhSangDoSuite(b) {
  results.push('\n── ánh sáng trên đồ đạc: đèn phải trùm hết món, không cắt ngang nó ──');
  const { ctx, p, errs } = await moGame(b);
  check('vào được ca để đo ánh sáng', await vaoCa(p));

  const gom = { tran: [], phang: [] };
  for (const seed of [4242, 1234, 99]) {
    const kq = await p.evaluate(async (seed) => {
      // Chộp ma trận thế giới ngay lúc game đặt nó, để đổi toạ độ thế giới ra điểm ảnh.
      const proto = CanvasRenderingContext2D.prototype;
      if (!proto.__vaSetT) {
        proto.__vaSetT = proto.setTransform;
        proto.setTransform = function (a) {
          if (typeof a === 'number' && a !== 1)
            window.__M = { a, d: arguments[3], e: arguments[4], f: arguments[5] };
          return proto.__vaSetT.apply(this, arguments);
        };
      }
      REPO.resetRun(); REPO.startLevel(seed); REPO.S.cut = null; REPO.S.running = true;
      await new Promise(r => setTimeout(r, 350));
      const S = REPO.S, T = REPO.TILE, MW = REPO.MW, MH = REPO.MH;
      // Ô đồ đạc có ô trên KHÔNG đặc (nhóm có thể bị cắt) và ba ô sàn dưới để đứng soi lên.
      const ds = [];
      for (let gy = 3; gy < MH - 5; gy++) for (let gx = 2; gx < MW - 2; gx++) {
        if (!S.deco[gy * MW + gx] || !REPO.solidAt(gx, gy)) continue;
        if (REPO.solidAt(gx, gy - 1)) continue;
        if (REPO.solidAt(gx, gy + 1) || REPO.solidAt(gx, gy + 2) || REPO.solidAt(gx, gy + 3)) continue;
        ds.push({ gx, gy, up: +(REPO.propUp(gx, gy) || 0).toFixed(1) });
      }
      const out = [];
      const cv = document.getElementById('game'), c = cv.getContext('2d');
      for (const o of ds) {
        const pl = S.player;
        pl.x = (o.gx + 0.5) * T; pl.y = (o.gy + 3.2) * T;
        pl.dir = -Math.PI / 2;                       // soi THẲNG LÊN vào mặt món đồ
        pl.held = null; pl.hand = -1; pl.kx = pl.ky = 0;
        S.monsters.length = 0; S.mates.length = 0;
        let ok = false;
        for (let t = 0; t < 40 && !ok; t++) {        // đợi camera bắt kịp chỗ vừa đặt xuống
          await new Promise(r => requestAnimationFrame(r));
          const M = window.__M;
          if (!M) continue;
          const px = M.a * (o.gx + 0.5) * T + M.e;
          ok = px > 30 && px < cv.width - 30;
        }
        if (!ok) continue;
        await new Promise(r => setTimeout(r, 110));
        const M = window.__M;
        const px = Math.round(M.a * (o.gx + 0.5) * T + M.e);
        const yMep = Math.round(M.d * (o.gy * T) + M.f);
        if (yMep - 20 < 0 || yMep + 20 > cv.height) continue;
        const lay = y => { const d = c.getImageData(px, y, 1, 1).data;
                           return Math.round((d[0] + d[1] + d[2]) / 3); };
        out.push({ up: o.up, chenh: Math.abs(lay(yMep + 6) - lay(yMep - 6)) });
        if (out.length >= 8) break;
      }
      return out;
    }, seed);
    for (const r of kq) (r.up > 1.5 ? gom.tran : gom.phang).push(r.chenh);
  }
  const tb = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : -1;
  check('đo được đủ nhiều món có phần tràn ra khỏi ô', gom.tran.length >= 12,
    gom.tran.length + ' món');
  // Ngưỡng 45 chứ không phải 0: thân món đồ vốn có vân sáng tối của chính nó, và mép ô vẫn là
  // chỗ hai ô sàn khác nhau gặp nhau. Trước bản vá, con số này là 120–190.
  check('đèn KHÔNG còn cắt ngang thân món đồ có phần tràn',
    gom.tran.length >= 12 && tb(gom.tran) < 45,
    'chênh trung bình qua mép ô: ' + tb(gom.tran) + '/255');
  check('quá nửa số món ấy mượt hẳn (dưới 30/255)',
    gom.tran.length >= 12 && gom.tran.filter(v => v < 30).length * 2 >= gom.tran.length,
    gom.tran.filter(v => v < 30).length + '/' + gom.tran.length);
  // Vế thứ hai, và nó chống lại đúng cách sửa sai: soi sáng bừa cả chỗ không có gì.
  check('món KHÔNG tràn thì mép vẫn cứng ở biên ô — đèn không tràn ra chỗ trống',
    gom.phang.length === 0 || tb(gom.phang) > 45,
    gom.phang.length ? tb(gom.phang) + '/255 trên ' + gom.phang.length + ' món' : 'không gặp món nào');
  check('ánh sáng đồ đạc: không lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// =====================================================================
// BA CHIẾC XE LẤY TỪ SOUL KNIGHT
// Chủ dự án: "dùng 2 miner cart trong soul knight để làm 2 xe của repo", rồi "lấy cart to
// nhất để làm cart đẩy". Nên bài này kiểm ba điều, và điều thứ ba mới là điều dễ sai nhất:
//   1. tấm `xe.png` về tới nơi và ba chiếc là BA hình khác nhau;
//   2. mỗi chiếc đủ TÁM HƯỚNG và tám hướng ấy khác nhau thật (không phải một khung nhân tám);
//   3. `huongKhung()` đổi góc ra đúng hàng — sai một nhịp là xe chạy sang phải mà quay đầu
//      lên trời, và không có bài test nào khác trong repo bắt được chuyện đó.
async function xeSuite(b) {
  results.push('\n── ba chiếc xe: hình Soul Knight, tám hướng, và hướng phải khớp góc ──');
  const { ctx, p, errs } = await moGame(b);
  check('vào được ca để đo xe', await vaoCa(p));

  const do1 = await p.evaluate(() => {
    if (!window.REPO_SKIN || !REPO_SKIN.xe) return { thieu: true };
    const ve = (kind, h) => {
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 96;
      const c = cv.getContext('2d');
      const oke = REPO_SKIN.xe(c, kind, h, 48, 48, 96);
      const d = c.getImageData(0, 0, 96, 96).data;
      let r = 0, g = 0, bl = 0, n = 0, bam = '';
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++;
      }
      // dấu vân của khung: lưới 12×12 ô, mỗi ô một chữ số độ phủ — đủ để phân biệt hai hướng
      for (let gy = 0; gy < 12; gy++) for (let gx = 0; gx < 12; gx++) {
        let dem = 0;
        for (let y = gy * 8; y < gy * 8 + 8; y++)
          for (let x = gx * 8; x < gx * 8 + 8; x++)
            if (d[(y * 96 + x) * 4 + 3] >= 128) dem++;
        bam += (dem >> 3);
      }
      const k = Math.max(1, n);
      return { oke, n, mau: [Math.round(r / k), Math.round(g / k), Math.round(bl / k)], bam };
    };
    const out = {};
    for (const kind of ['scout', 'haul', 'day']) {
      out[kind] = [];
      for (let h = 0; h < 8; h++) out[kind].push(ve(kind, h));
    }
    out.la = ve('khong-co-chiec-nay', 0).oke;      // khoá lạ thì phải từ chối, không được ném lỗi
    return out;
  });

  if (do1.thieu) {
    check('sprites.js có xuất hàm xe()', false, 'REPO_SKIN.xe không tồn tại');
  } else {
    const dem = k => do1[k].reduce((a, x) => a + (x.oke && x.n > 200 ? 1 : 0), 0);
    check('mỗi chiếc đủ TÁM hướng và hướng nào cũng vẽ ra hình',
      dem('scout') === 8 && dem('haul') === 8 && dem('day') === 8,
      'scout ' + dem('scout') + ' · haul ' + dem('haul') + ' · đẩy ' + dem('day'));
    // Tám hướng phải là TÁM hình. Nếu ai đó lỡ ghép tấm sai (một khung nhân tám, hoặc chỉ
    // đủ bốn rồi lặp lại) thì trong game xe vẫn "chạy", chỉ là quay đầu không đổi hình —
    // một lỗi im lặng. Đếm số dấu vân khác nhau là bắt được nó.
    for (const k of ['scout', 'haul', 'day']) {
      const rieng = new Set(do1[k].map(x => x.bam)).size;
      check('chiếc "' + k + '": tám hướng là tám hình khác nhau', rieng >= 6,
        rieng + '/8 khung riêng biệt');
    }
    // Ba chiếc phải đọc ra là BA chiếc. Đo bằng màu trung bình của phần có hình.
    const m = k => do1[k][2].mau;                   // hướng đông, khung nhìn ngang rõ nhất
    const sc = m('scout'), ha = m('haul'), da = m('day');
    check('xe trinh sát ra màu HỒNG (xanh dương trội hơn xanh lá)', sc[2] > sc[1] + 8,
      'rgb(' + sc.join(',') + ')');
    check('xe chở đồ ra màu CAM GỖ (xanh lá trội hơn hẳn xanh dương)', ha[1] > ha[2] + 20,
      'rgb(' + ha.join(',') + ')');
    check('ba chiếc là ba màu, không phải một tấm dùng chung',
      Math.abs(sc[0] - ha[0]) > 25 && Math.abs(ha[2] - da[2]) > 15,
      'scout rgb(' + sc.join(',') + ') · haul rgb(' + ha.join(',') + ') · đẩy rgb(' + da.join(',') + ')');
    // "lấy cart to nhất để làm cart đẩy" — kiểm đúng câu ấy: chiếc đẩy phải phủ nhiều điểm
    // ảnh hơn cả hai chiếc kia, vì nó vốn là khung to nhất trong cả bộ xe goòng.
    const nn = k => Math.max.apply(null, do1[k].map(x => x.n));
    check('xe đẩy là chiếc TO NHẤT trong ba chiếc', nn('day') > nn('haul') && nn('haul') > nn('scout'),
      'đẩy ' + nn('day') + ' > chở ' + nn('haul') + ' > trinh sát ' + nn('scout') + ' điểm ảnh');
    check('khoá lạ thì xe() từ chối chứ không vẽ bừa', do1.la === false, String(do1.la));
  }

  // huongKhung(): góc canvas (0 sang phải, dương là theo chiều kim đồng hồ) ra số hàng.
  const hk = await p.evaluate(() => {
    const P2 = Math.PI;
    return {
      bac:   REPO.huongKhung(-P2 / 2),
      dong:  REPO.huongKhung(0),
      nam:   REPO.huongKhung(P2 / 2),
      tay:   REPO.huongKhung(P2),
      dnam:  REPO.huongKhung(P2 / 4),
      quanh: REPO.huongKhung(P2 * 3 / 2),
      am:    REPO.huongKhung(-P2)
    };
  });
  check('huongKhung: lên = hàng 0, phải = 2, xuống = 4, trái = 6',
    hk.bac === 0 && hk.dong === 2 && hk.nam === 4 && hk.tay === 6, JSON.stringify(hk));
  check('huongKhung: chéo xuống-phải = hàng 3', hk.dnam === 3, String(hk.dnam));
  check('huongKhung: góc quá một vòng vẫn về đúng hàng',
    hk.quanh === 0 && hk.am === 6, JSON.stringify({ quanh: hk.quanh, am: hk.am }));

  // Và vẽ thật: cả hai chiếc xe máy lẫn chiếc xe đẩy phải nằm trong ván, và khung hình vẫn
  // chạy trơn sau khi đổi cách vẽ chúng.
  const thuc = await p.evaluate(async () => {
    const S = REPO.S;
    const t0 = S.ticks;
    for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
    return { xe: (S.bikes || []).length, day: !!S.cart, chay: S.ticks > t0 };
  });
  check('ván vẫn có đủ hai chiếc xe máy và một chiếc xe đẩy',
    thuc.xe === 2 && thuc.day, JSON.stringify(thuc));
  check('khung hình vẫn chạy sau khi đổi cách vẽ xe', thuc.chay);
  check('xe: không lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// =====================================================================
// BIỆT ĐỘI: MẶT XÁC PHẢI LÀ HÌNH THẬT
// Chủ dự án: "bên ngoài menu thì cũng thể hiện char rõ ràng đi đừng dùng icon nữa", rồi khi
// bản Ca Trực Đêm đã sửa mà bên này chưa: "tui thấy char vẫn đang là mấy cái icon".
//
// Bài này đo ĐÚNG cái ấy: mọi ô chân dung phải là <canvas> CÓ MỰC, và mười bốn xác phải ra
// mười bốn hình khác nhau — vì cái bẫy dễ dính nhất không phải "không vẽ được" mà là "vẽ
// được nhưng ai cũng như ai", tức `charId` không tới nơi và cả lưới rơi về một xác mặc định.
async function matSuite(b) {
  results.push('\n── Biệt Đội: mặt xác là hình thật, không phải emoji ──');
  const ctx = await b.newContext({ viewport: { width: 420, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(SQUAD);
  await p.waitForTimeout(2200);

  const muc = cv => `` ;   // giữ chỗ, đo trong trang

  const nha = await p.evaluate(() => {
    const ds = [...document.querySelectorAll('canvas.mat')];
    return ds.map(cv => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return { lop: cv.className, char: cv.dataset.char,
               phu: Math.round(n / (cv.width * cv.height) * 100) };
    });
  });
  check('màn chính có ô chân dung, và ô nào cũng là <canvas>', nha.length >= 2, nha.length + ' ô');
  check('ô nào cũng vẽ ra hình thật, không ô nào trống',
    nha.length >= 2 && nha.every(o => o.phu >= 8),
    nha.map(o => o.lop.replace('mat ', '') + ' ' + o.phu + '%').join(' · '));
  check('không còn emoji nào trong ô chân dung của màn chính',
    await p.evaluate(() => {
      const t = (q) => [...document.querySelectorAll(q)].map(e => e.textContent.trim()).join('');
      return !/[\uD800-\uDFFF←-⯿]/.test(t('.sc-face') + t('.lu-f:not(.lu.empty .lu-f)') + t('.me-av'));
    }), 'đo trên .sc-face + .lu-f + .me-av');

  // Mười bốn xác, mười bốn hình. Mở tab Biệt đội để cả lưới cùng hiện.
  await p.evaluate(() => SQ.ui.go('squad'));
  await p.waitForTimeout(900);
  const lua = await p.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      const ds = [...document.querySelectorAll('canvas.mat')];
      if (ds.length && ds.every(cv => cv.dataset.xong === '1')) break;
      await new Promise(r => requestAnimationFrame(r));
    }
    const bam = new Map();
    for (const cv of document.querySelectorAll('canvas.mat[data-char]')) {
      if (bam.has(cv.dataset.char)) continue;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let s = '';
      for (let i = 3; i < d.length; i += 4) s += d[i] > 40 ? '1' : '0';
      // rút gọn thành một số để so cho rẻ
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      bam.set(cv.dataset.char, h);
    }
    return { soXac: bam.size, soHinh: new Set(bam.values()).size };
  });
  check('lưới Biệt đội bày đủ mười bốn xác', lua.soXac >= 14, lua.soXac + ' xác');
  check('mười bốn xác ra mười bốn hình KHÁC NHAU — charId tới đúng nơi',
    lua.soHinh >= 14, lua.soHinh + '/' + lua.soXac + ' hình riêng biệt');
  check('mặt xác: không lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// =====================================================================
// BIỆT ĐỘI: CỬA HÀNG ĐỒ NGHỀ
// Chủ dự án: "repo squad cũng chưa có shop weapon".
//
// Cùng luật với bên Ca Trực Đêm — một món, mang vào là mất — nhưng trả bằng VÀNG của Biệt Đội
// và cất trong bản lưu của nó, không đụng tới két `repo2d.kho.v1`. Bài này kiểm cả hai vế:
// luật chơi đúng, VÀ hai cái ví không dính vào nhau.
async function khoSquadSuite(b) {
  results.push('\n── Biệt Đội: cửa hàng đồ nghề mang vào ca ──');
  const ctx = await b.newContext({ viewport: { width: 420, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(SQUAD);
  await p.waitForTimeout(2200);

  // CỬA THỨ NHẤT: ô đồ nghề KẾ BÊN nút ĐI CA. Đây là bài học của lần trước — chỗ bán nằm ở
  // một màn hình người chơi không ghé thì với họ nó không tồn tại — cộng lời chỉnh của chủ dự
  // án: "để cái shop weapon đó kế bên nút đi ca đi, tự nhiên phóng to cái nút đó ra chi vậy?".
  // Nên bài này đo cả BA vế: có, thấy được, và ĐÚNG LÀ nằm cạnh nút ĐI CA chứ không phải một
  // dải rộng bằng nó.
  const bar = await p.evaluate(() => {
    const d = document.querySelector('.gomang');
    const cta = document.querySelector('.gorow > .b.cta');
    if (!d || !cta) return null;
    const r = d.getBoundingClientRect(), c = cta.getBoundingClientRect();
    return { chu: d.textContent.replace(/\s+/g, ' ').trim(),
             thay: r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0,
             cungHang: Math.abs(r.top - c.top) < 4 && r.right <= c.left + 1,
             beHon: r.width < c.width / 2,
             rong: Math.round(r.width), rongCta: Math.round(c.width) };
  });
  check('màn chính có ô đồ nghề, và nó nằm trong khung nhìn',
    !!bar && bar.thay, bar ? bar.chu : 'không có ô');
  check('ô ấy nằm KẾ BÊN nút ĐI CA, trên cùng một hàng', !!bar && bar.cungHang,
    bar ? JSON.stringify({ rong: bar.rong, rongCta: bar.rongCta }) : '—');
  check('và nó NHỎ hơn hẳn nút ĐI CA — không giành chỗ với việc chính',
    !!bar && bar.beHon, bar ? bar.rong + 'px so với ' + bar.rongCta + 'px' : '—');

  // CỬA THỨ HAI: bấm ô là sang thẳng chỗ bán.
  const sang = await p.evaluate(async () => {
    document.querySelector('.gomang').click();
    await new Promise(r => setTimeout(r, 400));
    return { hang: document.querySelectorAll('.wep').length,
             tren: !!document.querySelector('.sheet-b > h3') &&
                   document.querySelector('.sheet-b > h3').textContent.indexOf('Đồ nghề') >= 0 };
  });
  check('bấm ô thì mở đúng chỗ bán, và nó nằm TRÊN CÙNG màn Cửa Hàng',
    sang.hang === 5 && sang.tren, JSON.stringify(sang));
  check('năm món đều có HÌNH thật, không phải ô trống',
    await p.evaluate(() => [...document.querySelectorAll('.wep img')]
      .filter(i => i.src.length > 200).length) === 5);

  // MUA: đúng giá, và giá lấy từ MỘT bảng chung với Ca Trực Đêm.
  const mua = await p.evaluate(() => {
    const gia = REPO.KHO_HANG.filter(h => h.key === 'bomb')[0].gia;
    const truoc = SQ.M.gold;
    const r = SQ.muaDoNghe('bomb');
    return { ok: r.ok, gia: gia, tru: truoc - SQ.M.gold, mang: SQ.M.mang };
  });
  check('mua thì trừ đúng số vàng ghi trên thẻ', mua.ok && mua.tru === mua.gia,
    'trừ ' + mua.tru + ' / giá ' + mua.gia);
  check('và bản lưu giữ lại đúng món ấy', !!mua.mang && mua.mang.kind === 'bomb',
    JSON.stringify(mua.mang));
  const hai = await p.evaluate(() => SQ.muaDoNghe('gun'));
  check('mua rồi thì không mua thêm món thứ hai — "tối đa 1"', hai.ok === false, hai.why);

  // BỎ RA thì hoàn ĐỦ. Bấm nhầm rồi bị phạt tiền là một cái bẫy, không phải một luật chơi.
  const bo = await p.evaluate(() => {
    const truoc = SQ.M.gold;
    const r = SQ.boDoNghe();
    return { ok: r.ok, hoan: SQ.M.gold - truoc, mang: SQ.M.mang };
  });
  check('bỏ ra thì hoàn ĐỦ tiền, không phạt', bo.ok && bo.hoan === mua.gia && !bo.mang,
    'hoàn ' + bo.hoan + ' / giá ' + mua.gia);

  // VÀO CA: món lên tay, và bản lưu rỗng ngay — "mang vào là mất".
  const vao = await p.evaluate(async () => {
    SQ.muaDoNghe('gun');
    const ok = SQ.squad.enter(SQ.MAPS[0].id);
    await new Promise(r => setTimeout(r, 600));
    const pl = REPO.S.player;
    return { ok: ok, tay: pl ? pl.inv.map(x => x ? x.kind + 'x' + x.uses : null) : null,
             conLai: SQ.M.mang };
  });
  check('vào ca thì món mua sẵn nằm ngay trên tay', vao.ok && vao.tay && vao.tay[0] === 'gunx20',
    JSON.stringify(vao.tay));
  check('và bản lưu KHÔNG còn giữ nó — "mang vào là mất"', vao.conLai === null,
    JSON.stringify(vao.conLai));

  // Hai cái ví không dính vào nhau: két của Ca Trực Đêm phải không bị đụng tới ở đây.
  const ket = await p.evaluate(() => localStorage.getItem(REPO.KHO_KEY));
  check('không đụng tới két của Ca Trực Đêm — hai hệ tiền tệ tách hẳn', ket === null,
    ket === null ? 'localStorage["' + '"] chưa từng được ghi' : String(ket).slice(0, 60));
  check('cửa hàng đồ nghề: không lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  // `--allow-file-access-from-files`: không có nó thì mọi ảnh `file://` vẽ lên canvas đều làm
  // canvas "vấy bẩn" và `getImageData` ném SecurityError — tức bộ đo ánh sáng ở trên không chạy
  // được một dòng nào. Ghi ở art/README.md, và đây là chỗ thứ hai cùng cái bẫy ấy cắn.
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    await cuaHangSuite(b);
    await nemSuite(b);
    await cuaVaCoSuite(b);
    await anhSangDoSuite(b);
    await xeSuite(b);
    await matSuite(b);
    await khoSquadSuite(b);
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
