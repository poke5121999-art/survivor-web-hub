// Trùm boss_alien_ship — Tàu Ngoài Hành Tinh (Alien Aircraft Carrier), trùm chót của Thần Điện Thủ Hộ 12-3.
// Rig, đạn thật: prefab alien_carrier_root + 6 đạn trong defence.ab (tools/defence/export_ship.py -> data/sk-ship.js).
// Máu [WIKI Alien Aircraft Carrier]: thân 500.000 + 4 bộ phận 85.000 (2 súng thân, 2 tháp laser bên); thân bất khả xâm phạm tới khi cả 4 vỡ.
// Đòn [WIKI Alien Aircraft Carrier/Tactics]: laser bên 7 s (18), súng trái vòng sóng + xoắn ốc 12 s (15), súng phải 1-2 luồng / hình quạt 120° 12 s (15),
// lõi: laser mắt 6 s (19), 6 tên lửa tầm nhiệt (16), cầu mở rộng (14), oanh tạc (15, 3 vệt nổ + 2 vệt đỏ an toàn). Số sát thương nhân hệ số quái của game như trùm khác.
// Mỗi bộ phận vỡ thì gọi quái vùng Tàu Vũ Trụ (3, +1 mỗi bộ phận, tối đa 5) và mất đòn của bộ phận đó; dưới 50% máu thân lần đầu thì người chơi +400 năng lượng.
// Số không có trong wiki (nhịp nghỉ, tốc đạn, tốc quay, khiên bộ phận, thời gian rơi) là [ƯỚC LƯỢNG]. Chưa làm: Cháy khi trúng tên lửa / nổ, nổ ngẫu nhiên.
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K || !window.SK_SHIP || !window.SK_BOSSES86 || !window.SK_BOSSES86.bosses.boss_alien_ship) return;
  const { TAU, DEG, U, fire, aimAt, beam, beamLen, explode, dmgOf } = K;
  const PID = 'boss_alien_ship';
  // Tàu gốc rộng 520 px, quá lớn cho Phòng Đá Phép: vẽ và đo mọi điểm nút theo hệ số của đồ hoạ Thần Điện (C.artScale 0,42)
  const SC = (SK.defence && SK.defence.C && SK.defence.C.artScale) || 0.42;
  const rigPoint = (Rg, i, x, y, fl) => { const q = K.rigPoint(Rg, i, x, y, fl); return [x + (q[0] - x) * SC, y + (q[1] - y) * SC]; };
  const point = (e, name) => { const q = K.point(e, name); return [e.x + (q[0] - e.x) * SC, e.y + (q[1] - e.y) * SC]; };
  const N = 'root/alien_carrier/img/';

  const S = SK.SHIP = {
    bodyHp: 500000, partHp: 85000,                                    // [WIKI]
    dmg: { bullet: [15, 16], eye: [19, 20], missile: [16, 17], sphere: [14, 15], side: [18, 19], bomb: [15, 16] },   // [WIKI] (thường, Lợi Hại)
    gunDur: 12, sideDur: 7, eyeDur: 6, sphereLaunch: 6, sphereSpin: 5, sphereLinger: 3.5,   // [WIKI]
    summonMin: 3, summonMax: 5, energyBonus: 400,                     // [WIKI]
    coreCd: 3, coreCdLast: 2.4,                                       // MB AlienCarrier.shoot_cd 3 [ĐO]; hết bộ phận 2,4 [ƯỚC LƯỢNG]
    gunCd: [4, 8], sideCd: [12, 18], shieldCd: [16, 24], shieldHp: 9000,   // [ƯỚC LƯỢNG]
    drift: 30, crashT: 2.6,                                           // [ƯỚC LƯỢNG]
    parts: [
      { key: 'lg', node: 'root/left_gun', name: 'Súng thân trái', atks: ['concentric', 'spiral'] },
      { key: 'rg', node: 'root/right_gun', name: 'Súng thân phải', atks: ['streams', 'cone'] },
      { key: 'll', node: 'root/left_laser', name: 'Tháp laser trái', atks: ['side'] },
      { key: 'rl', node: 'root/right_laser', name: 'Tháp laser phải', atks: ['side'] }
    ],
    core: ['eye', 'missiles', 'sphere', 'bombard']
  };
  const dm = (e, k) => S.dmg[k][e.badass ? 1 : 0];

  // Bộ đòn đang có: mất bộ phận thì mất đòn của nó; laser bên còn tới khi mất hết 4 bộ phận nhưng bắn từ cổng thân thay tháp [WIKI Tactics]
  S.attacks = function (e) {
    const A = S.core.map(id => ({ id, src: 'core' })), P = e.ship.parts, alive = P.filter(p => !p.partDead);
    if (!P[0].partDead) A.push({ id: 'concentric', src: 'lg' }, { id: 'spiral', src: 'lg' });
    if (!P[1].partDead) A.push({ id: 'streams', src: 'rg' }, { id: 'cone', src: 'rg' });
    if (alive.length) {
      A.push({ id: 'side', src: P[2].partDead ? 'chassis-l' : 'll' }, { id: 'side', src: P[3].partDead ? 'chassis-r' : 'rl' });
    }
    return A;
  };

  const rnd = r => SK.randf(r[0], r[1]);
  const aliveObj = e => !e.deathDone && e.hp > 0 && !(e.ship && e.ship.crash);
  function arena(e, dur, fn) { e.arena.objs.push({ t: 0, dur, update(G2, o, dt) { if (e.deathDone) return false; return fn(G2, o, dt) !== false && o.t < o.dur; } }); }
  function every(e, dur, step, fn) {
    let acc = 0, i = 0;
    arena(e, dur, (G2, o, dt) => { acc += dt; while (acc >= step) { acc -= step; fn(G2, i++, o.t); } return aliveObj(e); });
  }
  const dupIdx = (e, name) => { const r = []; e.R.def.nodes.forEach((n, i) => { if (n.n === name) r.push(i); }); return r; };
  const muzzles = (e, name) => dupIdx(e, name).map(i => rigPoint(e.R, i, e.x, e.y, 1));
  const fx = (G, x, y, big) => { if (SK.vfx) SK.vfx.spawn(G, 'explode_hit_player', x, y, { state: big ? 'explode_big' : 'explode_small' }); };

  // ---- đòn của Tàu cũng đánh tháp phòng thủ (js/defence4.js)
  function hitTowers(G, x, y, rad, dmg) { const Df = SK.defence; if (Df && Df.hurtTowersIn) Df.hurtTowersIn(G, x, y, rad, dmg); }
  function beamTowers(G, o) {
    // tia trúng tháp mỗi 0,2 s [ĐO RGELaserTrigger.rate]
    if (G.t < (o.next || 0)) return;
    o.next = G.t + 0.2;
    const d = G.defence, Df = SK.defence; if (!d || !d.towers || !Df || !Df.hurtTower) return;
    const len = beamLen(G, o.ox, o.oy, o.a, 520), c = Math.cos(o.a), s = Math.sin(o.a);
    for (const t of d.towers) {
      const a = t.ally; if (!a || a.dead) continue;
      const px = a.x - o.ox, py = a.y - o.oy, along = px * c + py * s, off = Math.abs(-px * s + py * c);
      if (along > 0 && along < len && off < 12) Df.hurtTower(G, a, dmgOf(o.dmg));
    }
  }

  // ---- bộ phận: "quái" giả đứng ở nút của rig để đạn / tháp / người chơi bắn trúng riêng từng bộ phận
  SK.AI.SKShipPart = function () {};
  function makePart(e, spec, idx) {
    const hb = { size: [36, 36], off: [0, 0] };   // hộp đụng rộng 36 px quanh nút (collider gốc 32 px x 0,42 quá nhỏ để ngắm)
    const [x, y] = rigPoint(e.R, idx, e.x, e.y, 1);
    return {
      id: 'ship_' + spec.key, shipPart: spec.key, shipBody: e, nodeIdx: idx, d: { shadow: null, shadowOff: [0, 1e5], speed: 0 },
      p: { kinematic: 1, reward_rate: 0, reward_value: [0, 0, 0, 0] }, cls: 'SKShipPart', rawCls: 'SKShipPart', x, y, kx: 0, ky: 0,
      hp: S.partHp, hpMax: S.partHp, face: 1, aim: 0, st: 'idle', stT: 1e9, t: 0, cd: 0, room: e.room, elite: false, flash: 0, w: null,
      anims: { dead: true }, r: 18, hb, scale: 1, burst: 0, shield: 0, spec, partDead: false,
      draw() {}   // thanh máu bộ phận vẽ chung trong drawShip (nằm trên thân)
    };
  }

  // ---- vỡ bộ phận
  function partDown(G, e, p) {
    const sh = e.ship, k = sh.parts.filter(q => q.partDead).length;   // số bộ phận đã vỡ trước đó
    p.partDead = true; p.shield = 0;
    const nd = e.R.def.nodes[p.nodeIdx], dsp = ((nd.mbs && nd.mbs.AlienCarrierComponent) || {}).destroyed;
    const spr = typeof dsp === 'string' ? dsp.replace(/^Sprite:/, '') : null;
    const sub = nm => dupIdx(e, p.spec.node + '/img/' + nm)[0];
    const bi = sub('body');
    if (bi != null && spr) e.R.ov[bi] = { f: spr };   // hình hỏng của bộ phận
    for (const nm of ['gun', 'tube']) { const gi = sub(nm); if (gi != null) e.R.ov[gi] = { on: false }; }
    fx(G, p.x, p.y - 8, true);
    G.shake = Math.max(G.shake, 6);
    sh.cancel[p.spec.key] = true;   // dừng ngay đòn đang chạy của bộ phận
    sh.busy[p.spec.key] = 0;
    // gọi quái vùng Tàu Vũ Trụ: 3, +1 mỗi bộ phận vỡ tiếp, tối đa 5 [WIKI Tactics]
    const n = Math.min(S.summonMax, S.summonMin + k);
    sh.summonLog.push(n);
    summon(G, e, n, p.x, p.y);
    if (G.toast) G.toast(p.spec.name + ' vỡ! Tàu gọi ' + n + ' quái', 2.4);
    SK.emit('shipPartDown', G, e, p, n);
    if (sh.parts.every(q => q.partDead)) { sh.allDown = true; if (G.toast) G.toast('Thân Tàu lộ ra! Hạ nó đi', 2.4); }
  }
  function summon(G, e, n, x, y) {
    const th = SK.D.themes && SK.D.themes.aliens, ids = ((th && th.enemies) || []).filter(id => SK.D.enemies[id] && !SK.D.enemies[id].boss && !/^ex_/.test(id));
    const Df = SK.defence, d = G.defence;
    for (let i = 0; i < n && ids.length; i++) {
      const id = SK.pick(ids), a = TAU * i / n + SK.rand();
      const [fx0, fy0] = SK.freeNear([x + Math.cos(a) * 18, Math.max(y + 14, e.y + 10) + Math.sin(a) * 10]);   // ra từ dưới thân tàu
      const m = SK.makeEnemy(G, id, fx0, fy0, e.room);
      m.shipSummon = true;
      if (d) { m.dwave = true; m.dz = d.zone; m.dpts = 1; m.hpMax = m.hp = Math.round(m.hp * (Df && Df.hpMul ? Df.hpMul(d.zone) : 1)); }
      G.enemies.push(m);
    }
  }

  // ---- hook sát thương: thân bất khả xâm phạm tới khi hết bộ phận, khiên bộ phận, hạ thân thì rơi xuống Đá Phép rồi mới chết thật
  const hurt0 = SK.hurtEnemy;
  SK.hurtEnemy = function (G, e, dmg, ...rest) {
    if (e && e.shipPart) {
      const b = e.shipBody;
      if (e.partDead || e.st === 'dead' || b.ship.crash) return false;
      if (e.shield > 0) {
        e.shield -= dmg; e.flash = 0.08; SK.num(G, e.x, e.y - 18, Math.round(dmg), '#7ad8ff');
        if (e.shield <= 0) { e.shield = 0; b.ship.shieldBroken++; }
        return true;
      }
      const r = hurt0.call(this, G, e, dmg, ...rest);
      if (e.hp <= 0 && !e.partDead) partDown(G, b, e);
      return r;
    }
    if (e && e.bossKey === PID && e.ship) {
      const sh = e.ship;
      if (e.deathDone || sh.crash || e.hidden) return false;
      if (!sh.allDown) return false;   // còn bộ phận: thân không ăn sát thương
      if (e.hp - dmg <= 0) {
        e.hp = 1; sh.crash = { t: 0, x0: e.x, y0: e.y };
        SK.num(G, e.x, e.y - 40, Math.round(dmg), '#ffed00', true);
        if (G.toast) G.toast('Tàu Ngoài Hành Tinh rơi xuống Đá Phép!', 2.5);
        return true;
      }
    }
    return hurt0.call(this, G, e, dmg, ...rest);
  };

  // ---- các đòn ------------------------------------------------------------------------------------------
  const gunBul = (G, e, name, x, y, a, spd) => fire(G, e, name, x, y, a, { spd, dmg: dm(e, 'bullet'), life: 9, h: Math.max(6, e.y - y) });
  function gunStart(e, key, dur) { const sh = e.ship; sh.busy[key] = dur; sh.cancel[key] = false; }
  function startConcentric(G, e) {
    gunStart(e, 'lg', S.gunDur); const sh = e.ship;
    let rot = SK.rand() * TAU;
    every(e, S.gunDur, 0.9, G2 => {
      if (sh.cancel.lg) return;
      const [x, y] = point(e, 'root/left_gun/img/body/muzzle');
      rot += 0.21;
      for (let k = 0; k < 20; k++) gunBul(G2, e, 'bullet_e_alien_carrier', x, y, rot + k * TAU / 20, 5.5);   // sóng đồng tâm toả mọi hướng [WIKI]
    });
    sh.log.push('concentric');
  }
  function startSpiral(G, e) {
    gunStart(e, 'lg', S.gunDur); const sh = e.ship;
    let a = SK.rand() * TAU;
    every(e, S.gunDur, 0.11, G2 => {
      if (sh.cancel.lg) return;
      const [x, y] = point(e, 'root/left_gun/img/body/muzzle');
      a += 0.42;
      for (let k = 0; k < 3; k++) gunBul(G2, e, 'bullet_e_alien_carrier', x, y, a + k * TAU / 3, 6);   // xoắn ốc toả mọi hướng [WIKI]
    });
    sh.log.push('spiral');
  }
  function startStreams(G, e) {
    gunStart(e, 'rg', S.gunDur); const sh = e.ship;
    const two = SK.chance(0.5);
    let base = null;
    every(e, S.gunDur, 0.09, (G2, i, t) => {
      if (sh.cancel.rg) return;
      const [x, y] = point(e, 'root/right_gun/img/body/muzzle');
      if (base == null) base = aimAt(G2, x, y);
      const sw = base + Math.sin(t * 0.9) * 0.5;   // quét chậm quanh hướng ban đầu [ƯỚC LƯỢNG]
      for (const a of two ? [sw - 22.5 * DEG, sw + 22.5 * DEG] : [sw]) gunBul(G2, e, 'bullet_e_alien_carrier2', x, y, a, 7);   // một / hai luồng cách 45° [WIKI]
    });
    sh.log.push('streams');
  }
  function startCone(G, e) {
    gunStart(e, 'rg', S.gunDur); const sh = e.ship;
    every(e, S.gunDur, 0.4, G2 => {
      if (sh.cancel.rg) return;
      const [x, y] = point(e, 'root/right_gun/img/body/muzzle'), a0 = aimAt(G2, x, y);
      for (let k = 0; k < 9; k++) gunBul(G2, e, 'bullet_e_alien_carrier2', x, y, a0 + (k / 8 - 0.5) * 120 * DEG, 7);   // quạt 120° nhằm người chơi [WIKI]
    });
    sh.log.push('cone');
  }
  function startSide(G, e) {
    const sh = e.ship; sh.busy.side = S.sideDur;
    const dir = SK.chance(0.5) ? 1 : -1, x0 = e.x, P = sh.parts;
    sh.log.push('side');
    for (const [pi, nm, alt] of [[2, 'root/left_laser/img/body/muzzle', N + 'left_usb'], [3, 'root/right_laser/img/body/muzzle', N + 'right_usb']]) {
      const bs = { dmg: dm(e, 'side'), a: Math.PI / 2, ox: 0, oy: 0 };
      beam(G, e, 'laser_e_alien_carrier', {
        dmg: dm(e, 'side'), len: 520, width: 10, thick: 1.4,
        alive: () => sh.busy.side > 0 && !e.deathDone && !sh.crash && !sh.bomb,
        origin() { const q = point(e, P[pi].partDead ? alt : nm); bs.ox = q[0]; bs.oy = q[1]; beamTowers(SK.G, bs); return q; },
        ang() { return Math.PI / 2; }
      });
    }
    arena(e, S.sideDur, (G2, o) => {   // tàu trôi sang trái / phải trong lúc bắn [WIKI]
      const T = SK.TILE, r = e.room;
      e.x = SK.clamp(x0 + dir * S.drift * Math.min(1, o.t / 1.2), (r.x0 + 4) * T, (r.x1 - 3) * T);
      sh.busy.side = S.sideDur - o.t;
      return aliveObj(e) && !sh.bomb;
    });
  }
  function startEye(G, e) {
    const sh = e.ship; sh.busy.eye = S.eyeDur; sh.log.push('eye');
    const bs = { dmg: dm(e, 'eye'), a: Math.PI / 2, ox: 0, oy: 0 };
    let a = null;
    beam(G, e, 'laser_e_alien_carrier', {
      dmg: dm(e, 'eye'), len: 560, width: 9, thick: 1,
      alive: () => sh.busy.eye > 0 && !e.deathDone && !sh.crash && !sh.bomb,
      origin() { const q = point(e, N + 'eye'); bs.ox = q[0]; bs.oy = q[1]; return q; },
      ang(dt) {
        const [x, y] = point(e, N + 'eye'), want = aimAt(SK.G, x, y);
        if (a == null) a = Math.PI / 2;
        let d = want - a; d = Math.atan2(Math.sin(d), Math.cos(d));
        a += SK.clamp(d, -50 * DEG * dt, 50 * DEG * dt);   // bám người chơi 50°/giây [ƯỚC LƯỢNG]
        bs.a = a; beamTowers(SK.G, bs);
        return a;
      }
    });
    arena(e, S.eyeDur, (G2, o) => { sh.busy.eye = S.eyeDur - o.t; return aliveObj(e); });
  }
  function startMissiles(G, e) {
    const sh = e.ship; sh.busy.missiles = 2.2; sh.log.push('missiles');
    const li = dupIdx(e, N + 'left_missle')[0], ri = dupIdx(e, N + 'right_missle')[0];
    K.rigPlay(e.R, 'left_missle_open', li); K.rigPlay(e.R, 'right_missle_open', ri);
    const vol = e.hp < e.hpMax * 0.5 || sh.allDown ? 3 : 2;   // vài luồng liên tiếp [WIKI]
    for (let v = 0; v < vol; v++) arena(e, v * 0.7 + 0.5, (G2, o) => {
      if (o.t < v * 0.7) return true;
      if (!aliveObj(e)) return false;
      const ms = muzzles(e, N + 'left_missle_muzzles/muzzle').concat(muzzles(e, N + 'right_missle_muzzles/muzzle'));
      ms.forEach(([x, y], i) => fire(G2, e, 'follow_bullet_e_alien_carrier', x, y, (i < 3 ? 0.62 : 0.38) * Math.PI + (i % 3 - 1) * 0.25, { spd: 7, dmg: dm(e, 'missile'), life: 7, h: Math.max(6, e.y - y) }));   // 6 tên lửa tầm nhiệt [WIKI]
      return false;
    });
    arena(e, 2.6, (G2, o) => { sh.busy.missiles = 2.2 - o.t; if (o.t >= 2.4) { K.rigPlay(e.R, 'left_missle_close', li); K.rigPlay(e.R, 'right_missle_close', ri); return false; } return aliveObj(e); });
  }
  function startSphere(G, e) {
    const sh = e.ship, total = S.sphereLaunch + 1.2 + S.sphereSpin + S.sphereLinger;
    sh.busy.sphere = total; sh.log.push('sphere');
    const n = 28, slots = [], cx = () => e.x, cy = () => e.y - 50;   // 28 viên (4.0.2 giảm số đạn) [WIKI]
    const mk = (G2, i) => {
      const b = fire(G2, e, 'bullet_e_alien_carrier 1', cx(), cy(), TAU * i / n, { spd: 0, dmg: dm(e, 'sphere'), life: total + 2, h: 14 });
      slots[i] = b || null;
    };
    for (let i = 0; i < n; i++) mk(G, i);
    let base = 0;
    arena(e, total, (G2, o, dt) => {
      const t = o.t, L = S.sphereLaunch;
      let rad, spin;
      if (t < L) { rad = 40 + Math.sin(t * 3) * 3; spin = 0.5; }                                  // tụ quanh tàu 6 s, đập vỡ thì mọc lại [WIKI]
      else if (t < L + 1.2) { const k = (t - L) / 1.2; rad = 40 + 66 * k * k * (3 - 2 * k); spin = 0.5 + 1.4 * k; }   // phóng ra
      else if (t < L + 1.2 + S.sphereSpin) { rad = 106; spin = 1.9; }                             // cầu quay 5 s
      else { rad = 106; spin = 0; }                                                                // đứng yên 3-4 s rồi tan
      sh.busy.sphere = total - t;
      base += spin * dt;
      for (let i = 0; i < n; i++) {
        let b = slots[i];
        if (!b || b.dead) { if (t < L && aliveObj(e)) { mk(G2, i); b = slots[i]; } if (!b || b.dead) continue; }
        const a = base + TAU * i / n;
        b.x = cx() + Math.cos(a) * rad; b.y = cy() + Math.sin(a) * rad * 0.8; b.vx = 0; b.vy = 0; b.ang = a;
      }
      if (!aliveObj(e)) { for (const b of slots) if (b) b.dead = true; return false; }
      if (t >= total - 0.05) for (const b of slots) if (b) b.dead = true;
      return true;
    });
  }
  function startBombard(G, e) {
    const sh = e.ship, T = SK.TILE, r = e.room;
    sh.bomb = { t: 0, ph: 'warn', x: e.x, y0: e.y, lanes: [-72, -36, 0, 36, 72] };   // 3 vệt nổ (chẵn) + 2 vệt đỏ an toàn (lẻ) [WIKI]
    sh.log.push('bombard');
    const x = e.x, bot = (r.y1 + 1) * T, top = (r.y0 + 2) * T;
    sh.bomb.lanes.forEach((off, i) => {
      if (i % 2 === 1) e.arena.objs.push({ t: 0, dur: 4, ground(ctx, G2, o) { ctx.fillStyle = 'rgba(255,60,60,' + (0.18 + 0.1 * Math.sin(o.t * 12)) + ')'; ctx.fillRect(x + off - 15, top, 30, bot - top); } });
    });
    if (K.sfx && e.ent.mbs && e.ent.mbs.AlienCarrier) K.sfx(G, e.ent.mbs.AlienCarrier.thruster_fx);
  }
  function tickBombard(G, e, dt) {
    const sh = e.ship, b = sh.bomb, T = SK.TILE, r = e.room, bot = (r.y1 + 1) * T + 90;
    b.t += dt;
    if (b.ph === 'warn') {   // báo bằng tiếng bíp, thân rung [WIKI]
      e.x = b.x + Math.sin(b.t * 60) * 1.4;
      if (b.t >= 1.3) { b.ph = 'fly'; b.t = 0; b.last = e.y; e.x = b.x; }
    } else if (b.ph === 'fly') {
      e.y += 250 * dt;
      while (b.last < e.y) {
        b.last += 22;
        b.lanes.forEach((off, i) => { if (i % 2 === 0) boomAt(G, e, b.x + off, b.last - 28); });
      }
      if (e.y >= bot) { b.ph = 'gone'; b.t = 0; e.hidden = true; }
    } else if (b.ph === 'gone') {
      if (b.t >= 3) { b.ph = 'back'; b.t = 0; e.hidden = false; e.y = b.y0 - 260; }   // quay lại sau vài giây [WIKI]
    } else if (b.ph === 'back') {
      const k = Math.min(1, b.t / 1.3); e.y = (b.y0 - 260) + 260 * (k * (2 - k));
      if (k >= 1) { e.y = b.y0; e.x = b.x; sh.bomb = null; sh.coreCd = Math.max(sh.coreCd, 1.2); }
    }
  }
  function boomAt(G, e, x, y) {
    e.arena.objs.push({ t: 0, dur: 0.4, update(G2, o) {
      if (o.t < 0.3) return true;   // nổ trễ 0,3 s sau khi tàu bay qua [ƯỚC LƯỢNG]
      if (!e.deathDone) { explode(G2, x, y, 'explode_hit_player', 'explode_small', dm(e, 'bomb')); hitTowers(G2, x, y, 18, dmgOf(dm(e, 'bomb'))); }
      return false;
    } });
  }

  // ---- chọn đòn -----------------------------------------------------------------------------------------
  const STARTS = { eye: startEye, missiles: startMissiles, sphere: startSphere, bombard: startBombard };
  S.start = (id, G, e) => STARTS[id](G, e);   // cho test / debug: ép một đòn lõi
  function schedule(G, e, dt) {
    const sh = e.ship, P = sh.parts;
    for (const k of ['lg', 'rg']) if (sh.busy[k] > 0) sh.busy[k] -= dt;
    // súng trái / phải: mỗi bên một đòn 12 s rồi nghỉ 4-8 s; thỉnh thoảng hai đòn cùng lúc
    for (const [pi, key, list] of [[0, 'lg', [startConcentric, startSpiral]], [1, 'rg', [startStreams, startCone]]]) {
      if (P[pi].partDead || sh.busy[key] > 0) continue;
      sh.gcd[key] -= dt;
      if (sh.gcd[key] > 0) continue;
      const f = SK.pick(list); f(G, e); sh.gcd[key] = S.gunDur + rnd(S.gunCd);
      if (SK.chance(0.3)) list.find(x => x !== f)(G, e);
    }
    // laser bên: còn tới khi mất hết bộ phận
    if (P.some(p => !p.partDead) && !(sh.busy.side > 0)) {
      sh.sideCd -= dt;
      if (sh.sideCd <= 0) { startSide(G, e); sh.sideCd = S.sideDur + rnd(S.sideCd); }
    }
    // lõi
    sh.coreCd -= dt;
    if (sh.coreCd <= 0) {
      const busy = id => sh.busy[id === 'bombard' ? 'bomb' : id] > 0;
      let opts = S.core.filter(id => !busy(id) && id !== sh.lastCore && id !== 'bombard');
      if (!(sh.busy.side > 0 || sh.busy.eye > 0 || sh.busy.sphere > 0) && sh.lastCore !== 'bombard' && SK.chance(0.3)) opts = ['bombard'];
      if (!opts.length) { sh.coreCd = 1; return; }
      const id = SK.pick(opts);
      sh.lastCore = id; sh.coreCount[id] = (sh.coreCount[id] || 0) + 1;
      STARTS[id](G, e);
      sh.coreCd = (sh.allDown ? S.coreCdLast : S.coreCd) * SK.randf(0.85, 1.15);
    }
  }

  const def = {
    atks: [], idle: 'alien_carrier_idle', run: 'alien_carrier_run', walk: false, firstCd: 1.5,
    canAttack: () => false,   // mọi đòn do tick() lập lịch
    tick(G, e, dt) {
      const sh = e.ship; if (!sh || e.deathDone) return;
      sh.t += dt;
      for (const p of sh.parts) { const [x, y] = rigPoint(e.R, p.nodeIdx, e.x, e.y, 1); p.x = x; p.y = y; p.room = e.room; }   // bộ phận đi theo nút của thân
      // dưới 50% máu thân lần đầu: người chơi +400 năng lượng [WIKI]
      if (!sh.energyGiven && e.hp < e.hpMax * 0.5) {
        sh.energyGiven = true; const pl = G.player;
        pl.energy = Math.min(pl.energyMax || (pl.energy + S.energyBonus), pl.energy + S.energyBonus);
        SK.num(G, pl.x, pl.y - 30, '+' + S.energyBonus, '#6ab0ff');
      }
      if (sh.crash) { tickCrash(G, e, dt); return; }
      sh.shieldCd -= dt;   // khiên che một bộ phận [WIKI Tactics]
      if (sh.shieldCd <= 0) {
        const live = sh.parts.filter(p => !p.partDead && p.shield <= 0);
        if (live.length && !sh.allDown) { SK.pick(live).shield = S.shieldHp; sh.shielded++; }
        sh.shieldCd = rnd(S.shieldCd);
      }
      if (sh.bomb) { tickBombard(G, e, dt); return; }
      schedule(G, e, dt);
    }
  };

  function drawShip(ctx, G, e) {
    if (e.hidden) return;
    const sh = e.ship;
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale(SC, SC);
    SK.bossRig.rigDraw(ctx, e.R, 0, 0, { pages: e.flash > 0 ? SK.pagesWhite : null, skip: n => /(^|\/)shadow(_lock)?$/.test(n.n) });   // bỏ nút bóng (bóng pha cả thân)
    ctx.restore();
    if (sh.crash) {   // lửa khi rơi
      ctx.fillStyle = 'rgba(255,140,40,' + (0.25 + 0.2 * Math.sin(sh.crash.t * 30)) + ')';
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 26, 70, 26, 0, 0, TAU); ctx.fill();
    }
    for (const q of sh.parts) {   // thanh máu + khiên từng bộ phận
      if (q.partDead) continue;
      const w = 30, x0 = Math.round(q.x - w / 2), yb = Math.round(q.y - 26);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 - 1, yb - 1, w + 2, 5);
      ctx.fillStyle = '#e03a3a'; ctx.fillRect(x0, yb, Math.max(0, Math.round(w * q.hp / q.hpMax)), 3);
      if (q.shield > 0) {
        ctx.save(); ctx.strokeStyle = 'rgba(120,220,255,0.9)'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(120,220,255,0.18)';
        ctx.beginPath(); ctx.ellipse(q.x, q.y, 20, 18, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
  }

  function tickCrash(G, e, dt) {
    const sh = e.ship, c = sh.crash, d = G.defence;
    c.t += dt;
    const tx = d && d.stoneAt ? d.stoneAt.x : e.x, ty = d && d.stoneAt ? d.stoneAt.y : e.y, k = Math.min(1, c.t / S.crashT), s = k * k;
    e.x = c.x0 + (tx - c.x0) * s; e.y = c.y0 + (ty + 30 - c.y0) * s;
    G.shake = Math.max(G.shake, 2 + 4 * k);
    if (SK.rand() < dt * 14) fx(G, e.x + SK.randf(-60, 60), e.y + SK.randf(-40, 4), false);
    if (c.t >= S.crashT && !c.done) {
      c.done = true; sh.crashed = true;
      for (let i = 0; i < 6; i++) fx(G, tx + SK.randf(-50, 50), ty + SK.randf(-30, 20), true);
      G.shake = 10; e.hidden = true;
      e.hp = 1;
      hurt0.call(SK, G, e, 5, false, 0, 0);   // chết thật: enemyKill -> hết đợt 12-3 -> thắng
    }
  }

  // ---- sinh Tàu: dựng bằng makeBoss rồi thêm bộ phận + trạng thái; đặt giữa phía trên phòng
  function init(G, e) {
    const r = e.room, T = SK.TILE, cx = (r.x0 + r.x1 + 1) / 2 * T;
    e.noFace = true; e.face = 1; e.hold = true;   // hold: không lao vào Đá Phép như quái sóng (js/defence.js)
    e.hpMax = e.hp = S.bodyHp;
    e.x = cx; e.y = (r.y0 + 5.5) * T;   // thân vắt qua nửa trên phòng; phần dưới (gần Đá Phép) nằm trong tầm nhìn
    e.scale = SC; e.hb = { size: [300, 230], off: [0, 158] }; e.r = 50; e.draw = drawShip;
    e.arena.introT = 99; e.st = 'idle'; e.stT = 0;
    const sh = e.ship = { t: 0, parts: [], busy: {}, cancel: {}, gcd: { lg: 3, rg: 5 }, sideCd: 9, coreCd: 2.5, shieldCd: S.shieldCd[0], coreCount: {}, allDown: false,
      crash: null, bomb: null, log: [], summonLog: [], shielded: 0, shieldBroken: 0, energyGiven: false };
    for (const spec of S.parts) { const p = makePart(e, spec, e.nodes[spec.node]); sh.parts.push(p); G.enemies.push(p); }
    e.parts = sh.parts;
    return e;
  }
  SK.bossRegister(PID, def);
  const make0 = SK.CUSTOM_ENEMIES[PID];
  SK.CUSTOM_ENEMIES[PID] = (G, x, y, room) => init(G, make0(G, x, y, room));
})();
