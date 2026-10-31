// URP camera stack of the original as far as the game uses it:
// - _CameraOpaqueTexture / _CameraDepthTexture for the WaterwithWaves surfaces (URP asset: both required, opaque copy
//   downsampled 2x bilinear): when a refracting mesh is in view, opaque objects render first, the copy is taken, then
//   transparent objects render on top sampling it.
// - The Volumes Post Processing/AquariumPP and DirtyAquariumPP (lens distortion + lift/gamma/gain), applied while the camera
//   is inside a volume's BoxCollider, as UberPost does it in a gamma-space project with LDR grading (URP 14.0.11).
// Profiles are copied from sharedassets2.assets (VolumeProfile 637 / 650); the exported scene only keeps the profile ref.
import * as THREE from 'three';
import { sceneCapture } from './materials.js';

const PROFILES = {
  637: { ld: { intensity: 0.55, scale: 1.2 }, lift: [0.5931, 0.5877, 1, 0], gamma: [1, 1, 1, 0], gain: [1, 1, 1, 0] },
  650: { ld: { intensity: 0.55, scale: 1.2 }, lift: [1, 0.4329, 0.0766, 0], gamma: [0.0644, 1, 0.7128, 0], gain: [0.6763, 1, 0.0393, 0] },
};
// Global volumes (no BoxCollider), keyed by profile file:id. "Death Features/Death Global Volume" (level4) carries
// sharedassets4 VolumeProfile 104: ChromaticAberration 1 and ColorAdjustments saturation -100 (contrast not overridden).
const GLOBAL_PROFILES = { 'sharedassets4.assets:104': { chroma: 1, saturation: -100 } };
const VOLUME = 'UnityEngine.Rendering.Volume';

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); // Mathf.GammaToLinearSpace
const lum = c => c[0] * 0.2126729 + c[1] * 0.7151522 + c[2] * 0.072175;
// ColorUtils.PrepareLiftGammaGain (render-pipelines.core 14.0.11).
function grade(p) {
  const lift = p.lift.slice(0, 3).map(v => toLinear(v) * 0.15), gamma = p.gamma.slice(0, 3).map(v => toLinear(v) * 0.8);
  const gain = p.gain.slice(0, 3).map(v => toLinear(v) * 0.8);
  const ll = lum(lift), lg = lum(gamma), ln = lum(gain);
  return {
    lift: lift.map(v => v - ll + p.lift[3]),
    invGamma: gamma.map(v => 1 / Math.max(v - lg + p.gamma[3] + 1, 1e-3)),
    gain: gain.map(v => v - ln + p.gain[3] + 1),
  };
}

const vert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// UberPost: DistortUV (barrel via tan, pincushion via atan, DistScale = 1 / scale), then in gamma space SRGBToLinear,
// the LDR LUT (LutBuilderLdr: saturate, colour * gain + lift, signed pow by gamma, saturate) and LinearToSRGB. The
// profiles carry no other LUT effect, so the 16^3 LUT is evaluated directly. grade = 0 copies (water capture only).
const frag = /* glsl */`
  uniform sampler2D tex;
  uniform vec3 lift, invGamma, gain;
  uniform vec4 ld; // theta, sigma, 1 / scale, intensity
  uniform float grade, chroma, sat;
  varying vec2 vUv;
  vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
  vec3 toGamma(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  vec2 distort(vec2 uv) {
    if (ld.w == 0.0) return uv;
    uv = (uv - 0.5) * ld.z + 0.5;
    vec2 ruv = uv - 0.5;
    float ru = max(length(ruv), 1e-5);
    if (ld.w > 0.0) ru = tan(ru * ld.x) * (1.0 / (ru * ld.y));
    else ru = (1.0 / ru) * ld.x * atan(ru * ld.y);
    return uv + ruv * (ru - 1.0);
  }
  void main() {
    vec3 c = texture2D(tex, distort(vUv)).rgb;
    if (chroma > 0.0) { // UberPost chromatic aberration, no spectral LUT: three taps along the radial offset
      vec2 coords = 2.0 * vUv - 1.0, delta = (vUv - coords * dot(coords, coords) * chroma - vUv) / 3.0;
      c.g = texture2D(tex, distort(vUv + delta)).g;
      c.b = texture2D(tex, distort(vUv + delta * 2.0)).b;
    }
    if (grade > 0.5) {
      c = clamp(toLinear(c), 0.0, 1.0) * gain + lift;
      c = clamp(sign(c) * pow(abs(c), invGamma), 0.0, 1.0);
      // LutBuilderLdr: saturation after lift/gamma/gain, around Rec.709 luminance of the linear colour
      c = clamp(mix(vec3(dot(c, vec3(0.2126729, 0.7151522, 0.072175))), c, sat), 0.0, 1.0);
      c = toGamma(c);
    }
    gl_FragColor = vec4(c, 1.0);
  }`;

const copyFrag = /* glsl */`
  uniform sampler2D tex;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tex, vUv).rgb, 1.0); }`;

export function createPost(renderer, worlds) {
  const volumes = [];
  for (const w of worlds) w.nodes.forEach((n, i) => {
    const v = n.k && n.k[VOLUME], box = n.k && n.k.BoxCollider;
    if (!v || !box || !PROFILES[v.sharedProfile && v.sharedProfile.id]) return;
    const c = box.m_Center, s = box.m_Size;
    volumes.push({
      obj: w.objects[i], priority: v.priority || 0,
      center: new THREE.Vector3(c.x, c.y, -c.z), half: new THREE.Vector3(s.x / 2, s.y / 2, s.z / 2),
      profile: PROFILES[v.sharedProfile.id], graded: grade(PROFILES[v.sharedProfile.id]),
    });
  });
  volumes.sort((a, b) => a.priority - b.priority);
  const globals = [];
  for (const w of worlds) w.nodes.forEach((n, i) => {
    const v = n.k && n.k[VOLUME], ref = v && v.sharedProfile;
    const prof = v && v.m_IsGlobal && ref && GLOBAL_PROFILES[`${ref.f}:${ref.id}`];
    if (prof) globals.push({ obj: w.objects[i], profile: prof });
  });
  const refractive = worlds.flatMap(w => w.refractive || []);

  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.depthTexture = new THREE.DepthTexture(1, 1);
  const opaque = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  opaque.texture.colorSpace = THREE.NoColorSpace;
  sceneCapture.opaque.value = opaque.texture;
  sceneCapture.depth.value = target.depthTexture;

  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: target.texture }, lift: { value: new THREE.Vector3() }, invGamma: { value: new THREE.Vector3(1, 1, 1) },
      gain: { value: new THREE.Vector3(1, 1, 1) }, ld: { value: new THREE.Vector4() }, grade: { value: 0 },
      chroma: { value: 0 }, sat: { value: 1 } },
    vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
  });
  const copy = new THREE.ShaderMaterial({ uniforms: { tex: { value: target.texture } }, vertexShader: vert, fragmentShader: copyFrag,
    depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(quad);
  const fsCam = new THREE.Camera();
  const p = new THREE.Vector3(), size = new THREE.Vector2();
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

  // Volumes the camera is inside, lowest priority first (later ones override, as in URP).
  function active(camera) {
    camera.getWorldPosition(p);
    const out = [];
    for (const v of volumes) {
      if (!shown(v.obj)) continue;
      v.obj.updateWorldMatrix(true, false);
      const l = v.obj.worldToLocal(p.clone()).sub(v.center);
      if (Math.abs(l.x) <= v.half.x && Math.abs(l.y) <= v.half.y && Math.abs(l.z) <= v.half.z) out.push(v);
    }
    return out;
  }

  function refracting(camera) {
    if (!refractive.length) return false;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return refractive.some(m => shown(m) && frustum.intersectsObject(m));
  }

  // Keeps only drawables whose material.transparent equals `transparent`; returns what it hid so it can be shown again.
  function keep(scene, transparent) {
    const hidden = [];
    scene.traverseVisible(o => {
      const m = o.material;
      if (!m) return;
      if ((Array.isArray(m) ? m[0].transparent : m.transparent) !== transparent) { o.visible = false; hidden.push(o); }
    });
    return hidden;
  }
  const show = hidden => { for (const o of hidden) o.visible = true; };

  function draw(material, dst) {
    quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(fsScene, fsCam);
  }

  return {
    volumes, active,
    render(scene, camera) {
      const on = active(camera), water = refracting(camera), glob = globals.filter(g => shown(g.obj)).map(g => g.profile);
      if (!on.length && !water && !glob.length) { renderer.render(scene, camera); return; }
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) {
        target.setSize(size.x, size.y);
        opaque.setSize(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1));
      }
      if (water) {
        sceneCapture.size.value.copy(size);
        sceneCapture.near.value = camera.near;
        sceneCapture.far.value = camera.far;
        let hidden = keep(scene, false);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        show(hidden);
        draw(copy, opaque);
        // Transparent queue on top of the resolved opaque frame: the multisampled buffers keep their contents.
        hidden = keep(scene, true);
        const bg = scene.background, auto = renderer.autoClear;
        scene.background = null;
        renderer.autoClear = false;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.autoClear = auto;
        scene.background = bg;
        show(hidden);
      } else {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      }
      const u = mat.uniforms;
      if (on.length) {
        const top = on[on.length - 1], g = top.graded, ld = top.profile.ld;
        u.lift.value.fromArray(g.lift); u.invGamma.value.fromArray(g.invGamma); u.gain.value.fromArray(g.gain);
        const amount = 1.6 * Math.max(Math.abs(ld.intensity * 100), 1);
        const theta = Math.min(160, amount) * Math.PI / 180;
        u.ld.value.set(ld.intensity >= 0 ? theta : 1 / theta, 2 * Math.tan(theta * 0.5), 1 / ld.scale, ld.intensity);
        u.grade.value = 1;
      } else {
        u.lift.value.set(0, 0, 0); u.invGamma.value.set(1, 1, 1); u.gain.value.set(1, 1, 1);
        u.ld.value.set(0, 0, 1, 0);
        u.grade.value = glob.length ? 1 : 0;
      }
      // ChromaticAberration intensity x 0.05 (UberPost _Chroma_Params); saturation / 100 + 1
      u.chroma.value = glob.reduce((a, g) => Math.max(a, (g.chroma || 0) * 0.05), 0);
      u.sat.value = glob.reduce((a, g) => Math.min(a, g.saturation != null ? g.saturation / 100 + 1 : 1), 1);
      draw(mat, null);
    },
  };
}
