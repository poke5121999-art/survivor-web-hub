/*
 * mine.js - the 120 floors under the mountain, Skull Cavern below the desert,
 * the volcano on the island, and the combat that happens in all three.
 *
 * Rules taken from the wiki and recorded in docs/proposals/stardew-web.md:
 *  - a ladder must be REVEALED to descend: break rocks or kill monsters.
 *  - a floor can be "infested": every monster must die before a ladder appears.
 *  - the lift remembers every 5th floor.
 *  - monster stats (hp / damage / defence / speed / xp) and drop tables are the
 *    extracted ones, not invented: see data/gamedata.js -> monsters.
 *  - floors 1-39 stone, 41-79 frozen, 81-119 lava; every 40 the theme changes.
 */
(function (global) {
  'use strict';

  var W = global.SDV_WORLD, S = global.SDV_SPRITES;

  var THEMES = [
    { from: 1,  to: 39,  floor: 'stone',    wall: 'rock',
      ore: ['Copper Ore', 'Stone', 'Coal'], name: 'Tầng đá' },
    { from: 40, to: 79,  floor: 'ice',      wall: 'darkrock',
      ore: ['Iron Ore', 'Stone', 'Coal', 'Frozen Tear'], name: 'Tầng băng' },
    /* WHY not darkrock: that tile is declared solid, so carving the rooms out
     * of it produced floors with ZERO walkable tiles - 41 of the 120 floors and
     * the whole volcano spawned the player sealed in rock. */
    { from: 80, to: 120, floor: 'sand', wall: 'darkrock',
      ore: ['Gold Ore', 'Fire Quartz', 'Coal', 'Stone'], name: 'Tầng dung nham' }
  ];

  function themeFor(depth) {
    for (var i = 0; i < THEMES.length; i++) {
      if (depth >= THEMES[i].from && depth <= THEMES[i].to) return THEMES[i];
    }
    return THEMES[2];
  }

  /* Which monsters can appear this deep. The wiki gives each monster a floor
   * band as text ("71-79", "All"); parse it once and cache. */
  function parseBand(txt) {
    if (!txt) return null;
    if (/all/i.test(txt)) return [1, 120];
    var m = String(txt).match(/(\d+)\s*-\s*(\d+)/);
    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
    var one = String(txt).match(/(\d+)/);
    if (one) return [parseInt(one[1], 10), parseInt(one[1], 10)];
    return null;
  }

  function Mine(game) {
    this.game = game;
    this.depth = 0;
    this.kind = 'mine';                 // mine | skull | volcano
    this.monsters = [];
    this.projectiles = [];
    this.cache = {};
    var self = this;
    this.pool = (game.data.monsters || []).map(function (m) {
      return { def: m, band: parseBand(m.floors) };
    });
  }

  Mine.prototype.candidates = function (depth) {
    var kind = this.kind;
    var list = this.pool.filter(function (p) {
      var inSkull = /skull/i.test(p.def.spawnsIn || '');
      var inVolcano = /volcano/i.test(p.def.spawnsIn || '');
      var inMine = /mines/i.test(p.def.spawnsIn || '');
      if (kind === 'skull') return inSkull;
      if (kind === 'volcano') return inVolcano;
      if (!inMine) return false;
      return !p.band || (depth >= p.band[0] - 6 && depth <= p.band[1] + 6);
    });
    /* WHY: the wiki's floor bands leave gaps, and a floor that spawns nothing
     * turns a "dangerous descent" into an empty corridor. Anything that lives
     * in the mines at all is a better answer than silence. */
    if (!list.length) {
      list = this.pool.filter(function (p) { return /mines/i.test(p.def.spawnsIn || ''); });
    }
    if (!list.length) list = this.pool;      // last resort: never an empty floor
    return list;
  };

  /* Build one floor: a cave carved out of solid rock, with rocks to break,
   * monsters, and a hidden ladder that only appears once something is broken. */
  Mine.prototype.generate = function (depth) {
    var seed = (this.kind === 'skull' ? 900000 : this.kind === 'volcano' ? 700000 : 0)
             + depth * 7919 + (this.game.sim.dayIndex() * 13);
    var rng = W.mulberry32(seed);
    var th = this.kind === 'skull'
      ? { floor: 'sand', wall: 'darkrock', ore: ['Iridium Ore', 'Gold Ore', 'Coal'] }
      : this.kind === 'volcano'
        ? { floor: 'stone', wall: 'darkrock', ore: ['Gold Ore', 'Iridium Ore'] }
        : themeFor(depth);
    var w = 22 + Math.floor(rng() * 10), h = 20 + Math.floor(rng() * 8);
    var name = (this.kind === 'skull' ? 'Hang Sọ' :
                this.kind === 'volcano' ? 'Núi lửa' : 'Hầm mỏ') + ' - tầng ' + depth;
    var a = new W.Area(this.kind, name, w, h, th.wall, { indoor: true });

    // carve rooms and join them, so the floor is always connected
    var rooms = [];
    var n = 4 + Math.floor(rng() * 4);
    for (var i = 0; i < n; i++) {
      var rw = 5 + Math.floor(rng() * 7), rh = 4 + Math.floor(rng() * 6);
      var rx = 2 + Math.floor(rng() * (w - rw - 4));
      var ry = 2 + Math.floor(rng() * (h - rh - 4));
      a.rect(rx, ry, rw, rh, th.floor);
      rooms.push({ x: rx + (rw >> 1), y: ry + (rh >> 1) });
    }
    for (var j = 1; j < rooms.length; j++) {
      var p = rooms[j - 1], q = rooms[j];
      a.hpath(p.x, q.x, p.y, th.floor, 2);
      a.vpath(q.x, p.y, q.y, th.floor, 2);
    }
    var start = rooms[0];
    /* An actual exit. The up-marker used to carry `to: null`, which checkWarp
     * skips, so once you were underground the only ways out were dying or
     * collapsing at 2am. */
    var back = this.kind === 'skull' ? 'skullentry'
             : this.kind === 'volcano' ? 'islandnorth' : 'mineentry';
    var backAt = this.kind === 'skull' ? [9, 8]
               : this.kind === 'volcano' ? [30, 22] : [17, 10];
    a.objs.push({ x: start.x, y: start.y, kind: 'mineExit', to: back,
                  tx: backAt[0], ty: backAt[1], depth: depth });

    // ore and stone to break
    var oreCount = 8 + Math.floor(rng() * 10) + Math.floor(depth / 20);
    for (var k = 0; k < oreCount * 3; k++) {
      var x = 1 + Math.floor(rng() * (w - 2)), y = 1 + Math.floor(rng() * (h - 2));
      if (a.name_of(x, y) !== th.floor) continue;
      if (Math.abs(x - start.x) < 2 && Math.abs(y - start.y) < 2) continue;
      if (a.objs.some(function (o) { return o.x === x && o.y === y; })) continue;
      var isOre = rng() < 0.42;
      a.obj({ x: x, y: y, kind: isOre ? 'oreRock' : 'rock',
              ore: isOre ? th.ore[Math.floor(rng() * th.ore.length)] : 'Stone' });
      if (a.objs.length > oreCount + 8) break;
    }
    // the ladder is hidden until something is broken or killed
    a.ladder = null;
    a.infested = depth > 4 && rng() < 0.12;
    a.theme = th;
    a.depth = depth;
    a.mineKind = this.kind;
    return { area: a, rooms: rooms, rng: rng };
  };

  Mine.prototype.enter = function (depth, kind) {
    var g = this.game;
    this.kind = kind || this.kind;
    this.depth = depth;
    var built = this.generate(depth);
    var a = built.area;
    g.world.areas[this.kind] = a;
    g.world.current = this.kind;
    var start = built.rooms[0];
    g.player.x = start.x + 0.5;
    g.player.y = start.y + 0.5;

    // populate monsters
    this.monsters = [];
    var cands = this.candidates(depth);
    var count = a.infested ? 6 + Math.floor(built.rng() * 5)
                           : Math.min(8, 1 + Math.floor(depth / 8) + Math.floor(built.rng() * 3));
    if (depth === 0) count = 0;
    for (var i = 0; i < count && cands.length; i++) {
      var pick = cands[Math.floor(built.rng() * cands.length)].def;
      var r = built.rooms[1 + Math.floor(built.rng() * Math.max(1, built.rooms.length - 1))];
      this.monsters.push(this.spawn(pick, r.x + (built.rng() * 4 - 2),
                                          r.y + (built.rng() * 4 - 2)));
    }
    /* Skull Cavern used to write the MINE's lift progress, so the lift offered
     * floors of the mine that had never been visited. */
    if (this.kind === 'mine') {
      if (depth > g.sim.deepestMine) g.sim.deepestMine = depth;
    } else {
      g.sim.deepestByKind = g.sim.deepestByKind || {};
      var d0 = g.sim.deepestByKind[this.kind] || 0;
      if (depth > d0) g.sim.deepestByKind[this.kind] = depth;
    }
    g.sim.mineDepth = depth;
    g.toast(a.name + (a.infested ? ' — quái tràn!' : ''));
    return a;
  };

  Mine.prototype.spawn = function (def, x, y, depth) {
    var hue = S.hash(def.name) % 360;
    // Monsters the wiki lists as "Varies" grow with the floor, like the original
    var k = def.scales ? 1 + (depth || this.depth || 1) / 45 : 1;
    var hp = Math.round(def.hp * k), dmg = Math.round(def.dmg * k);
    return {
      def: def, name: def.name,
      x: x, y: y, hp: hp, maxHp: hp,
      dmg: dmg, defense: def['def'] || 0,
      speed: (def.speed || 2) * 0.55,
      xp: def.xp || 1,
      hurt: 0, dead: false,
      color: 'hsl(' + hue + ',55%,42%)',
      color2: 'hsl(' + hue + ',55%,26%)'
    };
  };

  Mine.prototype.leave = function () {
    var g = this.game;
    this.monsters = [];
    this.depth = 0;
    g.sim.mineDepth = 0;
    // back to the entrance ROOM, which is where the lift is in the original
    var back = this.kind === 'skull' ? 'skullentry'
             : this.kind === 'volcano' ? 'islandnorth' : 'mineentry';
    var at = this.kind === 'skull' ? [9, 8]
           : this.kind === 'volcano' ? [30, 22] : [17, 10];
    g.world.current = back;
    /* WHY nearestFree rather than the raw coordinate: these three landing spots
     * were written by hand against maps that have since moved, and two of them
     * are now inside a wall - (9,8) of the Skull Cavern entrance is solid stone
     * with only one free neighbour diagonally, so climbing out of Skull Cavern
     * (or dying in it) sealed the player inside rock with no direction left to
     * walk and no way out short of reloading the page. Land on the nearest tile
     * that can actually be stood on. */
    var dest = g.world.areas[back];
    var spot = dest ? dest.nearestFree(at[0], at[1], 12) : { x: at[0], y: at[1] };
    g.player.x = spot.x + 0.5; g.player.y = spot.y + 0.5;
    /* WHY the arrival is marked as coming from the cave: the island's volcano
     * door is a real warp tile, and the spot you climb out onto is that very
     * tile - so the first step in any direction dragged the player straight
     * back inside, over and over, and the volcano could not be left at all.
     * This is the same guard the ordinary doors use: a warp leading back where
     * you just came from stays inert until you have walked off its band. */
    g.cameFrom = this.kind;
  };

  /* Called whenever a rock is broken or a monster dies - that is when the
   * ladder is allowed to show up. */
  Mine.prototype.maybeDropLadder = function (x, y, fromKill) {
    var a = this.game.world.area();
    if (!a.depth || a.ladder) return;
    if (a.infested && this.monsters.some(function (m) { return !m.dead; })) return;
    var chance = fromKill ? 0.14 : 0.09;
    if (a.infested) chance = 1;
    /* WHY luck now scales instead of subtracting: raw addition of a [-0.1,0.1]
     * value made the rock roll a strict impossibility on unlucky days - 67% of
     * floors ended with no ladder at all, and there was no other way out. */
    var luck = this.game.sim.luck || 0;
    chance = Math.max(0.03, chance * (1 + luck * 5));
    a.breaks = (a.breaks || 0) + 1;
    // and a floor always gives in eventually, however bad the day
    if (a.breaks >= 12) chance = 1;
    /* WHY the last-chance clause: the 12-break guarantee assumes a floor HAS
     * twelve things to break. A small floor carries as few as nine rocks and
     * monsters put together, so on an unlucky day (luck scales the roll down to
     * about 5%) it ran out of rocks with no ladder at all - measured at 34% of
     * floors - and the only way on was to climb all the way out and walk back
     * down. When nothing breakable and nothing alive is left, the floor has no
     * roll of the dice remaining, so it must hand over the ladder now. */
    if (chance < 1) {
      var alive = this.monsters.some(function (m) { return !m.dead; });
      var rocksLeft = 0;
      for (var i = 0; i < a.objs.length; i++) {
        var o = a.objs[i];
        if (o.kind === 'rock' || o.kind === 'oreRock') rocksLeft++;
      }
      if (!alive && rocksLeft <= 1) chance = 1;
    }
    if (Math.random() < chance) {
      a.ladder = { x: x, y: y };
      a.objs.push({ x: x, y: y, kind: 'ladder' });
      this.game.toast('Có thang xuống tầng dưới!');
    }
  };

  Mine.prototype.descend = function () {
    var a = this.game.world.area();
    var next = (a.depth || 0) + 1;
    // the mine bottoms out at 120; Skull Cavern and the volcano do not
    if (this.kind === 'mine' && next > 120) {
      return this.game.toast('Đây là đáy hầm mỏ rồi');
    }
    this.enter(next, this.kind);
  };

  // ------------------------------------------------------------------ combat
  Mine.prototype.playerAttack = function () {
    var g = this.game, p = g.player;
    var reach = 1.7;
    var hit = 0;
    var dmg = this.weaponDamage();
    for (var i = 0; i < this.monsters.length; i++) {
      var m = this.monsters[i];
      if (m.dead) continue;
      var dx = m.x - p.x, dy = m.y - p.y;
      if (Math.hypot(dx, dy) > reach) continue;
      // must be roughly in front - a swing is directional
      var fx = p.face === 'left' ? -1 : p.face === 'right' ? 1 : 0;
      var fy = p.face === 'up' ? -1 : p.face === 'down' ? 1 : 0;
      if (dx * fx + dy * fy < -0.2) continue;
      var real = Math.max(1, dmg - m.defense);
      m.hp -= real;
      m.hurt = 0.25;
      m.x += fx * 0.35; m.y += fy * 0.35;
      hit++;
      g.spark(Math.floor(m.x), Math.floor(m.y));
      if (m.hp <= 0) this.kill(m);
    }
    return hit;
  };

  Mine.prototype.weaponDamage = function () {
    var s = this.game.sim;
    var base = s.weapon ? s.weapon.dmg : 4;
    return base + s.skills.combat;
  };

  Mine.prototype.kill = function (m) {
    var g = this.game, s = g.sim;
    m.dead = true;
    // WHY: this call was missing entirely, so every slay quest was impossible
    // and about a third of the help-wanted board could never be completed.
    if (g.events && g.events.onMonsterKilled) g.events.onMonsterKilled(m.name);
    var lvl = s.addXp('combat', m.xp);
    if (lvl) g.toast('Chiến đấu lên cấp ' + lvl + '!');
    (m.def.drops || []).forEach(function (d) {
      var pct = parseFloat(String(d.chance).replace(/[^\d.]/g, '')) || 0;
      if (!pct || Math.random() * 100 > pct) return;
      var name = d.item;
      if (!s.itemInfo(name)) return;
      g.world.area().objs.push({
        x: Math.floor(m.x), y: Math.floor(m.y), kind: 'dropped',
        item: { name: name, qty: 1, quality: 0 }
      });
    });
    this.maybeDropLadder(Math.floor(m.x), Math.floor(m.y), true);
  };

  Mine.prototype.update = function (dt) {
    var g = this.game, p = g.player, s = g.sim;
    var a = g.world.area();
    if (!a.depth) return;
    /* WHY the snapshot: playerDies() empties this.monsters mid-loop, and the
     * next iteration then read off the end of the NEW array and threw. The
     * throw escaped requestAnimationFrame and killed the game for good. */
    var list = this.monsters.slice();
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (!m) continue;
      if (m.dead) {
        var at = this.monsters.indexOf(m);
        if (at >= 0) this.monsters.splice(at, 1);
        continue;
      }
      if (this.dying) return;          // the run already ended this frame
      if (m.hurt > 0) m.hurt -= dt;
      var dx = p.x - m.x, dy = p.y - m.y;
      var d = Math.hypot(dx, dy);
      if (d < 9 && d > 0.05) {
        var step = m.speed * dt;
        var nx = m.x + dx / d * step, ny = m.y + dy / d * step;
        if (!g.world.solidAt(Math.floor(nx), Math.floor(m.y))) m.x = nx;
        if (!g.world.solidAt(Math.floor(m.x), Math.floor(ny))) m.y = ny;
      }
      if (d < 0.85 && s.invuln <= 0) {
        var taken = Math.max(1, m.dmg - (s.armor || 0));
        s.health -= taken;
        s.invuln = 0.9;
        g.toast('-' + taken + ' máu');
        // knock the player back so a hit is survivable
        p.x -= dx / (d || 1) * 0.6; p.y -= dy / (d || 1) * 0.6;
        if (s.health <= 0) this.playerDies();
      }
    }
    if (s.invuln > 0) s.invuln -= dt;
  };

  Mine.prototype.playerDies = function () {
    if (this.dying) return;
    this.dying = true;
    var g = this.game, s = g.sim;
    var lost = Math.min(s.gold, Math.floor(s.gold * 0.15) + 100);
    s.gold -= lost;
    // items are not lost - losing a run's haul on a phone is a rage-quit, and
    // the brief's whole thrust is fewer punishments per tap.
    s.health = Math.max(1, Math.floor(s.maxHealth * 0.4));
    s.energy = Math.max(10, Math.floor(s.maxEnergy * 0.2));
    this.monsters = [];
    this.leave();
    this.dying = false;
    g.toast('Bạn gục trong hầm mỏ. Mất ' + lost + 'g.');
  };

  // ------------------------------------------------------------------ render
  Mine.prototype.draw = function (ctx, camX, camY, ts) {
    for (var i = 0; i < this.monsters.length; i++) {
      var m = this.monsters[i];
      if (m.dead) continue;
      var sx = Math.round(m.x * ts - camX), sy = Math.round(m.y * ts - camY);
      var r = ts * 0.34;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + ts * 0.3, r, r * 0.4, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = m.hurt > 0 ? '#ffffff' : m.color;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.3); ctx.fill();
      ctx.fillStyle = m.color2;
      ctx.fillRect(sx - r * 0.45, sy - r * 0.25, r * 0.28, r * 0.28);
      ctx.fillRect(sx + r * 0.17, sy - r * 0.25, r * 0.28, r * 0.28);
      // health pip
      var w = ts * 0.7, hp = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx - w / 2, sy - r - 8, w, 4);
      ctx.fillStyle = '#e8635b';
      ctx.fillRect(sx - w / 2, sy - r - 8, w * hp, 4);
    }
  };

  global.SDV_MINE = { Mine: Mine, THEMES: THEMES, themeFor: themeFor };
})(window);
