// Mũi xiên: ready → flying → (stuck | returning) → ready. Dây nối từ RopeAttachRigidbody trên tay Dave tới đuôi mũi xiên.
// Lúc ready mũi xiên nằm trong súng xiên Dave cầm (vẽ trong lớp tay của js/dave.js), không vẽ ở đây.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, H = T.harpoon, D = window.HX_ASSETS.dave;
  var ROPE_PTS = 14;
  // Mũi xiên NormalHarpoonHead gốc: 33×5 px, pivot ở đuôi, dưới HarpoonProjectile phóng ×2 (D.scale).
  var K = D.scale || 1, LEN = D.spear.size[0] / D.spear.ppu * K, WID = D.spear.size[1] / D.spear.ppu * K;
  // Dây gốc: LineRenderer rộng 0,02 m, HarpoonRopeMaterial màu đen (D.rope).
  var ROPE = D.rope || { width: 0.02, color: [0, 0, 0, 1] };

  function roll(p) { return Math.random() < p; }
  // Hiệu ứng khi mũi xiên trúng cá, theo kiểu của đầu xiên đang lắp (G.loadout.head.effect, bảng HX_META.HEADS).
  // hit(hp, f, h, c) chạy sau khi đã trừ máu; c = { res ('dead'|'tug'|'alive'), dmg, x, y }.
  // Trả 'held' khi cá bị giữ tại chỗ (ngủ, đông đá): không giằng co nữa.
  // Tỉ lệ, thời lượng, số của bùa là hàng BuffDebuffEffect gốc [DtD] trong h.buff.
  var HEAD_EFFECTS = {
    none: {},
    // DebuffShock: chancerate tê liệt, bơi chậm buffvalue1 trong duration
    shock: { hit: function (hp, f, h, c) {
      if (c.res === 'dead' || !roll(h.buff.chance)) return null;
      hp.G.audio.play('gear_paralysis_hit');
      // cụm VFX_HarpoonHead_Paralysis_A_01 gốc là hạt lặp: bám cá suốt bùa
      f.addBuff('shock', h.buff, { vfx: 'hitParalysis' });
      return null;
    } },
    // DebuffPoison: luôn trúng độc, buffvalue1 máu mỗi tickinterval trong duration
    poison: { hit: function (hp, f, h, c) {
      if (c.res === 'dead') return null;
      f.addBuff('poison', h.buff, { vfx: 'hitPoison' });
      return null;
    } },
    // DebuffBurn: đốt thêm buffvalue1 × sát thương phát xiên, ăn khi hết duration
    burn: { hit: function (hp, f, h, c) {
      if (c.res === 'dead') return null;
      hp.G.audio.play('gear_fire_hit', { vol: 0.8 });
      f.addBuff('burn', h.buff, { dmg: Math.max(1, Math.round(c.dmg * h.buff.v[0])) });
      return null;
    } },
    // DebuffChain: buffvalue1 × sát thương lan sang một con gần nhất, nảy tối đa buffvalue2 lần, mỗi lần cách duration giây
    chain: { hit: function (hp, f, h, c) {
      hp.chains.push({ from: f, hit: [f.id], left: h.buff.v[1] | 0, dmg: Math.max(1, Math.round(c.dmg * h.buff.v[0])), t: 0, every: h.buff.duration });
      return null;
    } },
    // DebuffInstantSleep: chancerate ngủ ngay duration giây
    sleep: { hit: function (hp, f, h, c) {
      if (c.res === 'dead' || !roll(h.buff.chance) || !f.sleep(h.buff.duration)) return null;
      hp.G.fx.play(hp.G.fx.dive(h.buff.vfxBody), c.x, c.y, { z: f.z + 0.2, scale: f.sp.scale || 1, name: 'tranq', follow: function () {
        return f.state === 'sleep' && f.root.parent ? f.center() : null;
      } });
      hp.G.fx.play(hp.G.fx.dive(h.buff.vfxHead), 0, 0, { z: f.z + 0.25, scale: f.sp.scale || 1, name: 'sleep', follow: function () {
        if (f.state !== 'sleep' || !f.root.parent) return null;
        var q = f.center();
        return { x: q.x, y: q.y + f.hh * 0.6 };
      } });
      return 'held';
    } },
    // DebuffFreezing: chancerate đóng băng duration giây
    freeze: { hit: function (hp, f, h, c) {
      hp.G.audio.play('gear_ice_hit', { vol: 0.8 });
      if (c.res === 'dead' || !roll(h.buff.chance)) return null;
      return f.addBuff('freeze', h.buff) ? 'held' : null;
    } },
  };
  // Tiếng bắn thêm của từng đầu xiên (chọn theo tên tệp gốc, xem tools/rip_gear.py) [ĐỀ XUẤT]
  var SHOT_SFX = { strong: 'gear_strong_shot', paralysis: 'gear_paralysis_shot', sleep: 'gear_sleep_shot', chain: 'gear_chain_shot', ice: 'gear_ice_shot' };

  function Harpoon(G) {
    this.G = G;
    this.state = 'ready';
    this.x = 0; this.y = 0; this.angle = 0; this.dx = 1; this.dy = 0;
    this.traveled = 0; this.fish = null; this.off = null;
    this.head = G.loadout.head || { id: 'basic', effect: 'none', dmg: 0, buff: null, rope: null, aura: null };
    this.chains = [];
    this.timed = [];   // hạt lặp chỉ phát một lúc: { p, left (giây) }
    this.aura = null;
    // x, y là đầu mũi xiên; ảnh vẽ lùi về sau một chiều dài mũi
    this.mesh = HX.gfx.sprite(G.gfx.tex('fx/HarpoonProjectile.png'), LEN, WID, { alphaCut: 0.5, depthWrite: true, pivot: [1, 0.5] });
    this.mesh.visible = false;
    G.gfx.scene.add(this.mesh);
    // dây là dải tam giác bề ngang ROPE.width (THREE.Line chỉ vẽ được 1 px)
    var geo = new THREE.BufferGeometry(), idx = [];
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE_PTS * 2 * 3), 3));
    for (var i = 0; i < ROPE_PTS - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    var c = ROPE.color, hr = this.head.rope, mat;
    this.ropeW = ROPE.width; this.ropeTile = false;
    if (hr && hr.img) {
      // dây của đầu xiên đặc biệt (ropeEffectInfo gốc): ảnh Line_* kéo dọc dây, bề rộng lineWidth.
      // Legacy Particles/Additive: màu = 2 × _TintColor × ảnh, cộng sáng; 2D_Sprite_Uber (xích): ảnh × _DiffuseBright, trộn alpha
      var tc = hr.color || [1, 1, 1, 1], add = hr.blend === 'add', tex = G.gfx.tex(hr.img.replace(/^art\//, ''), true);
      tex.wrapS = THREE.RepeatWrapping;
      this.ropeW = hr.width; this.ropeTile = !!hr.tile;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ROPE_PTS * 2 * 2), 2));
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        color: add ? new THREE.Color(Math.min(1, 2 * tc[0]), Math.min(1, 2 * tc[1]), Math.min(1, 2 * tc[2])) : new THREE.Color(tc[0], tc[1], tc[2]),
        opacity: add ? Math.min(1, 2 * tc[3]) : 1, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    } else {
      mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), transparent: c[3] < 1, opacity: c[3], side: THREE.DoubleSide });
    }
    this.rope = new THREE.Mesh(geo, mat);
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    G.gfx.scene.add(this.rope);
  }

  Harpoon.prototype.fire = function (x, y, angle) {
    var G = this.G;
    this.state = 'flying';
    this.x = x; this.y = y; this.angle = angle;
    this.dx = Math.cos(angle); this.dy = Math.sin(angle);
    this.traveled = 0;
    this.missed = false;
    G.audio.play('harpoon_shot');
    if (SHOT_SFX[this.head.id]) G.audio.play(SHOT_SFX[this.head.id], { vol: 0.7 });
    // SpearBubble gốc gắn trên HarpoonProjectile (phóng ×2): vệt bọt theo đuôi mũi xiên khi bay
    var self = this;
    if (this.trail) this.trail.stop();
    this.trail = G.fx.play(G.fx.dive('spearBubble'), x - this.dx * LEN, y - this.dy * LEN, { scale: K, z: 0.13, name: 'spear',
      angle: angle, follow: function () {
        return self.state === 'flying' ? { x: self.x - self.dx * LEN, y: self.y - self.dy * LEN, angle: self.angle } : null;
      } });
    // cá đang nằm ngay trên thân mũi xiên lúc bắn (gần hơn đầu mũi) cũng trúng, như collider của mũi xiên gốc
    var fishes = G.fishes.list;
    for (var k = 0; k <= 6 && this.state === 'flying'; k++) {
      var px = x - this.dx * LEN * (1 - k / 6), py = y - this.dy * LEN * (1 - k / 6);
      for (var j = 0; j < fishes.length; j++) {
        if (fishes[j].alive() && fishes[j].hitTest(px, py, 0.04)) { this.x = px; this.y = py; this.hitFish(fishes[j]); break; }
      }
    }
  };

  Harpoon.prototype.hitFish = function (f) {
    var G = this.G, h = this.head;
    // sát thương = súng xiên + phần cộng của đầu xiên (HarpoonHeadSpecData._Damage) [DtD]
    var dmg = G.loadout.harpoon + (h.dmg || 0);
    var res = f.damage(dmg, this.x - this.dx, this.y - this.dy, true);
    G.audio.play('harpoon_hit');
    // BloodHit.prefab gốc (bọt, máu, tia loé); mũi xiên hạ luôn con cá thì thêm BloodFatal
    G.fx.play(G.fx.dive('bloodHit'), this.x, this.y, { z: f.z + 0.12, angle: this.angle, name: 'bloodHit' });
    if (res === 'dead') G.fx.play(G.fx.dive('bloodFatal'), this.x, this.y, { z: f.z + 0.1, name: 'bloodFatal' });
    G.hitstop(0.06);
    G.shake(0.35);
    this.missed = false;
    var E = HEAD_EFFECTS[h.effect] || HEAD_EFFECTS.none;
    var held = E.hit && h.buff ? E.hit(this, f, h, { res: res, dmg: dmg, x: this.x, y: this.y }) : null;
    this.lastHit = { fish: f.id, res: res, dmg: dmg, effect: h.effect, held: held };
    // cá nhỏ ngủ trên mũi xiên gây mê: kéo về còn sống (bắt sống, hạng cao nhất như bản gốc); cá lớn thì ngủ tại chỗ
    if (held === 'held' && f.state === 'sleep' && !f.carvable()) { f.go('hauled', { alive: true }); return this.hook(f, 'reel'); }
    if (held === 'held' || res === 'alive') { this.state = 'returning'; return; }
    // chết: Fish.prototype.die đã quyết cá nhỏ theo dây về (hauled), cá lớn thành xác nằm lại (dying) và mũi xiên rút ra
    if (res === 'dead') {
      if (f.state === 'hauled') this.hook(f, 'reel');
      else this.state = 'returning';
      return;
    }
    f.go('hooked');
    this.hook(f, 'tug');
  };

  Harpoon.prototype.hook = function (f, daveState) {
    this.state = 'stuck';
    this.fish = f;
    this.off = { x: (this.x - f.pos.x) * f.facing, y: this.y - f.pos.y };
    this.G.diver.go(daveState);
  };

  // Thắng giằng co: cá chết trên dây. Trả true nếu dây kéo cá về (cá nhỏ), false nếu cá lớn thành xác và mũi xiên rút ra.
  Harpoon.prototype.killHooked = function () {
    var f = this.fish;
    if (!f) return false;
    f.flashT = 0.15;
    f.die(true);
    this.G.fx.play(this.G.fx.dive('bloodFatal'), this.x, this.y, { z: f.z + 0.1, name: 'bloodFatal' });
    if (f.state === 'hauled') return true;
    this.release();
    return false;
  };

  // Rút mũi xiên khỏi cá (cá nằm lại làm xác), thu về tay.
  Harpoon.prototype.release = function () {
    this.fish = null;
    this.state = 'returning';
  };

  // Sét lan (mũi xiên sét): mỗi nhịp nảy sang con cá sống gần nhất chưa bị đánh, trong T.harpoon.chainRange.
  Harpoon.prototype.updateChains = function (dt) {
    var G = this.G;
    for (var i = this.chains.length - 1; i >= 0; i--) {
      var ch = this.chains[i];
      ch.t += dt;
      if (ch.t < ch.every) continue;
      ch.t -= ch.every;
      var c0 = ch.from.center(), best = null, bd = H.chainRange;
      G.fishes.list.forEach(function (q) {
        if (!q.alive() || q.state === 'hooked' || ch.hit.indexOf(q.id) >= 0) return;
        var c = q.center(), d = Math.hypot(c.x - c0.x, c.y - c0.y);
        if (d < bd) { bd = d; best = q; }
      });
      if (!best) { this.chains.splice(i, 1); continue; }
      var cb = best.center();
      // VFX_HarpoonHead_Lightning_A_01 gốc lặp mãi: phát trên con bị sét rồi tắt sau một nhịp nảy [ĐỀ XUẤT]
      var zap = G.fx.play(G.fx.dive('hitChain'), cb.x, cb.y, { z: best.z + 0.2, angle: Math.atan2(cb.y - c0.y, cb.x - c0.x), name: 'chain' });
      if (zap) this.timed.push({ p: zap, left: Math.max(0.4, ch.every) });
      G.audio.play('gear_chain_zap', { vol: 0.8 });
      best.damage(ch.dmg, c0.x, c0.y, false);
      ch.hit.push(best.id);
      this.chained = (this.chained || 0) + 1;
      ch.from = best;
      if (--ch.left <= 0) this.chains.splice(i, 1);
    }
  };

  // Hào quang của đầu xiên (cụm VFX_* trong prefab đầu xiên, lệch aura.pos theo trục mũi từ đuôi, phóng aura.scale):
  // hiện khi mũi xiên đang bay hoặc đang nằm trong súng lúc ngắm.
  Harpoon.prototype.updateAura = function () {
    var a = this.head.aura, G = this.G, d = G.diver;
    if (!a || !a.key) return;
    var self = this, want = this.state === 'flying' || this.state === 'returning' || d.state === 'aim';
    if (want && (!this.aura || this.aura.dead)) {
      this.aura = G.fx.play(G.fx.dive(a.key), 0, 0, { z: 0.14, scale: a.scale * K, name: 'aura', follow: function () {
        var inGun = self.state === 'ready' && G.diver.state === 'aim';
        if (!inGun && self.state !== 'flying' && self.state !== 'returning') return null;
        var tip = inGun ? G.diver.gunTip() : { x: self.x, y: self.y }, ang = inGun ? G.diver.aimAngle : self.angle;
        var ax = Math.cos(ang), ay = Math.sin(ang), back = LEN - a.pos[0] * K;
        return { x: tip.x - ax * back - ay * a.pos[1] * K, y: tip.y - ay * back + ax * a.pos[1] * K, angle: ang };
      } });
    }
  };

  Harpoon.prototype.breakFree = function () {
    var f = this.fish;
    this.fish = null;
    this.state = 'returning';
    if (!f || !f.alive()) return;
    if (f.sp.damage > 0) { f.angry = T.fish.angryTime; f.go('chase'); }
    else f.go('flee', { fromX: this.G.diver.pos.x, fromY: this.G.diver.pos.y });
  };

  Harpoon.prototype.drop = function () {
    if (this.fish && this.fish.state === 'hooked') this.breakFree();
    else if (this.state !== 'ready') { this.fish = null; this.state = 'returning'; }
  };

  Harpoon.prototype.update = function (dt) {
    var G = this.G, d = G.diver, tip = d.gunTip();
    if (this.state === 'flying') {
      var step = H.speed * dt, n = Math.max(1, Math.ceil(step / 0.08));
      for (var i = 0; i < n && this.state === 'flying'; i++) {
        var s = step / n, nx = this.x + this.dx * s, ny = this.y + this.dy * s;
        var wall = G.world.raycast(this.x, this.y, nx, ny);
        if (wall) {
          this.x = wall.x; this.y = wall.y;
          this.state = 'returning';
          this.missed = true;
          G.audio.play('harpoon_hit_rock');
          G.fx.spawn('spark', wall.x, wall.y, 0.2, 0, 0, 0.5);
          G.fx.spawn('dust', wall.x + wall.nx * 0.1, wall.y + wall.ny * 0.1, 0.2, wall.nx * 0.3, wall.ny * 0.3);
          break;
        }
        this.x = nx; this.y = ny; this.traveled += s;
        var fishes = G.fishes.list;
        for (var k = 0; k < fishes.length; k++) {
          var f = fishes[k];
          if (f.alive() && f.hitTest(this.x, this.y, 0.04)) { this.hitFish(f); break; }
        }
        if (this.state === 'flying' && this.traveled >= H.range) { this.state = 'returning'; this.missed = true; }
      }
    } else if (this.state === 'stuck') {
      var f2 = this.fish;
      // cá mắc xiên chết vì độc / bỏng giữa lúc giằng co: cá nhỏ theo dây về, cá lớn thành xác và mũi xiên rút ra
      if (f2 && d.state === 'tug' && f2.state === 'hauled') d.go('reel');
      else if (f2 && f2.corpse()) { this.release(); f2 = null; if (d.state === 'tug' || d.state === 'reel') d.go('swim'); }
      if (!f2) { this.state = 'returning'; }
      else {
        if (d.state === 'reel') {
          var dx = tip.x - f2.pos.x, dy = tip.y - f2.pos.y, l = Math.hypot(dx, dy) || 1;
          var mv = Math.min(l, H.reelSpeed * dt);
          f2.pos.x += dx / l * mv; f2.pos.y += dy / l * mv;
          if (l < 0.35) {
            this.fish = null;
            this.state = 'ready';
            G.catchFish(f2);
          }
        }
        this.x = f2.pos.x + this.off.x * f2.facing; this.y = f2.pos.y + this.off.y;
        this.angle = Math.atan2(this.y - tip.y, this.x - tip.x);
      }
    } else if (this.state === 'returning') {
      var rx = tip.x - this.x, ry = tip.y - this.y, rl = Math.hypot(rx, ry) || 1;
      var mv2 = Math.min(rl, H.returnSpeed * dt);
      this.x += rx / rl * mv2; this.y += ry / rl * mv2;
      this.angle = Math.atan2(-ry, -rx);
      if (rl < 0.3) { this.state = 'ready'; this.missed = false; G.audio.play('harpoon_return', { vol: 0.6 }); }
    }
    if (this.chains.length) this.updateChains(dt);
    for (var ti = this.timed.length - 1; ti >= 0; ti--) {
      if ((this.timed[ti].left -= dt) <= 0) { this.timed[ti].p.stop(); this.timed.splice(ti, 1); }
    }
    this.updateAura();
    this.draw(d.ropeFrom());
  };

  // from: đầu dây trên tay Dave.
  Harpoon.prototype.draw = function (from) {
    var on = this.state !== 'ready';
    this.mesh.visible = on && this.state !== 'stuck';
    this.rope.visible = on;
    if (!on) return;
    this.mesh.position.set(this.x, this.y, 0.12);
    this.mesh.rotation.z = this.angle;
    var p = this.rope.geometry.attributes.position.array, tip = from;
    // dây buộc vào đuôi mũi xiên; mũi đã cắm vào cá thì buộc ở chỗ cắm
    var ex = this.x - Math.cos(this.angle) * LEN, ey = this.y - Math.sin(this.angle) * LEN;
    if (this.state === 'stuck') { ex = this.x; ey = this.y; }
    var len = Math.hypot(ex - tip.x, ey - tip.y);
    var sag = this.state === 'returning' ? Math.min(0.5, len * 0.12) : this.state === 'stuck' && this.G.diver.state === 'reel' ? 0.03 : 0;
    var nx = -(ey - tip.y) / (len || 1) * this.ropeW / 2, ny = (ex - tip.x) / (len || 1) * this.ropeW / 2;
    var uv = this.rope.geometry.attributes.uv;
    for (var i = 0; i < ROPE_PTS; i++) {
      var t = i / (ROPE_PTS - 1), x = tip.x + (ex - tip.x) * t, y = tip.y + (ey - tip.y) * t - Math.sin(t * Math.PI) * sag;
      p[i * 6] = x - nx; p[i * 6 + 1] = y - ny; p[i * 6 + 2] = 0.11;
      p[i * 6 + 3] = x + nx; p[i * 6 + 4] = y + ny; p[i * 6 + 5] = 0.11;
      if (uv) {
        // LineRenderer gốc: Stretch kéo một ảnh suốt dây; Tile lặp ảnh mỗi mét
        var u = this.ropeTile ? t * len : t;
        uv.array[i * 4] = u; uv.array[i * 4 + 1] = 0; uv.array[i * 4 + 2] = u; uv.array[i * 4 + 3] = 1;
      }
    }
    this.rope.geometry.attributes.position.needsUpdate = true;
    if (uv) uv.needsUpdate = true;
  };

  Harpoon.prototype.remove = function () {
    if (this.aura) this.aura.stop();
    this.chains.length = 0;
    this.timed.forEach(function (t) { t.p.stop(); });
    this.timed.length = 0;
    this.G.gfx.scene.remove(this.mesh);
    this.G.gfx.scene.remove(this.rope);
  };

  HX.Harpoon = Harpoon;
})(window.HX = window.HX || {});
