/* chieu.js — CHIÊU của tướng TFM2: bộ hàm nguyên thuỷ + ba cách chạy.

   Số của chiêu nằm trong window.TFM (tick, đơn vị 1000 = 1 điểm ảnh). Cách chạy thì:
     1. G.CHIEU_TFM[id].{skill,skill2,ult}(S)  — bản viết tay đúng mô tả (js/chieu-tfm-1..4.js,
        bốn agent bước 4 viết). Trả `false` thì rơi xuống cách 2/3.
     2. cây hiệu ứng khai báo của 8 tướng mod (`a.effect`, 28 kiểu nút) — chạy bằng `chayCay`.
     3. cách CHUNG theo tham số cho 60 tướng gốc — `chayChung` đoán từ tên tham số + mô tả
        tiếng Việt (sát thương vật lý hay phép, vùng hay đơn, choáng/chậm/hất, vùng đốt, lao,
        đạn bay, hồi, khiên, buff). Đủ để con nào cũng "ra chiêu hợp lý ngay", còn đúng từng
        chi tiết là việc của bước 4.

   API cho người viết chiêu: RESEARCH.md §14.3 (mô tả từng hàm của `S`). Tệp này chỉ gọi vào
   sim qua `G._sim` (sim.js gắn vào lúc nạp) — không đọc ruột sim.
*/
(function (G) {
  'use strict';

  var TPS = G.TFM_TPS, kc = G.kcTFM, giay = G.giayTFM;

  G.CHIEU_TFM = G.CHIEU_TFM || {};

  /* ══════════ PHÂN TÍCH THAM SỐ (60 tướng gốc, và nút Native của tướng mod) ══════════
     Kết quả cất ở kn._pt để chỉ đoán một lần. */
  function dau(p, ds) { for (var i = 0; i < ds.length; i++) if (p[ds[i]] != null && typeof p[ds[i]] !== 'object') return p[ds[i]]; return null; }

  function phanTich(p, mo) {
    mo = String(mo || '');
    var r = {};
    r.dmg = dau(p, ['attack', 'damage', 'base_damage', 'skill_damage']) || 0;
    r.he = dau(p, ['attack_ratio', 'damage_ratio', 'skill_damage_ratio']) || 0;
    if (!r.he && r.dmg) r.he = dau(p, ['ap_ratio', 'magic_ratio']) || 0;
    r.pt = /Sát thương Phép|Sát Thương Phép/.test(mo);
    r.theo = /SMPT/.test(mo) ? 'ap' : 'atk';
    if (!/SMCK|SMPT/.test(mo)) r.theo = r.pt ? 'ap' : 'atk';
    r.coDmg = !!(r.dmg || r.he) && !(dau(p, ['heal']) != null && !/Sát thương/.test(mo));
    r.tamChieu = dau(p, ['range', 'cast_range', 'ult_range', 'skill_range']) || 0;
    r.banKinh = dau(p, ['attack_range', 'radius', 'area_range', 'explosion_range', 'splash_range', 'dot_range', 'stun_range', 'barrier_range']) || 0;
    var dien = /tất cả kẻ địch|các kẻ địch|những kẻ địch|kẻ địch trong phạm vi|xung quanh|hình nón|bán nguyệt|đường thẳng|xuyên qua|toàn bộ kẻ địch/.test(mo);
    if (!r.banKinh && dien && r.coDmg) r.banKinh = r.tamChieu || 30000;
    r.quanhMinh = !p.range || /xung quanh|quanh mình|quanh bản thân|hình nón|bán nguyệt|phía trước/.test(mo);
    r.nonNua = dau(p, ['half_angle_deg']) || (/hình nón|bán nguyệt|phía trước/.test(mo) ? 60 : 0);
    /* khống chế (tick) */
    r.choang = dau(p, ['stun', 'stun_duration']) || 0;
    r.hat = dau(p, ['airborne', 'airborne_time', 'airborne_tick']) || 0;
    r.troi = dau(p, ['bind_duration', 'bind_tick', 'bind']) || 0;
    r.khieu = dau(p, ['taunt_duration']) || 0;
    r.so = dau(p, ['fear_tick', 'fear_duration']) || 0;
    r.me = dau(p, ['charm_duration']) || 0;
    r.im = dau(p, ['silence_duration', 'block_skill_tick', 'block_duration', 'seal_duration']) || 0;
    r.chamMuc = dau(p, ['slow_speed', 'slow_ratio', 'slow', 'speed_down', 'move_speed_reduce']) || 0;
    r.chamGiay = dau(p, ['slow_duration', 'slow_time']) || (r.chamMuc ? (dau(p, ['tick', 'buff_duration', 'attack_tick']) || 120) : 0);
    /* hồi / khiên */
    r.hoi = dau(p, ['heal', 'heal_amount']) || 0;
    r.hoiHe = dau(p, ['heal_ratio', 'heal_ap_ratio']) || (r.hoi ? (dau(p, ['attack_ratio']) || 0) : 0);
    r.hoiTheoSat = (r.coDmg && p.heal == null && p.heal_ratio != null) ? p.heal_ratio : 0;
    r.hoiMinh = dau(p, ['heal_self']) || 0; r.hoiMinhHe = dau(p, ['heal_self_ratio']) || 0;
    r.hoiPhanTramMau = /\{HpRatio\}% Máu|% Máu Tối Đa/.test(mo) && r.hoi === 0 ? (dau(p, ['max_hp_ratio', 'hp_ratio']) || 0) : 0;
    r.chan = dau(p, ['shield', 'shield_amount']) || 0;
    r.chanHe = dau(p, ['shield_ratio', 'shield_ap_ratio']) || 0;
    r.chanTheoMau = /Máu Tối Đa/.test(mo) && !/SMPT/.test(mo) && r.chan > 0 ? true : (dau(p, ['shield_hp_ratio']) != null);
    if (p.shield_hp_ratio != null) r.chanHe = p.shield_hp_ratio;
    r.chanGiay = dau(p, ['shield_duration', 'tick', 'buff_duration']) || 180;
    r.phanDon = dau(p, ['reflect']) || 0;
    /* buff cho phe mình / nợ lên địch */
    r.buffGiay = dau(p, ['buff_duration', 'effect_duration', 'channel_duration', 'tick', 'ult_duration', 'shield_duration']) || 180;
    var bm = {};
    var as = dau(p, ['attack_speed', 'attack_speed_increase', 'attack_speed_boost']); if (as) bm.tocdanh = as;
    var ms = dau(p, ['move_speed', 'move_speed_increase', 'speed_up']); if (ms && !/giảm|Làm Chậm.*\{MoveSpeed\}/.test(mo)) bm.tocchay = ms;
    var ab = dau(p, ['attack_boost', 'attack_increase']); if (ab) bm.atk = ab;
    var mp = dau(p, ['magic_power_boost']); if (mp) bm.ap = mp;
    var df = dau(p, ['defence']); if (df && typeof df === 'number') bm.giap = df;
    var gn = dau(p, ['damage_reduce', 'damage_reduction']); if (gn) bm.giamNhan = gn;
    var cd = dau(p, ['cooltime_reduce', 'skill_cooldown_reduce']); if (cd) bm.hoiChieu = cd;
    var hp = dau(p, ['max_hp_ratio']); if (hp && !r.hoiPhanTramMau) bm.hpM = hp;
    var ri = dau(p, ['range_increase']); if (ri) bm.tam = ri;
    var am = dau(p, ['attack_mult']); if (am) bm.atkM = am;
    var asm = dau(p, ['attack_speed_mult']); if (asm) bm.tocdanh = (bm.tocdanh || 0) + asm;
    var msm = dau(p, ['move_speed_mult']); if (msm) bm.tocchay = (bm.tocchay || 0) + msm;
    r.buffMinh = bm;
    var bd = {};
    var dd = dau(p, ['defense_down', 'defence_reduce']); if (dd) bd.giap = -dd;
    var md = dau(p, ['magic_def_down', 'magic_resistance_reduce']); if (md) bd.khang = -md;
    var asr = dau(p, ['attack_speed_reduce']); if (asr) bd.tocdanh = -asr;
    var atr = dau(p, ['attack_reduce_ratio']); if (atr) bd.atkM = -atr;
    var da = dau(p, ['damage_amplification']); if (da) bd.tangNhan = da;
    var hr = dau(p, ['unhealable_time']); if (hr) { bd.giamHoi = 100; r.buffDichGiay = hr; }
    r.buffDich = bd;
    r.buffDichGiay = r.buffDichGiay || dau(p, ['debuff_duration', 'buff_duration', 'effect_duration', 'curse_duration', 'mark_duration']) || 180;
    /* bard ult: giảm giáp/kháng của CHÍNH đồng minh */
    if (/của họ/.test(mo) && (bd.giap || bd.khang)) { bm.giapM = bd.giap; bm.khangM = bd.khang; r.buffDich = {}; }
    /* lặp: kênh / chùm đạn / đòn liên hoàn */
    var soLan = dau(p, ['total_shots', 'attack_count', 'hit_count', 'max_hits', 'projectile_count']);
    var moi = dau(p, ['interval', 'shot_interval', 'period', 'delay_per_projectile']);
    var kenh = dau(p, ['channel_duration']);
    if (kenh && moi) { r.lap = { soLan: Math.max(1, Math.floor(kenh / moi)), moi: moi, kenh: kenh }; }
    else if (soLan && soLan > 1) { r.lap = { soLan: soLan, moi: moi || Math.max(3, Math.floor((p.hit_duration || 20) / soLan)), kenh: 0 }; }
    /* vùng tồn tại một lúc */
    var vLau = dau(p, ['attack_tick', 'dot_tick', 'heal_tick']);
    var vMoi = dau(p, ['attack_period', 'dot_period', 'heal_period']);
    if (vLau && vMoi) r.vung = { lau: vLau, moi: vMoi };
    /* chảy máu / độc trên người */
    var bl = dau(p, ['bleed', 'dot_damage', 'poison']);
    if (bl != null && (p.bleed_tick || p.bleed_duration || p.dot_period || p.poison_tick)) {
      r.dot = { luong: bl, he: dau(p, ['bleed_ratio', 'dot_attack_ratio']) || 0,
        moi: dau(p, ['bleed_tick', 'dot_period', 'poison_tick']) || 30,
        lau: dau(p, ['bleed_duration', 'dot_duration', 'poison_duration', 'dot_tick']) || 120 };
    }
    /* trễ / đạn / lao */
    r.tre = dau(p, ['delayed', 'activation_delay', 'delay', 'travel_time', 'first_delay']) || 0;
    var toc = dau(p, ['speed', 'projectile_speed', 'skill_dash_speed']) || 0;
    r.lao = !!(toc && /lao|lướt|nhảy|xông|đột kích|bay tới|phóng tới|dịch chuyển/.test(mo) && !/bắn|ném|phóng ra/.test(mo));
    if (/nhảy lùi|lùi lại/.test(mo)) r.luiLai = dau(p, ['move_range', 'move_distance']) || 20000;
    r.laoXa = dau(p, ['move_range', 'move_distance']) || r.tamChieu;
    r.dan = (!r.lao && toc && r.tamChieu > 30000) ? toc : 0;
    r.tocLao = toc;
    /* đẩy / kéo */
    var kbT = dau(p, ['knockback_speed', 'push_speed']);
    if (kbT) r.day = { toc: kbT, tick: dau(p, ['knockback_tick']) || 15, xa: dau(p, ['push_distance']) || 0 };
    var pl = dau(p, ['pull_speed', 'target_pull_speed', 'grab']);
    if (pl) r.keo = { toc: pl, tick: dau(p, ['pull_time']) || 15 };
    /* ẩn mình / không thể chỉ định / hành quyết / theo máu */
    r.anMinh = dau(p, ['invisible_duration']) || 0;
    r.khongChon = /Không Thể Bị Chỉ Định|không thể bị chỉ định/.test(mo) ? (dau(p, ['hit_duration', 'duration']) || 20) : 0;
    r.hanhQuyet = dau(p, ['execute_threshold']) || 0;
    r.theoMauMat = dau(p, ['missing_hp_ratio']) || 0;
    r.theoMauToiDa = dau(p, ['max_hp_damage_ratio', 'max_hp_ratio']) && r.coDmg ? (dau(p, ['max_hp_damage_ratio', 'max_hp_ratio']) || 0) : 0;
    r.theoMauHienTai = dau(p, ['current_hp_reduce_ratio']) || 0;
    /* triệu hồi (necromancer) */
    if (p.stat && p.attack && typeof p.attack === 'object') {
      r.trieuHoi = { stat: p.stat, theoAP: p.stat_by_spell_power, danh: p.attack,
        lau: dau(p, ['ghoul_duration']) || 180, lauTheoCap: dau(p, ['ghoul_duration_per_level']) || 0, lauTheoAP: dau(p, ['ghoul_duration_by_spell_power']) || 0 };
    }
    r.hoiSinh = /hồi sinh một Tướng đồng minh/.test(mo);
    r.choMinh = !r.coDmg && !r.hoi && !r.chan && !Object.keys(bm).length && !Object.keys(bd).length && !r.choang && !r.trieuHoi && !r.hoiSinh;
    r.dongMinh = /đồng minh/.test(mo) && !r.coDmg;
    r.tatCaDongMinh = /các đồng minh|những đồng minh|tướng đồng minh xung quanh|các tướng đồng minh|toàn đội|đồng minh xung quanh|đồng minh trong/.test(mo);
    r.thuLong = /hồi máu nhiều nhất|thấp nhất/.test(mo);
    return r;
  }
  G.phanTichChieu = phanTich;

  function ptCua(kn) {
    if (!kn._pt) kn._pt = phanTich(kn.p, kn.moGoc);
    return kn._pt;
  }

  /* ══════════ NGUYÊN THUỶ ══════════
     `S` tạo mỗi lần ra chiêu. Mọi khoảng cách vào hàm là ĐƠN VỊ TFM2 (1000 = 1 điểm ảnh) trừ
     khi hàm ghi rõ, mọi thời gian là TICK TFM2 (60 = 1 giây). Sim đổi đơn vị bên trong. */
  function taoS(tran, n, loai, hanh) {
    var sim = G._sim;
    var kn = n.tuong.kn[loai];
    var cs = sim.chiSo(n);
    var S = {
      tran: tran, n: n, cs: cs, loai: loai, kn: kn, p: kn.p, a: n.tuong.tfm[loai === 'danh' ? 'attack' : loai],
      t: tran.t, muc: hanh.muc, x: hanh.x, y: hanh.y, hanh: hanh,
      kc: kc, giay: giay, TPS: TPS, BK: sim.BK, TICK: sim.TICK
    };
    /* ── truy vấn ── */
    S.dich = function (x, y, r, o) { return sim.dichTrong(tran, n, x, y, kc(r), o || {}); };
    S.dongMinh = function (x, y, r, o) { return sim.dongMinhTrong(tran, n, x, y, kc(r), o || {}); };
    S.dichGanNhat = function (r, o) { return sim.dichGanNhat(tran, n, kc(r), o || {}); };
    S.dongMinhYeuNhat = function (r, keMinh) { return sim.dongMinhYeuNhat(tran, n, kc(r), keMinh !== false); };
    S.trongTam = function (m, r) { return sim.xa(n, m) <= kc(r) + sim.BK * 2; };
    S.huong = function () {
      var tx = S.muc ? S.muc.x : S.x, ty = S.muc ? S.muc.y : S.y;
      var dx = tx - n.x, dy = ty - n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 0.5 && n.huong != null) return [Math.cos(n.huong), Math.sin(n.huong)];
      return [dx / d, dy / d];
    };
    S.diemMuc = function () { return S.muc ? [S.muc.x, S.muc.y] : [S.x != null ? S.x : n.x, S.y != null ? S.y : n.y]; };
    S.diemXa = function (r) { var h = S.huong(); var d = kc(r); return [n.x + h[0] * d, n.y + h[1] * d]; };
    S.dmg = function (base, he, theo) { return (base || 0) + (he || 0) / 100 * ((theo || ptCua(kn).theo) === 'ap' ? cs.ap : cs.atk); };
    /* ── tác động ── */
    S.sat = function (m, luong, loaiSat, o) { return sim.satThuong(tran, n, m, luong, loaiSat || (ptCua(kn).pt ? 'pt' : 'vl'), o || { chieu: true }); };
    S.satVung = function (x, y, r, luong, loaiSat, o) {
      o = o || {};
      var ds = sim.dichTrong(tran, n, x, y, kc(r), o);
      var ra = [];
      ds.forEach(function (m) {
        if (o.nonNua && !sim.trongNon(n, m, o.nonNua)) return;
        sim.satThuong(tran, n, m, luong, loaiSat || (ptCua(kn).pt ? 'pt' : 'vl'), { chieu: true });
        ra.push(m);
      });
      return ra;
    };
    S.hoi = function (m, luong) { return sim.hoiMau(tran, n, m, luong); };
    S.chan = function (m, luong, tick) { sim.themChan(tran, m, luong, giay(tick), n); };
    S.buff = function (m, cs2, tick, ten) { sim.themBuff(tran, m, cs2, tick == null ? 3 : giay(tick), ten || (n.tuong.id + ':' + loai)); };
    S.choang = function (m, tick) { sim.khongChe(tran, n, m, 'choang', giay(tick)); };
    S.hat = function (m, tick) { sim.khongChe(tran, n, m, 'hat', giay(tick)); };
    S.troi = function (m, tick) { sim.khongChe(tran, n, m, 'troi', giay(tick)); };
    S.im = function (m, tick) { sim.khongChe(tran, n, m, 'im', giay(tick)); };
    S.khieu = function (m, tick) { sim.khongChe(tran, n, m, 'khieu', giay(tick)); };
    S.so = function (m, tick) { sim.khongChe(tran, n, m, 'so', giay(tick)); };
    S.cham = function (m, muc, tick) { sim.lamCham(tran, m, muc, giay(tick)); };
    S.day = function (m, toc, tick, tuX, tuY) { sim.dayLui(tran, m, tuX != null ? tuX : n.x, tuY != null ? tuY : n.y, kc(toc) * TPS, giay(tick)); };
    S.keo = function (m, toc, tick, toiX, toiY) { sim.keoVe(tran, m, toiX != null ? toiX : n.x, toiY != null ? toiY : n.y, kc(toc) * TPS, giay(tick)); };
    S.lao = function (x, y, toc, xong, o) { sim.laoToi(tran, n, x, y, kc(toc) * TPS, xong, o || {}); };
    S.dan = function (muc, x, y, toc, khi, o) { sim.banDan(tran, n, muc, x, y, kc(toc) * TPS, khi, o || {}); };
    S.vung = function (x, y, r, lau, moi, fn, o) { sim.taoVung(tran, n, x, y, kc(r), giay(lau), giay(moi), fn, o || {}); };
    S.doc = function (m, moiGiay, tick, loaiSat, ten) { sim.themDot(tran, n, m, moiGiay, giay(tick), loaiSat || (ptCua(kn).pt ? 'pt' : 'vl'), ten || loai); };
    S.sau = function (tick, fn) { sim.henSau(tran, giay(tick), fn); };
    S.lap = function (soLan, moiTick, fn) {
      for (var i = 0; i < soLan; i++) (function (k) { sim.henSau(tran, giay(moiTick) * k, function () { fn(k); }); })(i);
    };
    S.anMinh = function (tick) { n.anMinh = Math.max(n.anMinh, tran.t + giay(tick)); };
    S.khongChon = function (tick) { n.khongChon = Math.max(n.khongChon, tran.t + giay(tick)); };
    S.batTu = function (tick) { n.batTu = Math.max(n.batTu, tran.t + giay(tick)); };
    S.mienKc = function (m, tick) { m.mienKc = Math.max(m.mienKc || 0, tran.t + giay(tick)); };
    S.khoaHanh = function (tick) { hanh.dai = Math.max(hanh.dai, giay(tick)); hanh.huy = false; };
    S.trieuHoi = function (o) { return sim.trieuHoi(tran, n, o); };
    S.hoiSinh = function (m, phanTram) { return sim.hoiSinh(tran, n, m, phanTram == null ? 0.4 : phanTram); };
    S.fx = function (o) { o.tuong = n.tuong.id; o.kn = loai; o.doi = n.doi; o.ai = n.i; sim.hieuUng(tran, o); };
    S.chu = function (m, chu, loaiChu) { sim.soBay(tran, { x: m.x, y: m.y, chu: chu, loai: loaiChu || 'ne' }); };
    S.giamHoi = function (loaiChieu, tick) { n.cd[loaiChieu] = Math.max(0, n.cd[loaiChieu] - giay(tick)); };
    /* ── thêm theo yêu cầu của bốn agent chiêu (RESEARCH §16.6), chỉ cộng thêm, API cũ nguyên ── */
    S.khongChonMuc = function (m, tick) { if (m && m.tuong) m.khongChon = Math.max(m.khongChon || 0, tran.t + giay(tick)); };
    S.giaiGioi = function (m, tick) { if (m && m.tuong) m.giaiGioi = Math.max(m.giaiGioi || 0, tran.t + giay(tick)); };
    S.chan = function (m, luong, tick, khiVo) { sim.themChan(tran, m, luong, giay(tick), n, khiVo); };
    S.chanDan = function (x, y, r, lau) { tran.chanDan.push({ x: x, y: y, r: kc(r), den: tran.t + giay(lau), doi: n.doi }); };
    S.donKe = function (soDon, tick, fn) { n.donKe = { con: soDon || 0, den: tran.t + giay(tick), fn: fn }; };
    S.khiBiDanh = function (tick, fn) { n.moc.biDanh = { den: tran.t + giay(tick), fn: fn }; };
    S.khiGiet = function (tick, fn) { n.moc.giet = { den: tran.t + giay(tick), fn: fn }; };
    S.phanTan = function (m, phanTram, tick, lau) {
      if (!m || !m.tuong) return;
      var cu = m.phanTan;
      m.phanTan = { pt: phanTram, den: tran.t + giay(tick), lau: giay(lau || tick), no: cu ? cu.no : 0, moiGiay: cu ? cu.moiGiay : 0 };
    };
    S.lienKet = function (a, b, phanTram, tick, motChieu) {
      if (!a || !b || !a.tuong || !b.tuong) return;
      a.lienKet = { voi: b, pt: phanTram, den: tran.t + giay(tick) };
      if (!motChieu) b.lienKet = { voi: a, pt: phanTram, den: tran.t + giay(tick) };
    };
    S.pt = ptCua(kn);
    return S;
  }
  /** nội tại: `G.CHIEU_TFM[id].batDau(S)` chạy MỘT lần ở tick đầu của mỗi người (sim gọi) — cắm móc đánh / bị đánh / hạ gục */
  G.khoiDongChieu = function (tran, n) {
    var ov = G.CHIEU_TFM[n.tuong.id];
    if (!ov || typeof ov.batDau !== 'function') return;
    var loai = n.tuong.kn.skill ? 'skill' : n.tuong.kn.skill2 ? 'skill2' : 'ult';
    ov.batDau(taoS(tran, n, loai, { muc: null, x: n.x, y: n.y }));
  };
  G.taoNguyenThuy = taoS;

  /* ══════════ CHỌN MỤC TIÊU LÚC RA CHIÊU ══════════
     Trả { muc, x, y } hoặc null nếu chiêu này lúc này không đáng dùng. */
  var MUC_DICH = { Enemy: 1, EnemyChampion: 1, EnemyWithoutTower: 1, EnemyMinion: 1, EnemyMonster: 1 };
  /* `o.linh` = bộ não cho phép ném vào lính lúc này (chiêu diện rộng khi đang ăn lính — sim.js thuChieu);
     không thì chiêu địch chỉ nhắm tướng / quái lớn, đúng luật "không chiêu nào tung vào trụ, chiêu cuối
     chỉ vào tướng" đọc từ casting_target của TFM2 (AI_BRAIN §4.1). */
  function locTheoCasting(ct, o) {
    if (ct === 'EnemyChampion') return { tuong: true };
    if (ct === 'EnemyMinion') return { linh: true };
    if (o && o.linh) return ct === 'Enemy' ? { tru: true } : {};
    return { tuong: true };
  }
  G.chonMucChieu = function (tran, n, loai, cs, mucDangDanh, o) {
    var sim = G._sim;
    o = o || {};
    var kn = n.tuong.kn[loai], a = n.tuong.tfm[loai];
    if (!a) return null;
    var pt = ptCua(kn);
    var tam = a.range || pt.tamChieu || 0;
    var nguongHoi = o.nguongHoi == null ? 0.82 : o.nguongHoi;
    /* tướng mod: theo casting_type / casting_target */
    if (a.casting_type) {
      var ctg = a.casting_target || 'Enemy';
      if (ctg === 'AllyOnlySelf' || ctg === 'Self') return { muc: n, x: n.x, y: n.y };
      if (ctg === 'Ally' || ctg === 'AllyChampion') {
        var y = sim.dongMinhYeuNhat(tran, n, kc(tam), true);
        if (!y || (!pt.coDmg && y.hp / y.hpMax > nguongHoi)) return null;
        return { muc: y, x: y.x, y: y.y };
      }
      if (MUC_DICH[ctg]) {
        var d = (mucDangDanh && mucDangDanh.tuong && sim.xa(n, mucDangDanh) <= kc(tam) + sim.BK * 2) ? mucDangDanh
          : sim.dichGanNhat(tran, n, kc(tam), locTheoCasting(ctg, o));
        if (!d && o.linh && mucDangDanh && mucDangDanh.linh) d = mucDangDanh;
        if (!d) return null;
        if (a.casting_type === 'Position' || a.casting_type === 'Direction') return { muc: d, x: d.x, y: d.y };
        return { muc: d, x: d.x, y: d.y };
      }
      return null;
    }
    /* tướng gốc: đoán theo phân tích */
    if (pt.trieuHoi) return { muc: n, x: n.x, y: n.y };
    if (pt.hoiSinh) {
      var chet = null;
      tran.nguoi.forEach(function (m) { if (m.doi === n.doi && m !== n && m.chet > 0 && (!chet || m.chet > chet.chet)) chet = m; });
      return chet ? { muc: chet, x: n.x, y: n.y } : null;
    }
    if (pt.coDmg || pt.choang || pt.hat || pt.troi || pt.khieu || pt.so || pt.chamMuc || Object.keys(pt.buffDich).length) {
      var tamD = pt.quanhMinh && !pt.tamChieu ? pt.banKinh : tam;
      var muc = (mucDangDanh && mucDangDanh.tuong && sim.xa(n, mucDangDanh) <= kc(tamD) + sim.BK * 2) ? mucDangDanh
        : sim.dichGanNhat(tran, n, kc(tamD), { tuong: true });
      if (!muc) muc = sim.dichGanNhat(tran, n, kc(tamD), { quaiLon: true });
      if (!muc && o.linh && mucDangDanh && mucDangDanh.linh) muc = mucDangDanh;
      if (!muc) return null;
      return { muc: muc, x: muc.x, y: muc.y };
    }
    /* hồi / khiên / buff cho phe mình */
    var can = pt.hoi || pt.chan || pt.hoiPhanTramMau;
    var yeu = sim.dongMinhYeuNhat(tran, n, kc(tam || 30000), true);
    if (can) {
      if (!yeu || yeu.hp / yeu.hpMax > nguongHoi) return null;   /* không ai cần */
      return { muc: yeu, x: yeu.x, y: yeu.y };
    }
    /* buff thuần: chỉ bung khi đang có đánh nhau gần */
    if (Object.keys(pt.buffMinh).length) {
      if (!sim.dichGanNhat(tran, n, kc(Math.max(tam, 60000)), { tuong: true })) return null;
      var m2 = pt.tatCaDongMinh ? n : (yeu || n);
      return { muc: m2, x: m2.x, y: m2.y };
    }
    return { muc: n, x: n.x, y: n.y };
  };

  /* ══════════ CÁCH CHẠY CHUNG (60 tướng gốc, nút Native) ══════════ */
  function chayChung(S, pt) {
    var n = S.n, sim = G._sim;
    var luong = pt.coDmg ? S.dmg(pt.dmg, pt.he, pt.theo) : 0;
    var loaiSat = pt.pt ? 'pt' : 'vl';
    var diem = S.diemMuc();

    function danhMot(m, k) {
      if (!m || m.hp <= 0) return;
      var l = luong;
      if (pt.theoMauMat && m.hpMax) l += (m.hpMax - m.hp) * pt.theoMauMat / 100;
      if (pt.theoMauToiDa && m.hpMax) l += m.hpMax * pt.theoMauToiDa / 100;
      if (pt.theoMauHienTai && m.hp) l += m.hp * pt.theoMauHienTai / 100;
      if (pt.hanhQuyet && m.tuong && m.hp <= pt.hanhQuyet) l = m.hp + 1;
      if (l > 0) {
        var thuc = S.sat(m, l, loaiSat);
        if (pt.hoiTheoSat) S.hoi(n, thuc * pt.hoiTheoSat / 100);
      }
      if (!m.tuong && !m.hienRa) return;      /* lính không ăn khống chế */
      if (pt.choang) S.choang(m, pt.choang);
      if (pt.hat) S.hat(m, pt.hat);
      if (pt.troi) S.troi(m, pt.troi);
      if (pt.khieu) S.khieu(m, pt.khieu);
      if (pt.so) S.so(m, pt.so);
      if (pt.me) S.choang(m, pt.me);
      if (pt.im) S.im(m, pt.im);
      if (pt.chamMuc) S.cham(m, pt.chamMuc, pt.chamGiay);
      if (Object.keys(pt.buffDich).length) S.buff(m, pt.buffDich, pt.buffDichGiay, S.kn.ten + ' (nợ)');
      if (pt.dot) S.doc(m, S.dmg(pt.dot.luong, pt.dot.he, pt.theo) * TPS / pt.dot.moi, pt.dot.lau, loaiSat, S.kn.ten);
      if (pt.day) S.day(m, pt.day.toc, pt.day.tick);
      if (pt.keo) S.keo(m, pt.keo.toc, pt.keo.tick);
    }
    function danhTai(x, y) {
      if (pt.banKinh) {
        var ds = sim.dichTrong(S.tran, n, x, y, kc(pt.banKinh), {});
        ds.forEach(function (m) {
          if (pt.nonNua && !sim.trongNon(n, m, pt.nonNua)) return;
          danhMot(m);
        });
        S.fx({ loai: 'chieu', x: x, y: y, x2: x, y2: y, dien: true, r: kc(pt.banKinh) });
      } else {
        var m = S.muc;
        if (!m || m.hp <= 0 || (m.chet > 0)) m = sim.dichGanNhat(S.tran, n, kc(pt.tamChieu || 30000) + 10, { tuong: true });
        if (m) { danhMot(m); S.fx({ loai: 'chieu', x: n.x, y: n.y, x2: m.x, y2: m.y }); }
      }
    }
    function ra() {
      var tam = pt.quanhMinh ? [n.x, n.y] : diem;
      if (pt.vung) {
        var soLan = Math.max(1, Math.floor(pt.vung.lau / pt.vung.moi));
        var moiLan = luong / (pt.coDmg ? 1 : 1);
        S.vung(tam[0], tam[1], pt.banKinh || 30000, pt.vung.lau, pt.vung.moi, function (V, ds) {
          ds.forEach(function (m) {
            if (moiLan > 0) sim.satThuong(S.tran, n, m, moiLan, loaiSat, { chieu: true });
            if (pt.chamMuc && (m.tuong || m.hienRa)) S.cham(m, pt.chamMuc, pt.vung.moi + 6);
          });
        }, { ketThuc: function (ds) { if (pt.choang) ds.forEach(function (m) { if (m.tuong) S.choang(m, pt.choang); }); },
             hoi: !pt.coDmg && (pt.hoi || pt.hoiHe) ? function (V, dsMinh) {
               var hl = S.dmg(pt.hoi, pt.hoiHe, 'ap');
               dsMinh.forEach(function (m) { S.hoi(m, hl); });
             } : null });
        void soLan;
        return;
      }
      if (pt.lap) {
        S.lap(pt.lap.soLan, pt.lap.moi, function () { if (n.chet > 0) return; danhTai(pt.quanhMinh ? n.x : diem[0], pt.quanhMinh ? n.y : diem[1]); });
        if (pt.lap.kenh) S.khoaHanh(pt.lap.kenh);
        return;
      }
      danhTai(tam[0], tam[1]);
    }

    /* phần lên ĐỊCH */
    if (pt.coDmg || pt.choang || pt.hat || pt.troi || pt.khieu || pt.so || pt.chamMuc || pt.dot || Object.keys(pt.buffDich).length) {
      if (pt.lao) {
        var toi = S.muc ? S.muc : null;
        var dx = diem[0] - n.x, dy = diem[1] - n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var xa = Math.min(d, kc(pt.laoXa || pt.tamChieu || 60000));
        var dung = toi ? Math.max(0, xa - sim.BK * 2 - 4) : xa;
        S.lao(n.x + dx / d * dung, n.y + dy / d * dung, pt.tocLao, function () { ra(); if (pt.luiLai) { var h = S.huong(); S.lao(n.x - h[0] * kc(pt.luiLai), n.y - h[1] * kc(pt.luiLai), pt.tocLao || 4000, null, { khongDoi: true }); } });
      } else if (pt.dan && S.muc) {
        S.dan(pt.banKinh ? null : S.muc, diem[0], diem[1], pt.dan, function (m) { if (pt.banKinh) ra(); else danhMot(m); }, { r: pt.banKinh ? 0 : 0 });
        S.fx({ loai: 'chieu', x: n.x, y: n.y, x2: diem[0], y2: diem[1], dan: true });
      } else if (pt.tre) {
        S.sau(pt.tre, ra);
        S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: !!pt.banKinh, r: kc(pt.banKinh), cho: giay(pt.tre) });
      } else ra();
      if (pt.luiLai && !pt.lao) { var h2 = S.huong(); S.lao(n.x - h2[0] * kc(pt.luiLai), n.y - h2[1] * kc(pt.luiLai), pt.tocLao || 4000, null, { khongDoi: true }); }
    } else if (pt.lao) {
      S.lao(diem[0], diem[1], pt.tocLao, null, {});
    }

    /* phần cho PHE MÌNH */
    var dsMinh = null;
    function minh() {
      if (dsMinh) return dsMinh;
      if (pt.tatCaDongMinh) dsMinh = S.dongMinh(n.x, n.y, pt.banKinh || pt.tamChieu || 60000, { keMinh: true });
      else dsMinh = [S.muc && S.muc.doi === n.doi && S.muc.tuong ? S.muc : (S.dongMinhYeuNhat(pt.tamChieu || 30000, true) || n)];
      return dsMinh;
    }
    if ((pt.hoi || pt.hoiHe) && !pt.coDmg && !pt.vung) {
      var hl = S.dmg(pt.hoi, pt.hoiHe, 'ap');
      minh().forEach(function (m) { S.hoi(m, m === n && pt.hoiMinh ? S.dmg(pt.hoiMinh, pt.hoiMinhHe, 'ap') : hl); });
      S.fx({ loai: 'chieu', x: n.x, y: n.y, x2: minh()[0].x, y2: minh()[0].y, hoi: true });
    }
    if (pt.hoiPhanTramMau) minh().forEach(function (m) { S.hoi(m, m.hpMax * pt.hoiPhanTramMau / 100); });
    if (pt.chan || pt.chanHe) {
      minh().forEach(function (m) {
        var cl = pt.chanTheoMau ? pt.chan + m.hpMax * pt.chanHe / 100 : S.dmg(pt.chan, pt.chanHe, 'ap');
        S.chan(m, cl, pt.chanGiay);
        if (pt.phanDon) S.buff(m, { phanDon: pt.phanDon }, pt.chanGiay, S.kn.ten);
      });
      S.fx({ loai: 'chieu', x: n.x, y: n.y, x2: minh()[0].x, y2: minh()[0].y, chan: true });
    }
    if (Object.keys(pt.buffMinh).length) {
      minh().forEach(function (m) { S.buff(m, pt.buffMinh, pt.buffGiay, S.kn.ten); });
      if (!pt.coDmg) S.fx({ loai: 'chieu', x: n.x, y: n.y, x2: n.x, y2: n.y, aura: true });
    }
    if (pt.anMinh) S.anMinh(pt.anMinh);
    if (pt.khongChon) S.khongChon(pt.khongChon);
    if (pt.trieuHoi) {
      var th = pt.trieuHoi, cap = n.cap;
      var lau = th.lau + th.lauTheoCap * (cap - 1) + th.lauTheoAP * S.cs.ap / 100;
      S.trieuHoi({ stat: th.stat, theoAP: th.theoAP, danh: th.danh, lau: giay(lau), ten: S.kn.ten });
    }
    if (pt.hoiSinh && S.muc && S.muc.chet > 0) S.hoiSinh(S.muc, 0.4);
  }

  /* ══════════ CÂY HIỆU ỨNG (8 tướng mod) ══════════ */
  var LOC_MUC = {
    Enemy: { tru: true }, EnemyWithoutTower: {}, EnemyChampion: { tuong: true }, EnemyMinion: { linh: true },
    Ally: { minh: true }, AllyChampion: { minh: true, tuong: true }, AllyOnlySelf: { self: true }, Self: { self: true }
  };
  function laMinh(ct) { return /^Ally|^Self/.test(ct || ''); }
  function banKinhHinh(shape) {
    if (!shape) return 0;
    if (shape.Circle) return shape.Circle.radius || 0;
    if (shape.Rect) return Math.max(shape.Rect.width || 0, shape.Rect.height || 0) / 2;
    return 0;
  }
  function tickBuff(bs) {
    if (!bs || !bs.duration || bs.duration === 'Permanent') return 60 * 600;
    if (bs.duration.Time) return bs.duration.Time.tick || 60;
    return 60;
  }
  function buffCua(bs) {
    var r = G.chuanChiSo(bs);
    return r;
  }
  function chayCay(S, e, ctx) {
    if (!e) return;
    var n = S.n, sim = G._sim;
    var muc = ctx.muc, x = ctx.x, y = ctx.y;
    switch (e.type) {
      case 'Combine': (e.effects || []).forEach(function (c) { chayCay(S, c, ctx); }); return;
      case 'WithSelf': (e.effects || []).forEach(function (c) { chayCay(S, c, { muc: n, x: n.x, y: n.y }); }); return;
      case 'Delayed': S.sau(e.tick || 0, function () { (e.effects || []).forEach(function (c) { chayCay(S, c, ctx); }); }); return;
      case 'Attack': if (muc && muc.hp > 0) S.sat(muc, S.dmg(e.damage, e.attack_ratio, 'atk'), 'vl'); return;
      case 'ApAttack': if (muc && muc.hp > 0) S.sat(muc, S.dmg(e.damage, e.attack_ratio, 'ap'), 'pt'); return;
      case 'Heal': if (muc) S.hoi(muc.doi === n.doi ? muc : n, (e.amount || 0) + (e.attack_ratio || 0) / 100 * S.cs.atk + (e.ap_ratio || 0) / 100 * S.cs.ap); return;
      case 'AddBuff': if (muc) S.buff(muc, buffCua(e.buff_state), tickBuff(e.buff_state), e.buff_state && e.buff_state.name); return;
      case 'AddCasterBuff': S.buff(n, buffCua(e.buff_state), tickBuff(e.buff_state), e.buff_state && e.buff_state.name); return;
      case 'AddStatScaledBuff': {
        var bs = buffCua(e.buff_state), sc = e.scale || {};
        for (var k in sc) { var kk = G.CHI_SO_TFM[k] || k; bs[kk] = (bs[kk] || 0) + (sc[k] || 0) / 100 * (k === 'magic_power' ? S.cs.ap : S.cs.atk); }
        S.buff(e.target === 'Caster' || !muc ? n : muc, bs, tickBuff(e.buff_state), e.buff_state && e.buff_state.name);
        return;
      }
      case 'AddCasted': {
        /* hiệu ứng lặp trên mục tiêu: mỗi `period` tick chạy `effects` trong `duration` tick */
        var soLan = Math.max(1, Math.floor((e.duration || 60) / (e.period || 30)));
        var m0 = muc;
        S.lap(soLan, e.period || 30, function () { if (m0 && m0.hp > 0) (e.effects || []).forEach(function (c) { chayCay(S, c, { muc: m0, x: m0.x, y: m0.y }); }); });
        return;
      }
      case 'Knockback': if (muc && (muc.tuong || muc.hienRa)) S.day(muc, e.speed || 3000, e.tick || 15); return;
      case 'Pull': if (muc && (muc.tuong || muc.hienRa)) S.keo(muc, e.speed || 3000, e.tick || 15); return;
      case 'Rush': {
        var h = S.huong(), d = kc(e.range || 40000);
        var tx = n.x + h[0] * d, ty = n.y + h[1] * d;
        var trung = {};
        S.lao(tx, ty, e.speed || 4000, function () {
          (e.end_effects || []).forEach(function (c) { chayCay(S, c, { muc: muc, x: n.x, y: n.y }); });
        }, { moiBuoc: function () {
          sim.dichTrong(S.tran, n, n.x, n.y, sim.BK * 2 + 4, LOC_MUC[e.casting_target] || {}).forEach(function (m) {
            if (trung[m.i != null ? 'n' + m.i : m.id || 'x']) return;
            if (!e.penetrate && Object.keys(trung).length) return;
            trung[m.i != null ? 'n' + m.i : m.id || 'x'] = 1;
            apDung(S, e.applied_effects, m);
          });
        } });
        return;
      }
      case 'MoveTo': {
        var h2 = S.huong(), d2 = Math.min(kc(e.range || 40000), muc ? sim.xa(n, muc) : 1e9);
        S.lao(n.x + h2[0] * d2, n.y + h2[1] * d2, e.speed || 4000, function () {
          (e.end_effects || []).forEach(function (c) { chayCay(S, c, { muc: muc, x: n.x, y: n.y }); });
        }, {});
        return;
      }
      case 'TargetProjectile': {
        if (!muc) return;
        S.dan(muc, muc.x, muc.y, e.speed || 5000, function (m) { apDung(S, e.applied_effects, m); }, {});
        return;
      }
      case 'LinearProjectile': {
        var h3 = S.huong(), r3 = banKinhHinh(e.shape) || 5000;
        S.dan(null, n.x + h3[0] * kc(e.range || 50000), n.y + h3[1] * kc(e.range || 50000), e.speed || 5000,
          function (m) { apDung(S, e.applied_effects, m); },
          { r: kc(r3), xuyen: !!e.penetrate, loc: LOC_MUC[e.applied_target] || {},
            ketThuc: function (px, py) { (e.end_effects || []).forEach(function (c) { chayCay(S, c, { muc: null, x: px, y: py }); }); } });
        return;
      }
      case 'RangeProjectile': case 'ParabolicProjectile': case 'LineRangeProjectile': {
        var r4 = e.type === 'LineRangeProjectile' ? (e.width || 10000) / 2 : (banKinhHinh(e.shape) || 20000);
        var tre = e.delay != null ? e.delay : (e.travel_time || 0);
        var px = x != null ? x : n.x, py = y != null ? y : n.y;
        if (e.type === 'LineRangeProjectile') { var h4 = S.huong(); px = n.x + h4[0] * kc((e.length || 40000) / 2); py = n.y + h4[1] * kc((e.length || 40000) / 2); r4 = Math.max(r4, (e.length || 40000) / 2); }
        S.fx({ loai: 'chieu', x: px, y: py, dien: true, r: kc(r4), cho: giay(tre) });
        S.sau(tre, function () {
          var loc = LOC_MUC[e.applied_target] || {};
          var ds = laMinh(e.applied_target) ? sim.dongMinhTrong(S.tran, n, px, py, kc(r4), { keMinh: true }) : sim.dichTrong(S.tran, n, px, py, kc(r4), loc);
          ds.forEach(function (m) { apDung(S, e.applied_effects, m); });
          (e.end_effects || []).forEach(function (c) { chayCay(S, c, { muc: null, x: px, y: py }); });
        });
        return;
      }
      case 'RangePeriodProjectile': {
        var r5 = banKinhHinh(e.shape) || 20000, px5 = x != null ? x : n.x, py5 = y != null ? y : n.y;
        var loc5 = LOC_MUC[e.applied_target] || {};
        S.sau(e.first_delay || 0, function () {
          S.vung(px5, py5, r5, e.tick || 120, e.period || 30, function (V, ds) {
            ds.forEach(function (m) { apDung(S, e.applied_effects, m); });
          }, { loc: loc5, minh: laMinh(e.applied_target), ketThuc: function () { (e.end_effects || []).forEach(function (c) { chayCay(S, c, { muc: null, x: px5, y: py5 }); }); } });
        });
        return;
      }
      case 'ShrinkingBarrier': {
        /* vòng thu nhỏ dần: quy về vùng đánh theo tick, bán kính trung bình */
        var rb = ((e.start_radius || 40000) + (e.end_radius || 10000)) / 2;
        S.vung(x != null ? x : n.x, y != null ? y : n.y, rb, e.tick || 120, 10, function (V, ds) {
          ds.forEach(function (m) { apDung(S, e.applied_effects, m); });
        }, { loc: LOC_MUC[e.applied_target] || {} });
        return;
      }
      case 'RangeEffect': {
        var r6 = banKinhHinh(e.shape) || 20000, cx = x != null ? x : n.x, cy = y != null ? y : n.y;
        var ds6 = laMinh(e.target) ? sim.dongMinhTrong(S.tran, n, cx, cy, kc(r6), { keMinh: true }) : sim.dichTrong(S.tran, n, cx, cy, kc(r6), LOC_MUC[e.target] || {});
        ds6.forEach(function (m) { (e.effects || []).forEach(function (c) { chayCay(S, c, { muc: m, x: m.x, y: m.y }); }); });
        S.fx({ loai: 'chieu', x: cx, y: cy, dien: true, r: kc(r6) });
        return;
      }
      case 'CasterInvisible': S.anMinh(e.tick || 60); return;
      case 'CasterAnimation': case 'ViewEffect': case 'CasterViewEffect': case 'TargetSfx':
        S.fx({ loai: 'chieu', x: n.x, y: n.y, x2: muc ? muc.x : (x != null ? x : n.x), y2: muc ? muc.y : (y != null ? y : n.y), ten: e.name, nhe: true });
        return;
      case 'Native': {
        /* mã gốc trong exe: chạy CHUNG theo tham số của nút, mô tả lấy từ chiêu */
        var pt = phanTich(e, S.kn.moGoc);
        if (!pt.tamChieu) pt.tamChieu = S.a.range || 0;
        chayChung(S, pt);
        return;
      }
      default:
        return;
    }
  }
  function apDung(S, ds, m) {
    (ds || []).forEach(function (ae) {
      var ef = ae.effect || ae;
      chayCay(S, ef, { muc: m, x: m.x, y: m.y });
    });
  }
  G.chayCayHieuUng = chayCay;

  /* ══════════ CỬA VÀO ══════════ */
  G.chayChieu = function (tran, n, loai, hanh) {
    var S = taoS(tran, n, loai, hanh);
    var ov = G.CHIEU_TFM[n.tuong.id];
    if (ov && typeof ov[loai] === 'function') {
      if (ov[loai](S) !== false) return S;
    }
    var a = S.a;
    if (a && a.effect) chayCay(S, a.effect, { muc: S.muc, x: S.x, y: S.y });
    else chayChung(S, ptCua(S.kn));
    return S;
  };

  /** mô tả chiêu để hiện cho người chơi: bản viết tay có `mota` thì ưu tiên */
  G.moTaChieu = function (t, loai) {
    var ov = G.CHIEU_TFM[t.id];
    if (ov && ov.mota && ov.mota[loai]) return ov.mota[loai];
    return t.kn[loai].mo;
  };

})(window);
