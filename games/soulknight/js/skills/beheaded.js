// Kỹ năng Kẻ Bị Chặt Đầu (c19): spartan_sandals. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world;

  // Cú Đá Spartan [ĐO c19Controller + sword_skill_beheaded (RGSwordTriggerBeheadedSkill)]: cd 1; ngồi vận sức SkillKickDelay 0,25 s,
  // cả chiêu SkillDuration 0,5 s; đòn đá SkillBaseDamage 5; quái bị đá văng (kickEnemyForce 80, ma sát 0,92 mỗi bước 0,02 s),
  // trúng tường hay quái khác thì nhận kickHitDamage 30 (bạo kích 10%); quái không đá được (trùm) nhận đòn ×cantKickEnemyDamageFactor 4.
  // Nhảy lên đá không nhận sát thương [ĐO info].
  const C = (f, d) => K.CTRL('beheaded', f, d), MBK = (f, d) => K.MB('sword_skill_beheaded', 'RGSwordTriggerBeheadedSkill', f, d);
  const KICK = {
    delay: C('SkillKickDelay', 0.25), dur: C('SkillDuration', 0.5), dmg: C('SkillBaseDamage', 5), crit: C('SkillCritical', 10),
    reach: C('SkillRangeBase', 1.5) * T,
    hitDmg: MBK('kickHitDamage', 30), hitCrit: MBK('kickHitCritic', 10), fric: MBK('kickFriction', 0.92), factor: MBK('cantKickEnemyDamageFactor', 4),
    hop: 4 * T, seek: 9 * T,   // nhảy tới, tầm tìm quái [ƯỚC LƯỢNG: lực nhảy 40 và ma sát 0,95 không quy được ra ô]
    v0: MBK('kickEnemyForce', 80) * 0.5 * T   // tốc độ văng đầu, px/s: 80 lực → 40 ô/s, bay ~10 ô [ƯỚC LƯỢNG]
  };
  const STEP = 0.02;   // bước vật lý Unity, ma sát tính mỗi bước

  S.spartan_sandals = {
    start(G, p) {
      K.layer(G);
      p.skillT = KICK.dur;
      const { e, ang } = K.targetAng(G, p, KICK.seek);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      const dist = e ? Math.max(0, Math.min(KICK.hop, Math.hypot(K.ec(e)[0] - p.x, K.ec(e)[1] - p.y) - 1.2 * T)) : KICK.hop * 0.5;
      p._kick = { ang, t: 0, dist, moved: 0, done: false, x0: p.x, y0: p.y };
      K.hurtMods(p).kick = () => 0;
    },
    update(G, p, dt) {
      const s = p._kick; if (!s) return;
      s.t += dt;
      // Nhảy tới trong lúc vận sức (0,25 s), cánh tay nâng người theo vòng cung.
      if (s.t <= KICK.delay && s.moved < s.dist) {
        const st = Math.min(s.dist - s.moved, s.dist / KICK.delay * dt);
        SK.moveBox(G.map, p, Math.cos(s.ang) * st, Math.sin(s.ang) * st, p.h.body.r);
        s.moved += st;
      }
      p._liftY = 7 * Math.sin(Math.PI * Math.min(1, s.t / KICK.dur));
      if (!s.done && s.t >= KICK.delay) { s.done = true; strike(G, p, s); }
    },
    end(G, p) { p._kick = null; p._liftY = 0; delete K.hurtMods(p).kick; }
  };

  // Đòn đá: mọi quái trong vòng SkillRangeBase trước mặt.
  function strike(G, p, s) {
    const cx = p.x + Math.cos(s.ang) * T, cy = p.y - 6 + Math.sin(s.ang) * T;
    for (const e of K.inRadius(G, cx, cy, KICK.reach)) {
      const kickable = !e.boss && !(e.p && e.p.kinematic);
      K.hit(G, p, e, kickable ? KICK.dmg : KICK.dmg * KICK.factor, { critChance: KICK.crit, ang: s.ang, tag: 'kick', fx: 'hit_beheaded_skill', noMul: true });
      if (kickable && e.hp > 0) fly(G, p, e, s.ang);
    }
    G.shake = Math.max(G.shake, 2);
  }

  // Quái bị đá bay thẳng, chậm dần theo ma sát; chạm tường hoặc quái khác thì cả hai nhận kickHitDamage rồi dừng.
  function fly(G, p, e, ang) {
    const st = { v: KICK.v0, hit: false };
    const fxh = K.hasVfx('bullet_skill_beheaded') ? K.fx(G, 'bullet_skill_beheaded', e.x, e.y - 8, { follow: e, dy: -8, dur: 0.6 }) : null;
    G.props.push({
      x: e.x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt;
        if (!K.alive(e)) { q.gone = true; K.stopFx(fxh); return; }
        e.st = 'stun'; e.stT = 0.4; e._stunT = 0.4;   // AI đứng yên khi đang bay
        const step = st.v * dt;
        const blocked = SK.moveBox(G2.map, e, Math.cos(ang) * step, Math.sin(ang) * step, e.r);
        let other = null;
        for (const o of G2.enemies) {
          if (o === e || !K.alive(o)) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) < e.r + o.r) { other = o; break; }
        }
        st.v *= Math.pow(KICK.fric, dt / STEP);
        if (blocked || other || st.v < 12) {
          q.gone = true; K.stopFx(fxh);
          e.stT = 0.5; e._stunT = 0.5;
          if (blocked || other) {
            K.hit(G2, p, e, KICK.hitDmg, { critChance: KICK.hitCrit, ang, tag: 'kick_hit', fx: 'hit_beheaded_skill_yellow', noMul: true });
            if (other) K.hit(G2, p, other, KICK.hitDmg, { critChance: KICK.hitCrit, ang, tag: 'kick_hit', fx: 'hit_beheaded_skill_yellow', noMul: true, repel: 3 });
            G2.shake = Math.max(G2.shake, 3);
          }
        }
      }
    });
  }
  S.spartan_sandals.KICK = KICK;
})();
