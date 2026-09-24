/*
 * Xuôi Dòng — mô phỏng thế giới, nhập liệu, giao diện. Vẽ nằm ở render.js.
 * Toạ độ: x thế giới tăng về phía mũi thuyền (px ảo); y tính từ giữa lòng sông, xuống là dương.
 */
(function (XD) {
  'use strict';
  var T = XD.TUNE, AT = window.XD_ATLAS;
  var Q = new URLSearchParams(location.search);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function mod(a, n) { return ((a % n) + n) % n; }
  function mulberry(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickWeighted(table, r) {
    var keys = Object.keys(table), sum = 0, i;
    for (i = 0; i < keys.length; i++) sum += table[keys[i]];
    var v = r * sum;
    for (i = 0; i < keys.length; i++) { v -= table[keys[i]]; if (v <= 0) return keys[i]; }
    return keys[keys.length - 1];
  }
  XD.util = { clamp: clamp, lerp: lerp, smooth: smooth, mod: mod };

  // ---------------------------------------------------------------- lộ trình
  var LEG_X = [], ROUTE_LEN = 0;
  XD.ROUTE.forEach(function (l) { LEG_X.push(ROUTE_LEN); ROUTE_LEN += l.len; });
  XD.ROUTE_LEN = ROUTE_LEN;

  // Trạng thái dải sông ở x: chặng a, chặng kế b, t = độ trộn (chỉ khác 0 trong BLEND px cuối chặng).
  function bandAt(x) {
    var xx = mod(x, ROUTE_LEN), i = LEG_X.length - 1;
    while (LEG_X[i] > xx) i--;
    var leg = XD.ROUTE[i], rem = leg.len - (xx - LEG_X[i]);
    var nxt = XD.ROUTE[(i + 1) % XD.ROUTE.length];
    var t = rem < T.blend ? smooth(1 - rem / T.blend) : 0;
    return { a: leg.biome, b: nxt.biome, t: t, rem: rem, blendIn: rem < T.blend };
  }
  function mixNum(band, key, def) {
    var A = XD.BIOMES[band.a], B = XD.BIOMES[band.b];
    var a = A[key] == null ? def : A[key], b = B[key] == null ? def : B[key];
    return lerp(a, b, band.t);
  }
  XD.bandAt = bandAt; XD.mixNum = mixNum;

  // ---------------------------------------------------------------- trạng thái
  var seed = parseInt(Q.get('seed'), 10) || ((Math.random() * 1e9) | 0);
  var G = XD.game = {
    mode: 'title', seed: seed, rand: mulberry(seed),
    x: 0, speed: T.cruise, boatY: 0, boatVY: 0, time: 0,
    t: T.startT, freeze: false,
    wx: { state: 'clear', left: 120 }, wp: { dim: 0, rain: 0, clouds: 0.35, wind: 0.15, thunder: 0 },
    flash: 0, thunderIn: 0,
    ents: [], fx: [], popups: [],
    caught: 0, points: 0, dist: 0, startX: 0,
    shake: 0, bumpT: 0, boostT: 0, hornT: -1, hornCd: 0,
    boatKey: 'solo', frameI: 0,
    input: { up: 0, down: 0, left: 0, right: 0, touchY: null },
    spawnX: 0, fishX: 0, flockIn: 8, lastBiome: null,
    view: { w: 640, h: 360, S: 2, cy: 194, K: 160, bx: 180 },
    stats: { bumps: 0, scoops: 0, boosts: 0 },
    journal: {},
  };
  try { G.journal = JSON.parse(localStorage.getItem('xd.journal') || '{}') || {}; } catch (e) { G.journal = {}; }
  try { G.boatKey = XD.BOATS[localStorage.getItem('xd.boat')] ? localStorage.getItem('xd.boat') : 'solo'; } catch (e) { /* mặc định */ }

  // ---------------------------------------------------------------- ngày đêm
  function dayAt(t) {
    var D = XD.DAY, i = D.length - 1;
    while (D[i].t > t) i--;
    var k0 = D[i], k1 = D[(i + 1) % D.length];
    var t1 = k1.t <= k0.t ? k1.t + 1 : k1.t;
    var f = smooth(clamp((t - k0.t) / (t1 - k0.t), 0, 1));
    var o = { name: k0.name, icon: k0.icon, music: k0.music, amb: {}, f: f };
    ['lamp', 'godray', 'fireflies', 'stars'].forEach(function (k) { o[k] = lerp(k0[k], k1[k], f); });
    o.grade = [0, 1, 2].map(function (c) { return lerp(k0.grade[c], k1.grade[c], f); });
    o.tone = [0, 1, 2, 3].map(function (c) { return lerp(k0.tone[c], k1.tone[c], f); });
    var ak = {};
    Object.keys(k0.amb).concat(Object.keys(k1.amb)).forEach(function (k) { ak[k] = 1; });
    Object.keys(ak).forEach(function (k) { o.amb[k] = lerp(k0.amb[k] || 0, k1.amb[k] || 0, f); });
    return o;
  }
  XD.dayAt = dayAt;
  function clockText(t) {
    var m = Math.floor(mod(t, 1) * 24 * 60);
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }

  // ---------------------------------------------------------------- thời tiết
  function setWeather(s) {
    var W = XD.WEATHER[s];
    G.wx.state = s;
    G.wx.left = lerp(W.dur[0], W.dur[1], G.rand());
  }
  function stepWeather(dt) {
    G.wx.left -= dt;
    if (G.wx.left <= 0) setWeather(pickWeighted(XD.WEATHER[G.wx.state].next, G.rand()));
    var W = XD.WEATHER[G.wx.state], k = 1 - Math.exp(-dt / 8);
    ['dim', 'rain', 'clouds', 'wind'].forEach(function (p) { G.wp[p] = lerp(G.wp[p], W[p] || 0, k); });
    G.wp.thunder = W.thunder || 0;
    if (G.wp.thunder) {
      G.thunderIn -= dt;
      if (G.thunderIn <= 0) {
        G.flash = 1;
        G.thunderIn = 6 + G.rand() * 9;
        setTimeout(function () { XD.audio.play('thunder', { gain: 0.8 + Math.random() * 0.3 }); }, 250 + Math.random() * 900);
      }
    }
    G.flash = Math.max(0, G.flash - dt * 1.8);
  }

  // ---------------------------------------------------------------- khung
  function frame(name) { return AT.frames[name]; }
  function animFrames(k) {
    if (Array.isArray(k)) return k;
    return AT.anims[k];
  }
  XD.frame = frame; XD.animFrames = animFrames;

  function edges(x) {
    var b = bandAt(x), open = mixNum(b, 'open', 0), K = G.view.K;
    return { top: -T.riverHalf - open * K, bot: T.riverHalf + open * K, open: open, band: b };
  }
  XD.edges = edges;

  // ---------------------------------------------------------------- sinh vật thể
  function spawnEnt(kind, x, y, extra) {
    var K = XD.KINDS[kind], e = { kind: kind, x: x, y: y, vx: 0, vy: 0, t: G.rand() * 10, state: 'idle', v: 0, cd: 0 };
    if (K.anims) e.v = (G.rand() * K.anims.length) | 0;
    if (K.frames) e.v = (G.rand() * K.frames.length) | 0;
    if (K.drift) e.vx = K.drift * (0.7 + G.rand() * 0.6);
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    G.ents.push(e);
    return e;
  }
  XD.spawnEnt = spawnEnt;

  function entFrame(e) {
    var K = XD.KINDS[e.kind];
    if (K.frames) return K.frames[e.v];
    if (!K.anims) return null;
    var fr = animFrames(K.anims[e.v]);
    if (K.frameRange) fr = fr.slice(K.frameRange[0], K.frameRange[1] + 1);
    return fr[Math.floor(e.t * (K.fps || 4)) % fr.length];
  }
  XD.entFrame = entFrame;

  function hitBox(e) {
    var K = XD.KINDS[e.kind], f = frame(entFrame(e));
    return [e.x - f.w * K.hit[0], e.y - f.h * K.hit[1], e.x + f.w * K.hit[0], e.y + f.h * K.hit[1]];
  }

  function spawnAhead() {
    var ahead = G.x + G.view.w + 160;
    while (G.spawnX < ahead) {
      G.spawnX += 70 + G.rand() * 90;
      var x = G.spawnX, ed = edges(x), b = ed.band;
      var biome = XD.BIOMES[G.rand() < b.t ? b.b : b.a];
      var kind = pickWeighted(biome.spawn, G.rand());
      var K = XD.KINDS[kind];
      var margin = K.obstacle ? 30 : 16;
      var y = lerp(ed.top + margin, ed.bot - margin, G.rand());
      if (K.obstacle && G.rand() < 0.35) continue;      // thưa bớt: sông thoáng mới chill
      var e = spawnEnt(kind, x, y);
      if (K.perch && G.rand() < K.perch * biome.birds) {
        var bi = (G.rand() * XD.BIRDS.length) | 0;
        spawnEnt('bird', x + (G.rand() - 0.5) * 10, y - 8, { owner: e, sp: bi, dx: (G.rand() - 0.5) * 12, dy: -frame(entFrame(e)).h * 0.3 });
      }
      if (kind === 'lily' && G.rand() < 0.3) {
        spawnEnt('frog', x, y - 4, { owner: e, dx: 0, dy: -4 });
      }
    }
    while (G.fishX < ahead) {
      G.fishX += 90 + G.rand() * 110;
      var fx = G.fishX, fe = edges(fx), fb = fe.band;
      var fbiome = XD.BIOMES[G.rand() < fb.t ? fb.b : fb.a];
      var night = dayAt(G.t).stars;
      var table = {};
      Object.keys(fbiome.fish).forEach(function (s) { table[s] = fbiome.fish[s] * lerp(1, XD.FISH[s].night, night); });
      var sp = pickWeighted(table, G.rand());
      spawnEnt('fish', fx, lerp(fe.top + 26, fe.bot - 16, G.rand()), {
        sp: sp, vx: (G.rand() - 0.5) * 30, jumpIn: 2 + G.rand() * 6, jt: -1, wob: G.rand() * 6,
      });
    }
  }

  // ---------------------------------------------------------------- hiệu ứng
  function fx(kind, x, y, o) {
    var p = { kind: kind, x: x, y: y, vx: 0, vy: 0, t: 0, life: 1 };
    if (o) Object.keys(o).forEach(function (k) { p[k] = o[k]; });
    G.fx.push(p);
    return p;
  }
  XD.fx = fx;
  function popup(text, o) {
    G.popups.push({ text: text, t: 0, life: 2.2, color: (o && o.color) || '#fff', icon: o && o.icon, dy: G.popups.filter(function (p) { return p.t < 0.6; }).length * 12 });
  }
  function splash(x, y, big) {
    fx('splash', x, y, { life: 0.5, big: big });
    for (var i = 0; i < (big ? 10 : 5); i++) {
      fx('drop', x, y, { vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70, life: 0.5 + Math.random() * 0.3, z: 0 });
    }
  }
  function sparkle(x, y, n) {
    for (var i = 0; i < n; i++) fx('sparkle', x + (Math.random() - 0.5) * 30, y - Math.random() * 30, { vy: -12 - Math.random() * 18, life: 0.6 + Math.random() * 0.6, f: (Math.random() * 8) | 0 });
  }

  // ---------------------------------------------------------------- chạm
  function boatWX() { return G.x + G.view.bx; }
  function box(offs, bx, by) { return [bx + offs[0], by + offs[1], bx + offs[2], by + offs[3]]; }
  function overlap(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }

  var TOUCH = {
    catch: function (e) {
      var F = XD.FISH[e.sp];
      e.dead = true;
      G.caught++;
      G.points += F.pts;
      var j = G.journal[e.sp] || (G.journal[e.sp] = { n: 0, first: clockText(G.t), phase: dayAt(G.t).name });
      var isNew = j.n === 0;
      j.n++;
      saveJournal();
      splash(e.x, e.y, true);
      sparkle(e.x, e.y, F.rare ? 16 : 7);
      XD.audio.play(F.rare ? 'rare' : 'fish');
      XD.audio.play('splash', { gain: 0.7 });
      popup(F.name + (isNew ? ' · mới!' : ''), { icon: animFrames(F.jump)[2], color: F.rare ? '#ffd65a' : '#fff' });
      popup('+' + F.pts + ' điểm', { color: F.rare ? '#ffd65a' : '#ffe9a8' });
    },
    scoop: function (e) {
      var K = XD.KINDS[e.kind];
      e.dead = true;
      G.points += K.pts;
      G.stats.scoops++;
      splash(e.x, e.y, false);
      sparkle(e.x, e.y, 4);
      XD.audio.play('scoop');
      popup((e.kind === 'barrel' ? 'Vớt được thùng gỗ' : 'Vớt được hòm gỗ') + ' +' + K.pts, { color: '#ffe9a8' });
    },
    boost: function (e) {
      e.dead = true;
      G.boostT = 3.2;
      G.stats.boosts++;
      sparkle(e.x, e.y, 8);
      XD.audio.play('boost');
      XD.audio.play('pickup', { gain: 0.6 });
      popup('Xuôi dòng nhanh!', { color: '#c9ff8a' });
    },
    bump: function (e) {
      if (e.cd > 0) return;
      e.cd = 2;
      G.stats.bumps++;
      G.shake = 0.4; G.bumpT = 0.6;
      G.boatVY += (G.boatY < e.y ? -1 : 1) * 140;
      G.speed *= 0.45;
      splash(boatWX() + 70, G.boatY, true);
      fx('puff', boatWX() + 60, G.boatY - 10, { life: 0.5 });
      XD.audio.play('hit');
      XD.audio.play('crack', { gain: 0.8 });
      var lost = Math.min(G.caught, 1 + ((G.rand() * 2) | 0));
      G.caught -= lost;
      G.points = Math.max(0, G.points - 3);
      for (var i = 0; i < lost; i++) {
        var sp = Object.keys(XD.FISH)[(G.rand() * 5) | 0];
        fx('slip', boatWX() - 20 + i * 18, G.boatY - 30, { vx: -30 - G.rand() * 30, vy: -90, life: 0.9, sp: sp });
      }
      popup(lost ? '-3 điểm · ' + lost + ' cá trượt khỏi lưới' : '-3 điểm', { color: '#ffb0a0' });
    },
  };
  XD.TOUCH = TOUCH;

  function saveJournal() {
    try { localStorage.setItem('xd.journal', JSON.stringify(G.journal)); } catch (e) { /* riêng tư: bỏ qua */ }
  }

  function horn() {
    if (G.hornCd > 0) return;
    G.hornCd = 1.4; G.hornT = 0;
    XD.audio.play('whistle');
    var cx = boatWX() + XD.BOAT_PTS.chimney[0], cy = G.boatY + XD.BOAT_PTS.chimney[1];
    for (var i = 0; i < 3; i++) fx('smoke', cx + i * 4, cy - 14, { vx: -14 - i * 6, vy: -16 - i * 5, life: 1.4 + i * 0.3, delay: 0.15 + i * 0.12 });
    var bx = boatWX();
    G.ents.forEach(function (e) {
      if (e.state !== 'idle') return;
      var d = Math.hypot(e.x - bx, e.y - G.boatY);
      if (e.kind === 'bird' && d < 320) flyAway(e, d);
      if (e.kind === 'frog' && d < 240) leap(e);
      if (e.kind === 'turtle' && d < 200) { e.state = 'dive'; e.t = 0; }
    });
  }
  XD.horn = horn;

  function flyAway(e, d) {
    e.state = 'fly'; e.t = 0; e.owner = null;
    e.vx = 60 + G.rand() * 60; e.vy = -30 - G.rand() * 20; e.alt = 0; e.delay = (d || 0) / 900;
    XD.audio.play('bird', { gain: 0.6, rate: 1.1 });
  }
  function leap(e) {
    e.state = 'leap'; e.t = 0; e.owner = null; e.vx = 40 + G.rand() * 20;
    XD.audio.play('frog', { gain: 0.7 });
  }

  // ---------------------------------------------------------------- bước mô phỏng
  function step(dt) {
    var inp = G.input, auto = G.mode === 'title';
    G.time += dt;
    if (!G.freeze) G.t = mod(G.t + dt / T.dayLen, 1);
    stepWeather(dt);

    var target = T.cruise;
    if (!auto) {
      if (inp.left) target = T.slow;
      if (inp.right) target = T.fast;
    }
    if (G.boostT > 0) { G.boostT -= dt; target = Math.max(target, T.boost); }
    var accel = G.speed < target ? 70 : 90;
    G.speed = G.speed < target ? Math.min(target, G.speed + accel * dt) : Math.max(target, G.speed - accel * dt);
    G.x += G.speed * dt;
    G.dist += G.speed * dt;

    var ed = edges(boatWX());
    var lo = ed.top + 52, hi = ed.bot - 34;
    var want = 0;
    if (auto) {
      want = clamp((Math.sin(G.time * 0.23) * 0.6 * (hi - lo) / 2 + (lo + hi) / 2 - G.boatY) * 1.5, -60, 60);
    } else if (inp.touchY != null) {
      want = clamp((inp.touchY - G.boatY) * 4, -T.steer, T.steer);
    } else {
      want = (inp.down - inp.up) * T.steer;
    }
    G.boatVY = lerp(G.boatVY, want, 1 - Math.exp(-dt * 6));
    G.boatY += G.boatVY * dt;
    if (G.boatY < lo) { G.boatY = lerp(G.boatY, lo, 1 - Math.exp(-dt * 8)); }
    if (G.boatY > hi) { G.boatY = lerp(G.boatY, hi, 1 - Math.exp(-dt * 8)); }

    G.shake = Math.max(0, G.shake - dt);
    G.bumpT = Math.max(0, G.bumpT - dt);
    G.hornCd = Math.max(0, G.hornCd - dt);
    if (G.hornT >= 0) { G.hornT += dt; if (G.hornT > 0.75) G.hornT = -1; }

    spawnAhead();
    stepEnts(dt, auto);
    stepFx(dt);
    wake(dt);
    ambientLife(dt);

    var b = bandAt(boatWX()), cur = b.t > 0.5 ? b.b : b.a;
    if (cur !== G.lastBiome) {
      if (G.lastBiome && !auto) XD.ui.toast(XD.BIOMES[cur].name);
      G.lastBiome = cur;
    }
  }

  function stepEnts(dt, auto) {
    var bx = boatWX(), hull = box(XD.BOAT_PTS.hull, bx, G.boatY), net = box(XD.BOAT_PTS.netBox, bx, G.boatY);
    var left = G.x - 260;
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i], K = XD.KINDS[e.kind];
      e.t += dt;
      e.cd = Math.max(0, e.cd - dt);
      if (e.owner) {
        if (e.owner.dead) e.owner = null;
        else { e.x = e.owner.x + e.dx; e.y = e.owner.y + e.dy; }
      }
      if (e.kind === 'fish') stepFish(e, dt);
      else if (e.kind === 'bird' && e.state === 'fly') {
        if (e.delay > 0) { e.delay -= dt; e.t = 0; }
        else { e.x += e.vx * dt; e.alt += 55 * dt; e.vy += 8 * dt; e.y += e.vy * dt * 0.2; if (e.alt > 260) e.dead = true; }
      } else if (e.kind === 'frog' && e.state === 'leap') {
        e.x += e.vx * dt;
        if (e.t > 0.45) { splash(e.x, e.y, false); XD.audio.play('splash', { gain: 0.5 }); e.dead = true; }
      } else if (e.kind === 'turtle' && e.state === 'dive') {
        if (e.t > 1.2) e.dead = true;
      } else if (!e.owner) {
        e.x += e.vx * dt;
      }
      if (e.kind === 'bird' && e.state === 'idle' && !auto && Math.abs(e.x - (bx + 40)) < 110 && Math.abs(e.y - G.boatY) < 90) flyAway(e, 0);
      if (e.kind === 'turtle' && e.state === 'idle' && Math.abs(e.x - bx) < 120 && Math.abs(e.y - G.boatY) < 50) { e.state = 'dive'; e.t = 0; }
      if (K.touch && !e.dead) {
        if (K.touch === 'catch') {
          if (!auto && e.jt < 0.25 && overlap(net, [e.x - 9, e.y - 7, e.x + 9, e.y + 7])) TOUCH.catch(e);
        } else {
          var hb = hitBox(e);
          if (K.touch === 'scoop' || K.touch === 'boost') {
            if (!auto && (overlap(net, hb) || overlap(hull, hb))) TOUCH[K.touch](e);
          } else if (overlap(hull, hb) || overlap(net, hb)) {
            if (!auto) TOUCH[K.touch](e);
            else if (e.cd <= 0) { e.cd = 2; G.boatVY += (G.boatY < e.y ? -1 : 1) * 120; }
            // Còn cọ vào đá thì thân thuyền trượt dần ra, không va lần hai khi hết hồi.
            G.boatY += (G.boatY < e.y ? -1 : 1) * 110 * dt;
            e.cd = Math.max(e.cd, 0.5);
          }
        }
      }
      if (e.x < left) e.dead = true;
    }
    G.ents = G.ents.filter(function (e) { return !e.dead; });
  }

  function stepFish(e, dt) {
    var ed = edges(e.x);
    if (e.jt >= 0) {
      e.jt += dt;
      if (e.jt > 1.0) { e.jt = -1; e.jumpIn = 4 + G.rand() * 7; splash(e.x + 4, e.y, false); }
      else if (Math.abs(e.jt - 0.2) < dt) fx('ring', e.x, e.y, { life: 0.8 });
      e.x += 20 * dt;
      return;
    }
    e.jumpIn -= dt;
    if (e.jumpIn <= 0) e.jt = 0;
    e.x += e.vx * dt + Math.sin(e.t * 1.7 + e.wob) * 6 * dt;
    e.y += Math.sin(e.t * 0.9 + e.wob) * 8 * dt;
    e.y = clamp(e.y, ed.top + 26, ed.bot - 14);
    if (G.rand() < dt * 0.25) fx('bubble', e.x, e.y - 2, { vy: -6, life: 1.2, f: (G.rand() * 4) | 0 });
  }

  function stepFx(dt) {
    var i, p;
    for (i = 0; i < G.fx.length; i++) {
      p = G.fx[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'drop' || p.kind === 'slip') { p.vy += 260 * dt; }
      if (p.kind === 'slip' && p.t > p.life - 0.05) splash(p.x, p.y + 30, false);
    }
    G.fx = G.fx.filter(function (p) { return p.t < p.life; });
    for (i = 0; i < G.popups.length; i++) G.popups[i].t += dt;
    G.popups = G.popups.filter(function (p) { return p.t < p.life; });
  }

  var wakeAcc = 0;
  function wake(dt) {
    var bx = boatWX(), sp = G.speed / T.cruise;
    wakeAcc += dt * (6 + sp * 10);
    while (wakeAcc > 1) {
      wakeAcc -= 1;
      var side = Math.random() < 0.5 ? -1 : 1;
      fx('foam', bx - 70 + Math.random() * 20, G.boatY + 8 + side * (6 + Math.random() * 6), { vy: side * (4 + sp * 6), life: 1.2 + sp * 0.8, s: Math.random() < 0.3 ? 2 : 1 });
      if (Math.random() < 0.25 * sp) fx('blob', bx - 78, G.boatY + 6 + (Math.random() - 0.5) * 16, { life: 1.1, f: (Math.random() * 4) | 0 });
      if (Math.random() < 0.18 * sp) fx('foam', bx + 76 + Math.random() * 10, G.boatY + 6 + (Math.random() - 0.5) * 20, { vy: (Math.random() - 0.5) * 20, life: 0.8, s: 1 });
    }
  }

  function ambientLife(dt) {
    var d = dayAt(G.t), bx = boatWX(), ed = edges(bx + G.view.w * 0.5), b = ed.band;
    var bm = XD.BIOMES[b.t > 0.5 ? b.b : b.a];
    // Bầy chim bay ngang, bóng in xuống nước.
    G.flockIn -= dt;
    if (G.flockIn <= 0) {
      G.flockIn = 10 + G.rand() * 18;
      if ((1 - d.stars) * bm.birds > 0.3 && G.wp.rain < 0.5) {
        var n = 2 + ((G.rand() * 4) | 0), band = [0, 2, 4, 6][(G.rand() * 4) | 0], y0 = ed.top + G.rand() * (ed.bot - ed.top);
        for (var i = 0; i < n; i++) {
          fx('flock', G.x + G.view.w + 40 + i * 22, y0 + (i % 2) * 14 - i * 4, { vx: -(40 + G.rand() * 10) + G.speed, vy: -6, life: 30, band: band, alt: 70 + i * 6, ph: G.rand() * 4 });
        }
      }
    }
    // Đom đóm & bướm sát hai bờ.
    var wantFf = d.fireflies * mixNum(b, 'fireflies', 0) * 26;
    var wantBf = (1 - d.stars) * (1 - G.wp.rain) * mixNum(b, 'butterflies', 0) * 6;
    var ff = 0, bf = 0;
    G.fx.forEach(function (p) { if (p.kind === 'firefly') ff++; if (p.kind === 'butterfly') bf++; });
    if (ff < wantFf && G.rand() < dt * 8) {
      var top = G.rand() < 0.5, ex = G.x + G.rand() * (G.view.w + 200);
      var e2 = edges(ex), yy = top ? e2.top + 6 + G.rand() * 40 : e2.bot - 6 - G.rand() * 30;
      fx('firefly', ex, yy, { vx: (G.rand() - 0.5) * 8, vy: (G.rand() - 0.5) * 6, life: 6 + G.rand() * 6, ph: G.rand() * 6 });
    }
    if (bf < wantBf && G.rand() < dt * 1.2) {
      var bt = G.rand() < 0.6, bxw = G.x + G.view.w * (0.3 + G.rand() * 0.8);
      var e3 = edges(bxw);
      fx('butterfly', bxw, bt ? e3.top - 10 + G.rand() * 30 : e3.bot + G.rand() * 16, { vx: 10 + G.rand() * 14, vy: 0, life: 10, row: (G.rand() * 5) | 0, ph: G.rand() * 6 });
    }
    // Nắng lấp lánh trên mặt biển.
    var glint = mixNum(b, 'sea', 0) * (1 - d.stars) * (1 - G.wp.dim * 2) * 14 * dt;
    while (glint > 0) {
      if (G.rand() < glint) {
        var gx = G.x + G.rand() * G.view.w, e5 = edges(gx);
        fx('glint', gx, lerp(e5.top + 10, e5.bot - 6, G.rand()), { life: 0.9, f: (G.rand() * 8) | 0 });
      }
      glint -= 1;
    }
    // Gợn mưa trên mặt nước.
    if (G.wp.rain > 0.05) {
      var nr = G.wp.rain * 40 * dt;
      while (nr > 0) {
        if (G.rand() < nr) {
          var rx = G.x + G.rand() * G.view.w, e4 = edges(rx);
          fx('ripple', rx, lerp(e4.top + 8, e4.bot - 4, G.rand()), { life: 0.6 });
        }
        nr -= 1;
      }
    }
    // Tiếng lẻ: chim hót ban ngày, cú đêm, ếch đầm.
    if (G.rand() < dt * 0.05 * (d.amb.birds || 0) * bm.birds * (1 - G.wp.rain)) XD.audio.play('bird', { gain: 0.5 + G.rand() * 0.4, pan: G.rand() * 2 - 1 });
    if (G.rand() < dt * 0.025 * (d.amb.owls || 0) * (1 - bm.sea)) XD.audio.play('owl', { gain: 0.6, pan: G.rand() * 2 - 1 });
    if (bm.spawn.frog && G.rand() < dt * 0.06) XD.audio.play('frog', { gain: 0.35, pan: G.rand() * 2 - 1 });
  }

  // ---------------------------------------------------------------- âm thanh theo cảnh
  function audioMix() {
    var d = dayAt(G.t), b = bandAt(boatWX()), sea = mixNum(b, 'sea', 0), birds = mixNum(b, 'birds', 1);
    var r = Math.min(1, G.wp.rain);
    return {
      music: d.music,
      musicGain: G.mode === 'play' ? 1 : G.mode === 'pause' ? 0.35 : 0.8,
      beds: {
        water: 1 - sea * 0.6,
        sea: sea,
        morning: (d.amb.morning || 0) * Math.min(1, birds) * (1 - r * 0.7),
        afternoon: (d.amb.afternoon || 0) * Math.min(1, birds) * (1 - r * 0.7),
        night: (d.amb.night || 0) * (1 - sea * 0.5),
        rivnight: (d.amb.rivnight || 0) * (1 - sea),
        rain: r,
        wind: Math.min(1, G.wp.wind * 0.7 + sea * 0.5),
        hull: G.mode === 'pause' ? 0 : clamp(G.speed / T.fast, 0, 1.2),
      },
    };
  }

  // ---------------------------------------------------------------- khung hình & kích thước
  var canvas, ctx;
  function resize() {
    var W = window.innerWidth, H = window.innerHeight, portrait = H > W * 1.1;
    var cssH = portrait ? Math.round(Math.min(H * 0.62, W * 0.85)) : H;
    var dpr = window.devicePixelRatio || 1;
    var dw = Math.round(W * dpr), dh = Math.round(cssH * dpr);
    var S = Math.max(1, Math.ceil(dh / 400));
    canvas.width = dw; canvas.height = dh;
    canvas.style.width = W + 'px'; canvas.style.height = cssH + 'px';
    canvas.style.top = '0px';
    document.body.style.setProperty('--band', cssH + 'px');
    document.body.classList.toggle('portrait', portrait);
    var v = G.view;
    v.S = S; v.w = Math.ceil(dw / S); v.h = Math.ceil(dh / S);
    v.cy = Math.round(v.h * 0.54);
    v.K = v.cy - T.riverHalf + 80;
    v.bx = clamp(Math.round(v.w * 0.28), 100, 260);
    v.cssTop = 0; v.cssH = cssH; v.css = S / dpr;
    XD.render.resize(v);
  }

  function toVirtualY(clientY) {
    var v = G.view;
    return (clientY - v.cssTop) / v.css - v.cy;
  }

  // ---------------------------------------------------------------- nhập liệu
  var KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function bindInput() {
    window.addEventListener('keydown', function (ev) {
      if (KEYS[ev.code]) { G.input[KEYS[ev.code]] = 1; ev.preventDefault(); }
      if (ev.repeat) return;
      if (ev.code === 'Space' || ev.code === 'KeyH') { ev.preventDefault(); if (G.mode === 'play') horn(); else if (G.mode === 'title') XD.ui.start(); }
      if (ev.code === 'Enter' && G.mode === 'title') XD.ui.start();
      if (ev.code === 'KeyP' || ev.code === 'Escape') XD.ui.togglePause();
      if (ev.code === 'KeyM') XD.ui.toggleMute();
      if (ev.code === 'KeyJ') XD.ui.toggleJournal();
    });
    window.addEventListener('keyup', function (ev) { if (KEYS[ev.code]) G.input[KEYS[ev.code]] = 0; });
    window.addEventListener('blur', function () { G.input.up = G.input.down = G.input.left = G.input.right = 0; });
    var active = null;
    function isUi(t) { return t.closest && t.closest('button, .panel, .hud-btns'); }
    window.addEventListener('pointerdown', function (ev) {
      XD.audio.unlock();
      if (isUi(ev.target) || G.mode !== 'play') return;
      active = ev.pointerId;
      G.input.touchY = toVirtualY(ev.clientY);
    });
    window.addEventListener('pointermove', function (ev) { if (ev.pointerId === active) G.input.touchY = toVirtualY(ev.clientY); });
    function up(ev) { if (ev.pointerId === active) { active = null; G.input.touchY = null; } }
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('visibilitychange', function () { if (document.hidden && G.mode === 'play') XD.ui.togglePause(); });
  }

  // ---------------------------------------------------------------- vòng lặp
  var last = 0;
  function loop(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (G.mode !== 'pause') step(dt);
    XD.audio.update(audioMix());
    XD.render.draw(ctx, G);
    XD.ui.frame(G, dayAt(G.t), clockText(G.t));
    requestAnimationFrame(loop);
  }

  // Móc gỡ lỗi qua URL: ?t=0.85&biome=sea&weather=rain&seed=3&boat=pink&play=1&freeze=1
  function applyQuery() {
    if (Q.get('t') != null) G.t = mod(parseFloat(Q.get('t')) || 0, 1);
    if (Q.get('freeze') === '1') G.freeze = true;
    if (Q.get('boat') && XD.BOATS[Q.get('boat')]) G.boatKey = Q.get('boat');
    var bi = Q.get('biome');
    if (bi && XD.BIOMES[bi]) {
      for (var i = 0; i < XD.ROUTE.length; i++) if (XD.ROUTE[i].biome === bi) { G.x = LEG_X[i] + 400; break; }
    } else if (Q.get('x')) G.x = parseFloat(Q.get('x')) || 0;
    var w = Q.get('weather');
    if (w && XD.WEATHER[w]) {
      setWeather(w); G.wx.left = 1e9;
      var W = XD.WEATHER[w];
      ['dim', 'rain', 'clouds', 'wind'].forEach(function (p) { G.wp[p] = W[p] || 0; });
    }
    // Rải sẵn cả khúc đang nhìn thấy: mở game ra không phải một dòng sông trống.
    G.spawnX = G.fishX = G.x - 200;
    spawnAhead();
    var bx = boatWX();
    G.ents = G.ents.filter(function (e) { return !(XD.KINDS[e.kind].obstacle && e.x > bx - 150 && e.x < bx + 420); });
    G.ents = G.ents.filter(function (e) { return !e.owner || G.ents.indexOf(e.owner) >= 0; });
  }

  XD.boot = function () {
    canvas = document.getElementById('scene');
    ctx = canvas.getContext('2d');
    resize();
    applyQuery();
    window.addEventListener('resize', resize);
    bindInput();
    XD.ui.init(G);
    if (Q.get('shot') === '1') document.body.classList.add('shot');
    if (Q.get('play') === '1') XD.ui.start(true);
    requestAnimationFrame(function (ts) { last = ts; loop(ts); });
  };

  // Móc cho bộ kiểm: chỉ để dựng cảnh và đọc trạng thái.
  XD.debug = {
    spawn: function (kind, dx, dy, extra) { return spawnEnt(kind, boatWX() + dx, G.boatY + dy, extra); },
    boatWX: boatWX, clockText: clockText, audioMix: audioMix,
  };
})(window.XD = window.XD || {});
