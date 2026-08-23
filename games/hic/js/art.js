/* Vẽ. Mọi thứ trong game được vẽ bằng code, không có file ảnh nào.
 *
 * WHY: game gốc là pixel art kiểu NES, nhưng ảnh của họ là tài sản của họ.
 * Vẽ lại bằng lưới 8x8 vừa giữ được cái nhìn đó vừa không đụng vào asset ai cả.
 * ROOT-CAUSE: hub này chỉ nhận trang tĩnh tự chứa — thêm file ảnh là thêm thứ
 * phải tải, phải bản quyền, phải quản.
 */
(function (global) {
  'use strict';

  /* Bảng màu chung, tông rừng đêm giống các game khác trên hub. */
  var PAL = {
    '.': null,
    a: '#0d1117', b: '#1b2430', c: '#2d3b47', d: '#46586a',
    e: '#6d8296', f: '#9db3c4', g: '#e6eef5',
    h: '#2f5d3a', i: '#3f7a48', j: '#5aa15c', k: '#8ac878',
    l: '#5a3b26', m: '#7d5334', n: '#a8703f', o: '#d09a5c',
    p: '#8c2f2f', q: '#c34141', r: '#e8735a',
    s: '#c8a227', t: '#f2d24b', u: '#fff2a8',
    v: '#3a5fa8', w: '#5b8fd6', x: '#9fd0f5',
    y: '#5b3a72', z: '#8f5fa8',
    '1': '#f0d6b8', '2': '#c9a37a', '3': '#8a6a4a'
  };

  function sprite(rows) { return rows; }

  function draw(ctx, rows, x, y, size) {
    var n = rows.length, px = size / n;
    for (var r = 0; r < n; r++) {
      var line = rows[r];
      for (var c = 0; c < line.length; c++) {
        var col = PAL[line[c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + c * px, y + r * px, Math.ceil(px), Math.ceil(px));
      }
    }
  }

  /* ------------------------------------------------------------------ tiles */

  var S = {
    grass: sprite([
      'hhhhhhhh', 'hihhhhih', 'hhhhihhh', 'hhihhhhh',
      'hhhhhhih', 'hihhhhhh', 'hhhhihhh', 'hhhhhhhh']),
    flower: sprite([
      'hhhhhhhh', 'hhhtthhh', 'hhtuthhh', 'hhhtthhh',
      'hhhihhhh', 'hihhhhih', 'hhhhihhh', 'hhhhhhhh']),
    path: sprite([
      'mmmmmmmm', 'mnmmmnmm', 'mmmnmmmm', 'mnmmmmnm',
      'mmmmnmmm', 'mnmmmmmm', 'mmmnmmnm', 'mmmmmmmm']),
    tree: sprite([
      'hhijjihh', 'hijjjjih', 'ijjkkjji', 'jjkkkkjj',
      'ijjkkjji', 'hijjjjih', 'hhhmmhhh', 'hhhmmhhh']),
    rock: sprite([
      'hhhhhhhh', 'hhddddhh', 'hdeeeedh', 'deeffeed',
      'deeeeeed', 'hdeeeedh', 'hhddddhh', 'hhhhhhhh']),
    water: sprite([
      'vvvvvvvv', 'vwvvvvwv', 'vvvwwvvv', 'vwvvvvvw',
      'vvvvwvvv', 'vwvvvvwv', 'vvvwvvvv', 'vvvvvvvv'])
  };

  var TILE_SPRITE = [S.grass, S.tree, S.water, S.rock, S.path, S.flower];

  /* ---------------------------------------------------------------- người & quái */

  var HERO = sprite([
    '...ss...', '..1111..', '..1a1a..', '..1111..',
    '.pppppp.', 'ppp11ppp', '.mm..mm.', '.mm..mm.']);

  var MOB = {
    wolf: sprite(['........', 'd..dd..d', 'ddddddddd'.slice(0, 8), 'drdddrd.', 'dddddddd', '.dddddd.', '.d.dd.d.', '..d..d..']),
    bat: sprite(['........', 'y..yy..y', 'yyyyyyyy', 'yqyyyqy.', '.yyyyyy.', '..yyyy..', '...yy...', '........']),
    spider: sprite(['a..aa..a', '.a.aa.a.', '..aaaa..', '.arrrra.', '..aaaa..', '.a.aa.a.', 'a..aa..a', '........']),
    bear: sprite(['.l....l.', 'llllllll', 'lmlmmlml', 'lmrmmrml', 'llmmmmll', 'llllllll', '.ll..ll.', '.ll..ll.']),
    hedgehog: sprite(['..dddd..', '.dddddd.', 'dddeeddd', 'dde11edd', 'deeeeeed', '.dddddd.', '..dddd..', '........']),
    raven: sprite(['........', '..aaaa..', '.aaaaaa.', 'aatataa.', '.aaaaaa.', '..aaaa..', '...aa...', '..s..s..']),
    boss: sprite(['.pppppp.', 'pppppppp', 'pqppppqp', 'pptttpp.', 'pppppppp', '.pppppp.', '.pp..pp.', '.pp..pp.']),
    giant: sprite(['..cccc..', '.cccccc.', 'ccxccxcc', 'cccccccc', '.cccccc.', 'cccccccc', '.cc..cc.', '.cc..cc.']),
    golem: sprite(['..dddd..', '.dddddd.', 'ddtddtdd', 'dddddddd', '.dddddd.', 'dd.dd.dd', '.dd..dd.', '.dd..dd.']),
    tree: sprite(['..iiii..', '.iikkii.', 'iikkkkii', 'iikrrkii', '.iikkii.', '..mmmm..', '..mmmm..', '..mmmm..']),
    abom: sprite(['a.a..a.a', '.aaaaaa.', 'aarraraa', 'araaaara', 'aarrrraa', '.aaaaaa.', 'a.a..a.a', '..a..a..'])
  };

  function mobArt(name) {
    var n = name.toLowerCase();
    if (n.indexOf('wolf') >= 0) return MOB.wolf;
    if (n.indexOf('bat') >= 0) return MOB.bat;
    if (n.indexOf('spider') >= 0) return MOB.spider;
    if (n.indexOf('bear') >= 0 || n.indexOf('honeybear') >= 0) return MOB.bear;
    if (n.indexOf('hedgehog') >= 0) return MOB.hedgehog;
    if (n.indexOf('raven') >= 0) return MOB.raven;
    if (n.indexOf('giant') >= 0 || n.indexOf('griffin') >= 0) return MOB.giant;
    if (n.indexOf('golem') >= 0 || n.indexOf('troll') >= 0) return MOB.golem;
    if (n.indexOf('treant') >= 0 || n.indexOf('leshen') >= 0 || n.indexOf('brittlebark') >= 0) return MOB.tree;
    if (n.indexOf('abomination') >= 0) return MOB.abom;
    return MOB.boss;
  }

  /* ------------------------------------------------------------- sự kiện ô */

  var EV = {
    chest: sprite(['........', '.nnnnnn.', '.noooon.', '.nssssn.', '.noooon.', '.nnnnnn.', '........', '........']),
    jewel: sprite(['........', '..wwww..', '.wxxxxw.', 'wxxwwxxw', '.wxxxxw.', '..wwww..', '...ww...', '........']),
    grave: sprite(['..dddd..', '.dffffd.', '.dfaafd.', '.dffffd.', '.dddddd.', '..hhhh..', '.hhhhhh.', '........']),
    anvil: sprite(['........', '..dddd..', '.dddddd.', 'dddddddd', '..dddd..', '..dddd..', '.dddddd.', '........']),
    oil: sprite(['...mm...', '...mm...', '..jjjj..', '.jjjjjj.', '.jjjjjj.', '.jjjjjj.', '..jjjj..', '........']),
    merchant: sprite(['..1111..', '..1a1a..', '..1111..', '.zzzzzz.', 'zzz11zzz', '.zz..zz.', '.mm..mm.', '........']),
    fire: sprite(['........', '...t....', '..tut...', '.tuuut..', 'truuurt.', '.rrrrr..', '.mmmmm..', '........']),
    house: sprite(['...pp...', '..pppp..', '.pppppp.', 'pppppppp', 'nnnnnnnn', 'nn.tt.nn', 'nn.tt.nn', 'nnnnnnnn']),
    golem: sprite(['..dddd..', '.dtddtd.', '.dddddd.', 'dd.dd.dd', '.dddddd.', '.dd..dd.', '.dd..dd.', '........']),
    cauldron: sprite(['........', '.jjjjjj.', '.jkkkkj.', 'cjjjjjjc', '.cccccc.', '..cccc..', '..c..c..', '........']),
    tower: sprite(['...t....', '..mmmm..', '..mmmm..', '..mmmm..', '.mmmmmm.', '.mmmmmm.', 'mmmmmmmm', '........']),
    well: sprite(['........', '.mmmmmm.', 'm.wwww.m', 'm.wxxw.m', 'mmwwwwmm', '.mmmmmm.', '.mmmmmm.', '........'])
  };

  /* -------------------------------------------------------------------- API */

  global.HIC_ART = {
    PAL: PAL,
    draw: draw,
    tile: function (ctx, kind, x, y, s) { draw(ctx, TILE_SPRITE[kind] || S.grass, x, y, s); },
    hero: function (ctx, x, y, s) { draw(ctx, HERO, x, y, s); },
    mob: function (ctx, name, x, y, s) { draw(ctx, mobArt(name), x, y, s); },
    event: function (ctx, icon, x, y, s) { draw(ctx, EV[icon] || EV.chest, x, y, s); },
    mobArt: mobArt,
    EV: EV
  };

  /* Ảnh nhỏ cho danh sách đồ / bảng trận: vẽ vào một canvas rời rồi trả về. */
  global.HIC_iconCanvas = function (kind, key, px) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = px || 32;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (kind === 'mob') global.HIC_ART.mob(ctx, key, 0, 0, cv.width);
    else if (kind === 'event') global.HIC_ART.event(ctx, key, 0, 0, cv.width);
    else global.HIC_ART.hero(ctx, 0, 0, cv.width);
    return cv;
  };
})(window);
