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

  /* Smooth low-frequency variation, anchored to the world.
   *
   * WHY this exists: measured, 79% of a midday farm frame was ONE colour - a
   * single flat brown filling four fifths of the screen. That is what reads as
   * cheap, and no amount of colour grading touches it, because there is nothing
   * in the frame to grade apart. Real ground is never one value: it is lighter
   * where it is dry and worn, darker where it holds water, in patches many
   * paces across.
   *
   * Deliberately LOW frequency, and interpolated. Per-tile randomness was tried
   * first and it just adds noise - the eye reads static, not terrain. Patches
   * about seven tiles across are big enough to look like ground and small
   * enough that a phone screen holds two or three of them. */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothNoise(x, y, period) {
    var fx = x / period, fy = y / period;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx);                 // ease, or the patches are diamonds
    ty = ty * ty * (3 - 2 * ty);
    return lerp(lerp(noise(x0, y0), noise(x0 + 1, y0), tx),
                lerp(noise(x0, y0 + 1), noise(x0 + 1, y0 + 1), tx), ty);
  }
  function dapple(x, y) {
    // two octaves: broad patches, plus a gentler ripple so they are not blobs
    var a = smoothNoise(x, y, 7.0);
    var b = smoothNoise(x + 37, y - 19, 2.6);
    /* The range was half this to start with and it was too polite to see -
     * measured, it moved the flat-area figure but the frame still read as one
     * colour. Ground varies more than we think it does. */
    return 0.84 + (a * 0.76 + b * 0.24) * 0.34;   // 0.84 .. 1.18
  }

  function shade(hex, mul) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    function f(v) { return Math.max(0, Math.min(255, Math.round(v * mul))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  /* ------------------------------------------------------------ ground */
  /* Ground, drawn as organic patches rather than as a grid of squares.
   *
   * The maps store one type per tile, so grass meeting soil came out as a
   * staircase of hard squares - the single most pixel-looking thing left after
   * the sprites went. The fix is not a texture: it is the SHAPE. A tile whose
   * neighbours all match keeps square edges, so a field stays one continuous
   * field; a tile with differing neighbours has those corners carved away with
   * the neighbour's colour, so an isolated patch becomes a rounded blob and a
   * coastline becomes a curve. Four quarter-discs per tile, at most.
   *
   * The old per-pixel speckle is gone with it. Texture now means a couple of
   * soft, large, low-contrast marks - visible as material, invisible as pixels.
   */
  /* Which sheet, if any, draws this kind of ground.
   *
   * Everything not listed keeps the painted version - there is no sheet for a
   * ship's deck or a mine floor, and inventing one by stretching a grass tile
   * would look worse than the paint it replaced. */
  var GROUND_SHEET = {
    grass:   { fill: 'tile_grass', detail: null },
    /* Bare earth is TINTED. The pack's path tileset is sand, which is right for
     * a town path and wrong for a farm - a whole farm of pale sand reads as a
     * beach. The tiles keep their shape and their edges and take a brown over
     * them, which is far better than having no edges at all. */
    dirt:    { over: 'tile_path_edge', tint: 'rgba(96,58,26,0.46)' },
    stone:   { over: 'tile_path_edge', tint: 'rgba(70,70,78,0.34)' },
    path:    { over: 'tile_path_edge' },
    tilled:  { over: 'tile_farmland' },
    watered: { over: 'tile_farmland', dark: 0.22 },
    water:   { over: 'tile_water_edge' },
    deep:    { over: 'tile_water_edge', dark: 0.20 },
    sand:    { fill: 'tile_path' }
  };

  /* Draw a ground tile from the tilesets, or say no and let the painter run.
   *
   * The autotile blocks are drawn OVER grass, because that is what their edges
   * are cut against - a path tile's corner has grass painted into it. So grass
   * goes down first everywhere outdoors and the material is laid on top; miss
   * that and every path is ringed with transparent notches. */
  /* Indoor floors, from the interior tileset.
   *
   * Cells picked off the sheet by eye after indexing it: rows 5-7 are floors in
   * four materials, rows 1-4 are wall faces, row 0 is the cap that sits on top
   * of a wall. Deliberately fixed cells rather than autotiled - an interior
   * floor is laid, not grown, and a plank floor with eroded edges would look
   * wrong in a way the outdoor ground does not. */
  var INDOOR_CELL = {
    floor:   [2, 6],      // warm planks
    wood:    [6, 6],      // pale planks
    rug:     [14, 6],     // red-orange brick, which is what a shop mat reads as
    stone:   [10, 6],
    plank:   [2, 6]
  };

  function sheetIndoor(ctx, kindName, sx, sy, ts, x, y, area) {
    var SH = global.SDV_SHEETS;
    if (!SH || !SH.has('in_floorwall')) return false;
    var cellxy = INDOOR_CELL[kindName];
    if (!cellxy) return false;
    return SH.cell(ctx, 'in_floorwall', 16, 16, cellxy[0], cellxy[1],
                   Math.round(sx), Math.round(sy),
                   Math.ceil(ts) + 1, Math.ceil(ts) + 1, false);
  }

  function sheetGround(ctx, kindName, sx, sy, ts, x, y, area) {
    var SH = global.SDV_SHEETS;
    if (!SH || !area) return false;
    if (!area.outdoor) return sheetIndoor(ctx, kindName, sx, sy, ts, x, y, area);
    var spec = GROUND_SHEET[kindName];
    if (!spec) return false;
    if (spec.fill) return SH.fill(ctx, spec.fill, sx, sy, ts);
    if (!SH.has('tile_grass') || !SH.has(spec.over)) return false;
    SH.fill(ctx, 'tile_grass', sx, sy, ts);
    var same = function (nx, ny) {
      var n = area.name_of(nx, ny);
      if (n === kindName) return true;
      // water and deep water are one material as far as the shoreline cares
      if ((kindName === 'water' || kindName === 'deep')
          && (n === 'water' || n === 'deep')) return true;
      if ((kindName === 'tilled' || kindName === 'watered')
          && (n === 'tilled' || n === 'watered')) return true;
      if ((kindName === 'dirt' || kindName === 'stone' || kindName === 'path')
          && (n === 'dirt' || n === 'stone' || n === 'path')) return true;
      return false;
    };
    var ok = SH.ground(ctx, spec.over, x, y, sx, sy, ts, same);
    if (!ok) return false;

    /* The detail tiles the sheet ships with, scattered thinly on tiles that are
     * fully inside the material. The bottom row of the path and water sheets is
     * loose pebbles and ripples, and it exists exactly for this - the centre
     * tile of any tileset is flat by design, and a whole field of it is the
     * "one flat colour" problem all over again, just in a nicer colour. */
    var inside = same(x - 1, y) && same(x + 1, y)
              && same(x, y - 1) && same(x, y + 1);
    if (inside && spec.over !== 'tile_farmland') {
      var r = noise(x * 13, y * 7);
      if (r > 0.86) {
        SH.cell(ctx, spec.over, 16, 16, Math.floor(noise(x, y * 3) * 3), 5,
                Math.round(sx), Math.round(sy),
                Math.ceil(ts) + 1, Math.ceil(ts) + 1, false);
      }
    }
    if (spec.tint) {
      ctx.save();
      ctx.fillStyle = spec.tint;
      ctx.fillRect(sx, sy, Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      ctx.restore();
    }
    if (spec.dark) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,40,90,' + spec.dark + ')';
      ctx.fillRect(sx, sy, Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      ctx.restore();
    }
    /* And the broad light-and-dark variation that was measured into this file
     * earlier: 79% of a midday frame used to be a single flat colour, and a
     * tileset does not fix that on its own - it just makes the flat colour a
     * nicer one. Kept very light here, because the tiles already carry detail
     * the painted ground did not. */
    var dp = dapple(x, y);
    if (dp < 0.99 || dp > 1.01) {
      ctx.save();
      ctx.globalCompositeOperation = dp < 1 ? 'multiply' : 'lighter';
      var k = Math.min(0.20, Math.abs(dp - 1) * 0.9);
      ctx.fillStyle = (dp < 1 ? 'rgba(120,110,95,' : 'rgba(255,246,225,')
                    + k.toFixed(3) + ')';
      ctx.fillRect(sx, sy, Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      ctx.restore();
    }
    return ok;
  }

  /* Returns true when a tileset drew this tile. The caller uses that to skip
   * the hand-painted blending pass: the tilesets carry their own edges, and
   * feathering a second set of edges over them is how tiled ground ends up
   * looking smeared. */
  function paintGround(ctx, kind, def, sx, sy, ts, x, y, t, area) {
    if (sheetGround(ctx, kind, sx, sy, ts, x, y, area)) return true;
    var n = noise(x, y);
    var base = n < 0.5 ? def.c : (def.c2 || def.c);
    /* Structured ground keeps its exact colour - a floorboard or a flagstone is
     * manufactured and being uniform is the point. Only what grew or eroded
     * gets the variation. */
    var natural = def.t === 'grass' || def.t === 'soil' || def.t === 'furrow'
               || def.t === 'grain';
    ctx.fillStyle = natural ? shade(base, dapple(x, y)) : base;
    ctx.fillRect(sx, sy, ts + 1, ts + 1);

    var dark = shade(def.c, 0.80), light = shade(def.c, 1.20);
    var u = ts / 16;

    switch (def.t) {
      case 'grass': {
        /* Tufts, drawn as little curved blades rather than as pixels. */
        ctx.strokeStyle = light;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, ts * 0.045);
        for (var g = 0; g < 3; g++) {
          var gx = sx + noise(x * 3 + g, y) * ts * 0.86 + ts * 0.07;
          var gy = sy + noise(x, y * 3 + g) * ts * 0.80 + ts * 0.14;
          var lean = (noise(x + g, y + g) - 0.5) * ts * 0.16;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.quadraticCurveTo(gx + lean, gy - ts * 0.10,
                               gx + lean * 1.7, gy - ts * 0.19);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        break;
      }
      case 'soil': {
        ctx.fillStyle = dark;
        for (var cl = 0; cl < 3; cl++) {
          var ox = sx + noise(x * 7 + cl, y) * ts * 0.76 + ts * 0.10;
          var oy = sy + noise(x, y * 7 + cl) * ts * 0.76 + ts * 0.10;
          ctx.beginPath();
          ctx.ellipse(ox, oy, ts * 0.10, ts * 0.055,
                      noise(x + cl, y) * 3, 0, 6.3);
          ctx.fill();
        }
        break;
      }
      case 'furrow': {
        // tilled soil really does have rows - that is what tilling looks like
        ctx.strokeStyle = dark;
        ctx.lineWidth = Math.max(1.5, ts * 0.09);
        for (var fr = 1; fr <= 3; fr++) {
          var fy = sy + ts * (fr / 4);
          ctx.beginPath();
          ctx.moveTo(sx, fy);
          ctx.quadraticCurveTo(sx + ts / 2, fy + ts * 0.03, sx + ts, fy);
          ctx.stroke();
        }
        break;
      }
      case 'cobble': {
        /* Cobbles laid out from the tile's world position, not from a fixed
         * pattern inside the tile.
         *
         * Two versions of this failed the same way: four stones at the same
         * four anchors in every tile, so however much each one was jittered,
         * the 2x2 lattice still read through and the path looked like bubble
         * wrap. What breaks it is moving the whole arrangement per tile - the
         * row is staggered by half a stone on alternate rows, the group is
         * shifted by a per-tile amount, and the count itself varies - so no
         * two tiles put a stone in the same place. */
        var stagger = (y & 1) ? 0.5 : 0;
        var shiftX = (noise(x * 17, y * 5) - 0.5) * 0.30;
        var shiftY = (noise(x * 5, y * 17) - 0.5) * 0.30;
        var cnt = 3 + (noise(x * 31, y * 29) > 0.55 ? 1 : 0);
        for (var k = 0; k < cnt; k++) {
          var col = k % 2, row = (k / 2) | 0;
          var u2 = 0.27 + col * 0.46 + stagger * 0.46 + shiftX
                 + (noise(x * 11 + k, y * 7) - 0.5) * 0.20;
          var v2 = 0.28 + row * 0.44 + shiftY
                 + (noise(x * 7, y * 11 + k) - 0.5) * 0.20;
          var rr = ts * (0.14 + noise(x + k * 3, y + k * 5) * 0.09);
          ctx.fillStyle = shade(def.c, 1.02 + noise(x * 3 + k, y * 3 + k) * 0.28);
          ctx.beginPath();
          ctx.ellipse(sx + ts * u2, sy + ts * v2, rr, rr * (0.72 + noise(x + k, y) * 0.26),
                      noise(x + k, y + k) * 3, 0, 6.3);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = Math.max(1, ts * 0.03);
          ctx.stroke();
        }
        break;
      }
      case 'plank': {
        ctx.strokeStyle = dark;
        ctx.lineWidth = Math.max(1, ts * 0.045);
        ctx.beginPath();
        ctx.moveTo(sx, sy + ts * 0.34); ctx.lineTo(sx + ts, sy + ts * 0.34);
        ctx.moveTo(sx, sy + ts * 0.76); ctx.lineTo(sx + ts, sy + ts * 0.76);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(sx, sy + ts * 0.36, ts + 1, ts * 0.14);
        break;
      }
      case 'grain': {
        ctx.fillStyle = light;
        for (var sgr = 0; sgr < 4; sgr++) {
          ctx.beginPath();
          ctx.arc(sx + noise(x * 5 + sgr, y) * ts * 0.9 + ts * 0.05,
                  sy + noise(x, y * 5 + sgr) * ts * 0.9 + ts * 0.05,
                  ts * 0.035, 0, 6.3);
          ctx.fill();
        }
        break;
      }
      case 'weave': {
        /* A rug, not graph paper. Soft pile with a lit edge, and a border only
         * where the rug actually ends - the hard cross on every tile turned the
         * workshop floor into a spreadsheet. */
        var vg = ctx.createRadialGradient(sx + ts * 0.35, sy + ts * 0.3, ts * 0.1,
                                          sx + ts * 0.5, sy + ts * 0.5, ts * 0.95);
        vg.addColorStop(0, shade(def.c, 1.12));
        vg.addColorStop(1, shade(def.c, 0.90));
        ctx.fillStyle = vg;
        ctx.fillRect(sx, sy, ts + 1, ts + 1);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = Math.max(1, ts * 0.04);
        for (var wv = 0; wv < 2; wv++) {
          var wy = sy + ts * (0.32 + wv * 0.4);
          ctx.beginPath();
          ctx.moveTo(sx, wy);
          ctx.quadraticCurveTo(sx + ts / 2, wy + ts * 0.05, sx + ts, wy);
          ctx.stroke();
        }
        break;
      }
      case 'water': {
        var wob = Math.sin(t / 520 + x * 0.7 + y * 0.45);
        var wob2 = Math.sin(t / 810 - x * 0.4 + y * 0.9);
        ctx.strokeStyle = 'rgba(190,225,245,0.16)';
        ctx.lineWidth = Math.max(1.5, ts * 0.07);
        ctx.beginPath();
        ctx.moveTo(sx, sy + ts * 0.32 + wob * ts * 0.10);
        ctx.quadraticCurveTo(sx + ts / 2, sy + ts * 0.24 + wob * ts * 0.10,
                             sx + ts, sy + ts * 0.32 + wob * ts * 0.10);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(150,200,230,0.11)';
        ctx.beginPath();
        ctx.moveTo(sx, sy + ts * 0.72 - wob2 * ts * 0.08);
        ctx.quadraticCurveTo(sx + ts / 2, sy + ts * 0.80 - wob2 * ts * 0.08,
                             sx + ts, sy + ts * 0.72 - wob2 * ts * 0.08);
        ctx.stroke();
        var spark = Math.sin(t / 300 + (x * 13 + y * 7));
        if (spark > 0.86) {
          ctx.fillStyle = 'rgba(230,246,255,' + ((spark - 0.86) * 3).toFixed(2) + ')';
          ctx.beginPath();
          ctx.ellipse(sx + noise(x, y) * ts * 0.7 + ts * 0.15,
                      sy + noise(y, x) * ts * 0.7 + ts * 0.15,
                      ts * 0.09, ts * 0.035, 0, 0, 6.3);
          ctx.fill();
        }
        break;
      }
      case 'lava': {
        var lw2 = Math.sin(t / 300 + x + y);
        ctx.fillStyle = 'rgba(255,190,90,' + (0.25 + lw2 * 0.15) + ')';
        ctx.beginPath();
        ctx.ellipse(sx + ts / 2, sy + ts / 2, ts * 0.42, ts * 0.20, 0, 0, 6.3);
        ctx.fill();
        break;
      }
      default: break;
    }
  }

  /* Where land meets water: a bright lip that breathes, drawn on the LAND
   * side. A shore is a break, not a blend - feathering the two colours into
   * each other made every pond look like it was evaporating. */
  function shoreLine(ctx, x, y, sx, sy, ts, side) {
    var t = Date.now() / 700;
    var swell = 0.5 + 0.5 * Math.sin(t + x * 0.6 + y * 0.4);
    var d = ts * (0.10 + swell * 0.07);
    ctx.save();
    ctx.fillStyle = 'rgba(226,214,178,' + (0.30 + swell * 0.28).toFixed(2) + ')';
    ctx.beginPath();
    if (side === 'top') {
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + ts / 2, sy + d * 1.6, sx + ts, sy);
      ctx.lineTo(sx + ts, sy - 1); ctx.lineTo(sx, sy - 1);
    } else if (side === 'bottom') {
      ctx.moveTo(sx, sy + ts);
      ctx.quadraticCurveTo(sx + ts / 2, sy + ts - d * 1.6, sx + ts, sy + ts);
      ctx.lineTo(sx + ts, sy + ts + 1); ctx.lineTo(sx, sy + ts + 1);
    } else if (side === 'left') {
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + d * 1.6, sy + ts / 2, sx, sy + ts);
      ctx.lineTo(sx - 1, sy + ts); ctx.lineTo(sx - 1, sy);
    } else {
      ctx.moveTo(sx + ts, sy);
      ctx.quadraticCurveTo(sx + ts - d * 1.6, sy + ts / 2, sx + ts, sy + ts);
      ctx.lineTo(sx + ts + 1, sy + ts); ctx.lineTo(sx + ts + 1, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* Carve the corners where this tile's neighbours differ, using the
   * neighbour's own colour. That is what turns the tile grid into shapes.
   * Water keeps a hard edge and gets a moving line of foam instead - a shore
   * is a break, not a blend. */
  function paintBlend(ctx, area, x, y, sx, sy, ts, TILE, TILE_IDS) {
    var here = area.at(x, y);
    var hereDef = TILE[TILE_IDS[here]];
    var hereWet = !!(hereDef && hereDef.water);

    var N = area.at(x, y - 1), S = area.at(x, y + 1);
    var W = area.at(x - 1, y), E = area.at(x + 1, y);
    var dN = N !== here, dS = S !== here, dW = W !== here, dE = E !== here;
    if (!dN && !dS && !dW && !dE) return;

    function def(id) { return TILE[TILE_IDS[id]]; }
    function wet(id) { var d = def(id); return !!(d && d.water); }

    // shoreline: a bright moving lip where land meets water
    if (!hereWet) {
      if (dN && wet(N)) shoreLine(ctx, x, y, sx, sy, ts, 'top');
      if (dS && wet(S)) shoreLine(ctx, x, y, sx, sy, ts, 'bottom');
      if (dW && wet(W)) shoreLine(ctx, x, y, sx, sy, ts, 'left');
      if (dE && wet(E)) shoreLine(ctx, x, y, sx, sy, ts, 'right');
    }

    /* Soft mutual bleed, not a cut edge.
     *
     * The first attempt carved each tile's corners with its neighbour's colour.
     * On a map where grass and soil are genuinely mixed tile by tile, that
     * turned every single tile into a rounded square and the farm read as a
     * tile puzzle - worse than the squares it replaced. What actually removes
     * a grid is width: a bleed most of a tile across, at low opacity, so a
     * boundary becomes a gradient a finger wide instead of a step. Each tile
     * bleeds onto the neighbours already painted before it, so every boundary
     * gets exactly one bleed and the two colours meet in the middle.
     *
     * Only NATURAL ground bleeds. Tilled rows, paths, floorboards and water
     * keep their edges: a path that melts into the grass stops reading as a
     * path, and a shoreline is a break by definition. */
    var SOFT = { grass: 1, soil: 1 };
    if (!SOFT[hereDef && hereDef.t]) return;
    var soft = false;
    for (var k = 0; k < 4; k++) {
      var nid = [N, S, W, E][k];
      if (nid === here) continue;
      var nd2 = def(nid);
      if (nd2 && SOFT[nd2.t]) { soft = true; break; }
    }
    if (!soft) return;

    var cx = sx + ts / 2, cy = sy + ts / 2;
    var rad = ts * 1.05;
    var bg = ctx.createRadialGradient(cx, cy, ts * 0.20, cx, cy, rad);
    var bc = shade(hereDef.c, dapple(x, y));
    bg.addColorStop(0, bc);
    bg.addColorStop(0.45, bc);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, 6.3);
    ctx.fill();
    ctx.restore();
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
    /* An interior wall from the tileset: the face, plus the cap on top when the
     * tile above is not itself wall. That cap is what makes a room read as
     * having height instead of being a hole in the floor. */
    var SHw = global.SDV_SHEETS;
    if (indoor && SHw && SHw.has('in_floorwall')) {
      var above = y > 0 && area.blocked[(y - 1) * area.w + x];
      var s2 = Math.ceil(ts) + 1;
      SHw.cell(ctx, 'in_floorwall', 16, 16, 6, above ? 3 : 2,
               Math.round(sx), Math.round(sy), s2, s2, false);
      if (!above) {
        SHw.cell(ctx, 'in_floorwall', 16, 16, 6, 0,
                 Math.round(sx), Math.round(sy - ts * 0.62), s2,
                 Math.ceil(ts * 0.66) + 1, false);
      }
      return;
    }
    var u = ts / 16;
    var top = y > 0 && area.blocked[(y - 1) * area.w + x] === cls;
    var pal = cls === 3 ? BLOCK_FENCE
            : indoor ? INDOOR_WALL
            : (BLOCK_TERRAIN[kind] || BLOCK_TERRAIN.grass);
    ctx.fillStyle = pal.body;
    ctx.fillRect(sx, sy, ts + 1, ts + 1);

    if (indoor || cls === 3) {
      /* Indoors a wall is panelling: a lit cap along the top, vertical timbers,
       * and a skirting board where it meets the floor so the room has an edge. */
      if (!top) {
        ctx.fillStyle = pal.top;
        ctx.fillRect(sx, sy, ts + 1, Math.max(2, ts * 0.28));
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(sx, sy, ts + 1, Math.max(1, ts * 0.05));
      }
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(sx + 4 * u, sy, Math.max(1, u), ts + 1);
      ctx.fillRect(sx + 11 * u, sy, Math.max(1, u), ts + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sx + 5 * u, sy, Math.max(1, u), ts + 1);
      var open = y + 1 < area.h && !area.blocked[(y + 1) * area.w + x];
      if (open) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(sx, sy + 13 * u, ts + 1, Math.max(2, u * 3));
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(sx, sy + 13 * u, ts + 1, Math.max(1, u));
      }
      return;
    }

    /* Outdoors and underground a wall is ROCK, so it is drawn as rock: two or
     * three rounded boulders keyed off the tile's position, each with its own
     * lit side. The flat block with one square fleck on it was the last thing
     * in the mine that still looked like a tile map, and in a cave the walls
     * are most of what is on the screen. */
    var lipH = Math.max(2, ts * 0.26);
    if (!top) {
      var lg = ctx.createLinearGradient(0, sy, 0, sy + lipH);
      lg.addColorStop(0, pal.top);
      lg.addColorStop(1, pal.body);
      ctx.fillStyle = lg;
      ctx.fillRect(sx, sy, ts + 1, lipH);
    }
    var lumps = 2 + (noise(x * 23, y * 19) > 0.5 ? 1 : 0);
    for (var k = 0; k < lumps; k++) {
      var bx = sx + ts * (0.22 + noise(x * 13 + k, y * 5) * 0.58);
      var by = sy + ts * (0.26 + noise(x * 5, y * 13 + k) * 0.56);
      var br = ts * (0.19 + noise(x + k * 7, y + k * 3) * 0.13);
      var rg = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1,
                                        bx, by, br * 1.25);
      rg.addColorStop(0, pal.top);
      rg.addColorStop(0.55, pal.body);
      rg.addColorStop(1, 'rgba(0,0,0,0.32)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(bx, by, br, br * (0.74 + noise(x + k, y) * 0.3),
                  noise(x + k * 2, y + k) * 3, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.24)';
      ctx.lineWidth = Math.max(1, ts * 0.03);
      ctx.stroke();
    }
    if (pal.fleck && noise(x, y) > 0.72) {
      // the odd glint of something in the rock, so a wall is not uniform
      ctx.fillStyle = pal.fleck;
      ctx.beginPath();
      ctx.arc(sx + ts * (0.2 + noise(x, y * 2) * 0.6),
              sy + ts * (0.25 + noise(x * 2, y) * 0.55),
              ts * 0.05, 0, 6.3);
      ctx.fill();
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
