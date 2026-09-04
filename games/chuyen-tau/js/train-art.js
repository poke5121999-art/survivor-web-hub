/*
 * CHUYẾN TÀU CUỐI — vẽ đoàn tàu.
 *
 * Cả kho này có 710 file ảnh và KHÔNG MỘT TẤM NÀO là tàu hoả. Tra cả 3.363 thư mục
 * sprite HoloCure và 1.178 khung atlas của bản Stardew cũng không ra. Nên toàn bộ đoàn
 * tàu vẽ bằng mã, và vì nó là thứ chiếm giữa màn hình suốt cả ván nên nó phải đúng.
 *
 * ============================================================================
 * GÓC NHÌN: 3/4 TỪ TRÊN XUỐNG, KHÔNG PHẢI TỪ ĐỈNH ĐẦU
 * ============================================================================
 * Nhìn thẳng từ đỉnh đầu thì chỉ thấy nóc toa — không thấy bánh, không thấy thanh
 * truyền, và thứ duy nhất nói "cái này đang CHẠY" biến mất. Đoàn tàu thành một cái hộp
 * trượt trên cát.
 *
 * Nên vẽ 3/4: NÓC toa là sân chơi (người chơi đi lại trên đó), và bên dưới nóc là VÁCH
 * HÔNG với bộ bánh. Bộ hình nhân vật của kho vốn cũng vẽ 3/4 nên hai thứ khớp nhau.
 *
 * ============================================================================
 * THANH BIÊN KHÔNG QUAY. ĐÂY LÀ CHỖ AI CŨNG LÀM SAI.
 * ============================================================================
 * Bộ bánh nối của đầu máy hơi nước là cơ cấu bốn khâu HÌNH BÌNH HÀNH: hai tay quay dài
 * bằng nhau và song song. Vì thế thanh nối chuyển động TỊNH TIẾN CONG — mọi điểm trên
 * thanh vẽ một đường tròn giống hệt nhau, và bản thân thanh thì LUÔN NẰM NGANG.
 *
 * Giáo trình cơ học gọi đúng nó là "curvilinear translation", và lấy ví dụ chính là
 * "thanh nối các bánh của một đầu máy hơi nước".
 *
 *      ĐÚNG :  vẽ thanh nguyên vẹn, CHỈ DỊCH theo (R·cosθ, R·sinθ)
 *      SAI   :  ctx.rotate(θ) rồi vẽ thanh
 *
 * Thanh CHÍNH (main rod, nối piston với chốt khuỷu) thì NGƯỢC LẠI — nó có xoay, góc
 * nghiêng φ = asin(R·sinθ / L). Với L/R lớn thì φ chỉ vài độ, nhưng thiếu nó là thanh
 * trông cứng đơ như một que sắt hàn chết.
 *
 * ============================================================================
 * QUARTERING 90° — VÀ VÌ SAO CÓ BỐN TIẾNG "XÌNH" MỖI VÒNG BÁNH
 * ============================================================================
 * Hai bên tàu lệch nhau ĐÚNG 90°, không phải 180°. Lý do là cơ học: khi lực qua thanh
 * chính thẳng hàng với tâm trục thì nó không sinh mô-men nào cả ("điểm chết"). Lệch 90°
 * bảo đảm không bao giờ cả hai piston cùng ở điểm chết, nên tàu tự khởi động được.
 *
 * Hệ quả: hai xy-lanh × hai lần xả mỗi vòng = BỐN nhịp xả mỗi vòng bánh. Đó là tiếng
 * "xình-xịch-xình-xịch" ai cũng biết. Làm một hoặc hai nhịp một vòng thì bất kỳ ai từng
 * nghe một đầu máy hơi nước cũng thấy sai ngay lập tức.
 *
 * Nên: mỗi lần góc bánh đi qua một bội số của 90°, bắn MỘT cụm khói và MỘT tiếng xình.
 * Bánh xe, khói và âm thanh khoá vào cùng một nhịp vật lý duy nhất.
 *
 * ============================================================================
 * BÁNH QUAY NGƯỢC (WAGON-WHEEL)
 * ============================================================================
 * Hệ hiển thị rời rạc theo khung hình thì luôn có hiện tượng này: nếu một nan xê dịch
 * quá nửa khoảng cách tới nan kế tiếp trong một khung, mắt đọc ra là bánh quay LÙI.
 *
 *      Ngưỡng an toàn:   f_vòng/giây  <  fps / (2 × số_nan)
 *
 * Bánh 10 nan ở 60 fps → phải dưới 3 vòng/giây. Trên ngưỡng thì đổi sang một cái đĩa
 * mờ — NHƯNG GIỮ NGUYÊN THANH BIÊN CHẠY THẬT. Thanh biên tịnh tiến chứ không quay nên
 * nó KHÔNG BAO GIỜ bị hiện tượng này, và mắt vẫn đọc được tốc độ qua nó dù bánh đã
 * thành một vệt. Đây là mẹo đáng giá nhất của cả tệp.
 */
(function (root) {
  'use strict';

  const CT = root.CT;
  const T = CT.TRAIN_ART = {};

  const TAU = Math.PI * 2;

  // --- kích thước, một chỗ duy nhất -------------------------------------------
  const DECK_H   = 96;     // chiều cao mặt nóc — sân chơi của người chơi
  const SKIRT_H  = 30;     // vách hông thấy được bên dưới nóc
  const CAR_W    = 196;
  const LOCO_W   = 244;
  const GAP      = 10;     // khe giữa hai toa
  const WHEEL_R  = 12;
  const DRV_R    = 17;     // bánh chủ động của đầu máy, to hơn
  const SPOKES   = 10;
  T.DECK_H = DECK_H; T.SKIRT_H = SKIRT_H; T.CAR_W = CAR_W;
  T.LOCO_W = LOCO_W; T.GAP = GAP;

  // Ngưỡng chống quay ngược, tính sẵn cho 60 khung/giây.
  const SPIN_LIMIT = 60 / (2 * SPOKES);      // = 3 vòng/giây

  // --- bảng màu ---------------------------------------------------------------
  const C = {
    ironD:  '#1b1d22', iron: '#2c3138', ironL: '#434a54', ironH: '#5d6672',
    wood:   '#5a3f26', woodL: '#7d5a37', woodH: '#9a7145', woodD: '#3a2818',
    brass:  '#b8862f', brassL: '#e0b055',
    rust:   '#7a4526', red: '#7d2620', redL: '#a83a2c',
    rail:   '#4a4038', tie: '#3a2c1e',
    glass:  '#2a3c46', glassL: '#4f7a86'
  };

  // ===========================================================================
  // ĐƯỜNG RAY
  // ===========================================================================
  // Vẽ trực tiếp chứ không lát ảnh: hai vạch thép và một dãy tà vẹt là hai lệnh
  // fillRect trong một vòng lặp, rẻ hơn mọi tấm tile, và khớp màu nền chính xác.
  //
  // Tà vẹt là thứ tạo cảm giác tốc độ — mắt đọc nhịp của chúng chứ không đọc nền cát.
  // Nhưng đúng vì thế mà chúng cũng là một HOA VĂN SỌC ĐỘNG chạy ngang cả màn hình:
  // hướng dẫn về an toàn thị giác cấm hoa văn động hơn năm sọc tương phản cao phủ từ
  // một phần tư màn hình trở lên. Nên tà vẹt cố ý để tương phản THẤP với nền cát, và
  // hai vạch ray sáng hơn mới là thứ dẫn mắt.
  const TIE_GAP = 34;
  T.drawRails = function (c, scrollX, y, w, opt) {
    const o = opt || {};
    const half = 26;
    const x0 = -(((scrollX % TIE_GAP) + TIE_GAP) % TIE_GAP);
    c.save();
    // nền đá ba lát
    c.fillStyle = o.ballast || '#4a3c2c';
    c.fillRect(0, y - half - 9, w, half * 2 + 18);
    // tà vẹt
    c.fillStyle = C.tie;
    for (let x = x0; x < w + TIE_GAP; x += TIE_GAP)
      c.fillRect(Math.floor(x), y - half - 3, 11, half * 2 + 6);
    // hai vạch thép
    c.fillStyle = C.rail;
    c.fillRect(0, y - half, w, 5);
    c.fillRect(0, y + half - 5, w, 5);
    c.fillStyle = 'rgba(180,190,200,0.45)';
    c.fillRect(0, y - half, w, 1.5);
    c.fillRect(0, y + half - 5, w, 1.5);
    c.restore();
  };

  // ===========================================================================
  // BỘ BÁNH
  // ===========================================================================
  // theta = góc bánh (radian), lấy từ QUÃNG ĐƯỜNG chứ không từ đồng hồ:
  //     theta += dx / R
  // Nếu tăng theo thời gian thì tàu chạy chậm mà bánh vẫn quay nhanh, và mắt bắt được
  // ngay cả khi người chơi không nói ra được là sai chỗ nào.
  function drawWheel(c, x, y, r, theta, spin) {
    c.save();
    c.translate(x, y);
    // vành
    c.fillStyle = C.ironD;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = C.ironH; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r - 1, 0, TAU); c.stroke();

    if (spin < SPIN_LIMIT) {
      // còn đọc được từng nan: vẽ nan thật
      c.strokeStyle = C.ironL; c.lineWidth = 2;
      for (let i = 0; i < SPOKES; i++) {
        const a = theta + i * TAU / SPOKES;
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22);
        c.lineTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
        c.stroke();
      }
    } else {
      // trên ngưỡng: nan hoá vệt. Không cố vẽ nan nữa — vẽ là nói dối về chiều quay.
      const k = Math.min(1, (spin - SPIN_LIMIT) / SPIN_LIMIT);
      c.strokeStyle = C.ironL; c.lineWidth = 2;
      c.globalAlpha = 1 - k;
      for (let i = 0; i < SPOKES; i++) {
        const a = theta + i * TAU / SPOKES;
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22);
        c.lineTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
        c.stroke();
      }
      c.globalAlpha = k * 0.75;
      c.strokeStyle = C.ironL; c.lineWidth = r * 0.5;
      c.beginPath(); c.arc(0, 0, r * 0.6, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
    // moay-ơ
    c.fillStyle = C.iron;
    c.beginPath(); c.arc(0, 0, r * 0.24, 0, TAU); c.fill();
    c.restore();
  }

  // Bộ bánh chủ động + thanh biên của đầu máy.
  //   x0..x1 : tâm hai bánh chủ động
  //   theta  : góc bánh
  function drawDrivers(c, x0, x1, y, theta, spin) {
    const R = DRV_R * 0.52;                    // bán kính tay quay (crank throw)
    const cx = Math.cos(theta) * R;
    const cy = Math.sin(theta) * R;

    drawWheel(c, x0, y, DRV_R, theta, spin);
    drawWheel(c, x1, y, DRV_R, theta, spin);

    // --- THANH BIÊN: TỊNH TIẾN, KHÔNG XOAY ---
    // Cả thanh trôi theo đúng một vòng tròn bán kính R. Nó luôn nằm ngang.
    c.save();
    c.translate(cx, cy);
    c.fillStyle = C.ironH;
    c.fillRect(x0, y - 2.6, x1 - x0, 5.2);
    c.fillStyle = C.ironL;
    c.fillRect(x0, y - 2.6, x1 - x0, 1.6);
    // hai chốt khuỷu
    c.fillStyle = C.brass;
    c.beginPath(); c.arc(x0, y, 3.4, 0, TAU); c.fill();
    c.beginPath(); c.arc(x1, y, 3.4, 0, TAU); c.fill();
    c.restore();

    // --- THANH CHÍNH: CÓ XOAY ---
    // Nối chốt khuỷu của bánh trước với con trượt (crosshead) — con trượt chỉ đi NGANG
    // trên một thanh dẫn, không lên xuống. Góc nghiêng φ = asin(R·sinθ / L).
    const L = 74;
    const pinX = x1 + cx, pinY = y + cy;
    const crossX = x1 + L * 0.92 + Math.cos(theta) * R;   // con trượt trượt ngang
    const crossY = y;
    c.save();
    c.strokeStyle = C.ironH; c.lineWidth = 4.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(pinX, pinY); c.lineTo(crossX, crossY); c.stroke();
    c.strokeStyle = C.ironL; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(pinX, pinY); c.lineTo(crossX, crossY); c.stroke();
    c.restore();

    // con trượt + thanh dẫn
    c.fillStyle = C.iron;
    c.fillRect(x1 + L * 0.6, y - 6, 46, 3);
    c.fillStyle = C.ironH;
    c.fillRect(crossX - 6, y - 5.5, 12, 11);
  }

  // ===========================================================================
  // ĐẦU MÁY
  // ===========================================================================
  // o = { dist, hp, hpMax, hurt, fireGlow (0..1), night }
  // Trả về mảng các mốc "xình" đã đi qua trong khung này, để bên gọi bắn khói và tiếng.
  T.drawLoco = function (c, x, y, o) {
    o = o || {};
    const dist = o.dist || 0;
    const theta = dist / DRV_R;
    const spin = Math.abs(o.spd || 0) / (TAU * DRV_R);   // vòng/giây
    const top = y - DECK_H;
    const w = LOCO_W;

    c.save();
    c.imageSmoothingEnabled = false;

    // --- bóng đổ dưới gầm ---
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.fillRect(x + 6, y + SKIRT_H - 6, w - 12, 9);

    // --- vách hông + bánh (vẽ TRƯỚC nóc để nóc đè lên) ---
    c.fillStyle = C.ironD;
    c.fillRect(x, y - 4, w, SKIRT_H + 4);
    c.fillStyle = C.iron;
    c.fillRect(x, y - 4, w, 6);

    const wy = y + SKIRT_H - WHEEL_R - 2;
    // hai bánh dẫn hướng phía trước (nhỏ)
    drawWheel(c, x + w - 34, wy, WHEEL_R * 0.72, theta * (DRV_R / (WHEEL_R * 0.72)), spin);
    drawWheel(c, x + w - 62, wy, WHEEL_R * 0.72, theta * (DRV_R / (WHEEL_R * 0.72)), spin);
    // hai bánh chủ động + bộ thanh truyền
    drawDrivers(c, x + 52, x + 122, y + SKIRT_H - DRV_R - 1, theta, spin);

    // --- nóc / thân ---
    // sàn gỗ, là chỗ người chơi đứng
    c.fillStyle = C.woodD;  c.fillRect(x, top, w, DECK_H);
    c.fillStyle = C.wood;   c.fillRect(x + 2, top + 2, w - 4, DECK_H - 4);
    c.fillStyle = C.woodL;
    for (let i = 0; i < 7; i++) c.fillRect(x + 3, top + 6 + i * 13, w - 6, 1.5);

    // nồi hơi: một trụ tròn nằm dọc theo thân, chiếm nửa trước
    const bx = x + 96, bw = w - 96 - 14;
    c.fillStyle = C.ironD;  c.fillRect(bx, top + 10, bw, DECK_H - 22);
    c.fillStyle = C.iron;   c.fillRect(bx + 2, top + 12, bw - 4, DECK_H - 26);
    c.fillStyle = C.ironL;  c.fillRect(bx + 2, top + 14, bw - 4, 7);
    // đai nồi hơi
    c.fillStyle = C.brass;
    for (let i = 0; i < 3; i++) c.fillRect(bx + 16 + i * 34, top + 10, 4, DECK_H - 22);

    // cabin ở đuôi đầu máy
    c.fillStyle = C.woodD;  c.fillRect(x + 4, top + 4, 86, DECK_H - 8);
    c.fillStyle = C.rust;   c.fillRect(x + 7, top + 7, 80, DECK_H - 14);
    c.fillStyle = C.glass;  c.fillRect(x + 16, top + 16, 26, 26);
    c.fillStyle = C.glassL; c.fillRect(x + 17, top + 17, 24, 10);
    // mái cabin
    c.fillStyle = C.ironD;  c.fillRect(x + 2, top + 2, 90, 8);

    // ống khói + chuông + đèn pha
    const sx = x + w - 40;
    c.fillStyle = C.ironD;  c.fillRect(sx, top + 22, 20, 30);
    c.fillStyle = C.iron;   c.fillRect(sx + 2, top + 20, 16, 8);
    c.fillStyle = C.brass;  c.beginPath(); c.arc(x + w - 62, top + 30, 6, 0, TAU); c.fill();

    // đèn pha: hình tròn sáng ở mũi. Ban đêm nó là nguồn sáng mạnh nhất của cả ván.
    c.fillStyle = C.brassL;
    c.beginPath(); c.arc(x + w - 12, top + DECK_H * 0.5, 9, 0, TAU); c.fill();
    if (o.night) {
      c.fillStyle = 'rgba(255,233,184,0.9)';
      c.beginPath(); c.arc(x + w - 12, top + DECK_H * 0.5, 5.5, 0, TAU); c.fill();
    }

    // --- cửa lò, và ánh lửa hắt ra ---
    // Nhấp nháy hai thành phần: 9,9 Hz biên rất nhỏ (đúng tần số một ngọn lửa thật, mà
    // dưới ngưỡng nên không bị tính là một cú chớp) cộng 2,4 Hz biên lớn hơn (nhịp bùng
    // than, và 2,4 vẫn dưới giới hạn ba lần mỗi giây).
    const g = o.fireGlow != null ? o.fireGlow : 0;
    if (g > 0.02) {
      const fx = x + 96, fy = top + DECK_H * 0.5;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const grd = c.createRadialGradient(fx, fy, 0, fx, fy, 40 * (0.7 + g * 0.5));
      grd.addColorStop(0, 'rgba(255,168,60,' + (0.8 * g).toFixed(3) + ')');
      grd.addColorStop(0.45, 'rgba(220,90,24,' + (0.34 * g).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(120,30,0,0)');
      c.fillStyle = grd;
      c.beginPath(); c.arc(fx, fy, 40 * (0.7 + g * 0.5), 0, TAU); c.fill();
      c.restore();
      c.fillStyle = 'rgba(255,150,50,' + (0.55 + g * 0.35).toFixed(3) + ')';
      c.fillRect(fx - 5, fy - 12, 9, 24);
    }

    // --- gạt bò ở mũi ---
    c.fillStyle = C.ironD;
    c.beginPath();
    c.moveTo(x + w, top + 12); c.lineTo(x + w + 22, top + DECK_H * 0.5);
    c.lineTo(x + w, top + DECK_H - 12); c.closePath(); c.fill();
    c.fillStyle = C.ironL;
    for (let i = 0; i < 4; i++) {
      c.fillRect(x + w, top + 18 + i * 16, 20 - i * 3, 3);
    }

    c.restore();
  };

  // Trả về số nhịp "xình" đã đi qua giữa hai quãng đường. Bốn nhịp mỗi vòng bánh.
  T.chuffsBetween = function (dPrev, dNow) {
    const q = TAU * DRV_R / 4;               // quãng đường ứng với một phần tư vòng
    return Math.floor(dNow / q) - Math.floor(dPrev / q);
  };
  T.DRV_R = DRV_R;

  // ===========================================================================
  // TOA
  // ===========================================================================
  // Mỗi loại toa vẽ khác nhau ở NÓC, vì nóc là thứ người chơi đứng lên và phải đọc
  // được ngay là toa gì. Vách hông thì giống nhau — nó chỉ để đỡ bánh.
  T.drawCar = function (c, x, y, car, o) {
    o = o || {};
    const dist = o.dist || 0;
    const spin = Math.abs(o.spd || 0) / (TAU * WHEEL_R);
    const theta = dist / WHEEL_R;
    const top = y - DECK_H;
    const w = CAR_W;
    const def = car ? car.def : CT.CAR_BY_ID['tran'];
    const hurt = o.hurt || 0;
    const broken = car && car.hp <= 0;

    c.save();
    c.imageSmoothingEnabled = false;

    c.fillStyle = 'rgba(0,0,0,0.34)';
    c.fillRect(x + 5, y + SKIRT_H - 6, w - 10, 8);

    // vách hông + hai cặp bánh
    c.fillStyle = C.ironD; c.fillRect(x, y - 4, w, SKIRT_H + 4);
    const wy = y + SKIRT_H - WHEEL_R - 2;
    drawWheel(c, x + 34, wy, WHEEL_R, theta, spin);
    drawWheel(c, x + 62, wy, WHEEL_R, theta, spin);
    drawWheel(c, x + w - 62, wy, WHEEL_R, theta, spin);
    drawWheel(c, x + w - 34, wy, WHEEL_R, theta, spin);

    // sàn gỗ
    c.fillStyle = broken ? '#2a2018' : C.woodD;
    c.fillRect(x, top, w, DECK_H);
    c.fillStyle = broken ? '#3a2c20' : C.wood;
    c.fillRect(x + 2, top + 2, w - 4, DECK_H - 4);
    c.fillStyle = broken ? '#4a382a' : C.woodL;
    for (let i = 0; i < 7; i++) c.fillRect(x + 3, top + 6 + i * 13, w - 6, 1.5);

    if (!broken) drawCarTop(c, x, top, w, def, car, o);
    else {
      // toa hỏng: ván gãy, khói âm ỉ. Người chơi vẫn đi qua được nhưng không còn công dụng.
      c.strokeStyle = '#1a1410'; c.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(x + 20 + i * 34, top + 8);
        c.lineTo(x + 34 + i * 34, top + DECK_H - 8);
        c.stroke();
      }
    }

    // nhấp đỏ khi toa vừa ăn đòn
    if (hurt > 0) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(200,50,40,' + (hurt * 0.5).toFixed(3) + ')';
      c.fillRect(x, top, w, DECK_H);
      c.globalCompositeOperation = 'source-over';
    }

    c.restore();
  };

  function drawCarTop(c, x, top, w, def, car, o) {
    const midY = top + DECK_H * 0.5;
    switch (def.id) {
      case 'giap':
        // vách thép hai mép — quái phải leo qua nóc mới vào được
        c.fillStyle = C.iron;  c.fillRect(x + 2, top + 2, w - 4, 15);
        c.fillStyle = C.iron;  c.fillRect(x + 2, top + DECK_H - 17, w - 4, 15);
        c.fillStyle = C.ironH; c.fillRect(x + 2, top + 2, w - 4, 3);
        c.fillStyle = C.ironH; c.fillRect(x + 2, top + DECK_H - 17, w - 4, 3);
        c.fillStyle = C.ironL;
        for (let i = 0; i < 8; i++) {
          c.fillRect(x + 12 + i * 23, top + 5, 3, 9);
          c.fillRect(x + 12 + i * 23, top + DECK_H - 14, 3, 9);
        }
        break;
      case 'phao': {
        // bệ súng ở giữa, nòng xoay theo mục tiêu
        c.fillStyle = C.ironD;
        c.beginPath(); c.arc(x + w / 2, midY, 25, 0, TAU); c.fill();
        c.fillStyle = C.iron;
        c.beginPath(); c.arc(x + w / 2, midY, 20, 0, TAU); c.fill();
        const a = o.turretAng || 0;
        c.save();
        c.translate(x + w / 2, midY); c.rotate(a);
        c.fillStyle = C.ironH; c.fillRect(0, -4, 44, 8);
        c.fillStyle = C.ironL; c.fillRect(0, -4, 44, 2.5);
        c.fillStyle = C.brass; c.fillRect(38, -5, 6, 10);
        c.restore();
        c.fillStyle = C.brass;
        c.beginPath(); c.arc(x + w / 2, midY, 6, 0, TAU); c.fill();
        // hộp đạn
        c.fillStyle = C.woodH; c.fillRect(x + 20, top + 12, 26, 20);
        break;
      }
      case 'kho':
        // giá đỡ và thùng — nhìn là biết chỗ chất đồ
        c.fillStyle = C.woodH;
        for (let i = 0; i < 4; i++) {
          c.fillRect(x + 18 + i * 42, top + 10, 30, 26);
          c.fillRect(x + 18 + i * 42, top + DECK_H - 36, 30, 26);
        }
        c.fillStyle = C.woodD;
        for (let i = 0; i < 4; i++) {
          c.strokeStyle = C.woodD; c.lineWidth = 2;
          c.strokeRect(x + 18 + i * 42, top + 10, 30, 26);
          c.strokeRect(x + 18 + i * 42, top + DECK_H - 36, 30, 26);
        }
        break;
      case 'y':
        // vải trắng, chữ thập đỏ, băng ca
        c.fillStyle = '#d8d2c4'; c.fillRect(x + 16, top + 14, w - 32, DECK_H - 28);
        c.fillStyle = '#b3271f';
        c.fillRect(x + w / 2 - 5, midY - 20, 10, 40);
        c.fillRect(x + w / 2 - 20, midY - 5, 40, 10);
        c.fillStyle = '#9c9484';
        c.fillRect(x + 22, top + 20, 28, DECK_H - 40);
        break;
      case 'lo': {
        // lò phụ: cửa lò đỏ rực, đống than bên cạnh
        c.fillStyle = C.ironD; c.fillRect(x + w / 2 - 30, top + 12, 60, DECK_H - 24);
        c.fillStyle = C.iron;  c.fillRect(x + w / 2 - 26, top + 16, 52, DECK_H - 32);
        const g2 = o.fireGlow != null ? o.fireGlow : 0.6;
        c.fillStyle = 'rgba(255,140,40,' + (0.5 + g2 * 0.4).toFixed(3) + ')';
        c.fillRect(x + w / 2 - 12, midY - 14, 24, 28);
        c.fillStyle = '#15161a';
        for (let i = 0; i < 6; i++)
          c.fillRect(x + 20 + (i % 3) * 13, top + 18 + ((i / 3) | 0) * 14, 10, 9);
        break;
      }
      default:
        // toa trần: chỉ có mấy cọc chắn ở mép, nhìn thấu cả hai bên
        c.fillStyle = C.woodH;
        for (let i = 0; i < 9; i++) {
          c.fillRect(x + 10 + i * 21, top + 3, 5, 11);
          c.fillRect(x + 10 + i * 21, top + DECK_H - 14, 5, 11);
        }
    }
    // biểu tượng loại toa, mờ, ở góc — để người chơi đọc được toa nào là toa nào lúc
    // cả đoàn tàu chỉ chiếm một phần màn hình
    if (car) {
      c.globalAlpha = 0.5;
      c.font = '17px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText(def.icon || '', x + 6, top + DECK_H - 24);
      c.globalAlpha = 1;
    }
  }

  // Thanh máu của một toa — chỉ hiện khi toa đã ăn đòn.
  T.drawCarHp = function (c, x, y, w, hp, hpMax) {
    if (hp >= hpMax) return;
    const bw = w - 40, bx = x + 20, by = y - CT.TRAIN_ART.DECK_H - 9;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(bx - 1, by - 1, bw + 2, 6);
    const k = Math.max(0, hp / hpMax);
    c.fillStyle = k > 0.5 ? '#5fa845' : k > 0.22 ? '#c9a13a' : '#b33a2c';
    c.fillRect(bx, by, bw * k, 4);
  };

})(window);
