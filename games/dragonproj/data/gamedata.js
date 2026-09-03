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
  /* Số quái cắt xuống vì TTK dài gấp 4–5 lần: một đợt 20 giây mà nhân 5 lần thì
   * thành 100 giây, chết trên điện thoại. Kèm theo là HỆ THẺ ĐÁNH (xem
   * G.TOKENS): chỉ con nào giữ thẻ mới được ra đòn, số còn lại làm bộ hung hăng
   * nhưng không đánh. Chuẩn ngành, và nó là cái giữ cho màn hình đọc được. */
  G.ARENA = { w: 820, h: 1080, maxMobs: 9, wave: 6 };

  // Nhẹ 3–5 con / 1 thẻ · thường 5–8 con / 2 thẻ · cao trào 8–12 con / 3 thẻ.
  // KHÔNG BAO GIỜ quá 3 — quá đó thì người chơi không theo dõi nổi trên màn dọc.
  G.TOKENS = { max: 3, byCount: function (n) { return n <= 4 ? 1 : n <= 7 ? 2 : 3; },
               cadenceMs: 2400 };      // nhịp đánh trung bình mỗi con: 2–3 giây

  /* Ngân sách đạn trên màn (SHOOTER.md §5.1). Nghiên cứu IEEE GEM 2014 đo được
   * rằng giữ nguyên kích thước phần tử khi màn hình nhỏ lại cho ra game "khó hơn
   * nhiều" — và người chơi NHẬN RA rồi bực. ~90 viên trên điện thoại tương đương
   * ~300 viên trên desktop. */
  G.DANMAKU = { softCap: 90, hardCap: 130,
                // n_max = 2πd / (2·r_đạn + 2·r_người + M), M là biên sai số cảm ứng
                ringMax: 20, fadeInMs: 140 };

  G.FEEL = {
    /* HITSTOP theo thang Nuclear Throne, đọc từ sleep.gml của bản giải mã:
     *   đạn nảy tường 1ms · đĩa/plasma trúng 10 · quái nổ 20 · boss chết 50 ·
     *   nổ lớn 100. Mỗi bậc gấp ~2–2,5 lần.
     * Bản cũ để nhát NHẸ NHẤT là 50ms — bằng cả cú boss chết của Nuclear Throne
     * — và nặng nhất 210ms. Bắn 5 phát/giây (200ms một phát) mà hitstop 50ms là
     * đứng hình 25% thời gian. Luật: hitstop <= 20% khoảng cách hai phát.
     * Và hitstop leo thang theo SỰ KIỆN, không theo sát thương. */
    hitstop: { tick: 1, light: 10, mid: 20, heavy: 50, kill: 60, elite: 80, boom: 100, crit: 30 },
    hitstopMax: 110,        // trần, để nhiều đòn trúng cùng lúc không đứng hình
    /* RUNG giảm một nửa so với số desktop: 10px trên màn 6 inch cầm cách mặt
     * 30cm dữ dội hơn hẳn cùng số đó trên màn hình bàn. Và biên độ ĐỒNG THỜI là
     * thời lượng tính bằng khung, vì rung nhẹ giảm tuyến tính 1 đơn vị/khung
     * (mẹo của Nuclear Throne: chỉnh một số thay vì hai). */
    shake:   { light: 2, mid: 4, heavy: 7, finish: 8, quake: 10 },
    shakeMax: 14,
    // Đá camera CÓ HƯỚNG, về phía bắn — kênh riêng, không gộp vào rung.
    kickDecay: 0.40,        // −40% mỗi khung
    recoilRecover: 1,       // sprite súng lùi rồi hồi 1px/khung
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
   * VŨ KHÍ — SÁU LỚP BẮN
   *
   * Trước đây là bốn cây cận chiến + một cây cung, mỗi cây một CHUỖI COMBO.
   * Giờ cả sáu đều bắn. Xem SHOOTER.md để biết vì sao đổi và số ở đâu ra.
   *
   * LUẬT PHÂN BIỆT (SHOOTER.md §3.1). DPS bền của mọi archetype trong Enter the
   * Gungeon gần như BẰNG NHAU — AK 42,3 · shotgun 29,1 · sniper 22,6, chênh ~2
   * lần — nhưng sát thương MỖI LẦN BẤM chênh mười lần: SMG 3,2 · shotgun 24 ·
   * sniper 26 · Railgun 50 · Prototype Railgun 150. Trong game né đạn, cái quyết
   * định không phải DPS mà là sát thương gom được trong một cửa sổ an toàn 0,4
   * giây. Nên mỗi lớp GIỎI NHẤT ĐÚNG MỘT TRỤC và TỆ NHẤT HAI TRỤC.
   *
   * TẦM BẮN LÀ HỆ QUẢ, không phải con số chỉnh tay thứ ba (luật của Realm of the
   * Mad God, kiểm chứng: Staff of the Cosmic Whole 18 × 0,475 = 8,55 ✓):
   *
   *     range = spd × life / 16,67      (px, ở 60fps)
   *
   * Hết cảnh ba con số mâu thuẫn nhau.
   *
   * TỐC ĐỘ ĐẠN. Nuclear Throne (đọc từ mã nguồn giải mã): người chơi 4 px/khung,
   * đạn người chơi 16 = 4×, đạn quái ~4 = 1×. Bất đối xứng đó là con số quan
   * trọng nhất trong cả hệ — đạn quái luôn đi bộ tránh được. Người chơi ở đây
   * chạy 2,35 px/khung, nên đạn chuẩn là 9,4.
   *
   * SÁT THƯƠNG là số nguyên nhỏ (Soul Knight: AK-47 = 3, Crossbow = 8,
   * Broadsword = 12, Soul Calibre = 25). Con số ở đây là GỐC; sát thương thật
   * mỗi viên = dmg × ATK/10.
   *
   * Trường của một cây:
   *   dmg    sát thương gốc mỗi viên      shots  số viên mỗi phát
   *   arcGap độ giữa hai viên (quạt cố định)     spread jitter ngẫu nhiên (độ)
   *   rpm    phát mỗi phút                spd    px/khung
   *   life   ms sống của viên đạn         r      bán kính đạn
   *   crit   tỉ lệ chí mạng gốc           sideMul hệ số cho viên phụ
   * ====================================================================== */

  // Hitstop theo thang Nuclear Throne (sleep.gml): 1/10/20/50/100 ms, mỗi bậc
  // gấp ~2–2,5 lần. Bản cũ để nhát nhẹ nhất 50ms — bằng cả cú boss chết của NT —
  // nên bắn 5 phát/giây là đứng hình. Luật: hitstop <= 20% khoảng cách hai phát.
  var HS = { tick: 1, light: 10, mid: 20, heavy: 50, boom: 100 };

  var PSPD = 2.35;          // tốc chạy người chơi, px/khung (G.BAL.baseSpd)

  G.WEAPONS = {
    /* --- SÚNG TRƯỜNG: cây tham chiếu. Mọi cây khác đọc được nhờ so với nó. --- */
    rifle: {
      id: 'rifle', vi: 'Súng Trường', jp: '突撃銃', en: 'Assault Rifle',
      desc: 'Cây chuẩn. Bắn đều, tầm xa, tản đạn hẹp, trượt một phát không đau. Không giỏi nhất chỗ nào ngoài việc lúc nào cũng đúng.',
      dmg: 4, shots: 1, arcGap: 0, spread: 4,
      rpm: 300,                       // 5 phát/giây — dải "cảm giác tốt" của rifle
      spd: PSPD * 4, life: 620,       // tầm ~350px
      r: 7, crit: 0.12,
      moveMul: 1.00, dodgeMul: 1.00, auto: true,
      hs: HS.light, shake: 2, kick: 5, recoil: 4, knock: 0,
      poise: 7, kb: 4,
      // Giữ nút thì càng bắn càng toè ra, nhả một nhịp thì thu lại. Đây là cái
      // phạt việc giữ cò vô tội vạ mà không phải hạ DPS.
      bloomPer: 1.1, bloomMax: 9, bloomCool: 7,
      trait: 'DPS bền cao nhất, tầm dài, phạt nhẹ khi trượt.'
    },

    /* --- SÚNG SĂN: burst cận cảnh. Tầm NGẮN NHẤT game, và đó là cái giá. --- */
    shotgun: {
      id: 'shotgun', vi: 'Súng Săn', jp: '散弾銃', en: 'Shotgun',
      desc: 'Sáu viên một phát, toè rộng, tầm cực ngắn. Đứng sát mặt thì cả sáu viên vào một con; đứng xa thì trúng được một hai viên là may.',
      dmg: 2, shots: 6, arcGap: 8, spread: 3,   // quạt 40° = ±20°, đúng Nuclear Throne
      rpm: 84,                                   // 1,4 phát/giây
      spd: PSPD * 3.4, life: 310,                // tầm ~149px — ngắn nhất game
      r: 6, crit: 0.08, sideMul: 1.0,
      moveMul: 1.05, dodgeMul: 1.05, auto: false,
      hs: HS.mid, shake: 8, kick: 15, recoil: 8, knock: 2,
      poise: 5, kb: 9,                           // lực văng lớn: mua lại khoảng cách
      trait: 'Burst mỗi lần bấm cao nhất, nhưng phải áp sát và trượt thì rất đau.'
    },

    /* --- BẮN TỈA: đổi nhịp lấy sức. Đạn gần như tức thời, xuyên cả hàng. --- */
    sniper: {
      id: 'sniper', vi: 'Súng Bắn Tỉa', jp: '狙撃銃', en: 'Sniper Rifle',
      desc: 'Một phát một viên, xuyên hết cả hàng đứng sau. Đạn nhanh tới mức gần như không phải ngắm đón. Bắn hụt thì đứng nhìn cả giây.',
      dmg: 22, shots: 1, arcGap: 0, spread: 0,   // tản đạn BẰNG KHÔNG
      rpm: 54,                                    // 0,9 phát/giây
      spd: PSPD * 10, life: 900,                  // xuyên hết sân
      r: 8, crit: 0.30,                           // lớp crit, đúng Soul Knight
      moveMul: 0.90, dodgeMul: 0.95, auto: false,
      pierce: true, pierceFall: 0.33,             // −33% mỗi con xuyên qua
      hs: HS.heavy, shake: 6, kick: 14, recoil: 9, knock: 0,
      poise: 24, kb: 6,
      trait: 'Tầm và burst tối đa, xuyên hàng; đổi lại DPS bền thấp nhất và trượt rất đau.'
    },

    /* --- CUNG: vũ khí của VỊ TRÍ. Nạp bốn nấc + dải chí mạng. --- */
    bow: {
      id: 'bow', vi: 'Cung', jp: '弓矢', en: 'Bow',
      desc: 'Giữ để nạp bốn nấc — nạp càng sâu càng nhiều mũi và càng dễ chí mạng. Và có một KHOẢNG CÁCH ngọt: đứng đúng tầm thì mỗi mũi đau gấp rưỡi.',
      dmg: 6, shots: 1, arcGap: 7, spread: 0, sideMul: 0.40,
      rpm: 170,
      spd: PSPD * 5.1, life: 700,                 // tầm ~504px
      r: 7, crit: 0.10,
      moveMul: 1.00, dodgeMul: 1.00, auto: false,
      hs: HS.mid, shake: 0, kick: 10, recoil: 6, knock: 0,   // rung = 0: cây chính xác
      poise: 12, kb: 5,
      charge: true,
      // Hình dáng đường cong nạp lấy của Monster Hunter, cố ý phạt nặng ở đáy:
      // nấc 1 là 0,40× — chưa tới một nửa nấc 2. Nấc 4 chỉ hơn nấc 3 có 13% nên
      // MH khoá nó sau một kỹ năng; ở đây nó là phần thưởng cho việc giữ trọn.
      chargeMs: [0, 240, 480, 760],               // mốc thời gian từng nấc
      chargeMul: [0.40, 1.00, 1.50, 1.70],        // hệ số vật lý
      chargeElem: [0.70, 0.85, 1.00, 1.125],      // hệ số hệ — đường cong PHẲNG hơn
      chargeShots: [1, 1, 2, 3],                  // nạp tăng SỐ MŨI, không chỉ tăng số
      chargeCrit: [0.00, 0.10, 0.35, 0.60],       // crit nạp theo (Soul Knight)
      // Nạp KHÔNG làm chậm; chỉ khi NGẮM mới chậm (Kiranico MHW Bow). Đây là
      // quyết định cảm giác hay nhất trong cả bộ nghiên cứu.
      chargeMoveMul: 1.00, aimMoveMul: 0.45,
      // Né huỷ nạp là MIỄN PHÍ, và phát sau khi né bắt đầu cao hơn một nấc.
      dodgeKeepsCharge: true, dodgeChargeBonus: 1,
      // DẢI CHÍ MẠNG (MH4U/MHGen/MHGU, Laxaria). Phạt BẤT ĐỐI XỨNG: quá gần chỉ
      // MẤT thưởng, quá xa mới BỊ PHẠT. Nó đẩy người chơi tiến vào chỗ nguy hiểm.
      critDist: { bands: [90, 150, 250, 330, 420, 504],
                  mul:   [1.00, 1.50, 1.00, 0.80, 0.50] },
      trait: 'Thưởng cho việc đứng đúng chỗ và nạp trọn. Không giỏi nhất trục nào, nhưng ở dải ngọt thì trên mọi cây.'
    },

    /* --- GẬY PHÉP: DPS đến từ SỐ ĐẠN, không phải sát thương mỗi viên. --- */
    staff: {
      id: 'staff', vi: 'Gậy Phép', jp: '魔法杖', en: 'Staff',
      desc: 'Năm tia toè hình quạt, mỗi tia yếu nhưng phủ kín cả đám. Có nhịp NIỆM ngắn trước khi tia bay ra — bị đánh trúng lúc đó thì mất trắng.',
      dmg: 3, shots: 5, arcGap: 12, spread: 0, sideMul: 1.0,   // quạt 48°
      rpm: 108,                                   // 1,8 phát/giây — nhịp đều của lớp gậy
      spd: PSPD * 3, life: 640,                   // tầm ~269px
      r: 9, crit: 0.10,
      moveMul: 0.95, dodgeMul: 1.00, auto: true,
      // CAST DELAY NGẮT ĐƯỢC — bản sắc của lớp, và là cái giá của việc bắn 5 tia
      // một lúc. Wiki Soul Knight: "Nếu động tác niệm bị ngắt, không có gì xảy ra."
      castMs: 260, castInterrupt: true, castMoveMul: 0.55,
      homing: 2.2,                                // độ/khung — đuổi nhẹ, không bám dính
      hs: HS.light, shake: 3, kick: 4, recoil: 3, knock: 0,
      poise: 6, kb: 3,
      trait: 'Phủ diện rộng và tự đuổi, nhưng đơn mục tiêu thì yếu và niệm thì ngắt được.'
    },

    /* --- SÚNG PHÓNG: dọn đám. Đạn CHẬM cố ý — đó là cái làm nó đọc được. --- */
    launcher: {
      id: 'launcher', vi: 'Súng Phóng', jp: '擲弾筒', en: 'Launcher',
      desc: 'Một quả bay chậm rồi nổ trùm cả vùng. Đạn chậm là cố ý: nó cho cả bạn lẫn quái kịp thấy quả đạn đang tới.',
      dmg: 6, shots: 1, arcGap: 0, spread: 3,
      rpm: 48,                                    // 0,8 phát/giây
      spd: PSPD * 2, life: 900,                   // tầm ~254px, chậm và thấy rõ
      r: 11,
      // Explosive KHÔNG BAO GIỜ chí mạng — luật của Soul Knight, giữ nguyên vì nó
      // là cái ngăn AoE cộng dồn với crit thành hai lần nhân chồng lên nhau.
      crit: 0, noCrit: true,
      explode: { dmg: 14, r: 90 },
      moveMul: 0.88, dodgeMul: 0.92, auto: false,
      hs: HS.boom, shake: 4, kick: 30, recoil: 10, knock: 0,   // đá camera to, rung nhỏ: NẶNG chứ không hỗn loạn
      poise: 30, kb: 12, quake: true,
      trait: 'Dọn cả đám một phát, nhưng đạn chậm nên đơn mục tiêu thì dễ hụt.'
    },

    /* --- TIA NHIỆT: DPS bền cao nhất, nhưng phải ĐỨNG YÊN mà ghì. ---
     * Beam KHÔNG bắn ra viên đạn nào. Nó là một tia chạm tức thời, ăn sát thương
     * theo NHỊP TICK trong suốt lúc giữ cò. Enter the Gungeon để MỌI súng beam ở
     * đúng fireRate 0,10 giây, tức 10 tick/giây, và ghi sát thương thẳng dạng
     * "X/giây" thay vì per-tick — lấy nguyên con số đó làm chuẩn cho cả hệ.
     * (_research/gungeon.md, mục beam/laser)
     *
     * Sát thương mỗi tick TĂNG DẦN theo thời gian giữ, đúng Ion Laser của Soul
     * Knight: 4/tick, lên 5 sau 10 tick, lên 6 sau 23 tick — tức ×1,25 rồi ×1,50.
     * Đây là cái làm laser khác một khẩu súng bắn nhanh: phần thưởng nằm ở chỗ
     * DÁM đứng yên cho hết đường ramp, và mỗi lần né là mất sạch nó.
     * ([Ion Laser](https://soul-knight.fandom.com/wiki/Ion_Laser)) */
    laser: {
      id: 'laser', vi: 'Tia Nhiệt', jp: '光線銃', en: 'Laser',
      desc: 'Một tia liền mạch, xuyên hết cả hàng, không có viên đạn nào để mà né. Giữ càng lâu tia càng nóng — nhưng nhấc tay một cái là nguội về đầu.',
      mode: 'beam',
      dmg: 1.6, shots: 1, arcGap: 0, spread: 0,
      rpm: 600,                       // 10 tick/giây — chuẩn beam của Gungeon
      spd: 0, life: 0, beamLen: 330, beamW: 13,
      r: 7, crit: 0.05,
      pierce: true, pierceFall: 0.12,   // xuyên gần như không mất gì: đó là bản sắc
      rampAt: [10, 23], rampMul: [1.25, 1.50],
      moveMul: 0.62, dodgeMul: 1.00, auto: true,
      hs: HS.tick, shake: 1, kick: 2, recoil: 2, knock: 0,
      poise: 4, kb: 1,
      trait: 'DPS bền cao nhất khi đứng yên đủ lâu; đổi chỗ liên tục thì tệ nhất game.'
    },

    /* --- KIẾM KHÍ: nhát chém bay ra khỏi lưỡi. ---
     * Không phải "súng bắn hình lưỡi liềm": cái khác nằm ở BỀ NGANG. Một viên đạn
     * rộng 46px thì nó là một BỨC TƯỜNG quét ngang, và mắt đọc nó theo diện chứ
     * không theo tia. Đó là lý do nó xuyên gần như miễn phí mà vẫn không thay được
     * súng trường: tầm chỉ bằng một nửa. */
    blade: {
      id: 'blade', vi: 'Kiếm Khí', jp: '剣気', en: 'Blade Wave',
      desc: 'Vung một nhát và cái nhát đó bay đi. Lưỡi khí rộng bằng ba người, xuyên hết cả hàng, nhưng đi được nửa sân là tan.',
      dmg: 9, shots: 1, arcGap: 0, spread: 2,
      rpm: 132,                        // 2,2 nhát/giây
      spd: PSPD * 3.8, life: 330,      // tầm ~177px
      r: 22, crit: 0.15, wave: true, waveW: 46,
      pierce: true, pierceFall: 0.20,  // xuyên rẻ hơn bắn tỉa, vì tầm ngắn hơn nhiều
      moveMul: 1.02, dodgeMul: 1.05, auto: false,
      hs: HS.mid, shake: 4, kick: 8, recoil: 7, knock: 0,
      poise: 14, kb: 8,
      trait: 'Quét cả hàng ở tầm gần-trung; đơn mục tiêu tầm xa thì vô dụng.'
    },

    /* --- LƯỠI HÁI: ba lưỡi xoay quanh thân. ---
     * KHÔNG có bản gốc để chép. Soul Knight không có vũ khí orbit nào — thứ gần
     * nhất là skill "Battle Storm" và mấy con drone bay kèm hai bên, cả hai đều
     * không phải xoay-quanh-thân (_research/soulknight.md mục 2.4). Nên phần này
     * lấy khuôn King Bible của Vampire Survivors và TỰ ĐẶT SỐ. Ghi rõ như vậy.
     *
     * [TÁI DỰNG] Ba luật giữ cho nó không thành "bấm một lần rồi khỏi lo":
     *   1. Bán kính 76px — NGẮN HƠN tầm với của gần hết quái cận chiến, nên muốn
     *      lưỡi chạm được thì phải đứng trong tầm bị đánh.
     *   2. Mỗi lưỡi chỉ ăn lại một mục tiêu sau 600ms, không phải mỗi khung.
     *   3. Lưỡi XOÁ ĐẠN QUÁI khi chạm. Đây là cái mua lại chỗ đứng nguy hiểm kia,
     *      và là lý do lớp này tồn tại thay vì chỉ là một vòng sát thương. */
    /* --- SÚNG QUAY: cây của SỰ CAM KẾT. Nhịp bắn LEO, không cố định. ---
     * Trục cảm giác chưa lớp nào chiếm: mọi cây khác có một nhịp bắn và giữ
     * nguyên nhịp đó. Cây này bắt đầu chậm hơn cả súng phóng rồi leo lên nhanh
     * hơn cả súng trường — nhưng nhấc tay là tuột hết về đáy.
     *
     * Khác tia nhiệt ở chỗ nào: tia nhiệt leo SÁT THƯƠNG mỗi tick, cây này leo
     * NHỊP. Nghe giống nhau nhưng chơi khác hẳn — tia nhiệt phải giữ tia dính
     * vào một con, còn cây này quay đủ vòng rồi thì quét ngang cả đám cũng
     * không tuột nhịp. Một cây thưởng cho việc NGẮM ĐÚNG, cây kia thưởng cho
     * việc DÁM ĐỨNG LẠI. */
    gatling: {
      id: 'gatling', vi: 'Súng Quay', jp: '回転銃', en: 'Gatling',
      desc: 'Nòng phải quay đủ vòng mới bắn nhanh được. Ba giây đầu chậm như súng phóng, sau đó nhanh hơn mọi cây trong game. Nhấc tay một nhịp là tuột hết về đáy.',
      mode: 'spin',
      dmg: 3.8, shots: 1, arcGap: 0, spread: 7,
      rpm: 180,                        // nhịp NỀN; nhịp thật nhân theo vòng quay
      spinMs: 2600,                    // bao lâu thì đạt vòng tối đa
      spinMul: [0.55, 2.30],           // nhịp ở vòng 0 và vòng tối đa
      spinDecay: 2.2,                  // tuột nhanh gấp 2,2 lần lúc lên
      spd: PSPD * 3.8, life: 630,
      r: 7, crit: 0.07,
      moveMul: 0.52, dodgeMul: 0.85, auto: true,
      bloomPer: 0.7, bloomMax: 12, bloomCool: 9,
      hs: HS.light, shake: 3, kick: 4, recoil: 3, knock: 0,
      poise: 6, kb: 3,
      trait: 'DPS đỉnh cao nhất game khi quay đủ vòng, nhưng chậm chân nhất và mất hết nếu phải né.'
    },

    /* --- LUÂN XA: cây DUY NHẤT ăn sát thương HAI LẦN trên cùng một đường bay.
     * Đĩa bay ra rồi QUAY VỀ. Đứng yên thì lượt về đi qua đúng chỗ lượt đi đã
     * đi, nên cả hai lượt trúng cùng một hàng — nhưng nếu vừa ném vừa chạy thì
     * lượt về quét một đường KHÁC, và đó là chỗ cây này có chiều sâu.
     *
     * Không lẫn với lưỡi hái: lưỡi hái xoay quanh CHÂN mình và không đi đâu cả;
     * luân xa đi xa rồi mới về. Một cây phòng thủ, một cây tấn công tầm trung. */
    chakram: {
      id: 'chakram', vi: 'Luân Xa', jp: '輪刃', en: 'Chakram',
      desc: 'Ném một đĩa lưỡi bay đi rồi quay ngược về tay. Cùng một đường bay ăn sát thương hai lượt — và nếu bạn di chuyển thì lượt về quét một đường mới.',
      mode: 'boomerang',
      dmg: 8, shots: 1, arcGap: 0, spread: 2,
      rpm: 78,
      spd: PSPD * 3.6, life: 1100,
      outMs: 420,                      // bao lâu thì đĩa quay đầu
      backMul: 0.85,                   // lượt về ăn 85% sát thương lượt đi
      spinDeg: 900,                    // độ/giây, chỉ để vẽ
      pierce: true, pierceFall: 0.18,
      r: 12, crit: 0.14,
      moveMul: 1.02, dodgeMul: 1.00, auto: false,
      hs: HS.mid, shake: 2, kick: 6, recoil: 4, knock: 0,
      poise: 11, kb: 6,
      trait: 'Ăn hai lượt trên một lần ném, và đường về đổi theo chỗ bạn đứng.'
    },

    /* --- SÚNG PHUN LỬA: không có viên đạn nào. Một hình NÓN ngắn, liên tục.
     * Trục riêng: đây là cây duy nhất mà sát thương chính KHÔNG nằm ở lúc trúng
     * mà nằm ở vết BỎNG để lại. Bắn hai giây rồi bỏ chạy thì cả đám vẫn cháy.
     *
     * Khác tia nhiệt: tia nhiệt là một ĐƯỜNG mảnh, xuyên xa, phải ngắm. Cây này
     * là một VÙNG nón rộng, tầm rất ngắn, gần như không cần ngắm. */
    flame: {
      id: 'flame', vi: 'Súng Phun Lửa', jp: '火炎放射', en: 'Flamethrower',
      desc: 'Một nón lửa ngắn, phủ kín cả đám trước mặt. Sát thương lúc trúng thì nhẹ, nhưng cái nó để lại là vết bỏng chồng được nhiều lớp.',
      mode: 'cone',
      dmg: 0.62, shots: 1, arcGap: 0, spread: 0,
      rpm: 480,                        // 8 tick/giây
      spd: 0, life: 0,
      coneLen: 168, coneArc: 0.85,     // ~49 độ
      burnStack: 4, burnPerTick: 0.55, // chồng tối đa 4 lớp bỏng
      r: 6, crit: 0,  noCrit: true,
      moveMul: 0.78, dodgeMul: 0.95, auto: true,
      hs: HS.tick, shake: 1, kick: 2, recoil: 1, knock: 0,
      poise: 3, kb: 1,
      trait: 'Sát thương theo thời gian mạnh nhất và phủ rộng nhất, nhưng tầm ngắn nhì game và không bao giờ chí mạng.'
    },

    /* --- ROI XÍCH: quét một CUNG rộng trước mặt và KÉO cái gì trúng lại gần.
     * Trục riêng: cây duy nhất DI CHUYỂN kẻ địch về phía mình. Nó không giết
     * nhanh — nó gom đám lại thành một cục cho những cây khác (và cho ulti) dọn.
     *
     * Khác súng săn: súng săn cũng cận cảnh nhưng ĐẨY RA để mua khoảng cách.
     * Roi xích làm ngược lại, và hai thứ đó dẫn tới hai lối chơi trái ngược. */
    whip: {
      id: 'whip', vi: 'Roi Xích', jp: '鎖鞭', en: 'Chain Whip',
      desc: 'Quất một cung rộng trước mặt, trúng ai thì giật người đó về phía mình. Cây duy nhất gom được đám đông lại thành một cục.',
      mode: 'arc',
      dmg: 4.6, shots: 1, arcGap: 0, spread: 0,
      rpm: 96,
      spd: 0, life: 0,
      arcLen: 132, arcSpan: 2.2,       // ~126 độ
      pull: 26,                        // px giật về mỗi cú trúng
      r: 10, crit: 0.11,
      moveMul: 0.94, dodgeMul: 1.00, auto: false,
      hs: HS.mid, shake: 4, kick: 7, recoil: 5, knock: 0,
      poise: 16, kb: 0,                // kb = 0: nó KÉO chứ không đẩy
      trait: 'Gom đám đông lại một chỗ. Sát thương trung bình, nhưng nó quyết định trận đấu diễn ra Ở ĐÂU.'
    },

    scythe: {
      id: 'scythe', vi: 'Lưỡi Hái', jp: '大鎌', en: 'Scythe',
      desc: 'Ba lưỡi bung ra xoay quanh người. Cái gì lại gần thì bị băm, và đạn quái bay vào thì bị chặt rụng.',
      mode: 'orbit',
      dmg: 4, shots: 3, arcGap: 120, spread: 0,
      // Nhịp bung phải DÀI HƠN thời gian lưỡi sống, không thì lưỡi cũ chưa tan
      // mà lưỡi mới đã ra và chúng dồn đống lên nhau — DPS tự nhân đôi theo thời
      // gian giữ cò, mà không ai chủ ý thiết kế như vậy.
      rpm: 24,                         // 2,5 giây một lần bung
      spd: 0, life: 2600,              // lưỡi sống 2,6 giây
      orbitR: 76, orbitSpin: 300,      // độ/giây
      reHitMs: 600, cutsBullets: true,
      r: 15, crit: 0.10,
      moveMul: 1.00, dodgeMul: 1.00, auto: false,
      hs: HS.light, shake: 2, kick: 3, recoil: 5, knock: 0,
      poise: 10, kb: 5,
      trait: 'DPS cao nhất ở cự ly bằng không, và là cây DUY NHẤT chặn được đạn quái.'
    },

    /* --- TRƯỢNG CẦU LỬA: ném theo vòng cung, nổ ở CHỖ ĐÃ CHỌN. ---
     * Khác Súng Phóng ở đúng một điểm, và điểm đó đổi hẳn cách dùng: quả cầu bay
     * TRÊN KHÔNG nên nó không va vào gì giữa đường. Súng phóng bắn thẳng, gặp con
     * đầu tiên là nổ ngay tại đó; cầu lửa bỏ qua cả hàng đầu và rơi đúng xuống chỗ
     * đã chỉ. Đó là vũ khí của người muốn đánh vào HÀNG SAU. */
    orb: {
      id: 'orb', vi: 'Trượng Cầu Lửa', jp: '火球杖', en: 'Fire Orb Staff',
      desc: 'Ném một quả cầu lửa vòng cung qua đầu cả đám, rơi đúng chỗ đã chỉ rồi nổ. Bay trên không nên giữa đường không có gì chặn được.',
      mode: 'lob',
      dmg: 5, shots: 1, arcGap: 0, spread: 4,
      rpm: 72,                         // 1,2 quả/giây
      spd: PSPD * 2.6, life: 1200,
      lobMin: 90, lobMax: 300,         // tầm rơi; gần hơn thì rơi ở tầm tối thiểu
      r: 10, crit: 0, noCrit: true,    // nổ thì không chí mạng (luật Soul Knight)
      explode: { dmg: 11, r: 74 },
      moveMul: 0.94, dodgeMul: 0.98, auto: true,
      hs: HS.heavy, shake: 3, kick: 12, recoil: 6, knock: 0,
      poise: 18, kb: 8,
      trait: 'Đánh thẳng vào hàng sau vì đạn bay trên không; bù lại có độ trễ rơi nên trượt mục tiêu đang chạy.'
    }
  };

  /* Tầm bắn là HỆ QUẢ của tốc độ và thời gian sống, không phải số thứ ba. Tính
   * một lần ở đây để mọi chỗ khác đọc W.range thay vì tự nhân lại. */
  Object.keys(G.WEAPONS).forEach(function (k) {
    var W = G.WEAPONS[k];
    // Ba lớp không có "viên đạn bay" nên tầm KHÔNG suy ra được từ tốc x thời gian
    // sống; mỗi lớp khai báo tầm của riêng nó. Để công thức chung chạy qua chúng
    // thì ra tầm 0, và mọi thứ đọc W.range — kể cả tầm khoá mục tiêu tự động — hỏng.
    W.range = W.mode === 'beam' ? W.beamLen
            : W.mode === 'orbit' ? W.orbitR
            : W.mode === 'lob' ? W.lobMax
            : W.mode === 'cone' ? W.coneLen
            : W.mode === 'arc' ? W.arcLen
            // Luân xa: tầm là chỗ đĩa QUAY ĐẦU, không phải chỗ nó tan. Đo tới
            // chỗ tan thì con số gấp đôi sự thật, và bot sẽ đứng xa gấp đôi mức
            // cần thiết rồi ném vào không khí.
            : W.mode === 'boomerang' ? Math.round(W.spd * W.outMs / 16.67)
            : Math.round(W.spd * W.life / 16.67);
    W.shotMs = 60000 / W.rpm;
    // DPS lý thuyết ở ATK gốc, để test khoá lại dải cân bằng.
    var side = (W.sideMul === undefined ? 1 : W.sideMul);
    var perShot = W.dmg * (1 + (W.shots - 1) * side);
    if (W.explode) perShot += W.explode.dmg;
    W.burst = perShot;                    // sát thương một lần bấm
    if (W.charge) {
      // Cây nạp lực đo ở nấc 3 — nấc người chơi thật sự dùng. Nấc 4 chỉ hơn 13%
      // nên nó là phần thưởng cho việc giữ trọn, không phải nhịp mặc định.
      var lv = 2, n = W.chargeShots[lv];
      W.burst = W.dmg * W.chargeMul[lv] * (1 + (n - 1) * side);
      W.dps = W.burst / ((W.chargeMs[lv] + W.shotMs) / 1000);
    } else {
      W.dps = perShot * (W.rpm / 60);
    }
    // Lưỡi xoay ăn LẠI cùng một mục tiêu nhiều lần trong quãng sống của nó, nên
    // công thức "sát thương một lần bấm x số lần bấm" đếm thiếu đúng số vòng đó.
    if (W.mode === 'orbit') {
      var reHits = Math.max(1, Math.floor(W.life / W.reHitMs));
      W.dps = perShot * reHits / (W.shotMs / 1000);
    }
    /* BỐN LỚP MỚI KHÔNG ĐỌC ĐƯỢC BẰNG CÔNG THỨC CHUNG, mỗi lớp lệch một kiểu:
     *
     *   súng quay  — nhịp bắn KHÔNG cố định, nó leo theo vòng quay. Đo ở nhịp
     *                nền thì ra một con số không lớp nào từng chơi ở đó. Đo ở
     *                nhịp TRUNG BÌNH của một lượt giữ cò đủ dài mới đúng.
     *   luân xa    — một lần ném ăn HAI lượt trên cùng đường bay.
     *   nón lửa    — trúng CẢ ĐÁM mỗi tick, và phần lớn sát thương nằm ở vết
     *                bỏng để lại chứ không ở cú trúng.
     *   roi xích   — quét một cung rộng nên cũng trúng nhiều con một lúc.
     *
     * Hai lớp cuối quy ước đo trên BA mục tiêu: đó là mật độ mà chúng được thiết
     * kế để đánh, và đo đơn mục tiêu thì con số nói dối theo hướng ngược lại. */
    if (W.mode === 'spin') {
      // Trung bình có trọng số: một lượt giữ cò dài thì phần lớn thời gian ở
      // gần vòng tối đa, nên nghiêng về đầu cao chứ không lấy trung bình cộng.
      var sm = W.spinMul || [0.55, 2.3];
      W.dps = perShot * (W.rpm / 60) * (sm[0] * 0.28 + sm[1] * 0.72);
    }
    if (W.mode === 'boomerang') {
      W.dps = perShot * (1 + (W.backMul === undefined ? 0.85 : W.backMul)) * (W.rpm / 60);
    }
    if (W.mode === 'cone') {
      var burnDps = W.dmg * W.burnStack * (W.burnPerTick || 0.5) * 1.5;
      W.dps = (perShot * (W.rpm / 60) + burnDps) * 3;
      W.burst = perShot * 3;
    }
    if (W.mode === 'arc') {
      W.dps = perShot * (W.rpm / 60) * 3;
      W.burst = perShot * 3;
    }
  });

  G.WEAPON_ORDER = ['rifle', 'shotgun', 'sniper', 'bow', 'staff', 'launcher',
                    'laser', 'blade', 'scythe', 'orb',
                    'gatling', 'chakram', 'flame', 'whip'];

  /* Ánh xạ lớp cũ -> lớp mới. Save cũ, đồ cũ và đội hình cũ đi qua bảng này.
   * Giữ đúng hình tượng: đại kiếm chậm-nặng-cả-sân-thấy-nó-tới thành súng phóng,
   * thương tầm-xa-đâm-xuyên-một-hàng thành bắn tỉa, song kiếm phải-áp-sát-ra-nhiều
   * -nhát thành súng săn. Xem SHOOTER.md §10. */
  G.WCLASS_LEGACY = {
    sword: 'rifle', great: 'launcher', spear: 'sniper', dual: 'shotgun', bow: 'bow'
  };
  G.wclassOf = function (c) {
    return G.WEAPONS[c] ? c : (G.WCLASS_LEGACY[c] || 'rifle');
  };

  /* Bảng Behemoth chỉ ghi SÁU lớp — nó là dữ liệu lấy nguyên văn từ wiki Dragon
   * Project, và tôi không sửa dữ liệu nguồn để nhét bốn lớp mới vào. Nên bốn lớp
   * mới lấy đường khác: mỗi lớp cũ tách làm ĐÔI theo HỌ SILHOUETTE.
   *
   *   kiếm  -> súng trường | kiếm khí   (cùng hình "một lưỡi thẳng")
   *   thương-> bắn tỉa     | tia nhiệt  (cùng câu "xuyên một đường thẳng")
   *   đại kiếm -> súng phóng | cầu lửa  (cùng câu "một khối nặng rơi xuống")
   *   song kiếm-> súng săn  | lưỡi hái  (cùng câu "phải áp sát, ra nhiều nhát")
   *   cung  -> cung
   *   trượng-> gậy phép
   *
   * Chia bằng BĂM ID, không bằng random: cùng một con Behemoth thì đời nào cũng
   * ra đúng cây đó, kể cả sau khi xoá save. Random ở đây thì hồ sơ cũ nạp lên
   * thấy vũ khí tự đổi lớp, mà đổi lớp là đổi cả bộ đòn lẫn hai kỹ năng.
   *
   * Cung và trượng KHÔNG tách: cả hai đã là lớp có bản sắc riêng rõ nhất trong
   * sáu lớp cũ (dải chí mạng, và nhịp niệm ngắt được), tách ra thì phải bịa một
   * bản sắc thứ hai cho mỗi cái. */
  /* Bốn lớp mới (súng quay, luân xa, súng phun lửa, roi xích) nhét vào đâu?
   * Cùng một luật: mỗi lớp cũ tách theo HỌ SILHOUETTE, chỉ là giờ tách làm BA
   * thay vì làm đôi. Vẫn băm id nên vẫn tất định — cùng một con Behemoth thì
   * đời nào cũng ra đúng cây đó.
   *
   *   kiếm     -> súng trường | kiếm khí  | luân xa   (đều là "một lưỡi bay đi")
   *   thương   -> bắn tỉa     | tia nhiệt | roi xích  (đều là "vươn dài ra xa")
   *   đại kiếm -> súng phóng  | cầu lửa   | phun lửa  (đều là "một khối lửa trùm")
   *   song kiếm-> súng săn    | lưỡi hái  | súng quay (đều là "áp sát, ra nhiều nhát")
   *
   * Cung và trượng vẫn KHÔNG tách, vì lý do cũ: cả hai đã là lớp có bản sắc rõ
   * nhất, tách ra thì phải bịa một bản sắc thứ hai cho mỗi cái. */
  G.WCLASS_SPLIT = {
    sword: ['rifle', 'blade', 'chakram'],
    spear: ['sniper', 'laser', 'whip'],
    great: ['launcher', 'orb', 'flame'],
    dual:  ['shotgun', 'scythe', 'gatling'],
    bow:   ['bow'],
    staff: ['staff']
  };
  /* CHIA VÒNG TRÒN, KHÔNG BĂM MODULO.
   *
   * Bản trước băm id rồi lấy dư. Nó tất định, nhưng nó KHÔNG chia đều — và với
   * tám con `dual` chia làm ba, băm cho ra 5 súng săn, 3 lưỡi hái và ĐÚNG 0 súng
   * quay. Một lớp không con Behemoth nào rơi vào nghĩa là lớp đó không có nguồn
   * rơi đồ, không có nhân vật, và không bao giờ chơi được — cả một lớp vũ khí
   * chết lặng lẽ mà không có gì báo.
   *
   * Chia vòng tròn theo THỨ TỰ ĐÃ SẮP của id trong cùng nhóm: vẫn tất định (id
   * không đổi thì vị trí không đổi), nhưng bảo đảm chênh nhau nhiều nhất một
   * con giữa các lớp cùng nhóm. Bảng dựng một lần rồi nhớ lại. */
  var SPLIT_IDX = null;
  function buildSplitIdx() {
    SPLIT_IDX = {};
    var groups = {};
    G.BEHEMOTHS.forEach(function (b) {
      if (G.WEAPONS[b.weapon]) return;
      (groups[b.weapon] = groups[b.weapon] || []).push(b.id);
    });
    Object.keys(groups).forEach(function (g) {
      var pool = G.WCLASS_SPLIT[g];
      if (!pool) return;
      groups[g].sort().forEach(function (id, i) { SPLIT_IDX[id] = pool[i % pool.length]; });
    });
  }
  G.wclassOfBehemoth = function (b) {
    if (!b) return 'rifle';
    if (G.WEAPONS[b.weapon]) return b.weapon;      // đã là lớp mới thì thôi
    if (!G.WCLASS_SPLIT[b.weapon]) return G.wclassOf(b.weapon);
    if (!SPLIT_IDX) buildSplitIdx();
    return SPLIT_IDX[b.id] || G.wclassOf(b.weapon);
  };
  /* Mọi chỗ tra bảng vũ khí đi qua đây, không tra thẳng G.WEAPONS[...]. Lý do:
   * bảng Behemoth vẫn giữ tên lớp CŨ (nó là dữ liệu lấy nguyên văn từ wiki), và
   * save của người chơi cũ cũng vậy. Một hàm tra duy nhất thì không thể có chỗ
   * nào quên đổi — mà quên một chỗ là màn hình đó nổ. */
  G.weaponOf = function (c) { return G.WEAPONS[G.wclassOf(c)]; };

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
  /* `spr` là ẢNH bung ra tại điểm chạm, một hiệu ứng riêng cho từng hệ. Bảy hệ,
   * bảy hình khác nhau — chứ không phải một vòng tròn đổi bảy màu. Đó chính là
   * chỗ hệ Magi cũ chết: bốn mươi viên đá dùng chung ba đoạn code nên "gọi thiên
   * thạch" và "cột băng dựng lên" hiện lên y hệt nhau.
   * Ảnh lấy từ bộ PVFX Foundry (CC0) — xem _tools/pvfx.py. */
  G.ELEM_FX = {
    none:    { trail:'streak', burst:'flash', spr:'fx.shrapnel', col:'#c8d4de', glow:'#8fa3b5' },
    thunder: { trail:'bolt',   burst:'chain', spr:'fx.zap',      col:'#ffd23f', glow:'#fff0a0',
               chainN:2, chainR:120, chainMul:0.45, status:'paralysis' },
    fire:    { trail:'burn',   burst:'flare', spr:'fx.ember',    col:'#ff9f2e', glow:'#ffcf8a',
               burnMs:3000, burnDps:0.018, status:'burn' },
    water:   { trail:'frost',  burst:'shard', spr:'fx.frost',    col:'#4fb6ff', glow:'#a5dcff',
               slickMs:2600, status:'slow' },
    earth:   { trail:'crack',  burst:'spike', spr:'fx.leaf',     col:'#8fd14f', glow:'#c6ec9d',
               kbMul:1.6, quake:true },
    light:   { trail:'streak', burst:'flash', spr:'fx.heal',     col:'#fff6d8', glow:'#ffffff',
               blindMs:900 },
    dark:    { trail:'smoke',  burst:'pool',  spr:'fx.bloom',    col:'#a06fe0', glow:'#d3b6f5',
               drain:0.12, poolMs:2400 }
  };

  /* --------------------------------------------------------- KỸ NĂNG ------ */
  /* HAI kỹ năng mỗi lớp bắn, khớp đúng hai nút trên HUD.
   *
   * SỨC MẠNH LẤY TỪ CÔNG THỨC, KHÔNG PHẢI TỪ CẢM TÍNH. Bản cũ để hệ số 1,8–3,4
   * và đó là lý do không ai buồn bấm kỹ năng — nó thấp hơn chuẩn thể loại cả
   * chục lần. Cách tính đúng là theo SÁT THƯƠNG TRONG CẢ CỬA SỔ HỒI CHIÊU, không
   * phải sát thương mỗi lần bấm:
   *
   *     dmg_kỹ_năng ≈ D × R × T × K
   *     D = sát thương đòn thường · R = phát/giây · T = hồi chiêu (giây)
   *     K ≈ 0,5 với hồi chiêu ngắn 3–5s  ·  K ≈ 0,8–1,2 với hồi chiêu 10s+
   *
   * Kiểm chứng ngược: Hades Cast 50 vs đòn thường Stygian Blade 20 = 2,5× trên
   * hồi chiêu ~3s. Wizard of Legend Shock Assault 5×5+16 = 41 vs spam đòn thường
   * 16 trong cùng 5 giây = 2,5×. Hai game khác hẳn nhau, cùng một tỉ lệ.
   *
   * K TỤT VỀ 0,3–0,5 khi kỹ năng có "quà kèm" — bất tử, đóng băng cả màn, một
   * vùng đứng được — vì tiện ích CHÍNH LÀ phần thưởng.
   *
   * mul ở đây tính theo ĐƠN VỊ SÁT THƯƠNG GỐC (cùng đơn vị với W.dmg), nên đọc
   * thẳng ra được: mul 260 = bằng 65 viên đạn súng trường.
   *
   * kind quyết định trình phát nào chạy nó. Mười hai kind là mười hai hình dạng
   * khác nhau trên màn hình — đây chính là chỗ hệ Magi cũ chết: bốn mươi viên
   * dùng chung ba đoạn code nên hiện lên y hệt nhau. */
  G.SKILL_RULES = {
    unlockLv2: 8            // kỹ năng thứ hai mở ở cấp vũ khí này
  };

  /* ========================================================== KỸ NĂNG ======
   * Hai kỹ năng cho mỗi lớp vũ khí, mười lớp, hai mươi đòn.
   *
   * NGÂN SÁCH SÁT THƯƠNG — không con số nào ở đây được đặt bằng tay.
   * Công thức của SHOOTER.md §4:  mul ≈ DPS_đòn_thường × T(giây) × K
   * DPS đòn thường của mọi lớp nằm trong dải 15–27 nên lấy tròn 20 làm mốc.
   *   K = 0,80–0,90  đòn thuần sát thương, đơn mục tiêu
   *   K = 0,45–0,55  đòn diện rộng, hoặc có "quà kèm" (triệu hồi, gom quái)
   *   K = 0,25–0,30  đòn thuần tiện ích (khiên, tăng tốc, đóng dấu)
   * Kỹ năng bản cũ để hệ số 1,8–3,4 — thấp hơn chuẩn thể loại cả chục lần, và
   * đó chính là lý do không ai buồn bấm.
   *
   * DÁNG NGẮM (`aim`) là trường bắt buộc. Xem js/skills.js:
   *   'self'  không cần hướng  -> bấm nút, thả, xả ngay tại chỗ
   *   'dir'   cần một hướng    -> kéo ngón để chỉ, mũi tên hiện ra
   *   'point' cần một điểm đến -> kéo ngón để đẩy vòng rơi ra xa
   * Không còn trường `charge`: hồi chiêu CHÍNH LÀ thanh nạp, nút sáng là bấm được.
   * ====================================================================== */
  G.SKILLS = {
    /* --- SÚNG TRƯỜNG: kiểm soát hoả lực. Đứng vững và rải. --- */
    rifle: [
      { id:'overdrive', n:'Cuồng Tốc', kind:'rungun', aim:'self',
        d:'Sáu giây vừa chạy vừa xả mà không bị chậm một nhịp nào. Không thêm sát thương nào cả — cái nó cho là thứ đắt hơn: được bắn trong lúc đang chạy.',
        cd:20000,
        // Đòn THUẦN TIỆN ÍCH: nó không tự gây một điểm sát thương nào. Giá trị
        // nằm ở chỗ nó xoá cái đánh đổi lớn nhất của game (một ngón thì hoặc
        // chạy hoặc bắn) trong sáu giây. K không áp dụng, mul = 0 là đúng.
        mul:0, ms:6000, spdMul:1.70, rofMul:1.45, freeFire:true,
        hitstop:0, kb:0, poise:0,
        trail:true, burst:false },

      { id:'turret', n:'Ụ Súng', kind:'turret', aim:'point',
        d:'Cắm một ụ súng tự bắn. Nó tự tìm mục tiêu gần nhất, và nó không biết sợ.',
        cd:22000,
        // Nguồn sát thương thứ hai đứng độc lập = "quà kèm", K = 0,5.
        // 20 × 22 × 0,5 = 220.
        mul:220, ttlMs:9000, rpm:200, turretRange:320, aimR:220,
        hitstop:HS.tick, kb:3, poise:5,
        trail:false, burst:true }
    ],

    /* --- SÚNG SĂN: áp sát. Cả hai kỹ năng đều đẩy bạn vào mặt quái. --- */
    shotgun: [
      { id:'breach', n:'Phá Cửa', kind:'rush', aim:'dir',
        d:'Lao thẳng tới trước, vừa lao vừa nã. Chạm ai thì người đó ăn trọn cả loạt ở cự ly bằng không.',
        cd:15000,
        mul:120, endMul:190, dist:230, rushMs:380, armor:true, pushAlong:true,
        arc:2.0, reach:96, pellets:10, arcGap:9,
        hitstop:HS.mid, kb:14, poise:34, knock:3,
        trail:true, burst:true },

      { id:'flak', n:'Vòng Mảnh', kind:'ring', aim:'self',
        d:'Nổ một vòng mảnh 360° quanh thân. Không cần ngắm — cái gì đứng gần thì cái đó ăn.',
        cd:18000,
        // AoE quanh thân, K = 0,45: 20 × 18 × 0,45 ≈ 162, làm tròn lên 204 vì nó
        // đòi phải đứng đúng giữa đám mới ăn được hết.
        mul:204, ringR:170, ringMs:260, pellets:20,
        // 20 viên một vòng: đúng trần của công thức hành lang ở tầm này
        // (n_max = 2πd/(2r_đạn + 2r_người + M) ≈ 20). Xem SHOOTER.md §5.2.
        hitstop:HS.mid, kb:16, poise:30, knock:2,
        trail:false, burst:true }
    ],

    /* --- BẮN TỈA: một viên định đoạt. Chậm, đắt, và không được phép trượt. --- */
    sniper: [
      { id:'railshot', n:'Xuyên Tuyến', kind:'rail', aim:'dir',
        d:'Bắn một tia xuyên hết chiều dài sân. Càng xuyên nhiều con càng nặng đòn.',
        cd:20000,
        mul:356, len:900, w:26, speed:34,
        rampPerHit:0.22, rampMax:2.4,        // xuyên nhiều thì cộng dồn
        pierce:true,
        hitstop:HS.boom, zoomPunch:0.14, kb:10, poise:34, shake:6,
        trail:true, burst:true },

      { id:'volley', n:'Liên Châu', kind:'volley', aim:'dir',
        d:'Bảy viên rời nòng gần như cùng lúc, mỗi viên tự tìm một mục tiêu khác nhau. Không có con nào ăn hai viên nếu vẫn còn con chưa ăn viên nào.',
        cd:18000,
        // Đơn mục tiêu, thuần sát thương, K = 0,8: 20 × 18 × 0,8 = 288.
        mul:288, shots:7, stepMs:70, spd:26, r:9, seekR:420,
        pierce:false,
        hitstop:HS.mid, kb:6, poise:16, shake:3,
        trail:true, burst:true }
    ],

    /* --- CUNG: kiểm soát không gian. Vũ khí của người biết đứng chỗ nào. --- */
    bow: [
      { id:'arrowrain', n:'Vũ Tiễn', kind:'rain', aim:'point',
        d:'Bắn lên trời rồi mưa mũi tên xuống vùng đã chọn. Mỗi mũi có bóng báo trước dưới đất.',
        cd:18000,
        mul:180, aimR:320, zoneR:120, delayMs:700, arrows:18, spreadMs:520,
        hitstop:HS.light, kb:4, poise:6,
        trail:false, burst:true },

      { id:'heartpierce', n:'Nhất Tiễn Xuyên Tâm', kind:'pierce', aim:'dir',
        d:'Một mũi xuyên trọn một hàng và để lại vết thương rỉ máu.',
        cd:22000,
        mul:257, ms:300, len:620, w:24, speed:26,
        pierce:true, rampPerHit:0.18, rampMax:2.2,
        dotMs:6000, dotFrac:0.30, push:0,
        hitstop:HS.boom, zoomPunch:0.12, kb:12, poise:26,
        trail:true, burst:true }
    ],

    /* --- GẬY PHÉP: một đòn dựng vùng, một đòn dựng khiên. --- */
    staff: [
      { id:'stormfield', n:'Trận Sấm', kind:'field', aim:'point',
        d:'Dựng một vùng sấm đứng yên tại chỗ. Cái gì bước vào thì ăn đòn, và sét nảy sang con bên cạnh.',
        cd:19000,
        mul:205, fieldR:150, fieldMs:6000, tickMs:400, aimR:260,
        chain:3, chainFall:0.30, chainR:110,   // 3 lần nảy, −30% mỗi lần (Hades)
        hitstop:HS.tick, kb:2, poise:4,
        trail:false, burst:true },

      { id:'aegis', n:'Khiên Ảo', kind:'aegis', aim:'self',
        d:'Dựng một lớp vỏ trong suốt quanh người. Nó ăn đòn thay bạn cho tới khi vỡ, và lúc vỡ thì nó nổ.',
        cd:24000,
        // Thuần tiện ích, K = 0,25: 20 × 24 × 0,25 = 120 — và toàn bộ 120 đó nằm
        // ở cú nổ lúc vỡ, không phải ở lúc bấm. Nghĩa là khiên chỉ trả hết giá
        // trị khi nó thật sự đỡ đủ đòn, chứ không phải khi bấm cho có.
        mul:120, shieldFrac:0.55, ms:8000, popR:150,
        // Paladin's Energy Shield của Soul Knight: 4 giây miễn nhiễm hoàn toàn,
        // hồi chiêu 12s. Ở đây đổi "miễn nhiễm" thành "một túi máu ảo" vì miễn
        // nhiễm tuyệt đối xoá luôn việc phải né trong suốt quãng đó.
        hitstop:HS.mid, kb:10, poise:20, shake:4,
        trail:false, burst:true }
    ],

    /* --- SÚNG PHÓNG: dọn sạch. Cả hai đều là hình ảnh "cả sân thấy nó tới". --- */
    launcher: [
      { id:'carpet', n:'Rải Thảm', kind:'barrage', aim:'dir',
        d:'Bắn một loạt tám quả rải dần ra xa theo hướng đang chỉ. Mỗi quả nổ có báo trước.',
        cd:17000,
        mul:272, shells:8, stepPx:95, stepMs:130, blastR:86,
        hitstop:HS.heavy, kb:10, poise:26, shake:8, quake:true,
        trail:true, burst:true },

      { id:'cluster', n:'Bom Chùm', kind:'cluster', aim:'point',
        d:'Một quả bay lên rồi vỡ thành mười sáu quả nhỏ rơi quanh điểm chạm.',
        cd:21000,
        mul:300, coreFrac:0.35, frags:16, fragR:56, spreadR:180, aimR:300,
        fuseMs:520,
        hitstop:HS.boom, kb:8, poise:22, shake:10, quake:true,
        trail:false, burst:true }
    ],

    /* --- TIA NHIỆT: hoả lực rải ra thành NHIỀU NGUỒN, không dồn vào một nòng. --- */
    laser: [
      { id:'drones', n:'Bầy Vệ Tinh', kind:'drones', aim:'self',
        d:'Bốn con bay ra, xếp thành vòng quanh người và tự bắn. Chúng bay theo bạn, và chúng không cần bạn đứng yên.',
        cd:24000,
        // Bốn nguồn sát thương độc lập, lại còn bắn được trong lúc bạn đang chạy
        // — "quà kèm" rất lớn, K = 0,5: 20 × 24 × 0,5 = 240 chia cho cả đàn.
        mul:240, drones:4, ttlMs:9000, rpm:150, droneRange:300, orbitR:52,
        hitstop:HS.tick, kb:2, poise:3,
        trail:false, burst:true },

      { id:'prism', n:'Lăng Kính', kind:'sweep', aim:'dir',
        d:'Một tia dày quét một cung 120 độ trong gần một giây. Cái gì đứng trong cung đó thì đứng đó mà chịu.',
        cd:20000,
        // Diện rộng nhưng quét chậm nên né được, K = 0,75: 20 × 20 × 0,75 = 300.
        mul:300, len:340, w:30, arc:2.09, ms:900, ticks:18,
        pierce:true,
        hitstop:HS.tick, kb:4, poise:10, shake:3,
        trail:false, burst:false }
    ],

    /* --- KIẾM KHÍ: hai câu về cùng một thứ — một lưỡi, và khoảng cách tới nó. --- */
    blade: [
      { id:'bigslash', n:'Trảm Thiên', kind:'bigslash', aim:'dir',
        d:'Một nhát duy nhất, to bằng nửa sân, bay chậm và xuyên hết mọi thứ trên đường. Đòn nặng nhất trong game.',
        cd:18000,
        // Thuần sát thương, một mục tiêu ăn trọn, K = 0,9: 20 × 18 × 0,9 = 324.
        mul:324, len:300, waveW:150, speed:9, ms:260,
        pierce:true, pierceFall:0.10,
        hitstop:HS.boom, zoomPunch:0.16, kb:18, poise:44, shake:9,
        trail:true, burst:true },

      { id:'dash', n:'Nhất Tuyến', kind:'phase', aim:'dir',
        d:'Lướt xuyên qua cả hàng rồi mới hiện lại ở đầu bên kia. Trong lúc lướt thì không ai chạm được vào bạn.',
        cd:14000,
        // Có khung bất tử = "quà kèm", K = 0,55: 20 × 14 × 0,55 = 154.
        mul:110, endMul:154, dist:280, rushMs:300, armor:true, pushAlong:false,
        arc:1.4, reach:80,
        hitstop:HS.mid, kb:10, poise:28, knock:0,
        trail:true, burst:true }
    ],

    /* --- LƯỠI HÁI: cả hai đòn đều là "đứng đúng chỗ rồi mới ra tay". --- */
    scythe: [
      { id:'reap', n:'Vòng Tử', kind:'reapfield', aim:'self',
        d:'Một vòng lưỡi nở bung ra khỏi thân. Bán kính hơn gấp đôi tầm với thường ngày của cây này.',
        cd:16000,
        // AoE quanh thân, K = 0,5: 20 × 16 × 0,5 = 160.
        mul:160, ringR:190, ringMs:300, pellets:18,
        hitstop:HS.heavy, kb:14, poise:32, knock:2, shake:6,
        trail:false, burst:true },

      { id:'blink', n:'Bóng Tử Thần', kind:'blink', aim:'dir',
        d:'Tan vào bóng, hiện ra sau lưng con đã chỉ, rồi mới chém. Nhát chém đến TRỄ một nhịp sau khi hiện — đó là chỗ nó đáng sợ.',
        cd:15000,
        // Có dịch chuyển + khung bất tử, K = 0,7: 20 × 15 × 0,7 = 210.
        mul:210, range:340, appearMs:120, slashDelay:150, ms:240,
        arc:2.4, reach:104,
        hitstop:HS.heavy, kb:12, poise:30, shake:5,
        trail:true, burst:true }
    ],

    /* --- TRƯỢNG CẦU LỬA: cả hai đòn đều rơi từ trên xuống một ĐIỂM. --- */
    orb: [
      { id:'meteor', n:'Thiên Thạch', kind:'meteor', aim:'point',
        d:'Gọi một khối đá cháy từ ngoài khung hình. Có bóng báo trước một nhịp dài, và cái nhịp đó đủ để quái chạy ra — nên đừng ném vào chỗ chúng ĐANG đứng.',
        cd:22000,
        // AoE có báo trước rất rõ nên né được, K = 0,5: 20 × 22 × 0,5 = 220.
        mul:220, aimR:340, zoneR:110, delayMs:850, coreFrac:0.62,
        ringR:190, ringFrac:0.38,      // sóng xung kích lan rộng hơn, nhẹ hơn
        hitstop:HS.boom, kb:16, poise:40, shake:12, quake:true,
        trail:false, burst:true },

      { id:'singularity', n:'Điểm Hút', kind:'pull', aim:'point',
        d:'Ném ra một điểm hút. Nó kéo cả đám vào tâm rồi vỡ ra một cú.',
        cd:23000,
        mul:279, throwSpd:5, pullR:200, pullMs:900, pullForce:0.34, aimR:300,
        blastR:130, arc:6.283, reach:130,
        hitstop:HS.heavy, kb:6, poise:26, shake:7,
        trail:true, burst:true }
    ],
    /* ---------------------------- SÚNG QUAY ----------------------------
     * Cả hai đòn đều xoay quanh VÒNG QUAY, vì đó là bản sắc của cây. Một đòn
     * cho bạn vòng quay miễn phí, đòn kia biến vòng quay thành thứ khác. */
    gatling: [
      { id:'leadstorm', n:'Bão Chì', kind:'maxspin', aim:'self',
        d:'Nòng lập tức đạt vòng tối đa và giữ nguyên suốt sáu giây — không cần quay lên, không tuột xuống, và trong lúc đó không gì đẩy bạn lùi được.',
        cd:20000,
        ms:6000, keepSpin:true, noKnock:true, moveBonus:0.30,
        // Không cộng sát thương: cái nó cho là SÁU GIÂY không phải trả giá quay
        // nòng. Với cây này đó đã là phần thưởng lớn nhất có thể cho.
        mul:0,
        hitstop:HS.light, kb:0, poise:0, shake:3,
        trail:false, burst:false },

      { id:'shred', n:'Xé Giáp', kind:'shred', aim:'dir',
        d:'Dốc cả băng đạn vào một hình nón hẹp để bào mòn giáp. Cái nó để lại không phải sát thương mà là một vết hở — mọi đòn sau đó, của bất kỳ ai, đều đau hơn.',
        cd:17000,
        // K = 0,55: nón hẹp và phải đứng yên xả, nhưng phần thưởng thật nằm ở
        // debuff chứ không ở con số này. 20 x 17 x 0,55 = 187.
        mul:187, coneLen:230, coneArc:0.55, ticks:12, ms:900,
        armorCut:0.40, armorMs:7000,
        hitstop:HS.tick, kb:2, poise:14, shake:4,
        trail:true, burst:false }
    ],

    /* ---------------------------- LUÂN XA ------------------------------
     * Cây này ăn hai lượt trên một đường bay. Hai đòn kéo ý đó về hai phía:
     * một đòn biến đĩa thành lớp phòng thủ quanh mình, đòn kia bỏ luôn đường
     * về mà đổi lấy vô số lần nảy. */
    chakram: [
      { id:'trilune', n:'Tam Luân', kind:'orbitals', aim:'self',
        d:'Ba đĩa lưỡi tách ra bay vòng quanh người trong tám giây. Chúng chém mọi thứ lại gần, và chặt rụng đạn quái bay vào.',
        cd:21000,
        // K = 0,45: kéo dài, tự đánh, và còn chặn đạn — ba thứ cộng lại thì
        // hệ số phải thấp. 20 x 21 x 0,45 = 189.
        mul:189, n:3, ms:8000, orbitR:82, spin:280, reHitMs:520, cutsBullets:true,
        hitstop:HS.light, kb:5, poise:10, shake:2,
        trail:false, burst:false },

      { id:'endlessring', n:'Nảy Vô Tận', kind:'bounce', aim:'dir',
        d:'Một đĩa duy nhất, không quay về, nhưng nảy từ con này sang con khác tới mười hai lần. Đám càng đông thì nó càng lâu tan.',
        cd:18000,
        // K = 0,50 và mỗi lần nảy yếu dần, nên trần thật thấp hơn con số này
        // nhiều khi chỉ có một hai con. 20 x 18 x 0,50 = 180.
        mul:180, bounces:12, bounceFall:0.07, bounceR:260, spd:11, life:5200,
        hitstop:HS.mid, kb:6, poise:12, shake:3,
        trail:true, burst:false }
    ],

    /* -------------------------- SÚNG PHUN LỬA --------------------------
     * Cây này bán sát thương THEO THỜI GIAN. Đòn một đặt sẵn thời gian đó lên
     * mặt đất; đòn hai thu toàn bộ thời gian còn lại về hiện tại một lần. */
    flame: [
      { id:'firelane', n:'Tường Lửa', kind:'firelane', aim:'dir',
        d:'Đặt một bức tường lửa nằm ngang chắn đường. Nó không đuổi theo ai — nó bắt cả đám phải chọn: đi vòng, hay đi qua và cháy.',
        cd:19000,
        // K = 0,45: nó không tự tìm mục tiêu, và quái hoàn toàn né được bằng
        // cách đi vòng. 20 x 19 x 0,45 = 171.
        mul:171, len:280, w:44, ms:7000, tickMs:420, burn:true,
        hitstop:HS.tick, kb:0, poise:6, shake:3,
        trail:false, burst:false },

      { id:'flashover', n:'Bùng Nổ', kind:'detonate', aim:'self',
        d:'Kích nổ cùng lúc mọi vết bỏng đang cháy trên sân. Không đốt ai đang lành lặn — nó chỉ thu về những gì bạn đã đốt sẵn.',
        cd:16000,
        // Hệ số này là mỗi CON đang cháy, không phải tổng — nên nó phải thấp:
        // sân đông thì nó tự nhân lên. Trần thật đến từ việc phải đốt trước đã.
        mul:96, perStack:0.45, blastR:120, maxStack:4,
        hitstop:HS.boom, kb:12, poise:28, shake:10, quake:true,
        trail:false, burst:true }
    ],

    /* ---------------------------- ROI XÍCH -----------------------------
     * Cây này quyết định trận đấu diễn ra Ở ĐÂU. Đòn một gom đám lại một cục;
     * đòn hai biến chính mình thành cái cối xay giữa cục đó. */
    whip: [
      { id:'yank', n:'Móc Kéo', kind:'yank', aim:'dir',
        d:'Phóng roi thành một đường thẳng rồi giật ngược. Mọi thứ dính vào bị lôi về sát chân bạn và choáng một nhịp — nhịp đó là để bạn ra đòn tiếp.',
        cd:14000,
        // K = 0,45: sát thương thấp là ĐÚNG. Giá trị của đòn nằm ở chỗ nó dọn
        // sân về một điểm cho đòn sau, không ở con số nó gây ra.
        mul:126, len:300, w:40, pull:1.0, stunMs:900,
        hitstop:HS.mid, kb:0, poise:22, shake:6,
        trail:true, burst:false },

      { id:'cyclone', n:'Lốc Xích', kind:'spincyclone', aim:'self',
        d:'Quay tròn cả sợi roi quanh người trong năm giây, và VẪN ĐI LẠI ĐƯỢC. Đi tới đâu băm tới đó.',
        cd:22000,
        // K = 0,52: đánh liên tục, diện rộng, mà chân vẫn tự do — thứ duy nhất
        // giữ nó không quá tay là bán kính ngắn. 20 x 22 x 0,52 = 229.
        mul:229, ms:5000, r:96, tickMs:280, moveMul:0.82,
        hitstop:HS.light, kb:7, poise:12, shake:2,
        trail:false, burst:false }
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
              ai:'swarm',   poise:26 },
    vacca:  { vi:'Vacca',  en:'Vacca',  shape:'bull',  r:19, hp:1.6, atk:1.3, spd:0.75,
              ai:'charger', poise:60, charger:true,
              tell:820, dashSpd:7.6, dashMs:620, recover:900 },
    geguri: { vi:'Geguri', en:'Froggo', shape:'frog',  r:16, hp:1.2, atk:1.0, spd:0.70,
              ai:'hopper',  poise:34, hopper:true,
              tell:460, hopDist:150, hopMs:520, shockR:56 },
    bat:    { vi:'Bat',    en:'Bat',    shape:'bat',   r:13, hp:0.8, atk:1.0, spd:1.15,
              ai:'flyer',   poise:18, flyer:true,
              orbit:120, tell:380, diveSpd:8.4, diveMs:420 },
    galena: { vi:'Galena', en:'Galena', shape:'bird',  r:17, hp:1.1, atk:1.15,spd:0.95,
              ai:'ranged',  poise:30,
              // projSpd hạ từ 5,4 xuống 2,4 = ĐÚNG BẰNG tốc chạy người chơi.
              // Luật của Nuclear Throne: đạn người chơi 4× tốc chạy, đạn quái 1×
              // — bất đối xứng đó là cái làm mọi viên đạn địch đi bộ tránh được.
              // 5,4 là 2,3× tốc người chơi, tức nhanh gấp đôi mức công bằng.
              keep:210, tell:560, shots:3, spread:0.36, projSpd:2.4 },
    fungo:  { vi:'Fungo',  en:'Fungo',  shape:'shroom',r:18, hp:1.9, atk:1.1, spd:0.40,
              ai:'tank',    poise:110, poisoner:true,
              tell:900, slamR:74, puffR:96 }
  };
  // Tiền tố biến thể theo hệ (wiki: Heat/Aqua/Thunder-Elec/Mad + bản thường)
  G.MOB_VARIANTS = [
    { pre:'',        el:'none'    },
    { pre:'Heat ',   el:'fire'    },
    { pre:'Aqua ',   el:'water'   },
    { pre:'Thunder ',el:'thunder' },
    { pre:'Mad ',    el:'earth'   }
  ];

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
          exp: Math.round(28 + m.lv * 9) * (last ? 2 : 1)
          // Gem KHÔNG khai báo ở đây nữa. Nó nằm trong G.REWARD và tính theo VỊ
          // TRÍ của ải trong chuỗi 38 ải, không theo "ải cuối vùng hay không" —
          // một bảng duy nhất thì đường cong gem đọc được bằng mắt, còn rải một
          // con số vào từng ải thì không ai kiểm được nó có tăng đều hay không.
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

  /* ======================================================= KINH TẾ ========
   * HAI ĐỒNG TIỀN, KHÔNG BA, KHÔNG NĂM.
   *
   *   ⬤ GOLD  — mọi thứ NÂNG CẤP: cấp trang bị, đột phá, tinh luyện, Tiến Hoá.
   *   ◈ GEM   — chỉ dùng để QUAY. Không mua được nâng cấp, không đổi ngược.
   *
   * Bản trước có năm: gold, gem, vé, medal, pikke. Năm đồng tiền có nghĩa là
   * năm bảng giá, năm quầy trong tiệm, năm chỗ để hụt — và người chơi phải nhớ
   * cái nào mua được cái gì trước khi biết mình có đủ hay không. Không đồng nào
   * trong ba đồng bỏ đi làm được việc mà gold hoặc gem không làm được.
   *
   * VÌ SAO PHÁ ẢI LẠI RA GEM — cố ý lệch Survivor.io.
   * Survivor.io tách hẳn gem khỏi vòng cày ải chính: ải chính chỉ ra Gold + XP +
   * trang bị thô qua Patrol, còn gem đến từ một lớp mode phụ có trần theo
   * ngày/tuần/mùa (nhiệm vụ ngày ~80, tuần 450, Trials 200–600, Ender's Echo
   * 3.000–5.000/mùa) — ước tính ~300 gem/ngày cho người chơi miễn phí
   * (_research/survivorio.md §2.4).
   *
   * Cách đó đúng cho một game CÓ MÁY CHỦ và có mốc reset mỗi ngày. Bản này chạy
   * hoàn toàn trong localStorage: không có ngày mai, không có mùa, không có
   * event. Chép nguyên cấu trúc đó vào đây thì người ngồi chơi liền hai tiếng
   * nhận được đúng 0 gem, và cả hệ gacha thành thứ không bao giờ chạm tới được.
   * Nên gem ở đây đi theo TIẾN ĐỘ, không theo lịch: phá ải lần đầu trả đậm, cày
   * lại trả nhỏ giọt.
   * ==================================================================== */

  G.CUR = {
    gold: { vi: 'Gold', sym: '⬤', col: '#f2d24b', d: 'Nâng cấp mọi thứ' },
    gem:  { vi: 'Gem',  sym: '◈', col: '#8fd4ff', d: 'Chỉ để quay' }
  };

  /* Thưởng sau ải. Bốn nguồn, và mỗi nguồn trả lời một câu khác nhau:
   *
   *   base       — "đã phá được ải này"        : gold + exp, theo cấp ải
   *   firstClear — "lần đầu tiên"              : gem đậm, chỉ một lần trong đời
   *   conds      — "phá ĐẸP"                   : gem lẻ cho ba điều kiện
   *   repeat     — "cày lại"                   : gem nhỏ giọt, không có trần
   *
   * Tổng gem của toàn bộ 38 ải ở lần phá đầu ≈ 6.500, tức khoảng 40 lượt quay
   * cho cả chiến dịch. Cày lại ải cuối được ~34 gem/lượt, tức ~5 lượt chơi đổi
   * một lượt quay — đủ để cày có nghĩa, không đủ để cày thay cho việc đi tiếp. */
  G.REWARD = {
    pull: 160,              // giá một lượt quay (tỉ giá Genshin: 160 primogem = 1 fate)
    pull10: 1600,           // mười lượt — KHÔNG giảm giá, đúng như Genshin
    // Ải thứ i (0-based) trong tổng 38 ải
    firstGem: function (i) { return 60 + 6 * i; },
    repeatGem: function (i) { return Math.round(8 + 0.62 * i); },
    condGem: 4,             // mỗi điều kiện đạt được
    allCondGem: 8,          // thưởng thêm khi đủ cả ba
    // Gold nhân lên so với bản cũ vì gold giờ là đường DUY NHẤT để nâng cấp:
    // mọi thứ trước đây tiêu nguyên liệu giờ tiêu gold.
    goldMul: 1.9,
    // Rương trong ải và quái rơi ra: chỉ còn gold, không còn nguyên liệu nào.
    mobGold: function (lv, elite, gold) {
      return Math.round((6 + lv * 2.1) * (elite ? 3.2 : 1) * (gold ? 5 : 1));
    },
    bossGold: function (lv, rank) {
      return Math.round((60 + lv * 12) * ({ B: 1, A: 1.6, S: 2.6, SS: 4 }[rank] || 1));
    },
    gatherGold: function (lv) { return Math.round(80 + lv * 26); }
  };

  /* ------------------------------------------------------ VẬT PHẨM ------- */
  // Potion: 30 phút thường, 60 phút loại cao cấp. Giá đổi hết sang GOLD — nó là
  // thứ để TIÊU gold, và một game chỉ có hai đồng tiền thì mọi cái không phải
  // gacha đều phải tiêu được bằng đồng thứ nhất.
  G.ITEMS = {
    gold_potion: { n:'Gold Potion', vi:'Bình Vàng',  ms:1800000, eff:{gold:0.5},  price:{gold:9000} },
    exp_potion:  { n:'Exp Potion',  vi:'Bình Kinh Nghiệm', ms:1800000, eff:{exp:0.5}, price:{gold:9000} },
    luck_potion: { n:'Luck Potion', vi:'Bình May Mắn', ms:1800000, eff:{drop:0.5}, price:{gold:12000} },
    hunter_potion:{n:'Hunter Potion', vi:'Bình Thợ Săn', ms:3600000, eff:{gold:0.5, exp:0.5, drop:0.5}, price:{gold:40000} }
  };

  /* ======================================================== BANNER ========
   * Ba banner, đúng cấu trúc Genshin (_research/sephira-genre.md phần B).
   *
   *   NHÂN VẬT  — một người rate-up. Ra SS thì 50/50: hoặc là người đó, hoặc là
   *               một SS bất kỳ. Thua 50/50 -> lần SS SAU chắc chắn là người đó.
   *   VŨ KHÍ    — hai cây rate-up, chọn trước MỘT cây làm mục tiêu. Ra SS mà
   *               không phải cây đã chọn -> +1 Điểm Định Mệnh; có 1 điểm thì lần
   *               SS sau chắc chắn đúng cây đó (luật từ bản Genshin 5.0).
   *   TIÊU CHUẨN— không rate-up, không 50/50. Ra cả người lẫn cả năm loại đồ.
   *
   * TỈ LỆ GỐC giữ nguyên số của Dragon Project (SS 3 / S 15 / A 55 / B 27) chứ
   * KHÔNG chép 0,6% của Genshin: dàn SS ở đây chỉ có 4 người và 15 con Behemoth,
   * nhỏ hơn Genshin cả chục lần, nên 0,6% ở đây là một cái tường chứ không phải
   * một đường cong. Cái chép của Genshin là CẤU TRÚC pity, không phải con số.
   *
   * Pity mềm bắt đầu ở 3/4 quãng đường tới pity cứng — cùng tỉ lệ với Genshin
   * (soft 74 / hard 90 ≈ 0,82) nhưng kéo về thang ngắn hơn cho hợp tỉ lệ gốc cao.
   * ==================================================================== */
  G.BANNERS = [
    { id:'char', n:'Triệu Hồi Nhân Vật', vi:'NHÂN VẬT', kind:'hero',
      d:'Ra NGƯỜI. Trùng người thì đổi thành Lõi Rồng.',
      rates:{ SS:0.03, S:0.15, A:0.55, B:0.27 },
      soft:33, hard:40, softStep:0.06,
      fifty:true,                    // 50/50 rate-up
      featured:['calli'] },

    { id:'weapon', n:'Triệu Hồi Vũ Khí', vi:'VŨ KHÍ', kind:'weapon',
      d:'Chỉ ra VŨ KHÍ. Chọn trước một cây làm mục tiêu — trượt một lần là lần sau chắc chắn trúng.',
      rates:{ SS:0.04, S:0.18, A:0.52, B:0.26 },
      soft:26, hard:32, softStep:0.08,
      fate:true,                     // Điểm Định Mệnh
      featured:['amarok', 'gorynych'] },

    { id:'std', n:'Triệu Hồi Tiêu Chuẩn', vi:'TIÊU CHUẨN', kind:'mixed',
      d:'Ra cả người lẫn cả năm loại trang bị. Không rate-up, không 50/50 — bù lại pity ngắn hơn.',
      rates:{ SS:0.025, S:0.14, A:0.55, B:0.285 },
      soft:36, hard:44, softStep:0.05,
      heroChance:0.30 }              // 30% lượt quay ra người, 70% ra đồ
  ];

  /* ==================================================== CƯỜNG HOÁ TRONG ẢI ==
   * Đây là thứ làm một game thành survivor-like, và là thứ bản trước THIẾU HẲN.
   *
   * Vòng lặp của cả thể loại — Vampire Survivors, Archero, Survivor.io — không
   * phải "đi ải rồi nâng đồ ở nhà". Nó là: giết quái -> lên cấp NGAY TRONG ẢI ->
   * BỐC MỘT TRONG BA -> build của lượt chơi này khác lượt trước. Không có bước
   * bốc bài thì mọi lượt chơi giống hệt nhau và cái duy nhất còn thay đổi được
   * là bảng chỉ số ở nhà.
   * ([Vampire Survivors / Archero draft — _research/sephira-genre.md phần B])
   *
   * MỌI THỨ Ở ĐÂY RESET SAU MỖI ẢI. Đó là điểm phân biệt với Tiến Hoá: Tiến Hoá
   * là tiến bộ vĩnh viễn và tính bằng tuần; cường hoá là quyết định của mười lăm
   * phút này và tính bằng lượt chơi. Hai lớp đó phải tách hẳn, không thì lớp
   * vĩnh viễn nuốt lớp tạm thời và bốc bài thành vô nghĩa.
   *
   * BA LUẬT ĐẶT BÀI:
   *   1. Không lá nào chỉ là "+x% của một lá khác". Mỗi lá đổi một ĐỘNG TỪ hoặc
   *      một trục khác nhau.
   *   2. Lá nào cũng có TRẦN CHỒNG. Không trần thì mọi lượt chơi hội tụ về việc
   *      dồn hết vào lá mạnh nhất, và bộ bài mười bốn lá chỉ còn một lá.
   *   3. Lá đã đầy trần thì KHÔNG hiện ra nữa. Bốc phải ba lá dùng được là một
   *      lượt bốc bị ăn cắp, và người chơi không có cách nào biết là do xui hay
   *      do game hỏng.
   * ==================================================================== */
  G.RUN = {
    // EXP mỗi con quái cho. Quái thường 1, tinh nhuệ 3, con vàng 6.
    orb: function (elite, gold) { return gold ? 6 : elite ? 3 : 1; },
    // EXP cần để lên cấp n (n = cấp SẮP đạt). Một ải ~16 con thì ra 4 lần bốc.
    need: function (n) { return 2 + n; },
    picks: 3            // bốc một trong ba
  };

  G.PERKS = [
    { id:'atk',    n:'Sát Khí',      max:5, col:'#ff7a3c',
      d:'+12% sát thương mọi nguồn.',
      buff:{ atkPct:0.12 } },
    { id:'rof',    n:'Tay Nhanh',    max:5, col:'#ffd23f',
      d:'+10% tốc bắn.',
      buff:{ atkSpd:0.10 } },
    { id:'hp',     n:'Sức Bền',      max:4, col:'#5fd06a',
      d:'+15% máu tối đa, và hồi lại đúng phần vừa cộng.',
      buff:{ hpPct:0.15 } },
    { id:'spd',    n:'Chân Nhanh',   max:4, col:'#8fd4ff',
      d:'+9% tốc chạy.',
      buff:{ moveSpd:0.09 } },
    { id:'crit',   n:'Điểm Huyệt',   max:4, col:'#ff4f7a',
      d:'+8% tỉ lệ chí mạng.',
      buff:{ crit:0.08 } },
    /* Đạn phụ chịu THUẾ, đúng luật Archero: mũi bắn về hướng mới thì miễn phí,
     * mũi bắn cùng hướng thì phải trả (Front Arrow −25%). Không có thuế thì lá
     * này mạnh gấp đôi mọi lá khác và ba lượt bốc đầu tiên đều chỉ có một đáp án. */
    { id:'shots',  n:'Đạn Phụ',      max:3, col:'#c9a8ff',
      d:'+1 viên mỗi phát, nhưng mỗi viên yếu đi 12%.',
      buff:{ shots:1, atkPct:-0.12 } },
    { id:'pierce', n:'Xuyên Thấu',   max:2, col:'#7fe3f0',
      d:'Đạn xuyên qua thêm một con nữa.',
      buff:{ pierce:1 } },
    { id:'drain',  n:'Hút Máu',      max:3, col:'#a06fe0',
      d:'Hồi 2,5% sát thương gây ra.',
      buff:{ drain:0.025 } },
    { id:'skcd',   n:'Định Thần',    max:3, col:'#6fd4ff',
      d:'−12% hồi chiêu kỹ năng.',
      buff:{ skillCd:0.12 } },
    { id:'armor',  n:'Da Dày',       max:4, col:'#8fa3b5',
      d:'−9% sát thương phải chịu.',
      buff:{ defPct:0.09 } },
    { id:'magnet', n:'Nam Châm',     max:2, col:'#f2d24b',
      d:'+70% tầm hút rương.',
      buff:{ magnet:0.70 } },
    { id:'regen',  n:'Hồi Phục',     max:3, col:'#7fd07f',
      d:'Hồi 1,2% máu tối đa mỗi giây.',
      buff:{ regen:0.012 } },
    { id:'dodge',  n:'Phản Xạ',      max:2, col:'#bdefff',
      d:'−25% hồi chiêu né.',
      buff:{ dodgeCd:0.25 } },
    /* Nộ Khí là lá DUY NHẤT thưởng cho việc đang ở thế nguy. Nó tồn tại để bộ
     * bài có ít nhất một quyết định không phải "cộng thêm cho cái đang tốt". */
    { id:'rage',   n:'Nộ Khí',       max:2, col:'#ff5a5a',
      d:'Dưới 40% máu thì +30% sát thương.',
      buff:{ rage:0.30 } },
    { id:'blast',  n:'Dây Chuyền',   max:2, col:'#ffb45a',
      d:'Quái chết thì nổ một vòng nhỏ.',
      buff:{ deathBlast:1 } }
  ];
  G.perkById = function (id) {
    return G.PERKS.filter(function (x) { return x.id === id; })[0] || null;
  };

  /* ======================================================== TIẾN HOÁ ======
   * EVOL — nâng CHỈ SỐ GỐC cho TOÀN BỘ nhân vật, không riêng ai.
   *
   * Vì sao cần: gacha ra người, và một người mới quay được thì chỉ số gốc của
   * họ đúng bằng chỉ số gốc lúc mới bắt đầu game. Không có lớp này thì mọi người
   * mới nhận về đều là một bước LÙI so với người đang dùng, và người chơi học
   * được đúng một bài: đừng đổi người. Đó là cái giết ý nghĩa của việc quay.
   *
   * Tiến Hoá cộng vào NỀN, nên nó theo tài khoản chứ không theo người: quay được
   * ai thì người đó lập tức đứng ở cùng cái nền ấy.
   *
   * Bốn nhánh, mỗi nhánh 20 cấp. Cộng THEO PHẦN TRĂM, không cộng thẳng: cộng
   * thẳng thì ở cấp thấp nó là +200% còn ở cấp cao nó là +3%, và cùng một con số
   * không được phép có hai nghĩa cách nhau bảy chục lần.
   *
   * Giá tăng theo LUỸ THỪA 1,52. Con số đó không phải chọn cho đẹp: nó là hệ số
   * làm cho TỔNG giá của cả bốn nhánh (~10,6 triệu gold) rơi vào đúng quãng mà
   * một người chơi hết 38 ải rồi cày lại vài chục lượt mới với tới — tức Tiến
   * Hoá là đích của cả chiến dịch, không phải một nút bấm trong buổi đầu.
   * ==================================================================== */
  G.EVOL = {
    max: 15,
    tracks: [
      { id:'hp',   n:'Thể Chất', stat:'hp',   per:0.030, col:'#5fd06a',
        d:'+3% máu gốc mỗi cấp, cho mọi nhân vật.' },
      { id:'atk',  n:'Sát Phạt', stat:'atk',  per:0.028, col:'#ff7a3c',
        d:'+2,8% công gốc mỗi cấp, cho mọi nhân vật.' },
      { id:'def',  n:'Kiên Cố', stat:'def',  per:0.032, col:'#8fd4ff',
        d:'+3,2% thủ gốc mỗi cấp, cho mọi nhân vật.' },
      { id:'edef', n:'Kháng Hệ', stat:'edef', per:0.034, col:'#c9a8ff',
        d:'+3,4% kháng hệ gốc mỗi cấp, cho mọi nhân vật.' }
    ],
    // Giá lên cấp n (n = cấp SẮP đạt, 1..20)
    cost: function (n) { return Math.round(2200 * Math.pow(1.52, n - 1)); },
    // Cứ 5 cấp thì cần thêm Lõi Rồng — thứ chỉ có từ quay trúng đồ trùng. Đây là
    // chỗ những cú quay thừa biến thành sức mạnh vĩnh viễn, và là lý do quay
    // trúng món đã có vẫn là một bước tiến chứ không phải một lần phí.
    core: function (n) { return n % 5 === 0 ? n / 5 * 3 : 0; }
  };

  /* ------------------------------------------------------------- NPC ----- */
  G.NPCS = ['Pamela', 'Pikke', 'Sylvie', 'Axel', 'Linton', 'Ange', 'Aine', 'Gawen', 'Jild'];
  // Ba đồng đội NPC thay cho co-op 4 người của bản gốc.
  G.ALLY_NAMES = ['Sylvie', 'Axel', 'Linton'];

  /* ------------------------------------------------- HẰNG SỐ CÂN BẰNG ---- */
  /* ---------------------------------------------------- CÂN BẰNG ---------
   * Thang số HẠ XUỐNG. Bản cũ để quái thường chết trong 0,5–1,0 phát suốt cả
   * game (đo được: xem SHOOTER.md §0.1) vì sát thương cộng dồn từ ba nguồn đều
   * lớn trong khi máu quái chỉ là 32 + 14·lv.
   *
   * Cách làm mới là NGÂN SÁCH DPS, không phải chỉnh số mò:
   *     HP_quái(bậc, N) = TTK_mục_tiêu(bậc) × DPS(N) × A × U
   * với A = 0,90 (game tự ngắm khi đứng yên) và U = 0,80 (phần thời gian thật sự
   * đang bắn). Mục tiêu: quái thường 4–6 phát, TTK 1,0–2,5s; boss ~40× máu quái
   * thường. Nguồn: Enter the Gungeon 700/15 = 47× · Soul Knight 480/8 = 60×.
   *
   * Và phần lớn việc rescale do TỐC ĐỘ BẮN gánh, không phải do chia sát thương:
   * chuỗi combo cũ ra ~2 nhát/giây, rifle bắn 5 phát/giây, nên cắt sát thương
   * mỗi phát 2,5 lần là DPS không đổi — không phá tỉ lệ nào khác. */
  G.BAL = {
    baseHp: 420, hpPerLv: 46,          // Lv1 420 máu -> Lv60 ~3100
    // Công nhân vật giờ là CHỈ SỐ SỨC MẠNH, không phải sát thương thô: sát
    // thương mỗi viên = W.dmg × ATK/10. Lv1 = 10,9 -> Lv60 = 64.
    baseAtk: 10, atkPerLv: 0.9,
    atkDiv: 10,                        // mẫu số của ATK/10
    // Quái: máu và công tách thành hai đường cong RIÊNG, và công tăng chậm hơn
    // hẳn. Risk of Rain 2 làm đúng thế — máu boss theo coeff/2,5 còn sát thương
    // boss theo coeff/30, chậm hơn MƯỜI HAI LẦN. Lý do: quái sống lâu gấp 4–5
    // lần thì nó cũng BẮN vào người chơi lâu gấp 4–5 lần.
    // Đo lần một cho ra TTK 0,47–1,31s, tức vẫn ở đầu NHANH của dải mục tiêu
    // 1,0–2,5s. Nhân đôi lên: Lv1 36 máu -> Lv60 396.
    mobHpBase: 30, mobHpPerLv: 6.2,
    // Công quái phải tăng CHẬM HƠN máu quái (bất đối xứng của Risk of Rain 2),
    // nhưng không được cắt sâu: hệ thẻ đánh đã hạ số con đánh cùng lúc từ 16
    // xuống tối đa 3, tức DPS dồn vào người chơi đã giảm sẵn năm lần. Cắt thêm
    // nữa thì quái thành vô hại.
    //   máu  36 -> 396  (11,0 lần)
    //   công 12,7 -> 111 (8,8 lần)   <- chậm hơn, đúng chiều
    mobAtkBase: 11, mobAtkPerLv: 1.7,
    eliteHpMul: 3.4, goldHpMul: 2.2,
    // Máu boss suy ra TỪ máu quái thường, không phải một bảng số tự do — có vậy
    // hai đường cong mới không lệch nhau như bản cũ.
    // Chia cho HỆ SỐ THỜI GIAN THẬT SỰ ĐANG BẮN. Bảng đầu (40/50/62/78) đặt theo
    // tỉ lệ boss/quái ~40-78 lần, và đo được TTK 73 giây — nghe thì đúng dải
    // 45-90s, nhưng đó là ở giả định bắn 100% thời gian.
    //
    // Không đúng, vì PUNICON LÀ MỘT NGÓN (punicon.js: "ngón thứ hai bị bỏ qua").
    // Kéo là chạy, chạm là bắn, và một ngón không làm được hai việc cùng lúc —
    // đúng mô hình Archero. Nên A × U trong công thức ngân sách (§2.1 của
    // SHOOTER.md) là 0,72 chứ không phải 1,0, và 73 giây thật ra là 101 giây.
    // Chia 4/3 xuống: TTK ~55s ở uptime hoàn hảo, ~76s ở uptime thật.
    bossHpMul: { B: 30, A: 38, S: 47, SS: 59 },
    // Giáp PHẢI là phần trăm, không được trừ thẳng: với max(1, dmg − armor),
    // giáp 3 điểm làm khẩu 4 sát thương mất 75% sức mạnh còn khẩu 22 sát thương
    // chỉ mất 12% — xoá sổ nguyên một dòng vũ khí một cách vô tình.
    armorK: 50,                        // dmg × K/(K + armor)
    critMul: 1.75,                     // số nhỏ thì hệ số phải thấp
    critBase: 0.15,
    dmgVariance: 0.10,                 // ±10%, hẹp — đừng chồng lên crit
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
  /* ======================= ĐỔI NGƯỜI: LUẬT GENSHIN =======================
   * Đội ba người mà đổi qua đổi lại tự do thì nó chỉ là ba thanh máu nối đuôi
   * nhau. Genshin biến đúng cái nút đổi đó thành trục chính của cả trận bằng ba
   * luật, và ba luật này chép về đây:
   *
   *   1. ĐỔI CÓ HỒI CHIÊU. Không có nó thì không có nhịp, và mọi tính toán
   *      "đổi lúc nào" đều biến mất. Genshin để khoảng 1 giây; ở đây 1,2s vì
   *      trận này ngắn hơn và dày quái hơn.
   *
   *   2. NGƯỜI MỚI LAO RA CÓ ĐÒN. Không phải để thêm sát thương — mà để việc
   *      đổi người có HÌNH ẢNH. Đổi mà màn hình không đổi gì thì người chơi
   *      không tin là mình vừa làm một việc.
   *
   *   3. HAI HỆ KHÁC NHAU GẶP NHAU THÌ NỔ. Đây là cái làm cho THỨ TỰ đổi có ý
   *      nghĩa: Hỏa rồi Thủy khác Thủy rồi Hỏa. Ở đây dùng đúng bảng khắc chế
   *      sẵn có (G.ELEM_BEATS) chứ không bịa một bảng phản ứng thứ hai — một
   *      bảng khắc chế đã đủ, hai bảng thì người chơi phải nhớ hai thứ.
   *
   * COMBO CHUỖI: đổi liên tiếp trong `comboMs` thì đòn ra mắt mạnh dần. Nó
   * thưởng cho việc xoay vòng cả đội thay vì nhảy qua nhảy lại giữa hai người,
   * đúng cái mà vòng xoay của Genshin dạy. */
  G.SWAP = {
    cd: 1200,          // hồi chiêu đổi người
    entryMul: 2.4,     // hệ số sát thương của đòn ra mắt
    entryR: 108,       // bán kính đòn ra mắt
    reactMul: 1.75,    // nhân thêm khi hai hệ phản ứng với nhau
    reactR: 150,       // phản ứng nổ rộng hơn đòn thường
    comboMs: 2800,     // đổi lại trong ngần này thì cộng chuỗi
    comboMax: 4,
    comboStep: 0.20    // mỗi nấc chuỗi +20% đòn ra mắt
  };

  /* Tên phản ứng — theo cặp khắc chế. Có tên thì người chơi nhớ được cặp nào ăn
   * cặp nào; không tên thì mọi lần nổ trông giống nhau và không ai học được gì. */
  G.REACT = {
    'water>fire':    { n: 'BỐC HƠI',   col: '#4fb6ff', st: null },
    'fire>earth':    { n: 'THIÊU RỤI', col: '#ff7a3c', st: 'burn' },
    'earth>thunder': { n: 'TIẾP ĐỊA',  col: '#8fd14f', st: 'slow' },
    'thunder>water': { n: 'DẪN ĐIỆN',  col: '#ffd23f', st: 'paralysis' },
    'light>dark':    { n: 'THANH TẨY', col: '#fff6d8', st: null },
    'dark>light':    { n: 'NUỐT SÁNG', col: '#a06fe0', st: 'poison' }
  };
  G.reactOf = function (fromEl, toEl) {
    if (!fromEl || !toEl || fromEl === toEl) return null;
    return G.REACT[toEl + '>' + fromEl] || G.REACT[fromEl + '>' + toEl] || null;
  };

  /* ============================ THANH ULTI ==============================
   * Kỹ năng KHÔNG chạy bằng hồi chiêu nữa. Nó chạy bằng một thanh nạp treo trên
   * đầu nhân vật, và thanh đó dâng bằng đúng một việc: ĐÁNH TRÚNG.
   *
   * Vì sao đổi. Hồi chiêu đếm thời gian, nên nó thưởng cho việc CHỜ: đứng né
   * lòng vòng mười giây thì kỹ năng vẫn về đủ. Thanh nạp thì thưởng cho việc
   * XÔNG VÀO — muốn có đòn to thì phải bắn trúng đủ nhiều trước đã. Đó là vòng
   * lặp của thể loại này, và nó cũng làm cho thanh trên đầu char có nghĩa: nhìn
   * nó là biết còn bao xa tới đòn lớn, không phải nhìn một con số đếm ngược.
   *
   * NẤC GIỮA là chỗ ra quyết định. Qua nấc thì xả được đòn NHỎ ngay; nhịn thêm
   * tới khi đầy thì xả được đòn LỚN. Không có nấc thì thanh nạp chỉ là hồi chiêu
   * đội lốt — có nấc thì mỗi lần đầy nửa thanh là một lần phải chọn.
   *
   * `sec` là mốc cân bằng duy nhất: bắn TRÚNG liên tục ngần ấy giây thì đầy,
   * cho MỌI lớp vũ khí. Quy về giây chứ không quy về số phát, vì súng trường
   * bắn 5 phát/giây còn bắn tỉa 0,9 — đếm phát thì hai cây lệch nhau sáu lần.
   * ==================================================================== */
  G.ULTI = {
    sec: 11,          // bắn trúng liên tục 11 giây thì đầy thanh
    notch: 0.55,      // qua nấc này: xả được kỹ năng 1
    killGain: 0.030,  // mỗi con chết cộng thêm, để dọn đám cũng nạp được
    bossMul: 0.60,    // đánh boss nạp chậm hơn: boss đứng yên cho bắn, dễ nạp tràn
    cost: [0.55, 1.00]   // giá của từng kỹ năng, khớp với nấc
  };

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

  /* ---------------------------------- NGUỒN RƠI ĐỒ CHO LỚP GẬY PHÉP ------
   * Trường `weapon` của Behemoth là dữ liệu lấy NGUYÊN VĂN từ wiki, nên nó chỉ
   * biết năm lớp cũ. Ánh xạ sang lớp mới cho ra: sniper 11 · launcher 9 ·
   * rifle 15 · shotgun 9 · bow 12 — và GẬY PHÉP ĐƯỢC 0.
   *
   * Không con Behemoth nào rơi ra gậy nghĩa là tám nhân vật lớp gậy vĩnh viễn
   * không có gì để lắp. Nên phải chuyển một phần sang, và chuyển theo một luật
   * ĐỌC ĐƯỢC chứ không phải bốc tay: con nào mang hệ QUANG hoặc ÁM — hai hệ
   * mang tính phép thuật nhất trong sáu hệ — thì đổi sang gậy. Lấy từ hai lớp
   * đang dư nhất (rifle 15, sniper 11), không đụng vào ba lớp còn lại.
   *
   * Đây là chỗ lệch bản gốc thứ NĂM, cùng loại với bốn chỗ đã ghi trong
   * data/games.js: bản gốc không có lớp gậy nên không có gì để lấy nguyên văn. */
  (function () {
    G.BEHEMOTHS.forEach(function (b) {
      // Luật: con nào mang LOẠI SOUL thì rơi ra gậy. Trong ba loại đặc thù của
      // bản gốc, Soul là loại "có thanh nội lực, đầy thì vào trạng thái tăng sức
      // mạnh" — tức là loại duy nhất nói về một nguồn năng lượng bên trong chứ
      // không phải về nhiệt hay về đòn đánh. Đó là con đường ngắn nhất từ dữ
      // liệu CÓ SẴN của wiki sang một lớp vũ khí phép, không phải bốc tay.
      if (b.type === 'soul') b.weapon = 'staff';
    });
  })();

  // Dựng danh sách ải sau cùng, vì nó cần G.behemothById và G.areaById.
  G.buildStages();

  G.rollRank = function (rates, rnd) {
    var r = rnd(), acc = 0;
    for (var k in rates) { acc += rates[k]; if (r < acc) return k; }
    return Object.keys(rates)[Object.keys(rates).length - 1];
  };
})(window.DP = window.DP || {});
