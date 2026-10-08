// Ghép các tầng: màn hình (sảnh ↔ trận ↔ kết quả), vòng lặp bước cố định, cờ gỡ lỗi.
(function (VS) {
  'use strict';
  var STEP = 1 / 60, MAX_STEPS = 6;

  var S = VS.state = { mode: 'boot', save: null, m: null, viewer: null, acc: 0, endT: 0, lastT: 0 };

  function hasMeta() { return VS.lobby && typeof VS.lobby.show === 'function'; }

  function defaultLineup(save, team, rng) {
    var pick = save && save.pick || {};
    var diverIds = Object.keys(VS.DIVERS), sharkIds = Object.keys(VS.SHARKS);
    var lineup = [];
    for (var i = 0; i < VS.TUNING.match.divers; i++) {
      var human = team === 'diver' && i === 0;
      lineup.push({ team: 'diver', defId: human ? (pick.diver || 'dave') : rng.pick(diverIds), name: human ? 'Bạn' : 'Thợ lặn ' + i, ctrl: human ? 'human' : 'bot' });
    }
    for (var j = 0; j < VS.TUNING.match.sharks; j++) {
      var hs = team === 'shark' && j === 0;
      lineup.push({ team: 'shark', defId: hs ? (pick.shark || 'Blacktip_Reefshark') : rng.pick(sharkIds), name: hs ? 'Bạn' : 'Cá mập ' + (j + 1), ctrl: hs ? 'human' : 'bot' });
    }
    return lineup;
  }

  function quickCfg() {
    var seed = VS.flags.seed != null ? VS.flags.seed : (Date.now() >>> 0);
    var rng = VS.rng(seed ^ 0x9e3779b9);
    var team = VS.flags.team === 'shark' ? 'shark' : 'diver';
    var mapId = VS.flags.map || rng.pick(VS.MAPS).id;
    return { seed: seed, mapId: mapId, lineup: defaultLineup(S.save, team, rng) };
  }

  function startMatch(cfg) {
    if (!VS.sim || !VS.sim.createMatch) throw new Error('VS.sim.createMatch chưa có');
    var m = VS.sim.createMatch(cfg);
    var me = m.actors.filter(function (a) { return a.ctrl === 'human'; })[0] || m.actors[0];
    S.m = m; S.viewer = { id: me.id, team: me.team }; S.acc = 0; S.endT = 0;
    S.mode = 'loading';
    if (hasMeta() && VS.lobby.loading) VS.lobby.loading(0, m);
    var load = VS.view && VS.view.loadMatch ? VS.view.loadMatch(m, function (p) { if (hasMeta() && VS.lobby.loading) VS.lobby.loading(p, m); }) : Promise.resolve();
    return load.then(function () {
      if (S.m !== m) return;
      if (hasMeta()) VS.lobby.show('match');
      if (VS.hud && VS.hud.show) VS.hud.show(m, S.viewer);
      S.mode = 'match';
    });
  }

  function finishMatch() {
    var m = S.m, rewards = null;
    if (VS.meta && VS.meta.settle && S.save) {
      rewards = VS.meta.settle(S.save, m, S.viewer.id);
      if (VS.save && VS.save.store) VS.save.store(S.save);
    }
    if (VS.hud && VS.hud.hide) VS.hud.hide();
    S.mode = 'result';
    if (hasMeta() && VS.lobby.showResult) VS.lobby.showResult(m, rewards);
  }

  function leaveMatch() {
    if (VS.view && VS.view.unloadMatch) VS.view.unloadMatch();
    S.m = null; S.mode = 'lobby';
    if (hasMeta()) VS.lobby.show('lobby');
  }

  function drainEvents(m) {
    if (!m.events.length) return;
    if (VS.view && VS.view.onEvents) VS.view.onEvents(m, m.events, S.viewer);
    if (VS.hud && VS.hud.onEvents) VS.hud.onEvents(m, m.events, S.viewer);
    m.events.length = 0;
  }

  // Phím một bước do sim tự xoá sau mỗi bước, input.read trả mỗi lần bấm đúng một lần. Ở ?manual=1 bài kiểm lái bằng
  // VS_DEBUG.intent nên không đọc bàn phím chuột.
  function stepOnce(m) {
    var me = m.actors[S.viewer.id];
    if (!VS.flags.manual && me && me.ctrl === 'human' && VS.input && VS.input.read) me.intent = VS.input.read(m, me);
    VS.sim.step(m, STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.25, Math.max(0, (now - (S.lastT || now)) / 1000));
    S.lastT = now;
    var m = S.m;
    if (S.mode === 'match' && m) {
      if (!VS.flags.manual) {
        S.acc += dt;
        var n = 0;
        while (S.acc >= STEP && n < MAX_STEPS) { stepOnce(m); S.acc -= STEP; n++; }
        if (n === MAX_STEPS) S.acc = 0;
      }
      drainEvents(m);
      if (m.phase === 'end') {
        S.endT += dt;
        if (S.endT > 2.5) finishMatch();
      }
    }
    if (m && (S.mode === 'match' || S.mode === 'result') && VS.view && VS.view.render) VS.view.render(m, dt, S.viewer);
    if (S.mode === 'match' && m && VS.hud && VS.hud.update) VS.hud.update(m, S.viewer, dt);
  }

  function boot() {
    S.save = VS.save && VS.save.load ? VS.save.load() : null;
    if (hasMeta()) {
      VS.lobby.onStart = function (cfg) { startMatch(cfg); };
      VS.lobby.onLeave = leaveMatch;
    }
    var ready = VS.view && VS.view.init ? VS.view.init(document.getElementById('gl')) : Promise.resolve();
    return ready.then(function () {
      var bootEl = document.getElementById('boot');
      if (bootEl) bootEl.remove();
      if (VS.flags.go === 'match' || !hasMeta()) return startMatch(quickCfg());
      S.mode = 'lobby';
      VS.lobby.show('lobby');
    });
  }

  VS.main = { startMatch: startMatch, leaveMatch: leaveMatch, quickCfg: quickCfg, STEP: STEP };

  window.VS_DEBUG = {
    match: function () { return S.m; },
    step: function (n) {
      var m = S.m;
      for (var i = 0; i < (n || 1); i++) { stepOnce(m); }
      drainEvents(m);
      return m.t;
    },
    info: function () {
      var m = S.m;
      return {
        mode: S.mode, viewer: S.viewer,
        match: m && { mapId: m.mapId, phase: m.phase, t: m.t, score: m.score, tickets: m.tickets, result: m.result,
          actors: m.actors.map(function (a) { return { id: a.id, team: a.team, defId: a.defId, ctrl: a.ctrl, st: a.st, x: a.x, y: a.y, o2: a.o2, hp: a.hp }; }) }
      };
    },
    teleport: function (id, x, y) { var a = S.m.actors[id]; a.x = x; a.y = y; a.vx = 0; a.vy = 0; },
    intent: function (id, partial) { var a = S.m.actors[id]; Object.keys(partial).forEach(function (k) { a.intent[k] = partial[k]; }); }
  };

  window.addEventListener('load', function () {
    boot().then(function () { requestAnimationFrame(frame); window.__ready = true; }, function (e) {
      var bootEl = document.getElementById('boot');
      if (bootEl) bootEl.textContent = 'Lỗi khởi động: ' + e.message;
      throw e;
    });
  });
})(window.VS = window.VS || {});
