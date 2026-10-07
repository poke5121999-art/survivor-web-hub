/*
 * Thế giới tĩnh: cảnh vật instanced (lib.glb + instances.bin) nạp theo ô 256 m quanh thuyền, đáy biển từ terrain_rg.png,
 * mặt nạ đất (landmask.png, 1 px = 1 m) thành trường khoảng cách có dấu để va chạm và vẽ bọt, mặt nạ sâu
 * (depthmask.png: G = độ sâu thô 0..1, A = độ dốc sóng) đọc ngược từ GPU để giữ đúng G ở chỗ alpha = 0.
 *   DRWorld.load(fetchAsset, renderer, scene)   DRWorld.stream(x, z)
 *   DRWorld.sdf(x, z)  > 0 nước (m tới đất gần nhất), < 0 trong đất
 *   DRWorld.depth01(x, z)  DRWorld.steep01(x, z)  DRWorld.zoneAt(x, z)  DRWorld.resolve(b, halfW, halfL)
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const DIR = 'art/world/';
  const LOAD_R = 300, UNLOAD_R = 420; // [ĐỀ XUẤT] bán kính nạp/bỏ ô, sương ban ngày đã che gần hết ở ~450 m
  const ZONE_VI = {
    THE_MARROWS: 'Đảo Marrow', GALE_CLIFFS: 'Vách Gale', STELLAR_BASIN: 'Lòng chảo Stellar',
    TWISTED_STRAND: 'Rừng Đước Xoắn', DEVILS_SPINE: 'Sống Lưng Quỷ', OPEN_OCEAN: 'Biển Khơi',
    PALE_REACH: 'Pale Reach', IRON_RIG: 'Iron Rig'
  };

  const W = root.DRWorld = {
    data: null, ZONE_VI, cells: {}, loaded: new Set(), lampMats: [], maskTex: null, landTex: null, landBox: null,
    stats: { cells: 0, instances: 0, meshes: 0 }
  };
  let scene = null, mask = null, sdfArr = null, LB = null, zones = [];

  // ---------- giải mã ảnh ----------
  async function bitmap(buf, raw) {
    const blob = new Blob([buf], { type: 'image/png' });
    return createImageBitmap(blob, raw ? { premultiplyAlpha: 'none', colorSpaceConversion: 'none' } : {});
  }
  function pixels(bmp) {
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
    return x.getImageData(0, 0, bmp.width, bmp.height).data;
  }
  // canvas 2D nhân trước alpha nên mất G ở chỗ A = 0 (vùng nông); đọc thẳng texture qua một render target.
  function readTexture(renderer, tex, w, h) {
    const rt = new T.WebGLRenderTarget(w, h, { minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false });
    const sc = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const m = new T.ShaderMaterial({
      uniforms: { t: { value: tex } },
      vertexShader: 'varying vec2 u; void main(){ u = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 u; void main(){ gl_FragColor = texture2D(t, u); }'
    });
    sc.add(new T.Mesh(new T.PlaneGeometry(2, 2), m));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
    const out = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, out);
    rt.dispose(); m.dispose();
    return out; // hàng 0 = v 0 = z three.js nhỏ nhất (texture flipY = false)
  }

  // ---------- trường khoảng cách có dấu từ landmask ----------
  function chamfer(src, w, h, target) {
    // khoảng cách tới pixel có src === target gần nhất (8 hướng, xấp xỉ Euclid)
    const INF = 1e9, d = new Float32Array(w * h), D = Math.SQRT2;
    for (let i = 0; i < d.length; i++) d[i] = src[i] === target ? 0 : INF;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + D);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + D);
      }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i];
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + D);
        if (x > 0) v = Math.min(v, d[i + w - 1] + D);
      }
      d[i] = v;
    }
    return d;
  }
  function buildSdf(px, w, h) {
    const solid = new Uint8Array(w * h);
    for (let i = 0; i < solid.length; i++) solid[i] = px[i * 4] > 127 ? 1 : 0;
    const toLand = chamfer(solid, w, h, 1), toWater = chamfer(solid, w, h, 0);
    const sdf = new Float32Array(w * h), foam = new Uint8Array(w * h);
    for (let i = 0; i < sdf.length; i++) {
      sdf[i] = solid[i] ? -(toWater[i] - 0.5) : toLand[i] - 0.5;
      foam[i] = Math.max(0, Math.min(255, Math.round(Math.max(0, sdf[i]) / 64 * 255)));
    }
    return { sdf, foam };
  }
  // song tuyến; tâm pixel (i, j) ở x0 + i + 0,5
  function sdf(x, z) {
    const fx = (x - LB.x0) / LB.res - 0.5, fz = (z - LB.z0) / LB.res - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const at = (a, b) => (a < 0 || b < 0 || a >= LB.cols || b >= LB.rows) ? 64 : sdfArr[b * LB.cols + a];
    return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz;
  }
  function grad(x, z) {
    const e = 0.5, gx = sdf(x + e, z) - sdf(x - e, z), gz = sdf(x, z + e) - sdf(x, z - e), l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  }

  // ---------- mặt nạ sâu ----------
  const MS = 2048;
  function maskAt(x, z, ch) {
    const u = (x + 750) / 1500, v = (z + 750) / 1500;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return ch === 1 ? 255 : 255;
    return mask[(Math.floor(v * MS) * MS + Math.floor(u * MS)) * 4 + ch];
  }
  const depth01 = (x, z) => maskAt(x, z, 1) / 255;
  const steep01 = (x, z) => maskAt(x, z, 3) / 255;

  // ---------- vùng (ZoneCollider): cầu hoặc capsule chiếu xuống mặt xz ----------
  function inCollider(c, x, z) {
    const sc = c.scale || [1, 1, 1], ry = c.rotY || 0, cs = Math.cos(ry), sn = Math.sin(ry);
    const cen = c.center || [0, 0, 0];
    // three.js: quay quanh +y, (x, z) → (x cos + z sin, −x sin + z cos)
    const ox = c.pos[0] + cen[0] * sc[0] * cs + cen[2] * sc[2] * sn, oz = c.pos[2] - cen[0] * sc[0] * sn + cen[2] * sc[2] * cs;
    const dx = x - ox, dz = z - oz;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; // về hệ cục bộ
    const r = c.radius * Math.max(sc[0], sc[2]);
    if (c.shape === 'sphere' || c.direction === 'y') return lx * lx + lz * lz <= r * r;
    if (c.shape === 'capsule') {
      const half = Math.max(0, c.height / 2 - c.radius) * (c.direction === 'x' ? sc[0] : sc[2]);
      const ax = c.direction === 'x' ? Math.max(-half, Math.min(half, lx)) : 0, az = c.direction === 'z' ? Math.max(-half, Math.min(half, lz)) : 0;
      return (lx - ax) ** 2 + (lz - az) ** 2 <= r * r;
    }
    if (c.shape === 'box' && c.size) return Math.abs(lx) <= c.size[0] * sc[0] / 2 && Math.abs(lz) <= c.size[2] * sc[2] / 2;
    return false;
  }
  function zoneAt(x, z) {
    // [ĐỀ XUẤT] Iron Rig không có ZoneEnum (CODE.md 9): coi vòng 150 m quanh bến Iron Rig là vùng đó
    if (W.ironRig && Math.hypot(x - W.ironRig[0], z - W.ironRig[1]) < 150) return 'IRON_RIG';
    for (const v of zones) if (v.colliders.some(c => inCollider(c, x, z))) return v.zoneNames[0];
    return 'OPEN_OCEAN';
  }

  // ---------- vật liệu ----------
  const matCache = new Map();
  let triTex = {};
  const srgb = (r, g, b) => new T.Color(r, g, b);
  function convertMaterial(src) {
    if (matCache.has(src)) return matCache.get(src);
    const ex = src.userData || {}, shader = ex.shader || '';
    let m = null;
    if (/DepthMask/.test(shader) || ex.mask) { matCache.set(src, null); return null; }
    m = new T.MeshLambertMaterial({
      color: src.color.clone(), map: src.map || null, vertexColors: !!src.vertexColors,
      alphaTest: src.alphaTest || 0, side: src.side, transparent: src.transparent, opacity: src.opacity
    });
    m.name = src.name;
    if (/Foliage|Billboard|Cutout/.test(shader)) { m.side = T.DoubleSide; if (!m.alphaTest && src.transparent) m.alphaTest = 0.5; m.transparent = false; }
    if (/TransparentIce/.test(shader)) { m.transparent = true; m.opacity = 0.6; m.depthWrite = false; }
    if (/Triplanar/.test(shader) && triTex[ex.triplanarTexture]) {
      const tex = triTex[ex.triplanarTexture];
      m.onBeforeCompile = sh => {
        sh.uniforms.uTri = { value: tex };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 triW = modelMatrix * vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n triW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\n#endif\n vTriP = triW.xyz; vTriN = normalize(mat3(modelMatrix) * objectNormal);\n#ifdef USE_INSTANCING\n vTriN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);\n#endif');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uTri; varying vec3 vTriP; varying vec3 vTriN;')
          .replace('#include <map_fragment>', `#include <map_fragment>
  { vec3 bw = pow(abs(normalize(vTriN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    // [ĐỀ XUẤT] tỉ lệ 1/14 m; ba kênh R/G/B của *_RGB là ba lớp nhiễu đơn sắc, mỗi mặt chiếu lấy một kênh
    vec3 s = vTriP / 14.0;
    float d = texture2D(uTri, s.zy).r * bw.x + texture2D(uTri, s.xz).g * bw.y + texture2D(uTri, s.xy).b * bw.z;
    diffuseColor.rgb *= mix(0.72, 1.28, d); }`);
      };
      m.customProgramCacheKey = () => 'tri';
    }
    // [ĐỀ XUẤT] đèn treo và đèn giàn khoan sáng lên theo sceneLights (TimeController) ban đêm
    if (/HangingLamp|RigLights/.test(src.name)) { m.emissive = srgb(1, 0.72, 0.38); m.emissiveIntensity = 0; W.lampMats.push(m); }
    matCache.set(src, m);
    return m;
  }

  // ---------- ô cảnh vật ----------
  let inst = null, variants = {};
  const _m = new T.Matrix4(), _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3(), _c = new T.Vector3();
  function buildCell(key) {
    const cell = W.cells[key];
    const g = new T.Group(); g.name = 'cell ' + key;
    let count = 0;
    for (const [mid, [off, n]] of Object.entries(cell.entries)) {
      const parts = variants[mid];
      if (!parts || !parts.length) continue;
      const meta = W.data.world.meshes[mid];
      const bb = meta.bbox, lc = new T.Vector3((bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, (bb[0][2] + bb[1][2]) / 2);
      const lr = Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) / 2;
      const mats = [];
      const sphere = new T.Sphere(); let first = true;
      for (let k = 0; k < n; k++) {
        const b = (off + k) * 10;
        _p.set(inst[b], inst[b + 1], inst[b + 2]); _q.set(inst[b + 3], inst[b + 4], inst[b + 5], inst[b + 6]);
        _s.set(inst[b + 7], inst[b + 8], inst[b + 9]);
        const m = new T.Matrix4().compose(_p, _q, _s); mats.push(m);
        _c.copy(lc).applyMatrix4(m);
        const s = new T.Sphere(_c.clone(), lr * Math.max(_s.x, _s.y, _s.z));
        if (first) { sphere.copy(s); first = false; } else sphere.union(s);
      }
      for (const part of parts) {
        // hình học bọc: dùng chung attribute (GPU buffer một lần) nhưng có bounding sphere riêng để frustum cull theo ô
        const geo = new T.BufferGeometry();
        for (const [name, a] of Object.entries(part.geo.attributes)) geo.setAttribute(name, a);
        geo.setIndex(part.geo.index);
        geo.boundingSphere = sphere.clone();
        const im = new T.InstancedMesh(geo, part.mat, n);
        for (let k = 0; k < n; k++) im.setMatrixAt(k, part.local ? _m.multiplyMatrices(mats[k], part.local) : mats[k]);
        im.instanceMatrix.needsUpdate = true;
        im.matrixAutoUpdate = false;
        im.userData.mr = lr;
        g.add(im);
        W.stats.meshes++;
      }
      count += n;
    }
    cell.group = g; cell.count = count;
    return g;
  }
  function stream(x, z) {
    for (const [key, c] of Object.entries(W.cells)) {
      const dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1), d = Math.hypot(dx, dz);
      const on = W.loaded.has(key);
      if (!on && d < LOAD_R) {
        if (!c.group) buildCell(key);
        scene.add(c.group); W.loaded.add(key);
      } else if (on && d > UNLOAD_R) {
        scene.remove(c.group); W.loaded.delete(key);
      }
    }
    W.stats.cells = W.loaded.size;
    W.stats.instances = [...W.loaded].reduce((s, k) => s + W.cells[k].count, 0);
  }

  // ---------- đáy biển ----------
  function seabed(px, Tm) {
    const step = 4, gw = Math.floor((Tm.width - 1) / step) + 1, gh = Math.floor((Tm.height - 1) / step) + 1;
    const geo = new T.PlaneGeometry(1, 1, gw - 1, gh - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const sand = new T.Color(0.46, 0.40, 0.29), deep = new T.Color(0.035, 0.06, 0.06), c = new T.Color();
    for (let r = 0; r < gh; r++) for (let q = 0; q < gw; q++) {
      const ix = Math.min(Tm.width - 1, q * step), iz = Math.min(Tm.height - 1, r * step), k = (iz * Tm.width + ix) * 4;
      const y = Tm.y0 + (px[k] * 256 + px[k + 1]) / 65535 * Tm.sizeY, v = r * gw + q;
      pos.setXYZ(v, Tm.x0 + ix * Tm.sizeX / (Tm.width - 1), Math.min(y, -0.35), Tm.z0 + iz * Tm.sizeZ / (Tm.height - 1));
      c.copy(sand).lerp(deep, Math.min(1, Math.pow(-y / 40, 0.6)));
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'seabed';
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  // ---------- nạp ----------
  async function load(get, renderer, sc) {
    scene = sc;
    const [world, markers, sceneTxt, instBuf, glbBuf, terrBuf, landBuf, maskBuf] = await Promise.all([
      get(DIR + 'world.json', 'json'), get(DIR + 'markers.json', 'json'), get(DIR + 'scene_config.json', 'text'),
      get(DIR + 'instances.bin', 'buffer'), get(DIR + 'lib.glb', 'buffer'), get(DIR + 'terrain_rg.png', 'buffer'),
      get(DIR + 'landmask.png', 'buffer'), get(DIR + 'depthmask.png', 'buffer')
    ]);
    // scene_config.json có Infinity (tiếp tuyến bậc thang của AnimationCurve) — không phải JSON hợp lệ.
    const sceneCfg = JSON.parse(sceneTxt.replace(/-?Infinity/g, m => m[0] === '-' ? '-1e30' : '1e30').replace(/\bNaN\b/g, '0'));
    W.data = { world, markers, scene: sceneCfg };
    inst = new Float32Array(instBuf);
    zones = markers.volumes.filter(v => v.type === 'zone' && v.active !== false);
    const ir = markers.docks.find(d => d.dockData && d.dockData.id === 'dock.the-iron-rig');
    if (ir) W.ironRig = [ir.pos[0], ir.pos[2]];

    // mặt nạ sâu: texture cho shader + bản CPU đọc từ GPU
    const mbmp = await bitmap(maskBuf, true);
    const mt = new T.Texture(mbmp);
    mt.flipY = false; mt.premultiplyAlpha = false; mt.generateMipmaps = false;
    mt.minFilter = T.LinearFilter; mt.magFilter = T.LinearFilter; mt.wrapS = mt.wrapT = T.ClampToEdgeWrapping;
    mt.needsUpdate = true;
    W.maskTex = mt;
    mask = readTexture(renderer, mt, MS, MS);

    // đất: trường khoảng cách + texture bọt (R8, 0..64 m)
    const L = world.landmask, lpx = pixels(await bitmap(landBuf));
    LB = W.landBox = { x0: L.x0, z0: L.z0, res: L.metresPerPixel, cols: L.width, rows: L.height, w: L.width * L.metresPerPixel, h: L.height * L.metresPerPixel };
    const sd = buildSdf(lpx, L.width, L.height);
    sdfArr = sd.sdf;
    const lt = new T.DataTexture(sd.foam, L.width, L.height, T.RedFormat, T.UnsignedByteType);
    lt.minFilter = T.LinearFilter; lt.magFilter = T.LinearFilter; lt.unpackAlignment = 1; lt.needsUpdate = true;
    W.landTex = lt;

    // đáy biển
    const Tm = world.terrain;
    W.seabed = seabed(pixels(await bitmap(terrBuf)), Tm);
    scene.add(W.seabed);

    // thư viện lưới
    const gltf = await new Promise((res, rej) => {
      const l = new T.GLTFLoader(); l.setMeshoptDecoder(root.MeshoptDecoder);
      l.parse(glbBuf, '', res, rej);
    });
    const imgs = gltf.parser.json.images || [];
    for (let i = 0; i < imgs.length; i++) if (/_RGB$/.test(imgs[i].name)) {
      const t = await gltf.parser.loadImageSource(i, gltf.parser.textureLoader);
      t.wrapS = t.wrapT = T.RepeatWrapping; t.flipY = false; t.needsUpdate = true;
      triTex[imgs[i].name] = t;
    }
    gltf.scene.updateMatrixWorld(true);
    for (const node of gltf.scene.children) {
      if (!/^m\d+$/.test(node.name)) continue;
      const parts = [];
      const inv = new T.Matrix4().copy(node.matrixWorld).invert();
      node.traverse(o => {
        if (!o.isMesh) return;
        const mat = convertMaterial(o.material);
        if (!mat) return;
        // lưới con có thể lệch khỏi node gốc (hiếm); giữ ma trận cục bộ so với node
        const local = o === node ? null : new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        parts.push({ geo: o.geometry, mat, local: local && !local.equals(new T.Matrix4()) ? local : null });
      });
      variants[node.name] = parts;
    }
    for (const [key, ents] of Object.entries(world.cells)) {
      const [cx, cz] = key.split(',').map(Number), C = world.cell;
      W.cells[key] = { entries: ents, x0: cx * C, z0: cz * C, x1: (cx + 1) * C, z1: (cz + 1) * C, group: null, count: 0 };
    }
  }

  // Bỏ vẽ cụm instanced nằm hẳn trong sương hoặc quá xa so với cỡ vật (đá nhỏ, bụi cây) — [ĐỀ XUẤT] 80 m + 20 × bán kính lưới.
  const _v = new T.Vector3();
  function cull(cam, far) {
    for (const key of W.loaded) for (const im of W.cells[key].group.children) {
      const sp = im.geometry.boundingSphere;
      im.visible = _v.copy(sp.center).distanceTo(cam) - sp.radius < Math.min(far, 80 + im.userData.mr * 20);
    }
  }

  function setNight(k) { for (const m of W.lampMats) m.emissiveIntensity = k * 1.4; }

  // ---------- va chạm thuyền (hộp hướng theo yaw) với mặt nạ đất ----------
  // Trả về { nx, nz, impact } với impact = tốc độ đâm theo pháp tuyến (m/s), hoặc null khi không chạm.
  function resolve(b, halfW, halfL) {
    let hit = null;
    for (let it = 0; it < 4; it++) {
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = -fz, rz = fx;
      let worst = 0, wx = 0, wz = 0;
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) {
        const px = b.x + rx * halfW * u + fx * halfL * v, pz = b.z + rz * halfW * u + fz * halfL * v;
        const d = sdf(px, pz);
        if (d < worst) { worst = d; wx = px; wz = pz; }
      }
      if (worst >= 0) break;
      const [nx, nz] = grad(wx, wz);
      b.x += nx * (-worst + 0.01); b.z += nz * (-worst + 0.01);
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= nx * vn; b.vz -= nz * vn;
        if (!hit || -vn > hit.impact) hit = { nx, nz, impact: -vn };
      } else if (!hit) hit = { nx, nz, impact: 0 };
    }
    return hit;
  }

  Object.assign(W, { load, stream, cull, sdf, grad, depth01, steep01, zoneAt, setNight, resolve, isLand: (x, z) => sdf(x, z) < 0 });
})(window);
