// Kỹ năng Tu Sĩ Rừng (c11): venom_vines, fuzzy_bear. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, T = SK.TILE, W = SK.world;
  const { fx, hit, nearest, alive, ec, inRadius, allies, addAlly, hpBar, walk, layer, timers, hurtMods, setMul } = K;

  // ================================================================ Xúc Tua Venom
  // [ĐO c11/skill 2: cd 12, dur 0; prefab druid_vine: RoleAttribute max_hp 10, VineController atk_cd 3.5; Gun002 multiCount 8, angle 45,
  // bullet_50_c11 speed 16 damage 3; clip tentacle_show 0.67 s / atk (sự kiện "Atk" 0.5 s) / hide 0.83 s]: 6 dây leo mọc quanh người trong
  // vùng 8×8 ô, chặn đạn địch, mỗi 3.5 s toả 8 viên đạn lưỡi liềm tự dẫn theo 8 hướng, héo sau 8 s hoặc khi hết máu.
  const VV = {
    n: 6, stagger: 0.15,                             // số dây = 6 + cấp/3, mỗi dây cách nhau 0,15 s [ĐO C12Controller.<CreatingVines>: count = SkillLevel/3 + 6, WaitForSeconds 0.15]
    area: 4 * T, life: 8,                            // toạ độ ngẫu nhiên ±4 ô quanh người, né tường [ĐO GetValidPosition]; VineController.Start gọi Invoke("Passaway", 8) [ĐO]
    gap: 18,                                         // khoảng cách tối thiểu giữa hai dây [ƯỚC LƯỢNG: gốc chỉ Raycast tường/cửa, không giữ khoảng cách]
    sight: 12 * U,                                   // tầm dò quái, bị tường chặn [ĐO VineController.Scout: FindTarget(12, AllObstacleMask)]
    turn: 15 * Math.PI / 180 / 0.02, homing: 12 * U, retarget: 0.1,   // đạn Bullet02 bẻ lái 15°/bước 0,02 s, dò trong 12 ô, quét mỗi 0,1 s, không xuyên tường [ĐO Bullet02.CreateBulletMover → BulletMoverFollow.Setup]
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
      const delay = i * VV.stagger;
      addAlly(G, {
        vine: true, x, y, hp: V.hp, hpMax: V.hp, box: [12, 30, 14], st: 'show', stT: -delay, life: VV.life, cd: 0, V, fired: false,
        onZero(G2, a) { a.hp = 0; wither(a); },
        update(G2, a, dt) {
          a.stT += dt;
          if (a.stT >= 0) a.life -= dt;   // tuổi thọ tính từ lúc dây được tạo
          if (a.st === 'hide') { if (a.stT > VV.hide) a.gone = true; return; }
          if (a.life <= 0) { wither(a); return; }
          if (a.st === 'show') { if (a.stT >= VV.show) { a.st = 'ide'; a.stT = 0; } return; }
          a.cd -= dt;
          if (a.st === 'atk') {
            if (!a.fired && a.stT >= VV.atk) { a.fired = true; volley(G2, p, a); }
            if (a.stT >= 1) { a.st = 'ide'; a.stT = 0; }
            return;
          }
          if (a.cd <= 0 && nearest(G2, a.x, a.y - 20, VV.sight, { los: true })) { a.cd = V.cd; a.st = 'atk'; a.stT = 0; a.fired = false; }
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
      if ((b._tt = (b._tt || 0) - dt) <= 0 || (b._tg && !alive(b._tg))) { b._tt = VV.retarget; b._tg = nearest(G, b.x, b.y, VV.homing, { los: true }); }
      const e = b._tg;
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
  // đang cưỡi gấu chịu mọi sát thương thay ×4; nút đặc biệt (phím L) thay btn_unmount gốc: gấu xuống đánh một mình, đập đất 12 sát thương
  // mỗi 2,5 s. Hết máu thì gấu nằm xuống (còn 1 máu), sau 6 s không bị đánh thì hồi 20% máu tối đa mỗi 2 s, đầy máu mới đánh lại; bấm kỹ năng
  // khi hết hồi chiêu = cưỡi lại, gấu về chỗ người chơi và được hồi 1/4 máu tối đa. Gấu tồn tại tới khi qua cổng.
  const BR = {
    dmgTaken: 4,                        // MountBearController.GetHurt gọi base với damage << 2 [ĐO]
    ride: 1.7 / 1.5,                    // đang cưỡi cộng speed_rate 0,2 vào 0,5; tốc = speed × (1 + speed_rate) [ĐO RGMountController.ResetCommon, GetBasicMoveSpeed]
    slam: 3 * U,                        // bán kính đòn: bullet_hammer là ExplodeHammer scale_factor 1,5 × swordScale 1,5 (×1,5 khi triệu hồi); collider không nằm trong MB nên giữ 3 ô [WIKI]
    slamAt: 0.333, atkLen: 0.5,         // nhịp/độ dài đòn theo clip attack [ĐO]
    regenDelay: 6, regen: 0.2, regenEvery: 2,   // ReplyingHP: chờ reply_time1 + reply_time2 = 4 + 2 s, rồi +max_hp/5 mỗi reply_time2 = 2 s [ĐO RGPetController..ctor, ReplyingHP]
    remountFrac: 0.25,                  // ForceRecover: hp += max_hp / 4 khi lên gấu mà chưa đầy máu [ĐO OnDriveStatusChanged]
    drive: 20.8, follow: 2 * U, atkDist: 2 * U, walk: 1,   // độ cao người ngồi [ĐO DrivePos]; min_follow_distance 2, atkDistance 2 [ĐO BearController]; tốc bằng người chơi (speed 6,5, speed_rate 0,5 như prefab hero) [ĐO]
    sight: 12 * U                       // tầm dò quái của pet [ƯỚC LƯỢNG]
  };
  // Số đo từ mount/bear.ab: RoleAttributePlayer max_hp 30 speed 6.5; BearController damage 12 atk_cd 2.5 max_follow_distance 20.
  const BM = { hp: 30, speed: 6.5, dmg: 12, atkCd: 2.5, maxFollow: 20 };   // hp cộng thêm cấp × 8 [ĐO CreateBear: AddPetHp(level × 8)], cấp 0
  const BK = { ide: 'm_bear_ctrl/ide', run: 'm_bear_ctrl/run', atk: 'm_bear_ctrl/attack', dead: 'm_bear_ctrl/dead' };
  const bearOf = G => allies(G).find(a => a.bear);

  function mount(G, p, a) {
    a.mounted = true; a.down = false; a.box = null;
    setMul(p, 'moveMul', 'bear', BR.ride);
    p._liftY = BR.drive;
    hurtMods(p).bear = (G2, pl, dmg) => {
      const b = bearOf(G2);
      if (!b || !b.mounted) return dmg;
      b.hp -= dmg * BR.dmgTaken; b.flash = 0.08;
      SK.num(G2, p.x, p.y - 30, Math.round(dmg * BR.dmgTaken), '#6bb8ff');
      if (b.hp <= 0) dismount(G2, p, b, true);
      return 0;
    };
  }
  function dismount(G, p, a, forced) {
    a.mounted = false; a.x = p.x; a.y = p.y; a.face = p.face; a.box = [22, 26, 13]; a.cd = 0.4; a.st = 'idle'; a.stT = 0;
    setMul(p, 'moveMul', 'bear', 1);
    p._liftY = 0;
    delete hurtMods(p).bear;
    if (forced || a.hp <= 0) { a.down = true; a.hp = 1; }   // pet không chết: còn 1 máu rồi nằm chờ hồi [ĐO RGPetController.GetHurt]
  }
  function summon(G, p) {
    const hp = BM.hp;
    const a = addAlly(G, {
      bear: true, x: p.x, y: p.y, hp, hpMax: hp, face: p.face, mounted: false, st: 'idle', stT: 0, cd: 0, box: null,
      onZero(G2, q) { q.hp = 1; q.down = true; q.st = 'idle'; q.hitT = 0; },
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
    // Hồi máu của pet [ĐO ReplyingHP]: đồng hồ về 0 mỗi lần bị đánh; tới 6 s thì +max/5 (làm tròn xuống) rồi đặt lại 4 s, tức 2 s một lần.
    if (a.lastHp != null && a.hp < a.lastHp) a.reT = 0;
    a.lastHp = a.hp;
    if (a.hp < a.hpMax) {
      a.reT = (a.reT || 0) + dt;
      if (a.reT >= BR.regenDelay) { a.reT = BR.regenDelay - BR.regenEvery; a.hp = Math.min(a.hpMax, a.hp + Math.floor(a.hpMax * BR.regen)); a.lastHp = a.hp; }
    }
    if (a.down) {
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
      if (d > BR.atkDist) { walk(G, a, cx, cy + 8, spd, dt); a.st = 'run'; }
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
      } else if (a.mounted) { if (SK.sfx) SK.sfx.play('fx_bear_show'); }   // đang cưỡi: gốc chỉ dựng lại Mount, không đổi gì
      else {                                             // cưỡi lại: gấu về chỗ người chơi, hồi 1/4 máu tối đa nếu chưa đầy
        a.x = p.x; a.y = p.y; a.down = false;
        if (a.hp < a.hpMax) a.hp = Math.min(a.hpMax, a.hp + Math.floor(a.hpMax * BR.remountFrac));
        fx(G, 'show_effect_bear', p.x, p.y, { dur: 0.8 });
        mount(G, p, a);
      }
    },
    // Nút đặc biệt (phím L) đóng vai btn_unmount: xuống gấu bất cứ lúc nào, gấu tự chiến đấu. Đòn đánh khi đang cưỡi của special gốc chưa làm.
    special(G, p) { const a = bearOf(G); if (a && a.mounted) dismount(G, p, a, false); }
  };
  SK.on('stageEnter', () => {
    const p = SK.G && SK.G.player;
    if (!p || p.hero !== 'druid' || !p.h.skill || p.h.skill.id !== 'fuzzy_bear' || !p._hurt) return;
    setMul(p, 'moveMul', 'bear', 1); p._liftY = 0; delete p._hurt.bear;   // qua cổng: gấu mất
  });
})();
