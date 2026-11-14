// Voxel Lab - renderer: chunk meshes for voxel grids, lighting volumes (0.2 m density for AO, 0.4 m sky
// visibility), one sun shadow map, instanced debris cubes, dust/fire sprites and the post chain.
// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/voxel-render.md §3-§8 and §13; code is our own.
import * as THREE from '../../vendor/three.module.min.js';
import { meshChunk } from '../mesher.js';
import { palette, colors } from '../materials.js';
import * as SH from './shaders.js';

const SUN = new THREE.Vector3(-0.40, 0.72, -0.56).normalize(); // elevation as the reference default (voxel-render.md §4.3), turned to light the fronts

function makeNoise() {
  // 128^2 tiling RGBA: r,g = smooth value noise (octaves 4..64 cells, each x0.55), b,a = white noise
  const N = 128, d = new Uint8Array(N * N * 4);
  let s = 0x2f6e2b1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let ch = 0; ch < 2; ch++) {
    const acc = new Float32Array(N * N); let amp = 1, tot = 0;
    for (let cells = 4; cells <= 64; cells *= 2) {
      const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rnd();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = x / N * cells, fy = y / N * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
        let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = g[x0 % cells + cells * (y0 % cells)], b = g[(x0 + 1) % cells + cells * (y0 % cells)];
        const c = g[x0 % cells + cells * ((y0 + 1) % cells)], e = g[(x0 + 1) % cells + cells * ((y0 + 1) % cells)];
        acc[x + N * y] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty);
      }
      tot += amp; amp *= 0.55;
    }
    let mn = 1e9, mx = -1e9; for (const v of acc) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    for (let i = 0; i < N * N; i++) d[i * 4 + ch] = Math.round((acc[i] - mn) / (mx - mn) * 255);
  }
  for (let i = 0; i < N * N; i++) { d[i * 4 + 2] = rnd() * 256; d[i * 4 + 3] = rnd() * 256; }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/** Meshes of one VoxelGrid (the world, a rigid body or a mob part), remeshed chunk by chunk when dirty. */
export class GridView {
  constructor(R, grid, off = null) {
    this.R = R; this.grid = grid;
    this.group = new THREE.Group(); this.group.scale.setScalar(0.1);
    this.inner = new THREE.Group(); this.group.add(this.inner);
    this.off = off || [0, 0, 0];
    this.inner.position.set(-this.off[0], -this.off[1], -this.off[2]);
    this.meshes = new Map();
    this.quads = 0;
  }
  /** remesh dirty chunks until `deadline` (performance.now()); returns chunks left */
  flush(deadline, cam) {
    const g = this.grid, list = g.dirtyList;
    if (!list.length) return 0;
    if (cam && list.length > 6) { // nearest first
      const cx = cam.x * 10 / 32, cy = cam.y * 10 / 32, cz = cam.z * 10 / 32, L = g.cx * g.cz;
      const dist = id => { const x = id % g.cx - cx, z = ((id / g.cx) | 0) % g.cz - cz, y = ((id / L) | 0) - cy; return x * x + y * y + z * z; };
      list.sort((a, b) => dist(b) - dist(a)); // pop() takes from the end
    }
    while (list.length) {
      const id = list.pop(); g.meshDirty[id] = 0;
      this.remesh(id);
      if (performance.now() > deadline) break;
    }
    return list.length;
  }
  remesh(id) {
    const g = this.grid, R = this.R;
    let e = this.meshes.get(id);
    const data = meshChunk(g, id);
    if (e) { for (const k of ['o', 'g']) if (e[k]) { this.quads -= e[k].userData.n; this.inner.remove(e[k]); e[k].geometry.dispose(); e[k] = null; } }
    if (!data.opaque && !data.glass) { if (e) this.meshes.delete(id); return; }
    if (!e) { e = { o: null, g: null }; this.meshes.set(id, e); }
    const bx = (id % g.cx) * 32 + 16, bz = (((id / g.cx) | 0) % g.cz) * 32 + 16, by = ((id / (g.cx * g.cz)) | 0) * 32 + 16;
    const mk = (d, mat, layer, order) => {
      const geo = new THREE.BufferGeometry();
      if (this.off[0] || this.off[1] || this.off[2]) { const p = d.pos, o = this.off; for (let i = 0; i < p.length; i += 3) { p[i] += o[0]; p[i + 1] += o[1]; p[i + 2] += o[2]; } }
      geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
      geo.setAttribute('aInfo', new THREE.BufferAttribute(d.info, 4));
      geo.setAttribute('aQuad', new THREE.BufferAttribute(d.quad, 4));
      geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(bx + this.off[0], by + this.off[1], bz + this.off[2]), 28);
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false; m.layers.set(layer); m.renderOrder = order; m.userData.n = d.n;
      this.inner.add(m); this.quads += d.n;
      return m;
    };
    if (data.opaque) e.o = mk(data.opaque, R.matSurface, 0, 0);
    if (data.glass) e.g = mk(data.glass, R.matGlass, 1, 5);
  }
  dispose() {
    for (const e of this.meshes.values()) for (const k of ['o', 'g']) if (e[k]) { e[k].geometry.dispose(); }
    this.meshes.clear(); this.group.removeFromParent();
  }
}

export class LabRenderer {
  constructor(canvas, sx, sy, sz) {
    this.canvas = canvas;
    const r = this.gl3 = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.autoClear = true; r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.08, 600);
    this.camera.layers.enable(1);
    this.sx = sx; this.sy = sy; this.sz = sz;
    // volumes
    this.DX = sx >> 1; this.DY = sy >> 1; this.DZ = sz >> 1;
    this.dens = new Uint8Array(this.DX * this.DY * this.DZ);
    this.densTex = new THREE.Data3DTexture(this.dens, this.DX, this.DY, this.DZ);
    this.densTex.format = THREE.RedFormat; this.densTex.type = THREE.UnsignedByteType; this.densTex.minFilter = this.densTex.magFilter = THREE.LinearFilter;
    this.densTex.unpackAlignment = 1; this.densTex.needsUpdate = true;
    this.KX = sx >> 2; this.KY = sy >> 2; this.KZ = sz >> 2;
    this.sky = new Uint8Array(this.KX * this.KY * this.KZ).fill(255);
    this.skyTex = new THREE.Data3DTexture(this.sky, this.KX, this.KY, this.KZ);
    this.skyTex.format = THREE.RedFormat; this.skyTex.type = THREE.UnsignedByteType; this.skyTex.minFilter = this.skyTex.magFilter = THREE.LinearFilter;
    this.skyTex.unpackAlignment = 1; this.skyTex.needsUpdate = true;
    this.skyDirty = null; this.skyLast = 0; this.densFull = false;
    // palette + noise
    const palTex = new THREE.DataTexture(palette, 256, 3, THREE.RGBAFormat); palTex.needsUpdate = true;
    this.noise = makeNoise();
    // shadow
    this.shadowSize = 2048;
    this.shadowCam = new THREE.OrthographicCamera(-30, 30, 30, -30, 1, 320);
    this.shadowCam.layers.set(0);
    this.shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.shadowFocus = new THREE.Vector3(1e9, 0, 0); this.shadowR = 30; this.shadowDirty = true;
    this.makeShadowRT();
    this.sunDir = SUN.clone();
    const U = this.U = {
      uDensity: { value: this.densTex }, uSkyVis: { value: this.skyTex }, uShadow: { value: this.shadowRT.depthTexture },
      uShadowMat: { value: new THREE.Matrix4() }, uSunDir: { value: this.sunDir },
      uSunCol: { value: new THREE.Vector3(1.0, 0.93, 0.82).multiplyScalar(2.6) },
      uAmbSky: { value: new THREE.Vector3(0.50, 0.66, 1.0).multiplyScalar(0.62) },
      uAmbGround: { value: new THREE.Vector3(0.42, 0.38, 0.32).multiplyScalar(0.34) },
      uFogCol: { value: new THREE.Vector3(0.50, 0.63, 0.86).multiplyScalar(0.62) },
      uZenith: { value: new THREE.Vector3(0.10, 0.25, 0.70).multiplyScalar(0.62) },
      uHorizon: { value: new THREE.Vector3(0.44, 0.60, 0.90).multiplyScalar(0.66) },
      uVolSize: { value: new THREE.Vector3(sx * 0.1, sy * 0.1, sz * 0.1) },
      uShadowTexel: { value: 1 / 2048 }, uShadowWorldTexel: { value: 60 / 2048 }, uTime: { value: 0 },
      uPalette: { value: palTex }, uNoise: { value: this.noise },
      uScorch: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, -100, 0, 1)) }, uScorchN: { value: 0 }, uBevel: { value: 1 },
    };
    this.matSurface = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.SURFACE_VERT, fragmentShader: SH.SURFACE_FRAG });
    this.matGlass = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: SH.SURFACE_VERT, fragmentShader: SH.GLASS_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, side: THREE.DoubleSide,
    });
    // sky dome
    const sky = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.SKY_VERT, fragmentShader: SH.SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true }));
    sky.frustumCulled = false; sky.layers.set(1); sky.renderOrder = -10; this.scene.add(sky);
    // far field lawn (a frame of four slabs around the live box)
    const farMat = new THREE.ShaderMaterial({ uniforms: { ...U, uGrass: { value: new THREE.Vector3(86 / 255, 134 / 255, 54 / 255) } }, vertexShader: SH.FAR_VERT, fragmentShader: SH.FAR_FRAG });
    const wx = sx * 0.1, wz = sz * 0.1, far = 500, gy = 0.8;
    for (const [x0, z0, x1, z1] of [[-far, -far, wx + far, 0], [-far, wz, wx + far, wz + far], [-far, 0, 0, wz], [wx, 0, wx + far, wz]]) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), farMat); pm.rotation.x = -Math.PI / 2; pm.position.set((x0 + x1) / 2, gy, (z0 + z1) / 2); pm.layers.set(1); pm.frustumCulled = false; this.scene.add(pm);
    }
    // debris cubes
    this.debrisCap = 8192;
    const dm = this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.DEBRIS_VERT, fragmentShader: SH.DEBRIS_FRAG }), this.debrisCap);
    dm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisCol = new THREE.InstancedBufferAttribute(new Float32Array(this.debrisCap * 3), 3); this.debrisCol.setUsage(THREE.DynamicDrawUsage);
    dm.geometry.setAttribute('iColor', this.debrisCol);
    dm.frustumCulled = false; dm.count = 0; this.scene.add(dm);
    // sprites
    this.spriteCap = 6000;
    const sg = new THREE.InstancedBufferGeometry();
    const pg = new THREE.PlaneGeometry(1, 1);
    sg.setAttribute('position', pg.getAttribute('position')); sg.setIndex(pg.getIndex());
    this.sPos = new THREE.InstancedBufferAttribute(new Float32Array(this.spriteCap * 4), 4); this.sCol = new THREE.InstancedBufferAttribute(new Float32Array(this.spriteCap * 4), 4); this.sMisc = new THREE.InstancedBufferAttribute(new Float32Array(this.spriteCap * 4), 4);
    for (const a of [this.sPos, this.sCol, this.sMisc]) a.setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('iPos', this.sPos); sg.setAttribute('iCol', this.sCol); sg.setAttribute('iMisc', this.sMisc);
    sg.instanceCount = 0;
    const sm = this.spriteMesh = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      uniforms: U, vertexShader: SH.SPRITE_VERT, fragmentShader: SH.SPRITE_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    }));
    sm.frustumCulled = false; sm.layers.set(1); sm.renderOrder = 10; this.scene.add(sm);
    this.spriteOrder = new Uint32Array(this.spriteCap); this.spriteDist = new Float32Array(this.spriteCap);
    // post
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene = new THREE.Scene();
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); this.fsQuad.frustumCulled = false; this.fsScene.add(this.fsQuad);
    const fsm = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: SH.FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.mSSAO = fsm(SH.SSAO_FRAG, { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() } });
    this.mDown = fsm(SH.BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.mUp = fsm(SH.BLOOM_UP_FRAG, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mComp = fsm(SH.COMPOSITE_FRAG, { tScene: { value: null }, tDepth: { value: null }, tAO: { value: null }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2() }, uAoTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uUseAO: { value: 1 }, uUseBloom: { value: 1 }, uFlash: { value: 0 } });
    this.views = [];
    this.quality = 'med'; this.pixelRatio = 1; this.w = 0; this.h = 0;
    this.stats = { draws: 0, tris: 0, quads: 0, remeshLeft: 0 };
    this.scorch = []; this.flash = 0;
    this.remeshBudget = 5;
    this.setQuality('med');
  }
  makeShadowRT() {
    if (this.shadowRT) this.shadowRT.dispose();
    const S = this.shadowSize;
    const rt = this.shadowRT = new THREE.WebGLRenderTarget(S, S, { depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(S, S, THREE.UnsignedIntType);
    rt.depthTexture.compareFunction = THREE.LessEqualCompare; rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.LinearFilter;
    if (this.U) this.U.uShadow.value = rt.depthTexture;
    this.shadowDirty = true;
  }
  setQuality(q) {
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = q === 'low' ? Math.min(dpr, 1) * 0.7 : q === 'med' ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
    const S = q === 'low' ? 1024 : q === 'med' ? 2048 : 4096;
    if (S !== this.shadowSize) { this.shadowSize = S; this.makeShadowRT(); }
    this.U.uBevel.value = q === 'low' ? 0 : 1;
    this.mComp.uniforms.uUseAO.value = q === 'low' ? 0 : 1; this.mComp.uniforms.uUseBloom.value = q === 'low' ? 0 : 1;
    this.remeshBudget = q === 'low' ? 4 : 6;
    this.w = 0; // force resize
  }
  resize() {
    const cw = this.canvas.clientWidth || 1, ch = this.canvas.clientHeight || 1;
    const w = Math.max(2, Math.round(cw * this.pixelRatio / 2) * 2), h = Math.max(2, Math.round(ch * this.pixelRatio / 2) * 2);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.gl3.setPixelRatio(1); this.gl3.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    for (const k of ['sceneRT', 'aoRT', 'b1', 'b2', 'b3', 'u2', 'u1']) if (this[k]) this[k].dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.sceneRT.depthTexture.minFilter = this.sceneRT.depthTexture.magFilter = THREE.NearestFilter;
    const half = (d, type) => new THREE.WebGLRenderTarget(Math.max(1, w >> d), Math.max(1, h >> d), { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.aoRT = half(1, THREE.UnsignedByteType);
    this.b1 = half(1, THREE.HalfFloatType); this.b2 = half(2, THREE.HalfFloatType); this.b3 = half(3, THREE.HalfFloatType);
    this.u2 = half(2, THREE.HalfFloatType); this.u1 = half(1, THREE.HalfFloatType);
  }
  addView(grid, off) { const v = new GridView(this, grid, off); this.views.push(v); this.scene.add(v.group); return v; }
  removeView(v) { const i = this.views.indexOf(v); if (i >= 0) this.views.splice(i, 1); v.dispose(); }

  /** density (AO) volume: fraction of each 0.2 m cell that is solid; only dirty chunks are recomputed and uploaded */
  updateVolumes(grid, now) {
    const list = grid.densList;
    if (list.length) {
      const gl = this.gl3.getContext(), many = list.length > 120 || this.densFull;
      const sub = this._sub || (this._sub = new Uint8Array(4096));
      const tp = this.gl3.properties.get(this.densTex);
      let n = 0;
      const max = many ? 4000 : 48;
      if (!many && tp.__webglTexture) { this.gl3.state.bindTexture(gl.TEXTURE_3D, tp.__webglTexture); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); }
      while (list.length && n < max) {
        const id = list.pop(); grid.densDirty[id] = 0; n++;
        const cxi = id % grid.cx, czi = ((id / grid.cx) | 0) % grid.cz, cyi = (id / (grid.cx * grid.cz)) | 0;
        const c = grid.chunks[id], has = c && grid.count[id] > 0;
        const X0 = cxi * 16, Y0 = cyi * 16, Z0 = czi * 16, DX = this.DX, DY = this.DY;
        for (let z = 0; z < 16; z++) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          let v = 0;
          if (has) {
            const i = (x * 2) + 32 * ((z * 2) + 32 * (y * 2));
            v = (c[i] ? 1 : 0) + (c[i + 1] ? 1 : 0) + (c[i + 32] ? 1 : 0) + (c[i + 33] ? 1 : 0) + (c[i + 1024] ? 1 : 0) + (c[i + 1025] ? 1 : 0) + (c[i + 1056] ? 1 : 0) + (c[i + 1057] ? 1 : 0);
            v = v === 8 ? 255 : v * 32;
          }
          sub[x + 16 * (y + 16 * z)] = v;
          this.dens[X0 + x + DX * (Y0 + y + DY * (Z0 + z))] = v;
        }
        if (!many && tp.__webglTexture) gl.texSubImage3D(gl.TEXTURE_3D, 0, X0, Y0, Z0, 16, 16, 16, gl.RED, gl.UNSIGNED_BYTE, sub);
        const d = this.skyDirty;
        if (!d) this.skyDirty = [X0 >> 1, Z0 >> 1, (X0 >> 1) + 8, (Z0 >> 1) + 8, (Y0 >> 1) + 8];
        else { d[0] = Math.min(d[0], X0 >> 1); d[1] = Math.min(d[1], Z0 >> 1); d[2] = Math.max(d[2], (X0 >> 1) + 8); d[3] = Math.max(d[3], (Z0 >> 1) + 8); d[4] = Math.max(d[4], (Y0 >> 1) + 8); }
      }
      if (many || !tp.__webglTexture) { this.densFull = list.length > 0; if (!this.densFull) this.densTex.needsUpdate = true; }
      this.shadowDirty = true;
    }
    if (this.skyDirty && !list.length && now - this.skyLast > 160) { this.sweepSky(this.skyDirty); this.skyDirty = null; this.skyLast = now; }
  }
  /** CPU top-down sky-visibility sweep over the dirty columns (voxel-render.md §4.1 weights 0.30 / 0.11 / 0.065, floor 0.72) */
  sweepSky(d) {
    const KX = this.KX, KY = this.KY, KZ = this.KZ, sky = this.sky, dens = this.dens, DX = this.DX, DY = this.DY;
    const x0 = Math.max(0, d[0] - 10), z0 = Math.max(0, d[1] - 10), x1 = Math.min(KX, d[2] + 10), z1 = Math.min(KZ, d[3] + 10), yTop = Math.min(KY - 1, d[4] + 2);
    const S = (x, y, z) => (x < 0 || z < 0 || x >= KX || z >= KZ) ? 255 : sky[x + KX * (y + KY * z)];
    for (let y = yTop; y >= 0; y--) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = x + KX * (y + KY * z);
      // occupancy of the 0.4 m cell = mean of its 8 density cells
      const j = x * 2 + DX * (y * 2 + DY * (z * 2));
      const occ = dens[j] + dens[j + 1] + dens[j + DX] + dens[j + DX + 1] + dens[j + DX * DY] + dens[j + DX * DY + 1] + dens[j + DX * DY + DX] + dens[j + DX * DY + DX + 1];
      if (occ > 8 * 150) { sky[i] = 0; continue; }
      if (y === KY - 1) { sky[i] = 255; continue; }
      const up = S(x, y + 1, z);
      let v = 0.30 * up + 0.11 * (S(x + 1, y + 1, z) + S(x - 1, y + 1, z) + S(x, y + 1, z + 1) + S(x, y + 1, z - 1))
        + 0.065 * (S(x + 2, y + 1, z) + S(x - 2, y + 1, z) + S(x, y + 1, z + 2) + S(x, y + 1, z - 2));
      v = Math.max(v, 0.72 * up) * (1 - occ / (8 * 255) * 0.5);
      sky[i] = v > 255 ? 255 : v;
    }
    this.skyTex.needsUpdate = true;
  }
  addScorch(x, y, z, reach) { this.scorch.push([x, y, z, reach]); if (this.scorch.length > 16) this.scorch.shift(); const a = this.U.uScorch.value; this.scorch.forEach((s, i) => a[i].set(s[0], s[1], s[2], s[3])); this.U.uScorchN.value = this.scorch.length; }
  clearScorch() { this.scorch.length = 0; this.U.uScorchN.value = 0; }

  /** debris: arrays from the sim (pos xyz, quat xyzw, size, material) */
  setDebris(n, px, py, pz, q, size, mat) {
    n = Math.min(n, this.debrisCap);
    const m = this.debrisMesh.instanceMatrix.array, c = this.debrisCol.array;
    for (let i = 0; i < n; i++) {
      const x = q[i * 4], y = q[i * 4 + 1], z = q[i * 4 + 2], w = q[i * 4 + 3], s = size[i], o = i * 16;
      const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
      m[o] = (1 - (yy + zz)) * s; m[o + 1] = (xy + wz) * s; m[o + 2] = (xz - wy) * s; m[o + 3] = 0;
      m[o + 4] = (xy - wz) * s; m[o + 5] = (1 - (xx + zz)) * s; m[o + 6] = (yz + wx) * s; m[o + 7] = 0;
      m[o + 8] = (xz + wy) * s; m[o + 9] = (yz - wx) * s; m[o + 10] = (1 - (xx + yy)) * s; m[o + 11] = 0;
      m[o + 12] = px[i]; m[o + 13] = py[i]; m[o + 14] = pz[i]; m[o + 15] = 1;
      const k = mat[i] * 3, j = ((i * 2654435761) >>> 0) / 4294967296 * 0.3 + 0.85;
      c[i * 3] = colors[k] / 255 * j; c[i * 3 + 1] = colors[k + 1] / 255 * j; c[i * 3 + 2] = colors[k + 2] / 255 * j;
    }
    if (n || this.debrisMesh.count) { this.debrisMesh.instanceMatrix.needsUpdate = true; this.debrisCol.needsUpdate = true; this.shadowDirty = true; }
    this.debrisMesh.count = n;
  }
  /** sprites: packed Float32 rows of 12 (pos xyz, size, rgb, opacity, kind, seed, glow, stretch), sorted far to near here */
  setSprites(n, rows) {
    n = Math.min(n, this.spriteCap);
    const cam = this.camera.position, ord = this.spriteOrder, dist = this.spriteDist;
    for (let i = 0; i < n; i++) { const o = i * 12, dx = rows[o] - cam.x, dy = rows[o + 1] - cam.y, dz = rows[o + 2] - cam.z; dist[i] = dx * dx + dy * dy + dz * dz; ord[i] = i; }
    const sub = ord.subarray(0, n); sub.sort((a, b) => dist[b] - dist[a]);
    const P = this.sPos.array, C = this.sCol.array, Mi = this.sMisc.array;
    for (let k = 0; k < n; k++) { const o = sub[k] * 12, t = k * 4; P[t] = rows[o]; P[t + 1] = rows[o + 1]; P[t + 2] = rows[o + 2]; P[t + 3] = rows[o + 3]; C[t] = rows[o + 4]; C[t + 1] = rows[o + 5]; C[t + 2] = rows[o + 6]; C[t + 3] = rows[o + 7]; Mi[t] = rows[o + 8]; Mi[t + 1] = rows[o + 9]; Mi[t + 2] = rows[o + 10]; Mi[t + 3] = rows[o + 11]; }
    if (n) { this.sPos.needsUpdate = true; this.sCol.needsUpdate = true; this.sMisc.needsUpdate = true; }
    this.spriteMesh.geometry.instanceCount = n; this.spriteMesh.visible = n > 0;
  }

  pass(mat, target) { this.fsQuad.material = mat; this.gl3.setRenderTarget(target); this.gl3.render(this.fsScene, this.fsCam); }

  render(dt, focus, worldGrid, moving) {
    const r = this.gl3, now = performance.now();
    this.resize();
    this.U.uTime.value += dt;
    // 1. remesh within the per-frame budget (world first, nearest chunks first)
    const deadline = now + this.remeshBudget;
    let left = 0, quads = 0;
    for (const v of this.views) { const before = v.grid.dirtyList.length; if (before) { left += v.flush(Math.max(deadline, performance.now() + 0.3), this.camera.position); this.shadowDirty = true; } quads += v.quads; }
    this.stats.remeshLeft = left; this.stats.quads = quads;
    // 2. lighting volumes
    this.updateVolumes(worldGrid, now);
    // 3. sun shadow map, re-rendered only when something changed
    const R = Math.min(70, Math.max(16, this.camera.position.distanceTo(focus) * 0.9 + 6));
    const snap = R / 4, fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    if (Math.abs(R - this.shadowR) > this.shadowR * 0.15 || fx !== this.shadowFocus.x || fz !== this.shadowFocus.z) { this.shadowR = R; this.shadowFocus.set(fx, 0, fz); this.shadowDirty = true; }
    if (this.shadowDirty || moving) {
      const sc = this.shadowCam, Rr = this.shadowR;
      sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.updateProjectionMatrix();
      sc.position.copy(this.shadowFocus).addScaledVector(this.sunDir, 160); sc.lookAt(this.shadowFocus); sc.updateMatrixWorld();
      this.U.uShadowMat.value.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse);
      this.U.uShadowTexel.value = 1 / this.shadowSize; this.U.uShadowWorldTexel.value = 2 * Rr / this.shadowSize;
      this.scene.overrideMaterial = this.shadowMat;
      r.setRenderTarget(this.shadowRT); r.clear(); r.render(this.scene, sc);
      this.scene.overrideMaterial = null;
      this.shadowDirty = false;
    }
    // 4. scene
    r.info.reset();
    r.setRenderTarget(this.sceneRT); r.render(this.scene, this.camera);
    this.stats.draws = r.info.render.calls; this.stats.tris = r.info.render.triangles;
    // 5. post
    const q = this.quality, C = this.mComp.uniforms;
    if (q !== 'low') {
      const u = this.mSSAO.uniforms; u.tDepth.value = this.sceneRT.depthTexture; u.uProj.value.copy(this.camera.projectionMatrix); u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
      this.pass(this.mSSAO, this.aoRT);
      const D = this.mDown.uniforms, Uu = this.mUp.uniforms;
      D.tSrc.value = this.sceneRT.texture; D.uTexel.value.set(1 / this.w, 1 / this.h); D.uFirst.value = 1; this.pass(this.mDown, this.b1);
      D.tSrc.value = this.b1.texture; D.uTexel.value.set(2 / this.w, 2 / this.h); D.uFirst.value = 0; this.pass(this.mDown, this.b2);
      D.tSrc.value = this.b2.texture; D.uTexel.value.set(4 / this.w, 4 / this.h); this.pass(this.mDown, this.b3);
      Uu.tSrc.value = this.b3.texture; Uu.tAdd.value = this.b2.texture; Uu.uTexel.value.set(8 / this.w, 8 / this.h); this.pass(this.mUp, this.u2);
      Uu.tSrc.value = this.u2.texture; Uu.tAdd.value = this.b1.texture; Uu.uTexel.value.set(4 / this.w, 4 / this.h); this.pass(this.mUp, this.u1);
      C.tAO.value = this.aoRT.texture; C.tBloom.value = this.u1.texture; C.uAoTexel.value.set(2 / this.w, 2 / this.h);
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    C.tScene.value = this.sceneRT.texture; C.tDepth.value = this.sceneRT.depthTexture; C.uTexel.value.set(1 / this.w, 1 / this.h); C.uFlash.value = this.flash;
    this.pass(this.mComp, null);
  }
}
export { THREE };
