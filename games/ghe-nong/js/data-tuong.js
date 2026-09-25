/* data-tuong.js — 68 tướng của Teamfight Manager 2, đọc thẳng từ window.TFM (js/data-tfm.js).

   Chủ dự án (2026-09-25): "copy hết skill + config + stats + equip + time của tfm2". Hai mươi tướng
   tự chế của bản trước bỏ hẳn; id tướng giờ là id TFM2 (`fighter`, `pyromancer`...), tên và tên
   chiêu là chữ tiếng Việt CHÍNH THỨC của TFM2 (`text/champion.i18n`, khoá `vi`).

   Tệp này KHÔNG chứa số liệu — số nằm trong TFM. Nó chỉ:
     1. gắn cho mỗi tướng một VỊ TRÍ (`vt`) và một LỚP (`lop`) — hai khái niệm của game này, TFM2
        không khoá vị trí cho tướng. Bảng `VI_TRI` bên dưới xếp tay, có đếm lại cho đủ mỗi vị trí.
     2. đổi đơn vị TFM2 sang đơn vị sim ở MỘT chỗ (`G.tuongOCap`): sân 960000 → 0..1000,
        60 tick = 1 giây (RESEARCH §13.1, §14.1).
     3. điền tham số vào mô tả chiêu (`{Damage}`, `{Coef}`, `{Stun}`...) để màn cấm chọn đọc được.
     4. tra hình / tiếng: ảnh đủ 68 tướng do agent ảnh làm (khoá `t.<id>`); chưa có thì mượn thân
        cũ (`tuong.<id cũ>`) nếu tướng ấy từng là một trong hai mươi con cũ.
*/
(function (G) {
  'use strict';

  var TFM = G.TFM;
  var CAI = TFM.cai;
  var TPS = CAI.tick_per_second;          /* 60 tick một giây */
  var DV = CAI.width / 1000;              /* 960 đơn vị TFM2 = 1 đơn vị sim */

  G.TFM_TPS = TPS;
  G.TFM_DV = DV;
  /** khoảng cách TFM2 → sim */
  G.kcTFM = function (u) { return (u || 0) / DV; };
  /** tick TFM2 → giây */
  G.giayTFM = function (t) { return (t || 0) / TPS; };

  /* ══════════ VỊ TRÍ ══════════
     Người chơi khoá cứng vị trí của tuyển thủ (DESIGN §3), nên mỗi tướng phải thuộc một vị trí để
     màn cấm chọn bày theo hàng. Hai mươi tướng từng là "thân" của hai mươi con cũ (bảng
     `TUONG` trong _tools/build_tfm.py) giữ nguyên vị trí cũ, để bảng thông thạo của tuyển thủ và
     tủ của 24 đội máy chuyển sang không đổi nghĩa. Số còn lại xếp theo `category`/`tags`:
     Melee có Tank → trên, Assassin → rừng, Magician → giữa, Range → xạ thủ, Util → hỗ trợ. */
  var VI_TRI = {
    tren: ['swordman', 'berserker', 'hammerer', 'magic_knight', 'fighter', 'knight', 'ogre', 'jiangshi',
           'dokkaebi', 'siege_breaker', 'android', 'prisoner', 'executioner', 'lancer', 'pole_warrior',
           'strongman', 'spellbreaker'],
    rung: ['cavalry_knight', 'werewolf', 'ghost', 'hunter', 'ninja', 'demon', 'inquisitor', 'clown',
           'hitman', 'circus_blade', 'nightmare', 'exorcist'],
    giua: ['pyromancer', 'lightning_mage', 'shadowmancer', 'dual_blader', 'ice_mage', 'necromancer',
           'dark_mage', 'illusionist', 'druid', 'voodoo_shaman', 'white_mage', 'wind_mage',
           'sand_mage', 'astrologer', 'alchemist'],
    duoi: ['archer', 'gunner', 'poison_dart_hunter', 'bomber', 'soldier', 'gambler', 'boomerang_hunter',
           'whip_master', 'dancer', 'crossbowman', 'harpooner'],
    ho:   ['shield_bearer', 'priest', 'barrier_magician', 'bard', 'pythoness', 'monk', 'chef',
           'plague_doctor', 'taoist', 'enchanter', 'guardian_spirit', 'spirit_caller', 'vampire']
  };
  var LOP_CUA = { Melee: 'can', Range: 'xa', Magician: 'phep', Util: 'ho', Assassin: 'sat' };

  /* hai mươi tướng cũ → thân TFM2 (chép từ _tools/build_tfm.py) — dùng để mượn hình / tiếng cũ và
     để đổi bản lưu cũ (save.js) */
  G.TUONG_CU = {
    kiemsi: 'swordman', cuongchien: 'berserker', phaco: 'hammerer', thanhkiem: 'magic_knight',
    kynhan: 'cavalry_knight', gaosu: 'werewolf', bongma: 'ghost', thoisan: 'hunter',
    phaposu: 'pyromancer', phapset: 'lightning_mage', bongdem: 'shadowmancer', tuchien: 'dual_blader',
    xathu: 'archer', sungtruong: 'gunner', nodoc: 'poison_dart_hunter', bomxich: 'bomber',
    hiepsi: 'shield_bearer', thaythuoc: 'priest', khienhon: 'barrier_magician', nhacsi: 'bard'
  };
  G.TUONG_CU_CUA = {};
  for (var kCu in G.TUONG_CU) G.TUONG_CU_CUA[G.TUONG_CU[kCu]] = kCu;

  /* ══════════ ĐIỀN MÔ TẢ ══════════
     Mô tả TFM2 có thẻ màu `<#ff9028ff>…<>` và icon `<i#…>`; bỏ hết, chỉ giữ chữ. Mỗi chỗ `{X}`
     tra tham số của chiêu theo bảng ứng viên dưới đây; giá trị thời gian đổi tick → giây,
     khoảng cách chia 1000 (TFM2 hiện đúng như thế: bảng Fighter ghi Range 23 cho 23000,
     AI_BRAIN §1). Không tra được thì để `?` — bốn agent bước 4 sửa từng con qua
     G.CHIEU_TFM[id].mota. */
  var UNG_VIEN = {
    Damage: ['attack', 'damage', 'base_damage', 'skill_damage', 'dot_damage', 'per_hit_damage'],
    Coef: ['attack_ratio', 'damage_ratio', 'skill_damage_ratio', 'ap_ratio', 'magic_ratio', 'heal_ratio', 'shield_ratio', 'dot_attack_ratio'],
    Range: ['attack_range', 'range', 'radius', 'ult_range', 'skill_range', 'area_range', 'explosion_range', 'heal_range', 'buff_range', 'barrier_range'],
    Radius: ['radius', 'attack_range', 'explosion_range', 'splash_range'],
    Speed: ['speed', 'projectile_speed', 'skill_dash_speed'],
    Stun: ['stun', 'stun_duration'], StunTime: ['stun', 'stun_duration'],
    Slow: ['slow_speed', 'slow_ratio', 'slow', 'speed_down', 'move_speed_reduce'],
    SlowTime: ['slow_duration'], SlowDuration: ['slow_duration'],
    Time: ['tick', 'buff_duration', 'stun_duration', 'airborne', 'airborne_time', 'shield_duration', 'effect_duration', 'channel_duration', 'taunt_duration', 'bind_duration', 'duration'],
    Duration: ['attack_tick', 'dot_tick', 'heal_tick', 'buff_duration', 'channel_duration', 'effect_duration', 'ghoul_duration', 'shield_duration', 'tick', 'ult_duration', 'sweep_duration'],
    Tick: ['attack_period', 'dot_period', 'heal_period', 'period', 'interval', 'bleed_tick', 'heal_delay'],
    Value: ['heal', 'shield', 'shield_amount', 'heal_amount'],
    Heal: ['heal', 'heal_amount'], HealCoef: ['heal_ratio', 'heal_ap_ratio'], HealRatio: ['heal_ratio'],
    SelfHeal: ['heal_self'], SelfHealCoef: ['heal_self_ratio'],
    Shield: ['shield', 'shield_amount'], ShieldCoef: ['shield_ratio', 'shield_ap_ratio'], Amount: ['shield', 'shield_amount', 'heal'],
    AttackSpeed: ['attack_speed', 'attack_speed_increase', 'attack_speed_boost'], AttackSpeedCoef: ['attack_speed_by_spell_power', 'attack_speed_ap_ratio'],
    MoveSpeed: ['move_speed', 'move_speed_increase', 'slow', 'speed_up'], MoveSpeedCoef: ['move_speed_by_spell_power'],
    MoveSpeedReduce: ['move_speed_reduce'],
    Attack: ['attack_boost', 'attack_increase'], AttackRatio: ['magic_ratio', 'ap_ratio'],
    MagicPower: ['magic_power_boost'],
    CoolReduce: ['cooltime_reduce', 'skill_cooldown_reduce', 'cooldown_reduce'],
    DefenceReduce: ['defence_reduce', 'defense_down'], MagicResistanceReduce: ['magic_resistance_reduce', 'magic_def_down'],
    Reflect: ['reflect'], HpCoef: ['damage_reduce_hp_ratio', 'max_hp_hp_ratio'], HpRatio: ['max_hp_ratio', 'hp_ratio', 'shield_hp_ratio'],
    Count: ['total_shots', 'attack_count', 'projectile_count', 'max_count', 'charge_count', 'max_hits', 'hit_count'],
    UseCount: ['cooltime_use_count', 'charge_count'],
    BleedTime: ['bleed_duration'], BleedDamage: ['bleed'], BleedCoef: ['bleed_ratio'],
    StealthTime: ['invisible_duration'], BlockDuration: ['block_skill_tick', 'block_duration'],
    Taunt: ['taunt_duration'], Fear: ['fear_tick', 'fear_duration'], Charm: ['charm_duration'],
    HpDrain: ['hp_drain_per_tick'], DurationCoef: ['ghoul_duration_by_spell_power'], DurationPerLevel: ['ghoul_duration_per_level'],
    SpreadRatio: ['damage_spread_ratio'], Threshold: ['execute_threshold'], Width: ['width', 'line_width', 'projectile_width'],
    Angle: ['half_angle_deg'], Distance: ['move_distance', 'move_range', 'push_distance'], Interval: ['interval', 'shot_interval', 'period']
  };
  /* tên ô nào là THỜI GIAN (tick) và ô nào là KHOẢNG CÁCH (đơn vị TFM2) */
  var LA_TICK = /(_tick|_duration|_period|_time|_delay|^tick$|^duration$|^period$|^interval$|^stun$|^airborne$|^delay$|^applyed$|^delayed$|^bind$|^charge_time$|^travel_time$)/;
  var LA_KC = /(range|radius|distance|width|length|offset|_speed$|^speed$)/;

  function catThe(s) { return String(s || '').replace(/<i#[^>]*>/g, '').replace(/<#[0-9a-fA-F]+>/g, '').replace(/<>/g, ''); }

  function giaTri(ten, v) {
    if (v == null) return null;
    if (typeof v === 'object') return null;
    if (LA_TICK.test(ten)) return String(Math.round(v / TPS * 10) / 10);
    if (/_speed$|^speed$/.test(ten) && Math.abs(v) >= 1000) return String(Math.round(v / 100) / 10);
    if (LA_KC.test(ten) && Math.abs(v) >= 1000) return String(Math.round(v / 1000));
    return String(v);
  }

  /** Gom mọi số trong cây hiệu ứng của tướng mod thành một bảng phẳng (lần gặp đầu thắng);
      bán kính hình tròn `shape.Circle.radius` ghi thành `radius`. Chỉ để ĐIỀN MÔ TẢ. */
  function gomCay(e, ra) {
    if (!e || typeof e !== 'object') return ra;
    if (Array.isArray(e)) { e.forEach(function (x) { gomCay(x, ra); }); return ra; }
    for (var k in e) {
      var v = e[k];
      if (k === 'Circle' && v && v.radius != null && ra.radius == null) ra.radius = v.radius;
      if (typeof v === 'number') { if (ra[k] == null) ra[k] = v; }
      else if (typeof v === 'object') gomCay(v, ra);
    }
    return ra;
  }
  G.gomCayHieuUng = function (e) { return gomCay(e, {}); };

  /** điền {X} trong mô tả bằng tham số của chiêu `p`; trả về chữ sạch */
  G.dienMoTa = function (mo, p) {
    var sach = catThe(mo);
    /* "{Range} xung quanh" là bán kính vùng; "lao đến … trong phạm vi {Range}" là tầm chiêu */
    var quanh = /xung quanh|vụ nổ|khu vực|hình nón/.test(sach);
    var cay = p.effect ? gomCay(p.effect, {}) : null;
    return sach.replace(/\{([A-Za-z0-9_]+)\}/g, function (_, k) {
      var ds = UNG_VIEN[k] || [];
      if (k === 'Range' && !quanh) ds = ['range', 'cast_range', 'ult_range', 'skill_range', 'attack_range', 'radius', 'heal_range', 'buff_range'];
      for (var i = 0; i < ds.length; i++) {
        var v = giaTri(ds[i], p[ds[i]]);
        if (v != null) return v;
      }
      if (cay) for (var j = 0; j < ds.length; j++) { var v2 = giaTri(ds[j], cay[ds[j]]); if (v2 != null) return v2; }
      if (cay && k === 'StealthTime' && cay.tick != null) return giaTri('tick', cay.tick);
      return '?';
    });
  };

  /* ══════════ DỰNG BẢNG TƯỚNG ══════════ */
  var vtCua = {};
  Object.keys(VI_TRI).forEach(function (vt) { VI_TRI[vt].forEach(function (id) { vtCua[id] = vt; }); });

  G.TUONG = [];
  Object.keys(TFM.tuong).forEach(function (id) {
    var c = TFM.tuong[id];
    if (!vtCua[id]) throw new Error('tướng TFM2 chưa xếp vị trí: ' + id);
    var kn = {};
    ['attack', 'skill', 'skill2', 'ult'].forEach(function (a) {
      var p = c[a] || {};
      var loai = a === 'attack' ? 'danh' : a;
      var ten = a === 'attack' ? 'Đánh thường' : c.ten_chieu[a];
      var mo = a === 'attack' ? '' : c.mo_ta[a];
      kn[loai] = {
        loai: loai, ten: ten, p: p, moGoc: mo,
        mo: a === 'attack' ? '' : G.dienMoTa(mo, p),
        hoi: G.giayTFM(p.cooltime)
      };
    });
    G.TUONG.push({
      id: id, ten: c.ten, lop: LOP_CUA[c.category] || 'can', vt: vtCua[id],
      the: c.tags || [], mod: !!c.mod, tfm: c, kn: kn,
      mota: TFM.chu.loai[String(c.category).toLowerCase()] || c.category
    });
  });
  /* thứ tự bày: theo vị trí rồi theo tên, để hàng nào cũng ổn định giữa hai lần mở */
  var THU_TU_VT = { tren: 0, rung: 1, giua: 2, duoi: 3, ho: 4 };
  G.TUONG.sort(function (a, b) {
    return (THU_TU_VT[a.vt] - THU_TU_VT[b.vt]) || (a.ten < b.ten ? -1 : a.ten > b.ten ? 1 : 0);
  });

  G.TUONG_THEO_ID = {};
  G.TUONG.forEach(function (t) { G.TUONG_THEO_ID[t.id] = t; });
  if (G.TUONG.length !== 68) throw new Error('đếm được ' + G.TUONG.length + ' tướng, phải là 68');

  G.VITRI = [
    { id: 'tren', ten: 'Đường Trên', tat: 'TR', buff: 'Hồi ' + CAI.top_hp_regen_percent + '% máu tối đa mỗi giây' },
    { id: 'rung', ten: 'Đi Rừng', tat: 'RỪ', buff: '+' + CAI.jungle_move_speed_bonus + '% tốc chạy; hành quyết quái lớn khi máu ≤ ' + CAI.jungle_execute_threshold },
    { id: 'giua', ten: 'Đường Giữa', tat: 'GI', buff: '+' + CAI.mid_exp_bonus + '% kinh nghiệm' },
    { id: 'duoi', ten: 'Xạ Thủ', tat: 'XẠ', buff: '+' + CAI.bottom_gold_bonus + '% vàng' },
    { id: 'ho', ten: 'Hỗ Trợ', tat: 'HỖ', buff: '−' + CAI.support_exp_reduction + '% kinh nghiệm, −' + CAI.support_gold_reduction + '% vàng; last-hit thì đồng đội gần nhất nhận vàng' }
  ];
  G.VITRI_THEO_ID = {};
  G.VITRI.forEach(function (v) { G.VITRI_THEO_ID[v.id] = v; });

  G.LOP_TEN = { can: 'Đấu Sĩ', xa: 'Đánh Xa', phep: 'Pháp Sư', ho: 'Hỗ Trợ', sat: 'Sát Thủ' };

  /* thông thạo: N < R < SR < SSR < UR (DESIGN.md §3.4) — lớp riêng của game này, nhân vào chỉ số */
  G.THONG_THAO = [
    { id: 'N', ten: 'N', heso: 0.90, mau: '#7d8794' },
    { id: 'R', ten: 'R', heso: 0.95, mau: '#6fc4f0' },
    { id: 'SR', ten: 'SR', heso: 1.00, mau: '#b08af0' },
    { id: 'SSR', ten: 'SSR', heso: 1.06, mau: '#ffd76e' },
    { id: 'UR', ten: 'UR', heso: 1.12, mau: '#ff8fb0' }
  ];
  G.TT_THEO_ID = {};
  G.THONG_THAO.forEach(function (t) { G.TT_THEO_ID[t.id] = t; });

  G.CAP_TOI_DA = CAI.need_exp.length + 1;      /* 12 */

  /** chỉ số tướng ở một cấp trận (1..12), đơn vị SIM: tầm và tốc chạy theo sân 0..1000, tốc đánh = đòn/giây */
  G.tuongOCap = function (t, cap) {
    var s = t.tfm.stat, g = t.tfm.growth, n = Math.max(0, cap - 1);
    var d = t.tfm.attack || {};
    return {
      atk: s.attack + g.attack * n, ap: s.magic_power + g.magic_power * n,
      hp: s.hp + g.hp * n, giap: s.defence + g.defence * n, khang: s.magic_resistance + g.magic_resistance * n,
      tam: G.kcTFM(d.range || 23000),
      tocdanh: TPS / (d.cooltime || 60),
      tocchay: (s.move_speed + g.move_speed * n) * TPS / DV,
      hpRegen: s.hp_regen + g.hp_regen * n
    };
  };

  /** tướng theo vị trí */
  G.tuongTheoViTri = function (vt) {
    return G.TUONG.filter(function (t) { return t.vt === vt; });
  };

  /* ══════════ HÌNH VÀ TIẾNG ══════════
     Agent ảnh xuất đủ 68 tướng: sheet riêng từng tướng (`G.napTuong` / `G.veHinhT` / `G.daiT`,
     RESEARCH §15.4), chân dung chung (`G.oAnhTuongIcon`), tiếng `tran.<id>.<hành động TFM2>`
     (§15.5). Tên hoạt ảnh và tên tiếng do TFM2 đặt, KHÔNG đều giữa các tướng (`skill` hay
     `skill1`, `bush_skill1` của hunter…) — hai hàm dưới tra theo danh sách ứng viên. */
  var ANIM_UNG = {
    dung: ['idle'], chay: ['run', 'move', 'walk'], danh: ['attack', 'attack1'], dinh: ['hit', 'damaged'],
    chet: ['dead', 'die', 'death'],
    skill: ['skill', 'skill1', 'skill1_pre', 'skill_pre', 'bush_skill1', 'skill1_dash'],
    skill2: ['skill2', 'skill2_pre', 'skill2_start', 'skill2_dash', 'skill2_attack'],
    ult: ['ult', 'ult_pre', 'ult_on', 'ult_attack', 'ult_dash', 'ult_loop']
  };
  var TIENG_UNG = {
    danh: ['attack', 'attack1', 'bush_attack', 'attack_cast'],
    skill: ['skill', 'skill1', 'skill_cast', 'skill1_cast', 'bush_skill1', 'skill1_pre', 'skill_start'],
    skill2: ['skill2', 'skill2_cast', 'skill2_start', 'skill2_attack', 'skill2_on'],
    ult: ['ult', 'ult_cast', 'ult_pre', 'ult_on', 'ult_loop', 'ult_attack', 'ult_dash']
  };
  /** tên hoạt ảnh TFM2 của tướng `id` cho hành động của sim (dung/chay/danh/dinh/chet/skill/skill2/ult);
      không có thì 'idle' (G.veHinhT tự rơi về idle nên chỗ vẽ không cần kiểm) */
  G.animTuong = function (id, hanh) {
    var ds = ANIM_UNG[hanh] || [hanh];
    if (!G.daiT) return ds[0];
    for (var i = 0; i < ds.length; i++) if (G.daiT(id, ds[i]) > 0) return ds[i];
    return hanh === 'dung' ? 'idle' : ds[0];
  };
  /** phần tử <i> chân dung cho DOM — atlas chung art/tfm/icon.png (window.TFM_ICON, không nạp lười).
      `[BẪY ĐÃ SẬP]` G.anhTuongIcon của sprites.js đặt background-size bằng cỡ Ô chứ không phải cỡ
      ATLAS, nên cả tấm co lại thành một chấm 21 px — đã ghi yêu cầu sửa cho agent ảnh
      (brain/plans/ghe-nong-tfm2-full.md). Ở đây dựng style từ chính bảng toạ độ. */
  var CO_ICON = null;
  G.oAnhTuongTFM = function (id, cao) {
    var TI = window.TFM_ICON, m = TI && TI[id];
    if (!m) return null;
    if (!CO_ICON) {
      CO_ICON = [0, 0];
      for (var k in TI) { var o = TI[k]; if (o && o.length === 4) { CO_ICON[0] = Math.max(CO_ICON[0], o[0] + o[2]); CO_ICON[1] = Math.max(CO_ICON[1], o[1] + o[3]); } }
    }
    cao = cao || 44;
    var kk = cao / Math.max(m[2], m[3]);
    var st = 'background-image:url(art/tfm/icon.png?v=' + (G.ART_V || '') + ');' +
      'background-position:' + (-m[0] * kk) + 'px ' + (-m[1] * kk) + 'px;' +
      'background-size:' + (CO_ICON[0] * kk) + 'px ' + (CO_ICON[1] * kk) + 'px;' +
      'background-repeat:no-repeat;image-rendering:pixelated;display:block;width:' + cao + 'px;height:' + cao + 'px';
    return G.el('i', { style: st });
  };
  /** tên tiếng `tran.<id>.<hành động>` có trong bảng; không có thì null (nightmare không có tiếng trong TFM2, §15.5) */
  G.tiengTuong = function (id, hanh) {
    var B = window.AM_BANG && window.AM_BANG.tieng;
    if (!B) return null;
    var ds = TIENG_UNG[hanh] || [hanh];
    for (var i = 0; i < ds.length; i++) { var k = 'tran.' + id + '.' + ds[i]; if (B[k]) return k; }
    return null;
  };

})(window);
