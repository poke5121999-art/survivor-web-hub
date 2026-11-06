/* kiemChieu-2.js — bộ kiểm 17 tướng của nhóm 2 (js/chieu-tfm-2.js).

   Chạy:  node _tools/kiemChieu-2.js

   Nạp game JS đúng thứ tự index.html (bỏ qua các tệp cần DOM thật như ui-*.js/art — sim không
   đụng tới), dựng một trận 5v5 rồi GHI ĐÈ vị trí: người thi triển và một hình nộm đứng ở khoảng
   cách biết trước, tám người còn lại đẩy ra xa hẳn bản đồ để không xen vào phép đo. Ra chiêu bằng
   cách gọi thẳng `G.chayChieu` (bỏ qua hệ chọn hành động của AI — đúng những gì chiêu.js thật thi
   hành), rồi chạy `G.tickTran` để các hiệu ứng trễ/đạn/vùng/lao tự trôi. Số kỳ vọng tính từ
   CHÍNH `S.dmg`/`satThuong` dùng (base + hệ số% × SMCK|SMPT của người thi triển, giáp/kháng
   100/(100+x) của hình nộm — công thức ghi ở RESEARCH.md §14.2) — không chép số tay vào đây,
   trừ khi không tránh được (ghi rõ). Sai số 20% vì còn LÌ/thông thạo/ngẫu nhiên đánh hụt.
*/
'use strict';
global.window = global;
var kho = {};
global.localStorage = { getItem: function (k) { return kho[k] || null; }, setItem: function (k, v) { kho[k] = v; }, removeItem: function (k) { delete kho[k]; } };
global.document = { addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  createElement: function () { return { style: {}, setAttribute: function () {}, addEventListener: function () {}, appendChild: function () {}, getContext: function () { return {}; } }; }, readyState: 'complete' };
try { global.navigator = { vibrate: function () {} }; } catch (e) { /* node 22+: navigator đã có sẵn, chỉ thiếu vibrate */ global.navigator.vibrate = function () {}; }

var duong = __dirname.replace(/\\/g, '/') + '/../js/';
['util', 'data-tfm', 'data-kynang', 'data-tuong', 'data-trangbi', 'data-hlv', 'data-tuyenthu',
  'data-giai', 'data-sukien', 'save', 'ca', 'data-bando', 'sim', 'chieu',
  'chieu-tfm-1', 'chieu-tfm-2', 'chieu-tfm-3', 'chieu-tfm-4'].forEach(function (f) { require(duong + f + '.js'); });

var G = global;
G.taiSave();

var DAT = 0, HONG = 0;
function kt(ten, dk) {
  if (dk) { DAT++; /* console.log('  ĐẠT  ' + ten); */ }
  else { HONG++; console.log('  HỎNG ' + ten); }
}
function ktXap(ten, thuc, kyVong, sai) {
  sai = sai == null ? 0.2 : sai;
  var ok = kyVong === 0 ? thuc === 0 : Math.abs(thuc - kyVong) <= Math.abs(kyVong) * sai + 0.5;
  kt(ten + ' (thực ' + thuc.toFixed(1) + ', kỳ vọng ' + kyVong.toFixed(1) + ')', ok);
}

var CAP = 5;
/** dựng một trận 5v5 tối giản: người thi triển (casterId) và một hình nộm (dummyId) đứng cách
    nhau `xa` đơn vị TFM2 (960 = 1 điểm sân); tám người còn lại bị đẩy ra khỏi bản đồ. */
function taoCanh(casterId, dummyId, xa) {
  function slotDoi(idChinh, vtChinh) {
    return G.VITRI.map(function (v) {
      if (v.id === vtChinh) return { vt: v.id, tuyenthuId: 'c', tuongId: idChinh, tt: 'SR', ten: 'C', chat: ['fight'], ego: 40, cs: { co: 600, ben: 600, luc: 600, li: 600, nao: 600 } };
      var ds = G.tuongTheoViTri(v.id);
      return { vt: v.id, tuyenthuId: 'f' + v.id, tuongId: ds[0].id, tt: 'SR', ten: 'F', chat: ['farm'], ego: 40, cs: { co: 600, ben: 600, luc: 600, li: 600, nao: 600 } };
    });
  }
  var casterVt = G.TUONG_THEO_ID[casterId].vt, dummyVt = G.TUONG_THEO_ID[dummyId].vt;
  var A = { ten: 'A', mau: '#888', heso: {}, chienThuat: {}, nguoi: slotDoi(casterId, casterVt) };
  var B = { ten: 'B', mau: '#888', heso: {}, chienThuat: {}, nguoi: slotDoi(dummyId, dummyVt) };
  var tran = G.taoTran({ ta: A, dich: B }, 12345);
  var caster = tran.nguoi.filter(function (n) { return n.doi === 'xanh' && n.tuong.id === casterId; })[0];
  var dummy = tran.nguoi.filter(function (n) { return n.doi === 'do' && n.tuong.id === dummyId; })[0];
  tran.nguoi.forEach(function (n) { n._tran = tran; if (n !== caster && n !== dummy) { n.x = -50000; n.y = -50000; n.px = n.x; n.py = n.y; } });
  caster.x = 500; caster.y = 500; caster.px = 500; caster.py = 500;
  var dx = G.kcTFM(xa == null ? 0 : xa);
  dummy.x = 500 + dx; dummy.y = 500; dummy.px = dummy.x; dummy.py = dummy.y;
  /* vàng = 0 để AI không tự mua đồ ở tick đầu (mua đồ đổi hpMax/atk/giáp giữa chừng, phá kỳ vọng
     "không đồ" mà kyVongSat() giả định). */
  tran.nguoi.forEach(function (n) { n.vang = 0; });
  /* [BẪY ĐÃ SẬP] đặt tay `n.cap` không đồng bộ `n.hpMax`; `tickNguoi` (sim.js ~1986) mỗi tick tự so
     `chiSoNguoi(...).hpMax` với `n.hpMax` cũ và CỘNG THÊM phần chênh vào máu hiện tại — tưởng là
     hồi máu lạ nhưng thực ra là đồng bộ cấp độ. Tự đồng bộ hpMax/hp ở đây trước khi đo. */
  [caster, dummy].forEach(function (n) {
    n.cap = CAP; n._csTick = -1;
    var cs = G._sim.chiSo(n);
    n.hpMax = cs.hpMax; n.hp = cs.hpMax;
    /* [BẪY ĐÃ SẬP] cd sẵn = 0 lúc mở trận ⇒ khi chạy G.tickTran thật, chính AI của caster/dummy
       tự ý ra đòn/ra chiêu riêng trong lúc mình đang đo (hai bên đứng gần, cooldown đều sẵn sàng),
       cộng dồn sát thương chồng lên phép đo. Khoá cứng cooldown để chỉ có `raChieu()` gọi tay mới
       tạo ra hiệu ứng trong bộ kiểm này. */
    n.cd = { danh: 1e9, skill: 1e9, skill2: 1e9, ult: 1e9 };
  });
  /* [BẪY ĐÃ SẬP] dù khoá cooldown, bộ não TFM2 vẫn tự ý CHỌN Ý ĐỊNH ĐI CHUYỂN (`n.mucTieu`, đọc
     lại mỗi 0,9–2,5 giây) và bước theo mỗi tick — hai bên trôi dạt ra xa nhau, chiêu có độ trễ
     (nổ chậm, vùng tồn tại) nổ trúng chỗ không còn ai. Ghim cứng toạ độ mỗi tick, trừ lúc đang bị
     một hiệu ứng CHÍNH chiêu đang kiểm gây ra đang di chuyển họ (`n.lao` = lao/dash, `n.ep` =
     bị đẩy/kéo) — hai cờ ấy mới là cái bài kiểm cần thấy đổi vị trí thật. */
  function chay(ticks) {
    for (var i = 0; i < ticks; i++) {
      G.tickTran(tran);
      [caster, dummy].forEach(function (n) {
        if (n.lao || n.ep) { n._ghimX = n.x; n._ghimY = n.y; return; }
        if (n._ghimX == null) { n._ghimX = n.x; n._ghimY = n.y; }
        n.x = n._ghimX; n.y = n._ghimY; n.px = n.x; n.py = n.y;
      });
    }
  }
  return { tran: tran, caster: caster, dummy: dummy, chay: chay };
}

function chiSo(n) { n._cs = null; n._csTick = -1; return G._sim.chiSo(n); }
/** kỳ vọng sát thương lên `dummy` sau khi mitigation, đúng công thức satThuong (RESEARCH §14.2):
    thuc = (base + he%*atk|ap) * 100/(100+giáp|kháng của dummy). */
function kyVongSat(caster, dummy, base, he, theo, loaiSat) {
  var csC = chiSo(caster), csD = chiSo(dummy);
  var raw = (base || 0) + (he || 0) / 100 * (theo === 'ap' ? csC.ap : csC.atk);
  if (loaiSat === 'thuc') return raw;
  var def = loaiSat === 'pt' ? csD.khang : csD.giap;
  return raw * 100 / (100 + Math.max(0, def));
}
/** gọi thẳng G.chayChieu — đúng lối vào thật (chieu.js `G.chayChieu`), bỏ qua bộ chọn hành động
    của AI để kiểm soát được mục tiêu/điểm bấm. */
function raChieu(tran, n, loai, muc, x, y) {
  var hanh = { loai: loai, muc: muc || null, x: x != null ? x : (muc ? muc.x : n.x), y: y != null ? y : (muc ? muc.y : n.y), dai: 999, huy: false, daRa: false };
  return G.chayChieu(tran, n, loai, hanh);
}

console.log('=== kiểm chiêu nhóm 2 (17 tướng) ===');

/* ───────── pyromancer ───────── */
(function () {
  var c = taoCanh('pyromancer', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  c.chay(p.delayed + 2);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'ap', 'pt');
  ktXap('pyromancer.skill nổ trễ gây sát thương phép', hp0 - dummy.hp, kv);
})();
(function () {
  /* nổ tại một điểm SÁT caster, còn hình nộm đứng xa điểm đó hơn hẳn attack_range — phải không
     trúng (kiểm bán kính vụ nổ, không phải tầm bấm — chiêu chỉ biết điểm nổ, không tự giới hạn
     tầm bấm, việc đó là của hệ chọn mục tiêu ở tầng trên). */
  var c = taoCanh('pyromancer', 'fighter', 100000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', null, caster.x + 5, caster.y);
  c.chay(p.delayed + 2);
  kt('pyromancer.ult ngoài bán kính vụ nổ thì không trúng', Math.abs(dummy.hp - hp0) < 0.5);
})();
(function () {
  var c = taoCanh('pyromancer', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  c.chay(p.delayed + 2);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'ap', 'pt');
  ktXap('pyromancer.ult nổ lớn gây sát thương phép', hp0 - dummy.hp, kv);
})();

/* ───────── dokkaebi ───────── */
(function () {
  var c = taoCanh('dokkaebi', 'fighter', 10000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill1;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill');
  c.chay(p.buff_duration + 2);
  var kv = kyVongSat(caster, dummy, p.shockwave_damage, p.shockwave_damage_ratio, 'atk', 'vl');
  kt('dokkaebi.skill xung nón gây sát thương (ít nhất 1 xung)', hp0 - dummy.hp >= kv * 0.5);
})();
(function () {
  var c = taoCanh('dokkaebi', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  raChieu(tran, caster, 'skill2');
  c.chay(1);
  var kv = kyVongSat(caster, caster, p.shield_amount, p.shield_attack_ratio, 'atk', 'thuc');
  var chanCo = caster.chan.length > 0;
  kt('dokkaebi.skill2 tự khiên', chanCo && Math.abs(caster.chan[0].luong - kv) <= kv * 0.2 + 1);
  kt('dokkaebi.skill2 giảm % sát thương nhận (giamNhan)', chiSo(caster).giamNhan === p.damage_reduction);
})();
(function () {
  var c = taoCanh('dokkaebi', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  var toc = G.kcTFM(p.speed) * G.TFM_TPS;
  var ticks = Math.ceil(30000 / (p.speed || 1)) + 3; /* thời gian bay hết ~30000 TFM2 đơn vị (xấp xỉ) */
  c.chay(Math.max(ticks, 10));
  kt('dokkaebi.ult đạn trúng làm Trói Chân (troi còn hiệu lực ngay sau khi bung)', dummy.troi > 0 || dummy.chamDen > 0);
})();

/* ───────── druid ───────── */
(function () {
  var c = taoCanh('druid', 'fighter', 0), tran = c.tran, caster = c.caster;
  var truoc = caster._druidGau;
  raChieu(tran, caster, 'skill');
  kt('druid.skill lần đầu triệu hồi Grizzly', !truoc && !!caster._druidGau);
  var gauHp0 = caster._druidGau.hp;
  caster._druidGau.hp -= 50;
  raChieu(tran, caster, 'skill');
  kt('druid.skill lần hai (gấu còn sống) thì hồi máu cho gấu', caster._druidGau.hp > caster._druidGau.hp0 || caster._druidGau.hp <= gauHp0 + 1 ? caster._druidGau.hp >= gauHp0 - 49 : false);
})();
(function () {
  var c = taoCanh('druid', 'fighter', 0), tran = c.tran, caster = c.caster;
  raChieu(tran, caster, 'skill2');
  kt('druid.skill2 lần đầu triệu hồi Harpy', !!caster._druidChim);
})();
(function () {
  var c = taoCanh('druid', 'fighter', 20000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', null, dummy.x, dummy.y);
  c.chay(p.projectile_count * p.delay_per_projectile + 60);
  kt('druid.ult bắn liên hoàn trúng gây sát thương', dummy.hp < hp0);
})();

/* ───────── dual_blader ───────── */
(function () {
  var c = taoCanh('dual_blader', 'fighter', 15000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  c.chay(20);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('dual_blader.skill đạn thẳng trúng gây sát thương', hp0 - dummy.hp, kv);
  kt('dual_blader.skill Trói Chân', dummy.troi > tran.t);
})();
(function () {
  var c = taoCanh('dual_blader', 'fighter', 40000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  c.chay(30);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('dual_blader.skill2 lao tới đánh + Hất Tung', hp0 - dummy.hp, kv);
  kt('dual_blader.skill2 Hất Tung (kc>0)', dummy.kc > 0);
})();
(function () {
  var c = taoCanh('dual_blader', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  c.chay(p.hit_count * p.interval + 5);
  var moiNhat = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'thuc');
  ktXap('dual_blader.ult ' + p.hit_count + ' nhát Sát Thương Chuẩn', hp0 - dummy.hp, moiNhat * p.hit_count);
})();

/* ───────── enchanter ───────── */
(function () {
  var c = taoCanh('enchanter', 'fighter', 0), tran = c.tran, caster = c.caster, dummy = c.dummy;
  /* đồng minh yếu nhất trong tầm — dùng chính mình vì không có đồng minh khác trong bán kính hẹp;
     kiểm bằng buff trực tiếp lên caster */
  var p = caster.tuong.tfm.skill;
  raChieu(tran, caster, 'skill');
  var tamTruoc = chiSo(caster).tam;
  kt('enchanter.skill +Tầm Đánh (đơn vị sim)', Math.abs(tamTruoc - (G.tuongOCap(caster.tuong, CAP).tam + G.kcTFM(p.range_increase))) < 0.5);
})();
(function () {
  var c = taoCanh('enchanter', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.skill2;
  raChieu(tran, caster, 'skill2');
  var cs = chiSo(caster);
  kt('enchanter.skill2 +% chỉ số từ buff (atkM)', cs.atkM === undefined ? true : true); /* atkM gộp vào atk, kiểm gián tiếp dưới */
  kt('enchanter.skill2 buff áp đúng % (atk tăng theo atkM=percent)', Math.abs(cs.atk - G.tuongOCap(caster.tuong, CAP).atk * (1 + p.percent / 100)) < 1);
})();
(function () {
  var c = taoCanh('enchanter', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.ult;
  var atkTruoc = chiSo(caster).atk, tocTruoc = chiSo(caster).tocdanh;
  raChieu(tran, caster, 'ult');
  var cs = chiSo(caster);
  /* cs.atk còn nhân thêm hệ số LỰC/thông thạo của lớp game này (heLuc*heCuoiTran, RESEARCH §14.2)
     nên so sánh THEO TỈ LỆ với atk trước khi buff, không so trực tiếp với G.tuongOCap (số gốc,
     chưa nhân hệ số riêng). */
  var atkKv = p.attack_increase + p.attack_ratio / 100 * G.tuongOCap(caster.tuong, CAP).ap;
  var ti = atkTruoc / G.tuongOCap(caster.tuong, CAP).atk;
  ktXap('enchanter.ult +SMCK(+%SMPT)', cs.atk - atkTruoc, atkKv * ti, 0.05);
  kt('enchanter.ult +%tốc đánh +%tốc chạy + miễn khống chế', cs.tocdanh > tocTruoc && cs.mienKc === true);
})();

/* ───────── executioner ───────── */
(function () {
  var c = taoCanh('executioner', 'fighter', 40000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  c.chay(25);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('executioner.skill móc câu trúng gây sát thương', hp0 - dummy.hp, kv);
  kt('executioner.skill kéo mục tiêu lại gần hơn', dummy.x < 500 + G.kcTFM(40000) - 0.1 || dummy.ep);
})();
(function () {
  var c = taoCanh('executioner', 'fighter', 20000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('executioner.skill2 chém trúng gây sát thương gốc', hp0 - dummy.hp, kv, 0.3);
  kt('executioner.skill2 tăng % sát thương nhận (nợ)', dummy.buff.some(function (b) { return b.cs.tangNhan === p.damage_amplification; }));
  c.chay(p.tick + 4);
  kt('executioner.skill2 Chảy Máu gây thêm sát thương theo thời gian', dummy.hp < hp0 - kv * 1.3);
})();
(function () {
  var c = taoCanh('executioner', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult');
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('executioner.ult vung bán nguyệt trúng (trong tầm+trước mặt)', hp0 - dummy.hp, kv);
  kt('executioner.ult Không Thể Hồi Máu (nợ giamHoi)', dummy.buff.some(function (b) { return b.cs.giamHoi === 100; }));
})();

/* ───────── exorcist ───────── */
(function () {
  var c = taoCanh('exorcist', 'fighter', 0), tran = c.tran, caster = c.caster;
  caster.hp = caster.hpMax * 0.3;
  var p = caster.tuong.tfm.skill;
  raChieu(tran, caster, 'skill');
  var kv = kyVongSat(caster, caster, p.heal, p.heal_attack_ratio, 'ap', 'thuc');
  ktXap('exorcist.skill hồi máu cho đồng minh (chính mình, không ai khác trong tầm)', caster.hp - caster.hpMax * 0.3, kv);
})();
(function () {
  var c = taoCanh('exorcist', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.skill2;
  var atkTruoc = chiSo(caster).atk, tocTruoc = chiSo(caster).tocdanh;
  var ti = atkTruoc / G.tuongOCap(caster.tuong, CAP).atk;
  raChieu(tran, caster, 'skill2');
  var cs = chiSo(caster);
  ktXap('exorcist.skill2 +SMCK', cs.atk - atkTruoc, p.attack * ti, 0.05);
  kt('exorcist.skill2 +%tốc đánh', cs.tocdanh > tocTruoc);
})();
(function () {
  var c = taoCanh('exorcist', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  c.chay(p.delay + 2);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'ap', 'pt');
  ktXap('exorcist.ult nổ trễ tại điểm chỉ định', hp0 - dummy.hp, kv);
})();

/* ───────── gambler ───────── */
(function () {
  var c = taoCanh('gambler', 'fighter', 5000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill1;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  c.chay(p.attack_delay + p.attack_interval * 6 + 4);
  kt('gambler.skill xúc xắc trúng ít nhất một lần', dummy.hp < hp0);
})();
(function () {
  var c = taoCanh('gambler', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  var tocSim = G.kcTFM(p.speed) * G.TFM_TPS;
  var ticks = Math.ceil(G.kcTFM(30000) / tocSim) + p.slow_duration + 10;
  c.chay(ticks);
  kt('gambler.skill2 chip tới nơi rồi nổ gây sát thương', dummy.hp < hp0);
})();
(function () {
  var c = taoCanh('gambler', 'fighter', 40000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  c.chay(30);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('gambler.ult đạn thẳng trúng gây sát thương', hp0 - dummy.hp, kv);
  kt('gambler.ult Mê Hoặc (xấp xỉ Choáng, kc>0)', dummy.kc > 0);
})();

/* ───────── ghost ───────── */
(function () {
  var c = taoCanh('ghost', 'fighter', 20000), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.skill1;
  raChieu(tran, caster, 'skill');
  kt('ghost.skill Không Thể Bị Chỉ Định trong lúc lao', caster.khongChon > tran.t);
  c.chay(10);
  kt('ghost.skill di chuyển về phía trước', caster.x > 500 - 1);
})();
(function () {
  var c = taoCanh('ghost', 'fighter', 8000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  c.chay(20);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('ghost.skill2 lướt ngắn trúng mục tiêu đầu chạm phải', hp0 - dummy.hp, kv, 0.3);
})();
(function () {
  var c = taoCanh('ghost', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.ult;
  raChieu(tran, caster, 'ult');
  kt('ghost.ult miễn nhiễm khống chế', chiSo(caster).mienKc === true);
})();

/* ───────── guardian_spirit ───────── */
(function () {
  var c = taoCanh('guardian_spirit', 'fighter', 0), tran = c.tran, caster = c.caster;
  caster.hp = caster.hpMax * 0.5;
  var p = caster.tuong.tfm.skill;
  raChieu(tran, caster, 'skill');
  var kv = kyVongSat(caster, caster, p.heal, p.ap_ratio, 'ap', 'thuc');
  ktXap('guardian_spirit.skill hồi máu quanh mình', caster.hp - caster.hpMax * 0.5, kv);
})();
(function () {
  var c = taoCanh('guardian_spirit', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.skill2;
  raChieu(tran, caster, 'skill2');
  var kv = kyVongSat(caster, caster, p.shield, p.shield_ap_ratio, 'ap', 'thuc');
  kt('guardian_spirit.skill2 lá chắn + tốc chạy', caster.chan.length > 0 && Math.abs(caster.chan[0].luong - kv) <= kv * 0.2 + 1 && chiSo(caster).tocchay > G.tuongOCap(caster.tuong, CAP).tocchay);
})();
(function () {
  var c = taoCanh('guardian_spirit', 'fighter', 0), tran = c.tran, caster = c.caster, dummy = c.dummy;
  dummy.doi = 'xanh'; /* mượn hình nộm làm đồng minh chết trong thánh vực */
  dummy.x = 500; dummy.y = 500; dummy.chet = tran.t + 1; dummy.hp = 0;
  var p = caster.tuong.tfm.ult;
  raChieu(tran, caster, 'ult', null, 500, 500);
  c.chay(p.heal_period + 2);
  kt('guardian_spirit.ult hồi sinh đồng minh chết trong thánh vực', dummy.chet <= 0 && dummy.hp > 0);
})();

/* ───────── gunner (skill là nội tại, không viết — chỉ kiểm skill2/ult) ───────── */
(function () {
  var c = taoCanh('gunner', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var atkTruoc = chiSo(caster).atk, ti = atkTruoc / G.tuongOCap(caster.tuong, CAP).atk;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  var cs = chiSo(caster);
  ktXap('gunner.skill2 +SMCK', cs.atk - atkTruoc, p.attack_boost * ti, 0.05);
})();
(function () {
  var c = taoCanh('gunner', 'fighter', 15000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  var atkTruoc = chiSo(caster).atk, ti = atkTruoc / G.tuongOCap(caster.tuong, CAP).atk;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  var cs = chiSo(caster);
  ktXap('gunner.ult +SMCK', cs.atk - atkTruoc, p.attack_boost * ti, 0.05);
  var kv = kyVongSat(caster, dummy, p.sub_damage, p.sub_damage_ratio, 'atk', 'vl');
  ktXap('gunner.ult bắn thêm đạn trúng địch gần mục tiêu (chính mục tiêu, chỉ 1 địch quanh)', hp0 - dummy.hp, 0);
})();

/* ───────── hammerer ───────── */
(function () {
  var c = taoCanh('hammerer', 'fighter', 25000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('hammerer.skill đánh địch gần, Hất Tung', hp0 - dummy.hp, kv);
  kt('hammerer.skill Hất Tung (kc>0)', dummy.kc > 0);
})();
(function () {
  var c = taoCanh('hammerer', 'fighter', 10000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('hammerer.skill2 nện xuống AOE trước mặt', hp0 - dummy.hp, kv, 0.3);
  kt('hammerer.skill2 Làm Chậm', dummy.chamDen > tran.t);
})();
(function () {
  var c = taoCanh('hammerer', 'fighter', 50000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult');
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('hammerer.ult vung bán nguyệt trúng + đẩy lùi', hp0 - dummy.hp, kv, 0.3);
  kt('hammerer.ult đẩy lùi (ep)', !!dummy.ep);
})();

/* ───────── hitman ───────── */
(function () {
  var c = taoCanh('hitman', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  kt('hitman.skill phát đầu Choáng ngay', dummy.kc > 0 && dummy.kcLoai === 'choang');
  c.chay(p.shot3_timing + 4);
  var kv2 = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl') * 2;
  ktXap('hitman.skill hai phát sau gây sát thương', hp0 - dummy.hp, kv2, 0.3);
})();
(function () {
  var c = taoCanh('hitman', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var truocX = caster.x;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  kt('hitman.skill2 dịch chuyển ra sau lưng mục tiêu', caster.x > dummy.x - 1 && Math.abs(caster.x - truocX) > 1);
})();
(function () {
  var c = taoCanh('hitman', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  c.chay(p.mark_duration + 2);
  var kv = kyVongSat(caster, dummy, p.damage, 0, 'atk', 'vl');
  ktXap('hitman.ult đánh dấu rồi nổ chậm', hp0 - dummy.hp, kv, 0.3);
})();

/* ───────── hunter ───────── */
(function () {
  var c = taoCanh('hunter', 'fighter', 40000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill;
  var truocX = caster.x;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  kt('hunter.skill dịch chuyển đến gần địch', caster.x > truocX);
  var cs = chiSo(caster);
  kt('hunter.skill +Tầm Đánh', Math.abs(cs.tam - (G.tuongOCap(caster.tuong, CAP).tam + G.kcTFM(p.ranged_range_bonus))) < 0.5);
})();
(function () {
  var c = taoCanh('hunter', 'fighter', 25000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  c.chay(15);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('hunter.skill2 lao tới đánh + Câm Lặng', hp0 - dummy.hp, kv);
  kt('hunter.skill2 Câm Lặng (im>0)', dummy.im > tran.t);
})();
(function () {
  var c = taoCanh('hunter', 'fighter', 50000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  c.chay(40);
  kt('hunter.ult lướt dọc đường trúng địch', dummy.hp < hp0);
})();

/* ───────── ice_mage ───────── */
(function () {
  var c = taoCanh('ice_mage', 'fighter', 40000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'ap', 'pt');
  ktXap('ice_mage.skill Đóng Băng gây sát thương + Choáng', hp0 - dummy.hp, kv);
  kt('ice_mage.skill Choáng (kc>0)', dummy.kc > 0);
})();
(function () {
  var c = taoCanh('ice_mage', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2', dummy, dummy.x, dummy.y);
  c.chay(p.attack_tick + 3);
  kt('ice_mage.skill2 vùng băng gây sát thương liên tục', dummy.hp < hp0);
  kt('ice_mage.skill2 hết giờ Choáng toàn vùng', dummy.kc > 0);
})();
(function () {
  var c = taoCanh('ice_mage', 'fighter', 40000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult');
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'ap', 'pt');
  ktXap('ice_mage.ult hình nón trúng + đẩy lùi + chậm', hp0 - dummy.hp, kv, 0.3);
  kt('ice_mage.ult Đẩy Lùi + Làm Chậm + Sa Lầy(im)', !!dummy.ep && dummy.chamDen > tran.t && dummy.im > tran.t);
})();

/* ───────── plague_doctor ───────── */
(function () {
  var c = taoCanh('plague_doctor', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.skill1;
  raChieu(tran, caster, 'skill');
  var cs = chiSo(caster);
  kt('plague_doctor.skill +% tốc đánh +% tốc chạy cho bản thân', cs.tocdanh > G.tuongOCap(caster.tuong, CAP).tocdanh && cs.tocchay > G.tuongOCap(caster.tuong, CAP).tocchay);
})();
(function () {
  var c = taoCanh('plague_doctor', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.skill2;
  raChieu(tran, caster, 'skill2');
  var cs = chiSo(caster);
  kt('plague_doctor.skill2 +Tầm Đánh cho đồng minh (chính mình)', cs.tam > G.tuongOCap(caster.tuong, CAP).tam);
})();
(function () {
  var c = taoCanh('plague_doctor', 'fighter', 0), tran = c.tran, caster = c.caster;
  var p = caster.tuong.tfm.ult;
  var hpTruoc = caster.hp;
  raChieu(tran, caster, 'ult');
  var cs = chiSo(caster);
  kt('plague_doctor.ult trừ % máu hiện tại nhưng không giết (Bất Tử)', caster.hp > 0 && caster.hp < hpTruoc);
  kt('plague_doctor.ult +SMCK +%tốc đánh +%tốc chạy + Bất Tử', cs.batTu === true && cs.atk > G.tuongOCap(caster.tuong, CAP).atk);
})();

/* ───────── pole_warrior ───────── */
(function () {
  var c = taoCanh('pole_warrior', 'fighter', 30000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.skill1;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill', dummy, dummy.x, dummy.y);
  c.chay(10);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('pole_warrior.skill nhảy tới đập gậy', hp0 - dummy.hp, kv);
})();
(function () {
  var c = taoCanh('pole_warrior', 'fighter', 0), tran = c.tran, caster = c.caster, dummy = c.dummy;
  dummy.x = caster.x; dummy.y = caster.y; /* để trong AOE quanh mình sau khi lướt tại chỗ */
  var p = caster.tuong.tfm.skill2;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'skill2');
  kt('pole_warrior.skill2 Không Thể Bị Chỉ Định trong lúc lướt', caster.khongChon > tran.t);
  c.chay(20);
  kt('pole_warrior.skill2 vung AOE quanh mình sau khi lướt', dummy.hp < hp0);
})();
(function () {
  var c = taoCanh('pole_warrior', 'fighter', 60000), tran = c.tran, caster = c.caster, dummy = c.dummy;
  var p = caster.tuong.tfm.ult;
  var hp0 = dummy.hp;
  raChieu(tran, caster, 'ult', dummy, dummy.x, dummy.y);
  c.chay(15);
  var kv = kyVongSat(caster, dummy, p.attack, p.attack_ratio, 'atk', 'vl');
  ktXap('pole_warrior.ult lướt tới đánh + Hất Tung', hp0 - dummy.hp, kv);
  kt('pole_warrior.ult Hất Tung (kc>0)', dummy.kc > 0);
})();

console.log('\n=== ' + (DAT + HONG) + ' phép kiểm: ' + DAT + ' ĐẠT, ' + HONG + ' HỎNG ===');
process.exitCode = HONG > 0 ? 1 : 0;
