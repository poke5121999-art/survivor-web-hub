/*
 * CHUYẾN TÀU CUỐI — hạt, rung màn, dừng hình, ánh sáng.
 *
 * Mọi con số ở đây đều có nguồn, và nguồn phần lớn là MÃ NGUỒN của game đã phát hành
 * chứ không phải một bài blog kể lại. Chỗ nào tự nghĩ thì ghi rõ.
 *
 * ============================================================================
 * BỐN LUẬT KHÔNG ĐƯỢC PHÁ
 * ============================================================================
 *
 * 1. KHÔNG DÙNG ctx.filter. iOS Safari TẮT MẶC ĐỊNH thuộc tính này từ bản 18.0 và
 *    không hỗ trợ gì ở 3.2–17.7. Game chạy trên điện thoại, nên dùng nó nghĩa là mọi
 *    iPhone không thấy hiệu ứng — im lặng, không lỗi, không ai biết cho tới khi có
 *    người nhắn "sao máy tôi không thấy gì". Nhấp trắng làm bằng bóng nướng sẵn (art.js).
 *
 * 2. BIÊN ĐỘ RUNG LÀ HẰNG SỐ, chỉ THỜI LƯỢNG đổi theo sự kiện.
 *    Celeste Classic: `E.camera(-2 + rnd(5), -2 + rnd(5))` — luôn ±2 px trên màn 128 px
 *    = ±1,56% bề ngang, và biến `shake` chỉ đếm SỐ KHUNG. Vlambeer nói cùng một điều
 *    bằng lời: "một hai pixel là đi rất xa rồi". Hai nguồn độc lập, cùng một con số.
 *    Cách sai (và là cách trực giác mách bảo) là cho biên độ chạy từ 1 tới 14 rồi suy
 *    thời lượng ra từ biên độ — làm thế thì cú rung nhỏ tắt ngay còn cú rung to giật
 *    gần một giây, và không cú nào đọc ra là "một cú va".
 *
 * 3. CỘNG SÁNG CHỈ CHO THỨ TỰ PHÁT SÁNG. Lửa, chớp nòng, sét, tia. Bụi và máu vẽ ở
 *    lớp thường. Rắc bụi vào lớp cộng sáng thì mười bốn hiệu ứng khác nhau ra mười bốn
 *    cái đĩa trắng giống hệt nhau — mất sạch cả hình lẫn màu.
 *
 * 4. TRỤC MÀU LÀ LAM ↔ CAM, KHÔNG PHẢI ĐỎ ↔ LỤC.
 *    Mù màu đỏ-lục dính khoảng 7,5% nam giới; lam-vàng dính 0,008% — ít hơn gần một
 *    nghìn lần. Địch giữ viền ĐỎ vì đó là quy ước đã có (Riot công bố cho VALORANT:
 *    địch viền đỏ, đồng minh viền lam trung tính), nhưng mọi thứ "của mình" đi trục
 *    lam-cam. Xanh lá chỉ dùng cho hồi máu — chỗ đã có sẵn chữ thập và con số đi kèm.
 */
(function (root) {
  'use strict';

  const CT = root.CT;
  const F = CT.FX = {};
  const A = CT.ART;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------
  // TRẠNG THÁI
  // ---------------------------------------------------------------------------
  const S = {
    shakeT: 0, shakeDur: 0,      // đếm ngược, tính bằng giây
    hitstop: 0, tsGoal: 1, tsNow: 1, tsFadeT: 0, tsFadeDur: 0, tsFrom: 1,
    flash: 0, flashCol: '255,255,255', flashAt: [],  // dấu thời gian ba cú chớp gần nhất
    ambPlus: 0,                  // chớp nòng nâng độ sáng cả cảnh, DOOM style
    parts: [], vfx: [], pops: [], lights: [],
    seed: 1
  };
  F.S = S;

  let opt = { fx: 1, shake: 1 };
  F.setOpt = o => { opt = Object.assign(opt, o || {}); };

  // Nhiễu mượt một chiều — dùng cho rung màn thay vì random thuần. Random thuần đổi
  // hướng mỗi khung, ở 60fps là ba mươi lần đảo chiều mỗi giây và đọc ra là giật động
  // kinh chứ không phải một cú va.
  const NOISE = new Float32Array(512);
  for (let i = 0; i < 512; i++) NOISE[i] = Math.random() * 2 - 1;
  function smoothNoise(t) {
    const x = t * 26;               // 26 Hz — đủ nhanh để đọc ra là rung, đủ chậm để mượt
    const i = Math.floor(x), f = x - i;
    const a = NOISE[i & 511], b = NOISE[(i + 1) & 511];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }

  // ---------------------------------------------------------------------------
  // RUNG MÀN
  // ---------------------------------------------------------------------------
  // Bảng thời lượng đọc thẳng từ Celeste Classic (PICO-8, 30 khung/giây):
  //   lướt         shake 6  = 200 ms
  //   bệ đáp đất   shake 5  = 167 ms
  //   chết / nhặt vật phẩm lớn  shake 10 = 333 ms
  const SHAKE = {
    ban:     0.10,   // một phát súng lục
    hoacai:  0.17,   // súng hoa cải — bằng cú đáp đất của Celeste
    trung:   0.08,
    chet:    0.20,
    no:      0.33,   // bằng cú chết của Celeste
    nolon:   0.42,
    dinhdon: 0.25,
    tau:     0.33,
    set:     0.50
  };
  F.SHAKE = SHAKE;
  const SHAKE_PCT = 0.0156;   // ±1,56% bề ngang khung

  F.shake = function (kind) {
    const d = (typeof kind === 'number') ? kind : (SHAKE[kind] || 0.12);
    if (d > S.shakeT) { S.shakeT = d; S.shakeDur = d; }
  };
  // Trả về độ lệch camera của khung này. Lấy hai kênh nhiễu LỆCH PHA cho hai trục —
  // nếu dùng chung một góc ngẫu nhiên thì độ lệch luôn nằm trên một VÒNG TRÒN bán kính
  // cố định, không bao giờ gần 0, và cảm giác ra khác hẳn.
  F.shakeOffset = function (w) {
    if (S.shakeT <= 0 || !opt.shake) return { x: 0, y: 0, rot: 0 };
    const amp = w * SHAKE_PCT * opt.shake;
    const t = S.shakeT;
    // Tắt dần ở 25% cuối, không tắt suốt — giữ đúng tinh thần "biên độ cố định".
    const k = Math.min(1, S.shakeT / (S.shakeDur * 0.25 + 0.0001));
    return {
      x: smoothNoise(t + 0.0) * amp * k,
      y: smoothNoise(t + 3.7) * amp * k,
      rot: smoothNoise(t + 8.1) * 0.008 * k * opt.shake
    };
  };

  // ---------------------------------------------------------------------------
  // DỪNG HÌNH / LÀM CHẬM
  // ---------------------------------------------------------------------------
  // Bảng đo từ beat 'em up Capcom, 60 khung/giây:
  //   Final Fight       6 khung = 100 ms  (mọi đòn)
  //   Warriors of Fate  5 khung =  83 ms  (đòn nhẹ)
  //   The Punisher      9 khung = 150 ms  (đòn kết combo)
  // Và mẹo đáng chép nhất của cả bảng — The Punisher cho NGƯỜI BỊ ĐÁNH đứng hình lâu
  // hơn NGƯỜI ĐÁNH đúng 2 khung: người đánh thoát trước nên thao tác tiếp mượt, mà cú
  // đấm vẫn nặng. Ở đây cài bằng cách cho quái một `stopT` riêng dài hơn của người chơi.
  const HIT = { nhe: 0.085, nang: 0.15, chet: 0.10, boss: 0.185, nguoi: 0.22 };
  F.HIT = HIT;
  F.hitstop = function (kind) {
    // Cổng bảo vệ của Celeste: đang chậm sẵn thì đừng chồng dừng hình lên nữa.
    if (S.tsGoal <= 0.25) return;
    const d = (typeof kind === 'number') ? kind : (HIT[kind] || 0.085);
    if (d > S.hitstop) S.hitstop = d;
  };

  // Bullet-time: hệ số 0,5 theo tài liệu Unity, ease vào và ra 160 ms theo demo gốc của
  // "Juice it or lose it" (FADE_IN_MS / FADE_OUT_MS trần 160).
  F.slowmo = function (mul, dur) {
    S.tsGoal = mul; S.tsFrom = S.tsNow; S.tsFadeT = 0; S.tsFadeDur = 0.16;
    S.slowLeft = dur;
  };
  F.slowEnd = function () {
    S.tsGoal = 1; S.tsFrom = S.tsNow; S.tsFadeT = 0; S.tsFadeDur = 0.16; S.slowLeft = 0;
  };
  F.timeScale = () => S.tsNow;
  F.isFrozen = () => S.hitstop > 0;

  // ---------------------------------------------------------------------------
  // CHỚP MÀN
  // ---------------------------------------------------------------------------
  // Quake: alpha 0,118 (đòn nhẹ nhất) tới 0,588 (nặng nhất), tắt tuyến tính 150 đơn vị
  // mỗi giây — tức 200 ms cho cú nhẹ, 1000 ms cho cú chí mạng.
  //
  // Và một cái van bắt buộc: hướng dẫn về an toàn thị giác cấm QUÁ BA CÚ CHỚP MỖI GIÂY.
  // Một cú chớp 200 ms nghĩa là về lý thuyết nhồi được tám lần một giây khi bị bầy quái
  // vây. Nên lần thứ tư trở đi chỉ KÉO DÀI cú đang chạy chứ không bật lại từ đầu.
  //
  // Màu: giữ mọi màu dưới ngưỡng "đỏ bão hoà" R/(R+G+B) ≥ 0.8. `190,60,50` cho 0,633 —
  // an toàn. Đừng bao giờ đổi sang đỏ thuần 255,0,0.
  F.flash = function (a, col) {
    const now = performance.now() / 1000;
    S.flashAt = S.flashAt.filter(t => now - t < 1);
    if (S.flashAt.length >= 3) {                 // đã ba cú trong một giây
      S.flash = Math.max(S.flash, a * 0.5);      // chỉ nuôi cú đang chạy, không bật lại
      return;
    }
    S.flashAt.push(now);
    S.flash = Math.max(S.flash, a * (opt.fx || 1));
    S.flashCol = col || '190,60,50';
  };

  // ---------------------------------------------------------------------------
  // HẠT
  // ---------------------------------------------------------------------------
  // Kho hạt cấp phát sẵn. Đầy thì BỎ QUA không tạo — với hạt thì người chơi không nhận
  // ra vụ nổ sau kém hoành tráng hơn một chút, còn một cú thu gom rác giữa chừng là một
  // khung hình rơi mà ai cũng thấy.
  const MAXP = 700;
  const pool = [];
  for (let i = 0; i < MAXP; i++) pool.push({ live: false });
  let plive = 0;
  function spawn() {
    if (plive >= MAXP) return null;
    for (let i = 0; i < MAXP; i++) {
      const p = pool[i];
      if (!p.live) { p.live = true; plive++; return p; }
    }
    return null;
  }

  // Kiểu hạt. `k`: 0 thường (chịu ánh sáng), 1 tự phát sáng (cộng sáng).
  function part(o) {
    if (!opt.fx) return;
    const p = spawn();
    if (!p) return;
    p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.g = o.g || 0; p.drag = o.drag || 0;
    p.r = o.r || 2; p.r2 = o.r2 != null ? o.r2 : p.r;
    p.t = 0; p.life = o.life || 0.5;
    p.col = o.col || '200,200,200'; p.a = o.a != null ? o.a : 1;
    p.k = o.k || 0; p.flat = o.flat || 0; p.rot = o.rot || 0; p.spin = o.spin || 0;
    p.shape = o.shape || 'dot';
  }
  F.part = part;

  // --- MÁU ---
  // Quake: một phát đạn trúng thân sinh 20 hạt, mỗi hạt sống 0 → 0,4 giây, có trọng lực.
  // Rẻ đến bất ngờ, và đó là lý do nó chạy được trên máy năm 1996.
  F.blood = function (x, y, ang, n) {
    n = n || 20;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 1.5;
      const s = 60 + Math.random() * 190;
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6,
             g: 320, drag: 2.2, r: 1.4 + Math.random() * 2.2, r2: 0.6,
             life: Math.random() * 0.4, col: '138,22,20', a: 0.95 });
    }
  };

  // --- KHÓI ỐNG KHÓI ---
  // Tham số lấy từ bộ makeSmoke của LittleJS (engine 2D chạy Canvas 2D, nên chuyển sang
  // gần như một-đổi-một): đời hạt 1,0 giây, nở gấp bốn, nổi lên bằng -0,3 lần trọng lực,
  // fade 5% đầu và 5% cuối, KHÔNG cộng sáng.
  //
  // Và mẹo đáng giá nhất của cả tệp: hệ số cuốn của một luồng khói là 0,12 khi nó bay
  // thẳng lên, nhưng nhảy lên 0,6 khi nó bị GIÓ BẺ NGANG — gấp năm lần. Nên lúc tàu chạy
  // nhanh, khói phải NỞ nhanh gấp mấy lần chứ không chỉ bị thổi ra sau. Gần như không ai
  // làm cái này, và nó là thứ phân biệt khói tàu với một dãy hình tròn xám.
  //
  // Khói không bám vào toạ độ tàu — nó ở lại đúng chỗ nó sinh ra trong thế giới. Đó là
  // toàn bộ cách làm khói trôi ngược: không cộng vận tốc âm cho hạt, chỉ đừng gắn nó vào
  // con tàu.
  F.chuff = function (x, y, speedN, ring) {
    const n = 7 + ((Math.random() * 3) | 0);
    const dark = ring != null ? ring : 0.4; // 0 trắng, 1 đen — thang Ringelmann
    const g0 = Math.round(245 - dark * 200);
    for (let i = 0; i < n; i++) {
      // Hạt nở TỚI ĐÂU là chuyện phải kẹp lại. Bản đầu cho r2 = r × 2 × bend, mà bend
      // lên tới 5 lúc chạy hết tốc — thành hạt bán kính 90 đơn vị, trong khi cả sàn tàu
      // chỉ cao 96. Kết quả là một đám mây trắng nuốt trọn đầu máy: không nhìn thấy cửa
      // lò, không thấy cabin, không thấy người đứng đâu.
      //
      // Cái mà tốc độ làm với luồng khói KHÔNG phải là thổi phồng nó lên đều mọi phía —
      // mà là kéo nó về sau và dẹp nó xuống. Phần kéo về sau đã có sẵn miễn phí: hạt
      // đứng yên trong thế giới còn khung hình chạy theo tàu, nên nó tự trôi ngược.
      // Nên ở đây chỉ cần cho nó nở vừa phải.
      const r0 = 4 + Math.random() * 3;
      part({ x: x + (Math.random() - 0.5) * 9, y: y + (Math.random() - 0.5) * 6,
             vx: (Math.random() - 0.5) * 26, vy: -(42 + Math.random() * 48),
             g: -34, drag: 6.3,
             r: r0, r2: r0 * (1.7 + speedN * 1.1),
             life: 1.2 + Math.random() * 1.3,
             col: g0 + ',' + (g0 - 4) + ',' + (g0 - 12), a: 0.30 });
    }
  };

  // --- BỤI BÁNH XE ---
  // Khác khói ở đúng một chỗ hình học: ELIP DẸT và vận tốc dọc gần bằng không. Hạt lan
  // NGANG chứ không bay lên — đó là toàn bộ khác biệt giữa "bụi" và "khói nhỏ".
  // Và sinh theo QUÃNG ĐƯỜNG chứ không theo thời gian: tàu đứng thì không có bụi.
  // Màu lấy từ bảng màu cát chuẩn: lõi #EDC9AF, giữa #C2B280, rìa #C19A6B.
  F.dust = function (x, y, n, speedN) {
    n = n || 2;
    for (let i = 0; i < n; i++) {
      part({ x: x + (Math.random() - 0.5) * 14, y,
             vx: -(20 + Math.random() * 70) * (0.3 + speedN),
             vy: -(4 + Math.random() * 14),
             g: 26, drag: 3.2,
             r: 3 + Math.random() * 3, r2: 16 + Math.random() * 10,
             life: 0.45 + Math.random() * 0.35,
             col: '210,182,150', a: 0.42, flat: 0.45 });
    }
  };

  // --- TIA LỬA / CHỚP NÒNG ---
  F.sparks = function (x, y, ang, n, col) {
    n = n || 6;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 0.9;
      const s = 130 + Math.random() * 220;
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
             g: 240, drag: 3.4, r: 1.6, r2: 0.4,
             life: 0.12 + Math.random() * 0.18,
             col: col || '255,214,120', a: 1, k: 1 });
    }
  };

  // --- VỎ ĐẠN ---
  // Half-Life: sống đúng 2,5 giây, chỉ có trọng lực + nảy + xoay, rồi BIẾN MẤT ĐỘT NGỘT
  // (không mờ dần). Ba dòng, và nó là chuẩn mực của thể loại.
  F.shell = function (x, y, ang) {
    const a = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    part({ x, y, vx: Math.cos(a) * (55 + Math.random() * 25),
           vy: Math.sin(a) * (20 + Math.random() * 14) - 40,
           g: 420, drag: 0.9, r: 2.2, r2: 2.2, life: 2.5,
           col: '200,160,60', a: 1, shape: 'shell',
           rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 16 });
  };

  // --- LỬA / TÀN ---
  F.embers = function (x, y, n) {
    for (let i = 0; i < (n || 4); i++)
      part({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 8,
             vx: (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 50),
             g: -14, drag: 1.6, r: 2.2, r2: 0.5, life: 0.5 + Math.random() * 0.5,
             col: '255,150,60', a: 1, k: 1 });
  };

  // ---------------------------------------------------------------------------
  // SỐ SÁT THƯƠNG
  // ---------------------------------------------------------------------------
  // Gộp cộng dồn: nếu đã có số trên cùng mục tiêu còn sống dưới 250 ms thì cộng vào số
  // cũ và cho nó nảy lại, thay vì sinh số mới. Rẻ hơn hẳn kiểu "dò va chạm tìm chỗ
  // trống", và ở một game bắn nhanh thì nó đọc RÕ HƠN — một con số to đang lớn dần nói
  // được nhiều hơn tám con số nhỏ chồng lên nhau.
  const POP_MAX = 24;
  F.pop = function (x, y, text, col, big, key) {
    if (!opt.fx) return;
    if (key != null && typeof text === 'number') {
      for (let i = S.pops.length - 1; i >= 0; i--) {
        const p = S.pops[i];
        if (p.key === key && p.t < 0.25 && typeof p.n === 'number') {
          p.n += text; p.text = String(Math.round(p.n));
          p.t = 0; p.bump = 1; return;
        }
      }
    }
    if (S.pops.length >= POP_MAX) S.pops.shift();
    S.pops.push({ x, y, n: typeof text === 'number' ? text : null,
                  text: String(typeof text === 'number' ? Math.round(text) : text),
                  col: col || '#f2e7cf', t: 0, life: big ? 1.2 : 0.8,
                  size: big ? 19 : 13, bump: 1, key: key });
  };

  // ---------------------------------------------------------------------------
  // HIỆU ỨNG SPRITE
  // ---------------------------------------------------------------------------
  F.vfx = function (id, x, y, o) {
    if (!opt.fx) return null;
    o = o || {};
    const e = { id, x, y, t: 0, scale: o.scale || 1, rot: o.rot || 0,
                alpha: o.alpha != null ? o.alpha : 1,
                dur: o.dur || A.vfxDur(id), follow: o.follow || null,
                ox: o.ox || 0, oy: o.oy || 0 };
    S.vfx.push(e);
    return e;
  };

  // ---------------------------------------------------------------------------
  // ÁNH SÁNG
  // ---------------------------------------------------------------------------
  // Nguồn sáng đăng ký mỗi khung, xoá sạch đầu khung sau. Lớp tối vẽ vào canvas phụ.
  F.light = function (o) { S.lights.push(o); };

  // Nhấp nháy lửa: hai thành phần cộng lại.
  //   9,9 Hz biên ±0,035 — tần số dao động của một ngọn lửa thật, đo bằng photodiode.
  //     Biên độ dưới ngưỡng 10% nên KHÔNG bị tính là một cú chớp.
  //   2,4 Hz biên ±0,06  — nhịp bùng than, đủ lớn để thấy, và 2,4 < 3 lần/giây nên vẫn
  //     nằm trong giới hạn an toàn.
  // Cộng lại ra dải ~0,19 đỉnh-đỉnh: sinh động mà không vi phạm cả hai điều kiện.
  F.fireGlow = function (t) {
    const L = CT.LIGHT.fire;
    return L.base
      + L.ampFast * Math.sin(t * TAU * L.hzFast)
      + L.ampSlow * Math.sin(t * TAU * L.hzSlow + 1.7);
  };

  // ---------------------------------------------------------------------------
  // NHỊP
  // ---------------------------------------------------------------------------
  F.step = function (dtReal) {
    // dừng hình chạy bằng đồng hồ THẬT, nếu không nó tự khoá chính nó
    if (S.hitstop > 0) { S.hitstop -= dtReal; if (S.hitstop < 0) S.hitstop = 0; }

    // ease tốc độ thời gian
    if (S.tsFadeDur > 0) {
      S.tsFadeT += dtReal;
      const k = Math.min(1, S.tsFadeT / S.tsFadeDur);
      S.tsNow = S.tsFrom + (S.tsGoal - S.tsFrom) * k;
      if (k >= 1) S.tsFadeDur = 0;
    } else S.tsNow = S.tsGoal;
    if (S.slowLeft > 0) {
      S.slowLeft -= dtReal;
      if (S.slowLeft <= 0) F.slowEnd();
    }

    if (S.shakeT > 0) { S.shakeT -= dtReal; if (S.shakeT < 0) S.shakeT = 0; }
    if (S.flash > 0)  { S.flash -= dtReal * 3.0; if (S.flash < 0) S.flash = 0; }
    if (S.ambPlus > 0){ S.ambPlus -= dtReal * 7;  if (S.ambPlus < 0) S.ambPlus = 0; }

    const dt = dtReal * (S.hitstop > 0 ? 0 : S.tsNow);
    if (dt <= 0) return;

    // hạt
    for (let i = 0; i < MAXP; i++) {
      const p = pool[i];
      if (!p.live) continue;
      p.t += dt;
      if (p.t >= p.life) { p.live = false; plive--; continue; }
      // Giảm tốc theo hàm mũ, KHÔNG phải nhân một hằng số mỗi khung. Nhân hằng số mỗi
      // khung thì hạt bay xa khác nhau tuỳ máy chạy nhanh chậm.
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }

    // hiệu ứng sprite
    for (let i = S.vfx.length - 1; i >= 0; i--) {
      const e = S.vfx[i];
      e.t += dt;
      if (e.follow) { e.x = e.follow.x + e.ox; e.y = e.follow.y + e.oy; }
      if (e.t >= e.dur) S.vfx.splice(i, 1);
    }

    // số bay lên
    for (let i = S.pops.length - 1; i >= 0; i--) {
      const p = S.pops[i];
      p.t += dt;
      if (p.bump > 0) p.bump -= dt * 6;
      if (p.t >= p.life) S.pops.splice(i, 1);
    }

    S.lights.length = 0;
  };

  // ---------------------------------------------------------------------------
  // VẼ
  // ---------------------------------------------------------------------------
  // Ba lượt riêng: lớp thường (bụi, máu, vỏ đạn) → lớp cộng sáng (lửa, tia) → số.
  // WHY ba lượt chứ không một: đổi globalCompositeOperation cho TỪNG hạt là thứ đắt
  // nhất có thể làm trên canvas. Đặt một lần cho cả nhóm rồi vẽ hết nhóm đó.
  F.drawParts = function (c, glow) {
    const want = glow ? 1 : 0;
    let opened = false;
    for (let i = 0; i < MAXP; i++) {
      const p = pool[i];
      if (!p.live || p.k !== want) continue;
      if (!opened) {
        c.save();
        if (glow) c.globalCompositeOperation = 'lighter';
        opened = true;
      }
      const k = p.t / p.life;
      const r = p.r + (p.r2 - p.r) * k;
      const a = p.a * (k < 0.05 ? k / 0.05 : (1 - (k - 0.05) / 0.95));
      if (a <= 0.004) continue;
      c.globalAlpha = a;
      if (p.shape === 'shell') {
        A.shell(c, p.x, p.y, p.rot, a);
        continue;
      }
      c.fillStyle = 'rgba(' + p.col + ',1)';
      c.beginPath();
      if (p.flat) c.ellipse(p.x, p.y, r, r * p.flat, 0, 0, TAU);
      else c.arc(p.x, p.y, r, 0, TAU);
      c.fill();
    }
    if (opened) c.restore();
  };

  F.drawVfx = function (c, layer) {
    for (let i = 0; i < S.vfx.length; i++) {
      const e = S.vfx[i];
      if (A.vfxLayer(e.id) !== layer) continue;
      A.drawVfx(c, e.id, e.x, e.y, e.t, { scale: e.scale, rot: e.rot, alpha: e.alpha });
    }
  };

  F.drawPops = function (c) {
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < S.pops.length; i++) {
      const p = S.pops[i];
      const k = p.t / p.life;
      // bay lên 34 px/giây, chậm dần theo easeOutQuad
      const rise = 34 * p.life * (1 - (1 - k) * (1 - k));
      const a = k < 0.1 ? k / 0.1 : 1 - Math.pow((k - 0.1) / 0.9, 2);
      const bump = 1 + Math.max(0, p.bump) * 0.4;
      c.globalAlpha = a;
      c.font = '700 ' + Math.round(p.size * bump) + 'px system-ui, sans-serif';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.72)';
      c.strokeText(p.text, p.x, p.y - rise);
      c.fillStyle = p.col;
      c.fillText(p.text, p.x, p.y - rise);
    }
    c.restore();
  };

  // Chớp toàn màn — vẽ sau cùng, trên cả HUD.
  F.drawFlash = function (c, w, h) {
    if (S.flash <= 0.003) return;
    c.save();
    c.fillStyle = 'rgba(' + S.flashCol + ',' + Math.min(0.6, S.flash).toFixed(3) + ')';
    c.fillRect(0, 0, w, h);
    c.restore();
  };

  // ---------------------------------------------------------------------------
  // LỚP ÁNH SÁNG
  // ---------------------------------------------------------------------------
  // Vẽ vào một canvas phụ: tô kín màu trời, rồi KHOÉT các vũng sáng bằng 'lighter'.
  // Ghép vào cảnh bằng 'multiply'. Thứ tự này quan trọng: nhân lớp tối lên cảnh làm tối
  // CẢ NHÂN VẬT, nên vũng sáng dưới chân người chơi phải sáng gần hết ở tâm rồi mới tụt
  // — nếu không thì bộ hình vẽ tay ra một cục xám và người chơi không nhìn rõ chính mình.
  let lc = null, lx = null;
  F.drawLight = function (c, w, h, amb, tint) {
    if (amb >= 0.995) return;                 // ban ngày: không có lớp tối
    if (!lc) { lc = document.createElement('canvas'); lx = lc.getContext('2d'); }
    if (lc.width !== w || lc.height !== h) { lc.width = w; lc.height = h; }

    const a = Math.max(0, Math.min(1, amb + S.ambPlus));
    const g = Math.round(a * 255);
    lx.globalCompositeOperation = 'source-over';
    lx.fillStyle = tint || ('rgb(' + g + ',' + g + ',' + g + ')');
    lx.globalAlpha = 1;
    lx.fillRect(0, 0, w, h);
    // pha loãng tint về phía xám theo độ sáng nền — nếu không thì đêm máu ra một tấm
    // kính đỏ phủ kín chứ không phải một đêm tối màu đỏ.
    lx.globalCompositeOperation = 'lighter';
    lx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
    lx.fillRect(0, 0, w, h);

    for (let i = 0; i < S.lights.length; i++) {
      const L = S.lights[i];
      const p = (L.power != null ? L.power : 1);
      if (L.half != null) {
        // nón: một quạt sáng theo hướng nhìn
        const grd = lx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
        grd.addColorStop(0, rgbA(L.warm, p));
        grd.addColorStop(L.core || 0.35, rgbA(L.warm, p * 0.55));
        grd.addColorStop(1, rgbA(L.warm, 0));
        lx.fillStyle = grd;
        lx.beginPath();
        lx.moveTo(L.x, L.y);
        lx.arc(L.x, L.y, L.r, L.a - L.half, L.a + L.half);
        lx.closePath();
        lx.fill();
      }
      const r = L.r2 != null ? L.r2 : L.r * (L.half != null ? 0.42 : 1);
      const grd2 = lx.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      grd2.addColorStop(0, rgbA(L.warm, p));
      grd2.addColorStop(L.core || 0.4, rgbA(L.warm, p * 0.62));
      grd2.addColorStop(1, rgbA(L.warm, 0));
      lx.fillStyle = grd2;
      lx.beginPath(); lx.arc(L.x, L.y, r, 0, TAU); lx.fill();
    }

    c.save();
    c.globalCompositeOperation = 'multiply';
    c.drawImage(lc, 0, 0);
    c.restore();
  };

  function rgbA(hex, a) {
    const h = hex || '#ffffff';
    const n = parseInt(h.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }
  F.rgbA = rgbA;

  // Tối bốn góc. Luôn có, kể cả ban ngày — chỉ đậm nhạt khác nhau. Nó là thứ kéo mắt
  // vào giữa màn hình mà không ai để ý là nó ở đó.
  let vg = null, vgW = 0, vgH = 0, vgK = -1;
  F.drawVignette = function (c, w, h, k) {
    if (k <= 0.01) return;
    if (!vg || vgW !== w || vgH !== h || Math.abs(vgK - k) > 0.02) {
      vg = document.createElement('canvas'); vg.width = w; vg.height = h;
      const x = vg.getContext('2d');
      const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30,
                                       w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,' + k.toFixed(3) + ')');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      vgW = w; vgH = h; vgK = k;
    }
    c.drawImage(vg, 0, 0);
  };

  F.reset = function () {
    for (let i = 0; i < MAXP; i++) pool[i].live = false;
    plive = 0;
    S.vfx.length = 0; S.pops.length = 0; S.lights.length = 0;
    S.shakeT = 0; S.hitstop = 0; S.flash = 0; S.ambPlus = 0;
    S.tsGoal = 1; S.tsNow = 1; S.tsFadeDur = 0; S.slowLeft = 0;
  };
  F.count = () => plive;

})(window);
