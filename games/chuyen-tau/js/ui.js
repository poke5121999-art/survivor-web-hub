/*
 * CHUYẾN TÀU CUỐI — giao diện.
 *
 * Vẽ 100% bằng DOM, không phải bằng canvas. Lý do duy nhất và đủ: chữ tiếng Việt phải
 * luôn có dấu đúng. Hỏi hệ điều hành lấy font trong ngữ cảnh vẽ thì mọi dấu tiếng Việt
 * rụng sạch, còn DOM thì trình duyệt lo.
 *
 * Ba bài học về THỨ TỰ, mỗi cái là một lỗi thật:
 *
 *   1. DỰNG BẢNG TRƯỚC, ĐÓNG BĂNG THẾ GIỚI SAU. Thứ tự ngược lại (đóng băng rồi mới
 *      dựng) nghĩa là nếu hàm dựng ném lỗi thì thế giới đã đứng hình mà chưa có bảng
 *      nào để bấm — người chơi kẹt vĩnh viễn, không có lối ra nào ngoài tải lại trang.
 *
 *   2. GẮN KHUNG VÀ NÚT ĐÓNG TRƯỚC, ĐỔ NỘI DUNG SAU. Cùng một lý lẽ, một tầng sâu hơn:
 *      nội dung ném lỗi thì vẫn còn cái nút ✕.
 *
 *   3. KHÔNG DÙNG CHÂN TRANG DÍNH CÓ NỀN CHUYỂN SẮC TRONG SUỐT. Hàng đồ đầu tiên vẫn
 *      nhìn thấy dưới thanh và trông như bấm được, nhưng cú chạm rơi vào nút "Đóng"
 *      nằm trên. Chia flex BA TẦNG: đầu / danh sách cuộn / chân tĩnh.
 *
 * KÉO THẢ: viết bằng pointer event thuần, KHÔNG dùng HTML5 drag-and-drop API — API đó
 * không chạy tử tế trên cảm ứng. Luật:
 *   - chạm rồi di quá 8px = bắt đầu kéo (KHÔNG dùng giữ-lâu: chờ 250ms mới kéo được là
 *     cảm giác lag, và người chơi sẽ tưởng máy đơ)
 *   - chạm rồi nhả tại chỗ dưới 250ms = mở chi tiết món
 *   - bám theo pointerId suốt cú kéo, vì ngón cái thứ hai bấm vào một ô khác không được
 *     phép giết cú kéo của ngón thứ nhất
 *   - thả ra ngoài mọi vùng đích = trả món về chỗ cũ, không rơi mất
 */
(function (root) {
  'use strict';

  const CT = root.CT;
  const G = CT.GAME;
  const U = CT.UI = {};
  const M = () => CT.M;

  // ---------------------------------------------------------------------------
  // tiện ích
  // ---------------------------------------------------------------------------
  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function on(n, ev, fn) { n.addEventListener(ev, fn); return n; }
  function btn(txt, fn, cls) {
    const b = el('button', 'btn ' + (cls || ''), txt);
    on(b, 'click', fn);
    return b;
  }
  U.el = el; U.on = on; U.btn = btn;

  let host = null, toastBox = null;
  U.mount = function (h) {
    host = h;
    toastBox = el('div', 'toasts');
    document.body.appendChild(toastBox);
  };

  U.toast = function (txt, good) {
    const t = el('div', 'toast' + (good ? ' good' : ''), txt);
    toastBox.appendChild(t);
    setTimeout(() => { t.classList.add('out'); }, 1700);
    setTimeout(() => { t.remove(); }, 2200);
  };

  // Cửa sổ nổi. Khung và nút ✕ gắn TRƯỚC, nội dung đổ SAU.
  let openPop = null;
  U.popup = function (title, build, opt) {
    U.closePop();
    opt = opt || {};
    const wrap = el('div', 'pop-wrap');
    const box = el('div', 'pop ' + (opt.cls || ''));
    const head = el('div', 'pop-h');
    head.appendChild(el('div', 'pop-t', title));
    const x = el('button', 'pop-x', '✕');
    on(x, 'click', () => U.closePop());
    head.appendChild(x);
    box.appendChild(head);
    const body = el('div', 'pop-b');
    box.appendChild(body);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    openPop = { wrap, body, onClose: opt.onClose };
    on(wrap, 'pointerdown', e => { if (e.target === wrap) U.closePop(); });
    try { build(body); } catch (e) {
      body.appendChild(el('div', 'err', 'Có lỗi khi dựng bảng này: ' + e.message));
    }
    return openPop;
  };
  U.closePop = function () {
    if (!openPop) return;
    const o = openPop; openPop = null;
    o.wrap.remove();
    if (o.onClose) o.onClose();
  };
  U.popOpen = () => !!openPop;

  // ---------------------------------------------------------------------------
  // KÉO THẢ
  // ---------------------------------------------------------------------------
  // Một cú kéo duy nhất tại một thời điểm, bám theo pointerId.
  let drag = null;
  const dropZones = [];

  function registerZone(node, accept, drop) {
    dropZones.push({ node, accept, drop });
    return node;
  }
  function clearZones() { dropZones.length = 0; }

  // Biến một ô thành thứ kéo được.
  function makeDraggable(node, payload, onTap) {
    node.style.touchAction = 'none';
    on(node, 'pointerdown', e => {
      if (e.button === 2 || e.button === 1) return;
      if (drag) return;                          // đã có một cú kéo đang chạy
      const id = e.pointerId;
      const sx = e.clientX, sy = e.clientY, t0 = performance.now();
      let started = false;
      let ghost = null;

      const move = ev => {
        if (ev.pointerId !== id) return;         // ngón khác: kệ nó
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!started && Math.hypot(dx, dy) > 8) {
          started = true;
          ghost = node.cloneNode(true);
          ghost.className += ' dragging';
          document.body.appendChild(ghost);
          node.classList.add('src');
          drag = { id, payload, ghost, node };
        }
        if (started) {
          ghost.style.left = ev.clientX + 'px';
          ghost.style.top = ev.clientY + 'px';
          // tô sáng vùng đích ngón tay đang đi qua
          dropZones.forEach(z => {
            const hit = hitZone(z, ev.clientX, ev.clientY) && z.accept(payload);
            z.node.classList.toggle('over', !!hit);
          });
          ev.preventDefault();
        }
      };
      const up = ev => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        dropZones.forEach(z => z.node.classList.remove('over'));
        node.classList.remove('src');
        if (ghost) ghost.remove();
        if (!started) {
          // chạm rồi nhả tại chỗ = mở chi tiết
          if (performance.now() - t0 < 250 && onTap) onTap();
          drag = null;
          return;
        }
        drag = null;
        // thả vào đâu?
        let hit = null;
        for (const z of dropZones) {
          if (hitZone(z, ev.clientX, ev.clientY) && z.accept(payload)) { hit = z; break; }
        }
        // Thả ra ngoài mọi vùng đích = trả món về chỗ cũ. Không bao giờ để rơi mất.
        if (hit) hit.drop(payload);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);   // cuộn giữa chừng cũng phải dọn
    });
    return node;
  }
  function hitZone(z, x, y) {
    // Ở đây dùng getBoundingClientRect là ĐÚNG: nó đo một phần tử DOM trong cùng một hệ
    // toạ độ với clientX/clientY. Luật "chỉ dùng offsetWidth" là luật của khung canvas,
    // nơi CSS xoay 90° làm hai cách đo lệch nhau — không áp cho các ô trong bảng này.
    const r = z.node.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  U.makeDraggable = makeDraggable;
  U.registerZone = registerZone;

  // ---------------------------------------------------------------------------
  // BAO TẢI + TỦ (trong ván)
  // ---------------------------------------------------------------------------
  U.openBag = function () {
    const R = G.R();
    if (!R) return;
    R.paused = true;                                   // đóng băng SAU khi bảng dựng xong
    clearZones();
    U.popup('Bao tải', body => {
      body.className = 'pop-b bag-wrap';

      // --- tầng 0: hai khẩu súng ---
      // Đặt TRÊN ba ô tay vì đây là thứ người chơi mở bao tải giữa trận để xem nhiều
      // nhất: còn bao nhiêu đạn, và khẩu kia có đáng rút ra không.
      body.appendChild(el('div', 'sec-h', 'Súng — một trên tay, một sau lưng'));
      const guns = el('div', 'gun-row');
      const gunCell = (g, mag, main) => {
        const cell = el('div', 'gun' + (main ? ' main' : '') + (g ? '' : ' empty'));
        if (g) {
          cell.appendChild(el('div', 'gun-i', g.icon));
          const m = el('div', 'gun-m');
          m.appendChild(el('div', 'gun-n', g.name));
          m.appendChild(el('div', 'gun-s',
            (main && R.reloadT > 0 ? 'đang nạp…' : mag + ' / ' + (R.ammo[g.ammo] | 0)) +
            '  ·  ' + g.dmg + ' sát thương'));
          cell.appendChild(m);
          cell.appendChild(el('div', 'gun-tag', main ? 'TRÊN TAY' : 'sau lưng'));
        } else {
          cell.appendChild(el('div', 'gun-i dim', main ? '✊' : '·'));
          const m0 = el('div', 'gun-m');
          m0.appendChild(el('div', 'gun-n',
            main ? 'Tay không' : 'Chỗ trống'));
          m0.appendChild(el('div', 'gun-s',
            main ? 'Đánh gần — không gây tiếng động nào' : 'Mua thêm một khẩu ở quầy ga.'));
          cell.appendChild(m0);
        }
        return cell;
      };
      guns.appendChild(gunCell(R.gun, R.gunMag, true));
      guns.appendChild(gunCell(R.gunAlt, R.gunAltMag, false));
      body.appendChild(guns);
      if (R.gunAlt) {
        body.appendChild(btn('⇄  Rút ' + R.gunAlt.name + '  (phím Q)', () => {
          G.swapGun(); U.openBag();
        }, 'main wide-btn'));
      }

      // --- tầng 1: ba ô tay ---
      const hh = el('div', 'sec-h', 'Ba ô tay — mua là vào thẳng đây, đạn không chiếm chỗ');
      body.appendChild(hh);
      const hands = el('div', 'hand-row');
      for (let i = 0; i < CT.HAND_SLOTS; i++) {
        const it = R.hand[i];
        const cell = el('div', 'hand' + (it ? '' : ' empty'));
        cell.dataset.slot = i;
        if (it) {
          const u = CT.USABLE_BY_ID[it.id];
          cell.appendChild(el('div', 'hand-i', u.icon));
          cell.appendChild(el('div', 'hand-n', u.name));
          cell.appendChild(el('div', 'hand-c', '×' + it.n));
          makeDraggable(cell, { from: 'hand', i, it },
            () => U.toast(u.desc));
        } else {
          cell.appendChild(el('div', 'hand-i dim', '＋'));
        }
        registerZone(cell, pl => pl.from !== 'hand', pl => {
          // chỉ nhận đồ DÙNG được, không nhận đồ bán
          if (pl.from === 'bag') { U.toast('Đồ bán không nhét vào ô tay được.'); return; }
        });
        hands.appendChild(cell);
      }
      body.appendChild(hands);

      // --- tầng 2: bao tải (cuộn) ---
      const free = G.bagFree();
      const cap = R.bagMax + (R.spec.bagPlus || 0);
      const bh = el('div', 'sec-h');
      bh.innerHTML = 'Bao tải <b>' + G.bagUsed() + ' / ' + cap + '</b> ô' +
        (free <= 0 ? ' <span class="bad">— đầy rồi</span>' : '');
      body.appendChild(bh);

      const grid = el('div', 'bag-grid');
      R.bag.forEach((it, i) => {
        const cell = el('div', 'cell' + (it.cells > 1 ? ' wide' : ''));
        cell.appendChild(el('div', 'cell-i', '◆'));
        cell.querySelector('.cell-i').style.color = it.mat.ramp[1];
        cell.appendChild(el('div', 'cell-n', it.name));
        cell.appendChild(el('div', 'cell-v', CT.money(it.val)));
        makeDraggable(cell, { from: 'bag', i, it },
          () => U.toast(it.name + ' — ' + CT.money(it.val) + ' vàng, chiếm ' + it.cells + ' ô'));
        grid.appendChild(cell);
      });
      if (!R.bag.length) grid.appendChild(el('div', 'empty-note', 'Bao tải trống.'));
      body.appendChild(grid);

      // --- tầng 3: tủ trên tàu ---
      const onTrain = G.nearTrain();
      const sh = el('div', 'sec-h');
      sh.innerHTML = 'Tủ trên tàu <b>' + R.stash.length + '</b> món' +
        (onTrain ? '' : ' <span class="bad">— phải đứng trên tàu mới với tới</span>');
      body.appendChild(sh);

      const stashBox = el('div', 'stash-box' + (onTrain ? '' : ' off'));
      const sgrid = el('div', 'bag-grid small');
      R.stash.slice(-40).forEach((it, i) => {
        const cell = el('div', 'cell');
        cell.appendChild(el('div', 'cell-i', '◆'));
        cell.querySelector('.cell-i').style.color = it.mat.ramp[1];
        cell.appendChild(el('div', 'cell-n', it.name));
        cell.appendChild(el('div', 'cell-v', CT.money(it.val)));
        if (onTrain) makeDraggable(cell, { from: 'stash', i: R.stash.indexOf(it), it }, null);
        sgrid.appendChild(cell);
      });
      if (!R.stash.length) sgrid.appendChild(el('div', 'empty-note', 'Tủ trống.'));
      stashBox.appendChild(sgrid);
      body.appendChild(stashBox);

      // vùng thả: bao tải ↔ tủ
      registerZone(stashBox, pl => onTrain && pl.from === 'bag', pl => {
        const it = R.bag.splice(pl.i, 1)[0];
        if (it) { R.stash.push(it); U.toast('Cất vào tủ.', true); }
        U.openBag();
      });
      registerZone(grid, pl => pl.from === 'stash', pl => {
        const it = R.stash[pl.i];
        if (!it) return;
        if (it.cells > G.bagFree()) { U.toast('Bao tải không còn chỗ.'); return; }
        R.stash.splice(pl.i, 1);
        R.bag.push(it);
        U.openBag();
      });

      // --- chân tĩnh: ba nút ---
      const foot = el('div', 'pop-f');
      foot.appendChild(btn('Nhét hết vô tủ', () => {
        const n = G.dumpAll();
        if (n) U.openBag(); else U.toast('Không có gì để cất.');
      }, onTrain ? 'main' : 'off'));
      foot.appendChild(btn('Lấy hết ra', () => {
        if (!onTrain) { U.toast('Phải đứng trên tàu.'); return; }
        let n = 0;
        while (R.stash.length && R.stash[R.stash.length - 1].cells <= G.bagFree()) {
          R.bag.push(R.stash.pop()); n++;
        }
        U.toast(n ? ('Lấy ra ' + n + ' món.') : 'Bao tải đầy.', !!n);
        U.openBag();
      }));
      foot.appendChild(btn('Đóng', () => U.closePop()));
      body.appendChild(foot);
    }, { cls: 'wide', onClose: () => { const r = G.R(); if (r) r.paused = false; clearZones(); } });
  };

  // ---------------------------------------------------------------------------
  // QUẦY HÀNG — mua ở tab trái, bán ở tab phải
  // ---------------------------------------------------------------------------
  // Hai tab chứ không phải hai cửa sổ. Ở ga đồng hồ vẫn chạy, và mỗi lần đóng-mở cửa sổ
  // là một lần người chơi mất dấu mình đang làm gì. Một cửa sổ, một chỗ hiện số tiền,
  // và số tiền đó nằm ở đầu bảng nên nó không bao giờ trôi ra khỏi tầm mắt.
  let shopTab = 'mua';
  U.openShop = function (tab) {
    const R = G.R();
    if (!R) return;
    if (tab) shopTab = tab;
    R.paused = true;
    clearZones();
    U.popup('Quầy hàng', body => {
      body.className = 'pop-b shop-wrap';

      const money = el('div', 'money-bar');
      money.innerHTML = '<b>$ ' + CT.money(R.cash) + '</b>' +
        '<span>🪨 ' + R.coal + ' than</span>' +
        '<span>🎒 ' + G.bagUsed() + '/' + (R.bagMax + (R.spec.bagPlus || 0)) + '</span>';
      body.appendChild(money);

      const tabs = el('div', 'tabs');
      [['mua', 'MUA'], ['ban', 'BÁN']].forEach(pair => {
        tabs.appendChild(btn(pair[1], () => { shopTab = pair[0]; U.openShop(); },
                             shopTab === pair[0] ? 'tab on' : 'tab'));
      });
      body.appendChild(tabs);

      if (shopTab === 'mua') buildBuy(body, R); else buildSell(body, R);

      const foot = el('div', 'pop-f');
      foot.appendChild(btn('Đóng', () => U.closePop(), 'main'));
      body.appendChild(foot);
    }, { cls: 'wide', onClose: () => { const r = G.R(); if (r) r.paused = false; clearZones(); } });
  };

  function buildBuy(body, R) {
    const st = R.station && R.station.shop;
    if (!st) { body.appendChild(el('div', 'empty-note', 'Không có quầy nào ở đây.')); return; }
    body.appendChild(el('div', 'sec-h',
      'Đạn vào thùng đạn, than vào toa than, đồ dùng vào thẳng ô tay — không món nào ăn chỗ bao tải.'));
    const list = el('div', 'shop-list');
    st.stock.forEach(row => {
      const k = CT.STOCK.find(x => x.id === row.id);
      if (!k) return;
      const afford = R.cash >= k.cash && row.left > 0;
      const r = el('div', 'shop-row' + (afford ? '' : ' off'));
      r.appendChild(el('div', 'sr-i', k.icon));
      const mid = el('div', 'sr-m');
      mid.appendChild(el('div', 'sr-n', k.name + (k.n > 1 ? ' ×' + k.n : '')));
      mid.appendChild(el('div', 'sr-d', descOfStock(k)));
      r.appendChild(mid);
      const right = el('div', 'sr-r');
      right.appendChild(el('div', 'sr-p', '$' + CT.money(k.cash)));
      right.appendChild(el('div', 'sr-l', row.left > 0 ? ('còn ' + row.left) : 'hết'));
      r.appendChild(right);
      on(r, 'click', () => {
        const res = G.buy(k.id);
        if (!res.ok) { U.toast(res.why); return; }
        U.toast('Mua ' + k.name + '.', true);
        U.openShop();
      });
      list.appendChild(r);
    });
    body.appendChild(list);
  }

  function descOfStock(k) {
    if (k.desc) return k.desc;
    if (k.kind === 'gun') {
      const g = CT.GUN_BY_ID[k.gun];
      return g ? (g.dmg + ' sát thương · băng ' + g.mag + ' · ' +
                  CT.AMMO_BY_ID[g.ammo].name.toLowerCase()) : '';
    }
    if (k.kind === 'ammo') return 'Vào thẳng thùng đạn, không chiếm ô bao tải.';
    if (k.kind === 'use') { const u = CT.USABLE_BY_ID[k.use]; return u ? u.desc : ''; }
    return '';
  }

  function buildSell(body, R) {
    body.appendChild(el('div', 'sec-h',
      'Bán lấy tiền tiêu NGAY ở ga. Giữ lại thì cuối ván đổi ra vàng — nhưng chỉ khi bạn về tới nơi.'));

    let total = 0;
    R.bag.forEach(it => { total += G.sellPriceOf(it); });

    const list = el('div', 'shop-list');
    R.bag.forEach((it, i) => {
      const r = el('div', 'shop-row');
      const ic = el('div', 'sr-i', '◆');
      ic.style.color = it.mat.ramp[1];
      r.appendChild(ic);
      const mid = el('div', 'sr-m');
      mid.appendChild(el('div', 'sr-n', it.name));
      const bv = G.burnValOf(it);
      mid.appendChild(el('div', 'sr-d', it.cells + ' ô' + (bv > 0 ? ' · đốt được (+' + bv + ' lò)' : '')));
      r.appendChild(mid);
      const right = el('div', 'sr-r');
      right.appendChild(el('div', 'sr-p', '$' + CT.money(G.sellPriceOf(it))));
      r.appendChild(right);
      on(r, 'click', () => {
        const v = G.sellOne('bag', i);
        if (v) { U.toast('Bán ' + it.name + ' — $' + CT.money(v), true); U.openShop(); }
      });
      list.appendChild(r);
    });
    if (!R.bag.length) list.appendChild(el('div', 'empty-note', 'Bao tải trống. Vào nhà lục đi.'));
    body.appendChild(list);

    if (R.bag.length) {
      const f = el('div', 'sec-h');
      f.innerHTML = 'Bán sạch bao tải: <b>$' + CT.money(total) + '</b>';
      body.appendChild(f);
      body.appendChild(btn('Bán hết bao tải', () => {
        const v = G.sellAllBag();
        U.toast(v ? ('Bán hết — $' + CT.money(v)) : 'Không bán được.', !!v);
        U.openShop();
      }, 'main wide-btn'));
    }
  }

  // ---------------------------------------------------------------------------
  // CỬA LÒ — chỗ duy nhất biến than, xác và đồ đạc thành quãng đường
  // ---------------------------------------------------------------------------
  U.openFire = function () {
    const R = G.R();
    if (!R) return;
    R.paused = true;
    clearZones();
    U.popup('Cửa lò', body => {
      body.className = 'pop-b fire-wrap';

      // Thanh nhiên liệu quy ra GIÂY CÒN CHẠY, không phải phần trăm. "Còn 41%" không nói
      // được gì; "còn 118 giây" thì người chơi tự tính ra đủ tới ga hay không.
      const burn = CT.FUEL.burnPerSec * R.spec.fuelMul;
      const sec = Math.round(R.fuel / burn);
      const k = R.fuel / CT.FUEL.tank;
      const gauge = el('div', 'gauge');
      const fill = el('div', 'gauge-f');
      fill.style.width = Math.round(k * 100) + '%';
      fill.style.background = k > 0.35 ? '#d8963a' : k > 0.15 ? '#c4642a' : '#a8321f';
      gauge.appendChild(fill);
      body.appendChild(gauge);
      const need = Math.max(0, Math.ceil(CT.LEG.runSec - R.phaseT));
      body.appendChild(el('div', 'sec-h',
        'Lò còn cháy được ' + sec + ' giây' +
        (R.phase === 'chay'
          ? (sec >= need ? ' — thừa sức tới ga (' + need + 's nữa).'
                         : ' — THIẾU ' + (need - sec) + ' giây nữa mới tới ga.')
          : '.')));

      const rowBtn = (icon, name, desc, off, fn) => {
        const r = el('div', 'shop-row' + (off ? ' off' : ''));
        r.appendChild(el('div', 'sr-i', icon));
        const m = el('div', 'sr-m');
        m.appendChild(el('div', 'sr-n', name));
        m.appendChild(el('div', 'sr-d', desc));
        r.appendChild(m);
        on(r, 'click', fn);
        return r;
      };

      body.appendChild(rowBtn('🪨', 'Xúc một cục than',
        'Trong toa còn ' + R.coal + ' cục · mỗi cục +' + Math.round(CT.BURNABLE.than / burn) + ' giây',
        R.coal <= 0, () => { if (G.shovel()) U.openFire(); }));

      const nC = R.corpses.length + (R.p.carry ? 1 : 0);
      body.appendChild(rowBtn('💀', 'Ném một cái xác vào lò',
        nC ? (nC + ' cái trong tầm với · +' + Math.round(CT.BURNABLE.xac / burn) + ' giây mỗi cái')
           : 'Không có cái xác nào gần đây.',
        nC <= 0, () => { if (G.burnCorpse()) U.openFire(); else U.toast('Không có xác nào gần lò.'); }));

      body.appendChild(el('div', 'sec-h', 'Đốt đồ trong bao — mất luôn tiền bán nó'));
      const list = el('div', 'shop-list');
      let any = false;
      R.bag.forEach((it, i) => {
        const v = G.burnValOf(it);
        if (v <= 0) return;
        any = true;
        list.appendChild(rowBtn('🔥', it.name,
          'bán được $' + CT.money(G.sellPriceOf(it)) + ' · đốt được +' + Math.round(v / burn) + ' giây',
          false, () => { if (G.burnItem('bag', i)) U.openFire(); }));
      });
      if (!any) list.appendChild(el('div', 'empty-note',
        'Không có gì trong bao cháy được. Gỗ, vải và giấy thì cháy; đồng, bạc, vàng thì không.'));
      body.appendChild(list);

      const foot = el('div', 'pop-f');
      foot.appendChild(btn('Đóng', () => U.closePop(), 'main'));
      body.appendChild(foot);
    }, { onClose: () => { const r = G.R(); if (r) r.paused = false; clearZones(); } });
  };

  // ---------------------------------------------------------------------------
  // SỔ TAY
  // ---------------------------------------------------------------------------
  // Mở được từ NGOÀI ván lẫn TRONG ván (phím H, hoặc nút trong bảng tạm dừng). Người ta
  // hay cần tra đúng lúc đang bí, chứ không phải lúc rảnh ở màn hình chính.
  let wikiTab = 'choi';
  U.openWiki = function (tab) {
    if (tab) wikiTab = tab;
    const R = G.R();
    if (R) R.paused = true;
    const PAGES = { choi: wikiPlay, quai: wikiFoes, nguoi: wikiChars,
                    sung: wikiGear, tau: wikiTrain };
    U.popup('Sổ tay', body => {
      body.className = 'pop-b wiki-wrap';
      const tabs = el('div', 'tabs');
      [['choi', 'Cách chơi'], ['quai', 'Quái'], ['nguoi', 'Nhân vật'],
       ['sung', 'Súng & đồ'], ['tau', 'Tàu & lò']].forEach(pair => {
        tabs.appendChild(btn(pair[1], () => { wikiTab = pair[0]; U.openWiki(); },
                             wikiTab === pair[0] ? 'tab on' : 'tab'));
      });
      body.appendChild(tabs);
      const box = el('div', 'wiki-body');
      body.appendChild(box);
      (PAGES[wikiTab] || wikiPlay)(box);
      const foot = el('div', 'pop-f');
      foot.appendChild(btn('Đóng', () => U.closePop(), 'main'));
      body.appendChild(foot);
    }, { cls: 'wide', onClose: () => { const r = G.R(); if (r) r.paused = false; } });
  };

  function wikiSec(box, title, lines) {
    box.appendChild(el('div', 'wk-h', title));
    const ul = el('div', 'wk-list');
    lines.forEach(t => { const d = el('div', 'wk-li'); d.innerHTML = t; ul.appendChild(d); });
    box.appendChild(ul);
  }

  function wikiPlay(box) {
    wikiSec(box, 'Một ván diễn ra thế nào', [
      'Một ván là <b>ba tới năm chặng</b>. Mỗi chặng có hai nửa: <b>trên tàu</b> (' +
        CT.LEG.runSec + ' giây) rồi <b>ở ga</b> (' + CT.LEG.stationSec + ' giây).',
      'Ở ga, <b>tàu chạy tiếp dù có bạn hay không</b>. Nghe còi là chạy về. Bị bỏ lại thì mất sạch bao tải và mất bốn phần mười máu.',
      'Hết chặng cuối là thắng. Hết máu là thua — và <b>đồ trong bao tải mất, đồ trong tủ thì không</b>.'
    ]);
    wikiSec(box, 'Ở ga làm gì', [
      'Đẩy cần trái <b>xuống</b> khi đang đứng ở mép sàn để nhảy khỏi tàu. Đi vào giữa đoàn tàu rồi đẩy <b>lên</b> để leo lại.',
      '<b>Quầy hàng</b> đỗ ngay cạnh tàu, có vòng sáng dưới chân. Bấm ✋ trong vòng đó để mở.',
      'Quầy <b>mua và bán</b>: bán đồ trong bao lấy tiền, mua đạn, than, đồ dùng và súng.',
      'Hàng ở quầy <b>bốc ngẫu nhiên mỗi ga</b> và không ga nào có đủ mọi thứ. Thấy khẩu mình cần thì mua ngay.',
      'Trong nhà có đồ. Nhà <b>khoá</b> thì phải phá — mà phá thì ồn.'
    ]);
    wikiSec(box, 'Ngày và đêm', [
      'Ban ngày <b>không con quái nào sinh ra</b>. Áp lực ban ngày là do chính bạn tự tạo: tham thêm một căn nhà nữa.',
      'Ban đêm quái sinh liên tục và mạnh dần theo số đêm đã qua. Bốn kiểu đêm khác nhau, đêm bão còn có sét đánh.',
      'Đèn pha tàu, đèn bão ở quầy và ánh lửa trong lò là ba nguồn sáng bạn đọc được đường trong đêm.'
    ]);
    wikiSec(box, 'Tiếng động đánh thức quái', [
      'Quái sinh ra <b>đang ngủ</b>. Chúng dậy theo tiếng động, mỗi thứ một bán kính:',
      'Đi bộ ' + CT.NOISE.chan + ' · kéo đồ ' + CT.NOISE.keo + ' · chạy ' + CT.NOISE.sprint +
        ' · tàu ' + CT.NOISE.tau + ' · <b>súng ' + CT.NOISE.sung + '</b> · nổ ' + CT.NOISE.no,
      '<b>Đánh tay không đánh thức gì cả.</b> Dọn sạch một căn nhà bằng dao là chuyện làm được.'
    ]);
    wikiSec(box, 'Nút bấm', [
      '<b>Cần trái</b> đi · <b>cần phải</b> ngắm (thả ra thì tự ngắm con gần nhất) · <b>🔫</b> bắn',
      '<b>💨</b> lướt — ' + CT.DODGE.charges + ' lượt, bất tử ' +
        Math.round(CT.DODGE.iframe * 1000) + ' mili giây · <b>chiêu riêng</b> mỗi nhân vật một kiểu',
      '<b>✋</b> làm việc — nhặt, vác xác, xúc than, mở quầy. <b>Chữ dưới nút luôn nói trước nó sắp làm gì.</b>',
      'Nút ✋ dọn <b>chỗ đứng</b> trước rồi mới mở quầy: còn đồ hay xác dưới chân thì nó nhặt cái đó.',
      'Đi đè lên một món nhỏ thì <b>tự nhặt</b>, không cần bấm. Bấm ✋ là để với xa hơn một chút.',
      '<b>🎒</b> bao tải · <b>🗄️</b> nhét hết vô tủ',
      'Máy tính: WASD đi · chuột ngắm · Space lướt · E chiêu · F làm việc · R nạp · <b>Q đổi súng</b> · I bao tải · <b>H sổ tay</b>'
    ]);
  }

  function wikiFoes(box) {
    box.appendChild(el('div', 'wk-h', 'Những thứ đi trong đêm'));
    CT.FOES.forEach(f => {
      const r = el('div', 'wk-foe');
      const h = el('div', 'wk-foe-h');
      h.appendChild(el('span', 'wk-foe-n', f.name));
      h.appendChild(el('span', 'wk-foe-s',
        '❤ ' + f.hp + '   ⚔ ' + (f.dmg || (f.blast ? f.blast.dmg : 0)) +
        '   👟 ' + f.spd + '   👁 ' + f.sight));
      r.appendChild(h);
      r.appendChild(el('div', 'wk-foe-d', f.wiki || ''));
      const tags = el('div', 'wk-tags');
      tags.appendChild(el('span', f.corpse ? 'tag good' : 'tag',
                          f.corpse ? 'xác đốt được' : 'không để lại xác'));
      if (f.bounty) tags.appendChild(el('span', 'tag gold', 'vác về quầy: $' + CT.money(f.bounty)));
      if (f.night) tags.appendChild(el('span', 'tag', 'chỉ ra ban đêm'));
      if (f.pack) tags.appendChild(el('span', 'tag', 'đi đàn ' + f.pack));
      if (f.blast) tags.appendChild(el('span', 'tag bad', 'nổ khi chết'));
      if (f.dash) tags.appendChild(el('span', 'tag bad', 'lao thẳng — bước sang bên là né'));
      if (f.blink) tags.appendChild(el('span', 'tag bad', 'chớp chỗ'));
      r.appendChild(tags);
      box.appendChild(r);
    });
  }

  function wikiChars(box) {
    box.appendChild(el('div', 'wk-h', 'Mười người, mười lối chơi'));
    CT.CHARS.forEach(cd => {
      const st = CT.statsOf(cd.id);
      const sk = CT.skillOf(cd.id);
      const owned = !!(CT.M.chars && CT.M.chars[cd.id]);
      const r = el('div', 'wk-foe' + (owned ? '' : ' locked'));
      const h = el('div', 'wk-foe-h');
      h.appendChild(el('span', 'wk-foe-n', '★'.repeat(cd.star) + ' ' + cd.name));
      h.appendChild(el('span', 'wk-foe-s', '❤ ' + st.hp + '   🎒 ' + st.bag + ' ô'));
      r.appendChild(h);
      r.appendChild(el('div', 'wk-foe-d', cd.role));
      const a = el('div', 'wk-sk');
      a.innerHTML = (sk.icon || '✦') + '  <b>' + sk.name + '</b> — ' + (sk.desc || '');
      r.appendChild(a);
      if (cd.passive && cd.passive.desc) {
        const b = el('div', 'wk-sk pas');
        b.innerHTML = '◇  <b>Bị động</b> — ' + cd.passive.desc;
        r.appendChild(b);
      }
      if (cd.station) {
        const c2 = el('div', 'wk-sk pas');
        c2.innerHTML = '⌂  <b>Ở ga</b> — ' + (cd.station.desc || '');
        r.appendChild(c2);
      }
      if (!owned) r.appendChild(el('div', 'wk-lock', 'Chưa có — quay ở bàn cầu.'));
      box.appendChild(r);
    });
  }

  function wikiGear(box) {
    box.appendChild(el('div', 'wk-h', 'Súng'));
    box.appendChild(el('div', 'wk-note',
      'Cầm được <b>hai khẩu</b>: một trên tay, một sau lưng. Đổi qua lại ở bao tải hoặc phím Q, mất một nhịp. ' +
      'Mua ở quầy ga bằng tiền kiếm trong ván — không mua được ngoài ván.'));
    CT.GUNS.forEach(g => {
      const r = el('div', 'wk-foe');
      const h = el('div', 'wk-foe-h');
      h.appendChild(el('span', 'wk-foe-n', g.icon + ' ' + g.name));
      h.appendChild(el('span', 'wk-foe-s',
        '⚔ ' + g.dmg + (g.pellets ? ' ×' + g.pellets : '') +
        '   ⏱ ' + g.rof + 's   ▦ ' + g.mag + '   ↔ ' + g.range));
      r.appendChild(h);
      r.appendChild(el('div', 'wk-foe-d', g.desc));
      const tg = el('div', 'wk-tags');
      tg.appendChild(el('span', 'tag', 'ăn ' + CT.AMMO_BY_ID[g.ammo].name.toLowerCase()));
      r.appendChild(tg);
      box.appendChild(r);
    });
    box.appendChild(el('div', 'wk-h', 'Đồ dùng — ba ô tay'));
    box.appendChild(el('div', 'wk-note',
      'Mua ở quầy là vào thẳng ô tay, không qua bao tải. Bấm ô tay trên màn hình để dùng.'));
    CT.USABLES.forEach(u => {
      const r = el('div', 'wk-foe');
      const h = el('div', 'wk-foe-h');
      h.appendChild(el('span', 'wk-foe-n', u.icon + ' ' + u.name));
      r.appendChild(h);
      r.appendChild(el('div', 'wk-foe-d', u.desc));
      box.appendChild(r);
    });
  }

  function wikiTrain(box) {
    const per = Math.round(CT.BURNABLE.than / CT.FUEL.burnPerSec);
    wikiSec(box, 'Cái lò', [
      'Nhiên liệu cháy theo <b>thời gian</b>, không theo quãng đường. Đi nhanh hay chậm cũng tốn như nhau.',
      'Vào ván bình chỉ có <b>khoảng một phần ba</b>. Chuyến ngắn thì vừa đủ; chuyến dài thì không có đường nào khác ngoài tiếp than.',
      '<b>Đỗ ở ga cũng đốt</b>, bằng ' + Math.round(CT.FUEL.idleMul * 100) + '% lúc chạy. Nên mỗi giây nán lại lục thêm một căn nhà là một giây quãng đường bị trừ đi.',
      'Than nhặt được nằm trong <b>toa than</b>. Phải chạy lên mũi tàu <b>xúc vào lò</b> thì nó mới thành quãng đường — mỗi cục khoảng <b>' + per + ' giây</b>.',
      'Lò tắt thì tàu đứng, và chặng <b>không bao giờ hết</b>. Đây là cách chết phổ biến nhất, không phải vì quái.',
      'Đốt được: than · xác (' + CT.BURNABLE.xac + ') · đồ gỗ (' + CT.BURNABLE.ghe +
        ') · vải (' + CT.BURNABLE.sach + ') · giấy (' + CT.BURNABLE.bao + '). Đồng, bạc, vàng thì không cháy.'
    ]);
    wikiSec(box, 'Tiền trong ván và vàng ngoài ván', [
      '<b>$</b> chỉ sống trong một ván và mất sạch khi ván kết thúc. Tiêu ở quầy ga.',
      '<b>Vàng</b> là thứ mang về được, tính từ đồ còn trong tủ — và cả trong bao, nếu bạn về tới nơi.',
      'Nên mỗi món nhặt lên là ba đường: <b>bán</b> lấy tiền đi tiếp, <b>giữ</b> đổi vàng, hay <b>đốt</b> lấy thêm phút sống.',
      'Xác Cao Bồi có <b>tiền thưởng</b> — vác tới quầy bán được. Ném vào lò thì mất tiền, được nhiên liệu.'
    ]);
    wikiSec(box, 'Bao tải và tủ', [
      'Bao tải có số ô có hạn, món to ăn nhiều ô. <b>Đạn và than không chiếm ô nào.</b>',
      '<b>Tủ trên tàu không có giới hạn</b> — nhưng chỉ với tới được khi đang đứng trên tàu.',
      'Vòng lặp tự nhiên: chạy vào lục đầy bao → chạy về đổ lên tủ → quay lại nếu đồng hồ còn.'
    ]);
    wikiSec(box, 'Vác xác', [
      'Bấm <b>✋</b> cạnh một cái xác để vác nó lên. Đang vác thì <b>đi chậm hơn và không bắn được</b>.',
      'Vác tới cửa lò để đốt, hoặc vác tới quầy để bán nếu nó có tiền thưởng.',
      'Bấm <b>✋</b> lần nữa ở chỗ khác để bỏ xuống.'
    ]);
  }

  // ---------------------------------------------------------------------------
  // TẠM DỪNG
  // ---------------------------------------------------------------------------
  U.openPause = function () {
    const R = G.R();
    if (!R) return;
    R.paused = true;
    U.popup('Tạm dừng', body => {
      body.appendChild(btn('📖  Sổ tay', () => U.openWiki(), 'wide-btn'));
      const g = el('div', 'rows');
      g.appendChild(row('Chặng', R.leg + ' / ' + R.legs));
      g.appendChild(row('Quãng đường', (R.dist / 1000).toFixed(2) + ' km'));
      g.appendChild(row('Hạ được', R.kills + ' con'));
      g.appendChild(row('Đồ trong tủ', R.stash.length + ' món'));
      g.appendChild(row('Nhân vật', R.cd.name + ' — ' + R.cd.role));
      body.appendChild(g);

      const o = M().opt;
      body.appendChild(el('div', 'sec-h', 'Hiệu ứng'));
      const fxRow = el('div', 'chips');
      [['Đầy', 1], ['Giảm', 0.5], ['Tắt', 0]].forEach(([lb, v]) => {
        const c = el('div', 'chip' + (o.fx === v ? ' on' : ''), lb);
        on(c, 'click', () => { o.fx = v; CT.FX.setOpt({ fx: v }); CT.save(); U.openPause(); });
        fxRow.appendChild(c);
      });
      body.appendChild(fxRow);
      body.appendChild(el('div', 'note',
        'Giảm hoặc tắt nếu máy giật, hoặc nếu bạn nhạy với ánh sáng nhấp nháy.'));

      const foot = el('div', 'pop-f');
      foot.appendChild(btn('Chơi tiếp', () => U.closePop(), 'main'));
      foot.appendChild(btn('Bỏ chuyến', () => {
        U.closePop();
        G.finish(false);
      }, 'danger'));
      body.appendChild(foot);
    }, { onClose: () => { const r = G.R(); if (r) r.paused = false; } });
  };
  function row(k, v) {
    const r = el('div', 'row');
    r.appendChild(el('div', 'row-k', k));
    r.appendChild(el('div', 'row-v', v));
    return r;
  }
  U.row = row;

  // ---------------------------------------------------------------------------
  // TỔNG KẾT
  // ---------------------------------------------------------------------------
  // Bảng kết quả. Có một câu người chơi PHẢI đọc được ở đây: số tiền còn lại trong túi
  // không theo họ về. Nếu để họ tự phát hiện ở ván sau thì đó là một cú lừa, không phải
  // một cái luật.
  U.openResult = function (R) {
    const w = R.reward || {};
    U.popup(R.over.won ? 'Tới nơi rồi' : 'Chuyến này hỏng', body => {
      body.appendChild(el('div', 'big ' + (R.over.won ? 'win' : 'lose'),
        R.over.won ? '🚂  ' + R.map.name : '💀  ' + R.map.name));
      const g = el('div', 'rows');
      g.appendChild(row('Chặng đi được', Math.max(0, R.leg - (R.over.won ? 0 : 1)) + ' / ' + R.legs));
      g.appendChild(row('Quãng đường', (R.dist / 1000).toFixed(2) + ' km'));
      g.appendChild(row('Hạ được', R.kills + ' con'));
      g.appendChild(row('Than đã đốt', R.coalBurned + ' cục'));
      if (R.sold) g.appendChild(row('Bán ở quầy ga', '$' + CT.money(R.sold)));
      if (R.spent) g.appendChild(row('Tiêu ở quầy ga', '$' + CT.money(R.spent)));
      g.appendChild(row('Đồ mang về', CT.money(R.goldEarned) + ' 🪙'));
      if (w.scrap) g.appendChild(row('Phế liệu', '+' + w.scrap + ' ⚙️'));
      if (w.gem) g.appendChild(row('Ngọc', '+' + CT.money(w.gem) + ' 💎'));
      if (w.ticketC) g.appendChild(row('Vé Người', '+' + w.ticketC + ' 🎫'));
      if (w.ticketE) g.appendChild(row('Vé Đồ', '+' + w.ticketE + ' 🎟️'));
      body.appendChild(g);
      if (w.first) body.appendChild(el('div', 'note good', 'Thưởng phá đảo lần đầu.'));
      if (R.cash > 0)
        body.appendChild(el('div', 'note',
          'Còn $' + CT.money(R.cash) + ' trong túi, và số đó không theo bạn về. Tiền trong ván ' +
          'chỉ tiêu được ở quầy ga — lần sau thì tiêu cho hết.'));
      if (!R.over.won)
        body.appendChild(el('div', 'note',
          'Đồ trong TỦ vẫn về được. Chỉ những gì còn trong bao tải mới rơi lại đó.'));
      const foot = el('div', 'pop-f');
      foot.appendChild(btn('Về ga', () => { U.closePop(); U.home(); }, 'main'));
      body.appendChild(foot);
    }, { cls: 'wide' });
  };

  // ---------------------------------------------------------------------------
  // MÀN CHÍNH
  // ---------------------------------------------------------------------------
  let screen = 'home';
  U.home = function () {
    screen = 'home';
    U.render();
  };
  U.go = function (s) { screen = s; U.render(); };

  U.render = function () {
    if (!host) return;
    // Dựng vào một mảnh rời rồi mới tráo vào — nếu hàm dựng ném lỗi thì màn hình cũ vẫn
    // còn nguyên trên trang thay vì thành một tấm trắng vĩnh viễn.
    const frag = document.createDocumentFragment();
    try {
      frag.appendChild(bar());
      const b = el('div', 'screen-b');
      ({ home: scHome, map: scMap, char: scChar, train: scTrain,
         gacha: scGacha, shop: scShop, quest: scQuest }[screen] || scHome)(b);
      frag.appendChild(b);
      frag.appendChild(navBar());
    } catch (e) {
      const f = el('div', 'fallback');
      f.appendChild(el('div', 'err', 'Màn hình lỗi: ' + e.message));
      f.appendChild(btn('Về trang chính', () => { screen = 'home'; U.render(); }));
      f.appendChild(btn('Xoá dữ liệu và chơi lại', () => {
        if (!confirm('Xoá toàn bộ tiến độ?')) return;
        try { localStorage.removeItem('chuyen-tau.save.v1'); } catch (er) { }
        location.reload();
      }, 'danger'));
      frag.appendChild(f);
    }
    host.innerHTML = '';
    host.appendChild(frag);
  };

  function bar() {
    const m = M();
    const b = el('div', 'topbar');
    CT.WALLET.forEach(k => {
      const c = el('div', 'cur');
      c.appendChild(el('span', 'cur-i', CT.WALLET_ICON[k]));
      c.appendChild(el('span', 'cur-v', CT.money(m[k] | 0)));
      c.title = CT.WALLET_LABEL[k];
      b.appendChild(c);
    });
    return b;
  }

  function navBar() {
    const n = el('div', 'nav');
    [['home', '🏠', 'Ga'], ['char', '🤠', 'Người'], ['train', '🚂', 'Tàu'],
     ['gacha', '🎰', 'Quay'], ['shop', '🛒', 'Chợ'], ['quest', '📋', 'Việc'],
     ['wiki', '📖', 'Sổ tay']]
      .forEach(([id, ic, lb]) => {
        const t = el('div', 'nav-i' + (screen === id ? ' on' : ''));
        t.appendChild(el('div', 'nav-ic', ic));
        t.appendChild(el('div', 'nav-l', lb));
        // Sổ tay là một CỬA SỔ chứ không phải một trang: mở ra rồi đóng lại là về đúng
        // chỗ cũ. Tra cứu không được làm mất chỗ người ta đang đứng.
        on(t, 'click', () => { if (id === 'wiki') U.openWiki(); else U.go(id); });
        n.appendChild(t);
      });
    return n;
  }

  // --- trang chính ---
  function scHome(b) {
    const m = M();
    const cd = CT.CHAR_BY_ID[m.active];
    const hero = el('div', 'hero');
    hero.appendChild(el('div', 'hero-t', 'CHUYẾN TÀU CUỐI'));
    hero.appendChild(el('div', 'hero-s',
      'Một đoàn tàu, một sa mạc, và thứ chỉ ra ngoài khi trời tối.'));
    b.appendChild(hero);

    const card = el('div', 'card');
    card.appendChild(el('div', 'card-h', 'Đang chọn'));
    const who = el('div', 'who');
    who.appendChild(el('div', 'who-f', '🤠'));
    const wt = el('div', 'who-t');
    wt.appendChild(el('div', 'who-n', cd.name + '  ' + '★'.repeat(cd.star)));
    wt.appendChild(el('div', 'who-r', cd.role));
    wt.appendChild(el('div', 'who-p', '⚡ ' + CT.money(CT.powerOf(m.active))));
    who.appendChild(wt);
    card.appendChild(who);
    card.appendChild(el('div', 'sk-line', cd.skill.icon + ' ' + cd.skill.name + ' — ' + cd.skill.desc));
    b.appendChild(card);

    b.appendChild(btn('CHỌN CHUYẾN →', () => U.go('map'), 'big main'));

    const t = el('div', 'card');
    t.appendChild(el('div', 'card-h', 'Đoàn tàu'));
    const cars = el('div', 'car-strip');
    cars.appendChild(el('div', 'car loco', '🚂'));
    m.cars.forEach(id => {
      const c = el('div', 'car' + (id ? '' : ' empty'), id ? CT.CAR_BY_ID[id].icon : '·');
      cars.appendChild(c);
    });
    t.appendChild(cars);
    b.appendChild(t);
  }

  // --- chọn map ---
  function scMap(b) {
    const m = M();
    const pw = CT.powerOf(m.active);
    b.appendChild(el('div', 'sec-h', 'Chọn chuyến'));
    CT.MAPS.forEach(map => {
      const open = CT.mapOpen(map.id);
      const st = m.maps[map.id] || { leg: 0, cleared: false };
      const c = el('div', 'map' + (open ? '' : ' lock') + (st.cleared ? ' done' : ''));
      const h = el('div', 'map-h');
      h.appendChild(el('div', 'map-n', map.name));
      h.appendChild(el('div', 'map-c', 'Vòng ' + map.cycle));
      c.appendChild(h);
      c.appendChild(el('div', 'map-d', map.desc));
      const s = el('div', 'map-s');
      s.innerHTML = '<b>' + map.legs + '</b> chặng · <span class="' +
        (pw >= map.power ? 'ok' : 'bad') + '">⚡ khuyên ' + CT.money(map.power) + '</span>' +
        (st.cleared ? ' · <span class="ok">đã phá đảo</span>' :
          st.leg ? ' · tốt nhất ' + st.leg + ' chặng' : '');
      c.appendChild(s);
      if (open) {
        c.appendChild(btn('Lên tàu', () => U.startRun(map.id), 'main'));
      } else {
        c.appendChild(el('div', 'note', 'Phá đảo chuyến trước để mở.'));
      }
      b.appendChild(c);
    });
  }

  // --- nhân vật & trang bị ---
  let selChar = null, selSlot = null;
  function scChar(b) {
    const m = M();
    if (!selChar || !m.chars[selChar]) selChar = m.active;
    const list = el('div', 'char-row');
    CT.CHARS.forEach(cd => {
      const have = !!m.chars[cd.id];
      const t = el('div', 'ch s' + cd.star + (selChar === cd.id ? ' on' : '') + (have ? '' : ' no'));
      t.appendChild(el('div', 'ch-f', have ? '🤠' : '🔒'));
      t.appendChild(el('div', 'ch-n', cd.name));
      t.appendChild(el('div', 'ch-s', '★'.repeat(cd.star)));
      if (have && m.chars[cd.id].shard) t.appendChild(el('div', 'ch-sh', '◈' + m.chars[cd.id].shard));
      if (have) on(t, 'click', () => { selChar = cd.id; U.render(); });
      list.appendChild(t);
    });
    b.appendChild(list);

    const cd = CT.CHAR_BY_ID[selChar];
    const c = m.chars[selChar];
    const st = CT.statsOf(selChar);
    const sk = CT.skillOf(selChar);

    const card = el('div', 'card');
    card.appendChild(el('div', 'card-h', cd.name + ' — ' + cd.role));
    const g = el('div', 'rows');
    g.appendChild(row('Máu', Math.round(st.hp)));
    g.appendChild(row('Sát thương', '×' + st.dmg.toFixed(2)));
    g.appendChild(row('Tốc chạy', '×' + st.spd.toFixed(2)));
    g.appendChild(row('Bao tải', st.bag + ' ô'));
    g.appendChild(row('Lực chiến', '⚡ ' + CT.money(CT.powerOf(selChar))));
    card.appendChild(g);
    b.appendChild(card);

    // chiêu
    const sc = el('div', 'card');
    sc.appendChild(el('div', 'card-h', 'Chiêu — cấp ' + c.skillLv + '/' + CT.SKILL_LV_MAX));
    sc.appendChild(el('div', 'sk-big', sk.icon + '  ' + sk.name));
    sc.appendChild(el('div', 'sk-line', sk.desc));
    sc.appendChild(el('div', 'sk-num',
      'Hồi chiêu ' + sk.cd.toFixed(1) + 's' + (sk.charges > 1 ? ' · giữ ' + sk.charges + ' lượt' : '')));
    if (c.skillLv >= CT.SKILL_LV_MAX)
      sc.appendChild(el('div', 'sk-awake', '✦ ' + CT.AWAKEN[selChar]));
    else {
      sc.appendChild(el('div', 'note', 'Cấp sau: ' + CT.SKILL_LV[c.skillLv + 1].note));
      const need = CT.SHARD_PER_LV;
      sc.appendChild(btn('Nâng chiêu (◈' + c.shard + '/' + need + ')', () => {
        const r = CT.skillUp(selChar);
        if (!r.ok) U.toast(r.reason === 'shard' ? 'Chưa đủ mảnh — quay trùng người này để có thêm.' : 'Đã tối đa.');
        else { U.toast('Chiêu lên cấp ' + r.lv + '.', true); U.render(); }
      }, c.shard >= need ? 'main' : 'off'));
    }
    b.appendChild(sc);

    // bị động + đặc quyền ga
    const pc = el('div', 'card');
    pc.appendChild(el('div', 'card-h', 'Luật riêng'));
    pc.appendChild(el('div', 'sk-line', '⚙️ ' + cd.passive.name + ' — ' + cd.passive.desc));
    pc.appendChild(el('div', 'sk-line', '🏚️ ' + cd.station.name + ' — ' + cd.station.desc));
    b.appendChild(pc);

    // sáu ô trang bị
    const ec = el('div', 'card');
    ec.appendChild(el('div', 'card-h', 'Trang bị'));
    const eq = el('div', 'eq-row');
    CT.SLOTS.forEach(sl => {
      const it = CT.itemById(c.equip[sl.id]);
      const box = el('div', 'eqs' + (it ? '' : ' empty') + (selSlot === sl.id ? ' sel' : ''));
      box.appendChild(el('div', 'eqs-i', sl.icon));
      box.appendChild(el('div', 'eqs-n', it ? ('+' + it.lv) : sl.name));
      on(box, 'click', () => { selSlot = selSlot === sl.id ? null : sl.id; U.render(); });
      eq.appendChild(box);
    });
    ec.appendChild(eq);
    b.appendChild(ec);

    // kho đồ
    const inv = m.inv.filter(i => !selSlot || i.slot === selSlot)
      .sort((a, z) => (z.star - a.star) || (z.lv - a.lv));
    const ic = el('div', 'card');
    ic.appendChild(el('div', 'card-h', 'Kho đồ (' + m.inv.length + ')'));
    const grid = el('div', 'inv-grid');
    inv.slice(0, 60).forEach(it => {
      const t = el('div', 'inv s' + it.star);
      t.appendChild(el('div', 'inv-i', CT.SLOT_BY_ID[it.slot].icon));
      t.appendChild(el('div', 'inv-l', '+' + it.lv));
      const wearer = CT.wearerOf(it.id);
      if (wearer) t.appendChild(el('div', 'inv-w', '●'));
      on(t, 'click', () => showItem(it.id));
      grid.appendChild(t);
    });
    if (!inv.length) grid.appendChild(el('div', 'empty-note', 'Chưa có món nào.'));
    ic.appendChild(grid);
    b.appendChild(ic);

    if (m.active !== selChar)
      b.appendChild(btn('Chọn ' + cd.name + ' đi chuyến sau', () => {
        m.active = selChar; CT.save(); U.toast('Đã chọn ' + cd.name + '.', true); U.render();
      }, 'big main'));
  }

  function showItem(id) {
    const it = CT.itemById(id);
    if (!it) return;
    U.popup(it.name, body => {
      body.appendChild(el('div', 'big', '★'.repeat(it.star) + ' · ' + CT.SLOT_BY_ID[it.slot].name + ' · +' + it.lv));
      const g = el('div', 'rows');
      g.appendChild(row(CT.STATS[it.main].name, CT.STATS[it.main].fmt(CT.mainVal(it))));
      it.subs.forEach(s => g.appendChild(row(CT.STATS[s.k].name, CT.STATS[s.k].fmt(s.v))));
      body.appendChild(g);
      const foot = el('div', 'pop-f');
      const cost = CT.upCost(it.lv);
      foot.appendChild(btn('Nâng cấp (' + CT.money(cost.gold) + '🪙)', () => {
        const r = CT.upgradeItem(id);
        if (!r.ok) U.toast('Không đủ vàng.');
        else { U.toast('Lên +' + r.lv + '.', true); U.closePop(); U.render(); }
      }, 'main'));
      foot.appendChild(btn('Đeo cho ' + CT.CHAR_BY_ID[selChar].name, () => {
        CT.equipItem(selChar, id); U.closePop(); U.render();
      }));
      foot.appendChild(btn('Tháo rời', () => {
        const r = CT.dismantle(id);
        if (!r.ok) U.toast(r.reason === 'equipped' ? 'Đang có người đeo.' : 'Không tháo được.');
        else { U.toast('Được ' + CT.money(r.back.gold) + '🪙 và ' + r.back.scrap + '⚙️.', true);
               U.closePop(); U.render(); }
      }, 'danger'));
      body.appendChild(foot);
    });
  }

  // --- toa tàu ---
  function scTrain(b) {
    const m = M();
    b.appendChild(el('div', 'sec-h', 'Đoàn tàu — năm ô toa'));
    const strip = el('div', 'car-strip big');
    strip.appendChild(el('div', 'car loco', '🚂'));
    m.cars.forEach((id, i) => {
      const c = el('div', 'car' + (id ? '' : ' empty'));
      c.appendChild(el('div', 'car-i', id ? CT.CAR_BY_ID[id].icon : '·'));
      c.appendChild(el('div', 'car-n', id ? CT.CAR_BY_ID[id].name : 'trống'));
      if (id) c.appendChild(el('div', 'car-l', 'cấp ' + (m.carLv[id] || 1)));
      on(c, 'click', () => {
        if (!id) { U.toast('Mua một toa bên dưới rồi nó tự vào ô này.'); return; }
        U.popup(CT.CAR_BY_ID[id].name, bd => {
          bd.appendChild(el('div', 'sk-line', CT.CAR_BY_ID[id].desc));
          const lv = m.carLv[id] || 1;
          bd.appendChild(el('div', 'sk-num', 'Cấp ' + lv + ' / ' + CT.CAR_LV_MAX));
          const foot = el('div', 'pop-f');
          if (lv < CT.CAR_LV_MAX) {
            const cst = CT.carUpCost(lv);
            foot.appendChild(btn('Nâng cấp (' + CT.money(cst.gold) + '🪙 ' + cst.scrap + '⚙️)', () => {
              const r = CT.upCar(id);
              if (!r.ok) U.toast('Không đủ vàng hoặc phế liệu.');
              else { U.toast('Toa lên cấp ' + r.lv + '.', true); U.closePop(); U.render(); }
            }, 'main'));
          }
          foot.appendChild(btn('Tháo khỏi đoàn', () => {
            CT.setCar(i, null); U.closePop(); U.render();
          }, 'danger'));
          bd.appendChild(foot);
        });
      });
      strip.appendChild(c);
    });
    b.appendChild(strip);
    b.appendChild(el('div', 'note',
      'Toa mua bằng vàng và phế liệu nhặt trong ván — không quay. Đây là trục tiến bộ không phụ thuộc may rủi.'));

    b.appendChild(el('div', 'sec-h', 'Cửa hàng toa'));
    CT.CARS.forEach(def => {
      if (def.id === 'tran') return;
      const owned = CT.ownsCar(def.id);
      const c = el('div', 'card');
      const h = el('div', 'card-h');
      h.textContent = def.icon + ' ' + def.name;
      c.appendChild(h);
      c.appendChild(el('div', 'sk-line', def.desc));
      if (owned) {
        const inTrain = m.cars.indexOf(def.id) >= 0;
        c.appendChild(el('div', 'note good', inTrain ? 'Đang lắp trên tàu.' : 'Đã sở hữu, chưa lắp.'));
        if (!inTrain) c.appendChild(btn('Lắp vào ô trống', () => {
          const s = m.cars.indexOf(null);
          if (s < 0) { U.toast('Không còn ô trống — tháo một toa ra trước.'); return; }
          CT.setCar(s, def.id); U.render();
        }, 'main'));
      } else {
        c.appendChild(btn('Mua (' + CT.money(def.gold) + '🪙 ' + def.scrap + '⚙️)', () => {
          const r = CT.buyCar(def.id);
          if (!r.ok) U.toast('Không đủ vàng hoặc phế liệu.');
          else { U.toast('Đã mua ' + def.name + '.', true); U.render(); }
        }, 'main'));
      }
      b.appendChild(c);
    });

    b.appendChild(el('div', 'sec-h', 'Tiến hoá'));
    CT.EVOL.forEach(e => {
      const lv = m.evol[e.id] | 0;
      const c = el('div', 'evol');
      c.appendChild(el('div', 'ev-i', e.icon));
      const t = el('div', 'ev-t');
      t.appendChild(el('div', 'ev-n', e.name + '  ' + lv + '/' + e.max));
      t.appendChild(el('div', 'ev-d', e.desc));
      c.appendChild(t);
      if (lv < e.max) {
        const cst = CT.evolCost(e);
        c.appendChild(btn(CT.money(cst.gold) + '🪙', () => {
          const r = CT.evolUp(e.id);
          if (!r.ok) U.toast('Không đủ vàng.');
          else U.render();
        }));
      } else c.appendChild(el('div', 'ev-max', 'MAX'));
      b.appendChild(c);
    });
  }

  // --- gacha ---
  function scGacha(b) {
    const m = M();
    ['char', 'equip'].forEach(bid => {
      const bk = CT.GACHA[bid];
      const c = el('div', 'card bank');
      c.style.borderColor = bk.color;
      c.appendChild(el('div', 'card-h', bk.name));
      c.appendChild(el('div', 'sk-line', bk.desc));

      // Tỉ lệ THẬT ở lượt tới, và bộ đếm bảo hiểm — hiện ngay trên màn quay, không giấu
      // trong menu con. Đây là mức chuẩn cao nhất mà bất kỳ nước nào yêu cầu, và làm nó
      // tốn gần như không có gì.
      const rate = CT.rateNow(bid);
      const left = CT.pityLeft(bid);
      const info = el('div', 'rate');
      info.innerHTML =
        '<div>Tỉ lệ 5★ ở lượt tới: <b>' + (rate * 100).toFixed(2) + '%</b></div>' +
        '<div>Còn <b>' + left + '</b> lượt tới mốc chắc chắn ra 5★</div>' +
        '<div class="dim">Cơ bản ' + (bk.rate5 * 100).toFixed(1) + '% · 4★ ' +
          (bk.rate4 * 100).toFixed(1) + '% · bảo đảm 4★ trong mỗi 10 lượt' +
          (bk.soft < 900 ? ' · từ lượt ' + bk.soft + ' mỗi lượt cộng thêm ' +
            (bk.softStep * 100).toFixed(0) + '%' : '') + '</div>';
      c.appendChild(info);

      const rowb = el('div', 'pull-row');
      rowb.appendChild(btn('Quay 1  (' + (m[bk.ticket] > 0 ? '🎫1' : '💎' + bk.costGem) + ')',
        () => doPull(bid, 1), 'main'));
      rowb.appendChild(btn('Quay 10  (' + '💎' + (bk.costGem * 10) + ')',
        () => doPull(bid, 10)));
      c.appendChild(rowb);
      if (bid === 'char') {
        const sp = m.spark.char | 0;
        c.appendChild(el('div', 'note',
          'Mốc chọn thẳng: ' + sp + ' / ' + CT.SPARK + ' lượt. Đủ thì chọn bất kỳ ai, không quay.'));
        if (sp >= CT.SPARK) c.appendChild(btn('Chọn thẳng một người', pickSpark, 'main'));
      }
      b.appendChild(c);
    });
    b.appendChild(el('div', 'note',
      'Tỉ lệ không đổi sau khi đã công bố. Không có kiểu "gom đủ bộ mới nhận thưởng" ở đây.'));
  }

  function doPull(bid, n) {
    const r = CT.pull(bid, n);
    if (!r.ok) { U.toast('Không đủ ngọc.'); return; }
    U.popup('Kết quả', body => {
      const g = el('div', 'pull-grid');
      r.results.forEach(x => {
        const t = el('div', 'pr s' + x.star);
        t.appendChild(el('div', 'pr-s', '★'.repeat(x.star)));
        t.appendChild(el('div', 'pr-n', x.name));
        if (x.dupe) t.appendChild(el('div', 'pr-d', '◈ mảnh'));
        g.appendChild(t);
      });
      body.appendChild(g);
      const foot = el('div', 'pop-f');
      foot.appendChild(btn('Xong', () => { U.closePop(); U.render(); }, 'main'));
      body.appendChild(foot);
    }, { cls: 'wide' });
  }

  function pickSpark() {
    U.popup('Chọn một người', body => {
      const g = el('div', 'char-row');
      CT.CHARS.forEach(cd => {
        const t = el('div', 'ch s' + cd.star);
        t.appendChild(el('div', 'ch-f', '🤠'));
        t.appendChild(el('div', 'ch-n', cd.name));
        t.appendChild(el('div', 'ch-s', '★'.repeat(cd.star)));
        on(t, 'click', () => {
          const r = CT.sparkPick(cd.id);
          if (!r.ok) U.toast('Chưa đủ lượt.');
          else { U.toast('Đã nhận ' + cd.name + '.', true); U.closePop(); U.render(); }
        });
        g.appendChild(t);
      });
      body.appendChild(g);
    }, { cls: 'wide' });
  }

  // --- cửa hàng ---
  function scShop(b) {
    const m = M();
    // Hộp cảnh báo đứng TRÊN CÙNG, không giấu ở đâu cả. Một quầy nạp trông y như thật
    // mà không nói mình là giả thì đó là một cái bẫy, kể cả khi không ai mất đồng nào.
    const warn = el('div', 'fakebox');
    warn.innerHTML = '⚠️ <b>Nạp ở đây là GIẢ.</b> Không có cổng thanh toán, không mất ' +
      'tiền thật — bấm là ngọc vào ví. Quầy này để thử cho nhanh, và để nhìn thấy cái ' +
      'giá thật của mô hình quay số.';
    b.appendChild(warn);

    b.appendChild(el('div', 'sec-h', 'Gói ngọc'));
    CT.PACKS.forEach(p => {
      const c = el('div', 'pack');
      if (p.tag) c.appendChild(el('div', 'pack-tag', p.tag));
      c.appendChild(el('div', 'pack-n', p.name));
      const got = CT.packGem(p.id);
      c.appendChild(el('div', 'pack-g', '💎 ' + CT.money(got)));
      if (CT.packFirst(p.id)) c.appendChild(el('div', 'pack-x2', '×2 LẦN ĐẦU'));
      const pulls = Math.floor(got / CT.GACHA.char.costGem);
      c.appendChild(el('div', 'pack-p',
        pulls >= 1 ? ('đủ ' + pulls + ' lượt quay') : 'chưa đủ một lượt quay'));
      c.appendChild(btn(CT.money(p.vnd) + 'đ', () => {
        const r = CT.buyPack(p.id);
        if (r.ok) { U.toast('Đã cộng ' + CT.money(r.gem) + ' ngọc (nạp giả).', true); U.render(); }
      }, 'main'));
      b.appendChild(c);
    });

    b.appendChild(el('div', 'sec-h', 'Quầy đổi — mỗi ngày một số lượt'));
    CT.EXCHANGE.forEach(x => {
      const left = CT.exchangeLeft(x);
      const c = el('div', 'ex');
      const give = [];
      CT.WALLET.forEach(k => { if (x[k]) give.push(CT.WALLET_ICON[k] + ' ' + CT.money(x[k])); });
      c.appendChild(el('div', 'ex-t', '💎 ' + x.gem + '  →  ' + give.join(' ')));
      c.appendChild(el('div', 'ex-l', 'còn ' + left + '/' + x.limit));
      c.appendChild(btn('Đổi', () => {
        const r = CT.exchange(x.id);
        if (!r.ok) U.toast(r.reason === 'het-luot' ? 'Hết lượt hôm nay.' : 'Không đủ ngọc.');
        else U.render();
      }, left > 0 ? '' : 'off'));
      b.appendChild(c);
    });

    b.appendChild(el('div', 'note dim',
      'Tổng đã "nạp": ' + CT.money(m.counters.spendVnd) + 'đ — tiền giả, chỉ để bạn thấy con số.'));
  }

  // --- nhiệm vụ ---
  function scQuest(b) {
    const q = CT.questList();
    const sec = (title, list, isAch) => {
      b.appendChild(el('div', 'sec-h', title));
      list.forEach(x => {
        const c = el('div', 'quest' + (x.done ? ' done' : '') + (x.claimed ? ' got' : ''));
        const t = el('div', 'q-t');
        t.appendChild(el('div', 'q-n', x.text));
        const bar = el('div', 'q-bar');
        const fill = el('div', 'q-fill');
        fill.style.width = Math.min(100, x.have / x.need * 100) + '%';
        bar.appendChild(fill);
        t.appendChild(bar);
        t.appendChild(el('div', 'q-p', Math.min(x.have, x.need) + ' / ' + x.need));
        c.appendChild(t);
        const rw = [];
        CT.WALLET.forEach(k => { if (x.r[k]) rw.push(CT.WALLET_ICON[k] + CT.money(x.r[k])); });
        c.appendChild(el('div', 'q-r', rw.join(' ')));
        if (x.claimed) c.appendChild(el('div', 'q-ok', '✓'));
        else c.appendChild(btn('Nhận', () => {
          const r = CT.claimQuest(x.id, isAch);
          if (!r.ok) U.toast('Chưa đủ.');
          else { U.toast('Đã nhận.', true); U.render(); }
        }, x.done ? 'main' : 'off'));
        b.appendChild(c);
      });
    };
    sec('Hôm nay', q.daily, false);
    sec('Tuần này', q.weekly, false);
    sec('Thành tựu', q.ach, true);
  }

})(window);
