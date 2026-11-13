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
        P.push({ p: pos.clone(), v, life: 0, max: rng.range(0.5, o.life || 1.1), size: rng.range(0.05, o.size || 0.12), color: c, spin: rng.range(-8, 8), rot: rng.range(0, 3), bounce: o.bounce ?? 0.3 });
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
      updateAsh(dt);
      let n = 0;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life += dt;
        if (p.life > p.max) { P.splice(i, 1); continue; }
        p.v.y -= 16 * dt;
        p.p.addScaledVector(p.v, dt);
        if (p.p.y < p.size / 2) { p.p.y = p.size / 2; p.v.y *= -p.bounce; p.v.x *= 0.6; p.v.z *= 0.6; p.spin *= 0.5; }
        p.rot += p.spin * dt;
        const s = p.size * (p.life > p.max - 0.2 ? (p.max - p.life) / 0.2 : 1);
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
    function jet(pos) { burst(pos, 2, [0xfff0a0, 0xffb040, 0xff6a20], { dir: new THREE.Vector3(0, -1, 0), push: 5, speed: 1.2, size: 0.09, life: 0.35, bounce: 0 }); }
    function clear() { P.length = 0; for (const k of pickups) scene.remove(k.g); pickups.length = 0; holes.count = 0; holeI = 0; }

    return { burst, hole, tracer, muzzle, drop, update, clear, explosion, jet, debug: () => ({ particles: P.length, pickups: pickups.length }) };
  };
})();
