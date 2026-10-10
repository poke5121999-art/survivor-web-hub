// Thần Điện Thủ Hộ (G.mode === 'defence'), LÕI: Phòng Đá Phép + đợt quái chặng 1 + Xu Sao + tháp. Số liệu: wiki The_Origin và
// Mechanical_Engineer (tools/polish/MODES.md mục 2f) [WIKI Origin/ME]; chỗ wiki không có số ghi [ƯỚC LƯỢNG]. Chưa làm: GAPS.md.
//   G.defence = {stone:{hp,max}, coins, pads:[{x,y,tower}], towers, sel, zone, wave (0..2 trong chặng), phase, timer, queue, ...}
// Phòng Đá Phép = phòng khởi đầu của bản đồ do W.generate dựng (không sửa world.js); các phòng khác là phòng thường (cứ điểm).
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, W = SK.world, T = SK.TILE, U = SK.PPU;

  const C = SK.DEFENCE = {
    stoneHp: 20,                     // Đá Phép chịu tối đa 20 máu [WIKI Origin "Magic Stone"]
    countdown: 110,                  // đếm ngược mở đầu mỗi đợt [WIKI Origin "Great Wall"]
    skipTo: 3,                       // đối thoại với Đá Phép: đợt kế tới sau 3 giây [WIKI Origin; LOC defence/magic_stone_talk]
    zones: 12, wavesPerZone: 3, lastZone: 12,   // 12 chặng x 3 đợt; thắng khi qua chặng 12 [WIKI Origin "Wave Defense"]; Tàu Ngoài Hành Tinh ở 12-3 chưa làm: GAPS.md
    // điểm ngân sách quái mỗi đợt X-1 / X-2 / X-3 [ƯỚC LƯỢNG: wiki chỉ nói Nhỏ / Vừa / Lớn]
    pts: [8, 14, 22],
    budgetGrow: 0.25, hpGrow: 0.1,   // mỗi chặng thêm 25% ngân sách quái và 10% máu quái [ƯỚC LƯỢNG: wiki chỉ nói đợt sau mạnh hơn, không có số]
    bossZones: { 3: 300, 6: 600, 9: 900, 12: 1200 },   // trùm sóng ở đợt X-3 của chặng 3/6/9/12 [WIKI Origin]; máu [ƯỚC LƯỢNG]; rơi 8 Xu Sao [WIKI Origin]
    bossCoins: 8, alienDrop: 0.1,    // quái Phi Thuyền trong sóng rơi 10% [WIKI Origin "Great Wall"]
    phamMax: 6, spikesBase: 4, spikesStep: 2,   // Phẩm 1-6 mua trùng 15 Xu Sao mỗi bản; Bẫy Gai 4 gai rồi +2 mỗi Phẩm (6, 8, ... 14) [WIKI ME]
    spawnGap: 0.7,
    startCoins: 15,                  // [ƯỚC LƯỢNG] một tháp đầu tiên, vì lõi chưa có phòng cứ điểm/trùm rơi Xu Sao
    dropRate: 0.5, dropValue: 2,     // Xu Sao rơi khi hạ quái trong đợt [ƯỚC LƯỢNG: wiki 10% cho quái Phi Thuyền, quái vùng khác bỏ]
    towerCost: 15, repair: 5,        // [WIKI ME]
    towerHp: 60, towerHeal: 0.3, contactDmg: 4,   // máu tháp KHÔNG có số trong nguồn [ƯỚC LƯỢNG]; quái chạm tháp mỗi giây
    starMul: 1.26,                   // sát thương x1,26^sao [WIKI ME]
    starExp: [25, 73, 169, 289, 361, 481, 721, 865, 1057, 1297, 1513, 1801, 2161, 2377, 2665, 3025, 3241, 3528],   // từng bậc sao [WIKI ME]
    expPerPoint: 2,                  // EXP mỗi điểm ngân sách quái, chia đều cho các tháp [ƯỚC LƯỢNG]
    // Tháp: dmg = sát thương gốc [WIKI ME]; cd/range là [ƯỚC LƯỢNG]
    towers: {
      rage_gun_tower:      { name: 'Tháp Súng Máy', dmg: 2, cd: 0.25, range: 100, col: '#f0c03a', ch: 'S', fire: { state: 'm4', dur: 0.25 } },
      chain_laser_tower:   { name: 'Tháp Laser', dmg: 21, cd: 1.4, range: 110, col: '#ff5a7a', ch: 'L' },
      spike_trap:          { name: 'Bẫy Gai Nhọn', dmg: 8, cd: 2, range: 48, spikes: 4, col: '#b8c0cc', ch: 'G', fire: { state: 'create_spike', dur: 0.67 } },
      hurricane_device:    { name: 'Thiết Bị Gió Lốc', dmg: 10, cd: 1, range: 60, pull: 10, col: '#7ad8ff', ch: 'W', fire: { state: 'w_sword 0', dur: 0.4 } },
      weather_controller:  { name: 'Máy Điều Khiển Thời Tiết', dmg: 15, cd: 1.6, range: 110, bolts: 2, col: '#b07aff', ch: 'T' },
      biochemical_device:  { name: 'Thiết Bị Sinh Hóa', dmg: 4, cd: 8, range: 110, pool: 48, dur: 6, tick: 0.5, fireDmg: 6, col: '#6cdc5a', ch: 'B', fire: { state: 'bioch_fire', dur: 0.67 } },
      airbase:             { name: 'Căn Cứ Không Quân', dmg: 24, cd: 6, range: 120, planes: 4, blast: 24, col: '#ff9a4a', ch: 'A', fire: { state: 'airbase_open', dur: 0.25 } }
    }
  };
  C.ids = Object.keys(C.towers);
  // routes theo chặng: 1-3 một tuyến, 4-9 hai, 10-12 ba [WIKI Origin "Wave Defense"]
  C.routesOf = z => z <= 3 ? 1 : z <= 9 ? 2 : 3;

  const Df = SK.defence = { C };
  const on = G => G && G.mode === 'defence' && G.defence;
  const mul = star => Math.pow(C.starMul, star);
  const r1 = v => Math.round(v * 10) / 10;
  const say = (G, m, t) => { G.toast(m, t || 2.2); return m; };
  const consume = id => { const a = D.enemies[id] && D.enemies[id].ai && D.enemies[id].ai[0]; return (a && a.p && a.p.consume) || 1; };

  Df.init = function () {
    return { stone: { hp: C.stoneHp, max: C.stoneHp }, coins: C.startCoins, pads: [], towers: [], sel: C.ids[0], zone: 1, wave: 0, phase: 'wait',
      timer: C.countdown, queue: [], spawnT: 0, routes: [0], rr: 0, gates: [], drops: [], shots: [], pools: [], won: false, lost: false, stats: { placed: 0, kills: 0, waves: 0 } };
  };
  Df.dmgOf = (id, star) => r1(C.towers[id].dmg * mul(star || 0));
  Df.spikesOf = pham => C.spikesBase + C.spikesStep * (Math.max(1, pham || 1) - 1);
  Df.budget = (zone, wave) => C.pts[wave] * (1 + (zone - 1) * C.budgetGrow);
  Df.hpMul = zone => 1 + (zone - 1) * C.hpGrow;

  // ---- quái trong đợt: bỏ AI riêng, lao thẳng vào Đá Phép, chạm tháp thì đánh tháp [WIKI Origin "Wave Defense"]
  function wrapAI() {
    for (const k of Object.keys(SK.AI)) {
      const f = SK.AI[k]; if (f.dwrapped) continue;
      const g = function (G, e, dt) {
        if (e.hold) return;
        if (e.dwave && on(G)) return rush(G, e, dt);
        return f(G, e, dt);
      };
      g.dwrapped = true; SK.AI[k] = g;
    }
  }
  function rush(G, e, dt) {
    const d = G.defence, s = d.stoneAt;
    const dx = s.x - e.x, dy = s.y - e.y, dist = Math.hypot(dx, dy);
    if (dist < 11) { hitStone(G, e); return; }
    for (const t of d.towers) {   // đánh mọi thứ chặn đường
      const a = t.ally; if (!a || a.dead) continue;
      if (Math.hypot(a.x - e.x, a.y - e.y) < 10) {
        e.st = 'attack'; e.face = a.x >= e.x ? 1 : -1;
        e.dcd = (e.dcd || 0) - dt;
        if (e.dcd <= 0) {
          e.dcd = 1; const dm = Df.shieldAbsorb ? Df.shieldAbsorb(G, a.x, a.y, C.contactDmg) : C.contactDmg; a.flash = 0.1;
          if (dm > 0) { a.hp -= dm; SK.num(G, a.x, a.y - 20, dm, '#ff4a4a'); if (a.hp <= 0) { a.dead = true; a.onDie(G, a); } }
        }
        return;
      }
    }
    const sp = Math.min(dist, (e.d.speed || 3) * U * 0.7 * (e.moveMul || 1) * dt);
    let ux = dx / dist, uy = dy / dist;
    if (e.dstuck > 0.4) { const sg = e.dside || (e.dside = SK.chance(0.5) ? 1 : -1); const ox = ux; ux = -uy * sg; uy = ox * sg; }
    const px = e.x, py = e.y;
    SK.moveBox(G.map, e, ux * sp, uy * sp, e.r);
    e.dstuck = Math.hypot(e.x - px, e.y - py) < sp * 0.3 ? (e.dstuck || 0) + dt : 0;
    if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1;
    e.st = 'move';
  }
  // Chạm Đá Phép: quái chết ngay (cả trùm), Đá mất máu theo máu còn lại của quái [WIKI Origin; hệ số ƯỚC LƯỢNG: 1 máu mỗi 10 máu quái]
  function hitStone(G, e) {
    const raw = Df.shieldAbsorb ? Df.shieldAbsorb(G, G.defence.stoneAt.x, G.defence.stoneAt.y, e.hp) : e.hp;   // Tháp Hộ Thuẫn chặn trước [WIKI ME]
    const dmg = raw > 0 ? SK.clamp(Math.ceil(raw / 10), 1, C.stoneHp) : 0;
    e.st = 'dead'; e.stT = 9; e.hp = 0; e.dwave = false;
    if (dmg > 0) Df.damageStone(G, dmg); else { G.defence.stoneFlash = 0.25; SK.emit('stoneBlocked', G, e); }
  }
  Df.damageStone = function (G, dmg) {
    const d = G.defence; if (!d || d.lost || d.won) return;
    d.stone.hp = Math.max(0, d.stone.hp - dmg); d.stoneFlash = 0.25; G.shake = 4;
    SK.num(G, d.stoneAt.x, d.stoneAt.y - 26, '-' + dmg, '#ff4a4a', true);
    say(G, 'Đá Phép bị tấn công!', 1.2);
    SK.emit('stoneHit', G, dmg);
    if (d.stone.hp <= 0) lose(G);
  };

  // ---- thắng / thua
  function finish(G, won) {
    const d = G.defence; d.won = won; d.lost = !won;
    G.state = won ? 'victory' : 'dead';
    SK.setOverlay(won ? 'sk-win' : 'sk-over');
    const p = G.player, id = won ? 'sk-win-info' : 'sk-over-info';
    SK.emit('runEnd', G, { won, stage: 'Thủ Hộ ' + d.zone, kills: G.kills, gold: p.gold });
    document.getElementById(id).textContent = (won ? 'Thắng chặng ' + d.zone + ' · ' : 'Đá Phép đã vỡ · ') + 'Hạ ' + G.kills + ' quái · ' + d.stats.placed + ' tháp';
  }
  function lose(G) { say(G, 'Đá Phép đã vỡ!', 3); finish(G, false); }

  // ---- Xu Sao: rơi trên sàn, hút về người chơi
  Df.addCoins = function (G, n, x, y) { G.defence.coins += n; SK.num(G, x != null ? x : G.player.x, (y != null ? y : G.player.y) - 28, '+' + n + ' Xu Sao', '#7ad8ff'); };
  Df.dropCoin = function (G, x, y, v) { G.defence.drops.push({ x, y, v: v || C.dropValue, t: 0 }); };
  function updateDrops(G, dt) {
    const d = G.defence, p = G.player;
    for (const c of d.drops) {
      c.t += dt;
      const dist = Math.hypot(p.x - c.x, p.y - 4 - c.y);
      if (c.t > 0.4 && dist < 42) { c.x += (p.x - c.x) / dist * 120 * dt; c.y += (p.y - 4 - c.y) / dist * 120 * dt; }
      if (c.t > 0.3 && dist < 8) { c.got = true; Df.addCoins(G, c.v, c.x, c.y); SK.emit('starCoin', G, c.v); }
    }
    d.drops = d.drops.filter(c => !c.got);
  }

  // ---- tháp
  function targets(G, x, y, r) {
    const out = [];
    for (const e of G.enemies) {
      if (e.st === 'dead' || e.st === 'spawn') continue;
      const d = Math.hypot(e.x - x, e.y - 6 - y); if (d <= r) out.push({ e, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  const hit = (G, e, dmg, ang) => SK.hurtEnemy(G, e, dmg, false, ang || 0, 1);
  Df.targets = targets; Df.hit = hit;
  const beam = (G, x0, y0, x1, y1, col) => G.defence.shots.push({ k: 'beam', x0, y0, x1, y1, col, t: 0, dur: 0.14 });
  const ATTACK = {
    rage_gun_tower(G, t) {
      const c = C.towers[t.id], ts = targets(G, t.x, t.y, c.range); if (!ts.length) return false;
      const e = ts[0].e, ang = Math.atan2(e.y - 6 - t.y, e.x - t.x);
      G.defence.shots.push({ k: 'bullet', x: t.x, y: t.y - 8, vx: Math.cos(ang) * 220, vy: Math.sin(ang) * 220, dmg: Df.dmgOf(t.id, t.star), life: 0.8, t: 0 });
      return true;
    },
    chain_laser_tower(G, t) {
      const c = C.towers[t.id], ts = targets(G, t.x, t.y, c.range); if (!ts.length) return false;
      const e = ts[0].e; G.defence.shots.push({ k: 'beam', x0: t.x, y0: t.y - 10, x1: e.x, y1: e.y - 6, col: '#ff5a7a', t: 0, dur: 0.14, pf: 'chain_laser', part: '/img/bullet' }); hit(G, e, Df.dmgOf(t.id, t.star), Math.atan2(e.y - t.y, e.x - t.x)); return true;
    },
    spike_trap(G, t) {
      const c = C.towers[t.id], ts = targets(G, t.x, t.y, c.range); if (!ts.length) return false;
      for (let i = 0, n = Df.spikesOf(t.pham); i < n; i++) {
        const e = ts[i % ts.length].e, sx = e.x + SK.randf(-4, 4), sy = e.y + SK.randf(-3, 3);
        G.defence.shots.push({ k: 'spike', x: sx, y: sy, t: 0, dur: 0.35 });
        for (const q of targets(G, sx, sy - 6, 9)) hit(G, q.e, Df.dmgOf(t.id, t.star), 0);
      }
      return true;
    },
    hurricane_device(G, t) {
      const c = C.towers[t.id], ts = targets(G, t.x, t.y, c.range); if (!ts.length) return false;
      G.defence.shots.push({ k: 'ring', x: t.x, y: t.y - 4, r: c.range, t: 0, dur: 0.4, col: '#7ad8ff' });
      for (const q of ts) {
        const e = q.e, a = Math.atan2(t.y - e.y, t.x - e.x); SK.moveBox(G.map, e, Math.cos(a) * c.pull, Math.sin(a) * c.pull, e.r);
        hit(G, e, Df.dmgOf(t.id, t.star), a);
      }
      return true;
    },
    weather_controller(G, t) {
      const c = C.towers[t.id], ts = targets(G, t.x, t.y, c.range); if (!ts.length) return false;
      for (let i = 0, n = Math.min(7, c.bolts + (t.pham || 1) - 1); i < n; i++) {
        const e = ts[i % ts.length].e; beam(G, e.x, e.y - 60, e.x, e.y - 6, '#d8b8ff'); hit(G, e, Df.dmgOf(t.id, t.star), 0);
      }
      return true;
    },
    biochemical_device(G, t) {
      const c = C.towers[t.id], ts = targets(G, t.x, t.y, c.range); if (!ts.length) return false;
      G.defence.pools.push({ x: ts[0].e.x, y: ts[0].e.y, r: c.pool, t: 0, dur: c.dur, tk: 0, id: t.id, star: t.star, fire: t.mode === 'fire' });
      return true;
    },
    airbase(G, t) {
      const c = C.towers[t.id], ts = targets(G, t.x, t.y, c.range); if (!ts.length) return false;
      const tx = ts[0].e.x, ty = ts[0].e.y;
      for (let i = 0, n = Math.min(7, c.planes + Math.floor(((t.pham || 1) - 1) / 2)); i < n; i++) G.defence.shots.push({ k: 'bomb', x: tx + SK.randf(-8, 8), y: ty + SK.randf(-6, 6), t: -i * 0.15, dur: 0.5, id: t.id, star: t.star, done: false });
      return true;
    }
  };
  Df.ATTACK = ATTACK; Df.passive = {}; Df.tickers = [];   // js/defence2.js thêm tháp, nhịp riêng và NPC
  function updateShots(G, dt) {
    const d = G.defence;
    for (const s of d.shots) {
      s.t += dt;
      if (s.k === 'bullet') {
        s.x += s.vx * dt; s.y += s.vy * dt;
        for (const q of G.enemies) {
          if (q.st === 'dead' || q.st === 'spawn' || Math.abs(q.x - s.x) > 7 || Math.abs(q.y - 6 - s.y) > 9) continue;
          hit(G, q, s.dmg, Math.atan2(s.vy, s.vx)); s.t = 99; break;
        }
      } else if (s.k === 'bomb' && !s.done && s.t >= s.dur) {
        s.done = true;
        for (const q of targets(G, s.x, s.y - 6, C.towers[s.id].blast)) hit(G, q.e, Df.dmgOf(s.id, s.star), 0);
      }
    }
    d.shots = d.shots.filter(s => s.t < (s.k === 'bullet' ? s.life : s.k === 'bomb' ? s.dur + 0.5 : s.dur) + 0.1);
    for (const p of d.pools) {
      p.t += dt; p.tk -= dt;
      if (p.tk <= 0) { p.tk = C.towers[p.id].tick; const dm = p.fire ? r1(C.towers[p.id].fireDmg * mul(p.star || 0)) : Df.dmgOf(p.id, p.star); for (const q of targets(G, p.x, p.y - 6, p.r)) hit(G, q.e, dm, 0); }
    }
    d.pools = d.pools.filter(p => p.t < p.dur);
  }

  // Đặt tháp lên Nền Tháp trống bằng Xu Sao; mỗi loại chỉ sở hữu 1 tháp [WIKI ME]. Trả {ok, why}.
  Df.place = function (G, padIdx, id) {
    const d = G.defence; if (!d) return { ok: false, why: 'no defence' };
    id = id || d.sel;
    const pad = d.pads[padIdx], c = C.towers[id];
    if (!pad || !c) return { ok: false, why: say(G, 'Nền Tháp không có') };
    if (pad.tower) return { ok: false, why: say(G, 'Nền Tháp đã có tháp') };
    if (d.towers.some(t => t.id === id)) return { ok: false, why: say(G, 'Đã có ' + c.name) };
    if (d.coins < C.towerCost) return { ok: false, why: say(G, 'Không đủ Xu Sao') };
    d.coins -= C.towerCost;
    const t = { id, star: 0, pham: 1, exp: 0, x: pad.x, y: pad.y, cd: 0.3, pad: padIdx };
    t.ally = SK.addWeaponAlly(G, {
      tower: t, x: pad.x, y: pad.y, hp: C.towerHp, hpMax: C.towerHp, owner: G.player,
      update(G2, a, dt) {
        t.cd -= dt;
        if (!on(G2)) return;
        if (Df.passive[id]) Df.passive[id](G2, t, dt);
        if (t.cd > 0) return;
        const fired = ATTACK[id](G2, t);
        if (fired) t.fireAt = G2.t;   // tháp chạy clip bắn (drawTower / Df.fireState)
        t.cd = fired ? (C.towers[id].cdOf ? C.towers[id].cdOf(t) : C.towers[id].cd) : 0.1;
      },
      onDie(G2) { SK.emit('towerBroken', G2, t); },   // hỏng: nền vẫn còn, sửa 5 Xu Sao [WIKI ME]
      draw(ctx, G2, a) { drawTower(ctx, G2, t, a); }
    });
    pad.tower = t; d.towers.push(t); d.stats.placed++;
    say(G, 'Đặt ' + c.name);
    SK.emit('towerPlace', G, t);
    pickSel(G);
    return { ok: true, tower: t };
  };
  Df.repair = function (G, padIdx) {
    const d = G.defence, t = d.pads[padIdx] && d.pads[padIdx].tower;
    if (!t || !t.ally.dead) return { ok: false, why: 'not broken' };
    if (d.coins < C.repair) return { ok: false, why: say(G, 'Không đủ Xu Sao') };
    d.coins -= C.repair; t.ally.dead = false; t.ally.hp = C.towerHp; say(G, 'Đã sửa tháp'); return { ok: true };
  };
  // Mua trùng loại tháp đã có: nâng Phẩm 1-6, mỗi bản 15 Xu Sao (6 bản = 90) [WIKI ME]. Sao tăng bằng EXP, không bằng Xu Sao.
  Df.upgrade = function (G, padIdx) {
    const d = G.defence, t = d && d.pads[padIdx] && d.pads[padIdx].tower;
    if (!t || t.ally.dead) return { ok: false, why: 'no tower' };
    if (t.pham >= C.phamMax) return { ok: false, why: say(G, 'Đã tới Phẩm tối đa') };
    if (d.coins < C.towerCost) return { ok: false, why: say(G, 'Không đủ Xu Sao') };
    d.coins -= C.towerCost; t.pham++;
    SK.num(G, t.x, t.y - 30, 'Phẩm ' + t.pham, '#ffd84a'); say(G, C.towers[t.id].name + ' lên Phẩm ' + t.pham);
    SK.emit('towerPham', G, t); return { ok: true, pham: t.pham };
  };
  function pickSel(G) {
    const d = G.defence, free = C.ids.filter(id => !d.towers.some(t => t.id === id)); d.sel = free[0] || null;
  }
  Df.cycleSel = function (G) {
    const d = G.defence, free = C.ids.filter(id => !d.towers.some(t => t.id === id));
    if (!free.length) return { ok: false, why: say(G, 'Đã có đủ các loại tháp') };
    const i = free.indexOf(d.sel); d.sel = free[(i + 1) % free.length]; say(G, 'Chọn ' + C.towers[d.sel].name, 1.4); return { ok: true, sel: d.sel };
  };
  // EXP giết quái trong đợt chia đều cho mọi tháp; lên sao theo từng bậc [WIKI ME]
  Df.giveExp = function (G, exp) {
    const d = G.defence; if (!d.towers.length) return;
    const share = exp / d.towers.length;
    for (const t of d.towers) {
      t.exp += share;
      while (t.star < C.starExp.length && t.exp >= C.starExp[t.star]) { t.exp -= C.starExp[t.star]; t.star++; SK.num(G, t.x, t.y - 26, '★' + t.star, '#ffd84a'); d.shots.push({ k: 'lvl', x: t.x, y: t.y, t: 0, dur: 0.7 }); }
    }
  };

  // ---- đợt quái
  // Quái từ chặng 4 lấy từ mọi vùng nối được qua cổng, chặng 1-3 chỉ vùng của bản đồ [WIKI Origin "Wave Defense"]
  function rosterOf(G, zone) {
    let ids = G.map.th.enemies.slice();
    if (zone >= 4) for (const th of Object.values(D.themes || {})) if (th && th.enemies) ids = ids.concat(th.enemies);
    return Array.from(new Set(ids)).filter(id => D.enemies[id] && !/^ex_/.test(id) && !D.enemies[id].boss);
  }
  const ALIENS = ['e_alien01', 'e_alien02', 'e_alien03', 'e_ufo'];
  // Danh sách {id, boss?, alien?}: ngân sách theo bảng pts x chặng; Đợt Lớn thêm vài quái Phi Thuyền, X-3 của chặng 3/6/9/12 có trùm sóng
  Df.waveList = function (G, zone, wave) {
    const roster = rosterOf(G, zone);
    let budget = Df.budget(zone, wave); const list = [];
    while (budget > 0) {
      const cand = roster.filter(id => consume(id) <= budget); if (!cand.length) break;
      const id = SK.pick(cand); budget -= consume(id); list.push({ id });
    }
    if (!list.length) list.push({ id: roster[0] });
    if (wave === 2 && zone >= 2) {
      const al = ALIENS.filter(id => D.enemies[id]);
      for (let i = 0, n = Math.min(4, 1 + Math.floor(zone / 3)); al.length && i < n; i++) list.push({ id: SK.pick(al), alien: true });
    }
    if (wave === 2 && C.bossZones[zone] && D.enemies.e_alien03) list.push({ id: 'e_alien03', boss: true });
    return list;
  };
  Df.startWave = function (G) {
    const d = G.defence;
    d.queue = Df.waveList(G, d.zone, d.wave); d.phase = 'fight'; d.spawnT = 0; d.rr = 0;
    const n = C.routesOf(d.zone), all = [0, 1, 2].sort(() => SK.rand() - 0.5);
    d.routes = all.slice(0, n);   // số tuyến vào theo chặng: 1 / 2 / 3 [WIKI Origin]
    say(G, ['Đợt quái nhỏ', 'Đợt quái vừa', 'Đợt quái lớn'][d.wave] + ' ' + d.zone + '-' + (d.wave + 1) + (d.queue.some(q => q.boss) ? ' · TRÙM!' : '') + ' xuất hiện!', 2.5);
    SK.emit('defenceWave', G, d.zone, d.wave);
  };
  Df.skip = function (G) { const d = G.defence; if (d && d.phase === 'wait') d.timer = Math.min(d.timer, C.skipTo); };
  function updateWaves(G, dt) {
    const d = G.defence;
    if (d.phase === 'wait') { d.timer -= dt; if (d.timer <= 0) Df.startWave(G); return; }
    if (d.phase !== 'fight') return;
    d.spawnT -= dt;
    while (d.queue.length && d.spawnT <= 0) {
      const q = d.queue.shift(), id = q.id, g = d.gates[d.routes[d.rr++ % d.routes.length]] || d.gates[0];
      const e = SK.makeEnemy(G, id, g.x + SK.randf(-6, 6), g.y + SK.randf(-6, 6), G.map.rooms[0]);
      e.hpMax = e.hp = q.boss ? C.bossZones[d.zone] : Math.round(e.hp * Df.hpMul(d.zone)); e.dz = d.zone; e.dboss = !!q.boss; e.dalien = !!q.alien;
      e.dwave = true; e.dpts = q.boss ? 10 : consume(id); G.enemies.push(e); d.spawnT += C.spawnGap;
    }
    if (d.queue.length || G.enemies.some(e => e.dwave && e.st !== 'dead')) return;
    // đợt dọn xong
    d.stats.waves++; SK.emit('defenceWaveClear', G, d.zone, d.wave);
    for (const t of d.towers) if (!t.ally.dead) t.ally.hp = Math.min(C.towerHp, t.ally.hp + C.towerHp * C.towerHeal);   // tháp hồi một phần sau mỗi đợt [LOC tips]
    d.wave++;
    if (d.wave >= C.wavesPerZone) {
      SK.emit('defenceZoneClear', G, d.zone);
      if (d.zone >= C.lastZone) { say(G, 'Thắng chặng ' + d.zone + '!', 3); finish(G, true); return; }
      d.zone++; d.wave = 0; say(G, 'Qua chặng ' + (d.zone - 1) + '! Sang chặng ' + d.zone, 3);
    }
    d.phase = 'wait'; d.timer = C.countdown;
  }
  SK.on('enemyKill', (G, e) => {
    if (!on(G) || !e.dwave) return;
    const d = G.defence; d.stats.kills++; e.dwave = false;
    Df.giveExp(G, (e.dpts || 1) * C.expPerPoint);
    if (e.dboss) Df.dropCoin(G, e.x, e.y - 2, C.bossCoins);
    else if (SK.rand() < C.dropRate) Df.dropCoin(G, e.x, e.y - 2);
  });

  // ---- dựng Phòng Đá Phép khi vào ván
  SK.on('stageEnter', G => {
    if (!on(G)) return;
    wrapAI();
    const d = G.defence, r = G.map.rooms[0], [cx, cy] = W.roomCenter(r);
    G.portal = null;   // không có cổng sang ải sau: thắng thua do Đá Phép / đợt quái
    d.stoneAt = { x: cx, y: cy - 6 };
    d.room = r; d.pads = []; d.towers = []; d.shots = []; d.pools = []; d.drops = [];
    // 12 Nền Tháp quanh Đá Phép [ƯỚC LƯỢNG: số nền, 12 cho 11 loại tháp]
    const ring = [[-52, 0], [52, 0], [-36, -30], [36, -30], [-36, 30], [36, 30], [0, -46], [0, 46], [-68, -22], [68, -22], [-68, 22], [68, 22]];
    ring.forEach(([ox, oy]) => d.pads.push({ x: cx + ox, y: cy + oy + 8, tower: null }));
    // 3 cổng đỏ: tây, bắc, đông của phòng
    const gate = (tx, ty) => { const x = tx * T + 8, y = ty * T + 12; return W.solidAt(G.map, x, y) ? { x: cx, y: cy - 40 } : { x, y }; };
    d.gates = [gate(r.x0 + 1, r.cy), gate(r.cx, r.y0 + 2), gate(r.x1 - 1, r.cy)];
    G.player.x = cx; G.player.y = cy + 18;
    // Đá Phép: nói chuyện thì đợt kế tới sau 3 giây
    G.interactables.push({ df: 1, x: d.stoneAt.x, y: d.stoneAt.y + 12, r: 18, labelY: 34,
      get label() { return d.phase === 'wait' ? 'Đá Phép: gọi đợt kế (sau ' + C.skipTo + ' giây)' : 'Đá Phép ' + d.stone.hp + '/' + d.stone.max; },
      use: g => Df.skip(g) });
    // Bậc Thầy Robot: chọn loại tháp chờ đặt
    const ex = cx - 76, ey = cy + 30;
    G.interactables.push({ df: 1, x: ex, y: ey + 4, r: 16, labelY: 34,
      get label() { return d.sel ? 'Bậc Thầy Robot: đổi tháp (đang chờ ' + C.towers[d.sel].name + ')' : 'Bậc Thầy Robot: đủ các loại tháp'; },
      use: g => Df.cycleSel(g) });
    G.props.push({ df: 1, x: ex, y: ey, draw(ctx, G2) { drawRobot(ctx, G2, ex, ey); } });
    d.pads.forEach((pad, i) => {
      G.interactables.push({ df: 1, x: pad.x, y: pad.y + 2, r: 11, labelY: 28,
        get label() {
          const t = pad.tower;
          if (!t) return d.sel ? 'Đặt ' + C.towers[d.sel].name + ' (' + C.towerCost + ' Xu Sao)' : 'Nền Tháp trống';
          return t.ally.dead ? 'Sửa ' + C.towers[t.id].name + ' (' + C.repair + ' Xu Sao)' : C.towers[t.id].name + ' ★' + t.star + ' · Phẩm ' + t.pham + (t.pham < C.phamMax ? ' (nâng ' + C.towerCost + ' Xu Sao)' : '');
        },
        use: g => { if (!pad.tower) Df.place(g, i); else if (pad.tower.ally.dead) Df.repair(g, i); else Df.upgrade(g, i); } });
      G.props.push({ df: 1, x: pad.x, y: pad.y - 8, draw(ctx, G2) { if (!pad.tower) drawPad(ctx, pad, G2); } });
    });
    G.props.push({ df: 1, x: d.stoneAt.x, y: d.stoneAt.y + 10, draw(ctx, G2) { drawStone(ctx, G2); } });
    G.props.push({ df: 1, x: cx, y: cy + 60, draw(ctx, G2) { drawLayer(ctx, G2); }, update(G2, q, dt) {
      if (!on(G2) || G2.state !== 'stage') return;
      d.stoneFlash = Math.max(0, (d.stoneFlash || 0) - dt);
      updateWaves(G2, dt); updateShots(G2, dt); updateDrops(G2, dt);
      for (const f of Df.tickers) f(G2, dt);
    } });
    say(G, 'Bảo vệ Đá Phép! Đợt đầu tới sau ' + C.countdown + ' giây (nói chuyện với Đá Phép để gọi sớm)', 4);
  });

  // ---- vẽ: prefab gốc trong defence.ab (tools/extra/defence.json) qua SK.drawPrefab; món nào thiếu thì vẽ hình khối
  const AS = C.artScale = 0.42;
  const NOSHOW = /body_dead|shadow_lock|dead_tap|\/star/;   // dead_tap = biểu tượng hỏng; sao tháp vẽ riêng
  Df.drawn = {};   // khoá prefab gốc đã vẽ thành công (test kiểm: đạn tháp vẽ bằng prefab gốc)
  const pf = (ctx, name, x, y, o) => { const P = SK.prefab(name); const ok = !!P && SK.drawPrefab(ctx, P, x, y, Object.assign({ scale: AS }, o)); if (ok) Df.drawn[name] = (Df.drawn[name] || 0) + 1; return ok; };
  Df.pf = pf;
  // vẽ khung của một phần prefab (vd. '/img/bullet' của chain_laser) kéo giãn dọc đoạn (x0,y0)->(x1,y1) hoặc phủ hình tròn; ghi khoá vào Df.drawn
  const partFrame = (name, part) => { const P = SK.prefab(name), q = P && P.find(p => p.n === part); return q && q.f; };
  Df.partFrame = partFrame;
  Df.drawBeam = function (ctx, name, part, x0, y0, x1, y1, thick, alpha) {
    const f = partFrame(name, part); if (!f || !SK.A.f[f]) return false;
    const w = SK.A.f[f][3], h = SK.A.f[f][4], len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ok = SK.draw(ctx, f, x0, y0, { rot: Math.atan2(y1 - y0, x1 - x0), sx: len / w, sy: thick / h, alpha });
    if (ok) Df.drawn[name] = (Df.drawn[name] || 0) + 1; return ok;
  };
  Df.drawDisc = function (ctx, name, part, x, y, rx, ry, alpha, col) {
    const f = partFrame(name, part); if (!f || !SK.A.f[f]) return false;
    const w = SK.A.f[f][3], h = SK.A.f[f][4];
    const ok = SK.drawTinted(ctx, f, x, y, col || null, { sx: rx * 2 / w, sy: ry * 2 / h, alpha });   // khung gốc là hạt trắng: nhân màu độc xanh / lửa cam
    if (ok) Df.drawn[name] = (Df.drawn[name] || 0) + 1; return ok;
  };
  Df.artOf = () => ({ stone: !!stoneFrame(), pad: !!SK.prefab('tower_base'), gate: !!SK.prefab('defence_enemy_gate'), coin: !!SK.prefab('coin_star'),
    towers: C.ids.filter(id => SK.prefab(id)) });
  const stoneFrame = () => { const l = D.extra && D.extra.sprites && D.extra.sprites['^magic_stone$']; return l && l[0] && SK.frame(l[0]) ? l[0] : null; };
  function drawStone(ctx, G) {
    const d = G.defence, s = d.stoneAt, f = d.stoneFlash > 0, t = G.t, sf = stoneFrame();
    if (sf) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 10, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      SK.draw(ctx, sf, s.x, s.y + 10, { sx: 0.8, sy: 0.8, alpha: f ? 0.6 + 0.4 * Math.sin(t * 40) : 1 });
      if (f) pf(ctx, 'magic_stone_shield', s.x, s.y + 10, { t: 0.5 - d.stoneFlash * 2, scale: 0.7 });
      const w = 28, k = d.stone.hp / d.stone.max;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - w / 2, s.y - 30, w, 4);
      ctx.fillStyle = k > 0.4 ? '#a85cf0' : '#ff4a4a'; ctx.fillRect(s.x - w / 2 + 1, s.y - 29, (w - 2) * k, 2);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 10, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3a66'; ctx.fillRect(s.x - 11, s.y + 4, 22, 6);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    ctx.fillStyle = f ? '#ffffff' : (pulse > 0.5 ? '#c07aff' : '#a85cf0');
    ctx.beginPath(); ctx.moveTo(s.x, s.y - 22); ctx.lineTo(s.x + 9, s.y - 6); ctx.lineTo(s.x + 6, s.y + 4); ctx.lineTo(s.x - 6, s.y + 4); ctx.lineTo(s.x - 9, s.y - 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(s.x - 3, s.y - 14, 2, 8);
    const w = 28, k = d.stone.hp / d.stone.max;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - w / 2, s.y - 30, w, 4);
    ctx.fillStyle = k > 0.4 ? '#a85cf0' : '#ff4a4a'; ctx.fillRect(s.x - w / 2 + 1, s.y - 29, (w - 2) * k, 2);
  }
  function drawPad(ctx, pad, G) {
    if (pf(ctx, 'tower_base', pad.x, pad.y + 4, { skip: p => /star/.test(p.n) })) return;
    ctx.strokeStyle = 'rgba(122,216,255,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(pad.x - 7 + 0.5, pad.y - 2 + 0.5, 13, 8);
    ctx.fillStyle = 'rgba(122,216,255,0.18)'; ctx.fillRect(pad.x - 7, pad.y - 2, 14, 9);
  }
  // clip bắn: ngay sau khi bắn (trong dur của clip) trả {state, t: giây từ lúc bắn}, ngoài ra null (chạy clip nhàn)
  Df.fireState = (G, t) => { const f = C.towers[t.id].fire; if (!f || t.fireAt == null) return null; const e = G.t - t.fireAt; return e >= 0 && e < f.dur ? { state: f.state, t: e } : null; };
  function drawTower(ctx, G, t, a) {
    const c = C.towers[t.id], x = t.x, y = t.y;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (SK.prefab(t.id)) {
      const dead = a.dead, fs = dead ? null : Df.fireState(G, t);
      pf(ctx, t.id, x, y + 4, { t: fs ? fs.t : G.t, state: fs ? fs.state : undefined, skip: p => NOSHOW.test(p.n) && !(dead && /body_dead/.test(p.n)) || (dead && (p.n === '/img/body' || /\/h1/.test(p.n))) || (!dead && /body_dead/.test(p.n)), alpha: a.flash > 0 ? 0.6 : 1 });
      if (t.star > 0) SK.text(ctx, '★' + t.star, x, y - 34, 6, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
      if (!a.dead && a.hp < C.towerHp) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 8, y + 6, 16, 2); ctx.fillStyle = '#6cff8a'; ctx.fillRect(x - 8, y + 6, 16 * a.hp / C.towerHp, 2); }
      return;
    }
    ctx.fillStyle = a.dead ? '#444' : '#2c3442'; ctx.fillRect(x - 7, y - 6, 14, 10);
    ctx.fillStyle = a.dead ? '#666' : (a.flash > 0 ? '#fff' : c.col); ctx.fillRect(x - 5, y - 14, 10, 9);
    SK.text(ctx, a.dead ? 'x' : c.ch, x, y - 6, 7, '#101018', 'center');
    if (t.star > 0) SK.text(ctx, '★' + t.star, x, y - 22, 6, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
    if (!a.dead && a.hp < C.towerHp) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 8, y + 6, 16, 2); ctx.fillStyle = '#6cff8a'; ctx.fillRect(x - 8, y + 6, 16 * a.hp / C.towerHp, 2); }
  }
  function drawRobot(ctx, G, x, y) {
    const hd = SK.heroSkin && SK.heroSkin('robot', 0), fr = hd && hd.idle && SK.animFrame(hd.idle, G.t);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (!fr || !SK.draw(ctx, fr, x, y, {})) { ctx.fillStyle = '#9fd2ff'; ctx.fillRect(x - 4, y - 12, 8, 12); }
  }
  // lớp vẽ đạn, tia, vũng, Xu Sao, cổng đỏ (một prop xếp theo y thấp nên nằm trên sàn)
  function drawLayer(ctx, G) {
    const d = G.defence;
    for (const g of d.gates) {
      if (pf(ctx, 'defence_enemy_gate', g.x, g.y, { t: G.t, state: 'transfer_gate', scale: 0.5 })) continue;
      ctx.fillStyle = 'rgba(255,60,60,0.35)'; ctx.beginPath(); ctx.ellipse(g.x, g.y, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(g.x, g.y, 9, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of d.pools) {
      const nm = p.fire ? 'biochemical_fire' : 'biochemical_gas', part = p.fire ? '/root/img' : '/img', al = 0.55 * Math.min(1, (p.dur - p.t) * 2);
      if (Df.drawDisc(ctx, nm, part, p.x, p.y, p.r, p.r * 0.6, al * 0.7, p.fire ? [1, 0.5, 0.15, 1] : [0.4, 0.9, 0.3, 1])) continue;
      ctx.fillStyle = 'rgba(108,220,90,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const s of d.shots) {
      if (s.t < 0) continue;
      if (s.k === 'bullet') { const z = 3 * (s.size || 1); ctx.fillStyle = s.amp ? '#ffb0ff' : '#ffe066'; ctx.fillRect(s.x - z / 2, s.y - z / 2, z, z); }
      else if (s.k === 'beam') { if (s.pf && Df.drawBeam(ctx, s.pf, s.part, s.x0, s.y0, s.x1, s.y1, 5, Math.max(0.2, 1 - s.t / s.dur))) continue; ctx.strokeStyle = s.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke(); }
      else if (s.k === 'spike') { const rise = Math.min(1, s.t * 8); if (!pf(ctx, 'spike_trap_bullet', s.x, s.y, { scale: 0.6 * rise, alpha: Math.max(0.2, 1 - s.t / s.dur) })) { ctx.fillStyle = '#d8dde6'; ctx.fillRect(s.x - 1, s.y - 6 * rise, 3, 6); } }
      else if (s.k === 'ring') { const k = s.t / s.dur; ctx.strokeStyle = s.col; ctx.globalAlpha = Math.max(0, 1 - k); ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * k, s.r * 0.6 * k, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (s.k === 'lvl') { const k = s.t / s.dur; ctx.strokeStyle = 'rgba(255,216,74,' + Math.max(0, 1 - k) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 6 + 12 * k, 3 + 6 * k, 0, 0, Math.PI * 2); ctx.stroke(); }   // prefab tower_level_up chỉ có hạt, không có hình
      else if (s.k === 'bomb') {
        const k = s.t / s.dur;
        if (s.done) { if (!pf(ctx, 'explode', s.x, s.y + 4, { t: s.t - s.dur, state: 'explode_small', scale: 0.7 })) { ctx.fillStyle = 'rgba(255,160,60,0.5)'; ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, Math.PI * 2); ctx.fill(); } }
        else if (!pf(ctx, 'warcraft_bomb', s.x, s.y - 40 * (1 - k), { scale: 0.8 })) { ctx.fillStyle = '#333'; ctx.fillRect(s.x - 2, s.y - 40 * (1 - k), 4, 5); }
      }
    }
    if (Df.drawExtra) Df.drawExtra(ctx, G);
    for (const c of d.drops) {
      const b = Math.sin(c.t * 6) * 1.2;
      if (pf(ctx, 'coin_star', c.x, c.y + b, { t: c.t, state: 'star_coin', scale: 0.5 })) continue;
      ctx.fillStyle = '#7ad8ff'; ctx.beginPath(); ctx.moveTo(c.x, c.y - 5 + b); ctx.lineTo(c.x + 3, c.y - 2 + b); ctx.lineTo(c.x, c.y + 1 + b); ctx.lineTo(c.x - 3, c.y - 2 + b); ctx.fill();
    }
  }
  SK.on('hud', (ctx, G) => {
    if (!on(G) || !G.map) return;
    const d = G.defence, v = SK.view;
    const left = d.queue.length + G.enemies.filter(e => e.dwave && e.st !== 'dead').length;
    const wv = d.phase === 'wait' ? 'Đợt ' + d.zone + '-' + (d.wave + 1) + ' sau ' + Math.ceil(d.timer) + ' giây' : 'Đợt ' + d.zone + '-' + (d.wave + 1) + ' · còn ' + left + ' quái';
    SK.text(ctx, wv, v.w / 2, 14, 9, '#fff', 'center', 'rgba(0,0,0,0.9)');
    SK.text(ctx, 'Đá Phép ' + d.stone.hp + '/' + d.stone.max + '   Xu Sao ' + d.coins + '   Tháp ' + d.towers.length, v.w / 2, 26, 8, '#7ad8ff', 'center', 'rgba(0,0,0,0.9)');
  });

  Df.start = hero => SK.startRun(hero || 'knight', 'defence', []);
  if (window.SK_GAME && SK_GAME.debug) SK_GAME.debug.defence = hero => { Df.start(hero); return true; };
})();
