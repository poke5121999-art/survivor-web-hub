// Bloom: the frame goes to a float target, its bright parts are shrunk three times, blurred back up and added on top.
// Off on the low tier (phones) and wherever float targets are missing; ?post=0 / ?post=1 force it.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  BZ.makePost = (G) => {
    const renderer = G.renderer; const gl = renderer.getContext();
    const can = renderer.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float');
    const want = BZ.params.post === '1' || (BZ.params.post !== '0' && G.quality.name !== 'low');
    const api = { on: want && can, strength: 0.6, begin() {}, end() {}, debug: () => ({ on: api.on }) };
    if (!api.on) return api;

    const mkRT = (depth) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, stencilBuffer: false });
    const main = mkRT(true); main.texture.magFilter = THREE.NearestFilter;
    const down = [mkRT(false), mkRT(false), mkRT(false)]; const up = [mkRT(false), mkRT(false)];
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
    const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    // keep what is brighter than the knee; lit ground is clamped first, so a sunny pavement only hazes a little
    const pre = mat(`uniform sampler2D map; uniform vec2 px; uniform float thr; varying vec2 vUv;
      vec3 pick(vec2 uv) { vec3 c = min(texture2D(map, uv).rgb, vec3(1.6)); float b = max(c.r, max(c.g, c.b)); return c * smoothstep(thr, thr + 0.35, b); }
      void main() { gl_FragColor = vec4((pick(vUv + px * vec2(-1.0, -1.0)) + pick(vUv + px * vec2(1.0, -1.0)) + pick(vUv + px * vec2(-1.0, 1.0)) + pick(vUv + px * vec2(1.0, 1.0))) * 0.25, 1.0); }`,
      { map: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 0.72 } });
    const dn = mat(`uniform sampler2D map; uniform vec2 px; varying vec2 vUv;
      void main() { gl_FragColor = vec4((texture2D(map, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, 1.0)).rgb) * 0.25, 1.0); }`,
      { map: { value: null }, px: { value: new THREE.Vector2() } });
    // tent blur of the smaller level, added to the level above it
    const upM = mat(`uniform sampler2D map; uniform sampler2D hi; uniform vec2 px; varying vec2 vUv;
      void main() { vec3 s = texture2D(map, vUv).rgb * 4.0;
        s += (texture2D(map, vUv + px * vec2(-1.0, 0.0)).rgb + texture2D(map, vUv + px * vec2(1.0, 0.0)).rgb + texture2D(map, vUv + px * vec2(0.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(0.0, 1.0)).rgb) * 2.0;
        s += texture2D(map, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(map, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(map, vUv + px * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(s / 16.0 + texture2D(hi, vUv).rgb, 1.0); }`,
      { map: { value: null }, hi: { value: null }, px: { value: new THREE.Vector2() } });
    const fin = mat(`uniform sampler2D map; uniform sampler2D bloom; uniform float k; varying vec2 vUv;
      void main() { vec3 c = texture2D(map, vUv).rgb; vec3 b = texture2D(bloom, vUv).rgb;
        c += b * k; float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 1.07);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`, { map: { value: null }, bloom: { value: null }, k: { value: 0.6 } });

    const size = new THREE.Vector2(); let W = 0; let H = 0;
    function fit() {
      renderer.getDrawingBufferSize(size);
      if (size.x === W && size.y === H) return;
      W = size.x; H = size.y; main.setSize(W, H);
      let w = W; let h = H;
      for (let i = 0; i < 3; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); down[i].setSize(w, h); if (i < 2) up[i].setSize(w, h); }
    }
    function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(quad, cam); }
    api.begin = () => { fit(); renderer.setRenderTarget(main); renderer.clear(); };
    api.end = () => {
      pre.uniforms.map.value = main.texture; pre.uniforms.px.value.set(1 / W, 1 / H); pass(pre, down[0]);
      for (let i = 1; i < 3; i++) { dn.uniforms.map.value = down[i - 1].texture; dn.uniforms.px.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); pass(dn, down[i]); }
      let low = down[2];
      for (let i = 1; i >= 0; i--) { upM.uniforms.map.value = low.texture; upM.uniforms.hi.value = down[i].texture; upM.uniforms.px.value.set(1 / low.width, 1 / low.height); pass(upM, up[i]); low = up[i]; }
      fin.uniforms.map.value = main.texture; fin.uniforms.bloom.value = up[0].texture; fin.uniforms.k.value = api.strength;
      pass(fin, null);
    };
    api.debug = () => ({ on: true, w: W, h: H, strength: api.strength });
    return api;
  };
})();
