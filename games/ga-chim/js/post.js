// Post chain ported from Saltline (render.md §4): the gun is drawn into the same HDR target with
// gl.depthRange(0, 0.05), so every pass treats depth < 0.05 as "no world".
// scene -> depthhalf -> AO(+2 blur) -> SSR -> volumetric fog from the sun shadow map(+2 blur) -> composite
// -> bloom 6 down / 5 up -> streak -> eye adaptation (1x1 ping-pong) -> grade (flare, exposure, ACES/AgX, split tone)
// -> final (FXAA-lite, sharpen, grain, dither).
import * as THREE from '../vendor/three.module.min.js';
import { NOISE } from './glsl.js';
import { SUN_DIR, SUN_COLOR, PALETTE } from './sky.js';

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

export const TUNE = {
  volSunScale: 0.85, volAmbient: 0.2, volSigma: 0.0034, volMaxDist: 170, volFarHaze: 0.42, volInteriorDust: 4,
  aoRadius: 0.9, aoIntensity: 1.6, aoStrength: 0.95,
  bloom: 0.065, bloomMix: 0.62, dirt: 0.1, streak: 0.03, streakThreshold: 2.2, flare: 0.16,
  key: 0.12, minExposure: 0.6, maxExposure: 2, adaptTau: 1.5,
  agxMix: 0.25, ca: 0.0013, vignette: 0.3, grain: 0.02, sharpen: 0.3, lookPower: 1.18, lookSat: 1.22,
};

class Pass {
  constructor(frag, uniforms, defines) {
    this.m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    this.mesh = new THREE.Mesh(tri, this.m); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.u = this.m.uniforms;
  }
  run(r, target) { r.setRenderTarget(target || null); r.render(this.scene, orthoCam); }
}

const COMMON = /* glsl */`
varying vec2 vUv;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
const EXPOSURE = /* glsl */`
uniform sampler2D tAdapt; uniform float uExposure, uKey, uMinE, uMaxE, uAuto;
float slExposure(){ float a = texture2D(tAdapt, vec2(0.5)).r; return uExposure * mix(1.0, clamp(pow(uKey / max(a, 1e-4), 0.85), uMinE, uMaxE), uAuto); }
`;
const HORIZON = /* glsl */`
uniform vec3 uSunDir, uHor, uHorAway;
vec3 horizonColor(vec3 d){
  float ts = clamp(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz)) * .5 + .5, 0., 1.);
  vec3 c = mix(uHorAway, uHorAway * 1.25 + vec3(.05, .03, .02), smoothstep(.2, .75, ts));
  c = mix(c, uHor * vec3(1.9, 1.55, 1.2), pow(ts, 6.));
  c = mix(c, vec3(1., .6, .24) * 3.4, pow(ts, 34.));
  return c; }
`;

const DEPTHHALF_FS = /* glsl */`${COMMON}
uniform sampler2D tDepth; uniform float uNear, uFar;
void main(){
  ivec2 p = min(ivec2(gl_FragCoord.xy) * 2, textureSize(tDepth, 0) - 1);
  float d = texelFetch(tDepth, p, 0).r;
  float z = d < 0.05 ? 0.01 : (uNear * uFar) / (uFar - d * (uFar - uNear));
  gl_FragColor = vec4(z, 0.0, 0.0, 1.0);
}`;

const AO_FS = /* glsl */`${COMMON}
uniform sampler2D tDepthHalf; uniform vec2 uTanHalf, uTexel; uniform float uRadius, uIntensity, uAspect;
vec3 vpos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z); }
void main(){
  float z0 = texture2D(tDepthHalf, vUv).r;
  if (z0 < 0.05 || z0 > 140.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = vpos(vUv, z0);
  vec2 ox = vec2(uTexel.x, 0.0), oy = vec2(0.0, uTexel.y);
  float zl = texture2D(tDepthHalf, vUv - ox).r, zr = texture2D(tDepthHalf, vUv + ox).r;
  float zd = texture2D(tDepthHalf, vUv - oy).r, zu = texture2D(tDepthHalf, vUv + oy).r;
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
    float z2 = texture2D(tDepthHalf, uv2).r;
    vec3 v = vpos(uv2, z2) - P;
    float vv = dot(v, v), vn = dot(v, n);
    float f = max(R2 - vv, 0.0);
    sum += f * f * f * max((vn - (0.015 + 0.004 * z0)) / (vv + 0.004), 0.0);
  }
  float ao = max(0.0, 1.0 - uIntensity * sum * 5.0 / (R2 * R2 * R2 * float(AO_TAPS)));
  ao = mix(ao, 1.0, smoothstep(70.0, 140.0, z0));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const BLUR_FS = /* glsl */`${COMMON}
uniform sampler2D tSrc, tDepthHalf; uniform vec2 uDir;
void main(){
  float zc = min(texture2D(tDepthHalf, vUv).r, 300.0);
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = min(texture2D(tDepthHalf, uv).r, 300.0);
    float w = (1.0 - abs(float(i)) * 0.22) * max(0.0, 1.0 - abs(z - zc) / (BLUR_TOL * zc + 0.02));
    acc += texture2D(tSrc, uv) * w; ws += w;
  }
  gl_FragColor = ws > 1e-4 ? acc / ws : texture2D(tSrc, vUv);
}`;

// Screen-space reflection for puddles and wet ground (Saltline uses a planar mirror; the reflectivity
// mask comes from the scene alpha written by mats.js).
const SSR_FS = /* glsl */`${COMMON}
uniform sampler2D tColor, tDepth; uniform mat4 uProjInv, uProj, uViewMat; uniform float uTime; uniform int uSteps;
vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 c = vec4(uv*2.-1., d*2.-1., 1.); vec4 v = uProjInv * c; return v.xyz / v.w; }
void main(){
  float mask = texture2D(tColor, vUv).a;
  float d0 = texture2D(tDepth, vUv).x;
  if (mask < 0.02 || d0 >= 0.99999 || d0 < 0.05) { gl_FragColor = vec4(0.); return; }
  vec3 P = viewPos(vUv);
  vec3 up = normalize((uViewMat * vec4(0., 1., 0., 0.)).xyz);
  vec2 j = (vec2(hash12(gl_FragCoord.xy + fract(uTime) * 91.), hash12(gl_FragCoord.xy * 1.7 + fract(uTime * 1.3) * 57.)) - 0.5) * 0.02;
  vec3 N = normalize(up + vec3(j.x, 0., j.y));
  vec3 V = normalize(P);
  vec3 R = normalize(reflect(V, N));
  if (R.z > 0.2) { gl_FragColor = vec4(0.); return; }
  float stepLen = 0.18 + 0.02 * -P.z;
  vec3 pos = P + N * 0.05 + R * stepLen * ign(gl_FragCoord.xy);
  vec2 hitUV = vec2(-1.); float hit = 0.;
  for (int i = 0; i < 48; i++) {
    if (i >= uSteps) break;
    pos += R * stepLen; stepLen *= 1.08;
    vec4 pr = uProj * vec4(pos, 1.0); vec2 uv = pr.xy / pr.w * 0.5 + 0.5;
    if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) break;
    if (texture2D(tDepth, uv).x < 0.05) break;
    float sz = viewPos(uv).z; float dz = sz - pos.z;
    if (dz > 0.0 && dz < stepLen * 2.5 + 0.2) {
      vec3 a = pos - R * stepLen, b = pos;
      for (int k = 0; k < 5; k++) {
        vec3 m = (a + b) * 0.5; vec4 pm = uProj * vec4(m, 1.0); vec2 um = pm.xy / pm.w * 0.5 + 0.5;
        if (viewPos(um).z > m.z) b = m; else a = m;
      }
      vec4 pb = uProj * vec4(b, 1.0); hitUV = pb.xy / pb.w * 0.5 + 0.5; hit = 1.0; break;
    }
  }
  if (hit < 0.5) { gl_FragColor = vec4(0.); return; }
  vec2 e = smoothstep(0.0, 0.12, hitUV) * smoothstep(1.0, 0.88, hitUV);
  gl_FragColor = vec4(texture2D(tColor, hitUV).rgb, e.x * e.y * mask);
}`;

const VOL_FS = /* glsl */`${COMMON}
uniform sampler2D tDepthHalf, tShadow;
uniform mat4 uShadowMatrix, uCamWorld;
uniform vec3 uCamPos, uSunRad, uAmb;
uniform vec2 uTanHalf;
uniform float uHasShadow, uMaxDist, uSigma, uFarZ, uFarHaze, uBoxDust;
uniform vec3 uBoxMin, uBoxMax;
${HORIZON}
float shape(float h){ return 0.30 + 0.70 * exp(-max(h, 0.0) / 5.5); }
float hg(float mu, float g){ float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5)); }
float sunVis(vec3 p){
  vec4 sc = uShadowMatrix * vec4(p, 1.0);
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0 || sc.z < 0.0) return 1.0;
  float d = dot(texture2D(tShadow, sc.xy), vec4(0.99609375, 0.99609375 / 256.0, 0.99609375 / 65536.0, 1.0 / 16777216.0));
  return step(sc.z - 0.0006, d);
}
void main(){
  float z = texture2D(tDepthHalf, vUv).r;
  if (z < 0.05) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 vd = vec3((vUv * 2.0 - 1.0) * uTanHalf, -1.0);
  float rl = length(vd);
  vec3 rd = normalize(mat3(uCamWorld) * vd);
  float dist = z * rl;
  bool isSky = z > uFarZ * 0.97;
  float maxD = min(dist, isSky ? uMaxDist * 0.55 : uMaxDist);
  float mu = dot(rd, uSunDir);
  float ph = min(hg(mu, 0.78) * 0.55 + hg(mu, 0.25) * 0.45, 1.15);
  float j = ign(gl_FragCoord.xy);
  vec3 acc = vec3(0.0); float T = 1.0; float tPrev = 0.0;
  for (int i = 0; i < VOL_STEPS; i++) {
    float f = (float(i) + 1.0) / float(VOL_STEPS);
    float t1 = maxD * f * (0.35 + 0.65 * f);
    float ds = t1 - tPrev;
    vec3 p = uCamPos + rd * (tPrev + ds * j);
    float sh = uHasShadow > 0.5 ? sunVis(p) : 1.0;
    vec3 bq = step(uBoxMin, p) * step(p, uBoxMax); float inb = bq.x * bq.y * bq.z;
    float ext = uSigma * shape(p.y) * (1.0 + uBoxDust * inb);
    float Ti = exp(-ext * ds);
    float nearW = mix(2.3, 0.55, smoothstep(4.0, 85.0, tPrev + ds * j));
    vec3 src = uSunRad * (ph * sh * mix(nearW, 1.6, inb)) + uAmb * (0.40 + 0.60 * sh) * mix(1.0, 0.22, inb);
    acc += T * src * (1.0 - Ti);
    T *= Ti; tPrev = t1;
  }
  if (!isSky && dist > uMaxDist) {
    float h1 = uCamPos.y + rd.y * uMaxDist, h2 = uCamPos.y + rd.y * dist;
    float tau = uSigma * uFarHaze * (dist - uMaxDist) * 0.5 * (shape(h1) + shape(h2));
    float Tf = exp(-tau);
    vec3 hc = horizonColor(rd) * 0.50 + uAmb * 0.6;
    acc += T * hc * (1.0 - Tf);
    T *= Tf;
  }
  gl_FragColor = vec4(acc, T);
}`;

const COMP_FS = /* glsl */`${COMMON}
uniform sampler2D tColor, tDepth, tDepthHalf, tAO, tVol, tSSR;
uniform vec2 uHalfRes; uniform float uNear, uFar, uAoOn, uVolOn, uSsrOn, uAoStrength, uFlash;
${EXPOSURE}
void main(){
  vec3 col = max(texture2D(tColor, vUv).rgb, vec3(0.0));
  float d = texture2D(tDepth, vUv).r;
  if (d >= 0.05) {
    float z = (uNear * uFar) / (uFar - d * (uFar - uNear));
    vec2 hp = vUv * uHalfRes - 0.5; vec2 f = fract(hp); vec2 base = (floor(hp) + 0.5) / uHalfRes; vec2 tx = 1.0 / uHalfRes;
    float ao = 0.0; vec4 vol = vec4(0.0); float ws = 0.0;
    float zc = min(z, 300.0);
    for (int k = 0; k < 4; k++) {
      vec2 o = vec2(float(k & 1), float(k >> 1));
      vec2 uv = base + o * tx;
      float zh = min(texture2D(tDepthHalf, uv).r, 300.0);
      float w = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
      w *= 1.0 / (0.015 + abs(zh - zc) / zc);
      w = max(w, 1e-5);
      ao += texture2D(tAO, uv).r * w; vol += texture2D(tVol, uv) * w; ws += w;
    }
    ao /= ws; vol /= ws;
    if (uSsrOn > 0.5 && d < 0.99999) {
      vec4 r = texture2D(tSSR, vUv);
      col = mix(col, r.rgb, clamp(r.a, 0.0, 1.0) * 0.8);
    }
    if (uAoOn > 0.5 && d < 0.99999) {
      float lit = smoothstep(0.16, 0.85, luma(col) * slExposure());
      float a = mix(1.0, ao, uAoStrength * (1.0 - 0.8 * lit));
      col *= mix(vec3(a), vec3(1.0), vec3(0.0, 0.03, 0.07));
    }
    if (uVolOn > 0.5) col = col * vol.a + vol.rgb * (1.0 + uFlash * 1.5);
  }
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

const STREAK_FS = /* glsl */`${COMMON}
uniform sampler2D tSrc; uniform vec2 uDir; uniform float uThreshold;
${EXPOSURE}
void main(){
  float thr = uThreshold / max(slExposure(), 0.2);
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = -7; i <= 7; i++) {
    float x = float(i); float w = exp(-x * x / 18.0);
    vec3 c = max(texture2D(tSrc, vUv + uDir * x).rgb - vec3(thr), vec3(0.0));
    acc += c * w; ws += w;
  }
  gl_FragColor = vec4(acc / ws, 1.0);
}`;

const ADAPT_FS = /* glsl */`${COMMON}
uniform sampler2D tPrev, tLum, tDepth; uniform vec2 uSunUv; uniform float uSunOn, uRate, uVisRate, uAspect;
void main(){
  float ls = 0.0, ws = 0.0;
  for (int y = 0; y < 5; y++) for (int x = 0; x < 7; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(7.0, 5.0);
    float w = 1.0 - 0.75 * smoothstep(0.1, 0.55, length(uv - 0.5));
    ls += log(max(luma(texture2D(tLum, uv).rgb), 1e-4)) * w; ws += w;
  }
  float avg = clamp(exp(ls / ws), 0.002, 40.0);
  float vis = 0.0;
  for (int i = 0; i < 12; i++) {
    float r = sqrt((float(i) + 0.5) / 12.0) * 0.011; float th = float(i) * 2.39996323;
    vec2 uv = uSunUv + vec2(cos(th) / uAspect, sin(th)) * r;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) vis += 1.0;
    else vis += step(0.99999, texture2D(tDepth, uv).r);
  }
  vis = vis / 12.0 * uSunOn;
  vec4 prev = texture2D(tPrev, vec2(0.5));
  float a = mix(prev.r, avg, uRate);
  if (!(a > 0.0) || a > 1e4) a = avg;
  float v = mix(prev.g, vis, uVisRate);
  if (!(v >= 0.0)) v = vis;
  gl_FragColor = vec4(a, v, 0.0, 1.0);
}`;

const DIRT_FS = /* glsl */`${COMMON}
${NOISE}
uniform float uAspect;
void main(){
  vec2 p = vUv * vec2(uAspect, 1.0);
  float acc = 0.0;
  for (int i = 0; i < 70; i++) {
    float fi = float(i);
    vec2 c = vec2(hash12(vec2(fi, 1.7)), hash12(vec2(fi, 9.2))) * vec2(uAspect, 1.0);
    float sz = mix(0.012, 0.085, pow(hash12(vec2(fi, 4.4)), 3.0));
    float r = length(p - c) / sz;
    float disc = smoothstep(1.0, 0.86, r) * (0.35 + 0.65 * smoothstep(0.35, 0.98, r));
    acc += disc * mix(0.15, 0.7, hash12(vec2(fi, 6.1)));
  }
  float smudge = fbm2(vUv * vec2(5.0, 9.0) + 3.0) * fbm2(vUv * 2.3 + 9.0);
  float streaks = pow(vn(vec2(vUv.x * 90.0, vUv.y * 2.0)), 4.0) * 0.25;
  float v = acc * 0.55 + smudge * 0.9 + streaks;
  v *= 0.45 + 0.9 * smoothstep(0.15, 0.75, length(vUv - 0.5));
  gl_FragColor = vec4(vec3(v) * vec3(1.0, 0.96, 0.9), 1.0);
}`;

const GRADE_FS = /* glsl */`${COMMON}
uniform sampler2D tScene, tBloom, tBlur, tStreak, tDirt;
${EXPOSURE}
uniform vec3 uSunCol; uniform vec2 uSunUv;
uniform float uTime, uAspect, uBloom, uDirt, uStreak, uFlare, uCA, uVignette;
uniform float uDamage, uLowHealth, uAds, uFlash, uFade, uSaturation, uSunOn, uAgxMix;
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
  color = pow(max(color, vec3(0.0)), vec3(LOOK_POWER));
  color = l + (color - l) * LOOK_SAT;
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
vec3 flare(vec2 uv, vec2 sun, float vis){
  vec2 asp = vec2(uAspect, 1.0);
  vec2 p = (uv - 0.5) * asp, s = (sun - 0.5) * asp;
  vec2 dv = p - s; float r = length(dv);
  vec3 c = vec3(0.0);
  float ang = atan(dv.y, dv.x);
  float spikes = pow(abs(cos(ang * 3.0 + 0.4)), 24.0) + 0.6 * pow(abs(cos(ang * 4.0 - 1.1)), 40.0);
  c += uSunCol * (0.020 / (r * r * 9.0 + 0.010) + 0.10 * exp(-r * 3.2));
  c += uSunCol * spikes * 0.30 * exp(-r * 5.5);
  vec3 g = vec3(0.0);
  float k0 = length(p + s * 0.38);  g += vec3(0.30, 0.75, 0.55) * smoothstep(0.085, 0.06, k0) * 0.050;
  float k1 = length(p + s * 0.82);  g += vec3(0.85, 0.45, 0.25) * smoothstep(0.045, 0.030, k1) * 0.075;
  float k2 = length(p + s * 1.35);  g += vec3(0.35, 0.50, 0.95) * smoothstep(0.17, 0.12, k2) * (0.4 + 0.6 * smoothstep(0.05, 0.16, k2)) * 0.040;
  float k3 = length(p - s * 0.45);  g += vec3(0.80, 0.70, 0.35) * smoothstep(0.030, 0.018, k3) * 0.060;
  float hr = length(p + s * 0.15);
  g += vec3(0.45, 0.55, 0.85) * exp(-pow((hr - 0.52) * 16.0, 2.0)) * 0.035 * smoothstep(0.1, 0.5, length(s));
  c += g * uSunCol * 2.4;
  return c * vis;
}
void main(){
  vec2 c = vUv - 0.5;
  float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) / (0.25 * (uAspect * uAspect + 1.0));
  vec4 ad = texture2D(tAdapt, vec2(0.5));
  vec2 off = c * r2 * (uCA + uDamage * 0.006);
  vec3 col = vec3(texture2D(tScene, vUv + off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - off).b);
  col = mix(col, texture2D(tBlur, vUv).rgb, uAds * 0.75 * smoothstep(0.22, 0.85, r2));
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  vec3 dirt = texture2D(tDirt, vUv).rgb;
  col = mix(col, bloom, uBloom);
  col += bloom * dirt * uDirt;
  col += texture2D(tStreak, vUv).rgb * vec3(0.45, 0.62, 1.0) * uStreak;
  float vis = ad.g * uSunOn;
  if (vis > 0.002) { vec3 fl = flare(vUv, uSunUv, vis) * uFlare; col += fl * (1.0 + dirt * 1.5); }
  col *= slExposure();
  col += vec3(0.55, 0.65, 0.9) * uFlash * 0.25;
  col = mix(slAces(col), slAgx(col), uAgxMix);
  float l = luma(col);
  col *= mix(vec3(0.80, 1.01, 1.13), vec3(1.07, 1.0, 0.90), smoothstep(0.03, 0.55, l));
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
  col = col * 0.988 + vec3(0.006, 0.0085, 0.011);
  float sat = uSaturation * (1.0 - 0.65 * uLowHealth) * (1.0 - 0.5 * uDamage);
  l = luma(col);
  col = mix(vec3(l), col, sat);
  float vig = uVignette + uLowHealth * 0.55 + uAds * 0.22;
  float vr = smoothstep(0.15 - uAds * 0.08, 1.05, r2);
  col *= 1.0 - vig * vr * vr * (3.0 - 2.0 * vr);
  float edge = smoothstep(0.18, 1.0, r2);
  col = mix(col, vec3(0.55, 0.02, 0.01) * (0.35 + l), clamp(uDamage * edge * 0.85 + uLowHealth * edge * edge * 0.25 * (0.75 + 0.25 * sin(uTime * 5.0)), 0.0, 1.0));
  col *= 1.0 - uFade;
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

const expU = () => ({ tAdapt: { value: null }, uExposure: { value: 1 }, uKey: { value: TUNE.key }, uMinE: { value: TUNE.minExposure }, uMaxE: { value: TUNE.maxExposure }, uAuto: { value: 1 } });

export class Post {
  constructor(G) {
    this.G = G;
    const q = G.quality;
    const horizonU = () => ({ uSunDir: { value: SUN_DIR }, uHor: { value: PALETTE.hor }, uHorAway: { value: PALETTE.horAway } });
    this.depthHalf = new Pass(DEPTHHALF_FS, { tDepth: { value: null }, uNear: { value: 0.06 }, uFar: { value: 900 } });
    this.ao = new Pass(AO_FS, { tDepthHalf: { value: null }, uTanHalf: { value: new THREE.Vector2() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: TUNE.aoRadius }, uIntensity: { value: TUNE.aoIntensity }, uAspect: { value: 1 } }, { AO_TAPS: q.aoTaps || 12 });
    this.blurAO = new Pass(BLUR_FS, { tSrc: { value: null }, tDepthHalf: { value: null }, uDir: { value: new THREE.Vector2() } }, { BLUR_TOL: '0.04' });
    this.blurVol = new Pass(BLUR_FS, { tSrc: { value: null }, tDepthHalf: { value: null }, uDir: { value: new THREE.Vector2() } }, { BLUR_TOL: '0.30' });
    this.ssr = new Pass(SSR_FS, { tColor: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uViewMat: { value: new THREE.Matrix4() }, uTime: { value: 0 }, uSteps: { value: 32 } });
    this.vol = new Pass(VOL_FS, Object.assign(horizonU(), {
      tDepthHalf: { value: null }, tShadow: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uSunRad: { value: new THREE.Vector3() }, uAmb: { value: new THREE.Vector3() }, uTanHalf: { value: new THREE.Vector2() },
      uHasShadow: { value: 0 }, uMaxDist: { value: TUNE.volMaxDist }, uSigma: { value: TUNE.volSigma }, uFarZ: { value: 900 }, uFarHaze: { value: TUNE.volFarHaze }, uBoxDust: { value: 0 },
      uBoxMin: { value: new THREE.Vector3(1e5, 1e5, 1e5) }, uBoxMax: { value: new THREE.Vector3(-1e5, -1e5, -1e5) },
    }), { VOL_STEPS: Math.max(6, q.volSteps || 16) });
    this.comp = new Pass(COMP_FS, Object.assign(expU(), {
      tColor: { value: null }, tDepth: { value: null }, tDepthHalf: { value: null }, tAO: { value: null }, tVol: { value: null }, tSSR: { value: null },
      uHalfRes: { value: new THREE.Vector2() }, uNear: { value: 0.06 }, uFar: { value: 900 }, uAoOn: { value: 1 }, uVolOn: { value: 1 }, uSsrOn: { value: 1 }, uAoStrength: { value: TUNE.aoStrength }, uFlash: { value: 0 },
    }));
    this.down = new Pass(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.up = new Pass(UP_FS, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: TUNE.bloomMix } });
    this.streak = new Pass(STREAK_FS, Object.assign(expU(), { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uThreshold: { value: TUNE.streakThreshold } }));
    this.adapt = new Pass(ADAPT_FS, { tPrev: { value: null }, tLum: { value: null }, tDepth: { value: null }, uSunUv: { value: new THREE.Vector2() }, uSunOn: { value: 0 }, uRate: { value: 1 }, uVisRate: { value: 1 }, uAspect: { value: 1 } });
    this.dirtPass = new Pass(DIRT_FS, { uAspect: { value: 16 / 9 } });
    this.grade = new Pass(GRADE_FS, Object.assign(expU(), {
      tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tStreak: { value: null }, tDirt: { value: null },
      uSunCol: { value: SUN_COLOR }, uSunUv: { value: new THREE.Vector2() },
      uTime: { value: 0 }, uAspect: { value: 1 }, uBloom: { value: TUNE.bloom }, uDirt: { value: TUNE.dirt }, uStreak: { value: TUNE.streak }, uFlare: { value: TUNE.flare }, uCA: { value: TUNE.ca }, uVignette: { value: TUNE.vignette },
      uDamage: { value: 0 }, uLowHealth: { value: 0 }, uAds: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uSaturation: { value: 1 }, uSunOn: { value: 0 }, uAgxMix: { value: TUNE.agxMix },
    }), { LOOK_POWER: TUNE.lookPower.toFixed(3), LOOK_SAT: TUNE.lookSat.toFixed(3) });
    this.final = new Pass(FINAL_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uGrain: { value: TUNE.grain }, uSharpen: { value: TUNE.sharpen }, uFxaa: { value: 1 } });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    this.clearVol = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.clearVol.needsUpdate = true;
    this.adaptRT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.adaptFrames = 0; this.adaptIdx = 0;
    this.dirt = new THREE.WebGLRenderTarget(512, 288, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.dirtPass.run(G.renderer, this.dirt);
    this.boxDust = 0;
    this.resize();
  }
  rt(w, h, opts) {
    return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), Object.assign({ type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }, opts || {}));
  }
  setInteriorBox(min, max, dust) { this.vol.u.uBoxMin.value.copy(min); this.vol.u.uBoxMax.value.copy(max); this.vol.u.uBoxDust.value = dust; }
  resize() {
    const r = this.G.renderer; const q = this.G.quality;
    const s = new THREE.Vector2(); r.getDrawingBufferSize(s);
    this.w = s.x; this.h = s.y;
    const old = [this.sceneRT, this.compRT, this.ldrRT, this.dhRT, this.aoA, this.aoB, this.volA, this.volB, this.ssrRT, this.streakA, this.streakB, ...(this.downs || []), ...(this.ups || [])];
    old.forEach((t) => t && t.dispose());
    this.sceneRT = this.rt(this.w, this.h, { depthBuffer: true, samples: q.msaa });
    this.sceneRT.depthTexture = new THREE.DepthTexture(this.w, this.h);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.compRT = this.rt(this.w, this.h);
    this.ldrRT = this.rt(this.w, this.h, { type: THREE.UnsignedByteType });
    const hw = Math.ceil(this.w / 2), hh = Math.ceil(this.h / 2);
    this.hw = hw; this.hh = hh;
    const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.dhRT = this.rt(hw, hh, nearest);
    this.aoA = this.rt(hw, hh, Object.assign({ type: THREE.UnsignedByteType }, nearest)); this.aoB = this.rt(hw, hh, Object.assign({ type: THREE.UnsignedByteType }, nearest));
    this.volA = this.rt(hw, hh, nearest); this.volB = this.rt(hw, hh, nearest);
    this.ssrRT = this.rt(hw, hh);
    this.downs = []; this.ups = [];
    let w = hw, h = hh;
    for (let i = 0; i < 6; i++) { this.downs.push(this.rt(w, h)); if (i < 5) this.ups.push(this.rt(w, h)); w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); }
    this.streakA = this.rt(this.downs[2].width, this.downs[2].height); this.streakB = this.rt(this.downs[2].width, this.downs[2].height);
  }
  bindExposure(u) { u.tAdapt.value = this.adaptRT[this.adaptIdx].texture; }
  render(drawScene, cam, t, dt) {
    const r = this.G.renderer; const q = this.G.quality; const fx = this.G.postFx || {}; const G = this.G;
    dt = dt || 1 / 60;
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 0); r.clear(true, true, true);
    drawScene();
    const color = this.sceneRT.texture, depth = this.sceneRT.depthTexture;
    const tanHalfY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), tanHalfX = tanHalfY * cam.aspect;
    // linear half-res depth
    const dh = this.depthHalf.u; dh.tDepth.value = depth; dh.uNear.value = cam.near; dh.uFar.value = cam.far;
    this.depthHalf.run(r, this.dhRT);
    const dhTex = this.dhRT.texture;
    // AO
    let aoTex = this.white;
    if (q.ao) {
      const a = this.ao.u; a.tDepthHalf.value = dhTex; a.uTanHalf.value.set(tanHalfX, tanHalfY); a.uTexel.value.set(1 / this.hw, 1 / this.hh); a.uAspect.value = cam.aspect;
      this.ao.run(r, this.aoA);
      const b = this.blurAO.u; b.tDepthHalf.value = dhTex;
      b.tSrc.value = this.aoA.texture; b.uDir.value.set(1 / this.hw, 0); this.blurAO.run(r, this.aoB);
      b.tSrc.value = this.aoB.texture; b.uDir.value.set(0, 1 / this.hh); this.blurAO.run(r, this.aoA);
      aoTex = this.aoA.texture;
    }
    // SSR
    let ssrTex = this.black;
    if (q.ssr) {
      const s = this.ssr.u; s.tColor.value = color; s.tDepth.value = depth; s.uProjInv.value.copy(cam.projectionMatrixInverse); s.uProj.value.copy(cam.projectionMatrix);
      s.uViewMat.value.copy(cam.matrixWorldInverse); s.uTime.value = t; s.uSteps.value = q.ssrSteps;
      this.ssr.run(r, this.ssrRT); ssrTex = this.ssrRT.texture;
    }
    // volumetric fog lit by the sun shadow map
    let volTex = this.clearVol; const volOn = !G.params.nofog && (q.volSteps || 16) > 0;
    if (volOn) {
      const sun = G.lights && G.lights.sun; const v = this.vol.u;
      v.tDepthHalf.value = dhTex; v.uCamWorld.value.copy(cam.matrixWorld); v.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      v.uTanHalf.value.set(tanHalfX, tanHalfY); v.uFarZ.value = cam.far;
      const has = sun && sun.shadow && sun.shadow.map;
      v.uHasShadow.value = has ? 1 : 0;
      if (has) { v.tShadow.value = sun.shadow.map.texture; v.uShadowMatrix.value.copy(sun.shadow.matrix); }
      const sunI = sun ? sun.intensity : 9;
      v.uSunRad.value.set(SUN_COLOR.r, SUN_COLOR.g, SUN_COLOR.b).multiplyScalar(sunI * TUNE.volSunScale);
      const thunder = fx.flash || 0;
      v.uAmb.value.set(PALETTE.fog.r, PALETTE.fog.g, PALETTE.fog.b).multiplyScalar(TUNE.volAmbient * (1 + thunder * 1.5));
      this.vol.run(r, this.volA);
      const b = this.blurVol.u; b.tDepthHalf.value = dhTex;
      b.tSrc.value = this.volA.texture; b.uDir.value.set(1 / this.hw, 0); this.blurVol.run(r, this.volB);
      b.tSrc.value = this.volB.texture; b.uDir.value.set(0, 1 / this.hh); this.blurVol.run(r, this.volA);
      volTex = this.volA.texture;
    }
    // composite
    const c = this.comp.u; this.bindExposure(c);
    c.tColor.value = color; c.tDepth.value = depth; c.tDepthHalf.value = dhTex; c.tAO.value = aoTex; c.tVol.value = volTex; c.tSSR.value = ssrTex;
    c.uHalfRes.value.set(this.hw, this.hh); c.uNear.value = cam.near; c.uFar.value = cam.far;
    c.uAoOn.value = q.ao ? 1 : 0; c.uVolOn.value = volOn ? 1 : 0; c.uSsrOn.value = q.ssr ? 1 : 0; c.uFlash.value = fx.flash || 0;
    this.comp.run(r, this.compRT);
    // bloom
    let src = this.compRT.texture, sw = this.w, sh = this.h;
    for (let i = 0; i < this.downs.length; i++) {
      const d = this.down.u; d.tSrc.value = src; d.uTexel.value.set(1 / sw, 1 / sh); d.uFirst.value = i === 0 ? 1 : 0;
      this.down.run(r, this.downs[i]); src = this.downs[i].texture; sw = this.downs[i].width; sh = this.downs[i].height;
    }
    const nb = !!G.params.nobloom;
    for (let i = this.ups.length - 1; i >= 0; i--) {
      const low = i === this.ups.length - 1 ? this.downs[i + 1] : this.ups[i + 1];
      const u = this.up.u; u.tLow.value = low.texture; u.tHigh.value = this.downs[i].texture; u.uTexel.value.set(1 / low.width, 1 / low.height);
      this.up.run(r, this.ups[i]);
    }
    // anamorphic streak
    this.bindExposure(this.streak.u);
    const st = this.streak.u; const s2w = this.downs[2].width;
    st.tSrc.value = this.downs[2].texture; st.uDir.value.set(1.5 / s2w, 0); this.streak.run(r, this.streakA);
    st.tSrc.value = this.streakA.texture; st.uDir.value.set(5 / s2w, 0); st.uThreshold.value = 0; this.streak.run(r, this.streakB);
    st.uThreshold.value = TUNE.streakThreshold;
    // sun screen position and eye adaptation
    const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    const sp = SUN_DIR.clone().multiplyScalar(500).add(cam.position).project(cam);
    const sunOn = camDir.dot(SUN_DIR) > 0.05 && Math.abs(sp.x) < 1.3 && Math.abs(sp.y) < 1.3 && sp.z < 1 ? 1 : 0;
    const sunUv = new THREE.Vector2(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const ad = this.adapt.u; const prev = this.adaptRT[this.adaptIdx], next = this.adaptRT[1 - this.adaptIdx];
    ad.tPrev.value = prev.texture; ad.tLum.value = this.downs[5].texture; ad.tDepth.value = depth; ad.uSunUv.value.copy(sunUv); ad.uSunOn.value = sunOn; ad.uAspect.value = cam.aspect;
    const snap = this.adaptFrames < 2 || G.params.shot;
    ad.uRate.value = snap ? 1 : 1 - Math.exp(-dt / TUNE.adaptTau); ad.uVisRate.value = snap ? 1 : 1 - Math.exp(-dt / 0.12);
    this.adapt.run(r, next); this.adaptIdx = 1 - this.adaptIdx; this.adaptFrames++;
    // grade
    const g = this.grade.u; this.bindExposure(g);
    g.tScene.value = this.compRT.texture; g.tBloom.value = this.ups[0].texture; g.tBlur.value = this.downs[1].texture; g.tStreak.value = this.streakB.texture; g.tDirt.value = this.dirt.texture;
    g.uSunUv.value.copy(sunUv); g.uSunOn.value = sunOn; g.uTime.value = t; g.uAspect.value = cam.aspect;
    g.uBloom.value = nb ? 0 : TUNE.bloom; g.uDirt.value = nb ? 0 : TUNE.dirt; g.uStreak.value = nb ? 0 : TUNE.streak;
    g.uDamage.value = fx.hurt || 0; g.uLowHealth.value = fx.lowHealth || 0; g.uAds.value = fx.ads || 0; g.uFlash.value = fx.flash || 0; g.uFade.value = fx.fade || 0;
    this.grade.run(r, this.ldrRT);
    // final
    const f = this.final.u; f.tSrc.value = this.ldrRT.texture; f.uTexel.value.set(1 / this.w, 1 / this.h); f.uTime.value = t;
    this.final.run(r, null);
  }
}
