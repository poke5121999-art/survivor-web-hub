// Tầng 4 = "ải mở rộng" của Chế độ Ải thường (tools/polish/FLOOR4.md). Sau trùm 3-5 Kẻ Vượt Ranh Giới hiện ra, mở cổng tím
// sang 4-1 nếu trả 100 vàng hoặc 1 HP tối đa; không trả thì 3-5 kết thúc như cũ (thắng ở cổng thường).
// Làm xong: 4A Di Tích Núi Khối (chủ đề 'monolith', 5 ải 4-1..4-5, 7 quái e_stone_*, 4 trùm trong js/bosses/).
// 4B Chiến Trường Cổ (chủ đề 'battleground', 6 quái e_mob0..5, 4-3 dùng phòng r4b_*): cổng tím bốc 4A hoặc 4B cùng trọng số
// [FLOOR4.md 9: wiki chỉ nói "có thể là một trong ba vùng", không có bảng trọng số]; trùm 4-5 của 4B mượn Hulala (GAPS.md).
// Chưa làm (GAPS.md): 4C Đáy Biển (oxy), thiên phú sau 4-2, ải kết 4-6.
// Nhãn: [LOC khoá] localization_en_vi, [CFG bảng.khoá] config, [WIKI trang], [ĐO] dữ liệu bundle, [SUY] suy luận, [ƯỚC LƯỢNG] tự đặt.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, T = SK.TILE, U = SK.PPU, W = SK.world;
  if (!SK.AI || !D.themes.monolith) return;
  const F4 = SK.floor4 = {};

  // ---------------------------------------------------------------- bốc quái theo trọng số [CFG map_levels.map_A16..A20.Enemies]
  // Trọng số gốc (man, eagle, dog, horse, ox, chariot, origin_stone); weight 0 = không ra ở ải đó.
  const WEIGHTS = {
    1: { e_stone_man: 40, e_stone_dog: 30, e_stone_horse: 20, e_origin_stone: 5 },
    2: { e_stone_man: 40, e_stone_eagle: 10, e_stone_dog: 20, e_stone_horse: 20, e_origin_stone: 5 },
    3: { e_stone_man: 30, e_stone_eagle: 15, e_stone_dog: 20, e_stone_horse: 15, e_stone_ox: 10, e_origin_stone: 5 },
    4: { e_stone_man: 30, e_stone_eagle: 10, e_stone_dog: 10, e_stone_horse: 20, e_stone_ox: 15, e_stone_chariot: 15, e_origin_stone: 5 },
    5: { e_stone_man: 30, e_stone_eagle: 10, e_stone_dog: 5, e_stone_horse: 10, e_stone_ox: 15, e_stone_chariot: 20, e_origin_stone: 5 }
  };
  F4.WEIGHTS = WEIGHTS;
  // Danh sách có lặp (mỗi 5 điểm trọng số một lần) cho game.js buildWaves: SK.pick trên danh sách này ra đúng tỉ lệ.
  F4.roster = function (n) {
    const w = WEIGHTS[n] || WEIGHTS[5], out = [];
    for (const [id, k] of Object.entries(w)) for (let i = 0; i < k / 5; i++) out.push(id);
    return out;
  };

  // ---------------------------------------------------------------- 4B Chiến Trường Cổ [CFG map_levels.map_B16..B20.Enemies]
  // Trọng số (mob0 Lính Giáo Dài, mob1 Cung, mob2 Kỵ, mob3 Quạt, mob4 Địa Lôi, mob5 Bắt Lưới); weight 0 hoặc vắng = không ra.
  const WEIGHTS_B = {
    1: { e_mob0: 85, e_mob2: 5, e_mob4: 10 },
    2: { e_mob0: 70, e_mob1: 5, e_mob2: 5, e_mob4: 10 },
    3: { e_mob0: 78, e_mob1: 3, e_mob2: 3, e_mob3: 3, e_mob4: 10, e_mob5: 3 },
    4: { e_mob0: 78, e_mob1: 3, e_mob2: 3, e_mob3: 3, e_mob4: 10, e_mob5: 3 },
    5: { e_mob0: 78, e_mob1: 3, e_mob2: 3, e_mob3: 3, e_mob4: 10, e_mob5: 3 }
  };
  F4.WEIGHTS_B = WEIGHTS_B;
  // Máu quái 4B: config ghi 16 giữ chỗ, dùng số wiki [WIKI Ancient Battleground]: thường / Tinh Anh
  const HP_B = { 0: [14, 96], 1: [14, 72], 2: [40, 96], 3: [22, 72], 4: [19, 72], 5: [22, 72] };
  const thB = D.themes.battleground;
  if (thB) {
    for (const [k, [n, ex]] of Object.entries(HP_B)) {
      if (D.enemies['e_mob' + k]) D.enemies['e_mob' + k].hp = n;
      if (D.enemies['ex_mob' + k]) D.enemies['ex_mob' + k].hp = ex;
    }
    // game.js buildWaves đọc th.enemies: trả danh sách có lặp theo trọng số của ải đang chơi (SK.pick ra đúng tỉ lệ), khi ngoài 4B trả danh sách đủ.
    const base = thB.enemies.slice();
    Object.defineProperty(thB, 'enemies', { configurable: true, enumerable: true, get() {
      const st = SK.G && SK.G.stage;
      if (!st || st.theme !== 'battleground' || !st.n) return base;
      const w = WEIGHTS_B[st.n] || WEIGHTS_B[5], out = [];
      for (const [id, k] of Object.entries(w)) for (let i = 0; i < k; i++) out.push(id);
      return out;
    } });
    F4.baseB = base;
  }
  // Mẫu phòng 4-3 của 4B ghi pts 35000/40000 (đơn vị gốc, quái đứng sẵn sau rào chứ không bốc theo điểm): web bốc theo điểm nên đặt số hợp lý [ƯỚC LƯỢNG]
  if (D.patterns) {
    if (D.patterns.r4b_long) D.patterns.r4b_long.pts = 30;
    for (let i = 0; i < 3; i++) if (D.patterns['r4b_big_' + i]) D.patterns['r4b_big_' + i].pts = 24;
  }
  // AI quái 4B: lớp Unity AIBrain (p rỗng, logic IL2CPP) viết lại theo mô tả wiki, mượn AI có sẵn [ƯỚC LƯỢNG]:
  //   Lính Giáo Dài: lao vào đâm; Lính Cung: đứng xa bắn; Lính Kỵ: gồng rồi húc; Lính Quạt: bắn nhanh gần; Địa Lôi: lao vào áp sát; Bắt Lưới: bắn chậm.
  const MOB = { 0: ['EnemyAI02', { shoot_cd: 1.4, atk_range: 2.4 }], 1: ['EnemyAI03', { shoot_cd: 2.2 }], 2: ['EnemyAI04', { shoot_cd: 2.4, sprintForce: 8 }],
    3: ['EnemyAI03', { shoot_cd: 1.4 }], 4: ['EnemyAI02', { shoot_cd: 1.2, atk_range: 1.6 }], 5: ['EnemyAI03', { shoot_cd: 2.8 }] };

  // ---------------------------------------------------------------- AI quái 4A (lớp Unity có p rỗng, logic nằm trong IL2CPP)
  // Viết lại theo mô tả wiki và state của controller, mượn hành vi của AI có sẵn [ƯỚC LƯỢNG]:
  //   Chiến Binh (EnemyRider): đứng xa bắn 5 viên đạn nhỏ; gốc còn cưỡi Ngựa/Bò/Đại Bàng/Xe, web chưa có cơ chế cưỡi.
  //   Ngựa, Bò, Xe Ngựa: gồng rồi húc thẳng (skill_1..3 của controller); Chó Săn, Đại Bàng: lao vào cắn/mổ.
  const A = SK.AI;
  const via = (name, patch) => (G, e, dt) => {
    if (patch && !e._f4) { e._f4 = 1; Object.assign(e.p, patch); }
    return A[name](G, e, dt);
  };
  A.EnemyRider = via('EnemyAI03', { shoot_cd: 2.4 });
  A.EnemyStoneHorse = via('EnemyAI04', { shoot_cd: 2.2, sprintForce: 9 });
  A.EnemyStoneOx = via('EnemyAI04', { shoot_cd: 2.6, sprintForce: 7 });
  A.EnemyStoneChariot = via('EnemyAI04', { shoot_cd: 2.4, sprintForce: 8 });
  A.EnemyStoneEagle = via('EnemyAI02', { shoot_cd: 1.2, atk_range: 2.2 });
  A.EnemyExStoneEagle = A.EnemyStoneEagle;
  const brainOld = via('EnemyAI02', { shoot_cd: 1.1, atk_range: 2 });
  A.AIBrain = (G, e, dt) => {
    const m = /^ex?_mob(\d)$/.exec(e.id), k = m && MOB[m[1]];
    if (!k) return brainOld(G, e, dt);
    if (!e._f4) { e._f4 = 1; Object.assign(e.p, k[1]); }
    return A[k[0]](G, e, dt);
  };
  // Đá Thô: đứng yên; khi có quái bị thương trong 6 ô thì rung 1 giây rồi tự phá, hồi 60 máu (Tinh Anh 85) cho quái quanh nó [WIKI MMR]
  A.EnemyOriginStone = function (G, e, dt) {
    if (e.st !== 'idle') e.st = 'idle';
    e.cd -= dt;
    const hurt = G.enemies.some(o => o !== e && o.room === e.room && o.st !== 'dead' && o.hp < o.hpMax && Math.hypot(o.x - e.x, o.y - e.y) < 6 * T);
    if (e.fuse == null) { if (hurt && e.cd <= 0) e.fuse = 1; return; }
    e.fuse -= dt;
    e.flash = Math.max(e.flash, 0.05 * (Math.sin(e.fuse * 40) > 0));
    if (e.fuse > 0) return;
    const heal = e.elite ? 85 : 60;
    for (const o of G.enemies) {
      if (o === e || o.st === 'dead' || o.room !== e.room || Math.hypot(o.x - e.x, o.y - e.y) > 6 * T) continue;
      o.hp = Math.min(o.hpMax, o.hp + heal); SK.num(G, o.x, o.y - 24, '+' + heal, '#7bff8a');
    }
    if (SK.vfx && SK.vfx.spawn) SK.vfx.spawn(G, 'origin_stone_heal_effect', e.x, e.y - 6, {});
    e.hp = 0; e.noReward = true; SK.hurtEnemy(G, e, 9999, false, 0, 0);
  };

  // ---------------------------------------------------------------- Kẻ Vượt Ranh Giới + cổng tím [LOC extraditionNpc/*; CFG ExtraditionNpc: moneyCost 100, hpCost 1]
  const COST_GOLD = 100, COST_HP = 1;
  const TXT = {
    ask: 'Vết Nứt Thời Không lấp lánh trong không gian, bạn hồi đáp chứ? ' + COST_GOLD + ' Vàng',
    noMoney: 'Vàng không đủ? Đồng ý dùng ' + COST_HP + ' HP tối đa để hiến lễ?',
    noMaxHp: 'Bạn chưa chuẩn bị xong. ' + COST_GOLD + ' Vàng hoặc giới hạn ' + COST_HP + ', đâu mới là chìa khóa của bạn?',
    ready: 'Khe Nứt Thời Không đã mở, hãy tiến về tương lai.'
  };
  const state = G => (G.f4 = G.f4 || {});

  // Vùng của lượt: bốc 4A hoặc 4B cùng trọng số [SUY]; F4.force ('monolith' | 'battleground') ép vùng cho bộ kiểm.
  F4.ZONES = ['monolith', 'battleground'].filter(k => D.themes[k]);
  F4.force = null;
  F4.extend = function (stages) {
    if (stages.some(s => s.ext)) return false;
    const zone = F4.force && D.themes[F4.force] ? F4.force : SK.pick(F4.ZONES);
    for (let i = 1; i <= 5; i++) stages.push({ theme: zone, level: 4, n: i, label: '4-' + i, boss: i === 5, br: false, ext: true });
    return true;
  };

  // Mộng Du (SleepWalking: "Thứ tự Nhà Ngục bị làm rối") không có Kẻ Vượt Ranh Giới [WIKI Inter-dimension Traveler]
  function available(G) {
    return G.mode === 'level' && G.stage && G.stage.label === '3-5' && !G.stage.ext &&
      !(G.factors || []).some(f => /SleepWalking/i.test(f));
  }

  function npcSprite(G, face) {
    const h = D.heroes && D.heroes.transcendent, s = h && h.s0;
    return s ? SK.animFrame(s.idle, G.t) : null;
  }

  function spawnNpc(G, r) {
    const st = state(G);
    if (st.npc) return;
    const [cx, cy] = W.roomCenter(r);
    const [x, y] = SK.freeNear([cx - 88, cy + 20]);
    const free = G.heroId === 'transcendent';   // chơi chính Kẻ Vượt Ranh Giới thì miễn phí [WIKI]
    const npc = st.npc = { x, y, gone: false, draw(ctx, G2, o) {
      const fr = npcSprite(G2), p = G2.player;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 8, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      if (!fr || !SK.draw(ctx, fr, o.x, o.y, { sx: p.x < o.x ? -1 : 1 })) { ctx.fillStyle = '#7a3fd0'; ctx.fillRect(o.x - 6, o.y - 22, 12, 22); }
    } };
    G.props.push(npc);
    const open = () => {
      st.open = true; npc.gone = false;
      G.toast(TXT.ready, 3);
      const [gx, gy] = SK.freeNear([2 * cx - x, y]);
      st.gate = { x: gx, y: gy, t: 0, gone: false, update(G2, o, dt) {
        o.t += dt;
        const p = G2.player;
        if (G2.phase !== 'portal' && p.st !== 'dead' && o.t > 0.5 && Math.hypot(p.x - o.x, p.y - o.y) < 14) {
          G2.phase = 'portal'; G2.phaseT = 0; G2.extGo = true;
          SK.emit('portalEnter', G2, G2.stage);
        }
      }, draw(ctx, G2, o) {
        const pf = SK.prefab('transfer_gate_extendedLevel');
        const g = ctx.createRadialGradient(o.x, o.y - 20, 2, o.x, o.y - 20, 34);
        g.addColorStop(0, 'rgba(190,80,255,0.45)'); g.addColorStop(1, 'rgba(120,40,255,0)');
        ctx.fillStyle = g; ctx.fillRect(o.x - 40, o.y - 60, 80, 80);
        ctx.save(); ctx.imageSmoothingEnabled = true;
        SK.drawPrefab(ctx, pf, o.x, o.y, { t: o.t, state: o.t < 0.6 ? 'create_gate' : 'transfer_gate', scale: 0.5 });
        ctx.restore();
      } };
      G.props.push(st.gate);
      for (const it of G.interactables) if (it.f4) it.gone = true;
    };
    const mk = (dx, label, use) => G.interactables.push({ f4: 1, x: x + dx, y: y + 6, r: 20, labelY: 44, label, use });
    if (free) { mk(0, 'Kẻ Vượt Ranh Giới: mở cổng (miễn phí)', open); return; }
    mk(-14, 'Kẻ Vượt Ranh Giới: dâng ' + COST_GOLD + ' vàng', () => {
      const p = G.player;
      if (p.gold < COST_GOLD) { G.toast(p.hpMax > COST_HP ? TXT.noMoney : TXT.noMaxHp, 3); return; }
      p.gold -= COST_GOLD; st.paid = 'gold'; open();
    });
    mk(14, 'Kẻ Vượt Ranh Giới: hiến ' + COST_HP + ' HP tối đa', () => {
      const p = G.player;
      if (p.hpMax <= COST_HP) { G.toast(TXT.noMaxHp, 3); return; }
      p.hpMax -= COST_HP; p.hp = Math.min(p.hp, p.hpMax); st.paid = 'hp'; open();
    });
    G.toast(TXT.ask, 3);
  }

  // Trùm 4-5 của 4A: stone_man, warlord, stone_dragon [CFG map_levels.map_A20.Boss]; chỉ bốc trong số trùm đã có AI trong web.
  // (stone_man và stone_dragon là rig Spine/mesh: web chưa có bộ vẽ, xem GAPS.md.)
  F4.BOSSES45 = ['boss_stone_man', 'boss_warlord', 'boss_stone_dragon'];
  const bossWaves0 = SK.bossWaves;
  SK.bossWaves = function (G) {
    // 4B 4-5: trùm gốc Đổng Trác / Vũ Khí Cuối Cùng 01 chưa có rig bóc (GAPS.md), mượn trùm 4A đã có AI.
    if (G.stage && (G.stage.theme === 'monolith' || G.stage.theme === 'battleground') && !(SK.bossDebug && SK.bossDebug.force)) {
      const ok = F4.BOSSES45.filter(id => SK.BOSS_AIS && SK.BOSS_AIS[id]);
      if (ok.length) return [[SK.pick(ok)]];
    }
    return bossWaves0.apply(this, arguments);
  };

  SK.on('roomClear', (G, r) => { if (r.type === 'boss' && available(G)) spawnNpc(G, r); });
  SK.on('stageEnter', G => { G.f4 = null; G.extGo = false; });
})();
