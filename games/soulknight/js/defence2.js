// Thần Điện Thủ Hộ đợt 3 (nối vào js/defence.js): 4 tháp còn thiếu (Thiết Bị Nạp, Tháp Hộ Thuẫn, Trung Tâm Bảo Trì, Ma Trận Khuếch Đại),
// NPC của chế độ (Quan Tế: EXP/cấp; Thương Nhân; Cờ Lê), lượt hồi sinh, rương xanh sau Đợt Lớn. Số liệu: MODES.md mục 2f
// [WIKI ME/Origin/SP/Trader; LOC defence/*]; chỗ nguồn không có số ghi [ƯỚC LƯỢNG]. Chưa làm: tools/polish/GAPS.md mục Thần Điện.
(function () {
  'use strict';
  const SK = window.SK, Df = SK.defence; if (!Df) return;
  const C = Df.C, T = SK.TILE;
  const on = G => G && G.mode === 'defence' && G.defence;
  const mul = star => Math.pow(C.starMul, star);
  const say = (G, m, t) => { G.toast(m, t || 2.2); return m; };

  // ---- 4 tháp mới (tên prefab gốc trong defence.ab). cd / tầm [ƯỚC LƯỢNG]; số còn lại [WIKI ME]
  Object.assign(C, {
    energyOrbMs: 5,                      // Thiết Bị Nạp: mỗi 5 giây tạo 1 cầu (+1 cầu mỗi Phẩm tới 6) [WIKI ME]
    energyBase: 8, energyStar18: 14,     // mỗi cầu hồi 8 NL, sao 18: 14 [WIKI ME]; giữa sao 0 và 18 nội suy tuyến tính [ƯỚC LƯỢNG]
    shieldRadius: 3.5, shieldRadiusStep: 0.5, shieldHp: 50, shieldRebuild: 5,   // bán kính 3,5 ô (+0,5/Phẩm tới 6), 50 độ bền (sao tăng), dựng lại sau >= 5 giây [WIKI ME]
    depotCd: 2, depotCdMin: 1, depotCap: 24, depotPlayerRange: 90,   // hồi mỗi 2 giây, sao 18 còn 1 giây, tối đa 24 [WIKI ME]; tầm hồi cho người 90 px [ƯỚC LƯỢNG]
    matrixAdd: 2, matrixSize: 1.2, matrixSizeStep: 0.1, matrixRadius: 36, matrixRadiusStep: 6,   // đạn xuyên qua +2 ST, to +20% [WIKI ME]; Phẩm thêm cỡ đạn và tầm 36 px là [ƯỚC LƯỢNG]
    // Quan Tế [WIKI SP]
    levelExp: [250, 500, 1000, 1600, 2400, 3200, 4000, 5000, 6000, 7200, 9600, 11000], lvHp: 8, lvArmor: 4, lvEnergy: 100, lvBare: 5,
    playerExpPerPoint: 8,                // EXP người chơi mỗi điểm ngân sách quái hạ được trong đợt [ƯỚC LƯỢNG: wiki chỉ nói quái ở cứ điểm cho EXP người chơi]
    // Thương Nhân [WIKI Trader]: thuốc HP/NL lớn 25 vàng hồi 50%, Cờ Lê 5 Xu Sao
    potionGold: 25, potionFrac: 0.5, wrenchCost: 5, traderAfterZone: 1,
    freeRevive: 3,                       // 3 lượt hồi sinh miễn phí, hạ trùm sóng thêm 1 lượt [WIKI Origin "Revives"; LOC defence/tips8]; lượt trả ngọc: web không có
    chestGoldBase: 30, chestGoldStep: 10 // rương xanh sau Đợt Lớn: wiki ghi hạt giống / nguyên liệu / vé (web chưa có) nên đổi sang vàng [ƯỚC LƯỢNG]
  });
  C.towers.energy_device = { name: 'Thiết Bị Nạp', cd: 5, range: 0, col: '#4ad8ff', ch: 'N' };
  C.towers.shield_tower = { name: 'Tháp Hộ Thuẫn', cd: 0.1, range: 0, col: '#6ab8ff', ch: 'H' };
  C.towers.service_depot = { name: 'Trung Tâm Bảo Trì', cd: 2, range: 0, col: '#6cff8a', ch: 'M', modes: ['tower', 'player'], fire: { state: 'service_depot_open', dur: 0.25 },
    cdOf: t => Math.max(C.depotCdMin, C.depotCd - (C.depotCd - C.depotCdMin) * Math.min(18, t.star || 0) / 18) };
  C.towers.amplification_matrix = { name: 'Ma Trận Khuếch Đại', cd: 0.1, range: 0, col: '#ff9aff', ch: 'X' };
  C.towers.biochemical_device.modes = ['poison', 'fire'];
  C.ids = Object.keys(C.towers);

  const A = Df.ATTACK;
  // Thiết Bị Nạp: tạo cầu năng lượng quanh tháp, người chơi nhặt thì hồi NL
  Df.energyOf = star => Math.round(C.energyBase + (C.energyStar18 - C.energyBase) * Math.min(18, star || 0) / 18);
  A.energy_device = (G, t) => {
    const d = G.defence;
    for (let i = 0, n = Math.min(6, t.pham || 1); i < n; i++) d.orbs.push({ x: t.x + SK.randf(-12, 12), y: t.y + SK.randf(4, 12), t: 0, v: Df.energyOf(t.star) });
    return true;
  };
  // Tháp Hộ Thuẫn: lực trường chặn sát thương rơi vào Đá Phép / tháp trong bán kính; vỡ thì dựng lại sau 5 giây
  Df.shieldRadiusOf = t => (C.shieldRadius + C.shieldRadiusStep * (Math.min(6, t.pham || 1) - 1)) * T;
  Df.shieldMaxOf = t => Math.round(C.shieldHp * mul(t.star || 0));   // "sao tăng độ bền" [WIKI ME]; hệ số 1,26 theo sao là [ƯỚC LƯỢNG]
  A.shield_tower = () => false;
  Df.passive.shield_tower = (G, t, dt) => {
    const sh = t.sh || (t.sh = { hp: Df.shieldMaxOf(t), rebuild: 0 }), mx = Df.shieldMaxOf(t);
    if (sh.hp <= 0) { sh.rebuild -= dt; if (sh.rebuild <= 0) sh.hp = mx; }
    else if (sh.hp > mx) sh.hp = mx;
  };
  // Trả phần sát thương còn lại sau khi các lực trường bao (x, y) chặn bớt
  Df.shieldAbsorb = function (G, x, y, amount) {
    const d = G.defence; if (!d) return amount;
    for (const t of d.towers) {
      if (t.id !== 'shield_tower' || t.ally.dead || !t.sh || t.sh.hp <= 0 || amount <= 0) continue;
      if (Math.hypot(t.x - x, t.y - y) > Df.shieldRadiusOf(t)) continue;
      const take = Math.min(t.sh.hp, amount); t.sh.hp -= take; amount -= take; t.shFlash = 0.2;
      SK.num(G, x, y - 30, '-' + Math.round(take), '#6ab8ff');
      if (t.sh.hp <= 0) { t.sh.rebuild = C.shieldRebuild; SK.emit('shieldBreak', G, t); }
    }
    return amount;
  };
  // Trung Tâm Bảo Trì: chế độ 'tower' hồi cho tháp khác (Phẩm + sao, tối đa 24), chế độ 'player' hồi người chơi (Phẩm) trong tầm
  A.service_depot = (G, t) => {
    const d = G.defence, p = G.player;
    if (t.mode === 'player') {
      if (Math.hypot(p.x - t.x, p.y - t.y) > C.depotPlayerRange || p.hp >= p.hpMax || p.hp <= 0) return false;
      const n = t.pham || 1; p.hp = Math.min(p.hpMax, p.hp + n); SK.num(G, p.x, p.y - 28, '+' + n, '#6cff8a'); return true;
    }
    const amt = Math.min(C.depotCap, (t.pham || 1) + (t.star || 0)); let healed = 0;
    for (const o of d.towers) {
      if (o === t || o.ally.dead || o.ally.hp >= C.towerHp) continue;
      o.ally.hp = Math.min(C.towerHp, o.ally.hp + amt); healed++; SK.num(G, o.x, o.y - 28, '+' + amt, '#6cff8a');
    }
    return healed > 0;
  };
  A.amplification_matrix = () => false;
  Df.matrixRadiusOf = t => C.matrixRadius + C.matrixRadiusStep * (Math.min(6, t.pham || 1) - 1);
  // Ma Trận Khuếch Đại: đạn tháp bay qua trường thì +2 ST, to thêm 20% (mỗi đạn một lần)
  Df.tickers.push(function amplify(G, dt) {
    const d = G.defence, ms = d.towers.filter(t => t.id === 'amplification_matrix' && !t.ally.dead);
    if (!ms.length) return;
    for (const s of d.shots) {
      if (s.k !== 'bullet' || s.amp) continue;
      for (const t of ms) if (Math.hypot(s.x - t.x, s.y - (t.y - 20)) <= Df.matrixRadiusOf(t)) {
        s.dmg += C.matrixAdd; s.amp = true; s.size = C.matrixSize + C.matrixSizeStep * ((t.pham || 1) - 1); break;
      }
    }
  });
  // cầu năng lượng: trôi tới người chơi khi lại gần
  Df.tickers.push(function orbs(G, dt) {
    const d = G.defence, p = G.player;
    for (const o of d.orbs) {
      o.t += dt; const dist = Math.hypot(p.x - o.x, p.y - 4 - o.y);
      if (o.t > 0.3 && dist < 42) { o.x += (p.x - o.x) / dist * 110 * dt; o.y += (p.y - 4 - o.y) / dist * 110 * dt; }
      if (o.t > 0.3 && dist < 8) { o.got = true; p.energy = Math.min(p.energyMax, p.energy + o.v); SK.num(G, p.x, p.y - 28, '+' + o.v + ' NL', '#4ad8ff'); SK.emit('towerEnergy', G, o.v); }
    }
    d.orbs = d.orbs.filter(o => !o.got);
    for (const t of d.towers) if (t.shFlash > 0) t.shFlash -= dt;
  });
  // chuyển chế độ (Bảo Trì: tháp / người; Sinh Hóa: độc / lửa) [LOC tower_mode/*]
  Df.setMode = function (G, padIdx, mode) {
    const t = G.defence.pads[padIdx] && G.defence.pads[padIdx].tower; if (!t) return { ok: false };
    const ms = C.towers[t.id].modes; if (!ms || ms.indexOf(mode) < 0) return { ok: false, why: say(G, 'Tháp này không có chế độ đó') };
    t.mode = mode; say(G, C.towers[t.id].name + ': chế độ ' + ({ tower: 'sửa tháp', player: 'hồi người chơi', poison: 'độc', fire: 'lửa' })[mode], 1.8); return { ok: true, mode };
  };
  Df.cycleMode = function (G) {
    const d = G.defence, ts = d.towers.filter(t => C.towers[t.id].modes && !t.ally.dead); if (!ts.length) return { ok: false, why: say(G, 'Chưa có tháp đổi được chế độ') };
    d.modeIdx = ((d.modeIdx || 0) + 1) % ts.length; const t = ts[d.modeIdx], ms = C.towers[t.id].modes;
    const cur = t.mode || ms[0]; return Df.setMode(G, t.pad, ms[(ms.indexOf(cur) + 1) % ms.length]);
  };

  // ---- khởi tạo trạng thái thêm
  const init0 = Df.init;
  Df.init = function (G) {
    const d = init0(G);
    Object.assign(d, { orbs: [], pExp: 0, pLvl: 0, bareDmg: 0, revive: C.freeRevive, revives: 0, wrench: 1, chest: null, chests: 0, sawFull: false });   // Bậc Thầy Robot cho 1 Cờ Lê miễn phí [WIKI ME]
    return d;
  };

  // ---- Quan Tế: tăng cấp nhân vật bằng EXP (tổng EXP tích lũy, không bị trừ) [WIKI SP]
  Df.levelUp = function (G) {
    const d = G.defence, p = G.player; if (!d) return { ok: false };
    if (d.pLvl >= C.levelExp.length) return { ok: false, why: say(G, 'Đã đạt cấp tối đa') };
    if (d.pExp < C.levelExp[d.pLvl]) return { ok: false, why: say(G, 'Chưa đủ EXP (' + Math.floor(d.pExp) + '/' + C.levelExp[d.pLvl] + ')') };
    d.pLvl++; p.hpMax += C.lvHp; p.hp = p.hpMax; p.armorMax = (p.armorMax || 0) + C.lvArmor; p.armor = p.armorMax;
    p.energyMax += C.lvEnergy; p.energy = p.energyMax; d.bareDmg += C.lvBare; d.sawFull = false;
    say(G, 'Quan Tế: lên cấp ' + d.pLvl); SK.emit('defenceLevel', G, d.pLvl); return { ok: true, lvl: d.pLvl };
  };
  Df.addPlayerExp = function (G, n) {
    const d = G.defence; d.pExp += n;
    if (d.pLvl < C.levelExp.length && d.pExp >= C.levelExp[d.pLvl] && !d.sawFull) { d.sawFull = true; say(G, 'EXP đã đầy, đến chỗ Quan Tế Thần Điện để tăng cấp nhân vật', 3); }
  };
  SK.on('enemyKill', (G, e) => {
    if (!on(G) || e.dz == null || !e.dpts) return;
    Df.addPlayerExp(G, e.dpts * C.playerExpPerPoint);
    if (e.dboss) { G.defence.revive++; G.defence.revives++; say(G, 'Hạ trùm sóng: thêm 1 lượt hồi sinh', 2.5); if (G.defence.downed) Df.reviveNow(G, false); }
  });

  // ---- Thương Nhân (sau đợt 1-3) và Cờ Lê
  Df.traderOpen = G => { const d = G.defence; return !!d && d.zone > C.traderAfterZone; };
  Df.buy = function (G, what) {
    const d = G.defence, p = G.player; if (!d) return { ok: false };
    if (!Df.traderOpen(G)) return { ok: false, why: say(G, 'Thương Nhân chưa tới') };
    if (what === 'wrench') {
      if (d.coins < C.wrenchCost) return { ok: false, why: say(G, 'Không đủ Xu Sao') };
      d.coins -= C.wrenchCost; d.wrench++; say(G, 'Mua Cờ Lê (' + C.wrenchCost + ' Xu Sao)'); return { ok: true, wrench: d.wrench };
    }
    const hp = what === 'hp'; if (!hp && what !== 'en') return { ok: false };
    if (p.gold < C.potionGold) return { ok: false, why: say(G, 'Không đủ vàng!') };
    p.gold -= C.potionGold;
    if (hp) p.hp = Math.min(p.hpMax, p.hp + Math.round(p.hpMax * C.potionFrac)); else p.energy = Math.min(p.energyMax, p.energy + Math.round(p.energyMax * C.potionFrac));
    say(G, hp ? 'Uống thuốc máu lớn' : 'Uống thuốc năng lượng lớn'); return { ok: true };
  };
  // Cờ Lê: nhấc tháp đi đặt sang Nền Tháp trống khác (giữ Phẩm / sao), tốn 1 Cờ Lê [LOC defence/tips; WIKI ME]
  Df.moveTower = function (G, from, to) {
    const d = G.defence, a = d.pads[from], b = d.pads[to];
    if (!a || !b || !a.tower) return { ok: false, why: 'no tower' };
    if (b.tower) return { ok: false, why: say(G, 'Nền Tháp đã có tháp') };
    if (d.wrench < 1) return { ok: false, why: say(G, 'Hết Cờ Lê') };
    d.wrench--; const t = a.tower; a.tower = null; b.tower = t; t.pad = to; t.x = b.x; t.y = b.y; t.ally.x = b.x; t.ally.y = b.y;
    say(G, 'Đã dời ' + C.towers[t.id].name); return { ok: true };
  };

  // ---- hồi sinh: người chơi chết thì dùng 1 lượt (hồi đầy máu). Hết lượt mà Đá Phép chưa vỡ thì chưa thua: người chơi ngã gục tại chỗ, tháp
  // vẫn đánh; thua khi Đá Phép vỡ [WIKI Origin "Gameplay": thua khi chết hết lượt VÀ Đá Phép vỡ]; hạ trùm sóng được thêm lượt thì đứng dậy
  Df.reviveNow = function (G, free) {
    const d = G.defence, p = G.player;
    if (!free) d.revive--;
    d.downed = false; p.hp = p.hpMax; p.st = 'idle'; p.stT = 0; p.armor = p.armorMax || 0; p.invulT = 1.5; G.hurtT = 0;
    say(G, 'Hồi sinh! Còn ' + d.revive + ' lượt', 2.5); SK.emit('defenceRevive', G, d.revive);
  };
  function hookDeath(G) {
    if (G.onPlayerDead.dhook) return;
    const o = G.onPlayerDead;
    G.onPlayerDead = function () {
      const d = G.defence;
      if (on(G) && !d.won && !d.lost) {
        if (d.intro && d.intro.on) { Df.reviveNow(G, true); return; }   // đợt giới thiệu không thua được, không tốn lượt
        if (d.revive > 0) { Df.reviveNow(G, false); return; }
        if (!d.downed) { d.downed = true; say(G, 'Bạn đã ngã gục! Giữ Đá Phép, hạ trùm sóng để được hồi sinh', 3.5); SK.emit('defenceDowned', G); }
        return;
      }
      return o.apply(this, arguments);
    };
    G.onPlayerDead.dhook = true;
  }
  // người chơi ngã gục: giữ trạng thái chết nhưng không kết thúc ván (game.js kết thúc khi stT > 1.3)
  Df.tickers.push(function downed(G, dt) {
    const d = G.defence, p = G.player;
    if (d.downed && !d.lost && !d.won) { p.st = 'dead'; p.stT = 0.6; p.hp = 0; }
  });

  // ---- rương xanh sau Đợt Lớn (X-3 dọn xong)
  SK.on('defenceWaveClear', (G, zone, wave) => {
    if (!on(G) || wave !== 2) return;
    const d = G.defence; d.chest = { x: d.stoneAt.x + 26, y: d.stoneAt.y + 22, open: false, zone, t: 0 };
    say(G, 'Rương xanh xuất hiện cạnh Đá Phép', 3);
  });
  Df.openChest = function (G) {
    const d = G.defence, c = d.chest; if (!c || c.open) return { ok: false };
    c.open = true; d.chests++; const g = C.chestGoldBase + C.chestGoldStep * c.zone; G.player.gold += g;
    SK.num(G, c.x, c.y - 24, '+' + g + ' vàng', '#ffd84a'); say(G, 'Mở rương xanh: +' + g + ' vàng'); return { ok: true, gold: g };
  };

  // ---- dựng NPC khi vào ván (sau handler stageEnter của defence.js)
  SK.on('stageEnter', G => {
    if (!on(G)) return;
    hookDeath(G);
    const d = G.defence, s = d.stoneAt, pf = Df.pf;
    // Quan Tế (hero priest làm hình: không có prefab riêng trong defence.ab)
    const qx = s.x + 72, qy = s.y + 34;
    G.interactables.push({ df: 1, x: qx, y: qy + 4, r: 16, labelY: 34,
      get label() { return d.pLvl >= C.levelExp.length ? 'Quan Tế: đã tối đa cấp' : 'Quan Tế: tăng cấp ' + (d.pLvl + 1) + ' (EXP ' + Math.floor(d.pExp) + '/' + C.levelExp[d.pLvl] + ')'; },
      use: g => Df.levelUp(g) });
    G.props.push({ df: 1, x: qx, y: qy, draw(ctx, G2) {
      const hd = SK.heroSkin && SK.heroSkin('priest', 0), fr = hd && hd.idle && SK.animFrame(hd.idle, G2.t);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(qx, qy, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
      if (!fr || !SK.draw(ctx, fr, qx, qy, {})) { ctx.fillStyle = '#e8d8ff'; ctx.fillRect(qx - 4, qy - 12, 8, 12); }
      if (d.pLvl < C.levelExp.length && d.pExp >= C.levelExp[d.pLvl]) SK.text(ctx, '!', qx, qy - 24, 10, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
    } });
    // Thương Nhân: xuất hiện sau đợt 1-3 (3 món: thuốc máu, thuốc NL, Cờ Lê)
    const tx = s.x - 72, ty = s.y - 30;
    const opts = [['hp', -14, () => 'Thương Nhân: thuốc máu lớn (' + C.potionGold + ' vàng)'], ['en', 0, () => 'Thương Nhân: thuốc NL lớn (' + C.potionGold + ' vàng)'], ['wrench', 14, () => 'Thương Nhân: Cờ Lê (' + C.wrenchCost + ' Xu Sao)']];
    for (const [k, ox, lab] of opts) G.interactables.push({ df: 1, x: tx + ox, y: ty + 6, r: 8, labelY: 34,
      get gone() { return !Df.traderOpen(G); }, get label() { return lab(); }, use: g => Df.buy(g, k) });
    G.props.push({ df: 1, x: tx, y: ty, draw(ctx, G2) {
      if (!Df.traderOpen(G2)) return;
      const P = SK.prefab('merchant_honest');
      if (!P || !SK.drawPrefab(ctx, P, tx, ty + 4, { scale: 0.5, t: G2.t, skip: q => /container/.test(q.n) })) { ctx.fillStyle = '#d8b878'; ctx.fillRect(tx - 4, ty - 12, 8, 12); }
    } });
    // đổi chế độ tháp (đứng cạnh Bậc Thầy Robot)
    const ex = s.x - 76, ey = s.y + 36 + 18;
    G.interactables.push({ df: 1, x: ex, y: ey, r: 12, labelY: 24, label: 'Đổi chế độ tháp (Bảo Trì: sửa tháp / hồi người; Sinh Hóa: độc / lửa)', use: g => Df.cycleMode(g) });
    // rương xanh
    G.interactables.push({ df: 1, x: s.x + 26, y: s.y + 22, r: 14, labelY: 26, get gone() { return !d.chest || d.chest.open; }, label: 'Mở rương xanh', use: g => Df.openChest(g) });
  });

  // ---- vẽ lớp thêm: lực trường Hộ Thuẫn, trường Ma Trận, cầu năng lượng, rương xanh
  Df.drawExtra = function (ctx, G) {
    const d = G.defence;
    for (const t of d.towers) {
      if (t.ally.dead) continue;
      if (t.id === 'shield_tower' && t.sh && t.sh.hp > 0) {
        const r = Df.shieldRadiusOf(t), k = t.sh.hp / Df.shieldMaxOf(t);
        ctx.fillStyle = 'rgba(106,184,255,' + (0.08 + 0.1 * k + (t.shFlash > 0 ? 0.2 : 0)) + ')'; ctx.beginPath(); ctx.ellipse(t.x, t.y - 4, r, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(160,220,255,' + (0.3 + 0.4 * k) + ')'; ctx.lineWidth = 1; ctx.stroke();
      } else if (t.id === 'amplification_matrix') {
        const r = Df.matrixRadiusOf(t); ctx.strokeStyle = 'rgba(255,154,255,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(t.x, t.y - 20, r, r * 0.65, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const o of d.orbs) { const b = Math.sin(o.t * 6) * 1.2; if (!Df.pf(ctx, 'energy', o.x, o.y - 4 + b, { t: o.t, scale: 1 })) { const P = SK.art.object('energy_orb'); if (!P || !SK.drawPrefab(ctx, P, o.x, o.y - 4 + b, { t: o.t })) { ctx.fillStyle = '#4ad8ff'; ctx.fillRect(o.x - 2, o.y - 6 + b, 4, 4); } } }
    const c = d.chest;
    if (c) {
      const P = SK.prefab('defence_chest');
      if (!P || !SK.drawPrefab(ctx, P, c.x, c.y, { scale: 0.42, state: c.open ? 'chest_open' : undefined, t: c.open ? 9 : 0 })) { ctx.fillStyle = c.open ? '#357' : '#3a8ad8'; ctx.fillRect(c.x - 7, c.y - 8, 14, 9); }
      else Df.drawn.defence_chest = (Df.drawn.defence_chest || 0) + 1;
    }
  };

  SK.on('hud', (ctx, G) => {
    if (!on(G) || !G.map) return;
    const d = G.defence, v = SK.view;
    SK.text(ctx, 'Cấp ' + d.pLvl + ' · EXP ' + Math.floor(d.pExp) + '   Hồi sinh ' + d.revive + '   Cờ Lê ' + d.wrench, v.w / 2, 37, 8, '#cfe8ff', 'center', 'rgba(0,0,0,0.9)');
  });
})();
