/* data-trangbi.js — 30 trang bị của Teamfight Manager 2, đọc thẳng từ window.TFM.do.

   Sáu DÒNG × năm BẬC (tier 0..4), mỗi bậc ghép lên bậc kế (`next_tier`) và trả đúng `price`
   của bậc mới (500 / 500 / 800 / 1400 / 2000 — bảng Item Info của TFM2 ghi "Builds From /
   Builds Into" y như thế, RESEARCH §12). Tên đồ là chữ tiếng Việt chính thức (`text/item.i18n`).

   ▲ LUẬT QUAN TRỌNG: KHÔNG ai chọn đồ hộ tuyển thủ. Huấn luyện viên không có nút nào ở đây.
     Mỗi người TỰ nghĩ trong trận (G.nghiDo): mình là ai, đội địch đánh bằng gì, mình đang thắng
     hay bị dí, rồi mua.

   Chỉ số món giữ tên TFM2 rồi đổi sang bộ khoá của sim ở `G.chuanChiSo` — cùng một bảng đổi tên
   dùng cho buff của chiêu và của quái lớn, nên "attack_speed_mult" ở đâu cũng nghĩa là một thứ.
*/
(function (G) {
  'use strict';

  var TFM = G.TFM;

  /* ══════════ BỘ KHOÁ CHỈ SỐ CỦA SIM ══════════
     cộng thẳng : atk ap hp giap khang hpRegen tam(đơn vị TFM2)
     phần trăm  : atkM apM hpM giapM khangM tocdanh tocchay hoiChieu hoiCuoi vamp crit
                  xuyenGiap xuyenKhang giamDanh giamChieu giamNhan tangNhan kienCuong giamHoi phanDon tangDot
     cờ         : mienKc batTu */
  var DOI_TEN = {
    attack: 'atk', magic_power: 'ap', hp: 'hp', defence: 'giap', magic_resistance: 'khang', hp_regen: 'hpRegen',
    range: 'tam',
    attack_mult: 'atkM', magic_power_mult: 'apM', hp_mult: 'hpM', defence_mult: 'giapM', magic_resistance_mult: 'khangM',
    attack_speed_mult: 'tocdanh', move_speed_mult: 'tocchay', skill_cooldown_mult: 'hoiChieu', ult_cooldown_mult: 'hoiCuoi',
    vamp: 'vamp', crit_chance: 'crit', defence_penetration: 'xuyenGiap', magic_resistance_penetration: 'xuyenKhang',
    base_attack_damaged_reduce: 'giamDanh', skill_damaged_reduce: 'giamChieu', damaged_reduce: 'giamNhan',
    damaged_amplify: 'tangNhan', toughness: 'kienCuong', heal_reduce: 'giamHoi', damage_reflect: 'phanDon',
    dot_amplify: 'tangDot', cc_immune: 'mienKc', undying: 'batTu'
  };
  G.CHI_SO_TFM = DOI_TEN;
  /** {tên TFM2: số} → {khoá sim: số}; khoá lạ bỏ qua; số 0 bỏ */
  G.chuanChiSo = function (o) {
    var r = {};
    for (var k in o) {
      var t = DOI_TEN[k];
      if (!t) continue;
      var v = o[k];
      if (v === 0 || v === false || v == null) continue;
      r[t] = v;
    }
    return r;
  };

  /* ══════════ SÁU DÒNG ══════════ */
  G.NHANH_TEN = { ad: 'Công Kích', as: 'Tốc Đánh', def: 'Giáp', mr: 'Kháng Phép', ap: 'Phép Thuật', hp: 'Máu' };
  G.NHANH_MAU = { ad: '#f0a86f', as: '#6fc4f0', def: '#c8d3e0', mr: '#b08af0', ap: '#5fe0b0', hp: '#ff8fb0' };
  /* dấu vẽ trên ô đồ ở thẻ tuyển thủ trong trận khi thiếu icon */
  G.NHANH_DAU = { ad: '⚔', as: '➳', def: '⛨', mr: '✦', ap: '◈', hp: '♥' };
  var DONG_CUA_GOC = { iron_blade: 'ad', dagger: 'as', steel_armor: 'def', mystic_cloak: 'mr', arcane_crystal: 'ap', vital_orb: 'hp' };

  G.TRANGBI = [];
  G.TB_THEO_ID = {};
  /* đi từ sáu món bậc 0 theo next_tier, để mỗi món biết mình thuộc dòng nào */
  Object.keys(DONG_CUA_GOC).forEach(function (goc) {
    var id = goc, tang = 0;
    while (id) {
      var d = TFM.do[id];
      if (!d) throw new Error('thiếu đồ TFM2 ' + id);
      var m = {
        id: id, ten: d.ten, nhanh: DONG_CUA_GOC[goc], tang: d.tier, gia: d.price,
        cs: G.chuanChiSo(d.stat), tfm: d,
        ke: (d.next_tier && d.next_tier[0]) || null,
        mo: G.moTaDo ? '' : ''
      };
      G.TRANGBI.push(m);
      G.TB_THEO_ID[id] = m;
      id = m.ke; tang++;
    }
  });
  if (G.TRANGBI.length !== 30) throw new Error('đếm được ' + G.TRANGBI.length + ' món, phải là 30');

  /* mô tả: dòng chỉ số theo chữ TFM2 (`text/item.i18n` spec) + hiệu ứng riêng đã điền số */
  var SPEC = TFM.chu.do_spec;
  function catThe(s) { return String(s || '').replace(/<[^>]*>/g, ''); }
  G.TRANGBI.forEach(function (m) {
    var ds = [];
    for (var k in m.tfm.stat) {
      if (k === 'duration') continue;
      var mau = SPEC[k];
      ds.push(mau ? catThe(mau).replace('{Value}', m.tfm.stat[k]) : k + ' ' + m.tfm.stat[k]);
    }
    var hu = m.tfm.hieu_ung ? catThe(m.tfm.hieu_ung)
      .replace('{Flat}', m.tfm.flat_damage != null ? m.tfm.flat_damage : (m.tfm.flat_regen != null ? m.tfm.flat_regen : '?'))
      .replace('{Ratio}', m.tfm.defence_ratio != null ? m.tfm.defence_ratio : (m.tfm.max_hp_regen_ratio != null ? m.tfm.max_hp_regen_ratio : '?'))
      .replace('{RegenFlat}', m.tfm.flat_regen != null ? m.tfm.flat_regen : '?')
      .replace('{DmgFlat}', m.tfm.flat_aoe_damage != null ? m.tfm.flat_aoe_damage : '?')
      .replace('{DmgRatio}', m.tfm.max_hp_aoe_ratio != null ? m.tfm.max_hp_aoe_ratio : '?')
      .replace('{Range}', m.tfm.aoe_range != null ? Math.round(m.tfm.aoe_range / 1000) : '?') : '';
    m.mo = ds.join(' · ') + (hu ? '. ' + hu : '');
  });

  /** món kế tiếp trong cùng dòng (null nếu đã bậc cuối) */
  G.monKe = function (nhanh, tang) {
    return G.TRANGBI.filter(function (m) { return m.nhanh === nhanh && m.tang === tang + 1; })[0] || null;
  };
  /** món đầu dòng */
  G.monDau = function (nhanh) {
    return G.TRANGBI.filter(function (m) { return m.nhanh === nhanh && m.tang === 0; })[0] || null;
  };
  G.SO_O_DO = 6;                         /* mỗi dòng một ô — sáu dòng, sáu ô */

  /* ══════════════════════════════════════════════════════════════════════════
     BỘ ÓC MUA ĐỒ — tuyển thủ tự nghĩ, không ai chọn hộ.

     Đầu vào (ct = "cảnh trận"):
       vai      'tren' | 'rung' | 'giua' | 'duoi' | 'ho'
       lopTuong 'can'|'xa'|'phep'|'ho'|'sat'
       the      mảng tag TFM2 của tướng (AD, AP, Tank, Heal…)
       apVL     0..1  — tỉ lệ sát thương VẬT LÝ mà đội địch đang dồn vào mình
       apPT     0..1  — tỉ lệ sát thương PHÉP
       thua     -1..1 — âm là đang bị dí (chênh vàng/mạng), dương là đang dẫn
       chat     mảng nét chất chơi ('thu','fight','le',…)
       nao      0..1200 — NÃO của huấn luyện viên, quyết định mua CHUẨN tới đâu
       daCo     mảng id món đã mua
       rng      hàm ngẫu nhiên

     Trả về: id món nên mua tiếp (bậc kế của dòng đã mở, hoặc bậc 0 của dòng mới).

     Nguyên tắc (rút từ cách chơi MOBA thật, và từ lời khuyên trong hướng dẫn TFM2 —
     "ba món thủ trên Ogre khiến nó gần như bất tử"):
       1. Dòng chính theo lớp tướng và tag — AD thì Công Kích / Tốc Đánh, AP thì Phép Thuật,
          Tank thì Giáp / Máu.
       2. Đội địch dồn một loại sát thương rõ rệt thì chen một dòng kháng đúng loại.
       3. Đang bị dí thì thủ sớm hơn; đang dẫn thì dồn sát thương để kết trận.
       4. NÃO thấp → có xác suất mua "theo thói quen" (dòng chính) dù đang bị đánh chết.
     ════════════════════════════════════════════════════════════════════════ */
  var THEO_LOP = { xa: ['as', 'ad'], sat: ['ad', 'as'], phep: ['ap', 'hp'], ho: ['hp', 'ap'], can: ['ad', 'def'] };
  var THEO_VAI = { duoi: ['ad', 'as'], rung: ['ad', 'as'], tren: ['def', 'hp'], giua: ['ap', 'ad'], ho: ['hp', 'mr'] };

  G.nghiDo = function (ct) {
    var rng = ct.rng || Math.random;
    var daCo = ct.daCo || [];
    var the = ct.the || [];

    var tangCao = { ad: -1, as: -1, def: -1, mr: -1, ap: -1, hp: -1 };
    daCo.forEach(function (id) {
      var m = G.TB_THEO_ID[id]; if (!m) return;
      if (m.tang > tangCao[m.nhanh]) tangCao[m.nhanh] = m.tang;
    });

    /* 1. dòng chính */
    var uu = {};
    (THEO_LOP[ct.lopTuong] || []).concat(THEO_VAI[ct.vai] || []).forEach(function (n, i) {
      uu[n] = (uu[n] || 0) + (3 - i * 0.6);
    });
    if (the.indexOf('AP') >= 0) uu.ap = (uu.ap || 0) + 2.5;
    if (the.indexOf('AD') >= 0) uu.ad = (uu.ad || 0) + 2;
    if (the.indexOf('Tank') >= 0) { uu.def = (uu.def || 0) + 1.5; uu.hp = (uu.hp || 0) + 1.5; }
    if (the.indexOf('Heal') >= 0 || the.indexOf('Shield') >= 0) uu.ap = (uu.ap || 0) + 1;

    /* 2. đọc đội địch — chen dòng kháng đúng loại */
    var quyet = G.kep((ct.nao || 600) / 1200, 0, 1);
    var lechVL = (ct.apVL || 0.5) - 0.5;
    uu.def = (uu.def || 0) + Math.max(0, lechVL) * 6 * (0.45 + 0.55 * quyet);
    uu.mr = (uu.mr || 0) + Math.max(0, -lechVL) * 6 * (0.45 + 0.55 * quyet);

    /* 3. thế trận */
    var thua = ct.thua || 0;
    if (thua < -0.15) { uu.def = (uu.def || 0) + 1.6; uu.mr = (uu.mr || 0) + 1.6; uu.hp = (uu.hp || 0) + 1; }
    if (thua > 0.20) { uu.ad = (uu.ad || 0) + 1.2; uu.ap = (uu.ap || 0) + 1.2; uu.as = (uu.as || 0) + 0.8; }

    /* 4. chất chơi */
    (ct.chat || []).forEach(function (c) {
      if (c === 'thu') { uu.def = (uu.def || 0) + 1.0; uu.mr = (uu.mr || 0) + 1.0; }
      if (c === 'fight' || c === 'lao') { uu.ad = (uu.ad || 0) + 0.8; uu.ap = (uu.ap || 0) + 0.5; }
      if (c === 'le' || c === 'farm') { uu.as = (uu.as || 0) + 0.6; uu.ad = (uu.ad || 0) + 0.4; }
      if (c === 'poke') { uu.ap = (uu.ap || 0) + 0.6; }
      if (c === 'solo') { uu.ad = (uu.ad || 0) + 0.7; }
    });

    /* pháp sư không mua Công Kích, xạ thủ không mua Phép — trừ khi hết đường */
    if (the.indexOf('AD') < 0) { uu.ad = (uu.ad || 0) * 0.15; uu.as = (uu.as || 0) * 0.3; }
    if (the.indexOf('AP') < 0) uu.ap = (uu.ap || 0) * 0.15;

    /* Không mở CẢ HAI dòng thủ khi không bị đánh chết: mỗi dòng một ô, mở là mất chỗ của
       dòng sát thương. */
    if (tangCao.def >= 0 && tangCao.mr >= 0) { uu.def *= 0.4; uu.mr *= 0.4; }

    /* ĐI HẾT DÒNG ĐÃ MỞ: không có dòng này thì ai cũng rải mỗi dòng một món bậc 0 và bậc 4
       không bao giờ xuất hiện (đo ở bản trước, RESEARCH §6.2). */
    for (var nh in tangCao) if (tangCao[nh] >= 0) uu[nh] = (uu[nh] || 0) + 0.45 * (tangCao[nh] + 1);

    /* 5. NÃO thấp thì thỉnh thoảng mua theo thói quen */
    if (rng() > 0.35 + 0.6 * quyet) {
      var thoiQuen = (THEO_LOP[ct.lopTuong] || ['ad'])[0];
      uu = {}; uu[thoiQuen] = 1;
    }

    var ds = Object.keys(uu).filter(function (n) { return G.NHANH_TEN[n] && tangCao[n] < 4; });
    if (!ds.length) return null;
    ds.sort(function (a, b) { return (uu[b] || 0) - (uu[a] || 0); });
    var chon = ds[0];
    if (ds.length > 1 && rng() < 0.22) chon = ds[1];
    var mon = tangCao[chon] < 0 ? G.monDau(chon) : G.monKe(chon, tangCao[chon]);
    return mon ? mon.id : null;
  };

  /** gộp chỉ số của cả túi đồ (khoá sim) + danh sách hiệu ứng riêng */
  G.congDo = function (dsId) {
    var r = {}, dac = [];
    (dsId || []).forEach(function (id) {
      var m = G.TB_THEO_ID[id]; if (!m) return;
      for (var k in m.cs) r[k] = (r[k] || 0) + m.cs[k];
      if (m.tfm.flat_damage != null || m.tfm.flat_regen != null) dac.push(m);
    });
    r.dac = dac;
    return r;
  };

})(window);
