// Kỹ năng Kẻ Bị Chặt Đầu (c19): spartan_sandals. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE;

  // Cú Đá Spartan [ĐO c19Controller = C20Controller.RoleSkill/Kick + prefab sword_skill_beheaded / bullet_skill_beheaded trong bullet.ab].
  // cd 1 [config]. Lúc bấm (RoleSkill): ẩn vũ khí (p.noFire), lùi SkillBackForce 5 rồi Invoke("Kick", SkillKickDelay 0,25) và
  // Invoke("RoleSkillEnd", SkillDuration 0,5). Lúc đá (Kick): sinh sword_skill_beheaded tại vị trí người lùi 0,2 ô, cao 1,2 ô,
  // cỡ SkillRangeBase 1,5 (cấp 0; port không có cấp kỹ năng), sát thương SkillBaseDamage 5, bạo kích SkillCritical 10; người lao tới
  // SkillForwardForce 40. Vùng đá = PolygonCollider2D của prefab (đa giác đo được bên dưới, nút b lệch 0,8 ô, nhân cỡ 1,5).
  // GetForce(dir, lực) đặt vận tốc = lực đơn vị/s rồi mỗi bước vật lý 0,02 s nhân với ma sát [RGBaseController.GetForce,
  // RGController.SetVelocity: inertial_vel *= min(friction, 1)]; ma sát mặc định của nhân vật 0,8 [RGBaseController..ctor].
  // Quái bị đá: lực kickEnemyForce 80, ma sát kickFriction 0,92 (cùng công thức), bay tối đa 0,5 s [bullet_skill_beheaded
  // Bullet01.destroy_time], hộp trúng 1,2 ô; trúng tường hoặc quái khác thì nhận kickHitDamage 30 (bạo kích kickHitCritic 10);
  // quái không đá được (trùm) nhận đòn ×cantKickEnemyDamageFactor 4 [RGSwordTriggerBeheadedSkill].
  // Nhảy lên đá không nhận sát thương [info]. Chưa làm: lực dội cantKickForce 30 / canKickForce 3 lên người đá (mã OnHit chưa
  // đọc hết cách áp), cấp kỹ năng (SkillDamageLevelRatio, SkillRangeLevelRatio, lửa) và HideOwlTime 3 (cú đá thường của Cú Mèo).
  const C = (f, d) => K.CTRL('beheaded', f, d), MBK = (f, d) => K.MB('sword_skill_beheaded', 'RGSwordTriggerBeheadedSkill', f, d);
  const KICK = {
    delay: C('SkillKickDelay', 0.25), dur: C('SkillDuration', 0.5), dmg: C('SkillBaseDamage', 5), crit: C('SkillCritical', 10),
    back: C('SkillBackForce', 5), forward: C('SkillForwardForce', 40), size: C('SkillRangeBase', 1.5),
    hitDmg: MBK('kickHitDamage', 30), hitCrit: MBK('kickHitCritic', 10), fric: MBK('kickFriction', 0.92), factor: MBK('cantKickEnemyDamageFactor', 4),
    force: MBK('kickEnemyForce', 80), fly: 0.5, box: 0.6 * T, selfFric: 0.8,
    origin: [-0.2 * T, -1.2 * T],   // lệch so với người theo hướng quay mặt: lùi 0,2 ô, cao 1,2 ô
    poly: [[2.15, 1.0268], [-0.5407, 1.2946], [-0.5356, -1.4462], [1.9, -1.2375], [2.22, -0.6473], [2.31, 0.4791]], nodeX: 0.8
  };
  const STEP = 0.02;   // bước vật lý Unity, ma sát tính mỗi bước

  const inPoly = (poly, x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const distSeg = (x, y, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  };
  // Đa giác vùng đá đổi ra toạ độ thế giới (px): xoay theo hướng đá, nhân cỡ, đặt tại gốc đá.
  function kickPoly(ox, oy, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), k = KICK.size * T;
    return KICK.poly.map(([px, py]) => { const u = (KICK.nodeX + px) * k, v = py * k; return [ox + u * c - v * s, oy + u * s + v * c]; });
  }

  S.spartan_sandals = {
    start(G, p) {
      K.layer(G);
      p.skillT = KICK.dur;
      p.noFire = true;
      const ang = p.aim != null ? p.aim : K.aimDir(p);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      p._kick = { ang, t: 0, done: false, v: KICK.back * T, dir: ang + Math.PI, acc: 0 };
      K.hurtMods(p).kick = () => 0;
    },
    update(G, p, dt) {
      const s = p._kick; if (!s) return;
      s.t += dt;
      if (!s.done && s.t >= KICK.delay) { s.done = true; strike(G, p, s); s.v = KICK.forward * T; s.dir = s.ang; s.acc = 0; }
      // Vận tốc GetForce: mỗi bước 0,02 s đi v × 0,02 rồi ma sát 0,8.
      s.acc += dt;
      while (s.acc >= STEP) {
        s.acc -= STEP;
        SK.moveBox(G.map, p, Math.cos(s.dir) * s.v * STEP, Math.sin(s.dir) * s.v * STEP, p.h.body.r);
        s.v *= KICK.selfFric;
      }
      p._liftY = 7 * Math.sin(Math.PI * Math.min(1, s.t / KICK.dur));
    },
    end(G, p) { p._kick = null; p._liftY = 0; p.noFire = false; delete K.hurtMods(p).kick; }
  };

  // Đòn đá: quái nằm trong đa giác của prefab.
  function strike(G, p, s) {
    const ox = p.x + (p.face > 0 ? 1 : -1) * KICK.origin[0], oy = p.y + KICK.origin[1], poly = kickPoly(ox, oy, s.ang);
    for (const e of G.enemies) {
      if (!K.alive(e)) continue;
      const [cx, cy] = K.ec(e);
      if (!inPoly(poly, cx, cy) && !poly.some((a, i) => distSeg(cx, cy, a, poly[(i + 1) % poly.length]) < e.r * 0.5)) continue;
      const kickable = !e.bossKey && !(e.p && e.p.kinematic);
      K.hit(G, p, e, kickable ? KICK.dmg : KICK.dmg * KICK.factor, { critChance: KICK.crit, ang: s.ang, tag: 'kick', fx: 'hit_beheaded_skill', noMul: true });
      if (kickable && e.hp > 0) fly(G, p, e, s.ang);
    }
    G.shake = Math.max(G.shake, 2);
  }

  // Quái bị đá thành đạn bay: vận tốc kickEnemyForce, mỗi bước 0,02 s nhân kickFriction, sống tối đa 0,5 s; chạm tường hoặc quái
  // khác thì cả hai nhận kickHitDamage rồi dừng.
  function fly(G, p, e, ang) {
    const st = { v: KICK.force * T, acc: 0, t: 0 };
    const fxh = K.hasVfx('bullet_skill_beheaded') ? K.fx(G, 'bullet_skill_beheaded', e.x, e.y - 8, { follow: e, dy: -8, dur: KICK.fly }) : null;
    e._kf = 1;
    G.props.push({
      x: e.x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        st.t += dt; st.acc += dt;
        if (!K.alive(e)) { q.gone = true; e._kf = 0; K.stopFx(fxh); return; }
        e.st = 'stun'; e.stT = 0.4; e._stunT = 0.4;   // AI đứng yên khi đang bay
        let blocked = false, other = null;
        while (st.acc >= STEP && !blocked && !other) {
          st.acc -= STEP;
          blocked = SK.moveBox(G2.map, e, Math.cos(ang) * st.v * STEP, Math.sin(ang) * st.v * STEP, e.r);
          st.v *= KICK.fric;
          for (const o of G2.enemies) {
            if (o === e || !K.alive(o)) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < KICK.box + o.r) { other = o; break; }
          }
        }
        if (blocked || other || st.t >= KICK.fly) {
          q.gone = true; e._kf = 0; K.stopFx(fxh);
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
