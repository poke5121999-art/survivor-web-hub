// skill.js — bộ thông dịch cây RootActionNode gốc của Skill.csv (Void Diver web).
// Luật chọn node, cửa sổ huỷ/đệm phím, di chuyển theo đường cong, trigger: docs/SKILLVM.md §2.
// Không code tay skill nào: mọi hành vi đi qua bảng EVENTS[$type] và MATCH[trigger $type].
//
// ─────────────────────────── GIAO DIỆN THẾ GIỚI (world) ───────────────────────────
// Lõi chiến đấu không biết three.js/Spine/âm thanh. Nó cần một object `world`:
//   world.units        : mảng Unit (xem Skill.makeUnit). Bắt buộc.
//   world.time         : giây, do Skill.step tăng.
//   world.emit(evt)    : nhận sự kiện trình bày (bắt buộc nếu muốn thấy/nghe gì):
//       {type:'anim', unit, name, moveName, loop, offset, speeds, timeScale}   — đổi clip Spine
//       {type:'animMove', unit, moving}                                          — đổi sang moveAnimationName khi đi trong skill
//       {type:'vfx', name, unit|pos, bone, offset, dir, duration, loop, speeds, follow, key} / {type:'vfxEnd', key}
//       {type:'sfx', name, unit|pos}
//       {type:'indicator', owner, info|kind, pos, dir, ...}
//       {type:'hitbox'|'hitboxEnd', hb, ...}            — để vẽ debug hình va chạm
//       {type:'damage', src, tgt, amount, crit, back, preDef, killed, shieldAbsorbed, pos, t}
//       {type:'hitstop', dur, src, tgt}  {type:'shake', unit, amp, freq, dur, localOnly}  {type:'flash', unit}
//       {type:'cc', unit, ccType, dur, dir, dist, moveDur}  {type:'ccEnd', unit}  {type:'parry', unit, src}
//       {type:'buff'|'buffRemoved'|'buffFx', ...} {type:'shield'|'heal'|'stress'|'soul'|'death', ...}
//       {type:'teleport', unit, from, to} {type:'summon', ...} {type:'monologue', unit, text} {type:'skin', unit, super}
//       {type:'skill', unit, skillId} {type:'node', unit, skillId, text} {type:'skillEnd', unit, skillId, reason}
//   world.rng()        : [0,1) (tuỳ chọn; mặc định Math.random) — test dùng RNG cố định.
//   world.moveUnit(u, dx, dz, {ignoreUnits}) → {x, z, blocked} (tuỳ chọn; mặc định cộng thẳng vào u.pos)
//   world.raycastWall(a{x,z}, b{x,z}) → {x,z}|null  (tuỳ chọn; chặn đạn, dịch chuyển, tầm nhìn)
//   world.teleportUnit(u, to) → {x,z} (tuỳ chọn), world.summon(owner, infos, pos), world.spawnExtraUnit(id, owner, pos, dir),
//   world.spreadAggro(u, dist) (tuỳ chọn)
//   world.difficulty   : 'Easy'|'Normal'|'Hard'|'Insane'|null (Difficulty.csv)
//   world.skillLocomotion : false để tắt việc skill.js tự cho nhân vật đi bộ khi rảnh.
// Input nhân vật: u.input = { move:{x,z}, aim:{x,z}|null, aimPoint:{x,z}|null, buttons:{attack, dash, skill0..skill4} }.
// Quái: ai.js gọi Skill.cast(world, u, skillId) và đặt u.target / u.aim.
// Mỗi khung: VD.Skill.step(world, dt).
(function (VD) {
  'use strict';
  var num = VD.num;
  var EPS = 1e-6;

  function db() { return VD.combatDB(); }
  function emit(world, e) { if (world && world.emit) world.emit(e); }
  function rng(world) { return world && world.rng ? world.rng() : Math.random(); }
  function T(t) { return String(t || '').split(',')[0].split('.').pop(); }
  function len(x, z) { return Math.sqrt(x * x + z * z); }
  function norm(v) { var l = v ? len(v.x, v.z) : 0; return l > 1e-9 ? { x: v.x / l, z: v.z / l } : null; }
  function stat(u, k) { return VD.Stats.get(u, k); }

  var Skill = {};
  var stats = Skill.stats = { seen: {}, handled: {}, unhandled: {}, triggersSeen: {} };
  function noteSeen(world, kind, name, ok) {
    var s = world ? (world.combatStats = world.combatStats || { seen: {}, handled: {}, unhandled: {} }) : stats;
    var key = kind + ':' + name;
    s.seen[key] = (s.seen[key] || 0) + 1;
    if (ok) s.handled[key] = (s.handled[key] || 0) + 1; else s.unhandled[key] = (s.unhandled[key] || 0) + 1;
  }

  // ======================= đường cong Unity (AnimationCurve, hermite) =======================
  function evalCurve(keys, t) {
    if (!keys || !keys.length) return 1;
    var n = keys.length;
    var k0 = keys[0], kn = keys[n - 1];
    if (t <= num(k0.time)) return num(k0.value);
    if (t >= num(kn.time)) return num(kn.value);
    for (var i = 0; i < n - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      var ta = num(a.time), tb = num(b.time);
      if (t > tb) continue;
      var dt = tb - ta;
      if (dt <= 0) return num(b.value);
      var s = (t - ta) / dt;
      var m0 = num(a.outTangent) * dt, m1 = num(b.inTangent) * dt;
      if (!isFinite(m0) || !isFinite(m1)) return num(a.value); // tiếp tuyến vô hạn = bậc thang
      var s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * num(a.value) + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * num(b.value) + (s3 - s2) * m1;
    }
    return num(kn.value);
  }
  function integrate(fn, a, b) { // Simpson 16 đoạn
    if (b <= a) return 0;
    var n = 16, h = (b - a) / n, s = fn(a) + fn(b);
    for (var i = 1; i < n; i++) s += fn(a + i * h) * (i % 2 ? 4 : 2);
    return s * h / 3;
  }
  var _meanCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function curveMean(keys) {
    if (!keys || !keys.length) return 1;
    if (_meanCache && _meanCache.has(keys)) return _meanCache.get(keys);
    var m = integrate(function (x) { return evalCurve(keys, x); }, 0, 1);
    if (_meanCache) _meanCache.set(keys, m);
    return m;
  }
  Skill.evalCurve = evalCurve;
  Skill.curveMean = curveMean;
  Skill.integrate = integrate;

  // animationSpeeds: [{endTime, speed}] — endTime là THỜI GIAN CLIP (không phải thời gian node) [ĐO] SKILLVM §2.5.
  // Trả thời gian clip sau realT giây, bắt đầu từ offset. Sau endTime cuối: tốc độ 1.
  Skill.animTimeAt = function (speeds, offset, realT) {
    var a = offset || 0, left = realT;
    speeds = speeds || [];
    for (var i = 0; i < speeds.length && left > 0; i++) {
      var end = num(speeds[i].endTime), sp = num(speeds[i].speed) || 1;
      if (a >= end) continue;
      var need = (end - a) / sp;
      if (left <= need) return a + left * sp;
      left -= need; a = end;
    }
    return a + left;
  };
  // Ngược lại: bao nhiêu giây thật để clip đi từ offset tới animT.
  Skill.realTimeAt = function (speeds, offset, animT) {
    var a = offset || 0, r = 0;
    speeds = speeds || [];
    for (var i = 0; i < speeds.length && a < animT; i++) {
      var end = num(speeds[i].endTime), sp = num(speeds[i].speed) || 1;
      if (a >= end) continue;
      var seg = Math.min(end, animT) - a;
      r += seg / sp; a += seg;
    }
    if (a < animT) r += animT - a;
    return r;
  };

  // ======================= điều kiện =======================
  var CMP = {
    Equal: function (a, b) { return a === b; }, NotEqual: function (a, b) { return a !== b; },
    LessThan: function (a, b) { return a < b; }, LessThanOrEqual: function (a, b) { return a <= b; },
    GreaterThan: function (a, b) { return a > b; }, GreaterThanOrEqual: function (a, b) { return a >= b; },
    Less: function (a, b) { return a < b; }, Greater: function (a, b) { return a > b; },
    LessEqual: function (a, b) { return a <= b; }, GreaterEqual: function (a, b) { return a >= b; }
  };
  // BuffCondition {ConditionOwnerType, BuffConditionType, BuffConditionCasterType, CheckNotContainsCasterType, BuffId, BuffStack}
  Skill.buffCond = function (who, c, skillOwner) {
    if (!who || !who.buffs) return false;
    var inst = who.buffs.get(c.BuffId);
    var st = inst ? inst.stacks : 0;
    if (inst && c.BuffConditionCasterType === 'SkillOwner' && inst.caster !== skillOwner) st = 0;
    if (c.CheckNotContainsCasterType) {
      var mine = inst && inst.caster === skillOwner ? inst.stacks : 0;
      return mine === 0;
    }
    if (!c.BuffConditionType || c.BuffConditionType === 'None') return true;
    var f = CMP[c.BuffConditionType];
    return f ? f(st, num(c.BuffStack)) : true;
  };
  function condsOK(list, u, trig) {
    for (var i = 0; list && i < list.length; i++) {
      var c = list[i];
      var who = c.ConditionOwnerType === 'TriggerTarget' ? trig : u;
      if (!Skill.buffCond(who, c, u)) return false;
    }
    return true;
  }
  function talentsOK(list, u) {
    for (var i = 0; list && i < list.length; i++) {
      var owned = !!(u.talents && u.talents[list[i].TalentId]);
      if (list[i].TalentConditionType === 'Owned' && !owned) return false;
      if (list[i].TalentConditionType === 'NotOwned' && owned) return false;
    }
    return true;
  }
  function nodeOK(a, u, trig) { return condsOK(a.BuffConditionList, u, trig) && talentsOK(a.TalentConditionList, u); }
  Skill.nodeOK = nodeOK;

  // ======================= đơn vị =======================
  var _uid = 1;
  // spec: { kind:'char'|'mon'|'extra', id, pos:{x,z}, aim:{x,z}, team, weaponId, equipmentIds, difficulty, radius, talents:{id:true}, add }
  Skill.makeUnit = function (world, spec) {
    var kind = spec.kind || 'char';
    var row = kind === 'char' ? db().character(spec.id) : kind === 'mon' ? db().monster(spec.id) : db().extraUnit(spec.id);
    if (!row) throw new Error('unit row not found: ' + kind + ' ' + spec.id);
    var sb = VD.Stats.base(db(), kind, row, { weaponId: spec.weaponId, equipmentIds: spec.equipmentIds, difficulty: spec.difficulty || (world && world.difficulty) });
    var u = {
      uid: spec.uid || _uid++, kind: kind, id: spec.id, row: row,
      pos: { x: spec.pos ? spec.pos.x : 0, z: spec.pos ? spec.pos.z : 0 },
      aim: norm(spec.aim) || { x: 0, z: 1 },
      team: spec.team || (kind === 'char' ? 'player' : 'mon'),
      faction: kind === 'mon' ? row.FactionId : null,
      categories: row.MonsterCategories || [], monsterType: row.MonsterType || (kind === 'char' ? 'Character' : 'Extra'),
      radius: spec.radius != null ? spec.radius : 0.3, // không có trong bảng: capsule prefab (ASSETS.md §1.3: nhân vật 0.18, zombie 0.2)
      base: sb.base, baseFlat: sb.flat, stats: null,
      stress: 0, soul: 0, charge: 0, light: kind === 'char' ? db().c('LightFuelDefault', 100) : null,
      cd: {}, stacks: {}, stackT: {}, run: null, bgRuns: [], trigQ: [], state: 'Idle',
      input: kind === 'char' ? { move: { x: 0, z: 0 }, aim: null, aimPoint: null, buttons: {} } : null,
      btnPrev: {}, inputBuf: [], talents: spec.talents || {}, polymorph: false, target: null, dead: false,
      staminaIdle: 99, moving: false
    };
    u.buffs = new VD.BuffSet(u);
    VD.Stats.compute(u);
    u.hp = u.stats.HpMax;
    u.stamina = u.stats.StaminaMax;
    bindSkills(u);
    if (world && spec.add !== false) {
      world.units = world.units || [];
      world.units.push(u);
      Skill.initPassives(world, u);
    }
    return u;
  };
  // Dựng danh sách skill + skill trigger từ u.row (gọi lại khi quái lên pha, AI.phaseUp).
  function bindSkills(u) {
    u.skillIds = skillListOf(u);
    u.triggerSkills = [];
    for (var i = 0; i < u.skillIds.length; i++) {
      var sk = db().skill(u.skillIds[i]);
      if (!sk || sk.SkillType === 'Preview' || !sk.RootActionNode) continue;
      if (num(sk.StackCount) > 1 && u.stacks[sk.Id] == null) { u.stacks[sk.Id] = num(sk.StackCount); u.stackT[sk.Id] = 0; }
      var trig = sk.RootActionNode.skillAction.SkillTrigger;
      if (sk.SkillType === 'Passive' || (trig && T(trig.$type) !== 'SkillInputTrigger')) u.triggerSkills.push(sk);
    }
  }
  Skill.bindSkills = bindSkills;
  function skillListOf(u) {
    var r = u.row, out = [];
    function add(x) { if (x && x > 0 && out.indexOf(x) < 0) out.push(x); }
    (r.PassiveSkillIds || []).forEach(add);
    add(r.AttackSkillId); add(r.DashSkillId);
    (r.ActiveSkillIds || []).forEach(add);
    add(r.PolymorphAttackSkillId); add(r.PolymorphDashSkillId);
    (r.PolymorphActiveSkillIds || []).forEach(add);
    add(r.ActionSkillId);
    return out;
  }
  Skill.initPassives = function (world, u) {
    (u.row.PassiveSkillIds || []).forEach(function (pid) { Skill.fire(world, u, 'AddPassiveSkillTrigger', { skillId: pid }); });
    flushTriggers(world);
  };

  // Ô phím → id skill (polymorph, rồi ChangeSkill của buff)
  Skill.slotSkill = function (u, slot) {
    var r = u.row, poly = u.polymorph, id = 0;
    if (slot === 'attack') id = poly && r.PolymorphAttackSkillId ? r.PolymorphAttackSkillId : r.AttackSkillId;
    else if (slot === 'dash') id = poly && r.PolymorphDashSkillId ? r.PolymorphDashSkillId : r.DashSkillId;
    else {
      var m = /^skill(\d)$/.exec(slot);
      if (m) {
        var list = poly && r.PolymorphActiveSkillIds && r.PolymorphActiveSkillIds.length ? r.PolymorphActiveSkillIds : r.ActiveSkillIds || [];
        // Polymorph giữ đúng vị trí ô: tra theo id gốc ở ActiveSkillIds[i] → PolymorphActiveSkillIds cùng "id+1" nếu có
        var baseId = (r.ActiveSkillIds || [])[+m[1]];
        id = baseId;
        if (poly && r.PolymorphActiveSkillIds) {
          for (var i = 0; i < list.length; i++) if (list[i] === baseId + 1) id = list[i];
        }
      }
    }
    return id ? u.buffs.changeSkill(id) : 0;
  };
  var SLOTS = ['dash', 'skill0', 'skill1', 'skill2', 'skill3', 'skill4', 'attack'];

  function setState(world, u, s) {
    if (u.state === s) return;
    var prev = u.state;
    u.state = s;
    Skill.fire(world, u, 'StateChangeSkillTrigger', { state: s, prev: prev });
  }
  Skill.setState = setState;

  // ======================= bắt đầu / huỷ skill =======================
  function treeHas(node, flag) {
    if (node.skillAction && node.skillAction[flag]) return true;
    var ch = node.childNodes || [];
    for (var i = 0; i < ch.length; i++) if (treeHas(ch[i], flag)) return true;
    return false;
  }
  // Kiểm tra có thể dùng skill: sống, không bị CC, không Silence (trừ IgnoreSilence), hết hồi chiêu, đủ tài nguyên, DeactivateBuffCondition.
  Skill.canUse = function (world, u, row) {
    if (!row || !row.RootActionNode || u.dead) return false;
    if (u.buffs.stunned()) return false;
    if (!row.IgnoreSilence && u.buffs.has('Silence')) return false;
    if ((u.cd[row.Id] || 0) > EPS) return false;
    var dc = row.DeactivateBuffCondition;
    if (dc && dc.BuffId > 0 && dc.CompareType && dc.CompareType !== 'None' && CMP[dc.CompareType] && CMP[dc.CompareType](u.buffs.stacks(dc.BuffId), num(dc.StackCount))) return false;
    var root = row.RootActionNode;
    if (treeHas(root, 'IsUsingCost')) {
      if (u.stamina + EPS < num(row.StaminaCost)) return false;
      if (num(row.HpCost) > 0 && u.hp <= num(row.HpCost)) return false;
      if (num(row.ChargeCost) > 0 && u.charge + EPS < num(row.ChargeCost)) return false;
    }
    if (num(row.StackCount) > 1 && treeHas(root, 'IsUsingStack') && (u.stacks[row.Id] || 0) < 1) {
      // node không dùng stack (vd Noah bất tử) vẫn cho qua — kiểm lại khi vào node
      if (!anyNodeWithout(root, 'IsUsingStack', u)) return false;
    }
    return nodeOK(root.skillAction, u, null);
  };
  function anyNodeWithout(root, flag, u) {
    var ch = root.childNodes || [];
    for (var i = 0; i < ch.length; i++) {
      var a = ch[i].skillAction;
      if (!a.SkillTrigger && !a[flag] && nodeOK(a, u, null)) return true;
    }
    return false;
  }

  // via: { slot, triggerTarget, force }
  Skill.start = function (world, u, skillId, via) {
    via = via || {};
    var row = db().skill(skillId);
    if (!row) { noteSeen(world, 'skill', skillId, false); return null; }
    if (!via.force && !Skill.canUse(world, u, row)) return null;
    if (via.force && (u.dead || !row.RootActionNode)) return null;
    if (u.run) endRun(world, u.run, 'cancel');
    var run = {
      unit: u, skill: row, id: row.Id, slot: via.slot || null, t: 0, fresh: true, node: null, a: null,
      triggerTarget: via.triggerTarget || null, bg: false, startTime: world.time,
      timeScale: (row.SkillTags || []).indexOf('BasicAttack') >= 0 ? (u.stats.AtkSpeed || 1) : 1, // [SUY LUẬN] AtkSpeed tăng tốc đòn thường
      hitboxes: [], iters: [], skillVfx: []
    };
    u.run = run;
    u.inputBuf = u.inputBuf.filter(function (b) { return b.slot !== via.slot; });
    setState(world, u, 'Skill');
    emit(world, { type: 'skill', unit: u, skillId: row.Id, t: world.time });
    Skill.fire(world, u, 'UseSkillByTagSkillTrigger', { tags: row.SkillTags || [], skillId: row.Id });
    enterNode(world, run, row.RootActionNode, 0);
    return run;
  };
  // Quái/AI: dùng skill (bỏ qua trigger phím ở root). Trả run hoặc null.
  Skill.cast = function (world, u, skillId, opts) {
    return Skill.start(world, u, skillId, { force: !!(opts && opts.force), triggerTarget: opts && opts.triggerTarget, slot: opts && opts.slot });
  };
  Skill.interrupt = function (world, u, reason) { if (u.run) endRun(world, u.run, reason || 'interrupt'); };

  function startBg(world, u, row, payload) {
    var run = { unit: u, skill: row, id: row.Id, t: 0, fresh: false, node: null, a: null, triggerTarget: payload && payload.target || null,
      bg: true, payload: payload, startTime: world.time, timeScale: 1, hitboxes: [], iters: [], skillVfx: [] };
    u.bgRuns.push(run);
    enterNode(world, run, row.RootActionNode, 0);
    return run;
  }
  // Chạy danh sách actionEvents rời (HitBox.ActionEventsOnDestroy…) như một node nền.
  Skill.runEvents = function (world, u, events, opts) {
    var node = { skillAction: { text: '(events)', actionDuration: '0', actionEvents: events }, childNodes: [] };
    var run = { unit: u, skill: { Id: opts && opts.skillId, SkillTags: [] }, id: opts && opts.skillId, t: 0, bg: true, node: null,
      triggerTarget: null, startTime: world.time, timeScale: 1, hitboxes: [], iters: [], skillVfx: [], at: opts && opts.pos };
    u.bgRuns.push(run);
    enterNode(world, run, node, 0);
  };

  // ======================= node =======================
  function enterNode(world, run, node, carry) {
    var u = run.unit, a = node.skillAction || {};
    if (a.isDisabledWhenSnared && u.buffs.has('Root')) { endRun(world, run, 'snared'); return; }
    var row = run.skill;
    if (!run.bg) {
      if (a.IsUsingStack && num(row.StackCount) > 1) u.stacks[row.Id] = Math.max(0, (u.stacks[row.Id] || 0) - 1);
      if (a.IsUsingCost) payCost(world, u, row);
      if (a.IsGivingCoolDown) u.cd[row.Id] = VD.Stats.cooldown(db(), u, row, world.difficulty);
    }
    run.node = node; run.a = a; run.t = carry || 0; run.dur = num(a.actionDuration);
    var evs = (a.actionEvents || []).map(function (e, i) { return { e: e, t: num(e.startTime), i: i }; });
    evs.sort(function (x, y) { return x.t - y.t || x.i - y.i; });
    run.events = evs; run.evIdx = 0;
    if (run.bg) { var last = evs.length ? evs[evs.length - 1].t : 0; run.dur = Math.max(run.dur, last); }
    run.removeOnEnd = []; run.nodeIters = []; run.nodeVfx = []; run.buffer = null; run.moveDone = false;
    run.listeners = (node.childNodes || []).filter(function (c) { return c.skillAction && c.skillAction.SkillTrigger; });
    run.seq = (node.childNodes || []).filter(function (c) { return c.skillAction && !c.skillAction.SkillTrigger; });
    if (!run.bg) {
      if (a.UpdateAimOnStart) updateAim(u, a, 0, true);
      if (a.AutoAimToTarget && u.target && !u.target.dead) {
        var d = norm({ x: u.target.pos.x - u.pos.x, z: u.target.pos.z - u.pos.z });
        if (d) u.aim = d;
      }
      setupMove(world, run, a);
      run.anims = (a.SkillAnimationDatas || []).slice();
      run.animAt = 0; run.animIdx = 0;
      playAnims(world, run);
      if (a.indicatorType && a.indicatorType !== 'None') {
        emit(world, { type: 'indicator', owner: u, kind: a.indicatorType, castRange: num(a.castRangeRadius), area: num(a.effectAreaRadius),
          line: num(a.LineLength), angle: num(a.effectAreaAngle), pos: { x: u.pos.x, z: u.pos.z }, dir: u.aim, key: 'ind:' + u.uid, follow: true });
        run.nodeVfx.push('ind:' + u.uid);
      }
      emit(world, { type: 'node', unit: u, skillId: run.id, text: a.text, dur: run.dur, t: world.time });
    }
    processEvents(world, run);
    if (run.unit.run !== run && !run.bg) return; // bị thay trong lúc chạy sự kiện
    if (run.t >= run.dur - EPS) finishNode(world, run, 'end');
  }

  function payCost(world, u, row) {
    var st = num(row.StaminaCost) * (1 + u.buffs.sum('SkillStaminaCostAmplifier', 'Percent') / 100);
    if (st > 0) { u.stamina = Math.max(0, u.stamina - st); u.staminaIdle = 0; }
    if (num(row.HpCost) > 0) { u.hp = Math.max(1, u.hp - num(row.HpCost)); emit(world, { type: 'hpCost', unit: u, amount: num(row.HpCost) }); }
    if (num(row.StressCost) > 0) {
      var sc = num(row.StressCost) * (1 + u.buffs.sum('SkillStressCostAmplifier', 'Percent') / 100);
      u.stress = Math.min(db().c('StressMax', 100), (u.stress || 0) + sc);
      emit(world, { type: 'stress', unit: u, stress: u.stress, delta: sc });
    }
    if (num(row.ChargeCost) > 0) u.charge = Math.max(0, u.charge - num(row.ChargeCost));
    emit(world, { type: 'cost', unit: u, skillId: row.Id, stamina: st });
  }

  function playAnims(world, run) {
    var u = run.unit;
    while (run.animIdx < run.anims.length && run.t >= run.animAt - EPS) {
      var an = run.anims[run.animIdx++];
      emit(world, { type: 'anim', unit: u, name: an.animationName, moveName: an.moveAnimationName || null, loop: !!(an.isLoop || an.IsLoopAnimationData),
        offset: num(an.animStartOffsetTime), speeds: an.animationSpeeds || [], timeScale: run.timeScale, skillId: run.id, t: world.time });
      var d = num(an.duration);
      run.animAt = d > 0 ? run.animAt + d : Infinity;
    }
  }

  function processEvents(world, run) {
    var u = run.unit;
    while (run.evIdx < run.events.length && run.events[run.evIdx].t <= run.t + EPS) {
      var ev = run.events[run.evIdx++].e;
      var type = T(ev.$type);
      if (!condsOK(ev.BuffConditionList, u, run.triggerTarget) || !talentsOK(ev.TalentConditionList, u)) continue;
      var h = EVENTS[type];
      noteSeen(world, 'event', type, !!h);
      if (!h) { emit(world, { type: 'unhandledEvent', eventType: type, skillId: run.id }); continue; }
      var tgt = ev.ActionTarget === 'TriggerTarget' ? run.triggerTarget : u;
      h(world, run, ev, tgt);
      if (!run.bg && u.run !== run) return;
    }
  }

  function finishNode(world, run, why) {
    var u = run.unit;
    cleanupNode(world, run);
    if (why !== 'end') return;
    var carry = Math.max(0, run.t - run.dur);
    for (var i = 0; i < run.seq.length; i++) {
      var c = run.seq[i];
      if (nodeOK(c.skillAction, u, run.triggerTarget)) {
        // node dùng stack mà hết stack → dừng
        if (!run.bg && c.skillAction.IsUsingStack && num(run.skill.StackCount) > 1 && (u.stacks[run.id] || 0) < 1) break;
        enterNode(world, run, c, carry);
        return;
      }
    }
    endRun(world, run, 'end');
  }

  function cleanupNode(world, run) {
    var u = run.unit;
    for (var i = 0; i < run.removeOnEnd.length; i++) u.buffs.remove(world, run.removeOnEnd[i], null, 'remove');
    run.removeOnEnd = [];
    for (var j = 0; j < run.nodeIters.length; j++) VD.HitBox.cancelIter(world, run.nodeIters[j]);
    run.nodeIters = [];
    for (var k = 0; k < run.nodeVfx.length; k++) emit(world, { type: 'vfxEnd', key: run.nodeVfx[k] });
    run.nodeVfx = [];
    if (run.moving) { run.moving = false; emit(world, { type: 'animMove', unit: u, moving: false }); }
  }

  function endRun(world, run, reason) {
    var u = run.unit;
    if (run.ended) return;
    run.ended = true;
    cleanupNode(world, run);
    if (reason === 'cancel' || reason === 'cc' || reason === 'death' || reason === 'interrupt') {
      for (var i = 0; i < run.hitboxes.length; i++) {
        var hb = run.hitboxes[i];
        if (hb.alive && (hb.info.IsCancleOnSkillChange || reason === 'death' && hb.info.IsCancelOnOwnerDie)) VD.HitBox.cancel(world, hb);
      }
    }
    for (var j = 0; j < run.iters.length; j++) if (run.iters[j].ev.CancelOnActionEnd) VD.HitBox.cancelIter(world, run.iters[j]);
    for (var k = 0; k < run.skillVfx.length; k++) emit(world, { type: 'vfxEnd', key: run.skillVfx[k] });
    if (run.bg) {
      var ix = u.bgRuns.indexOf(run);
      if (ix >= 0) u.bgRuns.splice(ix, 1);
      return;
    }
    if (u.run === run) {
      u.run = null;
      if (!u.dead && !u.buffs.cc && reason !== 'cancel') setState(world, u, 'Idle');
    }
    emit(world, { type: 'skillEnd', unit: u, skillId: run.id, reason: reason, t: world.time });
  }

  // ======================= ngắm =======================
  function updateAim(u, a, dt, instant) {
    var want = null;
    if (u.input && u.input.aim) want = norm(u.input.aim);
    else if (u.target && !u.target.dead) want = norm({ x: u.target.pos.x - u.pos.x, z: u.target.pos.z - u.pos.z });
    if (!want) return;
    var lim = num(a.maxAimAnglePerSecond);
    if (instant || !(lim > 0)) { u.aim = want; return; }
    var cur = Math.atan2(u.aim.x, u.aim.z), tg = Math.atan2(want.x, want.z), da = tg - cur;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    var m = lim * Math.PI / 180 * dt;
    da = Math.max(-m, Math.min(m, da));
    u.aim = { x: Math.sin(cur + da), z: Math.cos(cur + da) };
  }

  // ======================= di chuyển trong skill =======================
  // moveType: MoveByInput = đi bộ + ngắm theo chuột mỗi khung; MoveByInputNoAim = đi bộ, hướng khoá. Cả hai: đi bộ tự do theo phím ở MoveSpeed (có buff chậm), trong cửa sổ [moveStart,moveEnd] với moveSpeed>0
  // thì lướt theo phím (không phím → không lướt [SUY LUẬN]). MoveToMoveDir/AimDir/OppositeAimDir/Target/IfAligned/IfOpposite: lướt trong cửa sổ.
  // moveSpeedType: None = moveSpeed × curve(τ); Fixed = moveSpeed hằng; Distance = giữ tổng quãng moveSpeed × (end−start) [SUY LUẬN].
  function setupMove(world, run, a) {
    var u = run.unit, mt = a.moveType || 'None';
    var m = { type: mt, s: num(a.moveStartTime), e: num(a.moveEndTime), v: num(a.moveSpeed), st: a.moveSpeedType || 'None',
      keys: (a.MoveSpeedCurveData && a.MoveSpeedCurveData.Keys) || [], off: num(a.moveOffset), ignore: !!a.ignoreMoveCollision, dir: null, done: false };
    var inMove = u.input && norm(u.input.move);
    if (mt === 'MoveToMoveDir') m.dir = inMove || u.aim;
    else if (mt === 'MoveToAimDir') m.dir = u.aim;
    else if (mt === 'MoveToOppositeAimDir') m.dir = { x: -u.aim.x, z: -u.aim.z };
    else if (mt === 'MoveIfAligned') m.dir = inMove && (inMove.x * u.aim.x + inMove.z * u.aim.z) > 0 ? u.aim : null;
    else if (mt === 'MoveIfOpposite') m.dir = inMove && (inMove.x * u.aim.x + inMove.z * u.aim.z) < 0 ? { x: -u.aim.x, z: -u.aim.z } : null;
    if ((run.skill.SkillTags || []).indexOf('Dash') >= 0) m.v *= 1 + stat(u, 'DashDistancePercent') / 100;
    m.mean = m.st === 'Distance' ? curveMean(m.keys) : 1;
    run.move = m;
  }
  function speedAt(m, t) {
    var span = m.e - m.s;
    var tau = span > 0 ? (t - m.s) / span : 0;
    if (m.st === 'Fixed') return m.v;
    var c = m.keys.length ? evalCurve(m.keys, tau) : 1;
    if (m.st === 'Distance') return m.mean > 1e-6 ? m.v * c / m.mean : m.v;
    return m.v * c;
  }
  function doMove(world, run, t0, t1, dtReal) {
    var u = run.unit, m = run.move;
    if (!m || m.type === 'None' || u.buffs.stunned()) return;
    var rooted = u.buffs.has('Root');
    var burst = m.v > 0 && m.e > m.s;
    var a0 = Math.max(t0, m.s), a1 = Math.min(t1, m.e);
    var inMove = u.input && norm(u.input.move);
    var byInput = m.type === 'MoveByInput' || m.type === 'MoveByInputNoAim';
    if (byInput) {
      if (m.type === 'MoveByInput') updateAim(u, run.a || {}, dtReal, true); // [SUY LUẬN] MoveByInput: ngắm vẫn theo chuột; NoAim: khoá hướng
      if (burst && a1 > a0) {
        if (inMove && !rooted) {
          var d = integrate(function (x) { return speedAt(m, x); }, a0, a1);
          mv(world, u, inMove.x * d, inMove.z * d, m.ignore);
        }
      } else if (!(burst && t1 > m.s && t0 < m.e)) {
        walk(world, run, inMove, dtReal, false);
      }
      return;
    }
    if (!burst || a1 <= a0 || rooted) { checkMoveEnd(world, run, t1); return; }
    var dir = m.dir;
    if (m.type === 'MoveToTarget') {
      var tg = run.triggerTarget || u.target;
      if (tg && !tg.dead) {
        var dx = tg.pos.x - u.pos.x, dz = tg.pos.z - u.pos.z, dist = len(dx, dz);
        var stop = (u.radius || 0) + (tg.radius || 0) + Math.max(0, m.off); // [SUY LUẬN] moveOffset −1 (mọi MoveToTarget) = giá trị trống → dừng khi chạm
        dir = dist > 1e-6 ? { x: dx / dist, z: dz / dist } : null;
        var dd = integrate(function (x) { return speedAt(m, x); }, a0, a1);
        if (dist - dd <= stop) {
          dd = Math.max(0, dist - stop);
          if (dir && dd > 0) mv(world, u, dir.x * dd, dir.z * dd, m.ignore);
          moveFinished(world, run, false);
          return;
        }
        if (dir) u.aim = dir;
        if (dir) { var r = mv(world, u, dir.x * dd, dir.z * dd, m.ignore); if (r && r.blocked) { moveFinished(world, run, true); return; } }
      }
      checkMoveEnd(world, run, t1);
      return;
    }
    if (dir) {
      var dist2 = integrate(function (x) { return speedAt(m, x); }, a0, a1);
      if (m.st === 'Distance' && m.type === 'MoveToAimDir' && u.target && !u.target.dead) {
        // Distance: không vượt quá mục tiêu (dừng ở mép) [SUY LUẬN]
        var gap = len(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) - (u.radius || 0) - (u.target.radius || 0);
        var along = (u.target.pos.x - u.pos.x) * dir.x + (u.target.pos.z - u.pos.z) * dir.z;
        if (along > 0 && gap >= 0) dist2 = Math.min(dist2, gap);
      }
      var r2 = mv(world, u, dir.x * dist2, dir.z * dist2, m.ignore);
      if (r2 && r2.blocked) { moveFinished(world, run, true); return; }
    }
    checkMoveEnd(world, run, t1);
  }
  function checkMoveEnd(world, run, t1) {
    var m = run.move;
    if (m && !m.done && m.e > m.s && t1 >= m.e - EPS) moveFinished(world, run, false);
  }
  function moveFinished(world, run, blocked) {
    if (run.move.done) return;
    run.move.done = true;
    Skill.fire(world, run.unit, 'MoveFinishSkillTrigger', { blocked: blocked });
  }
  function mv(world, u, dx, dz, ignore) {
    if (dx === 0 && dz === 0) return null;
    return VD.Buff.moveUnit(world, u, dx, dz, { ignoreUnits: !!ignore });
  }
  function walk(world, run, dir, dt, faceMove) {
    var u = run.unit;
    var moving = !!dir && !u.buffs.has('Root');
    if (moving) {
      var sp = stat(u, 'MoveSpeed');
      if (!faceMove && (dir.x * u.aim.x + dir.z * u.aim.z) < 0) sp *= db().c('BackwardMoveSpeedMultiplier', 0.78);
      mv(world, u, dir.x * sp * dt, dir.z * sp * dt, false);
      if (faceMove) u.aim = dir;
    }
    if (moving !== !!run.moving) { run.moving = moving; emit(world, { type: 'animMove', unit: u, moving: moving }); }
  }

  // ======================= cửa sổ huỷ =======================
  // cancelableTimes[]: {startTime,endTime,ExecuteType,ExecuteTime,IsCancelableByAnySkill,IsCancelableByMove,cancelSkillIds}
  // Trả thời điểm (giờ node) được phép chạy skill mới, hoặc null. Immediate → ngay; SpecifiedTime → max(t, ExecuteTime).
  // Nhiều cửa sổ khớp → chọn thời điểm sớm nhất. [ĐO] Gayoung 10010000: 10010000@0.35 và ANY@0.38 cùng phủ 0.25–0.5.
  function cancelAt(run, skillId) {
    var ws = (run.a && run.a.cancelableTimes) || [];
    var best = null, t = run.t;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (t < num(w.startTime) - EPS || t > num(w.endTime) + EPS) continue;
      if (!w.IsCancelableByAnySkill && (w.cancelSkillIds || []).indexOf(skillId) < 0) continue;
      var at = w.ExecuteType === 'SpecifiedTime' ? Math.max(t, num(w.ExecuteTime)) : t;
      if (best == null || at < best) best = at;
    }
    return best;
  }
  function moveCancelable(run) {
    var ws = (run.a && run.a.cancelableTimes) || [];
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (w.IsCancelableByMove && run.t >= num(w.startTime) - EPS && run.t <= num(w.endTime) + EPS) return true;
    }
    return false;
  }
  Skill.cancelAt = cancelAt;

  // ======================= input nhân vật =======================
  function inputFires(inputType, slot, st, runSlot) {
    // st: {held, pressed, released} theo ô
    switch (inputType) {
      case 'AttackHold': return st.attack.held;
      case 'AttackDown': return st.attack.pressed;
      case 'CurrentInputDown': return runSlot ? st[runSlot].pressed : false;
      case 'CurrentInputUp': return runSlot ? !st[runSlot].held : false; // mức "đã thả" (ổn định với nhấn nhả nhanh) [SUY LUẬN]
      default: return false;
    }
  }
  // second = lượt 2 trong cùng khung (sau khi run tiến thời gian): không tính lại cạnh phím, chỉ dùng phím giữ + phím đệm,
  // để cửa sổ Immediate mở đúng khung nó bắt đầu (không trễ 1 khung).
  function processInput(world, u, second) {
    var inp = u.input;
    if (!inp || u.dead) return;
    var b = inp.buttons || {};
    var st = {};
    var combo = db().c('ComboThresholdTime', 0.15);
    for (var i = 0; i < SLOTS.length; i++) {
      var s = SLOTS[i], held = !!b[s], was = second ? held : !!u.btnPrev[s];
      st[s] = { held: held, pressed: held && !was, released: !held && was };
      if (st[s].pressed) u.inputBuf.push({ slot: s, t: world.time });
      u.btnPrev[s] = held;
    }
    // phím nhấn được nhớ ComboThresholdTime giây [SUY LUẬN]
    u.inputBuf = u.inputBuf.filter(function (x) { return world.time - x.t <= combo + EPS; });
    for (var q = 0; q < u.inputBuf.length; q++) st[u.inputBuf[q].slot].pressed = true;
    if (u.buffs.stunned()) return;
    var run = u.run;
    // 1) node con có SkillInputTrigger của node đang chạy
    if (run && run.listeners) {
      for (var l = 0; l < run.listeners.length; l++) {
        var c = run.listeners[l], tr = c.skillAction.SkillTrigger;
        if (T(tr.$type) !== 'SkillInputTrigger') continue;
        if (!inputFires(tr.SkillInputType, null, st, run.slot)) continue;
        if (!nodeOK(c.skillAction, u, run.triggerTarget)) continue;
        consume(u, tr.SkillInputType === 'AttackDown' || tr.SkillInputType === 'AttackHold' ? 'attack' : run.slot);
        switchTo(world, run, c, null);
        return;
      }
    }
    // 2) dùng skill theo ô
    for (var k = 0; k < SLOTS.length; k++) {
      var slot = SLOTS[k];
      var id = Skill.slotSkill(u, slot);
      if (!id) continue;
      var row = db().skill(id);
      if (!row || !row.RootActionNode) continue;
      var rt = row.RootActionNode.skillAction.SkillTrigger;
      var itype = rt ? rt.SkillInputType : 'CurrentInputDown';
      var want = itype === 'AttackHold' ? st[slot].held || st[slot].pressed : st[slot].pressed;
      if (!want) continue;
      if (!u.run) {
        if (Skill.start(world, u, id, { slot: slot })) { consume(u, slot); return; }
        continue;
      }
      if (u.run.bufferSkill === id) continue;
      var at = cancelAt(u.run, id);
      if (at == null) continue;
      if (!Skill.canUse(world, u, row) && at <= u.run.t + EPS) continue;
      if (at <= u.run.t + EPS) { if (Skill.start(world, u, id, { slot: slot })) { consume(u, slot); return; } }
      else if (!u.run.buffer) { u.run.buffer = { at: at, id: id, slot: slot }; u.run.bufferSkill = id; consume(u, slot); return; }
    }
    // 3) huỷ bằng di chuyển
    if (u.run && inp.move && norm(inp.move) && moveCancelable(u.run)) endRun(world, u.run, 'move');
  }
  function consume(u, slot) { u.inputBuf = u.inputBuf.filter(function (x) { return x.slot !== slot; }); }

  function switchTo(world, run, child, payload) {
    cleanupNode(world, run);
    if (payload && payload.target) run.triggerTarget = payload.target;
    enterNode(world, run, child, 0);
  }

  // ======================= trigger =======================
  // Khớp tham số trigger với payload. Bảng theo $type.
  var MATCH = {
    SkillInputTrigger: function () { return false; },
    AddPassiveSkillTrigger: function (t, p) { return t.SkillId === p.skillId; },
    DamageProvideSkillTrigger: function (t, p) {
      var ids = t.ConditionSkillIds || [];
      if (ids.length && ids.indexOf(p.skillId) < 0) return false;
      if (t.ConditionIsOnlyCritical && !p.crit) return false;
      if (t.ConditionIsOnlyFirstHit && !p.firstHit) return false;
      if (t.ConditionReasonTypes && t.ConditionReasonTypes !== 'None' && t.ConditionReasonTypes !== p.reason) return false;
      return true;
    },
    DamageSkillTrigger: function (t, p) {
      if (t.ConditionIsOnlyCritical && !p.crit) return false;
      if (t.ConditionIsOnlyParryable && !p.parryable) return false;
      if (t.ConditionIsIgnoreBackAttack && p.back) return false;
      return true;
    },
    BuffRemovedSkillTrigger: function (t, p) { return t.BuffId === p.buffId && (!t.OnlyExpired || p.expired); },
    AddBuffSkillTrigger: function (t, p) { return t.BuffId === p.buffId && (!(t.BuffStack > 0) || p.stacks === t.BuffStack); },
    StateChangeSkillTrigger: function (t, p) {
      var sts = t.States || [];
      var inNew = sts.indexOf(p.state) >= 0, inOld = sts.indexOf(p.prev) >= 0;
      return t.Exclude ? (!inNew && inOld) : (inNew && !inOld);
    },
    SoulSkillTrigger: function (t, p, u) { return VD.Buff.cmp(u.soul || 0, t.CompareType, num(t.CompareValue)); }, // num(): tables.js bỏ field = 0
    NoticeDieSkillTrigger: function (t, p, u) {
      var kindOf = function (x) { return !x ? 'None' : x.kind === 'char' ? 'Character' : x.kind === 'mon' ? 'Monster' : 'ExtraUnit'; };
      if (t.SourceUnitType && t.SourceUnitType !== 'None' && kindOf(p.killer) !== t.SourceUnitType) return false;
      if (t.TargetUnitType && t.TargetUnitType !== 'None' && kindOf(p.dead) !== t.TargetUnitType) return false;
      if ((t.SourceUnitIds || []).length && (!p.killer || t.SourceUnitIds.indexOf(p.killer.id) < 0)) return false;
      if ((t.TargetUnitIds || []).length && t.TargetUnitIds.indexOf(p.dead.id) < 0) return false;
      if (t.SourceUnitType === 'Character' && p.killer !== u && t.SourceRelation === 'Self') return false;
      var d = len(p.dead.pos.x - u.pos.x, p.dead.pos.z - u.pos.z);
      return VD.Buff.cmp(d, t.TriggerRangeCompareType || 'LessEqual', num(t.TriggerRange));
    },
    ReviveSkillTrigger: function (t, p) { return !t.OnlySelfRevive || !!p.self; },
    DieSkillTrigger: function () { return true; },
    ParrySkillTrigger: function () { return true; },
    MoveFinishSkillTrigger: function (t, p) { return !t.TriggerOnlyWhenBlocked || p.blocked; },
    ForceSkillTargetUpdateSkillTrigger: function () { return true; },
    MonsterPhaseUpSkillTrigger: function () { return true; },
    CrowdControlProvideSkillTrigger: function (t, p) { var c = t.ConditionCcTypes || []; return !c.length || c.indexOf(p.ccType) >= 0; },
    CrowdControlSkillTrigger: function (t, p) { var c = t.ConditionCcTypes || []; return !c.length || c.indexOf(p.ccType) >= 0; },
    UseSkillByTagSkillTrigger: function (t, p) {
      var c = t.ConditionSkillTags || [];
      for (var i = 0; i < c.length; i++) if ((p.tags || []).indexOf(c[i]) >= 0) return true;
      return false;
    },
    ConsumeItemSkillTrigger: function (t, p) { return !t.ItemId || t.ItemId === p.itemId; }
  };
  Skill.MATCH = MATCH;

  // Đưa trigger vào hàng đợi của unit (xử lý ở điểm an toàn — tránh đổi node giữa vòng sự kiện).
  Skill.fire = function (world, u, type, payload) {
    if (!u) return;
    u.trigQ.push({ type: type, p: payload || {} });
    if (world) { world._trigDirty = true; }
  };
  function dispatch(world, u, type, p) {
    if (!MATCH[type]) { noteSeen(world, 'trigger', type, false); return; }
    // 1) node con đang lắng nghe của run chính
    var run = u.run;
    if (run && run.listeners && !u.dead) {
      for (var i = 0; i < run.listeners.length; i++) {
        var c = run.listeners[i], tr = c.skillAction.SkillTrigger;
        if (T(tr.$type) !== type || !MATCH[type](tr, p, u)) continue;
        var tt = p.target || run.triggerTarget;
        if (!nodeOK(c.skillAction, u, tt)) continue;
        noteSeen(world, 'trigger', type, true);
        switchTo(world, run, c, p);
        break;
      }
    }
    // 2) node con của run nền
    for (var b = 0; b < u.bgRuns.length; b++) {
      var br = u.bgRuns[b];
      for (var j = 0; br.listeners && j < br.listeners.length; j++) {
        var bc = br.listeners[j], btr = bc.skillAction.SkillTrigger;
        if (T(btr.$type) !== type || !MATCH[type](btr, p, u) || !nodeOK(bc.skillAction, u, p.target || br.triggerTarget)) continue;
        switchTo(world, br, bc, p);
        break;
      }
    }
    // 3) skill trigger (passive và active có root trigger không phải phím)
    if (u.dead && type !== 'DieSkillTrigger') return;
    for (var k = 0; k < u.triggerSkills.length; k++) {
      var sk = u.triggerSkills[k], ra = sk.RootActionNode.skillAction, rtr = ra.SkillTrigger;
      if (!rtr || T(rtr.$type) !== type || !MATCH[type](rtr, p, u)) continue;
      if (!nodeOK(ra, u, p.target || null)) continue;
      if ((u.cd[sk.Id] || 0) > EPS) continue;
      noteSeen(world, 'trigger', type, true);
      if (sk.SkillType === 'Active' && ra.actionDuration && num(ra.actionDuration) > 0 && !u.run) Skill.start(world, u, sk.Id, { force: true, triggerTarget: p.target });
      else startBg(world, u, sk, p);
    }
  }
  function flushTriggers(world) {
    var guard = 0;
    var units = world.units || [];
    while (world._trigDirty && guard++ < 64) {
      world._trigDirty = false;
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        while (u.trigQ.length) {
          var q = u.trigQ.shift();
          dispatch(world, u, q.type, q.p);
        }
      }
    }
  }
  Skill.flush = flushTriggers;

  Skill.onSoulChanged = function (world, u) { Skill.fire(world, u, 'SoulSkillTrigger', { soul: u.soul }); };

  // ======================= bảng sự kiện (actionEvents[].$type) =======================
  function spawnPosFor(world, run, ev) {
    return run.at ? { at: run.at } : {};
  }
  var EVENTS = {
    HitBoxEvent: function (world, run, ev) {
      var u = run.unit;
      var maxD = num(ev.TargetPlayerMaxDistance);
      var bases = [null];
      if (ev.SpawnPositionType === 'AllPlayers') {
        bases = (world.units || []).filter(function (x) {
          return x.kind === 'char' && !x.dead && (!(maxD > 0) || len(x.pos.x - u.pos.x, x.pos.z - u.pos.z) <= maxD);
        }).map(function (x) { return { x: x.pos.x, z: x.pos.z }; });
      } else if (maxD > 0) {
        var any = (world.units || []).some(function (x) { return x.kind === 'char' && !x.dead && len(x.pos.x - u.pos.x, x.pos.z - u.pos.z) <= maxD; });
        if (!any) return;
      }
      if (!(ev.Id > 0)) return;
      for (var i = 0; i < bases.length; i++) {
        var o = spawnPosFor(world, run, ev);
        if (bases[i]) o.at = bases[i];
        o.spawnType = ev.SpawnPositionType; o.run = run; o.skillId = run.id; o.triggerTarget = run.triggerTarget;
        var hb = VD.HitBox.spawn(world, u, ev.Id, o);
        if (hb) run.hitboxes.push(hb);
      }
    },
    HitBoxIteratorEvent: function (world, run, ev) {
      var it = VD.HitBox.iterate(world, run.unit, ev, { run: run, skillId: run.id, triggerTarget: run.triggerTarget });
      run.iters.push(it);
      if (ev.CancelOnActionEnd) run.nodeIters.push(it);
    },
    VfxEvent: function (world, run, ev, tgt) {
      var u = tgt || run.unit;
      var key = 'sk:' + run.unit.uid + ':' + run.id + ':' + (world.time.toFixed(4)) + ':' + ev.prefab;
      emit(world, { type: 'vfx', name: ev.prefab, unit: u, bone: ev.boneType, offset: ev.offset, duration: num(ev.duration), loop: !!ev.IsLoop,
        loopDuration: num(ev.LoopDuration), speeds: ev.VfxSpeeds, follow: !ev.IsIndependent, inheritAim: !!ev.InheritAimDir,
        inheritMove: !!ev.InheritMoveDir, updateByAim: !!ev.UpdateByAimDir, dir: run.unit.aim, key: key, pos: run.at || null });
      if (ev.DestroyOnActionEnd) run.nodeVfx.push(key);
      if (ev.DestroyOnSkillEnd) run.skillVfx.push(key);
    },
    IndicatorVfxEvent: function (world, run, ev) {
      var u = run.unit, info = ev.IndicatorInfo || {};
      var base = ev.SpawnPositionType === 'Aim' ? VD.HitBox.aimPoint(u)
        : ev.SpawnPositionType === 'SkillTriggerTarget' && run.triggerTarget ? { x: run.triggerTarget.pos.x, z: run.triggerTarget.pos.z }
          : { x: u.pos.x, z: u.pos.z };
      emit(world, { type: 'indicator', owner: u, info: info, kind: info.IndicatorVfxType, pos: base, dir: u.aim, follow: !info.IsIndependent });
      if (info.HitBoxId > 0) {
        var hb = VD.HitBox.spawn(world, u, info.HitBoxId, { at: info.SpawnHitBoxAtOwnerPosition ? { x: u.pos.x, z: u.pos.z } : base, dir: u.aim,
          run: run, skillId: run.id, triggerTarget: run.triggerTarget, delay: num(info.HitBoxSpawnDelay) });
        if (hb) run.hitboxes.push(hb);
      }
    },
    SfxEvent: function (world, run, ev, tgt) { emit(world, { type: 'sfx', name: ev.Sfx, unit: ev.IsIndependent ? null : (tgt || run.unit), pos: { x: run.unit.pos.x, z: run.unit.pos.z } }); },
    BuffActionEvent: function (world, run, ev, tgt) {
      if (!tgt || tgt.dead) return;
      if (ev.MonsterCondition && ev.MonsterCondition !== 'None' && tgt.monsterType !== ev.MonsterCondition) return;
      if (ev.FactionCondition && ev.FactionCondition !== 'None' && (tgt.categories || []).indexOf(ev.FactionCondition) < 0) return;
      var n = ev.stackAmount != null ? ev.stackAmount : 1;
      if (ev.IsRemove) { tgt.buffs.remove(world, ev.Id, n, 'remove'); return; }
      var inst = tgt.buffs.add(world, ev.Id, n, run.unit);
      if (inst && ev.RemoveOnActionEnd && !run.bg && run.removeOnEnd.indexOf(ev.Id) < 0) run.removeOnEnd.push(ev.Id);
    },
    MonologueActionEvent: function (world, run, ev) {
      if (rng(world) * 100 >= num(ev.ActivationPercent)) return;
      var ms = ev.Messages || [], tot = 0, i;
      for (i = 0; i < ms.length; i++) tot += num(ms[i].Weight);
      var r = rng(world) * tot;
      for (i = 0; i < ms.length; i++) { r -= num(ms[i].Weight); if (r < 0) break; }
      if (ms.length) emit(world, { type: 'monologue', unit: run.unit, text: ms[Math.min(i, ms.length - 1)].Text });
    },
    TeleportActionEvent: function (world, run, ev, tgt) {
      var u = tgt || run.unit;
      var inMove = u.input && norm(u.input.move);
      var dir = ev.DirectionType === 'MoveDirFirstAimSecond' && inMove ? inMove : u.aim;
      if (num(ev.TeleportAngleOffset)) { var a = num(ev.TeleportAngleOffset) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); dir = { x: dir.x * c - dir.z * s, z: dir.x * s + dir.z * c }; }
      var mn = num(ev.MinDistance), mx = num(ev.MaxDistance), d = mn;
      if (mx > mn) {
        var ap = VD.HitBox.aimPoint(u);
        d = Math.max(mn, Math.min(mx, len(ap.x - u.pos.x, ap.z - u.pos.z))); // [SUY LUẬN] tới điểm ngắm, kẹp Min..Max
      }
      d += num(ev.TeleportPositionOffset);
      var from = { x: u.pos.x, z: u.pos.z };
      var to = { x: from.x + dir.x * d, z: from.z + dir.z * d };
      if (world.teleportUnit) to = world.teleportUnit(u, to, { withoutPath: !!ev.CanTeleportWithoutPath }) || to;
      else if (world.raycastWall) { var hit = world.raycastWall(from, to); if (hit) to = { x: hit.x - dir.x * (u.radius || 0), z: hit.z - dir.z * (u.radius || 0) }; }
      u.pos.x = to.x; u.pos.z = to.z;
      emit(world, { type: 'teleport', unit: u, from: from, to: { x: to.x, z: to.z } });
    },
    DamageActionEvent: function (world, run, ev, tgt) {
      if (!tgt || tgt.dead) return;
      VD.Combat.applyDamage(world, run.unit, tgt, ev.DamageInfo || {}, { skillId: run.id, reason: 'Action', canBack: false, from: run.unit.pos });
    },
    CrowdControlActionEvent: function (world, run, ev, tgt) { if (tgt) VD.Combat.applyCC(world, run.unit, tgt, ev.CrowdControlInfo || {}, null); },
    CameraShakeActionEvent: function (world, run, ev) {
      emit(world, { type: 'shake', unit: run.unit, amp: num(ev.ShakeAmplitude), freq: num(ev.ShakeFrequency), dur: num(ev.ShakeDuration), localOnly: !!ev.IsLocalCharacterOnly });
    },
    SummonActionEvent: function (world, run, ev) {
      var u = run.unit, infos = ev.MonsterInfos || [], tot = 0, i;
      for (i = 0; i < infos.length; i++) tot += num(infos[i].Probability);
      var r = rng(world) * tot, pick = infos[0];
      for (i = 0; i < infos.length; i++) { r -= num(infos[i].Probability); if (r < 0) { pick = infos[i]; break; } }
      var off = VD.vec3(ev.SpawnOffset), f = u.aim, rt = { x: -f.z, z: f.x };
      var pos = ev.IgnoreOffsetRotation ? { x: u.pos.x + off.x, z: u.pos.z + off.z } : { x: u.pos.x + rt.x * off.x + f.x * off.z, z: u.pos.z + rt.z * off.x + f.z * off.z };
      emit(world, { type: 'summon', owner: u, monster: pick, pos: pos });
      if (world.summon && pick) world.summon(u, [pick], pos);
    },
    ShieldActionEvent: function (world, run, ev, tgt) {
      var u = tgt || run.unit;
      var st = ev.CoefficientStat && ev.CoefficientStat !== 'None' ? stat(u, ev.CoefficientStat) : 1;
      var amt = num(ev.Value) * st * (ev.CoefficientStat && ev.CoefficientStat !== 'None' ? num(ev.StatFactor) / 100 : 1);
      amt += num(ev.TriggerValueFactor) * ((run.payload && run.payload.amount) || 0);
      VD.Buff.addShield(world, u, ev.ShieldId, amt);
    },
    RecoveryActionEvent: function (world, run, ev, tgt) { if (ev.EffectType === 'HpRecovery' || !ev.EffectType) VD.Combat.heal(world, tgt || run.unit, num(ev.Amount), run.unit); },
    SoulRecoveryActionEvent: function (world, run, ev, tgt) { VD.Buff.changeSoul(world, tgt || run.unit, num(ev.Amount)); },
    KillActionEvent: function (world, run, ev, tgt) { if (tgt && !tgt.dead) VD.Combat.kill(world, tgt, run.unit); },
    SpreadAggroActionEvent: function (world, run, ev, tgt) {
      emit(world, { type: 'aggro', unit: tgt || run.unit, spread: num(ev.Distance), src: run.unit });
      if (world.spreadAggro) world.spreadAggro(tgt || run.unit, num(ev.Distance));
    },
    HitBoxCollectActionEvent: function (world, run, ev) {
      var ids = ev.HitBoxIds || [];
      (world.hitboxes || []).forEach(function (hb) { if (hb.owner === run.unit && ids.indexOf(hb.id) >= 0) hb.collectSpeed = num(ev.CollectingHitBoxSpeed); });
    },
    ForceUpdateTargetActionEvent: function (world, run, ev) {
      var u = run.unit, mx = num(ev.MaxDistance);
      var c = (world.units || []).filter(function (o) {
        if (o === u || o.dead) return false;
        if (o.kind === 'char' && !ev.AllowCharacterTarget) return false;
        if (o.kind !== 'char' && !ev.AllowMonsterTarget) return false;
        if ((ev.MonsterIds || []).length && ev.MonsterIds.indexOf(o.id) < 0) return false;
        if (mx > 0 && len(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > mx) return false;
        if (!ev.ThroughWalls && world.raycastWall && world.raycastWall(u.pos, o.pos)) return false;
        return true;
      });
      if (!c.length) return;
      var pick = ev.PriorityType === 'Random' ? c[Math.floor(rng(world) * c.length) % c.length] : c[0];
      u.target = pick;
      u.targets = ev.PriorityType === 'All' ? c : [pick];
      emit(world, { type: 'target', unit: u, target: pick });
      Skill.fire(world, u, 'ForceSkillTargetUpdateSkillTrigger', { target: pick });
    },
    ChangeSkinActionEvent: function (world, run, ev, tgt) { emit(world, { type: 'skin', unit: tgt || run.unit, super: !!ev.IsSuper }); },
    ApplyPolymorphSkillsActionEvent: function (world, run, ev, tgt) { (tgt || run.unit).polymorph = true; emit(world, { type: 'polymorph', unit: tgt || run.unit, on: true }); },
    RevertPolymorphSkillsActionEvent: function (world, run, ev, tgt) { (tgt || run.unit).polymorph = false; emit(world, { type: 'polymorph', unit: tgt || run.unit, on: false }); },
    StressRecoveryActionEvent: function (world, run, ev, tgt) { VD.Combat.stressRecover(world, tgt || run.unit, randR(world, ev.AmountMin, ev.AmountMax)); },
    StressDamageActionEvent: function (world, run, ev, tgt) { VD.Combat.stressDamage(world, run.unit, tgt || run.unit, randR(world, ev.AmountMin, ev.AmountMax), {}); },
    BrightnessRecoveryActionEvent: function (world, run, ev, tgt) {
      var u = tgt || run.unit;
      if (u.light == null) return;
      u.light = Math.min(db().c('LightFuelMax', 100), u.light + randR(world, ev.AmountMin, ev.AmountMax));
      emit(world, { type: 'light', unit: u, light: u.light });
    },
    RemoveStatusEffectActionEvent: function (world, run, ev, tgt) { (tgt || run.unit).buffs.dispel(world, VD.Buff.parseTags(ev.EffectTags)); },
    // thuộc hệ đồ dùng / nghịch lý / vùng đặc biệt (dive.js): chỉ phát sự kiện
    ConsumeItemActionEvent: function (world, run, ev) { emit(world, { type: 'consumeItem', unit: run.unit, itemId: ev.ItemId }); if (world.consumeItem) world.consumeItem(run.unit, ev.ItemId); },
    ShowConsumeGaugeActionEvent: function (world, run, ev) { emit(world, { type: 'consumeGauge', unit: run.unit, itemId: ev.ItemId, dur: num(ev.Duration) }); },
    AcquireParadoxActionEvent: function (world, run, ev) { emit(world, { type: 'paradox', unit: run.unit, data: ev }); },
    SpecialFieldActionEvent: function (world, run, ev) { emit(world, { type: 'specialField', owner: run.unit, id: ev.SpecialFieldId, pos: run.at || run.unit.pos, radius: num(ev.Radius), shape: ev.ShapeType }); }
  };
  EVENTS._stub = { ConsumeItemActionEvent: 1, ShowConsumeGaugeActionEvent: 1, AcquireParadoxActionEvent: 1, SpecialFieldActionEvent: 1 };
  Skill.EVENTS = EVENTS;
  function randR(world, a, b) { a = num(a); b = num(b); return b > a ? a + (b - a) * rng(world) : a; }

  // ======================= cập nhật run =======================
  function updateRun(world, run, dt) {
    var u = run.unit;
    if (run.startTime === world.time && !run.bg) return; // vừa bắt đầu trong khung này (input/trigger)
    var ds = dt * (run.timeScale || 1);
    var a = run.a || {};
    if (!run.bg && a.UpdateAimOnFrame) updateAim(u, a, ds, false);
    var t0 = run.t, t1 = run.t + ds;
    if (!run.bg) doMove(world, run, t0, Math.min(t1, run.dur > 0 ? run.dur : t1), dt);
    if (run.ended || (!run.bg && u.run !== run)) return;
    run.t = t1;
    processEvents(world, run);
    if (run.ended || (!run.bg && u.run !== run)) return;
    if (!run.bg) playAnims(world, run);
    if (run.buffer && run.t >= run.buffer.at - EPS) {
      var bf = run.buffer;
      run.buffer = null; run.bufferSkill = null;
      if (Skill.start(world, u, bf.id, { slot: bf.slot })) return;
    }
    if (run.t >= run.dur - EPS) finishNode(world, run, 'end');
  }

  // ======================= vòng lặp =======================
  function tickUnit(world, u, dt) {
    if (u.dead) return;
    VD.Stats.compute(u);
    for (var id in u.cd) if (u.cd[id] > 0) u.cd[id] = Math.max(0, u.cd[id] - dt);
    for (var sid in u.stacks) {
      var row = db().skill(+sid), max = num(row && row.StackCount), iv = num(row && row.StackChargeInterval);
      if (u.stacks[sid] < max && iv > 0) {
        u.stackT[sid] = (u.stackT[sid] || 0) + dt;
        if (u.stackT[sid] >= iv - EPS) { u.stackT[sid] -= iv; u.stacks[sid]++; }
      } else u.stackT[sid] = 0;
    }
    // hồi máu / stamina (StaminaRegenDelay) / năng lượng tối thượng (ChargePerSec, BlockSkillCharge)
    if (u.stats.HpRegen > 0 && u.hp < u.stats.HpMax) u.hp = Math.min(u.stats.HpMax, u.hp + u.stats.HpRegen * dt);
    u.staminaIdle += dt;
    if (u.staminaIdle >= db().c('StaminaRegenDelay', 0.5) && u.stamina < u.stats.StaminaMax) u.stamina = Math.min(u.stats.StaminaMax, u.stamina + u.stats.StaminaRegen * dt);
    if (u.kind === 'char') {
      var ult = null;
      (u.row.ActiveSkillIds || []).forEach(function (x) { var r = db().skill(x); if (r && num(r.ChargeCost) > 0) ult = r; });
      if (ult) {
        var blocked = u.buffs.effects('BlockSkillCharge').some(function (x) { return (x.e.SkillIds || []).indexOf(ult.Id) >= 0; });
        if (!blocked) u.charge = Math.min(num(ult.ChargeCost), u.charge + num(ult.ChargePerSec) * (1 + u.buffs.sum('SkillChargeAmplifier', 'Percent') / 100) * dt);
      }
    }
    if (u.critStressCd > 0) u.critStressCd -= dt;
    if (u.groggyT > 0) { u.groggyT -= dt; if (u.groggyT <= 0) u.suppImmuneT = db().c('SuppressionImmunityDuration', 10); }
    else if (u.suppImmuneT > 0) u.suppImmuneT -= dt;
    u.buffs.tick(world, dt);
  }

  Skill.step = function (world, dt) {
    world.time = (world.time || 0) + dt;
    var units = (world.units || []).slice();
    var i;
    for (i = 0; i < units.length; i++) tickUnit(world, units[i], dt);
    flushTriggers(world);
    for (i = 0; i < units.length; i++) if (units[i].input) processInput(world, units[i]);
    flushTriggers(world);
    for (i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.run) updateRun(world, u.run, dt);
      var bgs = u.bgRuns.slice();
      for (var b = 0; b < bgs.length; b++) updateRun(world, bgs[b], dt);
    }
    flushTriggers(world);
    for (i = 0; i < units.length; i++) {
      var uu = units[i];
      if (uu.input && uu.run && uu.run.startTime !== world.time) processInput(world, uu, true);
      if (!uu.run && !uu.dead && world.skillLocomotion !== false && uu.input) locomotion(world, uu, dt);
    }
    flushTriggers(world);
    VD.HitBox.update(world, dt);
    flushTriggers(world);
  };
  function locomotion(world, u, dt) {
    if (u.buffs.stunned()) return;
    var d = norm(u.input.move);
    if (d && !u.buffs.has('Root')) {
      var sp = stat(u, 'MoveSpeed');
      VD.Buff.moveUnit(world, u, d.x * sp * dt, d.z * sp * dt, {});
      u.aim = u.input.aim ? norm(u.input.aim) || u.aim : d;
      setState(world, u, 'Move');
    } else setState(world, u, 'Idle');
  }

  Skill.endRun = endRun;
  VD.Skill = Skill;
})(window.VD = window.VD || {});
