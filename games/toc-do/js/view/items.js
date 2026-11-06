// Vẽ đạo cụ (plugin trận, chỉ chạy khi R.items): hộp "?" nổi xoay, mô hình đạo cụ gốc có xương chạy đúng clip gốc
// (Đĩa Bay, Mực, Thiên Sứ, mây giông Sấm Sét, vỏ chuối, giá phóng tên lửa), lưới hiệu ứng có tween gốc (lốc xoáy, vòng
// nam châm, radar Đĩa Bay), hạt theo tham số ParticleSystem gốc (TD.ITEM_FX), khiên quanh xe, hiệu ứng trúng (xe xoay, lộn,
// bị hút lên, co lại), mực và sương che màn của người chơi, vòng ngắm khoá mục tiêu, cảnh báo bị khoá, hai ô đạo cụ trên HUD,
// chấm hộp trên bản đồ nhỏ, tiếng (mượn từ bank khác + bíp khoá tổng hợp) và thẻ "Đánh giá" ở màn thưởng.
// Mô hình, icon, texture hạt: tools/export_items.py → art/items.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const V = { ctx: null, root: null, ok: false, seen: {}, icons: {}, slotRects: [], iconsDrawn: 0, objects: 0, played: {}, synth: 0 };
  const REV = () => '?v=' + (TD.REV || '');
  const C1 = 'OperatingMode_OneSide/KeysRoot/AnchorRightDown/Offset/PropParent';
  const C2 = 'OperatingMode_TwoSide/AnchorRightDown/Offset/RightPropParent';
  const BOX_W = 1.5;      // chọn: cạnh hộp ~1,5 m (clip b9IIano2xqU t=206: 6 hộp kín bề ngang đường ~16 m)
  const KEYS = ['E', 'Q'];
  const D2R = Math.PI / 180;

  // ---------- tải tài nguyên ----------
  const glbCache = {}, texCache = {};
  function glb(name) {
    const a = TD.ITEM_ART && TD.ITEM_ART.models[name];
    if (!a) return Promise.reject(new Error('item model not found: ' + name));
    if (!glbCache[name]) {
      glbCache[name] = fetch(a.glb + REV()).then((r) => { if (!r.ok) throw new Error(a.glb + ' http ' + r.status); return r.arrayBuffer(); })
        .then((buf) => new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, rej)))
        .then((g) => { g.scene.traverse((o) => { if (o.isMesh) o.material = material(o.material); }); return { scene: g.scene, clips: g.animations }; });
    }
    return glbCache[name];
  }
  // Vật liệu theo extras.kind của bộ xuất: shader gốc là shader riêng (Hang_Diffuse, CubeTransparent, TransparentCommon...).
  function material(m) {
    const u = m.userData || {}, k = u.kind || 'opaque', map = m.map;
    let out;
    if (k === 'matcap') out = new THREE.MeshMatcapMaterial({ matcap: map, transparent: true, opacity: 0.5, depthWrite: false });   // chọn: vỏ kính trong để thấy mặt dấu hỏi bên trong
    else if (k === 'opaque') out = new THREE.MeshLambertMaterial({ map, emissive: 0x404040, emissiveMap: map });
    else if (k === 'cut') out = new THREE.MeshLambertMaterial({ map, emissive: 0x606060, emissiveMap: map, alphaTest: 0.5, side: THREE.DoubleSide });   // FX_DissolveHard
    else {
      if (map) map.encoding = THREE.LinearEncoding;
      const t = u.tint || [1, 1, 1];
      // FX_Warp (vòng nam châm) gốc chỉ làm méo ảnh phía sau: vẽ cộng màu thật nhạt cho giống một gợn sóng
      const warp = /warp/i.test(u.shader || '');
      out = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(t[0], t[1], t[2]),
        blending: k === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: warp ? 0.3 : k === 'add' ? 0.9 : 1 });
    }
    out.userData = u;
    return out;
  }
  function tex(url) {
    if (!texCache[url]) { const t = new THREE.TextureLoader().load(url + REV()); t.encoding = THREE.LinearEncoding; texCache[url] = t; }
    return texCache[url];
  }
  function img(url) {
    if (!V.icons[url]) { const i = new Image(); i.src = url + REV(); V.icons[url] = i; }
    return V.icons[url];
  }
  const iconOf = (id) => TD.ITEM_ART && TD.ITEM_ART.icons[TD.ITEMS[id].icon];

  // Bản sao cảnh glb. Lưới có xương cần bộ xương riêng cho từng bản (clone thường dùng chung xương của bản gốc).
  function cloneScene(src) {
    const c = src.clone(true), a = [], b = [];
    src.traverse((o) => a.push(o));
    c.traverse((o) => b.push(o));
    const map = new Map(a.map((o, i) => [o, b[i]]));
    a.forEach((o, i) => {
      if (!o.isSkinnedMesh) return;
      const s = o.skeleton;
      b[i].bind(new THREE.Skeleton(s.bones.map((x) => map.get(x)), s.boneInverses), o.bindMatrix);
    });
    return c;
  }

  // ---------- mô hình: bản sao + máy trộn hoạt ảnh (clip gốc) hoặc tween hiệu ứng (NssTween/TransparentCommonCurves) ----------
  const rigs = new Set(), tweens = new Set();
  // Group chứa mô hình name cỡ s; mô hình nạp xong mới thêm vào. opt.fx: lưới hiệu ứng chạy tween từ lúc tạo.
  function inst(name, s, parent, opt) {
    const g = new THREE.Group();
    g.userData.model = name;
    g.t0 = V.t; g.fade = 1;
    glb(name).then(({ scene, clips }) => {
      if (g.dead) return;
      const c = cloneScene(scene);
      c.scale.setScalar(s);
      g.add(c);
      if (clips.length) {
        g.rig = { mixer: new THREE.AnimationMixer(c), clips: Object.fromEntries(clips.map((a) => [a.name, a])), cur: null, name: null };
        rigs.add(g);
        if (g.seq) next(g);
      }
      if (opt && opt.fx) setupTween(g, c);
    }).catch((e) => TD.warnOnce('itemglb' + name, String(e)));
    if (parent) parent.add(g);
    return g;
  }
  function kill(g) {
    if (!g) return;
    g.dead = true;
    if (g.parent) g.parent.remove(g);
    rigs.delete(g); tweens.delete(g);
  }
  // Chạy lần lượt các clip (vai trò của bộ xuất: appear, idle, attack, hited, disappear...); clip cuối lặp nếu là clip lặp
  // gốc (idle) hoặc loopLast.
  function act(g, seq, loopLast) {
    g.seq = seq.slice(); g.loopLast = !!loopLast;
    if (g.rig) next(g);
  }
  function next(g) {
    const r = g.rig, name = g.seq.shift(), clip = r.clips[name];
    if (!clip) { if (g.seq.length) next(g); return; }
    const meta = TD.ITEM_ART.models[g.userData.model].clips[name], last = !g.seq.length;
    const a = r.mixer.clipAction(clip);
    a.reset();
    a.setLoop(last && (meta.loop || g.loopLast) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.play();
    if (r.cur && r.cur !== a) a.crossFadeFrom(r.cur, 0.12, false);
    r.cur = a; r.name = name;
    const key = g.userData.model + ':' + name;
    V.played[key] = (V.played[key] || 0) + 1;
  }
  const clipLen = (model, seq) => seq.reduce((s, n) => s + ((TD.ITEM_ART.models[model].clips[n] || {}).dur || 0), 0);
  function updateRigs(dt) {
    for (const g of rigs) {
      const r = g.rig;
      r.mixer.update(dt);
      const a = r.cur;
      if (a && g.seq && g.seq.length && a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 1e-4) next(g);
    }
  }
  // Đường cong khoá [[t, v], ...] nội suy tuyến tính.
  function curve(k, t) {
    if (!k || !k.length) return 1;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / ((b[0] - a[0]) || 1); }
    return k[k.length - 1][1];
  }
  const ctime = (c, t) => { const D = c.curve[c.curve.length - 1][0] || 1; t = Math.max(0, t - (c.delay || 0)); return c.loop ? t % D : Math.min(t, D); };
  // Thời gian chuẩn hoá theo duration của TransparentCommonCurves rồi kéo theo khoá cuối của đường cong.
  const tccTime = (c, t, loop) => { const d = c.dur || 1, f = loop ? (t % d) / d : Math.min(1, t / d); return f * c.curve[c.curve.length - 1][0]; };
  function setupTween(g, c) {
    g.tw = [];
    c.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (o.material.map) { o.material.map = o.material.map.clone(); o.material.map.needsUpdate = true; o.material.map.wrapS = o.material.map.wrapT = THREE.RepeatWrapping; }
      g.tw.push({ o, u: o.userData || {}, rot0: o.rotation.clone(), s0: o.scale.clone(), op0: o.material.opacity, scroll: o.material.userData.scroll });
    });
    tweens.add(g);
  }
  // tween gốc theo thời gian t (giây từ lúc tạo): TWType 5 = cỡ (tỉ lệ so với cỡ gốc), 1 = xoay (độ, Unity tay trái →
  // đảo dấu trục x, y), NssFXHelper key 0 và TransparentCommonCurves alpha = độ mờ, V/U = cuộn texture.
  function stepTween(g) {
    const t = V.t - g.t0;
    for (const n of g.tw) {
      const u = n.u, o = n.o;
      let sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, a = 1;
      for (const c of u.tw || []) {
        const v = curve(c.curve, ctime(c, t)) * c.mul;
        if (c.type === 5) { sx *= c.to[0] * v; sy *= c.to[1] * v; sz *= c.to[2] * v; }
        else if (c.type === 1) { rx -= c.to[0] * v; ry -= c.to[1] * v; rz += c.to[2] * v; }
      }
      o.scale.set(Math.max(1e-3, n.s0.x * sx), Math.max(1e-3, n.s0.y * sy), Math.max(1e-3, n.s0.z * sz));
      o.rotation.set(n.rot0.x + rx * D2R, n.rot0.y + ry * D2R, n.rot0.z + rz * D2R);
      for (const c of u.fxc || []) if (c.key === 0) a *= curve(c.curve, ctime(c, g.loopAlpha ? t % (c.curve[c.curve.length - 1][0] || 1) : t)) * c.mul * c.color[3];
      const T = u.tcc, map = o.material.map;
      if (T && T.alpha) a *= curve(T.alpha.curve, tccTime(T.alpha, t, T.alpha.loop || g.loopAlpha));
      if (map && T && T.v) map.offset.y = T.v.to * curve(T.v.curve, tccTime(T.v, t, true));
      if (map && T && T.u) map.offset.x = T.u.to * curve(T.u.curve, tccTime(T.u, t, true));
      if (map && n.scroll) { map.offset.x = n.scroll[0] * t; map.offset.y = n.scroll[1] * t; }
      o.material.opacity = n.op0 * Math.max(0, Math.min(1, a)) * g.fade;
    }
  }

  // ---------- hạt (lô THREE.Points như js/view/fx.js), phát theo tham số lớp hạt gốc ----------
  const PVS = `attribute vec4 pcol; attribute float psize; attribute float prot; attribute float pframe;
    uniform float uScale; varying vec4 vCol; varying float vRot; varying float vFrame;
    void main() { vCol = pcol; vRot = prot; vFrame = pframe; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv; gl_PointSize = min(psize * uScale / max(0.1, -mv.z), 900.0); }`;
  const PFS = `uniform sampler2D map; uniform vec2 uGrid; varying vec4 vCol; varying float vRot; varying float vFrame;
    void main() { vec2 p = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot);
      p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
      float f = floor(vFrame); vec2 cell = vec2(mod(f, uGrid.x), uGrid.y - 1.0 - floor(f / uGrid.x));
      gl_FragColor = texture2D(map, (cell + vec2(p.x, 1.0 - p.y)) / uGrid) * vCol; if (gl_FragColor.a < 0.004) discard; }`;
  const batches = {};
  function batch(url, blend, cols, rows) {
    const key = url + blend + cols + 'x' + rows;
    if (batches[key]) return batches[key];
    const N = 500, g = new THREE.BufferGeometry();
    for (const [a, n] of [['position', 3], ['pcol', 4], ['psize', 1], ['prot', 1], ['pframe', 1]]) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({ vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false,
      blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: tex(url) }, uScale: { value: 600 }, uGrid: { value: new THREE.Vector2(cols, rows) } } });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 6;
    V.root.add(pts);
    return (batches[key] = { pts, g, m, N, ps: [] });
  }
  const rr = (a, d) => (a ? a[0] + Math.random() * (a[1] - a[0]) : d);
  function grad(g, t) {
    if (!g || !g.length) return [1, 1, 1, 1];
    for (let i = 1; i < g.length; i++) if (t <= g[i][0]) { const a = g[i - 1], b = g[i], f = (t - a[0]) / ((b[0] - a[0]) || 1); return [1, 2, 3, 4].map((j) => a[j] + (b[j] - a[j]) * f); }
    return g[g.length - 1].slice(1);
  }
  // Một hạt: o = { size, life, vel: [x,y,z], tint, anim, spd, em, lx/ly/lz (toạ độ theo nguồn khi lớp mô phỏng local) }.
  function spawn(L, x, y, z, o) {
    const sh = L.sheet || { cols: 1, rows: 1 }, b = batch(L.tex, L.blend || 'add', sh.cols || 1, sh.rows || 1);
    if (b.ps.length >= b.N) b.ps.shift();
    const k = L.k || 1, sp = rr(L.speed, 0) * k * (o.spd == null ? 0.25 : o.spd);
    const th = Math.random() * 6.283, up = Math.random();
    const p = { x, y, z, vx: Math.cos(th) * sp + (o.vel ? o.vel[0] : 0), vy: up * sp * 0.6 + (o.vel ? o.vel[1] : 0), vz: Math.sin(th) * sp + (o.vel ? o.vel[2] : 0),
      age: 0, life: o.life || rr(L.life, 0.6), size: (o.size || rr(L.size, 1) * k), rot: rr(L.rot, 0), rv: L.rotOverLife ? rr(L.rotOverLife, 0) : 0,
      sol: L.sizeOverLife, col: L.color, c0: o.c0 || L.startColor || [1, 1, 1, 1], tint: o.tint || L.tint || [1, 1, 1, 1], frames: (sh.cols || 1) * (sh.rows || 1),
      anim: o.anim != null ? o.anim : !!L.sheet, f0: Math.floor(Math.random() * (sh.cols || 1) * (sh.rows || 1)), g: L.gravity || 0, em: o.em || null, mono: !!o.mono };
    if (p.em) { p.lx = x - p.em.src.x; p.ly = y - p.em.src.y; p.lz = z - p.em.src.z; }
    b.ps.push(p);
  }
  // Nguồn phát theo prefab gốc: mỗi lớp hạt phát theo rateOverTime / rateOverDistance / burst trong duration của lớp
  // (lớp loop lặp lại burst mỗi chu kỳ). src = { x, y, z, yaw } được đọc mỗi khung (đi theo xe / tên lửa).
  // o: { mul (cỡ), dur (ghi đè thời lượng), origin [x,y,z] (toạ độ prefab coi là tâm nguồn), skip [tên lớp], only [tên lớp],
  //      mono (bỏ màu của dải màu theo đời, giữ alpha), delay (giây đầu chưa phát) }.
  const ems = [];
  function emit(role, src, o) {
    const F = TD.ITEM_FX && TD.ITEM_FX[role];
    if (!F || !V.root) return null;
    const em = { role, F, src, o: o || {}, t: 0, acc: {}, fired: {}, px: src.x, py: src.y, pz: src.z, stop: false };
    ems.push(em);
    V.emitted[role] = (V.emitted[role] || 0) + 1;
    return em;
  }
  // điểm (lx, ly, lz) trong khung prefab (Unity nhìn +z, đã lật z khi xuất → prefab nhìn −z) sang thế giới theo yaw nguồn
  function toWorld(src, lx, ly, lz, out) {
    const c = Math.cos(src.yaw || 0), s = Math.sin(src.yaw || 0);
    lx = -lx; lz = -lz;
    out[0] = src.x + lx * c + lz * s; out[1] = src.y + ly; out[2] = src.z - lx * s + lz * c;
    return out;
  }
  const W = [0, 0, 0], Vv = [0, 0, 0];
  function shapeDir(sh) {
    let dx = 0, dy = 1, dz = 0;
    const t = sh ? sh.type : 'none';
    if (t === 'sphere' || t === 'hemisphere') {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u);
      dx = r * Math.cos(a); dz = r * Math.sin(a); dy = t === 'hemisphere' ? Math.abs(u) : u;
    } else if (t === 'cone') {
      const a = Math.random() * 6.283, s = Math.sin((sh.angle || 0) * D2R) * Math.random();
      dx = Math.cos(a) * s; dz = Math.sin(a) * s; dy = Math.sqrt(1 - s * s);
    } else if (t === 'circle') {
      const a = Math.random() * 6.283; dx = Math.cos(a); dz = Math.sin(a); dy = 0;
    }
    return [dx, dy, dz];
  }
  function spawnLayer(em, L) {
    const o = em.o, mul = o.mul || 1, k = (L.k || 1) * mul, sh = L.shape, org = o.origin || [0, 0, 0];
    const d = shapeDir(sh), r = sh ? (sh.radius || 0) * k * Math.cbrt(Math.random()) : 0;
    let ox = d[0] * r, oy = d[1] * r, oz = d[2] * r;
    if (sh && sh.type === 'box') { ox = (Math.random() - 0.5) * (sh.scale[0] || 1) * k; oy = (Math.random() - 0.5) * (sh.scale[1] || 0) * k; oz = (Math.random() - 0.5) * (sh.scale[2] || 1) * k; }
    if (sh && sh.type === 'mesh') { const m = (L.render && L.render.mesh && L.render.mesh.size[0]) || 4; ox = (Math.random() - 0.5) * m * k * (sh.scale[0] || 1); oz = (Math.random() - 0.5) * m * k * (sh.scale[2] || 1); oy = 0; }
    const p = L.pos || [0, 0, 0];
    toWorld(em.src, (p[0] - org[0]) * mul + ox, (p[1] - org[1]) * mul + oy, (p[2] - org[2]) * mul + oz, W);
    // hướng bay: hình phát cầu/bán cầu/nón hướng lên; không có hình thì theo +z của prefab (mũi xe)
    const sp = rr(L.speed, 0) * k, nd = sh && sh.type !== 'box' && sh.type !== 'mesh' ? d : [0, 0, 1];
    toWorld({ x: 0, y: 0, z: 0, yaw: em.src.yaw }, nd[0] * sp + (L.velocity ? L.velocity[0] * k : 0), nd[1] * sp + (L.velocity ? L.velocity[1] * k : 0), nd[2] * sp + (L.velocity ? L.velocity[2] * k : 0), Vv);
    // hạt render mesh (mây mù): cỡ = startSize × cạnh lưới gốc
    const ms = L.render && L.render.mode === 'mesh' && L.render.mesh ? Math.max(1, Math.min(L.render.mesh.size[0], 20) * 0.6) : 1;
    let c0 = L.startColor;
    if (L.startColorMin) { const f = Math.random(); c0 = c0.map((v, i) => L.startColorMin[i] + (v - L.startColorMin[i]) * f); }
    spawn(L, W[0], W[1], W[2], { size: rr(L.size, 1) * k * ms * (o.size || 1), spd: 0, vel: [Vv[0], Vv[1], Vv[2]], c0, mono: o.mono,
      em: L.simSpace === 'local' && o.follow !== false ? em : null });
  }
  function stepEmitters(dt) {
    for (let i = ems.length - 1; i >= 0; i--) {
      const em = ems[i], o = em.o, s = em.src;
      em.t += dt;
      const moved = Math.hypot(s.x - em.px, s.y - em.py, s.z - em.pz);
      em.px = s.x; em.py = s.y; em.pz = s.z;
      let alive = false;
      em.F.layers.forEach((L, li) => {
        if (L.kind !== 'ps' || L.active === false || (o.skip && o.skip.includes(L.name)) || (o.only && !o.only.includes(L.name))) return;
        const len = L.duration || 1, dur = o.dur != null ? o.dur : len;
        if (em.stop || em.t >= dur) return;
        alive = true;
        if (em.t < (o.delay || 0)) return;
        const E = L.emit || {}, cyc = L.loop ? Math.floor(em.t / len) : 0, lt = em.t - cyc * len;
        let n = (em.acc[li] || 0) + (E.rate || 0) * dt * (o.rate || 1) + (E.perMeter || 0) * moved;
        (E.burst || []).forEach((b, j) => { const key = li + ':' + j + ':' + cyc; if (!em.fired[key] && lt >= b.t) { em.fired[key] = 1; n += Math.min(30, b.n[1]); } });
        let c = Math.min(40, Math.floor(n));
        em.acc[li] = n - Math.floor(n);
        while (c-- > 0) spawnLayer(em, L);
      });
      if (!alive) { em.stop = true; ems.splice(i, 1); }
    }
  }
  function stepParticles(dt, camera) {
    const sc = TD.main.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(camera.fov * Math.PI / 360));
    let total = 0;
    for (const key in batches) {
      const b = batches[key], P = b.g.attributes;
      b.m.uniforms.uScale.value = sc;
      let n = 0;
      b.ps = b.ps.filter((p) => (p.age += dt) < p.life && !(p.em && p.em.stop && p.em.o.killLocal !== false));
      for (const p of b.ps) {
        p.vy -= p.g * dt;
        if (p.em) { p.lx += p.vx * dt; p.ly += p.vy * dt; p.lz += p.vz * dt; p.x = p.em.src.x + p.lx; p.y = p.em.src.y + p.ly; p.z = p.em.src.z + p.lz; }
        else { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
        p.rot += p.rv * dt;
        const t = p.age / p.life, c = grad(p.col, t);
        if (p.mono) c[0] = c[1] = c[2] = 1;
        P.position.array.set([p.x, p.y, p.z], n * 3);
        P.pcol.array.set([c[0] * p.c0[0] * p.tint[0] * 1.5, c[1] * p.c0[1] * p.tint[1] * 1.5, c[2] * p.c0[2] * p.tint[2] * 1.5, c[3] * p.c0[3] * (p.tint[3] || 1)], n * 4);
        const sol = p.sol ? p.sol[Math.min(p.sol.length - 1, Math.floor(t * p.sol.length))] : 1;
        P.psize.array[n] = p.size * sol; P.prot.array[n] = p.rot; P.pframe.array[n] = p.anim ? Math.min(p.frames - 1, Math.floor(t * p.frames)) : p.f0;
        n++;
      }
      total += n;
      b.g.setDrawRange(0, n);
      for (const a in P) P[a].needsUpdate = true;
    }
    V.particles = total;
  }
  const layer = (role, i) => { const F = TD.ITEM_FX && TD.ITEM_FX[role]; return F && F.layers[i]; };
  const layerByTex = (role, part) => { const F = TD.ITEM_FX && TD.ITEM_FX[role]; return F && F.layers.find((L) => L.tex.includes(part)); };

  // ---------- hộp: hai InstancedMesh (vỏ kính + mặt dấu hỏi), nổi lên xuống, xoay ----------
  function buildBoxes(I) {
    const n = I.boxes.length, M = TD.ITEM_ART.models.box, s = BOX_W / M.size[0], cy = -(M.min[1] + M.size[1] / 2) * s;
    V.boxes = { list: [], s, cy };
    glb('box').then(({ scene }) => {
      if (!V.root) return;
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, o.material, n);
        im.frustumCulled = false; im.renderOrder = o.material.transparent ? 3 : 0;
        V.root.add(im); V.boxes.list.push(im);
      });
    }).catch((e) => TD.warnOnce('itembox', String(e)));
  }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), AXY = new THREE.Vector3(0, 1, 0);
  function updateBoxes(I, t) {
    const B = V.boxes;
    if (!B || !B.list.length) return;
    I.boxes.forEach((b, i) => {
      // hồi lại: phồng từ 0 trong 0,3 s; đang chờ hồi: thu về 0 (ẩn)
      const grow = b.on ? Math.min(1, (b.age = (b.age || 0) + V.dt) / 0.3) : 0;
      if (!b.on) b.age = 0;
      q.setFromAxisAngle(AXY, t * 1.6 + i * 0.7);
      pv.set(b.x, b.y + 0.95 + B.cy + Math.sin(t * 2.4 + i) * 0.12, b.z);
      sv.setScalar(B.s * grow * (1 + (1 - grow) * 0.4));
      mtx.compose(pv, q, sv);
      for (const im of B.list) im.setMatrixAt(i, mtx);
    });
    for (const im of B.list) im.instanceMatrix.needsUpdate = true;
  }

  // ---------- khung xe: mọi prefab gắn lên xe (khiên, thiên sứ, mực, mây giông, giá tên lửa, vòng nam châm...) ----------
  // Group theo vị trí + yaw của xe, con `f` lật π vì prefab xuất từ Unity nhìn −z (như node flip của karts.js).
  const onKart = new Map();
  function kartFrame(k) {
    let o = onKart.get(k.id);
    if (!o) {
      o = { g: new THREE.Group(), f: new THREE.Group(), src: { x: k.x, y: k.y, z: k.z, yaw: k.yaw }, shield: null, angel: null, shrinkT: 0, fx: [] };
      o.f.rotation.y = Math.PI; o.g.add(o.f);
      V.root.add(o.g); onKart.set(k.id, o);
    }
    return o;
  }
  // gắn tạm một mô hình lên xe, tự gỡ sau life giây (o.fx); fadeOut: giây cuối mờ dần (lưới hiệu ứng)
  function attachTemp(k, name, s, life, seq, opt) {
    const o = kartFrame(k), g = inst(name, s, o.f, opt);
    if (seq) act(g, seq);
    o.fx.push({ g, t: life, life, fadeOut: opt && opt.fadeOut });
    return g;
  }

  // ---------- vật thể đạo cụ: một Group cho mỗi tên lửa / đĩa bay / vật trên đường, dọn khi sim bỏ ----------
  const objs = new Map(), dying = [];
  const MISSILE_S = 1.8;     // chọn: tên lửa gốc dài 1,19 m, phóng 1,8 lần cho thấy rõ từ camera sau xe (xe dài 2,9 m)
  const BANANA_S = 0.7;      // chọn: vỏ chuối gốc cỡ ~2,9 m sau clip Appear (Bip_00 phóng 1,93), thu còn ~2 m cho khớp hitR 1,8 m
  const TORNADO_S = 0.5;     // chọn: tween gốc phóng phễu tới 26 m cao, bán kính đáy ~12 m; thu một nửa cho khớp bán kính cuốn r = 5 m
  const UFO_Y = 3.34;        // src: Bip_01 của clip Idle (props_item_ufo_idle) treo đĩa 3,34 m trên gốc prefab
  function objFor(x) {
    let o = objs.get(x.id);
    if (o) return o;
    const g = new THREE.Group();
    V.root.add(g);
    o = { g, type: x.type, t: 0, born: V.t };
    const R = TD.main.race;
    if (x.type === 'missile') {
      // mũi tên lửa gốc nhìn +z Unity = −z sau khi xuất: lật π để lookAt (+z) quay mũi về hướng bay
      o.flip = new THREE.Group(); o.flip.rotation.y = Math.PI; g.add(o.flip);
      o.m = inst('missile', MISSILE_S, o.flip);
      o.src = { x: x.x, y: x.y, z: x.z, yaw: 0 };
      // lửa đuôi, quầng sáng, khói theo mét bay (lớp hạt của props_item_missile; tâm prefab là lưới tên lửa)
      // 0,15 s đầu tên lửa còn sát camera: chưa nhả khói (khói gần ống kính che nửa màn)
      o.em = emit('missile_trail', o.src, { dur: 1e9, origin: TD.ITEM_FX.missile_trail.layers[0].pos, mul: MISSILE_S * 0.7, delay: 0.15 });
    } else if (x.type === 'ufo') {
      // Đĩa Bay: clip Appear trên xe người dùng (bay vút lên trước), giữa đường bay theo sim, Attack sà xuống xe mục tiêu,
      // Idle treo trên đầu, Disappear bay lên khi hết giờ. Gốc prefab đặt ở khung xe (Bip_01 tự nâng đĩa lên 3,34 m).
      o.f = new THREE.Group(); o.f.rotation.y = Math.PI; g.add(o.f);
      o.m = inst('ufo', 1, o.f);
      act(o.m, ['appear', 'idle']);
      o.stage = 'appear';
      o.src = { x: x.x, y: x.y, z: x.z, yaw: 0 };
      o.by = R.karts[x.by];
    } else if (x.type === 'banana') {
      o.f = new THREE.Group(); o.f.rotation.y = Math.PI; g.add(o.f);
      o.m = inst('banana', BANANA_S, o.f);
      act(o.m, ['appear']);
      g.rotation.y = Math.random() * 6.283;
    } else if (x.type === 'cloud') {
      // Mây Mù (props_item_cloud -> fx_props_item_cloud_a): mảng sương phát lại mỗi chu kỳ 5 s suốt đời vật trên đường
      o.src = { x: x.x, y: x.y, z: x.z, yaw: Math.random() * 6.283 };
      // dải màu theo đời của lớp này là số điều khiển shader riêng (R tăng dần, B = 1), không phải màu: chỉ lấy alpha (mono)
      o.em = emit('smog', o.src, { dur: x.life, origin: TD.ITEM_FX.smog.layers[0].pos, mul: 0.55, mono: true });   // chọn: 0,55 cho đám mây ~9 m vừa bề ngang đường
      if (o.em) o.em.F = Object.assign({}, o.em.F, { layers: o.em.F.layers.map((L) => Object.assign({}, L, { loop: true })) });
    } else if (x.type === 'tornado') {
      // Lốc Xoáy: phễu + dải gió của fx_props_item_tornado_appear (tween gốc: phồng 0,13 s, xoay 360°/2 s, gió cuộn V 2/s),
      // vòng gió chân lốc (idle) chớp lặp lại mỗi 0,6 s
      o.m = inst('tornado', TORNADO_S, g, { fx: true });
      o.m.loopAlpha = true;
      o.ring = inst('tornado_ring', TORNADO_S * 1.6, g, { fx: true });
    }
    objs.set(x.id, o);
    return o;
  }
  function stageUfo(o, m, R) {
    const tg = R.karts[m.target], it = TD.ITEMS.ufo, atk = TD.ITEM_ART.models.ufo.clips.attack.dur;
    let st, k;
    if (m.phase === 'fly' && m.t < TD.ITEM_ART.models.ufo.clips.appear.dur && o.by) { st = 'appear'; k = o.by; }
    else if (m.phase === 'fly' && m.t < it.fly - atk) st = 'cruise';
    else { st = 'target'; k = tg; }
    if (st !== o.stage) {
      if (st === 'cruise') act(o.m, ['idle']);
      if (st === 'target') act(o.m, ['attack', 'idle']);
      o.stage = st;
    }
    if (k) { o.g.position.set(k.x, k.y, k.z); o.g.rotation.y = k.yaw; }
    else { o.g.position.set(m.x, m.y - UFO_Y, m.z); o.g.rotation.y = Math.atan2(m.x - m.sx, m.z - m.sz); }
  }
  function updateObjects(I, dt, t) {
    const live = new Set(), R = TD.main.race;
    for (const m of I.proj) {
      live.add(m.id);
      const o = objFor(m);
      if (m.type === 'missile') {
        o.g.position.set(m.x, m.y, m.z);
        o.g.lookAt(m.x + m.vx, m.y + m.vy, m.z + m.vz);
        o.src.x = m.x; o.src.y = m.y; o.src.z = m.z; o.src.yaw = Math.atan2(m.vx, m.vz);
      } else if (m.type === 'ufo') {
        stageUfo(o, m, R);
        const tg = R.karts[m.target];
        if (m.phase === 'hover' && !o.hover && tg) {
          o.hover = true;
          // radar quét + vòng nhiễu trên xe bị khoá (props_item_ufodisturb), tia sáng và khói dưới đĩa (props_item_ufo_idle)
          attachTemp(tg, 'ufo_disturb', 1, TD.ITEMS.ufo.dur, null, { fx: true, fadeOut: 0.3 });
          const fr = kartFrame(tg);
          emit('ufo', fr.src, { dur: TD.ITEMS.ufo.dur });
          emit('ufo_hit', fr.src);
          play('Play_DJ_FD_ganrao', nearOf(tg));
        }
      }
    }
    for (const z of I.hz) {
      live.add(z.id);
      const o = objFor(z), it = TD.ITEMS[z.type];
      o.g.position.set(z.x, z.y, z.z);
      const fade = Math.min(1, z.t / 0.25, (z.life - z.t) / 0.4);
      if (z.type === 'banana') o.g.position.y += 0.02;
      else if (z.type === 'tornado') {
        o.m.fade = Math.max(0, fade);
        if (o.ring && V.t - o.ring.t0 > 0.6) o.ring.t0 = V.t;
        o.g.scale.setScalar(it.r / 5);
      }
    }
    for (const [id, o] of objs) {
      if (live.has(id)) continue;
      objs.delete(id);
      if (o.em) o.em.stop = true;
      if (o.type === 'ufo') { act(o.m, ['disappear']); dying.push({ g: o.g, t: clipLen('ufo', ['disappear']) }); continue; }
      if (o.type === 'banana' || o.type === 'tornado') { dying.push({ g: o.g, t: 0.3, shrink: true }); continue; }
      V.root.remove(o.g);
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i];
      d.t -= dt;
      if (d.shrink) d.g.scale.multiplyScalar(Math.max(0.01, 1 - dt / Math.max(0.05, d.t + dt)));
      if (d.t <= 0) {
        const ms = [];
        d.g.traverse((c) => { if (c.userData.model) ms.push(c); });   // gom trước: kill gỡ khỏi cha, không gỡ giữa lúc duyệt
        ms.forEach(kill);
        V.root.remove(d.g); dying.splice(i, 1);
      }
    }
    V.objects = objs.size;
  }

  // ---------- trên xe: khiên, thiên sứ, hiệu ứng trúng ----------
  function kartFx(I, views, dt, t) {
    for (const v of views) {
      const k = v.kart, st = I.ks[k.id], o = kartFrame(k);
      o.g.position.set(k.x, k.y, k.z);
      o.g.rotation.y = k.yaw;
      o.src.x = k.x; o.src.y = k.y; o.src.z = k.z; o.src.yaw = k.yaw;
      // Lá Chắn: vòng tấm khiên Dunpai (clip Open → Loop lặp; hết giờ hoặc đỡ đòn thì Close rồi gỡ)
      const shieldOn = st.shieldT > 0 && st.shieldKind === 'shield';
      if (shieldOn && !o.shield) { o.shield = inst('shield', 1, o.f); act(o.shield, ['open', 'loop']); }
      if (o.shield && !shieldOn) {
        act(o.shield, ['close']);
        o.fx.push({ g: o.shield, t: clipLen('shield', ['close']) + 0.05, life: 1 });
        o.shield = null;
      }
      // Thiên Sứ: clip Appear rồi Idle lặp (Loop cao hơn 0,43 m), đỡ đòn thì Hited; hết giờ thì thu nhỏ biến mất
      const angelOn = st.shieldKind === 'angel' && st.shieldT > 0;
      if (angelOn && !o.angel) { o.angel = inst('angel', 1, o.f); act(o.angel, ['appear', 'idle']); }
      if (o.angel) {
        const s = angelOn ? Math.min(1, st.shieldT / 0.4) : 0;
        o.angel.scale.setScalar(Math.max(0.01, s));
        if (!angelOn) { kill(o.angel); o.angel = null; }
      }
      for (let i = o.fx.length - 1; i >= 0; i--) {
        const e = o.fx[i];
        e.t -= dt;
        if (e.fadeOut) e.g.fade = Math.max(0, Math.min(1, e.t / e.fadeOut));
        if (e.t <= 0) { kill(e.g); o.fx.splice(i, 1); }
      }
      // hiệu ứng trúng chỉ là hình: kartView.update đã đặt lại root mỗi khung, ở đây cộng thêm sau đó
      const f = k.fx, ufo = I.proj.find((m) => m.type === 'ufo' && m.target === k.id && m.phase === 'hover');
      if (f.stunT > 0 && (f.kind === 'spin' || f.kind === 'tornado')) v.root.rotation.y += f.stunT * (f.kind === 'tornado' ? 16 : 9);
      if (f.stunT > 0 && f.kind === 'flip') v.pivot.rotation.x -= (1 - f.stunT / TD.ITEMS.missile.stun) * Math.PI * 2;
      if (f.stunT > 0 && f.kind === 'tornado') v.root.position.y += Math.sin((1 - f.stunT / TD.ITEMS.tornado.stun) * Math.PI) * 2.5;
      if (ufo) { v.root.position.y += 1.0 + Math.sin(t * 4) * 0.2; v.root.rotation.y += Math.sin(t * 3) * 0.3; }
      if (o.shrinkT > 0) o.shrinkT -= dt;
      v.root.scale.setScalar(o.shrinkT > 0 ? 0.55 + 0.45 * Math.max(0, 1 - o.shrinkT / 0.3) : 1);   // Sấm Sét: xe co lại, 0,3 s cuối nở về
      // Nam Châm: vòng từ xanh trước mũi xe hút, vòng đỏ trên xe bị hút (fx_props_item_magnet_a/b) + chuỗi vòng sáng
      // (FX_Glow_07004 của prefab magnet) chạy từ mục tiêu về xe hút
      const mg = st.magnet, tg = mg && mg.target != null ? TD.main.race.karts[mg.target] : null;
      if (tg && !o.magnet) {
        o.magnet = attachTemp(k, 'magnet_a', 1, mg.t, null, { fx: true, fadeOut: 0.25 });
        o.magnet.position.set(0, 0.8, -2.2);   // chọn: vòng đứng trước mũi xe (prefab gốc z 0,32 so với điểm gắn đầu xe)
        attachTemp(tg, 'magnet_b', 1, mg.t, null, { fx: true, fadeOut: 0.25 });
        o.magEm = [emit('magnet', o.src, { dur: mg.t }), emit('magnet_b', kartFrame(tg).src, { dur: mg.t })];
      }
      if (!mg && o.magnet) { o.magnet = null; (o.magEm || []).forEach((e) => { if (e) e.stop = true; }); }
      if (tg && (o.mt = (o.mt || 0) + dt) > 0.05) {
        o.mt = 0;
        const L = layer('magnet', 1);
        if (L) for (let i = 0; i < 2; i++) {
          const a = Math.random();
          spawn(L, k.x + (tg.x - k.x) * a, k.y + 0.8 + (tg.y - k.y) * a, k.z + (tg.z - k.z) * a, { size: 1.6, life: 0.3, spd: 0, tint: [1, 0.35, 0.35, 1] });
        }
      }
    }
  }

  // ---------- tiếng ----------
  function play(ev, near, opt) { if (near > 0.02) TD.audio.play(ev, Object.assign({ vol: near }, opt || {})); }
  function nearOf(k) {
    const me = V.ctx && V.ctx.me;
    if (!me || !k) return 0;
    return k === me ? 1 : Math.max(0, 1 - Math.hypot(k.x - me.x, k.z - me.z) / 80);
  }
  // Bíp ngắm/khoá mục tiêu (event gốc Play_DJ_ddmiaozhun / Play_DJ_ddsuoding thuộc bank DJ, không có trong APK và không bank
  // nào có tiếng bíp radar tương tự): tổng hợp bằng WebAudio, sóng vuông ngắn qua bus sfx.
  function beep(f, dur, vol, f2) {
    const A = TD.audio;
    if (!A || !A.ctx || !A.bus.sfx) return;
    const c = A.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.linearRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(A.bus.sfx); o.start(t); o.stop(t + dur + 0.02);
    V.synth++;
  }
  const lockChirp = () => { beep(1400, 0.07, 0.12); setTimeout(() => beep(2100, 0.11, 0.12), 90); };   // chọn: hai nốt đi lên = "đã khoá"

  // ---------- sự kiện ----------
  function onEvent(e, mine, ctx) {
    const R = ctx.R, me = ctx.me, k = e.kart != null ? R.karts[e.kart] : null;
    V.seen[e.type] = (V.seen[e.type] || 0) + 1;
    const near = mine ? 1 : nearOf(k);
    const o = k && kartFrame(k);
    switch (e.type) {
      case 'item_get':
        if (mine) { play('Play_DJ_shiqu_ty', 1); V.slotPop[e.slot] = 0.35; }
        if (e.box != null) {
          // burst nhặt hộp (fx_props_item_propbox_getitem): tâm prefab ở 4,29 m, đặt vào giữa hộp
          const b = R.items.boxes[e.box];
          emit('pickup', { x: b.x, y: b.y + 1, z: b.z, yaw: k ? k.yaw : 0 }, { origin: [0, 4.29, -0.533], mul: 0.5 });
        }
        break;
      case 'item_full': if (mine) V.fullT = 1.6; break;
      case 'item_use': {
        const snd = { missile: 'Play_DJ_ddfashe', banana: 'Play_DJ_atk_ty', cloud: 'Play_DJ_Cloud', tornado: 'Play_DJ_wind', shield: 'Play_DJ_hudunopen', angel: 'Play_DJ_TSopen',
          magnet: 'Play_DJ_CT_fashe', ufo: 'Play_DJ_FD_fashe', ink: 'Play_DJ_ZY_atk', lightning: 'Play_DJ_shandian_hit' }[e.item];
        if (snd) play(snd, e.item === 'lightning' || e.item === 'ink' ? Math.max(near, 0.5) : near);
        if (mine) V.slotPop[e.slot] = -0.3;
        if (mine && e.target != null && (e.item === 'missile' || e.item === 'magnet')) { lockChirp(); V.aim = { target: e.target, t: 0, item: e.item }; }
        if (e.target === me.id && (e.item === 'missile' || e.item === 'ufo')) { play('Play_DJ_jingbao', 1); V.warnT = 0; }
        if (mine && e.item !== 'nitro') V.popup = { id: e.item, t: 0, use: true };
        // giá phóng tên lửa dựng bên hông xe (props_item_missileshelf_appear) rồi thu lại
        if (k && e.item === 'missile') attachTemp(k, 'missile_shelf', 1, 1.2, ['appear']);
        // Mực: con mực phóng lên từ xe người dùng (clip Attack)
        if (k && e.item === 'ink') attachTemp(k, 'squid', 1, clipLen('squid', ['attack']), ['attack']);
        break;
      }
      case 'item_hit': {
        if (e.item === 'banana') { play('Play_DJ_XJP_hit', near); if (o) emit('banana_hit', o.src); }
        if (e.item === 'lightning' && k) {
          // Sấm Sét (icon ID_PropsItem_Lightning là mây giông): mây Wuyun hiện trên xe trúng (clip Attack lớn dần, chớp
          // FX_Props_Flash), sét giáng (props_item_flash_hited), tia điện quanh xe lúc bị co (props_item_flash_idle)
          attachTemp(k, 'cloud', 1, clipLen('cloud', ['attack', 'disappear']), ['attack', 'disappear']);
          emit('cloud_flash', o.src);
          emit('lightning', o.src, { skip: ['FX_Mainflash'] });
          emit('lightning_idle', o.src, { dur: TD.ITEMS.lightning.slowT, mul: 0.8 });
          bolt(k);
          o.shrinkT = TD.ITEMS.lightning.slowT;
        }
        if (e.item === 'ink' && k) {
          // Mực rơi xuống xe trúng (Appear), phun (Hited, kèm FX_mz-Cost), bay đi (Disappear)
          attachTemp(k, 'squid', 1, clipLen('squid', ['appear', 'hited', 'disappear']), ['appear', 'hited', 'disappear']);
          setTimeout(() => { if (V.root) emit('squid_hit', o.src); }, TD.ITEM_ART.models.squid.clips.appear.dur * 1000 / (TD.main.timeScale || 1));
        }
        if (e.item === 'tornado' && k) {
          play('Play_DJ_wind_up', near);
          attachTemp(k, 'tornado_hit', 1, TD.ITEMS.tornado.stun + 0.5, null, { fx: true, fadeOut: 0.5 });
        }
        if (e.item === 'missile' && o) emit('missile_hit', o.src, { mul: 0.8 });
        if (mine) {
          V.popup = { id: e.item, t: 0 };
          if (e.item === 'ink') V.ink = makeInk();
          if (e.item === 'lightning') TD.main.flash = 1;
          TD.cam.kick(e.item === 'missile' ? 0.6 : 0.3);
        }
        break;
      }
      case 'item_block':
        play('Play_DJ_hudunjisui', near);
        if (o && o.angel) act(o.angel, ['hited', 'idle']);
        else if (k) emit('shield', o.src, { only: ['FX_ks', 'FX_light'] });   // chớp vỡ khiên (props_item_shield_appear)
        if (mine) TD.hud.say('Lá Chắn thật đúng lúc!');   // 238a395c "Nguy hiểm thật! Lá Chắn thật đúng lúc!"
        break;
      case 'item_boom':
        play('Play_DJ_ddbao', mine ? 1 : Math.max(0, 1 - Math.hypot(e.x - me.x, e.z - me.z) / 90));
        emit('missile_hit', { x: e.x, y: e.y - 0.7, z: e.z, yaw: 0 }, { mul: 0.8 });
        break;
    }
  }
  // sét: tia dọc từ trời (FX_ani_05101 4×1, lớp FX_Mainflash kéo dài theo vận tốc nên dựng bằng chồng hạt)
  function bolt(k) {
    const L = layerByTex('lightning', '05101');
    if (L) for (let i = 0; i < 5; i++) spawn(L, k.x, k.y + 1 + i * 2.2, k.z, { size: 4.5, life: 0.35, spd: 0, anim: false });
  }

  // ---------- màn người chơi: mực, sương, cảnh báo, vòng ngắm, ô đạo cụ ----------
  function makeInk() {
    const blobs = [];
    for (let i = 0; i < 6; i++) {
      blobs.push({ x: 0.12 + Math.random() * 0.76, y: 0.12 + Math.random() * 0.6, r: 0.07 + Math.random() * 0.08,
        d: Array.from({ length: 12 }, () => 0.75 + Math.random() * 0.5), drops: Array.from({ length: 4 }, () => [Math.random() * 6.3, 1.3 + Math.random() * 0.9, 0.1 + Math.random() * 0.15]) });
    }
    return blobs;
  }
  // Vết mực: mép cong mềm (nối trung điểm bằng đường cong bậc hai), lõi đặc, rìa loang, vài giọt bắn quanh.
  function drawInk(g, w, h, a) {
    g.save(); g.globalAlpha = a;
    for (const b of V.ink) {
      const cx = b.x * w, cy = b.y * h, r = b.r * h * 1.6, n = b.d.length;
      const P = b.d.map((d, i) => { const an = (i / n) * Math.PI * 2; return [cx + Math.cos(an) * r * d, cy + Math.sin(an) * r * d]; });
      const gr = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.25);
      gr.addColorStop(0, 'rgba(14,6,26,0.97)'); gr.addColorStop(0.75, 'rgba(22,10,40,0.9)'); gr.addColorStop(1, 'rgba(30,14,52,0.15)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
      for (let i = 0; i < n; i++) { const qq = P[i], nx = P[(i + 1) % n]; g.quadraticCurveTo(qq[0], qq[1], (qq[0] + nx[0]) / 2, (qq[1] + nx[1]) / 2); }
      g.fill();
      g.fillStyle = 'rgba(16,8,30,0.92)';
      for (const [an, dist, rr2] of b.drops) { g.beginPath(); g.arc(cx + Math.cos(an) * r * dist, cy + Math.sin(an) * r * dist, r * rr2, 0, 7); g.fill(); }
    }
    g.restore();
  }
  // Vị trí hai ô: nút PropsSlot_0/1 trong PropParent của bố cục cảm ứng gốc. PropParent (và cả bố cục trên máy tính) để tắt
  // như hud.js đặt, chỉ bật tạm để đo; hình ô do drawSlots vẽ để máy tính và cảm ứng giống nhau.
  function slotRects(hud) {
    const base = hud.touch && TD.save.d.settings.hand === 'twoside' ? C2 : C1;
    const ns = [hud.q(base.split('/')[0]), hud.q(base)], was = ns.map((n) => n && n.off);
    ns.forEach((n) => { if (n) n.off = false; });
    const out = [0, 1].map((i) => hud.inst.rectOf(base + '/PropsSlot_' + i + '/PropsSlot_' + i, hud.w, hud.h));
    ns.forEach((n, i) => { if (n) n.off = was[i]; });
    return out;
  }
  function drawSlots(g, hud, st) {
    const rs = slotRects(hud);
    V.slotRects = []; V.iconsDrawn = 0;
    rs.forEach((r, i) => {
      if (!r) return;
      const pop = V.slotPop[i] || 0, s = 1 + Math.max(0, pop) * 0.6 - Math.max(0, -pop) * 0.4;
      const w = Math.max(44, r.w) * s, R = { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - w / 2, w, h: w };
      V.slotRects.push({ x: Math.round(R.x), y: Math.round(R.y), w: Math.round(w), h: Math.round(w) });
      const id = st.slots[i];
      g.save();
      g.globalAlpha = id ? 1 : 0.55;
      TD.ugui.drawFrame(g, 'Icon_PropsBG', R);
      g.globalAlpha = 1;
      if (id) {
        const im = img(iconOf(id));
        if (im.complete && im.naturalWidth) { const p = w * 0.1; g.drawImage(im, R.x + p, R.y + p, w - 2 * p, w - 2 * p); V.iconsDrawn++; }
      }
      if (!hud.touch) {
        g.font = '700 ' + Math.round(w * 0.24) + 'px skui_CafetaBold, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = '#0a1a33'; g.fillStyle = '#ffe36a';
        g.strokeText(KEYS[i], R.x + w * 0.84, R.y + w * 0.86); g.fillText(KEYS[i], R.x + w * 0.84, R.y + w * 0.86);
      }
      g.restore();
    });
    if (V.fullT > 0 && rs[0]) {
      g.save(); g.font = '700 ' + Math.round(hud.h * 0.03) + 'px skui_CafetaBold, sans-serif'; g.textAlign = 'center';
      g.globalAlpha = Math.min(1, V.fullT * 2); g.lineWidth = 3; g.strokeStyle = '#401010'; g.fillStyle = '#fff';
      const x = (rs[0].x + (rs[1] || rs[0]).x + rs[0].w) / 2, y = rs[0].y - 8;
      g.strokeText('Đạo cụ đã đầy', x, y); g.fillText('Đạo cụ đã đầy', x, y);   // 3204b103
      g.restore();
    }
  }
  function drawWarn(g, hud, R, me) {
    const m = R.items.proj.find((p) => p.target === me.id && (p.type === 'missile' || p.phase === 'fly'));
    if (!m) { V.warnT = -1; return; }
    V.warnT = (V.warnT < 0 ? 0 : V.warnT) + V.dt;
    // bíp dồn dần khi tên lửa tới gần (chu kỳ 0,45 s ở 120 m xuống 0,08 s sát xe)
    if (m.type === 'missile') {
      const d = Math.hypot(m.x - me.x, m.z - me.z), per = Math.max(0.08, Math.min(0.45, d / 260));
      if ((V.beepT = (V.beepT || 0) - V.dt) <= 0) { beep(1800, 0.05, 0.1); V.beepT = per; }
    }
    const u = hud.h / 720, w = 380 * u, h = 58 * u, x = hud.w / 2 - w / 2, y = hud.h * 0.2, blink = 0.6 + 0.4 * Math.abs(Math.sin(V.warnT * 8));
    g.save();
    // viền đỏ nhấp nháy quanh màn
    const gr = g.createRadialGradient(hud.w / 2, hud.h / 2, hud.h * 0.45, hud.w / 2, hud.h / 2, hud.w * 0.7);
    gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, 'rgba(255,20,20,' + (0.35 * blink) + ')');
    g.fillStyle = gr; g.fillRect(0, 0, hud.w, hud.h);
    g.globalAlpha = blink;
    const lg = g.createLinearGradient(x, 0, x + w, 0);
    lg.addColorStop(0, 'rgba(160,0,0,0)'); lg.addColorStop(0.2, 'rgba(200,20,20,0.85)'); lg.addColorStop(0.8, 'rgba(200,20,20,0.85)'); lg.addColorStop(1, 'rgba(160,0,0,0)');
    g.fillStyle = lg; g.fillRect(x, y, w, h);
    const ic = img(iconOf(m.type));
    if (ic.complete && ic.naturalWidth) g.drawImage(ic, x + w * 0.16 - h * 0.6, y - h * 0.15, h * 1.3, h * 1.3);
    g.font = 'italic 700 ' + Math.round(24 * u) + 'px skui_CafetaBold, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = '#4a0000'; g.fillStyle = '#fff';
    const s = m.type === 'missile' ? 'Tên Lửa đang khóa bạn!' : 'Đĩa Bay đang bay tới!';   // chọn: bản gốc không có chuỗi cảnh báo trong Localization
    g.strokeText(s, x + w * 0.27, y + h / 2); g.fillText(s, x + w * 0.27, y + h / 2);
    g.restore();
  }
  // Vòng ngắm đỏ trên xe bị mình khoá (props_item_aiming_red -> UIFX_Props_Aiming_Red_A): hai lưới gốc nướng thành ảnh
  // (aim_0 vòng đứt, aim_1 bốn mũi nhọn). src: DOTween cỡ 77,6 → 1 trong 0,2 s (vòng sập vào mục tiêu); lớp mũi nhọn cuộn V
  // 0,06 trong 0,33 s lặp nên nhịp ra vào. Cỡ cuối 5,38 × cha 20 = 108 đơn vị UI (màn cao 720).
  const pj = new THREE.Vector3();
  function drawAim(g, hud, R) {
    const me = V.ctx.me, I = R.items;
    let tgt = null;
    const mm = I.proj.find((p) => p.by === me.id && p.type === 'missile' && p.target != null);
    if (mm) tgt = mm.target;
    else if (I.ks[me.id].magnet && I.ks[me.id].magnet.target != null) tgt = I.ks[me.id].magnet.target;
    if (tgt == null) { V.aim = null; V.aimDrawn = null; return; }
    if (!V.aim || V.aim.target !== tgt) V.aim = { target: tgt, t: 0 };
    V.aim.t += V.dt;
    const k = R.karts[tgt];
    pj.set(k.x, k.y + 0.8, k.z).project(V.ctx.M.camera);
    if (pj.z > 1) { V.aimDrawn = null; return; }
    const sx = (pj.x + 1) / 2 * hud.w, sy = (1 - pj.y) / 2 * hud.h, u = hud.h / 720;
    const e = Math.min(1, V.aim.t / 0.2), size = 108 * u * (1 + (1 - e) * (1 - e) * 5);   // chọn: thu từ 6× (77× gốc tràn quá màn) về 1×
    const ring = img(TD.ITEM_ART.icons.aim_0), tips = img(TD.ITEM_ART.icons.aim_1);
    g.save();
    g.globalAlpha = Math.min(1, e * 1.5);
    if (ring.complete && ring.naturalWidth) g.drawImage(ring, sx - size / 2, sy - size / 2, size, size);
    const p = size * (1 + 0.12 * Math.abs(Math.sin(V.aim.t * Math.PI / 0.33)));
    if (tips.complete && tips.naturalWidth) g.drawImage(tips, sx - p / 2, sy - p / 2, p, p);
    g.restore();
    V.aimDrawn = { x: Math.round(sx), y: Math.round(sy), size: Math.round(size), target: tgt };
  }
  // Icon đạo cụ vừa dùng / vừa trúng phải trong vòng tròn sáng (clip b9IIano2xqU t=410), góc trên giữa-trái.
  function drawPopup(g, hud) {
    const P = V.popup;
    if (!P) return;
    P.t += V.dt;
    if (P.t > 1.6) { V.popup = null; return; }
    const u = hud.h / 720, s = 120 * u * (P.t < 0.15 ? 0.6 + P.t / 0.15 * 0.4 : 1), x = hud.w * 0.3, y = hud.h * 0.12, a = Math.min(1, (1.6 - P.t) / 0.3);
    g.save(); g.globalAlpha = a;
    const ring = img(TD.ITEM_ART.icons[P.use ? 'boomb2' : 'hint']);
    g.beginPath(); g.arc(x, y + s / 2, s * 0.46, 0, 7); g.fillStyle = P.use ? 'rgba(20,60,120,0.75)' : 'rgba(120,30,10,0.75)'; g.fill();
    if (ring.complete && ring.naturalWidth) g.drawImage(ring, x - s / 2, y, s, s);
    const ic = img(iconOf(P.id));
    if (ic.complete && ic.naturalWidth) g.drawImage(ic, x - s * 0.36, y + s * 0.14, s * 0.72, s * 0.72);
    g.restore();
  }

  // ---------- plugin ----------
  function reset() {
    for (const k in batches) delete batches[k];
    objs.clear(); onKart.clear(); rigs.clear(); tweens.clear();
    ems.length = 0; dying.length = 0;
  }
  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push({
    start(ctx) {
      V.ctx = null;
      if (!ctx.R.items) return;
      V.ctx = ctx; V.root = new THREE.Group(); ctx.root.add(V.root);
      V.seen = {}; V.played = {}; V.emitted = {}; V.synth = 0; V.slotPop = [0, 0]; V.popup = null; V.ink = null; V.warnT = -1; V.fullT = 0; V.t = 0; V.aim = null;
      reset();
      buildBoxes(ctx.R.items);
      for (const id in TD.ITEMS) img(iconOf(id));
      for (const k of ['boomb2', 'hint', 'aim_0', 'aim_1']) img(TD.ITEM_ART.icons[k]);
      // chấm hộp trên bản đồ nhỏ: vẽ thẳng vào ảnh nền minimap (HUD vẽ chấm xe đè lên sau)
      const mm = TD.hud.mm;
      if (mm) {
        const g = mm.c.getContext('2d');
        g.fillStyle = '#35e0ff'; g.strokeStyle = '#0a2a40'; g.lineWidth = 1.5;
        for (const row of ctx.R.items.rows) { const p = mm.map(row[Math.floor(row.length / 2)].x, row[Math.floor(row.length / 2)].z); g.beginPath(); g.rect(p[0] - 4, p[1] - 4, 8, 8); g.fill(); g.stroke(); }
      }
      // Khu Luyện Tập Đạo Cụ: vào trận đã có sẵn hai đạo cụ để tập
      if (ctx.R.mode.practice === 'items') { TD.Items.give(ctx.R, ctx.me, 'missile'); TD.Items.give(ctx.R, ctx.me, 'shield'); }
    },
    update(dt, ctx) {
      if (V.ctx !== ctx || !ctx.R.items) return;
      const R = ctx.R, I = R.items, me = ctx.me;
      const sdt = dt * (TD.main.timeScale || 1);
      V.dt = sdt; V.t += sdt;
      if (TD.input.take('item')) TD.Items.use(R, me, 0);
      if (TD.input.take('item2')) TD.Items.use(R, me, 1);
      updateBoxes(I, V.t);
      kartFx(I, ctx.M.views, sdt, V.t);
      updateObjects(I, sdt, V.t);
      updateRigs(sdt);
      for (const g of tweens) stepTween(g);
      stepEmitters(sdt);
      stepParticles(sdt, ctx.M.camera);
      for (let i = 0; i < 2; i++) if (V.slotPop[i]) V.slotPop[i] = V.slotPop[i] > 0 ? Math.max(0, V.slotPop[i] - sdt) : Math.min(0, V.slotPop[i] + sdt);
      if (V.fullT > 0) V.fullT -= sdt;
    },
    event(e, mine, ctx) { if (V.ctx === ctx && ctx.R.items && e.type.startsWith('item')) onEvent(e, mine, ctx); },
    rects(hud) {
      if (!V.ctx || !V.ctx.R.items) return [];
      return slotRects(hud).map((r, i) => {
        if (!r) return null;
        const w = Math.max(48, r.w), h = Math.max(48, r.h);
        return { id: i ? 'item2' : 'item', x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
      }).filter(Boolean);
    },
    draw(g, hud) {
      if (!V.ctx || !V.ctx.R.items) return;
      const R = V.ctx.R, me = V.ctx.me, st = R.items.ks[me.id];
      if (st.inkT > 0 && V.ink) drawInk(g, hud.w, hud.h, Math.min(0.92, st.inkT / 1.2));
      if (st.fogT > 0) {
        const a = Math.min(0.94, st.fogT / 1.0), gr = g.createRadialGradient(hud.w / 2, hud.h * 0.55, hud.h * 0.05, hud.w / 2, hud.h * 0.55, hud.w * 0.65);
        gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(235,240,245,' + (a * 0.8) + ')');
        g.fillStyle = gr; g.fillRect(0, 0, hud.w, hud.h);
      }
      drawAim(g, hud, R);
      drawWarn(g, hud, R, me);
      drawPopup(g, hud);
      drawSlots(g, hud, st);
    },
    settle(F, ctx) {
      if (!ctx.R.items) return;
      const s = ctx.R.items.ks[ctx.me.id].score;
      // "Đánh giá tấn công / phòng thủ / trợ giúp" như màn kết thúc đua đạo cụ gốc (clip b9IIano2xqU t=287)
      F.cards.push(`<div class="fin-card"><h4>Đạo Cụ</h4><div class="fin-gain">${s.attack + s.defend + s.support}</div>` +
        `<small>Đánh giá tấn công <b>${s.attack}</b> · phòng thủ <b>${s.defend}</b> · trợ giúp <b>${s.support}</b></small></div>`);
    },
    end() {
      if (V.root && V.root.parent) V.root.parent.remove(V.root);
      V.root = null; V.ctx = null; V.boxes = null;
      reset();
    },
  });

  // Cho bài kiểm: vị trí ô trên HUD, số icon vừa vẽ, số vật thể đạo cụ đang vẽ, đếm sự kiện đã thấy, clip đang chạy của từng
  // mô hình có xương (model:clip), số lần mỗi clip được bật, số nguồn hạt đã phát theo prefab, số hạt đang vẽ, vòng ngắm.
  V.debug = () => ({ slots: V.slotRects, icons: V.iconsDrawn, objects: V.objects, boxes: V.boxes ? V.boxes.list.length : 0, seen: V.seen,
    rigs: [...rigs].map((g) => g.userData.model + ':' + g.rig.name), clips: [...rigs].map((g) => g.userData.model + ':' + Object.keys(g.rig.clips).join('/')),
    played: V.played, emitted: V.emitted, particles: V.particles || 0, tweens: tweens.size, aim: V.aimDrawn || null, synth: V.synth });
  TD.itemsView = V;
})(globalThis.TD = globalThis.TD || {});
