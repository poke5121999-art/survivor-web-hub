// stats.js — chỉ số đơn vị (Void Diver web). Xem docs/SKILLVM.md §5.
// Chỉ số gốc lấy từ dòng Character/Monster + vũ khí (Equipment.Stats × WeaponAtkMultiplier)
// + mod từ buff (StatEffect/SlowEffect…) + Const (MaxCooldownReductionPercent, MinCoolTime…).
// Cũng chứa bộ chỉ mục bảng (VD.combatDB) dùng chung cho buff.js / skill.js / hitbox.js.
(function (VD) {
  'use strict';

  function num(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  function vec3(s) {
    if (s && typeof s === 'object') return { x: num(s.x), y: num(s.y), z: num(s.z) };
    var p = String(s || '0:0:0').split(':');
    return { x: num(p[0]), y: num(p[1]), z: num(p[2]) };
  }

  // ---------- chỉ mục bảng ----------
  function indexBy(rows, key) {
    var out = {};
    if (!rows) return out;
    if (Array.isArray(rows)) {
      for (var i = 0; i < rows.length; i++) out[rows[i][key]] = rows[i];
    } else {
      for (var k in rows) {
        var r = rows[k];
        out[r && r[key] != null ? r[key] : k] = r;
      }
    }
    return out;
  }

  // T: { Skill, HitBox, Buff, Character, Monster, Equipment, Const, Faction, Shield, Difficulty,
  //      StatusEffectTag, ExtraUnit, BuffVfx } — mảng dòng hoặc map id→dòng (VD.T hoặc JSON gốc).
  function CombatDB(T) {
    T = T || {};
    this.T = T;
    this._skill = indexBy(T.Skill, 'Id');
    this._hitbox = indexBy(T.HitBox, 'Id');
    this._buff = indexBy(T.Buff, 'Id');
    this._char = indexBy(T.Character, 'Id');
    this._mon = indexBy(T.Monster, 'Id');
    this._equip = indexBy(T.Equipment, 'Id');
    this._extra = indexBy(T.ExtraUnit, 'Id');
    this._faction = indexBy(T.Faction, 'Id');
    this._shield = indexBy(T.Shield, 'Id');
    this._diff = indexBy(T.Difficulty, 'Difficulty');
    this._const = indexBy(T.Const, 'Id');
    this._buffVfx = indexBy(T.BuffVfx, 'BuffId');
    var tags = T.StatusEffectTag;
    this.tagList = [];
    this._tag = {};
    if (tags) {
      var arr = Array.isArray(tags) ? tags : Object.keys(tags).map(function (k) { return tags[k]; });
      for (var i = 0; i < arr.length; i++) { this.tagList.push(arr[i].Tag); this._tag[arr[i].Tag] = arr[i]; }
    }
    if (!this.tagList.length) {
      // thứ tự StatusEffectTag.csv (17 dòng) — dự phòng khi bảng không được nạp
      this.tagList = ['None', 'Bleed', 'Burn', 'Blind', 'Root', 'Light', 'Silence', 'Slow', 'Weaken', 'DefReduction',
        'Confuse', 'Poison', 'Stun', 'Knockback', 'Pull', 'Madness', 'Freeze'];
    }
  }
  CombatDB.prototype.skill = function (id) { return this._skill[id] || null; };
  CombatDB.prototype.hitbox = function (id) { return this._hitbox[id] || null; };
  CombatDB.prototype.buff = function (id) { return this._buff[id] || null; };
  CombatDB.prototype.character = function (id) { return this._char[id] || null; };
  CombatDB.prototype.monster = function (id) { return this._mon[id] || null; };
  CombatDB.prototype.equipment = function (id) { return this._equip[id] || null; };
  CombatDB.prototype.extraUnit = function (id) { return this._extra[id] || null; };
  CombatDB.prototype.faction = function (id) { return this._faction[id] || null; };
  CombatDB.prototype.shield = function (id) { return this._shield[id] || null; };
  CombatDB.prototype.difficulty = function (name) { return name ? (this._diff[name] || null) : null; };
  CombatDB.prototype.tag = function (name) { return this._tag[name] || null; };
  CombatDB.prototype.buffVfx = function (id) { return this._buffVfx[id] || null; };
  // Const: FloatValue nếu khác 0, không thì IntValue (Const.csv có cả hai cột).
  CombatDB.prototype.c = function (name, dflt) {
    var r = this._const[name];
    if (!r) return dflt === undefined ? 0 : dflt;
    var f = num(r.FloatValue);
    return f !== 0 ? f : num(r.IntValue);
  };
  CombatDB.prototype.cs = function (name) { var r = this._const[name]; return r ? r.StringValue : null; };

  var _db = null, _dbSrc = null;
  VD.CombatDB = CombatDB;
  // VD.combatDB(): chỉ mục của VD.T (dựng lại nếu VD.T đổi). Test có thể gán VD.T trước khi gọi.
  VD.combatDB = function (T) {
    if (T) { _db = new CombatDB(T); _dbSrc = T; return _db; }
    if (!_db || _dbSrc !== VD.T) { _db = new CombatDB(VD.T || {}); _dbSrc = VD.T; }
    return _db;
  };
  VD.num = num;
  VD.vec3 = vec3;

  // ---------- chỉ số ----------
  // Cặp "cộng phẳng / cộng phần trăm": giá trị cuối = (gốc + phẳng) × (1 + %/100).
  var PAIRS = {
    Atk: 'AtkPercent', Def: 'DefPercent', MoveSpeed: 'MoveSpeedPercent', HpMax: 'HpMaxPercent',
    AtkSpeed: 'AtkSpeedPercent', RunIncreaseSpeed: 'RunIncreaseSpeedPercent', RunStaminaCost: 'RunStaminaCostPercent',
    StaminaMax: 'StaminaMaxPercent', StaminaRegen: 'StaminaRegenPercent', HpRegen: 'HpRegenPercent'
  };

  function addStat(obj, name, v) { obj[name] = (obj[name] || 0) + v; }

  var Stats = {};
  Stats.PAIRS = PAIRS;

  // Chỉ số gốc. kind 'char' | 'mon' | 'extra'. opts: { weaponId, weaponBroken, equipmentIds, difficulty }
  Stats.base = function (db, kind, row, opts) {
    opts = opts || {};
    var b = {
      HpMax: num(row.Hp), Atk: num(row.Atk), Def: num(row.Def), AtkSpeed: num(row.AtkSpeed) || 1,
      MoveSpeed: num(row.MoveSpeed), HpRegen: num(row.HpRegen),
      StaminaMax: num(row.Stamina), StaminaRegen: num(row.StaminaRegen),
      RunStaminaCost: num(row.RunStaminaCost), RunIncreaseSpeed: num(row.RunIncreaseSpeed),
      FireResistancePercent: num(row.FireResistancePercent),
      WaterResistancePercent: num(row.WaterResistancePercent),
      WindResistancePercent: num(row.WindResistancePercent != null ? row.WindResistancePercent : row.LightningResistancePercent),
      CriticalChancePercent: db.c('DefaultCriticalChancePercent', 7),
      CriticalDamagePercent: db.c('DefaultCriticalDamagePercent', 35),
      WeaknessDamagePercent: db.c('DefaultWeaknessDamagePercent', 10)
    };
    var flat = {};
    if (kind === 'char') {
      var wid = opts.weaponId != null ? opts.weaponId : row.DefaultWeaponId;
      var w = wid != null ? db.equipment(wid) : null;
      if (w) {
        var list = (opts.weaponBroken ? w.BrokenStats : w.Stats) || [];
        var mul = row.WeaponAtkMultiplier != null ? num(row.WeaponAtkMultiplier) : 1;
        for (var i = 0; i < list.length; i++) {
          var name = list[i][0], v = num(list[i][1]);
          if (name === 'Atk') b.Atk += v * mul; else addStat(flat, name, v);
        }
      }
      var eq = opts.equipmentIds || [];
      for (var j = 0; j < eq.length; j++) {
        var e = db.equipment(eq[j]);
        if (!e) continue;
        var st = e.Stats || [];
        for (var k = 0; k < st.length; k++) addStat(flat, st[k][0], num(st[k][1]));
      }
    } else if (kind === 'mon') {
      var d = db.difficulty(opts.difficulty);
      if (d) {
        b.HpMax *= num(d.MonsterHpPercent) / 100;
        b.Atk *= num(d.MonsterAtkPercent) / 100;
        b.Def *= num(d.MonsterDefPercent) / 100;
      }
    }
    return { base: b, flat: flat };
  };

  // Tính chỉ số cuối cho unit: u.base (+ u.baseFlat) + mod buff (u.buffs.statMods) + u.extraMods.
  Stats.compute = function (u) {
    var mods = {};
    var k;
    if (u.baseFlat) for (k in u.baseFlat) addStat(mods, k, u.baseFlat[k]);
    if (u.extraMods) for (k in u.extraMods) addStat(mods, k, u.extraMods[k]);
    if (u.buffs && u.buffs.statMods) u.buffs.statMods(mods);
    var out = {};
    for (k in u.base) out[k] = u.base[k];
    for (k in mods) {
      if (PAIRS[k]) addStat(out, k, mods[k]);
      else if (!isPercentOfPair(k)) addStat(out, k, mods[k]);
    }
    for (var s in PAIRS) {
      var pct = mods[PAIRS[s]] || 0;
      out[PAIRS[s]] = pct;
      out[s] = (out[s] || 0) * (1 + pct / 100);
    }
    if (out.MoveSpeed < 0) out.MoveSpeed = 0;
    if (out.AtkSpeed < 0.05) out.AtkSpeed = 0.05;
    u.stats = out;
    return out;
  };
  var PCT_OF = {};
  for (var p in PAIRS) PCT_OF[PAIRS[p]] = true;
  function isPercentOfPair(k) { return !!PCT_OF[k]; }

  Stats.get = function (u, name) {
    if (!u.stats) Stats.compute(u);
    return u.stats[name] || 0;
  };

  // Hồi chiêu thực: CoolTime × (1 − min(CDR, MaxCooldownReductionPercent)/100), sàn MinCoolTime.
  // Quái: cộng thêm Difficulty.CooldownReductionPercent (Easy −70 → chậm hơn). [SUY LUẬN]
  Stats.cooldown = function (db, u, skillRow, difficulty) {
    var ct = num(skillRow.CoolTime);
    if (ct <= 0) return 0;
    var cdr = Math.min(Stats.get(u, 'CooldownReductionPercent'), db.c('MaxCooldownReductionPercent', 40));
    if (u.kind === 'mon') {
      var d = db.difficulty(difficulty);
      if (d) cdr += num(d.CooldownReductionPercent);
    }
    return Math.max(db.c('MinCoolTime', 0.2), ct * (1 - cdr / 100));
  };

  VD.Stats = Stats;
})(window.VD = window.VD || {});
