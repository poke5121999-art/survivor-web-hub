// Golem - Vụ Ảnh Long (boss_stone_dragon, 4-5 Di Tích Núi Khối). Nhãn: [ĐO] dữ liệu bundle, [WIKI Golem - Mist Dragon], [ƯỚC LƯỢNG].
// Rồng là rig Spine 4.2.40 (bosswindmyststonedragon_spineexport) vẽ bằng spine-canvas (js/spine.js); Giáo Chủ Rồng (dragon_priests) và
// tường di động (4A_boss3_movingWall_H/V) là prefab sprite thường, rig + Animator bóc ra art/spine/boss_stone_dragon/prefabs.json
// (tools/spine/export_prefabs.py), sprite nằm trong atlas qua tools/extra/bosses.json.
// Máu 1200 x HP_FACTOR 1,2 = 1440 khớp wiki (Tinh Anh 1800). Hai pha: rồng bay (đớp băng, ném đá bằng 4 chi, lao thẳng), dưới 50% máu
// rồng gục (clip dead, sự kiện AnimaOnPriestJumpOut ở 2,33 s) và Giáo Chủ nhảy ra khỏi đầu rồng, chiến đấu với số máu còn lại
// (EnemyHurtProxy của Giáo Chủ chuyển sát thương về thanh máu chung) [WIKI: trước 6.0.5 là 70%].
// Số trường [ĐO] StoneDragonCtrl: cruiseDuration 15, dashDuration 5, dashLength 60, dashBulletDamage 3, dashBulletRepel 10;
// BossCtrlStoneDragon.bullets: Giáo Chủ 1/2 sát thương 4, đá tay tốc 10 sát thương 4, đạn 3 tốc 12 sát thương 3.
// StoneDragonCtrl/StoneDragonPriestCtrl là IL2CPP (không đọc được mã): đòn dựng từ tên clip + sự kiện clip + trường bullet [ĐO] + wiki.
// Phòng trùm web chỉ 21 ô (336 px) còn rồng gốc dài ~32 đơn vị: thu nhỏ rồng SCALE lần để lọt phòng [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK.spine || !SK.BOSS_KIT) return;
  SK.stoneDragon = {};
  const K = SK.BOSS_KIT;
  const { TAU, DEG, U, B86, fire, hurtIn, aimAt, clampRoom, sfx, point } = K;
  const ent = B86.bosses.boss_stone_dragon;
  if (!ent) return;
  const VER = '20261010z';
  const SCALE = 0.55;
  const PX = 0.01 * 6.5 * U * SCALE;   // đơn vị Spine -> px: scale SkeletonData 0.01 x scale nút actor 6,5 x PPU x thu nhỏ
  const CTRL = ent.rig.nodes.find(n => n.mbs && n.mbs.StoneDragonCtrl).mbs.StoneDragonCtrl;
  const BL = ent.mbs.BossCtrlStoneDragon.bullets;   // [Giáo Chủ 1, Giáo Chủ 2, đá tay, Giáo Chủ 3]
  const LIFT = 34;                 // rồng bay cách bóng ~34 px [ƯỚC LƯỢNG theo hình]
  const BODY_OFF = 160 * PX;       // gốc xương root cách tâm thân (thân trải từ -385 tới +64 đơn vị Spine [ĐO bounds SkeletonData])
  const HALF = 225 * PX;           // nửa chiều dài
  
  const HB1 = { size: [2 * HALF, 70], off: [0, LIFT] };
  const HB2 = { size: [24, 40], off: [0, 18] };   // collider prefab dragon_priests 1,5 x 2,5 đơn vị, off y 1,1 [ĐO]
  // Bốn chi: [animation, xương đầu đạn, tốc độ clip [ĐO speed state Animator]]
  const CLAW = [['attack_claw_l_f', 'fire_point_0', 1.5], ['attack_claw_r_f', 'fire_point_1', 1.4], ['attack_claw_l_b', 'fire_point_2', 1.6], ['attack_claw_r_b', 'fire_point_3', 1.2]];
  const P1 = ['claw', 'barrage', 'head', 'dash'], P2 = ['orb1', 'orb2', 'seeker', 'wall', 'tp'];
  const ALL = P1.concat(P2);
  const IDLE1 = 'idle', IDLE2 = 'dragon_priests_ide';
  const S1 = Object.fromEntries(P1.map(n => [n, IDLE1])), S2 = Object.fromEntries(P2.map(n => [n, IDLE2]));
  let RIG = null, AUX = null, CUR = null;

  // ---------------------------------------------------------------- dựng thể hiện Spine
  function ensure(G, e) {
    if (e.init) return;
    e.init = true; CUR = e; e.sp = null; e.p2 = false; e.xf = null; e.sa = null; e.noFace = true;
    e.hb = { size: HB1.size.slice(), off: HB1.off.slice() }; e.r = 40;
    e.cx = e.x; e.cy = e.y; e.dir = G.player.x >= e.x ? 1 : -1; e.tx = e.x; e.txT = 0;
    // Spine chạy theo khung (kể cả lúc giới thiệu); onBossDeath xoá arena.objs nên cái chết tự dựng lại ở def.dead
    e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o, dt) { pump(G2, e, dt); return true; } });
  }
  function pump(G, e, dt) {
    if (!e.sp) attach(e);
    if (!e.sp) return;
    e.sp.update(dt);
    for (const ev of e.sp.drainEvents()) if (e.sa && e.sa.onEv) e.sa.onEv(G, e, ev[0]);
    if (e.xf) tickTransform(G, e, dt);
  }
  function attach(e) {
    if (!RIG) return;
    const sp = RIG.make(PX);
    sp.play(e.deathDone ? 'dead' : IDLE1, !e.deathDone);
    e.sp = sp;
  }
  SK.stoneDragon.PX = PX;
  const rx = e => (e.p2 || e.corpse ? e.corpse.rx : e.cx + e.dir * BODY_OFF);
  const ry = e => (e.p2 || e.corpse ? e.corpse.ry : e.cy - LIFT);
  const flipOf = e => (e.p2 || e.corpse ? e.corpse.dir : e.dir) < 0;
  const bone = (e, n) => e.sp.bone(n, rx(e), ry(e), flipOf(e));
  // Đầu đạn 3D: x,y màn hình của xương, h = độ cao so với bóng
  const hOf = (e, y) => Math.max(0, (e.p2 ? e.y : e.cy) - y);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(SK.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------------------------------------------------------------- tiện ích sàn đấu
  function drawFrame(ctx, name, x, y, alpha) {
    const fn = K.frameOf(name), f = fn && window.SK_ATLAS.f[fn];
    if (!f || !SK.pages[f[0]]) return;
    ctx.save();
    if (alpha != null && alpha < 1) ctx.globalAlpha *= Math.max(0, alpha);
    ctx.drawImage(SK.pages[f[0]], f[1], f[2], f[3], f[4], Math.round(x - f[5]), Math.round(y - f[6]), f[3], f[4]);
    ctx.restore();
  }
  // Làn khói băng của đòn đớp đầu [CTRL: head_bullet là BulletGas buff_ice, sát thương 2, hit_invert 0,4 s]
  function gasCloud(G, e, sa) {
    const parts = [];
    e.arena.objs.push({
      t: 0, dur: 1e9,
      update(G2, o, dt) {
        if (!sa.on || e.deathDone || e.xf) return false;
        const [hx, hy] = bone(e, 'fire_point'), d = e.dir;
        if (!sa.gas) { for (const q of parts) q.t += dt; for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t > parts[i].life) parts.splice(i, 1); return true; }
        sa.gx = hx + d * 34; sa.gy = hy + 6;
        for (let i = 0; i < 2; i++) parts.push({ x: hx + d * 6, y: hy + SK.randf(-6, 6), vx: d * SK.randf(50, 90), vy: SK.randf(-14, 14), t: 0, life: SK.randf(0.6, 1.0) });
        for (const q of parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t > parts[i].life) parts.splice(i, 1);
        o.nx = (o.nx || 0) - dt;
        const p = G2.player;
        if (o.nx <= 0 && p.st !== 'dead' && Math.hypot(p.x - sa.gx, (p.y - 7) - sa.gy) < sa.gr) {
          o.nx = 0.4; SK.hurtPlayer(G2, K.dmgOf(2));
        }
        return true;
      },
      air(ctx) {
        ctx.save();
        for (const q of parts) {
          const k = q.t / q.life;
          ctx.fillStyle = 'rgba(190,235,255,' + (0.5 * (1 - k)) + ')';
          ctx.beginPath(); ctx.arc(q.x, q.y, 6 + 14 * k, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    });
  }
  // Vệt báo trước đòn lao: dải đỏ dọc làn của đầu rồng tới tường xa
  function aimLine(G, e, sa) {
    e.arena.objs.push({
      t: 0, dur: 1e9,
      update() { return !!sa.line && !e.deathDone && !e.xf; },
      ground(ctx) {
        const r = e.room, T = SK.TILE, y = e.cy - LIFT, k = Math.min(1, sa.t / 2);
        const x0 = e.cx + e.dir * HALF, x1 = e.dir > 0 ? (r.x1 + 1) * T : r.x0 * T;
        ctx.save();
        ctx.fillStyle = 'rgba(230,50,50,' + (0.12 + 0.2 * k) + ')';
        ctx.fillRect(Math.min(x0, x1), y - 20, Math.abs(x1 - x0), 40);
        ctx.restore();
      }
    });
  }

  // ---------------------------------------------------------------- các đòn pha 1 (rồng)
  const done = e => { e.sa = null; e.atkEnd = true; };
  function throwStone(G, e, h) {
    const [bx, by] = bone(e, CLAW[h][1]);
    fire(G, e, 'stone_dragon_hand_bullet', bx, by, aimAt(G, bx, by), { spd: BL[2].speed || 10, dmg: BL[2].damage, life: 5, h: hOf(e, by) });
    sfx(G, CTRL.sfxSkill1);
  }
  // Mỗi chi: clip đè lên track 1+h, sự kiện AnimaOnHand<h>BulletThrowOut ở 1,033 s / tốc clip [ĐO] thì ném đá
  function startClaw(G, e, sa, h) {
    const c = CLAW[h];
    e.sp.playOn(1 + h, c[0], false, c[2]);
    sa.live.add(h);
  }
  const ATK1 = {
    // 1 hoặc 2 chi ném liên tiếp
    claw: {
      begin(G, e, sa) {
        sa.live = new Set(); sa.q = shuffle([0, 1, 2, 3]).slice(0, 2); sa.nx = 0;
        sa.onEv = (G2, e2, name) => { const m = /Hand(\d)BulletThrowOut/.exec(name); if (m) throwStone(G2, e2, +m[1]); };
      },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (sa.q.length && sa.t >= sa.nx) { startClaw(G, e, sa, sa.q.shift()); sa.nx = sa.t + 0.45; }
        for (const h of Array.from(sa.live)) if (e.sp.doneOn(1 + h)) sa.live.delete(h);
        if (!sa.q.length && !sa.live.size) done(e);
      }
    },
    // Cả bốn chi lần lượt, mỗi chi cách 0,4 s
    barrage: {
      begin(G, e, sa) {
        sa.live = new Set(); sa.q = shuffle([0, 1, 2, 3]); sa.nx = 0;
        sa.onEv = (G2, e2, name) => { const m = /Hand(\d)BulletThrowOut/.exec(name); if (m) throwStone(G2, e2, +m[1]); };
      },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (sa.q.length && sa.t >= sa.nx) { startClaw(G, e, sa, sa.q.shift()); sa.nx = sa.t + 0.4; }
        for (const h of Array.from(sa.live)) if (e.sp.doneOn(1 + h)) sa.live.delete(h);
        if (!sa.q.length && !sa.live.size) done(e);
      }
    },
    // attack_head 2,67 s: khói băng phun ra trước mặt từ 0,5 s tới 2,2 s [ƯỚC LƯỢNG khung thời gian; clip không có sự kiện]
    head: {
      begin(G, e, sa) { e.sp.playOn(5, 'attack_head', false); sa.gas = false; sa.on = true; sa.gr = 36; gasCloud(G, e, sa); sfx(G, CTRL.sfxSkill2); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        sa.gas = sa.t >= 0.5 && sa.t <= 2.2;
        if (e.sp.doneOn(5)) { sa.gas = false; sa.on = false; done(e); }
      }
    },
    // dash_readymove 2,0 s (aimline) rồi dash: băng qua phòng theo làn đã khoá; dashLength 60 / dashDuration 5 = 12 đơn vị/s [ĐO]
    dash: {
      begin(G, e, sa) {
        e.sp.play('dash_readymove', false); e.sp.queue('dash', true);
        sa.stage = 0; sa.line = true; sa.hit = false;
        e.dir = G.player.x >= e.cx ? 1 : -1;
        aimLine(G, e, sa); sfx(G, CTRL.sfxSkill3);
      },
      tick(G, e, dt, sa) {
        sa.t += dt;
        const r = e.room, T = SK.TILE;
        if (sa.stage === 0) {
          if (sa.t < 1.3) e.cy += SK.clamp(G.player.y - e.cy, -1, 1) * Math.min(Math.abs(G.player.y - e.cy), 90 * dt);
          if (sa.t >= 2.0) { sa.stage = 1; sa.t = 0; sa.line = false; G.shake = Math.max(G.shake, 3); }
        } else if (sa.stage === 1) {
          const spd = CTRL.dashLength / CTRL.dashDuration * U;
          const lim = e.dir > 0 ? (r.x1 + 1) * T - HALF : r.x0 * T + HALF;   // đầu chạm tường xa
          e.cx += e.dir * spd * dt;
          const hx = e.cx + e.dir * HALF, p = G.player;
          if (!sa.hit && p.st !== 'dead' && Math.abs(p.x - hx) < 24 && Math.abs((p.y - 7) - (e.cy - LIFT)) < 26) {
            sa.hit = true; SK.hurtPlayer(G, K.dmgOf(CTRL.dashBulletDamage));
            p.x += e.dir * 20;   // [ĐO dashBulletRepel 10, đơn vị lực đẩy chưa quy ra px: đẩy nhẹ 20 px]
          }
          if ((e.dir > 0 && e.cx >= lim) || (e.dir < 0 && e.cx <= lim) || sa.t >= CTRL.dashDuration) { e.cx = SK.clamp(e.cx, r.x0 * T + HALF, (r.x1 + 1) * T - HALF); sa.stage = 2; sa.t = 0; e.sp.play(IDLE1, true); }
        } else if (sa.t >= 0.6) done(e);
      }
    }
  };

  // ---------------------------------------------------------------- các đòn pha 2 (Giáo Chủ Rồng)
  const wpn = e => point(e, 'img/w/img/fire_point');
  // đạn: dựng kèm lệnh gọi lại theo tuổi đạn
  function shootStart(G, e, sa, at) { e.sa = sa; sa.shot = false; sa.at = at; K.rigPlay(e.R, 'dragon_priests_shootBullet'); sfx(G, 'AudioClip:sfx_priest_skill_4'); }
  const ATK2 = {
    // Đạn 1: quả cầu trôi chậm, cứ 0,4 s rải vòng đạn con cách 62 độ và xoay dần [ĐO RGSBullet01 child_rate 0,4 angle 62 child speed 7 damage 2]
    orb1: {
      begin(G, e, sa) { shootStart(G, e, sa, 1.062); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (!sa.shot && sa.t >= sa.at) {
          sa.shot = true;
          const [x, y] = wpn(e), a0 = aimAt(G, x, y);
          for (const d of [-0.35, 0, 0.35]) {
            fire(G, e, 'bullet_boss_dragonPriests_1', x, y, a0 + d, { spd: 3, dmg: BL[0].damage, life: 5, h: hOf(e, y),
              kidDirs: bb => { const n = Math.round(360 / 62), s0 = bb.age * 200 * DEG; return Array.from({ length: n }, (_, k) => s0 + k * 62 * DEG); } });
          }
        }
        if (sa.t >= 1.7) done(e);
      }
    },
    // Đạn 2: ba trụ đứng yên quanh người chơi, 2 s sau nở bốn quả con, mỗi quả con rải đạn hai phía mỗi giây [ĐO RGSBullet01 trụ: child_rate 2 angle 90; con: child_rate 1 angle 180]
    orb2: {
      begin(G, e, sa) { shootStart(G, e, sa, 1.062); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (!sa.shot && sa.t >= sa.at) {
          sa.shot = true;
          const p = G.player, a0 = SK.rand() * TAU;
          for (let k = 0; k < 3; k++) {
            const a = a0 + k * TAU / 3, d = SK.randf(40, 90);
            const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
            fire(G, e, 'bullet_boss_dragonPriests_2', x, y - 10, 0, { spd: 0, dmg: BL[1].damage, life: 4, h: 10 });
          }
        }
        if (sa.t >= 1.7) done(e);
      }
    },
    // Đạn 3: đạn dẫn tốc 12 (Bullet02: xoay tối đa 15 độ mỗi 0,1 s), sau 1 s nhả hai viên ngắm người chơi cách nhau 2 s [ĐO DelayCreateAimEffector: initDelay 1, releaseDuration 2, releaseCount 2, tốc 8, sát thương 3]
    seeker: {
      begin(G, e, sa) { shootStart(G, e, sa, 1.062); },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (!sa.shot && sa.t >= sa.at) {
          sa.shot = true;
          const [x, y] = wpn(e), b = fire(G, e, 'bullet_boss_dragonPriests_3', x, y, aimAt(G, x, y), { spd: BL[3].speed || 12, dmg: BL[3].damage, life: 5, h: hOf(e, y) });
          if (b) {
            const t0 = b.tick; let n = 0;
            b.tick = (G2, bb, dt2) => {
              if (t0) t0(G2, bb, dt2);
              while (n < 2 && bb.age >= 1 + n * 1.0) {
                n++;
                fire(G2, e, 'bullet_boss_dragonPriests_1_sub', bb.x, bb.y, aimAt(G2, bb.x, bb.y + bb.h - 7), { spd: 8, dmg: 3, life: 5, h: bb.h });
              }
            };
          }
        }
        if (sa.t >= 1.7) done(e);
      }
    },
    // Tường đá di động: vài tường H/V hiện dần rồi quét ngang phòng; chạm tường mất 4 máu một lần [WIKI "wall attack"; số liệu ƯỚC LƯỢNG]
    wall: {
      begin(G, e, sa) { shootStart(G, e, sa, 9); sfx(G, 'AudioClip:sfx_priest_skill_4'); walls(G, e); },
      tick(G, e, dt, sa) { sa.t += dt; if (sa.t >= 1.7) done(e); }
    },
    // Dịch chuyển: làn khói rồi xuất hiện chỗ khác [tpSmokePrefab, StoneDragonPriestCtrl.tpTargetPos]
    tp: {
      begin(G, e, sa) {
        sa.stage = 0; e.sa = sa; smoke(G, e.x, e.y);
        sfx(G, 'AudioClip:sfx_priest_skill_4');
      },
      tick(G, e, dt, sa) {
        sa.t += dt;
        if (sa.stage === 0 && sa.t >= 0.4) {
          sa.stage = 1; e.hidden = true;
          // thử vài điểm, lấy điểm đầu tiên cách chỗ cũ >= 60 px (tránh dịch chuyển tại chỗ)
          let x = e.x, y = e.y;
          for (let i = 0; i < 8; i++) { const q = SK.freeNear(K.roomPoint(G, e, 50, 150)); x = q[0]; y = q[1]; if (Math.hypot(x - e.x, y - e.y) >= 60) break; }
          e.x = x; e.y = y; smoke(G, x, y);
        } else if (sa.stage === 1 && sa.t >= 0.8) { e.hidden = false; done(e); }
      }
    }
  };
  function smoke(G, x, y) {
    G.props.push({ x, y: y - 1, t: 0, update(G2, pr, dt) { pr.t += dt; pr.gone = pr.t > 0.5; },
      draw(ctx, G2, pr) {
        const k = Math.min(1, (pr.t || 0) / 0.5);
        ctx.save(); ctx.fillStyle = 'rgba(190,170,210,' + (0.55 * (1 - k)) + ')';
        ctx.beginPath(); ctx.ellipse(x, y - 8, 14 + 16 * k, 10 + 10 * k, 0, 0, TAU); ctx.fill(); ctx.restore();
      } });
  }
  // Tường: 2 tường H quét dọc từ trên xuống / dưới lên, 1 tường V quét ngang
  function walls(G, e) {
    const r = e.room, T = SK.TILE, p = G.player;
    const W = { H: { w: 6.7045 * U, h: 3.258 * U, fr: 'moveing_wall_H_' }, V: { w: 2.2125 * U, h: 7.9199 * U, fr: 'moveing_wall_V_' } };
    const defs = [];
    const up = SK.chance(0.5);
    defs.push({ k: 'H', x: p.x + SK.randf(-30, 30), y0: (up ? r.y1 + 1 : r.y0 + 1) * T, y1: (up ? r.y0 + 1 : r.y1 + 1) * T });
    defs.push({ k: 'H', x: p.x + SK.randf(-100, 100), y0: (up ? r.y1 + 1 : r.y0 + 1) * T, y1: (up ? r.y0 + 1 : r.y1 + 1) * T, delay: 0.7 });
    const left = SK.chance(0.5);
    defs.push({ k: 'V', y: p.y + SK.randf(-20, 20), x0: (left ? r.x0 : r.x1 + 1) * T, x1: (left ? r.x1 + 1 : r.x0) * T, delay: 0.35 });
    for (const d of defs) {
      const S = W[d.k], pre = 1.0, move = 3.2, delay = d.delay || 0;
      let hit = false;
      e.arena.objs.push({
        t: 0, dur: 1e9,
        pos(o) {
          const k = SK.clamp((o.t - delay - pre) / move, 0, 1);
          return d.k === 'H' ? [d.x, d.y0 + (d.y1 - d.y0) * k] : [d.x0 + (d.x1 - d.x0) * k, d.y];
        },
        update(G2, o) {
          if (e.deathDone) return false;
          const a = o.t - delay;
          if (a >= pre + move) return false;
          if (a < pre || hit) return true;
          const [x, y] = this.pos(o), q = G2.player;
          // thân tường nằm từ (x,y) lên trên h (H) hoặc ở giữa (V)
          const cy = d.k === 'H' ? y - S.h / 2 : y - 2, cx = x;
          if (q.st !== 'dead' && Math.abs(q.x - cx) < S.w / 2 + 3 && Math.abs((q.y - 7) - cy) < S.h / 2 + 3) { hit = true; SK.hurtPlayer(G2, K.dmgOf(4)); G2.shake = Math.max(G2.shake, 4); }
          return true;
        },
        air(ctx, G2, o) {
          const a = o.t - delay;
          if (a < 0) return;
          const [x, y] = this.pos(o), n = Math.floor(o.t * 8) % 8, fade = a < pre ? a / pre : a > pre + move - 0.4 ? Math.max(0, (pre + move - a) / 0.4) : 1;
          const cy = d.k === 'H' ? y - S.h / 2 : y;
          drawFrame(ctx, S.fr + n, x, cy, fade * (a < pre ? 0.55 : 1));
        }
      });
    }
  }

  // ---------------------------------------------------------------- đổi pha: rồng gục (dead), Giáo Chủ nhảy ra khỏi đầu
  function startTransform(G, e) {
    e.xf = { t: 0, stage: 0 };
    for (let tr = 1; tr <= 5; tr++) e.sp.clearTrack(tr);
    e.sp.play('dead', false);
    for (const b of G.bullets) if (b.side === 'e' && /stone_dragon_hand_bullet/.test(b.pname || '')) b.dead = true;
    sfx(G, CTRL.sfxDead);
    G.shake = Math.max(G.shake, 4);
  }
  function jumpOut(G, e) {
    const x = e.xf, [hx, hy] = bone(e, 'priest_root');
    e.corpse = { rx: rx(e), ry: ry(e), dir: e.dir };
    // dựng Animator Giáo Chủ bằng bossProp rồi mượn rig làm rig của trùm (mượn xong thì giết prop để khỏi tick đôi)
    const pr = K.bossProp(G, e, null, hx, hy, { rig: AUX.dragon_priests.rig, state: IDLE2, life: 1e9, hp: 1 });
    G.enemies.splice(G.enemies.indexOf(pr), 1);
    e.R = pr.R; pr.st = 'dead'; pr.hp = 0; pr.ended = true;
    e.nodes = {}; AUX.dragon_priests.rig.nodes.forEach((n, i) => { e.nodes[n.n] = i; });
    e.hb = { size: HB2.size.slice(), off: HB2.off.slice() }; e.r = 8;
    e.noFace = false; e.face = G.player.x >= hx ? 1 : -1;
    // nhảy tới tâm phòng, vòng cung 1 s [ĐO jumpDuration 1]
    const [lx, ly] = SK.freeNear(clampRoom(e, W_CENTER(e)[0], W_CENTER(e)[1]));
    x.j = { x0: hx, y0: hy, x1: lx, y1: ly, t: 0 };
    e.x = hx; e.y = hy; x.stage = 1;
    sfx(G, 'AudioClip:sfx_priest_skill_4');
  }
  const W_CENTER = e => { const r = e.room, T = SK.TILE; return [(r.x0 + r.x1 + 1) / 2 * T, (r.y0 + r.y1 + 1) / 2 * T + 2 * T]; };
  function tickTransform(G, e, dt) {
    const x = e.xf;
    x.t += dt;
    if (x.stage === 0 && x.t >= 2.3333 && e.sp) jumpOut(G, e);   // AnimaOnPriestJumpOut [ĐO clip dead]
    else if (x.stage === 1) {
      const j = x.j; j.t += dt;
      const k = Math.min(1, j.t / CTRL_JUMP);
      e.x = j.x0 + (j.x1 - j.x0) * k; e.y = j.y0 + (j.y1 - j.y0) * k - 30 * Math.sin(Math.PI * k);
      if (k >= 1) {
        e.x = j.x1; e.y = j.y1; e.xf = null; e.p2 = true; e.cd = 1.2; e.busy = Math.max(e.busy, 0.4);
        e.lastX = e.x; e.lastY = e.y;
        G.shake = Math.max(G.shake, 4);
        darkness(G, e);
      }
    }
  }
  const CTRL_JUMP = (ent.rig.nodes.find(n => n.mbs && n.mbs.StoneDragonPriestCtrl).mbs.StoneDragonPriestCtrl.jumpDuration) || 1;
  // Phòng phủ sương: đánh với Giáo Chủ thì tầm nhìn thu hẹp [WIKI]
  function darkness(G, e) {
    let a = 0;
    e.arena.objs.push({
      t: 0, dur: 1e9,
      update(G2, o, dt) { a = Math.min(1, a + dt); return !e.deathDone; },
      air(ctx, G2) {
        const p = G2.player, r = e.room, T = SK.TILE, cx = p.x, cy = p.y - 8;
        const g = ctx.createRadialGradient(cx, cy, 70, cx, cy, 190);
        g.addColorStop(0, 'rgba(10,14,28,0)'); g.addColorStop(1, 'rgba(10,14,28,' + (0.8 * a) + ')');
        ctx.save(); ctx.fillStyle = g; ctx.fillRect(r.x0 * T - 8, r.y0 * T - 8, (r.x1 - r.x0 + 1) * T + 16, (r.y1 - r.y0 + 1) * T + 16); ctx.restore();
      }
    });
  }

  // ---------------------------------------------------------------- di chuyển giữa hai đòn (pha 1)
  function cruise(G, e, dt) {
    const r = e.room, T = SK.TILE, p = G.player;
    const lo = r.x0 * T + HALF + 8, hi = (r.x1 + 1) * T - HALF - 8;
    e.txT -= dt;
    if (e.txT <= 0) { e.tx = SK.randf(lo, hi); e.txT = SK.randf(3, 6); }
    const tx = SK.clamp(e.tx, lo, hi), dx = tx - e.cx;
    e.cx += SK.clamp(dx, -1, 1) * Math.min(Math.abs(dx), (Math.abs(e.cx - SK.clamp(e.cx, lo, hi)) > 4 ? 70 : 28) * dt);
    const ty = SK.clamp(p.y, (r.y0 + 4) * T, (r.y1 + 0.5) * T), dy = ty - e.cy;
    e.cy += SK.clamp(dy, -1, 1) * Math.min(Math.abs(dy), e.speed * U * 0.55 * dt);
    if (Math.abs(p.x - e.cx) > 24) e.dir = p.x > e.cx ? 1 : -1;
  }

  const def = {
    atks: ALL, hand: 'effect', noFace: true, firstCd: 1.3, enrageCd: 0.8,
    get idle() { return CUR && CUR.p2 ? IDLE2 : IDLE1; },
    get run() { return CUR && CUR.p2 ? 'dragon_priests_run' : null; },
    get walk() { return !!(CUR && CUR.p2 && !CUR.xf); },
    get state() { return CUR && CUR.p2 ? S2 : S1; },
    skipNode: () => !(CUR && CUR.p2),   // pha 1: Spine thay toàn bộ nút vẽ của prefab; pha 2: rig Giáo Chủ vẽ bằng khung trùm chung
    pick(G, e) { ensure(G, e); return e.p2 ? P2 : P1; },
    start: Object.fromEntries(ALL.map(n => [n, (G, e) => {
      ensure(G, e);
      const sa = e.sa = { n, t: 0 };
      (P1.indexOf(n) >= 0 ? ATK1 : ATK2)[n].begin(G, e, sa);
    }])),
    canAttack(e) { return !!e.sp && !e.xf && (e.p2 || e.hp > e.hpMax * 0.5); },
    tick(G, e, dt) {
      ensure(G, e);
      if (!e.sp) return;
      if (e.p2 || e.xf) {
        if (!e.xf && e.sa) ATK2[e.sa.n].tick(G, e, dt, e.sa);
        return;
      }
      if (e.sa) ATK1[e.sa.n].tick(G, e, dt, e.sa);
      else {
        cruise(G, e, dt);
        if (e.hp <= e.hpMax * 0.5 && !e.atk) { startTransform(G, e); return; }
      }
      e.x = e.cx; e.y = e.cy;
    },
    drawUnder(ctx, G, e) {
      if (!e.sp) {
        // hình dự phòng: ảnh tĩnh của trùm (chưa nạp xong Spine hoặc nạp lỗi)
        const fr = SK_ATLAS.f.boss_stone_dragon_img;
        if (fr && SK.pages[fr[0]]) ctx.drawImage(SK.pages[fr[0]], fr[1], fr[2], fr[3], fr[4], Math.round(e.x - fr[3] / 2), Math.round(e.y - fr[4] + 4), fr[3], fr[4]);
        return;
      }
      const flip = flipOf(e), x = rx(e), y = ry(e), gx = e.p2 || e.corpse ? e.corpse.rx - e.corpse.dir * BODY_OFF : e.cx, gy = e.p2 || e.corpse ? e.corpse.ry + LIFT : e.cy;
      if (!e.p2) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(gx, gy + 2, HALF, 9, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      e.sp.draw(ctx, x, y, { flip, flash: e.flash > 0 && !e.p2 });
    },
    dead(G, e) {
      ensure(G, e);
      e.sa = null;
      if (!e.p2 && !e.corpse) e.corpse = { rx: rx(e), ry: ry(e), dir: e.dir };
      if (!e.sp) return;
      if (!e.p2 && !(e.xf && e.xf.stage >= 1)) e.sp.play('dead', false);
      for (let tr = 1; tr <= 5; tr++) e.sp.clearTrack(tr);
      e.xf = null;
      e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o, dt) { if (!e.sp) attach(e); if (e.sp) e.sp.update(dt); return o.t < 8; } });
    }
  };

  // Đăng ký ngay (không đụng dữ liệu Spine); rig + spine-canvas chỉ nạp khi trùm sinh ra. Nạp lỗi thì vẽ hình tĩnh boss_stone_dragon_img,
  // trùm đứng yên (không đòn) nhưng vẫn hạ được; cảnh báo một lần qua SK.warnOnce.
  SK.stoneDragon.load = () => {
    if (SK.stoneDragon.p) return SK.stoneDragon.p;
    const aux = fetch('art/spine/boss_stone_dragon/prefabs.json?v=' + VER).then(r => { if (!r.ok) throw new Error('prefabs.json ' + r.status); return r.json(); });
    return (SK.stoneDragon.p = Promise.all([SK.spine.load('boss_stone_dragon', VER), aux]).then(([rig, a]) => { RIG = rig; AUX = a; SK.stoneDragon.rig = rig; SK.stoneDragon.ready = true; return rig; })
      .catch(err => { SK.stoneDragon.error = String(err && err.message || err); if (SK.warnOnce) SK.warnOnce('stonedragon', 'boss_stone_dragon (Spine) disabled: ' + SK.stoneDragon.error); return null; }));
  };
  SK.bossRegister('boss_stone_dragon', def);
  const make = SK.CUSTOM_ENEMIES.boss_stone_dragon;
  SK.CUSTOM_ENEMIES.boss_stone_dragon = (G, x, y, room) => { const e = make(G, x, y, room); ensure(G, e); SK.stoneDragon.load(); return e; };
})();
