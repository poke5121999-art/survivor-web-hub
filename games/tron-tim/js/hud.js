// HUD trong trận từ prefab `hud` của game gốc + màn kết trận từ prefab `PlayerCanvas` (WinPanel/LosePanel -> ResultWin/ResultLose).
// Mọi con số/chữ nối với trạng thái trận ở một chỗ: TT.hud.update. Nút cảm ứng/chuột trả về tên hành động cho SK.bindPointer.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, U = window.SK_UI, ug = SK.ugui, UI = TT.ui, S = TT.save;
  const H = TT.hud = { active: false, endStage: 0 };
  let L = null, pc = null, turn = null, root = null, rows = [], tpl = {}, joyT = 0;
  let lvNodes = null, lvAnim = null, zoneShow = 0, escapeShow = 0, endAt = 0, result = null, rewardInfo = null, exitOpen = false;

  const mmss = s => { s = Math.ceil(s - 1e-9); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const q = p => L.q(p), T = p => L.q('TurnOn/' + p), set = (n, s) => UI.setText(n, s);
  const show = UI.show;

  function iconDraw(getName) {
    return (ctx, R) => {
      const name = getName(); if (!name) return;
      if (U.frames[name]) { ug.drawFrame(ctx, name, R); return; }
      const f = SK.frame(name); if (!f) return;
      const k = Math.min(R.w / f[3], R.h / f[4]);
      ctx.save(); UI.setSmooth(ctx, false); ctx.translate(R.x + R.w / 2, R.y + R.h / 2); ctx.scale(k, k);
      SK.draw(ctx, name, f[5] - f[3] / 2, f[6] - f[4] / 2); ctx.restore();
    };
  }

  // ---------------------------------------------------------------- dựng
  function build() {
    L = new UI.Layer('hud'); root = L.root;
    turn = UI.child(root, 'TurnOn'); delete turn.off;
    for (const n of ['Door', 'ItemSeekAppear', 'TimeCage', 'RandomRole', 'TimeStormEye', 'CameraRotate', 'ButtonDead', 'ViewBtn', 'NotAllowVoice', 'SeekNear', 'ZoneWarning', '10sOpenDoor', 'EndGame']) T(n).off = 1;
    UI.child(root, 'PingBackGround').off = 1;
    { const im = UI.child(root, 'IntroMap'); root.k.splice(root.k.indexOf(im), 1); root.k.unshift(im); }   // tranh giới thiệu nằm dưới chữ vai/Home như bản gốc
    // giọng nói / chat: game solo không có, hiện mờ như bản gốc khi tắt
    for (const n of ['ListenBtn', 'SpeakBtn', 'ButtonMessage']) { const x = T(n); x.gray = 1; x.cg = 0.5; }
    T('NavigatorJoystickComponent').off = 1;
    for (const n of ['ItemSkill', 'ItemHelp', 'ItemDead']) tpl[n] = T(n);
    // nút kỹ năng: dựng theo ActionBtn gốc (nền common_circle_dark, vòng viền, icon, quạt hồi chiêu)
    const sk = {
      n: 'SkillBtn', off: 1, a: [1, 0.5, 1, 0.5], pv: [0.5, 0.5], p: [-340, -100], sz: [148, 155], img: { sp: 'common_circle_dark', c: [1, 1, 1, 1] }, btn: 1,
      k: [
        { n: 'icon', a: [0.5, 0.5, 0.5, 0.5], pv: [0.5, 0.5], p: [0, 4], sz: [104, 104], draw: iconDraw(() => (TT.skillState && TT.skillState(TT.M.human).icon) || null) },
        { n: 'cd', a: [0.5, 0.5, 0.5, 0.5], pv: [0.5, 0.5], p: [0, 0], sz: [148, 155], img: { sp: 'common_circle_dark', c: [0, 0, 0, 0.62], t: 3, fm: 2, fo: 2, fa: 0, cw: 1 } },
        { n: 'ring', off: 1, a: [0.5, 0.5, 0.5, 0.5], pv: [0.5, 0.5], p: [0, 0], sz: [148, 155], img: { sp: 'Circle64px Stroke18px', c: [1, 0.85, 0.2, 1] } },
        { n: 'sec', a: [0.5, 0.5, 0.5, 0.5], pv: [0.5, 0.5], p: [0, 0], sz: [140, 70], txt: { s: '', c: [1, 1, 1, 1], fs: 60, al: 4, f: 'UTM_Neutra' }, fx: [{ t: 'o', c: [0, 0, 0, 1], d: [3, 3] }] },
        { n: 'key', a: [0.5, 0, 0.5, 0], pv: [0.5, 1], p: [0, -4], sz: [148, 40], txt: { s: 'SPACE', c: [1, 1, 1, 0.9], fs: 28, al: 4, f: 'UTM_Neutra' }, fx: [{ t: 'o', c: [0, 0, 0, 1], d: [2, 2] }] },
        { n: 'num', a: [1, 1, 1, 1], pv: [1, 1], p: [-6, -6], sz: [60, 50], txt: { s: '', c: [1, 0.9, 0.3, 1], fs: 44, al: 4, f: 'UTM_Neutra' }, fx: [{ t: 'o', c: [0, 0, 0, 1], d: [2.5, 2.5] }] }
      ]
    };
    turn.k.push(sk);
    // nút tấn công cảm ứng của người tìm: biểu tượng kiếm trên ActionBtn
    const act = T('ActionBtn');
    act.k.push({ n: 'sword', a: [0.5, 0.5, 0.5, 0.5], pv: [0.5, 0.5], p: [0, 0], sz: [100, 100], img: { sp: 'lobby_play_icon_battle', c: [1, 1, 1, 1], pa: 1 } });
    L.H.reindex();

    L.bind('TurnOn/Home', () => { exitOpen = true; L.scope = 'exit'; UI.paused = true; delete T('PopupExit').off; UI.sfx('dialog_click'); });
    L.bind('TurnOn/SkillBtn', () => { /* SK.bindPointer đã đặt skill */ });
    L.bind('TurnOn/ActionBtn', () => { /* tương tự, là 'attack' */ });
    L.bind('TurnOn/PopupExit/Popup/ButtonAccept', () => { closeExit(); H.active = false; if (TT.exitToMenu) TT.exitToMenu(); }, 'exit');
    L.bind('TurnOn/PopupExit/Popup/ButtonNot', closeExit, 'exit');
    T('PopupExit').off = 1;

    pc = new UI.Layer('PlayerCanvas');
    pc.H.reindex();
  }

  function closeExit() { exitOpen = false; L.scope = 'main'; UI.paused = false; T('PopupExit').off = 1; }

  H.reset = function (m) {
    if (!L) build();
    H.active = true; H.endStage = 0; result = null; rewardInfo = null; exitOpen = false; UI.paused = false; L.scope = 'main';
    for (const r of rows) turn.k.splice(turn.k.indexOf(r.n), 1);
    rows = []; zoneShow = 0; escapeShow = 0; endAt = 0;
    T('PopupExit').off = 1;
    for (const n of ['WinPanel', 'LosePanel']) UI.find(pc.root, n).off = 1;
  };
  H.setLang = function () { if (L) { UI.applyLang(L.root); UI.applyLang(pc.root); } };
  H.ensure = function () { if (!L) build(); };

  // ---------------------------------------------------------------- bảng tin (4 s mỗi dòng, xếp chồng)
  function addRow(kind, names) {
    if (!L) return;
    const t = tpl[kind], n = ug.clone(t);
    delete n.off;
    const set2 = (name, s) => { const c = UI.child(n, name); if (c) set(c, s); };
    if (kind === 'ItemSkill') { set2('PlayerName1', names[0]); set2('PlayerName2', names[1]); }
    else if (kind === 'ItemHelp') { set2('PlayerName1', names[0]); set2('PlayerName2', names[1]); }
    else set2('PlayerName1', names[0]);
    turn.k.push(n);
    rows.push({ n, until: (TT.M ? TT.M.now : 0) + 4, base: t.p.slice() });
    if (rows.length > 5) { const r = rows.shift(); turn.k.splice(turn.k.indexOf(r.n), 1); }
  }
  const nm = id => (TT.M && TT.M.actors[id] ? TT.M.actors[id].name : '?');
  TT.onEvent('catch', e => { if (H.active) addRow('ItemSkill', [nm(e.by), nm(e.id)]); });
  TT.onEvent('revive', e => { if (H.active) addRow('ItemHelp', [nm(e.by), nm(e.id)]); });
  TT.onEvent('dead', e => { if (H.active) addRow('ItemDead', [nm(e.id)]); });
  TT.onEvent('zone', e => { if (H.active && e.step > 0 && TT.M) { zoneShow = TT.M.now + 3; set(UI.find(root, 'TurnOn/ZoneImage/ZoneChangeTitle'), 'ROUND ' + (e.step + 1)); } });
  TT.onEvent('gateOpen', () => { if (H.active && TT.M) escapeShow = TT.M.now + 3.5; });
  TT.onEvent('down', e => { if (H.active && TT.M && e.id === TT.M.human.id) UI.vibrate(120); });

  // ---------------------------------------------------------------- cập nhật theo trạng thái trận
  const SCAN_PERIOD = () => TT.MATCH.SCAN.period;
  function update(m, dt) {
    const hum = m.human, ph = m.phase, playing = ph === 'playing' || ph === 'ending';
    const early = ph === 'intro' || (ph === 'countdown' && m.phaseT < 4);

    show(UI.child(root, 'IntroMap'), early);
    show(T('HideRole'), early && hum.role === 'hide'); show(T('SeekRole'), early && hum.role === 'seek');
    const starting = ph === 'countdown' && m.phaseT >= 4, step = Math.min(3, Math.floor(m.phaseT - 4));
    show(T('StartGameUI'), starting);
    if (starting) {
      ['Text', 'Text (1)', 'Text (2)', 'Text (3)'].forEach((c, i) => show(UI.find(root, 'TurnOn/StartGameUI/' + c), i === step));
      const tn = UI.find(root, 'TurnOn/StartGameUI/' + ['Text', 'Text (1)', 'Text (2)', 'Text (3)'][step]);
      const u = (m.phaseT - 4) % 1; tn.sc = [2 + 1.2 * Math.max(0, 1 - u * 3), 2 + 1.2 * Math.max(0, 1 - u * 3)];   // đập nhẹ như Animator
    }

    // đồng hồ, hai đội, rađa
    show(T('TimeUI (1)'), playing); show(T('InfoMatchNew'), playing); show(T('scanUI'), playing && m.scan.next !== Infinity);
    const clock = TT.clockOf(m), opened = clock <= 0;
    show(T('TimeUI (1)/txtTimeTitle'), !opened); show(T('TimeUI (1)/TimeText'), !opened); show(T('TimeUI (1)/txtGateOpened'), opened);
    set(T('TimeUI (1)/TimeText'), mmss(clock));
    const hiders = m.actors.filter(a => a.role === 'hide'), seekers = m.actors.filter(a => a.role === 'seek');
    set(T('InfoMatchNew/Hide/Text'), String(hiders.filter(a => a.life === 'alive').length));
    set(T('InfoMatchNew/Seek/Text'), String(seekers.length));
    const per = m.gate.state === 'open' ? TT.MATCH.SCAN.afterGate : SCAN_PERIOD();
    T('scanUI/filler (1)').img.fa = m.scan.until > m.now ? 1 : Math.max(0, Math.min(1, 1 - (m.scan.next - m.t) / per));

    // người tìm hiện
    const seekIntro = ph === 'playing' && m.t < TT.C.SEEK_DISGUISE;
    show(T('TextSeekerAppear'), seekIntro); show(T('TimeSeekerAppear'), seekIntro);
    set(T('TimeSeekerAppear'), String(Math.ceil(TT.C.SEEK_DISGUISE - m.t)));

    // ra khỏi vùng an toàn (4.4): người trốn mất 1 máu/giây
    const out = ph === 'playing' && hum.role === 'hide' && hum.life === 'alive' && TT.outsideZone(m, hum) && !TT.hasEffect(hum, 'gateWatch', m.now);
    show(T('AlertZone'), out);
    if (out) { set(T('AlertZone/AlertTime'), String(Math.max(0, Math.ceil(hum.hp - (hum.zoneT % 1))))); T('AlertZone/ArrowAnim').off = 1; }

    // cổng chuẩn bị mở (15 s)
    const cnt = m.gate.state === 'counting';
    show(T('10sOpenDoor (1)'), cnt);
    if (cnt) {
      for (const c of T('10sOpenDoor (1)').k) if (/^\d+$/.test(c.n)) c.off = 1;
      const n10 = T('10sOpenDoor (1)/10'); delete n10.off; set(n10, String(Math.max(0, Math.ceil(m.gate.count))));
      // Animator gốc không có trong dữ liệu: mỗi giây số to mờ co lại như nhịp đếm
      const u = 1 - (m.gate.count % 1 || 1), k = 5.7 - 3.4 * u;
      n10.sc = [k, k]; n10.txt.c = [1, 1, 1, 0.75 * (1 - 0.7 * u)];
    }
    show(T('EscapeText'), m.now < escapeShow);
    if (m.now < escapeShow) set(T('EscapeText'), hum.role === 'hide' ? UI.term('ESCAPE') : UI.str('stopThem'));
    show(T('ZoneImage'), m.now < zoneShow);

    // người đang xem khi đã gục
    const v = TT.viewerOf(m);
    set(T('Debuff'), v !== hum && playing ? (UI.lang === 'vi' ? 'Đang xem: ' : 'Watching: ') + v.name : '');

    // bảng tin
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].until <= m.now) { turn.k.splice(turn.k.indexOf(rows[i].n), 1); rows.splice(i, 1); }
    rows.forEach((r, i) => { r.n.p = [r.base[0], r.base[1] - i * 112]; });

    // nút
    show(T('Home'), ph !== 'ending');
    const touch = SK.input.touchMode;
    show(T('ActionBtn'), touch && hum.role === 'seek' && ph === 'playing');
    const ss = TT.skillState ? TT.skillState(hum) : null, sb = T('SkillBtn');
    show(sb, !!(ss && ss.id) && ph === 'playing');
    if (ss && ss.id) {
      const ready = ss.ready !== false && ss.cd <= 0, cd = UI.child(sb, 'cd');
      cd.img.fa = ss.cdMax > 0 && !ss.active ? Math.max(0, Math.min(1, ss.cd / ss.cdMax)) : 0;
      show(UI.child(sb, 'ring'), !!ss.active);
      set(UI.child(sb, 'sec'), !ready && !ss.active && ss.cd > 0 ? String(Math.ceil(ss.cd)) : '');
      set(UI.child(sb, 'num'), ss.max > 1 ? String(ss.charges) : '');
      show(UI.child(sb, 'key'), !touch);
    }
    // nền trận (ending) dựng lại ở drawEnd
  }

  // ---------------------------------------------------------------- joystick (cảm ứng): vẽ nơi chạm, như NavigatorJoystickComponent
  function drawJoystick(ctx, w, h) {
    const I = SK.input, st = I.stick;
    const k = Math.sqrt((w / 1920) * (h / 1080)), size = 200 * k, d = UI.dpr || 1;
    let cx = 140 * k + size * 0.1, cy = h - 132 * k - size * 0.1, hx = cx, hy = cy, a = 0.45;
    if (st.active) {
      cx = st.ox * d; cy = st.oy * d; a = 1;
      const dx = st.x - st.ox, dy = st.y - st.oy, m = Math.hypot(dx, dy), R = st.R, f = Math.min(1, m / R);
      if (m > 0) { hx = cx + dx / m * f * R * d; hy = cy + dy / m * f * R * d; }
    }
    ctx.save(); ctx.globalAlpha = a;
    ug.drawFrame(ctx, 'CircleRing', { x: cx - size / 2, y: cy - size / 2, w: size, h: size });
    ug.drawFrame(ctx, 'NavigatorArrows', { x: hx - size / 4, y: hy - size / 4, w: size / 2, h: size / 2 });
    ctx.restore();
  }

  // ---------------------------------------------------------------- kết trận (PlayerCanvas)
  function startEnd(m) {
    const win = m.result.winner === m.human.role;
    rewardInfo = S.settle(win, m.human.role, TT.clockOf(m));
    result = win ? 'win' : 'lose'; H.endStage = 1; endAt = performance.now();
    const panel = UI.find(pc.root, win ? 'WinPanel' : 'LosePanel');
    for (const n of ['WinPanel', 'LosePanel']) UI.find(pc.root, n).off = 1;
    delete panel.off;
    const res = UI.find(panel, win ? 'ResultWin' : 'ResultLose'); res.off = 1;
    delete UI.find(panel, win ? 'Title_Popup_Won' : 'Title_Popup_Lose').off;
    if (TT.audio && TT.audio.play) UI.sfx(win ? 'fx_applause' : 'fx_fail');
    if (TT.audio && TT.audio.music) { try { TT.audio.music(null); } catch (e) { /* bỏ qua */ } }
  }
  function showResult() {
    const win = result === 'win', r = rewardInfo;
    const panel = UI.find(pc.root, win ? 'WinPanel' : 'LosePanel');
    UI.find(panel, win ? 'Title_Popup_Won' : 'Title_Popup_Lose').off = 1;
    const res = UI.find(panel, win ? 'ResultWin' : 'ResultLose'); delete res.off;
    const pn = 'ResultPanel/', E = S.ECON;
    // game gốc: ô số = phần cơ bản, ô "+ 25" = phần thưởng thắng (ResultMenu.cs:67-79)
    set(UI.find(res, pn + 'expss/expTxt'), String(E.EXP));
    set(UI.find(res, pn + 'gold/goldTxt'), String(win ? r.gold - E.GOLD_BONUS : r.gold));
    set(UI.find(res, pn + 'cup/CupTxt (1)'), String(r.cup));
    const lv = UI.find(res, pn + 'exp/LevelObject');
    lvNodes = { cur: UI.find(lv, 'LevelIncrease/LevelCurrent'), next: UI.find(lv, 'LevelIncrease/LevelNext'), fill: UI.find(lv, 'LevelIncrease/filler'), up: UI.find(lv, 'LevelUp'), reward: UI.find(lv, 'Reward') };
    lvNodes.up.off = 1; lvNodes.reward.off = 1;
    set(lvNodes.cur, String(r.level0)); set(lvNodes.next, String(r.level0 + 1));
    lvNodes.fill.img.fa = r.exp0 / S.expNeed(r.level0);
    lvAnim = { t: 0 };
    H.endStage = 2; endAt = performance.now();
    UI.sfx('fx_btn1');
  }
  // thanh cấp độ chạy từ exp cũ tới exp mới; lên cấp thì đầy rồi chạy lại từ 0 (LevelUp + Reward hiện ra)
  function animLevel(dt) {
    const r = rewardInfo, a = lvAnim, f0 = r.exp0 / S.expNeed(r.level0);
    a.t += dt;
    if (!r.levelUp) { lvNodes.fill.img.fa = f0 + (r.frac - f0) * Math.min(1, a.t / 0.9); return; }
    if (a.t < 0.9) { lvNodes.fill.img.fa = f0 + (1 - f0) * (a.t / 0.9); return; }
    if (!a.up) {
      a.up = true; UI.sfx('fx_levelup');
      set(lvNodes.cur, String(r.level1)); set(lvNodes.next, String(r.level1 + 1));
      set(lvNodes.up, String(r.level1)); set(lvNodes.reward, '+ ' + r.levelGold + ' gold'); delete lvNodes.up.off; delete lvNodes.reward.off;
    }
    lvNodes.fill.img.fa = r.frac * Math.min(1, (a.t - 0.9) / 0.6);
  }
  H.reward = () => rewardInfo;
  // dò trạng thái nút HUD cho kiểm thử: chữ và có đang hiện không (nút và mọi tổ tiên không off)
  H.text = p => { const n = L && L.q('TurnOn/' + p); return n && n.txt ? n.txt.s : null; };
  H.visible = p => { if (!L) return false; let n = root; for (const seg of ('TurnOn/' + p).split('/')) { n = UI.child(n, seg); if (!n || n.off) return false; } return true; };
  H.layer = () => L;
  H.exitOpen = () => exitOpen;

  // ---------------------------------------------------------------- vẽ
  H.draw = function (ctx, m, w, h, dt) {
    if (!L) build();
    UI.update(dt);
    ctx.clearRect(0, 0, w, h);
    if (m.phase === 'ending' && m.result && H.endStage === 0 && m.phaseT >= 2) startEnd(m);
    if (H.endStage > 0) {
      if (H.endStage === 2 && lvAnim) animLevel(dt);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      pc.draw(ctx);
      return;
    }
    update(m, dt);
    L.draw(ctx);
    if (SK.input.touchMode && (m.phase === 'playing')) drawJoystick(ctx, w, h);
  };
  TT.drawHud = (ctx, m, w, h) => H.draw(ctx, m, w, h, 1 / 60);

  // ---------------------------------------------------------------- con trỏ
  // Trả tên hành động cho SK.bindPointer ('skill' | 'attack' | 'ui') hoặc null để rơi xuống joystick/vung đánh.
  H.hitButton = function (cx, cy) {
    if (!L || !H.active) return null;
    if (H.endStage > 0 || exitOpen) return 'ui';
    const [x, y] = UI.toDev(cx, cy), b = L.hit(x, y);
    if (!b) return null;
    if (b.path === 'TurnOn/SkillBtn') return 'ui';   // kỹ năng gọi TT.skillPress() ở H.down
    if (b.path === 'TurnOn/ActionBtn') return 'attack';
    return 'ui';
  };
  H.down = function (cx, cy) {
    if (!L || !H.active) return false;
    if (H.endStage > 0) return true;
    const [x, y] = UI.toDev(cx, cy), hit = L.down(x, y);
    if (hit && L.press && L.press.path === 'TurnOn/SkillBtn' && TT.skillPress && TT.M && TT.M.phase === 'playing') TT.skillPress();
    return hit;
  };
  H.up = function (cx, cy) {
    if (!L || !H.active) return false;
    if (H.endStage > 0) {
      if (performance.now() - endAt < 450) return true;
      if (H.endStage === 1) showResult();
      else { H.active = false; H.endStage = 0; if (TT.exitToMenu) TT.exitToMenu(true); }
      return true;
    }
    const [x, y] = UI.toDev(cx, cy);
    return L.up(x, y);
  };
  H.cancel = () => L && L.cancel();
})();
