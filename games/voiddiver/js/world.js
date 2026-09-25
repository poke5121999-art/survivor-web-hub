// Ghép lưới sector của một campaign, dựng va chạm tĩnh và lưới đi cho quái.
// Sector gốc 30×30 m, gốc ở góc; trong toạ độ three một sector trải x 0..30, z −30..0 (ASSETS.md §2).
(function (VD) {
  'use strict';
  const THREE = window.THREE;
  const CELL = 30;
  const NAV = 0.5;          // ô lưới đi cho quái, mét
  const HASH = 4;           // ô băm không gian cho truy vấn va chạm, mét

  const W = {
    root: null, sectors: [], lights: [], spawns: [],
    move: [], shot: [],     // hộp chặn đi / chặn đạn: {cx, cz, hx, hz, c, s}
    hashMove: new Map(), hashShot: new Map(),
    minX: 0, minZ: 0, maxX: 0, maxZ: 0,
    nav: null, navW: 0, navH: 0,
  };

  const gltfCache = new Map();
  function loadGlb(url) {
    if (!gltfCache.has(url)) {
      const loader = new THREE.GLTFLoader();
      if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
      gltfCache.set(url, new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej)));
    }
    return gltfCache.get(url).then(s => s.clone(true));
  }
  const jsonCache = new Map();
  function loadJson(url) {
    if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }));
    return jsonCache.get(url);
  }

  // Shader BG gốc là toon nhà với ánh sáng chính rất yếu; Lambert + texture NEAREST là gần nhất mà rẻ.
  const matCache = new Map();
  // Mọi sector dùng chung ~45 ảnh 512–2048 px. THREE.Cache cho ImageBitmap cùng URL trả về cùng object;
  // dùng lại đúng một Texture cho mỗi ảnh để GPU chỉ nhận một bản (map 6×6 = 36 sector).
  THREE.Cache.enabled = true;
  const texCache = new Map();
  const shareTex = t => { if (!t || !t.image) return t; const k = t.image; if (!texCache.has(k)) texCache.set(k, t); return texCache.get(k); };
  function convertMaterial(m) {
    if (matCache.has(m)) return matCache.get(m);
    const ex = m.userData || {};
    const out = new THREE.MeshLambertMaterial({
      map: shareTex(m.map) || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
      transparent: m.transparent, alphaTest: m.alphaTest || 0, side: m.side,
      // COLOR_0 của sector là kênh dữ liệu cho shader gốc (G luôn 128, A là số 0–12), không phải màu.
      vertexColors: false,
      emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0, 0, 0),
      emissiveMap: shareTex(m.emissiveMap) || null,
    });
    if (out.map) { out.map.magFilter = THREE.NearestFilter; out.map.minFilter = THREE.NearestMipmapLinearFilter; out.map.encoding = THREE.sRGBEncoding; }
    out.name = m.name; out.userData = ex;
    if (VD.render && VD.render.patchSight) VD.render.patchSight(out);
    matCache.set(m, out);
    return out;
  }

  function sectorUrl(id, ext) {
    const a = VD.ASSETS && VD.ASSETS.sector && VD.ASSETS.sector[id];
    if (a && a[ext]) return a[ext];
    return 'art/sector/' + id + '.' + ext;
  }

  // Đổi toạ độ cục bộ sector (three) sang thế giới theo ô (cx, cy) và số lần xoay r (90° mỗi bước quanh tâm ô).
  function makeXform(cx, cy, r) {
    const ox = CELL * cx, oz = -CELL * cy;
    const ang = -r * Math.PI / 2;   // yaw Unity dương = quay chiều kim đồng hồ nhìn từ trên → three âm
    const c = Math.cos(ang), s = Math.sin(ang);
    const mx = CELL / 2, mz = -CELL / 2;
    return {
      ox, oz, ang,
      pt(x, z) {
        const dx = x - mx, dz = z - mz;
        return [ox + mx + dx * c + dz * s, oz + mz - dx * s + dz * c];
      },
    };
  }

  function addBox(list, hash, xf, center, size, yawDeg) {
    const [cx, cz] = xf.pt(center[0], center[2]);
    const a = -(yawDeg || 0) * Math.PI / 180 + xf.ang;
    const b = { cx, cz, hx: size[0] / 2, hz: size[2] / 2, c: Math.cos(a), s: Math.sin(a), top: center[1] + size[1] / 2 };
    const ext = Math.abs(b.hx * b.c) + Math.abs(b.hz * b.s), ezt = Math.abs(b.hx * b.s) + Math.abs(b.hz * b.c);
    b.minX = cx - ext; b.maxX = cx + ext; b.minZ = cz - ezt; b.maxZ = cz + ezt;
    list.push(b);
    for (let gx = Math.floor(b.minX / HASH); gx <= Math.floor(b.maxX / HASH); gx++)
      for (let gz = Math.floor(b.minZ / HASH); gz <= Math.floor(b.maxZ / HASH); gz++) {
        const k = gx * 73856093 ^ gz * 19349663;
        let arr = hash.get(k); if (!arr) hash.set(k, arr = []);
        arr.push(b);
      }
  }

  function near(hash, x, z, r, out) {
    out.length = 0;
    const seen = near.seen || (near.seen = new Set()); seen.clear();
    for (let gx = Math.floor((x - r) / HASH); gx <= Math.floor((x + r) / HASH); gx++)
      for (let gz = Math.floor((z - r) / HASH); gz <= Math.floor((z + r) / HASH); gz++) {
        const arr = hash.get(gx * 73856093 ^ gz * 19349663);
        if (arr) for (const b of arr) if (!seen.has(b)) { seen.add(b); out.push(b); }
      }
    return out;
  }

  // Đẩy hình tròn (x, z, r) ra khỏi hộp xoay b. Trả vector đẩy hoặc null.
  function pushOut(b, x, z, r) {
    if (b.off) return null;                                          // hộp động đã gỡ (cửa mở)
    const dx = x - b.cx, dz = z - b.cz;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;       // toạ độ cục bộ của hộp
    const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
    let ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) return null;
    let nx, nz, depth;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; depth = r - d; }
    else {                                                           // tâm nằm trong hộp: đẩy ra mép gần nhất
      const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
      if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; depth = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; depth = pz + r; }
    }
    return [(nx * b.c + nz * b.s) * depth, (-nx * b.s + nz * b.c) * depth];
  }

  const scratch = [];
  // Di chuyển một hình tròn, trượt theo tường. Trả vị trí mới (ghi đè pos).
  W.moveCircle = function (pos, r, dx, dz, ghost) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.8)));
    for (let i = 0; i < steps; i++) {
      pos.x += dx / steps; pos.z += dz / steps;
      if (ghost) continue;
      for (let it = 0; it < 3; it++) {
        let moved = false;
        for (const b of near(W.hashMove, pos.x, pos.z, r, scratch)) {
          const p = pushOut(b, pos.x, pos.z, r);
          if (p) { pos.x += p[0]; pos.z += p[1]; moved = true; }
        }
        if (!moved) break;
      }
    }
    pos.x = Math.max(W.minX + r, Math.min(W.maxX - r, pos.x));
    pos.z = Math.max(W.minZ + r, Math.min(W.maxZ - r, pos.z));
    return pos;
  };

  W.overlapsMove = function (x, z, r) {
    for (const b of near(W.hashMove, x, z, r, scratch)) if (pushOut(b, x, z, r)) return true;
    return x < W.minX || z < W.minZ || x > W.maxX || z > W.maxZ;
  };

  // Đoạn a→b có bị hộp chặn đạn cắt không. Trả t ∈ [0,1] điểm chạm đầu tiên, hoặc 1 nếu thông.
  W.raycastShot = function (ax, az, bx, bz) {
    let best = 1;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const b of near(W.hashShot, x, z, 0.05, scratch)) if (pushOut(b, x, z, 0.05)) { best = Math.min(best, t); break; }
      if (best < 1) break;
    }
    return best;
  };

  function buildNav() {
    const w = Math.ceil((W.maxX - W.minX) / NAV), h = Math.ceil((W.maxZ - W.minZ) / NAV);
    const g = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++)
      g[j * w + i] = W.overlapsMove(W.minX + (i + 0.5) * NAV, W.minZ + (j + 0.5) * NAV, 0.2) ? 1 : 0;
    W.nav = g; W.navW = w; W.navH = h;
  }
  W.navCell = (x, z) => [Math.floor((x - W.minX) / NAV), Math.floor((z - W.minZ) / NAV)];
  W.navCenter = (i, j) => [W.minX + (i + 0.5) * NAV, W.minZ + (j + 0.5) * NAV];
  W.NAV = NAV;

  // layout: [{cx, cy, id, rot}], size: [cols, rows]
  W.load = async function (layout, size, scene) {
    W.unload(scene);
    W.root = new THREE.Group(); W.root.name = 'world';
    scene.add(W.root);
    W.minX = 0; W.maxX = CELL * size[0]; W.minZ = -CELL * size[1]; W.maxZ = 0;
    const jobs = layout.map(async cell => {
      const [glb, js] = await Promise.all([loadGlb(sectorUrl(cell.id, 'glb')), loadJson(sectorUrl(cell.id, 'json'))]);
      const xf = makeXform(cell.cx, cell.cy, cell.rot || 0);
      const g = new THREE.Group(), cutMeshes = [];
      g.position.set(xf.ox + CELL / 2, 0, xf.oz - CELL / 2);
      g.rotation.y = xf.ang;
      glb.position.set(-CELL / 2, 0, CELL / 2);
      glb.traverse(o => {
        if (!o.isMesh) return;
        // shader_DE_BG_CutoffArea là khối mặt nạ để khoét mái nhà khi nhân vật đứng sau, không vẽ ra màn hình.
        const src = Array.isArray(o.material) ? o.material[0] : o.material;
        if (src.userData && /CutoffArea/.test(src.userData.shader || '')) { o.visible = false; cutMeshes.push(o); return; }
        o.material = Array.isArray(o.material) ? o.material.map(convertMaterial) : convertMaterial(o.material);
        o.matrixAutoUpdate = false; o.updateMatrix();
        if (o.geometry.attributes.color) o.onBeforeRender = cutHook;
      });
      g.add(glb);
      W.root.add(g);
      g.updateMatrixWorld(true);
      const sec = { cell, json: js, group: g, xf, cutBoxes: cutGroups(cutMeshes), cut: [-1, -1, -1, -1] };
      g.traverse(o => { o.userData.sector = sec; });
      for (const c of js.colliders || []) {
        if (c.trigger || c.active === false) continue;
        if (c.kind === 'high' || c.kind === 'other') addBox(W.shot, W.hashShot, xf, c.center, c.size, c.yaw);
      }
      for (const v of js.navVolumes || []) {
        if (v.area !== 1 || /UpperBlockVolume/.test(v.path)) continue;
        addBox(W.move, W.hashMove, xf, v.center, v.size, v.yaw);
      }
      // JSON sector bản hiện tại không có navVolumes (NavMeshModifierVolume vùng chặn đi): khi đó hộp va chạm
      // HighObstacles + RawObject chặn cả đi lẫn đạn, như BoxCollider gốc chặn CharacterController. (dive.js)
      if (!(js.navVolumes && js.navVolumes.length))
        for (const c of js.colliders || []) {
          if (c.trigger || c.active === false || (c.kind !== 'high' && c.kind !== 'other')) continue;
          addBox(W.move, W.hashMove, xf, c.center, c.size, c.yaw);
        }
      for (const l of js.lights || []) {
        if (l.active === false || l.type !== 'point') continue;
        const [x, z] = xf.pt(l.pos[0], l.pos[2]);
        W.lights.push({ pos: [x, l.pos[1], z], color: l.color, intensity: l.intensity, range: l.range });
      }
      W.sectors.push(sec);
    });
    await Promise.all(jobs);
    W.root.updateMatrixWorld(true);
    buildNav();
    VD.render && VD.render.setLightSources(W.lights);
    return W;
  };

  W.unload = function (scene) {
    if (W.root && scene) scene.remove(W.root);
    W.root = null; W.sectors = []; W.lights = []; W.move = []; W.shot = [];
    W.hashMove = new Map(); W.hashShot = new Map(); W.nav = null;
  };

  // Khoét mái (shader_DE_BG_CutoffArea gốc). Kênh A của COLOR_0 là mã nhóm: khối cutoff mã k trùng khít toà nhà
  // mang mã k (đo ở sector 1001: mã 9 tường x 9,4–19,3, cutoff x 9,5–19,0). Nóc khối cutoff ở y 0,9 m.
  function cutGroups(meshes) {
    const out = new Map(), v = new THREE.Vector3();
    for (const o of meshes) {
      const p = o.geometry.attributes.position, c = o.geometry.attributes.color;
      if (!c) continue;
      for (let i = 0; i < p.count; i++) {
        // three r140 getW trả số thô (Uint8 → 0..255, kể cả attribute xen kẽ của meshopt); shader thì nhận 0..1.
        const w = c.getW(i), id = Number.isInteger(w) ? w : Math.round(w * 255);
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        let b = out.get(id);
        if (!b) out.set(id, b = { id, min: v.clone(), max: v.clone() });
        b.min.min(v); b.max.max(v);
      }
    }
    return [...out.values()];
  }
  function cutHook(renderer, scene, camera, geometry, material) {
    const sec = this.userData.sector;
    const u = VD.render.cut.uCut.value;
    const c = sec ? sec.cut : NONE;
    if (u.x !== c[0] || u.y !== c[1] || u.z !== c[2] || u.w !== c[3]) { u.set(c[0], c[1], c[2], c[3]); material.uniformsNeedUpdate = true; }
  }
  const NONE = [-1, -1, -1, -1];
  const segBox = (a, b, box) => {
    let t0 = 0, t1 = 1;
    for (const k of ['x', 'y', 'z']) {
      const d = b[k] - a[k];
      if (Math.abs(d) < 1e-9) { if (a[k] < box.min[k] || a[k] > box.max[k]) return false; continue; }
      let u0 = (box.min[k] - a[k]) / d, u1 = (box.max[k] - a[k]) / d;
      if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      if (t0 > t1) return false;
    }
    return true;
  };
  // Mỗi khung: nhóm nào nằm giữa camera và nhân vật (hoặc nhân vật đứng trong) thì bị khoét.
  W.updateCutoff = function (camPos, x, z) {
    const head = new THREE.Vector3(x, 0.6, z);
    for (const sec of W.sectors) {
      let n = 0;
      sec.cut.fill(-1);
      for (const b of sec.cutBoxes) {
        const inside = x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z;
        if (n < 4 && (inside || segBox(camPos, head, { min: b.min, max: { x: b.max.x, y: b.max.y + 3, z: b.max.z } }))) sec.cut[n++] = b.id;
      }
    }
  };

  // Toạ độ trong ô sector (theo Sector.csv, Unity) sang thế giới three.
  W.sectorPoint = function (sec, ux, uz) {
    return sec.xf.pt(ux, -uz);
  };

  // Hộp chặn động (cửa đóng): toạ độ thế giới three, yaw độ theo quy ước Unity. Gỡ bằng removeBlocker (đánh dấu off).
  const IDENT = { pt: (x, z) => [x, z], ang: 0 };
  W.addBlocker = function (cx, cz, sx, sz, yawDeg, shot) {
    addBox(W.move, W.hashMove, IDENT, [cx, 0.9, cz], [sx, 2, sz], yawDeg || 0);
    const b = W.move[W.move.length - 1];
    if (shot) { addBox(W.shot, W.hashShot, IDENT, [cx, 0.9, cz], [sx, 2, sz], yawDeg || 0); b.shotBox = W.shot[W.shot.length - 1]; }
    return b;
  };
  W.removeBlocker = function (b) { if (!b) return; b.off = true; if (b.shotBox) b.shotBox.off = true; };
  W.restoreBlocker = function (b) { if (!b) return; b.off = false; if (b.shotBox) b.shotBox.off = false; };

  W.CELL = CELL;
  VD.world = W;
})(window.VD = window.VD || {});
