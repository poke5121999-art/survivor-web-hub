/*
 * Quạ của sự kiện thế giới Ravens (MONSTERS.md §2.6, RavenWorldEvent.cs). Dữ liệu: data/ravens.js (tools/ravens.py).
 *
 * Lịch bốc thăm: js/events.js (DREvents). Ravens: sanity ≤ 0,5, từ 0,25 tới 0,75 (ban ngày), nghỉ 1 ngày, Xua đuổi + còi (giữ 1,5 s hoặc 3 lần) dập tắt,
 * điều kiện khoang: ≥ 1 cá ≤ 3 ô (NumItemsOfSizeAndTypeCondition; do DREvents kiểm).
 *
 * RavenWorldEvent.cs: Activate: timeOfLastRavenAttack = Time.time, gắn con của thuyền (SetParent, đứng tại thuyền: playerSpawnOffset 0).
 *   Update (:41-89): chưa yêu cầu kết thúc và Time.time > lần trước + ravenAttackDelay (6 s) -> numAttacksMade++, trigger "attack"; đủ numAttacksToMake (3)
 *   thì RequestEventFinish (đợt thứ 3 vẫn phát nốt clip). Clip RavenAttack 3 s, sự kiện OnRavenAttackBegin 1,4167 s (tiếng monster-attack-small-1/2/3 ngẫu nhiên),
 *   OnRavenAttackComplete 1,5333 s: neo bến thì thôi; lấy con cá ĐẦU TIÊN (thứ tự quét) không dị biến, ≤ stealableFishSizeThreshold (3) ô, gỡ khỏi khoang
 *   (RemoveObjectFromGridData notify), báo notification.raven-event-fish-lost ("{0} lost to the birds."); không có cá thì RequestEventFinish.
 *   Mốc: 6 + 1,5333 = 7,533 s, 13,533 s, 19,533 s. RequestEventFinish: ngừng phát hạt xoáy, tiếng tắt dần finishDelaySec (5 s), rồi EventFinished + huỷ.
 *   [ĐỀ XUẤT] Bộ điều khiển (Empty --attack, exit 0,75, 0,25 s hoà--> RavenAttack) có thể trễ tới ~0,75 s sau trigger; bản web bắt đầu clip ngay lúc trigger
 *   (đúng mốc 7,53 / 13,53 / 19,53 của MONSTERS.md) và không hoà 0,25 s (tỉ lệ clip đã 0 -> 1 trong 0,5 s).
 *
 * Dựng hình: hạt SwirlingRavens + Impactfx của DRParticles ('Ravens', data/particles.js; Impactfx bị tắt tới 1,5333 s như công tắc m_IsActive của clip),
 * thân RavenRotater (ConstantlyRotateOnY 5 độ/s) > RavenParent (Euler y theo clip) > AttackingRaven (mesh RavenMesh, vị trí/Euler/tỉ lệ theo clip) mang 3 vệt
 * TrailRenderer: ShimmerTrail (0,3 s, rộng 1 m, trắng cộng sáng) và hai mắt đỏ (0,1 s, rộng 0,04 m, alpha 0,27 -> 0).
 *   [ĐỀ XUẤT] Vật liệu Raven_Mat (RavenParticle_Shader: FlapSpeed 13, FlapAmount 0,5) không có DXBC rã sẵn: cánh vỗ = đỉnh lệch y theo sin(t·13 + pha)·0,5·màu đỉnh R
 *   (R = 0 ở thân, 1 ở mút cánh); không chiếu sáng, đen theo texture. Vệt ShimmerTrail_Mat chỉ dùng mặt nạ FadedSphere (bỏ cuộn TilingShimmerTexture).
 *   [ĐỀ XUẤT] Tiếng lặp "Raven Swarm Loop" phát phẳng (2D) cho nghe rõ như bản gốc (AudioSource 500 m ở ngay trên thuyền); chưa có rung tay cầm (Ravens_StealSuccess).
 *
 *   DRRavens.debug → { spawn(), state(), finish() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR_RAVENS, EV = root.DR_WORLDEVENTS, LIB = root.DR_PARTICLES_LIB;
  if (!T || !D || !D.cfg) { root.DRRavens = null; return; }
  const ID = 'Ravens', C = D.cfg, CLIP = D.clip;
  const SFX = ['monster.generic.attackSmall', 'monster.generic.attackSmall2', 'monster.generic.attackSmall3'];   // attackSFX[3] của RavenWorldEvent
  const DEG = Math.PI / 180;
  let inst = null, mat = null, geo = null, trailMat = null, eyeMat = null, tex = null;

  // ---------------------------------------------------------------- đường cong Unity (Hermite theo từng thành phần), khoá [t, giá trị(3), inSlope(3), outSlope(3)]
  const _v = [0, 0, 0];
  function hermite(keys, t, out) {
    const n = 3, last = keys[keys.length - 1];
    let a = keys[0], b = keys[0];
    if (t >= last[0]) a = b = last;
    else if (t > keys[0][0]) for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { a = keys[i - 1]; b = keys[i]; break; }
    if (a === b) { for (let c = 0; c < n; c++) out[c] = a[1 + c]; return out; }
    const d = b[0] - a[0], u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
    for (let c = 0; c < n; c++) {
      const m0 = a[1 + 2 * n + c], m1 = b[1 + n + c];
      out[c] = (2 * u3 - 3 * u2 + 1) * a[1 + c] + (u3 - 2 * u2 + u) * m0 * d + (-2 * u3 + 3 * u2) * b[1 + c] + (u3 - u2) * m1 * d;
    }
    return out;
  }

  // ---------------------------------------------------------------- vật liệu
  function loadTex(name) {
    const e = LIB && LIB.textures && LIB.textures[name];
    if (!e) return null;
    const t = new T.TextureLoader().load(e.src);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding;
    return t;
  }
  function materials() {
    if (mat) return;
    const uni = { uT: { value: 0 } };
    mat = new T.MeshBasicMaterial({ map: loadTex('Raven_Texture') });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = uni.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; attribute vec4 aFlap;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += sin(uT * 13.0 + aFlap.g * 6.2831) * 0.5 * aFlap.r;');   // [ĐỀ XUẤT] FlapSpeed 13, FlapAmount 0,5
    };
    mat.customProgramCacheKey = () => 'drRaven';
    mat.userData.uT = uni.uT;
    const fs = loadTex('FadedSphere');
    trailMat = new T.MeshBasicMaterial({ map: fs, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });   // ShimmerTrail_Mat: blend SrcAlpha One
    eyeMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: T.DoubleSide });                                          // mắt: Sprites/Default
    const M = LIB && LIB.meshes && LIB.meshes.RavenMesh;
    if (M) {
      geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(M.pos), 3));
      geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(M.nrm), 3));
      geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(M.uv), 2));
      geo.setAttribute('aFlap', new T.BufferAttribute(new Float32Array(M.col), 4));
      geo.setIndex(M.index);
    }
  }

  // ---------------------------------------------------------------- vệt TrailRenderer: dải bám theo neo, dựng lại mỗi khung quay mặt về camera
  const MAXP = 80;
  function alphaAt(al, u) {
    if (u <= al[0][0]) return al[0][1];
    for (let i = 1; i < al.length; i++) if (u <= al[i][0]) { const a = al[i - 1], b = al[i], k = (u - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * k; }
    return al[al.length - 1][1];
  }
  function makeTrail(cfg, anchor, material) {
    const g = new T.BufferGeometry();
    const pos = new Float32Array(MAXP * 2 * 3), col = new Float32Array(MAXP * 2 * 4), uv = new Float32Array(MAXP * 2 * 2), idx = [];
    for (let i = 0; i < MAXP - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 4)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setIndex(idx); g.setDrawRange(0, 0);
    const mesh = new T.Mesh(g, material);
    mesh.frustumCulled = false; mesh.renderOrder = 5;
    const pts = [], tmp = new T.Vector3();
    const tr = {
      mesh, pts, emitting: true,
      step(dt, now) {
        for (const p of pts) p.a += dt;
        while (pts.length && pts[0].a > cfg.time) pts.shift();
        if (tr.emitting) {
          anchor.getWorldPosition(tmp);
          const l = pts[pts.length - 1];
          if (!l || l.p.distanceTo(tmp) >= cfg.minDist) pts.push({ p: tmp.clone(), a: 0 });
          else l.p.copy(tmp);
        }
        if (pts.length > MAXP) pts.splice(0, pts.length - MAXP);
      },
      build(cam) {
        const n = pts.length;
        if (n < 2) { g.setDrawRange(0, 0); return; }
        const camp = cam.position, a = g.attributes;
        for (let i = 0; i < n; i++) {
          const p = pts[n - 1 - i].p, q = pts[Math.max(0, n - 2 - i)].p, r = pts[Math.min(n - 1, n - i)].p;   // i = 0 là đầu vệt (mới nhất)
          const dx = r.x - q.x, dy = r.y - q.y, dz = r.z - q.z, vx = camp.x - p.x, vy = camp.y - p.y, vz = camp.z - p.z;
          let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
          const l = Math.hypot(sx, sy, sz) || 1, w = cfg.width * 0.5 / l;
          sx *= w; sy *= w; sz *= w;
          const u = i / (n - 1), al = alphaAt(cfg.alpha, u);
          a.position.setXYZ(i * 2, p.x + sx, p.y + sy, p.z + sz); a.position.setXYZ(i * 2 + 1, p.x - sx, p.y - sy, p.z - sz);
          a.color.setXYZW(i * 2, cfg.color[0], cfg.color[1], cfg.color[2], al); a.color.setXYZW(i * 2 + 1, cfg.color[0], cfg.color[1], cfg.color[2], al);
          a.uv.setXY(i * 2, u, 0); a.uv.setXY(i * 2 + 1, u, 1);
        }
        a.position.needsUpdate = a.color.needsUpdate = a.uv.needsUpdate = true;
        g.setDrawRange(0, (n - 1) * 6);
      }
    };
    return tr;
  }

  // ---------------------------------------------------------------- sự kiện
  const scene3 = () => { let o = root.DRBoat && DRBoat.root; while (o && o.parent) o = o.parent; return o; };
  function sampleClip(I, t) {
    const P = CLIP.parent.e, R = CLIP.raven;
    hermite(P, t, _v); I.parent.rotation.set(_v[0] * DEG, _v[1] * DEG, _v[2] * DEG, 'YXZ');
    hermite(R.p, t, _v); I.raven.position.set(_v[0], _v[1], _v[2]);
    hermite(R.e, t, _v); I.raven.rotation.set(_v[0] * DEG, _v[1] * DEG, _v[2] * DEG, 'YXZ');
    hermite(R.s, t, _v); I.raven.scale.set(_v[0], _v[1], _v[2]);
    I.raven.visible = _v[0] > 0.001;
  }

  // RavenWorldEvent.OnRavenAttackBegin
  function onBegin() {
    if (root.DRAudio) DRAudio.play(SFX[Math.floor(Math.random() * SFX.length)], 1, 1);
  }
  // RavenWorldEvent.OnRavenAttackComplete
  function onComplete(I) {
    // Impactfx bật ở 1,5333 s (m_IsActive của clip): nổ 6 hạt bụi
    const imp = I.fx && I.fx.systems && I.fx.systems[1];
    if (imp) { imp.time = 0; imp.playing = true; imp.emitting = true; for (const b of imp.bursts) b.k = 0; }
    const Dr = root.DR, S = Dr && Dr.s;
    if (!S || Dr.mode === 'dock' || S.dock) return;                          // Player.IsDocked: không cướp
    const G = root.DRGrid, inv = Dr.grid('INVENTORY');
    let chosen = null;
    if (inv && G) for (const it of inv.items) {                              // GetAllItemsOfType(GENERAL, FISH) theo thứ tự quét; chọn con đầu tiên đủ điều kiện
      const d = root.DR_ITEMS[it.id];
      if (!d || !(G.subOf(d) & G.SUB.FISH) || d.isAberration) continue;      // !IsAberrant()
      const size = d.dims ? d.dims.length : (d.w | 0) * (d.h | 0);          // SpatialItemData.dimensions.Count
      if (size <= C.stealSize) { chosen = it; break; }
    }
    if (!chosen) { requestFinish(); return; }
    G.remove(inv, chosen);                                                    // RemoveObjectFromGridData(chosenFish, notify: true)
    if (Dr.emit) Dr.emit('cargo', 'INVENTORY', null);
    I.stolen.push(chosen.id);
    const name = (root.DR_ITEMS[chosen.id] || {}).name || chosen.id;
    const fmt = (root.DR_STR && DR_STR['notification.raven-event-fish-lost']) || '{0} lost to the birds.';
    if (root.DRHud) DRHud.toast(fmt.replace('{0}', name), 3500);              // ShowNotificationWithItemName(ITEM_REMOVED, ...)
  }

  function requestFinish() {
    const I = inst;
    if (!I || I.finishRequested) return;
    I.finishRequested = true; I.finishT = 0;
    if (I.fx && I.fx.systems && I.fx.systems[0]) I.fx.systems[0].emitting = false;   // swirlingRavenParticleSystem.Stop(): ngừng phát, hạt đang bay chạy hết đời
    if (I.voice) I.voice.stop(C.finishDelay);                                        // audioSource.DOFade(0, finishDelaySec)
  }
  function destroy() {
    const I = inst;
    if (!I) return;
    inst = null;
    if (I.fx) I.fx.stop();
    if (I.voice) I.voice.stop(0.1);
    for (const k of ['group', 'sh', 'e0', 'e1']) { const o = k === 'group' ? I.group : I[k].mesh; if (o && o.parent) o.parent.remove(o); if (k !== 'group') o.geometry.dispose(); }
    I.handle.done = true;
  }

  function spawn() {
    if (inst) return null;
    const boat = root.DRBoat && DRBoat.root, sc = scene3();
    if (!boat || !sc) return null;
    materials();
    const group = new T.Group(); group.name = 'Ravens';            // Ravens.prefab gốc, con của Player
    boat.add(group);
    const rotater = new T.Group(), parent = new T.Group(), raven = new T.Mesh(geo, mat);
    raven.frustumCulled = false; raven.visible = false; raven.scale.set(0, 0, 0);
    raven.position.fromArray(D.rig.ravenRest);
    group.add(rotater); rotater.add(parent); parent.add(raven);
    const mk = (cfg, material) => { const a = new T.Object3D(); a.position.fromArray(cfg.pos); raven.add(a); const tr = makeTrail(cfg, a, material); tr.mesh.onBeforeRender = (r, s, cam) => tr.build(cam); sc.add(tr.mesh); return tr; };   // dải cần camera: dựng ngay trước khi vẽ
    const I = inst = { group, rotater, parent, raven, sh: mk(D.trails.shimmer, trailMat), e0: mk(D.trails.eye[0], eyeMat), e1: mk(D.trails.eye[1], eyeMat),
      t: 0, last: 0, attacks: 0, finishRequested: false, finishT: 0, clipT: -1, prevClipT: -1, stolen: [], fx: null, voice: null, begun: 0, completed: 0 };
    I.sh.mesh.name = 'RavenShimmerTrail';
    I.handle = { done: false, update, requestFinish, dispose: destroy };
    if (root.DRParticles) {
      I.fx = DRParticles.spawn('Ravens', { parent: group, loop: true });
      const imp = I.fx.systems && I.fx.systems[1];
      if (imp) { imp.playing = false; imp.emitting = false; }          // Impactfx tắt tới khi clip bật
    }
    if (root.DRAudio) I.voice = DRAudio.voice('monster.ravens', { loop: true, vol: 1 });
    return I.handle;
  }

  function update(dt) {
    const I = inst;
    if (!I) return;
    I.t += dt;
    if (mat && mat.userData.uT) mat.userData.uT.value = I.t;
    I.rotater.rotation.y += (D.rig.ccw ? 1 : -1) * D.rig.rotateSpeed * DEG * dt;    // ConstantlyRotateOnY (Unity +y = three −y)
    // RavenWorldEvent.Update
    if (!I.finishRequested && I.t > I.last + C.attackDelay) {
      I.attacks++; I.last = I.t; I.clipT = 0; I.prevClipT = -1;
      if (I.attacks >= C.numAttacks) requestFinish();
    }
    if (I.clipT >= 0) {
      I.clipT += dt;
      const t = Math.min(I.clipT, CLIP.len);
      for (const e of CLIP.events) if (I.prevClipT < e.t && t >= e.t) { if (e.fn === 'OnRavenAttackBegin') { I.begun++; onBegin(); } else { I.completed++; onComplete(I); } }
      I.prevClipT = t;
      if (I.clipT >= CLIP.len) { I.clipT = -1; I.raven.visible = false; I.raven.scale.set(0, 0, 0); } else sampleClip(I, t);
    }
    const on = I.clipT >= 0;
    I.sh.emitting = I.e0.emitting = I.e1.emitting = on && I.raven.visible;
    for (const tr of [I.sh, I.e0, I.e1]) tr.step(dt);
    if (I.finishRequested) { I.finishT += dt; if (I.finishT >= C.finishDelay) destroy(); }   // DelayedEventFinish
  }
  if (root.DREvents && EV && EV[ID]) DREvents.register(ID, { spawn() { return spawn(); } });

  root.DRRavens = {
    finish: destroy,
    debug: {
      spawn: () => { if (inst) return false; if (root.DREvents) DREvents.debug.force(ID); else spawn(); return !!inst; },
      requestFinish,
      state: () => inst && { t: inst.t, attacks: inst.attacks, begun: inst.begun, completed: inst.completed, finishRequested: inst.finishRequested, clipT: inst.clipT,
        stolen: inst.stolen.slice(), ravenVisible: inst.raven.visible, trailPts: inst.sh.pts.length, particles: inst.fx ? inst.fx.count : 0 },
      get alive() { return !!inst; }
    }
  };
})(window);
