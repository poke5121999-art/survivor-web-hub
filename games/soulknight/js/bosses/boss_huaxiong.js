// Hoa Hùng (boss_huaxiong, 4-3 Chiến Trường Cổ 4B). Nhãn: [ĐO] dữ liệu bundle, [WIKI Hua Xiong + /Tactics], [ƯỚC LƯỢNG].
// Rig sprite (không phải Spine) vẽ bằng khung rig js/bosses.js; dữ liệu art/spine/boss_huaxiong/data.js (tools/spine/export_boss.py).
// AI gốc IL2CPP: đòn dựng từ clip Animator (skill_1 chém .5 s, skill_2 nhảy dậm 2,22 s, skill_3_start/skill_3 xoáy/skill_3_end; sự kiện
// anim_onSkillEffectiveStart/End/SkillEnd [ĐO]) và wiki. Máu: wiki 1440 = 1200 x HP_FACTOR 1,2 [WIKI] (config 1000 là giá trị khác).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, B86, fire, hurtIn, explode, rigPlay, rigTime, clampRoom } = K;
  const ent = B86.bosses.boss_huaxiong;
  if (!ent) return;
  ent.hp = 1200;
  const fl = e => (e.face < 0 ? -1 : 1);
  const ST = { slash: 'skill_1', whirl: 'skill_3_start', slam: 'idle' };
  const SLAM_R = 2 * SK.TILE;        // vòng đỏ "4 ô" [WIKI] hiểu là đường kính 4 ô [ƯỚC LƯỢNG]
  const SLAM_WARN = 3;               // [WIKI] nhảy xuống sau 3 giây
  const LAND_AT = 1.1667;            // sự kiện EffectiveEnd của skill_2 [ĐO]
  const ring = (G, e, x, y, n, spd, a0) => { for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_1', x, y, a0 + k * TAU / n, { spd, dmg: 4, life: 4, h: 10 }); };

  function land(G, e, sl) {
    explode(G, sl.tx, sl.ty, 'explode_hit_player', 'explode_big', 8);   // sóng xung kích 8 sát thương [WIKI]
    G.shake = Math.max(G.shake, 5);
    ring(G, e, sl.tx, sl.ty - 6, 18, 6, SK.rand() * TAU);
    sl.rings = 1;
  }
  const def = {
    atks: ['slash', 'whirl', 'slam'], idle: 'idle', run: 'run', hand: 'actor/img/hand', firstCd: 1.0, enrageCd: 0.75,
    state: ST,
    pick(G, e) { const p = G.player; return Math.hypot(p.x - e.x, p.y - e.y) < 70 ? ['slash', 'whirl', 'slam'] : ['whirl', 'slam']; },
    start: {
      slash: (G, e) => { e.cur = 'slash'; e.sat = 0; },
      whirl: (G, e) => { e.cur = 'whirl'; e.sat = 0; e.spin = null; e.endT = 0; },
      slam: (G, e) => {
        e.cur = 'slam'; e.sat = 0;
        const p = G.player, [tx, ty] = clampRoom(e, p.x, p.y);
        const sl = e.sl = { t: 0, x0: e.x, y0: e.y, tx, ty, played: false, landed: false, rings: 0, n: 0 };
        e.arena.objs.push({ t: 0, dur: 12, update() { return e.sl === sl && !e.deathDone; },
          ground(ctx) {
            const k = Math.min(1, sl.t / SLAM_WARN);
            ctx.save(); ctx.fillStyle = 'rgba(230,40,40,' + (0.12 + 0.2 * k) + ')'; ctx.strokeStyle = 'rgba(255,70,70,0.85)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(sl.tx, sl.ty, SLAM_R, SLAM_R * 0.7, 0, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(sl.tx, sl.ty, SLAM_R * k, SLAM_R * 0.7 * k, 0, 0, TAU); ctx.stroke(); ctx.restore();
          } });
      }
    },
    tick(G, e, dt) {
      if (!e.atk) { e.sat = 0; e.sl = null; e.spin = null; return; }
      e.sat = (e.sat || 0) + dt;
      if (e.sat > 12) e.atkEnd = true;
      const s = K.rigState(e.R); if (s) e.atk = s;
      if (e.cur === 'whirl' && e.spin) {
        const sp = e.spin, tot = e.enraged ? 17 : 14, n = e.enraged ? 16 : 8, p = G.player;
        sp.t += dt;
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, v = Math.min(d, e.speed * U * 0.6 * dt);
        SK.moveBox(G.map, e, dx / d * v, dy / d * v, e.r);   // vừa xoáy vừa tiến sát người chơi [WIKI]
        if (sp.t >= sp.next && sp.k < tot) { sp.next += 0.22; sp.k++; ring(G, e, e.x, e.y - 12, n, 5, sp.k * 11 * DEG); }
        if (sp.k >= tot && sp.t >= sp.next) { e.spin = null; rigPlay(e.R, 'skill_3_end'); e.atk = 'skill_3_end'; e.endT = 0.5; }
      }
      if (e.endT > 0) { e.endT -= dt; if (e.endT <= 0) e.atkEnd = true; }
      const sl = e.sl;
      if (sl && e.cur === 'slam') {
        sl.t += dt;
        if (!sl.played && sl.t >= SLAM_WARN - LAND_AT) { sl.played = true; rigPlay(e.R, 'skill_2'); e.atk = 'skill_2'; }
        if (sl.played && !sl.landed) {
          const k = SK.clamp((rigTime(e.R) - 0.2778) / (LAND_AT - 0.2778), 0, 1);
          e.x = sl.x0 + (sl.tx - sl.x0) * k; e.y = sl.y0 + (sl.ty - sl.y0) * k;   // bay lên rồi rơi xuống điểm đỏ
          if (rigTime(e.R) >= LAND_AT) { sl.landed = true; e.x = sl.tx; e.y = sl.ty; land(G, e, sl); sl.nt = 0.5; }
        }
        // nổi giận: tổng 3 lần đạn tròn từ chỗ dậm [WIKI]
        if (sl.landed && e.enraged && sl.rings < 3) { sl.nt -= dt; if (sl.nt <= 0) { sl.nt = 0.5; sl.rings++; ring(G, e, sl.tx, sl.ty - 6, 18, 6, SK.rand() * TAU); } }
      }
    },
    ev: {
      anim_onSkillEffectiveStart(G, e, arg, st) {
        if (st === 'skill_1') { hurtIn(G, e.x + fl(e) * 22, e.y - 10, 28, 6); G.shake = Math.max(G.shake, 2); }   // chém 6 sát thương [WIKI]
        else if (st === 'skill_3_start') { e.spin = { t: 0, next: 0, k: 0 }; }
      },
      anim_onSkillEnd(G, e, arg, st) { if (e.cur === 'slash' || (e.cur === 'slam' && st === 'skill_2')) e.atkEnd = true; }
    }
  };
  SK.bossRegister('boss_huaxiong', def);
})();
