// HUD kiểu SK, vẽ trên canvas phân giải thật (chữ sắc) nhưng toạ độ tính bằng pixel game.
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS;

  // HUD trong ải dựng từ prefab gốc ui.ab › canvas.prefab (SK.ugui). Nút nào mã gốc bật theo chế độ/sự kiện
  // mà ải thường không dùng thì tắt ở đây.
  const HIDE = ['btn_season_prize', 'btn_season_gear', 'control/btn_emoticon', 'control/btn_fishing',
    'control/btn_special', 'info_bar/show_currency_group_widget', 'info_bar/token_coin', 'info_bar/net_info',
    'info_bar/vertical_bar', 're_read_guild_info', 'ui_chose', 'btn_rec', 'btn_ktplay', 'level_buff_info',
    'item_info', 'setting_bar', 'window_pause', 'text_gems', 'temp_ui', 'curtain',
    'state_bar/actAndFactorGroup', 'state_bar/btnGroup', 'state_bar/vertical_bar_left',
    'control/btn_weapon/weaponLeftBottomText', 'control/btn_weapon/pressureLv', 'control/btn_skill/skill_count',
    'control/btn_skill/cd_ok'];
  const BARS = [['hp_bar', 'hp', 'hpMax'], ['armor_bar', 'armor', 'armorMax'], ['energy_bar', 'energy', 'energyMax']];
  let UI = null, barW = 0, lastPhase = null, msgT = -1, skillReady = true;
  const hud = SK.hud = {};

  function ui() {
    if (UI || !SK.ugui || !SK.ugui.ok) return UI;
    UI = SK.ugui.inst('hud');
    for (const p of HIDE) { const n = UI.q(p); if (n) n.off = 1; }
    barW = UI.q('state_bar/hp_bar/img').sz[0];
    // [SUY] Ảnh hồi chiêu gốc dùng material xám (MaterialListMono); ở đây nhân màu xám đậm.
    UI.q('control/btn_skill/mask_style_1/cooldown').img.c = [0.3, 0.3, 0.3, 1];
    UI.q('control/btn_weapon/img').draw = (ctx, R) => fitSprite(ctx, weaponSprite, R);
    // Ô tròn nhỏ dưới nút vũ khí là vũ khí dự phòng; prefab để sprite giữ chỗ objects_pickable_18.
    UI.q('control/btn_weapon/weapon_slot/0').draw = (ctx, R) => fitSprite(ctx, spareSprite, R);
    pauseInit();
    return UI;
  }

  let weaponSprite = null, spareSprite = null;
  function fitSprite(ctx, name, R) {
    const f = SK.frame(name);
    if (!f) return;
    const sc = Math.min(R.w / f[3], R.h / f[4]);
    SK.draw(ctx, name, R.x + R.w / 2 - (f[3] / 2 - f[5]) * sc, R.y + R.h / 2 - (f[4] / 2 - f[6]) * sc, { sx: sc, sy: sc });
  }

  // ---------------------------------------------------------------- tạm dừng: window_pause gốc
  const PAUSE_HIDE = ['factor_list', 'hopperTicket', 'feedbackBtn', 'questionnaireBtn', 'mode_background',
    'btn_entry_im', 'img_hero/rebornCard', 'buff_info/factorBanBg'];
  let buffSel = -1;
  function pauseInit() {
    const w = 'window_pause/';
    for (const p of PAUSE_HIDE) UI.q(w + p).off = 1;
    UI.q(w + 'img_hero/mask/Image').draw = (ctx, R) => {
      const p = SK.G.player;
      fitSprite(ctx, p && SK.animFrame(p.anims.idle, 0), R);
    };
    UI.q(w + 'buff_list').draw = drawBuffRow;
    UI.q(w + 'buff_info/Image').draw = (ctx, R) => { const id = curBuffs()[buffSel]; if (id != null) fitSprite(ctx, SK.ROOMS.buffIcon(id), R); };
  }
  const curBuffs = () => (SK.G.player && SK.G.player.buffs) || [];
  const BUFF_CELL = 110;
  function drawBuffRow(ctx, R) {
    curBuffs().forEach((id, i) => {
      const x = R.x + 20 + i * BUFF_CELL, cell = { x, y: R.y + (R.h - 90) / 2, w: 90, h: 90 };
      if (i === buffSel) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cell.x - 6, cell.y - 6, 102, 102); }
      fitSprite(ctx, SK.ROOMS.buffIcon(id), cell);
    });
  }
  // Ô mô tả nằm đè lên hàng nút ở đáy khung: chỉ hiện khi đang chọn một buff.
  function refreshBuffInfo() {
    const ids = curBuffs(), info = UI.q('window_pause/buff_info');
    if (buffSel < 0 || buffSel >= ids.length) { info.off = 1; buffSel = -1; return; }
    delete info.off;
    const id = ids[buffSel];
    UI.q('window_pause/buff_info/Text').txt.s = SK.ROOMS.buffName(id) + ': ' + SK.ROOMS.buffDesc(id);
  }
  function pauseBar(confirm) {
    if (confirm) { UI.q('window_pause/btn_bar1').off = 1; delete UI.q('window_pause/btn_bar2').off; }
    else { delete UI.q('window_pause/btn_bar1').off; UI.q('window_pause/btn_bar2').off = 1; }
  }
  hud.pause = function () {
    const G = SK.G;
    if (G.state !== 'stage' || G.phase === 'portal' || !G.player || !ui()) return false;
    G.state = 'pause';
    delete UI.q('window_pause').off;
    UI.play('window_pause', 'show_window');
    pauseBar(false);
    buffSel = -1;
    refreshBuffInfo();
    SK.emit('pause', true);
    return true;
  };
  hud.resume = function () {
    const G = SK.G;
    if (G.state !== 'pause') return;
    G.state = 'stage';
    UI.play('window_pause', 'hide_window');
    UI.q('window_pause').off = 1;
    SK.emit('pause', false);
  };
  function pauseClick(inR, x) {
    if (buffSel >= 0 && !inR('window_pause/buff_list')) { buffSel = -1; refreshBuffInfo(); return; }
    if (inR('window_pause/btn_bar1/btn_continue')) hud.resume();
    else if (inR('window_pause/btn_bar1/btn_home')) pauseBar(true);
    else if (inR('window_pause/btn_bar1/btn_setting')) { const m = document.getElementById('sk-mute'); if (m) m.click(); }
    else if (inR('window_pause/btn_bar2/btn_no')) pauseBar(false);
    else if (inR('window_pause/btn_bar2/btn_yes')) { hud.resume(); SK.lobby.enter(); }
    else if (inR('window_pause/buff_list')) {
      const r = pxRect('window_pause/buff_list'), k = SK.hudCtx.canvas.height / 720;
      const i = Math.floor((x - r.x - 20 * k) / (BUFF_CELL * k));
      buffSel = i >= 0 && i < curBuffs().length && i !== buffSel ? i : -1;
      refreshBuffInfo();
    }
  }
  SK.MODES = SK.MODES || {};
  SK.MODES.pause = { step() {}, render() { hud.render(SK.G); } };
  addEventListener('keydown', e => {
    if (e.code !== 'Escape' && e.code !== 'KeyP') return;
    const G = SK.G;
    if (G && G.state === 'pause') hud.resume(); else hud.pause();
  });

  function pxRect(path) {
    const c = SK.hudCtx.canvas;
    return UI && UI.rectOf(path, c.width, c.height);
  }
  // Rect CSS px của một nút HUD (cho bộ kiểm bấm đúng chỗ vẽ).
  hud.rect = path => { const r = ui() && pxRect(path), d = SK.view.dpr; return r && { x: r.x / d, y: r.y / d, w: r.w / d, h: r.h / d }; };

  hud.hitButton = function (xCss, yCss) {
    const G = SK.G;
    if ((G.state !== 'stage' && G.state !== 'pause') || !ui()) return null;
    const dpr = SK.view.dpr, x = xCss * dpr, y = yCss * dpr;
    const inR = p => { const r = pxRect(p); return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };
    if (G.state === 'pause') { pauseClick(inR, x); return 'ui'; }
    if (inR('info_bar/btn_pause')) { hud.pause(); return 'ui'; }
    if (inR('control/btn_skill')) return 'skill';
    if (inR('control/btn_weapon')) return 'swap';
    if (SK.input.touchMode && inR('control/btn_atk')) return 'attack';
    return null;
  };

  // [ĐO] UICanvas.UpdateHpBarValid/UpdateEnergyBarValid: img.sizeDelta.x = rộng gốc × hiện tại / tối đa, chữ "hiện tại/tối đa".
  function statusBars(p) {
    for (const [node, cur, max] of BARS) {
      const k = p[max] > 0 ? Math.max(0, Math.min(1, p[cur] / p[max])) : 0;
      UI.q('state_bar/' + node + '/img').sz[0] = barW * k;
      UI.q('state_bar/' + node + '/Text').txt.s = Math.ceil(p[cur]) + '/' + p[max];
    }
  }

  function controls(G, dt) {
    const p = G.player, w = p.weapons[p.cur];
    const spare = p.weapons[1 - p.cur];
    weaponSprite = w && w.def.sprite;
    spareSprite = spare && spare.def.sprite;
    UI.q('control/btn_weapon/Text').txt.s = String((w && w.def.cost) || 0);
    const sk = p.h.skill, cd = UI.q('control/btn_skill/mask_style_1/cooldown');
    cd.img.fa = p.skillCd > 0 && sk.cd ? Math.min(1, p.skillCd / sk.cd) : 0;
    const ready = !(p.skillCd > 0);
    if (ready && !skillReady) {
      const ok = UI.q('control/btn_skill/cd_ok');
      delete ok.off;
      const len = UI.play('control/btn_skill/cd_ok', 'cd_ok');
      setTimeout(() => { ok.off = 1; }, len * 1000 + 50);
    }
    skillReady = ready;
    const st = SK.input.stick, joy = UI.q('control/joystick'), knob = UI.q('control/joystick/btn');
    if (!joy.home) joy.home = joy.p.slice();
    if (st.active) {
      const k = SK.hudCtx.canvas.height / 720, dpr = SK.view.dpr;
      joy.p = [st.ox * dpr / k, 720 - st.oy * dpr / k];
      const dx = (st.x - st.ox) * dpr / k, dy = (st.oy - st.y) * dpr / k, m = Math.hypot(dx, dy);
      const R = joy.sz[0] / 2 - knob.sz[0] / 2;
      knob.p = m > R ? [dx / m * R, dy / m * R] : [dx, dy];
    } else { joy.p = joy.home.slice(); knob.p = [0, 0]; }
    UI.q('info_bar/coin/Text').txt.s = String(G.player.gold);
    void dt;
  }

  // Băng rôn vào ải: message_bar › show_message rồi hide_message, như UIMessageBar gốc.
  // [SUY] 2 s: thời lượng do nơi gọi UICanvas.ShowLevelMessage(branch, msg, time) truyền vào, chưa đọc được.
  function levelBanner(G, dt) {
    if (G.phase === 'enter' && lastPhase !== 'enter') {
      UI.q('message_bar/level_text').txt.s = G.stage.label;
      UI.play('message_bar', 'show_message');
      msgT = 2.0;
    }
    lastPhase = G.phase;
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) UI.play('message_bar', 'hide_message'); }
  }

  // ---------------------------------------------------------------- bản đồ nhỏ: MiniMapUIView gốc
  // [ĐO] Phòng đặt cách nhau config.fixedRoomIntervals, phòng hiện tại ở giữa khung (_roomOffset) có khung `select`;
  // hành lang (CreateCorridors) đặt ở trung điểm hai phòng, sizeDelta = (7, khoảng cách), xoay theo hướng nối.
  const LOGO = { start: 'startRoomLogo', end: 'portalRoomLogo', boss: 'bossRoomLogo', chest: 'chestRoomLogo', special: 'specialRoomLogo' };
  const rgba = c => [c.r, c.g, c.b, c.a];
  const cloneTpl = n => JSON.parse(JSON.stringify(n));
  function minimap(G) {
    const mm = UI.q('map_info_root/miniMap'), cfg = mm.mbd.MiniMapUIView.config, iv = cfg.fixedRoomIntervals;
    const rooms = UI.q('map_info_root/miniMap/root/rooms'), cors = UI.q('map_info_root/miniMap/root/corridors');
    const tplR = SK_UI.prefabs.minimap_room, tplC = SK_UI.prefabs.minimap_corridor;
    const cur = G.room || G.map.rooms[0], pos = r => [(r.gx - cur.gx) * iv, -(r.gy - cur.gy) * iv];
    rooms.k = []; cors.k = [];
    for (const r of G.map.rooms) {
      if (!r.seen) continue;
      for (const l of r.links) {
        const o = G.map.rooms[l];
        if (!o.seen || l < r.id) continue;
        const [ax, ay] = pos(r), [bx, by] = pos(o), c = cloneTpl(tplC);
        c.p = [(ax + bx) / 2, (ay + by) / 2];
        c.sz = [7, Math.hypot(bx - ax, by - ay)];
        c.rz = Math.atan2(by - ay, bx - ax) * 180 / Math.PI - 90;
        cors.k.push(c);
      }
      const n = cloneTpl(tplR);
      n.p = pos(r);
      n.img.c = rgba(r === cur ? cfg.exploringRoomColor : r.visited ? cfg.exploredRoomColor : cfg.unexploredRoomColor);
      const logo = n.k[0], sp = LOGO[r.type] && cfg[LOGO[r.type]];
      if (sp) logo.img.sp = sp; else logo.off = 1;
      rooms.k.push(n);
    }
    UI.q('map_info_root/miniMap/levelText').txt.s = G.stage.label;
  }

  // Số sát thương theo UIDamageText gốc (common.ab › register/damage_text.prefab) [ĐO]:
  // Text LC_Pixel (= họ LockClock) cỡ 32 × scale 0,02 đơn vị, Shadow (2,-2); DOJumpAnchorPos một lần tới điểm lệch
  // x ±0,5..1,5, y -0,5..0,25 đơn vị, lực nảy 0,75..1,5, thời gian 0,5..0,6 s; chí mạng phóng thêm criticDeltaScale 0,2.
  // Tham số ngẫu nhiên dùng Math.random để không đụng chuỗi SK.rand của gameplay.
  // [SUY] Mờ dần 0,15 s cuối trong vòng đời 0,8 s của G.nums; fadeDuration gốc chưa đọc được.
  const PPU = 16, NUM_PX = 32 * 0.02 * PPU, NUM_SHADOW = 2 * 0.02 * PPU;
  const rnd = (a, b) => a + (b - a) * Math.random();
  function damageNumber(ctx, n, cam) {
    if (!n.jump) {
      n.jump = { dx: (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.5) * PPU, dy: -rnd(-0.5, 0.25) * PPU,
        h: rnd(0.75, 1.5) * PPU, dur: rnd(0.5, 0.6) };
    }
    const J = n.jump, u = Math.min(1, n.t / J.dur);
    const x = n.x - cam.x + J.dx * u, y = n.y - cam.y + J.dy * u - J.h * 4 * u * (1 - u);
    const size = NUM_PX * (n.big ? 1.2 : 1);
    ctx.save();
    ctx.globalAlpha = n.t > 0.65 ? Math.max(0, (0.8 - n.t) / 0.15) : 1;
    ctx.font = size + 'px "skui_LockClock", ' + SK.FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText(String(n.val), x + NUM_SHADOW, y + NUM_SHADOW);
    ctx.fillStyle = n.color; ctx.fillText(String(n.val), x, y);
    ctx.restore();
  }

  function worldText(ctx, G) {
    const cam = G.view || G.cam;
    for (const n of G.nums) damageNumber(ctx, n, cam);
    const it = G.interactTarget;
    if (it) SK.text(ctx, (SK.input.touchMode ? '' : '[E] ') + it.label, it.x - cam.x, it.y - cam.y, 8, '#ffe06a', 'center', 'rgba(0,0,0,0.9)');
  }

  function overlays(ctx, G) {
    const v = SK.view;
    if (G.hurtT > 0) {
      const g = ctx.createRadialGradient(v.w / 2, v.h / 2, v.h * 0.35, v.w / 2, v.h / 2, v.w * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(200,0,0,' + (G.hurtT * 1.1) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.h);
    }
    if (G.phase === 'enter' && G.phaseT < 1.8) {
      const t = G.phaseT;
      if (t < 0.35) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - t / 0.35) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    }
    if (G.phase === 'portal') { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(G.hold ? 0.6 : 1, G.phaseT / 0.8) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    if (G.banner) SK.text(ctx, G.banner.text, v.w / 2, 22, 14, '#ff5a4a', 'center', '#000');
    if (G.toastT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, G.toastT * 3);
      SK.text(ctx, G.toastMsg, v.w / 2, v.h - 30, 10, '#ffffff', 'center', 'rgba(0,0,0,0.9)');
      ctx.restore();
    }
  }

  hud.render = function (G) {
    const ctx = SK.hudCtx, v = SK.view, k = v.scale * v.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (G.state === 'lobby' || !G.player || !G.map) return;
    worldText(ctx, G);
    overlays(ctx, G);
    if (ui()) {
      const dt = Math.min(0.1, (G.t || 0) - (hud.lastT || 0)); hud.lastT = G.t || 0;
      statusBars(G.player);
      controls(G, dt);
      levelBanner(G, dt);
      minimap(G);
      UI.tick(Math.max(0, dt));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      UI.draw(ctx, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
      ctx.setTransform(k, 0, 0, k, 0, 0);
    }
    SK.emit('hud', ctx, G);
  };
})();
