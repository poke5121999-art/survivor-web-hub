// Kỹ năng Mục Sư (c10): moon_shadow. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, R = SK.DS.rules;
  const { fx, stopFx, hit, alive, ec, allies, layer, timers } = K;

  // Khí Tức Bóng Trăng [ĐO c10/skill 3: cd 10, bấm là hồi chiêu ngay; C11Controller.skill3MoonShadowConfig; bullet_shadow_ball /
  // bullet_light_ball: BulletShadowBall speed 10, needSurround 1; buff_easily_injured: buff_time 3]: hai hình thái Bóng Đen / Ánh Trăng,
  // mỗi hình thái tự sinh Pháp Cầu bay quanh người; bấm kỹ năng thì xoá cầu cũ và đổi hình thái, năng lượng tích được đổi thành cầu thêm.
  const DEF = {
    shadowStorageLimit: 4, moonStorageLimit: 4, shadowExtraStorageLimit: 6, moonExtraStorageLimit: 6, shadowCreateInterval: 1, moonCreateInterval: 2,
    unfoldDelay: 0.35, switchVolleyDelay: 0.1, switchStoredBallShrinkDuration: 0.2, moonHealValue: 1, moonDangerThreshold: 0.5, moonSelfHealFlyDuration: 0.45,
    moonSelfHealFlyOutDistance: 1.2, moonAttackDamageFactor: 0.6667, moonHealReserveCount: 3, shadowDamage: 12, ballCritic: 50, shadowRetargetLimit: 2,
    shadowToMoonRatio: 10, moonToShadowRatio: 6, orbitCapacityPerRing: 6, orbitFirstRadius: 1, orbitRingSpacing: 0.8, orbitBaseRotateSpeed: 300
  };
  const MS = () => Object.assign({}, DEF, K.CTRL('priest', 'skill3MoonShadowConfig', {}));
  const SPEED = 10 * U, TURN = 12, RANGE = 12 * U;   // tốc cầu [ĐO BulletShadowBall.speed 10], tầm dò 12 ô [WIKI]; tốc bẻ lái [ƯỚC LƯỢNG]
  const VULN = { t: 3, k: 0.5 };                      // Dễ Tổn Thương: buff_time 3 [ĐO BuffEasilyInjured], +50% sát thương nhận [WIKI]
  const ALLY_HEAL = 4, MOUNT_HEAL = 1, STAGGER = 0.12;   // hồi cho thú/đồng đội, mỗi phát cách nhau [WIKI / ƯỚC LƯỢNG]

  const mine = p => p.hero === 'priest' && p.h.skill && p.h.skill.id === 'moon_shadow';
  const state = p => p._ms || (p._ms = { shadow: true, orbs: [], gen: 0, sh: 0, mo: 0, spin: 0, fireT: 0 });   // hình thái đầu: Bóng Đen [ƯỚC LƯỢNG]
  const held = s => s.orbs.filter(o => o.st === 'orbit');

  function spawnOrb(G, p, s, kind, batch, C) {
    const o = { kind, st: 'orbit', x: p.x, y: p.y - 8, t: 0, ready: C.unfoldDelay + (batch ? C.switchVolleyDelay : 0), batch, tries: 0 };
    o.h = fx(G, kind === 'shadow' ? 'bullet_shadow_ball' : 'bullet_light_ball', o.x, o.y, { follow: o, dur: 60 });
    s.orbs.push(o);
    return o;
  }
  function removeOrb(o) { o.gone = true; stopFx(o.h); o.dead = true; }

  // Cầu hồi máu: người chơi hồi máu trước rồi tới giáp; thú/đồng đội theo a.hp. Trả nguy cấp của mục tiêu hồi (0 = không ai cần).
  function healTarget(G, p) {
    let best = null, bd = 0;
    if (p.hp < p.hpMax || p.armor < p.armorMax) { bd = p.hp < p.hpMax ? 1 - p.hp / p.hpMax : 0.01; best = p; }
    for (const a of allies(G)) if (!a.gone && a.hp != null && a.hp < a.hpMax) { const d = 1 - a.hp / a.hpMax; if (d > bd) { bd = d; best = a; } }
    return best ? { t: best, danger: bd } : null;
  }
  function heal(G, p, s, o, C) {
    const t = o.tgt;
    if (t === p) {
      if (p.hp < p.hpMax) K.heal(G, p, C.moonHealValue); else if (p.armor < p.armorMax) p.armor = Math.min(p.armorMax, p.armor + C.moonHealValue);
    } else if (!t.gone) {
      t.hp = Math.min(t.hpMax, t.hp + (t.mount ? MOUNT_HEAL : ALLY_HEAL));
      if (t.down && t.hp >= t.hpMax) t.down = false;
    }
    fx(G, 'hit_white', t.x, (t === p ? p.y - 8 : t.y - 6), {});
    s.mo += 1 + (o.danger >= C.moonDangerThreshold ? 1 : 0);   // mỗi cầu hồi +1 năng lượng, +1 nữa nếu mục tiêu đang nguy [ĐO moonDangerThreshold]
    removeOrb(o);
  }
  function strike(G, p, s, o, e, C) {
    const crit = SK.rand() * 100 < C.ballCritic;
    const dmg = C.shadowDamage * (o.kind === 'moon' ? C.moonAttackDamageFactor : 1);
    hit(G, p, e, dmg, { crit, repel: 1, fx: o.kind === 'shadow' ? 'hit_black' : 'hit_white', tag: 'skill' });
    if (o.kind === 'shadow') {
      s.sh += crit ? 3 : 1;   // mỗi cầu trúng +1 năng lượng bóng, chí mạng +3 [WIKI]
      if (!(e._vuln > 0)) e._vfx = fx(G, 'buff_easily_injured', e.x, e.y, { follow: e, dy: -(e.hb.off[1] + e.hb.size[1] / 2) * e.scale - 4, dur: VULN.t });
      e._vuln = VULN.t;
    }
    removeOrb(o);
  }
  function pickEnemy(G, p, x, y) { return K.nearest(G, x, y, RANGE, {}); }   // tầm nhìn không cần thông: cầu xuyên tường [WIKI]

  function tick(G, p, dt) {
    if (!mine(p)) { if (p._ms) { p._ms.orbs.forEach(removeOrb); p._ms = null; } return; }
    if (p.st === 'dead') return;
    const s = state(p), C = MS();
    s.spin += C.orbitBaseRotateSpeed * Math.PI / 180 * dt;
    s.fireT -= dt;
    s.orbs = s.orbs.filter(o => !o.dead);
    // Sinh cầu tự nhiên tới hạn lưu trữ.
    const lim = s.shadow ? C.shadowStorageLimit : C.moonStorageLimit, kind = s.shadow ? 'shadow' : 'moon';
    if (held(s).length < lim) {
      s.gen += dt;
      if (s.gen >= (s.shadow ? C.shadowCreateInterval : C.moonCreateInterval)) { s.gen = 0; spawnOrb(G, p, s, kind, false, C); }
    } else s.gen = 0;
    // Xếp vị trí các cầu đang quay quanh người.
    const hs = held(s);
    hs.forEach((o, i) => {
      const ring = Math.floor(i / C.orbitCapacityPerRing), n = Math.min(C.orbitCapacityPerRing, hs.length - ring * C.orbitCapacityPerRing);
      const r = (C.orbitFirstRadius + ring * C.orbitRingSpacing) * U * Math.min(1, o.t / C.unfoldDelay);
      const a = s.spin * (ring % 2 ? -1 : 1) + Math.PI * 2 * (i % C.orbitCapacityPerRing) / n;
      o.x = p.x + Math.cos(a) * r; o.y = p.y - 8 + Math.sin(a) * r * 0.75;
    });
    for (const o of s.orbs) {
      o.t += dt;
      if (o.st === 'shrink') {   // đổi hình thái: cầu cũ co vào người
        const k = Math.min(1, o.t / C.switchStoredBallShrinkDuration);
        o.x += (p.x - o.x) * Math.min(1, dt * 14 * k + 0.05); o.y += (p.y - 8 - o.y) * Math.min(1, dt * 14 * k + 0.05);
        if (o.t >= C.switchStoredBallShrinkDuration) removeOrb(o);
      } else if (o.st === 'fly') {
        let e = o.tgt;
        if (!e || !alive(e)) {
          if (o.tries++ >= C.shadowRetargetLimit) { removeOrb(o); continue; }
          e = o.tgt = pickEnemy(G, p, o.x, o.y);
          if (!e) { removeOrb(o); continue; }
        }
        const [cx, cy] = ec(e), want = Math.atan2(cy - o.y, cx - o.x);
        let d = want - o.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
        o.ang += Math.max(-TURN * dt, Math.min(TURN * dt, d));
        o.x += Math.cos(o.ang) * SPEED * dt; o.y += Math.sin(o.ang) * SPEED * dt;
        if (Math.hypot(cx - o.x, cy - o.y) < e.r + 4) strike(G, p, s, o, e, C);
        else if (o.t > 6) removeOrb(o);
      } else if (o.st === 'heal') {
        const t = o.tgt;
        if (t !== p) {
          if (t.gone) { removeOrb(o); continue; }
          const ty = t.y - 6, d = Math.hypot(t.x - o.x, ty - o.y);
          if (d < 5) heal(G, p, s, o, C);
          else { o.x += (t.x - o.x) / d * SPEED * dt; o.y += (ty - o.y) / d * SPEED * dt; }
        } else {
          // Tự hồi: bay ra ngoài rồi bay lại vào người trong moonSelfHealFlyDuration.
          const k = o.t / C.moonSelfHealFlyDuration, out = C.moonSelfHealFlyOutDistance * U;
          if (k >= 1) { heal(G, p, s, o, C); continue; }
          const f = k < 0.5 ? k * 2 : 2 - k * 2;
          o.x = p.x + (o.ox - p.x) * (1 - k) + Math.cos(o.oa) * out * f; o.y = p.y - 8 + (o.oy - p.y + 8) * (1 - k) + Math.sin(o.oa) * out * f;
        }
      }
    }
    // Phóng / hồi máu: cầu đã bung xong; đợt đổi hình thái bắn cùng lúc, cầu tự sinh cách nhau STAGGER giây.
    for (const o of hs) {
      if (o.t < o.ready || o.dead) continue;
      if (!o.batch && s.fireT > 0) break;
      if (o.kind === 'shadow') {
        const e = pickEnemy(G, p, p.x, p.y - 8);
        if (!e) continue;
        Object.assign(o, { st: 'fly', tgt: e, t: 0, ang: Math.atan2(ec(e)[1] - o.y, ec(e)[0] - o.x) });
      } else {
        const h = healTarget(G, p);
        if (h) { Object.assign(o, { st: 'heal', tgt: h.t, danger: h.danger, t: 0, ox: o.x, oy: o.y, oa: Math.atan2(o.y - (p.y - 8), o.x - p.x) }); }
        else if (hs.length > C.moonHealReserveCount) {   // luôn giữ 3 cầu dự trữ để hồi máu, dư mới đánh [WIKI]
          const e = pickEnemy(G, p, p.x, p.y - 8);
          if (!e) continue;
          Object.assign(o, { st: 'fly', tgt: e, t: 0, ang: Math.atan2(ec(e)[1] - o.y, ec(e)[0] - o.x) });
        } else continue;
      }
      s.fireT = STAGGER;
    }
    // Dễ Tổn Thương hết hạn.
    for (const e of G.enemies) if (e._vuln > 0) { e._vuln -= dt; if (e._vuln <= 0) stopFx(e._vfx); }
  }
  timers.moon_shadow = tick;

  S.moon_shadow = {
    start(G, p) {
      layer(G);
      const s = state(p), C = MS();
      const toMoon = s.shadow;
      const energy = toMoon ? s.sh : s.mo, ratio = toMoon ? C.shadowToMoonRatio : C.moonToShadowRatio;
      const extra = Math.min(toMoon ? C.moonExtraStorageLimit : C.shadowExtraStorageLimit, Math.floor(energy / ratio));
      for (const o of s.orbs) { o.st = 'shrink'; o.t = 0; }
      s.shadow = !toMoon; s.sh = s.mo = 0; s.gen = 0;
      const kind = s.shadow ? 'shadow' : 'moon', n = (s.shadow ? C.shadowStorageLimit : C.moonStorageLimit) + extra;
      for (let i = 0; i < n; i++) spawnOrb(G, p, s, kind, true, C);
      s.extra = extra;
    }
  };
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p && p._ms) { p._ms.orbs.forEach(removeOrb); p._ms = null; } });

  // Dễ Tổn Thương: nhận thêm 50% mọi sát thương (đòn phụ không tự cộng dồn).
  SK.on('enemyHit', (G, e, dmg) => {
    if (!(e._vuln > 0) || G._vulnHit) return;
    G._vulnHit = true;
    SK.hurtEnemy(G, e, Math.max(1, Math.round(dmg * VULN.k)), false, 0, 0);
    G._vulnHit = false;
  });

  // Số cầu đang giữ trên nút kỹ năng: tím ở hình thái bóng, vàng ở hình thái trăng.
  SK.on('hud', (ctx, G) => {
    const p = G.player, s = p && p._ms;
    if (!s || !mine(p) || G.state !== 'stage') return;
    const v = SK.view, cx = v.w - 16, cy = v.h - 17;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 14, cy + 5, 9, 8);
    SK.text(ctx, String(held(s).length), cx - 9.5, cy + 9, 8, s.shadow ? '#b06bff' : '#ffe06a', 'center', '#000');
  });
})();
