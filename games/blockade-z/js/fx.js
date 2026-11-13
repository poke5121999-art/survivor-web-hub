// Pixel debris (one InstancedMesh of cubes), bullet holes, tracers, pickups.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  BZ.makeFx = (G) => {
    const scene = G.scene;
    const MAXP = Math.round(500 * G.quality.particles);
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const pMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const parts = new THREE.InstancedMesh(cubeGeo, pMat, MAXP);
    parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parts.frustumCulled = false;
    parts.count = 0;
    parts.setColorAt(0, new THREE.Color());
    scene.add(parts);
    const P = []; // {p:Vector3, v:Vector3, life, max, size, color, spin}
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const sc = new THREE.Vector3(); const col = new THREE.Color();

    function burst(pos, n, color, o = {}) {
      n = Math.max(1, Math.round(n * G.quality.particles));
      const rng = G.rng;
      for (let i = 0; i < n; i++) {
        if (P.length >= MAXP) P.shift();
        const dir = o.dir;
        const v = new THREE.Vector3(rng.range(-1, 1), rng.range(0.2, 1.2), rng.range(-1, 1)).normalize().multiplyScalar(rng.range(1.5, o.speed || 4.5));
        if (dir) v.addScaledVector(dir, o.push || 2);
        const c = Array.isArray(color) ? rng.pick(color) : color;
        P.push({ p: pos.clone(), v, life: 0, max: rng.range(0.5, o.life || 1.1), size: rng.range(0.05, o.size || 0.12), color: c, spin: rng.range(-8, 8), rot: rng.range(0, 3), bounce: o.bounce ?? 0.3, g: o.grav ?? 16, drag: o.drag || 0, grow: o.drag ? 1 : 0 });
      }
    }

    // Bullet holes
    const MAXD = 80;
    const holeTex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 8; const c = cv.getContext('2d');
      c.fillStyle = 'rgba(20,18,16,0.9)'; c.fillRect(2, 2, 4, 4); c.fillStyle = 'rgba(40,36,30,0.6)'; c.fillRect(1, 3, 6, 2); c.fillRect(3, 1, 2, 6);
      const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
    })();
    const holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAXD);
    holes.count = 0; holes.frustumCulled = false; scene.add(holes);
    let holeI = 0;
    const zAxis = new THREE.Vector3(0, 0, 1);
    function hole(pos, normal) {
      const n = new THREE.Vector3(normal[0], normal[1], normal[2]);
      q.setFromUnitVectors(zAxis, n);
      m4.compose(pos.clone().addScaledVector(n, 0.01), q, sc.set(1, 1, 1));
      holes.setMatrixAt(holeI % MAXD, m4);
      holeI++; holes.count = Math.min(MAXD, holeI); holes.instanceMatrix.needsUpdate = true;
    }

    // Tracers
    const tracers = [];
    const trGeo = new THREE.BoxGeometry(0.03, 0.03, 1); trGeo.translate(0, 0, -0.5);
    const trMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(trGeo, trMat.clone()); m.visible = false; scene.add(m); tracers.push({ m, life: 0 }); }
    let trI = 0;
    function tracer(a, b) {
      const t = tracers[trI++ % tracers.length];
      const len = a.distanceTo(b);
      t.m.position.copy(a); t.m.lookAt(b); t.m.scale.set(1, 1, len); t.m.visible = true; t.life = 0.06; t.m.material.opacity = 0.85;
    }

    // Muzzle light (one, reused)
    const flash = new THREE.PointLight(0xffc060, 0, 9, 2);
    scene.add(flash);
    let flashT = 0;
    function muzzle(pos) { flash.position.copy(pos); flash.intensity = 6; flashT = 0.05; }

    // Pickups
    const pickups = [];
    function drop(kind, pos) {
      const B = new BZ.Builder('pickup');
      const key = kind === 'health' ? 'medkit' : 'ammo_box';
      B.box([-0.22, 0, -0.22], [0.22, 0.32, 0.22], key, { uv: 'fit', vary: 0 });
      const g = B.build({ cast: false });
      g.position.set(pos.x, 0.25, pos.z);
      scene.add(g);
      pickups.push({ kind, g, t: 0, life: 25 });
    }

    const ASH = Math.round(160 * G.quality.particles);
    const ash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xb8c4dc }), ASH);
    ash.frustumCulled = false; scene.add(ash);
    const ashP = []; const ar = BZ.rng('ash');
    for (let i = 0; i < ASH; i++) ashP.push(new THREE.Vector3(ar.range(-14, 14), ar.range(0, 12), ar.range(-14, 14)));
    function updateAsh(dt) {
      const c = G.camera.position;
      for (let i = 0; i < ASH; i++) {
        const p = ashP[i]; p.y -= dt * 1.1; p.x += dt * 0.35 * Math.sin(p.y * 0.7 + i);
        if (p.y < 0) p.y += 12;
        const x = ((p.x - c.x) % 28 + 42) % 28 - 14 + c.x; const z = ((p.z - c.z) % 28 + 42) % 28 - 14 + c.z;
        m4.makeTranslation(x, p.y, z); ash.setMatrixAt(i, m4);
      }
      ash.instanceMatrix.needsUpdate = true;
    }

    function update(dt) {
      updateAsh(dt); updateGibs(dt); updateSpurts(dt);
      let n = 0;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life += dt;
        if (p.life > p.max) { P.splice(i, 1); continue; }
        p.v.y -= p.g * dt; if (p.drag) p.v.multiplyScalar(1 - p.drag * dt);
        p.p.addScaledVector(p.v, dt);
        if (p.p.y < p.size / 2) { p.p.y = p.size / 2; p.v.y *= -p.bounce; p.v.x *= 0.6; p.v.z *= 0.6; p.spin *= 0.5; }
        p.rot += p.spin * dt;
        const s = p.size * (1 + p.grow * p.life * 0.8) * (p.life > p.max - 0.3 ? (p.max - p.life) / 0.3 : 1);
        m4.compose(p.p, q.setFromEuler(e.set(p.rot, p.rot * 0.7, 0)), sc.set(s, s, s));
        parts.setMatrixAt(n, m4);
        parts.setColorAt(n, col.setHex(p.color));
        n++;
      }
      parts.count = n;
      parts.instanceMatrix.needsUpdate = true;
      if (parts.instanceColor) parts.instanceColor.needsUpdate = true;

      for (const t of tracers) if (t.life > 0) { t.life -= dt; t.m.material.opacity = Math.max(0, t.life / 0.06) * 0.85; if (t.life <= 0) t.m.visible = false; }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.intensity = 0; }
      boomLight.intensity = Math.max(0, boomLight.intensity - dt * 220);
      for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t += dt; const k = b.t / 0.45; b.s.scale.setScalar(1.5 + k * 5); b.s.material.opacity = Math.max(0, 0.85 - k); if (k >= 1) { scene.remove(b.s); booms.splice(i, 1); } }

      const pl = G.player;
      for (let i = pickups.length - 1; i >= 0; i--) {
        const k = pickups[i];
        k.t += dt; k.life -= dt;
        k.g.rotation.y += dt * 2; k.g.position.y = 0.25 + Math.sin(k.t * 3) * 0.08;
        k.g.visible = k.life > 4 || Math.sin(k.t * 20) > 0;
        const d = pl ? Math.hypot(pl.pos.x - k.g.position.x, pl.pos.z - k.g.position.z) : 99;
        if (d < 1.3 && pl.pos.y < 1.5 && G.events) { G.events.emit('pickup', k.kind); k.life = 0; }
        if (k.life <= 0) { scene.remove(k.g); pickups.splice(i, 1); }
      }
    }
    const boomGlow = new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const booms = [];
    const boomLight = new THREE.PointLight(0xff9040, 0, 22, 1.4); scene.add(boomLight);
    function explosion(pos) {
      burst(pos, 34, [0xfff0a0, 0xffc040, 0xff7a20, 0xe04a18], { speed: 9, size: 0.15, life: 0.9, bounce: 0.2 });
      burst(pos, 18, [0x3a3a3c, 0x55555a, 0x2a2420], { speed: 5, size: 0.2, life: 1.6, bounce: 0.1 });
      const s = new THREE.Sprite(boomGlow.clone()); s.position.copy(pos); scene.add(s); booms.push({ s, t: 0 });
      boomLight.position.copy(pos); boomLight.intensity = 60; flashT = Math.max(flashT, 0.25);
    }
    // ---- gore: severed parts fly, bounce, settle flat and stay; blood pools; stumps keep spurting ----
    const MAXG = Math.round(44 * Math.max(0.6, G.quality.particles));
    const gibs = []; let made = 0;
    const gOut = {}; const feet = new THREE.Vector3(); const rm = new THREE.Matrix4(); const box3 = new THREE.Box3(); const ctr = new THREE.Vector3(); const sz = new THREE.Vector3();
    const deadEye = (mat) => { const m = mat.clone(); if (m.emissive) m.emissive.setHex(m.emissiveMap ? 0x401010 : 0); return m; };
    // src: a body-part mesh in the scene. Its world transform, geometry and (frozen) material become a free piece.
    function gib(src, vel, o = {}) {
      if (gibs.length >= MAXG) { const old = gibs.shift(); scene.remove(old.g); if (old.own) for (const m of [].concat(old.mesh.material)) m.dispose(); }
      src.updateWorldMatrix(true, false);
      const geo = src.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getCenter(ctr); geo.boundingBox.getSize(sz);
      const own = !o.shared;
      const mat = o.shared ? src.material : Array.isArray(src.material) ? src.material.map(deadEye) : deadEye(src.material);
      if (o.ice && !o.shared) for (const m of [].concat(mat)) { m.color.setHex(0xa8dcff); if (m.emissive) m.emissive.setHex(0x1a4a70); }
      const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(ctr).negate(); mesh.castShadow = false;
      const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.add(mesh);
      src.matrixWorld.decompose(g.position, g.quaternion, g.scale);
      g.position.add(ctr.clone().multiply(g.scale).applyQuaternion(g.quaternion));
      if (o.burn) { const cap = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff7a20 })); cap.position.copy(mesh.position); cap.scale.set(1.04, 0.04, 1.04); g.add(cap); }
      scene.add(g);
      const half = sz.clone().multiply(g.scale).multiplyScalar(0.5);
      made++;
      gibs.push({ g, mesh, own, v: vel.clone(), w: new THREE.Vector3(G.rng.range(-12, 12), G.rng.range(-8, 8), G.rng.range(-12, 12)), half, r: Math.min(0.25, Math.max(half.x, half.z)), rest: false, settle: 0, trail: 0, burn: !!o.burn, bleed: o.burn || o.ice ? 0 : 1.2, hits: 0, ice: !!o.ice });
    }
    // loose cubes for an exploded head: share a few materials, no per-piece clone
    const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
    function chunks(at, n, mats, dir, s = 1) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(chunkGeo, G.rng.pick(mats)); const k = G.rng.range(0.09, 0.17) * s;
        m.scale.set(k, k * G.rng.range(0.7, 1.2), k); m.position.copy(at).add(new THREE.Vector3(G.rng.range(-0.15, 0.15), G.rng.range(-0.1, 0.15), G.rng.range(-0.15, 0.15)).multiplyScalar(s));
        m.updateMatrixWorld();
        const v = new THREE.Vector3(G.rng.range(-1, 1), G.rng.range(0.6, 1.6), G.rng.range(-1, 1)).normalize().multiplyScalar(G.rng.range(3, 7)).addScaledVector(dir, G.rng.range(2, 5));
        gib(m, v, { shared: true });
      }
    }
    function updateGibs(dt) {
      for (const p of gibs) {
        if (p.rest) {
          if (p.settle < 1) { p.settle = Math.min(1, p.settle + dt * 7); p.g.quaternion.slerp(p.qRest, p.settle); p.g.position.y = BZ.lerp(p.g.position.y, p.yRest, p.settle); }
          if (p.bleed > 0) { p.bleed -= dt; if (G.rng.chance(dt * 6)) burst(p.g.position, 1, [0xa01810, 0x7a1410], { speed: 0.6, size: 0.05, life: 0.4 }); }
          continue;
        }
        p.v.y -= 20 * dt;
        feet.copy(p.g.position); feet.y -= p.half.y;
        G.world.moveBox(feet, p.v, dt, p.r, p.half.y * 2, gOut);
        p.g.position.set(feet.x, feet.y + p.half.y, feet.z);
        p.g.rotation.x += p.w.x * dt; p.g.rotation.y += p.w.y * dt; p.g.rotation.z += p.w.z * dt;
        p.trail -= dt;
        if (p.trail <= 0 && p.bleed > 0) { p.trail = 0.035; burst(p.g.position, 1, p.burn ? [0xff9a30, 0x3a3a3c] : [0xb3201a, 0x7a1410], { speed: 0.5, size: 0.06, life: 0.5 }); }
        if (gOut.ground) {
          const impact = -p.v.y; p.hits++;
          if (p.hits === 1 && !p.burn && !p.ice) { splat(feet, 0.5 + p.half.y * 2); if (impact > 3) G.audio.playAt('gore', feet, { gain: 0.35, rate: G.rng.range(1.1, 1.5) }); }
          p.v.y = impact > 2.5 ? impact * 0.28 : 0; p.v.x *= 0.55; p.v.z *= 0.55; p.w.multiplyScalar(0.5);
          if (impact <= 2.5 && Math.hypot(p.v.x, p.v.z) < 0.6) {
            // lie flat: keep the yaw, snap pitch and roll to the nearest quarter turn, rest on the face that is now down
            p.rest = true; p.settle = 0;
            e.setFromQuaternion(p.g.quaternion, 'YXZ');
            const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
            p.qRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(snap(e.x), e.y, snap(e.z), 'YXZ'));
            rm.makeRotationFromQuaternion(p.qRest); const el = rm.elements; const h = p.half;
            p.yRest = feet.y + Math.abs(el[1]) * h.x + Math.abs(el[5]) * h.y + Math.abs(el[9]) * h.z + 0.005;
          }
        }
      }
    }
    // blood pools: flat alpha splats on whatever floor the point is on
    const MAXS = 90;
    const splats = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: BZ.tex('blood'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), MAXS);
    splats.count = 0; splats.frustumCulled = false; splats.renderOrder = 1; scene.add(splats);
    let splatI = 0;
    function splat(pos, size = 1) {
      m4.compose(new THREE.Vector3(pos.x, pos.y + 0.02 + (splatI % 7) * 0.002, pos.z), q.setFromEuler(e.set(0, G.rng.range(0, 6.3), 0)), sc.set(size, 1, size * G.rng.range(0.7, 1.2)));
      splats.setMatrixAt(splatI % MAXS, m4); splatI++; splats.count = Math.min(MAXS, splatI); splats.instanceMatrix.needsUpdate = true;
    }
    // stumps: the hidden part's joint keeps throwing blood (or saber embers) upward for a while
    const spurts = [];
    const jp = new THREE.Vector3();
    function spurt(obj, kind, dur, alive) { spurts.push({ obj, kind, t: dur, max: dur, alive, acc: 0 }); }
    function updateSpurts(dt) {
      for (let i = spurts.length - 1; i >= 0; i--) {
        const s = spurts[i]; s.t -= dt;
        if (s.t <= 0 || !s.alive()) { spurts.splice(i, 1); continue; }
        s.acc += dt * (s.kind === 'burn' ? 14 : 40) * (s.t / s.max);
        s.obj.getWorldPosition(jp);
        while (s.acc >= 1) {
          s.acc -= 1;
          if (s.kind === 'burn') burst(jp, 1, [0xffb040, 0xff6a20, 0x4a4a4c], { speed: 1, size: 0.06, life: 0.5, grav: -2, drag: 1.5, bounce: 0 });
          else burst(jp, 1, [0xc0281e, 0x8a1410, 0xb3201a], { dir: new THREE.Vector3(0, 1, 0), push: 2.5, speed: 1.6, size: 0.06, life: 0.7 });
        }
      }
    }

    function jet(pos) { burst(pos, 2, [0xfff0a0, 0xffb040, 0xff6a20], { dir: new THREE.Vector3(0, -1, 0), push: 5, speed: 1.2, size: 0.09, life: 0.35, bounce: 0 }); }
    function clear() {
      P.length = 0; for (const k of pickups) scene.remove(k.g); pickups.length = 0; holes.count = 0; holeI = 0;
      for (const p of gibs) { scene.remove(p.g); if (p.own) for (const m of [].concat(p.mesh.material)) m.dispose(); } gibs.length = 0; spurts.length = 0; splats.count = 0; splatI = 0;
    }

    return { burst, hole, tracer, muzzle, drop, update, clear, explosion, jet, gib, chunks, splat, spurt, debug: () => ({ particles: P.length, pickups: pickups.length, made, gibs: gibs.length, resting: gibs.filter((g) => g.rest).length, splats: splats.count }) };
  };
})();
