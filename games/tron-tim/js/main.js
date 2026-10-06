// Khởi động: canvas, nạp art, luồng màn hình (tải -> menu -> trận -> kết quả -> menu), vòng lặp bước cố định, móc kiểm thử window.TT.
// ?manual=1 hoặc ?play=1: vào thẳng một trận (kiểm lõi); thêm ?menu=1 để vẫn qua menu. manual=1: không tự chạy, chỉ TT.step(n).
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK;
  const q = new URLSearchParams(location.search);
  const seed = q.has('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : (Math.random() * 2147483647) >>> 0;
  const manual = q.has('manual');            // kiểm thử: không tự chạy, chỉ TT.step(n)
  const skipMenu = (q.has('play') || manual) && !q.has('menu');
  const cv = document.getElementById('cv'), hud = document.getElementById('hud'), ctx = cv.getContext('2d'), hctx = hud.getContext('2d');
  let M = null, lastFrame = performance.now(), mode = 'loading', loadT = 0, matchNo = 0;

  // người chơi dùng nhân vật đã chọn ở Thời trang (không chọn thì giữ nhân vật bốc ngẫu nhiên theo seed)
  function applyHero(m) {
    const h = TT.save.d.hero, a = m.human;
    if (a.role === 'hide' && h.hide) { a.hero = h.hide; a.disguise = h.hide; }
    else if (a.role === 'seek') { if (h.seek) a.hero = h.seek; if (h.hide) a.disguise = h.hide; }
  }

  function start(opts) {
    M = TT.createMatch(Object.assign({ seed }, opts));
    applyHero(M);
    TT.cam.snap = true;
    return M;
  }

  const stepOnce = () => { TT.applyInput(M); TT.updateMatch(M, SK.STEP); };

  // ---- luồng màn hình
  TT.startMatch = function (opts) {
    start(Object.assign({ seed: (seed + matchNo++) >>> 0 }, opts));   // ván đầu từ menu dùng đúng seed của URL, các ván sau lệch dần
    mode = 'match';
    TT.hud.reset(M);
    if (TT.audio && TT.audio.music) { try { TT.audio.music('battle'); } catch (e) { /* tiếng không được làm hỏng trận */ } }
    return M;
  };
  TT.exitToMenu = function () {
    mode = 'menu';
    TT.menu.cancel(); TT.menu.open(); TT.menu.refresh();
  };
  TT.applyQuality = () => { TT.ui.resize(); };

  // ---- con trỏ: màn nào nhận thì màn đó xử lý
  TT.uiHit = (x, y) => (mode === 'match' ? TT.hud.hitButton(x, y) : 'ui');
  TT.uiDown = (x, y) => {
    if (mode === 'match') return TT.hud.down(x, y);
    if (mode === 'menu') { const d = TT.ui.toDev(x, y); return TT.menu.down(d[0], d[1]); }
    return false;
  };
  TT.uiUp = (x, y) => {
    if (mode === 'match') return TT.hud.up(x, y);
    if (mode === 'menu') { const d = TT.ui.toDev(x, y); return TT.menu.up(d[0], d[1]); }
    return false;
  };
  TT.uiCancel = () => { if (mode === 'match') TT.hud.cancel(); else if (mode === 'menu') TT.menu.cancel(); };

  // ---- móc kiểm thử
  Object.defineProperty(TT, 'M', { get: () => M });
  Object.defineProperty(TT, 'mode', { get: () => mode });
  TT.seed = seed;
  TT.manual = manual;
  TT.step = n => { for (let i = 0; i < n; i++) stepOnce(); return M.now; };
  TT.setRole = role => start({ humanRole: role });
  TT.restart = start;
  TT.actors = () => M.actors;
  TT.swing = ang => { M.attackReq = ang; };
  TT.skipTo = (phase, maxSteps) => {
    for (let i = 0; i < (maxSteps || 200000) && M.phase !== phase && M.phase !== 'ending'; i++) stepOnce();
    return M.phase;
  };

  function render() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    if (mode === 'loading') {
      loadT += dt; TT.menu.drawLoading(hctx, dt);
      if (loadT > (skipMenu ? 0 : 1.2)) { mode = 'menu'; TT.menu.open(); TT.menu.refresh(); }
    } else if (mode === 'menu') {
      TT.menu.draw(hctx, dt);
    } else {
      TT.render(ctx, M, dt);
      TT.hud.draw(hctx, M, TT.ui.w, TT.ui.h, dt);
    }
  }

  function boot() {
    TT.ui.canvas = hud;
    const doResize = () => { SK.resize(cv, hud); TT.ui.resize(); };
    doResize();
    addEventListener('resize', doResize);
    TT.initInput(hud);
    TT.ui.lang = TT.save.d.lang;
    TT.ui.init(hud, hctx).then(() => {
      TT.menu.ensure(); TT.hud.ensure();
      return SK.loadArt();
    }).then(() => {
      if (skipMenu) { start({}); mode = 'match'; TT.hud.reset(M); }
      TT.bindRenderEvents(() => M);
      window.__ready = true;
      SK.startLoop(() => { if (mode === 'match' && !manual && !TT.ui.paused) stepOnce(); }, render);
    });
  }
  boot();
})();
