// Tầng 4C Đáy Biển (chủ đề 'seabed', tools/polish/FLOOR4.md mục 4C): 6 quái e_seabed_mob0..5, bong bóng quái, thanh OXY.
// Cổng tím bốc 4A/4B/4C cùng trọng số [FLOOR4.md 9: wiki không có bảng trọng số]. Trùm 4-5 mượn bể trùm 4A (rig Thợ Lặn Vực Sâu là Spine, GAPS.md).
// Nhãn: [LOC khoá], [CFG bảng.khoá], [WIKI trang], [ĐO] dữ liệu bundle, [SUY] suy luận, [ƯỚC LƯỢNG] tự đặt (gốc không có số).
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, T = SK.TILE, U = SK.PPU, W = SK.world;
  const F4 = SK.floor4, th = D.themes.seabed;
  if (!F4 || !th || !SK.AI) return;

  // ---------------------------------------------------------------- bốc quái [CFG map_levels.map_C16..C20.Enemies]
  // mob0 Thủy Thủ Ký Sinh, mob1 Người Hầu Kraken, mob2..4 Thể Thí Nghiệm 001..003 (trong bong bóng), mob5 TTN-004.
  const WEIGHTS_C = {
    1: { e_seabed_mob0: 40, e_seabed_mob1: 35, e_seabed_mob2: 20 },
    2: { e_seabed_mob0: 35, e_seabed_mob1: 32, e_seabed_mob2: 22, e_seabed_mob3: 8 },
    3: { e_seabed_mob0: 40, e_seabed_mob1: 30, e_seabed_mob2: 25, e_seabed_mob3: 15, e_seabed_mob4: 10 },
    4: { e_seabed_mob0: 40, e_seabed_mob1: 30, e_seabed_mob2: 27, e_seabed_mob3: 15, e_seabed_mob4: 10, e_seabed_mob5: 8 },
    5: { e_seabed_mob0: 40, e_seabed_mob1: 30, e_seabed_mob2: 30, e_seabed_mob3: 20, e_seabed_mob4: 15, e_seabed_mob5: 10 }
  };
  F4.WEIGHTS_C = WEIGHTS_C;
  // Máu: config ghi 16 giữ chỗ, dùng số wiki [WIKI Undersea]: thường / Tinh Anh
  const HP_C = { 0: [40, 75], 1: [25, 47], 2: [35, 75], 3: [75, 100], 4: [100, 130], 5: [140, 175] };
  for (const [k, [n, ex]] of Object.entries(HP_C)) {
    if (D.enemies['e_seabed_mob' + k]) D.enemies['e_seabed_mob' + k].hp = n;
    if (D.enemies['ex_seabed_mob' + k]) D.enemies['ex_seabed_mob' + k].hp = ex;
    // Lớp AI Unity của 001..003 là PlayMakerFSM (ai rỗng): gắn AIBrain để SEA bên dưới điều khiển
    for (const id of ['e_seabed_mob' + k, 'ex_seabed_mob' + k]) {
      const d = D.enemies[id];
      if (d && !(d.ai && d.ai.length)) d.ai = [{ cls: 'AIBrain', p: {} }];
    }
  }
  const baseC = th.enemies.slice();
  Object.defineProperty(th, 'enemies', { configurable: true, enumerable: true, get() {
    const st = SK.G && SK.G.stage;
    if (!st || st.theme !== 'seabed' || !st.n) return baseC;
    const w = WEIGHTS_C[st.n] || WEIGHTS_C[5], out = [];
    for (const [id, k] of Object.entries(w)) for (let i = 0; i < k; i++) out.push(id);
    return out;
  } });

  // ---------------------------------------------------------------- vùng + trùm
  if (F4.ZONES.indexOf('seabed') < 0) F4.ZONES.push('seabed');
  const bossWaves0 = SK.bossWaves;
  SK.bossWaves = function (G) {
    // 4-5 của 4C: trùm gốc Thợ Lặn Vực Sâu (rig Spine, chưa vẽ được) → mượn trùm 4A đã có AI; 4C không có phòng trùm ở 4-3 [FLOOR4.md mục 1]
    if (G.stage && G.stage.theme === 'seabed' && !(SK.bossDebug && SK.bossDebug.force)) {
      if (SK.BOSS_AIS && SK.BOSS_AIS.boss_abyssal_submariner) return [['boss_abyssal_submariner']];   // trùm gốc 4C (Spine, js/bosses/boss_abyssal_submariner.js)
      const ok = F4.BOSSES45.filter(id => SK.BOSS_AIS && SK.BOSS_AIS[id]);
      if (ok.length) return [[SK.pick(ok)]];
    }
    return bossWaves0.apply(this, arguments);
  };

  // ---------------------------------------------------------------- OXY [WIKI Undersea; LOC seabed_oxygen]
  // Luật theo wiki: thanh dưới giữa màn, tụt dần từ phải sang trái, đầy lại khi vào ải mới; hết oxy thì mất 1 sát thương liên tục
  // (2 ở Lợi Hại: hurtPlayer đã cộng dmgAdd), trừ giáp trước máu, thú cưỡi chịu trước (hurtPlayer của mounts.js); bong bóng sàn hồi dần
  // và tăng tốc nhẹ; vỡ bong bóng quái khi ở gần cho một lượng oxy; Người Hầu Kraken hút oxy.
  // Mọi con số dưới đây là [ƯỚC LƯỢNG]: wiki/config không ghi thời lượng oxy, tốc độ tụt hay tốc độ hồi (FLOOR4.md 9).
  const OXY = F4.OXY = {
    max: 100,
    drain: 1.25,        // /giây: đầy → cạn sau 80 giây
    dmg: 1,             // sát thương mỗi nhịp khi hết oxy
    dmgEvery: 1,        // giây giữa hai nhịp [WIKI "1 damage"; nhịp 1 giây ƯỚC LƯỢNG]
    bubbleRate: 30,     // /giây khi đứng trong bong bóng sàn
    bubbleSpeed: 1.15,  // nhân tốc chạy khi ở trong bong bóng sàn ("tăng tốc nhẹ")
    popBurst: 15,       // oxy nhận khi vỡ bong bóng quái trong tầm
    popRange: 8 * T,
    kraken: 5,          // /giây Người Hầu Kraken hút khi thấy người chơi trong 10 ô
    krakenRange: 10 * T,
    spawnEvery: 7,      // giây giữa hai lần bong bóng sàn mới
    life: 9             // giây bong bóng sàn tồn tại
  };
  const ox = G => G.oxy;
  F4.addOxy = function (G, n) { const o = ox(G); if (o) o.v = Math.max(0, Math.min(OXY.max, o.v + n)); };

  function unboost(G) {
    const o = ox(G), p = G.player;
    if (o && o.boost && p) { p.moveMul = Math.round((p.moveMul || 1) / OXY.bubbleSpeed * 1e6) / 1e6; o.boost = false; }
  }

  // ---------------------------------------------------------------- bong bóng quái [WIKI Undersea: 001-003 sinh trong bong bóng 10 máu]
  const BUBBLE_HP = 10;
  const bubbled = id => /^ex?_seabed_mob[234]$/.test(id);
  const makeEnemy0 = SK.makeEnemy;
  SK.makeEnemy = function (G, id) {
    const e = makeEnemy0.apply(this, arguments);
    if (bubbled(id)) e.bubble = BUBBLE_HP;
    return e;
  };
  function pop(G, e) {
    e.bubble = 0; e.popped = true; e.flash = 0.1;
    (G.oxyBreaks = G.oxyBreaks || []).push({ x: e.x, y: e.y - 10, t: 0 });
    const p = G.player;
    if (G.oxy && p && Math.hypot(p.x - e.x, p.y - e.y) <= OXY.popRange) {
      F4.addOxy(G, OXY.popBurst); SK.num(G, p.x, p.y - 34, '+' + OXY.popBurst + ' O2', '#7fe9ff');
    }
    SK.emit('seabedBubblePop', G, e);
  }
  F4.popBubble = pop;
  const hurtEnemy0 = SK.hurtEnemy;
  SK.hurtEnemy = function (G, e, dmg) {
    if (e && e.bubble > 0 && e.st !== 'dead' && e.st !== 'spawn' && dmg < 9999) {
      // vũ khí tầm xa chỉ gây 1; vũ khí cận chiến hoặc tay không vỡ ngay [WIKI]
      const p = G.player, w = p && p.weapons && p.weapons[p.cur];
      const melee = !w || !w.def || w.def.kind === 'melee';
      e.bubble = melee ? 0 : e.bubble - 1; e.flash = 0.06;
      if (e.bubble <= 0) pop(G, e);
      return true;
    }
    return hurtEnemy0.apply(this, arguments);
  };

  // ---------------------------------------------------------------- AI quái 4C (lớp Unity là PlayMakerFSM/IL2CPP, viết lại theo wiki) [ƯỚC LƯỢNG]
  const A = SK.AI, aiOld = A.AIBrain;
  const sees = (G, e, r) => { const p = G.player; return p.st !== 'dead' && Math.hypot(p.x - e.x, p.y - e.y) < r && W.los(G.map, e.x, e.y - 6, p.x, p.y - 6); };
  const toP = (G, e) => Math.atan2(G.player.y - 7 - (e.y - 8), G.player.x - e.x);
  function orb(G, e, ang, spd, dmg) {
    G.bullets.push({ side: 'e', kind: 'orb', x: e.x, y: e.y - 8, h: 8, vx: Math.cos(ang) * spd * U, vy: Math.sin(ang) * spd * U, ang, dmg: dmg || 2, repel: 0, r: 3, life: 5, sprite: null });
  }
  function ring(G, e, n, a0, spd) { for (let i = 0; i < n; i++) orb(G, e, a0 + i * Math.PI * 2 / n, spd); }
  const patch = (e, o) => { if (!e._f4c) { e._f4c = 1; Object.assign(e.p, o); } };
  const SEA = {
    // Thủy Thủ Ký Sinh: bắn đạn tam giác nảy 1 lần để lại vệt đạn tròn (vũ khí gốc), đứng xa bắn
    0(G, e, dt) { patch(e, { shoot_cd: 2.2 }); return A.EnemyAI03(G, e, dt); },
    // Người Hầu Kraken: loạt 3 đạn nảy, giương gậy hút oxy (phần hút xử lý ở bộ điều phối oxy)
    1(G, e, dt) { patch(e, { shoot_cd: 2.6 }); return A.EnemyAI03(G, e, dt); },
    // TTN-001: trong bóng thả 16 đạn tròn toả ra; vỡ bóng thì biến mất rồi hiện sau lưng người chơi, nhô gai gây sát thương
    2(G, e, dt) {
      e.st = 'idle'; e.cd -= dt;
      if (e.bubble > 0) { if (e.cd <= 0 && sees(G, e, 14 * T)) { e.cd = 3.2; ring(G, e, 16, SK.rand() * 6.28, 5); } return; }
      e.ph = e.ph || 'wait';
      if (e.ph === 'wait') { if (e.cd <= 0) { e.ph = 'spike'; e.spT = 0.6; const p = G.player, [x, y] = SK.freeNear([p.x - (p.face < 0 ? -1 : 1) * 18, p.y]); e.x = x; e.y = y; } return; }
      e.spT -= dt; e.flash = Math.max(e.flash, 0.04 * (Math.sin(e.spT * 40) > 0));
      if (e.spT <= 0) {
        const p = G.player; if (Math.hypot(p.x - e.x, p.y - e.y) < 26) SK.hurtPlayer(G, 3, e.x, e.y);
        e.ph = 'wait'; e.cd = 3;
      }
    },
    // TTN-002: trong bóng không làm gì; vỡ thì nhả 4 chùm 16 đạn tròn
    3(G, e, dt) {
      e.st = 'idle';
      if (e.bubble > 0) return;
      e.cd -= dt;
      if (e.burstN > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burstT = 0.3; e.burstN--; ring(G, e, 16, e.burstN * 0.2 + SK.rand() * 0.1, 4.5); } return; }
      if (e.cd <= 0 && sees(G, e, 14 * T)) { e.cd = 4; e.burstN = 4; e.burstT = 0; }
    },
    // TTN-003: trong bóng toả khí độc tím; vỡ thì lao vào người chơi, vẫn toả khí độc
    4(G, e, dt) {
      patch(e, { shoot_cd: 3, sprintForce: 8 });
      if (e.bubble > 0) { e.st = 'idle'; return; }
      return A.EnemyAI04(G, e, dt);
    },
    // TTN-004: vuốt cận chiến; định kỳ phun loạt đạn tròn đỏ hoặc bong bóng oxy
    5(G, e, dt) {
      patch(e, { shoot_cd: 1.4, atk_range: 2.2 });
      e.spit = (e.spit == null ? 3 : e.spit) - dt;
      if (e.spit <= 0 && sees(G, e, 12 * T)) {
        e.spit = SK.randf(3, 4.5);
        if (SK.chance(0.4)) spawnBubble(G, e.x + SK.randf(-30, 30), e.y + SK.randf(8, 28), 8);
        else { const a = toP(G, e); for (let i = -2; i <= 2; i++) orb(G, e, a + i * 0.22, 5); }
      }
      return A.EnemyAI02(G, e, dt);
    }
  };
  A.AIBrain = function (G, e, dt) {
    const m = /^ex?_seabed_mob(\d)$/.exec(e.id);
    return m ? SEA[m[1]](G, e, dt) : aiOld(G, e, dt);
  };

  // ---------------------------------------------------------------- bong bóng oxy trên sàn + bộ điều phối
  function spawnBubble(G, x, y, life) {
    const o = ox(G); if (!o) return null;
    [x, y] = SK.freeNear([x, y]);
    const b = { x, y, t: 0, life: life || OXY.life, r: 14 };
    o.zones.push(b); return b;
  }
  F4.spawnBubble = spawnBubble;
  const GAS_R = 3 * T;   // khí độc của TTN-003: bán kính 3 ô [ƯỚC LƯỢNG]

  function director(G) {
    return { x: 0, y: 1e6, gone: false, update(G2, o, dt) {
      const p = G2.player, ob = ox(G2);
      if (!ob || G2.phase !== 'play' || !p || p.st === 'dead') return;
      ob.t += dt;
      // tụt oxy
      ob.v = Math.max(0, ob.v - OXY.drain * dt);
      // Người Hầu Kraken hút oxy
      ob.drainers = [];
      for (const e of G2.enemies) {
        if (e.st === 'dead' || e.st === 'spawn' || !/^ex?_seabed_mob1$/.test(e.id)) continue;
        if (sees(G2, e, OXY.krakenRange)) { ob.drainers.push(e); ob.v = Math.max(0, ob.v - OXY.kraken * dt); }
      }
      // khí độc TTN-003
      for (const e of G2.enemies) {
        if (e.st === 'dead' || e.st === 'spawn' || !/^ex?_seabed_mob4$/.test(e.id)) continue;
        e.gas = (e.gas || 0) + dt;
        if (e.gas >= 1 && Math.hypot(p.x - e.x, p.y - e.y) < GAS_R) { e.gas = 0; SK.hurtPlayer(G2, 1, e.x, e.y); }
        else if (e.gas >= 1) e.gas = 1;
      }
      // bong bóng sàn
      ob.spawn -= dt;
      if (ob.spawn <= 0) {
        ob.spawn = OXY.spawnEvery;
        if (ob.zones.length < 2) { const a = SK.rand() * 6.28, d = SK.randf(36, 90); spawnBubble(G2, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d); }
      }
      let inside = false;
      for (const z of ob.zones) {
        z.t += dt;
        if (Math.hypot(p.x - z.x, p.y - z.y) < z.r) { inside = true; ob.v = Math.min(OXY.max, ob.v + OXY.bubbleRate * dt); }
      }
      ob.zones = ob.zones.filter(z => z.t < z.life);
      if (inside && !ob.boost) { p.moveMul = Math.round((p.moveMul || 1) * OXY.bubbleSpeed * 1e6) / 1e6; ob.boost = true; }
      else if (!inside && ob.boost) unboost(G2);
      // hết oxy: sát thương liên tục
      if (ob.v <= 0) {
        ob.dmgT += dt;
        while (ob.dmgT >= OXY.dmgEvery) { ob.dmgT -= OXY.dmgEvery; ob.hits++; SK.hurtPlayer(G2, OXY.dmg); }
      } else ob.dmgT = 0;
      for (const b of G2.oxyBreaks || []) b.t += dt;
      G2.oxyBreaks = (G2.oxyBreaks || []).filter(b => b.t < 0.5);
    }, draw(ctx, G2) {
      const ob = ox(G2); if (!ob) return;
      const bs = SK.prefab('SeabedBubbleShield');
      ctx.save();
      for (const z of ob.zones) {
        const fade = Math.min(1, (z.life - z.t) * 1.5, z.t * 3 + 0.2), pulse = 1 + Math.sin(z.t * 6) * 0.06;
        ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = '#6ff3ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * pulse, z.r * 0.6 * pulse, 0, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = '#7fe9ff'; ctx.fill();
        ctx.globalAlpha = 0.8 * fade; ctx.fillStyle = '#d8fbff';
        for (let i = 0; i < 4; i++) { const k = (z.t * 0.9 + i * 0.25) % 1; ctx.beginPath(); ctx.arc(z.x + Math.sin(i * 2.4 + z.t * 3) * 8, z.y - k * 22, 1.6 - k, 0, 6.2832); ctx.fill(); }
      }
      for (const e of G2.enemies) {
        if (e.st === 'dead') continue;
        if (e.bubble > 0) {
          ctx.globalAlpha = 0.85;
          if (!bs || !SK.drawPrefab(ctx, bs, e.x, e.y - 8, { t: G2.t, state: 'bubble_shield_idle', scale: 0.5 })) {
            ctx.fillStyle = 'rgba(150,230,255,0.3)'; ctx.strokeStyle = '#bff6ff'; ctx.beginPath(); ctx.arc(e.x, e.y - 10, 16, 0, 6.2832); ctx.fill(); ctx.stroke();
          }
        }
        if (/^ex?_seabed_mob4$/.test(e.id)) {
          ctx.globalAlpha = 0.18 + 0.06 * Math.sin(G2.t * 4); ctx.fillStyle = '#a24bff';
          ctx.beginPath(); ctx.ellipse(e.x, e.y - 4, GAS_R, GAS_R * 0.6, 0, 0, 6.2832); ctx.fill();
        }
      }
      for (const e of ob.drainers || []) {
        const p = G2.player;
        ctx.globalAlpha = 0.7; ctx.strokeStyle = '#59d6ff'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -G2.t * 20;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 12); ctx.lineTo(p.x, p.y - 8); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const b of G2.oxyBreaks || []) {
        ctx.globalAlpha = 1 - b.t / 0.5;
        if (!(bs && SK.drawPrefab(ctx, bs, b.x, b.y + 2, { t: b.t, state: 'bubble_shield_break', scale: 0.5 }))) {
          ctx.strokeStyle = '#bff6ff'; ctx.beginPath(); ctx.arc(b.x, b.y, 12 + b.t * 30, 0, 6.2832); ctx.stroke();
        }
      }
      ctx.restore();
    } };
  }

  SK.on('stageEnter', G => {
    unboost(G);
    G.oxy = null; G.oxyBreaks = [];
    if (!G.stage || G.stage.theme !== 'seabed') return;
    // vào ải mới thì oxy đầy lại [WIKI]
    G.oxy = { v: OXY.max, t: 0, zones: [], spawn: OXY.spawnEvery, dmgT: 0, hits: 0, boost: false, drainers: [] };
    G.props.push(director(G));
  });

  // ---------------------------------------------------------------- HUD oxy: thanh xanh dưới giữa, cạn từ phải sang trái [WIKI]
  SK.on('hud', (ctx, G) => {
    const o = ox(G); if (!o || G.state === 'lobby') return;
    const v = SK.view, w = 110, h = 9, x = Math.round((v.w - w) / 2), y = v.h - 17, f = o.v / OXY.max;
    const low = f < 0.25, flash = o.v <= 0 && Math.floor(G.t * 4) % 2 === 0;
    ctx.save();
    ctx.fillStyle = 'rgba(4,16,28,0.75)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = flash ? '#ff4a4a' : low ? '#4aa8ff' : '#37d8ff';
    ctx.fillRect(x, y, Math.round(w * f), h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, Math.round(w * f), 2);
    ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    SK.text(ctx, 'O2', x - 9, y + 8, 8, '#bff6ff', 'right', 'rgba(0,0,0,0.9)');
    ctx.restore();
    F4.hudOxy = { x, y, w, h, v: o.v, t: G.t };
  });
})();
