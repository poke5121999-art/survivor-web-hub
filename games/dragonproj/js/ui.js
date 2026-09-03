/* ==========================================================================
 * UI — các màn hình ngoài trận và cầu nối HUD <-> js/game.js.
 * Bố cục bám theo bản gốc: thanh tiền tệ trên cùng, nội dung ở giữa, HÀNG NÚT
 * LỚN ở đáy. Trong trận thì giữa màn hình TRỐNG cho ngón cái.
 * ========================================================================== */
(function (G) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var S = null;            // save
  var battle = null;
  var screens, cur = 'home';
  var stage, hud;
  var selGear = null, gearFilter = 'weapon';

  /* --------------------------------------------------------- KHỞI ĐỘNG --- */
  function boot() {
    stage = $('stage'); hud = $('hud'); screens = $('screens');
    fit(); window.addEventListener('resize', fit);
    // Nạp bộ ảnh. Không chặn gì cả — thiếu ảnh thì game vẫn vẽ bằng hình học như
    // cũ, ảnh về tới đâu thì lên tới đó. Nhờ vậy thay art được từng phần.
    // Ảnh về sau, mà thanh nav thì dựng ngay từ đầu — nên phải vẽ lại nav khi ảnh
    // tới, nếu không nó đứng nguyên với emoji dự phòng suốt cả phiên.
    if (G.Atlas) G.Atlas.load('assets/asset-map.js', function () { repaintNav(); });
    S = G.load();
    if (!S) { S = G.starterKit(G.newSave('Hound')); G.save(S); }
    S.progress = S.progress || {};
    buildScreens();
    installDragEquip();
    show('home');
    tutWire(); tutStart();
    bindHud();
    if (window.DPBot) window.DPBot.attach(api);
  }

  // Khung 540x960 co lại vừa cửa sổ nhưng KHÔNG kéo méo — game dọc phải giữ tỉ lệ.
  function fit() {
    var k = Math.min(window.innerWidth / 540, window.innerHeight / 960);
    stage.style.transform = 'scale(' + k + ')';
  }

  function toast(txt, col) {
    var d = document.createElement('div');
    d.className = 'toast'; d.textContent = txt;
    if (col) d.style.borderColor = col, d.style.color = col;
    $('toasts').appendChild(d);
    setTimeout(function () { d.style.opacity = 0; d.style.transition = 'opacity .3s'; }, 1400);
    setTimeout(function () { d.remove(); }, 1750);
  }

  function save() { G.save(S); }
  function fmt(n) { return (n | 0).toLocaleString('vi-VN'); }
  /* Biểu tượng giao diện. Emoji trông lạc lõng cạnh pixel art — cùng một cái nút
     mà nửa trên là emoji bo tròn của hệ điều hành, nửa dưới là chữ của game. Nên
     mọi biểu tượng menu đều lấy từ chính kho sprite đang dùng.
     Thiếu ảnh thì trả về emoji dự phòng, không để trống. */
  function uiIcon(key, fallback, h) {
    var css = G.Atlas && G.Atlas.iconCss('ui.' + key, h || 22);
    return css ? '<i class="uicon" style="' + css + '"></i>'
               : '<span class="em">' + (fallback || '') + '</span>';
  }

  /* Biểu tượng vũ khí. Ảnh tra theo LỚP + HỆ, nên đổi bảng ảnh trong
     asset-map là cả giao diện đổi theo, không phải sửa từng chỗ ở đây.
     Chưa có ảnh thì trả chuỗi rỗng — mọi chỗ gọi đều chịu được. */
  function wIcon(g, cls) {
    if (!g || g.kind !== 'weapon' || !G.Atlas) return '';
    var src = G.Atlas.src('weapons.' + g.wclass + '.' + (g.el || 'none')) ||
              G.Atlas.src('weapons.' + g.wclass + '.none');
    return src ? '<img class="wicon ' + (cls || '') + '" src="' + src + '" alt="">' : '';
  }

  // Ba dáng ngắm, viết ra thành lời — người chơi phải biết TRƯỚC khi vào ải là
  // đòn này cần chỉ hướng, cần chỉ điểm rơi, hay bấm là xong.
  var AIM_VI = { self: 'bấm là xả tại chỗ', dir: 'kéo để chỉ hướng', point: 'kéo để chọn điểm rơi' };

  function rankChip(r) { return '<span class="rank rk-' + r + '">' + r + '</span>'; }
  function elemDot(el) {
    var E = G.ELEMENTS[el] || G.ELEMENTS.none;
    return '<i class="elem-dot" style="background:' + E.color + ';display:inline-block;vertical-align:-2px"></i>';
  }

  /* =========================================================== MÀN HÌNH === */
  function mkScreen(id, title, bodyHtml, showNav, showBack) {
    var d = document.createElement('div');
    d.className = 'screen'; d.id = 'scr-' + id;
    d.innerHTML =
      // Hàng trên cùng: đường ra Hub và nút nạp lại bản mới. Thiếu hai thứ này thì
      // người chơi vào game rồi không có cách nào quay lại danh sách game.
      '<div class="hubbar">' +
        '<a href="../../index.html">← Hub</a>' +
        '<button data-act="reload" title="Nạp lại bản mới">⟳</button>' +
        '<span class="ttl">' + title + '</span>' +
      '</div>' +
      '<div class="topbar">' +
        (showBack ? '<button class="back" data-back="1">‹</button>' : '') +
        '<div class="mechip" data-nav="more"><span class="av" id="me-av-' + id + '">🗡️</span>' +
          '<span><span class="nm" id="me-nm-' + id + '"></span>' +
          '<span class="pw" id="me-pw-' + id + '"></span></span></div>' +
        '<div class="cur" id="cur-' + id + '"></div>' +
      '</div>' +
      '<div class="body" id="body-' + id + '">' + (bodyHtml || '') + '</div>' +
      (showNav ? navHtml(id) : '');
    screens.appendChild(d);
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-back]'); if (b) { show('home'); return; }
      var r = e.target.closest('[data-act="reload"]');
      if (r) { save(); location.href = location.pathname + '?fresh=' + Date.now(); return; }
      var n = e.target.closest('[data-nav]'); if (n) { show(n.getAttribute('data-nav')); }
    });
    return d;
  }

  var NAV = [
    { id: 'home',   em: '🏰', n: 'Nhà' },
    { id: 'quest',  em: '🗺️', n: 'Ải' },
    { id: 'armory', em: '🛡️', n: 'Kho đồ' },
    { id: 'gacha',  em: '🔮', n: 'Triệu hồi' },
    { id: 'more',   em: '☰',  n: 'Khác' }
  ];
  /* Vẽ lại biểu tượng của mọi thanh nav đã dựng. Gọi khi bộ ảnh nạp xong. */
  function repaintNav() {
    [].forEach.call(document.querySelectorAll('.navbar'), function (bar) {
      [].forEach.call(bar.querySelectorAll('button[data-nav]'), function (btn) {
        var id = btn.getAttribute('data-nav');
        var css = G.Atlas && G.Atlas.iconCss('ui.' + id, 23);
        if (!css) return;
        var old = btn.querySelector('.em, .uicon');
        var im = document.createElement('i');
        im.className = 'uicon'; im.setAttribute('style', css);
        if (old) btn.replaceChild(im, old); else btn.insertBefore(im, btn.firstChild);
      });
    });
    var cur = document.querySelector('.screen.on');
    if (cur) show(cur.id.replace('scr-', ''));   // vẽ lại thân màn cho các icon khác
  }

  function navHtml(active) {
    return '<div class="navbar">' + NAV.map(function (x) {
      return '<button data-nav="' + x.id + '" class="' + (x.id === active ? 'on' : '') + '">' +
        uiIcon(x.id, x.em) + x.n + '</button>';
    }).join('') + '</div>';
  }

  function buildScreens() {
    mkScreen('home',   'HEILAND — Guild', '', true);
    mkScreen('quest',  'CHỌN ẢI', '', true);
    mkScreen('armory', 'KHO ĐỒ', '', true);
    mkScreen('gacha',  'TRIỆU HỒI', '', true);
    mkScreen('more',   'KHÁC', '', true);
    mkScreen('roster', 'NHÂN VẬT', '', true, true);
    mkScreen('gear',   'CHI TIẾT TRANG BỊ', '', false, true);
    mkScreen('evol',   'TIẾN HOÁ', '', false, true);
    mkScreen('shop',   'TIỆM', '', false, true);
    mkScreen('help',   'CÁCH CHƠI', '', false, true);
    mkScreen('bosslist','DANH SÁCH BEHEMOTH', '', false, true);
  }

  /* ===================== HƯỚNG DẪN CHO NGƯỜI MỚI ========================
   * Chạy theo NHỊP chứ không theo sự kiện. Mỗi 250ms hỏi lại ba câu: bước hiện
   * tại là gì, chỗ cần sáng đang ở toạ độ nào, và điều kiện sang bước sau đã
   * đủ chưa.
   *
   * Vì sao theo nhịp: chỗ cần khoét sáng nằm trong HTML do các hàm render dựng
   * lại liên tục (đổi màn, quay xong, mua xong). Bám vào một phần tử cụ thể thì
   * lần render sau nó là một đối tượng khác và cái lỗ trỏ vào hư không. Đo lại
   * mỗi nhịp thì cái lỗ tự bám theo, kể cả khi trang cuộn hay màn hình xoay.
   *
   * 250ms đủ nhanh để mắt không thấy trễ, đủ chậm để không tốn gì.
   * ==================================================================== */
  var tutTimer = null;

  /* Tìm chỗ cần khoét sáng TRONG MÀN ĐANG MỞ trước đã.
   *
   * Thanh nav có mặt ở MỌI màn — mỗi màn một bản sao. `document.querySelector`
   * trả về bản đầu tiên trong cây, mà bản đó thường nằm ở một màn đang ẩn: cái
   * lỗ khoét vào một phần tử có kích thước 0, và cú chạm của người chơi lên nút
   * thật thì không khớp với phần tử đang được theo dõi. Bước hướng dẫn đứng im
   * mãi mà không ai hiểu vì sao.
   *
   * Nên: tìm trong `.screen.on` trước, và chỉ tìm toàn cây khi không thấy (HUD
   * trong ải nằm ngoài mọi .screen). */
  function tutEl(step) {
    if (!step || !step.sel) return null;
    var live = document.querySelector('.screen.on');
    return (live && live.querySelector(step.sel)) || document.querySelector(step.sel);
  }

  function tutHide() {
    $('tutHole').classList.remove('on');
    $('tutBox').classList.remove('on');
    $('tutBlock').classList.remove('on');
  }

  /* Bước này có đang đúng lúc để hiện không?
   * Sai màn thì ẩn đi chứ KHÔNG tự chuyển màn hộ: người chơi có thể đang cố ý
   * đi xem chỗ khác, và kéo họ về là cướp mất quyền điều khiển. */
  function tutFits(step) {
    if (!step) return false;
    if (!step.scr) return true;
    if (step.scr === 'battle') return !!(battle && battle.running);
    return cur === step.scr && !(battle && battle.running);
  }

  function tutTick() {
    var step = G.tutStep(S);
    if (!step) { tutHide(); return; }
    if (!tutFits(step)) { tutHide(); return; }

    // điều kiện sang bước sau
    if (typeof step.next === 'function') {
      if (step.next(battle)) { G.tutAdvance(S); save(); tutTick(); return; }
    }

    var el = tutEl(step);
    if (step.sel && !el) { tutHide(); return; }   // chưa dựng xong thì chờ nhịp sau

    var hole = $('tutHole'), box = $('tutBox');
    $('tutBlock').classList.add('on');
    hole.classList.add('on');
    box.classList.add('on');

    /* Neo theo #stage, KHÔNG theo #frame.
     *
     * Ba phần tử của hướng dẫn nằm trong #stage, và #stage mới là cái bị CSS thu
     * phóng cho vừa màn hình (540x960 co về bề ngang thật). Đo theo #frame thì
     * lấy nhầm gốc toạ độ VÀ nhầm cả tỉ lệ: đo được nút ở y=747 mà cái lỗ hiện
     * ra ở y=638. Phải đo theo đúng phần tử mà cái lỗ đang neo vào.
     *
     * getBoundingClientRect trả về pixel MÀN HÌNH; style.left/top thì tính theo
     * hệ toạ độ CHƯA thu phóng của #stage. Nên phải chia lại cho tỉ lệ ấy. */
    var frEl = $('stage');
    var fbox = frEl.getBoundingClientRect();
    var k = fbox.width / (frEl.offsetWidth || fbox.width);
    var fr = { left: fbox.left, top: fbox.top,
               width: fbox.width / k, height: fbox.height / k };
    function toFrame(r) {
      return { left: (r.left - fbox.left) / k, top: (r.top - fbox.top) / k,
               width: r.width / k, height: r.height / k };
    }
    if (el) {
      var r = toFrame(el.getBoundingClientRect());
      hole.classList.remove('empty');
      hole.style.left = (r.left - 6) + 'px';
      hole.style.top = (r.top - 6) + 'px';
      hole.style.width = (r.width + 12) + 'px';
      hole.style.height = (r.height + 12) + 'px';
      // CẮT THẬT một lỗ trên lớp chặn, không chỉ vẽ sáng: xem chú thích ở CSS.
      var x0 = r.left - 6, y0 = r.top - 6, x1 = x0 + r.width + 12, y1 = y0 + r.height + 12;
      $('tutBlock').style.clipPath =
        'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' +
        x0 + 'px ' + y0 + 'px, ' + x0 + 'px ' + y1 + 'px, ' +
        x1 + 'px ' + y1 + 'px, ' + x1 + 'px ' + y0 + 'px, ' +
        x0 + 'px ' + y0 + 'px)';
    } else {
      $('tutBlock').style.clipPath = '';
      // Bước không chỉ vào nút nào (dạy cử chỉ trên sân): chỉ tối màn. Lỗ co về
      // một điểm ở giữa để bóng đổ phủ kín, và bỏ viền vì không có gì để viền.
      hole.classList.add('empty');
      hole.style.left = '50%'; hole.style.top = '50%';
      hole.style.width = '0px'; hole.style.height = '0px';
    }

    $('tutT').textContent = step.t;
    $('tutTip').textContent = step.tip || '';
    // Nút "Tiếp" chỉ hiện ở bước KHÔNG có việc gì phải làm. Bước có việc thì để
    // nút đó là cho người chơi một đường tắt bỏ qua chính cái mình đang dạy.
    $('tutOk').style.display = (step.next === 'ok') ? '' : 'none';

    /* Bảng chữ không được che mất chỗ đang sáng. Đặt dưới nếu lỗ ở nửa trên,
     * đặt trên nếu lỗ ở nửa dưới — và với bước dạy cử chỉ (không có lỗ) thì
     * luôn đặt trên, vì nửa dưới là chỗ ngón cái đang bận. */
    var mid = fr.height / 2;
    var hb = el ? toFrame(el.getBoundingClientRect()) : null;
    var holeMid = hb ? (hb.top + hb.height / 2) : fr.height * 0.75;
    var below = step.place === 'bottom' || (step.place !== 'top' && holeMid < mid);
    box.style.top = below ? (Math.min(fr.height - 150, holeMid + 70)) + 'px' : '';
    box.style.bottom = below ? '' : (fr.height - Math.max(150, holeMid - 60)) + 'px';
  }

  function tutStart() {
    if (tutTimer) clearInterval(tutTimer);
    tutTimer = setInterval(tutTick, 250);
    tutTick();
  }

  function tutWire() {
    $('tutSkip').onclick = function () {
      G.tutSkip(S); save(); tutHide();
      toast('Đã bỏ qua hướng dẫn — mở lại ở mục Khác', '#8fa3b5');
    };
    $('tutOk').onclick = function () { G.tutAdvance(S); save(); tutTick(); };
    /* Chạm vào chỗ ĐANG SÁNG cũng tính là xong bước. Bắt ở tầng document lúc
     * BUBBLE (không capture): để nút thật xử lý cú chạm của nó trước, rồi mới
     * sang bước sau — đảo thứ tự thì màn hình đổi trước khi nút kịp chạy. */
    document.addEventListener('click', function (e) {
      var step = G.tutStep(S);
      /* KHÔNG hỏi tutFits ở đây. Nút vừa bấm thường tự đổi màn, nên tới lượt ta
       * chạy thì `cur` đã là màn MỚI và tutFits trả về false — đúng cú chạm hợp
       * lệ nhất lại bị chính điều kiện ấy loại. Chỉ cần: bước đang chờ một cú
       * chạm, và cái vừa chạm khớp selector. */
      if (!step || step.next !== 'tap') return;
      /* So khớp theo SELECTOR, không theo phần tử.
       *
       * Trình nghe này chạy ở pha bubble, tức là SAU khi nút thật đã xử lý xong
       * cú chạm — mà việc nút làm thường là đổi màn. Lúc ta chạy thì `.screen.on`
       * đã là màn mới, nên tra lại phần tử cho ra một đối tượng KHÁC hẳn cái vừa
       * bị chạm, và phép so `el.contains(e.target)` không bao giờ đúng. Bước
       * hướng dẫn đứng im dù người chơi đã làm đúng.
       *
       * Hỏi thẳng "cái vừa chạm có khớp selector không" thì không phụ thuộc vào
       * việc màn hình đã đổi hay chưa. */
      if (e.target.closest && e.target.closest(step.sel)) {
        G.tutAdvance(S); save();
        setTimeout(tutTick, 60);
      }
    }, false);
  }

  function show(id) {
    cur = id;
    Array.prototype.forEach.call(screens.children, function (c) { c.classList.remove('on'); });
    var el = $('scr-' + id); if (!el) return;
    el.classList.add('on');
    hud.classList.remove('on');
    var rs = $('resultScr'); if (rs) rs.classList.remove('on');
    if (battle) { battle.stop(); battle = null; }
    screens.style.display = 'block';
    renderCur(id);
    ({ home: rHome, quest: rQuest, armory: rArmory, gacha: rGacha, more: rMore, roster: rRoster,
       gear: rGear, evol: rEvol, shop: rShop, help: rHelp, bosslist: rBossList }[id] || function () {})();
    // nav highlight
    var nb = el.querySelector('.navbar');
    if (nb) Array.prototype.forEach.call(nb.children, function (b) { b.classList.toggle('on', b.getAttribute('data-nav') === id); });
  }

  // Sức mạnh: một con số duy nhất gộp cả bộ đồ, để biết ngay là mình có khoẻ lên
  // sau khi nâng cấp hay không mà không phải mở bảng chỉ số.
  function powerOf() {
    var st = G.buildStats(S);
    return Math.round(st.hp * 0.5 + st.atk * 6 + st.def * 4 + st.edef * 1.2);
  }

  function renderCur(id) {
    var c = $('cur-' + id);
    // Avatar: chính sprite nhân vật đang chơi, không phải emoji con dao.
    var av = $('me-av-' + id);
    if (av && G.Atlas) {
      var acss = G.Atlas.iconCss('player.idle', 24);
      if (acss && av.getAttribute('data-spr') !== '1') {
        av.setAttribute('data-spr', '1'); av.textContent = '';
        av.className = 'av uicon'; av.setAttribute('style', acss);
      }
    }
    var nm = $('me-nm-' + id), pw = $('me-pw-' + id);
    if (nm) nm.textContent = S.name;
    if (pw) pw.textContent = 'Lv.' + S.lv + ' · ⚔ ' + fmt(powerOf());
    if (!c) return;
    /* HAI đồng tiền, và một con dấu. Bản trước có năm ô ở đây và không ai nhớ
     * nổi ô nào mua được gì. Lõi Rồng đứng cùng hàng vì nó là thứ người chơi
     * phải theo dõi để biết mình còn Tinh Luyện được hay không — nhưng nó không
     * mua được gì trong tiệm, nên nó không phải đồng tiền thứ ba. */
    c.innerHTML =
      '<b class="g">⬤ ' + fmt(S.gold) + '</b>' +
      '<b class="m">◈ ' + fmt(S.gem) + '</b>' +
      '<b class="d">◆ ' + fmt(S.core || 0) + '</b>';
  }
  function refresh() { renderCur(cur); }

  /* ------------------------------------------------------------- HOME ---- */
  /* Người giao việc ở guild. Lấy luôn từ dàn nhân vật Hololive — không phải NPC
     vô danh — nên tấm banner ở nhà và bộ mặt trong gacha là cùng một thế giới.
     Chọn CỐ ĐỊNH theo id nhiệm vụ, để mở đi mở lại vẫn là một người, không nhấp
     nháy đổi mặt mỗi lần vẽ lại. */
  var QUEST_NPC = ['Tokino Sora', 'Sakura Miko', 'Roboco-san', 'AZKi'];
  var QUEST_NPC_ID = ['sora', 'miko', 'roboco', 'azki'];
  function npcFace(seed) {
    var n = 0; seed = String(seed || '');
    for (var i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
    var id = QUEST_NPC_ID[n % QUEST_NPC_ID.length];
    var css = G.Atlas && G.Atlas.iconCss('heroes.' + id + '.idle', 38);
    return css ? '<i class="uicon hero" style="' + css + '"></i>' : uiIcon('npc', '👩');
  }

  function rHome() {
    var b = $('body-home');
    var area = G.areaById(S.area) || G.AREAS[0];
    var nx = G.nextStage(S);
    var nxBoss = G.behemothById(nx.boss);

    var html = '';
    // Sân guild: nhân vật đứng giữa, bốn lối tắt nổi ở bốn góc — đúng cách REPO
    // Squad xếp, vì nó để phần giữa cho thứ đáng nhìn và đẩy nút ra rìa.
    var partyNow = G.party(S).filter(Boolean);
    html += '<div class="home-hero"><canvas id="heroCv" width="300" height="250"></canvas>' +
            '<div class="lvchip">Lv. ' + S.lv + ' · ' + S.name + '</div>' +
            '<div class="area">' + area.n + '</div>' +
            '<div class="quick l">' +
              '<button data-act="evol">' + uiIcon('mats', '⚒️') + 'Tiến Hoá</button>' +
            '</div>' +
            '<div class="quick r">' +
              '<button data-act="shop">' + uiIcon('shop', '🛒') + 'Tiệm</button>' +
              '<button data-act="help">' + uiIcon('help', '❔') + 'Cách chơi</button>' +
            '</div>' +
            '<div class="power">' + (partyNow.length
              ? partyNow.map(function (h) {
                  var d = G.heroDef(h) || {};
                  return elemDot(d.el) + ' ' + (d.n || '').split(' ').pop();
                }).join(' · ')
              : 'Chưa có nhân vật nào') + '</div></div>';

    // Ải kế tiếp luôn nằm ngay đây: mở game lên là biết đi đâu, không phải nhớ.
    // Ảnh con trùm sắp gặp, ngay trên tấm banner: biết mặt nó trước khi vào ải.
    var nxIcon = (nxBoss && G.Atlas && G.Atlas.iconCss('bosses.' + nxBoss.body + '.idle', 40)) || '';
    html += '<div class="banner event"><div class="npc">' +
      (nxIcon ? '<i class="uicon" style="' + nxIcon + '"></i>' : '🗺️') + '</div><div class="t">' +
      '<span class="kind" style="color:#8fd4ff">ẢI KẾ</span> <b>' + nx.n + ' — ' + nx.sub + '</b>' +
      '<span>Lv.' + nx.lv + ' · dọn ' + nx.kills + ' quái · trùm ' +
      (nxBoss ? nxBoss.n + ' ' + nxBoss.rank : '?') + '</span></div>' +
      '<button class="btn go" data-act="hunt">ĐÁNH</button></div>';

    /* Tấm banner thứ hai: TIẾN HOÁ. Nó thay chỗ của tấm cốt truyện cũ, và đó là
     * một sự thay thế có chủ ý — cả hai đều trả lời câu "ngoài đi ải ra thì tôi
     * làm gì tiếp", nhưng cái này trả lời bằng một thứ vĩnh viễn thay vì bằng
     * một danh sách việc vặt. */
    var evTotal = G.evolTotal(S), evMax = G.EVOL.max * G.EVOL.tracks.length;
    html += '<div class="banner main"><div class="npc">' + npcFace('evol') + '</div><div class="t">' +
      '<span class="kind" style="color:#8ee8a8">TIẾN HOÁ</span> ' +
      '<b>' + evTotal + '/' + evMax + ' cấp</b><span>Nâng chỉ số gốc cho MỌI nhân vật — ' +
      'kể cả người quay được sau này.</span></div>' +
      '<button class="btn go" data-act="evol">MỞ</button></div>';

    // Gem đang có và nó quay được mấy lượt: câu hỏi mà người chơi gacha nào cũng
    // hỏi trước tiên, nên trả lời ngay ở màn đầu chứ không bắt bấm vào tiệm.
    html += '<div class="banner event"><div class="npc">🔮</div><div class="t">' +
      '<span class="kind" style="color:#8fd4ff">TRIỆU HỒI</span> <b>◈ ' + fmt(S.gem) + '</b>' +
      '<span>đủ ' + Math.floor(S.gem / G.REWARD.pull) + ' lượt quay đơn' +
      (S.gem >= G.REWARD.pull10 ? ' · quay được ' + Math.floor(S.gem / G.REWARD.pull10) + ' gói mười' : '') +
      '</span></div><button class="btn go" data-act="gacha">QUAY</button></div>';

    // Nút hành động chính, to hết bề ngang: vào thẳng ải kế tiếp, không bắt đi
    // vòng qua màn Ải. Kèm luôn số ải đã phá, để biết mình đang ở đâu trong 38 ải.
    var totalClear = G.STAGES.filter(function (s2) { return S.cleared[s2.id]; }).length;
    html += '<button class="cta" data-act="hunt">▶ VÀO ' + nx.n.toUpperCase() +
      '<small>' + nx.sub + ' · Lv.' + nx.lv + ' · đã phá ' + totalClear + '/' + G.STAGES.length + ' ải</small></button>';

    b.innerHTML = html;
    drawHero();
    b.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act');
      if (a === 'hunt') startStage(nx.id);
      else if (a === 'goQuest') show('quest');
      else if (a === 'evol') show('evol');
      else if (a === 'gacha') show('gacha');
      else if (a === 'shop') show('shop');
      else if (a === 'help') show('help');
    };
  }

  function drawHero() {
    var cv = $('heroCv'); if (!cv) return;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 300, 250);
    // Bục đứng + hai cột, để nhân vật không lơ lửng giữa một mảng đen như trước.
    ctx.save();
    ctx.fillStyle = 'rgba(90,120,160,.16)';
    ctx.beginPath(); ctx.ellipse(150, 208, 96, 26, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(120,150,190,.10)';
    ctx.beginPath(); ctx.ellipse(150, 204, 70, 18, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(140,170,210,.09)';
    ctx.fillRect(28, 40, 22, 170); ctx.fillRect(250, 40, 22, 170);
    ctx.fillRect(20, 30, 38, 14); ctx.fillRect(242, 30, 38, 14);
    ctx.restore();

    /* Sân guild đứng CẢ BA người trong đội, bằng chính ảnh dùng trong trận.
     * Người ở khe 1 đứng giữa và to hơn, hai người kia lùi ra sau và nhỏ lại —
     * đội hình là quyết định lớn nhất trước khi vào ải, nên nó phải là thứ nhìn
     * thấy đầu tiên khi mở game, không phải một dòng chữ.
     * Thiếu ảnh thì rơi về hình vẽ-bằng-code như trước. */
    var party = G.party(S).filter(Boolean);
    var SPOT = [{ x: 150, y: 176, s: 3.4, a: 1 },
                { x: 74,  y: 162, s: 2.5, a: 0.82 },
                { x: 226, y: 162, s: 2.5, a: 0.82 }];
    var drew = 0;
    party.slice(0, 3).forEach(function (h, i) {
      var d = G.heroDef(h); if (!d) return;
      var sp = SPOT[i], e = G.Atlas && G.Atlas.get('heroes.' + d.id + '.idle');
      ctx.save();
      ctx.globalAlpha = sp.a;
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y + 3, 15 * sp.s / 3, 5 * sp.s / 3, 0, 0, 6.2832); ctx.fill();
      if (e) {
        G.Atlas.draw(ctx, e, sp.x, sp.y, { ms: 1500 + i * 400, scale: sp.s * 34 / Math.max(1, e.h) });
        drew++;
      }
      ctx.restore();
    });

    if (!drew) {
      var eq = G.equipped(S), w = eq.weapons.filter(Boolean)[0];
      ctx.save(); ctx.translate(146, 166); ctx.scale(3.1, 3.1);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 2, 15, 5, 0, 0, 6.2832); ctx.fill();
      G.drawChar(ctx, {
        facing: -0.38, state: 'idle', moving: false, t: 1500, k: 0,
        body: G.bodyTint((eq.body || eq.head || eq.arm || eq.leg || {}).el || 'none'),
        hand: ['#f0d0b0', '#e8c098', '#d8a878', '#c08858', '#9a6a42', '#7a5030', '#5c3a22', '#f8e0c8'][S.skin || 2],
        hair: ['#2a2a2a', '#6a4a2a', '#c8a850', '#c04040', '#4060c0', '#40a060', '#a050c0', '#e8e8e8',
               '#f08040', '#40c0c0', '#8a5a3a', '#d8d040'][S.hairColor || 0],
        cloth: '#3b6ea5',
        weapon: w ? w.wclass : 'rifle',
        elem: G.ELEMENTS[(w && w.el) || 'none'].color,
        el: (w && w.el) || 'none'
      });
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------- ẢI ----- */
  /* Bản gốc đi map nối map qua cổng, boss thì phải quay gacha mới có. Ở đây gộp lại
   * thành một danh sách ải đánh số, mở dần theo chuỗi thẳng: dọn quái rồi trùm ra.
   * Nhìn là biết mình đang ở đâu và còn bao nhiêu ải nữa. (RESEARCH.md mục 13) */
  function rQuest() {
    var b = $('body-quest');
    var nx = G.nextStage(S);
    var html = '';

    G.AREAS.forEach(function (a) {
      var stages = a.stages;
      // Vùng chưa mở được ải nào thì chưa hiện — đổ cả 38 ải ra một lượt thì không
      // đọc nổi, mà cũng chẳng để làm gì.
      if (!G.stageOpen(S, stages[0])) return;
      var done = stages.filter(function (s2) { return S.cleared[s2.id]; }).length;
      html += '<div class="card"><div class="row"><h3 style="flex:1">' + a.vi +
        ' <span style="font-size:10px;color:#9fb2c4">' + a.n + '</span></h3>' +
        '<span style="font-size:11px;color:' + (done === stages.length ? '#3fd66a' : '#9fb2c4') + '">' +
        done + '/' + stages.length + ' ải</span></div>';
      stages.forEach(function (s2) {
        var open = G.stageOpen(S, s2), cleared = !!S.cleared[s2.id];
        var bd = G.behemothById(s2.boss);
        html += '<div class="stage' + (cleared ? ' done' : '') + (open ? '' : ' lock') +
          (s2 === nx ? ' next' : '') + '" data-stage="' + s2.id + '">' +
          '<div class="st-no">' + (open ? (cleared ? '✔' : s2.n.replace('Ải ', '')) : '🔒') + '</div>' +
          '<div class="st-t"><b>' + s2.sub + '</b><span>Lv.' + s2.lv + ' · dọn ' + s2.kills + ' quái · trùm ' +
            (bd ? bd.n + ' ' + rankChip(bd.rank) + ' ' + elemDot(bd.el) : '?') +
            ' · ' + (cleared ? '+' + G.REWARD.repeatGem(G.STAGES.indexOf(s2)) + ' ◈ cày lại'
                            : '+' + G.REWARD.firstGem(G.STAGES.indexOf(s2)) + ' ◈ LẦN ĐẦU') +
            '</span></div>' +
          '<div class="st-go">' + (open ? '▶' : '') + '</div></div>';
      });
      html += '</div>';
    });

    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-stage]');
      if (t) {
        var s2 = G.stageById(t.getAttribute('data-stage'));
        if (!s2) return;
        // Ải khoá phải NÓI vì sao, chứ không im lặng: nút không phản hồi luôn bị hiểu là nút hỏng.
        if (!G.stageOpen(S, s2)) { toast('Phá ải liền trước đã', '#c34141'); return; }
        startStage(s2.id); return;
      }
    };
  }

  function rwText(rw) {
    var p = [];
    if (rw.exp) p.push(rw.exp + ' EXP');
    if (rw.gold) p.push(fmt(rw.gold) + ' Gold');
    if (rw.gem) p.push(rw.gem + ' Gem');
    if (rw.core) p.push(rw.core + ' Lõi Rồng');
    return p.join(' · ');
  }

  /* ----------------------------------------------------------- ARMORY ----
   * Kho đồ giờ xoay quanh NGƯỜI, không xoay quanh cái túi.
   *
   *   [ đội hình: ba người, bấm để chọn người đang sửa ]   <- dính trên đầu
   *   [ năm ô trang bị CỦA NGƯỜI ĐÓ                    ]   <- dính trên đầu
   *   [ túi đồ                                          ]   <- cuộn
   *
   * Hai thẻ đầu dính (sticky) vì có kéo-thả: kéo một món từ dưới túi lên mà ô đã
   * trôi khỏi màn hình thì thao tác đó thành ra phải ngồi chờ cuộn.
   */
  var selHero = null;             // uid người đang sửa đồ

  function heroPortrait(h, px) {
    var d = G.heroDef(h); if (!d) return '';
    var css = G.Atlas && G.Atlas.iconCss('heroes.' + d.id + '.idle', px || 40);
    return css ? '<i class="uicon hero" style="' + css + '"></i>' : '';
  }

  function curHero() {
    var h = selHero ? G.heroOf(S, selHero) : null;
    if (!h) { h = G.party(S).filter(Boolean)[0] || (S.heroes || [])[0] || null; selHero = h ? h.uid : null; }
    return h;
  }

  var ASLOT_VI = { head: 'Đầu', body: 'Thân', arm: 'Tay', leg: 'Chân' };

  function rArmory() {
    var b = $('body-armory');
    var h = curHero();
    var d = G.heroDef(h);
    var eq = G.equippedOf(S, h);
    var st = G.buildStats(S, h);
    var html = '';

    /* --- đội hình + trang bị: một khối DÍNH trên đầu --- */
    html += '<div class="stickwrap"><div class="card party">' +
      '<div class="row"><h3 style="flex:1">Đội hình</h3>' +
      '<button class="btn sm" data-act="roster">Nhân vật</button></div>' +
      '<div class="grid3">';
    G.party(S).forEach(function (x, i) {
      var xd = G.heroDef(x);
      html += '<button class="hslot' + (x && h && x.uid === h.uid ? ' on' : '') + '" data-pslot="' + i + '">' +
        (xd ? heroPortrait(x, 38) + '<div class="nm">' + xd.n.split(' ').pop() + '</div>' +
              '<div class="sub">' + rankChip(xd.rank) + ' ' + G.weaponOf(xd.wclass).vi.split(' ')[0] +
              ' ' + elemDot(xd.el) + '</div>'
            : '<div class="nm" style="opacity:.4">Khe ' + (i + 1) + '</div><div class="sub">trống</div>') +
        '</button>';
    });
    html += '</div></div>';

    if (d) {
      html += '<div class="card gearbar"><div class="row" style="align-items:center;gap:8px">' +
        heroPortrait(h, 34) +
        '<h3 style="flex:1;margin:0">' + d.n + '</h3>' + rankChip(d.rank) + '</div>' +
        '<p class="hint" style="margin:4px 0 7px">' + G.weaponOf(d.wclass).vi + ' ' + elemDot(d.el) +
        ' · HP ' + fmt(st.hp) + ' · Công ' + fmt(st.atk) + ' · Thủ ' + fmt(st.def) + '</p>' +
        '<div class="eqrow">';
      html += '<button class="eqslot' + (eq.weapon ? '' : ' empty') + '" data-wslot="0">' +
        (eq.weapon ? wIcon(eq.weapon, 'top') : '<span class="lbl">Vũ khí</span>') +
        '<span class="tag">' + (eq.weapon ? rankChip(eq.weapon.rank) : G.weaponOf(d.wclass).vi.split(' ')[0]) + '</span></button>';
      ['head', 'body', 'arm', 'leg'].forEach(function (k) {
        var g = eq[k];
        html += '<button class="eqslot' + (g ? '' : ' empty') + '" data-aslot="' + k + '">' +
          '<span class="lbl">' + ASLOT_VI[k] + '</span>' +
          '<span class="tag">' + (g ? rankChip(g.rank) + ' Lv.' + g.lv : '—') + '</span></button>';
      });
      html += '</div></div></div>';
    } else {
      html += '</div><div class="empty-note">Chưa có nhân vật nào. Sang Triệu hồi.</div>';
    }

    /* --- túi đồ --- */
    html += '<div class="card"><h3>Túi đồ</h3>' +
      '<p class="hint" style="margin:-2px 0 6px">Giữ một món rồi kéo lên ô để lắp cho <b>' +
      (d ? d.n.split(' ').pop() : '—') + '</b> — hoặc bấm ô rồi bấm món.</p>' +
      '<div class="row" style="gap:5px;margin-bottom:7px">' +
      ['weapon', 'head', 'body', 'arm', 'leg'].map(function (k) {
        return '<button class="btn sm ' + (gearFilter === k ? 'pri' : '') + '" data-filter="' + k + '">' +
          { weapon: 'Vũ khí', head: 'Đầu', body: 'Thân', arm: 'Tay', leg: 'Chân' }[k] + '</button>';
      }).join('') + '</div><div class="grid2">';
    var list = S.gear.filter(function (g) { return g.kind === gearFilter; });
    if (!list.length) html += '<div class="empty-note" style="grid-column:1/-1">Chưa có món nào loại này.</div>';
    list.forEach(function (g) {
      // Vũ khí sai lớp thì làm mờ và nói rõ vì sao, chứ không im lặng từ chối
      // đúng lúc người ta đã kéo tới nơi.
      var fits = !h || G.canEquip(h, g);
      var hold = G.holderOf(S, g.uid);
      html += '<button class="item' + (g.kind === 'weapon' ? ' wpn' : '') + (fits ? '' : ' nofit') +
        '" data-gear="' + g.uid + '"><div class="corner">' + rankChip(g.rank) + '</div>' +
        wIcon(g) + '<div class="nm">' + g.name + '</div><div class="sub">' +
        (g.kind === 'weapon' ? G.weaponOf(g.wclass).vi + ' · ' + G.WTYPES[g.wtype].vi + ' ' + elemDot(g.el)
                             : 'Giáp ' + elemDot(g.defEl || 'none')) +
        '<br>Lv.' + g.lv + '/' + G.MAX_LV + (g.evo ? ' ·進' + g.evo : '') + lbDots(g) +
        (hold ? '<br><i style="color:#8fd4ff">đang ở ' + (G.heroDef(hold) || {}).n + '</i>' : '') +
        (fits ? '' : '<br><i style="color:#c98a8a">không hợp lớp</i>') +
        '</div>' + slotsHtml(g) + '</button>';
    });
    html += '</div></div>';
    html += '<div class="card"><div class="row"><span style="flex:1;font-size:11px">' +
      '<b style="color:#f2d24b">◆ Lõi Rồng ' + fmt(S.core || 0) + '</b><br>' +
      'Ra từ quay trúng thứ đã có. Tiêu vào Tinh Luyện đồ S/SS và Tiến Hoá.</span>' +
      '<button class="btn sm" data-act="evol">Tiến Hoá</button></div></div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { gearFilter = f.getAttribute('data-filter'); rArmory(); return; }
      var ev = e.target.closest('[data-act="evol"]');
      if (ev) { show('evol'); return; }
      var ac = e.target.closest('[data-act="roster"]');
      if (ac) { pendingPartySlot = -1; show('roster'); return; }
      var ps = e.target.closest('[data-pslot]');
      if (ps) {
        var pi = +ps.getAttribute('data-pslot');
        var hx = G.party(S)[pi];
        if (hx) { selHero = hx.uid; rArmory(); }
        else { pendingPartySlot = pi; show('roster'); }
        return;
      }
      var g = e.target.closest('[data-gear]');
      if (g) { selGear = g.getAttribute('data-gear'); show('gear'); return; }
      var ws = e.target.closest('[data-wslot]');
      if (ws) { gearFilter = 'weapon'; pendingSlot = { kind: 'weapon' };
                toast('Chọn một ' + (d ? G.weaponOf(d.wclass).vi : 'vũ khí') + ' trong túi'); rArmory(); return; }
      var as = e.target.closest('[data-aslot]');
      if (as) { gearFilter = as.getAttribute('data-aslot'); pendingSlot = { kind: as.getAttribute('data-aslot') };
                toast('Chọn một món trong túi để mặc'); rArmory(); return; }
    };
  }

  /* ------------------------------------------------- DANH SÁCH NHÂN VẬT -- */
  var pendingPartySlot = -1;

  function rRoster() {
    var b = $('body-roster');
    var party = (S.party || []).slice();
    var html = '<div class="card"><h3>Nhân vật đã có (' + (S.heroes || []).length + '/' + G.HEROES.length + ')</h3>' +
      '<p class="hint">' + (pendingPartySlot >= 0
        ? 'Chọn một người cho khe ' + (pendingPartySlot + 1) + '.'
        : 'Bấm một người để đưa vào đội hình; bấm người đang trong đội để bỏ ra.') +
      '</p></div><div class="grid2">';
    var RANKV = { SS: 0, S: 1, A: 2, B: 3 };
    (S.heroes || []).slice().sort(function (a, c) {
      var da = G.heroDef(a) || {}, dc = G.heroDef(c) || {};
      return (RANKV[da.rank] - RANKV[dc.rank]) || (da.n || '').localeCompare(dc.n || '');
    }).forEach(function (h) {
      var d = G.heroDef(h); if (!d) return;
      var inParty = party.indexOf(h.uid);
      var w = G.equippedOf(S, h).weapon;
      html += '<button class="item hero' + (inParty >= 0 ? ' on' : '') + '" data-hero="' + h.uid + '">' +
        '<div class="corner">' + rankChip(d.rank) + '</div>' +
        heroPortrait(h, 46) +
        '<div class="nm">' + d.n + '</div><div class="sub">' +
        G.weaponOf(d.wclass).vi + ' ' + elemDot(d.el) +
        '<br>' + (w ? w.name : '<i style="opacity:.6">chưa cầm gì</i>') +
        (inParty >= 0 ? '<br><b style="color:#f2c94b">Khe ' + (inParty + 1) + '</b>' : '') +
        (h.dupes ? '<br><i style="color:#8fd4ff">trùng x' + h.dupes + '</i>' : '') +
        '</div></button>';
    });
    html += '</div>';
    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-hero]'); if (!t) return;
      var uid = t.getAttribute('data-hero');
      var cur = S.party.indexOf(uid);
      if (cur >= 0) S.party[cur] = null;          // đang trong đội -> bỏ ra
      else {
        var slot = pendingPartySlot >= 0 ? pendingPartySlot : S.party.indexOf(null);
        if (slot < 0) slot = 0;
        S.party[slot] = uid;
        pendingPartySlot = -1;
      }
      selHero = uid;
      save(); rRoster(); refresh();
    };
  }

  var pendingSlot = null;

  /* ================= KÉO MỘT MÓN THẢ VÀO KHE ĐỂ TRANG BỊ =================
   *
   * Cách cũ vẫn còn: bấm khe → bấm món. Nhưng thao tác tự nhiên là bốc món lên
   * và thả vào chỗ, nên thêm hẳn đường đó.
   *
   * Ba chỗ dễ hỏng, xử lý luôn ở đây:
   *
   * 1. GIỮ RỒI MỚI KÉO. Túi đồ nằm trong một khung cuộn. Nếu bốc món ngay từ lúc
   *    ngón chạm xuống thì không ai cuộn được danh sách nữa. Nên phải GIỮ YÊN
   *    180ms mới vào chế độ kéo; nhúc nhích quá 10px trước đó là cuộn, bỏ kéo.
   * 2. KHÓA CUỘN LÚC ĐANG KÉO. Vào chế độ kéo là tắt cuộn của khung, nếu không
   *    ngón vừa kéo món vừa kéo cả trang.
   * 3. NUỐT CÚ CLICK SAU CÙNG. Thả tay xong trình duyệt vẫn bắn một `click` lên
   *    cái thẻ vừa kéo — không chặn là vừa lắp xong đã nhảy sang màn chi tiết.
   */
  var drag = null;

  function slotOf(el) {
    if (!el) return null;
    var w = el.closest('[data-wslot]');
    if (w) return { kind: 'weapon', i: +w.getAttribute('data-wslot'), el: w };
    var a = el.closest('[data-aslot]');
    if (a) return { kind: a.getAttribute('data-aslot'), el: a };
    return null;
  }

  function slotFits(slot, g) {
    if (!slot || !g) return false;
    if (slot.kind === 'weapon') return g.kind === 'weapon' && G.canEquip(curHero(), g);
    return slot.kind === g.kind;
  }

  function equipInto(g, slot) {
    var h = curHero();
    if (!h) { toast('Chưa có nhân vật nào', '#c34141'); return; }
    // Một món chỉ nằm ở MỘT người: G.equipOn tự gỡ nó khỏi người đang giữ.
    if (!G.equipOn(S, h, g)) {
      var d = G.heroDef(h) || {};
      toast((G.heroDef(h) || {}).n + ' chỉ cầm được ' + (G.weaponOf(d.wclass) || {}).vi, '#c34141');
      return;
    }
    pendingSlot = null;
    save(); toast('Đã lắp ' + g.name + ' cho ' + (G.heroDef(h) || {}).n, '#3fd66a');
    rArmory(); refresh();
  }

  function dragEnd(ok) {
    if (!drag) return;
    if (drag.timer) clearTimeout(drag.timer);
    if (drag.tick) clearInterval(drag.tick);
    if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    if (drag.body) drag.body.style.overflowY = '';
    var b = $('body-armory');
    [].forEach.call(b.querySelectorAll('.drop-ok,.drop-hot,.dragsrc'), function (e) {
      e.classList.remove('drop-ok', 'drop-hot', 'dragsrc');
    });
    // Nuốt cú click phát ra ngay sau khi thả tay — và CHỈ cú đó.
    // Cách cũ (đặt một cái cờ rồi chờ click tới xoá) sai kín đáo: nếu cú click
    // đó không bao giờ tới, cờ nằm lại và ăn mất cái chạm kế tiếp, ở bất kỳ đâu.
    // Nên gắn một cái bẫy dùng-một-lần rồi gỡ ngay ở cuối vòng lặp sự kiện:
    // click sau pointerup bắn ra ngay trong vòng đó, muộn hơn là không phải nó.
    if (drag.on) armSwallow();
    drag = null;
    if (ok) return;
  }

  function armSwallow() {
    var eat = function (e) { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', eat, true);
    setTimeout(function () { window.removeEventListener('click', eat, true); }, 0);
  }

  function installDragEquip() {
    var b = $('body-armory');
    if (!b || b._dragOn) return;
    b._dragOn = true;

    b.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var card = e.target.closest('[data-gear]');
      if (!card) return;
      var uid = card.getAttribute('data-gear');
      var g = S.gear.find(function (x) { return x.uid === uid; });
      if (!g) return;
      dragEnd();
      drag = { g: g, card: card, x: e.clientX, y: e.clientY, on: false, body: b, id: e.pointerId };
      drag.timer = setTimeout(function () { dragStart(e.clientX, e.clientY); }, 180);
    });

    b.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!drag.on) {
        // Chưa vào chế độ kéo mà ngón đã đi xa: người ta đang CUỘN, bỏ kéo.
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 10) dragEnd();
        return;
      }
      e.preventDefault();
      dragMove(e.clientX, e.clientY);
    }, { passive: false });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      b.addEventListener(ev, function (e) {
        if (!drag) return;
        if (!drag.on) { dragEnd(); return; }
        var slot = slotOf(document.elementFromPoint(e.clientX, e.clientY));
        var g = drag.g;
        var fits = slotFits(slot, g);
        dragEnd();
        if (fits) equipInto(g, slot);
        else if (slot) toast('Ô này không nhận món đó', '#c34141');
      });
    });

    // Cú click sinh ra ngay sau khi thả tay phải bị nuốt, nếu không vừa lắp xong
    // là nhảy luôn sang màn chi tiết món.
  }

  function dragStart(x, y) {
    if (!drag) return;
    drag.on = true;
    drag.body.style.overflowY = 'hidden';       // khoá cuộn trong lúc kéo
    drag.card.classList.add('dragsrc');
    var g = drag.g;
    // Sáng lên đúng những ô NHẬN được món này (ô vũ khí còn phải đúng lớp của
    // người đang chọn — sai lớp thì không sáng, khỏi kéo tới nơi mới biết).
    var b = $('body-armory');
    [].forEach.call(b.querySelectorAll('[data-wslot],[data-aslot]'), function (el) {
      if (slotFits(slotOf(el), g)) el.classList.add('drop-ok');
    });
    var gh = document.createElement('div');
    gh.className = 'dragghost';
    gh.innerHTML = wIcon(g) + '<span>' + rankChip(g.rank) + ' ' + g.name + '</span>';
    document.body.appendChild(gh);
    drag.ghost = gh;
    drag.tick = setInterval(dragTick, 24);
    dragMove(x, y);
  }

  function dragMove(x, y) {
    drag.lx = x; drag.ly = y;
    drag.ghost.style.left = x + 'px';
    drag.ghost.style.top = y + 'px';
    dragHover();
  }

  /* Cuộn mép + tô sáng khe đang chĩa vào.
   * Chạy trên ĐỒNG HỒ chứ không chỉ theo pointermove: khe trang bị nằm trên đầu
   * danh sách, muốn kéo món từ dưới túi lên thì phải giữ ngón ở mép trên cho nó
   * tự cuộn — mà giữ yên thì không có pointermove nào bắn ra cả. */
  function dragTick() {
    if (!drag || !drag.on) return;
    var b = drag.body, r = b.getBoundingClientRect(), y = drag.ly;
    var before = b.scrollTop;
    if (y < r.top + 52) b.scrollTop -= 12;
    else if (y > r.bottom - 52) b.scrollTop += 12;
    if (b.scrollTop !== before) dragHover();
  }

  function dragHover() {
    var b = drag.body;
    var hot = slotOf(document.elementFromPoint(drag.lx, drag.ly));
    [].forEach.call(b.querySelectorAll('.drop-hot'), function (e) { e.classList.remove('drop-hot'); });
    if (hot && hot.el.classList.contains('drop-ok')) hot.el.classList.add('drop-hot');
  }



  function lbDots(g) {
    var s = '<span class="lb">';
    for (var i = 0; i < 4; i++) s += '<i class="' + (i < g.lb ? 'on' : '') + '"></i>';
    return s + '</span>';
  }
  // Vũ khí giờ mang theo bộ kỹ năng của chính nó, nên thứ đáng xem trước ở một
  // món vũ khí là HAI ĐÒN đó, không phải mấy cái ô rỗng.
  function slotsHtml(g) {
    if (g.kind !== 'weapon') return '';
    var list = G.skillsOf(g.wclass), out = '<div class="slots">';
    list.forEach(function (sk, i) {
      var locked = i > 0 && g.lv < G.SKILL_RULES.unlockLv2;
      out += '<i class="slot ' + (locked ? 'locked' : '') + '" title="' + sk.n + '">' +
        (locked ? '🔒' : '◈') + '</i>';
    });
    return out + '</div>';
  }
  /* ---------------------------------------------------- CHI TIẾT TRANG BỊ */
  // Danh sách uid đang được chọn để nướng cho lần đột phá. Để ở ngoài hàm vì
  // rGear() vẽ lại sau mỗi lần bấm, và mất danh sách sau mỗi lần bấm thì không
  // ai chọn nổi tới món thứ hai.
  var fodderPick = [], fodderOwner = null;

  function rGear() {
    var g = S.gear.find(function (x) { return x.uid === selGear; });
    if (fodderOwner !== selGear) { fodderPick = []; fodderOwner = selGear; }
    var b = $('body-gear');
    if (!g) { b.innerHTML = '<div class="empty-note">Không tìm thấy món này.</div>'; return; }
    var gs = G.gearStats(g);
    var eq = G.equipped(S);
    var holder = G.holderOf(S, g.uid);
    var equipped = !!holder;

    var html = '<div class="card"><div class="row">' + wIcon(g, 'big') +
      '<h3 style="flex:1">' + g.name + '</h3>' + rankChip(g.rank) + '</div>';
    if (g.kind === 'weapon') {
      var Wd = G.weaponOf(g.wclass);
      html += '<p>' + Wd.vi + ' (' + Wd.jp + ') · loại <b style="color:' + G.WTYPES[g.wtype].color + '">' + G.WTYPES[g.wtype].vi + '</b> · ' +
        elemDot(g.el) + ' ' + G.ELEMENTS[g.el].vi + '</p>' +
        '<p><b>Giữ để dùng:</b> ' +
          (Wd.auto ? 'bắn liên tục' : Wd.charge ? 'nạp lực bốn nấc' : 'ghì súng cho chắc tay') +
        '</p><p>' + Wd.desc + '</p>' +
        '<div class="row wrap" style="font-size:12px;gap:14px"><span>⚔️ Vật lý <b>' + gs.patk + '</b></span>' +
        '<span>✨ Hệ <b>' + gs.eatk + '</b></span></div>';
      if (g.green) html += '<p style="color:#7fd07f;border:1px solid #2f6a3f;border-radius:6px;padding:5px;margin-top:6px">' + g.green + '</p>';
    } else {
      html += '<p>Giáp ' + { head: 'đầu', body: 'thân', arm: 'tay', leg: 'chân' }[g.kind] + ' · phòng hệ ' + elemDot(g.defEl || 'none') + '</p>' +
        '<div class="row wrap" style="font-size:12px;gap:12px"><span>❤️ <b>' + gs.hp + '</b></span>' +
        '<span>🛡️ <b>' + gs.pdef + '</b></span><span>✨ <b>' + gs.edef + '</b></span><span>⚔️ <b>' + gs.patk + '</b></span></div>';
    }
    html += '<div class="row" style="margin-top:8px;font-size:11px">Lv. <b>' + g.lv + '/' + G.MAX_LV + '</b>' +
      ' · Tiến hóa <b>' + g.evo + '/' + G.MAX_EVO + '</b> · Limit Break ' + lbDots(g) + '</div></div>';

    // Ability
    html += '<div class="card"><h3>Ability</h3>';
    g.abilities.forEach(function (a) {
      var def = G.ABILITIES.find(function (x) { return x.id === a.id; });
      html += '<p style="color:#f2c94b">• ' + (def ? def.vi.replace('{v}', a.v) : a.id) + '</p>';
    });
    var rc = G.rerollCost(g);
    html += '<button class="btn ' + (G.canPay(S, rc) ? '' : 'dis') + '" data-act="reroll">Đổi ability — ' + fmt(rc.gold) + ' Gold</button></div>';

    // Kỹ năng của vũ khí
    if (g.kind === 'weapon') {
      var sks = G.skillsOf(g.wclass);
      html += '<div class="card"><h3>Kỹ năng</h3><p>Hai đòn này gắn liền với loại vũ khí, ' +
        'không tháo lắp được. Đổi vũ khí là đổi hẳn cả hai. Trong trận: <b>hồi chiêu xong ' +
        'thì nút sáng — đặt ngón lên nút, kéo để chỉ hướng, thả ra là xả</b>. ' +
        'Không kéo thì tự ngắm con gần nhất.</p>';
      sks.forEach(function (sk, i) {
        var locked = i > 0 && g.lv < G.SKILL_RULES.unlockLv2;
        html += '<div class="row" style="margin-bottom:5px;opacity:' + (locked ? '.4' : '1') + '">' +
          '<span style="font-size:11px;flex:1"><b>' + sk.n + '</b>' +
          (locked ? ' <i style="color:#9fb2c4">— mở ở Lv.' + G.SKILL_RULES.unlockLv2 + '</i>' : '') +
          '<br><i style="color:#9fb2c4">' + sk.d + '</i>' +
          '<br><i style="color:#7f8fa0">' + AIM_VI[G.aimKindOf ? G.aimKindOf(sk) : 'dir'] +
          ' · hồi ' + (sk.cd / 1000).toFixed(0) + 's</i></span></div>';
      });
      var ef = G.ELEM_FX[g.el] || G.ELEM_FX.none;
      html += '<p style="border-top:1px dashed rgba(255,255,255,.12);margin-top:7px;padding-top:7px">' +
        'Hệ <b style="color:' + G.ELEMENTS[g.el].color + '">' + G.ELEMENTS[g.el].vi + '</b> đổi luôn ' +
        'hình dạng hiệu ứng: vệt <b>' + ef.trail + '</b> để lại dọc đường, và <b>' + ef.burst +
        '</b> bung ra chỗ lưỡi chạm.</p></div>';
    }

    /* BA BẬC NÂNG CẤP, và mỗi bậc tiêu một thứ khác nhau — đó là cái làm ba bậc
     * thành ba quyết định chứ không phải ba lần bấm cùng một nút.
     *   Nâng cấp   -> GOLD        (cày ải là ra)
     *   Đột phá    -> ĐỒ TRÙNG    (phải hy sinh món khác)
     *   Tinh luyện -> LÕI RỒNG    (chỉ có từ quay trúng thứ đã có)
     */
    var ec = G.enhanceCost(g), lc = G.limitBreakCost(g), vc = G.evolveCost(g);
    html += '<div class="card"><h3>Nâng cấp</h3>' +
      '<button class="btn ' + (g.lv < G.MAX_LV && G.canPay(S, ec) ? 'pri' : 'dis') + '" data-act="enhance" style="width:100%;margin-bottom:6px">' +
        (g.lv >= G.MAX_LV ? 'Lv.' + G.MAX_LV + '/' + G.MAX_LV + ' — đã tối đa'
                          : 'Nâng cấp → Lv.' + (g.lv + 1) + ' · ⬤ ' + fmt(ec.gold)) + '</button>';

    // ---- ĐỘT PHÁ: nướng đồ ----
    if (g.lb >= 4) {
      // Giữ nguyên `data-act` kể cả khi đã tối đa: nút vẫn nằm đúng chỗ đó trong
      // cây giao diện, và bấm vào thì hàm trả về một câu từ chối rõ ràng. Bỏ
      // hẳn thuộc tính đi thì bố cục nhảy một nấc mỗi lần lên tới trần.
      html += '<button class="btn dis" data-act="lb" style="width:100%;margin-bottom:6px">Đột phá 4/4 — đã tối đa</button>';
    } else {
      var pool = G.fodderFor(S, g);
      var need = lc.fodder;
      // Bỏ khỏi danh sách đã chọn những món vừa biến mất (đã nướng ở lần trước,
      // hoặc vừa được lắp lên người) — nếu không thì nút Đột phá sáng mà bấm vào
      // lại báo lỗi, và không ai đoán được vì sao.
      fodderPick = fodderPick.filter(function (u) {
        return pool.some(function (x) { return x.uid === u; });
      });
      html += '<div class="card sub"><div class="row"><b style="flex:1">Đột phá ' + (g.lb + 1) + '/4</b>' +
        '<span style="font-size:11px">⬤ ' + fmt(lc.gold) + '</span></div>' +
        '<p style="font-size:11px">Nướng <b>' + need.n + '</b> món hạng <b>' + need.rank +
        '</b> trở lên, chưa lắp lên ai. Đã chọn <b>' + fodderPick.length + '/' + need.n + '</b>.</p>';
      if (!pool.length) {
        html += '<p style="font-size:11px;color:#c98a8a">Không có món nào đủ điều kiện. ' +
          'Quay thêm, hoặc tháo bớt đồ khỏi nhân vật.</p>';
      } else {
        html += '<div class="row wrap" style="gap:5px">' + pool.slice(0, 40).map(function (x) {
          var on = fodderPick.indexOf(x.uid) >= 0;
          return '<button class="chip ' + (on ? 'on' : '') + '" data-fod="' + x.uid + '">' +
            rankChip(x.rank) + ' ' + x.name + (x.lv > 1 ? ' Lv' + x.lv : '') + '</button>';
        }).join('') + '</div>';
      }
      var canLB = fodderPick.length === need.n && S.gold >= lc.gold;
      html += '<button class="btn ' + (canLB ? 'pri' : 'dis') + '" data-act="lb" style="width:100%;margin-top:7px">' +
        'Đột phá — nướng ' + fodderPick.length + '/' + need.n + ' món</button></div>';
    }

    html += '<button class="btn ' + (G.canEvolve(g) && G.canPay(S, vc) ? 'pri' : 'dis') + '" data-act="evolve" style="width:100%;margin:6px 0">' +
        (G.canEvolve(g)
          ? 'Tinh luyện → Lv.1, chỉ số cao hơn · ⬤ ' + fmt(vc.gold) + ' + ' + vc.core + ' Lõi Rồng'
          : (g.rank === 'S' || g.rank === 'SS'
              ? (g.evo >= G.MAX_EVO ? 'Tinh luyện ' + g.evo + '/' + G.MAX_EVO + ' — đã tối đa'
                                    : 'Tinh luyện — cần Lv.' + G.MAX_LV + ' trước')
              : 'Tinh luyện — chỉ dành cho đồ hạng S và SS')) + '</button>' +
      '<div class="row"><button class="btn ' + (equipped ? 'dis' : 'go') + '" data-act="equip" style="flex:1">' +
        (equipped ? 'Đang ở ' + (G.heroDef(holder) || {}).n
                  : 'Trang bị cho ' + ((G.heroDef(curHero()) || {}).n || '—')) + '</button>' +
      '<button class="btn red" data-act="dismantle">Rã lấy Gold</button></div></div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var fd = e.target.closest('[data-fod]');
      if (fd) {
        var u = fd.getAttribute('data-fod'), k = fodderPick.indexOf(u);
        if (k >= 0) fodderPick.splice(k, 1);
        else if (fodderPick.length < G.breakFodder(g).n) fodderPick.push(u);
        else toast('Đã chọn đủ ' + G.breakFodder(g).n + ' món', '#8fa3b5');
        rGear(); return;
      }
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act');
      var r;
      if (a === 'enhance') r = G.enhance(S, g);
      else if (a === 'lb') {
        r = G.limitBreak(S, g, fodderPick.slice());
        if (r.ok) { toast('Đột phá ' + g.lb + '/4 — đã nướng ' + r.burned + ' món', '#3fd66a'); fodderPick = []; }
      }
      else if (a === 'evolve') r = G.evolve(S, g);
      else if (a === 'reroll') r = G.reroll(S, g);
      else if (a === 'equip') {
        var hh = curHero();
        if (!hh) { toast('Chưa có nhân vật nào', '#c34141'); return; }
        if (!G.equipOn(S, hh, g)) {
          toast((G.heroDef(hh) || {}).n + ' không cầm được món này', '#c34141'); return;
        }
        pendingSlot = null; r = { ok: true }; toast('Đã trang bị', '#3fd66a');
      } else if (a === 'dismantle') {
        r = G.dismantle(S, g);
        if (r.ok) { toast('Rã được ' + fmt(r.gold) + ' Gold', '#f2d24b'); fodderPick = []; save(); show('armory'); return; }
      }
      if (r && !r.ok) toast(r.why, '#c34141');
      save(); rGear(); refresh();
    };
  }

  /* --------------------------------------------------------- TRIỆU HỒI ---
   * BA BANNER, đúng cấu trúc Genshin. Toàn bộ luật nằm trong meta.js
   * (G.pull / G.ssRateNow / G.setFateTarget); màn này chỉ có một việc: làm cho
   * pity NHÌN THẤY ĐƯỢC.
   *
   * Đó không phải chi tiết trang trí. Một hệ pity mà người chơi không thấy thì
   * về mặt trải nghiệm nó không tồn tại — họ vẫn cảm thấy mỗi lượt quay là một
   * canh bạc độc lập, và cảm giác đó chính là cái mà pity sinh ra để chữa. Nên
   * ở đây hiện đủ ba con số: còn bao nhiêu lượt tới pity cứng, tỉ lệ SS THẬT của
   * lượt tiếp theo, và trạng thái bảo hiểm 50/50 hoặc Điểm Định Mệnh. */
  var gachaOut = '';        // HTML kết quả lần quay gần nhất
  var gachaTab = 'char';

  function bannerCard(bn) {
    var pity = G.pityOf(S, bn.id);
    var rate = G.ssRateNow(bn, pity);
    var left = Math.max(0, bn.hard - pity.n);
    var soft = pity.n + 1 > bn.soft;
    var featNames = (bn.featured || []).map(function (id) {
      if (bn.kind === 'hero') { var d = G.heroById(id); return d ? d.n : id; }
      var b2 = G.behemothById(id); return b2 ? b2.n : id;
    });

    var html = '<div class="gacha-hero"><b>' + bn.n + '</b><span>' + bn.d + '</span>' +
      '<div class="rate-tab">' +
        '<b style="color:#f2d24b">SS ' + (bn.rates.SS * 100).toFixed(1) + '%</b>' +
        '<b style="color:#f2a03c">S ' + (bn.rates.S * 100).toFixed(0) + '%</b>' +
        '<b style="color:#b06fd0">A ' + (bn.rates.A * 100).toFixed(0) + '%</b>' +
        '<b style="color:#5b8fd6">B ' + (bn.rates.B * 100).toFixed(0) + '%</b>' +
      '</div></div>';

    if (featNames.length) {
      html += '<div class="card"><h3 style="color:#f2d24b">Rate-up</h3><p>' +
        featNames.map(function (n) { return '<b>' + n + '</b>'; }).join(' · ') + '</p>';
      // Banner vũ khí: phải CHỌN mục tiêu trước, không thì Điểm Định Mệnh không
      // biết đang đếm cho cây nào.
      if (bn.fate) {
        html += '<p style="font-size:11px">Mục tiêu Điểm Định Mệnh — chọn một cây:</p><div class="row">' +
          bn.featured.map(function (id) {
            var b2 = G.behemothById(id);
            return '<button class="btn sm ' + (pity.target === id ? 'pri' : '') +
              '" data-fate="' + id + '" style="flex:1">' + (b2 ? b2.n : id) + '</button>';
          }).join('') + '</div>' +
          '<p style="font-size:11px;color:' + (pity.fate ? '#3fd66a' : '#9fb2c4') + '">' +
          'Điểm Định Mệnh <b>' + pity.fate + '/1</b>' +
          (pity.fate >= 1 ? ' — lần SS tới CHẮC CHẮN trúng cây đã chọn' : ' — trượt một lần là lần sau chắc trúng') +
          '</p>';
      }
      if (bn.fifty) {
        html += '<p style="font-size:11px;color:' + (pity.guar ? '#3fd66a' : '#9fb2c4') + '">' +
          (pity.guar ? '<b>Bảo hiểm đang bật</b> — lần SS tới chắc chắn là người rate-up'
                     : 'Lần SS tới là 50/50. Thua thì lần sau chắc chắn trúng.') + '</p>';
      }
      html += '</div>';
    }

    html += '<div class="card"><div class="row">' +
      '<span style="flex:1;font-size:11px">Đã quay <b>' + pity.n + '</b> lượt không ra SS<br>' +
      '<span style="color:' + (soft ? '#3fd66a' : '#9fb2c4') + '">Tỉ lệ SS lượt tới: <b>' +
        (rate * 100).toFixed(1) + '%</b>' + (soft ? ' (đang tăng)' : '') + '</span><br>' +
      '<span style="color:#f2d24b">Còn <b>' + left + '</b> lượt là chắc chắn ra SS</span></span></div>' +
      '<div class="pitybar"><i style="width:' + Math.min(100, pity.n / bn.hard * 100) + '%"></i>' +
        '<u style="left:' + (bn.soft / bn.hard * 100) + '%"></u></div>' +
      '<div class="row" style="margin-top:8px">' +
      '<button class="btn ' + (S.gem >= G.REWARD.pull ? 'pri' : 'dis') + '" data-pull="1" style="flex:1">Quay 1 — ◈ ' + fmt(G.REWARD.pull) + '</button>' +
      '<button class="btn ' + (S.gem >= G.REWARD.pull10 ? 'pri' : 'dis') + '" data-pull="10" style="flex:1">Quay 10 — ◈ ' + fmt(G.REWARD.pull10) + '</button>' +
      '</div><p style="font-size:11px">Đang có <b style="color:#8fd4ff">◈ ' + fmt(S.gem) + '</b>. ' +
      'Gem đến từ <b>phá ải</b> — lần đầu trả đậm, cày lại trả nhỏ giọt.</p></div>';
    return html;
  }

  function pullRow(x) {
    var css = '', sub = '';
    if (x.kind === 'hero') {
      var d = G.heroById(x.id) || {};
      css = G.Atlas && G.Atlas.iconCss('heroes.' + x.id + '.idle', 34);
      sub = (G.weaponOf(d.wclass) || {}).vi + ' ' + elemDot(d.el);
    } else {
      sub = kindVi(x.gkind) + (x.wclass ? ' · ' + (G.weaponOf(x.wclass) || {}).vi : '') +
            ' ' + elemDot(x.el || 'none');
    }
    return '<div class="row" style="font-size:11px;padding:3px 0;align-items:center;gap:7px">' +
      (css ? '<i class="uicon hero" style="' + css + '"></i>' : '') +
      '<span style="flex:1">' + rankChip(x.rank) + ' <b>' + x.name + '</b>' +
      (x.up ? ' <b style="color:#f2d24b">RATE-UP</b>' : '') +
      '<br><span style="color:#9fb2c4">' + sub + '</span></span>' +
      (x.dupe ? '<b style="color:#f2d24b">trùng · +' + x.cores + ' Lõi</b>'
       : x.spare ? '<b style="color:#8fa3b5">ĐỒ THỪA</b>'
       : '<b style="color:#3fd66a">MỚI</b>') + '</div>';
  }

  function rGacha() {
    var b = $('body-gacha');
    var bn = G.bannerById(gachaTab);
    var html = '<div class="tabrow">' + G.BANNERS.map(function (x) {
      return '<button class="tab ' + (x.id === gachaTab ? 'on' : '') + '" data-tab="' + x.id + '">' + x.vi + '</button>';
    }).join('') + '</div>';
    html += bannerCard(bn);
    html += '<div class="card"><div class="row">' +
      '<span style="flex:1;font-size:11px">Lõi Rồng <b style="color:#f2d24b">' + fmt(S.core || 0) + '</b> — ' +
      'ra từ quay trúng thứ <b>đã có</b>. Tiêu vào <b>Tinh Luyện</b> đồ S/SS và <b>Tiến Hoá</b>.</span>' +
      '<button class="btn sm" data-act="evol">Tiến Hoá</button></div></div>';
    html += '<div class="card"><button class="btn" data-act="roster" style="width:100%">Nhân vật đã có — ' +
      (S.heroes || []).length + '/' + G.HEROES.length + '</button>' +
      '<button class="btn" data-act="bosslist" style="width:100%;margin-top:6px">Xem toàn bộ ' +
      G.BEHEMOTHS.length + ' Behemoth</button></div>';
    html += '<div id="gachaOut">' + gachaOut + '</div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-tab],[data-pull],[data-fate],[data-act]'); if (!t) return;
      if (t.hasAttribute('data-tab')) { gachaTab = t.getAttribute('data-tab'); gachaOut = ''; rGacha(); return; }
      if (t.hasAttribute('data-fate')) { G.setFateTarget(S, t.getAttribute('data-fate')); save(); rGacha(); return; }
      if (t.hasAttribute('data-pull')) {
        var n = +t.getAttribute('data-pull');
        var r = G.pull(S, gachaTab, n);
        if (!r.ok) { toast(r.why, '#c34141'); return; }
        var cores = r.results.reduce(function (a, x) { return a + (x.dupe ? x.cores : 0); }, 0);
        gachaOut = '<div class="card"><h3>Kết quả — ' + r.banner.vi + '</h3>' +
          r.results.map(pullRow).join('') +
          (cores ? '<p style="margin-top:6px;color:#f2d24b">Tổng +' + cores + ' Lõi Rồng.</p>' : '') +
          '<button class="btn pri" data-act="roster" style="width:100%;margin-top:7px">Xem và xếp đội hình</button></div>';
        save(); rGacha(); refresh(); return;
      }
      var a = t.getAttribute('data-act');
      if (a === 'roster') show('roster');
      else if (a === 'bosslist') show('bosslist');
      else if (a === 'evol') show('evol');
    };
  }

  /* ------------------------------------------------------------ TIẾN HOÁ -
   * Bốn nhánh, mỗi nhánh 15 cấp, cộng phần trăm vào CHỈ SỐ GỐC của MỌI nhân vật.
   *
   * Màn này tồn tại vì một lý do rất cụ thể: gacha ra người, và không có nó thì
   * mọi người mới quay được đều yếu hơn người đang dùng — nên người chơi học
   * được đúng một bài, là đừng bao giờ đổi người. */
  function rEvol() {
    var b = $('body-evol');
    var total = G.evolTotal(S), max = G.EVOL.max * G.EVOL.tracks.length;
    var st = G.buildStats(S);
    var html = '<div class="card"><h3>Tiến Hoá — ' + total + '/' + max + ' cấp</h3>' +
      '<p>Cộng thẳng vào <b>chỉ số gốc</b> của <b>mọi nhân vật</b>, kể cả người quay được sau này. ' +
      'Đây là lý do một người mới về không phải là một bước lùi.</p>' +
      '<div class="row wrap" style="font-size:12px;gap:14px">' +
      '<span>❤️ <b>' + fmt(st.hp) + '</b></span><span>⚔️ <b>' + fmt(st.atk) + '</b></span>' +
      '<span>🛡️ <b>' + fmt(st.def) + '</b></span><span>✨ <b>' + fmt(st.edef) + '</b></span>' +
      '</div></div>';

    G.EVOL.tracks.forEach(function (t) {
      var lv = G.evolLv(S, t.id), c = G.evolCost(S, t.id);
      var can = c && G.canPay(S, c);
      html += '<div class="card"><div class="row"><h3 style="flex:1;color:' + t.col + '">' + t.n + '</h3>' +
        '<b style="color:' + t.col + '">Lv.' + lv + '/' + G.EVOL.max + '</b></div>' +
        '<p>' + t.d + ' Hiện tại <b style="color:' + t.col + '">+' +
        (t.per * lv * 100).toFixed(1) + '%</b>.</p>' +
        '<div class="evolbar">';
      for (var i = 0; i < G.EVOL.max; i++) {
        html += '<i class="' + (i < lv ? 'on' : '') + '" style="' +
          (i < lv ? 'background:' + t.col : '') + '"></i>';
      }
      html += '</div>';
      if (!c) {
        html += '<button class="btn dis" style="width:100%;margin-top:7px">Đã tối đa</button>';
      } else {
        html += '<button class="btn ' + (can ? 'pri' : 'dis') + '" data-evol="' + t.id + '" style="width:100%;margin-top:7px">' +
          'Lên Lv.' + (lv + 1) + ' — ⬤ ' + fmt(c.gold) +
          (c.core ? ' + ' + c.core + ' Lõi Rồng' : '') + '</button>';
        if (c.core) html += '<p style="font-size:11px;color:#f2d24b">Cứ 5 cấp cần thêm Lõi Rồng — đang có <b>' +
          fmt(S.core || 0) + '</b>.</p>';
      }
      html += '</div>';
    });

    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-evol]'); if (!t) return;
      var r = G.evolUp(S, t.getAttribute('data-evol'));
      if (!r.ok) { toast(r.why, '#c34141'); return; }
      toast('Tiến Hoá lên Lv.' + r.lv, '#3fd66a');
      save(); rEvol(); refresh();
    };
  }

  /* -------------------------------------------------------------- TIỆM ---
   * Tiệm chỉ tiêu GOLD. Banner gacha nằm ở màn Triệu Hồi và chỉ tiêu GEM —
   * hai đồng tiền, hai màn hình, không có chỗ nào lẫn. */
  function rShop() {
    var b = $('body-shop');
    var html = '<div class="card"><h3>Hai đồng tiền</h3>' +
      '<div class="upgrow"><b style="color:#f2d24b">⬤ Gold</b><span>Nâng cấp trang bị, Tiến Hoá, mua bình. ' +
      'Ra từ quái, rương, điểm khai thác và thưởng ải.</span></div>' +
      '<div class="upgrow"><b style="color:#8fd4ff">◈ Gem</b><span>CHỈ để quay ở màn Triệu Hồi. ' +
      'Ra từ phá ải — lần đầu trả đậm, cày lại trả nhỏ giọt.</span></div>' +
      '<p style="color:#9fb2c4">Đổi được MỘT CHIỀU: gem sang gold, không bao giờ ngược lại. ' +
      'Hai đồng tiền mà đổi qua đổi lại tự do thì thật ra chỉ có một.</p></div>';

    /* ---------------------------- QUẦY NẠP ------------------------------
     * Tiền GIẢ. Nói thẳng điều đó ngay dòng đầu, to và rõ, chứ không giấu ở
     * chân màn hình: một quầy nạp trông y như thật mà không nói mình là giả thì
     * đó là một cái bẫy, kể cả khi không ai mất đồng nào.
     *
     * Vẫn dựng đúng hình dạng của một quầy thật — bậc thang, nhãn "×2 LẦN ĐẦU",
     * gói to lời hơn gói nhỏ — vì cái hình dạng ấy chính là thứ đáng nhìn thấy.
     * In luôn "bằng mấy lượt quay" bên dưới mỗi gói: đó là con số duy nhất có
     * nghĩa với người chơi, còn "980 gem" thì không nói lên điều gì. */
    html += '<div class="card"><h3>Quầy Nạp <span style="color:#ff7a3c">— TIỀN GIẢ</span></h3>' +
      '<p style="color:#9fb2c4">Không có cổng thanh toán nào và không có đồng nào đổi chủ. ' +
      'Bấm là cộng thẳng vào ví. Quầy này để <b>thử game cho nhanh</b>, và để nhìn thấy ' +
      'cái giá thật của mô hình quay số.</p>';
    G.IAP.gem.forEach(function (pk) {
      var first = G.iapFirst(S, pk.id);
      var got = pk.gem * (first ? G.IAP.firstBonus : 1);
      var pulls = Math.floor(got / G.REWARD.pull);
      html += '<div class="row" style="margin-bottom:5px">' +
        '<span style="flex:1;font-size:11px"><b>' + pk.n + '</b>' +
        (first ? ' <span style="color:#f2d24b">×2 LẦN ĐẦU</span>' : '') +
        // "đủ 0 lượt quay" đọc như một lỗi, mà nó là sự thật đáng nói nhất trên
        // cả bảng này: gói một đô KHÔNG mua nổi một lượt quay. Viết thành chữ
        // để nó đọc ra đúng cái nó là.
        '<br><span style="font-size:9.5px;color:#9fb2c4">◈ ' + fmt(got) +
        (pulls ? ' — đủ <b>' + pulls + '</b> lượt quay'
               : ' — <b style="color:#ff7a3c">chưa đủ một lượt quay</b>') + '</span></span>' +
        '<button class="btn sm pri" data-iap="' + pk.id + '">$' + pk.usd.toFixed(2) + '</button></div>';
    });
    html += '<div class="line" style="margin-top:8px"><span style="font-size:9.5px;color:#8fa3b5">' +
      'Gói bé nhất 60,6 gem/$1, gói to nhất 68,0 gem/$1 — lời hơn 12%. Bậc thang đó là ' +
      'thứ mọi quầy nạp thật đều có.</span></div></div>';

    /* Gold mua bằng GEM, không bằng tiền. Giữ nguyên luật một chiều của game. */
    html += '<div class="card"><h3>Đổi Gem lấy Gold</h3>' +
      '<p style="color:#9fb2c4">Một chiều: gem đi được sang gold, gold không bao giờ đi ngược lại. ' +
      'Có đường ngược thì hai đồng tiền thật ra chỉ là một.</p>';
    G.IAP.gold.forEach(function (pk) {
      var first = G.iapFirst(S, pk.id);
      var got = pk.gold * (first ? G.IAP.firstBonus : 1);
      var ok = S.gem >= pk.gem;
      html += '<div class="row" style="margin-bottom:5px">' +
        '<span style="flex:1;font-size:11px"><b>' + pk.n + '</b>' +
        (first ? ' <span style="color:#f2d24b">×2 LẦN ĐẦU</span>' : '') +
        '<br><span style="font-size:9.5px;color:#9fb2c4">⬤ ' + fmt(got) + '</span></span>' +
        '<button class="btn sm ' + (ok ? '' : 'dis') + '" data-iap="' + pk.id + '">◈ ' + fmt(pk.gem) + '</button></div>';
    });
    html += '</div>';

    html += '<div class="card"><h3>Bình (Potion)</h3><p>Loại thường 30 phút, loại cao cấp 60 phút và có cả ba hiệu ứng.</p>';
    Object.keys(G.ITEMS).forEach(function (id) {
      var it = G.ITEMS[id], have = S.inv[id] || 0;
      var active = (S.potions[id] || 0) > Date.now();
      var ok = S.gold >= it.price.gold;
      html += '<div class="row" style="margin-bottom:5px"><span style="flex:1;font-size:11px">' + it.vi + ' <b>×' + have + '</b>' +
        (active ? ' <span style="color:#3fd66a">(đang bật)</span>' : '') +
        '<br><span style="font-size:9.5px;color:#9fb2c4">' + it.n + '</span></span>' +
        '<button class="btn sm ' + (ok ? '' : 'dis') + '" data-buy="' + id + '">⬤ ' + fmt(it.price.gold) + '</button>' +
        '<button class="btn sm ' + (have ? 'pri' : 'dis') + '" data-use="' + id + '">Dùng</button></div>';
    });
    html += '</div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-buy],[data-use],[data-iap]'); if (!t) return;
      if (t.hasAttribute('data-iap')) {
        var r2 = G.iapBuy(S, t.getAttribute('data-iap'));
        if (!r2.ok) { toast(r2.why, '#c34141'); return; }
        toast((r2.kind === 'gem' ? '◈ +' : '⬤ +') + fmt(r2.got) +
              (r2.first ? '  (×2 lần đầu)' : ''), '#3fd66a');
        save(); rShop(); refresh();
        return;
      }
      if (t.hasAttribute('data-buy')) {
        var id = t.getAttribute('data-buy'), P = G.ITEMS[id];
        if (S.gold < P.price.gold) { toast('Không đủ Gold', '#c34141'); return; }
        S.gold -= P.price.gold; S.inv[id] = (S.inv[id] || 0) + 1;
        S.stats.buys++; G.track(S, { buy: 1 });
        toast('Đã mua ' + P.vi, '#3fd66a');
      } else {
        var r = G.usePotion(S, t.getAttribute('data-use'));
        if (!r.ok) toast(r.why, '#c34141'); else { G.track(S, { potion: 1 }); toast('Đã dùng', '#3fd66a'); }
      }
      save(); rShop(); refresh();
    };
  }

  function kindVi(k) {
    return { weapon: 'Vũ khí', head: 'Giáp đầu', body: 'Giáp thân', arm: 'Giáp tay', leg: 'Giáp chân' }[k] || k;
  }

  function rBossList() {
    var b = $('body-bosslist'), html = '';
    ['SS', 'S', 'A', 'B'].forEach(function (rk) {
      var list = G.BEHEMOTHS.filter(function (x) { return x.rank === rk; });
      if (!list.length) return;
      html += '<div class="card"><h3>' + rankChip(rk) + ' — ' + list.length + ' con</h3><div class="grid2">';
      list.forEach(function (x) {
        var own = ['weapon', 'head', 'body', 'arm', 'leg'].filter(function (k) { return G.hasGear(S, x.id, k); }).length;
        html += '<div class="item"><div class="nm">' + x.n + '</div><div class="sub">' +
          G.weaponOf(x.weapon).vi + ' · ' + G.WTYPES[x.type].vi + '<br>' + elemDot(x.el) + ' ' + G.ELEMENTS[x.el].vi +
          (own ? '<br><b style="color:#f2c94b">Đã có ' + own + '/5 món</b>' : '') +
          '<br><span style="font-size:9px">Bộ phận: ' + (x.parts || []).join(', ') + '</span>' +
          '<br><span style="font-size:9px;color:#f2c94b">WEAK: ' + (x.wp || []).join(', ') + '</span>' +
          '</div></div>';
      });
      html += '</div></div>';
    });
    b.innerHTML = html;
  }

  /* -------------------------------------------------------------- MORE --- */
  function rMore() {
    var b = $('body-more');
    var st = S.stats;
    b.innerHTML =
      '<div class="card"><h3>Hồ sơ</h3>' +
      '<div class="row"><span style="flex:1;font-size:12px">Tên</span><input id="nameIn" value="' + S.name.replace(/"/g, '') + '" ' +
        'style="width:150px;background:#0a0f16;border:1px solid #3a4d63;color:#eaf1f8;border-radius:6px;padding:5px;font-size:12px;pointer-events:auto"></div>' +
      '<div class="row" style="margin-top:7px"><span style="flex:1;font-size:12px">Tông da</span>' +
        '<button class="btn sm" data-cy="skin">' + ((S.skin || 0) + 1) + '/8</button></div>' +
      '<div class="row" style="margin-top:7px"><span style="flex:1;font-size:12px">Màu tóc</span>' +
        '<button class="btn sm" data-cy="hairColor">' + ((S.hairColor || 0) + 1) + '/12</button></div>' +
      '<p style="margin-top:7px">Cấp <b>' + S.lv + '</b> · EXP ' + fmt(S.exp) + '/' + fmt(G.BAL.expToLv(S.lv)) + '</p></div>' +

      /* Mở lại hướng dẫn. Phải có: người chơi bỏ qua ở bước một rồi mười phút
         sau không biết cách xả ulti là chuyện chắc chắn xảy ra, và lúc đó không
         còn đường nào quay lại. */
      '<div class="card"><h3>Hướng dẫn</h3>' +
      '<p style="color:#9fb2c4">Chạy lại từ đầu: vào ải, học ba cử chỉ, quay, lắp đồ, nâng cấp.</p>' +
      '<button class="btn" data-act="tut" style="width:100%">Chạy lại hướng dẫn</button></div>' +

      '<div class="card"><h3>Thống kê</h3>' +
      '<div class="row wrap" style="font-size:11px;gap:14px">' +
      '<span>Behemoth hạ: <b>' + (st.boss || 0) + '</b></span><span>Quái hạ: <b>' + (st.mob || 0) + '</b></span>' +
      '<span>Bộ phận phá: <b>' + (st.parts || 0) + '</b></span><span>Chết: <b>' + (st.deaths || 0) + '</b></span>' +
      '<span>Trang bị: <b>' + S.gear.length + '</b></span>' +
      '<span>Ải đã phá: <b>' + G.STAGES.filter(function (x) { return S.cleared[x.id]; }).length +
        '/' + G.STAGES.length + '</b></span>' +
      '<span>Lõi Rồng: <b>' + fmt(S.core || 0) + '</b></span>' +
      '<span>Lượt quay: <b>' + fmt(st.pulls || 0) + '</b></span>' +
      '<span>Tiến Hoá: <b>' + G.evolTotal(S) + '</b></span></div></div>' +

      '<div class="card"><h3>Bộ trưng bày</h3>' +
      '<p>Mười cây SS tối cấp, mỗi cây một lớp và một hệ khác nhau — đủ để xem hết ' +
      'art vũ khí và <b>cả hai kỹ năng</b> của từng lớp mà không phải cày tới Lv.8. ' +
      'Bấm lại không nhân bản.</p>' +
      '<div class="row wrap" style="gap:8px;margin:6px 0">' +
      G.showcaseList().map(function (it) {
        var b = G.behemothById(it.src) || {};
        return '<span class="mat-chip">' + (G.weaponOf(b.weapon) || {}).vi + ' · ' + it.note + '</span>';
      }).join('') + '</div>' +
      '<button class="btn pri" data-act="showcase" style="width:100%">Nhận bộ trưng bày</button></div>' +

      '<div class="card"><h3>Về bản dựng lại này</h3>' +
      '<p>Dựng lại từ <b>Dragon Project</b> (COLOPL, 2016–2020) — game đã đóng cửa. Trọng tâm là ' +
      '<b>ぷにコン (Punicon)</b>: một ngón làm hết. Bản đồ thao tác, đặc thù 5 vũ khí, tỉ lệ gacha, ' +
      'tỉ lệ rơi đồ và thang chỉ số đều lấy từ wiki chính thức và bài 4Gamer 2016. ' +
      'Không dùng một file ảnh/âm thanh nào của game gốc: nhân vật, quái, boss và nền là ' +
      'sprite của HoloCure, biểu tượng vũ khí lấy từ wiki Sephiria, còn VFX vẽ bằng code.</p>' +
      '<p>Chi tiết nguồn: <code>games/dragonproj/RESEARCH.md</code></p>' +
      '<button class="btn" data-act="help" style="width:100%;margin-top:6px">Cách chơi</button>' +
      '<button class="btn red" data-act="wipe" style="width:100%;margin-top:6px">Xóa dữ liệu và chơi lại</button></div>';

    b.onclick = function (e) {
      var t = e.target.closest('[data-act],[data-cy]'); if (!t) return;
      if (t.hasAttribute('data-cy')) {
        var k = t.getAttribute('data-cy');
        S[k] = ((S[k] || 0) + 1) % (k === 'skin' ? 8 : 12);
        save(); rMore(); return;
      }
      var a = t.getAttribute('data-act');
      if (a === 'showcase') {
        var got = G.grantShowcase(S);
        save();
        toast(got.length ? 'Đã thêm ' + got.length + ' cây vào Kho đồ' : 'Đã có đủ bộ rồi',
              got.length ? '#f2c94b' : '#8fa3b5');
        rMore(); return;
      }
      if (a === 'help') show('help');
      if (a === 'wipe') { G.wipe(); location.reload(); }
    };
    var ni = $('nameIn');
    if (ni) ni.onchange = function () { S.name = ni.value.slice(0, 14) || 'Hound'; save(); };
    var oldMore = b.onclick;
    b.onclick = function (e) {
      var tt = e.target.closest && e.target.closest('[data-act="tut"]');
      if (tt) { G.tutRestart(S); save(); show('home'); setTimeout(tutTick, 80); return; }
      if (oldMore) oldMore.call(b, e);
    };
  }

  /* -------------------------------------------------------------- HELP --- */
  function rHelp() {
    var b = $('body-help');
    var html = '<div class="card"><h3>ぷにコン — Punicon</h3>' +
      '<p>Không có D-pad, không có hàng nút. Chạm <b>bất cứ đâu ở giữa màn hình</b> là cần gạt mọc ra ngay tại đó.</p>' +
      '<p><span class="kbd">KÉO</span> di chuyển — kéo nhẹ đi bộ, kéo hết vòng thì chạy.</p>' +
      '<p><span class="kbd">CHẠM</span> đánh thường. <span class="kbd">BẤM LIÊN TỤC</span> nối combo. ' +
        'Chạm <b>chỗ nào cũng được</b> — không phải ngắm.</p>' +
      '<p><b>Hướng nhìn</b> theo đúng luật bản gốc: <b>đứng yên</b> thì nhân vật <b>tự quay về con gần nhất</b>, ' +
        'còn <b>đang chạy</b> thì đòn bay theo <b>hướng đang đi</b> — muốn đánh chỗ nào thì thả cần gạt ra rồi bấm.</p>' +
      '<p><span class="kbd">VẨY</span> né/lăn. Né hủy được độ cứng sau đòn đánh.</p>' +
      '<p><span class="kbd">GIỮ</span> ra đòn đặc thù — <b>mỗi vũ khí một kiểu hoàn toàn khác</b>. ' +
      'Giữ chỉ tính khi <b>cần gạt đang ở giữa</b>, nên kéo chạy bao lâu cũng không lo tự ra đòn; ' +
      'muốn ra đòn thì thả cần gạt về giữa rồi giữ. Riêng thế <b>đỡ</b> vẫn đi được (chậm hơn), ' +
      'còn nạp Chém Tích Lực và ngắm bắn thì đứng yên — lúc đó kéo là <b>ngắm</b>.</p>' +
      '<p><span class="kbd">GIỮ rồi TRƯỢT VỀ HƯỚNG NÚT KỸ NĂNG</span> rồi GIỮ NGUYÊN ở đó để NẠP, nhả ra để XẢ. Không cần với tay tới nút — ' +
      'chỉ cần <b>trượt đúng hướng</b>, cần gạt sẽ mọc ra một tia sáng chỉ về nút bạn đang nhắm. ' +
      'Đây là câu lệnh gốc của Colopl cho kỹ năng; bấm thẳng vào nút cũng được.</p></div>';

    html += '<div class="card"><h3>Hai nước đi làm nên "feel" Punicon</h3>' +
      '<p><b>Đánh khi đang lăn.</b> Vẩy để lăn, rồi <span class="kbd">CHẠM</span> ngay <i>trong lúc còn đang lăn</i> ' +
      '→ ra một đòn mà <b>không mất khung bất tử</b>. Đây là cách đi vào người boss an toàn nhất.</p>' +
      '<p><b>Phản đòn sau khi né chuẩn.</b> Nếu cú lăn của bạn <i>trúng ngay lúc đòn địch chạm vào</i>, ' +
      'trên đầu hiện dấu <b style="color:#f2c94b">!!</b> kèm một thanh nhỏ. ' +
      '<span class="kbd">CHẠM</span> khi dấu còn đó → phản đòn nặng gấp mấy lần đòn thường. ' +
      'Hễ thấy <b style="color:#f2c94b">!!</b> là bấm — đúng ngôn ngữ chung của mọi game Punicon.</p>' +
      '<p><b>Vòng dưới chân</b> cho biết đang nạp tới đâu: ' +
      '<b style="color:#fff">trắng</b> → <b style="color:#ffd23f">vàng</b> → ' +
      '<b style="color:#8fd14f">lục</b> → <b style="color:#ff3b30">đỏ (tối đa)</b>. ' +
      'Nhìn xuống chân thay vì liếc lên rìa màn hình, mắt không rời mục tiêu.</p></div>';

    html += '<div class="card"><h3>Ba cách ra đòn — vẫn một ngón</h3>' +
      '<p><span class="kbd">TAP LIÊN TỤC</span> đi hết <b>chuỗi</b> của cây đang cầm (3–6 nhát, nhát cuối nặng nhất).</p>' +
      '<p><span class="kbd">NGƯNG rồi TAP</span> ra <b style="color:#f2c94b">ĐÒN NẶNG</b>. Ngưng khoảng ' +
        (G.FEEL.delayMin / 1000).toFixed(1) + ' giây sau khi nhát trước <b>trúng</b> thì một <b>vòng vàng</b> nở ra dưới chân — ' +
        'tap trong lúc vòng còn đó là ra. Cửa sổ chỉ ' + (G.FEEL.delayWindow / 1000).toFixed(2) + ' giây.</p>' +
      '<p><span class="kbd">VẨY rồi TAP</span> ra <b>đòn lướt</b> — mỗi cây một kiểu, và không mất khung bất tử.</p>' +
      '<p><b>Đòn đã TRÚNG thì huỷ đuôi được</b> nên nối nhanh hơn; đòn <b>hụt</b> phải chịu hết. ' +
        'Đánh trúng được thưởng, bấm loạn bị phạt.</p></div>';

    html += '<div class="card"><h3>Ba thứ phải để mắt trên người quái</h3>' +
      '<p><b style="color:#c8a0ff">Thanh tím</b> dưới thanh máu là <b>lì đòn</b>. Đục hết thì <b style="color:#f2d24b">VỠ THẾ</b> — ' +
        'nó đứng chết trân gần một giây. Đó là lúc xả đòn nặng.</p>' +
      '<p><b style="color:#8fd4ff">Bóng co lại</b> nghĩa là nó đang <b>bị hất lên trời</b>: không đánh trả được, ' +
        'và ăn thêm ' + Math.round((G.FEEL.airDmgMul - 1) * 100) + '% sát thương. Đánh tiếp cho nó đừng rơi.</p>' +
      '<p><b style="color:#ff5a5a">Vùng đỏ</b> là đòn sắp ra — của quái thường cũng như của Behemoth. ' +
        'Vòng trong thu nhỏ báo thời điểm nổ. Con nào cũng báo trước, nên đòn nào cũng né được.</p>' +
      '<p>Đánh xong một đòn con quái <b>đơ một nhịp</b> — con Vacca húc hụt thì đơ gần một giây. Đó là chỗ để dồn đòn.</p></div>';

    html += '<div class="card"><h3>Mười lớp vũ khí</h3>' +
      '<p style="color:#9fb2c4;font-size:10.5px;margin-bottom:10px">Mỗi lớp GIỎI NHẤT đúng một trục ' +
      'và TỆ NHẤT hai trục. DPS bền của cả mười gần bằng nhau — cái phân biệt chúng là ' +
      '<b>sát thương gom được trong một cửa sổ an toàn</b>, tầm với, và giá của một phát trượt.</p>';
    G.WEAPON_ORDER.forEach(function (k) {
      var w = G.weaponOf(k);
      var hold = w.auto ? 'bắn liên tục' : w.charge ? 'nạp lực bốn nấc' : 'ghì súng cho chắc tay';
      html += '<p style="margin-bottom:10px"><b>' + w.vi + '</b> (' + w.jp + ')<br>' +
        '<span style="color:#cfe0ee;font-size:10.5px">' +
          w.dmg + ' sát thương × ' + w.shots + ' viên · ' +
          (w.rpm / 60).toFixed(1) + ' phát/giây · tầm ' + w.range + 'px' +
          (w.pierce ? ' · xuyên' : '') + (w.homing ? ' · tự đuổi' : '') +
          (w.explode ? ' · nổ' : '') + (w.noCrit ? ' · không chí mạng' : '') +
        '</span><br>' +
        '<span style="color:#f2c94b">GIỮ: ' + hold + '</span><br>' +
        '<span style="color:#9fb2c4">' + w.desc + '</span><br>' +
        '<span style="color:#7fd4ff;font-size:10.5px">' + (w.trait || '') + '</span></p>';
    });
    html += '</div>';

    html += '<div class="card"><h3>Đánh boss: vòng lặp cần thuộc</h3>' +
      '<p>1. Boss <b>lộ WEAK point</b> từng đợt (viền vàng, chữ WEAK).</p>' +
      '<p>2. Đánh vào đó → sát thương ×' + G.BAL.weakMul + ' và <b>nạp thanh gục</b> (thanh vàng nhỏ dưới thanh máu).</p>' +
      '<p>3. Thanh gục đầy → boss <b>nằm ra ' + (G.BAL.downMs / 1000) + ' giây</b>, ăn sát thương ×' + G.BAL.downDmgMul + '.</p>' +
      '<p>4. Đó là lúc xả kỹ năng và đòn đặc thù mạnh nhất.</p>' +
      '<p>Đánh đủ vào một bộ phận thì <b>phá</b> được nó — thưởng Gold cuối ải tăng theo số bộ phận đã phá, và vùng đó ăn thêm sát thương.</p>' +
      '<p>Vùng <b style="color:#ff3b30">đỏ</b> là đòn boss sắp ra. Vòng trong thu nhỏ báo thời điểm nổ.</p></div>';

    html += '<div class="card"><h3>Hệ</h3><p>Vòng khắc chế: <b>Thủy ▸ Hỏa ▸ Thổ ▸ Lôi ▸ Thủy</b>, và <b>Quang ↔ Ám</b>. ' +
      'Khắc chế ×' + G.ELEM_ADV + ', bị khắc ×' + G.ELEM_DIS + '.</p></div>';

    html += '<div class="card"><h3>Một ải gồm những gì</h3>' +
      '<p>Vào ải <b>một mình</b>. Hai chặng liền nhau trong cùng một trận:</p>' +
      '<p>1. <b>Chặng quái</b> — dọn đủ số quái ải yêu cầu (hàng trên cùng đếm ngược cho bạn).</p>' +
      '<p>2. <b>Chặng trùm</b> — Behemoth cuối ải ra ngay tại chỗ. Hạ nó là <b>phá ải</b>, và ải kế mở.</p>' +
      '<p>Ngã thì <b>tự đứng dậy</b> sau ' + (G.BAL.selfReviveMs / 1000) + ' giây, có ' + G.BAL.reviveCount +
      ' lượt. Hết lượt là thua ải (vẫn giữ đồ đã nhặt).</p>' +
      '<p>Cả ải có ' + Math.round(G.BAL.questMs / 60000) + ' phút.</p></div>';

    html += '<div class="card"><h3>Kỹ năng: nạp xong, chỉ hướng, thả</h3>' +
      '<p><b>Hồi chiêu chính là thanh nạp.</b> Nút bên phải sáng lên là bấm được — không có ' +
      'pha giữ nào nữa, và bấm được thì chắc chắn ra đòn.</p>' +
      '<p>Đặt ngón lên nút rồi <b>KÉO để chỉ hướng</b>, thả ra là xả. ' +
      '<b>Không kéo</b> thì đòn tự ngắm con gần nhất. Bỏ ngón ra là huỷ, và huỷ <b>không mất gì</b>.</p>' +
      '<p>Ba dáng ngắm, ghi sẵn trên màn chi tiết vũ khí: ' +
      '<b>bấm là xả tại chỗ</b> (khiên, tăng tốc), <b>kéo để chỉ hướng</b> (lao tới, tia xuyên), ' +
      '<b>kéo để chọn điểm rơi</b> (thiên thạch, mưa tên).</p>' +
      '<p>Ngắm <b>không khoá chân</b>: ngón di chuyển vẫn chạy được trong lúc ngón kia đang chỉ hướng.</p></div>';

    html += '<div class="card"><h3>Hai đồng tiền</h3>' +
      '<div class="upgrow"><b style="color:#f2d24b">⬤ Gold</b><span>Mọi thứ nâng cấp. ' +
      'Ra từ quái, rương, điểm khai thác và thưởng ải.</span></div>' +
      '<div class="upgrow"><b style="color:#8fd4ff">◈ Gem</b><span>CHỈ để quay. ' +
      'Một lượt ' + G.REWARD.pull + ', gói mười ' + fmt(G.REWARD.pull10) + '.</span></div>' +
      '<div class="upgrow"><b style="color:#f2d24b">◆ Lõi Rồng</b><span>Không phải tiền: không mua được gì. ' +
      'Chỉ có từ <b>quay trúng thứ đã có</b>, và chỉ tiêu được vào Tinh Luyện với Tiến Hoá.</span></div>' +
      '<p>Không có đường đổi Gem sang Gold hay ngược lại. Hai đồng tiền mà đổi được cho nhau ' +
      'thì thật ra chỉ có một.</p></div>';

    html += '<div class="card"><h3>Thưởng Gem sau mỗi ải</h3>' +
      '<p><b>Phá lần đầu</b> mỗi ải trả đậm và tăng dần theo chuỗi: ải đầu +' + G.REWARD.firstGem(0) +
      ', ải cuối +' + G.REWARD.firstGem(G.STAGES.length - 1) + '. Cả 38 ải cộng lại đủ khoảng <b>' +
      Math.round(G.STAGES.reduce(function (a, x, i) { return a + G.REWARD.firstGem(i); }, 0) / G.REWARD.pull) +
      ' lượt quay</b>.</p>' +
      '<p><b>Cày lại</b> vẫn ra Gem, nhưng nhỏ giọt — ải cuối +' + G.REWARD.repeatGem(G.STAGES.length - 1) +
      '. Đủ để cày có nghĩa, không đủ để cày thay cho việc đi tiếp.</p>' +
      '<p>Cộng thêm <b>+' + G.REWARD.condGem + ' mỗi điều kiện</b>: không gục lần nào, có dùng kỹ năng, ' +
      'xong trong ' + (G.BAL.gemFastMs / 1000) + ' giây. Đủ cả ba thì <b>+' + G.REWARD.allCondGem + ' nữa</b>.</p></div>';

    html += '<div class="card"><h3>Ba banner</h3>' +
      G.BANNERS.map(function (bn) {
        return '<div class="upgrow"><b>' + bn.vi + '</b><span>' + bn.d +
          '<br><i style="color:#9fb2c4">SS ' + (bn.rates.SS * 100).toFixed(1) + '% gốc · ' +
          'tỉ lệ bắt đầu leo từ lượt ' + bn.soft + ' · chắc chắn ra SS ở lượt ' + bn.hard + '</i></span></div>';
      }).join('') +
      '<p>Quay trúng thứ <b>đã có</b> thì đổi thành <b style="color:#f2d24b">Lõi Rồng</b> ' +
      '(B ' + G.DUPE_CORE.B + ' · A ' + G.DUPE_CORE.A + ' · S ' + G.DUPE_CORE.S + ' · SS ' + G.DUPE_CORE.SS + '). ' +
      'Nên không có cú quay nào là phí.</p></div>';

    html += '<div class="card"><h3>Đồ mạnh lên bằng cách nào</h3>' +
      '<div class="upgrow"><b>Nâng cấp</b><span>Lv.1 → ' + G.MAX_LV + ', tiêu <b>Gold</b>.</span></div>' +
      '<div class="upgrow"><b>Đột phá</b><span>0 → 4, tiêu <b>chính trang bị khác</b>: nướng ' +
      'món cùng hạng trở lên. Món rác quay được là nguyên liệu, nên không cú quay nào bỏ đi.</span></div>' +
      '<div class="upgrow"><b>Tinh luyện</b><span>Chỉ đồ S/SS, cần <b>Lõi Rồng</b>. Về Lv.1 nhưng ' +
      'trần chỉ số cao hơn hẳn.</span></div>' +
      '<div class="upgrow"><b>Đổi Ability</b><span>Tiêu Gold, quay lại hai dòng ability.</span></div>' +
      '<p>Mặc đủ bốn mảnh giáp <b>cùng một Behemoth</b> thì được thưởng bộ: +10% máu, +8% công, +10% thủ.</p></div>';

    html += '<div class="card"><h3>Tiến Hoá — nâng nền cho MỌI nhân vật</h3>' +
      '<p>Bốn nhánh, mỗi nhánh ' + G.EVOL.max + ' cấp, cộng thẳng vào <b>chỉ số gốc</b> của ' +
      '<b>mọi nhân vật</b> — kể cả người quay được sau này.</p>' +
      '<p>Vì sao cần: không có nó thì người mới quay được luôn yếu hơn người đang dùng, ' +
      'và người chơi học được đúng một bài là <b>đừng đổi người</b> — tức là cả hệ gacha mất nghĩa.</p>' +
      '<p>Tiêu Gold, và cứ 5 cấp cần thêm <b>Lõi Rồng</b>. Đây là đích của cả chiến dịch, ' +
      'không phải một nút bấm trong buổi đầu.</p></div>';

    b.innerHTML = html;
  }

  /* ======================================================== VÀO TRẬN ===== */
  function startStage(stageId) {
    var st = G.stageById(stageId);
    if (!st) return;
    S.area = st.area;
    enterBattle({ stageId: st.id });
  }

  function enterBattle(opts) {
    Array.prototype.forEach.call(screens.children, function (c) { c.classList.remove('on'); });
    screens.style.display = 'none';
    hud.classList.add('on');
    $('resultScr').classList.remove('on');
    $('hDown').classList.remove('on');
    setPhaseHud('mobs');

    if (battle) battle.stop();
    battle = new G.Battle($('view'), S, opts, {
      onToast: toast,
      onHud: updateHud,
      onFinish: onFinish,
      onPhase: setPhaseHud,
      onDraft: showDraft,
      onWeapon: function () { renderWeaponSlots(); renderSkillBtns(); }
    });
    renderWeaponSlots(); renderSkillBtns();
    battle.start();
  }

  /* Màn bốc cường hoá đã gỡ cùng cả hệ lên-cấp-trong-trận. `onDraft` vẫn nằm
   * trong bảng callback nên vẫn phải có một hàm ở đây — một callback trỏ vào
   * undefined thì nổ đúng vào lúc không ai ngờ. */
  function showDraft() {}

  /* Nửa đầu ải không có boss, nên hàng thông tin boss phải nhường chỗ cho bộ đếm
   * quái — chỗ trên cùng màn hình là chỗ đắt nhất, không để một thanh máu rỗng. */
  function setPhaseHud(phase) {
    var boss = phase === 'boss';
    $('bossRow').style.display = boss ? 'block' : 'none';
    $('hDist').style.display = boss ? 'flex' : 'none';
    $('mobRow').style.display = boss ? 'none' : 'flex';
  }

  /* ---------------------------------------------------------- HUD BIND -- */
  function bindHud() {
    $('hMenu').onclick = function () {
      if (!battle) return;
      battle.paused = !battle.paused;
      toast(battle.paused ? 'TẠM DỪNG — bấm lại để tiếp tục' : 'Tiếp tục');
      if (battle.paused) {
        if (confirm('Rời trận và về Guild?')) { leaveBattle(); }
        else battle.paused = false;
      }
    };
    $('hGemRevive').onclick = function () { if (battle && battle.gemRevive()) { $('hDown').classList.remove('on'); refresh(); } };
    $('hGiveUp').onclick = function () { leaveBattle(); };
  }

  function leaveBattle() {
    // Còn đang trong ải: kết thúc qua đường chính thức để có bảng "RỜI ẢI".
    if (battle && battle.running) { battle.leaveStage(); return; }
    if (battle) battle.stop();
    battle = null;
    save(); show('home');
  }

  /* HAI HÀM VẼ HUD ĐÃ BỎ: renderWeaponSlots (cột ba nhân vật ở mép phải) và
   * renderSkillBtns (hai nút lục giác). Cả hai thứ chúng vẽ đều không còn tồn
   * tại — kỹ năng đi bằng cử chỉ Punicon, đội hình chốt ở màn chuẩn bị.
   *
   * Giữ lại hai cái vỏ rỗng thay vì xoá sạch mọi lời gọi: chúng được gọi từ bốn
   * chỗ khác nhau trong luồng vào ải và đổi vũ khí, và một hàm rỗng có chú thích
   * thì đọc rõ hơn là bốn chỗ gọi bị cắt cụt. */
  function renderWeaponSlots() {
    // Ba khe trên HUD là BA NGƯỜI. Ảnh nhân vật to hơn chữ, vì lúc đánh nhau mắt
    // chỉ kịp nhận ra hình chứ không kịp đọc.
    var party = G.party(S), el = $('hWswitch'), html = '';
    for (var i = 0; i < 3; i++) {
      var h = party[i], d = G.heroDef(h);
      var on = battle && battle.player.wIdx === i;
      var css = d && G.Atlas ? G.Atlas.iconCss('heroes.' + d.id + '.idle', 20) : '';
      html += '<button class="wslot ' + (on ? 'on' : '') + ' ' + (d ? '' : 'empty') + '" data-w="' + i + '">' +
        (d ? (css ? '<i class="uicon" style="' + css + '"></i>' : '') + d.n.split(' ').pop() : '—') + '</button>';
    }
    el.innerHTML = html;
    el.onclick = function (e) {
      var t = e.target.closest('[data-w]'); if (!t || !battle) return;
      battle.setWeapon(+t.getAttribute('data-w'));
      renderWeaponSlots();
    };
  }

  /* renderSkillBtns ĐÃ RỖNG: hai nút lục giác không còn. Kỹ năng đi bằng cử chỉ
   * Punicon trên sân, và thứ báo "sắp xả được đòn gì" là thanh nạp trên đầu nhân
   * vật. Giữ vỏ rỗng vì bốn chỗ trong luồng vào ải vẫn gọi tới nó. */
  function renderSkillBtns() {}

  function updateHud(bt) {
    var p = bt.player;
    // đồng hồ
    var t = Math.max(0, bt.timeLeft) / 1000;
    $('hTimer').textContent = Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2);
    // nửa đầu ải: còn bao nhiêu con nữa thì Behemoth ra
    if (bt.phase === 'mobs') {
      $('hStageName').textContent = bt.stage.n;
      $('hStageSub').textContent = bt.stage.sub;
      var left = Math.max(0, bt.needKills - bt.killed);
      $('hMobLeft').textContent = left;
      $('hMobFill').style.width = Math.min(100, bt.killed / bt.needKills * 100) + '%';
    }
    // boss
    if (bt.phase === 'boss' && bt.boss) {
      var b = bt.boss;
      $('hBossRank').textContent = b.rank;
      $('hBossRank').style.color = G.RANK_COLOR[b.rank];
      $('hBossName').textContent = 'Lv' + b.lv + ' ' + b.n;
      // "Weakness" trong bản gốc chỉ hệ mà boss BỊ KHẮC, không phải hệ của chính nó.
      // Đó là thông tin người chơi cần để chọn vũ khí, nên phải hiện đúng thứ đó.
      var weakEl = G.ELEM_BEATS[b.el] ? Object.keys(G.ELEM_BEATS).find(function (k) { return G.ELEM_BEATS[k] === b.el; }) : null;
      $('hBossElem').style.background = G.ELEMENTS[weakEl || 'none'].color;
      $('hBossElem').title = weakEl ? 'Yếu trước hệ ' + G.ELEMENTS[weakEl].vi : '';
      $('hBossHp').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%';
      $('hBossFat').style.width = (b.fatigue / G.BAL.fatigueMax * 100) + '%';
      var ph = '';
      b.parts.forEach(function (pt) {
        ph += '<span class="part-chip ' + (pt.broken ? 'broken' : (pt.weak && (b.wpOn || b.down > 0) ? 'weak' : '')) + '">' + pt.n + '</span>';
      });
      $('hParts').innerHTML = ph;
      $('hDist').innerHTML = '⟟ <b>' + Math.round(Math.hypot(b.x - p.x, b.y - p.y) / 10) + '</b>m';
    }
    /* Ba thứ vừa bỏ khỏi vòng cập nhật này, vì phần tử của chúng không còn:
     *   - tên nhân vật + tên vũ khí  -> đọc ở màn chuẩn bị, không phải giữa trận
     *   - viên hệ nguyên tố          -> hệ đã hiện ra bằng MÀU của chính đạn bay
     *   - hai đồng hồ hồi chiêu      -> kỹ năng chạy bằng thanh nạp, không bằng
     *                                   hồi chiêu, và thanh đó vẽ trên đầu char
     * Thanh Heat/Soul thì giữ, chỉ đổi chỗ: nó là tài nguyên của LOẠI vũ khí và
     * vẫn phải thấy được. */
    /* HỒI CHIÊU ĐỔI NGƯỜI, vẽ thẳng lên ba nút. Không có nó thì người chơi bấm
     * vào khoảng không: nút vẫn sáng, vẫn bấm được, mà không có gì xảy ra ngoài
     * một dòng chữ nhỏ. Phủ tối + số giây là cách rẻ nhất để nói "chưa tới lúc". */
    var swk = Math.max(0, (p.swapCd || 0)) / G.SWAP.cd;
    var slots = $('hWswitch').children;
    for (var wi = 0; wi < slots.length; wi++) {
      slots[wi].classList.toggle('cool', swk > 0 && wi !== p.wIdx);
      slots[wi].style.setProperty('--cd', (swk * 100) + '%');
    }

    var g2 = $('hGauge2');
    if (bt.wp && (bt.wp.wtype === 'heat' || bt.wp.wtype === 'soul')) {
      g2.classList.add('on');
      g2.classList.toggle('soul', bt.wp.wtype === 'soul');
      g2.querySelector('i').style.width = (bt.wp.wtype === 'heat' ? p.heat : p.soul) + '%';
    } else g2.classList.remove('on');

    // bảng bất tỉnh
    $('hDown').classList.toggle('on', !!p.down);
  }

  /* ---------------------------------------------------------- KẾT THÚC -- */
  function onFinish(r) {
    var el = $('resultScr');
    var st = r.stage || (battle && battle.stage);
    var html = '';

    if (r.win) {
      var b = r.boss;
      var bag = r.bag || { gold: 0, exp: 0 };
      S.stats.boss++; S.stats.parts += r.parts || 0;
      S.bossKills[b.id] = (S.bossKills[b.id] || 0) + 1;
      S.seenBoss[b.id] = 1;

      // Gem đã tính xong hết ở bossDown (nền theo ải + ba điều kiện). Ở đây chỉ
      // cộng vào ví — không tính lại, vì tính ở hai chỗ là hai chỗ để lệch nhau.
      var gems = r.gems;
      S.gold += r.gold;
      S.gem += gems;
      var lvUp = G.addExp(S, r.exp);
      G.track(S, { boss: 1, part: r.parts || 0, kill: r.killed || 0 });
      S.progress['bossId_' + b.id] = (S.progress['bossId_' + b.id] || 0) + 1;
      S.progress['bossRank_' + b.rank] = (S.progress['bossRank_' + b.rank] || 0) + 1;
      if (battle && battle.wp) S.progress['bossWith_' + battle.wp.wclass] = (S.progress['bossWith_' + battle.wp.wclass] || 0) + 1;
      S.cleared[st.id] = true;

      html += '<h2 style="color:#3fd66a">PHÁ ẢI</h2><div class="sub">' + st.n + ' · ' + st.sub + ' — ' +
        Math.floor(r.elapsed / 60000) + ':' + ('0' + Math.floor(r.elapsed / 1000 % 60)).slice(-2) + '</div>';
      html += '<div class="box">';
      // Ba điều kiện: mỗi cái là gem lẻ, đủ cả ba thì thêm một cục. Hiện đủ cả ba
      // KỂ CẢ khi trượt — người chơi phải thấy cái mình vừa bỏ lỡ, không thì lần
      // sau họ vẫn không biết có thứ đó để mà nhắm.
      html += '<div class="gemcond"><span class="' + (r.conds.noDeath ? 'ok' : 'no') + '">' + (r.conds.noDeath ? '✔' : '✘') + ' Không gục lần nào · +' + G.REWARD.condGem + ' ◈</span></div>';
      html += '<div class="gemcond"><span class="' + (r.conds.usedSkill ? 'ok' : 'no') + '">' + (r.conds.usedSkill ? '✔' : '✘') + ' Có dùng kỹ năng · +' + G.REWARD.condGem + ' ◈</span></div>';
      html += '<div class="gemcond"><span class="' + (r.conds.fast ? 'ok' : 'no') + '">' + (r.conds.fast ? '✔' : '✘') + ' Xong trong ' + (G.BAL.gemFastMs / 1000) + ' giây · +' + G.REWARD.condGem + ' ◈</span></div>';
      html += '<div class="gemcond"><span class="' + (r.nCond === 3 ? 'ok' : 'no') + '">' + (r.nCond === 3 ? '✔' : '✘') + ' Đủ cả ba · +' + G.REWARD.allCondGem + ' ◈</span></div>';
      html += '<div class="line" style="border-top:1px solid rgba(255,255,255,.15);margin-top:6px;padding-top:6px"><span>' +
        (r.firstClear ? '◈ Phá LẦN ĐẦU' : '◈ Cày lại') + '</span><b style="color:#8fd4ff">+' + r.gemBase + '</b></div>';
      html += '<div class="line"><span>◈ Điều kiện</span><b style="color:#8fd4ff">+' + r.gemCond + '</b></div>';
      html += '<div class="line"><span><b>◈ Tổng Gem</b></span><b style="color:#8fd4ff;font-size:15px">+' + gems + '</b></div>';
      html += '<div class="line"><span>' + b.n + ' · bộ phận đã phá</span><b>' + (r.parts || 0) + '</b></div>';
      html += '<div class="line"><span>Quái đã hạ</span><b>' + (r.killed || 0) + '</b></div>';
      html += '<div class="line"><span>⬤ Gold thưởng ải</span><b>' + fmt(r.gold) +
        (r.bossGold ? ' <i style="color:#9fb2c4;font-size:10px">(gồm ' + fmt(r.bossGold) + ' từ trùm)</i>' : '') + '</b></div>';
      html += '<div class="line"><span>EXP thưởng ải</span><b>' + fmt(r.exp) +
        (lvUp ? ' <span style="color:#3fd66a">LÊN CẤP ×' + lvUp + '!</span>' : '') + '</b></div>';
      // Rương trong ải cộng thẳng vào túi ngay lúc nhặt, nên ở đây chỉ nhắc lại.
      if (bag.gold || bag.exp) html += '<div class="line"><span>Nhặt dọc đường</span><b>' +
        fmt(bag.gold || 0) + ' Gold · ' + fmt(bag.exp || 0) + ' EXP</b></div>';
      html += '</div>';
      // Lần đầu phá xong thì nói luôn nó bằng bao nhiêu lượt quay: đó là đơn vị
      // mà người chơi gacha thật sự dùng để nghĩ, không phải "gem".
      if (gems >= G.REWARD.pull) html += '<div class="sub" style="color:#8fd4ff">' +
        'Đủ ' + Math.floor(gems / G.REWARD.pull) + ' lượt quay.</div>';
      var nx = G.nextStage(S);
      html += '<button class="btn pri" id="rNext" style="width:260px" data-next="' + nx.id + '">▶ ' +
        (nx.id === st.id ? 'Đánh lại ải này' : 'Vào ' + nx.n + ' — ' + nx.sub) + '</button>' +
        '<button class="btn" id="rAgain" style="width:260px;margin-top:7px">Cày lại ' + st.n + '</button>' +
        '<button class="btn" id="rBack" style="width:260px;margin-top:7px">Về Guild</button>';

    } else if (r.quit) {
      // Bỏ dở: đồ đã nhặt vẫn của mình (đã vào túi từ lúc nhặt), nhưng ải không
      // tính là phá và không có thưởng ải.
      var bag2 = r.bag || { gold: 0, exp: 0 };
      G.track(S, { kill: r.killed || 0 });
      html += '<h2 style="color:#f2c94b">RỜI ẢI</h2><div class="sub">' + (st ? st.n + ' · ' + st.sub : '') + '</div>' +
        '<div class="box"><div class="line"><span>Quái đã hạ</span><b>' + (r.killed || 0) + '</b></div>' +
        '<div class="line"><span>Gold nhặt được</span><b>' + fmt(bag2.gold || 0) + '</b></div>' +
        '<p class="hint">Ải chưa tính là phá. Đồ đã nhặt vẫn giữ.</p></div>' +
        '<button class="btn pri" id="rBack" style="width:260px">Về Guild</button>';

    } else {
      S.stats.deaths++;
      html += '<h2 style="color:#ff5a5a">' + (r.timeout ? 'HẾT GIỜ' : 'THẤT BẠI') + '</h2>' +
        '<div class="sub">' + (st ? st.n + ' · ' + st.sub : '') + '</div>' +
        '<div class="box"><p class="hint">' + (r.timeout
          ? 'Mỗi ải có ' + Math.round(G.BAL.questMs / 60000) + ' phút, đúng luật Tower Clearing của bản gốc. ' +
            'Nâng trang bị, hoặc đổi sang vũ khí khắc hệ con trùm rồi thử lại.'
          : 'Hết lượt tự đứng dậy. Đánh vào WEAK point để nạp thanh gục, và vẩy ngón để né vùng đỏ.') +
        '</p></div>' +
        '<button class="btn pri" id="rAgain" style="width:260px">Thử lại</button>' +
        '<button class="btn" id="rBack" style="width:260px;margin-top:7px">Về Guild</button>';
    }

    el.innerHTML = html;
    el.classList.add('on');
    save();
    var rb = $('rBack'); if (rb) rb.onclick = function () { el.classList.remove('on'); battle = null; show('home'); };
    var ra = $('rAgain'); if (ra) ra.onclick = function () { el.classList.remove('on'); startStage(st.id); };
    var rn = $('rNext'); if (rn) rn.onclick = function () { el.classList.remove('on'); startStage(rn.getAttribute('data-next')); };
  }

  /* ------------------------------------------------------ API CHO BOT --- */
  var api = {
    get save() { return S; },
    get battle() { return battle; },
    show: show, toast: toast, startStage: startStage,
    leave: leaveBattle, refresh: function () { refresh(); },
    saveNow: save
  };
  G.UI = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.DP = window.DP || {});
