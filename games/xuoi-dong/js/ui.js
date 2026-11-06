/*
 * Xuôi Dòng — lớp giao diện DOM (chữ tiếng Việt cần font hệ thống, không vẽ lên canvas pixel).
 */
(function (XD) {
  'use strict';
  var AT = window.XD_ATLAS;
  var $ = function (id) { return document.getElementById(id); };
  var UI = XD.ui = {};
  var G, touch = false, last = {}, toastT = 0;

  function drawFrame(canvas, name, scale) {
    var f = AT.frames[name], atlas = XD.render.IMG.atlas;
    canvas.width = f.w; canvas.height = f.h;
    var c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    if (scale) { canvas.style.width = f.w * scale + 'px'; canvas.style.height = f.h * scale + 'px'; }
    return c;
  }

  function set(id, text) { if (last[id] !== text) { last[id] = text; $(id).textContent = text; } }

  UI.init = function (g) {
    G = g;
    touch = matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', touch);
    $('hint').textContent = touch
      ? 'Kéo ngón tay lên xuống để lái · nút Còi để hú còi'
      : 'W/S hoặc ↑/↓ lái · A/D chậm/nhanh · Space hú còi · P tạm dừng · M tắt tiếng · J sổ cá';
    var picks = $('boats');
    Object.keys(XD.BOATS).forEach(function (k) {
      var b = XD.BOATS[k], btn = document.createElement('button');
      btn.className = 'boat'; btn.dataset.k = k;
      var cv = document.createElement('canvas');
      drawFrame(cv, XD.animFrames(b.anim)[0], 0.5);
      btn.appendChild(cv);
      var s = document.createElement('span'); s.textContent = b.name; btn.appendChild(s);
      var n = document.createElement('small'); n.textContent = b.note; btn.appendChild(n);
      btn.onclick = function () { pickBoat(k); XD.audio.unlock(); XD.audio.play('click'); };
      picks.appendChild(btn);
    });
    pickBoat(G.boatKey);
    drawFrame($('logo'), 'FarmingCamp_LogoPixel_0', 0.5);
    $('start').onclick = function () { UI.start(); };
    $('btn-journal').onclick = function () { XD.audio.unlock(); UI.toggleJournal(); };
    $('btn-horn').onclick = function () { XD.horn(); };
    $('btn-pause').onclick = function () { UI.togglePause(); };
    $('btn-mute').onclick = function () { UI.toggleMute(); };
    $('p-resume').onclick = function () { UI.togglePause(); };
    $('p-journal').onclick = function () { UI.toggleJournal(); };
    $('p-title').onclick = function () { toTitle(); };
    $('j-close').onclick = function () { UI.toggleJournal(); };
    muteLabel();
    document.body.dataset.mode = G.mode;
  };

  function pickBoat(k) {
    G.boatKey = k;
    try { localStorage.setItem('xd.boat', k); } catch (e) { /* riêng tư: bỏ qua */ }
    Array.prototype.forEach.call(document.querySelectorAll('.boat'), function (b) { b.classList.toggle('on', b.dataset.k === k); });
  }

  UI.start = function (silent) {
    if (!silent) { XD.audio.unlock(); XD.audio.play('notify'); }
    G.mode = 'play';
    G.caught = 0; G.points = 0; G.dist = 0;
    G.popups = [];
    document.body.dataset.mode = 'play';
    var b = XD.bandAt(XD.debug.boatWX());
    G.lastBiome = b.t > 0.5 ? b.b : b.a;
    UI.toast(XD.BIOMES[G.lastBiome].name);
  };
  function toTitle() {
    G.mode = 'title';
    document.body.dataset.mode = 'title';
    $('journal').hidden = true;
  }
  UI.togglePause = function () {
    if (G.mode === 'title') return;
    G.mode = G.mode === 'pause' ? 'play' : 'pause';
    document.body.dataset.mode = G.mode;
    if (G.mode === 'play') $('journal').hidden = true;
    XD.audio.play('click');
  };
  UI.toggleMute = function () {
    XD.audio.unlock();
    XD.audio.setMuted(!XD.audio.muted);
    muteLabel();
  };
  function muteLabel() {
    $('btn-mute').classList.toggle('off', XD.audio.muted);
    $('btn-mute').setAttribute('aria-label', XD.audio.muted ? 'Bật tiếng' : 'Tắt tiếng');
  }
  UI.toggleJournal = function () {
    var j = $('journal');
    if (j.hidden) { renderJournal(); j.hidden = false; if (G.mode === 'play') { G.mode = 'pause'; document.body.dataset.mode = 'pause'; } }
    else j.hidden = true;
  };

  function renderJournal() {
    var grid = $('j-grid'), have = 0;
    grid.textContent = '';
    Object.keys(XD.FISH).forEach(function (s) {
      var F = XD.FISH[s], rec = G.journal[s], card = document.createElement('div');
      card.className = 'fish' + (rec ? '' : ' unknown') + (F.rare ? ' rare' : '');
      var cv = document.createElement('canvas');
      drawFrame(cv, XD.animFrames(F.jump)[2], 2);
      if (!rec) {
        var c = cv.getContext('2d');
        c.globalCompositeOperation = 'source-in'; c.fillStyle = '#2a3a4a'; c.fillRect(0, 0, cv.width, cv.height);
      } else have++;
      card.appendChild(cv);
      var nm = document.createElement('b'); nm.textContent = rec ? F.name : '???'; card.appendChild(nm);
      if (rec && F.en) { var en = document.createElement('i'); en.textContent = F.en; card.appendChild(en); }
      var info = document.createElement('small');
      info.textContent = rec ? rec.n + ' con · lần đầu ' + rec.first + ' (' + rec.phase + ')' : (F.rare ? 'hiếm, hay ra về đêm' : 'chưa gặp');
      card.appendChild(info);
      grid.appendChild(card);
    });
    $('j-count').textContent = have + '/' + Object.keys(XD.FISH).length + ' loài';
  }

  UI.toast = function (text) {
    var t = $('toast');
    t.textContent = text;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    toastT = 3;
  };

  var iconDrawn = -1;
  UI.frame = function (g, day, clock) {
    set('clock', clock);
    set('phase', day.name + (g.wx.state !== 'clear' ? ' · ' + XD.WEATHER[g.wx.state].name : ''));
    if (iconDrawn !== day.icon) { iconDrawn = day.icon; drawFrame($('phase-icon'), 'DayPhase_icons_' + day.icon, 1); }
    set('fish', String(g.caught));
    set('points', g.points + ' điểm');
    set('dist', (g.dist / 32 / 1000).toFixed(2) + ' km');
  };
})(window.XD = window.XD || {});
