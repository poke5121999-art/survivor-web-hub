/*
 * Điểm nổ mìn (ExplosivePOI, W4 — WORLD-GAPS.md §6): 24 mảng đá / tường đổ / cây / cầu chặn lối tắt. Dữ liệu data/explosives.js do tools/explosives.py bóc từ Game.unity.
 *
 * Gốc (ExplosivePOI.cs:22-58, DredgeDialogueRunner.cs:243-248, Destroyable.controller + Explode_0.anim):
 *   - ExplosivePOI là ConversationPOI: F chạy node Yarn (Explosives_Root: có `explosives` trong khoang → Explosives_Choice; chưa từng nổ điểm đặc biệt thì
 *     Explosives_Unknown; hermit-quest chạy Explosives_Special). OnConversationStarted đặt DialogueRunner.CurrentExplosivePOI, OnConversationCompleted bỏ.
 *   - lệnh Yarn <<DetonateExplosives>> gọi CurrentExplosivePOI.Detonate(): rung (CinemachineImpulseSource), trigger "explode" của Animator, ghi
 *     SaveData biến bool "<id>-detonated" = true. Animator: trạng thái Explode bật nhánh Effects (hạt + tiếng), TẮT nhánh Objects (vật cảnh + collider) ngay,
 *     rồi DestroySelf sau 5 s. RefreshStatus: biến "<id>-detonated" đã bật thì tắt cả điểm (nên mất cả dấu lấp lánh InspectionGlint).
 *   - Biến lưu trong sổ nên nạp lại ván là mảng đá vẫn mất; ván mới thì đá trở lại.
 *
 * Bản web:
 *   - vật cảnh là các instance trong instances.bin (tools/world.py đã gỡ static batching): `inst` của mỗi điểm = chỉ số các instance cần ẩn → DRWorld.hideInstances;
 *   - va chạm là landmask.png: collider của mảng đá đã được vẽ chết vào mặt nạ đất (đo: cả 24 dấu chân đều là đất 100%); `fp` = đúng những ô mà
 *     tools/world.py vẽ cho các collider của điểm → DRWorld.carveLand xoá chúng khỏi trường khoảng cách (thuyền đi qua được, bọt nước tính lại);
 *   - đồng bộ theo biến lưu: mỗi 0,25 s và khi 'load' / 'newgame' so DR.s.vars["<id>-detonated"] với trạng thái đã áp dụng (ván mới trả lại đá).
 * [ĐỀ XUẤT] hiệu ứng nổ: bản gốc dùng prefab RockExplosionEffect (Splash, Flash, WaterSplash, RockFall, RockDebris) chưa có trong data/particles.js; ở đây là
 *   mảnh đá / gỗ rơi theo trọng lực + cột nước + bụi + loé sáng, dựng bằng three.js, sống 5 s như clip Explode. Tiếng: Effects có AudioSource (min 10 / max 50 m,
 *   volume 0,5) nhưng không gán clip trong scene; dùng Dynamite - Rock Wall cho đá / tường, Dynamite - Wood Wall cho cây / cầu (đoán theo tên clip).
 * [ĐỀ XUẤT] NavMeshObstacle (carve) của mảng đá: đường đi của quái (js/nav.js) lập một lần từ navmask + landmask nên chưa mở theo; không ảnh hưởng thuyền.
 *
 *   DRExplosives.list (24)  .byId  .isDetonated(id)  .detonate(id)  .sync()  .current()  .applied()  .nearest(x, z)  .debug()
 * Mối nối đã dùng: DRPoi.extra (thêm 3 dòng vào js/poi.js), DRWorld.carveLand / hideInstances (thêm vào js/world.js), DRYarn.command, DRParticles.setGate.
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_EXPLOSIVES;
  if (!D || !D.length) { root.DRExplosives = null; return; }
  const SUFFIX = '-detonated';                       // ExplosivePOI.SAVE_DATA_SUFFIX
  const LIFE = 5;                                    // Explode_0.anim: DestroySelf tại giây 5
  const byId = {};
  for (const e of D) byId[e.id] = e;
  const vars = () => (root.DR && DR.s && DR.s.vars) || null;
  const isDet = id => { const v = vars(); return !!(v && v[id + SUFFIX]); };
  const applied = new Set();                         // điểm đã xoá khỏi thế giới (đất + vật cảnh + dấu lấp lánh)
  let current = null;                                // DialogueRunner.CurrentExplosivePOI
  let scene = null, last = 0, acc = 0;
  const fx = [];

  // ---------------------------------------------------------------- dấu lấp lánh (InspectionGlint) của scene hạt
  const GATE = e => 'explosive:' + e.id;
  function tagGlints() {
    const rows = root.DR_PARTICLES_SCENE || [];
    for (const e of D) for (const r of rows) if (r.path === e.glint || (r.path || '').endsWith(':' + e.glint)) r.gate = GATE(e);
  }
  const gate = (e, on) => { if (root.DRParticles && DRParticles.setGate) DRParticles.setGate(GATE(e), on); };

  // ---------------------------------------------------------------- đồng bộ thế giới theo biến lưu
  function sync() {
    const W = root.DRWorld;
    if (!W || !W.carveLand || !W.landBox || !root.DR || !DR.s) return;
    for (const e of D) {
      const want = isDet(e.id), has = applied.has(e.id);
      if (want === has) continue;
      W.carveLand(e.fp, !want);                      // !want: ván mới → trả đất lại
      W.hideInstances(e.inst, !want);
      gate(e, !want);
      if (want) applied.add(e.id); else applied.delete(e.id);
    }
  }

  // ---------------------------------------------------------------- Detonate
  const dist = (e, x, z) => Math.hypot(e.x - x, e.z - z);
  function nearest(x, z, onlyLive) {
    let best = null, bd = 1e9;
    for (const e of D) {
      if (onlyLive && isDet(e.id)) continue;
      const d = dist(e, x, z) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best && { e: best, d: bd };
  }
  // CurrentExplosivePOI; không có (node chạy thẳng không qua F) thì lấy điểm còn nguyên gần thuyền nhất trong 12 m
  function target() {
    if (current && !isDet(current.id)) return current;
    const b = root.DR && DR.s && DR.s.boat;
    const n = b && nearest(b.x, b.z, true);
    return n && n.d < 12 ? n.e : null;
  }
  function detonate(e) {
    if (typeof e === 'string') e = byId[e];
    if (!e || isDet(e.id)) return false;
    const v = vars(); if (!v) return false;
    v[e.id + SUFFIX] = true;                         // SaveData.SetBoolVariable
    sync();                                          // trạng thái Explode: Objects tắt ngay
    boom(e);                                         // Effects bật
    if (root.DR && DR.emit) DR.emit('explosiveDetonated', e.id);
    return true;
  }

  // ---------------------------------------------------------------- hiệu ứng nổ [ĐỀ XUẤT]
  let chunkGeo = null, blobTex = null;
  function blob() {
    if (blobTex) return blobTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    blobTex = new T.CanvasTexture(c);
    return blobTex;
  }
  function boom(e) {
    scene = scene || (root.DR_DEBUG && DR_DEBUG.scene);
    if (!T || !scene) return;
    chunkGeo = chunkGeo || new T.IcosahedronGeometry(0.32, 0);
    const wood = e.kind === 'wood', pts = e.fx.length ? e.fx : [[e.x, 0, e.z]];
    const group = new T.Group(); group.name = 'explosion ' + e.id;
    const N = (wood ? 14 : 22) * pts.length;
    const mat = new T.MeshPhongMaterial({ color: wood ? 0x3a2b1a : 0x232225, specular: 0x000000, shininess: 0, flatShading: true });
    const chunks = new T.InstancedMesh(chunkGeo, mat, N);
    chunks.frustumCulled = false;
    const st = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i % pts.length], a = Math.random() * 6.283, sp = 2 + Math.random() * 6;
      st.push({ x: p[0] + (Math.random() - 0.5) * 2, y: 0.3 + Math.random() * 1.2, z: p[2] + (Math.random() - 0.5) * 2,
        vx: Math.cos(a) * sp, vy: 6 + Math.random() * 9, vz: Math.sin(a) * sp, s: 0.3 + Math.random() * (wood ? 0.6 : 0.8),
        rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 9, wy: (Math.random() - 0.5) * 9 });
    }
    group.add(chunks);
    const sprites = [];
    const addSprite = (p, color, size0, size1, life, vy, additive, delay) => {
      const m = new T.SpriteMaterial({ map: blob(), color, transparent: true, depthWrite: false, opacity: 0, blending: additive ? T.AdditiveBlending : T.NormalBlending });
      const sp = new T.Sprite(m); sp.position.set(p[0], p[1], p[2]); sp.scale.setScalar(size0);
      group.add(sp); sprites.push({ sp, m, size0, size1, life, vy, delay: delay || 0, t: 0, x: p[0], y: p[1], z: p[2] });
    };
    pts.forEach((p, k) => {
      addSprite([p[0], 0.5, p[2]], 0xffd9a0, 4, 16, 0.35, 0, true, 0);                                   // Flash
      for (let i = 0; i < 4; i++) addSprite([p[0] + (Math.random() - 0.5) * 3, 0.2, p[2] + (Math.random() - 0.5) * 3], 0xeaf3f6, 2, 6 + Math.random() * 3, 1.8 + Math.random() * 0.8, 5 + Math.random() * 3, false, 0.05 * i);   // cột nước
      for (let i = 0; i < 3; i++) addSprite([p[0] + (Math.random() - 0.5) * 4, 0.8, p[2] + (Math.random() - 0.5) * 4], wood ? 0x7a6244 : 0x77747a, 3, 9 + Math.random() * 4, 3.5 + Math.random(), 1 + Math.random(), false, 0.1 * i);   // bụi
    });
    scene.add(group);
    fx.push({ group, chunks, st, sprites, t: 0, mat });
    if (root.DRBoat) { const b = DR.s.boat, k = Math.max(0, 1 - Math.hypot(b.x - e.x, b.z - e.z) / 60); DRBoat.shake = Math.max(DRBoat.shake || 0, 0.6 * k); }   // CinemachineImpulseSource
    const A = root.DRAudio;
    try { if (A && A.resolve(e.sfx)) A.play(e.sfx, 1, 1, { pos: { x: e.x, y: 0, z: e.z }, min: 10, max: 50 }); } catch (err) { /* tiếng không bắt buộc */ }
  }
  const _m = T && new T.Matrix4(), _q = T && new T.Quaternion(), _e = T && new T.Euler(), _p = T && new T.Vector3(), _s = T && new T.Vector3();
  function stepFx(dt) {
    for (let n = fx.length - 1; n >= 0; n--) {
      const f = fx[n]; f.t += dt;
      if (f.t >= LIFE) { scene.remove(f.group); f.chunks.dispose(); f.mat.dispose(); for (const s of f.sprites) s.m.dispose(); fx.splice(n, 1); continue; }
      f.st.forEach((c, i) => {
        c.vy -= 9.81 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wx * dt; c.ry += c.wy * dt;
        const gone = c.y < -0.6;                      // chìm dưới mặt nước
        _p.set(c.x, c.y, c.z); _e.set(c.rx, c.ry, 0); _q.setFromEuler(_e); _s.setScalar(gone ? 0 : c.s);
        f.chunks.setMatrixAt(i, _m.compose(_p, _q, _s));
      });
      f.chunks.instanceMatrix.needsUpdate = true;
      for (const s of f.sprites) {
        const t = f.t - s.delay;
        if (t < 0) { s.m.opacity = 0; continue; }
        const u = Math.min(1, t / s.life);
        s.sp.scale.setScalar(s.size0 + (s.size1 - s.size0) * Math.sqrt(u));
        s.sp.position.y = s.y + s.vy * t - 2.5 * t * t * 0.5;
        s.m.opacity = u >= 1 ? 0 : 0.85 * (1 - u) * Math.min(1, t * 12);
      }
    }
  }

  // ---------------------------------------------------------------- vòng lặp
  function frame(now) {
    root.requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    if (current && root.DRDialogue && !DRDialogue.isOpen() && !(root.DRYarn && DRYarn.current && DRYarn.current())) current = null;   // OnConversationCompleted
    acc += dt;
    if (acc >= 0.25) { acc = 0; sync(); }
    if (fx.length) stepFx(dt);
  }

  function init() {
    tagGlints();
    if (root.DRPoi && DRPoi.extra) {
      for (const e of D) {
        DRPoi.extra.push({ id: e.id, x: e.x, z: e.z, r: e.r, node: e.node, once: e.once, needs: e.needs,
          // ConversationPOI.RefreshStatus: ẩn khi "<id>-detonated" (poi.js gọi hideAfter.some(visited); ở đây không cần tên node)
          hideAfter: { some: () => isDet(e.id) || e.hideAfter.some(n => root.DRYarn && DRYarn.visited(n)) }, explosive: true });
      }
    }
    if (root.DRYarn && DRYarn.command) {
      DRYarn.command('DetonateExplosives', () => { const e = target(); if (e) detonate(e); else console.info('[explosives] DetonateExplosives: không có điểm nổ gần thuyền'); });
    }
    if (root.DR && DR.on) {
      DR.on('poiInspect', id => { if (byId[id]) current = byId[id]; });         // OnConversationStarted
      DR.on('load', sync); DR.on('newgame', sync);
    }
    root.requestAnimationFrame(frame);
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRExplosives = {
    list: D, byId, isDetonated: isDet, detonate, sync, nearest, current: () => current && current.id, applied: () => [...applied],
    debug: () => ({ detonated: D.filter(e => isDet(e.id)).map(e => e.id), applied: [...applied], current: current && current.id, fx: fx.length })
  };
})(window);
