// Gục ngã và tổng kết cuối ván ở Chế độ Ải, dựng từ UI gốc 8.6 (SK_UI, tools/ui/build_ui.py):
//  1. hộp hồi sinh common.ab › window_reborn.prefab (UIWindowReborn): nút Ngọc "200" và nút thoát;
//  2. bảng tổng kết statements.ab › Statements.unity (UIStatement): trang 1 thước tiến độ (mode1, lv1..lv15, nhân vật ở
//     ải đang đứng), trang 2 thời gian / vàng / số quái; nút ▶ (btn_ok) về sảnh.
// Thắng (qua hết ải) dùng cùng bảng, tiêu đề I_victory. Chế độ khác vẫn dùng lớp phủ #sk-over / #sk-win của game.js.
// Nhãn: [ĐO] đọc từ dữ liệu gốc, [SUY] suy luận chưa kiểm trên mã gốc, [ƯỚC LƯỢNG] số tự đặt.
(function () {
  'use strict';
  const SK = window.SK, U = window.SK_UI;
  if (!U || !U.prefabs.statement || !U.prefabs.reborn) return;

  const REVIVE_GEM = 200;   // [ĐO] window_reborn › btn_gem/Text = "200"
  const REVIVES = 1;        // [SUY] UIWindowReborn.AlreadyRebornTrigger: mỗi ván hồi sinh bằng Ngọc một lần
  const FADE = 0.25;        // [ĐO] AnimatorController sample_window và ui_horizontal_switch: chuyển trạng thái 0,25 s
  const PAGE = 1280;        // [ĐO] clip ui_horizontal_switch2 đặt info.x = -1280
  const COUNTER = 5;        // [ĐO] btn_ok/counter/Text = "5s" (TimeCounter)
  const HIDE_Y = 1500;      // [ĐO] clip hide_window đặt window_reborn.y = 1500, show_window đặt 0
  const MOVE = [0.3, 1.3];  // [ƯỚC LƯỢNG] nhân vật chạy trên thước và số đá đếm lên trong khoảng này (giây)
  const COUNT = 1;          // [ƯỚC LƯỢNG] trang 2 đếm số đá trong 1 s
  const INPUT_DELAY = 0.4;  // [ƯỚC LƯỢNG] bỏ phím/chạm ngay sau khi hiện để khỏi bấm nhầm
  const INVUL = 2.5;        // [ƯỚC LƯỢNG] miễn sát thương sau hồi sinh, cùng số với nhân tố Hồi Sinh Thức Tỉnh (factors2.js)

  const GEM_BTN = 'window_reborn/img_bg/btn_bg/btn_gem', CLOSE_BTN = 'window_reborn/img_bg/btn_bg/btn_close';
  const OK_BTN = 'mask_down/btn_ok';
  // Nút thuộc chế độ khác (Thần Điện, Khu Thí Luyện, đá phép, mùa...) hoặc mã gốc bật lúc chạy theo dữ liệu web không có.
  const ST_HIDE = ['info/detial/scrollview', 'info/detial/stone_base', 'info/detial/tombstone', 'info/detial/stone_base_old',
    'info/map/cartons', 'info/map/boss1', 'info/map/boss2', 'info/map/boss3'];

  // hold: móc kiểm thử, dừng đồng hồ của bảng tổng kết (đếm ngược, số đếm lên) trong lúc bộ kiểm chụp ảnh.
  // autoT: thời điểm (go.t) trang 1 tự sang trang 2 khi đếm ngược về 0.
  const go = SK.gameover = { active: false, phase: null, t: 0, page: 0, hold: false, autoT: null };
  let R = null, S = null, run = null, res = null;

  go.handles = G => G.mode === 'level' && !!(SK.ugui && SK.ugui.ok);

  // ---------------------------------------------------------------- thời gian ván (bỏ lúc tạm dừng)
  let runT0 = 0, pauseT0 = -1, paused = 0;
  SK.on('runStart', G => { runT0 = G.t; paused = 0; pauseT0 = -1; go.active = false; go.phase = null; G.goRevived = 0; });
  SK.on('pause', on => { const t = SK.G.t; if (on) pauseT0 = t; else if (pauseT0 >= 0) { paused += t - pauseT0; pauseT0 = -1; } });
  const runTime = G => Math.max(0, G.t - runT0 - paused);
  const hms = s => [s / 3600, (s / 60) % 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');

  // ---------------------------------------------------------------- hộp hồi sinh
  function buildReborn(G) {
    R = SK.ugui.inst('reborn', { wrap: true });
    // ContentSizeFitter + HorizontalLayoutGroup: rộng của hàng nút và khung theo nút con (388 rồi 420).
    for (const p of ['window_reborn/img_bg/btn_bg', 'window_reborn/img_bg']) {
      const n = R.q(p), ext = SK.ugui.layoutExtent(n);
      if (n.fit[0] === 2) n.sz[0] = ext[0];
      if (n.fit[1] === 2) n.sz[1] = ext[1];
    }
    R.q(GEM_BTN + '/Text').txt.s = String(REVIVE_GEM);
    R.q('window_reborn').p[1] = HIDE_Y;
    canRevive(G);
  }
  function canRevive(G) {
    const ok = (G.goRevived || 0) < REVIVES && SK.profile && SK.profile.gems >= REVIVE_GEM;
    if (R) R.q(GEM_BTN).gray = !ok;
    return ok;
  }

  // Bảng tổng kết dựng sẵn ngay khi gục để mượn ô đá quý góc phải trên (text_gems) cho hộp hồi sinh.
  function gemCorner() {
    const C = SK.ugui.inst('statement');
    for (const n of C.root.k) if (n.n !== 'text_gems') n.off = 1;
    return C;
  }

  go.dead = function (G) {
    go.active = true; go.phase = 'reborn'; go.t = 0;
    buildReborn(G);
    S = gemCorner();
    S.q('text_gems/Text').txt.s = String(SK.profile ? SK.profile.gems : 0);
  };

  function revive(G) {
    if (!canRevive(G) || !SK.profile.spend(REVIVE_GEM)) return false;
    const p = G.player;
    G.goRevived = (G.goRevived || 0) + 1;
    // [THẤY https://youtu.be/N9FR-oALmvQ?t=725] dậy tại chỗ, đầy máu/giáp/năng lượng; trùm giữ nguyên máu.
    p.st = 'alive'; p.stT = 0; p.hp = p.hpMax; p.armor = p.armorMax; p.energy = p.energyMax; p.invulT = INVUL; p._fxHp = p.hp;
    G.state = 'stage';
    go.phase = 'reborn_out'; go.t = 0;
    SK.emit('playerRevive', G);
    return true;
  }
  function giveUp(G) { go.statement(G); }

  // ---------------------------------------------------------------- bảng tổng kết
  const lvPath = k => 'info/map/mode1/Image' + (k <= 4 ? 1 : k <= 9 ? 2 : k <= 14 ? 3 : 4) + '/lv' + k;

  // HorizontalLayoutGroup childForceExpandWidth (ugui.js chưa chia phần dư): mỗi con một ô rộng bằng nhau, con nằm
  // ở mép trái ô (ChildAlignment MiddleLeft) — cùng cách Unity đã xếp sẵn mode3 trong scene (lv1 x = 70,125...).
  function expandRow(n) {
    const L = n.lay;
    delete n.lay;
    if (!L || n.sz[0] <= 0) return;   // Image4 rộng 0: lv15 giữ vị trí lưu trong scene (đầu thước, x = 88)
    const kids = (n.k || []).filter(c => !c.off);
    const pref = kids.reduce((s, c) => s + c.sz[0], 0) + L.sp * Math.max(0, kids.length - 1);
    const extra = kids.length ? Math.max(0, n.sz[0] - L.pad[0] - L.pad[1] - pref) / kids.length : 0;
    let x = L.pad[0];
    for (const c of kids) {
      c.a = [0, 1, 0, 1]; c.pv = [0.5, 0.5]; c.p = [x + c.sz[0] / 2, -n.sz[1] / 2];
      x += c.sz[0] + extra + L.sp;
    }
  }

  function heroDraw(p) {
    return (ctx, Rr) => {
      const name = SK.animFrame(p.anims.idle, 0), f = name && SK.frame(name);
      if (!f) return;
      const sc = Math.min(Rr.w / f[3], Rr.h / f[4]);
      SK.draw(ctx, name, Rr.x + Rr.w / 2 - (f[3] / 2 - f[5]) * sc, Rr.y + Rr.h - (f[4] - f[6]) * sc, { sx: sc, sy: sc });
    };
  }

  go.statement = function (G) {
    const before = SK.profile ? SK.profile.gems : 0;
    res = SK.endRun ? SK.endRun() : { won: G.state === 'victory', stage: G.stage.label, kills: G.kills, gold: G.player.gold };
    const p = G.player;
    run = {
      won: !!res.won, stage: res.stage, kills: res.kills | 0, gold: res.gold | 0, time: runTime(G),
      gems: res.gems | 0, gemsStage: res.gemsStage == null ? res.gems | 0 : res.gemsStage | 0, before,
      idx: Math.min(15, res.won ? SK.STAGES.length : G.stageIdx + 1)
    };
    S = SK.ugui.inst('statement');
    for (const q of ST_HIDE) { const n = S.q(q); if (n) n.off = 1; }
    for (let g = 1; g <= 4; g++) expandRow(S.q('info/map/mode1/Image' + g));
    // Đầu lâu trùm trên vạch x-5 [THẤY https://youtu.be/jFHCVBZEYDU?t=422]: mode1 không có nút này, mượn boss_icon
    // (ui5_27) của thước mode2 cùng scene [SUY]. Vạch cuối (lv15) đã có biểu tượng đá phép img03.
    const skull = S.q('info/map/mode2/Image1/lv1/boss_icon');
    for (const k of [5, 10]) { const lv = S.q(lvPath(k)), c = SK.ugui.clone(skull); delete c.off; lv.k = (lv.k || []).concat(c); }
    S.reindex();
    // Trang 2 (detial) nằm ngay dưới thước trong scene; đẩy sang phải một trang để clip trượt info.x = -1280 đưa nó về
    // đúng chỗ đó [SUY: bản 8.6 có thể hiện cả hai trên một trang, xem tools/ui/README.md].
    S.q('info/detial').p[0] += PAGE;
    // Tiêu đề dùng chữ tiếng Anh của term: font m04 của text_name chỉ có ASCII, chữ Việt rơi sang font dự phòng và đè
    // lên ô đá quý [THẤY "GAME OVER" ở https://youtu.be/jFHCVBZEYDU?t=422].
    S.q('mask_up/text_name').txt.s = (run.won ? U.termsEn.I_victory : U.termsEn.I_gameover).toUpperCase();
    // Nhân vật trên thước: hiệp sĩ mặc định dùng đúng sprite lưu trong scene (c01_5), nhân vật khác vẽ khung đứng đầu.
    const img = S.q('info/map/player/image');
    if (!(p.hero === 'knight' && !(SK.profile && SK.profile.skinOf && SK.profile.skinOf('knight')))) img.draw = heroDraw(p);
    S.q('info/map/player/Text').txt.s = run.stage;
    // Toạ độ (đơn vị canvas, so với tâm map) của vạch nhà và vạch ải đang đứng, đo bằng rectOf ở khung chuẩn 1280x720.
    const map = S.q('info/map'), cx = path => { const r = S.rectOf(path, 1280, 720); return r.x + r.w / 2 - 640 - map.p[0]; };
    run.x0 = cx('info/map/mode1/Image1/home');
    run.x1 = cx(lvPath(Math.max(1, run.idx)));
    S.q('info/map/player').p[0] = run.x0;
    S.q('info/detial/time/Text').txt.s = hms(run.time);
    S.q('info/detial/coin/Text').txt.s = String(run.gold);
    S.q('info/detial/kill/Text').txt.s = String(run.kills);
    S.q(OK_BTN + '/normal').off = 1; S.q(OK_BTN + '/counter').off = 0;
    go.active = true; go.phase = 'statement'; go.page = 0; go.t = 0; go.pageT = 0; go.autoT = null;
    flush();
  };

  function flush() {
    const t = go.t, k = Math.max(0, Math.min(1, (t - MOVE[0]) / (MOVE[1] - MOVE[0])));
    if (go.page === 0) {
      S.q('info/map/player').p[0] = run.x0 + (run.x1 - run.x0) * k;
      const g = Math.round(run.gemsStage * k);
      S.q('gem/Text').txt.s = '+' + g;
      S.q('text_gems/Text').txt.s = String(run.before + g);
      S.q(OK_BTN + '/counter/Text').txt.s = Math.max(0, Math.ceil(COUNTER - t)) + 's';
    } else {
      const pt = go.pageT, s = Math.min(1, pt / FADE), c = Math.min(1, Math.max(0, pt - FADE) / COUNT);
      S.q('info/map/player').p[0] = run.x1;
      S.q('info').p[0] = -PAGE * s;
      const g = Math.round(run.gemsStage + (run.gems - run.gemsStage) * c);
      S.q('gem/Text').txt.s = '+' + g;
      S.q('text_gems/Text').txt.s = String(run.before + g);
    }
  }

  // ▶ trang 1 → trang 2; trang 2 → về sảnh. [SUY] TimeCounter hết 5 s thì tự sang trang 2 (counterCb = OnBtnClick).
  function okBtn(G) {
    if (go.page === 0) {
      go.page = 1; go.pageT = 0;
      S.q(OK_BTN + '/counter').off = 1; S.q(OK_BTN + '/normal').off = 0;
    } else leave(G);
  }
  function leave() {
    go.active = false; go.phase = null; S = null; R = null;
    if (SK.QUICK || !SK.hall) SK.lobby.enter(); else SK.hall.enter('select');
  }

  // ---------------------------------------------------------------- vòng lặp (gọi từ step của game.js)
  go.step = function (G, dt) {
    if (!(go.hold && go.phase === 'statement')) go.t += dt;
    const I = SK.input, ready = go.t > INPUT_DELAY;
    if (go.phase === 'reborn') {
      R.q('window_reborn').p[1] = HIDE_Y * Math.max(0, 1 - go.t / FADE);
      canRevive(G);
      if (ready && I.hit('confirm')) { if (!revive(G)) giveUp(G); }
    } else if (go.phase === 'reborn_out') {
      R.q('window_reborn').p[1] = HIDE_Y * Math.min(1, go.t / FADE);
      if (go.t >= FADE) { go.active = false; go.phase = null; R = null; S = null; }
    } else if (go.phase === 'statement') {
      if (go.page === 1 && !go.hold) go.pageT += dt;
      if (go.page === 0 && go.t >= COUNTER) { go.autoT = go.t; okBtn(G); }
      flush();
      if (ready && I.hit('confirm')) okBtn(G);
    }
  };

  // Vẽ trên canvas HUD sau mọi thứ khác của HUD (sự kiện 'hud'; script nạp gần cuối nên vẽ sau các mô-đun khác).
  SK.on('hud', ctx => {
    if (!go.active) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (go.phase === 'reborn' || go.phase === 'reborn_out') {
      if (S) S.draw(ctx, W, H);
      if (R) R.draw(ctx, W, H);
    } else if (S) S.draw(ctx, W, H);
    ctx.restore();
  });

  function hudPoint(e) {
    const hud = SK.hudCtx.canvas, r = hud.getBoundingClientRect(), dpr = hud.width / r.width;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, W: hud.width, H: hud.height };
  }
  addEventListener('pointerdown', e => {
    if (!go.active || go.phase === 'reborn_out') return;
    const G = SK.G, q = hudPoint(e);
    const inR = (inst, path) => { const r = inst && inst.rectOf(path, q.W, q.H); return r && q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h; };
    e.stopPropagation();
    if (go.t <= INPUT_DELAY) return;
    if (go.phase === 'reborn') {
      if (inR(R, GEM_BTN)) revive(G);
      else if (inR(R, CLOSE_BTN)) giveUp(G);
    } else if (go.phase === 'statement' && inR(S, OK_BTN)) okBtn(G);
  }, true);
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && go.active && go.phase === 'reborn' && go.t > INPUT_DELAY) giveUp(SK.G);
  });

  // ---------------------------------------------------------------- móc kiểm thử
  // rect CSS px của một nút trong hộp hồi sinh ('window_reborn/...') hoặc bảng tổng kết.
  go.rect = path => {
    const inst = /^window_reborn/.test(path) ? R : S;
    if (!inst || !SK.hudCtx) return null;
    const hud = SK.hudCtx.canvas, b = hud.getBoundingClientRect(), dpr = hud.width / b.width;
    const r = inst.rectOf(path, hud.width, hud.height);
    return r && { x: b.left + r.x / dpr, y: b.top + r.y / dpr, w: r.w / dpr, h: r.h / dpr };
  };
  go.state = () => ({
    active: go.active, phase: go.phase, page: go.page, t: go.t,
    infoX: S && go.phase === 'statement' ? S.q('info').p[0] : null,
    gemCost: R ? R.q(GEM_BTN + '/Text').txt.s : null, gemGray: R ? !!R.q(GEM_BTN).gray : null,
    rebornY: R ? R.q('window_reborn').p[1] : null,
    title: S && go.phase === 'statement' ? S.q('mask_up/text_name').txt.s : null,
    label: S && go.phase === 'statement' ? S.q('info/map/player/Text').txt.s : null,
    gemText: S && S.q('gem/Text') ? S.q('gem/Text').txt.s : null,
    counter: S && go.phase === 'statement' ? S.q(OK_BTN + '/counter/Text').txt.s : null, autoT: go.autoT,
    total: S ? S.q('text_gems/Text').txt.s : null,
    run: run && Object.assign({}, run)
  });
})();
