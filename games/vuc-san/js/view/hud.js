// Lớp vẽ: HUD gọn trong #hud (DOM). Giờ, thanh kho báu đã nộp / chỉ tiêu, lượt hồi sinh; thợ lặn: đồng hồ O₂
// (khung UI_O2_Frame_New gốc), cân đang mang, đèn; cá mập: máu + thể lực; nút kỹ năng có vạch hồi chiêu; mũi tên ở mép
// màn chỉ tới mọi khoang cứu hộ và đồng đội đang gục ngoài màn hình; thông báo ngắn.
// m.t chỉ đếm thời gian chơi (0 suốt mở màn); mở màn đếm bằng m.phaseT.
(function (VS) {
  'use strict';
  var H = VS.hud = {};
  var el = null, R = {}, cur = { team: null, viewer: null, skill: null }, toasts = [];

  function $(sel) { return el.querySelector(sel); }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function initials(name) { return (name || '?').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function setW(node, k) { var w = Math.round(Math.max(0, Math.min(1, k)) * 1000) / 10 + '%'; if (node.style.width !== w) node.style.width = w; }
  function setText(node, s) { s = String(s); if (node.textContent !== s) node.textContent = s; }

  function build() {
    var host = document.getElementById('hud');
    if (!host) { host = document.createElement('div'); host.id = 'hud'; document.body.appendChild(host); }
    el = document.createElement('div');
    el.className = 'vs-hud';
    el.innerHTML = [
      '<div class="vs-hud-top">',
      '  <div class="vs-tickets" title="Lượt hồi sinh của đội thợ lặn"></div>',
      '  <div class="vs-timer">4:00</div>',
      '  <div class="vs-score"><div class="bar"><i></i><u></u></div><div class="num"><span class="b">0</span><span class="tg">/ 0</span></div></div>',
      '</div>',
      '<div class="vs-intro" hidden></div>',
      '<div class="vs-state" hidden></div>',
      '<div class="vs-o2" hidden>',
      '  <img class="frame" alt="" src="' + VS.asset('hx:art/ui/UI_O2_Frame_New.png') + '">',
      '  <div class="pie"></div><div class="n">100</div><div class="lbl">O₂</div>',
      '  <div class="kg"><span>0</span> kg</div><div class="lamp" title="F: bật/tắt đèn">ĐÈN</div>',
      '</div>',
      '<div class="vs-shark" hidden>',
      '  <div class="name"></div>',
      '  <div class="row hp"><b>MÁU</b><div class="bar"><i></i></div><span class="v"></span></div>',
      '  <div class="row st"><b>SỨC</b><div class="bar"><i></i></div></div>',
      '</div>',
      '<button class="vs-skill" type="button" hidden><span class="ic"></span><span class="cd"></span><span class="t"></span><span class="key">Q</span></button>',
      '<div class="vs-hud-toasts"></div>',
      '<div class="vs-arrows"></div>',
    ].join('');
    host.appendChild(el);
    R = {
      tickets: $('.vs-tickets'), timer: $('.vs-timer'), scoreBar: $('.vs-score .bar i'), scoreTarget: $('.vs-score .bar u'),
      banked: $('.vs-score .b'), target: $('.vs-score .tg'), intro: $('.vs-intro'), state: $('.vs-state'),
      o2: $('.vs-o2'), o2pie: $('.vs-o2 .pie'), o2n: $('.vs-o2 .n'), kg: $('.vs-o2 .kg span'), lamp: $('.vs-o2 .lamp'),
      shark: $('.vs-shark'), sname: $('.vs-shark .name'), hp: $('.vs-shark .hp .bar i'), hpv: $('.vs-shark .hp .v'), sta: $('.vs-shark .st .bar i'),
      skill: $('.vs-skill'), skIc: $('.vs-skill .ic'), skCd: $('.vs-skill .cd'), skT: $('.vs-skill .t'), toasts: $('.vs-hud-toasts'),
      arrows: $('.vs-arrows'),
    };
    // nút kỹ năng bấm được bằng chuột / chạm: đi qua lớp input như phím Q
    R.skill.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (VS.input && VS.input.press) VS.input.press('skill'); });
  }

  H.show = function (m, viewer) {
    if (!el) build();
    var host = document.getElementById('hud');
    if (host) host.hidden = false;
    el.hidden = false;
    cur.viewer = viewer; cur.team = viewer && viewer.team; cur.skill = null;
    var me = viewer && m.actors[viewer.id];
    R.o2.hidden = cur.team !== 'diver';
    R.shark.hidden = cur.team !== 'shark';
    if (me && cur.team === 'shark') setText(R.sname, (VS.SHARKS[me.defId] || {}).name || me.defId);
    R.tickets.innerHTML = '';
    for (var i = 0; i < (m.tickets != null ? Math.max(m.tickets, VS.TUNING.match.tickets) : VS.TUNING.match.tickets); i++) R.tickets.appendChild(document.createElement('b'));
    R.toasts.innerHTML = ''; toasts = [];
    H.update(m, viewer, 0);
  };

  H.hide = function () {
    var host = document.getElementById('hud');
    if (host) host.hidden = true;
    if (el) el.hidden = true;
  };

  function skillLook(id) {
    if (cur.skill === id) return;
    cur.skill = id;
    var sd = VS.SKILL_DATA[id] || {};
    R.skill.hidden = !id;
    R.skill.title = (sd.name || '') + (sd.desc ? ': ' + sd.desc : '');
    R.skIc.innerHTML = '';
    if (sd.icon) { var im = document.createElement('img'); im.alt = ''; im.src = VS.asset(sd.icon); R.skIc.appendChild(im); }
    else R.skIc.textContent = initials(sd.name);
  }

  H.update = function (m, viewer, dt) {
    if (!el || el.hidden || !m) return;
    var TU = VS.TUNING.match, me = viewer && m.actors[viewer.id];
    // giờ: mở màn đếm ngược (phaseT), rồi thời gian chơi còn lại (m.t chỉ đếm thời gian chơi)
    var left = Math.max(0, TU.length - (m.t || 0));
    setText(R.timer, fmt(left));
    R.timer.classList.toggle('low', m.phase === 'play' && left < 30);
    var intro = m.phase === 'intro';
    if (R.intro.hidden === intro) R.intro.hidden = !intro;
    if (intro) setText(R.intro, Math.max(1, Math.ceil(TU.intro - (m.phaseT || 0))));
    arrows(m, viewer, me);
    var sc = m.score || { banked: 0, target: 0 };
    setW(R.scoreBar, sc.target ? sc.banked / sc.target : 0);
    setText(R.banked, Math.round(sc.banked));
    setText(R.target, '/ ' + Math.round(sc.target));
    var tk = R.tickets.children, nt = m.tickets != null ? m.tickets : 0;
    for (var i = 0; i < tk.length; i++) { var used = i >= nt; if (tk[i].classList.contains('used') !== used) tk[i].classList.toggle('used', used); }
    if (!me) return;
    if (me.team === 'diver') {
      var k = me.o2Max ? me.o2 / me.o2Max : 0;
      R.o2pie.style.setProperty('--k', Math.round(Math.max(0, Math.min(1, k)) * 360) + 'deg');
      setText(R.o2n, Math.max(0, Math.ceil(me.o2 || 0)));
      el.classList.toggle('low-o2', k < 0.3 && me.st !== 'out');
      setText(R.kg, Math.round(me.carryKg || 0));
      R.lamp.classList.toggle('on', !!me.light);
    } else {
      setW(R.hp, me.hpMax ? me.hp / me.hpMax : 0);
      setText(R.hpv, Math.max(0, Math.ceil(me.hp || 0)));
      setW(R.sta, (me.stamina || 0) / VS.TUNING.shark.staminaMax);
    }
    // kỹ năng: vạch hồi chiêu quét ngược kim đồng hồ, số giây còn lại
    var sk = me.skill;
    skillLook(sk && sk.id);
    if (sk && sk.id) {
      var sd = VS.SKILL_DATA[sk.id] || {}, cdLeft = Math.max(0, sk.cd || 0), frac = sd.cd ? Math.min(1, cdLeft / sd.cd) : 0;
      R.skCd.style.setProperty('--k', Math.round(frac * 360) + 'deg');
      // kỹ năng có lượt (mìn): hiện số lượt còn, vạch quét là thời gian nạp lượt kế; còn lại hiện giây hồi chiêu
      setText(R.skT, sd.charges ? (sk.charges || 0) : cdLeft > 0 ? Math.ceil(cdLeft) : '');
      R.skill.classList.toggle('ready', sd.charges ? (sk.charges || 0) > 0 : cdLeft <= 0);
      R.skill.classList.toggle('active', (sk.t || 0) > 0);
    }
    // trạng thái của chính mình: gục, bị loại (đang xem đồng đội), bị ngậm
    var msg = '';
    if (me.st === 'down') msg = 'Gục! Chờ đồng đội cứu · ' + fmt(VS.TUNING.diver.downT - (me.stT || 0));
    else if (me.st === 'out') msg = (me.team === 'diver' ? 'Bị loại · hồi sinh sau ' + fmt(VS.TUNING.diver.respawnT - (me.stT || 0)) : 'Rút lui · quay lại sau ' + fmt(VS.TUNING.shark.outT - (me.stT || 0))) + ' · đang xem đồng đội';
    else if (me.st === 'held') msg = 'Bị cá mập ngậm!';
    if (R.state.hidden === !msg) R.state.hidden = !msg;
    if (msg) setText(R.state, msg);
    for (var j = toasts.length - 1; j >= 0; j--) {
      toasts[j].t -= dt || 0;
      if (toasts[j].t <= 0) { toasts[j].el.remove(); toasts.splice(j, 1); }
    }
  };

  // ---------- mũi tên mép màn: mọi khoang cứu hộ, đồng đội đang gục ở ngoài màn hình ----------
  var pool = [];
  function arrowEl(i) {
    if (pool[i]) return pool[i];
    var d = document.createElement('div');
    d.innerHTML = '<span class="pt"></span><b></b>';
    R.arrows.appendChild(d);
    return (pool[i] = { el: d, pt: d.firstChild, lbl: d.lastChild, cls: '', txt: '' });
  }
  function arrows(m, viewer, me) {
    var n = 0, W = innerWidth, H = innerHeight, pad = Math.max(26, Math.min(W, H) * 0.06);
    var cx = W / 2, cy = H / 2, from = me && me.st !== 'out' ? me : null;
    var cam = VS.view && VS.view.screenToWorld ? VS.view.screenToWorld(cx, cy) : { x: 0, y: 0 };
    var list = [];
    (m.pods || []).forEach(function (p) { list.push({ x: p.x, y: p.y, cls: 'pod', label: '' }); });
    if (viewer) m.actors.forEach(function (a) {
      if (a.team === viewer.team && a.id !== viewer.id && a.st === 'down') list.push({ x: a.x, y: a.y, cls: 'down', label: a.name });
    });
    for (var i = 0; i < list.length; i++) {
      var t = list[i], s = VS.view.worldToScreen(t.x, t.y);
      if (s.x > pad && s.x < W - pad && s.y > pad && s.y < H - pad) continue;   // đang trong màn hình: khỏi chỉ
      var dx = s.x - cx, dy = s.y - cy, k = Math.min(Math.abs((W / 2 - pad) / (dx || 1e-6)), Math.abs((H / 2 - pad) / (dy || 1e-6)));
      var ax = cx + dx * k, ay = cy + dy * k, o = arrowEl(n++);
      var dist = Math.round(Math.hypot(t.x - (from ? from.x : cam.x), t.y - (from ? from.y : cam.y)));
      var cls = 'vs-arrow ' + t.cls, txt = (t.label ? t.label + ' · ' : '') + dist + ' m';
      if (o.cls !== cls) { o.cls = cls; o.el.className = cls; }
      if (o.txt !== txt) { o.txt = txt; o.lbl.textContent = txt; }
      o.el.hidden = false;
      o.el.style.transform = 'translate(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px)';
      o.pt.style.transform = 'translate(-50%,-50%) rotate(' + Math.atan2(dy, dx).toFixed(3) + 'rad)';
    }
    for (; n < pool.length; n++) if (!pool[n].el.hidden) pool[n].el.hidden = true;
  }

  function toast(text, cls) {
    if (!el) return;
    var d = document.createElement('div');
    d.className = 'vs-hud-toast ' + (cls || '');
    d.textContent = text;
    R.toasts.appendChild(d);
    toasts.push({ el: d, t: 2.4 });
    while (toasts.length > 4) toasts.shift().el.remove();
  }

  H.onEvents = function (m, events, viewer) {
    if (!el || el.hidden || !events) return;
    var me = viewer && m.actors[viewer.id];
    events.forEach(function (e) {
      var a = e.id != null ? m.actors[e.id] : null, tgt = e.target != null ? m.actors[e.target] : null;
      if (e.type === 'bite' && tgt && me && tgt.id === me.id) toast('Bị cắn!', 'bad');
      else if (e.type === 'bank' && e.value) toast('+' + Math.round(e.value) + ' kho báu', viewer && viewer.team === 'diver' ? 'good' : 'bad');
      else if (e.type === 'down' && a) toast(a.name + ' gục', a.team === (viewer && viewer.team) ? 'bad' : 'good');
      else if (e.type === 'out' && a) toast(a.name + (a.team === 'shark' ? ' rút lui' : ' bị loại'), a.team === (viewer && viewer.team) ? 'bad' : 'good');
      else if (e.type === 'revive' && a) toast(a.name + ' được cứu', a.team === (viewer && viewer.team) ? 'good' : 'bad');
    });
  };
})(window.VS = window.VS || {});
