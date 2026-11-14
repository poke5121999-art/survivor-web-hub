// Custom post chain (no EffectComposer):
// scene(HDR, MSAA, depth) -> AO(half) -> SSR(half) -> god rays(half) -> composite(fog, AO, SSR, rays)
// -> bloom down/up -> final (exposure, tonemap, grade, vignette, CA, grain, dither, sRGB).
import * as THREE from '../vendor/three.module.min.js';
import { NOISE } from './glsl.js';
import { SUN_DIR } from './sky.js';

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

class Pass {
  constructor(frag, uniforms, defines) {
    this.m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(tri, this.m); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.u = this.m.uniforms;
  }
  run(r, target) { r.setRenderTarget(target || null); r.render(this.scene, orthoCam); }
}

const DEPTH_FN = /* glsl */`
uniform sampler2D tDepth; uniform mat4 uProjInv, uProj; uniform float uNear, uFar;
vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 c = vec4(uv*2.-1., d*2.-1., 1.); vec4 v = uProjInv * c; return v.xyz / v.w; }
float rawDepth(vec2 uv){ return texture2D(tDepth, uv).x; }
`;

const AO_FS = /* glsl */`
varying vec2 vUv; uniform vec2 uRes; uniform float uRadius, uTime;
${DEPTH_FN}
${NOISE}
void main(){
  float d0 = rawDepth(vUv); if (d0 >= 0.99999) { gl_FragColor = vec4(1.); return; }
  vec3 P = viewPos(vUv);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float occ = 0.0; float ang = h12(vUv*uRes) * 6.283; float rad = uRadius;
  const int S = 12;
  for (int i = 0; i < S; i++) {
    float fi = (float(i) + 0.5) / float(S);
    float a = ang + float(i) * 2.399;
    vec3 dir = vec3(cos(a) * sqrt(fi), sin(a) * sqrt(fi), 0.0);
    // orient the disc around N
    vec3 t = normalize(abs(N.z) < 0.9 ? cross(N, vec3(0,0,1)) : cross(N, vec3(1,0,0)));
    vec3 b = cross(N, t);
    vec3 s = P + (t*dir.x + b*dir.y + N*(0.15 + 0.85*sqrt(1.0-fi))) * rad * fi;
    vec4 pr = uProj * vec4(s, 1.0); vec2 suv = pr.xy / pr.w * 0.5 + 0.5;
    if (suv.x < 0. || suv.y < 0. || suv.x > 1. || suv.y > 1.) continue;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, rad / abs(P.z - sz));
    occ += step(s.z + 0.03, sz) * range;
  }
  float ao = 1.0 - occ / float(S);
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

const BLUR_FS = /* glsl */`
varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uDir;
${DEPTH_FN}
void main(){
  float z0 = viewPos(vUv).z; vec4 s = vec4(0.); float w = 0.;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = viewPos(uv).z;
    float k = exp(-float(i*i)/8.) * exp(-abs(z - z0) * 4.0);
    s += texture2D(tIn, uv) * k; w += k;
  }
  gl_FragColor = s / max(w, 1e-4);
}`;

const SSR_FS = /* glsl */`
varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uRes; uniform float uTime; uniform int uSteps;
uniform mat4 uViewMat;
${DEPTH_FN}
${NOISE}
void main(){
  vec4 c0 = texture2D(tColor, vUv);
  float mask = c0.a;
  if (mask < 0.02 || rawDepth(vUv) >= 0.99999) { gl_FragColor = vec4(0.); return; }
  vec3 P = viewPos(vUv);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  // rain-disturbed water: jitter the normal a little
  vec2 j = (vec2(h12(vUv*uRes + fract(uTime)*91.), h12(vUv*uRes*1.7 + fract(uTime*1.3)*57.)) - 0.5) * 0.035;
  vec3 up = normalize((uViewMat * vec4(0.,1.,0.,0.)).xyz);
  N = normalize(mix(N, up, 0.6) + vec3(j.x, 0., j.y));
  vec3 V = normalize(P);
  vec3 R = normalize(reflect(V, N));
  if (R.z > 0.2) { gl_FragColor = vec4(0.); return; }
  float stepLen = 0.18 + 0.02 * -P.z;
  vec3 pos = P + N * 0.05 + R * stepLen * h12(vUv*uRes);
  vec2 hitUV = vec2(-1.); float hit = 0.;
  for (int i = 0; i < 48; i++) {
    if (i >= uSteps) break;
    pos += R * stepLen; stepLen *= 1.08;
    vec4 pr = uProj * vec4(pos, 1.0); vec2 uv = pr.xy / pr.w * 0.5 + 0.5;
    if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) break;
    float sz = viewPos(uv).z;
    float dz = sz - pos.z;
    if (dz > 0.0 && dz < stepLen * 2.5 + 0.2) {
      // refine
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
  float fade = e.x * e.y;
  vec3 col = texture2D(tColor, hitUV).rgb;
  gl_FragColor = vec4(col, fade * mask);
}`;

const RAYS_FS = /* glsl */`
varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uSunUV; uniform float uSunVis; uniform vec2 uRes;
${DEPTH_FN}
${NOISE}
void main(){
  if (uSunVis <= 0.0) { gl_FragColor = vec4(0.); return; }
  const int N = 40;
  vec2 dlt = (vUv - uSunUV) / float(N) * 0.85;
  vec2 uv = vUv - dlt * h12(vUv * uRes);
  float decay = 1.0; vec3 acc = vec3(0.);
  for (int i = 0; i < N; i++) {
    uv -= dlt;
    vec2 cuv = clamp(uv, 0.001, 0.999);
    float sky = step(0.99999, rawDepth(cuv));
    vec3 c = min(texture2D(tColor, cuv).rgb, vec3(3.0));
    float l = smoothstep(0.35, 2.0, dot(c, vec3(0.3, 0.5, 0.2)));
    acc += c * l * sky * decay;
    decay *= 0.955;
  }
  float fall = smoothstep(0.75, 0.0, length((vUv - uSunUV) * vec2(1.6, 1.0)));
  gl_FragColor = vec4(acc / float(N) * uSunVis * fall, 1.0);
}`;

const COMP_FS = /* glsl */`
varying vec2 vUv; uniform sampler2D tColor, tAO, tSSR, tRays; uniform float uAOK, uSSRK, uRaysK, uFogD, uFlash, uTime;
uniform vec3 uFogCol, uSunCol, uSunV; uniform mat4 uViewInv; uniform vec3 uCamPos;
${DEPTH_FN}
${NOISE}
void main(){
  vec4 c = texture2D(tColor, vUv);
  vec3 col = c.rgb;
  float d = rawDepth(vUv);
  float ao = mix(1.0, texture2D(tAO, vUv).r, uAOK);
  col *= ao;
  vec4 r = texture2D(tSSR, vUv);
  if (uSSRK > 0.0 && r.a > 0.0) {
    col = mix(col, r.rgb, clamp(r.a * uSSRK, 0.0, 1.0) * 0.82);
  }
  if (d < 0.99999) {
    vec3 P = viewPos(vUv);
    vec3 W = (uViewInv * vec4(P, 1.0)).xyz;
    float dist = length(P);
    vec3 dir = normalize(W - uCamPos);
    // height fog, denser near the ground, thinned with altitude
    float hf = exp(-max(W.y, 0.0) * 0.09);
    float fogA = 1.0 - exp(-dist * uFogD * (0.35 + 0.65 * hf));
    float mie = pow(max(dot(dir, uSunV), 0.0), 18.0);
    vec3 fc = uFogCol + uSunCol * (mie * 1.2 + 0.015) + vec3(0.5,0.55,0.7) * uFlash * 0.3;
    // drifting rain mist breaks up the fog
    fogA *= 0.8 + 0.4 * vn3(W * 0.08 + vec3(uTime * 0.2, 0.0, uTime * 0.1));
    col = mix(col, fc, clamp(fogA, 0.0, 0.92));
  }
  col += texture2D(tRays, vUv).rgb * uRaysK;
  gl_FragColor = vec4(col, 1.0);
}`;

const DOWN_FS = /* glsl */`
varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uTexel; uniform float uThresh; uniform int uFirst;
vec3 S(vec2 o){ return texture2D(tIn, vUv + o * uTexel).rgb; }
void main(){
  vec3 a = S(vec2(-2,2)), b = S(vec2(0,2)), c = S(vec2(2,2));
  vec3 d = S(vec2(-2,0)), e = S(vec2(0,0)), f = S(vec2(2,0));
  vec3 g = S(vec2(-2,-2)), h = S(vec2(0,-2)), i = S(vec2(2,-2));
  vec3 j = S(vec2(-1,1)), k = S(vec2(1,1)), l = S(vec2(-1,-1)), m = S(vec2(1,-1));
  vec3 o = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  if (uFirst == 1) {
    float lum = dot(o, vec3(0.2126, 0.7152, 0.0722));
    float knee = uThresh * 0.6;
    float soft = clamp(lum - uThresh + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
    float w = max(soft, lum - uThresh) / max(lum, 1e-4);
    o *= w; o = min(o, vec3(60.0));
  }
  gl_FragColor = vec4(o, 1.0);
}`;

const UP_FS = /* glsl */`
varying vec2 vUv; uniform sampler2D tIn, tPrev; uniform vec2 uTexel; uniform float uRadius;
void main(){
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tIn, vUv + vec2(-t.x, t.y)).rgb + texture2D(tIn, vUv + vec2(0, t.y)).rgb * 2. + texture2D(tIn, vUv + vec2(t.x, t.y)).rgb
         + texture2D(tIn, vUv + vec2(-t.x, 0)).rgb * 2. + texture2D(tIn, vUv).rgb * 4. + texture2D(tIn, vUv + vec2(t.x, 0)).rgb * 2.
         + texture2D(tIn, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tIn, vUv + vec2(0, -t.y)).rgb * 2. + texture2D(tIn, vUv + vec2(t.x, -t.y)).rgb;
  gl_FragColor = vec4(s / 16.0 + texture2D(tPrev, vUv).rgb, 1.0);
}`;

const FINAL_FS = /* glsl */`
varying vec2 vUv; uniform sampler2D tColor, tBloom; uniform float uBloomK, uExposure, uTime, uGrain, uVig, uCA, uHurt, uFlash, uSat, uContrast;
uniform vec2 uRes;
${NOISE}
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
vec3 agx(vec3 v){
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                      0.0784335999999992, 0.878468636469772, 0.0784336,
                      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  v = m * v; v = clamp(log2(max(v, 1e-10)), -12.47393, 4.026069); v = (v + 12.47393) / 16.5;
  vec3 v2 = v*v, v4 = v2*v2;
  v = 15.5*v4*v2 - 40.14*v4*v + 31.96*v4 - 6.868*v2*v + 0.4298*v2 + 0.1191*v - 0.00232;
  const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                       -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                       -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  return mi * v;
}
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 cuv = vUv - 0.5; float r2 = dot(cuv, cuv);
  vec2 off = cuv * r2 * uCA;
  vec3 col;
  col.r = texture2D(tColor, vUv + off).r; col.g = texture2D(tColor, vUv).g; col.b = texture2D(tColor, vUv - off).b;
  col += texture2D(tBloom, vUv).rgb * uBloomK;
  col *= uExposure * (1.0 + uFlash * 0.6);
  vec3 tm = mix(aces(col * 0.9), agx(col), 0.55);
  // grade: cool shadows, warm highlights, mild S curve
  float l = dot(tm, vec3(0.2126, 0.7152, 0.0722));
  tm = mix(tm, tm * vec3(0.88, 0.97, 1.12), (1.0 - smoothstep(0.0, 0.45, l)) * 0.55);
  tm = mix(tm, tm * vec3(1.08, 1.0, 0.9), smoothstep(0.45, 1.0, l) * 0.4);
  tm = mix(vec3(l), tm, uSat);
  tm = clamp((tm - 0.5) * uContrast + 0.5, 0.0, 1.0);
  tm = mix(tm, tm * tm * (3.0 - 2.0 * tm), 0.25);
  // hurt: desaturate and red edge
  float hv = smoothstep(0.05, 0.5, r2) * uHurt;
  tm = mix(tm, vec3(dot(tm, vec3(0.33))) * vec3(1.2, 0.4, 0.35), hv * 0.8);
  tm *= 1.0 - smoothstep(0.12, 0.65, r2) * uVig;
  vec3 o = toSRGB(clamp(tm, 0.0, 1.0));
  float g = h12(vUv * uRes + fract(uTime * 13.7) * 117.) - 0.5;
  o += g * uGrain * (0.6 + 0.4 * (1.0 - l));
  o += (h12(vUv * uRes * 1.31 + 3.1) - 0.5) / 255.0;
  gl_FragColor = vec4(o, 1.0);
}`;

export class Post {
  constructor(G) {
    this.G = G; const r = G.renderer;
    this.q = G.quality;
    this.passes = {};
    const depthU = () => ({ tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uNear: { value: 0.1 }, uFar: { value: 600 } });
    this.ao = new Pass(AO_FS, Object.assign(depthU(), { uRes: { value: new THREE.Vector2() }, uRadius: { value: 0.75 }, uTime: { value: 0 } }));
    this.blur = new Pass(BLUR_FS, Object.assign(depthU(), { tIn: { value: null }, uDir: { value: new THREE.Vector2() } }));
    this.ssr = new Pass(SSR_FS, Object.assign(depthU(), { tColor: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uSteps: { value: 32 }, uViewMat: { value: new THREE.Matrix4() } }));
    this.rays = new Pass(RAYS_FS, Object.assign(depthU(), { tColor: { value: null }, uSunUV: { value: new THREE.Vector2() }, uSunVis: { value: 0 }, uRes: { value: new THREE.Vector2() } }));
    this.comp = new Pass(COMP_FS, Object.assign(depthU(), {
      tColor: { value: null }, tAO: { value: null }, tSSR: { value: null }, tRays: { value: null },
      uAOK: { value: 0.85 }, uSSRK: { value: 1 }, uRaysK: { value: 0.35 }, uFogD: { value: 0.011 }, uFlash: { value: 0 }, uTime: { value: 0 },
      uFogCol: { value: new THREE.Color(0.045, 0.055, 0.072) }, uSunCol: { value: new THREE.Color(0.7, 0.33, 0.13) }, uSunV: { value: SUN_DIR },
      uViewInv: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    }));
    this.down = new Pass(DOWN_FS, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.1 }, uFirst: { value: 0 } });
    this.up = new Pass(UP_FS, { tIn: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.final = new Pass(FINAL_FS, {
      tColor: { value: null }, tBloom: { value: null }, uBloomK: { value: 0.07 }, uExposure: { value: 1.1 }, uTime: { value: 0 },
      uGrain: { value: 0.045 }, uVig: { value: 0.55 }, uCA: { value: 0.012 }, uHurt: { value: 0 }, uFlash: { value: 0 }, uSat: { value: 1.0 }, uContrast: { value: 1.06 },
      uRes: { value: new THREE.Vector2() },
    });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.black.needsUpdate = true;
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    this.resize();
  }
  rt(w, h, opts) {
    return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), Object.assign({ type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }, opts || {}));
  }
  resize() {
    const r = this.G.renderer; const q = this.G.quality;
    const s = new THREE.Vector2(); r.getDrawingBufferSize(s);
    this.w = s.x; this.h = s.y;
    [this.sceneRT, this.compRT, this.aoRT, this.aoRT2, this.ssrRT, this.raysRT, ...(this.mips || []), ...(this.ups || [])].forEach((t) => t && t.dispose());
    this.sceneRT = this.rt(this.w, this.h, { depthBuffer: true, samples: q.msaa });
    this.sceneRT.depthTexture = new THREE.DepthTexture(this.w, this.h);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.compRT = this.rt(this.w, this.h);
    const hw = this.w / 2, hh = this.h / 2;
    this.aoRT = this.rt(hw, hh, { type: THREE.UnsignedByteType }); this.aoRT2 = this.rt(hw, hh, { type: THREE.UnsignedByteType });
    this.ssrRT = this.rt(hw, hh); this.raysRT = this.rt(hw, hh);
    this.mips = []; this.ups = [];
    let w = this.w, h = this.h;
    for (let i = 0; i < 6; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); this.mips.push(this.rt(w, h)); this.ups.push(this.rt(w, h)); }
  }
  setDepthU(u, cam) {
    u.tDepth.value = this.sceneRT.depthTexture; u.uProjInv.value.copy(cam.projectionMatrixInverse); u.uProj.value.copy(cam.projectionMatrix); u.uNear.value = cam.near; u.uFar.value = cam.far;
  }
  render(drawScene, cam, t) {
    const r = this.G.renderer; const q = this.G.quality; const fx = this.G.postFx || {};
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 0); r.clear(true, true, true);
    drawScene();
    const color = this.sceneRT.texture;
    // AO
    let aoTex = this.white;
    if (q.ao) {
      this.setDepthU(this.ao.u, cam); this.ao.u.uRes.value.set(this.w / 2, this.h / 2); this.ao.m.uniforms.uTime.value = t;
      this.ao.run(r, this.aoRT);
      this.setDepthU(this.blur.u, cam);
      this.blur.u.tIn.value = this.aoRT.texture; this.blur.u.uDir.value.set(2 / this.w, 0); this.blur.run(r, this.aoRT2);
      this.blur.u.tIn.value = this.aoRT2.texture; this.blur.u.uDir.value.set(0, 2 / this.h); this.blur.run(r, this.aoRT);
      aoTex = this.aoRT.texture;
    }
    // SSR
    let ssrTex = this.black;
    if (q.ssr) {
      this.setDepthU(this.ssr.u, cam); this.ssr.u.tColor.value = color; this.ssr.u.uRes.value.set(this.w / 2, this.h / 2);
      this.ssr.u.uTime.value = t; this.ssr.u.uSteps.value = q.ssrSteps; this.ssr.u.uViewMat.value.copy(cam.matrixWorldInverse);
      this.ssr.run(r, this.ssrRT); ssrTex = this.ssrRT.texture;
    }
    // god rays
    const sp = SUN_DIR.clone().multiplyScalar(500).add(cam.position).project(cam);
    const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    const vis = Math.max(0, camDir.dot(SUN_DIR)) ** 2 * (Math.abs(sp.x) < 1.6 && Math.abs(sp.y) < 1.6 ? 1 : 0);
    let raysTex = this.black;
    if (vis > 0.001) {
      this.setDepthU(this.rays.u, cam); this.rays.u.tColor.value = color; this.rays.u.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      this.rays.u.uSunVis.value = vis; this.rays.u.uRes.value.set(this.w / 2, this.h / 2); this.rays.run(r, this.raysRT); raysTex = this.raysRT.texture;
    }
    // composite
    const c = this.comp.u;
    this.setDepthU(c, cam); c.tColor.value = color; c.tAO.value = aoTex; c.tSSR.value = ssrTex; c.tRays.value = raysTex;
    c.uViewInv.value.copy(cam.matrixWorld); c.uCamPos.value.copy(cam.position); c.uTime.value = t;
    c.uFlash.value = fx.flash || 0; c.uSSRK.value = q.ssr ? 1 : 0; c.uAOK.value = q.ao ? 0.85 : 0;
    this.comp.run(r, this.compRT);
    // bloom
    let src = this.compRT.texture; let sw = this.w, sh = this.h;
    for (let i = 0; i < this.mips.length; i++) {
      this.down.u.tIn.value = src; this.down.u.uTexel.value.set(1 / sw, 1 / sh); this.down.u.uFirst.value = i === 0 ? 1 : 0;
      this.down.run(r, this.mips[i]); src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
    }
    let prev = this.black;
    for (let i = this.mips.length - 1; i >= 0; i--) {
      const inp = i === this.mips.length - 1 ? this.mips[i].texture : this.ups[i + 1].texture;
      this.up.u.tIn.value = inp; this.up.u.tPrev.value = i === this.mips.length - 1 ? this.black : this.mips[i].texture;
      this.up.u.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      this.up.run(r, this.ups[i]);
    }
    const f = this.final.u;
    f.tColor.value = this.compRT.texture; f.tBloom.value = this.ups[0].texture; f.uTime.value = t; f.uRes.value.set(this.w, this.h);
    f.uHurt.value = fx.hurt || 0; f.uFlash.value = fx.flash || 0;
    this.final.run(r, null);
  }
}
