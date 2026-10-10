/*
 * Sứa nổ bào tử của Stellar Basin (Jellyfish, JellyfishController, JellySporeCollision) — 22 con quanh tâm vùng (19 con nhỏ bơi vòng bán kính 5 m ở rìa, 3 con lớn bán kính 75-83 m
 * quanh SBMonster), chỉ trồi lên về đêm (WORLD-GAPS.md §4, đơn vị R2). Dữ liệu: data/jelly.js (tools/sbcreature.py: Scenes/Game.unity StellarBasin/JellyfishController, Mesh/JellyFish,
 * AnimationClip/jellyfish_{idle,explode}, JellyFish_controller, Jellyfish_{Main,Core,Tentacle}_Mat, GameObject/JellySporeEffect.prefab).
 *
 * JellyfishController.cs: mỗi timeBetweenChecks 5 s (khung đầu kiểm ngay): ban ngày (IsDaytime = dawnTime < giờ < duskTime) → HideAll (Hide(didHit = false));
 *   ban đêm và Xua đuổi (khả năng, không phải máy Xua đuổi) KHÔNG bật → ShowAll. Bật Xua đuổi → BanishAll (Hide(didHit = true)) ngay.
 * Jellyfish.cs: scene bắt đầu: đối tượng đang bật, OnEnable đặt y = downY (−7 hoặc −8), thân ở z = orbitRadius − orbitVariance trong RotationParent, rotator.counterClockwise = counterClockwise,
 *   DOLocalMoveZ(orbitRadius + orbitVariance, varianceSpeed) InOutSine yoyo vô hạn, trễ varianceDelay. RotationParent quay quanh y theo ConstantlyRotateOnY: yaw += dt · (ccw ? −speed : +speed)
 *   (độ/s: 10 cho con nhỏ, 0,5 cho con lớn). Show (không đang đổi và chưa lên): bật, DOMoveY(upY, riseDuration 8 s) (DOTween mặc định OutQuad), xong → đăng ký PlayerDetector, đã lên, vệt nước bật.
 *   Hide: gỡ đăng ký, vệt nước tắt, DOMoveY(downY, didHit ? retreatDuration 10 : fallDuration 10) → tắt đối tượng. PlayerDetector (JellyfishCore_ctrl, cầu trigger r 0,7) chạm thuyền →
 *   Animator trigger `explode` (clip explode 3,3 s, sự kiện FireSignal ở 1,0 s) → OnChargeUpComplete: sinh JellySporeEffect tại thân (offset (0,12; −0,504; 0), co 0,6), Hide(didHit = true).
 * JellySporeCollision.cs:11: bào tử có SphereCollider trigger r 3,5 (× 0,6 = 2,1 m); lần đầu thuyền chạm (OnTriggerEnter, tag Player) → GridManager.InfectRandomItemInInventory (DRInfection.infectRandom),
 *   hasTriggered = true. Gốc KHÔNG gây ô hỏng và KHÔNG trừ hoảng loạn (WORLD-GAPS.md ghi "damage, panic" là suy đoán; mã không có).
 *   Thời sống của bào tử: ParticleSystem chính lengthInSec 3 + startLifetime lớn nhất 3 (stopAction Disable). [ĐỀ XUẤT] lấy 6 s cho khối va chạm.
 *
 *   DRJelly.debug → { state(), step(dt), inst, boatObb... , force(i, 'show'|'hide') }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_JELLY;
  if (!T || !D || !D.nodes) { root.DRJelly = null; return; }
  const P = D.params, FPS = 30, RENDER_FAR = 520, NEAR = 260;
  const S = () => root.DR.s;
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const outQuad = t => 1 - (1 - t) * (1 - t);
  const inOutSine = t => 0.5 * (1 - Math.cos(Math.PI * t));
  if (root.DR_AUDIO && D.audioDefs) for (const k in D.audioDefs) if (!root.DR_AUDIO[k]) root.DR_AUDIO[k] = D.audioDefs[k];
  if (D.particles) {   // hệ hạt của đơn vị (tools/sbcreature.py): vệt nước và vụ nổ bào tử; texture mới (nếu có) nằm ở DR_SBCREATURE.particles.lib
    const A = root.DR_PARTICLES = root.DR_PARTICLES || {};
    for (const k in D.particles.systems) if (!A[k]) A[k] = D.particles.systems[k];
  }

  // ---------------------------------------------------------------- giải mã (như js/sbcreature.js)
  function bytes(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function geometry(M) {
    const u = bytes(M.b64), n = M.n, tr = M.tris * 3;
    let o = 0;
    const u16 = cnt => { const a = new Uint16Array(u.buffer.slice(o, o + cnt * 2)); o += cnt * 2; return a; };
    const pq = u16(n * 3), uq = u16(n * 2), ix = u16(tr);
    const si = u.slice(o, o + n * 4); o += n * 4;
    const sw = u.slice(o, o + n * 4);
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), w = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) { const a = i % 3; pos[i] = M.pmin[a] + pq[i] / 65535 * (M.pmax[a] - M.pmin[a]); }
    for (let i = 0; i < n * 2; i++) { const a = i % 2; uv[i] = M.umin[a] + uq[i] / 65535 * (M.umax[a] - M.umin[a]); }
    for (let v = 0; v < n; v++) {
      let s = 0; for (let k = 0; k < 4; k++) s += sw[v * 4 + k];
      for (let k = 0; k < 4; k++) w[v * 4 + k] = s > 0 ? sw[v * 4 + k] / s : (k === 0 ? 1 : 0);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(si), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(w, 4));
    g.setIndex(new T.BufferAttribute(ix, 1));
    if (M.groups) M.groups.forEach((gr, i) => g.addGroup(gr[0], gr[1], i));
    return g;
  }
  function decodeClip(c) {
    const u = bytes(c.b64), dv = new DataView(u.buffer);
    let o = 0;
    const n = dv.getUint16(o, true); o += 2;
    const byNode = new Map();
    for (let i = 0; i < n; i++) {
      const node = dv.getUint16(o, true), kind = dv.getUint8(o + 2), nc = dv.getUint8(o + 3), nk = dv.getUint16(o + 4, true);
      o += 6;
      const mn = [], mx = [];
      for (let k = 0; k < nc; k++) { mn.push(dv.getFloat32(o, true)); mx.push(dv.getFloat32(o + 4, true)); o += 8; }
      const fr = new Float32Array(nk);
      for (let k = 0; k < nk; k++) fr[k] = u[o + k] / FPS;
      o += nk;
      const vals = new Float32Array(nk * nc);
      for (let k = 0; k < nk * nc; k++) { vals[k] = mn[k % nc] + (dv.getInt16(o, true) + 32768) / 65535 * (mx[k % nc] - mn[k % nc]); o += 2; }
      let e = byNode.get(node);
      if (!e) byNode.set(node, e = {});
      e[kind === 0 ? 'p' : kind === 1 ? 'q' : 's'] = { fr, vals, nc, nk };
    }
    const fl = c.fl.map(f => ({ n: f.n, a: f.a, fr: Float32Array.from(f.k, k => k / FPS), v: Float32Array.from(f.v) }));
    return { len: c.len, loop: c.loop, byNode, fl, ev: c.ev };
  }
  function seg(fr, nk, t) {
    if (t <= fr[0]) return 0;
    if (t >= fr[nk - 1]) return nk - 1;
    let lo = 0, hi = nk - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m] <= t) lo = m; else hi = m; }
    return lo;
  }
  function evalTrack(tr, t, out) {
    const nc = tr.nc, a = seg(tr.fr, tr.nk, t);
    if (a >= tr.nk - 1 || tr.nk === 1) { for (let c = 0; c < nc; c++) out[c] = tr.vals[(tr.nk - 1) * nc + c]; return out; }
    const k = (t - tr.fr[a]) / (tr.fr[a + 1] - tr.fr[a]);
    for (let c = 0; c < nc; c++) out[c] = tr.vals[a * nc + c] + (tr.vals[(a + 1) * nc + c] - tr.vals[a * nc + c]) * k;
    return out;
  }
  function evalFloat(f, t) {
    const a = seg(f.fr, f.fr.length, t);
    if (a >= f.fr.length - 1) return f.v[f.v.length - 1];
    const k = (t - f.fr[a]) / (f.fr[a + 1] - f.fr[a]);
    return f.v[a] + (f.v[a + 1] - f.v[a]) * k;
  }
  const texCache = {};
  function tex(src, srgb) {
    if (texCache[src]) return texCache[src];
    const t = new T.TextureLoader().load(src);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (srgb) t.encoding = T.sRGBEncoding;
    return (texCache[src] = t);
  }
  function glowMaterial(def) {   // cùng GlowPulseBioLume_Shader với js/sbcreature.js
    const m = new T.MeshBasicMaterial({ map: tex(def.alb, true) });
    const uni = {
      uSbGlow: { value: tex(def.mask, false) }, uSbTime: { value: 0 }, uSbCol: { value: new T.Vector3(def.col[0], def.col[1], def.col[2]) },
      uSbK: { value: def.glowStrength }, uSbP: { value: new T.Vector4(def.scale, def.sx, def.sy, def.noise) }, uSbFade: { value: def.fadeDist }
    };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uSbGlow; uniform float uSbTime, uSbK, uSbFade; uniform vec3 uSbCol; uniform vec4 uSbP;
float sbHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float sbNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sbHash(i), sbHash(i + vec2(1.0, 0.0)), u.x), mix(sbHash(i + vec2(0.0, 1.0)), sbHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`).replace('#include <output_fragment>', `
  vec3 wpS = vDrFogW;
  vec3 litS = diffuseColor.rgb * (uDrSunCol * drEnvCloud(wpS) + drEnvLights(wpS) + uDrAmb + (1.0 - drEnvMaskB(wpS.xz)) + vec3(uDrTintK, 0.0, 0.0));
  vec2 uvS = vUv + uSbTime * uSbP.yz;
  vec2 nP = uvS * uSbP.w;
  float nzS = sbNoise(nP) * 0.125 + sbNoise(nP * 0.5) * 0.25 + sbNoise(nP * 0.25) * 0.5;
  float fadeS = 1.0 - clamp((vFogDepth - uSbFade * 0.5) / (uSbFade * 0.5), 0.0, 1.0);
  float nightS = 1.0 - (uDrSunDir.y + 1.0) * 0.5;
  vec3 emR = drS2L(texture2D(uSbGlow, uvS * uSbP.x).rgb) * nzS * uSbCol * uSbK * fadeS * nightS * 0.8;
  vec3 emS = vec3(1.2) * (vec3(1.0) - exp(-emR * 0.6));   // web không có bloom HDR: nén mềm thay cho kẹp cứng, giữ được vân GlowMask
  gl_FragColor = vec4(litS, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emS, 1.0)).rgb;');
    };
    m.customProgramCacheKey = () => 'drSbGlow';
    m.userData.uni = uni;
    return m;
  }

  // ---------------------------------------------------------------- hộp thuyền
  const BX = root.DR_BOAT && DR_BOAT.colliderSize || {};
  const PLAYER_BOX = BX.player || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _inv = new T.Matrix4(), _lp = new T.Vector3();
  // Collider của thuyền theo trạng thái vật lý DR.s.boat (Rigidbody; không theo nội suy hình vẽ) + chúi / nghiêng của mô hình (bob); y = cao độ nổi của gốc thuyền
  const _bm = new T.Matrix4(), _bq = new T.Quaternion(), _bp = new T.Vector3(), _by = new T.Quaternion(), _bup = new T.Vector3(0, 1, 0), _one = new T.Vector3(1, 1, 1);
  function boatInv() {
    const B = root.DRBoat, b = root.DR.s && root.DR.s.boat;
    if (!B || !B.root || !B.bob || !b) return false;
    _by.setFromAxisAngle(_bup, b.yaw);
    _bq.copy(_by).multiply(B.bob.quaternion);
    _bp.set(b.x, B.root.position.y, b.z);
    _bm.compose(_bp, _bq, _one);
    _inv.copy(_bm).invert();
    return true;
  }
  function d2Box(x, y, z) {   // khoảng cách² điểm → collider Player (hộp, hệ thuyền; z đổi dấu)
    _lp.set(x, y, z).applyMatrix4(_inv);
    const c = PLAYER_BOX.center, h = PLAYER_BOX.size;
    const dx = Math.max(Math.abs(_lp.x - c[0]) - h[0] / 2, 0), dy = Math.max(Math.abs(_lp.y - c[1]) - h[1] / 2, 0), dz = Math.max(Math.abs(_lp.z + c[2]) - h[2] / 2, 0);
    return dx * dx + dy * dy + dz * dz;
  }

  // ---------------------------------------------------------------- dựng
  const clips = {};
  for (const k in D.clips) clips[k] = decodeClip(D.clips[k]);
  const AN = D.controller, REST = D.nodes;
  const ATTR_COL = /^material\.Color_a7ce2b7bd770432e92093ddfae428c15\.([rgba])$/;
  let scene = null, geo = null, ready = false;
  const inst = [];
  function sceneOf() {
    if (scene) return scene;
    let o = root.DRBoat && DRBoat.root;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) scene = o;
    return scene;
  }
  function make(d, i) {
    const nodes = REST.map((n, k) => {
      const o = D.skin.bones.includes(k) ? new T.Bone() : new T.Object3D();
      o.name = n.name; o.position.fromArray(n.t); o.quaternion.fromArray(n.q); o.scale.fromArray(n.s);
      return o;
    });
    REST.forEach((n, k) => { if (n.parent >= 0) nodes[n.parent].add(nodes[k]); });
    const mats = D.slots.map(nm => glowMaterial(D.mats[nm]));
    const mesh = new T.SkinnedMesh(geo, mats);
    mesh.frustumCulled = false; mesh.visible = false; mesh.name = 'JellyFish';
    mesh.bind(new T.Skeleton(D.skin.bones.map(k => nodes[k]), D.mesh.bind.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    scene.add(nodes[0]); scene.add(mesh);
    nodes[0].visible = false;
    const j = {
      i, d, nodes, mesh, mats, active: true, isUp: false, isChanging: false, y: d.downY, tween: null, yaw: d.yaw + d.rpYaw, rot: 0, zl: d.orbit - d.variance, vt: 0, vdelay: d.varianceDelay,
      sensors: 0, detectSub: false, signalSub: false, st: { name: AN.default, t: 0 }, tr: null, trig: false, exploded: 0, trail: false, x: d.x, z: d.z, bodyPos: new T.Vector3(), core: new T.Vector3()
    };
    onEnable(j);
    return j;
  }
  function build() {
    const sc = sceneOf();
    if (!sc) return false;
    geo = geometry(D.mesh);
    D.instances.forEach((d, i) => inst.push(make(d, i)));
    ready = true;
    return true;
  }

  // ---------------------------------------------------------------- Jellyfish.cs
  function onEnable(j) {   // OnEnable: y = downY, thân ở orbit − variance, tween phương sai
    j.active = true; j.y = j.d.downY; j.zl = j.d.orbit - j.d.variance; j.vt = 0; j.vdelay = j.d.varianceDelay; j.tween = null;
    j.st = { name: AN.default, t: 0 }; j.tr = null; j.trig = false; j.sensors = 0; j.exploded = 0;
  }
  function show(j) {
    if (j.isChanging || j.isUp) return;
    j.isChanging = true;
    if (!j.active) onEnable(j);   // SetActive(true) → OnEnable
    j.tween = { kind: 'up', from: j.y, to: j.d.upY, t: 0, dur: j.d.rise };
  }
  function hide(j, didHit) {
    if (j.isChanging || !j.isUp) return;
    j.isUp = false; j.isChanging = true; j.detectSub = false; j.signalSub = false; j.trail = false;
    j.tween = { kind: 'down', from: j.y, to: j.d.downY, t: 0, dur: didHit ? j.d.retreat : j.d.fall };
  }
  function tweenTick(j, dt) {
    const tw = j.tween;
    if (!tw) return;
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    j.y = tw.from + (tw.to - tw.from) * outQuad(k);
    if (k >= 1) {
      j.y = tw.to; j.tween = null;
      if (tw.kind === 'up') { j.detectSub = true; j.isChanging = false; j.isUp = true; j.trail = true; }
      else { j.isChanging = false; j.active = false; }
    }
  }
  function onPlayerDetected(j) {   // OnPlayerDetected: gỡ đăng ký, nghe tín hiệu, trigger explode
    j.detectSub = false; j.signalSub = true; j.trig = true;
    j.log = (j.log || []).concat([['detected', clock]]);
  }
  function onSignal(j) {           // OnChargeUpComplete
    j.signalSub = false;
    spawnSpore(j);
    hide(j, true);
  }

  // ---------------------------------------------------------------- bào tử (JellySporeEffect)
  const spores = [];
  const SP = D.spore, SPORE_LIFE = SP.duration + SP.lifeMax;
  function spawnSpore(j) {
    const b = j.nodes[0];
    b.updateWorldMatrix(true, false);
    const p = new T.Vector3(SP.offset[0], SP.offset[1], SP.offset[2]).applyMatrix4(b.matrixWorld);
    const s = { x: p.x, y: p.y, z: p.z, r: SP.radius * SP.scale, t: 0, triggered: false, from: j.i };
    spores.push(s);
    j.exploded++;
    if (SP.audio.key && root.DRAudio && DRAudio.resolve(SP.audio.key)) {
      try { DRAudio.voice(SP.audio.key, { vol: SP.audio.volume, pos: { x: p.x, y: p.y, z: p.z }, min: SP.audio.min, max: SP.audio.max }); } catch (e) { /* chưa có WebAudio */ }
    }
    if (root.DRParticles && root.DRParticles.has && DRParticles.has('JellySporeEffect')) {
      try { s.fx = DRParticles.spawn('JellySporeEffect', { pos: [b.position.x, b.position.y, b.position.z], yaw: b.rotation.y }); } catch (e) { s.fx = null; }   // gốc prefab (0,12; −0,504; 0) co 0,6 nằm trong attach
    }
    root.DR.emit('jellyExploded', { i: j.i, x: p.x, z: p.z });
  }
  function sporeTick(dt) {
    for (let k = spores.length - 1; k >= 0; k--) {
      const s = spores[k];
      s.t += dt;
      if (!s.triggered && boatInv() && d2Box(s.x, s.y, s.z) <= s.r * s.r) {   // OnTriggerEnter (Player): một lần
        s.triggered = true;
        s.infected = root.DRInfection && DRInfection.infectRandom ? DRInfection.infectRandom() : null;
        stat.infections++;
        root.DR.emit('jellyInfect', { infected: s.infected });
      }
      if (s.t >= SPORE_LIFE) spores.splice(k, 1);
    }
  }

  // ---------------------------------------------------------------- Animator của sứa (idle ⇄ explode)
  const cl = (j, name) => clips[name === 'jellyfish_explode' ? 'jellyfish_explode' : 'jellyfish_idle'];
  function animStep(j, dt) {
    const cur = j.st;
    const fire = (run, w) => {
      const c = cl(j, run.name);
      if (w <= 0) return;
      for (const e of c.ev) if (run.t - dt < e[0] && e[0] <= run.t && e[1] === 'FireSignal' && j.signalSub) onSignal(j);
    };
    cur.t += dt;
    if (j.tr) { j.tr.to.t += dt; j.tr.el += dt; }
    fire(cur, j.tr ? 1 - Math.min(1, j.tr.el / j.tr.dur) : 1);
    if (j.tr) fire(j.tr.to, Math.min(1, j.tr.el / j.tr.dur));
    if (j.tr && j.tr.el >= j.tr.dur) { j.st = j.tr.to; j.tr = null; }
    if (!j.tr) {
      const c0 = cl(j, j.st.name), nt = j.st.t / c0.len;
      for (const t of AN.trans.filter(t => t.from === j.st.name)) {
        if (!t.conds.every(c => (c.t === 'trigger' ? j.trig : false))) continue;
        if (t.exit != null && nt < t.exit) continue;
        if (t.conds.length) j.trig = false;
        const dest = { name: t.to, t: t.offset * cl(j, t.to).len };
        if (t.dur <= 0) j.st = dest; else j.tr = { to: dest, dur: t.dur, el: 0 };
        break;
      }
    }
  }
  const _v = [0, 0, 0, 0], _qa = new T.Quaternion(), _qb = new T.Quaternion();
  function poseNode(j, c, t, k, out) {
    const r = REST[k];
    out[0] = r.t[0]; out[1] = r.t[1]; out[2] = r.t[2]; out[3] = r.q[0]; out[4] = r.q[1]; out[5] = r.q[2]; out[6] = r.q[3]; out[7] = r.s[0]; out[8] = r.s[1]; out[9] = r.s[2];
    const e = c.byNode.get(k);
    if (!e) return;
    if (e.p) { evalTrack(e.p, t, _v); out[0] = _v[0]; out[1] = _v[1]; out[2] = _v[2]; }
    if (e.q) { evalTrack(e.q, t, _v); out[3] = _v[0]; out[4] = _v[1]; out[5] = _v[2]; out[6] = _v[3]; }
    if (e.s) { evalTrack(e.s, t, _v); out[7] = _v[0]; out[8] = _v[1]; out[9] = _v[2]; }
  }
  const _a = new Float64Array(10), _b = new Float64Array(10);
  const animated = new Set();
  for (const k in clips) { for (const n of clips[k].byNode.keys()) animated.add(n); }
  const ct = (c, run) => (c.loop ? ((run.t % c.len) + c.len) % c.len : Math.min(run.t, c.len));
  function pose(j) {
    const c0 = cl(j, j.st.name), t0 = ct(c0, j.st);
    let c1 = null, t1 = 0, w = 0;
    if (j.tr) { c1 = cl(j, j.tr.to.name); t1 = ct(c1, j.tr.to); w = Math.min(1, j.tr.el / j.tr.dur); }
    for (const k of animated) {
      poseNode(j, c0, t0, k, _a);
      if (c1) {
        poseNode(j, c1, t1, k, _b);
        for (let i = 0; i < 3; i++) _a[i] += (_b[i] - _a[i]) * w;
        _qa.set(_a[3], _a[4], _a[5], _a[6]).normalize(); _qb.set(_b[3], _b[4], _b[5], _b[6]).normalize();
        if (_qa.dot(_qb) < 0) { _qb.x = -_qb.x; _qb.y = -_qb.y; _qb.z = -_qb.z; _qb.w = -_qb.w; }
        _qa.slerp(_qb, w);
        _a[3] = _qa.x; _a[4] = _qa.y; _a[5] = _qa.z; _a[6] = _qa.w;
        for (let i = 7; i < 10; i++) _a[i] += (_b[i] - _a[i]) * w;
      }
      const n = j.nodes[k];
      n.position.set(_a[0], _a[1], _a[2]); n.quaternion.set(_a[3], _a[4], _a[5], _a[6]).normalize(); n.scale.set(_a[7], _a[8], _a[9]);
    }
    // đường cong vật liệu trên 'JellyFish' (renderer.material = vật liệu khe 0): màu phát sáng + GlowStrength; khác thì về mặc định
    const um = j.mats[0].userData.uni, base = D.mats[D.slots[0]];
    const get = (c, t, a) => { for (const f of c.fl) if (f.a === a) return evalFloat(f, t); return null; };
    const attrs = ['material._GlowStrength', 'material.Color_a7ce2b7bd770432e92093ddfae428c15.r', 'material.Color_a7ce2b7bd770432e92093ddfae428c15.g', 'material.Color_a7ce2b7bd770432e92093ddfae428c15.b'];
    attrs.forEach((a, ai) => {
      const bv = ai === 0 ? base.glowStrength : base.col[ai - 1];
      let v0 = get(c0, t0, a); if (v0 == null) v0 = bv;
      let v = v0;
      if (c1) { let v1 = get(c1, t1, a); if (v1 == null) v1 = bv; v = v0 + (v1 - v0) * w; }
      if (ai === 0) um.uSbK.value = v; else um.uSbCol.value.setComponent(ai - 1, v);
    });
  }

  // ---------------------------------------------------------------- vòng lặp
  const stat = { infections: 0 };
  let clock = 0, checkT = 0, banish = false;
  function placeBody(j) {   // RotationParent quay quanh y (Unity), thân ở z cục bộ zl; toạ độ three: z đổi dấu
    const th = (j.yaw + j.rot) * Math.PI / 180;
    j.bodyPos.set(j.x + Math.sin(th) * j.zl, j.y, j.z - Math.cos(th) * j.zl);
    const root0 = j.nodes[0];
    root0.position.copy(j.bodyPos);
    root0.rotation.set(0, -th, 0);
    root0.visible = j.active;
  }
  function tick(dt) {
    const Dr = root.DR, s = Dr && Dr.s;
    if (!s || !s.boat) return;
    if (!ready && !build()) return;
    clock += dt;
    const b = s.boat;
    // JellyfishController.Update
    checkT -= dt;
    if (checkT <= 0) {
      checkT = P.timeBetweenChecks;
      const TC = (root.DR_ENV && DR_ENV.time) || { dawnTime: 0.25, duskTime: 0.75 };
      const day = root.DRRules.isDay(s.time, TC.dawnTime, TC.duskTime);
      if (day) inst.forEach(j => hide(j, false));
      else if (!banish) inst.forEach(j => show(j));
    }
    const dist = Math.hypot(b.x - D.instances[0].x, b.z - D.instances[0].z);
    const ok = boatInv();
    for (const j of inst) {
      // ConstantlyRotateOnY chỉ chạy khi đối tượng bật
      if (j.active) {
        j.rot += dt * (j.d.ccw ? -j.d.rotateSpeed : j.d.rotateSpeed);
        // DOLocalMoveZ(orbit + variance, varianceSpeed) InOutSine, yoyo, trễ varianceDelay
        if (j.d.variance !== 0) {
          if (j.vdelay > 0) j.vdelay -= dt;
          else {
            j.vt += dt;
            const ph = (j.vt / j.d.varianceSpeed) % 2, p = ph <= 1 ? ph : 2 - ph;
            j.zl = (j.d.orbit - j.d.variance) + 2 * j.d.variance * inOutSine(p);
          }
        }
        tweenTick(j, dt);
        animStep(j, dt);
        placeBody(j);
        pose(j);
        // cảm biến lõi: SphereCollider r 0,7 trigger + PlayerDetector (đếm 0 → ≥ 1 mới báo)
        if (ok) {
          j.nodes[0].updateWorldMatrix(true, true);
          const core = j.nodes[D.detect.node];
          core.updateWorldMatrix(true, false);
          j.core.set(D.detect.center[0], D.detect.center[1], D.detect.center[2]).applyMatrix4(core.matrixWorld);
          const inside = d2Box(j.core.x, j.core.y, j.core.z) <= D.detect.radius * D.detect.radius ? 1 : 0;
          if (inside && !j.sensors && j.detectSub) onPlayerDetected(j);
          j.sensors = inside;
        }
      } else j.sensors = 0;
      const vis = j.active && Math.hypot(b.x - j.x, b.z - j.z) < RENDER_FAR;
      j.mesh.visible = vis;
      // waterTrailObject (BoatTrailParticles): bật khi sứa đã lên, tắt khi Hide; chỉ phát khi ở gần
      const wantTrail = j.trail && vis && root.DRParticles && DRParticles.has('JellyBoatTrail');
      if (wantTrail && !j.fx) j.fx = DRParticles.spawn('JellyBoatTrail', { parent: j.nodes[0], loop: true });
      else if (!wantTrail && j.fx) { j.fx.stop(); j.fx = null; }
      if (vis) for (const m of j.mats) m.userData.uni.uSbTime.value += dt;
    }
    sporeTick(dt);
    void dist;
  }
  const Dr0 = root.DR;
  if (Dr0 && Dr0.on) {
    Dr0.on('banish', on => {                               // OnPlayerAbilityToggled(banish): chỉ khả năng, máy Xua đuổi không tính
      banish = !!on;
      if (on && ready) inst.forEach(j => hide(j, true));
    });
    const reset = () => { checkT = 0; spores.length = 0; if (ready) inst.forEach(j => { onEnable(j); j.isUp = false; j.isChanging = false; j.detectSub = false; j.signalSub = false; }); };
    Dr0.on('load', reset);
    Dr0.on('newgame', reset);
  }
  let last = 0, lastMode = null;
  function frame(now) {
    root.requestAnimationFrame(frame);
    const rdt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const Dr = root.DR;
    try {
      if (!Dr || !Dr.s || Dr.mode === 'title') { lastMode = 'title'; return; }
      lastMode = Dr.mode;
      tick(Dr.mode === 'cargo' || Dr.paused ? 0 : rdt * (Dr.timeScale != null ? Dr.timeScale : 1));
    } catch (e) { if (!frame.warned) { frame.warned = true; console.error('[jelly]', e); } }
  }
  if (root.requestAnimationFrame) root.requestAnimationFrame(frame);

  root.DRJelly = {
    debug: {
      step: dt => { const Dr = root.DR; if (Dr && Dr.s) tick(dt); },
      state: () => ({
        ready, clock, checkT, banish, spores: spores.map(s => ({ x: s.x, z: s.z, t: s.t, triggered: s.triggered, r: s.r, infected: s.infected })), infections: stat.infections,
        inst: inst.map(j => ({ i: j.i, active: j.active, isUp: j.isUp, isChanging: j.isChanging, y: j.y, zl: j.zl, st: j.st.name, tr: j.tr ? j.tr.to.name : null, detectSub: j.detectSub,
          signalSub: j.signalSub, sensors: j.sensors, x: j.bodyPos.x, z: j.bodyPos.z, rot: j.rot, visible: j.mesh.visible, exploded: j.exploded }))
      }),
      force(i, what) { const j = inst[i]; if (what === 'show') show(j); else hide(j, what === 'hitHide'); },
      reset: () => { checkT = 0; },
      get inst() { return inst; }, get spores() { return spores; }, restart() { checkT = 0; }
    }
  };
})(window);
