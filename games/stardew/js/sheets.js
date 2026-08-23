/*
 * sheets.js - sprite sheets, and the one place that knows how they are cut up.
 *
 * Everything in this game was drawn from shapes in code until now. The owner
 * supplied real pixel art, so the drawing moves here; js/art.js stays as the
 * fallback for anything a sheet does not cover, and as what gets used if an
 * image never arrives. That fallback is not politeness - a game that renders
 * nothing because one PNG 404'd is worse than one that renders plainly.
 *
 * Credits, per the packs' own readmes:
 *   Cute Fantasy (free)              - characters, animals, trees, tiles
 *   Top-Down Retro Interior          - interior floors, walls, doors, furniture
 *   Tiny Wonder Farm (free)          - farm objects and plants
 *   stardew_V3                       - item icons, drawn by the project owner
 *
 * LAYOUT NOTES, measured rather than assumed (a grid was drawn over each sheet
 * and looked at):
 *   player.png   32x32 cells, 6 columns x 10 rows
 *     row 0,1,2  idle   facing down / side / up
 *     row 3,4,5  walk   facing down / side / up
 *     row 6,7,8  swing  facing down / side / up   (4 frames)
 *     row 9      collapse
 *   Left is the side row mirrored - the sheet only draws right.
 */
(function (global) {
  'use strict';

  var BASE = 'art/';
  var FILES = [
    'player', 'player_actions', 'tree', 'tree_small', 'chest', 'fences',
    'decor', 'house', 'tile_grass', 'tile_path', 'tile_water',
    'tile_farmland', 'tile_water_edge', 'tile_path_edge', 'tile_cliff',
    'tile_beach', 'animal_chicken', 'animal_cow', 'animal_pig', 'animal_sheep',
    'foe_slime', 'foe_skeleton', 'in_floorwall', 'in_doors', 'in_furniture',
    'in_small', 'farm_objects', 'farm_plants', 'farm_inside'
  ];

  var img = {};
  var loaded = 0, failed = 0;

  function load(v) {
    for (var i = 0; i < FILES.length; i++) {
      (function (name) {
        var im = new Image();
        im.onload = function () { img[name] = im; loaded++; };
        /* A missing sheet must not take the game with it. The name simply
         * stays absent, `has()` answers false, and the caller draws its shape
         * version instead. */
        im.onerror = function () { failed++; };
        im.src = BASE + name + '.png' + (v ? '?v=' + v : '');
      }(FILES[i]));
    }
  }

  function has(name) { return !!img[name]; }
  function status() {
    return { total: FILES.length, loaded: loaded, failed: failed,
             ready: loaded + failed >= FILES.length };
  }

  /* One cell out of a sheet, drawn into a box on the world canvas.
   * `flip` mirrors horizontally, which is how left-facing is produced from a
   * sheet that only contains right-facing. */
  function cell(ctx, name, cw, ch, col, row, dx, dy, dw, dh, flip) {
    var im = img[name];
    if (!im) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(im, col * cw, row * ch, cw, ch, 0, 0, dw, dh);
    } else {
      ctx.drawImage(im, col * cw, row * ch, cw, ch, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  /* A whole sheet drawn as one picture (trees, houses - things that are not a
   * grid of frames). */
  function whole(ctx, name, dx, dy, dw, dh) {
    var im = img[name];
    if (!im) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }

  function size(name) {
    var im = img[name];
    return im ? { w: im.width, h: im.height } : null;
  }

  /* ------------------------------------------------------------- tinting
   *
   * There is ONE character sheet and forty villagers. Recolouring it per
   * villager is what keeps "phải có nét riêng giữa mỗi npc để dễ phân biệt"
   * true now that everybody shares a body.
   *
   * Deliberately a hue-and-warmth shift rather than a flat colour wash: a wash
   * turns a character into a silhouette and throws away the shading that makes
   * the sprite readable. `source-atop` keeps the alpha, `overlay` keeps the
   * light and dark, and the result still looks like a person wearing something
   * of that colour. Each tint is built once and kept.
   */
  var tinted = {};
  function tint(name, colour) {
    var key = name + '|' + colour;
    if (tinted[key]) return tinted[key];
    var im = img[name];
    if (!im) return null;
    var c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = 0.55;
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.globalAlpha = 1;
    x.drawImage(im, 0, 0);
    tinted[key] = c;
    return c;
  }

  function tintedCell(ctx, name, colour, cw, ch, col, row, dx, dy, dw, dh, flip) {
    var c = colour ? tint(name, colour) : img[name];
    if (!c) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(c, col * cw, row * ch, cw, ch, 0, 0, dw, dh);
    } else {
      ctx.drawImage(c, col * cw, row * ch, cw, ch, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  /* ------------------------------------------------------------- a person
   *
   * `face` picks the row group, `moving` picks idle or walk, and `frame` is a
   * running count the caller already keeps for its old animation. The sprite is
   * drawn standing ON the tile: its feet land on `cy`, not its middle, or every
   * character floats half a tile above the ground they are supposed to be on.
   */
  var PLAYER_CELL = 32;
  var ROW = { down: 0, right: 1, left: 1, up: 2 };

  function person(ctx, cx, cy, ts, opts) {
    opts = opts || {};
    if (!img.player) return false;
    var face = opts.face || 'down';
    var row = ROW[face] + (opts.moving ? 3 : 0);
    var col = Math.floor(opts.frame || 0) % 6;
    if (opts.swing) { row = 6 + ROW[face]; col = Math.floor(opts.frame || 0) % 4; }
    var scale = ts / 16;                    // the world is 16px to a tile
    var w = PLAYER_CELL * scale, h = PLAYER_CELL * scale;
    var dx = Math.round(cx - w / 2);
    var dy = Math.round(cy - h + ts * 0.28);
    return tintedCell(ctx, 'player', opts.colour, PLAYER_CELL, PLAYER_CELL,
                      col, row, dx, dy, w, h, face === 'left');
  }

  global.SDV_SHEETS = {
    load: load, has: has, status: status, cell: cell, whole: whole,
    size: size, person: person, tint: tint, tintedCell: tintedCell,
    FILES: FILES
  };
}(window));
