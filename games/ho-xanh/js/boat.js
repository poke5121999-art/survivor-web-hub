// Pha boat: lái cano của Dave từ quán sushi ra Hố Xanh (args.dir 'out' → loading) hoặc từ chỗ lặn về quán ('home' → kitchen).
// Cảnh riêng (surface 'scene'): cano, biển sảnh, mây, dừa, mòng biển, Dave và hạt VFX đều là asset gốc trong data/boat_assets.js.
// Hệ toạ độ: manifest ghi theo Unity (z vào màn hình), three thì z hướng ra camera, nên mọi toạ độ Unity đổi z → −z (U2T).
(function (HX) {
  'use strict';
  var B = window.HX_BOAT_ASSETS;
  var REV = ((document.currentScript && document.currentScript.src.split('v=')[1]) || '').split('&')[0];
  function url(rel) { return rel + (REV ? '?v=' + REV : ''); }

  // ---------------------------------------------------------------- số liệu
  function U2T(v) { return [v[0], v[1], -v[2]]; }
  var WATER_Y = B.sea.water.y;                                  // [DtD] mặt nước sảnh (wave001), y 15,529
  var HEIGHT_OFF = B.sea.boatScene.floatingTransform.heightOffset; // [DtD] cano ngồi thấp hơn mặt sóng 0,2
  var LOBBY = U2T(B.sea.boatScene.pos);                        // [DtD] chỗ cano đậu cạnh quán sushi
  var CAM0 = U2T(B.sea.camera.pos), CAMF = U2T(B.sea.camera.forward); // [DtD] camera sảnh, fov 50
  var DAVE_LOCAL = [B.sea.boatScene.davePos[0] - B.sea.boatScene.pos[0], B.sea.boatScene.davePos[1] - B.sea.boatScene.pos[1],
    -(B.sea.boatScene.davePos[2] - B.sea.boatScene.pos[2])];  // [DtD] Dave đứng ở boong đuôi
  var DIVE_X = B.sea.boatScene.DiveTrigger[0] - B.sea.boatScene.pos[0]; // [DtD] DiveTrigger ở đuôi cano (x +6,3)
  var DAVE_H = B.dave.cell[0] / B.dave.ppu * B.sea.boatScene.daveScale; // 0,64 m × 3,4
  // [ĐO TRONG REPO 2026-09-24] trong prefab LobbyBoat_Day, VFX_Root/VFX_Dave_Boat_WaterWave_* đặt ở (0; 0,24; −0,92), phóng 0,82.
  // Toạ độ emitter trong manifest tính từ gốc prefab VFX, nên phải qua phép này mới vào hệ cano.
  var VFX_ROOT = { pos: [0, 0.24, -0.92], scale: 0.82 };
  // [ĐO TRONG REPO 2026-09-24] "Lobby Clouds" trong Lobby_Day.prefab nằm ở (−34,16; 15,92; 180,89); anim trôi là toạ độ con của nó.
  var CLOUD_PARENT = [-34.1583, 15.9221, 180.8881];

  // Lộ trình (toạ độ three). Biển gốc chỉ có nước ở x −225..115, z −230..28; đảo ở z < −50. Đi ra thì chạy về tây (−x) ra
  // khơi, qua mép tấm nước gốc thì nước của pha này (vô tận theo camera) nối tiếp. Đi về thì từ phía đông chạy về chỗ đậu.
  // Cả hai chiều mũi cano đều hướng −x để camera luôn nhìn mặt +z có chữ "Nodens 68" đọc xuôi. [ĐỀ XUẤT]
  var ROUTE = {
    out: { x0: LOBBY[0], x1: LOBBY[0] - 225, z0: LOBBY[2], zMin: -34, zMax: 12 },
    home: { x0: 67, x1: LOBBY[0], z0: LOBBY[2], zMin: -34, zMax: 12 },
  };

  // Anim gốc của cano (Animator Boat_001), 30 khung/giây.
  var CLIP = B.boat.anims;
  var IDLE = CLIP.Boat_Idle001.tracks[''].posOffset;           // nhấp nhô 3,5 s
  var EXIT1 = CLIP.Boat_Exit001.tracks[''], EXIT2 = CLIP.Boat_Exit002.tracks[''];
  var FPS = CLIP.Boat_Idle001.fps;
  var DEPART_T = 1.35;   // [DtD] Boat_Exit001/002: 0..1,35 s là nổ máy (rung, ngồi thụt xuống), sau đó cano mới lao đi
  // Tốc độ lớn nhất trong Boat_Exit001 (hai khoá kề nhau) = tốc độ chạy gốc của cano rời sảnh, ~10 m/s. [DtD]
  var VMAX = (function () {
    var p = EXIT1.posOffset, v = 0;
    for (var i = 1; i < p.length; i++) v = Math.max(v, Math.abs(p[i][0] - p[i - 1][0]) * FPS);
    return v;
  })();
  // Bảng (tốc độ → chúi mũi): Exit001 từ 1,3 s tới hết, cano tăng tốc 0 → VMAX và mũi ngóc lên tới −2,08° rồi hạ về 0.
  var PITCH_BY_V = (function () {
    var p = EXIT1.posOffset, e = EXIT1.euler, out = [], vmax = 0;
    for (var i = Math.round(1.3 * FPS); i < p.length - 1; i++) {
      var v = Math.abs(p[i + 1][0] - p[i][0]) * FPS;
      if (v < vmax) continue;
      vmax = v; out.push([v, e[i][2]]);
    }
    return out;
  })();
  var P = {             // [ĐỀ XUẤT] lái: bản gốc không có bảng tốc độ cano
    thrust: 5.2,        // m/s² lúc ga hết cỡ ở tốc độ 0
    coast: 0.32,        // 1/s thả ga thì trôi dần
    brake: 5,           // m/s² phanh (S)
    reverse: 1.6,       // m/s tối đa khi lùi
    turn: 0.5,          // rad/s bẻ lái hết cỡ ở tốc độ chạy
    yawMax: 0.6,        // rad, mũi không quay quá ~34° khỏi hướng đi (giữ mặt có chữ về phía camera)
    slip: 2.4,          // 1/s trượt ngang tắt dần
    bank: 0.022,        // rad nghiêng / (rad/s · m/s) khi ôm cua
    autoAfter: 2.2,     // s không đụng phím sau khi nổ máy thì cano tự lái
    lead: 1.15,         // s camera nhìn trước theo vận tốc
  };

  // ---------------------------------------------------------------- tiện ích
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sampleTrack(tr, t, out) {
    var f = clamp(t * FPS, 0, tr.length - 1), i = Math.floor(f), j = Math.min(tr.length - 1, i + 1), k = f - i;
    for (var c = 0; c < 3; c++) out[c] = lerp(tr[i][c], tr[j][c], k);
    return out;
  }
  function curveAt(c, t) {
    if (t <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) if (t <= c[i][0]) {
      var a = c[i - 1], b = c[i];
      return a[1] + (b[1] - a[1]) * ((t - a[0]) / ((b[0] - a[0]) || 1));
    }
    return c[c.length - 1][1];
  }
  // Số trong công thức VFX: hằng | [a, b] ngẫu nhiên | {curve, mul} | {min, max, mul}. t chuẩn hoá 0..1, r ngẫu nhiên cố định của hạt.
  function num(v, t, r) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return v[0] + (v[1] - v[0]) * r;
    if (v.curve) return curveAt(v.curve, t) * (v.mul == null ? 1 : v.mul);
    if (v.min && v.max) { var a = curveAt(v.min, t), b = curveAt(v.max, t); return (a + (b - a) * r) * (v.mul == null ? 1 : v.mul); }
    return 0;
  }
  function gradAt(g, t, out) {
    var c = g.color, i, k;
    out[0] = c[c.length - 1][1]; out[1] = c[c.length - 1][2]; out[2] = c[c.length - 1][3];
    if (t <= c[0][0]) { out[0] = c[0][1]; out[1] = c[0][2]; out[2] = c[0][3]; }
    else for (i = 1; i < c.length; i++) if (t <= c[i][0]) {
      k = (t - c[i - 1][0]) / ((c[i][0] - c[i - 1][0]) || 1);
      out[0] = lerp(c[i - 1][1], c[i][1], k); out[1] = lerp(c[i - 1][2], c[i][2], k); out[2] = lerp(c[i - 1][3], c[i][3], k);
      break;
    }
    out[3] = curveAt(g.alpha, t);
    return out;
  }
  // Màu: hằng rgba | {random:[a,b]} | {gradient} | {randomGradient:[g1,g2]}. t chuẩn hoá, r ngẫu nhiên của hạt.
  var tmpA = [0, 0, 0, 0], tmpB = [0, 0, 0, 0];
  function colorAt(v, t, r, out) {
    if (!v) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
    if (Array.isArray(v)) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; out[3] = v[3]; return out; }
    if (v.random) { for (var i = 0; i < 4; i++) out[i] = lerp(v.random[0][i], v.random[1][i], r); return out; }
    if (v.gradient) return gradAt(v.gradient, t, out);
    if (v.randomGradient) {
      gradAt(v.randomGradient[0], t, tmpA); gradAt(v.randomGradient[1], t, tmpB);
      for (var j = 0; j < 4; j++) out[j] = lerp(tmpA[j], tmpB[j], r);
      return out;
    }
    out[0] = out[1] = out[2] = out[3] = 1; return out;
  }
  // Euler Unity (độ, thứ tự Z → X → Y) xoay véc-tơ.
  function eulerU(rot, v) {
    if (!rot || (!rot[0] && !rot[1] && !rot[2])) return v;
    var d = Math.PI / 180, x = v[0], y = v[1], z = v[2], c, s, t;
    if (rot[2]) { c = Math.cos(rot[2] * d); s = Math.sin(rot[2] * d); t = x * c - y * s; y = x * s + y * c; x = t; }
    if (rot[0]) { c = Math.cos(rot[0] * d); s = Math.sin(rot[0] * d); t = y * c - z * s; z = y * s + z * c; y = t; }
    if (rot[1]) { c = Math.cos(rot[1] * d); s = Math.sin(rot[1] * d); t = x * c + z * s; z = -x * s + z * c; x = t; }
    v[0] = x; v[1] = y; v[2] = z;
    return v;
  }
  // Khoá Hermite của anim legacy: [t, px,py,pz, inTan(3), outTan(3)].
  function hermite(keys, t, out) {
    var n = keys.length;
    if (t <= keys[0][0]) { out[0] = keys[0][1]; out[1] = keys[0][2]; out[2] = keys[0][3]; return out; }
    for (var i = 1; i < n; i++) if (t <= keys[i][0]) {
      var a = keys[i - 1], b = keys[i], dt = b[0] - a[0], s = (t - a[0]) / (dt || 1), s2 = s * s, s3 = s2 * s;
      var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      for (var c = 0; c < 3; c++) out[c] = h00 * a[1 + c] + h10 * dt * a[7 + c] + h01 * b[1 + c] + h11 * dt * b[4 + c];
      return out;
    }
    var l = keys[n - 1]; out[0] = l[1]; out[1] = l[2]; out[2] = l[3]; return out;
  }
  function pitchForSpeed(v) {
    var T = PITCH_BY_V;
    if (v <= T[0][0]) return T[0][1];
    for (var i = 1; i < T.length; i++) if (v <= T[i][0]) return lerp(T[i - 1][1], T[i][1], (v - T[i - 1][0]) / ((T[i][0] - T[i - 1][0]) || 1));
    return T[T.length - 1][1];
  }

  // Sóng: cùng một hàm cho shader nước và cho cano dò mặt sóng ở mũi/đuôi (DynamicEnvironmentBoatFloating lấy mẫu ±5 m).
  // Chiều cao, bước sóng, tốc độ theo _WaveHeight 0,1 / _WaveDistance 0,8 / _WaveSpeed 1,2 của Wave_Lobby_Afternoon. [DtD]
  var WF = B.sea.water.floats;
  var WAVE = { h: WF._WaveHeight, k: 2 * Math.PI / (WF._WaveDistance * 10), s: WF._WaveSpeed };
  function waveH(x, z, t) {
    return WAVE.h * (Math.sin(x * WAVE.k + t * WAVE.s) * 0.6 + Math.sin((x * 0.6 + z * 0.8) * WAVE.k * 1.37 + t * WAVE.s * 1.1) * 0.4);
  }
  var WAVE_GLSL = [
    'uniform float uTime;',
    'float waveH(vec2 p) { float k = ' + WAVE.k.toFixed(5) + ', s = ' + WAVE.s.toFixed(4) + ';',
    '  return ' + WAVE.h.toFixed(4) + ' * (sin(p.x * k + uTime * s) * 0.6 + sin((p.x * 0.6 + p.y * 0.8) * k * 1.37 + uTime * s * 1.1) * 0.4); }',
  ].join('\n');

  // Màu sương/trời: renderSettings.fogColor, sương tuyến tính 70 → 250. [DtD]
  var RS = B.sea.renderSettings;
  var FOG = { c: RS.fogColor, near: RS.fogStart, far: RS.fogEnd };
  var FOG_GLSL = [
    'uniform vec3 uFogCol; uniform vec2 uFogRange;',
    'float fogK(float d) { return clamp((d - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0); }',
    // cảnh vẽ vào bộ đệm tuyến tính rồi lớp chép cuối mới đổi ra gamma, giống vật liệu chuẩn của three
    'vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }',
  ].join('\n');
  function fogUniforms() {
    return { uFogCol: { value: new THREE.Vector3(FOG.c[0], FOG.c[1], FOG.c[2]) }, uFogRange: { value: new THREE.Vector2(FOG.near, FOG.far) } };
  }

  // ---------------------------------------------------------------- nạp asset (giữ lại cho các chuyến sau)
  var assets = null, loading = null;
  var texLoader = null;
  function loadTex(rel, pixel) {
    return new Promise(function (res, rej) {
      texLoader = texLoader || new THREE.TextureLoader();
      texLoader.load(url(rel), function (t) {
        t.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        res(t);
      }, undefined, function () { rej(new Error('image not found: ' + rel)); });
    });
  }
  function loadGlb(rel) {
    return new Promise(function (res, rej) {
      var l = new THREE.GLTFLoader();
      l.setMeshoptDecoder(MeshoptDecoder);
      l.load(url(rel), res, undefined, function () { rej(new Error('model not found: ' + rel)); });
    });
  }
  // Emitter nào có vẽ thì mới cần ảnh.
  function drawn(e) { return e.render && e.render.enabled && e.render.mode !== 'none' && e.img; }
  function vfxImages() {
    var set = {};
    [B.vfx.boatIdle, B.vfx.boatExit, B.vfx.diveBubble].forEach(function (v) { v.emitters.forEach(function (e) { if (drawn(e)) set[e.img] = 1; }); });
    return Object.keys(set);
  }
  function preload() {
    if (loading) return loading;
    var fxImgs = vfxImages(), W = B.sea.water.textures;
    loading = Promise.all([
      loadGlb(B.boat.glb), loadGlb(B.sea.glb), loadGlb(B.sea.clouds.glb),
      loadTex(B.dave.sheet, true), loadTex(B.sea.animSprites.sheet, true),
      loadTex(W._FoamTex.img), loadTex(W._IntersectionNoise.img),
      Promise.all(fxImgs.map(function (p) { return loadTex(p); })),
    ]).then(function (r) {
      var fx = {};
      fxImgs.forEach(function (p, i) { fx[p] = r[7][i]; });
      assets = { boat: r[0], sea: r[1], clouds: r[2], dave: r[3], anim: r[4], foam: r[5], noise: r[6], fx: fx };
      return assets;
    });
    loading.catch(function () { loading = null; });
    return loading;
  }

  // ---------------------------------------------------------------- tiếng: AudioContext riêng để đổi cao độ máy theo tốc độ
  // audio.js không mở ngữ cảnh ra ngoài và bộ kiểm đếm số tệp nó giải mã, nên tiếng cano giải mã riêng ở đây.
  var AU = { ctx: null, master: null, buf: {}, loading: null, live: [] };
  var SND = ['boat_move', 'boat_engine_loop', 'boat_engine_idle', 'boat_engine_start', 'boat_drive', 'boat_amb_day', 'boat_seagull',
    'boat_splash', 'boat_dive', 'boat_foot', 'boat_bgm_lobby'];
  function audioInit() {
    if (AU.ctx) return AU.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    AU.ctx = new AC();
    AU.master = AU.ctx.createGain();
    AU.master.connect(AU.ctx.destination);
    return AU.ctx;
  }
  function audioLoad() {
    if (AU.loading) return AU.loading;
    if (!audioInit()) return Promise.resolve();
    AU.loading = Promise.all(SND.map(function (k) {
      var a = B.audio[k];
      if (!a) return null;
      return fetch(url(a.src)).then(function (r) {
        if (!r.ok) throw new Error('sound not found: ' + a.src);
        return r.arrayBuffer();
      }).then(function (ab) {
        return new Promise(function (res) { AU.ctx.decodeAudioData(ab, function (b) { AU.buf[k] = b; res(); }, function () { res(); }); });
      });
    }));
    return AU.loading;
  }
  function sfx(key, opts) {
    opts = opts || {};
    if (!AU.ctx || !AU.buf[key]) return null;
    var src = AU.ctx.createBufferSource(), g = AU.ctx.createGain();
    src.buffer = AU.buf[key];
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate || 1;
    g.gain.value = opts.vol == null ? 1 : opts.vol;
    src.connect(g); g.connect(AU.master);
    src.start(0, opts.offset || 0);
    var h = { src: src, gain: g, key: key };
    AU.live.push(h);
    src.onended = function () { var i = AU.live.indexOf(h); if (i >= 0) AU.live.splice(i, 1); };
    return h;
  }
  function fadeOut(h, t) {
    if (!h || !AU.ctx) return;
    var now = AU.ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setTargetAtTime(0, now, (t || 0.2) / 3);
    try { h.src.stop(now + (t || 0.2) + 0.05); } catch (e) { /* đã dừng */ }
  }
  function audioStopAll(t) { AU.live.slice().forEach(function (h) { fadeOut(h, t); }); }
  function audioTick() {
    if (!AU.ctx) return;
    AU.master.gain.value = HX.audio && HX.audio.isMuted() ? 0 : 0.9;
  }
  function audioUnlock() { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume(); }

  // ---------------------------------------------------------------- vật liệu
  // Sprite ảnh điểm (Dave, dừa, mòng biển): một ô của sheet, cắt alpha, có sương.
  var SPRITE_VERT = 'uniform vec4 uRect; varying vec2 vUv; varying float vD;' +
    'void main(){ vUv = uRect.xy + uv * uRect.zw; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }';
  var SPRITE_FRAG = FOG_GLSL + '\nuniform sampler2D uMap; uniform float uFogAmp; varying vec2 vUv; varying float vD;' +
    'void main(){ vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard;' +
    ' vec3 col = mix(c.rgb, uFogCol, fogK(vD) * uFogAmp); gl_FragColor = vec4(toLin(col), 1.0); }';
  function spriteMat(tex, fogAmp) {
    var u = fogUniforms();
    u.uMap = { value: tex }; u.uRect = { value: new THREE.Vector4(0, 0, 1, 1) }; u.uFogAmp = { value: fogAmp == null ? 1 : fogAmp };
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, side: THREE.DoubleSide });
  }
  function setCell(mat, tex, cellW, cellH, col, row, flip) {
    var W = tex.image.width, H = tex.image.height, r = mat.uniforms.uRect.value;
    var u0 = col * cellW / W, v0 = 1 - (row + 1) * cellH / H, du = cellW / W, dv = cellH / H;
    if (flip) r.set(u0 + du, v0, -du, dv); else r.set(u0, v0, du, dv);
  }

  // Nước: ProjectDR/DaveWater (Stylized Water) viết lại từ số của Wave_Lobby_Afternoon: màu nền/chân trời, bọt, loá nắng, sóng.
  var WATER_VERT = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
  var WATER_FRAG = [
    FOG_GLSL, WAVE_GLSL,
    'uniform vec4 uBase; uniform vec4 uHorizon; uniform float uHorizonDist; uniform vec4 uFoamCol; uniform vec4 uShallow;',
    'uniform sampler2D uFoam; uniform float uFoamTiling; uniform float uFoamSpeed; uniform float uFoamSize;',
    'uniform sampler2D uNoise; uniform float uWaveTint;',
    'uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunStr; uniform float uSunSize;',
    'uniform vec3 uCam; varying vec3 vW;',
    'void main() {',
    '  vec2 p = vW.xz; float e = 0.25, h = waveH(p);',
    '  vec3 N = normalize(vec3(-(waveH(p + vec2(e, 0.0)) - h) / e * 6.0, 1.0, -(waveH(p + vec2(0.0, e)) - h) / e * 6.0));',
    '  vec3 V = normalize(uCam - vW); float d = length(uCam - vW);',
    // màu nền; gần cano nước mỏng (shallow) chỉ là viền, ngoài khơi dùng _BaseColor
    '  vec3 c = uBase.rgb;',
    '  c += uWaveTint * (h / 0.1);',
    '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uHorizonDist);',
    '  c = mix(c, uHorizon.rgb, clamp(fres * uHorizon.a * 4.0, 0.0, 1.0));',
    // bọt: ảnh SWS_FoamSea toạ độ thế giới, trôi theo _FoamSpeed; _FoamSize là ngưỡng, _FoamColor.a là độ đậm
    '  vec2 fu = p * uFoamTiling;',
    '  float f1 = texture2D(uFoam, fu + vec2(uTime * uFoamSpeed, uTime * uFoamSpeed * 0.6)).r;',
    '  float f2 = texture2D(uFoam, fu * 1.7 - vec2(uTime * uFoamSpeed * 0.7, -uTime * uFoamSpeed)).r;',
    '  float foam = smoothstep(1.0 - uFoamSize * 8.0, 1.0, f1 * f2 * 1.6);',
    '  float n = texture2D(uNoise, p * 0.025 + uTime * 0.004).r;',
    '  c = mix(c, uFoamCol.rgb, clamp(foam * (0.1 + uFoamCol.a * 3.0) + n * uFoamCol.a, 0.0, 1.0) * (1.0 - fogK(d)));',
    // loá nắng: phản chiếu MainLight
    '  vec3 R = reflect(-uSunDir, N);',
    '  float sp = pow(max(dot(R, V), 0.0), 60.0 / max(uSunSize, 0.05)) * uSunStr;',
    '  c += uSunCol * sp * 0.25;',
    '  c = mix(c, uFogCol, fogK(d));',
    '  gl_FragColor = vec4(toLin(c), mix(uBase.a, 1.0, fogK(d)));',
    '}',
  ].join('\n');

  // Mây: shader graph "Cloud" gốc dùng kênh R của ảnh làm độ sáng, G làm mặt nạ, trộn hai màu HDR của material.
  var CLOUD_VERT = 'uniform mat3 uUvT; varying vec2 vUv; varying float vD;' +
    'void main(){ vUv = (uUvT * vec3(uv, 1.0)).xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }';
  var CLOUD_FRAG = FOG_GLSL + [
    '\nuniform sampler2D uMap; uniform vec3 uShade; uniform vec3 uLit; uniform float uOpacity; varying vec2 vUv; varying float vD;',
    'vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
    'void main() {',
    '  vec4 t = texture2D(uMap, vUv);',
    '  float a = t.g * uOpacity; if (a < 0.01) discard;',
    '  vec3 hdr = mix(uShade, uLit, t.r);',
    '  vec3 c = pow(aces(hdr), vec3(1.0 / 2.2));',
    '  c = mix(c, uFogCol, fogK(vD) * 0.4);',
    '  gl_FragColor = vec4(toLin(c), a);',
    '}',
  ].join('\n');

  // ---------------------------------------------------------------- hạt VFX theo công thức ParticleSystem gốc
  // Mỗi (ảnh, kiểu trộn, kiểu vẽ) là một nhóm = một lưới tứ giác, cập nhật thuộc tính mỗi khung → một lần vẽ.
  var PART_VERT = [
    'attribute vec3 aC; attribute vec2 aK; attribute vec3 aS; attribute vec4 aUV; attribute vec4 aCol; attribute vec3 aV;',
    'varying vec2 vUv; varying vec4 vCol; varying float vD; varying vec2 vK;',
    'void main() {',
    '  vUv = aUV.xy + (aK + 0.5) * aUV.zw; vCol = aCol; vK = aK;',
    '  float c = cos(aS.z), s = sin(aS.z); vec2 k = vec2(aK.x * c - aK.y * s, aK.x * s + aK.y * c) * aS.xy;',
    '#ifdef FLAT',
    '  vec4 mv = viewMatrix * vec4(aC + vec3(k.x, 0.0, k.y), 1.0);',
    '#elif defined(STRETCH)',
    '  vec4 mv = viewMatrix * vec4(aC, 1.0);',
    '  vec3 vv = (viewMatrix * vec4(aV, 0.0)).xyz; vec2 dir = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(1.0, 0.0);',
    '  mv.xy += dir * aK.x * aS.y + vec2(-dir.y, dir.x) * aK.y * aS.x;',
    '#else',
    '  vec4 mv = viewMatrix * vec4(aC, 1.0); mv.xy += k;',
    '#endif',
    '  vD = -mv.z; gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');
  var PART_FRAG = FOG_GLSL + [
    '\nuniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol; varying float vD; varying vec2 vK;',
    'void main() {',
    // shader hạt của ProjectDR là họ Particles/Additive, Alpha Blended cũ: màu = 2 × màu hạt × tint × ảnh
    '  vec4 t = 2.0 * texture2D(uMap, vUv) * vCol; t.a = clamp(t.a, 0.0, 1.0); float f = fogK(vD);',
    // Add_CenterGlow: tấm vuông (lưới QuadToCircle) mờ dần ra mép thành hình tròn
    '#ifdef CENTER',
    '  t *= 1.0 - smoothstep(0.15, 0.5, length(vK));',
    '#endif',
    '#ifdef ADD',
    '  gl_FragColor = vec4(t.rgb * t.a * (1.0 - f), 1.0);',
    '#else',
    '  if (t.a < 0.004) discard;',
    '  gl_FragColor = vec4(toLin(mix(t.rgb, uFogCol, f)), t.a);',
    '#endif',
    '}',
  ].join('\n');

  var GROUP_CAP = 900;
  function Group(tex, add, kind, center) {
    var n = GROUP_CAP, g = new THREE.BufferGeometry();
    var K = new Float32Array(n * 8), idx = new Uint16Array(n * 6);
    for (var i = 0; i < n; i++) {
      K.set([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    this.C = new Float32Array(n * 12); this.S = new Float32Array(n * 12); this.UV = new Float32Array(n * 16);
    this.COL = new Float32Array(n * 16); this.V = new Float32Array(n * 12);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('aK', new THREE.BufferAttribute(K, 2));
    // three wants a 'position' attribute for bounds; aC stands in for it
    g.setAttribute('position', this.aC = new THREE.BufferAttribute(this.C, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aC', this.aC);
    g.setAttribute('aS', this.aS = new THREE.BufferAttribute(this.S, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUV', this.aUV = new THREE.BufferAttribute(this.UV, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', this.aCol = new THREE.BufferAttribute(this.COL, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aV', this.aV = new THREE.BufferAttribute(this.V, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    var defs = {};
    if (add) defs.ADD = 1;
    if (kind === 'flat') defs.FLAT = 1;
    if (kind === 'stretch') defs.STRETCH = 1;
    if (center) defs.CENTER = 1;
    var u = fogUniforms(); u.uMap = { value: tex };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: PART_VERT, fragmentShader: PART_FRAG, defines: defs,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = add ? 6 : 5;
    this.n = 0;
  }
  Group.prototype.begin = function () { this.n = 0; };
  Group.prototype.push = function (x, y, z, w, h, rot, uv, col, vx, vy, vz) {
    if (this.n >= GROUP_CAP) return;
    var i = this.n++, j;
    for (j = 0; j < 4; j++) {
      this.C[i * 12 + j * 3] = x; this.C[i * 12 + j * 3 + 1] = y; this.C[i * 12 + j * 3 + 2] = z;
      this.S[i * 12 + j * 3] = w; this.S[i * 12 + j * 3 + 1] = h; this.S[i * 12 + j * 3 + 2] = rot;
      this.UV[i * 16 + j * 4] = uv[0]; this.UV[i * 16 + j * 4 + 1] = uv[1]; this.UV[i * 16 + j * 4 + 2] = uv[2]; this.UV[i * 16 + j * 4 + 3] = uv[3];
      this.COL[i * 16 + j * 4] = col[0]; this.COL[i * 16 + j * 4 + 1] = col[1]; this.COL[i * 16 + j * 4 + 2] = col[2]; this.COL[i * 16 + j * 4 + 3] = col[3];
      this.V[i * 12 + j * 3] = vx; this.V[i * 12 + j * 3 + 1] = vy; this.V[i * 12 + j * 3 + 2] = vz;
    }
  };
  Group.prototype.end = function () {
    this.mesh.geometry.setDrawRange(0, this.n * 6);
    if (!this.n) return;
    // chỉ đẩy phần đang dùng lên GPU (cả bộ đệm 900 hạt × 24 nhóm là ~6 MB mỗi khung)
    var n = this.n * 4;
    [this.aC, this.aS, this.aUV, this.aCol, this.aV].forEach(function (a) {
      a.updateRange.offset = 0; a.updateRange.count = n * a.itemSize; a.needsUpdate = true;
    });
  };

  var ADDITIVE = /Additive|Add_/;
  // Một emitter chạy theo công thức. base: vị trí trong hệ cano (Unity), đã qua VFX_ROOT.
  function Emitter(sys, rec, group) {
    this.sys = sys; this.rec = rec; this.group = group;
    this.S = VFX_ROOT.scale * (rec.scale || 1);
    this.base = [VFX_ROOT.pos[0] + VFX_ROOT.scale * rec.pos[0], VFX_ROOT.pos[1] + VFX_ROOT.scale * rec.pos[1], VFX_ROOT.pos[2] + VFX_ROOT.scale * rec.pos[2]];
    this.subs = [];
    this.on = false; this.mode = 'once'; this.t = 0; this.acc = 0; this.live = 0; this.rateMul = 1; this.fired = 0;
    // mức phát ổn định (đoạn phẳng của đường cong rate) dùng khi cano đang chạy
    var r = rec.rate, plat = 0;
    if (r && r.curve) { for (var u = 0.25; u <= 0.8; u += 0.05) plat = Math.max(plat, curveAt(r.curve, u)); plat *= r.mul == null ? 1 : r.mul; }
    else plat = num(r, 0.5, 0.5);
    this.plateau = plat;
  }
  Emitter.prototype.start = function (mode) { this.on = true; this.mode = mode; this.t = 0; this.acc = 0; this.fired = 0; };
  Emitter.prototype.stop = function () { this.on = false; };
  Emitter.prototype.update = function (dt) {
    if (!this.on || !this.group) return;
    var rec = this.rec, te;
    this.t += dt;
    te = this.t - num(rec.delay, 0, 0.5);
    if (te < 0) return;
    var dur = rec.duration || 1, loop = this.mode !== 'once' || rec.loop;
    if (!loop && te > dur) { this.on = false; return; }
    var u = loop ? (te % dur) / dur : te / dur;
    var rate = this.mode === 'run' ? this.plateau : num(rec.rate, u, Math.random());
    this.acc += rate * this.rateMul * dt;
    var n = Math.floor(this.acc);
    this.acc -= n;
    var max = rec.maxParticles || 100;
    // cụm phát một lúc (bursts): mỗi cụm một lần ở chế độ 'once'; chế độ chạy liên tục chỉ dùng rate
    if (rec.bursts && this.mode === 'once') {
      for (var b = 0; b < rec.bursts.length && b < 30; b++) {
        if (this.fired & (1 << b) || te < rec.bursts[b].time) continue;
        this.fired |= 1 << b;
        n += Math.round(num(rec.bursts[b].count, 0, Math.random()) * Math.min(1, this.rateMul));
      }
    }
    for (var i = 0; i < n && this.live < max; i++) this.sys.spawn(this, null);
  };

  // Mẫu điểm sinh và hướng theo Shape module (hệ emitter, Unity).
  function shapeSample(sh, out) {
    var p = out.p, d = out.d, a, k, R, th, arc;
    p[0] = p[1] = p[2] = 0; d[0] = 0; d[1] = 0; d[2] = 1;
    if (!sh) return out;
    R = sh.radius || 0; th = sh.thickness == null ? 1 : sh.thickness; arc = (sh.arc == null ? 360 : sh.arc) * Math.PI / 180;
    switch (sh.type) {
      case 'sphere': case 'hemisphere': {
        var z = Math.random() * 2 - 1, ang = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
        d[0] = Math.cos(ang) * rr; d[1] = Math.sin(ang) * rr; d[2] = sh.type === 'hemisphere' ? Math.abs(z) : z;
        k = R * (1 - th * (1 - Math.cbrt(Math.random())));
        p[0] = d[0] * k; p[1] = d[1] * k; p[2] = d[2] * k;
        break;
      }
      case 'circle':
        a = Math.random() * arc; k = R * (1 - th * (1 - Math.sqrt(Math.random())));
        d[0] = Math.cos(a); d[1] = Math.sin(a); d[2] = 0; p[0] = d[0] * k; p[1] = d[1] * k;
        break;
      case 'cone': case 'coneVolume': {
        a = Math.random() * arc; k = Math.sqrt(Math.random());
        var sa = (sh.angle || 0) * Math.PI / 180 * k;
        p[0] = Math.cos(a) * R * k; p[1] = Math.sin(a) * R * k;
        d[0] = Math.cos(a) * Math.sin(sa); d[1] = Math.sin(a) * Math.sin(sa); d[2] = Math.cos(sa);
        break;
      }
      case 'box': case 'boxShell': case 'boxEdge':
        p[0] = Math.random() - 0.5; p[1] = Math.random() - 0.5; p[2] = Math.random() - 0.5;
        break;
      case 'edge':
        p[0] = (Math.random() - 0.5) * 2 * R; d[0] = 0; d[1] = 1; d[2] = 0;
        break;
      default:
        break;
    }
    var s = sh.scale || [1, 1, 1];
    p[0] *= s[0] || 0; p[1] *= s[1] || 0; p[2] *= s[2] || 0;
    eulerU(sh.rot, p); eulerU(sh.rot, d);
    if (sh.pos) { p[0] += sh.pos[0]; p[1] += sh.pos[1]; p[2] += sh.pos[2]; }
    return out;
  }

  function Particles(scene, tex) {
    this.scene = scene; this.tex = tex;
    this.groups = {}; this.list = []; this.pool = [];
    this.sets = {};
    this.shape = { p: [0, 0, 0], d: [0, 0, 1] };
    this.col = [1, 1, 1, 1]; this.col2 = [1, 1, 1, 1]; this.uv = [0, 0, 1, 1];
  }
  Particles.prototype.group = function (rec) {
    if (!drawn(rec)) return null;
    var add = ADDITIVE.test(rec.shader || '') || rec.blend === 'additive';
    var mode = rec.render.mode, kind = mode === 'mesh' || mode === 'horizontal' ? 'flat' : mode === 'stretch' ? 'stretch' : 'bill';
    var center = /CenterGlow/.test(rec.shader || '');
    var key = rec.img + '|' + add + '|' + kind + (center ? '|c' : '');
    if (!this.groups[key]) {
      var g = this.groups[key] = new Group(this.tex[rec.img], add, kind, center);
      this.scene.add(g.mesh);
    }
    return this.groups[key];
  };
  // Nạp một công thức thành một bộ emitter; emitter có subEmitters thì các emitter liền sau (không tự phát) là con, bắn khi hạt cha tắt.
  Particles.prototype.load = function (name, recipe) {
    var self = this, list = [], group = null;
    for (var i = 0; i < recipe.emitters.length; i++) {
      var rec = recipe.emitters[i];
      // emitter trống (không vẽ) là gốc một nhóm con trong prefab: Back, Booster, Tube_Side, SideL, SideR, Idle
      if (!drawn(rec) && !rec.rate && !rec.bursts) { group = rec.name; continue; }
      var em = new Emitter(self, rec, self.group(rec));
      em.part = group;
      list.push(em);
      if (rec.subEmitters) {
        var n = rec.subEmitters;
        for (var j = i + 1; j < recipe.emitters.length && n > 0; j++) {
          var sr = recipe.emitters[j];
          if (sr.rate || !sr.bursts) break;
          var sub = new Emitter(self, sr, self.group(sr));
          sub.isSub = true; em.subs.push(sub); n--; i = j;
        }
      }
    }
    this.sets[name] = list;
    return list;
  };
  // at: vị trí sinh (hệ three, thế giới) thay cho vị trí emitter; dùng cho emitter con và cho cú nhảy của Dave.
  Particles.prototype.spawn = function (em, at) {
    var rec = em.rec, p = this.pool.pop() || {}, S = em.S, sh = shapeSample(rec.shape, this.shape);
    var boat = this.boat, r = Math.random();
    p.em = em; p.r = r; p.r2 = Math.random(); p.age = 0;
    p.life = Math.max(0.02, num(rec.lifetime, 0, Math.random()));
    var sp = num(rec.speed, 0, Math.random()) * S;
    // hệ cano (Unity) → three
    var lx = em.base[0] + sh.p[0] * S, ly = em.base[1] + sh.p[1] * S, lz = -(em.base[2] + sh.p[2] * S);
    var vx = sh.d[0] * sp, vy = sh.d[1] * sp, vz = -sh.d[2] * sp;
    p.world = rec.space === 'world' || !!at;
    if (at) { p.x = at[0] + sh.p[0] * S; p.y = at[1] + sh.p[1] * S; p.z = at[2] - sh.p[2] * S; }
    else if (p.world) {
      var w = boat.toWorld(lx, ly, lz); p.x = w[0]; p.y = w[1]; p.z = w[2];
      var wv = boat.dirToWorld(vx, vy, vz); vx = wv[0]; vy = wv[1]; vz = wv[2];
    } else { p.x = lx; p.y = ly; p.z = lz; }
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.gv = 0;
    p.size = num(rec.size, 0, Math.random()) * S;
    p.sizeY = rec.sizeY != null ? num(rec.sizeY, 0, Math.random()) * S : p.size;
    p.rot = num(rec.rotation, 0, Math.random());
    p.spin = rec.rotOverLife ? num(rec.rotOverLife, 0, Math.random()) : 0;
    colorAt(rec.color, em.t / (rec.duration || 1), Math.random(), this.col);
    p.c0 = p.c0 || [1, 1, 1, 1];
    var tint = rec.tint || [1, 1, 1, 1];
    for (var i = 0; i < 4; i++) p.c0[i] = this.col[i] * tint[i];
    p.frame0 = rec.sheet ? num(rec.sheet.startFrame, 0, Math.random()) : 0;
    em.live++;
    this.list.push(p);
    return p;
  };
  Particles.prototype.kill = function (i) {
    var p = this.list[i];
    p.em.live--;
    var subs = p.em.subs;
    if (subs.length) {
      var pos = p.world ? [p.x, p.y, p.z] : this.boat.toWorld(p.x, p.y, p.z);
      for (var s = 0; s < subs.length; s++) {
        var sr = subs[s].rec, n = 0;
        (sr.bursts || []).forEach(function (b) { n += Math.round(num(b.count, 0, Math.random())); });
        for (var k = 0; k < n && subs[s].live < (sr.maxParticles || 30); k++) this.spawn(subs[s], pos);
      }
    }
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
    p.em = null;
    this.pool.push(p);
  };
  Particles.prototype.update = function (dt, boat) {
    this.boat = boat;
    var k, name;
    for (name in this.sets) for (k = 0; k < this.sets[name].length; k++) this.sets[name][k].update(dt);
    for (k in this.groups) this.groups[k].begin();
    var L = this.list, uv = this.uv, col = this.col2;
    for (var i = L.length - 1; i >= 0; i--) {
      var p = L[i], rec = p.em.rec;
      p.age += dt;
      var t = p.age / p.life;
      if (t >= 1) { this.kill(i); continue; }
      // trọng lực (gravityModifier × 9,81) và vận tốc theo đời hạt
      p.gv += num(rec.gravity, t, p.r) * 9.81 * dt;
      var ox = 0, oy = 0, oz = 0, V = rec.velocity;
      if (V) {
        ox = num(V.x, t, p.r); oy = num(V.y, t, p.r2); oz = -num(V.z, t, p.r);
        var sc = p.em.S;
        ox *= sc; oy *= sc; oz *= sc;
        if (p.world) { var wv = boat.dirToWorld(ox, oy, oz, true); ox = wv[0]; oy = wv[1]; oz = wv[2]; }
      }
      p.x += (p.vx + ox) * dt; p.y += (p.vy + oy - p.gv) * dt; p.z += (p.vz + oz) * dt;
      p.rot += p.spin * dt;
      var g = p.em.group;
      if (!g) continue;
      var sm = rec.sizeOverLife ? num(rec.sizeOverLife, t, p.r) : 1;
      colorAt(rec.colorOverLife, t, p.r2, col);
      col[0] *= p.c0[0]; col[1] *= p.c0[1]; col[2] *= p.c0[2]; col[3] *= p.c0[3];
      var sh = rec.sheet;
      if (sh) {
        var nf = sh.type === 'singleRow' ? sh.cols : sh.cols * sh.rows;
        var f = Math.floor((num(sh.frameOverTime, t, p.r) * (sh.cycles || 1) % 1) * nf + p.frame0) % nf;
        var cx = f % sh.cols, cy = sh.type === 'singleRow' ? (sh.row || 0) : Math.floor(f / sh.cols);
        uv[0] = cx / sh.cols; uv[1] = 1 - (cy + 1) / sh.rows; uv[2] = 1 / sh.cols; uv[3] = 1 / sh.rows;
      } else { uv[0] = 0; uv[1] = 0; uv[2] = 1; uv[3] = 1; }
      var x = p.x, y = p.y, z = p.z;
      if (!p.world) { var w = boat.toWorld(x, y, z); x = w[0]; y = w[1]; z = w[2]; }
      var sw = p.size * sm, shh = p.sizeY * sm;
      if (g.mesh.material.defines.STRETCH) {
        var vl = Math.hypot(p.vx + ox, p.vy + oy - p.gv, p.vz + oz);
        shh = sw * (rec.render.lengthScale || 1) + vl * (rec.render.velocityScale || 0);
        g.push(x, y, z, sw, shh, 0, uv, col, p.vx + ox, p.vy + oy - p.gv, p.vz + oz);
      } else g.push(x, y, z, sw, shh, p.rot, uv, col, 0, 0, 0);
    }
    for (k in this.groups) this.groups[k].end();
  };
  Particles.prototype.clear = function () {
    while (this.list.length) { var p = this.list.pop(); p.em.live = 0; p.em = null; this.pool.push(p); }
    for (var name in this.sets) this.sets[name].forEach(function (e) { e.stop(); e.live = 0; });
    for (var k in this.groups) { this.groups[k].begin(); this.groups[k].end(); }
  };
  Particles.prototype.setRun = function (name, parts, mode, mul) {
    this.sets[name].forEach(function (e) {
      if (parts && parts.indexOf(e.part) < 0) return;
      if (mode === 'stop') { e.stop(); return; }
      if (!e.on || e.mode !== mode) e.start(mode);
      if (mul != null) e.rateMul = mul;
    });
  };
  Particles.prototype.mul = function (name, parts, mul) {
    this.sets[name].forEach(function (e) { if (!parts || parts.indexOf(e.part) >= 0) e.rateMul = mul; });
  };

  // ---------------------------------------------------------------- dựng cảnh (một lần, giữ lại)
  var W = null;   // thế giới: scene, camera, cano, Dave, hạt...
  function build(A) {
    var scene = new THREE.Scene();
    var sky = FOG.c;
    scene.background = new THREE.Color(Math.pow(sky[0], 2.2), Math.pow(sky[1], 2.2), Math.pow(sky[2], 2.2));
    scene.fog = new THREE.Fog(scene.background.clone(), FOG.near, FOG.far);
    var cam = new THREE.PerspectiveCamera(B.sea.camera.fov, 16 / 9, B.sea.camera.near, B.sea.camera.far);

    // Ánh sáng sảnh: ambient phẳng (ambientMode 3) màu ambientSky + MainLight + FillLight. [DtD] hệ số cường độ [ĐỀ XUẤT], chỉnh theo ảnh sảnh
    var amb = RS.ambientSky;
    scene.add(new THREE.AmbientLight(new THREE.Color(amb[0], amb[1], amb[2]), 0.62));
    B.sea.lights.forEach(function (L) {
      var d = U2T(L.dir), l = new THREE.DirectionalLight(new THREE.Color(L.color[0], L.color[1], L.color[2]), L.intensity * 0.62);
      l.position.set(-d[0], -d[1], -d[2]);
      scene.add(l);
    });

    // Biển sảnh: quán sushi, đảo, bụi cây, nền cát. Tấm nước gốc chỉ phủ x −225..115, nên ẩn đi và thay bằng tấm nước đi theo camera.
    var sea = A.sea.scene;
    sea.traverse(function (o) {
      if (!o.isMesh) return;
      var n = o.material && o.material.name || '';
      if (/^water:/.test(n)) o.visible = false;
      if (o.material && o.material.map) { o.material.map.anisotropy = 4; }
      if (/^sprites:/.test(n) && o.material.map) o.material.map.magFilter = THREE.NearestFilter;
      o.frustumCulled = true;
    });
    scene.add(sea);

    // Nước
    var WC = B.sea.water.colors, WFl = B.sea.water.floats, main = B.sea.lights.filter(function (l) { return l.name === 'MainLight'; })[0];
    var wu = fogUniforms();
    function v4(a) { return new THREE.Vector4(a[0], a[1], a[2], a[3]); }
    var sd = U2T(main.dir);
    Object.assign(wu, {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uBase: { value: v4(WC._BaseColor) }, uShallow: { value: v4(WC._ShallowColor) }, uHorizon: { value: v4(WC._HorizonColor) },
      uHorizonDist: { value: WFl._HorizonDistance }, uFoamCol: { value: v4(WC._FoamColor) },
      uFoam: { value: A.foam }, uFoamTiling: { value: WFl._FoamTiling }, uFoamSpeed: { value: WFl._FoamSpeed }, uFoamSize: { value: WFl._FoamSize },
      uNoise: { value: A.noise }, uWaveTint: { value: WFl._WaveTint },
      uSunDir: { value: new THREE.Vector3(-sd[0], -sd[1], -sd[2]).normalize() }, uSunCol: { value: new THREE.Vector3(main.color[0], main.color[1], main.color[2]) },
      uSunStr: { value: WFl._SunReflectionStrength }, uSunSize: { value: WFl._SunReflectionSize },
    });
    // ảnh gốc của nước dùng lặp theo toạ độ thế giới
    [A.foam, A.noise].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    // bộ nước gốc gồm cả phần đã biến thành màu nền lượt 1 (gamma): đổi ngược về giá trị hiển thị như ảnh sảnh
    ['uBase', 'uShallow', 'uHorizon', 'uFoamCol'].forEach(function (k) {
      var v = wu[k].value; v.x = Math.pow(v.x, 1 / 2.2); v.y = Math.pow(v.y, 1 / 2.2); v.z = Math.pow(v.z, 1 / 2.2);
    });
    var waterGeo = new THREE.PlaneGeometry(900, 700, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    var water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
      uniforms: wu, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
    }));
    water.position.y = WATER_Y;
    water.renderOrder = 1;
    water.frustumCulled = false;
    scene.add(water);

    // Mây: node giữ tên, anim trôi legacy tính từ gốc "Lobby Clouds"
    var clouds = [];
    A.clouds.scene.traverse(function (o) {
      if (o.isMesh) {
        var m = o.material;
        var info = B_cloudMat(m.name);
        var u = fogUniforms();
        if (m.map) m.map.updateMatrix();
        Object.assign(u, {
          uMap: { value: m.map }, uUvT: { value: m.map ? m.map.matrix.clone() : new THREE.Matrix3() },
          uShade: { value: new THREE.Vector3().fromArray(info.shade) }, uLit: { value: new THREE.Vector3().fromArray(info.lit) },
          uOpacity: { value: info.opacity },
        });
        o.material = new THREE.ShaderMaterial({ uniforms: u, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        o.renderOrder = 0;
        o.frustumCulled = false;
        m.dispose();
      }
    });
    // GLTFLoader đổi dấu cách trong tên node thành "_" ("Cloud001 (1)" → "Cloud001_(1)")
    var byName = {};
    Object.keys(B.sea.clouds.anims).forEach(function (k) { byName[k.replace(/\s/g, '_')] = B.sea.clouds.anims[k]; });
    A.clouds.scene.children.forEach(function (n) {
      var an = byName[n.name];
      if (an && an[0]) clouds.push({ node: n, anim: an[0], phase: 0 });
    });
    scene.add(A.clouds.scene);

    // Dừa và mòng biển: sheet lobby_anim, ô 99×99, pivot giữa, 100 px/đv, phóng theo scale của cảnh
    var AS = B.sea.animSprites, quad = new THREE.PlaneGeometry(1, 1), anims = [];
    AS.places.forEach(function (pl) {
      var akey = Object.keys(AS.anims).filter(function (k) { return k.indexOf(pl.kind + '/') === 0; })[0];
      var an = AS.anims[akey];
      if (!an) return;
      var mat = spriteMat(A.anim, 1), m = new THREE.Mesh(quad, mat);
      var s = AS.cell[0] / an.ppu;
      m.scale.set(s * pl.scale[0], s * pl.scale[1], 1);
      var p = U2T(pl.pos);
      m.position.set(p[0], p[1], p[2]);
      m.renderOrder = 2;
      scene.add(m);
      anims.push({ mesh: m, an: an, flip: pl.flipX, t0: Math.random() * an.length, path: pl.pathAnim && pl.pathAnim[0], base: p });
    });

    // Cano
    var boatRoot = new THREE.Group(), model = A.boat.scene;
    model.traverse(function (o) { if (o.isMesh) { o.frustumCulled = false; if (o.material.map) o.material.map.anisotropy = 4; } });
    boatRoot.add(model);
    boatRoot.rotation.order = 'YZX';
    scene.add(boatRoot);

    // Dave: sheet dave_lobby, ô 64×64, pivot đáy giữa, ×3,4
    var dq = new THREE.PlaneGeometry(1, 1); dq.translate(0, 0.5, 0);
    var daveMat = spriteMat(A.dave, 0.6), dave = new THREE.Mesh(dq, daveMat);
    dave.scale.set(DAVE_H, DAVE_H, 1);
    dave.renderOrder = 3;
    boatRoot.add(dave);

    var fx = new Particles(scene, A.fx);
    fx.load('idle', B.vfx.boatIdle);
    fx.load('exit', B.vfx.boatExit);
    fx.load('dive', B.vfx.diveBubble);

    return {
      scene: scene, cam: cam, water: water, clouds: clouds, anims: anims, boatRoot: boatRoot, dave: dave, daveMat: daveMat, fx: fx,
      rt: null, copy: null, disposables: [waterGeo, quad, dq],
    };
  }
  // Hai màu HDR và độ đục của từng material mây (extras của glb). Vector1_49F9B29B là độ đục theo tên và giá trị (0,35..0,88).
  var CLOUD_MATS = null;
  function B_cloudMat(name) {
    if (!CLOUD_MATS) {
      CLOUD_MATS = {};
      var raw = assets && assets.clouds && assets.clouds.parser && assets.clouds.parser.json && assets.clouds.parser.json.materials || [];
      raw.forEach(function (m) {
        var ex = m.extras || {}, c = ex.colors || {}, f = ex.floats || {};
        CLOUD_MATS[m.name] = { shade: (c.Color_9C3FBA6D || [1.3, 2, 2.4]).slice(0, 3), lit: (c.Color_F2DEC659 || [3, 3, 3]).slice(0, 3), opacity: f.Vector1_49F9B29B || 0.6 };
      });
    }
    return CLOUD_MATS[name] || { shade: [1.3, 2, 2.4], lit: [3, 3, 3], opacity: 0.6 };
  }

  // Giải phóng mọi tài nguyên GPU của cảnh; ảnh/lưới gốc vẫn nằm trong bộ nhớ nên chuyến sau vẽ lại chỉ việc nạp lên GPU.
  function releaseGpu() {
    if (!W) return;
    var seen = new Set();
    W.scene.traverse(function (o) {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(function (m) {
        if (seen.has(m)) return;
        seen.add(m);
        for (var k in m) if (m[k] && m[k].isTexture && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
        if (m.uniforms) for (var u in m.uniforms) { var v = m.uniforms[u].value; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
        m.dispose();
      });
    });
    if (W.rt) { W.rt.dispose(); W.rt = null; }
    if (W.copy) { W.copy.mesh.geometry.dispose(); W.copy.mesh.material.dispose(); W.copy = null; }
  }

  // ---------------------------------------------------------------- trạng thái chuyến
  var st = null;
  var keys = {};
  var tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YZX'), m4 = new THREE.Matrix4();
  var dv3 = [0, 0, 0];

  // Chiếu điểm/hướng hệ cano (three) ra thế giới; hướng 'world' của Unity chỉ xoay theo mũi (yaw), vì cano sảnh không xoay.
  var boatXf = {
    toWorld: function (x, y, z) { tmpV.set(x, y, z).applyMatrix4(W.boatRoot.matrixWorld); dv3[0] = tmpV.x; dv3[1] = tmpV.y; dv3[2] = tmpV.z; return dv3; },
    dirToWorld: function (x, y, z, yawOnly) {
      var a = st ? st.yaw : 0, c = Math.cos(a), s = Math.sin(a);
      dv3[0] = x * c + z * s; dv3[1] = y; dv3[2] = -x * s + z * c; return dv3;
    },
  };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function buildHud(root, dir) {
    root.innerHTML = '';
    var hud = el('div', 'bt-hud');
    var top = el('div', 'bt-top');
    var h2 = el('h2', null, dir === 'out' ? 'Lái cano ra Hố Xanh' : 'Lái cano về quán');
    var prog = el('div', 'bt-prog');
    var bar = el('div', 'bar bt-bar'), fill = el('div', 'bt-fill'), boatMark = el('i', 'bt-mark');
    bar.appendChild(fill); bar.appendChild(boatMark);
    var dist = el('span', 'bt-dist', '');
    prog.appendChild(bar); prog.appendChild(dist);
    top.appendChild(h2); top.appendChild(prog);
    var speed = el('div', 'bt-speed'); speed.appendChild(el('b', null, '0')); speed.appendChild(el('small', null, 'km/h'));
    var skip = el('button', 'ghost bt-skip', 'Bỏ qua'); skip.id = 'boat-skip';
    var hint = el('div', 'bt-hint', '');
    var steer = el('div', 'bt-steer'), knob = el('i', 'bt-knob');
    steer.appendChild(knob);
    var ga = el('button', 'bt-ga', 'Ga');
    var brake = el('button', 'bt-brake', 'Phanh');
    var fade = el('div', 'bt-fade');
    var load = el('div', 'bt-load', 'Đang tải cano…');
    [steer, top, speed, skip, hint, ga, brake, load, fade].forEach(function (e) { hud.appendChild(e); });
    root.appendChild(hud);
    return { root: root, fill: fill, mark: boatMark, dist: dist, speed: speed.firstChild, skip: skip, hint: hint, steer: steer, knob: knob, ga: ga, brake: brake, fade: fade, load: load };
  }

  function onKey(e) {
    var down = e.type === 'keydown';
    var k = e.code;
    if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(k)) {
      keys[k] = down;
      if (down && st) st.touched = true;
      e.preventDefault();
    }
    if (down) audioUnlock();
  }
  function onBlur() { keys = {}; if (st) { st.touchGa = st.touchBrake = false; st.touchSteer = 0; } }

  function bindTouch(ui) {
    var drag = null;
    function steerAt(x, y) {
      // kéo xuống / sang trái = bẻ về phía người xem (trái của người lái, mũi đang chỉ sang trái màn hình)
      var dx = x - drag.x0, dy = y - drag.y0;
      st.touchSteer = clamp((dy - dx) / 70, -1, 1);
      ui.knob.style.transform = 'translate(' + clamp(dx, -50, 50).toFixed(0) + 'px,' + clamp(dy, -50, 50).toFixed(0) + 'px)';
    }
    ui.steer.addEventListener('pointerdown', function (e) {
      if (!st) return;
      audioUnlock(); document.body.classList.add('touch');
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      ui.knob.style.left = e.clientX + 'px'; ui.knob.style.top = e.clientY + 'px';
      ui.steer.classList.add('on');
      try { ui.steer.setPointerCapture(e.pointerId); } catch (er) { /* bỏ qua */ }
      st.touched = true;
      e.preventDefault();
    });
    ui.steer.addEventListener('pointermove', function (e) { if (drag && e.pointerId === drag.id && st) steerAt(e.clientX, e.clientY); });
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null; if (st) st.touchSteer = 0;
      ui.steer.classList.remove('on'); ui.knob.style.transform = '';
    }
    ui.steer.addEventListener('pointerup', up);
    ui.steer.addEventListener('pointercancel', up);
    function hold(btn, key) {
      btn.addEventListener('pointerdown', function (e) {
        if (!st) return;
        audioUnlock(); st[key] = true; st.touched = true; btn.classList.add('on');
        try { btn.setPointerCapture(e.pointerId); } catch (er) { /* bỏ qua */ }
        e.preventDefault();
      });
      function off() { if (st) st[key] = false; btn.classList.remove('on'); }
      btn.addEventListener('pointerup', off); btn.addEventListener('pointercancel', off);
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    hold(ui.ga, 'touchGa');
    hold(ui.brake, 'touchBrake');
  }

  // ---------------------------------------------------------------- vòng chuyến
  function enter(args) {
    var dir = args && args.dir === 'home' ? 'home' : 'out', R = ROUTE[dir];
    keys = {};
    st = {
      dir: dir, R: R, state: 'load', t: 0, st: 0, done: false, touched: false, auto: false,
      x: R.x0, z: R.z0, yaw: 0, yawRate: 0, vx: 0, vz: 0, speed: 0, roll: 0, pitch: 0, throttle: 0, steer: 0,
      touchGa: false, touchBrake: false, touchSteer: 0, total: Math.abs(R.x1 - R.x0), dist: Math.abs(R.x1 - R.x0),
      dave: { anim: 'Idle', t: 0, x: DAVE_LOCAL[0], y: DAVE_LOCAL[1], z: DAVE_LOCAL[2], flip: false, visible: true, jump: null },
      snd: {}, boostArmed: true, camX: 0, camZ: 0, fadeK: 0, hold: 0, stepT: 0,
    };
    var ui = st.ui = buildHud(HX.game.screen('boat'), dir);
    ui.skip.addEventListener('click', finish);
    bindTouch(ui);
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);
    addEventListener('blur', onBlur);
    var me = st;
    audioInit();
    audioLoad().catch(function (e) { if (HX.game.errors) HX.game.errors.push(String(e)); });
    preload().then(function (A) {
      if (st !== me || me.done) return;
      if (!W) W = build(A);
      ui.load.hidden = true;
      begin();
    }).catch(function (e) {
      if (HX.game.errors) HX.game.errors.push(String(e));
      ui.load.textContent = 'Không tải được cano: ' + e.message;
    });
  }

  function begin() {
    var R = st.R;
    st.x = R.x0; st.z = R.z0; st.yaw = 0;
    W.fx.clear();
    W.fx.setRun('idle', null, 'loop', 1);
    // đi ra: đứng yên một nhịp ở bến rồi nổ máy; đi về: Dave leo lên thuyền (Respawn) trước
    if (st.dir === 'out') setState('moor');
    else { setState('respawn'); daveAnim('Respawn'); }
    snapCamera();
    ambience(true);
    hint();
  }

  function setState(s) { st.state = s; st.st = 0; }

  function daveAnim(name, flip) { var d = st.dave; d.anim = name; d.t = 0; if (flip != null) d.flip = flip; }

  function ambience(on) {
    if (!on) return;
    var S = st.snd;
    S.amb = sfx('boat_amb_day', { loop: true, vol: 0.5 });
    S.gull = sfx('boat_seagull', { loop: true, vol: 0.18 });
    S.music = sfx('boat_bgm_lobby', { loop: true, vol: 0.28 });
    S.idle = sfx('boat_engine_idle', { loop: true, vol: 0.0 });
    S.run = sfx('boat_engine_loop', { loop: true, vol: 0.0 });
  }
  // tiếng có thể nạp xong muộn hơn cảnh: thiếu vòng lặp nào thì bật lại
  function ensureLoops() {
    var S = st.snd;
    if (!S.amb && AU.buf.boat_amb_day) S.amb = sfx('boat_amb_day', { loop: true, vol: 0.5 });
    if (!S.gull && AU.buf.boat_seagull) S.gull = sfx('boat_seagull', { loop: true, vol: 0.18 });
    if (!S.music && AU.buf.boat_bgm_lobby) S.music = sfx('boat_bgm_lobby', { loop: true, vol: 0.28 });
    if (!S.idle && AU.buf.boat_engine_idle) S.idle = sfx('boat_engine_idle', { loop: true, vol: 0 });
    if (!S.run && AU.buf.boat_engine_loop) S.run = sfx('boat_engine_loop', { loop: true, vol: 0 });
  }

  function hint() {
    if (!st || !st.ui) return;
    var touch = document.body.classList.contains('touch'), s = st.state, h = '';
    if (s === 'respawn') h = 'Dave leo lên thuyền…';
    else if (s === 'moor' || s === 'depart') h = 'Nổ máy…';
    else if (s === 'drive') h = st.auto ? (touch ? 'Tự lái · giữ Ga hoặc kéo trái để cầm lái' : 'Tự lái · bấm W/A/S/D để cầm lái')
      : (touch ? 'Giữ Ga để chạy · kéo nửa trái để bẻ lái' : 'W / ↑ ga · S / ↓ phanh · A D / ← → bẻ lái');
    else if (s === 'arrive') h = st.dir === 'out' ? 'Tới Hố Xanh' : 'Cập bến';
    else if (s === 'dive') h = 'Dave chuẩn bị nhảy xuống…';
    else if (s === 'docked') h = 'Về tới quán';
    if (st.ui.hint.textContent !== h) st.ui.hint.textContent = h;
  }

  function readInput() {
    var thr = 0, str = 0;
    if (keys.KeyW || keys.ArrowUp || st.touchGa) thr += 1;
    if (keys.KeyS || keys.ArrowDown || st.touchBrake) thr -= 1;
    if (keys.KeyA || keys.ArrowLeft) str += 1;
    if (keys.KeyD || keys.ArrowRight) str -= 1;
    if (st.touchSteer) str = st.touchSteer;
    st.throttle = thr; st.steer = clamp(str, -1, 1);
  }

  // Tự lái: ga hết, giữ mũi thẳng và dạt về làn giữa. Cập bến/tới nơi: phanh vừa đủ để dừng đúng chỗ.
  function autopilot(stopX) {
    var R = st.R, dz = R.z0 - st.z;
    var wantYaw = clamp(dz * 0.05, -0.35, 0.35);
    st.steer = clamp((wantYaw - st.yaw) * 3 - st.yawRate * 0.8, -1, 1);
    if (stopX == null) { st.throttle = 1; return; }
    var left = st.x - stopX, v = st.speed;
    var need = v * v / (2 * 3.6);
    st.throttle = left <= 0.3 ? -1 : need >= left - 0.5 ? -1 : v < Math.min(7, left * 0.9) ? 0.7 : 0;
  }

  function physics(dt) {
    var R = st.R, c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    // mũi = (−cos, 0, sin) của yaw; ngang (mạn phải của người lái) = (−sin, 0, −cos)
    var fx = -c, fz = s, lx = -s, lz = -c;
    var vF = st.vx * fx + st.vz * fz, vL = st.vx * lx + st.vz * lz;
    var thr = st.throttle;
    if (thr > 0) vF += (P.thrust * thr - P.thrust / VMAX * vF) * dt;
    else if (thr < 0) vF = vF > 0.2 ? Math.max(0, vF - P.brake * dt) : Math.max(-P.reverse, vF - 1.2 * dt);
    else vF -= vF * P.coast * dt;
    vL *= Math.exp(-P.slip * dt);
    // bánh lái chỉ ăn khi có trớn
    var grip = clamp(Math.abs(vF) / 4, 0, 1) * (vF < 0 ? -1 : 1);
    // thả lái thì mũi tự dạt dần về hướng đi (sóng và bánh lái thả tự do)
    var wantRate = st.steer ? st.steer * P.turn * grip : -st.yaw * 0.35 * Math.abs(grip);
    st.yawRate += (wantRate - st.yawRate) * Math.min(1, dt * 3);
    st.yaw += st.yawRate * dt;
    if (Math.abs(st.yaw) > P.yawMax) { st.yaw = clamp(st.yaw, -P.yawMax, P.yawMax); st.yawRate = 0; }
    c = Math.cos(st.yaw); s = Math.sin(st.yaw); fx = -c; fz = s; lx = -s; lz = -c;
    st.vx = fx * vF + lx * vL; st.vz = fz * vF + lz * vL;
    st.x += st.vx * dt; st.z += st.vz * dt;
    // làn chạy: ra ngoài thì bị đẩy về, như nước cạn / sóng bờ
    if (st.z < R.zMin) { st.vz += (R.zMin - st.z) * 2.5 * dt; st.yaw += (0.0 - st.yaw) * dt * 1.2; }
    if (st.z > R.zMax) { st.vz -= (st.z - R.zMax) * 2.5 * dt; st.yaw += (0.0 - st.yaw) * dt * 1.2; }
    st.speed = vF;
    // nghiêng vào trong khi ôm cua
    var wantRoll = clamp(st.yawRate * vF * P.bank, -0.16, 0.16);
    st.roll += (wantRoll - st.roll) * Math.min(1, dt * 4);
  }

  var tmp3 = [0, 0, 0], tmp3b = [0, 0, 0];
  function poseBoat(t) {
    var b = W.boatRoot, y = WATER_Y + HEIGHT_OFF;
    // Boat_Idle001: nhấp nhô lặp 3,5 s [DtD]
    var idleT = t % CLIP.Boat_Idle001.length;
    y += sampleTrack(IDLE, idleT, tmp3)[1];
    var rollDeg = 0, pitchDeg = 0;
    if (st.state === 'depart') {
      // Boat_Exit002 0..1,35 s: rung khi nổ máy (lắc ngang + chúi) và ngồi thụt xuống [DtD]
      var e = sampleTrack(EXIT2.euler, st.st, tmp3), p = sampleTrack(EXIT2.posOffset, st.st, tmp3b);
      rollDeg += e[0]; pitchDeg += e[2]; y += p[1];
    } else if (st.speed > 0.2 || st.state === 'drive') {
      // khi chạy: đoạn rung 0,17..0,93 s của Boat_Exit002 lặp lại, biên độ theo tốc độ (dập sóng); chúi mũi tra theo tốc độ trên Exit001
      var k = clamp(Math.abs(st.speed) / VMAX, 0, 1), lt = 0.1667 + (t * 1.1) % 0.8;
      var e2 = sampleTrack(EXIT2.euler, lt, tmp3);
      rollDeg += e2[0] * k; pitchDeg += e2[2] * k * 0.5;
      pitchDeg += pitchForSpeed(Math.abs(st.speed)) * (st.speed >= 0 ? 1 : 0);
      // cano lướt nhẹ lên khi chạy nhanh: theo posOffset y của Exit001 (+0,11 lúc lao đi)
      y += sampleTrack(EXIT1.posOffset, clamp(1.3 + k * 0.9, 0, 3.6), tmp3b)[1] * k;
    }
    // sóng dưới mũi và đuôi (±5 m, rollAmount 0,01 của DynamicEnvironmentBoatFloating)
    var c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    var hb = waveH(st.x - 5 * c, st.z + 5 * s, t), hs = waveH(st.x + 5 * c, st.z - 5 * s, t);
    y += (hb + hs) * 0.5;
    var wavePitch = Math.atan2(hb - hs, 10);
    b.position.set(st.x, y, st.z);
    // Unity → three: lật z đảo dấu góc quanh x và y; góc quanh z giữ nguyên
    b.rotation.set(-rollDeg * Math.PI / 180 + st.roll, st.yaw, pitchDeg * Math.PI / 180 - wavePitch);
    b.updateMatrixWorld(true);
  }

  function updateDave(dt) {
    var d = st.dave, A = B.dave.anims[d.anim], dave = W.dave;
    d.t += dt;
    var col = 0;
    if (A && A.frames) {
      var t = A.loop ? d.t % A.length : Math.min(d.t, A.length - 1e-4), acc = 0;
      for (var i = 0; i < A.frames.length; i++) { acc += A.frames[i][1]; if (t < acc) { col = A.frames[i][0]; break; } col = A.frames[i][0]; }
    }
    setCell(W.daveMat, assets.dave, B.dave.cell[0], B.dave.cell[1], col, A ? A.row : 0, d.flip);
    dave.visible = d.visible;
    if (d.jump) {
      // bay từ mép đuôi xuống nước (không có clip dời chỗ; chỉ có khung sprite) [ĐỀ XUẤT]
      var j = d.jump, k = clamp(j.t / j.dur, 0, 1);
      j.t += dt;
      d.x = lerp(j.x0, j.x1, k); d.y = lerp(j.y0, j.y1, k) + Math.sin(k * Math.PI) * 0.9;
    }
    dave.position.set(d.x, d.y, d.z);
    // luôn quay mặt về camera (camera không xoay), mà vẫn lắc theo cano
    dave.rotation.set(0, -st.yaw, 0);
  }

  // Khung hình của camera sảnh; màn thấp (điện thoại ngang) kéo lại gần cho cano và Dave khỏi bé. [ĐỀ XUẤT]
  function camNear() { return lerp(0.74, 1, clamp((innerHeight - 390) / (720 - 390), 0, 1)); }
  function snapCamera() {
    var n = camNear();
    st.camX = st.x + (CAM0[0] - LOBBY[0]) * n;
    st.camZ = st.z + (CAM0[2] - LOBBY[2]) * n;
    st.camY = WATER_Y + (CAM0[1] - WATER_Y) * n;
    placeCamera(0, true);
  }
  function placeCamera(dt, snap) {
    var cam = W.cam, v = st.speed, n = camNear();
    var k = clamp(Math.abs(v) / VMAX, 0, 1);
    var tx = st.x + (CAM0[0] - LOBBY[0]) * n + st.vx * P.lead * n;
    var tz = st.z + ((CAM0[2] - LOBBY[2]) + k * 3) * n;
    var ty = WATER_Y + (CAM0[1] - WATER_Y + k * 0.8) * n;
    var a = snap ? 1 : 1 - Math.exp(-2.2 * dt);
    st.camX += (tx - st.camX) * a; st.camZ += (tz - st.camZ) * a; st.camY += (ty - st.camY) * a;
    cam.position.set(st.camX, st.camY, st.camZ);
    // hướng nhìn của camera sảnh; chạy nhanh thì cúi xuống chút để thấy vệt nước sau đuôi
    var fy = CAMF[1] - k * 0.07;
    cam.lookAt(st.camX + CAMF[0], st.camY + fy, st.camZ + CAMF[2]);
    cam.aspect = innerWidth / Math.max(1, innerHeight);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  function engineSound(dt) {
    var S = st.snd, k = clamp(Math.abs(st.speed) / VMAX, 0, 1), running = st.state !== 'moor' && st.state !== 'respawn' && st.state !== 'docked' && st.state !== 'load';
    if (S.idle) S.idle.gain.gain.value = running ? 0.35 * (1 - k * 0.7) : 0;
    if (S.run) {
      S.run.gain.gain.value = running ? 0.12 + 0.4 * k + (st.throttle > 0 ? 0.08 : 0) : 0;
      S.run.src.playbackRate.value = 0.75 + 0.7 * k + (st.throttle > 0 ? 0.06 : 0);
    }
  }

  function update(dt) {
    if (!st || st.done) return;
    audioTick();
    if (!W || st.state === 'load') return;
    ensureLoops();
    st.t += dt; st.st += dt;
    var R = st.R, fx = W.fx;
    readInput();
    var manual = st.throttle !== 0 || st.steer !== 0;
    switch (st.state) {
      case 'respawn':
        st.throttle = st.steer = 0;
        if (st.st >= B.dave.anims.Respawn.length) { daveAnim('Idle'); setState('moor'); }
        break;
      case 'moor':
        st.throttle = st.steer = 0;
        if (st.st >= (st.dir === 'out' ? 1.2 : 0.4)) {
          setState('depart');
          // Boat_Exit00x bật VFX Exit ở khung 0,0167 s; tiếng cano thật của Dave ở sảnh + tiếng nổ máy
          fx.setRun('exit', null, 'once', 1);
          sfx('boat_move', { vol: 0.9 });
          st.snd.start = sfx('boat_engine_start', { vol: 0.55 });
          daveAnim('Boat_Surprise');
        }
        break;
      case 'depart':
        st.throttle = st.steer = 0;
        if (st.st >= DEPART_T) {
          setState('drive'); st.driveT = 0; daveAnim('Idle');
          if (st.snd.start) fadeOut(st.snd.start, 1.2);
        }
        break;
      case 'drive': {
        st.driveT += dt;
        if (!st.touched && st.driveT > P.autoAfter) st.auto = true;
        if (st.touched) st.auto = false;
        if (st.auto && !manual) autopilot(null);
        // gần tới: tự phanh để dừng đúng chỗ
        var left = st.x - R.x1;
        if (left < Math.max(8, st.speed * st.speed / (2 * 3.6) + 5)) setState('arrive');
        // lên ga mạnh từ lúc chậm: chùm bọt Booster + tiếng tăng ga
        if (st.throttle > 0 && st.speed < 2.5 && st.boostArmed) {
          st.boostArmed = false; fx.setRun('exit', ['Booster'], 'once', 1); sfx('boat_drive', { vol: 0.5 });
        }
        if (st.speed > 5) st.boostArmed = true;
        break;
      }
      case 'arrive':
        autopilot(R.x1);
        if (Math.abs(st.speed) < 0.4 && st.x - R.x1 < 2.5) {
          st.vx = st.vz = st.speed = 0;
          if (st.dir === 'out') {
            setState('dive');
            daveAnim('Walk', false);
          } else { setState('docked'); daveAnim('Idle'); }
        }
        break;
      case 'dive': {
        st.throttle = st.steer = 0;
        var d = st.dave;
        if (d.anim === 'Walk') {
          d.x = Math.min(DIVE_X - 1.0, d.x + 1.4 * dt);
          st.stepT -= dt;
          if (st.stepT <= 0) { st.stepT = 0.25; sfx('boat_foot', { vol: 0.5, rate: 0.95 + Math.random() * 0.1 }); }
          if (d.x >= DIVE_X - 1.0) { daveAnim('Diveready', false); sfx('boat_dive', { vol: 0.6 }); }
        } else if (d.anim === 'Diveready' && !d.jump && d.t >= B.dave.anims.Diveready.length) {
          d.jump = { t: 0, dur: 0.5, x0: d.x, y0: d.y, x1: d.x + 2.4, y1: -HEIGHT_OFF - 0.5 };
        } else if (d.jump && d.jump.t >= d.jump.dur && d.visible) {
          d.visible = false;
          var w = boatXf.toWorld(d.x, 0, d.z);
          splash([w[0], WATER_Y + 0.05, w[2]]);
          st.hold = 1.3;
        } else if (!d.visible) {
          st.hold -= dt;
          st.fadeK = clamp(1 - st.hold / 0.6, 0, 1);
          if (st.hold <= 0) finish();
        }
        break;
      }
      case 'docked':
        st.throttle = st.steer = 0;
        if (st.st > 1.4) { st.fadeK = clamp((st.st - 1.4) / 0.5, 0, 1); }
        if (st.st > 1.9) finish();
        break;
    }
    if (!st || st.done) return;   // finish() đã chuyển pha
    if (st.state === 'drive' || st.state === 'arrive' || st.state === 'docked' || st.state === 'dive') physics(dt);
    else { st.speed = 0; st.vx = st.vz = 0; }
    st.dist = Math.max(0, st.x - R.x1);

    // VFX: vệt nước/bọt hai bên và sau đuôi theo tốc độ; đứng yên thì sóng lăn tăn Idle
    var k = clamp(Math.abs(st.speed) / VMAX, 0, 1), q = HX.game.fps < 40 ? 0.5 : 1;
    fx.mul('exit', ['Back', 'Tube_Side', 'SideL', 'SideR'], k * q);
    ['Back', 'Tube_Side', 'SideL', 'SideR'].forEach(function (part) {
      fx.sets.exit.forEach(function (e) {
        if (e.part !== part) return;
        if (!e.on && st.state !== 'moor' && st.state !== 'respawn' && k > 0.05) e.start('run');
        if (e.on && e.mode === 'run' && k <= 0.02) e.stop();
      });
    });
    fx.mul('idle', null, clamp(1 - k * 2.5, 0, 1));

    poseBoat(st.t);
    updateDave(dt);
    fx.update(dt, boatXf);
    animateScenery(st.t);
    placeCamera(dt);
    engineSound(dt);
    hint();
    hud();
  }

  // Tõm: chùm bọt của Booster (tia nước, bọt) và DiveBubble gốc, đặt ở chỗ Dave chạm nước.
  function splash(at) {
    sfx('boat_splash', { vol: 0.9 });
    var fx = W.fx;
    // tia nước, bọt, giọt của Booster và Back (đuôi cano) phát một lượt ở chỗ Dave rơi xuống
    fx.sets.exit.forEach(function (e) {
      if ((e.part !== 'Booster' && e.part !== 'Back') || !e.group) return;
      var n = 0;
      (e.rec.bursts || []).forEach(function (b) { n += Math.round(num(b.count, 0, Math.random())); });
      n = Math.max(n, Math.round((e.plateau || 0) * 0.3));
      for (var i = 0; i < Math.min(n, 60); i++) fx.spawn(e, at);
    });
    fx.sets.dive.forEach(function (e) {
      if (!e.group) return;
      var n = 0;
      (e.rec.bursts || []).forEach(function (b) { n += Math.round(num(b.count, 0, Math.random())); });
      if (!n) n = Math.round(num(e.rec.rate, 0.5, 0.5) * 0.4);
      for (var i = 0; i < Math.min(n, 80); i++) fx.spawn(e, at);
    });
  }

  var tmpP = [0, 0, 0];
  function animateScenery(t) {
    W.water.material.uniforms.uTime.value = t;
    W.water.material.uniforms.uCam.value.copy(W.cam.position);
    // tấm nước đi theo camera, bước 20 m cho khỏi trượt ảnh (toạ độ ảnh là toạ độ thế giới)
    W.water.position.x = Math.round(W.cam.position.x / 20) * 20;
    W.water.position.z = Math.round((W.cam.position.z - 250) / 20) * 20;
    W.clouds.forEach(function (c) {
      var a = c.anim, keys = a.tracks[''].posKeys, tt = (t + 40) % a.length;
      hermite(keys, tt, tmpP);
      c.node.position.set(CLOUD_PARENT[0] + tmpP[0], CLOUD_PARENT[1] + tmpP[1], -(CLOUD_PARENT[2] + tmpP[2]));
    });
    W.anims.forEach(function (s) {
      var an = s.an, tt = (t + s.t0) % an.length, acc = 0, col = an.frames[0][0];
      for (var i = 0; i < an.frames.length; i++) { acc += an.frames[i][1]; col = an.frames[i][0]; if (tt < acc) break; }
      setCell(s.mesh.material, assets.anim, B.sea.animSprites.cell[0], B.sea.animSprites.cell[1], col, an.row, s.flip);
      if (s.path) {
        var tr = s.path.tracks[Object.keys(s.path.tracks)[0]];
        hermite(tr.posKeys, (t + s.t0) % s.path.length, tmpP);
        s.mesh.position.set(tmpP[0], tmpP[1], -tmpP[2]);
      }
    });
  }

  function hud() {
    var ui = st.ui, k = st.total ? 1 - st.dist / st.total : 1;
    ui.fill.style.width = (clamp(k, 0, 1) * 100).toFixed(1) + '%';
    ui.mark.style.left = (clamp(k, 0, 1) * 100).toFixed(1) + '%';
    var dtxt = Math.round(st.dist) + ' m';
    if (ui.dist.textContent !== dtxt) ui.dist.textContent = dtxt;
    var sp = String(Math.round(Math.abs(st.speed) * 3.6));
    if (ui.speed.textContent !== sp) ui.speed.textContent = sp;
    ui.fade.style.opacity = st.fadeK.toFixed(3);
  }

  function ensureRt(r) {
    var size = r.getDrawingBufferSize(tmpV2);
    if (!W.rt) {
      var gl2 = r.capabilities.isWebGL2;
      W.rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: gl2 ? 4 : 0, depthBuffer: true });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { tMap: { value: W.rt.texture } }, depthTest: false, depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tMap; varying vec2 vUv; void main(){ gl_FragColor = vec4(pow(texture2D(tMap, vUv).rgb, vec3(1.0 / 2.2)), 1.0); }',
      }));
      m.frustumCulled = false;
      var sc = new THREE.Scene(); sc.add(m);
      W.copy = { mesh: m, scene: sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    } else if (W.rt.width !== size.x || W.rt.height !== size.y) W.rt.setSize(size.x, size.y);
  }
  var tmpV2 = new THREE.Vector2();

  function render() {
    if (!st || !W || st.state === 'load' || st.done) return;
    var r = HX.game.gfx.renderer;
    ensureRt(r);
    r.setRenderTarget(W.rt);
    r.render(W.scene, W.cam);
    st.stats = { calls: r.info.render.calls, triangles: r.info.render.triangles };
    r.setRenderTarget(null);
    r.render(W.copy.scene, W.copy.cam);
  }

  function finish() {
    if (!st || st.done) return;
    st.done = true;
    HX.game.go(st.dir === 'out' ? 'loading' : 'kitchen');
  }

  function exit() {
    if (!st) return;
    st.done = true;
    removeEventListener('keydown', onKey);
    removeEventListener('keyup', onKey);
    removeEventListener('blur', onBlur);
    audioStopAll(0.3);
    if (W) { W.fx.clear(); releaseGpu(); }
    if (st.ui) st.ui.root.innerHTML = '';
    keys = {};
    st = null;
  }

  // Nạp trước (chỉ tải và giải mã, chưa đưa lên GPU) khi người chơi đang ở màn chuẩn bị.
  var preTimer = setInterval(function () {
    if (HX.game && (HX.game.phase === 'prep' || HX.game.phase === 'result')) { clearInterval(preTimer); preload().catch(function () { /* nạp lại lúc vào pha */ }); }
  }, 1000);

  HX.phases = HX.phases || {};
  HX.phases.boat = {
    surface: 'scene',
    enter: enter, exit: exit, update: update, render: render,
    // móc chỉ-đọc cho test/ho-xanh-boat.js
    info: function () {
      if (!st) return { active: false };
      return {
        active: true, dir: st.dir, state: st.state, dist: st.dist, total: st.total, speed: st.speed, x: st.x, z: st.z, yaw: st.yaw,
        roll: st.roll, auto: st.auto, loaded: !!W && st.state !== 'load', dave: { anim: st.dave.anim, visible: st.dave.visible, jumping: !!st.dave.jump && st.dave.visible },
        live: W ? W.fx.list.length : 0, groups: W ? Object.keys(W.fx.groups).map(function (k) { return k.split('/').pop() + ':' + W.fx.groups[k].n; }) : [], vmax: VMAX, stats: st.stats || null,
      };
    },
  };
})(window.HX = window.HX || {});
