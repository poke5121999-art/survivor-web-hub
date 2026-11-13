// Renderer, quality tiers, and the post chain:
// opaque scene (HDR + depth) -> AO (half res) -> composite with fog -> FX layer drawn on top
// (FX shaders depth-test by hand against the scene depth) -> bloom -> sun shafts -> grade -> FXAA.
(function () {
  'use strict';
  const PM = globalThis.PM;

  // One anti-aliasing method (FXAA in the last pass); low has none and is meant for phones.
  PM.QUALITY = {
    low: { dpr: 1, scale: 0.85, shadow: 1024, soft: false, ao: 0, rays: 0, bloom: 3, fxaa: false, tex: 256, parts: 0.45, cloudShells: 2, deco: 0.5, shadowEvery: 3 },
    medium: { dpr: 1.25, scale: 1, shadow: 2048, soft: true, ao: 8, rays: 24, bloom: 5, fxaa: true, tex: 512, parts: 1, cloudShells: 4, deco: 1, shadowEvery: 2 },
    high: { dpr: 1.75, scale: 1, shadow: 4096, soft: true, ao: 14, rays: 40, bloom: 6, fxaa: true, tex: 1024, parts: 1.6, cloudShells: 6, deco: 1.5, shadowEvery: 1 }
  };
  PM.QUALITY_ORDER = ['low', 'medium', 'high'];

  const VS = `in vec3 position; out vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,0.0,1.0); }`;
  const HEAD = `precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;\n`;
  const DEPTH_FN = `
    uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform vec2 uTan;
    float viewZ(vec2 uv){ float d = texture(tDepth, uv).x; return (uNear*uFar)/((uFar-uNear)*d-uFar); }
    vec3 viewPos(vec2 uv){ float z = viewZ(uv); return vec3((uv*2.0-1.0)*uTan*(-z), z); }`;

  const FS_AO = HEAD + DEPTH_FN + `
    uniform vec2 uTexel; uniform float uRadius;
    float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main(){
      float d = texture(tDepth, vUv).x;
      if (d >= 0.9999) { o = vec4(1.0); return; }
      vec3 p = viewPos(vUv);
      vec3 n = normalize(cross(dFdx(p), dFdy(p)));
      float rPix = uRadius / (-p.z * uTan.y) * 0.5;
      float phi = ign(gl_FragCoord.xy) * 6.2831853, occ = 0.0;
      for (int i = 0; i < AO_TAPS; i++) {
        float r = sqrt((float(i)+0.5)/float(AO_TAPS)), th = float(i)*2.39996323 + phi;
        vec2 uv = vUv + vec2(cos(th), sin(th)) * r * rPix * vec2(uTexel.y/uTexel.x, 1.0);
        vec3 v = viewPos(uv) - p;
        float dd = dot(v, v);
        occ += max(0.0, dot(v, n) - 0.06) / (dd + 0.25) * (1.0 - smoothstep(uRadius*uRadius, uRadius*uRadius*4.0, dd));
      }
      o = vec4(clamp(1.0 - occ * 2.2 / float(AO_TAPS), 0.0, 1.0));
    }`;

  const FS_AOBLUR = HEAD + DEPTH_FN + `
    uniform sampler2D tSrc; uniform vec2 uDir;
    void main(){
      float z0 = viewZ(vUv), sum = 0.0, wsum = 0.0;
      for (int i = -3; i <= 3; i++) {
        vec2 uv = vUv + uDir * float(i);
        float w = (1.0 - abs(float(i))/4.0) * step(abs(viewZ(uv) - z0), 0.8);
        sum += texture(tSrc, uv).x * w; wsum += w;
      }
      o = vec4(sum / max(wsum, 1e-4));
    }`;

  const FS_COMP = HEAD + DEPTH_FN + `
    uniform sampler2D tColor; uniform sampler2D tAO; uniform float uAoOn; uniform mat4 uCamWorld;
    uniform vec3 uFogCol; uniform vec3 uSunCol; uniform vec2 uSunUv; uniform float uFogStart; uniform float uFogDen; uniform float uSeaY; uniform float uMist;
    void main(){
      vec3 c = texture(tColor, vUv).rgb;
      float d = texture(tDepth, vUv).x;
      if (d < 0.9999) {
        float ao = mix(1.0, texture(tAO, vUv).x, uAoOn);
        c *= mix(vec3(0.42, 0.40, 0.52), vec3(1.0), ao);
        vec3 vp = viewPos(vUv);
        vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
        float dist = length(vp);
        float fog = 1.0 - exp(-max(0.0, dist - uFogStart) * uFogDen);
        float mist = uMist * exp(-max(0.0, wp.y - uSeaY) * 0.16) * smoothstep(0.0, 30.0, dist - uFogStart + 40.0);
        float glow = pow(max(0.0, 1.0 - distance(vUv, uSunUv) * 0.8), 3.0);
        vec3 fc = uFogCol + uSunCol * glow * 0.35;
        c = mix(c, fc, clamp(fog + mist * (0.25 + 0.75 * fog), 0.0, 1.0));
      }
      o = vec4(c, 1.0);
    }`;

  const FS_BLOOM_PRE = HEAD + `
    uniform sampler2D tSrc; uniform float uThresh;
    void main(){
      vec3 c = texture(tSrc, vUv).rgb;
      float l = max(c.r, max(c.g, c.b));
      float k = max(0.0, l - uThresh) / max(l, 1e-4);
      o = vec4(min(c * k, vec3(24.0)), 1.0);
    }`;
  const FS_DOWN = HEAD + `
    uniform sampler2D tSrc; uniform vec2 uTexel;
    void main(){
      vec3 c = texture(tSrc, vUv).rgb * 4.0;
      c += texture(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb;
      c += texture(tSrc, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture(tSrc, vUv + uTexel*vec2(1.0,1.0)).rgb;
      o = vec4(c / 8.0, 1.0);
    }`;
  const FS_UP = HEAD + `
    uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel; uniform float uMix;
    void main(){
      vec3 c = texture(tSrc, vUv + uTexel*vec2(-1.0,0.0)).rgb + texture(tSrc, vUv + uTexel*vec2(1.0,0.0)).rgb;
      c += texture(tSrc, vUv + uTexel*vec2(0.0,-1.0)).rgb + texture(tSrc, vUv + uTexel*vec2(0.0,1.0)).rgb;
      c = c * 0.166 + texture(tSrc, vUv).rgb * 0.334;
      o = vec4(texture(tAdd, vUv).rgb + c * uMix, 1.0);
    }`;
  const FS_RAYS = HEAD + `
    uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uSunUv; uniform float uOn;
    float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main(){
      vec2 dir = (uSunUv - vUv) / float(RAY_TAPS) * 0.85;
      vec2 uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < RAY_TAPS; i++) {
        float sky = step(0.9999, texture(tDepth, uv).x);
        vec3 c = texture(tSrc, uv).rgb;
        acc += min(c, vec3(10.0)) * sky * w * smoothstep(5.0, 12.0, max(c.r, max(c.g, c.b)));
        w *= 0.95; uv += dir;
      }
      o = vec4(acc / float(RAY_TAPS) * uOn, 1.0);
    }`;
  const FS_GRADE = HEAD + `
    uniform sampler2D tSrc; uniform sampler2D tBloom; uniform sampler2D tRays; uniform float uBloom; uniform float uRays; uniform float uExposure; uniform float uTime; uniform float uFlash; uniform vec3 uTint;
    vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 rt = vec2(0.006, 0.0); vec3 rays = (texture(tRays, vUv + rt.xy).rgb + texture(tRays, vUv - rt.xy).rgb + texture(tRays, vUv + rt.yx).rgb + texture(tRays, vUv - rt.yx).rgb + texture(tRays, vUv).rgb) * 0.2;
      vec3 c = texture(tSrc, vUv).rgb + texture(tBloom, vUv).rgb * uBloom + rays * uRays;
      c *= uExposure * (1.0 + uFlash);
      c = aces(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.12);
      c = mix(c * vec3(0.94, 0.98, 1.08), c * vec3(1.05, 1.0, 0.94), smoothstep(0.15, 0.75, l));
      c *= uTint;
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.55;
      c = pow(c, vec3(1.0/2.2));
      c += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) / 255.0 * 1.5;
      o = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));
    }`;
  const FS_FXAA = HEAD + `
    uniform sampler2D tSrc; uniform vec2 uTexel;
    void main(){
      float lM = texture(tSrc, vUv).a;
      float lNW = texture(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).a, lNE = texture(tSrc, vUv + uTexel*vec2(1.0,-1.0)).a;
      float lSW = texture(tSrc, vUv + uTexel*vec2(-1.0,1.0)).a, lSE = texture(tSrc, vUv + uTexel*vec2(1.0,1.0)).a;
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uTexel;
      vec4 a = 0.5 * (texture(tSrc, vUv + dir*(1.0/3.0-0.5)) + texture(tSrc, vUv + dir*(2.0/3.0-0.5)));
      vec4 b = a * 0.5 + 0.25 * (texture(tSrc, vUv + dir*-0.5) + texture(tSrc, vUv + dir*0.5));
      o = vec4((b.a < lMin || b.a > lMax) ? a.rgb : b.rgb, 1.0);
    }`;
  const FS_COPY = HEAD + `uniform sampler2D tSrc; void main(){ o = vec4(texture(tSrc, vUv).rgb, 1.0); }`;

  PM.Gfx = function (G) {
    const THREE = globalThis.THREE;
    const canvas = G.canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = true;
    renderer.info.autoReset = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    G.renderer = renderer;

    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const quad = new THREE.Mesh(tri, null);
    quad.frustumCulled = false;
    const qScene = new THREE.Scene(); qScene.add(quad);
    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = (fs, uniforms, defines) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: fs, uniforms, defines: defines || {}, depthTest: false, depthWrite: false });
    const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
    const U = (v) => ({ value: v });

    // FX materials (particles, beams, shields) read the scene depth through these shared uniforms.
    const depthU = { tDepth: U(null), uNear: U(1), uFar: U(1000), uRes: U(new THREE.Vector2(1, 1)) };
    const dU = () => ({ tDepth: depthU.tDepth, uNear: depthU.uNear, uFar: depthU.uFar, uTan: U(new THREE.Vector2()) });

    const env = { fogCol: new THREE.Color(0.8, 0.7, 0.7), sunCol: new THREE.Color(1, 0.8, 0.6), sunDir: new THREE.Vector3(-0.7, 0.3, -0.6).normalize(), fogStart: 110, fogDen: 0.006, seaY: 6, mist: 0.5, exposure: 1, bloom: 0.5, rays: 0.6, tint: new THREE.Color(1, 1, 1) };

    let q = null, qName = '', rt = null, mats = null, scale = 1, W = 1, H = 1;
    const sunUv = new THREE.Vector2(0.5, 0.5);
    const g = { renderer, env, depthU, flash: 0, time: 0 };

    function makeTargets() {
      if (rt) for (const k in rt) { if (Array.isArray(rt[k])) rt[k].forEach((t) => t.dispose()); else rt[k].dispose(); }
      const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      const hw = Math.max(2, W >> 1), hh = Math.max(2, H >> 1);
      rt = {};
      rt.scene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
      rt.scene.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
      rt.scene.depthTexture.minFilter = rt.scene.depthTexture.magFilter = THREE.NearestFilter;
      rt.hdr = new THREE.WebGLRenderTarget(W, H, hf);
      rt.aoA = new THREE.WebGLRenderTarget(hw, hh, { format: THREE.RedFormat, depthBuffer: false });
      rt.aoB = new THREE.WebGLRenderTarget(hw, hh, { format: THREE.RedFormat, depthBuffer: false });
      rt.rays = new THREE.WebGLRenderTarget(Math.max(2, W >> 2), Math.max(2, H >> 2), hf);
      rt.ldr = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
      rt.bloom = []; rt.bloomUp = [];
      let bw = hw, bh = hh;
      for (let i = 0; i < q.bloom; i++) {
        rt.bloom.push(new THREE.WebGLRenderTarget(bw, bh, hf));
        if (i < q.bloom - 1) rt.bloomUp.push(new THREE.WebGLRenderTarget(bw, bh, hf));
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      }
      depthU.tDepth.value = rt.scene.depthTexture;
      depthU.uRes.value.set(W, H);
    }

    function makeMats() {
      if (mats) for (const k in mats) mats[k].dispose();
      mats = {
        ao: mat(FS_AO, Object.assign(dU(), { uTexel: U(new THREE.Vector2()), uRadius: U(1.6) }), { AO_TAPS: Math.max(1, q.ao) }),
        aoBlur: mat(FS_AOBLUR, Object.assign(dU(), { tSrc: U(null), uDir: U(new THREE.Vector2()) })),
        comp: mat(FS_COMP, Object.assign(dU(), { tColor: U(null), tAO: U(null), uAoOn: U(0), uCamWorld: U(new THREE.Matrix4()), uFogCol: U(env.fogCol), uSunCol: U(env.sunCol), uSunUv: U(sunUv), uFogStart: U(0), uFogDen: U(0), uSeaY: U(0), uMist: U(0) })),
        pre: mat(FS_BLOOM_PRE, { tSrc: U(null), uThresh: U(1.7) }),
        down: mat(FS_DOWN, { tSrc: U(null), uTexel: U(new THREE.Vector2()) }),
        up: mat(FS_UP, { tSrc: U(null), tAdd: U(null), uTexel: U(new THREE.Vector2()), uMix: U(1) }),
        rays: mat(FS_RAYS, { tSrc: U(null), tDepth: depthU.tDepth, uSunUv: U(sunUv), uOn: U(1) }, { RAY_TAPS: Math.max(1, q.rays) }),
        grade: mat(FS_GRADE, { tSrc: U(null), tBloom: U(null), tRays: U(null), uBloom: U(0.5), uRays: U(0), uExposure: U(1), uTime: U(0), uFlash: U(0), uTint: U(env.tint) }),
        fxaa: mat(FS_FXAA, { tSrc: U(null), uTexel: U(new THREE.Vector2()) }),
        copy: mat(FS_COPY, { tSrc: U(null) })
      };
    }

    g.resize = function () {
      const cw = canvas.clientWidth || globalThis.innerWidth, ch = canvas.clientHeight || globalThis.innerHeight;
      const dpr = Math.min(globalThis.devicePixelRatio || 1, q.dpr) * q.scale * scale;
      const w = Math.max(64, Math.round(cw * dpr)), h = Math.max(64, Math.round(ch * dpr));
      if (w === W && h === H && rt) return;
      W = w; H = h;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      makeTargets();
      if (G.camera) { G.camera.aspect = cw / ch; G.camera.updateProjectionMatrix(); }
    };

    g.setQuality = function (name) {
      if (!PM.QUALITY[name]) name = 'medium';
      qName = name; q = PM.QUALITY[name]; G.quality = q; G.qualityName = name;
      renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      makeMats(); W = H = 0;
      g.resize();
      G.bus.emit('quality', { name, q });
    };

    // Resolution governor: reacts at ~20 ms frames, long before a tier change is needed.
    const gov = { ms: 16, slow: 0, fast: 0, floor: 0, on: !PM.params.nogov };
    g.governor = function (dtMs) {
      gov.ms += (dtMs - gov.ms) * 0.08;
      if (!gov.on) return;
      const dt = dtMs / 1000;
      if (gov.ms > 20) { gov.slow += dt; gov.fast = 0; } else if (gov.ms < 13) { gov.fast += dt; gov.slow = 0; } else { gov.slow = 0; gov.fast = 0; }
      if (gov.slow > 0.75) {
        gov.slow = 0;
        if (scale > 0.55) { scale = Math.max(0.5, scale - 0.1); W = 0; g.resize(); }
        else if ((gov.floor += 0.75) > 2) {
          const i = PM.QUALITY_ORDER.indexOf(qName);
          if (i > 0) { gov.floor = 0; scale = 0.8; g.setQuality(PM.QUALITY_ORDER[i - 1]); G.bus.emit('quality:auto', { name: qName }); }
        }
      } else if (gov.fast > 3 && scale < 1) { gov.fast = 0; gov.floor = 0; scale = Math.min(1, scale + 0.05); W = 0; g.resize(); }
    };
    g.stats = () => ({ ms: gov.ms, scale, quality: qName, w: W, h: H });

    const v3 = new THREE.Vector3();
    let frame = 0;
    g.render = function (scene, camera, dt) {
      frame++; g.time += dt; g.flash = Math.max(0, g.flash - dt * 6);
      renderer.info.reset();
      if (frame % q.shadowEvery === 0 || g.shadowDirty) { renderer.shadowMap.needsUpdate = true; g.shadowDirty = false; }
      const tanY = Math.tan(camera.fov * Math.PI / 360), tanX = tanY * camera.aspect;
      depthU.uNear.value = camera.near; depthU.uFar.value = camera.far;
      for (const k of ['ao', 'aoBlur', 'comp']) mats[k].uniforms.uTan.value.set(tanX, tanY);

      camera.layers.set(0);
      renderer.setRenderTarget(rt.scene);
      renderer.render(scene, camera);

      if (q.ao) {
        mats.ao.uniforms.uTexel.value.set(1 / rt.aoA.width, 1 / rt.aoA.height);
        pass(mats.ao, rt.aoA);
        mats.aoBlur.uniforms.tSrc.value = rt.aoA.texture; mats.aoBlur.uniforms.uDir.value.set(1 / rt.aoA.width, 0); pass(mats.aoBlur, rt.aoB);
        mats.aoBlur.uniforms.tSrc.value = rt.aoB.texture; mats.aoBlur.uniforms.uDir.value.set(0, 1 / rt.aoA.height); pass(mats.aoBlur, rt.aoA);
      }
      v3.copy(camera.position).addScaledVector(env.sunDir, 1000).project(camera);
      const behind = v3.z > 1;
      sunUv.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
      const cu = mats.comp.uniforms;
      cu.tColor.value = rt.scene.texture; cu.tAO.value = rt.aoA.texture; cu.uAoOn.value = q.ao ? 1 : 0;
      cu.uCamWorld.value.copy(camera.matrixWorld);
      cu.uFogStart.value = env.fogStart; cu.uFogDen.value = env.fogDen; cu.uSeaY.value = env.seaY; cu.uMist.value = env.mist;
      pass(mats.comp, rt.hdr);

      camera.layers.set(1);
      renderer.autoClear = false;
      renderer.setRenderTarget(rt.hdr);
      renderer.render(scene, camera);
      renderer.autoClear = true;
      camera.layers.set(0);

      mats.pre.uniforms.tSrc.value = rt.hdr.texture; pass(mats.pre, rt.bloom[0]);
      for (let i = 1; i < rt.bloom.length; i++) {
        mats.down.uniforms.tSrc.value = rt.bloom[i - 1].texture; mats.down.uniforms.uTexel.value.set(1 / rt.bloom[i - 1].width, 1 / rt.bloom[i - 1].height);
        pass(mats.down, rt.bloom[i]);
      }
      let src = rt.bloom[rt.bloom.length - 1];
      for (let i = rt.bloom.length - 2; i >= 0; i--) {
        const uu = mats.up.uniforms;
        uu.tSrc.value = src.texture; uu.tAdd.value = rt.bloom[i].texture; uu.uTexel.value.set(1 / src.width, 1 / src.height);
        pass(mats.up, rt.bloomUp[i]); src = rt.bloomUp[i];
      }
      const raysOn = q.rays && !behind && Math.abs(v3.x) < 1.8 && Math.abs(v3.y) < 1.8;
      if (raysOn) { mats.rays.uniforms.tSrc.value = rt.hdr.texture; pass(mats.rays, rt.rays); }

      const gu = mats.grade.uniforms;
      gu.tSrc.value = rt.hdr.texture; gu.tBloom.value = src.texture; gu.tRays.value = rt.rays.texture;
      gu.uBloom.value = env.bloom / Math.max(1, rt.bloom.length * 0.5); gu.uRays.value = raysOn ? env.rays : 0; gu.uExposure.value = env.exposure; gu.uTime.value = g.time; gu.uFlash.value = g.flash;
      if (q.fxaa) {
        pass(mats.grade, rt.ldr);
        mats.fxaa.uniforms.tSrc.value = rt.ldr.texture; mats.fxaa.uniforms.uTexel.value.set(1 / W, 1 / H);
        pass(mats.fxaa, null);
      } else pass(mats.grade, null);
    };

    g.info = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geoms: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
    g.fullscreen = { pass, mat, quad };
    return g;
  };
})();
