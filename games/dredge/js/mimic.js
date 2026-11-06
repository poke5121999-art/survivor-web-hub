/*
 * Cua mimic (WreckMonster) — 4 con xac tau / may bay / da (WORLD-GAPS.md §4 va §6 don vi R6). Du lieu: data/mimic.js + art/vfx/mimic/crabs.bin (tools/mimic.py).
 *
 * WreckMonster.cs (nguyen van):
 *   OnEnable: lureParticles.Play(). SphereCollider trigger (r 2, tam (0, 0, 2.5) cuc bo) cua nut goc: OnTriggerEnter -> TryAttack (:50-57, :64-67):
 *   neu chua dang tan cong VA chua bi Banish thi lureParticles.Stop, animator.SetTrigger("Attack"), isCurrentlyAttacking = true.
 *   OnPlayerAbilityToggled(banish) -> isBanished = isActive, animator.SetBool("isBanished"). AnimationEvents.OnComplete (clip bao "AnimationComplete") -> isCurrentlyAttacking = false.
 * wreckmonster_animator.controller: Idle (wreckmonster_idle, 0,033 s) -> Attack [trigger Attack, isBanished = false, 0,1 s]; Attack (8,633 s) -> Retreat [isBanished, 0,25 s]
 *   hoac [ExitTime 1, 0 s]; Retreat (4 s) -> Idle [ExitTime 1, 0 s]. Idle la tu the nguy trang (mai cua giong xac tau), Attack la nho len, dap, quet, dap; Retreat lan xuong.
 * WreckMonsterAnimationEvents: tieng 3D (spatialBlend 1, 25..100 m): PlaySFXEmerge (t 0 cua Attack), PlaySFXSlamAttack (2,467 va 5,5), PlaySFXSwipeAttack (4),
 *   PlaySFXRetreat (t 0 cua Retreat).
 * Va cham (layer 7 CollidesWithPlayer; PlayerCollider.OnCollisionEnter -> ProcessHit (khong phai SafeCollider, khong phai quai) = 1 o hong neu qua 1,5 s ke tu cu truoc, DRBoat.processHit):
 *   - nut Collider: CapsuleCollider khong trigger (r 1,3 / h 6 hoac r 1,54 / h 5,17 hoac r 1,72 / h 4,91, truc x cuc bo) — mai cua luon la vat can
 *   - l_topclaw_jnt / r_topclaw_jnt: CapsuleCollider (r 0,7, h 2,8, tam (-1,16; -0,44; 0), truc x), m_Enabled 0 va chi duoc clip Attack bat trong cac cua so
 *     L [2,433-3,033], [5,267-5,833]; R [2,433-3,033], [4,0-5,267] (chinh la luc dap / quet).
 * [ĐỀ XUẤT] va cham: PhysX that duoc thay bang (a) da giac loi XZ cua capsule thân vs hinh chu nhat collider Player cua thuyen (DR_BOAT.colliderSize.player), day thuyen ra theo truc tach
 *   nho nhat, triet van toc huong vao (nhu js/ghostrocks.js); (b) mong vuot: 7 hinh cau doc doan thang tren truc capsule, khoang cach toi hop thuyen (3D, lat y 0,052..0,700) <= r,
 *   day thuyen ra khoi hinh cau. Hat bui / bot / nuoc ban va lureParticles khong co (xem tools/mimic.py "Bay").
 *
 *   DRMimic.update(dt) (bao DRBoat.update, khong sua js/boat.js)   DRMimic.ready
 *   DRMimic.debug -> { crabs(), state(i), trigger(i), step(dt), banish(on), setBoatNear(i, d) }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_MIMIC;
  if (!T || !D || !D.crabs) { root.DRMimic = null; return; }
  const REV = (document.currentScript && (document.currentScript.src.match(/[?&]v=([^&]+)/) || [])[1]) || '';
  const CL = D.clips, CT = D.ctrl;
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const S = () => root.DR.s;
  const HY0 = 0.052, HY1 = 0.700;                       // lat y cua collider Player (DR_BOAT.colliderSize.player: tam 0,3764 +- 0,324)
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const SHOW_R = 320, POSE_R = 200;                      // [ĐỀ XUẤT] chi ve / chay xuong trong ban kinh nay (cua chi 4 con, nam cach xa nhau)

  // ---------------------------------------------------------------- tieng: 2 clip moi cua tools/mimic.py (swipe, retreat); emerge / slam da co ('monster.wreck.*')
  const A = root.DR_AUDIO;
  if (A) for (const k of ['swipe', 'retreat']) { const a = D.audio[k]; if (a && !A['monster.wreck.' + k]) A['monster.wreck.' + k] = { src: a.src, loop: false, vol: 1, orig: a.orig, bus: 'sfx' }; }
  const SFX = { PlaySFXEmerge: 'monster.wreck.emerge', PlaySFXSlamAttack: 'monster.wreck.attack', PlaySFXSwipeAttack: 'monster.wreck.swipe', PlaySFXRetreat: 'monster.wreck.retreat' };
  function sfx(I, fn) {
    const key = SFX[fn];
    try { if (key && root.DRAudio && DRAudio.resolve(key)) DRAudio.voice(key, { vol: 1, pos: { x: I.x, y: 0.5, z: I.z }, min: D.audio.min, max: D.audio.max }); } catch (e) { /* tieng khong bat buoc */ }
  }

  // ---------------------------------------------------------------- giai ma: crabs.bin (deflate-raw) + clip
  const b64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const i16 = s => { const u = b64(s); return new Int16Array(u.buffer, 0, u.length >> 1); };
  for (const k in CL) {
    const c = CL[k]; c.byPath = {};
    for (const tr of c.tracks) {
      const o = {};
      if (tr.q) { const a = i16(tr.q), n = tr.qn; o.q = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) o.q[i] = a[i] / 32767; o.qn = n; }
      if (tr.p) { const a = i16(tr.p), n = tr.pn; o.p = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) { const j = i % 3; o.p[i] = tr.plo[j] + (a[i] + 32768) / 65535 * (tr.phi[j] - tr.plo[j]); } o.pn = n; }
      c.byPath[tr.b] = o;
    }
  }
  let bin = null, geos = null, mat = null, loading = null, built = false, scene = null, group = null;
  function loadBin() {
    if (loading) return loading;
    loading = fetch(D.bin.src + (REV ? '?v=' + REV : '')).then(r => r.arrayBuffer())
      .then(buf => new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
      .then(raw => { bin = new Uint8Array(raw); return bin; })
      .catch(e => { console.error('[mimic] crabs.bin', e); loading = null; return null; });
    return loading;
  }
  function geometry(M) {
    const n = M.n, o = M.off;
    const u16 = (a, c) => new Uint16Array(bin.buffer.slice(bin.byteOffset + a, bin.byteOffset + a + c * 2));
    const pq = u16(o, n * 3), uq = u16(o + n * 6, n * 2);
    let p = o + n * 10;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) { const a = i % 3; pos[i] = M.pmin[a] + pq[i] / 65535 * (M.pmax[a] - M.pmin[a]); }
    for (let i = 0; i < n * 2; i++) { const a = i % 2; uv[i] = M.umin[a] + uq[i] / 65535 * (M.umax[a] - M.umin[a]); }
    for (let v = 0; v < n; v++) {
      const k = bin[p++];
      for (let j = 0; j < k; j++) si[v * 4 + j] = bin[p++];
      let s = 0;
      for (let j = 0; j < k - 1; j++) { const w = bin[p++] / 255; sw[v * 4 + j] = w; s += w; }
      sw[v * 4 + k - 1] = Math.max(0, 1 - s);
    }
    const ix = u16(o + n * 10 + M.inf, M.tris * 3);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
    g.setIndex(new T.BufferAttribute(ix, 1));
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- vat lieu: Monster_Shader (nhu js/serpent.js; EmissionStrength 5, khoang 80 m)
  function material() {
    const L = new T.TextureLoader(), M = D.mat;
    const alb = L.load(D.tex.albedo), emi = L.load(D.tex.emission);
    alb.encoding = T.sRGBEncoding; emi.encoding = T.LinearEncoding;
    alb.wrapS = alb.wrapT = emi.wrapS = emi.wrapT = T.RepeatWrapping;
    const m = new T.MeshBasicMaterial({ map: alb });
    const um = { uEmis: { value: emi }, uEmisDist: { value: M.emissionEffectiveDistance }, uEmisK: { value: M.emissionStrength } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, um);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uEmis; uniform float uEmisDist; uniform float uEmisK;')
        .replace('#include <output_fragment>', `
  vec3 wpA = vDrFogW;
  vec3 litA = diffuseColor.rgb * (uDrSunCol + drEnvLights(wpA) + uDrAmb + (1.0 - drEnvMaskB(wpA.xz)) + vec3(uDrTintK, 0.0, 0.0));
  vec3 emA = clamp(drS2L(texture2D(uEmis, vUv).rgb) * (1.0 - clamp(vFogDepth / uEmisDist, 0.0, 1.0)), 0.0, 1.0) * uEmisK;
  gl_FragColor = vec4(litA, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emA, 1.0)).rgb;');
    };
    m.customProgramCacheKey = () => 'drMimicMonster';
    return m;
  }

  // ---------------------------------------------------------------- clip: mau tuyen tinh giua khung (15/giay) cua rang xuong theo duong dan
  const _q = new T.Quaternion(), _q2 = new T.Quaternion();
  function frame(c, t) { const f = Math.max(0, Math.min(c.n - 1, t * c.fps)), i = Math.min(c.n - 2, Math.floor(f)); return [Math.max(0, i), f - Math.max(0, i)]; }
  function sampleTrack(c, tr, t, outP, outQ, rest) {
    outP.set(rest.p[0], rest.p[1], rest.p[2]); outQ.set(rest.q[0], rest.q[1], rest.q[2], rest.q[3]);
    if (!tr) return;
    const [i, u] = frame(c, t);
    if (tr.p) {
      const n = tr.pn, p = tr.p;
      if (n === 1) outP.set(p[0], p[1], p[2]);
      else { const a = i * 3, b = Math.min(n - 1, i + 1) * 3; outP.set(p[a] + (p[b] - p[a]) * u, p[a + 1] + (p[b + 1] - p[a + 1]) * u, p[a + 2] + (p[b + 2] - p[a + 2]) * u); }
    }
    if (tr.q) {
      const n = tr.qn, q = tr.q;
      if (n === 1) outQ.set(q[0], q[1], q[2], q[3]);
      else { const a = i * 4, b = Math.min(n - 1, i + 1) * 4; _q.set(q[a], q[a + 1], q[a + 2], q[a + 3]); _q2.set(q[b], q[b + 1], q[b + 2], q[b + 3]); outQ.copy(_q).slerp(_q2, u); }
    }
  }
  const stepAt = (keys, t) => { let v = 0; for (const k of keys) { if (k[0] <= t) v = k[1]; else break; } return v; };

  // ---------------------------------------------------------------- Animator
  function newAnim() { return { cur: { s: 'Idle', t: 0, fresh: true }, prev: null, blend: 0, dur: 0, trigger: false, banished: false }; }
  function startTrans(A, to, dur) { A.prev = A.cur; A.cur = { s: to, t: 0, fresh: true }; A.blend = 0; A.dur = dur; }
  const clipOf = L => CL[CT.states[L.s]];
  function animStep(I, dt) {
    const A = I.anim, c = clipOf(A.cur);
    if (!A.prev) {                                                         // khong chuyen tiep dang chay: xet cac chuyen tiep cua trang thai hien tai
      if (A.cur.s === 'Idle') { if (A.trigger && !A.banished) { A.trigger = false; startTrans(A, 'Attack', CT.idleToAttack); } }
      else if (A.cur.s === 'Attack') { if (A.banished) startTrans(A, 'Retreat', CT.attackToRetreatBanish); else if (A.cur.t >= c.len * CT.exitTime) startTrans(A, 'Retreat', 0); }
      else if (A.cur.s === 'Retreat' && A.cur.t >= c.len * CT.exitTime) startTrans(A, 'Idle', 0);
    }
    const adv = L => {
      const cl = clipOf(L), t0 = L.t;
      L.t += dt;
      for (const e of cl.events) if (((e.t > t0) || (L.fresh && e.t === 0)) && e.t <= L.t) {
        if (e.fn === 'AnimationComplete') I.attacking = false;              // WreckMonster.OnAttackComplete
        else sfx(I, e.fn);
      }
      L.fresh = false;
    };
    adv(A.cur); if (A.prev) adv(A.prev);
    if (A.prev) { A.blend += dt; if (A.blend >= A.dur) A.prev = null; }
    if (A.cur.s === 'Idle' && !A.prev) A.cur.t = Math.min(A.cur.t, 1);       // giu nguyen tu the Idle
  }
  const weight = A => (A.prev ? (A.dur > 0 ? clamp01(A.blend / A.dur) : 1) : 1);
  const clipT = L => Math.min(L.t, clipOf(L).len);
  function claw(A, k) {
    const val = L => { const cl = clipOf(L); const w = cl.claw && cl.claw[k]; return w && w.length ? stepAt(w, clipT(L)) : 0; };
    const w = weight(A), v = A.prev ? val(A.prev) * (1 - w) + val(A.cur) * w : val(A.cur);
    return v > 0.5;
  }
  const _pa = new T.Vector3(), _pb = new T.Vector3(), _qa = new T.Quaternion(), _qb = new T.Quaternion();
  function pose(I) {
    const A = I.anim, V = I.V, w = weight(A), ca = clipOf(A.cur), cb = A.prev ? clipOf(A.prev) : null;
    for (const path in V.paths) {
      const bi = V.paths[path], rest = V.bones[bi], n = I.nodes[bi];
      const ta = ca.byPath[path], tb = cb && cb.byPath[path];
      if (!ta && !tb) continue;
      sampleTrack(ca, ta, clipT(A.cur), _pa, _qa, rest);
      if (cb) { sampleTrack(cb, tb, clipT(A.prev), _pb, _qb, rest); _pa.lerp(_pb, 1 - w); _qa.slerp(_qb, 1 - w); }
      n.position.copy(_pa); n.quaternion.copy(_qa);
    }
  }

  // ---------------------------------------------------------------- hinh hoc va cham
  const _w = new T.Vector3(), _w2 = new T.Vector3(), _e = new T.Euler();
  function boatBox(b) {                                   // yaw: mui = (-sin, -cos), phai = (cos, -sin) (xem js/tentacle.js)
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    return { cx: b.x + rx * PC.center[0] + fx * PC.center[2], cz: b.z + rz * PC.center[0] + fz * PC.center[2], fx, fz, rx, rz, hx: PC.size[0] / 2, hz: PC.size[2] / 2 };
  }
  function boatRect(B) { const o = []; for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.push([B.cx + B.rx * B.hx * sx + B.fx * B.hz * sz, B.cz + B.rz * B.hx * sx + B.fz * B.hz * sz]); return o; }
  function sat(A, B) {                                    // SAT hai da giac loi; {nx, nz, depth} day A ra khoi B hoac null (nhu js/ghostrocks.js)
    let best = null;
    for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      let nx = q[1] - p[1], nz = p[0] - q[0];
      const l = Math.hypot(nx, nz); if (l < 1e-9) continue;
      nx /= l; nz /= l;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = v[0] * nx + v[1] * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of B) { const d = v[0] * nx + v[1] * nz; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (!best || o < best.depth) { const s = (a0 + a1) / 2 >= (b0 + b1) / 2 ? 1 : -1; best = { nx: nx * s, nz: nz * s, depth: o }; }
    }
    return best;
  }
  // khoang cach (XZ + y) tu diem (x, y, z) toi hop collider Player; tra { d, nx, nz } (huong tu hop ra diem)
  function pointBox(B, x, y, z) {
    const dx = x - B.cx, dz = z - B.cz;
    const u = dx * B.rx + dz * B.rz, v = dx * B.fx + dz * B.fz;
    const cu = Math.max(-B.hx, Math.min(B.hx, u)), cv = Math.max(-B.hz, Math.min(B.hz, v)), cy = Math.max(HY0, Math.min(HY1, y));
    const ex = u - cu, ez = v - cv, ey = y - cy;
    const d = Math.hypot(ex, ey, ez);
    const wx = ex * B.rx + ez * B.fx, wz = ex * B.rz + ez * B.fz, hl = Math.hypot(wx, wz);
    return { d, nx: hl > 1e-6 ? wx / hl : 0, nz: hl > 1e-6 ? wz / hl : 0, inside: d === 0 };
  }
  // da giac loi XZ cua capsule truc x cuc bo: tam (p), quay q (ba nguyen three), r, h (gom hai nap)
  function capsulePoly(g, bodyP, bodyQ, r, h) {
    const half = Math.max(0, h / 2 - r), pts = [];
    for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + Math.PI * k / 6; pts.push([half + Math.cos(a) * r, Math.sin(a) * r]); }
    for (let k = 0; k <= 6; k++) { const a = Math.PI / 2 + Math.PI * k / 6; pts.push([-half + Math.cos(a) * r, Math.sin(a) * r]); }
    const out = [];
    for (const [ax, az] of pts) {   // (truc x, ngang z) cuc bo cua nut Collider -> the gioi
      _w.set(ax, 0, az).applyQuaternion(bodyQ).add(bodyP);
      g.localToWorld(_w);
      out.push([_w.x, _w.z]);
    }
    return out;
  }

  // ---------------------------------------------------------------- dung mot con
  function build() {
    const msh = material(); mat = msh;
    group = new T.Group(); group.name = 'MimicCrabs';
    const out = [];
    for (const d of D.crabs) {
      const V = D.variants[d.variant];
      geos = geos || {};
      const geo = geos[d.variant] || (geos[d.variant] = geometry(V.mesh));
      const g = new T.Group(); g.name = d.name;
      g.position.set(d.x, d.y, d.z); g.rotation.y = d.yaw; g.updateMatrixWorld(true);
      const nodes = V.bones.map((b, i) => {
        const o = V.skinBones.includes(i) ? new T.Bone() : new T.Object3D();
        o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s);
        return o;
      });
      V.bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].add(nodes[i]); else g.add(nodes[i]); });
      const mesh = new T.SkinnedMesh(geo, msh);
      mesh.frustumCulled = false; mesh.name = d.name + '_Crab';
      g.add(mesh);
      g.updateMatrixWorld(true);
      mesh.bind(new T.Skeleton(V.skinBones.map(i => nodes[i]), V.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
      group.add(g);
      const trig = new T.Vector3().fromArray(d.trigger.c); g.localToWorld(trig);
      const bp = new T.Vector3().fromArray(d.body.p), bq = new T.Quaternion().fromArray(d.body.q);
      const I = { d, V, g, nodes, mesh, x: d.x, z: d.z, anim: newAnim(), attacking: false, inside: false, touching: false, hits: 0, bodyHits: 0, clawHits: 0, clawTouch: 0,
        trig, body: capsulePoly(g, bp, bq, d.body.r, d.body.h), lastClaw: { l: false, r: false }, posed: false };
      out.push(I);
    }
    scene.add(group);
    return out;
  }
  let crabs = null;
  function ensure() {
    if (crabs || built) return !!crabs;
    if (!scene) {
      let o = root.DRBoat && DRBoat.root;
      while (o && o.parent) o = o.parent;
      if (o && o.isScene) scene = o;
    }
    if (!scene) return false;
    if (!bin) { loadBin().then(() => { }); return false; }
    built = true; crabs = build();
    if (banishPending) for (const I of crabs) I.anim.banished = true;
    return true;
  }

  // ---------------------------------------------------------------- vong lap
  function onBanish(on) { if (crabs) for (const I of crabs) I.anim.banished = !!on; else banishPending = !!on; }
  let banishPending = false;
  if (root.DR && root.DR.on) root.DR.on('banish', onBanish);

  function tryAttack(I) {                                 // WreckMonster.TryAttack (:50-57)
    if (!I.attacking && !I.anim.banished) { I.anim.trigger = true; I.attacking = true; return true; }
    return false;
  }
  function triggerTest(I, B) {                            // SphereCollider trigger r 2: OnTriggerEnter khi thuyen vao tu ngoai
    const r = I.d.trigger.r, p = pointBox(B, I.trig.x, I.trig.y, I.trig.z);
    const inside = p.d <= r;
    if (inside && !I.inside) tryAttack(I);
    I.inside = inside;
  }
  function pushOut(b, nx, nz, depth) {
    b.x += nx * (depth + 1e-3); b.z += nz * (depth + 1e-3);
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) { b.vx -= vn * nx * 1.2; b.vz -= vn * nz * 1.2; }
    b.w *= 0.5;
  }
  const hurt = () => (root.DRBoat && DRBoat.processHit ? DRBoat.processHit(false, false) : false);
  function bodyTest(I, b, B) {
    if (Math.abs(I.x - b.x) > 20 || Math.abs(I.z - b.z) > 20) { I.touching = false; return B; }
    const hit = sat(boatRect(B), I.body);
    if (!hit) { I.touching = false; return B; }
    pushOut(b, hit.nx, hit.nz, hit.depth);
    if (!I.touching) { I.touching = true; if (hurt()) I.bodyHits++; }          // OnCollisionEnter
    return boatBox(b);
  }
  const _cp = new T.Vector3(), _ca = new T.Vector3(), _cb = new T.Vector3(), _ce = new T.Vector3(), _cq = new T.Quaternion(), _cs = new T.Vector3();
  function clawTest(I, b, B) {
    for (const k of ['l', 'r']) {
      const on = claw(I.anim, k);
      I.lastClaw[k] = on;
      if (!on) continue;
      const C = D.claw[k], node = I.nodes[I.V.claws[k]];
      node.updateWorldMatrix(true, false);
      node.matrixWorld.decompose(_cp, _cq, _cs);
      const half = Math.max(0, C.h / 2 - C.r), sc = _cs.x;
      _ca.set(C.c[0] - half, C.c[1], C.c[2]).applyMatrix4(node.matrixWorld);
      _cb.set(C.c[0] + half, C.c[1], C.c[2]).applyMatrix4(node.matrixWorld);
      const rr = C.r * sc;
      let touched = false;
      for (let s = 0; s < 7; s++) {
        _ce.lerpVectors(_ca, _cb, s / 6);
        const p = pointBox(B, _ce.x, _ce.y, _ce.z);
        if (p.d <= rr) {
          touched = true;
          const dep = rr - p.d, nx = p.inside ? 0 : p.nx, nz = p.inside ? 0 : p.nz;
          if (nx || nz) { pushOut(b, nx, nz, dep); B = boatBox(b); }
        }
      }
      if (touched) { I.clawTouch++; if (hurt()) I.clawHits++; }                                       // PlayerCollider.ProcessHit (1,5 s mien)
    }
    return B;
  }
  function update(dt) {
    if (!ensure()) return;
    const Dr = root.DR, s = Dr && Dr.s;
    if (!s || !s.boat || Dr.mode === 'title') { if (group) group.visible = false; return; }
    group.visible = true;
    const b = s.boat;
    let B = boatBox(b);
    for (const I of crabs) {
      const far = Math.hypot(I.x - b.x, I.z - b.z);
      I.g.visible = far < SHOW_R;
      if (dt > 0) animStep(I, dt);
      if (far < POSE_R) { if (dt > 0 || !I.posed) { pose(I); I.posed = true; } } else I.posed = false;
      if (Dr.mode !== 'sail' && Dr.mode !== 'harvest') continue;
      if (far > 60) continue;
      I.g.updateMatrixWorld(true);
      triggerTest(I, B);
      B = bodyTest(I, b, B);
      if (I.anim.cur.s === 'Attack' || I.anim.prev) B = clawTest(I, b, B);
    }
  }
  // nhip khung: boc DRBoat.update (main.js goi DRBoat.update(dt) moi khung, dt = 0 khi tam dung), khong sua js/boat.js
  if (root.DRBoat && typeof DRBoat.update === 'function' && !DRBoat.update._mimic) {
    const orig = DRBoat.update;
    const wrapped = function (dt, env) { const r = orig.apply(this, arguments); try { update(dt); } catch (e) { console.error('[mimic]', e); } return r; };
    wrapped._mimic = true;
    DRBoat.update = wrapped;
  }

  root.DRMimic = {
    update,
    get ready() { return !!crabs; },
    debug: {
      crabs: () => (crabs || []).map((I, i) => ({ i, name: I.d.name, variant: I.d.variant, x: I.x, z: I.z, state: I.anim.cur.s, prev: I.anim.prev && I.anim.prev.s, t: +I.anim.cur.t.toFixed(3),
        attacking: I.attacking, banished: I.anim.banished, inside: I.inside, hits: I.hits, bodyHits: I.bodyHits, clawHits: I.clawHits, clawTouch: I.clawTouch, claws: Object.assign({}, I.lastClaw) })),
      state: i => { const I = crabs && crabs[i]; return I && { state: I.anim.cur.s, t: I.anim.cur.t, attacking: I.attacking, banished: I.anim.banished, trigger: I.anim.trigger, blend: I.anim.prev ? I.anim.blend : null }; },
      step(dt, n) { if (!crabs) return; for (let k = 0; k < (n || 1); k++) for (const I of crabs) animStep(I, dt); },
      trigger: i => crabs && tryAttack(crabs[i]),
      banish: on => onBanish(on),
      claws: () => (crabs || []).map(I => ({ l: claw(I.anim, 'l'), r: claw(I.anim, 'r') })),
      setT: (i, t) => { const I = crabs && crabs[i]; if (I) { I.anim.cur.t = t; I.anim.cur.fresh = false; I.anim.prev = null; } },
      trig: i => { const I = crabs && crabs[i]; return I && { x: I.trig.x, y: I.trig.y, z: I.trig.z, r: I.d.trigger.r }; },
      clawWorld: (i, k) => { const I = crabs && crabs[i], C = D.claw[k]; if (!I) return null; pose(I); I.g.updateMatrixWorld(true); const n = I.nodes[I.V.claws[k]]; n.updateWorldMatrix(true, false); const v = new T.Vector3().fromArray(C.c).applyMatrix4(n.matrixWorld); return { x: v.x, y: v.y, z: v.z }; },
      body: i => crabs && crabs[i].body,
      group: () => group,
      hurt: () => crabs ? crabs.map(I => ({ body: I.bodyHits, claw: I.clawHits, clawTouch: I.clawTouch })) : []
    }
  };
})(window);
