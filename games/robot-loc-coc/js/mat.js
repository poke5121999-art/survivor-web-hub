// Bot material: MeshStandardMaterial patched so one material paints every region of a part (palette slots from
// geo.js R) with painted-metal wear, a projected sticker/number decal on the torso, and the face: screen eyes
// (LED dot matrix or smooth glow) or camera-lens eyes with shutter lids, both driven by emote uniforms.
// The face-decal idea (eyes / lids / mouth drawn per pixel from the bind-space position) comes from
// D:\organic-proto\kit\figure.js; the shapes here are new.
import * as THREE from 'three';

export const EMO = { neutral: 0, happy: 1, scared: 2, angry: 3, dizzy: 4, sleepy: 5, love: 6, dead: 7, sad: 8, strain: 9 };

const VPARS = `attribute float aReg; varying float vReg; varying vec3 vOP; varying vec3 vON;`;
const VMAIN = `vReg = aReg; vOP = position; vON = normal;`;
const FPARS = `
varying float vReg; varying vec3 vOP; varying vec3 vON;
uniform vec3 uPal[11]; uniform vec4 uWear; // x amount, y seed, z dirt, w sticker on
uniform sampler2D uDecal; uniform vec4 uDecalR;
uniform vec4 uFace; // x mode (0 none, 1 screen, 2 lens), y emote, z blink, w time
uniform vec4 uFace2; // x led (1 = dot matrix), y mouth on, z look x, w look y
uniform vec4 uScr; // screen centre xy (part space), half height, eye separation (in half heights)
uniform vec4 uLens0; uniform vec4 uLens1; // lens centre xyz, radius; uLens1.w < 0 = single lens
uniform vec3 uEyeCol;
float bh13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float bn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(bh13(i),bh13(i+vec3(1.,0.,0.)),f.x),mix(bh13(i+vec3(0.,1.,0.)),bh13(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(bh13(i+vec3(0.,0.,1.)),bh13(i+vec3(1.,0.,1.)),f.x),mix(bh13(i+vec3(0.,1.,1.)),bh13(i+vec3(1.,1.,1.)),f.x),f.y),f.z); }
float bfb(vec3 p){ return .5*bn3(p)+.27*bn3(p*2.03+7.1)+.14*bn3(p*4.1+3.3)+.07*bn3(p*8.3+1.7); }
float sdEll(vec2 p, vec2 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.)/max(k1,1e-4); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
float dot2(vec2 v){ return dot(v,v); }
float sdHeart(vec2 p){ p.x=abs(p.x); if(p.y+p.x>1.) return sqrt(dot2(p-vec2(.25,.75)))-sqrt(2.)/4.;
  return sqrt(min(dot2(p-vec2(0.,1.)), dot2(p-.5*max(p.x+p.y,0.))))*sign(p.x-p.y); }
// screen eye: signed distance of the lit shape, eye-local q (eye radius ~1), s = side (+1 eye at +x)
float eyeShape(vec2 q, float s, float emo, float blink, float t){
  float d;
  if (emo < .5 || emo > 7.5 && emo < 8.5) {
    float h = .82*(1.-blink) + .06;
    d = sdEll(q, vec2(.56, h));
    if (emo > 7.5) d = max(d, q.y - (.3 - .55*s*q.x));
  } else if (emo < 1.5) { d = max(abs(length(q-vec2(0.,-.5)) - .62) - .15, -(q.y + .05)); }
  else if (emo < 2.5) { vec2 j = vec2(sin(t*53.), cos(t*41.))*.05; d = min(abs(sdEll(q, vec2(.64,.92))) - .075, length(q - j) - .2); }
  else if (emo < 3.5) { d = max(sdEll(q, vec2(.6, .7*(1.-blink)+.06)), q.y - (.22 + .62*s*q.x)); }
  else if (emo < 4.5) { float r = length(q), a = atan(q.y, q.x)*s; float f = fract(r*2.3 - a/6.2832 + t*1.6); d = max((abs(f-.5)-.2)/2.3, r - .88); }
  else if (emo < 5.5) { d = max(abs(length(q - vec2(0., .62)) - .66) - .12, q.y - .12); }
  else if (emo < 6.5) { float k = 1. + .13*sin(t*9.); vec2 hp = vec2(q.x, q.y)/(1.25*k) + vec2(0., .5); d = sdHeart(hp)*1.25*k; }
  else if (emo < 7.5) { d = min(sdSeg(q, vec2(-.5,-.5), vec2(.5,.5)), sdSeg(q, vec2(-.5,.5), vec2(.5,-.5))) - .13; }
  else { d = min(sdSeg(q, vec2(s*.45,.5), vec2(-s*.38,0.)), sdSeg(q, vec2(-s*.38,0.), vec2(s*.45,-.5))) - .13; }
  return d;
}
float mouthShape(vec2 m, float emo, float t){
  if (emo < .5) return sdSeg(m, vec2(-.16,0.), vec2(.16,0.)) - .045;
  if (emo < 1.5) return max(abs(length(m - vec2(0.,.2)) - .3) - .05, m.y - .08);
  if (emo < 2.5) { float w = .05*sin(m.x*38. + t*20.); return max(abs(m.y - w) - .04, abs(m.x) - .26); }
  if (emo < 3.5 || emo > 8.5) { float z = abs(fract(m.x*5.+.25)-.5)*.2 - .05; return max(abs(m.y - z) - .04, abs(m.x) - .26); }
  if (emo < 4.5) { float w = .06*sin(m.x*22. - t*6.); return max(abs(m.y - w) - .04, abs(m.x) - .24); }
  if (emo < 5.5) { float k = .09 + .03*sin(t*2.); return abs(length(m/vec2(1.,1.25)) - k) - .035; }
  if (emo < 6.5) { vec2 a = vec2(abs(m.x) - .1, m.y); return max(abs(length(a - vec2(0.,.06)) - .1) - .04, a.y - .06); }
  if (emo < 7.5) return min(sdSeg(m, vec2(-.2,0.), vec2(.2,0.)) - .04, length(m - vec2(.08,-.08)) - .07);
  return max(abs(length(m - vec2(0.,-.32)) - .3) - .045, -(m.y + .06));
}
`;
const FMAIN = `
{
  float rg = floor(vReg + .5); vec3 col = uPal[0]; float rough = .42, metal = .05; vec3 em = vec3(0.);
  bool paint = rg < 1.5 || rg > 8.5;
  if (rg > .5 && rg < 1.5) col = uPal[1];
  else if (rg > 1.5 && rg < 2.5) { col = uPal[2]; rough = .5; metal = .65; }
  else if (rg > 2.5 && rg < 3.5) { col = uPal[3]; rough = .24; metal = 1.; }
  else if (rg > 3.5 && rg < 4.5) { col = uPal[4]; rough = .12; metal = .0; }
  else if (rg > 4.5 && rg < 5.5) { col = uPal[5]; rough = .06; metal = .0; }
  else if (rg > 5.5 && rg < 6.5) { col = uPal[6]*.4; em = uPal[6]*2.2; rough = .3; }
  else if (rg > 6.5 && rg < 7.5) { col = uPal[7]; rough = .88; metal = 0.; }
  else if (rg > 7.5 && rg < 8.5) { col = uPal[8]; rough = .5; metal = 0.; }
  else if (rg > 9.5) col = uPal[10];
  vec3 op = vOP;
  // painted surfaces: soft mottling, chipped paint showing steel, fine scratches, grime low down
  if (paint) {
    float mot = bn3(op*9. + uWear.y); col *= .93 + .1*mot;
    float n = bfb(op*34. + uWear.y*3.1) + .12*bn3(op*6. + uWear.y);
    float chip = smoothstep(.79 - uWear.x*.06, .797 - uWear.x*.06, n);
    float sc = 0.;
    vec3 sd = normalize(vec3(.8, .3 + .5*sin(uWear.y), .4));
    float ln = abs(fract(dot(op, sd)*55. + bn3(op*4.)*3.) - .5);
    sc = smoothstep(.03, .0, ln) * smoothstep(.62, .78, bn3(op*7. + 11. + uWear.y)) * uWear.x;
    // sticker / number decal (torso front, part-space planar projection)
    if (rg > 8.5 && rg < 9.5 && uWear.w > .5 && vON.z > .15) {
      vec2 uv = (op.xy - uDecalR.xy) / uDecalR.z + .5;
      if (uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.) { vec4 dc = texture2D(uDecal, uv); col = mix(col, dc.rgb, dc.a); rough = mix(rough, .3, dc.a); chip *= 1. - dc.a*.6; }
    }
    col = mix(col, vec3(.55,.56,.58), chip); rough = mix(rough, .38, chip); metal = mix(metal, .9, chip);
    col = mix(col, col*.55 + vec3(.06), sc*.8);
    col *= 1. - chip*0.;
  }
  float grime = smoothstep(.12, -.05, op.y) * uWear.z; col *= 1. - grime*.25;
  // ---- face ----
  if (uFace.x > .5 && (rg > 3.5 && rg < 5.5)) {
    float emo = uFace.y, blink = uFace.z, t = uFace.w; vec2 look = uFace2.zw;
    if (uFace.x < 1.5 && rg < 4.5) {
      vec2 p = (op.xy - uScr.xy) / uScr.z; // screen units, half height = 1
      vec2 pp = p;
      float led = uFace2.x; float px = .085;
      if (led > .5) pp = (floor(p/px) + .5)*px;
      float d = 1e3;
      for (int i = 0; i < 2; i++) {
        float s = i == 0 ? 1. : -1.;
        vec2 q = (pp - vec2(s*uScr.w, .18) - look*vec2(.28,.2)) / .42;
        d = min(d, eyeShape(q, s, emo, blink, t)*.42);
      }
      if (uFace2.y > .5) d = min(d, mouthShape(pp - vec2(0., -.52) - look*vec2(.15,.1), emo, t));
      float aa = fwidth(p.x)*1.2 + 1e-4;
      float lit;
      if (led > .5) { vec2 cell = fract(p/px) - .5; float dot_ = smoothstep(.5, .32, length(cell)); lit = step(d, 0.) * dot_; col += vec3(.02,.03,.03) * dot_; }
      else lit = 1. - smoothstep(-aa, aa, d);
      float halo = exp(-max(d, 0.)*14.) * .22;
      float scan = .9 + .1*sin(op.y/uScr.z*120.);
      em += uEyeCol * (lit*2.6*scan + halo);
      col = mix(col, uEyeCol*.25, lit);
    } else if (rg > 4.5) {
      vec3 c0 = uLens0.xyz; float r0 = uLens0.w; float s = 1.;
      if (uLens1.w > 0. && distance(op, uLens1.xyz) < distance(op, c0)) { c0 = uLens1.xyz; r0 = uLens1.w; s = -1.; }
      if (uLens1.w <= 0.) s = 0.;
      vec2 q = (op.xy - c0.xy) / r0;
      vec2 iq = q - look*.32;
      float ir = length(iq), aa = fwidth(q.x)*1.2 + 1e-4;
      float pr = .26; if (emo > 1.5 && emo < 2.5) { pr = .09; iq += vec2(sin(t*47.), cos(t*39.))*.03; ir = length(iq); }
      if (emo > 4.5 && emo < 5.5) pr = .34;
      vec3 e = vec3(.01,.012,.016);
      float iris = 1. - smoothstep(.62-aa, .62+aa, ir);
      vec3 ic = uEyeCol * (.55 + .45*smoothstep(.62, .2, ir));
      float blades = .85 + .15*smoothstep(.4, .6, fract(atan(iq.y, iq.x)/6.2832*7.));
      e = mix(e, ic*blades, iris);
      em += uEyeCol * iris * .9 * smoothstep(.62, .25, ir);
      float pup;
      if (emo > 5.5 && emo < 6.5) { float k = 1. + .14*sin(t*9.); pup = 1. - smoothstep(-aa, aa, sdHeart(iq/(.62*k) + vec2(0., .5))); e = mix(e, vec3(1.,.25,.45), pup); em += vec3(1.,.2,.4)*pup*2.; }
      else if (emo > 3.5 && emo < 4.5) { float a = atan(iq.y, iq.x), f = fract(ir*3. - a/6.2832 + t*1.5); pup = iris * smoothstep(.3,.25,abs(f-.5)); e = mix(e, vec3(.02), pup); }
      else { pup = 1. - smoothstep(pr-aa, pr+aa, ir); e = mix(e, vec3(.005), pup); }
      float gl = 1. - smoothstep(.1, .14, length(q - vec2(-.36, .4))); float gl2 = 1. - smoothstep(.04, .07, length(q - vec2(.3, -.36)));
      e += vec3(1.)*(gl*.9 + gl2*.5); em += vec3(1.)*gl*.6;
      if (emo > 6.5 && emo < 7.5) { float dx = min(sdSeg(q, vec2(-.55,-.55), vec2(.55,.55)), sdSeg(q, vec2(-.55,.55), vec2(.55,-.55))) - .12; float x = 1. - smoothstep(-aa, aa, dx); e = mix(e, vec3(.9,.15,.1), x); em += vec3(1.,.1,.05)*x*1.4; }
      // shutter lids
      float yT = .98 - 1.96*blink, yB = -1.;
      if (emo > .5 && emo < 1.5) { yB = .05 - .75*q.x*q.x; yT = 1.; }
      else if (emo > 2.5 && emo < 3.5) yT = min(yT, .32 + .55*s*q.x);
      else if (emo > 4.5 && emo < 5.5) yT = min(yT, .12 + .05*sin(t*1.7));
      else if (emo > 7.5 && emo < 8.5) yT = min(yT, .42 - .5*s*q.x);
      else if (emo > 8.5) { yT = min(yT, .25 + .45*s*q.x); yB = -.3; }
      else if (emo > 6.5 && emo < 7.5) { yT = .35; }
      float lidT = smoothstep(-aa, aa, q.y - yT), lidB = smoothstep(aa, -aa, q.y - yB);
      float lid = max(lidT, lidB);
      vec3 lc = uPal[0]*.85; float edge = max(1. - smoothstep(0., .06, abs(q.y - yT)), (yB > -.99 ? 1. - smoothstep(0., .06, abs(q.y - yB)) : 0.));
      e = mix(e, lc, lid); e = mix(e, vec3(.03), edge*.85);
      em *= 1. - lid;
      col = e; rough = mix(.06, .45, lid);
    }
  }
  diffuseColor.rgb = col; roughnessFactor = rough; metalnessFactor = metal; totalEmissiveRadiance = em;
}
`;
let _white = null;
function whiteTex() { if (!_white) { _white = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); _white.needsUpdate = true; } return _white; }
// pal: array of 11 hex colours (palette slots); opts.decal: CanvasTexture; returns material with .userData.u uniforms
export function botMat(pal, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1, envMapIntensity: 1.0 });
  const u = {
    uPal: { value: pal.map((h) => new THREE.Color(h)) }, uWear: { value: new THREE.Vector4(opts.wear ?? 0.5, opts.seed ?? 0, opts.dirt ?? 0.5, opts.decal ? 1 : 0) },
    uDecal: { value: opts.decal || whiteTex() }, uDecalR: { value: new THREE.Vector4(0, 0, 0.2, 0) },
    uFace: { value: new THREE.Vector4(0, 0, 0, 0) }, uFace2: { value: new THREE.Vector4(0, 1, 0, 0) }, uScr: { value: new THREE.Vector4(0, 0, 0.1, 0.45) },
    uLens0: { value: new THREE.Vector4(0, 0, 0, 0.05) }, uLens1: { value: new THREE.Vector4(0, 0, 0, -1) }, uEyeCol: { value: new THREE.Color(opts.eye ?? 0x7dffd0) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VPARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VMAIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FPARS).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FMAIN);
  };
  m.customProgramCacheKey = () => 'botmat1';
  return m;
}
