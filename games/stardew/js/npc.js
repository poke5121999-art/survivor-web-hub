/*
 * npc.js - the villagers: who they are, where they go, and what they think of
 * your presents.
 *
 * The first version moved people by reading the wiki's prose ("leaves her room
 * to stand in Pierre's General Store") through a table of keyword guesses. It
 * could not work, and it showed: most of the cast stood on one tile from dawn
 * to midnight, several stood inside a wall, and the town read as a diorama.
 *
 * data/npcs.js now carries the game's OWN schedule files - 31 villagers, every
 * block, every waypoint as a real map name and a real tile with a real facing.
 * So this file does what the original does: pick today's schedule block, walk
 * the person there through doors and streets, and leave them standing where
 * the game says they stand.
 *
 * Three rules keep it cheap enough for a phone:
 *   1. Only villagers in the player's own area walk. Everyone else is snapped
 *      straight to their scheduled tile - which is what the original does too,
 *      and is invisible by definition.
 *   2. A path is searched only when the destination changes, then followed
 *      over the next few hundred frames.
 *   3. A villager who cannot reach the tile the schedule names stops at the
 *      closest reachable one instead of vibrating against a wall.
 */
(function (global) {
  'use strict';

  var W = global.SDV_WORLD;
  var S = global.SDV_SPRITES;

  function bundle() { return global.SDV_NPCS || { npcs: {}, universal: {} }; }

  /* Schedule files name maps the way the game does. Most already exist in the
   * world's own table; these are the ones only a schedule ever mentions. */
  var EXTRA_MAP = {
    Mine: 'mineentry', Woods: 'woods', Railroad: 'railroad',
    BusStop: 'busstop', Backwoods: 'backwoods', Sewer: 'sewer',
    Greenhouse: 'greenhouse', IslandSouth: 'island', IslandNorth: 'islandnorth',
    IslandWest: 'islandwest', IslandEast: 'islandeast', Desert: 'desert',
    JojaMart: 'joja', Hospital: 'clinic', SeedShop: 'pierre',
    ScienceHouse: 'carpenter', AnimalShop: 'marnie', FishShop: 'fishshop',
    ArchaeologyHouse: 'museum', AdventureGuild: 'guild', ManorHouse: 'manor',
    CommunityCenter: 'cc', Beach: 'beach', Mountain: 'mountain',
    Forest: 'forest', Town: 'town', Saloon: 'saloon', Blacksmith: 'blacksmith',
    HaleyHouse: 'haley', SamHouse: 'sam', JoshHouse: 'josh',
    LeahHouse: 'leah', ElliottHouse: 'elliott', Trailer: 'trailer',
    WizardHouse: 'wizard', Tent: 'tent', BathHouse_Entry: 'bathhouse',
    BathHouse_Pool: 'bathpool', HarveyRoom: 'harveyroom',
    SebastianRoom: 'sebastianroom', Sunroom: 'sunroom', FarmHouse: 'house',
    Farm: 'farm', SandyHouse: 'oasis', Club: 'casino'
  };

  function areaOf(mapName) {
    if (!mapName) return null;
    return (W.MAP_ID && W.MAP_ID[mapName]) || EXTRA_MAP[mapName] || null;
  }

  /* The game files write times as HHMM ("1730", and "2530" for half past one
   * the next morning); this simulation counts minutes from midnight. Every
   * time that crosses the boundary goes through here.
   *
   * WHY it is worth a comment: getting this wrong is silent. 900 read as
   * minutes is a quarter past three in the afternoon, so every villager's day
   * ran six hours late and every shop opened in the dark - and nothing throws. */
  function toMin(hhmm) {
    if (hhmm == null) return null;
    return Math.floor(hhmm / 100) * 60 + (hhmm % 100);
  }

  var FACE = ['up', 'right', 'down', 'left'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ------------------------------------------------------------ area graph
  /* Which door leads from area A towards area B. Built once from the warps the
   * maps already carry, so a villager crossing town uses the same doors the
   * player does instead of teleporting through walls. */
  function buildGraph(areas) {
    var adj = {};
    for (var k in areas) {
      var a = areas[k];
      if (!a || !a.warps) continue;
      adj[k] = adj[k] || {};
      a.warps.forEach(function (w) {
        if (!w.to || adj[k][w.to]) return;
        adj[k][w.to] = w;
      });
    }
    return adj;
  }

  /* First hop of the shortest route from `from` to `to`, as the warp to step
   * on. Null when the two are not connected. */
  function firstHop(adj, from, to) {
    if (from === to) return null;
    var seen = {}, q = [[from, null]];
    seen[from] = 1;
    while (q.length) {
      var cur = q.shift(), here = cur[0], first = cur[1];
      var edges = adj[here] || {};
      for (var next in edges) {
        if (seen[next]) continue;
        var hop = first || { area: here, warp: edges[next] };
        if (next === to) return hop;
        seen[next] = 1;
        q.push([next, hop]);
      }
    }
    return null;
  }

  // ------------------------------------------------------------ pathfinding
  /* Breadth-first over the map's own collision. Returns the tile list to walk,
   * or the route to the closest tile it could reach when the destination is
   * walled off - a villager stuck on the wrong side of a fence should stand at
   * the fence, not jitter in place. */
  function findPath(area, sx, sy, tx, ty, budget) {
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (sx === tx && sy === ty) return [];
    budget = budget || 6000;
    var w = area.w, h = area.h;
    var prev = new Int32Array(w * h).fill(-1);
    var start = sy * w + sx, goal = ty * w + tx;
    var q = [start], head = 0, visited = 0;
    prev[start] = start;
    var best = start, bestD = Math.abs(sx - tx) + Math.abs(sy - ty);
    while (head < q.length && visited < budget) {
      var i = q[head++];
      visited++;
      if (i === goal) { best = goal; break; }
      var cx = i % w, cy = (i / w) | 0;
      var d = Math.abs(cx - tx) + Math.abs(cy - ty);
      if (d < bestD) { bestD = d; best = i; }
      var nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (var n = 0; n < 4; n++) {
        var nx = nb[n][0], ny = nb[n][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var j = ny * w + nx;
        if (prev[j] !== -1) continue;
        if (area.solid(nx, ny) && j !== goal) continue;
        prev[j] = i;
        q.push(j);
      }
    }
    if (prev[best] === -1) return [];
    var out = [], cur2 = best;
    while (cur2 !== start) {
      out.push({ x: cur2 % w, y: (cur2 / w) | 0 });
      cur2 = prev[cur2];
      if (out.length > 4000) break;
    }
    out.reverse();
    return out;
  }

  // ------------------------------------------------------------ schedules
  /* The game reads its schedule keys most-specific first. Same order here, so
   * a birthday or a rainy Tuesday beats the ordinary spring routine. */
  function scheduleFor(npc, sim) {
    var sched = npc.real && npc.real.sched;
    if (!sched) return null;
    var season = String(sim.season()).toLowerCase();
    var day = sim.day;
    var dowIdx = ((sim.dayIndex ? sim.dayIndex() : day) % 7);
    var dow = DOW[dowIdx % 7];
    var raining = sim.weather === 'rain' || sim.weather === 'storm';
    var keys = [
      season + '_' + day,
      String(day),
      raining ? 'rain' : null,
      season + '_' + dow,
      dow,
      season,
      'spring',
      'default'
    ];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!k || !sched[k]) continue;
      var block = sched[k];
      var guard = 0;
      while (block && block.goto && guard++ < 5) block = sched[block.goto];
      if (block && block.steps && block.steps.length) return block;
    }
    for (var any in sched) {
      var b = sched[any];
      if (b && b.steps && b.steps.length) return b;
    }
    return null;
  }

  /* Where this villager should be right now. Falls back to the tile the game's
   * own character file calls home, which is where they sleep. */
  function targetFor(npc, sim) {
    var home = npc.real && npc.real.home;
    var homeArea = (home && areaOf(home.m)) || npc.homeArea;
    var fallback = { area: homeArea, x: (home && home.x) || npc.hx,
                     y: (home && home.y) || npc.hy, d: 2 };
    var block = scheduleFor(npc, sim);
    if (!block) return fallback;
    var step = null;
    for (var i = 0; i < block.steps.length; i++) {
      if (sim.time >= toMin(block.steps[i].t)) step = block.steps[i];
    }
    /* Before the first entry of the day they are still asleep at home, and
     * after a 'bed' entry they have gone back to it. */
    if (!step || step.bed) return fallback;
    var ar = areaOf(step.m);
    if (!ar) return fallback;
    return { area: ar, x: step.x, y: step.y, d: step.d };
  }

  // ------------------------------------------------------------ shop hours
  /* A locked door in the real maps carries the hours behind it, as
   * "LockedDoorWarp tx ty Map 900 2100". Reuse them so the shops open and shut
   * the way they do in the original instead of standing open all night. */
  function doorOpen(door, minutes) {
    if (!door || door.open == null) return true;
    var open = toMin(door.open), close = toMin(door.close);
    if (close > open) return minutes >= open && minutes < close;
    return minutes >= open || minutes < close;   // spans midnight (the saloon)
  }

  /* Print an HHMM time from the game files the way a person says it. */
  function hhmm(v) {
    var h = Math.floor(v / 100), m = v % 100;
    var ap = h >= 12 && h < 24 ? 'chiều' : 'sáng';
    var hh = h % 12; if (!hh) hh = 12;
    if (h >= 24) { hh = (h - 24) || 12; ap = 'khuya'; }
    return hh + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  }

  // ------------------------------------------------------------ gift tastes
  /* Our item categories against the game's own gift-taste categories, so a
   * villager who "likes all vegetables" really does. */
  var CAT_MATCH = {
    Vegetable: ['crop'], Fruit: ['fruit'], Fish: ['fish'],
    Gem: ['mineral'], Minerals: ['mineral'], Flower: ['forage'],
    Forage: ['forage'], Cooking: ['cooked'], ArtisanGoods: ['artisan'],
    Seeds: ['seed'], Junk: ['junk'], MonsterLoot: ['monster'],
    Egg: ['artisan'], Milk: ['artisan'], AnimalProduce: ['artisan'],
    Metal: ['resource'], Crafting: ['crafted'], Ingredients: ['resource']
  };

  function tasteOf(name, itemName, itemCat) {
    var b = bundle();
    var v = b.npcs && b.npcs[name];
    var lower = String(itemName).toLowerCase();
    var tiers = ['love', 'like', 'dislike', 'hate', 'neutral'];
    function hit(src) {
      if (!src) return null;
      for (var i = 0; i < tiers.length; i++) {
        var list = src[tiers[i]] || [];
        for (var j = 0; j < list.length; j++) {
          if (String(list[j]).toLowerCase() === lower) return tiers[i];
        }
      }
      for (var k = 0; k < tiers.length; k++) {
        var cats = src[tiers[k] + 'Cat'] || [];
        for (var c = 0; c < cats.length; c++) {
          var ours = CAT_MATCH[cats[c]] || [];
          if (ours.indexOf(itemCat) >= 0) return tiers[k];
        }
      }
      return null;
    }
    // the person's own opinion first, the town-wide one only as a fallback
    return hit(v && v.taste) || hit(b.universal) || 'neutral';
  }

  // ------------------------------------------------------------ villagers
  function Villagers(game) {
    this.game = game;
    this.list = [];
    this.adj = buildGraph(game.world.areas);
    this.build();
  }

  Villagers.prototype.build = function () {
    var game = this.game, b = bundle();
    var byName = {};
    (game.data.villagers || []).forEach(function (v) { byName[v.name] = v; });
    this.list = [];
    var self = this;
    Object.keys(b.npcs || {}).forEach(function (name) {
      var real = b.npcs[name];
      // people the player can meet: they must live somewhere this build has
      if (!real.home || !areaOf(real.home.m)) return;
      if (!real.social && !real.sched) return;
      var area = areaOf(real.home.m);
      var ar = game.world.areas[area];
      if (!ar) return;
      var spot = ar.nearestFree(real.home.x | 0, real.home.y | 0, 12);
      var wiki = byName[name] || { name: name };
      /* The wiki entry brings the dialogue lines and the marriage flag the
       * rest of the game already reads; the game's own file overrules it on
       * every fact both of them have. */
      wiki.birthday = real.birthday || wiki.birthday;
      wiki.marriable = real.romance;
      if (real.taste) wiki.gifts = real.taste;
      self.list.push({
        name: name,
        data: wiki,
        real: real,
        area: area, x: spot.x, y: spot.y,
        homeArea: area, hx: spot.x, hy: spot.y,
        tx: spot.x, ty: spot.y,
        face: 'down', frame: 0, animT: 0,
        path: null, pathI: 0, want: null,
        sprite: personSprite(real)
      });
    });
    return this.list;
  };

  function personSprite(real) {
    var p = (real && real.pal) || {};
    return S.person(p.hair || '#7a4a2b', p.shirt || '#3f6fb5',
                    p.hair2 || '#4e2f1c', p.shirt2 || '#28497d',
                    { skin: p.skin, pants: p.pants, shoes: p.shoes });
  }

  Villagers.prototype.update = function (dt) {
    var game = this.game, sim = game.sim;
    var here = game.world.current;
    var self = this;
    /* The schedule only changes when the clock does, and the clock moves once
     * every seven real seconds - so resolving it per villager per frame was
     * about two thousand string comparisons a second for nothing. */
    var clock = sim.time;
    this.list.forEach(function (n) {
      if (n._schedAt !== clock) { n._schedAt = clock; n._want = targetFor(n, sim); }
      var want = n._want;
      if (!want.area || !game.world.areas[want.area]) return;

      /* Rule 1: nobody the player cannot see needs to walk anywhere. Snapping
       * them costs one assignment instead of a path search, and the player
       * finds them exactly where the schedule says when they arrive. */
      if (n.area !== here && want.area !== here) {
        var far = game.world.areas[want.area].nearestFree(want.x, want.y, 10);
        n.area = want.area; n.x = far.x; n.y = far.y;
        n.face = FACE[want.d] || 'down';
        n.path = null; n.want = null;
        return;
      }
      /* Walking in from off-screen: put them ON the door the player would
       * have seen them come through, not on the tile they are heading for.
       *
       * WHY: landing them at the destination is invisible teleporting - the
       * owner's read of the town was "npc không thấy đi chuyển", and this was
       * half the reason. Villagers now appear at the doorway and walk the rest
       * of the way in front of you. */
      if (n.area !== here && want.area === here) {
        var back = firstHop(self.adj, here, n.area);
        var into = null;
        if (back && back.warp) {
          into = game.world.areas[here].nearestFree(back.warp.x, back.warp.y, 8);
        }
        if (!into) into = game.world.areas[here].nearestFree(want.x, want.y, 12);
        n.area = here; n.x = into.x; n.y = into.y;
        n.path = null; n.want = null;
      }

      var area = game.world.areas[n.area];
      var goalX = want.x, goalY = want.y, hopWarp = null;
      if (want.area !== n.area) {
        var hop = firstHop(self.adj, n.area, want.area);
        if (!hop) {
          // no route we know: hold position rather than teleport across town
          n.path = null;
          return;
        }
        hopWarp = hop.warp;
        goalX = hopWarp.x; goalY = hopWarp.y;
      }

      var key = n.area + ':' + goalX + ',' + goalY;
      if (n.want !== key) {
        n.want = key;
        var free = area.nearestFree(goalX, goalY, 6);
        n.path = findPath(area, Math.round(n.x), Math.round(n.y), free.x, free.y);
        n.pathI = 0;
        n.goal = { x: free.x, y: free.y };
      }

      if (n.path && n.pathI < n.path.length) {
        var step = n.path[n.pathI];
        var dx = (step.x + 0.5) - (n.x + 0.5), dy = (step.y + 0.5) - (n.y + 0.5);
        var d = Math.hypot(dx, dy);
        if (d < 0.08) {
          n.x = step.x; n.y = step.y;
          n.pathI++;
        } else {
          var sp = 2.2 * dt;
          n.x += dx / d * Math.min(sp, d);
          n.y += dy / d * Math.min(sp, d);
          n.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                               : (dy > 0 ? 'down' : 'up');
          n.animT += dt;
          if (n.animT > 0.2) { n.animT = 0; n.frame ^= 1; }
        }
      } else {
        n.frame = 0;
        if (hopWarp && Math.abs(n.x - hopWarp.x) < 1.2
            && Math.abs(n.y - hopWarp.y) < 1.2) {
          // arrived at the door: go through it
          var dest = game.world.areas[hopWarp.to];
          if (dest) {
            var land = dest.nearestFree(hopWarp.tx, hopWarp.ty, 10);
            n.area = hopWarp.to; n.x = land.x; n.y = land.y;
            n.path = null; n.want = null;
          }
        } else if (want.area === n.area) {
          n.face = FACE[want.d] || n.face;
        }
      }
    });
  };

  Villagers.prototype.here = function () {
    var cur = this.game.world.current;
    return this.list.filter(function (n) { return n.area === cur; });
  };

  /* Teach the simulation the real gift table.
   *
   * sim.js matched an item name against five flat lists scraped from the wiki.
   * The game's own table also addresses whole CATEGORIES ("Abigail dislikes all
   * eggs") and has a town-wide default for everything nobody named, which is
   * why so many presents used to come back "bình thường". Both are honoured
   * here, and the person's own opinion still beats the town's. */
  if (global.SDV_SIM && global.SDV_SIM.Sim) {
    global.SDV_SIM.Sim.prototype.giftTaste = function (villager, item) {
      var info = this.itemInfo ? this.itemInfo(item) : null;
      return tasteOf(villager, item, info && info.cat);
    };
  }

  global.SDV_NPC = {
    Villagers: Villagers, areaOf: areaOf, doorOpen: doorOpen, hhmm: hhmm,
    tasteOf: tasteOf, findPath: findPath, scheduleFor: scheduleFor, toMin: toMin,
    targetFor: targetFor, personSprite: personSprite
  };
})(window);
