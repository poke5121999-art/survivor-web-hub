// Lần chơi đầu của Soul Knight: màn kể chuyện (Scene_Plot) rồi ải hướng dẫn (Scene_Tutorial, prefab map_Scene_toturial), qua cổng
// dịch chuyển -> màn tải -> sảnh. Dữ liệu gốc ở data/sk-tutorial.js (tools/tutorial/build_tutorial.py), hình ở art/tutorial.
// Clip đối chiếu: https://youtu.be/1EdlLjGhhEQ?t=3 (0:03-4:18).
//   SK.tutorial.start(onDone): chạy từ màn kể chuyện; xong ải thì đặt cờ hồ sơ tutorialDone rồi gọi onDone (mặc định vào sảnh).
//   SK.tutorial.auto(): có nên tự chạy lúc mở game không (hồ sơ chưa có cờ; ?tutorial=1 ép chạy; ?quick=1 không bao giờ).
// Ải hướng dẫn chạy trên máy trạng thái thường của game.js (G.state 'stage', G.mode 'tutorial') với bố cục phòng đặt sẵn
// (stage.layout, js/world.js); mô-đun này chỉ thêm bảng mẹo, rương, quái đặt sẵn và đoạn kết.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, T = SK.TILE, TD = window.SK_TUTORIAL;
  if (!TD || !SK.G) return;
  const G = SK.G;
  const Q = location.search;
  const FORCE = /[?&]tutorial=1\b/.test(Q);
  // Trình duyệt tự động (bộ kiểm cũ mở thẳng vào sảnh) không tự chạy; ?tutorial=auto bật lại luật lần-đầu cho bộ kiểm này.
  const AUTO_OK = !navigator.webdriver || /[?&]tutorial=auto\b/.test(Q);
  const FLAG = 'tutorialDone';
  const tut = { on: false, phase: null, onDone: null, deaths: 0 };

  // ---------------------------------------------------------------- màn kể chuyện: Canvas của Scene_Plot (UIPlot)
  // [ĐO sk_method UIPlot.*]: Start: chữ I_plot1 + ảnh juqing01, Invoke(Tap1, 3 s). Tap1: ShowMubu = true, Invoke(DoTap1, 0,5 s).
  // DoTap1: ảnh img_list[0] = juqing02, chữ I_plot2, ShowMubu = false, Invoke(Tap2, 3 s). Tap2: như Tap1 rồi DoTap2: tắt Image,
  // chữ I_plot3, ShowMubu = false, Invoke(Tap3, 3 s). Tap3: nạp Scene_Tutorial. btn_plot phủ cả Canvas: chạm = BtnSkipClick,
  // bỏ hẹn giờ và làm ngay bước kế (DoTap1 / DoTap2 / Tap3) [SUY thứ tự theo index; nhánh trong BtnSkipClick].
  // Màn đen (mubu) mờ theo thời lượng chuyển trạng thái 0,5 s của plot_anim [ĐO controller]; trạng thái đầu là plot_show_mubu
  // nên mở màn từ đen mờ dần ra.
  const WAIT = 3, MUBU_DELAY = 0.5;
  const MUBU_DUR = ((TD.plot.mubu.plot_show_mubu || [])[0] || [])[2] || 0.5;
  const imgs = TD.plot.imgs.map(o => { const im = new Image(); im.src = o.src; return im; });
  const plot = { ui: null, step: 0, t: 0, due: 0, next: null, mubu: 1, mubuTo: 0, pic: 0 };

  function plotUi() {
    if (plot.ui || !SK.ugui || !SK.ugui.ok || !window.SK_UI) return plot.ui;
    window.SK_UI.prefabs._tut_plot = TD.plot.tree;
    const ui = plot.ui = SK.ugui.inst('_tut_plot');
    ui.q('Image').draw = (ctx, R) => {
      const im = imgs[plot.pic];
      if (plot.pic < 0 || !im || !im.complete || !im.naturalWidth) return;
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(im, R.x, R.y, R.w, R.h); ctx.restore();
    };
    ui.q('btn_plot/text').txt.s = TD.plot.skip;
    return ui;
  }
  function plotSet(i) {
    plot.step = i;
    plot.pic = i < 2 ? i : -1;
    const ui = plotUi();
    if (ui) ui.q('Text').txt.s = TD.plot.texts[i];
  }
  // Hẹn một việc sau s giây (Invoke); chạm màn thì CancelInvoke.
  const later = (s, fn) => { plot.due = plot.t + s; plot.next = fn; };
  function tap() {   // Tap1 / Tap2
    plot.mubuTo = 1;
    later(MUBU_DELAY, () => { plotSet(plot.step + 1); plot.mubuTo = 0; later(WAIT, plot.step < 2 ? tap : endPlot); });
  }
  function skipClick() {   // BtnSkipClick
    plot.next = null; plot.mubuTo = 0;
    if (plot.step < 2) { plotSet(plot.step + 1); later(WAIT, plot.step < 2 ? tap : endPlot); } else endPlot();
  }
  function endPlot() { plot.next = null; startLevel(); }

  function plotStep(dt) {
    plot.t += dt;
    const k = dt / MUBU_DUR;
    plot.mubu = plot.mubuTo > plot.mubu ? Math.min(plot.mubuTo, plot.mubu + k) : Math.max(plot.mubuTo, plot.mubu - k);
    const I = SK.input;
    if (I.hit('confirm') || I.hit('attack') || I.hit('skill') || I.hit('interact')) { skipClick(); return; }
    if (plot.next && plot.t >= plot.due) { const f = plot.next; plot.next = null; f(); }
  }
  function plotRender(ctx) {
    const v = SK.view;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, v.w, v.h);
    const h = SK.hudCtx, W = h.canvas.width, H = h.canvas.height;
    h.setTransform(1, 0, 0, 1, 0, 0);
    h.fillStyle = '#000'; h.fillRect(0, 0, W, H);
    const ui = plotUi();
    if (!ui) return;
    ui.q('mubu').img.c = [0, 0, 0, plot.mubu];
    ui.draw(h, W, H);
  }
  SK.MODES = SK.MODES || {};
  SK.MODES.tut_plot = { step: plotStep, render: plotRender };

  // ---------------------------------------------------------------- ải hướng dẫn: bố cục phòng
  // Phòng Unity (room_x, room_y hướng lên) -> ô lưới web (gy hướng xuống). Vật cản wall_group thành mẫu phòng: RGObjectSkin.obj_index
  // là chỉ số trong obstacle_list của theme [SUY: 0 = khối tường xám, 1 = thùng gỗ, 2 = thùng đỏ khớp clip ?t=106: hai hàng khối X,
  // thùng gỗ ở bốn góc, vết nổ giữa phòng], vật mang tên thật (obj11_05) giữ tên.
  function layout() {
    const R = TD.map.rooms, th = D.themes[TD.theme] || {};
    const x0 = Math.min(...R.map(r => r.gx)), y1 = Math.max(...R.map(r => r.gy));
    return R.map(r => ({
      type: r.type, cell: [r.gx - x0, y1 - r.gy], w: r.w, h: r.h, id: 'tut_' + r.key, src: r,
      pattern: { w: r.w, h: r.h, ep: [], it: r.obs.map(o => {
        const name = o.name || ((th.obstacles || [])[o.skin] || {}).name;
        return ['=' + name, o.at[0] + (r.w >> 1), o.at[1] + (r.h - 1 - (r.h >> 1))];
      }).filter(e => e[0] !== '=undefined') }
    }));
  }
  tut.stage = () => ({ theme: TD.theme, level: 1, n: 1, label: TD.label, mini: '', boss: false, br: false, tutorial: true,
    layout: layout(), spacing: TD.map.spacing });

  // Toạ độ Unity so với tâm phòng (đv, y lên) -> px thế giới web; chân vật ở đáy ô như vật cản của js/world.js.
  const wx = (r, a) => (r.cx + a[0]) * T + 8;
  const wy = (r, a) => (r.cy - a[1] + 1) * T;

  // Bảng mẹo (signs_tip + ObjectTip): đứng trong vùng trigger talk (offset 0,1.5; cỡ 4 × 4,5 đv) thì hiện mẹo trắng trên bảng,
  // có mũi tên trỏ xuống [THẤY https://youtu.be/1EdlLjGhhEQ?t=60].
  function addSign(r, s) {
    const x = wx(r, s.at), y = wy(r, s.at), [ox, oy, w, h] = s.trig;
    const box = [x + (ox - w / 2) * T, y - (oy + h / 2) * T, x + (ox + w / 2) * T, y - (oy - h / 2) * T];
    G.props.push({ x, y, tutSign: s, box, draw(ctx) { SK.drawPrefab(ctx, SK.prefab('signs_tip'), x, y, { t: G.t }); } });
  }
  // Rương chest00 (RGChestAppoint): mở ra thì rơi đúng vật trong object_list (vũ khí cố định / bình năng lượng).
  // Hình động chest/chest_open chỉ là Transform (nắp box03/box04 tách sang hai bên, box05 nhô lên); t = 0 là tư thế đóng.
  function addChest(r, c) {
    const x = wx(r, c.at), y = wy(r, c.at), pf = SK.prefab('chest00');
    const st = { x, y, open: false, t: 0, items: c.items };
    G.props.push({ x, y, tutChest: st, update(G2, pr, dt) { if (st.open) st.t += dt; },
      draw(ctx) { if (!SK.drawPrefab(ctx, pf, x, y, { t: st.t, state: 'chest_open' })) { ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x - 7, y - 12, 14, 12); } } });
    G.interactables.push({ x, y, r: 22, labelY: 22, label: 'Mở rương', tutChest: st, use(G2, o) { openChest(st); o.gone = true; } });
  }
  function openChest(st) {
    if (st.open) return;
    st.open = true; st.t = 0;
    for (const it of st.items) {
      if (!it) continue;
      if (it === 'energy_pot') { G.pickups.push({ kind: 'en_pot', x: st.x, y: st.y + 14, vx: 0, vy: 0, t: 1, z: 0, vz: 0 }); continue; }
      const id = SK.DS.weaponId ? SK.DS.weaponId(it) : it;
      if (SK.DS.weapons[id]) G.items.push({ id, x: st.x, y: st.y + 14, t: 0 });
      else SK.warnOnce('tutw' + it, 'tutorial chest weapon missing: ' + it);
    }
  }

  // Quái đặt sẵn trong enemy_group: phòng khoá thì sinh đúng loại, đúng chỗ (một đợt), thay cho đợt ngẫu nhiên theo điểm.
  const baseWaves = G.buildWaves, baseSpawn = G.spawnWave, baseCleared = G.onRoomCleared;
  G.buildWaves = function (r) { return r.tut ? [r.tut.enemies.map(e => e.id)] : baseWaves.apply(this, arguments); };
  G.spawnWave = function (r, ids) {
    if (!r.tut) return baseSpawn.apply(this, arguments);
    for (const e of r.tut.enemies) if (D.enemies[e.id]) G.enemies.push(SK.makeEnemy(G, e.id, wx(r, e.at), (r.cy - e.at[1]) * T + 12, r));
  };
  // Ải hướng dẫn không bốc rương thưởng khi dọn phòng (clip ?t=212 chỉ có CLEAR và năng lượng).
  G.onRoomCleared = function (r) { if (G.mode !== 'tutorial') return baseCleared.apply(this, arguments); };
  // Đồ đặt sẵn theo loại phòng (rương vũ khí ngẫu nhiên, bình...) không áp cho ải hướng dẫn; phòng cuối vẫn có cổng.
  for (const k of Object.keys(SK.ROOM_FILL)) {
    if (k === 'end') continue;
    const f = SK.ROOM_FILL[k];
    SK.ROOM_FILL[k] = function (G2) { if (G2.mode !== 'tutorial') return f.apply(this, arguments); };
  }

  SK.on('stageEnter', G2 => {
    if (G2.mode !== 'tutorial') return;
    const lay = G2.stage.layout;
    G2.map.rooms.forEach((r, i) => {
      const src = lay[i] && lay[i].src;
      if (!src) return;
      for (const s of src.signs) addSign(r, s);
      for (const c of src.chests) addChest(r, c);
      if (src.enemies.length) r.tut = { enemies: src.enemies };
    });
    G2.props.push({ x: 0, y: -1e9, tutCtl: true, update: control, draw() {} });
  });

  // ---------------------------------------------------------------- điều khiển: cổng, chết
  // Qua cổng: màn tải (js/loading.js) giữ ~2,5 s rồi vào sảnh [THẤY ?t=255-258]; G.hold chặn game.js tuyên bố thắng.
  const LOAD_HOLD = 2.5, DEAD_WAIT = 1.2;
  // Đổi màn (vào sảnh / chơi lại) làm sau bước hiện tại: game.js còn đọc G.map sau khi cập nhật G.props.
  const defer = fn => { tut.busy = true; setTimeout(() => { tut.busy = false; fn(); }, 0); };
  function control(G2, pr, dt) {
    if (G2.mode !== 'tutorial' || tut.busy || tut.phase !== 'level') return;
    if (G2.phase === 'portal') {
      G2.hold = true;
      tut.portalT = (tut.portalT || 0) + dt;
      if (tut.portalT > LOAD_HOLD) defer(finish);
    }
    // Chết trong ải hướng dẫn: bỏ màn thua, chơi lại ải từ phòng đầu [SUY: chưa đọc được mã gốc].
    if (G2.state === 'dead') {
      tut.deadT = (tut.deadT || 0) + dt;
      if (tut.deadT > DEAD_WAIT) defer(() => { tut.deaths++; SK.setOverlay(null); startLevel(); });
    }
  }
  SK.on('hud', (ctx, G2) => {
    if (G2.mode !== 'tutorial' || G2.state !== 'stage' || !G2.player) return;
    const p = G2.player, cam = G2.view || G2.cam;
    tut.near = null;
    for (const pr of G2.props) {
      const b = pr.box;
      if (!pr.tutSign || p.x < b[0] || p.x > b[2] || p.y < b[1] || p.y > b[3]) continue;
      tut.near = pr.tutSign.tip;
      const x = pr.x - cam.x, top = pr.y - cam.y - 34;
      SK.text(ctx, '▼', x, top + 8, 8, '#ffffff', 'center', 'rgba(0,0,0,0.9)');
      const lines = wrap(ctx, pr.tutSign.text, 200, 10);
      lines.forEach((l, i) => SK.text(ctx, l, x, top - (lines.length - i) * 11, 10, '#ffffff', 'center', 'rgba(0,0,0,0.9)'));
    }
  });
  function wrap(ctx, s, maxW, size) {
    ctx.font = size + 'px ' + SK.FONT;
    const out = [];
    let cur = '';
    for (const w of String(s).split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  }

  // ---------------------------------------------------------------- vào / ra
  function startLevel() {
    tut.phase = 'level'; tut.portalT = 0; tut.deadT = 0;
    G.badass = false;
    SK.startRun('knight', 'tutorial', []);
  }
  function finish() {
    if (tut.phase === 'done') return;
    tut.phase = 'done'; tut.on = false;
    G.hold = false;
    SK.profile.setFlag(FLAG);
    if (SK.loading) SK.loading.on = false;
    SK.emit('tutorialDone', G);
    const cb = tut.onDone; tut.onDone = null;
    (cb || defaultDone)();
  }
  function defaultDone() { if (SK.hall) SK.hall.enter('select'); else SK.lobby.enter(); }

  tut.start = function (onDone) {
    tut.on = true; tut.phase = 'plot'; tut.onDone = onDone || null; tut.deaths = 0; tut.busy = false;
    Object.assign(plot, { step: 0, t: 0, next: null, mubu: 1, mubuTo: 0 });
    plotSet(0);
    later(WAIT, tap);
    G.player = null; G.map = null; G.mode = null;
    SK.setOverlay(null);
    G.state = 'tut_plot';
    return true;
  };
  tut.auto = () => FORCE || (!SK.QUICK && AUTO_OK && !SK.profile.flag(FLAG));
  tut.done = () => SK.profile.flag(FLAG);
  // Móc kiểm thử: trạng thái, vị trí bảng/rương/phòng (px thế giới), bỏ qua màn kể chuyện.
  Object.defineProperty(tut, 'state', { get() {
    return { on: tut.on, phase: tut.phase, plotStep: plot.step, plotText: TD.plot.texts[plot.step], mubu: +plot.mubu.toFixed(2), near: tut.near || null,
      deaths: tut.deaths, done: tut.done() };
  } });
  tut.signs = () => G.props.filter(p => p.tutSign).map(p => ({ tip: p.tutSign.tip, text: p.tutSign.text, x: p.x, y: p.y, box: p.box.slice() }));
  tut.chests = () => G.props.filter(p => p.tutChest).map(p => ({ x: p.x, y: p.y, open: p.tutChest.open, items: p.tutChest.items.slice() }));
  tut.skipPlot = () => { if (tut.phase === 'plot') endPlot(); };
  SK.tutorial = tut;
  if (window.SK_GAME && window.SK_GAME.debug) window.SK_GAME.debug.tutorial = onDone => tut.start(onDone);
})();
