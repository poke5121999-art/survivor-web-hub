// Dải dẫn đường dưới sàn (GroundNavigation gốc): NpcObject.SetNavigationActive bật một dải (ribbon) nằm trên mặt đất đi
// từ nhân vật tới NPC theo NavMeshPath, hoa văn mũi tên cuộn theo _Speed. Tham số + texture: tools/rip_groundnav.py →
// art/object/GroundNavigation.{json,webp}. Bản web tìm đường trên lưới đi của world.js (ô 0,5 m, BFS 8 hướng, kéo thẳng
// bằng tầm nhìn trên lưới) thay cho NavMesh.
(function (VD) {
  'use strict';
  const THREE = window.THREE;
  const G = { mesh: null, cfg: null, tex: null, target: null, path: null, t: 0, on: false };
  const SAMPLE = 0.25;   // không có trong bảng: bước lấy mẫu khi kéo thẳng đường trên lưới (nửa ô nav)

  function load() {
    if (G.cfg) return;
    G.cfg = { ribbonWidth: 0.5, uvTiling: 2, fixedHeight: 0.05, segmentCount: 4, smoothCorners: 1, cutoffStartDistance: 0.5, cutoffEndDistance: 0, navUpdateInterval: 0.25, material: { speed: 0.3, cutoff: 0.5 } };
    fetch('art/object/GroundNavigation.json').then(r => r.json()).then(j => { G.cfg = j; }).catch(() => { /* giữ số mặc định = số gốc */ });
    const tex = G.tex = new THREE.TextureLoader().load('art/object/GroundNavigation.webp');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;          // m_WrapU/V = 0 (Repeat)
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;   // m_FilterMode = 0 (Point)
    tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false });
    G.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    G.mesh.name = 'groundNav'; G.mesh.renderOrder = 5; G.mesh.frustumCulled = false; G.mesh.visible = false;
  }

  const blocked = (W, i, j) => i < 0 || j < 0 || i >= W.navW || j >= W.navH || W.nav[j * W.navW + i];
  function lineClear(W, a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / SAMPLE));
    for (let k = 1; k < n; k++) { const c = W.navCell(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n); if (blocked(W, c[0], c[1])) return false; }
    return true;
  }
  // BFS 8 hướng (không cắt góc). Đích bị chặn (NPC đứng sau quầy) thì dừng ở ô đi được gần đích nhất.
  function findPath(from, to) {
    const W = VD.world;
    if (!W || !W.nav) return [from, to];
    const w = W.navW, h = W.navH;
    let s = W.navCell(from.x, from.z);
    if (blocked(W, s[0], s[1])) {
      let best = null, bd = 1e9;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const i = s[0] + di, j = s[1] + dj; if (!blocked(W, i, j) && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = [i, j]; } }
      if (!best) return [from, to];
      s = best;
    }
    const g = W.navCell(to.x, to.z), goal = g[1] * w + g[0];
    const prev = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h);
    const s0 = s[1] * w + s[0];
    prev[s0] = s0;
    let qh = 0, qt = 0, best = s0, bestD = 1e18, hit = false;
    q[qt++] = s0;
    while (qh < qt) {
      const c = q[qh++], ci = c % w, cj = (c - ci) / w;
      const d = (ci - g[0]) * (ci - g[0]) + (cj - g[1]) * (cj - g[1]);
      if (d < bestD) { bestD = d; best = c; }
      if (c === goal) { hit = true; break; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (blocked(W, ni, nj) || (di && dj && (blocked(W, ni, cj) || blocked(W, ci, nj)))) continue;
        const n = nj * w + ni;
        if (prev[n] >= 0) continue;
        prev[n] = c; q[qt++] = n;
      }
    }
    const cells = [];
    for (let c = hit ? goal : best; ; c = prev[c]) { cells.push(c); if (c === s0) break; }
    cells.reverse();
    const pts = cells.map(c => { const p = W.navCenter(c % w, (c - c % w) / w); return { x: p[0], z: p[1] }; });
    pts[0] = { x: from.x, z: from.z };
    if (hit) pts[pts.length - 1] = { x: to.x, z: to.z };
    // kéo thẳng: từ điểm neo nhảy tới điểm xa nhất còn nhìn thấy trên lưới
    const out = [pts[0]];
    for (let a = 0; a < pts.length - 1;) {
      let b = pts.length - 1;
      while (b > a + 1 && !lineClear(W, pts[a], pts[b])) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }
  // Bo góc (_smoothCorners, _segmentCount): mỗi góc thay bằng cung Bézier bậc hai qua segmentCount đoạn.
  function smooth(pts, segs) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const la = Math.hypot(b.x - a.x, b.z - a.z), lc = Math.hypot(c.x - b.x, c.z - b.z);
      const r = Math.min(0.6, la / 2, lc / 2);   // không có trong bảng: bán kính bo góc
      if (r < 0.05) { out.push(b); continue; }
      const p0 = { x: b.x + (a.x - b.x) * r / la, z: b.z + (a.z - b.z) * r / la }, p2 = { x: b.x + (c.x - b.x) * r / lc, z: b.z + (c.z - b.z) * r / lc };
      for (let k = 0; k <= segs; k++) { const t = k / segs, u = 1 - t; out.push({ x: u * u * p0.x + 2 * u * t * b.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * b.z + t * t * p2.z }); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  // Cắt bỏ đoạn đầu dài d (_cutoffStartDistance: dải không chui dưới chân nhân vật).
  function cutStart(pts, d) {
    while (pts.length > 1 && d > 0) {
      const a = pts[0], b = pts[1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L <= d) { pts.shift(); d -= L; continue; }
      pts[0] = { x: a.x + (b.x - a.x) * d / L, z: a.z + (b.z - a.z) * d / L }; d = 0;
    }
    return pts;
  }
  // [ĐO GenerateMesh] v = _visualDistanceToEnd × uvTiling: quãng tới đích (mũi tên trong texture chỉ về phía v nhỏ = về đích),
  // mỗi đoạn tính quãng "nhìn thấy" = dài × (1 + (uvPerspectiveScale − 1)·|dot(hướng đoạn, _cameraDirection)|) để bù đoạn đi
  // vào sâu màn hình bị camera ép ngắn. [SUY LUẬN] bề rộng nở theo _widthPerspectiveScale khi đoạn nằm ngang với camera.
  function build(pts) {
    const c = G.cfg, hw = c.ribbonWidth / 2, y = c.fixedHeight;
    const cd = c.cameraDirection || { x: -1, z: 1 }, cl = Math.hypot(cd.x, cd.z) || 1, cx = cd.x / cl, cz = -cd.z / cl;   // Unity → three: z đảo dấu
    const ups = c.uvPerspectiveScale || 1, wps = c.widthPerspectiveScale || 1;
    const pos = [], uv = [], idx = [], vd = new Array(pts.length).fill(0);
    for (let i = pts.length - 2; i >= 0; i--) {
      const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z, L = Math.hypot(dx, dz);
      const al = L > 1e-4 ? Math.min(1, Math.abs((dx * cx + dz * cz) / L)) : 0;
      vd[i] = vd[i + 1] + L * (1 + (ups - 1) * al);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const w = hw * (1 + (wps - 1) * (1 - Math.min(1, Math.abs(tx * cx + tz * cz))));
      const nx = -tz * w, nz = tx * w, v = vd[i] * c.uvTiling;
      pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz);
      uv.push(0, v, 1, v);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = G.mesh.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
  }

  // Mỗi khung: from/to = {x, z} (to = null thì tắt). Đường tính lại mỗi _navUpdateInterval hoặc khi đích đổi.
  G.update = function (scene, from, to, dt) {
    load();
    if (G.mesh.parent !== scene) scene.add(G.mesh);
    if (!from || !to) { G.mesh.visible = false; G.target = null; return; }
    const c = G.cfg;
    G.t -= dt;
    const moved = !G.target || Math.hypot(G.target.x - to.x, G.target.z - to.z) > 0.01;
    if (moved || G.t <= 0) {
      G.t = c.navUpdateInterval || 0.25; G.target = { x: to.x, z: to.z };
      let pts = findPath(from, to);
      if (c.smoothCorners) pts = smooth(pts, c.segmentCount || 4);
      pts = cutStart(pts.slice(), c.cutoffStartDistance || 0);
      if (pts.length < 2) { G.mesh.visible = false; return; }
      build(pts);
    }
    G.tex.offset.y += (c.material && c.material.speed || 0.3) * dt;   // _Speed: hoa văn trôi về phía đích (v giảm dần về đích)
    G.mesh.visible = true;
  };
  G.hide = function () { if (G.mesh) G.mesh.visible = false; G.target = null; };
  G.remove = function () { if (G.mesh && G.mesh.parent) G.mesh.parent.remove(G.mesh); G.target = null; };

  VD.groundNav = G;
})(window.VD = window.VD || {});
