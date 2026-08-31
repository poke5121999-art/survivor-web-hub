/*
 * pokework.js - Pokemon as farm labour.
 *
 * This is the system that makes catching things matter to a farming game. A
 * Pokemon in the party can be told to do a chore, and the chore costs NO
 * PLAYER ENERGY - it costs that Pokemon's Work Points for the day. Watering a
 * forty-tile field by hand is forty swings and most of a morning; a Squirtle
 * does it in one tap and has two more jobs left in it.
 *
 * Three rules hold the whole thing together:
 *
 *  1. TYPE DECIDES THE JOB. A Water type waters, a Ground type tills, a Grass
 *     type harvests. That is what turns a type chart from battle trivia into
 *     something you think about while building a team, and it means the answer
 *     to "which Pokemon should I catch next" is a farming question.
 *
 *  2. WORK POINTS ARE A DAILY BUDGET, per Pokemon, not per player. The count
 *     comes from poke.js `maxWork` - roughly 3 for a Caterpie, 6 for a fully
 *     grown pseudo-legendary, 10+ for a legendary, plus bonuses for happiness
 *     and shininess. A six-slot party of good Pokemon is about 30 jobs a day,
 *     which is comfortably a whole farm and not remotely everything else.
 *
 *  3. THE BIG JOBS COST MORE. Anything that acts on the WHOLE island costs 2
 *     or 3, anything local costs 1. Without that split a Magikarp could water
 *     the entire archipelago three times before lunch.
 *
 * Points reset at sleep, not at midnight, so a long night of mining does not
 * quietly refund the morning's chores.
 */
(function (global) {
  'use strict';

  var P = global.ISL_POKE;

  /* Type indices, spelled out so a rule reads as a sentence rather than a
   * magic number. These match data/pokedata.js `types`. */
  var T = {
    normal: 0, fire: 1, water: 2, electric: 3, grass: 4, ice: 5, fighting: 6,
    poison: 7, ground: 8, flying: 9, psychic: 10, bug: 11, rock: 12,
    ghost: 13, dragon: 14, dark: 15, steel: 16
  };

  /* -------------------------------------------------------------- the jobs
   * id      stable key, saved in the tutorial/flag store
   * name    what the button says
   * types   any one of these on the Pokemon qualifies it
   * cost    work points
   * scope   'island' | 'near' | 'world' - only used for the description
   * lvl     minimum Pokemon level, so a level-5 starter cannot run the farm
   * run     (ctx) -> {ok, msg} ; ctx = {game, sim, area, poke, isl, px, py}
   */
  var SKILLS = [
    {
      id: 'water', name: 'Tưới Vườn', icon: 'Water',
      types: [T.water, T.ice], cost: 1, scope: 'island', lvl: 5,
      desc: 'Tưới mọi luống đã trồng trên đảo này.',
      run: function (c) {
        var n = 0;
        eachTile(c, function (x, y) {
          if (c.area.name_of(x, y) === 'tilled') { c.area.set(x, y, 'watered'); n++; }
        });
        eachObj(c, function (o) {
          if (o.kind === 'crop' && !o.dead && !o.watered) { o.watered = true; }
        });
        return n ? { ok: true, msg: nameOf(c) + ' tưới ' + n + ' ô đất.' }
                 : { ok: false, msg: 'Không còn ô nào cần tưới.' };
      }
    },
    {
      id: 'till', name: 'Cuốc Đất', icon: 'Shovel',
      types: [T.ground, T.rock, T.fighting, T.steel], cost: 1, scope: 'near', lvl: 5,
      desc: 'Cuốc hết đất trống trong vùng 7x7 quanh bạn.',
      run: function (c) {
        var n = 0;
        for (var dy = -3; dy <= 3; dy++) {
          for (var dx = -3; dx <= 3; dx++) {
            var x = c.px + dx, y = c.py + dy;
            if (c.area.name_of(x, y) !== 'dirt') continue;
            if (c.area.objAt(x, y)) continue;
            c.area.set(x, y, 'tilled'); n++;
          }
        }
        return n ? { ok: true, msg: nameOf(c) + ' cuốc ' + n + ' ô.' }
                 : { ok: false, msg: 'Quanh đây không còn đất trống để cuốc.' };
      }
    },
    {
      id: 'harvest', name: 'Thu Hoạch', icon: 'Wheat',
      types: [T.grass, T.bug, T.normal], cost: 2, scope: 'island', lvl: 8,
      desc: 'Hái mọi cây đã chín trên đảo này và bỏ vào túi.',
      run: function (c) {
        var got = 0, full = false;
        var ready = [];
        eachObj(c, function (o) {
          if (o.kind === 'crop' && !o.dead && o.stage >= o.maxStage && !o.harvested) ready.push(o);
        });
        for (var i = 0; i < ready.length; i++) {
          if (!c.game.harvestCrop) break;
          var r = c.game.harvestCrop(ready[i], { silent: true, free: true });
          if (r === 'full') { full = true; break; }
          if (r) got++;
        }
        if (full) return { ok: got > 0, msg: 'Túi đầy — mới hái được ' + got + ' cây.' };
        return got ? { ok: true, msg: nameOf(c) + ' hái ' + got + ' cây.' }
                   : { ok: false, msg: 'Chưa có cây nào chín trên đảo này.' };
      }
    },
    {
      id: 'plant', name: 'Gieo Hạt', icon: 'CoinSeeds',
      types: [T.grass, T.normal, T.flying], cost: 2, scope: 'island', lvl: 8,
      desc: 'Gieo loại hạt bạn đang cầm vào mọi ô đã cuốc.',
      run: function (c) {
        var seed = c.game.heldSeed && c.game.heldSeed();
        if (!seed) return { ok: false, msg: 'Chọn một loại hạt trong túi trước đã.' };
        var n = 0, ran = false;
        var spots = [];
        eachTile(c, function (x, y) {
          var t = c.area.name_of(x, y);
          if ((t === 'tilled' || t === 'watered') && !c.area.objAt(x, y)) spots.push([x, y]);
        });
        for (var i = 0; i < spots.length; i++) {
          if (c.sim.count(seed.name) <= 0) { ran = true; break; }
          if (!c.game.plantAt || !c.game.plantAt(spots[i][0], spots[i][1], seed.name, { silent: true })) break;
          n++;
        }
        if (!n) return { ok: false, msg: ran ? 'Hết hạt rồi.' : 'Không còn ô đã cuốc nào trống.' };
        return { ok: true, msg: nameOf(c) + ' gieo ' + n + ' hạt' + (ran ? ' rồi hết hạt.' : '.') };
      }
    },
    {
      id: 'fert', name: 'Bón Phân', icon: 'Fertilizer',
      types: [T.grass, T.poison, T.ground], cost: 1, scope: 'island', lvl: 8,
      desc: 'Rải phân bón trong túi lên các luống đã cuốc.',
      run: function (c) {
        var fert = c.game.heldFertilizer && c.game.heldFertilizer();
        if (!fert) return { ok: false, msg: 'Cần có phân bón trong túi.' };
        var n = 0;
        var spots = [];
        eachTile(c, function (x, y) {
          var t = c.area.name_of(x, y);
          if (t === 'tilled' || t === 'watered') spots.push([x, y]);
        });
        for (var i = 0; i < spots.length; i++) {
          if (c.sim.count(fert) <= 0) break;
          if (!c.game.fertilizeAt || !c.game.fertilizeAt(spots[i][0], spots[i][1], fert)) continue;
          n++;
        }
        return n ? { ok: true, msg: nameOf(c) + ' bón phân cho ' + n + ' ô.' }
                 : { ok: false, msg: 'Không ô nào cần bón.' };
      }
    },
    {
      id: 'chop', name: 'Đốn Cây', icon: 'Wood',
      types: [T.grass, T.fighting, T.steel, T.fire], cost: 1, scope: 'near', lvl: 10,
      desc: 'Hạ mọi cây trong vùng 9x9 quanh bạn.',
      run: function (c) { return clear(c, ['tree', 'bigTree', 'stump'], 4, 'đốn'); }
    },
    {
      id: 'smash', name: 'Đập Đá', icon: 'Stone',
      types: [T.rock, T.ground, T.fighting, T.steel], cost: 1, scope: 'near', lvl: 10,
      desc: 'Đập vỡ mọi tảng đá trong vùng 9x9 quanh bạn.',
      run: function (c) { return clear(c, ['rock', 'bigRock', 'oreRock'], 4, 'đập'); }
    },
    {
      id: 'weed', name: 'Dọn Cỏ Dại', icon: 'BerryFlower',
      types: [T.normal, T.grass, T.flying, T.bug], cost: 1, scope: 'island', lvl: 5,
      desc: 'Nhổ sạch cỏ dại trên cả đảo.',
      run: function (c) {
        var n = 0, kill = [];
        eachObj(c, function (o) { if (o.kind === 'weed') kill.push(o); });
        kill.forEach(function (o) { c.area.remove(o); n++; });
        if (n) c.sim.give('Fiber', n);
        return n ? { ok: true, msg: nameOf(c) + ' nhổ ' + n + ' bụi cỏ dại.' }
                 : { ok: false, msg: 'Đảo này đã sạch cỏ.' };
      }
    },
    {
      id: 'gather', name: 'Gom Đồ', icon: 'Magnet',
      types: [T.psychic, T.electric, T.steel, T.ghost], cost: 1, scope: 'island', lvl: 5,
      desc: 'Hút mọi món đồ đang rơi trên đảo về túi bạn.',
      run: function (c) {
        var got = 0, drops = [];
        eachObj(c, function (o) { if (o.kind === 'drop' || o.kind === 'forage') drops.push(o); });
        for (var i = 0; i < drops.length; i++) {
          var d = drops[i];
          if (!c.sim.hasSpace() && c.sim.count(d.item) === 0) break;
          c.sim.give(d.item, d.qty || 1, d.quality || 0);
          c.area.remove(d); got++;
        }
        return got ? { ok: true, msg: nameOf(c) + ' gom ' + got + ' món về túi.' }
                   : { ok: false, msg: 'Không có gì rơi trên đảo này.' };
      }
    },
    {
      id: 'feed', name: 'Cho Thú Ăn', icon: 'PremiunFeed',
      types: [T.normal, T.grass, T.water], cost: 2, scope: 'island', lvl: 8,
      desc: 'Cho ăn và vuốt ve toàn bộ vật nuôi.',
      run: function (c) {
        if (!c.game.feedAllAnimals) return { ok: false, msg: 'Chưa có vật nuôi nào.' };
        var n = c.game.feedAllAnimals();
        return n ? { ok: true, msg: nameOf(c) + ' chăm ' + n + ' con vật.' }
                 : { ok: false, msg: 'Đàn vật nuôi đã được chăm hôm nay.' };
      }
    },
    {
      id: 'fish', name: 'Câu Hộ', icon: 'goldFishingRod',
      types: [T.water], cost: 2, scope: 'near', lvl: 12,
      desc: 'Tự câu 3 con cá ở vùng nước gần nhất.',
      run: function (c) {
        if (!c.game.autoFish) return { ok: false, msg: 'Gần đây không có chỗ câu.' };
        var caught = c.game.autoFish(3);
        return caught && caught.length
          ? { ok: true, msg: nameOf(c) + ' câu được: ' + caught.join(', ') }
          : { ok: false, msg: 'Không có mặt nước nào đủ gần.' };
      }
    },
    {
      id: 'warm', name: 'Ủ Lò', icon: 'OvenFog0',
      types: [T.fire], cost: 2, scope: 'island', lvl: 12,
      desc: 'Hoàn thành ngay mọi máy chế biến đang chạy trên đảo.',
      run: function (c) {
        var n = 0;
        eachObj(c, function (o) {
          if (o.kind === 'machine' && o.busy) { o.ready = true; o.busy = false; n++; }
        });
        return n ? { ok: true, msg: nameOf(c) + ' hun nóng ' + n + ' máy — xong ngay.' }
                 : { ok: false, msg: 'Không máy nào đang chạy.' };
      }
    },
    {
      id: 'light', name: 'Soi Quặng', icon: 'Magnetic',
      types: [T.electric, T.fire, T.psychic], cost: 1, scope: 'world', lvl: 10,
      desc: 'Hôm nay quặng và thang hiện trên bản đồ nhỏ trong hầm mỏ.',
      run: function (c) {
        c.sim.flags.oreSense = c.sim.dayIndex();
        return { ok: true, msg: nameOf(c) + ' thắp sáng hầm mỏ — hôm nay thấy hết quặng.' };
      }
    },
    {
      id: 'dig', name: 'Đào Kho Báu', icon: 'MapFragment',
      types: [T.ground, T.dark], cost: 3, scope: 'island', lvl: 15,
      desc: 'Moi lên một rương kho báu chôn dưới đảo. Một lần mỗi đảo mỗi ngày.',
      run: function (c) {
        var key = 'dug:' + c.isl.id + ':' + c.sim.dayIndex();
        if (c.sim.flags[key]) return { ok: false, msg: 'Đảo này đã bị đào hôm nay rồi.' };
        if (!c.game.digTreasure) return { ok: false, msg: 'Không đào được gì.' };
        var loot = c.game.digTreasure(c.isl);
        /* Mark the island dug only once something actually came up. The flag
         * was set first, so a dig that failed - a full bag - charged nothing
         * but still burned the island's one dig for the day. */
        if (!loot || !loot.length) return { ok: false, msg: 'Túi đầy — không đào được gì.' };
        c.sim.flags[key] = 1;
        return { ok: true, msg: nameOf(c) + ' đào được: ' + loot.join(', ') };
      }
    },
    {
      id: 'fly', name: 'Bay', icon: 'Arrow_0',
      types: [T.flying, T.dragon], cost: 1, scope: 'world', lvl: 10,
      desc: 'Bay thẳng tới bất kỳ đảo nào bạn đã sở hữu.',
      picker: 'island',
      run: function (c) {
        if (!c.target) return { ok: false, msg: 'Chọn một đảo trước.' };
        c.game.travelTo(c.target);
        return { ok: true, msg: nameOf(c) + ' đưa bạn tới ' + c.target.isl.name + '.' };
      }
    },
    {
      id: 'teleport', name: 'Dịch Chuyển', icon: 'dimensionGateIn',
      types: [T.psychic, T.ghost], cost: 1, scope: 'world', lvl: 8,
      desc: 'Về thẳng Đảo Nhà, dù bạn đang ở đâu.',
      run: function (c) {
        c.game.travelTo(c.game.islandRec('home'));
        return { ok: true, msg: nameOf(c) + ' dịch chuyển bạn về nhà.' };
      }
    },
    {
      id: 'rain', name: 'Gọi Mưa', icon: 'Water0',
      types: [T.water, T.flying, T.ice], cost: 3, scope: 'world', lvl: 20,
      desc: 'Ngày mai trời sẽ mưa — cả quần đảo được tưới miễn phí.',
      run: function (c) {
        /* TOMORROW's season, not today's. endDay throws away any forecast the
         * season it lands in cannot have, so calling rain on the 28th of Fall
         * charged three work points, promised free watering, and produced a
         * re-rolled winter sky. */
        var next = c.sim.seasonTomorrow ? c.sim.seasonTomorrow() : c.sim.season();
        if (next === 'Winter') {
          c.sim.tomorrowWeather = 'snow';
          return { ok: true, msg: nameOf(c) + ' gọi tuyết. Mai tuyết rơi — cây không được tưới.' };
        }
        c.sim.tomorrowWeather = 'rain';
        return { ok: true, msg: nameOf(c) + ' gọi mưa. Mai cả quần đảo tự tưới.' };
      }
    }
  ];

  var BY_ID = {};
  SKILLS.forEach(function (s) { BY_ID[s.id] = s; });

  function nameOf(c) { return P.nameOf(c.poke); }

  /* Every tile of the island the player is standing on. Confining a job to one
   * island is what keeps the big skills from being a world button - and it is
   * the reason the cost split in the header note works at all. */
  function eachTile(c, fn) {
    for (var y = c.isl.y; y < c.isl.y + c.isl.h; y++)
      for (var x = c.isl.x; x < c.isl.x + c.isl.w; x++) fn(x, y);
  }
  function eachObj(c, fn) {
    var objs = c.area.objs;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.x < c.isl.x || o.x >= c.isl.x + c.isl.w) continue;
      if (o.y < c.isl.y || o.y >= c.isl.y + c.isl.h) continue;
      fn(o);
    }
  }

  function clear(c, kinds, r, verb) {
    var hit = [], n = 0;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var o = c.area.objAt(c.px + dx, c.py + dy);
        if (o && kinds.indexOf(o.kind) >= 0 && hit.indexOf(o) < 0) hit.push(o);
      }
    }
    for (var i = 0; i < hit.length; i++) {
      if (c.game.breakObject && c.game.breakObject(hit[i], { instant: true, free: true })) n++;
    }
    return n ? { ok: true, msg: nameOf(c) + ' ' + verb + ' ' + n + ' thứ.' }
             : { ok: false, msg: 'Quanh đây không có gì để ' + verb + '.' };
  }

  // -------------------------------------------------------------- eligible
  /* Which of a Pokemon's jobs it can actually do right now, and why not when
   * it cannot. Returning the reason rather than filtering the list out is what
   * lets the panel show a greyed-out row with "cần cấp 10" on it, instead of a
   * short list and a mystery. */
  function skillsFor(poke) {
    var sp = P.mon(poke.id);
    var out = [];
    for (var i = 0; i < SKILLS.length; i++) {
      var s = SKILLS[i];
      var typed = false;
      for (var j = 0; j < s.types.length; j++) {
        if (sp.t.indexOf(s.types[j]) >= 0) { typed = true; break; }
      }
      if (!typed) continue;
      var why = null;
      if (poke.hp <= 0) why = 'Đang kiệt sức';
      else if (poke.lv < s.lvl) why = 'Cần cấp ' + s.lvl;
      else if (P.workLeft(poke) < s.cost) why = 'Hết sức làm hôm nay';
      out.push({ skill: s, ok: !why, why: why });
    }
    return out;
  }

  /* Everything the whole party could do, deduplicated to the cheapest willing
   * Pokemon per job. This is what the one-tap "Sai Pokémon" button reads: the
   * player picks the CHORE, and the game picks who does it. Asking them to
   * remember which of six Pokemon is the Water one was the first version and
   * it was tiresome by the third day. */
  function partySkills(party) {
    var byId = {};
    for (var i = 0; i < party.length; i++) {
      var rows = skillsFor(party[i]);
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j], k = r.skill.id;
        if (!byId[k] || (!byId[k].ok && r.ok) ||
            (byId[k].ok && r.ok && P.workLeft(party[i]) > P.workLeft(byId[k].poke))) {
          byId[k] = { skill: r.skill, ok: r.ok, why: r.why, poke: party[i] };
        }
      }
    }
    var out = [];
    for (var id in byId) out.push(byId[id]);
    out.sort(function (a, b) {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill);
    });
    return out;
  }

  // ------------------------------------------------------------------ cast
  function cast(game, poke, skillId, target) {
    var s = BY_ID[skillId];
    if (!s) return { ok: false, msg: 'Không có kỹ năng đó.' };
    if (poke.hp <= 0) return { ok: false, msg: P.nameOf(poke) + ' đang kiệt sức.' };
    if (poke.lv < s.lvl) return { ok: false, msg: 'Cần cấp ' + s.lvl + ' trở lên.' };
    if (P.workLeft(poke) < s.cost) {
      return { ok: false, msg: P.nameOf(poke) + ' hết sức làm hôm nay rồi.' };
    }
    var area = game.area();
    var isl = game.currentIsland();
    if (!isl && s.scope !== 'world') {
      return { ok: false, msg: 'Phải đứng trên một hòn đảo.' };
    }
    var ctx = {
      game: game, sim: game.sim, area: area, poke: poke, isl: isl,
      px: Math.floor(game.player.x), py: Math.floor(game.player.y),
      target: target
    };
    var r = s.run(ctx) || { ok: false, msg: '' };
    if (r.ok) {
      poke.wp = (poke.wp || 0) + s.cost;
      /* Working together is how a Pokemon learns to like you. It is the only
       * happiness source that does not cost an item, and it is deliberately the
       * fastest one - the loop the game wants is farm with it, it likes you,
       * it works more, you farm more. */
      P.addHappy(poke, 2);
      area.reindex();
    }
    r.skill = s;
    r.poke = poke;
    return r;
  }

  /* Called from the sleep handler, not from the clock. See the header note. */
  function resetDay(party, boxes) {
    (party || []).forEach(function (p) { p.wp = 0; });
    (boxes || []).forEach(function (p) { p.wp = 0; });
  }

  global.ISL_POKEWORK = {
    SKILLS: SKILLS, byId: function (id) { return BY_ID[id]; },
    skillsFor: skillsFor, partySkills: partySkills,
    cast: cast, resetDay: resetDay, TYPES: T
  };
})(window);
