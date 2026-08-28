/* ==========================================================================
 * DỮ LIỆU GAME — dựng lại từ Official Dragon Project Wiki + bài 4Gamer.
 * Xem games/dragonproj/RESEARCH.md để biết con số nào có nguồn, con số nào
 * là tái dựng. Quy ước trong file này:
 *   - Tên riêng (vũ khí, boss, magi, nguyên liệu, map) giữ NGUYÊN VĂN bản
 *     Global, vì đó là thứ duy nhất còn tra lại được.
 *   - Chỉ số chiến đấu (dmg, hp, tốc độ) là TÁI DỰNG, cân theo thang chỉ số
 *     thật ở RESEARCH.md mục 4 (vũ khí SS ~306 phys / 656 elem, giáp SS bộ
 *     ~424 HP / 544 pdef).
 * Không dùng bất kỳ tài nguyên ảnh/âm thanh nào của game gốc — tất cả vẽ bằng code.
 * ========================================================================== */
(function (G) {
  'use strict';

  /* ---------------------------------------------------------------- HỆ ---- */
  // Vòng khắc chế trong How-to-Play guide: Water > Fire > Earth > Lightning > Water,
  // và Dark <-> Light đối nhau. Hệ số là tái dựng.
  G.ELEMENTS = {
    none:    { id: 'none',    vi: 'Vô',   color: '#c8d4de', glow: '#8fa3b5' },
    fire:    { id: 'fire',    vi: 'Hỏa',  color: '#ff7a3c', glow: '#ffb37a' },
    water:   { id: 'water',   vi: 'Thủy', color: '#4fb6ff', glow: '#a5dcff' },
    earth:   { id: 'earth',   vi: 'Thổ',  color: '#8fd14f', glow: '#c6ec9d' },
    thunder: { id: 'thunder', vi: 'Lôi',  color: '#ffd23f', glow: '#fff0a0' },
    light:   { id: 'light',   vi: 'Quang',color: '#fff6d8', glow: '#ffffff' },
    dark:    { id: 'dark',    vi: 'Ám',   color: '#a06fe0', glow: '#d3b6f5' }
  };
  G.ELEM_BEATS = { water: 'fire', fire: 'earth', earth: 'thunder', thunder: 'water', light: 'dark', dark: 'light' };
  G.ELEM_ADV = 1.5;   // [TÁI DỰNG]
  G.ELEM_DIS = 0.6;   // [TÁI DỰNG]

  G.elemMult = function (atkEl, defEl) {
    if (!atkEl || atkEl === 'none' || !defEl || defEl === 'none') return 1;
    if (G.ELEM_BEATS[atkEl] === defEl) return G.ELEM_ADV;
    if (G.ELEM_BEATS[defEl] === atkEl) return G.ELEM_DIS;
    return 1;
  };

  /* ------------------------------------------------- TRẠNG THÁI BẤT LỢI ---- */
  // Burn/Poison/Paralysis/Slow có trong bảng Common Abilities của wiki; Freeze và
  // Stagger lấy từ mô tả Magi. Thời lượng là tái dựng.
  G.STATUS = {
    burn:      { vi: 'Bỏng',    ms: 8000,  dps: 0.020, color: '#ff7a3c' },
    poison:    { vi: 'Độc',     ms: 12000, dps: 0.012, color: '#8fd14f' },
    paralysis: { vi: 'Tê liệt', ms: 3000,  stun: true, color: '#ffd23f' },
    freeze:    { vi: 'Đóng băng', ms: 2500, stun: true, color: '#4fb6ff' },
    slow:      { vi: 'Chậm',    ms: 6000,  spd: 0.6,   color: '#a06fe0' }
  };
  // Trang Attack Magi: tê liệt theo hệ địch — Earth 0%, Lightning 25%, Fire 50%, Water 100%.
  G.PARALYZE_CHANCE = { earth: 0, thunder: 0.25, fire: 0.5, water: 1, none: 0.4, light: 0.4, dark: 0.4 };

  /* ------------------------------------------------------------- VŨ KHÍ ---- */
  /* combo[]  : hệ số nhân sát thương từng đòn trong chuỗi
   * arc      : bề rộng vùng chém (radian)
   * reach    : tầm với (px)
   * swingMs  : thời gian một đòn (gồm cả độ cứng)
   * moveMul  : hệ số tốc chạy khi cầm vũ khí này
   * special  : id đặc thù khi GIỮ
   * 4Gamer xếp hạng sát thương gốc: Great Sword > Spear > Sword&Shield > Bow ≈ Dual Blades.
   * Dual Blades tăng tốc chạy và tốc né (nguyên văn: 移動速度や回避速度が向上).
   * Bow bị chậm chân lại (How-to-Play: "offset with a slower movement speed").
   */
  G.WEAPONS = {
    sword: {
      id: 'sword', vi: 'Kiếm & Khiên', jp: '片手剣', en: 'Sword & Shield',
      desc: 'Cân bằng, dễ dùng nhất, và là vũ khí DUY NHẤT đỡ được đòn.',
      combo: [1.00, 1.00, 1.15, 1.45], arc: 1.75, reach: 62, swingMs: 300,
      moveMul: 1.00, dodgeMul: 1.00, atkBase: 1.00,
      special: 'guard',
      specialVi: 'Đỡ đòn + Phản đòn',
      // Đỡ đúng lúc -> giảm 90% (wiki: "damage become 1/10"); đỡ thường -> giảm 60% [TÁI DỰNG]
      guardCut: 0.40, perfectCut: 0.10, perfectMs: 220, guardMoveMul: 0.40,
      counterMul: 2.60, counterArc: 1.2, counterReach: 82
    },
    great: {
      id: 'great', vi: 'Đại Kiếm', jp: '両手剣', en: 'Great Sword',
      desc: 'Sát thương cao nhất game, chậm nhất. Giữ để nạp Chém Tích Lực.',
      combo: [1.55, 1.70, 2.20], arc: 2.30, reach: 78, swingMs: 620,
      moveMul: 0.80, dodgeMul: 0.92, atkBase: 1.45,
      special: 'cleave',
      specialVi: 'Chém Tích Lực (溜め斬り)',
      chargeMs: 1800, cleaveMin: 2.0, cleaveMax: 6.0,
      cleaveArc: 2.5, cleaveReach: 118,
      cleaveElemBonus: 4.0,   // Normal-type: sát thương HỆ ×4 khi chém nạp
      cleaveDR: 0.5,          // giảm 50% sát thương nhận trong lúc chém
      cleaveFatigue: 2.0      // nạp thanh gục mạnh, kể cả không trúng WEAK
    },
    spear: {
      id: 'spear', vi: 'Thương', jp: '槍', en: 'Spear',
      desc: 'Tầm với dài nhất. Đòn cuối combo quét vòng quanh. Giữ để Lao Tới.',
      combo: [0.85, 0.85, 0.95, 1.30], arc: 0.95, reach: 96, swingMs: 260,
      finalSweep: true, // đòn cuối quét 360° (4Gamer: 周囲をなぎ払うような攻撃)
      moveMul: 0.95, dodgeMul: 1.00, atkBase: 1.20,
      special: 'lunge',
      specialVi: 'Lao Tới (突進)',
      lungeDist: 190, lungeMul: 1.90, lungeMs: 220, lungeLagMs: 260,
      lungeElemBonus: 4.0,   // Normal-type: giữ chỉ hướng -> sát thương hệ tới ×4
      lungeStagger: true     // trúng WEAK -> quái chùn, ngắt đòn đang ra
    },
    dual: {
      id: 'dual', vi: 'Song Kiếm', jp: '双剣', en: 'Dual Blades',
      desc: 'Nhanh nhất, chạy nhanh nhất, tầm ngắn nhất. Giữ để Loạn Vũ.',
      combo: [0.62, 0.62, 0.62, 0.62, 0.62], arc: 1.35, reach: 48, swingMs: 155,
      moveMul: 1.15, dodgeMul: 1.18, atkBase: 0.85,
      special: 'ranbu',
      specialVi: 'Loạn Vũ (乱舞)',
      ranbuWindupMs: 380, ranbuHits: 8, ranbuMul: 0.75, ranbuMs: 900,
      ranbuLandLagMs: 420, ranbuInvuln: true, ranbuReach: 76
    },
    bow: {
      id: 'bow', vi: 'Cung', jp: '弓矢', en: 'Bow',
      desc: 'Duy nhất đánh xa. CÀNG GẦN BẮN CÀNG ĐAU. Giữ để Ngắm Bắn.',
      combo: [0.70, 0.70, 0.90], arc: 0, reach: 420, swingMs: 340, ranged: true,
      moveMul: 0.85, dodgeMul: 0.95, atkBase: 0.90,
      arrowSpeed: 12,
      special: 'snipe',
      specialVi: 'Ngắm Bắn (狙い撃ち)',
      snipeChargeMs: 1500, snipeMin: 1.5, snipeMax: 5.0,
      snipeAimRadius: 260, snipePierce: true,
      // 4Gamer: 射程距離が短いほど矢の威力が大幅に高まる
      snipeCloseBonus: 0.9, snipeCloseRange: 340,
      snipeDotMs: 8000, snipeDotDps: 0.03   // nạp đầy trúng WEAK -> mũi tên trắng gây DoT
    }
  };
  G.WEAPON_ORDER = ['sword', 'great', 'spear', 'dual', 'bow'];

  /* ------------------------------------------- LOẠI ĐẶC THÙ CỦA VŨ KHÍ ---- */
  G.WTYPES = {
    normal: { id: 'normal', vi: 'Normal', color: '#c8d4de',
      note: 'Đặc thù cơ bản. Kiếm: giảm 90% khi đỡ chuẩn. Đại kiếm: chém nạp ×4 sát thương hệ.' },
    heat:   { id: 'heat',   vi: 'Heat',   color: '#ff7a3c',
      note: 'Có thanh Heat nạp bằng đánh/đỡ. Đầy thì đặc thù đổi thành chiêu mạnh hơn.' },
    soul:   { id: 'soul',   vi: 'Soul',   color: '#a06fe0',
      note: 'Có thanh Soul. Đầy thì vào trạng thái tăng sức mạnh trong một khoảng.' }
  };

  /* --------------------------------------------------- COMMON ABILITIES ---- */
  // Nguyên văn bảng trong wiki. value = mức [TÁI DỰNG] cho một dòng roll.
  G.ABILITIES = [
    { id: 'swordDmg',  vi: 'Sát thương Kiếm +{v}%',      stat: 'wdmg.sword', v: [4, 12] },
    { id: 'guard',     vi: 'Giảm sát thương khi đỡ {v}%', stat: 'guard',      v: [3, 10] },
    { id: 'greatDmg',  vi: 'Sát thương Đại Kiếm +{v}%',  stat: 'wdmg.great', v: [4, 12] },
    { id: 'cleave',    vi: 'Sát thương Chém Tích Lực +{v}%', stat: 'cleave', v: [5, 15] },
    { id: 'cleaveSpd', vi: 'Thời gian nạp Chém -{v}%',   stat: 'cleaveSpd',  v: [4, 12] },
    { id: 'spearDmg',  vi: 'Sát thương Thương +{v}%',    stat: 'wdmg.spear', v: [4, 12] },
    { id: 'lunge',     vi: 'Sát thương Lao Tới +{v}%',   stat: 'lunge',      v: [5, 15] },
    { id: 'dualDmg',   vi: 'Sát thương Song Kiếm +{v}%', stat: 'wdmg.dual',  v: [4, 12] },
    { id: 'frenzy',    vi: 'Sát thương Loạn Vũ +{v}%',   stat: 'frenzy',     v: [5, 15] },
    { id: 'bowDmg',    vi: 'Sát thương Cung +{v}%',      stat: 'wdmg.bow',   v: [4, 12] },
    { id: 'snipe',     vi: 'Sát thương Ngắm Bắn +{v}%',  stat: 'snipe',      v: [5, 15] },
    { id: 'snipeSpd',  vi: 'Thời gian ngắm -{v}%',       stat: 'snipeSpd',   v: [4, 12] },
    { id: 'fireDmg',   vi: 'Sát thương Hỏa +{v}%',       stat: 'edmg.fire',  v: [5, 16] },
    { id: 'waterDmg',  vi: 'Sát thương Thủy +{v}%',      stat: 'edmg.water', v: [5, 16] },
    { id: 'earthDmg',  vi: 'Sát thương Thổ +{v}%',       stat: 'edmg.earth', v: [5, 16] },
    { id: 'thunDmg',   vi: 'Sát thương Lôi +{v}%',       stat: 'edmg.thunder', v: [5, 16] },
    { id: 'hydro',     vi: 'Sát thương Thủy & Lôi +{v}%', stat: 'edmg.hydro', v: [4, 11] },
    { id: 'burnRes',   vi: 'Thời gian Bỏng -{v}%',       stat: 'res.burn',   v: [10, 40] },
    { id: 'poisonRes', vi: 'Thời gian Độc -{v}%',        stat: 'res.poison', v: [10, 40] },
    { id: 'paraRes',   vi: 'Thời gian Tê liệt -{v}%',    stat: 'res.paralysis', v: [10, 40] },
    { id: 'slowRes',   vi: 'Thời gian Chậm -{v}%',       stat: 'res.slow',   v: [10, 40] },
    { id: 'recovery',  vi: 'Hồi phục +{v}%',             stat: 'recovery',   v: [6, 18] },
    { id: 'moveSpd',   vi: 'Tốc chạy +{v}%',             stat: 'moveSpd',    v: [3, 10] },
    { id: 'dodge',     vi: 'Quãng né +{v}%',             stat: 'dodge',      v: [5, 15] },
    { id: 'magiCharge',vi: 'Nạp Magi +{v}%',             stat: 'magiCharge', v: [5, 15] },
    { id: 'castSpd',   vi: 'Tốc thi triển Magi +{v}%',   stat: 'castSpd',    v: [5, 15] },
    { id: 'luck',      vi: 'May mắn +{v}',               stat: 'luck',       v: [1, 5] }
  ];

  /* ------------------------------------------------------------- MAGI ------ */
  // Tỉ lệ gacha THẬT (wiki): SS 3% · S 9% · A 48% · B 40%.
  G.MAGI_RATES = { SS: 0.03, S: 0.09, A: 0.48, B: 0.40 };
  G.MAGI_MAXLV = { SS: 60, S: 40, A: 30, B: 20 };

  // shape: 'star' Attack (vũ khí) · 'heart' Recovery (vũ khí) · 'diamond' Support (vũ khí) · 'circle' Passive (giáp)
  G.MAGI = [
    /* ---- ATTACK SS (tên và mô tả nguyên văn wiki) ---- */
    { id:'natures_descent', n:"Nature's Descent", shape:'star', rank:'SS', el:'earth', kind:'aoe',
      d:'Mở vòng phép lớn quanh địch, gọi mưa thiên thạch gây sát thương Thổ. Nạp thêm thanh gục.',
      mul:6.2, radius:150, cost:100, fatigue:18 },
    { id:'jupiters_descent', n:"Jupiter's Descent", shape:'star', rank:'SS', el:'thunder', kind:'ranged',
      d:'Giáng 10 tia sét vào địch, gây tê liệt, +50% sát thương Lôi trong 30 giây.',
      mul:5.8, radius:120, cost:100, status:'paralysis', buff:{edmg:{thunder:0.5}, ms:30000} },
    { id:'frozen_water_rush', n:'Frozen Water Rush', shape:'star', rank:'SS', el:'water', kind:'melee',
      d:'Đóng băng địch phía trước rồi lao tới bằng một khối băng.', mul:6.0, radius:130, cost:100, status:'freeze' },
    { id:'eingrams_star', n:"Eingram's Star", shape:'star', rank:'SS', el:'fire', kind:'melee',
      d:'Gọi một cây búa đá khổng lồ đập tới trước, gây bỏng cho địch hệ Thổ.', mul:6.4, radius:135, cost:100, status:'burn' },
    { id:'dragons_manifest', n:"Dragon's Manifest", shape:'star', rank:'SS', el:'water', kind:'ranged',
      d:'Gọi 8 luồng rồng nước, giảm 50% kháng Thủy của địch trong 30 giây.', mul:5.4, radius:160, cost:100 },
    { id:'subjugating_blade', n:'Subjugating Blade', shape:'star', rank:'SS', el:'water', kind:'melee',
      d:'Chém chữ thập. Nhát đầu phá bộ phận rất mạnh, nhát sau nạp thanh gục.',
      mul:5.0, radius:110, cost:100, partMul:2.5, fatigue:22 },
    { id:'cocytus_ice_barrage', n:'Cocytus Ice Barrage', shape:'star', rank:'SS', el:'water', kind:'ranged',
      d:'Sáu cột băng rơi xuống địch, gây đóng băng. Tầm toàn màn.', mul:5.2, radius:140, cost:100, status:'freeze' },
    { id:'crimson_dragonflame', n:'Crimson Dragonflame', shape:'star', rank:'SS', el:'fire', kind:'ranged',
      d:'Gọi một con rồng lửa lao thẳng về phía trước.', mul:5.6, radius:120, cost:100 },
    { id:'diabolical_tornado', n:'Diabolical Tornado', shape:'star', rank:'SS', el:'thunder', kind:'melee',
      d:'Tạo lốc sét lớn quanh mình.', mul:5.5, radius:145, cost:100 },
    { id:'miasmatic_blast', n:'Miasmatic Blast', shape:'star', rank:'SS', el:'earth', kind:'melee',
      d:'Bốn đầu lâu phun sương độc quanh mình, gây trúng độc.', mul:4.8, radius:140, cost:100, status:'poison' },
    { id:'king_solomons_gate', n:"King Solomon's Gate", shape:'star', rank:'SS', el:'dark', kind:'aoe',
      d:'Mở cánh cổng thở ra tử linh gây sát thương Ám. Bất tử trong lúc thi triển.',
      mul:6.0, radius:150, cost:100, invuln:true },
    { id:'ciel_serras_feather', n:"Ciel Serra's Feather", shape:'star', rank:'SS', el:'light', kind:'aoe',
      d:'Bay lên bắn 8 lưỡi lông vũ gây sát thương Quang.', mul:5.9, radius:150, cost:100 },
    /* ---- ATTACK S / A / B ---- */
    { id:'ice_spike',  n:'Ice Spike',  shape:'star', rank:'S', el:'water',  d:'Cột băng dựng lên.',      mul:3.2, radius:100, cost:80 },
    { id:'inferno',    n:'Inferno',    shape:'star', rank:'S', el:'fire',   d:'Đòn lửa cuồng nộ.',       mul:3.2, radius:100, cost:80 },
    { id:'thunder_storm', n:'Thunder Storm', shape:'star', rank:'S', el:'thunder', d:'Bão sét dữ dội.',  mul:3.2, radius:100, cost:80 },
    { id:'magaruda',   n:'Magaruda',   shape:'star', rank:'S', el:'earth',  d:'Hai nhát chém gây choáng và sát thương Thổ.', mul:3.0, radius:95, cost:80 },
    { id:'meteora',    n:'Meteora',    shape:'star', rank:'S', el:'fire',   d:'Gọi thiên thạch, nạp thanh gục.', mul:3.1, radius:110, cost:80, fatigue:12 },
    { id:'flame_slash',n:'Flame Slash',shape:'star', rank:'A', el:'fire',   d:'Nhát chém rực lửa.',      mul:1.9, radius:80, cost:60 },
    { id:'rock_strike',n:'Rock Strike',shape:'star', rank:'A', el:'earth',  d:'Triệu năng lượng Thổ.',   mul:1.9, radius:80, cost:60 },
    { id:'gale_sweep', n:'Gale Sweep', shape:'star', rank:'A', el:'thunder',d:'Luồng gió xuyên phá.',    mul:1.9, radius:80, cost:60 },
    { id:'frozen_arrow',n:'Frozen Arrow',shape:'star',rank:'A',el:'water',  d:'Phi tiêu băng giá.',      mul:1.9, radius:80, cost:60 },
    { id:'full_swing', n:'Full Swing', shape:'star', rank:'A', el:'none',   d:'Một cú vung mạnh.',       mul:2.1, radius:80, cost:60 },
    { id:'smash',      n:'Smash',      shape:'star', rank:'B', el:'none',   d:'Một cú đập.',             mul:1.3, radius:70, cost:50 },
    { id:'fire_stroke',n:'Fire Stroke',shape:'star', rank:'B', el:'fire',   d:'Ngọn lửa xuyên qua.',     mul:1.2, radius:70, cost:50 },
    { id:'ice_blast',  n:'Ice Blast',  shape:'star', rank:'B', el:'water',  d:'Quả cầu băng.',           mul:1.2, radius:70, cost:50 },
    { id:'wind_edge',  n:'Wind Edge',  shape:'star', rank:'B', el:'thunder',d:'Đòn xoáy gió.',           mul:1.2, radius:70, cost:50 },
    { id:'earth_slash',n:'Earth Slash',shape:'star', rank:'B', el:'earth',  d:'Năng lượng Thổ bùng lên.',mul:1.2, radius:70, cost:50 },

    /* ---- RECOVERY (số hồi máu là số THẬT trong wiki) ---- */
    { id:'angels_embrace', n:"Angel's Embrace", shape:'heart', rank:'SS', el:'none',
      d:'Hồi máu bản thân và đồng đội trong vòng phép, kèm bùa hồi sinh (một lần mỗi trận, sống lại 50% máu).',
      heal:1600, cost:100, revive:true },
    { id:'clara_erasmus', n:'Clara Erasmus', shape:'heart', rank:'SS', el:'none',
      d:'Hồi máu cả tổ, +300 công, +400 thủ và miễn choáng trong 30 giây.',
      heal:1400, cost:100, buff:{atk:300, def:400, antiStagger:true, ms:30000} },
    { id:'brimming_magia', n:'Brimming Magia', shape:'heart', rank:'SS', el:'none',
      d:'Hồi máu bản thân và nạp thêm một ít cho các Magi khác.', heal:1080, cost:100, magiBack:25 },
    { id:'pure_cure', n:'Pure Cure', shape:'heart', rank:'SS', el:'none',
      d:'Hồi máu cả tổ và gỡ mọi hiệu ứng bất lợi.', heal:880, cost:100, cleanse:true },
    { id:'sanctuary', n:'Sanctuary', shape:'heart', rank:'SS', el:'none',
      d:'Vòng phép hồi máu liên tục cho cả tổ.', heal:50, hot:{ticks:25, ms:600}, cost:100 },
    { id:'rejuvenation', n:'Rejuvenation', shape:'heart', rank:'S', el:'none', d:'Hồi máu mạnh.', heal:520, cost:80 },
    { id:'pure_chakras', n:'Pure Chakras', shape:'heart', rank:'S', el:'none', d:'Hồi máu cho mình và đồng đội gần.', heal:420, cost:80 },
    { id:'soothing_aura', n:'Soothing Aura', shape:'heart', rank:'A', el:'none', d:'Hồi nhiều máu.', heal:300, cost:60 },
    { id:'revitalize', n:'Revitalize', shape:'heart', rank:'A', el:'none', d:'Hồi máu dần.', heal:40, hot:{ticks:10, ms:700}, cost:60 },
    { id:'first_aid', n:'First Aid', shape:'heart', rank:'B', el:'none', d:'Hồi một phần máu.', heal:150, cost:50 },
    { id:'recover', n:'Recover', shape:'heart', rank:'B', el:'none', d:'Hồi máu và gỡ hiệu ứng bất lợi.', heal:120, cost:50, cleanse:true },

    /* ---- SUPPORT (số buff là số THẬT trong wiki) ---- */
    { id:'quad_aegis', n:'Quad Aegis', shape:'diamond', rank:'SS', el:'none',
      d:'Bốn tấm khiên quanh mình, độ bền 200% máu tối đa, miễn choáng cho tới khi khiên vỡ.',
      cost:100, shield:2.0, buff:{antiStagger:true, ms:60000} },
    { id:'vita_aegis', n:'Vita Aegis', shape:'diamond', rank:'SS', el:'none',
      d:'Hai tấm khiên bền 100% máu tối đa, hồi ngay 500 và 50 máu mỗi 2 giây trong 20 giây.',
      cost:100, shield:1.0, heal:500, hot:{ticks:10, ms:2000, amount:50}, buff:{antiStagger:true, ms:20000} },
    { id:'perendis_wrath', n:"Perendi's Wrath", shape:'diamond', rank:'SS', el:'thunder',
      d:'+180% sát thương Lôi, +800 thủ Thủy, miễn choáng trong 30 giây.',
      cost:100, buff:{edmg:{thunder:1.8}, def:800, antiStagger:true, ms:30000} },
    { id:'vulcans_fury', n:"Vulcan's Fury", shape:'diamond', rank:'SS', el:'fire',
      d:'+180% sát thương Hỏa, +800 thủ Thổ, miễn choáng trong 30 giây.',
      cost:100, buff:{edmg:{fire:1.8}, def:800, antiStagger:true, ms:30000} },
    { id:'tellus_cloak', n:'Tellus Cloak', shape:'diamond', rank:'SS', el:'earth',
      d:'+200% sát thương Thổ và miễn choáng trong 20 giây.',
      cost:100, buff:{edmg:{earth:2.0}, antiStagger:true, ms:20000} },
    { id:'undulance_cloak', n:'Undulance Cloak', shape:'diamond', rank:'SS', el:'water',
      d:'+200% sát thương Thủy và miễn choáng trong 20 giây.',
      cost:100, buff:{edmg:{water:2.0}, antiStagger:true, ms:20000} },
    { id:'survivors_grit', n:"Survivor's Grit", shape:'diamond', rank:'SS', el:'none',
      d:'Đòn thường hút 10% máu (tối đa 200/đòn), +20% sát thương đòn thường, miễn choáng 40 giây.',
      cost:100, buff:{lifesteal:0.10, lifestealCap:200, normalDmg:0.2, antiStagger:true, ms:40000} },
    { id:'thundering_hysteria', n:'Thundering Hysteria', shape:'diamond', rank:'SS', el:'thunder',
      d:'+20% tốc đánh và tốc chạy, miễn choáng, vũ khí gây tê liệt trong 30 giây.',
      cost:100, buff:{atkSpd:0.2, moveSpd:0.2, enchant:'paralysis', antiStagger:true, ms:30000} },
    { id:'mercurys_blessing', n:"Mercury's Blessing", shape:'diamond', rank:'SS', el:'none',
      d:'Né biến thành dịch chuyển tức thời, +40% tốc đánh trong 30 giây.',
      cost:100, buff:{blink:true, atkSpd:0.4, ms:30000} },
    { id:'berserk', n:'Berserk', shape:'diamond', rank:'S', el:'none', d:'Tăng công tạm thời.',
      cost:80, buff:{atkPct:0.45, ms:25000} },
    { id:'protect', n:'Protect', shape:'diamond', rank:'S', el:'none', d:'Tăng thủ tạm thời.',
      cost:80, buff:{defPct:0.5, ms:25000} },
    { id:'poison_mist', n:'Poison Mist', shape:'diamond', rank:'A', el:'earth', d:'Bẫy: sát thương Thổ và trúng độc.',
      cost:60, trap:true, mul:1.4, status:'poison' },
    { id:'thunder_bind', n:'Thunder Bind', shape:'diamond', rank:'A', el:'thunder', d:'Bẫy: sát thương Lôi và tê liệt.',
      cost:60, trap:true, mul:1.4, status:'paralysis' },
    { id:'battle_cry', n:'Battle Cry', shape:'diamond', rank:'B', el:'none', d:'Tăng công tạm thời.',
      cost:50, buff:{atkPct:0.22, ms:20000} },
    { id:'guard_aura', n:'Guard Aura', shape:'diamond', rank:'B', el:'none', d:'Tăng thủ tạm thời.',
      cost:50, buff:{defPct:0.25, ms:20000} },
    { id:'neurotoxin', n:'Neurotoxin', shape:'diamond', rank:'B', el:'none', d:'Vũ khí gây tê liệt một lúc.',
      cost:50, buff:{enchant:'paralysis', ms:20000} },

    /* ---- PASSIVE (giáp) — số là số THẬT ở max level trong wiki ---- */
    { id:'unwavering_spirit', n:'Unwavering Spirit', shape:'circle', rank:'SS', el:'none',
      d:'HP +280 và thủ vật lý +120.', pas:{hp:280, def:120} },
    { id:'champions_vigor', n:"Champion's Vigor", shape:'circle', rank:'SS', el:'none',
      d:'Công vật lý +50, thủ vật lý +40, tốc nạp Soul +10%.', pas:{atk:50, def:40, soul:0.10} },
    { id:'magic_champions_soul', n:"Magic Champion's Soul", shape:'circle', rank:'SS', el:'none',
      d:'Công vật lý +90 và tốc nạp Soul +10%.', pas:{atk:90, soul:0.10} },
    { id:'flame_incarnation', n:'Flame Incarnation', shape:'circle', rank:'SS', el:'fire',
      d:'Sát thương Hỏa của vũ khí +20% và Magi Hỏa nạp nhanh +10%.', pas:{edmg:{fire:0.20}, magiCharge:0.10} },
    { id:'water_incarnation', n:'Water Incarnation', shape:'circle', rank:'SS', el:'water',
      d:'Sát thương Thủy của vũ khí +20% và Magi Thủy nạp nhanh +10%.', pas:{edmg:{water:0.20}, magiCharge:0.10} },
    { id:'earth_incarnation', n:'Earth Incarnation', shape:'circle', rank:'SS', el:'earth',
      d:'Sát thương Thổ của vũ khí +20% và Magi Thổ nạp nhanh +10%.', pas:{edmg:{earth:0.20}, magiCharge:0.10} },
    { id:'thunder_incarnation', n:'Thunder Incarnation', shape:'circle', rank:'SS', el:'thunder',
      d:'Sát thương Lôi của vũ khí +20% và Magi Lôi nạp nhanh +10%.', pas:{edmg:{thunder:0.20}, magiCharge:0.10} },
    { id:'maniac_mark', n:'Maniac Mark', shape:'circle', rank:'SS', el:'none',
      d:'Công vật lý +90 và tốc nạp Heat +10%.', pas:{atk:90, heat:0.10} },
    { id:'hermes_blessing', n:'Hermes Blessing', shape:'circle', rank:'SS', el:'none',
      d:'HP +285 và tốc chạy +15%.', pas:{hp:285, moveSpd:0.15} },
    { id:'iron_wall_spirit', n:'Iron Wall Spirit', shape:'circle', rank:'SS', el:'none',
      d:'Thủ vật lý +200.', pas:{def:200} },
    { id:'gallant_fervor', n:'Gallant Fervor', shape:'circle', rank:'SS', el:'none',
      d:'HP +285 và công vật lý +60.', pas:{hp:285, atk:60} },
    { id:'heros_proof', n:"Hero's Proof", shape:'circle', rank:'SS', el:'none',
      d:'Công vật lý +90 và thủ vật lý +116.', pas:{atk:90, def:116} },
    { id:'heros_talent', n:"Hero's Talent", shape:'circle', rank:'S', el:'none',
      d:'Công +60 và thủ +65.', pas:{atk:60, def:65} },
    { id:'iron_mastery', n:'Iron Mastery', shape:'circle', rank:'S', el:'none', d:'Công +87.', pas:{atk:87} },
    { id:'iron_wall_mastery', n:'Iron Wall Mastery', shape:'circle', rank:'S', el:'none', d:'Thủ +83.', pas:{def:83} },
    { id:'sword_craft', n:'Sword Craft', shape:'circle', rank:'A', el:'none', d:'Công Kiếm & Khiên +85.', pas:{watk:{sword:85}} },
    { id:'great_sword_craft', n:'Great Sword Craft', shape:'circle', rank:'A', el:'none', d:'Công Đại Kiếm +85.', pas:{watk:{great:85}} },
    { id:'spear_craft', n:'Spear Craft', shape:'circle', rank:'A', el:'none', d:'Công Thương +85.', pas:{watk:{spear:85}} },
    { id:'dual_blades_craft', n:'Dual Blades Craft', shape:'circle', rank:'A', el:'none', d:'Công Song Kiếm +85.', pas:{watk:{dual:85}} },
    { id:'bow_craft', n:'Bow Craft', shape:'circle', rank:'A', el:'none', d:'Công Cung +85.', pas:{watk:{bow:85}} },
    { id:'vitalitys_boon', n:"Vitality's Boon", shape:'circle', rank:'A', el:'none', d:'HP tối đa +186.', pas:{hp:186} },
    { id:'crushing_mastery', n:'Crushing Mastery', shape:'circle', rank:'B', el:'none', d:'Công +45.', pas:{atk:45} },
    { id:'guardian_mastery', n:'Guardian Mastery', shape:'circle', rank:'B', el:'none', d:'Thủ +44.', pas:{def:44} },
    { id:'vitalitys_joy', n:"Vitality's Joy", shape:'circle', rank:'B', el:'none', d:'HP tối đa +137.', pas:{hp:137} },
    { id:'auto_heal', n:'Auto-Heal', shape:'circle', rank:'B', el:'none', d:'Hồi máu nhanh hơn.', pas:{regen:0.4} }
  ];
  G.MAGI_SHAPES = {
    star:    { vi: 'Công kích', slot: 'weapon', color: '#ff9a4a', sym: '★' },
    heart:   { vi: 'Hồi phục',  slot: 'weapon', color: '#ff6a8a', sym: '♥' },
    diamond: { vi: 'Hỗ trợ',    slot: 'weapon', color: '#7fd4ff', sym: '◆' },
    circle:  { vi: 'Bị động',   slot: 'armor',  color: '#c0a8ff', sym: '●' }
  };

  /* ------------------------------------------------------- NGUYÊN LIỆU ---- */
  // Sáu hạng SS/S/A/B/C/D + nhóm Lapis riêng. Tên lấy từ wiki.
  G.MATERIALS = {
    // D — rơi nhiều nhất
    jelly_dew:      { n:'Jelly Dew',        r:'D', tribe:'purun'  },
    vacca_horns:    { n:'Vacca Horns',      r:'D', tribe:'vacca'  },
    froggo_oil:     { n:'Froggo Oil',       r:'D', tribe:'geguri' },
    bat_wing:       { n:'Bat Wing',         r:'D', tribe:'bat'    },
    galena_feather: { n:'Galena Feather',   r:'D', tribe:'galena' },
    fungo_cap:      { n:'Fungo Cap',        r:'D', tribe:'fungo'  },
    // C
    gummy:          { n:'Gummy',            r:'C', tribe:'purun'  },
    cow_hoof:       { n:'Wild Cow Hoof',    r:'C', tribe:'vacca'  },
    frog_adhesive:  { n:'Frog Adhesive',    r:'C', tribe:'geguri' },
    bat_fang:       { n:"Bat's Bloody Fang",r:'C', tribe:'bat'    },
    galena_beak:    { n:'Galena Beak',      r:'C', tribe:'galena' },
    fungolise:      { n:'Fungolise',        r:'C', tribe:'fungo'  },
    // B
    jelly_core:     { n:'Jelly Core',       r:'B', tribe:'purun'  },
    vacca_meat:     { n:'Vacca Meat',       r:'B', tribe:'vacca'  },
    froggo_eye:     { n:'Froggo Eye',       r:'B', tribe:'geguri' },
    bat_ears:       { n:'Bat Ears',         r:'B', tribe:'bat'    },
    galena_heart:   { n:'Galena Heart',     r:'B', tribe:'galena' },
    variant_fungolise:{n:'Variant Fungolise',r:'B',tribe:'fungo'  },
    hq_jelly_core:  { n:'High-Quality Jelly Core', r:'B', tribe:'purun', hq:true },
    hq_vacca_meat:  { n:'High-Quality Vacca Meat', r:'B', tribe:'vacca', hq:true },
    hq_froggo_eye:  { n:'High-Quality Froggo Eye', r:'B', tribe:'geguri', hq:true },
    giant_bat_ear:  { n:'Giant Bat Ear',    r:'B', tribe:'bat',    hq:true },
    galena_egg:     { n:'Galena Egg',       r:'B', tribe:'galena', hq:true },
    // A / S / SS — nguyên liệu boss
    stone_dragon_claw: { n:'Stone Dragon Claw', r:'A' },
    frozen_tail:       { n:'Frozen Dragon Frozen Tail', r:'A' },
    monster_claw:      { n:'Mouse Monster Claw', r:'A' },
    ice_core:          { n:'Frozen Dragon Ice Core', r:'S' },
    grouton_core:      { n:'Grouton Core',      r:'S' },
    vaccahorn_horn:    { n:'Vaccahorn Horn',    r:'S' },
    frogrid_tongue:    { n:'Large Frogrid Tongue', r:'S' },
    galidon_heart:     { n:'Galidon Heart',     r:'S' },
    dofungo_sporecap:  { n:'Giant Dofungo Sporecap', r:'S' },
    // Lapis (dùng cho Limit Break) + Crystal (dùng cho Evolve)
    lapis_b: { n:'Lapis B', r:'Lapis' }, lapis_a: { n:'Lapis A', r:'Lapis' },
    lapis_s: { n:'Lapis S', r:'Lapis' }, lapis_ss:{ n:'Lapis SS',r:'Lapis' },
    crystal: { n:'Equipment Crystal', r:'S' },
    magi_frag:{n:'Magi Fragment', r:'B' },
    str_stone:{n:'Strengthening Stone', r:'B' }
  };
  G.RANK_ORDER = ['D', 'C', 'B', 'A', 'S', 'SS'];
  G.RANK_COLOR = { D:'#8fa3b5', C:'#7fd07f', B:'#5b8fd6', A:'#b06fd0', S:'#f2a03c', SS:'#f2d24b', Lapis:'#7fe3f0' };

  /* --------------------------------------------------- TỘC QUÁI THƯỜNG ---- */
  // Sáu tộc trong How-to-Play guide. shape dùng để vẽ bằng code.
  G.TRIBES = {
    purun:  { vi:'Purun',  en:'Jelly',  shape:'blob',  r:15, hp:1.0, atk:0.9, spd:0.55, mat:['jelly_dew','gummy','jelly_core','hq_jelly_core'] },
    vacca:  { vi:'Vacca',  en:'Vacca',  shape:'bull',  r:19, hp:1.6, atk:1.3, spd:0.75, mat:['vacca_horns','cow_hoof','vacca_meat','hq_vacca_meat'], charger:true },
    geguri: { vi:'Geguri', en:'Froggo', shape:'frog',  r:16, hp:1.2, atk:1.0, spd:0.70, mat:['froggo_oil','frog_adhesive','froggo_eye','hq_froggo_eye'], hopper:true },
    bat:    { vi:'Bat',    en:'Bat',    shape:'bat',   r:13, hp:0.8, atk:1.0, spd:1.15, mat:['bat_wing','bat_fang','bat_ears','giant_bat_ear'], flyer:true },
    galena: { vi:'Galena', en:'Galena', shape:'bird',  r:17, hp:1.1, atk:1.15,spd:0.95, mat:['galena_feather','galena_beak','galena_heart','galena_egg'] },
    fungo:  { vi:'Fungo',  en:'Fungo',  shape:'shroom',r:18, hp:1.9, atk:1.1, spd:0.40, mat:['fungo_cap','fungolise','variant_fungolise','variant_fungolise'], poisoner:true }
  };
  // Tiền tố biến thể theo hệ (wiki: Heat/Aqua/Thunder-Elec/Mad + bản thường)
  G.MOB_VARIANTS = [
    { pre:'',        el:'none'    },
    { pre:'Heat ',   el:'fire'    },
    { pre:'Aqua ',   el:'water'   },
    { pre:'Thunder ',el:'thunder' },
    { pre:'Mad ',    el:'earth'   }
  ];
  // Tỉ lệ rơi THẬT từ trang Small monsters.
  G.DROP_NORMAL = { D:0.2495, C:0.0295, B:0.0770, hq:0.0145, boss:0.0032 };
  G.DROP_ELITE  = { D:0.2844, C:0.1999, B:0.2495, hq:0.1603, boss:0.1059 };
  G.DROP_GOLD   = { D:0.2795, C:0.2020, B:0.2495, hq:0.1620, boss:0.1070 };

  /* -------------------------------------------------------- BEHEMOTHS ----- */
  // Tên/hạng/vũ khí/loại/hệ lấy NGUYÊN VĂN từ các trang SS/S/A/B Behemoths.
  // hp/atk/size/parts/pattern là TÁI DỰNG.
  // body: hình dáng vẽ bằng code. parts: bộ phận phá được, wp: điểm yếu.
  function bh(id, n, rank, weapon, type, el, body, o) {
    return Object.assign({ id, n, rank, weapon, type, el, body }, o);
  }
  G.BEHEMOTHS = [
    /* ---- B rank: gặp ngoài field từ sớm ---- */
    bh('grouton','Igni Grouton','B','spear','normal','fire','blob',
      { hp:2600, atk:26, r:44, spd:0.55, parts:['Nhân','Vỏ'], wp:['Nhân'], patterns:['slam','bounce','spit'] }),
    bh('vaccahorn','Igni Vaccahorn','B','great','normal','fire','bull',
      { hp:3000, atk:32, r:46, spd:0.8, parts:['Sừng','Chân sau'], wp:['Sừng'], patterns:['charge','stomp','sweep'] }),
    bh('frogrid','Gaia Frogrid','B','sword','normal','earth','frog',
      { hp:2800, atk:28, r:45, spd:0.7, parts:['Lưỡi','Đùi'], wp:['Lưỡi'], patterns:['tongue','hop','slam'] }),
    bh('dofungos','Water Dofungos','B','dual','normal','water','shroom',
      { hp:3400, atk:24, r:48, spd:0.35, parts:['Mũ nấm','Rễ'], wp:['Mũ nấm'], patterns:['spore','slam','ring'] }),
    bh('galidon','Thunder Galidon','B','bow','normal','thunder','bird',
      { hp:2500, atk:30, r:43, spd:1.0, parts:['Cánh','Mỏ'], wp:['Cánh'], patterns:['dive','peck','ring'] }),
    bh('dodonki','Dodonki','B','dual','normal','earth','ape',
      { hp:2900, atk:31, r:45, spd:0.9, parts:['Nắm đấm','Đuôi'], wp:['Đầu'], patterns:['charge','slam','sweep'] }),
    bh('mumu','Mu Mu','B','sword','normal','water','fluff',
      { hp:2700, atk:27, r:44, spd:0.8, parts:['Sừng cuộn','Đuôi'], wp:['Sừng cuộn'], patterns:['bounce','charge','ring'] }),
    bh('winvlum','Winvlum','B','bow','normal','thunder','bat',
      { hp:2400, atk:29, r:42, spd:1.1, parts:['Cánh','Tai'], wp:['Tai'], patterns:['dive','sonic','ring'] }),

    /* ---- A rank ---- */
    bh('landaronba','Landaronba','A','great','normal','none','drake',
      { hp:7200, atk:44, r:56, spd:0.7, parts:['Đầu','Đuôi','Chi trước'], wp:['Đầu'], patterns:['breath','charge','slam','sweep'] }),
    bh('barenga','Barenga','A','spear','normal','earth','beast',
      { hp:6800, atk:46, r:54, spd:0.85, parts:['Sừng','Chân trước'], wp:['Sừng'], patterns:['charge','stomp','ring'] }),
    bh('boldon','Boldon','A','sword','normal','fire','golem',
      { hp:8000, atk:42, r:58, spd:0.5, parts:['Vai','Cánh tay'], wp:['Lõi ngực'], patterns:['slam','ring','sweep'] }),
    bh('kolun','Kolun','A','dual','normal','water','serpent',
      { hp:6600, atk:45, r:52, spd:1.0, parts:['Đầu','Đuôi'], wp:['Đầu'], patterns:['lash','charge','breath'] }),
    bh('sentry','Sentry Guardian','A','bow','normal','thunder','golem',
      { hp:7600, atk:47, r:56, spd:0.55, parts:['Mắt','Tay súng'], wp:['Mắt'], patterns:['beam','ring','slam'] }),
    bh('decoromea','Decoromea','A','bow','heat','light','bird',
      { hp:6900, atk:48, r:53, spd:1.05, parts:['Cánh','Đuôi'], wp:['Ngực'], patterns:['dive','feather','ring'] }),
    bh('rudolmea','Rudolmea','A','spear','heat','fire','beast',
      { hp:7100, atk:49, r:55, spd:0.9, parts:['Gạc','Móng'], wp:['Gạc'], patterns:['charge','breath','stomp'] }),
    bh('crowsol','Crowsol','A','dual','heat','dark','bird',
      { hp:6700, atk:50, r:52, spd:1.1, parts:['Cánh','Vuốt'], wp:['Đầu'], patterns:['dive','feather','sweep'] }),
    bh('glitch','Glitch','A','great','soul','dark','golem',
      { hp:8400, atk:52, r:58, spd:0.6, parts:['Lõi','Tay'], wp:['Lõi'], patterns:['beam','slam','ring'] }),
    bh('elgado','Elgado','A','sword','heat','earth','beast',
      { hp:7800, atk:47, r:56, spd:0.75, parts:['Mai','Đầu'], wp:['Đầu'], patterns:['charge','ring','stomp'] }),
    bh('kyulmar','Kyulmar','A','spear','normal','water','serpent',
      { hp:7000, atk:48, r:54, spd:0.95, parts:['Vây','Đuôi'], wp:['Mang'], patterns:['breath','lash','charge'] }),
    bh('yeban','Yeban','A','bow','soul','dark','drake',
      { hp:7400, atk:51, r:55, spd:0.85, parts:['Cánh','Đầu'], wp:['Cổ'], patterns:['breath','dive','ring'] }),
    bh('shurak','Shurak','A','dual','normal','thunder','beast',
      { hp:6800, atk:50, r:53, spd:1.15, parts:['Vuốt','Đuôi'], wp:['Lưng'], patterns:['charge','sweep','lash'] }),
    bh('undoun','Undoun','A','great','heat','earth','golem',
      { hp:8600, atk:53, r:60, spd:0.5, parts:['Búa','Vai'], wp:['Đầu'], patterns:['slam','ring','stomp'] }),
    bh('sarvin','Sarvin','A','sword','soul','light','beast',
      { hp:7300, atk:49, r:55, spd:0.9, parts:['Bờm','Chân'], wp:['Ngực'], patterns:['charge','ring','sweep'] }),
    bh('gawen','Gawen','A','spear','heat','fire','drake',
      { hp:7700, atk:52, r:57, spd:0.8, parts:['Sừng','Đuôi'], wp:['Họng'], patterns:['breath','charge','slam'] }),
    bh('jild','Jild','A','bow','normal','water','serpent',
      { hp:7000, atk:48, r:54, spd:1.0, parts:['Đầu','Vây'], wp:['Mắt'], patterns:['breath','lash','ring'] }),

    /* ---- S rank ---- */
    bh('musashi','Matchless Musashi','S','sword','heat','fire','samurai',
      { hp:15000, atk:70, r:52, spd:1.15, parts:['Kiếm','Mũ giáp'], wp:['Mũ giáp'], patterns:['dash_slash','sweep','ring','charge'] }),
    bh('veiltail','Rapid Veiltail','S','great','normal','water','serpent',
      { hp:16000, atk:68, r:60, spd:1.0, parts:['Vây đuôi','Đầu'], wp:['Mang'], patterns:['breath','lash','charge','ring'] }),
    bh('archelon','Menacing Archelon','S','bow','heat','earth','turtle',
      { hp:19000, atk:64, r:66, spd:0.45, parts:['Mai','Đầu','Chân'], wp:['Đầu'], patterns:['spin','slam','ring','stomp'] }),
    bh('stratoplume','Stratoplume','S','sword','heat','water','bird',
      { hp:15500, atk:71, r:58, spd:1.2, parts:['Cánh','Đuôi'], wp:['Ngực'], patterns:['dive','feather','ring','breath'] }),
    bh('mawahi','Dire Mawahi','S','sword','heat','thunder','beast',
      { hp:16500, atk:73, r:56, spd:1.15, parts:['Nanh','Vuốt','Đuôi'], wp:['Nanh'], patterns:['charge','sweep','lash','ring'] }),
    bh('wukong','Ascetic Wukong','S','spear','heat','fire','ape',
      { hp:16800, atk:74, r:57, spd:1.25, parts:['Gậy','Đuôi'], wp:['Đầu'], patterns:['dash_slash','sweep','slam','ring'] }),
    bh('evataurus','Evataurus','S','great','heat','fire','bull',
      { hp:18000, atk:76, r:62, spd:0.95, parts:['Sừng','Vai'], wp:['Sừng'], patterns:['charge','stomp','ring','breath'] }),
    bh('elgordan','Elgordan','S','sword','heat','earth','golem',
      { hp:19500, atk:70, r:64, spd:0.6, parts:['Khiên','Lõi'], wp:['Lõi'], patterns:['slam','ring','beam','stomp'] }),
    bh('arion','Blade Arion','S','dual','heat','earth','beast',
      { hp:16200, atk:75, r:56, spd:1.3, parts:['Lưỡi cánh','Móng'], wp:['Cổ'], patterns:['dash_slash','sweep','charge','lash'] }),
    bh('phoelix','Aura Phoelix','S','spear','heat','water','bird',
      { hp:17000, atk:72, r:59, spd:1.1, parts:['Cánh','Mào'], wp:['Mào'], patterns:['dive','feather','breath','ring'] }),
    bh('ulkatron','Ulkatron','S','dual','heat','thunder','golem',
      { hp:18500, atk:77, r:62, spd:0.85, parts:['Lõi','Càng'], wp:['Lõi'], patterns:['beam','ring','dash_slash','slam'] }),

    /* ---- SS rank ---- */
    bh('amarok','Cocytus Amarok','SS','sword','normal','water','drake',
      { hp:34000, atk:96, r:64, spd:1.05, parts:['Cánh băng','Đuôi','Đầu'], wp:['Đầu'],
        patterns:['breath','dive','ring','charge','slam'], ability:'Máu ≥ 80% → sát thương Thủy +30%, tốc đánh +15%' }),
    bh('lich','Lord Lich','SS','great','heat','earth','lich',
      { hp:36000, atk:99, r:62, spd:0.8, parts:['Vương miện','Trượng'], wp:['Vương miện'],
        patterns:['beam','ring','summon','slam','breath'] }),
    bh('carniva','Blaze Carniva','SS','bow','heat','fire','plant',
      { hp:38000, atk:94, r:70, spd:0.5, parts:['Nụ','Dây leo','Rễ'], wp:['Nụ'],
        patterns:['lash','ring','spore','breath','slam'] }),
    bh('ayame','Grinning Ayame','SS','sword','soul','fire','samurai',
      { hp:35000, atk:104, r:58, spd:1.3, parts:['Mặt nạ','Kiếm'], wp:['Mặt nạ'],
        patterns:['dash_slash','sweep','ring','charge','summon'] }),
    bh('zylant','Risen Zylant','SS','great','heat','water','knight',
      { hp:39000, atk:101, r:64, spd:0.9, parts:['Giáp ngực','Đại kiếm'], wp:['Giáp ngực'],
        patterns:['slam','sweep','charge','ring','beam'] }),
    bh('magna','Riotous Magna','SS','spear','heat','earth','golem',
      { hp:42000, atk:98, r:72, spd:0.55, parts:['Vai','Lõi','Nắm đấm'], wp:['Lõi'],
        patterns:['slam','ring','stomp','beam','charge'] }),
    bh('tzaran','Ascended Tzaran','SS','dual','soul','thunder','beast',
      { hp:35500, atk:107, r:60, spd:1.35, parts:['Vuốt','Đuôi','Bờm'], wp:['Bờm'],
        patterns:['dash_slash','lash','charge','ring','sweep'] }),
    bh('lunathalmus','Lunathalmus','SS','spear','heat','thunder','serpent',
      { hp:40000, atk:100, r:68, spd:1.0, parts:['Đầu','Thân','Đuôi'], wp:['Đầu'],
        patterns:['breath','lash','ring','charge','beam'] }),
    bh('anubis','Xana Anubis','SS','bow','heat','water','anubis',
      { hp:37000, atk:103, r:62, spd:1.1, parts:['Quyền trượng','Đầu'], wp:['Đầu'],
        patterns:['beam','summon','ring','dash_slash','breath'] }),
    bh('azdaja','Wretched Azdaja','SS','sword','heat','earth','drake',
      { hp:41000, atk:102, r:70, spd:0.95, parts:['Ba đầu','Cánh','Đuôi'], wp:['Ba đầu'],
        patterns:['breath','sweep','charge','ring','slam'] }),
    bh('gorynych','Fiery Gorynych','SS','spear','heat','fire','drake',
      { hp:40500, atk:105, r:70, spd:1.0, parts:['Đầu trái','Đầu phải','Đuôi'], wp:['Đầu giữa'],
        patterns:['breath','dive','ring','charge','sweep'] }),
    bh('infinaruva','Infinaruva','SS','sword','heat','fire','phoenix',
      { hp:38500, atk:106, r:66, spd:1.2, parts:['Cánh lửa','Mào'], wp:['Ngực'],
        patterns:['dive','feather','breath','ring','charge'] }),
    bh('abaia','Lightning Abaia','SS','sword','heat','thunder','serpent',
      { hp:39500, atk:104, r:68, spd:1.05, parts:['Đầu','Vây','Đuôi'], wp:['Mang'],
        patterns:['breath','lash','beam','ring','charge'] }),
    bh('galdrux','Galdrux','SS','great','heat','thunder','golem',
      { hp:44000, atk:100, r:74, spd:0.5, parts:['Lõi','Vai','Chân'], wp:['Lõi'],
        patterns:['beam','slam','ring','stomp','summon'] }),
    bh('yggdragis','Yggdragis','SS','bow','normal','fire','plant',
      { hp:43000, atk:97, r:76, spd:0.4, parts:['Thân cây','Cành','Rễ'], wp:['Mắt cây'],
        patterns:['lash','ring','spore','slam','summon'] }),
    bh('pandemonius','Pandemonius','SS','dual','normal','thunder','demon',
      { hp:37500, atk:108, r:62, spd:1.4, parts:['Sừng','Cánh','Vuốt'], wp:['Sừng'],
        patterns:['dash_slash','sweep','charge','ring','beam'] }),
    bh('felnarog','Deus Felnarog','SS','sword','normal','fire','drake',
      { hp:45000, atk:110, r:78, spd:0.9, parts:['Đầu','Cánh','Đuôi'], wp:['Họng'],
        patterns:['breath','dive','ring','charge','slam','sweep'] }),
    bh('gigantor','Gigantor','SS','bow','normal','water','golem',
      { hp:46000, atk:99, r:80, spd:0.45, parts:['Đầu','Vai','Nắm đấm'], wp:['Lõi ngực'],
        patterns:['slam','stomp','ring','beam','summon'] }),
    bh('ciel','Alabaster Ciel','SS','bow','soul','light','angel',
      { hp:40000, atk:109, r:64, spd:1.25, parts:['Cánh','Vòng hào quang'], wp:['Ngực'],
        patterns:['feather','beam','ring','dive','breath'] }),
    bh('necroth','Void Necroth','SS','spear','soul','dark','lich',
      { hp:42500, atk:112, r:68, spd:1.0, parts:['Lưỡi hái','Mũ trùm'], wp:['Mũ trùm'],
        patterns:['dash_slash','summon','beam','ring','sweep'] })
  ];
  // Tỉ lệ gacha boss THẬT (wiki): SS 3% · S 15% · A 55% · B 27%.
  G.BEHEMOTH_RATES = { SS: 0.03, S: 0.15, A: 0.55, B: 0.27 };

  /* ------------------------------------------------------ MẪU ĐÒN BOSS ---- */
  // telegraph: kiểu vùng báo đỏ. windup/active/recover tính bằng ms. [TÁI DỰNG]
  G.PATTERNS = {
    charge:     { vi:'Húc',         tel:'line',   windup:800,  active:520, recover:600,  range:340, w:56,  dmg:1.0, move:true },
    slam:       { vi:'Đập đất',     tel:'circle', windup:750,  active:220, recover:520,  radius:110, dmg:1.25 },
    stomp:      { vi:'Giẫm',        tel:'circle', windup:600,  active:180, recover:400,  radius:82,  dmg:0.9 },
    sweep:      { vi:'Quét ngang',  tel:'cone',   windup:650,  active:260, recover:480,  range:160, arc:2.1, dmg:1.1 },
    ring:       { vi:'Sóng xung',   tel:'ring',   windup:1000, active:420, recover:620,  radius:230, dmg:1.15 },
    breath:     { vi:'Phun hơi',    tel:'cone',   windup:900,  active:700, recover:700,  range:260, arc:0.9, dmg:0.55, tick:true, status:true },
    beam:       { vi:'Tia năng lượng', tel:'line', windup:1050, active:600, recover:700, range:420, w:38, dmg:0.7, tick:true },
    dive:       { vi:'Bổ nhào',     tel:'circle', windup:850,  active:280, recover:560,  radius:96,  dmg:1.3, move:true },
    lash:       { vi:'Quật đuôi',   tel:'cone',   windup:600,  active:240, recover:440,  range:190, arc:1.4, dmg:1.05 },
    tongue:     { vi:'Phóng lưỡi',  tel:'line',   windup:700,  active:300, recover:500,  range:280, w:30,  dmg:0.95 },
    peck:       { vi:'Mổ',          tel:'circle', windup:450,  active:160, recover:340,  radius:56,  dmg:0.8 },
    hop:        { vi:'Nhảy đè',     tel:'circle', windup:700,  active:220, recover:480,  radius:88,  dmg:1.0, move:true },
    bounce:     { vi:'Nảy',         tel:'circle', windup:550,  active:200, recover:420,  radius:78,  dmg:0.85, move:true },
    spit:       { vi:'Nhổ dịch',    tel:'circle', windup:650,  active:200, recover:450,  radius:70,  dmg:0.75, proj:true },
    spore:      { vi:'Phát tán bào tử', tel:'ring', windup:900, active:520, recover:640, radius:200, dmg:0.6, status:'poison' },
    feather:    { vi:'Mưa lông vũ', tel:'multi',  windup:800,  active:900, recover:600,  radius:64,  dmg:0.65, count:6 },
    sonic:      { vi:'Sóng âm',     tel:'ring',   windup:750,  active:360, recover:520,  radius:180, dmg:0.8 },
    spin:       { vi:'Xoay mai',    tel:'ring',   windup:800,  active:1400, recover:700, radius:150, dmg:0.5, tick:true, move:true },
    dash_slash: { vi:'Lướt chém',   tel:'line',   windup:520,  active:300, recover:420,  range:300, w:44, dmg:1.2, move:true },
    summon:     { vi:'Gọi tay sai', tel:'none',   windup:1100, active:200, recover:800,  dmg:0, summon:3 }
  };

  /* ----------------------------------------------------------- BẢN ĐỒ ---- */
  // Tên vùng và khoảng level lấy từ trang Map. Mỗi vùng có các map con thật.
  G.AREAS = [
    { id:'tior', n:'Tior Fields', vi:'Đồng Tior', lv:[1,21], bg:'grass',
      maps:[
        { n:'Doras Plains - South', tribes:['purun'], lv:1, kills:6 },
        { n:'Doras Plains - West',  tribes:['purun','geguri'], lv:2, kills:8 },
        { n:'Doras Plains - North', tribes:['purun','vacca'], lv:3, kills:8 },
        { n:'Doras Plains - East',  tribes:['vacca'], lv:4, kills:9 },
        { n:'Cray Forest - West',   tribes:['purun','geguri'], lv:5, kills:10 },
        { n:'Cray Forest - East',   tribes:['geguri','vacca'], lv:6, kills:10 },
        { n:'Tarbes Ruins',         tribes:['purun'], lv:7, kills:11 }
      ],
      sudden:['grouton','vaccahorn','frogrid','galidon','mumu','dodonki'], rare:['landaronba'] },
    { id:'rakshard', n:'Rakshard Badlands', vi:'Hoang Địa Rakshard', lv:[5,28], bg:'desert',
      maps:[
        { n:'Twin Leaves Forest',   tribes:['galena','purun'], lv:8, kills:10 },
        { n:'Kakara Desert - South',tribes:['galena','purun'], lv:10, kills:11 },
        { n:'Kakara Desert - West', tribes:['bat','galena'], lv:12, kills:12 },
        { n:'Kakara Desert - East', tribes:['bat','vacca'], lv:13, kills:12 },
        { n:'Khabar Cavern - West', tribes:['bat','geguri'], lv:15, kills:13 },
        { n:'Khabar Cavern - East', tribes:['bat','geguri','purun'], lv:16, kills:13 },
        { n:'Khabar Cavern - Central', tribes:['bat'], lv:18, kills:14 }
      ],
      sudden:['dofungos','dodonki','winvlum','frogrid','grouton','vaccahorn'], rare:['sentry','boldon'] },
    { id:'torerno', n:'Torerno Tropics', vi:'Nhiệt Đới Torerno', lv:[10,32], bg:'jungle',
      maps:[
        { n:'Trye Plains',          tribes:['purun','vacca'], lv:20, kills:12 },
        { n:'Nokemo Cavern - East', tribes:['bat','vacca'], lv:21, kills:13 },
        { n:'Nokemo Cavern - South',tribes:['bat'], lv:22, kills:13 },
        { n:'Nokemo Cavern - West', tribes:['bat','vacca'], lv:23, kills:14 },
        { n:'Tunec Desert - North', tribes:['galena'], lv:24, kills:14 },
        { n:'Tunec Desert - East',  tribes:['galena','vacca'], lv:25, kills:15 },
        { n:'Trye Snowfield',       tribes:['purun','geguri'], lv:26, kills:15 }
      ],
      sudden:['vaccahorn','winvlum','frogrid','grouton','galidon','dofungos'], rare:['kolun','barenga'] },
    { id:'sutherland', n:'Sutherland Mountains', vi:'Núi Sutherland', lv:[14,30], bg:'snow',
      maps:[
        { n:'Sutherland Snowfield - South', tribes:['galena','bat'], lv:27, kills:14 },
        { n:'Sutherland Snowfield - West',  tribes:['galena','bat'], lv:28, kills:15 },
        { n:'Sutherland Snowfield - East',  tribes:['bat'], lv:29, kills:15 },
        { n:'Sutherland Snowfield - North', tribes:['fungo'], lv:30, kills:16 },
        { n:'Fu Fu Snowfield',              tribes:['fungo','purun'], lv:32, kills:16 }
      ],
      sudden:['vaccahorn','mumu','frogrid','dofungos'], rare:['glitch','undoun'] },
    { id:'kouglorz', n:'Kouglorz Forest', vi:'Rừng Kouglorz', lv:[24,40], bg:'jungle',
      maps:[
        { n:'Kouglorz Woods - South', tribes:['geguri','fungo'], lv:34, kills:15 },
        { n:'Kouglorz Woods - Deep',  tribes:['fungo','purun'], lv:36, kills:16 },
        { n:'Gold Plains',            tribes:['purun'], lv:38, kills:14, gold:true }
      ],
      sudden:['frogrid','dofungos','grouton'], rare:['rudolmea','crowsol','sarvin'] },
    { id:'borda', n:'Borda Ruins', vi:'Phế Tích Borda', lv:[30,48], bg:'ruins',
      maps:[
        { n:'Borda Ruins - Gate',   tribes:['bat','fungo'], lv:40, kills:16 },
        { n:'Borda Ruins - Hall',   tribes:['bat','galena'], lv:42, kills:17 },
        { n:'Tobock Plains',        tribes:['vacca','galena'], lv:44, kills:17 }
      ],
      sudden:['vaccahorn','winvlum','galidon'], rare:['elgado','kyulmar','yeban'] },
    { id:'torv', n:'Torv Desert', vi:'Sa Mạc Torv', lv:[38,56], bg:'desert',
      maps:[
        { n:'Torv Desert - Dunes',  tribes:['galena','bat'], lv:46, kills:17 },
        { n:'Torv Desert - Basin',  tribes:['vacca','galena'], lv:48, kills:18 },
        { n:'Durandal Volcano',     tribes:['fungo','vacca'], lv:50, kills:18 }
      ],
      sudden:['dodonki','dofungos','vaccahorn'], rare:['shurak','gawen','jild'] },
    { id:'kirva', n:'Ancient Kirva Territory', vi:'Cổ Địa Kirva', lv:[46,70], bg:'ruins',
      maps:[
        { n:'Kirva Woods',          tribes:['fungo','geguri'], lv:52, kills:18 },
        { n:'Gogg Castle - Entrance', tribes:['bat','galena'], lv:56, kills:19 },
        { n:'Gogg Castle - Throne', tribes:['bat','fungo','galena'], lv:60, kills:20 }
      ],
      sudden:['winvlum','dodonki','galidon'], rare:['musashi','veiltail','archelon'] }
  ];

  /* ---------------------------------------------------- NHIỆM VỤ STORY ---- */
  // Tên nguyên văn từ trang Story Quests (Area 1). Từ Area 2 trở đi wiki bỏ trống,
  // nên phần sau là tái dựng theo đúng khuôn của game.
  G.STORY = [
    { id:'s1',  area:'tior', n:"I'm In A Hurry!",        vi:'Vội Quá Đi!',            goal:{kill:6},                    rw:{exp:30, gold:400, gem:3} },
    { id:'s2',  area:'tior', n:'Find Froggo Skin!',      vi:'Tìm Da Froggo!',         goal:{mat:'froggo_oil', n:3},     rw:{exp:35, gold:500, gem:3} },
    { id:'s3',  area:'tior', n:'Medicinal Use of Jelly', vi:'Thạch Làm Thuốc',        goal:{mat:'jelly_dew', n:4},      rw:{exp:35, gold:500, ticket:5} },
    { id:'s4',  area:'tior', n:'Earthen Horns, Please',  vi:'Cho Xin Cặp Sừng Đất',   goal:{mat:'vacca_horns', n:4},    rw:{exp:40, gold:600, gem:3} },
    { id:'s5',  area:'tior', n:'Defeat the Behemoth!',   vi:'Hạ Gục Behemoth!',       goal:{boss:1},                    rw:{exp:60, gold:900, gem:5, ticket:5} },
    { id:'s6',  area:'tior', n:'Mission From Sylvie',    vi:'Việc Sylvie Nhờ',        goal:{kill:14},                   rw:{exp:50, gold:800, gem:3} },
    { id:'s7',  area:'tior', n:'Froggo Hate',            vi:'Ghét Froggo',            goal:{mat:'froggo_eye', n:2},     rw:{exp:55, gold:900, gem:4} },
    { id:'s8',  area:'tior', n:"Axel's Hunting Mission", vi:'Chuyến Săn Của Axel',    goal:{boss:2},                    rw:{exp:80, gold:1400, gem:5, ticket:5} },
    { id:'s9',  area:'tior', n:'Protect the Carriage',   vi:'Bảo Vệ Đoàn Xe',         goal:{kill:20},                   rw:{exp:70, gold:1200, gem:4} },
    { id:'s10', area:'tior', n:'Defeat a Winvlum!',      vi:'Hạ Một Con Winvlum!',    goal:{bossId:'winvlum'},          rw:{exp:120, gold:2000, gem:8, ticket:10} },
    { id:'s11', area:'rakshard', n:'The Mysterious Bird',vi:'Con Chim Bí Ẩn',         goal:{mat:'galena_feather', n:5}, rw:{exp:90, gold:1600, gem:4} },
    { id:'s12', area:'rakshard', n:'Stiff Shoulders',    vi:'Mỏi Vai',                goal:{kill:22},                   rw:{exp:95, gold:1700, gem:4} },
    { id:'s13', area:'rakshard', n:'Sandstorm Pterosaur',vi:'Dực Long Bão Cát',       goal:{boss:3},                    rw:{exp:140, gold:2600, gem:6, ticket:10} },
    { id:'s14', area:'torerno', n:'Off to Torerno',      vi:'Lên Đường Tới Torerno',  goal:{kill:24},                   rw:{exp:150, gold:2800, gem:5} },
    { id:'s15', area:'torerno', n:'Payment in Bat Wings',vi:'Trả Bằng Cánh Dơi',      goal:{mat:'bat_wing', n:8},       rw:{exp:160, gold:3000, gem:5} },
    { id:'s16', area:'torerno', n:'Strange Dodonki',     vi:'Dodonki Kỳ Lạ',          goal:{bossId:'dodonki'},          rw:{exp:220, gold:4200, gem:10, ticket:10} },
    { id:'s17', area:'sutherland', n:'Bats in the Snow', vi:'Dơi Trong Tuyết',        goal:{mat:'bat_ears', n:4},       rw:{exp:200, gold:4000, gem:6} },
    { id:'s18', area:'sutherland', n:'The Strange Snowbird', vi:'Chim Tuyết Kỳ Dị',   goal:{boss:4},                    rw:{exp:240, gold:4600, gem:8} },
    { id:'s19', area:'sutherland', n:'Fluffy Monsters',  vi:'Đám Quái Lông Xù',       goal:{mat:'fungo_cap', n:6},      rw:{exp:250, gold:4800, gem:6, ticket:10} },
    { id:'s20', area:'kouglorz', n:'Red Froggo',         vi:'Froggo Đỏ',              goal:{mat:'frog_adhesive', n:5},  rw:{exp:300, gold:6000, gem:6} },
    { id:'s21', area:'kouglorz', n:'All the Gold Jellies', vi:'Toàn Bộ Thạch Vàng',   goal:{kill:30},                   rw:{exp:320, gold:12000, gem:6} },
    { id:'s22', area:'kouglorz', n:'Behemoth Hunting',   vi:'Đi Săn Behemoth',        goal:{boss:6},                    rw:{exp:380, gold:8000, gem:12, ticket:15} },
    { id:'s23', area:'borda', n:"Borda Ruins' Frogs",    vi:'Ếch Ở Phế Tích Borda',   goal:{mat:'froggo_eye', n:6},     rw:{exp:400, gold:9000, gem:8} },
    { id:'s24', area:'borda', n:"Tobock Plains' Vacca",  vi:'Bò Đồng Tobock',         goal:{mat:'vacca_meat', n:6},     rw:{exp:420, gold:9500, gem:8} },
    { id:'s25', area:'borda', n:'Pamela is on the Job',  vi:'Pamela Vào Việc',        goal:{boss:8},                    rw:{exp:500, gold:12000, gem:15, ticket:15} },
    { id:'s26', area:'torv', n:'Mystery Bug of Torv',    vi:'Con Bọ Bí Ẩn Ở Torv',    goal:{kill:34},                   rw:{exp:520, gold:13000, gem:8} },
    { id:'s27', area:'torv', n:'Desert Flame Bird',      vi:'Hỏa Điểu Sa Mạc',        goal:{boss:10},                   rw:{exp:600, gold:15000, gem:12} },
    { id:'s28', area:'torv', n:'Strange Shadows',        vi:'Những Cái Bóng Lạ',      goal:{mat:'galena_heart', n:5},   rw:{exp:640, gold:16000, gem:10, ticket:20} },
    { id:'s29', area:'kirva', n:'Sneaking into Kirva',   vi:'Lẻn Vào Kirva',          goal:{kill:40},                   rw:{exp:700, gold:18000, gem:10} },
    { id:'s30', area:'kirva', n:"The Bone's Identity",   vi:'Danh Tính Bộ Xương',     goal:{boss:12},                   rw:{exp:800, gold:20000, gem:15, ticket:20} },
    { id:'s31', area:'kirva', n:'Crimson Gloria',        vi:'Crimson Gloria',         goal:{bossRank:'SS'},             rw:{exp:1200, gold:30000, gem:30, ticket:50} }
  ];

  /* -------------------------------------------- NHIỆM VỤ NGÀY / TUẦN ---- */
  // Thưởng lấy NGUYÊN VĂN bảng Recurrent Quests trong wiki.
  G.DAILY = [
    { id:'d_boss1',  n:'Hạ Behemoth',        need:{boss:1},   rw:{gold:10000, pikke:100} },
    { id:'d_boss3',  n:'Hạ 3 Behemoth',      need:{boss:3},   rw:{pikke:150, item:'gold_potion'} },
    { id:'d_gather', n:'Thu thập 2 lần',     need:{gather:2}, rw:{pikke:100, mat:'magi_frag'} },
    { id:'d_magi',   n:'Nâng 1 cấp Magi',    need:{magiLv:1}, rw:{pikke:100, mat:'magi_frag'} },
    { id:'d_equip',  n:'Nâng 1 cấp trang bị',need:{equipLv:1},rw:{pikke:100, mat:'magi_frag'} },
    { id:'d_bow',    n:'Hạ Behemoth bằng Cung',      need:{bossWith:'bow'},   rw:{pikke:100, item:'luck_potion'} },
    { id:'d_great',  n:'Hạ Behemoth chỉ bằng Đại Kiếm', need:{bossWith:'great'}, rw:{pikke:100, item:'luck_potion'} },
    { id:'d_sword',  n:'Hạ Behemoth chỉ bằng Kiếm & Khiên', need:{bossWith:'sword'}, rw:{pikke:100, item:'exp_potion'} },
    { id:'d_shop',   n:'Mua 1 món ở tiệm Pikke', need:{buy:1}, rw:{pikke:100, mat:'magi_frag'} }
  ];
  G.DAILY_BONUS = { id:'d_all', n:'Xong cả 3 nhiệm vụ ngày', rw:{pikke:300, gem:5} };
  G.WEEKLY = [
    { id:'w_spear', n:'Hạ 15 Behemoth bằng Thương',        need:{bossWith:'spear', n:15}, rw:{pikke:200, ticket:2} },
    { id:'w_bow',   n:'Hạ 15 Behemoth bằng Cung',          need:{bossWith:'bow', n:15},   rw:{pikke:200, ticket:2} },
    { id:'w_sword', n:'Hạ 15 Behemoth bằng Kiếm & Khiên',  need:{bossWith:'sword', n:15}, rw:{pikke:200, ticket:2} },
    { id:'w_great', n:'Hạ 15 Behemoth bằng Đại Kiếm',      need:{bossWith:'great', n:15}, rw:{pikke:200, ticket:2} },
    { id:'w_dual',  n:'Hạ 15 Behemoth bằng Song Kiếm',     need:{bossWith:'dual', n:15},  rw:{pikke:200, ticket:2} },
    { id:'w_abil',  n:'Đổi ability của trang bị 1 lần',    need:{reroll:1},               rw:{pikke:200, ticket:2} },
    { id:'w_part',  n:'Phá bộ phận và hạ 15 Behemoth',     need:{part:1, boss:15},        rw:{pikke:200, ticket:2} },
    { id:'w_potion',n:'Dùng Potion 4 lần',                 need:{potion:4},               rw:{pikke:200, ticket:2} }
  ];
  G.WEEKLY_BONUS = { id:'w_all', n:'Xong nhiệm vụ ngày 5 lần trong tuần', rw:{pikke:400, gem:25} };

  /* ------------------------------------------------------ VẬT PHẨM ------- */
  // Potion: 30 phút thường, 60 phút loại cao cấp (wiki).
  G.ITEMS = {
    gold_potion: { n:'Gold Potion', vi:'Bình Vàng',  ms:1800000, eff:{gold:0.5},  price:{pikke:300} },
    exp_potion:  { n:'Exp Potion',  vi:'Bình Kinh Nghiệm', ms:1800000, eff:{exp:0.5}, price:{pikke:300} },
    luck_potion: { n:'Luck Potion', vi:'Bình May Mắn', ms:1800000, eff:{drop:0.5}, price:{pikke:300} },
    hunter_potion:{n:'Hunter Potion', vi:'Bình Thợ Săn', ms:3600000, eff:{gold:0.5, exp:0.5, drop:0.5}, price:{gem:30}, premium:true }
  };

  /* --------------------------------------------------------- TIỆM PIKKE -- */
  G.SHOP = [
    { id:'p_frag',  n:'Magi Fragment x5',  give:{mat:{magi_frag:5}},   price:{pikke:200} },
    { id:'p_stone', n:'Strengthening Stone x5', give:{mat:{str_stone:5}}, price:{pikke:250} },
    { id:'p_lapisb',n:'Lapis B x1',        give:{mat:{lapis_b:1}},     price:{pikke:400} },
    { id:'p_lapisa',n:'Lapis A x1',        give:{mat:{lapis_a:1}},     price:{pikke:800} },
    { id:'p_lapiss',n:'Lapis S x1',        give:{mat:{lapis_s:1}},     price:{pikke:1500} },
    { id:'p_crystal',n:'Equipment Crystal x1', give:{mat:{crystal:1}}, price:{pikke:1200} },
    { id:'p_ticket',n:'Gacha Ticket x5',   give:{ticket:5},            price:{pikke:1000} },
    { id:'p_gold',  n:'10.000 Gold',       give:{gold:10000},          price:{pikke:500} },
    { id:'p_goldp', n:'Gold Potion',       give:{item:'gold_potion'},  price:{pikke:300} },
    { id:'p_expp',  n:'Exp Potion',        give:{item:'exp_potion'},   price:{pikke:300} },
    { id:'p_luckp', n:'Luck Potion',       give:{item:'luck_potion'},  price:{pikke:300} }
  ];

  /* ------------------------------------------------------------- NPC ----- */
  G.NPCS = ['Pamela', 'Pikke', 'Sylvie', 'Axel', 'Linton', 'Ange', 'Aine', 'Gawen', 'Jild'];
  // Ba đồng đội NPC thay cho co-op 4 người của bản gốc.
  G.ALLY_NAMES = ['Sylvie', 'Axel', 'Linton'];

  /* ------------------------------------------------- HẰNG SỐ CÂN BẰNG ---- */
  G.BAL = {
    baseHp: 420, hpPerLv: 46,          // Lv1 420 máu -> Lv60 ~3100, khớp thang hồi máu Magi SS (400-1600)
    baseAtk: 32, atkPerLv: 4.2,
    baseDef: 10, defPerLv: 2.6,
    baseSpd: 2.35,                     // px/frame ở 60fps
    dodgeDist: 118, dodgeMs: 300, dodgeIFrameMs: 210, dodgeCdMs: 420,
    magiChargeOnHit: 1.6,              // % thanh Magi mỗi đòn trúng
    magiChargeOnTake: 2.4,
    magiRegenPerSec: 1.2,
    fatigueMax: 100, fatigueWeakGain: 3.2, fatigueNormalGain: 0.55,
    downMs: 8000, downDmgMul: 2.5,     // gục -> ăn sát thương ×2.5
    weakMul: 2.2,                      // đánh trúng WEAK point
    partHpFrac: 0.16,                  // máu mỗi bộ phận = 16% máu boss
    partBrokenMul: 1.25,               // phá xong thì vùng đó ăn thêm sát thương
    reviveCount: 4, reviveMs: 3000, reviveRadius: 70,
    questMs: 300000,                   // 5 phút, đúng giới hạn Tower Clearing
    expToLv: function (lv) { return Math.floor(60 * Math.pow(lv, 1.45)); },
    // Điều kiện thưởng gem của Sudden Behemoth (wiki): 3 điều kiện + 1 bonus = tối đa 4 gem.
    gemNoDeath: 1, gemUsedMagi: 1, gemFastMs: 120000, gemAllBonus: 1
  };

  /* ------------------------------------------------ NGƯỠNG PUNICON ------- */
  // [TÁI DỰNG] — không nguồn nào công bố. Xem RESEARCH.md mục 1.
  G.PUNI = {
    ringR: 58,        // bán kính vòng ngoài của cần gạt ảo
    knobR: 26,
    dead: 12,         // vùng chết: kéo dưới ngưỡng này thì không tính là di chuyển
    tapMs: 180,       // nhả trước mốc này + kéo < dead  => TAP (đánh)
    holdMs: 260,      // giữ yên quá mốc này            => đặc thù vũ khí
    holdMoveTol: 26,  // "yên" nghĩa là ngón di chuyển ít hơn ngần này
    flickV: 1.05,     // px/ms lúc nhả  => FLICK (né)
    flickWindowMs: 90,
    comboMs: 450      // cửa sổ nối combo sau khi đòn trước kết thúc
  };

  /* ------------------------------------------------------- TIỆN ÍCH ------ */
  G.magiById = function (id) { return G.MAGI.find(function (m) { return m.id === id; }); };
  G.behemothById = function (id) { return G.BEHEMOTHS.find(function (b) { return b.id === id; }); };
  G.areaById = function (id) { return G.AREAS.find(function (a) { return a.id === id; }); };
  G.matById = function (id) { return G.MATERIALS[id]; };

  G.rollRank = function (rates, rnd) {
    var r = rnd(), acc = 0;
    for (var k in rates) { acc += rates[k]; if (r < acc) return k; }
    return Object.keys(rates)[Object.keys(rates).length - 1];
  };
})(window.DP = window.DP || {});
