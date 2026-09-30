// Kỹ năng Tu Sĩ Rừng (c11): venom_vines, fuzzy_bear. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, T = SK.TILE, W = SK.world;
  const { fx, hit, nearest, alive, ec, inRadius, allies, addAlly, hpBar, walk, layer, timers, hurtMods, setMul } = K;

  // ================================================================ Xúc Tua Venom
  // [ĐO c11/skill 2: cd 12, dur 0; prefab druid_vine: RoleAttribute max_hp 10, VineController atk_cd 3.5; Gun002 multiCount 8, angle 45,
  // bullet_50_c11 speed 16 damage 3; clip tentacle_show 0.67 s / atk (sự kiện "Atk" 0.5 s) / hide 0.83 s]: 6 dây leo mọc quanh người trong
  // vùng 8×8 ô, chặn đạn địch, mỗi 3.5 s toả 8 viên đạn lưỡi liềm tự dẫn theo 8 hướng, héo sau 8.5 s hoặc khi hết máu [WIKI].
  const VV = {
    n: 6, area: 4 * T, life: 8.5, gap: 18,          // số dây [WIKI], nửa cạnh vùng 8×8 ô, tuổi thọ [WIKI], khoảng cách tối thiểu giữa hai dây
    sight: 12 * U,                                   // tầm dò quái [ƯỚC LƯỢNG]
    turn: 5, homing: 8 * U,                          // tốc bẻ lái rad/s, tầm tìm mục tiêu của đạn [ƯỚC LƯỢNG] (Bullet02.angle_speed 15)
    show: 0.667, atk: 0.5, hide: 0.833               // [ĐO clip tentacle_show / tentacle_atk Atk / tentacle_hide]
  };
  // Số đo từ pet/vine.ab (dump_mb): prefab này chưa nằm trong SK_SKILLS86.mb nên ghi thẳng.
  const vine = () => ({ hp: 10, cd: 3.5, count: 8, angle: 45, dmg: 3, spd: 16 });
  const CHAIN = [['vine_3', 0, -16, 'img/body/c1'], ['vine_2', 0, -16, 'img/body/c1/c2'], ['vine_1', 0, -17.6, 'img/body/c1/c2/c3'], ['vine_0', 0.56, -20.8, 'img/body/c1/c2/c3/c4']];
  const VKEY = { show: 'tentacle/tentacle_show', ide: 'tentacle/tentacle_ide', atk: 'tentacle/tentacle_atk', hide: 'tentacle/tentacle_hide' };
  // Dây leo = chuỗi 5 đốt sprite thật (vine_4..vine_0); mỗi đốt xoay theo đường "r" của clip tentacle_* tại thời điểm t.
  function drawVine(ctx, x, y, st, t) {
    const key = VKEY[st];
    SK.drawShadow(ctx, 'shadow5', x, y, null, 1);
    ctx.save(); ctx.translate(Math.round(x), Math.round(y));
    SK.draw(ctx, 'vine_4', 0, 0);
    for (const [f, dx, dy, path] of CHAIN) {
      ctx.translate(dx, dy);
      const q = SK.anim(key) && SK.animPose(key, t, path);
      if (q && q.rot) ctx.rotate(q.rot);
      SK.draw(ctx, f, 0, 0);
    }
    ctx.restore();
  }
  function spawnVines(G, p) {
    const V = vine(), spots = [];
    for (let k = 0; k < 60 && spots.length < VV.n; k++) {
      const x = p.x + SK.randf(-VV.area, VV.area), y = p.y + SK.randf(-VV.area, VV.area);
      if (W.solidAt(G.map, x, y) || W.solidAt(G.map, x - 5, y) || W.solidAt(G.map, x + 5, y)) continue;
      if (spots.some(s => Math.hypot(s[0] - x, s[1] - y) < VV.gap) || Math.hypot(p.x - x, p.y - y) < 10) continue;
      spots.push([x, y]);
    }
    spots.forEach(([x, y], i) => {
      const delay = SK.randf(0, 0.25);
      addAlly(G, {
        vine: true, x, y, hp: V.hp, hpMax: V.hp, box: [12, 30, 14], st: 'show', stT: -delay, life: VV.life, cd: 0, V, fired: false,
        onZero(G2, a) { a.hp = 0; wither(a); },
        update(G2, a, dt) {
          a.stT += dt; a.life -= dt;
          if (a.st === 'hide') { if (a.stT > VV.hide) a.gone = true; return; }
          if (a.life <= 0) { wither(a); return; }
          if (a.st === 'show') { if (a.stT >= VV.show) { a.st = 'ide'; a.stT = 0; } return; }
          a.cd -= dt;
          if (a.st === 'atk') {
            if (!a.fired && a.stT >= VV.atk) { a.fired = true; volley(G2, p, a); }
            if (a.stT >= 1) { a.st = 'ide'; a.stT = 0; }
            return;
          }
          if (a.cd <= 0 && nearest(G2, a.x, a.y - 20, VV.sight)) { a.cd = V.cd; a.st = 'atk'; a.stT = 0; a.fired = false; }
        },
        draw(ctx, G2, a) {
          if (a.stT < 0) return;
          ctx.save(); if (a.flash > 0) ctx.globalAlpha = 0.6;
          drawVine(ctx, a.x, a.y, a.st, a.stT);
          ctx.restore();
          if (a.st !== 'hide') hpBar(ctx, a, 34, '#6bd36b');
        }
      });
      fx(G, 'show_effect_wolf', x, y, { scale: 0.6, dur: 0.6 });
    });
  }
  function wither(a) { if (a.st !== 'hide') { a.st = 'hide'; a.stT = 0; a.down = true; } }
  // 8 viên đạn lưỡi liềm bay theo 8 hướng quanh dây (Gun002.multiCount / angle), rồi tự dẫn vào quái gần nhất.
  function volley(G, p, a) {
    const V = a.V;
    for (let i = 0; i < V.count; i++) {
      const ang = i * V.angle * Math.PI / 180;
      K.shoot(G, p, a.x, a.y - 22, ang, { dmg: V.dmg, speed: V.spd, sprite: 'bullet_98', life: 5, repel: 3, hit: 'hit_green', extra: { _hm: true } });
    }
  }
  timers.venom_vines = (G, p, dt) => {
    for (const b of G.bullets) {
      if (!b._hm || b.dead) continue;
      const e = nearest(G, b.x, b.y, VV.homing);
      if (!e) continue;
      const [cx, cy] = ec(e);
      let d = Math.atan2(cy - b.y, cx - b.x) - b.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
      b.ang += Math.max(-VV.turn * dt, Math.min(VV.turn * dt, d));
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(b.ang) * sp; b.vy = Math.sin(b.ang) * sp;
    }
  };
  S.venom_vines = {
    VV, V: vine(),
    start(G, p) { layer(G); spawnVines(G, p); if (SK.sfx) SK.sfx.play('fx_bear_show', { vol: 0.6 }); }
  };

  // ================================================================ Triệu hồi Gấu Khổng Lồ
  // [ĐO c11/skill 3: cd 10, dur 0; prefab mbear: RoleAttributePlayer max_hp 30, speed 6.5; BearController damage 12, atk_cd 2.5,
  // clip attack (sự kiện OnAtk 0.33 s); MountBearController; show_effect_bear; tiếng fx_bear_show; DrivePos (−4.8, 20.8)]: gọi gấu và cưỡi;
  // đang cưỡi gấu chịu mọi sát thương thay ×4 [WIKI], bấm lại (kể cả đang hồi chiêu) thì gấu xuống đánh một mình: đập đất 12 sát thương
  // bán kính 3 ô mỗi 2.5 s [WIKI]. Hết máu thì gấu nằm xuống hồi 20% mỗi 2 s, đầy máu mới đánh lại; bấm lại khi hết hồi chiêu = cưỡi lại,
  // gấu về chỗ người chơi và được hồi 6 máu [WIKI]. Gấu tồn tại tới khi qua cổng.
  const BR = {
    dmgTaken: 4, ride: 1, slam: 3 * U, slamAt: 0.333, atkLen: 0.5, regen: 0.2, regenEvery: 2, remountHeal: 6,   // [WIKI]; nhịp/độ dài đòn theo clip [ĐO]
    drive: 20.8, sight: 12 * U, follow: 2 * U * 1.5, walk: 0.75                                                  // độ cao người ngồi [ĐO DrivePos], hệ số tốc đi [ƯỚC LƯỢNG]
  };
  // Số đo từ mount/bear.ab: RoleAttributePlayer max_hp 30 speed 6.5; BearController damage 12 atk_cd 2.5 max_follow_distance 20.
  const BM = { hp: 30, speed: 6.5, dmg: 12, atkCd: 2.5, maxFollow: 20 };
  const BK = { ide: 'm_bear_ctrl/ide', run: 'm_bear_ctrl/run', atk: 'm_bear_ctrl/attack', dead: 'm_bear_ctrl/dead' };
  const bearOf = G => allies(G).find(a => a.bear);

  function mount(G, p, a) {
    a.mounted = true; a.down = false; a.box = null;
    setMul(p, 'moveMul', 'bear', (p.h.speed + BR.ride) / p.h.speed);
    p._liftY = BR.drive;
    hurtMods(p).bear = (G2, pl, dmg) => {
      const b = bearOf(G2);
      if (!b || !b.mounted) return dmg;
      b.hp -= dmg * BR.dmgTaken; b.flash = 0.08;
      SK.num(G2, p.x, p.y - 30, Math.round(dmg * BR.dmgTaken), '#6bb8ff');
      if (b.hp <= 0) { b.hp = 0; dismount(G2, p, b, true); }
      return 0;
    };
  }
  function dismount(G, p, a, forced) {
    a.mounted = false; a.x = p.x; a.y = p.y; a.face = p.face; a.box = [22, 26, 13]; a.cd = 0.4; a.st = 'idle'; a.stT = 0;
    setMul(p, 'moveMul', 'bear', 1);
    p._liftY = 0;
    delete hurtMods(p).bear;
    if (forced || a.hp <= 0) { a.down = true; a.hp = Math.max(0, a.hp); }
  }
  function summon(G, p) {
    const hp = BM.hp;
    const a = addAlly(G, {
      bear: true, x: p.x, y: p.y, hp, hpMax: hp, face: p.face, mounted: false, st: 'idle', stT: 0, cd: 0, box: null,
      onZero(G2, q) { q.hp = 0; q.down = true; q.st = 'idle'; },
      update(G2, q, dt) { bearTick(G2, p, q, dt); },
      draw(ctx, G2, q) { drawBear(ctx, p, q); }
    });
    return a;
  }
  function bearTick(G, p, a, dt) {
    if (a.mounted) {
      a.x = p.x; a.y = p.y - 0.5; a.face = p.face; a.st = p.moving ? 'run' : 'idle';
      return;
    }
    if (a.down) {
      a.hp = Math.min(a.hpMax, a.hp + a.hpMax * BR.regen / BR.regenEvery * dt);
      if (a.hp >= a.hpMax) { a.down = false; a.box = [22, 26, 13]; fx(G, 'show_effect_bear', a.x, a.y, { dur: 0.6 }); }
      return;
    }
    a.stT += dt; a.cd -= dt;
    const spd = BM.speed * U * BR.walk;
    if (a.st === 'atk') {
      if (!a.slammed && a.stT >= BR.slamAt) slam(G, p, a);
      if (a.stT >= BR.atkLen) { a.st = 'idle'; a.stT = 0; }
      return;
    }
    const e = nearest(G, a.x, a.y - 8, BR.sight);
    a.st = 'idle';
    if (e) {
      const [cx, cy] = ec(e), d = Math.hypot(cx - a.x, cy - (a.y - 8));
      a.face = cx >= a.x ? 1 : -1;
      if (d > BR.slam * 0.6) { walk(G, a, cx, cy + 8, spd, dt); a.st = 'run'; }
      else if (a.cd <= 0) { a.cd = BM.atkCd; a.st = 'atk'; a.stT = 0; a.slammed = false; }
    } else if (Math.hypot(p.x - a.x, p.y - a.y) > BR.follow) { walk(G, a, p.x, p.y, spd * 1.3, dt); a.st = 'run'; }
    if (Math.hypot(p.x - a.x, p.y - a.y) > BM.maxFollow * U) { a.x = p.x; a.y = p.y + 4; }
  }
  function slam(G, p, a) {
    a.slammed = true;
    const x = a.x + a.face * 10, y = a.y;
    fx(G, 'bullet_hammer', x, y, { scale: 1.5 });
    G.shake = Math.max(G.shake, 3);
    for (const e of inRadius(G, x, y - 4, BR.slam)) hit(G, p, e, BM.dmg, { noMul: true, repel: 3, tag: 'bear' });
  }
  function drawBear(ctx, p, a) {
    const key = a.down ? BK.dead : BK[a.st] || BK.ide;
    const t = a.down ? 9 : a.st === 'atk' ? a.stT : a.t;
    const fr = SK.animFrame(key, t), xf = SK.animPose(key, t, 'img');
    SK.drawShadow(ctx, 'shadow3', a.x, a.y + (a.mounted ? 0.5 : 0) - 1.6, null, 1.5);
    ctx.save(); if (a.down) ctx.globalAlpha *= 0.6;
    const fs = a.face < 0 ? -1 : 1, yy = a.y + (a.mounted ? 0.5 : 0);
    if (fr) SK.draw(ctx, fr, a.x + xf.dx * fs, yy + xf.dy, { flip: a.face < 0, rot: xf.rot * fs, sx: xf.sx, sy: xf.sy, pages: a.flash > 0 ? SK.pagesWhite : null });
    ctx.restore();
    hpBar(ctx, { x: a.x, y: yy, hp: a.hp, hpMax: a.hpMax, down: a.down }, 58, '#3cb4e0');
  }
  S.fuzzy_bear = {
    BR, BM,
    start(G, p) {
      layer(G);
      let a = bearOf(G);
      if (!a) {   // gọi gấu và cưỡi
        a = summon(G, p);
        fx(G, 'show_effect_bear', p.x, p.y, { dur: 0.8 });
        if (SK.sfx) SK.sfx.play('fx_bear_show');
        mount(G, p, a);
      } else if (a.mounted) dismount(G, p, a, false);    // hết hồi chiêu mà đang cưỡi: bấm = xuống
      else {                                             // cưỡi lại: gấu về chỗ người chơi, hồi 6 máu
        a.x = p.x; a.y = p.y; a.hp = Math.min(a.hpMax, a.hp + BR.remountHeal); a.down = false;
        fx(G, 'show_effect_bear', p.x, p.y, { dur: 0.8 });
        mount(G, p, a);
      }
    },
    pressCd(G, p) { const a = bearOf(G); if (a && a.mounted) dismount(G, p, a, false); }   // xuống được cả khi đang hồi chiêu [WIKI]
  };
  SK.on('stageEnter', () => {
    const p = SK.G && SK.G.player;
    if (!p || p.hero !== 'druid' || !p.h.skill || p.h.skill.id !== 'fuzzy_bear' || !p._hurt) return;
    setMul(p, 'moveMul', 'bear', 1); p._liftY = 0; delete p._hurt.bear;   // qua cổng: gấu mất
  });
})();
