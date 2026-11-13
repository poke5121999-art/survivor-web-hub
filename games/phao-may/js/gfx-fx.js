// Effects: one instanced particle system (drawn in the FX pass, depth-tested by hand against the scene),
// flying rock chunks, projectile models with trails, the beam, shields, and the aim preview.
(function () {
  'use strict';
  const PM = globalThis.PM;

  const P_VS = `
    attribute vec3 iPos; attribute vec4 iSR; attribute vec4 iCol; attribute vec4 iMisc;
    varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; varying float vDepth;
    void main(){
      vUv = uv; vCol = iCol; vMisc = iMisc;
      vec4 mv = viewMatrix * vec4(iPos, 1.0);
      float c = cos(iSR.y), s = sin(iSR.y);
      vec2 q = position.xy * vec2(iSR.x * iSR.z, iSR.x);
      mv.xy += vec2(q.x*c - q.y*s, q.x*s + q.y*c);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const P_FS = `
    uniform sampler2D tDepth; uniform sampler2D tNoise; uniform vec2 uRes; uniform float uNear; uniform float uFar;
    varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; varying float vDepth;
    void main(){
      vec2 p = vUv*2.0 - 1.0; float r = length(p); float a = 0.0;
      int kind = int(vMisc.x + 0.5);
      if (kind == 0) { float n = texture2D(tNoise, vUv*0.55 + vMisc.z*vec2(3.1, 7.7)).r; float n2 = texture2D(tNoise, vUv*1.3 + vMisc.z*5.3).g;
        a = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5)*1.3 + (n2 - 0.5)*0.7)); a *= a; }
      else if (kind == 1) { a = exp(-p.y*p.y*9.0) * (1.0 - smoothstep(0.0, 1.0, abs(p.x))); }
      else if (kind == 2) { a = (1.0 - smoothstep(0.0, 0.12, abs(r - 0.82))) * (1.0 - smoothstep(0.9, 1.0, r)); }
      else if (kind == 3) { a = pow(max(0.0, 1.0 - r), 2.2); }
      else if (kind == 4) { a = step(abs(p.x), 0.9) * step(abs(p.y), 0.45); }
      else { a = (1.0 - smoothstep(0.72, 1.0, r)); }
      a *= vCol.a;
      if (a < 0.003) discard;
      float d = texture2D(tDepth, gl_FragCoord.xy / uRes).x;
      float sceneZ = (uNear*uFar) / (uFar - d*(uFar - uNear));
      a *= clamp((sceneZ - vDepth) * 0.9 + 0.15, 0.0, 1.0);
      gl_FragColor = vec4(vCol.rgb * a, a * (1.0 - vMisc.y));
    }`;

  const BEAM_FS = `
    uniform sampler2D tNoise; uniform float uT; uniform float uLife; uniform vec3 uCol;
    varying vec2 vUv;
    void main(){
      float y = abs(vUv.y*2.0 - 1.0);
      float n = texture2D(tNoise, vec2(vUv.x*3.0 - uT*9.0, uT*3.0)).r;
      float core = (1.0 - smoothstep(0.0, 0.22 + n*0.12, y)), halo = pow(max(0.0, 1.0 - y), 2.5);
      float zig = (1.0 - smoothstep(0.0, 0.1, abs(y - 0.25 - n*0.5))) * 0.8;
      float life = smoothstep(0.0, 0.06, uT) * (1.0 - smoothstep(uLife*0.35, uLife, uT));
      float a = (core*2.2 + halo*0.5 + zig) * life * smoothstep(0.0, 0.02, vUv.x) ;
      gl_FragColor = vec4(mix(uCol, vec3(1.0), core) * a * 1.6, 1.0);
    }`;
  const SHIELD_FS = `
    uniform vec3 uCol; uniform float uT; uniform sampler2D tNoise; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float n = texture2D(tNoise, vP.xy*0.25 + vec2(0.0, uT*0.15)).r;
      float hex = smoothstep(0.48, 0.52, n);
      float a = f*0.9 + hex*0.08 + 0.04;
      gl_FragColor = vec4(uCol * a * 2.2, a*0.25); }`;

  const PROJ = {
    coi: { geo: 'shell', s: 0.46, mat: 'bronze', glow: [6, 2.6, 0.7], smoke: 1 },
    nay: { geo: 'ball', s: 0.44, mat: 'steel', glow: [3, 3.4, 1.4], smoke: 0.6 },
    muacoc: { geo: 'shell', s: 0.58, mat: 'paint', glow: [6, 2.2, 0.6], smoke: 1.3 },
    coccon: { geo: 'ball', s: 0.3, mat: 'bronze', glow: [5, 2.2, 0.6], smoke: 0.5 },
    kim: { geo: 'needle', s: 0.5, mat: 'steel', glow: [1.2, 4.5, 6], smoke: 0.25 },
    cheba: { geo: 'needle', s: 0.62, mat: 'steel', glow: [1.2, 4.5, 6], smoke: 0.3 },
    kimcon: { geo: 'needle', s: 0.36, mat: 'steel', glow: [1.2, 4.5, 6], smoke: 0.2 },
    pha: { geo: 'shell', s: 0.6, mat: 'steel', glow: [7, 2.4, 0.6], smoke: 1.5 },
    khoan: { geo: 'needle', s: 0.75, mat: 'bronze', glow: [6, 3, 0.8], smoke: 0.6 },
    diachan: { geo: 'shell', s: 0.66, mat: 'paint', glow: [7, 1.6, 0.5], smoke: 1.6 },
    bilan: { geo: 'ball', s: 0.5, mat: 'bronze', glow: [4, 3, 1], smoke: 0.4 },
    bidoi: { geo: 'ball', s: 0.58, mat: 'paint', glow: [4, 3, 1], smoke: 0.5 },
    bicon: { geo: 'ball', s: 0.38, mat: 'bronze', glow: [4, 3, 1], smoke: 0.25 },
    bayoc: { geo: 'ball', s: 0.64, mat: 'paint', glow: [5, 3, 1], smoke: 0.6 },
    ocon: { geo: 'ball', s: 0.34, mat: 'paint', glow: [4, 3, 1], smoke: 0.2 },
    bongnuoc: { geo: 'ball', s: 0.55, mat: 'orb', glow: [1.5, 4, 7], smoke: 0, soft: [0.5, 1.4, 2.2] },
    donghoi: { geo: 'ball', s: 0.5, mat: 'orb', glow: [1.5, 6, 2.5], smoke: 0, soft: [0.6, 2.4, 1.0] },
    doicho: { geo: 'ball', s: 0.42, mat: 'orb', glow: [6, 3, 8], smoke: 0, soft: [2, 1, 2.6] },
    songchuong: { geo: 'ball', s: 0.56, mat: 'bronze', glow: [6, 4.5, 1.5], smoke: 0.5 },
    hoichuong: { geo: 'ball', s: 0.68, mat: 'bronze', glow: [7, 5, 1.5], smoke: 0.8 },
    gai: { geo: 'needle', s: 0.3, mat: 'bronze', glow: [5, 4, 1.5], smoke: 0 },
    gaighim: { geo: 'needle', s: 0.62, mat: 'bronze', glow: [6, 4, 1.5], smoke: 0.3 },
    baogai: { geo: 'ball', s: 0.56, mat: 'steel', glow: [5, 4, 1.5], smoke: 0.6 },
    gaicon: { geo: 'needle', s: 0.3, mat: 'bronze', glow: [5, 4, 1.5], smoke: 0 },
    dandau: { geo: 'ball', s: 0.46, mat: 'steel', glow: [9, 3, 0.5], smoke: 1.2 },
    tronong: { geo: 'ball', s: 0.48, mat: 'steel', glow: [9, 3, 0.5], smoke: 1.2 },
    tro: { geo: 'ball', s: 0.3, mat: 'steel', glow: [9, 3, 0.5], smoke: 0.7 },
    mualua: { geo: 'ball', s: 0.56, mat: 'steel', glow: [10, 3, 0.5], smoke: 1.4 },
    giotlua: { geo: 'ball', s: 0.3, mat: 'steel', glow: [10, 3, 0.5], smoke: 0.8 },
    tele: { geo: 'ball', s: 0.3, mat: 'orb', glow: [5, 3, 7], smoke: 0 }
  };

  PM.Fx = function (G) {
    const THREE = globalThis.THREE, scene = G.scene, sim = G.sim, q = G.quality, terrain = sim.terrain, map = G.map;
    const group = new THREE.Group(); scene.add(group);
    const rnd = PM.rng('fx');
    const R = (a, b) => a + (b - a) * rnd();

    const MAX = Math.round(2200 * q.parts);
    const base = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    const aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3), aSR = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    const aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), aMisc = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    for (const a of [aPos, aSR, aCol, aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', aPos); geo.setAttribute('iSR', aSR); geo.setAttribute('iCol', aCol); geo.setAttribute('iMisc', aMisc);
    const D = G.gfx.depthU, noise = G.bake.noise();
    const pMat = new THREE.ShaderMaterial({ vertexShader: P_VS, fragmentShader: P_FS, uniforms: { tDepth: D.tDepth, uRes: D.uRes, uNear: D.uNear, uFar: D.uFar, tNoise: { value: noise } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    const pMesh = new THREE.Mesh(geo, pMat);
    pMesh.frustumCulled = false; pMesh.layers.set(1); group.add(pMesh);
    const parts = [];
    let once = [];

    // o: x y z vx vy vz life s0 s1 col[3] col1[3] a add add1 kind drag grav rot vr stretch wind
    function emit(o) {
      if (parts.length >= MAX) return;
      parts.push({ x: o.x, y: o.y, z: o.z || 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, t: 0, life: o.life || 1, s0: o.s0 || 1, s1: o.s1 === undefined ? o.s0 || 1 : o.s1,
        c0: o.col || [1, 1, 1], c1: o.col1 || o.col || [1, 1, 1], a: o.a === undefined ? 1 : o.a, add: o.add === undefined ? 1 : o.add, add1: o.add1 === undefined ? (o.add === undefined ? 1 : o.add) : o.add1,
        kind: o.kind || 0, drag: o.drag || 0, grav: o.grav || 0, rot: o.rot === undefined ? R(0, 6.28) : o.rot, vr: o.vr || 0, st: o.stretch || 1, wind: o.wind || 0, seed: rnd(), align: !!o.align, fin: o.fadeIn || 0 });
    }

    const CH = Math.round(180 * q.parts);
    const soilMat = G.bake.mat({ set: 'soil', space: 'obj', scale: 0.8, metalness: 0, roughness: 1, color: 0xd9a070 });
    const chunkGeo = PM.Geo.displace(new THREE.DodecahedronGeometry(1, 0), 0.25, 1.3, 3);
    const chunks = new THREE.InstancedMesh(chunkGeo, soilMat, CH);
    chunks.castShadow = true; chunks.frustumCulled = false; chunks.count = 0; group.add(chunks);
    const cl = [];
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    function chunk(x, y, vx, vy, s) { if (cl.length < CH) cl.push({ x, y, z: R(-2.5, 3), vx, vy, vz: R(-2, 2.5), s, rx: R(0, 6), ry: R(0, 6), w: R(-9, 9), t: 0, life: R(1.6, 3), hit: 0 }); }

    const lights = [];
    if (q.parts >= 1) for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffa860, 0, 60, 1.6); l.userData.t = 1; group.add(l); lights.push(l); }
    function flashLight(x, y, color, power) {
      if (!lights.length) return;
      let l = lights[0]; for (const c of lights) if (c.intensity < l.intensity) l = c;
      l.position.set(x, y + 1, 4); l.color.setHex(color); l.intensity = power; l.userData.t = 0;
    }

    const projGeo = {
      shell: PM.Geo.merge([new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12).rotateZ(-Math.PI / 2).toNonIndexed(), new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).translate(0.6, 0, 0).toNonIndexed(), new THREE.CylinderGeometry(0.36, 0.5, 0.3, 12).rotateZ(-Math.PI / 2).translate(-0.75, 0, 0).toNonIndexed()]),
      ball: new THREE.IcosahedronGeometry(0.7, 2),
      needle: PM.Geo.merge([new THREE.CylinderGeometry(0.02, 0.2, 2.6, 8).rotateZ(-Math.PI / 2).toNonIndexed(), new THREE.CylinderGeometry(0.2, 0.12, 0.5, 8).rotateZ(-Math.PI / 2).translate(-1.5, 0, 0).toNonIndexed()])
    };
    const projMats = {
      bronze: G.bake.mat({ set: 'bronze', scale: 1.5, emissive: 0x662200, emissiveIntensity: 1.2 }), steel: G.bake.mat({ set: 'steel', scale: 2, emissive: 0x0a2a33, emissiveIntensity: 2 }),
      paint: G.bake.mat({ set: 'paint', scale: 1.5, color: 0xd8f070, emissive: 0x223300, emissiveIntensity: 1 }),
      orb: new THREE.MeshStandardMaterial({ color: 0x220033, emissive: 0xb070ff, emissiveIntensity: 5 })
    };
    const projs = new Map();
    G.bus.on('sim:spawn', (ev) => {
      const d = PROJ[ev.shot] || PROJ.coi;
      const mesh = new THREE.Mesh(projGeo[d.geo], projMats[d.mat]);
      mesh.scale.setScalar(d.s); mesh.castShadow = true; mesh.position.set(ev.x, ev.y, 0);
      group.add(mesh);
      projs.set(ev.proj, { mesh, d, lx: ev.x, ly: ev.y, acc: 0, spin: 0 });
    });
    G.bus.on('sim:gone', (ev) => { const p = projs.get(ev.proj); if (p) { group.remove(p.mesh); projs.delete(ev.proj); } });

    const beams = [];
    const beamGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    G.bus.on('sim:beam', (ev) => {
      const len = Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0), ang = Math.atan2(ev.y1 - ev.y0, ev.x1 - ev.x0);
      const m = new THREE.ShaderMaterial({ vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: BEAM_FS,
        uniforms: { tNoise: { value: noise }, uT: { value: 0 }, uLife: { value: 0.85 }, uCol: { value: new THREE.Color(0.3, 0.9, 1.4) } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(beamGeo, m);
      mesh.position.set(ev.x0, ev.y0, 0.5); mesh.rotation.z = ang; mesh.scale.set(len, 3.2, 1); mesh.layers.set(1); mesh.frustumCulled = false;
      group.add(mesh); beams.push({ mesh, t: 0 });
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let s = 0; s < len; s += 1.4) {
        const x = ev.x0 + dx * s, y = ev.y0 + dy * s;
        if (rnd() < 0.7) emit({ x, y, z: R(-1, 2), vx: R(-5, 5), vy: R(-3, 7), life: R(0.3, 0.9), s0: R(0.08, 0.18), s1: 0, col: [2, 7, 10], kind: 1, stretch: 4, align: true, grav: 9, add: 1 });
        if (terrain.solid(x, y) || rnd() < 0.15) emit({ x, y, z: R(-1, 2), vx: R(-1.5, 1.5), vy: R(0.5, 3), life: R(0.8, 1.6), s0: 0.8, s1: R(2, 3.4), col: [0.5, 0.75, 0.85], col1: [0.25, 0.25, 0.3], a: 0.5, add: 0.3, add1: 0, kind: 0, drag: 1.2 });
      }
      emit({ x: ev.x0, y: ev.y0, z: 1, life: 0.25, s0: 4, s1: 7, col: [2, 6, 9], kind: 3 });
      flashLight(ev.x0 + dx * 6, ev.y0 + dy * 6, 0x66ddff, 900);
      G.gfx.flash = Math.max(G.gfx.flash, 0.15); G.rig.shake(0.5);
    });

    function boom(x, y, radius, big) {
      const k = radius / 4;
      emit({ x, y, z: 1.5, life: 0.16, s0: radius * 3.2, s1: radius * 5, col: [9, 6, 3], kind: 3 });
      emit({ x, y, z: 1, life: 0.42, s0: radius * 0.6, s1: radius * 2.6, col: [5, 3.5, 2], a: 0.9, kind: 2 });
      const nf = Math.round(12 * k * q.parts) + 4;
      for (let i = 0; i < nf; i++) {
        const a = R(0, 6.28), sp = R(1, 7) * k, rr = R(0, radius * 0.5);
        emit({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: R(-1.5, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2.5, life: R(0.45, 0.95), s0: radius * R(0.3, 0.55), s1: radius * R(0.8, 1.3),
          col: [9, 4.2, 1.1], col1: [0.5, 0.12, 0.04], a: 0.95, add: 1, add1: 0.35, kind: 0, drag: 2.2, vr: R(-1.5, 1.5) });
      }
      const ns = Math.round(12 * k * q.parts) + 3;
      for (let i = 0; i < ns; i++) {
        const a = R(0, 6.28), sp = R(0.5, 4) * k, tone = R(0.16, 0.34);
        emit({ x: x + R(-1, 1) * radius * 0.6, y: y + R(-0.5, 1) * radius * 0.5, z: R(-2, 3), vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + R(1, 3.5), life: R(1.2, 2.6), s0: radius * R(0.25, 0.4), s1: radius * R(0.6, 1.0),
          col: [tone * 1.1, tone * 0.9, tone * 0.82], col1: [tone * 1.5, tone * 1.4, tone * 1.45], a: 0.42, add: 0, kind: 0, drag: 1.1, vr: R(-0.6, 0.6), wind: 0.5, fadeIn: 0.15 });
      }
      const nk = Math.round(26 * k * q.parts);
      for (let i = 0; i < nk; i++) {
        const a = R(0.15, 2.99), sp = R(9, 30) * Math.sqrt(k);
        emit({ x, y, z: R(-1, 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: R(0.35, 1.0), s0: R(0.07, 0.16), s1: 0.02, col: [10, 5, 1.4], col1: [4, 0.8, 0.1], kind: 1, stretch: 5, align: true, grav: 26, drag: 0.6 });
      }
      const nc = Math.round(13 * k * q.parts);
      for (let i = 0; i < nc; i++) { const a = R(0.3, 2.85), sp = R(6, 19) * Math.sqrt(k); chunk(x + Math.cos(a) * radius * 0.4, y + Math.sin(a) * radius * 0.4, Math.cos(a) * sp, Math.sin(a) * sp, R(0.12, 0.34) * Math.sqrt(k)); }
      flashLight(x, y, 0xffa050, 1400 * k);
      G.rig.shake(0.3 + 0.3 * k + (big ? 0.3 : 0));
      G.gfx.flash = Math.max(G.gfx.flash, 0.22 * k);
    }
    // A burst with no fire: water, healing mist, the swap flash.
    function softBoom(x, y, radius, c) {
      emit({ x, y, z: 1, life: 0.2, s0: radius * 2, s1: radius * 3.4, col: [c[0] * 4, c[1] * 4, c[2] * 4], kind: 3 });
      emit({ x, y, z: 1, life: 0.5, s0: radius * 0.5, s1: radius * 2.4, col: [c[0] * 3, c[1] * 3, c[2] * 3], a: 0.9, kind: 2 });
      for (let i = 0; i < 16 * q.parts; i++) { const a = R(0, 6.28), sp = R(2, 9); emit({ x: x + Math.cos(a) * radius * 0.3, y: y + Math.sin(a) * radius * 0.3, z: R(-1.5, 2.5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, life: R(0.6, 1.3), s0: radius * 0.3, s1: radius * R(0.6, 1), col: [c[0], c[1], c[2]], col1: [c[0] * 0.6 + 0.3, c[1] * 0.6 + 0.3, c[2] * 0.6 + 0.3], a: 0.5, add: 0.5, add1: 0, kind: 0, drag: 2.4 }); }
      for (let i = 0; i < 18 * q.parts; i++) { const a = R(0, 6.28), sp = R(6, 20); emit({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 3, life: R(0.4, 0.9), s0: R(0.08, 0.16), s1: 0.02, col: [c[0] * 4, c[1] * 4, c[2] * 4], kind: 5, grav: 16 }); }
      flashLight(x, y, 0x88ccff, 500); G.rig.shake(0.2);
    }
    G.bus.on('sim:boom', (ev) => { const d = PROJ[ev.shot]; if (d && d.soft) softBoom(ev.x, ev.y, Math.max(2, ev.radius), d.soft); else boom(ev.x, ev.y, Math.max(1.6, ev.radius), false); });
    const fires = new Map();
    G.bus.on('sim:burn', (ev) => fires.set(ev.id, ev));
    G.bus.on('sim:burnout', (ev) => fires.delete(ev.id));
    G.bus.on('sim:guard', (ev) => { emit({ x: ev.x, y: ev.y, life: 0.6, s0: 1, s1: ev.reach * 2, col: [2, 5, 7], a: 0.8, kind: 2 }); emit({ x: ev.x, y: ev.y, life: 0.25, s0: 4, s1: 7, col: [2, 5, 8], kind: 3 }); });
    G.bus.on('sim:die', (ev) => { if (ev.cause !== 'sea' && ev.cause !== 'out') { boom(ev.x, ev.y, 5.5, true); for (let i = 0; i < 10; i++) chunk(ev.x, ev.y, R(-9, 9), R(5, 18), R(0.2, 0.4)); } });

    function dust(x, y, n, spread, up, col) {
      for (let i = 0; i < n; i++) emit({ x: x + R(-spread, spread), y: y + R(0, 0.3), z: R(-1, 1.5), vx: R(-2.5, 2.5), vy: R(0.3, up), life: R(0.5, 1.2), s0: R(0.3, 0.6), s1: R(1, 1.9), col: col || [0.55, 0.42, 0.32], a: 0.45, add: 0, kind: 0, drag: 2, wind: 0.4 });
    }
    G.bus.on('sim:fire', (ev) => {
      const u = sim.units[ev.unit], mz = PM.Sim.muzzle(u), k = 0.5 + ev.power / 130;
      emit({ x: mz.x, y: mz.y, z: 0.5, life: 0.1, s0: 3.2 * k, s1: 5 * k, col: ev.shot === 'kim' || ev.shot === 'cheba' ? [3, 8, 12] : [10, 6, 2.4], kind: 3 });
      for (let i = 0; i < 8; i++) emit({ x: mz.x, y: mz.y, z: R(-0.4, 0.8), vx: mz.dx * R(3, 12) * k + R(-2, 2), vy: mz.dy * R(3, 12) * k + R(-2, 2), life: R(0.5, 1.1), s0: 0.5, s1: R(1.4, 2.4), col: [0.8, 0.7, 0.62], col1: [0.5, 0.48, 0.5], a: 0.5, add: 0.25, add1: 0, kind: 0, drag: 3 });
      for (let i = 0; i < 9; i++) emit({ x: mz.x, y: mz.y, vx: mz.dx * R(10, 30) + R(-6, 6), vy: mz.dy * R(10, 30) + R(-6, 6), life: R(0.15, 0.4), s0: 0.1, s1: 0.02, col: [10, 6, 2], kind: 1, stretch: 5, align: true });
      if (u.grounded) dust(u.x - u.facing * 0.8, u.y, 5, 0.6, 2.2);
      flashLight(mz.x, mz.y, 0xffc070, 500);
      G.rig.shake(0.12 + ev.power * 0.0015);
    });
    G.bus.on('sim:bounce', (ev) => { dust(ev.x, ev.y, 5, 0.3, 3); for (let i = 0; i < 6; i++) emit({ x: ev.x, y: ev.y, vx: R(-8, 8), vy: R(3, 12), life: R(0.2, 0.5), s0: 0.09, s1: 0.02, col: [8, 6, 3], kind: 1, stretch: 4, align: true, grav: 20 }); });
    G.bus.on('sim:burrow', (ev) => { dust(ev.x, ev.y, 3, 0.4, 2.5, [0.6, 0.4, 0.28]); if (rnd() < 0.5) chunk(ev.x, ev.y, R(-5, 5), R(3, 9), R(0.1, 0.2)); G.rig.shake(0.04); });
    G.bus.on('sim:split', (ev) => { emit({ x: ev.x, y: ev.y, life: 0.14, s0: 2.5, s1: 4.5, col: [7, 7, 5], kind: 3 }); emit({ x: ev.x, y: ev.y, life: 0.3, s0: 0.5, s1: 3, col: [4, 4, 3], kind: 2 }); });
    G.bus.on('sim:splash', (ev) => { for (let i = 0; i < 12; i++) emit({ x: ev.x + R(-1, 1), y: ev.y + R(-1, 1), z: R(-2, 2), vx: R(-3, 3), vy: R(2, 9), life: R(0.9, 1.8), s0: 1.2, s1: R(3, 5), col: [1.6, 1.25, 1.05], col1: [1.0, 0.8, 0.8], a: 0.6, add: 0.1, add1: 0, kind: 0, drag: 1.6 }); });
    G.bus.on('sim:land', (ev) => { if (ev.fall > 0.5) dust(ev.x, ev.y, Math.min(14, 3 + ev.fall * 2), 0.9, 1.5 + ev.fall * 0.3); });
    G.bus.on('sim:damage', (ev) => { for (let i = 0; i < Math.min(14, 4 + ev.amount / 25); i++) emit({ x: ev.x, y: ev.y, vx: R(-11, 11), vy: R(-2, 14), life: R(0.25, 0.7), s0: 0.1, s1: 0.02, col: ev.blocked ? [3, 7, 10] : [10, 7, 3], kind: 1, stretch: 4, align: true, grav: 24 }); });
    G.bus.on('sim:heal', (ev) => { for (let i = 0; i < 16; i++) emit({ x: ev.x + R(-1.2, 1.2), y: ev.y + R(-1.2, 0.5), z: R(-0.5, 1), vy: R(1.5, 4.5), life: R(0.7, 1.4), s0: R(0.12, 0.26), s1: 0.03, col: [1.5, 7, 2.5], kind: 5 }); emit({ x: ev.x, y: ev.y, life: 0.5, s0: 1, s1: 3.4, col: [1, 5, 2], kind: 2 }); });
    G.bus.on('sim:item', (ev) => { const u = sim.units[ev.unit]; emit({ x: u.x, y: u.y + u.radius, life: 0.45, s0: 0.8, s1: 3.6, col: [6, 5, 2], kind: 2 }); for (let i = 0; i < 8; i++) emit({ x: u.x + R(-1, 1), y: u.y + R(0, 2), vy: R(2, 5), life: R(0.4, 0.9), s0: 0.14, s1: 0.02, col: [8, 6, 2], kind: 5 }); });
    G.bus.on('sim:tele', (ev) => {
      for (const [x, y] of [[ev.fromX, ev.fromY], [ev.x, ev.y]]) {
        emit({ x, y: y + 1.2, life: 0.3, s0: 5, s1: 1, col: [5, 3, 9], kind: 3 });
        for (let i = 0; i < 18; i++) emit({ x: x + R(-1.2, 1.2), y: y + R(0, 2.6), vy: R(4, 14), life: R(0.3, 0.8), s0: 0.11, s1: 0.02, col: [6, 3, 10], kind: 1, stretch: 6, rot: Math.PI / 2 });
      }
    });
    G.bus.on('fx:leaves', (ev) => { for (let i = 0; i < ev.n * q.parts; i++) emit({ x: ev.x + R(-1, 1), y: ev.y + R(-0.5, 1), z: ev.z + R(-2, 2), vx: R(-5, 5), vy: R(1, 8), vz: R(-2, 2), life: R(1.2, 2.6), s0: R(0.1, 0.2), s1: 0.1, col: [0.14, 0.34, 0.08], add: 0, kind: 4, grav: 6, drag: 1.5, vr: R(-8, 8), wind: 1 }); });

    const shields = sim.units.map((u) => {
      const m = new THREE.ShaderMaterial({ vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; vP = position; gl_Position = projectionMatrix * mv; }`, fragmentShader: SHIELD_FS,
        uniforms: { uCol: { value: new THREE.Color(0.5, 0.9, 1.3) }, uT: { value: 0 }, tNoise: { value: noise } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m);
      mesh.layers.set(1); mesh.visible = false; mesh.userData.s = 0; group.add(mesh);
      return { u, mesh };
    });

    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2.2 }));
    group.add(marker);

    let windAcc = 0, t = 0;
    const camSpan = () => G.rig.span(G.rig.dist);

    function update(dt) {
      t += dt;
      const wind = sim.wind;
      for (const [id, p] of projs) {
        const sp = sim.projs.find((s) => s.id === id);
        if (!sp) continue;
        const m = p.mesh;
        m.position.set(sp.x, sp.y, 0);
        if (p.d.geo === 'ball') { p.spin += dt * 9; m.rotation.set(p.spin, 0, p.spin * 0.7); } else m.rotation.set(0, 0, Math.atan2(sp.vy, sp.vx));
        const dist = Math.hypot(sp.x - p.lx, sp.y - p.ly);
        p.acc += dist;
        const g = p.d.glow;
        emit({ x: sp.x, y: sp.y, z: 0.4, life: 0.05, s0: p.d.s * 3.4, col: g, a: 0.55, kind: 3 });
        while (p.acc > 0.7) {
          p.acc -= 0.7;
          const f = p.acc / Math.max(dist, 1e-3), x = sp.x - (sp.x - p.lx) * f, y = sp.y - (sp.y - p.ly) * f;
          if (p.d.smoke) emit({ x, y, z: R(-0.2, 0.2), vx: R(-0.4, 0.4), vy: R(-0.2, 0.6), life: R(0.5, 1.0) * (0.6 + p.d.smoke * 0.5), s0: p.d.s * 0.7, s1: p.d.s * R(1.8, 2.8) * p.d.smoke, col: [g[0] * 0.5, g[1] * 0.5, g[2] * 0.5], col1: [0.6, 0.56, 0.56], a: 0.4, add: 0.8, add1: 0, kind: 0, wind: 0.3 });
          else emit({ x, y, life: 0.3, s0: 0.07, s1: 0.01, col: g, kind: 1, stretch: 9, rot: Math.atan2(sp.vy, sp.vx), a: 0.8 });
        }
        p.lx = sp.x; p.ly = sp.y;
      }
      for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t += dt; b.mesh.material.uniforms.uT.value = b.t; if (b.t > 0.9) { group.remove(b.mesh); b.mesh.material.dispose(); beams.splice(i, 1); } }
      for (const l of lights) { l.userData.t += dt; l.intensity *= Math.exp(-dt * 11); if (l.intensity < 1) l.intensity = 0; }

      for (const s of shields) {
        const on = s.u.alive && s.u.shield > 0;
        s.mesh.userData.s += ((on ? 1 : 0) - s.mesh.userData.s) * (1 - Math.exp(-dt * 10));
        s.mesh.visible = s.mesh.userData.s > 0.02;
        if (s.mesh.visible) { s.mesh.position.set(s.u.x, s.u.y + s.u.radius, 0); s.mesh.scale.setScalar(2.3 * s.mesh.userData.s); s.mesh.material.uniforms.uT.value = t; }
      }
      const a = sim.active;
      marker.visible = sim.phase === 'turn' && a && a.alive;
      if (marker.visible) { marker.position.set(a.x, a.y + 4.3 + Math.sin(t * 4) * 0.22, 0); marker.rotation.y = t * 2; marker.material.emissive.setHex(PM.TEAM_COLORS[a.team]); }

      if (sim.phase === 'turn' && a && a.alive && !a.ai && a.grounded) {
        const pts = PM.Sim.arc(sim, a, sim.currentDef(), a.facing, a.angle, sim.charge.on ? Math.max(8, sim.charge.power) : (a.lastPower || 55), 5);
        const n = Math.min(pts.length, sim.currentDef().kind === 'beam' ? 0 : 11);
        for (let i = 1; i < n; i++) emit({ x: pts[i].x, y: pts[i].y, z: 0.3, life: 0.001, s0: 0.2 * (1 - i / 14), col: [3, 3, 2.4], a: 0.9 * (1 - i / n), kind: 5 });
        if (sim.currentDef().kind === 'beam') { const mz = PM.Sim.muzzle(a); for (let i = 1; i < 12; i++) emit({ x: mz.x + mz.dx * i * 1.6, y: mz.y + mz.dy * i * 1.6, z: 0.3, life: 0.001, s0: 0.16, col: [1, 4, 6], a: 1 - i / 12, kind: 5 }); }
      }
      for (const m of G.units3d.list) {
        const u = m.u, sm = m.model.smoke;
        if (u.alive && sm && rnd() < 0.3) emit({ x: u.x + sm[0] * u.facing, y: u.y + sm[1], z: sm[2], vx: R(-0.3, 0.3), vy: R(1.2, 2.4), life: R(0.9, 1.6), s0: 0.2, s1: R(0.7, 1.1), col: [0.1, 0.09, 0.09], col1: [0.3, 0.28, 0.28], a: 0.5, add: 0, kind: 0, wind: 0.6 });
      }
      for (const m of G.units3d.list) {
        const u = m.u;
        if (!u.alive || u.kind !== 'chuon' || rnd() > 0.35) continue;
        emit({ x: u.x - u.facing * 0.25, y: u.y + 0.5, z: R(-0.2, 0.2), vx: R(-0.6, 0.6), vy: R(-3, -1.2), life: 0.3, s0: 0.3, s1: 0.05, col: [1, 4.5, 6], kind: 3, a: 0.7 });
      }

      for (const f of fires.values()) {
        const n = Math.ceil(f.r * 1.3 * q.parts);
        for (let i = 0; i < n; i++) {
          if (rnd() > 0.5) continue;
          const x = f.x + R(-f.r, f.r), gy = terrain.groundY(x, f.y + 2.5, 6);
          if (gy === null || gy === -Infinity) continue;
          emit({ x, y: gy + 0.2, z: R(-2, 2.5), vx: R(-0.4, 0.4), vy: R(1.5, 4.5), life: R(0.35, 0.75), s0: R(0.35, 0.7), s1: 0.1, col: [8, 3.2, 0.6], col1: [2.5, 0.4, 0.05], a: 0.85, add: 1, add1: 0.7, kind: 0, wind: 0.25 });
          if (rnd() < 0.12) emit({ x, y: gy + 1.2, z: R(-1.5, 2), vx: R(-0.3, 0.3), vy: R(1.2, 2.4), life: R(1.2, 2.2), s0: 0.5, s1: R(1.3, 2), col: [0.12, 0.1, 0.1], col1: [0.3, 0.28, 0.28], a: 0.3, add: 0, kind: 0, wind: 0.6, fadeIn: 0.2 });
        }
      }
      windAcc += dt * (0.6 + Math.abs(wind) * 1.3) * q.parts;
      const span = camSpan();
      while (windAcc > 1) {
        windAcc -= 1;
        const dir = wind >= 0 ? 1 : -1, x = G.rig.x - dir * span.w * R(0.1, 0.55), y = G.rig.y + R(-0.5, 0.5) * span.h;
        emit({ x, y, z: R(-7, 6), vx: wind * 3.2 + dir * 1.5, vy: R(-0.4, 0.4), life: R(1.6, 3), s0: R(0.03, 0.07), col: [1.6, 1.3, 1.1], a: 0.16 + Math.abs(wind) * 0.02, kind: 1, stretch: 30 + Math.abs(wind) * 9, rot: 0, fadeIn: 0.3 });
        if (rnd() < 0.4) emit({ x, y: y + 3, z: R(-6, 5), vx: wind * 2.2 + dir, vy: R(-1.4, -0.3), life: R(3, 5), s0: R(0.09, 0.16), s1: 0.1, col: [1.3, 0.75, 0.7], add: 0, a: 0.9, kind: 4, vr: R(-5, 5), wind: 0.6, fadeIn: 0.2 });
      }

      let n = 0;
      const P = aPos.array, S = aSR.array, C = aCol.array, M = aMisc.array;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        const f = p.t / p.life;
        if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; }
        p.vy -= p.grav * dt; p.vx += wind * p.wind * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
      }
      for (let i = 0; i < parts.length && n < MAX; i++, n++) {
        const p = parts[i], f = p.t / p.life, e = 1 - (1 - f) * (1 - f);
        P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z;
        S[n * 4] = p.s0 + (p.s1 - p.s0) * e; S[n * 4 + 1] = p.align ? Math.atan2(p.vy, p.vx) : p.rot; S[n * 4 + 2] = p.st; S[n * 4 + 3] = 0;
        C[n * 4] = p.c0[0] + (p.c1[0] - p.c0[0]) * f; C[n * 4 + 1] = p.c0[1] + (p.c1[1] - p.c0[1]) * f; C[n * 4 + 2] = p.c0[2] + (p.c1[2] - p.c0[2]) * f;
        C[n * 4 + 3] = p.a * (1 - f * f) * (p.fin ? Math.min(1, p.t / (p.life * p.fin)) : 1);
        M[n * 4] = p.kind; M[n * 4 + 1] = p.add + (p.add1 - p.add) * Math.min(1, f * 2.2); M[n * 4 + 2] = p.seed; M[n * 4 + 3] = 0;
      }
      geo.instanceCount = n;
      aPos.needsUpdate = aSR.needsUpdate = aCol.needsUpdate = aMisc.needsUpdate = true;

      for (let i = cl.length - 1; i >= 0; i--) {
        const c = cl[i];
        c.t += dt; c.vy -= map.g * dt;
        const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
        if (terrain.solid(nx, ny) && c.hit < 3) { const nn = terrain.normal(nx, ny), vn = c.vx * nn.x + c.vy * nn.y; if (vn < 0) { c.vx = (c.vx - 1.5 * vn * nn.x) * 0.6; c.vy = (c.vy - 1.5 * vn * nn.y) * 0.6; c.w *= 0.5; } c.hit++; }
        else { c.x = nx; c.y = ny; }
        c.z += c.vz * dt; c.rx += c.w * dt; c.ry += c.w * 0.7 * dt;
        if (c.t > c.life || c.y < sim.seaY - 3) { cl[i] = cl[cl.length - 1]; cl.pop(); }
      }
      for (let i = 0; i < cl.length; i++) {
        const c = cl[i], s = c.s * Math.min(1, (c.life - c.t) * 3);
        eu.set(c.rx, c.ry, 0); qt.setFromEuler(eu);
        chunks.setMatrixAt(i, m4.compose(v1.set(c.x, c.y, c.z), qt, v2.set(s, s, s)));
      }
      chunks.count = cl.length; chunks.instanceMatrix.needsUpdate = true;
    }

    return { group, update, emit, boom, dust, count: () => parts.length,
      dispose() { scene.remove(group); geo.dispose(); pMat.dispose(); chunkGeo.dispose(); for (const k in projGeo) projGeo[k].dispose(); } };
  };
})();
