// Kết thúc Chế độ Ải thường: phòng Đá Phép ở 3-6, chuỗi ObjectMagicStone.ItemTrigger, màn trắng, thẻ "GAME COMPLETE", rồi bảng
// VICTORY (js/gameover.js). Dữ liệu: data/sk-finale.js (tools/finale/build_finale.py), thẻ: SK_UI.prefabs.certificate (+ _card).
// Nhãn: [ĐO] đọc từ dữ liệu/mã gốc 8.6, [THẤY <link>] thấy trong clip, [SUY] suy luận, [ƯỚC LƯỢNG] số tự đặt.
//
// [ĐO sk_method ObjectMagicStone.ItemTrigger] Pause người chơi, đổi nhạc (PlayBGM audio_clip = fx_magic_stone), đèn 1..4 bật ở
// 0,5 / 0,75 / 1,0 / 1,25 s (Invoke Light1Play..Light4Play), PlayFlash ở 5,0 s, RGGameProcess.StateMents ở 7,5 s.
// [ĐO PlayFlash] StopBgm + PlayEffect(flash_clip = fx_magic_stone2) + UICanvas.anim.SetTrigger("shutter"): "shutter" là trigger
// Animator của Canvas HUD chứ không phải tên tiếng; Any State → show_curtain_white (nền curtain đặt trắng), chuyển 0,5 s, trạng thái
// không có đường thoát nên trắng giữ tới khi nạp Statements.
// [ĐO prefab magic_stone_N] mỗi đèn là vòng texture_c4 có Animator magic_stone_light: cỡ 0 → 4 lần, độ mờ 1 → 0, 1 s, lặp.
// [THẤY https://youtu.be/D_stVEklXpI?t=1939] phòng cuối 3-6 sàn xanh đen, bệ + khối đỏ giữa bốn lư lửa xanh; bấm "!!" thì trắng màn.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, T = SK.TILE, W = SK.world, F = window.SK_FINALE, U = window.SK_UI;
  if (!F || !U || !U.prefabs.certificate || !U.prefabs.certificate_card) return;
  const A = window.SK_ATLAS;

  // ---------------------------------------------------------------- gói riêng (khung, anim, prefab, chủ đề)
  const PAGE = 900;   // chỉ số trang riêng trong SK.pages, tránh trang của sk-data và gói skin nạp lười (engine.js nextPage)
  for (const k in F.f) { const f = F.f[k].slice(); f[0] = PAGE; A.f[k] = f; }
  Object.assign(D.anims, F.anims);
  for (const k in F.prefabs) D.prefabs['fin_' + k] = F.prefabs[k];
  (function loadPage() {
    const im = new Image();
    im.onload = () => {
      SK.pages[PAGE] = im;
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      SK.pagesWhite[PAGE] = c;
    };
    im.src = F.pages[0] + '?v=' + F.v;
  })();
  // Sàn floor401..406 của map_GameOver, tường wall403/404 [ĐO config/map_levels map_GameOver] (khối tường tối hơn bản gốc vì
  // map.art.walls không áp màu 0,735 của prefab).
  const base = D.themes.aliens;
  if (base) {
    const th = Object.assign({}, base, { tiles: { floor: base.tiles.floor }, enemies: [], elites: {} });
    th.walls = ['wall403', 'wall404'].map(nm => {
      const ps = F.prefabs[nm], root = ps[0], top = ps.find(p => p.n === '/w2');
      return { name: nm, layers: [{ f: root.f, at: [0, 0], node: nm }, { f: top.f, at: top.at || [0, 0], node: 'w2' }], col: root.col };
    });
    delete th.tiles.wall;
    // non-enumerable: SK.tierThemes (Object.keys(D.themes)) không bốc nhầm chủ đề này cho ải thường.
    Object.defineProperty(D.themes, 'endhall', { value: th, enumerable: false, configurable: true, writable: true });
  }

  // ---------------------------------------------------------------- bảng thời gian của Đá Phép
  // t: giây từ lúc chạm Đá Phép. light: bật đèn thứ n; flash: bắt đầu màn trắng; statement: vào bảng tổng kết + thẻ.
  // snap: chụp màn chơi cho nền mờ của thẻ [SUY: UIWindowCertificate có CaptureCamera; nền thẻ trong clip mờ nhiều màu].
  const FINALE = [
    { t: 0, sfx: 'fx_magic_stone', freeze: true },                   // [ĐO] PlayBGM(audio_clip); Pause hero
    { t: 0.5, light: 1 }, { t: 0.75, light: 2 }, { t: 1.0, light: 3 }, { t: 1.25, light: 4 },
    { t: 4.9, snap: true },                                          // [ƯỚC LƯỢNG] ngay trước màn trắng
    { t: 5.0, flash: true, sfx: 'fx_magic_stone2' },                  // [ĐO] PlayFlash
    { t: 7.5, statement: true }                                       // [ĐO] StateMents
  ];
  const FLASH_FADE = 0.5;   // [ĐO controller Canvas: Any → show_curtain_white, thời lượng chuyển 0,5 s]
  const LIGHT_PERIOD = 1.0, LIGHT_SCALE = 4;   // [ĐO clip magic_stone_light]
  const STONE = 'magic_stone_5';   // khối đỏ (objects2_17) + đèn cam như clip, so ảnh cắt 7 khối; MagicStoneMaker bốc theo độ khó, bản web chưa có độ khó [SUY]
  const BRAZIERS = [[-4, 4], [-4, -4], [4, -4], [4, 4]];   // [ĐO r_end/wall_group/brazier02*] ô Unity, y lên

  // finale = {phase: 'idle' | 'running' | 'done', t, i (mục kế của FINALE), lights, flashAt, log}
  const fresh = () => ({ phase: 'idle', t: 0, i: 0, lights: 0, lightAt: [], flashAt: null, log: [] });
  const fin = () => (SK.G.finale = SK.G.finale || fresh());

  function begin(G) {
    const f = fin();
    if (f.phase !== 'idle') return;
    Object.assign(f, fresh(), { phase: 'running' });
    G.hold = true;
  }
  function apply(G, f, e) {
    f.log.push({ t: f.t, at: e.t, ev: e.light ? 'light' + e.light : e.flash ? 'flash' : e.statement ? 'statement' : e.snap ? 'snap' : 'start' });
    if (e.freeze) { const p = G.player; p.moveMul = 0; p.noFire = true; G.interactTarget = null; }
    if (e.sfx && SK.sfx) SK.sfx.play(e.sfx, { vol: 0.9, ev: 'finale' });
    if (e.light) { f.lights = e.light; f.lightAt[e.light] = e.t; }
    if (e.snap) snapshot();
    if (e.flash) f.flashAt = e.t;
    if (e.statement) {
      f.phase = 'done'; f.flashAt = null;
      G.state = 'victory';
      if (SK.gameover && SK.gameover.handles(G)) { SK.gameover.statement(G); certOpen(G); }
    }
  }
  function tick(G, dt) {
    const f = fin();
    if (f.phase !== 'running') return;
    f.t += dt;
    while (f.i < FINALE.length && FINALE[f.i].t <= f.t && f.phase === 'running') apply(G, f, FINALE[f.i++]);
  }

  // ---------------------------------------------------------------- phòng + Đá Phép + lư lửa
  const fillEnd = SK.ROOM_FILL.end;
  SK.ROOM_FILL.end = function (G, r, c) {
    if (!(G.stage && G.stage.finale)) return fillEnd.apply(this, arguments);
    G.portal = null;   // enterStage không xoá cổng của ải trước; 3-6 không có cổng
    const X = c[0], Y = c[1] + 8;   // tâm ô giữa phòng, chân bệ ở đáy ô
    // Lõi bệ chặn 3×2 ô giữa phòng [ĐO collider vòng r = 16 px tại (0, 20) của magic_stone_N].
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]]) {
      const i = W.idx(G.map, r.cx + dx, r.cy + dy);
      if (G.map.tiles[i] === W.FLOOR) G.map.tiles[i] = W.OBST;
    }
    for (const [bx, by] of BRAZIERS) {
      G.props.push({ x: X + bx * 16, y: Y - by * 16, t0: bx * 3 + by,
        draw(ctx, G2, o) { SK.drawPrefab(ctx, D.prefabs.fin_brazier02, o.x, o.y, { t: G2.t + o.t0, state: 'brazier02' }); } });
    }
    const stone = { x: X, y: Y, label: 'Đá Phép', r: 56, labelY: 56, use() { begin(G); } };
    G.interactables.push(stone);
    G.props.push({ x: X, y: Y, update: (G2, o, dt) => { tick(G2, dt); if (fin().phase !== 'idle') stone.gone = true; },
      draw(ctx, G2) { drawStone(ctx, G2, X, Y); } });
  };
  function drawStone(ctx, G, x, y) {
    const f = fin(), parts = D.prefabs['fin_' + STONE], t = G.t;
    SK.drawPrefab(ctx, parts, x, y, { t, state: 'magic_stone', skip: q => /\/line\d$/.test(q.n) });
    // khối bập bênh: clip magic_stone dời y (px, y lên) [ĐO]
    const bob = SK.animPose && D.anims['magic_stone/magic_stone'] ? SK.animPose('magic_stone/magic_stone', t, '').dy : 0;
    for (let i = 1; i <= 4; i++) {
      if (f.lights < i) continue;
      const ph = ((f.t - f.lightAt[i]) % LIGHT_PERIOD) / LIGHT_PERIOD, line = parts.find(q => q.n === '/magic_stone/line' + i);
      if (!line) continue;
      const s = LIGHT_SCALE * ph;
      if (s <= 0.01) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const c = line.c || [1, 1, 1, 1];
      SK.drawTinted(ctx, line.f, x + line.at[0], y - line.at[1] + bob, [c[0], c[1], c[2], 1 - ph], { sx: s, sy: s });
      ctx.restore();
    }
  }

  SK.on('stageEnter', G => { G.finale = fresh(); });

  // ---------------------------------------------------------------- màn trắng
  let snap = null;
  function snapshot() {
    const cv = SK.ctx && SK.ctx.canvas;
    if (!cv) return;
    snap = document.createElement('canvas'); snap.width = cv.width; snap.height = cv.height;
    snap.getContext('2d').drawImage(cv, 0, 0);
  }
  const flashAlpha = f => f && f.flashAt != null && f.phase === 'running' ? Math.min(1, Math.max(0, (f.t - f.flashAt) / FLASH_FADE)) : 0;
  SK.on('hud', (ctx, G) => {
    const f = G.finale, a = flashAlpha(f);
    if (a <= 0) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  });

  // ---------------------------------------------------------------- thẻ "GAME COMPLETE"
  let dmg = 0;
  SK.on('runStart', () => { dmg = 0; });
  SK.on('enemyHit', (G, e, d) => { dmg += Math.max(0, d | 0); });   // [ƯỚC LƯỢNG] tổng sát thương qua SK.hurtEnemy; bản gốc "Total Damage"
  const CW = 'window_certificate', CARD = CW + '/panel/NormalPassCertificate';
  const cert = { open: false, t: 0, ui: null, hideT: -1 };
  const SHOW_LEN = 0.35, HIDE_LEN = 0.25;   // [ƯỚC LƯỢNG] clip window_certificate_show / hide; đọc lại độ dài thật bên dưới
  const two = n => String(n).padStart(2, '0');
  const hms = s => [s / 3600, (s / 60) % 60, s % 60].map(v => two(Math.floor(v))).join(':');

  function fit(ctx, name, R) {
    const f = SK.frame(name);
    if (!f) return;
    const sc = Math.min(R.w / f[3], R.h / f[4]);
    SK.draw(ctx, name, R.x + R.w / 2 - (f[3] / 2 - f[5]) * sc, R.y + R.h / 2 - (f[4] / 2 - f[6]) * sc, { sx: sc, sy: sc });
  }
  // nút con phủ kín cha để vẽ nội dung lên khung ảnh của cha (cha giữ nguyên ảnh 9 mảnh)
  function overlay(parent, fn) {
    parent.k = (parent.k || []).concat([{ n: 'cx', a: [0, 0, 1, 1], pv: [0.5, 0.5], p: [0, 0], sz: [0, 0], draw: fn }]);
  }

  function build(G, run) {
    const ui = SK.ugui.inst('certificate', { wrap: true });
    const card = SK.ugui.clone(U.prefabs.certificate_card);
    ui.q(CW + '/panel').k = [card];
    ui.reindex();
    const q = p => ui.q(CARD + '/' + p), p = G.player, hero = DS.heroes[p.hero] || {};
    const d = new Date();
    q('text_title').txt.s = 'GAME COMPLETE';
    q('time_root/pass_time').txt.s = two(d.getFullYear() % 100) + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
    q('time_root/cost_time').txt.s = hms(run.time);
    for (const k of ['pass_time', 'cost_time']) q('time_root/' + k).txt.fs = 28;   // prefab ghi fs 0 (cỡ do mã gốc đặt); đo theo clip ~28 [ƯỚC LƯỢNG]
    q('char_root/labelbg/Text').txt.s = 'Character';
    q('char_root/hero_info_bg1/text_name').txt.s = hero.name || p.hero;
    q('buffs_root/labelbg/Text').txt.s = 'Buffs/Pet/Drinks';
    q('mode_and_challenge_and_weapon/layout0/weapons/labelbg/Text').txt.s = 'Weapons';
    q('battle_stat/labelbg/Text').txt.s = 'Statistics';
    q('char_root/hero_info_bg2').off = 1;   // tên skin + biểu tượng kỹ năng: chưa dựng [GAPS.md]
    q('buffs_root/pet').off = 1; q('buffs_root/drinks').off = 1;   // thú cưng / thức uống: chưa dựng [GAPS.md]
    // hình nhân vật: khung đứng đầu như hộp tiểu sử của bảng tổng kết
    q('char_root/hero_info_bg1/hero_icon').draw = (ctx, R) => {
      const nm = SK.animFrame(p.anims.idle, 0), f = nm && SK.frame(nm);
      if (!f) return;
      const sc = Math.min(R.w / f[3], R.h * 0.78 / f[4]);   // chừa dải dưới cho tên nhân vật
      SK.draw(ctx, nm, R.x + R.w / 2 - (f[3] / 2 - f[5]) * sc, R.y + R.h * 0.8 - (f[4] - f[6]) * sc, { sx: sc, sy: sc });
    };
    // thiên phú: lưới biểu tượng 44 đơn vị trên khung buffs
    overlay(q('buffs_root/buffs'), (ctx, R) => {
      const ids = p.buffs || [], N = Math.max(1, Math.floor((R.w - 16) / 52));
      ids.forEach((id, i) => {
        const ic = SK.ROOMS && SK.ROOMS.buffIcon ? SK.ROOMS.buffIcon(id) : null;
        if (ic) fit(ctx, ic, { x: R.x + 12 + (i % N) * 52, y: R.y + 12 + Math.floor(i / N) * 52, w: 44, h: 44 });
      });
    });
    // vũ khí: biểu tượng + tên theo hàng ngang
    overlay(q('mode_and_challenge_and_weapon/layout0/weapons/bg'), (ctx, R) => {
      const ws = (p.weapons || []).filter(Boolean);
      ws.forEach((w, i) => {
        const wd = DS.weapons[w.id], cx = R.x + R.w * (i + 0.5) / Math.max(2, ws.length) - (ws.length < 2 ? R.w / 4 : 0), cy = R.y + R.h * 0.42;
        if (!wd) return;
        SK.drawGun(ctx, wd.sprite, cx, cy, 0, null, { scale: 6 });
        SK.text(ctx, wd.name, cx, R.y + R.h - 30, 24, '#e8e8e8', 'center', '#000');
      });
      if (!ws.length) SK.text(ctx, 'BARE HANDS', R.x + R.w / 2, R.y + R.h / 2, 26, '#e8e8e8', 'center', '#000');
    });
    // thống kê: ba dòng [ĐO LOC ui_certificate_kill / coin / damage]
    overlay(q('battle_stat/bg'), (ctx, R) => {
      [['Monsters Defeated:', run.kills], ['Coins Earned:', run.gold], ['Total Damage:', dmg]].forEach(([k, v], i) => {
        const y = R.y + 22 + i * 34;
        SK.text(ctx, k, R.x + 20, y, 22, '#6b6f78', 'left', null);
        SK.text(ctx, String(v), R.x + R.w - 20, y, 26, '#7d808a', 'right', null);
      });
    });
    // nền: ảnh màn chơi làm mờ + phủ tối
    ui.q(CW + '/bg').draw = (ctx, R) => {
      ctx.save();
      if (snap) { ctx.filter = 'blur(14px)'; ctx.drawImage(snap, R.x - 20, R.y - 20, R.w + 40, R.h + 40); ctx.filter = 'none'; }
      ctx.fillStyle = 'rgba(20,24,40,0.55)'; ctx.fillRect(R.x, R.y, R.w, R.h);
      ctx.restore();
    };
    return ui;
  }

  function certOpen(G) {
    const go = SK.gameover, st = go.state();
    cert.ui = build(G, st.run);
    cert.open = true; cert.t = 0; cert.hideT = -1;
    go.modal = true;
    cert.ui.play(CW, 'window_certificate_show');
  }
  function certClose() {
    if (!cert.open || cert.hideT >= 0) return;
    cert.hideT = 0;
    cert.ui.play(CW, 'window_certificate_hide');
  }
  SK.finale = {
    certStep(G, dt) {
      if (!cert.open) { SK.gameover.modal = false; return; }
      cert.t += dt; cert.ui.tick(dt);
      if (cert.hideT >= 0) {
        cert.hideT += dt;
        if (cert.hideT >= HIDE_LEN) { cert.open = false; cert.ui = null; SK.gameover.modal = false; }
        return;
      }
      if (cert.t > 0.4 && SK.input.hit('confirm')) certClose();
    },
    certClick(e) {
      if (!cert.open || cert.hideT >= 0 || cert.t <= 0.4) return;
      const hud = SK.hudCtx.canvas, r = hud.getBoundingClientRect(), dpr = hud.width / r.width;
      const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
      const inR = path => { const b = cert.ui.rectOf(path, hud.width, hud.height); return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; };
      if (inR(CW + '/btn_close')) certClose();
      else if (inR(CW + '/btn_share')) {   // gốc: CaptureCamera rồi chia sẻ ảnh; web: tải ảnh màn về máy
        hud.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'soulknight-certificate.png'; a.click(); });
      }
    },
    // móc kiểm thử
    state() {
      const G = SK.G, f = G.finale || fresh();
      return { phase: f.phase, t: f.t, lights: f.lights, flashAlpha: flashAlpha(f), flashAt: f.flashAt, log: f.log.slice(), timeline: FINALE.map(e => Object.assign({}, e)),
        cert: cert.open, certT: cert.t, dmg, stone: STONE,
        certText: cert.open && cert.ui ? ['text_title', 'time_root/pass_time', 'time_root/cost_time', 'char_root/hero_info_bg1/text_name'].map(k => cert.ui.q(CARD + '/' + k).txt.s) : null };
    },
    rect: path => cert.ui && SK.hudCtx ? (() => {
      const hud = SK.hudCtx.canvas, b = hud.getBoundingClientRect(), dpr = hud.width / b.width, r = cert.ui.rectOf(path, hud.width, hud.height);
      return r && { x: b.left + r.x / dpr, y: b.top + r.y / dpr, w: r.w / dpr, h: r.h / dpr };
    })() : null,
    TIMELINE: FINALE
  };

  SK.on('hud', ctx => {
    if (!cert.open || !cert.ui) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    cert.ui.draw(ctx, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  });
})();
