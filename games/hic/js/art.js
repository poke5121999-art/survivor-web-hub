/* Vẽ. Mọi thứ trong game được vẽ bằng code, không có file ảnh nào.
 *
 * BẢN THỨ BA. Hai bản trước đều là pixel art trên lưới ô vuông; người chơi nói
 * thẳng: "đừng pixel nữa, đau mắt quá". Cho nên file này bỏ hẳn lưới pixel và
 * chuyển sang **hình vector**: đường cong, bo tròn, viền mềm, khử răng cưa.
 *
 * ROOT-CAUSE của việc đau mắt: pixel art phóng to trên màn hình mật độ cao thì
 * mỗi "điểm ảnh" thành một ô vuông cứng 3-4 pixel thật, và cả màn hình đầy cạnh
 * răng cưa tương phản cao. Mắt phải làm việc để ghép chúng lại thành hình.
 *
 * Ba luật của bản này:
 *   1. Không có lưới. Mọi hình là đường cong hoặc đa giác bo góc.
 *   2. Viền mềm và TỐI HƠN thân một bậc, không phải đen tuyền. Viền để tách
 *      hình khỏi nền, không phải để gào lên.
 *   3. Bảng màu dịu, độ sáng chênh nhau vừa đủ. Chỗ duy nhất được phép chói là
 *      thứ người chơi phải chú ý: ô bấm được, và dấu quái đã thấy bạn.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------ bảng màu */

  var C = {
    ink: '#1a2430',
    grass: '#3f6b4a', grassHi: '#4d8058', grassLo: '#2f5239',
    dirt: '#8a6a48', dirtHi: '#a07f58', dirtLo: '#6a5136',
    water: '#3b6fa8', waterHi: '#5b93cf', waterLo: '#2a5280',
    leaf: '#4e9e5c', leafHi: '#69bd76', leafLo: '#367445',
    bark: '#6b4a2f', barkLo: '#4d3520',
    rock: '#7b8a99', rockHi: '#98a7b5', rockLo: '#5a6874',
    skin: '#f0cfae', skinLo: '#d4ab84',
    hair: '#e8b84b',
    tunic: '#c9463f', tunicLo: '#96302b',
    steel: '#d5dde6', steelLo: '#98a6b4',
    gold: '#f0c04a', goldLo: '#b98d22',
    blue: '#5b8fd6', blueLo: '#37619c',
    purple: '#9a6fd0', purpleLo: '#6b478f',
    red: '#d9524a', redLo: '#96302b',
    bone: '#e8e2d4', boneLo: '#b5ae9d',
    shadow: 'rgba(8,14,20,.35)'
  };

  /* ---------------------------------------------------------- nguyên thuỷ */

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
  }
  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  /* Tô rồi viền. Viền luôn là màu tối hơn của chính thân, nên hình có khối mà
     không có cạnh đen gắt. */
  function paint(ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ nền */

  function ground(ctx, kind, x, y, s) {
    if (kind === 'water') {
      ctx.fillStyle = C.water;
      ctx.fillRect(x, y, s + 1, s + 1);
      ctx.strokeStyle = C.waterHi;
      ctx.lineWidth = Math.max(1, s * 0.045);
      ctx.lineCap = 'round';
      for (var i = 0; i < 2; i++) {
        var wy = y + s * (0.34 + i * 0.30);
        ctx.beginPath();
        ctx.moveTo(x + s * 0.18, wy);
        ctx.quadraticCurveTo(x + s * 0.34, wy - s * 0.07, x + s * 0.5, wy);
        ctx.quadraticCurveTo(x + s * 0.66, wy + s * 0.07, x + s * 0.82, wy);
        ctx.stroke();
      }
      return;
    }
    if (kind === 'dirt') {
      ctx.fillStyle = C.dirt;
      ctx.fillRect(x, y, s + 1, s + 1);
      ctx.fillStyle = C.dirtHi;
      ellipse(ctx, x + s * 0.32, y + s * 0.34, s * 0.10, s * 0.06);
      ctx.fill();
      ellipse(ctx, x + s * 0.70, y + s * 0.68, s * 0.08, s * 0.05);
      ctx.fill();
      return;
    }
    ctx.fillStyle = C.grass;
    ctx.fillRect(x, y, s + 1, s + 1);
    // vài nhánh cỏ rất nhạt: đủ để mặt đất không phẳng lì, không đủ để thành vệt
    ctx.strokeStyle = 'rgba(122,168,132,.38)';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.lineCap = 'round';
    var tufts = [[0.26, 0.70], [0.62, 0.44], [0.78, 0.80]];
    for (var t = 0; t < tufts.length; t++) {
      var tx = x + s * tufts[t][0], ty = y + s * tufts[t][1];
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + s * 0.03, ty - s * 0.09, tx + s * 0.07, ty - s * 0.12);
      ctx.stroke();
    }
  }

  /* Lớp vật đứng trên nền. Vẽ cao hơn ô một chút để có chiều sâu. */

  function tree(ctx, x, y, s) {
    var cx = x + s * 0.5;
    ctx.fillStyle = C.shadow;
    ellipse(ctx, cx, y + s * 0.88, s * 0.30, s * 0.10);
    ctx.fill();
    rrect(ctx, cx - s * 0.075, y + s * 0.55, s * 0.15, s * 0.34, s * 0.05);
    paint(ctx, C.bark, C.barkLo, Math.max(1, s * 0.035));
    circle(ctx, cx - s * 0.18, y + s * 0.42, s * 0.20);
    paint(ctx, C.leafLo, null);
    circle(ctx, cx + s * 0.18, y + s * 0.42, s * 0.20);
    paint(ctx, C.leafLo, null);
    circle(ctx, cx, y + s * 0.30, s * 0.27);
    paint(ctx, C.leaf, C.leafLo, Math.max(1, s * 0.04));
    circle(ctx, cx - s * 0.09, y + s * 0.22, s * 0.10);
    paint(ctx, C.leafHi, null);
  }

  function rock(ctx, x, y, s) {
    var cx = x + s * 0.5;
    ctx.fillStyle = C.shadow;
    ellipse(ctx, cx, y + s * 0.84, s * 0.32, s * 0.09);
    ctx.fill();
    poly(ctx, [
      [cx - s * 0.34, y + s * 0.80], [cx - s * 0.30, y + s * 0.44],
      [cx - s * 0.10, y + s * 0.26], [cx + s * 0.16, y + s * 0.30],
      [cx + s * 0.34, y + s * 0.52], [cx + s * 0.32, y + s * 0.80]
    ]);
    paint(ctx, C.rock, C.rockLo, Math.max(1, s * 0.045));
    poly(ctx, [
      [cx - s * 0.20, y + s * 0.44], [cx - s * 0.08, y + s * 0.31],
      [cx + s * 0.06, y + s * 0.35], [cx - s * 0.06, y + s * 0.50]
    ]);
    paint(ctx, C.rockHi, null);
  }

  function flower(ctx, x, y, s) {
    var cx = x + s * 0.5, cy = y + s * 0.62;
    s = s * 0.72;   // hoa nhỏ lại, nó là trang trí chứ không phải mục tiêu
    ctx.strokeStyle = C.leafLo;
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(cx, y + s * 0.82);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2 - Math.PI / 2;
      circle(ctx, cx + Math.cos(a) * s * 0.10, cy + Math.sin(a) * s * 0.10, s * 0.075);
      paint(ctx, C.red, null);
    }
    circle(ctx, cx, cy, s * 0.065);
    paint(ctx, C.gold, null);
  }

  var OVERLAY = { tree: tree, rock: rock, flower: flower };

  /* ------------------------------------------------------------ nhân vật */

  function hero(ctx, x, y, s) {
    var cx = x + s * 0.5;
    rrect(ctx, cx - s * 0.20, y + s * 0.44, s * 0.40, s * 0.34, s * 0.10);
    paint(ctx, C.tunic, C.tunicLo, Math.max(1, s * 0.045));
    rrect(ctx, cx - s * 0.16, y + s * 0.74, s * 0.13, s * 0.14, s * 0.05);
    paint(ctx, C.barkLo, null);
    rrect(ctx, cx + s * 0.03, y + s * 0.74, s * 0.13, s * 0.14, s * 0.05);
    paint(ctx, C.barkLo, null);
    ctx.strokeStyle = C.steel;
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.24, y + s * 0.66);
    ctx.lineTo(cx + s * 0.36, y + s * 0.24);
    ctx.stroke();
    ctx.strokeStyle = C.goldLo;
    ctx.lineWidth = Math.max(1.5, s * 0.055);
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.17, y + s * 0.68);
    ctx.lineTo(cx + s * 0.29, y + s * 0.62);
    ctx.stroke();
    circle(ctx, cx, y + s * 0.32, s * 0.19);
    paint(ctx, C.skin, C.skinLo, Math.max(1, s * 0.04));
    ctx.beginPath();
    ctx.arc(cx, y + s * 0.32, s * 0.19, Math.PI * 1.06, Math.PI * 1.94);
    ctx.closePath();
    paint(ctx, C.hair, null);
    circle(ctx, cx - s * 0.07, y + s * 0.34, s * 0.026);
    paint(ctx, C.ink, null);
    circle(ctx, cx + s * 0.07, y + s * 0.34, s * 0.026);
    paint(ctx, C.ink, null);
  }

  /* Quái: mỗi con một dáng dễ nhận, dựng từ khối tròn và đa giác. */

  function beast(ctx, x, y, s, o) {
    var cx = x + s * 0.5;
    ellipse(ctx, cx, y + s * 0.62, s * 0.32, s * 0.24);
    paint(ctx, o.body, o.dark, Math.max(1, s * 0.045));
    if (o.legs !== false) {
      rrect(ctx, cx - s * 0.24, y + s * 0.76, s * 0.14, s * 0.14, s * 0.05);
      paint(ctx, o.dark, null);
      rrect(ctx, cx + s * 0.10, y + s * 0.76, s * 0.14, s * 0.14, s * 0.05);
      paint(ctx, o.dark, null);
    }
    var hy = y + s * (o.headY == null ? 0.34 : o.headY);
    circle(ctx, cx, hy, s * (o.head || 0.21));
    paint(ctx, o.body, o.dark, Math.max(1, s * 0.045));
    if (o.ears === 'point') {
      poly(ctx, [[cx - s * 0.20, hy - s * 0.10], [cx - s * 0.24, hy - s * 0.30], [cx - s * 0.06, hy - s * 0.19]]);
      paint(ctx, o.body, o.dark, Math.max(1, s * 0.035));
      poly(ctx, [[cx + s * 0.20, hy - s * 0.10], [cx + s * 0.24, hy - s * 0.30], [cx + s * 0.06, hy - s * 0.19]]);
      paint(ctx, o.body, o.dark, Math.max(1, s * 0.035));
    } else if (o.ears === 'round') {
      circle(ctx, cx - s * 0.19, hy - s * 0.17, s * 0.08);
      paint(ctx, o.body, o.dark, Math.max(1, s * 0.035));
      circle(ctx, cx + s * 0.19, hy - s * 0.17, s * 0.08);
      paint(ctx, o.body, o.dark, Math.max(1, s * 0.035));
    }
    if (o.snout) {
      ellipse(ctx, cx, hy + s * 0.09, s * 0.11, s * 0.07);
      paint(ctx, o.dark, null);
    }
    var er = s * 0.038;
    circle(ctx, cx - s * 0.08, hy - s * 0.02, er);
    paint(ctx, o.eye || '#ff6a52', null);
    circle(ctx, cx + s * 0.08, hy - s * 0.02, er);
    paint(ctx, o.eye || '#ff6a52', null);
  }

  var MOBS = {
    wolf: function (ctx, x, y, s) {
      beast(ctx, x, y, s, { body: '#6c7d8e', dark: '#44525f', ears: 'point', snout: true });
    },
    bat: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.46;
      poly(ctx, [[cx - s * 0.10, cy], [cx - s * 0.46, cy - s * 0.20],
        [cx - s * 0.36, cy + s * 0.04], [cx - s * 0.44, cy + s * 0.16], [cx - s * 0.12, cy + s * 0.14]]);
      paint(ctx, '#7c5aa8', '#4d3370', Math.max(1, s * 0.04));
      poly(ctx, [[cx + s * 0.10, cy], [cx + s * 0.46, cy - s * 0.20],
        [cx + s * 0.36, cy + s * 0.04], [cx + s * 0.44, cy + s * 0.16], [cx + s * 0.12, cy + s * 0.14]]);
      paint(ctx, '#7c5aa8', '#4d3370', Math.max(1, s * 0.04));
      ellipse(ctx, cx, cy + s * 0.06, s * 0.15, s * 0.20);
      paint(ctx, '#6a4a94', '#402a5e', Math.max(1, s * 0.045));
      poly(ctx, [[cx - s * 0.13, cy - s * 0.12], [cx - s * 0.16, cy - s * 0.28], [cx - s * 0.03, cy - s * 0.17]]);
      paint(ctx, '#6a4a94', null);
      poly(ctx, [[cx + s * 0.13, cy - s * 0.12], [cx + s * 0.16, cy - s * 0.28], [cx + s * 0.03, cy - s * 0.17]]);
      paint(ctx, '#6a4a94', null);
      circle(ctx, cx - s * 0.06, cy - s * 0.02, s * 0.035); paint(ctx, '#ffd166', null);
      circle(ctx, cx + s * 0.06, cy - s * 0.02, s * 0.035); paint(ctx, '#ffd166', null);
    },
    spider: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.55;
      ctx.strokeStyle = '#2c3540';
      ctx.lineWidth = Math.max(1.4, s * 0.05);
      ctx.lineCap = 'round';
      for (var i = 0; i < 4; i++) {
        var dy = (i - 1.5) * s * 0.10;
        var spread = s * (0.30 + Math.abs(i - 1.5) * 0.04);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.10, cy + dy);
        ctx.quadraticCurveTo(cx - spread, cy + dy - s * 0.14, cx - spread - s * 0.04, cy + dy + s * 0.12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.10, cy + dy);
        ctx.quadraticCurveTo(cx + spread, cy + dy - s * 0.14, cx + spread + s * 0.04, cy + dy + s * 0.12);
        ctx.stroke();
      }
      ellipse(ctx, cx, cy + s * 0.06, s * 0.19, s * 0.16);
      paint(ctx, '#3a4552', '#232b34', Math.max(1, s * 0.04));
      circle(ctx, cx, cy - s * 0.14, s * 0.12);
      paint(ctx, '#46525f', '#232b34', Math.max(1, s * 0.04));
      circle(ctx, cx - s * 0.05, cy - s * 0.16, s * 0.028); paint(ctx, '#ff6a52', null);
      circle(ctx, cx + s * 0.05, cy - s * 0.16, s * 0.028); paint(ctx, '#ff6a52', null);
    },
    bear: function (ctx, x, y, s) {
      beast(ctx, x, y, s, { body: '#8a6136', dark: '#5c3f21', ears: 'round', snout: true, eye: '#2a1c10' });
    },
    hedgehog: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.60;
      for (var i = 0; i < 11; i++) {
        var a = Math.PI + (i / 10) * Math.PI;
        poly(ctx, [
          [cx + Math.cos(a) * s * 0.26, cy + Math.sin(a) * s * 0.20],
          [cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.36],
          [cx + Math.cos(a + 0.16) * s * 0.26, cy + Math.sin(a + 0.16) * s * 0.20]]);
        paint(ctx, '#5c6b78', null);
      }
      ellipse(ctx, cx, cy, s * 0.27, s * 0.21);
      paint(ctx, '#7d8b98', '#4a5763', Math.max(1, s * 0.045));
      ellipse(ctx, cx + s * 0.22, cy + s * 0.04, s * 0.13, s * 0.11);
      paint(ctx, C.skin, C.skinLo, Math.max(1, s * 0.035));
      circle(ctx, cx + s * 0.22, cy + s * 0.01, s * 0.03); paint(ctx, C.ink, null);
      circle(ctx, cx + s * 0.33, cy + s * 0.06, s * 0.03); paint(ctx, C.ink, null);
    },
    raven: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.54;
      poly(ctx, [[cx, cy - s * 0.08], [cx - s * 0.42, cy - s * 0.02], [cx - s * 0.12, cy + s * 0.18]]);
      paint(ctx, '#2b323b', '#171c22', Math.max(1, s * 0.04));
      poly(ctx, [[cx, cy - s * 0.08], [cx + s * 0.42, cy - s * 0.02], [cx + s * 0.12, cy + s * 0.18]]);
      paint(ctx, '#2b323b', '#171c22', Math.max(1, s * 0.04));
      ellipse(ctx, cx, cy + s * 0.04, s * 0.16, s * 0.20);
      paint(ctx, '#333b45', '#171c22', Math.max(1, s * 0.045));
      circle(ctx, cx, cy - s * 0.20, s * 0.12);
      paint(ctx, '#333b45', '#171c22', Math.max(1, s * 0.04));
      poly(ctx, [[cx + s * 0.10, cy - s * 0.20], [cx + s * 0.28, cy - s * 0.15], [cx + s * 0.10, cy - s * 0.11]]);
      paint(ctx, C.gold, null);
      circle(ctx, cx + s * 0.02, cy - s * 0.23, s * 0.03); paint(ctx, '#ffd166', null);
    },
    giant: function (ctx, x, y, s) {
      beast(ctx, x, y, s, { body: '#6d7f8f', dark: '#42505c', head: 0.24, headY: 0.30, eye: '#dff0ff' });
    },
    golem: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.30, y + s * 0.40, s * 0.60, s * 0.44, s * 0.12);
      paint(ctx, C.rock, C.rockLo, Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.22, y + s * 0.14, s * 0.44, s * 0.30, s * 0.10);
      paint(ctx, C.rockHi, C.rockLo, Math.max(1, s * 0.05));
      circle(ctx, cx - s * 0.10, y + s * 0.28, s * 0.045); paint(ctx, C.gold, null);
      circle(ctx, cx + s * 0.10, y + s * 0.28, s * 0.045); paint(ctx, C.gold, null);
      rrect(ctx, cx - s * 0.16, y + s * 0.84, s * 0.13, s * 0.12, s * 0.04);
      paint(ctx, C.rockLo, null);
      rrect(ctx, cx + s * 0.03, y + s * 0.84, s * 0.13, s * 0.12, s * 0.04);
      paint(ctx, C.rockLo, null);
    },
    treant: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.14, y + s * 0.52, s * 0.28, s * 0.38, s * 0.07);
      paint(ctx, C.bark, C.barkLo, Math.max(1, s * 0.05));
      circle(ctx, cx - s * 0.20, y + s * 0.36, s * 0.19); paint(ctx, C.leafLo, null);
      circle(ctx, cx + s * 0.20, y + s * 0.36, s * 0.19); paint(ctx, C.leafLo, null);
      circle(ctx, cx, y + s * 0.28, s * 0.26);
      paint(ctx, C.leaf, C.leafLo, Math.max(1, s * 0.045));
      circle(ctx, cx - s * 0.08, y + s * 0.30, s * 0.04); paint(ctx, '#ff6a52', null);
      circle(ctx, cx + s * 0.08, y + s * 0.30, s * 0.04); paint(ctx, '#ff6a52', null);
    },
    knight: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.26, y + s * 0.44, s * 0.52, s * 0.38, s * 0.10);
      paint(ctx, '#4a5666', '#2b3440', Math.max(1, s * 0.05));
      poly(ctx, [[cx - s * 0.22, y + s * 0.36], [cx - s * 0.22, y + s * 0.16],
        [cx, y + s * 0.06], [cx + s * 0.22, y + s * 0.16], [cx + s * 0.22, y + s * 0.36],
        [cx, y + s * 0.44]]);
      paint(ctx, '#5b697a', '#2b3440', Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.16, y + s * 0.22, s * 0.32, s * 0.08, s * 0.03);
      paint(ctx, '#1c232b', null);
      circle(ctx, cx - s * 0.07, y + s * 0.26, s * 0.03); paint(ctx, '#ff6a52', null);
      circle(ctx, cx + s * 0.07, y + s * 0.26, s * 0.03); paint(ctx, '#ff6a52', null);
      rrect(ctx, cx - s * 0.16, y + s * 0.80, s * 0.13, s * 0.14, s * 0.05);
      paint(ctx, '#2b3440', null);
      rrect(ctx, cx + s * 0.03, y + s * 0.80, s * 0.13, s * 0.14, s * 0.05);
      paint(ctx, '#2b3440', null);
    },
    abom: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.54;
      for (var i = 0; i < 7; i++) {
        var a = i / 7 * Math.PI * 2;
        ellipse(ctx, cx + Math.cos(a) * s * 0.26, cy + Math.sin(a) * s * 0.22, s * 0.15, s * 0.13);
        paint(ctx, '#20262e', null);
      }
      ellipse(ctx, cx, cy, s * 0.32, s * 0.28);
      paint(ctx, '#171c23', '#0c1015', Math.max(1, s * 0.05));
      for (var k = 0; k < 3; k++) {
        circle(ctx, cx + (k - 1) * s * 0.15, cy - s * 0.05 + (k % 2) * s * 0.10, s * 0.045);
        paint(ctx, '#ff5a3d', null);
      }
    }
  };

  function mobDraw(name) {
    var n = (name || '').toLowerCase();
    if (n.indexOf('wolf') >= 0 || n.indexOf('werewolf') >= 0) return MOBS.wolf;
    if (n.indexOf('bat') >= 0) return MOBS.bat;
    if (n.indexOf('spider') >= 0) return MOBS.spider;
    if (n.indexOf('bear') >= 0 || n.indexOf('hog') >= 0) return MOBS.bear;
    if (n.indexOf('hedgehog') >= 0) return MOBS.hedgehog;
    if (n.indexOf('raven') >= 0) return MOBS.raven;
    if (n.indexOf('giant') >= 0 || n.indexOf('griffin') >= 0) return MOBS.giant;
    if (n.indexOf('golem') >= 0 || n.indexOf('troll') >= 0) return MOBS.golem;
    if (n.indexOf('treant') >= 0 || n.indexOf('leshen') >= 0 ||
        n.indexOf('brittlebark') >= 0 || n.indexOf('druid') >= 0) return MOBS.treant;
    if (n.indexOf('abomination') >= 0) return MOBS.abom;
    return MOBS.knight;
  }

  /* ------------------------------------------------------------ ô sự kiện */

  var EVENTS = {
    chest: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.30, y + s * 0.44, s * 0.60, s * 0.34, s * 0.06);
      paint(ctx, '#a3703c', '#6b4622', Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.32, y + s * 0.26, s * 0.64, s * 0.22, s * 0.10);
      paint(ctx, '#c08a4c', '#6b4622', Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.32, y + s * 0.44, s * 0.64, s * 0.07, s * 0.03);
      paint(ctx, C.gold, C.goldLo, Math.max(1, s * 0.035));
      rrect(ctx, cx - s * 0.06, y + s * 0.42, s * 0.12, s * 0.16, s * 0.04);
      paint(ctx, C.gold, C.goldLo, Math.max(1, s * 0.035));
    },
    jewel: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.50;
      poly(ctx, [[cx, cy - s * 0.28], [cx + s * 0.26, cy - s * 0.04],
        [cx, cy + s * 0.30], [cx - s * 0.26, cy - s * 0.04]]);
      paint(ctx, '#63b8e8', '#2f6d94', Math.max(1, s * 0.05));
      poly(ctx, [[cx, cy - s * 0.28], [cx + s * 0.26, cy - s * 0.04], [cx, cy - s * 0.02]]);
      paint(ctx, '#a5ddf7', null);
    },
    grave: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.26, y + s * 0.22, s * 0.52, s * 0.58, s * 0.24);
      paint(ctx, '#93a2ae', '#5d6b78', Math.max(1, s * 0.05));
      ctx.strokeStyle = '#5d6b78';
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx, y + s * 0.34); ctx.lineTo(cx, y + s * 0.64);
      ctx.moveTo(cx - s * 0.13, y + s * 0.45); ctx.lineTo(cx + s * 0.13, y + s * 0.45);
      ctx.stroke();
      ellipse(ctx, cx, y + s * 0.82, s * 0.34, s * 0.09);
      paint(ctx, C.grassLo, null);
    },
    anvil: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      poly(ctx, [[cx - s * 0.34, y + s * 0.34], [cx + s * 0.30, y + s * 0.34],
        [cx + s * 0.36, y + s * 0.46], [cx + s * 0.12, y + s * 0.48],
        [cx + s * 0.10, y + s * 0.64], [cx + s * 0.26, y + s * 0.78],
        [cx - s * 0.26, y + s * 0.78], [cx - s * 0.10, y + s * 0.64],
        [cx - s * 0.12, y + s * 0.48], [cx - s * 0.34, y + s * 0.46]]);
      paint(ctx, '#6a7684', '#3d4753', Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.30, y + s * 0.34, s * 0.30, s * 0.05, s * 0.02);
      paint(ctx, '#9dabb8', null);
    },
    oil: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.07, y + s * 0.18, s * 0.14, s * 0.14, s * 0.04);
      paint(ctx, '#7d8b98', '#4a5763', Math.max(1, s * 0.04));
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.10, y + s * 0.32);
      ctx.quadraticCurveTo(cx - s * 0.32, y + s * 0.52, cx - s * 0.24, y + s * 0.72);
      ctx.quadraticCurveTo(cx, y + s * 0.90, cx + s * 0.24, y + s * 0.72);
      ctx.quadraticCurveTo(cx + s * 0.32, y + s * 0.52, cx + s * 0.10, y + s * 0.32);
      ctx.closePath();
      paint(ctx, '#5eb45f', '#33763a', Math.max(1, s * 0.05));
      ellipse(ctx, cx - s * 0.08, y + s * 0.56, s * 0.05, s * 0.09);
      paint(ctx, '#9adf95', null);
    },
    merchant: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.24, y + s * 0.46, s * 0.48, s * 0.38, s * 0.12);
      paint(ctx, '#8a5fbf', '#5a3a82', Math.max(1, s * 0.05));
      circle(ctx, cx, y + s * 0.32, s * 0.18);
      paint(ctx, C.skin, C.skinLo, Math.max(1, s * 0.04));
      ellipse(ctx, cx, y + s * 0.20, s * 0.28, s * 0.09);
      paint(ctx, C.gold, C.goldLo, Math.max(1, s * 0.04));
      circle(ctx, cx - s * 0.06, y + s * 0.33, s * 0.026); paint(ctx, C.ink, null);
      circle(ctx, cx + s * 0.06, y + s * 0.33, s * 0.026); paint(ctx, C.ink, null);
      circle(ctx, cx + s * 0.26, y + s * 0.66, s * 0.10);
      paint(ctx, C.gold, C.goldLo, Math.max(1, s * 0.04));
    },
    fire: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = '#7a5330';
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.26, y + s * 0.80); ctx.lineTo(cx + s * 0.26, y + s * 0.70);
      ctx.moveTo(cx + s * 0.26, y + s * 0.80); ctx.lineTo(cx - s * 0.26, y + s * 0.70);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, y + s * 0.14);
      ctx.quadraticCurveTo(cx + s * 0.28, y + s * 0.44, cx + s * 0.16, y + s * 0.66);
      ctx.quadraticCurveTo(cx, y + s * 0.78, cx - s * 0.16, y + s * 0.66);
      ctx.quadraticCurveTo(cx - s * 0.28, y + s * 0.44, cx, y + s * 0.14);
      ctx.closePath();
      paint(ctx, '#f08a3c', '#c05a1e', Math.max(1, s * 0.04));
      ctx.beginPath();
      ctx.moveTo(cx, y + s * 0.36);
      ctx.quadraticCurveTo(cx + s * 0.13, y + s * 0.52, cx, y + s * 0.68);
      ctx.quadraticCurveTo(cx - s * 0.13, y + s * 0.52, cx, y + s * 0.36);
      ctx.closePath();
      paint(ctx, '#ffd166', null);
    },
    house: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.30, y + s * 0.44, s * 0.60, s * 0.40, s * 0.05);
      paint(ctx, '#c9a06a', '#8a6a40', Math.max(1, s * 0.05));
      poly(ctx, [[cx - s * 0.38, y + s * 0.46], [cx, y + s * 0.12], [cx + s * 0.38, y + s * 0.46]]);
      paint(ctx, '#c9463f', '#8a2b26', Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.10, y + s * 0.58, s * 0.20, s * 0.26, s * 0.04);
      paint(ctx, '#6b4622', null);
      circle(ctx, cx + s * 0.05, y + s * 0.71, s * 0.025); paint(ctx, C.gold, null);
    },
    golem: function (ctx, x, y, s) { MOBS.golem(ctx, x, y, s); },
    cauldron: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.32, y + s * 0.42);
      ctx.quadraticCurveTo(cx - s * 0.30, y + s * 0.84, cx, y + s * 0.84);
      ctx.quadraticCurveTo(cx + s * 0.30, y + s * 0.84, cx + s * 0.32, y + s * 0.42);
      ctx.closePath();
      paint(ctx, '#4a5563', '#2b3440', Math.max(1, s * 0.05));
      ellipse(ctx, cx, y + s * 0.42, s * 0.32, s * 0.10);
      paint(ctx, '#5eb45f', '#33763a', Math.max(1, s * 0.04));
      circle(ctx, cx - s * 0.10, y + s * 0.40, s * 0.04); paint(ctx, '#9adf95', null);
      circle(ctx, cx + s * 0.11, y + s * 0.43, s * 0.03); paint(ctx, '#9adf95', null);
    },
    tower: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      poly(ctx, [[cx - s * 0.20, y + s * 0.84], [cx - s * 0.13, y + s * 0.34],
        [cx + s * 0.13, y + s * 0.34], [cx + s * 0.20, y + s * 0.84]]);
      paint(ctx, '#a3703c', '#6b4622', Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.24, y + s * 0.20, s * 0.48, s * 0.16, s * 0.05);
      paint(ctx, '#c08a4c', '#6b4622', Math.max(1, s * 0.05));
      poly(ctx, [[cx - s * 0.28, y + s * 0.20], [cx, y + s * 0.04], [cx + s * 0.28, y + s * 0.20]]);
      paint(ctx, '#c9463f', '#8a2b26', Math.max(1, s * 0.045));
      circle(ctx, cx, y + s * 0.28, s * 0.05); paint(ctx, '#ffd166', null);
    },
    well: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.30, y + s * 0.48, s * 0.60, s * 0.34, s * 0.06);
      paint(ctx, '#7b8a99', '#4a5763', Math.max(1, s * 0.05));
      ellipse(ctx, cx, y + s * 0.50, s * 0.28, s * 0.10);
      paint(ctx, '#3b6fa8', '#24466b', Math.max(1, s * 0.04));
      ctx.strokeStyle = '#6b4622';
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22, y + s * 0.48); ctx.lineTo(cx - s * 0.16, y + s * 0.14);
      ctx.moveTo(cx + s * 0.22, y + s * 0.48); ctx.lineTo(cx + s * 0.16, y + s * 0.14);
      ctx.stroke();
      rrect(ctx, cx - s * 0.26, y + s * 0.08, s * 0.52, s * 0.08, s * 0.03);
      paint(ctx, '#8a2b26', null);
    }
  };

  /* ------------------------------------------ biểu tượng vật phẩm (sạch) */

  var ICONS = {
    sword: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.steelLo; ctx.lineWidth = Math.max(2, s * 0.09); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - s * 0.20, y + s * 0.78); ctx.lineTo(cx + s * 0.26, y + s * 0.16); ctx.stroke();
      ctx.strokeStyle = C.steel; ctx.lineWidth = Math.max(1.5, s * 0.055);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.20, y + s * 0.78); ctx.lineTo(cx + s * 0.26, y + s * 0.16); ctx.stroke();
      ctx.strokeStyle = C.gold; ctx.lineWidth = Math.max(2, s * 0.085);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.30, y + s * 0.56); ctx.lineTo(cx - s * 0.02, y + s * 0.74); ctx.stroke();
      circle(ctx, cx - s * 0.26, y + s * 0.80, s * 0.075); paint(ctx, C.goldLo, null);
    },
    axe: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.bark; ctx.lineWidth = Math.max(2, s * 0.085); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - s * 0.10, y + s * 0.82); ctx.lineTo(cx + s * 0.06, y + s * 0.18); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.02, y + s * 0.22);
      ctx.quadraticCurveTo(cx + s * 0.36, y + s * 0.18, cx + s * 0.32, y + s * 0.52);
      ctx.quadraticCurveTo(cx + s * 0.16, y + s * 0.46, cx + s * 0.02, y + s * 0.48);
      ctx.closePath();
      paint(ctx, C.steel, C.steelLo, Math.max(1, s * 0.05));
    },
    hammer: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.bark; ctx.lineWidth = Math.max(2, s * 0.085); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, y + s * 0.84); ctx.lineTo(cx, y + s * 0.34); ctx.stroke();
      rrect(ctx, cx - s * 0.30, y + s * 0.14, s * 0.60, s * 0.24, s * 0.07);
      paint(ctx, C.rock, C.rockLo, Math.max(1, s * 0.05));
    },
    spear: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.bark; ctx.lineWidth = Math.max(2, s * 0.075); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, y + s * 0.86); ctx.lineTo(cx, y + s * 0.34); ctx.stroke();
      poly(ctx, [[cx, y + s * 0.08], [cx + s * 0.14, y + s * 0.36], [cx, y + s * 0.44], [cx - s * 0.14, y + s * 0.36]]);
      paint(ctx, C.steel, C.steelLo, Math.max(1, s * 0.05));
    },
    bow: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.bark; ctx.lineWidth = Math.max(2, s * 0.08); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx + s * 0.16, y + s * 0.5, s * 0.34, Math.PI * 0.62, Math.PI * 1.38);
      ctx.stroke();
      ctx.strokeStyle = C.bone; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.02, y + s * 0.19); ctx.lineTo(cx - s * 0.02, y + s * 0.81); ctx.stroke();
    },
    staff: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.bark; ctx.lineWidth = Math.max(2, s * 0.08); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, y + s * 0.88); ctx.lineTo(cx, y + s * 0.34); ctx.stroke();
      circle(ctx, cx, y + s * 0.24, s * 0.17);
      paint(ctx, C.purple, C.purpleLo, Math.max(1, s * 0.05));
    },
    whip: function (ctx, x, y, s) {
      ctx.strokeStyle = C.bark; ctx.lineWidth = Math.max(2, s * 0.075); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.14, y + s * 0.20);
      ctx.bezierCurveTo(x + s * 0.72, y + s * 0.24, x + s * 0.20, y + s * 0.62, x + s * 0.84, y + s * 0.82);
      ctx.stroke();
      circle(ctx, x + s * 0.16, y + s * 0.20, s * 0.09); paint(ctx, C.barkLo, null);
    },
    ring: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.58;
      ctx.strokeStyle = C.gold; ctx.lineWidth = Math.max(2, s * 0.10);
      circle(ctx, cx, cy, s * 0.24); ctx.stroke();
      poly(ctx, [[cx, cy - s * 0.50], [cx + s * 0.13, cy - s * 0.32], [cx, cy - s * 0.18], [cx - s * 0.13, cy - s * 0.32]]);
      paint(ctx, C.red, C.redLo, Math.max(1, s * 0.045));
    },
    earring: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.gold; ctx.lineWidth = Math.max(2, s * 0.07);
      ctx.beginPath(); ctx.arc(cx, y + s * 0.30, s * 0.16, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
      circle(ctx, cx, y + s * 0.62, s * 0.17);
      paint(ctx, C.blue, C.blueLo, Math.max(1, s * 0.05));
    },
    crown: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      poly(ctx, [[cx - s * 0.34, y + s * 0.70], [cx - s * 0.34, y + s * 0.30],
        [cx - s * 0.17, y + s * 0.48], [cx, y + s * 0.24], [cx + s * 0.17, y + s * 0.48],
        [cx + s * 0.34, y + s * 0.30], [cx + s * 0.34, y + s * 0.70]]);
      paint(ctx, C.gold, C.goldLo, Math.max(1, s * 0.05));
      circle(ctx, cx, y + s * 0.56, s * 0.06); paint(ctx, C.red, null);
    },
    helmet: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.beginPath();
      ctx.arc(cx, y + s * 0.52, s * 0.32, Math.PI, 0);
      ctx.lineTo(cx + s * 0.32, y + s * 0.74);
      ctx.lineTo(cx - s * 0.32, y + s * 0.74);
      ctx.closePath();
      paint(ctx, C.steel, C.steelLo, Math.max(1, s * 0.05));
      rrect(ctx, cx - s * 0.24, y + s * 0.48, s * 0.48, s * 0.10, s * 0.04);
      paint(ctx, '#2b3440', null);
    },
    boots: function (ctx, x, y, s) {
      [-1, 1].forEach(function (d) {
        var bx = x + s * 0.5 + d * s * 0.18;
        ctx.beginPath();
        ctx.moveTo(bx - s * 0.09, y + s * 0.26);
        ctx.lineTo(bx + s * 0.09, y + s * 0.26);
        ctx.lineTo(bx + s * 0.09, y + s * 0.62);
        ctx.lineTo(bx + s * 0.16 * d, y + s * 0.62);
        ctx.lineTo(bx + s * 0.16 * d, y + s * 0.76);
        ctx.lineTo(bx - s * 0.09, y + s * 0.76);
        ctx.closePath();
        paint(ctx, C.bark, C.barkLo, Math.max(1, s * 0.05));
      });
    },
    glove: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.24, y + s * 0.34, s * 0.48, s * 0.42, s * 0.12);
      paint(ctx, C.bark, C.barkLo, Math.max(1, s * 0.05));
      for (var i = 0; i < 3; i++) {
        rrect(ctx, cx - s * 0.20 + i * s * 0.15, y + s * 0.18, s * 0.11, s * 0.20, s * 0.05);
        paint(ctx, C.bark, C.barkLo, Math.max(1, s * 0.04));
      }
    },
    armor: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.30, y + s * 0.22);
      ctx.lineTo(cx - s * 0.10, y + s * 0.28);
      ctx.lineTo(cx + s * 0.10, y + s * 0.28);
      ctx.lineTo(cx + s * 0.30, y + s * 0.22);
      ctx.quadraticCurveTo(cx + s * 0.36, y + s * 0.62, cx, y + s * 0.82);
      ctx.quadraticCurveTo(cx - s * 0.36, y + s * 0.62, cx - s * 0.30, y + s * 0.22);
      ctx.closePath();
      paint(ctx, C.steel, C.steelLo, Math.max(1, s * 0.05));
      ctx.strokeStyle = C.steelLo; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(cx, y + s * 0.30); ctx.lineTo(cx, y + s * 0.78); ctx.stroke();
    },
    shield: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.30, y + s * 0.20);
      ctx.lineTo(cx + s * 0.30, y + s * 0.20);
      ctx.quadraticCurveTo(cx + s * 0.30, y + s * 0.66, cx, y + s * 0.84);
      ctx.quadraticCurveTo(cx - s * 0.30, y + s * 0.66, cx - s * 0.30, y + s * 0.20);
      ctx.closePath();
      paint(ctx, C.blue, C.blueLo, Math.max(1, s * 0.05));
      poly(ctx, [[cx, y + s * 0.32], [cx + s * 0.14, y + s * 0.50], [cx, y + s * 0.68], [cx - s * 0.14, y + s * 0.50]]);
      paint(ctx, C.gold, null);
    },
    potion: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      rrect(ctx, cx - s * 0.09, y + s * 0.14, s * 0.18, s * 0.14, s * 0.04);
      paint(ctx, C.steelLo, null);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.11, y + s * 0.28);
      ctx.quadraticCurveTo(cx - s * 0.34, y + s * 0.50, cx - s * 0.24, y + s * 0.74);
      ctx.quadraticCurveTo(cx, y + s * 0.90, cx + s * 0.24, y + s * 0.74);
      ctx.quadraticCurveTo(cx + s * 0.34, y + s * 0.50, cx + s * 0.11, y + s * 0.28);
      ctx.closePath();
      paint(ctx, C.red, C.redLo, Math.max(1, s * 0.05));
      ellipse(ctx, cx - s * 0.09, y + s * 0.56, s * 0.05, s * 0.08);
      paint(ctx, 'rgba(255,255,255,.45)', null);
    },
    food: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ellipse(ctx, cx, y + s * 0.54, s * 0.32, s * 0.24);
      paint(ctx, '#c98a52', '#8a5a2e', Math.max(1, s * 0.05));
      ellipse(ctx, cx, y + s * 0.50, s * 0.18, s * 0.12);
      paint(ctx, '#e8b071', null);
      ctx.strokeStyle = '#6b4622'; ctx.lineWidth = Math.max(1.5, s * 0.055); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + s * 0.28, y + s * 0.62); ctx.lineTo(cx + s * 0.42, y + s * 0.76); ctx.stroke();
    },
    bomb: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      circle(ctx, cx, y + s * 0.60, s * 0.28);
      paint(ctx, '#39424e', '#1e252d', Math.max(1, s * 0.05));
      circle(ctx, cx - s * 0.09, y + s * 0.52, s * 0.06);
      paint(ctx, 'rgba(255,255,255,.35)', null);
      ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = Math.max(1.5, s * 0.06); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.10, y + s * 0.36);
      ctx.quadraticCurveTo(cx + s * 0.30, y + s * 0.24, cx + s * 0.22, y + s * 0.12);
      ctx.stroke();
      circle(ctx, cx + s * 0.22, y + s * 0.10, s * 0.055); paint(ctx, '#ffb03c', null);
    },
    gem: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.52;
      poly(ctx, [[cx - s * 0.18, cy - s * 0.26], [cx + s * 0.18, cy - s * 0.26],
        [cx + s * 0.30, cy - s * 0.02], [cx, cy + s * 0.32], [cx - s * 0.30, cy - s * 0.02]]);
      paint(ctx, '#5ec8a8', '#2f7d68', Math.max(1, s * 0.05));
      poly(ctx, [[cx - s * 0.18, cy - s * 0.26], [cx + s * 0.18, cy - s * 0.26], [cx, cy - s * 0.02]]);
      paint(ctx, '#9ce8d2', null);
    },
    talisman: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      ctx.strokeStyle = C.goldLo; ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.20, y + s * 0.16);
      ctx.quadraticCurveTo(cx, y + s * 0.36, cx + s * 0.20, y + s * 0.16);
      ctx.stroke();
      circle(ctx, cx, y + s * 0.58, s * 0.24);
      paint(ctx, C.gold, C.goldLo, Math.max(1, s * 0.05));
      circle(ctx, cx, y + s * 0.58, s * 0.10);
      paint(ctx, C.red, null);
    },
    thorn: function (ctx, x, y, s) {
      var cx = x + s * 0.5, cy = y + s * 0.52;
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2 - Math.PI / 2;
        poly(ctx, [
          [cx + Math.cos(a) * s * 0.14, cy + Math.sin(a) * s * 0.14],
          [cx + Math.cos(a) * s * 0.36, cy + Math.sin(a) * s * 0.36],
          [cx + Math.cos(a + 0.5) * s * 0.14, cy + Math.sin(a + 0.5) * s * 0.14]]);
        paint(ctx, C.leaf, C.leafLo, Math.max(1, s * 0.04));
      }
      circle(ctx, cx, cy, s * 0.14);
      paint(ctx, C.leafHi, C.leafLo, Math.max(1, s * 0.04));
    },
    misc: function (ctx, x, y, s) {
      var cx = x + s * 0.5;
      circle(ctx, cx, y + s * 0.52, s * 0.28);
      paint(ctx, C.rock, C.rockLo, Math.max(1, s * 0.05));
      circle(ctx, cx, y + s * 0.52, s * 0.12);
      paint(ctx, C.rockHi, null);
    }
  };

  /* Đoán hình theo TÊN GỐC tiếng Anh — tên gốc mới ổn định, bản dịch thì không.
     Thứ tự quan trọng: xét chữ riêng trước chữ chung. */
  var RULES = [
    ['whip', 'whip'], ['bow', 'bow'], ['spear', 'spear'], ['lance', 'spear'],
    ['axe', 'axe'], ['hammer', 'hammer'], ['club', 'hammer'], ['stick', 'staff'],
    ['staff', 'staff'], ['rod', 'staff'], ['scepter', 'staff'],
    ['blade', 'sword'], ['sword', 'sword'], ['rapier', 'sword'], ['scythe', 'sword'],
    ['dagger', 'sword'], ['greatsword', 'sword'], ['edge', 'sword'],
    ['earring', 'earring'], ['ring', 'ring'], ['crown', 'crown'],
    ['helmet', 'helmet'], ['mask', 'helmet'],
    ['boots', 'boots'], ['greaves', 'boots'], ['sandals', 'boots'],
    ['gauntlet', 'glove'], ['glove', 'glove'],
    ['shield', 'shield'], ['buckler', 'shield'], ['mirror', 'shield'],
    ['armor', 'armor'], ['plate', 'armor'], ['mail', 'armor'], ['vest', 'armor'],
    ['coat', 'armor'], ['cloak', 'armor'], ['scales', 'armor'], ['physique', 'armor'],
    ['belt', 'armor'],
    ['potion', 'potion'], ['flask', 'potion'], ['wine', 'potion'], ['oil', 'potion'],
    ['cocktail', 'potion'], ['sap', 'potion'],
    ['bomb', 'bomb'], ['firecracker', 'bomb'], ['cherry', 'bomb'],
    ['gemstone', 'gem'], ['crystal', 'gem'],
    ['talisman', 'talisman'], ['bond', 'talisman'], ['charm', 'talisman'],
    ['pendant', 'talisman'], ['doll', 'talisman'], ['contract', 'talisman'],
    ['ritual', 'talisman'], ['curse', 'talisman'], ['heart', 'talisman'],
    ['rose', 'thorn'], ['thorn', 'thorn'], ['razorvine', 'thorn'], ['acorn', 'thorn'],
    ['steak', 'food'], ['ham', 'food'], ['roast', 'food'], ['honeycomb', 'food'],
    ['feather', 'misc'], ['web', 'misc'], ['needle', 'misc'], ['whetstone', 'misc'],
    ['transfusion', 'misc'], ['bracelet', 'ring']
  ];

  function iconFor(item) {
    var n = ((item && item.name) || '').toLowerCase();
    for (var i = 0; i < RULES.length; i++) {
      if (n.indexOf(RULES[i][0]) >= 0) return ICONS[RULES[i][1]];
    }
    if (item && item.weapon) return ICONS.sword;
    if (item && (item.tags || []).indexOf('food') >= 0) return ICONS.food;
    if (item && (item.tags || []).indexOf('jewelry') >= 0) return ICONS.ring;
    return ICONS.misc;
  }

  var RARITY_COLOR = {
    common: '#93a3b3', rare: '#5b8fd6', heroic: '#a878d8',
    golden: '#f0c04a', diamond: '#6fd8e8', cauldron: '#e0954a'
  };

  /* ------------------------------------------------------------------ API */

  /* Tô một hình bằng đúng một màu — dùng cho cú loé khi trúng đòn. Với hình
     vector thì vẽ lại vào một canvas rời rồi phủ màu qua `source-in`, nên nó
     vẫn ôm đúng dáng chứ không phải một ô vuông trắng. */
  var tintBuf = null;
  function tinted(ctx, drawFn, x, y, s, color) {
    var px = Math.max(8, Math.ceil(s) + 2);
    if (!tintBuf || tintBuf.width < px) {
      tintBuf = document.createElement('canvas');
      tintBuf.width = tintBuf.height = px;
    }
    var b = tintBuf.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, tintBuf.width, tintBuf.height);
    b.globalCompositeOperation = 'source-over';
    drawFn(b, 0, 0, s);
    b.globalCompositeOperation = 'source-in';
    b.fillStyle = color;
    b.fillRect(0, 0, tintBuf.width, tintBuf.height);
    b.globalCompositeOperation = 'source-over';
    ctx.drawImage(tintBuf, 0, 0, px, px, x, y, px, px);
  }

  global.HIC_ART = {
    C: C,
    RARITY_COLOR: RARITY_COLOR,
    roundRect: rrect,

    ground: ground,
    overlay: function (ctx, kind, x, y, s) { if (OVERLAY[kind]) OVERLAY[kind](ctx, x, y, s); },
    hero: function (ctx, x, y, s) { hero(ctx, x, y, s); },
    mob: function (ctx, name, x, y, s) { mobDraw(name)(ctx, x, y, s); },
    mobDraw: mobDraw,
    icon: function (ctx, item, x, y, s) { iconFor(item)(ctx, x, y, s); },
    iconFor: iconFor,

    tintHero: function (ctx, x, y, s, color) { tinted(ctx, hero, x, y, s, color); },
    tintMob: function (ctx, name, x, y, s, color) { tinted(ctx, mobDraw(name), x, y, s, color); },

    /* Ô sự kiện: bệ sáng dưới chân + hình + mũi nhấp nháy trên đầu. Đây là câu
       trả lời cho "cái nào bấm được", và nó phải thấy được trước khi đọc chữ. */
    event: function (ctx, icon, x, y, s, t, dim) {
      var cx = x + s / 2, by = y + s * 0.88;
      ctx.save();
      var g = ctx.createRadialGradient(cx, by, 0, cx, by, s * 0.62);
      g.addColorStop(0, dim ? 'rgba(160,180,200,.26)' : 'rgba(255,205,90,.44)');
      g.addColorStop(1, 'rgba(255,205,90,0)');
      ctx.fillStyle = g;
      ellipse(ctx, cx, by, s * 0.54, s * 0.26);
      ctx.fill();
      ctx.globalAlpha = dim ? 0.5 : 1;
      (EVENTS[icon] || EVENTS.chest)(ctx, x, y - s * 0.04, s);
      ctx.globalAlpha = 1;
      if (!dim) {
        var bob = Math.sin((t || 0) / 280) * s * 0.055;
        ctx.fillStyle = '#ffcd5a';
        ctx.beginPath();
        ctx.moveTo(cx, y - s * 0.06 + bob);
        ctx.lineTo(cx - s * 0.13, y - s * 0.26 + bob);
        ctx.lineTo(cx + s * 0.13, y - s * 0.26 + bob);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },

    shadow: function (ctx, x, y, s) {
      ctx.save();
      ctx.fillStyle = C.shadow;
      ellipse(ctx, x + s / 2, y + s * 0.90, s * 0.30, s * 0.10);
      ctx.fill();
      ctx.restore();
    },

    EVENTS: EVENTS,
    ICONS: ICONS
  };

  /* Ảnh nhỏ cho các bảng.
     HAI cái bẫy đã cắn ở bản trước, giữ nguyên cách chống:
     1. Khoá bộ nhớ đệm phải là TÊN món. Ném cả object vào thì JavaScript biến
        nó thành "[object Object]" và mọi món dùng chung một hình.
     2. Phải trả về canvas MỚI mỗi lần: một nút DOM chỉ nằm được ở một chỗ, gắn
        lại vào chỗ thứ hai là nó biến mất khỏi chỗ thứ nhất. */
  var cache = {};

  function renderIcon(kind, key, px, opts) {
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(px * dpr);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    var pad = 0;
    if (opts.frame) {
      ctx.fillStyle = 'rgba(0,0,0,.30)';
      rrect(ctx, 1, 1, px - 2, px - 2, px * 0.22);
      ctx.fill();
      ctx.strokeStyle = opts.frame;
      ctx.lineWidth = Math.max(1, px * 0.055);
      ctx.stroke();
      pad = px * 0.13;
    }
    var inner = px - pad * 2;
    if (kind === 'mob') mobDraw(key)(ctx, pad, pad, inner);
    else if (kind === 'event') (EVENTS[key] || EVENTS.chest)(ctx, pad, pad, inner);
    else if (kind === 'item') iconFor(key)(ctx, pad, pad, inner);
    else if (kind === 'terrain') {
      ground(ctx, key.ground || 'grass', pad, pad, inner);
      if (key.overlay && OVERLAY[key.overlay]) OVERLAY[key.overlay](ctx, pad, pad, inner);
    } else hero(ctx, pad, pad, inner);
    return cv;
  }

  global.HIC_iconCanvas = function (kind, key, px, opts) {
    opts = opts || {};
    px = px || 32;
    var name = typeof key === 'string' ? key
      : (key && (key.name || (key.ground + '/' + key.overlay))) || '?';
    var ck = kind + '|' + name + '|' + px + '|' + (opts.frame || '');
    if (!cache[ck]) cache[ck] = renderIcon(kind, key, px, opts);
    var src = cache[ck];
    var out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    out.style.width = px + 'px';
    out.style.height = px + 'px';
    out.getContext('2d').drawImage(src, 0, 0);
    return out;
  };
})(window);
