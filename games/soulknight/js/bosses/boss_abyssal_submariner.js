// Thợ Lặn Vực Sâu (boss_abyssal_submariner, 4-5 Đáy Biển). Nhãn: [ĐO] dữ liệu bundle, [WIKI Abyssal Submariner], [ƯỚC LƯỢNG].
// Rig Spine 4.2.40 (Abyssal Submariner_SkeletonData) vẽ bằng spine-canvas (js/spine.js); dữ liệu prefab/đạn ở art/spine/boss_abyssal_submariner/data.js
// (tools/spine/export_boss.py). Máu: config Hp 2300 [ĐO] x 1,2 = 2760 khớp wiki.
// Hai pha: tàu ngầm; dưới 50% máu clip 阶段转换 (OnAngryStart/Smoke/End) hoá cá anglerfish tím [WIKI "when enraged"].
// BossCtrlAbyssalSubmariner là IL2CPP: đòn dựng từ tên clip + sự kiện clip + trường bullets [ĐO] (0 ngư lôi dmg 4, 1 mìn dmg 12, 2 đạn 3 dmg 3, 3 đạn 6 dmg 3):
//   鱼雷发射 ngư lôi dẫn (Bullet02), 机枪扫射 súng máy quét, 声纳脉冲 sonar khoá vị trí rồi 深海炸弹 thả mìn, 船员出逃 thả thủy thủ,
//   血盆大口1-3 há miệng lao (pha 2), 触手扫击 quét xúc tu (pha 2). Số thời gian/sát thương không có trong dữ liệu là [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK.spine || !SK.BOSS_KIT) return;
  SK.submarine = {};
  const K = SK.BOSS_KIT;
  const { TAU, DEG, U, B86, fire, hurtIn, aimAt, clampRoom, sfx, spawnMinion } = K;
  const ent = B86.bosses.boss_abyssal_submariner;
  if (!ent) return;
  const VER = '20261010zl';
  const SCALE = 0.7;                 // phòng trùm web chỉ 21 ô: thu nhỏ tàu cho lọt [ƯỚC LƯỢNG]
  const PX = 0.01 * 6 * U * SCALE;           // đơn vị Spine -> px: scale SkeletonData 0.01 x SpineRoot 6 x PPU
  const BL = ent.mbs.BossCtrlAbyssalSubmariner.bullets;   // [ngư lôi, mìn, đạn 3, đạn 6, nổ chết]
  const HALF = 55;                   // nửa thân tàu theo hình (~156 px)
  const LIFT = 6;
  const A1 = { idle: '一阶段待机', move: '一阶段移动' }, A2 = { idle: '二阶段待机', move: '二阶段移动' };
  const P1 = ['torpedo', 'gun', 'sonar', 'crew'], P2 = ['torpedo', 'gun2', 'maw', 'sweep', 'sonar'];
  const ALL = ['torpedo', 'gun', 'gun2', 'sonar', 'crew', 'maw', 'sweep'];
  let RIG = null, CUR = null;
  const shuffle = a => a;

  function ensure(G, e) {
    if (e.init) return;
    e.init = true; CUR = e; e.sp = null; e.p2 = false; e.xf = null; e.sa = null; e.noFace = true;
    e.hb = { size: [84, 40], off: [0, 17] }; e.r = 40;
    e.cx = e.x; e.cy = e.y; e.dir = G.player.x >= e.x ? 1 : -1; e.tx = e.x; e.txT = 0;
    e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o, dt) { pump(G2, e, dt); return true; } });
  }
  function pump(G, e, dt) {
    if (!e.sp && RIG) { e.sp = RIG.make(PX); e.sp.play(e.deathDone ? '死亡' : A1.idle, !e.deathDone); }
    if (!e.sp) return;
    e.sp.update(dt);
    for (const ev of e.sp.drainEvents()) {
      if (e.sa && e.sa.onEv) e.sa.onEv(G, e, ev[0]);
      if (ev[0] === 'OnAngryEnd' && e.xf) endTransform(G, e);
    }
    if (e.xf) e.xf.t += dt;
  }
  const rx = e => e.cx, ry = e => e.cy - LIFT;
  const bone = (e, n) => e.sp.bone(n, rx(e), ry(e), e.dir < 0) || [e.cx, e.cy - 30];
  const hOf = (e, y) => Math.max(0, e.cy - y);
  const done = e => { e.sa = null; e.atkEnd = true; e.sp.clearTrack(1); };
  const idleOf = e => (e.p2 ? A2 : A1).idle;
  const over = (e, name) => e.sp.playOn(1, name, false);

  // ---------------------------------------------------------------- đồ nghề sàn đấu
  function lockIcon(G, e, x, y, life) {
    e.arena.objs.push({ t: 0, dur: life,
      update(G2, o) { return o.t < life && !e.deathDone; },
      ground(ctx, G2, o) {
        const k = o.t / life, r = 16 + 10 * (1 - k);
        ctx.save(); ctx.strokeStyle = 'rgba(255,60,60,' + (0.5 + 0.4 * Math.sin(o.t * 14)) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x - r - 4, y); ctx.lineTo(x + r + 4, y); ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y + r + 4); ctx.stroke(); ctx.restore();
      } });
  }
  // Mìn biển: bay vòng cung từ tàu tới điểm khoá, nổ sau boom_time 2 s [ĐO DelayExplode.boom_time 2; sát thương 12 theo bullets[1]]
  function mine(G, e, x0, y0, x1, y1) {
    const fly = 0.7, boom = 2.0;
    e.arena.objs.push({ t: 0, dur: fly + boom + 1,
      update(G2, o) {
        if (e.deathDone) return false;
        if (!o.ex && o.t >= fly + boom) { o.ex = true; K.blast(G2, x1, y1, 30, BL[1].damage, 'explode_hit_player'); sfx(G2, 'AudioClip:fx_naval_mine_launch'); return false; }
        return true;
      },
      ground(ctx, G2, o) {
        if (o.t >= fly) {
          const k = (o.t - fly) / boom;
          ctx.save(); ctx.fillStyle = 'rgba(230,40,40,' + (0.12 + 0.2 * k) + ')'; ctx.strokeStyle = 'rgba(230,40,40,0.6)';
          ctx.beginPath(); ctx.arc(x1, y1, 30, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
        }
      },
      air(ctx, G2, o) {
        const k = Math.min(1, o.t / fly), x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - 40 * Math.sin(Math.PI * k);
        const fn = K.frameOf('b_naval_mine'), f = fn && window.SK_ATLAS.f[fn];
        if (f && SK.pages[f[0]]) ctx.drawImage(SK.pages[f[0]], f[1], f[2], f[3], f[4], Math.round(x - f[5]), Math.round(y - f[6]), f[3], f[4]);
      } });
  }
  function sonarRing(G, e, x, y) {
    e.arena.objs.push({ t: 0, dur: 1.2,
      update(G2, o) {
        if (!o.hit && o.t >= 0.5) {   // BuffZone r 4 đơn vị [ĐO], buff_curse: ở trong vòng thì ăn 1 sát thương [ƯỚC LƯỢNG]
          o.hit = true; hurtIn(G2, x, y, 4 * U * 0.55, 1);
        }
        return o.t < 1.2 && !e.deathDone;
      },
      ground(ctx, G2, o) {
        const k = o.t / 1.2;
        ctx.save(); ctx.strokeStyle = 'rgba(255,80,110,' + (0.8 * (1 - k)) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, 4 * U * 0.55 * k + 6, (4 * U * 0.55 * k + 6) * 0.6, 0, 0, TAU); ctx.stroke(); ctx.restore();
      } });
  }

  // ---------------------------------------------------------------- các đòn
  const ATK = {
    // Ngư lôi: 3 quả dẫn tốc 16 sát thương 4 [ĐO bullets[0], Bullet02 góc xoay 20], mỗi 0,45 s
    torpedo: {
      begin(G, e, sa) { sa.cnt = 0; sa.nx = 0; },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (sa.cnt < 3 && sa.t >= sa.nx) {
          sa.nx = sa.t + 0.45; sa.cnt++; over(e, '鱼雷发射'); sfx(G, 'AudioClip:fx_boss_abyssalSubmariner_torpedo_launch');
          sa.shoot = sa.t + 0.5 / 3;
        }
        if (sa.shoot != null && sa.t >= sa.shoot) {
          sa.shoot = null;
          const [x, y] = bone(e, 'TorpedoLaunchPoint'), a = aimAt(G, x, y) + SK.randf(-0.25, 0.25);
          fire(G, e, 'bullet_e_torpedo', x, y, a, { spd: BL[0].speed, dmg: BL[0].damage, life: 5, h: hOf(e, y) });
        }
        if (sa.cnt >= 3 && sa.t >= sa.nx + 0.4) done(e);
      }
    },
    // Súng máy: clip 机枪扫射 lặp 0,47 s, mỗi 0,067 s một viên (8 sự kiện/vòng) quét ±35 độ trong 1,9 s; viên rải 360 độ [ĐO RGSBullet01 child_rate 1 child dmg 3]
    gun: {
      begin(G, e, sa) { e.sp.playOn(1, '机枪扫射', true); sa.nx = 0; sfx(G, 'AudioClip:fx_gun_3'); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (sa.t >= sa.nx && sa.t < 1.9) {
          sa.nx += 0.2;
          const [x, y] = bone(e, 'MachineGunFirePoint'), a = aimAt(G, x, y) + Math.sin(sa.t * 3) * 0.6;
          fire(G, e, 'bullet_boss_abyssal_submariner_3', x, y, a, { spd: 8, dmg: BL[2].damage, life: 3, h: hOf(e, y) });
        }
        if (sa.t >= 2.1) done(e);
      }
    },
    // Pha 2: súng máy bắn đạn 6 (rải 90 độ mỗi 1,5 s) bằng 8 miệng pháo
    gun2: {
      begin(G, e, sa) { e.sp.playOn(1, '机枪扫射', true); sa.nx = 0; sa.k = 0; sfx(G, 'AudioClip:fx_gun_3'); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (sa.t >= sa.nx && sa.t < 1.6) {
          sa.nx += 0.4; sa.k++;
          const [x, y] = bone(e, 'MachineGunFirePoint'), a0 = aimAt(G, x, y);
          for (const d of [-0.5, 0, 0.5]) fire(G, e, 'bullet_boss_abyssal_submariner_6', x, y, a0 + d, { spd: 7, dmg: BL[3].damage, life: 3, h: hOf(e, y) });
        }
        if (sa.t >= 2.1) done(e);
      }
    },
    // Sonar: vòng xung ở đèn radar (0,967 s), khoá vị trí người chơi; 深海炸弹 thả mìn (0,733 s) xuống điểm khoá [ĐO clip; bullets[1] mìn dmg 12]
    sonar: {
      begin(G, e, sa) { over(e, '声纳脉冲'); sa.stage = 0; sfx(G, 'AudioClip:fx_alarm'); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (sa.stage === 0 && sa.t >= 0.97) {
          sa.stage = 1; const [x, y] = bone(e, 'SonarActivationPoint'); sonarRing(G, e, x, y + 20);
          sa.lx = G.player.x; sa.ly = G.player.y; lockIcon(G, e, sa.lx, sa.ly, 1.3);
          sfx(G, 'AudioClip:fx_sonar');
        } else if (sa.stage === 1 && sa.t >= 2.0) { sa.stage = 2; sa.t = 0; over(e, '深海炸弹'); }
        else if (sa.stage === 2 && sa.t >= 0.73) {
          sa.stage = 3; const [x, y] = bone(e, 'SweepPoint');
          mine(G, e, x, y, sa.lx, sa.ly);
          if (!e.p2) { const q = G.player; mine(G, e, x, y, SK.clamp(q.x + SK.randf(-50, 50), e.room.x0 * SK.TILE + 20, (e.room.x1 + 1) * SK.TILE - 20), q.y + SK.randf(-30, 30)); }
        } else if (sa.stage === 3 && sa.t >= 2.0) done(e);
      }
    },
    // Thả thủy thủ: 船员出逃 4 s, tại 2,0 s (OnEffectiveStart) hai thủy thủ mob0/mob1 chui ra từ SummonEnemiesPoint [ĐO summonEnemiesPrefabList]
    crew: {
      begin(G, e, sa) { over(e, '船员出逃'); sa.did = false; sfx(G, 'AudioClip:fx_boss_abyssalSubmariner_summon'); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (!sa.did && sa.t >= 2.0) {
          sa.did = true; const [x, y] = bone(e, 'SummonEnemiesPoint');
          const live = G.enemies.filter(m => m.bossMinion === e && m.st !== 'dead').length;
          for (let i = 0; i < 2 && live + i < 4; i++) spawnMinion(G, e, i ? 'e_seabed_mob1' : 'e_seabed_mob0', x + (i ? 24 : -24), y + 28);
        }
        if (sa.t >= 4.0) done(e);
      }
    },
    // Há miệng lao (pha 2): 血盆大口1 1,0 s há miệng + vạch báo, 2 lao dọc làn khoá, 3 khép miệng 0,67 s [ĐO clip; dash_hit_trigger; tốc độ lao ƯỚC LƯỢNG 14 đơn vị/s]
    maw: {
      begin(G, e, sa) { over(e, '血盆大口1'); e.sp.state.addAnimation(1, '血盆大口2', true, 0); sa.stage = 0; sa.hit = false; sa.line = true; e.dir = G.player.x >= e.cx ? 1 : -1;
        { const r = e.room, T = SK.TILE, gap = e.dir > 0 ? (r.x1 + 1) * T - HALF - e.cx : e.cx - r.x0 * T - HALF; if (gap < 90) e.dir = -e.dir; }   // đã sát tường thì lao về phía xa sfx(G, 'AudioClip:fx_boss_abyssalSubmariner_dash_howl');
        e.arena.objs.push({ t: 0, dur: 1e9, update() { return sa.line && !e.deathDone; },
          ground(ctx) { const r = e.room, T = SK.TILE, x1 = e.dir > 0 ? (r.x1 + 1) * T : r.x0 * T, k = Math.min(1, sa.t); ctx.save(); ctx.fillStyle = 'rgba(230,50,50,' + (0.12 + 0.2 * k) + ')'; ctx.fillRect(Math.min(e.cx, x1), e.cy - 24, Math.abs(x1 - e.cx), 40); ctx.restore(); } }); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        const r = e.room, T = SK.TILE;
        if (sa.stage === 0) {
          if (sa.t < 0.8) e.cy += SK.clamp(G.player.y - e.cy, -1, 1) * Math.min(Math.abs(G.player.y - e.cy), 90 * dt);
          if (sa.t >= 1.0) { sa.stage = 1; sa.t = 0; sa.line = false; sfx(G, 'AudioClip:fx_boss_abyssalSubmariner_dash'); G.shake = Math.max(G.shake, 3); }
        } else if (sa.stage === 1) {
          e.cx += e.dir * 14 * U * dt;
          const hx = e.cx + e.dir * HALF * 0.8, p = G.player;
          if (!sa.hit && p.st !== 'dead' && Math.abs(p.x - hx) < 30 && Math.abs((p.y - 7) - (e.cy - 20)) < 30) { sa.hit = true; SK.hurtPlayer(G, K.dmgOf(4)); p.x += e.dir * 20; }
          const lo = r.x0 * T + HALF + 4, hi = (r.x1 + 1) * T - HALF - 4;
          if (e.cx <= lo || e.cx >= hi || sa.t > 3) { e.cx = SK.clamp(e.cx, lo, hi); sa.stage = 2; sa.t = 0; over(e, '血盆大口3'); }
        } else if (sa.t >= 0.7) done(e);
      }
    },
    // Quét xúc tu: 触手扫击 2 s, vùng quét hình quạt trước mặt tại 0,833-1,033 s (OnEffectiveStart/End) [ĐO]; bán kính/sát thương ƯỚC LƯỢNG
    sweep: {
      begin(G, e, sa) { over(e, '触手扫击'); e.dir = G.player.x >= e.cx ? 1 : -1; sa.hit = false; sfx(G, 'AudioClip:fx_boss1_atk3'); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (!sa.hit && sa.t >= 0.83 && sa.t <= 1.05) {
          const p = G.player, dx = (p.x - e.cx) * e.dir, dy = (p.y - 7) - (e.cy - 24);
          if (p.st !== 'dead' && dx > -20 && dx < 70 && Math.abs(dy) < 40) { sa.hit = true; SK.hurtPlayer(G, K.dmgOf(4)); G.shake = Math.max(G.shake, 4); }
        }
        if (sa.t >= 2.0) done(e);
      }
    }
  };

  // ---------------------------------------------------------------- đổi pha
  function startTransform(G, e) {
    e.xf = { t: 0 }; e.sp.clearTrack(1); e.sp.play('阶段转换', false);
    for (const b of G.bullets) if (b.side === 'e') b.dead = true;
    sfx(G, 'AudioClip:fx_boss_abyssalSubmariner_angry'); G.shake = Math.max(G.shake, 4);
  }
  function endTransform(G, e) { e.sp.play(A2.idle, true); e.xf = null; e.p2 = true; e.cd = 1.0; e.enraged = true; }

  function cruise(G, e, dt) {
    const r = e.room, T = SK.TILE, p = G.player;
    const lo = r.x0 * T + HALF + 8, hi = (r.x1 + 1) * T - HALF - 8;
    e.txT -= dt;
    if (e.txT <= 0) { e.tx = SK.randf(lo, hi); e.txT = SK.randf(2.5, 5); }
    const tx = SK.clamp(e.tx, lo, hi), dx = tx - e.cx, sp = e.speed * U * 0.5;
    e.cx += SK.clamp(dx, -1, 1) * Math.min(Math.abs(dx), sp * dt);
    const ty = SK.clamp(p.y - 20, (r.y0 + 4) * T, (r.y1 + 0.5) * T), dy = ty - e.cy;
    e.cy += SK.clamp(dy, -1, 1) * Math.min(Math.abs(dy), sp * 0.6 * dt);
    if (Math.abs(p.x - e.cx) > 24) e.dir = p.x > e.cx ? 1 : -1;
    const want = Math.abs(dx) > 4 ? (e.p2 ? A2 : A1).move : idleOf(e);
    if (e.sp.cur !== want && !e.sa) e.sp.play(want, true);
  }

  const def = {
    atks: ALL, hand: 'effect', noFace: true, firstCd: 1.5, enrageCd: 0.8,
    get idle() { return A1.idle; },
    state: Object.fromEntries(ALL.map(n => [n, A1.idle])),
    pick(G, e) { ensure(G, e); return e.p2 ? P2 : P1; },
    start: Object.fromEntries(ALL.map(n => [n, (G, e) => { ensure(G, e); const sa = e.sa = { n, t: 0 }; ATK[n].begin(G, e, sa); }])),
    canAttack(e) { return !!e.sp && !e.xf; },
    skipNode: () => true,
    tick(G, e, dt) {
      ensure(G, e);
      if (!e.sp) return;
      if (e.xf) { e.x = e.cx; e.y = e.cy; return; }
      if (e.sa) ATK[e.sa.n].tick(G, e, dt, e.sa);
      else {
        cruise(G, e, dt);
        if (!e.p2 && e.hp <= e.hpMax * 0.5 && !e.atk) { startTransform(G, e); }
      }
      e.x = e.cx; e.y = e.cy;
    },
    drawUnder(ctx, G, e) {
      if (!e.sp) {
        const fr = SK_ATLAS.f.boss_abyssal_submariner_img;
        if (fr && SK.pages[fr[0]]) ctx.drawImage(SK.pages[fr[0]], fr[1], fr[2], fr[3], fr[4], Math.round(e.x - fr[3] / 2), Math.round(e.y - fr[4] + 4), fr[3], fr[4]);
        return;
      }
      e.sp.draw(ctx, rx(e), ry(e), { flip: e.dir < 0, flash: e.flash > 0 });
    },
    dead(G, e) {
      ensure(G, e);
      e.sa = null; e.xf = null;
      if (!e.sp) return;
      e.sp.clearTrack(1); e.sp.play('死亡', false);
      e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o, dt) { if (!e.sp && RIG) { e.sp = RIG.make(PX); e.sp.play('死亡', false); } if (e.sp) e.sp.update(dt); return o.t < 8; } });
    }
  };

  SK.submarine.load = () => {
    if (SK.submarine.p) return SK.submarine.p;
    return (SK.submarine.p = SK.spine.load('boss_abyssal_submariner', VER).then(rig => { RIG = rig; SK.submarine.rig = rig; SK.submarine.ready = true; return rig; })
      .catch(err => { SK.submarine.error = String(err && err.message || err); if (SK.warnOnce) SK.warnOnce('submarine', 'boss_abyssal_submariner (Spine) disabled: ' + SK.submarine.error); return null; }));
  };
  SK.bossRegister('boss_abyssal_submariner', def);
  const make = SK.CUSTOM_ENEMIES.boss_abyssal_submariner;
  SK.CUSTOM_ENEMIES.boss_abyssal_submariner = (G, x, y, room) => { const e = make(G, x, y, room); ensure(G, e); SK.submarine.load(); return e; };
})();
