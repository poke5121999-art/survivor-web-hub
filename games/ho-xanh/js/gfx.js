// Khung vẽ: cảnh 3D vẽ ở độ phân giải thật (có khử răng cưa), bộ đổ màu nước dùng chung, lớp chỉnh màu cuối.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING;

  // Sương tuyến tính ba màu theo khoảng cách (gần → giữa → xa) như GlobalAmbientController gốc,
  // ánh sáng = môi trường + mặt trời, cộng đèn đội đầu của Dave ở chỗ tối.
  var WATER_GLSL = [
    'uniform float uSurfY; uniform float uFogStart; uniform float uFogEnd; uniform float uFogMax;',
    'uniform vec3 uFogNear; uniform vec3 uFogMid; uniform vec3 uFogFar;',
    'uniform vec3 uAmbient; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uSpriteLit;',
    'uniform vec3 uLampPos; uniform vec3 uLampDir; uniform float uLamp;',
    'float hxFog(float d) { return uFogMax * clamp((d - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0); }',
    'vec3 hxFogCol(float f) { float k = f / max(uFogMax, 0.001); return k < 0.5 ? mix(uFogNear, uFogMid, k * 2.0) : mix(uFogMid, uFogFar, k * 2.0 - 1.0); }',
    // đèn đội đầu tính như đèn 2D trên mặt màn hình (z chỉ tính một phần năm), để vách sau lưng Dave cũng sáng
    'float hxLampAt(vec3 w) {',
    '  vec3 d = (w - uLampPos) * vec3(1.0, 1.0, 0.2); float l = length(d);',
    '  float cone = smoothstep(0.55, 0.9, dot(d / max(l, 0.001), uLampDir));',
    '  return uLamp * (cone * 2.4 / (1.0 + l * l * 0.03) + 1.1 / (1.0 + l * l * 0.35));',
    '}',
    // bản gốc (URP) chiếu sáng và trộn sương trên màu tuyến tính; ảnh và màu gốc lưu dạng gamma
    'vec3 hxLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }',
    'vec3 hxGam(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }',
    'uniform float uLightGain;',
    'vec3 hxLight(vec3 n, vec3 w, float lf) { return (uAmbient + uSun * max(dot(n, uSunDir), 0.0) * lf) * uLightGain + vec3(1.0, 0.95, 0.82) * hxLampAt(w); }',
    'vec3 hxFogMix(vec3 c, float d) { float f = hxFog(d); return hxGam(mix(hxLin(c), hxLin(hxFogCol(f)), f)); }',
    // sprite phẳng (Dave, cá, hạt) không có pháp tuyến: sáng đều theo uSpriteLit, cộng đèn
    'vec3 hxGrade(vec3 c, vec3 w, float d) { c *= hxGam(mix(uAmbient + uSun * 0.6, vec3(1.0), uSpriteLit) + vec3(1.0, 0.95, 0.82) * hxLampAt(w) * 0.8); return hxFogMix(c, d); }',
  ].join('\n');

  function v3(a) { return new THREE.Vector3().fromArray(a); }
  var water = {
    uSurfY: { value: T.water.surfaceY },
    uFogStart: { value: 12 }, uFogEnd: { value: 56 }, uFogMax: { value: T.water.fogMax },
    uFogNear: { value: v3([0.19, 0.5, 0.87]) }, uFogMid: { value: v3([0.19, 0.5, 0.87]) }, uFogFar: { value: v3([0.19, 0.5, 0.87]) },
    uAmbient: { value: v3([0.6, 0.7, 0.8]) }, uSun: { value: v3([0.5, 0.5, 0.5]) },
    uSunDir: { value: new THREE.Vector3(0.25, 1, 0.45).normalize() }, uSpriteLit: { value: 1 }, uLightGain: { value: T.dive.lightGain },
    uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(1, 0, 0) }, uLamp: { value: 0 },
    uTime: { value: 0 }, uGlow: { value: 1 },
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

  function withWater(u) { for (var k in water) u[k] = water[k]; return u; }

  // opts: map, additive, alphaCut, tint, opacity, depthWrite
  function spriteMaterial(opts) {
    var u = withWater({
      map: { value: opts.map }, uvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      tint: { value: new THREE.Color(opts.tint == null ? 0xffffff : opts.tint) },
      flash: { value: 0 }, opacity: { value: opts.opacity == null ? 1 : opts.opacity },
      alphaCut: { value: opts.alphaCut == null ? (opts.additive ? 0.0 : 0.5) : opts.alphaCut },
    });
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

  // Vật liệu cho mọi lưới của bản đồ glb. kind: rock (đá, có vân nắng và lưới thưa quanh Dave),
  // deco (san hô 3D, hải quỳ, rong: màu đỉnh, lắc theo sóng nếu sway > 0), sprites (san hô 2D đã ghép atlas), back (phông xa).
  var TERRAIN_VERT = [
    'attribute vec4 color;',
    'uniform float uTime; uniform float uSway; uniform mat3 uvTransform;',
    'varying vec2 vUv; varying vec3 vW; varying float vD; varying vec3 vN; varying vec4 vC;',
    'void main() {',
    '  vUv = (uvTransform * vec3(uv, 1.0)).xy; vC = color;',
    '  vec4 w = modelMatrix * vec4(position, 1.0);',
    // lắc: càng xa gốc (v nhỏ ở đỉnh ảnh) lắc càng mạnh; pha theo vị trí để cả bãi rong không lắc đều như một
    '  if (uSway > 0.0) { float h = clamp(1.0 - uv.y, 0.0, 1.0); w.x += sin(uTime * 1.4 + w.x * 0.6 + w.z * 0.4) * uSway * h * h; }',
    '  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);',
    '  vec4 mv = viewMatrix * w; vD = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');

  var TERRAIN_FRAG = [
    WATER_GLSL,
    'uniform float uTime; uniform sampler2D uCaustic; uniform float uCausticAmt; uniform float uCausticDepth; uniform vec3 uCut;',
    'uniform sampler2D map; uniform vec3 baseColor; uniform float lightFactor; uniform float glow; uniform vec3 glowColor;',
    'varying vec2 vUv; varying vec3 vW; varying float vD; varying vec3 vN; varying vec4 vC;',
    'float hxB2(vec2 p) { p = floor(mod(p, 2.0)); return p.x < 0.5 ? (p.y < 0.5 ? 0.0 : 0.75) : (p.y < 0.5 ? 0.5 : 0.25); }',
    'void main() {',
    '#ifndef FAR',
    // đá, san hô nhô ra trước mặt phẳng chơi mà che Dave thì lưới điểm thưa dần quanh Dave
    '  if (vW.z > 0.8 && uCut.z > 0.0) {',
    '    float r = length(gl_FragCoord.xy - uCut.xy) / uCut.z;',
    '    float fade = 0.85 * (1.0 - smoothstep(0.55, 1.0, r));',
    '    if (hxB2(gl_FragCoord.xy) + hxB2(floor(gl_FragCoord.xy * 0.5)) * 0.25 < fade) discard;',
    '  }',
    '#endif',
    '  vec4 c = texture2D(map, vUv);',
    '#ifdef VCOLOR',
    '  c *= vC;',
    '#endif',
    '  if (c.a < 0.5) discard;',
    '  c.rgb *= baseColor;',
    '  vec3 n = normalize(vN);',
    '#ifdef FLAT',
    '  n = vec3(0.0, 0.35, 0.94);',
    '#endif',
    '  c.rgb *= hxGam(hxLight(n, vW, lightFactor));',
    '  c.rgb += glowColor * glow;',
    '#ifdef ROCK',
    '  float up = clamp(n.y * 0.8 + 0.35, 0.0, 1.0);',
    '  float ct = 1.0 - smoothstep(0.0, uCausticDepth, uSurfY - vW.y);',
    '  vec2 cu = vec2(vW.x + vW.z * 0.35, vW.y * 0.35 + vW.z * 0.6) * 0.16;',
    '  float c1 = texture2D(uCaustic, cu + vec2(uTime * 0.021, uTime * 0.013)).r;',
    '  float c2 = texture2D(uCaustic, cu * 1.37 + vec2(-uTime * 0.017, uTime * 0.011)).r;',
    '  c.rgb += vec3(0.75, 0.95, 1.0) * pow(min(c1, c2), 1.6) * uCausticAmt * ct * up;',
    '#endif',
    '  gl_FragColor = vec4(hxFogMix(c.rgb, vD), 1.0);',
    '}',
  ].join('\n');

  // opts: map, kind ('rock'|'deco'|'sprites'|'back'), vertexColors, color [r,g,b], sway, lightFactor, glow [r,g,b]
  function terrainMaterial(opts) {
    var defs = {};
    if (opts.kind === 'rock') defs.ROCK = 1;
    if (opts.kind === 'sprites' || opts.kind === 'back') defs.FLAT = 1;
    if (opts.kind === 'back') defs.FAR = 1;
    if (opts.vertexColors) defs.VCOLOR = 1;
    // gltfpack lượng tử hoá uv và ghi phép co giãn vào KHR_texture_transform; GLTFLoader để nó trong map.matrix
    if (opts.map) opts.map.updateMatrix();
    var u = withWater({
      map: { value: opts.map || HX.gfx.white() }, uvTransform: { value: opts.map ? opts.map.matrix : new THREE.Matrix3() },
      baseColor: { value: new THREE.Color().fromArray(opts.color || [1, 1, 1]) },
      lightFactor: { value: opts.lightFactor == null ? 1 : opts.lightFactor },
      glow: { value: opts.glow ? 1 : 0 }, glowColor: { value: new THREE.Color().fromArray(opts.glow || [0, 0, 0]) },
      uSway: { value: opts.sway || 0 },
    });
    return new THREE.ShaderMaterial({
      uniforms: u, vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG, defines: defs,
      side: opts.kind === 'rock' ? THREE.FrontSide : THREE.DoubleSide,
    });
  }

  var whiteTex = null;
  function white() {
    if (!whiteTex) { whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); whiteTex.needsUpdate = true; }
    return whiteTex;
  }

  // Phông nền: tấm lớn sau cùng, màu sương xa theo độ sâu. Như tấm SurfaceCurtain gốc, nó sáng dần lên phía mặt nước.
  function backdrop() {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: withWater({ uGlow: water.uGlow }), depthWrite: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: WATER_GLSL + '\nuniform float uGlow; varying vec3 vW; void main(){ float t = clamp(1.0 - (uSurfY - vW.y) / 70.0, 0.0, 1.0);' +
        ' vec3 c = hxGam(hxLin(uFogFar) + hxLin(vec3(0.55, 0.9, 1.0)) * 0.55 * t * t * uGlow); gl_FragColor = vec4(c,1.0); }',
    }));
    m.renderOrder = -10;
    return m;
  }

  // Lớp chỉnh màu cuối, theo các thành phần Volume của URP gốc: phơi sáng, tương phản, bão hoà, lọc màu,
  // viền tối (vignette) và lệch màu viền (chromatic aberration). URP chỉnh trên màu tuyến tính quanh xám 18%;
  // làm thẳng trên màu gamma với trục 0,5 thì vực sâu (phơi sáng −0,9, tương phản 25) đen kịt.
  var GRADE_FRAG = [
    'uniform sampler2D tDiffuse; uniform vec2 uRes;',
    'uniform float uExposure; uniform float uContrast; uniform float uSaturation; uniform vec3 uFilter;',
    'uniform vec3 uVigColor; uniform float uVig; uniform vec2 uVigCenter; uniform float uChroma;',
    'uniform float uBloomThr; uniform float uBloom; uniform vec3 uBloomTint;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 d = vUv - 0.5; float r2 = dot(d, d);',
    '  vec2 off = d * uChroma * 0.012 * r2 * 4.0;',
    '  vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);',
    '  c = pow(max(c, 0.0), vec3(2.2));',
    '  vec3 b = pow(texture2D(tDiffuse, vUv, 4.0).rgb, vec3(2.2)) * 0.5 + pow(texture2D(tDiffuse, vUv, 6.0).rgb, vec3(2.2)) * 0.5;',
    '  b = max(b - uBloomThr, 0.0) / max(1.0 - uBloomThr, 0.05);',
    '  c += b * uBloomTint * uBloom;',
    '  c *= exp2(uExposure) * uFilter;',
    '  c = 0.18 * pow(max(c, 1e-5) / 0.18, vec3(1.0 + uContrast / 100.0));',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = pow(max(mix(vec3(l), c, 1.0 + uSaturation / 100.0), 0.0), vec3(1.0 / 2.2));',
    '  vec2 v = (vUv - uVigCenter) * vec2(uRes.x / uRes.y, 1.0);',
    '  float vig = smoothstep(0.35, 1.05, length(v) * 1.15) * uVig;',
    '  c = mix(c, c * uVigColor, vig);',
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
    '}',
  ].join('\n');

  var grade = {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 0 }, uContrast: { value: 0 }, uSaturation: { value: 0 }, uFilter: { value: new THREE.Vector3(1, 1, 1) },
    uVigColor: { value: new THREE.Vector3(0, 0, 0) }, uVig: { value: 0 }, uVigCenter: { value: new THREE.Vector2(0.5, 0.5) }, uChroma: { value: 0 },
    uBloomThr: { value: 1 }, uBloom: { value: 0 }, uBloomTint: { value: new THREE.Vector3(1, 1, 1) },
  };

  function Gfx(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(T.view.fov, 16 / 9, 0.5, 400);
    this.dist = T.view.dist;
    this.rt = null;
    this.post = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: grade, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: GRADE_FRAG,
      depthTest: false, depthWrite: false,
    }));
    this.post.add(this.postQuad);
    this.back = backdrop();
    this.scene.add(this.back);
    this.texCache = {};
    this.loader = new THREE.TextureLoader();
    this.resize();
  }

  // Khoảng cách camera tới mặt chơi z=0. Bản gốc 18,5 m; màn thấp (điện thoại ngang) kéo lại gần cho Dave khỏi bé.
  Gfx.prototype.camDist = function () { return this.dist; };

  Gfx.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight, V = T.view;
    var pr = Math.min(window.devicePixelRatio || 1, V.maxPixelRatio, Math.sqrt(V.maxPixels / (w * h)));
    var rw = Math.max(1, Math.round(w * pr)), rh = Math.max(1, Math.round(h * pr));
    // cỡ hiển thị do CSS của #scene lo, ở đây chỉ đặt cỡ bộ đệm
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (!this.rt) {
      var isGL2 = this.renderer.capabilities.isWebGL2;
      this.rt = new THREE.WebGLRenderTarget(rw, rh, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, samples: isGL2 ? V.msaa : 0 });
      this.rt.texture.generateMipmaps = true;
    } else this.rt.setSize(rw, rh);
    grade.tDiffuse.value = this.rt.texture;
    grade.uRes.value.set(rw, rh);
    this.rtSize = [rw, rh];
    var k = Math.min(1, Math.max(0, (h - V.shortH) / (V.tallH - V.shortH)));
    this.dist = V.distShort + (V.dist - V.distShort) * k;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Gfx.prototype.render = function (time) {
    water.uTime.value = time;
    var c = this.camera, d = 150;
    var hh = Math.tan(T.view.fov * Math.PI / 360) * d * 1.05;
    this.back.position.set(c.position.x, c.position.y, c.position.z - d);
    this.back.scale.set(hh * 2 * c.aspect, hh * 2, 1);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, c);
    this.stats = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.post, this.postCam);
  };

  // Ảnh trong art/: ảnh điểm phóng to thì lấy mẫu gần nhất, thu nhỏ thì mipmap cho khỏi lấp lánh; ánh sáng/khói thì mịn.
  Gfx.prototype.tex = function (rel, smooth) {
    var key = rel + (smooth ? '#s' : '');
    var entry = this.texCache[key];
    if (!entry) {
      var t, ready = new Promise(function (res, rej) {
        t = this.loader.load('art/' + rel, function () { res(t); }, undefined, function () { rej(new Error('image not found: ' + rel)); });
      }.bind(this));
      t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
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

  HX.gfx = {
    Gfx: Gfx, water: water, grade: grade, sprite: sprite, terrainMaterial: terrainMaterial, white: white, WATER_GLSL: WATER_GLSL,
  };
})(window.HX = window.HX || {});
