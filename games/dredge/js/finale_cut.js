/*
 * W6b — hai cảnh kết chạy đúng timeline gốc (WORLD-GAPS.md §2.3, §6): FinaleCutscene_Bad.playable (77,98 s) và FinaleCutscene_Good.playable (300 s).
 * Dữ liệu: data/finale.js + art/finale/cut.bin, ruins.bin, *.webp, audio/*.mp3 (tools/finale.py: cây Finale_Inspect + CinematicCameraRigs/Credits,
 * binding của PlayableDirector &122906, mẫu AnimationClip đã nướng offset của AnimationPlayableAsset, mesh, vật liệu, tiếng, GM_RuinedTown).
 *
 * Mối nối với W6a (js/finale.js, nạp trước tệp này): PlayBad/GoodFinaleCutscene gọi DRFinaleCut.play(kind, api); trả true thì W6a không chạy
 *   timeline dự phòng nữa và mỗi mốc Signal Emitter ở đây gọi api.signal(tên SignalAsset) đúng giờ (bộ nhận SignalReceiver nằm ở W6a).
 *   DestroyGreaterMarrow (bộ nhận của W6a) gọi DRFinaleCut.destroyGreaterMarrow(). Giờ timeline nhân DRFinale.timeScale (kiểm thử chạy nhanh).
 * Timeline (Unity Timeline 1.x, PlayableDirector m_WrapMode 2 = None):
 *   Activation track: GameObject bật trong [start, start + dur), ngoài khoảng là tắt; m_PostPlaybackState 3 (LeaveAsIs) — hết timeline giữ nguyên (tắt).
 *   Animation track: clip trong khoảng chạy theo giờ cục bộ in + (t − start)·timeScale, ngoài khoảng ngoại suy (1 = Hold: trước clip đầu giữ khung đầu,
 *     sau clip giữ khung cuối tới clip kế); hai clip chồng nhau trộn theo m_MixIn/OutCurve (0→1, tiếp tuyến 0 = smoothstep); m_InfiniteClip chạy
 *     theo giờ timeline. Hết timeline (WrapMode None) mọi thuộc tính hoạt hình trở về giá trị trước khi chạy.
 *   Audio track: clip phát từ start trong dur giây, âm lượng = clip × AudioSource.volume, ease-in theo m_EaseInDuration (hộp nhạc 10 s).
 *   Camera: Cinemachine — vcam bật có Priority cao nhất thắng (Cinematic_VCam* 100 khi container bật; Credits_VCam 15 sau CutToCredits của W6a);
 *     CinemachineComposer đặt LookAt ở (ScreenX, ScreenY) với damping 0,5 s (Damper: còn 1 % sau thời gian damping); đổi vcam = blend EaseInOut 2 s
 *     (CinemachineBrain mặc định), riêng Credits_VCam cắt thẳng như W6a (màn đang đen). FOV theo m_Lens.FieldOfView (clip Recorded (2)_8: 40 → 30).
 *   Đường cong FinaleCutsceneLogic: fogRemove → _FogRemove (DRSky.uniforms.uDrFogR), shouldBumpSteepness + waveBump → độ dốc sóng cộng thêm.
 *   m_IsActive "BadEndingBeam" (Recorded (5)_4, giữ từ 0 s) tắt cột sáng của W6a trong cảnh; "InspectionGlint", "ReturnLighthouseBeam" không dựng ở web.
 * Vật ở xa (Masstrocity cách ~1000 m, RedBackGlow 1300 m, cực quang 2000 m): camera.far của main.js chỉ ~425 m theo sương ⇒ trong cảnh kết nới far
 *   lên FAR_CUT (bọc DRWorld.cull, gọi ngay sau khi main.js đặt far), các vật này không nhận sương thế giới và tự cắt dưới mặt nước (y < 0).
 * Shader gốc là Shader Graph (thân rỗng trong bản rip): vật liệu dựng lại gần đúng từ Properties + giá trị .mat, ghi [ĐỀ XUẤT] từng chỗ.
 * DestroyGreaterMarrow (FinaleCutsceneLogic.cs:178): existingMarrowsObjects (GM_Town + Lighthouse) SetActive(false) ⇒ DRWorld.hideInstances(gm.inst)
 *   + ẩn tia hải đăng DRWorld.ambient.beam; Instantiate(GM_RuinedTown, 0, identity) ⇒ mesh tàn tích + hệ hạt 'GMRuinedTown' (lửa, khói).
 *   Về màn đầu / tải sổ / ván mới (LoadTitleFromGame nạp lại cảnh): trả lại tất cả.
 *
 *   DRFinaleCut.play(kind, api) → bool     DRFinaleCut.destroyGreaterMarrow()     DRFinaleCut.preload()
 *   DRFinaleCut.state() → { kind, t, len, playing, done, wall: [bắt đầu, kết thúc] (ms), vcam, fov, active[], gm: { hidden, ruins, beam } }
 */
(function (root) {
  'use strict';
  const T = root.THREE, F = root.DR_FINALE, D = root.DR;
  const C = root.DRFinaleCut = { play: () => false, destroyGreaterMarrow() {}, preload() {}, state: () => null };
  if (!T || !D || !F || !F.timelines || !F.nodes) return;

  const BLEND = 2;                 // CinemachineBrain m_DefaultBlend: EaseInOut 2 s
  const DAMP = 0.5;                // CinemachineComposer m_HorizontalDamping / m_VerticalDamping
  const FAR_CUT = 4200;            // [ĐỀ XUẤT] far trong cảnh kết: cực quang cách Finale_Inspect ~2100 m, quad 2000 m (vcam gốc FarClipPlane 5000)
  const WAIT_MAX = 6;              // [ĐỀ XUẤT] chờ nạp cut.bin tối đa (giây thật) rồi chạy timeline dù thiếu hình
  const N = F.nodes;
  const info = m => console.info('[finale-cut] ' + m);
  const timeScale = () => (root.DRFinale && DRFinale.timeScale) || 1;
  const paused = () => { const e = document.getElementById('dr-pause'); return !!e && !e.hidden; };

  // ------------------------------------------------------------------ nạp khối nhị phân
  const bins = {}, binWait = {};
  function loadBin(k) {
    if (bins[k]) return Promise.resolve(bins[k]);
    if (!binWait[k]) {
      binWait[k] = fetch(F.bins[k]).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + F.bins[k]); return r.arrayBuffer(); })
        .then(b => (bins[k] = b)).catch(e => { console.warn('[finale-cut] ' + F.bins[k] + ' failed to load: ' + e.message); delete binWait[k]; return null; });
    }
    return binWait[k];
  }
  C.preload = () => { loadBin('cut'); };
  D.on('finaleVoyageStarted', () => C.preload());

  // ------------------------------------------------------------------ giải mã mesh / mẫu clip (định dạng tools/finale.py)
  const geoCache = {};
  function geometry(key, M, buf) {
    if (geoCache[key]) return geoCache[key];
    const n = M.n;
    const pq = new Int16Array(buf, M.pos[0], n * 3), nq = new Int8Array(buf, M.nrm[0], n * 4), uq = new Uint16Array(buf, M.uv[0], n * 2);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let v = 0; v < n; v++) {
      for (let a = 0; a < 3; a++) {
        pos[v * 3 + a] = M.min[a] + (pq[v * 3 + a] + 32768) / 65535 * (M.max[a] - M.min[a]);
        nrm[v * 3 + a] = nq[v * 4 + a] / 127;
      }
      for (let a = 0; a < 2; a++) uv[v * 2 + a] = M.umin[a] + uq[v * 2 + a] / 65535 * (M.umax[a] - M.umin[a]);
    }
    const ni = M.groups.reduce((s, g) => s + g[1], 0);
    const ix = M.i32 ? new Uint32Array(buf, M.idx[0], ni).slice() : new Uint16Array(buf, M.idx[0], ni).slice();
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(new T.BufferAttribute(ix, 1));
    if (M.si) {
      const si = new Uint8Array(buf, M.si[0], n * 4), sw = new Uint8Array(buf, M.sw[0], n * 4), w = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) { let s = 0; for (let k = 0; k < 4; k++) s += sw[v * 4 + k]; for (let k = 0; k < 4; k++) w[v * 4 + k] = s > 0 ? sw[v * 4 + k] / s : (k ? 0 : 1); }
      g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(si), 4)); g.setAttribute('skinWeight', new T.BufferAttribute(w, 4));
    }
    M.groups.forEach((gr, i) => g.addGroup(gr[0], gr[1], i));
    g.computeBoundingSphere();
    return (geoCache[key] = g);
  }
  function channel(c, buf) {
    if (c._v) return c._v;
    const dim = c.k === 'q' ? 4 : 3, raw = new Int16Array(buf, c.b[0], c.n * dim), v = new Float32Array(c.n * dim);
    for (let i = 0; i < raw.length; i++) {
      const a = i % dim;
      v[i] = c.k === 'q' ? raw[i] / 32767 : c.lo[a] + (raw[i] + 32768) / 65535 * (c.hi[a] - c.lo[a]);
    }
    return (c._v = v);
  }
  const INF = 1e20;
  function curve(keys, t) {   // Hermite như AnimationCurve; tiếp tuyến ±1e30 (vô cực) = bậc thang
    const n = keys.length;
    if (!n) return 0;
    if (n === 1 || t <= keys[0][0]) return keys[0][1];
    const L = keys[n - 1];
    if (t >= L[0]) return L[1];
    let i = 1; while (keys[i][0] < t) i++;
    const a = keys[i - 1], b = keys[i], d = b[0] - a[0];
    if (d <= 0) return b[1];
    if (Math.abs(a[3]) > INF || Math.abs(b[2]) > INF) return a[1];
    const u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
  }
  const smooth = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };       // m_MixIn/OutCurve (0,0)-(1,1) tiếp tuyến 0
  const easeIO = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

  // ------------------------------------------------------------------ vật liệu
  const texCache = {};
  function tex(name, srgb) {
    const d = F.tex[name]; if (!d) return null;
    const k = name + (srgb ? '|s' : '');
    if (!texCache[k]) {
      const t = new T.TextureLoader().load(d.src);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      if (srgb) t.encoding = T.sRGBEncoding;
      texCache[k] = t;
    }
    return texCache[k];
  }
  const S2L = 'vec3 fcS2L(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }\n';
  const U = { uTime: { value: 0 }, uFlash: { value: 0 }, uAurora: { value: 1 } };   // đồng hồ hiệu ứng, chớp sét, độ hiện cực quang (mỗi quad tách riêng)
  const colOf = (m, k, d) => (m.c[k] || d || [1, 1, 1, 1]);
  const FOGC = { value: new T.Color(0.05, 0.03, 0.04) };   // màu sương của cảnh (scene.fog.color, tuyến tính khi bật hậu kỳ), cập nhật mỗi khung
  // Lit_Shader_2 / Leviathan / ResurrectedJulie: ánh sáng chung của thế giới như js/mindsucker.js (nắng·mây + đèn phụ + ambient + 1 − mask.b)
  function litMaterial(md, glow) {
    const map = md.tex.Texture2D_9aa7ba2263944b48bbf43c218dc48459 || md.tex._MainTex;
    const m = new T.MeshBasicMaterial({ map: map ? tex(map, true) : null, side: T.FrontSide });
    const gl = glow && md.tex._GlowColours ? tex(md.tex._GlowColours, false) : null;
    const u = Object.assign({ uFcGlow: { value: gl }, uFcGlowK: { value: glow ? (md.f._EmissionStrength || 0) * 0.006 : 0 } }, U);
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uFlash;' + (gl ? ' uniform sampler2D uFcGlow; uniform float uFcGlowK;\n' + S2L : '\n'))
        .replace('#include <output_fragment>', `
  vec3 wpF = vDrFogW;
  vec3 litF = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpF) + drEnvLights(wpF) + uDrAmb + (1.0 - drEnvMaskB(wpF.xz)) + vec3(uDrTintK, 0.0, 0.0) + vec3(uFlash * 0.6));
  gl_FragColor = vec4(litF, 1.0);`)
        // [ĐỀ XUẤT] ResurrectedJulie_Shader: phát sáng = GlowColours cuộn theo thời gian × EmissionStrength (50) × 0,006, sau sương, chặn 1,5
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n' + (gl ? '  gl_FragColor.rgb += min(fcS2L(texture2D(uFcGlow, vUv * 0.5 + vec2(uTime * 0.05, uTime * 0.11)).rgb) * uFcGlowK, vec3(1.5));' : ''));
    };
    m.customProgramCacheKey = () => 'fcLit' + (gl ? 'G' : '');
    return m;
  }
  // vật ở xa: không nhận sương thế giới, cắt dưới mặt nước theo y thế giới
  const FAR_V = 'varying vec3 vFcW; varying vec2 vFcUv; varying vec3 vFcN; varying vec3 vFcV;\n';
  const FAR_VS = `${FAR_V}
#include <common>
#include <skinning_pars_vertex>
void main() {
  vFcUv = uv;
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vFcW = w.xyz; vFcN = normalize(mat3(modelMatrix) * normal); vFcV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  function shaderMat(frag, uniforms, opt) {
    return new T.ShaderMaterial(Object.assign({ uniforms: Object.assign({}, U, uniforms), vertexShader: FAR_VS, fragmentShader: FAR_V + S2L + frag, fog: false }, opt || {}));
  }
  const matCache = {};
  function material(name) {
    if (matCache[name]) return matCache[name];
    const md = F.mats[name] || { shader: '', tex: {}, f: {}, c: {} };
    const sh = md.shader || '';
    let m;
    if (/Masstrocity_Shader/.test(sh)) {
      // [ĐỀ XUẤT] Masstrocity_Shader: MainTex tối dưới trời bão + lóe sáng theo sét (_FlashAmount 23); cắt dưới mặt nước; pha màu sương nhẹ cho xa
      m = shaderMat(`uniform sampler2D tMap; uniform float uTime; uniform float uFlash; uniform vec3 uFog;
void main() { if (vFcW.y < 0.0) discard;
  vec3 c = fcS2L(texture2D(tMap, vFcUv).rgb);
  float rim = pow(1.0 - clamp(dot(normalize(vFcN), normalize(vFcV)), 0.0, 1.0), 3.0);
  vec3 lit = c * (0.08 + uFlash * ${(md.f._FlashAmount || 23).toFixed(1)} * 0.02) + vec3(0.35, 0.03, 0.02) * rim * 0.6;
  float hf = 1.0 - smoothstep(0.0, 140.0, vFcW.y);          // chân chìm vào sương chân trời (mặt nước xa không vẽ)
  gl_FragColor = vec4(mix(lit, uFog, max(0.2, hf * 0.95)), 1.0); }`, { tMap: { value: tex(md.tex._MainTex, false) }, uFog: FOGC });
      m.userData.far = true;
    } else if (/BreakingWater_Shader/.test(sh)) {
      // [ĐỀ XUẤT] BreakingWater_Shader: bọt trắng (FoamMask) nơi thân khổng lồ cắt mặt nước, tan dần tới DissipateHeight (50 m)
      m = shaderMat(`uniform sampler2D tFoam; uniform float uTime; uniform vec3 uFog;
void main() { float h = vFcW.y; if (h < 0.0 || h > ${(md.f._DissipateHeight || 50).toFixed(1)}) discard;
  float f = texture2D(tFoam, vFcUv * 6.0 + vec2(0.0, -uTime * 0.05)).r;
  float a = (1.0 - h / ${(md.f._DissipateHeight || 50).toFixed(1)}) * smoothstep(0.35, 0.7, f) * 0.3 * smoothstep(0.0, 40.0, h);
  gl_FragColor = vec4(mix(vec3(0.5, 0.47, 0.47), uFog, 0.5), a); }`, { tFoam: { value: tex(md.tex._FoamMask, false) }, uFog: FOGC }, { transparent: true, depthWrite: false });
      m.userData.far = true;
    } else if (/LightBeam_Shader/.test(sh)) {
      // LightBeam_Shader_1 (cùng công thức tia hải đăng của js/world.js): màu × texture, alpha = (N·V)^FadeSmoothness × Opacity; FadeAtWater
      const c = colOf(md, 'Color_A824354B');
      const tm = md.tex.Texture2D_7ED7D5F2 ? tex(md.tex.Texture2D_7ED7D5F2, false) : null;
      m = shaderMat(`uniform sampler2D tMap; uniform vec3 uCol; uniform float uOp; uniform float uFade; uniform float uHasMap; uniform float uFlash;
void main() { vec4 t = uHasMap > 0.5 ? texture2D(tMap, vFcUv) : vec4(1.0);
  float f = pow(clamp(abs(dot(normalize(vFcN), normalize(vFcV))), 0.0, 1.0), uFade);
  float wf = ${md.f._FADEATWATER ? 'clamp(vFcW.y / ' + (md.f._FadeAtWaterSoftness || 1).toFixed(2) + ', 0.0, 1.0)' : '1.0'};
  float fl = ${md.f._FLASHES ? '1.0 + uFlash * 1.5' : '1.0'};
  gl_FragColor = vec4(fcS2L(t.rgb) * uCol * fl, f * t.a * uOp * wf); }`, {
        tMap: { value: tm }, uHasMap: { value: tm ? 1 : 0 }, uCol: { value: new T.Color(c[0], c[1], c[2]).convertSRGBToLinear() },
        uOp: { value: md.f.Vector1_9CBD1346 == null ? 1 : md.f.Vector1_9CBD1346 }, uFade: { value: md.f.Vector1_B072A672 == null ? 2 : md.f.Vector1_B072A672 }
      }, { transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
      m.userData.far = true;
    } else if (/ShimmerWarp_Shader/.test(sh)) {
      // [ĐỀ XUẤT] ShimmerWarp_Shader_1 (cực quang): ảnh Image cuộn theo ScrollSpeed, méo bởi UVTexture, mờ theo Opacity × đường cong clip
      const img = md.tex.Texture2D_b639718b44ab469c882d97c42332ff90, uvt = md.tex.Texture2D_3928416cd23c4ee1bf58f20f4af23151;
      m = shaderMat(`uniform sampler2D tImg; uniform sampler2D tUv; uniform float uTime; uniform float uOp; uniform float uAurora;
void main() { vec2 w = texture2D(tUv, vFcUv + vec2(uTime * 0.01, 0.0)).rg - 0.5;
  vec4 c = texture2D(tImg, vFcUv + w * 0.1 + vec2(uTime * 0.02, uTime * 0.005));
  float edge = smoothstep(0.0, 0.25, vFcUv.y) * smoothstep(1.0, 0.6, vFcUv.y);
  gl_FragColor = vec4(fcS2L(c.rgb) * c.a * edge * uOp * uAurora, 1.0); }`, {
        tImg: { value: img ? tex(img, false) : null }, tUv: { value: uvt ? tex(uvt, false) : null }, uOp: { value: md.f._Opacity == null ? 1 : md.f._Opacity }
      }, { transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
      m.userData.far = true;
    } else if (/Particle_Shader/.test(sh)) {
      // mây xa (SpriteRenderer + Particle_Shader_2): texture sprite, tô tối theo trời bão [ĐỀ XUẤT]
      m = shaderMat(`uniform sampler2D tMap; uniform vec3 uCol;
void main() { vec4 t = texture2D(tMap, vFcUv); if (t.a < 0.02) discard; gl_FragColor = vec4(uCol * fcS2L(t.rgb), t.a * 0.85); }`,
      { tMap: { value: null }, uCol: { value: new T.Color(0.05, 0.035, 0.04) } }, { transparent: true, depthWrite: false, side: T.DoubleSide });
      m.userData.far = true;
    } else {
      m = litMaterial(md, /ResurrectedJulie/.test(sh));
      if (/Leviathan_Shader/.test(sh)) m.userData.lev = true;
    }
    m.userData.name = name;
    return (matCache[name] = m);
  }

  // ------------------------------------------------------------------ dựng cây cảnh (một lần, dùng cho cả hai cảnh)
  let scene = null, built = null;
  const findScene = () => scene || (scene = root.DRBoat && DRBoat.root && DRBoat.root.parent) || null;
  function build(buf) {
    if (built) return built;
    const sc = findScene(); if (!sc) return null;
    const boneSet = new Set();
    for (const nd of N) if (nd.r && nd.r.bones) for (const b of nd.r.bones) boneSet.add(b);
    const obj = N.map((nd, i) => {
      const o = boneSet.has(i) ? new T.Bone() : new T.Group();
      o.name = 'fc ' + nd.n;
      o.position.fromArray(nd.t, 0); o.quaternion.fromArray(nd.t, 3); o.scale.fromArray(nd.t, 7);
      o.userData.rest = nd.t;
      return o;
    });
    const top = new T.Group(); top.name = 'FinaleCut';
    N.forEach((nd, i) => (nd.p >= 0 ? obj[nd.p] : top).add(obj[i]));
    const rends = [], skins = [];
    N.forEach((nd, i) => {
      const r = nd.r; if (!r) return;
      let mesh = null;
      if (r.mesh && buf) {
        const M = F.meshes[r.mesh];
        const g = geometry(r.mesh, M, buf);
        const mats = r.mats.map(material);
        if (M.si) {
          mesh = new T.SkinnedMesh(g, mats);
          // bindpose Unity = (xương → thế giới)⁻¹·(mesh → thế giới): mesh đặt ở gốc thế giới, bindMatrix đơn vị (như js/mindsucker.js)
          mesh.bind(new T.Skeleton(r.bones.map(b => obj[b]), M.bind.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
          top.add(mesh); skins.push({ i, mesh });
        } else { mesh = new T.Mesh(g, mats.length > 1 ? mats : mats[0]); obj[i].add(mesh); }
      } else if (r.builtin === 'quad') {
        let m = material(r.mats[0]);
        if (m.uniforms && m.uniforms.uAurora) {   // hai AuroraEffect dùng chung FinaleAuroraEffect_Mat nhưng mỗi cái một đường cong: tách uniform
          const m2 = m.clone(); m2.userData = Object.assign({}, m.userData);
          for (const k of Object.keys(U)) m2.uniforms[k] = U[k];
          m2.uniforms.uAurora = { value: 1 }; m = m2;
        }
        mesh = new T.Mesh(new T.PlaneGeometry(1, 1), m);
        obj[i].add(mesh);
      } else if (r.sprite) {
        // SpriteRenderer: quad cỡ rect/ppu, gốc ở pivot; mặt sprite nhìn về −z Unity (= +z three.js)
        const g = new T.PlaneGeometry(r.size[0], r.size[1]);
        g.translate((0.5 - r.pivot[0]) * r.size[0], (0.5 - r.pivot[1]) * r.size[1], 0);
        const m = material(r.mats[0]).clone(); m.uniforms.tMap.value = tex(r.sprite, false);
        mesh = new T.Mesh(g, m); obj[i].add(mesh);
      }
      if (mesh) { mesh.frustumCulled = false; mesh.name = 'fc mesh ' + nd.n; rends.push({ i, mesh, far: [].concat(mesh.material).some(m => m.userData.far) }); }
    });
    sc.add(top);
    top.visible = false;
    built = { top, obj, rends, skins };
    return built;
  }

  // ------------------------------------------------------------------ trạng thái chạy
  let cur = null;          // { kind, tl, t, i (mốc kế), api, wall[], ready, wait, act[], vcam, audio{}, ps{}, ... }
  const camState = { live: null, from: null, w: 1, look: null, out: null };
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), tmpQ = new T.Quaternion();

  function activeSelf(i) {
    const nd = N[i];
    if (cur && cur.actTrack[i] != null) return cur.actTrack[i];
    if (cur && cur.flActive[i] != null) return cur.flActive[i];
    return nd.p < 0 ? true : !!nd.a;
  }
  function activeIn(i) { for (let k = i; k >= 0; k = N[k].p) if (!activeSelf(k)) return false; return true; }

  // ---- Animation track: danh sách (clip, giờ cục bộ, trọng số) ở giờ timeline t
  function trackSamples(tr, t) {
    const out = [];
    if (tr.inf) { const a = F.anims[tr.inf.clip]; if (a) out.push({ a, lt: Math.max(0, Math.min(a.len, t)), w: 1 }); }
    const cl = tr.clips;
    if (!cl.length) return out;
    const sorted = cl.slice().sort((x, y) => x.start - y.start);
    const lt = (c, tt) => { const a = F.anims[c.clip]; return Math.max(0, Math.min(a.len, c.in + (tt - c.start) * c.ts)); };
    const live = [];
    sorted.forEach((c, k) => {
      const end = c.start + c.dur;
      if (t < c.start || t >= end) return;
      const prev = sorted[k - 1], next = sorted[k + 1];
      const bin = c.bin >= 0 ? c.bin : (prev && prev.start + prev.dur > c.start ? prev.start + prev.dur - c.start : 0);
      const bout = c.bout >= 0 ? c.bout : (next && next.start < end ? end - next.start : 0);
      let w = 1;
      if (bin > 0 && t < c.start + bin) w *= smooth((t - c.start) / bin);
      if (bout > 0 && t > end - bout) w *= smooth((end - t) / bout);
      live.push({ a: F.anims[c.clip], lt: lt(c, t), w });
    });
    if (live.length) return out.concat(live);
    const first = sorted[0];
    if (t < first.start) return first.pre === 1 ? out.concat([{ a: F.anims[first.clip], lt: lt(first, first.start), w: 1 }]) : out;
    let last = null;
    for (const c of sorted) if (c.start + c.dur <= t) last = c;
    if (last && last.post === 1) out.push({ a: F.anims[last.clip], lt: lt(last, last.start + last.dur), w: 1 });
    return out;
  }
  // ---- áp các mẫu lên nút (trộn tuyến tính / nlerp với tư thế nghỉ khi tổng trọng số < 1)
  const acc = new Map();
  function sampleCh(c, a, lt, buf) {
    const v = channel(c, buf), dim = c.k === 'q' ? 4 : 3;
    if (c.n === 1) return [v[0], v[1], v[2], dim === 4 ? v[3] : 0];
    const f = Math.min(c.n - 1, Math.max(0, lt * a.fps)), i0 = Math.floor(f), i1 = Math.min(c.n - 1, i0 + 1), u = f - i0;
    const o = [0, 0, 0, 0];
    if (dim === 4) {
      let d = 0; for (let k = 0; k < 4; k++) d += v[i0 * 4 + k] * v[i1 * 4 + k];
      const s = d < 0 ? -1 : 1;
      for (let k = 0; k < 4; k++) o[k] = v[i0 * 4 + k] * (1 - u) + s * v[i1 * 4 + k] * u;
      const L = Math.hypot(o[0], o[1], o[2], o[3]) || 1; for (let k = 0; k < 4; k++) o[k] /= L;
    } else for (let k = 0; k < 3; k++) o[k] = v[i0 * 3 + k] * (1 - u) + v[i1 * 3 + k] * u;
    return o;
  }
  function evaluate(t, buf) {
    acc.clear();
    const fl = cur.fl; for (const k in fl) delete fl[k];
    cur.flActive = {};
    for (const tr of cur.tl.tracks) {
      if (tr.type !== 'anim') continue;
      for (const s of trackSamples(tr, t)) {
        if (!s.a) continue;
        if (buf) for (const c of s.a.ch) {
          const v = sampleCh(c, s.a, s.lt, buf), key = c.node * 4 + (c.k === 'p' ? 0 : c.k === 'q' ? 1 : 2);
          const e = acc.get(key) || { node: c.node, k: c.k, w: 0, v: [0, 0, 0, 0] };
          if (c.k === 'q' && e.w > 0) { let d = 0; for (let k = 0; k < 4; k++) d += e.v[k] * v[k]; if (d < 0) for (let k = 0; k < 4; k++) v[k] = -v[k]; }
          for (let k = 0; k < 4; k++) e.v[k] += v[k] * s.w;
          e.w += s.w; acc.set(key, e);
        }
        for (const f of s.a.fl) {
          const v = curve(f.keys, s.lt);
          if (f.attr === 'm_IsActive') { const nm = f.path.split('/').pop(); fl['active:' + nm] = v > 0.5; if (f.node >= 0) cur.flActive[f.node] = v > 0.5; }
          else fl[f.attr + '@' + f.node] = (fl[f.attr + '@' + f.node] || 0) + v * s.w;
        }
      }
    }
    // tư thế nghỉ cho mọi nút từng bị hoạt hình chạm, rồi đè giá trị trộn
    const O = built.obj;
    for (const i of cur.animated) { const r = N[i].t; O[i].position.fromArray(r, 0); O[i].quaternion.fromArray(r, 3); O[i].scale.fromArray(r, 7); }
    for (const e of acc.values()) {
      const o = O[e.node], r = N[e.node].t, w = Math.min(1, e.w), inv = e.w > 0 ? 1 / e.w : 0;
      if (e.k === 'q') {
        tmpQ.set(e.v[0], e.v[1], e.v[2], e.v[3]).normalize();
        if (w < 1) o.quaternion.fromArray(r, 3).slerp(tmpQ, w); else o.quaternion.copy(tmpQ);
      } else {
        const base = e.k === 'p' ? 0 : 7, tgt = e.k === 'p' ? o.position : o.scale;
        tgt.set(e.v[0] * inv, e.v[1] * inv, e.v[2] * inv);
        if (w < 1) tgt.set(r[base] + (tgt.x - r[base]) * w, r[base + 1] + (tgt.y - r[base + 1]) * w, r[base + 2] + (tgt.z - r[base + 2]) * w);
      }
    }
    // Activation track
    cur.actTrack = {};
    for (const tr of cur.tl.tracks) if (tr.type === 'act' && tr.node >= 0) cur.actTrack[tr.node] = tr.clips.some(c => t >= c.start && t < c.start + c.dur);
  }

  // ------------------------------------------------------------------ tiếng
  const AUD = root.DR_AUDIO || (root.DR_AUDIO = {});
  for (const [nm, a] of Object.entries(F.audio || {})) {
    const key = 'finale.' + nm.replace(/[^A-Za-z0-9]+/g, '_');
    if (!AUD[key]) AUD[key] = { src: a.src, loop: false, vol: 1, orig: 'finale:' + nm };
  }
  const akey = nm => 'finale.' + nm.replace(/[^A-Za-z0-9]+/g, '_');
  function stepAudio(t0, t1) {
    const A = root.DRAudio; if (!A || !A.voice) return;
    for (const tr of cur.tl.tracks) {
      if (tr.type !== 'audio') continue;
      tr.clips.forEach((c, k) => {
        const id = tr.name + '#' + k, end = c.start + c.dur;
        if (t0 <= c.start && t1 > c.start && !cur.voices[id]) {
          // Music Box / Music: AudioSource của FinaleCutsceneLogic ra Music_User; SFX ra Master_User — nhóm không bị snapshot MUSIC_ONLY hạ.
          // [ĐỀ XUẤT] web chỉ có bus nhạc là không bị W6a hạ (musicOnly hạ sfx/ui/voice) nên cả hai đi bus "Music_*".
          const bus = /Music/i.test(tr.name) ? 'Music_User' : 'Music_FinaleMaster';
          const h = A.voice(akey(c.clip), { vol: c.vol * (tr.vol == null ? 1 : tr.vol), bus, fade: c.ein > 0 ? c.ein : 0, gate: false });
          cur.voices[id] = { h, end };
        }
      });
    }
    for (const id in cur.voices) { const v = cur.voices[id]; if (v.h && v.h.alive && t1 >= v.end && !v.stopped) { v.stopped = true; v.h.stop(0.1); } }
  }
  function stopAudio(f) { if (!cur) return; for (const id in cur.voices) { const v = cur.voices[id]; if (v.h && v.h.alive) v.h.stop(f == null ? 0.3 : f); } cur.voices = {}; }

  // ------------------------------------------------------------------ hệ hạt theo cây (bật khi nút hiện)
  function stepParticles() {
    const P = root.DRParticles; if (!P || !P.spawn) return;
    N.forEach((nd, i) => {
      if (!nd.ps) return;
      const on = activeIn(i), h = cur.ps[i];
      if (on && !h) cur.ps[i] = P.spawn(nd.ps, { parent: nd.p >= 0 ? built.obj[nd.p] : built.top });
      else if (!on && h) { h.stop(); delete cur.ps[i]; }
    });
  }
  // cột sáng BadEndingBeam của W6a (FinalePOIEnabler): bắt tay cầm khi W6a gọi spawn để tắt/bật theo m_IsActive của timeline
  const beacons = new Set();
  if (root.DRParticles && DRParticles.spawn && !DRParticles.spawn._fc) {
    const o = DRParticles.spawn;
    DRParticles.spawn = function (name) { const h = o.apply(this, arguments); if (name === 'BadEndingBeam' && h) beacons.add(h); return h; };
    DRParticles.spawn._fc = true;
  }
  function beaconOn(on) {
    for (const h of beacons) {
      if (!h.alive) { beacons.delete(h); continue; }
      for (const s of h.systems) { if (!on) { s.emitting = false; s.n = 0; } else if (!s.isSub) s.emitting = s.playing = true; }
    }
  }

  // ------------------------------------------------------------------ camera (bọc DRCamera.update: đè tư thế sau khi camera thường tính xong)
  function vcamPose(i) {
    const nd = N[i], vc = nd.vc, O = built.obj;
    O[i].getWorldPosition(tmpV);
    const fov = cur.fl['m_Lens.FieldOfView@' + i] || vc.fov;
    if (vc.look >= 0) O[vc.look].getWorldPosition(tmpV2); else tmpV2.copy(tmpV).add(new T.Vector3(0, 0, -10));
    return { p: tmpV.clone(), look: tmpV2.clone(), sx: vc.sx, sy: vc.sy, fov };
  }
  function liveVcam() {
    let best = -1, prio = -1;
    const w6 = root.DRFinale && DRFinale.state ? DRFinale.state().vcam : null;
    N.forEach((nd, i) => {
      if (!nd.vc) return;
      const enabled = nd.n === 'Credits_VCam' ? !!(w6 && w6.which === 'Credits_VCam') : true;   // creditsVCam.enabled do CutToCredits (W6a) bật
      if (enabled && activeIn(i) && nd.vc.prio > prio) { best = i; prio = nd.vc.prio; }
    });
    return best;
  }
  function stepCamera(cam, dt) {
    const live = liveVcam();
    if (live !== camState.live) {
      const cut = live >= 0 && N[live].n === 'Credits_VCam';
      camState.from = camState.out ? { p: camState.out.p.clone(), q: camState.out.q.clone(), fov: camState.out.fov }
        : { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
      camState.w = cut ? 1 : 0; camState.live = live; camState.look = null;
    }
    camState.w = Math.min(1, camState.w + dt / BLEND);
    let tgt = null;
    if (live >= 0) {
      const s = vcamPose(live);
      // CinemachineComposer damping: điểm nhìn đuổi theo LookAt, còn 1 % sau DAMP giây
      if (!camState.look || dt <= 0) camState.look = s.look.clone();
      else camState.look.lerp(s.look, 1 - Math.pow(0.01, dt / DAMP));
      const a = root.DRDock && DRDock.aim ? DRDock.aim(s.p.toArray(), camState.look.toArray(), s.sx, s.sy, s.fov) : { pos: s.p, look: camState.look };
      const m = new T.Matrix4().lookAt(a.pos, a.look, new T.Vector3(0, 1, 0));
      tgt = { p: a.pos.clone(), q: new T.Quaternion().setFromRotationMatrix(m), fov: s.fov };
    } else tgt = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };   // camera thường (vcam người chơi)
    const k = easeIO(camState.w), f = camState.from;
    const out = f && k < 1 ? { p: f.p.clone().lerp(tgt.p, k), q: f.q.clone().slerp(tgt.q, k), fov: f.fov + (tgt.fov - f.fov) * k } : tgt;
    camState.out = out;
    if (live < 0 && k >= 1) return;     // không còn vcam cảnh kết: để camera thường
    cam.position.copy(out.p); cam.quaternion.copy(out.q);
    if (Math.abs(cam.fov - out.fov) > 1e-4) { cam.fov = out.fov; cam.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ một khung
  let flashK = 0;
  D.on('lightning', () => { flashK = 1; });
  function frame(dt, cam) {
    const buf = bins.cut || null;
    if (!cur.ready) {
      cur.wait += dt;
      if (!buf && cur.wait < WAIT_MAX) return;
      cur.ready = true; build(buf); built.top.visible = true;
      cur.animated = new Set();
      for (const tr of cur.tl.tracks) if (tr.type === 'anim') for (const key of [tr.inf && tr.inf.clip].concat(tr.clips.map(c => c.clip))) {
        const a = key && F.anims[key]; if (a) for (const c of a.ch) cur.animated.add(c.node);
      }
      cur.wall = [performance.now(), null];
      if (!buf) info('cut.bin not loaded: timeline runs without meshes');
    }
    const t0 = cur.t, t1 = Math.min(cur.tl.len, cur.t + dt * timeScale());
    cur.t = t1;
    // Signal Emitter (W6a nhận); mốc 0 s phát ngay khung đầu
    const sg = cur.tl.signals;
    while (cur.i < sg.length && (sg[cur.i][0] <= t1)) { const s = sg[cur.i++]; try { cur.api.signal(s[1]); } catch (e) { console.warn('[finale-cut] signal ' + s[1] + ' failed: ' + e.message); } }
    if (!cur) return;          // tín hiệu có thể đưa về màn đầu
    evaluate(t1, buf);
    // hiển thị theo active-in-hierarchy
    const O = built.obj;
    N.forEach((nd, i) => { O[i].visible = activeSelf(i); });
    for (const s of built.skins) s.mesh.visible = activeIn(s.i);
    // đường cong của FinaleCutsceneLogic + cột sáng W6a
    const fr = Object.keys(cur.fl).find(k => k.startsWith('fogRemove@'));
    if (root.DRSky && DRSky.uniforms && DRSky.uniforms.uDrFogR) DRSky.uniforms.uDrFogR.value = fr ? cur.fl[fr] : cur.fogR0;
    const bump = Object.keys(cur.fl).find(k => k.startsWith('shouldBumpSteepness@')), wb = Object.keys(cur.fl).find(k => k.startsWith('waveBump@'));
    if (bump && cur.fl[bump] > 0.5 && wb && root.DRSky && DRSky.env) DRSky.env.waveSteepness += cur.fl[wb];   // FinaleCutsceneLogic.Update: steepness + waveBump
    beaconOn(cur.fl['active:BadEndingBeam'] !== false);
    flashK = Math.max(0, flashK - dt * 4);
    if (scene && scene.fog) FOGC.value.copy(scene.fog.color);
    U.uTime.value += dt; U.uFlash.value = flashK;
    // [ĐỀ XUẤT] thuộc tính vật liệu cực quang (tên bị băm) chạy 0 → 0,047 (cảnh, 38,8 s) / 1 → 0,05 (credits): coi giá trị/0,05 là độ hiện;
    // khớp clip thật (XBxNqB1hg-E): cực quang chỉ hiện ở cuối cảnh, sau khi Leviathan lặn
    for (const r of built.rends) {
      const u = r.mesh.material.uniforms; if (!u || !u.uAurora || u.uAurora === U.uAurora) continue;
      const v = cur.fl['material.path_0x8808B587_VLinolL@' + r.i];
      u.uAurora.value = v == null ? 1 : Math.max(0, Math.min(1, v / 0.05));
    }
    stepAudio(t0, t1);
    stepParticles();
    stepCamera(cam, dt);
    cur.needFar = built.rends.some(r => r.far && activeIn(r.i));
    if (t1 >= cur.tl.len) finish();
  }

  // ------------------------------------------------------------------ hết timeline (WrapMode None): trả mọi thuộc tính hoạt hình, tắt vật của cảnh
  function finish() {
    if (!cur) return;
    cur.done = true; cur.wall[1] = performance.now();
    info(cur.kind + ' timeline ended at ' + cur.t.toFixed(2) + ' s (' + ((cur.wall[1] - cur.wall[0]) / 1000).toFixed(2) + ' s real)');
    last = { kind: cur.kind, t: cur.t, len: cur.tl.len, wall: cur.wall.slice(), done: true };
    teardown(false);
  }
  function teardown(hard) {
    if (!cur) return;
    stopAudio(hard ? 0.2 : 2);
    for (const i in cur.ps) { try { cur.ps[i].stop(); } catch (e) { /* đã tắt */ } }
    beaconOn(true);
    if (root.DRSky && DRSky.uniforms && DRSky.uniforms.uDrFogR) DRSky.uniforms.uDrFogR.value = cur.fogR0;
    if (built) {
      built.top.visible = false;
      for (const i of cur.animated || []) { const r = N[i].t, o = built.obj[i]; o.position.fromArray(r, 0); o.quaternion.fromArray(r, 3); o.scale.fromArray(r, 7); }
    }
    cur = null; camState.live = null; camState.out = null; camState.from = null;
  }

  // ------------------------------------------------------------------ DestroyGreaterMarrow
  const gm = { hidden: false, ruins: null, fx: null };
  function destroyGreaterMarrow() {
    const W = root.DRWorld;
    if (W && W.hideInstances) W.hideInstances(F.gm.inst, false);
    const B = W && W.ambient && W.ambient.beam;
    if (B && B.rootG) B.rootG.visible = false;
    gm.hidden = true;
    loadBin('ruins').then(buf => {
      if (!gm.hidden || !buf || gm.ruins) return;
      const sc = findScene(); if (!sc) return;
      const R = F.ruins, g = new T.Group(); g.name = 'GM_RuinedTown';
      const objs = R.nodes.map(nd => { const o = new T.Group(); o.name = nd.n; o.position.fromArray(nd.t, 0); o.quaternion.fromArray(nd.t, 3); o.scale.fromArray(nd.t, 7); o.visible = !!nd.a; return o; });
      R.nodes.forEach((nd, i) => (nd.p >= 0 ? objs[nd.p] : g).add(objs[i]));
      R.nodes.forEach((nd, i) => {
        if (!nd.r) return;
        const M = R.meshes[nd.r.mesh], mats = nd.r.mats.map(material);
        const mesh = new T.Mesh(geometry('ruins:' + nd.r.mesh, M, buf), mats.length > 1 ? mats : mats[0]);
        mesh.name = 'ruins ' + nd.n; objs[i].add(mesh);
      });
      sc.add(g); gm.ruins = g; vignette(true);
      // Instantiate(ruinedMarrowsPrefab, Vector3.zero, Quaternion.identity): Fire ×7, Smoke ×6
      if (root.DRParticles && DRParticles.spawn) gm.fx = DRParticles.spawn(R.ps, { pos: [0, 0, 0], loop: true });
    });
    info('DestroyGreaterMarrow: ' + F.gm.inst.length + ' instances hidden (' + F.gm.paths.join(', ') + '), GM_RuinedTown placed');
  }
  // BadEndingCreditsPostProcessing (Volume toàn cục của GM_RuinedTown, priority 100, weight 1): colorFilter đè bộ lọc của js/sky.js mỗi khung
  // (sau DRSky.update, trước khi vẽ), ChromaticAberration 0,2; Vignette 0,299 bằng lớp phủ CSS [ĐỀ XUẤT: hậu kỳ web không có vignette]
  const s2l = c => c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  let vigEl = null;
  function ruinPost() {
    const P = root.DRSky && DRSky.post, pp = F.ruins.post || {}, u = P && P.ready && P.uber && P.uber.uniforms;
    if (!u) return;
    const cf = pp.ColorAdjustments && pp.ColorAdjustments.colorFilter;
    if (cf && u.uFilter) u.uFilter.value.set(s2l(cf[0]), s2l(cf[1]), s2l(cf[2]));
    if (pp.ChromaticAberration && u.uCA) u.uCA.value = Math.max(u.uCA.value, pp.ChromaticAberration.intensity * 0.05);   // cùng hệ số 0,05 của sky.js
  }
  function vignette(on) {
    const v = (F.ruins.post || {}).Vignette;
    if (on && v && !vigEl) {
      vigEl = document.createElement('div'); vigEl.id = 'dr-finale-vignette';
      vigEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:39;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,' + (v.intensity * 2).toFixed(3) + ') 100%)';
      document.body.appendChild(vigEl);
    } else if (!on && vigEl) { vigEl.remove(); vigEl = null; }
  }
  function restoreGreaterMarrow() {
    if (!gm.hidden && !gm.ruins) return;
    const W = root.DRWorld;
    if (W && W.hideInstances) W.hideInstances(F.gm.inst, true);
    const B = W && W.ambient && W.ambient.beam;
    if (B && B.rootG) B.rootG.visible = true;
    if (gm.ruins && gm.ruins.parent) gm.ruins.parent.remove(gm.ruins);
    if (gm.fx) { try { gm.fx.stop(); } catch (e) { /* đã tắt */ } }
    gm.hidden = false; gm.ruins = null; gm.fx = null; vignette(false);
  }

  // ------------------------------------------------------------------ mối nối với W6a
  let last = null;
  function play(kind, api) {
    const tl = F.timelines[kind];
    if (!tl || !api || !api.signal) return false;
    if (cur) teardown(true);
    loadBin('cut');
    cur = { kind, tl, t: 0, i: 0, api, ready: false, wait: 0, wall: [null, null], voices: {}, ps: {}, fl: {}, actTrack: {}, flActive: {}, animated: new Set(),
      fogR0: root.DRSky && DRSky.uniforms && DRSky.uniforms.uDrFogR ? DRSky.uniforms.uDrFogR.value : 0, needFar: false, done: false };
    camState.live = null; camState.out = null; camState.from = null;
    last = null;
    info('play ' + kind + ' (' + tl.len + ' s, ' + tl.tracks.length + ' tracks, ' + tl.signals.length + ' signals)');
    return true;
  }
  Object.assign(C, { play, destroyGreaterMarrow, preload: C.preload });

  function hook() {
    const Cm = root.DRCamera;
    if (Cm && Cm.update && !Cm.update._fc) {
      const o = Cm.update;
      Cm.update = function (dt, mode, env) {
        const r = o.apply(this, arguments);
        if (cur && Cm.cam && mode !== 'title' && !paused()) { try { frame(dt, Cm.cam); } catch (e) { console.error('[finale-cut] frame failed:', e); teardown(true); } }
        if (gm.ruins && mode !== 'title') ruinPost();
        return r;
      };
      Cm.update._fc = true;
    }
    const W = root.DRWorld;
    if (W && W.cull && !W.cull._fc) {
      const o = W.cull;
      W.cull = function () {
        const cam = Cm && Cm.cam;
        if (cur && cur.needFar && cam && cam.far < FAR_CUT) { cam.far = FAR_CUT; cam.updateProjectionMatrix(); }
        return o.apply(this, arguments);
      };
      W.cull._fc = true;
    }
  }
  function cleanup() { teardown(true); restoreGreaterMarrow(); last = null; }
  D.on('mode', m => { if (m === 'title') cleanup(); });
  D.on('load', cleanup); D.on('newgame', cleanup);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();

  C.state = () => {
    const s = cur ? { kind: cur.kind, t: +cur.t.toFixed(3), len: cur.tl.len, playing: cur.ready && !cur.done, done: cur.done, wall: cur.wall.slice() }
      : (last ? Object.assign({ playing: false }, last) : { kind: null, playing: false });
    s.vcam = cur && camState.live >= 0 && camState.live != null ? N[camState.live].n : null;
    s.fov = DRCamera && DRCamera.cam ? +DRCamera.cam.fov.toFixed(2) : null;
    s.active = cur && built ? built.rends.filter(r => activeIn(r.i)).map(r => N[r.i].n) : [];
    s.gm = { hidden: gm.hidden, ruins: !!gm.ruins, beam: !!(root.DRWorld && DRWorld.ambient && DRWorld.ambient.beam && DRWorld.ambient.beam.rootG.visible) };
    s.loaded = { cut: !!bins.cut, ruins: !!bins.ruins };
    s.audio = cur ? Object.keys(cur.voices).filter(k => cur.voices[k].h && cur.voices[k].h.alive) : [];
    return s;
  };
  C.debug = { nodes: N, obj: () => built && built.obj, worldPos: name => { const i = N.findIndex(n => n.n === name); if (i < 0 || !built) return null; return built.obj[i].getWorldPosition(new T.Vector3()).toArray().map(v => +v.toFixed(2)); } };
})(window);
