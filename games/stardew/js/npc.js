/*
 * npc.js - the villagers: where they are, where they are going, and what they
 * say when you get there.
 *
 * Thirteen people, one per inhabited island, each with a schedule in
 * data/npcs.js that moves them by the hour and by the weekday. The engine is
 * the same shape the previous build used against the real Stardew schedule
 * files, and it is kept because the shape was right: pick today's block, walk
 * there, stand there, say something appropriate to the hour and the weather.
 *
 * Three rules keep it cheap enough for a phone, and they matter more here than
 * they did before because there are no map boundaries to hide behind - every
 * villager in the world is on screen's own map, all the time:
 *
 *  1. Only villagers on the player's CURRENT island walk a tile at a time.
 *     Everyone else is snapped straight to their scheduled position. That is
 *     invisible by definition: you cannot see them.
 *  2. A path is searched only when the DESTINATION changes, then followed for
 *     the next few hundred frames.
 *  3. A villager whose island the player does not own is not in the world at
 *     all. That is the honest reading of "you have not found them yet", and it
 *     keeps the actor list to the handful of islands actually in play.
 */
(function (global) {
  'use strict';

  var A = global.ISL_ATLAS;
  var ISL = global.ISL_ISLANDS;

  function bundle() { return global.ISL_NPCS || { npcs: {}, universal: {}, order: [] }; }

  function toMin(hhmm) {
    if (hhmm == null) return null;
    return Math.floor(hhmm / 100) * 60 + (hhmm % 100);
  }

  // ------------------------------------------------------------------ build
  /* Rebuilt whenever ownership changes or a day rolls over. Villagers are
   * cheap objects; keeping the old ones around and diffing them was the first
   * version and it leaked a duplicate of every villager per island bought. */
  function build(game) {
    var b = bundle();
    var out = [];
    b.order.forEach(function (id) {
      var def = b.npcs[id];
      if (!def) return;
      if (!game.sim.owned[def.home]) return;
      out.push({
        id: id, def: def, name: def.name,
        art: def.art, x: 0, y: 0, dir: 'down',
        moving: false, path: null, target: null, block: null,
        said: null, exclaim: false
      });
    });
    game.world.npcs = out;
    reschedule(game, true);
    return out;
  }

  /* Which schedule list runs today. Most specific first - a weekday override
   * beats a season, a season beats rain, rain beats the default. */
  function todayList(game, def) {
    var s = def.schedule || {};
    var day = game.sim.dayOfWeek();
    var season = game.sim.season();
    var raining = game.sim.weather === 'rain' || game.sim.weather === 'storm';
    return s[day] || s[season] || (raining && s.rain) || s.default || [];
  }

  function blockNow(game, def) {
    var list = todayList(game, def);
    var now = game.sim.time;
    var pick = null;
    for (var i = 0; i < list.length; i++) {
      var at = toMin(list[i].at);
      if (at != null && at <= now) pick = list[i];
    }
    /* Before the first block of the day, a villager is wherever the LAST block
     * of the day left them - which is their bed. Without this everyone spawned
     * on their 6am tile at 2am, standing in the dark at the shop counter. */
    if (!pick && list.length) pick = list[list.length - 1];
    return pick;
  }

  function worldPos(game, block) {
    if (!block) return null;
    var rec = game.islandRec(block.isl);
    if (!rec) return null;
    var a = game.area();
    var spot = a.nearestFree(rec.x + block.x, rec.y + block.y, 6);
    return { x: spot.x, y: spot.y, face: block.face || 'down', rec: rec, block: block };
  }

  function reschedule(game, snap) {
    var here = game.currentIsland();
    var npcs = game.world.npcs || [];
    for (var i = 0; i < npcs.length; i++) {
      var v = npcs[i];
      var b = blockNow(game, v.def);
      if (!b) continue;
      if (v.block === b && !snap) continue;
      var pos = worldPos(game, b);
      if (!pos) continue;
      v.block = b;
      v.target = pos;
      v.say = b.say || null;
      var onScreen = here && pos.rec.id === here.id;
      if (snap || !onScreen) {
        v.x = pos.x; v.y = pos.y; v.dir = pos.face; v.path = null; v.moving = false;
      } else {
        v.path = findPath(game.area(), Math.round(v.x), Math.round(v.y), pos.x, pos.y);
      }
    }
  }

  // ------------------------------------------------------------------- walk
  var STEP_TIME = 0.22;             // seconds per tile - a stroll, not a march

  function step(game, dt) {
    var here = game.currentIsland();
    var npcs = game.world.npcs || [];
    for (var i = 0; i < npcs.length; i++) {
      var v = npcs[i];
      if (!v.target) continue;
      var onScreen = here && v.target.rec && v.target.rec.id === here.id;
      if (!onScreen) {
        /* Off screen: teleport. Nobody can tell, and walking thirteen people
         * around 20,000 tiles a frame is the whole per-frame budget. */
        if (v.x !== v.target.x || v.y !== v.target.y) {
          v.x = v.target.x; v.y = v.target.y; v.dir = v.target.face;
          v.moving = false; v.path = null;
        }
        continue;
      }
      if (!v.path || !v.path.length) {
        v.moving = false;
        if (v.dir !== v.target.face && Math.round(v.x) === v.target.x &&
            Math.round(v.y) === v.target.y) {
          v.dir = v.target.face;
        }
        continue;
      }
      v.moving = true;
      v.t = (v.t || 0) + dt;
      while (v.t >= STEP_TIME && v.path.length) {
        v.t -= STEP_TIME;
        var n = v.path.shift();
        if (game.area().solid(n[0], n[1])) {
          /* Something moved into the path - a tree the player planted, a chest
           * they dropped. Re-search once rather than stand there vibrating. */
          v.path = findPath(game.area(), Math.round(v.x), Math.round(v.y),
                            v.target.x, v.target.y);
          break;
        }
        v.dir = n[0] > v.x ? 'right' : n[0] < v.x ? 'left' : (n[1] > v.y ? 'down' : 'up');
        v.x = n[0]; v.y = n[1];
      }
    }
  }

  /* Breadth-first, capped. The islands are small and open, so this almost
   * always finishes in a few hundred nodes; the cap exists for the case where
   * a villager's island got disconnected and the search would otherwise walk
   * the whole 20,000-tile field before giving up. */
  var MAX_NODES = 3000;
  function findPath(area, sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [];
    var q = [[sx, sy]], seen = {}, from = {};
    seen[sx + ',' + sy] = 1;
    var n = 0, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length && n++ < MAX_NODES) {
      var p = q.shift();
      for (var i = 0; i < 4; i++) {
        var nx = p[0] + D[i][0], ny = p[1] + D[i][1], k = nx + ',' + ny;
        if (seen[k] || area.solid(nx, ny)) continue;
        seen[k] = 1; from[k] = p;
        if (nx === tx && ny === ty) {
          var out = [], cur = [nx, ny];
          while (cur[0] !== sx || cur[1] !== sy) {
            out.unshift(cur);
            cur = from[cur[0] + ',' + cur[1]];
            if (!cur) return [];
          }
          return out;
        }
        q.push([nx, ny]);
      }
    }
    return [];
  }

  // ------------------------------------------------------------------ query
  function at(game, x, y) {
    var npcs = game.world.npcs || [];
    for (var i = 0; i < npcs.length; i++) {
      if (Math.round(npcs[i].x) === x && Math.round(npcs[i].y) === y) return npcs[i];
    }
    return null;
  }
  function byId(game, id) {
    var npcs = game.world.npcs || [];
    for (var i = 0; i < npcs.length; i++) if (npcs[i].id === id) return npcs[i];
    return null;
  }

  // ------------------------------------------------------------------- talk
  /* A line, chosen for the hour, the weather and how well they know you. The
   * schedule block's own `say` wins when it has one, because that is the line
   * written for exactly this moment. */
  function lineFor(game, v) {
    var L = v.def.lines || {};
    var hearts = game.sim.hearts(v.name);
    if (game.sim.isBirthday && game.sim.isBirthday(v.name)) {
      return 'Hôm nay sinh nhật mình đấy! Bạn có nhớ không?';
    }
    if (v.say && !v.saidToday) { v.saidToday = game.sim.dayIndex(); return v.say; }
    var pool = [];
    if (hearts >= 6 && L.friend) pool = pool.concat(L.friend);
    if (game.sim.isNight() && L.night) pool = pool.concat(L.night);
    var raining = game.sim.weather === 'rain' || game.sim.weather === 'storm';
    if (raining && L.rain) pool = pool.concat(L.rain);
    if (!pool.length) pool = L.default || ['...'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function talk(game, v) {
    var line = lineFor(game, v);
    var gained = game.sim.talkTo(v.name);
    if (gained) game.addRank(2);
    v.exclaim = false;
    return { line: line, gained: gained, hearts: game.sim.hearts(v.name) };
  }

  /* Gift tastes: personal lists first, then the universal ones. Returning the
   * taste rather than applying it lets the panel show what it will be worth
   * BEFORE the player commits an item they cannot get back. */
  function taste(game, v, item) {
    var d = v.def, u = bundle().universal;
    if ((d.love || []).indexOf(item) >= 0) return 'love';
    if ((d.like || []).indexOf(item) >= 0) return 'like';
    if ((d.hate || []).indexOf(item) >= 0) return 'hate';
    if ((u.love || []).indexOf(item) >= 0) return 'love';
    if ((u.like || []).indexOf(item) >= 0) return 'like';
    if ((u.hate || []).indexOf(item) >= 0) return 'hate';
    if ((u.dislike || []).indexOf(item) >= 0) return 'dislike';
    return 'neutral';
  }

  var TASTE_PTS = { love: 80, like: 45, neutral: 20, dislike: -20, hate: -40 };
  var TASTE_SAY = {
    love: ['Đúng thứ mình thích! Cảm ơn nhiều lắm!', 'Trời ơi, sao bạn biết hay vậy!'],
    like: ['Cái này hay đấy, cảm ơn.', 'Mình thích món này.'],
    neutral: ['À, cảm ơn nhé.', 'Ừ... để mình cất.'],
    dislike: ['Ừ thì... cảm ơn.', 'Mình không hợp món này lắm.'],
    hate: ['Bạn đưa mình cái này để làm gì?', 'Cầm về đi, thật đấy.']
  };

  function gift(game, v, item) {
    var sim = game.sim;
    var fr = sim.friend(v.name);
    if (fr.giftDay === sim.dayIndex()) {
      return { ok: false, line: 'Hôm nay bạn tặng mình rồi mà.' };
    }
    var t = taste(game, v, item);
    var pts = TASTE_PTS[t];
    var bday = sim.isBirthday && sim.isBirthday(v.name);
    if (bday) pts *= 8;
    sim.take(item, 1);
    fr.giftDay = sim.dayIndex();
    fr.week = (fr.week || 0) + 1;
    sim.addFriendship(v.name, pts);
    if (pts > 0) game.addRank(Math.ceil(pts / 8));
    var says = TASTE_SAY[t];
    return {
      ok: true, taste: t, points: pts, birthday: !!bday,
      line: (bday ? 'Quà sinh nhật cho mình á?! ' : '') +
            says[Math.floor(Math.random() * says.length)],
      hearts: sim.hearts(v.name)
    };
  }

  /* The portrait the dialogue box shows. Falls back to the walking sprite,
   * which is always present - a missing portrait must never blank the panel. */
  function portrait(v) {
    if (v.def.portrait && A.has(v.def.portrait)) return v.def.portrait;
    return v.art;
  }

  global.ISL_NPC = {
    build: build, reschedule: reschedule, step: step,
    at: at, byId: byId, talk: talk, gift: gift, taste: taste,
    lineFor: lineFor, portrait: portrait, findPath: findPath,
    TASTE_PTS: TASTE_PTS
  };
})(window);
