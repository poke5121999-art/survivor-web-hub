// Sảnh: các màn hình lobby | roster | gacha | queue | map | versus | loading | match | result.
// Mỗi màn một hàm vẽ renderXxx(host, opts) trả về hàm dọn (hủy bộ đếm giờ); mọi chuyển màn đi qua go() duy nhất.
// Trạng thái người chơi nằm trong save (dùng chung đối tượng với main.js qua VS.state.save), không giữ bản sao ở đây.
(function (VS) {
  'use strict';

  var TEAM = {
    diver: { name: 'THỢ LẶN', low: 'Thợ Lặn', role: 'Nhặt kho báu, rút lui an toàn', est: 6 },
    shark: { name: 'CÁ MẬP', low: 'Cá Mập', role: 'Săn thợ lặn trong bóng tối', est: 9 }
  };
  var THEME = {
    day: { label: 'Ban ngày', a: '#35d6ee', b: '#1673c6', glow: '#fff3a0' },
    evening: { label: 'Hoàng hôn', a: '#ffa264', b: '#7b3a96', glow: '#ffd2a0' },
    night: { label: 'Ban đêm', a: '#4357c4', b: '#0b1240', glow: '#9fb4ff' },
    rain: { label: 'Trời mưa', a: '#6f93bd', b: '#1b3158', glow: '#d3e8ff' },
    kelp: { label: 'Rừng tảo', a: '#45d487', b: '#0f6a50', glow: '#d6ffb0' }
  };
  var QUEUE_MIN = 3, QUEUE_SPAN = 9;     // ghế đầy dần trong 3-12 s
  var ROULETTE_MS = 1600, HOLD_MS = 1100, COUNTDOWN = 3;
  var CROP = { x: 23, y: 32, size: 64 };  // khung cắt khuôn mặt Dave trong ô 120 của sheet (thân Dave nằm ở x 37-73, y 38-91)
  var SUIT_BASE_HUE = 218;               // độ màu gốc của đồ lặn Dave, để suy ra góc hue-rotate

  var S = { host: null, root: null, stage: null, sea: null, toast: null, screen: 'boot', dispose: null, sel: { banner: null }, flagApplied: false, loading: null };

  // ───────────────────────── dựng phần tử ─────────────────────────
  function add(e, kids) {
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
      if (k == null || k === false) return;
      if (Array.isArray(k)) add(e, k);
      else e.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
    });
    return e;
  }
  function h(tag, cls, kids) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (kids != null) add(e, kids);
    return e;
  }
  function btn(cls, kids, act, fn) {
    var b = h('button', cls, kids);
    b.type = 'button';
    if (act) b.dataset.act = act;
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function art(p) { return VS.asset('hx:art/' + p); }
  function img(cls, src) { var i = new Image(); i.className = cls; i.alt = ''; i.draggable = false; i.src = src; return i; }
  function stars(n, cls) {
    var s = h('span', 'vs-stars' + (cls ? ' ' + cls : ''));
    s.setAttribute('role', 'img'); s.setAttribute('aria-label', n + ' sao');
    for (var i = 0; i < n; i++) s.appendChild(h('i', 'vs-star'));
    return s;
  }
  // Số bản sao chỉ để khoe bộ sưu tập, không có chỉ số theo bản sao.
  function copiesTag(n) {
    var t = h('span', 'vs-own', [h('i', 'vs-check'), n > 1 ? 'Đã có ×' + n : 'Đã có']);
    t.title = 'Số bản sao (không ảnh hưởng chỉ số)';
    return t;
  }
  function whoName(p) { return p.human && p.name !== 'Bạn' ? p.name + ' (Bạn)' : p.name; }
  function num(n) { return h('b', 'vs-num', String(n)); }
  function mmss(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60); }
  function pct(x) { var s = (x * 100).toFixed(1); return (s.slice(-2) === '.0' ? s.slice(0, -2) : s).replace('.', ',') + '%'; }
  function tableOf(team) { return team === 'shark' ? VS.SHARKS : VS.DIVERS; }
  function defOf(team, id) { return tableOf(team)[id] || null; }
  function skillOf(def) { return def && VS.SKILL_DATA[def.skill] || null; }
  function mapOf(id) { for (var i = 0; i < VS.MAPS.length; i++) if (VS.MAPS[i].id === id) return VS.MAPS[i]; return null; }

  function bag() {
    var ids = [];
    return {
      after: function (ms, fn) { var id = setTimeout(fn, ms); ids.push(['t', id]); return id; },
      every: function (ms, fn) { var id = setInterval(fn, ms); ids.push(['i', id]); return id; },
      frame: function (fn) {
        var box = { id: 0 };
        function loop(t) { if (fn(t) !== false) box.id = requestAnimationFrame(loop); }
        box.id = requestAnimationFrame(loop); ids.push(['r', box]); return box;
      },
      clear: function () {
        ids.forEach(function (x) {
          if (x[0] === 't') clearTimeout(x[1]); else if (x[0] === 'i') clearInterval(x[1]); else cancelAnimationFrame(x[1].id);
        });
        ids.length = 0;
      }
    };
  }

  // ───────────────────────── save dùng chung với main.js ─────────────────────────
  function save() { return (VS.state && VS.state.save) || VS.save.current || VS.save.load(); }
  function persist() { VS.save.store(save()); }

  // Mỗi lần ghép trận hay quay gacha lấy một rng mới. ?seed=N cho kết quả lặp lại được (kiểm, gỡ lỗi).
  function newRng() {
    var sv = save();
    var base = VS.flags && VS.flags.seed != null ? VS.flags.seed : ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
    sv.seq = (sv.seq || 0) + 1;
    return VS.rng((base ^ Math.imul(sv.seq, 0x9e3779b1)) >>> 0);
  }

  // ───────────────────────── chân dung ─────────────────────────
  var PX = { s: 64, m: 112, l: 176, xl: 240 };
  var sheetP = null;
  function sheet() {
    if (sheetP) return sheetP;
    var A = window.HX_ASSETS && window.HX_ASSETS.dave;
    sheetP = new Promise(function (ok) {
      if (!A) return ok(null);
      var i = new Image();
      i.onload = function () { ok(i); }; i.onerror = function () { ok(null); };
      i.src = art(A.sheet);
    });
    return sheetP;
  }
  // Tạm thời tới khi VS.diverSheet có mặt: khung Idle của Dave, đổi màu áo bằng hue-rotate theo pal.suit.
  function daveCanvas(id, px) {
    return sheet().then(function (sh) {
      if (!sh) return null;
      var A = window.HX_ASSETS.dave, cell = A.cell || 120, row = A.anims.Idle.row, d = VS.DIVERS[id];
      var k = Math.max(1, Math.round(px / CROP.size));
      var cv = document.createElement('canvas');
      cv.width = cv.height = CROP.size * k;
      var c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(sh, CROP.x, row * cell + CROP.y, CROP.size, CROP.size, 0, 0, cv.width, cv.height);
      if (d && d.pal && typeof d.pal.suit === 'number') cv.style.filter = 'hue-rotate(' + (d.pal.suit - SUIT_BASE_HUE) + 'deg) saturate(2.1) brightness(1.12)';
      return cv;
    });
  }
  // Một canvas chỉ nằm được ở một chỗ trong DOM: chép điểm ảnh sang canvas riêng để cùng một thợ lặn hiện ở nhiều nơi
  // (thẻ sảnh, ô kho, ghế ghép trận) dù VS.diverSheet có trả bản dùng chung.
  function copyOf(src) {
    var w = src.width || src.naturalWidth, h2 = src.height || src.naturalHeight;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h2;
    cv.getContext('2d').drawImage(src, 0, 0);
    return cv;
  }
  function diverCanvas(id, px) {
    var ds = VS.diverSheet;
    if (ds && typeof ds.portrait === 'function') {
      var p = null;
      try { p = ds.portrait(id, px); } catch (e) { p = null; }
      if (p) return Promise.resolve(p).then(function (cv) { return cv ? copyOf(cv) : daveCanvas(id, px); }, function () { return daveCanvas(id, px); });
    }
    return daveCanvas(id, px);
  }
  // size: s | m | l | xl (kích thước hiển thị do CSS quyết định; số px chỉ là độ phân giải xin W2)
  function portrait(team, id, size) {
    var el = h('span', 'vs-pt vs-pt-' + team + ' vs-pt-' + size);
    el.dataset.id = id;
    if (team === 'shark') el.appendChild(img('', art('shark/' + id + '_icon.png')));
    else diverCanvas(id, PX[size] || 112).then(function (cv) { if (cv) el.appendChild(cv); });
    return el;
  }
  function skillIcon(sk) {
    var el = h('span', 'vs-sk ' + (sk ? sk.team : ''));
    if (sk && sk.icon) el.appendChild(img('', VS.asset(sk.icon)));
    else el.textContent = sk ? sk.name.charAt(0) : '?';
    return el;
  }

  // ───────────────────────── khung chung ─────────────────────────
  function pearlsChip() {
    var n = h('b', 'vs-num', String(save().pearls));
    n.dataset.pearls = '1';
    var c = h('div', 'vs-chip vs-pearls', [h('i', 'vs-pearl'), n]);
    c.title = 'Ngọc trai';
    return c;
  }
  function refreshPearls(root) {
    var n = (root || S.stage).querySelectorAll('[data-pearls]');
    for (var i = 0; i < n.length; i++) n[i].textContent = String(save().pearls);
  }
  // o: { back, title, brand, lead (phần tử đặt đầu thanh) }; luôn có chip ngọc trai ở cuối
  function topbar(o) {
    var t = h('header', 'vs-top');
    if (o.lead) t.appendChild(o.lead);
    if (o.back) t.appendChild(btn('vs-back', [h('i', 'vs-back-i'), h('span', null, 'Sảnh')], 'back', function () { go('lobby'); }));
    if (o.title) t.appendChild(h('h2', 'vs-h', o.title));
    if (o.brand) t.appendChild(img('vs-brand', art('gear/idiver/iDiver_Logo.png')));
    t.appendChild(h('div', 'vs-grow'));
    t.appendChild(pearlsChip());
    return t;
  }
  function toast(msg) {
    if (!S.toast) return;
    var t = h('div', 'vs-toast', msg);
    S.toast.textContent = '';
    S.toast.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }
  function countUp(node, to, ms, tm) {
    var t0 = performance.now();
    node.textContent = '0';
    tm.frame(function (now) {
      var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      node.textContent = String(Math.round(to * e));
      return k < 1;
    });
  }
  function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  // ───────────────────────── nền biển ─────────────────────────
  function hash01(i, salt) { var x = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 40503); x = Math.imul(x ^ (x >>> 15), 2246822519); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; }
  function buildSea() {
    var sea = h('div', 'vs-sea'), b = h('div', 'vs-bubbles');
    for (var i = 0; i < 18; i++) {
      var e = h('i');
      e.style.setProperty('--x', (hash01(i, 1) * 100).toFixed(1) + '%');
      e.style.setProperty('--s', (0.4 + hash01(i, 2) * 1.1).toFixed(2));
      e.style.setProperty('--d', (9 + hash01(i, 3) * 12).toFixed(1) + 's');
      e.style.setProperty('--t', (-hash01(i, 4) * 20).toFixed(1) + 's');
      b.appendChild(e);
    }
    sea.appendChild(b);
    sea.appendChild(img('vs-ghost', art('shark/Shortfin_Mako_icon.png')));
    return sea;
  }

  function ensureRoot() {
    if (S.root) return;
    S.host = document.getElementById('ui');
    if (!S.host) { S.host = h('div'); S.host.id = 'ui'; document.body.appendChild(S.host); }
    S.root = h('div', 'vs');
    S.sea = buildSea();
    S.stage = h('div', 'vs-stage');
    S.toast = h('div', 'vs-toasts');
    var rot = h('div', 'vs-rot', [h('i', 'vs-rot-ic'), h('b', null, 'Xoay ngang màn hình'), h('span', null, 'Vực Săn chơi ở chế độ ngang.')]);
    rot.setAttribute('role', 'alert');
    add(S.root, [S.sea, S.stage, S.toast, rot]);
    S.host.appendChild(S.root);
    document.addEventListener('keydown', onKey);
  }

  // ───────────────────────── chuyển màn (duy nhất) ─────────────────────────
  var RENDER = {};
  function go(screen, opts) {
    if (!RENDER[screen]) throw new Error('Không có màn hình ' + screen);
    ensureRoot();
    if (S.dispose) { var d = S.dispose; S.dispose = null; try { d(); } catch (e) { console.error(e); } }
    S.screen = screen;
    S.root.dataset.screen = screen;
    S.stage.textContent = '';
    S.host.hidden = screen === 'match';          // trận chạy: giao toàn bộ chuột/cảm ứng cho canvas
    if (screen === 'match') return;
    var el = h('section', 'vs-screen vs-s-' + screen);
    el.dataset.screen = screen;
    S.stage.appendChild(el);
    S.dispose = RENDER[screen](el, opts || {}) || null;
  }

  function onKey(e) {
    if (e.key !== 'Escape' || !S.root || S.host.hidden) return;
    var rv = S.stage.querySelector('.vs-reveal');
    if (rv) { var done = rv.querySelector('[data-act=done]'); if (done && !done.disabled) done.click(); else rv.click(); return; }
    if (S.screen === 'roster' || S.screen === 'gacha') go('lobby');
    else if (S.screen === 'queue') go('lobby');
  }

  // ───────────────────────── LOBBY ─────────────────────────
  RENDER.lobby = function (el) {
    var sv = save();
    if (!S.flagApplied) {
      S.flagApplied = true;
      if (VS.flags && (VS.flags.team === 'diver' || VS.flags.team === 'shark')) sv.pick.team = VS.flags.team;
    }
    el.appendChild(topbar({ lead: profile(sv) }));

    var main = h('main', 'vs-lobby');
    var cards = { diver: sideCard('diver'), shark: sideCard('shark') };
    var play = btn('vs-btn vs-btn-gold vs-play', null, 'find', function () { go('queue', { team: save().pick.team }); });
    var playSub = h('span', 'vs-play-s');
    add(play, [h('span', 'vs-play-t', 'TÌM TRẬN'), playSub, h('span', 'vs-chev', [img('', art('gear/idiver/iDiver_Level_Arrow01.png')), img('', art('gear/idiver/iDiver_Level_Arrow02.png')), img('', art('gear/idiver/iDiver_Level_Arrow03.png'))])]);
    var center = h('div', 'vs-center', [
      h('h1', 'vs-title', 'VỰC SĂN'),
      h('p', 'vs-sub', 'Thợ lặn đối đầu cá mập · 4 đấu 2'),
      play,
      h('div', 'vs-tiles', [
        btn('vs-btn vs-btn-blue vs-tile', [h('i', 'vs-tile-ic vs-ic-gacha'), h('span', null, 'Gacha')], 'gacha', function () { go('gacha'); }),
        btn('vs-btn vs-btn-blue vs-tile', [h('i', 'vs-tile-ic vs-ic-book'), h('span', null, 'Bộ sưu tập')], 'roster', function () { go('roster', { team: save().pick.team }); })
      ]),
      h('p', 'vs-rec', recordText(sv))
    ]);
    center.querySelector('.vs-title').dataset.t = 'VỰC SĂN';
    add(main, [cards.diver.el, center, cards.shark.el]);
    el.appendChild(main);

    function paintSides() {
      var team = save().pick.team;
      cards.diver.paint(team === 'diver'); cards.shark.paint(team === 'shark');
      playSub.textContent = 'Phe ' + TEAM[team].name;
      play.setAttribute('aria-label', 'Tìm trận, phe ' + TEAM[team].low);
      play.dataset.team = team;
    }
    function sideCard(team) {
      var sv2 = save(), id = sv2.pick[team], def = defOf(team, id), sk = skillOf(def);
      var card = h('article', 'vs-side vs-side-' + team);
      var hit = btn('vs-side-hit', null, 'side-' + team, function () {
        if (save().pick.team === team) return;
        save().pick.team = team; persist(); paintSides();
      });
      hit.setAttribute('aria-label', 'Chọn phe ' + TEAM[team].low);
      var tag = h('span', 'vs-side-tag', 'ĐÃ CHỌN');
      var change = btn('vs-btn vs-btn-ghost vs-change', 'Đổi', 'change-' + team, function () { go('roster', { team: team }); });
      change.setAttribute('aria-label', 'Đổi ' + (team === 'diver' ? 'thợ lặn' : 'cá mập'));
      add(card, [
        hit,
        h('div', 'vs-side-head', [h('b', 'vs-side-name', TEAM[team].name), tag]),
        h('div', 'vs-side-pt', portrait(team, id, 'xl')),
        h('div', 'vs-side-who', [h('b', 'vs-ch-name', def.name), stars(def.rarity, 'r' + def.rarity)]),
        h('div', 'vs-side-skill', [skillIcon(sk), h('span', null, [h('small', null, 'Kỹ năng'), h('b', null, sk ? sk.name : '')])]),
        h('div', 'vs-side-role', TEAM[team].role),
        change
      ]);
      return { el: card, paint: function (on) { card.classList.toggle('on', on); hit.setAttribute('aria-pressed', on ? 'true' : 'false'); tag.textContent = on ? 'ĐÃ CHỌN' : 'Bấm để chọn'; } };
    }
    paintSides();
    return null;
  };

  function profile(sv) {
    var need = VS.META.exp.perLevel;
    var team = sv.pick.team, id = sv.pick[team];
    var fill = h('i');
    fill.style.width = (sv.exp / need * 100).toFixed(1) + '%';
    return h('div', 'vs-me', [
      h('span', 'vs-avatar', portrait(team, id, 's')),
      h('div', 'vs-me-info', [
        h('div', 'vs-me-row', [h('b', 'vs-me-name', sv.name), h('span', 'vs-lv vs-num', 'Lv.' + sv.level)]),
        h('div', 'vs-expbar', [fill]),
        h('small', 'vs-num', sv.exp + '/' + need + ' EXP')
      ])
    ]);
  }
  function recordText(sv) {
    var st = sv.stats;
    return st.matches ? 'Đã chơi ' + st.matches + ' trận · thắng ' + st.wins : 'Chưa chơi trận nào. Chọn phe rồi bấm TÌM TRẬN.';
  }

  // ───────────────────────── ROSTER ─────────────────────────
  // Thanh chỉ số so với cả đội hình của phe: đầy = cao nhất trong kho. lowGood: số nhỏ là tốt (nạp đạn).
  function relBar(team, key, v, lowGood) {
    var tb = tableOf(team), lo = Infinity, hi = -Infinity;
    Object.keys(tb).forEach(function (id) { var x = tb[id][key]; if (x < lo) lo = x; if (x > hi) hi = x; });
    var k = hi > lo ? (v - lo) / (hi - lo) : 1;
    return 0.22 + 0.78 * (lowGood ? 1 - k : k);
  }
  function statRows(team, def) {
    if (team === 'diver') {
      return [
        ['O₂ (máu)', String(def.o2), relBar(team, 'o2', def.o2), 'o2'],
        ['Tốc độ', def.speed.toFixed(1) + ' m/s', relBar(team, 'speed', def.speed), 'sp'],
        ['Sát thương xiên', String(def.dmg), relBar(team, 'dmg', def.dmg), 'dm'],
        ['Nạp đạn', def.reload.toFixed(1) + ' s', relBar(team, 'reload', def.reload, true), 'rl']
      ];
    }
    return [
      ['Máu', String(def.hp), relBar(team, 'hp', def.hp), 'o2'],
      ['Tốc độ', def.speed.toFixed(1) + ' m/s', relBar(team, 'speed', def.speed), 'sp'],
      ['Lao', def.dash.toFixed(1) + ' m/s', relBar(team, 'dash', def.dash), 'rl'],
      ['Cắn (O₂ trừ)', String(def.bite), relBar(team, 'bite', def.bite), 'dm']
    ];
  }
  function bannerOfTeam(team) {
    for (var i = 0; i < VS.BANNERS.length; i++) if (VS.BANNERS[i].team === team) return VS.BANNERS[i];
    return null;
  }

  RENDER.roster = function (el, opts) {
    var sv = save(), view = { team: opts.team || sv.pick.team, focus: null };
    view.focus = opts.id || sv.pick[view.team];
    el.appendChild(topbar({ back: true, title: 'BỘ SƯU TẬP', brand: true }));
    var tabs = h('div', 'vs-tabs'), grid = h('div', 'vs-grid'), detail = h('aside', 'vs-detail');
    var list = h('div', 'vs-r-list vs-panel', [tabs, grid]);
    el.appendChild(h('div', 'vs-roster', [list, detail]));

    function ownedCount(team) { return Object.keys(save().owned[team]).length; }
    function drawTabs() {
      tabs.textContent = '';
      ['diver', 'shark'].forEach(function (team) {
        var total = Object.keys(tableOf(team)).length;
        var b = btn('vs-tab ' + team + (view.team === team ? ' on' : ''), [h('span', null, TEAM[team].name), h('small', 'vs-num', ownedCount(team) + '/' + total)], 'tab-' + team, function () {
          view.team = team; view.focus = save().pick[team]; drawAll();
        });
        b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', view.team === team ? 'true' : 'false');
        tabs.appendChild(b);
      });
    }
    function drawGrid() {
      grid.textContent = '';
      var s2 = save(), tb = tableOf(view.team), own = s2.owned[view.team];
      var ids = Object.keys(tb).sort(function (a, b2) {
        return (tb[b2].rarity - tb[a].rarity) || ((own[b2] ? 1 : 0) - (own[a] ? 1 : 0));
      });
      ids.forEach(function (id, i) {
        var d = tb[id], has = !!own[id];
        var c = btn('vs-ch r' + d.rarity + (has ? ' own' : ' lock') + (s2.pick[view.team] === id ? ' cur' : '') + (view.focus === id ? ' sel' : ''), null, 'ch-' + id, function () { view.focus = id; drawGrid(); drawDetail(); });
        c.style.setProperty('--i', i);
        c.setAttribute('aria-label', d.name + (has ? '' : ', chưa sở hữu'));
        c.dataset.id = id; c.dataset.own = has ? '1' : '0';
        add(c, [
          portrait(view.team, id, 'm'),
          h('span', 'vs-ch-n', d.name),
          stars(d.rarity, 'r' + d.rarity),
          has ? copiesTag(own[id]) : h('i', 'vs-lock'),
          s2.pick[view.team] === id ? h('span', 'vs-ch-cur', 'ĐANG DÙNG') : null
        ]);
        grid.appendChild(c);
      });
    }
    function drawDetail() {
      detail.textContent = '';
      var s2 = save(), team = view.team, id = view.focus, d = defOf(team, id);
      if (!d) { view.focus = s2.pick[team]; d = defOf(team, view.focus); id = view.focus; }
      var has = !!s2.owned[team][id], sk = skillOf(d), cur = s2.pick[team] === id;
      var rows = statRows(team, d).map(function (r) {
        var bar = h('i'); bar.style.width = Math.max(4, Math.min(100, r[2] * 100)).toFixed(0) + '%';
        return h('div', 'vs-stat ' + r[3], [h('span', null, r[0]), h('b', 'vs-num', r[1]), h('div', 'vs-bar', [bar])]);
      });
      var act;
      if (!has) {
        var bn = bannerOfTeam(team);
        act = h('div', 'vs-det-act', [
          h('button', 'vs-btn vs-btn-disabled vs-grow', 'CHƯA SỞ HỮU'),
          btn('vs-btn vs-btn-blue', 'Tới Gacha', 'to-gacha', function () { go('gacha', { banner: bn && bn.id }); })
        ]);
        act.firstChild.type = 'button'; act.firstChild.disabled = true; act.firstChild.dataset.act = 'locked';
      } else if (cur) {
        var on = h('button', 'vs-btn vs-btn-blue vs-btn-on vs-grow', [h('i', 'vs-check'), 'ĐANG DÙNG']);
        on.type = 'button'; on.disabled = true; on.dataset.act = 'current';
        act = h('div', 'vs-det-act', on);
      } else {
        act = h('div', 'vs-det-act', btn('vs-btn vs-btn-gold vs-grow', 'CHỌN', 'select', function () {
          var s3 = save(); s3.pick[team] = id; persist(); toast('Đã chọn ' + d.name); drawGrid(); drawDetail();
        }));
      }
      add(detail, [
        h('div', 'vs-det-top', [
          h('div', 'vs-det-pt ' + team + (has ? '' : ' lock'), portrait(team, id, 'l')),
          h('div', 'vs-det-id', [
            h('h3', 'vs-det-name', d.name), stars(d.rarity, 'r' + d.rarity),
            has ? h('div', 'vs-det-sao', copiesTag(s2.owned[team][id])) : h('div', 'vs-det-sao lockt', [h('i', 'vs-lock'), h('small', null, 'Chưa sở hữu')]),
            h('p', 'vs-blurb', d.blurb)
          ])
        ]),
        h('div', 'vs-stats', rows),
        h('div', 'vs-det-skill', [
          skillIcon(sk),
          h('div', null, [h('b', 'vs-sk-name', sk.name), h('small', 'vs-sk-cd', 'Hồi chiêu ' + sk.cd + ' s'), h('p', 'vs-sk-desc', sk.desc)])
        ]),
        act
      ]);
      detail.className = 'vs-detail vs-panel r' + d.rarity;
    }
    function drawAll() { drawTabs(); drawGrid(); drawDetail(); }
    drawAll();
    return null;
  };

  // ───────────────────────── GACHA ─────────────────────────
  function reasonText(why, n, b) {
    if (why === 'pearls') {
      var need = b.cost * n - save().pearls;
      return 'Thiếu ' + need + ' ngọc trai (có ' + save().pearls + ', cần ' + b.cost * n + ')';
    }
    return 'Không quay được';
  }

  RENDER.gacha = function (el, opts) {
    var day = VS.save.dayIndex(), closeReveal = null;
    S.sel.banner = (opts.banner && VS.gacha.banner(opts.banner)) ? opts.banner : (S.sel.banner && VS.gacha.banner(S.sel.banner) ? S.sel.banner : VS.BANNERS[0].id);
    el.appendChild(topbar({ back: true, title: 'GACHA', brand: true }));
    var tabs = h('nav', 'vs-btabs'), body = h('div', 'vs-gbody');
    el.appendChild(h('div', 'vs-gacha', [tabs, body]));

    function drawTabs() {
      tabs.textContent = '';
      VS.BANNERS.forEach(function (b) {
        var t = btn('vs-btab ' + b.team + (S.sel.banner === b.id ? ' on' : ''), [h('small', null, 'Banner ' + TEAM[b.team].low.toLowerCase()), h('b', null, b.name)], 'banner-' + b.id, function () { S.sel.banner = b.id; drawAll(); });
        t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', S.sel.banner === b.id ? 'true' : 'false');
        tabs.appendChild(t);
      });
    }
    function drawBody() {
      body.textContent = '';
      var sv = save(), b = VS.gacha.banner(S.sel.banner), f = VS.gacha.featured(b, day), tb = tableOf(b.team), info = VS.gacha.info(sv, b);
      var d5 = tb[f[5]], sk5 = skillOf(d5);
      body.className = 'vs-gbody ' + b.team;
      var four = h('div', 'vs-g4');
      f[4].forEach(function (id) {
        var d = tb[id], has = !!sv.owned[b.team][id];
        four.appendChild(h('div', 'vs-g4c r4' + (has ? ' own' : ''), [portrait(b.team, id, 'm'), h('span', 'vs-g4n', d.name), stars(4, 'r4'), has ? h('i', 'vs-owned') : null]));
      });
      var stage = h('div', 'vs-gstage vs-panel', [
        h('div', 'vs-g5 r5', [
          h('div', 'vs-g5-pt', portrait(b.team, f[5], 'xl')),
          h('div', 'vs-g5-t', [
            h('span', 'vs-tag up', 'TĂNG TỈ LỆ HÔM NAY'),
            h('h3', 'vs-g5-name', d5.name),
            stars(5, 'r5'),
            h('div', 'vs-g5-sk', [skillIcon(sk5), h('span', null, [h('b', null, sk5.name), h('small', null, sk5.desc)])])
          ])
        ]),
        h('div', 'vs-g4-wrap', [h('small', 'vs-g4-l', 'Thêm hai 4★ được tăng tỉ lệ'), four])
      ]);

      var r5 = b.rates[5], r4 = b.rates[4];
      var left = info.left5;
      var guarText = info.guar
        ? ['Lần 5★ tới ', h('b', null, 'chắc chắn là ' + d5.name), ' (đã trượt 50/50 lần trước).']
        : ['Lần 5★ tới: 50% ra ', h('b', null, d5.name), '; trượt thì lần sau chắc chắn trúng.'];
      var pity = h('div', 'vs-pity vs-panel', [
        h('p', 'vs-pity-main', ['Còn ', h('b', 'vs-num', String(left)), ' lượt chắc chắn ra 5★']),
        h('div', 'vs-pbar', [(function () { var i = h('i'); i.style.width = Math.min(100, info.n5 / VS.gacha.sureAt(b) * 100).toFixed(1) + '%'; return i; })()]),
        h('p', 'vs-pity-sub', ['Đã quay ', h('b', 'vs-num', String(info.n5)), ' lượt kể từ 5★ trước. ', guarText]),
        h('p', 'vs-pity-sub', ['Còn ', h('b', 'vs-num', String(info.left4)), ' lượt tới khi chắc chắn có 4★ trở lên.'])
      ]);
      pity.setAttribute('data-n5', String(info.n5));
      var rates = h('div', 'vs-rates vs-panel', [
        h('b', 'vs-rates-t', 'Tỉ lệ'),
        h('div', 'vs-rrow r5', [h('span', null, '5★'), h('b', 'vs-num', pct(r5)), h('small', null, 'từ lượt ' + b.soft + ' tăng dần ' + pct(b.softStep) + '/lượt')]),
        h('div', 'vs-rrow r4', [h('span', null, '4★'), h('b', 'vs-num', pct(r4)), h('small', null, 'chắc chắn sau ' + b.pity4 + ' lượt')]),
        h('div', 'vs-rrow r3', [h('span', null, '3★'), h('b', 'vs-num', pct(1 - r5 - r4)), h('small', null, '')]),
        h('p', 'vs-rnote', 'Tính cả bảo hiểm: trung bình ' + Math.round(VS.gacha.meanGap5(b)) + ' lượt có một 5★. Quay trùng nhân vật đã có thì đổi ra ngọc trai: 3★ +' + VS.gacha.dupeRefund(3) + ', 4★ +' + VS.gacha.dupeRefund(4) + ', 5★ +' + VS.gacha.dupeRefund(5) + '.')
      ]);

      var b1 = pullButton(b, 1), b10 = pullButton(b, 10);
      var short = sv.pearls < b.cost ? 1 : (sv.pearls < b.cost * 10 ? 10 : 0);
      var reason = h('p', 'vs-reason', short ? reasonText('pearls', short, b) : '');
      reason.dataset.reason = short ? 'pearls' : '';
      var pulls = h('div', 'vs-pulls', [h('div', 'vs-pull-row', [b1, b10]), reason]);
      body.appendChild(stage);
      body.appendChild(h('div', 'vs-ginfo', [pity, rates, pulls]));
    }
    function pullButton(b, n) {
      var can = save().pearls >= b.cost * n;
      var p = btn('vs-btn vs-pull ' + (n === 10 ? 'vs-btn-gold' : 'vs-btn-blue'), [h('span', 'vs-pull-t', 'Quay ' + n), h('span', 'vs-pull-c', [h('i', 'vs-pearl'), h('b', 'vs-num', String(b.cost * n))])], 'pull' + n, function () { doPull(b, n); });
      p.disabled = !can;
      p.setAttribute('aria-label', 'Quay ' + n + ' lượt, ' + b.cost * n + ' ngọc trai' + (can ? '' : ', không đủ ngọc'));
      return p;
    }
    function doPull(b, n) {
      var r = VS.gacha.pull(save(), b.id, n, newRng(), day);
      if (!r.ok) { toast(reasonText(r.why, n, b)); return; }
      persist();
      refreshPearls(el);
      drawBody();
      closeReveal = reveal(el, r.results, b, function () { closeReveal = null; drawAll(); });
    }
    function drawAll() { drawTabs(); drawBody(); refreshPearls(el); }
    drawAll();
    return function () { if (closeReveal) closeReveal(); };
  };

  // Lật thẻ: úp mặt, lật lần lượt, bậc cao nhất lật sau cùng (có sáng + rung); bấm vào lưới để lật hết ngay.
  function reveal(screen, results, b, onDone) {
    var ov = h('div', 'vs-reveal'), grid = h('div', 'vs-rv-grid' + (results.length === 1 ? ' one' : '')), cards = [];
    ov.dataset.n = String(results.length);
    var top = 0;
    results.forEach(function (r) { if (r.rarity > top) top = r.rarity; });
    results.forEach(function (r, i) {
      var d = defOf(r.team, r.id);
      var note = r.isNew ? h('em', 'vs-rc-note new', 'MỚI') : h('em', 'vs-rc-note dupe', 'Trùng · +' + r.refund + ' ngọc trai');
      var front = h('div', 'vs-rc-f', [
        portrait(r.team, r.id, results.length === 1 ? 'xl' : 'm'),
        h('b', 'vs-rc-n', d.name), stars(r.rarity, 'r' + r.rarity), note,
        r.featured ? h('span', 'vs-rc-feat', 'NỔI BẬT') : null,
        r.isNew ? img('vs-rc-new', art('ui/UI_Catch_New.png')) : null
      ]);
      var card = h('div', 'vs-rc r' + r.rarity + (r.isNew ? ' isnew' : ''), h('div', 'vs-rc-in', [h('div', 'vs-rc-b', h('i')), front]));
      card.dataset.id = r.id; card.dataset.rarity = String(r.rarity); card.style.setProperty('--i', i);
      cards.push(card); grid.appendChild(card);
    });
    var done = btn('vs-btn vs-btn-gold vs-rv-done', 'Xong', 'done', function () {
      timers.clear(); if (ov.parentNode) ov.parentNode.removeChild(ov); onDone();
    });
    done.disabled = true;
    add(ov, [h('div', 'vs-rv-title', 'Kết quả ' + results.length + ' lượt · ' + b.name), grid, done]);
    screen.appendChild(ov);

    var timers = bag();
    var order = cards.map(function (c, i) { return i; }).sort(function (a, c) { return (results[a].rarity - results[c].rarity) || (a - c); });
    var flipped = 0;
    function flip(i) {
      var c = cards[i];
      if (c.classList.contains('up')) return;
      c.classList.add('up');
      if (results[i].rarity === 5) { ov.classList.remove('shake'); void ov.offsetWidth; ov.classList.add('shake', 'flash'); }
      if (++flipped === cards.length) { done.disabled = false; ov.classList.add('all'); }
    }
    var t = 420;
    order.forEach(function (i) {
      if (results[i].rarity === top && top >= 4) t += 520;     // dừng một nhịp trước bậc cao nhất
      timers.after(t, function () { flip(i); });
      t += 170;
    });
    ov.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-act=done]')) return;
      timers.clear(); order.forEach(flip);
    });
    return function () { timers.clear(); if (ov.parentNode) ov.parentNode.removeChild(ov); };
  }

  // ───────────────────────── GHÉP TRẬN GIẢ ─────────────────────────
  RENDER.queue = function (el, opts) {
    var sv = save(), team = opts.team === 'shark' ? 'shark' : (opts.team === 'diver' ? 'diver' : sv.pick.team), tm = bag();
    var rng = newRng();
    var plan = VS.mmk.lineup(sv, team, rng);
    if (VS.flags) {
      if (VS.flags.seed != null) plan.seed = VS.flags.seed >>> 0;
      if (VS.flags.map && mapOf(VS.flags.map)) plan.mapId = VS.flags.map;
    }
    persist();                               // seq đã tăng

    // Lịch vào ghế: tổng 3-12 s, người cuối vào đúng lúc hết thời gian
    var total = QUEUE_MIN + rng() * QUEUE_SPAN;
    var others = [];
    plan.players.forEach(function (p, i) { if (!p.human) others.push(i); });
    var joins = others.map(function (_, k) { return k === others.length - 1 ? total : 0.5 + rng() * (total - 0.5); }).sort(function (a, b) { return a - b; });
    for (var i = others.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), x = others[i]; others[i] = others[j]; others[j] = x; }
    var joinAt = {};
    others.forEach(function (idx, k) { joinAt[idx] = joins[k]; });

    var title = h('h2', 'vs-q-title', ['ĐANG TÌM TRẬN ', h('span', 'vs-dot', '·'), ' PHE ' + TEAM[team].name]);
    var clock = h('b', 'vs-num vs-q-clock', '0:00');
    var head = h('div', 'vs-q-head', [title, h('div', 'vs-q-time', [h('small', null, 'Đã chờ'), clock, h('small', 'vs-q-est', ['Ước tính ~', h('span', 'vs-num', mmss(TEAM[team].est))])])]);
    var status = h('p', 'vs-q-status', 'Đang tìm đồng đội và đối thủ…');
    status.setAttribute('role', 'status');
    var teams = {}, seats = [];
    ['diver', 'shark'].forEach(function (t) {
      var count = h('small', 'vs-num vs-q-n', '0/' + VS.TUNING.match[t === 'diver' ? 'divers' : 'sharks']);
      teams[t] = { el: h('div', 'vs-team vs-team-' + t, [h('h3', null, [TEAM[t].name, ' ', count])]), count: count, max: VS.TUNING.match[t === 'diver' ? 'divers' : 'sharks'], n: 0 };
    });
    plan.players.forEach(function (p, i) {
      var seat = h('div', 'vs-seat ' + p.team, [h('span', 'vs-seat-pt'), h('div', 'vs-seat-w', [h('b', 'vs-seat-n'), h('small', 'vs-seat-m vs-num')])]);
      seat.dataset.i = String(i); seat.dataset.team = p.team;
      seats.push(seat); teams[p.team].el.appendChild(seat);
    });
    var cancel = btn('vs-btn vs-btn-ghost vs-cancel', 'HUỶ', 'cancel', function () { go('lobby'); });
    add(el, [head, h('div', 'vs-seats', [teams.diver.el, teams.shark.el]), status, cancel]);

    var filled = 0, t0 = performance.now(), finished = false;
    function fill(i) {
      var p = plan.players[i], seat = seats[i];
      if (seat.classList.contains('on')) return;
      seat.classList.add('on'); if (p.human) seat.classList.add('me');
      seat.querySelector('.vs-seat-pt').appendChild(portrait(p.team, p.defId, 's'));
      seat.querySelector('.vs-seat-n').textContent = whoName(p);
      seat.querySelector('.vs-seat-m').textContent = 'Lv.' + p.level + ' · ' + p.ping + ' ms';
      filled++; teams[p.team].n++; teams[p.team].count.textContent = teams[p.team].n + '/' + teams[p.team].max;
      status.textContent = filled < plan.players.length ? 'Đã tìm thấy ' + filled + '/' + plan.players.length + ' người chơi…' : 'Đủ người! Đang bốc bản đồ…';
      el.dataset.filled = String(filled);
    }
    plan.players.forEach(function (p, i) { if (p.human) fill(i); });
    tm.every(100, function () {
      var t = (performance.now() - t0) / 1000;
      clock.textContent = mmss(t);
      plan.players.forEach(function (p, i) { if (!p.human && joinAt[i] <= t) fill(i); });
      if (!finished && filled === plan.players.length) {
        finished = true; el.dataset.full = '1';
        tm.after(900, function () { go('map', { plan: plan }); });
      }
    });
    return function () { tm.clear(); };
  };

  // ───────────────────────── BỐC BẢN ĐỒ ─────────────────────────
  function mapCard(m) {
    var th = THEME[m.theme] || THEME.day;
    var c = h('div', 'vs-mc', [h('small', 'vs-mc-id vs-num', m.id), h('b', 'vs-mc-n', m.name), h('span', 'vs-mc-t', th.label)]);
    c.style.setProperty('--ta', th.a); c.style.setProperty('--tb', th.b); c.style.setProperty('--tg', th.glow);
    c.dataset.map = m.id;
    return c;
  }

  RENDER.map = function (el, opts) {
    var plan = opts.plan, tm = bag(), maps = VS.MAPS, N = maps.length, target = 0;
    maps.forEach(function (m, i) { if (m.id === plan.mapId) target = i; });
    var REP = 8, LAND = 6;
    var title = h('h2', 'vs-m-title', 'ĐANG BỐC BẢN ĐỒ…');
    var view = h('div', 'vs-roul'), strip = h('div', 'vs-strip'), cards = [];
    for (var r = 0; r < REP; r++) for (var i = 0; i < N; i++) { var c = mapCard(maps[i]); cards.push(c); strip.appendChild(c); }
    add(view, [strip, h('i', 'vs-mark vs-mark-t'), h('i', 'vs-mark vs-mark-b')]);
    var name = h('p', 'vs-m-name', 'Mỗi trận chỉ chơi một bản đồ, bốc ngẫu nhiên.');
    add(el, [title, view, name]);

    tm.after(80, function () {
      var vw = view.clientWidth, cw = cards[0].offsetWidth, pitch = cards[1].offsetLeft - cards[0].offsetLeft;
      function xFor(k) { return vw / 2 - (cards[k].offsetLeft + cw / 2); }
      var end = LAND * N + target, from = xFor(2), to = xFor(end), hot = null, t0 = performance.now(), landed = false;
      strip.style.transform = 'translateX(' + from + 'px)';
      // Web Animations thay cho transition: kết thúc theo đúng dòng thời gian của hoạt ảnh, không lệch khi khung hình bị trễ
      var anim = strip.animate([{ transform: 'translateX(' + from + 'px)' }, { transform: 'translateX(' + to + 'px)' }], { duration: ROULETTE_MS, easing: 'cubic-bezier(.08,.6,.12,1)', fill: 'forwards' });
      tm.frame(function (now) {
        var tx = new DOMMatrix(getComputedStyle(strip).transform).m41;
        var k = Math.max(0, Math.min(cards.length - 1, Math.round((vw / 2 - tx - cw / 2) / pitch)));
        if (cards[k] !== hot) { if (hot) hot.classList.remove('hot'); hot = cards[k]; hot.classList.add('hot'); }
        return !landed && now - t0 < ROULETTE_MS + 400;
      });
      function land() {
        if (landed) return;
        landed = true;
        strip.style.transform = 'translateX(' + to + 'px)';     // vị trí cuối chắc chắn, rồi bỏ hoạt ảnh
        anim.cancel();
        if (hot) hot.classList.remove('hot');
        cards[end].classList.add('lock'); view.classList.add('done');
        var mp = mapOf(plan.mapId);
        title.textContent = 'BẢN ĐỒ CỦA TRẬN';
        name.textContent = ''; name.appendChild(h('b', null, mp.name)); name.appendChild(document.createTextNode(' · ' + (THEME[mp.theme] || THEME.day).label));
        el.dataset.map = plan.mapId; el.dataset.landed = '1';
        tm.after(HOLD_MS, function () { go('versus', { plan: plan }); });
      }
      anim.onfinish = land;
      tm.after(ROULETTE_MS + 700, land);                         // lưới an toàn khi tab bị ẩn làm hoạt ảnh đứng yên
    });
    return function () { tm.clear(); };
  };

  // ───────────────────────── ĐỐI ĐẦU ─────────────────────────
  function pingClass(ms) { return ms < 60 ? 'good' : ms < 110 ? 'mid' : 'bad'; }

  RENDER.versus = function (el, opts) {
    var plan = opts.plan, tm = bag(), mp = mapOf(plan.mapId);
    var cols = { diver: h('div', 'vs-vt vs-vt-diver', h('h3', null, TEAM.diver.name)), shark: h('div', 'vs-vt vs-vt-shark', h('h3', null, TEAM.shark.name)) };
    plan.players.forEach(function (p, i) {
      var d = defOf(p.team, p.defId);
      var card = h('article', 'vs-vp ' + p.team + (p.human ? ' me' : ''), [
        portrait(p.team, p.defId, p.team === 'shark' ? 'l' : 'm'),
        h('div', 'vs-vp-w', [
          h('b', 'vs-vp-n', whoName(p)),
          h('small', 'vs-vp-c', d.name),
          h('div', 'vs-vp-m', [h('span', 'vs-lv vs-num', 'Lv.' + p.level), h('span', 'vs-ping ' + pingClass(p.ping), [h('i'), h('i'), h('i'), h('span', 'vs-num', p.ping + ' ms')])])
        ])
      ]);
      card.style.setProperty('--i', i); card.dataset.team = p.team;
      cols[p.team].appendChild(card);
    });
    var count = h('b', 'vs-count vs-num', String(COUNTDOWN));
    var mid = h('div', 'vs-vmid', [h('div', 'vs-vs', 'VS'), h('div', 'vs-v-map', [h('small', null, 'Bản đồ'), h('b', null, mp ? mp.name : plan.mapId)]), count]);
    add(el, [h('h2', 'vs-v-title', 'TRẬN SẮP BẮT ĐẦU'), h('div', 'vs-v-body', [cols.diver, mid, cols.shark])]);

    var n = COUNTDOWN;
    function step() {
      if (n <= 0) { launch(plan); return; }
      count.textContent = String(n); restart(count, 'pop'); el.dataset.count = String(n);
      n--; tm.after(1000, step);
    }
    step();
    return function () { tm.clear(); };
  };

  function launch(plan) {
    var cfg = { seed: plan.seed, mapId: plan.mapId, lineup: plan.lineup };
    go('loading', { mapId: plan.mapId });
    try {
      if (typeof VS.lobby.onStart !== 'function') throw new Error('VS.lobby.onStart chưa được gắn');
      VS.lobby.onStart(cfg);
    } catch (e) {
      console.error('Không vào được trận:', e);
      toast('Không vào được trận: ' + e.message);
      go('lobby');
    }
  }

  // ───────────────────────── TẢI TRẬN ─────────────────────────
  function tipList() {
    var T = VS.TUNING, M = T.match, V = T.vision, D = T.diver;
    return [
      'Thợ lặn chỉ thấy vùng đèn pin soi. Vách đá chặn ánh sáng, nên góc khuất là chỗ trú an toàn nhất.',
      'Bấm F để tắt đèn pin: cá mập thấy đèn của bạn từ xa ' + V.beacon + ' m, tắt đèn là biến mất khỏi tầm săn.',
      'Thợ lặn dưới ' + Math.round(V.bloodPct * 100) + '% O₂ bị cá mập ngửi thấy từ ' + V.bloodRange + ' m. Tìm rương O₂ trước khi quá muộn.',
      'Chỉ tiêu thắng là ' + Math.round(M.targetPct * 100) + '% tổng giá trị kho báu của trận. Nộp ở khoang cứu hộ.',
      'Mang càng nặng bơi càng chậm: mỗi kg trừ ' + Math.round(D.kgSlow * 100) + '% tốc độ.',
      'Đồng đội gục chờ được cứu ' + D.downT + ' giây. Đứng cạnh và giữ phím tương tác ' + D.reviveT + ' giây là cứu được.',
      'Cả đội thợ lặn chung ' + M.tickets + ' lượt hồi sinh. Hết lượt thì ai bị loại là mất luôn.',
      'Xiên trúng cá mập làm nó chậm ' + Math.round(D.harpoonSlow * 100) + '% trong ' + D.harpoonSlowT + ' giây, đủ để chạy vào khe hẹp.',
      'Cá mập to hơn thợ lặn, nên khe đá hẹp là chỗ trú của bạn.',
      'Mỗi loài cá mập và mỗi thợ lặn có một kỹ năng riêng. Dùng đúng lúc là lật được thế trận.',
      'Cá mập thắng khi hết ' + M.length + ' giây, hoặc khi thợ lặn hết lượt hồi sinh và gục hết.'
    ];
  }

  RENDER.loading = function (el, opts) {
    var tips = tipList(), tip = tips[Math.floor(Math.random() * tips.length)];
    var bar = h('i'), pctEl = h('b', 'vs-num vs-l-pct', '0%'), name = h('h2', 'vs-l-map', ''), theme = h('span', 'vs-l-theme', '');
    var card = h('div', 'vs-l-card', [
      h('small', 'vs-l-k', 'ĐANG TẢI TRẬN'), name, theme,
      h('div', 'vs-lbar', [bar]), pctEl,
      h('p', 'vs-tip', [h('b', null, 'MẸO'), ' ', tip])
    ]);
    el.appendChild(card);
    S.loading = { el: el, bar: bar, pct: pctEl, name: name, theme: theme, card: card };
    paintLoading(opts.p || 0, opts.mapId);
    return function () { S.loading = null; };
  };
  function paintLoading(p, mapId) {
    var L = S.loading; if (!L) return;
    var mp = mapOf(mapId);
    if (mp) { var th = THEME[mp.theme] || THEME.day; L.name.textContent = mp.name; L.theme.textContent = th.label; L.card.style.setProperty('--ta', th.a); L.card.style.setProperty('--tb', th.b); L.el.dataset.map = mp.id; }
    else if (mapId) { L.name.textContent = mapId; L.el.dataset.map = mapId; }
    var k = Math.max(0, Math.min(1, p || 0));
    L.bar.style.width = (k * 100).toFixed(0) + '%';
    L.pct.textContent = Math.round(k * 100) + '%';
  }

  // ───────────────────────── KẾT QUẢ ─────────────────────────
  var COLS = [
    ['banked', 'Kho báu', 'Kho báu đã nộp'], ['downs', 'Hạ gục', 'Lần hạ gục thợ lặn'], ['outs', 'Loại', 'Lần loại hẳn'],
    ['dmg', 'Sát thương', 'Sát thương gây ra'], ['revives', 'Cứu', 'Lần cứu đồng đội']
  ];

  RENDER.result = function (el, opts) {
    var m = opts.m || {}, rw = opts.rewards, tm = bag(), eco = VS.TUNING.economy;
    var actors = m.actors || [];
    var me = null;
    actors.forEach(function (a) { if (!me && a.ctrl === 'human') me = a; });
    if (!me && VS.state && VS.state.viewer) me = actors[VS.state.viewer.id] || null;
    me = me || actors[0] || { team: 'diver' };
    var winner = m.result && m.result.winner;
    var win = rw ? rw.win : winner === me.team;
    var mp = mapOf(m.mapId);

    var banner = h('div', 'vs-banner ' + (win ? 'win' : 'lose'), [
      h('h1', 'vs-banner-t', win ? 'THẮNG' : 'THUA'),
      h('p', 'vs-banner-s', [h('b', null, TEAM[me.team] ? TEAM[me.team].name : ''), ' · ', winner === 'diver' ? 'Thợ lặn nộp đủ chỉ tiêu kho báu.' : (winner === 'shark' ? 'Cá mập thắng: hết giờ hoặc thợ lặn không còn ai.' : 'Trận kết thúc.'), mp ? '  Bản đồ ' + mp.name + '.' : ''])
    ]);
    banner.firstChild.dataset.t = win ? 'THẮNG' : 'THUA';

    var tbl = h('table', 'vs-tbl'), thead = h('tr');
    thead.appendChild(h('th', 'vs-tbl-who', 'Người chơi'));
    COLS.forEach(function (c) { var th = h('th', 'vs-tbl-n', c[1]); th.title = c[2]; thead.appendChild(th); });
    tbl.appendChild(h('thead', null, thead));
    var tb = h('tbody');
    ['diver', 'shark'].forEach(function (team) {
      var side = actors.filter(function (a) { return a.team === team; });
      if (!side.length) return;
      var sideWin = winner === team;
      var hr = h('tr', 'vs-tbl-side ' + team + (sideWin ? ' win' : ''));
      var td = h('td', null, [h('b', null, TEAM[team].name), h('span', 'vs-tbl-wl', sideWin ? 'THẮNG' : 'THUA')]);
      td.colSpan = COLS.length + 1; hr.appendChild(td); tb.appendChild(hr);
      side.forEach(function (a) {
        var st = a.stats || {}, d = defOf(a.team, a.defId);
        var row = h('tr', 'vs-tbl-row ' + team + (a === me ? ' me' : ''));
        row.dataset.id = String(a.id);
        row.appendChild(h('td', 'vs-tbl-who', h('div', 'vs-who', [d ? portrait(a.team, a.defId, 's') : null, h('span', null, [h('b', null, whoName({ name: a.name || (d && d.name) || '?', human: a === me })), d ? h('small', null, d.name) : null])])));
        COLS.forEach(function (c) {
          var v = Math.round(Number(st[c[0]]) || 0);
          var cell = h('td', 'vs-tbl-n vs-num' + (v ? '' : ' z'), String(v));
          cell.dataset.k = c[0]; row.appendChild(cell);
        });
        tb.appendChild(row);
      });
    });
    tbl.appendChild(tb);

    var rew = h('aside', 'vs-rew vs-panel');
    var totalEl = h('b', 'vs-num vs-rew-total', '0');
    if (rw) {
      var base = win ? eco.win : eco.lose, pts = Math.min(rw.points * eco.perPoint, eco.pointCap);
      var lines = [h('li', null, [h('span', null, win ? 'Thắng trận' : 'Thua trận'), h('b', 'vs-num', '+' + base)])];
      var ms = me.stats || {};
      var what = me.team === 'shark' ? 'Hạ ' + rw.points + ' thợ lặn' : 'Nộp ' + Math.round(ms.banked || 0) + ' kho báu, cứu ' + Math.round(ms.revives || 0) + ' lần';
      lines.push(h('li', null, [h('span', null, what + ' (' + rw.points + ' điểm' + (rw.points * eco.perPoint > pts ? ', tối đa' : '') + ')'), h('b', 'vs-num', '+' + pts)]));
      if (rw.firstWin) lines.push(h('li', 'first', [h('span', null, 'Thắng trận đầu tiên trong ngày'), h('b', 'vs-num', '+' + eco.firstWin)]));
      var sv = save(), need = VS.META.exp.perLevel;
      var expFill = h('i');
      var before = rw.levelUp ? 0 : Math.max(0, sv.exp - rw.exp);
      expFill.style.width = (before / need * 100).toFixed(1) + '%';
      add(rew, [
        h('b', 'vs-rew-t', 'PHẦN THƯỞNG'),
        h('div', 'vs-rew-big', [h('i', 'vs-pearl'), h('span', 'vs-plus', '+'), totalEl, h('small', null, 'ngọc trai')]),
        h('ul', 'vs-rew-list', lines),
        h('div', 'vs-rew-exp', [
          h('div', 'vs-rew-exp-h', [h('span', 'vs-num', 'Lv.' + sv.level), h('b', 'vs-num', '+' + rw.exp + ' EXP')]),
          h('div', 'vs-expbar', [expFill]),
          rw.levelUp ? h('span', 'vs-lvup', 'LÊN CẤP ' + sv.level + '!') : null
        ])
      ]);
      countUp(totalEl, rw.pearls, 1100, tm);
      tm.after(250, function () { expFill.style.width = (sv.exp / need * 100).toFixed(1) + '%'; });
    } else {
      add(rew, [h('b', 'vs-rew-t', 'PHẦN THƯỞNG'), h('p', 'vs-rew-none', 'Trận này chưa tính thưởng.')]);
    }

    var again = btn('vs-btn vs-btn-gold vs-again', 'CHƠI TIẾP', 'again', function () {
      var team = save().pick.team;
      if (typeof VS.lobby.onLeave === 'function') VS.lobby.onLeave();   // để main dọn trận cũ
      go('queue', { team: team });
    });
    var leave = btn('vs-btn vs-btn-blue vs-leave', 'VỀ SẢNH', 'leave', function () {
      if (typeof VS.lobby.onLeave === 'function') VS.lobby.onLeave();
      if (S.screen === 'result') go('lobby');                        // không có người nghe onLeave thì tự về sảnh
    });
    add(el, [banner, h('div', 'vs-res-body', [h('div', 'vs-tbl-wrap vs-panel', tbl), rew]), h('footer', 'vs-actions', [again, leave])]);
    el.classList.add(win ? 'is-win' : 'is-lose');
    return function () { tm.clear(); };
  };

  RENDER.match = function () { return null; };

  // ───────────────────────── API công khai ─────────────────────────
  VS.lobby = {
    onStart: null,
    onLeave: null,
    show: function (screen, opts) {
      if (screen === 'result') screen = 'lobby';            // kết quả chỉ vào qua showResult(m, rewards)
      go(screen, opts);
    },
    loading: function (p, m) {
      if (S.screen !== 'loading') go('loading', { p: p, mapId: m && m.mapId });
      else paintLoading(p, m && m.mapId || (S.loading && S.loading.el.dataset.map));
    },
    showResult: function (m, rewards) { go('result', { m: m, rewards: rewards }); },
    screen: function () { return S.screen; }
  };
})(window.VS = window.VS || {});
