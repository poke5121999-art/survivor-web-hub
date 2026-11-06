// Lớp vẽ: một cá mập. Thân 3D bỏ AI (js/engine/shark.js) đặt theo (x, y, ang, face) của actor mỗi khung;
// clip theo st: swim / sprint (tăng tốc) / attack (lunge) / hold / stun / die (out). Đổi hướng mặt thì chạy SwimTurn gốc.
// Cỡ: nửa bề cao khung bao của mô hình khớp bán kính va chạm r của loài (kẹp để loài không méo quá xa bản gốc).
(function (VS) {
  'use strict';
  var HX = window.HX;
  var TURN_RATE = 2.6;     // SwimTurn gốc 1,33 giây; người chơi đổi hướng liên tục nên quay nhanh hơn
  var MAX_UP = 1.1;        // rad, ngóc/chúi tối đa
  var Z = -0.9;            // thân dày ±0,8 m theo z: lùi sau mặt chơi để thợ lặn và mũi xiên luôn vẽ trước

  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  // Cỡ gốc cho loài: r / nửa bề cao khung bao, kẹp 0,8..1,5.
  function baseSize(id) {
    var rec = HX.Shark.BY_ID[id], def = VS.SHARKS[id];
    if (!rec || !def) return 1;
    var hh = (rec.bounds[3] - rec.bounds[1]) / 2;
    return Math.max(0.8, Math.min(1.5, def.r / hh));
  }

  function SharkView(G, a) {
    this.G = G; this.id = a.id; this.defId = a.defId;
    this.def = VS.SHARKS[a.defId] || { r: 1, speed: 4 };
    this.body = new HX.Shark.Body(G, a.defId);
    this.base = baseSize(a.defId);
    this.up = 0; this.lastSt = null; this.stT = 0; this.flashT = 0; this.alpha = 1; this.visible = false;
    this.tag = makeTag(G, a);
  }
  function makeTag(G, a) {
    var el = document.createElement('div');
    el.className = 'vs-hud-tag shark';
    el.innerHTML = '<b></b><i><s></s></i>';
    el.querySelector('b').textContent = a.name || '';
    el.hidden = true;
    G.tags.appendChild(el);
    return { el: el, bar: el.querySelector('s'), k: -1, cls: '' };
  }

  SharkView.prototype.hurt = function () { this.flashT = 0.15; };

  function hasEffect(a, kind, t) {
    var e = a.effects;
    if (!e) return false;
    for (var i = 0; i < e.length; i++) if (e[i].kind === kind && (e[i].until == null || e[i].until > t)) return true;
    return false;
  }

  // ctx: { visible, mate, self, t, mt (giờ trận), toScreen(x, y) }
  SharkView.prototype.update = function (a, dt, ctx) {
    var b = this.body, st = a.st || 'swim';
    if (st !== this.lastSt) { this.enter(st, this.lastSt); this.lastSt = st; this.stT = 0; }
    this.stT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    // hết clip chết thì mờ dần rồi ẩn (cá mập hồi sinh ở chỗ khác)
    var gone = false;
    if (st === 'out') {
      var dieLen = b.clipLen('die') || 3;
      this.alpha = Math.max(0, 1 - Math.max(0, this.stT - dieLen) / 0.6);
      gone = this.alpha <= 0;
    } else this.alpha = Math.min(1, this.alpha + dt * 3);
    var show = ctx.visible && !gone;
    this.visible = show;
    if (!show) { b.update(dt, false); this.tagHide(); return; }
    var vx = a.vx || 0, vy = a.vy || 0, sp = Math.hypot(vx, vy);
    var head = a.ang != null ? a.ang : (sp > 0.2 ? Math.atan2(vy, vx) : (b.facing > 0 ? 0 : Math.PI));
    var face = a.face || (Math.cos(head) < 0 ? -1 : 1);
    if (st !== 'out' && st !== 'stun') b.face(face, TURN_RATE);
    // góc ngóc mũi so với phương ngang theo hướng mặt đang hiện
    var up = b.facing > 0 ? wrap(head) : wrap(Math.PI - head);
    if (st === 'out' || st === 'stun' || Math.abs(up) > Math.PI / 2) up = 0;
    up = Math.max(-MAX_UP, Math.min(MAX_UP, up));
    this.up += (up - this.up) * Math.min(1, dt * 6);
    if (st === 'swim') {
      var it = a.intent || {}, boost = (it.boost && sp > this.def.speed * 0.9) || sp > this.def.speed * 1.15;
      if (boost) b.play('sprint', { speed: 1.15, fade: 0.25 });
      else b.play('swim', { speed: 0.7 + Math.min(1, sp / this.def.speed) * 0.6, fade: 0.3 });
    }
    b.setFrozenAnim(hasEffect(a, 'sleep', ctx.mt));
    // Lách Khe: hiệu ứng shrink nhân bán kính (a.r giữ bán kính gốc của loài)
    var shrink = 1, ef = a.effects || [];
    for (var i = 0; i < ef.length; i++) if (ef[i].kind === 'shrink' && (ef[i].until == null || ef[i].until > ctx.mt)) shrink = Math.min(shrink, ef[i].mag || 1);
    var size = this.base * shrink;
    b.pose(a.x, a.y, Z * size, this.up, size);
    var stun = st === 'stun' && Math.floor(ctx.t * 10) % 2 === 0;
    b.fu.flash.value = this.flashT > 0 ? 0.6 : stun ? 0.35 : 0;
    // Ẩn Đáy: đồng đội vẫn thấy nhưng mờ (đối thủ thì canSee đã giấu hẳn)
    var stealth = hasEffect(a, 'stealth', ctx.mt);
    b.fu.opacity.value = this.alpha * (stealth ? 0.4 : 1);
    var fade = this.alpha < 1 || stealth;
    if (fade !== this.fading) {
      this.fading = fade;
      b.root.traverse(function (o) { if (o.isMesh) { o.material.transparent = fade; o.material.depthWrite = !fade; } });
    }
    b.vol = ctx.vol == null ? 1 : ctx.vol;
    b.update(dt, true);
    this.tagUpdate(a, ctx);
  };

  SharkView.prototype.enter = function (st) {
    var b = this.body;
    if (st === 'lunge') b.play('attack', { once: true, restart: true, force: true, speed: 1.6, fade: 0.08 });
    else if (st === 'hold') b.play('hold', { force: true, fade: 0.15 });
    else if (st === 'stun') b.play('stun', { once: true, restart: true, force: true, fade: 0.1 });
    else if (st === 'out') b.play('die', { once: true, restart: true, force: true, fade: 0.15 });
    else if (st === 'swim') b.play('swim', { fade: 0.3, force: true });
  };

  SharkView.prototype.tagUpdate = function (a, ctx) {
    var tg = this.tag, el = tg.el;
    if (ctx.self || a.st === 'out') { this.tagHide(); return; }
    var cls = 'vs-hud-tag shark ' + (ctx.mate ? 'mate' : 'foe');
    if (cls !== tg.cls) { tg.cls = cls; el.className = cls; }
    var b = this.body, s = ctx.toScreen(a.x, a.y + b.halfH * b.size + 0.35);
    var on = s.x > -80 && s.x < innerWidth + 80 && s.y > -40 && s.y < innerHeight + 60;
    if (el.hidden === on) el.hidden = !on;
    if (!on) return;
    el.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px) translate(-50%,-100%)';
    var k = a.hpMax ? Math.max(0, Math.min(100, Math.round(a.hp / a.hpMax * 100))) : 100;
    if (k !== tg.k) { tg.k = k; tg.bar.style.width = k + '%'; }
  };
  SharkView.prototype.tagHide = function () { if (!this.tag.el.hidden) this.tag.el.hidden = true; };

  // Khung bao trên màn hình (px CSS) của thân cá theo tư thế hiện tại (8 góc khung bao 3D chiếu lên màn).
  SharkView.prototype.screenBox = function (cam) {
    var box = new THREE.Box3().setFromObject(this.body.root), v = new THREE.Vector3();
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      var sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  };

  SharkView.prototype.dispose = function () {
    this.body.remove();
    this.tag.el.remove();
  };

  VS.SharkView = SharkView;
  VS.SharkView.baseSize = baseSize;
})(window.VS = window.VS || {});
