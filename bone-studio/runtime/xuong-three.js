// three.js adapter for Xưởng Xương skeletons (three r160+, ESM).
//   import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
//   import { loadSkeleton } from "./xuong-player.js?v=20261125o";
//   import { XuongMesh } from "./xuong-three.js?v=20261125o";
//   const m = new XuongMesh(THREE, await loadSkeleton("pharaoh.xuong.json"), { pixelsPerUnit: 100 });
//   m.play("walk"); scene.add(m); mỗi khung: m.update(dt);
// Một BufferGeometry cho mỗi (trang atlas, additive hay không); vị trí/uv/màu dựng lại mỗi khung từ drawList.
// Thứ tự vẽ giữ nguyên trong từng geometry (thứ tự tam giác); giữa các geometry dùng renderOrder theo slot đầu tiên.
import { buildSkeleton, setupPose, updateWorld, Physics, drawList, AnimationState, bounds as listBounds } from "./xuong.js?v=20261125o";

// XuongMesh là Object3D của THREE được truyền vào: `new XuongMesh(THREE, data, opts)` trả về một lớp con của THREE.Object3D
// (dựng một lần cho mỗi bản THREE). Lớp này chỉ mang các phương thức bên dưới.
export class XuongMesh {
  constructor(THREE, { doc, images }, { skin = "default", pixelsPerUnit = 100, zStep = 0.0001, renderOrder = 0 } = {}) {
    XuongMesh._cls ??= new Map();
    let C = XuongMesh._cls.get(THREE.Object3D);
    if (!C) {
      C = class XuongMeshObject extends THREE.Object3D {};
      for (const k of Object.getOwnPropertyNames(XuongMesh.prototype)) if (k !== "constructor") Object.defineProperty(C.prototype, k, Object.getOwnPropertyDescriptor(XuongMesh.prototype, k));
      Object.defineProperty(XuongMesh, Symbol.hasInstance, { value: (o) => [...XuongMesh._cls.values()].some((c) => o instanceof c), configurable: true });
      XuongMesh._cls.set(THREE.Object3D, C);
    }
    const self = new C();
    self.THREE = THREE; self.doc = doc; self.images = images; self.skin = skin; self.ppu = pixelsPerUnit; self.zStep = zStep; self.baseOrder = renderOrder;
    self.sk = buildSkeleton(doc);
    self.state = new AnimationState(self.sk);
    self.pose = setupPose(self.sk, skin);
    self._events = [];
    self.state.listeners.push((e) => self._events.push(e));
    self._groups = new Map(); self._textures = new Map(); self._list = [];
    self.name = doc.name ?? "XuongMesh";
    self._rebuild();
    return self;
  }
}

Object.defineProperties(XuongMesh.prototype, Object.fromEntries(Object.entries({
  play(name, { loop = true, track = 0, mix } = {}) {
    if (mix !== undefined) this.state.defaultMix = mix;
    return this.state.setAnimation(track, name, loop);
  },
  // trả về các event bắn trong khung này
  update(dt) {
    this.state.update(dt);
    this.pose = setupPose(this.sk, this.skin);
    this.state.apply(this.pose);
    updateWorld(this.sk, this.pose);
    if (this.sk.physics.length) { (this.physics ??= new Physics(this.sk)).step(this.pose, dt); this.physics.apply(this.pose); }
    this._rebuild();
    const ev = this._events; this._events = [];
    return ev;
  },
  // hộp bao theo đơn vị three (đã chia pixelsPerUnit), chưa nhân scale của Object3D
  bounds() {
    const b = listBounds(this._list), k = 1 / this.ppu;
    return { x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k };
  },
  dispose() {
    for (const g of this._groups.values()) { g.mesh.geometry.dispose(); g.mesh.material.dispose(); this.remove(g.mesh); }
    for (const t of this._textures.values()) t.dispose();
    this._groups.clear(); this._textures.clear();
  },
  _texture(source) {
    let t = this._textures.get(source);
    if (!t) {
      const T = this.THREE;
      t = new T.Texture(source);
      t.colorSpace = T.SRGBColorSpace;
      t.generateMipmaps = false;
      t.magFilter = t.minFilter = this.doc.pixelArt ? T.NearestFilter : T.LinearFilter;
      t.needsUpdate = true;
      this._textures.set(source, t);
    }
    return t;
  },
  _group(source, blend) {
    const key = blend + "|" + (this._textures.get(source)?.id ?? (this._texture(source), this._textures.get(source).id));
    let g = this._groups.get(key);
    if (g) return g;
    const T = this.THREE;
    const geo = new T.BufferGeometry();
    const mat = new T.MeshBasicMaterial({ map: this._texture(source), vertexColors: true, transparent: true, depthWrite: false, depthTest: false, side: T.DoubleSide });
    // tint black: per-vertex dark colour; texture black → dark, white → light (vertex colour)
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 xxDark;\nvarying vec3 vXxDark;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvXxDark = xxDark;");
      // tints mix in sRGB like canvas2D and Spine: texel (decoded to linear by three) → sRGB, tint, → linear
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vXxDark;\nvec3 xxToSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }\nvec3 xxToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }")
        .replace("#include <map_fragment>", "vec4 xxTex = texture2D( map, vMapUv );")
        .replace("#include <color_fragment>", "diffuseColor.rgb = xxToLin(vXxDark + ( diffuseColor.rgb * vColor.rgb - vXxDark ) * xxToSrgb(xxTex.rgb));\ndiffuseColor.a *= vColor.a * xxTex.a;");
    };
    if (blend === "additive") mat.blending = T.AdditiveBlending;
    else if (blend === "multiply") mat.blending = T.MultiplyBlending;
    const mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = true;
    this.add(mesh);
    g = { mesh, geo, cap: 0, capIdx: 0, pos: null, uv: null, col: null, dark: null, idx: null, source, nv: 0, ni: 0 };
    this._groups.set(key, g);
    return g;
  },
  _grow(g, nv, ni) {
    if (nv <= g.cap && ni <= g.capIdx) return;
    const T = this.THREE, cap = Math.max(64, g.cap, nv), capIdx = Math.max(96, g.capIdx, ni);
    const grow = (a, n) => { const b = new Float32Array(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; };
    g.pos = grow(g.pos, cap * 3); g.uv = grow(g.uv, cap * 2); g.col = grow(g.col, cap * 4); g.dark = grow(g.dark, cap * 3);
    const idx = new Uint32Array(capIdx); if (g.idx) idx.set(g.idx.subarray(0, Math.min(g.idx.length, capIdx))); g.idx = idx;
    g.cap = cap; g.capIdx = capIdx;
    g.geo.setAttribute("position", new T.BufferAttribute(g.pos, 3).setUsage(T.DynamicDrawUsage));
    g.geo.setAttribute("uv", new T.BufferAttribute(g.uv, 2).setUsage(T.DynamicDrawUsage));
    g.geo.setAttribute("color", new T.BufferAttribute(g.col, 4).setUsage(T.DynamicDrawUsage));
    g.geo.setAttribute("xxDark", new T.BufferAttribute(g.dark, 3).setUsage(T.DynamicDrawUsage));
    g.geo.setIndex(new T.BufferAttribute(g.idx, 1).setUsage(T.DynamicDrawUsage));
  },
  _rebuild() {
    const list = this._list = drawList(this.sk, this.pose), k = 1 / this.ppu;
    // vòng 1: đếm
    const used = new Map();
    list.forEach((d, n) => {
      const im = this.images.get(d.image); if (!im) return;
      const g = this._group(im.source.source ?? im.source, d.blend === "additive" ? "additive" : d.blend === "multiply" ? "multiply" : "normal");
      let u = used.get(g); if (!u) { used.set(g, (u = { nv: 0, ni: 0 })); g.mesh.renderOrder = this.baseOrder + n; }
      const isMesh = d.mesh ?? d.att.type === "mesh";
      u.nv += isMesh ? d.verts.length / 2 : 4; u.ni += isMesh ? d.tris.length : 6;
    });
    for (const [g, u] of used) { this._grow(g, u.nv, u.ni); g.nv = 0; g.ni = 0; }
    // vòng 2: ghi
    list.forEach((d, n) => {
      const im = this.images.get(d.image); if (!im) return;
      const src = im.source.source ?? im.source;
      const g = this._group(src, d.blend === "additive" ? "additive" : d.blend === "multiply" ? "multiply" : "normal");
      const u = used.get(g);
      const z = n * this.zStep, W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
      const { x: sx, y: sy, w, h, offX, offY, origW, origH } = im, rot = im.rotate === true || im.rotate === 90;
      const c = d.color, v = d.verts, dk = d.dark ?? [0, 0, 0];
      const put = (x, y, px, py) => { // px,py: pixel trong vùng đóng gói (py hướng xuống) -> uv trang
        const gx = rot ? sx + (h - py) : sx + px, gy = rot ? sy + px : sy + py;
        const i = g.nv++;
        g.pos[i * 3] = x * k; g.pos[i * 3 + 1] = y * k; g.pos[i * 3 + 2] = z;
        g.uv[i * 2] = gx / W; g.uv[i * 2 + 1] = 1 - gy / H;
        g.col[i * 4] = c[0]; g.col[i * 4 + 1] = c[1]; g.col[i * 4 + 2] = c[2]; g.col[i * 4 + 3] = c[3];
        g.dark[i * 3] = dk[0]; g.dark[i * 3 + 1] = dk[1]; g.dark[i * 3 + 2] = dk[2];
      };
      if (d.mesh ?? d.att.type === "mesh") {
        const base = g.nv, uv = d.uvs, top = origH - offY - h;
        for (let i = 0; i < v.length / 2; i++) {
          const px = Math.min(w, Math.max(0, uv[i * 2] * origW - offX)), py = Math.min(h, Math.max(0, uv[i * 2 + 1] * origH - top));
          put(v[i * 2], v[i * 2 + 1], px, py);
        }
        for (let i = 0; i < d.tris.length; i++) g.idx[g.ni++] = base + d.tris[i];
      } else {
        // quad BL,BR,TR,TL; chỉ phủ phần đã đóng gói (atlas có thể đã cắt viền trong suốt)
        const ux = [v[2] - v[0], v[3] - v[1]], uy = [v[6] - v[0], v[7] - v[1]];
        const f0x = offX / origW, f1x = (offX + w) / origW, f0y = offY / origH, f1y = (offY + h) / origH;
        const at = (fx, fy) => [v[0] + ux[0] * fx + uy[0] * fy, v[1] + ux[1] * fx + uy[1] * fy];
        const base = g.nv;
        let p = at(f0x, f0y); put(p[0], p[1], 0, h);
        p = at(f1x, f0y); put(p[0], p[1], w, h);
        p = at(f1x, f1y); put(p[0], p[1], w, 0);
        p = at(f0x, f1y); put(p[0], p[1], 0, 0);
        for (const t of [0, 1, 2, 2, 3, 0]) g.idx[g.ni++] = base + t;
      }
    });
    for (const g of this._groups.values()) {
      const u = used.get(g);
      if (!u) { g.mesh.visible = false; continue; }
      g.mesh.visible = true;
      g.geo.setDrawRange(0, g.ni);
      g.geo.attributes.position.needsUpdate = g.geo.attributes.uv.needsUpdate = g.geo.attributes.color.needsUpdate = g.geo.attributes.xxDark.needsUpdate = true;
      g.geo.index.needsUpdate = true;
    }
  },
}).map(([k, v]) => [k, { value: v, writable: true, configurable: true }])));
