// Big bosses with their own bodies and a move list each: a boss strings two or three moves into a combo, rests a
// moment, then picks the next combo; under half health it moves faster and chains longer combos.
// Kits register in BZ.BOSS_KITS (js/boss-*.js). This file owns the shared show: glowing projectiles with trails,
// ground warnings that fill up before they go off, beams, shock rings you can jump over, flashes and camera shake.
// The host decides every hit; guests get each effect through the 'zk' channel and replay it as looks only.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  BZ.rgb = rgb;
  BZ.BOSS_KITS = BZ.BOSS_KITS || {};

  BZ.defTex('bz_ring', 64, 64, ({ set }) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const r = Math.hypot(x - 31.5, y - 31.5) / 31.5;
      const a = r > 1 ? 0 : r > 0.86 ? 255 : r > 0.8 ? 120 : 0;
      set(x, y, [255, 255, 255], a);
    }
  }, { noMip: true });
  BZ.defTex('bz_disc', 64, 64, ({ set }) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const r = Math.hypot(x - 31.5, y - 31.5) / 31.5;
      set(x, y, [255, 255, 255], r > 1 ? 0 : Math.round(255 * (0.35 + 0.65 * r * r)));
    }
  }, { noMip: true });
  BZ.defTex('bz_strip', 16, 64, ({ set }) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) {
      const e = Math.abs(x - 7.5) / 7.5; const chev = ((y + Math.abs(x - 7.5) * 1.2) % 16) < 3;
      set(x, y, [255, 255, 255], e > 0.82 ? 255 : chev ? 150 : 60);
    }
  }, { noMip: true });

  // Register a kit: its type joins BZ.ZOMBIES, so pooling, snapshots and hit tests treat it like any zombie.
  BZ.bossKit = (id, kit) => {
    BZ.BOSS_KITS[id] = kit;
    BZ.ZOMBIES[id] = { shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], voice: 'roar', hunch: 0, droop: 0, noDown: true, noTower: true, ...kit.type, kind: 'boss2', boss: id, rig: id };
  };

  BZ.makeBosses = (G, api, H) => {
    const V = () => new THREE.Vector3();
    const host = () => !(G.coop && G.coop.guest);
    const net = (p) => { if (host()) G.events.emit('zk', p); };
    const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    const v3 = (a) => V().set(a[0], a[1], a[2]);
    const players = H.players;
    // timers and warnings remember which boss set them, so a dead boss stops attacking
    const timers = []; let owner = null;
    const after = (t, f) => timers.push({ t, f, owner });

    // ---------- looks shared by every boss ----------
    const glowMat = (col, op = 1) => new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const addMat = (col, op = 1, map) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, map: map ? BZ.tex(map) : null });
    const FLAT = new THREE.PlaneGeometry(1, 1); FLAT.rotateX(-Math.PI / 2);
    const SPHERE = new THREE.IcosahedronGeometry(0.5, 1);
    const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true); CYL.translate(0, 0.5, 0); CYL.rotateX(Math.PI / 2);
    const scene = G.scene;
    const shakeAt = (at, amt, range = 22) => { const P = G.player; const d = P.pos.distanceTo(at); if (d < range) P.shake.v += amt * (1 - d / range); };

    // flashes: a sprite that blows up and fades
    const flashes = [];
    function flash(at, size, col, life = 0.35) {
      const s = new THREE.Sprite(glowMat(col, 1)); s.position.copy(at); s.scale.setScalar(size * 0.3); s.renderOrder = 6; scene.add(s);
      flashes.push({ s, t: 0, life, size });
    }
    // impact: flash, glow sparks, a ground ring, shake
    function boom(at, r, cols, opt = {}) {
      flash(at, r * 3.2, cols[0], 0.3); flash(at, r * 1.6, 0xffffff, 0.14);
      for (let i = 0; i < 10 + r * 4; i++) {
        const d = V().set(G.rng.range(-1, 1), G.rng.range(0.2, 1.2), G.rng.range(-1, 1)).normalize();
        G.fx.puff(at.clone(), { glow: true, vel: d.multiplyScalar(G.rng.range(3, 8) * Math.max(0.6, r / 3)), drag: 2.2, s0: 0.5 + r * 0.18, s1: 0.05, life: G.rng.range(0.4, 0.8), c0: cols[0], c1: cols[1] || cols[0], a0: 1.1 });
      }
      G.fx.burst(at, 14 + r * 3, cols, { speed: 5 + r, size: 0.12, life: 0.8 });
      const g = V().set(at.x, Math.max(0.02, at.y - (opt.air ? 0 : 1.2)), at.z); if (at.y < 2.5) shock(g, r * 1.15, 0.45, cols[0], 0);
      if (opt.smoke !== false) for (let i = 0; i < 4; i++) G.fx.puff(at.clone().add(V().set(G.rng.range(-1, 1), 0.3, G.rng.range(-1, 1)).multiplyScalar(r * 0.4)), { delay: 0.08, vel: V().set(0, 1.2, 0), drag: 1, s0: r * 0.5, s1: r * 1.3, life: 1.6, c0: opt.smokeCol || 0x2a2030, c1: 0x4a4650, a0: 0.6 });
      shakeAt(at, 3 + r * 1.6);
      if (G.destruct && opt.terrain !== false) G.destruct.blast(at, r * 1.1, 70 + r * 50);
      if (opt.sound !== false) G.audio.playAt(opt.sound || 'boom', at, { gain: Math.min(1.2, 0.5 + r * 0.12), rate: opt.rate || 0.9 });
    }

    // ground rings: a quick visual ring (dmg 0) or a travelling shock wave that hurts whoever stands on its edge
    const rings = [];
    function shock(at, R, dur, col, dmg, opt = {}) {
      const m = new THREE.Mesh(FLAT, addMat(col, 1, 'bz_ring')); m.position.set(at.x, at.y + 0.08, at.z); m.scale.setScalar(0.1); m.renderOrder = 5; scene.add(m);
      const wall = opt.wall ? new THREE.Mesh(CYL_UP, addMat(col, 0.5)) : null; if (wall) { wall.position.copy(m.position); scene.add(wall); }
      rings.push({ m, wall, at: at.clone(), R, t: 0, dur, dmg, hit: new Set(), h: opt.h || 1.1, fx: opt.fx, by: opt.by });
      if (dmg && opt.net !== false) net({ t: 'bw', p: r2(at), R, d: dur, c: col, w: opt.wall ? 1 : 0 });
    }
    const CYL_UP = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); CYL_UP.translate(0, 0.5, 0);

    // ground warnings: a circle (or a strip) that fills up, then `fire` runs (host only)
    const teles = [];
    function warn(o) {
      const len = o.to ? Math.hypot(o.to.x - o.at.x, o.to.z - o.at.z) : 0;
      const edge = new THREE.Mesh(FLAT, addMat(o.col, 0.9, o.to ? 'bz_strip' : 'bz_ring'));
      const fill = new THREE.Mesh(FLAT, addMat(o.col, 0.35, o.to ? null : 'bz_disc'));
      for (const m of [edge, fill]) { m.renderOrder = 4; scene.add(m); }
      const y = (o.at.y || 0) + 0.06;
      if (o.to) {
        const mid = V().set((o.at.x + o.to.x) / 2, y, (o.at.z + o.to.z) / 2); const yaw = Math.atan2(o.to.x - o.at.x, o.to.z - o.at.z);
        edge.position.copy(mid); edge.rotation.y = yaw; edge.scale.set(o.w, 1, len); fill.position.copy(mid); fill.position.y += 0.01; fill.rotation.y = yaw; fill.scale.set(o.w, 1, 0.01);
      } else { edge.position.set(o.at.x, y, o.at.z); edge.scale.setScalar(o.r * 2); fill.position.set(o.at.x, y + 0.01, o.at.z); fill.scale.setScalar(0.01); }
      const T = { ...o, edge, fill, t: 0, len, yaw: edge.rotation.y, owner };
      teles.push(T);
      if (o.net !== false) net({ t: 'bt', p: r2(o.at), q: o.to ? r2(o.to) : 0, r: o.r || 0, w: o.w || 0, d: o.dur, c: o.col });
      return T;
    }

    // projectiles: a glowing core, a big halo, a trail of glow; shapes for bats, scarabs, skulls, shards
    const orbs = [];
    const SHAPES = {
      orb: () => new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })),
      shard: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })),
      bat: () => { const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: 0x1a0a14, fog: false, side: THREE.DoubleSide });
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.36), m)); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.34), m); w.position.x = s * 0.42; w.name = s < 0 ? 'wl' : 'wr'; g.add(w); }
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2030, fog: false })); e.position.set(0, 0.04, 0.19); g.add(e); return g; },
      scarab: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.55), new THREE.MeshBasicMaterial({ color: 0x1c5a7a, fog: false })));
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.4), new THREE.MeshBasicMaterial({ color: 0xffc23a, fog: false })); sh.position.set(0, 0.13, -0.04); g.add(sh);
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.16), new THREE.MeshBasicMaterial({ color: 0x0a2a3a, fog: false })); h.position.z = 0.34; g.add(h); return g; },
    };
    function orb(o) {
      const core = (SHAPES[o.shape || 'orb'] || SHAPES.orb)(); const sz = o.size || 0.5;
      core.scale.setScalar(sz * (o.shape && o.shape !== 'orb' && o.shape !== 'shard' ? 2 : 1)); core.traverse((m) => { if (m.isMesh && (o.shape || 'orb') === 'orb' || m.isMesh && o.shape === 'shard') m.material.color.setHex(o.core || 0xffffff); });
      const halo = new THREE.Sprite(glowMat(o.col, 0.9)); halo.scale.setScalar(sz * 5.5); halo.renderOrder = 6;
      const halo2 = new THREE.Sprite(glowMat(o.col2 || o.col, 0.5)); halo2.scale.setScalar(sz * 11);
      const g = new THREE.Group(); g.add(core); g.add(halo); g.add(halo2); g.position.copy(o.from); scene.add(g);
      const S = { ...o, g, core, halo, pos: o.from.clone(), vel: o.vel.clone(), t: 0, life: o.life || 4, size: sz, trail: 0 };
      orbs.push(S);
      if (o.net !== false) net({ t: 'bo', p: r2(o.from), v: r2(o.vel), k: o.key || 0, s: sz, c: o.col, c2: o.col2 || 0, co: o.core || 0, sh: o.shape || 0, gr: o.grav || 0, hm: o.homing || 0, l: S.life, br: o.blast || 0, tc: o.trailCol || 0 });
      return S;
    }
    const seg = V(); const tmpA = V(); const tmpB = V();
    function nearestPlayer(at) { let best = null; let bd = 1e9; for (const p of players()) { const d = p.pos.distanceTo(at); if (d < bd) { bd = d; best = p; } } if (!best && G.player.alive) best = G.player; return best; }
    function updateOrbs(dt) {
      for (let i = orbs.length - 1; i >= 0; i--) {
        const s = orbs[i]; s.t += dt;
        if (s.homing && s.t > (s.homeAfter || 0.15)) {
          const P = nearestPlayer(s.pos);
          if (P) { tmpA.set(P.pos.x, P.pos.y + 1.1, P.pos.z).sub(s.pos).normalize().multiplyScalar(s.vel.length()); s.vel.lerp(tmpA, Math.min(1, s.homing * dt)); }
        }
        if (s.grav) s.vel.y -= s.grav * dt;
        const step = s.vel.length() * dt; seg.copy(s.vel).normalize();
        let at = null; let victim = null;
        const wh = s.t > 0.05 && G.world.raycast(s.pos, seg, step + 0.1); if (wh) at = s.pos.clone().addScaledVector(seg, wh.t);
        if (!at && s.pos.y + seg.y * step < 0.05) at = s.pos.clone().setY(0.05);
        const rr = s.size + 0.55;
        for (const p of (host() && !s.visual ? players() : [G.player])) { if (p.alive !== false && Math.hypot(s.pos.x - p.pos.x, s.pos.y - p.pos.y - 1, s.pos.z - p.pos.z) < rr) { at = s.pos.clone(); victim = p; break; } }
        if (at || s.t >= s.life) {
          at = at || s.pos.clone();
          boom(at, s.blast || s.size * 2.4, [s.col, s.col2 || s.col, 0xffffff], { sound: s.sound, rate: s.rate, smoke: s.blast > 2, smokeCol: s.smokeCol });
          if (host() && !s.visual) {
            if (s.blast) for (const p of players()) { const d = Math.hypot(p.pos.x - at.x, p.pos.y + 0.9 - at.y, p.pos.z - at.z); if (d < s.blast) H.hurt(p, Math.round((s.dmg || 10) * (1 - (d / s.blast) * 0.5)), at, s.fx, s.push); }
            else if (victim) H.hurt(victim, s.dmg || 10, at, s.fx, s.push);
            if (s.hazard) H.hazard(s.hazard.kind, V().set(at.x, Math.max(0, at.y < 1.5 ? 0 : at.y - 1.2), at.z), s.hazard.r, s.hazard.dur);
            if (s.onHit) s.onHit(at);
          }
          scene.remove(s.g); disposeTree(s.g); orbs.splice(i, 1); continue;
        }
        s.pos.addScaledVector(s.vel, dt); s.g.position.copy(s.pos);
        const pulse = 1 + Math.sin(s.t * 22) * 0.12; s.halo.scale.setScalar(s.size * 5.5 * pulse);
        if (s.shape === 'bat') { const f = Math.sin(s.t * 30) * 0.8; const wl = s.core.getObjectByName('wl'); const wr = s.core.getObjectByName('wr'); wl.rotation.z = f; wr.rotation.z = -f; s.core.lookAt(tmpB.copy(s.pos).add(s.vel)); }
        else if (s.shape === 'scarab') s.core.lookAt(tmpB.copy(s.pos).add(s.vel));
        else { s.core.rotation.x += dt * 6; s.core.rotation.y += dt * 9; }
        s.trail += dt * (s.trailRate || 40);
        while (s.trail > 1) {
          s.trail -= 1;
          G.fx.puff(s.pos.clone().add(V().set(G.rng.range(-1, 1), G.rng.range(-1, 1), G.rng.range(-1, 1)).multiplyScalar(s.size * 0.4)), { glow: true, vel: s.vel.clone().multiplyScalar(-0.08), drag: 3, s0: s.size * 1.5, s1: 0.04, life: 0.32, c0: s.trailCol || s.col, c1: s.col2 || s.col, a0: 0.9 });
        }
      }
    }
    function disposeTree(o) { o.traverse((m) => { if (m.material) { if (m.material.dispose) m.material.dispose(); } }); }

    // beams: from a point to a point (sliding from `to` to `to2` over the duration); hurts every 0.2 s
    const beams = [];
    // o.anchor names a rig node on o.z: the beam's root stays on that node (a mouth, an eye, a hand) every frame, on guests too
    function beam(o) {
      if (o.anchor && o.z && !o.follow) { const z = o.z; const n = o.anchor; o.follow = () => (z.alive ? ctx.at(z, n) : o.from); o.from = ctx.at(z, n); }
      const outer = new THREE.Mesh(CYL, addMat(o.col, 0.55)); const inner = new THREE.Mesh(CYL, addMat(o.core || 0xffffff, 0.95));
      const tip = new THREE.Sprite(glowMat(o.col, 1)); const base = new THREE.Sprite(glowMat(o.col, 1));
      for (const m of [outer, inner, tip, base]) { m.renderOrder = 6; scene.add(m); }
      const B = { ...o, outer, inner, tip, base, t: 0, acc: 0, cur: o.to.clone() };
      beams.push(B);
      if (o.net !== false) net({ t: 'bb', p: r2(o.from), q: r2(o.to), q2: r2(o.to2 || o.to), w: o.w, d: o.dur, c: o.col, co: o.core || 0, k: o.key || 0, zi: o.anchor && o.z ? api.list.indexOf(o.z) : -1, a: o.anchor || 0 });
      return B;
    }
    const segDist = (p, a, b) => { tmpA.subVectors(b, a); const l2 = tmpA.lengthSq() || 1; const k = BZ.clamp(tmpB.subVectors(p, a).dot(tmpA) / l2, 0, 1); return tmpB.copy(a).addScaledVector(tmpA, k).distanceTo(p); };
    // lays the beam's meshes from its root to where it stops (the first wall); called again after a boss poses so an anchored root never lags a frame
    function place(B, flick = B.flick || 1) {
      B.flick = flick; const k = Math.min(1, B.t / B.dur);
      if (B.follow) B.from.copy(B.follow());
      B.cur.lerpVectors(B.to, B.to2 || B.to, k);
      const dir = tmpA.subVectors(B.cur, B.from); const len = dir.length(); dir.normalize();
      const wh = G.world.raycast(B.from, dir, len); const L = wh ? wh.t : len; const end = B.from.clone().addScaledVector(dir, L);
      const grow = Math.min(1, B.t / 0.12) * Math.min(1, (B.dur - B.t) / 0.15 + 0.05);
      for (const [m, w] of [[B.outer, B.w * 2.2], [B.inner, B.w * 0.7]]) { m.position.copy(B.from); m.lookAt(end); m.scale.set(w * grow * flick, w * grow * flick, L); }
      B.tip.position.copy(end); B.tip.scale.setScalar(B.w * 7 * grow * flick); B.base.position.copy(B.from); B.base.scale.setScalar(B.w * 5 * grow);
      return end;
    }
    function updateBeams(dt) {
      for (let i = beams.length - 1; i >= 0; i--) {
        const B = beams[i]; B.t += dt;
        const end = place(B, 0.85 + Math.random() * 0.3);
        if (Math.random() < dt * 40) G.fx.puff(end.clone(), { glow: true, vel: V().set(G.rng.range(-3, 3), G.rng.range(1, 5), G.rng.range(-3, 3)), drag: 2, s0: B.w * 1.6, s1: 0.05, life: 0.35, c0: B.col, c1: B.core || B.col, a0: 1 });
        if (end.y < 0.5 && Math.random() < dt * 14) H.hazard && host() && !B.visual && B.scorch && H.hazard(B.scorch, V().set(end.x, 0, end.z), 0.9, 2.5);
        B.acc += dt;
        if (host() && !B.visual && B.acc >= 0.2 && B.t > 0.1) {
          B.acc = 0;
          for (const p of players()) { tmpB.set(p.pos.x, p.pos.y + 1, p.pos.z); if (segDist(tmpB.clone(), B.from, end) < B.w + 0.55) H.hurt(p, B.dmg || 6, end, B.fx); }
        }
        if (B.t >= B.dur) { for (const m of [B.outer, B.inner, B.tip, B.base]) { scene.remove(m); m.material.dispose(); } beams.splice(i, 1); }
      }
    }

    function updateFx(dt) {
      for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; const k = f.t / f.life; f.s.scale.setScalar(f.size * (0.3 + k * 0.9)); f.s.material.opacity = Math.max(0, 1 - k); if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); flashes.splice(i, 1); } }
      for (let i = rings.length - 1; i >= 0; i--) {
        const R = rings[i]; R.t += dt; const k = Math.min(1, R.t / R.dur); const r = R.R * (R.dmg ? k : 0.25 + 0.75 * Math.sqrt(k));
        R.m.scale.setScalar(Math.max(0.1, r * 2)); R.m.material.opacity = 1 - k * k;
        if (R.wall) { R.wall.scale.set(r, R.h * (1 - k * 0.5), r); R.wall.material.opacity = 0.45 * (1 - k); }
        if (R.dmg && host()) for (const p of players()) {
          if (R.hit.has(p)) continue; const d = Math.hypot(p.pos.x - R.at.x, p.pos.z - R.at.z);
          if (Math.abs(d - r) < 0.7 && p.pos.y - R.at.y < R.h) { R.hit.add(p); H.hurt(p, R.dmg, R.at, R.fx, 6); }
        }
        if (k >= 1) { scene.remove(R.m); R.m.material.dispose(); if (R.wall) { scene.remove(R.wall); R.wall.material.dispose(); } rings.splice(i, 1); }
      }
      for (let i = teles.length - 1; i >= 0; i--) {
        const T = teles[i]; T.t += dt; const k = Math.min(1, T.t / T.dur); const pulse = 0.65 + 0.35 * Math.sin(T.t * (10 + k * 20));
        T.edge.material.opacity = 0.9 * pulse; T.fill.material.opacity = 0.25 + 0.4 * k;
        if (T.to) { T.fill.scale.set(T.w, 1, Math.max(0.01, T.len * k)); const off = (T.len * k - T.len) / 2; T.fill.position.set((T.at.x + T.to.x) / 2 + Math.sin(T.yaw) * off, T.fill.position.y, (T.at.z + T.to.z) / 2 + Math.cos(T.yaw) * off); }
        else T.fill.scale.setScalar(Math.max(0.01, T.r * 2 * k));
        if (k >= 1) { for (const m of [T.edge, T.fill]) { scene.remove(m); m.material.dispose(); } teles.splice(i, 1); if (T.fire && host() && T.net !== 'visual' && !(T.owner && !T.owner.alive)) T.fire(T); }
      }
      for (let i = timers.length - 1; i >= 0; i--) { const q = timers[i]; q.t -= dt; if (q.t <= 0) { timers.splice(i, 1); if (!(q.owner && !q.owner.alive)) { owner = q.owner; q.f(); owner = null; } } }
    }

    // ---------- the move machine ----------
    const listIdx = (z) => api.list.indexOf(z);
    const kitOf = (z) => BZ.BOSS_KITS[z.T.boss];
    const ctx = { G, V, host, net, players, after, flash, boom, shock, warn, orb, beam, shakeAt, hurt: (...a) => H.hurt(...a), hazard: (...a) => H.hazard(...a), summon: (...a) => H.summon(...a), nearest: nearestPlayer,
      // walk toward a point along the flow field for a body of this radius; returns the distance left
      walk(z, dt, tx, tz, speed, r = 0.8) {
        const dx = tx - z.pos.x; const dz = tz - z.pos.z; const d = Math.hypot(dx, dz); const o = [0, 0];
        let sx = dx; let sz = dz; if (d > 4 && G.world.flowDir(z.pos.x, z.pos.z, o, r)) { sx = o[0]; sz = o[1]; }
        const l = Math.hypot(sx, sz) || 1; const want = d < 0.3 ? 0 : speed;
        z.vel.x = BZ.damp(z.vel.x, (sx / l) * want, 6, dt); z.vel.z = BZ.damp(z.vel.z, (sz / l) * want, 6, dt); z.vel.y -= 22 * dt;
        G.world.moveBox(z.pos, z.vel, dt, r, 2.2, H.out, 0.6);
        return d;
      },
      // fly toward a point with no collision, kept inside the walls
      fly(z, dt, tx, ty, tz, speed, k = 3) {
        const d = Math.hypot(tx - z.pos.x, ty - z.pos.y, tz - z.pos.z) || 1; const s = Math.min(speed, d * 2.5);
        z.vel.x = BZ.damp(z.vel.x, ((tx - z.pos.x) / d) * s, k, dt); z.vel.y = BZ.damp(z.vel.y, ((ty - z.pos.y) / d) * s, k, dt); z.vel.z = BZ.damp(z.vel.z, ((tz - z.pos.z) / d) * s, k, dt);
        z.pos.addScaledVector(z.vel, dt); const lim = G.world.HALF + 4; z.pos.x = BZ.clamp(z.pos.x, -lim, lim); z.pos.z = BZ.clamp(z.pos.z, -lim, lim); z.pos.y = Math.max(0, z.pos.y);
        return d;
      },
      face(z, P, dt, k = 6) { z.yaw += BZ.wrapAngle(Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z) - z.yaw) * Math.min(1, dt * k); },
      fwd: (z) => V().set(Math.sin(z.yaw), 0, Math.cos(z.yaw)),
      // a point on the body in world space (a rig node), for muzzles and hit boxes
      at(z, node, off) { const R = z.body.x[z.T.rig]; const n = R && R.n[node]; if (!n) return V().set(z.pos.x, z.pos.y + 1.5 * z.T.scale, z.pos.z); z.body.root.updateMatrixWorld(true); return n.localToWorld(off ? off.clone() : V()); },
      aimAt: (P, lead = 0) => V().set(P.pos.x, P.pos.y + 1.0, P.pos.z).addScaledVector(P.vel || V(), lead),
      los: (a, b) => G.world.lineOfSight(a, b),
      rage: (z) => z.hp < z.maxHp * 0.5,
      inArena: (x, z, m = 2) => Math.abs(x) < G.world.HALF - m && Math.abs(z) < G.world.HALF - m,
    };
    BZ.bossCtx = ctx;

    function init(z) {
      const kit = kitOf(z);
      z.bs = { cur: null, t: 0, queue: [], rest: 1.6, cds: {}, n: 0, data: {} };
      if (kit.init) kit.init(z, z.bs, ctx);
    }
    function start(z, name, P) {
      const kit = kitOf(z); const M = kit.moves[name]; const S = z.bs;
      S.cur = name; S.t = 0; S.data = {}; S.cds[name] = (M.cd || 4) * (ctx.rage(z) ? 0.7 : 1); S.n++;
      S.dur = (M.dur || 1.5) * (ctx.rage(z) && M.rageFast !== false ? 0.85 : 1);
      if (M.start && host()) M.start(z, S, P, ctx);
      if (M.say) G.ui.pop(M.say, 'critword', V().set(z.pos.x, z.pos.y + 3 * z.T.scale, z.pos.z));
      net({ t: 'bm', i: listIdx(z), m: name, d: S.dur });
    }
    function step(z, dt, P, dist) { owner = z; try { return step1(z, dt, P, dist); } finally { owner = null; } }
    function step1(z, dt, P, dist) {
      const kit = kitOf(z); if (!z.bs) init(z); const S = z.bs;
      z.hold = true; z.noMelee = true;
      for (const k in S.cds) S.cds[k] -= dt;
      if (S.cur) {
        const M = kit.moves[S.cur]; S.t += dt;
        if (M.tick) M.tick(z, dt, P, S, ctx, S.t / S.dur);
        if (S.t >= S.dur) {
          if (M.end) M.end(z, S, P, ctx);
          S.cur = null;
          const next = S.queue.shift();
          if (next && P.alive !== false) { start(z, next, P); return true; }
          S.rest = (kit.rest || 1.2) * (ctx.rage(z) ? 0.55 : 1);
        }
        return true;
      }
      S.rest -= dt;
      if (kit.idle) kit.idle(z, dt, P, dist, S, ctx);
      if (S.rest <= 0 && P.alive !== false) {
        const pool = (ctx.rage(z) && kit.rageCombos ? kit.rageCombos.concat(kit.combos) : kit.combos).filter((c) => { const M = kit.moves[c[0]]; return (S.cds[c[0]] || 0) <= 0 && (!M.when || M.when(z, P, dist, ctx)); });
        if (pool.length) { const c = G.rng.pick(pool); S.queue = c.slice(1); start(z, c[0], P); }
        else S.rest = 0.25;
      }
      return true;
    }
    function pose(z, dt, sp) {
      const kit = kitOf(z); const R = z.body.x[z.T.rig]; if (!R) return;
      if (!z.bs) init(z);
      const S = z.bs; if (!host() && S.cur) { S.t += dt; if (S.t >= S.dur + 0.3) S.cur = null; }
      z.bob = (z.bob || 0) + dt;
      kit.pose(z, R, dt, sp, S, ctx);
      for (const B of beams) if (B.z === z && B.anchor) place(B);
    }
    function boxes(z) {
      const kit = kitOf(z); const R = z.body.x[z.T.rig]; if (!R) return null; const s = z.T.scale; z.body.root.updateMatrixWorld(true);
      return kit.hits.map(([part, node, r, oy]) => { const p = R.n[node].getWorldPosition(V()); if (oy) p.y += oy * s; const h = r * s; return { part, min: [p.x - h, p.y - h, p.z - h], max: [p.x + h, p.y + h, p.z + h] }; });
    }
    function dress(z) {
      const X = z.body.x; const T = z.T;
      for (const id in BZ.BOSS_KITS) if (X[id]) X[id].g.visible = false;
      if (T.kind !== 'boss2') return;
      if (!X[T.rig]) { const R = BZ.BOSS_KITS[T.rig].rig(G, z.body, { V, glowMat, addMat }); R.g.visible = false; z.body.root.add(R.g); X[T.rig] = R; }
      X[T.rig].g.visible = true; z.body.hips.visible = false; z.bs = null;
      const k = BZ.BOSS_KITS[T.rig]; if (k.dress) k.dress(z, X[T.rig]);
    }
    // the death: the body bursts into its blocks with chained blasts in the kit's colours
    function die(z, dir) {
      const kit = kitOf(z); const R = z.body.x[z.T.rig]; const s = z.T.scale; const cols = kit.colors || [0xffffff, 0xff8040];
      const at = V().set(z.pos.x, z.pos.y + 1.2 * s, z.pos.z);
      if (R) { z.body.root.updateMatrixWorld(true); const meshes = []; R.g.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); }); for (const m of meshes) G.fx.gib(m, V().set(G.rng.range(-5, 5), G.rng.range(4, 10), G.rng.range(-5, 5)).addScaledVector(dir, 3)); R.g.visible = false; }
      for (let i = 0; i < 5; i++) after(i * 0.16, () => boom(at.clone().add(V().set(G.rng.range(-1, 1), G.rng.range(-0.5, 1), G.rng.range(-1, 1)).multiplyScalar(s)), 2.4 + i * 0.4, cols, { rate: 0.6 + i * 0.05 }));
      after(0.85, () => { flash(at, 30 * s / 3, cols[0], 0.8); shock(V().set(at.x, G.fx.floorY(at.x, z.pos.y, at.z) + 0.05, at.z), 14, 0.9, cols[0], 0); G.fx.explosion(at, 1.4); shakeAt(at, 18, 40); });
      G.fx.splat(V().set(z.pos.x, 0, z.pos.z), 3 * s);
      if (kit.onDie) kit.onDie(z, at, ctx);
      z.body.root.visible = false; z.dying = 0; z.bs = null;
      return 'none';
    }
    function remote(p) {
      if (p.t === 'bm') { const z = api.list[p.i]; if (!z || !z.alive || z.T.kind !== 'boss2') return; if (!z.bs) init(z); z.bs.cur = p.m; z.bs.t = 0; z.bs.dur = p.d; z.bs.data = {}; const M = kitOf(z).moves[p.m]; if (M && M.look) M.look(z, z.bs, ctx); return true; }
      if (p.t === 'bo') { orb({ from: v3(p.p), vel: v3(p.v), size: p.s, col: p.c, col2: p.c2 || undefined, core: p.co || undefined, shape: p.sh || undefined, grav: p.gr, homing: p.hm, life: p.l, blast: p.br, trailCol: p.tc || undefined, visual: true, net: false }); return true; }
      if (p.t === 'bt') { warn({ at: v3(p.p), to: p.q ? v3(p.q) : null, r: p.r, w: p.w, dur: p.d, col: p.c, net: 'visual' }); return true; }
      if (p.t === 'bb') { const az = p.a && p.zi >= 0 ? api.list[p.zi] : null; beam({ from: v3(p.p), anchor: az && az.alive ? p.a : undefined, z: az && az.alive ? az : undefined, to: v3(p.q), to2: v3(p.q2), w: p.w, dur: p.d, col: p.c, core: p.co || undefined, visual: true, net: false }); return true; }
      if (p.t === 'bw') { shock(v3(p.p), p.R, p.d, p.c, 0, { wall: !!p.w, net: false }); return true; }
      if (p.t === 'bx') { const K = BZ.BOSS_KITS[p.k]; if (K && K.fx) K.fx(p, ctx); return true; }
      return false;
    }
    function update(dt) { updateOrbs(dt); updateBeams(dt); updateFx(dt); }
    function clear() {
      for (const s of orbs) { scene.remove(s.g); disposeTree(s.g); } orbs.length = 0;
      for (const B of beams) for (const m of [B.outer, B.inner, B.tip, B.base]) { scene.remove(m); m.material.dispose(); } beams.length = 0;
      for (const f of flashes) scene.remove(f.s); flashes.length = 0;
      for (const R of rings) { scene.remove(R.m); if (R.wall) scene.remove(R.wall); } rings.length = 0;
      for (const T of teles) { scene.remove(T.edge); scene.remove(T.fill); } teles.length = 0;
      timers.length = 0;
    }
    const flags = (z) => (z.bs && z.bs.cur ? 2048 : 0);
    return { step, pose, boxes, dress, die, remote, update, clear, flags, ctx, debug: () => ({ orbs: orbs.length, beams: beams.length, warns: teles.length, rings: rings.length, flashes: flashes.length,
      // how far an anchored beam's root sits from its node right now (0 when the beam leaves the mouth)
      beamGap: beams.reduce((m, B) => (B.anchor && B.z && B.z.alive ? Math.max(m, B.from.distanceTo(ctx.at(B.z, B.anchor))) : m), 0) }) };
  };
})();
