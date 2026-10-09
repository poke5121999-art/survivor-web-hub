// Hậu kỳ: bloom + nhoè xuyên tâm khi phun + vignette.
// Bloom theo thuật toán Gaussian nhiều mip đã dùng ở games/voiddiver/js/postfx.js. Số lấy từ profile gốc
// postprocess/profiles/legacy NssBloomFlare: threshhold 0,6, intensity 1 (ở đây 0,55: bản gốc cộng trong gamma, web
// cộng trong tuyến tính nên cùng số thì loá hơn). Nhoè xuyên tâm là hiệu ứng tốc độ khi phun; tâm đặt hơi trên giữa
// màn (MangaSpeedLine gốc PosY 0,6) vì điểm tụ của đường nằm ở đó với camera bám sau xe.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const P = { enabled: true, rt: null, down: [], up: [], mips: 0,
    params: { bloom: 0.4, threshold: 0.72, scatter: 0.7, radial: 0, vignette: 0.22, flash: 0, sat: 0 } };

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const S2L = 'vec3 s2l(vec3 c){ c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }\n' +
    'vec3 l2s(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }\n';
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

  const PREFILTER = S2L + `
uniform sampler2D tSrc; uniform vec2 uSrcTexel; uniform vec2 uThr; varying vec2 vUv;
void main(){
  vec2 o = uSrcTexel * 0.5;
  vec3 c = s2l(texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb) + s2l(texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb)
         + s2l(texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb) + s2l(texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb);
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThr.x + uThr.y, 0.0, 2.0 * uThr.y);
  soft = soft * soft / (4.0 * uThr.y + 1e-4);
  c *= max(br - uThr.x, soft) / max(br, 1e-4);
  gl_FragColor = vec4(c, 1.0);
}`;
  const BLUR_H = `
uniform sampler2D tSrc; uniform vec2 uSrcTexel; varying vec2 vUv;
void main(){
  float t = uSrcTexel.x * 2.0;
  vec3 c = texture2D(tSrc, vUv - vec2(t * 4.0, 0.0)).rgb * 0.01621622 + texture2D(tSrc, vUv - vec2(t * 3.0, 0.0)).rgb * 0.05405405
    + texture2D(tSrc, vUv - vec2(t * 2.0, 0.0)).rgb * 0.12162162 + texture2D(tSrc, vUv - vec2(t, 0.0)).rgb * 0.19459459
    + texture2D(tSrc, vUv).rgb * 0.22702703 + texture2D(tSrc, vUv + vec2(t, 0.0)).rgb * 0.19459459
    + texture2D(tSrc, vUv + vec2(t * 2.0, 0.0)).rgb * 0.12162162 + texture2D(tSrc, vUv + vec2(t * 3.0, 0.0)).rgb * 0.05405405
    + texture2D(tSrc, vUv + vec2(t * 4.0, 0.0)).rgb * 0.01621622;
  gl_FragColor = vec4(c, 1.0);
}`;
  const BLUR_V = `
uniform sampler2D tSrc; uniform vec2 uSrcTexel; varying vec2 vUv;
void main(){
  float t = uSrcTexel.y;
  vec3 c = texture2D(tSrc, vUv - vec2(0.0, t * 3.23076923)).rgb * 0.07027027 + texture2D(tSrc, vUv - vec2(0.0, t * 1.38461538)).rgb * 0.31621622
    + texture2D(tSrc, vUv).rgb * 0.22702703 + texture2D(tSrc, vUv + vec2(0.0, t * 1.38461538)).rgb * 0.31621622
    + texture2D(tSrc, vUv + vec2(0.0, t * 3.23076923)).rgb * 0.07027027;
  gl_FragColor = vec4(c, 1.0);
}`;
  const UPSAMPLE = `
uniform sampler2D tSrc; uniform sampler2D tLow; uniform float uScatter; varying vec2 vUv;
void main(){ gl_FragColor = vec4(mix(texture2D(tSrc, vUv).rgb, texture2D(tLow, vUv).rgb, uScatter), 1.0); }`;
  const FINAL = S2L + `
uniform sampler2D tSrc, tBloom; uniform float uBloom, uRadial, uVig, uFlash, uSat; uniform vec2 uRes, uCenter; varying vec2 vUv;
void main(){
  vec2 d = uCenter - vUv;
  float r = length(d * vec2(uRes.x / uRes.y, 1.0));
  vec3 col = texture2D(tSrc, vUv).rgb;
  if (uRadial > 0.001) {
    float k = uRadial * smoothstep(0.12, 0.75, r) * 0.085;
    vec3 acc = col;
    for (int i = 1; i < 10; i++) acc += texture2D(tSrc, vUv + d * k * float(i) / 9.0).rgb;
    col = acc / 10.0;
  }
  vec3 lin = s2l(col) + texture2D(tBloom, vUv).rgb * uBloom;
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  lin = mix(vec3(l), lin, 1.0 + uSat);
  lin += uFlash;
  col = l2s(lin);
  vec2 dv = abs(vUv - 0.5) * (uVig + uRadial * 0.08) * 3.0; dv.x *= uRes.x / uRes.y;
  col *= clamp(1.0 - dot(dv, dv) * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function target(w, h) {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    t.texture.generateMipmaps = false;
    return t;
  }

  P.init = function (renderer) {
    P.r = renderer;
    P.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false, samples: 0 });
    // Đường đua vẽ theo gamma như bản gốc (shader tự viết ghi thẳng màu hiển thị); material PBR của xe mã hoá sRGB khi
    // target là sRGB. Nhờ vậy mọi thứ trong target đều là màu hiển thị, pass cuối giải về tuyến tính để cộng bloom.
    P.rt.texture.encoding = THREE.sRGBEncoding;
    P.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    P.quad.frustumCulled = false;
    P.scene = new THREE.Scene(); P.scene.add(P.quad);
    const v2 = () => ({ value: new THREE.Vector2() });
    P.mPre = mat(PREFILTER, { tSrc: { value: null }, uSrcTexel: v2(), uThr: v2() });
    P.mBlurH = mat(BLUR_H, { tSrc: { value: null }, uSrcTexel: v2() });
    P.mBlurV = mat(BLUR_V, { tSrc: { value: null }, uSrcTexel: v2() });
    P.mUp = mat(UPSAMPLE, { tSrc: { value: null }, tLow: { value: null }, uScatter: { value: 0.68 } });
    P.mFinal = mat(FINAL, { tSrc: { value: null }, tBloom: { value: null }, uBloom: { value: 0 }, uRadial: { value: 0 },
      uVig: { value: 0 }, uFlash: { value: 0 }, uSat: { value: 0 }, uRes: v2(), uCenter: { value: new THREE.Vector2(0.5, 0.56) } });
    P.resize();
  };

  P.resize = function () {
    if (!P.rt) return;
    const s = new THREE.Vector2();
    P.r.getDrawingBufferSize(s);
    P.rt.setSize(s.x, s.y);
    const tw = Math.max(1, s.x >> 1), th = Math.max(1, s.y >> 1);
    const n = Math.max(1, Math.min(5, Math.floor(Math.log2(Math.max(tw, th)) - 1)));
    for (let i = 0; i < n; i++) {
      const w = Math.max(1, tw >> i), h = Math.max(1, th >> i);
      if (!P.down[i]) { P.down[i] = target(w, h); P.up[i] = target(w, h); } else { P.down[i].setSize(w, h); P.up[i].setSize(w, h); }
    }
    P.mips = n;
    P.mFinal.uniforms.uRes.value.set(s.x, s.y);
  };

  function pass(m, tgt) { P.quad.material = m; P.r.setRenderTarget(tgt); P.r.render(P.scene, P.cam); }

  P.render = function (scene, camera) {
    const r = P.r;
    if (!P.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    const p = P.params;
    r.setRenderTarget(P.rt); r.clear(); r.render(scene, camera);
    const thr = Math.pow((p.threshold + 0.055) / 1.055, 2.4);
    P.mPre.uniforms.tSrc.value = P.rt.texture; P.mPre.uniforms.uSrcTexel.value.set(1 / P.rt.width, 1 / P.rt.height);
    P.mPre.uniforms.uThr.value.set(thr, thr * 0.5);
    pass(P.mPre, P.down[0]);
    for (let i = 1; i < P.mips; i++) {
      const src = P.down[i - 1];
      P.mBlurH.uniforms.tSrc.value = src.texture; P.mBlurH.uniforms.uSrcTexel.value.set(1 / src.width, 1 / src.height);
      pass(P.mBlurH, P.up[i]);
      P.mBlurV.uniforms.tSrc.value = P.up[i].texture; P.mBlurV.uniforms.uSrcTexel.value.set(1 / P.up[i].width, 1 / P.up[i].height);
      pass(P.mBlurV, P.down[i]);
    }
    const sc = 0.05 + 0.9 * p.scatter;
    for (let i = P.mips - 2; i >= 0; i--) {
      P.mUp.uniforms.tSrc.value = P.down[i].texture;
      P.mUp.uniforms.tLow.value = (i === P.mips - 2 ? P.down[i + 1] : P.up[i + 1]).texture;
      P.mUp.uniforms.uScatter.value = sc;
      pass(P.mUp, P.up[i]);
    }
    const u = P.mFinal.uniforms;
    u.tSrc.value = P.rt.texture; u.tBloom.value = (P.mips > 1 ? P.up[0] : P.down[0]).texture;
    u.uBloom.value = p.bloom; u.uRadial.value = p.radial; u.uVig.value = p.vignette; u.uFlash.value = p.flash; u.uSat.value = p.sat;
    pass(P.mFinal, null);
  };

  TD.postfx = P;
})(globalThis.TD = globalThis.TD || {});
