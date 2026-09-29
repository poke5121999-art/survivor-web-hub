// Season Mode: bản đồ ngoài trời, va chạm, vật cản, quái khỉ, thùng, điểm rút lui (SK.SEASON.world).
// Dữ liệu sinh bởi tools/season/build_season.py (data/season-data.js); art thật trong art/season/world/world0.png.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, T = SK.TILE, W = SK.world;
  const DATA = window.SK_SEASON && window.SK_SEASON.world;
  const SEASON = SK.SEASON = SK.SEASON || {};
  const SW = SEASON.world = {};
  if (!DATA) { SK.warnOnce('seasonData', 'season-data.js not loaded'); return; }
  const M = 32, PFX = 'sw:';
  const U = SK.PPU;

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
  // SK.pages chỉ có sau SK.loadArt(); gọi lại mỗi khung cho tới khi gắn xong.
  SW.ensureArt = function () {
    if (artReady) return true;
    if (!artImg || !SK.pages || !SK.pages.length) return false;
    const pi = SK.pages.length;
    SK.pages.push(artImg);
    SK.pagesWhite.push(tint(artImg, '#ffffff', 1));
    SK.pagesElite.push(tint(artImg, '#ff2a1a', 0.32));
    for (const [n, f] of Object.entries(DATA.atlas.f)) SK.A.f[PFX + n] = [pi, f[0], f[1], f[2], f[3], f[4], f[5]];
    for (const [en, a] of Object.entries(DATA.anims)) {
      for (const [k, fr] of Object.entries(a)) {
        if (!fr.length) continue;
        // [ƯỚC LƯỢNG] 10 khung/giây như quái SK thường
        D.anims['sw/' + en + '/' + k] = { f: fr.map(n => PFX + n), d: fr.map(() => k === 'dodge' ? 0.08 : 0.1), loop: k !== 'dead' && k !== 'dodge' };
      }
    }
    artReady = true;
    return true;
  };
  const fr = n => PFX + n;
  const anim = (en, k) => 'sw/' + en + '/' + k;

  // ---------------------------------------------------------------- bản đồ tương thích SK.world
  const decode = s => s.replace(/(\D)(\d*)/g, (m, c, n) => c.repeat(n ? +n : 1));
  const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + (k || 0) * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

  SW.buildMap = function (key) {
    const md = DATA.maps[key], N = md.W * md.H;
    const solid = decode(md.solid), ground = decode(md.ground);
    const map = {
      season: key, md, W: md.W, H: md.H, MW: md.MW, MH: md.MH, tiles: new Uint8Array(N), door: new Int16Array(N),
      deco: new Uint8Array(N), rooms: [], obs: new Map(), doorCells: [], art: null, bg: '#33452f',
      ground, solid, pxW: md.W * T, pxH: md.H * T, buildings: []
    };
    for (let i = 0; i < N; i++) map.tiles[i] = solid[i] === '.' ? W.FLOOR : W.WALL;
    return map;
  };
  // Chân nhà chắn đi lại: dải đáy rộng 80% sprite, cao 40% [ƯỚC LƯỢNG theo ảnh e: đi sát chân quầy được].
  function addBuilding(map, b) {
    const f = DATA.atlas.f[b.sprite];
    const w = f ? f[2] : 48, h = f ? f[3] : 48;
    const x0 = b.x - w * 0.4, x1 = b.x + w * 0.4, y0 = b.y - Math.min(40, h * 0.4), y1 = b.y - 2;
    for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++)
      for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++)
        if (tx >= 0 && ty >= 0 && tx < map.W && ty < map.H) map.tiles[ty * map.W + tx] = W.WALL;
    map.buildings.push(b);
  }
  const gAt = (map, x, y) => {
    x = SK.clamp(x, 0, map.MW - 1); y = SK.clamp(y, 0, map.MH - 1);
    return map.ground[y * map.MW + x];
  };
  const walkable = (map, x, y) => !W.solidAt(map, x, y) && !W.solidAt(map, x - 6, y) && !W.solidAt(map, x + 6, y) && !W.solidAt(map, x, y - 6);
  function freeNear(map, x, y) {
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const px = x + dx * T, py = y + dy * T;
      if (walkable(map, px, py)) return [px, py];
    }
    return [x, y];
  }
  SW.freeNear = freeNear;

  // ---------------------------------------------------------------- vẽ nền (tile blob thật của bộ escape)
  const ROLES = DATA.roles;
  const EDGE_FALLBACK = ['NE', 'ES', 'SW', 'NW', 'N', 'E', 'S', 'W'];
  function roleFor(set, is, x, y) {
    const R = ROLES[set];
    const n = !is(x, y - 1), e = !is(x + 1, y), s = !is(x, y + 1), w = !is(x - 1, y);
    const key = (n ? 'N' : '') + (e ? 'E' : '') + (s ? 'S' : '') + (w ? 'W' : '');
    if (key) {
      if (R[key]) return R[key];
      for (const k of EDGE_FALLBACK) if (R[k] && [...k].every(c => key.indexOf(c) >= 0)) return R[k];
      return R.full;
    }
    const nk = 'x' + (!is(x - 1, y - 1) ? 'a' : '') + (!is(x + 1, y - 1) ? 'b' : '') + (!is(x - 1, y + 1) ? 'c' : '') + (!is(x + 1, y + 1) ? 'd' : '');
    if (nk === 'x') return R.full;
    if (R[nk]) return R[nk];
    for (const c of nk.slice(1)) if (R['x' + c]) return R['x' + c];
    return R.full;
  }
  const pickVar = (list, x, y) => list[hash(x, y, 7) % list.length];
  const isWater = c => c === 'w' || c === 'b';

  function drawTilePart(ctx, name, dx, dy, sx, sy) {
    const f = SK.A.f[PFX + name]; if (!f) return;
    const img = SK.pages[f[0]]; if (!img) return;
    ctx.drawImage(img, f[1] + sx, f[2] + sy, M, M, dx, dy, M, M);
  }

  function drawGround(ctx, map, cam, vw, vh) {
    const x0 = Math.max(0, Math.floor(cam.x / M) - 1), y0 = Math.max(0, Math.floor(cam.y / M) - 1);
    const x1 = Math.min(map.MW - 1, Math.floor((cam.x + vw) / M) + 1), y1 = Math.min(map.MH - 1, Math.floor((cam.y + vh) / M) + 1);
    const grassFull = ROLES.grass.full || [];
    const isDirt = (x, y) => gAt(map, x, y) === 'd';
    const isW = (x, y) => isWater(gAt(map, x, y));
    // lõi sâu = ô nước có đủ 4 ô kề là nước; viền nông còn một ô như dải xanh nhạt mảnh trên Scene1.png
    const isDeep = (x, y) => isW(x, y) && isW(x - 1, y) && isW(x + 1, y) && isW(x, y - 1) && isW(x, y + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x * M, py = y * M, c = gAt(map, x, y), h = hash(x, y, 1);
      // cỏ nền: grass_* cùng màu (141,158,59) với cỏ trên Init.png; sg_* tối hơn nên không dùng làm nền [ĐO]
      SK.draw(ctx, fr(grassFull[h % grassFull.length]), px, py);
      if (c === 'd') SK.draw(ctx, fr(pickVar(roleFor('dirt', isDirt, x, y), x, y)), px, py);
      else if (isWater(c)) {
        SK.draw(ctx, fr(pickVar(roleFor('water_shallow', isW, x, y), x, y)), px, py);
        if (isDeep(x, y)) SK.draw(ctx, fr(pickVar(roleFor('water_deep', isDeep, x, y), x, y)), px, py);
      }
      if (c === 'b' || c === 'k') drawTilePart(ctx, 'WoodBridgeDark_2', px, py, (x & 1) * M, (y & 1) * M);
    }
    // nền rừng tối giữa các gốc cây, như khe giữa tán trong Init.png
    const tx0 = Math.max(0, Math.floor(cam.x / T)), ty0 = Math.max(0, Math.floor(cam.y / T));
    const tx1 = Math.min(map.W - 1, Math.floor((cam.x + vw) / T)), ty1 = Math.min(map.H - 1, Math.floor((cam.y + vh) / T));
    ctx.fillStyle = '#30473a';   // [ĐO] màu khe tối giữa tán trên Init.png (48,71,58)
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      // chỉ lấp trong lòng rừng: ô gốc ở bìa nam để cỏ lộ ra dưới chân cây
      let deep = true;
      for (let k = -1; k <= 2 && deep; k++) {
        const c = map.solid[SK.clamp(y + k, 0, map.H - 1) * map.W + x];
        if (!TREE[c]) deep = false;
      }
      if (deep && TREE[map.solid[y * map.W + Math.max(0, x - 1)]] && TREE[map.solid[y * map.W + Math.min(map.W - 1, x + 1)]]) ctx.fillRect(x * T, y * T, T, T);
    }
  }

  // Cây: lưới so le 24x18 px, lệch ngẫu nhiên cố định; có cây khi gốc rơi vào ô rừng. Màu tán lấy theo ảnh map.
  const TREE = { t: 'Tree_2', g: 'Tree_1', y: 'Tree_Y' };
  const SX = 24, SY = 18;
  function collectTrees(list, map, cam, vw, vh) {
    const r0 = Math.floor((cam.y - 8) / SY), r1 = Math.floor((cam.y + vh + 70) / SY);
    for (let r = r0; r <= r1; r++) {
      const off = (r & 1) ? SX / 2 : 0;
      const c0 = Math.floor((cam.x - 30 - off) / SX), c1 = Math.floor((cam.x + vw + 30 - off) / SX);
      for (let c = c0; c <= c1; c++) {
        const h = hash(c, r, 3);
        const x = c * SX + off + ((h & 15) - 7.5) * 0.7, y = r * SY + (((h >> 4) & 15) - 7.5) * 0.5;
        const tx = Math.floor(x / T), ty = Math.floor(y / T);
        if (tx < 0 || ty < 0 || tx >= map.W || ty >= map.H) continue;
        const ch = map.solid[ty * map.W + tx], sp = TREE[ch];
        if (!sp) continue;
        list.push({ y, fn: drawTree, a: sp, b: [x, y, (h >> 9) & 1] });
      }
    }
  }
  function drawTree(ctx, sp, p) { SK.draw(ctx, fr(sp), p[0], p[1], { flip: !!p[2] }); }

  // ---------------------------------------------------------------- khỉ (quái Base Outskirt) [WIKI Escape from Monkia/Enemies]
  const KINDS = {
    gunner: { spr: 'macaque_1', name: 'Khỉ Xạ Thủ', hp: 40, weapons: ['desert_eagle', 'desert_eagle_gold', 'revolver', 'bow'], ai: 'SeasonGunner', speed: 3.6 },
    wizard: { spr: 'macaque_2', name: 'Khỉ Pháp Sư', hp: 40, weapons: ['tidal_staff'], ai: 'EnemyAI01', speed: 3.2 },   // HP [ƯỚC LƯỢNG]
    researcher: { spr: 'macaque_3', name: 'Khỉ Nghiên Cứu', hp: 40, weapons: ['dormant_bubble_machine'], ai: 'EnemyAI01', speed: 3.2 },
    brawler: { spr: 'ape_1', name: 'Vượn Đấu Sĩ', hp: 50, weapons: ['wooden_hammer', 'broadsword', 'nunchaku'], ai: 'EnemyAI02', speed: 4 },
    cannoneer: { spr: 'ape_2', name: 'Vượn Pháo Thủ', hp: 40, weapons: ['bazooka', 'ion_coilgun', 'coilgun', 'rocket_fireworks'], ai: 'EnemyAI03', speed: 3 },
    guardian: { spr: 'ape_3', name: 'Vượn Hộ Vệ', hp: 60, weapons: ['mercenary_intern_s_shotgun'], ai: 'EnemyAI01', speed: 3 },   // HP [ƯỚC LƯỢNG]
    gunner_elite: { spr: 'macaque_elite', name: 'Khỉ Xạ Thủ tinh anh', hp: 80, weapons: ['desert_eagle_gold', 'revolver'], ai: 'SeasonGunner', speed: 3.8, elite: true },
    brawler_elite: { spr: 'ape_elite', name: 'Vượn Đấu Sĩ tinh anh', hp: 80, weapons: ['broadsword', 'wooden_hammer'], ai: 'EnemyAI02', speed: 4.2, elite: true }   // [WIKI] Brawler 50/80
  };
  SW.KINDS = KINDS;

  // Súng thật của người chơi cầm trên tay quái: đổi số wiki sang tham số EGun của actors.js.
  function enemyWeapon(id) {
    const d = DS.weapons[id] || DS.weapons.bad_pistol;
    const melee = d.kind === 'melee';
    const f = SK.frame(d.sprite);
    return {
      id, cls: melee ? 'ESword01' : (d.pellets || 1) > 1 ? 'EGun002' : 'EGun001', sprite: d.sprite, at: [4, 8],
      gunPoint: [f ? f[3] - f[5] : 10, 0],
      // [ƯỚC LƯỢNG] wiki nói "cùng sát thương như khi người chơi cầm", nhưng búa/kiếm 12 thì 2 nhát hết máu 16: chặn ở 4 (actors.js nhân 0.5 → tối đa 2/đòn)
      p: { atk: SK.clamp(d.dmg || 2, 1, 4), bullet_speed: Math.min(14, (d.bulletSpeed || 14) * 0.55), deviation: (d.spread || 4) / 2,
        count: d.pellets || 1, angle: d.pellets > 1 ? Math.max(6, (d.fan || 30) / d.pellets) : 0, bulletSize: 1, need_lock: 1 }
    };
  }

  function makeMonkey(G, kind, x, y, camp) {
    const k = KINDS[kind], wid = SK.pick(k.weapons);
    const e = {
      id: 'season_' + kind, season: true, kind, d: { speed: k.speed, shadow: 'shadow2', hands: [[4, 8]] },
      p: { shoot_cd: kind.startsWith('brawler') ? 1.1 : 1.8, attackProbability: 8, findTargetRange: 22, atk_range: 2.2, atkDelay: 1, damage: 2, reward_rate: 0 },
      cls: k.ai, rawCls: k.ai, x, y, kx: 0, ky: 0, hp: k.hp, hpMax: k.hp, face: SK.chance(0.5) ? 1 : -1, aim: 0,
      st: 'idle', stT: SK.randf(0.2, 1), t: SK.rand() * 2, cd: SK.randf(0.8, 2), room: camp, elite: !!k.elite, flash: 0,
      w: enemyWeapon(wid), weaponId: wid,
      anims: { idle: anim(k.spr, 'idle'), run: anim(k.spr, 'run'), dead: anim(k.spr, 'dead') },
      r: 5, hb: { size: [14, 18], off: [0, 9] }, scale: 1, burst: 0
    };
    if (k.spr === 'macaque_1' || k.spr === 'macaque_elite') e.draw = drawGunner;
    return e;
  }
  // Khung né (e_escape_macaque_1_dodge_0..3) khi Khỉ Xạ Thủ lăn tránh đạn [WIKI: "The Macaque Gunner can dodge"].
  function drawGunner(ctx, G, e) {
    if (e.st === 'dodge') {
      const f = SK.animFrame(anim('macaque_1', 'dodge'), 0.32 - e.dodgeT);
      SK.draw(ctx, f, e.x, e.y, { flip: e.face < 0, pages: e.elite ? SK.pagesElite : null });
      return;
    }
    const d = e.draw; e.draw = null; SK.drawEnemy(ctx, G, e); e.draw = d;
  }
  SK.AI.SeasonGunner = function (G, e, dt) {
    if (e.st === 'dodge') {
      e.dodgeT -= dt;
      SK.moveBox(G.map, e, Math.cos(e.dodgeA) * 150 * dt, Math.sin(e.dodgeA) * 150 * dt, e.r);
      if (e.dodgeT <= 0) { e.st = 'idle'; e.stT = 0.2; }
      return;
    }
    e.dodgeCd = (e.dodgeCd == null ? 1 : e.dodgeCd) - dt;
    if (e.dodgeCd <= 0 && e.st !== 'aim' && e.st !== 'attack') {
      const b = G.bullets.find(q => q.side === 'p' && !q.dead && !q.vis && Math.hypot(q.x - e.x, q.y - e.y + 8) < 44);
      if (b) {
        e.st = 'dodge'; e.dodgeT = 0.32; e.dodgeCd = SK.randf(2.5, 4);   // [ƯỚC LƯỢNG] 4 khung né ~0.32 s
        e.dodgeA = Math.atan2(b.vy, b.vx) + (SK.chance(0.5) ? 1 : -1) * Math.PI / 2;
        e.face = Math.cos(e.dodgeA) >= 0 ? 1 : -1;
        return;
      }
    }
    SK.AI.EnemyAI01(G, e, dt);
  };

  // ---------------------------------------------------------------- thùng
  // [ĐO sheet Chest_10..27] mỗi loại một cặp đóng/mở; loại → sprite là [ĐOÁN] theo hình (bao tải = đồ ăn, hộp trắng = thuốc...).
  const CRATE_SPR = {
    resource: ['Chest_26', 'Chest_27'], food: ['Chest_18', 'Chest_19'], medical: ['Chest_20', 'Chest_21'],
    supply: ['Chest_22', 'Chest_23'], misc: ['Chest_24', 'Chest_25'], monster: ['Chest_16', 'Chest_17'], monster_elite: ['Chest_14', 'Chest_15']
  };
  const CRATE_NAME = { resource: 'thùng tài nguyên', food: 'thùng thức ăn', medical: 'thùng y tế', supply: 'thùng tiếp tế', misc: 'thùng linh tinh', monster: 'thùng quái', monster_elite: 'thùng quái tinh anh' };
  SW.CRATE_SPR = CRATE_SPR;

  function itemDef(id) { return typeof SEASON.itemDef === 'function' ? SEASON.itemDef(id) : SEASON.items && SEASON.items[id]; }
  function itemName(id) { const d = itemDef(id); return d ? d.name : id === 'iron_coin' ? 'Xu sắt' : id; }

  function openCrate(G, c) {
    const S = G.season;
    if (c.open) return;
    c.open = true; c.openT = 0;
    let drops = [];
    const lvl = 1;
    const type = c.type === 'monster_elite' ? 'monster' : c.type;
    const hasLoot = typeof SEASON.loot === 'function';
    if (hasLoot) {
      try { drops = SEASON.loot(type, lvl, { weapon: c.weapon, elite: c.type === 'monster_elite', crate: c }) || []; }
      catch (err) { SK.warnOnce('loot', 'SK.SEASON.loot failed: ' + err); }
    } else drops = [{ id: 'iron_coin', n: SK.randi(20, 80) }];   // chưa có mô-đun đồ: thả xu để vòng lặp vẫn chạy
    drops.forEach((d, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2 + SK.rand();
      const [x, y] = freeNear(G.map, c.x + Math.cos(a) * 16, c.y + 10 + Math.sin(a) * 8);
      S.loot.push({ id: d.id, n: d.n || 1, x, y, t: 0 });
    });
    if (c.weapon && !drops.some(d => d.id === 'w_' + c.weapon)) {
      const [x, y] = freeNear(G.map, c.x, c.y + 14);
      S.weapons.push({ id: c.weapon, x, y, t: 0 });
    }
    SK.fx(G, 'ring', c.x, c.y - 4, { dur: 0.35, color: '#ffe38a' });
    SK.emit('seasonLoot', G, c);
  }

  function pickLoot(G, it) {
    const S = G.season;
    let left = 0;
    if (SEASON.inv && typeof SEASON.inv.add === 'function') left = SEASON.inv.add(it.id, it.n) || 0;
    else { S.bag[it.id] = (S.bag[it.id] || 0) + it.n; }
    if (left >= it.n) { G.toast('Balô đầy!'); return; }
    G.toast('+' + (it.n - left) + ' ' + itemName(it.id));
    if (left > 0) it.n = left; else it.gone = true;
    S.loot = S.loot.filter(x => !x.gone);
  }
  function pickWeapon(G, it) {
    const p = G.player, S = G.season;
    S.weapons = S.weapons.filter(x => x !== it);
    if (SEASON.inv && typeof SEASON.inv.pickWeapon === 'function' && SEASON.inv.pickWeapon(it.id) !== false) { G.toast(DS.weapons[it.id].name); return; }
    if (!p.weapons[1]) { p.weapons[1] = SK.makeWeapon(it.id); p.cur = 1; }
    else {
      const old = p.weapons[p.cur];
      p.weapons[p.cur] = SK.makeWeapon(it.id);
      S.weapons.push({ id: old.id, x: p.x, y: p.y + 4, t: 0 });
    }
    if (p.skillT > 0 && p.dual) SK.endSkill(G, p);
    G.toast(DS.weapons[it.id].name);
  }

  // ---------------------------------------------------------------- vào bản đồ
  function resetWorld(G, key) {
    G.map = SW.buildMap(key);
    G.enemies = []; G.bullets = []; G.pickups = []; G.fx = []; G.nums = []; G.items = []; G.chests = []; G.interactables = []; G.props = [];
    G.room = null; G.portal = null; G.banner = null;
    const S = G.season;
    S.map = key; S.crates = []; S.loot = []; S.weapons = []; S.exits = []; S.npcs = []; S.extract = null;
  }

  SW.enterBase = function (G, at) {
    resetWorld(G, 'base');
    const md = DATA.maps.base, S = G.season;
    for (const b of md.buildings) addBuilding(G.map, b);
    const [px, py] = md.points.portal;
    G.portal = { x: px, y: py, t: 0 };
    const [nx, ny] = md.points.npc;
    S.npcs.push({ id: 'drillmaster', name: 'Huấn luyện viên', x: nx, y: ny, t: 0, face: -1 });
    for (const b of md.buildings) {
      G.interactables.push({ x: b.x, y: b.y + 6, r: 34, label: b.name, labelY: 40, kind: b.kind, use: (G2) => useBuilding(G2, b) });
    }
    G.interactables.push({ x: nx, y: ny + 2, r: 26, label: 'Nói chuyện', labelY: 34, kind: 'npc', use: (G2) => openUi(G2, 'quest', 'Huấn luyện viên: nhận nhiệm vụ ở bảng Nhiệm vụ.') });
    const spot = at === 'portal' ? [px, py + 40] : md.points.spawn;
    const [sx, sy] = freeNear(G.map, spot[0], spot[1]);
    G.player.x = sx; G.player.y = sy;
  };

  function openUi(G, panel, fallback) {
    const ui = SEASON.ui;
    if (ui && typeof ui.open === 'function') { ui.open(panel, G); return; }
    G.toast(fallback, 2.2);
  }
  function useBuilding(G, b) {
    if (b.kind === 'warehouse') openUi(G, 'warehouse', 'Nhà kho: cất đồ sau mỗi chuyến.');
    else if (b.kind === 'store') openUi(G, 'store', 'Cửa hàng: bán đồ lấy xu sắt.');
    else if (b.kind === 'training') openUi(G, 'training', 'Khu huấn luyện: nâng cấp bằng năng lượng tím.');
    else openUi(G, 'design', 'Bàn thiết kế: xây công trình mới.');
  }

  SW.enterExpedition = function (G) {
    resetWorld(G, 's1');
    const md = DATA.maps.s1, S = G.season;
    for (const cp of md.camps) addBuilding(G.map, { sprite: cp.sprite, x: cp.x, y: cp.y, kind: 'camp' });
    const [ex, ey] = freeNear(G.map, md.points.entry[0], md.points.entry[1]);
    G.player.x = ex; G.player.y = ey;
    for (const [x, y] of md.points.exits) S.exits.push({ x, y, r: 26, t: 0 });
    for (const [x, y, type] of md.crates) {
      const [cx, cy] = freeNear(G.map, x, y);
      S.crates.push({ type, x: cx, y: cy, open: false, t: 0, openT: 0 });
    }
    // Quái: 3 con mỗi trại, trại có tinh anh [ƯỚC LƯỢNG mật độ; wiki không ghi số lượng]
    const ROSTER = { ape: ['brawler', 'brawler', 'cannoneer'], macaque: ['gunner', 'gunner', 'researcher'], mixed: ['gunner', 'brawler', 'guardian'] };
    md.camps.forEach((cp, i) => {
      const camp = { x0: Math.floor((cp.x - 150) / T), x1: Math.floor((cp.x + 150) / T), y0: Math.floor((cp.y - 110) / T), y1: Math.floor((cp.y + 130) / T), camp: i };
      const list = ROSTER[cp.kind].slice();
      if (i === 3) list.push('brawler_elite');
      if (i === 6) list.push('gunner_elite');
      if (i === 1) list.push('wizard');
      list.forEach((kind, j) => {
        const a = j / list.length * Math.PI * 2 + SK.rand();
        const [x, y] = freeNear(G.map, cp.x + Math.cos(a) * 60, cp.y + 30 + Math.sin(a) * 36);
        G.enemies.push(makeMonkey(G, kind, x, y, camp));
      });
    });
    // tuần tra dọc đường: vài con quanh các thùng lẻ xa trại
    const lone = md.crates.slice(md.camps.length * 4).filter((c, i) => i % 5 === 0).slice(0, 7);
    for (const [x, y] of lone) {
      const camp = { x0: Math.floor((x - 120) / T), x1: Math.floor((x + 120) / T), y0: Math.floor((y - 90) / T), y1: Math.floor((y + 90) / T) };
      const [ex2, ey2] = freeNear(G.map, x + 40, y + 10);
      G.enemies.push(makeMonkey(G, SK.pick(['gunner', 'brawler', 'cannoneer']), ex2, ey2, camp));
    }
  };

  // ---------------------------------------------------------------- mỗi bước
  const EXTRACT_T = 5;   // [ĐOÁN, brief] đứng trong vòng 5 s
  SW.nearestInteract = function (G) {
    const p = G.player, S = G.season;
    let best = null, bd = 1e9;
    const consider = (d, reach, o) => { if (d < reach && d - reach < bd) { bd = d - reach; best = o; } };
    for (const o of G.interactables) {
      if (o.gone) continue;
      consider(Math.hypot(o.x - p.x, o.y - p.y), o.r || 26, { x: o.x, y: o.y - (o.labelY || 24), label: o.label, kind: o.kind, use: () => o.use(G, o) });
    }
    for (const c of S.crates) {
      if (c.open) continue;
      consider(Math.hypot(c.x - p.x, c.y - p.y), 24, { x: c.x, y: c.y - 30, label: 'Mở ' + CRATE_NAME[c.type], kind: 'crate', use: () => openCrate(G, c) });
    }
    for (const it of S.loot) consider(Math.hypot(it.x - p.x, it.y - p.y), 18, { x: it.x, y: it.y - 16, label: 'Nhặt ' + itemName(it.id) + (it.n > 1 ? ' x' + it.n : ''), kind: 'loot', use: () => pickLoot(G, it) });
    for (const it of S.weapons) consider(Math.hypot(it.x - p.x, it.y - p.y), 18, { x: it.x, y: it.y - 14, label: 'Nhặt ' + DS.weapons[it.id].name, kind: 'weapon', use: () => pickWeapon(G, it) });
    return best;
  };

  // Chạy sau SK.updatePlayer. Trả 'extract' khi đứng đủ giờ trong vòng rút lui, 'portal' khi bước vào cổng xoáy.
  SW.update = function (G, dt) {
    const p = G.player, S = G.season;
    for (const c of S.crates) { c.t += dt; if (c.open) c.openT += dt; }
    for (const it of S.loot) it.t += dt;
    for (const it of S.weapons) it.t += dt;
    for (const n of S.npcs) {
      n.t += dt;
      if (Math.abs(p.x - n.x) > 2) n.face = p.x > n.x ? 1 : -1;
    }
    // Quái xa người chơi thì đứng yên cho nhẹ; con đang đánh vẫn chạy tiếp.
    for (const e of G.enemies) {
      const far = Math.abs(e.x - p.x) > 460 || Math.abs(e.y - p.y) > 340;
      if (!far || e.st === 'dead') SK.updateEnemy(G, e, dt);
    }
    let out = null;
    if (G.portal) {
      G.portal.t += dt;
      if (p.st !== 'dead' && Math.hypot(p.x - G.portal.x, p.y - G.portal.y) < 16) out = 'portal';
    }
    let inExit = null;
    for (const x of S.exits) {
      x.t += dt;
      if (p.st !== 'dead' && Math.hypot(p.x - x.x, p.y - x.y) < x.r) inExit = x;
    }
    if (inExit) {
      if (!S.extract || S.extract.at !== inExit) S.extract = { at: inExit, t: 0 };
      S.extract.t += dt;
      if (S.extract.t >= EXTRACT_T) out = 'extract';
    } else S.extract = null;
    return out;
  };

  SK.on('enemyKill', (G, e) => {
    if (!e.season || G.state !== 'season') return;
    // [WIKI Monster crate] mọi quái rớt thùng chứa đúng vũ khí nó cầm + Violet Energy
    const [x, y] = freeNear(G.map, e.x, e.y + 4);
    G.season.crates.push({ type: e.elite ? 'monster_elite' : 'monster', x, y, open: false, t: 0, openT: 0, weapon: e.weaponId, from: e.kind });
    SK.emit('seasonKill', G, e);
  });

  // ---------------------------------------------------------------- vẽ
  SW.render = function (ctx, G, cam, vw, vh) {
    SW.ensureArt();
    const map = G.map, S = G.season;
    drawGround(ctx, map, cam, vw, vh);
    for (const x of S.exits) drawExitGround(ctx, G, x);
    if (G.portal) drawPortalGlow(ctx, G.portal);
    SK.drawFx(ctx, G, true);
    const p = G.player;
    if (p.st !== 'dead') SK.drawShadow(ctx, p.h.shadow, p.x, p.y, null);
    const on = (x, y) => x > cam.x - 80 && x < cam.x + vw + 80 && y > cam.y - 20 && y < cam.y + vh + 90;
    for (const e of G.enemies) if (e.st !== 'dead' && on(e.x, e.y)) SK.drawShadow(ctx, e.d.shadow, e.x, e.y, null, e.scale);

    const list = [];
    collectTrees(list, map, cam, vw, vh);
    for (const b of map.buildings) if (on(b.x, b.y - 40)) list.push({ y: b.y, fn: drawSprite, a: b.sprite, b });
    for (const n of S.npcs) if (on(n.x, n.y)) list.push({ y: n.y, fn: drawNpc, a: G, b: n });
    for (const e of G.enemies) if (on(e.x, e.y)) list.push({ y: e.st === 'dead' ? e.y - 1000 : e.y, fn: (c, a, b) => SK.drawEnemy(c, a, b), a: G, b: e });
    for (const c of S.crates) if (on(c.x, c.y)) list.push({ y: c.y, fn: drawCrate, a: G, b: c });
    for (const it of S.loot) if (on(it.x, it.y)) list.push({ y: it.y, fn: drawLoot, a: G, b: it });
    for (const it of S.weapons) if (on(it.x, it.y)) list.push({ y: it.y, fn: drawWeaponItem, a: G, b: it });
    for (const k of G.pickups) list.push({ y: k.y - 0.2, fn: (c, a, b) => SK.drawPickup(c, a, b), a: G, b: k });
    for (const pr of G.props) list.push({ y: pr.y, fn: (c, a, b) => b.draw(c, a, b), a: G, b: pr });
    for (const x of S.exits) if (on(x.x, x.y)) list.push({ y: x.y - 30, fn: drawExitSign, a: G, b: x });
    if (G.portal) list.push({ y: G.portal.y - 30, fn: drawPortal, a: G, b: G.portal });
    list.push({ y: p.y, fn: (c, a) => SK.drawPlayer(c, a), a: G, b: null });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.fn(ctx, it.a, it.b);
    SK.drawBullets(ctx, G);
    SK.drawFx(ctx, G, false);
  };

  function drawSprite(ctx, name, b) {
    if (!SK.draw(ctx, fr(name), b.x, b.y, { flip: !!b.flip })) { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(b.x - 20, b.y - 30, 40, 30); }
  }
  function drawNpc(ctx, G, n) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(n.x, n.y, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    SK.draw(ctx, SK.animFrame(anim('npc_trainer', 'idle'), n.t), n.x, n.y, { flip: n.face < 0 });
  }
  function drawCrate(ctx, G, c) {
    const s = CRATE_SPR[c.type] || CRATE_SPR.resource;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
    const pop = c.open && c.openT < 0.15 ? 1 + (0.15 - c.openT) * 1.2 : 1;
    if (!SK.draw(ctx, fr(s[c.open ? 1 : 0]), c.x, c.y, { sx: pop, sy: pop })) { ctx.fillStyle = c.open ? '#6a5a3a' : '#b08a4a'; ctx.fillRect(c.x - 10, c.y - 16, 20, 16); }
    if (!c.open && (c.type === 'monster' || c.type === 'monster_elite')) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + 0.1 * Math.sin(c.t * 5);
      ctx.fillStyle = '#b060ff'; ctx.beginPath(); ctx.ellipse(c.x, c.y - 10, 14, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  function drawLoot(ctx, G, it) {
    const d = itemDef(it.id), bob = Math.round(Math.sin(it.t * 3 + it.x) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    const icon = d && d.icon;
    const f = icon && SK.frame(icon);
    if (f) {
      // biểu tượng vật phẩm 16-32 px: canh giữa đáy lên điểm rơi
      const k = Math.min(1, 16 / Math.max(f[3], f[4]));
      SK.draw(ctx, icon, it.x - (f[3] / 2 - f[5]) * k, it.y - 3 + bob - (f[4] - f[6]) * k, { sx: k, sy: k });
    } else {
      ctx.fillStyle = it.id === 'iron_coin' ? '#c9ced6' : '#f0c040';
      ctx.beginPath(); ctx.arc(it.x, it.y - 6 + bob, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b7280'; ctx.fillRect(it.x - 1, it.y - 8 + bob, 2, 4);
    }
  }
  function drawWeaponItem(ctx, G, it) {
    const bob = Math.round(Math.sin(it.t * 3) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 8, 2, 0, 0, Math.PI * 2); ctx.fill();
    SK.drawGun(ctx, DS.weapons[it.id].sprite, it.x - 6, it.y - 6 + bob, 0, null, {});
  }
  // Điểm rút lui: vòng xanh lá trên mặt đất + người chạy point_escape; vòng đếm ngược 5 s khi đứng trong.
  function drawExitGround(ctx, G, x) {
    const S = G.season, act = S.extract && S.extract.at === x;
    ctx.save();
    ctx.fillStyle = act ? 'rgba(90,230,120,0.28)' : 'rgba(90,230,120,0.14)';
    ctx.strokeStyle = 'rgba(120,255,150,' + (0.55 + 0.25 * Math.sin(x.t * 4)) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x.x, x.y, x.r, x.r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (act) {
      const k = Math.min(1, S.extract.t / EXTRACT_T);
      ctx.strokeStyle = '#d8ffb0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x.x, x.y, x.r + 3, x.r * 0.55 + 3, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    }
    ctx.restore();
  }
  function drawExitSign(ctx, G, x) {
    const bob = Math.sin(x.t * 3) * 2;
    SK.draw(ctx, fr('point_escape'), x.x, x.y - 34 + bob, { sx: 2, sy: 2 });
  }
  function drawPortalGlow(ctx, pt) {
    const g = ctx.createRadialGradient(pt.x, pt.y - 20, 2, pt.x, pt.y - 20, 40);
    g.addColorStop(0, 'rgba(90,170,255,0.5)'); g.addColorStop(1, 'rgba(40,90,255,0)');
    ctx.fillStyle = g; ctx.fillRect(pt.x - 46, pt.y - 66, 92, 92);
  }
  // Cổng xoáy xanh phía bắc căn cứ: dùng prefab transfer_gate thật của SK (cùng bộ với cổng qua màn).
  function drawPortal(ctx, G, pt) {
    const pf = SK.art.object('portal');
    ctx.save(); ctx.imageSmoothingEnabled = true;
    const ok = SK.drawPrefab(ctx, pf, pt.x, pt.y, { t: pt.t, state: 'transfer_gate', scale: 0.7 });
    ctx.restore();
    if (!ok) { ctx.strokeStyle = '#6ab8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(pt.x, pt.y - 20, 12, 18, 0, 0, Math.PI * 2); ctx.stroke(); }
  }

  // ---------------------------------------------------------------- điểm đánh dấu cho bảng Bản đồ
  // x,y = px thế giới; u,v = 0..1 trên ảnh tổng quan (Init / Scene1) để vẽ lên ảnh map.
  SW.markers = function () {
    const G = SK.G, S = G.season;
    if (!S || !G.map) return [];
    const md = DATA.maps[S.map], pw = md.imgW * md.scale, ph = md.imgH * md.scale;
    const out = [];
    const add = (kind, x, y, extra) => out.push(Object.assign({ kind, map: S.map, x, y, u: x / pw, v: y / ph, frame: null }, extra));
    if (G.player) add('self', G.player.x, G.player.y, { frame: fr('point_self'), label: 'Bạn' });
    if (G.portal) add('portal', G.portal.x, G.portal.y, { frame: fr('point_gate'), label: 'Cổng ra bản đồ' });
    for (const x of S.exits) add('exit', x.x, x.y, { frame: fr('point_escape'), label: 'Điểm rút lui' });
    for (const c of S.crates) add(c.open ? 'crate_open' : 'crate', c.x, c.y, { frame: c.open ? null : fr('point_chestbox'), type: c.type });
    for (const n of S.npcs) add('npc', n.x, n.y, { frame: fr('point_task'), label: n.name });
    for (const b of G.map.buildings) if (b.name) add('building', b.x, b.y, { label: b.name, sub: b.kind });
    if (S.map === 's1') DATA.maps.s1.camps.forEach((cp, i) => add('camp', cp.x, cp.y, { label: 'Trại khỉ ' + (i + 1), camp: i }));
    for (const q of S.questTargets || []) add('task', q.x, q.y, { frame: fr('point_task'), label: q.label });
    return out;
  };
  SW.mapInfo = key => {
    const md = DATA.maps[key || (SK.G.season && SK.G.season.map) || 'base'];
    return md && { key: key, img: md.img, imgW: md.imgW, imgH: md.imgH, scale: md.scale, pxW: md.W * T, pxH: md.H * T };
  };
  SW.inBase = () => { const S = SK.G.season; return SK.G.state === 'season' && !!S && S.map === 'base'; };
  // Bảng đồ vứt một chồng ra đất: rơi dưới chân, nhặt lại bằng E.
  SK.on('seasonDrop', (G, st) => {
    if (!G || G.state !== 'season' || !G.season || !st || !G.player) return;
    const [x, y] = freeNear(G.map, G.player.x + SK.randf(-10, 10), G.player.y + 8);
    G.season.loot.push({ id: st.id, n: st.n || 1, x, y, t: 0, st });
  });
  // Người chơi đang đứng gần công trình nào (nhà kho, cửa hàng...) — bảng UI dùng để mở ô kho.
  SW.near = function (kind, reach) {
    const G = SK.G, p = G.player;
    if (!p || !G.map || !G.map.buildings) return false;
    return G.map.buildings.some(b => b.kind === kind && Math.hypot(b.x - p.x, b.y + 6 - p.y) < (reach || 44));
  };
})();
