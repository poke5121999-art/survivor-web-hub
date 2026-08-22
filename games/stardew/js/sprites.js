/*
 * sprites.js - every pixel in this game is drawn by code, no image files.
 *
 * Two layers:
 *   1. Hand-authored sprites for the ~40 things the player looks at constantly
 *      (player, trees, rocks, soil, water, buildings, villagers). Written as
 *      character grids so they stay editable as pictures, not as draw calls.
 *   2. A procedural icon generator for the 353 inventory items. Hand-drawing
 *      353 icons is not realistic, and a category-shape + name-hash-palette
 *      icon is stable across runs and distinguishable at a glance.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- palette
  var PAL = {
    '.': null,              // transparent
    k: '#20161c', K: '#3a2b33',
    w: '#f4f0e6', W: '#ffffff',
    s: '#e8b08a', S: '#c98a63',   // skin
    h: '#7a4a2b', H: '#4e2f1c',   // hair / dark wood
    b: '#3f6fb5', B: '#28497d',   // blue cloth
    r: '#c0453b', R: '#8a2f28',   // red
    g: '#5fa855', G: '#3d7a38',   // green
    G2: '#2c5a2a',
    y: '#e8c357', Y: '#b8912f',   // yellow
    o: '#d8813c', O: '#a55c26',   // orange
    p: '#a366c4', P: '#6f3f8a',   // purple
    c: '#63c7d8', C: '#3b8fa5',   // cyan
    n: '#8b6b4a', N: '#5e4630',   // brown/soil
    m: '#7d7d86', M: '#55555d',   // stone grey
    e: '#d9d2c2',                 // bone / light grey
    t: '#4e8f3f'                  // grass
  };

  function grid(rows, extra) {
    var pal = PAL;
    if (extra) { pal = Object.create(PAL); for (var k in extra) pal[k] = extra[k]; }
    return { rows: rows, pal: pal, w: rows[0].length, h: rows.length };
  }

  // Draw a character grid at (x,y) with each cell `px` screen pixels.
  function blit(ctx, sp, x, y, px, flip) {
    px = px || 1;
    for (var j = 0; j < sp.h; j++) {
      var row = sp.rows[j];
      for (var i = 0; i < sp.w; i++) {
        var c = sp.pal[row[i]];
        if (!c) continue;
        var ix = flip ? (sp.w - 1 - i) : i;
        ctx.fillStyle = c;
        ctx.fillRect(x + ix * px, y + j * px, px, px);
      }
    }
  }

  // ---------------------------------------------------------------- people
  // 12x16 body, four facing directions, two walk frames each.
  function person(hair, shirt, hair2, shirtDark) {
    var ex = { '1': hair, '2': hair2 || hair, '3': shirt, '4': shirtDark || shirt };
    var down0 = grid([
      '....1111....',
      '...111111...',
      '..11111111..',
      '..1ssssss1..',
      '..1sksksss..',
      '..1ssssss1..',
      '...ssssss...',
      '...333333...',
      '..s333333s..',
      '..s334433s..',
      '..s333333s..',
      '...333333...',
      '...BB..BB...',
      '...BB..BB...',
      '...kk..kk...',
      '...kk..kk...'], ex);
    var down1 = grid([
      '....1111....',
      '...111111...',
      '..11111111..',
      '..1ssssss1..',
      '..1sksksss..',
      '..1ssssss1..',
      '...ssssss...',
      '...333333...',
      '..s333333s..',
      '..s334433s..',
      '..s333333s..',
      '...333333...',
      '..BB....BB..',
      '..BB....BB..',
      '..kk....kk..',
      '...kk..kk...'], ex);
    var up0 = grid([
      '....1111....',
      '...111111...',
      '..11111111..',
      '..11111111..',
      '..11111111..',
      '..11111111..',
      '...111111...',
      '...333333...',
      '..s333333s..',
      '..s333333s..',
      '..s333333s..',
      '...333333...',
      '...BB..BB...',
      '...BB..BB...',
      '...kk..kk...',
      '...kk..kk...'], ex);
    var up1 = grid([
      '....1111....',
      '...111111...',
      '..11111111..',
      '..11111111..',
      '..11111111..',
      '..11111111..',
      '...111111...',
      '...333333...',
      '..s333333s..',
      '..s333333s..',
      '..s333333s..',
      '...333333...',
      '..BB....BB..',
      '..BB....BB..',
      '..kk....kk..',
      '...kk..kk...'], ex);
    var side0 = grid([
      '....1111....',
      '...111111...',
      '...1111111..',
      '...1sssss1..',
      '...1skssss..',
      '...1sssss1..',
      '....sssss...',
      '....3333s...',
      '...33333s...',
      '...344433...',
      '...333333...',
      '....3333....',
      '....BBB.....',
      '....BBB.....',
      '....kkk.....',
      '...kkkk.....'], ex);
    var side1 = grid([
      '....1111....',
      '...111111...',
      '...1111111..',
      '...1sssss1..',
      '...1skssss..',
      '...1sssss1..',
      '....sssss...',
      '....3333s...',
      '...33333s...',
      '...344433...',
      '...333333...',
      '....3333....',
      '...BB.BB....',
      '...BB.BB....',
      '...kk.kk....',
      '..kkk..kk...'], ex);
    return {
      down: [down0, down1], up: [up0, up1],
      left: [side0, side1], right: [side0, side1]
    };
  }

  // ---------------------------------------------------------------- world
  var SP = {
    tree: grid([
      '.....GGG.....',
      '...GGgggGG...',
      '..GggggggGG..',
      '.GgggtttgggG.',
      '.GggtttttggG.',
      'GgggtttttgggG',
      'GggtttttttggG',
      '.GggtttttggG.',
      '..GgggtggggG.',
      '...GGgggGG...',
      '.....HHH.....',
      '.....HNH.....',
      '.....HNH.....',
      '....HHNHH....'], {}),
    stump: grid([
      '.....HHH.....',
      '....HHNHH....',
      '....HNNNH....',
      '....HHHHH....'], {}),
    rock: grid([
      '..mmmm..',
      '.mMmmMm.',
      'mmmmmmmm',
      'mMmmmmMm',
      'mmmmmmmm',
      '.MmmmmM.'], {}),
    oreRock: grid([
      '..mmmm..',
      '.mMooMm.',
      'mmoommmm',
      'mMmmoomm',
      'mmoommmm',
      '.MmmmmM.'], {}),
    grassTuft: grid([
      '..t..t..',
      '.tt.ttt.',
      'ttttttt.',
      '.GG.GG..'], {}),
    weed: grid([
      '...g....',
      '.g.g.g..',
      '.ggggg..',
      '..gGg...'], {}),
    stick: grid([
      '........',
      '..HH....',
      '...HH...',
      '....HH..'], {}),
    chest: grid([
      '..oooooo..',
      '.oOoooooO.',
      'oooooooooo',
      'ooyyyyyyoo',
      'ooooyyoooo',
      'oOoooooooO',
      '.oooooooo.'], {}),
    furnace: grid([
      '..mmmmmm..',
      '.mMmmmmMm.',
      'mmmrrrrmmm',
      'mmroooormm',
      'mmroooormm',
      'mmmrrrrmmm',
      '.mMmmmmMm.'], {}),
    bin: grid([
      '.HHHHHHHH.',
      'HnnnnnnnnH',
      'HnHHHHHHnH',
      'HnnnnnnnnH',
      'HnHHHHHHnH',
      'HnnnnnnnnH',
      '.HHHHHHHH.'], {}),
    sign: grid([
      '.wwwwww.',
      'wwkkkkww',
      'wwwwwwww',
      'wwkkkkww',
      '.wwwwww.',
      '...HH...',
      '...HH...'], {}),
    bed: grid([
      'wwwwwwwwww',
      'wWWWWWWWWw',
      'wwwwwwwwww',
      'rrrrrrrrrr',
      'rRrrrrrrRr',
      'rrrrrrrrrr',
      'HHHHHHHHHH'], {}),
    tv: grid([
      'kkkkkkkkkk',
      'kccccccccK',
      'kcCcccCcck',
      'kccccccccK',
      'kkkkkkkkkk',
      '..k....k..'], {})
  };

  // ---------------------------------------------------------------- crops
  // Crop stages are generated from the crop's own colour so all 46 read alike
  // but stay distinguishable, and adding a crop needs no new art.
  function drawCrop(ctx, x, y, px, stage, stages, color, ripeColor, trellis) {
    var t = stages <= 1 ? 1 : stage / (stages - 1);
    var h = Math.max(1, Math.round(2 + t * 6));
    ctx.fillStyle = '#3d7a38';
    if (trellis) {
      ctx.fillStyle = '#8b6b4a';
      ctx.fillRect(x + 3 * px, y + (10 - h) * px, px, h * px);
      ctx.fillRect(x + 8 * px, y + (10 - h) * px, px, h * px);
      ctx.fillStyle = '#3d7a38';
      for (var i = 0; i < h; i += 2) {
        ctx.fillRect(x + 3 * px, y + (10 - h + i) * px, 6 * px, px);
      }
    } else {
      ctx.fillRect(x + 5 * px, y + (10 - h) * px, 2 * px, h * px);
      for (var j = 1; j < h; j += 2) {
        ctx.fillRect(x + 3 * px, y + (10 - j) * px, 2 * px, px);
        ctx.fillRect(x + 7 * px, y + (10 - j) * px, 2 * px, px);
      }
    }
    if (stage >= stages - 1) {
      ctx.fillStyle = ripeColor || color;
      ctx.fillRect(x + 4 * px, y + (9 - h) * px, 4 * px, 3 * px);
      ctx.fillRect(x + 3 * px, y + (8 - h) * px, 6 * px, px);
    } else if (t > 0.5) {
      ctx.fillStyle = color;
      ctx.fillRect(x + 5 * px, y + (9 - h) * px, 2 * px, 2 * px);
    }
  }

  // ---------------------------------------------------------------- icons
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  var CAT_HUE = {
    crop: [70, 140], fruit: [330, 40], fish: [180, 220], mineral: [250, 320],
    artifact: [25, 45], cooked: [15, 50], crafted: [200, 260], artisan: [280, 340],
    resource: [20, 60], seed: [80, 130], tool: [190, 230],
    forage: [90, 160], fallback: [0, 360]
  };

  function iconColors(name, cat) {
    var h = hash(name);
    var range = CAT_HUE[cat] || CAT_HUE.fallback;
    var span = (range[1] - range[0] + 360) % 360 || 360;
    var hue = (range[0] + (h % span)) % 360;
    var sat = 45 + ((h >> 8) % 35);
    var lit = 42 + ((h >> 16) % 22);
    return {
      main: 'hsl(' + hue + ',' + sat + '%,' + lit + '%)',
      dark: 'hsl(' + hue + ',' + sat + '%,' + Math.max(12, lit - 20) + '%)',
      light: 'hsl(' + hue + ',' + sat + '%,' + Math.min(88, lit + 22) + '%)'
    };
  }

  /* Shape per category so a fish never reads as a gem, plus a name-derived
   * palette so two fish never read as each other. */
  function drawIcon(ctx, name, cat, x, y, size) {
    var c = iconColors(name || '?', cat);
    var u = size / 16;
    var h = hash(name || '?');
    ctx.save();
    ctx.translate(x, y);
    function rect(a, b, w, hh, col) {
      ctx.fillStyle = col; ctx.fillRect(a * u, b * u, w * u, hh * u);
    }
    switch (cat) {
      case 'fish':
        rect(2, 6, 9, 5, c.main);
        rect(3, 5, 7, 1, c.light);
        rect(11, 5, 3, 7, c.dark);          // tail
        rect(4, 7, 1, 1, '#20161c');        // eye
        rect(5, 10, 4, 1, c.dark);
        break;
      case 'mineral':
        rect(6, 2, 4, 2, c.light);
        rect(4, 4, 8, 6, c.main);
        rect(6, 10, 4, 3, c.dark);
        rect(6, 4, 2, 4, c.light);
        break;
      case 'artifact':
        rect(4, 3, 8, 10, c.main);
        rect(5, 4, 6, 2, c.dark);
        rect(6, 7, 4, 4, c.light);
        break;
      case 'cooked':
        rect(2, 9, 12, 3, '#e8e2d4');       // plate
        rect(4, 5, 8, 4, c.main);
        rect(5, 4, 6, 2, c.light);
        break;
      case 'artisan':
        rect(6, 2, 4, 3, c.dark);           // bottle neck
        rect(4, 5, 8, 9, c.main);
        rect(5, 8, 6, 4, c.light);
        break;
      case 'crafted': case 'tool':
        rect(3, 3, 10, 10, c.main);
        rect(5, 5, 6, 6, c.dark);
        rect(6, 6, 4, 4, c.light);
        break;
      case 'seed':
        for (var i = 0; i < 4; i++) {
          var sx = 3 + ((h >> (i * 3)) % 8), sy = 4 + ((h >> (i * 5)) % 8);
          rect(sx, sy, 2, 3, i % 2 ? c.dark : c.main);
        }
        break;
      case 'resource':
        rect(3, 6, 10, 6, c.main);
        rect(3, 5, 10, 1, c.light);
        rect(3, 12, 10, 1, c.dark);
        break;
      case 'fruit':
        rect(5, 4, 6, 8, c.main);
        rect(4, 6, 8, 5, c.main);
        rect(6, 5, 2, 2, c.light);
        rect(7, 2, 2, 3, '#4e2f1c');
        rect(9, 2, 3, 2, '#3d7a38');
        break;
      case 'forage':
        rect(7, 3, 2, 5, '#3d7a38');
        rect(4, 7, 8, 5, c.main);
        rect(5, 6, 3, 2, c.light);
        rect(2, 5, 3, 3, '#5fa855');
        rect(11, 5, 3, 3, '#5fa855');
        break;
      default: // crop
        rect(6, 8, 4, 6, c.main);
        rect(4, 5, 8, 4, c.main);
        rect(5, 4, 3, 2, c.light);
        rect(3, 3, 3, 4, '#3d7a38');
        rect(10, 3, 3, 4, '#3d7a38');
        break;
    }
    ctx.restore();
  }

  global.SDV_SPRITES = {
    PAL: PAL, grid: grid, blit: blit, person: person, SP: SP,
    drawCrop: drawCrop, drawIcon: drawIcon, iconColors: iconColors, hash: hash
  };
})(window);
