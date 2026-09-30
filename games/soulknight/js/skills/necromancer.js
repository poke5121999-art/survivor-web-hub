// Kỹ năng Pháp Sư Tử Linh (c14): souls_resurrect. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, R = SK.DS.rules, W = SK.world;
  const { fx, stopFx, hit, nearest, alive, ec, allies, addAlly, hpBar, layer } = K;

  // Vong Linh Hồi Sinh [ĐO c14/skill 3: cd 11, dur 0; prefab reborn_smoke + reborn_mark, tiếng fx_nec_reborn]: đứng gần xác một quái thì
  // hồi sinh nó theo phe mình (máu = máu gốc, đánh nhanh hơn nhiều), để lại dấu lớn dưới đất; ban đầu chỉ điều khiển 1 quái, hồi sinh
  // con mới thì con cũ tan. Không có xác hợp lệ thì kỹ năng hỏng và KHÔNG tính hồi chiêu [WIKI].
  const RB = {
    reach: 6 * U,        // tầm tới xác [ƯỚC LƯỢNG: nguồn chỉ nói "gần xác"]
    rot: 1.5,            // xác nằm ít nhất từng ấy giây mới hồi sinh được (wiki: "vài giây") [ƯỚC LƯỢNG]
    life: 45,            // quái hồi sinh hết hạn sau một lúc nếu chưa bị hạ [WIKI, thời gian ƯỚC LƯỢNG]
    atkRate: 0.35,       // nhịp đánh = shoot_cd × 0.35 ("tần suất tấn công tăng mạnh") [ƯỚC LƯỢNG]
    follow: 3 * U,       // rảnh thì đứng cách người chơi ngần ấy
    sight: 12 * U,       // tầm dò quái địch [ƯỚC LƯỢNG]
    max: 1               // số quái điều khiển cùng lúc [WIKI, chưa nâng cấp]
  };
  const STATIC_AI = /^(EnemyAIStatic|EnemyAISummon)$/;   // quái đứng yên / tổ quái không hồi sinh được [WIKI]
  const MELEE_W = /^(ESword01|EGun010)$/;

  function revivable(e) { return e.st === 'dead' && e.stT >= RB.rot && !e.bossKey && !e.def && !e.draw && !STATIC_AI.test(e.cls) && !e._eaten && e.anims && e.d; }
  function findCorpse(G, p) {
    let best = null, bd = RB.reach;
    for (const e of G.enemies) {
      if (!revivable(e)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { best = e; bd = d; }
    }
    return best;
  }
  const enemyDmg = atk => Math.max(1, Math.round((atk || 1) * R.enemyAtkScale));

  function muzzle(e) {
    const at = (e.w && e.w.at) || (e.d.hands && e.d.hands[0]) || [0, 6], gp = (e.w && e.w.gunPoint) || [8, 0];
    return [e.x + at[0] * e.face * e.scale + Math.cos(e.aim) * (gp[0] * e.scale), e.y - at[1] * e.scale + Math.sin(e.aim) * (gp[0] * e.scale)];
  }
  // Đạn của quái hồi sinh: prefab đạn thật của súng quái nhưng thuộc phe người chơi, sát thương giữ nguyên số gốc.
  function volley(G, p, e) {
    const w = e.w, n = w.p.count || 1, step = SK.deg(w.p.angle || 0), [mx, my] = muzzle(e);
    const spd = Math.min(R.enemyBulletMaxSpeed, w.p.bullet_speed || 7), dmg = enemyDmg(w.p.atk);
    const has = w.bullet && SK.w86 && SK.w86.data && SK.w86.data.bullets[w.bullet];
    const spr = w.bullet && SK.D.bullets && SK.D.bullets[w.bullet] && SK.D.bullets[w.bullet].sprite;
    for (let i = 0; i < n; i++) {
      const a = e.aim + (i - (n - 1) / 2) * step + SK.deg(SK.randf(-(w.p.deviation || 0), w.p.deviation || 0));
      if (has) SK.spawnBullet86(G, 'p', w.bullet, mx, my, a, { spd, dmg, repel: w.p.repel || 0, h: Math.max(2, e.y - my), owner: e });
      else K.shoot(G, p, mx, my, a, { dmg, speed: spd, sprite: spr, life: 3, repel: w.p.repel || 0, noMul: true });
    }
  }

  function reviveDrops(G, p, e) {
    // Xác rời danh sách quái địch, thành đồng minh: tự đánh quái, hứng đạn địch, không rơi vàng/năng lượng khi chết.
    G.enemies.splice(G.enemies.indexOf(e), 1);
    const w0 = !!e.w;
    e.hp = e.hpMax; e.st = 'idle'; e.stT = 0; e.cd = 0; e.flash = 0; e.kx = e.ky = 0; e._revived = true; e.burst = 0; e.swing = e.thrust = 0;
    e.sm = SK.smNew(e.d.ctrl, e.d.anims); e.wsm = w0 && e.w.ctrl ? SK.smNew(e.w.ctrl, e.w.anims) : null;   // dựng lại máy trạng thái: bỏ hồn ma / anim chết
    const mark = fx(G, 'reborn_mark', e.x, e.y, { dur: RB.life, layer: 'ground' });
    fx(G, 'reborn_smoke', e.x, e.y - 4, {});
    if (SK.sfx) { SK.sfx.play('fx_nec_reborn'); SK.sfx.play('fx_flash_lighting_strong', { vol: 0.5 }); }
    const a = addAlly(G, {
      revived: true, e, x: e.x, y: e.y, hp: e.hpMax, hpMax: e.hpMax, face: e.face, box: [e.hb.size[0] * e.scale, e.hb.size[1] * e.scale, e.hb.off[1] * e.scale], cd: 0.3, life: RB.life, mark,
      onZero(G2, q) { q.down = true; q.dying = 0; e.st = 'dead'; e.stT = 0; },
      update(G2, q, dt) {
        if (q.dying != null) { q.dying += dt; e.t += dt; e.stT += dt; SK.smStep(e.sm, dt); if (q.dying > 1.2) vanish(G2, q); return; }
        q.life -= dt; if (q.life <= 0) { vanish(G2, q); return; }
        e.t += dt; e.flash = q.flash; e.kick = Math.max(0, (e.kick || 0) - dt * 16); e.swing = Math.max(0, e.swing - dt); e.thrust = Math.max(0, e.thrust - dt);
        SK.smStep(e.sm, dt);
        if (e.wsm) { e.wAtk = Math.max(0, (e.wAtk || 0) - dt); SK.smSet(e.wsm, 'atk_b', e.st === 'attack' || e.wAtk > 0); SK.smStep(e.wsm, dt); }
        think(G2, p, q, e, dt);
        q.x = e.x; q.y = e.y;
      },
      draw(ctx, G2, q) {
        SK.drawShadow(ctx, e.d.shadow, e.x, e.y, e.d.shadowOff, e.scale);
        if (q.dying != null) ctx.globalAlpha *= Math.max(0, 1 - q.dying / 1.2);
        SK.drawEnemy(ctx, G2, e);
        ctx.globalAlpha = 1;
        if (q.dying == null) hpBar(ctx, q, e.hb.off[1] * e.scale + e.hb.size[1] * e.scale / 2 + 6, '#b06bff');
      }
    });
    return a;
  }
  function vanish(G, a) { a.gone = true; stopFx(a.mark); fx(G, 'reborn_smoke', a.e.x, a.e.y - 4, {}); }

  // Đánh nhau: cận chiến thì áp sát chém, tầm xa thì giữ chỗ ngắm bắn; hết quái thì đi theo người chơi.
  function think(G, p, a, e, dt) {
    const w = e.w, melee = !w || MELEE_W.test(w.cls), reach = melee ? (e.p.atk_range || 2.5) * U * 0.7 : (e.p.bullet_range || 9) * U * 0.7;
    const spd = (e.d.speed || 3) * U * R.enemyMoveScale;
    const t = a.t0 && alive(a.t0) ? a.t0 : (a.t0 = nearest(G, e.x, e.y - 6, RB.sight));
    a.cd -= dt;
    if (e.st === 'attack') { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; return; }
    if (e.st === 'aim') {
      e.stT -= dt;
      if (t) { const [cx, cy] = ec(t); e.aim = Math.atan2(cy - (e.y - 6), cx - e.x); e.face = cx >= e.x ? 1 : -1; }
      if (e.stT <= 0) strike(G, p, a, e, t);
      return;
    }
    if (!t) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      e.st = 'idle';
      if (d > RB.follow * 1.6) { K.walk(G, e, p.x, p.y, spd * 1.4, dt); e.st = 'move'; }
      return;
    }
    const [cx, cy] = ec(t), d = Math.hypot(cx - e.x, cy - (e.y - 6));
    e.face = cx >= e.x ? 1 : -1;
    if (d > reach || (!melee && !W.los(G.map, e.x, e.y - 6, cx, cy))) { K.walk(G, e, cx, cy + 6, spd, dt); e.st = 'move'; return; }
    e.st = 'idle';
    if (a.cd <= 0) { a.cd = (e.p.shoot_cd || 2) * RB.atkRate; e.st = 'aim'; e.stT = melee ? 0.15 : 0.25; e.aim = Math.atan2(cy - (e.y - 6), cx - e.x); }
  }
  function strike(G, p, a, e, t) {
    const w = e.w;
    e.st = 'attack'; e.stT = 0.3; e.kick = 2;
    if (!w) { if (t) hit(G, p, t, enemyDmg(e.p.damage || 2), { noMul: true, repel: 2, tag: 'minion' }); return; }
    if (MELEE_W.test(w.cls)) {
      const [hx, hy] = [e.x + Math.cos(e.aim) * 10, e.y - 6 + Math.sin(e.aim) * 10];
      const bul = w.bullet && SK.w86 && SK.w86.data && SK.w86.data.bullets[w.bullet];
      if (bul) SK.spawnBullet86(G, 'p', w.bullet, hx, hy, e.aim, { spd: 0, dmg: enemyDmg(w.p.atk), owner: e, h: Math.max(2, e.y - hy), flip: e.face < 0 && Math.cos(e.aim) > 0 });
      else for (const q of K.inRadius(G, hx, hy, 18)) hit(G, p, q, enemyDmg(w.p.atk), { noMul: true, repel: 2, tag: 'minion' });
      e.swing = 0.18;
    } else volley(G, p, e);
    if (e.wsm) { const m = w.p.atkMode || 0; if (m !== 0) SK.smTrig(e.wsm, 'atk_t'); if (m !== 1) e.wAtk = 0.1; }
  }

  S.souls_resurrect = {
    RB,
    start(G, p) {
      layer(G);
      const c = findCorpse(G, p);
      if (!c) { p._cdAfter = 0; SK.num(G, p.x, p.y - 26, '?', '#8a95a8'); return; }   // hỏng: không tính hồi chiêu
      for (const a of allies(G).filter(q => q.revived)) if (!a.gone) vanish(G, a);       // chỉ giữ RB.max quái: con cũ tan
      reviveDrops(G, p, c);
    }
  };
})();
