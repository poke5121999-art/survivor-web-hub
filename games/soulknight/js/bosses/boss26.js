// Trùm boss26 (Boss đầm lầy, tên Việt ⊿卝⊙ϟ‡): 6 kỹ năng của Boss26Skill, mỗi kỹ năng một clip boss26_atk1..6.
// Clip không có sự kiện nên mỗi kỹ năng chạy bằng đồng hồ trong e.arena.objs theo initDelay/duration của MB [ĐO Boss26Skill].
// Nhãn: [ĐO] dữ liệu, [WIKI], [ƯỚC LƯỢNG]. Hồi máu của Boss26HurtProcessor và sàn đầm lầy của ultimate chưa làm.
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, aimAt, spawnMinion, blast, hurtIn, clampRoom, sfx, dmgOf } = K;
  const S = n => 'boss26_' + n;
  const FOLLOW = { x: 0, y: -2 * U };   // positionOffset (0,2) so với chân trùm [ĐO followBulletModel]
  const head = e => [e.x, e.y - 24];

  // Chạy `fn(G, o)` sau `delay` giây trong sàn đấu (hết khi trùm chết).
  function later(e, delay, fn) {
    e.arena.objs.push({ t: 0, dur: delay, update(G, o) { if (e.deathDone) return false; if (o.t < delay) return true; fn(G); return false; } });
  }
  // Chạy `fn(G, o, dt)` trong `dur` giây.
  function during(e, dur, fn) {
    e.arena.objs.push({ t: 0, dur, update(G, o, dt) { if (e.deathDone) return false; fn(G, o, dt); return o.t < dur; } });
  }

  const boss26 = {
    atks: ['atk1', 'atk2', 'atk3', 'atk4', 'atk5', 'atk6'],
    idle: 'ide', run: 'boss26_run', enrageCd: 0.6,
    state: { atk1: S('atk1'), atk2: S('atk2'), atk3: S('atk3'), atk4: S('atk4'), atk5: S('atk5'), atk6: S('atk6') },
    // Trọng số normalWeight/angryWeight [ĐO]: 10/0/10/5/10/10 và 10/20/5/10/15/5 (chia 5; atk2 ultimate chỉ khi nổi giận)
    pick(G, e) {
      const w = e.enraged ? { atk1: 2, atk2: 4, atk3: 1, atk4: 2, atk5: 3, atk6: 1 } : { atk1: 2, atk3: 2, atk4: 1, atk5: 2, atk6: 2 };
      const L = [];
      for (const k in w) for (let i = 0; i < w[k]; i++) L.push(k);
      return L;
    },
    start: {
      // atk1 summonEnemyModel: swamp_tentacle ×4, trễ initDelay 1 s [ĐO]; ra quái e_tentacle quanh trùm [ƯỚC LƯỢNG]
      atk1(G, e) {
        later(e, 1, G2 => {
          sfx(G2, 'AudioClip:fx_boss26_summon');
          const have = G2.enemies.filter(m => m.bossMinion === e && m.st !== 'dead').length;
          for (let i = have; i < 4 + have && i < 8; i++) {
            const a = SK.rand() * TAU, d = SK.randf(2.5, 5) * U;
            const [x, y] = clampRoom(e, G2.player.x + Math.cos(a) * d, G2.player.y + Math.sin(a) * d);
            const m = spawnMinion(G2, e, 'e_tentacle', x, y);
            if (m && SK.vfx) SK.vfx.spawn(G2, 'effect_show_up', x, y, {});
          }
        });
      },
      // atk2 ultimateSkillModel (chỉ khi nổi giận): initWait 0.5 + buffWait 0.5 s hiện vòng an toàn (swamp_boss_buff_trigger),
      // đếm ngược explodeWait 7 s rồi nổ explodeDamage 5 toàn phòng trừ người đứng trong vòng; emitBulletInterval 2 s phun vòng đạn [ĐO].
      // Vòng an toàn bán kính 3 đơn vị, vị trí ngẫu nhiên: [ƯỚC LƯỢNG]
      atk2(G, e) {
        const [cx, cy] = clampRoom(e, e.x + SK.randf(-4, 4) * U, e.y + SK.randf(3, 6) * U);
        let em = 2, shown = false;
        e.busy = 8.6;
        e.arena.objs.push({
          t: 0, dur: 8.5,
          update(G2, o) {
            if (e.deathDone) return false;
            if (o.t >= 1) shown = true;
            if (shown && o.t >= 1 + em) {
              em += 2;
              const a0 = SK.rand() * TAU;
              for (let k = 0; k < 14; k++) fire(G2, e, 'bullet_e_1', e.x, e.y - 20, a0 + k * TAU / 14, { spd: 5, dmg: 3, h: 12 });
            }
            if (o.t >= 8) {
              const p = G2.player;
              if (Math.hypot(p.x - cx, p.y - cy) > 3 * U && p.st !== 'dead') SK.hurtPlayer(G2, dmgOf(5));
              if (SK.vfx) SK.vfx.spawn(G2, 'swamp_boss_ground', e.x, e.y, {});
              G2.shake = Math.max(G2.shake, 6);
              return false;
            }
            return true;
          },
          ground(ctx, G2, o) {
            if (!shown) return;
            const left = Math.max(0, 8 - o.t), pulse = 0.5 + 0.5 * Math.sin(o.t * 6);
            ctx.save();
            ctx.strokeStyle = 'rgba(120,255,140,' + (0.5 + pulse * 0.4) + ')'; ctx.fillStyle = 'rgba(80,220,110,0.18)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(cx, cy, 3 * U, 3 * U * 0.7, 0, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
            ctx.fillText(String(Math.ceil(left)), e.x, e.y - 52);
            ctx.restore();
          }
        });
      },
      // atk3 followBulletModel: 10 viên bullet_e_90 (Bullet02 bám mục tiêu), initDelay 0.5 s, mỗi duration 0.1 s một viên,
      // thả quanh trùm bán kính releaseRadius 0.7 [ĐO]; tốc 8, sát thương 3 [ĐO bulletInfo]
      atk3(G, e) {
        for (let i = 0; i < 10; i++) {
          later(e, 0.5 + i * 0.1, G2 => {
            const a = SK.rand() * TAU, x = e.x + Math.cos(a) * 0.7 * U + FOLLOW.x, y = e.y + Math.sin(a) * 0.7 * U + FOLLOW.y;
            fire(G2, e, 'bullet_e_90', x, y, a, { spd: 8, dmg: 3, h: 10 });
          });
        }
      },
      // atk4 snakeBulletModel: snakeCount 30 viên bullet_e_91 xoắn trong snakeOverallDuration 3 s (11 vòng xoắn), initDelay 0.625 s;
      // sau đó circularBullet bullet_e_1 ×45 hai lần cách 0.5 s (circularBulletTimes 2, Duration 0.5) [ĐO]. Tốc xoắn 8, vòng 6 [ĐO]
      atk4(G, e) {
        const n = 30, dur = 3;
        let a = SK.rand() * TAU, sent = 0;
        during(e, 0.625 + dur, (G2, o) => {
          if (o.t < 0.625) return;
          const want = Math.min(n, Math.floor((o.t - 0.625) / dur * n) + 1);
          while (sent < want) { fire(G2, e, 'bullet_e_91', e.x, e.y - 26, a, { spd: 8, dmg: 3, h: 12 }); a += TAU * 11 / n; sent++; }
        });
        for (let t = 0; t < 2; t++) {
          later(e, 0.625 + dur + 0.2 + t * 0.5, G2 => {
            const a0 = SK.rand() * TAU;
            for (let k = 0; k < 45; k++) fire(G2, e, 'bullet_e_1', e.x, e.y - 26, a0 + k * TAU / 45, { spd: 6, dmg: 3, h: 12 });
          });
        }
      },
      // atk5 circularEnlargeModel: bullet_e_86 (BulletNotMove), initDelay 0.3 s, releaseTimes 5 lần mỗi duration 0.1 s, cánh cách nhau
      // angleInBetween 45° (8 cánh), quay angularSpeed 60°/s, nở enlargeSpeed 6 đơn vị/s tới maxRadius 4 [ĐO]; tâm trôi centerSpeed 6
      // về phía người chơi lúc thả [ƯỚC LƯỢNG cách hiểu]
      atk5(G, e) {
        for (let r = 0; r < 5; r++) {
          later(e, 0.3 + r * 0.1, G2 => {
            const cx = e.x, cy = e.y - 22, dir = aimAt(G2, cx, cy), arms = 8, a0 = r * 7 * DEG;
            for (let k = 0; k < arms; k++) {
              const b = fire(G2, e, 'bullet_e_86', cx, cy, 0, {
                spd: 0, dmg: 3, h: 12, life: 4,
                tick(G3, bb) {
                  const rad = Math.min(4 * U, 6 * U * bb.age), th = a0 + k * 45 * DEG + 60 * DEG * bb.age, mv = 6 * U * bb.age;
                  bb.x = cx + Math.cos(dir) * mv + Math.cos(th) * rad; bb.y = cy + Math.sin(dir) * mv + Math.sin(th) * rad;
                }
              });
              if (b) b.vx = b.vy = 0;
            }
          });
        }
      },
      // atk6 circularRandomModel: hai nòng trái/phải (±0.5 đơn vị) phun bullet_e_24_2 tốc 12 mỗi 0.05 s trong 1.5 s; góc bắt đầu 62°,
      // lắc trong [-15°,15°] với angleSpeed 240°/s [ĐO]; nòng trái đối xứng gương [ƯỚC LƯỢNG]
      atk6(G, e) {
        let cd = 0;
        during(e, 1.5, (G2, o, dt) => {
          cd -= dt;
          if (cd > 0) return;
          cd = 0.05;
          const a = (62 + 15 * Math.sin(o.t * 240 * DEG)) * DEG;
          fire(G2, e, 'bullet_e_24_2', e.x + 0.5 * U, e.y - 20, a, { spd: 12, dmg: 3, h: 12 });
          fire(G2, e, 'bullet_e_24_2', e.x - 0.5 * U, e.y - 20, Math.PI - a, { spd: 12, dmg: 3, h: 12 });
        });
      }
    }
  };
  void head; void blast; void hurtIn;
  SK.bossRegister('boss26', boss26);
})();
