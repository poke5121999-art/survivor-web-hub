// Ports of the game's own shaders (D:/catsoup-ref/shaders/*.glsl, GLES3 programs lifted from the Shader blobs).
// The project renders in gamma space: textures are sampled raw and the canvas takes the result unconverted, so the
// numbers below are the original ones (ambient x2, rim 0.1..0.7) with no colour-space fix-ups.
import * as THREE from 'three';

const loader = new THREE.ImageLoader();
const texCache = new Map();

// glstate_lightmodel_ambient (RenderSettings.ambientLight). Shared uniform object, so day/night changes reach every
// material at once.
export const env = { ambient: { value: new THREE.Vector4(0.5, 0.5, 0.5, 1) } };

// Every texture starts as its 16 px .lq.webp and swaps to the full image when it arrives (casual-farm/toon.js).
export function texture(base, name) {
  if (texCache.has(name)) return texCache.get(name);
  const t = new THREE.Texture();
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  const entry = { tex: t, full: null, sharp: false };
  loader.load(`${base}/${name}.lq.webp`, img => {
    if (entry.sharp) return;
    t.image = img;
    t.needsUpdate = true;
  });
  entry.full = new Promise(resolve => {
    loader.load(`${base}/${name}.webp`, img => {
      entry.sharp = true;
      t.dispose();
      t.image = img;
      t.needsUpdate = true;
      resolve();
    }, undefined, () => resolve());
  });
  texCache.set(name, entry);
  return entry;
}

const SKIN_PARS = '#include <common>\n#include <skinning_pars_vertex>\n';
const SKIN_BODY = `
  vec3 objectNormal = normal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
`;

// Custom/OutlineLight "OBJECT" pass: palette texture x (ambient x2 blend) plus a rim term on the side facing away from
// _LightFromX, computed per vertex from the view-space normal.
const outlineLightVert = SKIN_PARS + `
  uniform float lightFromX;
  uniform float ambientFactor;
  uniform vec4 ambient;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    ${SKIN_BODY}
    vUv = uv;
    vec3 n = normalize((viewMatrix * vec4(normalize(mat3(modelMatrix) * objectNormal), 0.0)).xyz);
    float r = clamp((n.x - n.y) * 3.0 - 2.5, 0.1, 0.7);
    r = position.x < lightFromX ? r : 0.0;
    float k = max(1.0 - (dot(ambient.xx, vec2(ambientFactor)) + (1.0 - ambientFactor) + 0.1), 0.0);
    vRim = k * r;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }`;
const outlineLightFrag = `
  uniform sampler2D map;
  uniform vec4 color;
  uniform vec4 ambient;
  uniform float ambientFactor;
  uniform float alpha;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    vec4 a = ambient * ambientFactor * 2.0 + vec4(1.0 - ambientFactor);
    vec4 c = texture2D(map, vUv) * a + vRim * color;
    gl_FragColor = vec4(c.rgb, c.a * alpha);
  }`;

// "OUTLINE" pass: inverted hull, normal x _OutlineWidth x vertex colour alpha, Cull Front.
const outlineVert = SKIN_PARS + `
  uniform float width;
  attribute vec4 color;
  uniform bool hasColor;
  void main() {
    ${SKIN_BODY}
    float a = hasColor ? color.a : 1.0;
    vec3 p = transformed + normalize(objectNormal) * width * a;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const outlineFrag = `
  uniform vec4 color;
  uniform vec4 ambient;
  uniform float ambientFactor;
  void main() {
    vec4 a = ambient * ambientFactor * 2.0 + vec4(1.0 - ambientFactor);
    gl_FragColor = vec4((a * color).rgb, 1.0);
  }`;

// Custom/SpritesDefaultModded: premultiplied, ambient x2 only when _AmbientFactor > 0.5.
const spriteVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }`;
const spriteFrag = `
  uniform sampler2D map;
  uniform vec4 color;
  uniform vec4 ambient;
  uniform float ambientFactor;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv) * color;
    c.rgb *= c.a;
    gl_FragColor = ambientFactor > 0.5 ? c * ambient * 2.0 : c;
  }`;

const v4 = (a, d = [1, 1, 1, 1]) => new THREE.Vector4(...(a || d));
const BLEND = [THREE.ZeroFactor, THREE.OneFactor, THREE.DstColorFactor, THREE.SrcColorFactor, THREE.OneMinusDstColorFactor,
  THREE.SrcAlphaFactor, THREE.OneMinusSrcColorFactor, THREE.DstAlphaFactor, THREE.OneMinusDstAlphaFactor,
  THREE.SrcAlphaSaturateFactor, THREE.OneMinusSrcAlphaFactor];
const CULL = [THREE.DoubleSide, THREE.BackSide, THREE.FrontSide];

// Unity pass state (shaders/states.json, copied into each material entry as "passes") -> three material flags.
function applyState(mat, p, queue) {
  if (!p) return;
  mat.side = CULL[p.cull ?? 2];
  mat.depthWrite = p.zwrite !== 0;
  if (p.src === 1 && p.dst === 0) {
    mat.transparent = (queue ?? 2000) >= 3000;
  } else {
    mat.transparent = true;
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = BLEND[p.src];
    mat.blendDst = BLEND[p.dst];
  }
  if (p.mask === 0) mat.colorWrite = false;
}

// Rim term families: OutlineLight* lights vertices left of _LightFromX (clamp 0.1..0.7); OutlineUnit* lights vertices
// above y 0.1 when _Lighting >= 1 (clamp 0.2..1) and scales it by _AmbientFactor.
const objectVert = SKIN_PARS + `
  uniform float lightFromX;
  uniform float ambientFactor;
  uniform vec4 ambient;
  uniform float fat;
  uniform int rimMode;
  uniform bool hasColor;
  attribute vec4 color;
  varying vec2 vUv;
  varying float vRim;
  varying vec4 vColor;
  void main() {
    ${SKIN_BODY}
    vec4 vc = hasColor ? color : vec4(1.0);
    vColor = vc;
    vUv = uv;
    transformed += objectNormal * fat * vc.z;
    vec3 n = normalize((viewMatrix * vec4(normalize(mat3(modelMatrix) * objectNormal), 0.0)).xyz);
    float k = max(1.0 - (dot(ambient.xx, vec2(ambientFactor)) + (1.0 - ambientFactor) + 0.1), 0.0);
    float r = 0.0;
    if (rimMode == 1) r = position.x < lightFromX ? clamp((n.x - n.y) * 3.0 - 2.5, 0.1, 0.7) : 0.0;
    if (rimMode == 2) r = transformed.y > 0.1 ? clamp((n.x - n.y) * 3.0 - 2.5, 0.2, 1.0) * ambientFactor : 0.0;
    vRim = k * r;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }`;
const objectFrag = `
  uniform sampler2D map;
  uniform vec4 color;
  uniform vec4 tint;
  uniform vec4 ambient;
  uniform float ambientFactor;
  uniform float alpha;
  uniform int fragMode;
  varying vec2 vUv;
  varying float vRim;
  varying vec4 vColor;
  void main() {
    vec4 a = ambient * ambientFactor * 2.0 + vec4(1.0 - ambientFactor);
    vec4 t = texture2D(map, vUv);
    vec4 c;
    if (fragMode == 1) c = t.g < 0.5 ? a * t * color : t * color;
    else if (fragMode == 2) c = t * vColor * tint * a;
    else c = t * a * tint + vRim * color;
    gl_FragColor = vec4(c.rgb, c.a * alpha);
  }`;
const outlineVert2 = SKIN_PARS + `
  uniform float width;
  uniform float fat;
  uniform bool hasColor;
  attribute vec4 color;
  void main() {
    ${SKIN_BODY}
    vec4 vc = hasColor ? color : vec4(1.0);
    vec3 p = transformed + normalize(objectNormal) * width * vc.w;
    if (fat < 0.0) p *= vc.x;
    p += objectNormal * fat * vc.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

// One material entry of scene.json -> { mat, outline?, colored(geometry) }.
export function makeMaterial(e, texBase, textures, opts = {}) {
  const tex = i => (i == null ? null : texture(texBase, textures[i].name).tex);
  const c = e.c || {}, f = e.f || {};
  const sh = e.shader || '';
  const af = f._AmbientFactor ?? 1;
  const passes = e.passes || [];
  if (opts.sprite || /Sprite/i.test(sh)) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex(opts.spriteTex ?? (e.t && e.t._MainTex)) }, color: { value: v4(opts.color || c._Color) },
        ambient: env.ambient, ambientFactor: { value: af } },
      vertexShader: spriteVert, fragmentShader: spriteFrag, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: /Additive/.test(sh) ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    return { mat };
  }
  const objPass = passes.find(p => p.name !== 'OUTLINE') || passes[0];
  const olPass = passes.find(p => p.name === 'OUTLINE');
  const map = tex(e.t && (e.t._MainTex ?? Object.values(e.t)[0]));
  const rimMode = /^Custom\/OutlineLight/.test(sh) ? 1 : /^Custom\/OutlineUnit/.test(sh) && (f._Lighting ?? 0) >= 1 ? 2 : 0;
  const fragMode = /Eye/.test(sh) ? 1 : /Mobile|UnlitAmbient|NoOutlineAlpha/.test(sh) ? 2 : 0;
  // OutlineLightColor and kin tint by _MainColor (their _Color is the rim colour); the alpha-blend family tints by _Color.
  const tintVal = c._MainColor ? v4(c._MainColor) : fragMode === 2 ? v4(c._Color) : v4();
  const uniforms = {
    map: { value: map || whiteTex() }, color: { value: v4(c._Color) }, tint: { value: tintVal },
    ambient: env.ambient, ambientFactor: { value: af }, lightFromX: { value: f._LightFromX ?? 0.1 },
    alpha: { value: f._Alpha ?? 1 }, fat: { value: f._Fat ?? 0 }, rimMode: { value: rimMode }, fragMode: { value: fragMode },
    hasColor: { value: false },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: objectVert, fragmentShader: objectFrag });
  applyState(mat, objPass, e.q);
  const out = { mat };
  if (olPass && (f._OutlineWidth ?? 0) > 0) {
    out.outline = new THREE.ShaderMaterial({
      uniforms: { width: { value: f._OutlineWidth }, fat: uniforms.fat, color: { value: v4(c._OutlineColor, [0, 0, 0, 1]) },
        ambient: env.ambient, ambientFactor: { value: af }, hasColor: { value: false } },
      vertexShader: outlineVert2, fragmentShader: outlineFrag,
    });
    applyState(out.outline, olPass, e.q);
  }
  // Meshes with a vertex colour channel need their own copy with hasColor on (fat, outline width and tint read it).
  const cache = new Map();
  out.colored = (m, geometry) => {
    if (!m || !geometry.attributes.color) return m;
    if (!cache.has(m)) {
      const k = m.clone();
      k.uniforms = { ...m.uniforms, hasColor: { value: true } };
      cache.set(m, k);
    }
    return cache.get(m);
  };
  return out;
}

let white = null;
function whiteTex() {
  if (!white) {
    white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.needsUpdate = true;
  }
  return white;
}
