/* ==========================================================================
 * BOT — chơi hộ, dùng để kiểm thử.
 *
 * Điểm quan trọng: bot KHÔNG gọi thẳng battle.doAttack() hay battle.tryDodge().
 * Nó bắn PointerEvent thật lên canvas, tức là nó đi qua đúng con đường mà ngón
 * tay người chơi đi qua — js/punicon.js. Nếu ngưỡng tap/flick/hold sai thì bot
 * hỏng ngay, và đó chính là thứ cần kiểm.
 *
 * Bật:  DPBot.on()      Tắt: DPBot.off()      Nhanh: DPBot.speed(3)
 * ========================================================================== */
(function () {
  'use strict';
  var G = window.DP;
  var ui = null, on = false, timer = null, seq = 1;
  var cv, gesture = null, tick = 0;

  function el() { return document.getElementById('view'); }

  function rectPos(x, y) {
    var r = cv.getBoundingClientRect();
    return { clientX: r.left + x * (r.width / 540), clientY: r.top + y * (r.height / 960) };
  }

  function pe(type, x, y, id) {
    var p = rectPos(x, y);
    var e = new PointerEvent(type, {
      pointerId: id, bubbles: true, cancelable: true, isPrimary: true,
      clientX: p.clientX, clientY: p.clientY, pointerType: 'touch'
    });
    (type === 'pointerdown' ? cv : window).dispatchEvent(e);
  }

  /* Ba cử chỉ được dựng đúng như ngón tay thật:
   *   tap   : down -> up trong < tapMs, không kéo
   *   flick : down -> vài bước move nhanh -> up
   *   hold  : down -> đứng yên -> (tuỳ chọn kéo để ngắm) -> up
   *   drag  : down -> move tới điểm -> giữ nguyên (di chuyển liên tục) */
  function tap(x, y) {
    var id = seq++;
    pe('pointerdown', x, y, id);
    setTimeout(function () { pe('pointerup', x, y, id); }, 60);
  }
  function flick(x, y, dx, dy) {
    var id = seq++;
    pe('pointerdown', x, y, id);
    var step = 0;
    var iv = setInterval(function () {
      step++;
      pe('pointermove', x + dx * 22 * step, y + dy * 22 * step, id);
      if (step >= 3) {
        clearInterval(iv);
        pe('pointerup', x + dx * 22 * step, y + dy * 22 * step, id);
      }
    }, 16);
  }
  function hold(x, y, ms, aimDx, aimDy) {
    var id = seq++;
    pe('pointerdown', x, y, id);
    if (aimDx !== undefined) {
      setTimeout(function () { pe('pointermove', x + aimDx, y + aimDy, id); }, ms * 0.75);
    }
    setTimeout(function () { pe('pointerup', x + (aimDx || 0), y + (aimDy || 0), id); }, ms);
  }
  function dragTo(dx, dy, ms) {
    // Kéo cần gạt về hướng (dx,dy) và giữ trong ms để nhân vật chạy.
    var cx = 270, cy = 640, id = seq++;
    pe('pointerdown', cx, cy, id);
    var n = Math.max(1, Math.round(ms / 40));
    var i = 0;
    var iv = setInterval(function () {
      i++;
      pe('pointermove', cx + dx * 55, cy + dy * 55, id);
      if (i >= n) { clearInterval(iv); pe('pointerup', cx + dx * 55, cy + dy * 55, id); }
    }, 40);
  }

  function nearestEnemy(b) {
    if (b.boss && b.boss.hp > 0) return b.boss;
    var best = null, bd = 1e9;
    b.mobs.forEach(function (m) {
      if (m.dead) return;
      var d = Math.hypot(m.x - b.player.x, m.y - b.player.y);
      if (d < bd) { bd = d; best = m; }
    });
    return best;
  }

  // Tìm điểm yếu đang lộ, nếu có — bot phải biết nhắm vào đó, đúng như người chơi.
  function weakPos(b) {
    var bs = b.boss; if (!bs || !(bs.wpOn || bs.down > 0)) return null;
    for (var i = 0; i < bs.parts.length; i++) {
      var pt = bs.parts[i];
      if (pt.weak && !pt.broken) {
        return { x: bs.x + Math.cos(pt.a + bs.facing) * pt.d, y: bs.y + Math.sin(pt.a + bs.facing) * pt.d };
      }
    }
    return null;
  }

  function inDanger(b) {
    var p = b.player;
    return b.telegraphs.some(function (t) {
      return t.hostile && t.t < t.windup && t.t > t.windup * 0.35 && b.inTelegraph(t, p.x, p.y, p.r + 22);
    });
  }

  function step() {
    if (!on) return;
    var b = ui.battle;
    if (!b || !b.running) {
      // Ngoài trận: tự bấm nút để đi tiếp vòng lặp.
      var rb = document.getElementById('rBack');
      if (rb) { rb.click(); return; }
      var scr = document.querySelector('.screen.on');
      if (scr && scr.id === 'scr-home') { ui.show('quest'); return; }
      if (scr && scr.id === 'scr-quest') {
        var go = document.querySelector('#body-quest [data-map]:not(.dis)');
        if (go) go.click();
        return;
      }
      return;
    }
    if (b.paused) return;
    var p = b.player;
    if (p.down) {
      // Chờ đồng đội cứu; nếu quá lâu thì tiêu gem.
      var gr = document.getElementById('hGemRevive');
      if (p.downT > 7000 && gr && ui.save.gem >= 5) gr.click();
      return;
    }
    tick++;

    // 1. Né vùng đỏ — ưu tiên tuyệt đối.
    if (inDanger(b) && p.dodgeCd <= 0) {
      var t0 = b.telegraphs.find(function (t) { return t.hostile && b.inTelegraph(t, p.x, p.y, p.r + 22); });
      var a = Math.atan2(p.y - t0.y, p.x - t0.x) + (Math.random() - 0.5) * 0.6;
      flick(270, 640, Math.cos(a), Math.sin(a));
      return;
    }

    // 2. Xả Magi khi boss gục hoặc đầy thanh.
    for (var i = 0; i < 2; i++) {
      var m = b.wp && b.wp.magi[i];
      if (!m) continue;
      var wantNow = (m.shape === 'heart' && p.hp < p.maxHp * 0.5) ||
                    (m.shape !== 'heart' && p.magi >= 100 && (!b.boss || b.boss.down > 0 || b.boss.hp < b.boss.maxHp * 0.9));
      if (p.magi >= m.cost && wantNow) { document.getElementById('hMagi' + i).click(); return; }
    }

    var e = nearestEnemy(b);
    if (!e) {
      // Không còn quái: đi tới cổng (field) hoặc đứng yên.
      if (b.mode === 'field' && b.portalOpen) {
        var ang = Math.atan2(b.portal.y - p.y, b.portal.x - p.x);
        dragTo(Math.cos(ang), Math.sin(ang), 400);
      } else if (b.mode === 'field') {
        dragTo(Math.cos(tick), Math.sin(tick), 400);
      }
      return;
    }

    var wp = weakPos(b);
    var tx = wp ? wp.x : e.x, ty = wp ? wp.y : e.y;
    var d = Math.hypot(tx - p.x, ty - p.y);
    var want = b.W.ranged ? 220 : (b.W.reach + (e.r || 14) - 10);
    var ang2 = Math.atan2(ty - p.y, tx - p.x);

    if (d > want + 26) { dragTo(Math.cos(ang2), Math.sin(ang2), 260); return; }
    if (d < want * 0.45 && !b.W.ranged) { dragTo(-Math.cos(ang2), -Math.sin(ang2), 140); return; }

    if (b.busy()) return;

    // 3. Dùng đặc thù khi đáng: boss đang gục, hoặc đang nhắm được điểm yếu.
    var special = b.boss && (b.boss.down > 0 || wp) && Math.random() < 0.5;
    if (special) {
      var W = b.W;
      // Quay mặt về mục tiêu bằng cách kéo trước rồi giữ.
      var ax = Math.cos(ang2) * 46, ay = Math.sin(ang2) * 46;
      if (W.special === 'cleave') hold(270, 640, 2000, ax, ay);
      else if (W.special === 'snipe') hold(270, 640, 1700, ax, ay);
      else if (W.special === 'lunge') hold(270, 640, 700, ax, ay);
      else if (W.special === 'ranbu') hold(270, 640, 700, ax, ay);
      else hold(270, 640, 900, ax, ay);   // guard: giữ rồi nhả để phản đòn
      return;
    }

    // 4. Combo: quay mặt rồi bấm liên tục.
    tap(270 + Math.cos(ang2) * 8, 640 + Math.sin(ang2) * 8);
    // giữ hướng bằng một cú kéo rất ngắn
    if (tick % 3 === 0) dragTo(Math.cos(ang2), Math.sin(ang2), 60);
  }

  var api = {
    attach: function (u) { ui = u; cv = el(); window.DPBot = api; },
    on: function (ms) {
      if (!ui) return 'chưa sẵn sàng';
      cv = el(); on = true;
      clearInterval(timer);
      timer = setInterval(step, ms || 190);
      return 'bot: BẬT';
    },
    off: function () { on = false; clearInterval(timer); return 'bot: TẮT'; },
    speed: function (k) { clearInterval(timer); timer = setInterval(step, Math.max(50, 190 / (k || 1))); return 'tốc độ ×' + k; },
    get running() { return on; },
    // tiện cho test tự động
    _tap: tap, _flick: flick, _hold: hold, _drag: dragTo
  };
  window.DPBot = api;
})();
