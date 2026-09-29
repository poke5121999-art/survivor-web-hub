// Season Mode: máy trạng thái căn cứ ↔ chuyến đi, đăng ký SK.MODES.season.
// base → deploying → expedition (Scene1) → extracting → base;  chết → dead → base.
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS;
  const SEASON = SK.SEASON = SK.SEASON || {};
  const G = SK.G;
  const SW = () => SEASON.world;
  const inv = () => SEASON.inv;
  const FADE = 0.8;
  const L = (k, d) => (SEASON.L ? SEASON.L(k, d) : d);
  const ZONE = { base: L('esc_map_base', 'Căn Cứ'), s1: L('esc_map_base_outskirts', 'Vành Đai Căn Cứ') };

  // [ĐO EscapeGameModeProcess.OnCharacterAttrSetup] máu = máu gốc + 2 x giáp gốc (+ nâng cấp), giáp chỉ từ áo giáp.
  function makeSeasonPlayer(heroId) {
    const p = SK.makePlayer(heroId, 0, 0), h = DS.heroes[heroId];
    p.hpMax = p.hp = h.hp + 2 * (h.armor || 0) + (inv() ? inv().grow('health') : 0);
    p.armor = p.armorMax = 0;
    return p;
  }

  function setMode(m) { G.season.mode = m; G.season.modeT = 0; }

  SEASON.start = function (heroId) {
    const sw = SW();
    if (!sw || !sw.buildMap) { SK.warnOnce('seasonWorld', 'season world module missing'); return false; }
    heroId = heroId && DS.heroes[heroId] ? heroId : 'knight';
    if (SK.profile && SK.profile.isUnlocked && !SK.profile.isUnlocked(heroId)) heroId = 'knight';
    G.heroId = heroId;
    SK.setOverlay(null);
    const hm = document.getElementById('hs-modes'); if (hm) hm.hidden = true;
    G.state = 'season'; G.kills = 0; G.phase = 'play'; G.phaseT = 0; G.hold = false; G.shake = 0; G.hurtT = 0; G.toastT = 0;
    G.stage = { label: ZONE.base, theme: '' };
    G.player = makeSeasonPlayer(heroId);
    G.season = { mode: 'base', modeT: 0, t: 0, map: 'base', bag: {}, fade: 1, banner: ZONE.base, bannerT: 0, paused: false };
    const I = inv();
    if (I) { if (I.load) I.load(); if (I.state) I.state.hero = heroId; }
    sw.enterBase(G, 'spawn');
    sw.ensureArt();
    snapCam();
    SK.emit('seasonStart', G);
    return true;
  };

  SEASON.exit = function () {
    SEASON.pause(false);
    const I = inv(); if (I && I.save) I.save();
    SK.lobby.enter();
  };

  // ---------------------------------------------------------------- chuyển vùng
  function deploy() {
    const I = inv(); if (I && I.onDeploy) I.onDeploy();
    SW().enterExpedition(G);
    G.stage = { label: ZONE.s1, theme: '' };
    G.season.banner = ZONE.s1; G.season.bannerT = 0;
    G.phase = 'play';
    setMode('expedition');
    snapCam();
  }
  function backToBase(how) {
    const p = G.player, S = G.season, I = inv();
    // người được giải cứu về tới căn cứ thì ở lại (esc_result_rescue_character); chết thì mất liên lạc
    if (how !== 'dead' && S.followers && I) {
      for (const f of S.followers) { I.addNode(SW().nodeOfNpc(f.npc)); SK.emit('seasonRescue', G, f.npc); }
      if (S.followers.length) S.rescued = S.followers.map(f => f.name);
    }
    S.followers = [];
    if (how === 'dead') {
      G.player = makeSeasonPlayer(p.hero);
    } else {
      // [ĐOÁN] về căn cứ là hồi đầy máu/năng lượng như sau mỗi chuyến
      p.hp = p.hpMax; p.energy = p.energyMax; p.st = 'alive'; p.invulT = 0;
      if (p.skillT > 0) SK.endSkill(G, p);
    }
    SW().enterBase(G, how === 'dead' ? 'spawn' : 'portal');
    G.stage = { label: ZONE.base, theme: '' };
    G.season.banner = how === 'dead' ? L('esc_result_failure', 'Rút lui thất bại...') : L('esc_result_success', 'Rút lui thành công!!') +
      (S.rescued && S.rescued.length ? '  Đã cứu ' + S.rescued.join(', ') : '');
    S.rescued = null;
    if (SEASON.quests) SEASON.quests.refresh();
    G.season.bannerT = 0;
    G.phase = 'play';
    setMode('base');
    snapCam();
  }

  // ---------------------------------------------------------------- bước
  function step(dt) {
    const S = G.season, p = G.player;
    if (!S || !p || !G.map) return;
    SW().ensureArt();
    if (S.paused) return;
    S.t += dt; S.modeT += dt; S.bannerT += dt;
    if (p.god) p.invulT = Math.max(p.invulT || 0, 0.1);   // debug.god(): máy không có cờ bất tử riêng
    G.phaseT += dt;
    G.toastT -= dt; G.hurtT = Math.max(0, G.hurtT - dt); G.shake = Math.max(0, G.shake - dt * 12);
    const ui = SEASON.ui, I = inv();
    let captured = false;
    if (ui && typeof ui.update === 'function') captured = !!ui.update(dt);
    else if (I && typeof I.tick === 'function') I.tick(G, dt);
    const busy = S.mode === 'deploying' || S.mode === 'extracting' || S.mode === 'dead';
    G.phase = busy ? 'portal' : 'play';
    G.interactTarget = p.st === 'dead' || captured || busy ? null : SW().nearestInteract(G);
    if (!captured) SK.updatePlayer(G, dt);
    else p.t += dt;
    const ev = SW().update(G, dt);
    SK.updateBullets(G, dt);
    SK.updatePickups(G, dt);
    SK.updateFx(G, dt);
    for (const pr of G.props) if (pr.update) pr.update(G, pr, dt);
    G.props = G.props.filter(pr => !pr.gone);

    if (S.mode === 'base' && ev === 'portal') { setMode('deploying'); p.invulT = 2; }
    else if (S.mode === 'expedition' && ev === 'extract') {
      setMode('extracting'); p.invulT = 2;
      SK.emit('seasonExtract', G);
      if (I && I.onExtract) I.onExtract();
    } else if (S.mode === 'deploying' && S.modeT > FADE) deploy();
    else if (S.mode === 'extracting' && S.modeT > FADE) backToBase('extract');
    else if ((S.mode === 'base' || S.mode === 'expedition') && p.st === 'dead' && p.stT > 1.3) {
      setMode('dead');
      SK.emit('seasonDeath', G);
      if (I && I.onDeath) I.onDeath(G);
    } else if (S.mode === 'dead' && S.modeT > 2.2) backToBase('dead');
  }

  // ---------------------------------------------------------------- camera + vẽ
  function camTarget() {
    const p = G.player, v = SK.view, lead = p.target ? 14 : 6;
    let x = p.x - v.w / 2 + Math.cos(p.aim) * lead, y = p.y - 10 - v.h / 2 + Math.sin(p.aim) * lead;
    x = SK.clamp(x, 0, Math.max(0, G.map.pxW - v.w)); y = SK.clamp(y, 0, Math.max(0, G.map.pxH - v.h));
    return [x, y];
  }
  function snapCam() { const [x, y] = camTarget(); G.cam.x = x; G.cam.y = y; }

  function render(ctx) {
    const v = SK.view, S = G.season;
    if (!S || !G.map || !G.player) return;
    const [tx, ty] = camTarget();
    G.cam.x += (tx - G.cam.x) * 0.18; G.cam.y += (ty - G.cam.y) * 0.18;
    const sh = G.shake > 0 ? G.shake : 0;
    const cx = Math.round(G.cam.x + (Math.random() - 0.5) * sh), cy = Math.round(G.cam.y + (Math.random() - 0.5) * sh);
    G.view = { x: cx, y: cy };
    ctx.fillStyle = G.map.bg; ctx.fillRect(0, 0, v.w, v.h);
    ctx.translate(-cx, -cy);
    SW().render(ctx, G, { x: cx, y: cy }, v.w, v.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // chuyển vùng: tối dần rồi sáng dần
    let k = 0;
    if (S.mode === 'deploying' || S.mode === 'extracting') k = Math.min(1, S.modeT / FADE);
    else if (S.mode === 'dead') k = Math.min(0.75, S.modeT / 1.2);
    else if (S.modeT < 0.5) k = 1 - S.modeT / 0.5;
    if (k > 0) { ctx.fillStyle = 'rgba(0,0,0,' + k + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    renderHud();
  }

  function renderHud() {
    const ui = SEASON.ui, v = SK.view, k = v.scale * v.dpr, ctx = SK.hudCtx;
    if (ui && typeof ui.render === 'function') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = false;
      worldText(ctx);
      ctx.save(); ui.render(ctx, G); ctx.restore();
      ctx.setTransform(k, 0, 0, k, 0, 0);
    } else SK.hud.render(G);   // HUD mặc định (3 thanh) khi mô-đun UI mùa chưa có
    extras(ctx);
  }

  // Số sát thương + nhãn [E] (hud.js giữ riêng hàm này nên vẽ lại khi UI mùa thay HUD).
  function worldText(ctx) {
    const cam = G.view || G.cam;
    for (const n of G.nums) {
      const q = n.t / 0.8, y = n.y - cam.y - 10 * Math.min(1, q * 3);
      ctx.save(); ctx.globalAlpha = q > 0.7 ? (1 - q) / 0.3 : 1;
      SK.text(ctx, String(n.val), n.x - cam.x, y, n.big ? 12 : 9, n.color, 'center', 'rgba(0,0,0,0.9)');
      ctx.restore();
    }
    const it = G.interactTarget;
    if (it) SK.text(ctx, (SK.input.touchMode ? '' : '[E] ') + it.label, it.x - cam.x, it.y - cam.y, 8, '#ffe06a', 'center', 'rgba(0,0,0,0.9)');
    if (G.toastT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, G.toastT * 3);
      SK.text(ctx, G.toastMsg, SK.view.w / 2, SK.view.h - 30, 10, '#ffffff', 'center', 'rgba(0,0,0,0.9)');
      ctx.restore();
    }
  }

  function extras(ctx) {
    const S = G.season, v = SK.view, ui = SEASON.ui;
    if (!S || (ui && ui.isOpen && ui.isOpen())) return;
    if (S.extract && (S.mode === 'expedition' || S.mode === 'base')) {
      const left = Math.max(0, S.extract.dur - S.extract.t);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(v.w / 2 - 80, 42, 160, 20);
      SK.text(ctx, (S.mode === 'base' ? 'Xuất phát sau ' : 'Rút lui sau ') + left.toFixed(1) + ' giây', v.w / 2, 52, 14, '#9dff9a', 'center', '#000');
    }
    if (S.bannerT < 2.4 && S.banner) {
      const a = S.bannerT < 0.3 ? S.bannerT / 0.3 : S.bannerT > 1.9 ? (2.4 - S.bannerT) / 0.5 : 1;
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, v.h * 0.3, v.w, 26);
      SK.text(ctx, S.banner, v.w / 2, v.h * 0.3 + 13, 14, '#ffffff', 'center', '#000');
      ctx.restore();
    }
    if (S.mode === 'dead') {
      SK.text(ctx, L('esc_result_failure', 'Rút lui thất bại...'), v.w / 2, v.h / 2 - 8, 16, '#ff6a5a', 'center', '#000');
      SK.text(ctx, 'Balô + trang bị nằm lại trong Rương Tử Vong — còn 1 lần để quay lại lấy', v.w / 2, v.h / 2 + 10, 9, '#ffd0c8', 'center', '#000');
    }
  }

  SK.MODES = SK.MODES || {};
  SK.MODES.season = { step, render };

  // Tạm dừng do ui.js vẽ (bảng canvas có Cửa hàng mùa); đây chỉ là lối gọi cho mã ngoài.
  SEASON.pause = on => { const ui = SEASON.ui; if (!ui) return; if (on) ui.openPause(); else ui.close(); };

  // ---------------------------------------------------------------- móc cho kiểm thử
  SEASON.debug = {
    get info() {
      const S = G.season, p = G.player;
      if (!S || !p) return null;
      return { mode: S.mode, map: S.map, x: p.x, y: p.y, hp: p.hp, hpMax: p.hpMax, armor: p.armor, st: p.st,
        weapons: p.weapons.map(w => w && w.id), enemies: G.enemies.filter(e => e.st !== 'dead').length, kills: G.kills,
        crates: S.crates.length, opened: S.crates.filter(c => c.open).length, extract: S.extract ? S.extract.t : 0,
        gates: S.gates.map(g => g.kind), followers: (S.followers || []).length,
        interact: G.interactTarget ? G.interactTarget.label : null };
    },
    god(on) { if (G.player) G.player.god = on !== false; },
    tp(x, y) { const [fx, fy] = SW().freeNear(G.map, x, y); G.player.x = fx; G.player.y = fy; snapCam(); return [fx, fy]; },
    tpTo(kind, i) {
      const S = G.season, md = window.SK_SEASON.world.maps[S.map];
      let pt = null;
      if (kind === 'portal') { const g = S.gates.find(q => q.kind === 'deploy'); if (g) pt = [g.x, g.y + 30]; }
      if (kind === 'enemy') { const e = G.enemies.filter(q => q.st !== 'dead')[i || 0]; if (e) pt = [e.x + 60, e.y]; }
      if (kind === 'exit') { const g = S.gates.filter(q => q.kind === 'evac' || q.kind === 'home')[i || 0]; if (g) pt = [g.x, g.y - 10]; }
      if (kind === 'crate') { const c = S.crates.filter(q => !q.open)[i || 0]; if (c) pt = [c.x, c.y + 14]; }
      if (kind === 'building') { const b = G.map.buildings.find(q => q.id === i); if (b) pt = [b.x, b.y + 20]; }
      if (kind === 'npc') { const n = S.npcs.find(q => q.id === i) || S.npcs[0]; if (n) pt = [n.x, n.y + 14]; }
      if (kind === 'rescue') { const r = S.rescue[i || 0]; if (r) pt = [r.x, r.y + 14]; }
      if (kind === 'area') { const a = S.investigate[i || 0]; if (a) pt = [a.x, a.y]; }
      if (!pt) return null;
      return this.tp(pt[0], pt[1]);
    },
    // Giết quái gần nhất bằng đòn thật (SK.hurtEnemy) để chạy đúng đường rớt thùng.
    killNearest() {
      const p = G.player;
      const e = G.enemies.filter(q => q.st !== 'dead').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (!e) return null;
      SK.hurtEnemy(G, e, e.hp + 1, false, 0, 0);
      return e.kind;
    },
    kill() { if (G.player) { G.player.god = false; G.player.invulT = 0; G.player.armor = 0; SK.hurtPlayer(G, 999); } },
    interact() { if (G.interactTarget) { G.interactTarget.use(G); return true; } return false; },
    step(n) { for (let i = 0; i < (n || 1); i++) step(SK.STEP); }
  };
})();
