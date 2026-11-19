// Post chain ported from games/ga-chim/js/post.js (Saltline lineage), cut down for dark interiors:
// scene (HDR, linear) -> depthhalf -> AO (+2 blur) -> torch volumetrics (half res, +2 blur) -> composite
// -> bloom 5 down / 4 up -> grade (ACES, cold shadows / warm torch split tone, CA, vignette, hurt and low-hp edges)
// -> final (FXAA-lite, sharpen, grain, dither). No sun, no SSR, no eye adaptation (fixed exposure).
// URL flags turn passes off: post=0 (whole chain, old direct render), ao=0, vol=0, bloom=0, grade=0, fxaa=0.
import * as THREE from '../vendor/three.module.min.js';

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

export const TUNE = {
  exposure: 1.1 / 0.6, aoRadius: 0.55, aoIntensity: 1.5, aoStrength: 0.9,
  volSigma: 0.07, volStrength: 0.03, volDust: 0.9, volAmb: 0.002,
  bloom: 0.07, bloomMix: 0.6, ca: 0.0018, vignette: 0.55, grain: 0.03, sharpen: 0.25, saturation: 0.92,
};

class Pass {
  constructor(frag, uniforms, defines) {
    this.m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    this.mesh = new THREE.Mesh(tri, this.m); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.u = this.m.uniforms;
  }
  run(r, target) { r.setRenderTarget(target || null); r.render(this.scene, orthoCam); }
  dispose() { this.m.dispose(); }
}

const COMMON = /* glsl */`
varying vec2 vUv;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const DEPTHHALF_FS = /* glsl */`${COMMON}
uniform sampler2D tDepth; uniform float uNear, uFar;
void main(){
  ivec2 p = min(ivec2(gl_FragCoord.xy) * 2, textureSize(tDepth, 0) - 1);
  float d = texelFetch(tDepth, p, 0).r;
  float z = (uNear * uFar) / (uFar - d * (uFar - uNear));
  gl_FragColor = vec4(z, 0.0, 0.0, 1.0);
}`;

const AO_FS = /* glsl */`${COMMON}
uniform sampler2D tDepthHalf; uniform vec2 uTanHalf, uTexel; uniform float uRadius, uIntensity, uAspect;
vec3 vpos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z); }
void main(){
  float z0 = texture2D(tDepthHalf, vUv).r;
  if (z0 > 60.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = vpos(vUv, z0);
  vec2 ox = vec2(uTexel.x, 0.0), oy = vec2(0.0, uTexel.y);
  float zl = texture2D(tDepthHalf, vUv - ox).r, zr = texture2D(tDepthHalf, vUv + ox).r;
  float zd = texture2D(tDepthHalf, vUv - oy).r, zu = texture2D(tDepthHalf, vUv + oy).r;
  vec3 dx = abs(zl - z0) < abs(zr - z0) ? P - vpos(vUv - ox, zl) : vpos(vUv + ox, zr) - P;
  vec3 dy = abs(zd - z0) < abs(zu - z0) ? P - vpos(vUv - oy, zd) : vpos(vUv + oy, zu) - P;
  vec3 n = normalize(cross(dx, dy));
  float R = uRadius * (0.7 + 0.3 * clamp(z0 / 8.0, 0.0, 1.0));
  float rUv = clamp(R / (2.0 * z0 * uTanHalf.y), 3.0 * uTexel.y, 0.16);
  float R2 = R * R;
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  float sum = 0.0;
  for (int i = 0; i < AO_TAPS; i++) {
    float a = (float(i) + 0.5) / float(AO_TAPS);
    float th = a * 6.2831853 * 3.0 + rot;
    vec2 o = vec2(cos(th), sin(th)) * a * rUv; o.x /= uAspect;
    vec2 uv2 = vUv + o;
    float z2 = texture2D(tDepthHalf, uv2).r;
    vec3 v = vpos(uv2, z2) - P;
    float vv = dot(v, v), vn = dot(v, n);
    float f = max(R2 - vv, 0.0);
    sum += f * f * f * max((vn - (0.01 + 0.003 * z0)) / (vv + 0.004), 0.0);
  }
  float ao = max(0.0, 1.0 - uIntensity * sum * 5.0 / (R2 * R2 * R2 * float(AO_TAPS)));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const BLUR_FS = /* glsl */`${COMMON}
uniform sampler2D tSrc, tDepthHalf; uniform vec2 uDir;
void main(){
  float zc = min(texture2D(tDepthHalf, vUv).r, 60.0);
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = min(texture2D(tDepthHalf, uv).r, 60.0);
    float w = (1.0 - abs(float(i)) * 0.22) * max(0.0, 1.0 - abs(z - zc) / (BLUR_TOL * zc + 0.02));
    acc += texture2D(tSrc, uv) * w; ws += w;
  }
  gl_FragColor = ws > 1e-4 ? acc / ws : texture2D(tSrc, vUv);
}`;

// Torch volumetrics: march the view ray up to the surface, in-scatter from the spot cone (three.js spot falloff),
// dust density from world-space noise drifting slowly, so the beam reads as a dusty shaft in a dead house.
const VOL_FS = /* glsl */`${COMMON}
uniform sampler2D tDepthHalf; uniform vec2 uTanHalf; uniform mat4 uCamWorld;
uniform vec3 uLPos, uLDir, uLCol; uniform float uCosO, uCosI, uRange, uDecay, uSigma, uDust, uTime, uAmb, uOn;
void main(){
  float z = texture2D(tDepthHalf, vUv).r;
  vec3 vd = vec3((vUv * 2.0 - 1.0) * uTanHalf, -1.0);
  float rl = length(vd); vec3 rd = vd / rl;
  float maxD = min(z * rl, uRange);
  float j = ign(gl_FragCoord.xy);
  vec3 acc = vec3(0.0); float T = 1.0;
  // the torch cone is about as wide as the view: scattering from the air right at the eye would veil the whole frame,
  // so the beam starts 0.8 m out and only its core scatters (a shaft, not a fog)
  float t0 = 0.8, ds = max(maxD - t0, 0.0) / float(VOL_STEPS);
  for (int i = 0; i < VOL_STEPS; i++) {
    float t = t0 + (float(i) + j) * ds;
    vec3 p = rd * t;
    vec3 l = p - uLPos; float d = max(length(l), 0.05); vec3 ld = l / d;
    float cone = smoothstep(uCosO, 1.0, dot(ld, uLDir)); cone *= cone * smoothstep(uCosO, uCosI, dot(ld, uLDir));
    float rr = d / uRange; float att = pow(clamp(1.0 - rr * rr * rr * rr, 0.0, 1.0), 2.0) / max(pow(d, uDecay), 1.0);
    vec3 wp = (uCamWorld * vec4(p, 1.0)).xyz;
    float dens = uSigma * (1.0 + uDust * (vn3(wp * 1.3 + vec3(0.0, uTime * 0.05, uTime * 0.03)) - 0.5) * 2.0);
    dens = max(dens, 0.0);
    acc += T * (uLCol * cone * att * uOn + uAmb) * dens * ds;
    T *= exp(-dens * ds * 0.35);
  }
  gl_FragColor = vec4(acc, T);
}`;

const COMP_FS = /* glsl */`${COMMON}
uniform sampler2D tColor, tDepth, tDepthHalf, tAO, tVol;
uniform vec2 uHalfRes; uniform float uNear, uFar, uAoOn, uVolOn, uAoStrength, uVolK, uExposure;
void main(){
  vec3 col = max(texture2D(tColor, vUv).rgb, vec3(0.0));
  float d = texture2D(tDepth, vUv).r;
  float z = (uNear * uFar) / (uFar - d * (uFar - uNear));
  vec2 hp = vUv * uHalfRes - 0.5; vec2 f = fract(hp); vec2 base = (floor(hp) + 0.5) / uHalfRes; vec2 tx = 1.0 / uHalfRes;
  float ao = 0.0; vec4 vol = vec4(0.0); float ws = 0.0;
  float zc = min(z, 60.0);
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k & 1), float(k >> 1));
    vec2 uv = base + o * tx;
    float zh = min(texture2D(tDepthHalf, uv).r, 60.0);
    float w = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
    w *= 1.0 / (0.015 + abs(zh - zc) / zc);
    w = max(w, 1e-5);
    ao += texture2D(tAO, uv).r * w; vol += texture2D(tVol, uv) * w; ws += w;
  }
  ao /= ws; vol /= ws;
  if (uAoOn > 0.5 && d < 0.99999) {
    float lit = smoothstep(0.2, 1.2, luma(col) * uExposure);
    float a = mix(1.0, ao, uAoStrength * (1.0 - 0.7 * lit));
    col *= mix(vec3(a), vec3(1.0), vec3(0.0, 0.02, 0.05));
  }
  if (uVolOn > 0.5) col = col * vol.a + vol.rgb * uVolK;
  gl_FragColor = vec4(col, 1.0);
}`;

const DOWN_FS = /* glsl */`${COMMON}
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst;
vec3 s(vec2 o){ return min(max(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(0.0)), vec3(400.0)); }
float kw(vec3 c){ return 1.0 / (1.0 + luma(c) * 0.08); }
void main(){
  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
  vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
  vec3 col;
  if (uFirst > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = kw(g0) * 0.125, w1 = kw(g1) * 0.125, w2 = kw(g2) * 0.125, w3 = kw(g3) * 0.125, w4 = kw(g4) * 0.5;
    col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const UP_FS = /* glsl */`${COMMON}
uniform sampler2D tLow, tHigh; uniform vec2 uTexel; uniform float uMix;
void main(){
  vec2 o = uTexel;
  vec3 t = texture2D(tLow, vUv).rgb * 4.0;
  t += (texture2D(tLow, vUv + vec2(o.x, 0.0)).rgb + texture2D(tLow, vUv - vec2(o.x, 0.0)).rgb + texture2D(tLow, vUv + vec2(0.0, o.y)).rgb + texture2D(tLow, vUv - vec2(0.0, o.y)).rgb) * 2.0;
  t += texture2D(tLow, vUv + o).rgb + texture2D(tLow, vUv - o).rgb + texture2D(tLow, vUv + vec2(o.x, -o.y)).rgb + texture2D(tLow, vUv + vec2(-o.x, o.y)).rgb;
  t *= 1.0 / 16.0;
  gl_FragColor = vec4(mix(texture2D(tHigh, vUv).rgb, t, uMix), 1.0);
}`;

const GRADE_FS = /* glsl */`${COMMON}
uniform sampler2D tScene, tBloom;
uniform float uTime, uAspect, uBloom, uCA, uVignette, uExposure, uSaturation, uDamage, uLowHealth, uGradeOn, uBloomOn;
vec3 slRRTODT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 slAces(vec3 c){
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(outM * slRRTODT(inM * c), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main(){
  vec2 c = vUv - 0.5;
  float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) / (0.25 * (uAspect * uAspect + 1.0));
  vec3 col;
  if (uGradeOn > 0.5) { vec2 off = c * r2 * (uCA + uDamage * 0.008); col = vec3(texture2D(tScene, vUv + off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - off).b); }
  else col = texture2D(tScene, vUv).rgb;
  if (uBloomOn > 0.5) col = mix(col, texture2D(tBloom, vUv).rgb, uBloom);
  col *= uExposure;
  col = slAces(col);
  if (uGradeOn > 0.5) {
    float l = luma(col);
    col *= mix(vec3(0.88, 0.97, 1.08), vec3(1.06, 0.99, 0.9), smoothstep(0.02, 0.5, l));   // cold dark, warm torch
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.25);
    col = col * 0.99 + vec3(0.001, 0.0015, 0.003);
    float sat = uSaturation * (1.0 - 0.6 * uLowHealth) * (1.0 - 0.5 * uDamage);
    l = luma(col); col = mix(vec3(l), col, sat);
    float vig = uVignette + uLowHealth * 0.5;
    float vr = smoothstep(0.12, 1.05, r2);
    col *= 1.0 - vig * vr * vr * (3.0 - 2.0 * vr);
    float edge = smoothstep(0.18, 1.0, r2);
    col = mix(col, vec3(0.5, 0.02, 0.01) * (0.35 + l), clamp(uDamage * edge * 0.85 + uLowHealth * edge * edge * 0.3 * (0.7 + 0.3 * sin(uTime * 5.0)), 0.0, 1.0));
  }
  col = toSRGB(clamp(col, 0.0, 1.0));
  gl_FragColor = vec4(col, dot(col, vec3(0.299, 0.587, 0.114)));
}`;

const FINAL_FS = /* glsl */`${COMMON}
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uTime, uGrain, uSharpen, uFxaa;
void main(){
  vec4 M = texture2D(tSrc, vUv);
  vec3 col = M.rgb;
  vec4 NW = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel), NE = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel);
  vec4 SW = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel), SE = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel);
  float lMin = min(M.a, min(min(NW.a, NE.a), min(SW.a, SE.a)));
  float lMax = max(M.a, max(max(NW.a, NE.a), max(SW.a, SE.a)));
  float contrast = lMax - lMin;
  if (uFxaa > 0.5 && contrast > max(0.0312, lMax * 0.10)) {
    vec2 dir = vec2(-((NW.a + NE.a) - (SW.a + SE.a)), (NW.a + SW.a) - (NE.a + SE.a));
    float dirReduce = max((NW.a + NE.a + SW.a + SE.a) * 0.03125, 0.0078125);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
    vec4 A = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)) + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)));
    vec4 B = A * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5) + texture2D(tSrc, vUv + dir * 0.5));
    col = (B.a < lMin || B.a > lMax) ? A.rgb : B.rgb;
  }
  vec3 blur = (NW.rgb + NE.rgb + SW.rgb + SE.rgb) * 0.25;
  col += (M.rgb - blur) * uSharpen * (1.0 - smoothstep(0.04, 0.22, contrast));
  vec2 seed = gl_FragCoord.xy + fract(uTime * vec2(7.31, 3.17)) * vec2(311.7, 173.3);
  float g = hash12(seed) + hash12(seed + 57.3) - 1.0;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col += g * uGrain * mix(1.0, 0.30, smoothstep(0.25, 0.9, l)) * (0.35 + 0.65 * smoothstep(0.0, 0.08, l));
  col += (hash12(gl_FragCoord.xy * 1.37 + 11.0) + hash12(gl_FragCoord.xy * 0.71 + 3.0) - 1.0) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const rt = (w, h, type = THREE.HalfFloatType, depth = false) => {
  const t = new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth });
  if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; }
  return t;
};

export class Post {
  /** flags: { ao, vol, bloom, grade, fxaa } booleans (default all on). */
  constructor(renderer, flags = {}) {
    this.r = renderer;
    this.on = { ao: flags.ao !== false, vol: flags.vol !== false, bloom: flags.bloom !== false, grade: flags.grade !== false, fxaa: flags.fxaa !== false };
    this.depthHalf = new Pass(DEPTHHALF_FS, { tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 80 } });
    this.ao = new Pass(AO_FS, { tDepthHalf: { value: null }, uTanHalf: { value: new THREE.Vector2() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: TUNE.aoRadius }, uIntensity: { value: TUNE.aoIntensity }, uAspect: { value: 1 } }, { AO_TAPS: 10 });
    this.blurAO = new Pass(BLUR_FS, { tSrc: { value: null }, tDepthHalf: { value: null }, uDir: { value: new THREE.Vector2() } }, { BLUR_TOL: '0.05' });
    this.blurVol = new Pass(BLUR_FS, { tSrc: { value: null }, tDepthHalf: { value: null }, uDir: { value: new THREE.Vector2() } }, { BLUR_TOL: '0.30' });
    this.vol = new Pass(VOL_FS, { tDepthHalf: { value: null }, uTanHalf: { value: new THREE.Vector2() }, uCamWorld: { value: new THREE.Matrix4() },
      uLPos: { value: new THREE.Vector3() }, uLDir: { value: new THREE.Vector3() }, uLCol: { value: new THREE.Vector3() }, uCosO: { value: 0.8 }, uCosI: { value: 0.9 },
      uRange: { value: 14 }, uDecay: { value: 1.6 }, uSigma: { value: TUNE.volSigma }, uDust: { value: TUNE.volDust }, uTime: { value: 0 }, uAmb: { value: TUNE.volAmb }, uOn: { value: 1 } }, { VOL_STEPS: 20 });
    this.comp = new Pass(COMP_FS, { tColor: { value: null }, tDepth: { value: null }, tDepthHalf: { value: null }, tAO: { value: null }, tVol: { value: null }, uHalfRes: { value: new THREE.Vector2() },
      uNear: { value: 0.05 }, uFar: { value: 80 }, uAoOn: { value: 1 }, uVolOn: { value: 1 }, uAoStrength: { value: TUNE.aoStrength }, uVolK: { value: 1 }, uExposure: { value: TUNE.exposure } });
    this.down = new Pass(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.up = new Pass(UP_FS, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: TUNE.bloomMix } });
    this.grade = new Pass(GRADE_FS, { tScene: { value: null }, tBloom: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uBloom: { value: TUNE.bloom }, uCA: { value: TUNE.ca }, uVignette: { value: TUNE.vignette },
      uExposure: { value: TUNE.exposure }, uSaturation: { value: TUNE.saturation }, uDamage: { value: 0 }, uLowHealth: { value: 0 }, uGradeOn: { value: 1 }, uBloomOn: { value: 1 } });
    this.final = new Pass(FINAL_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uGrain: { value: TUNE.grain }, uSharpen: { value: TUNE.sharpen }, uFxaa: { value: 1 } });
    this.size = new THREE.Vector2(); this.w = 0; this.h = 0;
    this.state = { damage: 0, lowHealth: 0, time: 0 };
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.dispose(true);
    this.w = w; this.h = h;
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.scene = rt(w, h, THREE.HalfFloatType, true);
    this.zh = rt(hw, hh, THREE.FloatType); this.zh.texture.minFilter = this.zh.texture.magFilter = THREE.NearestFilter;
    this.aoA = rt(hw, hh, THREE.UnsignedByteType); this.aoB = rt(hw, hh, THREE.UnsignedByteType);
    this.volA = rt(hw, hh); this.volB = rt(hw, hh);
    this.compT = rt(w, h);
    this.mips = []; let mw = w, mh = h;
    for (let i = 0; i < 5; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); this.mips.push(rt(mw, mh)); }
    this.ups = this.mips.slice(0, 4).map((m) => rt(m.width, m.height));
    this.ldr = rt(w, h, THREE.UnsignedByteType);
  }

  /** Render scene through the chain to the screen. torch: the camera's SpotLight (in camera space). */
  render(scene, camera, torch, dt) {
    const r = this.r, on = this.on, S = this.state;
    r.getDrawingBufferSize(this.size);
    this.resize(this.size.x, this.size.y);
    S.time += dt || 0;
    const w = this.w, h = this.h, hw = this.zh.width, hh = this.zh.height;
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanX = tanY * camera.aspect;
    r.setRenderTarget(this.scene); r.render(scene, camera);
    // half depth
    const D = this.depthHalf.u; D.tDepth.value = this.scene.depthTexture; D.uNear.value = camera.near; D.uFar.value = camera.far; this.depthHalf.run(r, this.zh);
    if (on.ao) {
      const A = this.ao.u; A.tDepthHalf.value = this.zh.texture; A.uTanHalf.value.set(tanX, tanY); A.uTexel.value.set(1 / hw, 1 / hh); A.uAspect.value = camera.aspect; this.ao.run(r, this.aoA);
      this.blur(this.blurAO, this.aoA, this.aoB, hw, hh);
    }
    if (on.vol) {
      const V = this.vol.u; V.tDepthHalf.value = this.zh.texture; V.uTanHalf.value.set(tanX, tanY); V.uCamWorld.value.copy(camera.matrixWorld); V.uTime.value = S.time;
      if (torch) {
        V.uLPos.value.copy(torch.position); V.uLDir.value.copy(torch.target.position).sub(torch.position).normalize();
        V.uCosO.value = Math.cos(torch.angle); V.uCosI.value = Math.cos(torch.angle * (1 - torch.penumbra));
        V.uRange.value = torch.distance || 14; V.uDecay.value = torch.decay;
        const k = torch.intensity * TUNE.volStrength * (torch.visible ? 1 : 0); V.uLCol.value.set(torch.color.r * k, torch.color.g * k, torch.color.b * k);
      }
      this.vol.run(r, this.volA);
      this.blur(this.blurVol, this.volA, this.volB, hw, hh);
    }
    const C = this.comp.u;
    Object.assign(C.tColor, { value: this.scene.texture }); C.tDepth.value = this.scene.depthTexture; C.tDepthHalf.value = this.zh.texture; C.tAO.value = this.aoA.texture; C.tVol.value = this.volA.texture;
    C.uHalfRes.value.set(hw, hh); C.uNear.value = camera.near; C.uFar.value = camera.far; C.uAoOn.value = on.ao ? 1 : 0; C.uVolOn.value = on.vol ? 1 : 0;
    this.comp.run(r, this.compT);
    if (on.bloom) {
      let src = this.compT;
      this.mips.forEach((m, i) => { const U = this.down.u; U.tSrc.value = src.texture; U.uTexel.value.set(1 / src.width, 1 / src.height); U.uFirst.value = i === 0 ? 1 : 0; this.down.run(r, m); src = m; });
      let low = this.mips[4];
      for (let i = 3; i >= 0; i--) { const U = this.up.u; U.tLow.value = low.texture; U.tHigh.value = this.mips[i].texture; U.uTexel.value.set(1 / low.width, 1 / low.height); this.up.run(r, this.ups[i]); low = this.ups[i]; }
    }
    const Gu = this.grade.u;
    Gu.tScene.value = this.compT.texture; Gu.tBloom.value = this.ups[0].texture; Gu.uTime.value = S.time; Gu.uAspect.value = camera.aspect;
    Gu.uDamage.value = S.damage; Gu.uLowHealth.value = S.lowHealth; Gu.uGradeOn.value = on.grade ? 1 : 0; Gu.uBloomOn.value = on.bloom ? 1 : 0;
    this.grade.run(r, this.ldr);
    const F = this.final.u; F.tSrc.value = this.ldr.texture; F.uTexel.value.set(1 / w, 1 / h); F.uTime.value = S.time; F.uFxaa.value = on.fxaa ? 1 : 0;
    F.uGrain.value = on.grade ? TUNE.grain : 0; F.uSharpen.value = on.grade ? TUNE.sharpen : 0;
    this.final.run(r, null);
  }

  blur(pass, a, b, w, h) {
    const U = pass.u; U.tDepthHalf.value = this.zh.texture;
    U.tSrc.value = a.texture; U.uDir.value.set(1 / w, 0); pass.run(this.r, b);
    U.tSrc.value = b.texture; U.uDir.value.set(0, 1 / h); pass.run(this.r, a);
  }

  dispose(targetsOnly) {
    for (const k of ['scene', 'zh', 'aoA', 'aoB', 'volA', 'volB', 'compT', 'ldr']) { this[k]?.dispose(); this[k] = null; }
    for (const m of [...(this.mips || []), ...(this.ups || [])]) m.dispose();
    this.mips = []; this.ups = [];
    if (!targetsOnly) for (const p of [this.depthHalf, this.ao, this.blurAO, this.blurVol, this.vol, this.comp, this.down, this.up, this.grade, this.final]) p.dispose();
  }
}
