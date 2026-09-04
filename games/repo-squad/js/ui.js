/*
 * Ca Trực Đêm: Biệt Đội — toàn bộ màn hình ngoài trận: sảnh, chọn map, biệt đội,
 * trang bị, tiến hoá, gacha, cửa hàng, nhiệm vụ — và HUD trong trận.
 *
 * WHY: menu là DOM chứ không vẽ lên canvas, để chữ tiếng Việt luôn có dấu đúng.
 * ROOT-CAUSE: memory os-font-empty-in-browser — hỏi hệ điều hành lấy font trong
 *      WebGL trả về rỗng và mọi dấu tiếng Việt bị rụng. DOM thì trình duyệt lo.
 */
(function (root) {
  'use strict';
  const SQ = root.SQ;
  const UI = SQ.ui = {};
  const $ = sel => document.querySelector(sel);
  const money = SQ.money;

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function on(node, ev, fn) { node.addEventListener(ev, fn); return node; }
  function btn(label, cls, fn) {
    const b = el('button', 'b ' + (cls || ''), label);
    on(b, 'click', e => { e.preventDefault(); fn(e); });
    return b;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  let screenName = 'home';
  let sel = { char: null, slot: null, item: null, map: null, banner: 'char', questTab: 'daily' };
  let toastT = 0;

  // Cửa sổ chi tiết dùng chung cho trang bị / tiến hoá — thay cho khối chi tiết
  // chèn giữa danh sách, vì chèn giữa làm cả trang nhảy mỗi lần bấm.
  // LỐI RA PHẢI CÓ TRƯỚC NỘI DUNG.
  // ROOT-CAUSE của bug "bảng đen kín màn hình, không có nút ✕, bấm ra ngoài không tắt, Escape
  //   cũng không tắt, chỉ tải lại trang mới thoát": thứ tự cũ là bật `modal show` -> dựng thẻ ✕
  //   (nhưng CHƯA gắn vào) -> chạy build(body) -> mới gắn thẻ và mới gắn cái bắt bấm-ra-ngoài.
  //   build() ném lỗi một cái là lớp phủ ĐANG HIỆN mà bên trong rỗng không: không nút, không
  //   backdrop, và nó phủ kín cả thanh trên lẫn đường link "← Hub". Mà build() ném lỗi rất dễ:
  //   `SQ.STATS[it.main].name`, `SQ.SLOT_BY_ID[it.slot].icon`, `SQ.SET_BY_ID[it.set].name` đều
  //   đọc thẳng không chắn, nên một món đồ mang id mà bản game này không biết là đủ.
  //   Gắn khung + lối ra TRƯỚC rồi mới đổ nội dung vào thì một cú ngoặc chỉ còn là một bảng
  //   trống có nút đóng — khó chịu, nhưng thoát ra được.
  UI.popup = function (title, build) {
    const ov = $('#modal');
    clear(ov);
    const card = el('div', 'mcard');
    const h = el('div', 'pop-h');
    h.appendChild(el('div', 'pop-t', title));
    h.appendChild(btn('✕', 'chev', () => UI.closePopup()));
    card.appendChild(h);
    const body = el('div', 'pop-b');
    card.appendChild(body);
    ov.appendChild(card);
    UI._closer = UI.closePopup;          // bấm ra ngoài đóng — xem listener gắn một lần ở dưới
    ov.className = 'modal show';
    try { build(body); }
    catch (e) {
      console.error('Dựng cửa sổ "' + title + '" không được:', e);
      body.appendChild(el('div', 'mline', 'Cửa sổ này dựng lỗi: ' + ((e && e.message) || 'không rõ') +
        '. Dữ liệu của bạn không sao — đóng lại và làm việc khác.'));
    }
  };
  UI.closePopup = function () { const ov = $('#modal'); if (ov) ov.className = 'modal'; UI._closer = null; };

  // MỘT cái bắt bấm-ra-ngoài, gắn đúng MỘT lần.
  // ROOT-CAUSE: bản cũ gắn một listener mới vào #modal trong MỖI lần mở popup và không bao giờ
  //   gỡ. Chúng cộng dồn cả phiên, và vì #modal còn được hai bảng khác dùng chung (kết quả gacha
  //   và bảng kết ca) nên hai bảng đó THỪA KẾ luôn cái bấm-ra-ngoài của popup — mà lối đóng
  //   riêng của chúng còn kèm việc khác: "Xong" của gacha gọi UI.render(), "Về sảnh" của bảng kết
  //   ca gọi UI.go('home'). Bấm lệch ra ngoài một cái là bảng biến mất và việc kèm theo bị bỏ
  //   qua — người chơi thấy "quay 10 lần xong đồ đâu mất" và "phá đảo xong không thấy thưởng".
  //   Bây giờ mỗi bảng tự khai lối-bấm-ra-ngoài của mình vào UI._closer, hoặc không khai gì cả.
  UI._closer = null;
  (function () {
    const ov = $('#modal');
    if (ov) on(ov, 'click', e => { if (e.target === ov && UI._closer) UI._closer(); });
    // Escape là lối thoát ai cũng thử trước tiên, và nó phải đóng được cả bảng dựng lỗi.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (ov && ov.classList.contains('show')) { UI.closePopup(); return; }
      if (window.REPO && REPO.S && REPO.S.stashOpen && REPO.closeStash) REPO.closeStash();
    });
  })();

  UI.toast = function (text, good) {
    const t = $('#toast');
    t.textContent = text;
    t.className = 'toast show' + (good ? ' good' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className = 'toast'; }, 2200);
  };

  // ---------------------------------------------------------------------------
  UI.go = function (name) {
    screenName = name;
    UI.render();
  };
  UI.current = () => screenName;

  // Khung menu dựng theo kiểu game sinh tồn di động: một thanh trên cố định,
  // đúng MỘT vùng cuộn ở giữa, và một thanh tab dưới cùng luôn nhìn thấy.
  // WHY: bản cũ mỗi màn tự vẽ lại ví tiền + nút "về sảnh" nên không màn nào
  //      giống màn nào, và người chơi phải cuộn mới thấy nút đi tiếp.
  const SCREENS = {
    home: scrHome, maps: scrMaps, squad: scrSquad, equip: scrEquip,
    evol: scrEvol, gacha: scrGacha, shop: scrShop, quest: scrQuest
  };
  // id, biểu tượng, nhãn — ô giữa nổi lên như nút vào trận
  // Cùng hình dạng với thanh tab của bản Unity tham chiếu: Shop · Kho đồ · SẢNH · Đội · Tiến hoá
  const TABS = [
    ['shop',  '🏪', 'Cửa Hàng'],
    ['equip', '🎒', 'Trang Bị'],
    ['home',  '⚔️', 'ĐI CA'],
    ['squad', '👥', 'Biệt Đội'],
    ['evol',  '🧬', 'Tiến Hoá']
  ];
  const SHEET_TITLE = {
    maps: 'Chọn map', squad: 'Biệt đội', equip: 'Trang bị', evol: 'Tiến hoá',
    gacha: 'Gacha', shop: 'Cửa hàng', quest: 'Nhiệm vụ'
  };

  // KHÔNG BAO GIỜ ĐƯỢC PHÉP ĐỂ LẠI MỘT CÁI MENU RỖNG.
  // ROOT-CAUSE: bản cũ gọi clear(wrap) NGAY ĐẦU rồi mới dựng lại, và hàng tab được thêm vào SAU
  //   CÙNG. Bất kỳ cú ngoặc nào ở giữa là menu trắng vĩnh viễn — không nút ĐI CA, không hàng tab,
  //   và nút "Xoá dữ liệu" thì nằm trong chính cái màn vừa chết. Tệ nhất: nguyên nhân nằm trong
  //   localStorage nên tải lại trang vẫn y nguyên. Đo được: chỉ cần một id nhân vật lạ trong save
  //   là questPending() ném lỗi, và mọi màn đều chết theo vì hàng tab gọi nó.
  //   Đường vào không hề xa vời: SQ.syncFromHub() lấy nguyên payload đám mây nhét vào migrate()
  //   rồi GHI XUỐNG localStorage mà không kiểm tra một chữ.
  //   Dựng vào một khung rời rồi mới tráo vào là menu cũ đứng nguyên cho tới khi có menu mới
  //   dùng được; và nếu cả bản dự phòng cũng chết thì vẫn còn một màn tối thiểu để thoát ra.
  UI.render = function () {
    try { renderInto(); }
    catch (e) {
      console.error('Dựng menu không được:', e);
      renderFallback(e);
    }
  };
  function renderFallback(e) {
    const wrap = $('#menu');
    if (!wrap) return;
    clear(wrap);
    const box = el('div', 'sheet');
    const b = el('div', 'sheet-b');
    b.appendChild(el('h3', '', '⚠ Giao diện vấp lỗi'));
    b.appendChild(el('div', 'mline', 'Bản lưu có thứ gì đó bản game này không đọc được: ' +
      ((e && e.message) || 'không rõ') + '.'));
    b.appendChild(btn('Thử dựng lại', 'big', () => UI.render()));
    b.appendChild(btn('Về sảnh', '', () => { try { UI.go('home'); } catch (_) { renderFallback(e); } }));
    b.appendChild(btn('Xoá dữ liệu và chơi lại từ đầu', 'ghost', () => {
      if (SQ.hardReset) SQ.hardReset();
      try { UI.go('home'); } catch (_) { location.reload(); }
    }));
    box.appendChild(b);
    wrap.appendChild(box);
  }
  function renderInto() {
    const wrap = $('#menu');
    if (!wrap) return;
    // Giu cho cuon CHI KHI ve lai dung man cu. render() cung chay khi DOI man, nen
    // giu vo dieu kien la do vi tri cuon cua man truoc sang man moi: dang o cuoi
    // danh sach map roi bam Nhiem Vu thi Nhiem Vu mo ra o day - hang tab va nut
    // NHAN TAT CA nam ngoai man hinh. Chi thay ro o man ngang, vi o man doc phan
    // lon man vua khit nen trinh duyet kep ve 0.
    const keep = wrap.querySelector('.stage');
    const scrollTop = (keep && keep.dataset.scr === screenName) ? keep.scrollTop : 0;
    // Dựng vào một khung RỜI. Menu đang hiện không bị đụng tới cho tới dòng tráo ở cuối hàm,
    // nên một cú ngoặc ở giữa để lại menu cũ vẫn dùng được thay vì một khoảng trắng.
    const frag = document.createDocumentFragment();

    frag.appendChild(topBar());

    const stage = el('div', 'stage' + (screenName === 'home' ? ' is-home' : ''));
    frag.appendChild(stage);

    if (screenName === 'home') {
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
      (SCREENS[screenName] || scrHome)(body);
    }

    frag.appendChild(tabBar());
    clear(wrap);                 // tới đây mới chắc chắn có một menu đầy đủ để thay vào
    wrap.appendChild(frag);
    stage.dataset.scr = screenName;
    if (scrollTop) stage.scrollTop = scrollTop;
  }

  function questPending() {
    const q = SQ.questList();
    return q.daily.concat(q.weekly, q.ach).filter(x => x.done && !x.claimed).length;
  }

  function topBar() {
    const M = SQ.M;
    const t = el('div', 'topbar');
    const lead = (M.squad.lead && SQ.CHAR_BY_ID[M.squad.lead]) || null;
    const me = el('div', 'me');
    me.innerHTML =
      '<div class="me-av">' + (lead ? faceOf(lead) : '👤') + '</div>' +
      '<div class="me-b"><div class="me-n">' + (lead ? lead.name : 'Tổ trưởng') + '</div>' +
      '<div class="me-p">⚡ ' + money(SQ.squadPower()) + '</div></div>';
    on(me, 'click', () => UI.go('squad'));
    t.appendChild(me);

    const purse = el('div', 'purse');
    ['gold', 'gem', 'core'].forEach(k => {
      const c = el('div', 'coin');
      c.title = SQ.WALLET_LABEL[k];
      c.innerHTML = '<i>' + SQ.WALLET_ICON[k] + '</i><b>' + money(M[k] || 0) + '</b><s>+</s>';
      on(c, 'click', () => UI.go('shop'));
      purse.appendChild(c);
    });
    t.appendChild(purse);
    return t;
  }

  function tabBar() {
    const n = el('nav', 'tabbar');
    const badge = { quest: questPending() };
    TABS.forEach(([id, icon, label], i) => {
      const mid = i === 2;
      const active = mid ? (screenName === 'home' || screenName === 'maps') : screenName === id;
      const d = el('div', 'tb' + (mid ? ' mid' : '') + (active ? ' on' : ''));
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
  // Map đang chọn ở sảnh. Mặc định là map còn mở gần nhất mà chưa phá đảo.
  function defaultMap() {
    const open = SQ.MAPS.filter(m => SQ.mapUnlocked(m.id));
    const next = open.find(m => !SQ.M.maps[m.id].cleared);
    return (next || open[open.length - 1] || SQ.MAPS[0]).id;
  }
  function curMap() {
    if (!sel.map || !SQ.MAP_BY_ID[sel.map] || !SQ.mapUnlocked(sel.map)) sel.map = defaultMap();
    return SQ.MAP_BY_ID[sel.map];
  }
  UI.pickMap = function (id) { sel.map = id; UI.go('home'); };

  function scrHome(b) {
    const M = SQ.M;
    const list = SQ.squadList();
    const lead = list.find(m => m.player) || list[0] || null;
    const leadDef = lead ? SQ.CHAR_BY_ID[lead.id] : null;

    // — hai cột phím tắt hai bên, đúng chỗ nhóm trái/phải của bản tham chiếu —
    const railL = el('div', 'rail left');
    const railR = el('div', 'rail');
    // Sổ tay vốn chỉ có một cửa vào: cái nút nhỏ trên thanh chrome của TRANG, cạnh "← Hub".
    // Chủ dự án tìm không ra ("r bấm đâu để show ra wiki?") — và đúng lúc vừa bảo mấy nút ngoài
    // sảnh cần to lên. Nên nó có thêm một cửa vào ở đây, đứng ngang hàng với Gacha và Nhiệm Vụ,
    // vì đọc mặt con quái là việc của lúc CHƯA vào nhà. Nút trên thanh trang vẫn giữ: đó là cửa
    // duy nhất mở được lúc đang trong ca.
    // Mục này không phải một màn hình của UI.go — nó gọi thẳng tấm màn của engine.
    [['gacha', '🎰', 'Gacha', 0, railL],
     ['maps', '🗺️', 'Map', 0, railL],
     ['wiki', '📖', 'Sổ Tay', 0, railL],
     ['quest', '📜', 'Nhiệm Vụ', questPending(), railR],
     ['shop', '🏪', 'Cửa Hàng', 0, railR]].forEach(function (r) {
      const d = el('div', 'rail-b', '<div class="rb-i">' + r[1] + '</div><div class="rb-n">' + r[2] + '</div>');
      if (r[3]) d.appendChild(el('span', 'dot', String(r[3])));
      on(d, 'click', () => {
        if (r[0] === 'wiki'){
          if (window.REPO && REPO.showWiki) REPO.showWiki();
          else UI.toast('Sổ tay chưa nạp xong, thử lại sau một giây.');
          return;
        }
        UI.go(r[0]);
      });
      r[4].appendChild(d);
    });
    b.appendChild(railL);
    b.appendChild(railR);

    // — sân khấu: xác đang cầm đứng giữa —
    const show = el('div', 'showcase');
    if (leadDef) {
      show.style.setProperty('--hue', leadDef.hue);
      show.style.borderColor = SQ.RARITY[leadDef.star].color;
      show.innerHTML =
        '<div class="sc-glow"></div>' +
        '<div class="sc-face">' + faceOf(leadDef) + '</div>' +
        '<div class="sc-name">' + leadDef.name + '<span class="sc-ep"> · ' + leadDef.epithet + '</span></div>' +
        '<div class="sc-star">' + '★'.repeat(leadDef.star) + '</div>' +
        '<div class="sc-skill"><b>' + leadDef.skill.name + '</b> — ' + leadDef.skill.desc + '</div>';
    } else {
      show.innerHTML = '<div class="sc-face">👤</div><div class="sc-name">Chưa có xác nào</div>';
    }
    on(show, 'click', () => UI.go('squad'));
    b.appendChild(show);

    // — hàng năm người —
    const line = el('div', 'lineup');
    for (let i = 0; i < 5; i++) {
      const m = list[i];
      if (m) {
        const c = SQ.CHAR_BY_ID[m.id];
        const d = el('div', 'lu' + (m.player ? ' is-me' : ''));
        d.style.setProperty('--hue', c.hue);
        d.style.borderColor = SQ.RARITY[c.star].color;
        d.innerHTML = '<div class="lu-f">' + faceOf(c) + '</div><div class="lu-n">' + c.name + '</div>' +
          '<div class="lu-t">' + (m.player ? 'BẠN CẦM' : SQ.TACTIC_BY_ID[m.tactic].icon + ' ' + SQ.TACTIC_BY_ID[m.tactic].name) + '</div>';
        on(d, 'click', () => UI.go('squad'));
        line.appendChild(d);
      } else {
        const d = el('div', 'lu empty', '<div class="lu-f">＋</div><div class="lu-n">trống</div><div class="lu-t">xếp thêm</div>');
        on(d, 'click', () => UI.go('squad'));
        line.appendChild(d);
      }
    }
    b.appendChild(line);

    // — thanh chọn map, kiểu chọn chương —
    const map = curMap();
    const st = M.maps[map.id];
    const open = SQ.MAPS.filter(m => SQ.mapUnlocked(m.id));
    const at = open.findIndex(m => m.id === map.id);
    const pick = el('div', 'chapter');
    const prev = btn('‹', 'chev', () => { sel.map = open[Math.max(0, at - 1)].id; UI.render(); });
    const next = btn('›', 'chev', () => { sel.map = open[Math.min(open.length - 1, at + 1)].id; UI.render(); });
    if (at <= 0) prev.disabled = true;
    if (at >= open.length - 1) next.disabled = true;
    const mid = el('div', 'ch-b');
    const power = SQ.squadPower();
    mid.innerHTML =
      '<div class="ch-n">' + map.name + (st.cleared ? ' <span class="ch-ok">✔</span>' : '') + '</div>' +
      '<div class="ch-s">' + map.floors + ' tầng · ⚡ khuyên ' + money(map.power) +
        (power >= map.power ? '' : ' <span class="bad">· tổ còn yếu</span>') + '</div>' +
      '<div class="ch-bar"><i style="width:' + Math.min(100, st.floor / map.floors * 100) + '%"></i></div>' +
      '<div class="ch-f">Xa nhất: tầng ' + st.floor + '/' + map.floors + ' · bấm để xem hết map</div>';
    on(mid, 'click', () => UI.go('maps'));
    pick.appendChild(prev); pick.appendChild(mid); pick.appendChild(next);
    b.appendChild(pick);

    // — nút vào trận —
    b.appendChild(btn('▶ ĐI CA', 'cta', () => SQ.squad.enter(map.id)));

    const foot = el('div', 'foot-note');
    foot.appendChild(el('span', '', 'Tiến độ lưu trên máy bạn.'));
    const rs = btn('Xoá dữ liệu', 'ghost tiny', () => {
      if (!confirm('Xoá sạch tài khoản trong game này? Không lấy lại được.')) return;
      SQ.hardReset(); UI.go('home'); UI.toast('Đã xoá. Bắt đầu lại.');
    });
    foot.appendChild(rs);
    b.appendChild(foot);
  }

  function charCard(id, isLead, tacticId, fn) {
    const c = SQ.CHAR_BY_ID[id];
    const own = SQ.M.chars[id];
    const st = SQ.charStats(id, tacticId);
    const r = SQ.RARITY[c.star];
    const d = el('div', 'cc s' + c.star);
    d.style.setProperty('--hue', c.hue);
    d.innerHTML =
      '<div class="cc-face"><span class="cc-emo">' + faceOf(c) + '</span></div>' +
      '<div class="cc-n">' + c.name + '</div>' +
      '<div class="cc-s">' + '★'.repeat(c.star) + ' · Lv' + (own ? own.lv : 1) + '</div>' +
      (isLead ? '<div class="cc-tag lead">BẠN CẦM</div>'
              : '<div class="cc-tag">' + (tacticId ? SQ.TACTIC_BY_ID[tacticId].icon + ' ' + SQ.TACTIC_BY_ID[tacticId].name : '—') + '</div>') +
      '<div class="cc-p">⚡' + money(st ? st.power : 0) + '</div>';
    d.style.borderColor = r.color;
    if (fn) on(d, 'click', fn);
    return d;
  }
  function faceOf(c) {
    return { bao: '🔦', hue: '💉', tam: '💪', ky: '🔑', linh: '🌑', dung: '🔨', mai: '🔔',
             phuc: '🚑', son: '🧱', nga: '⚡', khoi: '👁️', van: '❄️', hai: '🧲', tuyet: '🕊️' }[c.id] || '🙂';
  }

  // ---------------------------------------------------------------------------
  // CHỌN MAP LỚN
  // ---------------------------------------------------------------------------
  function scrMaps(b) {
    b.appendChild(el('p', 'hint', 'Mỗi map có số tầng cố định. Hết tầng cuối là phá đảo — không có vòng lặp vô tận. Thua giữa chừng vẫn giữ phần đã giao.'));
    const power = SQ.squadPower();

    SQ.MAPS.forEach(m => {
      const st = SQ.M.maps[m.id];
      const unlocked = SQ.mapUnlocked(m.id);
      const row = el('div', 'map' + (unlocked ? '' : ' locked') + (st.cleared ? ' done' : '') +
        (sel.map === m.id ? ' cur' : ''));
      row.innerHTML =
        '<div class="map-h"><b>' + m.name + '</b><span class="map-f">' + m.floors + ' tầng</span></div>' +
        '<div class="map-d">' + m.desc + '</div>' +
        '<div class="map-s">' +
          '<span class="' + (power >= m.power ? 'ok' : 'bad') + '">⚡ khuyên ' + money(m.power) + '</span>' +
          '<span>Chỉ tiêu tầng 1: ' + money(m.quotaBase) + '</span>' +
          // KHÔNG liệt kê tên quái ở đây nữa. Dòng cũ đọc `m.foes` — một danh sách viết tay
          // trong content.js mà bộ sinh màn không hề đọc tới — nên nó hứa những con quái mà màn
          // chơi không giao. Luật THẬT thì ngắn hơn và đúng hơn: mỗi tầng bốc ngẫu nhiên ba
          // thứ trong nhà, và một trong ba luôn là Kẻ húc (xem STOCK_ALWAYS bên repo2d).
          '<span>Quái: 3 thứ mỗi tầng, luôn có Kẻ húc</span>' +
        '</div>' +
        '<div class="map-r">Phá đảo: ' + rewardText(m.clear) + (st.cleared ? '' : ' · <b>Lần đầu:</b> ' + rewardText(m.first)) + '</div>';
      if (st.cleared) row.appendChild(el('div', 'map-badge', '✔ ĐÃ PHÁ ĐẢO'));
      else if (st.floor > 0) row.appendChild(el('div', 'map-badge dim', 'Xa nhất: tầng ' + st.floor));

      if (unlocked) {
        const acts = el('div', 'row');
        acts.appendChild(btn('Chọn map này', 'ghost', () => UI.pickMap(m.id)));
        acts.appendChild(btn('Vào ca ngay', '', () => SQ.squad.enter(m.id)));
        row.appendChild(acts);
      } else {
        row.appendChild(el('div', 'lockmsg', '🔒 Phá đảo map trước để mở'));
      }
      b.appendChild(row);
    });
  }
  function rewardText(r) {
    if (!r) return '—';
    return Object.keys(r).map(k => SQ.WALLET_ICON[k] + money(r[k])).join(' ');
  }

  // ---------------------------------------------------------------------------
  // BIỆT ĐỘI
  // ---------------------------------------------------------------------------
  function scrSquad(b) {
    b.appendChild(el('p', 'hint', 'Ô đầu là xác BẠN cầm — kỹ năng của nó nằm dưới nút bấm trong trận. Bốn ô còn lại là bot; mỗi bot chạy theo chiến thuật bạn giao.'));

    const M = SQ.M;
    const slots = el('div', 'slot-row');
    slots.appendChild(slotBox('lead', M.squad.lead, true));
    M.squad.mates.forEach((id, i) => slots.appendChild(slotBox(i, id, false)));
    b.appendChild(slots);

    const inSquadCount = SQ.squadList().length;
    if (inSquadCount < 5 && Object.keys(M.chars).length > inSquadCount) {
      const fill = el('div', 'row');
      fill.appendChild(btn('Xếp tự động cho đủ tổ', '', () => {
        const n = SQ.autoFill();
        UI.toast(n ? 'Đã xếp thêm ' + n + ' xác vào tổ.' : 'Không còn xác rảnh.', n > 0);
        UI.render();
      }));
      b.appendChild(fill);
    }

    if (sel.char && M.chars[sel.char]) b.appendChild(charDetail(sel.char));

    b.appendChild(el('h3', '', 'Xác đang có (' + Object.keys(M.chars).length + '/' + SQ.CHARS.length + ')'));
    const grid = el('div', 'char-grid');
    SQ.CHARS.forEach(c => {
      if (!M.chars[c.id]) return;
      const inSquad = M.squad.lead === c.id || M.squad.mates.indexOf(c.id) >= 0;
      const card = charCard(c.id, M.squad.lead === c.id, M.tactics[c.id], () => { sel.char = c.id; UI.render(); });
      if (inSquad) card.classList.add('in');
      if (sel.char === c.id) card.classList.add('sel');
      grid.appendChild(card);
    });
    b.appendChild(grid);

    const missing = SQ.CHARS.filter(c => !M.chars[c.id]);
    if (missing.length) {
      b.appendChild(el('h3', '', 'Chưa có (' + missing.length + ')'));
      const g2 = el('div', 'char-grid dimmed');
      missing.forEach(c => {
        const d = el('div', 'cc s' + c.star + ' unknown');
        d.innerHTML = '<div class="cc-face"><span class="cc-emo">' + faceOf(c) + '</span></div>' +
          '<div class="cc-n">' + c.name + '</div><div class="cc-s">' + '★'.repeat(c.star) + '</div>' +
          '<div class="cc-tag">' + c.skill.name + '</div>';
        d.style.borderColor = SQ.RARITY[c.star].color;
        on(d, 'click', () => { UI.toast('Chưa sở hữu — quay ở Gacha Xác.'); });
        g2.appendChild(d);
      });
      b.appendChild(g2);
    }

    function slotBox(which, id, isLead) {
      const box = el('div', 'slot' + (id ? '' : ' empty') + (isLead ? ' lead' : ''));
      const label = isLead ? 'BẠN CẦM' : 'BOT ' + (which + 1);
      box.appendChild(el('div', 'slot-l', label));
      if (id) {
        const c = SQ.CHAR_BY_ID[id];
        box.appendChild(el('div', 'slot-f', faceOf(c)));
        box.appendChild(el('div', 'slot-n', c.name));
        if (!isLead) {
          const t = SQ.M.tactics[id] || 'loot';
          const s = el('select', 'tac');
          SQ.TACTICS.forEach(tt => {
            const o = el('option', '', tt.icon + ' ' + tt.name);
            o.value = tt.id;
            if (tt.id === t) o.selected = true;
            s.appendChild(o);
          });
          on(s, 'change', () => { SQ.setTactic(id, s.value); UI.render(); });
          box.appendChild(s);
          box.appendChild(el('div', 'tac-d', SQ.TACTIC_BY_ID[t].desc));
        } else {
          box.appendChild(el('div', 'tac-d', SQ.CHAR_BY_ID[id].skill.name + ' — ' + SQ.CHAR_BY_ID[id].skill.desc));
        }
        const acts = el('div', 'slot-acts');
        if (sel.char && sel.char !== id) {
          acts.appendChild(btn('Đặt vào đây', 'tiny', () => {
            const ok = isLead ? SQ.setLead(sel.char) : SQ.setMate(which, sel.char);
            if (!ok) return UI.toast('Không xếp được xác này vào ô đó.');
            UI.render();
          }));
        }
        if (!isLead) acts.appendChild(btn('Bỏ ra', 'tiny ghost', () => { SQ.setMate(which, null); UI.render(); }));
        box.appendChild(acts);
      } else {
        box.appendChild(el('div', 'slot-f dim', '＋'));
        if (sel.char) {
          const acts = el('div', 'slot-acts');
          acts.appendChild(btn('Đặt vào đây', 'tiny', () => {
            if (!SQ.setMate(which, sel.char)) {
              return UI.toast('Xác này đang ở ô BẠN CẦM. Chọn xác khác, hoặc đổi chỗ với một bot đã có.');
            }
            UI.render();
          }));
          box.appendChild(acts);
        } else {
          box.appendChild(el('div', 'tac-d', 'Chọn một xác bên dưới rồi bấm vào đây.'));
        }
      }
      return box;
    }
  }

  function charDetail(id) {
    const c = SQ.CHAR_BY_ID[id], own = SQ.M.chars[id];
    const st = SQ.charStats(id, SQ.M.tactics[id]);
    const d = el('div', 'detail');
    const needShard = SQ.charShardCost(own.lv);
    const cost = SQ.charLevelCost(own.lv);
    d.innerHTML =
      '<div class="det-h"><b>' + c.name + '</b> · ' + c.epithet + ' <span class="stars">' + '★'.repeat(c.star) + '</span></div>' +
      '<div class="det-sk"><b>' + c.skill.name + '</b> — ' + c.skill.desc + '<br><span class="dim">Hồi chiêu ' + c.skill.cd + 's (còn ' + (c.skill.cd * (1 - st.cd)).toFixed(1) + 's sau giảm hồi chiêu)</span></div>' +
      '<div class="det-sk"><b>Nội tại: ' + c.passive.name + '</b> — ' + c.passive.desc + '</div>' +
      '<div class="stat-grid">' +
        statCell('Máu', Math.round(st.hp)) + statCell('Sát thương', st.atk.toFixed(1)) +
        statCell('Tốc chạy', (st.spd * 100).toFixed(0) + '%') + statCell('Sức mang', st.carry.toFixed(0) + 'kg') +
        statCell('Giảm hồi chiêu', (st.cd * 100).toFixed(0) + '%') + statCell('Giáp', (st.grit * 100).toFixed(0) + '%') +
        statCell('Tầm nhìn', (st.eye * 100).toFixed(0) + '%') + statCell('Giá đồ', (st.luck * 100).toFixed(0) + '%') +
      '</div>' +
      '<div class="det-lv">Cấp ' + own.lv + '/' + SQ.CHAR_MAX_LV + ' · Mảnh ' + own.shard + '/' + needShard + ' · ' + SQ.WALLET_ICON.gold + money(cost.gold) + '</div>';
    const row = el('div', 'row');
    row.appendChild(btn('Lên cấp', '', () => {
      const r = SQ.levelUpChar(id);
      UI.toast(r.ok ? c.name + ' lên cấp ' + r.lv : r.why, r.ok);
      UI.render();
    }));
    row.appendChild(btn('Lắp đồ cho xác này', 'ghost', () => { sel.char = id; UI.go('equip'); }));
    d.appendChild(row);
    return d;
  }
  function statCell(k, v) { return '<div class="sc"><span>' + k + '</span><b>' + v + '</b></div>'; }

  // ---------------------------------------------------------------------------
  // TRANG BỊ — chọn xác trước, rồi lắp sáu ô.
  // ---------------------------------------------------------------------------
  function scrEquip(b) {
    const M = SQ.M;
    if (!sel.char || !M.chars[sel.char]) {
      sel.char = (M.squad.lead && M.chars[M.squad.lead]) ? M.squad.lead : Object.keys(M.chars)[0] || null;
    }
    if (!sel.char) {
      b.appendChild(el('p', 'hint', 'Chưa có xác nào — quay ở Gacha Xác trước đã.'));
      return;
    }

    // — chọn xác —
    const pickRow = el('div', 'char-strip');
    SQ.CHARS.forEach(c => {
      if (!M.chars[c.id]) return;
      const t = el('div', 'chip' + (sel.char === c.id ? ' on' : ''), faceOf(c) + ' ' + c.name);
      t.style.borderColor = SQ.RARITY[c.star].color;
      on(t, 'click', () => { sel.char = c.id; UI.render(); });
      pickRow.appendChild(t);
    });
    b.appendChild(pickRow);

    const def = SQ.CHAR_BY_ID[sel.char];
    const own = M.chars[sel.char];
    const st = SQ.charStats(sel.char, M.tactics[sel.char]);

    // — giàn đồ: ba ô trái · xác · ba ô phải —
    const rig = el('div', 'eq-rig');
    const colL = el('div', 'eq-col'), colR = el('div', 'eq-col');
    const body = el('div', 'eq-body');
    body.style.setProperty('--hue', def.hue);
    body.style.borderColor = SQ.RARITY[def.star].color;
    body.innerHTML =
      '<div class="eb-f">' + faceOf(def) + '</div>' +
      '<div class="eb-n">' + def.name + '</div>' +
      '<div class="eb-s">' + '★'.repeat(def.star) + ' · Lv' + own.lv + '</div>' +
      '<div class="eb-p">⚡ ' + money(st.power) + '</div>';
    on(body, 'click', () => { sel.char2 = null; UI.go('squad'); });

    SQ.SLOTS.forEach((sl, i) => {
      const instId = own.equip && own.equip[sl.id];
      const it = instId ? SQ.itemById(instId) : null;
      const box = el('div', 'eqs' + (it ? '' : ' empty') + (sel.slot === sl.id ? ' sel' : ''));
      if (it) box.style.setProperty('--rc', SQ.RARITY[it.star].color);
      box.innerHTML =
        '<div class="eqs-i">' + sl.icon + '</div>' +
        (it ? '<div class="eqs-t">' + it.name + '</div>' +
              '<div class="eqs-v">' + SQ.STATS[it.main].short + ' ' + SQ.fmtStat(it.main, SQ.mainValue(it)) + '</div>' +
              '<div class="eqs-l">Lv' + it.lv + '</div>'
            : '<div class="eqs-n">' + sl.name + '</div><div class="eqs-t dim">trống</div>');
      if (it) box.style.borderColor = SQ.RARITY[it.star].color;
      on(box, 'click', () => {
        sel.slot = sl.id;
        if (it) showItem(it.id); else UI.render();
      });
      (i < 3 ? colL : colR).appendChild(box);
    });
    rig.appendChild(colL); rig.appendChild(body); rig.appendChild(colR);
    b.appendChild(rig);

    // — bảng chỉ số gọn —
    const bar = el('div', 'stat-bar');
    [['❤️', 'Máu', Math.round(st.hp)], ['⚔️', 'Sát thương', st.atk.toFixed(1)],
     ['📦', 'Sức mang', st.carry.toFixed(0) + 'kg'], ['🛡️', 'Giáp', (st.grit * 100).toFixed(0) + '%']]
      .forEach(([ic, name, v]) => {
        bar.appendChild(el('div', 'sb', '<i>' + ic + '</i><b>' + v + '</b><span>' + name + '</span>'));
      });
    b.appendChild(bar);

    if (st.sets.length) {
      const sb = el('div', 'setbox');
      st.sets.forEach(x => {
        const d = SQ.SET_BY_ID[x.id];
        sb.appendChild(el('div', 'setline', '<b>' + d.name + ' ' + x.n + ' món</b> — ' + (x.n === 2 ? d.d2 : d.d4)));
      });
      b.appendChild(sb);
    }

    // — kho đồ: lọc theo ô, xếp năm món mỗi hàng —
    const filters = el('div', 'filters');
    const all = el('div', 'chip' + (sel.slot ? '' : ' on'), 'Tất cả (' + M.inv.length + ')');
    on(all, 'click', () => { sel.slot = null; UI.render(); });
    filters.appendChild(all);
    SQ.SLOTS.forEach(sl => {
      const n = M.inv.filter(i => i.slot === sl.id).length;
      const c = el('div', 'chip' + (sel.slot === sl.id ? ' on' : ''), sl.icon + ' ' + sl.name + ' ' + n);
      on(c, 'click', () => { sel.slot = sl.id; UI.render(); });
      filters.appendChild(c);
    });
    b.appendChild(filters);

    const items = M.inv.filter(i => !sel.slot || i.slot === sel.slot)
      .sort((a, z) => (z.star - a.star) || (z.lv - a.lv) || (a.slot < z.slot ? -1 : 1));
    b.appendChild(el('h3', '', 'Kho đồ (' + items.length + ')'));
    if (!items.length) {
      b.appendChild(el('p', 'hint', 'Chưa có món nào ở đây — quay Gacha Trang Bị hoặc đi ca để nhặt.'));
      return;
    }
    const grid = el('div', 'inv-grid');
    items.forEach(it => {
      const wearer = SQ.equippedBy(it.id);
      const card = el('div', 'inv');
      card.style.setProperty('--rc', SQ.RARITY[it.star].color);
      card.style.borderColor = SQ.RARITY[it.star].color;
      card.innerHTML =
        '<div class="inv-star">' + '★'.repeat(it.star) + '</div>' +
        '<div class="inv-i">' + SQ.SLOT_BY_ID[it.slot].icon + '</div>' +
        '<div class="inv-n">' + it.name + '</div>' +
        '<div class="inv-lv">Lv' + it.lv + '</div>' +
        (it.lock ? '<div class="inv-lock">🔒</div>' : '') +
        (wearer ? '<div class="inv-on">' + faceOf(SQ.CHAR_BY_ID[wearer]) + '</div>' : '');
      on(card, 'click', () => showItem(it.id));
      grid.appendChild(card);
    });
    b.appendChild(grid);
  }

  // Cửa sổ chi tiết một món đồ: nâng cấp / lắp / tháo / khoá / phân rã.
  function showItem(instId) {
    const it = SQ.itemById(instId);
    if (!it) return;
    sel.item = instId;
    UI.popup(it.name, function (d) {
      const cost = SQ.upgradeCost(it);
      const wearer = SQ.equippedBy(it.id);
      const head = el('div', 'pop-item');
      head.style.setProperty('--rc', SQ.RARITY[it.star].color);
      head.style.borderColor = SQ.RARITY[it.star].color;
      head.innerHTML =
        '<div class="pi-i">' + SQ.SLOT_BY_ID[it.slot].icon + '</div>' +
        '<div class="pi-b"><div class="pi-s">' + '★'.repeat(it.star) + ' · ' + SQ.SLOT_BY_ID[it.slot].name +
          ' · Lv' + it.lv + '/' + SQ.EQUIP_MAX_LV + '</div>' +
        '<div class="pi-m">' + SQ.STATS[it.main].name + ' <b>' + SQ.fmtStat(it.main, SQ.mainValue(it)) + '</b></div>' +
        '<div class="pi-set">Bộ ' + SQ.SET_BY_ID[it.set].name + '</div></div>';
      d.appendChild(head);

      const subs = el('div', 'subs');
      it.subs.forEach(x => {
        subs.appendChild(el('div', 'sub' + (x.on ? '' : ' off'),
          SQ.STATS[x.k].name + ' ' + (x.on ? SQ.fmtStat(x.k, x.v) : '<span class="dim">khoá</span>')));
      });
      d.appendChild(subs);
      d.appendChild(el('div', 'det-lv', 'Nâng cấp: ' + SQ.WALLET_ICON.gold + money(cost.gold) + ' + ' +
        SQ.WALLET_ICON.core + cost.core + ' · mở dòng phụ ở cấp ' + SQ.SUB_UNLOCK_AT.join(', ')));

      const r1 = el('div', 'row');
      r1.appendChild(btn('Nâng cấp', '', () => {
        const r = SQ.upgradeItem(it.id);
        if (!r.ok) return UI.toast(r.why);
        UI.toast('Lên Lv' + r.lv + (r.unlocked ? ' · ' + SQ.STATS[r.unlocked.k].name + ' ' + SQ.fmtStat(r.unlocked.k, r.unlocked.v) : ''), true);
        showItem(instId); UI.render();
      }));
      r1.appendChild(btn('Nâng tối đa', 'ghost', () => {
        let n = 0;
        while (SQ.upgradeItem(it.id).ok) n++;
        UI.toast(n ? 'Nâng ' + n + ' cấp.' : 'Không đủ tài nguyên.', n > 0);
        showItem(instId); UI.render();
      }));
      d.appendChild(r1);

      const r2 = el('div', 'row');
      if (wearer === sel.char) {
        r2.appendChild(btn('Tháo ra', 'ghost', () => {
          SQ.unequip(sel.char, it.slot); UI.toast('Đã tháo.', true); showItem(instId); UI.render();
        }));
      } else {
        r2.appendChild(btn('Lắp cho ' + SQ.CHAR_BY_ID[sel.char].name, '', () => {
          SQ.equipItem(sel.char, it.id); UI.toast('Đã lắp.', true); showItem(instId); UI.render();
        }));
      }
      r2.appendChild(btn(it.lock ? '🔒 Bỏ khoá' : '🔓 Khoá', 'ghost tiny', () => {
        it.lock = !it.lock; SQ.save(); showItem(instId); UI.render();
      }));
      r2.appendChild(btn('Phân rã', 'ghost tiny danger', () => {
        const r = SQ.dismantle(it.id);
        if (!r.ok) return UI.toast(r.why || 'Không phân rã được.');
        UI.toast('Được ' + SQ.WALLET_ICON.core + r.core + ' và ' + SQ.WALLET_ICON.gold + money(r.gold), true);
        sel.item = null; UI.closePopup(); UI.render();
      }));
      d.appendChild(r2);
    });
  }

  // ---------------------------------------------------------------------------
  // TIẾN HOÁ
  // ---------------------------------------------------------------------------
  function scrEvol(b) {
    const M = SQ.M;
    const maxTotal = SQ.EVOL.reduce((n, e) => n + e.max, 0);
    const cur = SQ.evolTotal();
    const top = el('div', 'evo-top');
    top.innerHTML =
      '<div class="evo-tn">⚡ Lực chiến tổ <b>' + money(SQ.squadPower()) + '</b> · tiến hoá ' + cur + '/' + maxTotal + '</div>' +
      '<div class="evo-bar"><i style="width:' + (cur / maxTotal * 100) + '%"></i></div>';
    b.appendChild(top);
    b.appendChild(el('p', 'hint', 'Nâng ở đây cộng cho <b>cả năm người</b> trong tổ, kể cả xác quay được sau này. Bấm một ô để xem chi tiết.'));

    const grid = el('div', 'evo-grid');
    SQ.EVOL.forEach(e => {
      const lv = M.evol[e.id] || 0;
      const maxed = lv >= e.max;
      const cost = SQ.evolCost(e);
      const can = !maxed && SQ.can(cost);
      const c = el('div', 'evo' + (maxed ? ' maxed' : '') + (can ? ' can' : ''));
      c.innerHTML =
        '<div class="evo-i">' + e.icon + '</div>' +
        '<div class="evo-n">' + e.name + '</div>' +
        '<div class="evo-lv">' + lv + '/' + e.max + '</div>' +
        (maxed ? '<div class="evo-max">TỐI ĐA</div>'
               : '<div class="evo-c">' + SQ.WALLET_ICON.gold + money(cost.gold) + '</div>');
      on(c, 'click', () => showEvol(e.id));
      grid.appendChild(c);
    });
    b.appendChild(grid);
  }

  function showEvol(id) {
    const e = SQ.EVOL.find(x => x.id === id);
    if (!e) return;
    UI.popup(e.icon + ' ' + e.name, function (d) {
      const lv = SQ.M.evol[e.id] || 0;
      const maxed = lv >= e.max;
      const cost = SQ.evolCost(e);
      d.appendChild(el('div', 'det-sk', e.desc));
      d.appendChild(el('div', 'evo-bar', '<i style="width:' + (lv / e.max * 100) + '%"></i>'));
      d.appendChild(el('div', 'det-lv', 'Cấp ' + lv + '/' + e.max +
        (maxed ? '' : ' · cấp sau tốn ' + SQ.WALLET_ICON.gold + money(cost.gold))));
      if (maxed) { d.appendChild(el('div', 'evo-max', 'ĐÃ TỐI ĐA')); return; }
      const row = el('div', 'row');
      row.appendChild(btn('Nâng ' + SQ.WALLET_ICON.gold + money(cost.gold), '', () => {
        const r = SQ.evolUp(e.id);
        UI.toast(r.ok ? e.name + ' lên cấp ' + r.lv : r.why, r.ok);
        if (r.ok) showEvol(id);
        UI.render();
      }));
      row.appendChild(btn('Nâng tối đa', 'ghost', () => {
        let n = 0;
        while (SQ.evolUp(e.id).ok) n++;
        UI.toast(n ? 'Nâng ' + n + ' cấp.' : 'Không đủ vàng.', n > 0);
        showEvol(id); UI.render();
      }));
      d.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------------
  // GACHA
  // ---------------------------------------------------------------------------
  function scrGacha(b) {
    const tabs = el('div', 'tabs');
    ['char', 'equip'].forEach(id => {
      const t = el('button', 'tab' + (sel.banner === id ? ' on' : ''), SQ.GACHA[id].name);
      on(t, 'click', () => { sel.banner = id; UI.render(); });
      tabs.appendChild(t);
    });
    b.appendChild(tabs);

    const g = SQ.GACHA[sel.banner];
    const pity = SQ.M.pity[g.id];
    const box = el('div', 'banner');
    box.style.setProperty('--bc', g.color);
    box.innerHTML =
      '<div class="ban-t">' + g.name + '</div>' +
      '<div class="ban-d">' + g.desc + '</div>' +
      '<div class="ban-r">Tỉ lệ 5★ ' + (g.rate5 * 100).toFixed(1) + '% · 4★ ' + (g.rate4 * 100).toFixed(1) + '% · ' +
        'bảo hiểm 5★ sau <b>' + g.hard + '</b> lượt' + (g.soft < 900 ? ' (tăng dần từ lượt ' + g.soft + ')' : '') + '</div>' +
      '<div class="ban-p">Đã quay không ra 5★: <b>' + pity.c5 + '/' + g.hard + '</b> · 4★: ' + pity.c4 + '/' + g.pity4 + '</div>';
    b.appendChild(box);

    if (sel.banner === 'char') {
      const pool = el('div', 'pool');
      pool.appendChild(el('div', 'pool-t', 'Có thể ra:'));
      [5, 4, 3].forEach(star => {
        const names = SQ.CHARS.filter(c => c.star === star).map(c => {
          const owned = SQ.M.chars[c.id] ? '' : ' class="dim"';
          return '<span' + owned + '>' + faceOf(c) + c.name + '</span>';
        }).join(' ');
        pool.appendChild(el('div', 'pool-r', '<b style="color:' + SQ.RARITY[star].color + '">' + '★'.repeat(star) + '</b> ' + names));
      });
      b.appendChild(pool);
    }

    const row = el('div', 'row pull');
    row.appendChild(btn('Quay 1 · ' + SQ.WALLET_ICON.gem + g.costGem, '', () => doPull(g.id, 1, false)));
    row.appendChild(btn('Quay 10 · ' + SQ.WALLET_ICON.gem + money(g.costGem * 10), 'big', () => doPull(g.id, 10, false)));
    const tickets = SQ.M[g.ticket] || 0;
    row.appendChild(btn('Dùng vé (' + tickets + ')', 'ghost', () => {
      if (tickets < 1) return UI.toast('Hết vé.');
      doPull(g.id, tickets >= 10 ? 10 : 1, true);
    }));
    b.appendChild(row);
    b.appendChild(el('p', 'hint', 'Hết ngọc thì sang Cửa Hàng — ở đây "nạp" chỉ là bấm nút, không có cổng thanh toán nào cả.'));
  }

  function doPull(bannerId, n, ticket) {
    const r = SQ.pull(bannerId, n, ticket);
    if (!r.ok) return UI.toast(r.why);
    showPulls(r.items);
    UI.render();
  }

  function showPulls(items) {
    const ov = $('#modal');
    clear(ov);
    UI._closer = null;                   // bảng này có việc phải làm khi đóng — không cho bấm lệch
    ov.className = 'modal show';
    const card = el('div', 'mcard');
    card.appendChild(el('h3', '', 'Kết quả ' + items.length + ' lượt'));
    const g = el('div', 'pull-grid');
    items.forEach(it => {
      const star = it.star;
      const d = el('div', 'pcard s' + star);
      d.style.borderColor = SQ.RARITY[star].color;
      if (it.kind === 'char') {
        d.innerHTML = '<div class="pc-f">' + faceOf(it.char) + '</div><div class="pc-n">' + it.char.name + '</div>' +
          '<div class="pc-s">' + '★'.repeat(star) + '</div>' +
          '<div class="pc-t">' + (it.isNew ? '<b class="new">XÁC MỚI</b>' : '+' + it.shard + ' mảnh') + '</div>';
      } else {
        const item = it.item;
        d.innerHTML = '<div class="pc-f">' + SQ.SLOT_BY_ID[item.slot].icon + '</div><div class="pc-n">' + item.name + '</div>' +
          '<div class="pc-s">' + '★'.repeat(star) + '</div>' +
          '<div class="pc-t">' + SQ.STATS[item.main].short + ' ' + SQ.fmtStat(item.main, SQ.mainValue(item)) + '</div>';
      }
      g.appendChild(d);
    });
    card.appendChild(g);
    card.appendChild(btn('Xong', 'big', () => { ov.className = 'modal'; UI.render(); }));
    ov.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // CỬA HÀNG
  // ---------------------------------------------------------------------------
  function scrShop(b) {
    b.appendChild(el('div', 'fakebox', '⚠️ <b>Nạp ở đây là giả.</b> Không có cổng thanh toán, không mất tiền thật — bấm là ngọc vào ví. Đây là bản chơi thử của cơ chế nạp.'));

    const tick = el('div', 'stat-bar');
    [['ticketX', 'Vé Xác'], ['ticketE', 'Vé Đồ'], ['core', 'Lõi'], ['gem', 'Ngọc']].forEach(([k, name]) => {
      tick.appendChild(el('div', 'sb', '<i>' + SQ.WALLET_ICON[k] + '</i><b>' + money(SQ.M[k] || 0) + '</b><span>' + name + '</span>'));
    });
    b.appendChild(tick);

    b.appendChild(el('h3', '', 'Gói ngọc'));
    const g = el('div', 'pack-grid');
    SQ.PACKS.forEach(p => {
      const c = el('div', 'pack');
      c.innerHTML = '<div class="pk-n">' + p.name + (p.tag ? '<span class="pk-tag">' + p.tag + '</span>' : '') + '</div>' +
        '<div class="pk-g">💎 ' + money(p.gem) + (p.bonus ? ' <span class="bonus">+' + money(p.bonus) + '</span>' : '') + '</div>' +
        '<div class="pk-p">' + money(p.vnd) + 'đ</div>';
      on(c, 'click', () => {
        const r = SQ.buyPack(p.id);
        UI.toast('Đã cộng ' + money(r.gem) + ' ngọc (nạp giả).', true);
        UI.render();
      });
      g.appendChild(c);
    });
    b.appendChild(g);

    b.appendChild(el('h3', '', 'Đổi hằng ngày'));
    SQ.EXCHANGE.forEach(x => {
      const left = SQ.exchangeLeft(x);
      const got = ['gold', 'core', 'ticketX', 'ticketE'].filter(k => x[k])
        .map(k => SQ.WALLET_ICON[k] + money(x[k])).join(' ');
      const row = el('div', 'xrow');
      row.innerHTML = '<div class="x-g">' + got + '</div><div class="x-l">còn ' + left + '/' + x.limit + ' lượt</div>';
      row.appendChild(btn(SQ.WALLET_ICON.gem + x.gem, left > 0 ? '' : 'ghost', () => {
        const r = SQ.exchange(x.id);
        UI.toast(r.ok ? 'Đổi xong.' : r.why, r.ok);
        UI.render();
      }));
      b.appendChild(row);
    });
    if (SQ.M.counters.spendVnd > 0) {
      b.appendChild(el('p', 'hint', 'Tổng "đã nạp" (giả): ' + money(SQ.M.counters.spendVnd) + 'đ'));
    }
  }

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ
  // ---------------------------------------------------------------------------
  function scrQuest(b) {
    const q = SQ.questList();
    const tabs = el('div', 'tabs');
    [['daily', 'Hằng ngày'], ['weekly', 'Hằng tuần'], ['ach', 'Thành tựu']].forEach(([id, name]) => {
      const n = q[id].filter(x => x.done && !x.claimed).length;
      const t = el('button', 'tab' + (sel.questTab === id ? ' on' : ''), name + (n ? ' (' + n + ')' : ''));
      on(t, 'click', () => { sel.questTab = id; UI.render(); });
      tabs.appendChild(t);
    });
    b.appendChild(tabs);

    const any = q.daily.concat(q.weekly, q.ach).some(x => x.done && !x.claimed);
    if (any) b.appendChild(btn('Nhận tất cả', 'big', () => {
      const got = SQ.claimAll();
      UI.toast('Nhận: ' + Object.keys(got).map(k => SQ.WALLET_ICON[k] + money(got[k])).join(' '), true);
      UI.render();
    }));

    q[sel.questTab].forEach(x => {
      const row = el('div', 'quest' + (x.claimed ? ' claimed' : x.done ? ' done' : ''));
      row.innerHTML =
        '<div class="q-b"><div class="q-t">' + x.text + '</div>' +
        '<div class="q-bar"><i style="width:' + (x.cur / x.need * 100) + '%"></i></div>' +
        '<div class="q-p">' + money(x.cur) + '/' + money(x.need) + ' · ' + rewardText(x.r) + '</div></div>';
      row.appendChild(x.claimed ? el('div', 'q-ok', '✔')
        : btn(x.done ? 'Nhận' : '…', x.done ? '' : 'ghost', () => {
          const r = SQ.claimQuest(x.id);
          UI.toast(r.ok ? 'Đã nhận.' : 'Chưa xong.', r.ok);
          UI.render();
        }));
      b.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------------
  // HUD TRONG TRẬN
  // ---------------------------------------------------------------------------
  // HUD trong trận KHÔNG còn ở đây nữa: bộ máy repo2d tự vẽ nó lên canvas — hai cần
  // gạt, đèn pin, thanh chỉ tiêu, ba ô đồ, nút nhặt/chạy/tủ đồ, và nút kỹ năng mà
  // js/squad.js cắm vào. Giữ một bản HUD thứ hai ở đây là giữ một luật thứ hai.

  // Bảng kết ca — phá đảo map, hoặc bỏ ca giữa chừng.
  UI.showRunEnd = function (how, map, reward) {
    document.body.classList.remove('in-run');   // tu phong ho: goi tu dau cung phai ve duoc menu
    const ov = $('#modal');
    clear(ov);
    UI._closer = null;                   // "Về sảnh" còn phải chạy — không cho bấm lệch ra ngoài
    ov.className = 'modal show ' + (how === 'win' ? 'win' : 'lose');
    const card = el('div', 'mcard');
    card.appendChild(el('h3', '', how === 'win' ? '✔ Phá đảo ' + (map ? map.name : '') : 'Bỏ ca giữa chừng'));
    card.appendChild(el('div', 'mline', how === 'win'
      ? 'Hết tầng cuối. Cả tổ lên xe, mang theo tất cả những gì đã giao lên bệ.'
      : 'Ra sớm thì chỉ giữ được phần đã giao lên bệ.'));
    if (reward) {
      const got = Object.keys(reward).filter(k => reward[k])
        .map(k => SQ.WALLET_ICON[k] + money(reward[k])).join('  ');
      if (got) card.appendChild(el('div', 'det-lv', 'Nhận: ' + got));
    }
    card.appendChild(btn('Về sảnh', 'big', () => { ov.className = 'modal'; UI.go('home'); }));
    ov.appendChild(card);
  };

  // Nut BO CA tren thanh tren. SD.quit() truoc day khong co MOT cho goi nao: vao ca
  // roi thi duong ra duy nhat la choi het map hoac chet ca to - va ca to chet thi
  // bo may lai moi "Lam lai tu man 1" ngay tai tang do.
  const quitBtn = $('#btnQuitRun');
  if (quitBtn) quitBtn.onclick = () => {
    if (!SQ.squad || !SQ.squad.run()) return;
    UI.popup('Bỏ ca giữa chừng?', b => {
      b.appendChild(el('div', 'mline', 'Ra sớm thì chỉ giữ được phần đã giao lên bệ. Phần đang vác trên tay và trên xe đẩy mất hết.'));
      b.appendChild(btn('Bỏ ca', 'big', () => { UI.closePopup(); SQ.squad.quit(); }));
      b.appendChild(btn('Chơi tiếp', 'ghost', () => UI.closePopup()));
    });
  };

  UI.el = el; UI.btn = btn; UI.faceOf = faceOf;

})(window);
