// Seikami "Lowpoly" shaders as Lumber Inc's materials use them: palette texture x _MainTexColor x _MainTexIntensity,
// one directional light plus flat ambient; "Lowpoly Splat" blends four tiled layers by a control map (ground, mountain).
// The original shader source is not in the APK, so the light model is fitted to gameplay footage.
import * as THREE from 'three';

const loader = new THREE.ImageLoader();
const texCache = new Map();

export const lighting = {
  dir: new THREE.Vector3(0.35, 0.85, 0.4).normalize(),
  color: new THREE.Color(1, 1, 1),
  ambient: new THREE.Color(0.62, 0.62, 0.62),
  diffuse: { value: 0.45 },
};

// 16 px .lq.webp first, then the full image; a late 16 px image must not replace the full one (casual-farm trap).
export function texture(base, name, { repeat = false, nearest = true } = {}) {
  const key = `${name}|${repeat}|${nearest}`;
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.Texture();
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = nearest ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = !nearest;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
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
  texCache.set(key, entry);
  return entry;
}

const vert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vColor;
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    vUv = uv;
    #ifdef USE_COLOR_ALPHA
      vColor = color;
    #else
      vColor = vec4(1.0);
    #endif
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    mat4 mm = modelMatrix;
    #ifdef USE_INSTANCING
      mm = modelMatrix * instanceMatrix;
    #endif
    vNormal = normalize(mat3(mm) * objectNormal);
    gl_Position = projectionMatrix * viewMatrix * mm * vec4(transformed, 1.0);
  }`;

const light = /* glsl */`
  uniform vec3 lightDir;
  uniform vec3 lightColor;
  uniform vec3 ambient;
  uniform float diffuse;
  vec3 shade(vec3 albedo, vec3 n) {
    float ndl = max(dot(normalize(n), lightDir), 0.0);
    return albedo * (ambient + lightColor * ndl * diffuse);
  }`;

const frag = /* glsl */`
  uniform sampler2D map;
  uniform bool hasMap;
  uniform vec4 uvST;
  uniform vec4 color;
  uniform float cutoff;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vColor;
  ${light}
  void main() {
    vec4 albedo = color;
    if (hasMap) albedo *= texture2D(map, vUv * uvST.xy + uvST.zw);
    if (albedo.a < cutoff) discard;
    gl_FragColor = vec4(shade(albedo.rgb, vNormal), albedo.a * opacity);
    #include <colorspace_fragment>
  }`;

const splatFrag = /* glsl */`
  uniform sampler2D control;
  uniform sampler2D l0; uniform sampler2D l1; uniform sampler2D l2; uniform sampler2D l3;
  uniform vec4 st0; uniform vec4 st1; uniform vec4 st2; uniform vec4 st3;
  uniform float layers;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vColor;
  ${light}
  void main() {
    vec4 c = texture2D(control, vUv);
    vec3 a = texture2D(l0, vUv * st0.xy + st0.zw).rgb * c.r + texture2D(l1, vUv * st1.xy + st1.zw).rgb * c.g
           + texture2D(l2, vUv * st2.xy + st2.zw).rgb * c.b;
    if (layers > 3.5) a += texture2D(l3, vUv * st3.xy + st3.zw).rgb * c.a;
    gl_FragColor = vec4(shade(a, vNormal), 1.0);
    #include <colorspace_fragment>
  }`;

// Gizmos/Gizmos_Sizable* floor frames on a unit quad: fill, border (dotted for drop zones), and for unlock pads
// (SizableFrameLocked2) a sand background that fills green with the paid fraction. Sizes come from the node's scale.
const frameVert = /* glsl */`
  varying vec2 vUv;
  varying vec2 vSize;
  void main() {
    vUv = uv;
    vSize = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;
const frameFrag = /* glsl */`
  uniform vec4 fill;
  uniform vec4 line;
  uniform vec4 bg;
  uniform vec4 progressCol;
  uniform float width;
  uniform float dotted;
  uniform float progress;
  uniform float circle;
  varying vec2 vUv;
  varying vec2 vSize;
  void main() {
    vec4 c;
    if (circle > 0.5) {
      float r = length(vUv - 0.5) * 2.0;
      float w = width * 2.0;
      c = r > 1.0 ? vec4(0.0) : (r > 1.0 - w ? line : fill);
    } else {
      vec2 d = min(vUv, 1.0 - vUv) * vSize;
      float edge = min(d.x, d.y);
      float w = width * min(vSize.x, vSize.y) * 0.5 + 0.05;
      c = bg.a > 0.0 ? bg : fill;
      if (bg.a > 0.0 && vUv.x < progress) c = progressCol;
      if (edge < w) {
        float along = d.x < d.y ? vUv.y * vSize.y : vUv.x * vSize.x;
        c = (dotted > 0.5 && fract(along / 0.5) > 0.55) ? c : line;
      }
    }
    if (c.a < 0.01) discard;
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`;

const lin = c => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
const v4 = c => {
  if (!c) return new THREE.Vector4(0, 0, 0, 0);
  const l = lin(c);
  return new THREE.Vector4(l.r, l.g, l.b, c[3]);
};

export function frameMaterial(g) {
  return new THREE.ShaderMaterial({
    uniforms: {
      fill: { value: v4(g.fill) }, line: { value: v4(g.line || [1, 1, 1, 1]) }, bg: { value: v4(g.bg) },
      progressCol: { value: v4(g.progress) }, width: { value: g.width }, dotted: { value: g.dotted },
      progress: { value: 0 }, circle: { value: g.kind === 'SizableCircle' ? 1 : 0 },
    },
    vertexShader: frameVert, fragmentShader: frameFrag, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}
const shared = () => ({
  lightDir: { value: lighting.dir }, lightColor: { value: lighting.color }, ambient: { value: lighting.ambient },
  diffuse: lighting.diffuse,
});

// One THREE material per scene.json material entry (export_world.py material_entry).
export function makeMaterial(entry, texBase, textures) {
  if (entry.gizmo) return { mat: frameMaterial(entry.gizmo), gizmo: entry.gizmo };
  if (entry.splat) {
    const L = entry.splat.layers;
    const u = { ...shared(), control: { value: texture(texBase, textures[entry.splat.control].name, { nearest: false }).tex },
      layers: { value: L.length } };
    for (let i = 0; i < 4; i++) {
      const l = L[Math.min(i, L.length - 1)];
      u[`l${i}`] = { value: texture(texBase, textures[l.tex].name, { repeat: true, nearest: false }).tex };
      u[`st${i}`] = { value: new THREE.Vector4(...l.st) };
    }
    return { mat: new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: splatFrag }) };
  }
  const texName = entry.tex != null ? textures[entry.tex].name : null;
  const tint = entry.tint || [1, 1, 1, 1];
  const k = entry.ti || 1;
  const c = lin(entry.color).multiply(lin(tint)).multiplyScalar(k);
  const uniforms = {
    ...shared(),
    map: { value: texName ? texture(texBase, texName).tex : null },
    hasMap: { value: !!texName },
    uvST: { value: new THREE.Vector4(...(entry.st || [1, 1, 0, 0])) },
    color: { value: new THREE.Vector4(c.r, c.g, c.b, entry.color[3]) },
    cutoff: { value: entry.alpha === 'MASK' ? entry.cutoff : -1 },
    opacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag });
  if (entry.alpha === 'BLEND') {
    mat.transparent = true;
    mat.depthWrite = false;
  }
  return { mat, texName };
}
