// Đổng Trác (boss_dongzhuo, 4-5 Chiến Trường Cổ 4B). Nhãn: [ĐO] dữ liệu bundle, [WIKI Dong Zhuo + /Tactics], [ƯỚC LƯỢNG].
// Rig sprite (không phải Spine) vẽ bằng khung rig js/bosses.js; dữ liệu art/spine/boss_dongzhuo/data.js (tools/spine/export_boss.py).
// Hai pha: kiệu (idle/run) và dưới 50% máu hoá xe cơ giới (change_state 3,125 s bất tử -> idle_1/run_1) [ĐO clip, WIKI].
// AI gốc CGBoss2Brain (IL2CPP): đòn dựng từ clip (skill_cannon, skill_laser_start/loop/end, eat/eat_angry), prefab thật
// (boss_dongzhuo_barrel 20 máu, _girl_0/1, _shield_guard, _cannon, _girl_bullet ExplodeHammer 6 [ĐO]) và wiki.
// Máu: wiki 2160 = 1800 x 1,2 [WIKI] (config 2000 khác). Số không có nguồn là [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT, RG = SK.bossRig;
  if (!K || !RG) return;
  const { TAU, DEG, U, B86, fire, hurtIn, explode, aimAt, bossProp, rigPlay, clampRoom, point } = K;
  const ent = B86.bosses.boss_dongzhuo;
  if (!ent) return;
  ent.hp = 1800;
  const BUL = B86.bullets;
  let CUR = null;
  const P1 = ['homing', 'surround', 'beer', 'maid', 'statue'], P2 = ['homing', 'surround', 'beer', 'maid', 'statue', 'laser', 'runestone', 'rings', 'trail'];
  const ALL = P2;
  const ANY = ['homing', 'surround', 'beer', 'maid', 'statue', 'rings', 'trail'];
  const live = a => (a || []).filter(q => q.st !== 'dead');
  const tl = (e, t, fn) => e.tl.push({ t: e.tlT + t, fn });
  const sm = (G, e, x, y, a, spd, dmg, o) => fire(G, e, 'bullet_e_1', x, y, a, Object.assign({ spd, dmg, life: 5, h: 10 }, o));

  function ensure(G, e) {
    if (e.init) return;
    e.init = true; CUR = e; e.p2 = false; e.tl = []; e.tlT = 0; e.barrels = []; e.maids = []; e.guards = []; e.invuln = false; e.endT = 0;
  }
  const killProps = e => { for (const q of [].concat(e.barrels, e.maids, e.guards)) { q.st = 'dead'; q.hp = 0; } };

  function warnRing(G, e, x, y, r, life) {
    e.arena.objs.push({ t: 0, dur: life, ground(ctx, G2, o) {
      const k = o.t / life;
      ctx.save(); ctx.strokeStyle = 'rgba(255,60,60,' + (0.5 + 0.4 * Math.sin(o.t * 12)) + ')'; ctx.fillStyle = 'rgba(230,40,40,' + (0.08 + 0.12 * k) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    } });
  }

  // ---------------------------------------------------------------- các đòn
  const ATK = {
    // 8 đạn tím tự dẫn 4 sát thương [WIKI]
    homing: e => { const [x, y] = point(e, 'actor/img/hand'); for (let k = 0; k < 8; k++) tl(e, 0.12 * k, G => { sm(G, e, x, y, aimAt(G, x, y) + (k - 3.5) * 22 * DEG, 5, 4, { home: { interval: 0.1, delay: 0.3, limit: 6, turn: 10 } }); }); tl(e, 1.8, () => { e.atkEnd = true; }); },
    // vòng đạn nhỏ có khe hở quay dần, 5 sát thương [WIKI]
    surround: e => {
      for (let i = 0; i < 24; i++) tl(e, 0.14 * i, G => {
        const a0 = i * 13 * DEG;
        for (let k = 0; k < 20; k++) if (k % 10 > 1) sm(G, e, e.x, e.y - 14, a0 + k * TAU / 20, 4.5, 5);   // 2 khe mỗi vòng
      });
      tl(e, 3.6, () => { e.atkEnd = true; });
    },
    // ném 3 (5 khi nổi giận) vại bia 25 máu: không phá trong 3 s thì nổ 5 sát thương; trong lúc đó Đổng Trác ăn thịt nướng hồi 1 máu/giây [WIKI]
    beer: (e, G) => {
      const n = e.p2 ? 5 : 3, p = G.player;
      rigPlay(e.R, e.p2 ? 'eat_angry' : 'eat');
      for (let k = 0; k < n; k++) {
        const [tx, ty] = clampRoom(e, p.x + (k ? SK.randf(-70, 70) : 0), p.y + (k ? SK.randf(-45, 45) : 0));
        const x0 = e.x, y0 = e.y - 20; let bt = 0;
        const q = bossProp(G, e, null, x0, y0, { rig: BUL.boss_dongzhuo_barrel.rig, hp: 25, life: 3.8,
          tick(G2, pr, dt) { bt += dt; if (bt < 0.7) { const f = bt / 0.7; pr.x = x0 + (tx - x0) * f; pr.y = y0 + (ty - y0) * f; } else { pr.x = tx; pr.y = ty; } },
          onEnd(G2, pr, killed) { if (!killed && !e.deathDone) explode(G2, pr.x, pr.y - 4, 'explode_hit_player', 'explode_big', 5); } });
        if (q) { e.barrels.push(q); warnRing(G, e, tx, ty, 26, 3.8); }
      }
      e.eating = true;
    },
    // 2 (4) nữ tỳ 30 máu chạy tới người chơi, chạm thì nổ 5 sát thương [WIKI]
    maid: (e, G) => {
      const n = e.p2 ? 4 : 2;
      for (let k = 0; k < n; k++) {
        if (live(e.maids).length >= 4) break;
        const id = k % 2 ? 'boss_dongzhuo_girl_1' : 'boss_dongzhuo_girl_0', [x, y] = SK.freeNear([e.x + (k - (n - 1) / 2) * 24, e.y + 18]);
        const q = bossProp(G, e, null, x, y, { rig: BUL[id].rig, state: 'run', hp: 30, life: 14,
          tick(G2, pr, dt) {
            const p = G2.player, dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy) || 1;
            SK.moveBox(G2.map, pr, dx / d * 40 * dt, dy / d * 40 * dt, pr.r); pr.face = dx < 0 ? -1 : 1;
            if (p.st !== 'dead' && d < 13) { pr.st = 'dead'; pr.hp = 0; pr.boom = true; }
          },
          onEnd(G2, pr, killed) { if (pr.boom && !e.deathDone) explode(G2, pr.x, pr.y - 4, 'explode_hit_player', 'explode_small', 5); } });
        if (q) { q.face = 1; e.maids.push(q); }
      }
      tl(e, 1.2, () => { e.atkEnd = true; });
    },
    // 4 tượng tím 50 máu: Đổng Trác bất tử tới khi phá hết [WIKI]
    statue: (e, G) => {
      if (live(e.guards).length) { tl(e, 0.3, () => { e.atkEnd = true; }); return; }
      for (let k = 0; k < 4; k++) {
        const a = k * TAU / 4 + Math.PI / 4, [x, y] = clampRoom(e, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 50);
        const q = bossProp(G, e, null, x, y, { rig: BUL.boss_dongzhuo_shield_guard.rig, hp: 50, life: 90 });
        if (q) e.guards.push(q);
      }
      e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o) { return live(e.guards).length > 0 && !e.deathDone; },
        ground(ctx) {
          ctx.save(); ctx.strokeStyle = 'rgba(190,90,255,0.7)'; ctx.lineWidth = 2;
          for (const q of live(e.guards)) { ctx.beginPath(); ctx.moveTo(e.x, e.y - 14); ctx.lineTo(q.x, q.y - 8); ctx.stroke(); }
          ctx.restore();
        } });
      tl(e, 1.0, () => { e.atkEnd = true; });
    },
    // Laser tím lớn (pha 2): nạp, bắn 1 s, 10 sát thương mỗi nhịp [WIKI]
    laser: e => { e.lz = null; },
    // Ném 3 đá ngũ hành: vỡ 4 mảnh, hai tia X mảnh 10 sát thương vài giây; tâm X là chỗ đá rơi [WIKI]
    runestone: e => { e.rs = false; },
    // 5 vòng 18 đạn nhỏ, mỗi vòng một hướng (kiểu Shotgun M3) [WIKI]
    rings: e => { for (let i = 0; i < 5; i++) tl(e, 0.3 * i + 0.3, G => { const a0 = SK.rand() * TAU; for (let k = 0; k < 18; k++) sm(G, e, e.x, e.y - 14, a0 + k * TAU / 18, 5.5, 5); }); tl(e, 2.2, () => { e.atkEnd = true; }); },
    // vệt đạn tím bắn thẳng vào người chơi, rải đạn nhỏ vuông góc khi bay (kiểu Goblin Priest) [WIKI]
    trail: (e, G) => {
      const [x, y] = point(e, 'actor/img/hand'), a = aimAt(G, x, y); let nx = 0.1;
      sm(G, e, x, y, a, 7, 5, { life: 3, tick(G2, b) { while (b.age >= nx) { nx += 0.1; for (const s of [-1, 1]) sm(G2, e, b.x, b.y, a + s * Math.PI / 2, 3, 5, { life: 2.5, h: b.h }); } } });
      tl(e, 3.2, () => { e.atkEnd = true; });
    }
  };

  function crossStone(G, e, tx, ty) {
    const D = 38, fr = K.frameOf('boss_dongzhuo_cannon'), f = fr && window.SK_ATLAS.f[fr];
    const [x0, y0] = point(e, 'actor/cannon_point');
    e.arena.objs.push({ t: 0, dur: 5.2, hitT: 0,
      update(G2, o, dt) {
        if (e.deathDone) return false;
        if (o.t > 1.6 && o.t < 4.6) {
          o.hitT -= dt;
          const p = G2.player;
          if (o.hitT <= 0 && p.st !== 'dead') {
            const px = p.x - tx, py = p.y - 5 - ty;
            if (Math.abs(px - py) / Math.SQRT2 < 5 || Math.abs(px + py) / Math.SQRT2 < 5) { if (Math.abs(px) < D + 4 && Math.abs(py) < D + 4) { SK.hurtPlayer(G2, K.dmgOf(10)); o.hitT = 0.5; } }
          }
        }
        return o.t < o.dur;
      },
      air(ctx, G2, o) {
        const piece = (x, y) => { if (f && SK.pages[f[0]]) ctx.drawImage(SK.pages[f[0]], f[1], f[2], f[3], f[4], Math.round(x - f[5]), Math.round(y - f[6]), f[3], f[4]); else { ctx.fillStyle = '#c33'; ctx.fillRect(x - 4, y - 8, 8, 8); } };
        if (o.t < 0.8) { const k = o.t / 0.8; piece(x0 + (tx - x0) * k, y0 + (ty - y0) * k - 40 * Math.sin(Math.PI * k)); return; }
        const k = Math.min(1, (o.t - 0.8) / 0.8), d = D * k;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) piece(tx + sx * d, ty + sy * d);
        if (o.t > 1.6 && o.t < 4.6 || (o.t > 0.8 && Math.sin(o.t * 30) > 0)) {
          ctx.save(); ctx.strokeStyle = o.t > 1.6 ? 'rgba(255,50,50,0.95)' : 'rgba(255,90,90,0.4)'; ctx.lineWidth = o.t > 1.6 ? 2 : 1;
          ctx.beginPath(); ctx.moveTo(tx - D, ty - D); ctx.lineTo(tx + D, ty + D); ctx.moveTo(tx + D, ty - D); ctx.lineTo(tx - D, ty + D); ctx.stroke(); ctx.restore();
        }
      } });
  }

  function startAtk(G, e, n) { e.sat = 0; e.cur = n; e.tl = []; e.tlT = 0; e.eating = false; if (n !== 'beer' && n !== 'laser' && n !== 'runestone') rigPlay(e.R, 'atk', 5); if (ATK[n]) ATK[n](e, G); }
  const stateOf = n => (n === 'laser' ? 'skill_laser_start' : n === 'runestone' ? 'skill_cannon' : (CUR && CUR.p2 ? 'idle_1' : 'idle'));
  const def = {
    atks: ALL, firstCd: 1.2, enrageCd: 0.8, hand: 'actor/img/hand',
    get idle() { return CUR && CUR.p2 ? 'idle_1' : 'idle'; },
    get run() { return CUR && CUR.p2 ? 'run_1' : 'run'; },
    state: Object.defineProperties({}, Object.fromEntries(ALL.map(n => [n, { enumerable: true, get: () => stateOf(n) }]))),
    pick(G, e) { ensure(G, e); return e.p2 ? P2 : P1; },
    start: Object.fromEntries(ALL.map(n => [n, (G, e) => { ensure(G, e); startAtk(G, e, n); }])),
    enrage(G, e) {
      ensure(G, e);
      killProps(e);
      e.xf = 3.125; e.invuln = true; e.cur = 'xf'; e.tl = []; e.lz = null; e.eating = false;
      rigPlay(e.R, 'change_state'); e.R.anims[0].layers[2].st = null;
      e.atk = 'change_state'; e.atkEnd = false;
      for (const b of G.bullets) if (b.side === 'e') b.dead = true;
    },
    tick(G, e, dt) {
      ensure(G, e); CUR = e;
      e.invuln = !!e.xf || live(e.guards).length > 0;
      if (e.eating) { const alive = live(e.barrels).length; if (alive) e.hp = Math.min(e.hpMax, e.hp + dt); else { e.eating = false; e.R.anims[0].layers[2].st = null; if (e.cur === 'beer') e.atkEnd = true; } }
      if (e.xf) { e.xf -= dt; if (e.xf <= 0) { e.xf = 0; e.p2 = true; e.invuln = live(e.guards).length > 0; e.atkEnd = true; e.cur = null; } return; }
      if (!e.atk) { e.cur = null; e.sat = 0; e.tl = []; return; }
      e.sat += dt;
      if (e.sat > 12) e.atkEnd = true;
      const s = K.rigState(e.R); if (s) e.atk = s;
      e.tlT += dt;
      for (const q of e.tl.slice()) if (e.tlT >= q.t) { e.tl.splice(e.tl.indexOf(q), 1); q.fn(G); }
      if (e.cur === 'laser') {
        if (e.lz) {
          e.lz.t += dt;
          if (e.lz.t >= 1.0 && !e.lz.ended) { e.lz.ended = true; rigPlay(e.R, 'skill_laser_end'); e.atk = 'skill_laser_end'; e.endT = 0.35; }
        }
        if (e.endT > 0) { e.endT -= dt; if (e.endT <= 0) e.atkEnd = true; }
      }
    },
    ev: {
      anim_onSkillEffectiveStart(G, e, arg, st) {
        if (st === 'skill_laser_start' && e.cur === 'laser') {
          const lz = e.lz = { t: 0, a: aimAt(G, e.x + 28, e.y - 30) };
          K.beam(G, e, 'bullet_e_8', { dmg: 10, width: 9, thick: 2, alive: () => !lz.ended && !e.deathDone && !e.xf,
            origin: () => point(e, 'actor/laser_point'),
            ang(dt) { const [x, y] = point(e, 'actor/laser_point'), w = aimAt(G, x, y), d = Math.atan2(Math.sin(w - lz.a), Math.cos(w - lz.a)); lz.a += SK.clamp(d, -25 * DEG * dt, 25 * DEG * dt); return lz.a; } });
          G.shake = Math.max(G.shake, 3);
        } else if (st === 'skill_cannon' && e.cur === 'runestone') {
          const p = G.player, n = 3;
          for (let k = 0; k < n; k++) { const [tx, ty] = clampRoom(e, p.x + (k ? SK.randf(-80, 80) : 0), p.y + (k ? SK.randf(-50, 50) : 0)); crossStone(G, e, tx, ty); }
        }
      },
      anim_onSkillEnd(G, e, arg, st) { if (e.cur === 'runestone' && st === 'skill_cannon') e.atkEnd = true; }
    },
    dead(G, e) { killProps(e); e.invuln = false; e.tl = []; e.R.anims[0].layers[2].st = null; }
  };
  const hurt0 = SK.hurtEnemy;
  SK.hurtEnemy = function (G, e, dmg, ...rest) {
    if (e && e.bossKey === 'boss_dongzhuo' && e.invuln) { e.flash = 0.04; return false; }
    return hurt0.call(this, G, e, dmg, ...rest);
  };
  SK.bossRegister('boss_dongzhuo', def);
  void ANY; void hurtIn;
})();
