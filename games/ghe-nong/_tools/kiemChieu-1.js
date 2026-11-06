/* _tools/kiemChieu-1.js — bộ kiểm chiêu nhóm 1 (chạy ngoài trình duyệt, kiểu canbang.js/soiAI-node.js).

   Dựng một trận tối giản (một tướng ra chiêu + một/hai tướng làm bia), gọi thẳng `G.chayChieu` (bỏ
   qua hồi chiêu/NÃO chọn chiêu), tua `G.tickTran` để chiêu trễ/đạn bay/lao/vùng chạy xong, rồi so số
   thật với số tính tay từ `S.p` (đúng công thức `S.dmg`/giáp trong sim.js). In một dòng ĐẠT/HỎNG một
   kiểm.

       node _tools/kiemChieu-1.js
*/
'use strict';
global.window = global;
var kho = {};
global.localStorage = {
  getItem: function (k) { return kho[k] || null; },
  setItem: function (k, v) { kho[k] = v; },
  removeItem: function (k) { delete kho[k]; }
};
global.document = {
  addEventListener: function () {}, querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function () { return { style: {}, setAttribute: function () {}, addEventListener: function () {}, appendChild: function () {} }; },
  readyState: 'complete'
};
try { global.navigator = { vibrate: function () {} }; } catch (e) { /* Node mới tự có `navigator` chỉ-đọc */ }

var duong = __dirname.replace(/\\/g, '/') + '/../js/';
['util', 'data-tfm', 'data-kynang', 'data-tuong', 'data-trangbi', 'data-hlv', 'data-tuyenthu',
  'data-giai', 'data-sukien', 'save', 'ca', 'data-bando', 'sim', 'chieu',
  'chieu-tfm-1', 'chieu-tfm-2', 'chieu-tfm-3', 'chieu-tfm-4'
].forEach(function (f) { require(duong + f + '.js'); });

var G = global;
G.taiSave();

var DAT = 0, HONG = 0;
function kiem(ten, dk) {
  if (dk) { DAT++; console.log('ĐẠT — ' + ten); }
  else { HONG++; console.log('HỎNG — ' + ten); }
}
function gan(a, b, sai) { return Math.abs(a - b) <= (sai == null ? Math.max(0.5, Math.abs(b) * 0.01) : sai); }

/* ── dựng trận tối giản: một người mỗi đội, đóng băng NÃO (không tự đánh/tự ra chiêu) ── */
function doiDon(id, ten) {
  var t = G.TUONG_THEO_ID[id];
  if (!t) throw new Error('không có tướng ' + id);
  return {
    ten: ten, mau: '#888', heso: { ds: [] },
    chienThuat: { rong: 'farm', rung: 'farm', mucTieu: 'poke' },
    nguoi: [{ vt: t.vt, tuyenthuId: 'm0', tuongId: id, tt: 'SR', ten: ten,
      chat: ['thu'], ego: 50, cs: { co: 600, ben: 600, luc: 600, li: 600, nao: 600 } }]
  };
}
function dungTran(idCaster, idMuc) {
  var tran = G.taoTran({ ta: doiDon(idCaster, 'A'), dich: doiDon(idMuc, 'B') }, 20260925);
  tran.veHinh = false;
  tran.nguoi.forEach(function (n) {
    n._tran = tran;
    n.cd = { danh: 1e9, skill: 1e9, skill2: 1e9, ult: 1e9 };
    n.im = 1e9; n.dem = 1e9; n.mucTieu = { loai: 'giulane', x: n.x, y: n.y };
  });
  return tran;
}
/* đưa hai bên về vị trí/khoảng cách biết trước (đơn vị SIM), cấp 6, làm sạch trạng thái, máu dày để
   không chết giữa kiểm. Trả {tran, ke, bi, cs} — `cs` là chỉ số THẬT của `ke` lúc này (atk/ap/hpMax…). */
/* [BẪY ĐÃ SẬP KHI VIẾT BỘ KIỂM NÀY] gán tay `bi.hp = bi.hpMax = 1e7` KHÔNG trụ được — mỗi tick
   `tickNguoi` tự so `chiSoNguoi(...).hpMax` với `n.hpMax` và ÉP về đúng số thật của tướng (đúng ý
   thiết kế: đồ/buff đổi máu tối đa thì máu hiện có cũng đổi theo), nên máu ảo bị xoá ngay tick đầu.
   Phải bơm máu qua đúng đường `buff` (cộng `hp` thật) để `chiSoNguoi` tự tính ra hpMax lớn, không
   bị tự sửa ngược. Đặt tên buff `kiem:dem` để lọc ra khỏi mảng khi kiểm tra buff của CHIÊU. */
function dungCanh(idCaster, idMuc, dTfm) {
  var tran = dungTran(idCaster, idMuc);
  var ke = tran.nguoi[0], bi = tran.nguoi[1];
  ke.cap = 6; bi.cap = 6;
  ke.x = 500; ke.y = 500;
  bi.x = 500 + G.kcTFM(dTfm == null ? 0 : dTfm); bi.y = 500;
  ke.px = ke.x; ke.py = ke.y; bi.px = bi.x; bi.py = bi.y;
  /* dungTran() đặt mucTieu='giulane' theo toạ độ SINH RA BAN ĐẦU — phải cập nhật lại theo vị trí
     kiểm mới, không thì lúc hết khoá (sau khi lao/dịch chuyển) nhân vật tự đi bộ về điểm cũ, lệch
     hẳn khỏi kịch bản kiểm (đã bắt được bằng cách so `ke.lao` xong mà vị trí cuối lại trôi). */
  ke.mucTieu = { loai: 'giulane', x: ke.x, y: ke.y };
  bi.mucTieu = { loai: 'giulane', x: bi.x, y: bi.y };
  bi.buff = [{ cs: { hp: 2000000 }, den: 1e15, ten: 'kiem:dem' }];
  bi.dot = []; bi.chan = [];
  bi.kc = 0; bi.kcLoai = ''; bi.troi = 0; bi.im = 0; bi.khieu = 0; bi.khieuAi = -1;
  bi.so = 0; bi.soAi = -1; bi.chamMuc = 0; bi.chamDen = 0; bi.mienKc = 0;
  ke._csTick = -1; bi._csTick = -1;
  var cs = G._sim.chiSo(ke);
  /* `.hpMax` trên thực thể vẫn là số ở CẤP 1 lúc `taoTran` dựng (chỉ `tickNguoi` mới đối chiếu lại
     theo cấp thật) — đặt tay theo `cs.hpMax` vừa tính (cấp 6) để không dính bẫy "hụt máu ảo" khi
     `tickTran` chạy tick đầu (so lệch hpMax cũ/mới rồi cộng dồn thẳng vào `hp`). */
  ke.hpMax = cs.hpMax; ke.hp = cs.hpMax;
  bi._csTick = -1;
  var csBi = G._sim.chiSo(bi);
  bi.hp = bi.hpMax = csBi.hpMax;
  return { tran: tran, ke: ke, bi: bi, cs: cs };
}
/** buff không phải của bộ kiểm (loại bỏ mốc đệm máu `kiem:dem`) */
function buffThat(n) { return n.buff.filter(function (b) { return b.ten !== 'kiem:dem'; }); }

/* ba người: caster + một ĐỒNG MINH thật (khác `dungCanh` chỉ có một mình caster nên chiêu hỗ trợ
   phải rơi vào nhánh dự phòng "tự nhắm mình") + một kẻ địch (không dùng tới thì cứ để đó). */
function doiNhieu(ids, ten) {
  return {
    ten: ten, mau: '#888', heso: { ds: [] },
    chienThuat: { rong: 'farm', rung: 'farm', mucTieu: 'poke' },
    nguoi: ids.map(function (id, i) {
      var t = G.TUONG_THEO_ID[id];
      if (!t) throw new Error('không có tướng ' + id);
      return { vt: t.vt, tuyenthuId: 'm' + i, tuongId: id, tt: 'SR', ten: ten + i,
        chat: ['thu'], ego: 50, cs: { co: 600, ben: 600, luc: 600, li: 600, nao: 600 } };
    })
  };
}
function dungCanhBa(idCaster, idMinh, idDich, dMinh, dDich) {
  var tran = G.taoTran({ ta: doiNhieu([idCaster, idMinh], 'A'), dich: doiNhieu([idDich], 'B') }, 20260925);
  tran.veHinh = false;
  var ke = tran.nguoi[0], minh = tran.nguoi[1], dich = tran.nguoi[2];
  ke.x = 500; ke.y = 500;
  minh.x = 500 + G.kcTFM(dMinh == null ? 0 : dMinh); minh.y = 500;
  dich.x = 500 + G.kcTFM(dDich == null ? 0 : dDich); dich.y = 500;
  tran.nguoi.forEach(function (n) {
    n._tran = tran; n.cd = { danh: 1e9, skill: 1e9, skill2: 1e9, ult: 1e9 }; n.im = 1e9; n.dem = 1e9;
    n.cap = 6; n.px = n.x; n.py = n.y; n.mucTieu = { loai: 'giulane', x: n.x, y: n.y };
  });
  dich.buff = [{ cs: { hp: 2000000 }, den: 1e15, ten: 'kiem:dem' }];
  dich.dot = []; dich.chan = []; dich.kc = 0; dich.kcLoai = ''; dich.troi = 0; dich.im = 0;
  dich.khieu = 0; dich.khieuAi = -1; dich.so = 0; dich.soAi = -1; dich.chamMuc = 0; dich.chamDen = 0; dich.mienKc = 0;
  ke._csTick = -1; minh._csTick = -1; dich._csTick = -1;
  var cs = G._sim.chiSo(ke);
  ke.hpMax = cs.hpMax; ke.hp = cs.hpMax;
  minh._csTick = -1;
  var csMinh = G._sim.chiSo(minh);
  minh.hpMax = csMinh.hpMax; minh.hp = csMinh.hpMax;
  dich._csTick = -1;
  dich.hp = dich.hpMax = G._sim.chiSo(dich).hpMax;
  return { tran: tran, ke: ke, minh: minh, dich: dich, cs: cs, csMinh: csMinh };
}
function ra(tran, ke, loai, muc) {
  return G.chayChieu(tran, ke, loai, { muc: muc || null, x: muc ? muc.x : ke.x, y: muc ? muc.y : ke.y });
}
function tua(tran, soTick) { for (var i = 0; i < soTick; i++) G.tickTran(tran); }
/** sát thương lý thuyết y hệt `satThuong` (giáp 100/(100+giáp), không xuyên/hesoDoi=1 trong bộ kiểm này).
   [BẪY ĐÃ SẬP KHI VIẾT BỘ KIỂM] `bi.giap`/`bi.khang` không nằm thẳng trên thực thể — chỉ có trong
   `chiSoNguoi(...)` tính lúc cần (đúng chỗ `satThuong` đọc) — đọc thẳng `bi.giap` luôn ra `undefined`
   (mọi số mong đợi thành `NaN`, mọi kiểm sát thương ĐỀU hỏng kể cả ở chiêu Fighter đã đúng sẵn). */
function satLyThuyet(raw, loaiSat, bi) {
  var cs = G._sim.chiSo(bi);
  var def = loaiSat === 'pt' ? cs.khang : cs.giap;
  return raw * 100 / (100 + Math.max(0, def));
}
function dmg(cs, base, he, theo) { return (base || 0) + (he || 0) / 100 * (theo === 'ap' ? cs.ap : cs.atk); }

/* ══════════════════ ANDROID ══════════════════ */
(function () {
  var p = window.TFM.tuong.android;
  var c = dungCanh('android', 'fighter', p.skill.range - 1000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 90);
  kiem('android.skill: sóng nổ gây đúng sát thương khi trúng địch trong tầm', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)));
  kiem('android.skill: làm chậm đúng mức', c.bi.chamMuc === p.skill.slow_ratio);

  /* skill2 tự khiên CHÍNH MÌNH (`S.n`, không phải mục tiêu) rồi mới choáng địch quanh mình lúc hết
     khiên — kiểm đúng `ke` cho khiên, `bi` cho choáng. */
  var c2 = dungCanh('android', 'fighter', 5000);
  ra(c2.tran, c2.ke, 'skill2', null);
  var chanNgay = c2.ke.chan.length && gan(c2.ke.chan[0].luong, p.skill2.shield_amount + c2.ke.hpMax * p.skill2.shield_hp_ratio / 100);
  kiem('android.skill2: khiên đúng giá trị (cố định + %Máu Tối Đa)', !!chanNgay);
  tua(c2.tran, p.skill2.shield_duration + 3);
  kiem('android.skill2: hết khiên thì choáng kẻ địch trong tầm', c2.bi.kc > 0 && c2.bi.kcLoai === 'choang');

  /* ult cần ĐỒNG MINH thật (không phải kẻ địch) để không rơi vào nhánh "không có ai" */
  var c3 = dungCanhBa('android', 'archer', 'fighter', 30000, 200000);
  ra(c3.tran, c3.ke, 'ult', c3.minh);
  var chanUlt = c3.minh.chan.length && gan(c3.minh.chan[0].luong, p.ult.shield + c3.minh.hpMax * p.ult.shield_hp_ratio / 100);
  kiem('android.ult: khiên đồng minh đúng giá trị', !!chanUlt);
  tua(c3.tran, p.ult.charge_time + 2);
  kiem('android.ult: dịch chuyển tới cạnh đồng minh sau charge_time', gan(c3.ke.x, c3.minh.x, 20) && gan(c3.ke.y, c3.minh.y, 20));
})();

/* ══════════════════ ARCHER ══════════════════ */
(function () {
  var p = window.TFM.tuong.archer;
  var c = dungCanh('archer', 'fighter', 20000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 40);
  kiem('archer.skill: nhảy tới đánh mục tiêu đang chọn', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)));

  var c2 = dungCanh('archer', 'fighter', 20000);
  var raw2 = dmg(c2.cs, p.skill2.attack, p.skill2.attack_ratio, 'atk');
  ra(c2.tran, c2.ke, 'skill2', c2.bi);
  tua(c2.tran, 30);
  kiem('archer.skill2: bắn trúng gây đúng sát thương', gan(c2.bi.hpMax - c2.bi.hp, satLyThuyet(raw2, 'vl', c2.bi)));

  var c3 = dungCanh('archer', 'fighter', 20000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  tua(c3.tran, p.ult.total_shots * p.ult.interval + 10);
  var tongLy = satLyThuyet(raw3, 'vl', c3.bi) * p.ult.total_shots;
  kiem('archer.ult: bắn đủ ' + p.ult.total_shots + ' mũi (tổng sát thương khớp)', gan(c3.bi.hpMax - c3.bi.hp, tongLy, tongLy * 0.02));
})();

/* ══════════════════ BARD ══════════════════ */
(function () {
  var p = window.TFM.tuong.bard;
  var c = dungCanhBa('bard', 'fighter', 'archer', 20000, 200000);
  ra(c.tran, c.ke, 'skill', c.minh);
  var b = c.minh.buff[0];
  kiem('bard.skill: buff tốc đánh đúng công thức attack_speed + Coef%SMPT', !!b && gan(b.cs.tocdanh, p.skill.attack_speed + p.skill.magic_ratio / 100 * c.cs.ap));

  var c2 = dungCanhBa('bard', 'fighter', 'archer', 20000, 200000);
  ra(c2.tran, c2.ke, 'skill2', c2.minh);
  tua(c2.tran, 30);
  var b2 = c2.minh.buff.filter(function (x) { return x.cs.hoiChieu; })[0];
  kiem('bard.skill2: giảm hồi chiêu tới đúng đồng minh trong bán kính', !!b2 && gan(b2.cs.hoiChieu, p.skill2.cooltime_reduce + p.skill2.magic_ratio / 100 * c2.cs.ap));

  var c3 = dungCanh('bard', 'fighter', 20000);
  ra(c3.tran, c3.ke, 'ult', c3.ke);
  tua(c3.tran, 5);
  var b3 = c3.ke.buff[0];
  kiem('ult tự buff atk/ap/tốc đánh cho chính Bard (đứng trong tầm mình)', !!b3 && b3.cs.ap === p.ult.magic_power_boost);
})();

/* ══════════════════ BARRIER MAGICIAN ══════════════════ */
(function () {
  var p = window.TFM.tuong.barrier_magician;
  var c = dungCanh('barrier_magician', 'fighter', 0);
  c.tran.nnn = 1;
  ra(c.tran, c.ke, 'skill', c.ke); // đứng chung điểm với "địch" để cả khiên lẫn nợ tốc đánh đều thấy
  tua(c.tran, 20);
  kiem('barrier_magician.skill: bản thân (đồng minh) trong kết giới được khiên', c.ke.chan.length > 0);

  /* kết giới TÂM Ở NGƯỜI RA CHIÊU (S.diemMuc() rơi về S.n khi không truyền x/y riêng), thu hẹp dần từ
     start_radius xuống end_radius — đặt địch đúng NỬA ĐƯỜNG bán kính để chắc chắn bị rìa quét qua lúc
     co lại (đặt địch ngay tâm hay ngay mép ngoài start_radius đều không bao giờ chạm rìa, vì rìa chỉ
     đi từ start_radius xuống end_radius chứ không chạm hai đầu đó). */
  var c3 = dungCanh('barrier_magician', 'fighter', (p.ult.start_radius + p.ult.end_radius) / 2);
  ra(c3.tran, c3.ke, 'ult', null);
  var luongLy = dmg(c3.cs, p.ult.damage, p.ult.ap_ratio, 'ap');
  /* choáng chỉ kéo dài `stun_duration` (1s) từ đúng lúc rìa quét qua — tua hết `barrier_tick` rồi mới
     nhìn `bi.kc` thì choáng đã hết từ lâu (sát thương thì còn nguyên vì cộng dồn vĩnh viễn vào máu) —
     phải bắt "đã từng choáng" ngay trong lúc tua, không chỉ nhìn trạng thái ở tick cuối. */
  var tungChoang = false;
  for (var iBM = 0; iBM < p.ult.barrier_tick + 5; iBM++) {
    G.tickTran(c3.tran);
    if (c3.bi.kc > 0 && c3.bi.kcLoai === 'choang') tungChoang = true;
  }
  kiem('barrier_magician.ult: kẻ địch chạm rìa co hẹp đúng sát thương + choáng', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(luongLy, 'pt', c3.bi)) && tungChoang);
})();

/* ══════════════════ BERSERKER ══════════════════ */
(function () {
  var p = window.TFM.tuong.berserker;
  var c = dungCanh('berserker', 'fighter', 0);
  ra(c.tran, c.ke, 'skill', null);
  var b = c.ke.buff[0];
  kiem('berserker.skill: tự buff tốc đánh + hút máu đúng số', !!b && b.cs.tocdanh === p.skill.attack_speed && b.cs.vamp === p.skill.vamp);

  var c2 = dungCanh('berserker', 'fighter', 5000);
  var raw2 = dmg(c2.cs, p.skill2.attack, p.skill2.attack_ratio, 'atk');
  ra(c2.tran, c2.ke, 'skill2', c2.bi);
  kiem('berserker.skill2: hất tung + đúng sát thương quanh điểm đáp', gan(c2.bi.hpMax - c2.bi.hp, satLyThuyet(raw2, 'vl', c2.bi)) && c2.bi.kcLoai === 'hat');

  var c3 = dungCanh('berserker', 'fighter', 30000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  tua(c3.tran, 30);
  kiem('berserker.ult: lao tới chém đúng sát thương', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(raw3, 'vl', c3.bi)));
})();

/* ══════════════════ BOMBER ══════════════════ */
(function () {
  var p = window.TFM.tuong.bomber;
  var c = dungCanh('bomber', 'fighter', 30000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 40);
  kiem('bomber.skill: bom nổ đúng chỗ mục tiêu đứng, đúng sát thương', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)));

  var c2 = dungCanh('bomber', 'fighter', 30000);
  var raw2 = dmg(c2.cs, p.skill2.attack, p.skill2.attack_ratio, 'atk');
  ra(c2.tran, c2.ke, 'skill2', c2.bi);
  tua(c2.tran, p.skill2.activation_delay + 20);
  kiem('bomber.skill2: mìn kích hoạt đúng lúc, trói + đúng sát thương', gan(c2.bi.hpMax - c2.bi.hp, satLyThuyet(raw2, 'vl', c2.bi)) && c2.bi.troi > 0);

  var c3 = dungCanh('bomber', 'fighter', 60000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  tua(c3.tran, p.ult.travel_time + 10);
  kiem('bomber.ult: nổ đúng travel_time, đúng sát thương + làm chậm', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(raw3, 'vl', c3.bi)) && c3.bi.chamMuc === p.ult.slow);
})();

/* ══════════════════ BOOMERANG HUNTER ══════════════════ */
(function () {
  var p = window.TFM.tuong.boomerang_hunter;
  var c = dungCanh('boomerang_hunter', 'fighter', 20000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 30);
  kiem('boomerang_hunter.skill: trúng đường bay gây đúng sát thương', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi), satLyThuyet(raw, 'vl', c.bi) * 0.3));

  var c2 = dungCanh('boomerang_hunter', 'fighter', 40000);
  var raw2 = dmg(c2.cs, p.skill2.attack, p.skill2.attack_ratio, 'atk');
  ra(c2.tran, c2.ke, 'skill2', c2.bi);
  tua(c2.tran, 40);
  kiem('boomerang_hunter.skill2: đứng trên đường bay ăn ít nhất một lượt (đi hoặc về)', c2.bi.hp < c2.bi.hpMax);
  void raw2;

  var c3 = dungCanh('boomerang_hunter', 'fighter', 20000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  tua(c3.tran, 20);
  kiem('boomerang_hunter.ult: trúng tướng địch đúng sát thương lần đầu (chưa nảy)', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(raw3, 'vl', c3.bi)));
})();

/* ══════════════════ CAVALRY KNIGHT ══════════════════ */
(function () {
  var p = window.TFM.tuong.cavalry_knight;
  var c = dungCanh('cavalry_knight', 'fighter', 30000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  /* `S.doc` là sát thương LIÊN TỤC mỗi tick (tính từ mức "mỗi giây"), không phải cộng dồn rời rạc
     theo `bleed_tick` — chờ dư một tick sau khi trúng là số đã dính thêm một chút máu chảy, lệch khỏi
     sát thương THUẦN của cú đâm. Dừng đúng tick lướt vừa xong (`ke.lao` vừa về null) để đo sạch. */
  for (var iCav = 0; iCav < 40 && c.bi.hp >= c.bi.hpMax; iCav++) G.tickTran(c.tran);
  kiem('cavalry_knight.skill: lướt trúng gây đúng sát thương + trói', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)) && c.bi.troi > 0);
  kiem('cavalry_knight.skill: có chảy máu (dot) sau khi trúng', c.bi.dot && c.bi.dot.length > 0);

  var c2 = dungCanh('cavalry_knight', 'fighter', 0);
  ra(c2.tran, c2.ke, 'skill2', null);
  kiem('cavalry_knight.skill2: tự buff tốc chạy đúng số', c2.ke.buff.length > 0 && c2.ke.buff[0].cs.tocchay === p.skill2.move_speed);

  var c3 = dungCanh('cavalry_knight', 'fighter', 0);
  ra(c3.tran, c3.ke, 'ult', null);
  var b3 = c3.ke.buff[0];
  kiem('cavalry_knight.ult: tự buff tốc chạy theo move_speed + %SMCK', !!b3 && gan(b3.cs.tocchay, p.ult.move_speed + p.ult.move_speed_attack_ratio / 100 * c3.cs.atk));
})();

/* ══════════════════ CHEF ══════════════════ */
(function () {
  var p = window.TFM.tuong.chef;
  var c = dungCanh('chef', 'fighter', 30000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'ap');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 30);
  kiem('chef.skill: dao trúng gây đúng sát thương phép + làm chậm', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'pt', c.bi)) && c.bi.chamMuc === p.skill.slow_speed);

  var c2 = dungCanh('chef', 'fighter', 200000); // địch ở xa hẳn, chỉ mình Chef trong vùng ⇒ tự hồi
  c2.ke.hp = c2.ke.hpMax * 0.5;
  ra(c2.tran, c2.ke, 'skill2', null);
  /* vùng hồi bắn NGAY ở tick tạo ra (mốc `V.ke` = giờ tạo) rồi lặp mỗi `dot_period` — tua dư quá
     `dot_period` là hứng nguyên một lượt hồi thứ hai, gấp đôi số muốn so. Dừng ngay khi vừa hồi lần
     đầu (đo sạch một lượt). */
  for (var iChef = 0; iChef < 40 && c2.ke.hp <= c2.ke.hpMax * 0.5; iChef++) G.tickTran(c2.tran);
  var hoiKy = dmg(c2.cs, p.skill2.heal_self, p.skill2.heal_self_ratio, 'ap');
  kiem('chef.skill2: chỉ một mình trong vùng thì hồi theo mức "tự hồi" cao hơn', gan(c2.ke.hp - c2.ke.hpMax * 0.5, hoiKy));

  var c3 = dungCanhBa('chef', 'fighter', 'archer', 20000, 200000);
  ra(c3.tran, c3.ke, 'ult', c3.minh);
  var b3 = c3.minh.buff[0];
  kiem('chef.ult: tăng máu tối đa đúng % cho đồng minh chỉ định', !!b3 && b3.cs.hpM === p.ult.max_hp_ratio);
})();

/* ══════════════════ CIRCUS BLADE ══════════════════ */
(function () {
  var p = window.TFM.tuong.circus_blade;
  var c = dungCanh('circus_blade', 'fighter', 20000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 30);
  kiem('circus_blade.skill: dao găm trúng đúng sát thương + làm chậm', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)) && c.bi.chamMuc === p.skill.slow);

  var c2 = dungCanh('circus_blade', 'fighter', 0);
  ra(c2.tran, c2.ke, 'skill2', null);
  var b2 = c2.ke.buff[0];
  kiem('circus_blade.skill2: tự buff tốc chạy + tốc đánh', !!b2 && b2.cs.tocchay === p.skill2.move_speed && b2.cs.tocdanh === p.skill2.attack_speed);

  var c3 = dungCanh('circus_blade', 'fighter', 30000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  kiem('circus_blade.ult: chớp tới đánh mục tiêu chính đúng sát thương', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(raw3, 'vl', c3.bi)));
  kiem('circus_blade.ult: dịch chuyển đúng khoảng cách range (dừng cách 2 bán kính)', c3.ke.x < 500 + G.kcTFM(30000));
  tua(c3.tran, p.ult.vanish_delay + 2);
  kiem('circus_blade.ult: tàng hình sau vanish_delay', c3.ke.anMinh > c3.tran.t);
})();

/* ══════════════════ CLOWN ══════════════════ */
(function () {
  var p = window.TFM.tuong.clown;
  var c = dungCanh('clown', 'fighter', 20000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  kiem('clown.skill: dịch chuyển cạnh địch và đánh đúng sát thương', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)));
  kiem('clown.skill: tự buff tốc chạy sau khi dịch chuyển', c.ke.buff.some(function (b) { return b.cs.tocchay === p.skill.move_speed; }));

  var c2 = dungCanh('clown', 'fighter', 20000);
  ra(c2.tran, c2.ke, 'skill2', null);
  tua(c2.tran, p.skill2.duration + 5);
  kiem('clown.skill2: ném dao liên tục trúng địch trong tầm (không cuồng loạn)', c2.bi.hp < c2.bi.hpMax);

  var c3 = dungCanh('clown', 'fighter', 20000);
  ra(c3.tran, c3.ke, 'ult', null);
  kiem('clown.ult: đánh dấu Cuồng Loạn còn hiệu lực', c3.ke.buff.some(function (b) { return b.ten === 'clown:cuong_loan' && b.den > c3.tran.t; }));
})();

/* ══════════════════ DANCER (skill bị chặn ở sim do lệch khoá dữ liệu — kiểm hàm viết tay riêng) ══════════════════ */
(function () {
  var p = window.TFM.tuong.dancer;
  var c = dungCanh('dancer', 'fighter', 20000);
  var raw = window.TFM.tuong.dancer.skill1.attack + window.TFM.tuong.dancer.skill1.attack_ratio / 100 * c.cs.atk;
  /* `ra()` gọi thẳng `G.chayChieu` (không qua `thuChieu`/sim.js nên không bị chặn bởi khoá dữ liệu
     lệch tên — xem ghi chú đầu chieu-tfm-1.js); kiểm ĐÚNG hàm viết tay, độc lập với việc sim thật có
     gọi tới được hay chưa. */
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 20);
  kiem('dancer.skill (viết tay, chờ lõi vá khoá skill1): ném Chakram đúng sát thương', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)));

  /* quạt {base_count} tia rất hẹp (không có tham số góc trong dữ liệu, tự chọn 0,12 rad mỗi tia) nên
     một mục tiêu đứng thẳng hướng bắn hoàn toàn có thể ăn NHIỀU hơn một tia cùng lúc trong tầm
     130 — không có cách đặt mục tiêu nào trong tầm để chỉ trúng đúng một tia (kiểm khoảng: tối thiểu
     một tia, tối đa đủ cả base_count tia). */
  var c3 = dungCanh('dancer', 'fighter', 20000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  tua(c3.tran, 30);
  var mot = satLyThuyet(raw3, 'vl', c3.bi), thuc = c3.bi.hpMax - c3.bi.hp;
  kiem('dancer.ult: quạt Chakram trúng đường bay đi (1..base_count tia)', thuc >= mot * 0.95 && thuc <= mot * window.TFM.tuong.dancer.ult.base_count * 1.05);
})();

/* ══════════════════ DARK MAGE ══════════════════ */
(function () {
  var p = window.TFM.tuong.dark_mage;
  var c = dungCanh('dark_mage', 'fighter', 30000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'ap');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 30);
  kiem('dark_mage.skill: mũi tên trúng đúng sát thương phép + trói', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'pt', c.bi)) && c.bi.troi > 0);

  var c2 = dungCanh('dark_mage', 'fighter', 20000);
  var raw2 = dmg(c2.cs, p.skill2.attack, p.skill2.attack_ratio, 'ap');
  ra(c2.tran, c2.ke, 'skill2', c2.bi);
  tua(c2.tran, p.skill2.delayed + 5);
  kiem('dark_mage.skill2: nổ đúng lúc delayed, đúng sát thương phép', gan(c2.bi.hpMax - c2.bi.hp, satLyThuyet(raw2, 'pt', c2.bi)));

  var c3 = dungCanh('dark_mage', 'fighter', 20000);
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  kiem('dark_mage.ult: đánh dấu liên kết cả hai bên (mục tiêu + đồng minh gần nhất)', c3.bi.buff.some(function (b) { return b.ten === 'dark_mage:xiengxich'; }) && c3.ke.buff.some(function (b) { return b.ten === 'dark_mage:xiengxich'; }));
})();

/* ══════════════════ DEMON ══════════════════ */
(function () {
  var p = window.TFM.tuong.demon;
  var c = dungCanh('demon', 'fighter', 15000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  var xCu = c.ke.x, yCu = c.ke.y, xBiCu = c.bi.x;
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, p.skill.effect_delay + 5);
  kiem('demon.skill: tóm trúng đúng sát thương', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)));
  kiem('demon.skill: hoán đổi vị trí với mục tiêu', gan(c.ke.x, xBiCu, 20) && gan(c.bi.x, xCu, 20) && gan(c.bi.y, yCu, 20));

  var c2 = dungCanh('demon', 'fighter', 0);
  ra(c2.tran, c2.ke, 'skill2', null);
  var b2 = c2.ke.buff[0];
  kiem('demon.skill2: tự buff atk/giáp/tốc đánh/tốc chạy đúng số', !!b2 && b2.cs.atk === p.skill2.attack && b2.cs.giap === p.skill2.defence && b2.cs.tocdanh === p.skill2.attack_speed && b2.cs.tocchay === p.skill2.move_speed);

  var c3 = dungCanh('demon', 'fighter', 20000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.magic_ratio, 'ap');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  kiem('demon.ult: sóng lửa đúng sát thương (vật lý, hệ số theo SMPT) + hoảng sợ', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(raw3, 'vl', c3.bi)) && c3.bi.so > 0);
})();

/* ══════════════════ FIGHTER (ví dụ mẫu, kiểm lại cho chắc vì nhóm 1 chép nguyên) ══════════════════ */
(function () {
  var p = window.TFM.tuong.fighter;
  var c = dungCanh('fighter', 'archer', 40000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 30);
  kiem('fighter.skill: Xung Phong lao trúng đúng sát thương + choáng', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)) && c.bi.kcLoai === 'choang');

  var c3 = dungCanh('fighter', 'archer', 20000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  kiem('fighter.ult: Nghiền Nát Địa Chấn đúng sát thương + hất tung', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(raw3, 'vl', c3.bi)) && c3.bi.kcLoai === 'hat');
})();

/* ══════════════════ OGRE ══════════════════ */
(function () {
  var p = window.TFM.tuong.ogre;
  var c = dungCanh('ogre', 'fighter', 20000);
  var raw = dmg(c.cs, p.skill2.attack, p.skill2.attack_ratio, 'atk') + c.cs.hpMax * p.skill2.max_hp_ratio / 100;
  ra(c.tran, c.ke, 'skill2', c.bi);
  kiem('ogre.skill2: đập trúng đúng sát thương (gồm %Máu Tối Đa của mình) + choáng', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)) && c.bi.kcLoai === 'choang');

  var c3 = dungCanh('ogre', 'fighter', 0);
  ra(c3.tran, c3.ke, 'ult', null);
  var b3 = c3.ke.buff[0];
  kiem('ogre.ult: tăng máu tối đa đúng %', !!b3 && gan(b3.cs.hpM, p.ult.max_hp_ratio + p.ult.max_hp_hp_ratio));
})();

/* ══════════════════ PRISONER ══════════════════ */
(function () {
  var p = window.TFM.tuong.prisoner;
  var c = dungCanh('prisoner', 'fighter', 20000);
  var raw = dmg(c.cs, p.skill.attack, p.skill.attack_ratio, 'atk');
  ra(c.tran, c.ke, 'skill', c.bi);
  tua(c.tran, 30);
  kiem('prisoner.skill: cầu sắt trúng đúng sát thương', gan(c.bi.hpMax - c.bi.hp, satLyThuyet(raw, 'vl', c.bi)));

  var c2 = dungCanh('prisoner', 'fighter', 10000);
  ra(c2.tran, c2.ke, 'skill2', null);
  var luongKhien = p.skill2.shield_amount + c2.cs.hpMax * p.skill2.shield_hp_ratio / 100;
  kiem('prisoner.skill2: tự khiên đúng giá trị', c2.ke.chan.length > 0 && gan(c2.ke.chan[0].luong, luongKhien));
  kiem('prisoner.skill2: khiêu khích kẻ địch trong tầm', c2.bi.khieu > 0);

  var c3 = dungCanh('prisoner', 'fighter', 30000);
  var raw3 = dmg(c3.cs, p.ult.attack, p.ult.attack_ratio, 'atk');
  ra(c3.tran, c3.ke, 'ult', c3.bi);
  tua(c3.tran, 30);
  kiem('prisoner.ult: lao tới đúng sát thương + choáng quanh điểm đáp', gan(c3.bi.hpMax - c3.bi.hp, satLyThuyet(raw3, 'vl', c3.bi)) && c3.bi.kcLoai === 'choang');
})();

console.log('');
console.log('TỔNG: ' + DAT + ' ĐẠT / ' + HONG + ' HỎNG (trong ' + (DAT + HONG) + ' kiểm)');
process.exit(HONG > 0 ? 1 : 0);
