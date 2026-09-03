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
 * CÁCH BẤM — đã đổi hẳn. Cũ: giữ màn hình, trượt về hướng nút, giữ nguyên ở đó
 * cho đủ 0,6–2,0 giây, rồi mới nhả. Ba điều kiện nối tiếp trên một ngón, hỏng
 * bước nào cũng ra cùng một kết quả là "không có gì xảy ra".
 *
 * Mới, đúng chuẩn survivor-like trên điện thoại:
 *     HỒI CHIÊU CHÍNH LÀ THANH NẠP  ->  nạp đầy thì nút sáng
 *     đặt ngón lên nút, KÉO ĐỂ CHỈ HƯỚNG (thả tay không kéo = tự ngắm con gần nhất)
 *     THẢ RA = XẢ
 * Không còn "nhả sớm thì huỷ": chưa nạp đầy thì nút không bấm được, mà bấm được
 * thì chắc chắn xả ra. Bỏ ngón khỏi nút trước khi kéo ra khỏi vùng chết = huỷ,
 * và huỷ KHÔNG mất hồi chiêu — chưa tiêu gì thì không phải trả gì.
 *
 * Ngắm KHÔNG khoá chân. Ngón di chuyển vẫn nằm trên canvas và vẫn chạy được
 * trong lúc ngón kia đang chỉ hướng trên nút — đó là lý do trạng thái ngắm nằm ở
 * `p.skAim` chứ không nằm ở `p.state`: `p.state` bị mọi phát bắn ghi đè, còn cái
 * ngắm thì phải sống xuyên qua tất cả những cái đó.
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

    /* ------------------------------------------------- NGẮM RỒI THẢ ------- */

    /* Ba dáng ngắm. Mỗi kỹ năng khai báo `aim` để biết mình thuộc dáng nào:
     *   'self'  không cần hướng (khiên, tăng tốc, bắn loạt quanh thân) -> bấm là xả
     *   'dir'   cần một HƯỚNG   (lao tới, tia xuyên, chém siêu to)
     *   'point' cần một ĐIỂM ĐẾN (mưa tên, thiên thạch, điểm hút, chớp)
     * Dáng quyết định cả cái vẽ ra lúc ngắm lẫn cái đọc ra lúc xả. Không có dáng
     * thứ tư: mọi kỹ năng trong game rơi vào đúng ba cái này, và giữ đúng ba cái
     * là lý do người chơi chỉ phải học một lần. */
    function aimKindOf(sk) { return sk.aim || (sk.aimR ? 'point' : 'dir'); }
    G.aimKindOf = aimKindOf;

    // Ngưỡng kéo. Dưới DEAD là "không kéo" -> tự ngắm. Trên FULL là kéo hết cỡ.
    var AIM_DEAD = 14, AIM_FULL = 86;

    /* Đặt ngón lên nút kỹ năng. Trả về false nếu không vào được thế ngắm — HUD
     * đọc giá trị này để biết có nên bắt đầu theo dõi cử chỉ kéo hay không. */
    Battle.prototype.skillAimStart = function (idx) {
      var p = this.player, sk = this.skillDef(idx);
      if (!sk || p.down || this.paused) return false;
      if (this.skillCdLeft(idx) > 0) {
        this.toast(sk.n + ' còn ' + (this.skillCdLeft(idx) / 1000).toFixed(1) + 's', '#8fa3b5');
        return false;
      }
      // Đang cắm giữa một kỹ năng khác, đang lăn, đang cứng đòn: từ chối. Nhưng
      // KHÔNG từ chối lúc đang giữ cò hay đang nạp cung — bỏ ngón ra khỏi cò để
      // bấm kỹ năng là chuyện xảy ra mỗi mười giây một lần, chặn nó là chặn nhịp.
      var st = p.state;
      if (st === 'skill' || st === 'dodge' || st === 'hurt' || st === 'switch') return false;
      this.holdCancel();
      p.skAim = { idx: idx, a: p.facing, mag: 0, dragged: false, t: this.t };
      // Khoá sẵn mục tiêu để cái vòng ngắm hiện ra ngay ở chỗ đúng, chứ không
      // nhảy một cái sau khi ngón kéo được vài pixel đầu tiên.
      var tg = this.nearestFoe(sk.aimR ? sk.aimR * 1.7 : (sk.range || sk.dist || 420));
      if (tg) p.skAim.a = Math.atan2(tg.y - p.y, tg.x - p.x);
      p.skAim.auto = tg || null;
      this.moveName = { n: sk.n, t: this.t };
      return true;
    };

    /* Ngón kéo trên nút. (dx,dy) là véc-tơ tính từ ĐIỂM ĐẶT NGÓN, không phải từ
     * tâm nút: ngón cái đặt lệch mép nút là chuyện bình thường, lấy tâm nút làm
     * gốc thì mọi cú kéo đều bị lệch sẵn một hằng số. */
    Battle.prototype.skillAimMove = function (dx, dy) {
      var p = this.player; if (!p.skAim) return;
      var d = Math.hypot(dx, dy);
      if (d < AIM_DEAD) { p.skAim.mag = 0; p.skAim.dragged = false; return; }
      p.skAim.a = Math.atan2(dy, dx);
      p.skAim.mag = clamp((d - AIM_DEAD) / (AIM_FULL - AIM_DEAD), 0, 1);
      p.skAim.dragged = true;
    };

    /* Thả ngón = xả. Không kéo thì lấy hướng tự ngắm đã khoá lúc đặt ngón, và
     * lấy TẦM ĐẦY — người không kéo là người muốn đòn đi xa nhất có thể, không
     * phải người muốn đòn rơi ngay dưới chân mình. */
    Battle.prototype.skillAimEnd = function () {
      var p = this.player, aim = p.skAim;
      if (!aim) return false;
      p.skAim = null;
      var sk = this.skillDef(aim.idx);
      if (!sk || this.skillCdLeft(aim.idx) > 0) return false;
      if (p.down || this.paused) return false;

      var kind = aimKindOf(sk);
      p.facing = aim.a;
      if (kind === 'point') {
        var R = sk.aimR || sk.range || 300;
        // Kéo hết cỡ = tầm tối đa; kéo nửa = nửa tầm. Không kéo = tầm tới đúng
        // con đang tự ngắm, kẹp trong tầm — rơi trúng đầu nó chứ không rơi sau lưng.
        var dd = aim.dragged ? R * (0.25 + 0.75 * aim.mag)
               : (aim.auto ? Math.min(R, Math.hypot(aim.auto.x - p.x, aim.auto.y - p.y)) : R);
        p.aimX = clamp(p.x + Math.cos(aim.a) * dd, 20, this.wW - 20);
        p.aimY = clamp(p.y + Math.sin(aim.a) * dd, 20, this.wH - 20);
      }
      if (sk.kind === 'blink') {
        // Chớp bám theo hướng ngón chỉ: con nào NẰM VỀ PHÍA ĐÓ, không phải con
        // gần nhất tuyệt đối. Chỉ tay sang phải mà nhảy sang trái là lỗi nặng.
        p.skTarget = this.foeToward(aim.a, sk.range || 320);
      }
      this.fireSkill(aim.idx, sk);
      return true;
    };

    /* Bỏ ngón ra ngoài nút, hoặc trận kết thúc giữa chừng. Không tốn gì cả. */
    Battle.prototype.skillAimCancel = function () {
      var p = this.player;
      if (!p.skAim) return false;
      p.skAim = null;
      return true;
    };

    Battle.prototype.skillAiming = function () {
      return this.player.skAim ? this.player.skAim.idx : -1;
    };

    /* Kẻ địch nằm gần nhất VỀ PHÍA một hướng. Chấm vô hướng nhân khoảng cách:
     * một con ở đúng hướng nhưng xa vẫn thắng một con sát nách nhưng sau lưng. */
    Battle.prototype.foeToward = function (a, range) {
      var p = this.player, best = null, bs = -1e9, cx = Math.cos(a), cy = Math.sin(a);
      var list = this.mobs.filter(function (m) { return m.hp > 0; });
      if (this.boss && this.boss.hp > 0) list.push(this.boss);
      for (var i = 0; i < list.length; i++) {
        var m = list[i], dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > (range || 1e9)) continue;
        var dot = (dx * cx + dy * cy) / d;           // 1 = đúng hướng, -1 = sau lưng
        if (dot < 0.2) continue;                      // ngoài nón ~78 độ: bỏ
        var score = dot * 2 - d / 600;
        if (score > bs) { bs = score; best = m; }
      }
      return best;
    };

    /* ------------------------------------------------------------ XẢ ------- */

    Battle.prototype.fireSkill = function (idx, sk) {
      var p = this.player;
      p.skCd[idx] = this.skillCdOf(sk);
      p.usedSkill = true;
      p.fade = 1;
      this.s.stats.skillUse = (this.s.stats.skillUse || 0) + 1;
      this.toast(sk.n, this.elemFx().col);
      /* KHÔNG gọi faceTarget() ở đây. Hướng đã được chốt ở skillAimEnd: hoặc là
       * hướng ngón kéo, hoặc — khi không kéo — là hướng con gần nhất đã khoá từ
       * lúc đặt ngón. Gọi thêm faceTarget() thì nó quay người về con gần nhất
       * TẠI THỜI ĐIỂM XẢ và ghi đè mất chỉ định của người chơi: chỉ tay lên trên
       * mà đòn bay sang ngang, vì có một con đứng sát nách. */

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
    /* TRÌNH PHÁT CHO SÁU LỚP BẮN                                           */
    /*                                                                      */
    /* Tám kind mới. Mỗi kind là một HÌNH DẠNG khác nhau trên màn hình, chứ  */
    /* không phải cùng một vùng đổi màu — đây chính là chỗ hệ Magi cũ chết:  */
    /* bốn mươi viên dùng chung ba đoạn code nên hiện lên y hệt nhau.        */
    /* ==================================================================== */

    /* --- beam: Áp Chế. Một tràng dài, toè rộng rồi THU DẦN về gần như một
     *     đường thẳng. Thưởng cho việc đứng yên, chứ không phải cho việc bấm. */
    Battle.prototype.sk_beam = function (sk, st) {
      var p = this.player;
      st.dur = sk.ticks * sk.tickMs; p.stateDur = st.dur;
      st.fired = 0; st.acc = 0;
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 40, t: 0, ms: 200, col: this.elemFx().col });
    };
    Battle.prototype.upd_beam = function (sk, st, dt) {
      var p = this.player;
      st.acc += dt;
      while (st.fired < sk.ticks && st.acc >= sk.tickMs) {
        st.acc -= sk.tickMs;
        var k = st.fired / (sk.ticks - 1);
        var cone = (sk.coneStart + (sk.coneEnd - sk.coneStart) * k) * Math.PI / 180;
        var a = p.facing + (Math.random() - 0.5) * cone;
        this.projs.push({ k: 'shot', wclass: 'rifle',
          x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, a: a,
          spd: this.W.spd * 1.15, life: this.W.life, r: this.W.r,
          mul: sk.mul / sk.ticks, critBonus: 0, pierce: false, pierceFall: 0.33, hits: 0,
          from: { x: p.x, y: p.y }, hitSet: [], fade: 0, skill: true });
        this.shake = Math.min(G.FEEL.shakeMax, this.shake + 1);
        st.fired++;
      }
      if (st.t >= st.dur) { p.state = 'lag'; p.stateT = 0; p.stateDur = 260; }
    };

    /* --- turret: Ụ Súng. Một nguồn sát thương thứ hai đứng độc lập, nên hệ
     *     số K tụt về 0,5: tiện ích chính là phần thưởng. */
    Battle.prototype.sk_turret = function (sk, st) {
      var p = this.player;
      st.dur = 380; p.stateDur = st.dur;
      this.turrets = this.turrets || [];
      this.turrets.push({ x: p.x, y: p.y, left: sk.ttlMs, cd: 0, sk: sk,
                          shotMs: 60000 / sk.rpm, shots: 0 });
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 44, t: 0, ms: 320, col: '#ffd23f' });
    };
    Battle.prototype.upd_turret = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 220; }
    };

    /* --- ring: Vòng Mảnh. 360° quanh thân, không cần ngắm.
     *     Số viên khoá ở sk.pellets = 20, đúng trần của công thức hành lang
     *     n_max = 2πd / (2·r_đạn + 2·r_người + M) ở tầm đó. Xem SHOOTER.md §5.2. */
    Battle.prototype.sk_ring = function (sk, st) {
      var p = this.player;
      st.dur = sk.ringMs + 220; p.stateDur = st.dur;
      var n = Math.min(sk.pellets, G.DANMAKU.ringMax);
      // Góc gốc NGẪU NHIÊN nhưng cấu trúc thì không: randomize hạt giống, đừng
      // bao giờ randomize cấu trúc (luật của Sparen). Có vậy mỗi lần dùng mới
      // phủ khác nhau mà vẫn đọc được là một cái vòng.
      var a0 = Math.random() * TAU;
      for (var i = 0; i < n; i++) {
        var a = a0 + i / n * TAU;
        this.projs.push({ k: 'shot', wclass: 'shotgun',
          x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, a: a,
          spd: this.W.spd * 1.2, life: sk.ringR / (this.W.spd * 1.2) * 16.67,
          r: this.W.r, mul: sk.mul / n, critBonus: 0,
          pierce: true, pierceFall: 0.30, hits: 0,
          from: { x: p.x, y: p.y }, hitSet: [], fade: 0, skill: true });
      }
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: sk.ringR, t: 0, ms: sk.ringMs, col: '#ffb45a' });
      this.impact(p.x, p.y, sk.hitstop, G.FEEL.shake.heavy, '#ffb45a');
    };
    Battle.prototype.upd_ring = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 240; }
    };

    /* --- rail: Xuyên Tuyến. Một tia xuyên hết chiều dài sân, càng xuyên nhiều
     *     con càng nặng đòn. Dùng lại đúng luật cộng dồn của sk_pierce. */
    Battle.prototype.sk_rail = function (sk, st) {
      var p = this.player, self = this;
      st.dur = 420; p.stateDur = st.dur;
      var a = p.facing, ex = p.x + Math.cos(a) * sk.len, ey = p.y + Math.sin(a) * sk.len;
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
        self.dealToMob(o.m, self.playerDamage(mul, { skill: true }),
          { move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop }, from: a, skill: true });
        self.elemBurst(o.m.x, o.m.y, mul, o.m);
        mul = Math.min(sk.mul * sk.rampMax, mul * (1 + sk.rampPerHit));
      });
      if (this.boss && this.boss.hp > 0) {
        var rx2 = this.boss.x - p.x, ry2 = this.boss.y - p.y;
        var al = rx2 * Math.cos(a) + ry2 * Math.sin(a);
        var pe = Math.abs(-rx2 * Math.sin(a) + ry2 * Math.cos(a));
        if (al > 0 && al < sk.len && pe < sk.w / 2 + this.boss.r) {
          this.dealToBoss(this.playerDamage(mul, { skill: true }),
            p.x + Math.cos(a) * al, p.y + Math.sin(a) * al, { skill: true });
        }
      }
      if (list.length > 1) this.number(ex, ey, '×' + list.length + ' XUYÊN', 'weak');
      this.elemTrail(p.x, p.y, ex, ey, 560);
      this.impact(ex, ey, sk.hitstop, G.FEEL.shake.quake, this.elemFx().col);
      if (sk.zoomPunch) this.zoomPunch = sk.zoomPunch;
    };
    Battle.prototype.upd_rail = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 300; }
    };

    /* --- mark: Điểm Danh. Kỹ năng THUẦN TIỆN ÍCH — giá trị nằm ở chỗ nó nâng
     *     mọi phát bắn sau đó, không ở con số của chính nó. Ý lấy từ Tracer
     *     Arrow của MH Wilds: đóng dấu một lần, mọi mũi sau tính như nạp đầy và
     *     KHÔNG bị trừ sát thương theo khoảng cách. */
    Battle.prototype.sk_mark = function (sk, st) {
      var p = this.player, self = this, n = 0;
      st.dur = 420; p.stateDur = st.dur;
      this.mobs.forEach(function (m) {
        if (m.hp <= 0) return;
        if (Math.hypot(m.x - p.x, m.y - p.y) > sk.markR) return;
        m.marked = self.t + sk.markMs; n++;
        self.fx.push({ k: 'ring', x: m.x, y: m.y, r: m.r + 16, t: 0, ms: 300, col: '#ff4f7a' });
      });
      if (this.boss && this.boss.hp > 0) { this.boss.marked = this.t + sk.markMs; n++; }
      this.toast('ĐÁNH DẤU ×' + n, '#ff4f7a');
      this.impact(p.x, p.y, sk.hitstop, G.FEEL.shake.mid, '#ff4f7a');
    };
    Battle.prototype.upd_mark = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 220; }
    };

    /* --- field: Trận Sấm. Một VÙNG đứng yên tại chỗ — động từ này không cây
     *     nào khác có, và đó là điểm khác thật giữa phép và súng. Sét nảy sang
     *     con bên cạnh: ba lần, −30% mỗi lần (đúng số của Hades). */
    Battle.prototype.sk_field = function (sk, st) {
      var p = this.player;
      st.dur = 420; p.stateDur = st.dur;
      var fx = clamp(p.aimX || (p.x + Math.cos(p.facing) * 120), 40, this.wW - 40);
      var fy = clamp(p.aimY || (p.y + Math.sin(p.facing) * 120), 40, this.wH - 40);
      this.fields = this.fields || [];
      this.fields.push({ x: fx, y: fy, left: sk.fieldMs, cd: 0, sk: sk });
      this.fx.push({ k: 'ring', x: fx, y: fy, r: sk.fieldR, t: 0, ms: 400, col: '#8fd4ff' });
    };
    Battle.prototype.upd_field = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 260; }
    };

    /* --- barrage: Rải Thảm. Tám quả nổ rải DẦN RA XA theo hướng nhìn, mỗi quả
     *     có bóng báo trước. Cái làm nó đọc được là ĐỘ TRỄ giữa các quả. */
    Battle.prototype.sk_barrage = function (sk, st) {
      var p = this.player;
      st.dur = sk.shells * sk.stepMs + 300; p.stateDur = st.dur;
      this.blasts = this.blasts || [];
      for (var i = 0; i < sk.shells; i++) {
        var d = (i + 1) * sk.stepPx;
        this.blasts.push({
          x: clamp(p.x + Math.cos(p.facing) * d, 20, this.wW - 20),
          y: clamp(p.y + Math.sin(p.facing) * d, 20, this.wH - 20),
          left: 260 + i * sk.stepMs, r: sk.blastR,
          dmg: sk.mul / sk.shells, sk: sk
        });
      }
    };
    Battle.prototype.upd_barrage = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 280; }
    };

    /* --- cluster: Bom Chùm. Một quả to vỡ thành mười sáu quả nhỏ. Sát thương
     *     dồn về SAU, nên nó chỉ trả công khi quả to trúng chỗ đông. */
    Battle.prototype.sk_cluster = function (sk, st) {
      var p = this.player;
      st.dur = sk.fuseMs + 420; p.stateDur = st.dur;
      var cx = clamp(p.aimX || (p.x + Math.cos(p.facing) * 200), 30, this.wW - 30);
      var cy = clamp(p.aimY || (p.y + Math.sin(p.facing) * 200), 30, this.wH - 30);
      this.blasts = this.blasts || [];
      this.blasts.push({ x: cx, y: cy, left: sk.fuseMs, r: sk.fragR * 1.6,
                         dmg: sk.mul * sk.coreFrac, sk: sk, core: true });
      var each = sk.mul * (1 - sk.coreFrac) / sk.frags;
      for (var i = 0; i < sk.frags; i++) {
        var a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * sk.spreadR;
        this.blasts.push({
          x: clamp(cx + Math.cos(a) * rr, 20, this.wW - 20),
          y: clamp(cy + Math.sin(a) * rr, 20, this.wH - 20),
          left: sk.fuseMs + 160 + Math.random() * 380, r: sk.fragR, dmg: each, sk: sk
        });
      }
      this.fx.push({ k: 'tell', x: cx, y: cy, r: sk.spreadR, t: 0, ms: sk.fuseMs, friendly: true });
    };
    Battle.prototype.upd_cluster = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 300; }
    };

    /* ==================================================================== */
    /* CẬP NHẬT MỖI KHUNG                                                   */
    /* ==================================================================== */

    /* ==================================================================== */
    /* BẢY KIND MỚI CHO BỐN LỚP MỚI                                         */
    /*                                                                      */
    /* Luật vẫn đúng một: mỗi kind là một HÌNH DẠNG khác nhau trên màn hình. */
    /* Hai kỹ năng cùng vẽ ra một vòng tròn đổi màu là hai kỹ năng thừa một. */
    /* ==================================================================== */

    /* --- rungun: Cuồng Tốc. Không gây một điểm sát thương nào.
     *
     * Cái nó bán là thứ đắt hơn sát thương: game này một ngón, nên "chạy" và
     * "bắn" là hai việc loại trừ nhau, và mọi cây súng còn kèm một hệ số phạt
     * di chuyển riêng (tia nhiệt 0,62 — chậm hơn một phần ba). Trong sáu giây,
     * đòn này xoá cả hai: chạy hết tốc, bắn hết nhịp, không phạt.
     *
     * Vì sao cho luôn +70% tốc chạy chứ không chỉ bỏ phạt: bỏ phạt thôi thì
     * người chơi KHÔNG NHÌN THẤY gì cả — họ có sẵn tốc đó lúc không bắn. Phải
     * nhanh hơn cả lúc bình thường thì mới đọc ra là "đang có buff". */
    Battle.prototype.sk_rungun = function (sk, st) {
      var p = this.player;
      st.dur = 180; p.stateDur = st.dur;
      p.buffs.push({ until: this.t + sk.ms, moveSpd: sk.spdMul - 1,
                     rof: sk.rofMul - 1, freeFire: !!sk.freeFire, tag: 'rungun' });
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 70, t: 0, ms: 420, col: '#ffd23f' });
      this.toast('CUỒNG TỐC — ' + (sk.ms / 1000) + 's', '#ffd23f');
    };
    Battle.prototype.upd_rungun = function (sk, st, dt) {
      if (st.t >= st.dur) this.player.state = 'idle';
    };

    /* --- volley: Liên Châu. Bảy viên rời nòng cách nhau 70ms, mỗi viên tự tìm
     *     một mục tiêu KHÁC NHAU.
     *
     * "Khác nhau" là toàn bộ nội dung của đòn này. Nếu cả bảy viên cùng dồn vào
     * con gần nhất thì nó chỉ là Xuyên Tuyến bắn chậm hơn. Luật phân bổ: mỗi
     * vòng chia mục tiêu chưa ai nhận; hết mục tiêu chưa nhận thì mới quay lại
     * từ đầu. Nên đứng trước bảy con thì bảy con cùng gục, đứng trước một con
     * thì cả bảy viên vào một con. */
    Battle.prototype.sk_volley = function (sk, st) {
      var p = this.player;
      st.dur = sk.shots * sk.stepMs + 260;
      p.stateDur = st.dur;
      st.fired = 0; st.next = 0; st.claimed = [];
      this.impact(p.x, p.y, 0, G.FEEL.shake.light, this.elemFx().col);
    };
    Battle.prototype.upd_volley = function (sk, st, dt) {
      var p = this.player;
      st.next -= dt;
      while (st.fired < sk.shots && st.next <= 0) {
        st.next += sk.stepMs;
        // Danh sách địch còn sống, gần nhất trước; bỏ qua ai đã bị nhận trong
        // loạt này cho tới khi mọi người đều đã có phần.
        var list = this.mobs.filter(function (m) { return m.hp > 0; });
        if (this.boss && this.boss.hp > 0) list.push(this.boss);
        var self = this;
        list.sort(function (a, b) { return dist(a, p) - dist(b, p); });
        var free = list.filter(function (m) { return st.claimed.indexOf(m) < 0; });
        if (!free.length) { st.claimed = []; free = list; }
        var tg = free[0];
        var a = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.facing;
        if (tg) st.claimed.push(tg);
        this.projs.push({ k: 'shot', wclass: 'sniper',
          x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, a: a,
          spd: sk.spd, life: sk.seekR / sk.spd * 16.67, r: sk.r,
          mul: sk.mul / sk.shots, critBonus: 0.15,
          pierce: !!sk.pierce, pierceFall: 0.33, hits: 0, homing: 4.5,
          from: { x: p.x, y: p.y }, hitSet: [], fade: 0, skill: true });
        this.kickX = (this.kickX || 0) - Math.cos(a) * 6;
        this.kickY = (this.kickY || 0) - Math.sin(a) * 6;
        st.fired++;
      }
      if (st.t >= st.dur) { p.state = 'lag'; p.stateT = 0; p.stateDur = 200; }
    };

    /* --- aegis: Khiên Ảo. Một túi máu ảo, và một cú nổ lúc nó vỡ.
     *
     * Toàn bộ sát thương của đòn nằm ở CÚ NỔ, không ở lúc bấm. Nghĩa là bấm cho
     * có thì chỉ được cái khiên; chỉ khi khiên thật sự ăn đủ đòn (hoặc hết giờ)
     * mới ra được cú nổ. Điều đó biến nó thành đòn của người biết bấm ĐÚNG LÚC
     * bị vây, chứ không phải đòn bấm mỗi khi nút sáng.
     *
     * Không làm "miễn nhiễm tuyệt đối" như Paladin's Energy Shield của Soul
     * Knight (4 giây, hồi 12s): miễn nhiễm xoá luôn việc phải né trong suốt
     * quãng đó, mà né là toàn bộ nội dung của game này. */
    Battle.prototype.sk_aegis = function (sk, st) {
      var p = this.player;
      st.dur = 260; p.stateDur = st.dur;
      p.shield = (p.shield || 0) + p.maxHp * sk.shieldFrac;
      this.aegis = { left: sk.ms, sk: sk };
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 60, t: 0, ms: 420, col: '#7fd4ff' });
      this.toast('KHIÊN ẢO', '#7fd4ff');
    };
    Battle.prototype.upd_aegis = function (sk, st, dt) {
      if (st.t >= st.dur) this.player.state = 'idle';
    };
    // Vỡ khiên — gọi mỗi khung từ vòng lặp kỹ năng.
    Battle.prototype.tickAegis = function (dt) {
      var ae = this.aegis; if (!ae) return;
      var p = this.player;
      ae.left -= dt;
      if (ae.left > 0 && p.shield > 0.5) return;
      this.aegis = null;
      p.shield = 0;
      this.aoeDamage(p.x, p.y, ae.sk.popR, ae.sk.mul,
        { move: { kb: ae.sk.kb, poise: ae.sk.poise, hs: ae.sk.hitstop }, skill: true });
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: ae.sk.popR, t: 0, ms: 380, col: '#7fd4ff' });
      this.impact(p.x, p.y, ae.sk.hitstop, ae.sk.shake || G.FEEL.shake.mid, '#7fd4ff');
    };

    /* --- drones: Bầy Vệ Tinh. Bốn con xếp vòng quanh người và tự bắn.
     *
     * Khác Ụ Súng ở đúng một điểm, và điểm đó quyết định lớp nào được cầm nó: ụ
     * súng CẮM XUỐNG ĐẤT, drone BAY THEO NGƯỜI. Tia Nhiệt là lớp bị phạt di
     * chuyển nặng nhất game (0,62), nên nó cần một nguồn sát thương không quan
     * tâm nó đang đứng hay đang chạy. */
    Battle.prototype.sk_drones = function (sk, st) {
      var p = this.player;
      st.dur = 320; p.stateDur = st.dur;
      this.drones = this.drones || [];
      for (var i = 0; i < sk.drones; i++) {
        this.drones.push({ ang: i / sk.drones * TAU, left: sk.ttlMs, cd: i * 90,
                           sk: sk, shotMs: 60000 / sk.rpm, x: p.x, y: p.y });
      }
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: sk.orbitR + 20, t: 0, ms: 420, col: '#6fd4ff' });
    };
    Battle.prototype.upd_drones = function (sk, st, dt) {
      if (st.t >= st.dur) this.player.state = 'idle';
    };
    Battle.prototype.tickDrones = function (dt) {
      if (!this.drones || !this.drones.length) return;
      var p = this.player;
      for (var i = this.drones.length - 1; i >= 0; i--) {
        var d = this.drones[i];
        d.left -= dt; d.cd -= dt;
        if (d.left <= 0) {
          this.fx.push({ k: 'ring', x: d.x, y: d.y, r: 22, t: 0, ms: 220, col: '#6fd4ff' });
          this.drones.splice(i, 1); continue;
        }
        d.ang += dt / 1000 * 1.1;
        d.x = p.x + Math.cos(d.ang) * d.sk.orbitR;
        d.y = p.y + Math.sin(d.ang) * d.sk.orbitR - 12;
        if (d.cd > 0) continue;
        var tg = this.nearestHostile(d.x, d.y, d.sk.droneRange);
        if (!tg) continue;
        d.cd = d.shotMs;
        var a = Math.atan2(tg.y - d.y, tg.x - d.x);
        // Tổng chia đều cho số phát CẢ ĐÀN kịp bắn trong đời chúng, nên thêm
        // drone không tự nhân sát thương lên — nó chỉ rải ra rộng hơn.
        var total = Math.max(1, Math.round(d.sk.ttlMs / d.shotMs) * d.sk.drones);
        this.projs.push({ k: 'shot', wclass: 'laser',
          x: d.x + Math.cos(a) * 8, y: d.y + Math.sin(a) * 8, a: a,
          spd: 11, life: 800, r: 5, mul: d.sk.mul / total, critBonus: 0,
          pierce: false, pierceFall: 0.33, hits: 0,
          from: { x: d.x, y: d.y }, hitSet: [], fade: 0, skill: true });
      }
    };

    /* --- sweep: Lăng Kính. Một tia dày quét một cung trong gần một giây.
     *
     * Vì sao quét CHẬM: một tia quét nhanh thì không né được, và một đòn không
     * né được ở tầm 340px là một đòn xoá sổ mọi quyết định. Quét trong 900ms thì
     * quái ở rìa cung có thời gian chạy ra — và người chơi phải chọn quét từ
     * bên nào, tức là đòn này có một quyết định thật bên trong nó. */
    Battle.prototype.sk_sweep = function (sk, st) {
      var p = this.player;
      st.dur = sk.ms + 200; p.stateDur = st.dur;
      st.a0 = p.facing - sk.arc / 2;
      st.next = 0; st.done = 0;
      st.hitAt = [];
      this.impact(p.x, p.y, 0, sk.shake || G.FEEL.shake.mid, this.elemFx().col);
    };
    Battle.prototype.upd_sweep = function (sk, st, dt) {
      var p = this.player, self = this;
      var k = clamp(st.t / sk.ms, 0, 1);
      st.a = st.a0 + sk.arc * k;
      if (st.t <= sk.ms) {
        st.next -= dt;
        if (st.next <= 0) {
          st.next += sk.ms / sk.ticks;
          st.done++;
          var per = sk.mul / sk.ticks;
          var ca = Math.cos(st.a), sa = Math.sin(st.a), hw = sk.w / 2;
          var opt = { from: st.a, skill: true,
                      move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop } };
          var list = this.mobs.filter(function (m) { return m.hp > 0; });
          list.forEach(function (m) {
            var dx = m.x - p.x, dy = m.y - p.y;
            var t = dx * ca + dy * sa;
            if (t < 0 || t > sk.len) return;
            if (Math.hypot(dx - ca * t, dy - sa * t) > m.r + hw) return;
            self.dealToMob(m, self.playerDamage(per), opt);
          });
          var b = this.boss;
          if (b && b.hp > 0) {
            var bx = b.x - p.x, by = b.y - p.y, tb = bx * ca + by * sa;
            if (tb >= 0 && tb <= sk.len &&
                Math.hypot(bx - ca * tb, by - sa * tb) < b.r + hw) {
              this.dealToBoss(this.playerDamage(per), p.x + ca * tb, p.y + sa * tb, opt);
            }
          }
        }
        this.fx.push({ k: 'beam', x: p.x, y: p.y, a: st.a, len: sk.len, w: sk.w,
                       t: 0, ms: 60, ramp: 1.4, col: this.elemFx().col });
      }
      if (st.t >= st.dur) { p.state = 'lag'; p.stateT = 0; p.stateDur = 220; }
    };

    /* --- bigslash: Trảm Thiên. Một nhát duy nhất, rộng 150px, đi CHẬM.
     *
     * Đi chậm là cố ý và là toàn bộ cảm giác của đòn: nó cho cả người chơi lẫn
     * quái nhìn thấy cái tường đang tới. Một nhát to mà bay nhanh thì nó biến
     * mất trước khi mắt kịp đăng ký, và cả 324 điểm sát thương xảy ra trong một
     * khung hình không ai thấy. */
    Battle.prototype.sk_bigslash = function (sk, st) {
      var p = this.player;
      st.dur = sk.ms + 220; p.stateDur = st.dur;
      this.projs.push({ k: 'shot', wclass: 'blade',
        x: p.x + Math.cos(p.facing) * 20, y: p.y + Math.sin(p.facing) * 20,
        a: p.facing, spd: sk.speed, life: sk.len / sk.speed * 16.67,
        r: sk.waveW / 2, wave: true, waveW: sk.waveW,
        mul: sk.mul, critBonus: 0,
        pierce: true, pierceFall: sk.pierceFall || 0.10, hits: 0,
        from: { x: p.x, y: p.y }, hitSet: [], fade: 0, skill: true,
        move: { kb: sk.kb, poise: sk.poise, hs: sk.hitstop } });
      this.slashFx(2.6, 120, this.elemFx().col, true);
      this.impact(p.x, p.y, sk.hitstop, sk.shake || G.FEEL.shake.heavy, this.elemFx().col);
      if (sk.zoomPunch) this.zoomPunch = sk.zoomPunch;
      if (sk.trail) this.elemTrail(p.x, p.y,
        p.x + Math.cos(p.facing) * sk.len, p.y + Math.sin(p.facing) * sk.len, 700);
    };
    Battle.prototype.upd_bigslash = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 260; }
    };

    /* --- meteor: Thiên Thạch. Một khối rơi xuống ĐIỂM đã chỉ, sau một nhịp chờ.
     *
     * Nhịp chờ 850ms là dài nhất trong mọi đòn của game, và nó là một lời hứa
     * hai chiều: quái có thời gian chạy ra khỏi vòng, nên đòn này KHÔNG phải để
     * ném vào chỗ chúng đang đứng — nó để ném vào chỗ chúng SẼ đứng, hoặc vào
     * chỗ chúng không thể rời (một con boss đang trong pha cứng đòn).
     *
     * Hai vòng sát thương, không phải một: lõi 62% trong bán kính 110, sóng xung
     * kích 38% trong bán kính 190. Đứng rìa vẫn ăn, nhưng ăn ít — đó là cái làm
     * cho việc chạy ra rìa là một hành động có nghĩa chứ không phải nhị phân. */
    Battle.prototype.sk_meteor = function (sk, st) {
      var p = this.player;
      st.dur = 420; p.stateDur = st.dur;
      var zx = clamp(p.aimX || (p.x + Math.cos(p.facing) * sk.aimR), 30, this.wW - 30);
      var zy = clamp(p.aimY || (p.y + Math.sin(p.facing) * sk.aimR), 30, this.wH - 30);
      this.meteors = this.meteors || [];
      this.meteors.push({ x: zx, y: zy, left: sk.delayMs, sk: sk });
      this.fx.push({ k: 'tell', x: zx, y: zy, r: sk.zoneR, t: 0, ms: sk.delayMs, friendly: true });
    };
    Battle.prototype.upd_meteor = function (sk, st, dt) {
      if (st.t >= st.dur) { this.player.state = 'lag'; this.player.stateT = 0; this.player.stateDur = 220; }
    };
    Battle.prototype.tickMeteors = function (dt) {
      if (!this.meteors || !this.meteors.length) return;
      for (var i = this.meteors.length - 1; i >= 0; i--) {
        var m = this.meteors[i];
        m.left -= dt;
        if (m.left > 0) continue;
        var sk = m.sk;
        var mv = { kb: sk.kb, poise: sk.poise, hs: sk.hitstop };
        this.aoeDamage(m.x, m.y, sk.zoneR, sk.mul * sk.coreFrac, { move: mv, skill: true });
        this.aoeDamage(m.x, m.y, sk.ringR, sk.mul * sk.ringFrac, { move: mv, skill: true });
        this.fx.push({ k: 'ring', x: m.x, y: m.y, r: sk.zoneR, t: 0, ms: 340, col: '#ffb45a' });
        this.fx.push({ k: 'ring', x: m.x, y: m.y, r: sk.ringR, t: 0, ms: 520, col: '#ff7a3c' });
        this.impact(m.x, m.y, sk.hitstop, sk.shake || G.FEEL.shake.quake, '#ffb45a');
        this.meteors.splice(i, 1);
      }
    };

    Battle.prototype.updateSkills = function (dt) {
      var p = this.player, self = this;

      // hồi chiêu
      if (!p.skCd) p.skCd = [0, 0];
      for (var i = 0; i < p.skCd.length; i++) if (p.skCd[i] > 0) p.skCd[i] = Math.max(0, p.skCd[i] - dt);

      // hết thời gian ẩn thân
      if (p.fadeUntil && this.t > p.fadeUntil) { p.fadeUntil = 0; p.fade = 1; }
      if (!p.fadeUntil) p.fade = 1;

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
      /* Ụ SÚNG. Nó tự tìm mục tiêu gần nhất và bắn theo nhịp riêng — một nguồn
       * sát thương thứ hai chạy song song, không phụ thuộc người chơi đang làm gì. */
      if (this.turrets && this.turrets.length) {
        for (var tt = this.turrets.length - 1; tt >= 0; tt--) {
          var tu = this.turrets[tt];
          tu.left -= dt; tu.cd -= dt;
          if (tu.left <= 0) {
            this.fx.push({ k: 'ring', x: tu.x, y: tu.y, r: 30, t: 0, ms: 240, col: '#8fa3b5' });
            this.turrets.splice(tt, 1); continue;
          }
          if (tu.cd <= 0) {
            var tgt = this.nearestHostile(tu.x, tu.y, tu.sk.turretRange);
            if (tgt) {
              tu.cd = tu.shotMs;
              var ta = Math.atan2(tgt.y - tu.y, tgt.x - tu.x);
              // Tổng sát thương chia đều cho số phát nó kịp bắn trong đời nó.
              var total = Math.max(1, Math.round(tu.sk.ttlMs / tu.shotMs));
              this.projs.push({ k: 'shot', wclass: 'rifle',
                x: tu.x + Math.cos(ta) * 12, y: tu.y + Math.sin(ta) * 12, a: ta,
                spd: this.W.spd, life: 900, r: 6,
                mul: tu.sk.mul / total, critBonus: 0, pierce: false, pierceFall: 0.33, hits: 0,
                from: { x: tu.x, y: tu.y }, hitSet: [], fade: 0, skill: true });
            }
          }
        }
      }

      /* TRẬN SẤM. Một vùng đứng yên tại chỗ, đánh theo nhịp, và mỗi cú đánh nảy
       * sang tối đa ba con bên cạnh với −30% mỗi lần nảy (đúng số của Hades). */
      if (this.fields && this.fields.length) {
        for (var fd = this.fields.length - 1; fd >= 0; fd--) {
          var fi = this.fields[fd];
          fi.left -= dt; fi.cd -= dt;
          if (fi.left <= 0) { this.fields.splice(fd, 1); continue; }
          if (fi.cd <= 0) {
            fi.cd = fi.sk.tickMs;
            var ticks = Math.max(1, Math.round(fi.sk.fieldMs / fi.sk.tickMs));
            var per = fi.sk.mul / ticks;
            var hitInField = [];
            var selfB = this;
            this.mobs.forEach(function (m) {
              if (m.hp <= 0) return;
              if (Math.hypot(m.x - fi.x, m.y - fi.y) > fi.sk.fieldR + m.r) return;
              hitInField.push(m);
              selfB.dealToMob(m, selfB.playerDamage(per, { skill: true }),
                { move: { kb: fi.sk.kb, poise: fi.sk.poise, hs: fi.sk.hitstop }, skill: true });
            });
            if (this.boss && this.boss.hp > 0 &&
                Math.hypot(this.boss.x - fi.x, this.boss.y - fi.y) < fi.sk.fieldR + this.boss.r) {
              this.dealToBoss(this.playerDamage(per, { skill: true }), this.boss.x, this.boss.y, { skill: true });
            }
            // Sét nảy: từ mỗi con đã trúng, tìm con GẦN NHẤT chưa trúng.
            hitInField.forEach(function (src) {
              var cur = src, dmg = per;
              for (var c = 0; c < fi.sk.chain; c++) {
                dmg *= (1 - fi.sk.chainFall);
                var nx = null, nd = fi.sk.chainR;
                selfB.mobs.forEach(function (m2) {
                  if (m2.hp <= 0 || hitInField.indexOf(m2) >= 0) return;
                  var dd = Math.hypot(m2.x - cur.x, m2.y - cur.y);
                  if (dd < nd) { nd = dd; nx = m2; }
                });
                if (!nx) break;
                hitInField.push(nx);
                selfB.dealToMob(nx, selfB.playerDamage(dmg, { skill: true }), { skill: true });
                selfB.fx.push({ k: 'spark', x: nx.x, y: nx.y, t: 0, ms: 160, col: '#8fd4ff' });
                cur = nx;
              }
            });
          }
        }
      }

      /* NỔ CÓ HẸN GIỜ — dùng chung cho Rải Thảm và Bom Chùm. Bóng báo trước là
       * bắt buộc: một quả nổ không báo trước là sát thương không né được. */
      if (this.blasts && this.blasts.length) {
        for (var bl = this.blasts.length - 1; bl >= 0; bl--) {
          var bo = this.blasts[bl];
          if (!bo.told) {
            bo.told = true;
            this.fx.push({ k: 'tell', x: bo.x, y: bo.y, r: bo.r, t: 0, ms: Math.max(60, bo.left), friendly: true });
          }
          bo.left -= dt;
          if (bo.left <= 0) {
            this.aoeDamage(bo.x, bo.y, bo.r, bo.dmg,
              { move: { kb: bo.sk.kb, poise: bo.sk.poise, hs: bo.sk.hitstop }, skill: true, noCrit: true });
            this.fx.push({ k: 'ring', x: bo.x, y: bo.y, r: bo.r, t: 0, ms: 300, col: '#ffb45a' });
            this.shake = Math.min(G.FEEL.shakeMax, this.shake + (bo.core ? 6 : 2));
            this.blasts.splice(bl, 1);
          }
        }
      }

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

      // Ba nguồn mới chạy song song với người chơi: bầy drone bay theo, khối
      // thiên thạch đang rơi, và cái khiên đang đếm ngược tới lúc vỡ.
      this.tickDrones(dt);
      this.tickMeteors(dt);
      this.tickAegis(dt);

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

      // Ụ SÚNG: thân vuông + nòng quay theo mục tiêu, và một vòng đếm ngược cho
      // biết nó còn sống bao lâu — người chơi phải thấy được cái đó để canh.
      (this.turrets || []).forEach(function (t) {
        var k = t.left / t.sk.ttlMs;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.fillStyle = 'rgba(20,26,34,.9)';
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(-9, -9, 18, 18); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
        ctx.restore();
      });

      // TRẬN SẤM: vùng đứng yên, viền nhấp nháy theo nhịp đánh.
      (this.fields || []).forEach(function (f) {
        var pulse = 0.5 + 0.5 * Math.sin(f.left / 90);
        ctx.save();
        ctx.globalAlpha = 0.14 + 0.10 * pulse;
        ctx.fillStyle = '#8fd4ff';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.sk.fieldR, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.55 + 0.35 * pulse;
        ctx.strokeStyle = '#8fd4ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.sk.fieldR, 0, TAU); ctx.stroke();
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
            weapon: self.wp ? self.wp.wclass : 'rifle', elem: '#c9a8ff',
            el: self.wp ? self.wp.el : 'none' });
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

    /* ================================================== VẼ LỚP NGẮM ========
     * Cái người chơi nhìn trong lúc ngón đang chỉ hướng. Ba dáng, ba hình:
     *   'dir'   một mũi tên dài đúng tầm của đòn
     *   'point' một vòng ở chỗ đòn sẽ rơi, kèm sợi chỉ nối từ chân tới đó
     *   'self'  một vòng quanh thân, vì đòn nổ ngay tại chỗ
     * Màu VÀNG, không phải đỏ: đỏ trong game này đã có nghĩa "vùng quái sắp đánh",
     * dùng lại nó cho vùng của chính mình là dạy người chơi sai một thứ đắt.
     * ==================================================================== */
    Battle.prototype.drawSkillAim = function (ox, oy) {
      var p = this.player, ctx = this.ctx, aim = p.skAim;
      if (!aim) return;
      var sk = this.skillDef(aim.idx); if (!sk) return;
      var kind = aimKindOf(sk);
      var pulse = 0.62 + 0.38 * Math.abs(Math.sin(this.t / 150));

      ctx.save(); ctx.translate(ox, oy);
      ctx.lineCap = 'round';

      // Vòng dưới chân: nói "đang ở thế ngắm", và nó là chỗ neo mắt.
      ctx.globalAlpha = 0.55 * pulse;
      ctx.strokeStyle = '#ffe74c'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, 28, 11, 0, 0, TAU); ctx.stroke();

      if (kind === 'self') {
        var rS = sk.ringR || sk.radius || sk.fieldR || 150;
        ctx.globalAlpha = 0.13;
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath(); ctx.arc(p.x, p.y, rS, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.75; ctx.lineWidth = 2;
        ctx.setLineDash([9, 6]); ctx.lineDashOffset = -this.t / 22;
        ctx.beginPath(); ctx.arc(p.x, p.y, rS, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);

      } else if (kind === 'point') {
        var R = sk.aimR || sk.range || 300;
        var dd = aim.dragged ? R * (0.25 + 0.75 * aim.mag)
               : (aim.auto ? Math.min(R, Math.hypot(aim.auto.x - p.x, aim.auto.y - p.y)) : R);
        var tx = clamp(p.x + Math.cos(aim.a) * dd, 20, this.wW - 20);
        var ty = clamp(p.y + Math.sin(aim.a) * dd, 20, this.wH - 20);
        var r2 = sk.zoneR || sk.blastR || sk.pullR || sk.fragR || 80;
        // Vành tầm tối đa: cho biết kéo hết cỡ thì tới đâu, nên không phải mò.
        ctx.globalAlpha = 0.20; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 8]);
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath(); ctx.arc(tx, ty, r2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.85 * pulse; ctx.lineWidth = 2.5;
        ctx.setLineDash([9, 6]); ctx.lineDashOffset = -this.t / 22;
        ctx.beginPath(); ctx.arc(tx, ty, r2, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        // Chữ thập giữa vòng: tâm ở đâu thì mắt biết ngay, không phải ước lượng.
        ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx - 9, ty); ctx.lineTo(tx + 9, ty);
        ctx.moveTo(tx, ty - 9); ctx.lineTo(tx, ty + 9);
        ctx.stroke();

      } else {
        var L = sk.len || sk.dist || sk.waveLen || sk.reach || sk.range || 320;
        var w2 = sk.w || sk.waveW || sk.arcW || 46;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(aim.a);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(0, -w2 / 2, L, w2);
        ctx.globalAlpha = 0.8 * pulse; ctx.strokeStyle = '#ffe74c'; ctx.lineWidth = 2;
        ctx.strokeRect(0, -w2 / 2, L, w2);
        // Đầu mũi tên ở cuối: nó là cái nói "hướng này", chứ một hình chữ nhật
        // thì hai đầu trông giống hệt nhau.
        ctx.globalAlpha = 0.95; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(L - 18, -13); ctx.lineTo(L, 0); ctx.lineTo(L - 18, 13);
        ctx.stroke();
        ctx.restore();
      }

      // Đòn chớp: chấm rõ chỗ sắp hiện ra. Không có nó thì người chơi bấm xong
      // mới biết mình vừa nhảy đi đâu, mà lúc đó thì đã muộn.
      if (sk.kind === 'blink') {
        var tg = this.foeToward(aim.a, sk.range || 320);
        if (tg) {
          var back = (tg.facing || 0) + Math.PI, off = (tg.r || 20) + 26;
          var bx = tg.x + Math.cos(back) * off, by = tg.y + Math.sin(back) * off;
          ctx.globalAlpha = 0.9; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(bx, by, 16, 0, TAU); ctx.stroke();
        }
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
