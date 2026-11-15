// Stylized "clean" material for chibi characters (hand-written; lib/lf/ is generated). Same vertex layout as the
// Lanternfall surface material (aMat = [rough, metal, type, dirt], aRest = bind-pose position, aUv) so a Figure can
// swap it in, and the same uniforms (uDissolve, uDisH, uDisCol, uFlash, uDim, uGlow) so hit flash and the dissolve
// death keep working. Differences: slightly muted albedo (uSat, soft cap on whites) with cloth folds, procedural prints computed
// from the bind-pose position (check, camo, floral, stripes), soft shadow lift ("wrap"), a rim term, and a light
// blood/dirt spatter instead of Lanternfall's mud.
import { THREE } from '../lf-host.js';

// surface types (aMat.z)
export const S_SKIN = 0, S_CLOTH = 1, S_CHECK = 2, S_CAMO = 3, S_METAL = 4, S_PLASTIC = 5, S_RUBBER = 6, S_HAIR = 7,
  S_GLASS = 8, S_DENIM = 9, S_GLOW = 10, S_FLORAL = 11, S_LEATHER = 12, S_WOOD = 13, S_EYE = 14, S_KNIT = 15;

const VPARS = `
attribute vec4 aMat; attribute vec3 aRest; attribute vec2 aUv;
varying vec4 vMat; varying vec3 vRest; varying vec2 vUvS;
`;
const FPARS = `
uniform float uDissolve; uniform float uDisH; uniform vec3 uDisCol; uniform vec3 uFlash; uniform float uDim; uniform float uGlow;
uniform float uRim; uniform float uLift; uniform float uSat;
varying vec4 vMat; varying vec3 vRest; varying vec2 vUvS;
float cbRough, cbMetal; vec3 cbEmis; float cbType;
float ch13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float cn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(ch13(i),ch13(i+vec3(1.,0.,0.)),f.x),mix(ch13(i+vec3(0.,1.,0.)),ch13(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(ch13(i+vec3(0.,0.,1.)),ch13(i+vec3(1.,0.,1.)),f.x),mix(ch13(i+vec3(0.,1.,1.)),ch13(i+vec3(1.,1.,1.)),f.x),f.y),f.z); }
float cfb(vec3 p){ return .5*cn3(p)+.28*cn3(p*2.1+7.1)+.14*cn3(p*4.3+3.3); }
`;
const FMAIN = `
{
  float ty = vMat.z; vec3 col = diffuseColor.rgb; float rough = vMat.x, metal = vMat.y; vec3 em = vec3(0.);
  vec3 rp = vRest; float soft = cn3(rp*5.);
  float dz = (rp.y/uDisH)*.72 + cn3(rp*17.)*.28;
  if (uDissolve > 0.) { float th = uDissolve*1.06; if (dz < th) discard; em += uDisCol * smoothstep(.07, 0., dz-th) * 6.; }
  float dirtK = 1.;
  float fold = cn3(rp*vec3(24.,6.,24.)) * .6 + cn3(rp*vec3(9.,3.,9.)+4.) * .4; // soft cloth folds (vertical-ish wrinkles)
  bool clothy = (ty > .5 && ty < 3.5) || (ty > 8.5 && ty < 9.5) || (ty > 10.5 && ty < 11.5) || ty > 14.5;
  if (clothy) col *= .8 + .32*fold;
  if (ty < .5) { col *= .96 + .08*soft; }
  else if (ty < 1.5) { col *= .95 + .08*soft; }
  else if (ty < 2.5) { // check / plaid: two band sets across the body, dark where they cross, thin light lines
    float u = (rp.x*.8 + rp.z*.6) * 13., v = rp.y * 13.;
    float a = smoothstep(.46,.54, fract(u)), b = smoothstep(.46,.54, fract(v));
    float ln = smoothstep(.06,.0, abs(fract(u*2.)-.5)-.44) + smoothstep(.06,.0, abs(fract(v*2.)-.5)-.44);
    col = col * mix(1.08, .42, a*b) * mix(1., .74, (a+b-2.*a*b)); col = mix(col, vec3(.8), clamp(ln,0.,1.)*.12);
  } else if (ty < 3.5) { // camo: three blob layers
    float n1 = cfb(rp*vec3(5.5,4.,5.5)), n2 = cfb(rp*vec3(7.,5.,7.)+9.), n3v = cfb(rp*9.+21.);
    vec3 dk = col*vec3(.45,.5,.38), lt = col*vec3(1.45,1.38,1.15), xx = col*vec3(.3,.25,.2);
    col = mix(col, lt, smoothstep(.52,.56,n1)); col = mix(col, dk, smoothstep(.55,.59,n2)); col = mix(col, xx, smoothstep(.62,.66,n3v));
  } else if (ty < 4.5) { col *= .9 + .15*soft; }
  else if (ty < 5.5) { col *= .97 + .05*soft; }
  else if (ty < 6.5) { col *= .92 + .1*soft; }
  else if (ty < 7.5) { float s = cn3(rp*vec3(90.,14.,90.)); col *= .82 + .3*s; rough -= .15*s; }
  else if (ty < 8.5) { dirtK = 0.; }
  else if (ty < 9.5) { float s = cn3(rp*vec3(140.,40.,140.)); col *= .9 + .16*s; }
  else if (ty < 10.5) { em += col * vMat.w * uGlow; col *= .2; dirtK = 0.; }
  else if (ty < 11.5) { // floral print: blobs of cream / light
    float f1 = cn3(rp*34.), f2 = cn3(rp*34.+vec3(5.2,1.3,7.7));
    col = mix(col, vec3(.95,.86,.62), smoothstep(.70,.74,f1)); col = mix(col, col*1.9 + .05, smoothstep(.72,.76,f2)*.8);
  } else if (ty < 12.5) { col *= .9 + .14*soft; }
  else if (ty < 13.5) { float gr = cn3(rp*vec3(8.,90.,8.)); col *= .8 + .3*gr; }
  else if (ty < 14.5) { dirtK = 0.; }
  else { float r = abs(sin(rp.y*260.)); col *= .86 + .16*r; }
  if (dirtK > 0. && vMat.w > 0.001 && ty < 9.5 && ty > .5) { // dirt patches and scuffs on clothes
    float bl = smoothstep(.58, .66, cfb(rp*vec3(4.5,3.2,4.5)+11.)) * min(1., vMat.w*2.4);
    col = mix(col, col*vec3(.46,.4,.34) + vec3(.025,.02,.015), bl*.8);
    float sc = smoothstep(.8, .86, cn3(rp*vec3(70.,9.,70.)+2.)) * vMat.w; col = mix(col, col*1.35 + .04, sc*.5);
  }
  if (dirtK > 0. && vMat.w > 0.001 && ty < 9.5) { // blood / dirt spatter, denser near the ground
    float s = cn3(rp*48.)*.62 + cn3(rp*13.+3.)*.38, k = vMat.w * (1. + .6*(1.-smoothstep(0.,.7,rp.y)));
    float sp = smoothstep(1.-.3*k, 1.-.3*k+.035, s);
    col = mix(col, vec3(.16,.012,.01), sp*.85);
    float sm = smoothstep(.6, .67, cfb(rp*vec3(5.,3.5,5.)+31.)) * smoothstep(.28, .6, vMat.w); // soaked blood stains on heavily worn clothes
    col = mix(col, vec3(.2,.018,.012) + col*.08, sm*.78);
    col *= 1. - .18*vMat.w*(1.-smoothstep(0.,.55,rp.y));
  }
  col *= mix(.56, 1., smoothstep(.0, 1.45, rp.y)); // soft ground occlusion: legs a touch darker than the head
  float l = dot(col, vec3(.2126,.7152,.0722)); col = max(vec3(0.), mix(vec3(l), col, uSat));
  if (l > .42) col *= (.42 + (l - .42)*.45) / l; // soft cap on bright albedo: sheet whites read light grey
  diffuseColor.rgb = col * uDim; cbRough = clamp(rough,.05,1.); cbMetal = clamp(metal,0.,1.); cbEmis = em + uFlash; cbType = ty;
}
`;
const FEMIS = `
{
  float fr = 1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.);
  float rim = pow(fr, 3.) * uRim * (cbType > 7.5 && cbType < 8.5 ? .3 : 1.);
  vec3 sss = cbType < .5 ? diffuseColor.rgb * vec3(.16, .05, .025) * (.35 + .65*pow(fr, 1.5)) : vec3(0.); // skin: warm subsurface glow toward the edges
  totalEmissiveRadiance += cbEmis + diffuseColor.rgb * uLift + sss + rim * (diffuseColor.rgb * .7 + vec3(.05));
}
`;

export function makeToonMat(opt) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.3 }, opt || {}));
  m.userData.u = {
    uDissolve: { value: 0 }, uDisH: { value: 1.9 }, uDisCol: { value: new THREE.Color(1, 0.55, 0.2) }, uFlash: { value: new THREE.Color(0, 0, 0) },
    uDim: { value: 1 }, uGlow: { value: 1 }, uRim: { value: 0.3 }, uLift: { value: 0.02 }, uSat: { value: 0.86 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VPARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat=aMat; vRest=aRest; vUvS=aUv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FPARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FMAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cbRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cbMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FEMIS);
  };
  m.customProgramCacheKey = () => 'chibi-toon';
  return m;
}

// swap a Figure's Lanternfall surface material for the clean one (keeps fig.u pointing at the live uniforms)
export function toonify(fig) {
  fig.mat.dispose();
  fig.mat = makeToonMat(); fig.mesh.material = fig.mat; fig.u = fig.mat.userData.u; fig.u.uDisH.value = fig.height;
  return fig;
}
