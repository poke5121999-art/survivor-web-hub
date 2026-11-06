// Tay cầm, đồ nghề và chỉ số của người lặn (R.E.P.O.: mỗi lần chỉ cầm một món, đổi tay mới dùng được món khác).
//   BDL.stats  : chỉ số một lượt lặn tính từ crew + đồng đội + nâng cấp trạm → G.stats (O₂, thể lực, tốc bơi, sức kéo, tầm móc, ...)
//   BDL.hand   : { slots: [entry|null ×3], active: 0..3 }, 0 = xiên vĩnh viễn; entry = { key, uses } dùng chung với BDL.run.ca.stash
//                (một món hoặc nằm trong tủ, hoặc nằm trên tay, không bao giờ ở cả hai). slots chính là BDL.run.ca.hand.slots nên
//                đi theo cả ca qua các lượt lặn.
//   BDL.items  : dùng đồ (súng, cận chiến, ném, bình O₂, dụng cụ), đổi tay, chuyển đồ giữa tủ và tay (locker.js gọi).
// Dave (engine/dave.js) gọi BDL.items.press khi bấm chuột trái / nút bắn lớn mà đang cầm đồ; mọi thứ còn lại chạy ở đây.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';
  var HX = window.HX, T = window.HX_TUNING, M = window.HX_META, BA = window.HX_BOAT_ASSETS, A = window.HX_ASSETS;
  var G = null, S = null;

  function toast(s) { if (HX.hud && HX.hud.toast) HX.hud.toast(s); }
  function sfx(key, o) { if (A.audio[key]) G.audio.play(key, o); }
  function defOf(key) { return BDL.ITEM_BY_KEY && BDL.ITEM_BY_KEY[key] || null; }
  function caOf() { return BDL.run && BDL.run.ca; }
  function dmgMul() { return G && G.stats ? G.stats.dmgMul : 1; }

  // ====================================================================================================================
  // CHỈ SỐ
  // ====================================================================================================================
  // crew.lead.stats (hpMul, atkMul, spd, carry, grit, luck, eye) + crew.teamBonus (đồng đội cộng theo chiến thuật) + ca.upg.
  // Trang thử (?map=N, không có crew): số trung tính, đúng số REPO gốc (O₂ 100, sức kéo 30, túi 20 kg).
  function computeStats(ca) {
    ca = ca || {};
    var up = ca.upg || {}, crew = ca.crew, lead = crew && crew.lead && crew.lead.stats ? crew.lead.stats : null, tb = (crew && crew.teamBonus) || {};
    var n = function (k) { return up[k] | 0; };
    var st = lead || { hpMul: 1, atkMul: 1, spd: 1, carry: 0, grit: 0, luck: 0, eye: 0 };
    var carry = lead ? st.carry * (1 + (tb.carry || 0)) : null;
    var grit = Math.min(0.75, (st.grit || 0) + (tb.grit || 0));
    return {
      o2Max: Math.round(100 * (st.hpMul || 1)) + 20 * n('hp'),
      staminaMax: 100 + 10 * n('stam'),
      swimMul: (st.spd || 1) * (1 + (tb.spd || 0)) * (1 + 0.2 * n('sprint')),
      pull: (carry == null ? 30 : carry) + 10 * n('str'),   // sức kéo dây: REPO str gốc 30, +10 mỗi bậc
      hookRange: (T.harpoon.range || 5.5) + n('range'),      // m: tầm súng xiên / móc dây (T.harpoon.range) + 1 m mỗi bậc
      gripMul: 1 + 0.25 * n('grip'),                         // ngưỡng va đập của món đang buộc dây
      regenMul: 1 + 0.5 * n('regen'),
      lampMul: 1 + 0.16 * n('light'),
      bagKg: 20 + 5 * n('cargo') + (carry == null ? 0 : carry / 4),
      dmgMul: (st.atkMul || 1) * (1 + (tb.atk || 0)),
      dmgTaken: 1 - grit,
      grit: grit, luck: (st.luck || 0) + (tb.luck || 0), eye: (st.eye || 0) + (tb.eye || 0),
    };
  }
  BDL.stats = { compute: computeStats };

  // first: đầu lượt lặn (đầy O₂, đầy thể lực: REPO hồi đầy mỗi nhà). Gọi lại sau khi nâng cấp đổi giữa chừng thì chỉ cộng phần chênh.
  function applyStats(first) {
    var st = computeStats(caOf()), d = G.diver, was = G.stats;
    G.stats = st;
    G.loadout.o2 = st.o2Max;
    G.loadout.bagKg = st.bagKg;
    if (d) {
      if (first) { d.o2 = st.o2Max; d.stamina = st.staminaMax; }
      else if (was) { d.o2 = Math.min(st.o2Max, d.o2 + Math.max(0, st.o2Max - was.o2Max)); d.stamina = Math.min(st.staminaMax, d.stamina); }
    }
    return st;
  }

  // ====================================================================================================================
  // TAY CẦM
  // ====================================================================================================================
  var hand = BDL.hand = { slots: [null, null, null], active: 0 };

  function bindHand() {
    var ca = caOf();
    if (!ca) return;
    if (!ca.hand || !Array.isArray(ca.hand.slots)) ca.hand = { slots: [null, null, null] };
    while (ca.hand.slots.length < 3) ca.hand.slots.push(null);
    hand.slots = ca.hand.slots;
    hand.active = 0;
  }
  function activeEntry() { return hand.active > 0 ? hand.slots[hand.active - 1] : null; }
  function slotOf(e) { return hand.slots.indexOf(e); }

  function nextFilled(from, dir) {
    for (var k = 1; k <= 4; k++) {
      var i = ((from + dir * k) % 4 + 4) % 4;
      if (i === 0 || hand.slots[i - 1]) return i;
    }
    return 0;
  }

  // Chọn tay i (0 = xiên). Trả true nếu đổi được.
  function select(i, force) {
    i = i | 0;
    if (i < 0 || i > 3 || !S) return false;
    if (i > 0 && !hand.slots[i - 1]) return false;
    if (!force && G.diver && !canSwap(G.diver)) return false;
    hand.active = i;
    var e = activeEntry(), df = e && defOf(e.key);
    if (df && df.kind === 'gun') equipGun(e); else G.gun = null;
    if (e && df) sfx('ui_click', { vol: 0.5 });
    return true;
  }

  function canSwap(d) { return ['swim', 'hurt', 'dash', 'surfaced'].indexOf(d.state) >= 0; }

  function swapBy(n) {
    var dir = n > 0 ? 1 : -1, cnt = Math.abs(n), i = hand.active;
    for (var k = 0; k < cnt; k++) i = nextFilled(i, dir);
    select(i);
  }

  // Tủ ↔ tay. locker.js dùng.
  function equip(stashIdx) {
    var ca = caOf(), e = ca && ca.stash[stashIdx];
    if (!e) return false;
    var free = hand.slots.indexOf(null);
    if (free < 0) { toast('Tay đã đầy · cất bớt một món về tủ'); return false; }
    ca.stash.splice(stashIdx, 1);
    hand.slots[free] = e;
    return true;
  }
  function unequip(slot) {
    var ca = caOf(), e = hand.slots[slot];
    if (!ca || !e) return false;
    hand.slots[slot] = null;
    ca.stash.push(e);
    if (hand.active === slot + 1) { hand.active = 0; if (G) G.gun = null; }
    return true;
  }
  function dropFromHand(e) {
    var i = slotOf(e);
    if (i < 0) return;
    hand.slots[i] = null;
    if (hand.active === i + 1) { hand.active = 0; if (G) G.gun = null; }
  }

  // Dùng một lần: ammo (súng, cận chiến) ở lại tay ở 0 và được nạp lại đầu chuyến; đồ còn lại hết là mất.
  function spend(e, df) {
    if (df.uses <= 0) return;
    e.uses--;
    if (e.uses <= 0 && !df.ammo) { dropFromHand(e); toast(df.name + ' đã dùng hết'); }
  }

  // Nạp đầu chuyến cũng phải thấy cả đồ đang nằm trên tay (shop.js chỉ đi qua tủ).
  function wrapRestock() {
    var prev = BDL.restock;
    if (prev && prev.__items) return;
    var f = function (ca) {
      ca = ca || caOf();
      var n = prev ? prev(ca) : 0;
      if (ca && ca.hand && ca.hand.slots) {
        ca.hand.slots.forEach(function (e) {
          var df = e && defOf(e.key);
          if (df && df.ammo && e.uses !== df.uses) { e.uses = df.uses; n++; }
        });
      }
      return n;
    };
    f.__items = true;
    BDL.restock = f;
  }
  wrapRestock();

  // ====================================================================================================================
  // SÚNG: 6 khẩu DtD gốc của js/engine/gun.js
  // ====================================================================================================================
  var GUNMAP = { rifle: 'rifle', shotgun: 'shotgun', sniper: 'sniper', tranq: 'sleep', net: 'net', grenade: 'grenade' };

  function equipGun(e) {
    var gid = GUNMAP[e.key], g = gid && M.GUNS[gid];
    if (!g || !HX.Gun || !G.diver || !G.diver.arms) return null;
    var gun = S.guns[e.key];
    if (!gun) {
      var spec = Object.assign({ id: gid, mode: g.mode }, g.levels[0]);
      spec.dmg = Math.max(1, Math.round(spec.dmg * dmgMul()));
      gun = S.guns[e.key] = new HX.Gun(G, spec);
    }
    gun.ammo = e.uses;
    S.bind = { entry: e, gun: gun, last: e.uses };
    G.gun = gun;
    return gun;
  }

  // Giữ số đạn trong súng và trong ô tay khớp nhau (súng trừ khi bắn; restock sửa uses từ ngoài).
  function syncGun() {
    var b = S.bind;
    if (!b) return;
    if (b.entry.uses !== b.last) { b.gun.ammo = b.entry.uses; }
    else b.entry.uses = b.gun.ammo;
    b.last = b.entry.uses;
  }

  function preloadGuns() {
    Object.keys(GUNMAP).forEach(function (k) {
      var id = GUNMAP[k];
      try {
        HX.audio.load(HX.gun.soundKeys(id));
        G.fx.preloadRecipes(HX.gun.recipesOf(id));
        HX.gun.images(id).forEach(function (r) { G.gfx.loadTex(r); });
      } catch (e) { G.errors.push('items preload ' + id + ': ' + e); }
    });
  }

  // ====================================================================================================================
  // CẬN CHIẾN: dmg cơ sở, hất lùi (m/s), thời lượng nhát, mốc trúng, nghỉ, tầm (m), choáng (s). Sledge > bat > machete > pan.
  // ====================================================================================================================
  var MELEE = {
    knife:   { dmg: 6,  kb: 1.5, time: 0.26, hit: 0.1,  cd: 0.25, range: 0.95, sfx: 'knife' },
    pan:     { dmg: 14, kb: 3,   time: 0.32, hit: 0.13, cd: 0.4,  range: 1.15, sfx: 'knife' },
    machete: { dmg: 18, kb: 2,   time: 0.3,  hit: 0.12, cd: 0.3,  range: 1.3,  sfx: 'knife' },
    bat:     { dmg: 24, kb: 5,   time: 0.4,  hit: 0.16, cd: 0.5,  range: 1.3,  sfx: 'knife' },
    sledge:  { dmg: 48, kb: 7,   time: 0.55, hit: 0.24, cd: 0.8,  range: 1.35, sfx: 'knife' },
    prodzap: { dmg: 10, kb: 2,   time: 0.32, hit: 0.13, cd: 0.45, range: 1.15, sfx: 'gear_paralysis_zap', stun: 2.5 },
  };
  var MELEE_STAMINA = 12, THROW_STAMINA = 6;   // REPO: đánh 12, ném 6

  function aimVec(d, inp) {
    var x = inp.aimX - d.pos.x, y = inp.aimY - d.pos.y, l = Math.hypot(x, y);
    if (l < 0.3) { x = d.facing; y = 0; l = 1; }
    return { x: x / l, y: y / l };
  }

  function swingHit(d, it) {
    var df = it.def, e = it.entry, cx = d.pos.x + it.ux * it.range * 0.6, cy = d.pos.y + 0.05 + it.uy * it.range * 0.6, r = it.range * 0.6 + 0.2;
    var dmg = Math.max(1, Math.round(it.dmg * dmgMul())), hits = 0;
    G.fishes.list.slice().forEach(function (f) {
      if (!f.alive() || f.state === 'hooked' || !f.hitTest(cx, cy, r)) return;
      hits++;
      var c = f.center();
      G.fx.spawn('hit', c.x, c.y, f.z + 0.1, 0, 0, 0.7);
      f.damage(dmg, d.pos.x, d.pos.y, false);
      if (it.kb && f.vel && f.alive()) {
        var dx = c.x - d.pos.x, dy = c.y - d.pos.y, l = Math.hypot(dx, dy) || 1;
        f.vel.x = dx / l * it.kb; f.vel.y = dy / l * it.kb;
      }
    });
    if (it.stun && BDL.foes) hits += BDL.foes.stunAt(cx, cy, r + 0.3, it.stun, { kind: 'stun' });
    if (hits) {
      sfx('melee_hit'); G.shake(0.5 + it.kb * 0.08); G.hitstop(0.04 + it.kb * 0.008);
      if (BDL.noise) BDL.noise(cx, cy, 6, 0.8);
      S.stats.swingHits += hits;
      if (df.uses > 0) {
        e.uses = Math.max(0, e.uses - 1);
        if (e.uses <= 0) toast('Hết lượt · chuyến sau nạp lại');
      }
    }
  }

  // ====================================================================================================================
  // ĐỒ NÉM: bom (nổ sau 1,4 s), lựu choáng (1,0 s), mìn (nằm lại, nổ khi quái lại gần 1,5 m)
  // ====================================================================================================================
  var THROW = {
    bomb: { fuse: 1.4, radius: 3.4, dmg: 120, loot: 150, stun: 0, size: 0.5 },
    stun: { fuse: 1.0, radius: 4.5, dmg: 0, loot: 0, stun: 4, size: 0.5 },
    mine: { fuse: 0, radius: 2.8, dmg: 90, loot: 100, stun: 0, size: 0.55, trigger: 1.5, arm: 0.6 },
  };
  var THROW_SPEED = 7.5, THROW_GRAV = 4.5, THROW_DRAG = 1.1, SINK_V = 1.4;
  var texCache = {};
  function iconTex(path) {
    if (!texCache[path]) {
      var t = new THREE.TextureLoader().load(path);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      texCache[path] = t;
    }
    return texCache[path];
  }
  function explosionKey() {
    var s = BA && BA.guns && BA.guns.grenade && BA.guns.grenade.sfx && BA.guns.grenade.sfx.hit;
    return s ? s.split('/').pop().replace(/\.mp3$/, '') : 'gun_grenade_hit';
  }

  function throwItem(d, it) {
    var df = it.def, e = it.entry, P = THROW[df.key];
    if (!P) return;
    var spd = THROW_SPEED;
    var p = { key: df.key, P: P, x: d.pos.x + it.ux * 0.4, y: d.pos.y + 0.1 + it.uy * 0.3, vx: it.ux * spd + d.vel.x * 0.3, vy: it.uy * spd + 1.6 + d.vel.y * 0.3,
      t: 0, landed: false, armT: 0, mesh: null, spin: (Math.random() - 0.5) * 8 };
    p.mesh = HX.gfx.sprite(iconTex(df.icon), P.size, P.size, { alphaCut: 0.3, depthWrite: false });
    p.mesh.renderOrder = 5;
    p.mesh.position.set(p.x, p.y, 0.17);
    G.gfx.scene.add(p.mesh);
    S.thrown.push(p);
    S.stats.thrown++;
    sfx('dave_dash', { vol: 0.35, rate: 1.6 });
    if (BDL.noise) BDL.noise(d.pos.x, d.pos.y, 3.5, 0.8);   // REPO: ném ồn bán kính 3,5 ô
    spend(e, df);
  }

  function ringFx(x, y, r, color) {
    var geo = new THREE.RingGeometry(0.9, 1, 48), mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0.6); m.renderOrder = 58; m.scale.set(0.3, 0.3, 1);
    G.gfx.scene.add(m);
    S.rings.push({ m: m, t: 0, r: r });
  }

  function blast(x, y, p) {
    var P = p.P, fishHit = 0, lootHit = 0, stunned = 0, mul = dmgMul();
    ringFx(x, y, P.radius, P.stun ? 0xffe14a : 0xff9a4a);
    var vf = BA && BA.gunVfx && BA.guns.grenade && BA.gunVfx[BA.guns.grenade.impact];
    if (P.dmg && vf) G.fx.play(vf, x, y, { z: 0.25, name: 'explosion' });
    else { G.fx.spawn('glow', x, y, 0.4, 0, 0, P.radius * 0.6); G.fx.burst('spark', x, y, 10, 2.5); }
    G.fx.burst('bubbleBig', x, y, 14, 2);
    sfx(P.stun ? 'gear_paralysis_zap' : explosionKey(), { vol: 1 });
    G.shake(P.dmg ? 2 : 1); if (P.dmg) G.hitstop(0.05);
    if (P.dmg) {
      G.fishes.list.slice().forEach(function (f) {
        if (f.decor || !f.alive() || f.state === 'hooked') return;
        var c = f.center(), dd = Math.hypot(c.x - x, c.y - y);
        if (dd > P.radius + f.radius) return;
        f.damage(Math.max(1, Math.round(P.dmg * mul * (1 - 0.5 * Math.min(1, dd / P.radius)))), x, y, false);
        fishHit++;
      });
    }
    if (P.loot) {
      (G.loot || []).slice().forEach(function (l) {
        var dd = Math.hypot(l.pos.x - x, l.pos.y - y);
        if (dd > P.radius + 0.2) return;
        l.hit(P.loot * (1 - 0.5 * Math.min(1, dd / P.radius)), x, y);
        lootHit++;
      });
    }
    if (P.stun && BDL.foes) stunned = BDL.foes.stunAt(x, y, P.radius, P.stun, { kind: 'stun' });
    if (BDL.noise) BDL.noise(x, y, 14, 2);
    S.stats.blasts.push({ key: p.key, x: x, y: y, fish: fishHit, loot: lootHit, stunned: stunned });
  }

  function stepThrown(dt) {
    for (var i = S.thrown.length - 1; i >= 0; i--) {
      var p = S.thrown[i], P = p.P;
      p.t += dt;
      if (!p.landed) {
        p.vy -= THROW_GRAV * dt;
        var k = Math.exp(-THROW_DRAG * dt);
        p.vx *= k; p.vy = Math.max(-SINK_V, p.vy * k);
        var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        var wall = G.world.raycast(p.x, p.y, nx, ny);
        if (wall) { p.x = wall.x + wall.nx * 0.1; p.y = wall.y + wall.ny * 0.1; p.landed = true; p.vx = p.vy = 0; }
        else { p.x = nx; p.y = ny; }
        if (p.y > T.water.surfaceY - 0.2) { p.y = T.water.surfaceY - 0.2; if (p.vy > 0) p.vy = 0; }
        p.mesh.rotation.z += p.spin * dt;
      } else p.armT += dt;
      p.mesh.position.set(p.x, p.y, 0.17);
      var boom = false;
      if (P.fuse && p.t >= P.fuse) boom = true;
      if (P.trigger && p.landed && p.armT >= P.arm && BDL.foes) {
        var near = BDL.foes.nearest(p.x, p.y, P.trigger);
        if (near) boom = true;
      }
      if (boom) {
        G.gfx.scene.remove(p.mesh); p.mesh.material.dispose();
        S.thrown.splice(i, 1);
        blast(p.x, p.y, p);
      }
    }
    for (var j = S.rings.length - 1; j >= 0; j--) {
      var r = S.rings[j]; r.t += dt;
      var kk = Math.min(1, r.t / 0.45), s = 0.3 + (r.r - 0.3) * (1 - Math.pow(1 - kk, 2));
      r.m.scale.set(s, s, 1); r.m.material.opacity = 0.8 * (1 - kk);
      if (kk >= 1) { G.gfx.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); S.rings.splice(j, 1); }
    }
  }

  // ====================================================================================================================
  // BÌNH O₂ + DỤNG CỤ
  // ====================================================================================================================
  function useHeal(e, df) {
    var d = G.diver, mx = G.loadout.o2;
    if (d.state === 'dead') return;
    if (d.o2 >= mx - 0.01) { toast('O₂ đã đầy'); return; }
    var before = d.o2;
    d.o2 = Math.min(mx, d.o2 + df.heal);
    sfx('o2_use', { vol: 0.9 });
    G.fx.burst('bubbleBig', d.pos.x, d.pos.y + 0.2, 10, 1.2);
    if (HX.hud.screenFx) HX.hud.screenFx('109,255,176', 0.25);
    toast(df.name + ' · +' + Math.round(d.o2 - before) + ' O₂');
    S.stats.heals++;
    spend(e, df);
  }

  function useTool(e, df) {
    var name = df.key === 'float' ? 'float' : 'shield';
    S.timers[name] = Math.max(S.timers[name], df.dur);
    S.timerMax[name] = df.dur;
    sfx(name === 'float' ? 'o2_use' : 'gear_ice_freeze', { vol: 0.7, rate: 1.3 });
    G.fx.burst('bubble', G.diver.pos.x, G.diver.pos.y, 8, 0.8);
    toast(df.name + ' · ' + df.dur + ' giây');
    spend(e, df);
  }

  // Phao nổi / áo bọc: tether.js và loot.js hỏi hai hàm này.
  function floatOn() { return !!S && S.timers.float > 0; }
  function shieldOn() { return !!S && S.timers.shield > 0; }

  // ====================================================================================================================
  // BẤM DÙNG (engine/dave.js gọi từ trạng thái swim khi hand.active > 0)
  // Trả null (đã xử lý ngay hoặc không làm gì) hoặc { state, data } để Dave chuyển trạng thái.
  // ====================================================================================================================
  function press(d, inp) {
    var e = activeEntry(), df = e && defOf(e.key);
    if (!e || !df || (G.deck && G.deck.on) || d.state === 'dead') return null;
    if (df.uses > 0 && e.uses <= 0) {
      if (G.t - S.nagT > 0.6) { S.nagT = G.t; toast(df.kind === 'gun' ? 'Hết đạn · chuyến sau nạp lại' : 'Hết lượt · chuyến sau nạp lại'); }
      return null;
    }
    d.faceToward(inp.aimX - d.pos.x);
    if (df.kind === 'gun') {
      var gun = S.bind && S.bind.entry === e ? S.bind.gun : equipGun(e);
      if (gun) G.gun = gun;
      return gun ? { state: 'gunAim', data: {} } : null;
    }
    if (df.kind === 'heal') { useHeal(e, df); return null; }
    if (df.kind === 'tool') { useTool(e, df); return null; }
    var cost = df.kind === 'throw' ? THROW_STAMINA : df.key === 'knife' ? 0 : MELEE_STAMINA;
    if (d.stamina < cost) {
      if (G.t - S.nagT > 0.6) { S.nagT = G.t; toast('Hết thể lực'); }
      return null;
    }
    d.stamina -= cost;
    var u = aimVec(d, inp), spec;
    if (df.kind === 'melee') {
      var m = MELEE[df.key] || MELEE.pan;
      spec = { entry: e, def: df, dmg: m.dmg, kb: m.kb, time: m.time, hitAt: m.hit, cd: m.cd, range: m.range, sfx: m.sfx, stun: m.stun || 0, ux: u.x, uy: u.y };
    } else {
      spec = { entry: e, def: df, throw: true, time: 0.26, hitAt: 0.1, cd: 0.25, ux: u.x, uy: u.y, sfx: 'knife' };
    }
    return { state: 'melee', data: { item: spec } };
  }

  function swing(d, it) { if (it.throw) throwItem(d, it); else swingHit(d, it); }

  // ====================================================================================================================
  // DRONE
  // ====================================================================================================================
  function syncDrone() {
    var rd = BDL.run && BDL.run.dive;
    if (!rd || !G.drone) return;
    if (rd.droneLeft !== G.drone.left) G.drone.left = Math.min(G.drone.left, rd.droneLeft);
  }

  // ====================================================================================================================
  // HUD nhỏ: thời gian còn lại của phao / áo bọc
  // ====================================================================================================================
  function buildHud() {
    var host = document.getElementById('hud') || document.body;
    var el = document.getElementById('items-buffs');
    if (!el) {
      el = document.createElement('div');
      el.id = 'items-buffs';
      el.innerHTML = '<span class="buff float" hidden><i>🛟</i><b></b></span><span class="buff shield" hidden><i>🛡️</i><b></b></span>';
      host.appendChild(el);
    }
    // ô 0 là súng xiên-móc dây (chuột trái: giữ ngắm, thả bắn; trúng đồ cổ / xác thì móc dây, bấm lại là thả)
    var k0 = document.querySelector('#hand .cell[data-i="0"] .k');
    if (k0) k0.textContent = 'Súng móc';
    // ô tay cầm bấm / chạm được (touch dùng để đổi tay; PC bấm chuột vào ô cũng chọn)
    var cells = document.querySelectorAll('#hand .cell');
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c._items) continue;
      c._items = true;
      (function (cell) {
        var go = function (e) {
          e.preventDefault(); e.stopPropagation();
          HX.audio.unlock();
          var i = +cell.getAttribute('data-i');
          if (i > 0 && hand.active === i) i = 0;   // bấm lại ô đang cầm thì về xiên
          if (!select(i) && i > 0) toast('Ô trống · mở tủ trên thuyền (E) để lấy đồ');
        };
        cell.addEventListener('touchstart', go, { passive: false });
        cell.addEventListener('mousedown', go);
      })(c);
    }
    return el;
  }
  function showBuffs() {
    var el = document.getElementById('items-buffs');
    if (!el) return;
    ['float', 'shield'].forEach(function (k) {
      var b = el.querySelector('.buff.' + k), t = S.timers[k];
      b.hidden = !(t > 0);
      if (t > 0) b.querySelector('b').textContent = Math.ceil(t) + 's';
    });
  }

  // ====================================================================================================================
  // HỆ
  // ====================================================================================================================
  BDL.items = {
    press: press, swing: swing, select: select, swap: swapBy, equip: equip, unequip: unequip,
    floatOn: floatOn, shieldOn: shieldOn,
    // món trên nút bắn lớn của màn cảm ứng (main.js touchHud có thể dùng) hoặc null khi cầm xiên
    fireIcon: function () { var e = activeEntry(), df = e && defOf(e.key); return df ? df.icon : null; },
    active: function () { var e = activeEntry(); return e ? { key: e.key, uses: e.uses, def: defOf(e.key) } : null; },
    stats: function () { return G && G.stats; },
    refreshStats: function () { return G ? applyStats(false) : null; },
  };

  BDL.systems.push({
    name: 'items',

    build: function (g) {
      G = g;
      S = { guns: {}, bind: null, thrown: [], rings: [], timers: { float: 0, shield: 0 }, timerMax: { float: 0, shield: 0 }, nagT: -9,
        stats: { swingHits: 0, thrown: 0, heals: 0, blasts: [] } };
      applyStats(true);
      bindHand();
      G.gun = null;
      var rd = BDL.run && BDL.run.dive;
      if (G.drone && rd) G.drone.left = rd.droneLeft;
      preloadGuns();
      buildHud();
      window.BDL_DEBUG = window.BDL_DEBUG || {};
      window.BDL_DEBUG.items = {
        state: function () {
          var b = S.bind;
          return { slots: hand.slots.map(function (e) { return e ? { key: e.key, uses: e.uses } : null; }), active: hand.active, stash: (caOf().stash || []).map(function (e) { return { key: e.key, uses: e.uses }; }),
            timers: { float: S.timers.float, shield: S.timers.shield }, thrown: S.thrown.length, rings: S.rings.length, gunAmmo: b ? b.gun.ammo : null, gunFired: b ? b.gun.fired : 0,
            gunHits: b ? b.gun.hits : 0, swingHits: S.stats.swingHits, blasts: S.stats.blasts.slice(), heals: S.stats.heals, droneLeft: rd ? rd.droneLeft : null, diverState: G.diver.state };
        },
        give: function (key, uses) { var df = defOf(key); caOf().stash.push({ key: key, uses: uses == null ? df.uses : uses }); return caOf().stash.length - 1; },
        equip: equip, unequip: unequip, select: function (i) { return select(i, true); },
        stats: function () { return Object.assign({}, G.stats); },
        refreshStats: function () { return applyStats(false); },
        screen: function (x, y) { return G.gfx.worldToScreen(x, y); },
        thrown: function () { return S.thrown.map(function (p) { return { key: p.key, x: p.x, y: p.y, landed: p.landed, t: p.t }; }); },
        setTimer: function (k, v) { S.timers[k] = v; },
      };
    },

    update: function (dt, input) {
      if (!S) return;
      var d = G.diver;
      // đổi tay: lăn chuột / nút đổi cảm ứng (±1, chu kỳ xiên → 1 → 2 → 3 → xiên bỏ ô trống), phím 1..3 chọn ô (bấm lại ô đang cầm: về xiên)
      if (!(BDL.locker && BDL.locker.isOpen && BDL.locker.isOpen()) && d && canSwap(d)) {
        if (input.swap) swapBy(input.swap);
        if (input.slot) {
          var i = input.slot;
          if (hand.active === i) select(0);
          else if (!select(i)) toast('Ô ' + i + ' trống · mở tủ trên thuyền (E) để lấy đồ');
        }
      }
      for (var k in S.timers) if (S.timers[k] > 0) S.timers[k] = Math.max(0, S.timers[k] - dt);
      showBuffs();
      syncGun();
      for (var id in S.guns) S.guns[id].update(dt);
      stepThrown(dt);
      syncDrone();
    },

    teardown: function (g) {
      if (!S) return;
      for (var id in S.guns) S.guns[id].remove();
      S.thrown.forEach(function (p) { g.gfx.scene.remove(p.mesh); p.mesh.material.dispose(); });
      S.rings.forEach(function (r) { g.gfx.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); });
      var b = document.getElementById('items-buffs');
      if (b) Array.prototype.forEach.call(b.querySelectorAll('.buff'), function (x) { x.hidden = true; });
      hand.active = 0;
      g.gun = null;
      S = null;
    },
  });
})(window.BDL);
