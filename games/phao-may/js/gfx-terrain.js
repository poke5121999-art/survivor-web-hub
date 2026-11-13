// The terrain as a 3D slab: marching squares over the signed-distance grid give the front cut face
// (pillowed toward the rim) and the surface strips that run back in depth. Chunks rebuild when a shot carves.
// The shader reads the grid itself as a texture: R current distance, G depth below the original surface, B scorch.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const ZF = 4.5, ZB = -9, BEV = 1.5, BW = 1.4, CW = 32;

  const PARS_F = `
    varying vec3 vWp; varying vec3 vWn;
    uniform sampler2D tField; uniform vec2 uFInv; uniform vec2 uFOff; uniform sampler2D tNoise;
    uniform sampler2D tSoilA; uniform sampler2D tSoilN; uniform sampler2D tRockA; uniform sampler2D tRockN; uniform sampler2D tGrassA; uniform sampler2D tGrassN;
    uniform vec3 uTopsoil; uniform vec3 uClay; uniform vec3 uRockTint; uniform vec3 uGrassTint;
    vec3 tAlb; vec3 tNw; float tRough; float tOcc; float tGlow;
    void terrainSample(){
      vec2 fuv = vWp.xy * uFInv + uFOff;
      vec4 f = texture2D(tField, fuv);
      float sd = f.r*4.0-2.0, d0 = f.g*16.0, burn = f.b;
      vec2 g = vec2(texture2D(tField, fuv + vec2(uFOff.x*2.0, 0.0)).r - texture2D(tField, fuv - vec2(uFOff.x*2.0, 0.0)).r,
                    texture2D(tField, fuv + vec2(0.0, uFOff.y*2.0)).r - texture2D(tField, fuv - vec2(0.0, uFOff.y*2.0)).r);
      g = g / (length(g) + 1e-4);
      bool front = vWn.z > 0.5;
      vec3 N; vec2 uv; float up;
      if (front) { float e = smoothstep(-1.5, -0.02, sd); N = normalize(vec3(g*e*1.5, 1.0)); uv = vWp.xy; up = g.y; }
      else { N = normalize(vWn); uv = abs(N.y) > 0.55 ? vWp.xz : vWp.zy; up = N.y; }
      float n1 = texture2D(tNoise, vWp.xy*0.017).r, n2 = texture2D(tNoise, vWp.xy*0.09).g, n3 = texture2D(tNoise, vWp.xy*0.31 + vWp.z*0.2).b;
      float band = d0 + (n1 - 0.5)*2.6 + (n2 - 0.5)*0.7;
      vec3 soilT = pow(texture2D(tSoilA, uv*0.14).rgb, vec3(2.2)), rockT = pow(texture2D(tRockA, uv*0.13).rgb, vec3(2.2)), grassT = pow(texture2D(tGrassA, uv*0.27).rgb, vec3(2.2));
      vec3 soilN = texture2D(tSoilN, uv*0.14).xyz*2.0-1.0, rockN = texture2D(tRockN, uv*0.13).xyz*2.0-1.0, grassN = texture2D(tGrassN, uv*0.27).xyz*2.0-1.0;
      float kClay = smoothstep(0.7, 1.9, band), kRock = smoothstep(5.4, 7.2, band + (n3 - 0.5)*1.6);
      float warpY = vWp.y + (n1 - 0.5)*7.0 + (n2 - 0.5)*1.6;
      float lay = fract(warpY*0.23), layId = floor(warpY*0.23);
      float layTone = fract(sin(layId*12.9898)*43758.5453);
      vec3 clay = soilT * uClay * (0.72 + 0.5*layTone) * mix(1.0, 0.78, smoothstep(2.0, 6.0, band));
      clay *= 1.0 - 0.3*smoothstep(0.1, 0.0, lay) ;
      float root = smoothstep(0.86, 0.93, texture2D(tNoise, vec2(vWp.x*0.33, vWp.y*0.035)).g) * smoothstep(3.6, 0.6, d0) * smoothstep(0.2, 0.7, d0);
      vec3 c = mix(soilT * uTopsoil, clay, kClay);
      c = mix(c, vec3(0.07, 0.045, 0.03), root*0.75);
      float sl = warpY*0.5 + vWp.x*0.06;
      float slab = fract(sl), slabId = floor(sl);
      float joint = smoothstep(0.06, 0.0, slab) + smoothstep(0.985, 1.0, slab);
      float vx = vWp.x*0.16 + fract(sin(slabId*5.71)*91.3)*7.0 + (n2 - 0.5)*0.5;
      joint = max(joint, smoothstep(0.04, 0.0, abs(fract(vx) - 0.5)) * step(0.35, fract(sin((slabId + floor(vx))*3.17)*57.1)));
      vec3 rk = rockT * uRockTint * (0.8 + 0.4*fract(sin(slabId*7.31)*91.7)) * mix(1.15, 0.7, smoothstep(6.0, 16.0, d0));
      rk *= 1.0 - joint*0.6;
      rk += vec3(0.05, 0.045, 0.04) * smoothstep(0.75, 0.94, slab) * (1.0 - joint);
      c = mix(c, rk, kRock);
      vec3 dn = mix(soilN, rockN, kRock);
      float ore = smoothstep(0.80, 0.86, texture2D(tNoise, vWp.xy*0.045 + 0.31).b) * smoothstep(0.55, 0.8, texture2D(tNoise, vWp.xy*0.6).a) * kRock;
      c = mix(c, vec3(0.05, 0.25, 0.3), ore);
      tGlow = ore;
      float under = smoothstep(-0.1, -0.7, up) * smoothstep(2.5, 0.2, d0);
      c = mix(c, rockT * vec3(0.5, 0.56, 0.62), under * 0.8);
      float fringe = 0.28 + 0.5*n3 + 0.22*n2;
      float path = front ? 0.0 : smoothstep(2.9, 2.0, vWp.z) * smoothstep(-2.1, -1.2, vWp.z) * (0.55 + 0.45*n2);
      float grass = smoothstep(fringe, fringe - 0.2, d0) * smoothstep(0.05, 0.4, up) * (1.0 - smoothstep(0.02, 0.2, burn));
      c = mix(c, mix(grassT * uGrassTint, soilT * vec3(1.5, 1.05, 0.72), path * 0.85), grass);
      dn = mix(dn, mix(grassN, soilN, path), grass);
      float rim = front ? smoothstep(-0.45, -0.02, sd) : 0.0;
      c *= 1.0 + rim * 0.22 * (1.0 - grass);
      float scorch = smoothstep(0.0, 0.75, burn);
      c = mix(c, vec3(0.022, 0.018, 0.016) + soilT*0.08, scorch * 0.9);
      tAlb = c; tRough = mix(0.92, 0.78, kRock) + scorch*0.05; tOcc = 1.0 - under*0.35;
      tNw = front ? normalize(N + vec3(dn.xy*0.55, 0.0)) : normalize(N + (abs(N.y) > 0.55 ? vec3(dn.x, 0.0, dn.y) : vec3(0.0, dn.y, dn.x)) * 0.5);
    }`;

  PM.TerrainMesh = function (G, terrain, map) {
    const THREE = globalThis.THREE;
    const { nx, ny, cell, sd, burn } = terrain;
    const group = new THREE.Group();
    G.scene.add(group);

    const depth0 = new Float32Array(nx * ny);
    (function chamfer() {
      const INF = 1e6, a = cell, b = cell * Math.SQRT2;
      for (let k = 0; k < nx * ny; k++) depth0[k] = sd[k] >= 0 ? 0 : sd[k] > -terrain.band + 0.02 ? -sd[k] : INF;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i; let v = depth0[k];
        if (i > 0) v = Math.min(v, depth0[k - 1] + a);
        if (j > 0) { v = Math.min(v, depth0[k - nx] + a); if (i > 0) v = Math.min(v, depth0[k - nx - 1] + b); if (i < nx - 1) v = Math.min(v, depth0[k - nx + 1] + b); }
        depth0[k] = v;
      }
      for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i; let v = depth0[k];
        if (i < nx - 1) v = Math.min(v, depth0[k + 1] + a);
        if (j < ny - 1) { v = Math.min(v, depth0[k + nx] + a); if (i > 0) v = Math.min(v, depth0[k + nx - 1] + b); if (i < nx - 1) v = Math.min(v, depth0[k + nx + 1] + b); }
        depth0[k] = v;
      }
    })();

    const data = new Uint8Array(nx * ny * 4);
    const writeField = (i0, i1, j0, j1) => {
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        data[k * 4] = Math.max(0, Math.min(255, Math.round((sd[k] + 2) * 63.75)));
        data[k * 4 + 1] = Math.max(0, Math.min(255, Math.round(depth0[k] * 15.9375)));
        data[k * 4 + 2] = Math.max(0, Math.min(255, Math.round(burn[k] * 255)));
        data[k * 4 + 3] = 255;
      }
    };
    writeField(0, nx - 1, 0, ny - 1);
    const field = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType);
    field.minFilter = field.magFilter = THREE.LinearFilter; field.generateMipmaps = false; field.needsUpdate = true;

    const soil = G.bake.set('soil'), rock = G.bake.set('rock'), grass = G.bake.set('grass');
    const th = map.look || {};
    const col = (a, d) => new THREE.Color().fromArray(a || d);
    const U = { tField: { value: field }, uFInv: { value: new THREE.Vector2(1 / (nx * cell), 1 / (ny * cell)) }, uFOff: { value: new THREE.Vector2(0.5 / nx, 0.5 / ny) }, tNoise: { value: G.bake.noise() },
      tSoilA: { value: soil.alb }, tSoilN: { value: soil.nrm }, tRockA: { value: rock.alb }, tRockN: { value: rock.nrm }, tGrassA: { value: grass.alb }, tGrassN: { value: grass.nrm },
      uTopsoil: { value: col(th.topsoil, [0.6, 0.48, 0.4]) }, uClay: { value: col(th.clay, [1.75, 0.92, 0.6]) }, uRockTint: { value: col(th.rock, [1, 1, 1.05]) }, uGrassTint: { value: col(th.grass, [1, 1, 1]) } };
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.7 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz; vWn = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PARS_F)
        .replace('#include <map_fragment>', 'terrainSample(); diffuseColor.rgb = tAlb;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tNw, 0.0)).xyz);')
        .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= tOcc;')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vec3(0.25, 1.6, 1.9) * tGlow;');
    };
    mat.customProgramCacheKey = () => 'pm-terrain';

    const zf = (s) => { const t = Math.max(0, Math.min(1, (s + BW) / BW)); return ZF - BEV * t * t * (3 - 2 * t); };
    const chunks = [];
    const nChunks = Math.ceil((nx - 1) / CW);
    const px = [0, 0, 0, 0, 0, 0, 0, 0], py = [0, 0, 0, 0, 0, 0, 0, 0], pz = [0, 0, 0, 0, 0, 0, 0, 0], pe = [0, 0, 0, 0, 0, 0, 0, 0];

    function build(ci) {
      const pos = [], nor = [];
      const iA = ci * CW, iB = Math.min(nx - 1, iA + CW);
      const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, n0x, n0y, n0z, n1x, n1y, n1z, n2x, n2y, n2z) => { pos.push(ax, ay, az, bx, by, bz, cx, cy, cz); nor.push(n0x, n0y, n0z, n1x, n1y, n1z, n2x, n2y, n2z); };
      const flat = (x0, x1, y0, y1) => { tri(x0, y0, ZF, x1, y0, ZF, x1, y1, ZF, 0, 0, 1, 0, 0, 1, 0, 0, 1); tri(x0, y0, ZF, x1, y1, ZF, x0, y1, ZF, 0, 0, 1, 0, 0, 1, 0, 0, 1); };
      const deep = -BW;
      for (let j = 0; j < ny - 1; j++) {
        let run = -1;
        const y0 = j * cell, y1 = y0 + cell;
        for (let i = iA; i < iB; i++) {
          const k = j * nx + i, a = sd[k], b = sd[k + 1], c = sd[k + nx + 1], d = sd[k + nx];
          const full = a < 0 && b < 0 && c < 0 && d < 0;
          if (full && a <= deep && b <= deep && c <= deep && d <= deep) { if (run < 0) run = i; continue; }
          if (run >= 0) { flat(run * cell, i * cell, y0, y1); run = -1; }
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) continue;
          const x0 = i * cell, x1 = x0 + cell;
          let n = 0;
          const corner = (x, y, s) => { px[n] = x; py[n] = y; pz[n] = zf(s); pe[n] = 0; n++; };
          const edge = (xa, ya, sa, xb, yb, sb, id) => { const t = sa / (sa - sb); px[n] = xa + (xb - xa) * t; py[n] = ya + (yb - ya) * t; pz[n] = ZF - BEV; pe[n] = id; n++; };
          if (a < 0) corner(x0, y0, a);
          if ((a < 0) !== (b < 0)) edge(x0, y0, a, x1, y0, b, 1);
          if (b < 0) corner(x1, y0, b);
          if ((b < 0) !== (c < 0)) edge(x1, y0, b, x1, y1, c, 2);
          if (c < 0) corner(x1, y1, c);
          if ((c < 0) !== (d < 0)) edge(x1, y1, c, x0, y1, d, 3);
          if (d < 0) corner(x0, y1, d);
          if ((d < 0) !== (a < 0)) edge(x0, y1, d, x0, y0, a, 4);
          for (let t = 1; t < n - 1; t++) tri(px[0], py[0], pz[0], px[t], py[t], pz[t], px[t + 1], py[t + 1], pz[t + 1], 0, 0, 1, 0, 0, 1, 0, 0, 1);
          for (let t = 0; t < n; t++) {
            const u = (t + 1) % n;
            if (!pe[t] || !pe[u] || pe[t] === pe[u]) continue;
            const n0 = terrain.normal(px[t], py[t]), n1 = terrain.normal(px[u], py[u]);
            tri(px[t], py[t], ZF - BEV, px[t], py[t], ZB, px[u], py[u], ZB, n0.x, n0.y, 0, n0.x, n0.y, 0, n1.x, n1.y, 0);
            tri(px[t], py[t], ZF - BEV, px[u], py[u], ZB, px[u], py[u], ZF - BEV, n0.x, n0.y, 0, n1.x, n1.y, 0, n1.x, n1.y, 0);
          }
        }
        if (run >= 0) flat(run * cell, iB * cell, y0, y1);
      }
      let ch = chunks[ci];
      if (!ch) { ch = chunks[ci] = new THREE.Mesh(new THREE.BufferGeometry(), mat); ch.castShadow = true; ch.receiveShadow = true; ch.frustumCulled = false; group.add(ch); }
      ch.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
      ch.geometry = geo;
      return pos.length / 9;
    }

    let tris = 0;
    for (let ci = 0; ci < nChunks; ci++) tris += build(ci);

    const api = { group, field, tris, ZF, ZB, depth0 };
    api.sync = function () {
      if (!terrain.changes.length) return false;
      const dirty = new Set();
      for (const c of terrain.changes) {
        writeField(c.i0, c.i1, c.j0, c.j1);
        for (let ci = Math.floor(Math.max(0, c.i0 - 1) / CW); ci <= Math.floor(Math.min(nx - 2, c.i1) / CW); ci++) dirty.add(ci);
      }
      terrain.changes.length = 0;
      field.needsUpdate = true;
      for (const ci of dirty) build(ci);
      G.gfx.shadowDirty = true;
      return true;
    };
    api.dispose = function () { for (const ch of chunks) ch.geometry.dispose(); field.dispose(); mat.dispose(); G.scene.remove(group); };
    return api;
  };
})();
