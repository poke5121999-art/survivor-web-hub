/*
 * intro.js - the arrival.
 *
 * A new game used to drop the player in the middle of a field with 500g and no
 * idea who anyone was. The original opens with a scene, and the owner asked for
 * it: "mới vô phải có 1 cutsceen như trong game, xong thì player ở trong nhà và
 * có 15 bịch hạt giống free".
 *
 * The beats and the lines below are the game's own opening event (BusStop
 * 60367, read out of Data/Events/BusStop.json in the installed copy): the bus
 * pulls in, Robin meets you and walks you to the farm, Lewis welcomes you,
 * Robin calls the cottage "crusty", Lewis points at the shipping bin, and the
 * screen fades on a rooster. Then you wake up indoors - which is where the
 * fifteen parsnip seeds Mayor Lewis leaves for every new farmer are waiting.
 *
 * It is a letterboxed panel over the canvas rather than a scripted camera: on a
 * 9:16 phone screen a walk-and-talk scene reads as two people jittering, and
 * the words are the part worth having.
 */
(function (global) {
  'use strict';

  /* 15 Parsnip Seeds is what the game gives every new farmer on every farm map
   * except Meadowlands - verified against the wiki's Parsnip Seeds page. */
  var STARTER_SEEDS = { item: 'Parsnip Seeds', qty: 15 };

  var BEATS = [
    { who: null, art: 'bus',
      text: 'Chuyến xe buýt cuối cùng thả bạn xuống đầu thung lũng. '
          + 'Cửa xe đóng lại sau lưng, và thành phố ở rất xa.' },
    { who: 'Robin', art: 'robin',
      text: 'Chào! Chắc là bạn rồi.\nTôi là Robin, thợ mộc ở đây. '
          + 'Thị trưởng Lewis nhờ tôi ra đón và dẫn bạn về nhà mới. '
          + 'Ông ấy đang ở đó dọn dẹp chờ bạn.' },
    { who: 'Robin', art: 'farm',
      text: 'Nông trại của bạn đây.\nỪ thì hơi rậm rạp một chút, '
          + 'nhưng bên dưới đám đó là đất tốt đấy. '
          + 'Chịu khó một tí là dọn xong ngay thôi.' },
    { who: 'Lewis', art: 'lewis',
      text: 'A, chủ nông trại mới!\nTôi là Lewis, thị trưởng thị trấn Pelican. '
          + 'Cả làng hỏi thăm về bạn suốt. '
          + 'Lâu lắm rồi mới có người mới dọn tới đây.' },
    { who: 'Lewis', art: 'house',
      text: 'Vậy là bạn sẽ ở căn nhà gỗ của ông nội.\n'
          + 'Nhà tốt đấy... rất là "mộc mạc".' },
    { who: 'Robin', art: 'house',
      text: 'Mộc mạc? Cũng là một cách nói...\n'
          + '"Mục nát" thì đúng hơn.' },
    { who: 'Lewis', art: 'bin',
      text: 'Suýt quên. Có gì muốn bán thì bỏ vào cái thùng này. '
          + 'Đêm tôi sẽ đi gom.\n'
          + 'À, và tôi để sẵn cho bạn 15 gói hạt củ cải trong nhà. '
          + 'Chúc may mắn!' },
    { who: null, art: 'night',
      text: 'Đường xa chắc mệt rồi. Ngủ một giấc đi.\n'
          + 'Mai ra thị trấn chào hỏi mọi người một vòng — '
          + 'dân ở đây quý chuyện đó lắm.' },
    { who: null, art: 'rooster',
      text: 'Xuân, ngày 1. Gà gáy.\nBạn tỉnh dậy trong căn nhà của mình.' }
  ];

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /* Each beat gets a little code-drawn picture, in the same dark-wood register
   * as the game itself, so the scene is not eight screens of plain text. */
  function drawArt(cv, kind) {
    var c = cv.getContext('2d');
    var W = cv.width, H = cv.height, u = W / 64;
    c.imageSmoothingEnabled = false;
    var sky = kind === 'night' ? '#141b28'
            : kind === 'rooster' ? '#3d3550' : '#2b3a46';
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    function r(x, y, w, h, col) { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); }
    // ground
    r(0, 26, 64, 12, kind === 'bus' ? '#4a4038' : '#3c6b33');
    r(0, 26, 64, 1, 'rgba(255,255,255,0.10)');
    switch (kind) {
      case 'bus':
        r(8, 12, 40, 14, '#4a6b52'); r(8, 10, 40, 3, '#5c8264');
        r(12, 15, 8, 6, '#8fb8cf'); r(24, 15, 8, 6, '#8fb8cf');
        r(36, 15, 8, 6, '#8fb8cf');
        r(13, 26, 6, 5, '#1c1c22'); r(38, 26, 6, 5, '#1c1c22');
        r(15, 27, 2, 3, '#3a3a44'); r(40, 27, 2, 3, '#3a3a44');
        break;
      case 'robin': case 'lewis': {
        var hair = kind === 'robin' ? '#c85a1e' : '#6b4a30';
        var shirt = kind === 'robin' ? '#3f7a4a' : '#b8912f';
        r(26, 8, 12, 8, hair); r(27, 14, 10, 7, '#e8b08a');
        r(29, 17, 2, 2, '#20161c'); r(34, 17, 2, 2, '#20161c');
        r(24, 21, 16, 11, shirt); r(24, 21, 16, 2, 'rgba(255,255,255,0.14)');
        break;
      }
      case 'farm':
        r(0, 20, 64, 8, '#335c2c');
        for (var t = 0; t < 6; t++) {
          r(4 + t * 10, 14, 6, 8, '#2c4f26'); r(6 + t * 10, 21, 2, 5, '#43301f');
        }
        r(6, 30, 8, 4, '#5e442e'); r(30, 31, 10, 3, '#5e442e');
        break;
      case 'house':
        r(18, 16, 28, 14, '#5f452e'); r(16, 8, 32, 9, '#8a4a3a');
        r(16, 8, 32, 2, '#a35a45');
        r(28, 21, 8, 9, '#3a2717'); r(33, 25, 2, 2, '#d9b558');
        r(21, 19, 5, 5, '#7fa8bd'); r(38, 19, 5, 5, '#7fa8bd');
        break;
      case 'bin':
        r(22, 18, 20, 12, '#5e442e'); r(20, 15, 24, 4, '#7a5c3e');
        r(22, 22, 20, 1, '#43301f'); r(22, 26, 20, 1, '#43301f');
        break;
      case 'night':
        for (var s = 0; s < 26; s++) {
          r((s * 7919) % 62 + 1, (s * 104729) % 20 + 2, 1, 1, '#e8e8f0');
        }
        r(46, 4, 8, 8, '#f0e3c2');
        r(18, 16, 28, 14, '#4a3524'); r(16, 8, 32, 9, '#6b3a2e');
        r(28, 21, 8, 9, '#2a1c12'); r(21, 19, 5, 5, '#f2c565');
        break;
      case 'rooster':
        r(0, 0, 64, 26, '#4a3550'); r(0, 18, 64, 8, '#8a5a3c');
        r(44, 6, 10, 10, '#f0c95e');
        r(20, 14, 12, 10, '#c0453b'); r(28, 8, 8, 8, '#c0453b');
        r(34, 10, 4, 2, '#e8c357'); r(30, 5, 5, 4, '#8a2f28');
        r(31, 10, 2, 2, '#20161c');
        break;
      default: break;
    }
    // letterbox bars, so it reads as a scene and not as a screenshot
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, u * 2); c.fillRect(0, H - u * 2, W, u * 2);
  }

  /* Runs the scene, then calls done(). Skippable - a cutscene you cannot skip
   * is a cutscene you resent on the second playthrough. */
  function play(stage, done) {
    var wrap = el('div', 'sdv-intro');
    var art = document.createElement('canvas');
    art.className = 'sdv-introart';
    art.width = 320; art.height = 190;
    var who = el('div', 'sdv-introwho');
    var body = el('div', 'sdv-introtext');
    var next = el('button', 'sdv-mbtn', 'Tiếp ▸');
    var skip = el('button', 'sdv-introskip', 'Bỏ qua');
    var dots = el('div', 'sdv-introdots');
    wrap.appendChild(skip);
    wrap.appendChild(art);
    wrap.appendChild(who);
    wrap.appendChild(body);
    wrap.appendChild(dots);
    wrap.appendChild(next);
    stage.appendChild(wrap);

    var i = 0;
    function show() {
      var b = BEATS[i];
      drawArt(art, b.art);
      who.textContent = b.who || '';
      who.style.visibility = b.who ? 'visible' : 'hidden';
      body.textContent = b.text;
      dots.textContent = (i + 1) + ' / ' + BEATS.length;
      next.textContent = i === BEATS.length - 1 ? 'Bắt đầu ▸' : 'Tiếp ▸';
    }
    function finish() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      done();
    }
    next.addEventListener('click', function () {
      i++;
      if (i >= BEATS.length) return finish();
      show();
    });
    skip.addEventListener('click', finish);
    show();
  }

  /* What the scene leaves behind: the player indoors, and Lewis's parting gift
   * actually in the bag. */
  function applyStart(game) {
    var house = game.world.areas.house;
    if (house) {
      var bed = house.objs.filter(function (o) { return o.kind === 'bed'; })[0];
      var spot = bed ? house.nearestFree(bed.x, bed.y + 1, 6)
                     : house.nearestFree(Math.floor(house.w / 2), house.h - 3, 8);
      game.world.current = 'house';
      game.player.x = spot.x + 0.5;
      game.player.y = spot.y + 0.5;
      game.player.face = 'down';
      /* Standing on the way out would walk the player straight back onto the
       * farm on their first step. */
      game.cameFrom = 'farm';
      game.arrivedX = game.player.x;
      game.arrivedY = game.player.y;
    }
    if (!game.sim.count(STARTER_SEEDS.item)) {
      game.sim.give(STARTER_SEEDS.item, STARTER_SEEDS.qty);
    }
    game.toast('Thị trưởng Lewis để lại ' + STARTER_SEEDS.qty + ' gói '
               + 'hạt củ cải cho bạn');
  }

  global.SDV_INTRO = { play: play, applyStart: applyStart,
                       BEATS: BEATS, STARTER_SEEDS: STARTER_SEEDS };
})(window);
