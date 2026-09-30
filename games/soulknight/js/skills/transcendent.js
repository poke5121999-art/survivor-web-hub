// Kỹ năng Kẻ Vượt Ranh Giới (c17): dimension_jumping, blackhole_refract_blackhole_burst. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Nguồn số: config/skills 8.6, ctrlFields của C18Controller (dump.cs gọi là C18Controller vì c17 dùng lớp C{NN+1}), mã đọc bằng
// tools/sk_method.py (BuffDelayDead, C18Crack*, C18Skill2Rift*, C18Controller.*) và cây collider của prefab trong common.ab.
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world, U = SK.PPU, I = SK.input;
  const C = (f, d) => K.CTRL('transcendent', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const isMe = p => p.hero === 'transcendent';
  const has = (p, id) => !!(p.h && p.h.skill && p.h.skill.id === id);
  const args = (p, id) => String(K.cfg(p, id).args || '').split(';').map(Number);
  const num = (G, p, v, color) => SK.num(G, p.x, p.y - 26, v, color);
  const isBoss = e => !!e.bossKey;   // e.boss của port là chủ của quái con, cờ trùm nằm ở bossKey
  const chapter = G => Number(G.stage && G.stage.level) || 1;   // [ĐO LevelSelector.GetBigLevel] chương của màn đang chơi

  // ================================================================ Bước Nhảy Không Gian
  // [ĐO config] cd 8, dur 3, args 3. [ĐO C18Controller ctrlFields] khe nứt sống crackLifeTime 2,5 s, tối đa 3, mỗi createCrackCd 1,5 s
  // ở bán kính 3–6 ô, khe đầu tiên ngay khi bấm (RoleSkill đặt _createCrackTimer = 0). Người chạm khe (BoxCollider2D 1,4 × 3,6 của
  // prefab transcendent_0_crack): +recoverEnergy 5 năng lượng [OnTriggerCrack], kéo dài addSkillTime 0,85 s tối đa maxAddSkillTIme
  // lần, tăng tốc CỘNG THÊM vào speed_rate (+0,75 khi đang kỹ năng, +0,3 ngoài kỹ năng) giữ 0,3 s rồi giảm tuyến tính 0,3 s
  // [IEAddMoveSpeed, SpeedFadeTime]; trong kỹ năng speed_rate cộng addMoveSpeedSkill 0,45 [RoleSkill]. Sóng xung kích là
  // CircleCollider2D bán kính 4 × nút explode 0,8 = 3,2 ô [C18CrackExplode]: quái chưa dính thì bị đánh dấu, quái đã dính bị rút 1 s.
  // Mỗi lần chạm khe mọi quái đang có đếm ngược cũng bị rút 1 s [BuffDelayDead.OnTriggerCrackAct → ReduceBuffRestTime: buffRestTime −1].
  // Đánh dấu = quái chạm vòng tròn bán kính 1,05 quanh người [effect_transcendent_skin0/b]. Hết đếm ngược [BuffDelayDead.BuffEnd]:
  // quái thường nhận 99999 (0x1869F); trùm nhận 80 + 10 × chương [ctor: _hurtBossDmg 0x50, _additionalDamagePerChapter 0xA] rồi thêm
  // đúng bằng số đòn đã đếm [AddHurtBoss]. Đếm đòn [C18Controller.OnPlayerBulletHitEnemyEvent]: mỗi đòn của người chơi lên trùm,
  // kể cả khi chưa bị đánh dấu, chỉ khi đang cầm kỹ năng này. Quái đang bị đánh dấu chết thì người chơi được tăng tốc như chạm khe
  // [BuffDelayDead.OnEnemyDead → Skill0SpeedUp]. Độ mờ 0,4 [GetSkinShuttleAlpha, skin thường].
  // Không có trong port: nâng cấp kỹ năng (delayDeadTimeUpgrade 5, crackSizeAddExUpgrade 0,25, SkillDuration + cấp/3, và
  // HandCut đặc biệt addHandCutDamage 6 / addHandCutScale 1,5 mỗi 5 nhát tay: C18Controller.IsExHandCut chỉ đúng khi
  // HasSkillStrengthen; port chưa có đòn tay HandCut và chưa có nâng cấp kỹ năng).
  const DJ = {
    delay: C('delayDeadTime', 8), life: C('crackLifeTime', 2.5), max: C('maxCrackCount', 3), gap: C('createCrackCd', 1.5),
    rmin: (C('radiusRange', [3, 6])[0]) * T, rmax: (C('radiusRange', [3, 6])[1]) * T,
    addT: C('addSkillTime', 0.85), maxAdd: C('maxAddSkillTIme', 4), energy: C('recoverEnergy', 5),
    skillAdd: C('addMoveSpeedSkill', 0.45), skillSpeed: 1 + C('addMoveSpeedSkill', 0.45),
    boostAdd: C('addMoveSpeedRate', 0.75), boostOutAdd: C('addMoveSpeedRateNoSkill', 0.3), boostT: C('addMoveSpeedTime', 0.3), fade: 0.3,
    wave: 3.2 * T, box: [1.4 * T, 3.6 * T], cut: 1, touch: 1.05 * T,
    bossBase: 80, bossPerChapter: 10, kill: 99999, alpha: 0.4
  };

  function mark(G, e) {
    if (!K.alive(e) || e._mark) return false;
    e._mark = { t: DJ.delay };
    return true;
  }
  const cutMark = e => { if (e._mark) e._mark.t = Math.max(0, e._mark.t - DJ.cut); };
  function markProp(G) {
    if (G._djProp && G.props.indexOf(G._djProp) >= 0) return;
    G._djProp = { x: 0, y: 1e9 + 2, update() {},
      draw(ctx, G2) {
        for (const e of G2.enemies) {
          if (!K.alive(e)) continue;
          const top = K.enemyTop(e) - 8;
          if (e._mark) SK.text(ctx, String(Math.ceil(e._mark.t)), e.x, top, 8, '#ff6b6b', 'center', '#000');
          if (isBoss(e) && e._hits) SK.text(ctx, '×' + e._hits, e.x, top - 9, 7, '#ffe06a', 'center', '#000');
        }
      } };
    G.props.push(G._djProp);
  }

  // Khe nứt: tại chỗ trống cách người 3–6 ô, người chơi chạm vào thì nổ sóng xung kích.
  function spawnCrack(G, x, y) {
    const c = { x, y, life: DJ.life, gone: false };
    c.h = fx(G, 'transcendent_0_crack', x, y, {});
    (G._cracks = G._cracks || []).push(c);
    return c;
  }
  function freeSpot(G, p) {
    for (let i = 0; i < 12; i++) {
      const a = SK.rand() * Math.PI * 2, r = DJ.rmin + SK.rand() * (DJ.rmax - DJ.rmin), x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!W.boxHits(G.map, x - 6, y - 6, x + 6, y)) return [x, y];
    }
    return null;
  }
  // Tăng tốc cộng vào speed_rate: tổng = 1 + (addMoveSpeedSkill nếu đang kỹ năng) + phần cộng thêm đang giảm dần.
  function boost(p) { p._djBoost = { t: 0, add: p._dj ? DJ.boostAdd : DJ.boostOutAdd }; }
  function speed(p) {
    const base = p._dj ? DJ.skillAdd : 0, b = p._djBoost;
    const add = b ? b.add * (b.t <= DJ.boostT ? 1 : Math.max(0, 1 - (b.t - DJ.boostT) / DJ.fade)) : 0;
    K.setMul(p, 'moveMul', 'dj', 1 + base);
    K.setMul(p, 'moveMul', 'djb', (1 + base + add) / (1 + base));
    return 1 + base + add;
  }
  function trigger(G, p, c) {
    c.gone = true; K.stopFx(c.h);
    fx(G, 'transcendent_cross_effect', c.x, c.y - 6, {});
    p.energy = Math.min(p.energyMax, p.energy + DJ.energy);
    num(G, p, '+' + DJ.energy, '#7fd3ff');
    for (const e of G.enemies) cutMark(e);
    for (const e of K.inRadius(G, c.x, c.y - 6, DJ.wave)) { if (!mark(G, e)) cutMark(e); }
    if (p.skillT > 0 && p._dj && p._dj.added < DJ.maxAdd) { p._dj.added++; p.skillT += DJ.addT; }
    boost(p);
    G.shake = Math.max(G.shake, 1);
    markProp(G);
  }
  function resolve(G, p, e) {
    fx(G, 'transcendent_cross_effect', e.x, e.y - 8, {});
    const n = e._hits || 0;
    if (isBoss(e)) {
      K.hit(G, p, e, DJ.bossBase + DJ.bossPerChapter * chapter(G), { noMul: true, crit: false, ang: 0, tag: 'mark' });
      if (n > 0 && K.alive(e)) K.hit(G, p, e, n, { noMul: true, crit: false, ang: 0, tag: 'mark_hits' });
    } else K.hit(G, p, e, DJ.kill, { noMul: true, crit: false, ang: 0, tag: 'mark' });
    e._hits = 0; e._mark = null;
  }
  K.timers.dimension = (G, p, dt) => {
    if (!isMe(p)) return;
    for (const e of G.enemies) {
      if (!e._mark) continue;
      if (!K.alive(e)) { e._mark = null; continue; }
      e._mark.t -= dt;
      if (e._mark.t <= 0) resolve(G, p, e);
    }
    if (p._djBoost) { p._djBoost.t += dt; if (p._djBoost.t >= DJ.boostT + DJ.fade) p._djBoost = null; }
    if (p._dj || p._djBoost || (p._mulSrc && p._mulSrc['moveMul:djb'])) speed(p);
    const cs = G._cracks;
    if (cs && cs.length) {
      for (const c of cs) {
        c.life -= dt;
        if (c.life <= 0) { c.gone = true; K.stopFx(c.h); continue; }
        // hộp 1,4 × 3,6 ô của khe, thân người là vòng bán kính 0,4 ô [c17: collider CircleCollider2D 0,4]
        if (p.st !== 'dead' && Math.abs(p.x - c.x) < DJ.box[0] / 2 + 0.4 * T && Math.abs(p.y - c.y) < DJ.box[1] / 2 + 0.4 * T) trigger(G, p, c);
      }
      G._cracks = cs.filter(c => !c.gone);
    }
    if (has(p, 'dimension_jumping') && G.state === 'stage' && G.enemies.some(e => K.alive(e))) {
      G._crackT = (G._crackT == null ? 0 : G._crackT) - dt;
      if (G._crackT <= 0) {
        G._crackT = DJ.gap;
        if ((G._cracks || []).length < DJ.max) { const s = freeSpot(G, p); if (s) spawnCrack(G, s[0], s[1]); }
      }
    }
  };
  // Đòn của người chơi lên trùm: tích số đòn ngay từ đòn đầu, không cần đã bị đánh dấu.
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (p && isMe(p) && has(p, 'dimension_jumping') && isBoss(e) && !G._skHit) e._hits = (e._hits || 0) + 1;
  });
  SK.on('enemyKill', (G, e) => { const p = G.player; if (p && isMe(p) && e._mark) boost(p); });

  S.dimension_jumping = {
    start(G, p) {
      K.layer(G); markProp(G);
      p.skillT = K.cfg(p, 'dimension_jumping').dur || 3;
      p._dj = { added: 0, lx: p.x, ly: p.y };
      G._crackT = 0;
      speed(p);
      K.ghost(p, true); K.hurtMods(p).dj = () => 0;
      p._alpha = DJ.alpha;
      fx(G, 'skill_transcendent_shuttle', p.x, p.y - 6, {});
    },
    update(G, p, dt) {
      const s = p._dj; if (!s) return;
      // Xuyên địa hình: bỏ kết quả va chạm của khung này, đi thẳng theo hướng bấm (chỉ giữ trong bản đồ).
      const mv = I.moveVec(), spd = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      p.x = Math.max(8, Math.min(G.map.W * T - 8, s.lx + mv.x * spd));
      p.y = Math.max(T, Math.min(G.map.H * T - 2, s.ly + mv.y * spd));
      s.lx = p.x; s.ly = p.y;
      for (const e of G.enemies) {
        if (!K.alive(e)) continue;
        const [cx, cy] = K.ec(e);
        if (Math.hypot(cx - p.x, cy - (p.y - T)) < DJ.touch + e.r) mark(G, e);
      }
    },
    end(G, p) {
      const s = p._dj; p._dj = null;
      speed(p); K.ghost(p, false); delete K.hurtMods(p).dj; p._alpha = null;
      if (!s) return;
      // Đang nằm trong tường thì đẩy ra chỗ trống gần nhất.
      const r = p.h.body.r, blocked = (x, y) => W.boxHits(G.map, x - r, y - r, x + r, y);
      if (blocked(p.x, p.y)) {
        outer: for (let d = 2; d <= 8 * T; d += 2) for (let k = 0; k < 16; k++) {
          const a = k * Math.PI / 8, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (!blocked(x, y)) { p.x = x; p.y = y; break outer; }
        }
      }
      fx(G, 'skill_transcendent_shuttle', p.x, p.y - 6, {});
    }
  };
  S.dimension_jumping.DJ = DJ; S.dimension_jumping.spawnCrack = spawnCrack; S.dimension_jumping.mark = mark;

  // ================================================================ Khúc Xạ Hố Đen / Bùng Nổ Hố Đen
  // [ĐO config] cd 5, 3 lượt, args 3;3;5. [ĐO C18Controller] K = RoleSkill2 → TryCreateSkill2Rift (nút "0"); Bùng Nổ là nút riêng
  // ButtonGroup "1" (TrySkill2Burst) nên nằm ở special (phím L). Lượt hồi mỗi skill2RiftChargeCooldown 6 s (bản cấp 4 trừ 2 s; port
  // không có cấp kỹ năng). Hố đặt cách người 0,75 ô theo hướng ngắm và cao 0,8 ô; tàng hình skill2ShuttleDuration 1 s (độ mờ 0,4
  // [GetSkinShuttleAlpha]), shuttleHurtRate 50 = 50% vẫn bị thương. Hố mới quá skill2MaxRiftCount 3 thì thay hố cũ nhất.
  // Khúc xạ [TrySkill2ReflectBullet/Laser, C18Skill2RiftTarget]: đạn hoặc tia của người chơi chạm vòng tròn bán kính 0,8 ô của hố thì
  // sao chép ở mọi hố khác, mỗi bản đặt tại tâm hố kia, hướng NGẮM VÀO quái gần nhất trong tầm 14 ô quanh hố đó (không có quái thì
  // giữ hướng cũ; đạn shotgun lệch ngẫu nhiên ±skill2ShotgunAimOffset 30°), tốc độ giữ nguyên, sát thương = ceil(gốc × hệ số), hệ số
  // = max(skill2MinDamageFactor 0,5, 1 − skill2DamageDecayPerExtraRift 0,2 × (số hố − 1)); bản sao không bị nhân tiếp.
  // Bùng Nổ [TrySkill2Burst, StartSkill2BurstBuff, EndSkill2Burst]: cần còn hố và hết hồi chiêu; mỗi hố nổ skill2ExplodeDamage 20 trong
  // skill2ExplodeRadius 5 ô sau Skill2BurstDamageDelay 0,1 s, hồi skill2EnergyRestorePerRift 10 mỗi hố; người chơi tăng tốc CỘNG
  // skill2BurstSpeedRate 0,3, không bị thương, đạn địch trong bán kính 0,75 ô quanh người bị phá [Skill2BulletEliminatorRadius], kéo dài
  // skill2BurstDuration 3 s (config ghi {2} = 5 s nhưng descriptionArgs chỉ là chữ mô tả, mã đọc trường 3 s); hồi chiêu Bùng Nổ
  // skill2BurstCooldown 8 s tính từ lúc Bùng Nổ kết thúc.
  // Không có trong port: Skill2Drill*/Bezier/ELaser/AnubisTombStone (dữ liệu vũ khí port chỉ có RGShortLaser, RGLaser, RGPointLaser,
  // không có RGDrill, tia Bezier hay tia điện nào).
  const BH = {
    shuttle: C('skill2ShuttleDuration', 1), hurt: C('shuttleHurtRate', 50), dmg: C('skill2ExplodeDamage', 20), r: C('skill2ExplodeRadius', 5) * T,
    energy: C('skill2EnergyRestorePerRift', 10), decay: C('skill2DamageDecayPerExtraRift', 0.2), minF: C('skill2MinDamageFactor', 0.5),
    speed: C('skill2BurstSpeedRate', 0.3), dur: C('skill2BurstDuration', 3), cd: C('skill2BurstCooldown', 8), chargeCd: C('skill2RiftChargeCooldown', 6),
    delay: 0.1, pick: 0.8 * T, elim: 0.75 * T, ahead: 0.75 * T, up: 0.8 * T, alpha: 0.4, range: 14 * T, shot: C('skill2ShotgunAimOffset', 30)
  };
  const rifts = G => (G._rifts = (G._rifts || []).filter(r => !r.gone));
  const idBH = 'blackhole_refract_blackhole_burst';
  function place(G, p, x, y) {
    const list = rifts(G), max = args(p, idBH)[1] || 3;
    while (list.length >= max) { const o = list.shift(); o.gone = true; K.stopFx(o.h); }
    const r = { x, y, gone: false };
    r.h = fx(G, 'transcendent_0_rift_visual', x, y, {});
    list.push(r);
    G._rifts = list;
    return r;
  }
  const factor = n => Math.max(BH.minF, 1 - BH.decay * (Math.max(1, n) - 1));
  const targetFrom = (G, x, y) => K.nearest(G, x, y, BH.range);
  // Hướng của bản sao ra từ hố `r`: ngắm quái gần nhất quanh hố, không có thì giữ hướng cũ.
  function aimFrom(G, r, ang0, shotgun) {
    const e = targetFrom(G, r.x, r.y), a = e ? Math.atan2(K.ec(e)[1] - r.y, K.ec(e)[0] - r.x) : ang0;
    return a + (shotgun ? SK.deg(SK.randf(-BH.shot, BH.shot)) : 0);
  }
  const isShotgun = p => { const w = p.weapons[p.cur], d = w && w.def; return !!(d && ((d.pellets || 1) > 1 || (d.w86 && d.w86.x && d.w86.x.multiCount > 1))); };
  // Đạn người chơi bay qua hố: mỗi hố chỉ xử lý một lần cho mỗi viên.
  K.timers.rift = (G, p, dt) => {
    if (!isMe(p)) return;
    const list = rifts(G);
    const live = list.filter(r => !r.gone);
    p._ultReady = live.length > 0 && !(p._bhCd > 0) && !(p._bh && p._bh.mode === 'burst');
    if (live.length < 2) return;
    const f = factor(live.length), shot = isShotgun(p);
    for (const b of G.bullets) {
      if (b.side !== 'p' || b.dead || b._rc || b.melee || b.orbit || b.area) continue;
      const src = live.find(r => (!b._riftDone || !b._riftDone.has(r)) && Math.hypot(b.x - r.x, b.y - r.y) < BH.pick + (b.r || 0));
      if (!src) continue;
      (b._riftDone = b._riftDone || new Set()).add(src);
      const spd = Math.hypot(b.vx || 0, b.vy || 0);
      if (!(spd > 1)) continue;
      for (const r of live) {
        if (r === src) continue;
        const a = aimFrom(G, r, Math.atan2(b.vy, b.vx), shot), dmg = Math.ceil(b.dmg * f);
        let c;
        if (b.v86 && SK.spawnBullet86) {
          c = SK.spawnBullet86(G, 'p', b.v86, r.x, r.y, a, { spd: spd / U, dmg, crit: b.crit, repel: b.repel, thr: b.pierce, size: b.size, h: b.h, owner: b.owner, life: b.life });
        } else {
          c = Object.assign({}, b, { x: r.x, y: r.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, ang: a, dmg, hits: null, dead: false });
          G.bullets.push(c);
        }
        c._rc = 1;
      }
    }
  };
  // Tia: khi vũ khí tia bắn, nếu tia đi qua hố thì mỗi hố khác bắn ra một tia sao chép (đúng công thức góc và sát thương ở trên).
  const BEAM = /^(RGShortLaser|RGLaser|RGPointLaser)$/;
  function beamInfo(w) {
    const d = w.def, X = window.SK_W86, e = d && d.w86;
    if (!e || !X) return null;
    for (const b of e.b) {
      const B = b.p && X.bullets[b.p];
      if (B && (BEAM.test(B.mv || '') || (e.fam === 'laser' && !/^(Bullet|RGSBullet)/.test(B.mv || '')))) return { info: b, B, e };
    }
    return null;
  }
  const rayHitsRift = (x, y, ang, len, r) => {
    const c = Math.cos(ang), s = Math.sin(ang), dx = r.x - x, dy = r.y - y, u = dx * c + dy * s;
    return u > -BH.pick && u < len + BH.pick && Math.abs(-dx * s + dy * c) < BH.pick + 2;
  };
  function castBeam(G, p, bi, x, y, ang, dmg, crit) {
    const m = (bi.B.m || {})[bi.B.mv] || {}, maxL = Math.min(50, m.laserLength || m.maxDistance || m.range || 20) * U;
    const c = Math.cos(ang), s = Math.sin(ang), hit = [];
    let len = 0;
    while (len < maxL) {
      len += 2;
      const bx = x + c * len, by = y + s * len;
      if (W.solidAt(G.map, bx, by + 6)) break;
      for (const e of G.enemies) {
        if (!K.alive(e) || hit.indexOf(e) >= 0) continue;
        const hw = e.hb.size[0] * e.scale / 2 + 2, hh = e.hb.size[1] * e.scale / 2 + 2;
        if (Math.abs(bx - (e.x + e.hb.off[0] * e.face * e.scale)) < hw && Math.abs(by - (e.y - e.hb.off[1] * e.scale)) < hh) {
          hit.push(e);
          G._skHit = 'rift_laser'; SK.hurtEnemy(G, e, dmg, crit, ang, bi.info.repel || 0); G._skHit = null;
        }
      }
    }
    if (bi.B.fx && SK.w86 && SK.w86.ensureFx() && SK.vfx) {
      const hh = SK.vfx.spawn(G, 'W:' + bi.info.p, x, y, { ang, dur: 0.15 });
      const body = hh && hh.nodes.find(nd => nd.d.n === 'img'), endI = hh ? hh.nodes.findIndex(nd => nd.d.n === 'end') : -1;
      if (hh && hh.def.anims) hh.def = Object.assign({}, hh.def, { anims: hh.def.anims.map(a => Object.assign({}, a, { clips: a.clips.map(cl => Object.assign({}, cl, { curves: cl.curves.filter(cv => !((body && cv.n === hh.nodes.indexOf(body) && cv.k === 'sx') || (cv.n === endI && cv.k === 'px'))) })) })) });
      if (hh && endI >= 0) { hh.nodes[endI].T[0] = len / U; hh.nodes[endI].dirty = true; }
      if (body) { body.T[7] = len / U; body.dirty = true; }
    }
    return len;
  }
  SK.on('fire', (G, p, w) => {
    if (!isMe(p) || !has(p, idBH) || !w) return;
    const live = rifts(G);
    if (live.length < 2) return;
    const bi = beamInfo(w), mz = w.lastMz;
    if (!bi || !mz) return;
    const ang = w.lastAng != null ? w.lastAng : p.aim, m = (bi.B.m || {})[bi.B.mv] || {}, maxL = Math.min(50, m.laserLength || m.maxDistance || m.range || 20) * U;
    const src = live.find(r => rayHitsRift(mz.x, mz.y, ang, maxL, r));
    if (!src) return;
    const f = factor(live.length), base = bi.info.dmg * ((bi.e.dmf) || 1) * (p.dmgMul || 1);
    for (const r of live) {
      if (r === src) continue;
      const crit = SK.rand() * 100 < ((p.crit || 0) + (bi.info.crit || 0)), dmg = Math.ceil(Math.round(base) * (crit ? SK.DS.rules.critMult : 1) * f);
      castBeam(G, p, bi, r.x, r.y, aimFrom(G, r, ang, false), dmg, crit);
    }
  });

  function burst(G, p) {
    const list = rifts(G);
    if (!list.length || p._bhCd > 0 || (p._bh && p._bh.mode === 'burst')) return false;
    K.layer(G);
    const t = BH.dur;
    for (const r of list) {
      r.gone = true; K.stopFx(r.h);
      fx(G, 'transcendent_0_rift_burst', r.x, r.y, {});
      G.props.push({ x: r.x, y: 1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt; if (q.t < BH.delay) return;
          q.gone = true;
          for (const e of K.inRadius(G2, r.x, r.y, BH.r)) K.hit(G2, p, e, BH.dmg, { noMul: true, crit: false, ang: Math.atan2(e.y - r.y, e.x - r.x), repel: 3, tag: 'rift_burst' });
        } });
    }
    const gain = BH.energy * list.length;
    p.energy = Math.min(p.energyMax, p.energy + gain);
    num(G, p, '+' + gain, '#7fd3ff');
    G._rifts = [];
    cleanStealth(p);
    p._bh = { mode: 'burst' };
    p.skillT = t;
    K.setMul(p, 'moveMul', 'bh', 1 + BH.speed);
    K.hurtMods(p).bh = () => 0;
    p._bh.h = fx(G, 'transcendent_skill_1_trail', p.x, p.y, { follow: p, dur: t });
    G.shake = Math.max(G.shake, 3);
    return true;
  }
  function cleanStealth(p) { p.hidden = false; p._alpha = null; delete K.hurtMods(p).bh; }
  function enterStealth(G, p) {
    if (p._bh && p._bh.mode === 'burst') return;
    p.skillT = BH.shuttle;
    p._bh = { mode: 'stealth' };
    p.hidden = true; p._alpha = BH.alpha;
    K.hurtMods(p).bh = (G2, pl, dmg) => (SK.rand() * 100 < BH.hurt ? dmg : 0);
  }
  // Đặt hố cách người 0,75 ô theo hướng ngắm, cao 0,8 ô [TryCreateSkill2Rift].
  function placeAtPlayer(G, p) {
    const a = p.aim != null ? p.aim : (p.face > 0 ? 0 : Math.PI);
    place(G, p, p.x + Math.cos(a) * BH.ahead, p.y - BH.up + Math.sin(a) * BH.ahead);
    enterStealth(G, p);
  }
  S.blackhole_refract_blackhole_burst = {
    start(G, p) {
      K.layer(G);
      K.charges(p, idBH).cd = BH.chargeCd; K.useCharge(p, idBH);
      placeAtPlayer(G, p);
    },
    press(G, p) {
      const ch = K.charges(p, idBH);
      if (ch.n <= 0) return;
      K.useCharge(p, idBH);
      placeAtPlayer(G, p);
    },
    special(G, p) { burst(G, p); },
    update(G, p, dt) {
      const b = p._bh;
      if (!b || b.mode !== 'burst') return;
      // Vòng phá đạn quanh người trong lúc Bùng Nổ [C18Skill2BulletEliminator, Skill2BulletEliminatorRadius 0,75 ô].
      for (const q of G.bullets) if (q.side === 'e' && !q.dead && Math.hypot(q.x - p.x, q.y - (p.y - 8)) < BH.elim + (q.r || 0)) q.dead = true;
    },
    end(G, p) {
      const b = p._bh; p._bh = null;
      cleanStealth(p);
      if (b && b.mode === 'burst') { K.setMul(p, 'moveMul', 'bh', 1); K.stopFx(b.h); p._bhCd = BH.cd; }
    }
  };
  // Hố và khe nứt chỉ sống trong một màn [C18Controller.OnEnterNextLevel → ClearSkill2Objects].
  const clearWorld = G => { for (const r of G._rifts || []) K.stopFx(r.h); for (const c of G._cracks || []) K.stopFx(c.h); G._rifts = []; G._cracks = []; };
  SK.on('stageEnter', clearWorld); SK.on('runStart', clearWorld);
  K.timers.riftCd = (G, p, dt) => { if (isMe(p) && p._bhCd > 0 && !(p._bh && p._bh.mode === 'burst')) p._bhCd -= dt; };
  S.blackhole_refract_blackhole_burst.BH = BH; S.blackhole_refract_blackhole_burst.place = place;
})();
