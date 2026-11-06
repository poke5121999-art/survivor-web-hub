/*
 * Sinh vật Stellar Basin (SBMonster) — miệng khổng lồ ở tâm vùng, nhô xúc tu lên mặt nước (WORLD-GAPS.md §4, đơn vị R2).
 * Dữ liệu: data/sbcreature.js (tools/sbcreature.py: Scenes/Game.unity StellarBasin/SBMonster, 12 SkinnedMeshRenderer, 18 clip, SBMonsterController).
 *
 * SBMonsterAnimationHelper.cs (số ở scene, data/sbcreature.js `params`):
 *   - PlayerDetector (DetectionZone: 5 SphereCollider trigger, tâm (0, 0, 0) thế giới + offset, r 30 / 42 / 18 / 13 / 10) đếm collider thuyền (tag Player)
 *     đang chạm: OnPlayerDetected khi đếm từ 0 lên ≥ 1, OnPlayerExitDetected khi về đúng 0 (PlayerDetector.cs). Thuyền = hộp collider `player` của DR_BOAT.
 *   - OnPlayerDetected: hasDetectedPlayer, ClampedLookAtTarget.Target = thuyền, SetDetectsPlayer(true) cho 4 loại Animator, tiếng gầm Aggro (cách nhau ≥ aggroDelaySec 10 s),
 *     tốc độ quay lookAt DOTween 0,3 → 2 trong 2 s (OutQuad). OnPlayerExitDetected: Target = null, SetDetectsPlayer(false), tốc độ về 0,3.
 *   - Update (:211-266), BỎ QUA hết khi Xua đuổi (khả năng) HOẶC máy Xua đuổi đang bật:
 *       thấy thuyền và thuyền còn sống: khoảng cách ngang tới thuyền → mục tiêu tỉ lệ xúc tu Lerp(0,7; 1, invLerp(0, 50, d)); góc giữa hướng +z của lookAt và hướng tới thuyền
 *       < 5° thì timePlayerHasBeenInRange += dt (đang câu thì đặt luôn = 5 s), ngược lại về 0; ≥ 5 s thì TriggerAttack (trigger `attack` của Animator miệng và xúc tu tấn công)
 *       và về 0. Tiếng Aggro mỗi 10 s. Không thấy thuyền: tỉ lệ về 0,7, bộ đếm về 0, tiếng gọi (Call) mỗi callDelaySec 22 s (Time.time).
 *       tỉ lệ hiện tại = Lerp(hiện tại, mục tiêu, dt) áp vào localScale của SBMonster_AttackTentacle.
 *   - SetBanished(b = khả năng || máy): tiếng Emerge / Submerge, bool `banished` của mọi Animator (Any State → Banish, 0,25 s; ra khỏi Banish khi hết: Banish → Spawn).
 *   - AnimationEvent trên clip tấn công của xúc tu (SBMonsterAttackAnimationHelper): PlayPreAttackSFX (0,1667 s), PlayAttackSFX (0,9333 s, SFX_PLAYER không 3D),
 *     OnAttackComplete (3,1667 s) → playerDamager.AddListeners().
 *   - Gây hại (VariablePlayerDamager.cs): 3 CapsuleCollider (r 1 m, cao 5 m theo trục x) ở 3 xương cuối xúc tu, mỗi cái có PlayerDetector, va chạm vật lý. Mọi va chạm
 *     xúc tu - thuyền (OnCollisionEnter, đếm 0 → ≥ 1) gọi OnPlayerHit nếu còn người nghe: oneHitOnly → RemoveListeners, AddDamageToInventory(2), không requireOneHealthToKill.
 *     BẪY ĐO TRONG MÃ GỐC: AddListeners ở cuối mỗi đòn dùng Delegate.Combine, không kiểm đã đăng ký chưa. Đòn trượt để lại một người nghe (OnEnable đã có 1), mỗi RemoveListeners
 *     chỉ gỡ một, và Unity gọi hết danh sách chụp sẵn: sau k đòn trượt, chạm đầu tiên gây 2 × (k + 1) ô hỏng rồi mới về 0 người nghe. Web giữ đúng (`armed`).
 *   - ClampedLookAtTarget.cs: mỗi khung Quaternion.Lerp(rot, LookAt(thuyền) hoặc rot ban đầu, Speed · dt) cho AttackTentacleContainer.
 *   - Animator: SBMonsterController (Spawn → Idle (hết clip, 0,25 s); Idle ⇄ AlertIdle theo detectsPlayer 1,587 / 1,534 s; AlertIdle → Attack trigger 0,25 s, Attack → AlertIdle hết clip;
 *     Any State → Banish khi banished 0,25 s; Banish → Spawn khi hết banished). InterruptionSource = None: đang hoà thì không xét chuyển khác. Bốn xúc tu nhỏ cùng offset 0
 *     (1 / Count · i là chia số nguyên = 0). WriteDefaultValues: nút không có đường cong trong clip về tư thế nghỉ.
 *
 * Vật liệu: Shader Graphs/GlowPulseBioLume_Shader (DXBC D:/dredge-ref/cache/sb/GlowPulseBioLume_Shader.txt): Albedo × ánh sáng thế giới (như ray.js / angler.js) + phát sáng =
 * GlowMask cuộn UV × nhiễu giá trị 3 tầng (0,125 / 0,25 / 0,5) × GlowColour × GlowStrength × mờ theo khoảng cách camera (đầy tới EmissionFadeDistance/2, về 0 ở EmissionFadeDistance)
 * × (1 − (sunDir.y + 1)/2) (chỉ về đêm); web không có bloom HDR nên nén mềm 1,2 · (1 − e^(−0,6 · giá trị)) thay cho giá trị thô (tới hàng chục). [ĐỀ XUẤT] bỏ hệ số texture mây cuộn theo toạ độ thế giới (t0) → hằng 0,8.
 *
 *   DRSbCreature.debug → { state(), step(dt), colliders(), boatObb(), set(k, v) ... }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_SBCREATURE;
  if (!T || !D || !D.nodes) { root.DRSbCreature = null; return; }
  const P = D.params, FPS = 30, DETECT_FAR = 200, RENDER_FAR = 520, ANIM_FAR = 700;
  const KEY_EXPIRY = 'banish-machine-expiry';
  if (root.DR_AUDIO && D.audioDefs) for (const k in D.audioDefs) if (!root.DR_AUDIO[k]) root.DR_AUDIO[k] = D.audioDefs[k];   // tiếng mới của sinh vật (audio/sb/*.mp3)
  // hệ hạt của đơn vị (bọt nước lúc xúc tu đập; tools/sbcreature.py dùng máy chuyển của tools/particles.py) nhập vào DR_PARTICLES trước khi js/particles.js chạy spawn
  if (D.particles) {
    const A = root.DR_PARTICLES = root.DR_PARTICLES || {}, L = root.DR_PARTICLES_LIB = root.DR_PARTICLES_LIB || { textures: {}, sprites: {}, meshes: {} };
    for (const k in D.particles.systems) if (!A[k]) A[k] = D.particles.systems[k];
    for (const c of ['textures', 'sprites', 'meshes']) { L[c] = L[c] || {}; for (const k in ((D.particles.lib || {})[c] || {})) if (!L[c][k]) L[c][k] = D.particles.lib[c][k]; }
  }
  const S = () => root.DR.s;
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp01((v - a) / (b - a));
  const outQuad = t => 1 - (1 - t) * (1 - t);

  // ---------------------------------------------------------------- giải mã
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
  // clip nhị phân (tools/sbcreature.py pack_track): u16 nTrack; mỗi track u16 node, u8 kind (0 p, 1 q, 2 s), u8 nComp, u16 nKey, nComp x (f32 min, f32 max), nKey x u8 khung, nKey*nComp x i16
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
    return { len: c.len, loop: c.loop, byNode, fl, ev: c.ev, tracks: n };
  }
  function seg(fr, nk, t) {   // chỉ số khoá a sao cho fr[a] <= t < fr[a+1] (nhị phân)
    if (t <= fr[0]) return 0;
    if (t >= fr[nk - 1]) return nk - 1;
    let lo = 0, hi = nk - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m] <= t) lo = m; else hi = m; }
    return lo;
  }
  function evalTrack(tr, t, out) {   // nội suy tuyến tính; q chuẩn hoá ở nơi gọi
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

  // ---------------------------------------------------------------- vật liệu (GlowPulseBioLume_Shader)
  const texCache = {};
  function tex(src, srgb) {
    if (texCache[src]) return texCache[src];
    const t = new T.TextureLoader().load(src);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (srgb) t.encoding = T.sRGBEncoding;
    return (texCache[src] = t);
  }
  function glowMaterial(def) {
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
float sbNoise(vec2 p) {   // Shader Graph "Simple Noise": 3t²−2t³ giữa bốn hash góc ô
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

  // ---------------------------------------------------------------- dựng
  let scene = null, built = null;
  const clips = D.clips.map(decodeClip);
  const AN = D.controller;
  const REST = D.nodes;
  const ATTR_COL = /^material\.Color_a7ce2b7bd770432e92093ddfae428c15\.([rgba])$/;

  function sceneOf() {
    if (scene) return scene;
    let o = root.DRBoat && DRBoat.root;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) scene = o;
    return scene;
  }
  function build() {
    const sc = sceneOf();
    if (!sc) return null;
    const skinSet = new Set();
    for (const r of D.renderers) for (const b of r.bones) skinSet.add(b);
    const nodes = REST.map((n, i) => {
      const o = skinSet.has(i) ? new T.Bone() : new T.Object3D();
      o.name = n.name; o.position.fromArray(n.t); o.quaternion.fromArray(n.q); o.scale.fromArray(n.s);
      return o;
    });
    REST.forEach((n, i) => { if (n.parent >= 0) nodes[n.parent].add(nodes[i]); });
    nodes[0].position.fromArray(D.origin);
    sc.add(nodes[0]);
    const geos = D.meshes.map(geometry);
    const mats = {};
    const rends = D.renderers.map(r => {
      const m = glowMaterial(D.mats[r.mat]);
      const mesh = new T.SkinnedMesh(geos[r.mesh], m);
      mesh.name = r.name; mesh.frustumCulled = false; mesh.visible = false;
      const inv = D.meshes[r.mesh].bind.map(a => new T.Matrix4().fromArray(a));
      mesh.bind(new T.Skeleton(r.bones.map(i => nodes[i]), inv), new T.Matrix4());   // vị trí đỉnh = xương · bindpose (đã gồm tỉ lệ 0,01 của nút mesh)
      sc.add(mesh);
      mats[r.name] = m;
      return { def: r, mesh, mat: m, uni: m.userData.uni, baseCol: D.mats[r.mat].col.slice(), baseK: D.mats[r.mat].glowStrength, enabled: r.enabled };
    });
    const rendOfNode = new Map(rends.map(r => [r.def.node, r]));
    // nhóm Animator
    const groups = D.groups.map(g => {
      const remap = g.remap || null;
      const list = new Map();    // nút gốc trong clip -> nút đích
      const flKeys = new Map();
      for (const k in g.clips) {
        const c = clips[g.clips[k]];
        for (const n of c.byNode.keys()) list.set(n, remap && remap[n] != null ? remap[n] : n);
        for (const f of c.fl) flKeys.set(f.n + '|' + f.a, { n: remap && remap[f.n] != null ? remap[f.n] : f.n, a: f.a });
      }
      return { id: g.id, node: g.node, clips: g.clips, remap, anim: [...list.entries()], flKeys: [...flKeys.entries()], cur: { name: D.controller.default, t: 0 }, tr: null,
        params: { banished: false, detectsPlayer: false, attack: false, offset: 0 }, evFired: 0 };
    });
    const si = REST.findIndex(n => n.name === 'Splash');   // bọt nước: Animator bật m_IsActive lúc xúc tu đập (clip tấn công 0,9667 s)
    return { nodes, rends, rendOfNode, groups, geos, active: {}, splash: si >= 0 ? { node: si, parent: REST[si].parent, fx: null } : null };
  }

  // ---------------------------------------------------------------- Animator (SBMonsterController)
  const cname = (g, st) => clips[g.clips[({ Spawn: 'spawn', Idle: 'idle', AlertIdle: 'alert', Attack: 'attack', Banish: 'banish' })[st]]];
  function condOk(g, c) { const v = g.params[c.p]; return c.mode === 1 ? !!v : !v; }
  function groupStep(g, dt, onEvent) {
    const cur = g.cur, tr = g.tr;
    const evs = (run, w) => {   // sự kiện hoạt ảnh của clip có trọng số > 0 (đi qua mốc trong khung này)
      const c = cname(g, run.name);
      if (!c.ev.length || w <= 0) return;
      const t0 = run.t - dt;
      for (const e of c.ev) if (t0 < e[0] && e[0] <= run.t) onEvent(g, e[1]);
    };
    cur.t += dt;
    if (tr) { tr.to.t += dt; tr.el += dt; }
    evs(cur, tr ? 1 - Math.min(1, tr.el / (tr.dur || 1e-6)) : 1);
    if (tr) evs(tr.to, Math.min(1, tr.el / (tr.dur || 1e-6)));
    if (tr && tr.el >= tr.dur) { g.cur = tr.to; g.tr = null; }
    if (!g.tr) {
      const c0 = cname(g, g.cur.name), nt = c0.len > 0 ? g.cur.t / c0.len : 0;
      const order = AN.trans.filter(t => t.from === '*').concat(AN.trans.filter(t => t.from === g.cur.name));
      for (const t of order) {
        if (t.from === '*' && t.to === g.cur.name && !t.self) continue;
        if (!t.conds.every(c => condOk(g, c))) continue;
        if (t.exit != null && nt < t.exit) continue;
        for (const c of t.conds) if (c.t === 'trigger') g.params[c.p] = false;   // consume trigger
        const dest = { name: t.to, t: t.offset * cname(g, t.to).len };
        if (t.dur <= 0) { g.cur = dest; g.tr = null; } else g.tr = { to: dest, dur: t.dur, el: 0 };
        break;
      }
    }
  }
  const _pa = new Float64Array(10), _pb = new Float64Array(10), _v = [0, 0, 0, 0];
  const _qa = new T.Quaternion(), _qb = new T.Quaternion();
  function clipTime(c, run) { return c.loop ? ((run.t % c.len) + c.len) % c.len : Math.min(run.t, c.len); }
  function poseOf(c, t, src, dst, out) {   // tư thế nút theo clip (mặc định tư thế nghỉ của nút đích)
    const r = REST[dst];
    out[0] = r.t[0]; out[1] = r.t[1]; out[2] = r.t[2]; out[3] = r.q[0]; out[4] = r.q[1]; out[5] = r.q[2]; out[6] = r.q[3]; out[7] = r.s[0]; out[8] = r.s[1]; out[9] = r.s[2];
    const e = c.byNode.get(src);
    if (!e) return;
    if (e.p) { evalTrack(e.p, t, _v); out[0] = _v[0]; out[1] = _v[1]; out[2] = _v[2]; }
    if (e.q) { evalTrack(e.q, t, _v); out[3] = _v[0]; out[4] = _v[1]; out[5] = _v[2]; out[6] = _v[3]; }
    if (e.s) { evalTrack(e.s, t, _v); out[7] = _v[0]; out[8] = _v[1]; out[9] = _v[2]; }
  }
  function applyGroup(g, B) {
    const c0 = cname(g, g.cur.name), t0 = clipTime(c0, g.cur), tr = g.tr;
    let c1 = null, t1 = 0, w = 0;
    if (tr) { c1 = cname(g, tr.to.name); t1 = clipTime(c1, tr.to); w = tr.dur > 0 ? Math.min(1, tr.el / tr.dur) : 1; }
    for (const [src, dst] of g.anim) {
      poseOf(c0, t0, src, dst, _pa);
      let o = _pa;
      if (c1) {
        poseOf(c1, t1, src, dst, _pb);
        for (let i = 0; i < 3; i++) _pa[i] += (_pb[i] - _pa[i]) * w;
        _qa.set(_pa[3], _pa[4], _pa[5], _pa[6]).normalize(); _qb.set(_pb[3], _pb[4], _pb[5], _pb[6]).normalize();
        if (_qa.dot(_qb) < 0) { _qb.x = -_qb.x; _qb.y = -_qb.y; _qb.z = -_qb.z; _qb.w = -_qb.w; }
        _qa.slerp(_qb, w);
        _pa[3] = _qa.x; _pa[4] = _qa.y; _pa[5] = _qa.z; _pa[6] = _qa.w;
        for (let i = 7; i < 10; i++) _pa[i] += (_pb[i] - _pa[i]) * w;
        o = _pa;
      }
      const n = B.nodes[dst];
      n.position.set(o[0], o[1], o[2]);
      n.quaternion.set(o[3], o[4], o[5], o[6]).normalize();
      n.scale.set(o[7], o[8], o[9]);
    }
    // đường cong số thực: màu phát sáng / GlowStrength / m_Enabled / m_IsActive (nút không có đường cong về giá trị mặc định của vật liệu)
    for (const [, k] of g.flKeys) {
      const r = B.rendOfNode.get(k.n);
      const get = (c, t) => { for (const f of c.fl) if (f.a === k.a && (g.remap && g.remap[f.n] != null ? g.remap[f.n] : f.n) === k.n) return evalFloat(f, t); return null; };
      let v0 = get(c0, t0), v1 = c1 ? get(c1, t1) : null;
      const m = ATTR_COL.exec(k.a);
      if (!r) { if (k.a === 'm_IsActive') B.active[k.n] = (c1 && w >= 0.5 ? v1 : v0) > 0.5; continue; }
      let base = null;
      if (m) base = m[1] === 'a' ? 1 : r.baseCol['rgb'.indexOf(m[1])];
      else if (k.a === 'material._GlowStrength') base = r.baseK;
      else if (k.a === 'm_Enabled') base = r.enabled ? 1 : 0;
      else continue;
      if (v0 == null) v0 = base;
      let v = v0;
      if (c1) { if (v1 == null) v1 = base; v = v0 + (v1 - v0) * w; }
      if (m) { if (m[1] !== 'a') r.uni.uSbCol.value.setComponent('rgb'.indexOf(m[1]), v); }
      else if (k.a === 'material._GlowStrength') r.uni.uSbK.value = v;
      else r.enabledNow = v > 0.5;
    }
  }

  // ---------------------------------------------------------------- hộp thuyền (collider tag Player) và hình học va chạm
  const BX = root.DR_BOAT && DR_BOAT.colliderSize || {};
  const PLAYER_BOX = BX.player || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _inv = new T.Matrix4(), _w = new T.Vector3(), _e = new T.Vector3(), _c = new T.Vector3(), _lp = new T.Vector3();
  const boxOf = (trigger) => {
    const tier = (S() && S().hullTier) || 1;
    return trigger ? PLAYER_BOX : ((BX.tiers && BX.tiers['Boat' + tier]) || PLAYER_BOX);   // Player root = trigger; BoatN = collider rắn
  };
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
  // khoảng cách bình phương từ điểm thế giới tới hộp thuyền (hệ cục bộ của thuyền; z đổi dấu như three.js)
  function d2Box(x, y, z, box) {
    _lp.set(x, y, z).applyMatrix4(_inv);
    const c = box.center, h = box.size;
    const dx = Math.max(Math.abs(_lp.x - c[0]) - h[0] / 2, 0), dy = Math.max(Math.abs(_lp.y - c[1]) - h[1] / 2, 0), dz = Math.max(Math.abs(_lp.z + c[2]) - h[2] / 2, 0);
    return dx * dx + dy * dy + dz * dz;
  }

  // ---------------------------------------------------------------- trạng thái chính
  const st = {
    B: null, clock: 0, started: false, detected: false, hasDetected: false, sensors: 0, hit: 0, cached: 0, phys: D.detect.spheres.map(() => false), range: 0, scale: P.attackTentacleMinScale, targetScale: P.attackTentacleMinScale,
    lookSpeed: P.attackTentacleIdleSpeed, tween: null, lastAggro: 0, lastCall: 0, ability: false, machine: false, armed: 1, attacks: 0, hits: 0, last: null, contacts: [0, 0, 0],
    cacheC: [0, 0, 0], q: null, qOrig: null, inRange: 0, forceFishing: false, log: []
  };
  const boat = () => { const s = S(); return s && s.boat; };
  const alive = () => root.DR.mode !== 'over';
  const fishing = () => st.forceFishing || root.DR.mode === 'harvest' || !!(root.DRSpots && DRSpots.cur);   // Player.IsFishing
  function snd(key, o) { try { return root.DRAudio && DRAudio.resolve(key) ? DRAudio.voice(key, o) : null; } catch (e) { return null; } }
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const playMonster = (role, vol) => {
    const keys = (D.audioKeys && D.audioKeys[role]) || [];
    if (!keys.length) return null;
    const A = D.audio;
    return snd(pick(keys), { vol: vol == null ? 1 : vol, pos: { x: D.origin[0], y: 0, z: D.origin[2] }, min: A.min, max: A.max });
  };
  const play2d = role => { const keys = (D.audioKeys && D.audioKeys[role]) || []; if (keys.length && root.DRAudio) { try { DRAudio.play(pick(keys), 1); } catch (e) { /* chưa có WebAudio */ } } };
  function near(range) { const b = boat(); return !!b && Math.hypot(b.x - D.origin[0], b.z - D.origin[2]) < range; }

  function setBanished(b) {   // SetBanished: tiếng + bool `banished`
    if (near(D.audio.max + 50)) playMonster(b ? 'submerge' : 'emerge', 1);
    for (const g of st.B.groups) g.params.banished = !!b;
    st.log.push(['banished', b, st.clock]);
  }
  const refreshBanish = () => setBanished(st.ability || st.machine);
  function setDetects(on) { for (const g of st.B.groups) g.params.detectsPlayer = !!on; }
  function onDetected() {
    if (!alive()) { /* GameMode.PASSIVE không có ở web */ }
    st.hasDetected = true;
    setDetects(true);
    if (st.clock > st.lastAggro + P.aggroDelaySec) { st.lastAggro = st.clock; if (near(D.audio.max + 50)) playMonster('aggroClips'); }
    st.tween = { from: st.lookSpeed, to: P.attackTentacleDetectedSpeed, t: 0, dur: P.attackTentacleSpeedTweenDuration };
    st.inRange = 0;
    root.DR.emit('sbDetected', true);
  }
  function onExitDetected() {
    st.hasDetected = false;
    setDetects(false);
    st.tween = null;
    st.lookSpeed = P.attackTentacleIdleSpeed;
    root.DR.emit('sbDetected', false);
  }
  function triggerAttack() {
    st.attacks++;
    for (const g of st.B.groups) if (g.id === 'mouth' || g.id === 'attack') g.params.attack = true;
    st.log.push(['attack', st.clock]);
  }
  function onEvent(g, fn) {
    if (g.id !== 'attack') return;   // SBMonsterAttackAnimationHelper nằm ở SBMonster_AttackTentacle
    if (fn === 'PlayPreAttackSFX') { if (near(D.audio.max + 50)) playMonster('preAttackClips'); }
    else if (fn === 'PlayAttackSFX') play2d('attackClips');
    else if (fn === 'OnAttackComplete') { st.armed++; st.log.push(['rearm', st.armed, st.clock]); }   // playerDamager.AddListeners()
  }

  // ---------------------------------------------------------------- phát hiện + va chạm
  function sensorFlags() {   // cầu nào đang chạm collider Player của thuyền
    const box = boxOf(true), out = D.detect.spheres.map(() => false);
    if (!boatInv()) return out;
    const o = D.origin, off = D.detect.offset;
    D.detect.spheres.forEach((sp, i) => {
      const x = o[0] + off[0] + sp.c[0], y = o[1] + off[1] + sp.c[1], z = o[2] + off[2] + sp.c[2];
      out[i] = d2Box(x, y, z, box) <= sp.r * sp.r;
    });
    return out;
  }
  // PlayerDetector.cs: collidersHit đếm mỗi lần một collider vào (OnTriggerEnter), báo khi từ 0 lên > 0 và cached == 0; ra thì trừ, báo khi về đúng 0 và cached > 0
  function detEnter() { st.hit++; if (st.hit > 0 && st.cached === 0) onDetected(); st.cached = st.hit; }
  function detExit() { st.hit--; if (st.hit === 0 && st.cached > 0) onExitDetected(); st.hit = Math.max(st.hit, 0); st.cached = st.hit; }
  function detReset() { st.hit = 0; st.cached = 0; onExitDetected(); }   // PlayerDetector.Reset (OnTeleportBegin)
  const _ax = new T.Vector3(), _pt = new T.Vector3();
  function capsuleWorld(i) {   // {p, axis, r, half} của collider i (trục x cục bộ), toạ độ thế giới
    const cd = D.colliders[i], nd = st.B.nodes[cd.node];
    nd.updateWorldMatrix(true, false);
    const e = nd.matrixWorld.elements;
    _ax.set(e[0], e[1], e[2]);
    const sc = _ax.length();
    _ax.normalize();
    const c = _c.set(cd.center[0], cd.center[1], cd.center[2]).applyMatrix4(nd.matrixWorld);
    return { p: [c.x, c.y, c.z], axis: [_ax.x, _ax.y, _ax.z], r: cd.radius * sc, half: Math.max(0, cd.height / 2 - cd.radius) * sc };
  }
  function contactOf(i, box) {
    const cw = capsuleWorld(i), N = 10;
    for (let k = 0; k <= N; k++) {
      const t = (k / N * 2 - 1) * cw.half;
      if (d2Box(cw.p[0] + cw.axis[0] * t, cw.p[1] + cw.axis[1] * t, cw.p[2] + cw.axis[2] * t, box) <= cw.r * cw.r) return true;
    }
    return false;
  }
  function onPlayerHit() {   // VariablePlayerDamager.OnPlayerHit x số người nghe còn đăng ký
    const calls = st.armed;
    if (calls <= 0) return;
    st.armed = 0;
    let slots = 0;
    for (let i = 0; i < calls; i++) {
      if (root.DRBoat && DRBoat.monsterHit) slots += DRBoat.monsterHit(D.damage.damagePoints, { requireOneHealth: D.damage.requireOneHealthToKill, source: 'sbcreature' }) || 0;
    }
    st.hits++;
    st.last = { clock: st.clock, calls, slots };
    st.log.push(['hit', calls, slots, st.clock]);
  }

  // ---------------------------------------------------------------- ClampedLookAtTarget
  const _m = new T.Matrix4(), _pos = new T.Vector3(), _up = new T.Vector3(0, 1, 0), _tq = new T.Quaternion(), _fw = new T.Vector3(), _to = new T.Vector3();
  function lookTick(dt, b) {
    const B = st.B, node = B.nodes[D.attackContainer];
    node.parent.updateWorldMatrix(true, false);
    node.updateWorldMatrix(false, false);
    _pos.setFromMatrixPosition(node.matrixWorld);
    if (!st.q) { st.q = new T.Quaternion(); st.qOrig = new T.Quaternion(); node.getWorldQuaternion(st.q); st.qOrig.copy(st.q); }
    if (st.hasDetected && b) {
      _m.lookAt(_pos, _c.set(b.x, 0, b.z), _up);    // three: −z hướng về mục tiêu = +z Unity phản chiếu
      _tq.setFromRotationMatrix(_m);
    } else _tq.copy(st.qOrig);
    const t = Math.min(1, Math.max(0, st.lookSpeed * dt));
    if (st.q.dot(_tq) < 0) { _tq.x = -_tq.x; _tq.y = -_tq.y; _tq.z = -_tq.z; _tq.w = -_tq.w; }
    st.q.x += (_tq.x - st.q.x) * t; st.q.y += (_tq.y - st.q.y) * t; st.q.z += (_tq.z - st.q.z) * t; st.q.w += (_tq.w - st.q.w) * t;
    st.q.normalize();
    // quaternion thế giới -> cục bộ của nút (cha có xoay đơn vị: SBMonster)
    const pq = new T.Quaternion();
    node.parent.getWorldQuaternion(pq);
    node.quaternion.copy(pq.invert().multiply(st.q));
    node.updateWorldMatrix(false, false);
  }
  function angleToBoat(b) {   // Vector3.Angle(lookAt.forward, thuyền − lookAt.position), độ
    const node = st.B.nodes[D.attackContainer];
    _pos.setFromMatrixPosition(node.matrixWorld);
    _fw.set(0, 0, -1).applyQuaternion(st.q);          // +z Unity = −z three
    _to.set(b.x - _pos.x, 0 - _pos.y, b.z - _pos.z);
    const l = _to.length() * _fw.length();
    return l < 1e-9 ? 0 : Math.acos(Math.max(-1, Math.min(1, _fw.dot(_to) / l))) * 180 / Math.PI;
  }

  // ---------------------------------------------------------------- vòng lặp
  function start() {   // Awake/Start của scene: Animator về Spawn, trạng thái Xua đuổi theo sổ
    const B = st.B;
    st.clock = 0; st.lastAggro = 0; st.lastCall = 0; st.hasDetected = false; st.sensors = 0; st.hit = 0; st.cached = 0; st.phys = D.detect.spheres.map(() => false); st.armed = 1; st.attacks = 0; st.hits = 0; st.last = null; st.tween = null;
    st.lookSpeed = P.attackTentacleIdleSpeed; st.scale = st.targetScale = P.attackTentacleMinScale; st.inRange = 0; st.cacheC = [0, 0, 0]; st.log.length = 0;
    st.q = null;
    for (const n of B.nodes) { /* tư thế nghỉ do hoạt ảnh đặt ngay khung đầu */ }
    for (const g of B.groups) { g.cur = { name: D.controller.default, t: 0 }; g.tr = null; g.params = { banished: false, detectsPlayer: false, attack: false, offset: 0 }; }
    B.nodes[D.attack].scale.setScalar(st.scale);
    const s = S();
    st.machine = !!(s && s.vars && s.time < (+s.vars[KEY_EXPIRY] || 0));
    st.ability = false;
    refreshBanish();
    st.started = true;
  }
  function tick(dt) {
    const Dr = root.DR, s = Dr && Dr.s;
    if (!s || !s.boat || !root.DRBoat) return;
    if (!st.B) { st.B = build(); if (!st.B) return; }
    if (!st.started) start();
    const b = s.boat;
    const dist = Math.hypot(b.x - D.origin[0], b.z - D.origin[2]);
    st.clock += dt;
    // --- cảm biến (PlayerDetector.cs)
    const phys = dist < DETECT_FAR ? sensorFlags() : D.detect.spheres.map(() => false), prevPhys = st.phys;
    for (let i = 0; i < phys.length; i++) if (phys[i] && !prevPhys[i]) detEnter();    // vào trước ra: đi từ cầu này sang cầu kia không nháy
    for (let i = 0; i < phys.length; i++) if (!phys[i] && prevPhys[i]) detExit();
    st.phys = phys; st.sensors = phys.filter(Boolean).length;
    // --- SBMonsterAnimationHelper.Update
    if (!(st.ability || st.machine)) {
      if (st.hasDetected && alive()) {
        const d = Math.hypot(D.origin[0] + 0 - b.x, D.origin[2] - b.z);     // XZ giữa SBMonster và thuyền
        st.targetScale = lerp(P.attackTentacleMinScale, P.attackTentacleMaxScale, invLerp(P.attackTentacleMinProximity, P.attackTentacleMaxProximity, d));
        if (st.q && angleToBoat(b) < P.attackTentacleAngleThreshold) {
          if (fishing()) st.inRange = P.attackTentacleInRangeDurationThreshold; else st.inRange += dt;
        } else st.inRange = 0;
        if (st.inRange >= P.attackTentacleInRangeDurationThreshold) { triggerAttack(); st.inRange = 0; }
        if (st.clock > st.lastAggro + P.aggroDelaySec) { st.lastAggro = st.clock; if (near(D.audio.max + 50)) playMonster('aggroClips'); }
      } else {
        st.targetScale = P.attackTentacleMinScale; st.inRange = 0;
        if (st.clock > st.lastCall + P.callDelaySec) { st.lastCall = st.clock; if (near(D.audio.max + 50)) playMonster('callClips'); }
      }
      st.scale = lerp(st.scale, st.targetScale, Math.min(1, dt));
      st.B.nodes[D.attack].scale.setScalar(st.scale);
    }
    // --- DOTween tốc độ lookAt (OutQuad)
    if (st.tween) {
      st.tween.t += dt;
      const k = Math.min(1, st.tween.t / st.tween.dur);
      st.lookSpeed = st.tween.from + (st.tween.to - st.tween.from) * outQuad(k);
      if (k >= 1) st.tween = null;
    }
    // --- Animator + tư thế (chỉ khi gần; xa thì chỉ chạy đồng hồ máy trạng thái)
    for (const g of st.B.groups) groupStep(g, dt, onEvent);
    const near_ = dist < ANIM_FAR;
    if (near_) {
      for (const g of st.B.groups) applyGroup(g, st.B);
      lookTick(dt, b);
    }
    if (st.B.splash && near_) {
      const sp = st.B.splash, on = !!st.B.active[sp.node];
      if (on && !sp.fx && root.DRParticles && DRParticles.has('SbAttackSplash')) sp.fx = DRParticles.spawn('SbAttackSplash', { parent: st.B.nodes[sp.parent] });
      else if (!on && sp.fx) { sp.fx.stop(); sp.fx = null; }
    }
    const vis = dist < RENDER_FAR;
    for (const r of st.B.rends) r.mesh.visible = vis && r.enabledNow !== false;
    if (vis) for (const r of st.B.rends) r.uni.uSbTime.value += dt;
    // --- va chạm xúc tu - thuyền (PlayerDetector.OnCollisionEnter của từng collider)
    if (dist < DETECT_FAR && near_) {
      const box = boxOf(false);
      if (boatInv()) {
        for (let i = 0; i < D.colliders.length; i++) {
          const c = contactOf(i, box) ? 1 : 0;
          st.contacts[i] = c;
          if (c && !st.cacheC[i]) onPlayerHit();   // 0 → 1: OnCollisionEnter
          st.cacheC[i] = c;
        }
      }
    } else { st.contacts = [0, 0, 0]; st.cacheC = [0, 0, 0]; }
  }

  // ---------------------------------------------------------------- dây vào game
  const Dr0 = root.DR;
  if (Dr0 && Dr0.on) {
    Dr0.on('banish', on => {
      st.ability = !!on;
      if (st.started) {
        refreshBanish();
        if (on && !st.machine) {   // TriggerThreatBanished(khoảng cách < 200 m): thành tựu của gốc
          const b = boat();
          Dr0.emit('threatBanished', { source: 'SBMonster', active: !!b && Math.hypot(b.x - D.origin[0], b.z - D.origin[2]) < P.banishAchievementDistanceThreshold });   // cùng dạng với js/angler.js
        }
      }
    });
    Dr0.on('banishMachine', on => { st.machine = !!on; if (st.started) refreshBanish(); });
    const resync = () => { st.started = false; };   // vào ván / tải sổ: scene mới (Start chạy lại)
    Dr0.on('load', resync);
    Dr0.on('newgame', resync);
    Dr0.on('manifestBegin', () => { if (st.B && st.started) detReset(); });   // GameEvents.OnTeleportBegin → playerDetector.Reset()
  }
  let last = 0, lastMode = null;
  function frame(now) {
    root.requestAnimationFrame(frame);
    const rdt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const Dr = root.DR;
    try {
      if (!Dr || !Dr.s || Dr.mode === 'title') { if (lastMode !== 'title') st.started = false; lastMode = 'title'; return; }
      lastMode = Dr.mode;
      tick(Dr.mode === 'cargo' || Dr.paused ? 0 : rdt * (Dr.timeScale != null ? Dr.timeScale : 1));
    } catch (e) { if (!frame.warned) { frame.warned = true; console.error('[sbcreature]', e); } }
  }
  if (root.requestAnimationFrame) root.requestAnimationFrame(frame);

  root.DRSbCreature = {
    debug: {
      step: dt => { const Dr = root.DR; if (Dr && Dr.s) tick(dt); },
      state() {
        const B = st.B;
        return {
          ready: !!B, started: st.started, clock: st.clock, detected: st.hasDetected, sensors: st.sensors, lookSpeed: st.lookSpeed, scale: st.scale, targetScale: st.targetScale,
          inRange: st.inRange, ability: st.ability, machine: st.machine, banished: !!(B && B.groups[0].params.banished), armed: st.armed, attacks: st.attacks, hits: st.hits, last: st.last,
          contacts: st.contacts.slice(), groups: B ? B.groups.map(g => ({ id: g.id, state: g.cur.name, t: +g.cur.t.toFixed(3), to: g.tr ? g.tr.to.name : null, params: Object.assign({}, g.params) })) : [],
          visible: B ? B.rends.filter(r => r.mesh.visible).length : 0, splash: !!(B && B.splash && B.splash.fx), angle: B && st.q && boat() ? angleToBoat(boat()) : null, log: st.log.slice(-20)
        };
      },
      colliders: () => (st.B ? D.colliders.map((c, i) => capsuleWorld(i)) : []),
      containerPos: () => { const n = st.B.nodes[D.attackContainer]; n.updateWorldMatrix(true, false); return _pos.setFromMatrixPosition(n.matrixWorld).toArray(); },
      boatObb: () => { const bob = root.DRBoat && DRBoat.bob; if (!bob) return null; bob.updateWorldMatrix(true, false); return bob.matrixWorld.toArray(); },
      set(k, v) { st[k] = v; },
      get st() { return st; }, get nodes() { return st.B && st.B.nodes; }, get rends() { return st.B && st.B.rends; },
      origin: D.origin, restart() { st.started = false; }
    }
  };
})(window);
