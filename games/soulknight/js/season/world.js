// Season Mode: bản đồ thật (tilemap escape_terrain_init/scene1 8.6), va chạm, quái khỉ theo điểm sinh thật, rương,
// cổng rút lui, ụ chắn, cầu, điều tra, giải cứu, kho báu (SK.SEASON.world).
// Dữ liệu: data/season-data.js (tools/season/build_season.py); bảng luật: data/season-items.js (SK.SEASON.T).
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, T16 = SK.TILE, W = SK.world;
  const DATA = window.SK_SEASON && window.SK_SEASON.world;
  const SEASON = SK.SEASON = SK.SEASON || {};
  const SW = SEASON.world = {};
  if (!DATA) { SK.warnOnce('seasonData', 'season-data.js not loaded'); return; }
  const TB = () => SEASON.T || {};
  const inv = () => SEASON.inv;
  const L = (k, d) => (SEASON.L ? SEASON.L(k, d) : d || k);
  const PFX = 'sw:';
  const U = 16;                        // [ĐO] 1 đơn vị Unity = 16 px

  // ---------------------------------------------------------------- art: trang atlas riêng gắn vào SK.pages
  let artImg = null, artReady = false;
  (function () {
    const im = new Image();
    im.onload = () => { artImg = im; SW.ensureArt(); };
    im.onerror = () => SK.warnOnce('seasonArt', 'season world atlas not loaded');
    im.src = DATA.atlas.src + '?v=' + DATA.atlas.v;
  })();
  function tint(img, color, alpha) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  SW.ensureArt = function () {
    if (artReady) return true;
    if (!artImg || !SK.pages || !SK.pages.length) return false;
    const pi = SK.pages.length;
    SK.pages.push(artImg);
    SK.pagesWhite.push(tint(artImg, '#ffffff', 1));
    SK.pagesElite.push(tint(artImg, '#ff2a1a', 0.32));
    for (const [n, f] of Object.entries(DATA.atlas.f)) SK.A.f[PFX + n] = [pi, f[0], f[1], f[2], f[3], f[4], f[5]];
    artReady = true;
    return true;
  };
  const fr = n => PFX + n;
  const EX = () => (D.extra || {});
  const clipKey = n => (EX().clips || {})[n] || null;
  const pngKey = n => (EX().png || {})[n] || null;

  // ---------------------------------------------------------------- bản đồ tương thích SK.world
  const decode = s => s.replace(/(\D)(\d*)/g, (m, c, n) => c.repeat(n ? +n : 1));
  const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + (k || 0) * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
  const h01 = (x, y, k) => hash(x, y, k) / 4294967296;

  SW.buildMap = function (key) {
    const md = DATA.maps[key], N = md.W * md.H;
    const solid = decode(md.solid);
    const lay = {};
    for (const k in md.layers) lay[k] = decode(md.layers[k]);
    const map = {
      season: key, md, W: md.W, H: md.H, tiles: new Uint8Array(N), door: new Int16Array(N),
      rooms: [], obs: new Map(), doorCells: [], art: null, bg: '#8e9e3b', lay, solid,
      pxW: md.W * T16, pxH: md.H * T16, buildings: [], bunkers: []
    };
    for (let i = 0; i < N; i++) map.tiles[i] = solid[i] === '.' ? W.FLOOR : W.WALL;
    const built = (inv() && inv().state.bridges) || {};
    for (const b of md.bridges) if (built[b.id]) setBridge(map, b);
    return map;
  };
  function setBridge(map, b) {
    for (const [i, j] of b.walk) if (i >= 0 && j >= 0 && i < map.W && j < map.H) map.tiles[j * map.W + i] = W.FLOOR;
    b.built = true;
  }
  // tile 2x2 đơn vị: (cx, cy) chỉ số ô tilemap Unity; lớp lưu theo hàng từ trên xuống
  const layAt = (map, k, cx, cy) => {
    const md = map.md, i = cx - md.cx0, j = md.cy1 - 1 - cy;
    if (i < 0 || j < 0 || i >= md.CW || j >= md.CH) return false;
    return map.lay[k][j * md.CW + i] === '#';
  };
  const tilePx = (md, cx, cy) => [(2 * cx - md.x0) * U, (md.y1 - 2 * cy - 2) * U];
  const walkable = (map, x, y) => !W.solidAt(map, x, y) && !W.solidAt(map, x - 6, y) && !W.solidAt(map, x + 6, y) && !W.solidAt(map, x, y - 6);
  function freeNear(map, x, y) {
    for (let r = 0; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const px = x + dx * T16, py = y + dy * T16;
      if (walkable(map, px, py)) return [px, py];
    }
    return [x, y];
  }
  SW.freeNear = freeNear;

  // ---------------------------------------------------------------- vẽ nền
  // Cỏ phủ nền: bể 7 sprite grass_6 + grass_rand_0..5 không trọng số [ĐO EscapeBottomGroundTileFillArea.spritePool] -> chọn đều [SUY]
  // Đất / nước nông / nước sâu: dual grid, ô hiển thị nằm ở góc ô dữ liệu, chọn 1 trong 16 theo 4 ô quanh góc [ĐO DualGridTilemap]
  function drawGround(ctx, map, cam, vw, vh) {
    const md = map.md;
    const cxA = Math.floor((cam.x / U + md.x0) / 2) - 1, cxB = Math.floor(((cam.x + vw) / U + md.x0) / 2) + 1;
    const cyA = Math.floor((md.y1 - (cam.y + vh) / U) / 2) - 1, cyB = Math.floor((md.y1 - cam.y / U) / 2) + 1;
    const g = DATA.ground;
    for (let cy = cyA; cy <= cyB; cy++) for (let cx = cxA; cx <= cxB; cx++) {
      const [x, y] = tilePx(md, cx, cy);
      SK.draw(ctx, fr(g[hash(cx, cy, 2) % g.length]), x + 16, y + 16);
    }
    for (const [k, set] of [['dirt', 'dirt'], ['shallow', 'water_shallow'], ['deep', 'water_deep']]) {
      const subs = DATA.dual[set], rnd = DATA.dualRand[set];
      for (let cy = cyA; cy <= cyB + 1; cy++) for (let cx = cxA; cx <= cxB + 1; cx++) {
        const tl = layAt(map, k, cx - 1, cy), tr = layAt(map, k, cx, cy), bl = layAt(map, k, cx - 1, cy - 1), br = layAt(map, k, cx, cy - 1);
        if (!(tl || tr || bl || br)) continue;
        const idx = DATA.dualTable['' + (+tl) + (+tr) + (+bl) + (+br)];
        let f = subs[idx];
        if (idx === 6 && rnd && h01(cx, cy, 7) < 0.25) f = rnd[hash(cx, cy, 3) % rnd.length];   // [ĐOÁN 25%]
        SK.draw(ctx, fr(f), (2 * cx - md.x0) * U, (md.y1 - 2 * cy) * U);
      }
    }
    // cầu + sàn (không sắp theo y)
    for (const pr of md.props) if (!pr[4] && onScreen(pr[0], pr[1], cam, vw, vh)) SK.draw(ctx, fr(pr[2]), pr[0], pr[1], { flip: !!pr[3] });
    for (const b of md.bridges) if (b.built) for (const t of b.tiles) SK.draw(ctx, fr(t[2]), t[0], t[1], { flip: !!t[3] });
  }
  const onScreen = (x, y, cam, vw, vh) => x > cam.x - 90 && x < cam.x + vw + 90 && y > cam.y - 30 && y < cam.y + vh + 110;

  // Cây: mỗi ô TreeMap rải 1 cây ở 1 trong 16 ô lưới 0.5 đơn vị; ô ven rừng luôn có cây, ô trong rừng 80%
  // [ĐO EscapeTilemapRandomTileScatter: pool Tree_0 x1, Tree_1 x2, Tree_2 x3, nonEdgeCellSpriteProbability 0.8; vị trí ngẫu nhiên là ĐOÁN]
  function collectTrees(list, map, cam, vw, vh) {
    const md = map.md;
    const cxA = Math.floor((cam.x / U + md.x0) / 2) - 2, cxB = Math.floor(((cam.x + vw) / U + md.x0) / 2) + 2;
    const cyA = Math.floor((md.y1 - (cam.y + vh) / U) / 2) - 1, cyB = Math.floor((md.y1 - cam.y / U) / 2) + 4;
    for (let cy = cyA; cy <= cyB; cy++) for (let cx = cxA; cx <= cxB; cx++) {
      if (!layAt(map, 'tree', cx, cy)) continue;
      const edge = !layAt(map, 'tree', cx - 1, cy) || !layAt(map, 'tree', cx + 1, cy) || !layAt(map, 'tree', cx, cy - 1) || !layAt(map, 'tree', cx, cy + 1);
      if (!edge && h01(cx, cy, 11) >= DATA.treeP) continue;
      const h = hash(cx, cy, 12), sub = h & 15;
      const ux = 2 * cx + ((sub & 3) + 0.5) * 0.5, uy = 2 * cy + ((sub >> 2) + 0.5) * 0.5;
      const x = (ux - md.x0) * U, y = (md.y1 - uy) * U;
      list.push({ y, fn: drawTree, a: DATA.trees[DATA.treePool[(h >> 4) % DATA.treePool.length]], b: [x, y] });
    }
    // Bụi cỏ: mỗi ô GrassTilemap có grassP cơ hội mọc 1 bụi 'grass' ở 1 ô lưới 0.5 đơn vị [ĐO GrassTilemap scatter; vị trí ĐOÁN]
    for (let cy = cyA; cy <= cyB; cy++) for (let cx = cxA; cx <= cxB; cx++) {
      if (!layAt(map, 'grass', cx, cy) || h01(cx, cy, 21) >= (md.grassP || 0.5)) continue;
      const sub = hash(cx, cy, 22) & 15;
      const x = (2 * cx + ((sub & 3) + 0.5) * 0.5 - md.x0) * U, y = (md.y1 - 2 * cy - ((sub >> 2) + 0.5) * 0.5) * U;
      list.push({ y, fn: drawTree, a: DATA.grassDecor, b: [x, y] });
    }
  }
  function drawTree(ctx, sp, p) { SK.draw(ctx, fr(sp), p[0], p[1]); }

  // ---------------------------------------------------------------- khỉ: điểm sinh + chỉ số thật
  // [ĐO game_tbaiattribute] Hp/MoveSpeed/PhysicalAttack; [ĐO escape_tbescapeenemyspawnconfig] HpMultiplier, bể vũ khí,
  // FireDuration, AttackCd; [ĐO game_tbskill 6001-6006] SkillStartUp 0.75, SkillCd, SkillGcd, né cd 3, đổi vũ khí 4 s.
  const pickW = (list, ws) => {
    let tot = 0;
    for (let i = 0; i < list.length; i++) tot += ws && ws[i] != null ? ws[i] : 1;
    let r = SK.rand() * tot;
    for (let i = 0; i < list.length; i++) { r -= ws && ws[i] != null ? ws[i] : 1; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  };
  function enemyWeapon(itemId, wp) {
    const it = SEASON.itemDef(itemId), wid = it && it.weaponId;
    const d = DS.weapons[wid] || DS.weapons.bad_pistol;
    const melee = d.kind === 'melee';
    const f = SK.frame(d.sprite);
    return {
      item: itemId, id: wid, def: d, melee, cls: melee ? 'ESword01' : (d.pellets || 1) > 1 ? 'EGun002' : 'EGun001', sprite: d.sprite, at: [2, 6],
      gunPoint: [f ? f[3] - f[5] : 10, 0], fireMin: wp ? wp[1] : 1, fireMax: wp ? wp[2] : 1, atkCd: wp ? wp[3] : -1,
      period: Math.max(0.12, 1 / Math.max(0.3, d.rps || 2)),
      // [ĐO PhysicalAttack 1 x SkillDamageFactor 1.0] mọi viên đạn khỉ gây 1 sát thương (EscapeEnemyPlayerWeaponAdapter.ApplyBulletDamage ghi đè sát thương)
      p: { atk: 1, bullet_speed: Math.min(14, (d.bulletSpeed || 14) * 0.55), deviation: (d.spread || 4) / 2,
        count: d.pellets || 1, angle: d.pellets > 1 ? Math.max(6, (d.fan || 30) / d.pellets) : 0, bulletSize: 1, need_lock: 1 }
    };
  }
  const SPRITE_OF = pid => pid.replace('e_escape_', '');
  function makeMonkey(G, pt, x, y, cfgId) {
    const T = TB(), sc = T.spawns[cfgId];
    if (!sc) return null;
    const pid = sc.prefab, at = T.enemies[pid] || { hp: 40, speed: 4, skills: [[6001, 10]] }, k = SPRITE_OF(pid);
    let pool = pt && pt.weapons && pt.weapons.length ? pt.weapons : sc.weapons, ws = pt && pt.weapons && pt.weapons.length ? pt.weaponsW : sc.weaponsW;
    const ok = pool.map((w, i) => [w, ws[i]]).filter(([w]) => SEASON.itemDef(w[0]));
    const wpA = ok.length ? pickW(ok.map(q => q[0]), ok.map(q => q[1])) : ['weapon_010', 0.5, 0.5, 2];
    const skills = at.skills.map(s => s[0]);
    const elite = /elite|boss/.test(pid);
    let w2 = null;
    if (skills.indexOf(6006) >= 0 && ok.length > 1) { const rest = ok.filter(q => q[0] !== wpA); w2 = enemyWeapon(rest[SK.randi(0, rest.length - 1)][0][0], rest[0][0]); }
    const hp = Math.round(at.hp * (sc.hpx || 1));
    const e = {
      id: 'season_' + k, pid, cfg: cfgId, season: true, kind: k, d: { speed: at.speed, shadow: 'shadow3', hands: [[2, 6]] },
      p: { findTargetRange: at.find || 20, reward_rate: 0, kinematic: 0 },
      cls: 'SeasonMonkey', rawCls: 'SeasonMonkey', x, y, kx: 0, ky: 0, hp, hpMax: hp, face: SK.chance(0.5) ? 1 : -1, aim: 0,
      st: 'idle', stT: SK.randf(0.2, 1), t: SK.rand() * 2, cd: 0, room: {}, elite: false, flash: 0, big: elite,
      w: enemyWeapon(wpA[0], wpA), w2, weaponItem: wpA[0],
      anims: { idle: clipKey(k + '_idle'), run: clipKey(k + '_run'), dead: pngKey('season_dead_' + k) },
      dodgeAnim: clipKey(k + '_dodge'),
      r: 5, hb: { size: [14, 18], off: [0, 9] }, scale: 1, burst: 0,
      skills, ai: { mode: 'home', gcd: SK.randf(0.5, 1.5), scan: 0, dodgeCd: 1, sw: 4, home: [x, y] },
      alert: (pt ? pt.alert : 25) * U, vision: (pt ? pt.vision : 15) * U, group: pt ? pt.group : null,
      drop: pt ? pt.drop : 'enemy_minion'
    };
    if (e.dodgeAnim) e.draw = drawDodger;
    if (/elite/.test(pid)) e.drop = 'enemy_elite';
    return e;
  }
  SW.makeMonkey = makeMonkey;
  function drawDodger(ctx, G, e) {
    if (e.st === 'dodge') {
      const f = SK.animFrame(e.dodgeAnim, 0.25 - e.ai.dodgeT);
      SK.draw(ctx, f, e.x, e.y, { flip: e.face < 0 });
      return;
    }
    const d = e.draw; e.draw = null; SK.drawEnemy(ctx, G, e); e.draw = d;
  }
  const seesP = (G, e, range) => {
    const p = G.player;
    if (p.st === 'dead' || p.hidden) return false;
    return Math.hypot(p.x - e.x, p.y - e.y) < range && W.los(G.map, e.x, e.y - 6, p.x, p.y - 6);
  };
  function steer(G, e, tx, ty, spd, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 2) return true;
    const s = Math.min(d, spd * dt);
    if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1;
    if (SK.moveBox(G.map, e, dx / d * s, dy / d * s, e.r)) {
      // vướng cây: đi vòng sang một bên [ĐOÁN — game gốc có tìm đường EscapeSharedPathWindow]
      const sgn = e.ai.side || (e.ai.side = SK.chance(0.5) ? 1 : -1);
      if (SK.moveBox(G.map, e, -dy / d * s * sgn, dx / d * s * sgn, e.r)) e.ai.side = -sgn;
    }
    return false;
  }
  function alertGroup(G, e) {
    for (const o of G.enemies) {
      if (o === e || o.st === 'dead' || !o.ai || o.ai.mode !== 'home') continue;
      if ((o.group && o.group === e.group && Math.hypot(o.x - e.x, o.y - e.y) < e.alert) || Math.hypot(o.x - e.x, o.y - e.y) < 5 * U) o.ai.mode = 'fight';
    }
  }
  function fireOnce(G, e) {
    const w = e.w, fn = SK.EGUN[w.cls] || SK.EGUN.EGun001;
    fn(G, e);
    e.kick = 2;
    SK.emit('enemyFire', G, e);
  }
  SK.AI.SeasonMonkey = function (G, e, dt) {
    const a = e.ai, p = G.player, dist = Math.hypot(p.x - e.x, p.y - e.y), spd = (e.d.speed || 4) * U;
    a.gcd -= dt; a.dodgeCd -= dt; a.scan -= dt;
    if (e.hp < e.hpMax && a.mode === 'home') { a.mode = 'fight'; alertGroup(G, e); }
    if (a.mode === 'home') {
      if (a.scan <= 0) { a.scan = 0.3; if (seesP(G, e, e.vision)) { a.mode = 'fight'; alertGroup(G, e); SK.emit('seasonAlert', G, e); } }
      e.stT -= dt;
      if (e.st === 'move') { if (steer(G, e, a.wx, a.wy, spd * 0.5, dt) || e.stT <= 0) { e.st = 'idle'; e.stT = SK.randf(1, 3); } }
      else if (e.stT <= 0) {
        const ang = SK.rand() * Math.PI * 2, r = SK.randf(8, 40);
        a.wx = a.home[0] + Math.cos(ang) * r; a.wy = a.home[1] + Math.sin(ang) * r;
        e.st = 'move'; e.stT = 3;
      }
      return;
    }
    if (a.mode === 'return') {
      e.st = 'move';
      if (steer(G, e, a.home[0], a.home[1], spd, dt)) { a.mode = 'home'; e.st = 'idle'; e.stT = 1; }
      if (a.scan <= 0) { a.scan = 0.3; if (seesP(G, e, e.vision)) a.mode = 'fight'; }
      return;
    }
    // chiến đấu
    if (p.st === 'dead' || dist > e.alert * 1.2 || Math.hypot(e.x - a.home[0], e.y - a.home[1]) > e.alert * 1.6) { a.mode = 'return'; a.act = null; return; }
    if (e.w2 && (a.sw -= dt) <= 0) { a.sw = 4; const t = e.w; e.w = e.w2; e.w2 = t; }
    if (e.st === 'dodge') {
      a.dodgeT -= dt;
      SK.moveBox(G.map, e, Math.cos(a.dodgeA) * 150 * dt, Math.sin(a.dodgeA) * 150 * dt, e.r);
      if (a.dodgeT <= 0) { e.st = 'idle'; }
      return;
    }
    if (e.skills.indexOf(6005) >= 0 && a.dodgeCd <= 0 && !a.act) {
      const b = G.bullets.find(q => q.side === 'p' && !q.dead && !q.vis && Math.hypot(q.x - e.x, q.y - e.y + 8) < 44);
      if (b) {
        a.dodgeCd = 3;                                               // [ĐO skill 6005 SkillCd 3]
        e.st = 'dodge'; a.dodgeT = 0.25;
        a.dodgeA = Math.atan2(b.vy, b.vx) + (SK.chance(0.5) ? 1 : -1) * Math.PI / 2;
        e.face = Math.cos(a.dodgeA) >= 0 ? 1 : -1;
        return;
      }
    }
    const act = a.act;
    const sees = seesP(G, e, 22 * U);
    const aimAt = () => { const [hx, hy] = [e.x + e.w.at[0] * e.face, e.y - e.w.at[1]]; e.aim = Math.atan2(p.y - 7 - hy, p.x - hx); if (Math.abs(p.x - e.x) > 1) e.face = p.x > e.x ? 1 : -1; };
    if (!act) {
      if (e.w.melee) { a.act = { k: 'melee', t: 0 }; return; }
      if (a.gcd > 0) {
        // giữa hai đòn: tiến lại nếu không thấy người chơi
        if (!sees || dist > 14 * U) { e.st = 'move'; steer(G, e, p.x, p.y, spd, dt); } else { e.st = 'idle'; aimAt(); }
        return;
      }
      const opts = e.skills.filter(s => s === 6001 || s === 6002 || s === 6003);
      const ws = opts.map(s => (TB().enemies[e.pid].skills.find(q => q[0] === s) || [0, 10])[1]);
      const sid = opts.length ? pickW(opts, ws) : 6001;
      const sk = TB().skills[sid] || { startup: 0.75, gcd: 3, cd: 1 };
      a.act = { k: sid, t: 0, startup: sk.startup, gcd: sk.gcd, fire: SK.randf(e.w.fireMin, e.w.fireMax), shotT: 0, side: SK.chance(0.5) ? 1 : -1 };
      return;
    }
    act.t += dt;
    if (act.k === 'melee') {
      aimAt();
      if (dist > 22) { e.st = 'move'; steer(G, e, p.x, p.y, spd, dt); }
      else if (!act.cool || act.t >= act.cool) {
        e.st = 'attack'; SK.EGUN.ESword01(G, e); SK.emit('enemyFire', G, e);
        act.cool = act.t + Math.max(0.5, e.w.atkCd > 0 ? e.w.atkCd * 0.5 : e.w.period);
      }
      if (act.t > 6) a.act = null;
      return;
    }
    // đòn tầm xa: 6001 đứng bắn, 6002 vừa lùi vừa bắn (thả diều), 6003 vòng qua vật cản áp sát rồi bắn
    if (act.k === 6003 && (!sees || dist > 9 * U) && act.t < 3) { e.st = 'move'; steer(G, e, p.x, p.y, spd, dt); act.t = Math.min(act.t, 0.01); return; }
    if (act.t < act.startup) { e.st = 'aim'; aimAt(); return; }
    const ft = act.t - act.startup;
    if (ft < act.fire) {
      e.st = 'attack'; aimAt();
      if (act.k === 6002) {
        const ang = Math.atan2(e.y - p.y, e.x - p.x) + act.side * 1.2;
        SK.moveBox(G.map, e, Math.cos(ang) * spd * 0.6 * dt, Math.sin(ang) * spd * 0.6 * dt, e.r);
      }
      act.shotT -= dt;
      if (act.shotT <= 0 && sees) { act.shotT = e.w.period; fireOnce(G, e); }
      return;
    }
    // [ĐO] AttackCd của vũ khí (-1 = dùng SkillCd) rồi SkillGcd
    const cd = e.w.atkCd > 0 ? e.w.atkCd : (TB().skills[act.k] || { cd: 1 }).cd;
    a.gcd = Math.max(cd, act.gcd * 0.5);
    a.act = null;
    e.st = 'idle';
  };

  // ---------------------------------------------------------------- rương / hộp chứa
  const CHEST_LOC = {
    chest_resource: 'esc_box_chest_resource', chest_resource_s: 'esc_box_chest_resource', chest_food: 'esc_box_chest_food',
    chest_food_s: 'esc_box_chest_food', chest_medical: 'esc_box_chest_medical', chest_medical_s: 'esc_box_chest_medical',
    chest_misc: 'esc_box_chest_misc', chest_misc_s: 'esc_box_chest_misc', chest_munitions: 'esc_box_chest_munitions',
    chest_tool: 'esc_box_tool', chest_tool_s: 'esc_box_tool', chest_treasure: 'esc_box_treasure',
    enemy_drop_minion: 'esc_box_enemy_drop', enemy_drop_elite: 'esc_box_chest_elite', enemy_drop_boss: 'esc_box_enemy_drop_boss',
    chest_temp: 'esc_interaction_temp_box'
  };
  function makeChest(G, chestId, x, y, o) {
    const prefab = (TB().chestPrefab || {})[chestId] || (o && o.prefab) || 'chest_resource_s';
    const pf = DATA.chests[prefab] || DATA.chests.chest_resource_s || {};
    return Object.assign({ chestId, prefab, x, y, open: false, t: SK.rand() * 3, openT: 0, box: null, spr: pf, slots: pf.slots || 8,
      name: L(CHEST_LOC[prefab], 'Rương') }, o || {});
  }
  SW.makeChest = makeChest;
  function openChest(G, c) {
    const S = G.season, I = inv();
    if (!c.box) {
      const stacks = c.kind === 'temp' || c.kind === 'death' ? c.stacks : SEASON.loot(c.chestId, { weapon: c.weapon });
      const slots = new Array(Math.max(c.slots, stacks.length)).fill(null);
      stacks.forEach((s, i) => { slots[i] = s; });
      c.box = { name: c.name, kind: c.kind || 'chest', slots, chest: c };
      if (c.kind === 'death' && I.state.deathBox) I.state.deathBox.slots = slots;
    }
    if (!c.open) {
      c.open = true; c.openT = 0;
      if (SK.vfx && SK.vfx.has && SK.vfx.has('effect_open_chest')) SK.vfx.spawn(G, 'effect_open_chest', c.x, c.y - 6);
      SK.emit('seasonLoot', G, c);
    }
    I.openBox(c.box);
    const ui = SEASON.ui;
    if (ui && ui.open) ui.open('bag', 'box');
    S.lastBox = c;
  }
  SW.openChest = openChest;
  const boxEmpty = c => c.box && c.box.slots.every(s => !s);

  // ---------------------------------------------------------------- vào bản đồ
  function resetWorld(G, key) {
    G.map = SW.buildMap(key);
    G.enemies = []; G.bullets = []; G.pickups = []; G.fx = []; G.nums = []; G.items = []; G.chests = []; G.interactables = []; G.props = [];
    if (G.vfx && SK.vfx) SK.vfx.clear(G);
    G.room = null; G.portal = null; G.banner = null;
    const S = G.season;
    S.map = key; S.crates = []; S.gates = []; S.npcs = []; S.extract = null; S.rescue = []; S.investigate = []; S.treasure = null;
    S.followers = S.followers || [];
    const md = DATA.maps[key];
    for (const b of md.bunkers) addBunker(G.map, b);
    for (const g of md.gates) S.gates.push(Object.assign({ t: 0, hold: 0 }, g));
    if (inv()) inv().closeBox();
  }
  function addBunker(map, b) {
    const o = { kind: 'box', bunker: true, hp: b.hp, hpMax: b.hp, x: b.x, y: b.y, parts: b.parts, cells: [], flash: 0, name: 'bunker' };
    const [bx, by, bw, bh] = b.box;
    for (let j = Math.floor(by / T16); j < Math.ceil((by + bh) / T16); j++)
      for (let i = Math.floor(bx / T16); i < Math.ceil((bx + bw) / T16); i++) {
        if (i < 0 || j < 0 || i >= map.W || j >= map.H) continue;
        const k = j * map.W + i;
        if (map.tiles[k] !== W.FLOOR) continue;
        map.tiles[k] = W.WALL; map.obs.set(k, o); o.cells.push(k);
      }
    if (o.cells.length) { o.tx = o.cells[0] % map.W; o.ty = Math.floor(o.cells[0] / map.W); }
    map.bunkers.push(o);
  }
  SK.on('obstacleBreak', (G, o) => {
    if (!o || !o.bunker || !G.map) return;
    for (const k of o.cells) { G.map.obs.delete(k); G.map.tiles[k] = W.FLOOR; }
    o.dead = true;
  });

  const HERO_FOLDER = { 1: 'ranger', 2: 'mage', 3: 'assassin', 4: 'alchemist', 5: 'engineer', 6: 'vampire', 10: 'priest' };
  const FOLDER_NPC = { ranger: 'esc_npc_ranger', mage: 'esc_npc_mage', assassin: 'esc_npc_assassin', alchemist: 'esc_npc_alchemist',
    engineer: 'esc_npc_engineer', vampire: 'esc_npc_vampire', priest: 'esc_npc_priest' };
  const nodeOfNpc = id => { const n = (TB().npcs || {})[id]; return id === 'esc_npc_explorer' ? 'rescued_esc_npc_explorer' : 'rescued_' + (n ? n.prefab : id); };
  SW.nodeOfNpc = nodeOfNpc;

  SW.enterBase = function (G, at) {
    resetWorld(G, 'base');
    const md = DATA.maps.base, S = G.season, I = inv();
    for (const b of md.buildings) {
      const lv = buildingLevel(b.id);
      if (lv <= 0) continue;
      G.map.buildings.push(b);
      for (const [i, j] of b.solidCells || []) if (i >= 0 && j >= 0 && i < G.map.W && j < G.map.H) G.map.tiles[j * G.map.W + i] = W.WALL;
    }
    for (const n of md.npcs) {
      if (n.need.length && !n.need.every(k => I.node(k))) continue;
      S.npcs.push({ id: n.id, x: n.x, y: n.y, prefab: n.prefab, t: SK.rand() * 2, face: -1, name: npcName(n.id) });
    }
    const spot = at === 'portal' ? [md.gates[0].x, md.gates[0].y + 40] : md.spawn;
    const [sx, sy] = freeNear(G.map, spot[0], spot[1]);
    G.player.x = sx; G.player.y = sy;
    S.followers = [];
  };
  function buildingLevel(id) {
    if (id === 'DesignTable' || id === 'Researcher') return 1;
    const I = inv();
    return I ? I.buildLevel(id) : 1;
  }
  SW.buildingLevel = buildingLevel;
  const npcName = id => ((TB().npcs || {})[id] || {}).name || id;

  SW.enterExpedition = function (G) {
    resetWorld(G, 's1');
    const md = DATA.maps.s1, S = G.season, I = inv();
    const entry = md.entry || [md.gates[0].x, md.gates[0].y + 40];
    const [ex, ey] = freeNear(G.map, entry[0], entry[1]);
    G.player.x = ex; G.player.y = ey;
    // [ĐO] 27 điểm rương, spawnOnStart = 1: rương có sẵn khi vào
    for (const c of md.chests) {
      const [cx, cy] = freeNear(G.map, c.x, c.y);
      S.crates.push(makeChest(G, c.id, cx, cy));
    }
    // [ĐO] 49 điểm sinh quái, mỗi điểm một con theo bể cấu hình của điểm
    for (const pt of md.enemies) {
      const cfg = pickW(pt.cfg, pt.cfgW);
      const [x, y] = freeNear(G.map, pt.x, pt.y);
      const e = makeMonkey(G, pt, x, y, cfg);
      if (e) G.enemies.push(e);
    }
    // Rương Tử Vong của lần chết trước (còn 1 cơ hội)
    const db = I.state.deathBox;
    if (db && db.map === 's1' && db.slots.some(Boolean)) {
      const [x, y] = freeNear(G.map, db.x, db.y);
      S.crates.push(makeChest(G, 'death', x, y, { kind: 'death', prefab: 'chest_temp', stacks: db.slots, name: L('esc_map_icon_lost_item', 'Vật Thất Lạc'),
        spr: { closed: DATA.misc.Box_1, open: DATA.misc.Box_1 } }));
    }
    for (const r of md.rescue) {
      const npc = r.npc || FOLDER_NPC[HERO_FOLDER[r.hero]];
      if (!npc || I.node(nodeOfNpc(npc))) continue;
      if (npc === 'esc_npc_explorer' && !(SEASON.quests && SEASON.quests.isAccepted && SEASON.quests.isAccepted(10005))) continue;
      S.rescue.push({ x: r.x, y: r.y, npc, folder: HERO_FOLDER[r.hero] || null, t: SK.rand() * 2, face: -1, name: npcName(npc), freed: false });
    }
    S.followers = [];
    for (const a of md.investigate) S.investigate.push(Object.assign({ hold: 0, done: false, t: 0 }, a));
    S.bridgesMd = md.bridges;
  };

  // ---------------------------------------------------------------- tương tác
  // Trigger của Unity chạm collider người chơi chứ không phải tâm; nới 16 px để đứng sát tường nhà vẫn mở được
  const TRIG_PAD = 16;
  const inRect = (p, r) => r && p.x >= r[0] - TRIG_PAD && p.x <= r[0] + r[2] + TRIG_PAD && p.y >= r[1] - TRIG_PAD && p.y <= r[1] + r[3] + TRIG_PAD;
  SW.nearestInteract = function (G) {
    const p = G.player, S = G.season;
    let best = null, bd = 1e9;
    const consider = (d, reach, o) => { if (d < reach && d - reach < bd) { bd = d - reach; best = o; } };
    for (const b of G.map.buildings) {
      if (inRect(p, b.trig) || Math.hypot(b.x - p.x, b.y - p.y) < 30) consider(Math.hypot(b.x - p.x, b.y - p.y) - 60, 1, { x: b.x, y: b.y - 58, label: b.name, kind: b.id, use: () => useBuilding(G, b) });
    }
    for (const n of S.npcs) consider(Math.hypot(n.x - p.x, n.y - p.y), 26, { x: n.x, y: n.y - 34, label: n.name, kind: 'npc', use: () => talkNpc(G, n) });
    for (const c of S.crates) {
      if (c.gone || (c.open && boxEmpty(c) && c.kind !== 'chest')) continue;
      consider(Math.hypot(c.x - p.x, c.y - p.y), 24, { x: c.x, y: c.y - 30, label: (c.open ? 'Xem ' : 'Mở ') + c.name, kind: 'crate', use: () => openChest(G, c) });
    }
    for (const r of S.rescue) if (!r.freed) consider(Math.hypot(r.x - p.x, r.y - p.y), 26, { x: r.x, y: r.y - 34, label: 'Giải cứu ' + r.name, kind: 'rescue', use: () => freeHero(G, r) });
    for (const b of G.map.md.bridges) {
      if (b.built) continue;
      consider(Math.hypot(b.x - p.x, b.y - p.y), 36, { x: b.x, y: b.y - 20, label: 'Xây cầu', kind: 'bridge', use: () => { const ui = SEASON.ui; if (ui && ui.openBridge) ui.openBridge(b); } });
    }
    if (S.treasure && !S.treasure.dug) consider(Math.hypot(S.treasure.x - p.x, S.treasure.y - p.y), 24, { x: S.treasure.x, y: S.treasure.y - 26, label: 'Đào kho báu', kind: 'dig', use: () => { S.treasure.digging = true; } });
    return best;
  };
  function useBuilding(G, b) {
    const ui = SEASON.ui;
    if (!ui || !ui.open) return;
    const I = inv();
    I.atWorkshop = b.id === 'Workshop';
    if (b.id === 'Warehouse') ui.open('bag', 'warehouse');
    else if (b.id === 'Shop') ui.open('bag', 'store');
    else if (b.id === 'DesignTable') ui.open('bag', 'design');
    else if (b.id === 'Researcher') ui.open('bag', 'training');
    else if (b.id === 'Workshop' || b.id === 'Kitchen' || b.id === 'Medical') ui.open('bag', 'craft:' + b.id);
    else if (b.id === 'Tent') G.toast(L('esc_building_tent_effect', 'Đổi nhân vật') + ' — bản web: chọn nhân vật ở sảnh', 2.5);
    else G.toast(L('esc_building_teleporter_desc', 'Dịch chuyển đến Đèn Hiệu') + ' — chưa có Đèn Hiệu nào ở Vành Đai Căn Cứ', 2.5);
  }
  function talkNpc(G, n) {
    const ui = SEASON.ui;
    if (ui && ui.openQuest) ui.openQuest(n.id);
  }
  function freeHero(G, r) {
    r.freed = true;
    G.season.followers.push(r);
    G.toast(L('esc_rescue_talk_0', 'Mau đưa tôi rời khỏi đây...'), 2.5);
    SK.emit('seasonFree', G, r.npc);
  }

  // ---------------------------------------------------------------- kho báu [ĐO EscapeTreasureMapConfig: vị trí + sự kiện đào theo trọng số]
  SW.revealTreasure = function (G, itemId) {
    const S = G.season;
    if (!S || S.map !== 's1') return 'Chỉ dùng được ngoài bản đồ';
    if (S.treasure && !S.treasure.dug) return 'Đang có một điểm kho báu chưa đào';
    const list = DATA.maps.s1.treasure;
    const [x, y] = list[SK.randi(0, list.length - 1)];
    S.treasure = { x, y, item: itemId, hold: 0, dug: false, t: 0 };
    G.toast('Đã đánh dấu điểm kho báu trên bản đồ', 2.5);
    return null;
  };
  function digTreasure(G) {
    const S = G.season, tr = S.treasure;
    tr.dug = true;
    const ent = (TB().treasure || []).find(e => e.item === tr.item) || (TB().treasure || [])[0];
    const ev = pickW(ent.events, ent.events.map(e => e[2]));
    G.toast(L(ev[1], 'Đào xong'), 3);
    const m = /^Chest_(rare_)?(\d+)$/.exec(ev[0]);
    if (m) {
      const cid = 'treasure_map_' + (m[1] ? 'rare_' : '') + m[2];
      if ((TB().chests || {})[cid]) { const [x, y] = freeNear(G.map, tr.x, tr.y + 8); const c = makeChest(G, cid, x, y); S.crates.push(c); }
    } else if (ev[0] === 'Enemy10') {
      for (let i = 0; i < 2; i++) { const [x, y] = freeNear(G.map, tr.x + SK.randf(-40, 40), tr.y + SK.randf(-30, 30)); const e = makeMonkey(G, null, x, y, 'scene1_macaque_1'); if (e) { e.ai.mode = 'fight'; G.enemies.push(e); } }
    } else if (ev[0] === 'sting') inv().selfDamage(G, 2);          // [ĐOÁN sát thương bẫy]
    else if (ev[0] === 'Gas') inv().selfDamage(G, 1);
    else if (/explode/.test(ev[0])) { SK.hurtPlayer(G, 4, tr.x, tr.y); G.shake = 6; }
  }

  // ---------------------------------------------------------------- mỗi bước
  // Trả 'extract' khi đứng đủ giờ ở điểm rút lui / cổng về căn cứ, 'portal' khi đứng đủ giờ ở cổng ra bản đồ.
  SW.update = function (G, dt) {
    const p = G.player, S = G.season;
    for (const c of S.crates) { c.t += dt; if (c.open) c.openT += dt; }
    for (const n of S.npcs) { n.t += dt; if (Math.abs(p.x - n.x) > 2) n.face = p.x > n.x ? 1 : -1; }
    for (const r of S.rescue) r.t += dt;
    for (const b of G.map.bunkers) b.flash = Math.max(0, b.flash - dt);
    // người được giải cứu đi theo
    S.followers.forEach((f, i) => {
      const tx = p.x - p.face * (16 + i * 12), ty = p.y + 4;
      const d = Math.hypot(tx - f.x, ty - f.y);
      f.moving = d > 6;
      if (d > 220) { f.x = tx; f.y = ty; }
      else if (f.moving) { const s = Math.min(d, 80 * dt * (d > 60 ? 2 : 1)); f.x += (tx - f.x) / d * s; f.y += (ty - f.y) / d * s; f.face = tx > f.x ? 1 : -1; }
    });
    for (const e of G.enemies) {
      const far = Math.abs(e.x - p.x) > 520 || Math.abs(e.y - p.y) > 380;
      if (!far || e.st === 'dead' || (e.ai && e.ai.mode !== 'home')) SK.updateEnemy(G, e, dt);
    }
    let out = null, inGate = null;
    for (const g of S.gates) {
      g.t += dt;
      const inside = p.st !== 'dead' && Math.abs(p.x - g.x) < 24 && p.y > g.y - 40 && p.y < g.y + 8;   // [ĐO] hộp kích hoạt 3x3 đơn vị lệch (0,1)
      if (inside && g.kind !== 'zone') inGate = g;
      g.inside = inside;
    }
    if (inGate) {
      if (!S.extract || S.extract.at !== inGate) S.extract = { at: inGate, t: 0, dur: inGate.dur };
      S.extract.t += dt;
      if (S.extract.t >= inGate.dur) out = inGate.kind === 'deploy' ? 'portal' : 'extract';
    } else S.extract = null;
    // điều tra khu vực: đứng trong vòng 2 giây [ĐO InvestigationArea.interactionTime 2.0]
    const Q = SEASON.quests;
    for (const a of S.investigate) {
      a.t += dt;
      a.active = !a.done && Q && Q.wantsArea && Q.wantsArea(a.id);
      if (!a.active) continue;
      if (Math.hypot(p.x - a.x, p.y - a.y) < 32 && p.st !== 'dead') {
        a.hold += dt;
        if (a.hold >= 2) { a.done = true; G.toast(L('esc_investigation_complete', 'Đã điều tra xong'), 2.5); SK.emit('seasonInvestigate', G, a.id); }
      } else a.hold = Math.max(0, a.hold - dt);
    }
    // đào kho báu 1.5 giây [ĐO EscapeTreasureDigSite.interactDuration]
    const tr = S.treasure;
    if (tr && !tr.dug) {
      tr.t += dt;
      if (tr.digging && Math.hypot(p.x - tr.x, p.y - tr.y) < 28) { tr.hold += dt; if (tr.hold >= 1.5) digTreasure(G); }
      else { tr.digging = false; tr.hold = 0; }
    }
    // rương hộp đã lấy sạch: rương tạm/rương tử vong biến mất
    const I = inv();
    for (const c of S.crates) if ((c.kind === 'temp' || c.kind === 'death') && c.box && boxEmpty(c) && I.box !== c.box) {
      c.gone = true;
      if (c.kind === 'death') I.state.deathBox = null;
    }
    S.crates = S.crates.filter(c => !c.gone);
    // đi xa khỏi rương đang mở thì đóng
    if (I.box && I.box.chest && Math.hypot(I.box.chest.x - p.x, I.box.chest.y - p.y) > 48) { I.closeBox(); if (SEASON.ui && SEASON.ui.mode === 'box') SEASON.ui.close(); }
    return out;
  };

  SK.on('enemyKill', (G, e) => {
    if (!e.season || G.state !== 'season') return;
    // [ĐO EscapeEnemySpawnAttribute.deathDropChestId] rương quái + vũ khí nó cầm
    const [x, y] = freeNear(G.map, e.x, e.y + 4);
    G.season.crates.push(makeChest(G, e.drop || 'enemy_minion', x, y, { weapon: e.weaponItem, from: e.kind }));
    SK.emit('seasonKill', G, e);
  });
  // Vứt đồ: Rương Tạm Thời dưới chân (gộp vào rương tạm gần đó)
  SK.on('seasonDrop', (G, st) => {
    if (!G || G.state !== 'season' || !G.season || !st || !G.player) return;
    const p = G.player, S = G.season;
    let c = S.crates.find(q => q.kind === 'temp' && Math.hypot(q.x - p.x, q.y - p.y) < 24 && q.box && q.box.slots.indexOf(null) >= 0);
    if (!c) {
      const [x, y] = freeNear(G.map, p.x + p.face * 12, p.y + 6);
      c = makeChest(G, 'temp', x, y, { kind: 'temp', prefab: 'chest_temp', stacks: [], slots: 20, spr: { closed: DATA.misc.Box_1, open: DATA.misc.Box_1 } });
      c.open = true;
      c.box = { name: c.name, kind: 'temp', slots: new Array(20).fill(null), chest: c, seen: [] };
      S.crates.push(c);
    }
    c.box.slots[c.box.slots.indexOf(null)] = st;
  });

  // ---------------------------------------------------------------- vẽ
  SW.render = function (ctx, G, cam, vw, vh) {
    SW.ensureArt();
    const map = G.map, S = G.season, md = map.md;
    drawGround(ctx, map, cam, vw, vh);
    for (const g of S.gates) drawGateGround(ctx, G, g);
    for (const a of S.investigate) if (a.active) drawInvestigate(ctx, a);
    if (S.treasure && !S.treasure.dug) drawDig(ctx, S.treasure);
    SK.drawFx(ctx, G, true);
    const p = G.player;
    if (p.st !== 'dead') SK.drawShadow(ctx, p.h.shadow, p.x, p.y, null);
    const on = (x, y) => onScreen(x, y, cam, vw, vh);
    for (const e of G.enemies) if (e.st !== 'dead' && on(e.x, e.y)) SK.drawShadow(ctx, e.d.shadow, e.x, e.y - 3, null, e.scale);

    const list = [];
    collectTrees(list, map, cam, vw, vh);
    for (const pr of md.props) if (pr[4] && on(pr[0], pr[1])) list.push({ y: pr[1], fn: drawProp, a: null, b: pr });
    for (const d of md.decor) if (on(d[0], d[1])) list.push({ y: d[1] + (d[2] === DATA.misc.weapons3_102 ? 0 : -4), fn: drawProp, a: null, b: d });
    for (const b of map.buildings) if (b.sprite && on(b.x, b.y - 40)) list.push({ y: b.sprite[1], fn: drawProp, a: null, b: b.sprite });
    for (const b of map.bunkers) if (!b.dead && on(b.x, b.y)) list.push({ y: b.y, fn: drawBunker, a: G, b });
    for (const n of S.npcs) if (on(n.x, n.y)) list.push({ y: n.y, fn: drawNpc, a: G, b: n });
    for (const r of S.rescue) if (on(r.x, r.y)) list.push({ y: r.y, fn: drawNpc, a: G, b: r });
    for (const e of G.enemies) if (on(e.x, e.y)) list.push({ y: e.st === 'dead' ? e.y - 1000 : e.y, fn: (c, a, b) => SK.drawEnemy(c, a, b), a: G, b: e });
    for (const c of S.crates) if (on(c.x, c.y)) list.push({ y: c.y, fn: drawCrate, a: G, b: c });
    for (const k of G.pickups) list.push({ y: k.y - 0.2, fn: (c, a, b) => SK.drawPickup(c, a, b), a: G, b: k });
    for (const pr of G.props) list.push({ y: pr.y, fn: (c, a, b) => b.draw(c, a, b), a: G, b: pr });
    for (const g of S.gates) if (on(g.x, g.y)) list.push({ y: g.y - 20, fn: drawGate, a: G, b: g });
    for (const b of md.bridges) if (!b.built && on(b.x, b.y)) list.push({ y: b.y, fn: drawBridgeSign, a: G, b });
    list.push({ y: p.y, fn: (c, a) => SK.drawPlayer(c, a), a: G, b: null });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.fn(ctx, it.a, it.b);
    SK.drawBullets(ctx, G);
    SK.drawFx(ctx, G, false);
    drawUseRing(ctx, G);
  };
  function drawProp(ctx, _, d) { SK.draw(ctx, fr(d[2]), d[0], d[1], { flip: !!d[3] }); }
  function drawBunker(ctx, G, b) {
    const pages = b.flash > 0 ? SK.pagesWhite : null;
    for (const [x, y, f] of b.parts) SK.draw(ctx, fr(f), x, y, { pages });
  }
  function npcAnim(n) {
    if (n.prefab === 'Trainer') return pngKey('season_npc_trainer');
    if (n.prefab === 'Explorer' || n.npc === 'esc_npc_explorer') return pngKey('season_npc_explorer');
    const folder = n.folder || (n.prefab || '').toLowerCase();
    const h = D.heroes && D.heroes[folder] && D.heroes[folder].s0;
    return h ? (n.moving ? h.run : h.idle) : null;
  }
  function drawNpc(ctx, G, n) {
    SK.drawShadow(ctx, 'shadow3', n.x, n.y, null);
    const k = npcAnim(n);
    if (!k || !SK.draw(ctx, SK.animFrame(k, n.t), n.x, n.y, { flip: n.face < 0 })) { ctx.fillStyle = '#c9a'; ctx.fillRect(n.x - 5, n.y - 16, 10, 16); }
    if (n.freed === false) {
      // lồng tre nhốt người cần cứu [ĐOÁN hình: TalkEscapeCage không có sprite rời]
      ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(n.x + i * 5, n.y + 1); ctx.lineTo(n.x + i * 5, n.y - 24); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(n.x - 12, n.y - 24); ctx.lineTo(n.x + 12, n.y - 24); ctx.moveTo(n.x - 12, n.y + 1); ctx.lineTo(n.x + 12, n.y + 1); ctx.stroke();
    }
    const hint = S_hint(G, n);
    if (hint) SK.text(ctx, hint, n.x, n.y - 30 + Math.sin(n.t * 4) * 1.5, 10, '#ffe04a', 'center', '#000');
  }
  function S_hint(G, n) {
    const Q = SEASON.quests;
    if (!Q || !Q.npcHint || n.freed === false) return n.freed === false ? '!' : '';
    return Q.npcHint(n.id);
  }
  function drawCrate(ctx, G, c) {
    const s = c.spr || {};
    const f = c.open ? (s.open || s.closed) : s.closed;
    const pop = c.open && c.openT < 0.15 ? 1 + (0.15 - c.openT) * 1.2 : 1;
    if (!c.open && c.kind !== 'temp') {
      // ChestLight: quầng sickle06 cộng màu của prefab rương — vẽ tay một quầng nhạt (hạt 'points' để VFX gắn sau)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 + 0.08 * Math.sin(c.t * 4);
      ctx.fillStyle = /enemy_drop/.test(c.prefab) ? '#c070ff' : '#ffd070';
      ctx.beginPath(); ctx.ellipse(c.x, c.y - 7, 13, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (!f || !SK.draw(ctx, fr(f), c.x, c.y, { sx: pop, sy: pop })) { ctx.fillStyle = c.open ? '#6a5a3a' : '#b08a4a'; ctx.fillRect(c.x - 8, c.y - 12, 16, 12); }
  }
  // Cổng: điểm rút lui = cột pháo khói (weapons3_102 trong prefab GateEvacuation) + vòng; cổng xoáy = prefab cổng SK
  function drawGateGround(ctx, G, g) {
    const S = G.season, act = S.extract && S.extract.at === g;
    if (g.kind === 'evac' || g.kind === 'home' || g.kind === 'deploy') {
      ctx.save();
      ctx.fillStyle = act ? 'rgba(90,230,120,0.28)' : 'rgba(90,230,120,0.12)';
      ctx.strokeStyle = 'rgba(120,255,150,' + (0.5 + 0.25 * Math.sin(g.t * 4)) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(g.x, g.y - 12, 24, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (act) {
        const k = Math.min(1, S.extract.t / S.extract.dur);
        ctx.strokeStyle = '#d8ffb0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(g.x, g.y - 12, 27, 17, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawGate(ctx, G, g) {
    if (g.kind === 'evac') {
      // khói tín hiệu: vài cụm tròn xám bay lên (particle 'smoke' của GateEvacuation chờ VFX gắn)
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const k = ((g.t * 0.35 + i / 6) % 1);
        ctx.globalAlpha = 0.45 * (1 - k);
        ctx.fillStyle = i % 2 ? '#d9e8d0' : '#bfd6b8';
        ctx.beginPath(); ctx.arc(g.x + Math.sin(k * 6 + i) * 4 + k * 6, g.y - 18 - k * 60, 4 + k * 9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (g.name && /hide|Institude/.test(g.name)) return;       // cửa hầm / cổng Viện Nghiên Cứu: sprite nằm trong decor
    const pf = SK.art.object('portal');
    ctx.save(); ctx.imageSmoothingEnabled = true;
    const g0 = ctx.createRadialGradient(g.x, g.y - 20, 2, g.x, g.y - 20, 40);
    g0.addColorStop(0, g.kind === 'zone' ? 'rgba(180,120,255,0.45)' : 'rgba(90,170,255,0.5)'); g0.addColorStop(1, 'rgba(40,90,255,0)');
    ctx.fillStyle = g0; ctx.fillRect(g.x - 46, g.y - 66, 92, 92);
    const ok = SK.drawPrefab(ctx, pf, g.x, g.y, { t: g.t, state: 'transfer_gate', scale: 0.7 });
    ctx.restore();
    if (!ok) { ctx.strokeStyle = '#6ab8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(g.x, g.y - 20, 12, 18, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (g.kind === 'zone' && g.inside) SK.text(ctx, 'Khu vực này chưa mở ở bản web', g.x, g.y - 52, 8, '#e0c8ff', 'center', '#000');
  }
  function drawInvestigate(ctx, a) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,90,' + (0.5 + 0.3 * Math.sin(a.t * 3)) + ')'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(a.x, a.y, 32, 18, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (a.hold > 0) { ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(a.x, a.y, 35, 21, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, a.hold / 2)); ctx.stroke(); }
    ctx.restore();
    SK.text(ctx, L('esc_task_target_area', 'Khu vực') + ' ' + L('esc_task_target_investigate', 'Điều Tra {0}').replace('{0}', ''), a.x, a.y - 22, 8, '#ffe06a', 'center', '#000');
  }
  function drawDig(ctx, tr) {
    SK.draw(ctx, fr(DATA.misc[tr.digging ? 'shovel_0' : 'shovel_1']), tr.x, tr.y + (tr.digging ? Math.sin(tr.t * 18) * 2 : 0));
    ctx.save(); ctx.strokeStyle = 'rgba(255,200,80,0.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(tr.x, tr.y, 14, 7, 0, 0, Math.PI * 2); ctx.stroke();
    if (tr.hold > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(tr.x, tr.y, 16, 9, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tr.hold / 1.5); ctx.stroke(); }
    ctx.restore();
  }
  function drawBridgeSign(ctx, G, b) {
    ctx.save(); ctx.fillStyle = 'rgba(255,230,120,0.18)'; ctx.strokeStyle = 'rgba(255,230,120,0.6)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 22, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    SK.draw(ctx, fr(DATA.misc.shovel_1), b.x, b.y);
  }
  // Vòng tiến độ khi đang dùng đồ tiêu hao [ĐO thời gian dùng = Params[1] của vật phẩm]
  function drawUseRing(ctx, G) {
    const u = inv() && inv().using, p = G.player;
    if (!u || !u.need) return;
    ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(p.x, p.y - 30, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u.t / u.need)); ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- điểm đánh dấu cho bảng Bản đồ (toạ độ px thế giới)
  SW.markers = function () {
    const G = SK.G, S = G.season;
    if (!S || !G.map) return [];
    const out = [];
    const add = (kind, x, y, extra) => out.push(Object.assign({ kind, map: S.map, x, y }, extra));
    if (G.player) add('self', G.player.x, G.player.y, { label: L('esc_map_legend_player', 'Bạn') });
    for (const g of S.gates) {
      if (g.kind === 'evac' || g.kind === 'home') add('exit', g.x, g.y, { label: L('esc_map_legend_extraction', 'Điểm Rút Lui') });
      else if (g.kind === 'deploy') add('portal', g.x, g.y, { label: L('esc_map_base_outskirts', 'Vành Đai Căn Cứ') });
      else add('gate', g.x, g.y, { label: 'Khu khác (khoá)', locked: true });
    }
    for (const c of S.crates) {
      if (c.kind === 'death') add('death', c.x, c.y, { label: L('esc_map_icon_lost_item', 'Vật Thất Lạc') });
      else add(c.open ? 'crate_open' : 'crate', c.x, c.y, { type: c.chestId });
    }
    // Bản đồ căn cứ gốc chỉ có cổng + "Bạn" (ảnh g_0929_101301): không ghi tên nhà / NPC
    for (const a of S.investigate) if (a.active) add('task', a.x, a.y, { label: L('esc_map_icon_task', 'Mục Tiêu Nhiệm Vụ') });
    for (const r of S.rescue) if (!r.freed && SEASON.quests && SEASON.quests.wantsRescue && SEASON.quests.wantsRescue(r.npc)) add('task', r.x, r.y, { label: r.name });
    if (S.treasure && !S.treasure.dug) add('treasure', S.treasure.x, S.treasure.y, { label: 'Kho báu' });
    return out;
  };
  // Ảnh tổng quan phủ hình chữ nhật (px thế giới) nào [ĐO: Scene1 1024 px = 350 đơn vị từ (0,350); Init 16 px/đơn vị từ (-22.75, 30.5)]
  SW.mapInfo = key => {
    const k = key || (SK.G.season && SK.G.season.map) || 'base';
    const md = DATA.maps[k], IM = (window.SK_SEASON_ITEMS || {}).maps || {};
    const im = IM[k === 'base' ? 'Init' : 'Scene1'];
    if (!md || !im) return null;
    return { key: k, img: im.src, imgW: im.w, imgH: im.h, pxW: md.W * U, pxH: md.H * U,
      rect: [(im.ux0 - md.x0) * U, (md.y1 - im.uy1) * U, im.w / im.ppu * U, im.h / im.ppu * U] };
  };
  SW.inBase = () => { const S = SK.G.season; return SK.G.state === 'season' && !!S && S.map === 'base'; };
  SW.near = function (kind, reach) {
    const G = SK.G, p = G.player;
    if (!p || !G.map || !G.map.buildings) return false;
    return G.map.buildings.some(b => b.id === kind && (inRect(p, b.trig) || Math.hypot(b.x - p.x, b.y - p.y) < (reach || 44)));
  };
  // Xây cầu [ĐO BridgeBuilder: vật liệu; unlockDirectly 0 = cần mở khoá, điều kiện mở không có trong bundle -> khoá ĐOÁN]
  SW.buildBridge = function (b) {
    const I = inv();
    if (!b.unlockDirectly) return 'Chưa mở khoá cây cầu này';
    for (const [id, n] of b.cost) if (!I.has(id, n, 'bag')) return 'Thiếu ' + SEASON.itemDef(id).name + ' x' + (n - I.count(id));
    for (const [id, n] of b.cost) I.remove(id, n);
    I.state.bridges[b.id] = true;
    setBridge(SK.G.map, b);
    I.changed(); I.save();
    SK.emit('seasonBuild', SK.G, b.id);
    return null;
  };
  // Bàn Thiết Kế vừa xây xong: dựng lại căn cứ để nhà mới hiện ra, giữ chỗ đứng
  SW.refreshBase = function (G) {
    if (!G.season || G.season.map !== 'base') return;
    const x = G.player.x, y = G.player.y;
    SW.enterBase(G, 'spawn');
    const [fx, fy] = freeNear(G.map, x, y);
    G.player.x = fx; G.player.y = fy;
  };
  SW.DATA = DATA;
})();
