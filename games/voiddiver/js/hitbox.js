// hitbox.js — hitbox và đạn (HitBox.csv), phép thử hình trên mặt XZ, đăng ký trúng,
// công thức sát thương, CC, áp buff, phản hồi trúng đòn (vfx/sfx/hitstop/rung) qua world.emit.
// Luật: docs/SKILLVM.md §3 (HitBox), §5 (sát thương). Không rẽ nhánh theo id hitbox.
(function (VD) {
  'use strict';
  var num = VD.num, vec3 = VD.vec3;

  function db() { return VD.combatDB(); }
  function emit(world, e) { if (world && world.emit) world.emit(e); }
  function rng(world) { return world && world.rng ? world.rng() : Math.random(); }
  function T(t) { return String(t || '').split(',')[0].split('.').pop(); }
  function fire(world, u, type, payload) { if (VD.Skill && VD.Skill.fire) VD.Skill.fire(world, u, type, payload); }
  function len(x, z) { return Math.sqrt(x * x + z * z); }
  function norm(v) { var l = len(v.x, v.z); return l > 1e-9 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 }; }
  function rot(v, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    // quay quanh trục y; góc dương = quay sang phải (right = (−f.z, f.x) trong toạ độ three)
    return { x: v.x * c - v.z * s, z: v.x * s + v.z * c };
  }
  function right(f) { return { x: -f.z, z: f.x }; }
  function noteUnknown(world, kind, name) {
    if (!world) return;
    world.combatUnknown = world.combatUnknown || {};
    var k = kind + ':' + name;
    world.combatUnknown[k] = (world.combatUnknown[k] || 0) + 1;
  }

  // ======================= quan hệ phe =======================
  var Combat = VD.Combat = VD.Combat || {};
  // [SUY LUẬN] khác team → thù. Cùng team 'mon': thù khi Faction.EnemyFactionIds chứa phe kia; phe −1 không đánh quái khác.
  Combat.isEnemy = function (a, b) {
    if (!a || !b || a === b) return false;
    if (a.team !== b.team) return true;
    if (a.faction == null || b.faction == null || a.faction < 0 || b.faction < 0) return false;
    var fa = db().faction(a.faction), fb = db().faction(b.faction);
    return !!((fa && (fa.EnemyFactionIds || []).indexOf(b.faction) >= 0) || (fb && (fb.EnemyFactionIds || []).indexOf(a.faction) >= 0));
  };
  Combat.relation = function (a, b, type) {
    switch (type) {
      case 'Enemy': return Combat.isEnemy(a, b);
      case 'Ally': return !Combat.isEnemy(a, b);
      case 'AllyExceptOwner': return a !== b && !Combat.isEnemy(a, b);
      case 'Owner': return a === b;
      case 'All': return true;
      case 'AllExceptOwner': return a !== b;
      default: return false;
    }
  };
  // Điều kiện đơn vị kiểu {ElementalCondition, FactionCondition, CcCondition, EffectTag, MonsterCondition}.
  // FactionCondition so với MonsterCategories (Eldritch/Phantasm/…), MonsterCondition so với MonsterType. [ĐO] buff 1020
  Combat.unitCond = function (u, c, elem) {
    if (!c) return true;
    if (c.FactionCondition && c.FactionCondition !== 'None' && (u.categories || []).indexOf(c.FactionCondition) < 0) return false;
    if (c.MonsterCondition && c.MonsterCondition !== 'None' && u.monsterType !== c.MonsterCondition) return false;
    if (c.CcCondition && c.CcCondition !== 'None' && !(u.buffs.cc && u.buffs.cc.type === c.CcCondition)) return false;
    if (c.EffectTag && c.EffectTag !== 'None') {
      var ok = false;
      for (var i = 0; i < u.buffs.list.length; i++) if (u.buffs.list[i].row.EffectTag === c.EffectTag) ok = true;
      if (!ok) return false;
    }
    if (c.ElementalCondition && c.ElementalCondition !== 'None' && elem !== c.ElementalCondition) return false;
    return true;
  };
  function condGroup(u, g, elem) {
    if (!g || !g.Conditions || !g.Conditions.length) return true;
    var any = false;
    for (var i = 0; i < g.Conditions.length; i++) {
      var ok = Combat.unitCond(u, g.Conditions[i], elem);
      if (g.IsAny && ok) return true;
      if (!g.IsAny && !ok) return false;
      any = any || ok;
    }
    return g.IsAny ? any : true;
  }

  // ======================= sát thương =======================
  // Hằng số hitstop: KHÔNG có trong bảng (game gốc không có cột hitstop) — số trình bày, chỉnh tự do.
  var HITSTOP = { normal: 0.045, crit: 0.075, kill: 0.09, parry: 0.12 }; // không có trong bảng: cảm giác đánh
  Combat.HITSTOP = HITSTOP;

  function backAngleOf(u) {
    if (u.kind === 'char') return db().c('CharacterBackAttackAngle', 150);
    return num(u.row && u.row.BackAttackAngle);
  }
  // Đánh sau lưng: vị trí nguồn nằm trong nón sau lưng mục tiêu (rộng BackAttackAngle) và cách ≤ BackAttackMaxRange. [SUY LUẬN]
  Combat.isBackAttack = function (src, tgt, from) {
    var ang = backAngleOf(tgt);
    if (!(ang > 0)) return false;
    var dx = from.x - tgt.pos.x, dz = from.z - tgt.pos.z;
    var d = len(dx, dz);
    if (d > db().c('BackAttackMaxRange', 2) + (tgt.radius || 0) || d < 1e-6) return false;
    var f = norm(tgt.aim || { x: 0, z: 1 });
    var cosv = -(dx * f.x + dz * f.z) / d; // cos góc giữa (nguồn − đích) và hướng sau lưng
    return cosv >= Math.cos(ang / 2 * Math.PI / 180);
  };

  function srcKindKey(u) { return u.kind === 'char' ? 'Character' : u.kind === 'mon' ? 'Monster' : 'ExtraUnit'; }

  // info: DamageInfo gốc. ctx: { hb, skillId, canBack, reason:'Hit'|'Action'|'Dot', from:{x,z}, isFirstHit, canParry }
  Combat.computeDamage = function (world, src, tgt, info, ctx) {
    ctx = ctx || {};
    var sS = src.stats || {}, tS = tgt.stats || {};
    var elem = info.ElementalType || 'None';
    var bonus = {};
    var cs = (info.ConditionalStats || []).map(function (c) { return c; });
    if (src.buffs) src.buffs.effects('AttackConditionalStats').forEach(function (x) { cs = cs.concat(x.e.ConditionalStats || []); });
    var csT = [];
    if (tgt.buffs) tgt.buffs.effects('AttackedConditionalStats').forEach(function (x) { csT = csT.concat(x.e.ConditionalStats || []); });
    function applyCS(list, self, other) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!condGroup(self, c.SourceCondition, elem) || !condGroup(other, c.TargetCondition, elem)) continue;
        var p = num(c.Probability);
        if (p < 100 && rng(world) * 100 >= p) continue;
        bonus[c.StatType] = (bonus[c.StatType] || 0) + num(c.StatValue);
      }
    }
    applyCS(cs, src, tgt);
    applyCS(csT, src, tgt);
    var coefStat = info.CoefficientStat && info.CoefficientStat !== 'None' ? (sS[info.CoefficientStat] || 0) : 0;
    var base = num(info.Power) + coefStat * num(info.StatFactor) / 100;
    var r = { base: base, elem: elem, crit: false, back: false, mult: 1 };
    var inv = tgt.buffs ? tgt.buffs.invincible() : null;
    var x = base;
    // cộng thêm sát thương
    var add = (sS.AdditionalAttackDamagePercent || 0) + (bonus.AdditionalAttackDamagePercent || 0);
    x *= 1 + add / 100;
    // sau lưng
    var backCrit = 0;
    if (ctx.canBack && ctx.reason !== 'Dot' && !(inv && inv.IgnoreBackAttack) && ctx.from && Combat.isBackAttack(src, tgt, ctx.from)) {
      r.back = true;
      var k = srcKindKey(src);
      var bpct = db().c(k === 'Monster' ? 'DefaultMonsterBackAttackDamagePercent' : 'Default' + k + 'BackAttackDamagePercent', 15)
        + (sS.BackAttackDamagePercent || 0) + (bonus.BackAttackDamagePercent || 0)
        + (src.buffs ? src.buffs.sum('BackAttackDamageAdd', 'Percent') : 0);
      x *= 1 + bpct / 100;
      backCrit = db().c(k + 'BackAttackIncreaseCriticalChancePercent', 0) + (src.buffs ? src.buffs.sum('BackAttackCriticalChanceAdd', 'Percent') : 0);
    }
    // chí mạng
    if (ctx.reason !== 'Dot') {
      var cc = (sS.CriticalChancePercent || 0) + (bonus.CriticalChancePercent || 0) + backCrit;
      if (inv && inv.IgnoreCriticalHit) cc = 0;
      r.critChance = cc;
      if (cc > 0 && rng(world) * 100 < cc) {
        r.crit = true;
        x *= 1 + ((sS.CriticalDamagePercent || 0) + (bonus.CriticalDamagePercent || 0)) / 100;
      }
    }
    // nguyên tố
    if (elem !== 'None') {
      x *= 1 + ((sS[elem + 'DamagePercent'] || 0) + (bonus[elem + 'DamagePercent'] || 0)) / 100;
      x *= 1 - (tS[elem + 'ResistancePercent'] || 0) / 100;
    }
    r.preDef = x;
    // phòng thủ: × DefenseFactor / (DefenseFactor + Def hiệu dụng) [SUY LUẬN]
    var DF = db().c('DefenseFactor', 100);
    var pen = (sS.PenetrationPercent || 0) + (bonus.PenetrationPercent || 0);
    var defEff = Math.max(0, (tS.Def || 0) * (1 - pen / 100) - (sS.Penetration || 0) - (bonus.Penetration || 0));
    if (ctx.reason === 'Dot') defEff = 0; // [SUY LUẬN] DoT bỏ qua Def
    x *= DF / (DF + defEff);
    // nhận thêm/giảm
    if (tgt.buffs) x *= 1 + tgt.buffs.sum('HpDamageTakenAmplifier', 'Percent') / 100;
    x *= 1 - (tS.ReductionDamagePercent || 0) / 100;
    if (ctx.reason === 'Dot' && src.buffs) x *= 1 + src.buffs.sum('DotDamageAmplifier', 'Percent') / 100;
    if (tgt.groggyT > 0) x *= db().c('GroggyDamageMultiplier', 1.5);
    // khiên chắn trước (FrontGuard)
    if (tgt.buffs && ctx.from && ctx.reason !== 'Dot') {
      var fg = tgt.buffs.effects('FrontGuard');
      for (var i = 0; i < fg.length; i++) {
        var e = fg[i].e;
        var dx = ctx.from.x - tgt.pos.x, dz = ctx.from.z - tgt.pos.z, d = len(dx, dz);
        var f = norm(tgt.aim || { x: 0, z: 1 });
        if (d < 1e-6 || (dx * f.x + dz * f.z) / d >= Math.cos(num(e.AngleDeg) / 2 * Math.PI / 180)) {
          x *= 1 - num(e.DamageReductionPercent) / 100;
          r.guard = e;
          break;
        }
      }
    }
    r.amount = x > 0 ? Math.max(1, Math.round(x)) : 0;
    r.defEff = defEff;
    r.bonus = bonus;
    return r;
  };

  // Áp sát thương lên máu (khiên, ngưỡng máu, chết) và phát sự kiện + trigger.
  Combat.applyDamage = function (world, src, tgt, info, ctx) {
    if (!tgt || tgt.dead) return null;
    ctx = ctx || {};
    var inv = tgt.buffs ? tgt.buffs.invincible() : null;
    if (inv && inv.BlockDamage) {
      emit(world, { type: 'damage', src: src, tgt: tgt, amount: 0, blocked: 'invincible', skillId: ctx.skillId, hitboxId: ctx.hb && ctx.hb.id, t: world.time });
      return { amount: 0, blocked: 'invincible' };
    }
    var r = Combat.computeDamage(world, src, tgt, info, ctx);
    var amount = r.amount;
    // DamageConversion: phần % của sát thương nguyên tố đó thành hồi máu [SUY LUẬN]
    if (tgt.buffs) tgt.buffs.effects('DamageConversion').forEach(function (x) {
      if (x.e.ElementalType === r.elem) { var h = amount * num(x.e.Percent) / 100; amount -= h; Combat.heal(world, tgt, h, tgt); }
    });
    var absorbed = 0;
    if (!info.IgnoreShield && tgt.buffs) { var rem = tgt.buffs.absorb(amount); absorbed = amount - rem; amount = rem; }
    var hpBefore = tgt.hp;
    tgt.hp -= amount;
    var thr = 0;
    if (tgt.buffs) tgt.buffs.effects('HpThreshold').forEach(function (x) { thr = Math.max(thr, num(x.e.ThresholdPercent)); });
    if (thr > 0) tgt.hp = Math.max(tgt.hp, Math.min(hpBefore, thr / 100 * tgt.stats.HpMax));
    var killed = tgt.hp <= 0;
    var ev = {
      type: 'damage', src: src, tgt: tgt, amount: r.amount, hpLoss: hpBefore - Math.max(0, tgt.hp), shieldAbsorbed: absorbed,
      base: r.base, preDef: r.preDef, crit: r.crit, back: r.back, elem: r.elem, guard: !!r.guard, reason: ctx.reason || 'Hit',
      skillId: ctx.skillId, hitboxId: ctx.hb && ctx.hb.id, pos: { x: tgt.pos.x, z: tgt.pos.z }, killed: killed, t: world.time
    };
    emit(world, ev);
    if (r.guard) {
      emit(world, { type: 'vfx', name: r.guard.Vfx, unit: tgt, forward: num(r.guard.VfxForwardPos), dir: tgt.aim, follow: true, duration: num(r.guard.VfxDuration) });
      if (r.guard.Sfx) emit(world, { type: 'sfx', name: r.guard.Sfx, unit: tgt });
    }
    // Khiên theo sát thương gây ra (Noah 1201/1207)
    if (src && src.buffs && r.amount > 0 && ctx.reason !== 'Dot') {
      src.buffs.effects('ShieldOnDamageProvide').forEach(function (x) {
        VD.Buff.addShield(world, src, x.e.ShieldId, r.amount * num(x.e.Percent) / 100);
      });
    }
    // Stress (Const): bị đánh sau lưng +StressDamageOnBackAttack; chí mạng hồi StressRecoveryOnCritical (50%, CD 2 s)
    if (tgt.kind === 'char' && r.back) Combat.stressDamage(world, src, tgt, db().c('StressDamageOnBackAttack', 5), {});
    if (src && src.kind === 'char' && r.crit && (src.critStressCd || 0) <= 0 && rng(world) * 100 < db().c('StressRecoveryPercentOnCritical', 50)) {
      src.critStressCd = db().c('StressRecoveryCoolTimeOnCritical', 2);
      Combat.stressRecover(world, src, db().c('StressRecoveryOnCritical', 1));
    }
    if (src && src !== tgt) fire(world, src, 'DamageProvideSkillTrigger', { target: tgt, skillId: ctx.skillId, crit: r.crit, firstHit: !!ctx.isFirstHit, reason: ctx.reason || 'Hit', amount: r.amount });
    fire(world, tgt, 'DamageSkillTrigger', { target: src, crit: r.crit, parryable: !!ctx.canParry, back: r.back, amount: r.amount });
    if (VD.AI && VD.AI.onDamaged) VD.AI.onDamaged(world, tgt, src, ev);
    if (killed) Combat.kill(world, tgt, src);
    ev.result = r;
    return ev;
  };

  Combat.heal = function (world, u, amount, src) {
    if (!u || u.dead || !(amount > 0)) return 0;
    amount *= 1 + (u.buffs ? u.buffs.sum('HpRecoveryAmplifier', 'Percent') : 0) / 100;
    var before = u.hp;
    u.hp = Math.min(u.stats.HpMax, u.hp + amount);
    if (u.hp > before) emit(world, { type: 'heal', unit: u, amount: u.hp - before, src: src });
    return u.hp - before;
  };
  // Stress: chỉ nhân vật. Invincibility.BlockStressDamage chặn; StressDamageTakenAmplifier; Difficulty.StressDamagePercent.
  Combat.stressDamage = function (world, src, u, amount, opt) {
    if (!u || u.dead || u.kind !== 'char' || !(amount > 0)) return 0;
    var inv = u.buffs.invincible();
    if (inv && inv.BlockStressDamage && !(opt && opt.dot)) return 0;
    amount *= 1 + u.buffs.sum('StressDamageTakenAmplifier', 'Percent') / 100;
    var d = db().difficulty(world && world.difficulty);
    if (d && !(opt && opt.dot)) amount *= num(d.StressDamagePercent) / 100;
    var max = db().c('StressMax', 100), before = u.stress || 0;
    u.stress = Math.max(0, Math.min(max, before + amount));
    emit(world, { type: 'stress', unit: u, stress: u.stress, delta: u.stress - before, src: src });
    return u.stress - before;
  };
  Combat.stressRecover = function (world, u, amount) {
    if (!u || u.kind !== 'char' || !(amount > 0) || u.buffs.has('BlockStressRecovery')) return 0;
    amount *= 1 + u.buffs.sum('StressRecoveryAmplifier', 'Percent') / 100;
    var before = u.stress || 0;
    u.stress = Math.max(0, before - amount);
    emit(world, { type: 'stress', unit: u, stress: u.stress, delta: u.stress - before });
    return before - u.stress;
  };

  Combat.kill = function (world, u, killer) {
    if (u.dead) return;
    if (VD.AI && VD.AI.beforeDeath && VD.AI.beforeDeath(world, u, killer)) return; // quái lên pha thay vì chết
    u.dead = true;
    u.hp = 0;
    if (VD.Skill && VD.Skill.interrupt) VD.Skill.interrupt(world, u, 'death');
    emit(world, { type: 'death', unit: u, killer: killer, t: world.time });
    if (u.buffs) {
      var ids = u.buffs.list.map(function (b) { return b.id; });
      for (var i = 0; i < ids.length; i++) u.buffs.remove(world, ids[i], null, 'death');
      u.buffs.cc = null;
    }
    var hbs = world.hitboxes || [];
    for (var j = 0; j < hbs.length; j++) if (hbs[j].owner === u && hbs[j].info.IsCancelOnOwnerDie) destroy(world, hbs[j], 'ownerDie');
    var its = world.hbIters || [];
    for (var k = 0; k < its.length; k++) if (its[k].owner === u && its[k].ev.CancelOnOwnerDying) its[k].dead = true;
    fire(world, u, 'DieSkillTrigger', { target: killer });
    var units = world.units || [];
    for (var n = 0; n < units.length; n++) {
      var o = units[n];
      if (o === u || o.dead) continue;
      fire(world, o, 'NoticeDieSkillTrigger', { dead: u, killer: killer, target: u });
    }
  };

  // DoT: bỏ qua Def, không chí mạng, không đánh sau lưng [SUY LUẬN]
  function dotDamage(world, src, tgt, amount, inst) {
    return Combat.applyDamage(world, src || tgt, tgt, { Power: amount, CoefficientStat: 'None', StatFactor: 0, ElementalType: 'None' },
      { reason: 'Dot', buffId: inst && inst.id });
  }

  // ======================= CC (có thanh áp chế) =======================
  // Quái có SuppressionGauge > 0: CC không áp trực tiếp; SuppressionValue đổ vào thanh (× hệ số độ khó). Đầy → Groggy
  // (choáng GroggyDuration, nhận ×GroggyDamageMultiplier), sau đó miễn SuppressionImmunityDuration, thanh lớn thêm
  // SuppressionResistanceGrowthFactor. [SUY LUẬN] — Xem SKILLVM.md §3.6.
  Combat.applyCC = function (world, src, tgt, cc, hb) {
    if (!tgt || tgt.dead || !tgt.buffs) return false;
    if (cc.MonsterCondition && cc.MonsterCondition !== 'None' && tgt.monsterType !== cc.MonsterCondition) return false;
    if (cc.FactionCondition && cc.FactionCondition !== 'None' && (tgt.categories || []).indexOf(cc.FactionCondition) < 0) return false;
    var gauge = tgt.kind === 'mon' ? num(tgt.row && tgt.row.SuppressionGauge) : 0;
    if (gauge > 0) {
      if ((tgt.suppImmuneT || 0) > 0 || tgt.groggyT > 0) return false;
      var d = world.difficulty || 'Normal';
      var fac = db().c('SuppressionGaugeFactor' + d, 1);
      var max = gauge * fac * Math.pow(1 + db().c('SuppressionResistanceGrowthFactor', 0.35), tgt.groggyCount || 0);
      tgt.supp = (tgt.supp || 0) + num(cc.SuppressionValue);
      emit(world, { type: 'suppression', unit: tgt, value: tgt.supp, max: max });
      if (tgt.supp >= max) {
        tgt.supp = 0;
        tgt.groggyCount = (tgt.groggyCount || 0) + 1;
        tgt.groggyT = db().c('GroggyDuration', 6);
        tgt.buffs.cc = null;
        tgt.buffs.applyCC(world, { ccType: 'Stun', ccDuration: tgt.groggyT }, src, null, null);
        emit(world, { type: 'groggy', unit: tgt, dur: tgt.groggyT });
      }
      return false;
    }
    var dir = null, pullTo = null;
    var ft = cc.UseForcedMoveDirection ? cc.ForcedMoveDirectionType : 'None';
    var from = hb ? hb.pos : src.pos;
    if (ft === 'OwnerAim' && src) dir = norm(src.aim);
    else if (ft === 'HitBoxMove' && hb) dir = norm(hb.dir);
    else if (ft === 'OwnerMove' && src) dir = norm(src.moveDir || src.aim);
    else if (ft === 'MoveToHItBox' && hb) { dir = norm({ x: hb.pos.x - tgt.pos.x, z: hb.pos.z - tgt.pos.z }); }
    else {
      var dx = tgt.pos.x - from.x, dz = tgt.pos.z - from.z;
      dir = len(dx, dz) > 1e-4 ? norm({ x: dx, z: dz }) : norm(hb ? hb.dir : src.aim);
    }
    if (cc.ccType === 'Pull') pullTo = src ? { x: src.pos.x, z: src.pos.z } : from;
    return tgt.buffs.applyCC(world, cc, src, dir, pullTo);
  };

  // ======================= hình va chạm =======================
  // collisionScale "x:y:z" (mét). CylinderN: quạt N° elip bán trục (x ngang, z dọc) quanh tâm hitbox, hướng = dir.
  // Sphere: elip (x, z). Box: hộp kích thước đủ x × z (không phải nửa). [ĐO] chỉ báo Circle ≈ Sphere scale + ~0.15,
  // Square 2×3.5 ↔ Box 2×2.5 lệch z 1.5 (skill 21000580). Bán kính mục tiêu cộng vào trục (xấp xỉ va chạm capsule).
  function scaleAt(hb) {
    var s = hb.scale;
    var keys = hb.info.CollisionScaleKeys || [];
    if (keys.length) {
      var k = keys[0], tk = num(k.Time), ks = vec3(k.Scale);
      var f = tk > 0 ? Math.min(1, hb.t / tk) : 1;
      return { x: s.x + (ks.x - s.x) * f, y: s.y + (ks.y - s.y) * f, z: s.z + (ks.z - s.z) * f };
    }
    return s;
  }
  function overlaps(hb, u) {
    var s = scaleAt(hb);
    var type = hb.info.collisionType || 'Sphere';
    var r = u.radius || 0;
    var dx = u.pos.x - hb.pos.x, dz = u.pos.z - hb.pos.z;
    var f = hb.dir, rt = right(f);
    var lz = dx * f.x + dz * f.z;   // dọc theo hướng
    var lx = dx * rt.x + dz * rt.z; // ngang
    if (type === 'Box') {
      return Math.abs(lx) <= s.x / 2 + r && Math.abs(lz) <= s.z / 2 + r;
    }
    var ax = s.x + r, az = s.z + r;
    if (!(ax > 0 && az > 0)) return false;
    var nx = lx / ax, nz = lz / az;
    var d2 = nx * nx + nz * nz;
    if (d2 > 1) return false;
    var m = /^Cylinder(\d+)$/.exec(type);
    if (!m) return true; // Sphere
    var ang = +m[1];
    if (ang >= 360) return true;
    // mục tiêu chồng lên tâm → trúng
    if (len(lx, lz) <= r) return true;
    // góc trong không gian đã chuẩn hoá (mesh quạt bị scale không đều) — nới theo bán kính mục tiêu
    var a = Math.atan2(Math.abs(nx), nz) * 180 / Math.PI;
    var slack = Math.atan2(r, Math.max(1e-6, len(lx, lz))) * 180 / Math.PI;
    return a <= ang / 2 + slack;
  }

  // ======================= Hitbox =======================
  var HitBox = {};
  var _uid = 1;

  // opt: { spawnType:'Owner'|'None'|'Aim'|'SkillTriggerTarget', at:{x,z} (ghi đè), dir, angle (độ), localOffset:{x,y,z},
  //        run, skillId, triggerTarget, delay }
  HitBox.spawn = function (world, owner, id, opt) {
    opt = opt || {};
    if (!(id > 0)) return null; // 0 / −1 = không có hitbox
    var row = db().hitbox(id);
    if (!row) { noteUnknown(world, 'hitbox', id); return null; }
    var info = row.HitBoxInfo || {};
    var dir = norm(opt.dir || owner.aim || { x: 0, z: 1 });
    var ang = num(info.angleOffset) + (opt.angle || 0);
    if (ang) dir = norm(rot(dir, ang));
    var base;
    var st = opt.spawnType || 'Owner';
    if (opt.at) base = { x: opt.at.x, z: opt.at.z };
    else if (st === 'Aim') base = aimPoint(owner);
    else if (st === 'SkillTriggerTarget' && opt.triggerTarget) base = { x: opt.triggerTarget.pos.x, z: opt.triggerTarget.pos.z };
    else base = { x: owner.pos.x, z: owner.pos.z };
    var off = vec3(info.startOffset);
    if (opt.localOffset) { off.x += opt.localOffset.x || 0; off.y += opt.localOffset.y || 0; off.z += opt.localOffset.z || 0; }
    var rt = right(dir);
    var pos = { x: base.x + rt.x * off.x + dir.x * off.z, y: off.y, z: base.z + rt.z * off.x + dir.z * off.z };
    if (info.ClampSpawnPositionToWall && world.raycastWall) {
      var hit = world.raycastWall({ x: owner.pos.x, z: owner.pos.z }, pos);
      if (hit) { pos.x = hit.x; pos.z = hit.z; }
    }
    var hb = {
      uid: _uid++, id: id, row: row, info: info, owner: owner, skillId: opt.skillId, run: opt.run || null,
      triggerTarget: opt.triggerTarget || null, t: 0, dur: num(info.duration), pos: pos, dir: dir,
      start: { x: pos.x, y: pos.y, z: pos.z }, followOff: off, followBase: st === 'Aim' || opt.at ? null : 'owner',
      scale: vec3(info.collisionScale), hits: {}, hitCount: 0, moved: 0, alive: true, onceUsed: {},
      delay: Math.max(num(info.SpawnDelayAfterFireVfx), opt.delay || 0), started: false,
      colFrom: num(info.collisionDelay), colTo: num(info.collisionEndTime), multi: num(info.multiHitInterval),
      hasEvents: (info.collisionEvents || []).length > 0, firstHitDone: false
    };
    // điểm đích cho đạn ToAim / Parabola
    var mt = info.MoveType;
    if (mt === 'LinearToAim' || mt === 'LinearToAimBySpeed' || mt === 'ParabolaToAim') {
      var ap = opt.aimPoint || aimPoint(owner);
      var dx = ap.x - pos.x, dz = ap.z - pos.z, d = len(dx, dz);
      var mn = num(info.MinMoveDistance), mx = num(info.MaxMoveDistance);
      var dd = d;
      if (mx > 0) dd = Math.min(dd, mx);
      if (mn > 0) dd = Math.max(dd, mn);
      var dd2 = d > 1e-6 ? { x: dx / d, z: dz / d } : dir;
      if (d > 1e-6) hb.dir = dd2;
      hb.target = { x: pos.x + dd2.x * dd, z: pos.z + dd2.z * dd };
    } else if (mt === 'Parabola') {
      var md = num(info.MaxMoveDistance) || num(info.moveSpeed) * hb.dur;
      hb.target = { x: pos.x + dir.x * md, z: pos.z + dir.z * md };
    }
    world.hitboxes = world.hitboxes || [];
    world.hitboxes.push(hb);
    if (info.FireVfx) emit(world, { type: 'vfx', name: info.FireVfx, pos: { x: pos.x, y: pos.y, z: pos.z }, dir: hb.dir, duration: num(info.FireVfxDuration), unit: owner });
    if (hb.delay <= 0) startHB(world, hb);
    return hb;
  };
  function aimPoint(u) {
    var ap = u.aimPoint || (u.input && u.input.aimPoint);
    if (ap) return { x: ap.x, z: ap.z };
    if (u.target && !u.target.dead) return { x: u.target.pos.x, z: u.target.pos.z };
    var a = norm(u.aim || { x: 0, z: 1 });
    return { x: u.pos.x + a.x * 3, z: u.pos.z + a.z * 3 }; // không có trong bảng: điểm ngắm mặc định 3 m khi thiếu
  }
  HitBox.aimPoint = aimPoint;

  function startHB(world, hb) {
    hb.started = true;
    var info = hb.info;
    // HitBox.vfx là con của hitbox: stage bám hb.pos/hb.dir mỗi khung, huỷ cùng hitbox (vfxEnd 'hb:<uid>').
    if (info.vfx) emit(world, { type: 'vfx', name: info.vfx, pos: { x: hb.pos.x, y: hb.pos.y, z: hb.pos.z }, dir: hb.dir, speeds: info.vfxSpeeds,
      zOffset: num(info.VfxZOffset), loop: !!info.IsLoopVfx, loopDuration: num(info.VfxLoopDuration), duration: hb.dur, hitbox: hb, owner: hb.owner,
      key: 'hb:' + hb.uid });
    if (info.SpawnSfx) emit(world, { type: 'sfx', name: info.SpawnSfx, unit: info.SfxFollowOwner ? hb.owner : null, pos: { x: hb.pos.x, z: hb.pos.z } });
    emit(world, { type: 'hitbox', hb: hb, id: hb.id, owner: hb.owner, pos: hb.pos, dir: hb.dir, shape: info.collisionType, scale: hb.scale, t: world.time });
  }

  function curveMean(keys) { return VD.Skill ? VD.Skill.curveMean(keys) : 1; }
  function curveAt(keys, t) { return VD.Skill ? VD.Skill.evalCurve(keys, t) : 1; }

  function moveHB(world, hb, dt) {
    var info = hb.info, mt = info.MoveType || 'FollowSelf';
    var prev = { x: hb.pos.x, z: hb.pos.z };
    var spd = num(info.moveSpeed);
    var keys = (info.MoveSpeedCurveData && info.MoveSpeedCurveData.Keys) || [];
    var u = hb.dur > 0 ? Math.min(1, hb.t / hb.dur) : 0;
    if (hb.collectSpeed > 0 && hb.owner) {
      var cx = hb.owner.pos.x - hb.pos.x, cz = hb.owner.pos.z - hb.pos.z, cd = len(cx, cz), cs = hb.collectSpeed * dt;
      if (cd <= cs + (hb.owner.radius || 0)) { hb.pos.x = hb.owner.pos.x; hb.pos.z = hb.owner.pos.z; hb.arrived = true; }
      else { hb.pos.x += cx / cd * cs; hb.pos.z += cz / cd * cs; }
      return null;
    }
    if (mt === 'TraceOwner' && spd > 0 && hb.owner) {
      // Bay về chủ ở moveSpeed × curve(t/duration), tới nơi thì huỷ (sinh destroyHitBoxId). [SUY LUẬN] Chỉ lượt về của
      // bumerang Mio 100112003/…13: curve tăng dần 0→1, destroyHitBoxId = Blade_End có SfxFollowOwner.
      var tx = hb.owner.pos.x - hb.pos.x, tz = hb.owner.pos.z - hb.pos.z, td = len(tx, tz);
      var ts = spd * (keys.length ? curveAt(keys, u) : 1) * dt;
      if (td > 1e-6) hb.dir = { x: tx / td, z: tz / td };
      if (td <= ts + (hb.owner.radius || 0)) { hb.pos.x = hb.owner.pos.x; hb.pos.z = hb.owner.pos.z; hb.arrived = true; }
      else { hb.pos.x += tx / td * ts; hb.pos.z += tz / td * ts; }
      return null;
    }
    if (mt === 'FollowSelf' || mt === 'TraceOwner') {
      if (hb.followBase === 'owner' && hb.owner && !hb.owner.dead) {
        var f = hb.dir, rt = right(f), o = hb.followOff;
        hb.pos.x = hb.owner.pos.x + rt.x * o.x + f.x * o.z;
        hb.pos.z = hb.owner.pos.z + rt.z * o.x + f.z * o.z;
      }
      return null;
    }
    if (mt === 'Linear' || mt === 'Tracing') {
      if (mt === 'Tracing' && info.tracingTargetType === 'Enemy') steer(world, hb, dt);
      var v = spd * (keys.length ? curveAt(keys, u) : 1);
      var step = v * dt, mx = num(info.MaxMoveDistance);
      if (mx > 0 && hb.moved + step > mx) step = Math.max(0, mx - hb.moved);
      hb.pos.x += hb.dir.x * step; hb.pos.z += hb.dir.z * step; hb.moved += step;
    } else if (mt === 'LinearToAimBySpeed') {
      var dx = hb.target.x - hb.pos.x, dz = hb.target.z - hb.pos.z, d = len(dx, dz);
      var st = spd * dt;
      if (st >= d) { hb.pos.x = hb.target.x; hb.pos.z = hb.target.z; hb.arrived = true; }
      else { hb.pos.x += dx / d * st; hb.pos.z += dz / d * st; }
    } else if (mt === 'LinearToAim' || mt === 'ParabolaToAim' || mt === 'Parabola') {
      var s = keys.length ? Math.min(1, curveAt(keys, u)) : u;
      if (!keys.length) s = u;
      hb.pos.x = hb.start.x + (hb.target.x - hb.start.x) * s;
      hb.pos.z = hb.start.z + (hb.target.z - hb.start.z) * s;
      if (mt !== 'LinearToAim') hb.pos.y = hb.start.y + 4 * num(info.ParabolaMoveHeight) * s * (1 - s);
    } else {
      noteUnknown(world, 'hitboxMove', mt);
    }
    if (world.raycastWall && (hb.pos.x !== prev.x || hb.pos.z !== prev.z)) {
      var hit = world.raycastWall(prev, hb.pos);
      if (hit) return hit;
    }
    return null;
  }
  // Tracing: quay dir về kẻ địch gần nhất trong tracingDetectingRange; tracingAngle = độ/khung ở 60 Hz [SUY LUẬN]
  function steer(world, hb, dt) {
    var best = null, bd = num(hb.info.tracingDetectingRange) || 0;
    var units = world.units || [];
    for (var i = 0; i < units.length; i++) {
      var o = units[i];
      if (o.dead || !Combat.isEnemy(hb.owner, o)) continue;
      var d = len(o.pos.x - hb.pos.x, o.pos.z - hb.pos.z);
      if (d <= bd) { bd = d; best = o; }
    }
    if (!best) return;
    var want = norm({ x: best.pos.x - hb.pos.x, z: best.pos.z - hb.pos.z });
    var cur = Math.atan2(hb.dir.x, hb.dir.z), tgt = Math.atan2(want.x, want.z);
    var da = tgt - cur;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    var maxT = num(hb.info.tracingAngle) * 60 * dt * Math.PI / 180;
    da = Math.max(-maxT, Math.min(maxT, da));
    hb.dir = { x: Math.sin(cur + da), z: Math.cos(cur + da) };
  }

  function collisionActive(hb) {
    if (!hb.hasEvents) return false;
    if (hb.t < hb.colFrom - 1e-9) return false;
    if (hb.colTo > 0 && hb.t > hb.colTo + 1e-9) return false;
    return true;
  }

  // Có sự kiện va chạm nào nhắm được u không
  function targetable(hb, u) {
    var evs = hb.info.collisionEvents || [];
    for (var i = 0; i < evs.length; i++) if (Combat.relation(hb.owner, u, evs[i].targetType)) return true;
    return false;
  }

  // Điều kiện buff trên sự kiện: ConditionOwnerType SkillOwner/CollisionTarget/TriggerTarget
  function buffCondsOK(list, owner, tgt, trig) {
    if (!list || !list.length) return true;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var who = c.ConditionOwnerType === 'CollisionTarget' ? tgt : c.ConditionOwnerType === 'TriggerTarget' ? (trig || tgt) : owner;
      if (!VD.Skill.buffCond(who, c, owner)) return false;
    }
    return true;
  }
  function hitableOK(list, tgt) {
    for (var i = 0; list && i < list.length; i++) {
      var c = list[i], t = T(c.$type);
      if (t === 'MonsterTypeCondition' && tgt.monsterType !== c.MonsterType) return false;
      if (t === 'HpPercentCondition' && 100 * tgt.hp / tgt.stats.HpMax > num(c.HpPercent)) return false;
    }
    return true;
  }

  // ---- bảng xử lý sự kiện va chạm (collisionEvents[].$type) ----
  var COLLISION = {
    CollisionDamageEvent: function (world, hb, tgt, ev, hc) {
      var info = hb.info;
      var from = info.UsePositionBasedBackAttack ? hb.pos : hb.owner.pos;
      var r = Combat.applyDamage(world, hb.owner, tgt, ev.DamageInfo || {}, {
        hb: hb, skillId: hb.skillId, canBack: !!ev.CanBackAttack, reason: 'Hit', from: from, isFirstHit: !hb.firstHitDone, canParry: !!info.CanParry
      });
      if (r && r.amount > 0) { hc.damaged = true; hc.crit = hc.crit || r.crit; hc.killed = hc.killed || r.killed; hc.elem = r.elem; }
    },
    CollisionBuffEvent: function (world, hb, tgt, ev) {
      if (ev.FactionCondition && ev.FactionCondition !== 'None' && (tgt.categories || []).indexOf(ev.FactionCondition) < 0) return;
      if (ev.MonsterCondition && ev.MonsterCondition !== 'None' && tgt.monsterType !== ev.MonsterCondition) return;
      if (!Combat.unitCond(tgt, { CcCondition: ev.CcCondition, EffectTag: ev.EffectTag })) return;
      var p = num(ev.Probability);
      if (p < 100 && rng(world) * 100 >= p) return;
      tgt.buffs.add(world, ev.buffId, num(ev.BuffStack) || 1, hb.owner);
    },
    CollisionCrowdControlEvent: function (world, hb, tgt, ev) { Combat.applyCC(world, hb.owner, tgt, ev.CcInfo || {}, hb); },
    CollisionFxEvent: function (world, hb, tgt, ev) {
      if (ev.Vfx) emit(world, { type: 'vfx', name: ev.Vfx, unit: tgt, owner: hb.owner, bone: ev.BoneType, offset: ev.Offset, duration: num(ev.VfxDuration), speeds: ev.VfxSpeeds, follow: !ev.IsIndependent, dir: ev.UseRotation ? hb.dir : null });
      if (ev.Sfx) emit(world, { type: 'sfx', name: ev.Sfx, unit: tgt });
    },
    CollisionHealEvent: function (world, hb, tgt, ev) {
      var st = ev.CoefficientStat && ev.CoefficientStat !== 'None' ? (hb.owner.stats[ev.CoefficientStat] || 0) : 0;
      Combat.heal(world, tgt, num(ev.Power) + st * num(ev.StatFactor) / 100, hb.owner);
    },
    CollisionStressDamageEvent: function (world, hb, tgt, ev) { Combat.stressDamage(world, hb.owner, tgt, randRange(world, ev.DamageMin, ev.DamageMax), {}); },
    CollisionStressRecoveryEvent: function (world, hb, tgt, ev) { Combat.stressRecover(world, tgt, randRange(world, ev.AmountMin, ev.AmountMax)); },
    CollisionSoulRecoveryOnHitMonsterEvent: function (world, hb, tgt, ev) {
      if (tgt.kind !== 'mon' || (ev.MonsterTypes || []).indexOf(tgt.monsterType) < 0) return;
      VD.Buff.changeSoul(world, hb.owner, randRange(world, ev.AmountMin, ev.AmountMax));
    },
    CollisionForceMonsterSetTargetEvent: function (world, hb, tgt, ev) {
      if (tgt.kind !== 'mon' || (ev.MonsterCondition && ev.MonsterCondition !== 'None' && tgt.monsterType !== ev.MonsterCondition)) return;
      tgt.target = hb.owner;
      emit(world, { type: 'aggro', unit: tgt, target: hb.owner, forced: true });
    },
    CollisionBrightnessDamageEvent: function (world, hb, tgt, ev) {
      if (tgt.light == null) return;
      tgt.light = Math.max(0, tgt.light - randRange(world, ev.AmountMin, ev.AmountMax));
      emit(world, { type: 'light', unit: tgt, light: tgt.light });
    },
    CollisionShieldEvent: function (world, hb, tgt, ev) {
      var p = num(ev.Probability);
      if (p < 100 && rng(world) * 100 >= p) return;
      VD.Buff.addShield(world, tgt, ev.ShieldId, num(ev.Value));
    },
    // thuộc AI / hệ bắt quái: chỉ phát sự kiện cho ai.js / dive.js
    CollisionTryMonsterCuriousStateEvent: function (world, hb, tgt, ev) { emit(world, { type: 'aiHint', hint: 'curious', unit: tgt, src: hb.owner }); },
    CollisionCaptureEvent: function (world, hb, tgt, ev) { emit(world, { type: 'capture', unit: tgt, src: hb.owner }); }
  };
  COLLISION._stub = { CollisionTryMonsterCuriousStateEvent: 1, CollisionCaptureEvent: 1 };
  HitBox.COLLISION = COLLISION;

  function randRange(world, a, b) {
    a = num(a); b = num(b);
    if (b <= a) return a;
    return a + (b - a) * rng(world);
  }

  // Một lần trúng mục tiêu. Trả true nếu đăng ký trúng.
  function hitUnit(world, hb, u) {
    var owner = hb.owner, info = hb.info;
    var enemy = Combat.isEnemy(owner, u);
    var inv = u.buffs.invincible();
    if (enemy && inv && inv.BlockEnemyHit) return false; // xuyên qua như không có
    hb.hits[u.uid] = hb.t;
    hb.hitCount++;
    // Đỡ đòn (ParryEffect) — [ĐO] buff 3000009/3000015 + ParrySkillTrigger ở node con
    if (enemy && info.CanParry && u.buffs.has('Parry')) {
      emit(world, { type: 'parry', unit: u, src: owner, hitboxId: hb.id, t: world.time });
      emit(world, { type: 'hitstop', dur: HITSTOP.parry, src: owner, tgt: u });
      fire(world, u, 'ParrySkillTrigger', { target: owner, hitbox: hb });
      if (info.collisionDestroy && info.collisionDestroy !== 'Never') destroy(world, hb, 'parried');
      return true;
    }
    var hc = { damaged: false, crit: false, killed: false };
    var evs = info.collisionEvents || [];
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!Combat.relation(owner, u, ev.targetType)) continue;
      if (ev.IsOnce && hb.onceUsed[i]) continue;
      if (!buffCondsOK(ev.BuffConditionList, owner, u, hb.triggerTarget)) continue;
      if (!hitableOK(ev.HitableConditions, u)) continue;
      var h = COLLISION[T(ev.$type)];
      if (!h) { noteUnknown(world, 'collisionEvent', T(ev.$type)); continue; }
      h(world, hb, u, ev, hc);
      if (ev.IsOnce) hb.onceUsed[i] = true;
      if (u.dead && T(ev.$type) === 'CollisionDamageEvent') { /* vẫn chạy tiếp buff/CC? dừng cho gọn */ break; }
    }
    hb.firstHitDone = true;
    if (hc.damaged) feedback(world, hb, u, hc);
    return true;
  }

  function feedback(world, hb, u, hc) {
    var info = hb.info, owner = hb.owner;
    if (info.hitVfx && info.hitPointType && info.hitPointType !== 'None') { // tables.js bỏ field 'None'
      var p;
      if (info.hitPointType === 'NearByOwner') {
        var d = norm({ x: owner.pos.x - u.pos.x, z: owner.pos.z - u.pos.z });
        p = { x: u.pos.x + d.x * (u.radius || 0), y: 0.5, z: u.pos.z + d.z * (u.radius || 0) };
      } else {
        var d2 = norm({ x: hb.pos.x - u.pos.x, z: hb.pos.z - u.pos.z });
        p = { x: u.pos.x + d2.x * (u.radius || 0), y: hb.pos.y, z: u.pos.z + d2.z * (u.radius || 0) };
      }
      // UseBoneAttachHitVfx: gắn vào khớp HitVfxBoneType (+ HitVfxBoneOffset) của mục tiêu; không thì đặt ở điểm trúng.
      // UseHitVfxRotate: quay theo hướng hitbox, không thì xoay gốc prefab. UseElementalHitVfx: biến thể "…_Hit_<nguyên tố>".
      var att = !!info.UseBoneAttachHitVfx;
      emit(world, { type: 'vfx', name: info.hitVfx, pos: p, dir: info.UseHitVfxRotate ? hb.dir : null, duration: num(info.hitVfxDuration),
        speeds: info.hitVfxSpeeds, unit: att ? u : null, follow: att, bone: att ? info.HitVfxBoneType : null, offset: att ? info.HitVfxBoneOffset : null,
        loop: !!info.IsLoopHitVfx, loopDuration: num(info.HitVfxLoopDuration), owner: owner,
        elemental: !!info.UseElementalHitVfx, element: info.UseElementalHitVfx ? (hc.elem || 'None') : undefined });
    }
    var sfx = hc.crit && info.criticalHitSfx ? info.criticalHitSfx : info.hitSfx;
    // UseElementalHitSfx / UseElementalCritSfx: clip thật là "<tên>_<nguyên tố của đòn>" (None/Fire/Water/Wind); tên trần không có.
    if (sfx) emit(world, { type: 'sfx', name: sfx, pos: { x: u.pos.x, z: u.pos.z }, elemental: !!(hc.crit && info.criticalHitSfx ? info.UseElementalCritSfx : info.UseElementalHitSfx),
      element: hc.elem || 'None' });
    if (u.kind === 'mon' && u.row && u.row.HitSfx && rng(world) * 100 < num(u.row.HitSfxPercent)) emit(world, { type: 'sfx', name: u.row.HitSfx, unit: u });
    emit(world, { type: 'hitstop', dur: hc.killed ? HITSTOP.kill : hc.crit ? HITSTOP.crit : HITSTOP.normal, src: owner, tgt: u, crit: hc.crit });
    emit(world, { type: 'flash', unit: u });
    var amp = num(info.OwnerHitShakeAmplitude);
    if (amp > 0) emit(world, { type: 'shake', unit: owner, amp: amp, freq: num(info.OwnerHitShakeFrequency), dur: num(info.OwnerHitShakeDuration), localOnly: true });
    if (u.kind === 'char') emit(world, { type: 'shake', unit: u, amp: db().c('HitShakeAmplitude', 0.25), freq: db().c('HitShakeFrequency', 0.1), dur: db().c('HitShakeDuration', 0.15), localOnly: true });
  }

  function destroy(world, hb, reason) {
    if (!hb.alive) return;
    hb.alive = false;
    var info = hb.info;
    emit(world, { type: 'vfxEnd', key: 'hb:' + hb.uid });
    emit(world, { type: 'hitboxEnd', hb: hb, id: hb.id, reason: reason, pos: { x: hb.pos.x, z: hb.pos.z } });
    if (reason === 'ownerDie' || reason === 'cancel') return;
    var ids = info.destroyHitBoxId || [];
    for (var i = 0; i < ids.length; i++) HitBox.spawn(world, hb.owner, ids[i], { at: hb.pos, dir: hb.dir, skillId: hb.skillId, triggerTarget: hb.triggerTarget });
    if (info.ExtraUnitIdOnDestroy) {
      emit(world, { type: 'extraUnit', id: info.ExtraUnitIdOnDestroy, owner: hb.owner, pos: { x: hb.pos.x, z: hb.pos.z }, dir: hb.dir });
      if (world.spawnExtraUnit) world.spawnExtraUnit(info.ExtraUnitIdOnDestroy, hb.owner, { x: hb.pos.x, z: hb.pos.z }, hb.dir);
    }
    if ((info.ActionEventsOnDestroy || []).length && VD.Skill) VD.Skill.runEvents(world, hb.owner, info.ActionEventsOnDestroy, { pos: hb.pos, dir: hb.dir, skillId: hb.skillId });
  }
  HitBox.destroy = destroy;
  HitBox.cancel = function (world, hb) { destroy(world, hb, 'cancel'); };

  // ======================= iterator (HitBoxIteratorEvent) =======================
  // Arc: TotalCount lần, cách nhau HitBoxDelay; TotalAngle=0 → cùng hướng (+ lệch ngẫu nhiên StartAngleOffsetMin..Max);
  // TotalAngle≥360 → chia đều i·360/N; khác → trải −A/2..A/2. Custom: CustomData[i] (offset cục bộ, góc, trễ thêm).
  // StartPositionOffsetMin..Max: đẩy ngẫu nhiên dọc hướng. [SUY LUẬN] — xem SKILLVM.md §3.4
  HitBox.iterate = function (world, owner, ev, opt) {
    var it = { owner: owner, ev: ev, cfg: ev.HitBoxIterator || {}, t: 0, i: 0, dead: false, run: opt.run || null, skillId: opt.skillId,
      triggerTarget: opt.triggerTarget || null, basePos: { x: owner.pos.x, z: owner.pos.z }, baseDir: norm(owner.aim || { x: 0, z: 1 }),
      spawnType: ev.SpawnPositionType || 'Owner', pending: [] };
    if (it.spawnType === 'Aim') it.basePos = aimPoint(owner);
    world.hbIters = world.hbIters || [];
    world.hbIters.push(it);
    return it;
  };
  function iterStep(world, it, dt) {
    var c = it.cfg, n = c.TotalCount || 0, delay = num(c.HitBoxDelay);
    it.t += dt;
    while (!it.dead && it.i < n) {
      var cd = (c.CustomData || []);
      var idx = c.UseCustomOrder && c.CustomOrderIdx && c.CustomOrderIdx.length ? c.CustomOrderIdx[it.i % c.CustomOrderIdx.length] : it.i;
      var custom = c.IteratorType === 'Custom' && cd.length ? cd[idx % cd.length] : null;
      var when = it.i * delay + (custom ? num(custom.CustomAdditionalDelay) : 0);
      if (it.t < when - 1e-9) break;
      spawnOne(world, it, it.i, custom);
      it.i++;
    }
    for (var k = it.pending.length - 1; k >= 0; k--) {
      var p = it.pending[k];
      p.t -= dt;
      if (p.t <= 1e-9) { it.pending.splice(k, 1); HitBox.spawn(world, it.owner, c.HitBoxId, p.opt); }
    }
    if (it.i >= n && !it.pending.length) it.dead = true;
  }
  function spawnOne(world, it, i, custom) {
    var c = it.cfg, owner = it.owner, n = c.TotalCount || 1;
    var base = c.UpdateBasePositionEveryFrame ? (it.spawnType === 'Aim' ? aimPoint(owner) : { x: owner.pos.x, z: owner.pos.z }) : it.basePos;
    var dir = c.UpdateAimEveryFrame ? norm(owner.aim) : it.baseDir;
    var bases = [base];
    if (it.spawnType === 'AllPlayers') {
      bases = [];
      var maxD = num(it.ev.TargetPlayerMaxDistance);
      (world.units || []).forEach(function (u) {
        if (u.kind !== 'char' || u.dead) return;
        if (maxD > 0 && len(u.pos.x - owner.pos.x, u.pos.z - owner.pos.z) > maxD) return;
        bases.push({ x: u.pos.x, z: u.pos.z });
      });
    }
    var ang = 0;
    if (c.IteratorType === 'Arc') {
      var A = c.TotalAngle || 0;
      ang = A >= 360 ? i * A / n : A > 0 && n > 1 ? -A / 2 + A * i / (n - 1) : 0;
    }
    if (custom) ang += num(custom.CustomAngle);
    ang += randRange(world, c.StartAngleOffsetMin, c.StartAngleOffsetMax);
    var d2 = norm(rot(dir, ang));
    var fwd = randRange(world, c.StartPositionOffsetMin, c.StartPositionOffsetMax);
    var lo = custom ? vec3(custom.CustomPositionOffset) : { x: 0, y: 0, z: 0 };
    var ind = c.IndicatorInfo;
    for (var b = 0; b < bases.length; b++) {
      var at = { x: bases[b].x + d2.x * fwd, z: bases[b].z + d2.z * fwd };
      if ((c.MonsterInfos || []).length) {
        emit(world, { type: 'summon', owner: owner, monsters: c.MonsterInfos, pos: at });
        if (world.summon) world.summon(owner, c.MonsterInfos, at);
        continue;
      }
      var opt = { at: at, dir: d2, localOffset: lo, skillId: it.skillId, run: it.run, triggerTarget: it.triggerTarget };
      var delay = 0;
      if (ind && ind.IndicatorVfxType && ind.IndicatorVfxType !== 'None') {
        emit(world, { type: 'indicator', owner: owner, info: ind, pos: at, dir: d2 });
        if (ind.HitBoxId > 0) HitBox.spawn(world, owner, ind.HitBoxId, { at: at, dir: d2, skillId: it.skillId });
        delay = num(ind.HitBoxSpawnDelay);
      }
      if (delay > 0) it.pending.push({ t: delay, opt: opt });
      else HitBox.spawn(world, owner, c.HitBoxId, opt);
    }
  }
  HitBox.cancelIter = function (world, it) { if (it) it.dead = true; };

  // ======================= cập nhật mỗi khung =======================
  HitBox.update = function (world, dt) {
    var its = world.hbIters || [];
    for (var j = 0; j < its.length; j++) if (!its[j].dead) iterStep(world, its[j], dt);
    world.hbIters = its.filter(function (x) { return !x.dead; });
    var hbs = world.hitboxes || [];
    var units = world.units || [];
    for (var i = 0; i < hbs.length; i++) {
      var hb = hbs[i];
      if (!hb.alive) continue;
      if (!hb.started) {
        hb.delay -= dt;
        if (hb.delay > 1e-9) continue;
        startHB(world, hb);
      }
      var wall = moveHB(world, hb, dt);
      if (wall) {
        var cd = hb.info.collisionDestroy;
        if (cd === 'WallOnly' || cd === 'Once' || cd === 'Pierce') {
          hb.pos.x = wall.x; hb.pos.z = wall.z;
          destroy(world, hb, 'wall');
          continue;
        }
      }
      if (collisionActive(hb)) {
        for (var k = 0; k < units.length && hb.alive; k++) {
          var u = units[k];
          if (u.dead || !u.buffs) continue;
          var last = hb.hits[u.uid];
          if (last != null && !(hb.multi > 0 && hb.t - last >= hb.multi - 1e-9)) continue;
          if (!targetable(hb, u)) continue;
          if (!overlaps(hb, u)) continue;
          if (!hb.info.ignoreObstaclesForCollision && world.raycastWall && world.raycastWall({ x: hb.pos.x, z: hb.pos.z }, u.pos)) continue;
          if (!hitUnit(world, hb, u)) continue;
          var cdm = hb.info.collisionDestroy;
          if (cdm === 'Once' && hb.alive) destroy(world, hb, 'hit');
          else if (cdm === 'Pierce' && hb.hitCount >= Math.max(1, hb.info.pierceCount || 1) && hb.alive) destroy(world, hb, 'pierce');
        }
      }
      hb.t += dt;
      if (hb.alive && (hb.arrived || hb.t >= hb.dur - 1e-9)) destroy(world, hb, hb.arrived ? 'arrived' : 'expire');
    }
    world.hitboxes = hbs.filter(function (x) { return x.alive; });
  };

  HitBox.overlaps = overlaps;
  HitBox.dotDamage = dotDamage;
  HitBox.heal = Combat.heal;
  HitBox.stressDamage = Combat.stressDamage;
  HitBox.stressRecover = Combat.stressRecover;
  HitBox.damage = Combat.applyDamage;
  VD.HitBox = HitBox;
})(window.VD = window.VD || {});
