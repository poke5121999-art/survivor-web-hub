// Kỹ năng Thuật Sĩ Ác Ma (c23): amii_s_burning_body, helping_hand_eligos, amon_s_protection. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Tiểu Quỷ (PetWarlockDemonController) là nguồn hy sinh của cả ba kỹ năng; web chưa có nội tại triệu Tiểu Quỷ nên dựng ở đây (chỉ khi cầm Thuật Sĩ).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU;
  const { cfg, fx, hit, alive, ec, inRadius, setMul, hurtMods, layer, timers, addAlly, hpBar, walk, glow, drawRip, DUR_UI, nearest } = K;

  // [ĐO C24Controller (hằng số) + prefab pet_warlock_demon_skin_0: PetWarlockDemonController damage 2, atk_cd 2,5, min/max_follow 2/20, RoleAttribute max_hp 1, speed 6]
  const DEMON = { max: 6, hp: 1, dmg: 2, cd: 2.5, near: 2 * U, far: 20 * U, speed: 6 * U, fly: 0.2, sight: 10 * U, bossDmg: 33 };   // sight [ƯỚC LƯỢNG]
  const wl = p => p._wl || (p._wl = { demons: [], energy: 0, eligos: null, boss: 0, sacrificeStacks: 0 });
  const demons = (G, p) => (wl(p).demons = wl(p).demons.filter(d => !d.gone && !d.used));

  // ---------------------------------------------------------------- Tiểu Quỷ
  const demonParts = () => SK.prefab('pet_warlock_demon_skin_0');
  function summon(G, p, x, y) {
    const w = wl(p);
    if (w.eligos && !w.eligos.gone) { feedEligos(G, p, x, y, 1); return null; }
    if (demons(G, p).length >= DEMON.max) return null;
    layer(G);
    const d = addAlly(G, {
      demon: true, x, y, hp: DEMON.hp, hpMax: DEMON.hp, box: [8, 10, 6], face: 1, cd: DEMON.cd * 0.5, shot: null,
      onZero(G2, a) { a.gone = true; fx(G2, 'hit_red', a.x, a.y - 6, {}); },
      update(G2, a, dt) {
        if (a.fly) return flyStep(G2, a, dt);
        const dp = Math.hypot(p.x - a.x, p.y - a.y), e = nearest(G2, a.x, a.y - 6, DEMON.sight, { los: true });
        if (dp > DEMON.far) { a.x = p.x; a.y = p.y; } else if (dp > DEMON.near * 2 || (!e && dp > DEMON.near)) walk(G2, a, p.x, p.y, DEMON.speed, dt);
        a.cd -= dt;
        if (e && a.cd <= 0) { a.cd = DEMON.cd; demonShot(G2, p, a, e); }
      },
      draw(ctx, G2, a) {
        const parts = demonParts();
        ctx.save(); ctx.globalAlpha *= a.fly ? 0.7 : 1;
        if (parts) drawRip(ctx, parts, a.x, a.y, { t: a.t, flip: a.face < 0 });
        else { glow(ctx, a.x, a.y - 6, 9, [0.7, 0.2, 1, 1], 0.9); ctx.fillStyle = '#3a1450'; ctx.beginPath(); ctx.arc(a.x, a.y - 6, 4, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ff5a5a'; ctx.fillRect(a.x - 2, a.y - 7, 1, 1); ctx.fillRect(a.x + 1, a.y - 7, 1, 1); }
        ctx.restore();
        hpBar(ctx, a, 16, '#a040ff');
      }
    });
    wl(p).demons.push(d);
    fx(G, 'hit_red', x, y - 6, {});
    return d;
  }
  // Tiểu Quỷ bắn quả cầu lửa nhỏ: bay 0,15 s rồi gây 2 [ĐO damage].
  function demonShot(G, p, a, e) {
    const [tx, ty] = ec(e), sx = a.x, sy = a.y - 6;
    a.face = tx >= a.x ? 1 : -1;
    G.props.push({ x: sx, y: 1e9, t: 0,
      update(G2, q, dt) { q.t += dt; if (q.t >= 0.15) { q.gone = true; if (alive(e)) hit(G2, p, e, DEMON.dmg, { tag: 'wl_demon', fx: 'hit_red' }); } },
      draw(ctx, G2, q) { const k = Math.min(1, q.t / 0.15); glow(ctx, sx + (tx - sx) * k, sy + (ty - sy) * k, 6, [1, 0.3, 0.2, 1], 0.9); } });
  }
  // Hy sinh: Tiểu Quỷ bay tới đích trong 0,2 s [ĐO DemonSacrificeMoveDuration] rồi gọi cb.
  function sacrifice(G, p, n, target, cb) {
    const list = demons(G, p).sort((a, b) => Math.hypot(a.x - target().x, a.y - target().y) - Math.hypot(b.x - target().x, b.y - target().y)).slice(0, n);
    for (const d of list) { d.used = true; d.box = null; d.fly = { t: 0, x0: d.x, y0: d.y, to: () => { const t = target(); return { x: t.x, y: t.y }; }, cb }; }
    return list.length;
  }
  function flyStep(G, a, dt) {
    const f = a.fly; f.t += dt;
    const k = Math.min(1, f.t / DEMON.fly), to = f.to();
    a.x = f.x0 + (to.x - f.x0) * k; a.y = f.y0 + (to.y - f.y0) * k;
    if (k >= 1) { a.gone = true; if (f.cb) f.cb(a); }
  }
  // Mỗi mạng Tiểu Quỷ mới khi giết quái (hoặc mỗi 33 sát thương lên trùm [ĐO BossDamageRequiredToSummonADemon]).
  SK.on('enemyKill', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'warlock') return;
    summon(G, p, e.x, e.y);
  });
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player;
    if (!p || p.hero !== 'warlock' || !e.boss || G._skHit === 'wl_demon') return;
    const w = wl(p);
    w.boss += dmg;
    while (w.boss >= DEMON.bossDmg) { w.boss -= DEMON.bossDmg; summon(G, p, e.x, e.y + 8); }
  });

  // ================================================================ Cơ Thể Bốc Cháy Ami
  // [ĐO C24Controller hằng số: Skill0Duration 10 (= args {0}), ...ExtendPerSacrifice 1, ...SacrificeShieldDuration 0,5, ...SecondStageCastCd 0,5,
  //  ...DemonCost 2 (= args {1}), ...TotalDamage 10, ...HitCount 1, Skill0MoveSpeedValue 0,5; Fire2_warlock_skin_0.BulletFire_Warlock damage 8, circleCastRadius 5,
  //  hitInterval 0,4; skill0SacrificeRadiusGrowthPerSacrifice 0,15 (tối đa 3 lần), ExtraFireCircle: damage 3, bán kính 2; Fire2_warlock_dead_fire damage 3, hitInterval 0,4]
  const AM = { dur: 10, extend: 1, shield: 0.5, gap: 0.5, cost: 2, burst: 10, move: 1.5, dmg: 8, every: 0.4, r: 5 * U, grow: 0.15, maxStack: 3, extraDmg: 3, extraR: 2 * U, extraT: 2, expand: 0.2, squash: 0.75 };   // thời gian vòng lửa phụ, tỉ lệ dẹt của vòng [ƯỚC LƯỢNG]
  DUR_UI.amii_s_burning_body = AM.dur;
  const amR = s => AM.r * (1 + AM.grow * s.stack);
  // Fire2_warlock_skin_0 của sk-vfx.js chỉ có hạt nhân (blend mul) nên không hiện gì: vẽ vòng lửa ở đây, rải lửa thật (dead_fire) quanh vòng.
  function circleProp(G, p, s) {
    G.props.push({ x: p.x, y: -1e9 + p.y, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        if (p._wlAm !== s) { q.gone = true; return; }
        q.x = p.x; q.y = -1e9 + p.y;
        s.flame -= dt;
        if (s.flame <= 0) { s.flame = 0.1; const a = SK.rand() * 6.283; fx(G2, 'Fire2_warlock_dead_fire_skin_0', p.x + Math.cos(a) * s.r, p.y + Math.sin(a) * s.r * AM.squash, { dur: 0.8, scale: 0.7 }); }
      },
      draw(ctx, G2, q) {
        const r = s.r;
        ctx.save(); ctx.translate(p.x, p.y - 2); ctx.scale(1, AM.squash);
        const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
        g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(0.85, 'rgba(255,110,30,0.22)'); g.addColorStop(1, 'rgba(255,200,90,0.55)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(255,170,60,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -q.t * 30;
        ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, 6.283); ctx.stroke();
        ctx.restore();
      } });
  }
  S.amii_s_burning_body = {
    start(G, p) {
      layer(G);
      const dur = +(cfg(p, 'amii_s_burning_body').args || '10;2').split(';')[0] || AM.dur;
      p.skillT = dur;
      const s = p._wlAm = { t: 0, acc: 0, stack: 0, gap: 0, extra: [], flame: 0, r: AM.r };
      setMul(p, 'moveMul', 'wl_amii', AM.move);
      circleProp(G, p, s);
      fx(G, 'warlock_skill_fire', p.x, p.y - 6, { follow: p, dy: -6 });
    },
    update(G, p, dt) {
      const s = p._wlAm; if (!s) return;
      s.t += dt; s.gap -= dt; s.acc += dt;
      s.r += (amR(s) - s.r) * Math.min(1, dt / AM.expand);
      while (s.acc >= AM.every) {
        s.acc -= AM.every;
        for (const e of inRadius(G, p.x, p.y, amR(s), amR(s) * AM.squash)) hit(G, p, e, AM.dmg, { tag: 'wl_fire', noMul: true, repel: 0 });
      }
      for (const c of s.extra) {
        c.t += dt; c.acc += dt;
        while (c.acc >= AM.every) { c.acc -= AM.every; for (const e of inRadius(G, c.x, c.y, AM.extraR)) hit(G, p, e, AM.extraDmg, { tag: 'wl_fire2', noMul: true, repel: 0 }); }
      }
      s.extra = s.extra.filter(c => c.t < AM.extraT);
    },
    // Bấm lại: hy sinh 2 Tiểu Quỷ, một loạt lửa 10 lên quái trong vòng; mỗi quái mở thêm vòng lửa nhỏ; vòng lớn thêm 15%, kéo dài, khiên 0,5 s.
    press(G, p) {
      const s = p._wlAm;
      if (!s || s.gap > 0 || demons(G, p).length < AM.cost) return;
      s.gap = AM.gap;
      hurtMods(p).wl_amii = () => 0; s.shieldT = AM.shield;
      let n = 0;
      sacrifice(G, p, AM.cost, () => ({ x: p.x, y: p.y - 6 }), () => {
        n++;
        if (n < AM.cost || !p._wlAm) return;
        p.skillT += AM.extend * AM.cost;
        s.stack = Math.min(AM.maxStack, s.stack + 1);
        for (const e of inRadius(G, p.x, p.y, amR(s), amR(s) * AM.squash)) {
          hit(G, p, e, AM.burst, { tag: 'wl_burst', noMul: true, repel: 2 });
          s.extra.push({ x: ec(e)[0], y: e.y, t: 0, acc: 0 });
          fx(G, 'Fire2_warlock_dead_fire_skin_0', ec(e)[0], e.y, { dur: AM.extraT });
        }
        fx(G, 'warlock_skill_fire', p.x, p.y - 6, { follow: p, dy: -6 });
      });
    },
    end(G, p) { p._wlAm = null; setMul(p, 'moveMul', 'wl_amii', 1); delete hurtMods(p).wl_amii; }
  };
  timers.wl_amii = (G, p, dt) => { const s = p._wlAm; if (s && s.shieldT > 0) { s.shieldT -= dt; if (s.shieldT <= 0) delete hurtMods(p).wl_amii; } };

  // ================================================================ Giúp Sức: Eligos
  // [ĐO C24Skill1Config warlock_eligos_config: eligosAttackDamageFactor 7, eligosAtkComboCount 2, eligosAtkComboCd 0,5, eligosAtkCd 2,5, eligosSkillComboDamageFactor 17,
  //  eligosFinalSkillComboDamageFactor 31, skillComboCount 3, waitTimeBetweenSkillCombo 0,13, skillComboMoveValue 3, skillComboMoveDuration 0,25, explodeDelay 0,9;
  //  ExplodeEligos damage 10, fire_rate 100, fireRange 5; C24Controller.DemonsToGetExtraSkillCombo 2, DemonGainEligosEnergy 1]
  // Cách Tiểu Quỷ nuôi Eligos (mỗi con = 1 năng lượng, đủ 2 thì đòn kế là combo kỹ năng) và nút nổ bấm lần hai là [ƯỚC LƯỢNG theo tên hàm/UI warlock_eligos_explode_ui].
  const EL = { atk: 7, combo: 2, comboGap: 0.5, cd: 2.5, skill: [17, 17, 31], skillGap: 0.13, move: 3 * U, moveT: 0.25, delay: 0.9, boom: 10, boomR: 5 * U, energyCombo: 2, reach: 10 * U, fly: 0.35 };   // tầm với [ƯỚC LƯỢNG]
  const eligosParts = () => SK.prefab('warlock_eligos_skin_0');
  function feedEligos(G, p, x, y, n) {
    const a = wl(p).eligos;
    const pt = { x, y: y - 6 };
    fx(G, 'warlock_eligos_skin_0_energy', x, y - 6, { follow: pt, dur: EL.fly + 0.2 });
    G.props.push({ x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; const k = Math.min(1, q.t / EL.fly);
        pt.x = x + (a.x - x) * k; pt.y = y - 6 + (a.y - 10 - (y - 6)) * k;
        if (k >= 1) { q.gone = true; a.energy += n; }
      } });
  }
  function eligosHit(G, p, a, e, dmg, tag) {
    if (!alive(e)) return;
    hit(G, p, e, dmg, { tag, repel: 2, fx: 'hit_red', ang: Math.atan2(ec(e)[1] - a.y, ec(e)[0] - a.x) });
  }
  function createEligos(G, p) {
    const w = wl(p);
    const a = w.eligos = addAlly(G, {
      eligos: true, x: p.x - 14 * p.face, y: p.y + 2, hp: 1, hpMax: 1, box: null, face: p.face, energy: 0, cd: 0, act: null, boom: 0, hover: 0,
      update(G2, a, dt) {
        a.hover += dt; a.cd -= dt;
        if (a.boom > 0) { a.boom -= dt; if (a.boom <= 0) return explode(G2, p, a); return; }
        if (a.act) return eligosAct(G2, p, a, dt);
        walk(G2, a, p.x - 32 * p.face, p.y + 4, 7 * U, dt);
        if (Math.hypot(a.x - p.x, a.y - p.y) > 20 * U) { a.x = p.x; a.y = p.y; }
        a.face = p.face;
        // Người chơi bấm đánh có quái trong tầm thì Eligos ra đòn (đòn thường mỗi 2,5 s; đủ năng lượng thì combo kỹ năng).
        if (a.pendingAtk && a.cd <= 0) {
          a.pendingAtk = false;
          const e = nearest(G2, p.x, p.y - 6, EL.reach, { los: true });
          if (!e) return;
          const sk = a.energy >= EL.energyCombo;
          if (sk) a.energy -= EL.energyCombo;
          a.act = { t: 0, e, sk, i: 0, from: { x: a.x, y: a.y } };
          a.cd = EL.cd;
        }
      },
      draw(ctx, G2, a) {
        const parts = eligosParts();
        ctx.save();   // activeAlpha 180/255 = màu 0,706 đã nằm trong từng nút prefab [ĐO PetWarlockEligosController]
        const y = a.y - 8 + Math.sin(a.hover * 3) * 1.5;
        if (parts) drawRip(ctx, parts, a.x, y + 8, { t: a.hover, flip: a.face < 0, state: 'idle', skip: n => /explode_paw/.test(n.n) });
        else { glow(ctx, a.x, y - 4, 14, [0.6, 0.15, 1, 1], 0.8); ctx.fillStyle = '#2a0f40'; ctx.beginPath(); ctx.ellipse(a.x, y, 7, 9, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ff5a5a'; ctx.fillRect(a.x - 3, y - 3, 2, 2); ctx.fillRect(a.x + 1, y - 3, 2, 2); }
        ctx.restore();
        if (a.energy > 0) SK.text(ctx, String(a.energy), a.x, a.y - 26, 7, '#c9a0ff', 'center', '#000');
      }
    });
    fx(G, 'warlock_skill_fire', a.x, a.y - 8, {});
    // Tiểu Quỷ đang có: hy sinh hết cho Eligos.
    for (const d of demons(G, p)) { d.used = true; d.box = null; d.fly = { t: 0, x0: d.x, y0: d.y, to: () => ({ x: a.x, y: a.y - 8 }), cb: () => { a.energy++; } }; }
    return a;
  }
  function eligosAct(G, p, a, dt) {
    const s = a.act; s.t += dt;
    const e = s.e;
    if (!alive(e)) { a.act = null; return; }
    const [tx, ty] = ec(e);
    // Lao tới sát mục tiêu rồi ra các đòn; xong thì quay về (walk lo).
    const gx = tx - Math.sign(tx - p.x || 1) * 12, gy = ty + 2;
    a.x += (gx - a.x) * Math.min(1, dt / EL.moveT * 3); a.y += (gy - a.y) * Math.min(1, dt / EL.moveT * 3);
    a.face = tx >= a.x ? 1 : -1;
    const seq = s.sk ? EL.skill : new Array(EL.combo).fill(EL.atk), gap = s.sk ? EL.skillGap : EL.comboGap, t0 = s.sk ? EL.moveT : 0.15;
    while (s.i < seq.length && s.t >= t0 + s.i * gap) { eligosHit(G, p, a, e, seq[s.i], s.sk ? 'wl_eligos_skill' : 'wl_eligos'); s.i++; }
    if (s.i >= seq.length && s.t > t0 + seq.length * gap) a.act = null;
  }
  SK.on('fire', (G, p) => { const a = p.hero === 'warlock' && wl(p).eligos; if (a && !a.gone) a.pendingAtk = true; });
  function explode(G, p, a) {
    a.gone = true; wl(p).eligos = null;
    fx(G, 'warlock_eligos_skin_0_explode', a.x, a.y - 4, {});
    G.shake = Math.max(G.shake, 4);
    for (const e of inRadius(G, a.x, a.y, EL.boomR)) { hit(G, p, e, EL.boom, { tag: 'wl_boom', repel: 4, noMul: true }); K.debuff(G, e, 'fire'); }
  }
  S.helping_hand_eligos = {
    start(G, p) {
      layer(G);
      const w = wl(p);
      if (w.eligos && !w.eligos.gone) { const a = w.eligos; if (!(a.boom > 0)) { a.boom = EL.delay; a.act = null; fx(G, 'warlock_eligos_skin_0_energy', a.x, a.y - 8, { follow: a, dy: -8, dur: EL.delay }); } return; }
      createEligos(G, p);
    },
    pressCd(G, p) { if (wl(p).eligos && !wl(p).eligos.gone) S.helping_hand_eligos.start(G, p); }
  };

  // ================================================================ Sự Bảo Vệ Của Amon
  // [ĐO C24Controller: Skill2MaxEnergy 50, Skill2Range 16, MoveSpeedValue 0,6; ExecuteSkill2: khiên = năng lượng / 10 giây (s16 = năng lượng ÷ 10);
  //  buff_warlock_skill_2 = BuffWarlockSkill2: enemyDamage 1 / enemyInterval 1, buff_time 99999]. 1 linh hồn mỗi nhịp rút và 5 linh hồn mỗi Tiểu Quỷ [ƯỚC LƯỢNG].
  // Chưa có: khiên cho đơn vị phe ta trong 16 ô (web chưa có đồng đội trúng khiên).
  const AN = { max: 50, sec: 10, move: 1.6, tick: 1, dmg: 1, perDemon: 5, fly: 0.5, range: 16 * U };
  const amonOn = p => p.h.skill && p.h.skill.id === 'amon_s_protection';
  DUR_UI.amon_s_protection = 5;
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'warlock' || !amonOn(p) || e._amon || !alive(e) || G._skHit === 'wl_amon' || G._skHit === 'dot') return;
    e._amon = { t: 0, h: fx(G, 'warlock_skill_2_skin_0_buff', e.x, e.y, { follow: e, dy: -e.hb.off[1] * e.scale, dur: 60 }) };
  });
  function soul(G, p, x, y) {
    const w = wl(p), pt = { x, y };
    const h = fx(G, 'warlock_skill_2_skin_0_energy', x, y, { follow: pt, dur: AN.fly + 0.3 });
    G.props.push({ x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; const k = Math.min(1, q.t / AN.fly);
        pt.x = x + (p.x - x) * k; pt.y = y + (p.y - 8 - y) * k;
        if (k >= 1) { q.gone = true; w.energy = Math.min(AN.max, w.energy + AN.perTick); if (h && h.stop) h.stop(); }
      } });
  }
  AN.perTick = 1;
  timers.wl_amon = (G, p, dt) => {
    if (p.hero !== 'warlock' || !amonOn(p)) return;
    for (const e of G.enemies) {
      const m = e._amon; if (!m) continue;
      if (!alive(e)) { if (m.h && m.h.stop) m.h.stop(); e._amon = null; continue; }
      m.t += dt;
      if (m.t >= AN.tick) { m.t -= AN.tick; hit(G, p, e, AN.dmg, { tag: 'wl_amon', noMul: true, repel: 0 }); soul(G, p, ec(e)[0], ec(e)[1]); }
    }
  };
  S.amon_s_protection = {
    start(G, p) {
      layer(G);
      const w = wl(p);
      // Tiểu Quỷ đi theo cũng hiến linh hồn khi thi triển.
      const n = demons(G, p).length;
      sacrifice(G, p, n, () => ({ x: p.x, y: p.y - 8 }), null);
      const t = Math.min(AN.max, w.energy + n * AN.perDemon) / AN.sec;
      if (!(t > 0)) { p._cdAfter = 0; return; }
      p.skillT = Math.max(0.3, t);
      w.energy = 0;   // tiêu hao tất cả linh hồn
      hurtMods(p).wl_amon = () => 0;
      setMul(p, 'moveMul', 'wl_amon', AN.move);
      p._amonFx = fx(G, 'warlock_skill_2_skin_0_buff', p.x, p.y - 8, { follow: p, dy: -8, dur: p.skillT });
    },
    end(G, p) { delete hurtMods(p).wl_amon; setMul(p, 'moveMul', 'wl_amon', 1); if (p._amonFx && p._amonFx.stop) p._amonFx.stop(); p._amonFx = null; }
  };
  // Vòng khiên vẽ quanh người (prefab khiên gốc chưa bóc thì vẽ đường viền màu tím).
  const drawPlayer0 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    drawPlayer0(ctx, G);
    const p = G.player;
    if (p && p.hero === 'warlock' && p.skillT > 0 && p.h.skill.id === 'amon_s_protection') {
      const parts = SK.prefab('warlock_skill_2_skin_0_shield');
      ctx.save(); ctx.globalAlpha *= 0.6 + 0.2 * Math.sin(G.t * 8);
      if (parts) drawRip(ctx, parts, p.x, p.y - 2, { t: G.t });
      else { ctx.strokeStyle = '#c090ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y - 8, 12, 15, 0, 0, 6.3); ctx.stroke(); }
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------- HUD: số Tiểu Quỷ / linh hồn cạnh nút kỹ năng
  SK.on('hud', (ctx, G) => {
    const p = G.player;
    if (!p || p.hero !== 'warlock' || G.state !== 'stage') return;
    const v = SK.view, cx = v.w - 16, cy = v.h - 17, w = wl(p);
    SK.text(ctx, demons(G, p).length + '/' + DEMON.max, cx - 9.5, cy - 20, 8, '#c9a0ff', 'center', '#000');
    if (amonOn(p)) SK.text(ctx, w.energy + '/' + AN.max, cx - 9.5, cy - 28, 8, '#7dffb0', 'center', '#000');
  });

  SK.warlock = { summon, state: wl, demons };   // cho ca kiểm
})();
