/*
 * tiles.js - the ground, the walls and the buildings.
 *
 * What this replaces: a two-tone checkerboard. Every tile in the valley was
 * one of two flat colours picked by (x+y)&1, and every blocked tile was a
 * brown slab. Pelican Town therefore looked like mud you could not walk on,
 * and the player could not tell the clinic from the saloon from the sidewalk.
 *
 * Two jobs here:
 *
 *   1. TEXTURE. Each ground type gets a small deterministic pattern - grass
 *      blades, soil specks, cobbles, planks with nail heads, sand grain - laid
 *      out from a hash of the tile's own coordinates. Deterministic matters:
 *      the ground must not shimmer when the camera moves.
 *
 *   2. BUILDINGS. world.js groups the map's building-collision tiles into real
 *      structures and marks each tile roof / wall / window. Here they are
 *      painted: shingled roof in that building's own colour, dark timber wall
 *      below it, a lit window, a door with a lantern, and a hanging sign so
 *      the player can read the town at a glance.
 *
 * Everything is drawn in code, no image files, same as the rest of the game.
 */
(function (global) {
  'use strict';

  var W = global.SDV_WORLD;

  /* A stable per-tile random. Same tile, same value, every frame - the ground
   * must be still while the camera moves over it. */
  function noise(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  function shade(hex, mul) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    function f(v) { return Math.max(0, Math.min(255, Math.round(v * mul))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  /* ------------------------------------------------------------ ground */
  function paintGround(ctx, kind, def, sx, sy, ts, x, y, t) {
    var n = noise(x, y);
    // base, varied a little per tile so a field is not one solid rectangle
    ctx.fillStyle = n < 0.5 ? def.c : (def.c2 || def.c);
    ctx.fillRect(sx, sy, ts + 1, ts + 1);
    var u = ts / 16;                 // one "pixel" of the 16x16 tile
    var dark = shade(def.c, 0.78), light = shade(def.c, 1.22);

    switch (def.t) {
      case 'grass': {
        ctx.fillStyle = light;
        for (var g = 0; g < 3; g++) {
          var gx = sx + ((noise(x * 3 + g, y) * 14) | 0) * u;
          var gy = sy + ((noise(x, y * 3 + g) * 13) | 0) * u;
          ctx.fillRect(gx, gy, Math.max(1, u), Math.max(2, u * 2));
        }
        ctx.fillStyle = dark;
        ctx.fillRect(sx + ((n * 12) | 0) * u, sy + ((noise(y, x) * 12) | 0) * u,
                     Math.max(1, u * 2), Math.max(1, u));
        break;
      }
      case 'soil': {
        /* Broken clods, not stripes: a full-width line every few pixels made
         * the fields read as floorboards laid outdoors. */
        ctx.fillStyle = dark;
        for (var cl = 0; cl < 4; cl++) {
          ctx.fillRect(sx + ((noise(x * 7 + cl, y) * 12) | 0) * u,
                       sy + ((noise(x, y * 7 + cl) * 14) | 0) * u,
                       Math.max(1, u * 3), Math.max(1, u));
        }
        ctx.fillStyle = light;
        ctx.fillRect(sx + ((n * 12) | 0) * u, sy + ((noise(x + 5, y) * 12) | 0) * u,
                     Math.max(1, u * 2), Math.max(1, u));
        break;
      }
      case 'furrow': {
        // tilled soil DOES have rows - that is what tilling looks like
        ctx.fillStyle = dark;
        for (var fr = 3; fr < 16; fr += 5) {
          ctx.fillRect(sx, sy + fr * u, ts + 1, Math.max(1, u * 2));
        }
        ctx.fillStyle = light;
        ctx.fillRect(sx, sy + 1 * u, ts + 1, Math.max(1, u));
        break;
      }
      case 'cobble': {
        ctx.fillStyle = dark;
        ctx.fillRect(sx, sy + 7 * u, ts + 1, Math.max(1, u));
        var off = (y & 1) ? 8 : 0;
        ctx.fillRect(sx + ((off) % 16) * u, sy, Math.max(1, u), 7 * u);
        ctx.fillRect(sx + ((off + 8) % 16) * u, sy + 8 * u, Math.max(1, u), 8 * u);
        ctx.fillStyle = light;
        ctx.fillRect(sx + 2 * u, sy + 2 * u, Math.max(1, u * 2), Math.max(1, u));
        break;
      }
      case 'plank': {
        ctx.fillStyle = dark;
        ctx.fillRect(sx, sy + 5 * u, ts + 1, Math.max(1, u));
        ctx.fillRect(sx, sy + 12 * u, ts + 1, Math.max(1, u));
        ctx.fillStyle = light;
        ctx.fillRect(sx + 3 * u, sy + 2 * u, Math.max(1, u * 6), Math.max(1, u));
        ctx.fillRect(sx + 6 * u, sy + 9 * u, Math.max(1, u * 5), Math.max(1, u));
        // nail heads on the seam, which is what makes it read as planking
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(sx + 2 * u, sy + 5 * u, Math.max(1, u), Math.max(1, u));
        ctx.fillRect(sx + 12 * u, sy + 12 * u, Math.max(1, u), Math.max(1, u));
        break;
      }
      case 'grain': {
        ctx.fillStyle = light;
        for (var s = 0; s < 4; s++) {
          ctx.fillRect(sx + ((noise(x * 5 + s, y) * 15) | 0) * u,
                       sy + ((noise(x, y * 5 + s) * 15) | 0) * u,
                       Math.max(1, u), Math.max(1, u));
        }
        break;
      }
      case 'weave': {
        ctx.fillStyle = light;
        ctx.fillRect(sx, sy + 4 * u, ts + 1, Math.max(1, u));
        ctx.fillRect(sx + 4 * u, sy, Math.max(1, u), ts + 1);
        break;
      }
      case 'water': {
        /* Two crossing ripple bands plus a slow caustic sparkle. Flat blue
         * with one wobbling line read as a painted rectangle; water has to
         * move in more than one direction to look wet. */
        var wob = Math.sin(t / 520 + x * 0.7 + y * 0.45);
        var wob2 = Math.sin(t / 810 - x * 0.4 + y * 0.9);
        ctx.fillStyle = 'rgba(190,225,245,0.11)';
        ctx.fillRect(sx, sy + ts * 0.30 + wob * ts * 0.10, ts + 1,
                     Math.max(1, ts * 0.08));
        ctx.fillStyle = 'rgba(150,200,230,0.08)';
        ctx.fillRect(sx, sy + ts * 0.70 - wob2 * ts * 0.08, ts + 1,
                     Math.max(1, ts * 0.06));
        var spark = Math.sin(t / 300 + (x * 13 + y * 7));
        if (spark > 0.86) {
          ctx.fillStyle = 'rgba(230,246,255,' + ((spark - 0.86) * 3).toFixed(2) + ')';
          ctx.fillRect(sx + ((noise(x, y) * 11 + 2) | 0) * u,
                       sy + ((noise(y, x) * 11 + 2) | 0) * u,
                       Math.max(1, u * 2), Math.max(1, u));
        }
        break;
      }
      case 'lava': {
        var lw = Math.sin(t / 300 + x + y);
        ctx.fillStyle = 'rgba(255,190,90,' + (0.25 + lw * 0.15) + ')';
        ctx.fillRect(sx, sy + ts * 0.4, ts + 1, Math.max(2, ts * 0.2));
        break;
      }
      default: break;
    }
  }

  /* Soften the seam where one ground type meets another.
   *
   * WHY: the extracted maps store one type per tile, so a path through grass
   * came out as a staircase of hard squares - the single biggest reason the
   * ground read as a spreadsheet rather than as terrain. For each edge whose
   * neighbour is a different type, the neighbour's colour is feathered a few
   * pixels into this tile, with the depth wobbled per tile so the resulting
   * line is irregular instead of a ruled border. */
  function mid(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',0.45)';
  }

  function paintBlend(ctx, area, x, y, sx, sy, ts, TILE, TILE_IDS) {
    var here = area.at(x, y);
    // shallow meeting deep is still water; it gets no shoreline and no feather
    var hereDef = TILE[TILE_IDS[here]];
    var hereWet = !!(hereDef && hereDef.water);
    var u = ts / 16;
    var sides = [[0, -1, 'top'], [0, 1, 'bottom'], [-1, 0, 'left'], [1, 0, 'right']];
    for (var i = 0; i < 4; i++) {
      var nx = x + sides[i][0], ny = y + sides[i][1];
      if (nx < 0 || ny < 0 || nx >= area.w || ny >= area.h) continue;
      var there = area.at(nx, ny);
      if (there === here) continue;
      /* One-sided, always. Feathering BOTH tiles into each other drew the
       * neighbour's colour on both sides of every seam, so each patch of soil
       * came out ringed in green and the farm read as a circuit board. Only
       * the lower tile id bleeds into the higher, so a boundary gets exactly
       * one soft edge. */
      if (there > here) continue;
      var def = TILE[TILE_IDS[there]];
      /* Water does not feather - it breaks. Where it meets land it gets a
       * moving line of foam instead, which is what a shore looks like and what
       * a soft gradient never manages. */
      if (def && def.water) {
        if (!hereWet) shoreLine(ctx, x, y, sx, sy, ts, side);
        continue;
      }
      if (hereWet) { shoreLine(ctx, x, y, sx, sy, ts, side); continue; }
      if (!def) continue;
      var depth = (2 + Math.floor(noise(x * 3 + i, y * 5) * 3)) * u;
      var g, side = sides[i][2];
      if (side === 'top') {
        g = ctx.createLinearGradient(0, sy, 0, sy + depth);
        g.addColorStop(0, def.c); g.addColorStop(0.45, mid(def.c));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(sx, sy, ts + 1, depth);
      } else if (side === 'bottom') {
        g = ctx.createLinearGradient(0, sy + ts, 0, sy + ts - depth);
        g.addColorStop(0, def.c); g.addColorStop(0.45, mid(def.c));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(sx, sy + ts - depth, ts + 1, depth + 1);
      } else if (side === 'left') {
        g = ctx.createLinearGradient(sx, 0, sx + depth, 0);
        g.addColorStop(0, def.c); g.addColorStop(0.45, mid(def.c));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(sx, sy, depth, ts + 1);
      } else {
        g = ctx.createLinearGradient(sx + ts, 0, sx + ts - depth, 0);
        g.addColorStop(0, def.c); g.addColorStop(0.45, mid(def.c));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(sx + ts - depth, sy, depth + 1, ts + 1);
      }
    }
  }

  /* The bright edge where a wave meets the bank. Keyed off the tile and the
   * clock so it travels along the shore instead of blinking in place. */
  function shoreLine(ctx, x, y, sx, sy, ts, side) {
    var u = ts / 16;
    var t = Date.now() / 900;
    var swell = 0.5 + 0.5 * Math.sin(t + x * 0.6 + y * 0.4);
    var th = Math.max(1, u * (1.2 + swell * 1.6));
    ctx.fillStyle = 'rgba(206,232,246,' + (0.20 + swell * 0.22).toFixed(3) + ')';
    if (side === 'top') ctx.fillRect(sx, sy, ts + 1, th);
    else if (side === 'bottom') ctx.fillRect(sx, sy + ts - th, ts + 1, th);
    else if (side === 'left') ctx.fillRect(sx, sy, th, ts + 1);
    else ctx.fillRect(sx + ts - th, sy, th, ts + 1);
  }

  /* ------------------------------------------------------------ buildings */
  /* Terrain that blocks but is not a building: cliffs, boulders, tree walls.
   * Coloured off the ground it rises out of, in the same dark-wood register. */
  var BLOCK_TERRAIN = {
    grass: { body: '#2c4f26', top: '#3f6b34', fleck: '#20391b' },
    dirt:  { body: '#4a3524', top: '#66492f', fleck: '#38271a' },
    path:  { body: '#5f5340', top: '#7a6a52', fleck: '#4a4132' },
    sand:  { body: '#87764f', top: '#a89268', fleck: '#6d5f3f' },
    stone: { body: '#43434b', top: '#5a5a63', fleck: '#33333a' },
    floor: { body: '#4a382b', top: '#63482f', fleck: '#382a20' },
    wood:  { body: '#43301f', top: '#5e442e', fleck: '#332517' },
    jungle:{ body: '#1e4a2c', top: '#2c6b3f', fleck: '#163823' },
    snow:  { body: '#8a97a2', top: '#b8c4cd', fleck: '#74808a' },
    ice:   { body: '#6f8fa4', top: '#8fb0c4', fleck: '#5c7788' },
    darkrock: { body: '#2c2c33', top: '#3d3d45', fleck: '#232329' },
    rock:  { body: '#3d3d45', top: '#52525c', fleck: '#2e2e35' }
  };
  var BLOCK_FENCE = { body: '#5e442e', top: '#7a5c3e', fleck: '#472f1e' };
  /* Indoor walls are pushed well below the floor tone on purpose: at first
   * pass the panelling and the floorboards were both mid-brown and a room read
   * as one undifferentiated slab of wood with a person standing in it. */
  var INDOOR_WALL = { body: '#2a1d14', top: '#4a3626', fleck: '#1e150f' };

  function paintBlocked(ctx, cls, kind, sx, sy, ts, x, y, area, indoor) {
    var u = ts / 16;
    var top = y > 0 && area.blocked[(y - 1) * area.w + x] === cls;
    var pal = cls === 3 ? BLOCK_FENCE
            : indoor ? INDOOR_WALL
            : (BLOCK_TERRAIN[kind] || BLOCK_TERRAIN.grass);
    ctx.fillStyle = pal.body;
    ctx.fillRect(sx, sy, ts + 1, ts + 1);
    if (!top) {
      ctx.fillStyle = pal.top;
      ctx.fillRect(sx, sy, ts + 1, Math.max(2, ts * 0.28));
    }
    if (indoor || cls === 3) {
      // vertical timbers, so an interior wall reads as panelling not as mud
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(sx + 4 * u, sy, Math.max(1, u), ts + 1);
      ctx.fillRect(sx + 11 * u, sy, Math.max(1, u), ts + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sx + 5 * u, sy, Math.max(1, u), ts + 1);
      // skirting board where the wall meets the floor, so the room has an edge
      var open = y + 1 < area.h && !area.blocked[(y + 1) * area.w + x];
      if (open) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(sx, sy + 13 * u, ts + 1, Math.max(2, u * 3));
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(sx, sy + 13 * u, ts + 1, Math.max(1, u));
      }
    } else if (noise(x, y) > 0.66) {
      ctx.fillStyle = pal.fleck;
      ctx.fillRect(sx + ((noise(x, y * 2) * 10 + 2) | 0) * u,
                   sy + ((noise(x * 2, y) * 9 + 4) | 0) * u,
                   Math.max(2, u * 3), Math.max(2, u * 2));
    }
  }

  /* A building tile: shingles above, dark planking below, a window where the
   * structure marked one. */
  function paintBuilding(ctx, part, b, sx, sy, ts, x, y, night) {
    var u = ts / 16;
    if (part === 1) {                       // roof
      ctx.fillStyle = b.roof;
      ctx.fillRect(sx, sy, ts + 1, ts + 1);
      ctx.fillStyle = shade(b.roof, 0.72);
      // shingle courses, offset every other row
      var off = (y & 1) ? 4 : 0;
      ctx.fillRect(sx, sy + 7 * u, ts + 1, Math.max(1, u));
      ctx.fillRect(sx, sy + 15 * u, ts + 1, Math.max(1, u));
      for (var c = 0; c < 2; c++) {
        ctx.fillRect(sx + ((off + c * 8) % 16) * u, sy, Math.max(1, u), 7 * u);
        ctx.fillRect(sx + ((off + 4 + c * 8) % 16) * u, sy + 8 * u,
                     Math.max(1, u), 7 * u);
      }
      ctx.fillStyle = shade(b.roof, 1.18);
      if (y === b.y) ctx.fillRect(sx, sy, ts + 1, Math.max(1, u * 2));  // ridge
      return;
    }
    // wall
    ctx.fillStyle = b.wall;
    ctx.fillRect(sx, sy, ts + 1, ts + 1);
    ctx.fillStyle = shade(b.wall, 0.7);
    ctx.fillRect(sx + 5 * u, sy, Math.max(1, u), ts + 1);
    ctx.fillRect(sx + 11 * u, sy, Math.max(1, u), ts + 1);
    ctx.fillStyle = shade(b.wall, 1.2);
    ctx.fillRect(sx, sy, ts + 1, Math.max(1, u));           // eave shadow line
    if (part === 3) {
      var frame = shade(b.wall, 0.55);
      ctx.fillStyle = frame;
      ctx.fillRect(sx + 3 * u, sy + 3 * u, 10 * u, 9 * u);
      ctx.fillStyle = night ? '#f2c565' : '#7fa8bd';
      ctx.fillRect(sx + 4 * u, sy + 4 * u, 8 * u, 7 * u);
      ctx.fillStyle = frame;
      ctx.fillRect(sx + 7 * u, sy + 4 * u, Math.max(1, u), 7 * u);
      ctx.fillRect(sx + 4 * u, sy + 7 * u, 8 * u, Math.max(1, u));
    }
  }

  /* The door itself, plus the sign that names the building. Drawn after the
   * tiles so nothing paints over it. */
  function paintDoor(ctx, b, sx, sy, ts, open, night) {
    var u = ts / 16;
    ctx.fillStyle = '#2a1c12';
    ctx.fillRect(sx + 2 * u, sy - 2 * u, 12 * u, 18 * u);
    ctx.fillStyle = open ? '#54381f' : '#3a2717';
    ctx.fillRect(sx + 3 * u, sy - 1 * u, 10 * u, 16 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 8 * u, sy - 1 * u, Math.max(1, u), 16 * u);
    ctx.fillStyle = '#d9b558';
    ctx.fillRect(sx + 10 * u, sy + 7 * u, Math.max(2, u * 1.5), Math.max(2, u * 1.5));
    // the lantern: lit when the door is open, dead when it is shut
    ctx.fillStyle = open ? (night ? '#ffd98a' : '#e8c357') : '#4a4038';
    ctx.fillRect(sx + 14 * u, sy - 3 * u, 3 * u, 3 * u);
    if (open && night) {
      ctx.fillStyle = 'rgba(255,215,130,0.18)';
      ctx.fillRect(sx + 9 * u, sy - 8 * u, 13 * u, 13 * u);
    }
  }

  function paintSign(ctx, text, cx, sy, ts, open) {
    var f = Math.max(8, ts * 0.42);
    ctx.font = 'bold ' + f + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(text).width + ts * 0.5;
    var h = f + ts * 0.28;
    var x = cx - w / 2, y = sy - h - ts * 0.5;
    ctx.fillStyle = 'rgba(24,16,10,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = open ? '#c9a45e' : '#6b5f4e';
    ctx.fillRect(x, y, w, Math.max(2, ts * 0.09));
    ctx.fillRect(x, y + h - Math.max(2, ts * 0.09), w, Math.max(2, ts * 0.09));
    ctx.fillStyle = open ? '#f0e3c2' : '#9d9285';
    ctx.fillText(text, cx, y + f * 0.92);
    ctx.textAlign = 'left';
  }

  global.SDV_TILES = {
    noise: noise, shade: shade,
    paintGround: paintGround, paintBlend: paintBlend, paintBlocked: paintBlocked,
    paintBuilding: paintBuilding, paintDoor: paintDoor, paintSign: paintSign,
    BLOCK_TERRAIN: BLOCK_TERRAIN
  };
})(window);
