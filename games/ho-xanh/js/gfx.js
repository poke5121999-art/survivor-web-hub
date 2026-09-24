// Khung vẽ: cảnh 3D vẽ vào khung thấp rồi phóng to kiểu điểm ảnh, cùng bộ đổ màu nước dùng chung.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING;

  var WATER_GLSL = [
    'uniform float uSurfY; uniform float uDeepY; uniform float uFogNear; uniform float uFogFar; uniform float uFogMax;',
    'uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uDeepMul;',
    'float hxDepthT(float y) { return clamp((uSurfY - y) / (uSurfY - uDeepY), 0.0, 1.0); }',
    'vec3 hxWater(float y) { return mix(uShallow, uDeep, smoothstep(0.0, 1.0, hxDepthT(y))); }',
    'float hxFog(float d) { return uFogMax * smoothstep(uFogNear, uFogFar, d); }',
    'vec3 hxGrade(vec3 c, vec3 w, float d) {',
    '  c *= mix(vec3(1.0), uDeepMul, hxDepthT(w.y));',
    '  return mix(c, hxWater(w.y), hxFog(d));',
    '}',
  ].join('\n');

  var water = {
    uSurfY: { value: T.water.surfaceY }, uDeepY: { value: T.water.deepY },
    uFogNear: { value: T.water.fogNear }, uFogFar: { value: T.water.fogFar }, uFogMax: { value: T.water.fogMax },
    uShallow: { value: new THREE.Vector3().fromArray(T.water.shallow) },
    uDeep: { value: new THREE.Vector3().fromArray(T.water.deep) },
    uDeepMul: { value: new THREE.Vector3().fromArray(T.water.deepMul) },
    uTime: { value: 0 },
    uCaustic: { value: null }, uCausticAmt: { value: T.water.caustic }, uCausticDepth: { value: T.water.causticDepth },
    uCut: { value: new THREE.Vector3(0, 0, 0) },
  };

  var SPRITE_VERT = [
    'uniform vec4 uvRect;',
    'varying vec2 vUv; varying vec3 vW; varying float vD;',
    'void main() {',
    '  vUv = uvRect.xy + uv * uvRect.zw;',
    '  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;',
    '  vec4 mv = viewMatrix * w; vD = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');

  var SPRITE_FRAG = [
    WATER_GLSL,
    'uniform sampler2D map; uniform vec3 tint; uniform float flash; uniform float opacity; uniform float alphaCut;',
    'varying vec2 vUv; varying vec3 vW; varying float vD;',
    'void main() {',
    '  vec4 c = texture2D(map, vUv);',
    '  c.rgb *= tint; c.rgb = mix(c.rgb, vec3(1.0), flash); c.a *= opacity;',
    '  if (c.a < alphaCut) discard;',
    '#ifdef ADDITIVE',
    '  gl_FragColor = vec4(c.rgb * c.a * (1.0 - hxFog(vD)), 1.0);',
    '#else',
    '  c.rgb = hxGrade(c.rgb, vW, vD);',
    '  gl_FragColor = c;',
    '#endif',
    '}',
  ].join('\n');

  // opts: map, additive, alphaCut, tint, opacity, depthWrite
  function spriteMaterial(opts) {
    var u = {
      map: { value: opts.map }, uvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      tint: { value: new THREE.Color(opts.tint == null ? 0xffffff : opts.tint) },
      flash: { value: 0 }, opacity: { value: opts.opacity == null ? 1 : opts.opacity },
      alphaCut: { value: opts.alphaCut == null ? (opts.additive ? 0.0 : 0.5) : opts.alphaCut },
    };
    for (var k in water) u[k] = water[k];
    return new THREE.ShaderMaterial({
      uniforms: u, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
      defines: opts.additive ? { ADDITIVE: 1 } : {},
      transparent: true, depthWrite: !!opts.depthWrite, depthTest: true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
  }

  // Tấm phẳng đặt tâm theo pivot (0..1 tính từ góc dưới trái), kích thước w×h mét.
  var geoCache = {};
  function quad(px, py) {
    var key = px.toFixed(3) + ',' + py.toFixed(3);
    if (!geoCache[key]) {
      var g = new THREE.PlaneGeometry(1, 1);
      g.translate(0.5 - px, 0.5 - py, 0);
      geoCache[key] = g;
    }
    return geoCache[key];
  }

  function sprite(tex, w, h, opts) {
    opts = opts || {};
    var m = new THREE.Mesh(quad(opts.pivot ? opts.pivot[0] : 0.5, opts.pivot ? opts.pivot[1] : 0.5),
      spriteMaterial({ map: tex, additive: opts.additive, alphaCut: opts.alphaCut, tint: opts.tint, opacity: opts.opacity, depthWrite: opts.depthWrite }));
    m.scale.set(w, h, 1);
    return m;
  }

  // Đổ màu nước lên vật liệu đá của bản đồ glb, kèm vân nắng.
  function patchTerrain(mat) {
    mat.onBeforeCompile = function (sh) {
      for (var k in water) sh.uniforms[k] = water[k];
      sh.vertexShader = 'varying vec3 vW; varying float vD; varying vec3 vN;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vD = -mvPosition.z; vN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = WATER_GLSL + '\nuniform float uTime; uniform sampler2D uCaustic; uniform float uCausticAmt; uniform float uCausticDepth; uniform vec3 uCut;\nvarying vec3 vW; varying float vD; varying vec3 vN;\n' +
        'float hxB2(vec2 p) { p = floor(mod(p, 2.0)); return p.x < 0.5 ? (p.y < 0.5 ? 0.0 : 0.75) : (p.y < 0.5 ? 0.5 : 0.25); }\n' +
        sh.fragmentShader.replace('#include <clipping_planes_fragment>', [
          '#include <clipping_planes_fragment>',
          // đá nhô ra trước mặt phẳng chơi mà che Dave thì lưới điểm thưa dần quanh Dave
          'if (vW.z > 0.8 && uCut.z > 0.0) {',
          '  float hxR = length(gl_FragCoord.xy - uCut.xy) / uCut.z;',
          '  float hxFade = 0.8 * (1.0 - smoothstep(0.55, 1.0, hxR));',
          '  if (hxB2(gl_FragCoord.xy) + hxB2(floor(gl_FragCoord.xy * 0.5)) * 0.25 < hxFade) discard;',
          '}',
        ].join('\n')).replace('#include <fog_fragment>', [
          'float hxUp = clamp(vN.y * 0.8 + 0.35, 0.0, 1.0);',
          'float hxCt = 1.0 - smoothstep(0.0, uCausticDepth, uSurfY - vW.y);',
          'vec2 hxCu = vec2(vW.x + vW.z * 0.35, vW.y * 0.35 + vW.z * 0.6) * 0.16;',
          'float hxC1 = texture2D(uCaustic, hxCu + vec2(uTime * 0.021, uTime * 0.013)).r;',
          'float hxC2 = texture2D(uCaustic, hxCu * 1.37 + vec2(-uTime * 0.017, uTime * 0.011)).r;',
          'gl_FragColor.rgb += vec3(0.75, 0.95, 1.0) * pow(min(hxC1, hxC2), 1.6) * uCausticAmt * hxCt * hxUp;',
          'gl_FragColor.rgb = hxGrade(gl_FragColor.rgb, vW, vD);',
        ].join('\n'));
    };
  }

  // Phông nền: tấm lớn sau cùng, màu nước theo độ sâu, quầng sáng gần mặt.
  function backdrop() {
    var u = {};
    for (var k in water) u[k] = water[k];
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: u, depthWrite: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: WATER_GLSL + '\nvarying vec3 vW; void main(){ vec3 c = hxWater(vW.y); float t = 1.0 - hxDepthT(vW.y); c += vec3(0.10,0.22,0.22) * t * t * t; gl_FragColor = vec4(c,1.0); }',
    }));
    m.renderOrder = -10;
    return m;
  }

  function Gfx(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(T.view.fov, 16 / 9, 0.5, 200);
    this.rt = null;
    this.post = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: null }));
    this.post.add(this.postQuad);
    this.back = backdrop();
    this.scene.add(this.back);
    this.texCache = {};
    this.loader = new THREE.TextureLoader();
    this.resize();
  }

  Gfx.prototype.camDist = function () {
    return T.view.height / (2 * Math.tan(T.view.fov * Math.PI / 360));
  };

  Gfx.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, true);
    var rh = Math.min(T.view.maxRtHeight, Math.round(T.view.height * T.view.pxPerUnit), h);
    var rw = Math.round(rh * w / h);
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(rw, rh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      this.postQuad.material.map = this.rt.texture;
    } else this.rt.setSize(rw, rh);
    this.rtSize = [rw, rh];
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Gfx.prototype.render = function (time) {
    water.uTime.value = time;
    var c = this.camera, d = c.position.z + 78;
    var hh = Math.tan(T.view.fov * Math.PI / 360) * d * 1.05;
    this.back.position.set(c.position.x, c.position.y, c.position.z - d);
    this.back.scale.set(hh * 2 * c.aspect, hh * 2, 1);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, c);
    this.stats = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.post, this.postCam);
  };

  // Ảnh trong art/: nearest cho ảnh điểm, linear cho ánh sáng/khói. Mỗi ảnh chỉ nạp một lần.
  Gfx.prototype.tex = function (rel, smooth) {
    var key = rel + (smooth ? '#s' : '');
    var entry = this.texCache[key];
    if (!entry) {
      var t, ready = new Promise(function (res, rej) {
        t = this.loader.load('art/' + rel, function () { res(t); }, undefined, function () { rej(new Error('image not found: ' + rel)); });
      }.bind(this));
      t.magFilter = t.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
      t.generateMipmaps = false;
      entry = this.texCache[key] = { tex: t, ready: ready };
    }
    return entry.tex;
  };

  Gfx.prototype.loadTex = function (rel, smooth) {
    this.tex(rel, smooth);
    return this.texCache[rel + (smooth ? '#s' : '')].ready;
  };

  // Điểm màn hình (px CSS) → điểm trên mặt z = 0.
  Gfx.prototype.screenToWorld = function (sx, sy, out) {
    var c = this.camera;
    var v = new THREE.Vector3(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight) * 2 + 1, 0.5).unproject(c);
    v.sub(c.position).normalize();
    var t = -c.position.z / v.z;
    out = out || {};
    out.x = c.position.x + v.x * t; out.y = c.position.y + v.y * t;
    return out;
  };

  Gfx.prototype.worldToScreen = function (x, y, z) {
    var v = new THREE.Vector3(x, y, z || 0).project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  };

  HX.gfx = { Gfx: Gfx, water: water, sprite: sprite, patchTerrain: patchTerrain, WATER_GLSL: WATER_GLSL };
})(window.HX = window.HX || {});
