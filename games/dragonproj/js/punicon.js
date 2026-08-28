/* ==========================================================================
 * ぷにコン — PUNICON
 *
 * Hệ điều khiển một-ngón của COLOPL. Module này CHỈ dịch cử chỉ chạm thành sự
 * kiện; nó không biết gì về nhân vật, vũ khí hay sát thương. Tách riêng vì đây
 * chính là thứ định nghĩa "feel" của game gốc, và nó phải kiểm thử được độc lập.
 *
 * Bản đồ cử chỉ (4Gamer 2016-06-20 cho Dragon Project, và trang Class Mechanics
 * của wiki Shironeko Project — nơi Punicon ra đời — cho phần ngữ pháp đầy đủ):
 *     kéo   (swipe) -> di chuyển        onMove(dx, dy, mag)
 *     chạm  (tap)   -> đánh thường      onTap()
 *     bấm liên tục  -> nối combo        (onTap gọi liên tiếp, người dùng tự đếm)
 *     vẩy   (flick) -> né / lăn         onFlick(dx, dy)
 *     giữ   (hold)  -> đặc thù vũ khí   onHoldStart() / onHoldAim() / onHoldEnd()
 *     giữ rồi TRƯỢT VỀ HƯỚNG NÚT KỸ NĂNG -> xả kỹ năng   onSkillSlide(id)
 *
 * Cái cuối là câu lệnh chuẩn của Colopl cho kỹ năng, nguyên văn wiki Shironeko:
 * "Action Skill — Hold the screen and slide in the direction of the skill button."
 * Chú ý: là TRƯỢT VỀ HƯỚNG nút, không phải chạm tới nút. Ngón cái ở giữa màn hình
 * không với tới mép phải được — đó chính là lý do câu lệnh này tồn tại.
 *
 * Cần gạt ảo MỌC RA TẠI ĐIỂM CHẠM — không cố định ở góc màn hình. Đó là lý do
 * chơi được bằng một ngón cái ở giữa màn hình, và là lý do nhân vật không bị
 * ngón tay che.
 *
 * Vì sao HOLD lại đòi ngón "đứng yên" (holdMoveTol) chứ không chỉ đòi thời gian:
 * nếu chỉ đếm thời gian thì mọi lần đi bộ dài đều biến thành đòn đặc thù. Bản
 * gốc phân biệt được vì nó có ngữ cảnh mà bản web không có; ràng buộc "đứng yên"
 * là cách tái dựng gần nhất, và vẫn cho phép GIỮ RỒI KÉO ĐỂ NGẮM (cung/thương)
 * bởi vì việc ngắm chỉ bắt đầu SAU khi hold đã kích hoạt.
 * ========================================================================== */
(function (G) {
  'use strict';

  function Punicon(el, cfg, cb) {
    this.el = el;
    this.c = Object.assign({}, G.PUNI, cfg || {});
    this.cb = cb || {};
    this.active = false;
    this.enabled = true;

    this.ox = 0; this.oy = 0;      // gốc cần gạt (điểm chạm đầu tiên)
    this.px = 0; this.py = 0;      // vị trí ngón hiện tại
    this.t0 = 0;
    this.pointerId = null;
    this.maxDrag = 0;              // khoảng cách xa nhất so với gốc, để phân biệt tap
    this.holdBaseX = 0;            // gốc để đo "đứng yên" cho hold (trượt theo ngón)
    this.holdBaseY = 0;
    this.holdBaseT = 0;
    this.holding = false;          // đã kích hoạt đặc thù chưa
    this.hist = [];                // lịch sử điểm để tính vận tốc flick
    this.moveVec = { x: 0, y: 0, m: 0 };
    this.hotspots = [];            // nút kỹ năng: {id, x, y} toạ độ MÀN HÌNH của canvas
    this.slideHint = -1;           // hotspot đang được nhắm tới, để vẽ gợi ý

    var self = this;
    this._down = function (e) { self.onDown(e); };
    this._move = function (e) { self.onMove(e); };
    this._up = function (e) { self.onUp(e); };
    this._cancel = function (e) { self.onUp(e, true); };

    el.addEventListener('pointerdown', this._down, { passive: false });
    window.addEventListener('pointermove', this._move, { passive: false });
    window.addEventListener('pointerup', this._up, { passive: false });
    window.addEventListener('pointercancel', this._cancel, { passive: false });
  }

  Punicon.prototype.destroy = function () {
    this.el.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._cancel);
  };

  Punicon.prototype.local = function (e) {
    var r = this.el.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.el.width ? this.el.width / r.width : 1),
      y: (e.clientY - r.top) * (this.el.height ? this.el.height / r.height : 1)
    };
  };

  Punicon.prototype.onDown = function (e) {
    if (!this.enabled) return;
    if (this.active) return;                 // Punicon là MỘT ngón. Ngón thứ hai bị bỏ qua.
    if (e.target !== this.el) return;        // chạm vào nút HUD thì không tính
    e.preventDefault();
    var p = this.local(e);
    this.active = true;
    this.pointerId = e.pointerId;
    this.ox = this.px = p.x;
    this.oy = this.py = p.y;
    this.t0 = performance.now();
    this.maxDrag = 0;
    this.holding = false;
    this.holdBaseX = p.x; this.holdBaseY = p.y; this.holdBaseT = this.t0;
    this.hist = [{ x: p.x, y: p.y, t: this.t0 }];
    this.moveVec = { x: 0, y: 0, m: 0 };
    if (this.cb.onDown) this.cb.onDown(p.x, p.y);
  };

  Punicon.prototype.onMove = function (e) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    var p = this.local(e), now = performance.now();
    this.px = p.x; this.py = p.y;

    var dx = p.x - this.ox, dy = p.y - this.oy;
    var d = Math.hypot(dx, dy);
    if (d > this.maxDrag) this.maxDrag = d;

    this.hist.push({ x: p.x, y: p.y, t: now });
    while (this.hist.length > 2 && now - this.hist[0].t > this.c.flickWindowMs * 2) this.hist.shift();

    // Ngón di chuyển đủ xa so với mốc "đứng yên" => reset đồng hồ hold.
    if (!this.holding) {
      if (Math.hypot(p.x - this.holdBaseX, p.y - this.holdBaseY) > this.c.holdMoveTol) {
        this.holdBaseX = p.x; this.holdBaseY = p.y; this.holdBaseT = now;
      }
    }

    // Nếu ĐANG giữ đặc thù thì kéo ngón = NGẮM (cung, thương heat), không phải đi.
    if (this.holding) {
      this.slideHint = this.aimedHotspot(dx, dy, d);
      if (this.cb.onHoldAim) this.cb.onHoldAim(p.x - this.ox, p.y - this.oy, d, p.x, p.y);
      return;
    }

    // Ngoài vùng chết => di chuyển. Độ lớn là analog: kéo nhẹ đi bộ, kéo hết vòng chạy.
    if (d > this.c.dead) {
      var mag = Math.min(1, (d - this.c.dead) / (this.c.ringR - this.c.dead));
      this.moveVec = { x: dx / d, y: dy / d, m: mag };
    } else {
      this.moveVec = { x: 0, y: 0, m: 0 };
    }
  };

  /* Gọi mỗi frame từ vòng lặp game. Trả về vector di chuyển hiện tại, và là chỗ
   * phát hiện HOLD (vì hold là sự kiện của thời gian, không phải của input). */
  Punicon.prototype.tick = function (now) {
    if (!this.active) return this.moveVec;
    if (!this.holding && now - this.holdBaseT >= this.c.holdMs) {
      this.holding = true;
      this.moveVec = { x: 0, y: 0, m: 0 };   // giữ = đứng yên (đúng bản gốc: hở sườn)
      if (this.cb.onHoldStart) {
        this.cb.onHoldStart(this.px - this.ox, this.py - this.oy, this.px, this.py);
      }
    }
    if (this.holding && this.cb.onHoldTick) {
      this.cb.onHoldTick(now - this.holdBaseT, this.px - this.ox, this.py - this.oy);
    }
    return this.moveVec;
  };

  /* Ngón đang trượt VỀ HƯỚNG nút kỹ năng nào? Trả về chỉ số hotspot, hoặc -1.
   * Điều kiện: kéo đủ xa (ra khỏi vòng cần gạt) và lệch hướng dưới ~26°.
   * Không đòi ngón chạm tới nút — đó là điểm mấu chốt của câu lệnh này. */
  Punicon.prototype.aimedHotspot = function (dx, dy, d) {
    if (!this.hotspots.length) return -1;
    if (d < this.c.ringR * 0.85) return -1;
    var best = -1, bestErr = 0.46;   // ~26 độ
    for (var i = 0; i < this.hotspots.length; i++) {
      var h = this.hotspots[i];
      if (h.off) continue;
      var want = Math.atan2(h.y - this.oy, h.x - this.ox);
      var have = Math.atan2(dy, dx);
      var err = Math.abs(Math.atan2(Math.sin(have - want), Math.cos(have - want)));
      if (err < bestErr) { bestErr = err; best = i; }
    }
    return best;
  };

  Punicon.prototype.onUp = function (e, cancelled) {
    if (!this.active || (e && e.pointerId !== this.pointerId)) return;
    if (e) e.preventDefault();
    var now = performance.now();
    var held = now - this.t0;

    // Vận tốc nhả: đo trên cửa sổ ~90ms cuối, không phải trên cả quãng kéo — nếu
    // đo cả quãng thì một lần đi dài rồi dừng lại cũng ra "flick".
    var v = 0, vx = 0, vy = 0;
    for (var i = this.hist.length - 1; i >= 0; i--) {
      if (now - this.hist[i].t >= this.c.flickWindowMs) {
        var a = this.hist[i], dt = now - a.t;
        if (dt > 0) { vx = (this.py !== null ? this.px - a.x : 0) / dt; vy = (this.py - a.y) / dt; v = Math.hypot(vx, vy); }
        break;
      }
    }
    if (v === 0 && this.hist.length >= 2) {
      var a2 = this.hist[0], dt2 = now - a2.t;
      if (dt2 > 0) { vx = (this.px - a2.x) / dt2; vy = (this.py - a2.y) / dt2; v = Math.hypot(vx, vy); }
    }

    var wasHolding = this.holding;
    var hs = this.slideHint;
    this.active = false;
    this.pointerId = null;
    this.holding = false;
    this.slideHint = -1;
    this.moveVec = { x: 0, y: 0, m: 0 };

    if (cancelled) { if (this.cb.onCancel) this.cb.onCancel(wasHolding); return; }

    // GIỮ rồi TRƯỢT VỀ HƯỚNG nút kỹ năng, nhả ra -> xả kỹ năng đó.
    if (wasHolding && hs >= 0 && this.hotspots[hs]) {
      if (this.cb.onSkillSlide) { this.cb.onSkillSlide(this.hotspots[hs].id, hs); return; }
    }

    if (wasHolding) {
      // Nhả sau khi giữ => THI TRIỂN đặc thù (nhả guard, nhả cleave, bắn snipe...).
      if (this.cb.onHoldEnd) this.cb.onHoldEnd(this.px - this.ox, this.py - this.oy, now - this.holdBaseT);
      return;
    }
    if (v > this.c.flickV && Math.hypot(vx, vy) > 0) {
      // VẨY => né. Hướng né là hướng vẩy, không phải hướng kéo tổng.
      var m = Math.hypot(vx, vy);
      if (this.cb.onFlick) this.cb.onFlick(vx / m, vy / m, v);
      return;
    }
    if (held < this.c.tapMs && this.maxDrag < this.c.dead) {
      // CHẠM NHANH => đánh. Bấm liên tục thì hàm này gọi liên tiếp => combo.
      if (this.cb.onTap) this.cb.onTap(this.px, this.py);
      return;
    }
    if (this.cb.onRelease) this.cb.onRelease();
  };

  /* Vẽ chính cái cần gạt. Trong suốt, mọc tại điểm chạm, đúng như bản gốc. */
  Punicon.prototype.draw = function (ctx) {
    if (!this.active) return;
    var dx = this.px - this.ox, dy = this.py - this.oy;
    var d = Math.hypot(dx, dy), R = this.c.ringR;
    var kx = this.ox + (d > R ? dx / d * R : dx);
    var ky = this.oy + (d > R ? dy / d * R : dy);

    ctx.save();
    ctx.globalAlpha = 0.55;
    // vòng ngoài
    ctx.beginPath(); ctx.arc(this.ox, this.oy, R, 0, 6.2832);
    ctx.strokeStyle = this.holding ? '#ffd23f' : '#e8f2ff';
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = this.holding ? '#ffd23f' : '#e8f2ff'; ctx.fill();
    // vòng chết
    ctx.globalAlpha = 0.30;
    ctx.beginPath(); ctx.arc(this.ox, this.oy, this.c.dead, 0, 6.2832);
    ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 1; ctx.stroke();
    // Đang giữ thì vẽ tia chỉ về từng nút kỹ năng — nhắc rằng trượt về đó là xả Magi.
    if (this.holding && this.hotspots.length) {
      for (var i = 0; i < this.hotspots.length; i++) {
        var h = this.hotspots[i]; if (h.off) continue;
        var a = Math.atan2(h.y - this.oy, h.x - this.ox);
        var on = (this.slideHint === i);
        var len = on ? 96 : 46;
        ctx.globalAlpha = on ? 0.9 : 0.30;
        ctx.strokeStyle = on ? '#6fd4ff' : '#e8f2ff';
        ctx.lineWidth = on ? 6 : 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.ox + Math.cos(a) * (R + 10), this.oy + Math.sin(a) * (R + 10));
        ctx.lineTo(this.ox + Math.cos(a) * (R + len), this.oy + Math.sin(a) * (R + len));
        ctx.stroke();
        // đầu mũi tên, để rõ là "trượt về phía này"
        var tipX = this.ox + Math.cos(a) * (R + len), tipY = this.oy + Math.sin(a) * (R + len);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(a - 0.45) * 14, tipY - Math.sin(a - 0.45) * 14);
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(a + 0.45) * 14, tipY - Math.sin(a + 0.45) * 14);
        ctx.stroke();
      }
    }
    // núm
    ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.arc(kx, ky, this.c.knobR, 0, 6.2832);
    var g = ctx.createRadialGradient(kx - 6, ky - 8, 2, kx, ky, this.c.knobR);
    g.addColorStop(0, this.holding ? '#fff6c8' : '#ffffff');
    g.addColorStop(1, this.holding ? '#e8a72c' : '#8fb6d8');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  };

  G.Punicon = Punicon;
})(window.DP = window.DP || {});
