/*
 * mine.js - the hole in Đảo Mỏ, and the hundred floors under it.
 *
 * The one place in the game that is not the sea. A floor is generated on
 * entry, held while you are on it, and thrown away when you leave - a hundred
 * procedural caves is not something to keep resident, and nothing on a floor
 * belongs to the player.
 *
 * What the mine is FOR, in a game about farming: it is the only source of ore,
 * and ore is the only way to upgrade a tool or craft a sprinkler. So the loop
 * is farm -> gold -> nothing, until you dig; and dig -> ore -> better tools ->
 * farm faster. Without it the tool upgrade bench on Đảo Thợ Rèn has nothing to
 * sell and the sprinklers on the workbench cannot be made.
 *
 * Depth decides everything: which ore is in the rock, how hard the monsters
 * hit, and how likely a gem is. Every fifth floor is an elevator stop, so a
 * player who reached 45 does not start at 1 tomorrow.
 */
(function (global) {
  'use strict';

  var W = global.SDV_WORLD;
  var UI = global.ISL_UI;
  var A = global.ISL_ATLAS;

  function el(t, c, x) { return UI.el(t, c, x); }
  function btn(l, f, c) { return UI.btn(l, f, c); }

  /* Which ore a rock on this floor holds. The bands overlap on purpose - a
   * floor 55 rock can be iron or gold, and that variance is what makes going
   * one floor deeper feel like it might pay. */
  function oreFor(depth, rng) {
    var r = rng();
    if (depth >= 90) {
      if (r < 0.18) return 'Iridium Ore';
      if (r < 0.55) return 'Gold Ore';
      return 'Iron Ore';
    }
    if (depth >= 50) {
      if (r < 0.30) return 'Gold Ore';
      if (r < 0.75) return 'Iron Ore';
      return 'Copper Ore';
    }
    if (depth >= 20) {
      if (r < 0.40) return 'Iron Ore';
      return 'Copper Ore';
    }
    if (r < 0.15) return 'Iron Ore';
    return 'Copper Ore';
  }

  var GEMS = ['Quartz', 'Earth Crystal', 'Amethyst', 'Topaz', 'Jade',
              'Aquamarine', 'Emerald', 'Ruby', 'Diamond'];
  function gemFor(depth, rng) {
    var tier = Math.min(GEMS.length - 1, 1 + Math.floor(depth / 14));
    return GEMS[Math.floor(rng() * (tier + 1))];
  }

  /* Monster art is what the atlas has - a slime, a skeleton, a golem. They are
   * cosmetic; the numbers come from the depth. */
  var FOES = [
    { art: 'SlimeKing_0', name: 'Slime', hp: 22, dmg: 6, from: 1 },
    { art: 'Skull__2', name: 'Sọ Bay', hp: 34, dmg: 10, from: 20 },
    { art: 'IceGolem_0', name: 'Golem Băng', hp: 60, dmg: 16, from: 45 },
    { art: 'Golem_Idle_0', name: 'Golem Đá', hp: 95, dmg: 24, from: 70 }
  ];

  function buildFloor(game, depth) {
    var a = W.mineFloor(depth);
    var rng = W.mulberry32(90210 + depth * 7919 + 13);

    /* The floor comes back as a cave of `stone` inside `darkrock`; everything
     * below is placed onto the walkable part of it. */
    var free = [];
    for (var y = 1; y < a.h - 1; y++) {
      for (var x = 1; x < a.w - 1; x++) {
        if (a.name_of(x, y) === 'stone') free.push([x, y]);
      }
    }
    if (!free.length) return a;
    function take() {
      var i = Math.floor(rng() * free.length);
      return free.splice(i, 1)[0];
    }

    var rocks = 14 + Math.floor(rng() * 10);
    for (var i = 0; i < rocks && free.length; i++) {
      var p = take();
      var isOre = rng() < 0.55;
      var o = { x: p[0], y: p[1], kind: isOre ? 'oreRock' : 'rock',
                art: isOre ? 'Rock_' + (1 + Math.floor(rng() * 3)) : 'Rock_0',
                hp: isOre ? 3 : 2, gen: 1 };
      if (isOre) o.ore = oreFor(depth, rng);
      if (!isOre && rng() < 0.12) o.gem = gemFor(depth, rng);
      a.obj(o);
      a.block(o.x, o.y, true);
    }

    var foeCount = Math.min(6, 1 + Math.floor(depth / 12));
    for (var f = 0; f < foeCount && free.length; f++) {
      var fp = take();
      var pool = FOES.filter(function (d) { return d.from <= depth; });
      var def = pool[Math.floor(rng() * pool.length)];
      a.obj({
        x: fp[0], y: fp[1], kind: 'foe', art: def.art, name: def.name,
        hp: Math.round(def.hp * (1 + depth / 60)),
        maxHp: Math.round(def.hp * (1 + depth / 60)),
        dmg: Math.round(def.dmg * (1 + depth / 80)), gen: 1
      });
    }

    /* Exactly one ladder down, always reachable, never under a rock. Two
     * ladders was tried and it made the descent feel arbitrary; none at all is
     * a soft-lock, so this is the one placement that is checked. */
    var lp = take();
    a.obj({ x: lp[0], y: lp[1], kind: 'ladder', art: 'Ladder', gen: 1 });

    if (depth % 5 === 0) {
      var ep = take();
      a.obj({ x: ep[0], y: ep[1], kind: 'mineElevator', art: 'MineGate', gen: 1 });
    }
    var up = a.nearestFree(a.entry.x, a.entry.y, 6);
    a.obj({ x: up.x, y: up.y, kind: 'mineExit', art: 'MineGate', gen: 1 });
    return a;
  }

  // ------------------------------------------------------------------ enter
  function enter(game, depth) {
    depth = depth || 1;
    var a = buildFloor(game, depth);
    game.world.areas.mine = a;
    game.world.current = 'mine';
    game.sim.mineDepth = depth;
    if (depth > (game.sim.deepestMine || 0)) game.sim.deepestMine = depth;
    var spot = a.nearestFree(a.entry.x, a.entry.y, 8);
    game.player.x = spot.x + 0.5;
    game.player.y = spot.y + 1.5;
    game.lastGrassTile = null;
    game.recenter(true);
    game.toast('Hầm mỏ — tầng ' + depth);
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('mineEnter');
    return a;
  }

  function descend(game) {
    enter(game, (game.sim.mineDepth || 1) + 1);
  }

  function leave(game) {
    game.world.current = 'sea';
    delete game.world.areas.mine;
    var rec = game.islandRec('mine');
    if (rec) {
      var spot = game.area().nearestFree(rec.x + 11, rec.y + 8, 10);
      game.player.x = spot.x + 0.5;
      game.player.y = spot.y + 0.5;
    }
    game.sim.mineDepth = 0;
    game.recenter(true);
  }

  /* The elevator. Only stops the player has actually stood on, in fives - the
   * point is that a long descent is banked, not that the whole mine is a menu. */
  function openElevator(game) {
    UI.panel('Thang máy', function (b) {
      b.appendChild(el('div', 'isl-sub',
        'Sâu nhất đã tới: tầng ' + (game.sim.deepestMine || 0)));
      var m = el('div', 'isl-menu');
      m.appendChild(btn('Lên mặt đất', function () { UI.closeAll(); leave(game); }));
      for (var d = 5; d <= (game.sim.deepestMine || 0); d += 5) {
        (function (depth) {
          m.appendChild(btn('Tầng ' + depth, function () {
            UI.closeAll(); enter(game, depth);
          }));
        })(d);
      }
      b.appendChild(m);
      b.appendChild(el('div', 'isl-hint',
        'Thang máy chỉ dừng ở các tầng chia hết cho 5 mà bạn đã xuống tới.'));
    });
  }

  /* Standing next to a monster hurts. Damage is applied on a cooldown rather
   * than per frame - without it a level-1 player walking into a slime lost the
   * whole health bar in a third of a second and had no idea what happened. */
  function step(game, dt) {
    if (game.world.current !== 'mine') return;
    var a = game.area();
    var px = Math.floor(game.player.x), py = Math.floor(game.player.y);
    game._hurtCd = Math.max(0, (game._hurtCd || 0) - dt);
    for (var i = 0; i < a.objs.length; i++) {
      var o = a.objs[i];
      if (o.kind !== 'foe') continue;
      var d = Math.abs(o.x - px) + Math.abs(o.y - py);
      if (d > 1) continue;
      if (game._hurtCd > 0) continue;
      game._hurtCd = 1.1;
      game.sim.health = Math.max(0, game.sim.health - o.dmg);
      if (game.fx) game.fx.float(game.player.x, game.player.y - 0.6, '-' + o.dmg, '#ff8a7a');
      if (game.sim.health <= 0) { faint(game); return; }
    }
  }

  /* Passing out costs a slice of gold and drops you home. Losing items as well
   * was in an earlier version and it was miserable - the ore you came for is
   * the only reason to be down here. */
  function faint(game) {
    var lost = Math.min(2000, Math.floor(game.sim.gold * 0.1));
    game.sim.gold -= lost;
    game.toast('Bạn ngất trong hầm mỏ. Mất ' + lost.toLocaleString('vi') + 'v.');
    leave(game);
    game.sim.health = Math.max(1, Math.round(game.sim.maxHealth * 0.4));
    game.sim.energy = Math.max(1, Math.round(game.sim.maxEnergy * 0.3));
    game.travelTo(game.islandRec('home'));
  }

  /* Hitting a monster. Weapon damage plus the tool tier, because the pickaxe
   * IS the weapon in this game - there is no separate sword to forget to buy. */
  function strike(game, o) {
    var dmg = (game.sim.weapon ? game.sim.weapon.dmg : 5) + (game.sim.toolPower || 1) * 3;
    if (game.sim.professions && game.sim.professions.Fighter) dmg = Math.round(dmg * 1.1);
    o.hp -= dmg;
    if (game.fx) {
      game.fx.hit('slash', o.x, o.y, game.player.dir);
      game.fx.float(o.x, o.y - 0.4, '-' + dmg, '#ffd870');
    }
    if (o.hp > 0) return false;
    game.area().remove(o);
    game.sim.addXp('combat', 6);
    game.addRank(5);
    var drops = ['Slime', 'Bat Wing', 'Bone Fragment', 'Coal'];
    game.dropItem(o.x, o.y, drops[Math.floor(Math.random() * drops.length)],
                  1 + Math.floor(Math.random() * 2));
    return true;
  }

  global.ISL_MINE = {
    enter: enter, descend: descend, leave: leave, openElevator: openElevator,
    step: step, strike: strike, faint: faint, buildFloor: buildFloor,
    oreFor: oreFor, FOES: FOES
  };
})(window);
