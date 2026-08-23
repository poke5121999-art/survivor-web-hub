/* Màn hình, cảm ứng và mọi bảng bật lên.
 *
 * WHY: game gốc chơi bằng chuột và bàn phím trên PC. Bản này phải chơi được
 * bằng MỘT ngón cái, nên mọi thao tác đều quy về "chạm vào thứ mình muốn":
 * chạm ô trên bản đồ để đi tới đó, chạm quái để đánh, chạm món đồ để lắp.
 * ROOT-CAUSE: bàn phím ảo và nút bấm nhỏ là thứ giết một game lưới trên điện thoại.
 * SEE: docs/proposals/he-is-coming-clone.md — mục "Điều khiển"
 */
(function (global) {
  'use strict';

  var run = null, world = null;
  var cv, ctx, tileSize = 24, cols = 13, rows = 16;
  var walkQueue = [], walkTimer = 0, walking = false;
  var busy = false;          // đang mở bảng -> không nhận bước đi
  var toasts = [];
  var lastFrame = 0;
  var pendingEvent = null;
  var mapTop = 0, mapH = 0;

  var $ = function (s) { return document.querySelector(s); };
  var el = function (tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  /* -------------------------------------------------------- chống chạm lặp */
  /* Một cú chạm đang kích HAI lần, và có ba đường khác nhau dẫn tới chuyện đó:
     1. Chạm lên bản đồ mở một bảng ra. Trình duyệt vẫn còn nợ một sự kiện
        `click` sau khi nhấc ngón (sự kiện chuột giả lập cho cảm ứng), và cú
        click đó rơi trúng cái nút vừa hiện ra NGAY DƯỚI ngón tay. Người chơi
        chạm một lần, game làm hai việc.
     2. Ngón tay rung: hai cú chạm cách nhau 40-80ms lên cùng một thẻ đồ, xảy ra
        trước khi bảng kịp đóng, nên món đồ bị lấy hai lần.
     3. Bấm nhanh sang thẻ khác trong lúc bảng cũ đang đóng dở.

     Cả ba đều được chặn ở ĐÂY, ngay tầng bắt sự kiện của hai khung bảng, thay vì
     đi vá từng nút một — vì nút thì còn thêm mãi, còn ba đường trên thì không.
     ROOT-CAUSE: mỗi nút tự lo lấy việc chống lặp là mô hình sai; chống lặp là
     tính chất của TẦNG NHẬP LIỆU. */
  var armedUntil = 0;      // cú chạm vừa mở bảng còn nợ một click — nuốt nó
  var lastPass = 0, lastNode = null;
  var guard = { swallowed: 0, passed: 0 };

  /* Ba ngưỡng, ba mục đích khác nhau. Đặt chung một con số là hỏng: quá ngắn thì
     không chặn được gì, quá dài thì nuốt cả cú bấm người ta thật sự muốn. */
  var ARM_MS = 150;        // click giả lập luôn tới ngay sau cú chạm, không lâu hơn
  var GLOBAL_MS = 140;     // không ai bấm CỐ Ý hai nút khác nhau trong 140ms
  var SAME_MS = 400;       // rung tay thường dưới 250ms; 400 đủ chặn mà vẫn bấm lại được

  function armInput(ms) { armedUntil = Date.now() + (ms || ARM_MS); }

  /* Lớp chặn thứ hai, ở tầng người xử lý thay vì tầng sự kiện.
     WHY: lớp chặn ở trên bắt sự kiện khi nó đi qua khung bảng — nhưng cú bấm
     thứ hai có thể rơi vào một nút ĐÃ BỊ GỠ khỏi trang (bảng vừa đóng xong),
     và sự kiện của một nút đã gỡ thì không đi qua đâu cả. Nên mỗi bảng mang một
     số thứ tự, và mỗi số thứ tự chỉ tiêu được đúng một hành động. */
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
        var now = Date.now();
        var same = e.target === lastNode || (lastNode && lastNode.contains && lastNode.contains(e.target));
        var tooSoon = now < armedUntil ||
          (now - lastPass < GLOBAL_MS) ||
          (same && now - lastPass < SAME_MS);
        if (tooSoon) {
          if (type === 'click') guard.swallowed++;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (type === 'click') {
          lastPass = now;
          lastNode = e.target;
          guard.passed++;
        }
      }, true);   // tầng bắt: chặn trước khi tới nút
    });
  }

  /* ---------------------------------------------------------------- toasts */

  /* Tối đa 3 dòng thông báo cùng lúc.
     WHY: một chuỗi thao tác nhanh (nhặt, mua, mài, nấu) đẩy ra hàng chục dòng,
     và chúng xếp chồng lên che kín bản đồ — người chơi mất luôn thứ họ cần
     nhìn để ra quyết định tiếp theo. */
  function toast(msg, kind) {
    var last = toasts[toasts.length - 1];
    if (last && last.msg === msg) { last.t = 2200; renderToasts(); return; }
    toasts.push({ msg: msg, kind: kind || '', t: 2200 });
    while (toasts.length > 3) toasts.shift();
    renderToasts();
  }
  function renderToasts() {
    var box = $('#hic-toasts');
    box.innerHTML = '';
    toasts.forEach(function (t) {
      box.appendChild(el('div', 'hic-toast ' + t.kind, t.msg));
    });
  }

  /* ------------------------------------------------------------------- HUD */

  function phaseLabel() {
    var d = world.dayNumber();
    return (world.isNight() ? 'Đêm ' : 'Ngày ') + d;
  }

  function updateHud() {
    var s = run.stats();
    $('#hic-week').textContent = 'Tuần ' + run.week;
    $('#hic-phase').textContent = phaseLabel();
    $('#hic-steps').textContent = world.stepsLeft + ' bước';
    $('#hic-hp').textContent = run.hp() + '/' + s.maxHp;
    $('#hic-armor').textContent = s.armor;
    $('#hic-attack').textContent = s.attack;
    $('#hic-speed').textContent = s.speed;
    $('#hic-gold').textContent = run.gold;
    $('#hic-slots').textContent = run.inv.items.length + '/' + run.inv.maxItems;
    var bar = $('#hic-hpbar');
    bar.style.width = Math.max(0, Math.round(100 * run.hp() / s.maxHp)) + '%';
    document.body.classList.toggle('night', world.isNight());
    // Chấm sáng trên nút túi khi có phép ghép đang làm được — nếu không người
    // chơi sẽ không bao giờ mở màn hình đó ra đúng lúc cần.
    $('#hic-bag').classList.toggle('has', run.availableMerges().length > 0);
    $('#hic-bossbtn').textContent = world.bossDue() ? 'HẮN ĐÃ TỚI' : 'Gọi trùm sớm';
    $('#hic-bossbtn').classList.toggle('due', world.bossDue());
  }

  /* --------------------------------------------------------------- bản đồ */

  function fitCanvas() {
    var stage = $('#hic-stage');
    var w = stage.clientWidth, h = stage.clientHeight;
    cv.width = w; cv.height = h;
    mapTop = Math.round(h * 0.145);
    mapH = Math.round(h * 0.655);
    tileSize = Math.floor(w / cols);
    rows = Math.max(9, Math.floor(mapH / tileSize));
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.imageSmoothingEnabled = true;
  }

  function camera() {
    var cx = world.px - (cols >> 1), cy = world.py - (rows >> 1);
    cx = Math.max(0, Math.min(world.w - cols, cx));
    cy = Math.max(0, Math.min(world.h - rows, cy));
    return { x: cx, y: cy };
  }

  /* Bản đồ được vẽ làm HAI LƯỢT: hết nền rồi mới tới vật.
     WHY: cây, quái và ô sự kiện cao hơn một ô, nên nếu vẽ xen kẽ thì phần nhô
     lên của ô này bị ô kế bên vẽ đè lên, và cả bản đồ trông như bị cắt vụn.
     Đây cũng là chỗ trả lời "cái nào địa hình cái nào bấm được": nền luôn phẳng
     và tối, còn mọi thứ tương tác được đều có bệ sáng và mũi chỉ ở trên đầu. */
  function groundOf(tile) {
    var T = global.HIC_TILE;
    if (tile === T.WATER) return 'water';
    if (tile === T.PATH) return 'dirt';
    return 'grass';
  }
  function overlayOf(tile) {
    var T = global.HIC_TILE;
    if (tile === T.TREE) return 'tree';
    if (tile === T.ROCK) return 'rock';
    if (tile === T.FLOWER) return 'flower';
    return null;
  }

  function drawMap(now) {
    var cam = camera(), A = global.HIC_ART;
    var night = world.isNight();
    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, cv.width, cv.height);

    var ox = Math.round((cv.width - cols * tileSize) / 2);
    var r, c, x, y, i, px, py;

    // ---- lượt 1: nền
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        x = cam.x + c; y = cam.y + r;
        if (!world.inside(x, y)) continue;
        i = world.idx(x, y);
        if (!world.explored[i]) continue;
        px = ox + c * tileSize; py = mapTop + r * tileSize;
        A.ground(ctx, groundOf(world.tiles[i]), px, py, tileSize);
      }
    }

    // ---- lượt 2: vật, sự kiện, quái, người chơi
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        x = cam.x + c; y = cam.y + r;
        if (!world.inside(x, y)) continue;
        i = world.idx(x, y);
        if (!world.explored[i]) continue;
        px = ox + c * tileSize; py = mapTop + r * tileSize;
        var ov = overlayOf(world.tiles[i]);
        if (ov) A.overlay(ctx, ov, px, py, tileSize);

        var ev = world.eventAt(x, y);
        if (ev) A.event(ctx, ev.icon, px, py, tileSize, now, !!ev.seen);

        if (world.visible(x, y)) {
          var m = world.monsterAt(x, y);
          if (m) {
            A.shadow(ctx, px, py, tileSize);
            A.mob(ctx, m.def.name, px, py, tileSize);
            if (m.awake) {
              // Dấu "nó đã thấy bạn" — thứ duy nhất trên bản đồ màu đỏ.
              ctx.fillStyle = '#ff4a3d';
              ctx.beginPath();
              ctx.arc(px + tileSize * 0.5, py - tileSize * 0.10, tileSize * 0.10, 0, 6.284);
              ctx.fill();
            }
          }
        }
      }
    }

    // ---- sương mù: ô đã biết nhưng ngoài tầm mắt thì tối lại
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        x = cam.x + c; y = cam.y + r;
        if (!world.inside(x, y)) continue;
        i = world.idx(x, y);
        px = ox + c * tileSize; py = mapTop + r * tileSize;
        /* Lớp phủ sương mù dùng ĐÚNG khung ô, không cộng thêm một pixel.
           WHY: các ô phủ trong suốt mà chồng mép lên nhau thì chỗ chồng đậm gấp
           đôi, và cả bản đồ hiện lên một lưới kẻ ô mà không ai vẽ ra cả. */
        var fx0 = Math.round(px), fy0 = Math.round(py);
        var fw = Math.round(px + tileSize) - fx0, fh = Math.round(py + tileSize) - fy0;
        if (!world.explored[i]) {
          ctx.fillStyle = '#05080c';
          ctx.fillRect(fx0, fy0, fw, fh);
        } else if (!world.visible(x, y)) {
          ctx.fillStyle = night ? 'rgba(4,7,12,.74)' : 'rgba(6,12,20,.52)';
          ctx.fillRect(fx0, fy0, fw, fh);
        } else if (night) {
          ctx.fillStyle = 'rgba(6,12,24,.28)';
          ctx.fillRect(fx0, fy0, fw, fh);
        }
      }
    }

    // Người chơi vẽ SAU sương mù, để đêm tối không bao giờ nuốt mất chính mình.
    var hx = ox + (world.px - cam.x) * tileSize, hy = mapTop + (world.py - cam.y) * tileSize;
    var A2 = global.HIC_ART;
    if (night) {
      var g = ctx.createRadialGradient(hx + tileSize / 2, hy + tileSize / 2, 0,
        hx + tileSize / 2, hy + tileSize / 2, tileSize * 2.6);
      g.addColorStop(0, 'rgba(245,210,120,.22)');
      g.addColorStop(1, 'rgba(245,210,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hx - tileSize * 3, hy - tileSize * 3, tileSize * 7, tileSize * 7);
    }
    A2.shadow(ctx, hx, hy, tileSize);
    A2.hero(ctx, hx, hy, tileSize);

    // Đường đang đi tới.
    if (walkQueue.length) {
      for (var k = 0; k < walkQueue.length; k++) {
        var pnt = walkQueue[k];
        var fx = ox + (pnt.x - cam.x) * tileSize + tileSize / 2;
        var fy = mapTop + (pnt.y - cam.y) * tileSize + tileSize / 2;
        ctx.fillStyle = k === walkQueue.length - 1 ? 'rgba(242,210,75,.85)' : 'rgba(242,210,75,.42)';
        ctx.beginPath();
        ctx.arc(fx, fy, tileSize * (k === walkQueue.length - 1 ? 0.16 : 0.10), 0, 6.284);
        ctx.fill();
      }
    }

    // Viền tối trên/dưới khung bản đồ.
    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, cv.width, mapTop);
    ctx.fillRect(0, mapTop + rows * tileSize, cv.width, cv.height);
  }

  /* ------------------------------------------------------------- di chuyển */

  function tryStep(dx, dy) {
    if (busy || run.over) return;
    var res = world.step(dx, dy);
    if (res.kind === 'blocked') { walkQueue.length = 0; return; }
    if (res.kind === 'monster') {
      walkQueue.length = 0;
      startBattle(res.monster);
      return;
    }
    if (res.kind === 'event') {
      /* Bảng chỉ bật lên khi bạn ĐẾN NƠI, không phải khi bạn đi ngang qua.
         WHY: người chơi phàn nàn lái buôn biến mất nếu không mua. Bản trước tôi
         cho mọi ô "dùng một lần" chỉ để chặn vòng lặp mở-đóng-mở khi đi ngang —
         tức là lấy đi một lựa chọn của họ để sửa một lỗi của tôi.
         Luật này giải quyết cả hai: ô không bao giờ mất đi vì đi ngang, và cũng
         không bao giờ chặn đường ai. Muốn ghé thì chạm vào ô mình đang đứng. */
      if (walkQueue.length === 0) {
        openEvent(res.event);
        return;
      }
      toast('Đi ngang ' + res.event.name + ' — chạm vào chỗ đang đứng để ghé', '');
    }
    // Ban đêm, một con quái vừa hiện ra trong tầm mắt thì dừng chân lại.
    if (world.isNight() && walkQueue.length && monsterInSight()) {
      walkQueue.length = 0;
      toast('Có thứ gì đó đang tới.', 'bad');
    }
    if (world.bossDue()) {
      walkQueue.length = 0;
      bossArrives();
    }
    updateHud();
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
    // Ưu tiên đường không đụng quái; nếu không có thì đi đường có quái, và cú
    // bước vào nó sẽ mở trận đánh — người chơi thấy trước vì đường được vẽ ra.
    var path = world.pathTo(tx, ty) || world.pathTo(tx, ty, true);
    if (!path || !path.length) { toast('Không đi tới đó được.'); return; }
    walkQueue = path;
  }

  function tick(dt) {
    if (!walkQueue.length || busy) return;
    walkTimer -= dt;
    if (walkTimer > 0) return;
    walkTimer = 90;
    var next = walkQueue.shift();
    tryStep(next.x - world.px, next.y - world.py);
  }

  /* ------------------------------------------------------------- bảng chung */

  function panel(title, hint) {
    busy = true;
    panelGen++;
    // Cú chạm vừa mở bảng này còn nợ một `click`; nuốt nó đi.
    armInput();
    var wrap = $('#hic-panel');
    wrap.innerHTML = '';
    // Xoá sạch lớp của bảng trước; nếu không thì màu của màn hình kết thúc
    // hoặc bố cục của bảng trang bị dính sang bảng kế tiếp.
    wrap.className = 'hic-panel';
    wrap.style.display = 'flex';
    var head = el('div', 'hic-phead');
    head.appendChild(el('h3', null, title));
    var x = el('button', 'hic-x', '✕');
    x.onclick = closePanel;
    head.appendChild(x);
    wrap.appendChild(head);
    if (hint) wrap.appendChild(el('div', 'hic-hint', hint));
    var body = el('div', 'hic-pbody');
    wrap.appendChild(body);
    return body;
  }

  function closePanel() {
    $('#hic-panel').style.display = 'none';
    $('#hic-panel').innerHTML = '';
    busy = false;
    pendingEvent = null;
    updateHud();
  }

  function statLine(it) {
    var parts = [];
    if (it.attack) parts.push('Công ' + it.attack);
    if ((it.bonusAttack || 0) > 0) parts.push('Công +' + it.bonusAttack);
    if (it.armor) parts.push('Giáp ' + it.armor);
    if (it.speed) parts.push('Tốc ' + it.speed);
    if (it.health) parts.push('Máu ' + it.health);
    return parts.join('  ');
  }

  /* Mỗi món đồ có một hình riêng, vẽ bằng code theo TÊN GỐC tiếng Anh.
     WHY: một danh sách toàn chữ thì phải đọc từng dòng mới biết mình có gì.
     Cái hình cho phép nhận ra món đồ bằng liếc mắt, và đó là thứ người chơi
     làm hàng chục lần mỗi ván. */
  function itemIcon(it, px) {
    return global.HIC_iconCanvas('item', it, px || 34,
      { frame: global.HIC_ART.RARITY_COLOR[it.rarity] || '#8fa3b5' });
  }

  function itemCard(it, opts) {
    opts = opts || {};
    var card = el('div', 'hic-card r-' + it.rarity);
    // Gắn luôn món đồ vào thẻ để con bot thử nghiệm đọc được nó đang chọn gì.
    card.__hicItem = it;

    var row = el('div', 'hic-cardrow');
    var ic = itemIcon(it, 38);
    ic.className = 'hic-cardicon';
    row.appendChild(ic);

    var body = el('div', 'hic-cardbody');
    var top = el('div', 'hic-cardtop');
    top.appendChild(el('b', null, global.HIC_vnName(it.name)));
    top.appendChild(el('span', 'hic-rar', global.HIC_RARITY_VN[it.rarity] || it.rarity));
    body.appendChild(top);
    var st = statLine(it);
    if (st) body.appendChild(el('div', 'hic-stats', st));
    var fx = global.HIC_vnEffect(it.name, 'item');
    if (fx) body.appendChild(el('div', 'hic-fx', fx));
    if ((it.tags || []).length) {
      body.appendChild(el('div', 'hic-tags',
        it.tags.map(function (t) { return global.HIC_TAG_VN[t] || t; }).join(' · ')));
    }
    if (opts.price != null) body.appendChild(el('div', 'hic-price', opts.price + ' vàng'));
    row.appendChild(body);
    card.appendChild(row);

    if (opts.onPick) {
      card.classList.add('pickable');
      card.onclick = once(function () { opts.onPick(it); });
    }
    return card;
  }

  /* Một dòng ghép đồ: [hình] + [hình] → [hình], kèm chữ và chỗ ghép được.
     WHY: ghép đồ VẪN LUÔN có trong game, nhưng nó nằm khuất sau ô Golem trên bản
     đồ và không chỗ nào nói ra, nên với người chơi thì nó bằng không tồn tại.
     Một cơ chế không nhìn thấy được là một cơ chế chưa làm. */
  function mergeRow(m, opts) {
    opts = opts || {};
    var row = el('div', 'hic-card r-' + (m.kind === 'golem' ? 'golden' : 'cauldron'));
    var line = el('div', 'hic-mergeline');
    m.from.forEach(function (nm, k) {
      if (k) line.appendChild(el('span', 'hic-mergeop', '+'));
      var def = global.HIC_itemDef(nm) || { name: nm };
      var ic = global.HIC_iconCanvas('item', def, 30,
        { frame: global.HIC_ART.RARITY_COLOR[def.rarity] || '#8fa3b5' });
      ic.className = 'hic-mergeicon';
      line.appendChild(ic);
    });
    line.appendChild(el('span', 'hic-mergeop', '→'));
    var made = global.HIC_itemDef(m.to) || { name: m.to };
    var out = global.HIC_iconCanvas('item', made, 38,
      { frame: global.HIC_ART.RARITY_COLOR[made.rarity] || '#f2d24b' });
    out.className = 'hic-mergeicon big';
    line.appendChild(out);
    row.appendChild(line);

    row.appendChild(el('div', 'hic-mergename', global.HIC_vnName(m.to)));
    var st = statLine(made);
    if (st) row.appendChild(el('div', 'hic-stats', st));
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

  function takeItem(it, after) {
    if (run.canEquip(it)) {
      var before = run.availableMerges().length;
      run.equip(it);
      toast('Đã lắp ' + global.HIC_vnName(it.name), 'good');
      var now = run.availableMerges();
      if (now.length > before) {
        toast('Ghép được: ' + global.HIC_vnName(now[now.length - 1].to) +
          ' — tìm ' + now[now.length - 1].where, 'good');
      }
      if (after) after();
      return;
    }
    // Hết ô: bắt chọn món để bỏ ra, và nói rõ đổi thì được gì mất gì.
    var body = panel('Hết ô đồ', 'Bỏ một món để lấy ' + global.HIC_vnName(it.name));
    var incoming = itemCard(it);
    incoming.classList.add('incoming');
    body.appendChild(incoming);
    body.appendChild(el('div', 'hic-sechead', 'Bỏ món nào?'));
    run.inv.items.forEach(function (cur, i) {
      if (i === 0) return;    // ô vũ khí không bỏ trống được
      var card = itemCard(cur, {
        onPick: function () {
          run.drop(cur.uid);
          run.equip(it);
          toast('Đổi lấy ' + global.HIC_vnName(it.name), 'good');
          closePanel();
          if (after) after();
        }
      });
      card.appendChild(deltaLine(run.previewStats(it, cur.uid)));
      body.appendChild(card);
    });
    var skip = el('button', 'hic-btn wide', 'Bỏ qua món này');
    skip.onclick = function () { closePanel(); if (after) after(); };
    body.appendChild(skip);
  }

  /* -------------------------------------------------------------- sự kiện */

  function openEvent(ev) {
    pendingEvent = ev;
    var out = run.openEvent(ev);
    showEventResult(out, ev);
  }

  function showEventResult(out, ev) {
    if (!out) { closePanel(); return; }
    if (out.type === 'info') {
      var b = panel(out.title);
      b.appendChild(el('p', 'hic-note', out.text));
      var ok = el('button', 'hic-btn wide', 'Tiếp tục');
      ok.onclick = closePanel;
      b.appendChild(ok);
      return;
    }
    if (out.type === 'rest') {
      var rb = panel(out.title);
      rb.appendChild(el('p', 'hic-note', out.text));
      var s = run.stats();
      rb.appendChild(el('div', 'hic-stats', 'Máu bây giờ: ' + run.hp() + '/' + s.maxHp +
        '   ·   còn ' + world.stepsLeft + ' bước trong ' + phaseLabel().toLowerCase()));
      var yes = el('button', 'hic-btn wide primary hic-rest-yes',
        out.kind === 'house' ? 'Ngủ tới sáng (máu đầy)' : 'Nghỉ tới sáng (+10 máu)');
      yes.onclick = once(function () {
        run.rest(out.kind, ev);
        toast(out.kind === 'house' ? 'Bạn ngủ một giấc. Máu đầy.' : 'Bạn sưởi ấm và chợp mắt.', 'good');
        closePanel();
      });
      var no = el('button', 'hic-btn wide ghost hic-rest-no', 'Đi tiếp, chưa nghỉ');
      no.onclick = closePanel;
      rb.appendChild(yes);
      rb.appendChild(no);
      return;
    }
    if (out.type === 'pick') {
      var body = panel(out.title, out.hint);
      out.offers.forEach(function (it) {
        body.appendChild(itemCard(it, {
          onPick: function () {
            if (ev) ev.used = true;
            closePanel();
            takeItem(it);
          }
        }));
      });
      var skip = el('button', 'hic-btn wide ghost', 'Không lấy gì');
      skip.onclick = function () { if (ev) ev.used = true; closePanel(); };
      body.appendChild(skip);
      return;
    }
    if (out.type === 'edge') {
      var eb = panel(out.title, out.hint + ' — hiện tại: ' +
        (run.inv.edge ? global.HIC_vnName(run.inv.edge.name) : 'chưa mài'));
      out.offers.forEach(function (edge) {
        var card = el('div', 'hic-card r-rare pickable');
        card.appendChild(el('b', null, global.HIC_vnName(edge.name)));
        card.appendChild(el('div', 'hic-fx', global.HIC_vnEffect(edge.name, 'edge')));
        card.onclick = once(function () {
          run.applyEdge(edge, ev);
          toast('Vũ khí đã được mài: ' + global.HIC_vnName(edge.name), 'good');
          closePanel();
        });
        eb.appendChild(card);
      });
      var s2 = el('button', 'hic-btn wide ghost', 'Bỏ qua');
      s2.onclick = function () { if (ev) ev.used = true; closePanel(); };
      eb.appendChild(s2);
      return;
    }
    if (out.type === 'oil') {
      /* Vũ khí chỉ nhận được 3 lọ dầu. Khi đã đủ thì các lọ phải TẮT hẳn —
         cho bấm rồi báo "đã đủ" là cái bẫy bấm-mãi-không-thoát, y như bảng
         lái buôn và giếng ước trước đó. */
      var full = run.inv.oils.length >= 3;
      var ob = panel(out.title, full
        ? 'Vũ khí đã đủ 3 lọ dầu — không bôi thêm được nữa.'
        : out.hint + ' — đã bôi ' + run.inv.oils.length + '/3');
      out.offers.forEach(function (oil) {
        var card = el('div', 'hic-card r-common' + (full ? ' dim' : ' pickable'));
        card.appendChild(el('b', null, global.HIC_vnName(oil.name)));
        card.appendChild(el('div', 'hic-stats', statLine(oil)));
        if (!full) {
          card.onclick = once(function () {
            run.applyOil(oil, ev);
            toast('Đã bôi ' + global.HIC_vnName(oil.name), 'good');
            closePanel();
          });
        }
        ob.appendChild(card);
      });
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
      (run.rerolls ? ' · ' + run.rerolls + ' lượt đổi hàng' : ''));
    out.offers.forEach(function (it) {
      /* Món không đủ tiền mua thì làm mờ và KHÔNG bấm được.
         WHY: để nó bấm được rồi báo "không đủ vàng" là mời người chơi bấm lại
         mãi — con bot thử nghiệm kẹt đúng ở đây suốt 1.500 lượt. */
      if (it.price > run.gold) {
        var dim = itemCard(it, { price: it.price });
        dim.classList.add('dim');
        body.appendChild(dim);
        return;
      }
      body.appendChild(itemCard(it, {
        price: it.price,
        onPick: function () {
          var res = run.buy(it, ev);
          if (!res.ok) {
            if (res.why === 'Hết ô đồ') { closePanel(); takeItemPaid(it, ev, out); return; }
            toast(res.why, 'bad');
            return;
          }
          toast('Đã mua ' + global.HIC_vnName(it.name), 'good');
          closePanel();
          showShop({ title: out.title, offers: out.offers.filter(function (o) { return o !== it; }) }, ev);
        }
      }));
    });
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
    var now = run.stats();
    var keys = [['attack', 'công'], ['armor', 'giáp'], ['speed', 'tốc'], ['maxHp', 'máu']];
    var box = el('div', 'hic-delta');
    var any = false;
    keys.forEach(function (k) {
      var d = after[k[0]] - now[k[0]];
      if (!d) return;
      any = true;
      box.appendChild(el('span', d > 0 ? 'up' : 'down',
        (d > 0 ? '+' : '') + d + ' ' + k[1]));
    });
    if (!any) box.appendChild(el('span', 'flat', 'chỉ số không đổi'));
    return box;
  }

  function takeItemPaid(it, ev, out) {
    if (run.gold < it.price) { toast('Không đủ vàng', 'bad'); return; }
    var body = panel('Hết ô đồ', 'Bỏ một món để mua ' + global.HIC_vnName(it.name));
    var inc = itemCard(it);
    inc.classList.add('incoming');
    body.appendChild(inc);
    body.appendChild(el('div', 'hic-sechead', 'Bỏ món nào?'));
    run.inv.items.forEach(function (cur, i) {
      if (i === 0) return;
      body.appendChild(itemCard(cur, {
        onPick: function () {
          run.gold -= it.price;
          run.drop(cur.uid);
          run.equip(it);
          if (ev) ev.used = true;
          toast('Đã mua ' + global.HIC_vnName(it.name), 'good');
          closePanel();
        }
      }));
    });
    var no = el('button', 'hic-btn wide ghost', 'Thôi');
    no.onclick = function () { closePanel(); showShop(out, ev); };
    body.appendChild(no);
  }

  function showGolem(ev) {
    var pairs = run.golemPairs();
    var body = panel('Golem thợ rèn', pairs.length
      ? 'Hai món giống hệt nhau ghép thành một bản mạnh gấp đôi. Hai ô đồ dồn thành một.'
      : 'Ghép cần hai món GIỐNG HỆT nhau — bạn chưa có cặp nào.');
    pairs.forEach(function (p) {
      body.appendChild(mergeRow(
        { kind: 'golem', from: [p.from, p.from], to: p.to, where: 'Golem thợ rèn' },
        { onPick: function () {
            var made = run.golemCombine(p, ev);
            if (made) toast('Rèn ra ' + global.HIC_vnName(made.name), 'good');
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
      : 'Bạn chưa có đủ nguyên liệu cho công thức nào.');
    recipes.forEach(function (dish) {
      body.appendChild(mergeRow(
        { kind: 'cauldron', from: dish.parts.slice(), to: dish.name, where: 'Vạc nấu' },
        { onPick: function () {
            var made = run.cauldronCook(dish, ev);
            if (made) toast('Nấu xong ' + global.HIC_vnName(made.name), 'good');
            closePanel();
          } }));
    });
    if (!recipes.length) {
      // Cho xem trước vài công thức, để biết cần đi nhặt món ăn nào.
      body.appendChild(el('div', 'hic-note', 'Vài công thức có trong vùng này:'));
      global.HIC_POOL.cauldron.slice(0, 4).forEach(function (dish) {
        if (!dish.parts || dish.parts.length !== 2) return;
        var r = mergeRow({ kind: 'cauldron', from: dish.parts.slice(), to: dish.name,
          where: 'Vạc nấu' }, {});
        r.classList.add('dim');
        body.appendChild(r);
      });
    }
    var out = el('button', 'hic-btn wide ' + (recipes.length ? 'ghost' : 'primary'), 'Đi tiếp');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  function showWell(ev) {
    var canWish = run.gold >= 20;
    var body = panel('Giếng ước', canWish
      ? 'Bạn có ' + run.gold + ' vàng. Một điều ước tốn 20.'
      : 'Bạn mới có ' + run.gold + ' vàng. Một điều ước tốn 20.');
    /* Nút không dùng được thì phải TẮT, không phải bấm rồi báo lỗi.
       Cùng một cái bẫy đã làm bot kẹt ở bảng lái buôn. */
    function wish(label, choice) {
      var b = el('button', 'hic-btn wide' + (canWish ? '' : ' ghost'), label);
      if (!canWish) { b.disabled = true; b.style.opacity = '.4'; return b; }
      b.onclick = once(function () {
        var out = run.wellWish(choice, ev);
        if (!out) return;
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

  /* Màn hình trang bị. Không còn là một danh sách chữ:
     - Bốn con số lớn ở trên, để biết bộ đồ hiện tại đang mạnh cỡ nào.
     - Ô vũ khí đứng riêng, kèm lưỡi mài và dầu đã bôi lên nó.
     - Đồ mặc xếp thành LƯỚI biểu tượng đúng bằng số ô mình có; ô trống hiện rõ
       là ô trống, nên "còn chỗ không" là một cái liếc mắt chứ không phải phép tính.
     - Bộ đồ hiện TIẾN ĐỘ, kể cả bộ chưa đủ món: người chơi phải nhìn thấy
       "còn thiếu một món nữa" thì bộ đồ mới là một mục tiêu để đuổi theo. */
  function showInventory() {
    if (busy) return;
    var s = run.stats();
    var body = panel('Trang bị');
    body.parentNode.classList.add('gear');

    // --- bốn con số
    var stats = el('div', 'hic-statgrid');
    [['Máu', run.hp() + '/' + s.maxHp, 'hp'], ['Công', s.attack, 'atk'],
     ['Giáp', s.armor, 'arm'], ['Tốc', s.speed, 'spd']].forEach(function (d) {
      var box = el('div', 'hic-statbox ' + d[2]);
      box.appendChild(el('b', null, String(d[1])));
      box.appendChild(el('span', null, d[0]));
      stats.appendChild(box);
    });
    body.appendChild(stats);

    // --- vũ khí
    body.appendChild(el('div', 'hic-sechead', 'Vũ khí'));
    var w = run.inv.items[0];
    if (w) {
      var wc = itemCard(w);
      wc.classList.add('weapon');
      body.appendChild(wc);
    }
    var extra = [];
    if (run.inv.edge) {
      extra.push('Lưỡi mài: ' + global.HIC_vnName(run.inv.edge.name) + ' — ' +
        global.HIC_vnEffect(run.inv.edge.name, 'edge'));
    }
    if (run.inv.oils.length) {
      extra.push('Dầu (' + run.inv.oils.length + '/3): ' +
        run.inv.oils.map(function (o) { return global.HIC_vnName(o.name); }).join(', '));
    }
    if (extra.length) body.appendChild(el('div', 'hic-hint', extra.join('\n')));

    // --- lưới ô đồ
    body.appendChild(el('div', 'hic-sechead',
      'Đồ mặc — ' + (run.inv.items.length - 1) + '/' + (run.inv.maxItems - 1) + ' ô'));
    var grid = el('div', 'hic-gear');
    var detail = el('div', 'hic-detail');

    function showDetail(it) {
      detail.innerHTML = '';
      if (!it) {
        detail.appendChild(el('div', 'hic-note', 'Chạm vào một ô để xem món đó.'));
        return;
      }
      detail.appendChild(itemCard(it));
    }

    for (var i = 1; i < run.inv.maxItems; i++) {
      var it = run.inv.items[i];
      var cell = el('button', 'hic-slot' + (it ? '' : ' empty'));
      if (it) {
        var ic = itemIcon(it, 44);
        cell.appendChild(ic);
        cell.style.borderColor = global.HIC_ART.RARITY_COLOR[it.rarity] || '#3a4a5c';
        cell.title = global.HIC_vnName(it.name);
        (function (item, node) {
          node.onclick = function () {
            var was = grid.querySelector('.sel');
            if (was) was.classList.remove('sel');
            node.classList.add('sel');
            showDetail(item);
          };
        })(it, cell);
      } else {
        cell.appendChild(el('span', 'hic-slotplus', '+'));
        cell.onclick = function () { showDetail(null); };
      }
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    var first = grid.querySelector('.hic-slot:not(.empty)');
    if (first) first.classList.add('sel');
    showDetail(run.inv.items[1] || null);
    body.appendChild(detail);

    // --- ghép đồ
    var merges = run.availableMerges();
    body.appendChild(el('div', 'hic-sechead',
      'Ghép đồ' + (merges.length ? ' — ' + merges.length + ' phép ghép đang làm được' : '')));
    if (merges.length) {
      merges.forEach(function (m) {
        body.appendChild(mergeRow(m, { showWhere: true }));
      });
    } else {
      body.appendChild(el('div', 'hic-note',
        'Hai món GIỐNG HỆT nhau ghép được thành bản mạ vàng (hiệu ứng nhân đôi) tại ' +
        'Golem thợ rèn, và hai bản mạ vàng lại thành kim cương (nhân bốn). ' +
        'Hai món ăn nấu thành món mới tại Vạc nấu. Ghép xong hai ô đồ dồn lại còn một.'));
    }

    // --- bộ đồ
    body.appendChild(el('div', 'hic-sechead', 'Bộ đồ'));
    var have = {};
    run.inv.items.forEach(function (x) { have[global.HIC_baseName(x.name)] = true; });
    if (run.inv.edge) have[run.inv.edge.name] = true;
    var complete = {};
    run.inv.sets.forEach(function (x) { complete[x.name] = true; });

    global.HIC_DATA.sets.forEach(function (st) {
      var got = st.parts.filter(function (part) { return have[part]; });
      if (!got.length && !complete[st.name]) return;   // chưa có mảnh nào thì chưa cần bày ra
      var c = el('div', 'hic-setrow' + (complete[st.name] ? ' done' : ''));
      var head = el('div', 'hic-setname');
      head.appendChild(el('b', null, global.HIC_vnName(st.name)));
      head.appendChild(el('span', null, got.length + '/' + st.parts.length));
      c.appendChild(head);
      var pieces = el('div', 'hic-setparts');
      st.parts.forEach(function (part) {
        var def = global.HIC_itemDef(part) || { name: part };
        var pi = global.HIC_iconCanvas('item', def, 26,
          { frame: have[part] ? '#5aa15c' : '#3a4a5c' });
        pi.className = 'hic-setpiece' + (have[part] ? '' : ' miss');
        pi.title = global.HIC_vnName(part);
        pieces.appendChild(pi);
      });
      c.appendChild(pieces);
      c.appendChild(el('div', 'hic-fx', global.HIC_vnEffect(st.name, 'set')));
      body.appendChild(c);
    });
    if (!Object.keys(complete).length) {
      var none = el('div', 'hic-note',
        'Đủ mọi món trong một bộ thì bộ đó cộng thêm. Bản mạ vàng và kim cương vẫn tính là món gốc.');
      body.appendChild(none);
    }

    var out = el('button', 'hic-btn wide ghost', 'Đóng');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  /* Cẩm nang: mọi loại ô trên bản đồ là gì, mọi luật của thế giới và của trận
     đánh, gom vào một chỗ tra được bất cứ lúc nào.
     WHY: game này có mười hai loại địa điểm, một đồng hồ chạy theo bước chân và
     một bộ luật trận đánh mà người chơi không can thiệp được. Không có chỗ tra
     thì tất cả những thứ đó chỉ là hình vẽ lạ. */
  function showGuide() {
    if (busy) return;
    var body = panel('Cẩm nang', 'Mọi thứ trên bản đồ nghĩa là gì');
    body.parentNode.classList.add('gear');

    body.appendChild(el('div', 'hic-sechead', 'Địa điểm — chạm vào để ghé'));
    var P = global.HIC_PLACE_INFO;
    global.HIC_WORLD_CONST.EVENTS.forEach(function (e) {
      var info = P[e.id];
      if (!info) return;
      var row = el('div', 'hic-guide');
      var ic = global.HIC_iconCanvas('event', info.icon, 44, { frame: '#f2d24b' });
      ic.className = 'hic-guideicon';
      row.appendChild(ic);
      var bodyCol = el('div', 'hic-guidebody');
      bodyCol.appendChild(el('b', null, info.name));
      bodyCol.appendChild(el('div', 'hic-fx', info.what));
      bodyCol.appendChild(el('div', 'hic-where', info.gone));
      row.appendChild(bodyCol);
      body.appendChild(row);
    });

    body.appendChild(el('div', 'hic-sechead', 'Địa hình'));
    var grid = el('div', 'hic-terrain');
    global.HIC_TERRAIN_INFO.forEach(function (tr) {
      var cell = el('div', 'hic-tcell');
      var ic = global.HIC_iconCanvas('terrain', tr, 40, {});
      cell.appendChild(ic);
      cell.appendChild(el('b', null, tr.name));
      cell.appendChild(el('span', null, tr.what));
      grid.appendChild(cell);
    });
    body.appendChild(grid);

    body.appendChild(el('div', 'hic-sechead', 'Quái'));
    var mrow = el('div', 'hic-guide');
    var mi = global.HIC_iconCanvas('mob', 'Wolf Level 1', 44, { frame: '#c34141' });
    mi.className = 'hic-guideicon';
    mrow.appendChild(mi);
    var mb = el('div', 'hic-guidebody');
    mb.appendChild(el('b', null, 'Quái đi lang thang'));
    mb.appendChild(el('div', 'hic-fx',
      'Ban ngày chúng đứng yên, kể cả khi nhìn thấy bạn. Ban đêm, thấy là đuổi — ' +
      'chấm đỏ trên đầu nghĩa là nó đã thấy bạn. Chạm vào con đứng cạnh để đánh; ' +
      'đánh nhau không tốn bước chân.'));
    mb.appendChild(el('div', 'hic-where', 'Giết quái được vàng. Máu mất đi thì không tự hồi.'));
    mrow.appendChild(mb);
    body.appendChild(mrow);

    body.appendChild(el('div', 'hic-sechead', 'Thời gian'));
    body.appendChild(el('div', 'hic-note',
      'Một tuần có 3 ngày và 3 đêm, rồi con trùm tới. Ngày dài 50 bước, đêm dài 30 bước. ' +
      'Thời gian CHỈ trôi khi bạn bước — đứng nghĩ bao lâu cũng được. ' +
      'Ban ngày nhìn xa 5 ô, ban đêm còn 3 ô. ' +
      'Hạ được trùm thì sang tuần sau và được thêm 2 ô đồ: 5 → 7 → 9.'));

    body.appendChild(el('div', 'hic-sechead', 'Trận đánh'));
    body.appendChild(el('div', 'hic-note',
      'Bạn không bấm gì trong trận. Ai có tốc cao hơn đánh trước, hoà thì bạn đi trước. ' +
      'Sát thương ăn hết giáp rồi mới vào máu. Giáp hồi lại sau mỗi trận, máu thì không. ' +
      'Gai đánh ngược lại người vừa đánh bạn rồi biến mất. ' +
      '"Mất sạch giáp" và "dưới nửa máu" mỗi trận chỉ kích một lần.'));

    body.appendChild(el('div', 'hic-sechead', 'Ghép đồ'));
    body.appendChild(el('div', 'hic-note',
      'Hai món GIỐNG HỆT nhau ghép được thành bản mạ vàng — hiệu ứng nhân đôi — tại Golem thợ rèn. ' +
      'Hai bản mạ vàng lại thành kim cương, nhân bốn. Hai món ăn nấu thành món mới tại Vạc nấu. ' +
      'Ghép xong hai ô đồ dồn lại còn một, nên đó cũng là cách dọn chỗ.'));

    body.appendChild(el('div', 'hic-sechead', 'Ô đồ'));
    body.appendChild(el('div', 'hic-note',
      'Không có túi chứa riêng: thứ gì bạn mang theo đều đang mặc trên người. ' +
      'Đó là chỗ khó cố ý của game — mỗi món nhặt lên là một lựa chọn bỏ đi món khác. ' +
      'Một ô luôn dành cho vũ khí và không bỏ trống được.'));

    var out = el('button', 'hic-btn wide ghost', 'Đóng');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  function showBossPreview() {
    if (busy) return;
    var def = run.boss;
    var body = panel('Hắn đang tới', 'Con trùm cuối tuần này');
    var card = el('div', 'hic-card r-heroic');
    var icon = global.HIC_iconCanvas('mob', def.name, 48);
    icon.className = 'hic-bossicon';
    card.appendChild(icon);
    card.appendChild(el('b', null, global.HIC_vnName(def.name)));
    card.appendChild(el('div', 'hic-stats',
      'Máu ' + def.health + '   Công ' + (def.attack || 0) +
      '   Giáp ' + (def.armor || 0) + '   Tốc ' + (def.speed || 0)));
    var fx = global.HIC_vnEffect(def.name, 'creature');
    if (fx) card.appendChild(el('div', 'hic-fx', fx));
    body.appendChild(card);

    if (world.bossDue()) {
      var face = el('button', 'hic-btn wide primary', 'Ra đối mặt');
      face.onclick = once(function () { closePanel(); startBattle({ def: def, boss: true }); });
      body.appendChild(face);
      return;
    }
    /* Nút an toàn phải là nút chính. Đặt "gọi trùm sớm" lên đầu là mời người
       chơi bấm nhầm vào thứ kết thúc ván của họ — và đó đúng là thứ đã giết
       con bot thử nghiệm ba lần liên tiếp trước khi đảo lại. */
    var keep = el('button', 'hic-btn wide primary', 'Chuẩn bị tiếp');
    keep.onclick = closePanel;
    body.appendChild(keep);
    body.appendChild(el('div', 'hic-note',
      'Gọi hắn tới sớm thì bỏ luôn phần thời gian còn lại của tuần — bạn không kịp nhặt thêm gì nữa.'));
    var early = el('button', 'hic-btn wide ghost', 'Gọi hắn tới sớm');
    early.onclick = once(function () { closePanel(); startBattle({ def: def, boss: true }); });
    body.appendChild(early);
  }

  /* --------------------------------------------------------------- trận đánh */

  function startBattle(target) {
    busy = true;
    var def = target.def;
    var res = run.fight(def);
    if (!def.boss) world.removeMonster(target);
    playBattle(res, def, target);
  }

  /* Màn hình trận đánh: một cảnh có người, có nền, có số bay lên — không phải
     một bảng nhật ký. Xem `js/fight.js` để biết vì sao. */
  function playBattle(res, def, target) {
    var wrap = $('#hic-battle');
    panelGen++;
    armInput();
    wrap.style.display = 'flex';
    wrap.innerHTML = '';

    var scene = el('canvas', 'hic-scene');
    wrap.appendChild(scene);

    var ticker = el('div', 'hic-ticker');
    wrap.appendChild(ticker);

    var foot = el('div', 'hic-bfoot');
    var speedBtn = el('button', 'hic-btn', 'x1');
    var skip = el('button', 'hic-btn', 'Bỏ qua');
    var done = el('button', 'hic-btn primary', 'Xong');
    done.style.display = 'none';
    foot.appendChild(speedBtn);
    foot.appendChild(skip);
    foot.appendChild(done);
    wrap.appendChild(foot);

    var fight = new global.HIC_Fight(scene, res, def.name, !!def.boss);
    fight.vnFoe = global.HIC_vnName(def.name);

    // Dòng chữ chạy dưới cảnh: chỉ ba dòng gần nhất, đủ để biết vì sao con số
    // vừa nhảy ra, mà không biến màn hình thành bảng log lần nữa.
    var shown = 0;
    function pumpTicker() {
      while (shown < fight.idx && shown < fight.lines.length) {
        var line = el('div', 'hic-tline', fight.lines[shown].t);
        ticker.appendChild(line);
        shown++;
      }
      while (ticker.childNodes.length > 3) ticker.removeChild(ticker.firstChild);
    }
    var pump = setInterval(pumpTicker, 60);

    function finish() {
      clearInterval(pump);
      pumpTicker();
      var res2 = el('div', 'hic-result ' + (res.playerWon ? 'win' : 'lose'),
        res.playerWon ? 'Bạn thắng' : 'Bạn gục ngã');
      ticker.appendChild(res2);
      while (ticker.childNodes.length > 3) ticker.removeChild(ticker.firstChild);
      speedBtn.style.display = 'none';
      skip.style.display = 'none';
      done.style.display = '';
    }

    var speeds = [1, 2, 4];
    var si = 0;
    speedBtn.onclick = function () {
      si = (si + 1) % speeds.length;
      fight.speed = speeds[si];
      speedBtn.textContent = 'x' + speeds[si];
    };
    skip.onclick = function () { fight.skip(); };
    done.onclick = once(function () {
      fight.stop();
      clearInterval(pump);
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
    if (def.boss) {
      if (run.week >= 4) { victory(); return; }
      run.nextWeek();
      world = run.world;
      toast('Tuần ' + run.week + '. Bạn được thêm ô đồ.', 'good');
      showBossPreview();
    }
    save();
    updateHud();
  }

  function bossArrives() {
    if (busy) return;
    busy = true;
    var body = panel('Hết ba ngày', 'Hắn đã tới. Không còn chỗ nào để trốn.');
    var go = el('button', 'hic-btn wide', 'Ra đối mặt');
    go.onclick = once(function () { closePanel(); startBattle({ def: run.boss, boss: true }); });
    body.appendChild(go);
  }

  /* --------------------------------------------------------- kết thúc ván */

  function endScreen(title, text, cls) {
    busy = true;
    var wrap = $('#hic-panel');
    wrap.innerHTML = '';
    wrap.style.display = 'flex';
    wrap.className = 'hic-panel ' + cls;
    var head = el('div', 'hic-phead');
    head.appendChild(el('h3', null, title));
    wrap.appendChild(head);
    var body = el('div', 'hic-pbody');
    body.appendChild(el('p', 'hic-note', text));
    body.appendChild(el('div', 'hic-stats',
      'Tuần ' + run.week + '  ·  ' + run.bossesKilled + ' trùm  ·  ' +
      run.kills + ' quái  ·  ' + run.gold + ' vàng'));
    var again = el('button', 'hic-btn wide primary', 'Ván mới');
    again.onclick = once(function () { newRun(); });
    body.appendChild(again);
    wrap.appendChild(body);
  }

  function gameOver() {
    run.over = true;
    try { localStorage.removeItem('hic.save.v1'); } catch (e) { /* trình duyệt chặn */ }
    endScreen('Bạn chết', 'Rừng giữ bạn lại. Ván này dừng ở đây.', 'over');
  }
  function victory() {
    run.over = true;
    run.won = true;
    endScreen('Sống sót', 'Bạn đã đi qua cả bốn tuần. Ít ai làm được.', 'win');
  }

  /* ------------------------------------------------------------------- save */

  function save() {
    try { global.HIC_saveMeta(run.toJSON()); } catch (e) { /* không lưu được thì thôi */ }
  }

  /* ------------------------------------------------------------------- boot */

  function newRun(seed) {
    run = new global.HIC_Run(seed || (Date.now() >>> 0));
    world = run.world;
    walkQueue = [];
    busy = false;
    $('#hic-panel').style.display = 'none';
    $('#hic-panel').className = 'hic-panel';
    $('#hic-panel').innerHTML = '';
    $('#hic-battle').style.display = 'none';
    global.HIC_RUN = run;
    fitCanvas();
    updateHud();
    toast('Ba ngày. Rồi hắn tới.', '');
    showBossPreview();
  }

  var lastMapTap = 0, lastPadTap = 0;

  function bindInput() {
    guardContainer($('#hic-panel'));
    guardContainer($('#hic-battle'));
    cv.addEventListener('pointerdown', function (e) {
      // Chặn sự kiện chuột giả lập mà trình duyệt phát sau mỗi cú chạm — đó
      // chính là cú "click ma" rơi trúng nút vừa hiện ra dưới ngón tay.
      e.preventDefault();
      var now = Date.now();
      if (now - lastMapTap < 140) return;    // ngón tay rung
      lastMapTap = now;
      if (busy || run.over) return;
      var rect = cv.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (my < mapTop || my > mapTop + rows * tileSize) return;
      var ox = Math.round((cv.width - cols * tileSize) / 2);
      var cam = camera();
      var tx = cam.x + Math.floor((mx - ox) / tileSize);
      var ty = cam.y + Math.floor((my - mapTop) / tileSize);
      if (!world.inside(tx, ty)) return;
      var adj = Math.abs(tx - world.px) + Math.abs(ty - world.py);
      if (adj === 0) { openHere(); return; }   // chạm vào chính mình = ghé vào ô đang đứng
      if (adj === 1) { walkQueue = []; tryStep(tx - world.px, ty - world.py); return; }
      walkTo(tx, ty);
    });

    [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]].forEach(function (d) {
      var b = $('#hic-' + d[0]);
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        var now = Date.now();
        if (now - lastPadTap < 120) return;   // một cú bấm là một bước, không phải hai
        lastPadTap = now;
        walkQueue = [];
        tryStep(d[1], d[2]);
      });
    });

    $('#hic-bag').onclick = showInventory;
    $('#hic-help').onclick = showGuide;
    $('#hic-bossbtn').onclick = showBossPreview;
    $('#hic-wait').onclick = function () {
      if (busy || run.over) return;
      walkQueue = [];
      toast('Đứng yên thì thời gian cũng đứng yên.', '');
    };

    window.addEventListener('keydown', function (e) {
      if (busy || run.over) return;
      var map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      var m = map[e.key];
      if (m) { walkQueue = []; tryStep(m[0], m[1]); e.preventDefault(); }
      if (e.key === 'i') showInventory();
      if (e.key === '?' || e.key === 'h') showGuide();
    });

    window.addEventListener('resize', function () { fitCanvas(); });
  }

  function frame(ts) {
    var dt = lastFrame ? ts - lastFrame : 16;
    lastFrame = ts;
    if (run && world) {
      tick(dt);
      // Toast tự tắt.
      var changed = false;
      for (var i = toasts.length - 1; i >= 0; i--) {
        toasts[i].t -= dt;
        if (toasts[i].t <= 0) { toasts.splice(i, 1); changed = true; }
      }
      if (changed) renderToasts();
      drawMap(ts);
    }
    requestAnimationFrame(frame);
  }

  global.HIC_boot = function () {
    cv = $('#hic-view');
    ctx = cv.getContext('2d');
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
    // Mở một ô sự kiện y như khi dẫm phải nó — dùng cho bài kiểm tra chống chạm lặp.
    openEventForTest: function (ev) { openEvent(ev); },
    armInput: armInput,
    isBusy: function () { return busy; },
    get run() { return run; },
    get world() { return world; }
  };
})(window);
