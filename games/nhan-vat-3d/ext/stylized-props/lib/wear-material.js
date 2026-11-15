// One "painted wear" material for every prop. MeshStandardMaterial + onBeforeCompile.
// Per-vertex attributes written by Prop (lib/prop.js):
//   color   (vec3) base paint colour (linear)
//   aCol2   (vec4) xyz second colour (stripes/stains/decals), w = pattern id + fract(width)
//   aUnder  (vec4) xyz colour revealed under chipped paint, w = roughness
//   aMat    (vec4) chip, rust, dirt, splatter amounts (0..1)
//   aLoc    (vec4) piece-local position, w = kind*2 + metalness (kind 0 box, 1 cyl, 2 generic)
//   aHalf   (vec4) xyz half extents (generic: x = crease weight), w = seed
// Pattern ids: 0 none, 1 diagonal stripes, 2 horizontal bands, 3 stains/blotches,
//              4 grid lines, 5 soft mottling, 6 vertical stripes, 7 chevrons
import * as THREE from '../vendor/three.module.min.js';

export const wearUniforms = {
  uChip: { value: 1 }, uRust: { value: 1 }, uDirt: { value: 1 }, uSplat: { value: 1 },
  uChipWidth: { value: 0.08 }, uDirtHeight: { value: 0.35 },
  uRustA: { value: new THREE.Color('#5e2e1a') },
  uRustB: { value: new THREE.Color('#8f4f2a') },
  uDirtCol: { value: new THREE.Color('#4a3f33') },
  uBlood: { value: new THREE.Color('#b3141c') },
};

const NOISE = /* glsl */`
float spH(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float spN(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(spH(i),spH(i+vec3(1,0,0)),f.x),mix(spH(i+vec3(0,1,0)),spH(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(spH(i+vec3(0,0,1)),spH(i+vec3(1,0,1)),f.x),mix(spH(i+vec3(0,1,1)),spH(i+vec3(1,1,1)),f.x),f.y),f.z); }
float spF(vec3 p){ float a=0.5, s=0.0;
  for(int i=0;i<SP_OCT;i++){ s+=a*spN(p); p=p*2.03+vec3(1.7,9.2,3.3); a*=0.5; }
  return s/(1.0-pow(0.5,float(SP_OCT))); }
`;

export function createWearMaterial({ quality = 1, ...params } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, ...params });
  m.defines = { SP_OCT: quality > 0 ? 3 : 1 };
  m.customProgramCacheKey = () => 'spwear' + m.defines.SP_OCT;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wearUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aCol2; attribute vec4 aUnder; attribute vec4 aMat; attribute vec4 aLoc; attribute vec4 aHalf;
varying vec4 vCol2; varying vec4 vUnder; varying vec4 vMat; varying vec4 vLoc; varying vec4 vHalf; varying vec3 vWPos; varying float vSeed; varying float vObjY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vObjY = transformed.y; vCol2=aCol2; vUnder=aUnder; vMat=aMat; vLoc=aLoc; vHalf=aHalf; vSeed=aHalf.w;
vec4 spW = vec4(transformed,1.0);
#ifdef USE_INSTANCING
spW = instanceMatrix*spW; vSeed += dot(instanceMatrix[3].xyz, vec3(1.71,3.13,5.37));
#endif
spW = modelMatrix*spW; vWPos = spW.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uChip, uRust, uDirt, uSplat, uChipWidth, uDirtHeight;
uniform vec3 uRustA, uRustB, uDirtCol, uBlood;
varying vec4 vCol2; varying vec4 vUnder; varying vec4 vMat; varying vec4 vLoc; varying vec4 vHalf; varying vec3 vWPos; varying float vSeed; varying float vObjY;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 sp = vLoc.xyz + vec3(vSeed*7.31, vSeed*3.17, vSeed*5.93);
float kind = floor(vLoc.w*0.5+0.001);
float spMetal = vLoc.w - kind*2.0;
float spRough = vUnder.w;
// distance to nearest edge (metres)
float eDist;
if (kind < 0.5) { vec3 q = max(vHalf.xyz - abs(vLoc.xyz), 0.0);
  float mn=min(q.x,min(q.y,q.z)), mx=max(q.x,max(q.y,q.z)); eDist = q.x+q.y+q.z-mn-mx; }
else if (kind < 1.5) { float qr = max(vHalf.x - length(vLoc.xz), 0.0); float qy = max(vHalf.y - abs(vLoc.y), 0.0); eDist = max(qr, qy); }
else { eDist = (1.0 - clamp(vHalf.x,0.0,1.0)) * 0.08 + 0.004; }
// pattern
float pid = floor(vCol2.w + 0.001); float pw = max(fract(vCol2.w), 0.02) * 1.0;
float pm = 0.0;
if (pid > 0.5 && pid < 1.5) pm = step(0.5, fract((vLoc.x + vLoc.y + vLoc.z) / (pw*2.0)));
else if (pid < 2.5 && pid > 1.5) pm = step(0.5, fract(vLoc.y / (pw*2.0)));
else if (pid < 3.5 && pid > 2.5) pm = smoothstep(0.56, 0.6, spF(sp / max(pw, 0.05)));
else if (pid < 4.5 && pid > 3.5) { vec2 g = abs(fract(vLoc.xz / pw) - 0.5); pm = smoothstep(0.44, 0.48, max(g.x, g.y)); }
else if (pid < 5.5 && pid > 4.5) pm = smoothstep(0.35, 0.75, spF(sp / max(pw,0.05)));
else if (pid < 6.5 && pid > 5.5) pm = step(0.5, fract(vLoc.x / (pw*2.0)));
else if (pid < 7.5 && pid > 6.5) pm = step(0.5, fract((abs(vLoc.x) + vLoc.y) / (pw*2.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, vCol2.rgb, pm);
// edge chipping (paint off -> under colour) + scattered chips
float nChip = spF(sp * 9.0);
float chipAmt = vMat.x * uChip;
float chipEdge = 1.0 - smoothstep(0.0, uChipWidth * chipAmt * (0.25 + 1.6*nChip) + 1e-4, eDist);
float chipSpot = smoothstep(0.74, 0.77, spF(sp * 3.1 + 11.0) + chipAmt*0.12) * step(0.15, chipAmt);
float chip = clamp(max(chipEdge * step(0.36, nChip + chipAmt*0.3), chipSpot), 0.0, 1.0) * step(0.01, chipAmt);
vec3 rim = diffuseColor.rgb * 0.72;
float rimM = clamp((1.0 - smoothstep(0.0, uChipWidth * chipAmt * (0.4 + 1.6*nChip) + 1e-4, eDist)) * step(0.36, nChip + chipAmt*0.25) - chip, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, rim, rimM * 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, vUnder.rgb, chip);
// rust: blotches + bias to chips and to the bottom
float rustAmt = vMat.y * uRust;
float nR = spF(sp * vec3(3.0, 1.4, 3.0) + 5.0);
float lowB = 1.0 - smoothstep(0.0, 0.5, vObjY);
float rust = smoothstep(0.70, 0.76, nR + rustAmt*0.22 + lowB*0.10*rustAmt) * step(0.01, rustAmt);
rust = max(rust, chip * smoothstep(0.45, 0.8, rustAmt + nChip*0.25));
vec3 rustCol = mix(uRustA, uRustB, spN(sp * 18.0));
diffuseColor.rgb = mix(diffuseColor.rgb, rustCol, rust * 0.9);
// dirt gradient from the ground up
float propH = max(floor(vMat.z), 1.0) * 0.05;
float dirtAmt = clamp((fract(vMat.z) - 0.05) / 0.9, 0.0, 1.0) * uDirt;
float dirtH = min(uDirtHeight, propH * 0.35);
float dirt = (1.0 - smoothstep(0.0, dirtH, vObjY + (spF(sp*2.3)-0.5)*dirtH*0.5)) * dirtAmt * 0.8;
dirt += smoothstep(0.66, 0.69, spF(sp*1.6+31.0)) * dirtAmt * 0.45;
diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.55, uDirtCol, 0.35), clamp(dirt, 0.0, 0.8));
// blood / paint splatter
float splSc = max(floor(vMat.w), 1.0) * 0.1;
float splAmt = clamp((fract(vMat.w) - 0.05) / 0.9, 0.0, 1.0) * uSplat;
float nS = spF(sp * 4.0 / splSc + 77.0) + spN(sp * 22.0 / splSc) * 0.18;
float spl = smoothstep(0.76 - splAmt*0.16, 0.79 - splAmt*0.16, nS) * step(0.01, splAmt);
// splatter gathers in a few clusters and mostly on the lower part of the prop (bumpers, sills, lower doors)
float splClus = smoothstep(0.52, 0.66, spF(sp * 0.45 + 13.0));
float splLow = 1.0 - smoothstep(propH * 0.2, propH * 0.65, vObjY);
spl *= splClus * mix(0.2, 1.0, splLow);
diffuseColor.rgb = mix(diffuseColor.rgb, uBlood * (0.8 + 0.4*spN(sp*40.0)), spl);
`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(spRough, spRough*0.75, chip); roughnessFactor = mix(roughnessFactor, 0.95, max(rust, dirt*0.6)); roughnessFactor = mix(roughnessFactor, 0.35, spl);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(spMetal, max(spMetal, 0.55) * step(0.5, spMetal + 0.6), chip); metalnessFactor *= (1.0 - rust);`);
  };
  return m;
}

// Glow (lamp heads, light bars, tail lights) and glass share simple materials.
export function createGlowMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0, toneMapped: true,
    onBeforeCompile: (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= diffuseColor.rgb;'); } });
}
export function createGlassMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
}
