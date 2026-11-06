// The game's custom Unity shaders, rebuilt on MeshLambertMaterial from the decoded GLSL
// (~/farmland-ref/udk/shaders/<name>/s0.pass0.*.glsl). Lighting stays three.js Lambert; only the albedo differs.
import * as THREE from 'three';

const col = (c, fallback = [1, 1, 1, 1]) => new THREE.Color().setRGB(...(c || fallback).slice(0, 3), THREE.SRGBColorSpace);

function patch(mat, uniforms, vertDecl, vertMain, fragDecl, fragAlbedo) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${vertDecl}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${vertMain}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragDecl}`)
      .replace('#include <map_fragment>', fragAlbedo);
  };
  mat.customProgramCacheKey = () => mat.name + '|' + mat.userData.shader;
  mat.userData.uniforms = uniforms;
  return mat;
}

const WORLD_VARY = ['varying vec3 vWorld;', 'vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'];

// Diffuse - Worldspace Bicolor: albedo = mix(_Color, _Color2, tex(uv * ST).r)
function bicolor(mat, m, tex) {
  const p = m.props;
  const u = { uC1: { value: col(p.colors._Color) }, uC2: { value: col(p.colors._Color2) }, uTex: { value: tex(p.tex._MainTex) },
    uST: { value: new THREE.Vector4(...(m.uvst || [1, 1, 0, 0])) } };
  mat.map = null; mat.color.set(0xffffff);
  return patch(mat, u, 'uniform vec4 uST; varying vec2 vUv2;', 'vUv2 = uv * uST.xy + uST.zw;',
    'uniform vec3 uC1, uC2; uniform sampler2D uTex; varying vec2 vUv2;',
    'diffuseColor.rgb *= mix(uC1, uC2, texture2D(uTex, vUv2).r);');
}

// Diffuse - Worldspace Vertex Color: triplanar on world position, mix(second*_SecondColor, main*_MainColor, vertexColor.r)
function worldVertexColor(mat, m, tex) {
  const p = m.props;
  const u = { uMain: { value: tex(p.tex._MainTex) }, uSecond: { value: tex(p.tex._SecondTex) },
    uMC: { value: col(p.colors._MainColor) }, uSC: { value: col(p.colors._SecondColor) },
    uMS: { value: p.floats._MainScale ?? 1 }, uSS: { value: p.floats._SecondScale ?? 1 } };
  mat.map = null; mat.color.set(0xffffff); mat.vertexColors = false;
  return patch(mat, u, `${WORLD_VARY[0]} varying vec3 vN; varying float vVc; attribute vec4 color;`,
    `${WORLD_VARY[1]} vN = normalize(mat3(modelMatrix) * objectNormal); vVc = color.r;`,
    `${WORLD_VARY[0]} varying vec3 vN; varying float vVc; uniform sampler2D uMain, uSecond; uniform vec3 uMC, uSC; uniform float uMS, uSS;`,
    `vec2 w = abs(vN.x) > 0.5 ? vWorld.yz : abs(vN.z) > 0.5 ? vWorld.xy : vWorld.xz;
     vec3 a = texture2D(uMain, w * uMS).rgb * uMC, b = texture2D(uSecond, w * uSS).rgb * uSC;
     diffuseColor.rgb *= mix(b, a, vVc);`);
}

// LolTap_GroundFakeDepth: colour by world height (foam line, fade to _ClearColor), plus _Emssion self light
function fakeDepth(mat, m) {
  const p = m.props;
  const u = { uMain: { value: col(p.colors._MainColor) }, uFoam: { value: col(p.colors._FoamColor) }, uFoamA: { value: (p.colors._FoamColor || [0, 0, 0, 1])[3] },
    uClear: { value: col(p.colors._ClearColor, [0, 0, 0, 1]) }, uLine: { value: p.floats._FoamLine ?? -1 }, uEnd: { value: p.floats._FoamEnd ?? -2 },
    uEm: { value: p.floats._Emssion ?? 0 } };
  mat.map = null; mat.color.set(0xffffff);
  return patch(mat, u, WORLD_VARY[0], WORLD_VARY[1],
    `${WORLD_VARY[0]} uniform vec3 uMain, uFoam, uClear; uniform float uFoamA, uLine, uEnd, uEm;`,
    `float d = vWorld.y - uLine;
     float t1 = smoothstep(0.0, 1.0, clamp(d / uEnd, 0.0, 1.0));
     float t2 = smoothstep(0.0, 1.0, clamp(d * -10.0, 0.0, 1.0)) * uFoamA;
     vec3 c = mix(mix(uMain, uFoam, t2), uClear, t1);
     diffuseColor.rgb *= c; totalEmissiveRadiance += c * uEm;`);
}

// Diffuse - Worldspace - MaterialProperty (field soil): normal map sampled at (world.xz + uv) * _Scale, colour from the
// per-cell MaterialPropertyBlock (wet/dry), so mat.color stays the live colour.
function worldNormal(mat, m, tex) {
  const p = m.props;
  if (!p.tex._MainNormal) return mat;
  mat.normalMap = tex(p.tex._MainNormal);
  mat.normalMap.colorSpace = THREE.NoColorSpace;
  const u = { uScale: { value: p.floats._Scale ?? 1 } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uScale;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 wp = modelMatrix * vec4(transformed, 1.0); vNormalMapUv = (vec2(wp.x, -wp.z) + uv) * uScale; }`);
  };
  mat.customProgramCacheKey = () => 'worldNormal';
  return mat;
}

export function customMaterial(mat, m, tex) {
  mat.userData.shader = m.shader;
  switch (m.shader) {
    case 'Diffuse - Worldspace Bicolor': bicolor(mat, m, tex); break;
    case 'Diffuse - Worldspace Vertex Color': worldVertexColor(mat, m, tex); break;
    case 'LolTap_GroundFakeDepth': fakeDepth(mat, m); break;
    case 'Diffuse - Worldspace - MaterialProperty': worldNormal(mat, m, tex); break;
    default: break;
  }
  return mat;
}
