// Kỹ năng của crew trưởng (phím R, nút cảm ứng "Kỹ năng"): 14 kỹ năng dưới nước, số lấy từ BDL.content.crew[].skill.
// Crew của ca nằm ở BDL.run.ca.crew (main.js đặt từ BDL.meta.runStart()); cd trong đó đã nhân cdMul của crew rồi.
// Trang thử (?map=N, không có ca thật) mặc định crew 'bao' (Chói Loà). Điều khiển quái nằm ở BDL.foes (js/foes.js).
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';
  var HX = window.HX, T = window.HX_TUNING;
  var G = null, S = null;

  var ICON = { flash: '💡', healring: '💚', gong: '🔔', unlock: '🔓', vanish: '👻', shock: '⚡', decoy: '🎣', rescue: '🪝', cage: '⛓️', blink: '💨', reveal: '👁️', freeze: '❄️', pull: '🧲', angel: '😇' };
  var SOUND_FALLBACK = 'o2_use';

  // ---------- tiện ích ----------
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function sfx(key, o) { if (window.HX_ASSETS.audio[key]) G.audio.play(key, o); }
  function toast(s) { if (HX.hud && HX.hud.toast) HX.hud.toast(s); }
  function diver() { return G && G.diver; }
  function daveOut() {
    var d = diver();
    return !d || G.phase !== 'dive' || d.state === 'dead' || d.state === 'surfaced' || d.state === 'enter';
  }
  function surf() { return T.water.surfaceY; }

  // hình gợi vùng ảnh hưởng: vòng tròn nở ra (hoặc co vào) rồi mờ; opt.hold giữ vòng đứng yên suốt hold giây
  function ring(x, y, r0, r1, life, color, opt) {
    opt = opt || {};
    var geo = new THREE.RingGeometry(0.93, 1, 56);
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0.6); m.renderOrder = 58; m.scale.set(r0, r0, 1);
    G.gfx.scene.add(m);
    var o = { mesh: m, t: 0, life: life, r0: r0, r1: r1, hold: !!opt.hold, follow: opt.follow || null, alpha: opt.alpha == null ? 0.85 : opt.alpha };
    S.rings.push(o);
    return o;
  }
  function dropRing(o) {
    G.gfx.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose();
  }
  function stepRings(dt) {
    for (var i = S.rings.length - 1; i >= 0; i--) {
      var o = S.rings[i];
      o.t += dt;
      var k = Math.min(1, o.t / o.life);
      if (o.follow) { var p = o.follow(); o.mesh.position.x = p.x; o.mesh.position.y = p.y; }
      if (o.hold) {
        var r = o.r1 * (1 + 0.02 * Math.sin(o.t * 7));
        o.mesh.scale.set(r, r, 1);
        o.mesh.material.opacity = o.alpha * (k > 0.85 ? (1 - k) / 0.15 : 0.55 + 0.35 * Math.sin(o.t * 5));
      } else {
        var s = o.r0 + (o.r1 - o.r0) * (1 - Math.pow(1 - k, 2));
        o.mesh.scale.set(s, s, 1);
        o.mesh.material.opacity = o.alpha * (1 - k);
      }
      if (k >= 1) { dropRing(o); S.rings.splice(i, 1); }
    }
  }

  function aimDir() {
    var inp = BDL.input, d = diver(), x = 0, y = 0;
    if (inp && (inp.mx || inp.my)) { x = inp.mx; y = inp.my; }
    else if (inp && (inp.aimX || inp.aimY)) { x = inp.aimX - d.pos.x; y = inp.aimY - d.pos.y; }
    var l = Math.hypot(x, y);
    if (l < 0.05) { x = d.facing || 1; y = 0; l = 1; }
    return { x: x / l, y: y / l };
  }

  // đi từ (x, y) theo hướng (ux, uy) tối đa len mét, dừng sát vách (chừa pad); không lên khỏi mặt nước
  function clearRun(x, y, ux, uy, len, pad) {
    var W = G.world, x1 = x + ux * len, y1 = Math.min(surf() - 1, y + uy * len);
    var hit = W.raycast(x, y, x1, y1);
    var got = len;
    if (hit) got = Math.max(0, hit.t * Math.hypot(x1 - x, y1 - y) - pad);
    var gx = x + ux * got, gy = Math.min(surf() - 1, y + uy * got);
    // điểm đáp phải là nước thoáng: lùi dần nếu sát vách
    for (var i = 0; i < 12 && got > 0 && !W.open(gx, gy, 0.45); i++) { got = Math.max(0, got - 0.4); gx = x + ux * got; gy = Math.min(surf() - 1, y + uy * got); }
    return { x: gx, y: gy, len: got };
  }

  function lootList() { return (G.loot || []).filter(function (l) { return l.state !== 'gone' && l.state !== 'onDeck'; }); }
  function nearestLoot(x, y, r, pred) {
    var best = null, bd = r;
    lootList().forEach(function (l) {
      if (pred && !pred(l)) return;
      var dd = dist(l.pos.x, l.pos.y, x, y);
      if (dd <= bd) { bd = dd; best = l; }
    });
    return best;
  }
  function velOf(t) { return t.isLoot ? t.vel : (BDL.bodyVel ? BDL.bodyVel(t) : t.vel); }

  // kéo một món về phía Dave trong t giây, chậm dần khi tới gần để không đâm vào người
  function pullItem(item, t, speed) {
    for (var i = 0; i < S.pulls.length; i++) if (S.pulls[i].item === item) { S.pulls[i].t = Math.max(S.pulls[i].t, t); return; }
    if (item.wake) item.wake();
    S.pulls.push({ item: item, t: t, speed: speed || 8 });
  }
  function stepPulls(dt) {
    var d = diver();
    for (var i = S.pulls.length - 1; i >= 0; i--) {
      var p = S.pulls[i], it = p.item, v = velOf(it);
      p.t -= dt;
      var gone = !it.pos || it.state === 'gone' || it.state === 'onDeck' || it.state === 'reeled';
      if (gone || p.t <= 0) { S.pulls.splice(i, 1); continue; }
      var dx = d.pos.x - it.pos.x, dy = d.pos.y + 0.2 - it.pos.y, l = Math.hypot(dx, dy);
      if (l < 1.4) { v.x *= 0.8; v.y *= 0.8; continue; }
      var sp = Math.min(p.speed, 1.5 + l * 2.2);
      v.x += (dx / l * sp - v.x) * Math.min(1, 6 * dt); v.y += (dy / l * sp - v.y) * Math.min(1, 6 * dt);
      if (it.wake) it.wake();
      if (Math.random() < dt * 14) G.fx.burst('bubble', it.pos.x, it.pos.y, 1, 0.3);
    }
  }

  // ---------- 14 kỹ năng: mỗi hàm trả false nếu không có mục tiêu (không tốn hồi chiêu) ----------
  var IMPL = {
    flash: function (def, d) {
      var n = BDL.foes.stunAt(d.pos.x, d.pos.y, def.radius, def.dur, { kind: 'flash', forget: true });
      ring(d.pos.x, d.pos.y, 0.5, def.radius, 0.5, 0xffffff);
      G.fx.spawn('glow', d.pos.x, d.pos.y, 0.5, 0, 0, 5);
      G.fx.burst('spark', d.pos.x, d.pos.y, 8, 2);
      if (HX.hud.screenFx) HX.hud.screenFx('255,255,255', 0.55);
      sfx('gear_paralysis_zap', { vol: 0.5, rate: 1.7 });
      S.last = { foes: n };
      return true;
    },
    healring: function (def, d) {
      S.heal = { x: d.pos.x, y: d.pos.y, r: def.radius, t: def.dur, rate: def.heal || 9, tick: 0 };
      var h = S.heal;
      h.ring = ring(h.x, h.y, 0.4, h.r, def.dur, 0x6dffb0, { hold: true });
      G.fx.burst('bubbleBig', h.x, h.y, 10, 1.4);
      sfx('o2_use', { vol: 0.9 });
      S.activeT = Math.max(S.activeT, def.dur);
      return true;
    },
    gong: function (def, d) {
      // chỗ đặt chiêng: xa Dave ~9 m, ngược phía đám quái cho chúng rời Dave; nước phải thoáng
      var foes = BDL.foes.list().filter(function (f) { return !f.asleep && dist(f.body.pos.x, f.body.pos.y, d.pos.x, d.pos.y) < 24; });
      var ax = 0, ay = 0;
      foes.forEach(function (f) { ax += f.body.pos.x - d.pos.x; ay += f.body.pos.y - d.pos.y; });
      var l = Math.hypot(ax, ay), best = null;
      var base = l > 0.5 ? Math.atan2(ay / l, ax / l) : Math.atan2(aimDir().y, aimDir().x);
      // thử hướng về phía đám quái trước (kéo chúng ra xa Dave), rồi quay dần
      [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, 3.14].forEach(function (off) {
        if (best && best.len >= 8) return;
        var r = clearRun(d.pos.x, d.pos.y, Math.cos(base + off), Math.sin(base + off), 10, 0.8);
        if (!best || r.len > best.len) best = r;
      });
      var n = BDL.foes.lureTo(best.x, best.y, def.dur, { radius: 26, cx: d.pos.x, cy: d.pos.y });
      ring(best.x, best.y, 0.4, 7, 1.2, 0xffd24a); ring(best.x, best.y, 0.2, 4, 0.9, 0xffe9a0);
      G.fx.burst('bubbleBig', best.x, best.y, 12, 1.6);
      G.shake(0.6);
      sfx('harpoon_hit_rock', { vol: 1, rate: 0.45 });
      S.gong = { x: best.x, y: best.y, t: def.dur, tick: 0 };
      S.last = { foes: n, x: best.x, y: best.y };
      return true;
    },
    unlock: function (def, d) {
      var R = def.radius, pool = lootList().filter(function (l) { return dist(l.pos.x, l.pos.y, d.pos.x, d.pos.y) <= R; });
      if (!pool.length) { toast('Không có đồ cổ nào trong ' + R + ' m'); return false; }
      // ưu tiên món nằm yên (kẹt) gần nhất; không có thì món gần nhất
      var l = pool.filter(function (x) { return x.asleep && !x.tethered; }).sort(function (a, b) { return dist(a.pos.x, a.pos.y, d.pos.x, d.pos.y) - dist(b.pos.x, b.pos.y, d.pos.x, d.pos.y); })[0] ||
        pool.sort(function (a, b) { return dist(a.pos.x, a.pos.y, d.pos.x, d.pos.y) - dist(b.pos.x, b.pos.y, d.pos.x, d.pos.y); })[0];
      // kẹt trong vách thì đưa ra nước thoáng gần nhất
      if (G.world.solid(l.pos.x, l.pos.y)) {
        for (var r = 0.3; r < 3; r += 0.3) {
          var done = false;
          for (var a = 0; a < 12 && !done; a++) {
            var px = l.pos.x + Math.cos(a * 0.5236) * r, py = l.pos.y + Math.sin(a * 0.5236) * r;
            if (G.world.open(px, py, l.r || 0.3)) { l.pos.x = px; l.pos.y = py; done = true; }
          }
          if (done) break;
        }
      }
      l.wake(); l.grace = G.t + 1.5;
      l.vel.y += 2.4; l.vel.x += (Math.random() - 0.5) * 0.8;
      l.pried = true;
      S.stats.pries++;
      if (S.revealT <= 0) S.revealOnly = 'loot';
      S.revealT = Math.max(S.revealT, 4);
      G.fx.burst('spark', l.pos.x, l.pos.y, 6, 1.4);
      G.fx.spawn('glow', l.pos.x, l.pos.y, 0.4, 0, 0, 1.4);
      ring(l.pos.x, l.pos.y, 0.3, 1.8, 0.6, 0x7fe3ff);
      sfx('gear_ice_break', { vol: 0.5, rate: 1.9 });
      S.last = { loot: l.id, pried: true };
      return true;
    },
    vanish: function (def, d) {
      var n = BDL.foes.blind(def.dur);
      S.vanishT = def.dur; S.activeT = Math.max(S.activeT, def.dur);
      G.fx.burst('bubbleBig', d.pos.x, d.pos.y, 14, 1.8);
      ring(d.pos.x, d.pos.y, 1.6, 0.2, 0.5, 0xb89cff);
      sfx('dave_dash', { vol: 0.5, rate: 0.7 });
      S.last = { calmed: n };
      return true;
    },
    shock: function (def, d) {
      var atk = (S.lead && S.lead.stats && S.lead.stats.atkMul) || 1;
      var n = BDL.foes.stunAt(d.pos.x, d.pos.y, def.radius, def.stun, { kind: 'stun', dmg: Math.round(def.dmg * atk), push: 9 });
      ring(d.pos.x, d.pos.y, 0.5, def.radius, 0.45, 0xffe14a); ring(d.pos.x, d.pos.y, 0.3, def.radius * 0.7, 0.35, 0xffffff);
      G.fx.burst('spark', d.pos.x, d.pos.y, 14, 3); G.fx.burst('puff', d.pos.x, d.pos.y, 6, 1.6);
      G.shake(1.6);
      if (HX.hud.screenFx) HX.hud.screenFx('255,225,90', 0.3);
      sfx('gear_paralysis_zap', { vol: 0.9 });
      S.last = { foes: n };
      return true;
    },
    decoy: function (def, d) {
      var u = aimDir(), r = clearRun(d.pos.x, d.pos.y, u.x, u.y, 4, 0.8);
      var n = BDL.foes.lureTo(r.x, r.y, def.dur, { radius: def.radius, cx: d.pos.x, cy: d.pos.y, filter: function (f) { return !!f.body.sp.shark; } });
      S.decoy = { x: r.x, y: r.y, t: def.dur, tick: 0 };
      S.decoy.ring = ring(r.x, r.y, 0.3, 1.1, def.dur, 0xff7ab8, { hold: true, alpha: 0.7 });
      G.fx.burst('bubbleBig', r.x, r.y, 14, 1.2); G.fx.spawn('glow', r.x, r.y, 0.4, 0, 0, 1.6);
      sfx('harpoon_catch', { vol: 0.6, rate: 1.4 });
      S.activeT = Math.max(S.activeT, def.dur);
      S.last = { foes: n, x: r.x, y: r.y };
      return true;
    },
    rescue: function (def, d) {
      var t = BDL.tether && BDL.tether.target && BDL.tether.target();
      if (!t || !t.pos) t = nearestLoot(d.pos.x, d.pos.y, 60, function (l) { return l.state === 'sinking' && !l.tethered; });
      if (!t) { toast('Không có món nào đang chìm'); return false; }
      pullItem(t, 2.2, 10);
      G.fx.burst('bubble', t.pos.x, t.pos.y, 8, 0.8);
      ring(t.pos.x, t.pos.y, 1.6, 0.3, 0.5, 0xa6ff6a);
      sfx('dave_grab', { vol: 0.8 });
      S.last = { loot: t.id };
      return true;
    },
    cage: function (def, d) {
      var foe = BDL.foes.nearest(d.pos.x, d.pos.y, 26);
      if (!foe || !BDL.foes.cage(foe, def.dur)) { toast('Không có quái nào gần để nhốt'); return false; }
      var c = foe.body.center();
      ring(c.x, c.y, 0.3, 2.4, 0.5, 0xcfe3ee);
      G.fx.burst('spark', c.x, c.y, 8, 1.6);
      sfx('gear_ice_break', { vol: 0.7, rate: 0.6 });
      S.last = { foe: foe.id };
      return true;
    },
    blink: function (def, d) {
      var u = aimDir(), r = clearRun(d.pos.x, d.pos.y, u.x, u.y, def.dist, 0.55);
      if (r.len < 0.8) { toast('Vách chắn rồi'); return false; }
      var x0 = d.pos.x, y0 = d.pos.y;
      for (var i = 0; i <= 8; i++) G.fx.burst('bubbleBig', x0 + (r.x - x0) * i / 8, y0 + (r.y - y0) * i / 8, 2, 0.5);
      d.pos.x = r.x; d.pos.y = r.y;
      d.vel.x = u.x * 3.5; d.vel.y = u.y * 3.5;
      d.faceToward && d.faceToward(u.x);
      ring(x0, y0, 0.2, 1.4, 0.35, 0x7fe3ff); ring(r.x, r.y, 1.4, 0.2, 0.35, 0x7fe3ff);
      if (HX.hud.screenFx) HX.hud.screenFx('127,227,255', 0.25);
      sfx('dave_dash', { vol: 0.8, rate: 1.4 });
      S.last = { from: { x: x0, y: y0 }, to: { x: r.x, y: r.y }, len: r.len };
      return true;
    },
    reveal: function (def) {
      S.revealT = def.dur; S.revealOnly = null;
      S.activeT = Math.max(S.activeT, def.dur);
      sfx('o2_use', { vol: 0.5, rate: 1.6 });
      var d = diver();
      ring(d.pos.x, d.pos.y, 0.5, 16, 0.9, 0xffe27a);
      return true;
    },
    freeze: function (def, d) {
      var n = BDL.foes.stunAt(d.pos.x, d.pos.y, def.radius, def.dur, { kind: 'ice' });
      ring(d.pos.x, d.pos.y, 0.5, def.radius, 0.6, 0x9be8ff); ring(d.pos.x, d.pos.y, 0.3, def.radius * 0.6, 0.45, 0xffffff);
      G.fx.burst('puff', d.pos.x, d.pos.y, 10, 2.2); G.fx.burst('spark', d.pos.x, d.pos.y, 8, 2);
      if (HX.hud.screenFx) HX.hud.screenFx('140,220,255', 0.4);
      sfx('gear_ice_freeze', { vol: 0.9 });
      S.last = { foes: n };
      return true;
    },
    pull: function (def, d) {
      var pool = lootList().filter(function (l) { return dist(l.pos.x, l.pos.y, d.pos.x, d.pos.y) <= def.radius; });
      if (!pool.length) { toast('Không có đồ cổ nào trong ' + def.radius + ' m'); return false; }
      pool.forEach(function (l) { pullItem(l, 2.4, 7); });
      ring(d.pos.x, d.pos.y, def.radius, 0.8, 0.8, 0xc9a0ff); ring(d.pos.x, d.pos.y, def.radius * 0.6, 0.6, 0.6, 0xffffff);
      sfx('gear_paralysis_zap', { vol: 0.5, rate: 0.7 });
      S.last = { loot: pool.length };
      return true;
    },
    angel: function (def, d) {
      S.angelT = def.dur; S.activeT = Math.max(S.activeT, def.dur);
      ring(d.pos.x, d.pos.y, 2.4, 0.9, def.dur, 0xffe27a, { hold: true, follow: function () { return diver().pos; }, alpha: 0.75 });
      G.fx.spawn('glow', d.pos.x, d.pos.y, 0.5, 0, 0, 3);
      if (HX.hud.screenFx) HX.hud.screenFx('255,226,122', 0.35);
      sfx('o2_use', { vol: 0.8, rate: 0.7 });
      return true;
    },
  };

  // ---------- trạng thái bền theo thời gian ----------
  function stepTimed(dt) {
    var d = diver();
    if (S.activeT > 0) S.activeT = Math.max(0, S.activeT - dt);
    if (S.heal) {
      var h = S.heal;
      h.t -= dt; h.tick -= dt;
      if (!daveOut() && dist(d.pos.x, d.pos.y, h.x, h.y) <= h.r) {
        var mx = G.loadout ? G.loadout.o2 : 100;
        d.o2 = Math.min(mx, d.o2 + h.rate * dt);
        S.healed += h.rate * dt;
      }
      if (h.tick <= 0) { h.tick = 0.18; var a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * h.r; G.fx.burst('bubble', h.x + Math.cos(a) * r, h.y + Math.sin(a) * r * 0.6, 1, 0.3); }
      if (h.t <= 0) S.heal = null;
    }
    if (S.angelT > 0) {
      S.angelT = Math.max(0, S.angelT - dt);
      S.angelTick -= dt;
      if (S.angelTick <= 0) { S.angelTick = 0.22; G.fx.spawn('glow', d.pos.x + (Math.random() - 0.5) * 0.6, d.pos.y + (Math.random() - 0.5) * 0.8, 0.5, 0, 0.3, 0.9); }
    }
    if (S.vanishT > 0) {
      S.vanishT = Math.max(0, S.vanishT - dt);
      d.body.material.uniforms.opacity.value = S.vanishT > 0 ? 0.35 + 0.1 * Math.sin(G.t * 9) : 1;
    } else if (S.fadedBody) { d.body.material.uniforms.opacity.value = 1; }
    S.fadedBody = S.vanishT > 0;
    if (S.decoy) {
      var c = S.decoy; c.t -= dt; c.tick -= dt;
      if (c.tick <= 0) { c.tick = 0.14; G.fx.burst('bubbleBig', c.x + (Math.random() - 0.5) * 0.5, c.y + (Math.random() - 0.5) * 0.4, 1, 0.5); }
      if (c.t <= 0) S.decoy = null;
    }
    if (S.gong) {
      var g = S.gong; g.t -= dt; g.tick -= dt;
      if (g.tick <= 0 && g.t > 0) { g.tick = 1.6; ring(g.x, g.y, 0.4, 5, 1.1, 0xffd24a, { alpha: 0.5 }); }
      if (g.t <= 0) S.gong = null;
    }
    stepPulls(dt);
    // soi thấu: đánh dấu đồ cổ + quái qua vách
    if (S.revealT > 0) {
      S.revealT -= dt;
      var marks = [];
      lootList().forEach(function (l) { marks.push({ x: l.pos.x, y: l.pos.y, kind: 'loot' }); });
      if (S.revealOnly !== 'loot') BDL.foes.list().forEach(function (f) { var c = f.body.center(); marks.push({ x: c.x, y: c.y, kind: 'foe' }); });
      if (HX.hud.marks) HX.hud.marks(marks);
      S.marksOn = true;
      if (S.revealT <= 0) { S.revealT = 0; S.revealOnly = null; }
    } else if (S.marksOn) {
      S.marksOn = false;
      if (HX.hud.marks) HX.hud.marks(null);
    }
  }

  // ---------- giao diện BDL.skill ----------
  function leadOf() {
    var ca = BDL.run && BDL.run.ca, crew = ca && ca.crew;
    if (crew && crew.lead && crew.lead.skill) return { id: crew.lead.id, skill: crew.lead.skill, stats: crew.lead.stats || {} };
    var C = BDL.content, row = C && C.crewById && C.crewById.bao;
    return { id: 'bao', skill: Object.assign({}, row.skill), stats: { atkMul: 1, cdMul: 1 } };
  }
  function rowForSkill(id) {
    var C = BDL.content, hit = null;
    C.crew.forEach(function (c) { if (c.skill.id === id || c.id === id) hit = c; });
    return hit;
  }
  function setSkill(def, lead) {
    S.def = def; S.lead = lead;
    BDL.skill.def = def; BDL.skill.icon = ICON[def.id] || '✨';
    BDL.skill.cdMax = Math.max(0.1, def.cd);
    BDL.skill.cdLeft = 0;
    BDL.skill.crewId = lead.id;
  }

  var api = BDL.skill = {
    def: null, icon: '', cdLeft: 0, cdMax: 1, crewId: null,
    ready: function () { return !!S && !!S.def && api.cdLeft <= 0 && !daveOut() && !(G.deck && G.deck.on); },
    // Dùng kỹ năng. Trả true nếu đã tung (hồi chiêu bắt đầu); false nếu chưa hồi, không có mục tiêu hay đang trên boong.
    cast: function () {
      if (!S || !S.def || !G) return false;
      var d = diver();
      if (daveOut()) return false;
      if (G.deck && G.deck.on) { toast('Xuống nước mới dùng được kỹ năng'); return false; }
      if (api.cdLeft > 0) {
        if (G.t - S.nagT > 0.8) { S.nagT = G.t; toast('Kỹ năng chưa hồi xong · ' + Math.ceil(api.cdLeft) + ' s'); }
        return false;
      }
      var fn = IMPL[S.def.id];
      if (!fn) return false;
      var ok = fn(S.def, d);
      if (ok === false) return false;
      api.cdLeft = api.cdMax;
      S.stats.casts++;
      S.byId[S.def.id] = (S.byId[S.def.id] || 0) + 1;
      var ca = BDL.run && BDL.run.ca;
      if (ca) ca.skills = (ca.skills || 0) + 1;
      toast(S.def.name);
      return true;
    },
    // đang còn hiệu lực dài (vòng hồi O₂, tàng hình, soi thấu, thiên thần, mồi): { left, max } cho vòng sáng ở HUD
    activeLeft: function () { return S ? S.activeT : 0; },
    stats: function () { return S ? { casts: S.stats.casts, pries: S.stats.pries, byId: S.byId } : null; },
  };

  BDL.systems.push({
    name: 'skills',
    build: function (g) {
      G = g;
      S = { def: null, lead: null, rings: [], pulls: [], heal: null, decoy: null, gong: null, angelT: 0, angelTick: 0, vanishT: 0, fadedBody: false,
        revealT: 0, revealOnly: null, marksOn: false, activeT: 0, nagT: -9, last: null, healed: 0,
        stats: { casts: 0, pries: 0 }, byId: {} };
      var lead = leadOf();
      setSkill(lead.skill, lead);
      // thiên thần: đè vulnerable() của Dave (mọi nguồn sát thương đều hỏi nó trước khi hurt)
      var d = G.diver, orig = d.vulnerable;
      d.vulnerable = function () { return S && S.angelT > 0 ? false : orig.call(this); };
      window.BDL_DEBUG = window.BDL_DEBUG || {};
      window.BDL_DEBUG.skill = {
        // id: mã kỹ năng (flash, healring, ...) hoặc mã crew (bao, hue, ...). Đặt lại hồi chiêu về 0.
        set: function (id) {
          var row = rowForSkill(id);
          if (!row) return false;
          var ca = BDL.run && BDL.run.ca, mul = (lead.stats && lead.stats.cdMul) || 1;
          S.heal = null; S.decoy = null; S.gong = null; S.angelT = 0; S.vanishT = 0; S.revealT = 0; S.pulls.length = 0; S.activeT = 0;
          setSkill(Object.assign({}, row.skill, { cd: row.skill.cd * mul }), { id: row.id, skill: row.skill, stats: lead.stats });
          return row.skill.id;
        },
        cast: function () { return api.cast(); },
        resetCd: function () { api.cdLeft = 0; },
        info: function () {
          var l = S.last;
          return { id: S.def.id, crew: api.crewId, cdLeft: api.cdLeft, cdMax: api.cdMax, casts: S.stats.casts, pries: S.stats.pries, byId: S.byId,
            angel: S.angelT, vanish: S.vanishT, reveal: S.revealT, heal: !!S.heal, healed: S.healed, decoy: !!S.decoy, gong: !!S.gong, pulls: S.pulls.length,
            blind: BDL.foes.blindLeft(), last: l, caCasts: BDL.run && BDL.run.ca ? BDL.run.ca.skills : null, rings: S.rings.length };
        },
      };
    },
    update: function (dt, input) {
      if (!S || !S.def) return;
      api.cdLeft = Math.max(0, api.cdLeft - dt);
      if (input && input.skill) api.cast();
      stepRings(dt);
      stepTimed(dt);
    },
    teardown: function (g) {
      if (!S) return;
      S.rings.forEach(dropRing);
      if (S.marksOn && HX.hud.marks) HX.hud.marks(null);
      if (g.diver && g.diver.body && g.diver.body.material) g.diver.body.material.uniforms.opacity.value = 1;
      S = null;
    },
  });
})(window.BDL);
