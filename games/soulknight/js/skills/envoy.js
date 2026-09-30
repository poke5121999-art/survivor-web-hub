// Kỹ năng Sứ Giả (c19 = C19Controller): elemental_affinity. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world, I = SK.input;
  const C = (f, d) => K.CTRL('envoy', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;

  // Thân Hoà Nguyên Tố [ĐO C19Controller.RoleSkill0 / OnPlayerBulletHitEnemyHandler / CreateEnvoyBuff và các lớp Buff*Envoy*, EnvoyFireBall,
  // BuffEnvoyPoisonFog, EnvoyPoisonBuffProgress đọc bằng tools/sk_method.py; số prefab đọc thẳng D:\sk86-ref\work\skills\mb\common.json vì
  // các prefab envoy không nằm trong sk-skills86.js]. cd 8, dur 5, 2 lượt [config].
  // Chọn nguyên tố: RoleSkill0 đọc buffIndex (hướng kéo nút kỹ năng, GamepadStickDirection) và _randomElementalType = RGRandom.Range; không
  // kéo thì NGẪU NHIÊN [ĐO] (bản trước xoay vòng là sai). Nút kỹ năng kéo là cùng một nút (InitDragSkillBtn, ui_roulette) nên không dùng
  // special(L); bàn phím giữ ↑ lửa, → băng, ↓ độc, ← sét khi bấm K.
  // Lúc bấm mỗi nguyên tố có một đòn riêng (RoleSkill0 nhảy tới CreateAroundFireBall / CreateBigIceBullet / CreatePoisonBullet / CreateLightningBullet).
  // Đòn vũ khí trúng quái trong lúc duy trì (PlayerBulletHitEnemyEvent): lấy nguyên tố của đạn, đạn không có nguyên tố thì lấy nguyên tố ngẫu nhiên
  // đã chọn; gắn buff nguyên tố lên quái (CreateEnvoyBuff) rồi thêm: lửa → CreateFireBall, băng → CreateSmallIceBullet.
  // Chưa làm (đã đọc, nói rõ): vòng lửa/băng mặt đất (EnvoyFireCircle: 12 vòng cỡ 3 khi thả kỹ năng lửa [ĐO fireCircleCount 12, fireCircleScale 3];
  // Fire2 sát thương 2 mỗi 0,5 s bán kính 3 với 15% khi có buff lửa; bullet_frost băng bán kính 3 với 30%), giảm 50% tốc đánh của vùng nước,
  // nguyên tố tự mang của vũ khí, cấp kỹ năng (SkillExtraUpdate) và Bia Đá (Stele) nội tại.
  const fi = C('fireInfo', {}), ii = C('iceInfo', {}), pi = C('poisonInfo', {});
  const EL = {
    fire: { first: fi.firstDamage || 6, r: (fi.radius || 6) * T, dot: fi.dotDamage || 2, every: fi.dotInterval || 1, buff: fi.buffTime || 5, jumps: fi.maxStacks || 2, decay: fi.percent || 0,
      gap: C('fireBulletInterval', 0.2), speed: 15 * T, life: 3, count: C('fireCircleCount', 12), hitR: 8 },   // tốc 15, sống 3 s [ĐO EnvoyFireBall.moveSpeed, duration]
    ice: { chance: ii.atkProbability || 50, freeze: ii.probability || 100, min: ii.minCount || 2, max: ii.maxCount || 4, gap: C('iceBulletInterval', 0.3), buff: 5,
      balls: C('iceBalls', [{ speed: 9.5, damage: 10, critic: 30, throughCount: 0 }, { speed: 12, damage: 7, critic: 10, throughCount: 1 }, { speed: 15, damage: 3, critic: 10, throughCount: 0 }]) },
    poison: { r: (pi.radius || 5) * T, dot: pi.dotDamage || 1, every: pi.dotInterval || 0.33, buff: pi.buffTime || 6.5, fill: 0.8, check: 0.1, lifeMin: 1 },   // fill 0,8 s, check 0,1 s [ĐO BuffEnvoyPoisonFog]
    lightning: { dmg: C('lightningDamage', 2), n: C('lightningCount', 3), range: 10 * T, gap: 0.4, zap: 3, buff: 5 },   // buff: atk 3, cooling 0,4, multiCount 3, max_distance 10 [ĐO buff_envoy_lightning]
    combo: { ice: { size: C('iceCombineSize', 2), dur: C('iceCombineDuration', 5), slow: 0.25, every: 0.2 },   // water_area: buff_speed_down changeValue −0,75
      poison: { size: C('poisonCombineSize', 3), dmg: C('poisonCombineDamage', 8) }, lightning: { dmg: 12, crit: 40, delay: 1 } }   // bullet_envoy_lighting bulletsInfo[0] 12, bạo kích 40, delayTime 1
  };
  const KINDS = ['fire', 'ice', 'poison', 'lightning'];   // buffIndex: lên / phải / xuống / trái

  // Trạng thái theo quái: buff lửa/băng/độc nằm trong K.debuff (e._db), độc và sét có thêm đồng hồ riêng.
  let areas = [], strikes = [];
  const has = (e, k) => k === 'poison' ? e._envP > 0 : k === 'lightning' ? e._envL > 0 : !!(e._db && e._db[k]);

  // Đạn của kỹ năng đi thẳng, tự tính va chạm.
  function proj(G, p, o) {
    const b = { x: o.x, y: o.y, ang: o.ang, life: o.life || 1.6, gone: false, hit: new Set(o.skip || []), left: o.pierce || 0 };
    b.h = o.vfx ? fx(G, o.vfx, b.x, b.y, { follow: b, ang: o.ang, dur: b.life }) : null;
    G.props.push({ x: b.x, y: 1e9, draw() {},
      update(G2, q, dt) {
        b.life -= dt;
        b.x += Math.cos(b.ang) * o.speed * dt; b.y += Math.sin(b.ang) * o.speed * dt;
        let done = b.life <= 0 || W.solidAt(G2.map, b.x, b.y + 6);
        if (!done) for (const e of G2.enemies) {
          if (!K.alive(e) || b.hit.has(e)) continue;
          const [cx, cy] = K.ec(e);
          if (Math.hypot(cx - b.x, cy - b.y) < e.r + (o.r || 4)) { b.hit.add(e); o.onHit(G2, e, b); if (b.left-- <= 0) { done = true; break; } }
        }
        if (done) { q.gone = true; K.stopFx(b.h); }
      } });
  }

  // ---- lửa: EnvoyFireBall. Bay tới mục tiêu tốc 15, chạm (< 0,5 ô) thì gắn buff lửa + nhận firstDamage, rồi nhảy sang quái gần nhất chưa cháy
  // trong bán kính 6 ô, tối đa maxStacks lần nhảy [ĐO EnvoyFireBall.AddBuff / CreateFirstDamage / JumpToNextEnemy; bộ lọc "chưa cháy" là suy từ
  // BuffMgr.GetCombineBuffs, chưa đọc hết].
  function burn(G, p, e, first) {
    if (first) K.hit(G, p, e, first, { ang: 0, repel: 1, fx: 'hit_red', tag: 'fireball', noMul: true, crit: false });
    envoyBuff(G, p, e, 'fire');
  }
  function fireballAt(G, p, from, target, stack) {
    const el = EL.fire, b = { x: from[0], y: from[1], t: 0 };
    b.h = fx(G, 'bullet_envoy_fireball', b.x, b.y, { follow: b, dur: el.life });
    G.props.push({ x: b.x, y: 1e9, draw() {},
      update(G2, q, dt) {
        b.t += dt;
        if (b.t >= el.life || !K.alive(target)) { q.gone = true; K.stopFx(b.h); return; }
        const [cx, cy] = K.ec(target), dx = cx - b.x, dy = cy - b.y, d = Math.hypot(dx, dy);
        if (d < 0.5 * T) {
          q.gone = true; K.stopFx(b.h);
          burn(G2, p, target, el.first * (1 - el.decay));
          if (stack < el.jumps) {
            const nx = K.nearest(G2, cx, cy, el.r, { skip: o => o === target || has(o, 'fire') });
            if (nx) fireballAt(G2, p, [cx, cy], nx, stack + 1);
          }
          return;
        }
        const s = Math.min(d, el.speed * dt);
        b.x += dx / d * s; b.y += dy / d * s;
      } });
  }
  // Lúc bấm: fireCircleCount (12) quả bay toả đều từ người theo hướng đang quay, mỗi quả trúng quái đầu tiên [ĐO CreateAroundFireBall].
  function aroundFire(G, p) {
    const el = EL.fire, a0 = p.aim != null ? p.aim : K.aimDir(p);
    for (let i = 0; i < el.count; i++) proj(G, p, { x: p.x, y: p.y - 7, ang: a0 + i * Math.PI * 2 / el.count, speed: el.speed, life: el.life, vfx: 'bullet_envoy_fireball', r: el.hitR,
      onHit(G2, e) { const [cx, cy] = K.ec(e); burn(G2, p, e, el.first); const nx = K.nearest(G2, cx, cy, el.r, { skip: o => o === e || has(o, 'fire') }); if (nx && el.jumps > 0) fireballAt(G2, p, [cx, cy], nx, 1); } });
  }

  // ---- băng: quả to (iceBalls[0]) bay thẳng; mỗi lần trúng nở 2-4 quả (iceBalls[1], xuyên 1); quả vừa trúng lại nở quả nhỏ (iceBalls[2]) [ĐO
  // CreateBigIceBullet → CreateMiddleIceBullet → CreateIceBullet; số quả RGRandom.Range(min, max), góc chia đều 360/n cộng góc quay; xuyên/cỡ theo iceBalls].
  function ball(G, p, x, y, ang, tier, skip) {
    const el = EL.ice, t = el.balls[tier];
    proj(G, p, { x, y, ang, speed: t.speed * T, vfx: 'bullet_envoy_snowball', skip, pierce: t.throughCount || 0, life: 1.6,
      onHit(G2, e, b) {
        K.hit(G2, p, e, t.damage, { ang, critChance: t.critic, repel: t.repel != null ? t.repel : 1, fx: 'hit_blue', tag: 'snowball' + tier, noMul: true });
        K.debuff(G2, e, 'ice');
        if (tier < 2) burst(G2, p, b.x, b.y, tier + 1, e);
      } });
  }
  function burst(G, p, x, y, tier, skip) {
    const el = EL.ice, n = el.min + Math.floor(SK.rand() * (el.max - el.min + 1)), a0 = SK.rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) ball(G, p, x, y, a0 + i * Math.PI * 2 / n, tier, [skip]);
  }

  // ---- độc: BuffEnvoyPoison là vùng quanh nguồn (người lúc bấm, sau đó mỗi quái đang nhiễm), 0,1 s quét một lần; quái trong bán kính 5 ô phải
  // ở đủ 0,8 s (EnvoyPoisonBuffProgress: tiến độ cộng khoảng thời gian giữa hai lần quét, đủ addBuffTime 0,8 thì gắn buff) mới nhiễm, buff mới
  // nhận đúng thời gian còn lại của nguồn nên lan xa dần yếu đi [ĐO BuffEnvoyPoison.Update / AddBuffProgress / EnvoyPoisonBuffProgress.AddNewBuff].
  // [ƯỚC LƯỢNG] chỉ lan khi nguồn còn > 1 s (mã so sánh remainLifeTime với 1,0, chiều so sánh chưa xác nhận); tiến độ về 0 khi quái ra khỏi vùng
  // (thời gian huỷ EnvoyPoisonBuffProgress.destroyTime chưa đọc); vùng trên người tồn tại buff_time 6,5 s.
  function poisoned(G, e, life) {
    const el = EL.poison;
    e._envP = Math.max(e._envP || 0, life);
    K.debuff(G, e, 'poison', { t: life, dmg: el.dot, every: el.every });
  }
  const poisonTick = (G, p, dt) => {
    const el = EL.poison, s = p._env, aura = p._envAura;
    if (aura) { aura.t -= dt; if (aura.t <= 0) p._envAura = null; }
    G._envPT = (G._envPT || 0) + dt;
    for (const e of G.enemies) if (e._envP > 0) { e._envP -= dt; if (e._envP <= 0 || !K.alive(e)) e._envP = 0; }
    if (G._envPT < el.check) return;
    const step = G._envPT; G._envPT = 0;
    const src = [];
    if (p._envAura) src.push({ x: p.x, y: p.y - 6, life: p._envAura.t });
    for (const e of G.enemies) if (e._envP > el.lifeMin && K.alive(e)) src.push({ x: e.x, y: e.y - 6, life: e._envP, e });
    for (const e of G.enemies) {
      if (!K.alive(e) || e._envP > 0) { e._envG = 0; continue; }
      let best = null;
      for (const q of src) if (q.e !== e && Math.hypot(e.x - q.x, (e.y - 6) - q.y) < el.r + e.r && (!best || q.life > best.life)) best = q;
      if (!best) { e._envG = 0; continue; }
      e._envG = e._envG > 0 ? e._envG + step : 1e-9;   // lần quét đầu chỉ mở bộ đếm (tiến độ tính từ lúc tạo)
      if (e._envG >= el.fill) { e._envG = 0; envoyBuff(G, p, e, 'poison', best.life); }
    }
  };

  // ---- sét: lúc bấm LightningEffectorBuff nhảy lightningCount (3) quái, mỗi nhát lightningDamage (2) [ĐO CreateLightningBullet]; buff sét của quái
  // (buff_envoy_lightning, BuffElectrification: atk 3, cooling 0,4 s, multiCount 3, max_distance 10 ô, 5 s) cứ 0,4 s giật tối đa 3 quái gần quanh nó
  // [ƯỚC LƯỢNG cách chọn: mã BuffElectrification.Update chưa đọc].
  function chain(G, p, from, n, dmg, range, tag, skip0) {
    const seen = new Set(skip0 || []); let pos = from;
    for (let i = 0; i < n; i++) {
      const nx = K.nearest(G, pos[0], pos[1], range, { skip: q => seen.has(q) });
      if (!nx) break;
      seen.add(nx);
      const a = pos, b = K.ec(nx);
      K.boltProp(G, () => [a[0], a[1]], () => [b[0], b[1]], 0.2);
      K.hit(G, p, nx, dmg, { repel: 0, fx: 'hit_blue', tag, noMul: true, crit: false });
      pos = b;
    }
  }
  const lightningTick = (G, p, dt) => {
    for (const e of G.enemies) {
      if (!(e._envL > 0)) continue;
      e._envL -= dt;
      if (!K.alive(e)) { e._envL = 0; continue; }
      e._envLc = (e._envLc || 0) - dt;
      if (e._envLc <= 0) { e._envLc = EL.lightning.gap; const c = K.ec(e); chain(G, p, c, EL.lightning.zap, 3, EL.lightning.range, 'zap', [e]); }
    }
    for (const q of strikes) {
      q.t -= dt;
      if (q.t > 0) continue;
      q.gone = true;
      const c = EL.combo.lightning;
      fx(G, 'lightning_0', q.x, q.y, {});
      for (const e of K.inRadius(G, q.x, q.y, T)) K.hit(G, p, e, c.dmg, { repel: 0, fx: 'hit_blue', tag: 'react_lightning', noMul: true, critChance: c.crit });
    }
    strikes = strikes.filter(q => !q.gone);
    for (const a of areas) {
      a.t -= dt; a.tick -= dt;
      if (a.tick > 0) continue;
      a.tick += EL.combo.ice.every;
      for (const e of K.inRadius(G, a.x, a.y, a.r)) K.debuff(G, e, 'gasSlow', { t: 0.4, slow: EL.combo.ice.slow });
    }
    areas = areas.filter(a => a.t > 0);
  };
  K.timers.envoy = (G, p, dt) => { poisonTick(G, p, dt); lightningTick(G, p, dt); };

  // ---- phản ứng nguyên tố: quái đang mang buff lửa nhận thêm băng / sét / độc (hoặc ngược lại) thì buff lửa bị tiêu và sinh phản ứng tại quái
  // [ĐO BuffEnvoyFire.IceCombine / LightningCombine / PoisonCombine, gọi từ CombinedBuffStart của từng buff]:
  //  băng: vùng nước cỡ iceCombineSize 2, tồn tại iceCombineDuration 5 s, mỗi 0,2 s gắn buff_speed_down (−75% tốc chạy) [ĐO water_area];
  //  sét: sau 1 s giáng bullet_envoy_lighting 12 sát thương (bạo kích 40) [ĐO BulletEnvoyLightning.bulletsInfo[0], delayTime];
  //  độc: nổ explode_hit_enemy_2 cỡ poisonCombineSize 3, sát thương poisonCombineDamage 8 [ĐO].
  // [ƯỚC LƯỢNG] bán kính: vùng nước 2 ô, nổ độc 3 ô, giáng sét 1 ô (collider prefab chưa đọc); buff nào bị tiêu: mã gọi BuffEnd trên buff lửa
  // (đọc từ thứ tự lời gọi trong CombinedBuffStart), buff băng của quái vẫn còn nhưng không đóng băng (BuffEnvoyIce.CanCombine đặt _canCreateIceBuff = false).
  function react(G, p, e, kind) {
    const c = EL.combo;
    if (e._db && e._db.fire) { const b = e._db.fire; if (b.h && b.h.stop) b.h.stop(); delete e._db.fire; }
    const [cx, cy] = K.ec(e);
    if (kind === 'ice') { areas.push({ x: cx, y: cy, r: c.ice.size * T, t: c.ice.dur, tick: 0 }); fx(G, 'water_area', cx, cy, { dur: c.ice.dur }); }
    else if (kind === 'lightning') strikes.push({ x: cx, y: cy, t: c.lightning.delay });
    else {
      fx(G, 'explode_hit_enemy_2', cx, cy, {});
      for (const q of K.inRadius(G, cx, cy, c.poison.size * T)) K.hit(G, p, q, c.poison.dmg, { repel: 2, fx: 'hit_green', tag: 'react_poison', noMul: true, crit: false });
    }
    G.shake = Math.max(G.shake, 2);
  }
  // Gắn buff nguyên tố lên quái [ĐO C19Controller.CreateEnvoyBuff → BuffEnvoyFire/Ice/Poison/Lightning.SetInfo].
  function envoyBuff(G, p, e, kind, life) {
    if (!K.alive(e)) return;
    const el = EL[kind], fire = has(e, 'fire');
    let reacted = false;
    if (kind === 'fire') {
      const other = ['ice', 'poison', 'lightning'].find(k => has(e, k));
      K.debuff(G, e, 'fire', { t: el.buff, dmg: el.dot, every: el.every });
      if (other) { react(G, p, e, other); reacted = true; }
    } else {
      if (fire) { react(G, p, e, kind); reacted = true; }
      if (kind === 'ice') { if (!reacted && SK.rand() * 100 < el.freeze) K.debuff(G, e, 'ice'); e._envI = el.buff; }
      else if (kind === 'poison') poisoned(G, e, life || el.buff);
      else e._envL = Math.max(e._envL || 0, el.buff);
    }
  }

  // Bỏ mọi vùng nước, sét chờ khi sang màn / ván mới.
  const clearWorld = () => { areas = []; strikes = []; };
  SK.on('stageEnter', clearWorld); SK.on('runStart', clearWorld);

  S.elemental_affinity = {
    start(G, p) {
      K.layer(G);
      K.charges(p, 'elemental_affinity'); K.useCharge(p, 'elemental_affinity');
      const held = I.down('up') ? 'fire' : I.down('right') ? 'ice' : I.down('down') ? 'poison' : I.down('left') ? 'lightning' : null;
      const rand = KINDS[Math.floor(SK.rand() * KINDS.length)];
      const kind = held || rand;
      p.skillT = K.cfg(p, 'elemental_affinity').dur || 5;
      p._env = { kind, rand, t0: G.t, last: { fire: -1e9, ice: -1e9 } };
      p._env.h = fx(G, 'envoy_skill0_effect', p.x, p.y, { follow: p, dur: p.skillT });
      const a0 = p.aim != null ? p.aim : K.aimDir(p);
      if (kind === 'fire') aroundFire(G, p);
      else if (kind === 'ice') ball(G, p, p.x, p.y - 7, a0, 0, []);
      else if (kind === 'poison') p._envAura = { t: EL.poison.buff };
      else chain(G, p, [p.x, p.y - 6], EL.lightning.n, EL.lightning.dmg, EL.lightning.range, 'activate');
    },
    end(G, p) { if (p._env) K.stopFx(p._env.h); p._env = null; }
  };

  // Đòn vũ khí trúng quái trong lúc duy trì [ĐO OnPlayerBulletHitEnemyHandler: bỏ qua đòn kỹ năng].
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player, s = p && p._env;
    if (!s || !(p.skillT > 0) || G._skHit || !K.alive(e)) return;
    const kind = s.kind;
    envoyBuff(G, p, e, kind);
    if (kind === 'fire' && G.t - s.last.fire >= EL.fire.gap) { s.last.fire = G.t; fireballAt(G, p, [p.x, p.y - 7], e, 0); }
    else if (kind === 'ice' && G.t - s.last.ice >= EL.ice.gap && SK.rand() * 100 < EL.ice.chance) { s.last.ice = G.t; burst(G, p, e.x, e.y - 7, 2, e); }
  });
  S.elemental_affinity.EL = EL; S.elemental_affinity.buff = envoyBuff;
})();
