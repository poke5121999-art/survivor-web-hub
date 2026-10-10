/*
 * Màn mở đầu của ván mới, hai phần như bản gốc:
 *  1) Cảnh minh hoạ (Scenes/IntroCutscene.unity + AnimationClip IntroCutscene.anim, IntroIllustratedCutscene.cs):
 *     31,78 giây, ba cảnh (thuyền trên biển → Morgan ngồi trong buồng lái với tờ "Job Listing: Angler Wanted" → hải đăng,
 *     thuyền đắm trên đá). Dựng lại bằng three.js từ đúng cây GameObject, SpriteRenderer (thứ tự vẽ = sortingOrder),
 *     camera phối cảnh FOV 60 và mọi đường cong vị trí / góc / tỉ lệ / màu / bật tắt của clip; tiếng nền opening-ambience
 *     bật lúc 0,5 s (đối tượng "Audio"). Bỏ qua: sau 2 giây, giữ Space (hoặc giữ chuột) 2 giây (DelayedAddSkip, DredgePlayerActionHold 2f).
 *     Hạt bụi / sương (ParticleSystem) không dựng [ĐỀ XUẤT].
 *  2) Cảnh máy quay trong thế giới (IntroCinematicLogic + IntroCinematic.playable): vCam "IntroCinematicVcam_LighthouseClose"
 *     (FOV 40) bay theo clip ghi sẵn, nhìn "LookAtTarget" từ hải đăng về bến Greater Marrow trong 7 giây; mốc tín hiệu 5,5 s
 *     = OnIntroCutsceneEndSignal (ghi "played-intro-cinematic", bắt đầu ván: giao diện bến chạy GreaterMarrow_Root → Mayor_Intro_0),
 *     7,17 s chuyển sang GreaterMarrowDockVCam.
 *   DRIntro.playing  DRIntro.stage ('illustrated'|'cinematic'|null)  DRIntro.skip()  DRIntro.time()
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const Y = root.DR_YARN || {};
  const SKIP_DELAY = 2, SKIP_HOLD = 2;            // IntroIllustratedCutscene.DelayedAddSkip: 2 s, DredgePlayerActionHold(..., 2f)
  const FADE_AUDIO = 1.5;                         // [ĐỀ XUẤT] audioFadeOutDuration nằm trong scene, không đọc được
  const I = root.DRIntro = { playing: false, stage: null };
  let st = null;

  // ------------------------------------------------------------ đường cong Unity (Hermite, tiếp tuyến ∞ = bậc thang)
  const inf = v => v === 'Inf' || v === '-Inf';
  function sample(keys, n, t, out) {
    // keys: [t, v0..vn-1, in0..inn-1, out0..outn-1]
    if (t <= keys[0][0]) { for (let i = 0; i < n; i++) out[i] = keys[0][1 + i]; return out; }
    const L = keys[keys.length - 1];
    if (t >= L[0]) { for (let i = 0; i < n; i++) out[i] = L[1 + i]; return out; }
    let a = 0;
    while (a < keys.length - 2 && keys[a + 1][0] <= t) a++;
    const k0 = keys[a], k1 = keys[a + 1], dt = k1[0] - k0[0], s = (t - k0[0]) / dt;
    const s2 = s * s, s3 = s2 * s;
    for (let i = 0; i < n; i++) {
      const p0 = k0[1 + i], p1 = k1[1 + i], o0 = k0[1 + 2 * n + i], i1 = k1[1 + n + i];
      if (inf(o0) || inf(i1)) { out[i] = p0; continue; }
      out[i] = (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * o0 * dt + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * i1 * dt;
    }
    return out;
  }
  // Quaternion.Euler của Unity: quay Z rồi X rồi Y (q = qy·qx·qz); đổi sang three.js tay phải: (−x, −y, z, w)
  const qx = new T.Quaternion(), qy = new T.Quaternion(), qz = new T.Quaternion(), AX = new T.Vector3(1, 0, 0), AY = new T.Vector3(0, 1, 0), AZ = new T.Vector3(0, 0, 1);
  function unityEuler(q, e) {
    const d = Math.PI / 180;
    qx.setFromAxisAngle(AX, e[0] * d); qy.setFromAxisAngle(AY, e[1] * d); qz.setFromAxisAngle(AZ, e[2] * d);
    q.copy(qy).multiply(qx).multiply(qz);
    q.set(-q.x, -q.y, q.z, q.w);
    return q;
  }

  // ------------------------------------------------------------ phần 1: cảnh minh hoạ
  function buildIllustrated() {
    const D = Y.intro;
    const wrap = document.createElement('div'); wrap.id = 'dr-intro'; wrap.className = 'dr-ui';
    const canvas = document.createElement('canvas'); wrap.appendChild(canvas);
    const scrim = document.createElement('div'); scrim.className = 'in-scrim'; wrap.appendChild(scrim);
    const text = document.createElement('div'); text.className = 'in-text'; wrap.appendChild(text);
    // thẻ chương lúc nạp (bản gốc: góc phải-dưới, chuỗi loading.themed "Dredging the depths"; clip 00:00 và 00:35)
    const card = document.createElement('div'); card.className = 'in-card'; card.innerHTML = '<i></i><span>Vét sâu đáy biển</span>'; wrap.appendChild(card);
    const skip = document.createElement('div'); skip.className = 'in-skip';
    skip.innerHTML = '<i></i><span>Giữ Space để bỏ qua</span>';
    wrap.appendChild(skip);
    document.body.appendChild(wrap);
    const renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.5));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x000000, 1);
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(D.fov || 60, 1, 0.3, 1000);
    const loader = new T.TextureLoader();
    const objs = [], byPath = {};
    const geoCache = {};
    for (const n of D.nodes) {
      const o = new T.Object3D();
      o.position.set(n.p[0], n.p[1], -n.p[2]);
      o.quaternion.set(-n.r[0], -n.r[1], n.r[2], n.r[3]);
      o.scale.set(n.s[0], n.s[1], n.s[2]);
      o.visible = n.active;
      o.userData.n = n;
      if (n.sprite) {
        const s = n.sprite;
        const key = [s.w, s.h, s.px, s.py, s.flipX, s.flipY].join(',');
        let g = geoCache[key];
        if (!g) {
          g = new T.PlaneGeometry(s.w, s.h);
          g.translate((0.5 - s.px) * s.w, (0.5 - s.py) * s.h, 0);
          if (s.flipX || s.flipY) {
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, s.flipX ? 1 - uv.getX(i) : uv.getX(i), s.flipY ? 1 - uv.getY(i) : uv.getY(i));
          }
          geoCache[key] = g;
        }
        const tex = loader.load(s.src);
        tex.encoding = T.sRGBEncoding;
        const additive = /SoftParticle/.test(s.src);
        const m = new T.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide,
          blending: additive ? T.AdditiveBlending : T.NormalBlending });
        const c = s.color || [1, 1, 1, 1];
        m.color.setRGB(c[0], c[1], c[2]).convertSRGBToLinear();
        m.opacity = c[3] == null ? 1 : c[3];
        const mesh = new T.Mesh(g, m);
        mesh.renderOrder = s.order;
        o.add(mesh);
        o.userData.mat = m;
      }
      objs.push(o);
      if (!byPath[n.path]) byPath[n.path] = o;
      if (n.parent >= 0) objs[n.parent].add(o); else scene.add(o);
    }
    // Vệt nắng trên nước dưới mặt trời (Scene1BoatWave/WaterHighlight_Particles: hạt trắng-xanh nhạt, sống 1–2 s, 200 hạt/s).
    // [ĐỀ XUẤT] không dựng đúng hệ hạt Unity: rải các vệt ngang nhấp nháy trên mặt nước y = −1,82 theo đường từ camera tới mặt trời.
    const glitter = [];
    const sc1 = byPath['Scene1Container'];
    if (sc1) {
      const gg = new T.PlaneGeometry(1, 1);
      const cam0 = [-3.88566, -1.37914, -7.08846], sunZ = 21.1, sunX = 0;      // Camera pos t=0 / Scene1Sun
      for (let i = 0; i < 90; i++) {
        const u = Math.random(), z = 2 + u * u * 36;                             // dày ở gần, thưa ở xa
        const k = (z - cam0[2]) / (sunZ - cam0[2]);
        const cx = cam0[0] + (sunX - cam0[0]) * k, spread = 0.7 + z * 0.35 * (1 - Math.min(1, z / 45));
        const m = new T.MeshBasicMaterial({ color: new T.Color(0.55, 0.8, 0.85), transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
        const q = new T.Mesh(gg, m);
        q.position.set(cx + (Math.random() - 0.5) * spread * 2, -1.82, -z);
        const w = (0.1 + Math.random() * 0.5) * (0.5 + z * 0.12);
        q.scale.set(w, w * 0.05, 1); q.renderOrder = 6;
        q.userData = { ph: Math.random() * 6.28, f: 1.5 + Math.random() * 2.5, a: 0.35 + Math.random() * 0.5 };
        sc1.add(q); glitter.push(q);
      }
    }
    // CutsceneProfile (Volume toàn cục của IntroCutscene.unity): ColorLookup LUT_0 (đóng góp 1), Vignette 0,22 / smoothness 1, FilmGrain 0,4.
    // Bỏ qua: Bloom 1,5 (ngưỡng 1, cần HDR), ChromaticAberration 0,1, MotionBlur [ĐỀ XUẤT].
    const rt = new T.WebGLRenderTarget(4, 4, { samples: 4, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    rt.texture.encoding = T.sRGBEncoding;
    const lutTex = new T.TextureLoader().load('art/ui/intro/LUT_0.png?v=20261010d');
    lutTex.minFilter = lutTex.magFilter = T.LinearFilter; lutTex.generateMipmaps = false;
    const post = new T.Scene(), postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMat = new T.ShaderMaterial({
      uniforms: { tScene: { value: rt.texture }, tLut: { value: lutTex }, uT: { value: 0 } },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tScene; uniform sampler2D tLut; uniform float uT; varying vec2 vUv;
        vec3 lut(vec3 c) { c = clamp(c, 0.0, 1.0); float b = c.b * 31.0, b0 = floor(b), b1 = min(b0 + 1.0, 31.0), f = b - b0;
          float v = (c.g * 31.0 + 0.5) / 32.0;
          vec3 a = texture2D(tLut, vec2((b0 * 32.0 + c.r * 31.0 + 0.5) / 1024.0, v)).rgb;
          vec3 d = texture2D(tLut, vec2((b1 * 32.0 + c.r * 31.0 + 0.5) / 1024.0, v)).rgb;
          return mix(a, d, f); }
        void main() {
          vec3 c = lut(texture2D(tScene, vUv).rgb);
          vec2 dist = abs(vUv - 0.5) * 0.22 * 3.0;                                  // URP Vignette
          c *= pow(clamp(1.0 - dot(dist, dist), 0.0, 1.0), 1.0);
          float n = fract(sin(dot(vUv * 913.0 + uT, vec2(12.9898, 78.233))) * 43758.5453);
          c += (n - 0.5) * 0.4 * 0.08;                                              // FilmGrain 0,4 [ĐỀ XUẤT: biên độ]
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    post.add(new T.Mesh(new T.PlaneGeometry(2, 2), postMat));
    const camNode = byPath['Camera/CameraMain'];
    const textNode = D.nodes.find(n => n.path === 'Canvas/Text');
    if (textNode && textNode.text) {
      text.textContent = textNode.text.text;
      text.style.setProperty('--fs', textNode.text.size);
    }
    // RectTransform → khung CSS (đơn vị canvas 1920×1080 khớp chiều cao); Canvas/Text: dải đáy cao 80
    function placeText() {
      const rt = textNode && textNode.rt;
      if (!rt) return;
      const w = root.innerWidth, h = root.innerHeight, k = h / 1080;
      const ww = (rt.amax[0] - rt.amin[0]) * w + rt.sd[0] * k, hh = (rt.amax[1] - rt.amin[1]) * h + rt.sd[1] * k;
      const cx = (rt.amin[0] + (rt.amax[0] - rt.amin[0]) * rt.piv[0]) * w + rt.ap[0] * k;
      const cy = (rt.amin[1] + (rt.amax[1] - rt.amin[1]) * rt.piv[1]) * h + rt.ap[1] * k;
      Object.assign(text.style, { left: (cx - rt.piv[0] * ww) + 'px', bottom: (cy - rt.piv[1] * hh) + 'px', width: ww + 'px', height: hh + 'px' });
    }
    const curves = (D.curves || []).map(c => ({ c, o: byPath[c.path] || null, buf: [0, 0, 0] }));
    function resize() {
      const w = root.innerWidth, h = root.innerHeight;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      rt.setSize(Math.max(1, Math.floor(w * renderer.getPixelRatio())), Math.max(1, Math.floor(h * renderer.getPixelRatio())));
      wrap.style.setProperty('--s', (h / 1080).toFixed(4));   // CanvasScaler 1920×1080, khớp chiều cao
      placeText();
    }
    root.addEventListener('resize', resize); resize();
    const scrimA = { v: 1 }, textOn = { v: false };
    function apply(t) {
      for (const it of curves) {
        const { c, buf } = it;
        if (c.path === 'Canvas/Scrim' && c.attr === 'm_Color.a') { scrimA.v = sample(c.keys, 1, t, buf)[0]; continue; }
        if (c.path === 'Canvas/Text' && c.attr === 'm_IsActive') { textOn.v = sample(c.keys, 1, t, buf)[0] > 0.5; continue; }
        if (c.path === 'Audio' && c.attr === 'm_IsActive') { if (sample(c.keys, 1, t, buf)[0] > 0.5) audio(true); continue; }
        const o = it.o; if (!o) continue;
        if (c.kind === 'pos') { sample(c.keys, 3, t, buf); o.position.set(buf[0], buf[1], -buf[2]); }
        else if (c.kind === 'euler') { sample(c.keys, 3, t, buf); unityEuler(o.quaternion, buf); }
        else if (c.kind === 'scale') { sample(c.keys, 3, t, buf); o.scale.set(buf[0], buf[1], buf[2]); }
        else if (c.attr === 'm_IsActive') o.visible = sample(c.keys, 1, t, buf)[0] > 0.5;
        else if (o.userData.mat && /^m_Color\.[rgba]$/.test(c.attr)) {
          const v = sample(c.keys, 1, t, buf)[0], m = o.userData.mat, ch = c.attr.slice(-1);
          if (ch === 'a') m.opacity = v;
          else { const lin = Math.pow(Math.max(0, v), 2.2); if (ch === 'r') m.color.r = lin; else if (ch === 'g') m.color.g = lin; else m.color.b = lin; }
        }
      }
      scrim.style.opacity = Math.max(0, Math.min(1, scrimA.v)).toFixed(3);
      for (const q of glitter) q.material.opacity = q.userData.a * Math.max(0, Math.sin(t * q.userData.f + q.userData.ph)) ** 2;
      postMat.uniforms.uT.value = t % 10;
      text.classList.toggle('on', textOn.v);
      if (camNode) {
        camNode.updateWorldMatrix(true, false);
        camNode.matrixWorld.decompose(cam.position, cam.quaternion, new T.Vector3());
      }
    }
    function dispose() {
      root.removeEventListener('resize', resize);
      scene.traverse(o => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      for (const g of Object.values(geoCache)) g.dispose();
      rt.dispose(); lutTex.dispose(); postMat.dispose();
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      wrap.remove();
    }
    return { wrap, skip, card, apply, render: () => { renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(post, postCam); }, dispose, dur: D.dur || 31.78 };
  }

  let audioOn = false;
  function audio(on) {
    if (!root.DRAudio || !Y.intro || !Y.intro.audio) return;
    root.DR_AUDIO = root.DR_AUDIO || {};
    if (!root.DR_AUDIO['intro.opening']) root.DR_AUDIO['intro.opening'] = { src: Y.intro.audio, loop: false, vol: 1 };
    if (on && !audioOn) { audioOn = true; DRAudio.music(null); DRAudio.loop('intro.opening', 0.9); }
    else if (!on && audioOn) { audioOn = false; DRAudio.loop('intro.opening', 0); setTimeout(() => DRAudio.stopLoop('intro.opening'), FADE_AUDIO * 1000); }
  }

  // ------------------------------------------------------------ phần 2: máy quay trong thế giới
  function cineSampler() {
    const C = Y.cinematic;
    if (!C || !C.tracks) return null;
    const P = new T.Matrix4().fromArray(C.parent);    // ma trận thế giới của "IntroCinematic" (Unity), cột trước
    const vc = C.tracks.find(t => /Vcam/i.test(t.target)), la = C.tracks.find(t => /LookAt/i.test(t.target));
    if (!vc || !la || !vc.keys.length || !la.keys.length) return null;
    const off = new T.Quaternion(), e = vc.offE, d = Math.PI / 180;
    // AnimationPlayableAsset.m_EulerAngles theo Quaternion.Euler (Unity, chưa đổi tay)
    qx.setFromAxisAngle(AX, e[0] * d); qy.setFromAxisAngle(AY, e[1] * d); qz.setFromAxisAngle(AZ, e[2] * d);
    off.copy(qy).multiply(qx).multiply(qz);
    const v = new T.Vector3(), b = [0, 0, 0];
    const toThree = p => [p.x, p.y, -p.z];
    return {
      dur: vc.dur, signal: (C.signals || [5.5])[0], fov: C.fov, sx: C.sx, sy: C.sy,
      at(t) {
        sample(vc.keys, 3, t, b);
        v.set(b[0], b[1], b[2]).applyQuaternion(off).add(new T.Vector3(vc.offP[0], vc.offP[1], vc.offP[2])).applyMatrix4(P);
        const pos = toThree(v);
        sample(la.keys, 3, t, b);
        v.set(b[0], b[1], b[2]).applyMatrix4(P);
        return { pos, look: toThree(v) };
      }
    };
  }

  // ------------------------------------------------------------ điều khiển
  let raf = 0, last = 0, hold = 0, holding = false;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
    if (!st) return;
    st.t += dt;
    if (st.stage === 'illustrated') {
      const V = st.ill;
      if (st.t >= SKIP_DELAY) V.skip.classList.add('on');
      if (holding && st.t >= SKIP_DELAY) { hold += dt; V.skip.style.setProperty('--p', Math.min(1, hold / SKIP_HOLD)); if (hold >= SKIP_HOLD) { endIllustrated(); return; } }
      else { hold = 0; V.skip.style.setProperty('--p', 0); }
      V.apply(Math.min(st.t, V.dur));
      V.card.classList.toggle('on', st.t < 1.5 || st.t > V.dur - 2);   // đầu và cuối phần minh hoạ, lúc màn đen
      V.render();
      if (st.t >= V.dur) endIllustrated();
    } else if (st.stage === 'cinematic') {
      const C = st.cine, t = st.t;
      if (t < C.dur + 0.17) {
        const s = C.at(Math.min(t, C.dur));
        const a = root.DRDock && DRDock.aim ? DRDock.aim(s.pos, s.look, C.sx, C.sy, C.fov) : { pos: new T.Vector3(s.pos[0], s.pos[1], s.pos[2]), look: new T.Vector3(s.look[0], s.look[1], s.look[2]) };
        if (root.DRCamera) DRCamera.dockView = { pos: a.pos, look: a.look, t: 1 };
        if (DRCamera.cam && DRCamera.cam.fov !== C.fov) { DRCamera.cam.fov = C.fov; DRCamera.cam.updateProjectionMatrix(); }
      }
      if (!st.begun && t >= C.signal) begin();
      if (t >= C.dur + 0.17) finish(true);
    }
  }

  function start() {
    if (!Y.intro || !Y.intro.nodes) { console.warn('[intro] DR_YARN.intro missing, skipping intro'); return; }
    I.playing = true; I.stage = 'illustrated';
    st = { stage: 'illustrated', t: 0, ill: buildIllustrated(), cine: cineSampler(), begun: false };
    st.ill.wrap.addEventListener('pointerdown', () => { holding = true; });
    st.ill.wrap.addEventListener('pointerup', () => { holding = false; });
    st.ill.wrap.addEventListener('pointerleave', () => { holding = false; });
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    root.DR.emit('intro', 'illustrated');
  }
  // IntroIllustratedCutscene.DoCutsceneComplete → nạp Game → IntroCinematicLogic.OnGameStartable: director.Play
  function endIllustrated() {
    if (!st || st.stage !== 'illustrated') return;
    audio(false);
    st.ill.dispose(); st.ill = null;
    root.DR.s.vars['has-viewed-intro-cutscene'] = true;
    if (!st.cine) { begin(); finish(true); return; }
    st.stage = 'cinematic'; I.stage = 'cinematic'; st.t = 0;
    root.DR.emit('intro', 'cinematic');
  }
  // OnIntroCutsceneEndSignal: played-intro-cinematic = true, BeginGame (giao diện bến hiện, chạy node gốc của bến)
  function begin() {
    if (!st || st.begun) return;
    st.begun = true;
    root.DR.s.vars['played-intro-cinematic'] = true;
    I.playing = false;
    if (root.DRDock && DRDock.resume) DRDock.resume();
    root.DR.emit('intro', 'begin');
  }
  function finish(toDock) {
    if (!st) return;
    const C = st.cine;
    if (st.ill) { audio(false); st.ill.dispose(); }
    st = null; I.playing = false; I.stage = null;
    cancelAnimationFrame(raf);
    if (C && root.DRCamera && DRCamera.cam) { DRCamera.cam.fov = root.DR_BOAT.physics.camera.defaultFOV; DRCamera.cam.updateProjectionMatrix(); }
    // Activation Track (3) lúc 7,17 s: GreaterMarrowDockVCam — trộn về vCam của bến
    const dk = toDock && root.DR.s && (Y.docks || {})[root.DR.s.dock];
    if (dk && dk.vcam && root.DRCamera && root.DR.mode === 'dock' && root.DRDock && DRDock.cam) DRDock.cam(dk.vcam, 0);
    root.DR.emit('intro', 'done');
  }
  function skip() {
    // bỏ qua trước khi start() kịp chạy (newgame đặt 'pending' rồi start sau setTimeout 0): coi như đã xem xong
    if (!st && I.stage === 'pending') {
      I.playing = false; I.stage = null;
      root.DR.s.vars['has-viewed-intro-cutscene'] = true; root.DR.s.vars['played-intro-cinematic'] = true;
      if (root.DRDock && DRDock.resume) DRDock.resume();
      root.DR.emit('intro', 'done');
      return true;
    }
    if (!st) return false;
    if (st.stage === 'illustrated') endIllustrated();
    if (st && st.stage === 'cinematic') { begin(); finish(true); }
    return true;
  }

  root.addEventListener('keydown', e => {
    if (!st) return;
    if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
      if (st.stage === 'illustrated') holding = true;
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener('keyup', e => { if (st && (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter')) { holding = false; e.stopImmediatePropagation(); } }, true);

  if (root.DR && root.DR.on) {
    // ván mới: chưa xem thì phát (IntroCinematicLogic.OnGameLoaded đọc "played-intro-cinematic")
    // I.playing bật ngay (đồng bộ) để DRDock đang mở bến đợi phần mở đầu thay vì chạy hội thoại luôn
    root.DR.on('newgame', () => {
      if (root.DR.s.vars['played-intro-cinematic'] || !Y.intro) return;
      I.playing = true; I.stage = 'pending';
      setTimeout(() => { if (I.stage === 'pending') start(); }, 0);
    });
    // rời bến / về màn đầu giữa chừng thì dừng phần mở đầu
    root.DR.on('mode', m => {
      if (!st && I.stage === 'pending' && m !== 'dock') { I.playing = false; I.stage = null; }
      if (st && m !== 'dock') { if (st.stage === 'illustrated') { audio(false); st.ill.dispose(); st.ill = null; } st = null; I.playing = false; I.stage = null; cancelAnimationFrame(raf); }
    });
  }

  Object.assign(I, { start, skip, time: () => st ? st.t : null, _debug: () => st && { stage: st.stage, t: st.t, begun: st.begun } });
})(window);
