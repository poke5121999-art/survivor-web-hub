/*
 * Dựng một bản đồ P1.MAPS[id] thành đồ hoạ three.js, như MapManager gốc:
 * mỗi ô là một quad 1×1 lấy UV vào atlas nền, tường dựng ở chỗ chênh TileHeights,
 * nước là mặt phẳng theo ô, prefab đặt theo MapObjectStruct (lặp nhiều thì instanced).
 * Toạ độ: ô (x, y) chiếm x..x+1, z = y..y+1 trong three.js; máy ảnh ở +z nhìn về -z.
 * Nguồn và cách đo: tools/README-map.md (nền, prop), tools/README-world.md (bản đồ).
 */
(function (P1) {
  'use strict';

  const CELLS = 64;
  const INSET = 0.5 / 2048;
  const WATER_SURFACE = 0.76;   // mặt nước của prop waves/beach nằm ở y = 0,76 trên đáy (README-map.md)

  const atlasCache = {};
  function atlas(url) {
    if (!atlasCache[url]) {
      const t = new THREE.TextureLoader().load(url);
      t.encoding = THREE.sRGBEncoding;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      atlasCache[url] = t;
    }
    return atlasCache[url];
  }

  function uvOf(id) {
    const c = id % CELLS, r = Math.floor(id / CELLS);
    return [c / CELLS + INSET, r / CELLS + INSET, (c + 1) / CELLS - INSET, (r + 1) / CELLS - INSET];
  }

  /* Mặt đất + tường: một BufferGeometry cho mỗi lớp. */
  function groundGeometry(M, layer, lift) {
    const pos = [], uv = [], nor = [], idx = [];
    const quad = (a, b, c, d, n, u) => {
      const i = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      nor.push(...n, ...n, ...n, ...n);
      uv.push(u[0], u[3], u[2], u[3], u[2], u[1], u[0], u[1]);
      idx.push(i, i + 3, i + 1, i + 1, i + 3, i + 2);
    };
    const H = (x, y) => M.heights[y * M.w + x];
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      const id = layer[y * M.w + x];
      const h = H(x, y) + lift;
      if (id >= 0) quad([x, h, y], [x + 1, h, y], [x + 1, h, y + 1], [x, h, y + 1], [0, 1, 0], uvOf(id));
      if (lift) continue;
      // Tường ở cạnh nam/tây/đông/bắc khi ô bên thấp hơn (SideType Front/Left/Right, thêm Back cho đủ kín).
      const wall = M.walls ? M.walls[y * M.w + x] : -1;
      const wu = uvOf(wall >= 0 ? wall : WALL_DEFAULT);
      const hs = [[0, 1], [-1, 0], [1, 0], [0, -1]];
      for (const [dx, dy] of hs) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= M.w || Y >= M.h) continue;
        const lo = H(X, Y);
        if (lo >= H(x, y)) continue;
        for (let k = H(x, y); k > lo; k--) {
          const top = k, bot = k - 1;
          if (dy === 1) quad([x, top, y + 1], [x + 1, top, y + 1], [x + 1, bot, y + 1], [x, bot, y + 1], [0, 0, 1], wu);
          else if (dy === -1) quad([x + 1, top, y], [x, top, y], [x, bot, y], [x + 1, bot, y], [0, 0, -1], wu);
          else if (dx === -1) quad([x, top, y], [x, top, y + 1], [x, bot, y + 1], [x, bot, y], [-1, 0, 0], wu);
          else quad([x + 1, top, y + 1], [x + 1, top, y], [x + 1, bot, y], [x + 1, bot, y + 1], [1, 0, 0], wu);
        }
      }
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  const WALL_DEFAULT = 1 + 62 * CELLS;   // ô vách đất (1,62), ô mặc định của material Custom/Primitive bờ nước

  function waterMesh(M) {
    const pos = [], uv = [], idx = [];
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      if (!M.water[y * M.w + x]) continue;
      const h = M.heights[y * M.w + x] + WATER_SURFACE;
      const i = pos.length / 3;
      pos.push(x, h, y, x + 1, h, y, x + 1, h, y + 1, x, h, y + 1);
      uv.push(x / 4, -y / 4, (x + 1) / 4, -y / 4, (x + 1) / 4, -(y + 1) / 4, x / 4, -(y + 1) / 4);
      idx.push(i, i + 3, i + 1, i + 1, i + 3, i + 2);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const W = P1.GROUND.water;
    const tex = atlas(W.tex);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    const nrm = new THREE.TextureLoader().load(W.normal);
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color().setRGB(W.color[0], W.color[1], W.color[2]).convertSRGBToLinear().multiplyScalar(2.2),
      map: tex, normalMap: nrm, normalScale: new THREE.Vector2(0.6, 0.6), shininess: 60,
      transparent: true, opacity: W.transparency, depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 2;
    mesh.userData.tick = t => { tex.offset.set(t * 0.02, t * 0.013); nrm.offset.set(-t * 0.015, t * 0.02); };
    return mesh;
  }

  function fixMaterials(root) {
    root.traverse(o => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m.alphaTest > 0) m.side = THREE.DoubleSide;
        if (m.transparent) m.depthWrite = false;
      }
    });
  }

  /* Mọi mesh trong glb kèm ma trận so với gốc prefab. */
  function meshesOf(gltf) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const out = [];
    root.traverse(o => { if (o.isMesh) out.push({ geo: o.geometry, mat: o.material, m: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) }); });
    return out;
  }

  const INSTANCE_MIN = 3;
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  function propMatrix(o) {
    const m = new THREE.Matrix4().makeRotationAxis(Y_AXIS, (o.ry || 0) * Math.PI / 180);
    m.setPosition(o.x, o.y, o.z);
    return m;
  }

  /*
   * build(map) -> Promise<{ group, tick(t), dispose(), propsOf(tag) }>
   * Prop thiếu glb thì bỏ qua và ghi console.warn: bản đồ vẫn chơi được.
   */
  async function build(M) {
    const group = new THREE.Group();
    group.name = 'map:' + M.id;
    const img = M.settings.tileset === 2 ? P1.GROUND.atlas.img2 : P1.GROUND.atlas.img;
    const tex = atlas(img);
    const groundMat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
    const g1 = groundGeometry(M, M.tiles, 0);
    if (g1) { const m = new THREE.Mesh(g1, groundMat); m.name = 'ground'; group.add(m); }
    const g2 = groundGeometry(M, M.tiles2, 0.005);
    if (g2) { const m = new THREE.Mesh(g2, groundMat); m.name = 'ground2'; group.add(m); }
    const water = waterMesh(M);
    if (water) group.add(water);

    const byPrefab = {};
    for (const o of M.objects) (byPrefab[o.prefab] = byPrefab[o.prefab] || []).push(o);
    const tagged = {};
    await Promise.all(Object.keys(byPrefab).map(async name => {
      const P = P1.PROPS[name];
      if (!P) { console.warn('prop missing: ' + name); return; }
      let gltf;
      try { gltf = await P1.gltf(P.glb); } catch (e) { console.warn(e.message); return; }
      const list = byPrefab[name];
      const parts = meshesOf(gltf);
      parts.forEach(p => fixMaterials({ traverse: f => f({ isMesh: true, material: p.mat }) }));
      if (list.length >= INSTANCE_MIN) {
        for (const p of parts) {
          const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
          list.forEach((o, i) => im.setMatrixAt(i, propMatrix(o).multiply(p.m)));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere && im.computeBoundingSphere();
          im.frustumCulled = false;
          im.name = name;
          group.add(im);
        }
      } else {
        for (const o of list) {
          const node = gltf.scene.clone(true);
          fixMaterials(node);
          node.position.set(o.x, o.y, o.z);
          node.rotation.y = (o.ry || 0) * Math.PI / 180;
          node.name = name;
          node.userData.obj = o;
          group.add(node);
          if (o.tag) (tagged[o.tag] = tagged[o.tag] || []).push(node);
        }
      }
    }));

    return {
      group,
      tick(t) { if (water) water.userData.tick(t); },
      tagged,
      dispose() {
        group.traverse(o => { if (o.name === 'ground' || o.name === 'ground2') o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
        if (water) { water.geometry.dispose(); water.material.dispose(); }
        groundMat.dispose();
      },
    };
  }

  /* Lưới ô để soát (bật bằng ?grid=1): đỏ = chặn, vàng = gờ, xanh = cỏ gặp, lam = cửa nối. */
  function debugOverlay(M) {
    const cv = document.createElement('canvas');
    cv.width = M.w * 16; cv.height = M.h * 16;
    const g = cv.getContext('2d');
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      const c = M.colliders[y * M.w + x], z = M.zones.grid[y * M.w + x];
      g.fillStyle = c === 1 ? 'rgba(255,0,0,.35)' : c === 6 ? 'rgba(255,0,255,.35)' : c > 1 ? 'rgba(255,220,0,.5)' : z ? 'rgba(0,255,80,.3)' : 'rgba(0,0,0,0)';
      g.fillRect(x * 16, y * 16, 16, 16);
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.strokeRect(x * 16 + 0.5, y * 16 + 0.5, 15, 15);
    }
    for (const L of M.links) {
      g.fillStyle = 'rgba(0,120,255,.6)';
      const x = Math.min(M.w - 1, Math.max(0, L.x)), y = Math.min(M.h - 1, Math.max(0, L.y));
      g.fillRect(x * 16 + 4, y * 16 + 4, 8, 8);
    }
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(M.w, M.h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(M.w / 2, 0.03, M.h / 2);
    mesh.renderOrder = 50;
    return mesh;
  }

  P1.worldMap = { build, debugOverlay, uvOf };
})(window.P1 = window.P1 || {});
