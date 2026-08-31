/* ==========================================================================
 * KỸ NĂNG VŨ KHÍ
 *
 * Thay cho hệ Magi cũ. Chỗ hệ cũ chết: bốn mươi viên đá dùng chung ba đoạn code,
 * nên "gọi thiên thạch" và "cột băng dựng lên" hiện lên màn hình y hệt nhau —
 * một vòng ellipse nở ra, khác mỗi màu tint. Đọc mô tả thì mỗi cái một kiểu, bấm
 * vào thì như nhau. Đó là định nghĩa của nhàm.
 *
 * Ở đây kỹ năng THUỘC VỀ VŨ KHÍ, hai cái một cây, và mỗi cái có TRÌNH PHÁT
 * RIÊNG (`kind`) — một hình dạng vùng khác nhau. Đổi vũ khí là đổi hẳn hai đòn.
 *
 * Cách bấm, vẫn một ngón, đúng ngữ pháp Punicon:
 *     giữ -> trượt về hướng nút -> GIỮ NGUYÊN Ở ĐÓ để nạp -> nhả để xả
 * Nhả sớm thì huỷ và hoàn phần lớn hồi chiêu — không phạt người đọc đúng tình huống.
 *
 * Lớp NGUYÊN TỐ (G.ELEM_FX) gắn thêm hai móc cho những kỹ năng khai báo chúng:
 *     trail — vệt để lại dọc đường đi
 *     burst — thứ bung ra tại điểm lưỡi chạm
 * Nhờ vậy Song Kiếm hệ Lôi chớp tới thì để lại đường điện gãy khúc và nhát chém
 * nảy điện sang hai con bên cạnh; cùng đòn đó cầm hệ Hoả thì để lại vệt lửa cháy.
 * Một bảng sáu dòng, mười kỹ năng hưởng.
 * ========================================================================== */
(function (G) {
  'use strict';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  G.installSkills = function (Battle) {

    /* ------------------------------------------------------------ TRA CỨU -- */

    Battle.prototype.skillList = function () {
      return (this.wp && this.wp.skills) || [];
    };
    Battle.prototype.skillDef = function (idx) {
      return this.skillList()[idx] || null;
    };
    Battle.prototype.skillCdLeft = function (idx) {
      return (this.player.skCd && this.player.skCd[idx]) || 0;
    };
    Battle.prototype.skillReady = function (idx) {
      return !!this.skillDef(idx) && this.skillCdLeft(idx) <= 0;
    };
    // Hồi chiêu thật sau khi trừ ability 'skillCd'.
    Battle.prototype.skillCdOf = function (sk) {
      return sk.cd * (1 - clamp(this.stats.skillCd || 0, 0, 0.6));
    };
    // Bảng nguyên tố của vũ khí đang cầm.
    Battle.prototype.elemFx = function () {
      return G.ELEM_FX[(this.wp && this.wp.el) || 'none'] || G.ELEM_FX.none;
    };

    /* --------------------------------------------------------- PHA NẠP ----- */

    /* Punicon gọi mỗi khung trong lúc ngón đang khoá hướng một nút kỹ năng.
     * Vào được thế nạp thì trả về true. */
    Battle.prototype.skillCharge = function (idx, ms) {
      var p = this.player, sk = this.skillDef(idx);
      if (!sk) return false;
      if (p.down || this.paused) return false;

      if (p.state !== 'skcharge') {
        // Chưa hồi chiêu xong thì báo một lần rồi thôi, không kêu mỗi khung.
        if (this.skillCdLeft(idx) > 0) {
          if (this.t - (p.skNagT || 0) > 700) {
            p.skNagT = this.t;
            this.toast(sk.n + ' còn ' + (this.skillCdLeft(idx) / 1000).toFixed(1) + 's', '#8fa3b5');
          }
          return false;
        }
        if (this.busy()) return false;
        this.holdCancel();
        p.state = 'skcharge'; p.skIdx = idx; p.skChargeT = 0;
        this.moveName = { n: sk.n, t: this.t };
        if (sk.chargeDR) p.chargeDR = sk.chargeDR;
      }
      p.skChargeT = ms;
      p.skReady = ms >= sk.charge;

      /* NGẮM cho mấy đòn cần điểm đến (nhảy bổ, mưa tên).
       *
       * Trong lúc nạp, ngón tay đang GHIM về phía nút kỹ năng — nó không thể vừa
       * giữ hướng đó vừa chỉ chỗ rơi. Đó không phải thiếu sót của bản dựng này mà
       * là hệ quả thẳng của ngữ pháp "trượt về nút rồi giữ". Nên việc ngắm phải
       * tự động: bám con gần nhất, kẹp trong tầm của đòn.
       *
       * Bỏ qua chuyện này là hai đòn rơi vào chỗ trống và không trúng gì — đúng
       * cái xảy ra lúc đo thử: Yến Phi Trảm và Vũ Tiễn cùng ra 0 sát thương. */
      if (sk.aimR) {
        var k = clamp(ms / sk.charge, 0, 1);
        var tg = this.nearestFoe(sk.aimR * 1.6);
        var aa = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.facing;
        var ad = tg ? Math.min(sk.aimR, Math.hypot(tg.x - p.x, tg.y - p.y)) : sk.aimR;
        if (tg) p.facing = aa;
        p.aimX = p.x + Math.cos(aa) * ad * k;
        p.aimY = p.y + Math.sin(aa) * ad * k;
      }
      // Đòn chớp: khoá mục tiêu ngay từ lúc nạp để người chơi thấy mình sắp đi đâu.
      if (sk.kind === 'blink') p.skTarget = this.nearestFoe(sk.range);
      // Chìm vào bóng — càng nạp càng mờ, và tới ngưỡng thì quái mất dấu.
      if (sk.fadeTo !== undefined) {
        p.fade = 1 - (1 - sk.fadeTo) * clamp(ms / sk.charge, 0, 1);
        if (sk.loseAggro && p.skReady) this.dropAggro();
      }
      return true;
    };

    /* Nhả tay. Nạp đủ thì xả, chưa đủ thì huỷ và hoàn phần lớn hồi chiêu. */
    Battle.prototype.skillRelease = function (idx, ms) {
      var p = this.player, sk = this.skillDef(idx);
      p.fade = 1; p.chargeDR = 0;
      if (!sk || p.state !== 'skcharge') { if (p.state === 'skcharge') p.state = 'idle'; return; }
      if (ms < sk.charge) {
        p.state = 'idle'; p.skIdx = -1;
        this.toast('Nạp chưa đủ', '#8fa3b5');
        this.player.skCd[idx] = this.skillCdOf(sk) * (1 - G.SKILL_RULES.cancelRefund);
        return;
      }
      this.fireSkill(idx, sk);
    };

    /* Vẩy né giữa chừng = huỷ. Cùng luật hoàn như nhả sớm. */
    Battle.prototype.skillCancel = function () {
      var p = this.player;
      if (p.state !== 'skcharge') return false;
      var sk = this.skillDef(p.skIdx);
      if (sk) this.player.skCd[p.skIdx] = this.skillCdOf(sk) * (1 - G.SKILL_RULES.cancelRefund);
      p.state = 'idle'; p.skIdx = -1; p.fade = 1; p.chargeDR = 0;
      return true;
    };

    /* ------------------------------------------------------------ XẢ ------- */

    Battle.prototype.fireSkill = function (idx, sk) {
      var p = this.player;
      p.skCd[idx] = this.skillCdOf(sk);
      p.usedSkill = true;
      p.fade = 1;
      this.s.stats.skillUse = (this.s.stats.skillUse || 0) + 1;
      this.toast(sk.n, this.elemFx().col);
      this.faceTarget();

      p.sk = { def: sk, idx: idx, phase: 0, t: 0, hits: 0, from: { x: p.x, y: p.y } };
      p.state = 'skill'; p.stateT = 0;
      var fn = this['sk_' + sk.kind];
      if (fn) fn.call(this, sk, p.sk);
      else { p.state = 'idle'; }   // kind chưa có trình phát: không treo game
    };

    /* --------------------------------------------------- TIỆN ÍCH DÙNG CHUNG */

    // Kẻ địch gần nhất còn sống trong tầm. Tên phải KHÁC nearestTarget của game.js —
    // hàm đó là mục tiêu của BOSS, trùng tên là đè mất và boss ngắm vào hư vô.
    Battle.prototype.nearestFoe = function (range) {
      var p = this.player, best = null, bd = range || 1e9;
      this.mobs.forEach(function (m) {
        if (m.hp <= 0) return;
        var d = dist(m, p); if (d < bd) { bd = d; best = m; }
      });
      if (this.boss && this.boss.hp > 0 && dist(this.boss, p) < bd) best = this.boss;
      return best;
    };

    // Quái quên mất người chơi — dùng cho pha chìm vào bóng.
    Battle.prototype.dropAggro = function () {
      this.mobs.forEach(function (m) { m.agro = 0; });
    };

    /* Vệt nguyên tố dọc một đoạn thẳng. Đây là chỗ "lôi kiếm lướt tới tạo vệt
     * điện" sống: hình dạng vệt do hệ quyết định, không phải do kỹ năng. */
    Battle.prototype.elemTrail = function (x0, y0, x1, y1, ms) {
      var E = this.elemFx();
      this.fx.push({ k: 'etrail', kind: E.trail, elem: this.wp && this.wp.el, x: x0, y: y0, x2: x1, y2: y1,
                     t: 0, ms: ms || 420, col: E.col, glow: E.glow,
                     seed: Math.random() * 1000 });
      // Hoả để lại vùng cháy thật, không chỉ là hình vẽ.
      if (E.trail === 'burn' && E.burnMs) {
        var n = 4, self = this;
        for (var i = 0; i <= n; i++) {
          var u = i / n;
          self.telegraphs.push({ k: 'trap', friendly: true, own: true,
            x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, r: 34,
            t: 0, windup: 0, active: E.burnMs,
            mul: E.burnDps * 1000 / 60, el: 'fire', status: 'burn', tick: true });
        }
      }
      // Thủy: mặt đất trơn, quái đi qua bị trượt quá đà.
      if (E.trail === 'frost' && E.slickMs) {
        this.slicks = this.slicks || [];
        this.slicks.push({ x0: x0, y0: y0, x1: x1, y1: y1, left: E.slickMs });
      }
    };

    /* Thứ bung ra tại điểm lưỡi chạm. Cũng do hệ quyết định. */
    Battle.prototype.elemBurst = function (x, y, mul, victim) {
      var E = this.elemFx(), self = this;
      this.fx.push({ k: 'eburst', kind: E.burst, elem: this.wp && this.wp.el, x: x, y: y, t: 0, ms: 380,
                     col: E.col, glow: E.glow, seed: Math.random() * 1000 });

      if (E.burst === 'chain' && E.chainN) {
        // Điện nảy sang mấy con gần nhất — mỗi tia là một đoạn gãy khúc riêng.
        var near = this.mobs.filter(function (m) {
          return m.hp > 0 && m !== victim && dist(m, { x: x, y: y }) < E.chainR;
        }).sort(function (a, b) {
          return dist(a, { x: x, y: y }) - dist(b, { x: x, y: y });
        }).slice(0, E.chainN);
        near.forEach(function (m) {
          self.fx.push({ k: 'etrail', kind: 'bolt', elem: 'thunder', x: x, y: y, x2: m.x, y2: m.y,
                         t: 0, ms: 260, col: E.col, glow: E.glow, seed: Math.random() * 1000 });
          self.dealToMob(m, self.playerDamage((mul || 1) * E.chainMul, { el: 'thunder' }),
                         { el: 'thunder', status: E.status, move: { kb: 6, poise: 10 } });
        });
      }
      if (E.burst === 'spike') {
        this.fx.push({ k: 'spike', x: x, y: y, t: 0, ms: 420, col: E.col });
        this.shake = Math.max(this.shake, G.FEEL.shake.mid);
      }
      if (E.burst === 'pool' && E.poolMs) {
        this.telegraphs.push({ k: 'trap', friendly: true, own: true, x: x, y: y, r: 46,
          t: 0, windup: 0, active: E.poolMs, mul: 0.25, el: 'dark', tick: true });
      }
      if (E.burst === 'flash' && E.blindMs) {
        this.mobs.forEach(function (m) {
          if (m.hp > 0 && dist(m, { x: x, y: y }) < 110) m.blind = self.t + E.blindMs;
        });
      }
      if (E.drain) {
        // Ám: hút máu theo phần trăm sát thương vừa gây ra.
        this.heal(this.player, (this.lastDealt || 0) * E.drain);
      }
    };

    /* ==================================================================== */
    /* TRÌNH PHÁT TỪNG KIND                                                 */
    /* ==================================================================== */

    /* --- blink: Ảnh Độn. Chìm vào bóng, hiện sau lưng, chém TRỄ một nhịp. ---
     * Cái "mượt" nằm đúng ở chỗ vệt chém KHÔNG vẽ cùng lúc với việc hiện ra.
     * Hiện trước, đứng đó một nhịp ngắn, rồi lưỡi mới nở ra. Vẽ cùng lúc thì nó
     * thành một cú dịch chuyển tầm thường. */
    Battle.prototype.sk_blink = function (sk, st) {
      var p = this.player;
      var tgt = p.skTarget && p.skTarget.hp > 0 ? p.skTarget : this.nearestFoe(sk.range);
      st.from = { x: p.x, y: p.y };
      st.dur = sk.appearMs + sk.slashDelay + sk.ms;
      p.stateDur = st.dur;
      p.iframe = Math.max(p.iframe, sk.appearMs + sk.slashDelay);

      if (!tgt) {
        // Không có mục tiêu: vẫn chớp về phía đang quay mặt, coi như một cú lướt dài.
        st.to = { x: clamp(p.x + Math.cos(p.facing) * 160, 24, this.wW - 24),
                  y: clamp(p.y + Math.sin(p.facing) * 160, 24, this.wH - 24) };
        st.tgt = null;
      } else {
        // Điểm đến là SAU LƯNG mục tiêu, tính theo hướng NÓ đang quay.
        var back = (tgt.facing || 0) + Math.PI;
        var off = (tgt.r || 20) + 26;
        st.to = { x: clamp(tgt.x + Math.cos(back) * off, 24, this.wW - 24),
                  y: clamp(tgt.y + Math.sin(back) * off, 24, this.wH - 24) };
        st.tgt = tgt;
      }
      st.phase = 0;
      this.fx.push({ k: 'smoke', x: st.from.x, y: st.from.y, t: 0, ms: 420, col: '#a06fe0' });
    };

    Battle.prototype.upd_blink = function (sk, st, dt) {
      var p = this.player;
      if (st.phase === 0 && st.t >= sk.appearMs) {
        // Hiện ra sau lưng. Chưa chém.
        st.phase = 1;
        p.x = st.to.x; p.y = st.to.y;
        if (st.tgt) p.facing = Math.atan2(st.tgt.y - p.y, st.tgt.x - p.x);
        if (sk.trail) this.elemTrail(st.from.x, st.from.y, p.x, p.y, 420);
        for (var i = 0; i < (sk.ghosts || 4); i++) {
          var u = (i + 1) / ((sk.ghosts || 4) + 1);
          this.fx.push({ k: 'ghost', x: st.from.x + (p.x - st.from.x) * u,
                         y: st.from.y + (p.y - st.from.y) * u, a: p.facing,
                         t: 0, ms: 300 + i * 40, col: '#c9a8ff' });
        }
        this.fx.push({ k: 'smoke', x: p.x, y: p.y, t: 0, ms: 380, col: '#a06fe0' });
      }
      if (st.phase === 1 && st.t >= sk.appearMs + sk.slashDelay) {
        // Giờ lưỡi mới nở ra.
        st.phase = 2;
        var behind = true;
        if (st.tgt) {
          // Trúng sau lưng thật hay không: so hướng nó đang quay với hướng mình tới.
          var toP = Math.atan2(p.y - st.tgt.y, p.x - st.tgt.x);
          var diff = Math.abs(((toP - (st.tgt.facing || 0) + Math.PI) % TAU + TAU) % TAU - Math.PI);
          behind = diff > Math.PI * 0.55;
        }
        var mul = sk.mul * (behind ? (sk.backMul / sk.mul) : (sk.frontMul / sk.mul));
        mul = behind ? sk.backMul : sk.frontMul;
        var mv = { kb: sk.kb, poise: sk.poise, hs: sk.hitstop };
        this.fx.push({ k: 'slash', x: p.x, y: p.y, a: p.facing, arc: sk.arc, r: sk.reach,
                       t: 0, ms: 220, col: this.elemFx().glow, big: true });
        var hx = p.x + Math.cos(p.facing) * sk.reach * 0.7;
        var hy = p.y + Math.sin(p.facing) * sk.reach * 0.7;
        this.meleeHit(mul, sk.arc, sk.reach, { move: mv, skill: true });
        if (behind) this.number(p.x, p.y - 46, 'ĐÂM LÉN', 'weak');
        this.impact(hx, hy, sk.hitstop, G.FEEL.shake.finish, this.elemFx().col);
        if (sk.burst) this.elemBurst(hx, hy, mul, st.tgt);
      }
      if (st.t >= st.dur) { p.state = 'lag'; p.stateT = 0; p.stateDur = 220; }
    };

    /* --- stance: Tàn Ảnh. Ảo ảnh hút đòn, ba giây mọi nhát tính là đâm lén. --- */
    Battle.prototype.sk_stance = function (sk, st) {
      var p = this.player;
      this.decoys = this.decoys || [];
      this.decoys.push({ x: p.x, y: p.y, facing: p.facing, left: sk.decoyMs,
                         max: sk.decoyMs, blast: sk.decoyBlastMul, r: sk.decoyBlastR });
      p.backstabUntil = this.t + sk.stanceMs;
      p.fadeUntil = this.t + sk.stanceMs;
      p.fade = sk.fadeTo;
      if (sk.decoyTaunt) this.dropAggro();
      this.fx.push({ k: 'smoke', x: p.x, y: p.y, t: 0, ms: 420, col: '#a06fe0' });
      p.state = 'lag'; p.stateT = 0; p.stateDur = 220;
    };

    /* --- wave: Trảm Thiên. Sóng nứt chạy thẳng, xuyên tất cả. --- */
    Battle.prototype.sk_wave = function (sk, st) {
      var p = this.player;
      st.dur = 420; p.stateDur = st.dur; st.fired = false;
      this.shake = Math.max(this.shake, G.FEEL.shake.quake);
    };
    Battle.prototype.upd_wave = function (sk, st, dt) {
      var p = this.player;
      if (!st.fired && st.t >= 200) {
        st.fired = true;
        var a = p.facing, E = this.elemFx();
        this.waves = this.waves || [];
        this.waves.push({ x: p.x, y: p.y, a: a, len: sk.waveLen, w: sk.waveW,
                          travelled: 0, spd: sk.waveSpd, sk: sk, hitSet: [], col: E.col, glow: E.glow });
        if (sk.trail) this.elemTrail(p.x, p.y,
          p.x + Math.cos(a) * sk.waveLen, p.y + Math.sin(a) * sk.waveLen, 520);
        this.impact(p.x, p.y, sk.hitstop, G.FEEL.shake.quake, E.col);
      }
      if (st.t >= st.dur) { p.state = 'lag'; p.stateT = 0; p.stateDur = 320; }
    };

    /* --- pull: Nghiền. Hút cả đám vào tâm rồi một cú đập vỡ thế. --- */
    Battle.prototype.sk_pull = function (sk, st) {
      var p = this.player;
      st.dur = sk.pullMs + 260; p.stateDur = st.dur; st.fired = false;
      this.fx.push({ k: 'vortex', x: p.x, y: p.y, r: sk.pullR, t: 0, ms: sk.pullMs, col: this.elemFx().col });
    };
    Battle.prototype.upd_pull = function (sk, st, dt) {
      var p = this.player;
      if (st.t < sk.pullMs) {
        this.mobs.forEach(function (m) {
          if (m.hp <= 0) return;
          var d = dist(m, p); if (d > sk.pullR || d < 4) return;
          var f = sk.pullForce * (1 - d / sk.pullR) * (m.elite ? 0.45 : 1);
          m.x += (p.x - m.x) * f * dt / 16.67;
          m.y += (p.y - m.y) * f * dt / 16.67;
          m.stagger = Math.max(m.stagger, 120);
        });
      } else if (!st.fired) {
        st.fired = true;
        this.meleeHit(sk.mul, sk.arc, sk.reach,
          { move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop }, skill: true });
        this.impact(p.x, p.y, sk.hitstop, G.FEEL.shake.quake, this.elemFx().col);
        this.fx.push({ k: 'ring', x: p.x, y: p.y, r: sk.reach, t: 0, ms: 380, col: this.elemFx().glow });
        if (sk.burst) this.elemBurst(p.x, p.y, sk.mul, null);
      }
      if (st.t >= st.dur) { p.state = 'lag'; p.stateT = 0; p.stateDur = 300; }
    };

    /* --- wall: Thành Trì. Tường cung đứng yên, chặn đạn. --- */
    Battle.prototype.sk_wall = function (sk, st) {
      var p = this.player;
      this.walls = this.walls || [];
      this.walls.push({ x: p.x + Math.cos(p.facing) * sk.wallDist,
                        y: p.y + Math.sin(p.facing) * sk.wallDist,
                        a: p.facing, arc: sk.wallArc, w: sk.wallW,
                        left: sk.wallMs, max: sk.wallMs, sk: sk, col: this.elemFx().glow });
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 60, t: 0, ms: 320, col: '#7fd4ff' });
      p.state = 'lag'; p.stateT = 0; p.stateDur = 260;
    };

    /* --- rush: Thiên Chuỳ. Lao có giáp, dồn cả đám tới cuối đường. --- */
    Battle.prototype.sk_rush = function (sk, st) {
      var p = this.player;
      st.dur = sk.rushMs + 260; p.stateDur = st.dur;
      st.a = p.facing; st.moved = 0; st.done = false; st.carried = [];
      if (sk.armor) p.armorUntil = this.t + sk.rushMs;
      this.fx.push({ k: 'dust', x: p.x, y: p.y, t: 0, ms: 300 });
    };
    Battle.prototype.upd_rush = function (sk, st, dt) {
      var p = this.player, self = this;
      if (st.t < sk.rushMs) {
        var step = sk.dist * (dt / sk.rushMs);
        p.x = clamp(p.x + Math.cos(st.a) * step, 24, this.wW - 24);
        p.y = clamp(p.y + Math.sin(st.a) * step, 24, this.wH - 24);
        st.moved += step;
        this.mobs.forEach(function (m) {
          if (m.hp <= 0) return;
          if (dist(m, p) < m.r + 26) {
            if (st.carried.indexOf(m) < 0) {
              st.carried.push(m);
              self.dealToMob(m, self.playerDamage(sk.mul, {}),
                { move: { kb: 4, poise: sk.poise * 0.4 }, from: st.a, skill: true });
            }
            if (sk.pushAlong) { m.x += Math.cos(st.a) * step; m.y += Math.sin(st.a) * step; }
            m.stagger = Math.max(m.stagger, 160);
          }
        });
      } else if (!st.done) {
        st.done = true;
        this.meleeHit(sk.endMul, sk.arc, sk.reach,
          { move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop, launch: sk.launch }, skill: true });
        var hx = p.x + Math.cos(st.a) * sk.reach * 0.6, hy = p.y + Math.sin(st.a) * sk.reach * 0.6;
        this.impact(hx, hy, sk.hitstop, G.FEEL.shake.heavy, this.elemFx().col);
        if (sk.trail) this.elemTrail(st.from.x, st.from.y, p.x, p.y, 460);
        if (sk.burst) this.elemBurst(hx, hy, sk.endMul, null);
      }
      if (st.t >= st.dur) { p.state = 'lag'; p.stateT = 0; p.stateDur = 260; }
    };

    /* --- leap: Yến Phi Trảm. Bật lên cao rồi đâm xuống điểm đã ngắm. --- */
    Battle.prototype.sk_leap = function (sk, st) {
      var p = this.player;
      st.dur = sk.upMs + sk.hangMs + sk.downMs; p.stateDur = st.dur;
      st.land = { x: p.aimX || (p.x + Math.cos(p.facing) * sk.aimR),
                  y: p.aimY || (p.y + Math.sin(p.facing) * sk.aimR) };
      st.land.x = clamp(st.land.x, 24, this.wW - 24);
      st.land.y = clamp(st.land.y, 24, this.wH - 24);
      st.done = false;
      p.iframe = Math.max(p.iframe, sk.upMs + sk.hangMs);
      // Vùng đổ bộ hiện ra ngay từ lúc bật lên — quái cũng đọc được, đó là điều đúng.
      this.fx.push({ k: 'tell', x: st.land.x, y: st.land.y, r: sk.radius,
                     t: 0, ms: sk.upMs + sk.hangMs, friendly: true });
    };
    Battle.prototype.upd_leap = function (sk, st, dt) {
      var p = this.player;
      var up = sk.upMs, hang = sk.upMs + sk.hangMs;
      if (st.t < up) {
        var u = st.t / up;
        p.z = sk.peakZ * Math.sin(u * Math.PI / 2);
      } else if (st.t < hang) {
        p.z = sk.peakZ;
        // Bay tới trên đầu điểm rơi.
        var v = (st.t - up) / sk.hangMs;
        p.x = st.from.x + (st.land.x - st.from.x) * v;
        p.y = st.from.y + (st.land.y - st.from.y) * v;
      } else {
        var w = clamp((st.t - hang) / sk.downMs, 0, 1);
        p.x = st.land.x; p.y = st.land.y;
        p.z = sk.peakZ * (1 - w * w);
        if (w >= 1 && !st.done) {
          st.done = true; p.z = 0;
          this.aoeDamage(p.x, p.y, sk.radius, sk.mul,
            { move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop, launch: sk.launch }, skill: true });
          this.impact(p.x, p.y, sk.hitstop, G.FEEL.shake.quake, this.elemFx().col);
          this.fx.push({ k: 'ring', x: p.x, y: p.y, r: sk.radius, t: 0, ms: 420, col: this.elemFx().glow });
          this.fx.push({ k: 'dust', x: p.x, y: p.y, t: 0, ms: 420 });
          if (sk.burst) this.elemBurst(p.x, p.y, sk.mul, null);
        }
      }
      if (st.t >= st.dur) { p.z = 0; p.state = 'lag'; p.stateT = 0; p.stateDur = 280; }
    };

    /* --- pierce: Xuyên Vân. Đâm xuyên một hàng, càng xuyên càng nặng. --- */
    Battle.prototype.sk_pierce = function (sk, st) {
      var p = this.player, self = this;
      st.dur = sk.ms + 240; p.stateDur = st.dur;
      var a = p.facing, ex = p.x + Math.cos(a) * sk.len, ey = p.y + Math.sin(a) * sk.len;

      // Xếp mục tiêu theo khoảng cách dọc trục đâm rồi cộng dồn hệ số.
      var list = [];
      this.mobs.forEach(function (m) {
        if (m.hp <= 0) return;
        var rx = m.x - p.x, ry = m.y - p.y;
        var along = rx * Math.cos(a) + ry * Math.sin(a);
        var perp = Math.abs(-rx * Math.sin(a) + ry * Math.cos(a));
        if (along > 0 && along < sk.len && perp < sk.w / 2 + m.r) list.push({ m: m, d: along });
      });
      list.sort(function (u, v) { return u.d - v.d; });
      var mul = sk.mul;
      list.forEach(function (o) {
        self.dealToMob(o.m, self.playerDamage(mul, {}),
          { move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop }, from: a, skill: true });
        self.elemBurst(o.m.x, o.m.y, mul, o.m);
        mul = Math.min(sk.mul * sk.rampMax, mul * (1 + sk.rampPerHit));
      });
      if (list.length > 1) this.number(ex, ey, '×' + list.length + ' XUYÊN', 'weak');
      if (sk.trail) this.elemTrail(p.x, p.y, ex, ey, 520);
      this.fx.push({ k: 'lunge', x: p.x, y: p.y, a: a, t: 0, ms: 260 });
      this.impact(ex, ey, sk.hitstop, G.FEEL.shake.heavy, this.elemFx().col);
      if (sk.push) {
        p.x = clamp(p.x + Math.cos(a) * sk.push, 24, this.wW - 24);
        p.y = clamp(p.y + Math.sin(a) * sk.push, 24, this.wH - 24);
      }
    };
    Battle.prototype.upd_pierce = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 240; }
    };

    /* --- rain: Vũ Tiễn. Mưa mũi tên xuống vùng đã chọn, mỗi mũi báo trước. --- */
    Battle.prototype.sk_rain = function (sk, st) {
      var p = this.player;
      st.dur = 420; p.stateDur = st.dur;
      var zx = clamp(p.aimX || (p.x + Math.cos(p.facing) * sk.aimR), 30, this.wW - 30);
      var zy = clamp(p.aimY || (p.y + Math.sin(p.facing) * sk.aimR), 30, this.wH - 30);
      this.rains = this.rains || [];
      for (var i = 0; i < sk.arrows; i++) {
        var ang = Math.random() * TAU, rr = Math.sqrt(Math.random()) * sk.zoneR;
        this.rains.push({
          x: zx + Math.cos(ang) * rr, y: zy + Math.sin(ang) * rr,
          left: sk.delayMs + Math.random() * sk.spreadMs, sk: sk
        });
      }
      this.fx.push({ k: 'tell', x: zx, y: zy, r: sk.zoneR, t: 0, ms: sk.delayMs, friendly: true });
    };
    Battle.prototype.upd_rain = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 240; }
    };

    /* --- snipe2: Nhất Tiễn Xuyên Tâm. Xuyên trọn một hàng, để lại vết rỉ máu. --- */
    Battle.prototype.sk_snipe2 = function (sk, st) {
      var p = this.player;
      st.dur = 380; p.stateDur = st.dur;
      this.projs.push({ k: 'arrow', x: p.x, y: p.y, a: p.facing, spd: sk.speed,
        life: sk.len / sk.speed * 16.67, mul: sk.mul, pierce: true,
        move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop },
        from: { x: p.x, y: p.y }, hitSet: [], skill: sk, big: true });
      if (sk.trail) this.elemTrail(p.x, p.y,
        p.x + Math.cos(p.facing) * sk.len, p.y + Math.sin(p.facing) * sk.len, 620);
      this.impact(p.x, p.y, 0, G.FEEL.shake.heavy, this.elemFx().col);
      if (sk.zoomPunch) this.zoomPunch = sk.zoomPunch;
    };
    Battle.prototype.upd_snipe2 = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 260; }
    };

    /* ==================================================================== */
    /* CẬP NHẬT MỖI KHUNG                                                   */
    /* ==================================================================== */

    Battle.prototype.updateSkills = function (dt) {
      var p = this.player, self = this;

      // hồi chiêu
      if (!p.skCd) p.skCd = [0, 0];
      for (var i = 0; i < p.skCd.length; i++) if (p.skCd[i] > 0) p.skCd[i] = Math.max(0, p.skCd[i] - dt);

      // hết thời gian ẩn thân
      if (p.fadeUntil && this.t > p.fadeUntil) { p.fadeUntil = 0; p.fade = 1; }
      if (p.state !== 'skcharge' && !p.fadeUntil) p.fade = 1;

      // đang diễn một kỹ năng
      if (p.state === 'skill' && p.sk) {
        p.sk.t += dt;
        var fn = this['upd_' + p.sk.def.kind];
        if (fn) fn.call(this, p.sk.def, p.sk, dt);
        else if (p.sk.t >= (p.sk.dur || 300)) p.state = 'idle';
      }

      // ảo ảnh
      if (this.decoys && this.decoys.length) {
        for (var d = this.decoys.length - 1; d >= 0; d--) {
          var dc = this.decoys[d];
          dc.left -= dt;
          if (dc.left <= 0) {
            this.aoeDamage(dc.x, dc.y, dc.r, dc.blast, { move: { kb: 18, poise: 24 }, skill: true });
            this.fx.push({ k: 'ring', x: dc.x, y: dc.y, r: dc.r, t: 0, ms: 360, col: '#c9a8ff' });
            this.decoys.splice(d, 1);
          }
        }
      }

      // sóng nứt chạy thẳng
      if (this.waves && this.waves.length) {
        for (var w = this.waves.length - 1; w >= 0; w--) {
          var wv = this.waves[w];
          var step = wv.spd * dt;
          wv.travelled += step;
          var hx = wv.x + Math.cos(wv.a) * wv.travelled, hy = wv.y + Math.sin(wv.a) * wv.travelled;
          this.mobs.forEach(function (m) {
            if (m.hp <= 0 || wv.hitSet.indexOf(m) >= 0) return;
            if (Math.hypot(m.x - hx, m.y - hy) < m.r + wv.w / 2) {
              wv.hitSet.push(m);
              self.dealToMob(m, self.playerDamage(wv.sk.mul, {}),
                { move: { kb: wv.sk.kb, poise: wv.sk.poise, hs: wv.sk.hitstop, launch: wv.sk.launch },
                  from: wv.a, skill: true });
              if (wv.sk.burst) self.elemBurst(m.x, m.y, wv.sk.mul, m);
            }
          });
          if (this.boss && this.boss.hp > 0 && wv.hitSet.indexOf(this.boss) < 0 &&
              Math.hypot(this.boss.x - hx, this.boss.y - hy) < this.boss.r + wv.w / 2) {
            wv.hitSet.push(this.boss);
            this.dealToBoss(this.playerDamage(wv.sk.mul, {}), hx, hy, { skill: true });
          }
          if (wv.travelled >= wv.len) this.waves.splice(w, 1);
        }
      }

      // tường chắn
      if (this.walls && this.walls.length) {
        for (var q = this.walls.length - 1; q >= 0; q--) {
          this.walls[q].left -= dt;
          if (this.walls[q].left <= 0) this.walls.splice(q, 1);
        }
      }

      // mưa tên
      if (this.rains && this.rains.length) {
        for (var r = this.rains.length - 1; r >= 0; r--) {
          var ra = this.rains[r];
          ra.left -= dt;
          if (ra.left <= 0) {
            this.aoeDamage(ra.x, ra.y, 30, ra.sk.mul,
              { move: { kb: ra.sk.kb, poise: ra.sk.poise, hs: ra.sk.hitstop }, skill: true });
            this.fx.push({ k: 'rainhit', x: ra.x, y: ra.y, t: 0, ms: 260, col: this.elemFx().glow });
            this.shake = Math.max(this.shake, G.FEEL.shake.light);
            this.rains.splice(r, 1);
          }
        }
      }

      // mặt đất trơn (hệ Thủy)
      if (this.slicks && this.slicks.length) {
        for (var s2 = this.slicks.length - 1; s2 >= 0; s2--) {
          this.slicks[s2].left -= dt;
          if (this.slicks[s2].left <= 0) this.slicks.splice(s2, 1);
        }
      }

      // giật camera sau đòn nặng
      if (this.zoomPunch) this.zoomPunch = Math.max(0, this.zoomPunch - dt * 0.0012);
    };

    /* Đạn của quái có bị tường chắn không. game.js gọi hàm này. */
    Battle.prototype.shotBlocked = function (x, y) {
      if (!this.walls || !this.walls.length) return false;
      for (var i = 0; i < this.walls.length; i++) {
        var w = this.walls[i];
        var d = Math.hypot(x - w.x, y - w.y);
        if (d > 70) continue;
        var a = Math.atan2(y - w.y, x - w.x);
        var diff = Math.abs(((a - w.a + Math.PI) % TAU + TAU) % TAU - Math.PI);
        if (diff < w.arc / 2) return true;
      }
      return false;
    };

    /* ==================================================================== */
    /* VẼ — hai lớp: nằm trên mặt đất, và đứng ngang tầm nhân vật            */
    /* ==================================================================== */

    Battle.prototype.drawSkillGround = function () {
      var ctx = this.ctx, self = this;

      // vũng trơn của hệ Thủy
      (this.slicks || []).forEach(function (s) {
        var a = Math.min(1, s.left / 600) * 0.28;
        ctx.save(); ctx.globalAlpha = a;
        ctx.strokeStyle = '#a5dcff'; ctx.lineWidth = 26; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke();
        ctx.restore();
      });

      // bóng báo trước chỗ mũi tên sắp cắm xuống
      (this.rains || []).forEach(function (r) {
        var k = 1 - Math.min(1, r.left / 500);
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, 12 * (1 - k * 0.4), 6 * (1 - k * 0.4), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      });

      // sóng nứt đang chạy
      (this.waves || []).forEach(function (w) {
        var hx = w.x + Math.cos(w.a) * w.travelled, hy = w.y + Math.sin(w.a) * w.travelled;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = w.glow; ctx.lineWidth = w.w * 0.5; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hx - Math.cos(w.a) * 40, hy - Math.sin(w.a) * 40);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(hx - Math.cos(w.a) * 26, hy - Math.sin(w.a) * 26);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        // đầu sóng bung ra hai bên
        ctx.globalAlpha = 0.7; ctx.fillStyle = w.col;
        var nx = -Math.sin(w.a), ny = Math.cos(w.a);
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(w.a) * 22, hy + Math.sin(w.a) * 22);
        ctx.lineTo(hx + nx * w.w * 0.5, hy + ny * w.w * 0.5);
        ctx.lineTo(hx - nx * w.w * 0.5, hy - ny * w.w * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });
    };

    Battle.prototype.drawSkillEntities = function () {
      var ctx = this.ctx, self = this;

      // ảo ảnh — vẽ mờ hẳn để không nhầm với nhân vật thật
      (this.decoys || []).forEach(function (d) {
        ctx.save();
        ctx.globalAlpha = 0.30 + 0.15 * Math.sin(self.t / 120);
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        ctx.beginPath(); ctx.ellipse(d.x, d.y + 12, 13, 5, 0, 0, TAU); ctx.fill();
        ctx.translate(d.x, d.y);
        if (G.drawChar) {
          G.drawChar(ctx, { facing: d.facing, state: 'idle', moving: false, t: self.t, k: 0,
            charge: 0, body: '#7a5fb0', hand: '#7a5fb0', hair: '#c9a8ff', cloth: '#4a3a72',
            weapon: self.wp ? self.wp.wclass : 'sword', elem: '#c9a8ff' });
        }
        // vòng ngoài nhấp nháy: nói cho biết nó SẼ NỔ, không phải chỉ đứng đó
        ctx.globalAlpha = 0.35 * (d.left / d.max);
        ctx.strokeStyle = '#c9a8ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, d.r * (1 - d.left / d.max), 0, TAU); ctx.stroke();
        ctx.restore();
      });

      // tường chắn — một cung dày, có vệt sáng chạy dọc để thấy nó còn sống
      (this.walls || []).forEach(function (w) {
        var life = w.left / w.max;
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.globalAlpha = 0.25 + 0.35 * life;
        ctx.strokeStyle = w.col; ctx.lineWidth = w.w + 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, 46, w.a - w.arc / 2, w.a + w.arc / 2); ctx.stroke();
        ctx.globalAlpha = 0.6 + 0.4 * life;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 46, w.a - w.arc / 2, w.a + w.arc / 2); ctx.stroke();
        ctx.restore();
      });
    };

    /* Vòng ngắm và thanh nạp của kỹ năng. Vẽ ở lớp thế giới, gọi từ drawAimOverlay. */
    Battle.prototype.drawSkillAim = function (ox, oy) {
      var p = this.player, ctx = this.ctx;
      if (p.state !== 'skcharge') return;
      var sk = this.skillDef(p.skIdx); if (!sk) return;
      var kk = clamp(p.skChargeT / sk.charge, 0, 1);
      var E = this.elemFx();

      ctx.save(); ctx.translate(ox, oy);

      // Vòng nạp dưới chân — đầy dần, đầy rồi thì viền sáng bừng.
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(p.x, p.y + 10, 30, 0, TAU); ctx.stroke();
      ctx.strokeStyle = p.skReady ? '#ffffff' : E.col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y + 10, 30, -Math.PI / 2, -Math.PI / 2 + TAU * kk); ctx.stroke();
      if (p.skReady) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t / 70);
        ctx.strokeStyle = E.glow; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y + 10, 36, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      // Đòn chớp: nối một sợi chỉ tới chỗ sắp hiện ra, để người chơi biết mình đi đâu.
      if (sk.kind === 'blink' && p.skTarget && p.skTarget.hp > 0) {
        var tg = p.skTarget;
        var back = (tg.facing || 0) + Math.PI, off = (tg.r || 20) + 26;
        var dx2 = tg.x + Math.cos(back) * off, dy2 = tg.y + Math.sin(back) * off;
        ctx.globalAlpha = 0.35 + 0.4 * kk;
        ctx.setLineDash([6, 7]); ctx.lineDashOffset = -this.t / 26;
        ctx.strokeStyle = E.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(dx2, dy2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.5 + 0.5 * kk;
        ctx.strokeStyle = p.skReady ? '#ffffff' : E.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(dx2, dy2, 16, 0, TAU); ctx.stroke();
        // dấu hướng lưng của mục tiêu
        ctx.beginPath();
        ctx.moveTo(dx2 + Math.cos(back + Math.PI) * 8, dy2 + Math.sin(back + Math.PI) * 8);
        ctx.lineTo(dx2 + Math.cos(back + Math.PI) * 20, dy2 + Math.sin(back + Math.PI) * 20);
        ctx.stroke();
      }

      // Đòn cần điểm đến: vẽ vùng sẽ nổ, màu VÀNG (đỏ để dành cho nguy hiểm).
      if (sk.aimR) {
        var r2 = sk.zoneR || sk.radius || 70;
        ctx.globalAlpha = 0.14 + 0.16 * kk;
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath(); ctx.arc(p.aimX, p.aimY, r2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#ffe74c'; ctx.lineWidth = 2;
        ctx.setLineDash([9, 6]); ctx.lineDashOffset = -this.t / 22;
        ctx.beginPath(); ctx.arc(p.aimX, p.aimY, r2, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Đòn xuyên / sóng: vạch thẳng dài dần theo mức nạp.
      if (sk.len || sk.waveLen || sk.dist) {
        var L2 = (sk.len || sk.waveLen || sk.dist) * kk;
        var w2 = (sk.w || sk.waveW || 40);
        ctx.globalAlpha = 0.12 + 0.20 * kk;
        ctx.fillStyle = '#f2c14e';
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.facing);
        ctx.fillRect(0, -w2 / 2, L2, w2);
        ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffe74c'; ctx.lineWidth = 2;
        ctx.strokeRect(0, -w2 / 2, L2, w2);
        ctx.restore();
      }

      ctx.restore();
    };

    /* Đứng sau tường thì đòn nặng tay hơn. */
    Battle.prototype.wallBonus = function () {
      if (!this.walls || !this.walls.length) return 0;
      var p = this.player, best = 0;
      for (var i = 0; i < this.walls.length; i++) {
        var w = this.walls[i];
        if (Math.hypot(p.x - w.x, p.y - w.y) < 90) best = Math.max(best, w.sk.behindDmg || 0);
      }
      return best;
    };
  };

  /* ====================================================================== */
  /* VẼ                                                                     */
  /* ====================================================================== */

  // Nhiễu ổn định theo hạt giống — để một tia sét giữ nguyên hình dạng suốt đời
  // nó thay vì nhấp nháy loạn mỗi khung.
  function nz(seed, i) { var v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); }

  /* Đường gãy khúc giữa hai điểm. Dùng cho tia sét và vết nứt. */
  function jagged(ctx, x0, y0, x1, y1, seed, amp, segs) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    var nx = -dy / L, ny = dx / L;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (var i = 1; i < segs; i++) {
      var u = i / segs;
      var off = (nz(seed, i) - 0.5) * 2 * amp * Math.sin(u * Math.PI);
      ctx.lineTo(x0 + dx * u + nx * off, y0 + dy * u + ny * off);
    }
    ctx.lineTo(x1, y1);
  }

  /* Vẽ hiệu ứng của hệ kỹ năng. Trả về true nếu đã xử lý — game.js dựa vào đó.
   *
   * Mỗi hiệu ứng có HAI đường: có ảnh thì vẽ ảnh, không thì vẽ tay bằng hình học.
   * Phần vẽ tay không phải là code chết — nó là thứ giữ cho game chạy được khi
   * chưa có art, và là chỗ so sánh để biết ảnh mới có hơn không. */
  function sprFx(ctx, key, f, k, opt) {
    if (!G.Atlas) return false;
    var e = G.Atlas.get(key);
    if (!e) return false;
    opt = opt || {};
    opt.frame = Math.min(e.frames - 1, Math.floor(k * e.frames));
    if (opt.alpha === undefined) opt.alpha = 1 - k * k;
    return G.Atlas.draw(ctx, e, f.x, f.y, opt);
  }

  G.drawSkillFx = function (ctx, f, k) {
    switch (f.k) {

      /* --- vệt để lại dọc đường đi, hình dạng do NGUYÊN TỐ quyết định --- */
      case 'etrail': {
        var a = 1 - k;
        // Có ảnh cho vệt của hệ này thì kéo giãn nó dọc đoạn đường và xong.
        if (G.Atlas && f.elem) {
          var te = G.Atlas.get('elem.' + f.elem + '.trail');
          if (te) {
            G.Atlas.drawStretched(ctx, te, f.x, f.y, f.x2, f.y2, {
              frame: Math.min(te.frames - 1, Math.floor(k * te.frames)),
              alpha: a, blend: 'lighter'
            });
            return true;
          }
        }
        if (f.kind === 'bolt') {
          // Sét: một thân chính sáng trắng, vài nhánh con toả ra hai bên.
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          // Ba lớp chồng nhau ở chế độ cộng sáng: quầng rộng mờ -> thân màu -> lõi
          // trắng. Cộng sáng làm chỗ chồng nhiều lớp tự cháy ra trắng, đó là thứ
          // biến một sợi dây gãy khúc thành một tia sét.
          ctx.globalAlpha = a * 0.30; ctx.strokeStyle = f.glow || f.col; ctx.lineWidth = 22;
          jagged(ctx, f.x, f.y, f.x2, f.y2, f.seed, 16, 9); ctx.stroke();
          ctx.globalAlpha = a * 0.75; ctx.strokeStyle = f.col; ctx.lineWidth = 8;
          jagged(ctx, f.x, f.y, f.x2, f.y2, f.seed, 16, 9); ctx.stroke();
          ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
          jagged(ctx, f.x, f.y, f.x2, f.y2, f.seed, 16, 9); ctx.stroke();
          // nhánh con
          ctx.globalAlpha = a * 0.85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          for (var b = 0; b < 4; b++) {
            var u = 0.2 + nz(f.seed, 40 + b) * 0.6;
            var bx = f.x + (f.x2 - f.x) * u, by = f.y + (f.y2 - f.y) * u;
            var ba = nz(f.seed, 50 + b) * TAU, bl = 14 + nz(f.seed, 60 + b) * 22;
            jagged(ctx, bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, f.seed + b, 6, 4);
            ctx.stroke();
          }
        } else if (f.kind === 'burn') {
          // Lửa: một dải ấm còn đọng trên đất, tàn lửa bay lên.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.5; ctx.strokeStyle = f.col;
          ctx.lineWidth = 22 * (1 - k * 0.4); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          ctx.globalAlpha = a * 0.9; ctx.strokeStyle = f.glow; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          for (var e = 0; e < 7; e++) {
            var eu = nz(f.seed, e);
            ctx.globalAlpha = a * (0.4 + nz(f.seed, 20 + e) * 0.6);
            ctx.fillStyle = '#ffe0a0';
            ctx.beginPath();
            ctx.arc(f.x + (f.x2 - f.x) * eu + (nz(f.seed, 30 + e) - 0.5) * 20,
                    f.y + (f.y2 - f.y) * eu - k * 26 - nz(f.seed, 70 + e) * 14,
                    1.5 + nz(f.seed, 80 + e) * 2, 0, TAU);
            ctx.fill();
          }
        } else if (f.kind === 'frost') {
          ctx.globalAlpha = a * 0.55; ctx.strokeStyle = f.col;
          ctx.lineWidth = 18; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          for (var s = 0; s < 6; s++) {
            var su = s / 6, sx = f.x + (f.x2 - f.x) * su, sy = f.y + (f.y2 - f.y) * su;
            var sa = nz(f.seed, s) * TAU;
            ctx.beginPath();
            ctx.moveTo(sx - Math.cos(sa) * 9, sy - Math.sin(sa) * 9);
            ctx.lineTo(sx + Math.cos(sa) * 9, sy + Math.sin(sa) * 9);
            ctx.stroke();
          }
        } else if (f.kind === 'crack') {
          ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#2a1f14'; ctx.lineWidth = 5;
          jagged(ctx, f.x, f.y, f.x2, f.y2, f.seed, 10, 7); ctx.stroke();
          ctx.globalAlpha = a * 0.7; ctx.strokeStyle = f.col; ctx.lineWidth = 2;
          jagged(ctx, f.x, f.y, f.x2, f.y2, f.seed, 10, 7); ctx.stroke();
        } else if (f.kind === 'smoke') {
          ctx.globalAlpha = a * 0.5; ctx.strokeStyle = f.col;
          ctx.lineWidth = 20 * (1 + k); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        } else {
          // streak — vệt sáng mảnh, mặc định của hệ Vô và Quang
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.5; ctx.strokeStyle = f.col;
          ctx.lineWidth = 14 * (1 - k * 0.6); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * (1 - k * 0.6);
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        }
        return true;
      }

      /* --- thứ bung ra tại điểm lưỡi chạm --- */
      case 'eburst': {
        var ab = 1 - k;
        if (f.elem && sprFx(ctx, 'elem.' + f.elem + '.burst', f, k, { blend: 'lighter' })) return true;
        ctx.globalCompositeOperation = 'lighter';
        if (f.kind === 'chain' || f.kind === 'flash') {
          ctx.globalAlpha = ab; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(f.x, f.y, (4 + 18 * k) * (1 - k * 0.5), 0, TAU); ctx.fill();
          ctx.strokeStyle = f.col; ctx.lineWidth = 2.5 * ab;
          for (var i2 = 0; i2 < 7; i2++) {
            var ia = nz(f.seed, i2) * TAU, il = 12 + 30 * k;
            ctx.beginPath();
            ctx.moveTo(f.x + Math.cos(ia) * 6, f.y + Math.sin(ia) * 6);
            ctx.lineTo(f.x + Math.cos(ia) * il, f.y + Math.sin(ia) * il);
            ctx.stroke();
          }
        } else if (f.kind === 'flare') {
          ctx.globalAlpha = ab * 0.8; ctx.fillStyle = f.col;
          ctx.beginPath(); ctx.arc(f.x, f.y, 10 + 34 * k, 0, TAU); ctx.fill();
          ctx.globalAlpha = ab; ctx.fillStyle = '#fff2c8';
          ctx.beginPath(); ctx.arc(f.x, f.y, (6 + 14 * k) * (1 - k), 0, TAU); ctx.fill();
        } else if (f.kind === 'shard') {
          ctx.globalAlpha = ab; ctx.fillStyle = f.glow;
          for (var s2 = 0; s2 < 6; s2++) {
            var sa2 = nz(f.seed, s2) * TAU, sd = 8 + 34 * k;
            var px = f.x + Math.cos(sa2) * sd, py = f.y + Math.sin(sa2) * sd;
            ctx.save(); ctx.translate(px, py); ctx.rotate(sa2);
            ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, 3); ctx.lineTo(-4, -3);
            ctx.closePath(); ctx.fill(); ctx.restore();
          }
        } else if (f.kind === 'pool') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = ab * 0.55; ctx.fillStyle = f.col;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, 20 + 26 * k, (20 + 26 * k) * 0.5, 0, 0, TAU); ctx.fill();
        } else {
          ctx.globalAlpha = ab; ctx.fillStyle = f.glow || '#ffffff';
          ctx.beginPath(); ctx.arc(f.x, f.y, (5 + 20 * k) * (1 - k * 0.4), 0, TAU); ctx.fill();
        }
        return true;
      }

      /* --- gai đá trồi lên (hệ Thổ) --- */
      case 'spike': {
        var kk = Math.min(1, k * 2.4);
        ctx.globalAlpha = (1 - k) * 0.95;
        for (var g = 0; g < 5; g++) {
          var ga = nz(f.x + g, g) * TAU, gd = 10 + nz(f.y + g, g + 5) * 26;
          var gx = f.x + Math.cos(ga) * gd, gy = f.y + Math.sin(ga) * gd;
          var h = (16 + nz(f.x, g + 9) * 20) * kk;
          ctx.fillStyle = f.col; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(gx - 6, gy); ctx.lineTo(gx, gy - h); ctx.lineTo(gx + 6, gy);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        return true;
      }

      /* --- bóng mờ để lại dọc đường chớp --- */
      case 'ghost': {
        ctx.globalAlpha = (1 - k) * 0.45;
        ctx.fillStyle = f.col;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a || 0);
        ctx.beginPath(); ctx.ellipse(0, -6, 8, 15, 0, 0, TAU); ctx.fill();
        ctx.restore();
        return true;
      }

      /* --- khói tan ở điểm biến mất / hiện ra --- */
      case 'smoke': {
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.fillStyle = f.col;
        for (var q = 0; q < 7; q++) {
          var qa = q / 7 * TAU + f.x * 0.01;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(qa) * 26 * k, f.y + Math.sin(qa) * 18 * k - k * 12,
                  10 * (1 - k * 0.6), 0, TAU);
          ctx.fill();
        }
        return true;
      }

      /* --- xoáy hút quái --- */
      case 'vortex': {
        ctx.globalAlpha = 0.55 * (1 - k * 0.4);
        ctx.strokeStyle = f.col; ctx.lineCap = 'round';
        for (var v = 0; v < 3; v++) {
          ctx.lineWidth = 3 - v * 0.6;
          ctx.beginPath();
          for (var st2 = 0; st2 <= 24; st2++) {
            var t2 = st2 / 24;
            var rr = f.r * (1 - t2) * (1 - k * 0.5);
            var aa = t2 * 6 + v * 2.1 - k * 10;
            var xx = f.x + Math.cos(aa) * rr, yy = f.y + Math.sin(aa) * rr * 0.62;
            if (st2 === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
        return true;
      }

      /* --- mũi tên chạm đất --- */
      case 'rainhit': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(f.x, f.y - 40 * (1 - k)); ctx.lineTo(f.x, f.y); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 9 * k, 0, TAU); ctx.fill();
        return true;
      }
    }
    return false;
  };

})(window.DP = window.DP || {});
