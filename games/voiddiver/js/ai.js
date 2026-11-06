// ai.js — hành vi quái theo đúng cột Monster.csv + Const.csv (Void Diver web). Luật: docs/AI.md.
// Trạng thái hiển thị: u.aiState ∈ 'idle'|'wander'|'curious'|'combat'|'flee'|'pause'|'return'|'dead' (HUD vẽ ? / !).
// Dùng: mỗi khung VD.Skill.step(world, dt) → VD.AI.step(world, dt) → VD.AI.applyLight(world, dt) (đèn pin).
// AI chạy SAU Skill.step: skill AI vừa cast không tiến thời gian trong khung đó (giống skill do phím), nhịp khớp số.
// Lưới đi: world.navWorld (test) hoặc VD.world (world.js): nav Uint8Array (1 = chặn), navW/navH, navCell, navCenter, NAV,
//          raycastShot(ax,az,bx,bz)→t (1 = thông). Di chuyển qua world.moveUnit (skill.js/buff.js).
(function (VD) {
  'use strict';
  var num = VD.num;
  var AI = {};
  var EPS = 1e-6;

  function db() { return VD.combatDB(); }
  function C(name, d) { return db().c(name, d); }
  function emit(world, e) { if (world && world.emit) world.emit(e); }
  function rng(world) { return world && world.rng ? world.rng() : Math.random(); }
  function len(x, z) { return Math.sqrt(x * x + z * z); }
  function dist(a, b) { return len(b.pos.x - a.pos.x, b.pos.z - a.pos.z); }
  function norm(x, z) { var l = len(x, z); return l > 1e-9 ? { x: x / l, z: z / l } : null; }
  function navOf(world) { var n = world.navWorld || VD.world; return n && n.nav ? n : null; }
  function rand(world, a, b) { return a + (b - a) * rng(world); }

  // ======================= khởi tạo =======================
  AI.init = function (world, u, opts) {
    opts = opts || {};
    var row = u.row;
    u.ai = {
      state: 'idle', t: 0, home: { x: u.pos.x, z: u.pos.z }, wait: rand(world, C('WanderWaitTimeMin', 3.5), C('WanderWaitTimeMax', 6.5)),
      target: null, lastSeen: null, lostT: 0, farT: 0, trackT: 0, aggroT: 0, gcd: 0, wasRun: null, chasing: false, kiting: false,
      fleeCd: 0, sfxCd: 0, spawnT: opts.noSpawnDelay ? 0 : num(row.SpawnDelay) + C('MonsterSpawnTime', 0.2), spreadDepth: 0,
      age: 0, lightT: 0, lit: false, anim: null, seenRun: null, pending: null, retargetRolled: {}
    };
    u.aiState = 'idle';
    if (!opts.noSpawnDelay) {
      if (row.SpawnVfx) emit(world, { type: 'vfx', name: row.SpawnVfx, pos: { x: u.pos.x, y: num(row.SpawnVfxOffsetY), z: u.pos.z } });
      if (row.SpawnSfx) emit(world, { type: 'sfx', name: row.SpawnSfx, unit: u });
    }
    return u.ai;
  };

  // ======================= nhìn thấy =======================
  // Nón nhìn: d ≤ SightRange (× BattleSightRangePercent/100 khi đang combat) và lệch hướng ≤ SightAngle/2,
  // hoặc d ≤ SightBackRange (mọi hướng). Chặn bởi tường (raycastShot) trừ khi IgnoreObstaclesForDetection. [ĐO về cột]
  function sight(world, u) {
    var r = u.row, combat = !!(u.ai && u.ai.state === 'combat');
    var range = num(r.SightRange) * (combat ? num(r.BattleSightRangePercent || 100) / 100 : 1);
    if (!combat && world.anomaly) range *= C('AnomalyMonsterNoneCombatSightMultiplier', 0.5);
    var back = num(r.SightBackRange);
    if (u.buffs.has('Blind')) { range = Math.min(range, C('BlindSightRange', 1)); back = Math.min(back, C('BlindSightRange', 1)); }
    var amp = u.buffs.sum('MonsterSightAmplifier', 'Percent');
    if (amp) { range *= 1 + amp / 100; back *= 1 + amp / 100; }
    return { range: range, back: back, angle: num(r.SightAngle) };
  }
  function losClear(world, a, b) {
    var n = navOf(world);
    if (n && n.raycastShot) return n.raycastShot(a.x, a.z, b.x, b.z) >= 1 - EPS;
    if (world.raycastWall) return !world.raycastWall(a, b);
    return true;
  }
  // Trả null (không thấy) hoặc { d, direct } — direct = trong SightRange × MonsterDirectAggroSightRangeMultiplier (nón)
  // hoặc SightBackRange × MonsterDirectAggroSightBackRangeMultiplier (sau lưng) → "!" ngay, còn lại "?" [SUY LUẬN từ tên Const].
  AI.canSee = function (world, u, o) {
    if (!o || o.dead || o === u) return null;
    if (o.buffs && o.buffs.has('Invisible')) return null;
    var s = sight(world, u);
    var dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = len(dx, dz);
    var inBack = d <= s.back + EPS;
    var inCone = false;
    if (d <= s.range + EPS) {
      if (s.angle >= 360 || d < 1e-6) inCone = true;
      else {
        var f = u.aim, c = (dx * f.x + dz * f.z) / d;
        inCone = c >= Math.cos(s.angle / 2 * Math.PI / 180) - EPS;
      }
    }
    if (!inCone && !inBack) return null;
    if (!u.row.IgnoreObstaclesForDetection && !losClear(world, u.pos, o.pos)) return null;
    var direct = (inCone && d <= num(u.row.SightRange) * C('MonsterDirectAggroSightRangeMultiplier', 0.5) + EPS) ||
      d <= s.back * C('MonsterDirectAggroSightBackRangeMultiplier', 0.9) + EPS;
    return { d: d, direct: direct, cone: inCone, back: inBack };
  };

  // Ứng viên mục tiêu: nhân vật (khác team) và quái thuộc phe thù (Faction.EnemyFactionIds). Phe 9999 và −1 không thù quái nào.
  function candidates(world, u) {
    var out = [], units = world.units || [];
    for (var i = 0; i < units.length; i++) {
      var o = units[i];
      if (o === u || o.dead || !VD.Combat.isEnemy(u, o)) continue;
      out.push(o);
    }
    return out;
  }
  // Chọn mục tiêu: TargetHighStressPlayer ưu tiên nhân vật stress ≥ TargetHighStressPlayerTriggerStress; rồi gần nhất.
  function pickTarget(world, u, needSight) {
    var best = null, bs = null, bScore = Infinity;
    var hs = u.row.TargetHighStressPlayer, thr = C('TargetHighStressPlayerTriggerStress', 75);
    var cs = candidates(world, u);
    for (var i = 0; i < cs.length; i++) {
      var o = cs[i], s = needSight ? AI.canSee(world, u, o) : { d: dist(u, o), direct: true };
      if (!s) continue;
      var score = s.d - (hs && o.kind === 'char' && (o.stress || 0) >= thr ? 1000 : 0) - (o.kind === 'char' ? 0.001 : 0);
      if (score < bScore) { bScore = score; best = o; bs = s; }
    }
    return best ? { u: best, s: bs } : null;
  }

  // ======================= chuyển trạng thái =======================
  function setState(world, u, s) {
    var ai = u.ai;
    if (ai.state === s) return;
    var prev = ai.state;
    ai.state = s; ai.t = 0;
    u.aiState = s;
    emit(world, { type: 'aiState', unit: u, state: s, prev: prev, t: world.time });
  }
  function addBuffs(world, u, ids) { (ids || []).forEach(function (b) { u.buffs.add(world, b, 1, u); }); }
  function removeBuffs(world, u, ids) { (ids || []).forEach(function (b) { u.buffs.remove(world, b, null, 'remove'); }); }

  function curious(world, u, tgt) {
    var ai = u.ai;
    ai.target = tgt; ai.trackT = 0; ai.lostT = 0; ai.lastSeen = { x: tgt.pos.x, z: tgt.pos.z };
    setState(world, u, 'curious');
    addBuffs(world, u, u.row.OnCuriousBuffIds);
    emit(world, { type: 'aiMark', unit: u, mark: '?' });
  }
  function aggro(world, u, tgt, spreadDepth) {
    var ai = u.ai;
    var fresh = ai.state !== 'combat';
    ai.target = tgt; ai.lostT = 0; ai.farT = 0; ai.lastSeen = { x: tgt.pos.x, z: tgt.pos.z };
    u.target = tgt;
    if (!fresh) return;
    if (ai.state === 'curious') removeBuffs(world, u, u.row.OnCuriousBuffIds);
    setState(world, u, 'combat');
    ai.aggroT = 0; ai.chasing = true;
    addBuffs(world, u, u.row.OnCombatBuffIds);
    emit(world, { type: 'aiMark', unit: u, mark: '!' });
    emit(world, { type: 'aggro', unit: u, target: tgt, t: world.time });
    if (u.row.AggroSfx && ai.sfxCd <= 0) { emit(world, { type: 'sfx', name: u.row.AggroSfx, unit: u }); ai.sfxCd = C('MonsterAggroSfxCoolTime', 8); }
    // lan aggro cho đồng minh trong TargetSpreadRange, tối đa MonsterAggroChainMax bậc
    var depth = spreadDepth || 0;
    if (depth < C('MonsterAggroChainMax', 1)) {
      var r = C('TargetSpreadRange', 4), units = world.units || [];
      for (var i = 0; i < units.length; i++) {
        var o = units[i];
        if (o === u || o.dead || o.kind !== 'mon' || !o.ai || o.ai.state === 'combat' || VD.Combat.isEnemy(u, o)) continue;
        if (o.row.IgnoreReceiveAggroSpreadEvent || dist(u, o) > r) continue;
        if (!VD.Combat.isEnemy(o, tgt)) continue;
        o.ai.pending = { t: C('MonsterReceiveAggroSpreadStateTime', 0.75), target: tgt, depth: depth + 1 };
      }
    }
  }
  function leaveCombat(world, u, why) {
    var ai = u.ai;
    removeBuffs(world, u, u.row.OnCombatBuffIds);
    removeBuffs(world, u, u.row.OnCuriousBuffIds);
    ai.target = null; u.target = null; ai.lostT = 0;
    emit(world, { type: 'lostTarget', unit: u, why: why, t: world.time });
    setState(world, u, 'return');
    ai.lostStand = C('MonsterLostTargetStateTime', 0.45);
  }

  // ======================= sự kiện từ lõi chiến đấu =======================
  // Bị đánh: kẻ đánh thành mục tiêu; PauseStatePercent → đứng khựng PauseStateDuration; máu ≤ FleeHpPercent → FleePercent chạy trốn.
  AI.onDamaged = function (world, u, src, ev) {
    if (!u.ai || u.kind !== 'mon' || u.dead || ev.killed) return;
    var ai = u.ai, r = u.row;
    if (src && src !== u && VD.Combat.isEnemy(u, src)) {
      if (ai.state !== 'combat') aggro(world, u, src, 0);
      else if (ai.target && ai.target.kind === 'mon' && src.kind === 'char') {
        // đang đánh quái phe khác mà người chơi đánh vào → MonsterRetargetToPlayerChance
        if (rng(world) * 100 < C('MonsterRetargetToPlayerChance', 35)) { ai.target = src; u.target = src; }
      }
    }
    if (ev.reason === 'Dot' || ev.amount <= 0) return;
    var hpPct = 100 * u.hp / u.stats.HpMax;
    if (num(r.FleeDuration) > 0 && ai.fleeCd <= 0 && hpPct <= num(r.FleeHpPercent) + EPS && ai.state !== 'flee') {
      if (rng(world) * 100 < num(r.FleePercent)) {
        ai.fleeFrom = src || ai.target; ai.fleeT = num(r.FleeDuration);
        setState(world, u, 'flee');
        return;
      }
    }
    if (!u.run && ai.state !== 'flee' && ai.state !== 'pause' && num(r.PauseStatePercent) > 0 && rng(world) * 100 < num(r.PauseStatePercent)) {
      ai.pauseT = num(r.PauseStateDuration); ai.pauseBack = ai.state;
      setState(world, u, 'pause');
    }
  };

  // Lên pha: quái có BasePhaseMonsterId, máu về 0 mà còn dòng Phase+1 → đổi dòng, đầy máu, bắn MonsterPhaseUpSkillTrigger.
  AI.beforeDeath = function (world, u, killer) {
    if (u.kind !== 'mon' || !u.row || !(u.row.BasePhaseMonsterId > 0)) return false;
    var next = findPhase(u.row.BasePhaseMonsterId, (u.row.Phase || 0) + 1);
    if (!next) return false;
    var sb = VD.Stats.base(db(), 'mon', next, { difficulty: world.difficulty });
    if (u.run) VD.Skill.interrupt(world, u, 'phase');
    u.row = next; u.id = next.Id; u.base = sb.base; u.baseFlat = sb.flat;
    u.monsterType = next.MonsterType; u.categories = next.MonsterCategories || []; u.faction = next.FactionId;
    VD.Stats.compute(u);
    u.hp = u.stats.HpMax;
    VD.Skill.bindSkills(u);
    (next.PassiveSkillIds || []).forEach(function (p) { VD.Skill.fire(world, u, 'AddPassiveSkillTrigger', { skillId: p }); });
    VD.Skill.fire(world, u, 'MonsterPhaseUpSkillTrigger', { phase: next.Phase, target: killer });
    emit(world, { type: 'phaseUp', unit: u, phase: next.Phase, monsterId: next.Id, t: world.time });
    if (u.ai) u.ai.anim = null;
    return true;
  };
  var _phaseIdx = null, _phaseSrc = null;
  function findPhase(base, phase) {
    var T = db().T.Monster;
    if (_phaseSrc !== T) {
      _phaseSrc = T; _phaseIdx = {};
      (Array.isArray(T) ? T : Object.keys(T || {}).map(function (k) { return T[k]; })).forEach(function (m) {
        if (m.BasePhaseMonsterId > 0) _phaseIdx[m.BasePhaseMonsterId + ':' + m.Phase] = m;
      });
    }
    return _phaseIdx[base + ':' + phase] || null;
  }

  // Hồi sinh (RespawnTime > 0): lớp dive quyết định; mặc định AI tự hồi sinh tại chỗ cũ trừ khi world.respawnMonsters === false.
  AI.respawn = function (world, u) {
    u.dead = false;
    u.buffs.clear(world);
    u.buffs.cc = null;
    u.pos.x = u.ai.home.x; u.pos.z = u.ai.home.z;
    VD.Stats.compute(u);
    u.hp = u.stats.HpMax;
    u.run = null; u.bgRuns = []; u.cd = {};
    AI.init(world, u, {});
    VD.Skill.initPassives(world, u);
    emit(world, { type: 'respawn', unit: u, t: world.time });
  };

  // ======================= chọn skill =======================
  // Tầm skill không nằm ở castRangeRadius (0 ở gần hết skill quái) mà ở AiSkillCondition: Weight>0 mới được AI chọn,
  // TargetConditions / CasterConditions phải đúng hết; chọn ngẫu nhiên theo Weight. [ĐO] (xem docs/AI.md §3)
  var DIFF = { Easy: 0, Normal: 1, Hard: 2, Insane: 3 };
  var AICOND = {
    AiTargetDistanceCondition: function (world, u, t, c) { return !!t && VD.Buff.cmp(dist(u, t), c.compareType, num(c.compareValue)); },
    AiNoHighObstacleToTarget: function (world, u, t) { return !!t && losClear(world, u.pos, t.pos); },
    AiTargetHasCrowdControlCondition: function (world, u, t, c) { return !!(t && t.buffs.cc && t.buffs.cc.type === c.CrowdControlType); },
    AiTargetHasBuffIdCondition: function (world, u, t, c) { return !!(t && t.buffs.stacks(c.BuffId) > 0); },
    AiCasterDifficultyCondition: function (world, u, t, c) { return (DIFF[world.difficulty || 'Normal'] || 0) >= (DIFF[c.Difficulty] || 0); },
    AiCasterHpPercentCondition: function (world, u, t, c) { return VD.Buff.cmp(100 * u.hp / u.stats.HpMax, c.CompareType, num(c.HpPercentValue)); },
    AiCasterNearbyMonsterCountCondition: function (world, u, t, c) { return countNear(world, u, c, function (o) { return o.id === c.MonsterId; }); },
    AiCasterNearbyAllMonsterCountCondition: function (world, u, t, c) { return countNear(world, u, c, function (o) { return o.kind === 'mon'; }); },
    AiCasterNearbyTargetableHitBoxCountCondition: function (world, u, t, c) {
      var n = 0;
      (world.hitboxes || []).forEach(function (hb) {
        if (hb.alive && hb.id === c.TargetableHitBoxId && VD.Buff.cmp(len(hb.pos.x - u.pos.x, hb.pos.z - u.pos.z), c.DistanceCompareType, num(c.DistanceValue))) n++;
      });
      return VD.Buff.cmp(n, c.CountCompareType, num(c.CountValue));
    }
  };
  AI.AICOND = AICOND;
  function countNear(world, u, c, pred) {
    var n = 0, units = world.units || [];
    for (var i = 0; i < units.length; i++) {
      var o = units[i];
      if (o === u || o.dead || !pred(o)) continue;
      if (VD.Buff.cmp(dist(u, o), c.DistanceCompareType, num(c.DistanceValue))) n++;
    }
    return VD.Buff.cmp(n, c.CountCompareType, num(c.CountValue));
  }
  function condsOK(world, u, t, list) {
    for (var i = 0; list && i < list.length; i++) {
      var ty = String(list[i].$type || '').split(',')[0].trim();
      var f = AICOND[ty];
      if (!f) { world.combatUnknown = world.combatUnknown || {}; world.combatUnknown['aiCond:' + ty] = 1; return false; }
      if (!f(world, u, t, list[i])) return false;
    }
    return true;
  }
  AI.usableSkills = function (world, u, t) {
    var out = [], ids = u.row.ActiveSkillIds || [];
    for (var i = 0; i < ids.length; i++) {
      var sk = db().skill(ids[i]);
      if (!sk) continue;
      var ac = sk.AiSkillCondition;
      if (!ac || !(ac.Weight > 0)) continue;
      if (!VD.Skill.canUse(world, u, sk)) continue;
      if (!condsOK(world, u, t, ac.TargetConditions) || !condsOK(world, u, t, ac.CasterConditions)) continue;
      out.push(sk);
    }
    return out;
  };
  function trySkill(world, u, t) {
    var list = AI.usableSkills(world, u, t);
    if (!list.length) return false;
    var tot = 0, i;
    for (i = 0; i < list.length; i++) tot += list[i].AiSkillCondition.Weight;
    var r = rng(world) * tot, pick = list[list.length - 1];
    for (i = 0; i < list.length; i++) { r -= list[i].AiSkillCondition.Weight; if (r < 0) { pick = list[i]; break; } }
    faceTo(u, t.pos);
    var run = VD.Skill.cast(world, u, pick.Id);
    if (run) { u.ai.wasRun = run; emit(world, { type: 'aiCast', unit: u, skillId: pick.Id, t: world.time }); }
    return !!run;
  }
  function gcdOf(world, u) {
    var d = db().difficulty(world.difficulty);
    return num(u.row.GlobalSkillCoolTime) * (d ? num(d.GlobalSkillCoolTimePercent) / 100 : 1);
  }

  // ======================= đường đi: flow field dùng chung =======================
  // Dijkstra (Dial) trên lưới nav 8 hướng, giá 2 (thẳng) / 3 (chéo), không cắt góc. Tính lại ≤ mỗi 0.25 s cho mỗi đích,
  // dùng chung giữa các quái đuổi cùng một đích (khoá = uid mục tiêu hoặc ô đích).
  var REFRESH = 0.25; // không có trong bảng: yêu cầu thiết kế (0.25 s)
  var INF = 0x3fffffff;
  function flowFor(world, key, gx, gz) {
    var n = navOf(world);
    world._flow = world._flow || {};
    var f = world._flow[key];
    if (f && world.time - f.t < REFRESH - EPS) return f;
    var W = n.navW, H = n.navH, grid = n.nav;
    var c = n.navCell(gx, gz), gi = c[0], gj = c[1];
    gi = Math.max(0, Math.min(W - 1, gi)); gj = Math.max(0, Math.min(H - 1, gj));
    if (grid[gj * W + gi]) { var fr = nearestFree(n, gi, gj); if (fr) { gi = fr[0]; gj = fr[1]; } }
    var d = f && f.d.length === W * H ? f.d : new Int32Array(W * H);
    d.fill(INF);
    var buckets = [[], [], [], []], cur = 0, left = 1;
    var start = gj * W + gi;
    d[start] = 0; buckets[0].push(start);
    while (left > 0) {
      var b = buckets[cur % 4];
      if (!b.length) { cur++; continue; }
      var idx = b.pop(); left--;
      if (d[idx] !== cur) continue;
      var i = idx % W, j = (idx / W) | 0;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        var ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        var nidx = nj * W + ni;
        if (grid[nidx]) continue;
        if (di && dj && (grid[j * W + ni] || grid[nj * W + i])) continue; // không cắt góc
        var nd = cur + (di && dj ? 3 : 2);
        if (nd < d[nidx]) { d[nidx] = nd; buckets[nd % 4].push(nidx); left++; }
      }
    }
    f = world._flow[key] = { t: world.time, d: d, gi: gi, gj: gj };
    world.flowBuilds = (world.flowBuilds || 0) + 1;
    return f;
  }
  function nearestFree(n, i0, j0) {
    for (var r = 1; r < 12; r++)
      for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        var i = i0 + di, j = j0 + dj;
        if (i >= 0 && j >= 0 && i < n.navW && j < n.navH && !n.nav[j * n.navW + i]) return [i, j];
      }
    return null;
  }
  // Đoạn thẳng a→b không qua ô nav bị chặn (lấy mẫu mỗi nửa ô).
  function navLineClear(n, a, b) {
    var L = len(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(L / (n.NAV * 0.5)));
    for (var k = 1; k <= steps; k++) {
      var x = a.x + (b.x - a.x) * k / steps, z = a.z + (b.z - a.z) * k / steps;
      var c = n.navCell(x, z);
      if (c[0] < 0 || c[1] < 0 || c[0] >= n.navW || c[1] >= n.navH || n.nav[c[1] * n.navW + c[0]]) return false;
    }
    return true;
  }
  // Hướng đi tới goal: thẳng nếu thông (raycastShot + nav), không thì theo flow field.
  function steerDir(world, u, goal, key) {
    var n = navOf(world);
    var dx = goal.x - u.pos.x, dz = goal.z - u.pos.z;
    if (!n || (losClear(world, u.pos, goal) && navLineClear(n, u.pos, goal))) return norm(dx, dz);
    var f = flowFor(world, key, goal.x, goal.z);
    var c = n.navCell(u.pos.x, u.pos.z), W = n.navW, H = n.navH;
    var i = c[0], j = c[1];
    if (i < 0 || j < 0 || i >= W || j >= H) return norm(dx, dz);
    var here = f.d[j * W + i], best = here, bi = -1, bj = -1;
    for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      var ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      if (di && dj && (n.nav[j * W + ni] || n.nav[nj * W + i])) continue;
      var v = f.d[nj * W + ni];
      if (v < best) { best = v; bi = ni; bj = nj; }
    }
    if (bi < 0) return here === 0 || here >= INF ? norm(dx, dz) : null;
    var p = n.navCenter(bi, bj);
    return norm(p[0] - u.pos.x, p[1] - u.pos.z);
  }
  AI.steerDir = steerDir;

  // Tách đàn: đẩy khỏi quái khác trong (r1 + r2 + 0.15) m.
  function separation(world, u) {
    var sx = 0, sz = 0, units = world.units || [];
    for (var i = 0; i < units.length; i++) {
      var o = units[i];
      if (o === u || o.dead || o.kind !== 'mon') continue;
      var dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d = len(dx, dz);
      var want = (u.radius || 0.3) + (o.radius || 0.3) + 0.15; // không có trong bảng: khe hở tách đàn
      if (d < want) {
        if (d < 1e-4) { dx = (u.uid % 2 ? 1 : -1); dz = 0.3; d = len(dx, dz); }
        var k = (want - d) / want;
        sx += dx / d * k; sz += dz / d * k;
      }
    }
    return { x: sx, z: sz };
  }

  function faceTo(u, p) { var d = norm(p.x - u.pos.x, p.z - u.pos.z); if (d) u.aim = d; }

  // Đi một bước theo hướng dir với tốc độ MoveSpeed; cộng tách đàn; phát anim đi/đứng.
  function walk(world, u, dir, dt, faceMove, speedMul) {
    var sp = VD.Stats.get(u, 'MoveSpeed') * (speedMul || 1);
    var sep = separation(world, u);
    var vx = 0, vz = 0;
    if (dir && !u.buffs.has('Root')) { vx = dir.x * sp; vz = dir.z * sp; }
    vx += sep.x * Math.max(sp, 1); vz += sep.z * Math.max(sp, 1);
    var moved = vx * vx + vz * vz > 1e-8;
    if (moved) {
      VD.Buff.moveUnit(world, u, vx * dt, vz * dt, {});
      if (faceMove && dir) u.aim = dir;
    }
    locoAnim(world, u, dir && !u.buffs.has('Root') ? sp : 0);
    return moved;
  }
  // Anim đi bộ: tốc độ clip = tốc độ / WalkAnimation1xSpeed, kẹp [MinWalkAnimationSpeed, MaxWalkAnimationSpeed];
  // ≥ MoveSpeedThresholdForRun → 'run' (fallback 'walk'). Boss nhiều pha: tiền tố "<Phase>/" (Boss_SoulCollector "0/…").
  function locoAnim(world, u, speed) {
    if (u.run) { u.ai.anim = null; return; }
    var pre = u.row.BasePhaseMonsterId > 0 && u.row.Phase >= 0 ? u.row.Phase + '/' : '';
    var name, sp = 1;
    if (speed > 1e-6) {
      name = speed >= C('MoveSpeedThresholdForRun', 2.4) ? 'run' : 'walk';
      var w1 = num(u.row.WalkAnimation1xSpeed) || 1;
      sp = Math.max(C('MinWalkAnimationSpeed', 0), Math.min(C('MaxWalkAnimationSpeed', 3.5), speed / w1));
    } else name = 'idle';
    var key = pre + name + ':' + sp.toFixed(2);
    if (u.ai.anim === key) return;
    u.ai.anim = key;
    emit(world, { type: 'anim', unit: u, name: pre + name, fallback: name === 'run' ? pre + 'walk' : null, loop: true, speed: sp, locomotion: true, t: world.time });
  }
  AI.locoAnim = locoAnim;

  // ======================= vòng lặp =======================
  AI.step = function (world, dt) {
    var units = (world.units || []).slice();
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.kind !== 'mon') continue;
      if (!u.ai) AI.init(world, u, { noSpawnDelay: true });
      tick(world, u, dt);
    }
  };

  function tick(world, u, dt) {
    var ai = u.ai, r = u.row;
    if (u.dead) {
      if (ai.state !== 'dead') {
        setState(world, u, 'dead');
        if (num(r.RespawnTime) > 0) ai.respawnAt = world.time + num(r.RespawnTime);
        emit(world, { type: 'anim', unit: u, name: 'death', loop: false, speed: 1 });
      }
      if (ai.respawnAt && world.time >= ai.respawnAt - EPS && world.respawnMonsters !== false) AI.respawn(world, u);
      return;
    }
    ai.t += dt; ai.age += dt;
    if (ai.sfxCd > 0) ai.sfxCd -= dt;
    if (ai.fleeCd > 0) ai.fleeCd -= dt;
    if (u.monsterType === 'Shadow' && ai.age >= C('ShadowMonsterLifeTime', 90)) {
      emit(world, { type: 'despawn', unit: u, why: 'shadowLifeTime' });
      u.dead = true; u.hp = 0; setState(world, u, 'dead');
      return;
    }
    if (ai.spawnT > 0) { ai.spawnT -= dt; return; }
    // skill đang chạy: AI không đi; hết skill thì bắt đầu GlobalSkillCoolTime
    if (u.run) { ai.wasRun = u.run; ai.anim = null; return; }
    if (ai.wasRun) { ai.wasRun = null; ai.gcd = gcdOf(world, u); } // khung skill vừa hết: bắt đầu đếm từ khung sau
    else if (ai.gcd > 0) ai.gcd -= dt;
    if (u.buffs.stunned()) { ai.anim = null; return; }
    if (ai.pending && ai.state !== 'combat') {
      ai.pending.t -= dt;
      if (ai.pending.t <= 0) { var p = ai.pending; ai.pending = null; if (!p.target.dead) aggro(world, u, p.target, p.depth); }
    }
    STATES[ai.state](world, u, dt);
  }

  // mỗi trạng thái: nhìn → quyết định → đi
  function scan(world, u) {
    var ai = u.ai, best = pickTarget(world, u, true);
    if (!best) return false;
    if (best.s.direct) aggro(world, u, best.u, 0); else curious(world, u, best.u);
    return true;
  }
  var STATES = {
    idle: function (world, u, dt) {
      var ai = u.ai;
      if (scan(world, u)) return;
      walk(world, u, null, dt);
      if (ai.t >= ai.wait && num(u.row.WanderRange) > 0) {
        // WanderRange quanh điểm sinh; đi tối đa WanderMinTime..WanderMaxTime giây
        for (var k = 0; k < 8; k++) {
          var a = rng(world) * Math.PI * 2, rr = Math.sqrt(rng(world)) * num(u.row.WanderRange);
          var g = { x: ai.home.x + Math.cos(a) * rr, z: ai.home.z + Math.sin(a) * rr };
          var n = navOf(world), c = n ? n.navCell(g.x, g.z) : null;
          if (n && (c[0] < 0 || c[1] < 0 || c[0] >= n.navW || c[1] >= n.navH || n.nav[c[1] * n.navW + c[0]])) continue;
          ai.goal = g; ai.walkT = rand(world, C('WanderMinTime', 1), C('WanderMaxTime', 5));
          setState(world, u, 'wander');
          return;
        }
        ai.t = 0;
      }
    },
    wander: function (world, u, dt) {
      var ai = u.ai;
      if (scan(world, u)) return;
      var d = len(ai.goal.x - u.pos.x, ai.goal.z - u.pos.z);
      if (d <= C('AgentStoppingDistance', 0.55) || ai.t >= ai.walkT) {
        ai.wait = rand(world, C('WanderWaitTimeMin', 3.5), C('WanderWaitTimeMax', 6.5));
        setState(world, u, 'idle');
        walk(world, u, null, dt);
        return;
      }
      walk(world, u, steerDir(world, u, ai.goal, 'p:' + ai.goal.x.toFixed(1) + ',' + ai.goal.z.toFixed(1)), dt, true);
    },
    curious: function (world, u, dt) {
      var ai = u.ai, t = ai.target;
      var s = t && !t.dead ? AI.canSee(world, u, t) : null;
      if (s) {
        ai.lostT = 0; ai.lastSeen = { x: t.pos.x, z: t.pos.z };
        ai.trackT += dt;
        if (s.direct || ai.trackT >= C('MonsterAlertTrackTargetTime', 1.1) - EPS) { aggro(world, u, t, 0); return; }
      } else {
        ai.lostT += dt;
        if (ai.lostT >= C('MonsterAlertLostTargetTime', 0.4) - EPS) {
          removeBuffs(world, u, u.row.OnCuriousBuffIds);
          ai.target = null;
          setState(world, u, 'return');
          ai.lostStand = C('MonsterLostTargetStateTime', 0.45);
          return;
        }
      }
      // "?" đứng nhìn MonsterCuriousStateTime rồi đi tới chỗ thấy cuối
      if (ai.t < C('MonsterCuriousStateTime', 0.6)) { faceTo(u, ai.lastSeen); walk(world, u, null, dt); return; }
      if (len(ai.lastSeen.x - u.pos.x, ai.lastSeen.z - u.pos.z) > C('AgentStoppingDistance', 0.55))
        walk(world, u, steerDir(world, u, ai.lastSeen, t ? 'u:' + t.uid : 'p'), dt, !s);
      else walk(world, u, null, dt);
      if (s) faceTo(u, t.pos);
    },
    combat: function (world, u, dt) {
      var ai = u.ai, r = u.row, t = ai.target;
      ai.aggroT += dt;
      if (!t || t.dead) {
        var nt = pickTarget(world, u, true);
        if (nt) { ai.target = nt.u; u.target = nt.u; t = nt.u; } else { leaveCombat(world, u, 'targetDead'); return; }
      }
      var s = AI.canSee(world, u, t);
      var d = dist(u, t);
      if (s) { ai.lostT = 0; ai.lastSeen = { x: t.pos.x, z: t.pos.z }; }
      else {
        ai.lostT += dt;
        if (ai.lostT >= C('TargetLostInSightTime', 2) - EPS) { leaveCombat(world, u, 'lostSight'); return; }
      }
      if (d > C('TargetFollowRange', 9)) {
        ai.farT += dt;
        if (ai.farT >= C('TargetFollowRangeGiveUpTime', 3) - EPS) { leaveCombat(world, u, 'tooFar'); return; }
      } else ai.farT = 0;
      // quái đang đánh quái: thấy người chơi → MonsterRetargetToPlayerChance (một lần mỗi người chơi)
      if (t.kind === 'mon') {
        var p = pickTarget(world, u, true);
        if (p && p.u.kind === 'char' && !ai.retargetRolled[p.u.uid]) {
          ai.retargetRolled[p.u.uid] = true;
          if (rng(world) * 100 < C('MonsterRetargetToPlayerChance', 35)) { ai.target = p.u; u.target = p.u; t = p.u; d = dist(u, t); }
        }
      }
      // "!" : đứng MonsterAggroStateTime
      if (ai.aggroT < C('MonsterAggroStateTime', 0.4)) { faceTo(u, t.pos); walk(world, u, null, dt); return; }
      // né: mục tiêu vừa ra đòn trong AvoidRange → AvoidStatePercent → lùi AvoidStateDuration [SUY LUẬN]
      if (t.run && t.run !== ai.seenRun) {
        ai.seenRun = t.run;
        if (num(r.AvoidRange) > 0 && d <= num(r.AvoidRange) && rng(world) * 100 < num(r.AvoidStatePercent)) ai.avoidT = num(r.AvoidStateDuration);
      }
      if (ai.avoidT > 0) {
        ai.avoidT -= dt;
        var away = norm(u.pos.x - t.pos.x, u.pos.z - t.pos.z) || { x: -u.aim.x, z: -u.aim.z };
        walk(world, u, away, dt, false);
        faceTo(u, t.pos);
        u.aiSub = 'avoid';
        return;
      }
      u.aiSub = null;
      // dùng skill: sau MonsterReactionDelay kể từ lúc aggro, hết GlobalSkillCoolTime
      if (s && ai.gcd <= 0 && ai.aggroT >= C('MonsterReactionDelay', 0.8) - EPS && trySkill(world, u, t)) return;
      // di chuyển: đuổi khi d > StartMoveToTargetRange, dừng khi d ≤ EndMoveToTargetRange; thả diều Kite*
      var kS = num(r.KiteStartRange), kE = num(r.KiteEndRange);
      if (kS > 0 && d < kS) ai.kiting = true;
      if (ai.kiting && d >= kE) ai.kiting = false;
      if (ai.kiting) {
        walk(world, u, norm(u.pos.x - t.pos.x, u.pos.z - t.pos.z), dt, false);
        faceTo(u, t.pos);
        u.aiSub = 'kite';
        return;
      }
      if (d > num(r.StartMoveToTargetRange) + EPS) ai.chasing = true;
      if (d <= num(r.EndMoveToTargetRange) + EPS) ai.chasing = false;
      var goal = s ? t.pos : ai.lastSeen;
      if (ai.chasing && len(goal.x - u.pos.x, goal.z - u.pos.z) > 1e-3) {
        var dir = steerDir(world, u, goal, s ? 'u:' + t.uid : 'p:' + goal.x.toFixed(1) + ',' + goal.z.toFixed(1));
        walk(world, u, dir, dt, true);
        u.aiSub = 'chase';
      } else {
        walk(world, u, null, dt);
        faceTo(u, t.pos);
        u.aiSub = null;
      }
    },
    flee: function (world, u, dt) {
      var ai = u.ai, from = ai.fleeFrom && !ai.fleeFrom.dead ? ai.fleeFrom.pos : null;
      ai.fleeT -= dt;
      if (ai.fleeT <= 0) {
        ai.fleeCd = num(u.row.FleeCooltime);
        setState(world, u, ai.target && !ai.target.dead ? 'combat' : 'return');
        ai.aggroT = 1e9;
        return;
      }
      var dir = from ? norm(u.pos.x - from.x, u.pos.z - from.z) : { x: -u.aim.x, z: -u.aim.z };
      walk(world, u, dir, dt, true);
    },
    pause: function (world, u, dt) {
      var ai = u.ai;
      ai.pauseT -= dt;
      walk(world, u, null, dt);
      if (ai.pauseT <= 0) {
        var back = ai.pauseBack === 'combat' || ai.target ? 'combat' : 'idle';
        setState(world, u, back);
        if (back === 'combat') ai.aggroT = 1e9;
      }
    },
    'return': function (world, u, dt) {
      var ai = u.ai;
      if (ai.lostStand > 0) { ai.lostStand -= dt; walk(world, u, null, dt); return; }
      if (scan(world, u)) return;
      var d = len(ai.home.x - u.pos.x, ai.home.z - u.pos.z);
      if (d <= C('AgentStoppingDistance', 0.55)) {
        ai.wait = rand(world, C('WanderWaitTimeMin', 3.5), C('WanderWaitTimeMax', 6.5));
        setState(world, u, 'idle');
        walk(world, u, null, dt);
        return;
      }
      walk(world, u, steerDir(world, u, ai.home, 'home:' + u.uid), dt, true);
    }
  };
  AI.STATES = STATES;

  // ======================= đèn pin =======================
  // Nhân vật còn LightFuel > 0 chiếu nón Character.SightAngle (120°) × SightRange (5 m) theo hướng ngắm, cộng vòng
  // SightBackRange (1 m) quanh người; tường chặn. Quái trong vùng sáng: thêm LightBuffId (làm mới mỗi khung, Duration 2 s)
  // và LightStackBuffId: 1 stack khi vào, +1 stack mỗi giây còn trong sáng (Duration 1 s nên ra khỏi sáng là rớt).
  // Buff 3000004/5/7 có trigger Stack ≥ 2 → chỉ gây sát thương sau ≥ 1 s phơi sáng liên tục. [SUY LUẬN nhịp 1 stack/giây]
  AI.inLight = function (world, c, m) {
    if (!c || c.dead || c.kind !== 'char' || (c.light != null && c.light <= 0)) return false;
    var row = c.row, dx = m.pos.x - c.pos.x, dz = m.pos.z - c.pos.z, d = len(dx, dz);
    var hit = false;
    if (d <= num(row.SightBackRange) + (m.radius || 0)) hit = true;
    else if (d <= num(row.SightRange) + EPS) {
      var f = c.aim, cs = (dx * f.x + dz * f.z) / Math.max(d, 1e-6);
      hit = cs >= Math.cos(num(row.SightAngle) / 2 * Math.PI / 180) - EPS;
    }
    return hit && losClear(world, c.pos, m.pos);
  };
  AI.applyLight = function (world, dt) {
    var units = world.units || [];
    var chars = units.filter(function (x) { return x.kind === 'char' && !x.dead; });
    for (var i = 0; i < units.length; i++) {
      var m = units[i];
      if (m.kind !== 'mon' || m.dead) continue;
      if (!m.ai) AI.init(world, m, { noSpawnDelay: true });
      var lit = false;
      for (var k = 0; k < chars.length && !lit; k++) lit = AI.inLight(world, chars[k], m);
      var ai = m.ai;
      if (lit) {
        (m.row.LightBuffId || []).forEach(function (b) { var ib = m.buffs.get(b); if (ib) ib.t = 0; else m.buffs.add(world, b, 1, m); });
        if (!ai.lit) { ai.lightT = 0; (m.row.LightStackBuffId || []).forEach(function (b) { m.buffs.add(world, b, 1, m); }); }
        else {
          ai.lightT += dt;
          var add = 0;
          while (ai.lightT >= 1 - EPS) { ai.lightT -= 1; add++; }
          (m.row.LightStackBuffId || []).forEach(function (b) {
            if (add) m.buffs.add(world, b, add, m);
            else { var inst = m.buffs.get(b); if (inst) inst.t = 0; } // giữ sống khi vẫn trong sáng
          });
        }
      }
      if (lit !== ai.lit) emit(world, { type: 'lit', unit: m, on: lit });
      ai.lit = lit;
    }
  };

  VD.AI = AI;
})(window.VD = window.VD || {});
