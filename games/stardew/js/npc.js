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
  /* Spring 1 is a MONDAY in Stardew, and this simulation agrees - its own
   * clock prints T2 for day 1. The first version of this array started at
   * Sunday, so every villager spent the year running the wrong day's
   * schedule: Sunday routines on Monday, and several of them stay indoors on
   * a Sunday, which is a large part of why the town looked asleep. */
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    var dow = DOW[((day - 1) % 7 + 7) % 7];
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
    var step = null, nextAt = null;
    for (var i = 0; i < block.steps.length; i++) {
      var at = toMin(block.steps[i].t);
      if (sim.time >= at) step = block.steps[i];
      else if (nextAt == null) nextAt = at;
    }
    /* Before the first entry of the day they are still asleep at home, and
     * after a 'bed' entry they have gone back to it. */
    fallback.nextAt = nextAt;
    if (!step || step.bed) return fallback;
    var ar = areaOf(step.m);
    if (!ar) return fallback;
    return { area: ar, x: step.x, y: step.y, d: step.d, nextAt: nextAt };
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

  var WALK = 2.2;                  // tiles per second, villager and player alike

  /* Wandering while they wait.
   *
   * WHY it exists: the schedule parks somebody on a tile at 13:00 and does not
   * move them again until 16:00, so a villager stood dead still for three
   * hours of game time. The original does not do that - people drift about the
   * square, stand at the pier, stop and look at things. This picks a tile a
   * few steps from where the schedule put them, walks there, waits, and picks
   * another, always coming back within a short radius so they never leave the
   * scene the schedule sent them to. */
  function loiterSpot(area, cx, cy, seed) {
    var r = 2 + (seed % 3);
    for (var tries = 0; tries < 8; tries++) {
      var a = ((seed * 2654435761 + tries * 40503) % 360) * Math.PI / 180;
      var nx = Math.round(cx + Math.cos(a) * r);
      var ny = Math.round(cy + Math.sin(a) * r);
      if (nx < 1 || ny < 1 || nx >= area.w - 1 || ny >= area.h - 1) continue;
      if (area.solid(nx, ny)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  /* Is this villager standing at the water's edge? Used only to decide whether
   * to draw a fishing rod, which is what somebody standing on the pier for
   * three hours is obviously doing. */
  function atWater(area, x, y) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var t = area.name_of(Math.round(x) + dx, Math.round(y) + dy);
        if (t === 'water' || t === 'deep') return true;
      }
    }
    return false;
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
      if (n._schedAt !== clock) {
        n._schedAt = clock;
        var next = targetFor(n, sim);
        var moved = !n._want || n._want.area !== next.area
                    || n._want.x !== next.x || n._want.y !== next.y;
        n._want = next;
        if (moved) { n.loiter = null; n.loiterAt = 0; n.want = null; n.path = null; }
      }
      var want = n._want;
      if (!want || !want.area || !game.world.areas[want.area]) return;

      var visible = (n.area === here);
      var area = game.world.areas[n.area];

      /* Where they are trying to get to right now: the schedule's tile, the
       * door on the way to it, or the little detour they are taking while they
       * wait for the next entry. */
      var goalX = want.x, goalY = want.y, hopWarp = null;
      if (want.area !== n.area) {
        var hop = firstHop(self.adj, n.area, want.area);
        if (!hop) { n.path = null; return; }
        hopWarp = hop.warp;
        goalX = hopWarp.x; goalY = hopWarp.y;
        n.travellingTo = want.area;
      } else {
        n.travellingTo = null;
        if (n.loiter) { goalX = n.loiter.x; goalY = n.loiter.y; }
      }

      /* WHY everybody walks, not only the people on screen: snapping the rest
       * straight to their destination meant the player never once saw anybody
       * set off or arrive - walk into town at any hour and the whole cast was
       * already parked. The owner's read was exactly that: "đến giờ thì cũng
       * phải di chuyển chứ, ví dụ đi dạo, câu cá, về nhà".
       *
       * Off screen it is a straight line with no collision and no path search,
       * which costs two multiplications a villager a frame. On screen it is a
       * real path around the furniture. Same speed either way, so a journey
       * takes the same amount of the day whether or not it is being watched,
       * and walking into a street can catch somebody halfway down it. */
      if (!visible) {
        /* A clock that jumps - a new day, a festival, a test driving the
         * simulation forward - is not a walk. Put everyone where the schedule
         * says and start again from there, the way the original places its
         * cast at the start of a day. */
        if (n._clock == null || Math.abs(clock - n._clock) > 30) {
          var jump = game.world.areas[want.area].nearestFree(want.x, want.y, 10);
          n.area = want.area; n.x = jump.x; n.y = jump.y;
          n.face = FACE[want.d] || 'down';
          n._clock = clock; n.path = null; n.want = null; n.moving = false;
          return;
        }
        n._clock = clock;
        var free0 = area.nearestFree(goalX, goalY, 6);
        var tx = free0.x, ty = free0.y;
        var ddx = tx - n.x, ddy = ty - n.y;
        var dd = Math.hypot(ddx, ddy);
        if (dd > 0.1) {
          var st = WALK * dt;
          n.x += ddx / dd * Math.min(st, dd);
          n.y += ddy / dd * Math.min(st, dd);
          n.face = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'right' : 'left')
                                                 : (ddy > 0 ? 'down' : 'up');
          n.moving = true;
        } else {
          /* Standing still off screen is the one case where walking through
           * walls would be visible later: a villager parked inside a wall is
           * found there the moment the player arrives. Travelling through one
           * for a few seconds unseen costs nothing. */
          var rest = area.nearestFree(Math.round(n.x), Math.round(n.y), 6);
          n.x = rest.x; n.y = rest.y;
          n.moving = false;
          self.arrive(n, want, hopWarp, area, sim);
        }
        n.path = null; n.want = null;
        return;
      }
      n._clock = clock;

      /* Just came into view: the straight line may have left them a step
       * inside a wall, so put them on the nearest tile they could stand on
       * before asking for a path. */
      if (!n._wasVisible) {
        var okTile = area.nearestFree(Math.round(n.x), Math.round(n.y), 6);
        n.x = okTile.x; n.y = okTile.y;
        n.want = null; n.path = null;
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
          var sp = WALK * dt;
          n.x += dx / d * Math.min(sp, d);
          n.y += dy / d * Math.min(sp, d);
          n.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                               : (dy > 0 ? 'down' : 'up');
          n.animT += dt;
          if (n.animT > 0.2) { n.animT = 0; n.frame ^= 1; }
        }
        n.moving = true;
      } else {
        n.frame = 0;
        n.moving = false;
        self.arrive(n, want, hopWarp, area, sim);
      }
    });

    // remember who was on screen, so next frame knows who has just walked in
    var cur = game.world.current;
    this.list.forEach(function (n) { n._wasVisible = (n.area === cur); });
  };

  /* What happens when a villager runs out of path: step through the door they
   * were heading for, face the way the schedule says, or start a stroll. */
  Villagers.prototype.arrive = function (n, want, hopWarp, area, sim) {
    var game = this.game;
    if (hopWarp && Math.abs(n.x - hopWarp.x) < 1.4
        && Math.abs(n.y - hopWarp.y) < 1.4) {
      var dest = game.world.areas[hopWarp.to];
      if (dest) {
        var land = dest.nearestFree(hopWarp.tx, hopWarp.ty, 10);
        n.area = hopWarp.to; n.x = land.x; n.y = land.y;
        n.path = null; n.want = null; n._wasVisible = false;
      }
      return;
    }
    if (want.area !== n.area) return;

    if (n.loiter) {
      // reached the end of a stroll: stand a moment before the next one
      n.loiter = null;
      n.loiterAt = sim.time + 20 + (S.hash(n.name) % 30);
      n.face = FACE[want.d] || n.face;
      return;
    }
    n.face = FACE[want.d] || n.face;
    /* Only stroll when there is time to kill and somewhere to do it. Indoors
     * they mill about their own room; the radius is small either way so they
     * stay where the schedule put them. */
    // no time for a stroll if the next entry is minutes away
    var nextAt = want.nextAt == null ? sim.time + 999 : want.nextAt;
    if (nextAt - sim.time < 40) return;
    if (sim.time < (n.loiterAt || 0)) return;
    var spot = loiterSpot(area, want.x, want.y,
                          S.hash(n.name) + Math.floor(sim.time / 10));
    if (spot) { n.loiter = spot; n.want = null; n.path = null; }
    n.loiterAt = sim.time + 30;
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
    atWater: atWater, WALK: WALK,
    targetFor: targetFor, personSprite: personSprite
  };
})(window);
