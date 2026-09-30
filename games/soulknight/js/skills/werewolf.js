// Kỹ năng Người Sói (c09): devour. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, I = SK.input;
  const { fx, stopFx, hit, alive, ec, inRadius, layer, setMul } = K;

  // Nuốt Chửng [ĐO c09/skill 3: cd 5.5, dur 0; C10Controller: skill2ChargeThreshold 0.3, skill2AbsorbBigDelay 1.75, skill2AbsorbBigScale 1.2,
  // skill2MaxChargeTime 5, skill2AbsorbMoveSpeed -3.5, skill2AbsorbRadius 6, skill2AbsorbMaxTargets 2, trapezoidWidthStart/End 2/6;
  // Skill2Info: maxMonsterCount 3, bullets 4/8/12 (speed 14/16/18, size .6/.9/1.25, crit 10, throughCount 10); skin0.eatDelay 0.15]:
  // bấm nhanh = lao tới nuốt một quái (hồi máu + năng lượng, trượt thì hồi chiêu ngắn hơn); giữ = tụ lực hút quái và đạn phía trước;
  // quái bị nuốt thành "Đạn Quái" (tối đa 3), nút đặc biệt (phím L) bắn viên mới nhất.
  // Nhả nút (bấm nhanh hay sau khi giữ) là lúc nuốt [ĐO C10Controller.RoleSkill2 → RoleSkill2ShortPress → StartEat/Eat]: lao tới, nuốt tối đa
  // 1 quái (2 nếu đã tụ lực lớn) trong hình thang dài 2R+1.75, đồng thời quái khác trong bán kính R chịu 10 sát thương.
  const DV = {
    thr: 0.3, big: 1.75, bigScale: 1.2, max: 5, slow: 3.5, radius: 6 * U, targets: 2, wStart: 2 * U, wEnd: 6 * U, eatDelay: 0.15,   // [ĐO C10Controller]
    baseR: 2 * U, chargeR: 1.5 * U, reachPad: 1.75 * U,   // R = 2 ô (+ cấp/30, cấp 0) + 1,5 × tỉ lệ tụ lực; tầm nuốt = 2R + 1,75 [ĐO StartEat/Eat]
    forceMin: 4, forceMax: 26, forceNoTarget: 30, forceDist: 0.1 * U,   // lao: lực 4 + 26 × d/(R+1,75), không mục tiêu 30; quãng = lực × 0,1 ô [ĐO StartEat, GetSkill2EatForceBeforeWall]
    pull: 5 * U,     // hút: AddForce lên Rigidbody2D (absorbForce 50, giảm còn 0,4 ở mép) nên tốc thật tuỳ khối lượng/ma sát prefab [ƯỚC LƯỢNG]
    missCd: 1,       // trượt: this_skill_time = skillCd - 1, tức còn 1 s hồi chiêu [ĐO Eat]
    aoe: 10, bossDmg: 30,   // ProcessSkillDamage(10) lên quái quanh [ĐO Eat]; trùm bị 30 sát thương [ĐO RGEBossController.EatenBy]
    reward: [[2, 5], [3, 10], [4, 15]],   // [máu, năng lượng] theo rank quái; gốc cộng thêm cấp/5 và cấp [ĐO DelayEat: bảng {2,3,4,4} và {5,10,15,15}]
    maxMon: 3        // [ĐO Skill2Info.maxMonsterCount]
  };
  const BUL = [0, 1, 2].map(i => ({ dmg: [4, 8, 12][i], spd: [14, 16, 18][i], size: [0.6, 0.9, 1.25][i], crit: 10, thr: 10 }));   // [ĐO Skill2Info.default/elite/bossBullet]

  const st = p => p._dv || (p._dv = { mons: [], mode: null, hold: 0, ate: 0 });
  const mine = p => p.hero === 'werewolf' && p.h.skill && p.h.skill.id === 'devour';
  const tierOf = e => (e.bossKey ? 2 : e.elite ? 1 : 0);
  const aimAng = (G, p) => K.targetAng(G, p, 14 * U).ang;

  function eat(G, p, s, e) {
    const t = tierOf(e), [hp, en] = DV.reward[t];
    K.heal(G, p, hp);
    p.energy = Math.min(p.energyMax, p.energy + en);
    s.mons.push({ tier: t, id: e.id });
    if (s.mons.length > DV.maxMon) s.mons.splice(DV.maxMon - 1, s.mons.length - DV.maxMon);   // hết ô: viên mới thay viên cuối [WIKI]
    s.ate++;
    const [cx, cy] = ec(e);
    fx(G, 'hit_red', cx, cy, {});
    if (SK.sfx) SK.sfx.play('fx_wolf_eat');
    if (t === 2) { hit(G, p, e, DV.bossDmg, { noMul: true, tag: 'devour' }); return; }   // trùm không bị nuốt, chịu 30 sát thương [ĐO RGEBossController.EatenBy]
    e.hp = 1; G._skHit = 'devour'; SK.hurtEnemy(G, e, 1, false, 0, 0); G._skHit = null;
    e.draw = () => {}; e._eaten = true;   // bị nuốt là biến mất: không để xác
  }
  const eatR = ratio => DV.baseR + DV.chargeR * ratio;
  // Hình thang phía trước theo hướng ang, dài L, rộng wStart → wEnd; trả quái hợp lệ, gần nhất trước [ĐO IsInTrapezoid, FindSkill2EatTargets].
  function coneTargets(G, p, ang, L) {
    const c = Math.cos(ang), sn = Math.sin(ang), ox = p.x, oy = p.y - 8;
    return G.enemies.filter(e => {
      if (!alive(e) || e.p.kinematic) return false;
      const [cx, cy] = ec(e), dx = cx - ox, dy = cy - oy, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      return u > -6 && u < L && Math.abs(v) < (DV.wStart + (DV.wEnd - DV.wStart) * Math.max(0, u) / L) / 2 + e.r;
    }).sort((a, b) => Math.hypot(a.x - ox, a.y - oy) - Math.hypot(b.x - ox, b.y - oy));
  }
  // Nuốt n quái gần nhất trong hình thang; quái khác trong bán kính R chịu sát thương [ĐO Eat].
  function eatNow(G, p, s, ang, ratio, n) {
    const R = eatR(ratio), es = coneTargets(G, p, ang, 2 * R + DV.reachPad).slice(0, n);
    es.forEach(e => eat(G, p, s, e));
    for (const e of inRadius(G, p.x, p.y - 8, R)) if (es.indexOf(e) < 0 && alive(e)) hit(G, p, e, DV.aoe, { noMul: true, repel: 3, fx: 'hit_red', tag: 'devour' });
  }

  function finish(G, p, s) {
    setMul(p, 'moveMul', 'devour', 1);
    stopFx(s.fxState); stopFx(s.fxAbsorb); s.fxState = s.fxAbsorb = null;
    s.mode = null;
    if (!s.ate) p._cdAfter = DV.missCd;     // trượt: còn 1 s hồi chiêu
    p.skillT = 0.0001;
  }
  // Nhả nút: lao tới mục tiêu rồi nuốt; tụ lực lớn thì R lớn hơn và nuốt 2 quái [ĐO StartEat, Eat].
  function beginLunge(G, p, s, ratio, big) {
    stopFx(s.fxState); stopFx(s.fxAbsorb); s.fxState = s.fxAbsorb = null;
    setMul(p, 'moveMul', 'devour', 1);
    const t = K.targetAng(G, p, 8 * U), R = eatR(ratio), es = coneTargets(G, p, t.ang, 2 * R + DV.reachPad);
    const d = es.length ? Math.hypot(es[0].x - p.x, es[0].y - 8 - p.y) : 0;
    const force = es.length ? DV.forceMin + DV.forceMax * Math.min(1, d / (R + DV.reachPad)) : DV.forceNoTarget;
    Object.assign(s, { mode: 'lunge', t: 0, ang: t.ang, dist: force * DV.forceDist, ratio, n: big ? DV.targets : 1 });
    p.aim = t.ang; p.face = Math.cos(t.ang) >= 0 ? 1 : -1;
    fx(G, 'sword_bit_eat', p.x + Math.cos(t.ang) * 12, p.y - 8 + Math.sin(t.ang) * 12, { ang: t.ang, flip: Math.cos(t.ang) < 0 });
  }
  function beginCharge(G, p, s) {
    s.mode = 'charge'; s.big = false;
    s.mouth = { x: p.x, y: p.y - 8, ang: p.aim };
    setMul(p, 'moveMul', 'devour', Math.max(0.2, (p.h.speed - DV.slow) / p.h.speed));
    s.fxState = fx(G, 'effect_c10_skill_2_state', p.x, p.y, { follow: p, dur: 60 });
    s.fxAbsorb = fx(G, 'asorb_effect', p.x, p.y - 8, { follow: s.mouth, dur: 60 });
    if (SK.sfx) SK.sfx.play('fx_absorb_start');
  }
  // Vùng hút hình thang phía trước: rộng wStart ở miệng, wEnd ở đầu xa; sau big giây tụ lực dài ×1.2 và nuốt cùng lúc 2 mục tiêu.
  function chargeTick(G, p, s, dt) {
    s.hold += dt;
    if (!s.big && s.hold >= DV.big) { s.big = true; fx(G, 'effect_c10_skill_2_state', p.x, p.y, { follow: p, dur: 0.4, scale: 1.2 }); }
    const ang = aimAng(G, p), c = Math.cos(ang), sn = Math.sin(ang), L = DV.radius * (s.big ? DV.bigScale : 1);
    const m = s.mouth; m.x = p.x + c * 8; m.y = p.y - 8 + sn * 8; m.ang = ang;
    p.aim = ang; p.face = c >= 0 ? 1 : -1;
    const local = (x, y) => { const dx = x - m.x, dy = y - m.y; return [dx * c + dy * sn, -dx * sn + dy * c]; };
    const inZone = (x, y, r) => { const [u, v] = local(x, y); return u > -6 && u < L && Math.abs(v) < (DV.wStart + (DV.wEnd - DV.wStart) * Math.max(0, u) / L) / 2 + r; };
    for (const e of G.enemies) {
      if (!alive(e) || e.bossKey || e.p.kinematic) continue;
      const [cx, cy] = ec(e);
      if (!inZone(cx, cy, e.r)) continue;
      const d = Math.hypot(m.x - cx, m.y - cy);
      if (d > e.r + 8) SK.moveBox(G.map, e, (m.x - cx) / d * DV.pull * dt, (m.y - cy) / d * DV.pull * dt, e.r);
    }
    for (const b of G.bullets) {   // đạn địch trong vùng hút bị kéo vào miệng và nuốt luôn
      if (b.side !== 'e' || b.dead || !inZone(b.x, b.y, b.r)) continue;
      const d = Math.hypot(m.x - b.x, m.y - b.y);
      if (d < 8) { b.dead = true; continue; }
      b.x += (m.x - b.x) / d * DV.pull * 1.6 * dt; b.y += (m.y - b.y) / d * DV.pull * 1.6 * dt; b.vx = b.vy = 0;
    }
    if (s.hold >= DV.max || !I.down('skill')) beginLunge(G, p, s, Math.min(1, s.hold / DV.max), s.big);   // nhả (hoặc đủ 5 s) là nuốt
  }

  function shootMonster(G, p) {
    const s = st(p);
    if (!mine(p) || !s.mons.length || p.st === 'dead') return false;
    const m = s.mons.pop(), B = BUL[m.tier], ang = aimAng(G, p), x = p.x + Math.cos(ang) * 10, y = p.y - 8 + Math.sin(ang) * 10;
    const b = K.shoot(G, p, x, y, ang, { dmg: Math.round(B.dmg * (p.dmgMul || 1)), speed: B.spd, sprite: 'nothing', life: 3, pierce: B.thr, repel: 3, r: 8 * B.size, critChance: B.crit });
    b.fxh = fx(G, 'monster_bullet_' + m.tier, x, y, { follow: b, ang });   // prefab chỉ là dải đuôi (TrailRenderer rộng 3 × đường cong, không co theo cỡ đạn như Unity)
    if (SK.sfx) SK.sfx.play('fx_wolf_eat', { vol: 0.5 });
    return true;
  }

  S.devour = {
    DV, BUL,
    start(G, p) {
      layer(G);
      const s = st(p);
      Object.assign(s, { mode: 'press', hold: 0, ate: 0 });
      p.skillT = DV.max + 1;
    },
    update(G, p, dt) {
      const s = st(p);
      if (s.mode === 'press') {
        s.hold += dt;
        if (!I.down('skill')) beginLunge(G, p, s, 0, false);   // nhả sớm = bấm nhanh
        else if (s.hold >= DV.thr) beginCharge(G, p, s);
      } else if (s.mode === 'lunge') {
        s.t += dt;
        SK.moveBox(G.map, p, Math.cos(s.ang) * s.dist / DV.eatDelay * dt, Math.sin(s.ang) * s.dist / DV.eatDelay * dt, p.h.body.r);   // gốc dừng ở tường bằng CircleCast, đây chỉ dừng khi va tường
        if (s.t >= DV.eatDelay) { eatNow(G, p, s, s.ang, s.ratio, s.n); finish(G, p, s); }
      } else if (s.mode === 'charge') chargeTick(G, p, s, dt);
    },
    end(G, p) { const s = st(p); if (s.mode) finish(G, p, s); },
    press() { /* đang giữ / lao: bấm thêm không có tác dụng */ },
    // Nút đặc biệt (phím L): bắn Đạn Quái mới nhất, độc lập với hồi chiêu [ĐO RoleSkill2: nút số 1 gọi ShootMonsterBullet].
    special(G, p) { shootMonster(G, p); }
  };
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p && p._dv) { p._dv.mons = []; p._dv.mode = null; } });

  // Số Đạn Quái đang chứa trên nút kỹ năng.
  SK.on('hud', (ctx, G) => {
    const p = G.player, s = p && p._dv;
    if (!s || !mine(p) || G.state !== 'stage') return;
    const v = SK.view, cx = v.w - 16, cy = v.h - 17;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 14, cy + 5, 9, 8);
    SK.text(ctx, String(s.mons.length), cx - 9.5, cy + 9, 8, s.mons.length ? ['#7fe36f', '#6bb8ff', '#c07bff'][s.mons[s.mons.length - 1].tier] : '#8a95a8', 'center', '#000');
  });
})();
