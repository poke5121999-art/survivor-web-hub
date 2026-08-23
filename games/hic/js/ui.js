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

  /* ---------------------------------------------------------------- toasts */

  /* Tối đa 3 dòng thông báo cùng lúc.
     WHY: một chuỗi thao tác nhanh (nhặt, mua, mài, nấu) đẩy ra hàng chục dòng,
     và chúng xếp chồng lên che kín bản đồ — người chơi mất luôn thứ họ cần
     nhìn để ra quyết định tiếp theo. */
  function toast(msg, kind) {
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
    $('#hic-bossbtn').textContent = world.bossDue() ? 'HẮN ĐÃ TỚI' : 'Gọi trùm sớm';
    $('#hic-bossbtn').classList.toggle('due', world.bossDue());
  }

  /* --------------------------------------------------------------- bản đồ */

  function fitCanvas() {
    var stage = $('#hic-stage');
    var w = stage.clientWidth, h = stage.clientHeight;
    cv.width = w; cv.height = h;
    mapTop = Math.round(h * 0.16);
    mapH = Math.round(h * 0.60);
    tileSize = Math.floor(w / cols);
    rows = Math.max(9, Math.floor(mapH / tileSize));
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.imageSmoothingEnabled = false;
  }

  function camera() {
    var cx = world.px - (cols >> 1), cy = world.py - (rows >> 1);
    cx = Math.max(0, Math.min(world.w - cols, cx));
    cy = Math.max(0, Math.min(world.h - rows, cy));
    return { x: cx, y: cy };
  }

  function drawMap() {
    var cam = camera(), A = global.HIC_ART;
    ctx.fillStyle = world.isNight() ? '#080c12' : '#101820';
    ctx.fillRect(0, 0, cv.width, cv.height);

    var ox = Math.round((cv.width - cols * tileSize) / 2);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = cam.x + c, y = cam.y + r;
        if (!world.inside(x, y)) continue;
        var i = world.idx(x, y);
        if (!world.explored[i]) continue;
        var px = ox + c * tileSize, py = mapTop + r * tileSize;
        A.tile(ctx, world.tiles[i], px, py, tileSize);

        var vis = world.visible(x, y);
        if (!vis) {
          // Ô đã đi qua nhưng ngoài tầm nhìn: tối lại, và không hiện quái.
          ctx.fillStyle = world.isNight() ? 'rgba(4,7,12,.72)' : 'rgba(6,10,16,.55)';
          ctx.fillRect(px, py, tileSize, tileSize);
        }

        var ev = world.eventAt(x, y);
        if (ev && (vis || world.explored[i])) A.event(ctx, ev.icon, px, py, tileSize);
        if (vis) {
          var m = world.monsterAt(x, y);
          if (m) {
            A.mob(ctx, m.def.name, px, py, tileSize);
            if (m.awake) {
              ctx.fillStyle = '#e8735a';
              ctx.fillRect(px + tileSize * 0.42, py - 3, tileSize * 0.16, tileSize * 0.16);
            }
          }
        }
      }
    }

    // Người chơi luôn ở trên cùng.
    var hx = ox + (world.px - cam.x) * tileSize, hy = mapTop + (world.py - cam.y) * tileSize;
    A.hero(ctx, hx, hy, tileSize);

    // Đường đang đi tới.
    if (walkQueue.length) {
      ctx.fillStyle = 'rgba(242,210,75,.35)';
      walkQueue.forEach(function (p) {
        ctx.fillRect(ox + (p.x - cam.x) * tileSize + tileSize * 0.35,
          mapTop + (p.y - cam.y) * tileSize + tileSize * 0.35,
          tileSize * 0.3, tileSize * 0.3);
      });
    }

    // Viền tối quanh khung bản đồ.
    ctx.fillStyle = '#080c12';
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
      walkQueue.length = 0;
      openEvent(res.event);
      return;
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
    var wrap = $('#hic-panel');
    wrap.innerHTML = '';
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

  function itemCard(it, opts) {
    opts = opts || {};
    var card = el('div', 'hic-card r-' + it.rarity);
    // Gắn luôn món đồ vào thẻ để con bot thử nghiệm đọc được nó đang chọn gì.
    card.__hicItem = it;
    var top = el('div', 'hic-cardtop');
    top.appendChild(el('b', null, global.HIC_vnName(it.name)));
    var tag = el('span', 'hic-rar', global.HIC_RARITY_VN[it.rarity] || it.rarity);
    top.appendChild(tag);
    card.appendChild(top);
    var st = statLine(it);
    if (st) card.appendChild(el('div', 'hic-stats', st));
    var fx = global.HIC_vnEffect(it.name, 'item');
    if (fx) card.appendChild(el('div', 'hic-fx', fx));
    if ((it.tags || []).length) {
      card.appendChild(el('div', 'hic-tags',
        it.tags.map(function (t) { return global.HIC_TAG_VN[t] || t; }).join(' · ')));
    }
    if (opts.price != null) card.appendChild(el('div', 'hic-price', opts.price + ' vàng'));
    if (opts.onPick) {
      card.classList.add('pickable');
      card.onclick = function () { opts.onPick(it); };
    }
    return card;
  }

  /* ---------------------------------------------------- lắp đồ / thay đồ */

  function takeItem(it, after) {
    if (run.canEquip(it)) {
      run.equip(it);
      toast('Đã lắp ' + global.HIC_vnName(it.name), 'good');
      if (after) after();
      return;
    }
    // Hết ô: bắt chọn món để bỏ ra.
    var body = panel('Hết ô đồ', 'Chọn món muốn bỏ để lấy ' + global.HIC_vnName(it.name));
    run.inv.items.forEach(function (cur, i) {
      if (i === 0) return;    // ô vũ khí không bỏ trống được
      body.appendChild(itemCard(cur, {
        onPick: function () {
          run.drop(cur.uid);
          run.equip(it);
          toast('Đổi lấy ' + global.HIC_vnName(it.name), 'good');
          closePanel();
          if (after) after();
        }
      }));
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
      yes.onclick = function () {
        run.rest(out.kind);
        toast(out.kind === 'house' ? 'Bạn ngủ một giấc. Máu đầy.' : 'Bạn sưởi ấm và chợp mắt.', 'good');
        closePanel();
      };
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
        card.onclick = function () {
          run.applyEdge(edge);
          if (ev) ev.used = true;
          toast('Vũ khí đã được mài: ' + global.HIC_vnName(edge.name), 'good');
          closePanel();
        };
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
          card.onclick = function () {
            run.applyOil(oil);
            if (ev) ev.used = true;
            toast('Đã bôi ' + global.HIC_vnName(oil.name), 'good');
            closePanel();
          };
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
          var res = run.buy(it);
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
      rr.onclick = function () {
        run.rerolls--;
        closePanel();
        showShop({ title: out.title, offers: run.shopStock(3) }, ev);
      };
      body.appendChild(rr);
    }
    var leave = el('button', 'hic-btn wide ghost', 'Đi tiếp');
    leave.onclick = closePanel;
    body.appendChild(leave);
  }

  function takeItemPaid(it, ev, out) {
    if (run.gold < it.price) { toast('Không đủ vàng', 'bad'); return; }
    var body = panel('Hết ô đồ', 'Bỏ một món để mua ' + global.HIC_vnName(it.name));
    run.inv.items.forEach(function (cur, i) {
      if (i === 0) return;
      body.appendChild(itemCard(cur, {
        onPick: function () {
          run.gold -= it.price;
          run.drop(cur.uid);
          run.equip(it);
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
      ? 'Ghép hai món giống hệt nhau thành bản mạnh gấp đôi'
      : 'Bạn không có hai món nào giống hệt nhau.');
    pairs.forEach(function (p) {
      var card = el('div', 'hic-card r-golden pickable');
      card.appendChild(el('b', null, '2× ' + global.HIC_vnName(p.from) + '  →  ' + global.HIC_vnName(p.to)));
      card.appendChild(el('div', 'hic-fx', global.HIC_vnEffect(p.to, 'item')));
      card.onclick = function () {
        var made = run.golemCombine(p);
        if (made) toast('Rèn ra ' + global.HIC_vnName(made.name), 'good');
        closePanel();
      };
      body.appendChild(card);
    });
    var out = el('button', 'hic-btn wide ghost', 'Đi tiếp');
    out.onclick = closePanel;
    body.appendChild(out);
  }

  function showCauldron(ev) {
    var recipes = run.cauldronRecipes();
    var body = panel('Vạc nấu', recipes.length
      ? 'Nấu hai món ăn thành một món mạnh hơn'
      : 'Bạn chưa có đủ nguyên liệu cho công thức nào.');
    recipes.forEach(function (dish) {
      var card = el('div', 'hic-card r-cauldron pickable');
      card.appendChild(el('b', null, global.HIC_vnName(dish.name)));
      card.appendChild(el('div', 'hic-tags', dish.parts.map(global.HIC_vnName).join(' + ')));
      var fx = global.HIC_vnEffect(dish.name, 'item');
      if (fx) card.appendChild(el('div', 'hic-fx', fx));
      card.onclick = function () {
        var made = run.cauldronCook(dish);
        if (made) toast('Nấu xong ' + global.HIC_vnName(made.name), 'good');
        closePanel();
      };
      body.appendChild(card);
    });
    var out = el('button', 'hic-btn wide ghost', 'Đi tiếp');
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
      b.onclick = function () {
        var out = run.wellWish(choice);
        if (!out) return;
        closePanel();
        showEventResult(out, ev);
      };
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
    var body = panel('Túi đồ', 'Công ' + s.attack + '   Giáp ' + s.armor + '   Tốc ' + s.speed +
      '   Máu ' + run.hp() + '/' + s.maxHp);
    if (run.inv.edge) {
      var e = el('div', 'hic-card r-rare');
      e.appendChild(el('b', null, 'Lưỡi mài: ' + global.HIC_vnName(run.inv.edge.name)));
      e.appendChild(el('div', 'hic-fx', global.HIC_vnEffect(run.inv.edge.name, 'edge')));
      body.appendChild(e);
    }
    if (run.inv.oils.length) {
      body.appendChild(el('div', 'hic-hint', 'Dầu: ' +
        run.inv.oils.map(function (o) { return global.HIC_vnName(o.name); }).join(', ')));
    }
    run.inv.items.forEach(function (it, i) {
      var card = itemCard(it);
      if (i === 0) card.classList.add('weapon');
      body.appendChild(card);
    });
    run.inv.sets.forEach(function (st) {
      var c = el('div', 'hic-card r-heroic');
      c.appendChild(el('b', null, 'Bộ: ' + global.HIC_vnName(st.name)));
      c.appendChild(el('div', 'hic-fx', global.HIC_vnEffect(st.name, 'set')));
      body.appendChild(c);
    });
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
      face.onclick = function () { closePanel(); startBattle({ def: def, boss: true }); };
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
    early.onclick = function () { closePanel(); startBattle({ def: def, boss: true }); };
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

  function playBattle(res, def, target) {
    var wrap = $('#hic-battle');
    wrap.style.display = 'flex';
    wrap.innerHTML = '';

    var head = el('div', 'hic-bhead');
    var me = el('div', 'hic-fighter me');
    me.appendChild(global.HIC_iconCanvas('hero', null, 44));
    me.appendChild(el('b', null, 'Bạn'));
    var meBar = el('div', 'hic-bar');
    var meFill = el('i');
    meBar.appendChild(meFill);
    me.appendChild(meBar);
    var meNum = el('div', 'hic-bnum', '');
    me.appendChild(meNum);

    var foe = el('div', 'hic-fighter foe');
    var fi = global.HIC_iconCanvas('mob', def.name, 44);
    foe.appendChild(fi);
    foe.appendChild(el('b', null, global.HIC_vnName(def.name)));
    var foeBar = el('div', 'hic-bar');
    var foeFill = el('i');
    foeBar.appendChild(foeFill);
    foe.appendChild(foeBar);
    var foeNum = el('div', 'hic-bnum', '');
    foe.appendChild(foeNum);

    head.appendChild(me);
    head.appendChild(el('div', 'hic-vs', 'vs'));
    head.appendChild(foe);
    wrap.appendChild(head);

    var logBox = el('div', 'hic-blog');
    wrap.appendChild(logBox);

    var foot = el('div', 'hic-bfoot');
    var skip = el('button', 'hic-btn', 'Bỏ qua ▶▶');
    var done = el('button', 'hic-btn primary', 'Xong');
    done.style.display = 'none';
    foot.appendChild(skip);
    foot.appendChild(done);
    wrap.appendChild(foot);

    var lines = res.log, i = 0, timer = null;

    function paint(snap) {
      meFill.style.width = Math.round(100 * snap.a.hp / Math.max(1, snap.a.maxHp)) + '%';
      foeFill.style.width = Math.round(100 * snap.b.hp / Math.max(1, snap.b.maxHp)) + '%';
      meNum.textContent = snap.a.hp + '/' + snap.a.maxHp +
        (snap.a.armor ? '  Giáp ' + snap.a.armor : '') + (snap.a.thorns ? '  Gai ' + snap.a.thorns : '');
      foeNum.textContent = snap.b.hp + '/' + snap.b.maxHp +
        (snap.b.armor ? '  Giáp ' + snap.b.armor : '') + (snap.b.thorns ? '  Gai ' + snap.b.thorns : '');
    }

    function finish() {
      if (timer) clearInterval(timer);
      timer = null;
      if (lines.length) paint(lines[lines.length - 1]);
      logBox.appendChild(el('div', 'hic-bline result ' + (res.playerWon ? 'win' : 'lose'),
        res.playerWon ? 'Bạn thắng.' : 'Bạn gục ngã.'));
      logBox.scrollTop = logBox.scrollHeight;
      skip.style.display = 'none';
      done.style.display = '';
    }

    function step() {
      if (i >= lines.length) { finish(); return; }
      var ln = lines[i++];
      paint(ln);
      logBox.appendChild(el('div', 'hic-bline', ln.t));
      logBox.scrollTop = logBox.scrollHeight;
    }

    if (lines.length) paint(lines[0]);
    timer = setInterval(step, 260);
    skip.onclick = function () {
      if (timer) clearInterval(timer);
      timer = null;
      while (i < lines.length) {
        var ln = lines[i++];
        logBox.appendChild(el('div', 'hic-bline', ln.t));
      }
      finish();
    };
    done.onclick = function () {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      busy = false;
      afterBattle(res, def);
    };
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
    go.onclick = function () { closePanel(); startBattle({ def: run.boss, boss: true }); };
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
    again.onclick = function () { newRun(); };
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

  function bindInput() {
    cv.addEventListener('pointerdown', function (e) {
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
      if (adj === 1) { walkQueue = []; tryStep(tx - world.px, ty - world.py); return; }
      if (adj === 0) return;
      walkTo(tx, ty);
    });

    [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]].forEach(function (d) {
      var b = $('#hic-' + d[0]);
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        walkQueue = [];
        tryStep(d[1], d[2]);
      });
    });

    $('#hic-bag').onclick = showInventory;
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
      drawMap();
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

  global.HIC_UI = {
    newRun: newRun, toast: toast, walkTo: walkTo, tryStep: tryStep,
    showInventory: showInventory, closePanel: closePanel,
    isBusy: function () { return busy; },
    get run() { return run; },
    get world() { return world; }
  };
})(window);
