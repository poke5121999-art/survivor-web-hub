// Tước Sĩ Lục (boss_fel_lord, Sir Verdant): trùm tuỳ chọn của Mê Trận Tà Vương. Nhãn: [ĐO] dữ liệu bundle/prefab, [WIKI Sir Verdant + /Tactics], [ƯỚC LƯỢNG].
// Rig sprite (45 SpriteRenderer + Animator), KHÔNG phải Spine: vẽ bằng SK.drawPrefab-kiểu từng nút của prefab gốc boss_fel_lord (tools/extra/fellord.json),
// chạy các clip fel_lord/* [ĐO]. AI gốc nằm ở BossFelLord + FelLordBrain (PlayMakerFSM Sleep/Idle/Move/Skill/Dizzy/Dead, IL2CPP): đòn dựng từ
// clip Animator + trường MonoBehaviour + prefab đạn + wiki. Trùm này không thuộc khung js/bosses.js (không có trong sk-bosses86.js) nên có sàn đấu riêng.
//   [ĐO] FelLordBrain: surroundingFireBallSpeed 140 độ/s, Angry 160; felBoltConfig sát thương 3; BossFelLord.shoot_cd 3 s, RoleAttribute.speed 5, miễn choáng.
//   [ĐO] bullet_fel_bolt: Bullet01 tốc 10, BulletMoverFollowAttachment (trễ 1,5 s, 18 độ mỗi 0,1 s, 6 lần), nổ ra fel_lord_FireGas (BulletGas bán kính 3,
//        1 sát thương mỗi 0,5 s, 6 s) và SpawnChildEffectTrigger 1 quả bullet_green_fireball tốc 6, sát thương = 60% của đạn mẹ, tự ngắm.
//   [ĐO] bullet_soul_bolt: tốc 10, BulletMoverFollowAttachment (trễ 1,8 s, 12 độ, 5 lần), không sát thương; nổ soul_bolt_explode bán kính 1,5 + buff_inversdir (đảo hướng đi);
//        bản with_crystal rơi furious_crystal (AutoPickPowerup buffTypeID 14).
//   [ĐO] bullet_summon_fel_lord_clone1/2: quả ném nhảy (IronTideBulletJump) sinh fel_lord_clone1 (có thanh máu = bản thật) / fel_lord_clone2 (thanh máu tắt = bản giả).
//   [WIKI] 5 đòn: 7 nón lục dí, 7 nón đỏ dí (đảo hướng / pha lê đỏ), quả cầu lửa vỡ 9 đá + bãi lửa, 6 khối lập phương (1 thật ~500 máu), hoá Cua Móng Ngựa (~1000 máu);
//          kiệt sức 20 s sau khối, 10 s sau cua; nổi giận: 3 quả cầu lửa xoay quanh. Số không có nguồn ghi [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT, W = SK.world, U = SK.PPU, T = SK.TILE;
  if (!K || !SK.prefab || !SK.prefab('boss_fel_lord')) return;
  const PF = SK.prefab('boss_fel_lord');
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const dmgOf = K.dmgOf;
  const ID = 'boss_fel_lord';

  const C = SK.felLord = {
    hp: 3600,                      // [WIKI Sir Verdant: bản Tinh Anh 3600, Thường lẫn Lợi Hại] một mức cho mọi độ khó
    cubeHp: 500, crabHp: 1000,     // [WIKI Tactics: khối thật ~500, cua ~1000]; nhân theo hệ số máu của trùm (Uy Áp)
    shootCd: 3, shootCdAngry: 2.4, // [ĐO BossFelLord.shoot_cd 3]; nổi giận [ƯỚC LƯỢNG]
    enrageAt: 0.5,                 // [ƯỚC LƯỢNG] nửa máu như các trùm khác
    weakCube: 20, weakCrab: 10,    // [WIKI] kiệt sức
    speed: 5 * U * 0.3,            // [ĐO RoleAttribute.speed 5] đi dạo bằng 30% như trùm khác [ƯỚC LƯỢNG]
    boltSpd: 10, boltDmg: 4,       // [ĐO tốc 10; WIKI 4 sát thương]
    boltHome: { delay: 1.5, int: 0.1, turn: 18, n: 6 },   // [ĐO]
    soulHome: { delay: 1.8, int: 0.1, turn: 12, n: 5 },   // [ĐO]
    bolts: 7, spread: 14,          // [WIKI 7 viên] góc cách nhau [ƯỚC LƯỢNG]
    childDmgK: 0.6, childSpd: 6,   // [ĐO damageFactorOfParent, bulletSpeed]
    poolR: 3 * 0.75 * U, poolDur: 6, poolTick: 0.5, poolDmg: 3, poolMax: 10,   // [ĐO BulletGas bán kính 3 × sizeFactor 0.75; WIKI 3 mỗi nhịp]
    rocks: 9, rockDmg: 3, rockSpd: 7,   // [WIKI 9 đá, 3 sát thương]
    confuseT: 4,                   // buff_inversdir không rõ thời gian [ƯỚC LƯỢNG]
    furiousT: 15, furiousMul: 1.3, crystalLife: 12, crystalMax: 3,   // [WIKI 15 s] ×1,3 tốc đánh và tốc chạy [ƯỚC LƯỢNG]
    cubes: 6, cubeSpd: 3.5 * U,    // [WIKI 6 khối] tốc [ƯỚC LƯỢNG]
    orbSpd: 140, orbSpdAngry: 160, orbR: 28, orbHit: 7, orbDmg: 3, orbTick: 0.5,   // [ĐO 140/160 độ/s, CircleDamageCarrier 0,5 s]; bán kính [ƯỚC LƯỢNG]
    ringR: 46,
    crabSpd: 22, crabCd: 1.6, crabBoltSpd: 8, crabBoltDmg: 3,   // [ƯỚC LƯỢNG]
    ATK: ['green', 'red', 'fireball', 'clone', 'crab']
  };

  const GLOW = { texiao_01: 1, UISprite: 1, light_01: 1, texture_c4: 1, green_dot_light_soft: 1 };
  const IDLE = [6, 7, 4, 5, 2, 3, 0, 1];   // thứ tự khung trong SpriteAnimation của /img/body [ĐO], 8 khung/s
  const parts = PF.slice().sort((a, b) => ((a.o || 0) - (b.o || 0)));
  const SHADOW = SK.prefab('boss_fel_lord').find(p => p.n === '/shadow');
  const hurtFlat = (G, dmg, x, y) => { const m = G.matrix; G.matrix = null; try { return SK.hurtPlayer(G, dmg, x, y); } finally { G.matrix = m; } };   // bãi lửa không tăng theo Uy Áp [WIKI]
  const clamp = SK.clamp;
  // quả cầu lửa lục: efx_circle (10 px) tô xanh hai lớp [ĐO sprite; cỡ hạt trong ParticleSystem chưa đọc được: ƯỚC LƯỢNG]
  function ball(ctx, x, y, s, a) {
    a = a == null ? 1 : a;
    SK.drawTinted(ctx, 'efx_circle', x, y, [0.2, 0.85, 0.15, 0.75 * a], { sx: 1.7 * s, sy: 1.7 * s });
    SK.drawTinted(ctx, 'efx_circle', x, y, [0.75, 1, 0.55, 0.95 * a], { sx: 0.95 * s, sy: 0.95 * s });
  }

  // ---------------------------------------------------------------- trạng thái người chơi: đảo hướng, pha lê đỏ
  const I = SK.input;
  if (I && I.moveVec && !I._felWrap) {
    const mv0 = I.moveVec; I._felWrap = true;
    I.moveVec = function () {
      const v = mv0.call(this), g = SK.G;
      return g && g.felConf > 0 && (v.x || v.y) ? { x: -v.x, y: -v.y } : v;
    };
  }
  function ticker(G) {
    if (G._felTick && G.props.indexOf(G._felTick) >= 0) return;
    G._felTick = {
      x: 0, y: 1e9,
      update(G2, pr, dt) {
        if (G2.felConf > 0) G2.felConf = Math.max(0, G2.felConf - dt);
        const b = G2.felBuff;
        if (b) { b.t -= dt; if (b.t <= 0) clearBuff(G2); }
      },
      draw(ctx, G2) {
        const p = G2.player;
        if (G2.felConf > 0 && p && p.st !== 'dead') SK.text(ctx, '?', p.x + Math.sin(G2.t * 9) * 3, p.y - 34, 11, '#e0a8ff', 'center', 'rgba(0,0,0,0.9)');
        if (G2.felBuff && p && p.st !== 'dead') { ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(G2.t * 8); SK.drawTinted(ctx, 'efx_circle', p.x, p.y - 4, [1, 0.25, 0.25, 0.5], { sx: 3, sy: 1.4 }); ctx.restore(); }
      }
    };
    G.props.push(G._felTick);
  }
  function confuse(G, t) { ticker(G); G.felConf = Math.max(G.felConf || 0, t); SK.num(G, G.player.x, G.player.y - 26, 'Choáng hướng', '#d9a0ff', false); }
  function clearBuff(G) {
    const b = G.felBuff, p = G.player;
    if (b && p) { p.rateMul = (p.rateMul || 1) / b.k; p.moveMul = (p.moveMul == null ? 1 : p.moveMul) / b.k; }
    G.felBuff = null;
  }
  function furious(G) {
    ticker(G);
    if (G.felBuff) { G.felBuff.t = C.furiousT; return; }
    const p = G.player, k = C.furiousMul;
    p.rateMul = (p.rateMul || 1) * k; p.moveMul = (p.moveMul == null ? 1 : p.moveMul) * k;
    G.felBuff = { t: C.furiousT, k };
    SK.num(G, p.x, p.y - 26, 'Cuồng nộ!', '#ff6a5a', false);
  }
  SK.on('stageEnter', G => { if (G.felBuff) clearBuff(G); G.felConf = 0; G._felTick = null; });
  SK.on('runStart', G => { G.felBuff = null; G.felConf = 0; G._felTick = null; });

  // ---------------------------------------------------------------- sàn đấu: vật theo thời gian + đạn
  function arenaNew(G, e) {
    const A = { e, objs: [], pr: [], done: false };
    const layer = (ctx, l) => { for (const o of A.objs) if (o[l]) o[l](ctx, G, o); };
    G.props.push({ x: e.x, y: -1e9, draw: ctx => { layer(ctx, 'ground'); drawProj(ctx, A, false); }, update: (G2, pr, dt) => { stepArena(G2, A, dt); pr.gone = A.done; } });
    G.props.push({ x: e.x, y: 1e9, draw: ctx => { layer(ctx, 'air'); drawProj(ctx, A, true); }, update: (G2, pr) => { pr.gone = A.done; } });
    return A;
  }
  function stepArena(G, A, dt) {
    const e = A.e, cur = A.objs;
    A.objs = [];
    const keep = cur.filter(o => { o.t = (o.t || 0) + dt; return o.update ? o.update(G, o, dt) !== false : o.t < o.dur; });
    A.objs = keep.concat(A.objs);
    stepProj(G, A, dt);
    if (e.st === 'dead' && e.stT > 3 && !A.objs.length && !A.pr.length) A.done = true;
  }

  // Đạn riêng: toạ độ chạm đất (x, y); hình vẽ nâng lên h. o: {x, y, ang, spd, dmg, r, life, sprite, sc, home, confuse, onEnd(G, b, why)}
  function shoot(G, e, o) {
    const b = Object.assign({ age: 0, r: 4, life: 5, sc: 1, dmg: 0, h0: 26, h: 8, cnt: 0 }, o);
    b.vx = Math.cos(o.ang) * o.spd * U; b.vy = Math.sin(o.ang) * o.spd * U;
    b.nx = b.home ? b.home.delay + b.home.int : 0;
    e.arena.pr.push(b);
    e.stats.shots++;
    return b;
  }
  function stepProj(G, A, dt) {
    const p = G.player, map = G.map, list = A.pr, keep = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.dead) continue;
      b.age += dt;
      if (b.home) while (b.age >= b.nx && b.cnt < b.home.n) {
        b.nx += b.home.int; b.cnt++;
        let d = Math.atan2(p.y - b.y, p.x - b.x) - b.ang;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        b.ang += clamp(d, -b.home.turn * DEG, b.home.turn * DEG);
        const sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(b.ang) * sp; b.vy = Math.sin(b.ang) * sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      let why = null;
      if (W.solidAt(map, b.x, b.y)) why = 'wall';
      else if (p.st !== 'dead' && Math.hypot(p.x - b.x, p.y - b.y) < b.r + 4) why = 'hit';
      else if (b.age >= b.life) why = 'timeout';
      if (why) {
        b.dead = true;
        if (why === 'hit') {
          if (b.dmg > 0 && SK.hurtPlayer(G, dmgOf(b.dmg), b.x, b.y) !== false) A.e.stats.hurt += dmgOf(b.dmg);
          if (b.confuse) confuse(G, b.confuse);
        }
        if (b.onEnd) b.onEnd(G, b, why);
        continue;
      }
      keep.push(b);
    }
    A.pr = keep;
  }
  function drawProj(ctx, A, air) {
    if (!air) return;
    for (const b of A.pr) {
      const h = b.h + (b.h0 - b.h) * Math.max(0, 1 - b.age / 0.3);
      SK.draw(ctx, b.sprite, b.x, b.y - h, { rot: Math.atan2(b.vy, b.vx), sx: b.sc, sy: b.sc });
    }
  }

  // Bãi lửa lục (fel_lord_FireGas): 6 s, mỗi 0,5 s trừ 3 [ĐO/WIKI]; số bãi cùng lúc có trần để màn không kín
  function pool(G, e, x, y) {
    const A = e.arena, mine = A.objs.filter(o => o.isPool);
    for (const o of mine) if (Math.hypot(o.x - x, o.y - y) < 10) { o.t = 0; return o; }
    if (mine.length >= C.poolMax) mine[0].dead = true;
    const o = {
      isPool: true, t: 0, x, y, dur: C.poolDur, tickT: 0.35, ph: SK.rand() * 6,
      update(G2, ob, dt) {
        if (ob.dead || e.st === 'dead') return false;
        ob.tickT -= dt;
        const p = G2.player;
        if (ob.tickT <= 0 && ob.t > 0.25 && p.st !== 'dead' && Math.hypot(p.x - x, (p.y - 2) - y) < C.poolR) {
          ob.tickT = C.poolTick;
          if (hurtFlat(G2, dmgOf(C.poolDmg), x, y) !== false) e.stats.hurt += dmgOf(C.poolDmg);
        } else if (ob.tickT <= 0) ob.tickT = 0.1;
        return ob.t < ob.dur;
      },
      ground(ctx, G2, ob) {
        const k = clamp(ob.t / 0.3, 0, 1) * clamp((ob.dur - ob.t) / 0.5, 0, 1), r = C.poolR * (0.85 + 0.05 * Math.sin(G2.t * 6 + ob.ph));
        ctx.save();
        const g = ctx.createRadialGradient(x, y, 2, x, y, r);
        g.addColorStop(0, 'rgba(120,255,60,' + 0.55 * k + ')'); g.addColorStop(0.7, 'rgba(40,200,40,' + 0.35 * k + ')'); g.addColorStop(1, 'rgba(20,120,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8 * k;
        for (let i = 0; i < 5; i++) {
          const a = ob.ph + i * 1.3 + G2.t * 1.5, d = r * 0.5 * Math.abs(Math.sin(a * 0.7 + i));
          SK.drawTinted(ctx, 'efx_circle', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - 3, [0.3, 1, 0.25, 0.7], { sx: 0.9 + 0.25 * Math.sin(G2.t * 9 + i), sy: 1.1 });
        }
        ctx.restore();
      }
    };
    A.objs.push(o);
    return o;
  }

  function greenBolt(G, e, x, y, ang, o) {
    o = o || {};
    return shoot(G, e, {
      x, y, ang, spd: o.spd || C.boltSpd, dmg: o.dmg != null ? o.dmg : C.boltDmg, r: 4, life: 5, sprite: 'fel_bolt', sc: o.sc || 1, home: o.home === undefined ? C.boltHome : o.home, kind: 'fel',
      onEnd(G2, b, why) {
        pool(G2, e, b.x, b.y);   // nổ ra bãi lửa dù trúng người, tường hay hết giờ [ĐO ExplodeEffectTrigger]
        if (o.child !== false && b.dmg > 0) {
          const p = G2.player;   // tách một quả bullet_green_fireball nhỏ hơn, tự ngắm [ĐO SpawnChildEffectTrigger]
          shoot(G2, e, { x: b.x, y: b.y, ang: Math.atan2(p.y - b.y, p.x - b.x), spd: C.childSpd, dmg: b.dmg * C.childDmgK, r: 3.5, life: 4, sprite: 'fel_bolt', sc: 0.7, home: { delay: 0, int: 0.1, turn: 6, n: 10 }, kind: 'child' });
        }
      }
    });
  }
  function soulBolt(G, e, x, y, ang) {
    return shoot(G, e, {
      x, y, ang, spd: C.boltSpd, dmg: 0, r: 4, life: 5, sprite: 'soul_bolt', home: C.soulHome, confuse: C.confuseT, kind: 'soul',
      onEnd(G2, b, why) {
        // trúng người: nổ buff_inversdir (đã áp ở stepProj); trúng tường/hết giờ: rơi pha lê đỏ [WIKI]
        if (why !== 'hit') crystal(G2, e, b.x, b.y);
      }
    });
  }
  function crystal(G, e, x, y) {
    const A = e.arena, mine = A.objs.filter(o => o.isCrystal);
    if (mine.length >= C.crystalMax) mine[0].dead = true;
    [x, y] = K.clampRoom(e, x, y);
    A.objs.push({
      isCrystal: true, t: 0, x, y, dur: C.crystalLife,
      update(G2, o) {
        const p = G2.player;
        if (o.dead) return false;
        if (p.st !== 'dead' && Math.hypot(p.x - x, p.y - y) < 14) { furious(G2); e.stats.crystals++; return false; }
        return o.t < o.dur;
      },
      ground(ctx, G2, o) {
        const fade = o.dur - o.t < 2 ? 0.5 + 0.5 * Math.sin(o.t * 14) : 1;
        SK.draw(ctx, 'efx_circle', x, y, { sx: 2.4, sy: 1.1, alpha: 0.4 * fade });
        SK.draw(ctx, 'fel_lord_crystal_shard_red', x, y - 12 - 1.5 * Math.sin(G2.t * 4), { alpha: fade });
      }
    });
  }

  // ---------------------------------------------------------------- vị trí / hộp trúng đạn
  const fl = e => (e.face < 0 ? -1 : 1);
  const HB = { norm: { size: [44, 44], off: [0, 31.5] }, crab: { size: [36, 24], off: [0, 12] }, hide: { size: [0, 0], off: [0, -1e5] } };
  function setHb(e, k) { e.hbKind = k; e.hb = { size: HB[k].size.slice(), off: HB[k].off.slice() }; e.r = k === 'crab' ? 8 : 9; }
  function mode(e, m) { e.mode = m; e.mt = 0; e.invuln = m === 'cloneIn' || m === 'cubes' || m === 'crabIn' || m === 'crabOut' || m === 'cloneEnd' || m === 'dead'; }
  const handPos = e => [e.x + fl(e) * 26, e.y - 31];   // /img/body/hands/left/state1/bullet_prepare [ĐO]
  function wander(G, e, dt, spd) {
    if (!e.goal || e.goalT <= 0) { e.goal = K.roomPoint(G, e, 40, 150); e.goalT = SK.randf(1.2, 2.4); }
    e.goalT -= dt;
    const dx = e.goal[0] - e.x, dy = e.goal[1] - e.y, d = Math.hypot(dx, dy);
    if (d < 4) { e.goalT = 0; e.moving = false; return; }
    e.moving = true;
    SK.moveBox(G.map, e, dx / d * spd * dt, dy / d * spd * dt, e.r);
  }

  // ---------------------------------------------------------------- đòn
  // Mỗi đòn: begin(G, e) khi bắt đầu, tick(G, e, dt) trả true khi xong. Thời điểm bắn nằm ở clip L1.hand_emit (bullet_prepare phóng to 0,35 → 0,6 s) [ĐO].
  const emit = (e, col) => { e.layer = 'fel_lord/L1.hand_emit'; e.lt = 0; e.prep = col; };
  const ATKS = {
    green: {
      begin(G, e) { emit(e, 'green'); e.fired = false; },
      tick(G, e, dt) {
        if (!e.fired && e.mt >= 0.65) {
          e.fired = true;
          const [x, y] = handPos(e), a = Math.atan2(G.player.y - e.y, G.player.x - x);
          for (let i = 0; i < C.bolts; i++) greenBolt(G, e, x, e.y, a + (i - (C.bolts - 1) / 2) * C.spread * DEG);
        }
        return e.mt >= 1.1;
      }
    },
    red: {
      begin(G, e) { emit(e, 'red'); e.fired = false; },
      tick(G, e, dt) {
        if (!e.fired && e.mt >= 0.65) {
          e.fired = true;
          const [x] = handPos(e), a = Math.atan2(G.player.y - e.y, G.player.x - x);
          for (let i = 0; i < C.bolts; i++) soulBolt(G, e, x, e.y, a + (i - (C.bolts - 1) / 2) * C.spread * DEG);
        }
        return e.mt >= 1.1;
      }
    },
    fireball: {
      begin(G, e) { emit(e, 'fireball'); e.fired = false; },
      tick(G, e, dt) {
        if (!e.fired && e.mt >= 0.65) {
          e.fired = true;
          const [x] = handPos(e), p = G.player;
          let [tx, ty] = K.clampRoom(e, p.x, p.y);
          const x0 = x, dur = 0.9;
          e.arena.objs.push({
            t: 0, dur, update(G2, o, dt2) {
              if (e.st === 'dead') return false;
              if (o.t >= dur) {
                G2.shake = Math.max(G2.shake, 3);
                pool(G2, e, tx, ty);
                for (let i = 0; i < C.rocks; i++) shoot(G2, e, { x: tx, y: ty, ang: i * TAU / C.rocks + 0.2, spd: C.rockSpd, dmg: C.rockDmg, r: 3.5, life: 1.0, sprite: 'fel_bolt', sc: 0.8, home: null, kind: 'rock', h: 6, h0: 6 });
                return false;
              }
              return true;
            },
            air(ctx, G2, o) {
              const k = clamp(o.t / dur, 0, 1), px = x0 + (tx - x0) * k, py = e.y + (ty - e.y) * k, arc = Math.sin(k * Math.PI) * 46 + 26 * (1 - k) + 4;
              SK.draw(ctx, 'efx_circle', px, py, { sx: 1.6, sy: 0.7, alpha: 0.35 });   // bóng
              ball(ctx, px, py - arc, 1.4);
            }
          });
        }
        return e.mt >= 1.1;
      }
    }
  };

  // Khối lập phương: 6 khối nảy trong phòng, mỗi khối 2 quả cầu lửa xoay quanh; 1 thật (có máu), 5 giả (bị bắn thì phình to) [WIKI]
  function cubeNew(G, e, real, x, y, ang) {
    const hp = real ? Math.round(C.cubeHp * e.hpK) : 1e12;
    const c = {
      id: real ? 'fel_lord_clone1' : 'fel_lord_clone2', isFelClone: true, real, owner: e, noReward: true,
      hb: { size: [22, 22], off: [0, 17] }, d: { shadow: null, shadowOff: [0, 1e5], speed: 3 }, p: { kinematic: 1, reward_rate: 0, reward_value: [0, 0, 0, 0] },
      cls: 'SKFelClone', rawCls: 'SKFelClone', x, y, kx: 0, ky: 0, hp, hpMax: hp, face: 1, aim: 0, st: 'idle', stT: 0, t: SK.rand() * 2, cd: 9, room: e.room,
      elite: false, flash: 0, w: null, anims: { dead: true }, r: 6, scale: 1, burst: 0, draw: drawCube, boss: true,
      vx: Math.cos(ang) * C.cubeSpd, vy: Math.sin(ang) * C.cubeSpd, grow: 1, orb: SK.rand() * TAU, tick: [0, 0], spawnT: 0.5
    };
    return c;
  }
  SK.AI.SKFelClone = function (G, e, dt) {
    const o = e.owner;
    if (!o || o.st === 'dead' || o.mode !== 'cubes') { e.st = 'dead'; e.stT = 0; e.hp = 0; return; }
    e.spawnT = Math.max(0, e.spawnT - dt);
    const sp = e.spawnT > 0 ? 0.4 : 1;
    const map = G.map, nx = e.x + e.vx * dt * sp, ny = e.y + e.vy * dt * sp;
    if (W.solidAt(map, nx, ny) || W.solidAt(map, nx, ny - 6)) {
      const hx = W.solidAt(map, nx, e.y), hy = W.solidAt(map, e.x, ny);
      if (hx || !hy) e.vx = -e.vx;
      if (hy || !hx) e.vy = -e.vy;
      if (hx === hy) { e.vx = -e.vx; e.vy = -e.vy; }
    } else { e.x = nx; e.y = ny; }
    e.face = e.vx >= 0 ? 1 : -1;
    // quả cầu lửa quanh khối
    e.orb += (o.enraged ? C.orbSpdAngry : C.orbSpd) * DEG * dt;
    const p = G.player;
    for (let k = 0; k < 2; k++) {
      e.tick[k] -= dt;
      const a = e.orb + k * Math.PI, bx = e.x + Math.cos(a) * C.orbR * e.grow, by = e.y - 14 + Math.sin(a) * C.orbR * e.grow * 0.8;
      if (e.tick[k] <= 0 && p.st !== 'dead' && Math.hypot(p.x - bx, (p.y - 7) - by) < C.orbHit + 4) {
        e.tick[k] = C.orbTick;
        if (SK.hurtPlayer(G, dmgOf(C.orbDmg), bx, by) !== false) o.stats.hurt += dmgOf(C.orbDmg);
      }
    }
  };
  function drawCube(ctx, G, e) {
    if (e.st === 'dead') { if (e.stT > 0.35) return; }
    const dead = e.st === 'dead', s = e.grow * (e.spawnT > 0 ? 1 - e.spawnT : 1), al = dead ? 1 - e.stT / 0.35 : 1;
    const k = Math.floor(e.t * 10) % 4, bob = Math.sin(e.t * Math.PI) * 2.4;
    SK.draw(ctx, 'shadow4', e.x, e.y, { sx: 0.35 * s, sy: 0.5 * s, alpha: 0.5 * al });
    SK.draw(ctx, (e.real ? 'clone1_' : 'clone2_') + k, e.x, e.y - 19.2 * s - bob, { sx: s, sy: s, alpha: al, pages: e.flash > 0 ? SK.pagesWhite : null });
    if (dead) return;
    if (e.real) {   // quả cầu trắng bên trong + thanh máu [WIKI]
      SK.drawTinted(ctx, 'efx_circle', e.x, e.y - 19.2 * s - bob, [1, 1, 1, 0.95], { sx: 0.7 * s * (1 + 0.15 * Math.sin(G.t * 8)), sy: 0.7 * s });
      const bw = 24, bx = e.x - bw / 2, by = e.y - 42 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#e83a3a'; ctx.fillRect(bx, by, bw * clamp(e.hp / e.hpMax, 0, 1), 2);
    }
    for (let j = 0; j < 2; j++) {
      const a = e.orb + j * Math.PI, bx = e.x + Math.cos(a) * C.orbR * e.grow, by = e.y - 14 + Math.sin(a) * C.orbR * e.grow * 0.8;
      ball(ctx, bx, by, 1);
    }
  }
  function cubesStart(G, e) {
    const real = SK.randi(0, C.cubes - 1), base = SK.rand() * TAU;
    e.cubes = [];
    for (let i = 0; i < C.cubes; i++) {
      const c = cubeNew(G, e, i === real, e.x, e.y, base + i * TAU / C.cubes + SK.randf(-0.2, 0.2));
      G.enemies.push(c); e.cubes.push(c);
    }
    e.real = e.cubes[real];
  }

  // Cua Móng Ngựa: hoá thân dive 1 s, đi chậm tới người chơi, chỉ bắn quả cầu lửa; máu riêng ~1000 [WIKI]
  function crabHurt(G, e, dmg) {
    const c = e.crab; if (!c || c.hp <= 0) return true;
    c.hp -= dmg; e.flash = 0.08; e.stats.crabHit++;
    SK.num(G, e.x, e.y - 24, dmg, '#ec0000', false);
    return true;
  }

  // ---------------------------------------------------------------- AI
  function pickAtk(G, e) {
    if (C.next) { const n = C.next; C.next = null; return n; }
    e.basic = (e.basic || 0);
    // sau 2-3 đòn thường thì tới một đòn biến hình (khối / cua), không lặp liền kề [ƯỚC LƯỢNG]
    if (e.basic >= 2 && SK.rand() < 0.65) { e.basic = 0; const sp = ['clone', 'crab'].filter(n => n !== e.lastSp); const n = SK.pick(sp.length ? sp : ['clone', 'crab']); e.lastSp = n; return n; }
    e.basic++;
    const list = ['green', 'red', 'fireball'].filter(n => n !== e.last);
    return SK.pick(list);
  }
  function startAtk(G, e, name) {
    e.cur = name; e.last = name; e.stats.atk[name] = (e.stats.atk[name] || 0) + 1;
    SK.emit('felAttack', G, e, name);
    if (name === 'clone') { mode(e, 'cloneIn'); return; }
    if (name === 'crab') { mode(e, 'crabIn'); return; }
    mode(e, 'atk'); ATKS[name].begin(G, e);
  }
  const MODES = {
    idle(G, e, dt) {
      wander(G, e, dt, C.speed);
      if (!e.enraged && e.hp <= e.hpMax * C.enrageAt) { mode(e, 'angry'); e.layer = 'fel_lord/L1.angry'; e.lt = 0; e.prep = null; return; }
      e.cd -= dt;
      if (e.cd <= 0) startAtk(G, e, pickAtk(G, e));
    },
    atk(G, e, dt) {
      if (ATKS[e.cur].tick(G, e, dt)) { e.layer = null; mode(e, 'idle'); e.cd = e.enraged ? C.shootCdAngry : C.shootCd; }
    },
    angry(G, e, dt) {
      if (e.mt >= 1.5) { e.enraged = true; e.layer = null; mode(e, 'idle'); e.cd = 1; SK.emit('felEnrage', G, e); }
    },
    cloneIn(G, e, dt) {   // clip clone 1,5 s: thân bóp mỏng dần tới biến mất rồi ném 6 khối
      if (e.mt >= 1.5) { setHb(e, 'hide'); cubesStart(G, e); mode(e, 'cubes'); SK.emit('felCubes', G, e); }
    },
    cubes(G, e, dt) {
      const r = e.real;
      if (!r || r.st === 'dead') {
        for (const c of e.cubes) if (c.st !== 'dead') { c.st = 'dead'; c.stT = 0; c.hp = 0; }
        if (r) { const [x, y] = K.clampRoom(e, r.x, r.y); e.x = x; e.y = y; }
        setHb(e, 'norm'); mode(e, 'cloneEnd'); e.weakT = C.weakCube;
      }
    },
    cloneEnd(G, e, dt) { if (e.mt >= 0.3333) mode(e, 'weak'); },
    crabIn(G, e, dt) {
      if (e.mt >= 1) { setHb(e, 'crab'); const hp = Math.round(C.crabHp * e.hpK); e.crab = { hp, hpMax: hp }; e.trail = []; e.cd = 0.8; mode(e, 'crab'); SK.emit('felCrab', G, e); }
    },
    crab(G, e, dt) {
      const p = G.player;
      if (e.crab.hp <= 0) { e.crab = null; setHb(e, 'norm'); mode(e, 'crabOut'); e.weakT = C.weakCrab; return; }
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > 28 && p.st !== 'dead') SK.moveBox(G.map, e, dx / d * C.crabSpd * dt, dy / d * C.crabSpd * dt, e.r);
      e.trail.unshift([e.x, e.y]); if (e.trail.length > 40) e.trail.pop();
      e.cd -= dt;
      if (e.cd <= 0 && p.st !== 'dead') {
        e.cd = C.crabCd;
        greenBolt(G, e, e.x, e.y, Math.atan2(dy, dx), { spd: C.crabBoltSpd, dmg: C.crabBoltDmg, home: null, child: false });
      }
    },
    crabOut(G, e, dt) { if (e.mt >= 0.3333) mode(e, 'weak'); },
    weak(G, e, dt) {   // kiệt sức: không đánh, chịu đòn thường; clip weak → weak_loop → recover [ĐO]
      e.invuln = false;
      if (e.mt >= e.weakT) { e.layer = null; mode(e, 'idle'); e.cd = 1.2; }
    },
    dead() {}
  };
  SK.AI.SKFel = function (G, e, dt) {
    e.at += dt; e.mt += dt;
    if (e.layer) e.lt += dt;
    if (e.st === 'dead') return;
    const p = G.player;
    if (p.st === 'dead') return;
    if (e.mode !== 'crab') e.face = p.x >= e.x ? 1 : -1; else e.face = p.x >= e.x ? 1 : -1;
    // 3 quả cầu lửa quanh người khi nổi giận
    if (e.enraged && (e.mode === 'idle' || e.mode === 'atk' || e.mode === 'angry')) {
      e.orb += C.orbSpdAngry * DEG * dt;
      for (let k = 0; k < 3; k++) {
        e.otick[k] -= dt;
        const [bx, by] = orbAt(e, k);
        if (e.otick[k] <= 0 && Math.hypot(p.x - bx, (p.y - 7) - by) < C.orbHit + 4) {
          e.otick[k] = C.orbTick;
          if (SK.hurtPlayer(G, dmgOf(C.orbDmg), bx, by) !== false) e.stats.hurt += dmgOf(C.orbDmg);
        }
      }
    }
    MODES[e.mode](G, e, dt);
  };
  const orbAt = (e, k) => { const a = e.orb + k * TAU / 3; return [e.x + Math.cos(a) * C.ringR, e.y - 24 + Math.sin(a) * C.ringR * 0.7]; };

  // ---------------------------------------------------------------- dựng trùm
  function makeLord(G, x, y, room) {
    let [cx, cy] = W.roomCenter(room);
    cy += 4;
    const p = G.player;
    if (Math.hypot(p.x - cx, p.y - cy) < 72) {
      const a = Math.atan2(cy - p.y, cx - p.x);
      [cx, cy] = SK.freeNear([cx + Math.cos(a) * 4 * T, cy + Math.sin(a) * 4 * T]);
    }
    const e = {
      id: ID, boss: true, isFel: true, _m3boss: true,   // _m3boss: máu cố định 3600 [WIKI] không qua hệ số trùm Tinh Anh của matrix3.js
      hb: null, d: { shadow: null, shadowOff: [0, 1e5], speed: 5 }, p: { kinematic: 1, reward_rate: 100, reward_value: [0, 0, 0, 12] },   // [ĐO reward_value]
      cls: 'SKFel', rawCls: 'SKFel', x: cx, y: cy, kx: 0, ky: 0, hp: C.hp, hpMax: C.hp, face: p.x > cx ? 1 : -1, aim: 0,
      st: 'spawn', stT: 1.6, t: 0, cd: 1.2, room, elite: false, flash: 0, w: null, anims: { dead: true }, r: 9, scale: 1, burst: 0,
      draw: drawLord, mode: 'idle', mt: 0, at: 0, lt: 0, layer: null, prep: null, enraged: false, orb: SK.rand() * TAU, otick: [0, 0, 0],
      stats: { shots: 0, hurt: 0, crystals: 0, crabHit: 0, atk: {} }, hpK: 1, invuln: false, moving: false
    };
    setHb(e, 'norm');
    e.arena = arenaNew(G, e);
    return e;
  }
  SK.CUSTOM_ENEMIES[ID] = makeLord;
  // Máu cua / khối tính theo hệ số máu thực của trùm (Uy Áp, nhân tố): tới lúc dùng thì hpMax đã được nhân xong
  const AI0 = SK.AI.SKFel;
  SK.AI.SKFel = function (G, e, dt) { e.hpK = e.hpMax / C.hp; return AI0(G, e, dt); };

  // ---------------------------------------------------------------- nhận đòn / chết
  const hurt0 = SK.hurtEnemy;
  SK.hurtEnemy = function (G, e, dmg, ...rest) {
    if (e && e.isFelClone) {
      if (e.st === 'dead' || e.st === 'spawn') return false;
      if (!e.real) {   // khối giả: bị bắn thì phình to, khó né hơn [WIKI]
        e.flash = 0.08; e.grow = Math.min(2.2, e.grow + 0.14); e.owner.stats.fakeHit = (e.owner.stats.fakeHit || 0) + 1;
        SK.num(G, e.x, e.y - 20, dmg, '#9a9a9a', false);
        return true;
      }
      return hurt0(G, e, dmg, ...rest);
    }
    if (e && e.isFel) {
      if (e.st === 'dead' || e.st === 'spawn') return false;
      if (e.invuln) return false;
      if (e.mode === 'crab') return crabHurt(G, e, dmg);
    }
    return hurt0(G, e, dmg, ...rest);
  };
  SK.on('enemyKill', (G, e) => {
    if (!e.isFel) return;
    const A = e.arena;
    A.objs = []; A.pr = [];
    mode(e, 'dead'); e.invuln = true; e.layer = null; e.crab = null;
    for (const c of G.enemies) if (c.isFelClone && c.st !== 'dead') { c.st = 'dead'; c.stT = 0; c.hp = 0; }
    G.felConf = 0; if (G.felBuff) clearBuff(G);
    G.shake = Math.max(G.shake, 5);
  });

  // ---------------------------------------------------------------- vẽ
  function bodyFrame(e, v) {
    if (v.main) { const f = SK.animFrame(v.main, v.mt); if (f) return f; }
    return 'fel_lord_idle_' + IDLE[Math.floor(e.at * 8) % 8];
  }
  function viewOf(e) {
    const v = { main: null, mt: e.mt, hands: 'idle', layer: e.layer, lt: e.lt, prep: e.prep };
    switch (e.mode) {
      case 'dead': v.main = 'fel_lord/dead'; v.mt = e.stT; v.hands = 'dead'; break;
      case 'cloneIn': v.main = 'fel_lord/clone'; break;
      case 'cloneEnd': v.main = 'fel_lord/clone_end'; break;
      case 'crabIn': v.main = 'fel_lord/dive'; v.hands = 'dive'; break;
      case 'crabOut': v.main = 'fel_lord/dive_end'; break;
      case 'weak': {
        v.hands = 'weak';
        const left = e.weakT - e.mt;
        if (left <= 0.95) { v.main = 'fel_lord/recover'; v.mt = 0.95 - left; }
        else if (e.mt < 0.85) v.main = 'fel_lord/weak';
        else { v.main = 'fel_lord/weak_loop'; v.mt = e.mt - 0.85; }
        break;
      }
      default: break;
    }
    if (e.layer === 'fel_lord/L1.angry') v.hands = 'angry';
    else if (e.layer === 'fel_lord/L1.hand_emit') v.hands = 'emit';
    return v;
  }
  const HANDS = {
    idle: ['/img/body/hands/right/state0/img', '/img/body/hands/left/state0/img'],
    emit: ['/img/body/hands/right/state0/img', '/img/body/hands/left/state1/img'],
    angry: ['/img/body/hands/right/state1/img', '/img/body/hands/left/state1/img'],
    weak: ['/img/body_weak/hands/right/state0/img', '/img/body_weak/hands/left/state0/img'],
    dive: ['/img/body_dive/hands/right/state0/img', '/img/body_dive/hands/left/state0/img'],
    dead: ['/img/body_dead/hands/right/state0/img', '/img/body_dead/hands/left/state0/img']
  };
  function wanted(p, v) {
    const n = p.n;
    if (n === '/img/body' || n === '/shadow') return true;
    if (HANDS[v.hands].indexOf(n) >= 0) return true;
    if (v.hands === 'emit' && (v.prep === 'green' || v.prep === 'red') && n.indexOf('/bullet_prepare/' + v.prep + '/') >= 0 && n.indexOf('/img/body/') === 0) return true;
    return false;
  }
  function pose(v, rel) {
    const a = v.main ? SK.animPose(v.main, v.mt, rel) : { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };
    if (!v.layer) return a;
    const b = SK.animPose(v.layer, v.lt, rel);
    return { dx: a.dx + b.dx, dy: a.dy + b.dy, sx: a.sx * b.sx, sy: a.sy * b.sy, rot: a.rot + b.rot };
  }
  function drawLordBody(ctx, e, x, y, alpha, pages) {
    const v = viewOf(e), f0 = fl(e);
    const body = bodyFrame(e, v);
    for (const p of parts) {
      if (!wanted(p, v)) continue;
      let f = p.f;
      if (p.n === '/img/body') f = body;
      else if (v.hands === 'emit' && p.n === '/img/body/hands/left/state1/img') f = SK.animFrame('fel_lord/L1.hand_emit', v.lt) || f;
      if (!f || GLOW[f]) continue;
      const ps = pose(v, p.n.slice(1)), sc = p.sc || [1, 1];
      const sx = sc[0] * ps.sx, sy = sc[1] * ps.sy;
      if (!sx || !sy) continue;
      const a = p.n === '/shadow' ? alpha * 0.8 : alpha;
      SK.draw(ctx, f, x + (p.at[0] + ps.dx) * f0, y - p.at[1] + ps.dy, { sx: sx * f0, sy, rot: ps.rot * f0, alpha: a, pages });
    }
    if (v.hands === 'emit' && v.prep === 'fireball') {   // quả cầu lửa chuẩn bị trên tay (nút bullet_prepare/fireball/ps, sc 0,65 [ĐO])
      const k = clamp(v.lt / 0.35, 0, 1), [hx, hy] = handPos(e);
      ball(ctx, hx, hy - 4, 1.1 * k, alpha);
    }
    if (v.main === 'fel_lord/clone') {   // clone_fx/dots: chấm sáng bay lên khi thân bóp mỏng [ĐO]
      const k = clamp((e.mt - 0.6) / 0.8, 0, 1);
      SK.drawTinted(ctx, 'efx_circle', x, y - 30 - 24 * k, [0.4, 1, 0.3, 0.8 * (1 - k)], { sx: 1.59, sy: 2 });
    }
  }
  function drawCrab(ctx, e, alpha, pages) {
    const f0 = fl(e), tr = e.trail || [], s = 0.75;
    SK.draw(ctx, 'shadow3', e.x, e.y + 2, { sx: 1.2, sy: 1.2, alpha: 0.5 });
    for (let i = 2; i >= 0; i--) {   // ba đốt đuôi nối nhau (fel_lord_diving2_0..2, ObjectJointMovement) bám vệt đi [ĐO]
      const q = tr[Math.min(tr.length - 1, (i + 1) * 7)] || [e.x, e.y + (i + 1) * 5];
      SK.draw(ctx, 'fel_lord_diving2_' + i, q[0], q[1] - 6, { sx: s, sy: s, alpha, pages });
    }
    SK.draw(ctx, 'fel_lord_diving', e.x, e.y - 8, { sx: s * f0, sy: s, alpha, pages });
    const c = e.crab; if (!c) return;
    const bw = 30, bx = e.x - bw / 2, by = e.y - 28;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = '#e83a3a'; ctx.fillRect(bx, by, bw * clamp(c.hp / c.hpMax, 0, 1), 3);
  }
  function drawLord(ctx, G, e) {
    const dead = e.st === 'dead';
    let alpha = e.st === 'spawn' ? clamp(1 - e.stT / 1.6, 0, 1) : 1;
    if (e.mode === 'cubes') return;
    const pages = e.flash > 0 ? SK.pagesWhite : null;
    if (e.mode === 'crab') drawCrab(ctx, e, alpha, pages);
    else {
      const bob = dead ? 0 : Math.sin(e.at * TAU / 2.6) * 1.1;
      drawLordBody(ctx, e, e.x, e.y + bob, alpha, pages);
      if (!dead && e.enraged && (e.mode === 'idle' || e.mode === 'atk' || e.mode === 'angry')) {
        for (let k = 0; k < 3; k++) { const [bx, by] = orbAt(e, k); ball(ctx, bx, by, 1.1); }
      }
    }
  }

  // ---------------------------------------------------------------- HUD: thanh máu trùm + tên lúc xuất hiện
  SK.on('hud', (ctx, G) => {
    const e = G.enemies && G.enemies.find(o => o.isFel && o.st !== 'dead');
    if (!e || G.state === 'lobby') return;
    const v = SK.view;
    ctx.save();
    if (e.st === 'spawn') {
      const k = clamp(1 - e.stT / 1.6, 0, 1);
      SK.text(ctx, 'Tước Sĩ Lục', v.w / 2, v.h * 0.3, 20, 'rgba(120,255,110,' + (0.4 + 0.6 * k) + ')', 'center', 'rgba(0,0,0,0.85)');
    } else {
      const w = 140, h = 8, x = Math.round((v.w - w) / 2), y = 34;
      ctx.fillStyle = 'rgba(8,10,20,0.8)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#3d1f1f'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = e.enraged ? '#ff4a3a' : '#3ed86a'; ctx.fillRect(x, y, Math.round(w * clamp(e.hp / e.hpMax, 0, 1)), h);
      ctx.strokeStyle = '#7ad07a'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
      SK.text(ctx, 'Tước Sĩ Lục', v.w / 2, y + h + 8, 8, '#d8ffd0', 'center', 'rgba(0,0,0,0.9)');
      C.hud = { x, y, w, h, hp: e.hp, hpMax: e.hpMax };
    }
    ctx.restore();
  });

  // Cho bộ kiểm: ép đòn kế (C.next), tìm trùm
  C.find = G => (G || SK.G).enemies.find(o => o.isFel);
  C.start = (G, e, name) => { C.next = null; e.cd = 0; if (e.mode === 'idle' || e.mode === 'atk') startAtk(G, e, name); };
})();
