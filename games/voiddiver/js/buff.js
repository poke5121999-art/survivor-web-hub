// buff.js — BuffSet (thêm/cộng stack/làm mới/tick/gỡ), bảng handler theo EffectType, miễn nhiễm,
// trạng thái khống chế (CC) và khiên. Luật: docs/SKILLVM.md §4 (Buff) và §3.6 (CC).
// Không rẽ nhánh theo id buff: mọi hành vi đi qua bảng VD.BuffFx[EffectType].
(function (VD) {
  'use strict';
  var num = VD.num;

  function db() { return VD.combatDB(); }
  function emit(world, e) { if (world && world.emit) world.emit(e); }
  function fire(world, u, type, payload) { if (VD.Skill && VD.Skill.fire) VD.Skill.fire(world, u, type, payload); }

  // ---------- nhãn trạng thái (EffectTag) ----------
  // ImmunityEffectTags có 3 dạng: chuỗi "All", chuỗi "Bleed, Burn, …", hoặc số nguyên (cờ bit, số âm = "tất cả trừ …").
  // [SUY LUẬN] bit i = nhãn thứ i trong StatusEffectTag.csv (None = bit 0). Xem SKILLVM.md [CHƯA RÕ] #6.
  var _tagCache = {};
  function parseTags(v) {
    var key = String(v);
    if (_tagCache[key]) return _tagCache[key];
    var out = {};
    var list = db().tagList;
    if (v === 'All' || v === -1 || v === '-1') {
      for (var i = 0; i < list.length; i++) out[list[i]] = true;
    } else if (typeof v === 'number' || /^-?\d+$/.test(key)) {
      var n = parseInt(key, 10);
      for (var b = 0; b < list.length; b++) if ((n >> b) & 1) out[list[b]] = true;
    } else if (v) {
      key.split(',').forEach(function (s) { s = s.trim(); if (s) out[s] = true; });
    }
    delete out.None;
    _tagCache[key] = out;
    return out;
  }

  // ---------- trigger của buff (buff chỉ có hiệu lực khi mọi trigger đúng) ----------
  function cmp(a, type, b) {
    switch (type) {
      case 'LessEqual': return a <= b;
      case 'Less': return a < b;
      case 'GreaterEqual': return a >= b;
      case 'Greater': return a > b;
      case 'Equal': return a === b;
      case 'NotEqual': return a !== b;
      default: return false;
    }
  }
  function unitValue(u, what, inst) {
    switch (what) {
      case 'HpPercent': return u.stats && u.stats.HpMax > 0 ? 100 * u.hp / u.stats.HpMax : 100;
      case 'LightFuel': return u.light != null ? u.light : db().c('LightFuelDefault', 100);
      case 'Stress': return u.stress || 0;
      case 'Stack': return inst ? inst.stacks : 0;
      case 'CorruptionPercent': return u.corruption || 0;
      default: return 0;
    }
  }
  var TRIGGERS = {
    FloatValueCompareBuffTrigger: function (world, t, u, inst) {
      return cmp(unitValue(u, t.TriggerType, inst), t.CompareType, num(t.CompareValue));
    },
    NearbyUnitCountBuffTrigger: function (world, t, u) {
      var r = num(t.Range), n = 0;
      var units = (world && world.units) || [];
      for (var i = 0; i < units.length; i++) {
        var o = units[i];
        if (o === u || o.dead) continue;
        if (!VD.Combat || !VD.Combat.relation(u, o, t.Relation)) continue;
        var dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
        if (dx * dx + dz * dz > r * r) continue;
        var ok = true, sub = t.NearUnitConditionTriggers || [];
        for (var j = 0; j < sub.length && ok; j++) ok = evalTrigger(world, sub[j], o, null);
        if (ok) n++;
      }
      return cmp(n, t.CompareType, num(t.CompareValue));
    },
    // [SUY LUẬN] đúng khi unit đang chạy skill có tag trong danh sách
    ActiveSkillTagBuffTrigger: function (world, t, u) {
      var tags = t.SkillTags || t.ConditionSkillTags || [];
      var sk = u.run && u.run.skill;
      if (!sk) return false;
      for (var i = 0; i < tags.length; i++) if ((sk.SkillTags || []).indexOf(tags[i]) >= 0) return true;
      return false;
    }
  };
  function T(t) { return String(t || '').split(',')[0].split('.').pop(); }
  function evalTrigger(world, trig, u, inst) {
    var fn = TRIGGERS[T(trig.$type)];
    if (!fn) { noteUnknown(world, 'buffTrigger', T(trig.$type)); return true; }
    return fn(world, trig, u, inst);
  }
  function noteUnknown(world, kind, name) {
    if (!world) return;
    world.combatUnknown = world.combatUnknown || {};
    var k = kind + ':' + name;
    world.combatUnknown[k] = (world.combatUnknown[k] || 0) + 1;
  }

  // ---------- bảng hiệu ứng ----------
  // Mỗi mục: { mods(out, e, inst, owner) | tick(world, e, inst, owner) | onAdd | onRemove | query:true | fx:true | stub:true }
  // query: được đọc bởi hitbox.js / skill.js qua BuffSet.effects(type). stub: thuộc hệ khác (dive/lounge/item), không mô phỏng ở đây.
  function statVal(e, inst, owner) {
    if (e.UseStatValue) {
      var src = e.RealtimeStatValue ? (inst.caster && inst.caster.stats) || owner.stats : inst.snap || owner.stats;
      return num(e.StatPercent) / 100 * ((src && src[e.StatType]) || 0);
    }
    return null;
  }
  function tickAmount(e, inst, owner) {
    var v = statVal(e, inst, owner);
    return (v == null ? 1 : v) * (num(e.TickAmount) || 1) * inst.stacks;
  }
  var FX = {
    Stat: { mods: function (out, e, inst, owner) {
      var v = statVal(e, inst, owner);
      if (v == null) v = num(e.statValue);
      out[e.statType] = (out[e.statType] || 0) + v * inst.stacks;
    } },
    Slow: { mods: function (out, e, inst) {
      // SlowType MoveSlow → MoveSpeedPercent (value đã âm)
      var k = e.SlowType === 'AttackSlow' ? 'AtkSpeedPercent' : 'MoveSpeedPercent';
      out[k] = (out[k] || 0) + num(e.value) * inst.stacks;
    } },
    DotHpDamage: { tick: function (world, e, inst, owner) {
      if (VD.HitBox) VD.HitBox.dotDamage(world, inst.caster || owner, owner, tickAmount(e, inst, owner), inst);
    } },
    DotPercentHpDamage: { tick: function (world, e, inst, owner) {
      var pct = e.Percent != null ? num(e.Percent) : e.UseStatValue ? num(e.StatPercent) : num(e.TickAmount); // [ĐO] 3000005: Percent 3.5, TickAmount 0
      if (VD.HitBox) VD.HitBox.dotDamage(world, inst.caster || owner, owner, pct / 100 * owner.stats.HpMax * inst.stacks, inst);
    } },
    DotRangeHpDamage: { tick: function (world, e, inst, owner) {
      var r = num(e.Range), amt = tickAmount(e, inst, owner);
      var units = world.units || [];
      for (var i = 0; i < units.length; i++) {
        var o = units[i];
        if (o.dead || !VD.Combat.relation(owner, o, e.TargetType || 'Enemy')) continue;
        var dx = o.pos.x - owner.pos.x, dz = o.pos.z - owner.pos.z;
        if (dx * dx + dz * dz <= r * r && VD.HitBox) VD.HitBox.dotDamage(world, inst.caster || owner, o, amt, inst);
      }
    } },
    DotHpRecovery: { tick: function (world, e, inst, owner) { if (VD.HitBox) VD.HitBox.heal(world, owner, tickAmount(e, inst, owner), inst.caster); } },
    DotShield: { tick: function (world, e, inst, owner) {
      var v = statVal(e, inst, owner);
      addShield(world, owner, e.ShieldId, (v == null ? num(e.Value) : v) * (num(e.TickAmount) || 1));
    } },
    DotSoulDamage: { tick: function (world, e, inst, owner) { changeSoul(world, owner, -num(e.TickAmount) * inst.stacks); } },
    DotStressDamage: { tick: function (world, e, inst, owner) { if (VD.HitBox) VD.HitBox.stressDamage(world, inst.caster, owner, num(e.TickAmount) * inst.stacks, { dot: true }); } },
    DotStressRecovery: { tick: function (world, e, inst, owner) { if (VD.HitBox) VD.HitBox.stressRecover(world, owner, num(e.TickAmount) * inst.stacks); } },
    DotBrightnessDamage: { tick: function (world, e, inst, owner) { owner.light = Math.max(0, (owner.light || 0) - num(e.TickAmount)); } },
    DotBrightnessRecovery: { tick: function (world, e, inst, owner) { owner.light = Math.min(db().c('LightFuelMax', 100), (owner.light || 0) + num(e.TickAmount)); } },
    Immunity: { query: true, onAdd: function (world, e, inst, owner) {
      if (!e.DispelOnApply) return;
      var tags = e.IsFullImmunity ? parseTags('All') : parseTags(e.ImmunityEffectTags);
      owner.buffs.dispel(world, tags, inst.id);
      var cc = owner.buffs.cc;
      if (cc && tags[cc.type]) owner.buffs.clearCC(world);
    } },
    Invincibility: { query: true }, Parry: { query: true }, FrontGuard: { query: true },
    HpDamageTakenAmplifier: { query: true }, StressDamageTakenAmplifier: { query: true },
    ShieldOnDamageProvide: { query: true }, ChangeSkill: { query: true }, BlockSkillCharge: { query: true },
    Root: { query: true }, Silence: { query: true }, Blind: { query: true, fx: true }, Confusion: { query: true },
    Madness: { query: true }, HpThreshold: { query: true }, DamageConversion: { query: true },
    AttackConditionalStats: { query: true }, AttackedConditionalStats: { query: true },
    BackAttackCriticalChanceAdd: { query: true }, BackAttackDamageAdd: { query: true },
    DotDamageAmplifier: { query: true }, HpRecoveryAmplifier: { query: true }, SkillChargeAmplifier: { query: true },
    StressRecoveryAmplifier: { query: true }, SkillStaminaCostAmplifier: { query: true }, SkillStressCostAmplifier: { query: true },
    AggroRangeAmplifier: { query: true }, MonsterSightAmplifier: { query: true }, Invisible: { query: true },
    BlockStressRecovery: { query: true }, StatusEffectDurationAmplifier: { query: true },
    SpawnHitBoxOnEnd: { onRemove: function (world, e, inst, owner, reason) {
      if ((reason === 'expire' && e.SpawnOnExpire) || (reason === 'death' && e.SpawnOnDie)) {
        if (VD.HitBox) VD.HitBox.spawn(world, inst.caster || owner, e.HitBoxId, { at: { x: owner.pos.x, z: owner.pos.z }, dir: owner.aim });
      }
    } },
    HighLight: { fx: true }, Trail: { fx: true }, MultiSkeleton: { fx: true },
    // thuộc hệ khác (đồ dùng, nhặt đồ, hồi sinh, talent…): nhận diện, không mô phỏng trong lõi chiến đấu
    ItemEffectAmplifier: { stub: true }, ApplyBuffOnAttack: { stub: true }, EquipmentRevive: { stub: true },
    ItemUseSpeedAmplifier: { stub: true }, LootingSpeedAmplifier: { stub: true }, SelfReviveChanceAmplifier: { stub: true },
    WeakPointStackAmplifier: { stub: true }, BindingField: { stub: true }, EscapeOnActive: { stub: true },
    TrainingRoom: { stub: true }, ForcedSelfRevive: { stub: true }, ExpGainAmplifier: { stub: true }
  };
  VD.BuffFx = FX;

  // ---------- BuffSet ----------
  function BuffSet(owner) {
    this.owner = owner;
    this.list = [];      // thứ tự thêm vào
    this.by = {};        // id → inst
    this.cc = null;      // { type, t, dur, mv:{dx,dz,dur,t}, src }
    this.shields = [];   // { id, amount, t, dur, rate }
  }

  // Thời lượng: Duration (−1 = vô hạn). DurationOverride.Stats: [SUY LUẬN] dur = Duration × 100/(100 + Σ stat% × BasePercent/100),
  // kẹp [MinDuration, MaxDuration] khi > 0.
  function durationOf(row, owner) {
    var d = num(row.Duration);
    var ov = row.DurationOverride;
    if (d > 0 && ov && ov.Stats && ov.Stats.length) {
      var sum = 0;
      for (var i = 0; i < ov.Stats.length; i++) {
        var s = ov.Stats[i];
        sum += ((owner.stats && owner.stats[s.StatType]) || 0) * num(s.BasePercent) / 100;
      }
      d = d * 100 / Math.max(1, 100 + sum);
      var mn = num(ov.MinDuration), mx = num(ov.MaxDuration);
      if (mn > 0) d = Math.max(mn, d);
      if (mx > 0) d = Math.min(mx, d);
    }
    return d;
  }

  BuffSet.prototype.get = function (id) { return this.by[id] || null; };
  BuffSet.prototype.stacks = function (id) { var b = this.by[id]; return b ? b.stacks : 0; };

  // Thêm n stack. Trả inst hoặc null (bị miễn nhiễm / không có dòng).
  BuffSet.prototype.add = function (world, id, n, caster, opts) {
    var row = db().buff(id);
    var owner = this.owner;
    if (!row) { noteUnknown(world, 'buff', id); return null; }
    if (owner.dead) return null;
    n = n == null ? 1 : n;
    var tag = row.EffectTag;
    if (tag && tag !== 'None' && this.immune(tag)) {
      emit(world, { type: 'immune', unit: owner, tag: tag, buffId: id });
      return null;
    }
    var max = Math.max(1, num(row.MaxStackCount));
    var inst = this.by[id];
    var isNew = !inst;
    if (isNew) {
      inst = { id: id, row: row, stacks: 0, t: 0, dur: 0, tickAcc: 0, caster: caster || owner, active: true, stackT: [] };
      this.list.push(inst);
      this.by[id] = inst;
    }
    var before = inst.stacks;
    inst.stacks = Math.min(max, inst.stacks + n);
    inst.caster = caster || inst.caster;
    inst.snap = snapshotStats(inst.caster);
    inst.dur = durationOf(row, owner);
    inst.t = 0; // làm mới thời lượng mỗi lần thêm [SUY LUẬN]
    if (row.ExpirePerStack) for (var k = before; k < inst.stacks; k++) inst.stackT.push(0);
    if (isNew) {
      inst.active = this._evalTriggers(world, inst);
      var effs = row.BuffEffects || [];
      for (var i = 0; i < effs.length; i++) {
        var h = FX[effs[i].EffectType];
        if (!h) noteUnknown(world, 'buffEffect', effs[i].EffectType);
        else if (h.onAdd) h.onAdd(world, effs[i], inst, owner);
        if (h && h.fx) emit(world, { type: 'buffFx', unit: owner, effect: effs[i].EffectType, data: effs[i], buffId: id, on: true });
      }
      var bv = db().buffVfx(id) || (tag && tag !== 'None' ? db().tag(tag) : null);
      if (bv) {
        if (bv.Vfx) emit(world, { type: 'vfx', name: bv.Vfx, unit: owner, bone: bv.VfxBoneType, offset: bv.VfxOffset, duration: num(bv.VfxDuration), follow: true, key: 'buff:' + owner.uid + ':' + id });
        if (bv.Sfx) emit(world, { type: 'sfx', name: bv.Sfx, unit: owner });
      }
    }
    emit(world, { type: 'buff', unit: owner, buffId: id, stacks: inst.stacks, added: inst.stacks - before, caster: inst.caster, t: world && world.time });
    if (VD.Stats) VD.Stats.compute(owner);
    fire(world, owner, 'AddBuffSkillTrigger', { buffId: id, stacks: inst.stacks, target: inst.caster });
    return inst;
  };

  function snapshotStats(u) {
    if (!u || !u.stats) return null;
    var o = {};
    for (var k in u.stats) o[k] = u.stats[k];
    return o;
  }

  // Gỡ n stack (n null = gỡ hết). reason: 'remove' | 'expire' | 'dispel' | 'death'.
  BuffSet.prototype.remove = function (world, id, n, reason) {
    var inst = this.by[id];
    if (!inst) return false;
    var owner = this.owner;
    n = n == null ? inst.stacks : n;
    inst.stacks = Math.max(0, inst.stacks - n);
    if (inst.row.ExpirePerStack) inst.stackT.splice(0, n);
    var gone = inst.stacks <= 0;
    if (gone) {
      this.list.splice(this.list.indexOf(inst), 1);
      delete this.by[id];
      var effs = inst.row.BuffEffects || [];
      for (var i = 0; i < effs.length; i++) {
        var h = FX[effs[i].EffectType];
        if (h && h.onRemove) h.onRemove(world, effs[i], inst, owner, reason || 'remove');
        if (h && h.fx) emit(world, { type: 'buffFx', unit: owner, effect: effs[i].EffectType, buffId: id, on: false });
      }
      emit(world, { type: 'vfxEnd', key: 'buff:' + owner.uid + ':' + id });
    }
    emit(world, { type: 'buffRemoved', unit: owner, buffId: id, stacks: inst.stacks, reason: reason || 'remove', t: world && world.time });
    if (VD.Stats) VD.Stats.compute(owner);
    // trigger bắn cả khi chỉ bớt stack (Raven 10013807 "탄 다 쓰면" kiểm 1303==0 sau khi gỡ 1 stack) [ĐO]
    fire(world, owner, 'BuffRemovedSkillTrigger', { buffId: id, expired: reason === 'expire', stacks: inst.stacks, target: inst.caster });
    return true;
  };

  BuffSet.prototype.dispel = function (world, tags, exceptId) {
    var ids = [];
    for (var i = 0; i < this.list.length; i++) {
      var b = this.list[i];
      if (b.id !== exceptId && b.row.EffectTag && tags[b.row.EffectTag]) ids.push(b.id);
    }
    for (var j = 0; j < ids.length; j++) this.remove(world, ids[j], null, 'dispel');
  };

  BuffSet.prototype.clear = function (world, reason) {
    var ids = this.list.map(function (b) { return b.id; });
    for (var i = 0; i < ids.length; i++) this.remove(world, ids[i], null, reason || 'remove');
  };

  BuffSet.prototype._evalTriggers = function (world, inst) {
    var tr = inst.row.Triggers || [];
    for (var i = 0; i < tr.length; i++) if (!evalTrigger(world, tr[i], this.owner, inst)) return false;
    return true;
  };

  // Mỗi khung: trigger → tick DoT (1 s/tick, tick đầu sau 1 s [SUY LUẬN]) → hết hạn → CC → khiên.
  BuffSet.prototype.tick = function (world, dt) {
    var owner = this.owner;
    var snapshot = this.list.slice();
    var statDirty = false;
    for (var i = 0; i < snapshot.length; i++) {
      var inst = snapshot[i];
      if (this.by[inst.id] !== inst) continue;
      var was = inst.active;
      inst.active = this._evalTriggers(world, inst);
      if (was !== inst.active) statDirty = true;
      var effs = inst.row.BuffEffects || [];
      if (inst.active) {
        var hasTick = false;
        for (var j = 0; j < effs.length; j++) if (FX[effs[j].EffectType] && FX[effs[j].EffectType].tick) { hasTick = true; break; }
        if (hasTick) {
          inst.tickAcc += dt;
          while (inst.tickAcc >= 1 - 1e-9 && this.by[inst.id] === inst && !owner.dead) {
            inst.tickAcc -= 1;
            for (var k = 0; k < effs.length; k++) {
              var h = FX[effs[k].EffectType];
              if (h && h.tick) h.tick(world, effs[k], inst, owner);
            }
            var tg = inst.row.EffectTag && inst.row.EffectTag !== 'None' ? db().tag(inst.row.EffectTag) : null;
            var bv = db().buffVfx(inst.id) || tg;
            if (bv && bv.DotVfx) emit(world, { type: 'vfx', name: bv.DotVfx, unit: owner, bone: bv.DotVfxBoneType, offset: bv.DotVfxOffset, follow: true });
            if (bv && bv.DotSfx) emit(world, { type: 'sfx', name: bv.DotSfx, unit: owner });
          }
        }
      }
      if (this.by[inst.id] !== inst) continue;
      if (inst.row.ExpirePerStack && inst.dur > 0) {
        var expired = 0;
        for (var s = 0; s < inst.stackT.length; s++) { inst.stackT[s] += dt; if (inst.stackT[s] >= inst.dur - 1e-9) expired++; }
        if (expired) this.remove(world, inst.id, expired, 'expire');
      } else if (inst.dur > 0) {
        inst.t += dt;
        if (inst.t >= inst.dur - 1e-9) this.remove(world, inst.id, null, 'expire');
      }
    }
    if (statDirty && VD.Stats) VD.Stats.compute(owner);
    this._tickCC(world, dt);
    this._tickShields(world, dt);
  };

  // Liệt kê hiệu ứng đang có hiệu lực theo EffectType: [{e, inst}]
  BuffSet.prototype.effects = function (type) {
    var out = [];
    for (var i = 0; i < this.list.length; i++) {
      var inst = this.list[i];
      if (!inst.active) continue;
      var effs = inst.row.BuffEffects || [];
      for (var j = 0; j < effs.length; j++) if (effs[j].EffectType === type) out.push({ e: effs[j], inst: inst });
    }
    return out;
  };
  BuffSet.prototype.has = function (type) { return this.effects(type).length > 0; };
  BuffSet.prototype.sum = function (type, field) {
    var a = this.effects(type), s = 0;
    for (var i = 0; i < a.length; i++) s += num(a[i].e[field]) * (a[i].inst.stacks || 1);
    return s;
  };
  BuffSet.prototype.statMods = function (out) {
    for (var i = 0; i < this.list.length; i++) {
      var inst = this.list[i];
      if (!inst.active) continue;
      var effs = inst.row.BuffEffects || [];
      for (var j = 0; j < effs.length; j++) {
        var h = FX[effs[j].EffectType];
        if (h && h.mods) h.mods(out, effs[j], inst, this.owner);
      }
    }
    return out;
  };
  // Invincibility gộp: {BlockDamage, IgnoreBackAttack, IgnoreCriticalHit, BlockStressDamage, BlockEnemyHit} hoặc null
  BuffSet.prototype.invincible = function () {
    var a = this.effects('Invincibility');
    if (!a.length) return null;
    var o = {};
    for (var i = 0; i < a.length; i++) {
      var e = a[i].e;
      ['BlockDamage', 'IgnoreBackAttack', 'IgnoreCriticalHit', 'BlockStressDamage', 'BlockEnemyHit'].forEach(function (k) { if (e[k]) o[k] = true; });
    }
    return o;
  };
  BuffSet.prototype.immune = function (tag) {
    var a = this.effects('Immunity');
    for (var i = 0; i < a.length; i++) {
      var e = a[i].e;
      if (e.IsFullImmunity) return true;
      if (parseTags(e.ImmunityEffectTags)[tag]) return true;
    }
    return false;
  };
  BuffSet.prototype.changeSkill = function (id) {
    var a = this.effects('ChangeSkill');
    for (var i = 0; i < a.length; i++) if (a[i].e.OriginalSkillId === id) return a[i].e.ReplacementSkillId;
    return id;
  };

  // ---------- khống chế (CC) ----------
  // cc: { ccType, ccDuration, ccMoveDistance, ccMoveDuration } ; dir: hướng đẩy (đã chuẩn hoá) ; pullTo: điểm kéo về
  BuffSet.prototype.applyCC = function (world, cc, src, dir, pullTo) {
    var owner = this.owner;
    var type = cc.ccType;
    if (owner.dead) return false;
    if (this.immune(type)) { emit(world, { type: 'immune', unit: owner, tag: type }); return false; }
    var dur = num(cc.ccDuration);
    var dist = num(cc.ccMoveDistance), mdur = num(cc.ccMoveDuration);
    var mv = null;
    if (type === 'Knockback' && dist > 0 && dir) {
      mv = { dx: dir.x * dist, dz: dir.z * dist, dur: Math.max(mdur, 1e-3), t: 0 };
    } else if (type === 'Pull' && pullTo) {
      // [SUY LUẬN] kéo về điểm nguồn, dừng cách nguồn một khoảng bằng tổng bán kính
      var dx = pullTo.x - owner.pos.x, dz = pullTo.z - owner.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var stop = (owner.radius || 0) + (src && src.radius || 0);
      var go = dist > 0 ? Math.min(dist, Math.max(0, d - stop)) : Math.max(0, d - stop);
      if (d > 1e-6 && go > 0) mv = { dx: dx / d * go, dz: dz / d * go, dur: Math.max(mdur || dur * 0.5, 1e-3), t: 0 };
    }
    this.cc = { type: type, t: 0, dur: Math.max(dur, mv ? mv.dur : 0), mv: mv, src: src };
    if (VD.Skill && VD.Skill.interrupt) VD.Skill.interrupt(world, owner, 'cc');
    if (VD.Skill && VD.Skill.setState) VD.Skill.setState(world, owner, 'CrowdControlled');
    var tg = db().tag(type);
    emit(world, { type: 'cc', unit: owner, ccType: type, dur: this.cc.dur, dist: mv ? Math.sqrt(mv.dx * mv.dx + mv.dz * mv.dz) : 0,
      dir: mv ? { x: mv.dx, z: mv.dz } : null, moveDur: mv ? mv.dur : 0, src: src, vfx: tg && tg.Vfx, sfx: tg && tg.Sfx });
    fire(world, owner, 'CrowdControlSkillTrigger', { ccType: type, target: src });
    if (src) fire(world, src, 'CrowdControlProvideSkillTrigger', { ccType: type, target: owner });
    return true;
  };
  BuffSet.prototype.clearCC = function (world) {
    if (!this.cc) return;
    this.cc = null;
    emit(world, { type: 'ccEnd', unit: this.owner });
    if (VD.Skill && VD.Skill.setState) VD.Skill.setState(world, this.owner, 'Idle');
  };
  BuffSet.prototype._tickCC = function (world, dt) {
    var cc = this.cc;
    if (!cc) return;
    var owner = this.owner;
    if (cc.mv && cc.mv.t < cc.mv.dur) {
      var step = Math.min(dt, cc.mv.dur - cc.mv.t);
      var f = step / cc.mv.dur;
      cc.mv.t += step;
      moveUnit(world, owner, cc.mv.dx * f, cc.mv.dz * f, {});
    }
    cc.t += dt;
    if (cc.t >= cc.dur - 1e-9) this.clearCC(world);
  };
  // Stun/Freeze/Knockback/Pull đều khoá hành động trong thời gian CC.
  BuffSet.prototype.stunned = function () { return !!this.cc; };

  function moveUnit(world, u, dx, dz, opt) {
    if (world && world.moveUnit) return world.moveUnit(u, dx, dz, opt || {});
    u.pos.x += dx; u.pos.z += dz;
    return { x: dx, z: dz, blocked: false };
  }

  // ---------- khiên (Shield.csv) ----------
  // MaxValueType PercentOfMaxHp: trần = MaxValue% HpMax. IsStackable: cộng dồn vào khiên cùng id.
  // IsDecrease: [SUY LUẬN] giảm tuyến tính về 0 trong Duration; không thì hết hạn sau Duration.
  function addShield(world, u, shieldId, amount) {
    if (!(amount > 0)) return 0;
    var row = db().shield(shieldId) || { MaxValueType: 'None', MaxValue: 0, Duration: -1, IsStackable: true, IsDecrease: false };
    var bs = u.buffs;
    var cap = row.MaxValueType === 'PercentOfMaxHp' ? num(row.MaxValue) / 100 * (u.stats ? u.stats.HpMax : 0) : Infinity;
    var sh = null;
    for (var i = 0; i < bs.shields.length; i++) if (bs.shields[i].id === shieldId) sh = bs.shields[i];
    if (!sh) { sh = { id: shieldId, amount: 0, t: 0, dur: num(row.Duration), decrease: !!row.IsDecrease, rate: 0 }; bs.shields.push(sh); }
    var before = sh.amount;
    sh.amount = row.IsStackable === false ? Math.max(sh.amount, amount) : sh.amount + amount;
    if (sh.amount > cap) sh.amount = cap;
    sh.t = 0;
    sh.rate = sh.decrease && sh.dur > 0 ? sh.amount / sh.dur : 0;
    emit(world, { type: 'shield', unit: u, shieldId: shieldId, amount: sh.amount, added: sh.amount - before });
    return sh.amount - before;
  }
  BuffSet.prototype._tickShields = function (world, dt) {
    for (var i = this.shields.length - 1; i >= 0; i--) {
      var s = this.shields[i];
      s.t += dt;
      if (s.rate > 0) s.amount -= s.rate * dt;
      if (s.amount <= 1e-6 || (s.dur > 0 && s.t >= s.dur - 1e-9)) {
        this.shields.splice(i, 1);
        emit(world, { type: 'shield', unit: this.owner, shieldId: s.id, amount: 0, added: -Math.max(0, s.amount) });
      }
    }
  };
  BuffSet.prototype.shieldTotal = function () {
    var s = 0;
    for (var i = 0; i < this.shields.length; i++) s += this.shields[i].amount;
    return s;
  };
  // Trả phần sát thương còn lại sau khi khiên hấp thụ.
  BuffSet.prototype.absorb = function (dmg) {
    for (var i = 0; i < this.shields.length && dmg > 0; i++) {
      var take = Math.min(this.shields[i].amount, dmg);
      this.shields[i].amount -= take;
      dmg -= take;
    }
    return dmg;
  };

  // ---------- linh hồn (Mio) ----------
  function changeSoul(world, u, delta) {
    var max = db().c('SoulMax', 1000);
    var old = u.soul || 0;
    u.soul = Math.max(0, Math.min(max, old + delta));
    if (u.soul !== old) {
      emit(world, { type: 'soul', unit: u, soul: u.soul, delta: u.soul - old });
      if (VD.Skill && VD.Skill.onSoulChanged) VD.Skill.onSoulChanged(world, u, old);
    }
  }

  VD.BuffSet = BuffSet;
  VD.Buff = {
    parseTags: parseTags, TRIGGERS: TRIGGERS, FX: FX, addShield: addShield, changeSoul: changeSoul,
    durationOf: durationOf, cmp: cmp, moveUnit: moveUnit
  };
})(window.VD = window.VD || {});
