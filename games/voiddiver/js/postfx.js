// Hậu kỳ theo URP Volume gốc (ASSETS.md §4.1): Bloom (ngưỡng 1, cường độ 0.3), ColorAdjustments theo theme,
// Vignette, và hiệu ứng căng thẳng của StressPostProcessingScriptableData (tách RGB, xoay/nhịp "say sóng", glitch, hạt).
// Scene vẽ vào target HalfFloat mã hoá sRGB: material dựng sẵn tự mã hoá, Spine/VFX ghi thẳng như khi vẽ ra màn hình,
// nên màu giữ nguyên như không có hậu kỳ; giá trị >1 của VFX còn nguyên để bloom bắt.
(function (VD) {
  'use strict';
  const THREE = window.THREE;

  const P = {
    enabled: true, rt: null, bright: null, blurA: null, blurB: null, quad: null, cam: null,
    // Theme Town: contrast 20, saturation −35. Stress/DamageHp/LowHp là trọng số 0..1 do lớp lặn đặt.
    params: { bloom: 0.3, threshold: 1.0, contrast: 20, saturation: -35, exposure: 0, vignette: 0,
      stress: 0, damage: 0, lowHp: 0, stressTint: [0.8, 0.8, 1.0] },
  };

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  function mat(frag, uniforms) {
    return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  }

  const BRIGHT = `
uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b));
  float k = max(0.0, l - uThreshold) / max(l, 1e-4); gl_FragColor = vec4(c * k, 1.0); }`;
  const BLUR = `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 0.227027;
  s += texture2D(tSrc, vUv + uDir * 1.384615).rgb * 0.316216; s += texture2D(tSrc, vUv - uDir * 1.384615).rgb * 0.316216;
  s += texture2D(tSrc, vUv + uDir * 3.230769).rgb * 0.070270; s += texture2D(tSrc, vUv - uDir * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(s, 1.0); }`;
  // Số của StressPostProcessingScriptableData: _RGBSplitDegree 0.025, _MotionSickRotationAngle 1° chu kỳ 8 s,
  // _MotionSickPulseDegree 0.01 chu kỳ 5 s, _GlitchPulseDegree 0.005 scale 50 cutoff 0.5; VolumeProfile_Stress:
  // contrast 100, filter (0.8, 0.8, 1), vignette 0.5, grain 1, chromatic aberration 1.
  const FINAL = `
uniform sampler2D tSrc, tBloom; uniform float uBloom, uContrast, uSat, uExposure, uVig, uStress, uDamage, uLowHp, uTime;
uniform vec3 uStressTint; uniform vec2 uRes; varying vec2 vUv;
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
  col += texture2D(tBloom, uv).rgb * uBloom;
  // URP ColorAdjustments: phơi sáng, contrast trong không gian log quanh xám giữa 0.18, bão hoà trong tuyến tính.
  vec3 lin = pow(max(col, 0.0), vec3(2.2)) * exp2(uExposure);
  float con = 1.0 + (uContrast + 80.0 * s) / 100.0;
  lin = exp2((log2(max(lin, 1e-5)) - log2(0.18)) * con + log2(0.18));
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  lin = mix(vec3(l), lin, 1.0 + uSat / 100.0);
  lin *= mix(vec3(1.0), uStressTint, s);
  col = pow(lin, vec3(1.0 / 2.2));
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

  P.init = function () {
    const r = VD.render.renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false };
    P.rt = new THREE.WebGLRenderTarget(4, 4, opt);
    P.rt.texture.encoding = THREE.sRGBEncoding;
    const small = { type: THREE.HalfFloatType, depthBuffer: false };
    P.bright = new THREE.WebGLRenderTarget(4, 4, small);
    P.blurA = new THREE.WebGLRenderTarget(4, 4, small);
    P.blurB = new THREE.WebGLRenderTarget(4, 4, small);
    P.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    P.quad.frustumCulled = false;
    P.scene = new THREE.Scene(); P.scene.add(P.quad);
    P.mBright = mat(BRIGHT, { tSrc: { value: null }, uThreshold: { value: 1 } });
    P.mBlur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    P.mFinal = mat(FINAL, {
      tSrc: { value: null }, tBloom: { value: null }, uBloom: { value: 0.3 }, uContrast: { value: 20 }, uSat: { value: -35 },
      uExposure: { value: 0 }, uVig: { value: 0.25 }, uStress: { value: 0 }, uDamage: { value: 0 }, uLowHp: { value: 0 },
      uTime: { value: 0 }, uStressTint: { value: new THREE.Vector3(0.8, 0.8, 1) }, uRes: { value: new THREE.Vector2(1, 1) },
    });
    P.resize();
    addEventListener('resize', P.resize);
  };

  P.resize = function () {
    if (!P.rt) return;
    const r = VD.render.renderer, s = new THREE.Vector2();
    r.getDrawingBufferSize(s);
    P.rt.setSize(s.x, s.y);
    const bw = Math.max(1, s.x >> 2), bh = Math.max(1, s.y >> 2);
    P.bright.setSize(bw, bh); P.blurA.setSize(bw, bh); P.blurB.setSize(bw, bh);
    P.mFinal.uniforms.uRes.value.set(s.x, s.y);
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
    P.mBright.uniforms.tSrc.value = P.rt.texture; P.mBright.uniforms.uThreshold.value = p.threshold;
    pass(P.mBright, P.bright);
    const bw = P.bright.width, bh = P.bright.height;
    let src = P.bright;
    for (let i = 0; i < 2; i++) {
      P.mBlur.uniforms.tSrc.value = src.texture; P.mBlur.uniforms.uDir.value.set(1 / bw * (1 + i), 0); pass(P.mBlur, P.blurA);
      P.mBlur.uniforms.tSrc.value = P.blurA.texture; P.mBlur.uniforms.uDir.value.set(0, 1 / bh * (1 + i)); pass(P.mBlur, P.blurB);
      src = P.blurB;
    }
    const u = P.mFinal.uniforms;
    u.tSrc.value = P.rt.texture; u.tBloom.value = P.blurB.texture;
    u.uBloom.value = p.bloom * 3; u.uContrast.value = p.contrast; u.uSat.value = p.saturation; u.uExposure.value = p.exposure;
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
