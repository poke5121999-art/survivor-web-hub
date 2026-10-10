// Vũ Khí Cuối Cùng 01 (boss_lvbu "Ultimate Weapon: Code 01", 4-5 Chiến Trường Cổ 4B). Nhãn: [ĐO] dữ liệu bundle, [WIKI Ultimate Weapon: Code 01 + /Tactics], [ƯỚC LƯỢNG].
// Rig sprite (không phải Spine) vẽ bằng khung rig js/bosses.js; dữ liệu art/spine/boss_lvbu/data.js (tools/spine/export_boss.py).
// AI gốc CGBoss3Brain (IL2CPP): đòn dựng từ clip Animator (skill_1_0..2 chém/vuốt/nhảy dậm; skill_2 xoay Asura; skill_3 lên thú cưỡi lao;
// skill_4 giáng Asura để lại vết; skill_5 xoáy hút + gầm sét; skill_6 mở ngực xoáy + sét rơi; skill_weak_5/6 kiệt sức [ĐO clip, WIKI]),
// prefab thật boss_lvbu_blade (Bullet02 dẫn, góc 15 [ĐO]), _dead_zone (ExplodeHammer 6 [ĐO]), _rotate_weapon, _absorb, _lightning_*.
// Máu: wiki 1800 = 1500 x 1,2 [WIKI] (config 2000 khác). Số thời gian/sát thương không có nguồn là [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT, RG = SK.bossRig;
  if (!K || !RG) return;
  const { TAU, DEG, U, B86, fire, hurtIn, explode, aimAt, rigPlay, rigTime, clampRoom, point } = K;
  const ent = B86.bosses.boss_lvbu;
  if (!ent) return;
  ent.hp = 1500;
  const BUL = B86.bullets;
  const ALL = ['combo', 'bigslam', 'spin', 'mount', 'mark', 'absorb', 'whirl'];
  const FIRST = { combo: 'skill_1_0', bigslam: 'idle', spin: 'skill_2_0', mount: 'skill_3_0', mark: 'idle', absorb: 'skill_5_prepare', whirl: 'skill_6_prepare' };
  const fl = e => (e.face < 0 ? -1 : 1);
  const tl = (e, t, fn) => e.tl.push({ t: e.tlT + t, fn });
  const pl = (e, s) => { rigPlay(e.R, s); e.atk = s; };
  const rb = (G, e, x, y, a, spd, dmg, o) => fire(G, e, 'bullet_e_1', x, y, a, Object.assign({ spd, dmg, life: 5, h: 10 }, o));
  const live = e => !e.deathDone;

  function warnDisc(G, e, x, y, r, life) {
    e.arena.objs.push({ t: 0, dur: life, ground(ctx, G2, o) {
      const k = o.t / life;
      ctx.save(); ctx.strokeStyle = 'rgba(255,60,60,' + (0.5 + 0.4 * Math.sin(o.t * 12)) + ')'; ctx.fillStyle = 'rgba(230,40,40,' + (0.08 + 0.14 * k) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    } });
  }
  function shock(G, e, x, y, r, dmg) {
    explode(G, x, y, 'explode_hit_player', 'explode_big', dmg);
    G.shake = Math.max(G.shake, 5);
    e.arena.objs.push({ t: 0, dur: 0.5, ground(ctx, G2, o) { const k = o.t / 0.5; ctx.save(); ctx.strokeStyle = 'rgba(255,170,60,' + (1 - k) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, r * k, r * k * 0.7, 0, 0, TAU); ctx.stroke(); ctx.restore(); } });
  }
  // sét: báo đỏ 0,7 s rồi đánh vòng bán kính r (8 sát thương [ƯỚC LƯỢNG])
  function bolt(G, e, x, y, r, warn) {
    warnDisc(G, e, x, y, r, warn);
    e.arena.objs.push({ t: 0, dur: warn + 0.35, update(G2, o) {
      if (!o.hit && o.t >= warn) { o.hit = true; hurtIn(G2, x, y, r, 8); G2.shake = Math.max(G2.shake, 3); }
      return o.t < o.dur && live(e);
    }, air(ctx, G2, o) {
      if (o.t < warn) return;
      const k = (o.t - warn) / 0.35; ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 3;
      ctx.beginPath(); let cx = x, cy = y - 150; ctx.moveTo(cx, cy);
      for (let i = 1; i <= 6; i++) { cx = x + (i % 2 ? 7 : -7) * (1 - i / 7); cy = y - 150 + i * 25; ctx.lineTo(cx, cy); }
      ctx.stroke(); ctx.fillStyle = 'rgba(255,240,120,' + 0.5 * (1 - k) + ')'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.fill(); ctx.restore();
    } });
  }
  const pull = (G, e, dt, sp) => {
    const p = G.player, dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > 20 && p.st !== 'dead') SK.moveBox(G.map, p, dx / d * sp * dt, dy / d * sp * dt, 4);
  };
  const push = (G, e, r, dist) => {
    const p = G.player, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d < r) { const k = dist; SK.moveBox(G.map, p, dx / d * k, dy / d * k, 4); }
  };

  // ---------------------------------------------------------------- các đòn
  const ATK = {
    combo: () => {},
    // Nhảy lên giáng xuống vòng đỏ 3 s: sóng xung kích [WIKI]
    bigslam: (e, G) => {
      const p = G.player, [tx, ty] = clampRoom(e, p.x, p.y);
      e.sl = { x0: e.x, y0: e.y, tx, ty, landed: false };
      warnDisc(G, e, tx, ty, 38, 3);
      tl(e, 2.5, () => { pl(e, 'skill_1_2'); });
    },
    // Xoay Asura: đạn tròn bốn hướng quay 360 độ, và 3 mũi nhọn đỏ dẫn chậm 6 s [WIKI; clip skill_2_0 -> skill_2_1_idle]
    spin: (e, G) => {
      tl(e, 0.5, () => { pl(e, 'skill_2_1_idle'); e.spinOn = true; });
      let a0 = 0;
      for (let i = 0; i < 24; i++) tl(e, 0.7 + 0.13 * i, G2 => { a0 += 17 * DEG; for (let k = 0; k < 4; k++) rb(G2, e, e.x, e.y - 14, a0 + k * TAU / 4, 6, 4); });
      tl(e, 0.9, G2 => { const a = aimAt(G2, e.x, e.y - 14); for (let k = 0; k < 3; k++) fire(G2, e, 'boss_lvbu_blade', e.x, e.y - 14, a + (k - 1) * 40 * DEG, { spd: 3.5, dmg: 5, life: 6, h: 12, noKids: true, home: { interval: 0.1, delay: 0.3, limit: 15, turn: 8 } }); });
      tl(e, 3.9, () => { e.spinOn = false; e.atkEnd = true; });
    },
    // Lên thú cưỡi, 3 lần lao thẳng (vạch đỏ báo 2 s), bắn đạn tròn hai bên đường lao [WIKI]
    mount: (e, G) => {
      e.mt = { n: 0, stage: 0, t: 0 };
    },
    // Giơ Asura chỉ vào vùng chữ nhật hướng người chơi, 2 s sau giáng xuống để lại vết kiếm 5 s [WIKI]
    mark: (e, G) => {
      const a = aimAt(G, e.x, e.y - 14), L = 130, W = 34, x0 = e.x, y0 = e.y;
      const mk = e.mk = { a, t: 0, struck: false };
      e.arena.objs.push({ t: 0, dur: 8, hitT: 0,
        update(G2, o, dt) {
          if (!live(e)) return false;
          if (mk.struck) {
            o.hitT -= dt;
            const p = G2.player, c = Math.cos(a), s = Math.sin(a), px = p.x - x0, py = p.y - 5 - y0, al = px * c + py * s, of = -px * s + py * c;
            if (o.hitT <= 0 && p.st !== 'dead' && al > 0 && al < L && Math.abs(of) < W / 2) { SK.hurtPlayer(G2, K.dmgOf(6)); o.hitT = 0.5; }   // ExplodeHammer 6 [ĐO]
          }
          return o.t < (mk.struckAt || 2) + 5;
        },
        ground(ctx, G2, o) {
          ctx.save(); ctx.translate(x0, y0); ctx.rotate(a);
          ctx.fillStyle = mk.struck ? 'rgba(160,20,20,0.55)' : 'rgba(230,50,50,' + (0.12 + 0.14 * Math.min(1, o.t / 2)) + ')';
          ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = 2; ctx.fillRect(0, -W / 2, L, W); ctx.strokeRect(0, -W / 2, L, W); ctx.restore();
        } });
      tl(e, 1.0, () => { pl(e, 'skill_4_0'); });
    },
    // Xoáy hút 3 s (nuốt mọi sát thương), gầm: sét lan ba vòng, rồi kiệt sức 3 s [WIKI]
    absorb: () => {},
    // Mở ngực xoáy hút 3 s, gầm đẩy lùi, sét rơi ngẫu nhiên, kiệt sức 3 s [WIKI]
    whirl: () => {}
  };

  function startAtk(G, e, n) {
    e.sat = 0; e.cur = n; e.tl = []; e.tlT = 0; e.sl = null; e.mt = null; e.ph = 0; e.phT = 0; e.spinOn = false; e.absorbing = false;
    ATK[n](e, G);
    if (n === 'absorb' || n === 'whirl') { e.ph = 0; e.phT = 0; }
  }
  const def = {
    atks: ALL, idle: 'idle', run: 'run', hand: 'actor/img/hand', firstCd: 1.2, enrageCd: 0.8,
    state: FIRST,
    start: Object.fromEntries(ALL.map(n => [n, (G, e) => { if (!e.init) { e.init = true; e.tl = []; e.tlT = 0; } startAtk(G, e, n); }])),
    tick(G, e, dt) {
      if (!e.init) { e.init = true; e.tl = []; e.tlT = 0; }
      if (!e.atk) { e.cur = null; e.sat = 0; e.tl = []; e.invuln = false; e.spinOn = false; return; }
      e.sat += dt;
      if (e.sat > 25) e.atkEnd = true;
      const s = K.rigState(e.R); if (s) e.atk = s;
      e.tlT += dt;
      for (const q of e.tl.slice()) if (e.tlT >= q.t) { e.tl.splice(e.tl.indexOf(q), 1); q.fn(G); }
      const p = G.player;
      if (e.cur === 'bigslam' && e.sl && !e.sl.landed && e.atk === 'skill_1_2') {
        const k = SK.clamp((rigTime(e.R) - 0.1667) / 0.3333, 0, 1);
        e.x = e.sl.x0 + (e.sl.tx - e.sl.x0) * k; e.y = e.sl.y0 + (e.sl.ty - e.sl.y0) * k;
      }
      if (e.cur === 'mount' && e.mt) mountTick(G, e, dt);
      if (e.cur === 'absorb') phaseTick(G, e, dt, 5);
      if (e.cur === 'whirl') phaseTick(G, e, dt, 6);
      void p;
    },
    ev: {
      anim_onSkillEffectiveStart(G, e, arg, st) {
        if (e.cur === 'combo' && (st === 'skill_1_0' || st === 'skill_1_1')) {
          hurtIn(G, e.x + fl(e) * 24, e.y - 10, st === 'skill_1_0' ? 30 : 34, 6);   // chém Asura rồi vuốt, 6 sát thương [ƯỚC LƯỢNG]
          G.shake = Math.max(G.shake, 2);
        } else if (e.cur === 'mark' && st === 'skill_4_0') {
          if (e.mk) { e.mk.struck = true; e.mk.struckAt = e.mk.t || 2; e.arena.objs.forEach(o => { if (o.hitT != null && !o.sd) { o.sd = 1; o.dur = o.t + 5; } }); }
          G.shake = Math.max(G.shake, 4);
        }
      },
      anim_onSkillEffectiveEnd(G, e, arg, st) {
        if (st !== 'skill_1_2') return;
        if (e.cur === 'combo') { shock(G, e, e.x + fl(e) * 14, e.y, 40, 8); }
        else if (e.cur === 'bigslam' && e.sl && !e.sl.landed) { e.sl.landed = true; e.x = e.sl.tx; e.y = e.sl.ty; shock(G, e, e.x, e.y, 46, 8); for (let k = 0; k < 12; k++) rb(G, e, e.x, e.y - 6, k * TAU / 12, 5, 4); }
      },
      anim_onSkillEnd(G, e, arg, st) { if ((e.cur === 'combo' && st === 'skill_1_2') || (e.cur === 'bigslam' && st === 'skill_1_2') || (e.cur === 'mark' && st === 'skill_4_0')) e.atkEnd = true; }
    },
    drawOver(ctx, G, e) {
      if (!e.spinOn) return;
      const L = BUL.boss_lvbu_rotate_weapon; if (!L) return;
      if (!e.rw) e.rw = RG.rigNew(L.rig);
      RG.rigTick(e.rw, 1 / 60);
      RG.rigDraw(ctx, e.rw, e.x, e.y - 12, {});
    },
    dead(G, e) { e.invuln = false; e.tl = []; e.spinOn = false; }
  };

  // Ba lần lao
  function mountTick(G, e, dt) {
    const m = e.mt, p = G.player, r = e.room, T = SK.TILE;
    m.t += dt;
    if (m.stage === 0) {     // lên thú cưỡi (skill_3_0 .57 s rồi skill_3_1 lặp)
      if (m.t >= 0.6) { m.stage = 1; m.t = 0; m.a = aimAt(G, e.x, e.y - 12); m.line = true; pl(e, 'skill_3_1'); }
    } else if (m.stage === 1) {  // vạch đỏ 2 s [WIKI]
      m.a = aimAt(G, e.x, e.y - 12);
      if (m.t >= 2.0) { m.stage = 2; m.t = 0; m.line = false; m.hit = false; m.x0 = e.x; m.y0 = e.y; m.bn = 0.12; e.face = Math.cos(m.a) < 0 ? -1 : 1; }
    } else if (m.stage === 2) {
      const sp = 13 * U, c = Math.cos(m.a), s = Math.sin(m.a);
      const hit = SK.moveBox(G.map, e, c * sp * dt, s * sp * dt, e.r);
      m.bn += dt;
      if (m.bn >= 0.12) { m.bn = 0; for (const sd of [-1, 1]) rb(G, e, e.x, e.y - 8, m.a + sd * Math.PI / 2, 5, 4, { life: 3 }); }   // đạn tròn vuông góc đường lao [WIKI]
      if (!m.hit && p.st !== 'dead' && Math.abs(p.x - e.x) < 20 && Math.abs((p.y - 6) - (e.y - 12)) < 20) { m.hit = true; SK.hurtPlayer(G, K.dmgOf(8), e.x, e.y); }
      if (hit || m.t > 1.6) { m.n++; m.stage = m.n >= 3 ? 3 : 1; m.t = 0; G.shake = Math.max(G.shake, 3); }
    } else if (m.stage === 3) { if (m.t >= 0.5) { e.mt = null; e.atkEnd = true; } }
    if (m.line && m.stage === 1) {
      if (!m.obj) m.obj = e.arena.objs.push({ t: 0, dur: 1e9, update() { return !!e.mt && e.mt === m && !e.deathDone; },
        ground(ctx) { if (!m.line) return; const k = Math.min(1, m.t / 2); ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(m.a); ctx.fillStyle = 'rgba(230,50,50,' + (0.1 + 0.2 * k) + ')'; ctx.fillRect(0, -14, 230, 28); ctx.restore(); } });
    }
    void r; void T;
  }
  // Xoáy hút (5: Asura, 6: ngực) rồi gầm + sét rồi kiệt sức
  function phaseTick(G, e, dt, kind) {
    e.phT += dt;
    const ab = kind === 5 ? 'skill_5_1' : 'skill_6_0';
    if (e.ph === 0) {
      // chờ clip chuẩn bị chạy xong (5_prepare 1.5 s -> 5_0 ... -> 5_1 lặp; 6_prepare .5 s -> 6_0 lặp)
      if (e.atk === ab) { e.ph = 1; e.phT = 0; e.invuln = true; }   // hút: bất tử, hấp thụ mọi sát thương [WIKI]
      else if (e.phT > 6) { e.ph = 1; e.phT = 0; e.invuln = true; }
    } else if (e.ph === 1) {
      pull(G, e, dt, 38);
      if (e.phT >= 3) { e.ph = 2; e.phT = 0; e.invuln = false; pl(e, kind === 5 ? 'skill_5_2_start' : 'skill_6_1_start'); G.shake = Math.max(G.shake, 5); push(G, e, 70, 30); e.roar = 0; }
    } else if (e.ph === 2) {
      // gầm: 5 -> sét lan ba vòng từ chính nó; 6 -> sét rơi ngẫu nhiên khắp sàn [WIKI]
      if (e.roar === 0) {
        e.roar = 1;
        if (kind === 5) { for (let i = 0; i < 3; i++) { const R = 34 + i * 34; for (let k = 0; k < 4 + i * 3; k++) { const a = k * TAU / (4 + i * 3) + i * 0.5; setTimeout0(G, e, 0.9 + i * 0.8, () => bolt(G, e, e.x + Math.cos(a) * R, e.y + Math.sin(a) * R * 0.7, 22, 0.7)); } } }
        else { for (let i = 0; i < 14; i++) setTimeout0(G, e, 0.3 + i * 0.22, () => { const p = G.player; bolt(G, e, p.x + SK.randf(-90, 90), p.y + SK.randf(-60, 60), 20, 0.7); }); }
      }
      if (e.phT >= 3.6) { e.ph = 3; e.phT = 0; pl(e, kind === 5 ? 'skill_5_2_end' : 'skill_6_1_end'); }
    } else if (e.ph === 3) {
      if (e.phT >= 3.4) e.atkEnd = true;   // 5_2_end 0,5 s rồi kiệt sức (skill_weak) 3 s [WIKI]
    }
  }
  function setTimeout0(G, e, t, fn) { e.arena.objs.push({ t: 0, dur: t + 0.01, update(G2, o) { if (o.t >= t) { if (!e.deathDone && !o.d) { o.d = 1; fn(); } return false; } return !e.deathDone; } }); }

  const hurt0 = SK.hurtEnemy;
  SK.hurtEnemy = function (G, e, dmg, ...rest) {
    if (e && e.bossKey === 'boss_lvbu' && e.invuln) { e.flash = 0.04; return false; }
    return hurt0.call(this, G, e, dmg, ...rest);
  };
  SK.bossRegister('boss_lvbu', def);
})();
