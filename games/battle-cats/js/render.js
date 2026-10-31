// Battlefield renderer: bg, bases, sprite units, HP bars. Uses BCSprite.
(function (root) {
  'use strict';

  function Renderer(canvas, assets) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;        // {bg, catbase, models:{key:{model,sheet}}}
    this.zoom = 0.5;
    this.groundFrac = 0.82;      // ground line as fraction of canvas height
    this.camX = 0;
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

  Renderer.prototype.draw = function (sim) {
    var ctx = this.ctx, dpr = window.devicePixelRatio || 1;
    var W = this.cv.width / dpr, H = this.cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var groundY = H * this.groundFrac;
    this.updateCamera(sim);

    // procedural background (battle bg art is base-pack gated)
    var sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#8fc4e8'); sky.addColorStop(1, '#cfe9f5');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, groundY);
    // distant parallax hills
    ctx.fillStyle = '#b7d9b0';
    var hoff = -this.camX * this.zoom * 0.3;
    ctx.beginPath(); ctx.moveTo(0, groundY);
    for (var hx = 0; hx <= W + 80; hx += 80) {
      var wy = groundY - 40 - 26 * Math.sin((hx - hoff) * 0.01);
      ctx.lineTo(hx, wy);
    }
    ctx.lineTo(W, groundY); ctx.closePath(); ctx.fill();
    // ground
    var gr = ctx.createLinearGradient(0, groundY, 0, H);
    gr.addColorStop(0, '#9c7a4f'); gr.addColorStop(1, '#6f5435');
    ctx.fillStyle = gr; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5); ctx.lineTo(W, groundY + 0.5); ctx.stroke();

    // bases
    this.drawBase(sim, groundY, true);
    this.drawBase(sim, groundY, false);

    // units sorted by side/x so cats in front overlap nicely; draw back-to-front
    var us = sim.units.slice().sort(function (a, b) { return a.x - b.x; });
    for (var i = 0; i < us.length; i++) this.drawUnit(us[i], groundY);

    // base HP bars
    this.hpBar(W * 0.02, 10, W * 0.3, sim.catBaseHp / sim.catBaseMax, '#5c9ded', 'Cat Base');
    this.hpBar(W * 0.68, 10, W * 0.3, sim.enemyBaseHp / sim.enemyBaseMax, '#e06060', 'Enemy Base');
  };

  Renderer.prototype.drawBase = function (sim, groundY, isCat) {
    var ctx = this.ctx;
    var worldX = isCat ? sim.catBaseX : sim.enemyBaseX;
    var sx = this.wx(worldX);
    if (isCat && this.assets.catbase && this.assets.catbase.width > 1) {
      var img = this.assets.catbase, h = 150, w = img.width * (h / img.height);
      ctx.drawImage(img, sx - w + 20, groundY - h, w, h);
    } else {
      // enemy base drawn as a tower (placeholder until base-pack art)
      ctx.save();
      ctx.translate(sx, groundY);
      ctx.fillStyle = isCat ? '#4a6fa5' : '#8a3b3b';
      ctx.fillRect(isCat ? -10 : -40, -130, 50, 130);
      ctx.fillStyle = isCat ? '#6c9de0' : '#b85555';
      ctx.fillRect(isCat ? -4 : -34, -120, 38, 40);
      ctx.restore();
    }
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
    ctx.save();
    ctx.translate(sx, groundY);
    var s = this.zoom * 0.55;
    ctx.scale(s, s);
    ctx.translate(-cx, -feet);
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

  Renderer.prototype.hpBar = function (x, y, w, frac, color, label) {
    var ctx = this.ctx, h = 16;
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 4, y + h / 2);
  };

  var api = { Renderer: Renderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BCRender = api;
})(typeof window !== 'undefined' ? window : this);
