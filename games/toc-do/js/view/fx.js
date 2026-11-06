// VFX trong trận, đọc tham số ParticleSystem gốc từ TD.FX (tools/export_fx_ui.py): đời sống, tốc độ, cỡ, sizeOverLife,
// dải màu theo đời, sheet ảnh, phát theo giây / theo mét. Hiệu ứng gốc dạng mesh (lửa ống xả DTS, ống vệt tốc độ
// FenghenSmall quanh camera) dựng lại bằng hình đơn giản mang đúng texture gốc; chỗ nào là số tự chọn thì ghi "chọn".
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const F = { batches: {}, scene: null, t: 0, skids: null, flames: new Map(), lines: null, tl: new THREE.TextureLoader() };

  function tex(url) {
    F.texCache = F.texCache || {};
    if (!F.texCache[url]) {
      const t = F.tl.load(url + '?v=' + (TD.REV || ''));
      t.encoding = THREE.LinearEncoding;   // màu VFX cộng thẳng như shader gamma của gốc
      F.texCache[url] = t;
    }
    return F.texCache[url];
  }

  // ---------- lô hạt: một THREE.Points cho mỗi (texture, kiểu trộn, lưới sheet) ----------
  const PVS = `
    attribute vec4 pcol; attribute float psize; attribute float prot; attribute float pframe;
    uniform float uScale; varying vec4 vCol; varying float vRot; varying float vFrame;
    void main() {
      vCol = pcol; vRot = prot; vFrame = pframe;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = psize * uScale / max(0.1, -mv.z);
    }`;
  const PFS = `
    uniform sampler2D map; uniform vec2 uGrid; varying vec4 vCol; varying float vRot; varying float vFrame;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float c = cos(vRot), s = sin(vRot);
      p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
      float f = floor(vFrame);
      vec2 cell = vec2(mod(f, uGrid.x), uGrid.y - 1.0 - floor(f / uGrid.x));
      vec4 t = texture2D(map, (cell + vec2(p.x, 1.0 - p.y)) / uGrid);
      gl_FragColor = t * vCol;
      if (gl_FragColor.a < 0.004) discard;
    }`;

  function batch(texUrl, blend, cols, rows) {
    const key = texUrl + '|' + blend + '|' + cols + 'x' + rows;
    if (F.batches[key]) return F.batches[key];
    const N = 900;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N), rot = new Float32Array(N), fr = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('prot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pframe', new THREE.BufferAttribute(fr, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false,
      blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: tex(texUrl) }, uScale: { value: 600 }, uGrid: { value: new THREE.Vector2(cols, rows) } },
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 5;
    F.scene.add(pts);
    const b = F.batches[key] = { pts, g, m, N, n: 0, ps: [], cols, rows };
    return b;
  }

  function sample9(arr, t) {
    if (!arr || !arr.length) return 1;
    const x = Math.max(0, Math.min(1, t)) * (arr.length - 1), i = Math.floor(x), f = x - i;
    return arr[i] + ((arr[Math.min(i + 1, arr.length - 1)] - arr[i]) * f);
  }
  function grad(g, t, out) {
    if (!g || !g.length) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
    if (t <= g[0][0]) { out[0] = g[0][1]; out[1] = g[0][2]; out[2] = g[0][3]; out[3] = g[0][4]; return out; }
    for (let i = 1; i < g.length; i++) {
      if (t <= g[i][0]) {
        const a = g[i - 1], b = g[i], f = (t - a[0]) / ((b[0] - a[0]) || 1);
        for (let j = 0; j < 4; j++) out[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * f;
        return out;
      }
    }
    const l = g[g.length - 1]; out[0] = l[1]; out[1] = l[2]; out[2] = l[3]; out[3] = l[4];
    return out;
  }
  const rr = (a) => a[0] + Math.random() * (a[1] - a[0]);

  // Bộ phát dựng từ một lớp ParticleSystem gốc (L) + chỉnh riêng (o): o.size nhân cỡ, o.tex/o.sheet ghi đè.
  function emitter(fxKey, layerIdx, o) {
    const e = TD.FX && TD.FX[fxKey];
    if (!e) { TD.warnOnce && TD.warnOnce('fx' + fxKey, 'fx missing ' + fxKey); return null; }
    const L = Object.assign({}, (e.layers && e.layers[layerIdx]) || e, o || {});
    const sh = L.sheet || { cols: 1, rows: 1 };
    const b = batch(L.tex, L.blend || 'add', sh.cols || 1, sh.rows || 1);
    return { L, b, acc: 0, sheet: sh, sizeMul: (o && o.sizeMul) || 1 };
  }

  // vel: vector thế giới cộng thêm (kế thừa vận tốc xe / hướng bắn). k: hạt trôi theo xe này (simSpace local gốc).
  function spawn(em, x, y, z, vx, vy, vz, k) {
    if (!em) return;
    const b = em.b, L = em.L;
    if (b.ps.length >= b.N) b.ps.shift();
    const sp = L.speed ? rr(L.speed) : 0;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const r = (L.shape && L.shape.radius != null ? Math.min(L.shape.radius, 1.5) : 0.1) * Math.random();
    let dx = Math.sin(ph) * Math.cos(th), dy = Math.abs(Math.cos(ph)) * 0.5, dz = Math.sin(ph) * Math.sin(th);
    if (L.coneUp && L.shape) {
      // shape cone gốc: hạt bắn trong nón nửa góc `angle` quanh trục lên (pháo hoa là đài phun lên trời).
      const a = L.shape.angle * Math.PI / 180 * Math.sqrt(Math.random());
      dx = Math.sin(a) * Math.cos(th); dy = Math.cos(a); dz = Math.sin(a) * Math.sin(th);
    }
    const c0 = L.startColor || [1, 1, 1, 1], c1 = L.startColorMin || c0, cf = Math.random();
    b.ps.push({
      x: x + Math.sin(ph) * Math.cos(th) * r, y: y + Math.cos(ph) * r * 0.5, z: z + Math.sin(ph) * Math.sin(th) * r,
      vx: (vx || 0) + dx * sp, vy: (vy || 0) + dy * sp, vz: (vz || 0) + dz * sp,
      age: 0, life: L.life ? rr(L.life) : 0.5, size: (L.size ? rr(L.size) : 1) * em.sizeMul,
      rot: L.rot ? rr(L.rot) : 0, rv: L.rotOverLife ? rr(L.rotOverLife) : 0, g: L.gravity || 0,
      cs: [c1[0] + (c0[0] - c1[0]) * cf, c1[1] + (c0[1] - c1[1]) * cf, c1[2] + (c0[2] - c1[2]) * cf, c1[3] + (c0[3] - c1[3]) * cf],
      tint: L.tint || [1, 1, 1, 1], sol: L.sizeOverLife, col: L.color, frames: (em.sheet.cols || 1) * (em.sheet.rows || 1),
      anim: !!L.animate,
      f0: Math.floor(Math.random() * (em.sheet.cols || 1) * (em.sheet.rows || 1)), drag: L.drag || 0,
      k: k || null, kx: k ? k.x : 0, ky: k ? k.y : 0, kz: k ? k.z : 0,
    });
  }

  const cbuf = [0, 0, 0, 0];
  function updateBatches(dt) {
    for (const k in F.batches) {
      const b = F.batches[k], P = b.g.attributes;
      let n = 0;
      const keep = [];
      for (const p of b.ps) {
        p.age += dt;
        if (p.age >= p.life) continue;
        keep.push(p);
        p.vy -= p.g * dt;
        if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vz *= d; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.rv * dt;
        if (p.k) { p.x += p.k.x - p.kx; p.y += p.k.y - p.ky; p.z += p.k.z - p.kz; p.kx = p.k.x; p.ky = p.k.y; p.kz = p.k.z; }
        const t = p.age / p.life;
        grad(p.col, t, cbuf);
        P.position.array[n * 3] = p.x; P.position.array[n * 3 + 1] = p.y; P.position.array[n * 3 + 2] = p.z;
        P.pcol.array[n * 4] = cbuf[0] * p.cs[0] * p.tint[0] * 1.6;
        P.pcol.array[n * 4 + 1] = cbuf[1] * p.cs[1] * p.tint[1] * 1.6;
        P.pcol.array[n * 4 + 2] = cbuf[2] * p.cs[2] * p.tint[2] * 1.6;
        P.pcol.array[n * 4 + 3] = cbuf[3] * p.cs[3] * (p.tint[3] || 1);
        P.psize.array[n] = p.size * sample9(p.sol, t);
        P.prot.array[n] = p.rot;
        P.pframe.array[n] = p.anim ? Math.min(p.frames - 1, Math.floor(t * p.frames)) : p.f0;
        n++;
      }
      b.ps = keep;
      b.g.setDrawRange(0, n);
      for (const a of ['position', 'pcol', 'psize', 'prot', 'pframe']) P[a].needsUpdate = true;
    }
  }

  // ---------- vệt lốp: ruy băng đặt xuống đường, mờ dần theo tuổi (tire_00001 gốc, alpha) ----------
  const SVS = `attribute float born; uniform float uTime, uLife; varying vec2 vUv; varying float vA;
    void main(){ vUv = uv; vA = clamp(1.0 - (uTime - born) / uLife, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const SFS = `uniform sampler2D map; uniform vec4 tint; uniform float uGlow; varying vec2 vUv; varying float vA;
    void main(){
      vec4 t = texture2D(map, vUv);
      if (uGlow > 0.5) {   // skid gốc (FX_Car_Line_Drift): cộng sáng, lõi trắng xanh, mờ theo tuổi
        float a = smoothstep(0.35, 1.0, t.a) * vA;
        gl_FragColor = vec4(mix(vec3(0.05, 0.4, 1.0), vec3(0.25, 0.65, 1.0), t.a * 0.3) * a * 2.4, a);
      } else gl_FragColor = vec4(tint.rgb, t.a * tint.a * vA * max(t.r, 0.6));
    }`;
  function skidMesh(sk, glow, life, N) {   // số đoạn
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 4 * 2), 2));
    g.setAttribute('born', new THREE.BufferAttribute(new Float32Array(N * 4).fill(-999), 1).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6); }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: SVS, fragmentShader: SFS, transparent: true, depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { map: { value: tex(sk.tex) }, tint: { value: new THREE.Vector4(...sk.tint) }, uGlow: { value: glow ? 1 : 0 }, uTime: { value: 0 }, uLife: { value: life } } });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = glow ? 3 : 2;
    F.scene.add(mesh);
    return { mesh, g, m, N, i: 0, last: new Map() };
  }
  function skidAdd(S, key, x, y, z, rx, rz, w) {
    const prev = S.last.get(key);
    const cur = { x, y: y + 0.03, z, rx, rz, v: prev ? prev.v + 0.25 : 0 };
    if (prev && Math.hypot(x - prev.x, z - prev.z) < 0.35) return;
    if (prev && Math.hypot(x - prev.x, z - prev.z) < 4) {
      const i = S.i % S.N, P = S.g.attributes.position.array, U = S.g.attributes.uv.array, B = S.g.attributes.born.array;
      const put = (j, q, s) => { P[(i * 4 + j) * 3] = q.x + q.rx * s * w; P[(i * 4 + j) * 3 + 1] = q.y; P[(i * 4 + j) * 3 + 2] = q.z + q.rz * s * w; };
      put(0, prev, -1); put(1, prev, 1); put(2, cur, -1); put(3, cur, 1);
      U.set([0, prev.v, 1, prev.v, 0, cur.v, 1, cur.v], i * 8);
      B.fill(F.t, i * 4, i * 4 + 4);
      S.i++;
      S.g.attributes.position.needsUpdate = true; S.g.attributes.uv.needsUpdate = true; S.g.attributes.born.needsUpdate = true;
    }
    S.last.set(key, cur);
  }

  // ---------- lửa ống xả khi phun: nón cộng sáng với texture dải màu gốc của FX_Car_DTS ----------
  const FVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FFS = `uniform sampler2D grad, noise; uniform float uTime, uAmt, uSide; varying vec2 vUv;
    void main(){
      float along = vUv.y;                       // 0 ở miệng ống, 1 ở đuôi lửa
      float n = texture2D(noise, vec2(vUv.x * 2.0, along * 0.6 - uTime * 3.5)).r;
      vec3 g = texture2D(grad, vec2(uSide, 1.0 - along)).rgb;
      float l = max(g.r, max(g.g, g.b));
      vec3 c = mix(vec3(0.1, 0.5, 1.0), vec3(0.8, 0.95, 1.0), l * l) * (0.5 + l);   // video gốc: tia xanh mảnh, không phải lửa cam
      float edge = sin(vUv.x * 3.14159);
      float a = uAmt * (1.0 - along) * (0.55 + 0.45 * n) * (0.35 + 0.65 * edge);
      gl_FragColor = vec4(c * a * 1.8, a);
    }`;
  function flameFor(v) {
    let f = F.flames.get(v);
    if (f) return f;
    const geo = new THREE.CylinderGeometry(0.03, 0.24, 1, 12, 1, true);
    geo.translate(0, -0.5, 0); geo.rotateX(Math.PI / 2);   // miệng ở gốc, đuôi lửa theo +z cục bộ
    const mk = (side) => new THREE.ShaderMaterial({ vertexShader: FVS, fragmentShader: FFS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { grad: { value: tex('art/fx/fx_glow_09410_23.webp') }, noise: { value: tex('art/fx/fx_noise_07103_6.webp') },
        uTime: { value: 0 }, uAmt: { value: 0 }, uSide: { value: side } } });
    f = { group: [], amt: 0, mini: 0 };
    for (const ex of v.exhaust) {
      const outer = new THREE.Mesh(geo, mk(0.25)), inner = new THREE.Mesh(geo, mk(0.75));
      inner.scale.set(0.55, 0.55, 0.8);
      const g = new THREE.Group(); g.add(outer, inner);
      // ống xả xuất từ Unity nằm sau đuôi xe theo −z gốc; node cha đã lật nên +z cục bộ của nhóm là phía sau xe.
      g.rotation.y = Math.PI;
      ex.add(g);
      f.group.push({ g, outer, inner });
    }
    F.flames.set(v, f);
    return f;
  }

  // ---------- ống vệt tốc độ quanh camera (FX_Camer_FenghenSmall gốc: ống lưới bọc camera, texture vệt chạy dọc) ----------
  function speedTube() {
    const geo = new THREE.CylinderGeometry(7, 7, 60, 24, 1, true);
    geo.rotateX(Math.PI / 2);
    // Vệt trong texture nằm ngang (theo u); đổi u↔v để vệt chạy dọc thân ống, toả ra từ điểm tụ như FenghenSmall gốc.
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setXY(i, uv.getY(i), u); }
    const mk = (url, rep) => {
      const t = tex(url).clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, rep);
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        side: THREE.BackSide, opacity: 0 });
    };
    const a = new THREE.Mesh(geo, mk('art/fx/uifx_countdown_18_nomip_clamp.webp', 6));
    const b = new THREE.Mesh(geo, mk('art/fx/fx_light_06206_1.webp', 4));
    a.renderOrder = b.renderOrder = 20; a.frustumCulled = b.frustumCulled = false;
    const g = new THREE.Group(); g.add(a, b);
    F.scene.add(g);
    return { g, a, b };
  }

  // ---------- mesh VFX gốc dựng lại bằng hình đơn giản mang texture gốc ----------
  // land_dust / wall_scrape (FX_Car_Collision_Floor, quad 2.7×7.3 nằm sát đất, cộng sáng, texture light_06106): vệt sáng tắt dần.
  function streakMat(key) {
    const L = TD.FX[key] && TD.FX[key].layers[0];
    // ShaderMaterial như lô hạt: MeshBasicMaterial cộng sáng ở đây vẽ thành ô tối quanh vệt (đã thấy trên ảnh chụp).
    return new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float uOp; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vec3(1.0, 0.92, 0.75) * 1.5, t.a * uOp); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { map: { value: tex(L ? L.tex : 'art/fx/fx_light_06106_1.webp') }, uOp: { value: 0 } } });
  }
  function streakAdd(kind, k, ox, oz, w, len, life) {
    F.streaks = F.streaks || [];
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = streakMat(kind === 'land' ? 'land_dust' : 'wall_scrape');
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 4; m.frustumCulled = false;
    F.scene.add(m);
    F.streaks.push({ m, k, kind, age: 0, life, ox, oz, w, len, yaw: k.yaw });
  }
  function streaksUpdate(dt) {
    const S = F.streaks || [];
    for (let i = S.length - 1; i >= 0; i--) {
      const q = S[i];
      q.age += dt;
      const t = q.age / q.life;
      if (t >= 1) { F.scene.remove(q.m); q.m.geometry.dispose(); q.m.material.dispose(); S.splice(i, 1); continue; }
      const k = q.k, fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);
      // land_dust nở ra hai bên rồi tan; wall_scrape bám mép xe, kéo dài theo hướng xe.
      const grow = q.kind === 'land' ? 1 + t * 1.6 : 1;
      q.m.position.set(k.x - fz * q.ox + fx * q.oz, (k.loc ? k.loc.y : k.y) + 0.08, k.z + fx * q.ox + fz * q.oz);
      q.m.rotation.y = q.yaw;
      q.m.scale.set(q.w * grow, 1, q.len);
      q.m.material.uniforms.uOp.value = (q.kind === 'land' ? 0.7 : 0.95) * (1 - t) * (1 - t);
    }
  }

  // wind_trail (FX_Car_Common_FenghenSmall gốc): vỏ gió bọc đuôi xe, texture noise_04009 trôi ra sau, hiện khi phun.
  function windFor(v) {
    let w = F.winds.get(v);
    if (w) return w;
    const L = TD.FX.wind_trail && TD.FX.wind_trail.layers[0];
    const geo = new THREE.CylinderGeometry(0.55, 1.15, 6, 16, 1, true);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, -3.4);   // thu nhỏ về phía xe, loe ra sau
    const t = tex(L ? L.tex : 'art/fx/fx_noise_04009_1.webp').clone();
    t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, opacity: 0, color: 0xcfe6ff }));
    m.position.y = 0.6; m.renderOrder = 6; m.frustumCulled = false; m.visible = false;
    v.root.add(m);
    w = { m, tex: t };
    F.winds.set(v, w);
    return w;
  }

  F.reset = function (scene) {
    for (const k in F.batches) { F.scene && F.scene.remove(F.batches[k].pts); }
    if (F.skids && F.scene) F.scene.remove(F.skids.mesh);
    if (F.ribbons && F.scene) F.scene.remove(F.ribbons.mesh);
    if (F.lines && F.scene) F.scene.remove(F.lines.g);
    for (const q of F.streaks || []) F.scene && F.scene.remove(q.m);
    F.winds = new Map(); F.streaks = [];
    F.batches = {}; F.flames = new Map(); F.scene = scene; F.t = 0; F.flash = 0;
    // Vệt phanh: lốp đen (tire_trail). Vệt drift gốc là dải sáng xanh cộng sáng (skid / FX_Car_Line_DriftTire), không phải vệt đen.
    F.skids = skidMesh(TD.FX.tire_trail || { tex: 'art/fx/fx_car_tire_00001_01_nomip.webp', tint: [0.06, 0.06, 0.06, 0.78] }, false, 7, 1600);
    F.ribbons = skidMesh(TD.FX.skid || { tex: 'art/fx/fx_other_01066_5_nomip.webp', tint: [0, 0.0186, 1, 1] }, true, 3, 800);
    F.lines = speedTube();
    // boost_flash (FX_Camera_SuperNitro gốc): tấm noise cộng sáng phủ khung hình, loé một nhịp lúc bắt đầu phun.
    const fl = TD.FX.boost_flash && TD.FX.boost_flash.layers[0];
    F.lines.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex(fl ? fl.tex : 'art/fx/fx_noise_00010_1.webp'),
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0x9fd0ff }));
    F.lines.flash.renderOrder = 21; F.lines.flash.frustumCulled = false; F.lines.flash.visible = false;
    F.lines.g.add(F.lines.flash);
    F.em = {
      sparks: emitter('drift_spark', 1, { sizeMul: 0.35 }),
      fire: emitter('drift_flame_b', 1, { sizeMul: 0.3 }),
      fireSheet: emitter('drift_flame_b', 1, { tex: 'art/fx/fx_car_dirftflame_00003_01_nomip.webp', sheet: { cols: 4, rows: 4, mode: 'whole' }, sizeMul: 0.32, animate: true }),
      smoke: emitter('tire_dust', 0, { tex: 'art/fx/fx_smoke_02000_4.webp', blend: 'alpha', sizeMul: 0.55, tint: [0.92, 0.92, 0.95, 0.55] }),
      wall: emitter('wall_spark', 0, { life: [0.12, 0.18], size: [1.4, 2.0] }),
      wallSparks: emitter('drift_spark', 1, { sizeMul: 0.5, speed: [4, 9], life: [0.25, 0.45], gravity: 9 }),
      burst: emitter('boost_burst', 0, { life: [0.3, 0.3], size: [1.2, 1.2] }),
      ring: emitter('respawn', 2, { size: [3.5, 3.5] }),
      rise: emitter('respawn', 3, { sizeMul: 0.8, speed: [1, 3] }),
      confetti: emitter('finish_confetti', 0, { size: [0.22, 0.4], sheet: { cols: 2, rows: 2 } }),
      // Pháo hoa vạch đích (rallya_levelpoint_firework gốc): prefab tỉ lệ 1 nên số gốc đúng là cỡ thật (bắn 66–122 m/s, hạt 6–9 m,
      // loé 5–13 m) — pháo trên trời xa, không phải quanh xe; vì vậy đặt xa ~110 m trước camera (xem F.update), không thu số.
      fwSpark: emitter('finish_firework', 0, { coneUp: true }),
      fwFlash: emitter('finish_firework', 1),
      burstBig: emitter('boost_burst_big', 0, { life: [0.35, 0.35], size: [0.6, 0.6] }),
      hit: emitter('wall_hit', 0, { life: [0.14, 0.2], size: [2.4, 3.2] }),
      // finish_burst gốc (v45_tuya finish car): hào quang và khói quanh xe lúc qua vạch.
      finGlow: emitter('finish_burst', 7, { size: [15, 15] }),
      finRing: emitter('finish_burst', 6, { size: [8, 8] }),
      finPuff: emitter('finish_burst', 4),
    };
  };

  function basis(k) {
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    return { fx, fz, rx: -fz, rz: fx };
  }

  F.onEvent = function (e, k, v, mine) {
    if (!F.em) return;
    const b = basis(k);
    if (e.type === 'wall') {
      const side = e.side || 0;
      const x = k.x + b.rx * -side * 0.9 + b.fx * 0.8, z = k.z + b.rz * -side * 0.9 + b.fz * 0.8, y = k.y + 0.4;
      const n = 2 + Math.round(4 * Math.min(1, e.power || 0.5));
      for (let i = 0; i < n; i++) spawn(F.em.wall, x, y, z, 0, 0, 0);
      spawn(F.em.hit, x, y, z, 0, 0, 0, k);
      streakAdd('scrape', k, -side * 0.9, 0.2, 1.4, 5.5, 0.4);
      for (let i = 0; i < n * 3; i++) spawn(F.em.wallSparks, x, y, z, k.vx * 0.4 + b.rx * side * 3, 2, k.vz * 0.4 + b.rz * side * 3);
    } else if (e.type === 'nitro_start' || (e.type === 'miniboost')) {
      const big = e.type === 'nitro_start';
      spawn(big ? F.em.burstBig : F.em.burst, k.x - b.fx * 1.4, k.y + 0.5, k.z - b.fz * 1.4, 0, 0, 0, k);
      if (big && mine) F.flash = 1;
    } else if (e.type === 'land') {
      streakAdd('land', k, 0, 0.5, 2.4, 6, 0.5);
      for (let i = 0; i < 8; i++) spawn(F.em.smoke, k.x + (Math.random() - 0.5) * 1.6, k.y + 0.2, k.z + (Math.random() - 0.5) * 2, k.vx * 0.3, 0.5, k.vz * 0.3);
    } else if (e.type === 'respawn') {
      spawn(F.em.ring, k.x, k.y + 0.6, k.z, 0, 0, 0);
      for (let i = 0; i < 16; i++) spawn(F.em.rise, k.x + (Math.random() - 0.5) * 2, k.y + 0.3, k.z + (Math.random() - 0.5) * 3, 0, 2.5, 0);
    } else if (e.type === 'finish') {
      spawn(F.em.finGlow, k.x, k.y + 0.8, k.z, 0, 0, 0, k);
      spawn(F.em.finRing, k.x, k.y + 0.3, k.z, 0, 0, 0, k);
      for (let i = 0; i < 6; i++) spawn(F.em.finPuff, k.x, k.y + 0.6, k.z, 0, 0, 0, k);
      if (mine) F.confettiT = 4;
    }
  };

  // Lửa cam / tia lửa / khói khi drift có trong prefab nhưng video chơi thật của bản gốc không thấy: tắt (bật lại để so).
  const DRIFT_PUFFS = false;
  const wp = [];
  F.update = function (dt, views, me, camera) {
    if (!F.em) return;
    F.t += dt;
    F.skids.m.uniforms.uTime.value = F.t; F.ribbons.m.uniforms.uTime.value = F.t;
    for (const v of views) {
      const k = v.kart;
      if (!v.ready) continue;
      const b = basis(k);
      const kmh = Math.abs(k.speed) * 3.6;
      const drifting = k.st === 'drift' && k.grounded;
      TD.kartView.points(v, 'rear', wp);
      if (drifting || (k.input.brake && kmh > 60 && k.grounded)) {
        const vd = Math.min(1, Math.abs(k.drift.vd || 0) / 45);
        for (let i = 0; i < wp.length; i++) {
          const p = wp[i];
          // Video bản gốc: drift chỉ có hai dải sáng xanh sau bánh sau; vệt lốp đen chỉ khi phanh.
          if (drifting) skidAdd(F.ribbons, v.kart.id * 2 + i, p.x, k.loc ? k.loc.y : p.y - 0.15, p.z, b.rx, b.rz, 0.07);
          else skidAdd(F.skids, v.kart.id * 2 + i, p.x, k.loc ? k.loc.y : p.y - 0.3, p.z, b.rx, b.rz, 0.17);
          if (!drifting || !DRIFT_PUFFS) continue;
          // Phát theo mét như gốc (perMeter 4) và theo giây cho tia lửa (rate 7).
          const dist = kmh / 3.6 * dt;
          const em = F.em;
          em.fire.acc += dist * (em.fire.L.emit.perMeter || 4) * (0.25 + 0.5 * vd);
          // Gốc: simSpace world nhưng bay theo đường dẫn của xe ở số mét ngắn (đời 0.2–0.4 s, velocity prefab [-4, 1.5, -0.5] ra sau xe);
          // chạy xe 70 m/s mà để hạt đứng yên trong thế giới thì vệt lửa dài 20 m trôi về camera, nên cho hạt trôi theo xe (k).
          while (em.fire.acc >= 1) {
            em.fire.acc--;
            spawn(em.fireSheet, p.x, p.y - 0.15, p.z, 0, 0, 0, k);
            spawn(em.fire, p.x, p.y - 0.15, p.z, -b.fx * 4 + b.rx * (Math.random() - 0.5), 1.5, -b.fz * 4 + b.rz * (Math.random() - 0.5), k);
          }
          em.sparks.acc += dt * (em.sparks.L.emit.rate || 7) * (1 + vd * 2);
          while (em.sparks.acc >= 1) { em.sparks.acc--; spawn(em.sparks, p.x, p.y - 0.1, p.z, k.vx * 0.5 - b.fx * 3, 1.5, k.vz * 0.5 - b.fz * 3); }
          em.smoke.acc += dist * 0.9;
          while (em.smoke.acc >= 1) { em.smoke.acc--; spawn(em.smoke, p.x, p.y - 0.2, p.z, k.vx * 0.15, 0.4, k.vz * 0.15); }
        }
      }
      if (!(drifting || (k.input.brake && kmh > 60 && k.grounded))) for (let i = 0; i < 2; i++) { F.skids.last.delete(v.kart.id * 2 + i); F.ribbons.last.delete(v.kart.id * 2 + i); }
      else if (drifting) for (let i = 0; i < 2; i++) F.skids.last.delete(v.kart.id * 2 + i);
      else for (let i = 0; i < 2; i++) F.ribbons.last.delete(v.kart.id * 2 + i);
      // vỏ gió đuôi xe (wind_trail): phun to đậm, phun nhỏ nhạt
      const wantW = k.nitro.boostT > 0 ? 0.5 : (k.nitro.miniT > 0 ? 0.25 : 0);
      if (wantW > 0 || F.winds.has(v)) {
        const w = windFor(v);
        w.m.material.opacity += (wantW - w.m.material.opacity) * (1 - Math.exp(-dt * 10));
        w.m.visible = w.m.material.opacity > 0.01;
        w.tex.offset.y = (w.tex.offset.y + dt * 2.5) % 1;
        w.m.scale.set(1, 1, k.nitro.boostT > 0 ? 1.25 : 0.8);
      }
      // lửa phun
      const want = k.nitro.boostT > 0 ? 1 : (k.nitro.miniT > 0 ? 0.6 : 0);
      if (want > 0 || F.flames.has(v)) {
        const f = flameFor(v);
        f.amt += (want - f.amt) * (1 - Math.exp(-dt * (want > f.amt ? 20 : 6)));
        const big = k.nitro.boostT > 0;
        for (const q of f.group) {
          const flick = 0.85 + 0.3 * Math.sin(F.t * 47 + q.g.id) * Math.sin(F.t * 31);
          const len = (big ? 3.4 : 2.0) * flick * f.amt;
          q.g.visible = f.amt > 0.02;
          q.outer.scale.set(big ? 0.5 : 0.4, big ? 0.5 : 0.4, Math.max(0.01, len));
          q.inner.scale.set(0.55, 0.55, Math.max(0.01, len * 0.75));
          for (const m of [q.outer.material, q.inner.material]) {
            m.uniforms.uTime.value = F.t; m.uniforms.uAmt.value = f.amt;
            m.uniforms.grad.value = tex(big ? 'art/fx/fx_glow_09410_23.webp' : 'art/fx/fx_glow_09412_1.webp');
          }
        }
      }
    }
    // vệt tốc độ: hiện trên ~200 km/h, đậm khi phun
    const L = F.lines, kmh = Math.abs(me.speed) * 3.6;
    const boost = me.nitro.boostT > 0 ? 1 : me.nitro.miniT > 0 ? 0.5 : 0;
    L.g.position.copy(camera.position); L.g.quaternion.copy(camera.quaternion);
    L.g.translateZ(-26);
    const fast = Math.max(0, Math.min(1, (kmh - 170) / 80));
    // Bản gốc phun chỉ có tia xanh, không có vạch trắng xuyên tâm: giữ ống vệt mờ làm tín hiệu tốc độ.
    const wantA = fast * (0.05 + boost * 0.1);
    L.a.material.opacity += (wantA - L.a.material.opacity) * (1 - Math.exp(-dt * 6));
    L.b.material.opacity += (fast * boost * 0.1 - L.b.material.opacity) * (1 - Math.exp(-dt * 6));
    L.a.material.map.offset.x = (L.a.material.map.offset.x + dt * (2 + kmh / 60)) % 1;
    L.b.material.map.offset.x = (L.b.material.map.offset.x + dt * (3 + kmh / 50)) % 1;
    F.flash = Math.max(0, F.flash - dt * 3.5);
    const fh = 2 * 26 * Math.tan(camera.fov * Math.PI / 360) * 1.08;
    L.flash.scale.set(fh * camera.aspect, fh, 1);
    L.flash.material.opacity = 0.35 * F.flash * F.flash;
    L.flash.visible = F.flash > 0.01;
    streaksUpdate(dt);
    L.g.visible = L.flash.visible || L.a.material.opacity > 0.01 || L.b.material.opacity > 0.01;
    if (F.confettiT > 0) {
      F.confettiT -= dt;
      const b = basis(me);
      F.fwT = (F.fwT || 0) - dt;
      if (F.fwT <= 0) {
        F.fwT = 0.55;
        // Gốc là pháo trên trời ở đầu đường; xe còn chạy ~270 km/h sau vạch nên cho nổ ~110 m trước camera, trôi theo xe (đài phun từ mặt đường lên).
        const f = camera.getWorldDirection(fwV).clone(); f.y = 0; f.normalize();
        const rx = -f.z, rz = f.x, d = 90 + Math.random() * 40, side = (Math.random() - 0.5) * 110;
        const x = camera.position.x + f.x * d + rx * side, y = me.y + 2, z = camera.position.z + f.z * d + rz * side;
        spawn(F.em.fwFlash, x, y, z, 0, 0, 0, me);
        for (let i = 0; i < 18; i++) spawn(F.em.fwSpark, x, y, z, 0, 0, 0, me);
      }
      for (let i = 0; i < 4; i++) spawn(F.em.confetti, me.x + (Math.random() - 0.5) * 14 + b.fx * 4, me.y + 5 + Math.random() * 3, me.z + (Math.random() - 0.5) * 14 + b.fz * 4, 0, -1, 0, me);
    }
    const sc = TD.main && TD.main.renderer ? TD.main.renderer.getDrawingBufferSize(tmp2).y / (2 * Math.tan(camera.fov * Math.PI / 360)) : 600;
    for (const k in F.batches) F.batches[k].m.uniforms.uScale.value = sc;
    updateBatches(dt);
  };
  const tmp2 = new THREE.Vector2(), fwV = new THREE.Vector3();

  TD.fx = F;
})(globalThis.TD = globalThis.TD || {});
