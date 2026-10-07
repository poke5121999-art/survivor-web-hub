/*
 * Biển: mặt nước theo thuyền, màu theo độ sâu (depthmask.png), sóng Gerstner chép từ WaveDisplacement.Wave,
 * bọt ven bờ (khoảng cách tới đất tính từ landmask) và vệt nước sau thuyền.
 *
 * Sóng gốc (WaveDisplacement.cs): 4 sóng (λ, λ·2, λ·4, λ·6) với độ dốc (s, s, .75s, .5s), tốc (v, .9v, .8v, .7v),
 * hướng waveDirections; sóng có λ < 8 bị bỏ (nên sóng thứ nhất λ=6 không có). s = WaveController.Steepness
 * × clamp01(alpha mặt nạ × 10). Cùng một hàm chạy ở GPU (mặt nước, vệt, điểm câu) và CPU (thuyền nhấp nhô).
 *   DRWater.init(scene, world)   DRWater.update(dt, cx, cz, env)   DRWater.wave(x, z, s) → [h, dhdx, dhdz]
 *   DRWater.uniforms              dùng chung cho mọi shader cần nằm trên mặt nước
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const WC = root.DR_CONFIG.wave.WaveController;
  const SPEED = 0.1; // WaveController.speed: hằng private trong mã, không serialize
  // [λ, hệ số dốc, hệ số tốc, chỉ số hướng]
  const WAVES = [[1, 1, 1, 0], [2, 1, 0.9, 1], [4, 0.75, 0.8, 2], [6, 0.5, 0.7, 3]]
    .map(([lm, sm, vm, di]) => ({ len: WC.wavelength * lm, sm, speed: SPEED * vm, di }))
    .filter(w => w.len >= 8);
  // Hướng Unity (cos πd', sin πd') trên mặt xz; three.js đổi dấu z.
  for (const w of WAVES) {
    const a = Math.PI * (WC.waveDirections[w.di] * 2 - 1);
    w.dx = Math.cos(a); w.dz = -Math.sin(a);
    w.k = Math.PI * 2 / w.len;
  }

  const uniforms = {
    uGameTime: { value: 0 },
    uWaveSteep: { value: WC.steepness },
    uMask: { value: null },
    uLand: { value: null },
    uLandBox: { value: new T.Vector4(0, 0, 1, 1) }, // x0, z0, 1/w, 1/h (m)
    uNight: { value: 0 },
    uFoam: { value: 0.2 } // WeatherData Fine.foamAmount
  };

  const GLSL_WAVE = `
uniform float uGameTime;
uniform float uWaveSteep;
uniform sampler2D uMask;
uniform sampler2D uLand;
uniform vec4 uLandBox;
float drSteepAt(vec2 xz) {
  vec2 uv = (xz + 750.0) / 1500.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return clamp(texture2D(uMask, uv).a * 10.0, 0.0, 1.0);
}
float drDepthAt(vec2 xz) {
  vec2 uv = (xz + 750.0) / 1500.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uMask, uv).g;
}
// metres to the nearest solid pixel of landmask (0..64)
float drLandDist(vec2 xz) {
  vec2 uv = (xz - uLandBox.xy) * uLandBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 64.0;
  return texture2D(uLand, uv).r * 64.0;
}
vec3 drWave(vec2 xz, float s) {
  vec3 r = vec3(0.0);
${WAVES.map(w => `  { float f = ${w.k.toFixed(6)} * (dot(vec2(${w.dx.toFixed(6)}, ${w.dz.toFixed(6)}), xz) - uGameTime * ${(w.speed * w.len).toFixed(6)});
    float a = s * ${w.sm.toFixed(3)};
    r += vec3(a / ${w.k.toFixed(6)} * sin(f), a * cos(f) * ${w.dx.toFixed(6)}, a * cos(f) * ${w.dz.toFixed(6)}); }`).join('\n')}
  return r;
}
`;

  // Bản CPU: cùng công thức, s đã nhân mặt nạ.
  function wave(x, z, s, t) {
    t = t == null ? uniforms.uGameTime.value : t;
    let h = 0, gx = 0, gz = 0;
    for (const w of WAVES) {
      const f = w.k * (w.dx * x + w.dz * z - t * w.speed * w.len), a = s * w.sm, c = Math.cos(f);
      h += a / w.k * Math.sin(f); gx += a * c * w.dx; gz += a * c * w.dz;
    }
    return [h, gx, gz];
  }

  let mesh = null, wake = null, world = null;

  // Lưới không đều: dày quanh tâm (thuyền), thưa dần ra xa: ô ≈ 0,8 m sát thuyền, ≈ 2 m ở 40 m, ≈ 6 m ở 130 m.
  function waterGeometry(n, half) {
    const g = new T.BufferGeometry(), pos = new Float32Array((n + 1) * (n + 1) * 3), idx = [];
    const lin = 0.4 * n, f = u => Math.sign(u) * (lin * Math.abs(u) + (half - lin) * Math.pow(u, 4));
    let k = 0;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      pos[k++] = f(i / n * 2 - 1); pos[k++] = 0; pos[k++] = f(j / n * 2 - 1);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(pos.length).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3));
    g.setIndex(idx);
    g.boundingSphere = new T.Sphere(new T.Vector3(), half * 1.5);
    return g;
  }

  function waterMaterial() {
    const m = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0x2a3a3a, shininess: 40, transparent: true, depthWrite: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + GLSL_WAVE + '\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
  // bờ nông: tắt dần sóng để mặt nước không lún xuống dưới đáy (đáy cao nhất y = -0,2 m);
  // ở xa lưới thưa nên tắt dịch đỉnh để khỏi lộ mặt tam giác (pháp tuyến vẫn tính theo từng điểm ảnh)
  float fadeV = smoothstep(0.5, 6.0, drLandDist(wp0.xz)) * (1.0 - smoothstep(70.0, 160.0, distance(wp0.xz, cameraPosition.xz)));
  float hy = drWave(wp0.xz, drSteepAt(wp0.xz) * uWaveSteep * fadeV).x;
  transformed.y += hy;
  vWPos = wp0 + vec3(0.0, hy, 0.0);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GLSL_WAVE + `
uniform float uNight;
uniform float uFoam;
varying vec3 vWPos;
float drHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float drNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(drHash(i), drHash(i + vec2(1, 0)), f.x), mix(drHash(i + vec2(0, 1)), drHash(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  float dep = drDepthAt(vWPos.xz);
  float ld = drLandDist(vWPos.xz);
  float camD = distance(vWPos.xz, cameraPosition.xz);
  float stp = drSteepAt(vWPos.xz) * uWaveSteep * smoothstep(0.5, 6.0, ld);
  vec3 wav = drWave(vWPos.xz, stp);
  // [ĐỀ XUẤT] bảng màu: nông xanh ngọc, sâu xanh lục sẫm (linear), so theo ảnh chụp bản gốc
  vec3 cShallow = vec3(0.045, 0.19, 0.18);
  vec3 cMid = vec3(0.018, 0.085, 0.09);
  vec3 cDeep = vec3(0.007, 0.036, 0.045);
  vec3 col = mix(cShallow, cMid, smoothstep(0.0, 0.12, dep));
  col = mix(col, cDeep, smoothstep(0.12, 0.6, dep));
  // bọt: dải sát bờ + vạch bọt chạy ra xa bờ, đứt quãng theo nhiễu; ngọn sóng có bọt theo độ dốc
  float n1 = drNoise(vWPos.xz * 0.35 + uGameTime * 0.05);
  float n2 = drNoise(vWPos.xz * 1.3 - uGameTime * 0.11);
  float edge = 1.0 - smoothstep(0.2, 1.6 + n1 * 1.4, ld);
  float band = smoothstep(0.8, 0.97, sin(ld * 1.4 - uGameTime * 1.3) * 0.5 + 0.5) * (1.0 - smoothstep(2.0, 8.0, ld));
  float foam = clamp(edge * (0.45 + 0.4 * n2) + band * step(0.5, n2) * 0.45, 0.0, 1.0) * (0.6 + uFoam * 2.0);
  foam += smoothstep(0.75, 1.0, wav.x / max(0.05, stp * 8.0) * 0.6 + n2 * 0.55) * stp * 0.8 * (1.0 - smoothstep(40.0, 120.0, camD));
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, vec3(0.62, 0.68, 0.66), foam);
  float alpha = mix(0.55, 0.97, smoothstep(0.0, 0.09, dep));
  alpha = max(alpha, foam);
  vec4 diffuseColor = vec4(col, alpha);`)
        .replace('#include <normal_fragment_begin>', `
  vec3 wn = normalize(vec3(-wav.y, 1.0, -wav.z));
  // gợn nhỏ cho mặt nước khỏi phẳng lì, tắt dần theo khoảng cách để khỏi nhiễu răng cưa
  vec2 rp = vWPos.xz * 0.9;
  float rk = 0.12 * (1.0 - smoothstep(30.0, 90.0, camD));
  wn = normalize(wn + vec3(drNoise(rp + uGameTime * 0.3) - 0.5, 0.0, drNoise(rp.yx - uGameTime * 0.27) - 0.5) * rk);
  vec3 normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  vec3 geometryNormal = normal;
  float faceDirection = 1.0;`);
    };
    return m;
  }

  // ---- vệt nước sau thuyền ----
  const WAKE_N = 48, WAKE_DT = 0.12; // [ĐỀ XUẤT] ~6 s vệt
  const wakePts = [];
  let wakeT = 0;
  function wakeMesh() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(WAKE_N * 2 * 3), 3));
    g.setAttribute('aFade', new T.BufferAttribute(new Float32Array(WAKE_N * 2 * 2), 2));
    const idx = [];
    for (let i = 0; i < WAKE_N - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    g.setIndex(idx);
    const m = new T.ShaderMaterial({
      uniforms: Object.assign({ fogColor: { value: new T.Color() }, fogDensity: { value: 0 } }, uniforms),
      transparent: true, depthWrite: false, fog: true,
      vertexShader: GLSL_WAVE + `
attribute vec2 aFade; varying vec2 vF; varying vec3 vWP;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float s = drSteepAt(p.xz) * uWaveSteep;
  p.y += drWave(p.xz, s).x + 0.04;
  vF = aFade; vWP = p;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uGameTime; uniform float uNight;
varying vec2 vF; varying vec3 vWP;
#include <common>
#include <fog_pars_fragment>
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float nz(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float side = abs(vF.y * 2.0 - 1.0);
  float n = nz(vWP.xz * 2.2 + uGameTime * 0.2);
  float a = (1.0 - vF.x) * smoothstep(0.0, 0.02, vF.x) * (smoothstep(0.35, 1.0, side) * 0.9 + 0.3) * smoothstep(0.25, 0.6, n + 0.3);
  gl_FragColor = vec4(vec3(0.82, 0.88, 0.86) * mix(1.0, 0.35, uNight), a * 0.75);
  #include <encodings_fragment>
  #include <fog_fragment>
}`
    });
    const mesh = new T.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }

  function updateWake(dt, boat) {
    wakeT += dt;
    const speed = Math.hypot(boat.vx, boat.vz);
    if (wakeT >= WAKE_DT) {
      wakeT = 0;
      // đuôi thuyền: 1,3 m sau tâm (Boat1 hullBounds z max ≈ 1,3)
      const fx = -Math.sin(boat.yaw), fz = -Math.cos(boat.yaw);
      wakePts.unshift({ x: boat.x - fx * 1.3, z: boat.z - fz * 1.3, rx: fz, rz: -fx, sp: Math.min(1, speed / 3), age: 0 });
      if (wakePts.length > WAKE_N) wakePts.pop();
    }
    const pos = wake.geometry.attributes.position.array, fade = wake.geometry.attributes.aFade.array;
    for (let i = 0; i < WAKE_N; i++) {
      const p = wakePts[Math.min(i, wakePts.length - 1)];
      if (!p) break;
      if (i < wakePts.length) p.age += dt;
      const life = Math.min(1, i / (WAKE_N - 1));
      const w = (0.45 + life * 3.2) * p.sp; // vệt nở rộng dần
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s), sg = s ? 1 : -1;
        pos[k * 3] = p.x + p.rx * w * sg; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = p.z + p.rz * w * sg;
        fade[k * 2] = i < wakePts.length ? life : 1; fade[k * 2 + 1] = s;
      }
    }
    wake.geometry.attributes.position.needsUpdate = true;
    wake.geometry.attributes.aFade.needsUpdate = true;
  }

  function init(scene, w) {
    world = w;
    uniforms.uMask.value = w.maskTex;
    uniforms.uLand.value = w.landTex;
    const L = w.landBox;
    uniforms.uLandBox.value.set(L.x0, L.z0, 1 / L.w, 1 / L.h);
    mesh = new T.Mesh(waterGeometry(256, 1400), waterMaterial());
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    wake = wakeMesh();
    scene.add(wake);
  }

  function update(dt, cx, cz, boat, env) {
    // mặt nước bám camera, chốt theo bước 4 m để đỉnh không trượt
    mesh.position.set(Math.round(cx / 4) * 4, 0, Math.round(cz / 4) * 4);
    uniforms.uNight.value = env.night;
    if (boat) updateWake(dt, boat);
  }
  function syncFog(fog) {
    if (!wake || !fog) return;
    wake.material.uniforms.fogColor.value.copy(fog.color);
    wake.material.uniforms.fogDensity.value = fog.density;
  }

  root.DRWater = { init, update, wave, syncFog, uniforms, GLSL_WAVE, WAVES, get mesh() { return mesh; } };
})(window);
