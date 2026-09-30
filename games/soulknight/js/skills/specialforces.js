// Kỹ năng Đội Kỵ Sĩ Đặc Biệt (c21): special_operation. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Ba Kỵ Sĩ (Đỏ / Xanh / Lục) luân phiên; mỗi Kỵ Sĩ có kỹ năng riêng và hồi chiêu riêng. Web chỉ có một phím K nên gộp hai nút của bản gốc:
// K = tung kỹ năng của Kỵ Sĩ đang ra trận nếu nó sẵn sàng, không thì rút lui gọi Kỵ Sĩ kế tiếp (tốn một lượt, cd 9, tối đa 2 lượt).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, R = SK.DS.rules, I = SK.input;
  const { fx, hit, alive, ec, inRadius, setMul, layer, timers, charges, aimDir, glow } = K;
  const ID = 'special_operation';

  // [ĐO C22Controller..ctor (đọc mã ARM, hồ sơ trong hằng số nhóm) + prefab c21] đơn vị Unity = 1 U = 16 px
  const NORMAL_CD = [4, 15, 10];   // redNormalSkillCooldown / blueNormalSkillCooldown / greenNormalSkillCooldown (prefab c21)
  const RED = {
    dash: 6 * U, dashT: 0.18,                      // redNormalDashDistance / redNormalDashDuration
    knives: 4, search: 13 * U, spread: 20, speed: 18 * U, dmg: 4, repel: 2,   // redNormalKnife{Count,SearchRadius,Angle,Speed,Damage,Repel}
    markT: 6, slash: 16, slashGap: 0.3                // SpecialForcesRedKnifeMarkBuff.buff_time 6; redKnifeMarkSlashDamage 16; nhịp trảm [ƯỚC LƯỢNG]
  };
  const BLUE = {
    start: 5, perHit: 3, dmg: 4, r: 2.25 * U, rMax: 2.75, dmgMax: 2,   // blueSkillStartMeteorCount / AttackMeteorCount / BaseDamage / BaseRadius / MaxRadiusFactor / MaxDamageFactor
    dur: 5, durMax: 10, kill: 0.5, minGap: 0.25, fullGap: 2, delay: 0.5,  // blueSkillDuration / MaxDuration / KillExtend / MeteorMinInterval / FullPowerInterval; blue_extra_blue tạo nổ ở 0,5 s
    startGap: 0.1, search: 13 * U                    // blueDebutInterval; blueSkillMeteorSearchRadius
  };
  const GREEN = { dur: 2, move: 1.5, rate: 1.3 };    // greenNormalSkillDuration 2; greenNormalSkillSpeedRate 0,5; ...AttackSpeedAddition 30 (%) [ƯỚC LƯỢNG đơn vị %]
  const RING = [[1, 0.25, 0.25, 1], [0.3, 0.55, 1, 1], [0.35, 1, 0.45, 1]];   // màu vòng dưới chân từng Kỵ Sĩ (web chỉ có một bộ sprite)
  const FX_IN = ['c21_debut_red', 'c21_debut_blue', 'c21_debut_green'];

  const st = p => p._spf || (p._spf = { av: Math.floor(SK.rand() * 3), cd: [0, 0, 0], blueT: 0, blueLast: -9, greenT: 0, dash: null, hitAt: new Map() });
  const ready = p => st(p).cd[st(p).av] <= 0;

  // ---------------------------------------------------------------- Kỵ Sĩ Đỏ: lao tới, ném 4 dao găm; dao đánh dấu quái
  function castRed(G, p) {
    const s = st(p), ang = aimDir(p);
    s.dash = { ang, t: 0 };
    if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
    fx(G, 'c21_debut_red_slash', p.x, p.y - 8, { ang, scale: 0.8 });
  }
  function throwKnives(G, p, ang) {
    const targets = [];
    for (const e of G.enemies) if (alive(e) && K.inRoom(G, e)) { const [cx, cy] = ec(e), d = Math.hypot(cx - p.x, cy - (p.y - 6)); if (d < RED.search) targets.push([d, e]); }
    targets.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < RED.knives; i++) {
      const t = targets[i] && targets[i][1];
      // Đủ mục tiêu thì mỗi dao một con; thiếu thì dao còn lại bay theo hướng lao lệch ngẫu nhiên trong ±góc quạt.
      const a = t ? Math.atan2(ec(t)[1] - (p.y - 6), ec(t)[0] - p.x) : ang + SK.deg(SK.randf(-RED.spread, RED.spread));
      knife(G, p, p.x, p.y - 6, a);
    }
  }
  function knife(G, p, x, y, ang) {
    const k = { x, y, ang, t: 0 }, life = 2;
    k.h = fx(G, 'red_sword', x, y, { follow: k, ang, dur: life });
    G.props.push({ x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        k.t += dt;
        k.x += Math.cos(ang) * RED.speed * dt; k.y += Math.sin(ang) * RED.speed * dt;
        let done = k.t >= life || SK.world.solidAt(G2.map, k.x, k.y);
        if (!done) for (const e of G2.enemies) {
          if (!alive(e) || !K.inRoom(G2, e)) continue;
          const [cx, cy] = ec(e);
          if (Math.hypot(cx - k.x, cy - k.y) < e.r + 4) {
            hit(G2, p, e, RED.dmg, { repel: RED.repel, tag: 'sf_knife', fx: 'c21_debut_red_slash_hit' });
            e._sfMark = RED.markT; done = true; break;
          }
        }
        if (done) { const h = k.h; q.gone = true; k.x = k.y = 1e9; if (h && h.stop) h.stop(); }
      } });
  }
  // Quái mang dấu nhận sát thương: Bạo Kích chắc chắn (phần chênh so với đòn thường) + một nhát Trảm Kích 16 [ĐO]. Bản chết thì dao mới bay sang quái khác.
  SK.on('enemyHit', (G, e, dmg, crit) => {
    const p = G.player;
    if (!p || p.hero !== 'specialforces' || !(e._sfMark > 0) || /^sf_/.test(G._skHit || '')) return;
    const s = st(p);
    if ((s.hitAt.get(e) || 0) > G.t) return;
    s.hitAt.set(e, G.t + RED.slashGap);
    if (!crit) hit(G, p, e, Math.round(dmg * (R.critMult - 1)), { noMul: true, tag: 'sf_crit', ang: 0 });
    if (alive(e)) hit(G, p, e, RED.slash, { noMul: true, tag: 'sf_slash', fx: 'c21_debut_red_slash_hit' });
  });
  SK.on('enemyKill', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'specialforces') return;
    const s = st(p);
    if (e._sfMark > 0) {
      const t = K.nearest(G, e.x, e.y, RED.search, { skip: q => q === e });
      if (t) knife(G, p, ec(e)[0], ec(e)[1], Math.atan2(ec(t)[1] - ec(e)[1], ec(t)[0] - ec(e)[0]));
    }
    if (s.blueT > 0) s.blueT = Math.min(BLUE.durMax, s.blueT + BLUE.kill);
  });

  // ---------------------------------------------------------------- Kỵ Sĩ Xanh: mỗi đòn đánh trúng gọi sao băng; giữ trạng thái khi đã rút lui
  function meteor(G, p, x, y, rf, df) {
    fx(G, 'blue_extra_blue', x, y, { layer: 'ground' });
    G.props.push({ x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt;
        if (q.t < BLUE.delay) return;
        q.gone = true;
        for (const e of inRadius(G2, x, y, BLUE.r * rf)) hit(G2, p, e, BLUE.dmg * df, { tag: 'sf_meteor', repel: 1 });
      } });
  }
  function castBlue(G, p) {
    const s = st(p);
    s.blueT = Math.min(BLUE.durMax, Math.max(s.blueT, 0) + BLUE.dur);
    s.blueLast = G.t;
    fx(G, 'blue_effect', p.x, p.y - 4, { follow: p, dy: -4, dur: 1 });
    const targets = G.enemies.filter(e => alive(e) && K.inRoom(G, e) && Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y) < BLUE.search)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (let i = 0; i < BLUE.start; i++) {
      const e = targets.length ? targets[i % targets.length] : null;
      const x = e ? ec(e)[0] : p.x + SK.randf(-3, 3) * U, y = e ? ec(e)[1] : p.y + SK.randf(-3, 3) * U;
      G.props.push({ x, y: 1e9, t: 0, draw() {}, update(G2, q, dt) { q.t += dt; if (q.t >= i * BLUE.startGap) { q.gone = true; meteor(G2, p, x, y, 1, 1); } } });
    }
  }
  // TryTriggerBlueAttackMeteor [ĐO đọc ARM]: cách nhát trước ≥ 0,25 s; hệ số bán kính / sát thương nội suy từ 1 tới rMax / dmgMax khi nghỉ 0,25 → 2 s.
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'specialforces' || G._skHit) return;
    const s = st(p);
    if (!(s.blueT > 0)) return;
    const gap = G.t - s.blueLast;
    if (gap < BLUE.minGap) return;
    const k = Math.max(0, Math.min(1, (gap - BLUE.minGap) / (BLUE.fullGap - BLUE.minGap)));
    s.blueLast = G.t;
    const [cx, cy] = ec(e), rf = 1 + (BLUE.rMax - 1) * k, df = 1 + (BLUE.dmgMax - 1) * k;
    for (let i = 0; i < BLUE.perHit; i++) meteor(G, p, cx + SK.randf(-1, 1) * U * (i ? 1 : 0), cy + SK.randf(-1, 1) * U * (i ? 1 : 0), rf, df);
  });

  // ---------------------------------------------------------------- Kỵ Sĩ Lục: đu dây xả đạn, tăng tốc đánh và tốc chạy (chưa có: bỏ qua vật cản)
  function castGreen(G, p) {
    const s = st(p);
    s.greenT = GREEN.dur;
    setMul(p, 'moveMul', 'sf_green', GREEN.move); setMul(p, 'rateMul', 'sf_green', GREEN.rate);
    fx(G, 'green_skill_0_weapon', p.x, p.y - 8, { follow: p, dy: -8, dur: GREEN.dur });
  }

  // ---------------------------------------------------------------- chuyển Kỵ Sĩ
  function switchTo(G, p) {
    const s = st(p);
    fx(G, 'change_effect', p.x, p.y - 8, { follow: p, dy: -8, dur: 0.6 });
    s.av = (s.av + 1) % 3;
    fx(G, FX_IN[s.av], p.x, p.y - 4, { dur: 0.8 });
    G.toast(['Kỵ Sĩ Đỏ', 'Kỵ Sĩ Xanh', 'Kỵ Sĩ Lục'][s.av]);
  }
  function cast(G, p) {
    const s = st(p);
    s.cd[s.av] = NORMAL_CD[s.av];
    [castRed, castBlue, castGreen][s.av](G, p);
  }
  // Nhịp giữa hai lần bấm / hồi lượt chung, như useCharge của skills.js nhưng không trừ lượt.
  function gap(p) { const ch = charges(p, ID); p._cdAfter = ch.n > 0 ? 0.25 : ch.cd - ch.t; }

  S[ID] = {
    start(G, p) {
      layer(G);
      const ch = charges(p, ID);
      if (ready(p)) { cast(G, p); gap(p); return; }
      if (ch.n <= 0) { p._cdAfter = ch.cd - ch.t; return; }
      ch.n--; p._cdAfter = ch.n > 0 ? 0.25 : ch.cd - ch.t;
      switchTo(G, p);
    },
    // Hết lượt rút lui (cd đang chạy) mà Kỵ Sĩ hiện tại sẵn sàng vẫn tung được kỹ năng.
    pressCd(G, p) { if (ready(p) && p.st !== 'dead') { cast(G, p); } }
  };

  timers.specialforces = (G, p, dt) => {
    if (p.hero !== 'specialforces') return;
    const s = st(p);
    for (let i = 0; i < 3; i++) if (s.cd[i] > 0) s.cd[i] = Math.max(0, s.cd[i] - dt);
    if (s.blueT > 0) s.blueT = Math.max(0, s.blueT - dt);
    if (s.greenT > 0) { s.greenT -= dt; if (s.greenT <= 0) { setMul(p, 'moveMul', 'sf_green', 1); setMul(p, 'rateMul', 'sf_green', 1); } }
    for (const e of G.enemies) if (e._sfMark > 0) e._sfMark -= dt;
    const d = s.dash;
    if (d) {
      d.t += dt;
      // Huỷ phần đi bộ của lượt này để cú lao giữ đúng hướng.
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt, v = RED.dash / RED.dashT * dt;
      SK.moveBox(G.map, p, Math.cos(d.ang) * v - mv.x * walkPx, Math.sin(d.ang) * v - mv.y * walkPx, p.h.body.r);
      if (d.t >= RED.dashT) { s.dash = null; throwKnives(G, p, d.ang); }
    }
  };
  // Vòng màu dưới chân theo Kỵ Sĩ hiện tại + dấu dao găm trên đầu quái bị đánh dấu.
  const drawLayer = {
    x: 0, y: 1e9 + 2, t: 0,
    update(G, q, dt) { q.t += dt; },
    draw(ctx, G) {
      const p = G.player, s = p && st(p);
      if (!p || p.hero !== 'specialforces') return;
      glow(ctx, p.x, p.y - 1, 11, RING[s.av], 0.7);
      for (const e of G.enemies) if (e._sfMark > 0 && alive(e)) glow(ctx, ec(e)[0], K.enemyTop(e) - 5, 6, [1, 0.2, 0.2, 1], 0.9);
    }
  };
  const ensure = G => { if (G.player && G.player.hero === 'specialforces') { layer(G); if (G.props.indexOf(G._sfDraw) < 0) { G._sfDraw = Object.assign({}, drawLayer); G.props.push(G._sfDraw); } } };
  SK.on('stageEnter', ensure); SK.on('roomEnter', ensure);
})();
