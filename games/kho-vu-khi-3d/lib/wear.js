// Procedural painted-wear material: MeshStandardMaterial + onBeforeCompile.
// Per-vertex attribute aInfo = (edge 0..1, type, stripe). type: 0 metal, 1 paint/plastic, 2 cloth/tape, 3 wood.
import * as THREE from './three.js';

const NOISE = /* glsl */`
varying vec3 vInfo; varying vec3 vObj; varying vec3 vNrm;
uniform vec3 uSeed; uniform float uRust, uDirt, uChip, uBlood;
float wHash(vec3 p){ p=fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float wNoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(wHash(i),wHash(i+vec3(1,0,0)),f.x),mix(wHash(i+vec3(0,1,0)),wHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(wHash(i+vec3(0,0,1)),wHash(i+vec3(1,0,1)),f.x),mix(wHash(i+vec3(0,1,1)),wHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float wFbm(vec3 p){ return 0.55*wNoise(p)+0.3*wNoise(p*2.1+3.7)+0.15*wNoise(p*4.3+9.1); }
float wSplat(vec3 q,float dens){ vec3 c=floor(q); vec3 f=fract(q); float h=wHash(c+11.3); if(h>dens) return 0.0;
  vec3 ctr=vec3(wHash(c+1.7),wHash(c+5.3),wHash(c+9.1))*0.6+0.2; float r=0.2+0.3*wHash(c+3.3);
  return 1.0-smoothstep(r*0.7,r,length(f-ctr)); }
`;

const FRAG = /* glsl */`
#include <color_fragment>
float gRust=0.0, gBlood=0.0, gChip=0.0, gType=vInfo.y;
{
  vec3 P = vObj*100.0 + uSeed;
  float edge = vInfo.x; float type = vInfo.y; float stripe = vInfo.z;
  vec3 base = diffuseColor.rgb;
  // hazard / warning stripes
  if (stripe > 0.5) {
    float s = step(0.5, fract((P.x + P.y + P.z*0.5) * 0.28));
    base = mix(vec3(0.96,0.72,0.06), vec3(0.06,0.06,0.07), s);
  }
  // dirt: darken recesses/low noise, tint
  float dn = wFbm(P*0.16+7.0);
  float dirt = smoothstep(0.42, 0.78, dn) * uDirt;
  base = mix(base, base*vec3(0.5,0.44,0.38), dirt*0.75);
  // soft painted mottling
  base *= 0.93 + 0.14*wNoise(P*0.9);
  // edge chipping: reveals bright bare steel (or pale wood)
  float cn = wNoise(P*1.4)*0.65 + wNoise(P*3.1)*0.35;
  float chip = edge * smoothstep(1.0-uChip-0.07, 1.0-uChip, cn);
  vec3 bare = (type > 2.5) ? vec3(0.74,0.55,0.34) : vec3(0.7,0.73,0.76);
  if (type < 0.5) base = mix(base, vec3(0.9,0.92,0.95), edge*0.28);   // worn bright edges on steel
  else if (type < 1.5 || type > 2.5) base = mix(base, bare, chip*0.7);
  gChip = chip;
  // rust
  float rn = wFbm(P*0.42+3.0);
  float rmask = (type < 0.5) ? 1.0 : (type < 1.5 ? 0.45 : (type > 2.5 ? 0.15 : 0.0));
  float rust = smoothstep(1.0-uRust*0.8, 1.0-uRust*0.8+0.12, rn*0.75 + edge*0.12 + dirt*0.15 + chip*0.2) * rmask * step(0.01,uRust);
  vec3 rcol = mix(vec3(0.42,0.17,0.06), vec3(0.72,0.36,0.1), wNoise(P*2.6));
  base = mix(base, rcol, rust*0.9);
  gRust = rust;
  // blood splatter
  float bl = max(wSplat(P*vec3(0.42,0.22,0.42), uBlood), wSplat(P*vec3(1.1,0.55,1.1)+17.0, uBlood*0.7));
  bl = max(bl, step(0.0,uBlood)*wSplat(P*vec3(0.7,0.12,0.7)+31.0, uBlood*0.5)*0.9);
  vec3 bcol = mix(vec3(0.5,0.03,0.04), vec3(0.28,0.02,0.03), wNoise(P*1.7));
  base = mix(base, bcol, bl*step(0.001,uBlood));
  gBlood = bl*step(0.001,uBlood);
  // soft top-light / bottom-dark gradient (fake AO), darker in blood-free crevices of bevels
  base *= 0.76 + 0.24 * smoothstep(-0.75, 0.9, normalize(vNrm).y);
  base *= 1.0 - 0.10 * edge * (1.0 - chip);
  diffuseColor.rgb = base;
}
`;

export const TYPE = { METAL: 0, PAINT: 1, CLOTH: 2, WOOD: 3 };

export function makeWearMaterial(p = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 0.5 });
  const u = {
    uSeed: { value: new THREE.Vector3(p.seed * 13.7 % 50 || 0, p.seed * 7.1 % 50 || 0, p.seed * 3.3 % 50 || 0) },
    uRust: { value: p.rust ?? 0.3 }, uDirt: { value: p.dirt ?? 0.3 },
    uChip: { value: p.chip ?? 0.3 }, uBlood: { value: p.blood ?? 0 },
  };
  m.userData.wear = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aInfo; varying vec3 vInfo; varying vec3 vObj; varying vec3 vNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = aInfo; vObj = position; vNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <color_fragment>', FRAG)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        if (gType < 0.5) { metalnessFactor = 0.55*(1.0-gRust)*(1.0-gBlood); roughnessFactor = 0.34 + gRust*0.5 + gBlood*0.2; }
        else if (gType < 1.5) { metalnessFactor = 0.0; roughnessFactor = 0.5 + gRust*0.3; }
        else { metalnessFactor = 0.0; roughnessFactor = 0.88; }
        roughnessFactor = mix(roughnessFactor, 0.25, gBlood*0.6);`);
  };
  m.customProgramCacheKey = () => 'stylized-wear-v1';
  return m;
}
