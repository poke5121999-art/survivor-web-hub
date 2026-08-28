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
  var selGear = null, selMagiSlot = -1, gearFilter = 'weapon';

  /* --------------------------------------------------------- KHỞI ĐỘNG --- */
  function boot() {
    stage = $('stage'); hud = $('hud'); screens = $('screens');
    fit(); window.addEventListener('resize', fit);
    S = G.load();
    if (!S) { S = G.starterKit(G.newSave('Hound')); G.save(S); }
    G.rollRecurrent(S);
    S.progress = S.progress || {};
    buildScreens();
    show('home');
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
      '<div class="topbar">' +
        (showBack ? '<button class="back" data-back="1">‹</button>' : '') +
        '<h2>' + title + '</h2>' +
        '<div class="cur" id="cur-' + id + '"></div>' +
      '</div>' +
      '<div class="body" id="body-' + id + '">' + (bodyHtml || '') + '</div>' +
      (showNav ? navHtml(id) : '');
    screens.appendChild(d);
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-back]'); if (b) { show('home'); }
      var n = e.target.closest('[data-nav]'); if (n) { show(n.getAttribute('data-nav')); }
    });
    return d;
  }

  var NAV = [
    { id: 'home',   em: '🏰', n: 'Nhà' },
    { id: 'quest',  em: '🗺️', n: 'Nhiệm vụ' },
    { id: 'armory', em: '🛡️', n: 'Kho đồ' },
    { id: 'gacha',  em: '🔮', n: 'Triệu hồi' },
    { id: 'more',   em: '☰',  n: 'Khác' }
  ];
  function navHtml(active) {
    return '<div class="navbar">' + NAV.map(function (x) {
      return '<button data-nav="' + x.id + '" class="' + (x.id === active ? 'on' : '') + '">' +
        '<span class="em">' + x.em + '</span>' + x.n + '</button>';
    }).join('') + '</div>';
  }

  function buildScreens() {
    mkScreen('home',   'HEILAND — Guild', '', true);
    mkScreen('quest',  'NHIỆM VỤ', '', true);
    mkScreen('armory', 'KHO ĐỒ', '', true);
    mkScreen('gacha',  'TRIỆU HỒI', '', true);
    mkScreen('more',   'KHÁC', '', true);
    mkScreen('gear',   'CHI TIẾT TRANG BỊ', '', false, true);
    mkScreen('forge',  'LÒ RÈN', '', false, true);
    mkScreen('magi',   'MAGI', '', false, true);
    mkScreen('shop',   'TIỆM PIKKE', '', false, true);
    mkScreen('help',   'CÁCH CHƠI', '', false, true);
    mkScreen('bosslist','DANH SÁCH BEHEMOTH', '', false, true);
  }

  function show(id) {
    cur = id;
    Array.prototype.forEach.call(screens.children, function (c) { c.classList.remove('on'); });
    var el = $('scr-' + id); if (!el) return;
    el.classList.add('on');
    hud.classList.remove('on');
    if (battle) { battle.stop(); battle = null; }
    screens.style.display = 'block';
    renderCur(id);
    ({ home: rHome, quest: rQuest, armory: rArmory, gacha: rGacha, more: rMore,
       gear: rGear, forge: rForge, magi: rMagi, shop: rShop, help: rHelp, bosslist: rBossList }[id] || function () {})();
    // nav highlight
    var nb = el.querySelector('.navbar');
    if (nb) Array.prototype.forEach.call(nb.children, function (b) { b.classList.toggle('on', b.getAttribute('data-nav') === id); });
  }

  function renderCur(id) {
    var c = $('cur-' + id); if (!c) return;
    c.innerHTML =
      '<b class="g">⬤ ' + fmt(S.gold) + '</b>' +
      '<b class="m">◈ ' + fmt(S.gem) + '</b>' +
      '<b class="t">▤ ' + fmt(S.ticket) + '</b>' +
      '<b class="p">✦ ' + fmt(S.pikke) + '</b>';
  }
  function refresh() { renderCur(cur); }

  /* ------------------------------------------------------------- HOME ---- */
  function rHome() {
    var b = $('body-home');
    var area = G.areaById(S.area) || G.AREAS[0];
    var nextStory = G.STORY.find(function (q) { return S.story.done.indexOf(q.id) < 0; });
    var pb = S.pendingBoss ? G.behemothById(S.pendingBoss.id) : null;

    var html = '';
    var hst = G.buildStats(S);
    var power = Math.round(hst.hp * 0.5 + hst.atk * 6 + hst.def * 4 + hst.edef * 1.2);
    html += '<div class="home-hero"><canvas id="heroCv" width="300" height="250"></canvas>' +
            '<div class="lvchip">Lv. ' + S.lv + ' · ' + S.name + '</div>' +
            '<div class="area">' + area.n + '</div>' +
            '<div class="power">⚔ Sức mạnh <b>' + fmt(power) + '</b></div></div>';

    if (pb) {
      html += '<div class="banner event"><div class="npc">🐲</div><div class="t">' +
        '<b>' + pb.n + ' đang chờ</b><span>' + rankChip(pb.rank) + ' · ' + G.WEAPONS[pb.weapon].vi +
        ' · ' + G.WTYPES[pb.type].vi + ' · ' + elemDot(pb.el) + ' ' + G.ELEMENTS[pb.el].vi + '</span></div>' +
        '<button class="btn go" data-act="fightPending">ĐÁNH</button></div>';
    }
    if (nextStory) {
      var pr = questProgressText(nextStory);
      html += '<div class="banner main"><div class="npc">👩</div><div class="t">' +
        '<span class="kind" style="color:#8ee8a8">STORY</span> ' +
        '<b>' + nextStory.vi + '</b><span>' + nextStory.n + ' — ' + pr + '</span></div>' +
        '<button class="btn go" data-act="goQuest">ĐI</button></div>';
    } else {
      html += '<div class="banner main"><div class="npc">👩</div><div class="t"><b>Hết cốt truyện mùa 1</b>' +
        '<span>Pamela không còn việc nào cho bạn nữa. Đi săn Behemoth thôi.</span></div></div>';
    }

    // Nhiệm vụ ngày / tuần
    html += '<div class="card"><h3>Nhiệm vụ ngày</h3>' + recurrentRows(S.daily.picks, G.DAILY, S.daily.done, 'd') +
      recurrentBonus(G.DAILY_BONUS, S.daily, 3, 'd') + '</div>';
    html += '<div class="card"><h3>Nhiệm vụ tuần</h3>' + recurrentRows(S.weekly.picks, G.WEEKLY, S.weekly.done, 'w') +
      recurrentBonus(G.WEEKLY_BONUS, S.weekly, 4, 'w') + '</div>';

    html += '<div class="grid2">' +
      '<button class="btn" data-act="forge">⚒️ Lò rèn</button>' +
      '<button class="btn" data-act="magi">💠 Magi</button>' +
      '<button class="btn" data-act="shop">🛒 Tiệm Pikke</button>' +
      '<button class="btn" data-act="help">❔ Cách chơi</button>' +
      '</div>';

    b.innerHTML = html;
    drawHero();
    b.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act');
      if (a === 'fightPending') startBoss(S.pendingBoss.id, S.pendingBoss.lv, true);
      else if (a === 'goQuest') show('quest');
      else if (a === 'forge') show('forge');
      else if (a === 'magi') show('magi');
      else if (a === 'shop') show('shop');
      else if (a === 'help') show('help');
      else if (a === 'claim') { claimRecurrent(t.getAttribute('data-k'), t.getAttribute('data-id')); }
    };
  }

  function recurrentRows(picks, defs, done, kind) {
    return picks.map(function (id) {
      var q = defs.find(function (x) { return x.id === id; }); if (!q) return '';
      var p = G.questProgress(S, q);
      var claimed = !!done[id];
      return '<div class="row" style="margin-bottom:5px">' +
        '<span style="font-size:11px;flex:1">' + q.n + ' <b style="color:' + (p.done ? '#3fd66a' : '#9fb2c4') + '">' + p.have + '/' + p.want + '</b></span>' +
        (claimed ? '<span style="font-size:10px;color:#5a6a7a">đã nhận</span>'
                 : '<button class="btn sm ' + (p.done ? 'pri' : 'dis') + '" data-act="claim" data-k="' + kind + '" data-id="' + id + '">Nhận</button>') +
        '</div>';
    }).join('');
  }
  function recurrentBonus(bonus, store, need, kind) {
    var n = 0; (store.picks || []).forEach(function (id) { if (store.done[id]) n++; });
    var ok = n >= need, claimed = !!store.done[bonus.id];
    return '<div class="row" style="border-top:1px dashed rgba(255,255,255,.1);padding-top:6px;margin-top:4px">' +
      '<span style="font-size:11px;flex:1;color:#f2c94b">' + bonus.n + ' <b>' + n + '/' + need + '</b></span>' +
      (claimed ? '<span style="font-size:10px;color:#5a6a7a">đã nhận</span>'
               : '<button class="btn sm ' + (ok ? 'pri' : 'dis') + '" data-act="claim" data-k="' + kind + '" data-id="' + bonus.id + '">Nhận</button>') +
      '</div>';
  }
  function claimRecurrent(kind, id) {
    var store = kind === 'd' ? S.daily : S.weekly;
    var defs = kind === 'd' ? G.DAILY : G.WEEKLY;
    var bonus = kind === 'd' ? G.DAILY_BONUS : G.WEEKLY_BONUS;
    var need = kind === 'd' ? 3 : 4;
    if (store.done[id]) return;
    if (id === bonus.id) {
      var n = 0; store.picks.forEach(function (x) { if (store.done[x]) n++; });
      if (n < need) { toast('Chưa xong đủ nhiệm vụ', '#c34141'); return; }
      G.grant(S, bonus.rw); store.done[id] = 1;
    } else {
      var q = defs.find(function (x) { return x.id === id; });
      if (!q || !G.questProgress(S, q).done) { toast('Chưa hoàn thành', '#c34141'); return; }
      G.grant(S, q.rw); store.done[id] = 1;
    }
    toast('Đã nhận thưởng', '#3fd66a'); save(); rHome(); refresh();
  }

  function questProgressText(q) {
    var g = q.goal, p = S.progress || {};
    if (g.kill) return 'giết quái ' + Math.min(g.kill, p.kill || 0) + '/' + g.kill;
    if (g.boss) return 'hạ Behemoth ' + Math.min(g.boss, p.boss || 0) + '/' + g.boss;
    if (g.bossId) { var b = G.behemothById(g.bossId); return 'hạ ' + (b ? b.n : g.bossId); }
    if (g.bossRank) return 'hạ một Behemoth hạng ' + g.bossRank;
    if (g.mat) return 'nhặt ' + G.MATERIALS[g.mat].n + ' ' + Math.min(g.n, S.mats[g.mat] || 0) + '/' + g.n;
    return '';
  }
  function storyDone(q) {
    var g = q.goal, p = S.progress || {};
    if (g.kill) return (p.kill || 0) >= g.kill;
    if (g.boss) return (p.boss || 0) >= g.boss;
    if (g.bossId) return (p['bossId_' + g.bossId] || 0) >= 1;
    if (g.bossRank) return (p['bossRank_' + g.bossRank] || 0) >= 1;
    if (g.mat) return (S.mats[g.mat] || 0) >= g.n;
    return false;
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

    ctx.save(); ctx.translate(150, 196); ctx.scale(3.6, 3.6);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 4, 14, 4, 0, 0, 6.2832); ctx.fill();
    var skin = ['#f0d0b0', '#e8c098', '#d8a878', '#c08858', '#9a6a42', '#7a5030', '#5c3a22', '#f8e0c8'][S.skin || 2];
    ctx.fillStyle = '#3b6ea5'; ctx.beginPath(); ctx.ellipse(0, -10, 9, 12, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#2a4f78'; ctx.fillRect(-8, -6, 16, 8);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -24, 7.5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ['#2a2a2a', '#6a4a2a', '#c8a850', '#c04040', '#4060c0', '#40a060', '#a050c0', '#e8e8e8',
                     '#f08040', '#40c0c0', '#8a5a3a', '#d8d040'][S.hairColor || 0];
    ctx.beginPath(); ctx.arc(0, -26, 8, Math.PI, 6.2832); ctx.fill();
    // vũ khí đang cầm ở khe 1
    var eq = G.equipped(S), w = eq.weapons.find(Boolean);
    if (w) {
      var col = G.ELEMENTS[w.el || 'none'].color;
      ctx.fillStyle = '#dfe8f0';
      if (w.wclass === 'great') { ctx.fillRect(11, -34, 5, 32); ctx.fillStyle = col; ctx.fillRect(11, -34, 5, 8); }
      else if (w.wclass === 'spear') { ctx.fillStyle = '#8a6a4a'; ctx.fillRect(12, -40, 2.5, 40); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(13, -48); ctx.lineTo(17, -38); ctx.lineTo(9, -38); ctx.fill(); }
      else if (w.wclass === 'bow') { ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(13, -18, 13, -1.2, 1.2); ctx.stroke(); }
      else { ctx.fillRect(11, -28, 3.5, 22); ctx.fillStyle = col; ctx.fillRect(11, -28, 3.5, 6); }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ QUEST ---- */
  function rQuest() {
    var b = $('body-quest');
    var html = '';
    var nextStory = G.STORY.find(function (q) { return S.story.done.indexOf(q.id) < 0; });
    if (nextStory) {
      var can = storyDone(nextStory);
      html += '<div class="card"><h3>📜 ' + nextStory.vi + ' <span style="font-size:10px;color:#9fb2c4">' + nextStory.n + '</span></h3>' +
        '<p>' + questProgressText(nextStory) + '</p><div class="row">' +
        '<span style="font-size:11px;color:#f2c94b">Thưởng: ' + rwText(nextStory.rw) + '</span><span class="spacer"></span>' +
        '<button class="btn ' + (can ? 'pri' : 'dis') + '" data-act="claimStory">Nhận thưởng</button></div></div>';
    }

    html += '<div class="card"><h3>Vùng đất</h3><div class="grid2" id="areaGrid">';
    G.AREAS.forEach(function (a, i) {
      var unlocked = S.unlocked.hasOwnProperty(a.id) || i === 0;
      html += '<button class="item ' + (S.area === a.id ? 'sel' : '') + '" data-area="' + a.id + '" ' + (unlocked ? '' : 'disabled style="opacity:.35"') + '>' +
        '<div class="nm">' + a.vi + '</div><div class="sub">' + a.n + '<br>Lv ' + a.lv[0] + '–' + a.lv[1] + (unlocked ? '' : ' · 🔒') + '</div></button>';
    });
    html += '</div></div>';

    var area = G.areaById(S.area) || G.AREAS[0];
    html += '<div class="card"><h3>Map trong ' + area.vi + '</h3>';
    area.maps.forEach(function (m, i) {
      var open = i <= (S.unlocked[area.id] || 0);
      html += '<div class="row" style="margin-bottom:6px">' +
        '<span style="font-size:11px;flex:1">' + (open ? '' : '🔒 ') + m.n + '<br><span style="font-size:9.5px;color:#9fb2c4">Lv.' + m.lv +
        ' · ' + m.tribes.map(function (t) { return G.TRIBES[t].en; }).join(', ') + ' · cần ' + m.kills + ' con để mở cổng</span></span>' +
        '<button class="btn ' + (open ? 'go' : 'dis') + '" data-map="' + i + '">VÀO</button></div>';
    });
    html += '</div>';

    html += '<div class="card"><h3>Sudden Behemoth ở vùng này</h3><p>Đang farm ngoài map thì có thể gặp. ' +
      'Loại <b style="color:#f2c94b">Rare</b> khó hơn nhưng rơi đồ hiếm.</p><div>' +
      area.sudden.map(function (id) { var x = G.behemothById(id); return x ? '<span class="mat-chip">' + rankChip(x.rank) + ' ' + x.n + '</span>' : ''; }).join('') +
      (area.rare || []).map(function (id) { var x = G.behemothById(id); return x ? '<span class="mat-chip" style="border-color:#f2c94b">★ ' + x.n + '</span>' : ''; }).join('') +
      '</div></div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var a = e.target.closest('[data-area]');
      if (a) { S.area = a.getAttribute('data-area'); S.mapIdx = 0; save(); rQuest(); return; }
      var m = e.target.closest('[data-map]');
      if (m && !m.classList.contains('dis')) { startField(S.area, +m.getAttribute('data-map')); return; }
      var c = e.target.closest('[data-act="claimStory"]');
      if (c && nextStory && storyDone(nextStory)) {
        S.story.done.push(nextStory.id);
        G.grant(S, nextStory.rw);
        // Xong một chặng cốt truyện thì mở vùng kế (đúng luật bản gốc: boss nằm giữa các map).
        var idx = G.AREAS.findIndex(function (x) { return x.id === nextStory.area; });
        var nx = G.AREAS[idx + 1];
        if (nx && !S.unlocked.hasOwnProperty(nx.id)) {
          var stillSame = G.STORY.some(function (q) { return q.area === nextStory.area && S.story.done.indexOf(q.id) < 0; });
          if (!stillSame) { S.unlocked[nx.id] = 0; toast('MỞ VÙNG MỚI: ' + nx.vi, '#f2c94b'); }
        }
        toast('Hoàn thành: ' + nextStory.vi, '#3fd66a');
        save(); rQuest(); refresh();
      }
    };
  }

  function rwText(rw) {
    var p = [];
    if (rw.exp) p.push(rw.exp + ' EXP'); if (rw.gold) p.push(fmt(rw.gold) + ' Gold');
    if (rw.gem) p.push(rw.gem + ' Gem'); if (rw.ticket) p.push(rw.ticket + ' Vé');
    if (rw.pikke) p.push(rw.pikke + ' Pikke');
    return p.join(' · ');
  }

  /* ----------------------------------------------------------- ARMORY ---- */
  function rArmory() {
    var b = $('body-armory'), eq = G.equipped(S);
    var st = G.buildStats(S);
    var html = '';
    html += '<div class="card"><h3>Chỉ số</h3><div class="row wrap" style="font-size:11px;gap:12px">' +
      '<span>❤️ HP <b>' + fmt(st.hp) + '</b></span>' +
      '<span>⚔️ Công <b>' + fmt(st.atk) + '</b></span>' +
      '<span>🛡️ Thủ <b>' + fmt(st.def) + '</b></span>' +
      '<span>✨ Thủ hệ <b>' + fmt(st.edef) + '</b></span>' +
      '</div>' + (st.setBonus ? '<p style="color:#f2c94b;margin-top:6px">Bonus mặc đủ bộ ' +
        (G.behemothById(st.setBonus) || {}).n + ': HP +10%, Công +8%, Thủ +10%</p>' : '') + '</div>';

    html += '<div class="card"><h3>Ba khe vũ khí (đổi được giữa trận)</h3><div class="grid3">';
    for (var i = 0; i < 3; i++) {
      var g = eq.weapons[i];
      html += '<button class="item" data-wslot="' + i + '">' + (g
        ? '<div class="nm">' + g.name + '</div><div class="sub">' + rankChip(g.rank) + ' ' + G.WEAPONS[g.wclass].vi +
          '<br>' + G.WTYPES[g.wtype].vi + ' ' + elemDot(g.el) + '<br>Lv.' + g.lv + lbDots(g) + '</div>'
        : '<div class="nm" style="opacity:.4">Khe ' + (i + 1) + '</div><div class="sub">trống</div>') + '</button>';
    }
    html += '</div></div>';

    html += '<div class="card"><h3>Giáp</h3><div class="grid2">';
    ['head', 'body', 'arm', 'leg'].forEach(function (k) {
      var g = eq[k], nm = { head: 'Đầu', body: 'Thân', arm: 'Tay', leg: 'Chân' }[k];
      html += '<button class="item" data-aslot="' + k + '">' + (g
        ? '<div class="nm">' + g.name + '</div><div class="sub">' + nm + ' · ' + rankChip(g.rank) + ' Lv.' + g.lv + lbDots(g) + '</div>'
        : '<div class="nm" style="opacity:.4">' + nm + '</div><div class="sub">trống</div>') + '</button>';
    });
    html += '</div></div>';

    html += '<div class="card"><h3>Túi đồ</h3><div class="row" style="gap:5px;margin-bottom:7px">' +
      ['weapon', 'head', 'body', 'arm', 'leg'].map(function (k) {
        return '<button class="btn sm ' + (gearFilter === k ? 'pri' : '') + '" data-filter="' + k + '">' +
          { weapon: 'Vũ khí', head: 'Đầu', body: 'Thân', arm: 'Tay', leg: 'Chân' }[k] + '</button>';
      }).join('') + '</div><div class="grid2">';
    var list = S.gear.filter(function (g) { return g.kind === gearFilter; });
    if (!list.length) html += '<div class="empty-note" style="grid-column:1/-1">Chưa có món nào. Hạ Behemoth lấy Tablet rồi vào Lò rèn.</div>';
    list.forEach(function (g) {
      html += '<button class="item" data-gear="' + g.uid + '"><div class="corner">' + rankChip(g.rank) + '</div>' +
        '<div class="nm">' + g.name + '</div><div class="sub">' +
        (g.kind === 'weapon' ? G.WEAPONS[g.wclass].vi + ' · ' + G.WTYPES[g.wtype].vi + ' ' + elemDot(g.el) : 'Giáp ' + elemDot(g.defEl || 'none')) +
        '<br>Lv.' + g.lv + '/' + G.MAX_LV + (g.evo ? ' ·進' + g.evo : '') + lbDots(g) + '</div>' + slotsHtml(g) + '</button>';
    });
    html += '</div></div>';

    html += '<div class="card"><h3>Nguyên liệu</h3><div>' + matChips() + '</div></div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { gearFilter = f.getAttribute('data-filter'); rArmory(); return; }
      var g = e.target.closest('[data-gear]');
      if (g) { selGear = g.getAttribute('data-gear'); show('gear'); return; }
      var ws = e.target.closest('[data-wslot]');
      if (ws) { gearFilter = 'weapon'; toast('Chọn một vũ khí trong túi để lắp vào khe ' + (+ws.getAttribute('data-wslot') + 1)); pendingSlot = { kind: 'weapon', i: +ws.getAttribute('data-wslot') }; rArmory(); return; }
      var as = e.target.closest('[data-aslot]');
      if (as) { gearFilter = as.getAttribute('data-aslot'); pendingSlot = { kind: as.getAttribute('data-aslot') }; toast('Chọn một món trong túi để mặc'); rArmory(); return; }
    };
  }
  var pendingSlot = null;

  function lbDots(g) {
    var s = '<span class="lb">';
    for (var i = 0; i < 4; i++) s += '<i class="' + (i < g.lb ? 'on' : '') + '"></i>';
    return s + '</span>';
  }
  function slotsHtml(g) {
    var n = G.gearSlots(g), s = '<div class="slots">';
    for (var i = 0; i < 3; i++) {
      var shape = g.shapes[i], locked = i >= n;
      var m = G.magiByUid(S, g.magi[i]);
      s += '<i class="slot ' + shape + ' ' + (locked ? 'locked' : '') + '">' +
        (m ? '<b style="color:' + G.MAGI_SHAPES[m.shape].color + '">' + G.MAGI_SHAPES[m.shape].sym + '</b>'
           : (G.MAGI_SHAPES[shape] || {}).sym || '') + '</i>';
    }
    return s + '</div>';
  }
  function matChips() {
    var out = '';
    Object.keys(S.mats).forEach(function (id) {
      if (!S.mats[id]) return;
      var m = G.MATERIALS[id]; if (!m) return;
      out += '<span class="mat-chip">' + rankChip(m.r) + ' ' + m.n + ' ×' + S.mats[id] + '</span>';
    });
    return out || '<span class="hint">Chưa có nguyên liệu nào.</span>';
  }

  /* ---------------------------------------------------- CHI TIẾT TRANG BỊ */
  function rGear() {
    var g = S.gear.find(function (x) { return x.uid === selGear; });
    var b = $('body-gear');
    if (!g) { b.innerHTML = '<div class="empty-note">Không tìm thấy món này.</div>'; return; }
    var gs = G.gearStats(g);
    var eq = G.equipped(S);
    var equipped = (g.kind === 'weapon') ? S.loadout.weapons.indexOf(g.uid) >= 0 : S.loadout[g.kind] === g.uid;

    var html = '<div class="card"><div class="row"><h3 style="flex:1">' + g.name + '</h3>' + rankChip(g.rank) + '</div>';
    if (g.kind === 'weapon') {
      var Wd = G.WEAPONS[g.wclass];
      html += '<p>' + Wd.vi + ' (' + Wd.jp + ') · loại <b style="color:' + G.WTYPES[g.wtype].color + '">' + G.WTYPES[g.wtype].vi + '</b> · ' +
        elemDot(g.el) + ' ' + G.ELEMENTS[g.el].vi + '</p>' +
        '<p><b>Giữ để dùng:</b> ' + Wd.specialVi + '</p><p>' + Wd.desc + '</p>' +
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

    // Ô Magi
    html += '<div class="card"><h3>Ô Magi</h3><p>Chỉ lắp được Magi CÙNG HÌNH DẠNG với ô. Ô thứ ' +
      (g.kind === 'weapon' ? '3' : '2') + ' mở khi Limit Break đủ 4 lần.</p>';
    var n = G.gearSlots(g);
    for (var i = 0; i < 3; i++) {
      var shape = g.shapes[i], locked = i >= n, m = G.magiByUid(S, g.magi[i]);
      html += '<div class="row" style="margin-bottom:5px;opacity:' + (locked ? '.35' : '1') + '">' +
        '<span class="slot ' + shape + '">' + (G.MAGI_SHAPES[shape] || {}).sym + '</span>' +
        '<span style="font-size:11px;flex:1">' + (m ? m.n + ' <b style="color:#9fb2c4">Lv.' + m.lv + '</b>' : (locked ? 'chưa mở' : 'trống — ' + G.MAGI_SHAPES[shape].vi)) + '</span>' +
        (locked ? '' : '<button class="btn sm" data-slot="' + i + '">' + (m ? 'Đổi' : 'Lắp') + '</button>') +
        (m && !locked ? '<button class="btn sm red" data-unslot="' + i + '">✕</button>' : '') +
        '</div>';
    }
    if (selMagiSlot >= 0) {
      var want = g.shapes[selMagiSlot];
      html += '<div style="border-top:1px dashed rgba(255,255,255,.12);margin-top:7px;padding-top:7px">' +
        '<p>Chọn Magi hình <b>' + G.MAGI_SHAPES[want].sym + ' ' + G.MAGI_SHAPES[want].vi + '</b>:</p><div class="grid2">';
      var avail = S.magi.filter(function (inst) { var d = G.magiById(inst.id); return d && d.shape === want; });
      if (!avail.length) html += '<div class="empty-note" style="grid-column:1/-1">Không có Magi hình này. Triệu hồi thêm.</div>';
      avail.forEach(function (inst) {
        var d = G.magiById(inst.id);
        html += '<button class="item" data-putmagi="' + inst.uid + '"><div class="corner">' + rankChip(d.rank) + '</div>' +
          '<div class="nm">' + d.n + '</div><div class="sub">Lv.' + inst.lv + '<br>' + d.d.slice(0, 60) + '…</div></button>';
      });
      html += '</div></div>';
    }
    html += '</div>';

    // Nâng cấp
    var ec = G.enhanceCost(g), lc = G.limitBreakCost(g), vc = G.evolveCost(g);
    html += '<div class="card"><h3>Nâng cấp</h3>' +
      '<button class="btn ' + (g.lv < G.MAX_LV && G.canPay(S, ec) ? 'pri' : 'dis') + '" data-act="enhance" style="width:100%;margin-bottom:6px">' +
        'Nâng cấp → Lv.' + Math.min(G.MAX_LV, g.lv + 1) + ' · ' + fmt(ec.gold) + ' Gold + ' + ec.mat.str_stone + ' Strengthening Stone</button>' +
      '<button class="btn ' + (g.lb < 4 && G.canPay(S, lc) ? 'pri' : 'dis') + '" data-act="lb" style="width:100%;margin-bottom:6px">' +
        'Limit Break ' + (g.lb + 1) + '/4' + (g.lb === 3 ? ' — MỞ Ô MAGI' : '') + ' · ' + fmt(lc.gold) + ' Gold + Lapis</button>' +
      '<button class="btn ' + (G.canEvolve(g) && G.canPay(S, vc) ? 'pri' : 'dis') + '" data-act="evolve" style="width:100%;margin-bottom:6px">' +
        'Tiến hóa (về Lv.1, chỉ số cao hơn) · ' + fmt(vc.gold) + ' Gold + ' + vc.mat.crystal + ' Crystal</button>' +
      '<div class="row"><button class="btn ' + (equipped ? 'dis' : 'go') + '" data-act="equip" style="flex:1">' + (equipped ? 'Đang mặc' : 'Trang bị') + '</button>' +
      '<button class="btn red" data-act="dismantle">Rã lấy Lapis</button></div></div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-act],[data-slot],[data-unslot],[data-putmagi]'); if (!t) return;
      var a = t.getAttribute('data-act');
      var r;
      if (t.hasAttribute('data-slot')) { selMagiSlot = +t.getAttribute('data-slot'); rGear(); return; }
      if (t.hasAttribute('data-unslot')) { G.equipMagi(S, g, +t.getAttribute('data-unslot'), null); save(); rGear(); return; }
      if (t.hasAttribute('data-putmagi')) {
        r = G.equipMagi(S, g, selMagiSlot, t.getAttribute('data-putmagi'));
        if (!r.ok) toast(r.why, '#c34141'); else { selMagiSlot = -1; save(); }
        rGear(); return;
      }
      if (a === 'enhance') r = G.enhance(S, g);
      else if (a === 'lb') { r = G.limitBreak(S, g); if (r.ok && r.unlockedSlot) toast('MỞ Ô MAGI THỨ ' + (g.kind === 'weapon' ? 3 : 2) + '!', '#f2c94b'); }
      else if (a === 'evolve') r = G.evolve(S, g);
      else if (a === 'reroll') r = G.reroll(S, g);
      else if (a === 'equip') {
        if (g.kind === 'weapon') {
          var idx = (pendingSlot && pendingSlot.kind === 'weapon') ? pendingSlot.i : S.loadout.weapons.indexOf(null);
          if (idx < 0) idx = 0;
          S.loadout.weapons = S.loadout.weapons.map(function (u) { return u === g.uid ? null : u; });
          S.loadout.weapons[idx] = g.uid;
        } else S.loadout[g.kind] = g.uid;
        pendingSlot = null; r = { ok: true }; toast('Đã trang bị', '#3fd66a');
      } else if (a === 'dismantle') {
        r = G.dismantle(S, g);
        if (r.ok) { toast('Rã được ' + r.n + ' ' + G.MATERIALS[r.lapis].n, '#7fe3f0'); save(); show('armory'); return; }
      }
      if (r && !r.ok) toast(r.why, '#c34141');
      save(); rGear(); refresh();
    };
  }

  /* ------------------------------------------------------------- FORGE --- */
  function rForge() {
    var b = $('body-forge');
    var owned = Object.keys(S.bossKills).filter(function (k) { return S.bossKills[k] > 0; });
    var html = '<div class="card"><p>Bản gốc: gacha ra <b>một con boss để đi đánh</b>, hạ xong mới có ' +
      '<b>Tablet</b> để tự chế đồ. Hạ <b>5 con cùng loại</b> là đủ 4 giáp + 1 vũ khí.</p></div>';
    if (!owned.length) html += '<div class="empty-note">Chưa có Tablet nào. Đi hạ Behemoth đã.</div>';
    owned.forEach(function (bid) {
      var bh = G.behemothById(bid); if (!bh) return;
      html += '<div class="card"><div class="row"><h3 style="flex:1">' + bh.n + '</h3>' + rankChip(bh.rank) +
        '<span style="font-size:11px;color:#f2c94b;margin-left:6px">Tablet ×' + S.bossKills[bid] + '</span></div>' +
        '<p>' + G.WEAPONS[bh.weapon].vi + ' · ' + G.WTYPES[bh.type].vi + ' · ' + elemDot(bh.el) + ' ' + G.ELEMENTS[bh.el].vi + '</p>' +
        '<div class="grid3">';
      ['weapon', 'head', 'body', 'arm', 'leg'].forEach(function (k) {
        var has = G.hasGear(S, bid, k);
        var c = G.craftCost(bh, k);
        html += '<button class="item ' + (has ? '' : '') + '" data-craft="' + bid + '|' + k + '" ' + (has ? 'disabled style="opacity:.4"' : '') + '>' +
          '<div class="nm">' + { weapon: '⚔️ Vũ khí', head: '🪖 Đầu', body: '🥋 Thân', arm: '🧤 Tay', leg: '👢 Chân' }[k] + '</div>' +
          '<div class="sub">' + (has ? 'đã chế' : fmt(c.gold) + ' Gold<br>+1 Tablet') + '</div></button>';
      });
      html += '</div></div>';
    });
    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-craft]'); if (!t) return;
      var p = t.getAttribute('data-craft').split('|');
      var r = G.craft(S, p[0], p[1]);
      if (!r.ok) toast(r.why, '#c34141'); else toast('Chế được ' + r.gear.name, '#3fd66a');
      save(); rForge(); refresh();
    };
  }

  /* -------------------------------------------------------------- MAGI --- */
  function rMagi() {
    var b = $('body-magi');
    var html = '<div class="card"><p>Bốn loại: ★ Công kích · ♥ Hồi phục · ◆ Hỗ trợ (ba loại này gắn vào ' +
      '<b>vũ khí</b>) · ● Bị động (gắn vào <b>giáp</b>). Ô có hình dạng — chỉ lắp được Magi cùng hình.</p></div>';
    if (!S.magi.length) html += '<div class="empty-note">Chưa có Magi. Sang Triệu hồi.</div>';
    var byShape = {};
    S.magi.forEach(function (inst) { var d = G.magiById(inst.id); if (!d) return; (byShape[d.shape] = byShape[d.shape] || []).push({ i: inst, d: d }); });
    ['star', 'heart', 'diamond', 'circle'].forEach(function (sh) {
      var list = byShape[sh]; if (!list) return;
      var SH = G.MAGI_SHAPES[sh];
      html += '<div class="card"><h3 style="color:' + SH.color + '">' + SH.sym + ' ' + SH.vi + ' (' + list.length + ')</h3><div class="grid2">';
      list.sort(function (a, b2) { return G.RANK_ORDER.indexOf(b2.d.rank) - G.RANK_ORDER.indexOf(a.d.rank); });
      list.forEach(function (x) {
        var max = G.MAGI_MAXLV[x.d.rank];
        var c = G.magiEnhanceCost({ rank: x.d.rank, lv: x.i.lv });
        html += '<div class="item"><div class="corner">' + rankChip(x.d.rank) + '</div>' +
          '<div class="nm">' + x.d.n + '</div>' +
          '<div class="sub">Lv.' + x.i.lv + '/' + max + ' · sức mạnh ×' + G.magiPower({ rank: x.d.rank, lv: x.i.lv }).toFixed(2) + '<br>' + x.d.d + '</div>' +
          '<button class="btn sm ' + (x.i.lv < max && G.canPay(S, c) ? 'pri' : 'dis') + '" data-upmagi="' + x.i.uid + '" style="margin-top:5px">' +
          'Nâng · ' + fmt(c.gold) + 'G + ' + c.mat.magi_frag + ' mảnh</button></div>';
      });
      html += '</div></div>';
    });
    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-upmagi]'); if (!t) return;
      var inst = S.magi.find(function (m) { return m.uid === t.getAttribute('data-upmagi'); });
      var r = G.enhanceMagi(S, inst);
      if (!r.ok) toast(r.why, '#c34141');
      save(); rMagi(); refresh();
    };
  }

  /* ------------------------------------------------------------- GACHA --- */
  function rGacha() {
    var b = $('body-gacha');
    var html = '';
    html += '<div class="gacha-hero"><b>QUEST GACHA</b><span>Ra một con Behemoth để đi đánh — không ra vũ khí</span>' +
      '<div class="rate-tab"><b style="color:#f2d24b">SS 3%</b><b style="color:#f2a03c">S 15%</b>' +
      '<b style="color:#b06fd0">A 55%</b><b style="color:#5b8fd6">B 27%</b></div></div>';
    html += '<div class="card"><div class="row">' +
      '<button class="btn ' + (S.ticket >= 5 ? 'pri' : 'dis') + '" data-act="b1" style="flex:1">Đơn — 5 vé</button>' +
      '<button class="btn ' + (S.ticket >= 50 ? 'pri' : 'dis') + '" data-act="b10" style="flex:1">10+1 — 50 vé <span style="font-size:9px">(bảo hiểm SS)</span></button>' +
      '</div><p style="margin-top:7px">Vé: <b>' + S.ticket + '</b>. Hết vé thì mua ở tiệm Pikke, hoặc làm nhiệm vụ tuần.</p></div>';

    html += '<div class="gacha-hero" style="background:radial-gradient(90% 100% at 50% 100%,#2f4a6a,#101620 70%)">' +
      '<b>MAGI GACHA</b><span>Đá kỹ năng lắp vào trang bị</span>' +
      '<div class="rate-tab"><b style="color:#f2d24b">SS 3%</b><b style="color:#f2a03c">S 9%</b>' +
      '<b style="color:#b06fd0">A 48%</b><b style="color:#5b8fd6">B 40%</b></div></div>';
    html += '<div class="card"><div class="row">' +
      '<button class="btn ' + (S.gem >= 25 ? 'pri' : 'dis') + '" data-act="m1" style="flex:1">Đơn — 25 Gem</button>' +
      '<button class="btn ' + (S.gem >= 250 ? 'pri' : 'dis') + '" data-act="m10" style="flex:1">10+1 — 250 Gem <span style="font-size:9px">(bảo hiểm SS)</span></button>' +
      '</div></div>';

    html += '<div class="card"><h3>Behemoth đang chờ đánh</h3>';
    if (S.pendingBoss) {
      var pb = G.behemothById(S.pendingBoss.id);
      html += '<div class="row"><span style="flex:1;font-size:12px">' + rankChip(pb.rank) + ' <b>' + pb.n + '</b><br>' +
        '<span style="font-size:10px;color:#9fb2c4">Lv.' + S.pendingBoss.lv + ' · ' + G.WEAPONS[pb.weapon].vi + ' · ' + elemDot(pb.el) + '</span></span>' +
        '<button class="btn go" data-act="fight">ĐÁNH</button></div>';
    } else html += '<p>Chưa có. Quay Quest Gacha đi.</p>';
    html += '<button class="btn" data-act="bosslist" style="width:100%;margin-top:7px">Xem toàn bộ ' + G.BEHEMOTHS.length + ' Behemoth</button></div>';

    html += '<div id="gachaOut"></div>';
    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act'), out = $('gachaOut');
      if (a === 'b1' || a === 'b10') {
        var cost = a === 'b1' ? 5 : 50, cnt = a === 'b1' ? 1 : 11;
        if (S.ticket < cost) { toast('Không đủ vé', '#c34141'); return; }
        S.ticket -= cost;
        var res = G.summonBehemoth(S, cnt, cnt > 1);
        // Bản gốc chỉ cho ĐI ĐÁNH từng con; ở đây con mạnh nhất được đưa lên chờ, phần còn lại thành vé/medal.
        var bestI = 0;
        res.forEach(function (x, i) { if (G.RANK_ORDER.indexOf(x.rank) > G.RANK_ORDER.indexOf(res[bestI].rank)) bestI = i; });
        S.pendingBoss = { id: res[bestI].id, lv: bossLevelFor(res[bestI]) };
        var extra = 0;
        res.forEach(function (x, i) { if (i !== bestI) { extra += { B: 1, A: 2, S: 4, SS: 8 }[x.rank] || 1; S.seenBoss[x.id] = 1; } });
        S.medal += extra; S.seenBoss[res[bestI].id] = 1;
        out.innerHTML = '<div class="card"><h3>Kết quả</h3>' + res.map(function (x, i) {
          return '<div class="row" style="font-size:11px;padding:3px 0"><span style="flex:1">' + rankChip(x.rank) + ' ' + x.n +
            (i === bestI ? ' <b style="color:#f2c94b">← đưa lên chờ đánh</b>' : '') + '</span>' + elemDot(x.el) + '</div>';
        }).join('') + '<p style="margin-top:6px">Các con còn lại đổi thành <b>' + extra + ' Medal</b>.</p></div>';
        save(); rGacha(); refresh(); return;
      }
      if (a === 'm1' || a === 'm10') {
        var g2 = a === 'm1' ? 25 : 250, c2 = a === 'm1' ? 1 : 11;
        if (S.gem < g2) { toast('Không đủ Gem', '#c34141'); return; }
        S.gem -= g2;
        var mr = G.summonMagi(S, c2, c2 > 1);
        $('gachaOut').innerHTML = '<div class="card"><h3>Kết quả</h3>' + mr.map(function (x) {
          return '<div class="row" style="font-size:11px;padding:3px 0"><span style="flex:1">' + rankChip(x.rank) + ' ' +
            '<b style="color:' + G.MAGI_SHAPES[x.shape].color + '">' + G.MAGI_SHAPES[x.shape].sym + '</b> ' + x.n + '</span></div>';
        }).join('') + '</div>';
        save(); rGacha(); refresh(); return;
      }
      if (a === 'fight') { startBoss(S.pendingBoss.id, S.pendingBoss.lv, true); return; }
      if (a === 'bosslist') { show('bosslist'); return; }
    };
  }

  function bossLevelFor(b) {
    var base = { B: 8, A: 20, S: 34, SS: 48 }[b.rank] || 8;
    return Math.max(base, Math.min(base + 20, S.lv + { B: -2, A: 2, S: 6, SS: 10 }[b.rank]));
  }

  function rBossList() {
    var b = $('body-bosslist'), html = '';
    ['SS', 'S', 'A', 'B'].forEach(function (rk) {
      var list = G.BEHEMOTHS.filter(function (x) { return x.rank === rk; });
      if (!list.length) return;
      html += '<div class="card"><h3>' + rankChip(rk) + ' — ' + list.length + ' con</h3><div class="grid2">';
      list.forEach(function (x) {
        var kills = S.bossKills[x.id] || 0;
        html += '<div class="item"><div class="nm">' + x.n + '</div><div class="sub">' +
          G.WEAPONS[x.weapon].vi + ' · ' + G.WTYPES[x.type].vi + '<br>' + elemDot(x.el) + ' ' + G.ELEMENTS[x.el].vi +
          (kills ? '<br><b style="color:#f2c94b">Tablet ×' + kills + '</b>' : '') +
          '<br><span style="font-size:9px">Bộ phận: ' + (x.parts || []).join(', ') + '</span>' +
          '<br><span style="font-size:9px;color:#f2c94b">WEAK: ' + (x.wp || []).join(', ') + '</span>' +
          '</div></div>';
      });
      html += '</div></div>';
    });
    b.innerHTML = html;
  }

  /* -------------------------------------------------------------- SHOP --- */
  function rShop() {
    var b = $('body-shop');
    var html = '<div class="card"><p>Pikke Points chỉ có từ nhiệm vụ ngày/tuần. Bạn có <b style="color:#c8a0ff">' + fmt(S.pikke) + '</b>.</p></div>';
    html += '<div class="grid2">';
    G.SHOP.forEach(function (it) {
      var ok = S.pikke >= it.price.pikke;
      html += '<button class="item" data-buy="' + it.id + '"><div class="nm">' + it.n + '</div>' +
        '<div class="sub" style="color:' + (ok ? '#c8a0ff' : '#5a6a7a') + '">✦ ' + fmt(it.price.pikke) + '</div></button>';
    });
    html += '</div>';
    html += '<div class="card"><h3>Bình (Potion)</h3><p>Loại thường 30 phút, loại cao cấp mua bằng Gem có cả ba hiệu ứng và kéo dài 60 phút.</p>';
    Object.keys(G.ITEMS).forEach(function (id) {
      var it = G.ITEMS[id], have = S.inv[id] || 0;
      var active = (S.potions[id] || 0) > Date.now();
      html += '<div class="row" style="margin-bottom:5px"><span style="flex:1;font-size:11px">' + it.vi + ' <b>×' + have + '</b>' +
        (active ? ' <span style="color:#3fd66a">(đang bật)</span>' : '') + '<br><span style="font-size:9.5px;color:#9fb2c4">' + it.n + '</span></span>' +
        (it.premium ? '<button class="btn sm ' + (S.gem >= it.price.gem ? '' : 'dis') + '" data-buyp="' + id + '">◈ ' + it.price.gem + '</button>' : '') +
        '<button class="btn sm ' + (have ? 'pri' : 'dis') + '" data-use="' + id + '">Dùng</button></div>';
    });
    html += '</div>';
    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-buy],[data-use],[data-buyp]'); if (!t) return;
      if (t.hasAttribute('data-buy')) {
        var it = G.SHOP.find(function (x) { return x.id === t.getAttribute('data-buy'); });
        if (S.pikke < it.price.pikke) { toast('Không đủ Pikke Points', '#c34141'); return; }
        S.pikke -= it.price.pikke; S.stats.buys++; G.track(S, { buy: 1 });
        if (it.give.gold) S.gold += it.give.gold;
        if (it.give.ticket) S.ticket += it.give.ticket;
        if (it.give.item) S.inv[it.give.item] = (S.inv[it.give.item] || 0) + 1;
        if (it.give.mat) for (var m in it.give.mat) G.addMat(S, m, it.give.mat[m]);
        toast('Đã mua ' + it.n, '#3fd66a');
      } else if (t.hasAttribute('data-buyp')) {
        var id = t.getAttribute('data-buyp'), P = G.ITEMS[id];
        if (S.gem < P.price.gem) { toast('Không đủ Gem', '#c34141'); return; }
        S.gem -= P.price.gem; S.inv[id] = (S.inv[id] || 0) + 1; toast('Đã mua ' + P.vi, '#3fd66a');
      } else {
        var r = G.usePotion(S, t.getAttribute('data-use'));
        if (!r.ok) toast(r.why, '#c34141'); else { G.track(S, { potion: 1 }); toast('Đã dùng', '#3fd66a'); }
      }
      save(); rShop(); refresh();
    };
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

      '<div class="card"><h3>Thống kê</h3>' +
      '<div class="row wrap" style="font-size:11px;gap:14px">' +
      '<span>Behemoth hạ: <b>' + (st.boss || 0) + '</b></span><span>Quái hạ: <b>' + (st.mob || 0) + '</b></span>' +
      '<span>Bộ phận phá: <b>' + (st.parts || 0) + '</b></span><span>Chết: <b>' + (st.deaths || 0) + '</b></span>' +
      '<span>Trang bị: <b>' + S.gear.length + '</b></span><span>Magi: <b>' + S.magi.length + '</b></span>' +
      '<span>Medal: <b>' + fmt(S.medal) + '</b></span></div></div>' +

      '<div class="card"><h3>Về bản dựng lại này</h3>' +
      '<p>Dựng lại từ <b>Dragon Project</b> (COLOPL, 2016–2020) — game đã đóng cửa. Trọng tâm là ' +
      '<b>ぷにコン (Punicon)</b>: một ngón làm hết. Bản đồ thao tác, đặc thù 5 vũ khí, tỉ lệ gacha, ' +
      'tỉ lệ rơi đồ và thang chỉ số đều lấy từ wiki chính thức và bài 4Gamer 2016. ' +
      'Không dùng một file ảnh/âm thanh nào của game gốc — tất cả vẽ bằng code.</p>' +
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
      if (a === 'help') show('help');
      if (a === 'wipe') { G.wipe(); location.reload(); }
    };
    var ni = $('nameIn');
    if (ni) ni.onchange = function () { S.name = ni.value.slice(0, 14) || 'Hound'; save(); };
  }

  /* -------------------------------------------------------------- HELP --- */
  function rHelp() {
    var b = $('body-help');
    var html = '<div class="card"><h3>ぷにコン — Punicon</h3>' +
      '<p>Không có D-pad, không có hàng nút. Chạm <b>bất cứ đâu ở giữa màn hình</b> là cần gạt mọc ra ngay tại đó.</p>' +
      '<p><span class="kbd">KÉO</span> di chuyển — kéo nhẹ đi bộ, kéo hết vòng thì chạy.</p>' +
      '<p><span class="kbd">CHẠM</span> đánh thường. <span class="kbd">BẤM LIÊN TỤC</span> nối combo.</p>' +
      '<p><span class="kbd">VẨY</span> né/lăn. Né hủy được độ cứng sau đòn đánh.</p>' +
      '<p><span class="kbd">GIỮ</span> ra đòn đặc thù — <b>mỗi vũ khí một kiểu hoàn toàn khác</b>.</p>' +
      '<p><span class="kbd">GIỮ rồi TRƯỢT VỀ HƯỚNG NÚT MAGI</span> xả Magi. Không cần với tay tới nút — ' +
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

    html += '<div class="card"><h3>Năm vũ khí, năm bộ move set</h3>';
    G.WEAPON_ORDER.forEach(function (k) {
      var w = G.WEAPONS[k];
      html += '<p style="margin-bottom:8px"><b>' + w.vi + '</b> (' + w.jp + ') — combo ' + w.combo.length + ' đòn' +
        (w.finalSweep ? ' (đòn cuối quét vòng)' : '') + '<br>' +
        '<span style="color:#f2c94b">GIỮ: ' + w.specialVi + '</span><br>' +
        '<span style="color:#9fb2c4">' + w.desc + '</span></p>';
    });
    html += '</div>';

    html += '<div class="card"><h3>Đánh boss: vòng lặp cần thuộc</h3>' +
      '<p>1. Boss <b>lộ WEAK point</b> từng đợt (viền vàng, chữ WEAK).</p>' +
      '<p>2. Đánh vào đó → sát thương ×' + G.BAL.weakMul + ' và <b>nạp thanh gục</b> (thanh vàng nhỏ dưới thanh máu).</p>' +
      '<p>3. Thanh gục đầy → boss <b>nằm ra ' + (G.BAL.downMs / 1000) + ' giây</b>, ăn sát thương ×' + G.BAL.downDmgMul + '.</p>' +
      '<p>4. Đó là lúc xả Magi và đòn đặc thù mạnh nhất.</p>' +
      '<p>Đánh đủ vào một bộ phận thì <b>phá</b> được nó — rơi thêm nguyên liệu, và vùng đó ăn thêm sát thương.</p>' +
      '<p>Vùng <b style="color:#ff3b30">đỏ</b> là đòn boss sắp ra. Vòng trong thu nhỏ báo thời điểm nổ.</p></div>';

    html += '<div class="card"><h3>Hệ</h3><p>Vòng khắc chế: <b>Thủy ▸ Hỏa ▸ Thổ ▸ Lôi ▸ Thủy</b>, và <b>Quang ↔ Ám</b>. ' +
      'Khắc chế ×' + G.ELEM_ADV + ', bị khắc ×' + G.ELEM_DIS + '.</p></div>';

    html += '<div class="card"><h3>Thưởng Gem của trận boss</h3>' +
      '<p>Đúng như bản gốc, tối đa <b>4 Gem</b> mỗi con: không chết lần nào (+1), có dùng Magi (+1), ' +
      'hạ trong ' + (G.BAL.gemFastMs / 1000) + ' giây (+1), và đủ cả ba thì <b>+1 nữa</b>.</p></div>';

    b.innerHTML = html;
  }

  /* ======================================================== VÀO TRẬN ===== */
  function startField(areaId, mapIdx) {
    S.area = areaId; S.mapIdx = mapIdx;
    enterBattle({ mode: 'field', areaId: areaId, mapIdx: mapIdx });
  }
  function startBoss(bid, lv, fromGacha) {
    var area = G.areaById(S.area) || G.AREAS[0];
    enterBattle({ mode: 'boss', areaId: S.area, mapIdx: S.mapIdx, behemothId: bid, level: lv, fromGacha: fromGacha });
  }

  function enterBattle(opts) {
    Array.prototype.forEach.call(screens.children, function (c) { c.classList.remove('on'); });
    screens.style.display = 'none';
    hud.classList.add('on');
    $('resultScr').classList.remove('on');
    $('hDown').classList.remove('on');
    $('bossRow').style.display = opts.mode === 'boss' ? 'block' : 'none';
    $('hDist').style.display = opts.mode === 'boss' ? 'flex' : 'none';

    if (battle) battle.stop();
    battle = new G.Battle($('view'), S, opts, {
      onToast: toast,
      onHud: updateHud,
      onFinish: onFinish,
      onSudden: onSudden,
      onWeapon: function () { renderWeaponSlots(); renderMagiBtns(); }
    });
    renderWeaponSlots(); renderMagiBtns();
    battle.start();
  }

  function onSudden(bid, rare) {
    var b = G.behemothById(bid);
    toast((rare ? '★ RARE — ' : '') + 'GẶP ' + b.n + '!', rare ? '#f2c94b' : '#ff8a5a');
    // Bản gốc kéo cả map vào trận; ở đây chuyển sang sân boss sau một nhịp để đọc kịp dòng chữ.
    var lv = battle.map.lv + (rare ? 6 : 0);
    setTimeout(function () {
      if (!battle) return;
      var bag = battle.bag;
      enterBattle({ mode: 'boss', areaId: S.area, mapIdx: S.mapIdx, behemothId: bid, level: lv, sudden: true, rare: rare });
    }, 1400);
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
    $('hMagi0').onclick = function () { if (battle) battle.castMagi(0); };
    $('hMagi1').onclick = function () { if (battle) battle.castMagi(1); };
    $('hGemRevive').onclick = function () { if (battle && battle.gemRevive()) { $('hDown').classList.remove('on'); refresh(); } };
    $('hGiveUp').onclick = function () { leaveBattle(); };
  }

  function leaveBattle() {
    if (battle && battle.mode === 'field' && battle.bag) {
      G.track(S, { kill: battle.killed });
      S.progress.kill = (S.progress.kill || 0) + 0;
    }
    save(); show('home');
  }

  function renderWeaponSlots() {
    var eq = G.equipped(S), el = $('hWswitch'), html = '';
    for (var i = 0; i < 3; i++) {
      var g = eq.weapons[i];
      var on = battle && battle.player.wIdx === i;
      html += '<button class="wslot ' + (on ? 'on' : '') + ' ' + (g ? '' : 'empty') + '" data-w="' + i + '">' +
        (g ? G.WEAPONS[g.wclass].vi.split(' ')[0] + '<br>' + G.WTYPES[g.wtype].vi : '—') + '</button>';
    }
    el.innerHTML = html;
    el.onclick = function (e) {
      var t = e.target.closest('[data-w]'); if (!t || !battle) return;
      battle.setWeapon(+t.getAttribute('data-w'));
      renderWeaponSlots();
      renderMagiBtns();
    };
  }

  function renderMagiBtns() {
    for (var i = 0; i < 2; i++) {
      var btn = $('hMagi' + i);
      var m = battle && battle.wp ? battle.wp.magi[i] : null;
      if (!m) { btn.className = 'magi-btn empty tap'; btn.querySelector('.sym').textContent = ''; btn.querySelector('.rk').textContent = ''; continue; }
      btn.className = 'magi-btn tap';
      btn.querySelector('.sym').textContent = G.MAGI_SHAPES[m.shape].sym;
      btn.querySelector('.sym').style.color = G.MAGI_SHAPES[m.shape].color;
      btn.querySelector('.rk').textContent = m.rank;
      btn.querySelector('.rk').style.color = G.RANK_COLOR[m.rank];
      btn.title = m.n;
    }
  }

  function updateHud(bt) {
    var p = bt.player;
    // đồng hồ
    var t = Math.max(0, bt.timeLeft) / 1000;
    $('hTimer').textContent = Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2);
    // boss
    if (bt.mode === 'boss' && bt.boss) {
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
    // người chơi
    $('hPName').textContent = S.name;
    $('hPHpNum').textContent = Math.max(0, Math.round(p.hp));
    $('hPHp').style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
    $('hPSh').style.width = Math.min(100, p.shield / p.maxHp * 100) + '%';
    var need = G.BAL.expToLv(S.lv);
    $('hPExp').style.width = Math.min(100, S.exp / need * 100) + '%';
    $('hPLv').textContent = 'Lv. ' + S.lv;
    $('hRevive').textContent = p.revives;
    $('hGem').textContent = S.gem;
    $('hWName').textContent = bt.wp ? (G.WEAPONS[bt.wp.wclass].vi + ' · ' + G.WTYPES[bt.wp.wtype].vi) : '';
    // quả cầu Magi
    $('hOrbCore').style.height = p.magi + '%';
    $('hOrbPct').textContent = Math.floor(p.magi) + '%';
    // Heat / Soul
    var g2 = $('hGauge2');
    if (bt.wp && (bt.wp.wtype === 'heat' || bt.wp.wtype === 'soul')) {
      g2.classList.add('on');
      g2.classList.toggle('soul', bt.wp.wtype === 'soul');
      g2.querySelector('i').style.width = (bt.wp.wtype === 'heat' ? p.heat : p.soul) + '%';
    } else g2.classList.remove('on');
    // nút Magi sáng khi đủ
    for (var i = 0; i < 2; i++) {
      var btn = $('hMagi' + i), m = bt.wp ? bt.wp.magi[i] : null;
      if (!m) continue;
      btn.classList.toggle('ready', p.magi >= m.cost);
      btn.querySelector('.fill').style.height = Math.min(100, p.magi / m.cost * 100) + '%';
    }
    // bảng bất tỉnh
    $('hDown').classList.toggle('on', !!p.down);
  }

  /* ---------------------------------------------------------- KẾT THÚC -- */
  function onFinish(r) {
    var el = $('resultScr');
    var html = '';
    if (r.field) {
      var bag = r.bag || { mats: {}, gold: 0, exp: 0 };
      G.track(S, { kill: r.killed || 0 });
      S.progress.kill = (S.progress.kill || 0);
      html += '<h2 style="color:#f2c94b">HẾT MAP</h2><div class="sub">' + battle.map.n + '</div>';
      html += '<div class="box"><div class="line"><span>Quái đã hạ</span><b>' + (r.killed || 0) + '</b></div>' +
        '<div class="line"><span>Gold</span><b>' + fmt(bag.gold || 0) + '</b></div>' +
        '<div class="line"><span>EXP</span><b>' + fmt(bag.exp || 0) + '</b></div>';
      Object.keys(bag.mats || {}).forEach(function (m) {
        html += '<div class="line"><span>' + G.MATERIALS[m].n + '</span><b>×' + bag.mats[m] + '</b></div>';
      });
      html += '</div>';
      if (r.portal) {
        var area = G.areaById(S.area);
        var nxt = (S.unlocked[S.area] || 0) + 1;
        if (nxt < area.maps.length && nxt > (S.unlocked[S.area] || 0)) {
          S.unlocked[S.area] = nxt;
          html += '<div class="sub" style="color:#3fd66a">Đã mở map: ' + area.maps[nxt].n + '</div>';
        }
      }
      html += '<button class="btn pri" id="rBack" style="width:260px">Về Guild</button>' +
        '<button class="btn" id="rAgain" style="width:260px;margin-top:7px">Đánh tiếp map này</button>';
    } else if (r.win) {
      var b = r.boss;
      S.stats.boss++; S.stats.parts += r.parts || 0;
      S.bossKills[b.id] = (S.bossKills[b.id] || 0) + (r.tablet || 1);
      S.gold += r.gold; S.gem += r.gems; S.medal += r.medal;
      var lvUp = G.addExp(S, r.exp);
      (r.drops || []).forEach(function (m) { G.addMat(S, m, 1); });
      G.track(S, { boss: 1, part: r.parts || 0 });
      S.progress['bossId_' + b.id] = (S.progress['bossId_' + b.id] || 0) + 1;
      S.progress['bossRank_' + b.rank] = (S.progress['bossRank_' + b.rank] || 0) + 1;
      if (battle && battle.wp) S.progress['bossWith_' + battle.wp.wclass] = (S.progress['bossWith_' + battle.wp.wclass] || 0) + 1;
      if (S.pendingBoss && S.pendingBoss.id === b.id) S.pendingBoss = null;

      html += '<h2 style="color:#3fd66a">HẠ GỤC</h2><div class="sub">' + b.n + ' · ' +
        Math.floor(r.elapsed / 60000) + ':' + ('0' + Math.floor(r.elapsed / 1000 % 60)).slice(-2) + '</div>';
      html += '<div class="box">';
      html += '<div class="gemcond"><span class="' + (r.conds.noDeath ? 'ok' : 'no') + '">' + (r.conds.noDeath ? '✔' : '✘') + ' Không chết lần nào</span></div>';
      html += '<div class="gemcond"><span class="' + (r.conds.usedMagi ? 'ok' : 'no') + '">' + (r.conds.usedMagi ? '✔' : '✘') + ' Có dùng Magi</span></div>';
      html += '<div class="gemcond"><span class="' + (r.conds.fast ? 'ok' : 'no') + '">' + (r.conds.fast ? '✔' : '✘') + ' Hạ trong ' + (G.BAL.gemFastMs / 1000) + ' giây</span></div>';
      html += '<div class="line" style="border-top:1px solid rgba(255,255,255,.15);margin-top:6px;padding-top:6px"><span>◈ Gem</span><b style="color:#8fd4ff">+' + r.gems + '</b></div>';
      html += '<div class="line"><span>Tablet của ' + b.n + '</span><b style="color:#f2c94b">×' + (r.tablet || 1) + '</b></div>';
      html += '<div class="line"><span>Bộ phận đã phá</span><b>' + (r.parts || 0) + '</b></div>';
      html += '<div class="line"><span>Gold</span><b>' + fmt(r.gold) + '</b></div>';
      html += '<div class="line"><span>EXP</span><b>' + fmt(r.exp) + (lvUp ? ' <span style="color:#3fd66a">LÊN CẤP ×' + lvUp + '!</span>' : '') + '</b></div>';
      html += '<div class="line"><span>Medal</span><b>' + r.medal + '</b></div>';
      var counted = {};
      (r.drops || []).forEach(function (m) { counted[m] = (counted[m] || 0) + 1; });
      Object.keys(counted).forEach(function (m) {
        html += '<div class="line"><span>' + rankChip(G.MATERIALS[m].r) + ' ' + G.MATERIALS[m].n + '</span><b>×' + counted[m] + '</b></div>';
      });
      html += '</div>';
      html += '<button class="btn pri" id="rBack" style="width:260px">Về Guild</button>' +
        '<button class="btn" id="rForge" style="width:260px;margin-top:7px">⚒️ Vào Lò rèn chế đồ</button>';
    } else {
      S.stats.deaths++;
      html += '<h2 style="color:#ff5a5a">' + (r.timeout ? 'HẾT GIỜ' : 'THẤT BẠI') + '</h2>' +
        '<div class="sub">' + (r.boss ? r.boss.n : '') + '</div>' +
        '<div class="box"><p class="hint">' + (r.timeout
          ? 'Trận boss có giới hạn 5 phút, đúng như luật Tower Clearing của bản gốc. Nâng trang bị, hoặc đổi vũ khí khắc hệ rồi thử lại.'
          : 'Cả tổ đã ngã. Lần sau nhớ: đánh vào WEAK point để nạp thanh gục, và vẩy ngón để né vùng đỏ.') + '</p></div>' +
        '<button class="btn pri" id="rBack" style="width:260px">Về Guild</button>';
    }
    el.innerHTML = html;
    el.classList.add('on');
    save();
    var rb = $('rBack'); if (rb) rb.onclick = function () { el.classList.remove('on'); show('home'); };
    var ra = $('rAgain'); if (ra) ra.onclick = function () { el.classList.remove('on'); startField(S.area, S.mapIdx); };
    var rf = $('rForge'); if (rf) rf.onclick = function () { el.classList.remove('on'); show('forge'); };
  }

  /* ------------------------------------------------------ API CHO BOT --- */
  var api = {
    get save() { return S; },
    get battle() { return battle; },
    show: show, toast: toast, startField: startField, startBoss: startBoss,
    leave: leaveBattle, refresh: function () { refresh(); },
    saveNow: save
  };
  G.UI = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.DP = window.DP || {});
