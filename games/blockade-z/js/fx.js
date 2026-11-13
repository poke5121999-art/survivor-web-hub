// Pixel debris (one InstancedMesh of cubes), bullet holes, tracers.
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

    // the floor (street, a storey, a roof) right under a point: decals and settled pieces belong there, never in mid-air
    const downV = new THREE.Vector3(0, -1, 0); const fo = new THREE.Vector3();
    function floorY(x, y, z) { if (y <= 0.05) return 0; const h = G.world.raycast(fo.set(x, y + 0.25, z), downV, y + 1); return h ? Math.max(0, y + 0.25 - h.t) : 0; }

    // is there still something under a thing lying at height y (the same box test the physics lands it with)?
    const sMin = [0, 0, 0]; const sMax = [0, 0, 0];
    function held(x, y, z, r) { if (y <= 0.06) return true; sMin[0] = x - r; sMin[1] = y - 0.2; sMin[2] = z - r; sMax[0] = x + r; sMax[1] = y - 0.02; sMax[2] = z + r; return !!G.world.overlaps(sMin, sMax); }

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
    // each tracer is a hot core inside a soft additive glow, so it reads against a bright sky too
    const trGlowGeo = new THREE.BoxGeometry(0.13, 0.13, 1); trGlowGeo.translate(0, 0, -0.5);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(trGeo, trMat.clone()); m.visible = false; scene.add(m);
      const g = new THREE.Mesh(trGlowGeo, new THREE.MeshBasicMaterial({ color: 0xff9a30, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); m.add(g);
      tracers.push({ m, g, life: 0 });
    }
    let trI = 0;
    function tracer(a, b, color) {
      const t = tracers[trI++ % tracers.length];
      const len = a.distanceTo(b);
      t.m.position.copy(a); t.m.lookAt(b); t.m.scale.set(1, 1, len); t.m.visible = true; t.life = 0.07; t.m.material.opacity = 0.95;
      t.m.material.color.setHex(0xfff0b0); t.g.material.color.setHex(color || 0xff9a30);
    }

    // Muzzle light (one, reused)
    const flash = new THREE.PointLight(0xffc060, 0, 9, 2);
    scene.add(flash);
    let flashT = 0;
    function muzzle(pos) { flash.position.copy(pos); flash.intensity = 6; flashT = 0.05; }

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
      updateAsh(dt); updateGibs(dt); updateSplats(dt); updateSpurts(dt); updateBlast(dt); updateArcs(dt);
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

      for (const t of tracers) if (t.life > 0) { t.life -= dt; const k = Math.max(0, t.life / 0.07); t.m.material.opacity = k * 0.95; t.g.material.opacity = k * 0.45; if (t.life <= 0) t.m.visible = false; }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.intensity = 0; }
      boomLight.intensity = Math.max(0, boomLight.intensity * Math.pow(0.002, dt) - dt * 20);
      for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t += dt; const k = b.t / 0.45; b.s.scale.setScalar(1.5 + k * 5); b.s.material.opacity = Math.max(0, 0.85 - k); if (k >= 1) { scene.remove(b.s); booms.splice(i, 1); } }
    }
    const boomGlow = new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const booms = [];
    const boomLight = new THREE.PointLight(0xff9040, 0, 22, 1.4); scene.add(boomLight);
    // ---- billboards: two instanced quads (glow = additive, smoke = alpha blend), colour and alpha per instance ----
    const VS = `attribute vec3 aColor; attribute float aAlpha; varying vec3 vC; varying float vA; varying vec2 vUv;
      void main() { vUv = uv; vC = aColor; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
    const FS_ADD = `uniform sampler2D map; varying vec3 vC; varying float vA; varying vec2 vUv;
      void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vC * t.a * vA, 1.0); }`;
    const FS_ALPHA = `uniform sampler2D map; varying vec3 vC; varying float vA; varying vec2 vUv;
      void main() { vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.02) discard; gl_FragColor = vec4(vC, a); }`;
    function board(additive, n, order) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); const al = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      col.setUsage(THREE.DynamicDrawUsage); al.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aColor', col); geo.setAttribute('aAlpha', al);
      const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: BZ.tex('puff') } }, vertexShader: VS, fragmentShader: additive ? FS_ADD : FS_ALPHA, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = order; scene.add(mesh);
      return { mesh, col, al, list: [], n };
    }
    const NB = Math.round(220 * Math.max(0.5, G.quality.particles));
    const glowB = board(true, NB, 4); const smokeB = board(false, NB, 3);
    const c0 = new THREE.Color(); const c1 = new THREE.Color(); const bq = new THREE.Quaternion(); const zq = new THREE.Quaternion(); const zAx = new THREE.Vector3(0, 0, 1);
    // o: { glow, vel, s0, s1, life, c0, c1, a0, delay, drag, g, spin }
    function puff(pos, o) {
      const B = o.glow ? glowB : smokeB;
      if (B.list.length >= B.n) B.list.shift();
      B.list.push({ p: pos.clone(), v: o.vel ? o.vel.clone() : new THREE.Vector3(), t: -(o.delay || 0), life: o.life || 1, s0: o.s0 || 0.5, s1: o.s1 ?? o.s0 ?? 0.5,
        c0: o.c0 ?? 0xffffff, c1: o.c1 ?? o.c0 ?? 0xffffff, a0: o.a0 ?? 1, drag: o.drag || 0, g: o.g || 0, rot: o.rot ?? G.rng.range(0, 6.3), spin: o.spin ?? G.rng.range(-1.5, 1.5), glow: !!o.glow, st: o.stretch || 1 });
    }
    function updateBoard(B, dt) {
      const camQ = G.camera.quaternion; const camP = G.camera.position; let n = 0;
      for (let i = B.list.length - 1; i >= 0; i--) {
        const b = B.list[i]; b.t += dt;
        if (b.t >= b.life) { B.list.splice(i, 1); continue; }
        if (b.t < 0) continue;
        if (b.drag) b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
        b.v.y -= b.g * dt; b.p.addScaledVector(b.v, dt); b.rot += b.spin * dt;
        const k = b.t / b.life; const ek = 1 - (1 - k) * (1 - k);
        const s = b.s0 + (b.s1 - b.s0) * ek;
        // a puff right in front of the lens thins out, so a blast at arm's length does not paint the whole screen one colour
        const near = Math.min(1, Math.max(0.12, (b.p.distanceTo(camP) - s * 0.25) / 2.2));
        const a = (b.glow ? b.a0 * Math.pow(1 - k, 1.4) : b.a0 * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88)) * near;
        bq.copy(camQ).multiply(zq.setFromAxisAngle(zAx, b.rot));
        m4.compose(b.p, bq, sc.set(s * b.st, s / Math.sqrt(b.st), s)); B.mesh.setMatrixAt(n, m4);
        c0.setHex(b.c0); c1.setHex(b.c1); c0.lerp(c1, Math.min(1, k * 1.4));
        B.col.setXYZ(n, c0.r, c0.g, c0.b); B.al.setX(n, a); n++;
      }
      B.mesh.count = n; B.mesh.instanceMatrix.needsUpdate = true; B.col.needsUpdate = true; B.al.needsUpdate = true;
    }
    // scorch marks under explosions
    const MAXSC = 30;
    const scorches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: BZ.tex('scorch'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAXSC);
    scorches.count = 0; scorches.frustumCulled = false; scene.add(scorches); let scI = 0; const scorchAt = [];
    // ground shock rings
    const rings = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; scene.add(m); rings.push({ m, t: 9, R: 1 }); }
    let ringI = 0;
    // a white flash over the screen when the blast is close
    const flashEl = document.createElement('div'); flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;background:#fff3d0;opacity:0';
    document.body.appendChild(flashEl); let flashScr = 0;
    const V = () => new THREE.Vector3();
    const rnd = () => V().set(G.rng.range(-1, 1), G.rng.range(-1, 1), G.rng.range(-1, 1)).normalize();
    // Big blast: flash, a churning fire ball, shock ring, embers, flying rubble, smoke that hangs, a scorch mark.
    function explosion(pos, s = 1) {
      const R = s;
      puff(pos, { glow: true, s0: 2.5 * R, s1: 8 * R, life: 0.16, c0: 0xffffff, c1: 0xffd080, a0: 1.2, spin: 0 });
      const core = pos.clone().setY(pos.y + 0.6 * R);
      for (let i = 0; i < 20; i++) {
        const d = rnd(); d.y = Math.abs(d.y) * 0.8 + 0.25;
        puff(core.clone().addScaledVector(d, G.rng.range(0, 1.0) * R), { glow: true, vel: d.clone().multiplyScalar(G.rng.range(2, 5) * R).setY(d.y * 3.5 * R + 2), drag: 3,
          s0: G.rng.range(1.4, 2.1) * R, s1: G.rng.range(3.4, 4.8) * R, life: G.rng.range(0.55, 0.95), c0: G.rng.pick([0xfff6d0, 0xffe48a, 0xffc860]), c1: G.rng.pick([0xff5a14, 0xe03a0c]), a0: 1.1 });
      }
      // the fire ball keeps glowing through the first smoke: a slow dark-orange core that lingers
      for (let i = 0; i < 5; i++) puff(core.clone().add(rnd().multiplyScalar(0.6 * R)), { glow: true, delay: 0.1, vel: V().set(0, 1.4, 0), s0: 2.4 * R, s1: 3.2 * R, life: 1.1, c0: 0xff7a20, c1: 0x601004, a0: 0.7 });
      for (let i = 0; i < 10; i++) {
        const d = rnd(); d.y = Math.abs(d.y) * 0.5;
        puff(pos.clone().addScaledVector(d, 0.7 * R).setY(pos.y + G.rng.range(0.6, 1.8) * R), { delay: G.rng.range(0.08, 0.35), vel: d.multiplyScalar(1.6 * R).setY(G.rng.range(1.2, 2.6)), drag: 1.2,
          s0: G.rng.range(1.4, 2) * R, s1: G.rng.range(5, 7) * R, life: G.rng.range(2.8, 4.5), c0: 0x5a3a26, c1: 0x6e6a66, a0: 0.85 });
      }
      for (let i = 0; i < 22; i++) {
        const d = rnd(); d.y = Math.abs(d.y) + 0.3;
        puff(pos, { glow: true, vel: d.normalize().multiplyScalar(G.rng.range(5, 13) * R), g: 9, drag: 0.6, s0: 0.22, s1: 0.06, life: G.rng.range(0.7, 1.6), c0: 0xffe070, c1: 0xff3a10, a0: 1.1, spin: 0 });
      }
      burst(pos, 18, [0x3a3a3c, 0x55555a, 0x2a2420, 0x6a645c], { speed: 7 * R, size: 0.2, life: 1.8, bounce: 0.25 });
      // the ring, the dust and the scorch mark go on the floor under the blast; a blast high in the air leaves none
      const fy = floorY(pos.x, pos.y, pos.z);
      if (pos.y - fy < 2.6 * Math.max(1, R)) {
        const ground = new THREE.Vector3(pos.x, fy, pos.z);
        const r = rings[ringI++ % rings.length]; r.m.position.copy(ground).setY(ground.y + 0.06); r.t = 0; r.R = 6.5 * R; r.m.visible = true;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + G.rng.range(0, 0.6); puff(ground.clone().setY(ground.y + 0.3), { vel: V().set(Math.cos(a) * 7, 0.3, Math.sin(a) * 7), drag: 2.5, s0: 0.8, s1: 2.6, life: 1.2, c0: 0x6a5e50, c1: 0x7a7066, a0: 0.55 }); }
        m4.compose(V().set(ground.x, ground.y + 0.025 + (scI % 5) * 0.003, ground.z), q.setFromEuler(e.set(0, G.rng.range(0, 6.3), 0)), sc.set(4.2 * R, 1, 4.2 * R));
        scorchAt[scI % MAXSC] = [ground.x, ground.y, ground.z];
        scorches.setMatrixAt(scI % MAXSC, m4); scI++; scorches.count = Math.min(MAXSC, scI); scorches.instanceMatrix.needsUpdate = true;
      }
      boomLight.position.copy(pos).setY(pos.y + 1); boomLight.intensity = 90 * R; flashT = Math.max(flashT, 0.25);
      const pd = G.camera.position.distanceTo(pos); if (pd < 16) flashScr = Math.max(flashScr, 0.55 * (1 - pd / 16));
    }
    // a bullet striking a surface: tiny flash, a few sparks off hard stuff, a puff of dust
    function impact(at, normal, tag) {
      const n = V().set(normal[0], normal[1], normal[2]);
      puff(at.clone().addScaledVector(n, 0.05), { glow: true, s0: 0.45, s1: 0.2, life: 0.07, c0: 0xfff0c0, c1: 0xffa040, a0: 1 });
      if (tag === 'metal' || tag === 'stone' || !tag) for (let i = 0; i < 3; i++) puff(at, { glow: true, vel: n.clone().multiplyScalar(4).add(rnd().multiplyScalar(3)), g: 12, s0: 0.08, s1: 0.03, life: 0.3, c0: 0xffe090, c1: 0xff6020, spin: 0 });
      const dust = { grass: 0x6a7a4a, wood: 0x8a6a48, leaves: 0x4a6a3a }[tag] || 0x8a8680;
      puff(at.clone().addScaledVector(n, 0.12), { vel: n.clone().multiplyScalar(0.9), drag: 2, s0: 0.2, s1: 0.95, life: 0.6, c0: dust, c1: dust, a0: 0.55 });
    }
    function bloodMist(at, k) { puff(at, { vel: V().set(0, 0.3, 0), drag: 2, s0: 0.25, s1: 0.7 + k * 0.9, life: 0.4 + k * 0.3, c0: 0x9a1410, c1: 0x5a0a08, a0: 0.75 }); }
    const haloMats = new Map();
    const haloMat = (col, op) => { const k = col + ':' + op; if (!haloMats.has(k)) haloMats.set(k, new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); return haloMats.get(k); };
    // obj: the projectile mesh (its scale counts); size: halo size in metres
    function halo(obj, col, size) {
      const k = 1 / (obj.scale.x || 1);
      const a = new THREE.Sprite(haloMat(col, 0.95)); a.scale.setScalar(size * k); a.renderOrder = 6; obj.add(a);
      const b = new THREE.Sprite(haloMat(col, 0.35)); b.scale.setScalar(size * 2.2 * k); obj.add(b);
      return a;
    }
    // call every frame; acc is a running counter kept on the projectile
    function streak(s, pos, vel, col, col2, size, dt, rate = 45) {
      s.acc = (s.acc || 0) + dt * rate;
      while (s.acc > 1) {
        s.acc -= 1;
        puff(pos.clone().add(V().set(G.rng.range(-1, 1), G.rng.range(-1, 1), G.rng.range(-1, 1)).multiplyScalar(size * 0.3)), { glow: true, vel: vel.clone().multiplyScalar(-0.06), drag: 3, s0: size * 1.6, s1: 0.03, life: 0.45, c0: col, c1: col2, a0: 0.95, spin: 0 });
      }
    }
    // landing: a white core flash inside a coloured one, glow sparks and bits
    function pop(at, r, cols) {
      puff(at, { glow: true, s0: r * 0.6, s1: r * 3.2, life: 0.22, c0: 0xffffff, c1: cols[0], a0: 1.2, spin: 0 });
      puff(at, { glow: true, s0: r * 1.2, s1: r * 4.5, life: 0.4, c0: cols[0], c1: cols[1] || cols[0], a0: 0.8, spin: 0 });
      for (let i = 0; i < 8 + r * 4; i++) { const d = rnd(); d.y = Math.abs(d.y) + 0.2; puff(at, { glow: true, vel: d.normalize().multiplyScalar(G.rng.range(3, 7) * Math.max(0.6, r)), drag: 2.5, g: 4, s0: 0.22 * Math.max(0.6, r), s1: 0.03, life: G.rng.range(0.35, 0.65), c0: cols[0], c1: cols[1] || cols[0], a0: 1.1 }); }
      burst(at, 6 + r * 6, cols, { speed: 4 + r * 2, size: 0.08, life: 0.7 });
    }
    // a blade landing: a thin bright cut across the body at `ang` (on screen), a wider coloured one behind it, sparks thrown along the cut
    function slash(at, col, ang, size = 1) {
      puff(at, { glow: true, s0: 0.5 * size, s1: 0.95 * size, life: 0.13, c0: 0xffffff, c1: col, a0: 1.3, rot: ang, spin: 0, stretch: 7 });
      puff(at, { glow: true, s0: 0.7 * size, s1: 1.3 * size, life: 0.22, c0: col, c1: col, a0: 0.6, rot: ang, spin: 0, stretch: 4 });
      puff(at, { glow: true, s0: 0.5 * size, s1: 0.15, life: 0.1, c0: 0xffffff, c1: col, a0: 1 });
      const cq = G.camera.quaternion; const dir = V().set(Math.cos(ang), Math.sin(ang), 0).applyQuaternion(cq);
      for (let i = 0; i < 7; i++) puff(at, { glow: true, vel: dir.clone().multiplyScalar(G.rng.range(3, 9) * (i % 2 ? 1 : -1)).add(rnd().multiplyScalar(1.5)), g: 10, drag: 1.5, s0: 0.1 * size, s1: 0.02, life: G.rng.range(0.18, 0.38), c0: 0xffffff, c1: col, a0: 1.1, spin: 0 });
    }
    // a ribbon that follows a blade through the world (third person and other players): feed it the tip and the base each frame while it swings
    function ribbon(n = 22, life = 0.2) {
      const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 9); const col = new Float32Array(n * 9); const idx = [];
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      for (let i = 0; i < n - 1; i++) { const a = i * 3; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); } geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5; scene.add(mesh);
      const pts = []; const c = new THREE.Color();
      return { mesh, pts,
        push(tip, base) { pts.push({ a: tip.clone(), b: base.clone(), age: 0 }); if (pts.length > n) pts.shift(); },
        // three rows: a white-hot edge at the tip, the weapon's colour through the middle, nothing at the base; old points fade and narrow
        update(dt, hex, gain = 1) {
          for (const p of pts) p.age += dt; while (pts.length && pts[0].age > life) pts.shift();
          const m = pts.length; mesh.visible = m > 1; if (!mesh.visible) return;
          c.setHex(hex);
          for (let i = 0; i < n; i++) {
            const p = pts[Math.max(0, Math.min(m - 1, i - (n - m)))]; const live = i >= n - m; const k = live ? Math.pow(Math.max(0, 1 - p.age / life), 1.4) * gain : 0; const o = i * 9;
            const mx = p.a.x + (p.b.x - p.a.x) * (0.3 + 0.25 * (1 - k)); const my = p.a.y + (p.b.y - p.a.y) * (0.3 + 0.25 * (1 - k)); const mz = p.a.z + (p.b.z - p.a.z) * (0.3 + 0.25 * (1 - k));
            pos[o] = p.a.x; pos[o + 1] = p.a.y; pos[o + 2] = p.a.z; pos[o + 3] = mx; pos[o + 4] = my; pos[o + 5] = mz; pos[o + 6] = p.b.x; pos[o + 7] = p.b.y; pos[o + 8] = p.b.z;
            col[o] = (0.6 + c.r * 0.4) * k; col[o + 1] = (0.6 + c.g * 0.4) * k; col[o + 2] = (0.6 + c.b * 0.4) * k;
            col[o + 3] = c.r * k * 0.55; col[o + 4] = c.g * k * 0.55; col[o + 5] = c.b * k * 0.55; col[o + 6] = col[o + 7] = col[o + 8] = 0;
          }
          geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
        },
        clear() { pts.length = 0; mesh.visible = false; } };
    }
    function trail(at) {
      puff(at, { vel: V().set(G.rng.range(-0.2, 0.2), 0.5, G.rng.range(-0.2, 0.2)), drag: 1, s0: 0.3, s1: 1.5, life: G.rng.range(1, 1.6), c0: 0x9a9894, c1: 0x6a6866, a0: 0.5 });
      puff(at, { glow: true, s0: 0.75, s1: 0.15, life: 0.14, c0: 0xfff0b0, c1: 0xff5010, a0: 1.2, spin: 0 });
    }
    function updateBlast(dt) {
      updateBoard(smokeB, dt); updateBoard(glowB, dt);
      for (const r of rings) {
        if (r.t > 0.45) { r.m.visible = false; continue; }
        r.t += dt; const k = Math.min(1, r.t / 0.45); const ek = 1 - Math.pow(1 - k, 3);
        r.m.scale.setScalar(0.4 + r.R * ek); r.m.material.opacity = 0.9 * (1 - k);
      }
      if (flashScr > 0) { flashScr = Math.max(0, flashScr - dt * 2.2); flashEl.style.opacity = flashScr.toFixed(3); }
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
      // what hangs off the piece goes with it (a shin on a thigh, a forearm on an upper arm), in the pose it had
      for (const ch of src.children) { if (!ch.isMesh || !ch.visible || ch.userData.noGib) continue; const cm = new THREE.Mesh(ch.geometry, ch.material === src.material ? mat : ch.material); cm.position.copy(ch.position).sub(ctr); cm.quaternion.copy(ch.quaternion); cm.scale.copy(ch.scale); cm.castShadow = false; g.add(cm); }
      if (o.burn) { const cap = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff7a20 })); cap.position.copy(mesh.position); cap.scale.set(1.04, 0.04, 1.04); g.add(cap); }
      scene.add(g);
      const half = sz.clone().multiply(g.scale).multiplyScalar(0.5);
      made++;
      gibs.push({ g, mesh, own, v: vel.clone(), w: new THREE.Vector3(G.rng.range(-12, 12), G.rng.range(-8, 8), G.rng.range(-12, 12)), half, r: Math.min(0.25, Math.max(half.x, half.z)), rest: false, settle: 0, trail: 0, burn: !!o.burn, bleed: o.burn || o.ice ? 0 : 1.2, hits: 0, ice: !!o.ice, age: 0, chk: G.rng.range(0, 0.5), big: Math.max(half.x, half.y, half.z) > 0.55, s0: g.scale.clone() });
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
    const GIB_LIFE = 14; const GIB_BIG = 4.5; const GIB_AIR = 9;
    function updateGibs(dt) {
      for (let i = gibs.length - 1; i >= 0; i--) {
        const p = gibs[i]; p.age += dt;
        // a piece lies there for a while, then sinks away; big slabs (a wing, a wall panel) go sooner. One that never settles is dropped too.
        const life = p.rest ? (p.big ? GIB_BIG : GIB_LIFE) : GIB_AIR;
        if (p.age > life) {
          const k = 1 - (p.age - life) / 0.7;
          if (k <= 0) { scene.remove(p.g); if (p.own) for (const m of [].concat(p.mesh.material)) m.dispose(); gibs.splice(i, 1); continue; }
          p.g.scale.copy(p.s0).multiplyScalar(k); if (p.rest) p.g.position.y = p.yRest - (1 - k) * (p.yRest - p.yFloor); continue;
        }
        if (p.rest) {
          // what it rested on may be gone (a wall shot out, a roof fallen): then it falls again
          p.chk -= dt;
          if (p.chk <= 0) { p.chk = 0.45; if (!held(p.g.position.x, p.yFloor, p.g.position.z, p.r)) { p.rest = false; p.v.set(0, 0, 0); p.w.set(0, 0, 0); p.age = Math.min(p.age, GIB_AIR - 4); continue; } }
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
            const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2); const h = p.half; const Q = Math.PI / 2;
            // of the quarter turns near where it stopped, take the one that lies lowest: a slab ends flat, not standing on its edge
            let bestH = 1e9; const sx = snap(e.x); const sz2 = snap(e.z);
            for (const [ax, az] of [[sx, sz2], [sx + Q, sz2], [sx, sz2 + Q]]) {
              const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(ax, e.y, az, 'YXZ'));
              rm.makeRotationFromQuaternion(qq); const el = rm.elements; const hh = Math.abs(el[1]) * h.x + Math.abs(el[5]) * h.y + Math.abs(el[9]) * h.z;
              if (hh < bestH - 0.02) { bestH = hh; p.qRest = qq; }
            }
            p.yFloor = feet.y; p.yRest = feet.y + bestH + 0.005;
          }
        }
      }
    }
    // blood pools: flat alpha splats on whatever floor the point is on
    const MAXS = 90;
    const splats = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: BZ.tex('blood'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), MAXS);
    splats.count = 0; splats.frustumCulled = false; splats.renderOrder = 1; scene.add(splats);
    let splatI = 0;
    // a pool spreads out in a blink, lies there, then dries up: thirty kills on one spot must not paint the plaza red
    splats.material.color.setHex(0x8a8a8a);
    const SPLAT_LIFE = 16; const SPLAT_DRY = 5; const pools = [];
    function splat(pos, size = 1) {
      size = Math.min(2.6, 0.45 + size * 0.62);
      const i = splatI % MAXS;
      pools[i] = { p: new THREE.Vector3(pos.x, floorY(pos.x, pos.y, pos.z) + 0.02 + (splatI % 7) * 0.002, pos.z), rot: G.rng.range(0, 6.3), sx: size, sz: size * G.rng.range(0.7, 1.2), t: 0, k: -1 };
      splatI++; splats.count = Math.min(MAXS, splatI); putSplat(i, 0.3);
    }
    function putSplat(i, k) { const s = pools[i]; s.k = k; m4.compose(s.p, q.setFromEuler(e.set(0, s.rot, 0)), sc.set(s.sx * k, 1, s.sz * k)); splats.setMatrixAt(i, m4); splats.instanceMatrix.needsUpdate = true; }
    let decalChk = 0;
    function updateSplats(dt) {
      // twice a second: a pool or a scorch mark whose floor has gone drops to the floor below
      decalChk -= dt; const chk = decalChk <= 0; if (chk) decalChk = 0.5;
      if (chk) for (let i = 0; i < scorches.count; i++) {
        const c = scorchAt[i]; if (!c || c[1] <= 0.06) continue;
        const f = floorY(c[0], c[1] + 0.1, c[2]); if (c[1] - f < 0.2) continue;
        scorches.getMatrixAt(i, m4); m4.elements[13] += f - c[1]; c[1] = f; scorches.setMatrixAt(i, m4); scorches.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < pools.length; i++) {
        const s = pools[i]; if (!s || s.k === 0) continue;
        if (chk && s.p.y > 0.1) { const f = floorY(s.p.x, s.p.y + 0.1, s.p.z); if (s.p.y - f > 0.2) { s.p.y = f + 0.02; s.k = -1; } }
        s.t += dt;
        const k = s.t < 0.25 ? 0.3 + 0.7 * (1 - Math.pow(1 - s.t / 0.25, 2)) : s.t < SPLAT_LIFE ? 1 : Math.max(0, 1 - (s.t - SPLAT_LIFE) / SPLAT_DRY);
        if (k !== s.k) putSplat(i, k);
      }
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

    // a lightning arc between two points: a jagged chain of thin additive boxes that flickers out
    const arcs = []; const arcGeo = new THREE.BoxGeometry(0.06, 1, 0.06);
    function arc(a, b, color = 0x9ad8ff) {
      const g = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      let p = a.clone(); const n = 6;
      for (let i = 1; i <= n; i++) {
        const q = a.clone().lerp(b, i / n); if (i < n) q.add(new THREE.Vector3(G.rng.range(-0.35, 0.35), G.rng.range(-0.35, 0.35), G.rng.range(-0.35, 0.35)));
        const m = new THREE.Mesh(arcGeo, mat); m.position.copy(p).add(q).multiplyScalar(0.5); m.scale.y = p.distanceTo(q); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize()); g.add(m); p = q;
      }
      scene.add(g); arcs.push({ g, mat, t: 0.16 });
      puff(b, { glow: true, s0: 0.8, s1: 0.2, life: 0.12, c0: 0xffffff, c1: color });
    }
    function updateArcs(dt) { for (let i = arcs.length - 1; i >= 0; i--) { const a = arcs[i]; a.t -= dt; a.mat.opacity = a.t > 0.08 ? 1 : Math.max(0, a.t / 0.08) * (Math.sin(a.t * 200) > 0 ? 1 : 0.3); if (a.sh) a.sh.opacity = a.mat.opacity * 0.55; if (a.t <= 0) { scene.remove(a.g); a.mat.dispose(); if (a.sh) a.sh.dispose(); arcs.splice(i, 1); } } }
    // a heavier bolt that still reads on a bright sky or pale ground: an opaque white core inside a solid coloured sheath
    const boltCore = new THREE.BoxGeometry(0.05, 1, 0.05); const boltSheath = new THREE.BoxGeometry(0.14, 1, 0.14);
    function bolt(a, b, color = 0x5aa8ff) {
      const g = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, fog: false });
      const sh = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
      let p = a.clone(); const n = 7;
      for (let i = 1; i <= n; i++) {
        const q = a.clone().lerp(b, i / n); if (i < n) q.add(new THREE.Vector3(G.rng.range(-0.4, 0.4), G.rng.range(-0.4, 0.4), G.rng.range(-0.4, 0.4)));
        const at = p.clone().add(q).multiplyScalar(0.5); const len = p.distanceTo(q); const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
        for (const [geo, m] of [[boltCore, mat], [boltSheath, sh]]) { const mesh = new THREE.Mesh(geo, m); mesh.position.copy(at); mesh.scale.y = len; mesh.quaternion.copy(qq); mesh.renderOrder = 6; g.add(mesh); }
        p = q;
      }
      scene.add(g); arcs.push({ g, mat, t: 0.22, sh });
      puff(b, { glow: true, s0: 1.0, s1: 0.2, life: 0.15, c0: 0xffffff, c1: color });
    }
    // test hook: settled pieces with nothing under them, and decals above the floor they should lie on
    function floaters() {
      const out = [];
      for (const p of gibs) { if (!p.rest) { if (p.age > GIB_AIR) out.push(['gib-air', +p.g.position.y.toFixed(2)]); continue; } if (!held(p.g.position.x, p.yFloor, p.g.position.z, p.r)) out.push(['gib', +p.yFloor.toFixed(2)]); }
      for (let i = 0; i < pools.length; i++) { const s = pools[i]; if (!s || s.k === 0) continue; const f = floorY(s.p.x, s.p.y + 0.2, s.p.z); if (s.p.y - f > 0.25) out.push(['pool', +s.p.y.toFixed(2), +f.toFixed(2)]); }
      for (let i = 0; i < scorches.count; i++) { const c = scorchAt[i]; if (!c) continue; const f = floorY(c[0], c[1] + 0.2, c[2]); if (c[1] - f > 0.25) out.push(['scorch', +c[1].toFixed(2), +f.toFixed(2)]); }
      for (const r of rings) if (r.m.visible) { const f = floorY(r.m.position.x, r.m.position.y + 0.2, r.m.position.z); if (r.m.position.y - f > 0.4) out.push(['ring', +r.m.position.y.toFixed(2), +f.toFixed(2)]); }
      return out;
    }
    function jet(pos) { burst(pos, 2, [0xfff0a0, 0xffb040, 0xff6a20], { dir: new THREE.Vector3(0, -1, 0), push: 5, speed: 1.2, size: 0.09, life: 0.35, bounce: 0 }); }
    function clear() {
      P.length = 0; holes.count = 0; holeI = 0;
      for (const p of gibs) { scene.remove(p.g); if (p.own) for (const m of [].concat(p.mesh.material)) m.dispose(); } gibs.length = 0; spurts.length = 0; splats.count = 0; splatI = 0; pools.length = 0; glowB.list.length = 0; smokeB.list.length = 0; scorches.count = 0; scI = 0; scorchAt.length = 0;
    }

    return { burst, hole, tracer, muzzle, update, clear, explosion, jet, gib, chunks, splat, spurt, puff, impact, bloodMist, trail, arc, bolt, halo, streak, pop, slash, ribbon, floorY, floaters, debug: () => ({ particles: P.length, made, glow: glowB.list.length, smoke: smokeB.list.length, scorch: scorches.count, gibs: gibs.length, resting: gibs.filter((g) => g.rest).length, big: gibs.filter((g) => g.big).length, restTop: +gibs.reduce((m, g) => (g.rest ? Math.max(m, g.yFloor) : m), 0).toFixed(2), splats: splats.count }) };
  };
})();
