// Battlefield renderer: bg, bases, sprite units, HP, and a VFX particle layer.
// VFX is fed by sim.fx events (hit, death, coin, deploy, cannon, baseHit); it never
// touches simulation state. Uses BCSprite.
(function (root) {
  'use strict';

  function Renderer(canvas, assets) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;        // {bg, catbase, models:{key:{model,sheet}}}
    this.zoom = 0.5;
    this.groundFrac = 0.82;      // ground line as fraction of canvas height
    this.camX = 0;
    this.parts = [];             // VFX particles
    this.shake = 0;              // screen-shake frames remaining
    this.flash = 0;             // full-screen white flash (cannon), 0..1
    this.sweep = null;          // cannon beam sweep {x0,x1,t}
    this.baseShake = { cat: 0, enemy: 0 };
  }

  Renderer.prototype.unitKey = function (u) { return (u.id != null ? String(u.id).padStart(3, '0') : '000') + '_' + (u.form || 'f'); };

  Renderer.prototype.updateCamera = function (sim) {
    var W = this.cv.width / (window.devicePixelRatio || 1);
    var front = 300;
    for (var i = 0; i < sim.units.length; i++) {
      var u = sim.units[i];
      if (u.side === 'cat') front = Math.max(front, u.x);
    }
    // keep frontline ~60% across
    var target = front - (W * 0.55) / this.zoom;
    target = Math.max(0, Math.min(target, sim.stage.length - W / this.zoom + 120));
    this.camX += (target - this.camX) * 0.1;
    if (this.camX < 0) this.camX = 0;
  };

  Renderer.prototype.wx = function (worldX) {
    return (worldX - this.camX) * this.zoom;
  };

  // ---- VFX: drain sim events into particles -----------------------------------
  Renderer.prototype.drainFx = function (sim) {
    if (!sim.fx || !sim.fx.length) return;
    for (var i = 0; i < sim.fx.length; i++) this.spawnFx(sim.fx[i]);
    sim.fx.length = 0;
  };

  Renderer.prototype.spawnFx = function (ev) {
    var P = this.parts, n, a;
    if (ev.t === 'hit') {
      // impact star + a few sparks at the contact point, slightly above ground
      P.push({ k: 'star', x: ev.x, dy: 40, life: 7, max: 7, r: ev.area ? 26 : 18 });
      n = ev.area ? 7 : 4;
      for (var s = 0; s < n; s++) {
        a = Math.random() * 6.283;
        P.push({ k: 'spark', x: ev.x, dy: 40, vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4 - 1,
                 life: 10 + Math.random() * 6, max: 16, col: ev.side === 'cat' ? '#fff0b0' : '#ffd0d0' });
      }
    } else if (ev.t === 'death') {
      n = ev.boss ? 11 : 6;
      for (var d = 0; d < n; d++) {
        a = Math.random() * 6.283; var sp = 0.6 + Math.random() * 1.6;
        P.push({ k: 'smoke', x: ev.x + (Math.random() - 0.5) * 20, dy: 10 + Math.random() * 40,
                 vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 1.2,
                 r: (ev.boss ? 16 : 10) + Math.random() * 10, life: 26 + Math.random() * 14, max: 40 });
      }
      if (ev.boss) { this.shake = Math.max(this.shake, 14); }
    } else if (ev.t === 'coin') {
      a = Math.min(999, ev.amount || 0);
      P.push({ k: 'coin', x: ev.x, dy: 60, vy: 1.7, life: 34, max: 34, txt: '+' + a });
    } else if (ev.t === 'deploy') {
      for (var g = 0; g < 7; g++) {
        var ang = (g / 7) * Math.PI - Math.PI;   // upper arc
        P.push({ k: 'dust', x: ev.x + (Math.random() - 0.5) * 14, dy: 2,
                 vx: Math.cos(ang) * (1.2 + Math.random()), vy: -(0.6 + Math.random() * 1.2),
                 r: 5 + Math.random() * 5, life: 16, max: 16 });
      }
      P.push({ k: 'ring', x: ev.x, dy: 4, r: 6, life: 14, max: 14 });
    } else if (ev.t === 'cannon') {
      this.flash = 0.45; this.shake = Math.max(this.shake, 12);
      this.sweep = { x0: ev.x0, x1: ev.x1, t: 0, max: 22 };
    } else if (ev.t === 'baseHit') {
      this.baseShake[ev.side] = 6;
    }
  };

  Renderer.prototype.updateParts = function () {
    var P = this.parts, out = [];
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      p.life--;
      if (p.vx != null) p.x += p.vx;
      if (p.vy != null) p.dy += p.vy;
      if (p.k === 'spark') p.vy += 0.5;         // gravity
      if (p.k === 'smoke') { p.r += 0.5; p.vx *= 0.94; }
      if (p.k === 'ring') p.r += 2.4;
      if (p.k === 'coin') p.vy *= 0.92;
      if (p.life > 0) out.push(p);
    }
    this.parts = out;
    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.06);
    if (this.sweep) { this.sweep.t++; if (this.sweep.t > this.sweep.max) this.sweep = null; }
    for (var k in this.baseShake) if (this.baseShake[k] > 0) this.baseShake[k]--;
  };

  Renderer.prototype.drawParts = function (groundY) {
    var ctx = this.ctx, P = this.parts;
    for (var i = 0; i < P.length; i++) {
      var p = P[i], x = this.wx(p.x), y = groundY - p.dy, al = Math.max(0, p.life / p.max);
      if (p.k === 'star') {
        ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y);
        var rr = p.r * (1.3 - al * 0.3);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var s = 0; s < 8; s++) {
          var ang = s * Math.PI / 4, rad = s % 2 ? rr * 0.42 : rr;
          ctx[s ? 'lineTo' : 'moveTo'](Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (p.k === 'spark') {
        ctx.save(); ctx.globalAlpha = al; ctx.strokeStyle = p.col; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * 2.5, y - p.vy * 2.5); ctx.stroke(); ctx.restore();
      } else if (p.k === 'smoke') {
        ctx.save(); ctx.globalAlpha = al * 0.6;
        ctx.fillStyle = '#b9bcc6'; ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.283); ctx.fill(); ctx.restore();
      } else if (p.k === 'dust') {
        ctx.save(); ctx.globalAlpha = al * 0.7;
        ctx.fillStyle = '#d8c79a'; ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.283); ctx.fill(); ctx.restore();
      } else if (p.k === 'ring') {
        ctx.save(); ctx.globalAlpha = al * 0.8; ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, groundY - 2, p.r, p.r * 0.4, 0, 0, 6.283); ctx.stroke(); ctx.restore();
      } else if (p.k === 'coin') {
        ctx.save(); ctx.globalAlpha = al; ctx.font = '800 15px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(80,50,0,.8)';
        ctx.strokeText(p.txt + '¢', x, y); ctx.fillStyle = '#ffdc3c'; ctx.fillText(p.txt + '¢', x, y);
        ctx.restore();
      }
    }
    ctx.textAlign = 'left';
  };

  Renderer.prototype.draw = function (sim) {
    this.drainFx(sim); this.updateParts();
    var ctx = this.ctx, dpr = window.devicePixelRatio || 1;
    var W = this.cv.width / dpr, H = this.cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.shake > 0) {
      var m = this.shake / 2;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);
    var groundY = H * this.groundFrac;
    this.updateCamera(sim);
    this.drawBg(W, H, groundY);

    // bases (own shake offset applied inside)
    this.drawBase(sim, groundY, true);
    this.drawBase(sim, groundY, false);

    // units sorted by x; draw back-to-front
    var us = sim.units.slice().sort(function (a, b) { return a.x - b.x; });
    for (var i = 0; i < us.length; i++) this.drawUnit(us[i], groundY);

    this.drawParts(groundY);
    this.drawCannonSweep(groundY, H);

    // HP numbers above each base (original shows cur/max on the castle)
    this.baseHpText(this.wx(sim.catBaseX) + 36, groundY, sim.catBaseHp, sim.catBaseMax);
    this.baseHpText(this.wx(sim.enemyBaseX) - 36, groundY, sim.enemyBaseHp, sim.enemyBaseMax);

    if (this.flash > 0) {
      ctx.save(); ctx.globalAlpha = this.flash; ctx.fillStyle = '#fff';
      ctx.fillRect(-20, -20, W + 40, H + 40); ctx.restore();
    }
  };

  Renderer.prototype.drawBg = function (W, H, groundY) {
    var ctx = this.ctx;
    var sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#7fb8e3'); sky.addColorStop(0.7, '#aed7ee'); sky.addColorStop(1, '#d7eef8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, groundY);
    // soft clouds (parallax)
    var coff = -this.camX * this.zoom * 0.15;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (var c = 0; c < 6; c++) {
      var cx = ((c * 260 + coff) % (W + 260)) - 130, cy = 30 + (c % 3) * 34;
      this.cloud(cx, cy, 34 + (c % 2) * 14);
    }
    // distant parallax hills
    ctx.fillStyle = '#a9d2a2';
    var hoff = -this.camX * this.zoom * 0.3;
    ctx.beginPath(); ctx.moveTo(0, groundY);
    for (var hx = 0; hx <= W + 80; hx += 40) {
      var wy = groundY - 44 - 28 * Math.sin((hx - hoff) * 0.008);
      ctx.lineTo(hx, wy);
    }
    ctx.lineTo(W, groundY); ctx.closePath(); ctx.fill();
    // ground
    var gr = ctx.createLinearGradient(0, groundY, 0, H);
    gr.addColorStop(0, '#a98559'); gr.addColorStop(1, '#6f5435');
    ctx.fillStyle = gr; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, groundY, W, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath();
    ctx.moveTo(0, groundY + 3.5); ctx.lineTo(W, groundY + 3.5); ctx.stroke();
    // vignette
    var vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.5, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  };

  Renderer.prototype.cloud = function (x, y, r) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283); ctx.arc(x + r * 0.9, y + 4, r * 0.75, 0, 6.283);
    ctx.arc(x - r * 0.9, y + 5, r * 0.7, 0, 6.283); ctx.arc(x + r * 0.2, y - r * 0.5, r * 0.6, 0, 6.283);
    ctx.fill();
  };

  Renderer.prototype.drawCannonSweep = function (groundY, H) {
    if (!this.sweep) return;
    var ctx = this.ctx, sw = this.sweep, f = sw.t / sw.max;
    var headX = this.wx(sw.x0 + (sw.x1 - sw.x0) * f);
    var g = ctx.createLinearGradient(headX - 60, 0, headX + 10, 0);
    g.addColorStop(0, 'rgba(120,200,255,0)'); g.addColorStop(0.7, 'rgba(160,220,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.save(); ctx.globalAlpha = 1 - f * 0.5; ctx.fillStyle = g;
    ctx.fillRect(headX - 60, groundY - 150, 70, 160);
    ctx.restore();
  };

  Renderer.prototype.baseHpText = function (cx, groundY, hp, max) {
    var ctx = this.ctx, dpr = window.devicePixelRatio || 1, W = this.cv.width / dpr;
    var txt = Math.max(0, Math.floor(hp)) + '/' + max;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var half = ctx.measureText(txt).width / 2 + 4;
    cx = Math.max(half, Math.min(W - half, cx));   // keep fully on-screen
    var y = groundY - 120;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(txt, cx, y);
    ctx.fillStyle = '#fff'; ctx.fillText(txt, cx, y);
    ctx.textAlign = 'left';
  };

  Renderer.prototype.drawBase = function (sim, groundY, isCat) {
    var ctx = this.ctx;
    var sx = this.wx(isCat ? sim.catBaseX : sim.enemyBaseX);
    var shake = this.baseShake[isCat ? 'cat' : 'enemy'] || 0;
    if (shake > 0) sx += (Math.random() - 0.5) * shake;
    // real Cat Base art for the player side; enemy keeps the drawn castle
    var img = isCat ? this.assets.catbase : null;
    if (img && img.width) {
      var ih = 128, iw = ih * img.width / img.height, ibx = sx - iw * 0.18;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
      ctx.drawImage(img, ibx, groundY - ih, iw, ih);
      ctx.restore();
      return;
    }
    var w = 72, h = 108, top = groundY - h;
    // castle hugs the field edge, opening toward the battlefield
    var left = isCat ? sx - 8 : sx - w + 8;
    ctx.save();
    // tower body
    var g = ctx.createLinearGradient(0, top, 0, groundY);
    if (isCat) { g.addColorStop(0, '#d2d9e6'); g.addColorStop(1, '#8b97ac'); }
    else { g.addColorStop(0, '#e6c9c9'); g.addColorStop(1, '#9c6f6f'); }
    ctx.fillStyle = g; ctx.fillRect(left, top + 16, w, h - 16);
    // battlements
    ctx.fillStyle = isCat ? '#b3bccb' : '#bd9191';
    for (var i = 0; i < 4; i++) ctx.fillRect(left + i * (w / 4) + 2, top + 4, w / 4 - 5, 16);
    // door / gate (faces battlefield)
    ctx.fillStyle = isCat ? '#39445c' : '#5a3838';
    var dw = 26, dh = 46, dx = isCat ? left + w - dw - 6 : left + 6, dy = groundY - dh;
    ctx.fillRect(dx, dy, dw, dh);
    ctx.beginPath(); ctx.arc(dx + dw / 2, dy, dw / 2, Math.PI, 0); ctx.fill();
    // outline
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(left, top + 16, w, h - 16);
    // damage tint flash when recently hit
    if (shake > 0) { ctx.globalAlpha = shake / 10; ctx.fillStyle = '#ff5a5a'; ctx.fillRect(left, top, w, h); }
    ctx.restore();
  };

  Renderer.prototype.drawUnit = function (u, groundY) {
    var key = this.unitKey(u);
    var md = this.assets.models[key];
    var sx = this.wx(u.x);
    if (!md || !md.model) { // fallback blob
      var ctx0 = this.ctx;
      ctx0.fillStyle = u.side === 'cat' ? '#eee' : '#c66';
      ctx0.beginPath(); ctx0.arc(sx, groundY - 20, 16, 0, 7); ctx0.fill();
      this.unitHp(u, sx, groundY - 60);
      return;
    }
    var ctx = this.ctx;
    var anim = md.model.anims[u.anim] || null;
    // advance per-unit animation frame clock
    u.animFrame = (u.animFrame || 0) + 1;
    var frame = u.animFrame;
    if (u.state === 'fore') frame = u.t;         // sync attack to foreswing timer
    var st = BCSprite.animState(md.model, anim, frame);
    // anchor by the model's real bounds: feet (maxY) on the ground, body centered on x
    var b = md.model._bUnit;
    if (!b) b = md.model._bUnit = BCSprite.bounds(md.model, BCSprite.animState(md.model, md.model.anims['00'] || null, 0));
    var cx = b ? (b.minX + b.maxX) / 2 : 480;
    var feet = b ? b.maxY : 340;
    // ground contact shadow
    ctx.save();
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, groundY - 1, 20, 6, 0, 0, 6.283); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(sx, groundY);
    var s = this.zoom * 0.55;
    ctx.scale(s, s);
    ctx.translate(-cx, -feet);
    if (u.flash > 0) { ctx.filter = 'brightness(2.6) saturate(0.3)'; u.flash--; }
    BCSprite.draw(ctx, md.model, md.sheet, st, { scale: 1, flip: u.side === 'cat' });
    ctx.restore();
    this.unitHp(u, sx, groundY - 70);
  };

  Renderer.prototype.unitHp = function (u, x, y) {
    if (u.hp >= u.maxhp) return;
    var ctx = this.ctx, w = 34, h = 4;
    ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = u.side === 'cat' ? '#7f7' : '#f77';
    ctx.fillRect(x - w / 2, y, w * Math.max(0, u.hp / u.maxhp), h);
  };

  var api = { Renderer: Renderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BCRender = api;
})(typeof window !== 'undefined' ? window : this);
