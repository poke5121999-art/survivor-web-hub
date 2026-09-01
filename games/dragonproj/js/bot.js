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

  /* Giữ một nút kỹ năng đủ lâu rồi nhả — bot phải đi qua đúng pha nạp như người. */
  var holdingSkill = null;
  function holdSkill(i, ms) {
    if (holdingSkill) return;
    var btn = document.getElementById('hSkill' + i);
    if (!btn) return;
    holdingSkill = i;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    setTimeout(function () {
      btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      holdingSkill = null;
    }, ms);
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
      // #rBack vẫn nằm trong DOM sau khi bảng kết quả đã tắt (ui.js chỉ gỡ class 'on'),
      // nên phải kiểm bảng có ĐANG HIỆN hay không. Thiếu điều kiện này thì hết trận
      // đầu tiên là bot bấm mãi một nút vô hình và không bao giờ đi tiếp.
      var res = document.getElementById('resultScr');
      if (res && res.classList.contains('on')) {
        var rb = document.getElementById('rBack');
        if (rb) { rb.click(); return; }
      }
      var scr = document.querySelector('.screen.on');
      if (scr && scr.id === 'scr-home') { ui.show('quest'); return; }
      if (scr && scr.id === 'scr-quest') {
        // Ải đang mở gần nhất: hàng .stage không mang class 'lock'.
        var go = document.querySelector('#body-quest .stage:not(.lock)');
        if (go) go.click();
        return;
      }
      return;
    }
    if (b.paused) return;
    var p = b.player;
    if (p.down) {
      // Không còn đồng đội tới cứu: tự gượng dậy hết lượt, quá lâu thì tiêu gem.
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

    // 2. Nạp rồi xả kỹ năng khi có mục tiêu đáng dùng. Kỹ năng nạp lâu nên bot
    //    phải GIỮ nút chứ không bấm — mô phỏng đúng thao tác của người chơi.
    for (var i = 0; i < 2; i++) {
      var sk = b.skillDef(i);
      if (!sk || b.skillCdLeft(i) > 0) continue;
      var worth = (b.boss && (b.boss.down > 0 || b.boss.hp < b.boss.maxHp * 0.95)) ||
                  b.mobs.filter(function (m) { return m.hp > 0 && Math.hypot(m.x - p.x, m.y - p.y) < 260; }).length >= 2;
      if (!worth) continue;
      holdSkill(i, sk.charge + 120);
      return;
    }

    var e = nearestEnemy(b);
    if (!e) {
      // Sân trống một nhịp (quái đang chờ hồi sinh, hoặc trùm sắp ra): đi lang
      // thang chứ không đứng im, để bot không bao giờ chôn chân chờ thứ chưa tới.
      dragTo(Math.cos(tick * 0.7), Math.sin(tick * 0.7), 400);
      return;
    }

    var wp = weakPos(b);
    var tx = wp ? wp.x : e.x, ty = wp ? wp.y : e.y;
    var d = Math.hypot(tx - p.x, ty - p.y);
    /* Cự ly đứng bắn bám theo TẦM của cây. Súng săn tầm 149px thì phải xông vào
     * tận mặt; bắn tỉa tầm hơn nghìn thì đứng đâu cũng bắn tới, nên nó lùi ra.
     * Cung thì nhắm vào giữa DẢI CHÍ MẠNG chứ không phải tầm tối đa — đứng đúng
     * chỗ đó thì mỗi mũi đau gấp rưỡi, và đó là cái bot phải biết. */
    var W = b.W;
    var want;
    if (W.critDist) {
      var bands = W.critDist.bands;
      want = (bands[1] + bands[2]) / 2;          // giữa dải 1,5x
    } else {
      want = Math.min(W.range * 0.62, 300);
    }
    want = Math.max(want, (e.r || 14) + 30);
    var ang2 = Math.atan2(ty - p.y, tx - p.x);

    /* Chỉ TIẾN khi ngoài tầm, và chỉ LÙI khi thật sự bị dí sát. Ngưỡng lùi cũ
     * (want × 0,55) làm bot dao động: quái swarm tiến vào, bot lùi ra, và không
     * bao giờ bắn được phát nào — đo được 8 phát trong 20 giây. */
    var tooClose = Math.max((e.r || 14) + 34, want * 0.28);
    if (d > want + 40) { dragTo(Math.cos(ang2), Math.sin(ang2), 200); return; }
    if (d < tooClose) { dragTo(-Math.cos(ang2), -Math.sin(ang2), 120); return; }

    /* Đang trong đuôi một phát bắn: VẪN BẤM, và vẫn lách ngang.
     *
     * Bấm sớm trong lúc còn đuôi được ĐỆM LẠI (tryAttack đặt p.queued) rồi bắn
     * ngay khi hết đuôi — tức là bấm sớm không mất gì, và đó là cách giữ đúng
     * nhịp bắn tối đa của cây. Bản đầu tôi cho bot `return` ở đây và nó tụt
     * xuống 1,6 phát/giây trên một khẩu bắn được 5 phát/giây, vì đuôi 200ms dài
     * hơn nhịp quyết định 90-150ms nên phần lớn nhịp rơi đúng vào đó.
     * Chỉ những trạng thái THẬT SỰ khoá (né, kỹ năng, đổi người, dính đòn) mới
     * bỏ nhịp. */
    if (b.player.state === 'fire') {
      tap(270 + Math.cos(ang2) * 8, 640 + Math.sin(ang2) * 8);
      if (tick % 2 === 0) strafe(ang2, 90);
      return;
    }
    if (b.busy()) return;

    /* 3. GIỮ nút. Ba nghĩa khác nhau tuỳ cây, và bot phải đi qua đúng con đường
     *    ngón tay người chơi đi qua — nếu ngưỡng giữ/chạm sai thì bot hỏng ngay,
     *    chứ không phải "gọi hàm nội bộ nên vẫn xanh".
     *      cây auto -> giữ để rải một tràng
     *      cây nạp  -> giữ tới nấc 3 (nấc người chơi thật sự dùng)
     *      còn lại  -> ghì súng cho chắc tay khi có mục tiêu đáng
     */
    var ax = Math.cos(ang2) * 46, ay = Math.sin(ang2) * 46;
    var juicy = b.boss && (b.boss.down > 0 || wp);
    if (W.auto) {
      // Cây auto: CHẠM liên tục thay vì giữ. Một cú giữ 700ms chặn mất mấy nhịp
      // quyết định kế tiếp, nên bot rải đạn thưa hơn hẳn người thật đang ghì cò.
      // Chạm mỗi nhịp cho ra đúng nhịp bắn của cây, vì đuôi phát trước tự chặn.
      tap(270 + Math.cos(ang2) * 8, 640 + Math.sin(ang2) * 8);
      // ...nhưng phải LÁCH NGANG giữa các phát. Đứng chôn chân bắn là chết trong
      // một game né đạn, và một con bot đứng im cũng không kiểm được gì về việc
      // vừa đi vừa bắn có chạy đúng không.
      if (tick % 2 === 0) strafe(ang2, 120);
      return;
    } else if (W.charge) {
      hold(270, 640, W.chargeMs[2] + 140, ax, ay); return;
    } else if (juicy && Math.random() < 0.6) {
      hold(270, 640, 620, ax, ay); return;          // ghì đủ 550ms để được thưởng
    }

    // 4. Bấm liên tục.
    tap(270 + Math.cos(ang2) * 8, 640 + Math.sin(ang2) * 8);
    // giữ hướng bằng một cú kéo rất ngắn, và lách ngang cho khỏi chôn chân
    if (tick % 3 === 0) strafe(ang2, 90);
  }

  /* LÁCH NGANG quanh mục tiêu: đi vuông góc với hướng ngắm, đổi bên theo nhịp.
   * Đây là cách một người chơi thật giữ khoảng cách trong game bắn — không tiến
   * thẳng, không lùi thẳng, mà vòng quanh. Đổi bên để bot không trôi mãi về một
   * phía rồi dính vào mép sân. */
  function strafe(aim, ms) {
    var side = (Math.floor(tick / 6) % 2) ? 1 : -1;
    var a = aim + side * Math.PI / 2;
    dragTo(Math.cos(a), Math.sin(a), ms);
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
