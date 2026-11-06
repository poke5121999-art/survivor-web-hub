// Hậu kỳ theo URP Volume gốc (ASSETS.md §4.1): Bloom, ColorAdjustments theo theme, Vignette, và hiệu ứng căng thẳng
// của StressPostProcessingScriptableData (tách RGB, xoay/nhịp "say sóng", glitch, hạt).
// Scene vẽ vào target HalfFloat mã hoá sRGB: material dựng sẵn tự mã hoá, Spine/VFX ghi thẳng như khi vẽ ra màn hình,
// nên màu giữ nguyên như không có hậu kỳ; giá trị >1 của VFX còn nguyên để bloom bắt. Bloom và chỉnh màu làm trong
// không gian tuyến tính (giải sRGB chính xác, kể cả phần > 1) như URP.
//
// Bloom = thuật toán Bloom (Gaussian) của URP (BloomPostProcessPass + Bloom.shader), số của VolumeProfile_Main
// [ĐO tools/rip.py lens-dirt]: threshold 1, intensity 0,3, filter 0 Gaussian, downscale 0 Half, dirtTexture
// Img_Screen_LensDirt, dirtIntensity 30; scatter/clamp/maxIterations/highQualityFiltering không override → mặc định
// component: scatter 0,7, clamp 65472, 6 mip, lọc thường (bilinear).
//   1. Prefilter ở nửa độ phân giải: min(màu, clamp); ngưỡng mềm: knee = threshold·0,5,
//      soft = clamp(br − thr + knee, 0, 2knee)² / (4knee + 1e-4), màu *= max(br − thr, soft) / max(br, 1e-4) (br = max rgb).
//   2. Chuỗi mip: số mip = clamp(floor(log2(max(w, h)) − 1), 1, 6); mỗi mip: ngang 9 tap Gaussian lấy mẫu cách 2 texel
//      nguồn (thu 2×), dọc 5 tap (gộp 9 tap nhờ lọc bilinear).
//   3. Kéo lên: từ mip nhỏ nhất, up[i] = lerp(down[i], up[i+1], lerp(0,05, 0,95, scatter)).
//   4. Uber: màu += bloom·intensity (tint trắng); lens dirt: màu += dirt(uv khớp tỉ lệ)·dirtIntensity·bloom·intensity.
// Bản trước: 2 lượt blur ở ¼ độ phân giải, nhân ×3 tự chọn, ngưỡng cứng trên giá trị gamma.
(function (VD) {
  'use strict';
  const THREE = window.THREE;

  const P = {
    enabled: true, rt: null, down: [], up: [], mips: 0, quad: null, cam: null, dirt: null,
    // Theme Town: contrast 20, saturation −35. Stress/DamageHp/LowHp là trọng số 0..1 do lớp lặn đặt.
    params: { bloom: 0.3, threshold: 1.0, scatter: 0.7, clamp: 65472, maxIterations: 6, dirtIntensity: 30,
      contrast: 20, saturation: -35, exposure: 0, vignette: 0, stress: 0, damage: 0, lowHp: 0, stressTint: [0.8, 0.8, 1.0] },
  };

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const S2L = 'vec3 s2l(vec3 c){ c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }\n' +
    'vec3 l2s(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }\n';

  function mat(frag, uniforms) {
    return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  }

  // Prefilter (Bloom.shader FragPrefilter, không HQ): 4 mẫu = hộp 2×2 texel nguồn, giải sRGB từng mẫu.
  const PREFILTER = S2L + `
uniform sampler2D tSrc; uniform vec2 uSrcTexel; uniform vec4 uThr; varying vec2 vUv;
void main(){
  vec2 o = uSrcTexel * 0.5;
  vec3 c = s2l(texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb) + s2l(texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb)
         + s2l(texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb) + s2l(texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb);
  c = min(vec3(uThr.w), c * 0.25);
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThr.x + uThr.y, 0.0, 2.0 * uThr.y);
  soft = soft * soft / (4.0 * uThr.y + 1e-4);
  c *= max(br - uThr.x, soft) / max(br, 1e-4);
  gl_FragColor = vec4(c, 1.0);
}`;
  // FragBlurH: thu 2×, 9 tap, bước = 2 texel của nguồn
  const BLUR_H = `
uniform sampler2D tSrc; uniform vec2 uSrcTexel; varying vec2 vUv;
void main(){
  float t = uSrcTexel.x * 2.0;
  vec3 c = texture2D(tSrc, vUv - vec2(t * 4.0, 0.0)).rgb * 0.01621622
    + texture2D(tSrc, vUv - vec2(t * 3.0, 0.0)).rgb * 0.05405405
    + texture2D(tSrc, vUv - vec2(t * 2.0, 0.0)).rgb * 0.12162162
    + texture2D(tSrc, vUv - vec2(t, 0.0)).rgb * 0.19459459
    + texture2D(tSrc, vUv).rgb * 0.22702703
    + texture2D(tSrc, vUv + vec2(t, 0.0)).rgb * 0.19459459
    + texture2D(tSrc, vUv + vec2(t * 2.0, 0.0)).rgb * 0.12162162
    + texture2D(tSrc, vUv + vec2(t * 3.0, 0.0)).rgb * 0.05405405
    + texture2D(tSrc, vUv + vec2(t * 4.0, 0.0)).rgb * 0.01621622;
  gl_FragColor = vec4(c, 1.0);
}`;
  // FragBlurV: 5 tap tuyến tính = 9 tap Gaussian
  const BLUR_V = `
uniform sampler2D tSrc; uniform vec2 uSrcTexel; varying vec2 vUv;
void main(){
  float t = uSrcTexel.y;
  vec3 c = texture2D(tSrc, vUv - vec2(0.0, t * 3.23076923)).rgb * 0.07027027
    + texture2D(tSrc, vUv - vec2(0.0, t * 1.38461538)).rgb * 0.31621622
    + texture2D(tSrc, vUv).rgb * 0.22702703
    + texture2D(tSrc, vUv + vec2(0.0, t * 1.38461538)).rgb * 0.31621622
    + texture2D(tSrc, vUv + vec2(0.0, t * 3.23076923)).rgb * 0.07027027;
  gl_FragColor = vec4(c, 1.0);
}`;
  // FragUpsample (không HQ): lerp(mip cao, mip thấp lọc bilinear, scatter)
  const UPSAMPLE = `
uniform sampler2D tSrc; uniform sampler2D tLow; uniform float uScatter; varying vec2 vUv;
void main(){ gl_FragColor = vec4(mix(texture2D(tSrc, vUv).rgb, texture2D(tLow, vUv).rgb, uScatter), 1.0); }`;
  // Số của StressPostProcessingScriptableData: _RGBSplitDegree 0.025, _MotionSickRotationAngle 1° chu kỳ 8 s,
  // _MotionSickPulseDegree 0.01 chu kỳ 5 s, _GlitchPulseDegree 0.005 scale 50 cutoff 0.5; VolumeProfile_Stress:
  // contrast 100, filter (0.8, 0.8, 1), vignette 0.5, grain 1, chromatic aberration 1.
  const FINAL = S2L + `
uniform sampler2D tSrc, tBloom, tDirt; uniform float uBloom, uDirt, uContrast, uSat, uExposure, uVig, uStress, uDamage, uLowHp, uTime;
uniform vec3 uStressTint; uniform vec2 uRes; uniform vec4 uDirtST; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv, c = uv - 0.5;
  float s = uStress;
  float ang = radians(1.0) * sin(uTime * 6.2832 / 8.0) * s;
  c = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c;
  c *= 1.0 - 0.01 * s * (0.5 + 0.5 * sin(uTime * 6.2832 / 5.0));
  uv = c + 0.5;
  float band = step(0.5, h(vec2(floor(uv.y * 50.0), floor(uTime * 12.0))));
  uv.x += (h(vec2(floor(uTime * 20.0), floor(uv.y * 50.0))) - 0.5) * 0.005 * 2.0 * s * band * step(0.6, s);
  float split = 0.025 * s * 0.4 + 0.004 * uDamage;
  vec3 col;
  col.r = texture2D(tSrc, uv + vec2(split, 0.0)).r;
  col.g = texture2D(tSrc, uv).g;
  col.b = texture2D(tSrc, uv - vec2(split, 0.0)).b;
  vec3 lin = s2l(col);
  // URP Uber: bloom (tuyến tính) cộng trước chỉnh màu; lens dirt nhân với chính bloom
  vec3 bl = texture2D(tBloom, uv).rgb * uBloom;
  lin += bl;
  lin += s2l(texture2D(tDirt, uv * uDirtST.xy + uDirtST.zw).rgb) * uDirt * bl;
  // URP ColorAdjustments: phơi sáng, contrast trong không gian log quanh xám giữa 0.18, bão hoà trong tuyến tính.
  lin *= exp2(uExposure);
  float con = 1.0 + (uContrast + 80.0 * s) / 100.0;
  lin = exp2((log2(max(lin, 1e-5)) - log2(0.18)) * con + log2(0.18));
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  lin = mix(vec3(l), lin, 1.0 + uSat / 100.0);
  lin *= mix(vec3(1.0), uStressTint, s);
  col = l2s(lin);
  // URP Vignette: d = |uv − tâm| × cường độ × 3, vfactor = (1 − d·d)^(smoothness × 5), smoothness 0.2.
  float vi = uVig + 0.5 * s + 0.25 * uDamage;
  vec2 dv = abs(vUv - 0.5) * vi * 3.0; dv.x *= uRes.x / uRes.y;
  col *= pow(clamp(1.0 - dot(dv, dv), 0.0, 1.0), 1.0);
  float d = length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  vec3 red = vec3(0.55, 0.02, 0.02);
  float redEdge = smoothstep(0.35, 0.95, d);
  col = mix(col, red, redEdge * (0.25 * uDamage + 0.35 * uLowHp));
  col += (h(vUv * uRes + uTime) - 0.5) * 0.08 * s;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function target(w, h) {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    t.texture.generateMipmaps = false;
    return t;
  }

  P.init = function () {
    P.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    P.rt.texture.encoding = THREE.sRGBEncoding;
    P.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    P.quad.frustumCulled = false;
    P.scene = new THREE.Scene(); P.scene.add(P.quad);
    const tx = () => ({ value: new THREE.Vector2() });
    P.mPre = mat(PREFILTER, { tSrc: { value: null }, uSrcTexel: tx(), uThr: { value: new THREE.Vector4() } });
    P.mBlurH = mat(BLUR_H, { tSrc: { value: null }, uSrcTexel: tx() });
    P.mBlurV = mat(BLUR_V, { tSrc: { value: null }, uSrcTexel: tx() });
    P.mUp = mat(UPSAMPLE, { tSrc: { value: null }, tLow: { value: null }, uScatter: { value: 0.68 } });
    // Lens dirt: ảnh sRGB; chưa tải xong thì đen (không dirt)
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); black.needsUpdate = true;
    P.mFinal = mat(FINAL, {
      tSrc: { value: null }, tBloom: { value: null }, tDirt: { value: black }, uBloom: { value: 0.3 }, uDirt: { value: 30 },
      uDirtST: { value: new THREE.Vector4(1, 1, 0, 0) }, uContrast: { value: 20 }, uSat: { value: -35 },
      uExposure: { value: 0 }, uVig: { value: 0.25 }, uStress: { value: 0 }, uDamage: { value: 0 }, uLowHp: { value: 0 },
      uTime: { value: 0 }, uStressTint: { value: new THREE.Vector3(0.8, 0.8, 1) }, uRes: { value: new THREE.Vector2(1, 1) },
    });
    new THREE.TextureLoader().load('art/ui/postfx/lens_dirt.webp', t => {
      t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;   // linear clamp như sampler_LinearClamp của Uber
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      P.dirt = t; P.mFinal.uniforms.tDirt.value = t; P.resize();
    }, undefined, () => console.warn('postfx: không tải được art/ui/postfx/lens_dirt.webp'));
    P.resize();
    addEventListener('resize', P.resize);
  };

  P.resize = function () {
    if (!P.rt) return;
    const r = VD.render.renderer, s = new THREE.Vector2();
    r.getDrawingBufferSize(s);
    P.rt.setSize(s.x, s.y);
    // downscale Half; số mip theo cạnh dài của mip 0
    const tw = Math.max(1, s.x >> 1), th = Math.max(1, s.y >> 1);
    const n = Math.max(1, Math.min(P.params.maxIterations, Math.floor(Math.log2(Math.max(tw, th)) - 1)));
    for (let i = 0; i < n; i++) {
      const w = Math.max(1, tw >> i), h = Math.max(1, th >> i);
      if (!P.down[i]) { P.down[i] = target(w, h); P.up[i] = target(w, h); }
      else { P.down[i].setSize(w, h); P.up[i].setSize(w, h); }
    }
    P.mips = n;
    P.mFinal.uniforms.uRes.value.set(s.x, s.y);
    // dirt khớp tỉ lệ màn hình (BloomPostProcessPass: dirtScaleOffset)
    const st = P.mFinal.uniforms.uDirtST.value.set(1, 1, 0, 0);
    if (P.dirt && P.dirt.image) {
      const dr = P.dirt.image.width / P.dirt.image.height, sr = s.x / s.y;
      if (dr > sr) { st.x = sr / dr; st.z = (1 - st.x) * 0.5; } else if (sr > dr) { st.y = dr / sr; st.w = (1 - st.y) * 0.5; }
    }
  };

  function pass(m, target) {
    P.quad.material = m;
    VD.render.renderer.setRenderTarget(target);
    VD.render.renderer.render(P.scene, P.cam);
  }

  // Thay cho renderer.render(scene, camera) khi hậu kỳ bật.
  P.render = function (scene, camera, time) {
    const r = VD.render.renderer;
    if (!P.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    if (!P.rt) P.init();
    const p = P.params;
    r.setRenderTarget(P.rt); r.clear(); r.render(scene, camera);
    // URP: threshold nhập theo gamma → Mathf.GammaToLinearSpace; knee = 0,5·threshold
    const thr = p.threshold <= 0.04045 ? p.threshold / 12.92 : Math.pow((p.threshold + 0.055) / 1.055, 2.4);
    const pre = P.mPre.uniforms;
    pre.tSrc.value = P.rt.texture; pre.uSrcTexel.value.set(1 / P.rt.width, 1 / P.rt.height);
    pre.uThr.value.set(thr, thr * 0.5, 0, p.clamp);
    pass(P.mPre, P.down[0]);
    for (let i = 1; i < P.mips; i++) {
      const src = P.down[i - 1];
      P.mBlurH.uniforms.tSrc.value = src.texture; P.mBlurH.uniforms.uSrcTexel.value.set(1 / src.width, 1 / src.height);
      pass(P.mBlurH, P.up[i]);
      P.mBlurV.uniforms.tSrc.value = P.up[i].texture; P.mBlurV.uniforms.uSrcTexel.value.set(1 / P.up[i].width, 1 / P.up[i].height);
      pass(P.mBlurV, P.down[i]);
    }
    const sc = 0.05 + (0.95 - 0.05) * p.scatter;
    for (let i = P.mips - 2; i >= 0; i--) {
      const low = i === P.mips - 2 ? P.down[i + 1] : P.up[i + 1];
      P.mUp.uniforms.tSrc.value = P.down[i].texture; P.mUp.uniforms.tLow.value = low.texture; P.mUp.uniforms.uScatter.value = sc;
      pass(P.mUp, P.up[i]);
    }
    const u = P.mFinal.uniforms;
    u.tSrc.value = P.rt.texture; u.tBloom.value = (P.mips > 1 ? P.up[0] : P.down[0]).texture;
    u.uBloom.value = p.bloom; u.uDirt.value = P.dirt ? p.dirtIntensity : 0;
    u.uContrast.value = p.contrast; u.uSat.value = p.saturation; u.uExposure.value = p.exposure;
    u.uVig.value = p.vignette; u.uStress.value = p.stress; u.uDamage.value = p.damage; u.uLowHp.value = p.lowHp;
    u.uTime.value = time; u.uStressTint.value.set(p.stressTint[0], p.stressTint[1], p.stressTint[2]);
    pass(P.mFinal, null);
  };

  // DamageHp: lên 1 trong 0.1 s, về 0 lúc 1 s.
  P.hit = function () { P._hitT = 0; };
  P.update = function (dt) {
    if (P._hitT != null) {
      P._hitT += dt;
      P.params.damage = P._hitT < 0.1 ? P._hitT / 0.1 : Math.max(0, 1 - (P._hitT - 0.1) / 0.9);
      if (P._hitT > 1) P._hitT = null;
    }
  };

  VD.postfx = P;
})(window.VD = window.VD || {});
