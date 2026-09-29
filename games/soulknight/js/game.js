// Máy trạng thái trò chơi: lobby → stage(enter → play → portal) → dead | victory.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, T = SK.TILE, W = SK.world;

  const STAGES = [];
  for (const [theme, level] of DS.run) for (let i = 1; i <= 5; i++) STAGES.push({ theme, level, n: i, label: level + '-' + i, boss: i === 5 });
  SK.STAGES = STAGES;

  const G = SK.G = {
    state: 'lobby', phase: null, phaseT: 0, t: 0, stageIdx: 0, stage: null, map: null, room: null,
    player: null, enemies: [], bullets: [], pickups: [], fx: [], nums: [], items: [], chests: [], interactables: [], props: [], portal: null,
    cam: { x: 0, y: 0 }, shake: 0, hurtT: 0, kills: 0, interactTarget: null, toastMsg: '', toastT: 0, banner: null
  };
  G.toast = (msg, t) => { G.toastMsg = msg; G.toastT = t || 1.4; };

  const consume = id => { const a = D.enemies[id] && D.enemies[id].ai[0]; return (a && a.p.consume) || 1; };

  // ---------------------------------------------------------------- đợt quái
  G.buildWaves = function (r) {
    const th = G.map.th;
    const roster = th.enemies.filter(id => D.enemies[id]);
    if (r.type === 'boss') return SK.bossWaves(G, r);
    const pat = r.pattern;
    const pts = pat ? pat.pts : DS.waves.pts, n = Math.max(1, pat ? pat.waves : DS.waves.count), exRate = (pat ? pat.ex : DS.waves.ex) / 100;
    const per = Math.max(1, Math.floor(pts / n));
    const waves = [];
    for (let w = 0; w < n; w++) {
      let budget = per; const list = [];
      while (budget > 0) {
        const cand = roster.filter(id => consume(id) <= budget);
        if (!cand.length) break;
        const id = SK.pick(cand);
        budget -= consume(id);
        const ex = th.elites && th.elites[id];
        list.push(ex && D.enemies[ex] && SK.chance(exRate) ? ex : id);
      }
      if (list.length) waves.push(list);
    }
    return waves.length ? waves : [[roster[0]]];
  };

  G.spawnWave = function (r, ids) {
    const p = G.player;
    const pts = SK.shuffle(r.spawnPts.map(([x, y]) => [x * T + 8, y * T + 12]));
    const far = pts.filter(([x, y]) => Math.hypot(x - p.x, y - p.y) > 56);
    const use = far.length ? far : pts;
    ids.forEach((id, i) => {
      let [x, y] = use[i % use.length];
      if (i >= use.length) { x += SK.randf(-10, 10); y += SK.randf(-6, 6); }
      if (W.solidAt(G.map, x, y)) [x, y] = use[i % use.length];
      G.enemies.push(SK.makeEnemy(G, id, x, y, r));
    });
  };

  G.onRoomCleared = function (r) {
    if (r.type === 'battle' && SK.chance(DS.rules.rewardChestChance)) {
      const [x, y] = freeNear(W.roomCenter(r));
      G.chests.push({ kind: 'reward', x, y, open: false, t: 0, openT: 0 });
    }
    if (r.type === 'boss') {
      const [x, y] = freeNear(W.roomCenter(r));
      G.chests.push({ kind: 'weapon', x, y, open: false, t: 0, openT: 0 });
      G.banner = null;
    }
  };

  function freeNear([x, y]) {
    for (let rad = 0; rad < 8; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const px = x + dx * T, py = y + dy * T;
      if (!W.solidAt(G.map, px, py) && !W.solidAt(G.map, px - 6, py) && !W.solidAt(G.map, px + 6, py)) return [Math.floor(px / T) * T + 8, Math.floor(py / T) * T + 12];
    }
    return [x, y];
  }

  // ---------------------------------------------------------------- tương tác (E)
  function nearestInteract() {
    const p = G.player; let best = null, bd = 26;
    for (const o of G.interactables) {
      if (o.gone) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y), reach = o.r || 26;
      if (d < reach && d - reach < bd - 26) { bd = d - reach + 26; best = { x: o.x, y: o.y - (o.labelY || 24), label: o.label, use: () => o.use(G, o) }; }
    }
    for (const it of G.items) {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < bd) { bd = d; best = { x: it.x, y: it.y - 14, label: 'Nhặt ' + DS.weapons[it.id].name, use: () => pickWeapon(it) }; }
    }
    for (const c of G.chests) {
      if (c.open) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd + 8) { bd = d; best = { x: c.x, y: c.y - 30, label: c.kind === 'weapon' ? 'Mở rương vũ khí' : 'Mở rương', use: () => openChest(c) }; }
    }
    return best;
  }
  function pickWeapon(it) {
    const p = G.player;
    G.items = G.items.filter(x => x !== it);
    if (!p.weapons[1]) { p.weapons[1] = SK.makeWeapon(it.id); p.cur = 1; }
    else {
      const old = p.weapons[p.cur];
      p.weapons[p.cur] = SK.makeWeapon(it.id);
      G.items.push({ id: old.id, x: p.x, y: p.y + 4, t: 0 });
    }
    if (p.skillT > 0 && p.dual) SK.endSkill(G, p);
    G.toast(DS.weapons[it.id].name);
  }
  function openChest(c) {
    c.open = true; c.openT = 0;
    if (c.kind === 'weapon') {
      const own = G.player.weapons.filter(Boolean).map(w => w.id);
      const all = SK.weaponPool(G.stage.level, 'chest');
      const pool = all.filter(id => own.indexOf(id) < 0);
      G.items.push({ id: SK.pick(pool.length ? pool : all), x: c.x, y: c.y + 18, t: 0 });
    } else {
      const m = SK.prefabMbs(SK.art.object('chest_reward'), 'RGChestRoomReward') || { award_count: 2, has_coin: 1 };
      if (m.has_coin) for (let i = 0, n = SK.randi(4, 8); i < n; i++) SK.dropPickup(G, 'coin', c.x, c.y - 6);
      for (let i = 0; i < (m.award_count || 2) + SK.randi(0, 2); i++) SK.dropPickup(G, 'energy', c.x, c.y - 6);
      if (SK.chance(0.25)) SK.dropPickup(G, SK.chance(0.5) ? 'hp_pot' : 'en_pot', c.x, c.y + 6);
    }
  }

  // ---------------------------------------------------------------- vào màn
  function enterStage(i) {
    G.stageIdx = i; G.stage = STAGES[i];
    G.map = W.generate(G.stage);
    G.enemies = []; G.bullets = []; G.pickups = []; G.fx = []; G.nums = []; G.items = []; G.chests = []; G.interactables = []; G.props = [];
    G.room = null; G.banner = null;
    const map = G.map, start = map.rooms[0];
    const [sx, sy] = W.roomCenter(start);
    if (!G.player) G.player = SK.makePlayer(G.heroId || 'knight', sx, sy + 4);
    if (G.player.skillT > 0) SK.endSkill(G, G.player);
    Object.assign(G.player, { x: sx, y: sy + 4, st: 'alive', invulT: 0, skillT: 0, dual: null });
    for (const r of map.rooms) {
      const fill = SK.ROOM_FILL[r.type];
      if (fill) fill(G, r, W.roomCenter(r));
    }
    G.phase = 'enter'; G.phaseT = 0;
    snapCamera();
    SK.emit('stageEnter', G, G.stage);
  }

  // Đồ đặt sẵn trong phòng theo loại phòng; mô-đun khác ghi đè một dòng để thay (lái buôn, tượng...).
  SK.ROOM_FILL = {
    end(G, r, c) { G.portal = { x: c[0], y: c[1] + 8, t: 0 }; },
    chest(G, r, c) { const [x, y] = freeNear(c); G.chests.push({ kind: 'weapon', x, y, open: false, t: 0, openT: 0 }); },
    special(G, r, c) {
      G.pickups.push({ kind: 'hp_pot', x: c[0] - 12, y: c[1] + 8, vx: 0, vy: 0, t: 1, z: 0, vz: 0 });
      G.pickups.push({ kind: 'en_pot', x: c[0] + 12, y: c[1] + 8, vx: 0, vy: 0, t: 1, z: 0, vz: 0 });
    }
  };
  SK.freeNear = freeNear;

  const setOverlay = SK.setOverlay = name => {
    for (const id of ['sk-lobby', 'sk-over', 'sk-win']) document.getElementById(id).hidden = id !== name;
  };

  SK.lobby = {
    enter() { G.state = 'lobby'; G.player = null; G.map = null; setOverlay('sk-lobby'); },
    update() { if (SK.input.hit('confirm')) startRun(); },
    render(ctx) {
      const v = SK.view;
      ctx.fillStyle = '#0d1a22'; ctx.fillRect(0, 0, v.w, v.h);
      ctx.fillStyle = '#12303a';
      for (let y = 0; y < v.h; y += T) for (let x = (y / T) % 2 ? 0 : T; x < v.w; x += T * 2) ctx.fillRect(x, y, T, T);
      const hd = D.heroes.knight && D.heroes.knight.s0;
      const x = Math.round(v.w / 2), y = Math.round(v.h * 0.64);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      SK.draw(ctx, SK.animFrame(hd && hd.idle, G.t), x, y, { sx: 2, sy: 2 });
      SK.drawGun(ctx, DS.weapons[DS.heroes.knight.weapon].sprite, x + 6, y - 12, 0.1, null, { scale: 2 });
    }
  };

  function startRun(heroId) {
    if (typeof heroId === 'string') G.heroId = heroId;
    G.player = null; G.kills = 0; G.state = 'stage';
    setOverlay(null);
    enterStage(0);
    SK.emit('runStart', G);
  }
  SK.startRun = startRun;
  G.onPlayerDead = function () { G.shake = 5; };

  // ---------------------------------------------------------------- cập nhật
  // Chế độ chơi khác (Season Mode...) đăng ký SK.MODES[tên] = {step(dt), render(ctx)} và đặt G.state = tên.
  SK.MODES = SK.MODES || {};

  function step(dt) {
    G.t += dt;
    if (SK.MODES[G.state]) { SK.MODES[G.state].step(dt); return; }
    if (G.state === 'lobby') { SK.lobby.update(dt); return; }
    if (G.state !== 'stage' && G.state !== 'dead') return;
    G.phaseT += dt;
    G.toastT -= dt; G.hurtT = Math.max(0, G.hurtT - dt); G.shake = Math.max(0, G.shake - dt * 12);
    if (G.banner) G.banner.t += dt;
    const p = G.player;
    SK.updatePlayer(G, dt);
    W.updateRooms(G, dt);
    for (const e of G.enemies) SK.updateEnemy(G, e, dt);
    SK.updateBullets(G, dt);
    SK.updatePickups(G, dt);
    SK.updateFx(G, dt);
    for (const c of G.chests) { c.t += dt; if (c.open) c.openT += dt; }
    for (const it of G.items) it.t += dt;
    for (const pr of G.props) if (pr.update) pr.update(G, pr, dt);
    G.props = G.props.filter(pr => !pr.gone);
    for (const [, o] of G.map.obs) if (o.flash > 0) o.flash -= dt;
    stingTraps(dt);
    G.interactTarget = p.st === 'dead' ? null : nearestInteract();

    if (G.state === 'dead') return;
    if (G.phase === 'enter' && G.phaseT > 1.8) { G.phase = 'play'; G.phaseT = 0; }
    if (G.portal) {
      G.portal.t += dt;
      if (G.phase !== 'portal' && p.st !== 'dead' && Math.hypot(p.x - G.portal.x, p.y - G.portal.y) < 14) {
        G.phase = 'portal'; G.phaseT = 0;
        SK.emit('portalEnter', G, G.stage);
      }
    }
    // G.hold: một mô-đun (chọn buff...) giữ người chơi ở cổng tới khi xong việc của nó.
    if (G.phase === 'portal' && G.phaseT > 0.8 && !G.hold) {
      if (G.stageIdx + 1 >= STAGES.length) { G.state = 'victory'; setOverlay('sk-win'); fillEnd('sk-win-info'); }
      else enterStage(G.stageIdx + 1);
    }
    if (p.st === 'dead' && p.stT > 1.3) { G.state = 'dead'; setOverlay('sk-over'); fillEnd('sk-over-info'); }
  }

  function stingTraps() {
    const p = G.player, o = W.obstacleAt(G.map, p.x, p.y - 2);
    if (o && o.kind === 'sting' && o.up) SK.hurtPlayer(G, (o.p && o.p.damage) || 2);
  }

  function fillEnd(id) {
    const p = G.player;
    SK.emit('runEnd', G, { won: id === 'sk-win', stage: G.stage.label, kills: G.kills, gold: p.gold });
    document.getElementById(id).textContent = 'Màn ' + G.stage.label + ' · Hạ ' + G.kills + ' quái · ' + p.gold + ' vàng';
  }

  // ---------------------------------------------------------------- camera + vẽ
  function camTarget() {
    const p = G.player, v = SK.view;
    const lead = p.target ? 14 : 6;
    return [p.x - v.w / 2 + Math.cos(p.aim) * lead, p.y - 10 - v.h / 2 + Math.sin(p.aim) * lead];
  }
  function snapCamera() { const [x, y] = camTarget(); G.cam.x = x; G.cam.y = y; }

  function render() {
    const ctx = SK.ctx, v = SK.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (SK.MODES[G.state]) { SK.MODES[G.state].render(ctx); return; }
    if (G.state === 'lobby') { SK.lobby.render(ctx); SK.hud.render(G); return; }
    if (!G.map) return;
    const [tx, ty] = camTarget();
    G.cam.x += (tx - G.cam.x) * 0.18; G.cam.y += (ty - G.cam.y) * 0.18;
    const sh = G.shake > 0 ? G.shake : 0;
    const cx = Math.round(G.cam.x + (Math.random() - 0.5) * sh), cy = Math.round(G.cam.y + (Math.random() - 0.5) * sh);
    G.view = { x: cx, y: cy };
    ctx.fillStyle = G.map.bg; ctx.fillRect(0, 0, v.w, v.h);
    ctx.translate(-cx, -cy);
    const cam = { x: cx, y: cy };
    W.drawFloor(ctx, G.map, cam, v.w, v.h);
    if (G.portal) drawPortalGlow(ctx, G.portal);
    SK.drawFx(ctx, G, true);

    const p = G.player;
    SK.drawShadow(ctx, p.h.shadow, p.x, p.y, null);
    for (const e of G.enemies) if (e.st !== 'spawn' && e.st !== 'dead' && onScreen(e, cam)) SK.drawShadow(ctx, e.d.shadow, e.x, e.y, e.d.shadowOff, e.scale);

    const list = [];
    W.collect(list, G.map, cam, v.w, v.h, G.t);
    for (const e of G.enemies) if (onScreen(e, cam)) list.push({ y: e.st === 'dead' ? e.y - 1000 : e.y, fn: (c, a, b) => SK.drawEnemy(c, a, b), a: G, b: e });
    for (const k of G.pickups) list.push({ y: k.y - 0.2, fn: (c, a, b) => SK.drawPickup(c, a, b), a: G, b: k });
    for (const it of G.items) list.push({ y: it.y, fn: drawItem, a: G, b: it });
    for (const c of G.chests) list.push({ y: c.y, fn: drawChest, a: G, b: c });
    // G.props: vật do mô-đun khác đặt (lái buôn, tượng, trụ súng...): {x, y, draw(ctx, G, pr), update?, gone?}
    for (const pr of G.props) list.push({ y: pr.y, fn: (c, a, b) => b.draw(c, a, b), a: G, b: pr });
    if (G.portal) list.push({ y: G.portal.y - 30, fn: drawPortal, a: G, b: G.portal });
    list.push({ y: p.y, fn: (c, a) => SK.drawPlayer(c, a), a: G, b: null });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.fn(ctx, it.a, it.b);

    SK.drawBullets(ctx, G);
    SK.drawFx(ctx, G, false);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    SK.hud.render(G);
  }
  function onScreen(e, cam) { const v = SK.view; return e.x > cam.x - 48 && e.x < cam.x + v.w + 48 && e.y > cam.y - 32 && e.y < cam.y + v.h + 64; }

  function drawItem(ctx, G2, it) {
    const bob = Math.round(Math.sin(it.t * 3) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 8, 2, 0, 0, Math.PI * 2); ctx.fill();
    SK.drawGun(ctx, DS.weapons[it.id].sprite, it.x - 6, it.y - 6 + bob, 0, null, {});
  }

  function drawChest(ctx, G2, c) {
    if (c.kind === 'weapon') {
      const pf = SK.art.object('chest_weapon');
      const k = c.open ? Math.min(1, c.openT / 0.3) : 0;
      const ok = SK.drawPrefab(ctx, pf, c.x, c.y, {
        t: c.t,
        skip: q => /^\/button/.test(q.n) || (c.open ? /^\/light\d_off/.test(q.n) : /^\/light\d_on/.test(q.n)),
        dx: q => q.n.startsWith('/L') ? -Math.round(k * 12) : q.n.startsWith('/R') ? Math.round(k * 12) : 0
      });
      if (!ok) { ctx.fillStyle = '#8a6a3a'; ctx.fillRect(c.x - 16, c.y - 20, 32, 20); }
    } else {
      const pf = SK.art.object('chest_reward');
      const ok = SK.drawPrefab(ctx, pf, c.x, c.y, {
        t: c.t, state: 'chest_idle',
        skip: q => c.open ? q.n === '/body' : /^\/box0/.test(q.n)
      });
      if (!ok) { ctx.fillStyle = c.open ? '#6a5a3a' : '#b08a4a'; ctx.fillRect(c.x - 10, c.y - 16, 20, 16); }
    }
  }

  function drawPortalGlow(ctx, pt) {
    const g = ctx.createRadialGradient(pt.x, pt.y - 20, 2, pt.x, pt.y - 20, 34);
    g.addColorStop(0, 'rgba(90,170,255,0.45)'); g.addColorStop(1, 'rgba(40,90,255,0)');
    ctx.fillStyle = g; ctx.fillRect(pt.x - 40, pt.y - 60, 80, 80);
  }
  function drawPortal(ctx, G2, pt) {
    const pf = SK.art.object('portal');
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // Khung transfer_gate vẽ ở 32 px/đơn vị trong Unity: thu nửa cho khớp lưới 16 px.
    const ok = SK.drawPrefab(ctx, pf, pt.x, pt.y, { t: pt.t, state: 'transfer_gate', scale: 0.5 });
    ctx.restore();
    if (!ok) {
      ctx.strokeStyle = '#6ab8ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(pt.x, pt.y - 20, 12, 18, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- khởi động
  SK.boot = function () {
    const cv = document.getElementById('sk-view'), hud = document.getElementById('sk-hud');
    SK.ctx = cv.getContext('2d');
    SK.hudCtx = hud.getContext('2d');
    const fit = () => SK.resize(cv, hud);
    fit(); addEventListener('resize', fit);
    SK.bindPointer(hud, (x, y) => SK.hud.hitButton(x, y));
    document.getElementById('sk-start').onclick = () => startRun();
    document.getElementById('sk-retry').onclick = () => SK.lobby.enter();
    document.getElementById('sk-win-retry').onclick = () => SK.lobby.enter();
    SK.loadArt().then(() => {
      document.body.classList.add('ready');
      SK.lobby.enter();
      SK.startLoop(step, render);
    });
  };

  // ---------------------------------------------------------------- móc cho kiểm thử
  function aliveEnemies() { return G.enemies.filter(e => e.st !== 'dead'); }
  function tpTo(r) {
    const [cx, cy] = W.roomCenter(r);
    const off = r.type === 'end' ? 3 * T : 0;
    const [x, y] = freeNear([cx, cy + off]);
    G.player.x = x; G.player.y = y;
    snapCamera();
  }
  window.SK_GAME = {
    get state() { return G.state; },
    get phase() { return G.phase; },
    get stage() { return G.stage ? G.stage.label : null; },
    get player() {
      const p = G.player; if (!p) return null;
      return { x: p.x, y: p.y, hp: p.hp, hpMax: p.hpMax, armor: p.armor, armorMax: p.armorMax, energy: p.energy,
        energyMax: p.energyMax, gold: p.gold, st: p.st, face: p.face, aim: p.aim, weapon: p.weapons[p.cur].id,
        weapons: p.weapons.map(w => w && w.id), skillCd: p.skillCd, skillT: p.skillT, target: !!p.target };
    },
    get rooms() {
      return G.map ? G.map.rooms.map(r => ({ id: r.id, type: r.type, state: r.state, wave: r.wave, waves: r.waves.length,
        gx: r.gx, gy: r.gy, x: r.cx * T + 8, y: r.cy * T + 8, w: r.w, h: r.h, links: r.links.slice(), seen: r.seen,
        visited: r.visited, pattern: r.patternId || null })) : [];
    },
    get room() { return G.room ? G.room.id : null; },
    get enemyCount() { return aliveEnemies().length; },
    get enemyHp() { return aliveEnemies().reduce((s, e) => s + e.hp, 0); },
    get kills() { return G.kills; },
    get bullets() { return { p: G.bullets.filter(b => b.side === 'p').length, e: G.bullets.filter(b => b.side === 'e').length }; },
    doorBlocked(roomId) {
      const r = G.map.rooms[roomId]; const c = r.doors[0] && r.doors[0].cells[2];
      return c ? W.solidTile(G.map, c[0], c[1]) : null;
    },
    start() { if (G.state !== 'stage') startRun(); },
    debug: {
      clearRoom() {
        const r = G.room; if (!r || r.state !== 'locked') return false;
        for (const e of G.enemies) if (e.room === r && e.st !== 'dead') { e.st = 'dead'; e.hp = 0; e.stT = 9; }
        W.clearRoom(G, r);
        return true;
      },
      teleportTo(type, n) {
        const r = G.map.rooms.filter(x => x.type === type)[n || 0];
        if (!r) return false;
        tpTo(r); return true;
      },
      god(on) { if (G.player) G.player.god = on !== false; },
      stage(label) {
        const i = STAGES.findIndex(s => s.label === label);
        if (i < 0 || G.state !== 'stage') return false;
        enterStage(i); return true;
      },
      give(id) {
        if (!DS.weapons[id] || !G.player) return false;
        G.player.weapons[1] = SK.makeWeapon(id); G.player.cur = 1; return true;
      },
      seed(s) { SK.setSeed(s); }
    }
  };
})();
