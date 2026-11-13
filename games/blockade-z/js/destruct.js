// Breakable town: the walls, floors, roofs and props inside the perimeter take damage from blasts, boss attacks
// and bullets. A piece cracks (two stages), then breaks into chunks and dust, leaving rubble. Whatever rested on it
// and lost most of its support falls as a block, crashes down, and hurts what is underneath; that can bring down
// the next storey. The host decides every break; guests replay them. A new run rebuilds the town.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  BZ.defTex('crack', 32, 32, ({ set, rng }) => {
    const a = new Uint8Array(32 * 32);
    const line = (x, y, ang, len, w) => { for (let i = 0; i < len; i++) { ang += rng.range(-0.5, 0.5); x += Math.cos(ang); y += Math.sin(ang); const xi = Math.round(x); const yi = Math.round(y); if (xi < 0 || yi < 0 || xi > 31 || yi > 31) return; a[yi * 32 + xi] = 255; if (w > 1 && xi < 31) a[yi * 32 + xi + 1] = 200; if (rng.chance(0.12) && len - i > 4) line(x, y, ang + rng.range(-1.4, 1.4), (len - i) * 0.6, 1); } };
    for (let k = 0; k < 5; k++) line(16, 16, (k / 5) * Math.PI * 2 + rng.range(-0.3, 0.3), 18, 2);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) set(x, y, [18, 14, 12], a[y * 32 + x]);
  }, { noMip: true });

  const HP = { stone: 300, metal: 480, wood: 100 };

  BZ.makeDestruct = (G) => {
    const W = G.world; const P = W.pieces; const scene = G.scene;
    const V = () => new THREE.Vector3();
    const host = () => !(G.coop && G.coop.guest);
    for (const p of P) { const vol = (p.max[0] - p.min[0]) * (p.max[1] - p.min[1]) * (p.max[2] - p.min[2]); p.maxHp = p.hp = (HP[p.tag] || 240) * BZ.clamp(Math.sqrt(vol), 0.45, 4.5); p.stage = 0; }
    const broken = []; let dirty = false; let gridT = 0; let syncT = 0;
    const center = (p) => V().set((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
    const distTo = (p, at) => Math.hypot(Math.max(p.min[0] - at.x, 0, at.x - p.max[0]), Math.max(p.min[1] - at.y, 0, at.y - p.max[1]), Math.max(p.min[2] - at.z, 0, at.z - p.max[2]));
    const matsOf = (p) => { const s = new Set(); for (const [mesh] of p.faces) if (mesh) s.add(mesh.material); return [...s]; };

    // ---- cracks: dark branching decals on the two big faces, a second layer when nearly gone ----
    const CRACK_GEO = new THREE.PlaneGeometry(1, 1); const decals = [];
    const crackMat = (op) => new THREE.MeshBasicMaterial({ map: BZ.tex('crack'), transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    function crack(p, stage) {
      if (stage <= p.stage) return; p.stage = stage; p.decals = p.decals || [];
      const d = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]]; const c = center(p);
      const thin = d[0] < d[2] ? 0 : 2; const wide = thin === 0 ? 2 : 0;
      for (const side of [-1, 1]) {
        if (decals.length > 220) { const o = decals.shift(); scene.remove(o); }
        const m = new THREE.Mesh(CRACK_GEO, crackMat(stage === 1 ? 0.6 : 0.95));
        const s = Math.min(d[wide], d[1]) * (stage === 1 ? 0.7 : 0.95);
        m.scale.set(s, s, 1); m.position.copy(c); m.position.setComponent(thin, c.getComponent(thin) + side * (d[thin] / 2 + 0.012));
        m.rotation.y = thin === 0 ? side * Math.PI / 2 : side > 0 ? 0 : Math.PI; m.rotation.z = Math.random() * 6.3; m.renderOrder = 2;
        scene.add(m); p.decals.push(m); decals.push(m);
      }
      G.fx.burst(c, 6 + stage * 4, [0x8a8478, 0x6a645c, 0x4a4640], { speed: 2.5, size: 0.08, life: 0.7 });
      if (host() && G.coop && G.coop.host) G.events.emit('tbrk', { c: p.id, s: stage });
    }

    // ---- breaking: the piece's faces collapse to a point, it leaves collision, chunks and dust fly ----
    function hide(p) {
      p.saved = p.saved || [];
      for (const [mesh, base] of p.faces) {
        if (!mesh) continue; const a = mesh.geometry.attributes.position; const arr = a.array; const o = base * 3;
        p.saved.push([mesh, base, arr.slice(o, o + 12)]);
        for (let k = 1; k < 4; k++) { arr[o + k * 3] = arr[o]; arr[o + k * 3 + 1] = arr[o + 1]; arr[o + k * 3 + 2] = arr[o + 2]; }
        a.needsUpdate = true;
      }
      for (const m of p.decals || []) scene.remove(m); p.decals = [];
      W.removeSolid(p.solid); dirty = true;
    }
    const rubbles = [];
    function rubble(p) {
      if (p.min[1] > 0.6 && !p.landed) return;
      const B = new BZ.Builder('rubble' + p.id); const key = p.tag === 'wood' ? 'plank' : p.tag === 'metal' ? 'metal_dark' : 'rubble';
      const n = BZ.clamp(Math.round((p.max[0] - p.min[0] + p.max[2] - p.min[2]) * 2), 3, 9);
      for (let i = 0; i < n; i++) { const x = BZ.lerp(p.min[0], p.max[0], Math.random()); const z = BZ.lerp(p.min[2], p.max[2], Math.random()); const s = 0.2 + Math.random() * 0.35; B.box([x - s, 0, z - s], [x + s, 0.1 + Math.random() * 0.35, z + s], i % 3 ? key : 'rubble', { vary: 0.15 }); }
      const g = B.build({ cast: false, recv: true }); scene.add(g); rubbles.push(g);
      if (rubbles.length > 70) scene.remove(rubbles.shift());
    }
    function debris(p, dir) {
      const c = center(p); const size = Math.max(p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]);
      const mats = matsOf(p); if (mats.length) G.fx.chunks(c, BZ.clamp(Math.round(size * 6), 6, 22), mats, dir || V(), 1.6);
      for (let i = 0; i < BZ.clamp(Math.round(size * 2), 3, 10); i++) {
        const at = V().set(BZ.lerp(p.min[0], p.max[0], Math.random()), BZ.lerp(p.min[1], p.max[1], Math.random()), BZ.lerp(p.min[2], p.max[2], Math.random()));
        G.fx.puff(at, { delay: Math.random() * 0.15, vel: V().set((Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2), drag: 1.5, s0: 0.8, s1: 2.6, life: 1.6 + Math.random(), c0: 0x9a948a, c1: 0x6a665e, a0: 0.75 });
      }
      G.audio.playAt(p.tag === 'wood' ? 'impact' : 'boom', c, { gain: Math.min(1, 0.4 + size * 0.12), rate: p.tag === 'metal' ? 1.4 : 0.55 });
    }
    function breakPiece(p, dir, net) {
      if (p.broken) return; p.broken = true; broken.push(p.id);
      hide(p); debris(p, dir); rubble(p);
      if (!net && G.coop && G.coop.host) G.events.emit('tbrk', { b: p.id });
      if (host()) settle(p);
    }

    // ---- collapse: a piece that lost most of what held it up drops as one block ----
    const falling = [];
    function settle(p) {
      for (const q of p.dep) {
        if (q.broken || q.fixed) continue;
        const left = q.sup.filter((s) => !s.broken).length;
        if (left === 0 || left < q.sup0 * 0.34) { q.broken = true; later(0.1 + Math.random() * 0.2, () => fall(q)); }
      }
    }
    const timers = []; const later = (t, f) => timers.push({ t, f });
    function fall(q, net) {
      q.broken = true; if (!broken.includes(q.id)) broken.push(q.id);
      const B = new BZ.Builder('fall' + q.id);
      for (const d of q.boxes) { B.m.copy(d.m); B.box(d.min, d.max, d.mats, d.opt); }
      const g = B.build({ cast: G.quality.shadow > 0 }); const c = center(q);
      const pivot = new THREE.Group(); pivot.position.copy(c); g.position.set(-c.x, -c.y, -c.z); pivot.add(g); scene.add(pivot);
      hide(q);
      falling.push({ q, pivot, vy: 0, spin: V().set((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6), h: (q.max[1] - q.min[1]) / 2, t: 0 });
      if (!net && G.coop && G.coop.host) G.events.emit('tbrk', { f: q.id });
      if (host()) settle(q);
    }
    function crush(q, at) {
      const x0 = q.min[0] - 0.4; const x1 = q.max[0] + 0.4; const z0 = q.min[2] - 0.4; const z1 = q.max[2] + 0.4; const top = at.y + 1.5;
      const inside = (pos) => pos.x > x0 && pos.x < x1 && pos.z > z0 && pos.z < z1 && pos.y < top;
      const ppl = [G.player]; if (G.coop && G.coop.host) ppl.push(...G.coop.remotes());
      for (const pl of ppl) if (pl.alive && inside(pl.pos)) { if (pl.remote) G.coop.hurtRemote(pl, 35, at); else G.events.emit('player:hurt', { dmg: 35, from: at }); }
      for (const z of G.zombies.list) if (z.alive && inside(z.pos)) G.zombies.damage(z, 260, 'body', V().set(0, -1, 0), 2, { blast: true, by: 'h', credit: false });
    }
    function updateFalling(dt) {
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i]; f.t += dt; f.vy -= 24 * dt; f.pivot.position.y += f.vy * dt;
        f.pivot.rotation.x += f.spin.x * dt; f.pivot.rotation.z += f.spin.z * dt;
        if (f.pivot.position.y - f.h * 0.6 <= 0.05 || f.t > 2.5) {
          const at = f.pivot.position.clone(); scene.remove(f.pivot);
          f.q.landed = true; debris(f.q, V().set(0, 1, 0)); rubble(f.q);
          G.fx.burst(at, 20, [0x9a948a, 0x6a665e], { speed: 6, size: 0.14, life: 1 });
          const pd = G.player.pos.distanceTo(at); if (pd < 26) G.player.shake.v += (26 - pd) * 0.5;
          if (host()) crush(f.q, at);
          falling.splice(i, 1);
        }
      }
    }

    // ---- damage in ----
    function hurt(p, dmg, dir) {
      if (p.broken || dmg <= 0) return;
      p.hp -= dmg; const k = p.hp / p.maxHp;
      if (p.hp <= 0) breakPiece(p, dir); else if (k < 0.35) crack(p, 2); else if (k < 0.7) crack(p, 1);
    }
    // a blast hurts every piece within its radius; the ones closest take the most
    function blast(at, r, dmg) {
      if (!host() || !(dmg > 0)) return;
      for (const p of P) {
        if (p.broken) continue; const d = distTo(p, at); if (d > r) continue;
        const dir = center(p).sub(at); dir.y = Math.max(0.3, dir.y); dir.normalize();
        hurt(p, dmg * (1 - d / r) * (1 - d / r) * 1.3, dir);
      }
    }
    // a bullet chips the piece it struck; glass-thin and wooden things give way first
    function hit(solid, at, dmg) { if (!host() || !solid || !solid.piece) return; hurt(solid.piece, dmg * 0.3, V()); }

    // ---- network: the host sends breaks, falls and cracks; every few seconds the full list for late joiners ----
    function remote(e) {
      if (e.b != null && P[e.b]) breakPiece(P[e.b], V(), true);
      if (e.f != null && P[e.f] && !P[e.f].broken) fall(P[e.f], true);
      if (e.c != null && P[e.c]) crack(P[e.c], e.s);
      if (e.all) for (const id of e.all) if (P[id] && !P[id].broken) { const p = P[id]; p.broken = true; broken.push(id); hide(p); rubble(p); }
    }

    function reset() {
      for (const p of P) {
        if (p.saved) { for (const [mesh, base, arr] of p.saved) { mesh.geometry.attributes.position.array.set(arr, base * 3); mesh.geometry.attributes.position.needsUpdate = true; } p.saved = null; }
        if (p.broken) W.addSolid(p.solid);
        for (const m of p.decals || []) scene.remove(m);
        p.decals = []; p.broken = false; p.landed = false; p.hp = p.maxHp; p.stage = 0;
      }
      for (const f of falling) scene.remove(f.pivot); falling.length = 0;
      for (const g of rubbles) scene.remove(g); rubbles.length = 0; decals.length = 0; broken.length = 0; timers.length = 0;
      W.rebuildGrids();
    }
    G.events.on('game:new', reset);

    function update(dt) {
      updateFalling(dt);
      for (let i = timers.length - 1; i >= 0; i--) { const q = timers[i]; q.t -= dt; if (q.t <= 0) { timers.splice(i, 1); q.f(); } }
      gridT -= dt; if (dirty && gridT <= 0) { dirty = false; gridT = 0.5; W.rebuildGrids(); }
      syncT -= dt; if (syncT <= 0) { syncT = 3; if (G.coop && G.coop.host && broken.length) G.events.emit('tbrk', { all: broken.slice() }); }
    }
    return { pieces: P, blast, hit, hurt, breakPiece, fall, remote, reset, update, debug: () => ({ broken: broken.length, falling: falling.length, decals: decals.length, rubble: rubbles.length }) };
  };
})();
