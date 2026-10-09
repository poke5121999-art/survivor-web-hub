/*
 * Đá ma (phantom obstacles) của The Marrows — đơn vị U2 (MONSTERS.md §2.3). Dữ liệu: data/ghostrocks.js (tools/ghostrocks.py).
 *
 * GhostRockManager.cs:44-97 chép nguyên:
 *   - mỗi 60 s thực (timeBetweenSanityAssignments, lần đầu ngay khi có thuyền) mỗi đá bốc threshold = Random(−0,2; 0,75);
 *   - mỗi khung quét rocksToCheckPerFrame = 5 đá (chỉ số quét giữ nguyên lỗi gốc: rockCheckIndex = j nên mỗi khung tiến 4, đá cuối kỳ lặp lại);
 *   - đá hiện được khi sanity ≤ threshold, KHÔNG nằm trong (0,15; 0,85) của ngày (đêm: giờ < 0,15 hoặc > 0,85 — so sánh chặt như gốc),
 *     và khoảng cách 3D tới thuyền ≤ maxDistanceThreshold 25 m; đá đang ẩn không bao giờ hiện khi gần hơn minDistanceThreshold 10 m;
 *   - đá chỉ ẩn khi điều kiện hỏng VÀ renderer không còn trong khung hình (Renderer.isVisible; ở đây: hình cầu bao ngoài khỏi tầm nhìn camera).
 * rockMeshObject (layer 7 CollidesWithPlayer, MeshCollider không lồi, mặc định tắt) bật cùng lúc: là vật cản thật, PlayerCollider.OnCollisionEnter →
 * ProcessHit (không phải SafeCollider) → DRBoat.processHit (1 ô hỏng, miễn 1,5 s).
 *
 * Gale Cliffs (35 đá) có trong dữ liệu nhưng chưa dựng (hoãn: MONSTERS.md §2.3). 109 đá "GhostRocks (1)" của scene không nằm trong
 * allGhostRocks của bộ quản lý nên không bao giờ hiện: không dựng.
 *
 * [ĐỀ XUẤT] va chạm: thân đá = bao lồi (trong mặt phẳng XZ) của phần mesh nằm trong lát y ∈ [0,052; 0,700] (hộp collider Player của thuyền,
 * DR_BOAT.colliderSize.player), thuyền = hình chữ nhật cùng collider; chạm → đẩy ra theo trục tách nhỏ nhất, triệt tiêu vận tốc hướng vào, w × 0,5
 * (như DRBoat.collide với đất). Gốc dùng vật lý PhysX thật (mesh lõm, thuyền là rigidbody).
 * [ĐỀ XUẤT] vật liệu: GhostObject_Shader đọc từ DXBC (tools/…/ghostrocks): opaque (queue 2450, blend 1/0), màu = Albedo × ((1 − mask mây) +
 * ambient × sat(−y) + đèn phụ + Color_9a80 (0,671; 0,647; 0,624)); phần phát sáng "shimmer" ((2w)^25, w ≤ dist/350) < 1e-5 trong 25 m nên bỏ.
 * Sương: ShaderChunk fog của js/sky.js.
 *
 *   DRGhostRocks.init(scene)  update(dt)  finish()
 *   DRGhostRocks.debug → { count, visible(), forceThreshold(v), reroll(), nearest(n), state(), popped(), rocks() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_GHOSTROCKS;
  if (!T || !D || !D.rocks || !D.rocks.length) { root.DRGhostRocks = null; return; }
  const C = D.config, MG = D.manager;
  const HY0 = 0.052, HY1 = 0.700;                      // lát y của collider Player (DR_BOAT.colliderSize.player: tâm 0,3764 ± 0,324)
  let scene = null, group = null, mat = null, geoms = null, rocks = null, clock = 0, lastAssign = -Infinity, checkIdx = 0;
  const log = { popped: [], hits: 0, shown: 0 };       // popped: khoảng cách lúc hiện của mỗi lần bật (kiểm "không bật khi < 10 m")

  // ---------------------------------------------------------------- vật liệu
  function material() {
    const tex = new T.TextureLoader().load(D.material.albedo);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.encoding = T.sRGBEncoding;
    const m = new T.MeshBasicMaterial({ map: tex });
    const col = D.material.tint;
    m.onBeforeCompile = sh => {
      sh.uniforms.uGhostTint = { value: new T.Vector3(col[0], col[1], col[2]) };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uGhostTint;')
        .replace('#include <output_fragment>', `
  vec3 wpG = vDrFogW;
  vec3 litG = diffuseColor.rgb * (drEnvLights(wpG) + uDrAmb * clamp(-wpG.y, 0.0, 1.0) + uGhostTint + (1.0 - drEnvMaskB(wpG.xz)) + vec3(uDrTintK, 0.0, 0.0));
  gl_FragColor = vec4(litG, 1.0);`);
    };
    m.customProgramCacheKey = () => 'drGhostRock';
    return m;
  }
  function geometries() {
    return D.meshes.map(M => {
      if (!M) return null;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(M.pos), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array(M.uv), 2));
      g.setIndex(M.idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    });
  }

  // ---------------------------------------------------------------- bao lồi XZ của lát va chạm (tính một lần khi đá hiện lần đầu)
  function hull2(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  function footprint(r) {
    const M = D.meshes[r.d.mesh], P = M.pos, I = M.idx, m = r.mesh.matrixWorld.elements;
    const wy = new Float32Array(P.length / 3), wx = new Float32Array(P.length / 3), wz = new Float32Array(P.length / 3);
    for (let i = 0; i < wy.length; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      wx[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; wy[i] = m[1] * x + m[5] * y + m[9] * z + m[13]; wz[i] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const pts = [];
    for (let i = 0; i < wy.length; i++) if (wy[i] >= HY0 && wy[i] <= HY1) pts.push([wx[i], wz[i]]);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = I[t + e], b = I[t + (e + 1) % 3];
      for (const Y of [HY0, HY1]) if ((wy[a] - Y) * (wy[b] - Y) < 0) {
        const k = (Y - wy[a]) / (wy[b] - wy[a]);
        pts.push([wx[a] + (wx[b] - wx[a]) * k, wz[a] + (wz[b] - wz[a]) * k]);
      }
    }
    return pts.length >= 3 ? hull2(pts) : null;
  }

  // ---------------------------------------------------------------- thuyền (hình chữ nhật collider Player) và SAT
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  function boatRect(b) {                              // yaw: mũi = (−sin, −cos), phải = (cos, −sin) (xem tentacle.js)
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    const cx = b.x + rx * PC.center[0] + fx * PC.center[2], cz = b.z + rz * PC.center[0] + fz * PC.center[2];
    const hx = PC.size[0] / 2, hz = PC.size[2] / 2, out = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push([cx + rx * hx * sx + fx * hz * sz, cz + rz * hx * sx + fz * hz * sz]);
    return out;
  }
  // SAT hai đa giác lồi; trả về {nx, nz, depth} đẩy A (thuyền) ra khỏi B (đá) hoặc null
  function sat(A, B) {
    let best = null;
    for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      let nx = q[1] - p[1], nz = p[0] - q[0];
      const l = Math.hypot(nx, nz); if (l < 1e-9) continue;
      nx /= l; nz /= l;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = v[0] * nx + v[1] * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of B) { const d = v[0] * nx + v[1] * nz; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (!best || o < best.depth) {
        const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2, s = ca >= cb ? 1 : -1;     // hướng đẩy A ra xa B
        best = { nx: nx * s, nz: nz * s, depth: o };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- dựng đá
  function build() {
    mat = material(); geoms = geometries();
    group = new T.Group(); group.name = 'GhostRocks';
    rocks = [];
    for (const d of D.rocks) {
      if (d.zone !== 'THE_MARROWS' || !geoms[d.mesh]) continue;          // Gale Cliffs hoãn
      const mesh = new T.Mesh(geoms[d.mesh], mat);
      mesh.position.fromArray(d.p); mesh.quaternion.fromArray(d.q); mesh.scale.fromArray(d.s);
      mesh.updateMatrix(); mesh.updateMatrixWorld(true);
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;                                              // rockMeshObject m_IsActive 0
      mesh.frustumCulled = true;
      mesh.name = d.n;
      const bs = geoms[d.mesh].boundingSphere;
      rocks.push({ d, mesh, showing: false, threshold: 0, dist: Infinity, hull: undefined, touching: false,
        sphere: new T.Sphere(bs.center.clone().applyMatrix4(mesh.matrixWorld), bs.radius * Math.max(d.s[0], d.s[1], d.s[2])) });
      group.add(mesh);
    }
    scene.add(group);
  }
  const _f = new T.Frustum(), _pm = new T.Matrix4();
  function onScreen(r) {                                                // Renderer.isVisible
    const cam = root.DRCamera && DRCamera.cam;
    if (!cam) return false;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _f.setFromProjectionMatrix(_pm);
    return _f.intersectsSphere(r.sphere);
  }

  // ---------------------------------------------------------------- GhostRockManager.UpdateRock
  function updateRock(r, sanity, tod, bx, by, bz) {
    let see = true;
    if (see && sanity > r.threshold) see = false;
    if (see && tod < C.spawnStartTime && tod > C.spawnEndTime) see = false;
    if (see) {
      const p = r.d.p, dx = p[0] - bx, dy = p[1] - by, dz = p[2] - bz;
      r.dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!r.showing && r.dist < C.minDistanceThreshold) see = false;
      if (r.dist > C.maxDistanceThreshold) see = false;
    }
    if (!r.showing && see) {
      r.mesh.visible = true; r.showing = true; log.shown++;
      log.popped.push(+r.dist.toFixed(2));
      if (log.popped.length > 400) log.popped.shift();
    }
    if (r.showing && !see && !onScreen(r)) { r.mesh.visible = false; r.showing = false; r.touching = false; }
  }
  function assign() { for (const r of rocks) r.threshold = C.sanityThresholdMin + Math.random() * (C.sanityThresholdMax - C.sanityThresholdMin); }
  let forced = null;                                                    // debug: ngưỡng ép
  function manage(dt) {
    const Dr = root.DR, s = Dr.s, b = s.boat;
    clock += dt;
    if (clock > lastAssign + MG.timeBetweenSanityAssignments) { lastAssign = clock; assign(); if (forced != null) for (const r of rocks) r.threshold = forced; }
    const sanity = s.sanity == null ? 1 : s.sanity, tod = ((s.time % 1) + 1) % 1, n = rocks.length;
    for (let j = checkIdx; j < checkIdx + MG.rocksToCheckPerFrame && j < n; j++) { updateRock(rocks[j], sanity, tod, b.x, 0, b.z); checkIdx = j; }
    if (checkIdx >= n - 1) checkIdx = 0;
  }

  // ---------------------------------------------------------------- va chạm với thuyền (chỉ đá đang bật)
  function collide() {
    const Dr = root.DR, b = Dr.s.boat;
    if (Dr.mode !== 'sail') return;
    let rect = null;
    for (const r of rocks) {
      if (!r.showing) continue;
      if (r.hull === undefined) r.hull = footprint(r);
      if (!r.hull) continue;
      const p = r.d.p;
      if (Math.abs(p[0] - b.x) > 30 || Math.abs(p[2] - b.z) > 30) continue;
      rect = rect || boatRect(b);
      const hit = sat(rect, r.hull);
      if (!hit) { r.touching = false; continue; }
      b.x += hit.nx * (hit.depth + 1e-3); b.z += hit.nz * (hit.depth + 1e-3);
      for (const q of rect) { q[0] += hit.nx * (hit.depth + 1e-3); q[1] += hit.nz * (hit.depth + 1e-3); }
      const vn = b.vx * hit.nx + b.vz * hit.nz;
      if (vn < 0) { b.vx -= vn * hit.nx * 1.2; b.vz -= vn * hit.nz * 1.2; }
      b.w *= 0.5;
      if (!r.touching) {                                               // OnCollisionEnter
        r.touching = true;
        if (root.DRBoat && DRBoat.processHit(false, false)) log.hits++;
      }
    }
  }

  // ---------------------------------------------------------------- vòng đời
  function init(sc) {
    scene = sc;
    if (group) { scene.remove(group); group = null; }
    clock = 0; lastAssign = -Infinity; checkIdx = 0;
    build();
  }
  function finish() { if (rocks) for (const r of rocks) { r.mesh.visible = false; r.showing = false; r.touching = false; } clock = 0; lastAssign = -Infinity; checkIdx = 0; }
  function reset() { if (rocks) for (const r of rocks) r.touching = false; }   // thuyền đặt lại (teleport / cập bến): đá giữ nguyên trạng thái
  function update(dt) {
    if (!rocks) return;
    const Dr = root.DR;
    if (!Dr.s || !Dr.s.boat || Dr.mode === 'title') { if (group) group.visible = false; return; }
    group.visible = true;
    manage(dt);
    collide();
  }

  root.DRGhostRocks = { init, update, finish, reset,
    debug: {
      count: () => rocks ? rocks.length : 0,
      visible: () => rocks ? rocks.filter(r => r.showing).length : 0,
      visibleDists: () => rocks ? rocks.filter(r => r.showing).map(r => +r.dist.toFixed(2)) : [],
      forceThreshold(v) { forced = v; if (rocks) for (const r of rocks) r.threshold = v; lastAssign = clock; },   // dừng bốc lại trong 60 s tới
      reroll() { forced = null; lastAssign = -Infinity; },
      popped: () => log.popped.slice(), clearPopped() { log.popped.length = 0; },
      hits: () => log.hits,
      sweep(frames, dt) { for (let i = 0; i < frames; i++) manage(dt || 1 / 60); },
      nearest(n) { const b = root.DR.s.boat; return rocks.map(r => ({ n: r.d.n, x: r.d.p[0], y: r.d.p[1], z: r.d.p[2], d: Math.hypot(r.d.p[0] - b.x, r.d.p[1], r.d.p[2] - b.z), showing: r.showing, th: +r.threshold.toFixed(3) })).sort((a, c) => a.d - c.d).slice(0, n || 5); },
      state: () => ({ clock, checkIdx, n: rocks ? rocks.length : 0, shown: log.shown, hits: log.hits, forced }),
      onScreen: r => onScreen(r),
      rocks: () => rocks
    } };
})(typeof window !== 'undefined' ? window : globalThis);
