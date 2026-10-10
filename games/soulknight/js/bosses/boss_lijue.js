// Lý Thôi (boss_lijue, 4-3 Chiến Trường Cổ 4B). Nhãn: [ĐO] dữ liệu bundle, [WIKI Li Jue + /Tactics], [ƯỚC LƯỢNG].
// Rig sprite (SpriteRenderer + Animator, KHÔNG phải Spine) vẽ bằng khung rig của js/bosses.js; dữ liệu ở art/spine/boss_lijue/data.js (tools/spine/export_boss.py).
// AI gốc là PlayMakerFSM Sleep/Idle/Move/Skill + IL2CPP: đòn dựng từ clip Animator (sự kiện anim_onSkillEffectiveStart/End/SkillEnd [ĐO]),
// prefab đạn thật boss_lijue_bullet (RGSBullet01: thả đạn con mỗi 0,15 s [ĐO]), boss_lijue_qi (hình chữ C, Bullet01 tốc 10 [ĐO]) và wiki.
// Máu: config 1000 x 1,2 = 1200 nhưng wiki 1320 (Tinh Anh theo hệ số chung) => đặt 1100 để ra 1320 [WIKI].
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { DEG, B86, fire, hurtIn, aimAt } = K;
  const ent = B86.bosses.boss_lijue;
  if (!ent) return;
  ent.hp = 1100;
  const fl = e => (e.face < 0 ? -1 : 1);
  // đòn -> state đầu của chuỗi clip [ĐO controller]
  const FIRST = { slash: 'skill_1_0', red: 'skill_2_0', trail: 'skill_3_0' };
  const volley = (G, e, n) => {
    // Vệt: đạn mẹ bay thẳng, mỗi 0,15 s để lại đạn con đứng yên 2 s [ĐO child_rate 0.15, child_bullet_speed 1, child_destory_time 2]; 5 sát thương [WIKI]
    const [x, y] = [e.x + fl(e) * 12, e.y - 12], a = aimAt(G, x, y);
    for (let k = 0; k < n; k++) {
      let next = 0.15;
      fire(G, e, 'boss_lijue_bullet', x, y, a + (k - (n - 1) / 2) * 14 * DEG, { spd: 8, dmg: 5, life: 3, h: 12, noKids: true,
        tick(G2, b) {
          while (b.age >= next) { next += 0.15; fire(G2, e, 'boss_lijue_bullet_child', b.x, b.y, SK.rand() * Math.PI * 2, { spd: 0.4, dmg: 5, life: 2, h: b.h, noKids: true }); }
        } });
    }
    e.trailVolleys = (e.trailVolleys || 0) + 1;
  };
  let qiN = 0;
  const def = {
    atks: ['slash', 'red', 'trail'], idle: 'idle', run: 'run', hand: 'actor/img/hand', firstCd: 1.0, enrageCd: 0.75,
    state: FIRST,
    pick(G, e) {
      const p = G.player;
      return Math.hypot(p.x - e.x, p.y - e.y) < 80 ? ['slash', 'red', 'trail'] : ['red', 'trail'];
    },
    start: { slash: (G, e) => { e.sat = 0; }, red: (G, e) => { e.sat = 0; qiN = 0; }, trail: (G, e) => { e.sat = 0; } },
    tick(G, e, dt) {
      if (!e.atk) { e.sat = 0; return; }
      const s = K.rigState(e.R); if (s) e.atk = s;      // chuỗi clip tự nối (skill_x_0 -> _1 -> _2) không được tính là hết đòn
      e.sat = (e.sat || 0) + dt;
      if (e.sat > 5) e.atkEnd = true;
    },
    ev: {
      anim_onSkillEffectiveStart(G, e, arg, st) {
        if (/^skill_1_/.test(st)) { hurtIn(G, e.x + fl(e) * 22, e.y - 10, 28, 6); G.shake = Math.max(G.shake, 2); }   // chém ngang 6 sát thương [WIKI]
        else if (/^skill_2_[012]$/.test(st)) {
          const [x, y] = [e.x + fl(e) * 12, e.y - 12], a = aimAt(G, x, y), k = qiN++;
          // chém chữ C đi xuyên vật cản, 6 sát thương, to dần [WIKI]; bán kính [ƯỚC LƯỢNG]
          fire(G, e, 'boss_lijue_qi', x, y, a, { spd: 10, dmg: 6, life: 5, h: 12, r: 8 + 4 * k + (e.enraged ? 4 : 0), noKids: true });
        } else if (st === 'skill_3_0') {
          volley(G, e, e.enraged ? 5 : 4);
          // vung lần hai sau 0,7 s [WIKI]; sự kiện EffectiveEnd ở giây 0 của skill_3_1 rơi đúng ranh giới clip nên không dựa vào nó
          e.arena.objs.push({ t: 0, dur: 0.71, update(G2, o) { if (e.deathDone) return false; if (o.t >= 0.7) { volley(G2, e, e.enraged ? 6 : 5); return false; } return true; } });
        }
      },
      anim_onSkillEnd(G, e) { e.atkEnd = true; }
    }
  };
  SK.bossRegister('boss_lijue', def);
})();
