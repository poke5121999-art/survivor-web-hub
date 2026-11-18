// Ported verbatim from games/robot-loc-coc/twt/robo-mat.js (origin/main, Xưởng Robot Lóc Cóc, same owner); only the three.js import path changed.
// Crowd material: MeshStandardMaterial patched to (1) skin each vertex by its one rigid bone, reading the bone and the
// root matrix of its instance from a float texture (row = instance slot, see robo-crowd.js), and (2) paint every
// palette region in one pass: chipped paint, rust and dents for broken robots, glow parts, the torso number decal and
// the face (LED / glow screen eyes or camera lenses with shutter lids, emote shapes, zombie glitch and cracks).
// Face and decal maths follow ../js/mat.js (bot-crew), which took the face-decal idea from organic-proto figure.js.
// The fragment writes alpha 0 like every twt character (js/mats.js noMask contract: no SSR reflectivity).
import * as THREE from '../../vendor/three.module.min.js';
import { NPAL } from './robo-cast.js';

export const TEX_W = 80; // texels per slot: 24 bones x 3 + root x 3 + 2 params
const ROOT_T = 72, PAR_T = 75;

// texel layout of a slot row: bones from 0, root matrix at `root`, 2 param texels at `par` (robots: 72 / 75; the
// animal kit uses wider rows, see robo-beasts.js)
const SKIN_PARS = (ROOT_T) => `
uniform highp sampler2D uBones;
attribute float aBone; attribute float aReg; attribute float aSlot;
varying float vReg; varying float vBone; varying vec3 vOP;
flat varying vec4 vP0; flat varying vec4 vP1;
mat4 rbRow(int x, int y) {
  vec4 a = texelFetch(uBones, ivec2(x, y), 0), b = texelFetch(uBones, ivec2(x + 1, y), 0), c = texelFetch(uBones, ivec2(x + 2, y), 0);
  return mat4(a.x, b.x, c.x, 0., a.y, b.y, c.y, 0., a.z, b.z, c.z, 0., a.w, b.w, c.w, 1.);
}
mat4 rbSkin() { int y = int(aSlot + .5); return rbRow(${ROOT_T}, y) * rbRow(int(aBone + .5) * 3, y); }
mat4 gSk;
`;
const DEPTH_PARS = (ROOT_T) => `
uniform highp sampler2D uBones;
attribute float aBone; attribute float aSlot;
mat4 rbRow(int x, int y) {
  vec4 a = texelFetch(uBones, ivec2(x, y), 0), b = texelFetch(uBones, ivec2(x + 1, y), 0), c = texelFetch(uBones, ivec2(x + 2, y), 0);
  return mat4(a.x, b.x, c.x, 0., a.y, b.y, c.y, 0., a.z, b.z, c.z, 0., a.w, b.w, c.w, 1.);
}
mat4 rbSkin() { int y = int(aSlot + .5); return rbRow(${ROOT_T}, y) * rbRow(int(aBone + .5) * 3, y); }
`;
const SKIN_N = (PAR_T) => `
gSk = rbSkin(); objectNormal = mat3(gSk) * objectNormal;
vReg = aReg; vBone = aBone; vOP = position;
{ int y = int(aSlot + .5); vP0 = texelFetch(uBones, ivec2(${PAR_T}, y), 0); vP1 = texelFetch(uBones, ivec2(${PAR_T + 1}, y), 0); }
`;
const SKIN_P = `transformed = (gSk * vec4(position, 1.)).xyz;`;

const FPARS = `
varying float vReg; varying float vBone; varying vec3 vOP;
flat varying vec4 vP0; flat varying vec4 vP1;
uniform vec3 uPal[${NPAL}]; uniform vec4 uWear; // x amount, y seed, z dirt, w decal on
uniform vec4 uRust; // x rust, y broken (glitch + cracks), z oily, w time
uniform sampler2D uDecal; uniform vec4 uDecalR;
uniform vec4 uFace; // x mode (0 none, 1 screen, 2 lens), y led, z mouth
uniform vec4 uScr; uniform vec4 uLens0; uniform vec4 uLens1; uniform vec3 uEyeCol;
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
float eyeShape(vec2 q, float s, float emo, float blink, float t){
  float d;
  if (emo < .5 || emo > 7.5 && emo < 8.5) { float h = .82*(1.-blink) + .06; d = sdEll(q, vec2(.56, h)); if (emo > 7.5) d = max(d, q.y - (.3 - .55*s*q.x)); }
  else if (emo < 1.5) { d = max(abs(length(q-vec2(0.,-.5)) - .62) - .15, -(q.y + .05)); }
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
// glass cracks: distance to a few seeded lines through q (units of the screen / lens)
float cracks(vec2 q, float seed){
  float d = 1e3;
  for (int i = 0; i < 4; i++) { float fi = float(i); vec2 a = vec2(bh13(vec3(seed, fi, 1.)), bh13(vec3(seed, fi, 2.)))*1.6 - .8; float ang = bh13(vec3(seed, fi, 3.))*6.2832;
    vec2 b = a + vec2(cos(ang), sin(ang))*1.4; d = min(d, sdSeg(q, a, b) + .01*sin(q.x*40. + fi)); }
  return d;
}
`;
const FMAIN = `
{
  float rg = floor(vReg + .5); vec3 col = uPal[0]; float rough = .42, metal = .05; vec3 em = vec3(0.);
  float emo = vP0.x, blink = vP0.y; vec2 look = vP0.zw; float flash = vP1.x, glowK = vP1.y, eyeK = vP1.z, iseed = vP1.w;
  float t = uRust.w + iseed*17.;
  int ri = int(rg); col = uPal[ri];
  bool paint = rg < 1.5 || (rg > 8.5 && rg < 10.5) || rg > 12.5 && rg < 13.5 || rg > 15.5;
  if (rg > 1.5 && rg < 2.5) { rough = .5; metal = .65; }
  else if (rg > 2.5 && rg < 3.5) { rough = .24 + uRust.x*.3; metal = 1.; }
  else if (rg > 3.5 && rg < 4.5) { rough = .12; metal = .0; }
  else if (rg > 4.5 && rg < 5.5) { rough = .06; metal = .0; }
  else if (rg > 5.5 && rg < 6.5) { col = uPal[6]*.4; em = uPal[6]*2.2*glowK; rough = .3; }
  else if (rg > 6.5 && rg < 7.5) { rough = .88; metal = 0.; }
  else if (rg > 7.5 && rg < 8.5) { rough = .5; metal = 0.; }
  else if (rg > 10.5 && rg < 12.5) { float gr = bn3(vOP*vec3(60., 6., 60.) + vBone); col *= .85 + .25*gr; rough = .8; metal = 0.; }
  else if (rg > 13.5 && rg < 15.5) { rough = .3; metal = 0.; }
  vec3 op = vOP + vBone*3.71;
  if (paint) {
    float mot = bn3(op*9. + uWear.y); col *= .93 + .1*mot;
    float n = bfb(op*34. + uWear.y*3.1) + .12*bn3(op*6. + uWear.y);
    float chip = smoothstep(.79 - uWear.x*.06, .797 - uWear.x*.06, n);
    vec3 sd = normalize(vec3(.8, .3 + .5*sin(uWear.y), .4));
    float ln = abs(fract(dot(op, sd)*55. + bn3(op*4.)*3.) - .5);
    float sc = smoothstep(.03, .0, ln) * smoothstep(.62, .78, bn3(op*7. + 11. + uWear.y)) * uWear.x;
    if (rg > 8.5 && rg < 9.5 && uWear.w > .5 && vBone < 1.5 && vBone > .5) {
      vec2 uv = (vOP.xy - uDecalR.xy) / uDecalR.z + .5;
      if (uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1. && vOP.z > 0.) { vec4 dc = texture2D(uDecal, uv); col = mix(col, dc.rgb, dc.a); rough = mix(rough, .3, dc.a); chip *= 1. - dc.a*.6; }
    }
    col = mix(col, vec3(.55,.56,.58), chip); rough = mix(rough, .38, chip); metal = mix(metal, .9, chip);
    col = mix(col, col*.55 + vec3(.06), sc*.8);
    // rust: blooms out of the chips and runs down in streaks
    if (uRust.x > 0.) {
      float rn = bfb(op*vec3(11., 4., 11.) + 3.) + .12*bn3(op*40.) + .1*smoothstep(.1, -.1, vOP.y - .04);
      float rs = smoothstep(.70 - uRust.x*.16, .76 - uRust.x*.14, rn) + chip*uRust.x*.8;
      vec3 rc = mix(vec3(.30,.13,.05), vec3(.58,.30,.12), bn3(op*55.));
      rs = clamp(rs, 0., 1.); col = mix(col, rc, rs*.92); rough = mix(rough, .9, rs); metal = mix(metal, .25, rs);
    }
    if (uRust.z > 0.) { float sw = smoothstep(.72, .8, bn3(op*vec3(70., 30., 70.) + vec3(0., t*.4, 0.))); rough = mix(rough*.35, .05, sw); col *= 1. - .1*sw; }
  } else if (uRust.x > 0. && rg > 2.5 && rg < 3.5) { float rn = bfb(op*22.); col = mix(col, vec3(.4,.22,.1), smoothstep(.55, .7, rn)*uRust.x); }
  float grime = smoothstep(.12, -.05, op.y - vBone*3.71) * uWear.z; col *= 1. - grime*.25;
  // ---- face (head bone only) ----
  if (uFace.x > .5 && vBone > 1.5 && vBone < 2.5 && (rg > 3.5 && rg < 5.5)) {
    if (uFace.x < 1.5 && rg < 4.5) {
      vec2 p = (vOP.xy - uScr.xy) / uScr.z;
      // broken screens: tearing scan bands and a sideways jolt now and then
      if (uRust.y > .5) { float band = floor(p.y*5. + floor(t*9.)); float j = step(.78, bh13(vec3(band, floor(t*11.), 3.))); p.x += (bh13(vec3(band, 1., 2.)) - .5)*.5*j; }
      vec2 pp = p; float led = uFace.y, px = .085;
      if (led > .5) pp = (floor(p/px) + .5)*px;
      float d = 1e3;
      for (int i = 0; i < 2; i++) { float s = i == 0 ? 1. : -1.; vec2 q = (pp - vec2(s*uScr.w, .18) - look*vec2(.28,.2)) / .42; d = min(d, eyeShape(q, s, emo, blink, t)*.42); }
      if (uFace.z > .5) d = min(d, mouthShape(pp - vec2(0., -.52) - look*vec2(.15,.1), emo, t));
      float aa = fwidth(p.x)*1.2 + 1e-4, lit;
      if (led > .5) { vec2 cell = fract(p/px) - .5; float dot_ = smoothstep(.5, .32, length(cell)); lit = step(d, 0.) * dot_; col += vec3(.02,.03,.03) * dot_; }
      else lit = 1. - smoothstep(-aa, aa, d);
      float halo = exp(-max(d, 0.)*14.) * .22, scan = .9 + .1*sin(vOP.y/uScr.z*120.);
      em += uEyeCol * (lit*2.6*scan + halo) * eyeK;
      col = mix(col, uEyeCol*.25, lit*min(1., eyeK));
      if (uRust.y > .5) { float cr = cracks(p*.8, uWear.y); float c = 1. - smoothstep(0., .025, cr); col = mix(col, vec3(.55,.6,.62), c*.6); em *= 1. - c*.7; rough = mix(rough, .5, c); }
    } else if (rg > 4.5) {
      vec3 c0 = uLens0.xyz; float r0 = uLens0.w; float s = 1.;
      if (uLens1.w > 0. && distance(vOP, uLens1.xyz) < distance(vOP, c0)) { c0 = uLens1.xyz; r0 = uLens1.w; s = -1.; }
      if (uLens1.w <= 0.) s = 0.;
      vec2 q = (vOP.xy - c0.xy) / r0, iq = q - look*.32;
      float ir = length(iq), aa = fwidth(q.x)*1.2 + 1e-4;
      float pr = .26; if (emo > 1.5 && emo < 2.5) { pr = .09; iq += vec2(sin(t*47.), cos(t*39.))*.03; ir = length(iq); }
      if (emo > 4.5 && emo < 5.5) pr = .34;
      if (uRust.y > .5) pr = .12 + .06*sin(t*13. + s);
      vec3 e = vec3(.01,.012,.016);
      float iris = 1. - smoothstep(.62-aa, .62+aa, ir);
      vec3 ic = uEyeCol * (.55 + .45*smoothstep(.62, .2, ir));
      float blades = .85 + .15*smoothstep(.4, .6, fract(atan(iq.y, iq.x)/6.2832*7.));
      e = mix(e, ic*blades*min(1., eyeK + .2), iris);
      em += uEyeCol * iris * .9 * smoothstep(.62, .25, ir) * eyeK;
      float pup;
      if (emo > 5.5 && emo < 6.5) { float k = 1. + .14*sin(t*9.); pup = 1. - smoothstep(-aa, aa, sdHeart(iq/(.62*k) + vec2(0., .5))); e = mix(e, vec3(1.,.25,.45), pup); em += vec3(1.,.2,.4)*pup*2.; }
      else if (emo > 3.5 && emo < 4.5) { float a = atan(iq.y, iq.x), f = fract(ir*3. - a/6.2832 + t*1.5); pup = iris * smoothstep(.3,.25,abs(f-.5)); e = mix(e, vec3(.02), pup); }
      else { pup = 1. - smoothstep(pr-aa, pr+aa, ir); e = mix(e, vec3(.005), pup); }
      float gl = 1. - smoothstep(.1, .14, length(q - vec2(-.36, .4))); float gl2 = 1. - smoothstep(.04, .07, length(q - vec2(.3, -.36)));
      e += vec3(1.)*(gl*.9 + gl2*.5); em += vec3(1.)*gl*.6;
      if (emo > 6.5 && emo < 7.5) { float dx = min(sdSeg(q, vec2(-.55,-.55), vec2(.55,.55)), sdSeg(q, vec2(-.55,.55), vec2(.55,-.55))) - .12; float x = 1. - smoothstep(-aa, aa, dx); e = mix(e, vec3(.9,.15,.1), x); em += vec3(1.,.1,.05)*x*1.4*eyeK; }
      if (uRust.y > .5) { float cr = cracks(q, uWear.y + s); float c = 1. - smoothstep(0., .03, cr); e = mix(e, vec3(.7,.75,.8), c*.7); }
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
  em += vec3(1., .78, .45) * flash * .35;
  diffuseColor.rgb = col; roughnessFactor = rough; metalnessFactor = metal; totalEmissiveRadiance = em;
}
`;

let _empty = null;
function emptyTex() { if (!_empty) { _empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); _empty.needsUpdate = true; } return _empty; }
// proto: built proto (robo-cast buildProto); shared: { uBones, uTime }
export function crowdMat(proto, shared) {
  const L = shared.layout || { root: ROOT_T, par: PAR_T };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1, envMapIntensity: 1.0, side: THREE.DoubleSide });
  let decal = null; if (proto.decal) { decal = new THREE.CanvasTexture(proto.decal); decal.colorSpace = THREE.SRGBColorSpace; decal.anisotropy = 4; }
  const f = proto.face;
  const u = {
    uBones: shared.uBones,
    uPal: { value: proto.pal.map((h) => new THREE.Color(h)) }, uWear: { value: new THREE.Vector4(proto.wear ?? 0.5, (proto.spec.seed % 97) * 0.731, 0.6, decal ? 1 : 0) },
    uRust: { value: new THREE.Vector4(proto.rust, proto.broken, proto.oily, 0) },
    uDecal: { value: decal || emptyTex() }, uDecalR: { value: new THREE.Vector4(proto.decalR[0], proto.decalR[1], proto.decalR[2], 1) },
    uFace: { value: new THREE.Vector4(f.mode, f.led || 0, f.mouth || 0, 0) },
    uScr: { value: f.scr ? new THREE.Vector4(...f.scr) : new THREE.Vector4(0, 0, 0.1, 0.45) },
    uLens0: { value: f.lens0 ? new THREE.Vector4(...f.lens0) : new THREE.Vector4(0, 0, 0, 0.05) }, uLens1: { value: f.lens1 ? new THREE.Vector4(...f.lens1) : new THREE.Vector4(0, 0, 0, -1) },
    uEyeCol: { value: new THREE.Color(proto.eye ?? 0x7dffd0) },
  };
  shared.timed.push(u.uRust);
  m.userData.u = u; m.userData.decal = decal;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SKIN_PARS(L.root))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + SKIN_N(L.par))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SKIN_P);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FPARS)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FMAIN)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;');
  };
  m.customProgramCacheKey = () => 'robocrowd1:' + L.root;
  return m;
}
export function crowdDepthMat(shared) {
  const L = shared.layout || { root: ROOT_T, par: PAR_T };
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = shared.uBones;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DEPTH_PARS(L.root)).replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = (rbSkin() * vec4(position, 1.)).xyz;');
  };
  m.customProgramCacheKey = () => 'robocrowddepth1:' + L.root;
  return m;
}
