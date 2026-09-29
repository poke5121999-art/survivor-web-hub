// Nhân vật, vũ khí (bảng theo kind), quái (bảng AI theo lớp Unity), súng quái, đạn, đồ rơi, hiệu ứng.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, T = SK.TILE, W = SK.world;
  const R = DS.rules;
  const U = SK.PPU;

  // ---------------------------------------------------------------- di chuyển có va chạm
  // Hộp chân: rộng 2r, cao r, đáy tại y (chân).
  function blocked(map, x, y, r) { return W.boxHits(map, x - r, y - r, x + r, y); }
  SK.moveBox = function (map, a, dx, dy, r) {
    let hit = false;
    const stepAxis = (d, ax) => {
      let rem = d;
      while (Math.abs(rem) > 1e-6) {
        const s = Math.abs(rem) > 1 ? Math.sign(rem) : rem;
        const nx = ax ? a.x + s : a.x, ny = ax ? a.y : a.y + s;
        if (blocked(map, nx, ny, r)) { hit = true; return; }
        a.x = nx; a.y = ny; rem -= s;
      }
    };
    stepAxis(dx, true); stepAxis(dy, false);
    return hit;
  };

  // ---------------------------------------------------------------- vẽ súng xoay quanh tay
  SK.drawGun = function (ctx, sprite, hx, hy, ang, off, o) {
    const left = Math.cos(ang) < 0;
    ctx.save();
    ctx.translate(Math.round(hx), Math.round(hy));
    ctx.rotate(ang);
    if (left) ctx.scale(1, -1);
    if (o && o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
    const ox = (off ? off[0] : 0) - ((o && o.kick) || 0), oy = off ? -off[1] : 0;
    if (!sprite || !SK.draw(ctx, sprite, ox, oy, { pages: o && o.pages })) {
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(ox - 2, oy - 2, 11, 4);
      ctx.fillStyle = '#8b93a3'; ctx.fillRect(ox - 2, oy - 2, 11, 1);
    }
    ctx.restore();
  };
  // Điểm nòng (gp theo trục súng, y hướng lên) ra toạ độ thế giới.
  function gunTip(hx, hy, ang, gp, scale) {
    const s = scale || 1, left = Math.cos(ang) < 0;
    const gx = gp[0] * s, gy = (left ? gp[1] : -gp[1]) * s;
    return [hx + gx * Math.cos(ang) - gy * Math.sin(ang), hy + gx * Math.sin(ang) + gy * Math.cos(ang)];
  }

  // ---------------------------------------------------------------- hiệu ứng + số sát thương
  SK.fx = function (G, kind, x, y, o) { G.fx.push(Object.assign({ kind, x, y, t: 0, dur: 0.5 }, o)); };
  SK.num = function (G, x, y, val, color, big) { G.nums.push({ x: x + SK.randf(-3, 3), y, val, color, big, t: 0 }); };
  function hitFx(G, x, y, kind) {
    const pf = SK.art.vfx(kind);
    const key = pf && pf[0] && pf[0].a && pf[0].a.sample_hit;
    SK.fx(G, 'prefab', x, y, { parts: pf, state: 'sample_hit', dur: key ? SK.animLen(key) : 0.25, scale: 0.6 });
  }

  // ---------------------------------------------------------------- vũ khí người chơi
  SK.makeWeapon = id => ({ id, def: DS.weapons[id], cd: 0, kick: 0 });

  function pShoot(G, p, x, y, ang, d, kind) {
    const crit = SK.rand() * 100 < (p.crit + (d.crit || 0));
    const spd = (d.bulletSpeed || 16) * U;
    G.bullets.push({ side: 'p', kind, x, y, h: Math.max(2, p.y - y), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, ang,
      dmg: d.dmg * (crit ? R.critMult : 1), crit, repel: d.repel || 1, r: d.radius || 2, life: 1.6, color: d.bullet });
  }

  // Hành vi theo kind; thêm kind mới = thêm một dòng ở đây, không sửa chỗ gọi.
  SK.WEAPON_KINDS = {
    gun: {
      fire(G, p, w, o) {
        const d = w.def, n = d.pellets || 1;
        for (let i = 0; i < n; i++) {
          const a = n > 1
            ? o.ang + SK.deg(-d.spread / 2 + d.spread * (i + 0.5) / n + SK.randf(-3, 3))
            : o.ang + SK.deg(SK.randf(-d.spread / 2, d.spread / 2));
          pShoot(G, p, o.x, o.y, a, d, 'pb');
        }
        SK.fx(G, 'muzzle', o.x, o.y, { ang: o.ang, dur: 0.06 });
      }
    },
    staff: {
      fire(G, p, w, o) {
        pShoot(G, p, o.x, o.y, o.ang + SK.deg(SK.randf(-w.def.spread / 2, w.def.spread / 2)), w.def, 'staff');
      }
    },
    melee: {
      fire(G, p, w, o) {
        const d = w.def, reach = d.range || 24, half = SK.deg((d.arc || 120) / 2);
        const cx = p.x, cy = p.y - 7;
        for (const e of G.enemies) {
          if (!targetable(e)) continue;
          const ey = e.y - e.hb.off[1] * e.scale, dd = Math.hypot(e.x - cx, ey - cy);
          if (dd > reach + e.r) continue;
          const da = Math.abs(Math.atan2(Math.sin(Math.atan2(ey - cy, e.x - cx) - o.ang), Math.cos(Math.atan2(ey - cy, e.x - cx) - o.ang)));
          if (da > half && dd > 8) continue;
          const crit = SK.rand() * 100 < (p.crit + (d.crit || 0));
          SK.hurtEnemy(G, e, d.dmg * (crit ? R.critMult : 1), crit, o.ang, d.repel || 3);
        }
        // Chém trúng đạn địch thì xoá đạn, như SK.
        for (const b of G.bullets) {
          if (b.side !== 'e' || b.dead) continue;
          const dd = Math.hypot(b.x - cx, b.y - cy);
          if (dd > reach + 4) continue;
          const da = Math.abs(Math.atan2(Math.sin(Math.atan2(b.y - cy, b.x - cx) - o.ang), Math.cos(Math.atan2(b.y - cy, b.x - cx) - o.ang)));
          if (da <= half) { b.dead = true; hitFx(G, b.x, b.y, 'bullet_hit'); }
        }
        SK.fx(G, 'slash', cx, cy, { ang: o.ang, reach, arc: half * 2, dur: 0.16 });
        w.swing = 0.16;
      }
    }
  };

  // ---------------------------------------------------------------- người chơi
  SK.makePlayer = function (heroId, x, y) {
    const h = DS.heroes[heroId];
    const hd = D.heroes && D.heroes[heroId] && D.heroes[heroId].s0;
    return {
      hero: heroId, h, anims: hd || {}, x, y, face: 1, aim: 0, moving: false, t: 0,
      hp: h.hp, hpMax: h.hp, armor: h.armor, armorMax: h.armor, energy: h.energy, energyMax: h.energy,
      crit: h.crit || 0, gold: 0, weapons: [SK.makeWeapon(h.weapon), null], cur: 0,
      st: 'alive', stT: 0, invulT: 0, armorT: 0, armorTick: 0, flash: 0,
      skillCd: 0, skillT: 0, dual: null, target: null, god: false, speedMul: 1
    };
  };

  function targetable(e) { return e.st !== 'spawn' && e.st !== 'dead'; }

  // Ưu tiên con thấy được; không có thì con gần nhất cùng phòng (bắn vỡ thùng chắn đường như SK).
  function pickTarget(G, p) {
    let best = null, bd = R.autoAimRange, hidden = null, hd = R.autoAimRange;
    for (const e of G.enemies) {
      if (!targetable(e)) continue;
      const ey = e.y - e.hb.off[1] * e.scale;
      const d = Math.hypot(e.x - p.x, ey - p.y);
      if (d >= bd && d >= hd) continue;
      if (W.los(G.map, p.x, p.y - 6, e.x, ey)) { if (d < bd) { best = e; bd = d; } }
      else if (e.room === G.room && d < hd) { hidden = e; hd = d; }
    }
    return best || hidden;
  }

  function handPos(p, side) {
    const hd = p.h.hand || [3, 6];
    const f = side === 2 ? -p.face : p.face;
    return [p.x + hd[0] * f, p.y - hd[1]];
  }

  function tryFire(G, p, w, side) {
    if (!w || w.cd > 0) return;
    const d = w.def;
    if (p.energy < (d.cost || 0)) {
      w.cd = 0.35;
      if (!(G.toastT > 0)) G.toast('Hết năng lượng!');
      return;
    }
    p.energy -= d.cost || 0;
    w.cd = 1 / d.rps;
    w.kick = d.kind === 'melee' ? 0 : 2;
    const [hx, hy] = handPos(p, side);
    const f = SK.frame(d.sprite);
    const tip = d.kind === 'melee' ? [hx, hy] : gunTip(hx, hy, p.aim, [f ? f[3] - f[5] : 10, 0]);
    SK.WEAPON_KINDS[d.kind].fire(G, p, w, { x: tip[0], y: tip[1], ang: p.aim, side });
  }

  SK.updatePlayer = function (G, dt) {
    const p = G.player, I = SK.input;
    p.t += dt;
    if (p.st === 'dead') { p.stT += dt; return; }
    p.invulT = Math.max(0, p.invulT - dt); p.flash = Math.max(0, p.flash - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    for (const w of p.weapons) if (w) { w.cd -= dt; w.kick = Math.max(0, w.kick - dt * 20); w.swing = Math.max(0, (w.swing || 0) - dt); }
    if (p.dual) { p.dual.cd -= dt; p.dual.kick = Math.max(0, p.dual.kick - dt * 20); p.dual.swing = Math.max(0, (p.dual.swing || 0) - dt); }

    // giáp hồi sau một quãng không trúng đòn
    p.armorT -= dt;
    if (p.armorT <= 0 && p.armor < p.armorMax) {
      p.armorTick -= dt;
      if (p.armorTick <= 0) { p.armor++; p.armorTick = R.armorTick; }
    }

    const mv = G.phase === 'portal' ? { x: 0, y: 0 } : I.moveVec();
    p.moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.05;
    const pad = W.obstacleAt(G.map, p.x, p.y - 2);
    p.speedMul = pad && pad.kind === 'pad' ? (pad.p.speed_down ? 1 - pad.p.speed_rate : 1 + pad.p.speed_rate) : 1;
    const spd = p.h.speed * U * p.speedMul;
    SK.moveBox(G.map, p, mv.x * spd * dt, mv.y * spd * dt, p.h.body.r);
    if (p.moving && Math.random() < dt * 8) SK.fx(G, 'dust', p.x - p.face * 4, p.y, { dur: 0.2 });

    p.target = pickTarget(G, p);
    if (p.target) {
      const e = p.target, [hx, hy] = handPos(p, 1);
      p.aim = Math.atan2(e.y - e.hb.off[1] * e.scale - hy, e.x - hx);
      p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
    } else if (p.moving) {
      p.aim = Math.atan2(mv.y, mv.x);
      if (Math.abs(mv.x) > 0.1) p.face = mv.x > 0 ? 1 : -1;
    }

    if (G.phase === 'portal') return;
    const w = p.weapons[p.cur];
    if (I.down('attack') && !(I.touchMode && G.interactTarget && I.btn.attack)) {
      tryFire(G, p, w, 1);
      if (p.skillT > 0) tryFire(G, p, p.dual, 2);
    }
    if (p.skillT > 0) { p.skillT -= dt; if (p.skillT <= 0) endSkill(p); }
    if (I.hit('skill') && p.skillCd <= 0 && p.skillT <= 0) startSkill(G, p);
    if (I.hit('swap') && p.weapons[1 - p.cur]) { p.cur = 1 - p.cur; if (p.skillT > 0) endSkill(p); G.toast(p.weapons[p.cur].def.name); }
    const wantInteract = I.hit('interact') || (I.touchMode && I.hit('attack') && G.interactTarget);
    if (wantInteract && G.interactTarget) G.interactTarget.use(G);
  };

  function startSkill(G, p) {
    const sk = p.h.skill;
    p.skillT = sk.dur;
    const w = p.weapons[p.cur];
    p.dual = SK.makeWeapon(w.id); p.dual.cd = 0.06;
    SK.fx(G, 'ring', p.x, p.y - 8, { dur: 0.35, color: '#7fd3ff' });
  }
  function endSkill(p) { p.skillT = 0; p.dual = null; p.skillCd = p.h.skill.cd; }

  SK.hurtPlayer = function (G, dmg) {
    const p = G.player;
    if (p.st === 'dead' || p.invulT > 0 || dmg <= 0) return false;
    p.armorT = R.armorDelay; p.armorTick = R.armorTick;
    const a = Math.min(p.armor, dmg);
    p.armor -= a; dmg -= a;
    p.hp -= dmg;
    if (p.god && p.hp < 1) p.hp = 1;
    p.invulT = R.hurtInvuln; p.flash = 0.1;
    G.shake = Math.max(G.shake, 3); G.hurtT = 0.35;
    SK.num(G, p.x, p.y - 26, a + dmg, a && !dmg ? '#c9d2df' : '#ff4a4a');
    if (p.hp <= 0) { p.hp = 0; p.st = 'dead'; p.stT = 0; p.skillT = 0; p.dual = null; G.onPlayerDead(); }
    return true;
  };

  SK.drawPlayer = function (ctx, G) {
    const p = G.player;
    if (p.invulT > 0 && p.st !== 'dead' && Math.floor(p.invulT * 14) % 2 === 0) return;
    const key = p.st === 'dead' ? p.anims.dead : p.moving ? p.anims.run : p.anims.idle;
    const fr = SK.animFrame(key, p.st === 'dead' ? p.stT : p.t);
    const pages = p.flash > 0 ? SK.pagesWhite : null;
    const alpha = G.phase === 'portal' ? Math.max(0, 1 - G.phaseT / 0.6) : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    const w = p.weapons[p.cur];
    if (p.st !== 'dead' && p.dual) drawHeld(ctx, p, p.dual, 2);
    if (!fr || !SK.draw(ctx, fr, p.x, p.y, { flip: p.face < 0, pages })) {
      ctx.fillStyle = '#9aa4b5'; ctx.fillRect(p.x - 6, p.y - 16, 12, 16);
    }
    if (p.st !== 'dead' && w) drawHeld(ctx, p, w, 1);
    ctx.restore();
  };
  function drawHeld(ctx, p, w, side) {
    const [hx, hy] = handPos(p, side);
    let ang = p.aim;
    if (w.def.kind === 'melee') ang += (w.swing > 0 ? (1 - w.swing / 0.16) * 2.2 - 1.1 : -0.6) * (Math.cos(p.aim) < 0 ? -1 : 1);
    SK.drawGun(ctx, w.def.sprite, hx, hy, ang, null, { kick: w.kick });
  }

  // ---------------------------------------------------------------- quái
  function resolveAnims(d) {
    const out = {};
    for (const [k, v] of Object.entries(d.anims || {})) {
      if (k.startsWith('L2.')) continue;
      if (!out.idle && /(^|_)(ide|idle)$/.test(k)) out.idle = v;
      else if (!out.run && /(^|_)run$/.test(k)) out.run = v;
      else if (!out.dead && /dead$/.test(k)) out.dead = v;
      else if (!out.atk && /atk/.test(k)) out.atk = v;
    }
    out.idle = out.idle || out.run || out.atk;
    out.run = out.run || out.idle;
    return out;
  }

  // Lớp AI Unity lạ nhưng biết mượn hành vi của lớp nào.
  const AI_ALIAS = {
    EliteArcher: 'EnemyAI03', EnemyFireSacrifice: 'EnemyAI01', EnemyAIWitch: 'EnemyAI04',
    EnemyAISwampRider: 'EnemyAI04', EnemyAI15: 'EnemyAI02', EnemyAI09: 'EnemyAI04', EnemyAI06: 'EnemyAIStatic'
  };
  function resolveAI(cls) {
    if (SK.AI[cls]) return cls;
    if (AI_ALIAS[cls]) return AI_ALIAS[cls];
    SK.warnOnce('ai' + cls, 'AI class ' + cls + ' not implemented, using EnemyAI01');
    return 'EnemyAI01';
  }

  SK.makeEnemy = function (G, id, x, y, room) {
    const d = D.enemies[id];
    const ai = (d.ai && d.ai[0]) || { cls: 'EnemyAI01', p: {} };
    const elite = id.startsWith('ex_');
    const col = d.col || {};
    const e = {
      id, d, p: ai.p || {}, cls: resolveAI(ai.cls), rawCls: ai.cls, x, y, kx: 0, ky: 0,
      hp: d.hp, hpMax: d.hp, face: SK.chance(0.5) ? 1 : -1, aim: 0, st: 'spawn', stT: 0.7, t: SK.rand() * 2,
      cd: SK.randf(0.6, 1.4) * ((ai.p && ai.p.shoot_cd) || 2), room, elite, flash: 0,
      w: (d.weapons && d.weapons[0]) || null, anims: resolveAnims(d),
      r: Math.max(3, Math.min(8, col.circle ? col.circle.r * 0.8 : 5)),
      hb: col.hurt_box || { size: [12, 16], off: [0, 8] }, scale: elite ? R.eliteScale : 1, burst: 0
    };
    SK.fx(G, 'spawn', x, y, { dur: 0.7 });
    return e;
  };

  function enemyDmg(atk) { return Math.max(1, Math.round((atk || 1) * R.enemyAtkScale)); }
  function walkSpeed(e) { return (e.d.speed || 3) * U * R.enemyMoveScale; }
  function seesPlayer(G, e, range) {
    const p = G.player; if (p.st === 'dead') return false;
    const rng = range || ((e.p.findTargetRange || 20) * U * 0.6);
    return Math.hypot(p.x - e.x, p.y - e.y) < rng && W.los(G.map, e.x, e.y - 6, p.x, p.y - 6);
  }
  function faceTo(e, x) { if (Math.abs(x - e.x) > 1) e.face = x > e.x ? 1 : -1; }
  function aimAtPlayer(G, e) {
    const p = G.player, [hx, hy] = eHand(e);
    e.aim = Math.atan2(p.y - 7 - hy, p.x - hx);
    faceTo(e, p.x);
  }
  function eHand(e) {
    const at = (e.w && e.w.at) || (e.d.hands && e.d.hands[0]) || [0, 6];
    return [e.x + at[0] * e.face * e.scale, e.y - at[1] * e.scale];
  }
  function wanderPoint(G, e, near) {
    const r = e.room, map = G.map;
    for (let k = 0; k < 12; k++) {
      const a = SK.rand() * Math.PI * 2, d = SK.randf(16, near || 64);
      const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (r && (tx < r.x0 || tx > r.x1 || ty < r.y0 || ty > r.y1)) continue;
      if (!W.solidAt(map, x, y)) return [x, y];
    }
    return [e.x, e.y];
  }
  function moveTo(G, e, tx, ty, spd, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 2) return { arrived: true, hit: false };
    const s = Math.min(d, spd * dt);
    faceTo(e, tx);
    return { arrived: false, hit: SK.moveBox(G.map, e, dx / d * s, dy / d * s, e.r) };
  }
  function startAim(G, e, t) { e.st = 'aim'; e.stT = t || R.telegraph; aimAtPlayer(G, e); }

  // Bước chung "đi dạo": idle ↔ move. Trả true nếu đang dạo (có thể bị ngắt để tấn công).
  function wander(G, e, dt) {
    if (e.st === 'idle') {
      e.stT -= dt;
      if (e.stT <= 0) { [e.tx, e.ty] = wanderPoint(G, e); e.st = 'move'; e.stT = SK.randf(0.8, 1.6); }
      return true;
    }
    if (e.st === 'move') {
      e.stT -= dt;
      const m = moveTo(G, e, e.tx, e.ty, walkSpeed(e), dt);
      if (m.arrived || m.hit || e.stT <= 0) { e.st = 'idle'; e.stT = SK.randf(0.3, 1.0); }
      return true;
    }
    return false;
  }

  function fireOrLunge(G, e) {
    if (e.w) { enemyFire(G, e); e.burst = e.elite ? R.eliteBurst - 1 : 0; e.burstT = 0.13; e.st = 'attack'; e.stT = 0.3; }
    else { e.st = 'charge'; e.stT = 0.35; e.dir = e.aim; e.hitOnce = false; e.chargeSpd = walkSpeed(e) * 3; }
  }
  function tickAttack(G, e, dt) {
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { aimAtPlayer(G, e); enemyFire(G, e); e.burst--; e.burstT = 0.13; e.stT = 0.3; }
      return;
    }
    e.stT -= dt;
    if (e.stT <= 0) { e.st = 'idle'; e.stT = SK.randf(0.2, 0.6); }
  }
  function tickCharge(G, e, dt) {
    e.stT -= dt;
    const s = e.chargeSpd * dt;
    const hit = SK.moveBox(G.map, e, Math.cos(e.dir) * s, Math.sin(e.dir) * s, e.r);
    faceTo(e, e.x + Math.cos(e.dir));
    const p = G.player;
    if (!e.hitOnce && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 8) {
      e.hitOnce = true;
      SK.hurtPlayer(G, enemyDmg(e.p.damage || 2), e.x, e.y);
    }
    if (hit || e.stT <= 0) { e.st = 'stun'; e.stT = hit ? 0.7 : 0.35; if (hit) G.shake = Math.max(G.shake, 1.5); }
  }

  // Bảng AI theo tên lớp Unity trong ai[0].cls.
  SK.AI = {
    // Đi dạo, đến lượt thì đứng khựng ngắm rồi bắn (shoot_cd, attackProbability /10).
    EnemyAI01(G, e, dt) {
      if (e.st === 'aim') { e.stT -= dt; aimAtPlayer(G, e); if (e.stT <= 0) fireOrLunge(G, e); return; }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st === 'charge') return tickCharge(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; return; }
      wander(G, e, dt);
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = (e.p.shoot_cd || 2) * SK.randf(0.75, 1.2);
        if (seesPlayer(G, e) && SK.rand() * 10 < (e.p.attackProbability != null ? e.p.attackProbability : 7)) startAim(G, e);
      }
    },
    // Lao vào cận chiến: kiếm chém (ESword01) hay giáo đâm (EGun010).
    EnemyAI02(G, e, dt) {
      const p = G.player;
      if (e.st === 'aim') { e.stT -= dt; aimAtPlayer(G, e); if (e.stT <= 0) { enemyFire(G, e); e.st = 'attack'; e.stT = 0.35; } return; }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st === 'charge') return tickCharge(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; return; }
      e.cd -= dt;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (seesPlayer(G, e)) {
        const reach = (e.p.atk_range || 2.5) * U;
        if (d < reach && e.cd <= 0) { e.cd = e.p.shoot_cd || 1; startAim(G, e, (e.p.atkDelay || 1) * 0.35); return; }
        if (d > reach * 0.6) { e.st = 'move'; moveTo(G, e, p.x, p.y, (e.d.speed || 4) * U * 0.9, dt); }
        else e.st = 'idle';
        return;
      }
      wander(G, e, dt);
    },
    // Giữ khoảng cách rồi bắn cung (EGun004) / cung tinh anh có vạch ngắm.
    EnemyAI03(G, e, dt) {
      const p = G.player;
      if (e.st === 'aim') {
        e.stT -= dt;
        if (e.p.lock_in_shooting !== 0) aimAtPlayer(G, e);
        if (!e.p.stand_in_shooting) moveTo(G, e, e.tx || e.x, e.ty || e.y, walkSpeed(e) * 0.5, dt);
        if (e.stT <= 0) fireOrLunge(G, e);
        return;
      }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; return; }
      e.cd -= dt;
      const d = Math.hypot(p.x - e.x, p.y - e.y), want = 6 * T;
      if (e.st === 'idle' || e.st === 'move') {
        e.stT -= dt;
        if (e.stT <= 0 || e.st === 'idle') {
          const a = Math.atan2(e.y - p.y, e.x - p.x) + SK.randf(-0.9, 0.9);
          const dist = d < want ? SK.randf(24, 48) : -SK.randf(16, 40);
          e.tx = e.x + Math.cos(a) * dist; e.ty = e.y + Math.sin(a) * dist;
          if (W.solidAt(G.map, e.tx, e.ty)) [e.tx, e.ty] = wanderPoint(G, e);
          e.st = 'move'; e.stT = SK.randf(0.6, 1.2);
        }
        const m = moveTo(G, e, e.tx, e.ty, walkSpeed(e), dt);
        if (m.arrived || m.hit) { e.st = 'idle'; e.stT = SK.randf(0.2, 0.5); }
      }
      if (e.cd <= 0) {
        e.cd = (e.p.shoot_cd || 3) * SK.randf(0.8, 1.2);
        const aimT = e.w && e.w.p && e.w.p.aimTime ? e.w.p.aimTime + 0.3 : R.telegraph + 0.15;
        if (seesPlayer(G, e)) startAim(G, e, aimT);
      }
    },
    // Heo rừng: đi dạo, gồng lên rồi húc thẳng; đâm tường thì choáng.
    EnemyAI04(G, e, dt) {
      if (e.st === 'aim') {
        e.stT -= dt; aimAtPlayer(G, e);
        if (e.stT <= 0) { e.st = 'charge'; e.stT = 1.3; e.dir = e.aim; e.hitOnce = false; e.chargeSpd = (e.p.sprintForce || 9) * U; }
        return;
      }
      if (e.st === 'charge') return tickCharge(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) { e.st = 'idle'; e.stT = 0.4; } return; }
      wander(G, e, dt);
      e.cd -= dt;
      if (e.cd <= 0) { e.cd = (e.p.shoot_cd || 2) * SK.randf(0.8, 1.3); if (seesPlayer(G, e)) startAim(G, e, 0.5); }
    },
    // Đứng yên một chỗ (cây chậu, xương rồng): ngắm rồi bắn.
    EnemyAIStatic(G, e, dt) {
      if (e.st === 'aim') { e.stT -= dt; aimAtPlayer(G, e); if (e.stT <= 0) { if (e.w) enemyFire(G, e); e.st = 'attack'; e.stT = 0.4; e.burst = 0; } return; }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st !== 'idle') e.st = 'idle';
      e.cd -= dt;
      if (e.cd <= 0) { e.cd = (e.p.shoot_cd || 2) * SK.randf(0.85, 1.15); if (seesPlayer(G, e)) startAim(G, e); }
    },
    // Tổ quái: đứng yên, định kỳ gọi thêm quái rẻ nhất của theme (tối đa 3 con cùng lúc).
    EnemyAISummon(G, e, dt) {
      e.st = e.st === 'spawn' ? e.st : 'idle';
      e.cd -= dt;
      if (e.cd > 0) return;
      e.cd = (e.p.shoot_cd || 4) * SK.randf(0.9, 1.3);
      const kids = G.enemies.filter(k => k.parent === e && k.st !== 'dead').length;
      if (kids >= 3) return;
      const th = G.map.th;
      const cheap = th.enemies.filter(id => D.enemies[id] && D.enemies[id].ai[0] && D.enemies[id].ai[0].cls !== 'EnemyAISummon' && (D.enemies[id].ai[0].p.consume || 1) <= 1);
      if (!cheap.length) return;
      const [x, y] = wanderPoint(G, e, 40);
      const k = SK.makeEnemy(G, SK.pick(cheap), x, y, e.room);
      k.parent = e; G.enemies.push(k);
    }
  };

  // ---------------------------------------------------------------- súng quái (bảng theo EGun*)
  function bulletSprite(w) {
    const b = w.bullet && D.bullets && D.bullets[w.bullet];
    return b && SK.frame(b.sprite) ? b.sprite : null;
  }
  function eShoot(G, e, x, y, ang, o) {
    const w = e.w, spdU = Math.min(R.enemyBulletMaxSpeed, (w.p.bullet_speed || 7) * (o && o.spdMul || 1));
    const spd = spdU * U;
    G.bullets.push(Object.assign({ side: 'e', kind: 'orb', x, y, h: Math.max(2, e.y - y), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, ang,
      dmg: enemyDmg(w.p.atk), repel: w.p.repel || 0, r: 3, life: 5, sprite: bulletSprite(w) }, o));
  }
  function muzzleOf(e) {
    const [hx, hy] = eHand(e);
    const gp = (e.w && e.w.gunPoint) || [8, 0];
    return gunTip(hx, hy, e.aim, gp, e.scale);
  }
  function dev(w) { return SK.deg(SK.randf(-(w.p.deviation || 0), w.p.deviation || 0)); }
  function spread(G, e) {
    const w = e.w, n = w.p.count || 1, step = SK.deg(w.p.angle || 0);
    const [mx, my] = muzzleOf(e);
    for (let i = 0; i < n; i++) {
      const sc = w.p.speed_correction ? SK.randf(1 - 0.12 * w.p.speed_correction, 1) : 1;
      eShoot(G, e, mx, my, e.aim + (i - (n - 1) / 2) * step + dev(w), { spdMul: sc });
    }
    muzzleFx(G, e, mx, my);
  }
  function muzzleFx(G, e, x, y) { if (e.w.muzzle && e.w.muzzle !== 'nothing') SK.fx(G, 'muzzle', x, y, { ang: e.aim, dur: 0.06, frame: e.w.muzzle }); }
  function slash(G, e, reachPx) {
    const p = G.player, [hx, hy] = eHand(e);
    const d = Math.hypot(p.x - hx, p.y - 7 - hy);
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(p.y - 7 - hy, p.x - hx) - e.aim), Math.cos(Math.atan2(p.y - 7 - hy, p.x - hx) - e.aim)));
    if (d < reachPx && da < 1.2) SK.hurtPlayer(G, enemyDmg(e.w.p.atk), e.x, e.y);
    e.swing = 0.18;
  }

  const EGUN = SK.EGUN = {
    EGun001(G, e) { const [mx, my] = muzzleOf(e); eShoot(G, e, mx, my, e.aim + dev(e.w)); muzzleFx(G, e, mx, my); },
    EGun002: spread,
    EGun009: spread,
    EGun004(G, e) {
      const w = e.w, n = w.p.count || 1, [mx, my] = muzzleOf(e);
      for (let i = 0; i < n; i++) eShoot(G, e, mx, my, e.aim + (i - (n - 1) / 2) * SK.deg(w.p.angle || 0) + dev(w), { kind: 'arrow', r: 2 });
    },
    EGunEliteArcher(G, e) { const [mx, my] = muzzleOf(e); eShoot(G, e, mx, my, e.aim + dev(e.w), { kind: 'arrow', r: 2 }); },
    EGunFireSacrifice(G, e) {
      const [mx, my] = muzzleOf(e);
      for (let i = 0; i < 8; i++) eShoot(G, e, mx, my, e.aim + i * Math.PI / 4);
    },
    // Giáo: lao người tới trước theo lực "force", chạm là trúng.
    EGun010(G, e) {
      e.st = 'charge'; e.stT = 0.22; e.dir = e.aim; e.hitOnce = false;
      e.chargeSpd = (e.w.p.force || 10) * U * 1.1; e.thrust = 0.22;
      const p = G.player;
      if (Math.hypot(p.x - e.x, p.y - e.y) < 30) { e.hitOnce = true; SK.hurtPlayer(G, enemyDmg(e.w.p.atk), e.x, e.y); }
    },
    ESword01(G, e) {
      slash(G, e, 18 + (e.w.p.bulletSize || 1) * 12);
      const [hx, hy] = eHand(e);
      SK.fx(G, 'slash', hx, hy, { ang: e.aim, reach: 16 + (e.w.p.bulletSize || 1) * 8, arc: 2.2, dur: 0.16, enemy: true });
    }
  };
  function enemyFire(G, e) {
    const w = e.w; if (!w) return;
    let fn = EGUN[w.cls];
    if (!fn) {
      SK.warnOnce('egun' + w.cls, 'enemy gun ' + w.cls + ' not implemented, using ' + (w.p.count > 1 ? 'EGun002' : 'EGun001'));
      fn = w.p.count > 1 ? EGUN.EGun002 : EGUN.EGun001;
    }
    fn(G, e);
    e.kick = 2;
  }

  SK.updateEnemy = function (G, e, dt) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.kick = Math.max(0, (e.kick || 0) - dt * 16);
    e.swing = Math.max(0, (e.swing || 0) - dt);
    e.thrust = Math.max(0, (e.thrust || 0) - dt);
    if (e.st === 'dead') { e.stT += dt; return; }
    if (e.st === 'spawn') { e.stT -= dt; if (e.stT <= 0) { e.st = 'idle'; e.stT = SK.randf(0.1, 0.5); } return; }
    if (Math.abs(e.kx) + Math.abs(e.ky) > 0.5) {
      SK.moveBox(G.map, e, e.kx * dt, e.ky * dt, e.r);
      const k = Math.exp(-dt * 12); e.kx *= k; e.ky *= k;
    }
    SK.AI[e.cls](G, e, dt);
  };

  SK.hurtEnemy = function (G, e, dmg, crit, ang, repel) {
    if (!targetable(e)) return false;
    e.hp -= dmg; e.flash = 0.08;
    if (!(e.p.kinematic)) { e.kx += Math.cos(ang) * repel * 30; e.ky += Math.sin(ang) * repel * 30; }
    SK.num(G, e.x, e.y - e.hb.off[1] * e.scale - e.hb.size[1] * 0.5 * e.scale - 4, dmg, crit ? '#ffd23a' : '#ffffff', crit);
    if (e.hp <= 0) killEnemy(G, e, ang);
    return true;
  };

  function killEnemy(G, e, ang) {
    e.st = 'dead'; e.stT = 0; e.hp = 0;
    e.kx = Math.cos(ang || 0) * 60; e.ky = Math.sin(ang || 0) * 60;
    SK.moveBox(G.map, e, e.kx * 0.08, e.ky * 0.08, e.r);
    G.kills++;
    if (!e.anims.dead) SK.fx(G, 'prefab', e.x, e.y - 8, { parts: SK.art.vfx('death'), state: 'smoke', dur: 0.5 });
    const rate = e.p.reward_rate != null ? e.p.reward_rate : 20, rv = e.p.reward_value || [0, 0, 1, 1];
    if (SK.rand() * 100 < rate) {
      // reward_value [?, ?, xu, năng lượng] — cách đọc [ƯỚC LƯỢNG]
      for (let i = 0; i < (rv[2] || 0); i++) SK.dropPickup(G, 'coin', e.x, e.y - 4);
      for (let i = 0; i < (rv[3] || 0); i++) SK.dropPickup(G, 'energy', e.x, e.y - 4);
    }
  }

  SK.drawEnemy = function (ctx, G, e) {
    if (e.st === 'spawn') return;
    const dead = e.st === 'dead';
    if (dead && !e.anims.dead) return;
    const key = dead ? e.anims.dead : (e.st === 'move' || e.st === 'charge') ? e.anims.run : (e.st === 'aim' || e.st === 'attack') && e.anims.atk ? e.anims.atk : e.anims.idle;
    const fr = SK.animFrame(key, dead ? e.stT : e.t) || e.d.body;
    const pages = e.flash > 0 ? SK.pagesWhite : e.elite ? SK.pagesElite : null;
    let x = e.x, y = e.y;
    if (e.st === 'aim' && (e.cls === 'EnemyAI04' || !e.w)) x += Math.sin(e.t * 60) * 1;
    const s = e.scale;
    const flip = e.face < 0;
    if (!fr || !SK.draw(ctx, fr, x, y, { flip, sx: s, sy: s, pages })) {
      ctx.fillStyle = e.elite ? '#b33' : '#7a3'; ctx.fillRect(x - 6, y - 14, 12, 14);
    }
    if (!dead && e.w && e.w.sprite) {
      const [hx, hy] = eHand(e);
      let ang = e.w.p.need_lock === 0 && e.st !== 'aim' ? (e.face > 0 ? 0 : Math.PI) : e.aim;
      if (e.st !== 'aim' && e.st !== 'attack' && e.w.p.need_lock !== 0) ang = e.face > 0 ? 0.15 : Math.PI - 0.15;
      if (e.swing > 0) ang += (1 - e.swing / 0.18) * 2.4 - 1.2;
      const push = e.thrust > 0 ? Math.sin(e.thrust / 0.22 * Math.PI) * 8 : 0;
      SK.drawGun(ctx, e.w.sprite, hx + Math.cos(ang) * push, hy + Math.sin(ang) * push, ang, e.w.spriteOff, { scale: s, kick: e.kick, pages });
    }
    if (e.st === 'aim' && e.w && e.w.p && e.w.p.aimTime) drawAimLine(ctx, G, e);
  };
  function drawAimLine(ctx, G, e) {
    const [mx, my] = muzzleOf(e);
    let len = 0;
    while (len < 320 && !W.solidAt(G.map, mx + Math.cos(e.aim) * len, my + Math.sin(e.aim) * len + 6)) len += 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,40,40,' + (0.35 + 0.3 * Math.sin(e.t * 40)) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(e.aim) * len, my + Math.sin(e.aim) * len); ctx.stroke();
    ctx.restore();
  }
  SK.drawShadow = function (ctx, name, x, y, off, s) {
    const f = name && SK.frame(name);
    if (f) { SK.draw(ctx, name, x + (off ? off[0] : 0), y - (off ? off[1] : 0) + 1, { alpha: 0.45, sx: s || 1, sy: s || 1 }); return; }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y, 6 * (s || 1), 2.5, 0, 0, Math.PI * 2); ctx.fill();
  };

  // ---------------------------------------------------------------- đạn
  SK.updateBullets = function (G, dt) {
    const map = G.map, p = G.player;
    for (const b of G.bullets) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      const sp = Math.hypot(b.vx, b.vy), n = Math.max(1, Math.ceil(sp * dt / 4));
      for (let k = 0; k < n && !b.dead; k++) {
        b.x += b.vx * dt / n; b.y += b.vy * dt / n;
        const gy = b.y + b.h;
        if (W.solidAt(map, b.x, gy)) {
          b.dead = true;
          const o = W.obstacleAt(map, b.x, gy);
          if (o && o.kind === 'box') SK.hitObstacle(G, o, b.side === 'p' ? b.dmg : 1);
          hitFx(G, b.x - b.vx * dt / n, b.y - b.vy * dt / n, b.side === 'p' ? 'bullet_hit' : 'enemy_bullet_hit');
          break;
        }
        if (b.side === 'p') {
          for (const e of G.enemies) {
            if (!targetable(e)) continue;
            const s = e.scale, hw = e.hb.size[0] * s / 2 + b.r, hh = e.hb.size[1] * s / 2 + b.r;
            const cx = e.x + e.hb.off[0] * e.face * s, cy = e.y - e.hb.off[1] * s;
            if (Math.abs(b.x - cx) < hw && Math.abs(b.y - cy) < hh) {
              SK.hurtEnemy(G, e, b.dmg, b.crit, Math.atan2(b.vy, b.vx), b.repel);
              hitFx(G, b.x, b.y, 'bullet_hit');
              b.dead = true; break;
            }
          }
        } else if (p.st !== 'dead') {
          const hb = p.h.hurt, cx = p.x, cy = p.y - hb.off[1];
          if (Math.abs(b.x - cx) < hb.size[0] / 2 + b.r && Math.abs(b.y - cy) < hb.size[1] / 2 + b.r) {
            b.dead = true;
            hitFx(G, b.x, b.y, 'enemy_hit');
            SK.hurtPlayer(G, b.dmg, b.x, b.y);
          }
        }
      }
      if (b.kind === 'sprite-spin') b.ang += dt * 12;
    }
    G.bullets = G.bullets.filter(b => !b.dead);
  };

  const BULLET_DRAW = {
    pb(ctx, b) {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.translate(Math.round(b.x), Math.round(b.y)); ctx.rotate(a);
      ctx.fillStyle = b.crit ? '#fff6a0' : '#ffd84a'; ctx.fillRect(-4, -1.5, 7, 3);
      ctx.fillStyle = '#fffbe0'; ctx.fillRect(-1, -0.5, 4, 1);
      ctx.restore();
    },
    staff(ctx, b) {
      ctx.fillStyle = 'rgba(190,120,255,0.35)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c58cff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f3e6ff'; ctx.beginPath(); ctx.arc(b.x - 1, b.y - 1, b.r * 0.45, 0, Math.PI * 2); ctx.fill();
    },
    orb(ctx, b) {
      const vfx = SK.art.vfx('enemy_bullet');
      if (typeof vfx === 'string' && SK.draw(ctx, vfx, b.x, b.y)) return;
      if (b.sprite && SK.draw(ctx, b.sprite, b.x, b.y, { rot: b.ang })) return;
      // Viên năng lượng cam-đỏ kinh điển của đạn quái SK.
      ctx.fillStyle = 'rgba(255,90,40,0.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5a2a'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2); ctx.fill();
    },
    arrow(ctx, b) {
      if (b.sprite && SK.draw(ctx, b.sprite, b.x, b.y, { rot: b.ang })) return;
      ctx.save(); ctx.translate(Math.round(b.x), Math.round(b.y)); ctx.rotate(b.ang);
      ctx.fillStyle = '#d8c7a0'; ctx.fillRect(-7, -0.5, 9, 1);
      ctx.fillStyle = '#e8e8f0'; ctx.fillRect(2, -1, 3, 2);
      ctx.fillStyle = '#c0402a'; ctx.fillRect(-8, -1.5, 2, 3);
      ctx.restore();
    }
  };
  SK.drawBullets = function (ctx, G) { for (const b of G.bullets) (BULLET_DRAW[b.kind] || BULLET_DRAW.orb)(ctx, b); };

  // ---------------------------------------------------------------- vật cản phá được
  SK.hitObstacle = function (G, o, dmg) {
    o.hp -= dmg; o.flash = 0.06;
    if (o.hp > 0) return;
    W.removeObstacle(G.map, o);
    SK.fx(G, 'prefab', o.x, o.y - 8, { parts: SK.art.vfx('death'), state: 'smoke', dur: 0.5 });
    if (o.explode) {
      SK.fx(G, 'prefab', o.x, o.y - 8, { parts: SK.art.vfx('explode'), state: 'explode_small', dur: 0.66 });
      G.shake = Math.max(G.shake, 4);
      for (const e of G.enemies) if (targetable(e) && Math.hypot(e.x - o.x, e.y - o.y) < 40) SK.hurtEnemy(G, e, 6, false, Math.atan2(e.y - o.y, e.x - o.x), 4);
      if (Math.hypot(G.player.x - o.x, G.player.y - o.y) < 32) SK.hurtPlayer(G, 2, o.x, o.y);
    }
  };

  // ---------------------------------------------------------------- đồ rơi
  function mbsNum(prefabKind, cls, field, dflt) {
    const m = SK.prefabMbs(SK.art.object(prefabKind), cls);
    return m && m[field] != null ? m[field] : dflt;
  }
  SK.dropPickup = function (G, kind, x, y, extra) {
    const a = SK.rand() * Math.PI * 2, s = SK.randf(30, 70);
    G.pickups.push(Object.assign({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, z: 0, vz: 60 }, extra));
  };
  const PICKUP = {
    coin: {
      range: () => mbsNum('coin', 'RGCoin', 'range', 7) * U,
      take(G, p) { p.gold += mbsNum('coin', 'RGCoin', 'value', R.coinValue); return true; },
      draw(ctx, k, t) {
        const pf = SK.art.object('coin');
        if (!SK.drawPrefab(ctx, pf, k.x, k.y - k.z, { t, state: 'coin_copper' })) { ctx.fillStyle = '#f0b43a'; ctx.fillRect(k.x - 3, k.y - k.z - 7, 6, 7); }
      }
    },
    energy: {
      range: () => mbsNum('energy_orb', 'RGEnergy', 'range', 6) * U,
      take(G, p) { p.energy = Math.min(p.energyMax, p.energy + mbsNum('energy_orb', 'RGEnergy', 'value', R.energyOrb)); return true; },
      draw(ctx, k, t) {
        ctx.fillStyle = 'rgba(80,190,255,' + (0.18 + 0.08 * Math.sin(t * 8)) + ')';
        ctx.beginPath(); ctx.arc(k.x, k.y - k.z - 4, 6, 0, Math.PI * 2); ctx.fill();
        if (!SK.drawPrefab(ctx, SK.art.object('energy_orb'), k.x, k.y - k.z - 4, { t })) { ctx.fillStyle = '#5ad0ff'; ctx.fillRect(k.x - 2, k.y - k.z - 6, 4, 4); }
      }
    },
    hp_pot: {
      range: () => 0,
      take(G, p) { if (p.hp >= p.hpMax) return false; p.hp = Math.min(p.hpMax, p.hp + mbsNum('hp_potion', 'RGHealthPot', 'health', R.potionHp)); return true; },
      draw(ctx, k, t) { if (!SK.drawPrefab(ctx, SK.art.object('hp_potion'), k.x, k.y - k.z, { t })) { ctx.fillStyle = '#e33'; ctx.fillRect(k.x - 3, k.y - 9, 6, 8); } }
    },
    en_pot: {
      range: () => 0,
      take(G, p) { if (p.energy >= p.energyMax) return false; p.energy = Math.min(p.energyMax, p.energy + mbsNum('energy_potion', 'RGEnergyPot', 'energy', R.potionEnergy)); return true; },
      draw(ctx, k, t) { if (!SK.drawPrefab(ctx, SK.art.object('energy_potion'), k.x, k.y - k.z, { t })) { ctx.fillStyle = '#39f'; ctx.fillRect(k.x - 3, k.y - 9, 6, 8); } }
    }
  };
  SK.updatePickups = function (G, dt) {
    const p = G.player;
    for (const k of G.pickups) {
      k.t += dt;
      k.vz -= 300 * dt; k.z = Math.max(0, k.z + k.vz * dt);
      if (k.z === 0) k.vz = Math.abs(k.vz) > 40 ? -k.vz * 0.35 : 0;
      const def = PICKUP[k.kind];
      const d = Math.hypot(p.x - k.x, p.y - 6 - k.y);
      const mag = def.range() && k.t > 0.35 && d < def.range() && p.st !== 'dead';
      if (mag) {
        const s = 140 + k.t * 120;
        k.vx = (p.x - k.x) / d * s; k.vy = (p.y - 6 - k.y) / d * s;
      } else { const f = Math.exp(-dt * 5); k.vx *= f; k.vy *= f; }
      SK.moveBox(G.map, k, k.vx * dt, k.vy * dt, 1);
      if (d < 8 && k.t > 0.2 && p.st !== 'dead' && def.take(G, p)) k.gone = true;
    }
    G.pickups = G.pickups.filter(k => !k.gone);
  };
  SK.drawPickup = function (ctx, G, k) { PICKUP[k.kind].draw(ctx, k, G.t + k.x * 0.01); };

  // ---------------------------------------------------------------- hiệu ứng
  const FX_DRAW = {
    prefab(ctx, f) {
      if (!f.parts || !SK.drawPrefab(ctx, f.parts, f.x, f.y, { t: f.t, state: f.state, scale: f.scale })) {
        ctx.fillStyle = 'rgba(255,240,200,' + (1 - f.t / f.dur) + ')';
        ctx.beginPath(); ctx.arc(f.x, f.y, 2 + f.t * 12, 0, Math.PI * 2); ctx.fill();
      }
    },
    muzzle(ctx, f) {
      const fr = f.frame || 'bullet_4';
      if (!SK.draw(ctx, fr, f.x, f.y, { rot: f.ang, sy: Math.cos(f.ang) < 0 ? -1 : 1 })) {
        ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    },
    slash(ctx, f) {
      const k = f.t / f.dur;
      ctx.save();
      ctx.strokeStyle = f.enemy ? 'rgba(255,120,110,' + (1 - k) + ')' : 'rgba(255,255,255,' + (1 - k) + ')';
      ctx.lineWidth = 3 - k * 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.reach * (0.7 + 0.3 * k), f.ang - f.arc / 2, f.ang + f.arc / 2); ctx.stroke();
      ctx.restore();
    },
    ring(ctx, f) {
      const k = f.t / f.dur;
      ctx.save(); ctx.strokeStyle = f.color || '#fff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 6 + k * 18, 3 + k * 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    },
    dust(ctx, f) {
      const pf = SK.art.vfx('dust');
      const m = SK.prefabMbs(pf, 'SpriteAnimation');
      if (m && m.sprites) {
        const i = Math.min(m.sprites.length - 1, Math.floor(f.t * (m.frameRate || 20)));
        if (SK.draw(ctx, m.sprites[i].replace(/^@/, ''), f.x, f.y)) return;
      }
      ctx.fillStyle = 'rgba(200,200,200,' + (0.5 - f.t) + ')'; ctx.fillRect(f.x - 1, f.y - 2, 3, 2);
    },
    // Chưa có sprite xuất quái: cột sáng + vòng đất (vẽ tay).
    spawn(ctx, f) {
      const vfx = SK.art.vfx('enemy_spawn');
      if (typeof vfx === 'string' && SK.anim(vfx)) { const fr = SK.animFrame(vfx, f.t); if (fr && SK.draw(ctx, fr, f.x, f.y)) return; }
      const k = f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const w = 10 * (1 - k * 0.6);
      ctx.fillRect(Math.round(f.x - w / 2), f.y - 34, Math.round(w), 34);
      ctx.strokeStyle = '#bdf6ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 4 + k * 10, 2 + k * 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  };
  SK.updateFx = function (G, dt) {
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter(f => f.t < f.dur);
    for (const n of G.nums) n.t += dt;
    G.nums = G.nums.filter(n => n.t < 0.8);
  };
  SK.drawFx = function (ctx, G, ground) {
    for (const f of G.fx) {
      const isGround = f.kind === 'dust' || f.kind === 'ring';
      if (isGround === ground) (FX_DRAW[f.kind] || FX_DRAW.prefab)(ctx, f);
    }
  };
})();
