// Vẽ đạo cụ (plugin trận, chỉ chạy khi R.items): hộp "?" nổi xoay, tên lửa/đĩa bay/vỏ chuối/lốc xoáy/mây, khiên quanh xe,
// hiệu ứng trúng (xe xoay, lộn, bị hút lên, co lại), sấm sét, mực và sương che màn của người chơi, cảnh báo bị khoá,
// hai ô đạo cụ trên HUD (PropParent gốc của bố cục cảm ứng; trên máy tính vẽ cùng chỗ kèm phím E/Q), chấm hộp trên bản đồ nhỏ,
// tiếng mượn (data/items.js) và thẻ "Đánh giá" ở màn thưởng. Mô hình, icon, texture hạt: tools/export_items.py → art/items.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const V = { ctx: null, root: null, ok: false, seen: {}, icons: {}, slotRects: [], iconsDrawn: 0, objects: 0 };
  const REV = () => '?v=' + (TD.REV || '');
  const C1 = 'OperatingMode_OneSide/KeysRoot/AnchorRightDown/Offset/PropParent';
  const C2 = 'OperatingMode_TwoSide/AnchorRightDown/Offset/RightPropParent';
  const BOX_W = 1.5;      // chọn: cạnh hộp ~1,5 m (clip b9IIano2xqU t=206: 6 hộp kín bề ngang đường ~16 m)
  const KEYS = ['E', 'Q'];

  // ---------- tải tài nguyên ----------
  const glbCache = {}, texCache = {};
  function glb(name) {
    const a = TD.ITEM_ART && TD.ITEM_ART.models[name];
    if (!a) return Promise.reject(new Error('item model not found: ' + name));
    if (!glbCache[name]) {
      glbCache[name] = fetch(a.glb + REV()).then((r) => { if (!r.ok) throw new Error(a.glb + ' http ' + r.status); return r.arrayBuffer(); })
        .then((buf) => new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, rej)))
        .then((g) => { g.scene.traverse((o) => { if (o.isMesh) o.material = material(o.material); }); return g.scene; });
    }
    return glbCache[name];
  }
  // Vật liệu theo extras.kind của bộ xuất: shader gốc là shader riêng (Hang_Diffuse, CubeTransparent, TransparentCommon...).
  function material(m) {
    const k = (m.userData && m.userData.kind) || 'opaque', map = m.map;
    if (k === 'matcap') return new THREE.MeshMatcapMaterial({ matcap: map, transparent: true, opacity: 0.5, depthWrite: false });   // chọn: vỏ kính trong để thấy mặt dấu hỏi bên trong
    if (k === 'opaque') return new THREE.MeshLambertMaterial({ map, emissive: 0x404040, emissiveMap: map });
    if (map) map.encoding = THREE.LinearEncoding;
    return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: k === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: k === 'add' ? 0.9 : 1 });
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
  // Bản sao một glb đã nạp, chỉnh cỡ: s = hệ số, kèm vào cha. Trả Group (mô hình nạp xong thì tự thêm vào).
  function inst(name, s, parent) {
    const g = new THREE.Group();
    glb(name).then((sc) => { const c = sc.clone(); c.scale.setScalar(s); g.add(c); }).catch((e) => TD.warnOnce('itemglb' + name, String(e)));
    if (parent) parent.add(g);
    return g;
  }

  // ---------- hạt (lô THREE.Points như js/view/fx.js, tham số lớp hạt gốc từ TD.ITEM_FX) ----------
  const PVS = `attribute vec4 pcol; attribute float psize; attribute float prot; attribute float pframe;
    uniform float uScale; varying vec4 vCol; varying float vRot; varying float vFrame;
    void main() { vCol = pcol; vRot = prot; vFrame = pframe; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv; gl_PointSize = psize * uScale / max(0.1, -mv.z); }`;
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
    const N = 400, g = new THREE.BufferGeometry();
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
  // Một hạt: o = { size, life, vel: [x,y,z], tint, frame, anim, rot }.
  function spawn(L, x, y, z, o) {
    const sh = L.sheet || { cols: 1, rows: 1 }, b = batch(L.tex, L.blend || 'add', sh.cols || 1, sh.rows || 1);
    if (b.ps.length >= b.N) b.ps.shift();
    const k = L.k || 1, sp = rr(L.speed, 0) * k * (o.spd == null ? 0.25 : o.spd);
    const th = Math.random() * 6.283, up = Math.random();
    b.ps.push({ x, y, z, vx: Math.cos(th) * sp + (o.vel ? o.vel[0] : 0), vy: up * sp * 0.6 + (o.vel ? o.vel[1] : 0), vz: Math.sin(th) * sp + (o.vel ? o.vel[2] : 0),
      age: 0, life: o.life || rr(L.life, 0.6), size: (o.size || rr(L.size, 1) * k), rot: rr(L.rot, 0), sol: L.sizeOverLife, col: L.color,
      c0: L.startColor || [1, 1, 1, 1], tint: o.tint || L.tint || [1, 1, 1, 1], frames: (sh.cols || 1) * (sh.rows || 1),
      anim: o.anim != null ? o.anim : !!L.sheet, f0: Math.floor(Math.random() * (sh.cols || 1) * (sh.rows || 1)), g: L.gravity || 0 });
  }
  // Nổ theo prefab gốc: mỗi lớp hạt bắn số hạt của burst đầu (tối đa 12), cỡ nhân mul.
  function burst(role, x, y, z, mul, skip) {
    const F = TD.ITEM_FX && TD.ITEM_FX[role];
    if (!F || !V.root) return;
    F.layers.forEach((L, i) => {
      if (L.kind !== 'ps' || L.active === false || (skip && skip.includes(i))) return;
      const b0 = L.emit && L.emit.burst && L.emit.burst[0], n = Math.min(12, b0 ? Math.max(1, b0.n[1]) : Math.ceil((L.emit ? L.emit.rate : 4) * 0.3) || 1);
      for (let j = 0; j < n; j++) spawn(L, x, y, z, { size: rr(L.size, 1) * (L.k || 1) * (mul || 1), spd: 0.4 });
    });
  }
  function stepParticles(dt, camera) {
    const sc = TD.main.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const key in batches) {
      const b = batches[key], P = b.g.attributes;
      b.m.uniforms.uScale.value = sc;
      let n = 0;
      b.ps = b.ps.filter((p) => (p.age += dt) < p.life);
      for (const p of b.ps) {
        p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const t = p.age / p.life, c = grad(p.col, t);
        P.position.array.set([p.x, p.y, p.z], n * 3);
        P.pcol.array.set([c[0] * p.c0[0] * p.tint[0] * 1.5, c[1] * p.c0[1] * p.tint[1] * 1.5, c[2] * p.c0[2] * p.tint[2] * 1.5, c[3] * p.c0[3] * (p.tint[3] || 1)], n * 4);
        const sol = p.sol ? p.sol[Math.min(p.sol.length - 1, Math.floor(t * p.sol.length))] : 1;
        P.psize.array[n] = p.size * sol; P.prot.array[n] = p.rot; P.pframe.array[n] = p.anim ? Math.min(p.frames - 1, Math.floor(t * p.frames)) : p.f0;
        n++;
      }
      b.g.setDrawRange(0, n);
      for (const a in P) P[a].needsUpdate = true;
    }
  }
  const layer = (role, i) => { const F = TD.ITEM_FX && TD.ITEM_FX[role]; return F && F.layers[i]; };
  const layerByTex = (role, part) => { const F = TD.ITEM_FX && TD.ITEM_FX[role]; return F && F.layers.find((L) => L.tex.includes(part)); };

  // ---------- hộp: hai InstancedMesh (vỏ kính + mặt dấu hỏi), nổi lên xuống, xoay ----------
  function buildBoxes(I) {
    const n = I.boxes.length, M = TD.ITEM_ART.models.box, s = BOX_W / M.size[0], cy = -(M.min[1] + M.size[1] / 2) * s;
    V.boxes = { list: [], s, cy };
    glb('box').then((sc) => {
      if (!V.root) return;
      sc.updateMatrixWorld(true);
      sc.traverse((o) => {
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

  // ---------- vật thể đạo cụ: một Group cho mỗi tên lửa / đĩa bay / vật trên đường, dọn khi sim bỏ ----------
  const objs = new Map();
  function objFor(x) {
    let o = objs.get(x.id);
    if (o) return o;
    const g = new THREE.Group();
    V.root.add(g);
    o = { g, type: x.type, t: 0 };
    if (x.type === 'missile') o.m = inst('missile', 1.8, g);
    else if (x.type === 'ufo') {
      o.m = inst('ufo', 1.6, g);
      // tia chiếu (FX_Light_08012 của prefab UFO) và vòng khoá đỏ dưới nạn nhân
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.2, 3.2, 20, 1, true),
        new THREE.MeshBasicMaterial({ map: tex('art/items/fx/fx_light_08012_1.webp'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0x88ccff }));
      beam.position.y = -1.6; beam.visible = false; g.add(beam); o.beam = beam;
      o.ring = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: tex('art/items/fx/fx_other_05009_1.webp'), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, color: 0xff3030 }));
      o.ring.rotation.x = -Math.PI / 2; V.root.add(o.ring);
    } else if (x.type === 'banana') o.m = inst('banana', 0.42, g);
    else if (x.type === 'cloud') o.m = inst('cloud', 1.1, g);
    else if (x.type === 'tornado') {
      // phễu lốc: vòng xoáy gốc (FX_Props_Item_Tornado_idle_01) chồng 7 tầng nở dần lên trên, mỗi tầng quay một tốc độ
      o.rings = [];
      // vòng gốc nằm ở y 1,43 m của prefab: hạ về đáy rồi xếp mỗi tầng cao thêm 0,9 m
      for (let i = 0; i < 7; i++) { const sc = 1 + i * 0.55, r = inst('tornado', sc, g); r.position.y = -1.43 * sc + 0.2 + i * 0.9; o.rings.push(r); }
    }
    objs.set(x.id, o);
    return o;
  }
  function updateObjects(I, dt, t) {
    const live = new Set();
    for (const m of I.proj) {
      live.add(m.id);
      const o = objFor(m);
      o.g.position.set(m.x, m.y, m.z);
      if (m.type === 'missile') {
        o.g.lookAt(m.x + m.vx, m.y + m.vy, m.z + m.vz);
        // khói và lửa đuôi (lớp hạt của prefab props_item_missile)
        if ((o.t += dt) > 0.03 && m.t > 0.12) {   // 0,12 s đầu tên lửa còn sát camera: chưa nhả khói
          o.t = 0;
          const tail = [m.x - m.vx * 1.1, m.y - m.vy * 1.1, m.z - m.vz * 1.1], L1 = layerByTex('missile_trail', 'smoke'), L2 = layerByTex('missile_trail', 'glow_00004');
          if (L1) spawn(L1, ...tail, { size: 0.8, life: 0.5, spd: 0, tint: [1, 1, 1, 0.5] });
          if (L2) spawn(L2, ...tail, { size: 0.9, life: 0.1, spd: 0, tint: [1, 0.6, 0.3, 1] });
        }
      } else if (m.type === 'ufo') {
        o.g.rotation.y = t * 2.5;
        o.beam.visible = m.phase === 'hover'; o.beam.material.opacity = 0.6 + Math.sin(t * 20) * 0.25;
        const tg = TD.main.race.karts[m.target];
        o.ring.visible = m.phase === 'fly' && !!tg;
        if (tg) { o.ring.position.set(tg.x, tg.y + 0.15, tg.z); o.ring.rotation.z = t * 3; const s = 1 + Math.sin(t * 10) * 0.08; o.ring.scale.set(s, s, s); }
      }
    }
    for (const z of I.hz) {
      live.add(z.id);
      const o = objFor(z), it = TD.ITEMS[z.type];
      o.g.position.set(z.x, z.y, z.z);
      const fade = Math.min(1, z.t / 0.25, (z.life - z.t) / 0.4);
      if (z.type === 'banana') { o.g.position.y += 0.05; o.g.scale.setScalar(Math.max(0.01, fade)); }
      else if (z.type === 'cloud') {
        o.g.position.y += 0.4 + Math.sin(t * 1.5) * 0.15; o.g.rotation.y = t * 0.3; o.g.scale.setScalar(Math.max(0.01, fade));
        if ((o.t += dt) > 0.12) { o.t = 0; const L = layer('cloud_flash', 0); if (L) spawn(L, z.x + (Math.random() - 0.5) * 3, z.y + 2.2, z.z + (Math.random() - 0.5) * 2, { size: 2.2, life: 0.25, spd: 0 }); }
      } else if (z.type === 'tornado') {
        o.g.scale.set(fade, Math.max(0.01, fade), fade);
        o.rings.forEach((r, i) => { r.rotation.y = t * (5 + i * 1.3) * (i % 2 ? -1 : 1); r.position.x = Math.sin(t * 2 + i * 0.6) * 0.25 * i; });
        o.g.scale.multiplyScalar(it.r / 5);
        // khói xoáy quanh phễu (khói của prefab tên lửa, nhuộm xám xanh): vòng gốc mảnh, nền trời sáng khó thấy
        const L = layerByTex('missile_trail', 'smoke');
        if (L && (o.t += dt) > 0.04) {
          o.t = 0;
          const h = Math.random() * 6.5, a = Math.random() * 6.283, r = (0.6 + h * 0.45) * it.r / 5 * fade;
          spawn(L, z.x + Math.cos(a) * r, z.y + h, z.z + Math.sin(a) * r, { size: 1.6 + h * 0.3, life: 0.7, spd: 0, tint: [0.78, 0.84, 0.95, 0.7], vel: [-Math.sin(a) * 6, 1.5, Math.cos(a) * 6] });
        }
      }
    }
    for (const [id, o] of objs) if (!live.has(id)) { V.root.remove(o.g); if (o.ring) V.root.remove(o.ring); objs.delete(id); }
    V.objects = objs.size;
  }

  // ---------- trên xe: khiên, thiên sứ, mực bay tới, hiệu ứng trúng ----------
  const onKart = new Map();
  function kartFx(I, views, dt, t) {
    for (const v of views) {
      const k = v.kart, st = I.ks[k.id];
      let o = onKart.get(k.id);
      if (!o) {
        o = { g: new THREE.Group(), shield: null, angel: null, squidT: 0, shrinkT: 0 };
        V.root.add(o.g); onKart.set(k.id, o);
      }
      o.g.position.set(k.x, k.y, k.z);
      o.g.rotation.y = k.yaw;
      if (st.shieldT > 0 && !o.shield) { o.shield = inst('shield', 0.55, o.g); o.shield.position.y = 0.35; }
      if (o.shield) {
        o.shield.visible = st.shieldT > 0;
        o.shield.rotation.y = -k.yaw + t * 0.8;
        const blink = st.shieldT < 1.5 ? 0.5 + 0.5 * Math.sin(t * 20) : 1;
        o.shield.scale.setScalar(Math.min(1, (TD.ITEMS[st.shieldKind === 'angel' ? 'angel' : 'shield'].dur - st.shieldT) * 4 + 0.2) * blink);
      }
      if (st.shieldKind === 'angel' && st.shieldT > 0 && !o.angel) { o.angel = inst('angel', 0.6, o.g); }
      if (o.angel) { o.angel.visible = st.shieldKind === 'angel' && st.shieldT > 0; o.angel.position.set(0, 0.6 + Math.sin(t * 3) * 0.15, -0.6); }
      if (o.squidT > 0) {
        o.squidT -= dt;
        if (!o.squid) o.squid = inst('squid', 1.2, o.g);
        o.squid.visible = true; o.squid.position.set(0, 2.2 + o.squidT, 1.5); o.squid.rotation.y = t * 4;
      } else if (o.squid) o.squid.visible = false;
      // hiệu ứng trúng chỉ là hình: kartView.update đã đặt lại root mỗi khung, ở đây cộng thêm sau đó
      const f = k.fx, ufo = I.proj.find((m) => m.type === 'ufo' && m.target === k.id && m.phase === 'hover');
      if (f.stunT > 0 && (f.kind === 'spin' || f.kind === 'tornado')) v.root.rotation.y += f.stunT * (f.kind === 'tornado' ? 16 : 9);
      if (f.stunT > 0 && f.kind === 'flip') v.pivot.rotation.x -= (1 - f.stunT / TD.ITEMS.missile.stun) * Math.PI * 2;
      if (f.stunT > 0 && f.kind === 'tornado') v.root.position.y += Math.sin((1 - f.stunT / TD.ITEMS.tornado.stun) * Math.PI) * 2.5;
      if (ufo) { v.root.position.y += 1.0 + Math.sin(t * 4) * 0.2; v.root.rotation.y += Math.sin(t * 3) * 0.3; }
      if (o.shrinkT > 0) o.shrinkT -= dt;
      v.root.scale.setScalar(o.shrinkT > 0 ? 0.55 + 0.45 * Math.max(0, 1 - o.shrinkT / 0.3) : 1);   // Sấm Sét: xe co lại, 0,3 s cuối nở về
      // nam châm: chuỗi vòng sáng (FX_Glow_07004 của prefab magnet) chạy từ mục tiêu về xe hút
      if (st.magnet && st.magnet.target != null && (o.mt = (o.mt || 0) + dt) > 0.05) {
        o.mt = 0;
        const tg = TD.main.race.karts[st.magnet.target], L = layer('magnet', 1);
        if (L && tg) for (let i = 0; i < 2; i++) {
          const a = Math.random();
          spawn(L, k.x + (tg.x - k.x) * a, k.y + 0.8 + (tg.y - k.y) * a, k.z + (tg.z - k.z) * a, { size: 1.6, life: 0.3, spd: 0, tint: [1, 0.35, 0.35, 1] });
        }
      }
    }
  }

  // ---------- sự kiện ----------
  function play(ev, near, opt) { if (near > 0.02) TD.audio.play(ev, Object.assign({ vol: near }, opt || {})); }
  function onEvent(e, mine, ctx) {
    const R = ctx.R, me = ctx.me, k = e.kart != null ? R.karts[e.kart] : null;
    V.seen[e.type] = (V.seen[e.type] || 0) + 1;
    const near = mine ? 1 : k ? Math.max(0, 1 - Math.hypot(k.x - me.x, k.z - me.z) / 80) : 0;
    const o = k && onKart.get(k.id);
    switch (e.type) {
      case 'item_get':
        if (mine) { play('Play_DJ_shiqu_ty', 1); V.slotPop[e.slot] = 0.35; }
        if (e.box != null) { const b = R.items.boxes[e.box]; burst('pickup', b.x, b.y + 1, b.z, 0.35); }
        break;
      case 'item_full': if (mine) V.fullT = 1.6; break;
      case 'item_use': {
        const snd = { missile: 'Play_DJ_ddfashe', banana: 'Play_DJ_atk_ty', cloud: 'Play_DJ_Cloud', tornado: 'Play_DJ_wind', shield: 'Play_DJ_hudunopen', angel: 'Play_DJ_TSopen',
          magnet: 'Play_DJ_CT_fashe', ufo: 'Play_DJ_FD_fashe', ink: 'Play_DJ_ZY_atk', lightning: 'Play_DJ_shandian_hit' }[e.item];
        if (snd) play(snd, e.item === 'lightning' || e.item === 'ink' ? Math.max(near, 0.5) : near);
        if (mine) V.slotPop[e.slot] = -0.3;
        if (e.target === me.id && (e.item === 'missile' || e.item === 'ufo')) { play('Play_DJ_jingbao', 1); V.warnT = 0; }
        if (mine && e.item !== 'nitro') V.popup = { id: e.item, t: 0, use: true };
        break;
      }
      case 'item_hit': {
        if (e.item === 'banana') play('Play_DJ_XJP_hit', near);
        if (e.item === 'lightning' && k) {
          bolt(k);
          if (o) o.shrinkT = TD.ITEMS.lightning.slowT;
        }
        if (e.item === 'ink' && o) o.squidT = 1.2;
        if (e.item === 'tornado' && near > 0) play('Play_DJ_wind', near * 0.6);
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
        if (k) burst('shield', k.x, k.y + 1, k.z, 0.5, [0, 3]);
        if (mine) TD.hud.say('Lá Chắn thật đúng lúc!');   // 238a395c "Nguy hiểm thật! Lá Chắn thật đúng lúc!"
        break;
      case 'item_boom':
        play('Play_DJ_ddbao', mine ? 1 : Math.max(0, 1 - Math.hypot(e.x - me.x, e.z - me.z) / 90));
        burst('missile_hit', e.x, e.y, e.z, 0.8);
        break;
    }
  }
  // sét: tia dọc từ trời (FX_ani_05101 4×1) + tia lửa (FX_ani_05054 2×2) quanh xe
  function bolt(k) {
    const L = layer('lightning', 1), S = layer('lightning', 2);
    if (L) for (let i = 0; i < 5; i++) spawn(L, k.x, k.y + 1 + i * 2.2, k.z, { size: 4.5, life: 0.35, spd: 0, anim: false });
    if (S) for (let i = 0; i < 6; i++) spawn(S, k.x, k.y + 0.8, k.z, { size: 2.2, life: 0.4, spd: 1 });
  }

  // ---------- màn người chơi: mực, sương, cảnh báo, ô đạo cụ ----------
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
      for (let i = 0; i < n; i++) { const q = P[i], nx = P[(i + 1) % n]; g.quadraticCurveTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2); }
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
  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push({
    start(ctx) {
      V.ctx = null;
      if (!ctx.R.items) return;
      V.ctx = ctx; V.root = new THREE.Group(); ctx.root.add(V.root);
      V.seen = {}; V.slotPop = [0, 0]; V.popup = null; V.ink = null; V.warnT = -1; V.fullT = 0; V.t = 0;
      for (const k in batches) delete batches[k];
      objs.clear(); onKart.clear();
      buildBoxes(ctx.R.items);
      for (const id in TD.ITEMS) img(iconOf(id));
      for (const k of ['boomb2', 'hint']) img(TD.ITEM_ART.icons[k]);
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
      updateObjects(I, sdt, V.t);
      kartFx(I, ctx.M.views, sdt, V.t);
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
      objs.clear(); onKart.clear();
      for (const k in batches) delete batches[k];
    },
  });

  // Cho bài kiểm: vị trí ô trên HUD, số icon vừa vẽ, số vật thể đạo cụ đang vẽ, đếm sự kiện đã thấy.
  V.debug = () => ({ slots: V.slotRects, icons: V.iconsDrawn, objects: V.objects, boxes: V.boxes ? V.boxes.list.length : 0, seen: V.seen });
  TD.itemsView = V;
})(globalThis.TD = globalThis.TD || {});
