// Material factory: MeshStandardMaterial patched for triplanar baked PBR, world macro variation,
// rain wetness (up faces glossy, verticals streaked, puddles with ripples), paint tint, gun droplets,
// and a reflectivity mask written to alpha for the SSR pass.
import * as THREE from '../vendor/three.module.min.js';
import { NOISE, RIPPLES } from './glsl.js';

export const U = {
  uTime: { value: 0 }, uRain: { value: 1 }, uGunWet: { value: 0 }, uFlash: { value: 0 },
  uFlood: { value: new THREE.Vector4(-28, -112, 14, -66) },
  uIndoor: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uIndoorH: { value: [0, 0, 0, 0] },
};

const cache = new Map();
let baker = null;
export function setBaker(b) { baker = b; }

const FRAG_HEAD = /* glsl */`
uniform float uTime, uRain, uGunWet; uniform vec4 uFlood; uniform vec4 uIndoor[4]; uniform float uIndoorH[4];
uniform sampler2D tAlb, tOrm, tNrm;
uniform vec3 uPaint;
uniform float uScale, uNScale, uMacro, uWetK, uPuddle, uDrops, uRoughK, uMetalK, uAOK, uWetR, uGrime;
uniform vec4 uWetP;
varying vec3 vTP; varying vec3 vTN; varying vec3 vWP; varying vec3 vWN;
${NOISE}
${RIPPLES}
vec3 triW(vec3 n){ vec3 w=pow(abs(n),vec3(4.)); return w/(w.x+w.y+w.z+1e-5); }
`;

const VERT_HEAD = /* glsl */`
varying vec3 vTP; varying vec3 vTN; varying vec3 vWP; varying vec3 vWN;
`;

function patch(shader, o) {
  Object.assign(shader.uniforms, {
    uTime: U.uTime, uRain: U.uRain, uGunWet: U.uGunWet, uFlood: U.uFlood, uIndoor: U.uIndoor, uIndoorH: U.uIndoorH,
    tAlb: { value: o.set.albedo }, tOrm: { value: o.set.orm }, tNrm: { value: o.set.normal },
    uPaint: { value: new THREE.Color(o.paint ?? 0xffffff) },
    uScale: { value: o.scale ?? 0.5 }, uNScale: { value: o.nscale ?? 1 }, uMacro: { value: o.macro ?? 0.25 },
    uWetK: { value: o.wet === false ? 0 : (o.wetK ?? 1) }, uPuddle: { value: o.puddles === 'flood' ? 0.75 : o.puddles ? 1 : 0 }, uDrops: { value: o.drops ? 1 : 0 },
    uWetP: { value: wetParams(o) }, uGrime: { value: o.grime ?? (BIG.has(o.surf) ? 0.35 : 0.2) },
    uRoughK: { value: o.roughK ?? 1 }, uMetalK: { value: o.metalK ?? 1 }, uAOK: { value: o.aoK ?? 1 }, uWetR: { value: o.wetRough ?? 0.16 },
  });
  const objectSpace = o.space === 'object';
  shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <worldpos_vertex>', `
    #include <worldpos_vertex>
    {
      vec4 tp = vec4(transformed,1.0);
      vec3 tn = objectNormal;
      #ifdef USE_INSTANCING
        tp = instanceMatrix * tp; tn = mat3(instanceMatrix) * tn;
      #endif
      vec4 wp4 = modelMatrix * tp;
      vWP = wp4.xyz; vWN = normalize(mat3(modelMatrix) * tn);
      ${objectSpace ? 'vTP = tp.xyz; vTN = normalize(tn);' : 'vTP = wp4.xyz; vTN = vWN;'}
    }`);
  // Material-level code runs after <map_fragment>; we keep shared state in locals declared up front.
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
    .replace('#include <map_fragment>', `
      vec3 N0 = normalize(vTN);
      vec3 tw = triW(N0);
      vec3 P = vTP * uScale;
      vec4 aX = texture2D(tAlb, P.zy), aY = texture2D(tAlb, P.xz), aZ = texture2D(tAlb, P.xy);
      vec4 alb = aX*tw.x + aY*tw.y + aZ*tw.z;
      vec4 oX = texture2D(tOrm, P.zy), oY = texture2D(tOrm, P.xz), oZ = texture2D(tOrm, P.xy);
      vec3 orm = (oX*tw.x + oY*tw.y + oZ*tw.z).rgb;
      vec3 WN = normalize(vWN);
      float macro = fbm3(vWP*0.13);
      float macro2 = vn(vWP.xz*0.6+vWP.y*0.3);
      vec3 col = alb.rgb * mix(vec3(1.0), uPaint, alb.a);
      col *= mix(1.0, 0.72 + 0.56*macro, uMacro);
      // wetness: Saltline mats.md §3.4. uWetP = (darken, roughMul, vertWet, bead)
      float indoor = 0.0;
      for (int i = 0; i < 4; i++) {
        vec4 z = uIndoor[i];
        vec2 dd = abs(vWP.xz - z.xy) - z.zw;
        indoor = max(indoor, smoothstep(1.5, -2.5, max(dd.x, dd.y)) * step(vWP.y, uIndoorH[i] - 0.3));
      }
      float up = smoothstep(0.15, 0.85, WN.y);
      float expo = smoothstep(-0.4, -0.05, WN.y);
      float sc = vWP.x + vWP.z;
      float streak = smoothstep(0.12, 0.42, vn3(vec3(sc*9.0, vWP.y*0.55, sc*0.7+3.0)) * vn3(vec3(sc*29.0, vWP.y*1.1, 7.0))) * smoothstep(0.3, 0.7, vn3(vec3(sc*1.1, vWP.y*0.25, 1.7)));
      float slW = uRain * uWetK * mix(1.0, 0.12, indoor) * expo;
      float wet = slW * mix(uWetP.z * (0.55 + 0.9*streak), 0.75 + 0.5*macro, up);
      float low = smoothstep(0.5, 0.0, vWP.y) * (1.0 - up) * expo;
      wet += slW * low * 0.6;
      col *= 1.0 - low * min(uGrime, 0.5) * 0.45;
      float grime = smoothstep(0.5, 0.85, macro*0.6 + macro2*0.4 + (1.0 - orm.r)*0.3) * uGrime;
      col *= 1.0 - grime * 0.35;
      wet = clamp(wet, 0.0, 1.0);
      float beadN = vn3(vWP*170.0)*0.6 + vn3(vWP*410.0 + 5.0)*0.4;
      float beadF = clamp(1.0 - length(fwidth(vWP))*120.0, 0.0, 1.0);
      float bead = smoothstep(0.6, 0.68, beadN) * uWetP.w * slW * beadF * (0.4 + 0.6*up + 0.5*streak);
      float puddle = 0.0;
      if (uPuddle > 0.5) {
        float pm = fbm2(vWP.xz*0.11 + 3.7) * 0.75 + fbm2(vWP.xz*0.45)*0.35;
        vec2 fd = max(uFlood.xy - vWP.xz, vWP.xz - uFlood.zw);
        float flood = smoothstep(6.0, -4.0, max(fd.x, fd.y) + (fbm2(vWP.xz*0.08)-0.5)*14.0);
        pm += flood * 0.45;
        if (uPuddle < 0.9) pm = mix(0.0, pm, flood);
        puddle = smoothstep(0.58, 0.64, pm) * up * uRain;
        wet = max(wet, smoothstep(0.48, 0.58, pm) * up * uRain);
      }
      // gun droplets: beads that sit, rivulets that crawl down in object space
      float drop = 0.0; vec2 dropN = vec2(0.0);
      if (uDrops > 0.5 && uGunWet > 0.01) {
        vec2 q = vec2(vTP.x*140.0 + vTP.z*83.0, vTP.y*140.0);
        vec2 cell = floor(q); vec2 f = fract(q) - 0.5;
        float rnd = h12(cell); vec2 jit = (h22(cell) - 0.5) * 0.5;
        float rad = 0.12 + 0.18 * h12(cell + 4.7);
        float topFace = 0.35 + 0.65 * smoothstep(-0.2, 0.8, WN.y);
        float bead = smoothstep(rad, rad * 0.35, length((f - jit) * vec2(1.0, 0.8))) * step(1.0 - 0.22 * topFace, rnd);
        float col2 = floor(vTP.x*160.0 + vTP.z*90.0);
        float lane = h12(vec2(col2, 3.1));
        float yy = vTP.y*14.0 + uTime*(0.12 + lane*0.3) + lane*10.0;
        float riv = smoothstep(0.82, 0.98, fract(yy)) * step(0.96, lane) * smoothstep(0.5, 0.15, abs(fract(vTP.x*160.0+vTP.z*90.0)-0.5)) * (1.0 - topFace * 0.5);
        drop = max(bead, riv * 0.8) * uGunWet;
        dropN = (f - jit) / max(rad, 0.01) * bead * 0.9 * uGunWet;
        wet = max(wet, uGunWet*0.35);
      }
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.0 + 0.25*wet*uWetP.x*2.0);
      col *= (1.0 - uWetP.x * wet) * mix(1.0, 0.45, puddle);
      diffuseColor.rgb *= col;
    `)
    .replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = clamp(orm.g * roughness * uRoughK, 0.02, 1.0);
      roughnessFactor = mix(roughnessFactor, roughnessFactor * uWetP.y, wet);
      roughnessFactor = clamp(mix(roughnessFactor, 0.05, bead), 0.045, 1.0);
      roughnessFactor = mix(roughnessFactor, 0.06, drop);
      roughnessFactor = mix(roughnessFactor, 0.03, puddle);
    `)
    .replace('#include <metalnessmap_fragment>', `
      float metalnessFactor = clamp(orm.b * metalness * uMetalK, 0.0, 1.0) * (1.0 - puddle);
    `)
    .replace('#include <normal_fragment_maps>', `
      {
        vec3 nX = texture2D(tNrm, P.zy).xyz*2.0-1.0, nY = texture2D(tNrm, P.xz).xyz*2.0-1.0, nZ = texture2D(tNrm, P.xy).xyz*2.0-1.0;
        float ns = uNScale * (1.0 - puddle * 0.9) * (1.0 - 0.45 * wet * up);
        nX.xy *= ns; nY.xy *= ns; nZ.xy *= ns;
        nX = vec3(nX.xy + N0.zy, abs(nX.z) * N0.x);
        nY = vec3(nY.xy + N0.xz, abs(nY.z) * N0.y);
        nZ = vec3(nZ.xy + N0.xy, abs(nZ.z) * N0.z);
        vec3 tnw = normalize(nX.zyx*tw.x + nY.xzy*tw.y + nZ.xyz*tw.z);
        ${objectSpace ? 'tnw = normalize(mat3(modelMatrix) * tnw);' : ''}
        if (puddle > 0.01) {
          vec2 rp = rainRipple(vWP.xz*3.2, uTime*1.3) * uRain;
          tnw = normalize(mix(tnw, WN, puddle * 0.85) + vec3(rp.x, 0.0, rp.y) * puddle * 0.35 * up);
        }
        if (drop > 0.0) tnw = normalize(tnw + (mat3(modelMatrix) * vec3(dropN.x, dropN.y, 0.0)));
        normal = normalize((viewMatrix * vec4(tnw, 0.0)).xyz);
      }
    `)
    .replace('#include <aomap_fragment>', `
      {
        float aoT = mix(1.0, orm.r, uAOK);
        reflectedLight.indirectDiffuse *= aoT * mix(1.0, 0.16, indoor);
        reflectedLight.indirectSpecular *= mix(1.0, aoT, 0.7) * mix(1.0, 0.3, indoor);
      }
    `)
    .replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      gl_FragColor.a = ${objectSpace ? '0.0' : 'clamp(puddle * 0.9 + wet*0.1*up, 0.0, 1.0)'};
    `);
  shader.fragmentShader = 'uniform mat4 modelMatrix;\n' + shader.fragmentShader;
}

// per-surface wet response (darken, roughMul, vertWet, bead), Saltline mats.md §4
const WET = {
  concrete: [0.42, 0.38, 0.5, 0], plasterBlock: [0.42, 0.38, 0.5, 0], brick: [0.42, 0.38, 0.5, 0], ballast: [0.42, 0.38, 0.5, 0],
  asphalt: [0.45, 0.3, 0.5, 0], wood: [0.4, 0.5, 0.6, 0], rust: [0.3, 0.6, 0.55, 0],
  paintedMetal: [0.05, 0.62, 0.65, 0.7], corrugated: [0, 0.7, 0.55, 0.5], steel: [0, 0.7, 0.55, 0.5],
  polymer: [0.08, 0.62, 0.6, 0.5], anodized: [0, 0.75, 0.6, 0.5], phosphate: [0, 0.75, 0.6, 0.5],
  fabric: [0.3, 0.7, 0.6, 0], camoWood: [0.3, 0.7, 0.6, 0], camoDesert: [0.3, 0.7, 0.6, 0], denim: [0.3, 0.7, 0.6, 0], leather: [0.1, 0.6, 0.6, 0.3], skin: [0.05, 0.6, 0.4, 0],
};
const BIG = new Set(['concrete', 'asphalt', 'ballast', 'plasterBlock']);
function wetParams(o) { const w = o.wetP || WET[o.surf] || [0, 0.7, 0.55, 0.5]; return new THREE.Vector4(w[0], w[1], w[2], w[3]); }

// o: { surf, paint, scale, nscale, rough, metal, wet, puddles, drops, space, macro, emissive, side }
export function mat(o) {
  const key = JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const set = baker.bake(o.surf);
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: o.rough ?? 1, metalness: o.metal ?? 1,
    envMapIntensity: o.env ?? 1, side: o.side ?? THREE.FrontSide,
  });
  if (o.color !== undefined) m.color.set(o.color);
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  const oo = Object.assign({}, o, { set });
  m.onBeforeCompile = (sh) => patch(sh, oo);
  m.customProgramCacheKey = () => 'gc:' + (o.space || 'w') + (o.drops ? 'd' : '') + (o.puddles ? 'p' : '');
  m.userData.opts = o;
  m.defines = {};
  cache.set(key, m);
  return m;
}

// Additive / transparent effects must not overwrite the reflectivity mask in alpha.
export function keepAlpha(m) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = m.userData.premul ? THREE.OneFactor : THREE.SrcAlphaFactor;
  m.blendDst = m.userData.additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

// Plain three.js materials (glass, emissive, decals) must write 0 to the reflectivity mask.
export function noMask(m, extra) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a = ' + (extra || '0.0') + ';');
  };
  m.customProgramCacheKey = () => 'nomask' + (extra || '');
  return m;
}
