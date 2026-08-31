/* ==========================================================================
 * DỮ LIỆU GAME — dựng lại từ Official Dragon Project Wiki + bài 4Gamer.
 * Xem games/dragonproj/RESEARCH.md để biết con số nào có nguồn, con số nào
 * là tái dựng. Quy ước trong file này:
 *   - Tên riêng (vũ khí, boss, nguyên liệu, map) giữ NGUYÊN VĂN bản
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
  // Stagger lấy từ mô tả bản gốc. Thời lượng là tái dựng.
  G.STATUS = {
    burn:      { vi: 'Bỏng',    ms: 8000,  dps: 0.020, color: '#ff7a3c' },
    poison:    { vi: 'Độc',     ms: 12000, dps: 0.012, color: '#8fd14f' },
    paralysis: { vi: 'Tê liệt', ms: 3000,  stun: true, color: '#ffd23f' },
    freeze:    { vi: 'Đóng băng', ms: 2500, stun: true, color: '#4fb6ff' },
    slow:      { vi: 'Chậm',    ms: 6000,  spd: 0.6,   color: '#a06fe0' }
  };
  // Tê liệt theo hệ địch — Earth 0%, Lightning 25%, Fire 50%, Water 100%.
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
  /* ======================================================================
   * LỚP CẢM GIÁC — thứ quyết định "chặt có đã tay hay không"
   *
   * Bản trước đánh trúng quái chỉ trừ máu rồi thôi: không khựng, không văng,
   * không loạng choạng. Nên dù số sát thương có to đến mấy thì tay vẫn thấy như
   * đang chém vào không khí.
   *
   * HITSTOP là thứ đầu tiên phải có. Nguyên tắc (Sakurai, Famitsu vol.490; và
   * Celia Wagar, CritPoints): khi đòn chạm thì ĐÓNG BĂNG cả hai bên vài khung
   * hình — mắt cần chừng ấy thời gian để kịp đăng ký "nó trúng rồi", và chính
   * cái khựng đó nói cho người chơi biết thứ họ đang chém có sức cản. Street
   * Fighter 2 dùng 10 khung, và cái khựng đó nới luôn cửa sổ nhập lệnh từ 5 lên
   * 15 khung — ở đây cũng vậy: hitstop vừa để sướng tay vừa để dễ bấm nối.
   *
   * Số dưới đây tính bằng mili-giây ở 60fps: 50ms ≈ 3 khung, 190ms ≈ 11 khung.
   * ====================================================================== */
  /* SÂN ĐẤU. Trước đây 1300×1600 với 9 con — rộng đến mức phần lớn thời gian là
   * đi bộ đi tìm quái, mà đi bộ thì không phải chặt chém. Thu lại còn 820×1080 và
   * nhồi gấp đôi số quái: lúc nào cũng có thứ trong tầm với, và cú quét vòng
   * của Thương hay Đại Kiếm mới có nghĩa lý. */
  G.ARENA = { w: 820, h: 1080, maxMobs: 16, wave: 11 };

  G.FEEL = {
    hitstop: { light: 50, mid: 85, heavy: 145, finish: 190, launch: 170, crit: 210 },
    hitstopMax: 240,        // trần, để nhiều đòn trúng cùng lúc không đứng hình
    shake:   { light: 3, mid: 6, heavy: 11, finish: 15, quake: 20 },
    kbDecay: 0.86,          // vận tốc văng còn lại sau mỗi khung
    airGrav: 0.00034,       // px/ms². Đặt cùng airLaunch cho ra ~0,9s lơ lửng ở độ cao 34px
    airLaunch: 0.0045,      // vận tốc bay lên = launch × hệ số này
    airDmgMul: 1.4,         // đang lơ lửng thì ăn đòn nặng hơn — thưởng cho việc giữ nhịp
    airBounce: 0.32,        // nảy lại khi chạm đất
    landStagger: 380,       // rơi xuống thì nằm thêm ngần này
    poiseRegen: 14,         // poise hồi mỗi giây
    breakStagger: 900,      // vỡ poise -> loạng choạng dài, đây là cửa sổ đánh hội đồng
    // ĐỠ CHUẨN xong thì tay nhanh hẳn lên một nhịp. Ý lấy từ Sephiria: đỡ/parry
    // thành công MỞ RA một đòn mạnh, chứ không chỉ là "đỡ được rồi thôi". Ở đây
    // biến nó thành cửa sổ tăng tốc để người chơi tự chọn xả bằng đòn gì.
    furyMs: 2200, furySpd: 0.40,
    comboWindowMs: 520,     // còn trong ngần này thì tap kế nối chuỗi
    delayMin: 200,          // chờ ít nhất ngần này sau khi đòn xong rồi tap -> ra ĐÒN NẶNG
    delayWindow: 260,       // và chỉ trong ngần này. Hẹp thì mới là kỹ năng, rộng quá thì thành ngẫu nhiên
    cancelOnHit: true       // đòn ĐÃ TRÚNG thì huỷ đuôi được; đòn hụt thì phải chịu hết
  };

  /* ======================================================================
   * VŨ KHÍ — mỗi cây một BỘ ĐÒN, không phải một con số nhân
   *
   * Trước đây combo chỉ là [1.0, 1.0, 1.15, 1.45]: bốn nhát y hệt nhau, khác
   * mỗi hệ số. Giờ mỗi nhát là một đòn riêng có tầm, góc quét, thời gian, lực
   * văng và độ khựng của nó.
   *
   * Ba đường ra đòn cho mỗi cây, tất cả vẫn chỉ bằng MỘT ngón (đúng luật
   * Punicon):
   *   - CHUỖI    : tap liên tục -> đi hết chain, nhát cuối nặng nhất
   *   - ĐÒN NẶNG : ngưng >= FEEL.delayMin rồi mới tap -> rẽ sang heavy.
   *                Đây là cách Monster Hunter phân biệt người quen tay với
   *                người bấm loạn: "really good longsword users understand
   *                instinctively how many frames they can wait".
   *   - ĐÒN LƯỚT : vẩy để né rồi tap ngay trong lúc còn đang lăn -> dash
   *
   * HẤT TUNG (launch) là món mượn thẳng từ Devil May Cry: đòn hất quái lên
   * trời, lên rồi thì nó không đánh trả được và ăn thêm 40% sát thương. Game
   * nhìn từ trên xuống không có nút nhảy, nên "trên không" ở đây thể hiện bằng
   * độ cao + bóng co lại, còn người chơi thì chỉ việc đánh tiếp cho nó đừng
   * rơi. ("A launcher is any move that tosses an enemy in the air, essentially
   * neutralizing their ability to attack" — DMC3 Battle Mechanics FAQ)
   *
   * Mỗi nhát: mul hệ số sát thương · arc góc quét · reach tầm · ms thời gian ·
   * kb lực văng · hs độ khựng · launch độ cao hất · poise lực phá lì đòn
   * ====================================================================== */
  var HS = { light: 50, mid: 85, heavy: 145, finish: 190, launch: 170 };

  G.WEAPONS = {
    sword: {
      id: 'sword', vi: 'Kiếm & Khiên', jp: '片手剣', en: 'Sword & Shield',
      desc: 'Cân bằng, xoay trở nhanh nhất, và là cây DUY NHẤT đỡ được đòn. Chuỗi 4 nhát, nhát cuối HẤT TUNG.',
      arc: 1.75, reach: 62, swingMs: 300,
      moveMul: 1.00, dodgeMul: 1.00, atkBase: 1.00,
      // Chuỗi: ngang -> trả -> đâm -> hất lên. Nhát 4 là launcher, mở màn juggle.
      chain: [
        { n:'Chém ngang',  mul:1.00, arc:1.75, reach:62, ms:250, kb:8,  hs:HS.light, poise:10 },
        { n:'Chém trả',    mul:1.05, arc:1.75, reach:62, ms:240, kb:8,  hs:HS.light, poise:10 },
        { n:'Đâm tới',     mul:1.20, arc:0.85, reach:80, ms:270, kb:16, hs:HS.mid,   poise:14, push:14 },
        { n:'Hất lên',     mul:1.55, arc:1.95, reach:70, ms:380, kb:10, hs:HS.launch, poise:22, launch:34 }
      ],
      heavy: { n:'Thăng Long Trảm', mul:2.30, arc:2.00, reach:76, ms:520, kb:14, hs:HS.finish, poise:34, launch:48, wind:0.42 },
      dash:  { n:'Xô Khiên', mul:1.35, arc:1.30, reach:64, ms:280, kb:30, hs:HS.mid, poise:26 },
      // Bấm trong lúc ĐANG ĐỠ: quét một nhát rộng ra từ sau khiên.
      guardHit: { n:'Chém Khiên', mul:1.90, arc:2.40, reach:76, ms:420, kb:28, hs:HS.heavy, poise:38, wind:0.38 },
      special: 'guard',
      specialVi: 'Đỡ đòn + Phản đòn',
      // Đỡ đúng lúc -> giảm 90% (wiki: "damage become 1/10"); đỡ thường -> giảm 60% [TÁI DỰNG]
      guardCut: 0.40, perfectCut: 0.10, perfectMs: 220, guardMoveMul: 0.40,
      counterMul: 2.60, counterArc: 1.2, counterReach: 82
    },
    great: {
      id: 'great', vi: 'Đại Kiếm', jp: '両手剣', en: 'Great Sword',
      desc: 'Nặng và chậm, nhưng mỗi nhát hất văng cả đám. Nhát cuối đập đất rung màn hình.',
      arc: 2.30, reach: 78, swingMs: 620,
      moveMul: 0.80, dodgeMul: 0.92, atkBase: 1.45,
      // Cam kết cao: vung là phải chịu hết đuôi. Bù lại lực văng gấp ba cây khác.
      chain: [
        { n:'Bổ dọc',    mul:1.60, arc:1.15, reach:86, ms:540, kb:22, hs:HS.heavy,  poise:30 },
        { n:'Quét ngang',mul:1.80, arc:2.45, reach:84, ms:580, kb:28, hs:HS.heavy,  poise:34 },
        { n:'Đập đất',   mul:2.45, arc:6.283, reach:96, ms:700, kb:36, hs:HS.finish, poise:48, quake:true }
      ],
      heavy: { n:'Trảm Địa Liệt', mul:3.30, arc:2.70, reach:112, ms:820, kb:34, hs:HS.finish, poise:60, launch:32, quake:true, wind:0.5 },
      dash:  { n:'Húc Vai', mul:2.00, arc:1.10, reach:80, ms:340, kb:34, hs:HS.heavy, poise:40 },
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
      desc: 'Tầm với dài nhất, đâm nhanh và ít hở. Nhát cuối quét trọn vòng quanh.',
      arc: 0.95, reach: 96, swingMs: 260,
      moveMul: 0.95, dodgeMul: 1.00, atkBase: 1.20,
      finalSweep: true, // đòn cuối quét 360° (4Gamer: 周囲をなぎ払うような攻撃)
      chain: [
        { n:'Đâm 1',    mul:0.88, arc:0.50, reach:96,  ms:210, kb:6,  hs:HS.light, poise:8 },
        { n:'Đâm 2',    mul:0.88, arc:0.50, reach:96,  ms:200, kb:6,  hs:HS.light, poise:8 },
        { n:'Đâm xuyên',mul:1.00, arc:0.60, reach:104, ms:230, kb:12, hs:HS.mid,   poise:12, push:10 },
        { n:'Quét vòng',mul:1.40, arc:6.283, reach:92, ms:340, kb:20, hs:HS.heavy, poise:26 }
      ],
      heavy: { n:'Xuyên Thiên', mul:2.00, arc:0.55, reach:126, ms:460, kb:16, hs:HS.finish, poise:30, launch:42, push:26, wind:0.4 },
      dash:  { n:'Lao Đâm', mul:1.65, arc:0.70, reach:118, ms:260, kb:18, hs:HS.mid, poise:22, push:22 },
      special: 'lunge',
      specialVi: 'Lao Tới (突進)',
      lungeDist: 190, lungeMul: 1.90, lungeMs: 220, lungeLagMs: 260,
      lungeElemBonus: 4.0,   // Normal-type: giữ chỉ hướng -> sát thương hệ tới ×4
      lungeStagger: true     // trúng WEAK -> quái chùn, ngắt đòn đang ra
    },
    dual: {
      id: 'dual', vi: 'Song Kiếm', jp: '双剣', en: 'Dual Blades',
      desc: 'Chuỗi 6 nhát nhanh như bão, gần như không hở. Ít lực văng — bù bằng số nhát.',
      arc: 1.35, reach: 48, swingMs: 155,
      moveMul: 1.15, dodgeMul: 1.18, atkBase: 0.85,
      // Cam kết THẤP nhất game: mỗi nhát chỉ 130ms, huỷ đuôi lúc nào cũng được.
      // (MH: "the dual blades do away with a lot of the restrictive slowness")
      chain: [
        { n:'Xé trái',  mul:0.60, arc:1.35, reach:50, ms:130, kb:3, hs:35, poise:5 },
        { n:'Xé phải',  mul:0.60, arc:1.35, reach:50, ms:125, kb:3, hs:35, poise:5 },
        { n:'Cắt chéo', mul:0.62, arc:1.45, reach:52, ms:130, kb:4, hs:40, poise:6 },
        { n:'Cắt ngược',mul:0.62, arc:1.45, reach:52, ms:125, kb:4, hs:40, poise:6 },
        { n:'Xoay kép', mul:0.70, arc:1.90, reach:54, ms:160, kb:6, hs:HS.light, poise:9 },
        { n:'Bổ đôi',   mul:1.15, arc:1.70, reach:58, ms:230, kb:12, hs:HS.mid, poise:16 }
      ],
      heavy: { n:'Song Long Trảm', mul:1.05, arc:1.80, reach:60, ms:300, kb:8, hs:HS.mid, poise:14, hits:2, launch:26, wind:0.3 },
      dash:  { n:'Xẹt Qua', mul:1.25, arc:1.60, reach:56, ms:200, kb:8, hs:HS.light, poise:12, push:30 },
      special: 'ranbu',
      specialVi: 'Loạn Vũ (乱舞)',
      ranbuWindupMs: 380, ranbuHits: 8, ranbuMul: 0.75, ranbuMs: 900,
      ranbuLandLagMs: 420, ranbuInvuln: true, ranbuReach: 76
    },
    bow: {
      id: 'bow', vi: 'Cung', jp: '弓矢', en: 'Bow',
      desc: 'Duy nhất đánh xa. CÀNG GẦN BẮN CÀNG ĐAU. Nhát cuối bắn loạt ba mũi.',
      arc: 0, reach: 420, swingMs: 340, ranged: true,
      moveMul: 0.85, dodgeMul: 0.95, atkBase: 0.90,
      arrowSpeed: 12,
      chain: [
        { n:'Bắn nhanh', mul:0.72, ms:280, hs:35,       poise:6 },
        { n:'Bắn kép',   mul:0.72, ms:270, hs:35,       poise:6 },
        { n:'Loạt ba',   mul:0.80, ms:400, hs:HS.light, poise:10, shots:3, spread:0.30 }
      ],
      heavy: { n:'Mũi Xuyên Giáp', mul:1.90, ms:520, hs:HS.mid, poise:24, pierce:true, wind:0.45 },
      dash:  { n:'Bắn Lùi', mul:1.30, ms:300, hs:HS.light, poise:10, back:34 },
      special: 'snipe',
      specialVi: 'Ngắm Bắn (狙い撃ち)',
      snipeChargeMs: 1500, snipeMin: 1.5, snipeMax: 5.0,
      snipeAimRadius: 260, snipePierce: true,
      // 4Gamer: 射程距離が短いほど矢の威力が大幅に高まる
      snipeCloseBonus: 0.9, snipeCloseRange: 340,
      snipeDotMs: 8000, snipeDotDps: 0.03   // nạp đầy trúng WEAK -> mũi tên trắng gây DoT
    }
  };
  /* Vài chỗ trong game và test còn đọc W.combo (mảng số). Dựng lại nó từ chain
   * thay vì để hai bảng số song song rồi lệch nhau. */
  Object.keys(G.WEAPONS).forEach(function (k) {
    var W = G.WEAPONS[k];
    W.combo = W.chain.map(function (c) { return c.mul; });
  });

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
    { id: 'skillCd',   vi: 'Hồi chiêu -{v}%',             stat: 'skillCd',    v: [5, 15] },
    { id: 'skillDmg',  vi: 'Sát thương kỹ năng +{v}%',    stat: 'skillDmg',   v: [6, 18] },
    { id: 'luck',      vi: 'May mắn +{v}',               stat: 'luck',       v: [1, 5] }
  ];

  /* ----------------------------------------------------- LỚP NGUYÊN TỐ ---- */
  /* Trước đây hệ chỉ là một hệ số sát thương và một mã màu — lôi kiếm với hoả
   * kiếm chém giống hệt nhau. Bảng này cho hệ hai móc để BIỂU DIỄN ra ngoài:
   *   trail — vệt để lại dọc đường đi của một đòn cơ động
   *   burst — thứ bung ra tại điểm lưỡi chạm
   * Một bảng sáu dòng, cả mười kỹ năng hưởng. Đây là chỗ lấy biến hoá mà không
   * phải viết sáu mươi kỹ năng. */
  G.ELEM_FX = {
    none:    { trail:'streak', burst:'flash', col:'#c8d4de', glow:'#8fa3b5' },
    thunder: { trail:'bolt',   burst:'chain', col:'#ffd23f', glow:'#fff0a0',
               chainN:2, chainR:120, chainMul:0.45, status:'paralysis' },
    fire:    { trail:'burn',   burst:'flare', col:'#ff9f2e', glow:'#ffcf8a',
               burnMs:3000, burnDps:0.018, status:'burn' },
    water:   { trail:'frost',  burst:'shard', col:'#4fb6ff', glow:'#a5dcff',
               slickMs:2600, status:'slow' },
    earth:   { trail:'crack',  burst:'spike', col:'#8fd14f', glow:'#c6ec9d',
               kbMul:1.6, quake:true },
    light:   { trail:'streak', burst:'flash', col:'#fff6d8', glow:'#ffffff',
               blindMs:900 },
    dark:    { trail:'smoke',  burst:'pool',  col:'#a06fe0', glow:'#d3b6f5',
               drain:0.12, poolMs:2400 }
  };

  /* --------------------------------------------------------- KỸ NĂNG ------ */
  /* HAI kỹ năng mỗi vũ khí, khớp đúng hai nút trên HUD. Không nhét bốn tiện ích
   * lặt vặt — mỗi cái là một MÀN DIỄN: nạp lâu, hồi lâu, có báo trước, có rủi ro,
   * và bán được một hình ảnh cụ thể.
   *
   * Luật chung:
   *   charge 900–2200ms · cd 14000–24000ms
   *   trong lúc nạp thì đi chậm hẳn — đó là cái giá
   *   vẩy né lúc đang nạp = huỷ, hoàn 60% hồi chiêu (không phạt việc đọc đúng)
   *
   * kind quyết định trình phát nào chạy nó. Mỗi kind là một hình dạng vùng khác
   * nhau, nên mười kỹ năng tự khác nhau trên màn hình — đây chính là chỗ hệ Magi
   * cũ chết: bốn mươi viên dùng chung ba đoạn code nên hiện lên y hệt nhau. */
  G.SKILL_RULES = {
    cancelRefund: 0.60,     // huỷ giữa chừng thì hoàn ngần này hồi chiêu
    chargeMoveMul: 0.35,    // đi chậm lại trong lúc nạp
    unlockLv2: 8            // kỹ năng thứ hai mở ở cấp vũ khí này
  };

  G.SKILLS = {
    /* --- SONG KIẾM: sát thủ. Lén lút, mượt, một nhát định đoạt. --- */
    dual: [
      { id:'shadowstep', n:'Ảnh Độn', kind:'blink',
        d:'Chìm vào bóng rồi hiện ra sau lưng mục tiêu. Trúng sau lưng thì đau gấp bội.',
        charge:900, cd:14000,
        fadeTo:0.35,            // độ mờ khi nạp xong — tới mức này thì quái mất dấu
        loseAggro:true,
        range:280,              // tầm khoá mục tiêu
        appearMs:150,           // biến mất -> hiện ra sau lưng
        slashDelay:120,         // vệt chém NỞ RA TRỄ ngần này sau khi đã hiện
        mul:2.10, backMul:2.50, frontMul:1.00,
        arc:1.60, reach:64, ms:420,
        kb:14, hitstop:190, poise:30,
        trail:true, burst:true, ghosts:5 },

      { id:'afterimage', n:'Tàn Ảnh', kind:'stance',
        d:'Để lại ảo ảnh hút đòn. Ba giây kế mọi nhát đều tính là đâm lén.',
        charge:1100, cd:20000,
        stanceMs:3000, fadeTo:0.45,
        decoyMs:3000, decoyTaunt:true, decoyBlastMul:1.40, decoyBlastR:96,
        backstabAll:true, backMul:2.20,
        trail:false, burst:false }
    ],

    /* --- ĐẠI KIẾM: đao phủ. Chậm, nặng, cả sân thấy nó tới. --- */
    great: [
      { id:'skyrend', n:'Trảm Thiên', kind:'wave',
        d:'Giơ kiếm lên trời rồi bổ xuống. Sóng nứt lan thẳng, xuyên tất cả.',
        charge:2000, cd:16000,
        chargeDR:0.50,          // giảm ngần này sát thương nhận trong lúc nạp
        waveLen:300, waveW:76, waveSpd:0.9,
        mul:3.20, hitstop:190, kb:34, poise:60, launch:34, quake:true,
        trail:true, burst:true },

      { id:'maelstrom', n:'Nghiền', kind:'pull',
        d:'Cắm kiếm hút cả đám vào tâm rồi một cú đập vỡ thế hàng loạt.',
        charge:1400, cd:22000,
        pullR:180, pullMs:700, pullForce:0.32,
        mul:2.40, hitstop:190, kb:26, poise:190, quake:true, arc:6.283, reach:110,
        trail:false, burst:true }
    ],

    /* --- KIẾM & KHIÊN: bức tường. Phòng thủ là tấn công. --- */
    sword: [
      { id:'bulwark', n:'Thành Trì', kind:'wall',
        d:'Cắm khiên dựng tường chắn đạn. Đứng sau tường thì đòn nặng tay hẳn.',
        charge:1000, cd:18000,
        wallMs:5000, wallArc:2.2, wallDist:56, wallW:8,
        behindDmg:0.40,         // đứng sau tường: đòn +40%
        blockShots:true,
        trail:false, burst:false },

      { id:'ramrod', n:'Thiên Chuỳ', kind:'rush',
        d:'Lao xuyên có giáp, dồn cả đám tới cuối đường rồi đập hất tung.',
        charge:1600, cd:15000,
        dist:240, rushMs:420, armor:true,
        pushAlong:true,
        mul:1.30, endMul:2.20, arc:2.00, reach:80,
        hitstop:170, kb:30, poise:40, launch:40,
        trail:true, burst:true }
    ],

    /* --- THƯƠNG: long kỵ. Tầm với và trên không. --- */
    spear: [
      { id:'swallowdive', n:'Yến Phi Trảm', kind:'leap',
        d:'Bật lên cao rồi đâm xuống điểm đã ngắm. Chạm đất là cả vùng bay lên.',
        charge:1300, cd:15000,
        aimR:260, upMs:420, hangMs:180, downMs:220,
        peakZ:120, camPull:0.10,
        mul:2.60, radius:96, hitstop:190, kb:24, poise:44, launch:46, quake:true,
        trail:false, burst:true },

      { id:'cloudpierce', n:'Xuyên Vân', kind:'pierce',
        d:'Một cú đâm xuyên thẳng. Xuyên qua càng nhiều con thì càng nặng đòn.',
        charge:1800, cd:20000,
        len:500, w:44, ms:260,
        mul:1.80, rampPerHit:0.20, rampMax:2.20,
        hitstop:145, kb:18, poise:30, push:20,
        trail:true, burst:true }
    ],

    /* --- CUNG: thợ săn. Kiểm soát không gian. --- */
    bow: [
      { id:'arrowrain', n:'Vũ Tiễn', kind:'rain',
        d:'Bắn lên trời rồi mưa mũi tên xuống vùng đã chọn. Mỗi mũi có bóng báo trước.',
        charge:1600, cd:18000,
        aimR:300, zoneR:110, delayMs:800, arrows:14, spreadMs:520,
        mul:0.62, hitstop:50, kb:6, poise:8,
        trail:false, burst:true },

      { id:'heartpierce', n:'Nhất Tiễn Xuyên Tâm', kind:'snipe2',
        d:'Nạp lâu nhất game. Xuyên trọn một hàng và để lại vết thương rỉ máu.',
        charge:2200, cd:24000,
        len:560, w:26, speed:20,
        mul:3.40, pierce:true, dotMs:6000, dotDps:0.030,
        hitstop:190, zoomPunch:0.12, kb:20, poise:36,
        trail:true, burst:true }
    ]
  };

  G.skillsOf = function (weaponId) { return G.SKILLS[weaponId] || []; };
  G.skillById = function (id) {
    var out = null;
    Object.keys(G.SKILLS).forEach(function (k) {
      G.SKILLS[k].forEach(function (s) { if (s.id === id) out = s; });
    });
    return out;
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
    // ĐỘC QUYỀN GACHA. Không rơi ở ải nào, không bán ở tiệm, không rã đồ ra được.
    // Đường duy nhất: quay Triệu hồi trúng món đã có. Dùng để TIẾN HOÁ đồ S/SS.
    dragon_core: { n:'Lõi Rồng', r:'SS', gachaOnly:true },
    skill_core:{n:'Lõi Kỹ Năng', r:'B' },
    str_stone:{n:'Strengthening Stone', r:'B' }
  };
  G.RANK_ORDER = ['D', 'C', 'B', 'A', 'S', 'SS'];
  G.RANK_COLOR = { D:'#8fa3b5', C:'#7fd07f', B:'#5b8fd6', A:'#b06fd0', S:'#f2a03c', SS:'#f2d24b', Lapis:'#7fe3f0' };

  /* --------------------------------------------------- TỘC QUÁI THƯỜNG ---- */
  // Sáu tộc trong How-to-Play guide. shape dùng để vẽ bằng code.
  /* ======================================================================
   * QUÁI THƯỜNG — mỗi tộc một lối đánh, không phải cùng một con đi thẳng vào mặt
   *
   * Bản trước mọi con đều làm đúng một việc: đi tới, chạm vào người chơi, trừ
   * máu. Không báo trước, không có nhịp, nên chẳng có gì để đọc và cũng chẳng có
   * gì để né — đánh nhau thành ra bấm cho hết máu.
   *
   * Giờ mỗi tộc có một ai riêng, và quan trọng hơn: con nào cũng có POISE.
   * Poise là thanh lì đòn — đánh vào thì trừ, trừ hết thì VỠ, con quái loạng
   * choạng gần một giây. Đó là nhịp mà một game chặt chém sống nhờ: dồn đòn cho
   * vỡ, rồi xả đòn nặng vào lúc nó đứng chết trân.
   *
   *   swarm   — đông, yếu, bâu lại; chết dễ, có để mà chém cho đã
   *   charger — báo trước bằng vạch đỏ rồi HÚC thẳng; húc hụt thì đơ lâu (chỗ phạt)
   *   hopper  — nhảy vòng cung tới, chạm đất nổ một vòng nhỏ; đang bay không đổi hướng
   *   flyer   — lượn vòng quanh rồi bổ nhào; nhanh, máu giấy
   *   ranged  — giữ khoảng cách, nhả đạn ba viên; phải xông vào mới giết được
   *   tank    — chậm, poise dày gấp ba, phải đục vỡ mới đánh vào được tử tế
   * ====================================================================== */
  G.TRIBES = {
    purun:  { vi:'Purun',  en:'Jelly',  shape:'blob',  r:15, hp:1.0, atk:0.9, spd:0.55,
              ai:'swarm',   poise:26,  mat:['jelly_dew','gummy','jelly_core','hq_jelly_core'] },
    vacca:  { vi:'Vacca',  en:'Vacca',  shape:'bull',  r:19, hp:1.6, atk:1.3, spd:0.75,
              ai:'charger', poise:60, charger:true,
              tell:820, dashSpd:7.6, dashMs:620, recover:900,
              mat:['vacca_horns','cow_hoof','vacca_meat','hq_vacca_meat'] },
    geguri: { vi:'Geguri', en:'Froggo', shape:'frog',  r:16, hp:1.2, atk:1.0, spd:0.70,
              ai:'hopper',  poise:34, hopper:true,
              tell:460, hopDist:150, hopMs:520, shockR:56,
              mat:['froggo_oil','frog_adhesive','froggo_eye','hq_froggo_eye'] },
    bat:    { vi:'Bat',    en:'Bat',    shape:'bat',   r:13, hp:0.8, atk:1.0, spd:1.15,
              ai:'flyer',   poise:18, flyer:true,
              orbit:120, tell:380, diveSpd:8.4, diveMs:420,
              mat:['bat_wing','bat_fang','bat_ears','giant_bat_ear'] },
    galena: { vi:'Galena', en:'Galena', shape:'bird',  r:17, hp:1.1, atk:1.15,spd:0.95,
              ai:'ranged',  poise:30,
              keep:210, tell:560, shots:3, spread:0.36, projSpd:5.4,
              mat:['galena_feather','galena_beak','galena_heart','galena_egg'] },
    fungo:  { vi:'Fungo',  en:'Fungo',  shape:'shroom',r:18, hp:1.9, atk:1.1, spd:0.40,
              ai:'tank',    poise:110, poisoner:true,
              tell:900, slamR:74, puffR:96,
              mat:['fungo_cap','fungolise','variant_fungolise','variant_fungolise'] }
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
  /* Ba con trùm đầu game vốn chỉ có 3 bài, đánh hai lượt là thuộc lòng. Nới ra
   * cho đủ nhịp: một bài cận chiến, một bài tầm xa, một bài diện rộng, một bài
   * di chuyển. Có ngần đó thì người chơi mới phải ĐỌC chứ không đứng một chỗ chém. */
  G.BOSS_EXTRA = {
    grouton:   ['slam', 'bounce', 'spit', 'stomp', 'charge', 'ring'],
    vaccahorn: ['charge', 'stomp', 'sweep', 'slam', 'ring'],
    frogrid:   ['tongue', 'hop', 'spit', 'stomp', 'bounce'],
    mumu:      ['slam', 'spore', 'stomp', 'ring', 'summon'],
    dodonki:   ['peck', 'dive', 'feather', 'sonic', 'charge'],
    winvlum:   ['dive', 'sonic', 'feather', 'lash', 'ring'],
    galidon:   ['beam', 'ring', 'slam', 'charge', 'stomp'],
    dofungos:  ['spore', 'slam', 'stomp', 'summon', 'ring']
  };

  /* Ba con trùm đầu game vốn chỉ có 3 bài, đánh hai lượt là thuộc lòng. Nới ra
   * cho đủ nhịp: một bài cận chiến, một bài tầm xa, một bài diện rộng, một bài
   * di chuyển. Có ngần đó thì người chơi mới phải ĐỌC chứ không đứng một chỗ chém. */
  G.BOSS_EXTRA = {
    grouton:   ['slam', 'bounce', 'spit', 'stomp', 'charge', 'ring'],
    vaccahorn: ['charge', 'stomp', 'sweep', 'slam', 'ring'],
    frogrid:   ['tongue', 'hop', 'spit', 'stomp', 'bounce'],
    mumu:      ['slam', 'spore', 'stomp', 'ring', 'summon'],
    dodonki:   ['peck', 'dive', 'feather', 'sonic', 'charge'],
    winvlum:   ['dive', 'sonic', 'feather', 'lash', 'ring'],
    galidon:   ['beam', 'ring', 'slam', 'charge', 'stomp'],
    dofungos:  ['spore', 'slam', 'stomp', 'summon', 'ring']
  };

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

  /* ------------------------------------------------------------- ẢI ------- */
  /* CỐ Ý LỆCH BẢN GỐC. Dragon Project không có màn chọn ải: bạn đi lang thang trên
   * map nối nhau bằng cổng, và boss thì gặp ngẫu nhiên hoặc quay ra từ Quest Gacha.
   * Bản này đổi sang CHỌN ẢI vì nó dễ hiểu hơn hẳn: một danh sách đánh số, biết ngay
   * mình đang ở đâu và ải sau cần gì. Xem RESEARCH.md mục 13.
   *
   * Một ải = mấy đợt quái thường, dọn đủ thì BOSS CUỐI ẢI xuất hiện. Hạ boss là phá
   * ải, mở ải kế. Vào một mình — không có đồng đội NPC.
   */
  /* Chốt chặn cuối mỗi vùng. Bốn vùng đầu dùng đúng con Rare mà wiki gán cho vùng
   * đó (hạng A). Bốn vùng cuối phải leo tiếp lên S rồi SS — nếu không thì đồ hạng
   * SS mà gacha phát ra, và cả bậc Tiến hoá tốn Lõi Rồng, chẳng có đối thủ nào
   * xứng để mà dùng. Chuỗi ải là toàn bộ nội dung của game này, nên nó phải leo
   * hết tới đỉnh bảng Behemoth. */
  G.AREA_FINAL = {
    kouglorz: 'phoelix',      // S — Aura Phoelix
    borda:    'arion',        // S — Blade Arion
    torv:     'wukong',       // S — Ascetic Wukong
    kirva:    'felnarog'      // SS — Deus Felnarog, chốt chặn cuối cùng của game
  };

  G.buildStages = function () {
    G.AREAS.forEach(function (a, ai) {
      var pool = a.sudden || [];
      // Từ vùng 4 trở đi, ải lẻ đặt một con Rare (hạng A) làm trùm: tới cấp 30+ mà
      // vẫn chỉ gặp trùm hạng B thì chuỗi ải đứng yên tại chỗ. Vùng 4 phải bỏ con
      // Rare đầu bảng ra vì nó đang giữ chỗ chốt chặn cuối vùng.
      var mids = (a.rare || []);
      if (!G.AREA_FINAL[a.id]) mids = mids.slice(1);
      a.stages = a.maps.map(function (m, i) {
        var last = i === a.maps.length - 1;
        // Ải cuối mỗi vùng đặt con khó nhất của vùng làm chốt chặn.
        var boss = last
          ? (G.AREA_FINAL[a.id] || (a.rare && a.rare[0]) || pool[0])
          : (ai >= 3 && i % 2 === 1 && mids.length ? mids[((i - 1) / 2) % mids.length]
                                                   : pool[i % pool.length]);
        var bd = G.behemothById(boss);
        return {
          id: a.id + '-' + (i + 1),
          n: 'Ải ' + (ai + 1) + '-' + (i + 1),
          sub: m.n,
          area: a.id, idx: i, last: last,
          lv: m.lv,
          tribes: m.tribes,
          kills: m.kills,                       // dọn đủ ngần này thì boss ra
          boss: boss,
          bossLv: m.lv + (last ? 6 : 3),
          rank: bd ? bd.rank : 'B',
          gold: Math.round(320 + m.lv * 78) * (last ? 2 : 1),
          exp: Math.round(28 + m.lv * 9) * (last ? 2 : 1),
          firstGem: last ? 10 : 5               // thưởng riêng cho lần phá đầu tiên
        };
      });
    });
    G.STAGES = G.AREAS.reduce(function (acc, a) { return acc.concat(a.stages); }, []);
  };
  G.stageById = function (id) { return (G.STAGES || []).find(function (s) { return s.id === id; }); };
  G.stagesOf = function (areaId) { var a = G.areaById(areaId); return a ? a.stages : []; };

  /* --------------------------------------------- GACHA RA THẲNG TRANG BỊ -- */
  /* CỐ Ý LỆCH BẢN GỐC. Quest Gacha của Dragon Project quay ra MỘT CON BOSS để đi
   * đánh, hạ xong mới có Tablet để tự chế đồ — đó là nét lạ nhất của game gốc, và
   * cũng là thứ khó hiểu nhất với người mới. Bản này quay ra thẳng trang bị.
   * Tỉ lệ hạng giữ NGUYÊN tỉ lệ thật của Quest Gacha (SS 3 / S 15 / A 55 / B 27),
   * vì đó là con số có nguồn. Nguyên liệu để NÂNG CẤP vẫn phải đi cày ở ải.
   */
  G.GEAR_RATES = { SS: 0.03, S: 0.15, A: 0.55, B: 0.27 };
  G.GEAR_KINDS = ['weapon', 'head', 'body', 'arm', 'leg'];

  /* Quay trúng món đã có thì đổi thành LÕI RỒNG — nguyên liệu độc quyền của gacha,
   * KHÔNG rơi ở bất kỳ ải nào, không mua được ở tiệm. Nó là thứ duy nhất mở được
   * TIẾN HOÁ cho đồ hạng S và SS, tức bậc nâng cấp cao nhất trong game.
   *
   * Vì sao buộc phải như vậy: nếu trùng chỉ đổi ra Lapis (thứ cày được) thì quay
   * trùng chẳng khác gì đi cày, và cú quay không còn nghĩa lý gì. Cho nó gánh một
   * bậc nâng cấp mà đi cày KHÔNG BAO GIỜ với tới được thì lần quay nào cũng là tiến
   * bộ thật — kể cả khi ra món đã có. */
  G.DUPE_CORE = { B: 1, A: 2, S: 5, SS: 12 };

  // Điểm khai thác trong ải nhả ra một trong bốn thứ này. Để ở đây (chứ không
  // nằm rải trong game.js) để mọi đường ra nguyên liệu đều khai báo một chỗ.
  G.GATHER_MATS = ['str_stone', 'skill_core', 'crystal', 'lapis_b'];

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
    { id:'d_gather', n:'Thu thập 2 lần',     need:{gather:2}, rw:{pikke:100, mat:'skill_core'} },
    { id:'d_skill',  n:'Dùng kỹ năng 5 lần', need:{skillUse:5}, rw:{pikke:100, mat:'skill_core'} },
    { id:'d_equip',  n:'Nâng 1 cấp trang bị',need:{equipLv:1},rw:{pikke:100, mat:'skill_core'} },
    { id:'d_bow',    n:'Hạ Behemoth bằng Cung',      need:{bossWith:'bow'},   rw:{pikke:100, item:'luck_potion'} },
    { id:'d_great',  n:'Hạ Behemoth chỉ bằng Đại Kiếm', need:{bossWith:'great'}, rw:{pikke:100, item:'luck_potion'} },
    { id:'d_sword',  n:'Hạ Behemoth chỉ bằng Kiếm & Khiên', need:{bossWith:'sword'}, rw:{pikke:100, item:'exp_potion'} },
    { id:'d_shop',   n:'Mua 1 món ở tiệm Pikke', need:{buy:1}, rw:{pikke:100, mat:'skill_core'} }
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
    { id:'p_frag',  n:'Lõi Kỹ Năng x5',  give:{mat:{skill_core:5}},   price:{pikke:200} },
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

  /* ------------------------------------------------- QUẦY ĐỔI MEDAL ----- */
  /* Medal rơi ra mỗi lần PHÁ ẢI, càng trùm cao càng nhiều (B 2 · A 5 · S 12 · SS 30).
   * Đây là quầy duy nhất nhận Medal, và cũng là đường lấy vé KHÔNG dính đồng hồ
   * thật: tiệm Pikke thì phải chờ nhiệm vụ ngày reset, còn quầy này thì cày ải là
   * ra. Game này chơi offline một mình, không bán gì cho ai, nên chặn người chơi
   * bằng đồng hồ chỉ tổ làm họ ngồi không.
   *
   * Giá neo theo một lần quay: 5 vé = 15 Medal, đúng bằng ba ải hạng B, hoặc một
   * ải hạng S. Gói 10+1 rẻ hơn ~13% để vẫn đáng gom.
   *
   * KHÔNG bán Lõi Rồng ở đây. Lõi Rồng phải giữ đúng lời hứa của nó: chỉ có từ
   * quay trúng đồ trùng, không cày được, không mua được. Hở một đường mua là bậc
   * Tiến hoá mất hết ý nghĩa. */
  G.MEDAL_SHOP = [
    { id:'m_t5',   n:'Vé Triệu hồi ×5',   sub:'đúng một lần quay đơn', give:{ticket:5},  price:{medal:15} },
    { id:'m_t50',  n:'Vé Triệu hồi ×50',  sub:'gói 10+1, rẻ hơn 13%',  give:{ticket:50}, price:{medal:130} },
    { id:'m_lapa', n:'Lapis A ×1',        sub:'Limit Break đồ hạng A', give:{mat:{lapis_a:1}}, price:{medal:12} },
    { id:'m_laps', n:'Lapis S ×1',        sub:'Limit Break đồ hạng S', give:{mat:{lapis_s:1}}, price:{medal:25} },
    { id:'m_crys', n:'Equipment Crystal ×2', sub:'nâng cấp từ Lv.25',  give:{mat:{crystal:2}}, price:{medal:10} },
    { id:'m_gold', n:'15.000 Gold',       sub:'',                      give:{gold:15000}, price:{medal:8} }
  ];

  /* ------------------------------------------------ ĐỔI GOLD LẤY PIKKE --- */
  /* Pikke của bản gốc CHỈ có từ nhiệm vụ ngày/tuần, tức đi qua đồng hồ thật. Ở đây
   * mở thêm đường đổi bằng Gold — thứ cày ải là ra — nên tiệm Pikke không còn đứng
   * hình khi hết nhiệm vụ trong ngày.
   *
   * GIÁ PHẢI CHỐNG ĐƯỢC VÒNG IN TIỀN. Tiệm đang bán chiều ngược lại:
   * 500 Pikke -> 10.000 Gold, tức 20 Gold một Pikke. Nếu mua vào cũng quanh mức
   * đó thì đổi đi đổi lại là tự nhân đôi ví. Mua vào để ở 50 Gold/Pikke — chênh
   * 2,5 lần, đúng kiểu giá mua/giá bán của một cái tiệm.
   *
   * Và phải rẻ hơn đường Medal đi thẳng, nếu không thì quầy Medal thành vô nghĩa:
   *   đi thẳng   15 Medal -> 5 vé            = 66,7 Pikke-quy-đổi mỗi Medal
   *   đường vòng  8 Medal -> 15.000 Gold -> 300 Pikke = 37,5 mỗi Medal
   * Đi thẳng vẫn lời gần gấp đôi. */
  G.PIKKE_BUY = [
    { id:'k_200',  n:'200 Pikke',   sub:'',                    give:{pikke:200},  price:{gold:10000} },
    { id:'k_700',  n:'700 Pikke',   sub:'bằng hơn một ngày, rẻ 6%',  give:{pikke:700},  price:{gold:33000} },
    { id:'k_1500', n:'1.500 Pikke', sub:'bằng hơn một tuần, rẻ 9%',  give:{pikke:1500}, price:{gold:68000} }
  ];

  /* ------------------------------------------------------ QUẦY NẠP ------ */
  /* Đúng những gói mà một game gacha di động bán bằng tiền thật — nhưng ở đây
   * TẤT CẢ ĐỀU 0đ, bấm bao nhiêu lần cũng được.
   *
   * Vì sao dựng hẳn một quầy nạp thay vì rắc thêm tiền vào chỗ khác: bản gốc khoá
   * vé và Pikke sau đồng hồ thật vì nó là game dịch vụ — chặn được người chơi
   * ngày nào là bán được vé ngày đó. Bản này không bán gì cho ai, nên cái khoá ấy
   * chẳng đổi lấy được thứ gì, chỉ làm người chơi ngồi chờ. Để nguyên hình dạng
   * "gói nạp" (có cả giá gạch đi) thì nhìn là hiểu ngay đây vốn là chỗ móc ví, và
   * ở bản này nó được cho không.
   *
   * Giá gạch đi là giá TƯỞNG TƯỢNG, không phải giá thật của game nào cả.
   *
   * Hệ quả, nói thẳng: vé và Gem thành vô hạn, cú quay không còn là lựa chọn phải
   * cân nhắc. Thứ DUY NHẤT vẫn khan đúng như thiết kế là LÕI RỒNG — quầy này
   * không phát, không quầy nào bán, nên bậc Tiến hoá vẫn giữ nguyên sức nặng, và
   * quay trúng đồ trùng vẫn là đường duy nhất tới nó. */
  G.IAP = [
    { id:'i_start', n:'Gói Tân Thủ',   was:'99.000đ',  give:{ticket:20, gem:300, pikke:2000, gold:100000} },
    { id:'i_tick',  n:'Túi Vé ×60',    was:'179.000đ', give:{ticket:60} },
    { id:'i_gem',   n:'Túi Gem ×1.500',was:'249.000đ', give:{gem:1500} },
    { id:'i_pikke', n:'Túi Pikke ×5.000', was:'129.000đ', give:{pikke:5000} },
    { id:'i_gold',  n:'Túi Gold ×500.000', was:'99.000đ', give:{gold:500000} },
    { id:'i_medal', n:'Túi Medal ×300', was:'199.000đ', give:{medal:300} },
    { id:'i_mat',   n:'Túi Nguyên Liệu', was:'149.000đ',
      give:{mat:{str_stone:100, skill_core:100, crystal:50, lapis_b:30, lapis_a:20, lapis_s:10, lapis_ss:5}} },
    { id:'i_all',   n:'Gói Đại Gia',   was:'999.000đ',
      give:{ticket:200, gem:5000, pikke:20000, gold:2000000, medal:1000} }
  ];

  /* ------------------------------------------------------------- NPC ----- */
  G.NPCS = ['Pamela', 'Pikke', 'Sylvie', 'Axel', 'Linton', 'Ange', 'Aine', 'Gawen', 'Jild'];
  // Ba đồng đội NPC thay cho co-op 4 người của bản gốc.
  G.ALLY_NAMES = ['Sylvie', 'Axel', 'Linton'];

  /* ------------------------------------------------- HẰNG SỐ CÂN BẰNG ---- */
  G.BAL = {
    baseHp: 420, hpPerLv: 46,          // Lv1 420 máu -> Lv60 ~3100
    baseAtk: 32, atkPerLv: 4.2,
    baseDef: 10, defPerLv: 2.6,
    baseSpd: 2.35,                     // px/frame ở 60fps
    dodgeDist: 118, dodgeMs: 300, dodgeIFrameMs: 210, dodgeCdMs: 420,
    fatigueMax: 100, fatigueWeakGain: 3.2, fatigueNormalGain: 0.55,
    downMs: 8000, downDmgMul: 2.5,     // gục -> ăn sát thương ×2.5
    weakMul: 2.2,                      // đánh trúng WEAK point
    partHpFrac: 0.16,                  // máu mỗi bộ phận = 16% máu boss
    partBrokenMul: 1.25,               // phá xong thì vùng đó ăn thêm sát thương
    // Solo: khong co dong doi toi cuu. Nguoi choi co san may luot tu dung day.
    reviveCount: 3, selfReviveMs: 4000, reviveMs: 3000, reviveRadius: 70,
    questMs: 300000,                   // 5 phút, đúng giới hạn Tower Clearing
    expToLv: function (lv) { return Math.floor(60 * Math.pow(lv, 1.45)); },
    // Điều kiện thưởng gem của Sudden Behemoth (wiki): 3 điều kiện + 1 bonus = tối đa 4 gem.
    gemNoDeath: 1, gemUsedSkill: 1, gemFastMs: 120000, gemAllBonus: 1
  };

  /* ------------------------------------------------ NGƯỠNG PUNICON ------- */
  // [TÁI DỰNG] — không nguồn nào công bố. Xem RESEARCH.md mục 1.
  G.PUNI = {
    ringR: 58,        // bán kính vòng ngoài của cần gạt ảo
    knobR: 26,
    dead: 12,         // vùng chết: kéo dưới ngưỡng này thì không tính là di chuyển
    tapMs: 180,       // nhả trước mốc này + kéo < dead  => TAP (đánh)
    holdMs: 260,      // giữ yên quá mốc này            => đặc thù vũ khí
    holdZone: 20,     // GIỮ chỉ tính khi cần gạt còn nằm trong ngần này kể từ gốc,
                      // tức nhân vật đang đứng yên. Kéo ra chạy thì không bao giờ
                      // tự thành đòn đặc thù. Xem đầu js/punicon.js.
    flickV: 1.05,     // px/ms lúc nhả  => FLICK (né)
    flickWindowMs: 90,
    comboMs: 450      // cửa sổ nối combo sau khi đòn trước kết thúc
  };

  /* ------------------------------------------------------- TIỆN ÍCH ------ */
  G.behemothById = function (id) { return G.BEHEMOTHS.find(function (b) { return b.id === id; }); };
  G.areaById = function (id) { return G.AREAS.find(function (a) { return a.id === id; }); };
  G.matById = function (id) { return G.MATERIALS[id]; };

  // Dựng danh sách ải sau cùng, vì nó cần G.behemothById và G.areaById.
  G.buildStages();

  G.rollRank = function (rates, rnd) {
    var r = rnd(), acc = 0;
    for (var k in rates) { acc += rates[k]; if (r < acc) return k; }
    return Object.keys(rates)[Object.keys(rates).length - 1];
  };
})(window.DP = window.DP || {});
