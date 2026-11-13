// Everything around the battlefield that is not the terrain itself: far cloud banks, distant islands,
// tea hedges and shade trees on the island (they vanish when the ground under them is blasted away).
(function () {
  'use strict';
  const PM = globalThis.PM;

  const CLOUD_FS = `
    uniform sampler2D tNoise; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uSunCol; uniform vec2 uSun2; uniform float uSeed; uniform float uTime; uniform float uHaze; uniform vec3 uFog;
    varying vec2 vUv;
    float dens(vec2 uv){
      vec2 q = (uv - vec2(0.5, 0.42)) * vec2(1.0, 2.1);
      float base = 1.0 - length(q) * 2.0;
      float n = texture2D(tNoise, uv*vec2(0.9, 0.55) + uSeed + vec2(uTime*0.002, 0.0)).r*0.65 + texture2D(tNoise, uv*vec2(2.6, 1.7) + uSeed*1.7 - vec2(uTime*0.004, 0.0)).g*0.35;
      float d = base + (n - 0.42) * 1.5;
      return d * smoothstep(0.02, 0.26, uv.y);
    }
    void main(){
      float d = dens(vUv);
      float a = smoothstep(0.0, 0.3, d);
      if (a < 0.004) discard;
      float lit = clamp((d - dens(vUv + uSun2*0.07)) * 2.4 + 0.45, 0.0, 1.0);
      vec3 c = mix(uShade, uLit, lit * (0.5 + 0.5*smoothstep(0.1, 0.9, vUv.y)));
      c += uSunCol * pow(1.0 - smoothstep(0.0, 0.5, d), 3.0) * lit * 0.5;
      c = mix(c, uFog, uHaze);
      gl_FragColor = vec4(c, a * (1.0 - uHaze*0.35));
    }`;

  const CLOUDS = [
    [-260, 30, -880, 520], [140, 44, -900, 640], [520, 26, -860, 560], [-60, 12, -640, 420], [330, 16, -620, 460], [-340, 4, -520, 380],
    [90, 2, -430, 300], [470, 6, -470, 360], [-160, 62, -760, 300], [260, 70, -800, 340], [30, -4, -300, 240], [-420, 50, -700, 300], [610, 54, -720, 320], [200, -6, -250, 200]
  ];
  const ISLES = [[-70, 40, -260, 46, 1], [230, 62, -340, 60, 2], [40, 84, -520, 80, 3], [-200, 70, -600, 110, 4], [340, 34, -230, 30, 5], [150, 24, -180, 16, 6], [-30, 60, -150, 10, 7], [420, 80, -640, 120, 8]];

  PM.Scenery = function (G) {
    const THREE = globalThis.THREE, scene = G.scene, map = G.map, theme = PM.THEMES[map.id], terrain = G.sim.terrain, q = G.quality;
    const group = new THREE.Group(); scene.add(group);
    const col = (a) => new THREE.Color().fromArray(a);
    const rng = PM.rng('scenery-' + map.id);
    const noise = G.bake.noise();
    const sun = G.sky.sunDir, sun2 = new THREE.Vector2(sun.x, sun.y).normalize();
    const time = { value: 0 };

    const clouds = [];
    const cGeo = new THREE.PlaneGeometry(1, 0.5);
    for (const [x, y, z, w] of CLOUDS) {
      const haze = PM.clamp((-z - 200) / 1500, 0, 0.5);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fragmentShader: CLOUD_FS, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        uniforms: { tNoise: { value: noise }, uLit: { value: col(theme.cloudLit) }, uShade: { value: col(theme.cloudDark) }, uSunCol: { value: col(theme.sunCol) }, uSun2: { value: sun2 }, uSeed: { value: rng() * 7 }, uTime: time, uHaze: { value: haze }, uFog: { value: col(theme.fog) } } });
      const mesh = new THREE.Mesh(cGeo, m);
      mesh.position.set(x + map.w / 2, y + map.seaY, z); mesh.scale.set(w, w, 1); mesh.renderOrder = -5 + z * -0.0001;
      mesh.userData.speed = 0.6 + rng() * 0.8;
      group.add(mesh); clouds.push(mesh);
    }

    const isleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.5 });
    const isles = [];
    for (const [x, y, z, s, seed] of ISLES) {
      const g = new THREE.IcosahedronGeometry(1, q.deco >= 1 ? 4 : 3);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = PM.fbm(v.x * 1.7 + seed * 3.1, v.z * 1.7 + seed, seed * 13, 4);
        if (v.y > 0) v.y = v.y * 0.16 + (n - 0.4) * 0.28 * (1 - Math.hypot(v.x, v.z) * 0.7);
        else { const t = -v.y; v.x *= 1 - t * 0.72; v.z *= 1 - t * 0.72; v.y = -t * (0.9 + n * 1.1); }
        v.x *= 1 + (n - 0.5) * 0.35; v.z *= 0.8 + (n - 0.5) * 0.3;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      const nrm = g.attributes.normal, colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const up = nrm.getY(i), n = PM.fbm(p.getX(i) * 5, p.getZ(i) * 5 + p.getY(i) * 5, seed, 3);
        const gr = PM.smoothstep(0.45, 0.8, up + (n - 0.5) * 0.4);
        const rock = [0.30 + n * 0.14, 0.24 + n * 0.1, 0.22 + n * 0.1], grass = [0.16 + n * 0.1, 0.34 + n * 0.14, 0.08];
        const deep = PM.smoothstep(0, -1.2, p.getY(i));
        for (let c = 0; c < 3; c++) colors[i * 3 + c] = (rock[c] * (1 - gr) + grass[c] * gr) * (1 - deep * 0.45);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(g, isleMat);
      mesh.position.set(x + map.w / 2, y, z); mesh.scale.setScalar(s); mesh.rotation.y = seed * 1.3;
      mesh.userData.y0 = y; mesh.userData.ph = seed * 1.7;
      group.add(mesh); isles.push(mesh);
    }

    const surface = (x) => terrain.groundY(x, map.h - 1, map.h);
    const leaf = G.bake.mat({ set: 'leaf', space: 'world', scale: 0.55, metalness: 0, roughness: 1, color: 0xc0e8a0, envMapIntensity: 0.5 });
    const hedgeGeo = PM.Geo.displace(PM.Geo.smooth(PM.Geo.rbox(1.25, 1.0, 1, 0.42, 5)), 0.2, 2.6, 5);
    const spots = [];
    for (let x = 11; x < map.w - 11; x += 1.9 + rng() * 0.5) {
      const y = surface(x), yl = surface(x - 0.7), yr = surface(x + 0.7);
      if (!Number.isFinite(y) || !Number.isFinite(yl) || !Number.isFinite(yr) || Math.abs(yl - yr) > 0.45) continue;
      spots.push({ x, y, z: -5.3, len: 6.2 + rng() * 0.6, h: 0.85 + rng() * 0.3 });
      if (q.deco >= 1) spots.push({ x: x + 0.2, y, z: 3.5, len: 1.3, h: 0.45 + rng() * 0.15, sx: 0.8 });
    }
    const hedges = new THREE.InstancedMesh(hedgeGeo, leaf, spots.length);
    hedges.castShadow = true; hedges.receiveShadow = true; hedges.frustumCulled = false;
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
    const place = (inst, i, s, alive) => {
      e.set(0, s.rot || 0, 0); qt.setFromEuler(e);
      inst.setMatrixAt(i, m4.compose(vp.set(s.x, s.y + (s.dy || 0), s.z), qt, alive ? vs.set(s.sx || 1, s.h, s.len) : vs.set(0, 0, 0)));
    };
    spots.forEach((s, i) => { s.dy = s.h * 0.32; s.alive = true; place(hedges, i, s, true); });
    group.add(hedges);

    const wood = G.bake.mat({ set: 'wood', space: 'obj', scale: 0.25, metalness: 0, roughness: 1, color: 0xb89a80 });
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 1, 7, 4).translate(0, 0.5, 0);
    { const p = trunkGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 2.6) * 0.16); } trunkGeo.computeVertexNormals(); }
    const crownGeo = PM.Geo.merge([[0, 0, 0, 1.9, 0.75], [1.3, -0.25, 0.3, 1.3, 0.6], [-1.2, -0.2, -0.4, 1.4, 0.62], [0.2, 0.35, -0.2, 1.1, 0.55]].map(([x, y, z, r, f], i) =>
      PM.Geo.displace(new THREE.IcosahedronGeometry(r, 2).scale(1, f, 1), 0.3, 1.7, 20 + i).translate(x, y, z).toNonIndexed()));
    crownGeo.computeVertexNormals();
    const trees = [];
    for (const tx of (map.trees || [17, 29, 43, 62, 70, 104, 117, 127, 141, 153])) {
      const y = surface(tx);
      if (Number.isFinite(y)) trees.push({ x: tx, y, z: -6.4 - rng() * 1.6, h: 4.6 + rng() * 2.4, rot: rng() * 6.28, sc: 0.8 + rng() * 0.45, alive: true });
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, wood, trees.length), crowns = new THREE.InstancedMesh(crownGeo, leaf, trees.length);
    for (const inst of [trunks, crowns]) { inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false; group.add(inst); }
    const placeTree = (t, i) => {
      e.set(0, t.rot, 0); qt.setFromEuler(e);
      trunks.setMatrixAt(i, m4.compose(vp.set(t.x, t.y - 0.2, t.z), qt, t.alive ? vs.set(t.sc, t.h, t.sc) : vs.set(0, 0, 0)));
      crowns.setMatrixAt(i, m4.compose(vp.set(t.x + Math.sin(t.h * 2.6) * 0.16 * t.sc, t.y + t.h, t.z), qt, t.alive ? vs.set(t.sc, t.sc, t.sc) : vs.set(0, 0, 0)));
    };
    trees.forEach(placeTree);

    let seen = terrain.version;
    function prune() {
      let changed = false;
      spots.forEach((s, i) => {
        if (s.alive && !terrain.solid(s.x, s.y - 0.45)) { s.alive = false; place(hedges, i, s, false); changed = true; G.bus.emit('fx:leaves', { x: s.x, y: s.y + 0.4, z: s.z, n: 10 }); }
      });
      if (changed) hedges.instanceMatrix.needsUpdate = true;
      let tc = false;
      trees.forEach((t, i) => {
        if (t.alive && !terrain.solid(t.x, t.y - 0.6)) { t.alive = false; placeTree(t, i); tc = true; G.bus.emit('fx:leaves', { x: t.x, y: t.y + t.h, z: t.z, n: 26 }); }
      });
      if (tc) { trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true; }
    }

    return {
      group,
      update(dt) {
        time.value += dt;
        for (const c of clouds) { c.position.x += c.userData.speed * dt * (G.sim ? 0.4 + G.sim.wind * 0.12 : 0.4); if (c.position.x > map.w / 2 + 900) c.position.x -= 1800; else if (c.position.x < map.w / 2 - 900) c.position.x += 1800; }
        for (const m of isles) m.position.y = m.userData.y0 + Math.sin(time.value * 0.25 + m.userData.ph) * 1.2;
        if (terrain.version !== seen) { seen = terrain.version; prune(); }
      },
      dispose() {
        scene.remove(group);
        group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.isShaderMaterial) o.material.dispose(); });
      }
    };
  };
})();
