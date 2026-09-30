// Kỹ năng Lãnh chúa (c30, lớp C31Controller): battle_storm, resolute_rush, dark_sovereign. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số [ĐO] lấy từ config/skills + trường C31Controller (SK_SKILLS86.heroes.warliege.ctrlFields) + mã IL2CPP (tools/sk_method.py, nêu tên method).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, U = SK.PPU, I = SK.input;
  const { CTRL, cfg, fx, stopFx, ec, alive, inRadius, nearest, hit, targetAng, aimDir, hurtMods, layer, charges, useCharge, timers, debuff, ripFx, setMul } = K;
  const C = (k, d) => CTRL('warliege', k, d);
  const passiveOn = p => (SK.passiveOn ? SK.passiveOn(p) : true);
  const darkOn = p => p.h.skill && p.h.skill.id === 'dark_sovereign';

  // ---------------------------------------------------------------- nội tại Chiến Ý (buff 1011; AddFightSprite cần skill_strengthen)
  // [ĐO C31Controller.AddFightSprite] +1 mỗi đòn trúng, cách nhau ≥ 0,25 s (GainFightingSpriteMinDuration); trúng đòn thì cộng đúng số sát thương
  // nhận (GainFightingSpriteByHurt), nhận lần hai nếu giáp đã hết, không bị chặn nhịp; tối đa 20. Đủ 20 thì Sục Sôi: thời gian spriteSurgingLastTime 5 s
  // (Lãnh Chúa Hắc Ám: spriteSurgingLastTimeSkill2 5), Chiến Ý tụt tuyến tính 20 → 0 [<SpriteEnergyCosting>.MoveNext]. Trong Sục Sôi chỉ Lãnh Chúa
  // Hắc Ám còn nạp Chiến Ý, và nạp ngược vào năng lượng (tối đa 20); sau skill2PassiveExtraCostTime 5 s năng lượng tụt nhanh gấp 1 + skill2PassiveExtraCostRate 0,5
  // [<SpriteEnergyCostingSkill2>.MoveNext]. Sục Sôi [StartSpriteSurging]: máu tối đa +1 và hồi 1, tốc chạy +0,5 (ChangeSpeed), phòng ngự +1, tốc đánh ×atkSpeed 1,33;
  // Hắc Ám còn miễn thương 0,5 s lúc vào. Công thức phòng ngự (trừ phẳng, tối thiểu 1) theo quy ước chung các file kỹ năng: [ƯỚC LƯỢNG].
  const FS = { max: 20, gap: 0.25, speed: 0.5, def: 1 };
  const fs = p => p._fs || (p._fs = { n: 0, gap: 0, surge: false, dark: false, en: 0, t: 0, dying: false, dmg: 0, used: false, h: null, hname: null });
  const surging = p => !!(p._fs && p._fs.surge);
  const defOf = p => (surging(p) ? FS.def : 0) + (p._rushDef > 0 ? 3 : 0);
  function ensureDef(p) { hurtMods(p).wl_def = (G, pl, dmg) => (defOf(pl) > 0 ? Math.max(1, dmg - defOf(pl)) : dmg); }
  function addFs(G, p, v, hurt) {
    if (!passiveOn(p) || v <= 0) return;
    const s = fs(p);
    if (!hurt && s.gap > 0) return;
    s.gap = FS.gap;
    if (s.surge) {
      if (s.dark && !(hurt && s.dying)) s.en = Math.min(FS.max, s.en + v);
      return;
    }
    s.n = Math.min(FS.max, s.n + v);
    if (s.n >= FS.max) startSurge(G, p);
  }
  function startSurge(G, p) {
    const s = fs(p);
    s.surge = true; s.dark = !!darkOn(p); s.t = 0; s.en = FS.max; s.n = FS.max;
    p.hpMax += 1; p.hp = Math.min(p.hpMax, p.hp + 1);
    setMul(p, 'moveMul', 'wl_surge', 1 + FS.speed);
    setMul(p, 'rateMul', 'wl_surge', C('atkSpeed', 1.33));
    ensureDef(p);
    if (s.dark) p.invulT = Math.max(p.invulT || 0, 0.5);
  }
  function stopSurge(G, p) {
    const s = fs(p);
    if (!s.surge) return;
    s.surge = false; s.n = 0; s.en = 0; s.t = 0;
    p.hpMax -= 1; p.hp = Math.min(p.hp, p.hpMax);
    setMul(p, 'moveMul', 'wl_surge', 1);
    setMul(p, 'rateMul', 'wl_surge', 1);
  }
  timers.warliege = (G, p, dt) => {
    if (p.hero !== 'warliege') return;
    const s = fs(p);
    s.gap -= dt; p._dsAtk = (p._dsAtk || 0) - dt; p._rushDef = (p._rushDef || 0) - dt;
    if (s.surge) {
      s.t += dt;
      const per = FS.max / (s.dark ? C('spriteSurgingLastTimeSkill2', 5) : C('spriteSurgingLastTime', 5));
      s.en -= per * (s.dark && s.t > C('skill2PassiveExtraCostTime', 5) ? 1 + C('skill2PassiveExtraCostRate', 0.5) : 1) * dt;
      if (s.en <= 0) {
        const die = s.dying;
        s.dying = false;
        stopSurge(G, p);
        if (die) { p.hp = 1; p.armor = 0; p.invulT = 0; SK.hurtPlayer(G, 9999); }   // hết Sục Sôi mà chưa đủ sát thương thì chết [<SpriteEnergyCostingSkill2>: hp < 1 → Dead]
      }
    }
    const want = s.surge || s.n >= 1 ? (darkOn(p) ? 'warliege_fight_sprite_dark' : 'warliege_fight_sprite') : null;
    if (want !== s.hname) { stopFx(s.h); s.h = want ? fx(G, want, p.x, p.y, { follow: p, dy: -4 }) : null; s.hname = want; }
    const q = p._dsFly; if (q) flyQueue(G, p, q, dt);
  };
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player; if (!p || p.hero !== 'warliege') return;
    addFs(G, p, 1, false);
    const s = fs(p), hb = G._hitBullet;
    if (hb && hb._wlw) { hb.dmg = 10; hb._wlw = false; }   // đạn nhà ≥ needWeakenDamage 20 trúng thì còn minWeakenDamage 10 [ĐO WarliegeSwordStorm.WakenBullet + prefab warliege_roll]
    if (s.dying) { s.dmg += dmg; if (s.dmg >= C('maxDarkDamage', 233)) endDying(G, p); }   // [ĐO C31Controller.DarkSurgingDyingAddDamage]
  });
  SK.on('playerHurt', (G, p, dmg) => {
    if (p.hero !== 'warliege') return;
    addFs(G, p, dmg, true);
    if (p.armor <= 0) addFs(G, p, dmg, true);
  });
  SK.on('roomClear', G => { const p = G.player; if (p && p.hero === 'warliege' && fs(p).dying) endDying(G, p); });   // [ĐO C31Controller.OnRoomClear → EndDarkDying]
  SK.on('runStart', G => {
    const p = G.player; if (!p || p.hero !== 'warliege') return;
    p._fs = null; p._giant = null; p._dsUse = 0; p._dsDash = 0; p._dsQ = 0; p._dsFly = null; p._rushDef = 0;
    layer(G);
    // Hắc Ám Sắp Chết [ĐO C31Controller.Dead/StartDarkDying]: bị đòn chí mạng lúc Hắc Ám Cuộn Trào (một lần) thì chưa chết, năng lượng đầy lại;
    // gây đủ maxDarkDamage 233 sát thương (hoặc dọn xong phòng) trước khi hết Sục Sôi thì hồi sinh 1 máu + miễn thương 1 s. Chưa đọc chỗ đặt lại _darkDyingUsed: coi là một lần mỗi ván [ƯỚC LƯỢNG].
    hurtMods(p).wl_dying = (G2, pl, dmg) => {
      const s = fs(pl);
      if (s.dying) return 0;
      if (!(s.surge && s.dark && !s.used && passiveOn(pl))) return dmg;
      const eff = defOf(pl) > 0 ? Math.max(1, dmg - defOf(pl)) : dmg;
      if (eff - Math.min(pl.armor, eff) < pl.hp) return dmg;
      s.used = true; s.dying = true; s.dmg = 0; s.en = FS.max;
      pl.hp = 1; pl.armor = 0;
      SK.num(G2, pl.x, pl.y - 30, '!', '#b070ff');
      return 0;
    };
    ensureDef(p);   // đứng sau wl_dying: chí mạng tính trên sát thương thô
  });
  function endDying(G, p) {
    const s = fs(p);
    s.dying = false; s.dmg = 0;
    p.hp = Math.max(p.hp, 1); p.invulT = Math.max(p.invulT || 0, 1);
  }

  // ---------------------------------------------------------------- Bão Chiến Ý
  // [ĐO c30/skill 1: cd 12, duration 6; C31Controller: Skill0CastTime 5, skill0Damage 6 / SurgingDamage 7, nhịp 0,33 s / 0,25 s khi Sục Sôi (Skill0AtkDuration);
  // bán kính bão = Skill0StormCatchBulletSize 2,75 (Sục Sôi 3,5) đơn vị; WarliegeSwordStorm.FixedUpdate: bắt mọi đạn (cả đạn nhà, trừ đạn cận chiến/quỹ đạo) chạm vòng tròn,
  // giữ quay quanh; đạn nhà chỉ giữ tối đa maxSelfBullet 20 (vượt thì nhả viên cũ nhất); nhả = bay tiếp theo hướng đang quay với tốc độ cũ (BulletLeaveStorm);
  // nhiễm nguyên tố (lửa/điện/băng/độc) của đạn đã bắt cho quái trong bão. Vòng nhả theo tiếp tuyến, tốc quay quỹ đạo và va chạm gây sát thương lấy cùng bán kính: [ƯỚC LƯỢNG].
  const STORM = { cast: 5, orbit: 4.5, selfMax: 20, weaken: 20 };
  const ELE = { 1: 'fire', 2: 'ice', 3: 'ele', 4: 'poison' }, ELE_NODE = { fire: 'fire', ice: 'ice', ele: 'lightning', poison: 'poison' };
  const stormR = p => (surging(p) ? 3.5 : 2.75) * U;
  function release(b) {
    const w = b._wl; if (!w) return;
    const a = w.a + Math.PI / 2;
    b.vx = Math.cos(a) * w.sp; b.vy = Math.sin(a) * w.sp; b.ang = a; delete b._wl;
  }
  function holdBullets(G, p, s, dt) {
    const cx = p.x, cy = p.y - 7, R = stormR(p);
    for (const b of G.bullets) {
      if (b.dead || b._wl || b.melee || b.orbit || b.area || b.vis || b.gz) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 1 || Math.hypot(b.x - cx, b.y - cy) > R + (b.r || 0)) continue;
      b._wl = { a: Math.atan2(b.y - cy, b.x - cx), sp };
      if (b.side === 'p') {
        if (b.dmg >= STORM.weaken) b._wlw = true;
        s.selfQ.push(b);
        if (s.selfQ.length > STORM.selfMax) release(s.selfQ.shift());
      } else for (const m of Object.values((b.B && b.B.m) || {})) if (m && ELE[m.elementalType]) s.ele[ELE[m.elementalType]] = 1;
      s.held.push(b);
    }
    s.held = s.held.filter(b => !b.dead && b._wl);
    s.selfQ = s.selfQ.filter(b => !b.dead && b._wl);
    for (const b of s.held) {
      b._wl.a += STORM.orbit * dt;
      // gặp tường thì co quỹ đạo lại: đạn nằm trong tường là vỡ
      for (let k = 0.7; k > 0; k -= 0.2) {
        b.x = cx + Math.cos(b._wl.a) * R * k; b.y = cy + Math.sin(b._wl.a) * R * k * 0.7;
        if (!W.solidAt(G.map, b.x, b.y + (b.h || 0))) break;
      }
      b.vx = 0; b.vy = 0; b.life = Math.max(b.life, 1); b.ang = b._wl.a + Math.PI / 2;
    }
  }
  function letGo(s) { for (const b of s.held) release(b); s.held = []; s.selfQ = []; }
  S.battle_storm = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'battle_storm').dur || 6;
      const s = p._storm = { t: 0, atk: 0, ele: {}, held: [], selfQ: [], closed: false, shown: {} };
      s.h = fx(G, 'warliege_roll', p.x, p.y, { follow: p, dy: -7, dur: p.skillT });
    },
    update(G, p, dt) {
      const s = p._storm; if (!s) return;
      s.t += dt;
      if (s.t >= STORM.cast) { if (!s.closed) { s.closed = true; letGo(s); stopFx(s.h); } return; }
      holdBullets(G, p, s, dt);
      if (s.h && s.h.nodes) for (const k in s.ele) if (!s.shown[k]) { s.shown[k] = 1; const nd = s.h.nodes.find(q => q.d.n === ELE_NODE[k]); if (nd) nd.on = true; }
      s.atk -= dt;
      if (s.atk > 0) return;
      const fast = surging(p);
      s.atk = fast ? 0.25 : 0.33;
      const dmg = fast ? C('skill0SurgingDamage', 7) : C('skill0Damage', 6);
      for (const e of inRadius(G, p.x, p.y - 7, stormR(p))) {
        hit(G, p, e, dmg, { critChance: p.crit, repel: 1, tag: 'storm' });
        for (const k in s.ele) debuff(G, e, k);
      }
    },
    end(G, p) { const s = p._storm; p._storm = null; if (s) { letGo(s); stopFx(s.h); } }
  };

  // ---------------------------------------------------------------- Quyết Tâm Xung Phong
  // [ĐO c30/skill 2: cd 4,5 mỗi lượt, maxCount 3, duration 6; C31Controller.RoleSkill1: miễn thương 0,25 s (StartHitTrigger), phòng ngự +3 trong dashTime 0,4 s
  // (+1 s nếu đang Sục Sôi) (ChangeDefenceTemp), +1 Chiến Ý, lực lao dashDistance 65 (AddForce), dashTime 0,4, dashDamage 6 (dashSize 2,25);
  // Skill1DashEnd: hammerDamage 8 (hammerSize 1,75, bullet_hammer_warliege); WarliegePhantom (prefab warliege_phantom): damageFactor 1, sizeFactor 1,2 (1,1 lúc Sục Sôi),
  // sao chép vũ khí của Lãnh chúa và ra đòn mỗi khi Lãnh chúa đánh]. Quãng lướt (lực 65 không đổi ra quãng nếu chưa đọc ma sát), vùng trúng và nhịp Người Khổng Lồ: [ƯỚC LƯỢNG].
  const RUSH = { dist: 7 * T, r: 1.2 * T, hammerR: 2.5 * T, atkGap: 0.35, range: 8 * T };
  S.resolute_rush = {
    start(G, p) {
      layer(G);
      charges(p, 'resolute_rush'); useCharge(p, 'resolute_rush');
      const tm = C('dashTime', 0.4), ang = aimDir(p);
      p.skillT = tm;
      p._rush = { ang, v: RUSH.dist / tm, hit: [] };
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      p.invulT = Math.max(p.invulT || 0, 0.25);
      p._rushDef = tm + (surging(p) ? 1 : 0);
      ensureDef(p);
      addFs(G, p, 1, false);
      const life = surging(p) ? Math.max(fs(p).en / (FS.max / C('spriteSurgingLastTime', 5)), 0.5) : (cfg(p, 'resolute_rush').dur || 6);
      const g = p._giant;
      if (g) stopFx(g.h);
      p._giant = { t: 0, life, gap: 0, h: fx(G, 'warliege_phantom', p.x, p.y, { follow: p, dur: life + 0.2 }), tillSurge: surging(p) };
      fx(G, 'warliege_dash', p.x, p.y, { follow: p, dy: -7, dur: tm, ang });
    },
    update(G, p, dt) {
      const s = p._rush; if (!s) return;
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.moveMul || 1) * dt;
      SK.moveBox(G.map, p, Math.cos(s.ang) * s.v * dt - mv.x * walkPx, Math.sin(s.ang) * s.v * dt - mv.y * walkPx, p.h.body.r);
      for (const e of inRadius(G, p.x, p.y - 7, RUSH.r)) if (s.hit.indexOf(e) < 0) { s.hit.push(e); hit(G, p, e, C('dashDamage', 6), { critChance: p.crit, ang: s.ang, repel: 2, fx: 'hit_white_large', tag: 'rush' }); }
    },
    end(G, p) {
      const s = p._rush; p._rush = null;
      if (!s) return;
      fx(G, 'bullet_hammer_warliege', p.x + Math.cos(s.ang) * 14, p.y - 4, { scale: C('hammerSize', 1.75) / 1.75 });
      G.shake = Math.max(G.shake, 3);
      for (const e of inRadius(G, p.x + Math.cos(s.ang) * 14, p.y - 4, RUSH.hammerR)) hit(G, p, e, C('hammerDamage', 8), { critChance: p.crit, ang: s.ang, repel: 3, tag: 'rush' });
    }
  };
  // Người Khổng Lồ: hết hạn (hoặc hết Sục Sôi nếu gọi lúc đó) thì biến mất; mỗi đòn của Lãnh chúa kéo theo một đòn của bản sao vũ khí, sát thương = vũ khí × damageFactor 1.
  timers.warliege_giant = (G, p, dt) => {
    const g = p._giant; if (!g) return;
    g.t += dt; g.gap -= dt;
    if (g.t >= g.life || (g.tillSurge && !surging(p))) { stopFx(g.h); p._giant = null; }
  };
  SK.on('fire', (G, p, w) => {
    const g = p.hero === 'warliege' && p._giant;
    if (!g || g.gap > 0) return;
    const e = nearest(G, p.x, p.y - 7, RUSH.range, { los: true }); if (!e) return;
    g.gap = RUSH.atkGap;
    const [x, y] = ec(e);
    fx(G, 'bullet_hammer_warliege', x, y, { scale: 0.7 });
    const dmg = Math.max(1, Math.round(((w && w.def && w.def.dmg) || 4) * 1));
    for (const t of inRadius(G, x, y, RUSH.hammerR * 0.6)) hit(G, p, t, dmg, { critChance: p.crit, repel: 2, tag: 'giant' });
  });

  // ---------------------------------------------------------------- Lãnh Chúa Hắc Ám
  // [ĐO c30/skill 3: cd 2,5 mỗi lượt, maxCount 3, duration 1; C31Controller: StartSkill2: _skill2UseCount tăng 1 mỗi lần, dưới 3 thì chém đúng số lần đó, lần thứ ba (đặt lại 0)
  // chém 2 nhát rồi vòng xoay (ProcessSkill2RangeSlash); sát thương = gốc + skill2ExtraDamage 1 × useCount (0 tính là 3) [CreateSkill2Slash/CreateRangeSlash]: nhát 8 + 1/2/3,
  // vòng skill2CircleDamage 12 + 3; khoảng nhát max(0,1; 0,25 / tốc đánh) [.ctor _baseSlashInterval 0,25, _minSlashInterval 0,1]; ChangeSpeed +0,5 trong 1 s;
  // bấm K khi đang chém thì xếp hàng lần chém kế (RoleSkill2 → _inQueuedSkillCount, EndSkill2 chạy tiếp); mỗi nhát cộng 1 Chiến Ý.
  // Sục Sôi: bấm K = Skill2Dash: useCount đặt 3, _skill2DashCount tăng, miễn thương 0,5 s; lần 1-2 lao (lực skill2NormalDashForce 60) nhát xoay skill2DashDamage 6 + 1 × dashCount (sizeDarkSlash 1,25),
  // lần 3 nhảy (lực 70) và đáp đất bằng vòng skill2CircleDamage 12 (sizeDarkSlashRange 0,85) + nhát skill2JumpSlashDamage 4 (sizeJumpSlash 1);
  // mỗi đòn đánh thường (cách max(0,25; 0,5 / tốc đánh), Skill2DarkSwordAtk) lại chạy chuỗi nhát ấy, mỗi nhát thành 3 Trảm Kích bay 0°/±45° (CreateFlySlash: skill2FlyDamage 3 + 1 × useCount,
  // flySpeed 20, sizeDarkSlashFly 1,5) và không cộng Chiến Ý]. Tầm chém (kích cỡ × 2 ô), quãng lao / nhảy, thời gian tồn tại Trảm Kích và điều kiện đầy hàng đợi (mã so
  // _inQueuedSkillCount với skillInfo.count, chiều so ngược ý nghĩa; lấy "hàng đợi < lượt còn lại"): [ƯỚC LƯỢNG].
  const DS = { half: 1.3, tile: 2 * T, dash: 6 * T, dashT: 0.25, jump: 7 * T, jumpT: 0.5, flyLife: 0.8, atkGap: 0.5, atkMin: 0.25 };
  const slashGap = p => Math.max(0.1, 0.25 / (p.rateMul || 1));
  const useMul = m => (m || 3) * C('skill2ExtraDamage', 1);
  function slashHit(G, p, ang, reach, dmg, tag) {
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = x - p.x, dy = y - (p.y - 7), d = Math.hypot(dx, dy);
      if (d > reach + e.r) continue;
      let da = Math.abs(Math.atan2(dy, dx) - ang); if (da > Math.PI) da = 2 * Math.PI - da;
      if (d < 12 || da < DS.half) hit(G, p, e, dmg, { critChance: p.crit, ang, repel: 2, tag, fx: 'hit_white_large' });
    }
  }
  function circleHit(G, p, x, y, r, dmg, tag) {
    for (const e of inRadius(G, x, y, r)) hit(G, p, e, dmg, { critChance: p.crit, repel: 3, tag, fx: 'hit_white_large' });
  }
  const sweep = (G, p, name, ang, size, flipRev) => ripFx(G, name, p.x + Math.cos(ang) * 6, p.y - 7 + Math.sin(ang) * 6, { top: true, rot: Math.cos(ang) < 0 ? ang + Math.PI : ang, flip: Math.cos(ang) < 0 !== !!flipRev, scale: size / 2, dur: 0.35 });
  // Chuỗi nhát theo lần dùng: [{ t, circle?, rev? }]; lần ≥ 3 là hai nhát rồi vòng xoay.
  function combo(p, n, gap) {
    const range = n >= 3, q = [];
    for (let i = 0; i < (range ? 2 : n); i++) q.push({ t: 0.1 + i * gap, rev: i % 2 === 1 });
    if (range) q.push({ t: 0.1 + 2 * gap, circle: true });
    return { q, m: range ? 3 : n };
  }
  function fly(G, p, ang, dmg) {
    const sz = C('sizeDarkSlashFly', 1.5), spd = C('flySpeed', 20) * U;
    for (const off of [0, Math.PI / 4, -Math.PI / 4]) {
      const a = ang + off, hits = [], b = { x: p.x, y: p.y - 7, t: 0 };
      G.props.push({
        x: b.x, y: 1e9,
        update(G2, q, dt) {
          b.t += dt; b.x += Math.cos(a) * spd * dt; b.y += Math.sin(a) * spd * dt;
          for (const e of inRadius(G2, b.x, b.y, sz * T)) if (hits.indexOf(e) < 0) { hits.push(e); hit(G2, p, e, dmg, { critChance: p.crit, ang: a, repel: 1, tag: 'dark', fx: 'hit_white_large' }); }
          if (b.t > DS.flyLife || W.solidAt(G2.map, b.x, b.y + 7)) q.gone = true;
        },
        draw(ctx) { const parts = SK.prefab('fly_slash'); if (parts) SK.drawRip(ctx, parts, b.x, b.y, { rot: a, scale: sz / 1.5 }); }
      });
    }
  }
  // Hàng chờ Trảm Kích bay của các đòn đánh thường lúc Hắc Ám Cuộn Trào.
  function flyQueue(G, p, s, dt) {
    s.t += dt;
    while (s.q.length && s.t >= s.q[0].t) {
      const sl = s.q.shift();
      if (sl.circle) {
        ripFx(G, 'sword_sweep_circle', p.x, p.y - 7, { top: true, scale: C('sizeDarkSlashRange', 0.85) / 2, dur: 0.4 });
        circleHit(G, p, p.x, p.y - 7, C('sizeDarkSlashRange', 0.85) * DS.tile, C('skill2CircleDamage', 12) + useMul(s.m), 'dark');
      } else fly(G, p, s.ang, C('skill2FlyDamage', 3) + useMul(s.m));
    }
    if (!s.q.length) p._dsFly = null;
  }
  S.dark_sovereign = {
    start(G, p) {
      layer(G);
      charges(p, 'dark_sovereign'); useCharge(p, 'dark_sovereign');
      const { e, ang } = targetAng(G, p, 12 * T);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      p._ds = { t: 0, q: [], dash: null };
      if (surging(p)) {
        // Hắc Ám Cuộn Trào: Skill2Dash. Lần thứ ba nhảy lên chém mục tiêu.
        p._dsUse = 3;
        const dc = p._dsDash = (p._dsDash || 0) + 1, jump = dc > 2;
        if (jump) p._dsDash = 0;
        const tm = jump ? DS.jumpT : DS.dashT, dist = jump ? DS.jump : DS.dash;
        const d = e ? Math.min(dist, Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y)) : dist;
        p.skillT = tm;
        p.invulT = Math.max(p.invulT || 0, 0.5);
        p._ds.dash = { ang, v: d / tm, tm, t: 0, jump, hit: [], dmg: C('skill2DashDamage', 6) + dc * C('skill2ExtraDamage', 1) };
        if (!jump) ripFx(G, 'sword_sweep_dash_circle', p.x, p.y - 7, { follow: p, top: true, scale: C('sizeDarkSlash', 1.25) / 2, dur: tm + 0.2 });
      } else {
        const n = (p._dsUse = (p._dsUse || 0) + 1), c = combo(p, n, slashGap(p));
        if (n >= 3) p._dsUse = 0;
        p.skillT = cfg(p, 'dark_sovereign').dur || 1;
        setMul(p, 'moveMul', 'wl_s2', 1.5);
        p._ds.q = c.q.map(x => Object.assign({ ang, m: c.m }, x));
      }
    },
    update(G, p, dt) {
      const s = p._ds; if (!s) return;
      const dsh = s.dash;
      if (dsh) {
        dsh.t += dt;
        const mv = I.moveVec(), walkPx = p.h.speed * U * (p.moveMul || 1) * dt;
        SK.moveBox(G.map, p, Math.cos(dsh.ang) * dsh.v * dt - mv.x * walkPx, Math.sin(dsh.ang) * dsh.v * dt - mv.y * walkPx, p.h.body.r);
        p._liftY = dsh.jump ? Math.sin(Math.min(1, dsh.t / dsh.tm) * Math.PI) * 22 : 0;
        if (!dsh.jump) {
          const r = C('sizeDarkSlash', 1.25) * DS.tile;
          for (const e of inRadius(G, p.x, p.y - 7, r)) if (dsh.hit.indexOf(e) < 0) { dsh.hit.push(e); hit(G, p, e, dsh.dmg, { critChance: p.crit, ang: dsh.ang, repel: 2, tag: 'dash', fx: 'hit_white_large' }); }
        }
        return;
      }
      s.t += dt;
      while (s.q.length && s.t >= s.q[0].t) {
        const sl = s.q.shift();
        if (sl.circle) {
          const sz = C('sizeNormalRange', 2);
          ripFx(G, 'sword_sweep_circle', p.x, p.y - 7, { top: true, scale: sz / 2, dur: 0.4 });
          circleHit(G, p, p.x, p.y - 7, sz * DS.tile, C('skill2CircleDamage', 12) + useMul(sl.m), 'dark');
        } else {
          const sz = C('sizeNormalSlash', 2.5);
          sweep(G, p, 'sword_sweep', sl.ang, sz, sl.rev);
          slashHit(G, p, sl.ang, sz * DS.tile, C('skill2SlashDamage', 8) + useMul(sl.m), 'dark');
        }
        addFs(G, p, 1, false);
        G.shake = Math.max(G.shake, 2);
      }
    },
    // Bấm K khi đang chém (không phải lao): xếp một lần dùng kế tiếp, tối đa bằng số lượt còn lại.
    press(G, p) {
      if (surging(p) || p._ds && p._ds.dash) return;
      const q = p._dsQ || 0;
      if (q < charges(p, 'dark_sovereign').n) p._dsQ = q + 1;
    },
    end(G, p) {
      const s = p._ds; p._ds = null; p._liftY = 0;
      setMul(p, 'moveMul', 'wl_s2', 1);
      if (s && s.dash && s.dash.jump) {
        // Đáp đất: vòng xoay skill2CircleDamage + nhát nhảy skill2JumpSlashDamage [ĐO CreateJumpEndSlash / CreateDashEffect].
        circleHit(G, p, p.x, p.y - 7, C('sizeDarkSlashRange', 0.85) * DS.tile, C('skill2CircleDamage', 12), 'dark');
        fx(G, 'bullet_hammer_warliege', p.x, p.y - 4, { scale: 0.8 });
        circleHit(G, p, p.x, p.y - 4, C('sizeJumpSlash', 1) * DS.tile * 1.5, C('skill2JumpSlashDamage', 4), 'dark');
        G.shake = Math.max(G.shake, 3);
      }
      if (p._dsQ > 0 && !surging(p)) {
        p._dsQ--;
        if (charges(p, 'dark_sovereign').n > 0) S.dark_sovereign.start(G, p);
      } else p._dsQ = 0;
    }
  };
  // Hắc Ám Cuộn Trào: mỗi đòn đánh thường chạy chuỗi nhát của Đại Kiếm Hắc Ám dưới dạng Trảm Kích bay [ĐO C31Controller.Skill2DarkSwordAtk].
  SK.on('fire', G => {
    const p = G.player;
    if (!p || p.hero !== 'warliege' || !darkOn(p) || !surging(p) || p._dsAtk > 0 || p._dsFly) return;
    p._dsAtk = Math.max(DS.atkMin, DS.atkGap / (p.rateMul || 1));
    const n = (p._dsUse = (p._dsUse || 0) + 1), c = combo(p, n, slashGap(p));
    if (n >= 3) p._dsUse = 0;
    p._dsFly = { t: 0, m: c.m, ang: targetAng(G, p, 14 * T).ang, q: c.q };
  });
})();
