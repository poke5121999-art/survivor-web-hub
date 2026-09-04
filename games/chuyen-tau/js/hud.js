/*
 * CHUYẾN TÀU CUỐI — HUD trên canvas và điều khiển cảm ứng.
 *
 * Mười hai luật dưới đây KHÔNG phải ý thích. Mỗi luật là một bản vá cho một lỗi thật đã
 * xảy ra ở bản repo2d, phần lớn kèm số đo. Chép sang nguyên vẹn thì rẻ; phát minh lại
 * thì phải trả giá lần nữa.
 *
 *  1. GUARD pointerType phải là ALLOW-LIST DƯƠNG: `if (touchSeen || e.pointerType !== 'mouse') return;`
 *     TUYỆT ĐỐI KHÔNG viết deny-list `if (e.pointerType === 'touch') return`. Màn cảm ứng
 *     bắn ra các sự kiện chuột TƯƠNG THÍCH sau mỗi cú chạm, và chúng là MouseEvent thuần
 *     với `pointerType === undefined` — deny-list cho lọt hết. Đo được: 65 độ xoay
 *     không ai yêu cầu, mỗi lần một ngón cái rời màn hình.
 *
 *  2. `touchSeen` MỘT CHIỀU, không bao giờ trở lại false.
 *
 *  3. CẦN TRÁI gốc CỐ ĐỊNH, đọc CẢ ĐỘ LỚN. Cần nổi sửa được việc lái nhưng nó sửa bằng
 *     cách đặt vòng vào chỗ ngón tay rơi, che mất HUD. Một vòng cố định và NHÌN THẤY
 *     ĐƯỢC thì không có cả hai vấn đề.
 *
 *  4. CẦN PHẢI NỔI, chỉ đọc GÓC, và có gốc trượt theo. Nếu gốc ghim vào tâm vòng vẽ thì
 *     đặt ngón nghỉ ở mép dưới = "đẩy xuống" = nhân vật quay mặt xuống sàn. Đặt ngón
 *     nghỉ không đáng gì cả; chỉ KÉO mới có nghĩa.
 *
 *  5. DEADZONE là TỈ LỆ bán kính, không phải pixel. Bốn pixel là một vùng chết thật trên
 *     máy tính bảng và không là gì trên điện thoại.
 *
 *  6. NÚT GẦN NHẤT THẮNG: `d = khoảng_cách / (r * mul)`, sắp xếp, nhận khi d < 1.
 *     Chuỗi `if…return` làm cú chạm luôn rơi vào nút được HỎI TRƯỚC. Đo thật ở bản cũ:
 *     nút kỹ năng cách nút Tủ đồ 9px trong khi tổng hai bán kính là 53px, và NGƯỜI CHƠI
 *     KHÔNG MỞ ĐƯỢC TỦ ĐỒ. Đổi thứ tự chỉ đẩy lỗi sang nút khác.
 *
 *  7. DẢI NGÓN CÁI: không thứ gì ngón cái BẤM được nằm ở chỗ ngón cái LÁI. Trên vạch chỉ
 *     có nút, dưới vạch chỉ có cần gạt, và một cú chạm trượt nút phía trên thì không làm gì.
 *
 *  8. HAI NÚT CÙNG HÀNG CÁCH NHAU ÍT NHẤT 3,0×r. Vùng bắt chạm là r×1,25 chứ không phải
 *     r, nên ở mức 2,65 hai nút cạnh nhau đã chồng vùng chạm 6px.
 *
 *  9. NẰM NGANG LÀ BỐ CỤC RIÊNG, không phải bố cục dọc thu nhỏ. Bố cục dọc lấy
 *     K = min(w,h)/540; nằm ngang thì min(w,h) là CHIỀU CAO, nên K tụt gần một nửa và
 *     mọi nút teo lại còn một nửa, dồn về cùng một cột.
 *
 * 10. MỌI NÚT LÚC CHẠY ĐỀU THUỘC TAY PHẢI. Muốn vừa chạy vừa bấm thì tay trái phải nhả
 *     cần — nhả cần là đứng lại, mà đứng lại giữa lúc bị đuổi là chết. GIỮA MÀN HÌNH
 *     KHÔNG CÓ GÌ.
 *
 * 11. ĐO KHUNG BẰNG offsetWidth, KHÔNG BAO GIỜ trộn với getBoundingClientRect(). Hai
 *     cách đo lệch nhau (một cái làm tròn, một cái trả 844,33) làm dòng "kích thước vừa
 *     đổi" đúng ở MỌI khung hình, resize() chạy 60 lần một giây, và resize() mở đầu bằng
 *     cancelGestures() — tức cần gạt trái bị xoá sáu mươi lần mỗi giây: ngón tay vẫn nằm
 *     trên màn hình mà nhân vật không nhúc nhích.
 *
 * 12. BỐN MỎ NEO DỌN DẸP: pointercancel dùng CHUNG handler với pointerup;
 *     lostpointercapture; contextmenu → preventDefault; blur + visibilitychange.
 *     Một cú pointerup lạc mất là hỏng vĩnh viễn cho tới lúc tải lại trang.
 */
(function (root) {
  'use strict';

  const CT = root.CT;
  const G = CT.GAME, FX = CT.FX, A = CT.ART;
  const H = CT.HUD = {};
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const DEAD = 0.14;          // tỉ lệ bán kính, không phải pixel
  let cv = null, ctx = null;
  let W = 960, Hh = 540, dpr = 1;
  let touchSeen = false, lastTouchAt = -1e9, lastTouchX = 0, lastTouchY = 0;
  const held = new Set();
  let stickL = null, stickR = null;
  let lay = null;

  // ---------------------------------------------------------------------------
  // BỐ CỤC — nằm ngang, mọi nút thuộc tay phải
  // ---------------------------------------------------------------------------
  function layout() {
    const w = W, h = Hh;
    const K = Math.min(w, h) / 400;          // neo theo CẠNH NGẮN
    const R = 30 * K;                        // bán kính nút chuẩn
    const ring = R * 1.9;                    // bán kính vòng cần gạt
    const pad = 20 * K;

    // dải ngón cái: dưới vạch này chỉ có cần gạt
    const thumbY = h - (pad + ring + 8 * K);

    const left  = { x: pad + ring, y: h - pad - ring, r: ring };
    const rightZone = { x: w - pad - ring, y: h - pad - ring, r: ring };

    // Cụm nút: một LƯỚI ba hàng ở nửa phải, bước đúng 3,5×R theo cả hai trục.
    //
    // WHY lưới chứ không phải vòng cung: cung nhìn đẹp hơn, nhưng với bảy nút thì hai
    // cung lồng nhau luôn có một cặp rơi xuống dưới 3,0×R ở đâu đó, và cặp đó đổi mỗi
    // lần chỉnh góc. Lưới thì khoảng cách là một hằng số đọc được từ chính công thức:
    // hàng xóm cạnh nhau đúng 3,5×R, hàng xóm chéo 4,95×R. Không có cặp nào cần đo lại.
    //
    // Hàng dưới cùng là hàng ngón cái nghỉ tới được dễ nhất, nên NÚT BẮN nằm ở đó, ở
    // ngoài cùng bên phải. Càng lên trên càng ít dùng.
    const S = R * 3.5;
    const cx = w - pad - R * 1.1;
    const y0 = thumbY - R * 1.3;              // hàng dưới
    const y1 = y0 - S, y2 = y1 - S;           // hàng giữa, hàng trên
    const b = (x, y, k) => ({ x, y, r: R * (k || 1) });

    const fire  = b(cx,             y0, 1.35);
    const dodge = b(cx - S,         y0);
    const skill = b(cx - S * 2,     y0);
    const act   = b(cx,             y1);
    const slots = [b(cx - S,     y1), b(cx - S * 2, y1), b(cx - S * 3, y1)];
    // Hai nút ít dùng nhất lên hàng trên cùng — vẫn thuộc tay phải, vẫn trên dải ngón
    // cái, chỉ là xa hơn. "Nhét hết vô tủ" là hành động TRONG ván nên nó phải ở đây chứ
    // không được đẩy sang mép trái cùng với nút tạm dừng.
    const stash = b(cx,             y2, 0.86);
    const bag   = b(cx - S,         y2, 0.86);
    // Tạm dừng là nút MENU, không phải nút trong ván — nó đóng băng thế giới ngay khi
    // bấm — nên nó được phép nằm ở góc trái trên, xa mọi ngón đang bận.
    const pause = { x: pad + R * 0.9, y: pad + R * 0.8, r: R * 0.78 };

    return { w, h, K, R, thumbY, left, rightZone, fire, dodge, skill, act, slots,
             bag, stash, pause, ring };
  }
  H.layout = () => lay;

  // ---------------------------------------------------------------------------
  // ĐO KHUNG
  // ---------------------------------------------------------------------------
  function fit() {
    if (!cv) return;
    const box = cv.parentNode;
    // offsetWidth/offsetHeight — số nguyên, và KHÔNG bao giờ trộn với
    // getBoundingClientRect() ở bất cứ đâu trong tệp này.
    const w = box.offsetWidth, h = box.offsetHeight;
    if (w === W && h === Hh && dpr === (window.devicePixelRatio || 1)) return;
    // So kích thước TRƯỚC, huỷ cử chỉ SAU. Thanh công cụ của Safari trượt lên xuống bắn
    // ra resize liên tục ngay trong lúc ngón tay đang kéo cần gạt.
    W = w; Hh = h;
    dpr = Math.min(2, window.devicePixelRatio || 1);   // kẹp trần 2
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(Hh * dpr);
    cv.style.width = W + 'px';
    cv.style.height = Hh + 'px';
    lay = layout();
    G.resize(W, Hh, dpr);
    cancelGestures();
  }
  H.fit = fit;

  // Hai hàm KHÁC NHAU, không phải một:
  //   cancelGestures — ngón tay. Dùng khi đổi kích thước.
  //   resetInput     — cả bàn tay. Dùng khi mất tiêu điểm hoặc có lỗi.
  function cancelGestures() {
    stickL = null; stickR = null;
    G.IN.mx = 0; G.IN.my = 0; G.IN.aiming = false; G.IN.fire = false;
  }
  function resetInput() {
    cancelGestures();
    held.clear();
    G.IN.dodge = false; G.IN.skill = false; G.IN.use = -1; G.IN.act = false;
  }
  H.resetInput = resetInput;

  // ---------------------------------------------------------------------------
  // BẮT CHẠM — NÚT GẦN NHẤT THẮNG
  // ---------------------------------------------------------------------------
  function pickButton(x, y) {
    const L = lay;
    const cands = [];
    const add = (b, mul, on, fn) => { if (on !== false) cands.push({ b, mul: mul || 1.25, fn }); };
    add(L.fire, 1.2, true, () => { G.IN.fire = true; return 'fire'; });
    add(L.dodge, 1.25, true, () => { G.IN.dodge = true; return 'tap'; });
    add(L.skill, 1.25, true, () => { G.IN.skill = true; return 'tap'; });
    add(L.act, 1.25, true, () => { G.IN.act = true; return 'tap'; });
    L.slots.forEach((s, i) => add(s, 1.6, true, () => { G.IN.use = i; return 'tap'; }));
    add(L.bag, 1.3, true, () => { if (H.onBag) H.onBag(); return 'tap'; });
    add(L.stash, 1.3, true, () => { if (H.onStash) H.onStash(); return 'tap'; });
    add(L.pause, 1.3, true, () => { if (H.onPause) H.onPause(); return 'tap'; });

    let best = null, bd = 1;
    for (const cd of cands) {
      const d = Math.hypot(x - cd.b.x, y - cd.b.y) / (cd.b.r * cd.mul);
      if (d < bd) { bd = d; best = cd; }
    }
    return best;
  }

  function onDown(e) {
    // Lớp 1 — chặn ở gốc: cú chạm nuốt luôn sự kiện chuột tương thích đi sau nó.
    if (e.pointerType === 'touch') {
      touchSeen = true; lastTouchAt = performance.now();
      lastTouchX = e.clientX; lastTouchY = e.clientY;
      if (e.cancelable) e.preventDefault();
    }
    // Lớp 2 — cửa sổ 900ms cho con chuột ma.
    else if (e.pointerType === 'mouse' && performance.now() - lastTouchAt < 900) return;
    // Chuột phải và chuột giữa NUỐT MẤT pointerup, mà pointerup là chỗ duy nhất trả lại
    // con trỏ. Một cú chuột phải là hỏng cả phiên.
    if (e.button === 2 || e.button === 1) { if (e.cancelable) e.preventDefault(); return; }

    // Claim VÔ ĐIỀU KIỆN, một chỗ duy nhất. Claim theo từng nhánh thì chính xác hơn, và
    // đúng là thứ mà nhánh tiếp theo sẽ quên làm.
    held.add(e.pointerId);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* trình duyệt cũ */ }

    const r = ptr(e);
    const b = pickButton(r.x, r.y);
    if (b) { b.fn(); if (b.b === lay.fire) firePtr = e.pointerId; return; }

    // Dưới dải ngón cái mới là cần gạt.
    if (r.y > lay.thumbY) {
      if (r.x < lay.w * 0.5) {
        // cần trái: GỐC CỐ ĐỊNH, đọc cả độ lớn
        stickL = { id: e.pointerId, ox: lay.left.x, oy: lay.left.y, x: r.x, y: r.y };
        readL(r.x, r.y);
      } else {
        // cần phải: NỔI, chỉ đọc góc, và ghi lại điểm ĐẶT XUỐNG để phân biệt chạm nhanh
        stickR = { id: e.pointerId, ox: r.x, oy: r.y, sx: r.x, sy: r.y,
                   x: r.x, y: r.y, t0: performance.now() };
      }
    }
  }
  let firePtr = -1;

  function onMove(e) {
    if (e.pointerType === 'mouse' && (touchSeen || performance.now() - lastTouchAt < 900)) return;
    if (!held.has(e.pointerId)) return;
    const r = ptr(e);
    if (stickL && stickL.id === e.pointerId) { stickL.x = r.x; stickL.y = r.y; readL(r.x, r.y); }
    if (stickR && stickR.id === e.pointerId) {
      stickR.x = r.x; stickR.y = r.y;
      const dx = r.x - stickR.ox, dy = r.y - stickR.oy;
      const d = Math.hypot(dx, dy);
      const maxD = lay.ring;
      if (d > maxD) {            // gốc trượt theo ngón — nếu không thì kéo quá vòng là kẹt
        stickR.ox += (dx / d) * (d - maxD);
        stickR.oy += (dy / d) * (d - maxD);
      }
      if (d / maxD > DEAD) {
        G.IN.aiming = true;
        G.IN.ax = r.x - stickR.ox; G.IN.ay = r.y - stickR.oy;
        G.IN.fire = true;
      }
    }
  }

  function onUp(e) {
    // pointercancel dùng CHUNG handler này. Đây là mỏ neo dọn dẹp số một.
    if (e.pointerType === 'touch') { lastTouchAt = performance.now(); lastTouchX = e.clientX; lastTouchY = e.clientY; }
    if (!held.delete(e.pointerId)) return;
    try { cv.releasePointerCapture(e.pointerId); } catch (err) { }
    if (stickL && stickL.id === e.pointerId) { stickL = null; G.IN.mx = 0; G.IN.my = 0; }
    if (stickR && stickR.id === e.pointerId) {
      const dx = stickR.x - stickR.sx, dy = stickR.y - stickR.sy;
      const drag = Math.hypot(dx, dy);
      const dt = performance.now() - stickR.t0;
      // Chạm nhanh ở nửa phải = một phát bắn tự ngắm. Nhưng nút bắn vẫn phải có: một
      // hành động mà cách duy nhất để gọi nó là "chạm rồi nhả trong 280ms mà đừng kéo
      // quá xa" thì không ai đọc ra được từ màn hình.
      if (drag < lay.ring * 0.35 && dt < 280) { G.IN.aiming = false; G.IN.fire = true; tapFire = 0.12; }
      stickR = null;
      G.IN.aiming = false;
      if (firePtr !== e.pointerId) G.IN.fire = false;
    }
    if (firePtr === e.pointerId) { firePtr = -1; G.IN.fire = !!stickR; }
  }
  let tapFire = 0;

  function readL(x, y) {
    const dx = x - stickL.ox, dy = y - stickL.oy;
    const d = Math.hypot(dx, dy);
    const maxD = lay.ring;
    const k = d / maxD;
    if (k < DEAD) { G.IN.mx = 0; G.IN.my = 0; return; }
    const s = Math.min(1, (k - DEAD) / (1 - DEAD));
    G.IN.mx = dx / d * s; G.IN.my = dy / d * s;
  }

  function ptr(e) {
    // Toạ độ đo bằng offsetWidth của khung, không qua getBoundingClientRect.
    const box = cv.parentNode;
    let x = e.clientX - box.offsetLeft + (window.scrollX || 0);
    let y = e.clientY - box.offsetTop + (window.scrollY || 0);
    // Trừ mọi mép trên của cha
    let n = box.offsetParent;
    while (n) { x -= n.offsetLeft; y -= n.offsetTop; n = n.offsetParent; }
    return { x, y };
  }

  // ---------------------------------------------------------------------------
  // BÀN PHÍM — để chơi trên máy tính
  // ---------------------------------------------------------------------------
  const keys = {};
  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k) >= 0)
      e.preventDefault();
    keys[k] = down;
    if (!down) return;
    if (k === ' ' || k === 'shift') G.IN.dodge = true;
    if (k === 'e') G.IN.skill = true;
    if (k === 'q' && G.swapGun) G.swapGun();      // đổi sang khẩu đeo lưng
    if (k === 'h' && H.onWiki) H.onWiki();        // sổ tay
    if (k === 'f') G.IN.act = true;
    if (k === 'r') G.reload();
    if (k === '1') G.IN.use = 0;
    if (k === '2') G.IN.use = 1;
    if (k === '3') G.IN.use = 2;
    if (k === 'i' && H.onBag) H.onBag();
    if (k === 'tab' && H.onStash) { e.preventDefault(); H.onStash(); }
    if (k === 'escape' && H.onPause) H.onPause();
  }
  function pollKeys() {
    if (touchSeen) return;
    let x = 0, y = 0;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    const m = Math.hypot(x, y);
    if (m > 0) { G.IN.mx = x / m; G.IN.my = y / m; }
    else if (!stickL) { G.IN.mx = 0; G.IN.my = 0; }
  }

  // Chuột trên máy tính: giữ để bắn, di để ngắm.
  function onMouseMove(e) {
    // LUẬT VÀNG: allow-list DƯƠNG. MouseEvent thuần có pointerType undefined.
    if (touchSeen || e.pointerType === 'touch') return;
    const r = ptr(e);
    const L = lay;
    G.IN.aiming = true;
    G.IN.ax = r.x - L.w * 0.5; G.IN.ay = r.y - L.h * 0.5;
  }

  // ---------------------------------------------------------------------------
  // GẮN
  // ---------------------------------------------------------------------------
  H.attach = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    cv.addEventListener('pointerdown', onDown, { passive: false });
    cv.addEventListener('pointermove', onMove, { passive: false });
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);          // mỏ neo 1
    cv.addEventListener('lostpointercapture', onUp);     // mỏ neo 2 — sự kiện DUY NHẤT báo mất capture
    cv.addEventListener('contextmenu', e => e.preventDefault());  // mỏ neo 3
    cv.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', resetInput);                  // mỏ neo 4
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup', e => onKey(e, false));
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => setTimeout(fit, 60));
    fit();
    return ctx;
  };

  H.poll = function (dt) {
    pollKeys();
    if (tapFire > 0) { tapFire -= dt; if (tapFire <= 0) G.IN.fire = false; }
    if (!touchSeen) G.IN.fire = !!(mouseDown || keys['j']);
  };
  let mouseDown = false;
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) mouseDown = true; });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') mouseDown = false; });

  // ---------------------------------------------------------------------------
  // VẼ HUD
  // ---------------------------------------------------------------------------
  H.draw = function (c) {
    const R = G.R();
    if (!R || !lay) return;
    const L = lay, K = L.K;
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // --- máu ---
    const hw = 190 * K, hx = 16 * K, hy = 16 * K, hh = 13 * K;
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(hx - 2, hy - 2, hw + 4, hh + 4);
    const hk = clamp(R.p.hp / R.p.hpMax, 0, 1);
    c.fillStyle = hk > 0.5 ? '#5fa845' : hk > 0.25 ? '#c9a13a' : '#b33a2c';
    c.fillRect(hx, hy, hw * hk, hh);
    c.fillStyle = '#e8e2d4';
    c.font = '700 ' + Math.round(11 * K) + 'px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(Math.max(0, Math.round(R.p.hp)) + ' / ' + R.p.hpMax, hx + 4, hy + hh / 2 + 1);

    // --- chặng, km, đồng hồ ngày đêm ---
    const iy = hy + hh + 10 * K;
    c.font = '600 ' + Math.round(12 * K) + 'px system-ui, sans-serif';
    c.fillStyle = '#cfc6b4';
    c.fillText('Chặng ' + R.leg + '/' + R.legs + '   ' + (R.dist / 1000).toFixed(2) + ' km', hx, iy);
    // ngày/đêm: một vòng tròn nhỏ, không phải một dòng chữ. Người chơi liếc chứ không đọc.
    const dx = hx + 4 * K, dy = iy + 20 * K, dr = 9 * K;
    c.beginPath(); c.arc(dx, dy, dr, 0, TAU);
    c.fillStyle = R.isNight ? '#26304a' : '#e8c86a'; c.fill();
    if (R.isNight) {
      c.fillStyle = R.night.tint;
      c.beginPath(); c.arc(dx + dr * 0.35, dy - dr * 0.2, dr * 0.72, 0, TAU); c.fill();
    }
    c.fillStyle = '#9aa0a8';
    c.font = '600 ' + Math.round(10 * K) + 'px system-ui, sans-serif';
    c.fillText(R.isNight ? R.night.name : 'Ban ngày', dx + dr + 8 * K, dy);

    // TIỀN và THAN. Hai con số này quyết định mọi thứ ở ga. Chúng ở cột TRÁI vì cột phải
    // nằm ngay dưới hàng nút 🎒/🗄️ — chữ đè lên nút là chữ không ai đọc.
    const my = dy + dr + 14 * K;
    c.font = '700 ' + Math.round(13 * K) + 'px system-ui, sans-serif';
    c.fillStyle = '#ffd06a';
    c.fillText('$ ' + CT.money(R.cash), hx, my);
    c.fillStyle = R.coal > 0 ? '#d8963a' : '#8a5a3a';
    c.fillText('🪨 ' + R.coal + ' than', hx, my + 17 * K);

    // --- đồng hồ ga ---
    if (R.phase === 'ga') {
      const t = Math.max(0, R.timer);
      const big = t <= 10;
      c.textAlign = 'center';
      c.font = '800 ' + Math.round((big ? 34 : 24) * K) + 'px system-ui, sans-serif';
      // Trục màu LAM ↔ CAM: mù màu đỏ-lục dính khoảng bảy phần trăm nam giới, còn
      // lam-vàng thì gần như không ai. Cam ở đây không chỉ là "sắp hết giờ" — nó còn
      // to hơn và nhấp nháy, tức có ba tín hiệu chứ không phải một.
      c.fillStyle = big ? '#ff9a3c' : '#8fc6f0';
      const pulse = big ? 1 + Math.sin(R.t * 9) * 0.06 : 1;
      c.save();
      c.translate(L.w * 0.5, 34 * K); c.scale(pulse, pulse);
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.7)';
      c.strokeText(t.toFixed(t < 10 ? 1 : 0), 0, 0);
      c.fillText(t.toFixed(t < 10 ? 1 : 0), 0, 0);
      c.restore();
      c.font = '600 ' + Math.round(10 * K) + 'px system-ui, sans-serif';
      c.fillStyle = '#9aa0a8';
      c.fillText('TÀU CHẠY', L.w * 0.5, 56 * K);
    }

    // --- bao tải + đạn, góc trên phải ---
    c.textAlign = 'right';
    c.font = '600 ' + Math.round(12 * K) + 'px system-ui, sans-serif';
    const bx = L.w - 16 * K;
    c.fillStyle = '#cfc6b4';
    // Cột phải phải dừng lại TRƯỚC mép trái của nút 🎒. Nút 🎒 nằm ở cx − 3,5R với
    // cx = w − pad − 1,1R, nên mép trái của nó là w − pad − 5,6R. Lấy 5,9R cho có khe.
    const rx = bx - L.R * 5.9;
    c.fillText('🎒 ' + G.bagUsed() + '/' + (R.bagMax + (R.spec.bagPlus || 0)), rx, 20 * K);
    if (R.gun) {
      c.fillStyle = R.reloadT > 0 ? '#c9a13a' : '#cfc6b4';
      const am = R.ammo[R.gun.ammo] | 0;
      c.fillText(R.gun.name + '  ' + (R.reloadT > 0 ? 'nạp…' : R.gunMag + ' / ' + am), rx, 38 * K);
      // Khẩu đeo lưng in mờ ngay dưới. Không có nút đổi súng trên màn hình — đổi trong
      // bao tải hoặc phím Q — nên dòng này là chỗ DUY NHẤT nhắc rằng còn khẩu thứ hai.
      if (R.gunAlt) {
        c.fillStyle = '#7a7266';
        c.font = '600 ' + Math.round(10 * K) + 'px system-ui, sans-serif';
        c.fillText('sau lưng: ' + R.gunAlt.name, rx, 52 * K);
        c.font = '600 ' + Math.round(12 * K) + 'px system-ui, sans-serif';
      }
    } else {
      c.fillStyle = '#7a7266';
      c.fillText('tay không', rx, 38 * K);
    }


    // --- GA SẮP TỚI ---
    // Người chơi không có nút dừng tàu, nên thứ duy nhất họ cần biết là "còn mấy giây
    // nữa thì được nhảy xuống". Biển nằm ở mép PHẢI vì đó là hướng tàu đang đi.
    const arr = G.arriveIn ? G.arriveIn() : null;
    if (arr != null) {
      const sec = Math.max(0, arr);
      const soon = sec <= 3;
      // Nép ở mép PHẢI thì đè lên hàng ô tay — cả rìa phải màn hình đã là nút. Dời sang
      // CỘT TRÁI, ngay dưới dòng than: cùng một họ thông tin với "Chặng 1/3 · 0,17 km",
      // và cột trái là chỗ duy nhất còn trống thật.
      const bw = 104 * K, bh = 32 * K;
      const bx0 = hx - 4 * K, by0 = dy + dr + 41 * K;
      c.save();
      c.globalAlpha = Math.min(1, (CT.LEG.seeAheadSec - sec) * 1.6);
      c.fillStyle = 'rgba(14,12,10,0.82)';
      c.fillRect(bx0, by0, bw, bh);
      // Vạch màu bên trái là thanh tiến trình: nó ĐẦY DẦN lên khi tàu tới gần, nên đọc
      // được bằng đuôi mắt mà không cần đọc số.
      c.textAlign = 'left';
      c.font = '700 ' + Math.round(12 * K) + 'px system-ui, sans-serif';
      c.fillStyle = soon ? '#ff9a3c' : '#cfc6b4';
      c.fillText('GA ' + R.leg + ' — đỗ sau ' + sec.toFixed(1) + 's', bx0 + 7 * K, by0 + 14 * K);
      // Thanh ĐẦY DẦN khi tàu tới gần, đọc được bằng đuôi mắt mà không cần đọc số.
      const k = 1 - sec / CT.LEG.seeAheadSec;
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.fillRect(bx0 + 7 * K, by0 + 21 * K, bw - 14 * K, 4 * K);
      c.fillStyle = soon ? '#ff9a3c' : '#8fc6f0';
      c.fillRect(bx0 + 7 * K, by0 + 21 * K, (bw - 14 * K) * k, 4 * K);
      c.restore();
      c.textAlign = 'right';
    }

    // --- lời nhắn ---
    if (R.msgT > 0) {
      c.textAlign = 'center';
      c.globalAlpha = Math.min(1, R.msgT * 2);
      c.font = '700 ' + Math.round(15 * K) + 'px system-ui, sans-serif';
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.strokeText(R.msg, L.w * 0.5, L.h * 0.22);
      c.fillStyle = '#f0e6d2';
      c.fillText(R.msg, L.w * 0.5, L.h * 0.22);
      c.globalAlpha = 1;
    }

    // --- cần gạt ---
    drawStick(c, L.left, stickL, false);
    if (stickR) drawStick(c, { x: stickR.ox, y: stickR.oy, r: L.ring }, stickR, true);

    // --- nút ---
    btn(c, L.fire, '🔫', 'Bắn', '#c96a3a');
    btnCd(c, L.dodge, '💨', R.p.dodgeCh, CT.DODGE.charges, R.p.dodgeCd, CT.DODGE.cd, '#6aa8d8');
    btnCd(c, L.skill, R.sk.icon, R.p.skillCh, R.sk.charges || 1, R.p.skillCd, R.sk.cd, '#d8a83a');
    // Nút ⓐ nói ra việc nó sắp làm. Nhãn lấy từ đúng cái hàm quyết định hành động, nên
    // không có đường nào để chữ và việc lệch nhau.
    const hint = G.actHint ? G.actHint() : '';
    btn(c, L.act, hint ? '✋' : '·', '', hint ? '#7a9a5a' : '#3f4438', !hint);
    if (hint) {
      c.save();
      c.textAlign = 'center';
      c.font = '700 ' + Math.round(11 * K) + 'px system-ui, sans-serif';
      const tw = c.measureText(hint).width + 14 * K;
      // Kẹp trong khung: nút ⓐ nằm sát mép phải, mà nhãn thì dài tuỳ việc.
      const lx = Math.min(L.act.x, L.w - 6 * K - tw / 2);
      // Đặt vào KHE giữa hàng nút ⓐ và hàng bên trên. Các hàng cách nhau 3,5×R mà nút
      // chỉ rộng 1×R, nên khe đó rộng 1,5×R — thừa chỗ cho một dòng chữ 17px, và không
      // đè lên bất cứ nút nào.
      const ly = L.act.y - L.act.r - 12 * K;
      c.fillStyle = 'rgba(14,12,10,0.8)';
      c.fillRect(lx - tw / 2, ly - 9 * K, tw, 17 * K);
      c.fillStyle = '#cfe0b4';
      c.fillText(hint, lx, ly + 3 * K);
      c.restore();
      c.textAlign = 'right';
    }
    L.slots.forEach((s, i) => {
      const it = R.hand[i];
      const u = it && CT.USABLE_BY_ID[it.id];
      btn(c, s, u ? u.icon : '·', u ? String(it.n) : '', u ? '#8a7a5a' : '#3a3a3a', !u);
    });
    btn(c, L.bag, '🎒', '', '#5a6470');
    btn(c, L.stash, '🗄️', '', G.nearTrain() ? '#5a6470' : '#333');
    btn(c, L.pause, '⏸', '', '#4a4a4a');

    c.restore();
  };

  function drawStick(c, o, st, isRight) {
    c.save();
    c.globalAlpha = st ? 0.55 : 0.28;
    c.strokeStyle = isRight ? '#8fc6f0' : '#e8dcc0';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.stroke();
    if (st) {
      // Knob VỀ TÂM khi nhả tay. Hướng nhìn đóng băng thì thể hiện bằng một vạch trên
      // vành, không phải bằng knob lệch — knob lệch đọc ra là "cần bị kẹt".
      const dx = st.x - o.x, dy = st.y - o.y;
      const d = Math.min(o.r, Math.hypot(dx, dy)) || 0;
      const a = Math.atan2(dy, dx);
      c.globalAlpha = 0.8;
      c.fillStyle = isRight ? 'rgba(143,198,240,0.55)' : 'rgba(232,220,192,0.5)';
      c.beginPath(); c.arc(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, o.r * 0.36, 0, TAU); c.fill();
    }
    c.restore();
  }

  function btn(c, b, icon, sub, col, dim) {
    c.save();
    c.globalAlpha = dim ? 0.35 : 0.9;
    c.fillStyle = 'rgba(18,18,22,0.62)';
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
    c.strokeStyle = col; c.lineWidth = 2.5;
    c.beginPath(); c.arc(b.x, b.y, b.r - 1, 0, TAU); c.stroke();
    c.fillStyle = '#f0e6d2';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = Math.round(b.r * 0.92) + 'px system-ui, sans-serif';
    c.fillText(icon, b.x, b.y + 1);
    if (sub) {
      c.font = '700 ' + Math.round(b.r * 0.38) + 'px system-ui, sans-serif';
      c.fillStyle = '#cfc6b4';
      c.fillText(sub, b.x, b.y + b.r * 0.72);
    }
    c.restore();
  }

  // Nút có hồi chiêu: vẽ một quạt tối phủ dần, cộng số lượt còn lại. Và khi hồi xong thì
  // loé một vòng — chi tiết nhỏ mà người chơi nhìn nó cả trăm lần mỗi ván.
  const ready = {};
  function btnCd(c, b, icon, ch, chMax, cd, cdMax, col) {
    btn(c, b, icon, chMax > 1 ? (ch + '/' + chMax) : '', ch > 0 ? col : '#444', ch <= 0);
    if (cd > 0 && cdMax > 0 && ch < chMax) {
      const k = clamp(cd / cdMax, 0, 1);
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.beginPath(); c.moveTo(b.x, b.y);
      c.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      c.closePath(); c.fill();
      c.restore();
      ready[icon] = 0;
    } else if (ch > 0) {
      ready[icon] = (ready[icon] || 0) + 1;
      if (ready[icon] < 22) {
        const k = 1 - ready[icon] / 22;
        c.save();
        c.globalAlpha = k * 0.85;
        c.strokeStyle = col; c.lineWidth = 3;
        c.beginPath(); c.arc(b.x, b.y, b.r * (1 + (1 - k) * 0.35), 0, TAU); c.stroke();
        c.restore();
      }
    }
  }

})(window);
