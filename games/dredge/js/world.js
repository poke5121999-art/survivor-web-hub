/*
 * Thế giới tĩnh: cảnh vật instanced (lib.glb + instances.bin) nạp theo ô 256 m quanh thuyền, đáy biển từ terrain_rg.png,
 * mặt nạ đất (landmask.png, 1 px = 1 m) thành trường khoảng cách có dấu để va chạm và vẽ bọt, mặt nạ sâu
 * (depthmask.png: G = độ sâu thô 0..1, A = độ dốc sóng) đọc ngược từ GPU để giữ đúng G ở chỗ alpha = 0.
 *   DRWorld.load(fetchAsset, renderer, scene)   DRWorld.stream(x, z)
 *   DRWorld.sdf(x, z)  > 0 nước (m tới đất gần nhất), < 0 trong đất
 *   DRWorld.depth01(x, z)  DRWorld.steep01(x, z)  DRWorld.zoneAt(x, z)  DRWorld.resolve(b, halfW, halfL)
 * Vật liệu: shader toon gốc rã từ DXBC (Lit / LitTriplanar / Foliage / LitYBillboard / TerrainShader), thông số lấy từ
 * extras.params của lib.glb (tools/world.py) và data/env.js (tools/env.py); sương + ánh sáng dùng chung DRSky.GLSL_ENV.
 * Cảnh động (DR_ENV.particles, DR_ENV.lighthouse): hải âu/đại bàng (BirdParticle; chỉ phát trong khung giờ `tod` 0,27–0,60 của
 * TimeOfDayParticles, chim đang bay bay nốt), vệt gió + bụi quanh thuyền (AtmosphericParticles, tính trên GPU), đèn biển Greater
 * Marrow quay 30°/s.   DRWorld.updateAmbient(dt, ctx, env)  DRWorld.ambient
 * Vật nổi (world.json.buoys: 23 phao + 5 thuyền bến, SimpleBuoyantObject): DRWorld.buoys[{name, x, z, y, depth, cy (y vật chủ hiện tại),
 * target, parts}] bập bềnh theo DRWater.surface; thác Gale Cliffs (GaleCliffsWaterfall_Shader) cuộn UV + dời đỉnh theo thời gian.
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
  let solidArr = null, foamArr = null; const hiddenInst = new Set();   // [W4 seam] carveLand / hideInstances (điểm nổ mìn, js/explosives.js)

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
    return { sdf, foam, solid };
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

  // ---------- vật liệu: shader toon gốc, rã từ DXBC (tools/env.py --dis) ----------
  // Lit_Shader / Foliage / LitTriplanar / LitYBillboard đều KHÔNG có N·L: albedo × (nắng·mây·bóng + đèn phụ + ambient
  // + (1 − WaveMask.b)), rồi sương gốc (DRSky.GLSL_ENV), rồi cộng phát sáng SAU sương (cửa sổ, đèn sáng xuyên sương).
  const matCache = new Map();
  const s2l = x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  const linC = c => new T.Color(s2l(c[0]), s2l(c[1]), s2l(c[2])); // Color của vật liệu Unity lưu gamma, shader nhận tuyến tính
  const VERT_HEAD = 'uniform float uDrTime; uniform float uDrWind; uniform vec4 uKind;\nvarying vec3 vDrN; varying float vDrPh;\n';
  const VERT_PROJECT = `
#ifdef DR_YBILL
  // LitYBillboard: quay quanh trục y về phía camera (unity_MatrixInvV), giữ tỉ lệ instance
  mat4 drM = modelMatrix;
  #ifdef USE_INSTANCING
  drM = modelMatrix * instanceMatrix;
  #endif
  vec3 drC = (drM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 drSc = vec3(length(drM[0].xyz), length(drM[1].xyz), length(drM[2].xyz));
  vec3 drR = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec3 drB = normalize(vec3(viewMatrix[0][2], 0.0, viewMatrix[2][2]));
  vec4 mvPosition = viewMatrix * vec4(drC + drR * transformed.x * drSc.x + vec3(0.0, transformed.y * drSc.y, 0.0) + drB * transformed.z * drSc.z, 1.0);
  gl_Position = projectionMatrix * mvPosition;
#else
  #include <project_vertex>
#endif
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  if (uKind.y > 0.5) { // Foliage_Shader: lệch theo gió ở toạ độ thế giới, trọng số 1 − màu đỉnh R
    vec3 wp0 = drV2W(mvPosition);
    float w = (wp0.x - wp0.z) * 0.1;
    float tt = fract(uDrTime * 0.01) * 100.0;
    float sx = sin(6.283186 * (w + tt * 2.0 * uDrWind)) * 0.4;
    float sz = cos(6.283186 * (w - tt * 4.0 * uDrWind)) * 0.15;
    float k = 1.0 - vColor.r;
    mvPosition.xyz += (viewMatrix * vec4(vec3(sx, -sx * sx, -sz) * k, 0.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
#endif
  { mat3 drN3 = mat3(modelMatrix);
    #ifdef USE_INSTANCING
    drN3 = drN3 * mat3(instanceMatrix);
    #endif
    vDrN = drN3 * normal;
    vec4 drO = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
    drO = modelMatrix * instanceMatrix[3];
    #endif
    vDrPh = drO.x - drO.z; } // Unity: objectPos.x + objectPos.z
`;
  const FRAG_HEAD = `varying vec3 vDrN; varying float vDrPh;
uniform vec3 uTriGrass; uniform vec3 uTriSand; uniform vec3 uTriSnow; uniform vec3 uTriRock;
uniform vec4 uTriH; uniform vec4 uTriP; uniform float uTriWet;
uniform sampler2D uEmis; uniform float uEmisK; uniform vec3 uWet; uniform vec4 uKind; uniform vec3 uEmisF; uniform vec4 uDrGlow; // [U6 seam] LoreRock_Mat: rgb = màu phát sáng cộng thêm, a = tầm mờ dần (m); a = 0 → tắt
`;
  const FRAG_OUT = `
  vec3 drW = vDrFogW;
  vec3 drL = drEnvLights(drW);
  float drMb = drEnvMaskB(drW.xz);
  #ifdef DR_LAMBERT
  float drSh = getShadowMask();
  #else
  float drSh = 1.0;
  #endif
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  vec3 drVc = vColor.rgb;
  #else
  vec3 drVc = vec3(1.0); // Unity cấp màu đỉnh trắng khi lưới không có kênh COLOR [ĐỀ XUẤT]
  #endif
  vec3 drAlb = diffuseColor.rgb;
  // loại shader theo uniform (ít chương trình GPU, ít đổi chương trình mỗi khung): uKind = (tri, foliage, dlc1, -)
  if (uKind.y > 0.5) drAlb *= drVc.g;
  #ifdef USE_MAP
  if (uKind.x > 0.5) { // LitTriplanar_Shader: *_RGB theo UV0·TextureScale + TextureOffset (UV đã lật v trong glTF)
    vec2 tuv = vec2(vUv.x * uTriH.w + uTriP.y, 1.0 - ((1.0 - vUv.y) * uTriH.w + uTriP.z));
    vec3 n = texture2D(map, tuv).rgb; // sRGB8_ALPHA8: GPU tự giải mã như Unity (sRGBTexture 1)
    vec3 N = normalize(vDrN);
    float wet = max(step(0.15, n.r * drW.y), 1.0 - uTriWet);
    vec3 rock = n.r * uTriRock * wet;
    float rim = min(1.0, pow(1.0 - clamp(dot(N, normalize(cameraPosition - drW)), 0.0, 1.0), 2.0) * 1.6);
    rock = mix(rock, vec3(uTriP.w), rim);
    vec3 top = mix(uTriSand, uTriGrass, step(0.6, drW.y - uTriH.y));
    top = mix(top, uTriSnow, step(0.9, n.g * (n.b + drW.y - uTriH.x)));
    float isTop = step(drVc.r * uTriH.z, N.y * uTriP.x + n.r);
    drAlb = mix(rock, top, isTop);
    drSh *= max(step(0.3, dot(N, uDrSunDir)), 1.0 - isTop);
  }
  #endif
  if (uKind.z > 0.5) { // [ĐỀ XUẤT] DLC1IslandsShader rút gọn: sườn lerp(SidesColorBottom, SidesColorTop, min(sat(y), màu đỉnh R)) × (RGB.r + 1)/2
    // (lưới không có UV nên RGB.r coi như 0,5), mặt trên (N.y > 0,6) màu SnowColor; bỏ lấp lánh tuyết
    vec3 N = normalize(vDrN);
    vec3 side = mix(uTriSand, uTriGrass, clamp(min(clamp(drW.y, 0.0, 1.0), drVc.r), 0.0, 1.0)) * 0.75;
    drAlb = mix(side, uTriSnow, step(0.6, N.y));
  }
  vec3 drLit = drAlb * drEnvLight(drW, drSh, drL, drMb);
  if (uWet.z > 0.5) drLit *= max(step(uWet.x, drAlb.r * 2.0 + drW.y), 1.0 - uWet.y);
  vec3 drOut = mix(drLit, drEnvFogColor(drW), drEnvFogAmount(drW, drL, drMb));
  #ifdef USE_MAP
  if (uEmisF.x > 0.5) { vec3 em = texture2D(uEmis, vUv).rgb * uEmisK; // emissiveMap glTF là sRGB, GPU giải mã
    if (uEmisF.y > 0.5) em *= uDrNightL;                                // LightsTurnOffAtDay → _SceneLightness
    if (uEmisF.z > 0.5) em *= drS2L(texture2D(uDrFlick, vec2(vDrPh - uDrTime * 0.1, 0.5)).r); // LightsFlicker
    drOut += em; }
  #endif
  if (uDrGlow.a > 0.0) drOut += uDrGlow.rgb * max(0.0, 1.0 - distance(vDrFogW.xz, cameraPosition.xz) / uDrGlow.a); // [U6 seam]
  gl_FragColor = vec4(drOut, diffuseColor.a);
`;
  const WHITE = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  WHITE.needsUpdate = true;

  // GaleCliffsWaterfall_Shader (rã DXBC: tools/env.py --dis → GaleCliffsWaterfall_Shader.txt). Một texture (Texture2D_40488f58) lấy mẫu hai lần
  // theo UV Unity (v lên; glb lật v nên đổi lại ở đây):
  //   dời đỉnh (vs): pos += normal · tex(u, v + t·ScrollSpeed1, mip 3).g · DisplacementAmount · màu đỉnh G
  //   ps: A = tex(2u, v + t·ScrollSpeed1), B = tex(6u, 2v + t·ScrollSpeed2); x = sat(15·(A.r·B.g − màu đỉnh R)) + 0,5·A.g + max(1 − 0,08·d, 0)
  //   màu = dải (0,2549; 0,3211; 0,4039) + s·(0,1608; 0,2118; 0,2196), s = sat(1,6111·x), rồi pha tới xám 0,6698 (x > 0,6207) và 0,8962 (x > 0,7299);
  //   cắt điểm ảnh khi A.b·B.b < max(1 − 0,08·d, 0) (tan dần khi lại gần: d = khoảng cách tới camera, m);
  //   ánh sáng Lit KHÔNG có mây che nắng/bóng: nắng + đèn phụ + ambient + (1 − mask.b); sương Lit nhưng không có hệ số đèn xua sương.
  function waterfallMaterial(src, pr) {
    const m = new T.ShaderMaterial({
      uniforms: { tMap: { value: src.map }, uScroll: { value: new T.Vector2(pr.ScrollSpeed1 || 0, pr.ScrollSpeed2 || 0) }, uDisp: { value: pr.DisplacementAmount || 0 },
        fogColor: { value: new T.Color() }, fogDensity: { value: 0 } },
      vertexColors: true, fog: true, side: src.side, defines: { DR_OWN_FOG: '' },
      vertexShader: `uniform sampler2D tMap; uniform vec2 uScroll; uniform float uDisp; uniform float uDrTime;
varying vec2 vUv;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  #include <color_vertex>
  vec2 sv = vec2(uv.x, 1.0 - uv.y + uDrTime * uScroll.x);
  #if __VERSION__ >= 300
  float h = textureLod(tMap, vec2(sv.x, 1.0 - sv.y), 3.0).g;
  #else
  float h = texture2DLod(tMap, vec2(sv.x, 1.0 - sv.y), 3.0).g;
  #endif
  vec4 mvPosition = vec4(position + normal * (h * uDisp * vColor.g), 1.0);
  #ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `uniform sampler2D tMap; uniform vec2 uScroll;
varying vec2 vUv;
#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
void main() {
  vec3 wp = vDrFogW;
  vec2 su = vec2(vUv.x, 1.0 - vUv.y);
  vec2 a = vec2(su.x * 2.0, su.y + uDrTime * uScroll.x), b = vec2(su.x * 6.0, su.y * 2.0 + uDrTime * uScroll.y);
  vec4 ta = texture2D(tMap, vec2(a.x, 1.0 - a.y)), tb = texture2D(tMap, vec2(b.x, 1.0 - b.y));
  float nearK = max(1.0 - distance(wp, cameraPosition) * 0.08, 0.0);
  if (ta.b * tb.b - nearK < 0.0) discard;
  float x = clamp((ta.r * tb.g - vColor.r) * 15.0, 0.0, 1.0) + ta.g * 0.5 + nearK;
  vec3 alb = clamp(x * 1.611107, 0.0, 1.0) * vec3(0.160812, 0.211787, 0.219608) + vec3(0.254874, 0.321118, 0.403922);
  alb = mix(alb, vec3(0.669811), clamp((x - 0.620691) * 9.158044, 0.0, 1.0));
  alb = mix(alb, vec3(0.896226), clamp((x - 0.729885) * 3.702124, 0.0, 1.0));
  float mb = drEnvMaskB(wp.xz);
  vec3 lit = alb * (uDrSunCol + drEnvLights(wp) + uDrAmb + (1.0 - mb) + vec3(uDrTintK, 0.0, 0.0));
  gl_FragColor = vec4(mix(lit, drEnvFogColor(wp), drEnvFogAmount(wp, vec3(0.0), mb)), 1.0);
  #include <encodings_fragment>
}`
    });
    m.name = src.name;
    return m;
  }

  function convertMaterial(src) {
    if (matCache.has(src)) return matCache.get(src);
    const ex = src.userData || {}, shader = ex.shader || '', pr = ex.params || {}, kw = ex.keywords || [];
    if (/DepthMask/.test(shader) || ex.mask) { matCache.set(src, null); return null; }
    if (/GaleCliffsWaterfall/.test(shader) && src.map) {
      const wm = waterfallMaterial(src, pr);
      matCache.set(src, wm);
      return wm;
    }
    const shadows = !!(root.DRSky && DRSky.shadows);
    const defines = { DR_OWN_FOG: '' };
    const tri = /LitTriplanar/.test(shader), fol = /Foliage/.test(shader), bill = /YBillboard/.test(shader);
    const opts = {
      color: new T.Color(1, 1, 1), map: src.map || (src.emissiveMap ? WHITE : null), vertexColors: !!src.vertexColors,
      alphaTest: src.alphaTest || 0, side: src.side, transparent: src.transparent, opacity: src.opacity
    };
    const m = shadows ? new T.MeshLambertMaterial(opts) : new T.MeshBasicMaterial(opts);
    m.name = src.name;
    if (shadows) defines.DR_LAMBERT = '';
    if (bill) { defines.DR_YBILL = ''; m.alphaTest = 0.5; m.side = T.DoubleSide; if (pr.ColorTint) m.color = linC(pr.ColorTint); }
    if (/UnderwaterObject/.test(shader) && pr.ColorTint) m.color = linC(pr.ColorTint);
    if (/Foliage|Billboard|Cutout/.test(shader)) { m.side = T.DoubleSide; if (!m.alphaTest && src.transparent) m.alphaTest = 0.5; m.transparent = false; }
    if (/TransparentIce/.test(shader)) { m.transparent = true; m.opacity = 0.6; m.depthWrite = false; }
    const dlc1 = /DLC1IslandsShader/.test(shader);
    const recv = pr.RecieveShadows === 1 || kw.some(k => /_SHADOWS_ON|BOOLEAN_831B22E2|BOOLEAN_94337006/.test(k));
    const emisK = pr.LightStrength != null ? pr.LightStrength : pr.EmissionStrength != null ? pr.EmissionStrength : 1;
    const uni = {
      uTriGrass: { value: linC(pr.GrassColour || pr.SidesColorTop || [0, 0, 0]) }, uTriSand: { value: linC(pr.SandColour || pr.SidesColorBottom || [0, 0, 0]) },
      uTriSnow: { value: linC(pr.SnowColour || pr.SnowColor || [0, 0, 0]) }, uTriRock: { value: linC(pr.RockColour || [1, 1, 1]) },
      // (SnowHeight, SandHeight, GrassEdgeHeight, TextureScale), (EdgeJaggedAmount, TextureOffset.xy, RockColourLightness)
      uTriH: { value: new T.Vector4(pr.SnowHeight || 0, pr.SandHeight || 0, pr.GrassEdgeHeight || 0, pr.TextureScale || 1) },
      uTriP: { value: new T.Vector4(pr.EdgeJaggedAmount || 0, (pr.TextureOffset || [0, 0])[0], (pr.TextureOffset || [0, 0])[1], pr.RockColourLightness || 0) },
      uTriWet: { value: pr.WetEdgesAmount || 0 },
      uEmis: { value: src.emissiveMap || WHITE }, uEmisK: { value: emisK },
      uWet: { value: new T.Vector3(pr.WetEdgeHeight || 0, pr.WetEdgeDarkness || 0, kw.includes('_WETEDGES') ? 1 : 0) },
      uKind: { value: new T.Vector4(tri ? 1 : 0, fol ? 1 : 0, dlc1 ? 1 : 0, 0) },
      uEmisF: { value: new T.Vector3(src.emissiveMap && pr.Emissive !== 0 ? 1 : 0, pr.LightsTurnOffAtDay === 1 ? 1 : 0, pr.LightsFlicker === 1 ? 1 : 0) },
      uDrGlow: { value: new T.Vector4(0, 0, 0, 0) }   // [U6 seam] js/scares.js đặt (LoreRockManager: _GlowStrength)
    };
    if (src.name === 'LoreRock_Mat') (W.loreGlow = W.loreGlow || []).push(uni.uDrGlow.value);   // [U6 seam] js/scares.js chạy LoreRockManager trên các vector này
    m.defines = defines;
    m.userData.drRecv = recv;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <project_vertex>', VERT_PROJECT);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
        .replace('#include <color_fragment>', '')
        .replace('#include <output_fragment>', FRAG_OUT);
    };
    m.customProgramCacheKey = () => 'drWorld';
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
        im.userData.off = off;   // [W4 seam] chi so instances.bin cua o thu 0
        if (hiddenInst.size) zeroHidden(im, off, n);
        im.instanceMatrix.needsUpdate = true;
        im.matrixAutoUpdate = false;
        im.userData.mr = lr;
        if (root.DRSky && DRSky.shadows) { im.castShadow = true; im.receiveShadow = !!part.mat.userData.drRecv; }
        g.add(im);
        W.stats.meshes++;
      }
      count += n;
    }
    buildBuoys(g, key);
    cell.group = g; cell.count = count;
    return g;
  }

  // ---------- vật nổi (SimpleBuoyantObject.cs:28-44): phao + thuyền bến, tách khỏi instances.bin (tools/world.py → world.json.buoys) ----------
  // Mỗi vật chủ giữ ma trận gốc của từng mesh con; mỗi khung cộng độ lệch y của vật chủ vào ma trận. y vật chủ lerp (dt) về
  // mặt nước(x, z) + objectDepth, mục tiêu lấy lại mỗi 0,5 s (timeBetweenUpdatingWaveSteepnessSec).
  const BUOY_PERIOD = 0.5, BUOY_SWING = 2.5; // BUOY_SWING: bán kính cộng thêm cho khối bao (sóng bão cao nhất ~1,8 m)
  function buildBuoys(g, key) {
    const list = W.buoyCells[key];
    if (!list) return;
    const byMesh = {};
    for (const B of list) { B.refs.length = 0; for (const p of B.parts) (byMesh[p.mesh] = byMesh[p.mesh] || []).push({ B, p }); }
    for (const [mid, items] of Object.entries(byMesh)) {
      const parts = variants[mid], meta = W.data.world.meshes[mid];
      if (!parts || !parts.length || !meta) continue;
      const bb = meta.bbox, lc = new T.Vector3((bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, (bb[0][2] + bb[1][2]) / 2);
      const lr = Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) / 2;
      const sphere = new T.Sphere(); let first = true;
      const mats = items.map(({ p }) => {
        _p.set(p.pos[0], p.pos[1], p.pos[2]); _q.set(p.q[0], p.q[1], p.q[2], p.q[3]); _s.set(p.s[0], p.s[1], p.s[2]);
        const m = new T.Matrix4().compose(_p, _q, _s);
        const sp = new T.Sphere(_c.copy(lc).applyMatrix4(m).clone(), lr * Math.max(_s.x, _s.y, _s.z) + BUOY_SWING);
        if (first) { sphere.copy(sp); first = false; } else sphere.union(sp);
        return m;
      });
      for (const part of parts) {
        const geo = new T.BufferGeometry();
        for (const [name, a] of Object.entries(part.geo.attributes)) geo.setAttribute(name, a);
        geo.setIndex(part.geo.index);
        geo.boundingSphere = sphere.clone();
        const im = new T.InstancedMesh(geo, part.mat, items.length);
        im.instanceMatrix.setUsage(T.DynamicDrawUsage);
        items.forEach(({ B }, k) => {
          const m = part.local ? new T.Matrix4().multiplyMatrices(mats[k], part.local) : mats[k].clone();
          im.setMatrixAt(k, m);
          B.refs.push({ im, k, m });
        });
        im.instanceMatrix.needsUpdate = true;
        im.matrixAutoUpdate = false;
        im.userData.mr = lr;
        if (root.DRSky && DRSky.shadows) { im.castShadow = true; im.receiveShadow = !!part.mat.userData.drRecv; }
        g.add(im);
        W.stats.meshes++;
      }
    }
    for (const B of list) { if (B.cy === null) retargetBuoy(B); applyBuoy(B); }
  }
  function retargetBuoy(B) {
    const cam = AMB.cam, cx = cam ? cam.x : B.x, cz = cam ? cam.z : B.z;
    B.target = root.DRWater.surface(B.x, B.z, cx, cz, true) + B.depth;   // true: collider của chính phao nằm trong landmask
    if (B.cy === null) B.cy = B.target; // [ĐỀ XUẤT] bản gốc lerp từ y đặt sẵn trong scene; ở đây vật vào thẳng mặt nước khi ô được dựng
    B.t = 0;
  }
  function applyBuoy(B) {
    const dy = B.cy - B.y;
    for (const r of B.refs) { _m.copy(r.m); _m.elements[13] += dy; r.im.setMatrixAt(r.k, _m); r.im.instanceMatrix.needsUpdate = true; }
  }
  function stepBuoys(dt) {
    if (!W.buoyCells) return;
    for (const key of W.loaded) {
      const list = W.buoyCells[key];
      if (!list) continue;
      for (const B of list) {
        B.t += dt;
        if (B.t > BUOY_PERIOD) retargetBuoy(B);
        B.cy += (B.target - B.cy) * Math.min(1, dt); // Mathf.Lerp(y, target, Time.deltaTime)
        applyBuoy(B);
      }
    }
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
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let r = 0; r < gh; r++) for (let q = 0; q < gw; q++) {
      const ix = Math.min(Tm.width - 1, q * step), iz = Math.min(Tm.height - 1, r * step), k = (iz * Tm.width + ix) * 4;
      const y = Tm.y0 + (px[k] * 256 + px[k + 1]) / 65535 * Tm.sizeY, v = r * gw + q;
      const x = Tm.x0 + ix * Tm.sizeX / (Tm.width - 1), z = Tm.z0 + iz * Tm.sizeZ / (Tm.height - 1);
      pos.setXYZ(v, x, Math.min(y, -0.35), z);
      uv.setXY(v, (x - Tm.x0) / Tm.sizeX, (-z - Tm.z0) / Tm.sizeZ); // UV Terrain Unity (z Unity = −z three.js)
    }
    geo.computeVertexNormals();
    // TerrainShader (DXBC): splat (SplatAlpha 0) + nhiễu Terrain_RGB × TextureTiling chọn cát / tảo / đá / dung nham,
    // ánh sáng = nắng + ambient + (1 − mask.b), KHÔNG có sương; dung nham phát sáng (2,996; 1,82; 0) trong 70 m quanh camera.
    const TE = root.DR_ENV.terrain, M = TE.material, sky = root.DRSky;
    const lc = c => new T.Vector4(s2l(c[0]), s2l(c[1]), s2l(c[2]), c[3]);
    const mat = new T.MeshBasicMaterial({ color: 0xffffff });
    mat.defines = { DR_OWN_FOG: '' };
    const tn = sky.envTex(TE.noise), ts = sky.envTex(TE.splat, { clamp: true });
    const uni = {
      uTN: { value: tn }, uTS: { value: ts }, uTile: { value: new T.Vector2(M.TextureTiling[0], M.TextureTiling[1]) },
      uSand: { value: lc(M.SandColour) }, uAlgae: { value: lc(M.AlgaeColour) }, uRock: { value: lc(M.RockColour) }, uMagma: { value: lc(M.MagmaColour) }
    };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uTN; uniform sampler2D uTS; uniform vec2 uTile; uniform vec4 uSand; uniform vec4 uAlgae; uniform vec4 uRock; uniform vec4 uMagma;
varying vec2 vTUv;`).replace('#include <output_fragment>', `
  vec3 n = drS2L(texture2D(uTN, vTUv * uTile).rgb);
  vec4 sp = texture2D(uTS, vTUv);
  vec4 m = step(vec4(1.7, 0.5, 0.1, 0.5), vec4(sp.a, sp.g, sp.b, sp.a) * 2.0 - vec4(n.b, n.r, n.g, n.b));
  vec3 c = mix(uSand.rgb, clamp(n.r + uAlgae.a, 0.0, 1.0) * uAlgae.rgb, m.y);
  c = mix(c, clamp(n.g + uRock.a, 0.0, 1.0) * uRock.rgb, m.z);
  c = mix(c, n.b * uMagma.rgb, m.w);
  c *= uDrSunCol + uDrAmb + (1.0 - drEnvMaskB(vDrFogW.xz)) + vec3(uDrTintK, 0.0, 0.0); // TerrainShader: không mây, không bóng
  float glow = drS2L(texture2D(uTN, vTUv * 150.0 + uDrTime * 0.02).b);
  c += max(0.0, 1.0 - distance(vDrFogW.xz, cameraPosition.xz) / 70.0) * glow * vec3(2.996078, 1.819608, 0.0) * m.x;
  gl_FragColor = vec4(c, 1.0);`);
    };
    mat.customProgramCacheKey = () => 'drTerrain';
    const mesh = new T.Mesh(geo, mat);
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
    sdfArr = sd.sdf; solidArr = sd.solid; foamArr = sd.foam;
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
    // vật nổi: gom theo ô; ô chỉ có phao (không có cảnh tĩnh) vẫn cần một mục để stream() nạp nó
    W.buoys = (world.buoys || []).map(b => Object.assign({ cy: null, target: 0, t: 0, refs: [] }, b));
    W.buoyCells = {};
    for (const b of W.buoys) {
      (W.buoyCells[b.cell] = W.buoyCells[b.cell] || []).push(b);
      if (!W.cells[b.cell]) {
        const [cx, cz] = b.cell.split(',').map(Number), C = world.cell;
        W.cells[b.cell] = { entries: {}, x0: cx * C, z0: cz * C, x1: (cx + 1) * C, z1: (cz + 1) * C, group: null, count: 0 };
      }
    }
    if (root.DR_ENV && root.DR_ENV.particles) initAmbient();
  }

  // Bỏ vẽ cụm instanced nằm hẳn trong sương hoặc quá xa so với cỡ vật (đá nhỏ, bụi cây) — [ĐỀ XUẤT] 80 m + 20 × bán kính lưới.
  const _v = new T.Vector3();
  function cull(cam, far) {
    for (const key of W.loaded) for (const im of W.cells[key].group.children) {
      const sp = im.geometry.boundingSphere;
      im.visible = _v.copy(sp.center).distanceTo(cam) - sp.radius < Math.min(far, 80 + im.userData.mr * 20);
    }
  }

  // đèn cửa sổ/đèn treo giờ là Emission của Lit_Shader (uDrNightL = _SceneLightness); giữ hàm cho tương thích
  function setNight(k) { W.sceneLights = k; }

  // ---------- cảnh động: chim, vệt gió, đèn biển (DR_ENV.particles / DR_ENV.lighthouse, bóc từ Game.unity) ----------
  const FLIP = new T.Matrix4().makeScale(1, 1, -1);
  const u2t = arr => new T.Matrix4().fromArray(arr).transpose().premultiply(FLIP).multiply(FLIP); // Unity hàng trước → three.js
  function hermite(keys, t) {
    if (!keys || !keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i], d = b[0] - a[0], u = (t - a[0]) / (d || 1), u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
    }
    return keys[keys.length - 1][1];
  }
  // MinMaxCurve: state 0 hằng, 1 đường cong, 2 giữa hai đường cong (r), 3 giữa hai hằng (r)
  const mmc = (c, t, r) => !c ? 0 : c.state === 0 ? c.max : c.state === 3 ? c.min + (c.max - c.min) * r
    : c.state === 1 ? c.max * hermite(c.curve, t) : c.max * (hermite(c.curveMin, t) + (hermite(c.curve, t) - hermite(c.curveMin, t)) * r);
  function gradK(k, i, t, fixed) {
    if (t <= k[0][0]) return k[0][i];
    for (let j = 1; j < k.length; j++) if (t <= k[j][0]) { const p = k[j - 1], q = k[j]; return fixed ? p[i] : p[i] + (q[i] - p[i]) * (t - p[0]) / (q[0] - p[0] || 1); }
    return k[k.length - 1][i];
  }
  const gradB = (g, t) => gradK(g.colors, 3, t, g.mode === 1); // kênh B (bật/tắt vỗ cánh)
  const gradAl = (g, t) => gradK(g.alphas, 1, t, g.mode === 1);
  const AMB = { birds: [], streaks: null, motes: null, beam: null, time: 0 };
  W.ambient = AMB;

  function birdMesh(m) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(m.pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(m.uv || new Array(m.pos.length / 3 * 2).fill(0), 2));
    g.setAttribute('color', new T.Float32BufferAttribute(m.color || new Array(m.pos.length / 3 * 4).fill(1), 4));
    g.setIndex(m.index);
    g.computeBoundingSphere();
    return g;
  }
  function initAmbient() {
    const E = root.DR_ENV, P = E.particles, sky = root.DRSky;
    // ---- chim: BirdParticle_Shader (vỗ cánh ở đỉnh, màu = MainTex × ambient.b, không sương)
    const bm = P.materials.BirdParticle_Mat || {};
    const birdMat = new T.ShaderMaterial({
      uniforms: { tMain: { value: bm.texture ? sky.envTex(bm.texture, { clamp: true }) : WHITE }, uFlap: { value: new T.Vector2(bm.FlapSpeed || 12, bm.FlapAmount || 0.4) },
        uT: { value: 0 }, uAmbB: { value: 1 } },
      vertexShader: `attribute vec4 color; attribute vec4 aPCol; uniform vec2 uFlap; uniform float uT; varying vec2 vUv;
void main() { vUv = uv; vec4 c = color * aPCol; vec3 p = position;
  p.y += sin((uT - c.r * c.g) * c.a * uFlap.x) * c.b * uFlap.y * c.r;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform sampler2D tMain; uniform float uAmbB; varying vec2 vUv;
vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() { gl_FragColor = vec4(s2l(texture2D(tMain, vUv).rgb) * uAmbB, 1.0); }`,
      side: T.DoubleSide
    });
    AMB.birdMat = birdMat;
    const geos = {};
    for (const e of P.birds) {
      const m = P.meshes[e.mesh];
      if (!m) continue;
      const geo = geos[e.mesh] || (geos[e.mesh] = birdMesh(m));
      const im = new T.InstancedMesh(geo, birdMat, e.maxParticles);
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      const pc = new T.InstancedBufferAttribute(new Float32Array(e.maxParticles * 4).fill(1), 4);
      im.geometry = geo.clone(); im.geometry.setAttribute('aPCol', pc);
      im.frustumCulled = false; im.count = 0; im.name = 'birds ' + e.path;
      scene.add(im);
      AMB.birds.push({ e, im, pc, ps: [], cycle: -1, t: 0, playing: false, t0: 0, spawned: 0 });
    }
    // ---- vệt gió + bụi khí quyển quanh thuyền (AtmosphericParticles_Shader: màu × ánh sáng, có sương)
    // GPU tính hết: mỗi ô hạt sống lại liên tục (đời L ngẫu nhiên, sinh lại ở điểm băm mới) ⇒ CPU không làm gì mỗi khung
    const k3 = (keys, i) => { const k = (keys || []).slice(0, 3); while (k.length < 3) k.push(k.length ? k[k.length - 1] : [0, 1]); return new T.Vector3(k[0][i], k[1][i], k[2][i]); };
    for (const e of P.atmospheric) {
      const trail = !!e.TrailModule, V = e.VelocityModule || {};
      const avgLife = (e.startLifetime.min + e.startLifetime.max) / 2;
      const n = Math.min(e.maxParticles, Math.ceil(mmc(e.rate, 0, 1) * avgLife));
      const g = new T.BufferGeometry(), per = trail ? 2 : 1;
      const seed = new Float32Array(n * per * 2), pos = new Float32Array(n * per * 3);
      for (let i = 0; i < n; i++) { const r = (i + 0.5) / n + Math.random() * 0.37; for (let j = 0; j < per; j++) { seed[(i * per + j) * 2] = r; seed[(i * per + j) * 2 + 1] = j; } } // đầu và đuôi vệt cùng một hạt
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new T.BufferAttribute(seed, 2));
      const sc = e.startColor, ga = e.ColorModule && e.ColorModule.gradient && e.ColorModule.gradient.gradient;
      const tc = trail ? e.TrailModule.colorOverLifetime : null;
      const lt = trail ? mmc(e.TrailModule.lifetime, 0, 0) : 0;
      const uni = {
        fogColor: { value: new T.Color() }, fogDensity: { value: 0 }, uPx: { value: 1.5 }, uT: { value: 0 }, uBoat: { value: new T.Vector3() },
        uLife: { value: new T.Vector2(e.startLifetime.min, e.startLifetime.max) }, uR: { value: e.shape.radius },
        uVx: { value: new T.Vector2(V.x ? V.x.min : 0, V.x ? V.x.max : 0) }, uVz: { value: new T.Vector2(V.z ? V.z.min : 0, V.z ? V.z.max : 0) },
        uNoise: { value: new T.Vector2(e.NoiseModule ? e.NoiseModule.strength.max : 0, e.NoiseModule ? e.NoiseModule.frequency : 0) },
        uA0: { value: new T.Vector2(sc.state === 2 ? sc.min[3] : (sc.color || [1, 1, 1, 1])[3], sc.state === 2 ? sc.max[3] : (sc.color || [1, 1, 1, 1])[3]) },
        uGT: { value: k3(ga && ga.alphas, 0) }, uGA: { value: k3(ga && ga.alphas, 1) },
        uTrail: { value: trail ? lt : 0 },
        uTAT: { value: k3(tc && (tc.gradientMin || tc.gradient).alphas, 0) }, uTAA: { value: k3(tc && (tc.gradientMin || tc.gradient).alphas, 1) },
        uTBT: { value: k3(tc && tc.gradient.alphas, 0) }, uTBA: { value: k3(tc && tc.gradient.alphas, 1) }
      };
      const mat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, fog: true, uniforms: uni,
        vertexShader: `attribute vec2 aSeed; varying float vA;
uniform float uPx; uniform float uT; uniform vec3 uBoat; uniform vec2 uLife; uniform float uR; uniform vec2 uVx; uniform vec2 uVz; uniform vec2 uNoise;
uniform vec2 uA0; uniform vec3 uGT; uniform vec3 uGA; uniform float uTrail; uniform vec3 uTAT; uniform vec3 uTAA; uniform vec3 uTBT; uniform vec3 uTBA;
#include <common>
#include <fog_pars_vertex>
float h1(float n) { return fract(sin(n) * 43758.5453); }
float g3(float u, vec3 t, vec3 a) { // gradient Unity 3 khoá alpha
  if (u <= t.x) return a.x;
  if (u <= t.y) return mix(a.x, a.y, (u - t.x) / max(t.y - t.x, 1e-4));
  if (u <= t.z) return mix(a.y, a.z, (u - t.y) / max(t.z - t.y, 1e-4));
  return a.z;
}
void main() {
  float L = mix(uLife.x, uLife.y, h1(aSeed.x * 17.31));
  float tt = uT + aSeed.x * 37.0 * L, k = floor(tt / L), age = tt - k * L, u = age / L;
  float r1 = h1(aSeed.x * 113.1 + k * 7.13), r2 = h1(aSeed.x * 71.7 + k * 3.31), r3 = h1(aSeed.x * 29.9 + k * 5.71), r4 = h1(aSeed.x * 53.3 + k * 1.77);
  // hình cầu bán kính 30 m quanh thuyền (không gian cục bộ) — [ĐỀ XUẤT] nửa dưới mặt nước lật lên trên
  float R = uR * pow(r1, 0.3333), th = r2 * 6.2832, ph = acos(2.0 * r3 - 1.0);
  vec3 p0 = vec3(R * sin(ph) * cos(th), abs(R * cos(ph)) * 0.35 + 0.5, R * sin(ph) * sin(th));
  vec2 v = vec2(mix(uVx.x, uVx.y, r4), -mix(uVz.x, uVz.y, h1(r4 * 91.0))); // vận tốc thế giới: Unity +z = three.js −z
  // [ĐỀ XUẤT] NoiseModule (strength, frequency) xấp xỉ bằng lệch sin tích phân theo tuổi
  float w = 6.2832 * max(uNoise.y, 1e-3), ph0 = r2 * 100.0;
  vec3 p = uBoat + p0 + vec3(v.x * age + uNoise.x * 0.3 / w * (cos(ph0) - cos(ph0 + age * w)), uNoise.x * 0.15 / w * (sin(ph0 * 1.7 + age * w) - sin(ph0 * 1.7)), v.y * age);
  if (uTrail > 0.0) {
    vA = aSeed.y > 0.5 ? 0.0 : mix(g3(u, uTAT, uTAA), g3(u, uTBT, uTBA), r1);
    if (aSeed.y > 0.5) p.xz -= v * uTrail;
  } else vA = mix(uA0.x, uA0.y, r3) * g3(u, uGT, uGA);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition; gl_PointSize = uPx;
#include <fog_vertex>
}`,
        fragmentShader: `varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() { vec3 c = drEnvLight(vDrFogW, 1.0, drEnvLights(vDrFogW), drEnvMaskB(vDrFogW.xz)); gl_FragColor = vec4(c, vA);
#include <fog_fragment>
}`
      });
      const obj = trail ? new T.LineSegments(g, mat) : new T.Points(g, mat);
      obj.frustumCulled = false; obj.name = 'atmos ' + e.name;
      scene.add(obj);
      const sys = { e, obj, n, trail };
      if (trail) AMB.streaks = sys; else AMB.motes = sys;
    }
    // ---- đèn biển Greater Marrow: ConstantlyRotateOnY 30°/s, DistanceScaler 0,004; LightBeam_Shader (fresnel^FadeSmoothness × tex.a × Opacity)
    const L = (root.DR_ENV.lighthouse || [])[0];
    if (L) {
      const rootG = new T.Group(), pivot = new T.Group();
      rootG.matrixAutoUpdate = false;
      const R3 = u2t(L.rootMatrix), Pl = u2t(L.pivotLocal);
      Pl.decompose(pivot.position, pivot.quaternion, pivot.scale);
      rootG.add(pivot); scene.add(rootG);
      const quad = new T.PlaneGeometry(1, 1);
      for (const q of L.quads) {
        const mat = new T.ShaderMaterial({
          transparent: true, depthWrite: false, fog: false,
          uniforms: { tMap: { value: sky.envTex(q.texture, { clamp: true }) }, uCol: { value: linC(q.color) }, uOp: { value: q.opacity }, uFade: { value: q.fade } },
          vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
          fragmentShader: `uniform sampler2D tMap; uniform vec3 uCol; uniform float uOp; uniform float uFade; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() { vec4 t = texture2D(tMap, vUv); float f = pow(clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), uFade);
  gl_FragColor = vec4(s2l(t.rgb) * uCol, f * t.a * uOp); }`
        });
        const m = new T.Mesh(quad, mat);
        m.matrixAutoUpdate = false; m.matrix.copy(u2t(q.local)); m.frustumCulled = false; m.renderOrder = 3; m.name = 'beam ' + q.name;
        pivot.add(m);
      }
      AMB.beam = { L, rootG, pivot, R3, q0: pivot.quaternion.clone(), angle: 0 };
    }
  }

  const _bp = new T.Vector3(), _bq = new T.Quaternion(), _bs = new T.Vector3(), _bm = new T.Matrix4(), _fw = new T.Vector3(), _up = new T.Vector3(0, 1, 0), _yq = new T.Quaternion(), _o0 = new T.Vector3();
  function spawnBird(B, now) {
    const e = B.e;
    if (B.ps.length >= e.maxParticles) return;
    const r = Math.random(), sh = e.shape, sc = e.scale[0];
    const phi = Math.random() * Math.PI * 2;
    let rad = sh.radius * sc, dy = 0;
    if (sh.type === 17) { const a = Math.random() * Math.PI * 2, d = Math.random() * sh.donutRadius; rad += Math.cos(a) * d; dy = Math.sin(a) * d; } // Donut
    else if (sh.type === 10) rad *= 1 - (sh.radiusThickness || 0) * Math.random(); // Circle (radiusThickness 0 = mép)
    B.ps.push({ born: now, life: mmc(e.startLifetime, 0, Math.random()), phi, rad, dy, w: mmc(e.VelocityModule && e.VelocityModule.orbitalY, 0, Math.random()),
      rv: Math.random(), size: mmc(e.startSize, 0, r) });
    B.spawned++;
  }
  // TimeOfDayParticles.cs:14-41: tod = [start, end] theo phần lẻ của ngày; start > end quấn qua nửa đêm
  const inWindow = (tod, t) => !tod || (tod[0] > tod[1] ? (t < tod[1] || t > tod[0]) : (t < tod[1] && t > tod[0]));
  function updateBirds(dt, env) {
    AMB.time += dt;
    const now = AMB.time;
    AMB.birdMat.uniforms.uT.value = root.DRSky.uniforms.uDrTime.value;
    AMB.birdMat.uniforms.uAmbB.value = root.DRSky.uniforms.uDrAmb.value.b;
    const cam = AMB.cam;
    for (const B of AMB.birds) {
      const e = B.e;
      // TimeOfDayParticles: Play() khi vào khung giờ (hệ chạy lại từ 0), Stop() khi ra ngoài — Stop chỉ ngừng phát, chim đang bay bay nốt.
      // Trạng thái phát theo giờ cập nhật cả cho bộ phát xa (không mô phỏng) để cờ `playing` luôn đúng.
      const win = inWindow(e.tod, env && env.tod != null ? env.tod : 0.3);
      if (win && !B.playing) { B.playing = true; B.t0 = now; B.cycle = -1; B.fired = 0; }
      else if (!win && B.playing) B.playing = false;
      // [ĐỀ XUẤT] bộ phát xa hơn 450 m (ngoài tầm sương ban ngày) không mô phỏng
      if (cam && Math.hypot(cam.x - e.pos[0], cam.z - e.pos[2]) > 450) { B.ps.length = 0; B.im.count = 0; B.im.visible = false; continue; }
      B.im.visible = true;
      // phát theo burst mỗi vòng lengthInSec (looping)
      if (B.playing) {
        const age = now - B.t0, cyc = Math.floor(age / e.lengthInSec), tin = age - cyc * e.lengthInSec;
        if (cyc !== B.cycle) { B.cycle = cyc; B.fired = 0; }
        for (const b of e.bursts) for (let k = B.fired; k < b.cycles; k++) {
          if (tin < b.time + k * b.interval) break;
          if (Math.random() <= b.probability) { const c = Math.round(mmc(b.count, 0, Math.random())); for (let i = 0; i < c; i++) spawnBird(B, now); }
          B.fired = k + 1;
        }
      }
      B.ps = B.ps.filter(p => now - p.born < p.life);
      const V = e.VelocityModule || {}, grad = e.ColorModule && e.ColorModule.gradient && e.ColorModule.gradient.gradient;
      let i = 0;
      for (const p of B.ps) {
        const a = now - p.born, u = a / p.life;
        // quỹ đạo quanh trục y của bộ phát + vận tốc y theo đường cong (tích phân số 16 bước)
        let y = 0; const st = 8;
        for (let s = 0; s < st; s++) y += mmc(V.y, (s + 0.5) / st * u, p.rv) * (a / st);
        const ang = p.phi + p.w * a;
        _bp.set(e.pos[0] + Math.cos(ang) * p.rad, e.pos[1] + p.dy + y, e.pos[2] + Math.sin(ang) * p.rad);
        // căn theo vận tốc (alignment 4): tiếp tuyến quỹ đạo + thành phần y; mũi lưới (Unity +z) = −z three.js
        const vy = mmc(V.y, u, p.rv);
        _fw.set(-Math.sin(ang) * p.rad * p.w, vy, Math.cos(ang) * p.rad * p.w).normalize();
        _bm.lookAt(_fw.negate(), _o0, _up); _bq.setFromRotationMatrix(_bm);
        const s = p.size * mmc(e.SizeModule && e.SizeModule.curve, u, 0) * e.scale[1];
        _bs.set(s, s, s);
        _bm.compose(_bp, _bq, _bs);
        B.im.setMatrixAt(i, _bm);
        // màu hạt theo đời (gradient gốc chỉ đổi kênh B: vỗ cánh / lượn), R = G = A = 1
        B.pc.setXYZW(i, 1, 1, grad ? gradB(grad, u) : 1, 1);
        i++;
      }
      B.im.count = i;
      B.im.instanceMatrix.needsUpdate = true; B.pc.needsUpdate = true;
    }
  }
  const _rs = new T.Matrix4();
  function updateAmbient(dt, ctx, env) {
    AMB.cam = ctx.cam || null;
    stepBuoys(dt, ctx);
    if (!AMB.birdMat) return;
    updateBirds(dt, env);
    for (const sys of [AMB.streaks, AMB.motes]) if (sys) {
      const u = sys.obj.material.uniforms;
      u.uT.value = AMB.time; u.uBoat.value.set(ctx.x, 0, ctx.z); // hạt mô phỏng trong không gian cục bộ của thuyền
    }
    const B = AMB.beam;
    if (B) {
      // localEulerAngles.y += dt·30 (Unity, tay trái) ⇒ quay −θ quanh y ở three.js
      B.angle += dt * B.L.rotateSpeed * (B.L.counterClockwise ? -1 : 1);
      B.pivot.quaternion.copy(B.q0).multiply(_yq.setFromAxisAngle(_up, -T.MathUtils.degToRad(B.angle)));
      // DistanceScaler: localScale = 1 + khoảng cách ngang tới camera × 0,004
      const cam = ctx.cam || _bp.set(ctx.x, 0, ctx.z), k = 1 + Math.hypot(cam.x - B.L.rootPos[0], cam.z - B.L.rootPos[2]) * B.L.distanceScale;
      B.rootG.matrix.copy(B.R3).multiply(_rs.makeScale(k, k, k)); B.rootG.matrixWorldNeedsUpdate = true;
    }
  }

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


  // ---------- [W4 seam] điểm nổ mìn: xoá ô đất khỏi landmask lúc chạy + ẩn vật cảnh (js/explosives.js, tools/explosives.py) ----------
  // carveLand(runs, back): runs = [[hàng j, cột i đầu, số ô]] của landmask.png; các ô thành nước (back = true: trả lại thành đất, ván mới sau khi đã nổ), tính lại trường khoảng cách và texture bọt trong cửa sổ quanh chúng
  // (đất xa hơn 64 m không đổi được kết quả: bọt cắt ở 64 m). Trả về số ô đã đổi.
  const ZERO_M = new T.Matrix4().makeScale(0, 0, 0);
  function carveLand(runs, back) {
    if (!solidArr || !LB) return 0;
    const cols = LB.cols, rows = LB.rows;
    let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1, n = 0;
    for (const [j, i, c] of runs) {
      if (j < 0 || j >= rows) continue;
      for (let k = 0; k < c; k++) { const a = i + k; if (a >= 0 && a < cols && solidArr[j * cols + a] !== (back ? 1 : 0)) { solidArr[j * cols + a] = back ? 1 : 0; n++; } }
      i0 = Math.min(i0, i); i1 = Math.max(i1, i + c - 1); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
    }
    if (!n) return 0;
    const PAD = 128, WR = 64;
    const wi0 = Math.max(0, i0 - PAD), wi1 = Math.min(cols - 1, i1 + PAD), wj0 = Math.max(0, j0 - PAD), wj1 = Math.min(rows - 1, j1 + PAD);
    const ww = wi1 - wi0 + 1, wh = wj1 - wj0 + 1, sub = new Uint8Array(ww * wh);
    for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) sub[y * ww + x] = solidArr[(wj0 + y) * cols + wi0 + x];
    const toLand = chamfer(sub, ww, wh, 1), toWater = chamfer(sub, ww, wh, 0);
    for (let y = Math.max(0, j0 - WR - wj0); y <= Math.min(wh - 1, j1 + WR - wj0); y++) {
      for (let x = Math.max(0, i0 - WR - wi0); x <= Math.min(ww - 1, i1 + WR - wi0); x++) {
        const q = y * ww + x, p = (wj0 + y) * cols + wi0 + x, d = sub[q] ? toWater[q] : toLand[q];
        if (d >= 1e8) continue;                                      // không thấy phía đối diện trong cửa sổ: giữ giá trị cũ
        const v = sub[q] ? -(d - 0.5) : d - 0.5;
        sdfArr[p] = v;
        foamArr[p] = Math.max(0, Math.min(255, Math.round(Math.max(0, v) / 64 * 255)));
      }
    }
    if (W.landTex) W.landTex.needsUpdate = true;
    return n;
  }
  // hideInstances(list): chỉ số trong instances.bin; ẩn bằng ma trận co về 0 (cả ô đã dựng lẫn ô dựng sau)
  function zeroHidden(im, off, n) {
    const keep = im.userData.saved || (im.userData.saved = new Map()), arr = im.instanceMatrix.array;
    let ch = false;
    for (let k = 0; k < n; k++) {
      if (hiddenInst.has(off + k)) { if (!keep.has(k)) { keep.set(k, arr.slice(k * 16, k * 16 + 16)); im.setMatrixAt(k, ZERO_M); ch = true; } }
      else if (keep.has(k)) { arr.set(keep.get(k), k * 16); keep.delete(k); ch = true; }   // hiện lại (ván mới sau khi đã nổ)
    }
    if (ch) im.instanceMatrix.needsUpdate = true;
  }
  function hideInstances(list, show) {
    for (const i of list) { if (show) hiddenInst.delete(i); else hiddenInst.add(i); }
    for (const c of Object.values(W.cells)) {
      if (!c.group) continue;
      for (const im of c.group.children) if (im.isInstancedMesh && im.userData.off !== undefined) zeroHidden(im, im.userData.off, im.count);
    }
  }

  Object.assign(W, { carveLand, hideInstances, load, stream, cull, sdf, grad, depth01, steep01, zoneAt, setNight, resolve, updateAmbient, isLand: (x, z) => sdf(x, z) < 0 });
})(window);
