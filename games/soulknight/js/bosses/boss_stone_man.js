// Golem - Tổ Tiên (boss_stone_man, 4-5 Di Tích Núi Khối). Nhãn: [ĐO] dữ liệu bundle, [WIKI Golem - Ancestor + /Tactics], [ƯỚC LƯỢNG].
// Rig là Spine 4.2.40 (boss_stone_man.skel.bytes) vẽ bằng spine-canvas (js/spine.js); Animator của prefab chỉ giữ chỗ cho khung trùm chung.
// BossStoneMan là MonoBehaviour IL2CPP (không đọc được mã): đòn dựng từ tên clip Spine, sự kiện clip (出拳/收拳/特效 [ĐO]),
// số liệu trường BossStoneMan [ĐO]: laser1Duration 3, laser1RotateAngle 37.5, punchCountV1 6/Size 4, punchCountV2 12/Size 2,
// bulletSpacing 1.8, bulletStartPosX -9, bulletMoveSpeed 6, bulletCreateInterval 0.3, đá sát thương 2.
// Máu 1200 × HP_FACTOR 1,2 = 1440 khớp wiki (Tinh Anh 1800). Hai pha: dưới 50% máu Tổ Tiên rơi khỏi golem, golem gục rồi đứng dậy
// với mắt đỏ (clip 变身), đá lăn biến mất, có thêm đòn đập nát nửa trên phòng một lần (clip 地形摧毁) [WIKI Trivia].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK.spine || !SK.BOSS_KIT) return;
  SK.stoneMan = {};
  const K = SK.BOSS_KIT;
  const { TAU, DEG, U, B86, fire, explode, hurtIn, aimAt, clampRoom, sfx } = K;
  const ent = B86.bosses.boss_stone_man;
  if (!ent) return;
  const VER = '20261010x';
  const PX = 0.01 * 6 * U;   // đơn vị Spine → px: scale SkeletonData 0.01 × scale nút actor 6 × PPU [ĐO prefab]
  const A1 = { idle: '一阶段-待机', laserPre: '一阶段-磁力激光前摇', laserOn: '一阶段-磁力激光发射状态', laserEnd: '一阶段-激光发射结束',
    quake: '一阶段-铁山崩裂', big: '一阶段大范围攻击', jab: '一阶段-刺拳出击' };
  const A2 = { idle: '二阶段-待机', laserPre: '二阶段-磁力激光前摇', laserOn: '二阶段-磁力激光发射状态', laserEnd: '二阶段-磁力激光发射结束',
    quake: '二阶段-铁山崩裂', big: '二阶段大范围攻击', jab: '二阶段-刺拳出击x2', slam: '二阶段-重拳出击x2' };
  const IDLE_RIG = '一阶段-待机';   // state của Animator prefab (lặp), mọi đòn ánh xạ vào đây rồi tự kết thúc bằng atkEnd
  const EYE = [0.19 * U, -6.29 * U];   // vị trí mắt so với chân [ĐO nút eye]
  const ATKS1 = ['laser', 'quake', 'stones', 'jab'], ATKS2 = ['laser', 'quake', 'slam', 'jab', 'pound'];
  const ALL = ['laser', 'quake', 'stones', 'jab', 'slam', 'pound'];
  const anim = e => (e.p2 ? A2 : A1);
  let RIG = null;

  // ---------------------------------------------------------------- dựng thể hiện Spine
  function ensure(G, e) {
    if (e.init) return;
    e.init = true; e.sa = null; e.p2 = false; e.xf = null; e.noFace = true;
    e.hb = { size: [8 * U, 9 * U], off: [0, 6 * U] }; e.r = 3 * U;   // hộp trúng đạn = thân tròn của golem [ƯỚC LƯỢNG theo hình]
    // Spine chạy theo khung (kể cả lúc giới thiệu); onBossDeath xoá arena.objs nên cái chết tự dựng lại ở def.dead
    e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o, dt) { if (!e.sp) attach(e); if (e.sp) { e.sp.update(dt); e.sp.drainEvents(); } return true; } });
  }
  // Gắn thể hiện Spine ngay khi rig nạp xong (có thể sau vài khung); chưa xong/lỗi thì e.sp rỗng và vẽ hình tĩnh
  function attach(e) {
    if (!RIG) return;
    const sp = RIG.make(PX);
    if (e.deathDone) sp.play('死亡', false); else { sp.play('BOSS登场', false); sp.queue(A1.idle, true); }
    e.sp = sp;
  }
  SK.stoneMan.PX = PX;

  // ---------------------------------------------------------------- vật dựng sẵn
  // Vòng đỏ báo trước rồi nổ (quake_effect / explode_hit_player); r px, dmg sát thương, at giây tới lúc nổ
  function zone(G, e, x, y, r, dmg, at) {
    [x, y] = clampRoom(e, x, y);
    e.arena.objs.push({
      t: 0, dur: at + 0.05,
      update(G2, o) {
        if (e.deathDone) return false;
        if (o.t < at) return true;
        explode(G2, x, y, 'explode_hit_player', r > 22 ? 'explode_big' : 'explode_small', dmg);
        G2.shake = Math.max(G2.shake, 3);
        return false;
      },
      ground(ctx, G2, o) {
        const k = Math.min(1, o.t / at);
        ctx.save();
        ctx.fillStyle = 'rgba(220,40,40,' + (0.18 + 0.22 * k) + ')';
        ctx.strokeStyle = 'rgba(255,80,80,0.8)';
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,60,60,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y, r * k, r * 0.7 * k, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    });
  }
  // Dải đòn đấm ngang hai bên: báo trước `pre` giây rồi gây sát thương một lần
  function band(G, e, pre, dmg) {
    let hit = false, fired = false;
    const cx = e.x, cy = e.y - 2.4 * U, hh = 1.7 * U, x0 = 2.5 * U, x1 = 9.5 * U, dur = pre + 0.5;
    e.arena.objs.push({
      t: 0, dur,
      update(G2, o) {
        if (e.deathDone) return false;
        if (o.t >= pre && !fired) { fired = true; G2.shake = Math.max(G2.shake, 4); sfx(G2, ent.mbs.BossStoneMan.punchClip); }
        if (fired && !hit) {
          const p = G2.player, dx = Math.abs(p.x - cx);
          if (p.st !== 'dead' && dx > x0 && dx < x1 && Math.abs((p.y - 6) - cy) < hh) { hit = true; SK.hurtPlayer(G2, K.dmgOf(dmg)); }
        }
        return o.t < o.dur;
      },
      ground(ctx, G2, o) {
        if (o.t >= pre) return;
        const k = o.t / pre;
        ctx.save();
        ctx.fillStyle = 'rgba(220,40,40,' + (0.12 + 0.18 * k) + ')';
        ctx.fillRect(cx - x1, cy - hh, x1 - x0, hh * 2);
        ctx.fillRect(cx + x0, cy - hh, x1 - x0, hh * 2);
        ctx.restore();
      }
    });
  }

  // ---------------------------------------------------------------- đá lăn: hàng 11 viên cách 1,8 đơn vị, chừa khoảng trống [WIKI + ĐO]
  function stones(G, e) {
    const T = SK.TILE, r = e.room, S = ent.mbs.BossStoneMan;
    const n = Math.round(-2 * S.bulletStartPosX / S.bulletSpacing) + 1;   // 11 cột
    const top = (r.y0 + 2) * T, bot = (r.y1 + 0.5) * T, spd = S.bulletMoveSpeed;
    const life = (bot - top) / (spd * U) + 0.3;
    let gap = SK.clamp(Math.round((G.player.x - (e.x + S.bulletStartPosX * U)) / (S.bulletSpacing * U)), 1, n - 2), row = 0;
    e.arena.objs.push({
      t: 0, dur: 1e9, nx: 0.1,
      update(G2, o) {
        if (e.deathDone || e.p2) return false;
        if (o.t < o.nx) return true;
        o.nx += S.bulletCreateInterval;
        for (let c = 0; c < n; c++) {
          if (Math.abs(c - gap) <= 1) continue;   // khoảng trống 3 cột [ƯỚC LƯỢNG]
          const x = e.x + (S.bulletStartPosX + c * S.bulletSpacing) * U;
          if (x < (r.x0 + 1) * T || x > (r.x1) * T) continue;
          fire(G2, e, 'stone_man_bullet', x, top, Math.PI / 2, { spd, dmg: S.stone.damage, life, h: 8 });
        }
        gap = SK.clamp(gap + SK.pick([-1, 0, 1]), 1, n - 2);
        row++;
        return row < 8;
      }
    });
  }

  // ---------------------------------------------------------------- các đòn
  function done(e) { e.sa = null; e.atkEnd = true; e.sp.play(anim(e).idle, true); }

  const ATK = {
    // Mắt thu về một, quét laser tới góc phòng; nổi giận quét nhanh gấp đôi [WIKI]. Quét 3 s ở 37,5°/s [ĐO laser1Duration, laser1RotateAngle]
    laser: {
      begin(G, e, sa) { e.sp.play(anim(e).laserPre, false); sa.stage = 0; sa.t = 0; },
      tick(G, e, dt, sa) {
        const sp = e.sp, S = ent.mbs.BossStoneMan, rate = S.laser1RotateAngle * (e.p2 ? 2 : 1) * DEG;
        if (sa.stage === 0 && sp.done()) {
          sa.stage = 1; sa.t = 0; sp.play(anim(e).laserOn, true);
          const side = SK.chance(0.5) ? 1 : -1, span = S.laser1RotateAngle * S.laser1Duration * DEG, mid = Math.PI / 2;
          sa.a0 = mid - side * span / 2; sa.dir = side; sa.on = true; sa.span = span;
          K.beam(G, e, 'bullet_e_8', {
            dmg: 3, alive: () => sa.on && !e.deathDone, origin: () => [e.x + EYE[0], e.y + EYE[1]],
            ang: () => {
              // nổi giận: đi-về (4 lượt quét [ĐO laser2RotateCount]), thường: một lượt
              const d = rate * sa.t, tri = sa.span <= 0 ? 0 : Math.abs(((d % (2 * sa.span)) + 2 * sa.span) % (2 * sa.span) - sa.span);
              return sa.a0 + sa.dir * (e.p2 ? sa.span - tri : Math.min(d, sa.span));
            }
          });
        } else if (sa.stage === 1) {
          sa.t += dt;
          if (sa.t >= S.laser1Duration) { sa.on = false; sa.stage = 2; sp.play(anim(e).laserEnd, false); }
        } else if (sa.stage === 2 && sp.done()) done(e);
      }
    },
    // Đập đất 4 chỗ lần lượt, mỗi chỗ báo bằng vùng đỏ [WIKI]; nổi giận 12 chỗ nhỏ [ĐO punchCountV2/SizeV2]
    quake: {
      begin(G, e, sa) {
        const S = ent.mbs.BossStoneMan, p = G.player;
        e.sp.play(anim(e).quake, false);
        const n = e.p2 ? S.punchCountV2 : 4, rad = (e.p2 ? S.punchSizeV2 : S.punchSizeV1) * U * 0.5;
        const t0 = e.p2 ? 0.9 : 0.5, step = e.p2 ? 0.16 : 0.45, warn = e.p2 ? 0.7 : 0.9;
        for (let i = 0; i < n; i++) {
          const a = SK.rand() * TAU, d = i === 0 ? 0 : SK.randf(1, 6) * U;
          const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
          // chỗ đầu nhắm vào người chơi lúc bắt đầu; hạn chế vùng nổ chồng ngay lên trùm
          zone(G, e, x, y, rad, 4, t0 + step * i + warn);
        }
        sa.t = 0;
      },
      tick(G, e) { if (e.sp.done()) done(e); }
    },
    // Hàng đá lăn (pha 1) [WIKI]
    stones: {
      begin(G, e, sa) { e.sp.play(A1.big, false); stones(G, e); sa.t = 0; },
      tick(G, e) { if (e.sp.done()) done(e); }
    },
    // Hai nắm đấm đâm ngang hai bên (clip 刺拳: 出拳 0,7 s, 收拳 2,0 s [ĐO]); pha 2 đấm hai lần
    jab: {
      begin(G, e, sa) {
        e.sp.play(anim(e).jab, false);
        band(G, e, 0.7, 4);
        if (e.p2) band2(G, e);
      },
      tick(G, e) { if (e.sp.done()) done(e); }
    },
    // Pha 2: ba cú đập tại chỗ người chơi đứng, nổ ở mốc 特效 1,37 / 2,37 / 3,07 s [ĐO clip 重拳出击x2]
    slam: {
      begin(G, e, sa) {
        e.sp.play(A2.slam, false);
        [1.37, 2.37, 3.07].forEach((t, i) => {
          e.arena.objs.push({ t: 0, dur: t - 0.8, update(G2, o) {
            if (e.deathDone) return false;
            if (o.t < o.dur) return true;
            const p = G2.player;
            zone(G2, e, p.x + (i ? SK.randf(-1, 1) * 2 * U : 0), p.y, 2.2 * U, 5, 0.8);
            return false;
          } });
        });
      },
      tick(G, e) { if (e.sp.done()) done(e); }
    },
    // Pha 2: đập vòng quanh chân (二阶段大范围攻击, OnPunch 1,6 s [ĐO]) rồi bắn vòng đá ra
    pound: {
      begin(G, e, sa) {
        e.sp.play(A2.big, false);
        zone(G, e, e.x, e.y - 0.6 * U, 5 * U, 5, 1.6);
        e.arena.objs.push({ t: 0, dur: 1.6, update(G2, o) {
          if (e.deathDone) return false;
          if (o.t < o.dur) return true;
          const a0 = SK.rand() * TAU, n = 12;
          for (let k = 0; k < n; k++) fire(G2, e, 'stone_man_bullet', e.x, e.y - 2 * U, a0 + k * TAU / n, { spd: 5, dmg: 2, life: 2.4, h: 8 });
          return false;
        } });
      },
      tick(G, e) { if (e.sp.done()) done(e); }
    }
  };
  function band2(G, e) { band(G, e, 1.9, 4); }

  // ---------------------------------------------------------------- đổi pha: 变身 rồi 地形摧毁
  function startTransform(G, e) {
    e.xf = { stage: 0 };
    e.sp.play('变身', false);
    for (const b of G.bullets) if (b.pname === 'stone_man_bullet') b.dead = true;   // đá lăn biến mất khi sang pha 2 [WIKI]
    sfx(G, ent.mbs.BossStoneMan.setupClip);
    G.shake = Math.max(G.shake, 5);
  }
  function tickTransform(G, e) {
    const x = e.xf, sp = e.sp;
    if (x.stage === 0 && sp.done()) {
      e.p2 = true; x.stage = 1; sp.play('地形摧毁', false);
      // đập nát nửa trên phòng một lần (OnDestroyGround 1,03 s [ĐO]); báo trước bằng vùng đỏ nửa trên
      const r = e.room, T = SK.TILE, midY = (r.y0 + r.y1) / 2 * T;
      x.zone = { y: midY, x0: r.x0 * T, x1: (r.x1 + 1) * T, y0: r.y0 * T };
      e.arena.objs.push({
        t: 0, dur: 1.2,
        update(G2, o) {
          if (e.deathDone) return false;
          if (o.t >= 1.03 && !o.fired) {
            o.fired = true; G2.shake = Math.max(G2.shake, 7);
            const p = G2.player; if (p.st !== 'dead' && p.y < x.zone.y) SK.hurtPlayer(G2, K.dmgOf(4));
            sfx(G2, ent.mbs.BossStoneMan.explodeClip);
          }
          return o.t < o.dur;
        },
        ground(ctx, G2, o) {
          if (o.t >= 1.03) return;
          ctx.fillStyle = 'rgba(220,40,40,' + (0.1 + 0.2 * Math.min(1, o.t)) + ')';
          ctx.fillRect(x.zone.x0, x.zone.y0, x.zone.x1 - x.zone.x0, x.zone.y - x.zone.y0);
        }
      });
    } else if (x.stage === 1 && sp.done()) {
      e.xf = null; sp.play(A2.idle, true); e.cd = 1.0; e.busy = Math.max(e.busy, 0.6);
    }
  }

  const def = {
    atks: ALL, idle: IDLE_RIG, walk: false, hand: 'effect', noFace: true, firstCd: 1.3, enrageCd: 0.8,
    state: Object.fromEntries(ALL.map(n => [n, IDLE_RIG])),
    skipNode: () => true,   // Spine thay toàn bộ nút vẽ của prefab
    pick(G, e) { ensure(G, e); return e.p2 ? ATKS2 : ATKS1; },
    start: Object.fromEntries(ALL.map(n => [n, (G, e) => {
      ensure(G, e);
      const sa = e.sa = { n, t: 0 };
      ATK[n].begin(G, e, sa);
    }])),
    canAttack(e) { return !!e.sp && !e.xf && (e.p2 || e.hp > e.hpMax * 0.5); },
    tick(G, e, dt) {
      ensure(G, e);
      if (!e.sp) return;
      if (e.xf) { tickTransform(G, e); return; }
      if (e.sa) ATK[e.sa.n].tick(G, e, dt, e.sa);
      else if (!e.p2 && e.hp <= e.hpMax * 0.5 && !e.atk) startTransform(G, e);
    },
    drawUnder(ctx, G, e) {
      if (!e.sp) {
        // hình dự phòng: ảnh tĩnh của trùm trong atlas (chưa nạp xong Spine hoặc nạp lỗi)
        const fr = SK_ATLAS.f.boss_stone_man_img;
        if (fr && SK.pages[fr[0]]) ctx.drawImage(SK.pages[fr[0]], fr[1], fr[2], fr[3], fr[4], Math.round(e.x - fr[3] / 2), Math.round(e.y - fr[4] + 4), fr[3], fr[4]);
        return;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 5.5 * U, 1.3 * U, 0, 0, TAU); ctx.fill();
      ctx.restore();
      e.sp.draw(ctx, e.x, e.y, { flash: e.flash > 0 });
    },
    dead(G, e) {
      ensure(G, e);
      e.sa = null; e.xf = null;
      if (e.sp) e.sp.play('死亡', false);
      e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o, dt) { if (!e.sp) attach(e); if (e.sp) e.sp.update(dt); return o.t < 6; } });
    }
  };

  // Đăng ký ngay (không đụng dữ liệu Spine); tệp rig + spine-canvas chỉ nạp khi trùm sinh ra. Nạp lỗi thì vẽ hình tĩnh
  // boss_stone_man_img, trùm đứng yên (không đòn) nhưng vẫn hạ được; cảnh báo một lần qua SK.warnOnce.
  SK.stoneMan.load = () => SK.spine.load('boss_stone_man', VER).then(rig => { RIG = rig; SK.stoneMan.rig = rig; SK.stoneMan.ready = true; return rig; })
    .catch(err => { SK.stoneMan.error = String(err && err.message || err); if (SK.warnOnce) SK.warnOnce('stoneman', 'boss_stone_man (Spine) disabled: ' + SK.stoneMan.error); return null; });
  SK.bossRegister('boss_stone_man', def);
  const make = SK.CUSTOM_ENEMIES.boss_stone_man;
  SK.CUSTOM_ENEMIES.boss_stone_man = (G, x, y, room) => { const e = make(G, x, y, room); ensure(G, e); SK.stoneMan.load(); return e; };
})();
