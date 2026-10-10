/*
 * Tuong dien (InsanityStatue) cua Devil's Spine — 60 tuong (WORLD-GAPS.md §4 va §6 don vi R6). Du lieu: data/statues.js (tools/mimic.py). Than tuong
 * (DS_StatueModel / DS_StatueBowl) da nam trong canh cua lib.glb; o day chi them phan "TurnOn": doi mat do mo ra khi sanity thap.
 *
 * InsanityStatue.cs (nguyen van):
 *   Update: moi evaluationIntervalSec (1 s, dem tu 0 nen khung dau da xet) Evaluate: d = |tuong - thuyen| (3 chieu), time = InverseLerp(0, maxDistance 150, d),
 *   nguong = panicToDistanceThreshold.Evaluate(time) (Hermite; hai duong cong: 50 tuong [(0; 0,6) (0,2; 0,6) (1; 0)], 10 tuong [(0; 0,5) (0,2; 0,5) (1; 0)],
 *   ngoai khoang giu nguyen), toggleObject.SetActive(sanity < nguong).
 * InsanityStatueEyes.cs (nguyen van): chi chay khi TurnOn dang bat; moi Random(2, 5) s: goc = SignedAngle(thuyen - Eyes, Eyes.forward, up),
 *   weightLeft = (1 - InverseLerp(-90, 0, goc)) * 100, weightRight = InverseLerp(0, 90, goc) * 100 -> blendShape 0 (EvilEye_LeftShape) / 1 (EvilEye_RightShape)
 *   cua moi EvilEyeBlendshape (SkinnedMeshRenderer khong xuong, Mesh EvilEye_Base 69 dinh, ShrineEye_Mat).
 * Khong dung duoc: he hat cua TurnOn (lua RedFlameDark, khoi Smoke / EyeSmoke, Glow) khong co trong data/particles.js (tools/mimic.py "Bay").
 * [ĐỀ XUẤT] vat lieu mat: ShrineEye_Mat (Lit_Shader_2, _LightStrength 4) ve theo cong thuc Lit cua js/ray.js + them phat sang (texture x 1, tat dan theo khoang cach camera 100 m,
 *   cong sau suong) de mat do nhin thay duoc ban dem trong suong.
 *
 *   DRStatues.update(dt) (bao DRBoat.update, khong sua js/boat.js)   DRStatues.debug -> { count(), active(), list(), evaluate(), threshold(i), eyes(i) }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_STATUES;
  if (!T || !D || !D.list) { root.DRStatues = null; return; }
  const C = D.config, E = D.eyes;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const GLOW_R = 100;                                        // [ĐỀ XUẤT] m
  let scene = null, group = null, mat = null, geo = null, st = null, timer = 0;

  // AnimationCurve.Evaluate: Hermite theo khoa [t, v, vao, ra]; ngoai khoang giu nguyen (PreInfinity / PostInfinity = Clamp)
  function evalCurve(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    let i = 0;
    while (keys[i + 1][0] < t) i++;
    const a = keys[i], b = keys[i + 1], d = b[0] - a[0], u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
  }
  // Vector3.SignedAngle(from, to, up) trong khong gian Unity (y len, trai tay)
  function signedAngle(f, t) {
    const lf = Math.hypot(f[0], f[1], f[2]), lt = Math.hypot(t[0], t[1], t[2]);
    if (lf < 1e-9 || lt < 1e-9) return 0;
    const ang = Math.acos(clamp((f[0] * t[0] + f[1] * t[1] + f[2] * t[2]) / (lf * lt), -1, 1)) * 180 / Math.PI;
    const cy = f[2] * t[0] - f[0] * t[2];                    // thanh phan y cua tich co huong
    return cy < 0 ? -ang : ang;
  }

  function material() {
    const tex = new T.TextureLoader().load(E.tex);
    tex.encoding = T.sRGBEncoding; tex.wrapS = tex.wrapT = T.RepeatWrapping;
    const m = new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>', `
  vec3 wpE = vDrFogW;
  vec3 litE = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpE) + drEnvLights(wpE) + uDrAmb + (1.0 - drEnvMaskB(wpE.xz)) + vec3(uDrTintK, 0.0, 0.0));
  vec3 emE = diffuseColor.rgb * (1.0 - clamp(vFogDepth / ${GLOW_R.toFixed(1)}, 0.0, 1.0));
  gl_FragColor = vec4(litE, 1.0);`).replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emE, 1.0)).rgb;');
    };
    m.customProgramCacheKey = () => 'drStatueEye';
    return m;
  }
  function geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(E.pos), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(E.nrm), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(E.uv), 2));
    g.setIndex(E.idx);
    g.morphAttributes.position = E.morph.map(a => new T.BufferAttribute(new Float32Array(a), 3));
    g.morphTargetsRelative = true;                           // Unity: delta so voi dinh goc
    return g;
  }

  function sceneOf() {
    if (scene) return scene;
    let o = root.DRBoat && DRBoat.root;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) {
      scene = o; mat = material(); geo = geometry();
      group = new T.Group(); group.name = 'InsanityStatueEyes';
      scene.add(group);
      st = D.list.map((d, i) => ({ d, i, on: false, built: false, node: null, eyes: [], tick: 0, y: d.y }));   // Update chua chay: dem 0 -> xet ngay khung dau
    }
    return scene;
  }
  function buildEyes(S) {                                    // dung lan dau khi tuong bat lan dau (60 tuong, chi nhung tuong gan moi cap nhat)
    S.node = new T.Group(); S.node.name = S.d.n; S.node.visible = false;
    for (const e of S.d.eyes) {
      const E_ = { d: e, meshes: [], t: 0 };
      for (const m of e.m) {
        const me = new T.Mesh(geo, mat);
        me.matrixAutoUpdate = false; me.matrix.fromArray(m); me.frustumCulled = false; me.name = 'EvilEyeBlendshape';
        me.updateMorphTargets && me.updateMorphTargets();
        S.node.add(me); E_.meshes.push(me);
      }
      S.eyes.push(E_);
    }
    group.add(S.node); S.built = true;
  }
  function boatU() { const b = root.DR.s.boat; return [b.x, 0, -b.z]; }          // vi tri thuyen trong khong gian Unity
  function evalEyes(E_) {
    const p = boatU(), e = E_.d.p, f = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
    const ang = signedAngle(f, E_.d.f);
    E_.wl = (1 - invLerp(-90, 0, ang)) * 100; E_.wr = invLerp(0, 90, ang) * 100; E_.angle = ang;
    for (const m of E_.meshes) { m.morphTargetInfluences[0] = E_.wl / 100; m.morphTargetInfluences[1] = E_.wr / 100; }
    E_.t = E_.d.min + Math.random() * (E_.d.max - E_.d.min);
  }
  function threshold(S, b) {                                 // InsanityStatue.Evaluate
    const dx = S.d.x - b.x, dy = S.y - 0, dz = S.d.z - b.z;
    const time = invLerp(0, C.maxDistance, Math.hypot(dx, dy, dz));
    return evalCurve(D.curves[S.d.curve], time);
  }
  function set(S, on) {
    if (on && !S.built) buildEyes(S);
    if (on !== S.on) { S.on = on; if (S.node) S.node.visible = on; }                // dem cua Eyes khong dat lai khi tat / bat (OnEnable khong co)
  }
  function evaluate() {
    const s = root.DR.s, b = s.boat, sanity = s.sanity == null ? 1 : s.sanity;
    for (const S of st) set(S, sanity < threshold(S, b));
  }
  function update(dt) {
    if (!sceneOf()) return;
    const Dr = root.DR, s = Dr && Dr.s;
    if (!s || !s.boat || Dr.mode === 'title') { if (group) group.visible = false; return; }
    group.visible = true;
    if (dt <= 0) return;
    timer -= dt;
    if (timer <= 0) { timer = C.evaluationIntervalSec; evaluate(); }
    for (const S of st) if (S.on) for (const e of S.eyes) { e.t -= dt; if (e.t <= 0) evalEyes(e); }
  }
  if (root.DRBoat && typeof DRBoat.update === 'function' && !DRBoat.update._stat) {
    const orig = DRBoat.update;
    const wrapped = function (dt, env) { const r = orig.apply(this, arguments); try { update(dt); } catch (e) { console.error('[statues]', e); } return r; };
    wrapped._stat = true;
    DRBoat.update = wrapped;
  }

  root.DRStatues = {
    update,
    debug: {
      count: () => D.list.length,
      active: () => (st ? st.filter(S => S.on).length : 0),
      list: () => (st || []).map(S => ({ n: S.d.n, x: S.d.x, y: S.d.y, z: S.d.z, curve: S.d.curve, on: S.on })),
      evaluate: () => { if (sceneOf()) { timer = C.evaluationIntervalSec; evaluate(); } },
      threshold: i => { const S = st && st[i]; return S ? threshold(S, root.DR.s.boat) : null; },
      eyes: i => { const S = st && st[i]; return S && S.eyes.map(e => ({ wl: e.wl, wr: e.wr, angle: e.angle, t: e.t, meshes: e.meshes.length, inf: e.meshes[0].morphTargetInfluences.slice() })); },
      evalEyes: i => { const S = st && st[i]; if (S) for (const e of S.eyes) evalEyes(e); },
      curve: evalCurve, signedAngle,
      nearest: n => { const b = root.DR.s.boat; return (st || []).map(S => ({ i: S.i, d: Math.hypot(S.d.x - b.x, S.y, S.d.z - b.z), on: S.on })).sort((a, c) => a.d - c.d).slice(0, n || 3); }
    }
  };
})(window);
