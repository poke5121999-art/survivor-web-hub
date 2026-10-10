// Chỉ Huy Nhỏ (G.mode === 'troop'): Chế độ Ải mà người chơi điều khiển một pet (HP 3, giáp 1, NL 160, cắn 5, không nhận sát
// thương), thuê anh hùng làm lính bằng Xu Mèo, nâng cờ để đội thêm quân, hợp nhất ba lính cùng loại. Số liệu: wiki Little_Commander
// (tools/polish/MODES.md mục 2g) [WIKI LC]; chỗ wiki không có số ghi [ƯỚC LƯỢNG]. Chưa làm: xem tools/polish/GAPS.md.
//   G.troop = {coins, flag (1..5), chest (0..3), recs: [{hero, up, hp, armor, dead}], stock: [hero|null], chestOpen, stats}
//   Lính = SK.addWeaponAlly (js/actors.js) vẽ hình anh hùng; rec là nguồn sự thật, lính sống chỉ là thân xác của rec.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, W = SK.world;

  const C = SK.TROOP = {
    pet: { hp: 3, armor: 1, energy: 160, bite: 5 },                       // [WIKI LC "Basic Properties"]
    hire: 4, refresh: 1, mergeAt: 3, sameMax: 2, reviveFrac: 0.1, healMul: 10,
    // cấp cờ 1..5: số lính tối đa / số lính chờ / giá nâng lên cấp đó [LOC troop/flag_*; WIKI LC]
    flag: [{ max: 2, stock: 2, cost: 0 }, { max: 3, stock: 3, cost: 1 }, { max: 4, stock: 3, cost: 3 }, { max: 5, stock: 4, cost: 5 }, { max: 6, stock: 5, cost: 7 }],
    chest: { coins: [2, 3, 4, 5], cost: [0, 3, 6, 9] },                  // rương trắng/nâu/lam/vàng: xu thu và giá nâng [WIKI LC]
    coins: { grey: 1, boss: 3 },                                          // dọn phòng thường 1, trùm 3 [WIKI LC]; mỏ vàng chưa có ở web
    healTeam: { cost: 60, hp: 10, armor: 5, cd: 15 }                      // Túi Chữa Trị [WIKI LC]; hồi chiêu [ƯỚC LƯỢNG]
  };
  // 17 anh hùng làm lính: id web -> [HP, giáp, chí mạng %, hồi chiêu kỹ năng giây]; bản nâng gấp đôi HP/giáp/chí mạng [WIKI LC "Mercenaries"].
  // (Rogue = ranger, Elf = elves, Berserker = viking, Necromancer = necromancer, Officer = officer.)
  const H = C.HEROES = {
    knight: [60, 8, 5, 10], ranger: [60, 6, 10, 7], mage: [40, 12, 0, 4.5], assassin: [60, 8, 10, 30], alchemist: [50, 7, 5, 10],
    engineer: [50, 10, 5, 12], vampire: [50, 5, 5, 15], paladin: [45, 20, 0, 16], elves: [50, 6, 10, 15], werewolf: [80, 1, 5, 18],
    priest: [40, 7, 0, 18], druid: [60, 5, 0, 99], robot: [50, 11, 0, 10], viking: [80, 3, 5, 15], necromancer: [40, 11, 0, 5],
    officer: [60, 6, 10, 13], taoist: [50, 7, 0, 8]
  };
  C.ids = Object.keys(H);
  const heroName = id => (DS.heroes[id] && DS.heroes[id].name) || id;
  const stat = rec => { const s = H[rec.hero], k = rec.up ? 2 : 1; return { hp: s[0] * k, armor: s[1] * k, crit: s[2] * k }; };

  // Vũ khí cắn của pet (cận chiến cũ legacyRun/WEAPON_KINDS.melee): 5 sát thương, tầm ngắn [WIKI LC]; nhịp và tầm [ƯỚC LƯỢNG].
  // Không liệt kê (như _claw ở skills.js): vũ khí ẩn, không có sprite, không được vào bể rơi đồ.
  Object.defineProperty(DS.weapons, 'troop_bite', { configurable: true, writable: true, enumerable: false, value: {
    name: 'Cắn', nameEn: 'Bite', kind: 'melee', dmg: C.pet.bite, crit: 0, range: 22, arc: 150, repel: 3, rps: 2.5, cost: 0,
    grade: 1, rarity: 'White', sprite: null, moveMod: 0 } });

  const T = SK.troop = { C };
  const on = G => G && G.mode === 'troop' && G.troop;
  const flagOf = t => C.flag[t.flag - 1];
  T.cap = G => flagOf(G.troop).max;
  T.living = G => G.troop.recs.filter(r => !r.dead);

  T.init = function (G) {
    G.petOff = true;   // người chơi LÀ pet: không thêm pet đi theo
    const hero = H[G.heroId] ? G.heroId : 'knight';   // nhân vật chọn ở Phòng Khách là lính đầu tiên (miễn phí) [WIKI LC]
    const t = { coins: 0, flag: 1, chest: 0, recs: [], stock: [], chestOpen: false, stats: { hired: {}, merged: 0, wins: 0 }, allies: new Map() };
    t.recs.push(newRec(hero)); t.stats.hired[hero] = 1;
    return t;
  };
  SK.on('runStart', G => { if (G.mode !== 'troop' && G._troopOff) { G.petOff = false; G._troopOff = false; } });

  function newRec(hero) { const s = stat({ hero, up: false }); return { hero, up: false, hp: s.hp, armor: s.armor, dead: false }; }
  function fill(rec) { const s = stat(rec); rec.hp = s.hp; rec.armor = s.armor; rec.dead = false; }

  // ---- lính thân xác: AI theo chủ, đánh quái trong 12 đv như SK.addMercenary
  const U = SK.PPU;
  function nearest(G, x, y, r) {
    let best = null, bd = r;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead') continue;
      const ey = e.y - e.hb.off[1] * e.scale, d = Math.hypot(e.x - x, ey - y);
      if (d < bd && W.los(G.map, x, y, e.x, ey)) { best = e; bd = d; }
    }
    return best;
  }
  function spawnAlly(G, rec, x, y) {
    const t = G.troop, p = G.player, hd = SK.heroSkin(rec.hero, 0) || {}, w = DS.weapons[DS.heroes[rec.hero].weapon] || {};
    const spd = 7 * U, ranged = w.kind !== 'melee';
    const a = SK.addWeaponAlly(G, {
      troop: rec, x, y: Math.max(y, p.y - 2), cd: 1, owner: p,
      get hp() { return rec.hp; },
      // giáp trừ trước, HP sau; cộng máu đi thẳng [WIKI LC: lính có HP và giáp riêng]
      set hp(v) {
        if (v < rec.hp) { let d = rec.hp - v; const ab = Math.min(rec.armor, d); rec.armor -= ab; d -= ab; rec.hp -= d; } else rec.hp = v;
      },
      get hpMax() { return stat(rec).hp; },
      update(G2, a2, dt) {
        a2.moving = false; a2.cd -= dt;
        const e = nearest(G2, a2.x, a2.y - 7, 12 * U);
        const dp = Math.hypot(p.x - a2.x, p.y - a2.y);
        if (dp > 20 * U) { a2.x = p.x - p.face * 8; a2.y = p.y; return; }
        const walk = (tx, ty) => {
          const dx = tx - a2.x, dy = ty - a2.y, d = Math.hypot(dx, dy); if (d < 1) return;
          const s = Math.min(d, spd * dt); SK.moveBox(G2.map, a2, dx / d * s, dy / d * s, 4);
          if (Math.abs(dx) > 1) a2.face = dx > 0 ? 1 : -1; a2.moving = true;
        };
        if (!e) { if (dp > 2 * U) walk(p.x, p.y); return; }
        const ey = e.y - e.hb.off[1] * e.scale, d = Math.hypot(e.x - a2.x, ey - (a2.y - 7));
        a2.face = e.x >= a2.x ? 1 : -1;
        if (!ranged && d > 2 * U) { walk(e.x, e.y); return; }
        if (a2.cd > 0) return;
        a2.cd = Math.max(0.45, 1 / (w.rps || 2));
        const ang = Math.atan2(ey - (a2.y - 7), e.x - a2.x), crit = SK.rand() * 100 < stat(rec).crit;
        const dmg = (w.dmg || 3) * (crit ? 2 : 1);
        if (!ranged) { SK.hurtEnemy(G2, e, dmg, crit, ang, 2); return; }
        SK.spawnBullet86(G2, 'p', 'bullet_1', a2.x + Math.cos(ang) * 6, a2.y - 7 + Math.sin(ang) * 6, ang + (SK.rand() - 0.5) * 0.1, { dmg, crit, repel: 1, owner: a2, h: 7, spd: 30 });
      },
      onDie(G2, a2) { a2.gone = true; rec.dead = true; rec.hp = 0; t.allies.delete(rec); SK.emit('troopDie', G2, rec); },
      draw(ctx, G2, a2) {
        const an = hd, key = a2.moving ? an.run : an.idle, fr = key && SK.animFrame(key, a2.t);
        if (!fr || !SK.draw(ctx, fr, a2.x, a2.y, { flip: a2.face < 0, pages: a2.flash > 0 ? SK.pagesWhite : null })) { ctx.fillStyle = '#9fd2ff'; ctx.fillRect(a2.x - 4, a2.y - 12, 8, 12); }
        if (rec.up) SK.text(ctx, '★', a2.x, a2.y - 22, 7, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
      }
    });
    t.allies.set(rec, a);
    return a;
  }
  T.allyOf = (G, rec) => G.troop.allies.get(rec) || null;
  // Dựng lại thân xác của mọi rec còn sống (qua cổng, hợp nhất, hồi sinh).
  function respawnAll(G) {
    const t = G.troop, p = G.player;
    for (const a of t.allies.values()) a.gone = true;
    t.allies.clear();
    t.recs.forEach((rec, i) => { if (!rec.dead) spawnAlly(G, rec, p.x - p.face * (8 + i * 6), p.y); });
  }
  T.respawn = G => respawnAll(G);

  // ---- thuê / hợp nhất / nâng cờ / rương / làm mới. Trả {ok, why} để bộ kiểm đọc.
  const say = (G, msg) => { G.toast(msg, 2.2); return msg; };
  T.hire = function (G, hero) {
    const t = G.troop; if (!t || !H[hero]) return { ok: false, why: 'unknown' };
    const same = t.recs.filter(r => r.hero === hero && !r.up);
    const merge = same.length >= C.mergeAt - 1;   // lính thứ 3 cùng loại (bản thường)
    if (!merge && t.recs.length >= T.cap(G)) return { ok: false, why: say(G, 'Lính Thuê đã đạt tối đa') };
    if (t.coins < C.hire) return { ok: false, why: say(G, 'Không đủ Xu Mèo') };
    t.coins -= C.hire;
    t.stats.hired[hero] = (t.stats.hired[hero] || 0) + 1;
    if (merge) {
      // rơi hết vũ khí (lính web chỉ cầm vũ khí khởi đầu nên không có gì rơi), nhận bản nâng: HP/giáp/chí mạng gấp đôi
      for (const r of same.slice(0, C.mergeAt - 1)) t.recs.splice(t.recs.indexOf(r), 1);
      const up = { hero, up: true, hp: 0, armor: 0, dead: false }; fill(up); t.recs.push(up); t.stats.merged++;
      say(G, heroName(hero) + ' hợp nhất thành bản nâng cấp!');
    } else { const r = newRec(hero); t.recs.push(r); say(G, 'Đã thuê ' + heroName(hero)); }
    const i = t.stock.indexOf(hero); if (i >= 0) t.stock[i] = null;
    respawnAll(G); rebuild(G); SK.emit('troopHire', G, hero, merge);
    return { ok: true, merged: merge };
  };
  T.upgradeFlag = function (G) {
    const t = G.troop; if (t.flag >= C.flag.length) return { ok: false, why: say(G, 'Cờ đã ở cấp cao nhất') };
    const cost = C.flag[t.flag].cost;
    if (t.coins < cost) return { ok: false, why: say(G, 'Không đủ Xu Mèo') };
    t.coins -= cost; t.flag++;
    while (t.stock.length < flagOf(t).stock) t.stock.push(SK.pick(C.ids));
    say(G, 'Cờ lên cấp ' + t.flag + ': tối đa ' + flagOf(t).max + ' lính');
    rebuild(G); return { ok: true };
  };
  T.refresh = function (G) {
    const t = G.troop;
    if (t.coins < C.refresh) return { ok: false, why: say(G, 'Không đủ Xu Mèo') };
    t.coins -= C.refresh; rollStock(G); say(G, 'Đã làm mới hàng lính chờ'); rebuild(G);
    SK.emit('troopRefresh', G); return { ok: true };
  };
  function rollStock(G) {
    const t = G.troop; t.stock = [];
    for (let i = 0; i < flagOf(t).stock; i++) t.stock.push(SK.pick(C.ids));
  }
  T.openChest = function (G) {
    const t = G.troop;
    if (t.chestOpen) return { ok: false, why: say(G, 'Rương đã mở') };
    t.chestOpen = true; const n = C.chest.coins[t.chest]; t.coins += n; say(G, '+' + n + ' Xu Mèo'); rebuild(G);
    return { ok: true, coins: n };
  };
  T.upgradeChest = function (G) {
    const t = G.troop; if (t.chest >= 3) return { ok: false, why: say(G, 'Rương đã ở cấp cao nhất') };
    const cost = C.chest.cost[t.chest + 1];
    if (t.coins < cost) return { ok: false, why: say(G, 'Không đủ Xu Mèo') };
    t.coins -= cost; t.chest++;   // đã mở rồi thì nâng không nạp lại xu [WIKI LC]
    say(G, 'Rương nâng cấp: mỗi ải thu ' + C.chest.coins[t.chest] + ' Xu Mèo'); rebuild(G);
    return { ok: true };
  };
  T.addCoins = function (G, n) { G.troop.coins += n; if (n > 0) SK.num(G, G.player.x, G.player.y - 30, '+' + n, '#ffd84a'); };

  // ---- Túi Chữa Trị: kỹ năng pet (thay kỹ năng anh hùng): mọi lính +10 HP +5 giáp [WIKI LC]
  SK.SKILLS.troop_heal = {
    start(G, p) {
      if (!on(G)) return;
      if (p.energy < C.healTeam.cost) { G.toast('Hết năng lượng!'); return; }
      p.energy -= C.healTeam.cost;
      for (const rec of G.troop.recs) {
        if (rec.dead) continue; const s = stat(rec);
        rec.hp = Math.min(s.hp, rec.hp + C.healTeam.hp); rec.armor = Math.min(s.armor, rec.armor + C.healTeam.armor);
        const a = T.allyOf(G, rec); if (a) SK.num(G, a.x, a.y - 24, '+' + C.healTeam.hp, '#6cff8a');
      }
      SK.emit('troopHeal', G);
    }
  };

  // ---- vào chế độ: người chơi thành pet
  SK.on('runStart', G => {
    if (!on(G)) return;
    const p = G.player, pet = SK.profile && SK.profile.pet ? SK.profile.pet() : 'pet0';
    p.hpMax = p.hp = C.pet.hp; p.armorMax = p.armor = C.pet.armor; p.energyMax = p.energy = C.pet.energy;
    p.weapons = [SK.makeWeapon('troop_bite'), null]; p.cur = 0; p.hideHeld = true;
    p.petId = D.prefabs[pet] ? pet : 'pet0';
    const h2 = {}; for (const k in p.h) h2[k] = p.h[k];   // sao chép đủ cả thuộc tính thừa kế (kiểu skin)
    h2.skill = Object.assign({}, p.h.skill, { id: 'troop_heal', cd: C.healTeam.cd }); p.h = h2;
    G._troopOff = true;
  });
  // Pet không nhận sát thương [WIKI LC]; đạn trúng pet đổ lên lính gần chủ nhất [ƯỚC LƯỢNG: wiki không nói đòn của quái rơi vào ai].
  const hurtPlayer0 = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, ...rest) {
    if (!on(G)) return hurtPlayer0(G, dmg, ...rest);
    if (dmg > 0) {
      const p = G.player, alive = [...G.troop.allies.values()].filter(a => !a.dead && !a.gone);
      alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const a = alive[0]; if (a) { a.hp -= dmg; a.flash = 0.1; SK.num(G, a.x, a.y - 22, dmg, '#ff4a4a'); if (a.hp <= 0 && !a.dead) { a.dead = true; a.onDie(G, a); } }
    }
    return false;
  };
  const drawPlayer0 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    if (!on(G) || !G.player || !G.player.petId) return drawPlayer0(ctx, G);
    const p = G.player, parts = D.prefabs[p.petId];
    if (p.invulT > 0 && p.st !== 'dead' && Math.floor(p.invulT * 14) % 2 === 0) return;
    const w = p.weapons[0];
    if (w && w.swing > 0) p._biteAt = G.t;   // clip cắn chạy ~0,4 s sau mỗi đòn
    const st = p._biteAt != null && G.t - p._biteAt < 0.4 ? 'atk' : p.moving ? 'run' : 'ide';
    ctx.save(); ctx.globalAlpha = G.phase === 'portal' ? Math.max(0, 1 - G.phaseT / 0.6) : 1;
    if (!parts || !SK.drawPrefab(ctx, parts, p.x, p.y, { state: st, t: p.t, flip: p.face < 0 })) { ctx.fillStyle = '#e8b45a'; ctx.fillRect(p.x - 6, p.y - 12, 12, 12); }
    ctx.restore();
  };

  // ---- phòng đầu: cờ, rương, mèo nâng rương, Thầy Huấn Luyện, hàng lính chờ [WIKI LC "Properties"]
  let base = null;   // {x, y} giữa phòng đầu của ải hiện tại
  function clearBase(G) {
    for (const o of G.interactables) if (o.tr) o.gone = true;
    G.interactables = G.interactables.filter(o => !o.tr);
    G.props = G.props.filter(pr => !pr.tr);
  }
  function stand(G, x, y, label, use, draw) {
    G.interactables.push({ tr: 1, x, y: y + 4, r: 14, labelY: 34, label, use: () => use(G) });
    G.props.push({ tr: 1, x, y, draw: (ctx, G2) => draw(ctx, G2, x, y) });
  }
  function heroSprite(ctx, hero, x, y, t) {
    const hd = SK.heroSkin(hero, 0), fr = hd && hd.idle && SK.animFrame(hd.idle, t);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (!fr || !SK.draw(ctx, fr, x, y, {})) { ctx.fillStyle = '#9fd2ff'; ctx.fillRect(x - 4, y - 12, 8, 12); }
  }
  function rebuild(G) {
    if (!on(G) || !base) return;
    clearBase(G);
    const t = G.troop, bx = base.x, by = base.y;
    // hàng lính chờ ở hàng trên
    const n = t.stock.length;
    t.stock.forEach((hero, i) => {
      const x = bx + (i - (n - 1) / 2) * 26, y = by - 30;
      if (!hero) { stand(G, x, y, 'Chỗ trống (làm mới để có lính mới)', () => {}, (ctx, G2, X, Y) => { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(X - 5, Y - 2, 10, 3); }); return; }
      const same = t.recs.filter(r => r.hero === hero && !r.up).length;
      stand(G, x, y, 'Thuê ' + heroName(hero) + ' (' + C.hire + ' xu)' + (same >= C.mergeAt - 1 ? ' - hợp nhất' : ''), g => T.hire(g, hero),
        (ctx, G2, X, Y) => { heroSprite(ctx, hero, X, Y, G2.t); SK.text(ctx, String(C.hire), X, Y - 24, 7, '#ffd84a', 'center', 'rgba(0,0,0,0.9)'); });
    });
    const f = flagOf(t), nextF = t.flag < C.flag.length ? C.flag[t.flag] : null;
    stand(G, bx - 54, by + 6, nextF ? 'Nâng cờ lên cấp ' + (t.flag + 1) + ' (' + nextF.cost + ' xu)' : 'Cờ cấp cao nhất', g => T.upgradeFlag(g),
      (ctx, G2, X, Y) => {
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(X - 1, Y - 26, 2, 26);
        ctx.fillStyle = '#e0453a'; ctx.beginPath(); ctx.moveTo(X + 1, Y - 26); ctx.lineTo(X + 15, Y - 21); ctx.lineTo(X + 1, Y - 15); ctx.fill();
        SK.text(ctx, String(t.flag), X + 7, Y - 18, 7, '#fff', 'center', 'rgba(0,0,0,0.9)');
      });
    const cc = C.chest.coins[t.chest];
    stand(G, bx - 18, by + 10, t.chestOpen ? 'Rương đã mở' : 'Mở rương (+' + cc + ' xu)', g => T.openChest(g),
      (ctx, G2, X, Y) => {
        const col = ['#e8e8e8', '#a8743a', '#4a8ae8', '#f0c03a'][t.chest];
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X, Y, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(X - 9, Y - 12, 18, 12); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(X - 9, Y - 12, 18, t.chestOpen ? 12 : 3);
      });
    const nc = t.chest < 3 ? C.chest.cost[t.chest + 1] : 0;
    stand(G, bx + 18, by + 10, t.chest < 3 ? 'Mèo May Mắn: nâng rương (' + nc + ' xu)' : 'Rương cấp cao nhất', g => T.upgradeChest(g),
      (ctx, G2, X, Y) => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X, Y, 8, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0c03a'; ctx.fillRect(X - 6, Y - 12, 12, 12); ctx.fillRect(X - 6, Y - 16, 3, 4); ctx.fillRect(X + 3, Y - 16, 3, 4);
      });
    stand(G, bx + 54, by + 6, 'Thầy Huấn Luyện: làm mới hàng lính (' + C.refresh + ' xu)', g => T.refresh(g),
      (ctx, G2, X, Y) => heroSprite(ctx, 'officer', X, Y, G2.t));
    void f;
  }

  SK.on('stageEnter', G => {
    if (!on(G)) return;
    const t = G.troop, p = G.player;
    for (const rec of t.recs) fill(rec);   // qua cổng: hồi đầy HP/giáp và hồi sinh mọi lính [WIKI LC]
    respawnAll(G);
    t.chestOpen = false; rollStock(G);
    const [cx, cy] = W.roomCenter(G.map.rooms[0]); base = { x: cx, y: cy };
    rebuild(G);
    // người chơi đứng dưới hàng quầy để thấy cả hàng
    p.y = cy + 28;
    G.props.push({ tr: 1, x: 0, y: 0, draw() {}, update(G2) {
      if (!on(G2) || G2.player.st === 'dead') return;
      if (T.living(G2).length === 0) { G2.toast('Diệt hết', 3); SK.emit('troopWipe', G2); G2.player.hp = 0; G2.player.st = 'dead'; G2.player.stT = 0; }
    } });
  });
  // Dọn phòng: Xu Mèo, hồi giáp và hồi sinh lính [WIKI LC]
  SK.on('roomClear', (G, r) => {
    if (!on(G)) return;
    const t = G.troop;
    if (r.type === 'boss') T.addCoins(G, C.coins.boss);
    else if (r.type === 'battle') T.addCoins(G, C.coins.grey);
    for (const rec of t.recs) {
      const s = stat(rec);
      if (rec.dead) { rec.dead = false; rec.hp = Math.max(1, Math.round(s.hp * C.reviveFrac)); rec.armor = s.armor; }
      else rec.armor = s.armor;
    }
    if (t.recs.some(rec => !T.allyOf(G, rec))) respawnAll(G);
  });

  // ---- HUD: Xu Mèo, cờ, thanh HP/giáp từng lính
  SK.on('hud', (ctx, G) => {
    if (!on(G) || !G.map) return;
    const t = G.troop, v = SK.view;
    SK.text(ctx, 'Xu Mèo ' + t.coins + '   Cờ ' + t.flag + '   Lính ' + t.recs.length + '/' + flagOf(t).max, v.w / 2, 14, 9, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
    t.recs.forEach((rec, i) => {
      const s = stat(rec), x = v.w / 2 - (t.recs.length - 1) * 22 + i * 44, y = 22;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 20, y, 40, 8);
      ctx.fillStyle = rec.dead ? '#555' : '#e0453a'; ctx.fillRect(x - 19, y + 1, 38 * Math.max(0, rec.hp) / s.hp, 3);
      ctx.fillStyle = '#9aa4b5'; ctx.fillRect(x - 19, y + 4, 38 * Math.max(0, rec.armor) / Math.max(1, s.armor), 3);
      SK.text(ctx, heroName(rec.hero).slice(0, 8) + (rec.up ? '★' : ''), x, y + 15, 6, rec.dead ? '#888' : '#fff', 'center', 'rgba(0,0,0,0.9)');
    });
  });

  T.start = hero => SK.startRun(hero || 'knight', 'troop', []);
  if (window.SK_GAME && SK_GAME.debug) SK_GAME.debug.troop = hero => { T.start(hero); return true; };
})();
