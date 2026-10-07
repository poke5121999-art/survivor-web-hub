/*
 * Biển: mặt nước theo thuyền, sóng Gerstner chép từ WaveDisplacement.Wave, màu + bọt theo Water_Mat và WaterController.
 *
 * Sóng gốc (WaveDisplacement.cs): 4 sóng (λ, λ·2, λ·4, λ·6) với độ dốc (s, s, .75s, .5s), tốc (v, .9v, .8v, .7v),
 * hướng waveDirections; sóng có λ < 8 bị bỏ (nên sóng thứ nhất λ=6 không có). s = WaveController.Steepness
 * × clamp01(alpha mặt nạ × 10). Cùng một hàm chạy ở GPU (mặt nước, điểm câu) và CPU (thuyền nổi).
 *
 * Màu (WaterController.cs:36-66, Game.unity): _ShallowColor/_DeepColor/_FoamColor/_Depth = defaultWaterProperties, trộn
 * về WaterPropertyModifier mạnh nhất tại thuyền (1 trong fullValueRadius, giảm tuyến tính tới partialValueRadius).
 * Texture gốc (Water_Mat.mat): DistortionNormal = Water_Normal, WaterTexture = StylisedWater_Tex (bọt có lỗ),
 * EdgeFoamOffset 0,61, FoamUVTiling 84, DistortionUVTiling 8, DistortionScrollSpeed 0,1, DistortionStrength 0,65,
 * SkyBlue (0,318; 0,420; 0,482), ReflectionStrength 0,5. Thân Water_Shader bị AssetRipper bỏ (DummyShaderTextExporter)
 * nên cách các số này ghép lại với nhau là [ĐỀ XUẤT] (ghi tại chỗ).
 * Vệt bọt sau thuyền KHÔNG nằm ở đây: bản gốc là hệ hạt BoatTrailParticles (js/vfx.js).
 *   DRWater.init(scene, world)   DRWater.update(dt, cx, cz, boat, env)   DRWater.wave(x, z, s) → [h, dhdx, dhdz]
 *   DRWater.props() → WaterProperty hiện tại (sRGB như Inspector)   DRWater.uniforms (dùng chung cho shader nằm trên mặt nước)
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const WC = root.DR_CONFIG.wave.WaveController;
  const VFX = root.DR_VFX || null;
  const WM = VFX ? VFX.waterMaterial.floats : { EdgeFoamOffset: 0.61, FoamUVTiling: 84, DistortionUVTiling: 8, DistortionScrollSpeed: 0.1, DistortionStrength: 0.65, ReflectionStrength: 0.5 };
  const WCTL = VFX ? VFX.waterController : { default: { waterDepth: 1, foamColor: [0.6824, 0.7412, 0.7647, 1], shallowColor: [0.3255, 0.4745, 0.5294, 0.349], deepColor: [0.0902, 0.0863, 0.1333, 0] }, modifiers: [] };
  const WORLD = root.DR_CONFIG.worldSize || 1500, DEPTH_M = root.DR_CONFIG.depthModifier || 100;
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
    uFoam: { value: 0.2 }, // _FoamAmount (WeatherController.cs:447), Fine.foamAmount
    uShallow: { value: new T.Color() }, uShallowA: { value: 0.35 }, uDeep: { value: new T.Color() },
    uFoamCol: { value: new T.Color() }, uWaterDepth: { value: 1 },
    uSky: { value: new T.Color() }, uNormalTex: { value: null }, uFoamTex: { value: null }
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

  let mesh = null, world = null;

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
uniform vec3 uShallow; uniform float uShallowA; uniform vec3 uDeep; uniform vec3 uFoamCol; uniform float uWaterDepth;
uniform vec3 uSky; uniform sampler2D uNormalTex; uniform sampler2D uFoamTex;
varying vec3 vWPos;`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  float depM = drDepthAt(vWPos.xz) * ${DEPTH_M.toFixed(1)};
  float ld = drLandDist(vWPos.xz);
  float camD = distance(vWPos.xz, cameraPosition.xz);
  float stp = drSteepAt(vWPos.xz) * uWaveSteep * smoothstep(0.5, 6.0, ld);
  vec3 wav = drWave(vWPos.xz, stp);
  // [ĐỀ XUẤT] _Depth (WaterProperty.waterDepth) là quãng mờ dần từ nông sang sâu: trọng số nông = exp(−sâu/_Depth)
  // với "sâu" = độ sâu đáy (depthmask kênh G × depthModifier); alpha nông = _ShallowColor.a (đáy hiện qua nước)
  float kS = exp(-depM / max(0.05, uWaterDepth));
  vec3 col = mix(uDeep, uShallow, kS);
  float alpha = mix(1.0, uShallowA, kS);
  // bọt mép: WaterTexture (StylisedWater_Tex) lấy mẫu toạ độ thế giới, lặp FoamUVTiling lần trên cả bản đồ;
  // [ĐỀ XUẤT] độ gần bờ e = 1 − smoothstep(0, 0,5 + 7,5·_FoamAmount m, khoảng cách tới đất), bọt = tex − (1 − e) − (EdgeFoamOffset − 0,5) > 0
  float e = 1.0 - smoothstep(0.0, 0.5 + 7.5 * uFoam, ld);
  if (e > 0.001) {
    float ftex = texture2D(uFoamTex, vWPos.xz * ${(WM.FoamUVTiling / WORLD).toFixed(6)}).r;
    float foam = smoothstep(0.0, 0.06, ftex - (1.0 - e) - (${WM.EdgeFoamOffset.toFixed(3)} - 0.5));
    col = mix(col, uFoamCol, foam);
    alpha = max(alpha, foam);
  }
  vec4 diffuseColor = vec4(col, alpha);`)
        .replace('#include <normal_fragment_begin>', `
  vec3 wn = normalize(vec3(-wav.y, 1.0, -wav.z));
  // gợn nhỏ: DistortionNormal (Water_Normal) lặp mỗi DistortionUVTiling m, trôi DistortionScrollSpeed/s theo hai hướng ngược nhau;
  // [ĐỀ XUẤT] độ mạnh = DistortionStrength × 0,25, tắt dần theo khoảng cách để khỏi răng cưa
  vec2 nuv = vWPos.xz / ${WM.DistortionUVTiling.toFixed(3)};
  float ns = ${WM.DistortionScrollSpeed.toFixed(4)} * uGameTime;
  vec2 n1 = texture2D(uNormalTex, nuv + vec2(ns, ns * 0.37)).rg * 2.0 - 1.0;
  vec2 n2 = texture2D(uNormalTex, nuv * 0.71 - vec2(ns * 0.53, ns)).rg * 2.0 - 1.0;
  float rk = ${(WM.DistortionStrength * 0.25).toFixed(4)} * (1.0 - smoothstep(30.0, 90.0, camD));
  wn = normalize(wn + vec3(n1.x + n2.x, 0.0, -(n1.y + n2.y)) * 0.5 * rk);
  vec3 normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  vec3 geometryNormal = normal;
  float faceDirection = 1.0;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // phản chiếu: Reflections bật, ReflectionStrength 0,5; [ĐỀ XUẤT] không có planar reflection nên phản màu SkyBlue theo Fresnel
  float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
  totalEmissiveRadiance += uSky * ${WM.ReflectionStrength.toFixed(3)} * fres * (1.0 - uNight * 0.8);`);
    };
    return m;
  }

  // ---- WaterController: thuộc tính nước tại thuyền ----
  const cur = { waterDepth: 1, foamColor: [1, 1, 1, 1], shallowColor: [0, 0, 0, 0], deepColor: [0, 0, 0, 0], modifier: null, k: 0 };
  function props() { return cur; }
  function updateProps(x, z) {
    const D = WCTL.default;
    let best = null, bk = 0;
    for (const m of WCTL.modifiers) {
      if (!m.enabled) continue;
      // GetProportionStrengthForPoint: Vector3.Distance (y của mặt nước ≈ y bộ điều chỉnh 0)
      const d = Math.hypot(x - m.pos[0], z - m.pos[2]);
      const k = d > m.partialValueRadius ? 0 : d < m.fullValueRadius ? 1 : 1 - (d - m.fullValueRadius) / (m.partialValueRadius - m.fullValueRadius);
      if (k > bk) { bk = k; best = m; }
    }
    const L = (a, b2) => a + (b2 - a) * bk, LC = (a, b2) => a.map((v, i) => L(v, b2[i]));
    const P = best || D;
    cur.waterDepth = L(D.waterDepth, P.waterDepth);
    cur.foamColor = LC(D.foamColor, P.foamColor); cur.shallowColor = LC(D.shallowColor, P.shallowColor); cur.deepColor = LC(D.deepColor, P.deepColor);
    cur.modifier = best ? best.name : null; cur.k = bk;
    // màu Inspector là sRGB; three.js tô trong không gian tuyến tính
    uniforms.uShallow.value.setRGB(cur.shallowColor[0], cur.shallowColor[1], cur.shallowColor[2]).convertSRGBToLinear();
    uniforms.uShallowA.value = cur.shallowColor[3];
    uniforms.uDeep.value.setRGB(cur.deepColor[0], cur.deepColor[1], cur.deepColor[2]).convertSRGBToLinear();
    uniforms.uFoamCol.value.setRGB(cur.foamColor[0], cur.foamColor[1], cur.foamColor[2]).convertSRGBToLinear();
    uniforms.uWaterDepth.value = cur.waterDepth;
  }

  function loadTex(key, linear) {
    const d = VFX && VFX.textures[key];
    const t = d ? new T.TextureLoader().load(d.src) : new T.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (!d) t.needsUpdate = true;
    if (!linear) t.encoding = T.LinearEncoding;
    return t;
  }

  function init(scene, w) {
    world = w;
    uniforms.uMask.value = w.maskTex;
    uniforms.uLand.value = w.landTex;
    const L = w.landBox;
    uniforms.uLandBox.value.set(L.x0, L.z0, 1 / L.w, 1 / L.h);
    uniforms.uNormalTex.value = loadTex('waterNormal');
    uniforms.uFoamTex.value = loadTex('waterTexture');
    const sky = VFX ? VFX.waterMaterial.colors.SkyBlue : [0.3176, 0.4196, 0.4824];
    uniforms.uSky.value.setRGB(sky[0], sky[1], sky[2]).convertSRGBToLinear();
    updateProps(10, -10);
    mesh = new T.Mesh(waterGeometry(256, 1400), waterMaterial());
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  let propT = 0;
  function update(dt, cx, cz, boat, env) {
    // mặt nước bám camera, chốt theo bước 4 m để đỉnh không trượt
    mesh.position.set(Math.round(cx / 4) * 4, 0, Math.round(cz / 4) * 4);
    uniforms.uNight.value = env.night;
    propT -= dt;
    if (propT <= 0 || !boat) { propT = 0.1; updateProps(boat ? boat.x : cx, boat ? boat.z : cz); }
  }
  function syncFog() { /* vệt cũ đã bỏ; giữ hàm cho nơi gọi cũ */ }

  root.DRWater = { init, update, wave, syncFog, props, uniforms, GLSL_WAVE, WAVES, get mesh() { return mesh; } };
})(window);
