// URP Volumes of the original (Post Processing/AquariumPP and DirtyAquariumPP) as one full-screen pass: lens distortion and
// lift/gamma/gain, applied while the camera is inside a volume's BoxCollider. Gamma-space maths like the rest of the project.
// Profiles are copied from sharedassets2.assets (VolumeProfile 637 / 650); the exported scene only keeps the profile ref.
import * as THREE from 'three';

const PROFILES = {
  637: { ld: { intensity: 0.55, scale: 1.2 }, lift: [0.5931, 0.5877, 1, 0], gamma: [1, 1, 1, 0], gain: [1, 1, 1, 0] },
  650: { ld: { intensity: 0.55, scale: 1.2 }, lift: [1, 0.4329, 0.0766, 0], gamma: [0.0644, 1, 0.7128, 0], gain: [0.6763, 1, 0.0393, 0] },
};
const VOLUME = 'UnityEngine.Rendering.Volume';

// URP ColorUtils.Prepare*: colour normalised to its mean, then scaled; lift is added, gain multiplied, gamma inverted.
function norm(c) {
  const sum = c[0] + c[1] + c[2];
  return sum === 0 ? [1, 1, 1] : [c[0] / sum * 3, c[1] / sum * 3, c[2] / sum * 3];
}
function grade(p) {
  const l = norm(p.lift), g = norm(p.gamma), n = norm(p.gain);
  const avg = a => (a[0] + a[1] + a[2]) / 3;
  const la = avg(l), ga = avg(g), na = avg(n);
  return {
    lift: l.map(v => (v - la) * 0.1 + p.lift[3]),
    invGamma: g.map(v => 1 / Math.max((v - ga) * 0.5 + 1 + p.gamma[3], 1e-3)),
    gain: n.map(v => (v - na) * 0.5 + 1 + p.gain[3]),
  };
}

const vert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// URP LensDistortion.hlsl: barrel (intensity > 0) via tan, pincushion via atan, after scaling about the centre.
const frag = /* glsl */`
  uniform sampler2D tex;
  uniform vec3 lift, invGamma, gain;
  uniform vec4 ld; // theta, sigma, scale, intensity
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    if (ld.w != 0.0) {
      uv = (uv - 0.5) * ld.z + 0.5;
      vec2 ruv = uv - 0.5;
      float ru = max(length(ruv), 1e-5);
      if (ld.w > 0.0) ru = tan(ru * ld.x) * (1.0 / (ru * ld.y));
      else ru = (1.0 / ru) * ld.x * atan(ru * ld.y);
      uv += ruv * (ru - 1.0);
    }
    vec3 c = texture2D(tex, uv).rgb * gain + lift;
    c = sign(c) * pow(abs(c), invGamma);
    gl_FragColor = vec4(c, 1.0);
  }`;

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

  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true });
  target.texture.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: target.texture }, lift: { value: new THREE.Vector3() }, invGamma: { value: new THREE.Vector3(1, 1, 1) },
      gain: { value: new THREE.Vector3(1, 1, 1) }, ld: { value: new THREE.Vector4() } },
    vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(quad);
  const fsCam = new THREE.Camera();
  const p = new THREE.Vector3(), size = new THREE.Vector2();
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

  return {
    volumes, active,
    render(scene, camera) {
      const on = active(camera);
      if (!on.length) { renderer.render(scene, camera); return; }
      const top = on[on.length - 1];
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
      const u = mat.uniforms, g = top.graded, ld = top.profile.ld;
      u.lift.value.fromArray(g.lift); u.invGamma.value.fromArray(g.invGamma); u.gain.value.fromArray(g.gain);
      const amount = 1.6 * Math.max(Math.abs(ld.intensity * 100), 1);
      const theta = Math.min(160, amount) * Math.PI / 180;
      u.ld.value.set(theta, 2 * Math.tan(theta * 0.5), ld.scale, ld.intensity);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(fsScene, fsCam);
    },
  };
}
