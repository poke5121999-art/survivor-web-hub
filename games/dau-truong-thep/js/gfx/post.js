// Post chain, no EffectComposer: scene → HDR target (with depth) → AO (half res) → bloom down/up → composite (tone map, grade, vignette) → FXAA.
// One anti-aliasing method only (FXAA). `low` skips AO and FXAA and uses a short bloom chain.

import * as THREE from '../../vendor/three.module.min.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

const AO = `
  uniform sampler2D tDepth; uniform mat4 uInvProj; uniform vec2 uProj; uniform float uRadius; varying vec2 vUv;
  vec3 viewPos(vec2 uv) { vec4 c = vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0); vec4 v = uInvProj * c; return v.xyz / v.w; }
  void main() {
    vec3 p = viewPos(vUv);
    vec3 n = normalize(cross(dFdx(p), dFdy(p)));
    float rnd = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
    float occ = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 2.4 + rnd, r = (float(i) + 0.5) / 8.0 * uRadius;
      vec2 o = vec2(cos(a), sin(a)) * r * uProj / -p.z;
      vec3 d = viewPos(vUv + o) - p;
      float l = length(d) + 1e-4;
      occ += max(0.0, dot(n, d / l) - 0.1) * (1.0 - smoothstep(uRadius * 0.7, uRadius * 1.6, l));
    }
    gl_FragColor = vec4(vec3(clamp(1.0 - occ / 8.0 * 1.9, 0.0, 1.0)), 1.0);
  }`;

const BRIGHT = `
  uniform sampler2D tMap; uniform vec2 uPx; uniform float uThreshold; varying vec2 vUv;
  void main() {
    vec3 c = (texture2D(tMap, vUv + uPx * vec2(-1, -1)).rgb + texture2D(tMap, vUv + uPx * vec2(1, -1)).rgb + texture2D(tMap, vUv + uPx * vec2(-1, 1)).rgb + texture2D(tMap, vUv + uPx * vec2(1, 1)).rgb) * 0.25;
    float l = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(min(c * max(0.0, l - uThreshold) / max(l, 1e-4), vec3(12.0)), 1.0);
  }`;

const DOWN = `
  uniform sampler2D tMap; uniform vec2 uPx; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb * 4.0;
    c += texture2D(tMap, vUv + uPx * vec2(-1, -1)).rgb + texture2D(tMap, vUv + uPx * vec2(1, -1)).rgb + texture2D(tMap, vUv + uPx * vec2(-1, 1)).rgb + texture2D(tMap, vUv + uPx * vec2(1, 1)).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
  }`;

const UP = `
  uniform sampler2D tMap, tAdd; uniform vec2 uPx; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tMap, vUv + uPx * vec2(-1, 0)).rgb + texture2D(tMap, vUv + uPx * vec2(1, 0)).rgb + texture2D(tMap, vUv + uPx * vec2(0, -1)).rgb + texture2D(tMap, vUv + uPx * vec2(0, 1)).rgb;
    c = c * 0.166 + texture2D(tMap, vUv).rgb * 0.334;
    gl_FragColor = vec4(c + texture2D(tAdd, vUv).rgb, 1.0);
  }`;

const COMPOSITE = `
  uniform sampler2D tMap, tBloom, tAO; uniform float uBloom, uExposure, uAO; uniform vec2 uAOPx; varying vec2 vUv;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb;
    if (uAO > 0.0) {
      float ao = (texture2D(tAO, vUv + uAOPx * vec2(-0.5, -0.5)).r + texture2D(tAO, vUv + uAOPx * vec2(0.5, -0.5)).r + texture2D(tAO, vUv + uAOPx * vec2(-0.5, 0.5)).r + texture2D(tAO, vUv + uAOPx * vec2(0.5, 0.5)).r) * 0.25;
      c *= mix(1.0, ao, uAO * (1.0 - smoothstep(0.8, 2.0, max(c.r, max(c.g, c.b)))));
    }
    c += texture2D(tBloom, vUv).rgb * uBloom;
    c = aces(c * uExposure);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.14);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
    c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), 0.6);
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.5;
    c = pow(c, vec3(1.0 / 2.2));
    c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    gl_FragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));
  }`;

// FXAA 3.11 quality-lite: luma in alpha from the composite pass.
const FXAA = `
  uniform sampler2D tMap; uniform vec2 uPx; varying vec2 vUv;
  void main() {
    vec4 m = texture2D(tMap, vUv);
    float lN = texture2D(tMap, vUv + vec2(0, -uPx.y)).a, lS = texture2D(tMap, vUv + vec2(0, uPx.y)).a, lW = texture2D(tMap, vUv + vec2(-uPx.x, 0)).a, lE = texture2D(tMap, vUv + vec2(uPx.x, 0)).a;
    float lMin = min(m.a, min(min(lN, lS), min(lW, lE))), lMax = max(m.a, max(max(lN, lS), max(lW, lE))), range = lMax - lMin;
    if (range < max(0.04, lMax * 0.125)) { gl_FragColor = vec4(m.rgb, 1.0); return; }
    float lNW = texture2D(tMap, vUv + vec2(-uPx.x, -uPx.y)).a, lNE = texture2D(tMap, vUv + vec2(uPx.x, -uPx.y)).a, lSW = texture2D(tMap, vUv + vec2(-uPx.x, uPx.y)).a, lSE = texture2D(tMap, vUv + vec2(uPx.x, uPx.y)).a;
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uPx;
    vec3 a = 0.5 * (texture2D(tMap, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tMap, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec4 b4 = texture2D(tMap, vUv + dir * -0.5) + texture2D(tMap, vUv + dir * 0.5);
    vec3 b = a * 0.5 + 0.25 * b4.rgb;
    float lB = dot(b, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
  }`;

export function makePost(renderer, Q) {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad);
  const half = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  let hdr, ldr, ao, chain = [], W = 0, H = 0;
  const state = { ao: Q.ao, bloom: Q.bloom, fxaa: Q.fxaa };

  const mAO = pass(AO, { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Vector2() }, uRadius: { value: 0.9 } });
  mAO.extensions = { derivatives: true };
  const mBright = pass(BRIGHT, { tMap: { value: null }, uPx: { value: new THREE.Vector2() }, uThreshold: { value: 1.15 } });
  const mDown = pass(DOWN, { tMap: { value: null }, uPx: { value: new THREE.Vector2() } });
  const mUp = pass(UP, { tMap: { value: null }, tAdd: { value: null }, uPx: { value: new THREE.Vector2() } });
  const mComp = pass(COMPOSITE, { tMap: { value: null }, tBloom: { value: null }, tAO: { value: null }, uBloom: { value: 0.55 }, uExposure: { value: 1.0 }, uAO: { value: 0 }, uAOPx: { value: new THREE.Vector2() } });
  const mFxaa = pass(FXAA, { tMap: { value: null }, uPx: { value: new THREE.Vector2() } });

  function draw(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(scene, cam); }

  function resize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === W && h === H) return;
    W = w; H = h;
    for (const t of [hdr, ldr, ao, ...chain.flatMap((c) => [c.down, c.up])]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    hdr.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    ldr = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    ao = new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    chain = [];
    let cw = w, ch = h;
    for (let i = 0; i < Q.bloomLevels; i++) {
      cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1);
      chain.push({ w: cw, h: ch, down: new THREE.WebGLRenderTarget(cw, ch, half), up: new THREE.WebGLRenderTarget(cw, ch, half) });
    }
  }

  function render(sceneMain, camera) {
    renderer.setRenderTarget(hdr); renderer.render(sceneMain, camera);
    if (state.ao) {
      mAO.uniforms.tDepth.value = hdr.depthTexture;
      mAO.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      mAO.uniforms.uProj.value.set(camera.projectionMatrix.elements[0] * 0.5, camera.projectionMatrix.elements[5] * 0.5);
      draw(mAO, ao);
      mComp.uniforms.tAO.value = ao.texture; mComp.uniforms.uAOPx.value.set(1 / ao.width, 1 / ao.height);
    }
    mComp.uniforms.uAO.value = state.ao ? 0.85 : 0;
    if (state.bloom && chain.length) {
      mBright.uniforms.tMap.value = hdr.texture; mBright.uniforms.uPx.value.set(0.5 / W, 0.5 / H);
      draw(mBright, chain[0].down);
      for (let i = 1; i < chain.length; i++) {
        mDown.uniforms.tMap.value = chain[i - 1].down.texture; mDown.uniforms.uPx.value.set(0.5 / chain[i - 1].w, 0.5 / chain[i - 1].h);
        draw(mDown, chain[i].down);
      }
      let src = chain[chain.length - 1].down;
      for (let i = chain.length - 2; i >= 0; i--) {
        mUp.uniforms.tMap.value = src.texture; mUp.uniforms.tAdd.value = chain[i].down.texture; mUp.uniforms.uPx.value.set(1 / src.width, 1 / src.height);
        draw(mUp, chain[i].up); src = chain[i].up;
      }
      mComp.uniforms.tBloom.value = src.texture;
      mComp.uniforms.uBloom.value = Q.bloomGain / chain.length;
    } else mComp.uniforms.uBloom.value = 0;
    mComp.uniforms.tMap.value = hdr.texture;
    if (state.fxaa) {
      draw(mComp, ldr);
      mFxaa.uniforms.tMap.value = ldr.texture; mFxaa.uniforms.uPx.value.set(1 / W, 1 / H);
      draw(mFxaa, null);
    } else draw(mComp, null);
  }

  return { resize, render, state, uniforms: mComp.uniforms, get size() { return [W, H]; } };
}
