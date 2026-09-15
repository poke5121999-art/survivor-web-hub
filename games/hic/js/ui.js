/* Màn hình, cảm ứng và mọi bảng bật lên.
 *
 * WHY: game gốc chơi bằng chuột và bàn phím trên PC. Bản này phải chơi được
 * bằng ngón cái, nên mọi thao tác đều quy về "chạm vào thứ mình muốn": chạm ô
 * trên bản đồ để đi tới đó, chạm quái để đánh, chạm món đồ để lắp.
 * ROOT-CAUSE: bàn phím ảo và nút bấm nhỏ là thứ giết một game lưới trên điện thoại.
 *
 * Bố cục 2026-09-15: màn NGANG giống bản Steam — thanh đồng hồ trên cùng, cột
 * trang bị luôn hiện bên trái, bản đồ chiếm phần còn lại. Màn dọc thì cột trái
 * xuống thành thanh dưới. Không khoá xoay: chọn bố cục theo tỉ lệ khung.
 *
 * LOGIC và HÌNH tách nhau: world.step() đổi vị trí ngay lập tức (con bot và bộ
 * máy trận đánh cần thế), còn nhân vật trên màn thì TRƯỢT tới vị trí đó. Bảng sự
 * kiện và trận đánh chỉ mở khi hình đã tới nơi, nên người chơi luôn thấy mình
 * bước vào rồi mới thấy chuyện xảy ra.
 */
(function (global) {
  'use strict';

  var SPR = global.HIC_SPR, SFX = global.HIC_SFX, FX = global.HIC_FX, E = FX.E;
  var run = null, world = null;
  var cv, ctx, dpr = 1;
  var T = 32, K = 2;                      // cỡ ô và hệ số pixel, tính bằng ĐIỂM ẢNH THIẾT BỊ
  var viewW = 0, viewH = 0;
  var cam = { x: 0, y: 0, init: false };
  var hero = { x: 0, y: 0, face: 1, moving: false, bumpX: 0, bumpY: 0, animT: 0, hop: 0 };
  var STEP_MS = 150;
  var walkQueue = [];
  var busy = false;
  var pending = null;                     // {kind:'event'|'battle'|'boss', ...} chờ hình tới nơi
  var toasts = [];
  var lastFrame = 0, now = 0;
  var fogA = null, fogCv = null, fogCtx = null, fogImg = null;
  var nightMix = 0, lastPhase = -1;
  var mapFx = null;
  var tapMark = null;
  var heldDir = null, heldSince = 0, lastHeldStep = 0;
  var prevUids = {};
  var shownGold = 0, shownStats = null;

  var $ = function (s) { return document.querySelector(s); };
  var el = function (tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  function play(n, a) { if (SFX) SFX.play(n, a); }
  function vn(n) { return global.HIC_vnName(n); }

  /* -------------------------------------------------------- chống chạm lặp */
  /* Một cú chạm đang kích HAI lần, và có ba đường khác nhau dẫn tới chuyện đó:
     1. Chạm lên bản đồ mở một bảng ra. Trình duyệt vẫn còn nợ một sự kiện
        `click` sau khi nhấc ngón, và cú click đó rơi trúng cái nút vừa hiện ra
        NGAY DƯỚI ngón tay. Người chơi chạm một lần, game làm hai việc.
     2. Ngón tay rung: hai cú chạm cách nhau 40-80ms lên cùng một thẻ đồ.
     3. Bấm nhanh sang thẻ khác trong lúc bảng cũ đang đóng dở.
     Cả ba đều được chặn ở tầng bắt sự kiện của hai khung bảng.
     ROOT-CAUSE: chống lặp là tính chất của TẦNG NHẬP LIỆU, không phải của từng nút. */
  var armedUntil = 0;
  var lastPass = 0, lastNode = null;
  var guard = { swallowed: 0, passed: 0 };
  var ARM_MS = 150, GLOBAL_MS = 140, SAME_MS = 400;

  function armInput(ms) { armedUntil = Date.now() + (ms || ARM_MS); }

  /* Mỗi bảng mang một số thứ tự, và mỗi số chỉ tiêu được đúng một hành động —
     vì cú bấm thứ hai có thể rơi vào một nút đã bị gỡ khỏi trang. */
  var panelGen = 0;
  function once(fn) {
    var gen = panelGen;
    return function () {
      if (gen !== panelGen) return;
      panelGen++;
      return fn.apply(this, arguments);
    };
  }

  function guardContainer(node) {
    ['pointerdown', 'pointerup', 'click'].forEach(function (type) {
      node.addEventListener(type, function (e) {
        var t = Date.now();
        var same = e.target === lastNode || (lastNode && lastNode.contains && lastNode.contains(e.target));
        var tooSoon = t < armedUntil || (t - lastPass < GLOBAL_MS) || (same && t - lastPass < SAME_MS);
        if (tooSoon) {
          if (type === 'click') guard.swallowed++;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (type === 'click') {
          lastPass = t;
          lastNode = e.target;
          guard.passed++;
          if (e.target.closest && e.target.closest('button,.pickable,.hic-slot')) play('tap');
        }
      }, true);
    });
  }

  /* ---------------------------------------------------------------- icon */

  var STAT_EMOJI = { hp: '❤', atk: '⚔', arm: '🛡', spd: '👢', gold: '🪙', skull: '💀', bag: '🎒' };
  var STAT_ROLE = { hp: 'ui.heart', atk: 'ui.attack', arm: 'ui.shield', spd: 'ui.speed', gold: 'ui.gold', skull: 'ui.skull' };
  function statIcon(kind, px) {
    var c = SPR && SPR.canvasFor(STAT_ROLE[kind], px || 16, { fill: 1 });
    if (c) return c;
    return el('span', 'ico', STAT_EMOJI[kind] || '•');
  }

  function itemIcon(it, px) {
    var role = SPR && SPR.iconRole(it);
    var c = role && SPR.canvasFor(role, px || 34, {});
    if (c) {
      if (it && it.rarity === 'golden') c.style.filter = 'drop-shadow(0 0 3px #ffd452) sepia(.5) saturate(2.2) hue-rotate(-12deg)';
      if (it && it.rarity === 'diamond') c.style.filter = 'drop-shadow(0 0 3px #7cf3ff) hue-rotate(160deg) saturate(1.6) brightness(1.15)';
      return c;
    }
    return global.HIC_iconCanvas('item', it, px || 34, {});
  }
  function eventIcon(iconKey, px) {
    var c = SPR && SPR.canvasFor('event.' + iconKey, px, {});
    return c || global.HIC_iconCanvas('event', iconKey, px, {});
  }
  function mobIcon(name, px) {
    var role = SPR && SPR.creatureRole(name);
    var c = role && SPR.canvasFor(role, px, {});
    return c || global.HIC_iconCanvas('mob', name, px, {});
  }

  /* ---------------------------------------------------------------- toasts */

  /* Tối đa 3 dòng thông báo cùng lúc — một chuỗi thao tác nhanh đẩy ra hàng chục
     dòng và chúng che kín bản đồ. */
  function toast(msg, kind) {
    var last = toasts[toasts.length - 1];
    if (last && last.msg === msg) { last.t = 2400; return; }
    var node = el('div', 'hic-toast ' + (kind || ''), msg);
    $('#hic-toasts').appendChild(node);
    toasts.push({ msg: msg, t: 2400, node: node });
    while (toasts.length > 3) { var o = toasts.shift(); o.node.remove(); }
  }
  function tickToasts(dt) {
    for (var i = toasts.length - 1; i >= 0; i--) {
      var t = toasts[i];
      t.t -= dt;
      if (t.t <= 250 && !t.out) { t.out = true; t.node.classList.add('out'); }
      if (t.t <= 0) { t.node.remove(); toasts.splice(i, 1); }
    }
  }

  function banner(title, sub, color) {
    var b = $('#hic-banner');
    b.querySelector('b').textContent = title;
    b.querySelector('small').textContent = sub || '';
    b.style.setProperty('--bc', color || '#ffcf5a');
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }

  /* ------------------------------------------------------------------- HUD */

  function phaseLabel() {
    return (world.isNight() ? 'Đêm ' : 'Ngày ') + world.dayNumber();
  }

  function buildClock() {
    var bar = $('#hic-clockbar');
    bar.innerHTML = '';
    global.HIC_WORLD_CONST.PHASES.forEach(function (ph) {
      var s = el('div', 'hic-seg ' + ph);
      s.appendChild(el('i'));
      bar.appendChild(s);
    });
  }

  function countTo(node, from, to, ms) {
    if (from === to) { node.textContent = to; return; }
    var t0 = performance.now();
    function f(ts) {
      var p = Math.min(1, (ts - t0) / ms);
      node.textContent = Math.round(from + (to - from) * E.outCubic(p));
      if (p < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }

  function pop(node) {
    node.classList.remove('pop', 'bump');
    void node.offsetWidth;
    node.classList.add(node.id === 'hic-goldchip' ? 'bump' : 'pop');
  }

  function updateHud() {
    if (!run) return;
    var s = run.stats();
    var C = global.HIC_WORLD_CONST;
    $('#hic-week').textContent = 'Tuần ' + run.week;
    $('#hic-phase').textContent = phaseLabel();
    $('#hic-steps').textContent = world.stepsLeft;
    var segs = $('#hic-clockbar').children;
    for (var i = 0; i < segs.length; i++) {
      var ph = C.PHASES[i], full = ph === 'night' ? C.NIGHT_STEPS : C.DAY_STEPS;
      segs[i].classList.toggle('past', i < world.phaseIndex);
      segs[i].firstChild.style.width = i === world.phaseIndex ? (100 * (1 - world.stepsLeft / full)) + '%' : (i < world.phaseIndex ? '100%' : '0');
    }
    $('#hic-skull').classList.toggle('due', world.bossDue() || world.phaseIndex >= C.PHASES.length - 1);

    if (run.gold !== shownGold) {
      countTo($('#hic-gold'), shownGold, run.gold, 500);
      if (run.gold > shownGold) pop($('#hic-goldchip'));
      shownGold = run.gold;
    }
    var hp = run.hp();
    var frac = Math.max(0, Math.min(1, hp / s.maxHp));
    $('#hic-hp').textContent = hp + '/' + s.maxHp;
    $('#hic-hpbar').style.width = (frac * 100) + '%';
    $('#hic-hplag').style.width = (frac * 100) + '%';
    var prev = shownStats;
    if (prev && hp < prev.hp) { var w = $('#hic-hpwrap'); w.classList.remove('hurt'); void w.offsetWidth; w.classList.add('hurt'); }
    [['attack', 'hic-attack', 'hic-st-atk'], ['armor', 'hic-armor', 'hic-st-arm'], ['speed', 'hic-speed', 'hic-st-spd']].forEach(function (k) {
      $('#' + k[1]).textContent = s[k[0]];
      if (prev && prev[k[0]] !== s[k[0]]) pop($('#' + k[2]));
    });
    $('#hic-slots').textContent = run.inv.items.length + '/' + run.inv.maxItems;
    shownStats = { hp: hp, attack: s.attack, armor: s.armor, speed: s.speed };

    var merges = run.availableMerges().length;
    $('#hic-bag').classList.toggle('has', merges > 0);
    $('#hic-bagbadge').textContent = merges;
    $('#hic-bosslabel').textContent = world.bossDue() ? 'HẮN TỚI!' : 'Trùm';
    $('#hic-bossbtn').classList.toggle('due', world.bossDue());
    $('#hic-setcount').textContent = run.inv.sets.length ? run.inv.sets.length + ' bộ' : '';
    renderSlots();
  }

  /* Cột trang bị luôn hiện: nhìn là biết mình đang mang gì, không cần mở túi. */
  function renderSlots() {
    var grid = $('#hic-slotgrid');
    var items = run.inv.items;
    var sig = items.map(function (i) { return i.uid; }).join(',') + '|' + run.inv.maxItems;
    if (grid.__sig === sig) return;
    grid.__sig = sig;
    grid.innerHTML = '';
    var fresh = {};
    for (var i = 0; i < 9; i++) {
      var it = items[i];
      var slot = el('button', 'hic-slot');
      if (i === 0) slot.classList.add('weapon');
      if (it) {
        slot.dataset.uid = it.uid;
        slot.style.setProperty('--rc', global.HIC_ART.RARITY_COLOR[it.rarity] || '#2a3846');
        slot.appendChild(itemIcon(it, 34));
        if (!prevUids[it.uid] && Object.keys(prevUids).length) slot.classList.add('flashin');
        fresh[it.uid] = 1;
        (function (item, node) {
          node.onclick = function (e) { e.stopPropagation(); showTip(item, node); };
        })(it, slot);
      } else if (i < run.inv.maxItems) {
        slot.classList.add('empty');
      } else {
        slot.classList.add('empty', 'locked');
        slot.title = 'Mở khi hạ trùm';
      }
      grid.appendChild(slot);
    }
    prevUids = fresh;
  }

  function showTip(it, anchor) {
    var tip = $('#hic-tip');
    if (tip.__item === it && tip.classList.contains('on')) { hideTip(); return; }
    tip.innerHTML = '';
    tip.__item = it;
    tip.appendChild(itemCard(it));
    tip.classList.add('on');
    var st = $('#hic-stage').getBoundingClientRect(), r = anchor.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var land = $('#hic-stage').classList.contains('land');
    var x = land ? r.right - st.left + 8 : Math.min(st.width - tw - 8, Math.max(8, r.left - st.left - tw / 2 + r.width / 2));
    var y = land ? Math.min(st.height - th - 8, Math.max(8, r.top - st.top)) : r.top - st.top - th - 8;
    tip.style.left = x + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { var t = $('#hic-tip'); t.classList.remove('on'); t.__item = null; }

  /* Icon bay từ thẻ vừa chọn vào đúng ô trang bị. */
  function flyToSlot(it, fromRect) {
    if (!fromRect) return;
    requestAnimationFrame(function () {
      var target = document.querySelector('#hic-slotgrid .hic-slot[data-uid="' + it.uid + '"]');
      if (!target) return;
      var to = target.getBoundingClientRect();
      var icon = itemIcon(it, 40);
      icon.style.position = 'fixed';
      icon.style.left = (fromRect.left + fromRect.width / 2 - 20) + 'px';
      icon.style.top = (fromRect.top + fromRect.height / 2 - 20) + 'px';
      icon.style.zIndex = 99;
      icon.style.pointerEvents = 'none';
      document.body.appendChild(icon);
      var dx = to.left + to.width / 2 - (fromRect.left + fromRect.width / 2);
      var dy = to.top + to.height / 2 - (fromRect.top + fromRect.height / 2);
      target.style.visibility = 'hidden';
      var anim = icon.animate([
        { transform: 'translate(0,0) scale(1.3)', offset: 0 },
        { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 60) + 'px) scale(1.5) rotate(-12deg)', offset: 0.45 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.9)', offset: 1 }
      ], { duration: 520, easing: 'cubic-bezier(.5,0,.3,1)' });
      anim.onfinish = function () {
        icon.remove();
        target.style.visibility = '';
        target.classList.remove('flashin'); void target.offsetWidth; target.classList.add('flashin');
        play('pick');
      };
    });
  }

  /* --------------------------------------------------------------- bố cục */

  function layout() {
    var stage = $('#hic-stage');
    var land = global.innerWidth >= global.innerHeight * 1.05;
    stage.classList.toggle('land', land);
    stage.classList.toggle('port', !land);
    stage.classList.toggle('hic-hide-dpad', !FX.prefs.dpad);
    fitCanvas();
  }

  function fitCanvas() {
    var area = $('#hic-maparea');
    var r = area.getBoundingClientRect();
    dpr = Math.min(3, global.devicePixelRatio || 1);
    viewW = Math.max(1, Math.round(r.width * dpr));
    viewH = Math.max(1, Math.round(r.height * dpr));
    cv.width = viewW; cv.height = viewH;
    /* Hệ số pixel NGUYÊN theo điểm ảnh thiết bị: nhắm khoảng 11 ô theo chiều
       ngắn của bản đồ (tầm nhìn ban ngày là 5 ô mỗi bên + chính mình). Số lẻ thì
       sprite bị nhoè và nhấp nháy khi camera trượt. */
    var shortSide = Math.min(viewW, viewH);
    /* Tile cảnh của atlas vẽ ở lưới 32, còn nhân vật ở lưới 16 — nên K luôn CHẴN:
       tile dùng hệ số K/2, nhân vật dùng K, cả hai đều nguyên. */
    K = Math.max(2, 2 * Math.round(shortSide / (32 * 11)));
    T = 16 * K;
    ctx.imageSmoothingEnabled = false;
  }

  /* --------------------------------------------------------------- bản đồ */

  var TILE_ROLE = {};
  function groundRole(tile) {
    var TT = global.HIC_TILE;
    if (tile === TT.WATER) return 'terrain.water';
    if (tile === TT.PATH) return 'terrain.dirt';
    return 'terrain.grass';
  }
  function overlayRole(tile) {
    var TT = global.HIC_TILE;
    if (tile === TT.TREE) return 'terrain.tree';
    if (tile === TT.ROCK) return 'terrain.rock';
    if (tile === TT.FLOWER) return 'terrain.flower';
    return null;
  }
  function vectorGround(tile) {
    var TT = global.HIC_TILE;
    return tile === TT.WATER ? 'water' : tile === TT.PATH ? 'dirt' : 'grass';
  }
  function vectorOverlay(tile) {
    var TT = global.HIC_TILE;
    return tile === TT.TREE ? 'tree' : tile === TT.ROCK ? 'rock' : tile === TT.FLOWER ? 'flower' : null;
  }

  function hash(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

  function drawGround(tile, sx, sy, x, y) {
    var role = groundRole(tile);
    if (SPR && SPR.has(role)) {
      var g = SPR.group(role);
      var id = g.kind === 'anim' ? SPR.frameAt(role, 'idle', now + hash(x, y) % 700) : SPR.variant(role, hash(x, y));
      var r = SPR.rect(id);
      var sc = T / r[2];
      SPR.drawId(ctx, id, sx + T / 2, sy + T, sc, {});
      return;
    }
    global.HIC_ART.ground(ctx, vectorGround(tile), sx, sy, T);
  }

  function drawOverlay(tile, sx, sy, x, y) {
    var role = overlayRole(tile);
    if (!role && tile !== global.HIC_TILE.FLOWER) return;
    if (role && SPR && SPR.has(role)) {
      var id = SPR.variant(role, hash(x, y) >> 3);
      var r = SPR.rect(id);
      // Cây/đá vẽ theo hệ số pixel chung, nhưng không lọt quá 1,6 ô bề ngang.
      var sc = K;
      while (sc > 1 && r[2] * sc > T * 1.6) sc--;
      var sway = role === 'terrain.tree' ? Math.sin(now / 900 + (x * 0.7 + y * 0.3)) * 0.012 : 0;
      SPR.drawId(ctx, id, sx + T / 2, sy + T - K, sc, { rot: sway });
      return;
    }
    var ov = vectorOverlay(tile);
    if (ov) global.HIC_ART.overlay(ctx, ov, sx, sy, T);
  }

  function drawShadow(cx, by, w) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(Math.round(cx), Math.round(by), w, w * 0.32, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function creatureScale(role, maxW) {
    var sz = SPR.size(role, 'idle');
    var sc = K;
    while (sc > 1 && sz.w * sc > maxW) sc--;
    return sc;
  }

  function drawMonster(m, sx, sy) {
    var cx = sx + T / 2, by = sy + T - K * 2;
    var role = SPR && SPR.creatureRole(m.def.name);
    drawShadow(cx, sy + T - K * 2, T * 0.32);
    var facing = hero.x < m._vx ? -1 : 1;
    var moving = Math.abs(m._vx - m.x) + Math.abs(m._vy - m.y) > 0.05;
    if (role) {
      var g = SPR.group(role);
      var flip = g.face === 'front' ? false : (g.face === 'left' ? facing > 0 : facing < 0);
      var sc = creatureScale(role, T * 1.25);
      var breathe = 1 + Math.sin(now / 320 + m._seed) * 0.03;
      SPR.draw(ctx, role, moving ? 'move' : 'idle', now + m._seed * 97, cx, by, sc, { flip: flip, sy: breathe, sx: 2 - breathe, flash: m._flash || 0 });
    } else {
      global.HIC_ART.shadow(ctx, sx, sy, T);
      global.HIC_ART.mob(ctx, m.def.name, sx, sy, T);
    }
    if (m.awake) {
      // Dấu "!" nảy lên khi nó vừa thấy bạn.
      var p = FX.clamp((now - (m._alertAt || 0)) / 300, 0, 1);
      var s = E.outBack(p);
      ctx.save();
      ctx.translate(Math.round(cx), Math.round(sy - T * 0.18 + Math.sin(now / 150) * K));
      ctx.scale(s, s);
      ctx.fillStyle = '#000';
      ctx.fillRect(-K * 2.5, -K * 8.5, K * 5, K * 12);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(-K * 1.5, -K * 7.5, K * 3, K * 6);
      ctx.fillRect(-K * 1.5, -K * 0.5, K * 3, K * 2.5);
      ctx.restore();
    }
  }

  function drawEvent(ev, sx, sy) {
    var cx = sx + T / 2, by = sy + T - K;
    var role = 'event.' + ev.icon;
    var dim = !!ev.seen;
    // bệ sáng dưới chân
    ctx.save();
    var glow = ctx.createRadialGradient(cx, by - K * 2, 0, cx, by - K * 2, T * 0.62);
    var pulse = 0.35 + Math.sin(now / 420 + ev.x) * 0.1;
    glow.addColorStop(0, dim ? 'rgba(170,190,210,.18)' : 'rgba(255,210,90,' + pulse + ')');
    glow.addColorStop(1, 'rgba(255,210,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - T * 0.2, sy, T * 1.4, T * 1.1);
    ctx.restore();
    if (SPR && SPR.has(role)) {
      var g = SPR.group(role);
      var sz = SPR.size(role, 'idle');
      var sc = K;
      while (sc > 1 && Math.max(sz.w, sz.h * 0.8) * sc > T * 1.3) sc--;
      var id = g.kind === 'anim' ? SPR.frameAt(role, 'idle', now + ev.x * 131) : (g.frames || SPR.frames(role, 'idle'))[0];
      drawShadow(cx, by, sz.w * sc * 0.38);
      SPR.drawId(ctx, id, cx, by, sc, { alpha: dim ? 0.55 : 1 });
    } else {
      global.HIC_ART.event(ctx, ev.icon, sx, sy, T, now, dim);
      return;
    }
    if (!dim) {
      var bob = Math.sin(now / 260 + ev.y) * K * 1.5;
      var ay = sy - T * 0.12 + bob;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.moveTo(cx, ay + K * 5); ctx.lineTo(cx - K * 5, ay - K); ctx.lineTo(cx + K * 5, ay - K); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd452';
      ctx.beginPath(); ctx.moveTo(cx, ay + K * 3); ctx.lineTo(cx - K * 3, ay); ctx.lineTo(cx + K * 3, ay); ctx.closePath(); ctx.fill();
    }
  }

  function drawHero(sx, sy) {
    var cx = sx + T / 2 + hero.bumpX * T, by = sy + T - K * 2 + hero.bumpY * T - hero.hop;
    drawShadow(sx + T / 2 + hero.bumpX * T, sy + T - K * 2, T * (0.3 - hero.hop / T * 0.15));
    if (SPR && SPR.has('hero')) {
      var sc = creatureScale('hero', T * 1.2);
      var squash = hero.landT > 0 ? 1 - hero.landT / 120 * 0.12 : 1;
      SPR.draw(ctx, 'hero', hero.moving ? 'run' : 'idle', hero.animT, cx, by, sc,
        { flip: hero.face < 0, sy: squash, sx: 2 - squash });
    } else {
      global.HIC_ART.shadow(ctx, sx, sy, T);
      global.HIC_ART.hero(ctx, cx - T / 2, by - T + K * 2, T);
    }
  }

  function fogTarget(x, y) {
    if (!world.explored[world.idx(x, y)]) return 1;
    if (!world.visible(x, y)) return world.isNight() ? 0.78 : 0.55;
    return 0;
  }

  /* Sương mù vẽ ở độ phân giải MỘT ĐIỂM ẢNH MỖI Ô rồi phóng lên có làm mịn — nên
     mép sương là một dải mềm chứ không phải bậc thang ô vuông, và độ đậm từng ô
     trượt dần khi tầm nhìn đổi thay vì bật tắt. */
  function drawFog(dt, ox, oy) {
    var W = world.w, H = world.h;
    if (!fogA || fogA.length !== W * H) {
      fogA = new Float32Array(W * H);
      for (var i0 = 0; i0 < fogA.length; i0++) fogA[i0] = 1;
      fogCv = document.createElement('canvas');
      fogCv.width = W + 2; fogCv.height = H + 2;
      fogCtx = fogCv.getContext('2d');
      fogImg = fogCtx.createImageData(W + 2, H + 2);
    }
    var k = 1 - Math.exp(-dt / 110);
    var d = fogImg.data;
    for (var p = 0; p < d.length; p += 4) { d[p] = 6; d[p + 1] = 9; d[p + 2] = 14; d[p + 3] = 255; }
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * W + x;
        fogA[i] += (fogTarget(x, y) - fogA[i]) * k;
        var o = ((y + 1) * (W + 2) + (x + 1)) * 4;
        d[o + 3] = Math.round(fogA[i] * 255);
      }
    }
    fogCtx.putImageData(fogImg, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogCv, 0, 0, W + 2, H + 2, Math.round(ox - T * 1.5), Math.round(oy - T * 1.5), (W + 2) * T, (H + 2) * T);
    ctx.restore();
  }

  function drawMap(dt) {
    var W = world.w, H = world.h;
    // camera bám theo hình nhân vật, trễ một chút
    var tx = hero.x + 0.5 - viewW / T / 2, ty = hero.y + 0.5 - viewH / T / 2;
    var maxX = W - viewW / T, maxY = H - viewH / T;
    tx = maxX < 0 ? maxX / 2 : FX.clamp(tx, 0, maxX);
    ty = maxY < 0 ? maxY / 2 : FX.clamp(ty, 0, maxY);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x = FX.damp(cam.x, tx, 9, dt);
    cam.y = FX.damp(cam.y, ty, 9, dt);
    var ox = Math.round(-cam.x * T + mapFx.shakeX * dpr), oy = Math.round(-cam.y * T + mapFx.shakeY * dpr);

    ctx.fillStyle = '#0a1a10';
    ctx.fillRect(0, 0, viewW, viewH);

    var c0 = Math.floor(cam.x) - 2, c1 = Math.ceil(cam.x + viewW / T) + 1;
    var r0 = Math.floor(cam.y) - 2, r1 = Math.ceil(cam.y + viewH / T) + 2;
    var x, y, sx, sy, tile;

    // lượt 1: nền (ngoài bản đồ là rừng rậm)
    for (y = r0; y <= r1; y++) {
      for (x = c0; x <= c1; x++) {
        sx = ox + x * T; sy = oy + y * T;
        tile = world.inside(x, y) ? world.tiles[world.idx(x, y)] : global.HIC_TILE.GRASS;
        drawGround(tile, sx, sy, x, y);
      }
    }
    // lượt 2: theo hàng từ trên xuống, để thứ đứng dưới che thứ đứng trên
    var hx = Math.floor(hero.x + 0.5), hy = Math.round(hero.y);
    var monstersByRow = {};
    world.monsters.forEach(function (m) {
      if (m._vx == null) { m._vx = m.x; m._vy = m.y; m._seed = hash(m.x, m.y) % 1000; }
      m._vx = FX.damp(m._vx, m.x, 12, dt); m._vy = FX.damp(m._vy, m.y, 12, dt);
      if (m.awake && !m._wasAwake) { m._alertAt = now; if (world.visible(m.x, m.y)) play('alert'); }
      m._wasAwake = m.awake;
      var row = Math.round(m._vy);
      (monstersByRow[row] = monstersByRow[row] || []).push(m);
    });
    for (y = r0; y <= r1; y++) {
      for (x = c0; x <= c1; x++) {
        sx = ox + x * T; sy = oy + y * T;
        if (!world.inside(x, y)) { drawOverlay(global.HIC_TILE.TREE, sx, sy, x, y); continue; }
        tile = world.tiles[world.idx(x, y)];
        if (world.explored[world.idx(x, y)] || fogA === null) {
          drawOverlay(tile, sx, sy, x, y);
          var ev = world.eventAt(x, y);
          if (ev) drawEvent(ev, sx, sy);
        }
      }
      (monstersByRow[y] || []).forEach(function (m) {
        if (!world.visible(m.x, m.y) && !world.visible(Math.round(m._vx), Math.round(m._vy))) return;
        drawMonster(m, ox + m._vx * T, oy + m._vy * T);
      });
      if (y === hy) drawHero(ox + hero.x * T, oy + hero.y * T);
    }

    // đường đang đi
    if (walkQueue.length) {
      for (var q = 0; q < walkQueue.length; q++) {
        var pnt = walkQueue[q], last = q === walkQueue.length - 1;
        var px = ox + pnt.x * T + T / 2, py = oy + pnt.y * T + T / 2;
        var s = last ? K * 3 + Math.sin(now / 120) * K : K * 1.5;
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(Math.round(px - s - K / 2), Math.round(py - s - K / 2 + K), Math.round(s * 2 + K), Math.round(s * 2 + K));
        ctx.fillStyle = last ? '#ffd452' : 'rgba(255,212,82,.75)';
        ctx.fillRect(Math.round(px - s), Math.round(py - s), Math.round(s * 2), Math.round(s * 2));
      }
    }

    // hạt trên bản đồ (bụi chân, đom đóm)
    ctx.save();
    ctx.translate(ox, oy);
    mapFx.draw(ctx, '"VT323",monospace');
    ctx.restore();

    drawFog(dt, ox, oy);

    // Đêm: phủ xanh thẫm, khoét một quầng sáng quanh nhân vật.
    nightMix = FX.damp(nightMix, world.isNight() ? 1 : 0, 2.2, dt);
    if (nightMix > 0.01) {
      var lx = ox + (hero.x + 0.5) * T, ly = oy + (hero.y + 0.4) * T;
      var flick = 1 + Math.sin(now / 90) * 0.015 + Math.sin(now / 37) * 0.01;
      var g = ctx.createRadialGradient(lx, ly, T * 0.6, lx, ly, T * 4.2 * flick);
      g.addColorStop(0, 'rgba(8,10,40,0)');
      g.addColorStop(0.55, 'rgba(8,10,40,' + (0.35 * nightMix) + ')');
      g.addColorStop(1, 'rgba(4,6,24,' + (0.62 * nightMix) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var warm = ctx.createRadialGradient(lx, ly, 0, lx, ly, T * 2.2);
      warm.addColorStop(0, 'rgba(255,170,80,' + (0.16 * nightMix) + ')');
      warm.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = warm;
      ctx.fillRect(lx - T * 3, ly - T * 3, T * 6, T * 6);
      ctx.restore();
    }

    // dấu chạm
    if (tapMark) {
      var tp = (now - tapMark.t) / 380;
      if (tp >= 1) tapMark = null;
      else {
        var mx = ox + tapMark.x * T + T / 2, my = oy + tapMark.y * T + T / 2;
        ctx.save();
        ctx.globalAlpha = 1 - tp;
        ctx.strokeStyle = tapMark.bad ? '#ff5a4a' : '#ffd452';
        ctx.lineWidth = K * 1.5;
        var rr = T * (0.2 + 0.35 * E.outCubic(tp));
        ctx.strokeRect(Math.round(mx - rr), Math.round(my - rr), Math.round(rr * 2), Math.round(rr * 2));
        ctx.restore();
      }
    }
  }

  /* --------------------------------------------------------- nhân vật trượt */

  function heroArrived() {
    return Math.abs(hero.x - world.px) < 0.02 && Math.abs(hero.y - world.py) < 0.02;
  }

  function updateHero(dt) {
    var dx = world.px - hero.x, dy = world.py - hero.y;
    var dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 3) { hero.x = world.px; hero.y = world.py; dist = 0; }   // dịch chuyển (sang tuần mới)
    if (dist > 0.001) {
      // Tốc độ đều một ô mỗi STEP_MS; tụt lại hơn một ô thì tăng tốc cho kịp (bot đi rất nhanh).
      var sp = dt / STEP_MS * Math.max(1, dist);
      if (Math.abs(dx) > 0.001) hero.x += Math.sign(dx) * Math.min(Math.abs(dx), sp);
      else if (Math.abs(dy) > 0.001) hero.y += Math.sign(dy) * Math.min(Math.abs(dy), sp);
      if (Math.abs(dx) > 0.001) hero.face = dx > 0 ? 1 : -1;
      hero.moving = true;
      var frac = (Math.abs(world.px - hero.x) + Math.abs(world.py - hero.y)) % 1;
      hero.hop = Math.sin(frac * Math.PI) * K * 2;
      if (heroArrived()) { hero.x = world.px; hero.y = world.py; hero.hop = 0; hero.landT = 120; }
    } else {
      hero.hop = 0;
      hero.moving = false;
    }
    if (hero.landT > 0) hero.landT -= dt;
    hero.animT += dt;
    hero.bumpX = FX.damp(hero.bumpX, 0, 16, dt);
    hero.bumpY = FX.damp(hero.bumpY, 0, 16, dt);
  }

  /* ------------------------------------------------------------- di chuyển */

  function dust(x, y) {
    mapFx.burst((x + 0.5) * T, (y + 0.9) * T, 4, { color: ['rgba(230,220,190,.7)', 'rgba(200,190,160,.6)'], speed: 30 * K, g: -10 * K, life: 380, size: K * 2, drag: 0.85 });
  }

  function tryStep(dx, dy) {
    if (busy || run.over) return;
    var fromX = world.px, fromY = world.py;
    var wasNight = world.isNight();
    var res = world.step(dx, dy);
    if (res.kind === 'blocked') {
      walkQueue.length = 0;
      hero.bumpX = dx * 0.18; hero.bumpY = dy * 0.18;
      if (dx) hero.face = dx;
      play('bump');
      return;
    }
    if (res.kind === 'monster' && fromX === world.px && fromY === world.py) {
      // Đâm vào quái đứng cạnh: không tốn bước.
      walkQueue.length = 0;
      if (dx) hero.face = dx;
      engage(res.monster);
      return;
    }
    // bước thật
    if (dx) hero.face = dx;
    play('step');
    dust(fromX, fromY);
    if (res.kind === 'monster') {
      walkQueue.length = 0;
      pending = { kind: 'battle', monster: res.monster };
      busy = true;
    } else if (res.kind === 'event') {
      /* Bảng chỉ bật lên khi bạn ĐẾN NƠI, không phải khi đi ngang qua — nếu
         không thì lái buôn "biến mất" chỉ vì người chơi đi ngang. Muốn ghé thì
         chạm vào ô mình đang đứng. */
      if (walkQueue.length === 0) {
        pending = { kind: 'event', event: res.event };
        busy = true;
      } else {
        toast('Đi ngang ' + res.event.name + ' — chạm vào chỗ đang đứng để ghé');
      }
    }
    // Ban đêm, một con quái vừa hiện ra trong tầm mắt thì dừng chân lại.
    if (world.isNight() && walkQueue.length && monsterInSight()) {
      walkQueue.length = 0;
      toast('Có thứ gì đó đang tới.', 'bad');
    }
    if (world.isNight() !== wasNight) phaseChanged();
    if (world.bossDue() && !pending) {
      walkQueue.length = 0;
      pending = { kind: 'boss' };
      busy = true;
    }
    updateHud();
  }

  function phaseChanged() {
    var n = world.isNight();
    if (SFX) SFX.setNight(n);
    if (world.bossDue()) return;
    banner(phaseLabel(), n ? 'Tầm nhìn còn 3 ô — quái thấy là đuổi' : 'Trời sáng. Quái thôi đuổi.', n ? '#8f8cff' : '#ffcf5a');
    play(n ? 'dusk' : 'dawn');
  }

  function monsterInSight() {
    for (var i = 0; i < world.monsters.length; i++) {
      var m = world.monsters[i];
      if (world.visible(m.x, m.y)) return true;
    }
    return false;
  }

  function walkTo(tx, ty) {
    if (busy || run.over) return;
    var path = world.pathTo(tx, ty) || world.pathTo(tx, ty, true);
    if (!path || !path.length) { toast('Không đi tới đó được.'); tapMark = { x: tx, y: ty, t: now, bad: true }; return; }
    walkQueue = path;
  }

  function tick(dt) {
    if (pending && heroArrived()) {
      var p = pending;
      pending = null;
      busy = false;
      if (p.kind === 'event') openEvent(p.event);
      else if (p.kind === 'battle') engage(p.monster);
      else if (p.kind === 'boss') bossArrives();
      return;
    }
    if (busy || pending) return;
    if (!heroArrived()) return;
    if (walkQueue.length) {
      var next = walkQueue.shift();
      tryStep(next.x - world.px, next.y - world.py);
      return;
    }
    if (heldDir && now - lastHeldStep > (now - heldSince < 250 ? 1e9 : 0)) {
      lastHeldStep = now;
      tryStep(heldDir[0], heldDir[1]);
    }
  }

  /* ------------------------------------------------------------- bảng chung */

  function panel(title, hint, opts) {
    opts = opts || {};
    busy = true;
    panelGen++;
    armInput();
    hideTip();
    var wrap = $('#hic-panel');
    wrap.innerHTML = '';
    // Xoá sạch lớp của bảng trước; nếu không thì màu của màn kết thúc dính sang bảng sau.
    wrap.className = 'hic-panel' + (opts.narrow ? ' narrow' : '');
    wrap.style.display = 'flex';
    void wrap.offsetWidth;
    wrap.classList.add('show');
    $('#hic-dim').classList.add('on');
    var head = el('div', 'hic-phead');
    if (opts.icon) head.appendChild(opts.icon);
    head.appendChild(el('h3', null, title));
    if (!opts.noClose) {
      var x = el('button', 'hic-x', '✕');
      x.onclick = closePanel;
      head.appendChild(x);
    }
    wrap.appendChild(head);
    if (hint) wrap.appendChild(el('div', 'hic-hint', hint));
    var body = el('div', 'hic-pbody');
    wrap.appendChild(body);
    if (!opts.silent) play('open');
    return body;
  }

  function closePanel() {
    var wrap = $('#hic-panel');
    if (wrap.style.display !== 'none' && wrap.innerHTML) play('close');
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    $('#hic-dim').classList.remove('on');
    busy = false;
    updateHud();
  }

  function pill(kind, text) {
    var p = el('span', 'hic-pill ' + kind);
    p.appendChild(statIcon(kind, 14));
    p.appendChild(document.createTextNode(text));
    return p;
  }

  function statPills(it) {
    var box = el('div', 'hic-statline'), any = false;
    if (it.health) { box.appendChild(pill('hp', (it.health > 0 ? '+' : '') + it.health)); any = true; }
    if (it.attack || it.bonusAttack) { box.appendChild(pill('atk', ((it.attack || 0) + (it.bonusAttack || 0) > 0 ? '+' : '') + ((it.attack || 0) + (it.bonusAttack || 0)))); any = true; }
    if (it.armor) { box.appendChild(pill('arm', (it.armor > 0 ? '+' : '') + it.armor)); any = true; }
    if (it.speed) { box.appendChild(pill('spd', (it.speed > 0 ? '+' : '') + it.speed)); any = true; }
    return any ? box : null;
  }

  // Giữ nguyên cho bot và mã cũ: một dòng chữ chỉ số.
  function statLine(it) {
    var parts = [];
    if (it.attack) parts.push('Công ' + it.attack);
    if ((it.bonusAttack || 0) > 0) parts.push('Công +' + it.bonusAttack);
    if (it.armor) parts.push('Giáp ' + it.armor);
    if (it.speed) parts.push('Tốc ' + it.speed);
    if (it.health) parts.push('Máu ' + it.health);
    return parts.join('  ');
  }

  function itemCard(it, opts) {
    opts = opts || {};
    var card = el('div', 'hic-card r-' + it.rarity + (it.weapon ? ' weapon' : ''));
    // Gắn luôn món đồ vào thẻ để con bot thử nghiệm đọc được nó đang chọn gì.
    card.__hicItem = it;
    var row = el('div', 'hic-cardrow');
    var ic = itemIcon(it, 46);
    ic.className = 'hic-cardicon';
    row.appendChild(ic);
    var body = el('div', 'hic-cardbody');
    var top = el('div', 'hic-cardtop');
    top.appendChild(el('b', null, vn(it.name)));
    top.appendChild(el('span', 'hic-rar', (it.weapon ? 'Vũ khí · ' : '') + (global.HIC_RARITY_VN[it.rarity] || it.rarity)));
    body.appendChild(top);
    var st = statPills(it);
    if (st) body.appendChild(st);
    var fx = global.HIC_vnEffect(it.name, 'item');
    if (fx) body.appendChild(el('div', 'hic-fx', fx));
    if ((it.tags || []).length) {
      body.appendChild(el('div', 'hic-tags', it.tags.map(function (t) { return global.HIC_TAG_VN[t] || t; }).join(' · ')));
    }
    row.appendChild(body);
    card.appendChild(row);
    if (opts.price != null) {
      var pr = el('div', 'hic-price');
      pr.appendChild(statIcon('gold', 16));
      pr.appendChild(document.createTextNode(opts.price));
      card.appendChild(pr);
      card.style.paddingBottom = '30px';
    }
    if (opts.onPick) {
      card.classList.add('pickable');
      card.onclick = once(function () { opts.onPick(it, card.getBoundingClientRect()); });
    }
    return card;
  }

  /* Một dòng ghép đồ: [hình] + [hình] → [hình]. Một cơ chế không nhìn thấy được
     là một cơ chế chưa làm. */
  function mergeRow(m, opts) {
    opts = opts || {};
    var row = el('div', 'hic-card r-' + (m.kind === 'golem' ? 'golden' : 'cauldron'));
    var line = el('div', 'hic-mergeline');
    m.from.forEach(function (nm, k) {
      if (k) line.appendChild(el('span', 'hic-mergeop', '+'));
      var def = global.HIC_itemDef(nm) || { name: nm };
      var ic = itemIcon(def, 34);
      ic.className = 'hic-mergeicon';
      line.appendChild(ic);
    });
    line.appendChild(el('span', 'hic-mergeop', '→'));
    var made = global.HIC_itemDef(m.to) || { name: m.to };
    var out = itemIcon(made, 44);
    out.className = 'hic-mergeicon';
    line.appendChild(out);
    row.appendChild(line);
    row.appendChild(el('div', 'hic-mergename', vn(m.to)));
    var st = statPills(made);
    if (st) row.appendChild(st);
    var fx = global.HIC_vnEffect(m.to, 'item');
    if (fx) row.appendChild(el('div', 'hic-fx', fx));
    if (opts.showWhere) row.appendChild(el('div', 'hic-where', 'Ghép tại: ' + m.where));
    if (opts.onPick) {
      row.classList.add('pickable');
      row.onclick = once(function () { opts.onPick(m); });
    }
    return row;
  }

  /* ---------------------------------------------------- lắp đồ / thay đồ */

  function takeItem(it, after, fromRect) {
    if (run.canEquip(it)) {
      var before = run.availableMerges().length;
      run.equip(it);
      toast('Đã lắp ' + vn(it.name), 'good');
      var nowM = run.availableMerges();
      if (nowM.length > before) {
        toast('Ghép được: ' + vn(nowM[nowM.length - 1].to) + ' — tìm ' + nowM[nowM.length - 1].where, 'good');
        play('levelUp');
      }
      updateHud();
      if (fromRect) flyToSlot(it, fromRect); else play('pick');
      if (after) after();
      return;
    }
    // Hết ô: bắt chọn món để bỏ ra, và nói rõ đổi thì được gì mất gì.
    var body = panel('Hết ô đồ', 'Bỏ một món để lấy ' + vn(it.name));
    var incoming = itemCard(it);
    incoming.classList.add('incoming');
    body.appendChild(incoming);
    body.appendChild(el('div', 'hic-sechead', 'Bỏ món nào?'));
    var grid = el('div', 'hic-offers');
    run.inv.items.forEach(function (cur, i) {
      if (i === 0) return;    // ô vũ khí không bỏ trống được
      var card = itemCard(cur, {
        onPick: function (_, rect) {
          run.drop(cur.uid);
          run.equip(it);
          toast('Đổi lấy ' + vn(it.name), 'good');
          closePanel();
          flyToSlot(it, rect);
          if (after) after();
        }
      });
      card.appendChild(deltaLine(run.previewStats(it, cur.uid)));
      grid.appendChild(card);
    });
    body.appendChild(grid);
    var skip = el('button', 'hic-btn wide ghost', 'Bỏ qua món này');
    skip.onclick = function () { closePanel(); if (after) after(); };
    body.appendChild(skip);
  }

  /* -------------------------------------------------------------- sự kiện */

  function openEvent(ev) {
    var out = run.openEvent(ev);
    if (ev && (ev.id === 'chest' || ev.id === 'jewelrybox' || ev.id === 'grave')) {
      play('chest');
      mapFx.burst((ev.x + 0.5) * T, (ev.y + 0.4) * T, 16, { color: ['#ffd452', '#fff2a8'], speed: 90 * K, g: 160 * K, life: 600, size: K * 2, angle: -Math.PI / 2, spread: 2 });
    }
    showEventResult(out, ev);
  }

  function evIcon(ev) { return ev ? eventIcon(ev.icon, 30) : null; }

  function showEventResult(out, ev) {
    if (!out) { closePanel(); return; }
    if (out.type === 'info') {
      var b = panel(out.title, null, { narrow: true, icon: evIcon(ev) });
      b.appendChild(el('p', 'hic-note', out.text));
      var ok = el('button', 'hic-btn wide primary', 'Tiếp tục');
      ok.onclick = closePanel;
      b.appendChild(ok);
      return;
    }
    if (out.type === 'rest') {
      var rb = panel(out.title, null, { narrow: true, icon: evIcon(ev) });
      rb.appendChild(el('p', 'hic-note', out.text));
      var s = run.stats();
      rb.appendChild(el('div', 'hic-stats2', 'Máu bây giờ: ' + run.hp() + '/' + s.maxHp +
        '   ·   còn ' + world.stepsLeft + ' bước trong ' + phaseLabel().toLowerCase()));
      var yes = el('button', 'hic-btn wide primary hic-rest-yes',
        out.kind === 'house' ? 'Ngủ tới sáng (máu đầy)' : 'Nghỉ tới sáng (+10 máu)');
      yes.onclick = once(function () {
        var wasNight = world.isNight();
        run.rest(out.kind, ev);
        toast(out.kind === 'house' ? 'Bạn ngủ một giấc. Máu đầy.' : 'Bạn sưởi ấm và chợp mắt.', 'good');
        closePanel();
        play('heal');
        mapFx.burst((world.px + 0.5) * T, (world.py + 0.5) * T, 18, { color: ['#7dff8a', '#d4ffb0'], speed: 20 * K, g: -40 * K, life: 900, size: K * 2, jitter: T });
        if (world.isNight() !== wasNight || !wasNight) { if (SFX) SFX.setNight(world.isNight()); banner(phaseLabel(), 'Một đêm yên giấc', '#ffcf5a'); play('dawn'); }
      });
      var no = el('button', 'hic-btn wide ghost hic-rest-no', 'Đi tiếp, chưa nghỉ');
      no.onclick = closePanel;
      var rowb = el('div', 'hic-btnrow');
      rowb.appendChild(yes); rowb.appendChild(no);
      rb.appendChild(rowb);
      return;
    }
    if (out.type === 'pick') {
      var body = panel(out.title, out.hint, { icon: evIcon(ev) });
      var grid = el('div', 'hic-offers');
      out.offers.forEach(function (it) {
        grid.appendChild(itemCard(it, {
          onPick: function (item, rect) {
            if (ev) ev.used = true;
            closePanel();
            takeItem(it, null, rect);
          }
        }));
      });
      body.appendChild(grid);
      var skip = el('button', 'hic-btn wide ghost', 'Không lấy gì');
      skip.onclick = function () { if (ev) ev.used = true; closePanel(); };
      body.appendChild(skip);
      return;
    }
    if (out.type === 'edge') {
      var eb = panel(out.title, out.hint + ' — hiện tại: ' +
        (run.inv.edge ? vn(run.inv.edge.name) : 'chưa mài'), { icon: evIcon(ev) });
      var eg = el('div', 'hic-offers');
      out.offers.forEach(function (edge) {
        var card = el('div', 'hic-card r-rare pickable');
        var r = el('div', 'hic-cardrow');
        var ic = SPR && SPR.canvasFor('icon.whetstone', 40, {});
        if (ic) { ic.className = 'hic-cardicon'; r.appendChild(ic); }
        var bd = el('div', 'hic-cardbody');
        bd.appendChild(el('b', null, vn(edge.name)));
        bd.appendChild(el('div', 'hic-fx', global.HIC_vnEffect(edge.name, 'edge')));
        r.appendChild(bd);
        card.appendChild(r);
        card.onclick = once(function () {
          run.applyEdge(edge, ev);
          toast('Vũ khí đã được mài: ' + vn(edge.name), 'good');
          closePanel();
          play('forge');
        });
        eg.appendChild(card);
      });
      eb.appendChild(eg);
      var s2 = el('button', 'hic-btn wide ghost', 'Bỏ qua');
      s2.onclick = function () { if (ev) ev.used = true; closePanel(); };
      eb.appendChild(s2);
      return;
    }
    if (out.type === 'oil') {
      /* Vũ khí chỉ nhận được 3 lọ dầu. Khi đã đủ thì các lọ phải TẮT hẳn — cho
         bấm rồi báo "đã đủ" là cái bẫy bấm-mãi-không-thoát. */
      var full = run.inv.oils.length >= 3;
      var ob = panel(out.title, full
        ? 'Vũ khí đã đủ 3 lọ dầu — không bôi thêm được nữa.'
        : out.hint + ' — đã bôi ' + run.inv.oils.length + '/3', { icon: evIcon(ev) });
      var og = el('div', 'hic-offers');
      out.offers.forEach(function (oil) {
        var card = el('div', 'hic-card r-common' + (full ? ' dim' : ' pickable'));
        var r = el('div', 'hic-cardrow');
        var ic = SPR && SPR.canvasFor('icon.oil', 40, {});
        if (ic) { ic.className = 'hic-cardicon'; r.appendChild(ic); }
        var bd = el('div', 'hic-cardbody');
        bd.appendChild(el('b', null, vn(oil.name)));
        var sp = statPills(oil);
        if (sp) bd.appendChild(sp);
        r.appendChild(bd);
        card.appendChild(r);
        if (!full) {
          card.onclick = once(function () {
            run.applyOil(oil, ev);
            toast('Đã bôi ' + vn(oil.name), 'good');
            closePanel();
            play('bubble');
          });
        }
        og.appendChild(card);
      });
      ob.appendChild(og);
      var s3 = el('button', 'hic-btn wide ' + (full ? 'primary' : 'ghost'), full ? 'Đi tiếp' : 'Bỏ qua');
      s3.onclick = function () { if (ev) ev.used = true; closePanel(); };
      ob.appendChild(s3);
      return;
    }
    if (out.type === 'shop') { showShop(out, ev); return; }
    if (out.type === 'golem') { showGolem(ev); return; }
    if (out.type === 'cauldron') { showCauldron(ev); return; }
    if (out.type === 'well') { showWell(ev); return; }
    closePanel();
  }

  function showShop(out, ev) {
    var body = panel(out.title, 'Bạn có ' + run.gold + ' vàng' +
      (run.rerolls ? ' · ' + run.rerolls + ' lượt đổi hàng' : ''), { icon: evIcon(ev), silent: out.silent });
    var grid = el('div', 'hic-offers');
    out.offers.forEach(function (it) {
      /* Món không đủ tiền mua thì làm mờ và KHÔNG bấm được — để nó bấm được rồi
         báo "không đủ vàng" là mời người chơi bấm lại mãi. */
      if (it.price > run.gold) {
        var dim = itemCard(it, { price: it.price });
        dim.classList.add('dim');
        grid.appendChild(dim);
        return;
      }
      grid.appendChild(itemCard(it, {
        price: it.price,
        onPick: function (item, rect) {
          var res = run.buy(it, ev);
          if (!res.ok) {
            if (res.why === 'Hết ô đồ') { closePanel(); takeItemPaid(it, ev, out); return; }
            toast(res.why, 'bad');
            return;
          }
          toast('Đã mua ' + vn(it.name), 'good');
          play('coin');
          closePanel();
          flyToSlot(it, rect);
          updateHud();
          showShop({ title: out.title, offers: out.offers.filter(function (o) { return o !== it; }), silent: true }, ev);
        }
      }));
    });
    body.appendChild(grid);
    if (run.rerolls > 0) {
      var rr = el('button', 'hic-btn wide', 'Đổi hàng khác (' + run.rerolls + ')');
      rr.onclick = once(function () {
        run.rerolls--;
        closePanel();
        showShop({ title: out.title, offers: run.shopStock(3) }, ev);
      });
      body.appendChild(rr);
    }
    var leave = el('button', 'hic-btn wide ghost', 'Đi tiếp');
    leave.onclick = closePanel;
    body.appendChild(leave);
  }

  /* Chênh lệch chỉ số nếu đổi: xanh là được thêm, đỏ là mất đi. */
  function deltaLine(after) {
    var cur = run.stats();
    var keys = [['attack', 'công'], ['armor', 'giáp'], ['speed', 'tốc'], ['maxHp', 'máu']];
    var box = el('div', 'hic-delta');
    var any = false;
    keys.forEach(function (k) {
      var d = after[k[0]] - cur[k[0]];
      if (!d) return;
      any = true;
      box.appendChild(el('span', d > 0 ? 'up' : 'down', (d > 0 ? '+' : '') + d + ' ' + k[1]));
    });
    if (!any) box.appendChild(el('span', 'flat', 'chỉ số không đổi'));
    return box;
  }

  function takeItemPaid(it, ev, out) {
    if (run.gold < it.price) { toast('Không đủ vàng', 'bad'); return; }
    var body = panel('Hết ô đồ', 'Bỏ một món để mua ' + vn(it.name));
    var inc = itemCard(it);
    inc.classList.add('incoming');
    body.appendChild(inc);
    body.appendChild(el('div', 'hic-sechead', 'Bỏ món nào?'));
    var grid = el('div', 'hic-offers');
    run.inv.items.forEach(function (cur, i) {
      if (i === 0) return;
      var card = itemCard(cur, {
        onPick: function (_, rect) {
          run.gold -= it.price;
          run.drop(cur.uid);
          run.equip(it);
          if (ev) ev.used = true;
          toast('Đã mua ' + vn(it.name), 'good');
          play('coin');
          closePanel();
          flyToSlot(it, rect);
        }
      });
      card.appendChild(deltaLine(run.previewStats(it, cur.uid)));
      grid.appendChild(card);
    });
    body.appendChild(grid);
    var no = el('button', 'hic-btn wide ghost', 'Thôi');
    no.onclick = function () { closePanel(); showShop(out, ev); };
    body.appendChild(no);
  }

  function showGolem(ev) {
    var pairs = run.golemPairs();
    var body = panel('Golem thợ rèn', pairs.length
      ? 'Hai món giống hệt nhau ghép thành một bản mạnh gấp đôi. Hai ô đồ dồn thành một.'
      : 'Ghép cần hai món GIỐNG HỆT nhau — bạn chưa có cặp nào.', { icon: evIcon(ev), narrow: !pairs.length });
    pairs.forEach(function (p) {
      body.appendChild(mergeRow(
        { kind: 'golem', from: [p.from, p.from], to: p.to, where: 'Golem thợ rèn' },
        { onPick: function () {
            var made = run.golemCombine(p, ev);
            if (made) { toast('Rèn ra ' + vn(made.name), 'good'); play('forge'); setTimeout(function () { play('levelUp'); }, 420); }
            closePanel();
          } }));
    });
    if (!pairs.length) {
      body.appendChild(el('div', 'hic-note',
        'Bản mạ vàng nhân đôi hiệu ứng của món gốc, bản kim cương nhân bốn. ' +
        'Hai bản mạ vàng giống nhau lại ghép được thành kim cương.'));
    }
    var out = el('button', 'hic-btn wide ' + (pairs.length ? 'ghost' : 'primary'), 'Đi tiếp');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  function showCauldron(ev) {
    var recipes = run.cauldronRecipes();
    var body = panel('Vạc nấu', recipes.length
      ? 'Hai món ăn nấu thành một món mới, mạnh hơn cả hai.'
      : 'Bạn chưa có đủ nguyên liệu cho công thức nào.', { icon: evIcon(ev) });
    recipes.forEach(function (dish) {
      body.appendChild(mergeRow(
        { kind: 'cauldron', from: dish.parts.slice(), to: dish.name, where: 'Vạc nấu' },
        { onPick: function () {
            var made = run.cauldronCook(dish, ev);
            if (made) { toast('Nấu xong ' + vn(made.name), 'good'); play('bubble'); }
            closePanel();
          } }));
    });
    if (!recipes.length) {
      body.appendChild(el('div', 'hic-note', 'Vài công thức có trong vùng này:'));
      var grid = el('div', 'hic-offers');
      global.HIC_POOL.cauldron.slice(0, 4).forEach(function (dish) {
        if (!dish.parts || dish.parts.length !== 2) return;
        var r = mergeRow({ kind: 'cauldron', from: dish.parts.slice(), to: dish.name, where: 'Vạc nấu' }, {});
        r.classList.add('dim');
        grid.appendChild(r);
      });
      body.appendChild(grid);
    }
    var out = el('button', 'hic-btn wide ' + (recipes.length ? 'ghost' : 'primary'), 'Đi tiếp');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  function showWell(ev) {
    var canWish = run.gold >= 20;
    var body = panel('Giếng ước', (canWish ? 'Bạn có ' : 'Bạn mới có ') + run.gold + ' vàng. Một điều ước tốn 20.',
      { icon: evIcon(ev), narrow: true });
    /* Nút không dùng được thì phải TẮT, không phải bấm rồi báo lỗi. */
    function wish(label, choice) {
      var b = el('button', 'hic-btn wide' + (canWish ? '' : ' ghost'), label);
      if (!canWish) { b.disabled = true; return b; }
      b.onclick = once(function () {
        var out = run.wellWish(choice, ev);
        if (!out) return;
        play('coin');
        closePanel();
        showEventResult(out, ev);
      });
      return b;
    }
    body.appendChild(wish('Xin một món hiếm', 'chest'));
    body.appendChild(wish('Xin 5 lượt đổi hàng', 'rerolls'));
    var c = el('button', 'hic-btn wide' + (canWish ? ' ghost' : ' primary'), 'Đi tiếp');
    c.onclick = closePanel;
    body.appendChild(c);
  }

  /* ---------------------------------------------------------------- túi đồ */

  function showInventory() {
    if (busy) return;
    var s = run.stats();
    var body = panel('Trang bị');
    var stats = el('div', 'hic-statgrid');
    [['Máu', run.hp() + '/' + s.maxHp, 'hp'], ['Công', s.attack, 'atk'],
     ['Giáp', s.armor, 'arm'], ['Tốc', s.speed, 'spd']].forEach(function (d) {
      var box = el('div', 'hic-statbox ' + d[2]);
      var b = el('b');
      b.appendChild(statIcon(d[2], 18));
      b.appendChild(document.createTextNode(String(d[1])));
      box.appendChild(b);
      box.appendChild(el('span', null, d[0]));
      stats.appendChild(box);
    });
    body.appendChild(stats);

    var wrap = el('div', 'hic-gearwrap');
    var left = el('div'), right = el('div');
    wrap.appendChild(left); wrap.appendChild(right);
    body.appendChild(wrap);

    left.appendChild(el('div', 'hic-sechead', 'Vũ khí'));
    var w = run.inv.items[0];
    if (w) { var wc = itemCard(w); left.appendChild(wc); }
    var extra = [];
    if (run.inv.edge) extra.push('Lưỡi mài: ' + vn(run.inv.edge.name) + ' — ' + global.HIC_vnEffect(run.inv.edge.name, 'edge'));
    if (run.inv.oils.length) extra.push('Dầu (' + run.inv.oils.length + '/3): ' + run.inv.oils.map(function (o) { return vn(o.name); }).join(', '));
    if (extra.length) left.appendChild(el('div', 'hic-hint', extra.join('\n')));

    left.appendChild(el('div', 'hic-sechead', 'Đồ mặc — ' + (run.inv.items.length - 1) + '/' + (run.inv.maxItems - 1) + ' ô'));
    var grid = el('div', 'hic-gear');
    var detail = el('div', 'hic-detail');
    function showDetail(it) {
      detail.innerHTML = '';
      if (!it) { detail.appendChild(el('div', 'hic-note', 'Chạm vào một ô để xem món đó.')); return; }
      detail.appendChild(itemCard(it));
    }
    for (var i = 1; i < run.inv.maxItems; i++) {
      var it = run.inv.items[i];
      var cell = el('button', 'hic-slot' + (it ? '' : ' empty'));
      if (it) {
        cell.appendChild(itemIcon(it, 40));
        cell.style.setProperty('--rc', global.HIC_ART.RARITY_COLOR[it.rarity] || '#3a4a5c');
        cell.title = vn(it.name);
        (function (item, node) {
          node.onclick = function () {
            var was = grid.querySelector('.sel');
            if (was) was.classList.remove('sel');
            node.classList.add('sel');
            showDetail(item);
          };
        })(it, cell);
      } else {
        cell.onclick = function () { showDetail(null); };
      }
      grid.appendChild(cell);
    }
    left.appendChild(grid);
    var first = grid.querySelector('.hic-slot:not(.empty)');
    if (first) first.classList.add('sel');
    showDetail(run.inv.items[1] || null);
    left.appendChild(detail);

    var merges = run.availableMerges();
    right.appendChild(el('div', 'hic-sechead', 'Ghép đồ' + (merges.length ? ' — ' + merges.length + ' phép ghép đang làm được' : '')));
    if (merges.length) {
      merges.forEach(function (m) { right.appendChild(mergeRow(m, { showWhere: true })); });
    } else {
      right.appendChild(el('div', 'hic-note',
        'Hai món GIỐNG HỆT nhau ghép được thành bản mạ vàng (hiệu ứng nhân đôi) tại ' +
        'Golem thợ rèn, và hai bản mạ vàng lại thành kim cương (nhân bốn). ' +
        'Hai món ăn nấu thành món mới tại Vạc nấu. Ghép xong hai ô đồ dồn lại còn một.'));
    }

    right.appendChild(el('div', 'hic-sechead', 'Bộ đồ'));
    var have = {};
    run.inv.items.forEach(function (x) { have[global.HIC_baseName(x.name)] = true; });
    if (run.inv.edge) have[run.inv.edge.name] = true;
    var complete = {};
    run.inv.sets.forEach(function (x) { complete[x.name] = true; });
    global.HIC_DATA.sets.forEach(function (st) {
      var got = st.parts.filter(function (part) { return have[part]; });
      if (!got.length && !complete[st.name]) return;
      var c = el('div', 'hic-setrow' + (complete[st.name] ? ' done' : ''));
      var head = el('div', 'hic-setname');
      head.appendChild(el('b', null, vn(st.name)));
      head.appendChild(el('span', null, got.length + '/' + st.parts.length));
      c.appendChild(head);
      var pieces = el('div', 'hic-setparts');
      st.parts.forEach(function (part) {
        var def = global.HIC_itemDef(part) || { name: part };
        var pi = itemIcon(def, 28);
        pi.className = 'hic-setpiece' + (have[part] ? '' : ' miss');
        pi.title = vn(part);
        pieces.appendChild(pi);
      });
      c.appendChild(pieces);
      c.appendChild(el('div', 'hic-fx', global.HIC_vnEffect(st.name, 'set')));
      right.appendChild(c);
    });
    if (!Object.keys(complete).length) {
      right.appendChild(el('div', 'hic-note', 'Đủ mọi món trong một bộ thì bộ đó cộng thêm. Bản mạ vàng và kim cương vẫn tính là món gốc.'));
    }
    var out = el('button', 'hic-btn wide ghost', 'Đóng');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  /* Cẩm nang: mọi loại ô, mọi luật, gom vào một chỗ tra được bất cứ lúc nào. */
  function showGuide() {
    if (busy) return;
    var body = panel('Cẩm nang', 'Mọi thứ trên bản đồ nghĩa là gì');
    body.appendChild(el('div', 'hic-sechead', 'Địa điểm — chạm vào để ghé'));
    var P = global.HIC_PLACE_INFO;
    var gg = el('div', 'hic-guides');
    global.HIC_WORLD_CONST.EVENTS.forEach(function (e) {
      var info = P[e.id];
      if (!info) return;
      var row = el('div', 'hic-guide');
      var ic = eventIcon(info.icon, 44);
      ic.className = 'hic-guideicon';
      row.appendChild(ic);
      var bodyCol = el('div', 'hic-guidebody');
      bodyCol.appendChild(el('b', null, info.name));
      bodyCol.appendChild(el('div', 'hic-fx', info.what));
      bodyCol.appendChild(el('div', 'hic-where', info.gone));
      row.appendChild(bodyCol);
      gg.appendChild(row);
    });
    body.appendChild(gg);

    body.appendChild(el('div', 'hic-sechead', 'Quái'));
    var mrow = el('div', 'hic-guide');
    var mi = mobIcon('Wolf Level 1', 44);
    mi.className = 'hic-guideicon';
    mrow.appendChild(mi);
    var mb = el('div', 'hic-guidebody');
    mb.appendChild(el('b', null, 'Quái đi lang thang'));
    mb.appendChild(el('div', 'hic-fx',
      'Ban ngày chúng đứng yên, kể cả khi nhìn thấy bạn. Ban đêm, thấy là đuổi — ' +
      'dấu "!" đỏ trên đầu nghĩa là nó đã thấy bạn. Chạm vào con đứng cạnh để đánh; ' +
      'đánh nhau không tốn bước chân.'));
    mb.appendChild(el('div', 'hic-where', 'Giết quái được vàng. Máu mất đi thì không tự hồi.'));
    mrow.appendChild(mb);
    body.appendChild(mrow);

    [['Thời gian', 'Một tuần có 3 ngày và 3 đêm, rồi con trùm tới — thanh trên cùng là đồng hồ, đầu lâu ở cuối là hắn. ' +
      'Ngày dài 50 bước, đêm dài 30 bước. Thời gian CHỈ trôi khi bạn bước — đứng nghĩ bao lâu cũng được. ' +
      'Ban ngày nhìn xa 5 ô, ban đêm còn 3 ô. Hạ được trùm thì sang tuần sau và được thêm 2 ô đồ: 5 → 7 → 9.'],
     ['Trận đánh', 'Bạn không bấm gì trong trận. Ai có tốc cao hơn đánh trước, hoà thì bạn đi trước. ' +
      'Sát thương ăn hết giáp rồi mới vào máu. Giáp hồi lại sau mỗi trận, máu thì không. ' +
      'Gai đánh ngược lại người vừa đánh bạn rồi biến mất. Ô đồ nào vừa kích sẽ sáng lên dưới chân bạn.'],
     ['Ghép đồ', 'Hai món GIỐNG HỆT nhau ghép được thành bản mạ vàng — hiệu ứng nhân đôi — tại Golem thợ rèn. ' +
      'Hai bản mạ vàng lại thành kim cương, nhân bốn. Hai món ăn nấu thành món mới tại Vạc nấu. ' +
      'Ghép xong hai ô đồ dồn lại còn một, nên đó cũng là cách dọn chỗ.'],
     ['Ô đồ', 'Không có túi chứa riêng: thứ gì bạn mang theo đều đang mặc trên người — xem ở cột trang bị. ' +
      'Mỗi món nhặt lên là một lựa chọn bỏ đi món khác. Một ô luôn dành cho vũ khí.'],
     ['Điều khiển', 'Chạm một ô để đi tới đó, chạm con quái đứng cạnh để đánh, chạm vào chính mình để ghé ô đang đứng. ' +
      'Giữ nút mũi tên để đi liên tục. Trên máy tính: WASD / phím mũi tên, I mở túi đồ, H mở cẩm nang.']
    ].forEach(function (s) {
      body.appendChild(el('div', 'hic-sechead', s[0]));
      body.appendChild(el('div', 'hic-note', s[1]));
    });
    var out = el('button', 'hic-btn wide ghost', 'Đóng');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  function showSettings() {
    if (busy) return;
    var body = panel('Cài đặt', null, { narrow: true });
    function toggle(label, get, set) {
      var b = el('button', 'hic-toggle');
      var span = el('span', null, label), i = el('i');
      b.appendChild(span); b.appendChild(i);
      function paint() { var on = get(); b.classList.toggle('on', on); i.textContent = on ? 'BẬT' : 'TẮT'; }
      b.onclick = function () { set(); paint(); };
      paint();
      return b;
    }
    body.appendChild(toggle('Tiếng động', function () { return SFX.prefs().sfx; }, function () { SFX.toggle('sfx'); }));
    body.appendChild(toggle('Nhạc nền', function () { return SFX.prefs().music; }, function () { SFX.toggle('music'); }));
    body.appendChild(toggle('Rung màn hình', function () { return FX.prefs.shake; }, function () { FX.setPref('shake', !FX.prefs.shake); }));
    body.appendChild(toggle('Nút mũi tên trên bản đồ', function () { return FX.prefs.dpad; }, function () { FX.setPref('dpad', !FX.prefs.dpad); layout(); }));
    if (document.documentElement.requestFullscreen) {
      var fs = el('button', 'hic-btn wide', document.fullscreenElement ? 'Thoát toàn màn hình' : 'Toàn màn hình (xoay ngang)');
      fs.onclick = function () { toggleFullscreen(); closePanel(); };
      body.appendChild(fs);
    }
    var nr = el('button', 'hic-btn wide danger', 'Bỏ ván này, chơi lại');
    nr.onclick = once(function () { closePanel(); newRun(); });
    body.appendChild(nr);
    var c = el('button', 'hic-btn wide ghost', 'Đóng');
    c.onclick = closePanel;
    body.appendChild(c);
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      var p = document.documentElement.requestFullscreen();
      if (p && p.then) p.then(function () {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { /* máy không cho khoá */ });
      }).catch(function () { /* trình duyệt từ chối */ });
    } catch (e) { /* không hỗ trợ */ }
  }

  function showBossPreview() {
    if (busy) return;
    var def = run.boss;
    var body = panel('Hắn đang tới', 'Con trùm cuối tuần ' + run.week, { narrow: true });
    var card = el('div', 'hic-card r-heroic');
    var row = el('div', 'hic-bosscard');
    var art = el('div', 'hic-bossart');
    var icon = mobIcon(def.name, 100);
    art.appendChild(icon);
    row.appendChild(art);
    var col = el('div', 'hic-cardbody');
    col.appendChild(el('b', null, vn(def.name)));
    var pills = el('div', 'hic-statline');
    pills.appendChild(pill('hp', def.health));
    pills.appendChild(pill('atk', def.attack || 0));
    pills.appendChild(pill('arm', def.armor || 0));
    pills.appendChild(pill('spd', def.speed || 0));
    col.appendChild(pills);
    var fx = global.HIC_vnEffect(def.name, 'creature');
    if (fx) col.appendChild(el('div', 'hic-fx', fx));
    row.appendChild(col);
    card.appendChild(row);
    body.appendChild(card);

    if (world.bossDue()) {
      var face = el('button', 'hic-btn wide danger', 'Ra đối mặt');
      face.onclick = once(function () { closePanel(); startBattle({ def: def, boss: true }); });
      body.appendChild(face);
      return;
    }
    /* Nút an toàn phải là nút chính. Đặt "gọi trùm sớm" lên đầu là mời người chơi
       bấm nhầm vào thứ kết thúc ván của họ. */
    var keep = el('button', 'hic-btn wide primary', 'Chuẩn bị tiếp');
    keep.onclick = closePanel;
    body.appendChild(keep);
    body.appendChild(el('div', 'hic-note', 'Gọi hắn tới sớm thì bỏ luôn phần thời gian còn lại của tuần — bạn không kịp nhặt thêm gì nữa.'));
    var early = el('button', 'hic-btn wide ghost', 'Gọi hắn tới sớm');
    early.onclick = once(function () { closePanel(); startBattle({ def: def, boss: true }); });
    body.appendChild(early);
  }

  /* --------------------------------------------------------------- trận đánh */

  /* Bước vào quái: nhân vật nhún tới, màn loé, rồi mới sang cảnh đánh. */
  function engage(monster) {
    busy = true;
    var dx = monster.x - world.px, dy = monster.y - world.py;
    hero.bumpX = dx * 0.35; hero.bumpY = dy * 0.35;
    monster._flash = 1;
    mapFx.shake(3);
    play('swing');
    setTimeout(function () { busy = false; startBattle(monster); }, 200);
  }

  function startBattle(target) {
    busy = true;
    hideTip();
    var def = target.def;
    var res = run.fight(def);
    if (!def.boss) world.removeMonster(target);
    playBattle(res, def, target);
  }

  function playBattle(res, def) {
    var wrap = $('#hic-battle');
    panelGen++;
    armInput();
    wrap.style.display = 'block';
    wrap.innerHTML = '';
    wrap.classList.remove('show'); void wrap.offsetWidth; wrap.classList.add('show');

    var scene = el('canvas', 'hic-scene');
    wrap.appendChild(scene);

    // --- thanh máu hai bên
    var hud = el('div', 'hic-bhud');
    function side(cls, name) {
      var s = el('div', 'hic-bside ' + cls);
      s.appendChild(el('div', 'hic-bname', name));
      var bar = el('div', 'hic-bbar');
      var lag = el('i', 'lag'), hp = el('i', 'hp'), ar = el('i', 'ar'), txt = el('span');
      bar.appendChild(lag); bar.appendChild(hp); bar.appendChild(ar); bar.appendChild(txt);
      s.appendChild(bar);
      var chips = el('div', 'hic-bchips');
      var pAtk = pill('atk', '0'), pArm = pill('arm', '0'), pSpd = pill('spd', '0');
      chips.appendChild(pAtk); chips.appendChild(pArm); chips.appendChild(pSpd);
      s.appendChild(chips);
      hud.appendChild(s);
      return { lag: lag, hp: hp, ar: ar, txt: txt, atk: pAtk, arm: pArm, spd: pSpd, name: s.firstChild, last: null };
    }
    var sides = [side('me', 'Bạn'), side('foe', vn(def.name))];
    wrap.appendChild(hud);

    // --- ô đồ của người chơi, sáng lên khi kích
    var items = el('div', 'hic-bitems');
    var slotBy = {};
    run.inv.items.forEach(function (it, i) {
      var s = el('div', 'hic-slot' + (i === 0 ? ' weapon' : ''));
      s.style.setProperty('--rc', global.HIC_ART.RARITY_COLOR[it.rarity] || '#2a3846');
      s.appendChild(itemIcon(it, 30));
      items.appendChild(s);
      slotBy[global.HIC_baseName(it.name)] = s;
      if (i === 0) slotBy.__weapon = s;
    });
    wrap.appendChild(items);

    var feed = el('div', 'hic-bfeed');
    wrap.appendChild(feed);
    var result = el('div', 'hic-bresult');
    wrap.appendChild(result);

    var foot = el('div', 'hic-bfoot');
    var speeds = [1, 2, 4];
    var si = Math.max(0, speeds.indexOf(FX.prefs.fast || 1));
    var speedBtn = el('button', 'hic-btn', '▶ x' + speeds[si]);
    var skip = el('button', 'hic-btn', 'Bỏ qua ⏭');
    var done = el('button', 'hic-btn primary', 'Tiếp tục');
    done.style.display = 'none';
    foot.appendChild(speedBtn);
    foot.appendChild(skip);
    foot.appendChild(done);
    wrap.appendChild(foot);

    function setPill(p, v) {
      var t = p.lastChild;
      if (t.textContent !== String(v)) {
        t.textContent = v;
        p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop');
      }
    }
    function paintSide(i, s) {
      var d = sides[i];
      var frac = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
      d.hp.style.width = (frac * 100) + '%';
      d.lag.style.width = (frac * 100) + '%';
      d.ar.style.width = (Math.min(1, s.armor / Math.max(1, s.maxHp)) * 100) + '%';
      d.txt.textContent = s.hp + '/' + s.maxHp + (s.armor ? '  🛡' + s.armor : '');
      setPill(d.atk, s.attack);
      setPill(d.arm, s.armor);
      setPill(d.spd, s.speed);
    }

    var fight = new global.HIC_Fight(scene, res, def.name, !!def.boss, {
      night: world.isNight(),
      speed: speeds[si],
      hooks: {
        snap: function (ln) {
          paintSide(0, ln.a);
          paintSide(1, ln.b);
          // Cùng một dòng có thể được hiện hai lần (mở màn rồi tới lượt đọc) — chỉ ghi một lần.
          if (ln.t && ln.k !== 'armorloss' && !ln.__fed) {
            ln.__fed = true;
            feed.appendChild(el('div', 'hic-tline', ln.t));
            while (feed.childNodes.length > 4) feed.removeChild(feed.firstChild);
          }
        },
        trigger: function (sideIdx, key) {
          if (sideIdx !== 0) return;
          var s = slotBy[key];
          if (!s) return;
          s.classList.remove('trig'); void s.offsetWidth; s.classList.add('trig');
        }
      }
    });

    function finish() {
      result.className = 'hic-bresult on ' + (res.playerWon ? 'win' : 'lose');
      result.innerHTML = '';
      result.appendChild(el('b', null, res.playerWon ? 'CHIẾN THẮNG' : 'GỤC NGÃ'));
      var gold = res.playerWon ? (res.goldDelta || 0) + (def.boss ? 0 : (def.gold || 1)) : 0;
      if (gold > 0) result.appendChild(el('small', null, '+' + gold + ' vàng'));
      speedBtn.style.display = 'none';
      skip.style.display = 'none';
      done.style.display = '';
      done.textContent = res.playerWon ? (def.boss ? 'Sang tuần mới' : 'Tiếp tục') : 'Xem kết quả';
    }

    speedBtn.onclick = function () {
      si = (si + 1) % speeds.length;
      fight.speed = speeds[si];
      FX.setPref('fast', speeds[si]);
      speedBtn.textContent = '▶ x' + speeds[si];
    };
    skip.onclick = function () { fight.skip(); };
    done.onclick = once(function () {
      fight.stop();
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      busy = false;
      afterBattle(res, def);
    });

    // Chờ một khung hình để canvas có kích thước thật rồi mới dựng cảnh.
    requestAnimationFrame(function () { fight.run(finish); });
  }

  function afterBattle(res, def) {
    if (!res.playerWon) { gameOver(); return; }
    updateHud();
    if (def.boss) {
      if (run.week >= 4) { victory(); return; }
      run.nextWeek();
      world = run.world;
      fogA = null; cam.init = false;
      hero.x = world.px; hero.y = world.py;
      if (SFX) SFX.setNight(false);
      prevUids = {};
      updateHud();
      banner('Tuần ' + run.week, 'Thêm 2 ô đồ. Một con trùm mạnh hơn đang tới.', '#ffd452');
      play('levelUp');
      setTimeout(showBossPreview, 900);
    }
    save();
  }

  function bossArrives() {
    if (busy) return;
    play('boss');
    mapFx.shake(8);
    banner('HẮN ĐÃ TỚI', 'Không còn chỗ nào để trốn', '#ff3b3b');
    busy = true;
    setTimeout(function () {
      busy = false;
      var body = panel('Hết ba ngày', 'Hắn đã tới. Không còn chỗ nào để trốn.', { narrow: true, noClose: true });
      var art = el('div', 'hic-bossart');
      art.style.margin = '0 auto';
      art.appendChild(mobIcon(run.boss.name, 100));
      body.appendChild(art);
      body.appendChild(el('b', null, vn(run.boss.name))).style.textAlign = 'center';
      var go = el('button', 'hic-btn wide danger', 'Ra đối mặt');
      go.onclick = once(function () { closePanel(); startBattle({ def: run.boss, boss: true }); });
      body.appendChild(go);
    }, 1100);
  }

  /* --------------------------------------------------------- kết thúc ván */

  function endScreen(title, text, cls) {
    busy = true;
    var body = panel(title, null, { narrow: true, noClose: true, silent: true });
    body.parentNode.classList.add(cls);
    body.appendChild(el('p', 'hic-note', text));
    var st = el('div', 'hic-statgrid');
    [['Tuần', run.week], ['Trùm', run.bossesKilled], ['Quái', run.kills], ['Vàng', run.gold]].forEach(function (d) {
      var box = el('div', 'hic-statbox');
      box.appendChild(el('b', null, String(d[1])));
      box.appendChild(el('span', null, d[0]));
      st.appendChild(box);
    });
    body.appendChild(st);
    body.appendChild(el('div', 'hic-stats2', 'Tuần ' + run.week + '  ·  ' + run.bossesKilled + ' trùm  ·  ' + run.kills + ' quái  ·  ' + run.gold + ' vàng'));
    var again = el('button', 'hic-btn wide primary', 'Ván mới');
    again.onclick = once(function () { newRun(); });
    body.appendChild(again);
  }

  function gameOver() {
    run.over = true;
    try { localStorage.removeItem('hic.save.v1'); } catch (e) { /* trình duyệt chặn */ }
    endScreen('Bạn chết', 'Rừng giữ bạn lại. Ván này dừng ở đây.', 'over');
  }
  function victory() {
    run.over = true;
    run.won = true;
    play('win');
    endScreen('Sống sót', 'Bạn đã đi qua cả bốn tuần. Ít ai làm được.', 'win');
  }

  function save() {
    try { global.HIC_saveMeta(run.toJSON()); } catch (e) { /* không lưu được thì thôi */ }
  }

  /* ------------------------------------------------------------------- boot */

  function newRun(seed) {
    run = new global.HIC_Run(seed || (Date.now() >>> 0));
    world = run.world;
    walkQueue = [];
    pending = null;
    busy = false;
    fogA = null;
    cam.init = false;
    hero.x = world.px; hero.y = world.py; hero.face = 1;
    prevUids = {};
    shownGold = 0; shownStats = null;
    $('#hic-gold').textContent = '0';
    $('#hic-panel').style.display = 'none';
    $('#hic-panel').className = 'hic-panel';
    $('#hic-panel').innerHTML = '';
    $('#hic-dim').classList.remove('on');
    $('#hic-battle').style.display = 'none';
    global.HIC_RUN = run;
    if (SFX) SFX.setNight(false);
    buildClock();
    layout();
    updateHud();
    toast('Ba ngày. Rồi hắn tới.');
    showBossPreview();
  }

  var lastMapTap = 0;

  function bindInput() {
    guardContainer($('#hic-panel'));
    guardContainer($('#hic-battle'));

    // Mở khoá âm thanh ở cú chạm đầu tiên — điện thoại không cho phát trước đó.
    var unlock = function () { if (SFX) SFX.unlock(); };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });

    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('#hic-tip') && !e.target.closest('#hic-slotgrid')) hideTip();
    });

    cv.addEventListener('pointerdown', function (e) {
      // Chặn sự kiện chuột giả lập sau cú chạm — "click ma" rơi trúng nút vừa hiện ra.
      e.preventDefault();
      var t = Date.now();
      if (t - lastMapTap < 140) return;
      lastMapTap = t;
      if (busy || pending || run.over) return;
      var rect = cv.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * dpr, my = (e.clientY - rect.top) * dpr;
      var ox = Math.round(-cam.x * T), oy = Math.round(-cam.y * T);
      var tx = Math.floor((mx - ox) / T), ty = Math.floor((my - oy) / T);
      if (!world.inside(tx, ty)) return;
      tapMark = { x: tx, y: ty, t: now };
      var adj = Math.abs(tx - world.px) + Math.abs(ty - world.py);
      if (adj === 0) { if (!openHere()) toast('Không có gì ở chỗ này.'); return; }
      if (adj === 1 && heroArrived()) { walkQueue = []; tryStep(tx - world.px, ty - world.py); return; }
      walkTo(tx, ty);
    });

    [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]].forEach(function (d) {
      var b = $('#hic-' + d[0]);
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* cũ */ }
        walkQueue = [];
        heldDir = [d[1], d[2]];
        heldSince = now;
        b.classList.add('on');
        if (heroArrived()) tryStep(d[1], d[2]);
      });
      var up = function () { if (heldDir && heldDir[0] === d[1] && heldDir[1] === d[2]) heldDir = null; b.classList.remove('on'); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    });

    $('#hic-bag').onclick = showInventory;
    $('#hic-help').onclick = showGuide;
    $('#hic-settings').onclick = showSettings;
    $('#hic-bossbtn').onclick = showBossPreview;
    $('#hic-dim').onclick = function () {
      // Bấm ra ngoài bảng = đóng, trừ những bảng không có nút ✕.
      if ($('#hic-panel .hic-x')) closePanel();
    };
    $('#hic-wait').onclick = function () {
      if (busy || run.over) return;
      walkQueue = [];
      if (!openHere()) toast('Đứng yên thì thời gian cũng đứng yên.');
    };

    var keyDir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    global.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#hic-panel').style.display === 'flex' && $('#hic-panel .hic-x')) { closePanel(); return; }
      if (busy || run.over) return;
      var m = keyDir[e.key];
      if (m) {
        e.preventDefault();
        walkQueue = [];
        if (!e.repeat) { heldDir = m; heldSince = now; if (heroArrived()) tryStep(m[0], m[1]); }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') openHere();
      if (e.key === 'i') showInventory();
      if (e.key === '?' || e.key === 'h') showGuide();
    });
    global.addEventListener('keyup', function (e) {
      var m = keyDir[e.key];
      if (m && heldDir && heldDir[0] === m[0] && heldDir[1] === m[1]) heldDir = null;
    });
    global.addEventListener('blur', function () { heldDir = null; });

    global.addEventListener('resize', layout);
    if (global.visualViewport) global.visualViewport.addEventListener('resize', layout);
  }

  function ambient(dt) {
    // đom đóm quanh nhân vật về đêm, lá rơi ban ngày — thưa thôi.
    if (Math.random() < dt / (world.isNight() ? 180 : 700)) {
      var x = (hero.x + (Math.random() - 0.5) * 12) * T, y = (hero.y + (Math.random() - 0.5) * 9) * T;
      if (world.isNight()) {
        mapFx.particle({ x: x, y: y, vx: (Math.random() - 0.5) * 12 * K, vy: -6 * K, g: 0, drag: 1, life: 2600, size: K * 1.5, color: '#d8ff7a', glow: true, shape: 'sq' });
      } else {
        mapFx.particle({ x: x, y: y - T * 3, vx: 10 * K, vy: 12 * K, g: 0, drag: 1, life: 3200, size: K * 1.5, color: Math.random() < 0.5 ? '#8fcf5a' : '#e0b04a', shape: 'sq', shrink: false });
      }
    }
  }

  function frame(ts) {
    var dt = lastFrame ? Math.min(50, ts - lastFrame) : 16;
    lastFrame = ts;
    now = ts;
    if (run && world) {
      updateHero(dt);
      tick(dt);
      tickToasts(dt);
      mapFx.update(dt);
      ambient(dt);
      drawMap(dt);
      if (lastPhase !== world.phaseIndex) { lastPhase = world.phaseIndex; updateHud(); }
    }
    requestAnimationFrame(frame);
  }

  global.HIC_boot = function () {
    cv = $('#hic-view');
    ctx = cv.getContext('2d');
    mapFx = new FX.Layer();
    // icon cho HUD nếu atlas có
    [['#hic-st-atk', 'atk'], ['#hic-st-arm', 'arm'], ['#hic-st-spd', 'spd']].forEach(function (p) {
      var ic = SPR && SPR.canvasFor(STAT_ROLE[p[1]], 16, { fill: 1 });
      if (ic) { var box = $(p[0]); box.replaceChild(ic, box.querySelector('.ico')); }
    });
    var goldIc = SPR && SPR.canvasFor('ui.gold', 18, { fill: 1 });
    if (goldIc) $('#hic-goldchip').replaceChild(goldIc, $('#hic-goldico'));
    var port = SPR && SPR.canvasFor('hero', 40, { fill: 0.95 });
    if (port) $('#hic-portrait').appendChild(port);
    var bossIc = SPR && SPR.canvasFor('ui.skull', 22, { fill: 1 });
    if (bossIc) $('#hic-bossbtn').replaceChild(bossIc, $('#hic-bossico'));
    bindInput();
    newRun();
    requestAnimationFrame(frame);
  };

  // Mở sự kiện ngay dưới chân — cùng đường mà cú chạm vào chính mình đi qua.
  function openHere() {
    var here = world.eventAt(world.px, world.py);
    if (here) openEvent(here);
    return !!here;
  }

  global.HIC_UI = {
    newRun: newRun, toast: toast, walkTo: walkTo, tryStep: tryStep, openHere: openHere,
    showInventory: showInventory, showGuide: showGuide, closePanel: closePanel,
    guardStats: function () { return { swallowed: guard.swallowed, passed: guard.passed }; },
    openEventForTest: function (ev) { openEvent(ev); },
    armInput: armInput,
    isBusy: function () { return busy || !!pending; },
    get run() { return run; },
    get world() { return world; }
  };
})(window);
