// Voxel character material: MeshStandardMaterial (so the studio lights, environment and shadows apply) whose vertex
// stage moves each vertex by its bone's 3x4 matrix (uniform array uB, 3 vec4 rows per bone, aBone per vertex) and whose
// fragment stage adds the voxel-lab look: a bevel line on every voxel edge, a lit upper edge on side faces, a colour
// jitter per voxel (all from the bind-pose voxel coordinate, so the pattern rides the part), glowing voxels, hit flash
// and a voxel-by-voxel dissolve for the death clip. One program for every character (per-material uniforms).
import { THREE } from '../lib/lf-host.js';

const VHEAD = (maxB) => `
#define VOX_MAXB ${maxB}
attribute float aBone; attribute float aEmis; attribute vec3 aLat; uniform vec4 uB[VOX_MAXB * 3]; uniform float uZBias;
varying vec3 vVoxP; varying vec3 vVoxN; varying float vEmis; varying vec3 vLat;`;
const VNORM = `
  int vb = int(aBone + 0.5) * 3; vec4 vr0 = uB[vb], vr1 = uB[vb + 1], vr2 = uB[vb + 2];
  vec3 objectNormal = normalize(vec3(dot(vr0.xyz, normal), dot(vr1.xyz, normal), dot(vr2.xyz, normal)));
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
  #endif`;
const VBEGIN = `
  vec3 transformed = vec3(dot(vr0.xyz, position) + vr0.w, dot(vr1.xyz, position) + vr1.w, dot(vr2.xyz, position) + vr2.w);
  vVoxP = position; vVoxN = normal; vEmis = aEmis; vLat = aLat;
  #ifdef USE_ALPHAHASH
  vPosition = vec3(position);
  #endif`;
const FHEAD = `
uniform float uVox, uBevel, uJit, uGlow, uDissolve, uDisH, uDetail; uniform vec3 uFlash, uDisCol;
varying vec3 vVoxP; varying vec3 vVoxN; varying float vEmis; varying vec3 vLat;
float vxHash(vec3 c){ return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`;
const FCOLOR = `
  vec3 vxEm = vec3(0.);
  {
    vec3 vp = vLat; vec3 an = abs(vVoxN);
    vec3 cell = floor(vp - vVoxN * 0.5);
    vec2 f = an.x > 0.5 ? fract(vp.zy) : an.y > 0.5 ? fract(vp.xz) : fract(vp.xy);
    float fw = fwidth(vp.x) + fwidth(vp.y) + fwidth(vp.z);
    float hj = vxHash(cell);
    if (uDissolve > 0.) { // voxel by voxel, bottom first, with a glowing rim on the voxels about to go
      float dz = (vVoxP.y / uDisH) * 0.72 + hj * 0.28, th = uDissolve * 1.06;
      if (dz < th) discard;
      vxEm += uDisCol * smoothstep(0.07, 0., dz - th) * 5.;
    }
    float near = clamp(1.0 - fw * 1.4, 0.0, 1.0) * uDetail;
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float rim = (1.0 - smoothstep(0.0, uBevel + fw * 0.5, e)) * near;
    float top = an.y > 0.5 ? 0.0 : smoothstep(1.0 - uBevel * 1.6, 1.0, f.y) * near;
    float up = vVoxN.y > 0.5 ? 1.06 : 1.0; // tops of steps catch a little more light, like the voxel lab
    diffuseColor.rgb *= (1.0 + (hj - 0.5) * uJit) * (1.0 - 0.32 * rim * (1.0 - vEmis)) * (1.0 + 0.22 * top) * up;
    vxEm += diffuseColor.rgb * vEmis * uGlow + uFlash;
  }`;

export function makeVoxMaterial(o = {}) {
  const maxB = o.maxBones || 32;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness === undefined ? 0.82 : o.roughness, metalness: 0, envMapIntensity: o.env === undefined ? 0.35 : o.env });
  const u = m.userData.u = {
    uB: { value: new Float32Array(maxB * 12) }, uZBias: { value: 0 },
    uVox: { value: o.size || 0.05 }, uBevel: { value: o.bevel === undefined ? 0.1 : o.bevel }, uJit: { value: o.jitter === undefined ? 0.14 : o.jitter },
    uGlow: { value: o.glow === undefined ? 1.6 : o.glow }, uDissolve: { value: 0 }, uDisH: { value: 1.9 }, uDisCol: { value: new THREE.Color(1, 0.55, 0.2) },
    uFlash: { value: new THREE.Color(0, 0, 0) }, uDetail: { value: 1 },
  };
  // identity for every bone until the first pose arrives
  for (let b = 0; b < maxB; b++) { u.uB.value[b * 12] = 1; u.uB.value[b * 12 + 5] = 1; u.uB.value[b * 12 + 10] = 1; }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VHEAD(maxB))
      .replace('#include <beginnormal_vertex>', VNORM)
      .replace('#include <begin_vertex>', VBEGIN)
      // parts that overlap in the bind pose (a joint's shared voxels) never z-fight: higher bone ids win by a hair
      .replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.z -= aBone * uZBias * gl_Position.w;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FHEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FCOLOR)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vxEm;');
  };
  m.customProgramCacheKey = () => 'voxchar' + maxB;
  u.uZBias.value = o.zbias === undefined ? 2e-6 : o.zbias;
  return m;
}

// depth material for shadow maps, sharing the bone uniforms of a voxel material
export function makeVoxDepth(mat, maxB = 32) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const u = mat.userData.u;
  d.onBeforeCompile = (sh) => {
    sh.uniforms.uB = u.uB;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n#define VOX_MAXB ${maxB}\nattribute float aBone; uniform vec4 uB[VOX_MAXB * 3];`)
      .replace('#include <begin_vertex>', 'int vb = int(aBone + 0.5) * 3; vec4 vr0 = uB[vb], vr1 = uB[vb + 1], vr2 = uB[vb + 2];\nvec3 transformed = vec3(dot(vr0.xyz, position) + vr0.w, dot(vr1.xyz, position) + vr1.w, dot(vr2.xyz, position) + vr2.w);');
  };
  d.customProgramCacheKey = () => 'voxdepth' + maxB;
  return d;
}
