// Vox post chain and soft sun shadows for the voxel prototype (?vox=1). Same contract as BZ.makePost (js/post.js):
// { on, can, strength, begin(), end(), debug() }. Loaded only behind ?vox=1; the plain game never sees this file.
//
// Credit: the techniques and most numbers below come from Saltline by Felix Rieseberg (claude.ai artifact
// BGY1SztrAYcJQHSsnHHGmp), read in the pinned beautified bundle game.pretty.js (skill fps-high-quality):
//   - PCSS sun shadows: lines 24551-24654 (blocker search 8 taps, Vogel disc 16 taps, IGN rotation, receiver-plane
//     bias 0.0030/texel x0.35, penumbra distM*0.022 clamped 0.012..0.60 x radius, 2 % border fade). Adapted to
//     three r160, whose getShadow() has no shadowIntensity argument; still reads PCFShadowMap's RGBA-packed depth.
//   - depth linearise + half-res AO: 24673-24714 (spiral kernel, R 0.9 m scaled 0.6..1 with depth, falloff f^3,
//     bias 0.015+0.004z, fade 70..140 m); bilateral blur 24772-24785 (7 taps, BLUR_TOL 0.04);
//     joint-bilateral upsample and AO-fades-on-lit-pixels composite 24786-24818 (strength 0.95, cool tint 0,.03,.07).
//   - eye adaptation 24885-24911 + exposure 24666-24669 (7x5 centre-weighted log-average, tau 1.5 s, NaN guard);
//     key/exponent/clamp retuned to 0.165 / 0.25 / 0.85..1.15 from measured metering (see EXP).
//   - grade 24932-25038: ACES Hill fit and AgX (Filament fit, LOOK_POWER 1.18 / LOOK_SAT 1.22) mixed 0.25,
//     split tone, S-curve, lifted teal blacks, vignette (25011-25030); grain + 1/255 dither from 25039-25069.
//     Retuned: filmic curve only above a 0.55 toe, split tone 25 %, S-curve 0.12, black lift 1/4, vignette 0.14,
//     plus js/post.js's own +7 % saturation, so the pixel palette survives day and night.
//   Retuned for Blockade Z's low-range Lambert lighting and pixel palette (values below say where they differ).
//   Not taken: volumetric fog, motion blur, streak, flare, lens dirt, chromatic aberration, FXAA, sharpen
//   (they smear or tint the pixel textures); bloom stays the game's own 3-level bloom from js/post.js.
//
// Switches (bisect a bad pixel): ?voxpost=0 whole chain off -> BZ.makePost; ?voxao=0 ?voxbloom=0 ?voxexp=0
// ?voxgrade=0 ?voxgrain=0 one pass off; ?voxpcss=0 stock PCF shadows. Low tier: ?voxlow=lite (default) | full | 0.
// ?voxdbg=ao shows the blurred AO buffer.
const BZ = window.BZ;
const THREE = window.THREE;
const V = BZ.vox;
const P = BZ.params || Object.fromEntries(new URLSearchParams(location.search));
const want = (k) => V.want(k);

// ---------------------------------------------------------------- PCSS (Saltline 24551-24654, r160 signature)
// Installed at import time: vox modules load before the renderer exists, so no material has compiled yet.
// Shadow frustum from js/main.js: ortho -48..48, near 1, far 140 -> 96 x 96 m, 139 m deep.
let stockShadowChunk = null;
function installPCSS(fr, taps, searchTaps) {
  if (stockShadowChunk === null) stockShadowChunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const s = stockShadowChunk;
  const o = s.indexOf('float getShadow('); const r = s.indexOf('vec2 cubeToUV');
  if (o < 0 || r < 0 || r < o || s.indexOf('float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord )') !== o) {
    console.warn('[vox] post: shadow chunk layout differs from r160, keeping stock PCF'); return false;
  }
  const body = `
const vec2 SL_FRUSTUM = vec2(${fr.width.toFixed(3)}, ${fr.height.toFixed(3)});
const float SL_DEPTH = ${fr.depth.toFixed(3)};
#if __VERSION__ >= 300
#define SL_TAP(m, uv) textureLod(m, uv, 0.0)
#else
#define SL_TAP(m, uv) texture2D(m, uv)
#endif
float slIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec2 slVogel(int i, int n, float phi){ float r = sqrt((float(i) + 0.5) / float(n)); float th = float(i) * 2.39996323 + phi; return r * vec2(cos(th), sin(th)); }
float getShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord){
  shadowCoord.xyz /= shadowCoord.w;
  vec3 sc = shadowCoord.xyz;
  vec3 dx = dFdx(sc), dy = dFdy(sc);
  bool inFrustum = sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0;
  if (!(inFrustum && sc.z <= 1.0)) return 1.0;
  float det = dx.x * dy.y - dx.y * dy.x;
  vec2 dz = vec2(0.0);
  if (abs(det) > 1e-12) dz = vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / det;
  vec2 texel = 1.0 / shadowMapSize;
  float maxSlope = 0.0030 / max(texel.x, texel.y);
  dz = clamp(dz, vec2(-maxSlope), vec2(maxSlope));
  float zr = sc.z + shadowBias - (abs(dz.x) * texel.x + abs(dz.y) * texel.y) * 0.35;
  float phi = slIGN(gl_FragCoord.xy) * 6.2831853;
  vec2 searchR = (0.55 * shadowRadius) / SL_FRUSTUM;
  float blk = 0.0, nb = 0.0;
  for (int i = 0; i < ${searchTaps}; i++) {
    vec2 o = slVogel(i, ${searchTaps}, phi) * searchR;
    float d = unpackRGBAToDepth(SL_TAP(shadowMap, sc.xy + o));
    if (d < zr + dot(o, dz)) { blk += d; nb += 1.0; }
  }
  if (nb < 0.5) return 1.0;
  float avg = blk / nb;
  float distM = max(zr - avg, 0.0) * SL_DEPTH;
  float penM = clamp(distM * 0.022 * shadowRadius, 0.012 * shadowRadius, 0.60 * shadowRadius);
  vec2 filtR = max(vec2(penM) / SL_FRUSTUM, texel * 1.25);
  float lit = 0.0;
  for (int i = 0; i < ${taps}; i++) {
    vec2 o = slVogel(i, ${taps}, phi + 1.7) * filtR;
    float d = unpackRGBAToDepth(SL_TAP(shadowMap, sc.xy + o));
    lit += step(zr + dot(o, dz), d);
  }
  lit /= float(${taps});
  vec2 e = min(sc.xy, 1.0 - sc.xy);
  return mix(1.0, lit, smoothstep(0.0, 0.02, min(e.x, e.y)));
}
`;
  THREE.ShaderChunk.shadowmap_pars_fragment = s.slice(0, o) + body + s.slice(r);
  return true;
}
const uninstallPCSS = () => { if (stockShadowChunk !== null) THREE.ShaderChunk.shadowmap_pars_fragment = stockShadowChunk; };
// the chunk only compiles where a shadow-casting sun exists (medium/high), so installing it on low costs nothing
const PCSS = { on: V.on && want('pcss') && want('post') && installPCSS({ width: 96, height: 96, depth: 139 }, 16, 8) };

// ---------------------------------------------------------------- shaders
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMMON = `
varying vec2 vUv;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
// full-res linear view z (m) from the world depth, taken before the gun clears depth; sky / nothing = 1e4
const FS_LINZ = `${COMMON}
uniform sampler2D tDepth; uniform float uNear, uFar;
void main(){
  float d = texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).r;
  float z = d >= 0.999999 ? 1e4 : (uNear * uFar) / (uFar - d * (uFar - uNear));
  gl_FragColor = vec4(z, 0.0, 0.0, 1.0);
}`;
// half-res depth = every second full-res texel (exactly Saltline's depthhalf, without the extra target)
const ZH = `
uniform sampler2D tZ; uniform vec2 uHalf;
float zH(vec2 uv){ ivec2 p = ivec2(clamp(floor(uv * uHalf), vec2(0.0), uHalf - 1.0)) * 2; return texelFetch(tZ, min(p, textureSize(tZ, 0) - 1), 0).r; }
`;
const FS_AO = `${COMMON}${ZH}
uniform vec2 uTanHalf; uniform float uRadius, uIntensity, uAspect;
vec3 vpos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z); }
void main(){
  vec2 uTexel = 1.0 / uHalf;
  float z0 = zH(vUv);
  if (z0 < 0.05 || z0 > 140.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = vpos(vUv, z0);
  vec2 ox = vec2(uTexel.x, 0.0), oy = vec2(0.0, uTexel.y);
  float zl = zH(vUv - ox), zr = zH(vUv + ox), zd = zH(vUv - oy), zu = zH(vUv + oy);
  vec3 dx = abs(zl - z0) < abs(zr - z0) ? P - vpos(vUv - ox, zl) : vpos(vUv + ox, zr) - P;
  vec3 dy = abs(zd - z0) < abs(zu - z0) ? P - vpos(vUv - oy, zd) : vpos(vUv + oy, zu) - P;
  vec3 n = normalize(cross(dx, dy));
  float R = uRadius * (0.6 + 0.4 * clamp(z0 / 12.0, 0.0, 1.0));
  float rUv = clamp(R / (2.0 * z0 * uTanHalf.y), 3.0 * uTexel.y, 0.14);
  float R2 = R * R;
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  float sum = 0.0;
  for (int i = 0; i < AO_TAPS; i++) {
    float a = (float(i) + 0.5) / float(AO_TAPS);
    float th = a * 6.2831853 * 3.0 + rot;
    vec2 o = vec2(cos(th), sin(th)) * a * rUv; o.x /= uAspect;
    vec2 uv2 = vUv + o;
    float z2 = zH(uv2);
    vec3 v = vpos(uv2, z2) - P;
    float vv = dot(v, v), vn = dot(v, n);
    float f = max(R2 - vv, 0.0);
    sum += f * f * f * max((vn - (0.015 + 0.004 * z0)) / (vv + 0.004), 0.0);
  }
  float ao = max(0.0, 1.0 - uIntensity * sum * 5.0 / (R2 * R2 * R2 * float(AO_TAPS)));
  ao = mix(ao, 1.0, smoothstep(70.0, 140.0, z0));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;
const FS_BLUR = `${COMMON}${ZH}
uniform sampler2D tSrc; uniform vec2 uDir;
void main(){
  float zc = min(zH(vUv), 300.0);
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = min(zH(uv), 300.0);
    float w = (1.0 - abs(float(i)) * 0.22) * max(0.0, 1.0 - abs(z - zc) / (0.04 * zc + 0.02));
    acc += texture2D(tSrc, uv) * w; ws += w;
  }
  gl_FragColor = ws > 1e-4 ? acc / ws : texture2D(tSrc, vUv);
}`;
// metering straight off the HDR frame: 7x5 centre-weighted log-average, smoothed over time (Saltline 24885-24911)
const FS_ADAPT = `${COMMON}
uniform sampler2D tPrev, tLum; uniform float uRate;
void main(){
  float ls = 0.0, ws = 0.0;
  for (int y = 0; y < 5; y++) for (int x = 0; x < 7; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(7.0, 5.0);
    float w = 1.0 - 0.75 * smoothstep(0.1, 0.55, length(uv - 0.5));
    // 4 taps per cell so one stray pixel (muzzle flash, a lamp) does not swing the meter
    vec2 d = vec2(0.035, 0.05);
    float l = 0.25 * (luma(texture2D(tLum, uv + d * vec2(-1.0, -1.0)).rgb) + luma(texture2D(tLum, uv + d * vec2(1.0, -1.0)).rgb)
                    + luma(texture2D(tLum, uv + d * vec2(-1.0, 1.0)).rgb) + luma(texture2D(tLum, uv + d).rgb));
    ls += log(max(l, 1e-4)) * w; ws += w;
  }
  float avg = clamp(exp(ls / ws), 0.002, 40.0);
  float a = mix(texture2D(tPrev, vec2(0.5)).r, avg, uRate);
  if (!(a > 0.0) || a > 1e4) a = avg;
  gl_FragColor = vec4(a, 0.0, 0.0, 1.0);
}`;
// composite + grade + grain in one full-screen pass, straight to the canvas
const FS_FINAL = `${COMMON}${ZH}
uniform sampler2D tScene, tDepth, tAO, tBloom, tAdapt;
uniform float uAoOn, uAoStrength, uGun, uBloomOn, uBloom, uExpOn, uKey, uExpPow, uMinE, uMaxE, uGradeOn, uAgxMix, uToe, uVignette, uGrain, uTime, uAspect, uLite;
const mat3 SL_REC2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 SL_SRGB_TO_REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
vec3 slAgxContrast(vec3 x){ vec3 x2 = x * x; vec3 x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
vec3 slAgx(vec3 color){
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float minEv = -12.47393, maxEv = 4.026069;
  color = inset * (SL_SRGB_TO_REC2020 * color);
  color = clamp((log2(max(color, 1e-10)) - minEv) / (maxEv - minEv), 0.0, 1.0);
  color = slAgxContrast(color);
  float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = pow(max(color, vec3(0.0)), vec3(1.18));
  color = l + (color - l) * 1.22;
  color = outset * color;
  color = pow(max(color, vec3(0.0)), vec3(2.2));
  return clamp(SL_REC2020_TO_SRGB * color, 0.0, 1.0);
}
vec3 slRRTODT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 slAces(vec3 c){
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(outM * slRRTODT(inM * (c * 1.3)), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float slExposure(){ float a = texture2D(tAdapt, vec2(0.5)).r; return mix(1.0, clamp(pow(uKey / max(a, 1e-4), uExpPow), uMinE, uMaxE), uExpOn); }
void main(){
  vec3 col = max(texture2D(tScene, vUv).rgb, vec3(0.0));
  float ex = slExposure();
  if (uAoOn > 0.5) {
    float d = texture2D(tDepth, vUv).r;
    // the gun cleared depth before drawing, so any depth < 1 here is the gun: no world AO on (or around) it
    bool gun = uGun > 0.5 && d < 0.999999;
    float zc = texelFetch(tZ, ivec2(gl_FragCoord.xy), 0).r;
    if (!gun && zc < 140.0) {
      vec2 hp = vUv * uHalf - 0.5; vec2 f = fract(hp); vec2 base = (floor(hp) + 0.5) / uHalf; vec2 tx = 1.0 / uHalf;
      float ao = 0.0, ws = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = vec2(float(k & 1), float(k >> 1));
        vec2 uv = base + o * tx;
        float zh = min(zH(uv), 300.0);
        float w = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
        w = max(w / (0.015 + abs(zh - zc) / zc), 1e-5);
        ao += texture2D(tAO, uv).r * w; ws += w;
      }
      ao /= ws;
      // Saltline fades AO 80 % on lit pixels; a sunny pixel street would then show none, so 50 % here
      float lit = smoothstep(0.16, 0.85, luma(col) * ex);
      float a = mix(1.0, ao, uAoStrength * (1.0 - 0.5 * lit));
      col *= mix(vec3(a), vec3(1.0), vec3(0.0, 0.03, 0.07));
    }
  }
  // the game's own bloom, added as js/post.js does (strength set by main.js every frame)
  if (uBloomOn > 0.5) col += texture2D(tBloom, vUv).rgb * uBloom;
  col *= ex;
  if (uGradeOn > 0.5) {
    // ACES/AgX shoulder only: below uToe the palette passes through untouched (a full ACES toe would crush the
    // night street: 0.02 -> 0.005); above it the filmic curve rolls fire, muzzle flash and bloom off to white
    vec3 fil = mix(slAces(col), slAgx(col), uAgxMix);
    float l0 = luma(col);
    col = mix(col, fil, smoothstep(uToe, 1.0, max(l0, max(col.r, max(col.g, col.b)) * 0.8)));
    // the game's own post adds 7 % saturation (js/post.js fin); keep it so the palette matches the shipped look
    col = clamp(mix(vec3(luma(col)), col, 1.07), 0.0, 1.0);
    float l = luma(col);
    // Saltline's split tone at 25 %, S-curve 0.12 (Saltline 0.22), teal black lift at 1/4 (Saltline's +0.011 linear
    // turns the pixel palette's pure black into sRGB 26/255 grey: the gun and the hazard stripes went flat)
    col *= mix(mix(vec3(1.0), vec3(0.80, 1.01, 1.13), 0.25), mix(vec3(1.0), vec3(1.07, 1.0, 0.90), 0.25), smoothstep(0.03, 0.55, l));
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.12);
    col = col * 0.997 + vec3(0.0015, 0.0021, 0.0028);
    vec2 c = vUv - 0.5;
    float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) / (0.25 * (uAspect * uAspect + 1.0));
    float vr = smoothstep(0.15, 1.05, r2);
    col *= 1.0 - uVignette * vr * vr * (3.0 - 2.0 * vr);
  }
  col = toSRGB(clamp(col, 0.0, 1.0));
  if (uGrain > 0.0) {
    vec2 seed = gl_FragCoord.xy + fract(uTime * vec2(7.31, 3.17)) * vec2(311.7, 173.3);
    float g = hash12(seed) + hash12(seed + 57.3) - 1.0;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col += g * uGrain * mix(1.0, 0.30, smoothstep(0.25, 0.9, l)) * (0.35 + 0.65 * smoothstep(0.0, 0.08, l));
    col += (hash12(gl_FragCoord.xy * 1.37 + 11.0) + hash12(gl_FragCoord.xy * 0.71 + 3.0) - 1.0) / 255.0;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- the chain
const EXP = { key: 0.165, pow: 0.25, min: 0.85, max: 1.15 };
V.makePost = (G) => {
  if (!want('post')) { uninstallPCSS(); return BZ.makePost(G); }
  const renderer = G.renderer; const gl = renderer.getContext();
  const low = G.quality.name === 'low';
  const lowMode = P.voxlow === 'full' ? 'full' : P.voxlow === '0' ? 'off' : 'lite';
  const float = renderer.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float');
  // full chain needs float targets; lite (grade + grain only) runs on anything WebGL2
  const mode = !renderer.capabilities.isWebGL2 ? 'off' : low ? (lowMode === 'full' && !float ? 'lite' : lowMode) : float ? 'full' : 'lite';
  if (P.post === '0') { uninstallPCSS(); return { on: false, can: false, strength: 0.6, begin() {}, end() {}, debug: () => ({ on: false, vox: true }) }; }
  const full = mode === 'full';
  const sw = { ao: full && want('ao'), bloom: full && want('bloom'), exp: full && want('exp'), grade: want('grade'), grain: want('grain') };
  const api = { on: mode !== 'off', strength: 0.6, begin() {}, end() {}, debug: () => ({ on: false, vox: true, mode }) };
  api.can = api.on;
  if (!api.on) return api;
  if (PCSS.on && G.quality.shadow > 0) pcssSelfTest(renderer);

  const HF = float ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const mkRT = (o) => new THREE.WebGLRenderTarget(4, 4, Object.assign({ type: HF, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }, o));
  const depthTex = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
  const main = mkRT({ depthBuffer: true, depthTexture: depthTex, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  main.texture.minFilter = THREE.LinearFilter; // bloom taps read between texels; the final pass samples texel centres
  // no float targets (lite path): an 8-bit linear target bands the night street; an sRGB8 target stores it perceptually
  if (!float) main.texture.colorSpace = THREE.SRGBColorSpace;
  const zFull = sw.ao ? mkRT({ type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }) : null;
  const aoA = sw.ao ? mkRT({ type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }) : null;
  const aoB = sw.ao ? mkRT({ type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }) : null;
  const down = sw.bloom ? [mkRT(), mkRT(), mkRT()] : []; const up = sw.bloom ? [mkRT(), mkRT()] : [];
  const adapt = sw.exp ? [0, 1].map(() => { const t = mkRT({ type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); t.setSize(1, 1); return t; }) : [];
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
  const mat = (fs, uniforms, defines) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  const U = (v) => ({ value: v });
  const zU = () => ({ tZ: U(null), uHalf: U(new THREE.Vector2(1, 1)) });
  const linZ = mat(FS_LINZ, { tDepth: U(depthTex), uNear: U(0.05), uFar: U(600) });
  // aoRadius 0.9 -> 0.7 m: blocks are 1 m, a 0.9 m kernel greys whole wall faces; intensity 1.6 as Saltline
  const aoM = mat(FS_AO, Object.assign(zU(), { uTanHalf: U(new THREE.Vector2()), uRadius: U(0.7), uIntensity: U(1.6), uAspect: U(1) }), { AO_TAPS: G.quality.name === 'high' ? 12 : 8 });
  const blurM = mat(FS_BLUR, Object.assign(zU(), { tSrc: U(null), uDir: U(new THREE.Vector2()) }));
  const adaptM = mat(FS_ADAPT, { tPrev: U(null), tLum: U(main.texture), uRate: U(1) });
  // bloom passes: unchanged from js/post.js
  const pre = mat(`uniform sampler2D map; uniform vec2 px; uniform float thr; varying vec2 vUv;
    vec3 pick(vec2 uv) { vec3 c = min(texture2D(map, uv).rgb, vec3(1.6)); float b = max(c.r, max(c.g, c.b)); return c * smoothstep(thr, thr + 0.35, b); }
    void main() { gl_FragColor = vec4((pick(vUv + px * vec2(-1.0, -1.0)) + pick(vUv + px * vec2(1.0, -1.0)) + pick(vUv + px * vec2(-1.0, 1.0)) + pick(vUv + px * vec2(1.0, 1.0))) * 0.25, 1.0); }`,
  { map: U(main.texture), px: U(new THREE.Vector2()), thr: U(0.72) });
  const dn = mat(`uniform sampler2D map; uniform vec2 px; varying vec2 vUv;
    void main() { gl_FragColor = vec4((texture2D(map, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, 1.0)).rgb) * 0.25, 1.0); }`,
  { map: U(null), px: U(new THREE.Vector2()) });
  const upM = mat(`uniform sampler2D map; uniform sampler2D hi; uniform vec2 px; varying vec2 vUv;
    void main() { vec3 s = texture2D(map, vUv).rgb * 4.0;
      s += (texture2D(map, vUv + px * vec2(-1.0, 0.0)).rgb + texture2D(map, vUv + px * vec2(1.0, 0.0)).rgb + texture2D(map, vUv + px * vec2(0.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(0.0, 1.0)).rgb) * 2.0;
      s += texture2D(map, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, 1.0)).rgb;
      gl_FragColor = vec4(s / 16.0 + texture2D(hi, vUv).rgb, 1.0); }`,
  { map: U(null), hi: U(null), px: U(new THREE.Vector2()) });
  // key 0.165 / exponent 0.25 / clamp 0.85..1.15 (Saltline: 0.12 / 0.85 / 0.6..2 for a sun-9 HDR scene). Measured on the
  // street at tod 0.45 the metered log-average is 0.163 (exposure 1.0, the day palette as the game ships it) and 0.0275
  // at tod 0.02 (exposure capped 1.15). This game's
  // lighting is display-range already, so adaptation only nudges: a dim alley opens up a little, night stays night
  const fin = mat(FS_FINAL, Object.assign(zU(), {
    tScene: U(main.texture), tDepth: U(depthTex), tAO: U(white), tBloom: U(white), tAdapt: U(white),
    uAoOn: U(0), uAoStrength: U(0.95), uGun: U(0), uBloomOn: U(0), uBloom: U(0.6), uExpOn: U(0), uKey: U(EXP.key), uExpPow: U(EXP.pow), uMinE: U(EXP.min), uMaxE: U(EXP.max),
    uGradeOn: U(sw.grade ? 1 : 0), uAgxMix: U(0.25), uToe: U(0.55), uVignette: U(0.14), uGrain: U(sw.grain ? 0.016 : 0), uTime: U(0), uAspect: U(1), uLite: U(full ? 0 : 1),
  }));

  // ?voxdbg=ao shows the blurred AO buffer instead of the frame (tuning aid)
  const dbgM = P.voxdbg === 'ao' ? mat(`uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rrr, 1.0); }`, { map: U(null) }) : null;
  const size = new THREE.Vector2(); let W = 0; let H = 0; let hw = 1; let hh = 1;
  function fit() {
    renderer.getDrawingBufferSize(size);
    if (size.x === W && size.y === H) return;
    W = size.x; H = size.y; main.setSize(W, H); depthTex.image.width = W; depthTex.image.height = H;
    hw = Math.max(1, Math.ceil(W / 2)); hh = Math.max(1, Math.ceil(H / 2));
    if (sw.ao) { zFull.setSize(W, H); aoA.setSize(hw, hh); aoB.setSize(hw, hh); }
    let w = W; let h = H;
    for (let i = 0; i < down.length; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); down[i].setSize(w, h); if (i < 2) up[i].setSize(w, h); }
  }
  for (const m of [aoM, blurM, fin]) m.uniforms.uHalf.value = new THREE.Vector2(1, 1);
  const halfV = new THREE.Vector2();
  function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(quad, cam); }
  const st = { frame: false, zDone: false, gun: false, ping: 0, lastT: 0, frames: 0 };
  function depthPass() {
    if (!sw.ao || st.zDone) return; st.zDone = true;
    linZ.uniforms.uNear.value = G.camera.near; linZ.uniforms.uFar.value = G.camera.far;
    pass(linZ, zFull);
  }
  // the gun is drawn after renderer.clearDepth(): take the world depth just before, so AO never sees the gun
  if (sw.ao && G.weapons && typeof G.weapons.render === 'function') {
    const orig = G.weapons.render;
    G.weapons.render = function (r) {
      if (st.frame && !st.zDone) { depthPass(); renderer.setRenderTarget(main); }
      if (st.frame) st.gun = !(G.tps && G.tps.on);
      return orig.call(this, r);
    };
  }

  api.begin = () => { fit(); st.frame = true; st.zDone = false; st.gun = false; renderer.setRenderTarget(main); renderer.clear(); };
  api.end = () => {
    st.frame = false;
    const now = performance.now() / 1000; const dt = st.lastT ? now - st.lastT : 1; st.lastT = now; st.frames++;
    halfV.set(hw, hh);
    const F = fin.uniforms;
    if (sw.ao) {
      depthPass();
      for (const m of [aoM, blurM, fin]) { m.uniforms.tZ.value = zFull.texture; m.uniforms.uHalf.value.copy(halfV); }
      const pm = G.camera.projectionMatrix.elements;
      aoM.uniforms.uTanHalf.value.set(1 / pm[0], 1 / pm[5]); aoM.uniforms.uAspect.value = W / H;
      pass(aoM, aoA);
      blurM.uniforms.tSrc.value = aoA.texture; blurM.uniforms.uDir.value.set(1 / hw, 0); pass(blurM, aoB);
      blurM.uniforms.tSrc.value = aoB.texture; blurM.uniforms.uDir.value.set(0, 1 / hh); pass(blurM, aoA);
      F.tAO.value = aoA.texture; F.uAoOn.value = 1; F.uGun.value = st.gun ? 1 : 0;
    }
    if (sw.bloom) {
      pre.uniforms.px.value.set(1 / W, 1 / H); pass(pre, down[0]);
      for (let i = 1; i < 3; i++) { dn.uniforms.map.value = down[i - 1].texture; dn.uniforms.px.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); pass(dn, down[i]); }
      let lo = down[2];
      for (let i = 1; i >= 0; i--) { upM.uniforms.map.value = lo.texture; upM.uniforms.hi.value = down[i].texture; upM.uniforms.px.value.set(1 / lo.width, 1 / lo.height); pass(upM, up[i]); lo = up[i]; }
      F.tBloom.value = up[0].texture; F.uBloomOn.value = 1; F.uBloom.value = api.strength;
    }
    if (sw.exp) {
      // tau 1.5 s; snap on the first frames and after a long gap (test hooks that jump time)
      adaptM.uniforms.uRate.value = st.frames < 3 || dt > 0.5 ? 1 : 1 - Math.exp(-dt / 1.5);
      adaptM.uniforms.tPrev.value = adapt[st.ping].texture; st.ping ^= 1; pass(adaptM, adapt[st.ping]);
      F.tAdapt.value = adapt[st.ping].texture; F.uExpOn.value = 1;
    }
    F.uTime.value = now % 1000; F.uAspect.value = W / H;
    if (dbgM && sw.ao) { dbgM.uniforms.map.value = aoA.texture; pass(dbgM, null); return; }
    pass(fin, null);
  };
  api.debug = () => {
    const d = { on: api.on, vox: true, mode, w: W, h: H, strength: api.strength, pcss: PCSS.on && G.quality.shadow > 0, passes: Object.keys(sw).filter((k) => sw[k]) };
    if (sw.exp) { try { const b = new Float32Array(4); renderer.readRenderTargetPixels(adapt[st.ping], 0, 0, 1, 1, b); d.avgLum = +b[0].toFixed(4); d.exposure = +Math.min(EXP.max, Math.max(EXP.min, Math.pow(EXP.key / Math.max(b[0], 1e-4), EXP.pow))).toFixed(3); } catch (e) { d.avgLum = String(e); } }
    return d;
  };
  api._tune = { fin, aoM, sw };
  return api;
};

// PCSS self test (Saltline 26147-26180): compile one shadow-receiving Lambert box with the patched chunk;
// if the program fails, put the stock chunk back so the world still gets PCF shadows.
function pcssSelfTest(renderer) {
  const sc = new THREE.Scene(); const l = new THREE.DirectionalLight(0xffffff, 1); l.castShadow = true; l.shadow.mapSize.set(16, 16); sc.add(l); sc.add(l.target);
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial()); m.receiveShadow = true; m.castShadow = true; m.position.z = -3; sc.add(m);
  const cam = new THREE.PerspectiveCamera(); const rt = new THREE.WebGLRenderTarget(4, 4);
  let ok = true;
  try {
    renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null);
    for (const p of renderer.info.programs || []) if (p.diagnostics && p.diagnostics.runnable === false) ok = false;
  } catch (e) { ok = false; }
  m.geometry.dispose(); m.material.dispose(); rt.dispose(); l.dispose();
  if (!ok) { PCSS.on = false; uninstallPCSS(); console.warn('[vox] post: soft shadow shader failed to compile, back to stock PCF'); }
}
