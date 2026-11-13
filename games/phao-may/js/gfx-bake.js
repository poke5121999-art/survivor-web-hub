// PBR texture sets baked on the GPU at boot (albedo, AO/roughness/metal/height, normal), and the
// MeshStandardMaterial patch that maps them triplanar so no model needs UVs.
(function () {
  'use strict';
  const PM = globalThis.PM;

  const LIB = `
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n + 17.1)); }
    float pn(vec2 p, float per){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      float a = h21(mod(i, per)), b = h21(mod(i+vec2(1,0), per)), c = h21(mod(i+vec2(0,1), per)), d = h21(mod(i+vec2(1,1), per));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
    float fbm(vec2 uv, float per, int oct){ float v = 0.0, a = 0.5; vec2 p = uv*per;
      for (int i = 0; i < 7; i++) { if (i >= oct) break; v += a*pn(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return v; }
    vec3 vor(vec2 uv, float per){ vec2 p = uv*per, i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 c = mod(i+g, per);
        vec2 o = h22(c); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; id = h21(c+3.7); } else if (d < d2) d2 = d; }
      return vec3(d1, d2, id); }
    float ridge(vec2 uv, float per, int oct){ float v = 0.0, a = 0.5; vec2 p = uv*per;
      for (int i = 0; i < 6; i++) { if (i >= oct) break; v += a*(1.0-abs(pn(p, per)*2.0-1.0)); p *= 2.0; per *= 2.0; a *= 0.5; } return v; }`;

  // Each set writes: alb (linear colour), rough, metal, ao, h (height 0..1).
  const SETS = {
    soil: `float n = fbm(uv, 5.0, 6); float gr = fbm(uv + 3.1, 40.0, 3); float clod = fbm(uv + 6.2, 12.0, 4);
      alb = mix(vec3(0.16, 0.095, 0.05), vec3(0.33, 0.20, 0.115), n*0.6 + clod*0.4) * (0.82 + 0.3*gr);
      rough = 0.93; metal = 0.0; h = n*0.4 + clod*0.4 + gr*0.2; ao = 0.7 + 0.3*smoothstep(0.2, 0.6, h);`,
    rock: `float n = fbm(uv, 4.0, 6); float fine = fbm(uv, 28.0, 4); float fr = ridge(uv + n*0.2, 3.0, 5);
      alb = mix(vec3(0.15, 0.17, 0.23), vec3(0.27, 0.29, 0.35), n) * (0.85 + 0.3*fine);
      rough = 0.82 - 0.15*fr; metal = 0.0; h = fr*0.5 + fine*0.3 + n*0.2; ao = 0.8 + 0.2*fr;`,
    grass: `float n = fbm(uv, 7.0, 5); float bl = fbm(vec2(uv.x*1.0, uv.y*0.25) + 5.0, 96.0, 3); vec3 v = vor(uv, 30.0);
      alb = mix(vec3(0.07, 0.19, 0.035), vec3(0.24, 0.42, 0.07), n*0.55 + bl*0.45);
      alb = mix(alb, vec3(0.40, 0.46, 0.12), smoothstep(0.75, 1.0, v.z) * 0.5);
      rough = 0.8; metal = 0.0; h = bl*0.6 + n*0.4; ao = 0.6 + 0.4*bl;`,
    leaf: `vec3 v = vor(uv, 26.0); vec3 v2 = vor(uv + 0.37, 52.0); float n = fbm(uv, 6.0, 4);
      float edge = smoothstep(0.0, 0.12, v.y - v.x);
      alb = mix(vec3(0.035, 0.13, 0.04), vec3(0.14, 0.34, 0.07), v.z*0.6 + n*0.4) * (0.55 + 0.45*edge);
      alb = mix(alb, vec3(0.34, 0.50, 0.12), step(0.86, v2.z) * 0.6);
      rough = 0.55 + 0.25*v.z; metal = 0.0; h = edge*0.6 + (1.0 - v.x)*0.4; ao = 0.45 + 0.55*edge;`,
    bronze: `float n = fbm(uv, 4.0, 6); vec3 v = vor(uv, 18.0); float dent = (1.0 - smoothstep(0.0, 0.55, v.x));
      float scr = smoothstep(0.66, 0.72, fbm(vec2(uv.x*3.0, uv.y*70.0), 8.0, 3)) * 0.5;
      float tarn = smoothstep(0.35, 0.75, fbm(uv + 7.3, 5.0, 5));
      float pat = smoothstep(0.7, 0.8, fbm(uv + 2.1, 12.0, 5)) * tarn;
      alb = mix(vec3(0.92, 0.60, 0.26), vec3(0.62, 0.36, 0.16), tarn*0.7); alb = mix(alb, vec3(1.0, 0.84, 0.55), scr);
      alb = mix(alb, vec3(0.20, 0.44, 0.38), pat*0.8);
      rough = mix(0.24 + 0.14*n - scr*0.08, 0.5, tarn*0.6) + pat*0.3; metal = 1.0 - pat*0.7; h = 0.5 + dent*0.12 + n*0.15 - pat*0.05 - scr*0.05; ao = 1.0 - tarn*0.15;`,
    paint: `float n = fbm(uv, 5.0, 6); float chip = smoothstep(0.76, 0.79, fbm(uv + 2.9, 14.0, 6) + 0.1*fbm(uv, 70.0, 2));
      float scr = smoothstep(0.74, 0.78, fbm(vec2(uv.x*60.0, uv.y*2.0) + 4.0, 8.0, 3)) * 0.6;
      float dirt = fbm(uv + 9.0, 3.0, 5);
      alb = vec3(0.95) * (0.9 + 0.12*n) * (0.82 + 0.18*smoothstep(0.3, 0.7, dirt));
      alb = mix(alb, vec3(0.30, 0.28, 0.27), max(chip, scr));
      rough = mix(0.3 + 0.16*n, 0.5, chip); metal = max(chip, scr) * 0.9; h = 0.6 - chip*0.2 - scr*0.08 + n*0.05; ao = 1.0 - chip*0.15;`,
    steel: `float n = fbm(uv, 6.0, 5); float br = fbm(vec2(uv.x*2.0, uv.y*90.0), 8.0, 3);
      float rust = smoothstep(0.62, 0.8, fbm(uv + 4.4, 7.0, 6));
      alb = mix(vec3(0.20, 0.21, 0.23), vec3(0.42, 0.43, 0.46), br*0.6 + n*0.4);
      alb = mix(alb, vec3(0.30, 0.13, 0.05), rust*0.7);
      rough = mix(0.3 + 0.25*br, 0.9, rust); metal = 1.0 - rust*0.8; h = br*0.3 + n*0.3 + rust*0.2; ao = 1.0;`,
    wood: `float g = fbm(vec2(uv.x*3.0, uv.y*40.0), 6.0, 5); float n = fbm(uv, 5.0, 5); float pl = fract(uv.x*4.0);
      float gap = (1.0 - smoothstep(0.0, 0.03, pl)) + smoothstep(0.97, 1.0, pl);
      alb = mix(vec3(0.22, 0.12, 0.06), vec3(0.50, 0.32, 0.17), g*0.7 + n*0.3) * (1.0 - gap*0.7);
      rough = 0.72 + 0.2*g; metal = 0.0; h = g*0.4 + n*0.2 - gap*0.6 + 0.3; ao = 1.0 - gap*0.6;`
  };

  const VS = `in vec3 position; out vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const fsSet = (body) => `precision highp float; in vec2 vUv; out vec4 o; uniform int uMode;\n${LIB}
    void main(){ vec2 uv = vUv; vec3 alb; float rough, metal, ao, h; ${body}
      if (uMode == 0) o = vec4(pow(clamp(alb, 0.0, 1.0), vec3(1.0/2.2)), 1.0); else o = vec4(clamp(ao, 0.0, 1.0), clamp(rough, 0.04, 1.0), clamp(metal, 0.0, 1.0), clamp(h, 0.0, 1.0)); }`;
  const FS_NRM = `precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D tH; uniform float uTexel; uniform float uK;
    void main(){ float l = texture(tH, vUv - vec2(uTexel, 0.0)).a, r = texture(tH, vUv + vec2(uTexel, 0.0)).a, d = texture(tH, vUv - vec2(0.0, uTexel)).a, u = texture(tH, vUv + vec2(0.0, uTexel)).a;
      vec3 n = normalize(vec3((l - r)*uK, (d - u)*uK, 1.0)); o = vec4(n*0.5+0.5, 1.0); }`;
  const FS_NOISE = `precision highp float; in vec2 vUv; out vec4 o;\n${LIB}
    void main(){ o = vec4(fbm(vUv, 4.0, 6), fbm(vUv + 3.3, 8.0, 5), ridge(vUv + 1.1, 5.0, 5), vor(vUv, 12.0).x); }`;

  const TRI_PARS_V = `varying vec3 vTp; varying vec3 vTn; varying mat3 vPmNM;`;
  const TRI_V = {
    obj: `vTp = position; vTn = normal; vPmNM = normalMatrix;`,
    world: `#ifdef USE_INSTANCING
      vTp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz; vTn = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
      #else
      vTp = (modelMatrix * vec4(position, 1.0)).xyz; vTn = mat3(modelMatrix) * normal;
      #endif`
  };
  const TRI_PARS_F = `varying vec3 vTp; varying vec3 vTn; varying mat3 vPmNM; uniform sampler2D tAlb; uniform sampler2D tOrm; uniform sampler2D tNrm; uniform float uTScale; uniform float uNrmK;
    vec3 pmAlb; vec4 pmOrm; vec3 pmNrm;
    void pmSample(){ vec3 N = normalize(vTn); vec3 w = pow(abs(N), vec3(4.0)); w /= (w.x + w.y + w.z);
      vec2 ux = vTp.zy*uTScale, uy = vTp.xz*uTScale, uz = vTp.xy*uTScale;
      pmAlb = pow(texture2D(tAlb, ux).rgb*w.x + texture2D(tAlb, uy).rgb*w.y + texture2D(tAlb, uz).rgb*w.z, vec3(2.2));
      pmOrm = texture2D(tOrm, ux)*w.x + texture2D(tOrm, uy)*w.y + texture2D(tOrm, uz)*w.z;
      vec3 nx = texture2D(tNrm, ux).xyz*2.0-1.0, ny = texture2D(tNrm, uy).xyz*2.0-1.0, nz = texture2D(tNrm, uz).xyz*2.0-1.0;
      nx.xy *= uNrmK; ny.xy *= uNrmK; nz.xy *= uNrmK;
      nx = vec3(nx.xy + N.zy, abs(nx.z)*N.x); ny = vec3(ny.xy + N.xz, abs(ny.z)*N.y); nz = vec3(nz.xy + N.xy, abs(nz.z)*N.z);
      pmNrm = normalize(nx.zyx*w.x + ny.xzy*w.y + nz.xyz*w.z); }`;

  PM.Bake = function (G) {
    const THREE = globalThis.THREE, renderer = G.renderer;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
    const scene = new THREE.Scene(); scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sets = {};
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    function target(size, mips) {
      const t = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, generateMipmaps: mips, minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
      t.texture.anisotropy = maxAniso;
      return t;
    }
    function draw(material, t) {
      quad.material = material;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(t); renderer.render(scene, cam); renderer.setRenderTarget(prev);
    }

    const api = { sets };
    api.set = function (name) {
      if (sets[name]) return sets[name];
      if (!SETS[name]) throw new Error('texture set not found: ' + name);
      const size = G.quality.tex;
      const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: fsSet(SETS[name]), uniforms: { uMode: { value: 0 } }, depthTest: false });
      const alb = target(size, true), orm = target(size, true), nrm = target(size, true);
      draw(m, alb); m.uniforms.uMode.value = 1; draw(m, orm);
      const nm = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: FS_NRM, uniforms: { tH: { value: orm.texture }, uTexel: { value: 1 / size }, uK: { value: size / 96 } }, depthTest: false });
      draw(nm, nrm);
      m.dispose(); nm.dispose();
      return (sets[name] = { alb: alb.texture, orm: orm.texture, nrm: nrm.texture });
    };
    api.noise = function () {
      if (api._noise) return api._noise;
      const t = target(256, true);
      const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: FS_NOISE, depthTest: false });
      draw(m, t); m.dispose();
      return (api._noise = t.texture);
    };

    // opts: { set, color, scale (texture repeats per metre), space ('obj'|'world'), roughness, metalness, normal, emissive, emissiveIntensity, envMapIntensity, flatShading, side, transparent, opacity }
    const cache = new Map();
    api.mat = function (opts) {
      const key = JSON.stringify(opts);
      if (cache.has(key)) return cache.get(key);
      const s = api.set(opts.set), space = opts.space || 'obj';
      const m = new THREE.MeshStandardMaterial({ color: opts.color === undefined ? 0xffffff : opts.color, roughness: opts.roughness === undefined ? 1 : opts.roughness, metalness: opts.metalness === undefined ? 1 : opts.metalness,
        emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissiveIntensity || 1, envMapIntensity: opts.envMapIntensity === undefined ? 1 : opts.envMapIntensity, flatShading: !!opts.flatShading, side: opts.side || THREE.FrontSide });
      const u = { tAlb: { value: s.alb }, tOrm: { value: s.orm }, tNrm: { value: s.nrm }, uTScale: { value: opts.scale || 0.5 }, uNrmK: { value: opts.normal === undefined ? 1 : opts.normal } };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRI_PARS_V).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + TRI_V[space]);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TRI_PARS_F)
          .replace('#include <map_fragment>', 'pmSample(); diffuseColor.rgb *= pmAlb;')
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * pmOrm.g;')
          .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * pmOrm.b;')
          .replace('#include <normal_fragment_maps>', space === 'obj' ? 'normal = normalize(vPmNM * pmNrm);' : 'normal = normalize((viewMatrix * vec4(pmNrm, 0.0)).xyz);')
          .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= pmOrm.r; reflectedLight.indirectSpecular *= mix(1.0, pmOrm.r, 0.6);');
      };
      m.customProgramCacheKey = () => 'pm-tri-' + space;
      m.userData.tri = u;
      cache.set(key, m);
      return m;
    };
    api.LIB = LIB;
    return api;
  };
})();
