/*
 * Biệt Đội Lặn — toàn bộ màn sảnh: Trang chủ, Chuyến lặn, Biệt đội, Gacha, Cửa hàng, Nhiệm vụ.
 *
 * Chép từ games/repo-squad/js/ui.js: cùng khung (thanh trên + một vùng cuộn + thanh tab dưới), cùng
 * cách dựng vào DocumentFragment rồi mới tráo, cùng popup/toast. Bỏ Trang Bị và Tiến Hoá, thêm
 * tab Nhiệm Vụ vào thanh tab (ô giữa nổi lên là RA KHƠI).
 *
 * Menu là DOM, không vẽ lên canvas, để chữ tiếng Việt luôn có dấu đúng.
 * Chân dung crew vẽ vào <canvas> từ games/repo2d/art/crew/<id>.png (tờ 3 cột x 4 hàng, ô 96x144;
 * dùng khung đứng quay mặt xuống = cột 1, hàng 0). Không nạp sprites.js vì nó cần cả game.js.
 */
(function (root) {
  'use strict';
  const BDL = root.BDL;
  const C = BDL.content;
  const meta = BDL.meta;
  const UI = BDL.ui = {};
  const money = meta.money;
  const $ = sel => document.querySelector(sel);
  const WI = C.wallet.icon;

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function on(node, ev, fn) { node.addEventListener(ev, fn); return node; }
  function btn(label, cls, fn) {
    const b = el('button', 'b ' + (cls || ''), label);
    b.type = 'button';
    on(b, 'click', e => { e.preventDefault(); fn(e); });
    return b;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let screenName = 'home';
  const sel = { char: null, banner: 'char', questTab: 'daily' };
  let toastT = 0;

  // Ba phần tử chủ: #menu do trang chủ nhà đặt sẵn (trong khung có position); #modal và #toast mà thiếu
  // thì tự dựng. Cả ba mang lớp bdl-ui để css/lobby.css nhận ra.
  function hosts() {
    const menu = $('#menu');
    if (menu) menu.classList.add('bdl-ui', 'menu');
    let modal = $('#modal');
    if (!modal) { modal = el('div'); modal.id = 'modal'; document.body.appendChild(modal); }
    if (!modal.classList.contains('bdl-ui')) { modal.classList.add('bdl-ui', 'modal'); }
    let toast = $('#lobby-toast');
    if (!toast) { toast = el('div'); toast.id = 'lobby-toast'; document.body.appendChild(toast); }
    if (!toast.classList.contains('bdl-ui')) { toast.classList.add('bdl-ui', 'toast'); }
    return { menu: menu, modal: modal, toast: toast };
  }

  // ---------------------------------------------------------------------------
  // popup / toast
  // LỐI RA PHẢI CÓ TRƯỚC NỘI DUNG: gắn khung + nút ✕ rồi mới đổ nội dung, để một cú ngoặc trong
  // build() chỉ còn là một bảng trống có nút đóng chứ không phải lớp phủ đen không thoát được.
  // ---------------------------------------------------------------------------
  UI.popup = function (title, build) {
    bindOnce();
    const ov = hosts().modal;
    clear(ov);
    const card = el('div', 'mcard');
    const h = el('div', 'pop-h');
    h.appendChild(el('div', 'pop-t', esc(title)));
    h.appendChild(btn('✕', 'chev', () => UI.closePopup()));
    card.appendChild(h);
    const body = el('div', 'pop-b');
    card.appendChild(body);
    ov.appendChild(card);
    UI._closer = UI.closePopup;
    ov.className = 'modal bdl-ui show';
    try { build(body); chayMat(); }
    catch (e) {
      console.error('Dựng cửa sổ "' + title + '" không được:', e);
      body.appendChild(el('div', 'mline', 'Cửa sổ này dựng lỗi: ' + ((e && e.message) || 'không rõ') +
        '. Dữ liệu của bạn không sao, đóng lại và làm việc khác.'));
    }
  };
  UI.closePopup = function () { const ov = $('#modal'); if (ov) ov.className = 'modal bdl-ui'; UI._closer = null; };

  // MỘT cái bắt bấm-ra-ngoài, gắn đúng một lần; mỗi bảng tự khai lối ra của mình vào UI._closer.
  UI._closer = null;
  let bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    const ov = hosts().modal;
    on(ov, 'click', e => { if (e.target === ov && UI._closer) UI._closer(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && ov.classList.contains('show') && UI._closer) UI._closer();
    });
  }

  UI.toast = function (text, good) {
    const t = hosts().toast;
    t.textContent = text;
    t.className = 'toast bdl-ui show' + (good ? ' good' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className = 'toast bdl-ui'; }, 2200);
  };

  // ---------------------------------------------------------------------------
  // khung menu
  // ---------------------------------------------------------------------------
  const SCREENS = { maps: scrMaps, squad: scrSquad, gacha: scrGacha, shop: scrShop, quest: scrQuest };
  // id, biểu tượng, nhãn; ô giữa nổi lên như nút vào trận
  const TABS = [
    ['shop',  '🏪', 'Cửa Hàng'],
    ['gacha', '🎰', 'Gacha'],
    ['home',  '⚓', 'RA KHƠI'],
    ['squad', '👥', 'Biệt Đội'],
    ['quest', '📜', 'Nhiệm Vụ']
  ];
  const SHEET_TITLE = { maps: 'Năm chuyến lặn', squad: 'Biệt đội', gacha: 'Gacha', shop: 'Cửa hàng', quest: 'Nhiệm vụ' };

  UI.go = function (name) { screenName = name; UI.render(); };
  UI.current = () => screenName;

  // KHÔNG BAO GIỜ ĐƯỢC ĐỂ LẠI MỘT CÁI MENU RỖNG: dựng vào một khung rời rồi mới tráo vào.
  UI.render = function () {
    try { renderInto(); }
    catch (e) { console.error('Dựng menu không được:', e); renderFallback(e); }
  };
  function renderFallback(e) {
    const wrap = hosts().menu;
    if (!wrap) return;
    clear(wrap);
    const box = el('div', 'sheet');
    const b = el('div', 'sheet-b');
    b.appendChild(el('h3', '', '⚠ Giao diện vấp lỗi'));
    b.appendChild(el('div', 'mline', 'Bản lưu có thứ gì đó bản game này không đọc được: ' + esc((e && e.message) || 'không rõ') + '.'));
    b.appendChild(btn('Thử dựng lại', 'big', () => UI.render()));
    b.appendChild(btn('Về sảnh', '', () => { try { UI.go('home'); } catch (_) { renderFallback(e); } }));
    b.appendChild(btn('Xoá dữ liệu và chơi lại từ đầu', 'ghost', () => {
      meta.hardReset();
      try { UI.go('home'); } catch (_) { location.reload(); }
    }));
    box.appendChild(b);
    wrap.appendChild(box);
  }
  function renderInto() {
    bindOnce();
    const wrap = hosts().menu;
    if (!wrap) return;
    // Giữ vị trí cuộn CHỈ KHI vẽ lại đúng màn cũ.
    const keep = wrap.querySelector('.stage');
    const scrollTop = (keep && keep.dataset.scr === screenName) ? keep.scrollTop : 0;
    const frag = document.createDocumentFragment();

    frag.appendChild(topBar());
    const stage = el('div', 'stage' + (screenName === 'home' ? ' is-home' : ''));
    frag.appendChild(stage);
    if (screenName === 'home' || !SCREENS[screenName]) {
      screenName = 'home';
      stage.className = 'stage is-home';
      scrHome(stage);
    } else {
      const sheet = el('div', 'sheet');
      const head = el('div', 'sheet-h');
      head.appendChild(btn('←', 'chev', () => UI.go('home')));
      head.appendChild(el('div', 'sheet-t', SHEET_TITLE[screenName] || ''));
      sheet.appendChild(head);
      const body = el('div', 'sheet-b');
      sheet.appendChild(body);
      stage.appendChild(sheet);
      SCREENS[screenName](body);
    }
    frag.appendChild(tabBar());

    clear(wrap);                 // tới đây mới chắc chắn có một menu đầy đủ để thay vào
    wrap.appendChild(frag);
    stage.dataset.scr = screenName;
    if (scrollTop) stage.scrollTop = scrollTop;
    chayMat();
  }

  function topBar() {
    const M = meta.M;
    const t = el('div', 'topbar');
    const lead = (M.squad.lead && C.crewById[M.squad.lead]) || null;
    const me = el('div', 'me');
    me.innerHTML =
      '<div class="me-av">' + (lead ? matHTML(lead.id, 'mat-dau') : '👤') + '</div>' +
      '<div class="me-b"><div class="me-n">' + (lead ? lead.name : 'Tổ trưởng') + '</div>' +
      '<div class="me-p">⚡ ' + money(meta.squadPower()) + '</div></div>';
    on(me, 'click', () => UI.go('squad'));
    t.appendChild(me);

    const purse = el('div', 'purse');
    C.wallet.keys.forEach(k => {
      const c = el('div', 'coin');
      c.title = C.wallet.label[k];
      c.dataset.coin = k;
      c.innerHTML = '<i>' + WI[k] + '</i><b>' + money(M[k] || 0) + '</b><s>+</s>';
      on(c, 'click', () => UI.go('shop'));
      purse.appendChild(c);
    });
    t.appendChild(purse);
    return t;
  }

  function tabBar() {
    const n = el('nav', 'tabbar');
    const badge = { quest: meta.questPending() };
    TABS.forEach(([id, icon, label], i) => {
      const mid = i === 2;
      const active = mid ? (screenName === 'home' || screenName === 'maps') : screenName === id;
      const d = el('div', 'tb' + (mid ? ' mid' : '') + (active ? ' on' : ''));
      d.dataset.tab = id;
      d.innerHTML = '<div class="tb-i">' + icon + '</div><div class="tb-n">' + label + '</div>';
      if (badge[id]) d.appendChild(el('span', 'dot', String(badge[id])));
      on(d, 'click', () => UI.go(id));
      n.appendChild(d);
    });
    return n;
  }

  // ---------------------------------------------------------------------------
  // SẢNH
  // ---------------------------------------------------------------------------
  function sail() {
    if (BDL.onSail) BDL.onSail();
    else UI.toast('Chưa nối với phần lặn: sảnh đang chạy riêng.');
  }

  function scrHome(b) {
    const M = meta.M;
    const list = meta.squadList();
    const lead = list.find(m => m.player) || list[0] || null;
    const leadDef = lead ? C.crewById[lead.id] : null;

    // hai cột phím tắt hai bên
    const railL = el('div', 'rail left');
    const railR = el('div', 'rail');
    [['gacha', '🎰', 'Gacha', 0, railL],
     ['maps', '🗺️', 'Chuyến Lặn', 0, railL],
     ['quest', '📜', 'Nhiệm Vụ', meta.questPending(), railR],
     ['shop', '🏪', 'Cửa Hàng', 0, railR]].forEach(r => {
      const d = el('div', 'rail-b', '<div class="rb-i">' + r[1] + '</div><div class="rb-n">' + r[2] + '</div>');
      d.dataset.go = r[0];
      if (r[3]) d.appendChild(el('span', 'dot', String(r[3])));
      on(d, 'click', () => UI.go(r[0]));
      r[4].appendChild(d);
    });
    b.appendChild(railL);
    b.appendChild(railR);

    // sân khấu: crew đang cầm đứng giữa
    const show = el('div', 'showcase');
    if (leadDef) {
      show.style.setProperty('--hue', leadDef.hue);
      show.style.borderColor = C.rarity[leadDef.star].color;
      show.innerHTML =
        '<div class="sc-glow"></div>' +
        '<div class="sc-face">' + matHTML(leadDef.id, 'mat-to') + '</div>' +
        '<div class="sc-name">' + leadDef.name + '<span class="sc-ep"> · ' + leadDef.epithet + '</span></div>' +
        '<div class="sc-star">' + '★'.repeat(leadDef.star) + '</div>' +
        '<div class="sc-skill"><b>' + leadDef.skill.name + '</b> · ' + leadDef.skill.desc + '</div>';
    } else {
      show.innerHTML = '<div class="sc-face">👤</div><div class="sc-name">Chưa có crew nào</div>';
    }
    on(show, 'click', () => UI.go('squad'));
    b.appendChild(show);

    // hàng năm người
    const line = el('div', 'lineup');
    for (let i = 0; i < 5; i++) {
      const m = list[i];
      let d;
      if (m) {
        const c = C.crewById[m.id];
        d = el('div', 'lu' + (m.player ? ' is-me' : ''));
        d.style.setProperty('--hue', c.hue);
        d.style.borderColor = C.rarity[c.star].color;
        const t = m.player ? null : C.tacticById[m.tactic];
        d.innerHTML = '<div class="lu-f">' + matHTML(c.id, 'mat-nho') + '</div><div class="lu-n">' + c.name + '</div>' +
          '<div class="lu-t">' + (m.player ? 'BẠN LẶN' : t.icon + ' ' + t.name) + '</div>';
      } else {
        d = el('div', 'lu empty', '<div class="lu-f">＋</div><div class="lu-n">trống</div><div class="lu-t">xếp thêm</div>');
      }
      on(d, 'click', () => UI.go('squad'));
      line.appendChild(d);
    }
    b.appendChild(line);

    // thanh ca lặn: năm chuyến, hiện số chuyến đã phá
    const done = C.maps.filter(m => M.maps[m.id].cleared).length;
    const chap = el('div', 'chapter');
    const mid = el('div', 'ch-b');
    let pips = '';
    C.maps.forEach((m, i) => { pips += (M.maps[m.id].cleared ? '●' : '○') + (i < C.maps.length - 1 ? ' ' : ''); });
    mid.innerHTML =
      '<div class="ch-n">Ca lặn ' + C.maps.length + ' chuyến' + (done === C.maps.length ? ' <span class="ch-ok">✔</span>' : '') + '</div>' +
      '<div class="ch-s">' + C.maps[0].name + ' → ' + C.maps[C.maps.length - 1].name + ' · ' + pips + '</div>' +
      '<div class="ch-bar"><i style="width:' + (done / C.maps.length * 100) + '%"></i></div>' +
      '<div class="ch-f">Đã phá ' + done + '/' + C.maps.length + ' · thắng ' + (M.counters.wins || 0) + ' ca · bấm để xem chuyến lặn</div>';
    on(mid, 'click', () => UI.go('maps'));
    chap.appendChild(mid);
    b.appendChild(chap);

    // CHỖ BÁN ĐỒ NGHỀ rồi tới nút ra khơi. `.gorow` bọc cả hai nên `.stage.is-home` vẫn đúng bốn
    // đứa con trong luồng (+ foot-note): khung ngang là grid có chỉ định chỗ cho từng đứa.
    const lo = meta.loadout();
    const loDef = lo ? C.itemByKey[lo.key] : null;
    const gorow = el('div', 'gorow');
    const bar = el('div', 'wepbar' + (lo ? ' on' : ''));
    const head = el('div', 'wb-h');
    head.innerHTML = '<div class="wb-l">ĐỒ NGHỀ</div>' +
      '<div class="wb-s">' + (lo ? esc(loDef.name) + (loDef.uses ? ' ×' + loDef.uses : '') + ' · bấm lại để bỏ ra'
                                 : 'bấm một món để mang theo, tối đa một món') + '</div>' +
      '<div class="wb-g">' + WI.gold + ' ' + money(M.gold || 0) + '</div>';
    bar.appendChild(head);
    const row = el('div', 'wq-row');
    meta.loadoutItems().forEach(it => {
      const carrying = !!lo && lo.key === it.key;
      const back = lo ? lo.paid : 0;
      const afford = (M.gold || 0) + back >= it.loadoutPrice;
      const q = el('div', 'wq' + (carrying ? ' on' : lo ? ' mo' : afford ? '' : ' ngheo'));
      q.dataset.item = it.key;
      q.innerHTML = iconHTML(it, 26) + '<b>' + (carrying ? '×' + (it.uses || '∞') : money(it.loadoutPrice)) + '</b>';
      q.title = it.name + (it.uses ? ' ×' + it.uses : '') + ' · ' + it.desc;
      on(q, 'click', () => loadoutToggle(it, carrying));
      row.appendChild(q);
    });
    bar.appendChild(row);
    gorow.appendChild(bar);
    const go = btn('⚓ RA KHƠI', 'cta', sail);
    go.id = 'bdlSail';
    gorow.appendChild(go);
    b.appendChild(gorow);

    const foot = el('div', 'foot-note');
    foot.appendChild(el('span', '', 'Tiến độ lưu trên máy bạn.'));
    foot.appendChild(btn('Xoá dữ liệu', 'ghost tiny', () => {
      if (!confirm('Xoá sạch tài khoản trong game này? Không lấy lại được.')) return;
      meta.hardReset(); UI.go('home'); UI.toast('Đã xoá. Bắt đầu lại.');
    }));
    b.appendChild(foot);
  }

  function loadoutToggle(it, carrying) {
    const r = carrying ? meta.loadoutRefund() : meta.loadoutBuy(it.key);
    UI.toast(r.ok ? (carrying ? 'Đã bỏ ra, hoàn đủ vàng.' : 'Mang theo ' + it.name + '. Xuống nước là nằm sẵn trên tay.')
                  : r.why, r.ok);
    UI.render();
  }

  // Hình món đồ: đường dẫn ảnh hoặc emoji.
  function iconHTML(it, px) {
    if (it.icon && it.icon.indexOf('/') >= 0) {
      return '<img class="ico" src="' + it.icon + '" alt="" width="' + px + '" height="' + px + '">';
    }
    return '<span class="ico-e" style="font-size:' + Math.round(px * 0.78) + 'px;height:' + px + 'px;line-height:' + px + 'px">' + (it.icon || '❔') + '</span>';
  }

  function charCard(id, isLead, tacticId, fn) {
    const c = C.crewById[id];
    const own = meta.M.chars[id];
    const st = meta.charStats(id, tacticId);
    const d = el('div', 'cc s' + c.star);
    d.dataset.crew = id;
    d.style.setProperty('--hue', c.hue);
    const t = tacticId && C.tacticById[tacticId];
    d.innerHTML =
      '<div class="cc-face">' + matHTML(c.id, 'mat-vua') + '</div>' +
      '<div class="cc-n">' + c.name + '</div>' +
      '<div class="cc-s">' + '★'.repeat(c.star) + ' · Lv' + (own ? own.lv : 0) + '</div>' +
      (isLead ? '<div class="cc-tag lead">BẠN LẶN</div>'
              : '<div class="cc-tag">' + (t ? t.icon + ' ' + t.name : '—') + '</div>') +
      '<div class="cc-p">⚡' + money(st ? st.power : 0) + '</div>';
    d.style.borderColor = C.rarity[c.star].color;
    if (fn) on(d, 'click', fn);
    return d;
  }

  // ---------------------------------------------------------------------------
  // MẶT CREW: hình THẬT vẽ vào <canvas>.
  // Khổ vẽ lấy từ CSS (.mat-*), không đặt trong JS. Ảnh nạp bất đồng bộ: ô nào vẽ lúc ảnh chưa về
  // thì để trống, và onload vẽ lại, không có vòng rAF nào chạy mãi để canh.
  // ---------------------------------------------------------------------------
  const CREW_DIR = '../repo2d/art/crew/';
  const imgs = Object.create(null);
  function crewImg(id) {
    let r = imgs[id];
    if (!r) {
      const im = new Image();
      r = imgs[id] = { im: im, ok: false, fail: false };
      im.onload = () => { r.ok = true; chayMat(); };
      im.onerror = () => { r.fail = true; chayMat(); };
      im.src = CREW_DIR + id + '.png';
    }
    return r;
  }
  function matHTML(id, lop) {
    return '<canvas class="mat ' + lop + '" data-char="' + id + '"></canvas>';
  }
  // Trả: true = xong, false = chưa vẽ được (chưa có kích thước hoặc ảnh chưa về)
  function veMat(cv) {
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return false;
    const r = crewImg(cv.dataset.char);
    if (!r.ok && !r.fail) return false;
    const dpr = Math.min(3, Math.round(root.devicePixelRatio || 1));
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (r.fail) {                       // thiếu hình: một chấm tròn thay vì ô vỡ
      const cr = C.crewById[cv.dataset.char];
      c.fillStyle = 'hsl(' + (cr ? cr.hue : 40) + ',45%,45%)';
      c.beginPath(); c.arc(W / 2, H / 2, Math.min(W, H) * 0.35, 0, Math.PI * 2); c.fill();
      return true;
    }
    c.imageSmoothingEnabled = false;
    // Khung đứng nhìn xuống: cột 1, hàng 0 của tờ 288x576.
    if (cv.classList.contains('mat-dau')) {
      c.drawImage(r.im, 96 + 18, 34, 60, 62, 0, 0, W, H);                // cắt lấy cái đầu
    } else {
      const sx = 96 + 10, sy = 30, sw = 76, sh = 114;                    // cả người, chân sát đáy
      const k = Math.min(W / sw, H / sh);
      const dw = sw * k, dh = sh * k;
      c.drawImage(r.im, sx, sy, sw, sh, (W - dw) / 2, H - dh, dw, dh);
    }
    return true;
  }
  let matRaf = 0;
  function chayMat(tries) {
    tries = tries || 0;
    if (matRaf) { cancelAnimationFrame(matRaf); matRaf = 0; }
    let cho = false;
    const ds = document.querySelectorAll('canvas.mat');
    for (let i = 0; i < ds.length; i++) {
      const cv = ds[i];
      if (cv.dataset.xong === '1') continue;
      if (veMat(cv)) cv.dataset.xong = '1';
      else if (!cv.clientWidth || !cv.clientHeight) cho = true;
    }
    // chỉ canh thêm vài khung khi ô CHƯA CÓ KÍCH THƯỚC (chưa gắn vào trang); ảnh chưa về thì onload lo
    if (cho && tries < 30) matRaf = requestAnimationFrame(() => { matRaf = 0; chayMat(tries + 1); });
  }
  // Đổi cỡ cửa sổ / xoay máy: khổ canvas đổi theo CSS nên phải vẽ lại.
  let rsT = 0;
  root.addEventListener('resize', () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => {
      document.querySelectorAll('canvas.mat').forEach(cv => { cv.dataset.xong = ''; });
      chayMat();
    }, 120);
  });

  // ---------------------------------------------------------------------------
  // NĂM CHUYẾN LẶN
  // ---------------------------------------------------------------------------
  function rewardText(r) {
    if (!r) return '—';
    return Object.keys(r).map(k => WI[k] + money(r[k])).join(' ');
  }
  function scrMaps(b) {
    const M = meta.M;
    b.appendChild(el('p', 'hint', 'Một ca là năm chuyến lặn liền nhau, chuyến sau sâu hơn và chỉ tiêu cao hơn. ' +
      'Số tầng bằng số phòng nhà REPO tương ứng; mỗi tầng cao khoảng ' + C.FLOOR_M + ' m. ' +
      'Về thuyền thì giữ phần đã giao lên boong, thua giữa chừng cũng vậy.'));
    const maxF = Math.max.apply(null, C.maps.map(m => m.floors));
    C.maps.forEach((m, i) => {
      const st = M.maps[m.id];
      const row = el('div', 'map' + (st.cleared ? ' done' : ''));
      row.dataset.map = m.id;
      row.innerHTML =
        (st.cleared ? '<span class="map-badge">✔ ĐÃ PHÁ</span>' : '') +
        '<div class="map-h"><b>' + m.name + '</b><span class="map-f">chuyến ' + (i + 1) + '</span></div>' +
        '<div class="map-d">' + m.desc + '</div>' +
        '<div class="map-s"><span>Sâu ~' + m.depthM + ' m</span><span>' + m.floors + ' tầng</span>' +
        '<span>Qua chuyến: ' + rewardText(m.clear) + '</span>' +
        (st.cleared ? '' : '<span>Lần đầu: ' + rewardText(m.first) + '</span>') + '</div>' +
        '<div class="map-bar"><i style="width:' + (m.floors / maxF * 100) + '%"></i></div>';
      b.appendChild(row);
    });
    b.appendChild(btn('⚓ Ra khơi ngay', 'big', sail));
  }

  // ---------------------------------------------------------------------------
  // BIỆT ĐỘI
  // ---------------------------------------------------------------------------
  function scrSquad(b) {
    const M = meta.M;
    b.appendChild(el('p', 'hint', 'Ô đầu là crew BẠN lặn, kỹ năng của nó nằm dưới nút bấm trong trận. Bốn ô còn lại là đồng đội: ' +
      'họ không xuống nước, chỉ cộng chỉ số cho cả đội theo chiến thuật bạn giao.'));

    const slots = el('div', 'slot-row');
    slots.appendChild(slotBox('lead', M.squad.lead, true));
    M.squad.mates.forEach((id, i) => slots.appendChild(slotBox(i, id, false)));
    b.appendChild(slots);

    const count = meta.squadList().length;
    if (count < 5 && Object.keys(M.chars).length > count) {
      const fill = el('div', 'row');
      fill.appendChild(btn('Xếp tự động cho đủ đội', '', () => {
        const n = meta.autoFill();
        UI.toast(n ? 'Đã xếp thêm ' + n + ' crew vào đội.' : 'Không còn crew rảnh.', n > 0);
        UI.render();
      }));
      b.appendChild(fill);
    }

    if (sel.char && M.chars[sel.char]) b.appendChild(charDetail(sel.char));

    b.appendChild(el('h3', '', 'Crew đang có (' + Object.keys(M.chars).length + '/' + C.crew.length + ')'));
    const grid = el('div', 'char-grid');
    C.crew.forEach(c => {
      if (!M.chars[c.id]) return;
      const inSquad = M.squad.lead === c.id || M.squad.mates.indexOf(c.id) >= 0;
      const card = charCard(c.id, M.squad.lead === c.id, M.tactics[c.id], () => { sel.char = c.id; UI.render(); });
      if (inSquad) card.classList.add('in');
      if (sel.char === c.id) card.classList.add('sel');
      grid.appendChild(card);
    });
    b.appendChild(grid);

    const missing = C.crew.filter(c => !M.chars[c.id]);
    if (missing.length) {
      b.appendChild(el('h3', '', 'Chưa có (' + missing.length + ')'));
      const g2 = el('div', 'char-grid');
      missing.forEach(c => {
        const d = el('div', 'cc s' + c.star + ' unknown');
        d.innerHTML = '<div class="cc-face">' + matHTML(c.id, 'mat-vua') + '</div>' +
          '<div class="cc-n">' + c.name + '</div><div class="cc-s">' + '★'.repeat(c.star) + '</div>' +
          '<div class="cc-tag">' + c.skill.name + '</div>';
        d.style.borderColor = C.rarity[c.star].color;
        on(d, 'click', () => UI.toast('Chưa sở hữu, quay ở Gacha.'));
        g2.appendChild(d);
      });
      b.appendChild(g2);
    }

    function slotBox(which, id, isLead) {
      const box = el('div', 'slot' + (id ? '' : ' empty') + (isLead ? ' lead' : ''));
      box.dataset.slot = String(which);
      box.appendChild(el('div', 'slot-l', isLead ? 'BẠN LẶN' : 'ĐỒNG ĐỘI ' + (which + 1)));
      if (id) {
        const c = C.crewById[id];
        box.appendChild(el('div', 'slot-f', matHTML(c.id, 'mat-vua')));
        box.appendChild(el('div', 'slot-n', c.name));
        if (!isLead) {
          const t = M.tactics[id] || 'loot';
          const s = el('select', 'tac');
          C.tactics.forEach(tt => {
            const o = el('option', '', tt.icon + ' ' + tt.name);
            o.value = tt.id;
            if (tt.id === t) o.selected = true;
            s.appendChild(o);
          });
          on(s, 'change', () => { meta.setTactic(id, s.value); UI.render(); });
          box.appendChild(s);
          box.appendChild(el('div', 'tac-d', C.tacticById[t].desc));
        } else {
          box.appendChild(el('div', 'tac-d', c.skill.name));
        }
        const acts = el('div', 'slot-acts');
        if (sel.char && sel.char !== id) {
          acts.appendChild(btn('Đặt vào đây', 'tiny', () => {
            const ok = isLead ? meta.setLead(sel.char) : meta.setMate(which, sel.char);
            if (!ok) return UI.toast('Không xếp được crew này vào ô đó.');
            UI.render();
          }));
        }
        if (!isLead) acts.appendChild(btn('Bỏ ra', 'tiny ghost', () => { meta.setMate(which, null); UI.render(); }));
        box.appendChild(acts);
      } else {
        box.appendChild(el('div', 'slot-f dim', '＋'));
        if (sel.char) {
          const acts = el('div', 'slot-acts');
          acts.appendChild(btn('Đặt vào đây', 'tiny', () => {
            if (!meta.setMate(which, sel.char)) {
              return UI.toast('Crew này đang ở ô BẠN LẶN. Chọn crew khác, hoặc đổi chỗ với một đồng đội đã có.');
            }
            UI.render();
          }));
          box.appendChild(acts);
        } else {
          box.appendChild(el('div', 'tac-d', 'Chọn một crew bên dưới rồi bấm vào đây.'));
        }
      }
      return box;
    }
  }

  function statCell(k, v) { return '<div class="sc"><span>' + k + '</span><b>' + v + '</b></div>'; }

  function charDetail(id) {
    const M = meta.M;
    const c = C.crewById[id], own = M.chars[id];
    const isLead = M.squad.lead === id;
    const mateIdx = M.squad.mates.indexOf(id);
    const tacticId = isLead ? null : (M.tactics[id] || null);
    const st = meta.charStats(id, mateIdx >= 0 ? tacticId : null);
    const U = C.upgrade;
    const maxed = own.lv >= U.maxLevel;
    const cost = meta.levelCost(own.lv);
    const pas = C.passives[id];
    const cdNow = c.skill.cd * (1 - st.cd);
    const d = el('div', 'detail');
    d.dataset.detail = id;
    d.innerHTML =
      '<div class="det-top"><div>' + matHTML(c.id, 'mat-ct') + '</div><div>' +
      '<div class="det-h"><b>' + c.name + '</b> · ' + c.epithet + ' <span class="stars">' + '★'.repeat(c.star) + '</span></div>' +
      '<div class="det-lv">Cấp ' + own.lv + '/' + U.maxLevel + ' · Mảnh ' + own.shard +
        (maxed ? '' : ' (cần ' + U.shard + ') · ' + WI.gold + money(cost.gold)) + '</div></div></div>' +
      '<div class="det-sk"><b>' + c.skill.name + '</b> · ' + c.skill.desc +
        '<br><span class="dim">Hồi chiêu ' + c.skill.cd + 's' +
        (st.cd > 0 ? ' (còn ' + cdNow.toFixed(1) + 's sau khi giảm)' : '') +
        (own.lv < U.cdAtLevel ? ' · cấp ' + U.cdAtLevel + ' giảm hồi chiêu ' + Math.round(U.cdReduce * 100) + '%' : '') + '</span></div>' +
      '<div class="det-sk' + (st.passiveOn ? '' : ' locked') + '"><b>Nội tại: ' + pas.name + '</b> · ' + pas.desc +
        (st.passiveOn ? '' : '<br><span class="dim">Mở ở cấp ' + U.passiveAtLevel + '.</span>') + '</div>' +
      '<div class="stat-grid">' +
        statCell('O₂', Math.round(st.hp)) + statCell('Sát thương', st.atk.toFixed(1)) +
        statCell('Tốc bơi', (st.spd * 100).toFixed(0) + '%') + statCell('Sức kéo', st.carry.toFixed(0)) +
        statCell('Giảm hồi chiêu', (st.cd * 100).toFixed(0) + '%') + statCell('Giáp', (st.grit * 100).toFixed(0) + '%') +
        statCell('Tầm nhìn', (st.eye * 100).toFixed(0) + '%') + statCell('Giá đồ', (st.luck * 100).toFixed(0) + '%') +
      '</div>';

    if (mateIdx >= 0) {
      d.appendChild(el('div', 'det-lv', 'Chiến thuật'));
      const pick = el('div', 'tac-pick');
      C.tactics.forEach(t => {
        const x = el('div', 'tac-b' + (t.id === tacticId ? ' on' : ''), '<i>' + t.icon + '</i>' + t.name);
        x.dataset.tactic = t.id;
        x.title = t.desc + ' · ' + bonusText(t.bonus);
        on(x, 'click', () => { meta.setTactic(id, t.id); UI.render(); });
        pick.appendChild(x);
      });
      d.appendChild(pick);
      const cur = C.tacticById[tacticId || 'loot'];
      d.appendChild(el('div', 'det-sk', '<b>' + cur.name + '</b> · ' + cur.desc + ' <span class="dim">(' + bonusText(cur.bonus) + ')</span>'));
    }

    const row = el('div', 'row');
    row.style.marginTop = '8px';
    const up = btn(maxed ? 'Đã cấp tối đa' : 'Lên cấp · ' + WI.gold + money(cost.gold), '', () => {
      const r = meta.levelUp(id);
      UI.toast(r.ok ? c.name + ' lên cấp ' + r.lv : r.why, r.ok);
      UI.render();
    });
    up.dataset.act = 'levelup';
    if (maxed) up.disabled = true;
    row.appendChild(up);
    if (!isLead) row.appendChild(btn('Cho lặn', 'ghost', () => { meta.setLead(id); UI.toast(c.name + ' sẽ là người lặn.', true); UI.render(); }));
    d.appendChild(row);
    return d;
  }
  function bonusText(bonus) {
    return Object.keys(bonus).map(k => (C.STAT_NAME[k] || k) + ' +' + Math.round(bonus[k] * 100) + '%').join(', ');
  }

  // ---------------------------------------------------------------------------
  // GACHA
  // ---------------------------------------------------------------------------
  const TAB_NAME = { char: 'Thường', lim1: 'Giới hạn 1', lim2: 'Giới hạn 2' };
  function scrGacha(b) {
    const M = meta.M;
    const tabs = el('div', 'tabs');
    C.banners.forEach(g => {
      const t = el('button', 'tab' + (sel.banner === g.id ? ' on' : ''), TAB_NAME[g.id] || g.name);
      t.type = 'button';
      t.dataset.banner = g.id;
      on(t, 'click', () => { sel.banner = g.id; UI.render(); });
      tabs.appendChild(t);
    });
    b.appendChild(tabs);

    const g = C.bannerById[sel.banner] || C.banners[0];
    const pity = M.pity[g.id];
    const box = el('div', 'banner');
    box.style.setProperty('--bc', g.color);
    box.innerHTML =
      '<div class="ban-t">' + g.name + '</div>' +
      '<div class="ban-d">' + g.desc + '</div>' +
      '<div class="ban-r">Tỉ lệ 5★ ' + (g.rate5 * 100).toFixed(1) + '% · 4★ ' + (g.rate4 * 100).toFixed(1) + '% · ' +
        'bảo hiểm 5★ sau <b>' + g.hard + '</b> lượt (tăng dần từ lượt ' + g.soft + ') · mười lượt chắc chắn có ≥ 4★</div>' +
      '<div class="ban-p" data-pity="' + g.id + '">Chưa ra 5★: <b>' + pity.c5 + '/' + g.hard + '</b> · chưa ra 4★: ' + pity.c4 + '/' + g.pity4 + '</div>';
    b.appendChild(box);

    const pool = el('div', 'pool');
    pool.appendChild(el('div', 'pool-t', 'Có thể ra:'));
    [5, 4, 3].forEach(star => {
      const names = meta.poolFor(g, star).map(c => '<span' + (M.chars[c.id] ? '' : ' class="dim"') + '>' + c.name + '</span>').join(' ');
      pool.appendChild(el('div', 'pool-r', '<b style="color:' + C.rarity[star].color + '">' + '★'.repeat(star) + '</b> ' + names));
    });
    b.appendChild(pool);

    const row = el('div', 'row pull');
    const b1 = btn('Quay 1 · ' + WI.gem + g.costGem, '', () => doPull(g.id, 1, false)); b1.dataset.act = 'pull1';
    const b10 = btn('Quay 10 · ' + WI.gem + money(g.costGem * 10), 'big', () => doPull(g.id, 10, false)); b10.dataset.act = 'pull10';
    row.appendChild(b1); row.appendChild(b10);
    const tickets = M[g.ticket] || 0;
    const bt = btn('Dùng vé (' + tickets + ')', 'ghost', () => {
      if (tickets < 1) return UI.toast('Hết vé.');
      doPull(g.id, tickets >= 10 ? 10 : 1, true);
    });
    bt.dataset.act = 'pullticket';
    row.appendChild(bt);
    b.appendChild(row);
    b.appendChild(el('p', 'hint', 'Hết ngọc thì sang Cửa Hàng. Ở đây "nạp" chỉ là bấm nút, không có cổng thanh toán nào cả.'));
  }

  function doPull(bannerId, n, ticket) {
    const r = meta.pull(bannerId, n, ticket);
    if (!r.ok) return UI.toast(r.why);
    showPulls(r.items);
    UI.render();
  }

  function showPulls(items) {
    const ov = hosts().modal;
    clear(ov);
    UI._closer = null;                   // bảng này có việc phải làm khi đóng: không cho bấm lệch
    ov.className = 'modal bdl-ui show';
    const card = el('div', 'mcard');
    card.dataset.pulls = String(items.length);
    card.appendChild(el('h3', '', 'Kết quả ' + items.length + ' lượt'));
    const g = el('div', 'pull-grid');
    items.forEach(it => {
      const c = C.crewById[it.id];
      const d = el('div', 'pcard s' + it.star);
      d.dataset.star = String(it.star);
      d.style.borderColor = C.rarity[it.star].color;
      d.innerHTML = '<div class="pc-f">' + matHTML(c.id, 'mat-ti') + '</div><div class="pc-n">' + c.name + '</div>' +
        '<div class="pc-s">' + '★'.repeat(it.star) + '</div>' +
        '<div class="pc-t">' + (it.isNew ? '<b class="new">CREW MỚI</b>' : '+' + it.shard + ' mảnh') + '</div>';
      g.appendChild(d);
    });
    card.appendChild(g);
    const ok = btn('Xong', 'big', () => { ov.className = 'modal bdl-ui'; UI.render(); });
    ok.dataset.act = 'pullsdone';
    card.appendChild(ok);
    ov.appendChild(card);
    chayMat();
  }

  // ---------------------------------------------------------------------------
  // CỬA HÀNG: đồ nghề, gói ngọc (nạp GIẢ), đổi hằng ngày
  // ---------------------------------------------------------------------------
  function khoiDoNghe(b) {
    const lo = meta.loadout();
    b.appendChild(el('h3', '', 'Đồ nghề mang xuống biển'));
    b.appendChild(el('p', 'hint',
      'Mua sẵn <b>MỘT</b> món, xuống nước là nó nằm ngay trên tay. <b>Mang xuống là mất</b>: hết ca hay bỏ ca đều không lấy lại. ' +
      'Đổi sang món khác thì món cũ được hoàn đủ vàng. Trạm trên thuyền giữa các chuyến vẫn bán đủ mọi thứ, ' +
      'chỗ này chỉ lo đúng khúc đầu ca, lúc còn tay không.'));

    const box = el('div', 'mangbox' + (lo ? ' on' : ''));
    if (lo) {
      const def = C.itemByKey[lo.key];
      box.innerHTML = '<div class="mb-i">' + iconHTML(def, 40) + '</div>' +
        '<div class="mb-b"><div class="mb-n">' + esc(def.name) + (def.uses ? ' ×' + def.uses : '') + '</div>' +
        '<div class="mb-s">Đang giữ, xuống nước là nằm sẵn trên tay.</div></div>';
      const rb = btn('Bỏ ra', 'ghost', () => {
        const r = meta.loadoutRefund();
        UI.toast(r.ok ? 'Đã bỏ ra, hoàn đủ vàng.' : r.why, r.ok);
        UI.render();
      });
      rb.dataset.act = 'loadout-refund';
      box.appendChild(rb);
    } else {
      box.innerHTML = '<div class="mb-b"><div class="mb-n">Chưa mang gì</div>' +
        '<div class="mb-s">Chọn một món bên dưới, tối đa một món mỗi ca.</div></div>';
    }
    b.appendChild(box);

    ['gun', 'melee', 'throw', 'tool'].forEach(kind => {
      const items = meta.loadoutItems().filter(it => it.kind === kind);
      if (!items.length) return;
      b.appendChild(el('h3', '', C.KIND_NAME[kind]));
      const g = el('div', 'wep-grid');
      items.forEach(it => {
        const carrying = !!lo && lo.key === it.key;
        const afford = (meta.M.gold || 0) + (lo ? lo.paid : 0) >= it.loadoutPrice;
        const d = el('div', 'wep' + (carrying ? ' on' : afford ? '' : ' ngheo'));
        d.dataset.item = it.key;
        d.innerHTML = '<div class="wp-i">' + iconHTML(it, 44) + '</div>' +
          '<div class="wp-n">' + esc(it.name) + '</div>' +
          '<div class="wp-u">' + (it.uses ? '×' + it.uses : 'dùng mãi') + '</div>' +
          '<div class="wp-p">' + (carrying ? 'ĐANG MANG' : WI.gold + ' ' + money(it.loadoutPrice)) + '</div>';
        d.title = it.desc;
        on(d, 'click', () => loadoutToggle(it, carrying));
        g.appendChild(d);
      });
      b.appendChild(g);
    });
  }

  function scrShop(b) {
    const M = meta.M;
    b.appendChild(el('div', 'fakebox', '⚠️ <b>Nạp ở đây là giả.</b> Không có cổng thanh toán, không mất tiền thật: bấm là ngọc vào ví. Đây là bản chơi thử của cơ chế nạp.'));

    const tick = el('div', 'stat-bar');
    [['ticketX', 'Vé Xác'], ['gem', 'Ngọc'], ['gold', 'Vàng']].forEach(([k, name]) => {
      tick.appendChild(el('div', 'sb', '<i>' + WI[k] + '</i><b>' + money(M[k] || 0) + '</b><span>' + name + '</span>'));
    });
    b.appendChild(tick);

    khoiDoNghe(b);

    b.appendChild(el('h3', '', 'Gói ngọc (nạp giả)'));
    const g = el('div', 'pack-grid');
    C.shopPacks.forEach(p => {
      const c = el('div', 'pack');
      c.dataset.pack = p.id;
      c.innerHTML = '<div class="pk-n">' + p.name + (p.tag ? '<span class="pk-tag">' + p.tag + '</span>' : '') + '</div>' +
        '<div class="pk-g">💎 ' + money(p.gem) + (p.bonus ? ' <span class="bonus">+' + money(p.bonus) + '</span>' : '') + '</div>' +
        '<div class="pk-p">' + money(p.vnd) + 'đ</div>';
      on(c, 'click', () => {
        const r = meta.buyPack(p.id);
        UI.toast('Đã cộng ' + money(r.gem) + ' ngọc (nạp giả).', true);
        UI.render();
      });
      g.appendChild(c);
    });
    b.appendChild(g);

    b.appendChild(el('h3', '', 'Đổi hằng ngày'));
    C.shopExchange.forEach(x => {
      const left = meta.exchangeLeft(x);
      const got = Object.keys(x.reward).map(k => WI[k] + money(x.reward[k])).join(' ');
      const row = el('div', 'xrow');
      row.dataset.exchange = x.id;
      row.innerHTML = '<div class="x-g">' + got + '</div><div class="x-l">còn ' + left + '/' + x.limit + ' lượt</div>';
      row.appendChild(btn(WI.gem + x.gem, left > 0 ? '' : 'ghost', () => {
        const r = meta.exchange(x.id);
        UI.toast(r.ok ? 'Đổi xong.' : r.why, r.ok);
        UI.render();
      }));
      b.appendChild(row);
    });
    if (M.counters.spendVnd > 0) {
      b.appendChild(el('p', 'hint', 'Tổng "đã nạp" (giả): ' + money(M.counters.spendVnd) + 'đ'));
    }
  }

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ
  // ---------------------------------------------------------------------------
  function scrQuest(b) {
    const q = meta.questList();
    const tabs = el('div', 'tabs');
    [['daily', 'Hằng ngày'], ['weekly', 'Hằng tuần'], ['ach', 'Thành tựu']].forEach(([id, name]) => {
      const n = q[id].filter(x => x.done && !x.claimed).length;
      const t = el('button', 'tab' + (sel.questTab === id ? ' on' : ''), name + (n ? ' (' + n + ')' : ''));
      t.type = 'button';
      on(t, 'click', () => { sel.questTab = id; UI.render(); });
      tabs.appendChild(t);
    });
    b.appendChild(tabs);

    const any = q.daily.concat(q.weekly, q.ach).some(x => x.done && !x.claimed);
    if (any) {
      const all = btn('Nhận tất cả', 'big', () => {
        const got = meta.claimAll();
        UI.toast('Nhận: ' + Object.keys(got).map(k => WI[k] + money(got[k])).join(' '), true);
        UI.render();
      });
      all.dataset.act = 'claimall';
      b.appendChild(all);
    }

    q[sel.questTab].forEach(x => {
      const row = el('div', 'quest' + (x.claimed ? ' claimed' : x.done ? ' done' : ''));
      row.dataset.quest = x.id;
      row.innerHTML =
        '<div class="q-b"><div class="q-t">' + x.text + '</div>' +
        '<div class="q-bar"><i style="width:' + (x.cur / x.need * 100) + '%"></i></div>' +
        '<div class="q-p">' + money(x.cur) + '/' + money(x.need) + ' · ' + rewardText(x.r) + '</div></div>';
      row.appendChild(x.claimed ? el('div', 'q-ok', '✔')
        : btn(x.done ? 'Nhận' : '…', x.done ? '' : 'ghost', () => {
          const r = meta.claimQuest(x.id);
          UI.toast(r.ok ? 'Đã nhận.' : 'Chưa xong.', r.ok);
          UI.render();
        }));
      b.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------------
  // BẢNG KẾT CA — summary là giá trị BDL.meta.runFinish() trả về
  // ---------------------------------------------------------------------------
  UI.showRunEnd = function (s) {
    s = s || {};
    document.body.classList.remove('in-run');   // tự phòng hộ: gọi từ đâu cũng phải vẽ được menu
    const ov = hosts().modal;
    clear(ov);
    UI._closer = null;                   // "Về sảnh" còn phải chạy: không cho bấm lệch ra ngoài
    ov.className = 'modal bdl-ui show ' + (s.win ? 'win' : 'lose');
    const card = el('div', 'mcard');
    card.dataset.runend = s.win ? 'win' : 'lose';
    card.appendChild(el('h3', '', s.win ? '✔ Thắng ca lặn' : 'Về bến'));
    const n = (s.cleared || []).length;
    card.appendChild(el('div', 'mline', s.win
      ? 'Cả năm chuyến đã qua. Thuyền cập bến với toàn bộ đồ cổ đã giao.'
      : 'Về bến sớm, vẫn giữ phần đã giao lên boong' + (n ? ' và ' + n + ' chuyến đã qua' : '') + '.'));
    const line = (k, v, cls) => card.appendChild(el('div', 're-row' + (cls ? ' ' + cls : ''), '<span>' + k + '</span><b>' + v + '</b>'));
    line('Đồ cổ giao lên thuyền', money(s.delivered || 0));
    line('Bán đồ (55%)', WI.gold + money(s.base || 0));
    if (s.clearGold || s.clearGem) line('Thưởng qua ' + n + ' chuyến', rewardText({ gold: s.clearGold || 0, gem: s.clearGem || 0 }));
    if (s.firstGold || s.firstGem) line('Lần đầu phá ' + (s.firstClear || []).length + ' chuyến', rewardText({ gold: s.firstGold || 0, gem: s.firstGem || 0 }));
    line('Tổng nhận', rewardText({ gold: s.gold || 0, gem: s.gem || 0 }), 'tot');
    const back = btn('Về sảnh', 'big', () => { ov.className = 'modal bdl-ui'; UI.go('home'); });
    back.dataset.act = 'runend-close';
    card.appendChild(back);
    ov.appendChild(card);
  };

  UI.el = el; UI.btn = btn; UI.matHTML = matHTML; UI.iconHTML = iconHTML; UI.veMat = chayMat;

})(window);
