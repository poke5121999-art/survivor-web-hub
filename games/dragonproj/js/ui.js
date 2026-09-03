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
    G.rollRecurrent(S);
    S.progress = S.progress || {};
    buildScreens();
    installDragEquip();
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
    mkScreen('forge',  'NGUYÊN LIỆU', '', false, true);
    mkScreen('shop',   'TIỆM', '', false, true);
    mkScreen('help',   'CÁCH CHƠI', '', false, true);
    mkScreen('bosslist','DANH SÁCH BEHEMOTH', '', false, true);
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
       gear: rGear, forge: rForge, shop: rShop, help: rHelp, bosslist: rBossList }[id] || function () {})();
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
    c.innerHTML =
      '<b class="g">⬤ ' + fmt(S.gold) + '</b>' +
      '<b class="m">◈ ' + fmt(S.gem) + '</b>' +
      '<b class="t">▤ ' + fmt(S.ticket) + '</b>' +
      '<b class="d">✹ ' + fmt(S.medal) + '</b>' +
      '<b class="p">✦ ' + fmt(S.pikke) + '</b>';
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
    var nextStory = G.STORY.find(function (q) { return S.story.done.indexOf(q.id) < 0; });
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
              '<button data-act="forge">' + uiIcon('mats', '⚒️') + 'Nguyên liệu</button>' +
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

    if (nextStory) {
      var pr = questProgressText(nextStory);
      html += '<div class="banner main"><div class="npc">' + npcFace(nextStory.id) + '</div><div class="t">' +
        '<span class="kind" style="color:#8ee8a8">STORY</span> ' +
        '<b>' + nextStory.vi + '</b><span>' + nextStory.n + ' — ' + pr + '</span></div>' +
        '<button class="btn go" data-act="goQuest">ĐI</button></div>';
    } else {
      html += '<div class="banner main"><div class="npc">' + npcFace('end') + '</div><div class="t"><b>Hết cốt truyện mùa 1</b>' +
        '<span>' + QUEST_NPC[0] + ' không còn việc nào cho bạn nữa. Đi săn Behemoth thôi.</span></div></div>';
    }

    // Nhiệm vụ ngày / tuần
    html += '<div class="card"><h3>Nhiệm vụ ngày</h3>' + recurrentRows(S.daily.picks, G.DAILY, S.daily.done, 'd') +
      recurrentBonus(G.DAILY_BONUS, S.daily, 3, 'd') + '</div>';
    html += '<div class="card"><h3>Nhiệm vụ tuần</h3>' + recurrentRows(S.weekly.picks, G.WEEKLY, S.weekly.done, 'w') +
      recurrentBonus(G.WEEKLY_BONUS, S.weekly, 4, 'w') + '</div>';

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
      else if (a === 'forge') show('forge');
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

    var nextStory = G.STORY.find(function (q) { return S.story.done.indexOf(q.id) < 0; });
    if (nextStory) {
      var can = storyDone(nextStory);
      html += '<div class="card"><h3>📜 ' + nextStory.vi + ' <span style="font-size:10px;color:#9fb2c4">' + nextStory.n + '</span></h3>' +
        '<p>' + questProgressText(nextStory) + '</p><div class="row">' +
        '<span style="font-size:11px;color:#f2c94b">Thưởng: ' + rwText(nextStory.rw) + '</span><span class="spacer"></span>' +
        '<button class="btn ' + (can ? 'pri' : 'dis') + '" data-act="claimStory">Nhận thưởng</button></div></div>';
    }

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
            (cleared ? '' : ' · +' + s2.firstGem + ' ◈ lần đầu') + '</span></div>' +
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
      var c = e.target.closest('[data-act="claimStory"]');
      if (!c || !nextStory) return;
      if (!storyDone(nextStory)) { toast('Chưa xong: ' + questProgressText(nextStory), '#c34141'); return; }
      S.story.done.push(nextStory.id);
      G.grant(S, nextStory.rw);
      toast('Hoàn thành: ' + nextStory.vi, '#3fd66a');
      save(); rQuest(); refresh();
    };
  }

  function rwText(rw) {
    var p = [];
    if (rw.exp) p.push(rw.exp + ' EXP'); if (rw.gold) p.push(fmt(rw.gold) + ' Gold');
    if (rw.gem) p.push(rw.gem + ' Gem'); if (rw.ticket) p.push(rw.ticket + ' Vé');
    if (rw.pikke) p.push(rw.pikke + ' Pikke');
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
    html += '<div class="card"><h3>Nguyên liệu</h3><div>' + matChips() + '</div></div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { gearFilter = f.getAttribute('data-filter'); rArmory(); return; }
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

    // Nâng cấp / trang bị / rã đồ
    var ec = G.enhanceCost(g), lc = G.limitBreakCost(g), vc = G.evolveCost(g);
    html += '<div class="card"><h3>Nâng cấp</h3>' +
      '<button class="btn ' + (g.lv < G.MAX_LV && G.canPay(S, ec) ? 'pri' : 'dis') + '" data-act="enhance" style="width:100%;margin-bottom:6px">' +
        'Nâng cấp → Lv.' + Math.min(G.MAX_LV, g.lv + 1) + ' · ' + fmt(ec.gold) + ' Gold + ' + ec.mat.str_stone + ' Strengthening Stone</button>' +
      '<button class="btn ' + (g.lb < 4 && G.canPay(S, lc) ? 'pri' : 'dis') + '" data-act="lb" style="width:100%;margin-bottom:6px">' +
        // Kẹp nhãn ở 4/4: trước đây in ra "Limit Break 5/4" khi đã tối đa.
        (g.lb >= 4 ? 'Limit Break 4/4 — đã tối đa'
                   : 'Limit Break ' + (g.lb + 1) + '/4 · ' + fmt(lc.gold) + ' Gold + Lapis') +
        '</button>' +
      '<button class="btn ' + (G.canEvolve(g) && G.canPay(S, vc) ? 'pri' : 'dis') + '" data-act="evolve" style="width:100%;margin-bottom:6px">' +
        (G.canEvolve(g)
          ? 'Tiến hoá → Lv.1, chỉ số cao hơn · ' + fmt(vc.gold) + ' Gold + ' + vc.mat.dragon_core + ' Lõi Rồng'
          : (g.rank === 'S' || g.rank === 'SS'
              ? (g.evo >= G.MAX_EVO ? 'Tiến hoá ' + g.evo + '/' + G.MAX_EVO + ' — đã tối đa'
                                    : 'Tiến hoá — cần Lv.' + G.MAX_LV + ' trước')
              : 'Tiến hoá — chỉ dành cho đồ hạng S và SS')) + '</button>' +
      '<div class="row"><button class="btn ' + (equipped ? 'dis' : 'go') + '" data-act="equip" style="flex:1">' +
        (equipped ? 'Đang ở ' + (G.heroDef(holder) || {}).n
                  : 'Trang bị cho ' + ((G.heroDef(curHero()) || {}).n || '—')) + '</button>' +
      '<button class="btn red" data-act="dismantle">Rã lấy Lapis</button></div></div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act');
      var r;
      if (a === 'enhance') r = G.enhance(S, g);
      else if (a === 'lb') r = G.limitBreak(S, g);
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
        if (r.ok) { toast('Rã được ' + r.n + ' ' + G.MATERIALS[r.lapis].n, '#7fe3f0'); save(); show('armory'); return; }
      }
      if (r && !r.ok) toast(r.why, '#c34141');
      save(); rGear(); refresh();
    };
  }

  /* ---------------------------------------------------- NGUYÊN LIỆU ------ */
  /* Lò rèn chế đồ từ Tablet đã bỏ (gacha ra thẳng trang bị). Màn này giờ trả lời
   * đúng một câu hỏi: "thứ tôi đang thiếu để nâng cấp thì cày ở đâu?" */
  function rForge() {
    var b = $('body-forge');
    var html = '<div class="card"><p>Gacha ra <b>trang bị</b>. Còn <b>nâng cấp</b> thì phải đi cày: ' +
      'nguyên liệu rơi từ quái trong ải và từ điểm khai thác.</p></div>';

    html += '<div class="card"><h3 style="color:#f2d24b">Lõi Rồng — độc quyền Triệu hồi</h3>' +
      '<div class="row"><span style="flex:1;font-size:12px">Đang có <b style="color:#f2d24b;font-size:15px">' +
      fmt(S.mats.dragon_core || 0) + '</b></span>' +
      '<button class="btn sm pri" data-act="gacha">Triệu hồi</button></div>' +
      '<p><b>Không rơi ở bất kỳ ải nào</b>, không bán ở tiệm. Đường duy nhất: quay Triệu hồi ra món ' +
      '<b>đã có</b> — trùng B ra ' + G.DUPE_CORE.B + ', A ra ' + G.DUPE_CORE.A + ', S ra ' + G.DUPE_CORE.S +
      ', SS ra ' + G.DUPE_CORE.SS + '. Đây là thứ duy nhất mở được <b>Tiến hoá</b> cho đồ S và SS, ' +
      'tức bậc nâng cấp cao nhất của game.</p></div>';

    html += '<div class="card"><h3>Nâng cấp ăn gì</h3>' +
      '<div class="upgrow"><b>Nâng cấp</b><span>Strengthening Stone + Gold<br>' +
        '<i style="color:#9fb2c4">từ Lv.25 cần thêm Equipment Crystal</i></span></div>' +
      '<div class="upgrow"><b>Limit Break</b><span>Lapis cùng hạng với món đồ</span></div>' +
      '<div class="upgrow"><b>Tiến hoá</b><span style="color:#f2d24b">Lõi Rồng — chỉ có từ Triệu hồi trùng</span></div>' +
      '<div class="upgrow"><b>Đổi Ability</b><span>Gold</span></div>' +
      '</div>';

    html += '<div class="card"><h3>Kho nguyên liệu</h3>';
    var any = false;
    ['SS', 'S', 'A', 'B', 'C', 'D'].forEach(function (rk) {
      var ids = Object.keys(S.mats).filter(function (id) {
        var m = G.MATERIALS[id]; return m && m.r === rk && S.mats[id] > 0;
      });
      if (!ids.length) return;
      any = true;
      html += '<div>' + ids.map(function (id) {
        var m = G.MATERIALS[id];
        return '<span class="mat-chip"' + (m.gachaOnly ? ' style="border-color:#f2d24b;color:#f2d24b"' : '') + '>' +
          rankChip(m.r) + ' ' + m.n + ' ×' + fmt(S.mats[id]) + '</span>';
      }).join('') + '</div>';
    });
    if (!any) html += '<p>Chưa có gì. Vào ải đi.</p>';
    html += '</div>';

    html += '<div class="card"><h3>Cày ở đâu</h3><p>Đồ rơi do <b>tộc quái</b> quyết định. ' +
      'Màn Ải ghi rõ ải nào có tộc nào.</p>';
    Object.keys(G.TRIBES).forEach(function (k) {
      var T = G.TRIBES[k];
      var uniq = T.mat.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      html += '<div class="upgrow"><b>' + T.en + '</b><span>' +
        uniq.map(function (id) { return G.MATERIALS[id] ? G.MATERIALS[id].n : id; }).join(' · ') + '</span></div>';
    });
    html += '<div class="upgrow"><b>Điểm khai thác</b><span>Strengthening Stone · Lõi Kỹ Năng · Equipment Crystal · Lapis</span></div>' +
      '<div class="upgrow"><b>Behemoth cuối ải</b><span>Nguyên liệu hạng cao + Lapis; phá bộ phận thì rơi thêm</span></div></div>';

    b.innerHTML = html;
    b.onclick = function (e) { if (e.target.closest('[data-act="gacha"]')) show('gacha'); };
  }

  /* --------------------------------------------------------- TRIỆU HỒI --- */
  /* Bản gốc: gacha ra một con boss để đi đánh, hạ xong mới có Tablet đem về chế đồ.
   * Ba bước cho một món vũ khí là quá dài để hiểu. Ở đây quay ra thẳng trang bị —
   * và món TRÙNG không vứt đi mà đổi thành Lõi Rồng, thứ duy nhất mở được Tiến hoá. */
  var gachaOut = '';        // HTML kết quả lần quay gần nhất
  function rGacha() {
    var b = $('body-gacha');
    var html = '';
    html += '<div class="gacha-hero"><b>TRIỆU HỒI NHÂN VẬT</b>' +
      '<span>Ra NGƯỜI, không ra đồ. Trùng người thì thành Lõi Rồng</span>' +
      '<div class="rate-tab"><b style="color:#f2d24b">SS 3%</b><b style="color:#f2a03c">S 15%</b>' +
      '<b style="color:#b06fd0">A 55%</b><b style="color:#5b8fd6">B 27%</b></div></div>';
    html += '<div class="card"><div class="row">' +
      '<button class="btn ' + (S.ticket >= 5 ? 'pri' : 'dis') + '" data-act="g1" style="flex:1">Đơn — 5 vé</button>' +
      '<button class="btn ' + (S.ticket >= 50 ? 'pri' : 'dis') + '" data-act="g10" style="flex:1">10+1 — 50 vé <span style="font-size:9px">(bảo hiểm SS)</span></button>' +
      '</div><p style="margin-top:7px">Vé: <b>' + S.ticket + '</b>. Hết vé thì <b>đổi bằng Medal</b> ở tiệm ' +
      '(phá ải là có Medal — ' + fmt(S.medal) + ' đang có), hoặc làm nhiệm vụ cốt truyện / tuần.<br>' +
      'Mỗi nhân vật gắn cứng <b>một lớp vũ khí</b> (tức một bộ đòn và hai kỹ năng) và <b>một hệ</b>. ' +
      'Ra người <b>đã có</b> thì đổi thành <b style="color:#f2d24b">Lõi Rồng</b> — ' +
      'thứ duy nhất mở được Tiến hoá, và <b>không cày được ở đâu cả</b>. Đang có ' +
      '<b style="color:#f2d24b">' + fmt(S.mats.dragon_core || 0) + '</b>.<br>' +
      'Đã có <b>' + (S.heroes || []).length + '/' + G.HEROES.length + '</b> nhân vật.</p></div>';


    html += '<div class="card"><button class="btn" data-act="roster" style="width:100%">Danh sách nhân vật đã có</button>' +
      '<button class="btn" data-act="bosslist" style="width:100%;margin-top:6px">Xem toàn bộ ' +
      G.BEHEMOTHS.length + ' Behemoth</button></div>';
    html += '<div id="gachaOut">' + gachaOut + '</div>';

    b.innerHTML = html;
    b.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act');
      if (a === 'g1' || a === 'g10') {
        var cost = a === 'g1' ? 5 : 50, cnt = a === 'g1' ? 1 : 11;
        if (S.ticket < cost) { toast('Không đủ vé', '#c34141'); return; }
        S.ticket -= cost;
        var res = G.summonHeroes(S, cnt, cnt > 1);
        var cores = res.reduce(function (n, x) { return n + (x.dupe ? x.cores : 0); }, 0);
        gachaOut = '<div class="card"><h3>Kết quả</h3>' + res.map(function (x) {
          var d = G.heroById(x.id) || {};
          var css = G.Atlas && G.Atlas.iconCss('heroes.' + x.id + '.idle', 34);
          return '<div class="row" style="font-size:11px;padding:3px 0;align-items:center;gap:7px">' +
            (css ? '<i class="uicon hero" style="' + css + '"></i>' : '') +
            '<span style="flex:1">' + rankChip(x.rank) + ' <b>' + x.name + '</b>' +
            '<br><span style="color:#9fb2c4">' + (G.weaponOf(d.wclass) || {}).vi + ' ' + elemDot(d.el) + '</span></span>' +
            (x.dupe ? '<b style="color:#f2d24b">trùng · +' + x.cores + ' Lõi</b>'
                    : '<b style="color:#3fd66a">MỚI</b>') + '</div>';
        }).join('') +
        (cores ? '<p style="margin-top:6px;color:#f2d24b">Tổng +' + cores + ' Lõi Rồng.</p>' : '') +
        '<button class="btn pri" data-act="roster" style="width:100%;margin-top:7px">Xem và xếp đội hình</button></div>';
        save(); rGacha(); refresh(); return;
      }
      if (a === 'armory') { show('armory'); return; }
      if (a === 'roster') { show('roster'); return; }
      if (a === 'bosslist') { show('bosslist'); return; }
    };
  }

  /* Gói nạp gồm gì, viết ra thành một dòng. */
  function iapWhat(g) {
    var p = [];
    if (g.ticket) p.push('▤ ' + fmt(g.ticket) + ' vé');
    if (g.gem) p.push('◈ ' + fmt(g.gem) + ' Gem');
    if (g.pikke) p.push('✦ ' + fmt(g.pikke) + ' Pikke');
    if (g.medal) p.push('✹ ' + fmt(g.medal) + ' Medal');
    if (g.gold) p.push('⬤ ' + fmt(g.gold) + ' Gold');
    if (g.mat) p.push('nguyên liệu đủ loại');
    return p.join('<br>');
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

  /* -------------------------------------------------------------- SHOP --- */
  function rShop() {
    var b = $('body-shop');

    // QUẦY NẠP lên đầu tiên: ở game gốc đây là chỗ móc ví, ở đây nó cho không.
    var html = '<div class="card iapbox"><div class="row"><h3 style="flex:1;color:#3fd66a">🎁 Quầy Nạp</h3>' +
      '<span class="freetag">TẤT CẢ 0đ</span></div>' +
      '<p>Đúng những gói mà một game gacha di động bán bằng tiền thật. ' +
      'Ở đây <b>miễn phí hết</b>, bấm bao nhiêu lần cũng được.</p><div class="grid2">';
    G.IAP.forEach(function (it) {
      html += '<button class="item iap" data-iap="' + it.id + '"><div class="nm">' + it.n + '</div>' +
        '<div class="sub">' + iapWhat(it.give) + '</div>' +
        '<div class="price"><s>' + it.was + '</s> <b>0đ</b></div></button>';
    });
    html += '</div><p style="color:#f2d24b">Không phát Lõi Rồng. Nó vẫn chỉ có từ quay trúng đồ trùng — ' +
      'đó là thứ duy nhất còn khan, và bậc Tiến hoá sống nhờ nó.</p></div>';

    // Quầy Medal: đường lấy vé mà CÀY LÀ RA, cho ai muốn chơi đúng luật.
    html += '<div class="card"><div class="row"><h3 style="flex:1;color:#ff9a4a">✹ Quầy Medal</h3>' +
      '<span style="font-size:13px">Đang có <b style="color:#ff9a4a;font-size:16px">' + fmt(S.medal) + '</b></span></div>' +
      '<p>Medal rơi ra <b>mỗi lần phá ải</b> — trùm càng cao càng nhiều: ' +
      'B <b>2</b> · A <b>5</b> · S <b>12</b> · SS <b>30</b>. Cày lại ải đã phá vẫn ăn Medal, ' +
      'nên muốn quay nhiều thì đi ải khó.</p><div class="grid2">';
    G.MEDAL_SHOP.forEach(function (it) {
      var ok = S.medal >= it.price.medal;
      html += '<button class="item" data-buym="' + it.id + '"><div class="nm">' + it.n + '</div>' +
        '<div class="sub">' + (it.sub ? it.sub + '<br>' : '') +
        '<b style="color:' + (ok ? '#ff9a4a' : '#5a6a7a') + '">✹ ' + fmt(it.price.medal) + '</b></div></button>';
    });
    html += '</div><p style="color:#f2d24b">Không bán Lõi Rồng. Nó chỉ có từ quay trúng đồ trùng — ' +
      'hở một đường mua là bậc Tiến hoá mất hết ý nghĩa.</p></div>';

    html += '<div class="card"><div class="row"><h3 style="flex:1;color:#c8a0ff">✦ Tiệm Pikke</h3>' +
      '<span style="font-size:13px">Đang có <b style="color:#c8a0ff;font-size:16px">' + fmt(S.pikke) + '</b></span></div>' +
      '<p>Pikke Points <b>chỉ</b> có từ nhiệm vụ ngày và tuần — không rơi ở ải, không mua được. ' +
      'Ngày 3 nhiệm vụ (100 mỗi cái) + 300 khi xong cả ba = <b>600/ngày</b>. ' +
      'Tuần 4 nhiệm vụ (200 mỗi cái) + 400 = <b>1.200/tuần</b>. Nhiệm vụ nằm ở màn <b>Nhà</b>.<br>' +
      'Hết nhiệm vụ trong ngày thì <b>đổi bằng Gold</b> — cày ải là ra Gold, không phải chờ mai.</p>' +
      '<div class="grid3">';
    G.PIKKE_BUY.forEach(function (it) {
      var ok = S.gold >= it.price.gold;
      html += '<button class="item" data-buyk="' + it.id + '"><div class="nm">' + it.n + '</div>' +
        '<div class="sub">' + (it.sub ? it.sub + '<br>' : '') +
        '<b style="color:' + (ok ? 'var(--gold)' : '#5a6a7a') + '">⬤ ' + fmt(it.price.gold) + '</b></div></button>';
    });
    html += '</div><div class="grid2">';
    G.SHOP.forEach(function (it) {
      var ok = S.pikke >= it.price.pikke;
      html += '<button class="item" data-buy="' + it.id + '"><div class="nm">' + it.n + '</div>' +
        '<div class="sub" style="color:' + (ok ? '#c8a0ff' : '#5a6a7a') + '">✦ ' + fmt(it.price.pikke) + '</div></button>';
    });
    html += '</div></div>';
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
      var t = e.target.closest('[data-iap],[data-buy],[data-buym],[data-buyk],[data-use],[data-buyp]'); if (!t) return;
      if (t.hasAttribute('data-iap')) {
        var ip = G.IAP.find(function (x) { return x.id === t.getAttribute('data-iap'); });
        G.giveBundle(S, ip.give);
        toast('Đã nhận ' + ip.n, '#3fd66a');
        save(); rShop(); refresh(); return;
      }
      if (t.hasAttribute('data-buyk')) {
        var ki = G.PIKKE_BUY.find(function (x) { return x.id === t.getAttribute('data-buyk'); });
        if (!G.pay(S, ki.price)) { toast('Không đủ Gold', '#c34141'); return; }
        G.giveBundle(S, ki.give); S.stats.buys++; G.track(S, { buy: 1 });
        toast('Đã đổi ' + ki.n, '#3fd66a');
      } else if (t.hasAttribute('data-buym')) {
        var mi = G.MEDAL_SHOP.find(function (x) { return x.id === t.getAttribute('data-buym'); });
        if (!G.pay(S, mi.price)) { toast('Không đủ Medal — đi phá thêm ải', '#c34141'); return; }
        S.stats.buys++; G.track(S, { buy: 1 });
        G.giveBundle(S, mi.give);
        toast('Đã đổi ' + mi.n, '#3fd66a');
      } else if (t.hasAttribute('data-buy')) {
        var it = G.SHOP.find(function (x) { return x.id === t.getAttribute('data-buy'); });
        if (S.pikke < it.price.pikke) { toast('Không đủ Pikke Points', '#c34141'); return; }
        S.pikke -= it.price.pikke; S.stats.buys++; G.track(S, { buy: 1 });
        G.giveBundle(S, it.give);
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
      '<span>Trang bị: <b>' + S.gear.length + '</b></span>' +
      '<span>Medal: <b>' + fmt(S.medal) + '</b></span>' +
      '<span>Ải đã phá: <b>' + G.STAGES.filter(function (x) { return S.cleared[x.id]; }).length +
        '/' + G.STAGES.length + '</b></span>' +
      '<span>Lõi Rồng: <b>' + fmt(S.mats.dragon_core || 0) + '</b></span></div></div>' +

      '<div class="card"><h3>Bộ trưng bày</h3>' +
      '<p>Sáu cây SS tối cấp, mỗi cây một lớp và một hệ khác nhau — đủ để xem hết ' +
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

    html += '<div class="card"><h3>Sáu lớp vũ khí bắn</h3>' +
      '<p style="color:#9fb2c4;font-size:10.5px;margin-bottom:10px">Mỗi lớp GIỎI NHẤT đúng một trục ' +
      'và TỆ NHẤT hai trục. DPS bền của cả sáu gần bằng nhau — cái phân biệt chúng là ' +
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
      '<p>Đánh đủ vào một bộ phận thì <b>phá</b> được nó — rơi thêm nguyên liệu, và vùng đó ăn thêm sát thương.</p>' +
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

    html += '<div class="card"><h3>Đồ mạnh lên bằng cách nào</h3>' +
      '<p><b>Triệu hồi</b> ra thẳng vũ khí và giáp — không phải đi chế. ' +
      'SS 3% · S 15% · A 55% · B 27%, đúng tỉ lệ Quest Gacha của bản gốc.</p>' +
      '<p>Nhưng gacha chỉ cho <b>món đồ</b>, không cho <b>sức mạnh</b>. Muốn mạnh thì nâng cấp, ' +
      'mà nguyên liệu nâng cấp <b>chỉ rơi trong ải</b>: Strengthening Stone, Equipment Crystal ' +
      '(bắt buộc từ Lv.25), Lapis để Limit Break, Lõi Kỹ Năng.</p>' +
      '<p><b>Hết vé thì vào Tiệm</b>: quầy <b style="color:#3fd66a">Nạp</b> phát không mọi gói (bấm ' +
        'bao nhiêu lần cũng được), hoặc đổi bằng <b>Medal</b> — phá ải là có Medal. ' +
        'Chỉ <b style="color:#f2d24b">Lõi Rồng</b> là không quầy nào cho: nó vẫn chỉ có từ quay trúng đồ trùng.</p>' +
      '<p>Quay ra món <b>đã có</b> thì thành <b style="color:#f2d24b">Lõi Rồng</b> ' +
      '(B ' + G.DUPE_CORE.B + ' · A ' + G.DUPE_CORE.A + ' · S ' + G.DUPE_CORE.S + ' · SS ' + G.DUPE_CORE.SS + '). ' +
      'Đây là thứ <b>duy nhất</b> mở được <b>Tiến hoá</b> — bậc nâng cấp cao nhất, chỉ đồ S và SS ' +
      'mới dùng được — và nó <b>không cày được ở đâu cả</b>. Nên không có cú quay nào là phí.</p></div>';

    html += '<div class="card"><h3>Thưởng Gem mỗi ải</h3>' +
      '<p>Đúng như bản gốc, tối đa <b>4 Gem</b>: không gục lần nào (+1), có dùng kỹ năng (+1), ' +
      'xong trong ' + (G.BAL.gemFastMs / 1000) + ' giây (+1), và đủ cả ba thì <b>+1 nữa</b>.</p>' +
      '<p>Riêng <b>lần đầu phá</b> mỗi ải còn thưởng thêm Gem — ải thường +5, ải cuối vùng +10.</p></div>';

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
      onWeapon: function () { renderWeaponSlots(); renderSkillBtns(); }
    });
    renderWeaponSlots(); renderSkillBtns();
    battle.start();
  }

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
    /* NÚT KỸ NĂNG — đặt ngón, KÉO ĐỂ CHỈ HƯỚNG, thả là xả.
     *
     * Hồi chiêu chính là thanh nạp: nút tối thì chưa được, nút sáng thì bấm là
     * chắc chắn ra đòn. Không còn "giữ đủ lâu mới tính".
     *
     * setPointerCapture là bắt buộc, không phải cho đẹp: ngón phải kéo RA KHỎI
     * nút thì mới chỉ được hướng, mà rời khỏi nút là pointermove ngừng bắn vào
     * nút ngay. Không bắt con trỏ thì cử chỉ chết ngay milimét đầu tiên và mọi
     * cú xả đều thành tự-ngắm.
     */
    [0, 1].forEach(function (i) {
      var btn = $('hSkill' + i), sx = 0, sy = 0, on = false;
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (!battle) return;
        if (!battle.skillAimStart(i)) return;
        on = true; sx = e.clientX; sy = e.clientY;
        btn.classList.add('aiming');
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      });
      btn.addEventListener('pointermove', function (e) {
        if (!on || !battle) return;
        e.preventDefault();
        battle.skillAimMove(e.clientX - sx, e.clientY - sy);
      });
      var end = function (e) {
        if (!on) return;
        on = false; btn.classList.remove('aiming');
        try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
        if (battle) battle.skillAimEnd();
      };
      var cancel = function () {
        if (!on) return;
        on = false; btn.classList.remove('aiming');
        if (battle) battle.skillAimCancel();
      };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', cancel);
    });
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

  function renderWeaponSlots() {
    // Ba khe trên HUD giờ là BA NGƯỜI. Ảnh nhân vật to hơn chữ, vì lúc đánh nhau
    // mắt chỉ kịp nhận ra hình chứ không kịp đọc.
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
      renderSkillBtns();
    };
  }

  function renderSkillBtns() {
    for (var i = 0; i < 2; i++) {
      var btn = $('hSkill' + i);
      var sk = battle ? battle.skillDef(i) : null;
      var nm = btn.querySelector('.nm');
      if (!sk) {
        // Khe trống vì CHƯA MỞ, không phải vì hỏng. Để trắng trơn thì người chơi
        // tưởng game lỗi; ghi thẳng điều kiện ra là hết thắc mắc.
        var all = battle && battle.wp ? G.skillsOf(battle.wp.wclass) : [];
        btn.className = 'skill-btn empty tap';
        nm.textContent = all[i] ? 'Lv.' + G.SKILL_RULES.unlockLv2 : '';
        btn.querySelector('.cd').textContent = '';
        btn.title = all[i] ? all[i].n + ' — mở ở cấp vũ khí ' + G.SKILL_RULES.unlockLv2 : '';
        continue;
      }
      btn.className = 'skill-btn tap';
      // Tên đòn ngay trên nút. Người chơi cần biết mình sắp xả cái gì, không phải
      // một ký hiệu hình học rồi tự đoán.
      nm.textContent = sk.n;
      btn.title = sk.n + ' — ' + sk.d;
    }
  }

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
    $('hWName').textContent = bt.heroDef
      ? (bt.heroDef.n + ' · ' + G.weaponOf(bt.wp.wclass).vi)
      : (bt.wp ? (G.weaponOf(bt.wp.wclass).vi + ' · ' + G.WTYPES[bt.wp.wtype].vi) : '');
    // Viên hệ: hệ nguyên tố của vũ khí đang cầm giờ đổi luôn hình dạng hiệu ứng
    // kỹ năng, nên nó là thông tin phải thấy được mọi lúc.
    var elId = (bt.wp && bt.wp.el) || 'none', EL = G.ELEMENTS[elId];
    $('hOrbCore').style.background = EL.color;
    $('hOrbCore').style.height = '100%';
    $('hOrbPct').textContent = EL.vi;
    // Heat / Soul
    var g2 = $('hGauge2');
    if (bt.wp && (bt.wp.wtype === 'heat' || bt.wp.wtype === 'soul')) {
      g2.classList.add('on');
      g2.classList.toggle('soul', bt.wp.wtype === 'soul');
      g2.querySelector('i').style.width = (bt.wp.wtype === 'heat' ? p.heat : p.soul) + '%';
    } else g2.classList.remove('on');
    // Nút kỹ năng: phần tối dâng từ dưới lên là hồi chiêu còn lại, hết thì viền sáng.
    for (var i = 0; i < 2; i++) {
      var btn = $('hSkill' + i), sk = bt.skillDef(i);
      if (!sk) continue;
      var left = bt.skillCdLeft(i), full = bt.skillCdOf(sk);
      var ready = left <= 0;
      btn.classList.toggle('ready', ready);
      btn.querySelector('.fill').style.height = (ready ? 0 : left / full * 100) + '%';
      btn.querySelector('.cd').textContent = ready ? '' : Math.ceil(left / 1000);
    }
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
      var bag = r.bag || { mats: {}, gold: 0, exp: 0 };
      S.stats.boss++; S.stats.parts += r.parts || 0;
      S.bossKills[b.id] = (S.bossKills[b.id] || 0) + 1;
      S.seenBoss[b.id] = 1;

      // Thưởng lần đầu chỉ trả một lần; cày lại vẫn ăn gold/exp/đồ rơi nhưng không ăn Gem.
      var gems = r.gems + (r.firstClear ? st.firstGem : 0);
      S.gold += r.gold;
      S.gem += gems;
      S.medal += r.medal;
      var lvUp = G.addExp(S, r.exp);
      (r.drops || []).forEach(function (m) { G.addMat(S, m, 1); });
      G.track(S, { boss: 1, part: r.parts || 0, kill: r.killed || 0 });
      S.progress['bossId_' + b.id] = (S.progress['bossId_' + b.id] || 0) + 1;
      S.progress['bossRank_' + b.rank] = (S.progress['bossRank_' + b.rank] || 0) + 1;
      if (battle && battle.wp) S.progress['bossWith_' + battle.wp.wclass] = (S.progress['bossWith_' + battle.wp.wclass] || 0) + 1;
      S.cleared[st.id] = true;

      html += '<h2 style="color:#3fd66a">PHÁ ẢI</h2><div class="sub">' + st.n + ' · ' + st.sub + ' — ' +
        Math.floor(r.elapsed / 60000) + ':' + ('0' + Math.floor(r.elapsed / 1000 % 60)).slice(-2) + '</div>';
      html += '<div class="box">';
      html += '<div class="gemcond"><span class="' + (r.conds.noDeath ? 'ok' : 'no') + '">' + (r.conds.noDeath ? '✔' : '✘') + ' Không gục lần nào</span></div>';
      html += '<div class="gemcond"><span class="' + (r.conds.usedSkill ? 'ok' : 'no') + '">' + (r.conds.usedSkill ? '✔' : '✘') + ' Có dùng kỹ năng</span></div>';
      html += '<div class="gemcond"><span class="' + (r.conds.fast ? 'ok' : 'no') + '">' + (r.conds.fast ? '✔' : '✘') + ' Xong trong ' + (G.BAL.gemFastMs / 1000) + ' giây</span></div>';
      if (r.firstClear) html += '<div class="gemcond"><span class="ok">✔ Phá lần đầu · +' + st.firstGem + ' ◈</span></div>';
      html += '<div class="line" style="border-top:1px solid rgba(255,255,255,.15);margin-top:6px;padding-top:6px"><span>◈ Gem</span><b style="color:#8fd4ff">+' + gems + '</b></div>';
      html += '<div class="line"><span>' + b.n + ' · bộ phận đã phá</span><b>' + (r.parts || 0) + '</b></div>';
      html += '<div class="line"><span>Quái đã hạ</span><b>' + (r.killed || 0) + '</b></div>';
      html += '<div class="line"><span>Gold thưởng ải</span><b>' + fmt(r.gold) + '</b></div>';
      html += '<div class="line"><span>EXP thưởng ải</span><b>' + fmt(r.exp) +
        (lvUp ? ' <span style="color:#3fd66a">LÊN CẤP ×' + lvUp + '!</span>' : '') + '</b></div>';
      html += '<div class="line"><span>Medal</span><b>' + r.medal + '</b></div>';
      // Rương trong ải cộng thẳng vào túi ngay lúc nhặt, nên ở đây chỉ nhắc lại.
      if (bag.gold || bag.exp) html += '<div class="line"><span>Nhặt dọc đường</span><b>' +
        fmt(bag.gold || 0) + ' Gold · ' + fmt(bag.exp || 0) + ' EXP</b></div>';
      var counted = {};
      Object.keys(bag.mats || {}).forEach(function (m) { counted[m] = (counted[m] || 0) + bag.mats[m]; });
      (r.drops || []).forEach(function (m) { counted[m] = (counted[m] || 0) + 1; });
      Object.keys(counted).forEach(function (m) {
        html += '<div class="line"><span>' + rankChip(G.MATERIALS[m].r) + ' ' + G.MATERIALS[m].n + '</span><b>×' + counted[m] + '</b></div>';
      });
      html += '</div>';
      var nx = G.nextStage(S);
      html += '<button class="btn pri" id="rNext" style="width:260px" data-next="' + nx.id + '">▶ ' +
        (nx.id === st.id ? 'Đánh lại ải này' : 'Vào ' + nx.n + ' — ' + nx.sub) + '</button>' +
        '<button class="btn" id="rAgain" style="width:260px;margin-top:7px">Cày lại ' + st.n + '</button>' +
        '<button class="btn" id="rBack" style="width:260px;margin-top:7px">Về Guild</button>';

    } else if (r.quit) {
      // Bỏ dở: đồ đã nhặt vẫn của mình (đã vào túi từ lúc nhặt), nhưng ải không
      // tính là phá và không có thưởng ải.
      var bag2 = r.bag || { mats: {}, gold: 0, exp: 0 };
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
