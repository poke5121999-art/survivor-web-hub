// Trùm cuối ải x-5: SK.CUSTOM_ENEMIES, SK.bossWaves, thanh máu + màn giới thiệu qua SK.on('hud').
// Mỗi trùm là một máy trạng thái chạy trong một prop "sàn đấu" (G.props) chứ không trong SK.AI:
// Giun Cát lặn đất phải để e.st = 'spawn' (không trúng đạn được) mà core bỏ qua SK.AI ở trạng thái đó.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, W = SK.world, U = SK.PPU, R = DS.rules;
  const WK = (window.SK_WIKI && window.SK_WIKI.bosses) || {};
  const TAU = Math.PI * 2;
  const INTRO = 2.2;          // giây màn giới thiệu trùm [ƯỚC LƯỢNG]
  const ENRAGE_AT = 0.5;      // [WIKI] nửa máu thì nổi giận (Devil's Snare ghi rõ; trùm khác dùng chung)

  const animKey = k => (D.extra && D.extra.png && D.extra.png[k]) || null;
  const frameOf = (k, t) => SK.animFrame(animKey(k), t || 0);
  // Số sát thương wiki × cùng hệ số quái thường của core để 1-5 không nặng tay hơn phần còn lại.
  const dmgOf = wiki => Math.max(1, Math.round(wiki * R.enemyAtkScale));
  const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const smooth = k => { k = SK.clamp(k, 0, 1); return k * k * (3 - 2 * k); };

  // ---------------------------------------------------------------- tiện ích chung
  function aimAt(G, x, y) { const p = G.player; return angTo(x, y, p.x, p.y - 7); }

  // o: {spd (đơn vị/giây), dmg (số wiki), sprite, rot0, r, life, h, decel, bounce, onEnd(G,b,wall), tick(G,b,dt), spin}
  function shoot(G, e, x, y, ang, o) {
    const spd = (o.spd || 7) * U * (e.enraged && e.def.enrageSpd ? e.def.enrageSpd : 1);
    const b = {
      side: 'e', kind: 'arrow', x, y, h: o.h != null ? o.h : 12, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      ang: ang + (o.rot0 || 0), dmg: dmgOf(o.dmg || 2), repel: 0, r: o.r || 3, life: o.life || 5,
      sprite: o.sprite || 'bullet_29', age: 0, px: x, py: y, boss: e
    };
    for (const k of ['decel', 'bounce', 'onEnd', 'tick', 'spin']) if (o[k] != null) b[k] = o[k];
    G.bullets.push(b);
    if (b.decel || b.bounce || b.onEnd || b.tick || b.spin) e.arena.tracked.push(b);
    return b;
  }
  function ring(G, e, x, y, n, a0, o) {
    for (let i = 0; i < n; i++) shoot(G, e, x, y, a0 + i * TAU / n, o);
  }
  function fan(G, e, x, y, n, mid, width, o) {
    for (let i = 0; i < n; i++) shoot(G, e, x, y, mid + (n > 1 ? (i / (n - 1) - 0.5) * width : 0), o);
  }

  function explodeFx(G, x, y, big, poison, scale) {
    const pf = SK.prefab(poison ? 'explode_poison' : 'explode_s');
    const state = big ? 'explode_big' : 'explode_small';
    const key = pf && pf[0] && pf[0].a && pf[0].a[state];
    SK.fx(G, 'prefab', x, y, { parts: pf, state, dur: key ? SK.animLen(key) : 0.5, scale: scale || 1 });
  }
  // Nổ vùng: khung explode_big rộng ~92 px nên scale theo bán kính trúng đòn.
  function blast(G, x, y, rad, wikiDmg, poison) {
    explodeFx(G, x, y, rad >= 24, poison, rad / 40);
    G.shake = Math.max(G.shake, rad >= 24 ? 4 : 2);
    const p = G.player;
    if (p.st !== 'dead' && Math.hypot(p.x - x, (p.y - 5) - y) < rad + 4) SK.hurtPlayer(G, dmgOf(wikiDmg));
  }

  // Điểm sàn ngẫu nhiên trong phòng trùm, cách người chơi một khoảng.
  function roomPoint(G, e, minD, maxD) {
    const r = e.room, p = G.player, T = SK.TILE;
    for (let k = 0; k < 30; k++) {
      const x = SK.randf((r.x0 + 2) * T, (r.x1 - 1) * T), y = SK.randf((r.y0 + 3) * T, (r.y1 - 1) * T);
      if (W.solidAt(G.map, x, y) || W.solidAt(G.map, x, y - 8)) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d >= minD && d <= maxD) return [x, y];
    }
    return W.roomCenter(r);
  }
  function clampRoom(G, e, x, y) {
    const r = e.room, T = SK.TILE;
    return [SK.clamp(x, (r.x0 + 1.5) * T, (r.x1 - 0.5) * T), SK.clamp(y, (r.y0 + 2) * T, (r.y1 + 0.5) * T)];
  }

  // ---------------------------------------------------------------- sàn đấu: đạn đặc biệt, cảnh báo, vật thể
  function makeArena(G, e) {
    const A = { e, objs: [], tracked: [], introT: 0, done: false, frozen: false, barHp: e.hp };
    G.props.push({ x: e.x, y: -1e9, draw: ctx => drawLayer(ctx, G, A, 'ground'),
      update: (G2, pr, dt) => { updateArena(G2, A, dt); pr.gone = A.done; } });
    G.props.push({ x: e.x, y: 1e9, draw: ctx => drawLayer(ctx, G, A, 'air'), update: (G2, pr) => { pr.gone = A.done; } });
    return A;
  }
  function drawLayer(ctx, G, A, layer) { for (const o of A.objs) if (o[layer]) o[layer](ctx, G, o); }

  function freeze(G, A, on) {
    const p = G.player;
    if (on && !A.frozen) { A.frozen = true; A.savedMove = p.moveMul; p.moveMul = 0; }
    if (!on && A.frozen) { A.frozen = false; p.moveMul = A.savedMove; }
    if (on) for (const w of p.weapons.concat(p.dual)) if (w) w.cd = Math.max(w.cd, 0.1);
  }

  function updateArena(G, A, dt) {
    const e = A.e;
    if (e.st === 'dead' && !e.deathDone) onBossDeath(G, e);
    if (A.introT < INTRO) {
      A.introT += dt;
      freeze(G, A, A.introT < INTRO);
      if (A.introT >= INTRO) { e.st = 'idle'; e.stT = 0; }
    } else if (e.st !== 'dead') brain(G, e, dt);
    updateTracked(G, A, dt);
    A.objs = A.objs.filter(o => { o.t += dt; return o.update ? o.update(G, o, dt) !== false : o.t < o.dur; });
    A.barHp += (Math.max(0, e.hp) - A.barHp) * Math.min(1, dt * 4);
    if (e.deathDone) { e.deathT += dt; if (e.deathT > 2 && !A.objs.length) A.done = true; }
  }

  // Chạy sau SK.updateBullets: đạn nảy tường được hồi sinh ở vị trí khung trước, đạn nổ/tách gọi onEnd.
  function updateTracked(G, A, dt) {
    const keep = [], map = G.map;
    for (const b of A.tracked) {
      if (b.dead) {
        const wall = b.life > 0 && W.solidAt(map, b.x, b.y + b.h);
        if (wall && b.bounce > 0) {
          const hx = W.solidAt(map, b.px + b.vx * dt * 1.5, b.py + b.h), hy = W.solidAt(map, b.px, b.py + b.vy * dt * 1.5 + b.h);
          if (hx || !hy) b.vx = -b.vx;
          if (hy || !hx) b.vy = -b.vy;
          b.x = b.px; b.y = b.py; b.dead = false; b.bounce--;
          G.bullets.push(b); keep.push(b);
          continue;
        }
        if (b.onEnd && !b.ended) { b.ended = true; b.onEnd(G, b, wall); }
        continue;
      }
      b.age += dt;
      if (b.decel) { const k = Math.exp(-b.decel * dt); b.vx *= k; b.vy *= k; }
      if (b.spin) b.ang += b.spin * dt;
      if (b.tick) b.tick(G, b, dt);
      b.px = b.x; b.py = b.y;
      keep.push(b);
    }
    A.tracked = keep;
  }

  // Vòng cảnh báo trên sàn (đỏ, lõi lớn dần tới lúc nổ) như SK; air(k) vẽ thêm vật rơi nếu có.
  function warn(A, x, y, rad, dur, done, o) {
    o = o || {};
    A.objs.push({
      t: 0, x, y, rad, dur,
      update(G, w) { if (w.t >= w.dur) { if (done) done(G, w); return false; } return true; },
      ground(ctx, G, w) {
        const k = SK.clamp(w.t / w.dur, 0, 1);
        ctx.save();
        ctx.fillStyle = o.color || 'rgba(255,40,40,0.18)';
        ctx.beginPath(); ctx.arc(w.x, w.y, w.rad, 0, TAU); ctx.fill();
        ctx.fillStyle = o.core || 'rgba(255,60,40,0.35)';
        ctx.beginPath(); ctx.arc(w.x, w.y, w.rad * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = o.edge || 'rgba(255,90,70,' + (0.6 + 0.4 * Math.sin(w.t * 30)) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.rad, 0, TAU); ctx.stroke();
        ctx.restore();
      },
      air: o.air ? (ctx, G, w) => o.air(ctx, G, w, SK.clamp(w.t / w.dur, 0, 1)) : null
    });
  }

  function meteor(G, e, x, y, rad) {
    [x, y] = clampRoom(G, e, x, y);
    warn(e.arena, x, y, rad, 1.15, G2 => blast(G2, x, y, rad, 4), {
      air(ctx, G2, w, k) {
        const f = (k - 0.72) / 0.28; if (f < 0) return;
        const my = y - 150 * (1 - f), mx = x - 40 * (1 - f);
        ctx.save(); ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ffb36a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx - 14, my - 50); ctx.lineTo(mx, my); ctx.stroke();
        ctx.restore();
        SK.draw(ctx, 'bullet_115', mx, my - 6);
      }
    });
  }

  // ---------------------------------------------------------------- khung hành động
  // Dòng thời gian: [[giây, fn(G, e, act)], ...]; tick chạy mỗi bước; pose cho hàm vẽ.
  function tl(dur, events, tick, pose) {
    const ev = events.slice().sort((a, b) => a[0] - b[0]);
    let i = 0;
    return {
      t: 0, pose, dur,
      step(G, e, dt) {
        this.t += dt;
        if (tick) tick(G, e, dt, this.t, this);
        while (i < ev.length && this.t >= ev[i][0]) ev[i++][1](G, e, this);
        return this.t >= dur;
      }
    };
  }

  function brain(G, e, dt) {
    const def = e.def, p = G.player;
    if (!e.enraged && e.hp <= e.hpMax * ENRAGE_AT) {
      e.enraged = true;
      SK.fx(G, 'ring', e.x, e.y - 4, { dur: 0.7, color: '#ff4a3a' });
      G.shake = Math.max(G.shake, 3);
      if (def.enrage) def.enrage(G, e);
    }
    if (def.tick) def.tick(G, e, dt);
    if (e.act) {
      if (e.act.step(G, e, dt)) { e.act = null; e.rest = SK.randf(def.rest[0], def.rest[1]) * (e.enraged ? 0.6 : 1); }
    } else {
      e.rest -= dt;
      if (def.walk) wander(G, e, dt); else e.moving = false;
      if (e.rest <= 0 && p.st !== 'dead') startAttack(G, e);
    }
    if (!e.under && Math.abs(p.x - e.x) > 2) e.face = p.x > e.x ? 1 : -1;
    e.lastX = e.x; e.lastY = e.y;
  }
  function startAttack(G, e) {
    const list = e.def.pick ? e.def.pick(G, e) : Object.keys(e.def.attacks);
    let opts = list.filter(n => n !== e.lastAtk);
    if (!opts.length) opts = list;
    const name = SK.pick(opts);
    e.lastAtk = name; e.used[name] = (e.used[name] || 0) + 1;
    e.act = e.def.attacks[name](G, e);
    e.act.name = name;
    e.moving = false;
  }
  function wander(G, e, dt) {
    if (!e.goal || e.goalT <= 0) { e.goal = roomPoint(G, e, 60, 140); e.goalT = SK.randf(1.2, 2.2); }
    e.goalT -= dt;
    const spd = e.def.speed * U * (e.enraged ? 1.3 : 1);
    const dx = e.goal[0] - e.x, dy = e.goal[1] - e.y, d = Math.hypot(dx, dy);
    if (d < 3) { e.moving = false; e.goalT = Math.min(e.goalT, 0.3); return; }
    const s = Math.min(d, spd * dt);
    const hit = SK.moveBox(G.map, e, dx / d * s, dy / d * s, e.r);
    e.moving = true;
    if (hit) e.goalT = 0;
  }
  function dash(G, e, ang, spd, dt) {
    if (Math.hypot(G.player.x - e.x, G.player.y - e.y) < 22) return;
    SK.moveBox(G.map, e, Math.cos(ang) * spd * U * dt, Math.sin(ang) * spd * U * dt, e.r);
  }

  // ---------------------------------------------------------------- vẽ chung
  function pagesOf(e) { return e.flash > 0 || (e.deathDone && e.deathT < 1.2 && Math.floor(e.deathT * 14) % 2 === 0) ? SK.pagesWhite : null; }
  function shadow(ctx, e, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y, w, w * 0.32, 0, 0, TAU); ctx.fill();
  }
  function body(ctx, e, key, x, y, o) {
    const f = frameOf(key, (o && o.t != null) ? o.t : e.t);
    if (!f) return false;
    return SK.draw(ctx, f, x, y, { flip: e.face < 0, pages: pagesOf(e), alpha: o && o.alpha });
  }
  // Người đứng: idle/run + vũ khí trong tay; khi chết chỉ còn khung dead.
  function drawWalker(ctx, G, e, pre, weapon) {
    const dead = e.deathDone && e.deathT > 1.2;
    if (!dead) shadow(ctx, e, e.def.shadowW);
    if (dead) return body(ctx, e, pre + '_dead', e.x, e.y, { t: 0 });
    body(ctx, e, pre + (e.moving ? '_run' : '_idle'), e.x, e.y);
    if (weapon) weapon();
  }
  function hand(e) { const h = e.def.hand; return [e.x + h[0] * e.face, e.y - h[1]]; }
  function staffTip(e, ang, len) { const [hx, hy] = hand(e); return [hx + Math.cos(ang) * len, hy + Math.sin(ang) * len]; }

  function drawBoss(ctx, G, e) {
    if (e.def.draw) e.def.draw(ctx, G, e);
  }

  // ---------------------------------------------------------------- 1-5: Tư Tế Yêu Tinh (boss08)
  const goblin_priest = {
    wiki: 'goblin_priest', name: 'Tư Tế Yêu Tinh', en: 'Goblin Priest', face: 'boss_gp_face', hp: 480,
    hb: [18, 26], hbOff: [0, 13], r: 7, speed: 3, walk: true, rest: [1.1, 1.7], shadowW: 12, hand: [7, 11],
    staffAng(e) {
      const a = e.act;
      if (a && a.pose === 'cast') return -Math.PI / 2 + 0.25 * e.face;
      if (a && a.pose === 'aim') return e.aim;
      return e.face > 0 ? -1.15 : Math.PI + 1.15;
    },
    draw(ctx, G, e) {
      drawWalker(ctx, G, e, 'boss_gp', () => {
        const [hx, hy] = hand(e);
        SK.drawGun(ctx, 'weapons2_0', hx, hy, goblin_priest.staffAng(e), null, { pages: pagesOf(e) });
      });
    },
    attacks: {
      // [WIKI] 3 thiên thạch quanh mục tiêu, nổi giận 4.
      meteors(G, e) {
        const n = e.enraged ? 4 : 3, ev = [];
        for (let i = 0; i < n; i++) ev.push([0.3 + i * 0.28, G2 => {
          const p = G2.player, a = SK.rand() * TAU, d = i === 0 ? 0 : SK.randf(14, 38);
          meteor(G2, e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 20);
        }]);
        return tl(0.3 + n * 0.28 + 0.5, ev, null, 'cast');
      },
      // [WIKI] 2 quả cầu xoay quanh trùm, 4 sát thương khi chạm.
      orbs(G, e) {
        return tl(0.7, [[0.3, G2 => {
          const a0 = SK.rand() * TAU;
          for (let i = 0; i < 2; i++) {
            e.arena.objs.push({
              t: 0, dur: 7, a: a0 + i * Math.PI, x: e.x, y: e.y,
              update(G3, o, dt) {
                if (e.st === 'dead') return false;
                o.a += dt * 3.2;
                o.x = e.x + Math.cos(o.a) * 24; o.y = e.y - 12 + Math.sin(o.a) * 20;
                const p = G3.player;
                if (Math.hypot(p.x - o.x, p.y - 7 - o.y) < 9) SK.hurtPlayer(G3, dmgOf(4));
                return o.t < o.dur;
              },
              air(ctx, G3, o) { SK.draw(ctx, 'bullet_126', o.x, o.y, { sx: 1.4, sy: 1.4 }); }
            });
          }
        }]], null, 'cast');
      },
      // [WIKI] phi tiêu để lại một hàng trụ bắn vuông góc với đường bay.
      turrets(G, e) {
        return tl(0.8, [[0.35, G2 => {
          e.aim = aimAt(G2, ...hand(e));
          const [tx, ty] = staffTip(e, e.aim, 20), dir = e.aim;
          let next = 18, dist = 0;
          shoot(G2, e, tx, ty, dir, {
            sprite: 'bullet_100', spd: 5, r: 5, dmg: 3, life: 1.8, spin: 9, h: e.y - ty,
            tick(G3, b, dt) {
              dist += Math.hypot(b.vx, b.vy) * dt;
              if (dist < next) return;
              next += 22;
              let fired = 0;
              shoot(G3, e, b.x, b.y, 0, {
                sprite: 'bullet_101', spd: 0, r: 5, dmg: 3, life: 3.6, spin: 4, h: b.h,
                tick(G4, t) {
                  if (t.age < 0.5 + fired * 0.7) return;
                  fired++;
                  for (const s of [-1, 1]) shoot(G4, e, t.x, t.y, dir + s * Math.PI / 2, { sprite: 'bullet_29', spd: 5, r: 3, dmg: 2, life: 3, h: t.h });
                }
              });
            }
          });
        }]], (G2, e2) => { e2.aim = aimAt(G2, ...hand(e2)); }, 'aim');
      },
      // [WIKI] một vòng 6 viên hình sao, mỗi viên toé 3 viên nhỏ.
      stars(G, e) {
        const waves = e.enraged ? 2 : 1, ev = [];
        for (let w = 0; w < waves; w++) ev.push([0.35 + w * 0.6, G2 => {
          const a0 = aimAt(G2, e.x, e.y - 14) + w * Math.PI / 6;
          ring(G2, e, e.x, e.y - 14, 6, a0, {
            sprite: 'bullet_16', spd: 3.5, r: 3, dmg: 3, life: 3, h: 14, spin: 6,
            tick(G3, b) {
              if (b.age < 0.8) return;
              b.dead = true;
              const r0 = SK.rand() * TAU;
              for (let k = 0; k < 3; k++) shoot(G3, e, b.x, b.y, r0 + k * TAU / 3, { sprite: 'bullet_29', spd: 6, r: 3, dmg: 2, life: 3, h: b.h });
            }
          });
        }]);
        return tl(0.35 + waves * 0.6, ev, null, 'cast');
      }
    }
  };

  // ---------------------------------------------------------------- 1-5: Mạn Đà La Quỷ (boss07)
  const TENTACLES = [[-30, -6], [30, -6], [-22, 10], [22, 10]];
  function snareBeams(G, e, k) {
    ring(G, e, e.x, e.y - 16, 16, k * Math.PI / 16, { sprite: 'bullet_27', spd: 7.5, r: 3, dmg: 3, h: 16 });
  }
  const devils_snare = {
    wiki: 'devil_s_snare', name: 'Mạn Đà La Quỷ', en: "Devil's Snare", face: 'boss_ds_face', hp: 600,
    hb: [40, 30], hbOff: [0, 15], r: 14, walk: false, rest: [0.9, 1.4], shadowW: 24, center: true,
    pick(G, e) {
      const l = ['bubbles', 'spin4', 'beams', 'pool'];
      return e.enraged ? l.concat(['rails', 'pull']) : l;
    },
    enrage(G, e) { e.bloomT = 0; for (const [dx, dy] of TENTACLES) SK.fx(G, 'spawn', e.x + dx, e.y + dy, { dur: 0.6 }); },
    tick(G, e, dt) {
      if (e.bloomT != null) e.bloomT += dt;
      const p = G.player, pts = [[0, -8, 18]];
      if (e.enraged) for (const [dx, dy] of TENTACLES) pts.push([dx, dy - 8, 7]);
      for (const [dx, dy, r] of pts) if (Math.hypot(p.x - (e.x + dx), p.y - 7 - (e.y + dy)) < r + 4) { SK.hurtPlayer(G, dmgOf(2)); break; }
    },
    draw(ctx, G, e) {
      const dead = e.deathDone && e.deathT > 1.2, pg = pagesOf(e);
      shadow(ctx, e, 24);
      SK.draw(ctx, frameOf('boss_ds_leaves'), e.x, e.y - 14, { pages: pg });
      if (!e.enraged) { SK.draw(ctx, frameOf('boss_ds_bud'), e.x, e.y - 6 + Math.round(Math.sin(e.t * 2)), { pages: pg }); return; }
      SK.draw(ctx, frameOf('boss_ds_bloom'), e.x, e.y - 4, { pages: pg });
      if (dead) { SK.draw(ctx, frameOf('boss_ds_dead'), e.x, e.y - 12); return; }
      const grow = SK.clamp((e.bloomT || 0) / 0.5, 0, 1);
      for (const [dx, dy] of TENTACLES) {
        // boss07_5..8 là xúc tu co dần; lúc đứng chỉ lắc giữa 5 và 6.
        const k = grow < 1 ? frameOf('boss_ds_sprout', grow * 0.25) : (Math.floor(e.t * 5 + dx) % 2 ? 'boss07_6' : 'boss07_5');
        SK.draw(ctx, k, e.x + dx, e.y + dy, { flip: dx < 0, pages: pg });
      }
      body(ctx, e, 'boss_ds_body', e.x, e.y - 12);
    },
    attacks: {
      // [WIKI] 18 viên bong bóng rất chậm, tự tan sau 4 giây (nổi giận bay xa hơn).
      bubbles(G, e) {
        return tl(0.8, [[0.3, G2 => ring(G2, e, e.x, e.y - 16, 18, SK.rand() * TAU,
          { sprite: 'bullet_93', spd: 1.6, r: 5, dmg: 2, life: e.enraged ? 6.5 : 4, h: 16 })]]);
      },
      // [WIKI] bắn đều từ 4 điểm theo 4 hướng rồi xoay dần; nổi giận kèm chùm độc.
      spin4(G, e) {
        const dir = SK.chance(0.5) ? 1 : -1;
        let base = SK.rand() * TAU, cd = 0;
        const ev = e.enraged ? [[1.4, G2 => snareBeams(G2, e, 0)]] : [];
        return tl(3.2, ev, (G2, e2, dt) => {
          base += dir * 1.2 * dt; cd -= dt;
          if (cd > 0) return;
          cd = 0.11;
          for (let k = 0; k < 4; k++) {
            const a = base + k * Math.PI / 2;
            shoot(G2, e2, e2.x + Math.cos(a) * 14, e2.y - 16 + Math.sin(a) * 10, a, { sprite: 'bullet_29', spd: e2.enraged ? 8.5 : 6.5, r: 3, dmg: 2, h: 16 });
          }
        });
      },
      // [WIKI] tia độc xanh bắn ra xung quanh.
      beams(G, e) { return tl(0.9, [[0, G2 => snareBeams(G2, e, 0)], [0.35, G2 => snareBeams(G2, e, 1)]]); },
      // [WIKI] vũng độc dưới chân trùm.
      pool(G, e) {
        return tl(0.6, [[0.2, () => {
          let tickT = 0;
          e.arena.objs.push({
            t: 0, dur: 6, x: e.x, y: e.y - 4,
            update(G3, o, dt) {
              tickT -= dt;
              const p = G3.player;
              if (tickT <= 0 && Math.hypot(p.x - o.x, p.y - o.y) < 44) { tickT = 1; SK.hurtPlayer(G3, 1); }
              return o.t < o.dur && e.st !== 'dead';
            },
            ground(ctx, G3, o) {
              const k = Math.min(1, o.t / 0.4) * Math.min(1, (o.dur - o.t) / 0.5);
              ctx.save(); ctx.globalAlpha = 0.55 * k;
              ctx.fillStyle = '#4ea83a'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 44, 30, 0, 0, TAU); ctx.fill();
              ctx.fillStyle = '#8fe05a';
              for (let i = 0; i < 7; i++) {
                const a = i * 0.9 + o.t * 0.7, rr = 10 + (i * 13) % 28;
                ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr * 0.6, 2 + Math.sin(o.t * 5 + i) * 1, 0, TAU); ctx.fill();
              }
              ctx.restore();
            }
          });
          explodeFx(G, e.x, e.y - 4, true, true, 0.9);
        }]]);
      },
      // [WIKI] nổi giận: 4 viên nhanh từ xúc tu về 4 góc phòng, để lại vệt bong bóng.
      rails(G, e) {
        return tl(1.0, [[0.35, G2 => {
          const r = e.room, T = SK.TILE;
          const corners = [[r.x0 * T, r.y0 * T], [(r.x1 + 1) * T, r.y0 * T], [r.x0 * T, (r.y1 + 1) * T], [(r.x1 + 1) * T, (r.y1 + 1) * T]];
          TENTACLES.forEach(([dx, dy], i) => {
            const x = e.x + dx, y = e.y + dy - 14, a = angTo(x, y, corners[i][0], corners[i][1]);
            let cd = 0;
            shoot(G2, e, x, y, a, {
              sprite: 'bullet_39', spd: 12, r: 5, dmg: 3, h: 14,
              tick(G3, b, dt) {
                cd -= dt; if (cd > 0) return; cd = 0.12;
                for (const s of [-1, 1]) shoot(G3, e, b.x, b.y, a + s * Math.PI / 2, { sprite: 'bullet_93', spd: 1.3, r: 4, dmg: 2, life: 3.5, h: b.h });
              }
            });
          });
        }]]);
      },
      // [WIKI] nổi giận: sóng hút người chơi về phía trùm, tường cản được.
      pull(G, e) {
        return tl(2.4, [], (G2, e2, dt, t) => {
          const p = G2.player;
          if (p.st !== 'dead') {
            const a = angTo(p.x, p.y, e2.x, e2.y);
            SK.moveBox(G2.map, p, Math.cos(a) * 2.6 * U * dt, Math.sin(a) * 2.6 * U * dt, p.h.body.r);
          }
          if (Math.floor(t / 0.3) !== Math.floor((t - dt) / 0.3)) {
            e2.arena.objs.push({
              t: 0, dur: 0.6,
              ground(ctx, G3, o) {
                const k = o.t / o.dur;
                ctx.save(); ctx.strokeStyle = 'rgba(160,255,140,' + (0.7 * (1 - k)) + ')'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.ellipse(e2.x, e2.y - 6, 120 * (1 - k) + 10, 80 * (1 - k) + 6, 0, 0, TAU); ctx.stroke(); ctx.restore();
              }
            });
          }
        });
      }
    }
  };

  // ---------------------------------------------------------------- 2-5: Đại Hiệp Sĩ (boss01)
  const grand_knight = {
    wiki: 'grand_knight', name: 'Đại Hiệp Sĩ', en: 'Grand Knight', face: 'boss_gk_face', hp: 720,
    hb: [20, 30], hbOff: [0, 15], r: 8, speed: 3.4, walk: true, rest: [1.0, 1.5], enrageSpd: 1.3, shadowW: 14, hand: [10, 24],
    draw(ctx, G, e) {
      drawWalker(ctx, G, e, 'boss_gk', () => {
        const [hx, hy] = hand(e), pg = pagesOf(e);
        // Chân dung boss_01: kiếm dựng mũi xuống bên tay phải, chuôi ngang vai.
        const ang = e.swordAng != null && e.act ? e.swordAng : (e.face > 0 ? 1.35 : Math.PI - 1.35);
        SK.drawGun(ctx, frameOf('boss_gk_sword'), hx, hy, ang, [10, 0], { pages: pg });
        const bash = e.act && e.act.name === 'bash' ? 3 : 0;
        SK.draw(ctx, frameOf('boss_gk_shield'), e.x - (8 - bash) * e.face, e.y - 13, { flip: e.face < 0, pages: pg });
      });
    },
    attacks: {
      // [WIKI] chém hai nhát, mỗi nhát một vòng cung đạn tam giác.
      slash(G, e) {
        let side = 1;
        const cut = (G2, e2) => {
          const [hx, hy] = hand(e2);
          e2.aim = aimAt(G2, hx, hy);
          SK.fx(G2, 'slash', hx, hy, { ang: e2.aim, reach: 26, arc: 2.4, dur: 0.18, enemy: true });
          fan(G2, e2, hx, hy, 9, e2.aim, SK.deg(120), { sprite: 'bullet_135', rot0: -Math.PI / 2, spd: 8, r: 3, dmg: 4, h: 13 });
          side = -side;
        };
        return tl(1.25, [[0.4, cut], [0.85, cut]], (G2, e2, dt, t) => {
          const aim = aimAt(G2, ...hand(e2));
          const swing = t < 0.4 ? -1.6 * side * SK.clamp(t / 0.3, 0, 1) : 1.4 * side;
          e2.swordAng = aim + swing * e2.face;
        });
      },
      // [WIKI] 6 quả cầu lớn, chạm là vỡ thành đạn nhỏ; nổi giận kèm vòng đạn chữ thập.
      splinter(G, e) {
        return tl(1.0, [[0.45, (G2, e2) => {
          const [hx, hy] = hand(e2), a = aimAt(G2, hx, hy);
          fan(G2, e2, hx, hy, 6, a, SK.deg(70), {
            sprite: 'bullet_115', spd: 6, r: 6, dmg: 5, life: 4, h: 13,
            onEnd(G3, b) { ring(G3, e2, b.px, b.py, 8, SK.rand() * TAU, { sprite: 'bullet_29', spd: 5.5, r: 3, dmg: 3, life: 3, h: b.h }); }
          });
          if (e2.enraged) ring(G2, e2, e2.x, e2.y - 14, 8, a + Math.PI / 8, { sprite: 'bullet_90', spd: 5, r: 5, dmg: 3, spin: 6, h: 14 });
        }]], (G2, e2) => { e2.swordAng = -Math.PI / 2 + 0.3 * e2.face; });
      },
      // [WIKI] đâm kiếm, một khối đạn nhỏ xếp hình tam giác bay thẳng.
      stab(G, e) {
        let aim = 0;
        return tl(1.1, [[0.45, (G2, e2) => {
          const [hx, hy] = hand(e2), c = Math.cos(aim), s = Math.sin(aim);
          const tipX = hx + c * 24, tipY = hy + s * 24;
          for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) {
            const lat = (k - row / 2) * 7, back = row * 7;
            shoot(G2, e2, tipX - c * back - s * lat, tipY - s * back + c * lat, aim, { sprite: 'bullet_107', spd: 9, r: 3, dmg: 3, h: 13 });
          }
        }]], (G2, e2, dt, t) => {
          if (t < 0.45) { aim = aimAt(G2, ...hand(e2)); e2.swordAng = aim; }
          else if (t < 0.6) dash(G2, e2, aim, 6, dt);
        });
      },
      // [WIKI] thúc khiên, bắn đạn chữ thập ra xung quanh.
      bash(G, e) {
        let aim = 0;
        const burst = k => (G2, e2) => ring(G2, e2, e2.x, e2.y - 14, 8, aim + k * Math.PI / 8, { sprite: 'bullet_90', spd: 5.5, r: 5, dmg: 3, spin: 5, h: 14 });
        return tl(1.3, [[0.3, (G2, e2) => { aim = aimAt(G2, e2.x, e2.y - 14); }], [0.7, burst(0)], [0.9, burst(1)]], (G2, e2, dt, t) => {
          if (t > 0.3 && t < 0.65) dash(G2, e2, aim, 11, dt);
        });
      }
    }
  };

  // ---------------------------------------------------------------- 2-5: Đại Pháp Sư (boss02)
  function beamEnd(G, x, y, a) {
    let len = 0;
    while (len < 420 && !W.solidAt(G.map, x + Math.cos(a) * len, y + Math.sin(a) * len + 10)) len += 3;
    return len;
  }
  const grand_wizard = {
    wiki: 'grand_wizard', name: 'Đại Pháp Sư', en: 'Grand Wizard', face: 'boss_gw_face', hp: 600,
    hb: [18, 26], hbOff: [0, 13], r: 7, speed: 2.8, walk: true, rest: [1.0, 1.5], shadowW: 11, hand: [7, 11],
    draw(ctx, G, e) {
      drawWalker(ctx, G, e, 'boss_gw', () => {
        const [hx, hy] = hand(e);
        const a = e.act && e.act.pose === 'aim' ? e.aim : e.act && e.act.pose === 'cast' ? -Math.PI / 2 + 0.2 * e.face : (e.face > 0 ? -1.2 : Math.PI + 1.2);
        SK.drawGun(ctx, 'weapons3_132', hx, hy, a, null, { pages: pagesOf(e) });
      });
    },
    attacks: {
      // [WIKI] tia laser quét ngang phòng, 5 sát thương. Vạch báo trước đúng góc bắt đầu quét.
      laser(G, e) {
        const dir = SK.chance(0.5) ? 1 : -1, sweep = 1.25, warnT = 0.8, fireT = 1.6;
        let a0 = 0;
        const beam = { t: 0, on: false, a: 0 };
        e.arena.objs.push({
          t: 0, dur: warnT + fireT,
          update(G3, o) {
            if (e.st === 'dead') return false;
            const [ox, oy] = staffTip(e, beam.a, 26);
            beam.ox = ox; beam.oy = oy; beam.len = beamEnd(G3, ox, oy, beam.a);
            if (beam.on) {
              const p = G3.player, px = p.x - ox, py = p.y - 7 - oy, c = Math.cos(beam.a), s = Math.sin(beam.a);
              const along = px * c + py * s, off = Math.abs(-px * s + py * c);
              if (along > 0 && along < beam.len && off < 7) SK.hurtPlayer(G3, dmgOf(5));
            }
            return o.t < o.dur;
          },
          air(ctx, G3, o) {
            if (beam.len == null) return;
            const ex = beam.ox + Math.cos(beam.a) * beam.len, ey = beam.oy + Math.sin(beam.a) * beam.len;
            ctx.save();
            if (!beam.on) {
              ctx.strokeStyle = 'rgba(255,60,90,' + (0.35 + 0.35 * Math.sin(o.t * 40)) + ')'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(beam.ox, beam.oy); ctx.lineTo(ex, ey); ctx.stroke();
            } else {
              ctx.lineCap = 'round';
              ctx.strokeStyle = 'rgba(255,70,200,0.45)'; ctx.lineWidth = 11 + Math.sin(o.t * 50) * 2;
              ctx.beginPath(); ctx.moveTo(beam.ox, beam.oy); ctx.lineTo(ex, ey); ctx.stroke();
              ctx.strokeStyle = '#ff9ae8'; ctx.lineWidth = 6;
              ctx.beginPath(); ctx.moveTo(beam.ox, beam.oy); ctx.lineTo(ex, ey); ctx.stroke();
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(beam.ox, beam.oy); ctx.lineTo(ex, ey); ctx.stroke();
              ctx.fillStyle = 'rgba(255,200,250,0.8)';
              ctx.beginPath(); ctx.arc(ex, ey, 5 + Math.sin(o.t * 40) * 1.5, 0, TAU); ctx.fill();
            }
            ctx.restore();
          }
        });
        return tl(warnT + fireT + 0.2, [[warnT, () => { beam.on = true; G.shake = Math.max(G.shake, 2); }]], (G2, e2, dt, t) => {
          if (t < 0.05) a0 = aimAt(G2, ...hand(e2)) - dir * sweep;
          beam.a = t < warnT ? a0 : a0 + dir * 2 * sweep * SK.clamp((t - warnT) / fireT, 0, 1);
          e2.aim = beam.a;
        }, 'aim');
      },
      // [WIKI] nhiều khối hình học xoay tròn bay tới.
      geo(G, e) {
        const volley = (G2, e2) => {
          const [ox, oy] = staffTip(e2, -Math.PI / 2, 20), mid = aimAt(G2, ox, oy);
          const n = e2.enraged ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = mid + (i - (n - 1) / 2) * 0.38, hub = { x: ox, y: oy, a: SK.rand() * TAU, vx: Math.cos(a) * 4.5 * U, vy: Math.sin(a) * 4.5 * U, t: -1 };
            for (let k = 0; k < 4; k++) {
              shoot(G2, e2, ox, oy, 0, {
                sprite: 'bullet_126', spd: 0, r: 3, dmg: 3, life: 4.5, h: e2.y - oy,
                tick(G3, b, dt) {
                  if (hub.t !== b.age) { hub.t = b.age; hub.x += hub.vx * dt; hub.y += hub.vy * dt; hub.a += dt * 4 * (i % 2 ? 1 : -1); }
                  const rr = Math.min(10, 4 + b.age * 20);
                  b.x = hub.x + Math.cos(hub.a + k * Math.PI / 2) * rr; b.y = hub.y + Math.sin(hub.a + k * Math.PI / 2) * rr;
                }
              });
            }
          }
        };
        return tl(1.4, [[0.35, volley], [0.95, volley]], null, 'cast');
      },
      // [WIKI] hai vòng đạn chậm, nảy tường, 4 sát thương.
      rings(G, e) {
        const o = { sprite: 'bullet_28', spd: 3.2, r: 4, dmg: 4, life: 7, bounce: 2, h: 14 };
        return tl(1.0, [[0.3, G2 => ring(G2, e, e.x, e.y - 14, 20, 0, o)], [0.75, G2 => ring(G2, e, e.x, e.y - 14, 20, Math.PI / 20, o)]], null, 'cast');
      },
      // [WIKI] phun đạn tản, bám theo khi mục tiêu di chuyển.
      spray(G, e) {
        let cd = 0;
        return tl(2.0, [], (G2, e2, dt, t) => {
          const [hx, hy] = hand(e2);
          e2.aim = aimAt(G2, hx, hy);
          cd -= dt;
          if (t < 0.3 || cd > 0) return;
          cd = 0.08;
          const [ox, oy] = staffTip(e2, e2.aim, 24);
          shoot(G2, e2, ox, oy, e2.aim + SK.randf(-0.42, 0.42), { sprite: 'bullet_126', spd: SK.randf(6, 9), r: 3, dmg: 3, h: e2.y - oy });
        }, 'aim');
      }
    }
  };

  // ---------------------------------------------------------------- 3-5: Giun Cát Núi Lửa (boss11)
  function wormStar(G, e, x, y, diag) {
    shoot(G, e, x, y - 6, 0, {
      sprite: 'bullet_14', spd: 0, r: 4, dmg: 3, life: 1.8, spin: 6, h: 6,
      tick(G2, b) {
        const v = Math.floor((b.age - 0.3) / 0.4);
        if (b.age < 0.3 || v <= (b.volley == null ? -1 : b.volley)) return;
        b.volley = v;
        if (v < 3) for (let k = 0; k < 4; k++) shoot(G2, e, b.x, b.y, k * Math.PI / 2 + (diag ? Math.PI / 4 : 0), { sprite: 'bullet_21', spd: 7, r: 3, dmg: 3, h: 6 });
        else if (v === 3) shoot(G2, e, b.x, b.y, aimAt(G2, b.x, b.y), { sprite: 'bullet_21', spd: 8, r: 3, dmg: 3, h: 6 });
      }
    });
  }
  const volcanic_sandworm = {
    wiki: 'volcanic_sandworm', name: 'Giun Cát Núi Lửa', en: 'Volcanic Sandworm', face: 'boss_sw_face', hp: 960,
    hb: [24, 22], hbOff: [0, 18], r: 10, walk: false, rest: [0.8, 1.3], shadowW: 18,
    draw(ctx, G, e) {
      const pg = pagesOf(e);
      if (e.deathDone && e.deathT > 1.2) return SK.draw(ctx, frameOf('boss_sw_dead'), e.x, e.y);
      if (e.under) { SK.draw(ctx, frameOf('boss_sw_trail', e.t), e.x, e.y); return; }
      const a = e.act, pose = a && a.pose;
      // Ụ đất: dâng lên khi trồi, hạ xuống khi lặn.
      let mk = 0.5;
      if (pose === 'dig') mk = 0.49 - SK.clamp(a.t / 0.45, 0, 1) * 0.49;
      if (pose === 'rise') mk = SK.clamp(e.riseT / 0.45, 0, 1) * 0.49;
      shadow(ctx, e, 18);
      SK.draw(ctx, frameOf('boss_sw_mound', mk), e.x, e.y, { pages: pg });
      const sink = pose === 'dig' ? SK.clamp(a.t / 0.45, 0, 1) * 18 : pose === 'rise' ? (1 - SK.clamp(e.riseT / 0.45, 0, 1)) * 18 : 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(e.x - 40, e.y - 80, 80, 80 - 8); ctx.clip();
      body(ctx, e, pose === 'tilt' ? 'boss_sw_tilt' : 'boss_sw_head', e.x, e.y - 10 + sink);
      ctx.restore();
    },
    pick(G, e) { return e.sinceDig >= 2 ? ['bomb', 'spread', 'dig', 'dig'] : ['bomb', 'spread']; },
    tick(G, e, dt) { if (e.riseT != null) e.riseT += dt; },
    attacks: {
      // [WIKI] ngửa người, phun một quả nổ lớn (nổi giận 3 quả), 5 sát thương vùng rộng.
      bomb(G, e) {
        e.sinceDig = (e.sinceDig || 0) + 1;
        return tl(1.2, [[0.55, (G2, e2) => {
          const x = e2.x + 6 * e2.face, y = e2.y - 22, a = aimAt(G2, x, y);
          fan(G2, e2, x, y, e2.enraged ? 3 : 1, a, SK.deg(40), {
            sprite: frameOf('boss_sw_shot'), spd: 6.5, r: 6, dmg: 5, life: 3.5, h: 22,
            onEnd(G3, b) { blast(G3, b.px, b.py + b.h - 6, 34, 5); }
          });
          G2.shake = Math.max(G2.shake, 2);
        }]], null, 'tilt');
      },
      // [WIKI] 8 viên lớn (nổi giận 12) toả rộng, chậm dần, nổ nhỏ khi chạm, 4 sát thương.
      spread(G, e) {
        e.sinceDig = (e.sinceDig || 0) + 1;
        return tl(1.1, [[0.55, (G2, e2) => {
          const x = e2.x + 6 * e2.face, y = e2.y - 22, a = aimAt(G2, x, y);
          fan(G2, e2, x, y, e2.enraged ? 12 : 8, a, SK.deg(110), {
            sprite: 'bullet_37', spd: 10, decel: 1.3, r: 5, dmg: 4, life: 1.7, h: 22,
            onEnd(G3, b) { blast(G3, b.px, b.py, 12, 4); }
          });
        }]], null, 'tilt');
      },
      // [WIKI] lặn xuống để lại ngôi sao bắn 13 tia chữ thập; dưới đất thì không trúng đạn;
      // trồi lên gây sóng chấn động + sao + 12 viên nảy (nổi giận thêm 12 bong bóng).
      dig(G, e) {
        e.sinceDig = 0;
        const under = e.enraged ? 1.4 : 2.2, lock = 0.6, t0 = 0.45, rise = t0 + under;
        const shock = (G2, e2) => {
          SK.fx(G2, 'ring', e2.x, e2.y, { dur: 0.45, color: '#b0784a' });
          const p = G2.player;
          if (Math.hypot(p.x - e2.x, p.y - e2.y) < 26) SK.hurtPlayer(G2, dmgOf(4));
          G2.shake = Math.max(G2.shake, 3);
        };
        const act = tl(rise + 0.7, [
          [0.05, shock],
          [0.1, (G2, e2) => wormStar(G2, e2, e2.x, e2.y, e2.enraged)],
          [t0, (G2, e2) => { e2.under = true; e2.st = 'spawn'; e2.stT = 1e9; act.pose = 'under'; }],
          [rise - lock, (G2, e2) => warn(e2.arena, e2.x, e2.y, 26, lock)],
          [rise, (G2, e2) => {
            e2.under = false; e2.st = 'idle'; e2.stT = 0; e2.riseT = 0; act.pose = 'rise';
            shock(G2, e2);
            explodeFx(G2, e2.x, e2.y, false, false, 0.8);
            wormStar(G2, e2, e2.x, e2.y, e2.enraged);
            ring(G2, e2, e2.x, e2.y - 16, 12, SK.rand() * TAU, { sprite: 'bullet_29', spd: 5, r: 3, dmg: 4, bounce: 1, h: 16 });
            if (e2.enraged) ring(G2, e2, e2.x, e2.y - 16, 12, SK.rand() * TAU, { sprite: 'bullet_93', spd: 1.5, r: 4, dmg: 2, life: 5, h: 16 });
          }]
        ], (G2, e2, dt, t) => {
          if (t < t0 || t > rise - lock) return;
          const p = G2.player, a = angTo(e2.x, e2.y, p.x, p.y), d = Math.hypot(p.x - e2.x, p.y - e2.y);
          if (d > 4) SK.moveBox(G2.map, e2, Math.cos(a) * Math.min(d, (e2.enraged ? 7 : 5.5) * U * dt), Math.sin(a) * Math.min(d, (e2.enraged ? 7 : 5.5) * U * dt), e2.r);
          e2.face = Math.cos(a) >= 0 ? 1 : -1;
        }, 'dig');
        return act;
      }
    }
  };

  const BOSSES = SK.BOSSES = { goblin_priest, devils_snare, grand_knight, grand_wizard, volcanic_sandworm };
  // Trùm theo theme: [WIKI] found_in. Anubis (3-5) chưa có khung trong kho bóc (thiếu boss17) nên chưa đưa vào.
  const THEME_BOSSES = { forest: ['goblin_priest', 'devils_snare'], castle: ['grand_knight', 'grand_wizard'], volcano: ['volcanic_sandworm'] };
  SK.bossDebug = { force: null };

  // ---------------------------------------------------------------- tạo trùm
  function makeBoss(G, key, room) {
    const def = BOSSES[key], wk = WK[def.wiki] || {};
    const hp = wk.hp || def.hp;   // [WIKI] máu trùm chế độ thường
    const p = G.player, T = SK.TILE;
    let [x, y] = W.roomCenter(room);
    y += 4;
    if (!def.center && Math.hypot(p.x - x, p.y - y) < 72) {
      const a = angTo(p.x, p.y, x, y);
      [x, y] = SK.freeNear([x + Math.cos(a) * 4 * T, y + Math.sin(a) * 4 * T]);
    }
    const e = {
      id: 'boss_' + key, bossKey: key, def, d: { shadow: null, speed: def.speed || 3 }, p: { kinematic: 1, reward_rate: 0 },
      cls: 'SKBoss', rawCls: 'SKBoss', x, y, kx: 0, ky: 0, hp, hpMax: hp, face: p.x > x ? 1 : -1, aim: 0,
      st: 'spawn', stT: 1e9, t: 0, cd: 0, room, elite: false, flash: 0, w: null, anims: { dead: true },
      r: def.r, hb: { size: def.hb.slice(), off: def.hbOff.slice() }, scale: 1, burst: 0,
      used: {}, rest: 0.5, act: null, enraged: false, moving: false, deathDone: false, deathT: 0,
      lastX: x, lastY: y, draw: drawBoss
    };
    e.arena = makeArena(G, e);
    SK.fx(G, 'ring', x, y, { dur: 0.6, color: '#ffffff' });
    return e;
  }
  for (const key of Object.keys(BOSSES)) SK.CUSTOM_ENEMIES['boss_' + key] = (G, x, y, room) => makeBoss(G, key, room);

  SK.bossWaves = function (G) {
    const list = THEME_BOSSES[G.stage.theme] || Object.keys(BOSSES);
    const key = SK.bossDebug.force && BOSSES[SK.bossDebug.force] ? SK.bossDebug.force : SK.pick(list);
    return [['boss_' + key]];
  };
  // Não trùm chạy trong prop sàn đấu; core vẫn gọi SK.AI[cls] ở trạng thái thường.
  SK.AI.SKBoss = function () {};

  function onBossDeath(G, e) {
    e.deathDone = true; e.deathT = 0; e.act = null; e.under = false;
    e.x = e.lastX; e.y = e.lastY;
    const A = e.arena;
    freeze(G, A, false);
    A.tracked = [];
    for (const b of G.bullets) if (b.side === 'e') b.dead = true;
    for (const o of G.enemies) if (o !== e && o.room === e.room && o.st !== 'dead') { o.st = 'dead'; o.hp = 0; o.stT = 0; }
    A.objs = [];
    let next = 0;
    A.objs.push({
      t: 0, dur: 1.6, big: false,
      update(G2, o) {
        if (o.t >= next && o.t < 1.1) {
          next += 0.15;
          explodeFx(G2, e.x + SK.randf(-16, 16), e.y - SK.randf(4, 30), false, false, SK.randf(0.5, 0.8));
          G2.shake = Math.max(G2.shake, 4);
        }
        if (o.t >= 1.2 && !o.big) {
          o.big = true;
          explodeFx(G2, e.x, e.y - 12, true, false, 1.2);
          G2.shake = Math.max(G2.shake, 7);
          // [ƯỚC LƯỢNG] trùm SK văng một nắm xu + năng lượng khi chết.
          for (let i = 0; i < 6; i++) SK.dropPickup(G2, 'coin', e.x, e.y - 6);
          for (let i = 0; i < 6; i++) SK.dropPickup(G2, 'energy', e.x, e.y - 6);
        }
        return o.t < o.dur;
      }
    });
  }
  SK.on('enemyKill', (G, e) => { if (e.bossKey && !e.deathDone) onBossDeath(G, e); });

  // ---------------------------------------------------------------- HUD: giới thiệu + thanh máu
  SK.bossHud = { visible: false, intro: false, name: null, hp: 0, hpMax: 0 };
  function currentBoss(G) {
    for (const e of G.enemies) if (e.bossKey && e.room === G.room && !e.arena.done) return e;
    return null;
  }

  // Kéo camera về trùm lúc giới thiệu: render() nội suy 18% về phía người chơi mỗi khung,
  // nên đặt G.cam ở điểm mà sau bước nội suy đó khung hình rơi đúng chỗ muốn.
  function focusCam(G, e, k) {
    const v = SK.view, p = G.player, lead = p.target ? 14 : 6;
    const tx = p.x - v.w / 2 + Math.cos(p.aim) * lead, ty = p.y - 10 - v.h / 2 + Math.sin(p.aim) * lead;
    const dx = tx + (e.x - v.w / 2 - tx) * k, dy = ty + (e.y - 20 - v.h / 2 - ty) * k;
    G.cam.x = (dx - 0.18 * tx) / 0.82; G.cam.y = (dy - 0.18 * ty) / 0.82;
  }

  function drawIntro(ctx, G, e, t) {
    const v = SK.view, def = e.def;
    const inK = smooth(t / 0.35), outK = smooth((INTRO - t) / 0.35), k = Math.min(inK, outK);
    // BossInfo gốc: hai dải đen mask1/mask2 (#202020) + băng đỏ tía (0.585, 0.135, 0.259) + chân dung + tên.
    const bar = Math.round(24 * k);
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, v.w, bar); ctx.fillRect(0, v.h - bar, v.w, bar);
    const slide = smooth((t - 0.15) / 0.4), bandH = 40, by = Math.round(v.h * 0.6), bx = Math.round((slide - 1) * v.w);
    ctx.save(); ctx.globalAlpha = outK;
    ctx.fillStyle = '#952142'; ctx.fillRect(bx, by, v.w, bandH);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx, by + bandH - 3, v.w, 3);
    const face = frameOf(def.face);
    if (face) SK.draw(ctx, face, bx + 46, by + bandH);
    SK.text(ctx, def.name, bx + 84, by + 15, 20, '#ffffff', 'left', 'rgba(0,0,0,0.5)');
    SK.text(ctx, def.en, bx + 85, by + 31, 9, '#ffc7d2', 'left', 'rgba(0,0,0,0.5)');
    ctx.restore();
  }

  function drawBar(ctx, G, e) {
    const v = SK.view, A = e.arena;
    const bw = Math.round(SK.clamp(v.w - 230, 90, 170)), x = Math.round(v.w / 2 - bw / 2), y = 5, h = 7;
    ctx.fillStyle = '#000000'; ctx.fillRect(x - 1, y - 1, bw + 2, h + 2);
    ctx.fillStyle = '#252525'; ctx.fillRect(x, y, bw, h);
    const k = SK.clamp(e.hp / e.hpMax, 0, 1), kt = SK.clamp(A.barHp / e.hpMax, 0, 1);
    ctx.fillStyle = '#f2d7d7'; ctx.fillRect(x, y, Math.round(bw * kt), h);
    ctx.fillStyle = '#e83c3c'; ctx.fillRect(x, y, Math.round(bw * k), h);
    ctx.fillStyle = '#ff8a7a'; ctx.fillRect(x, y, Math.round(bw * k), 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + Math.round(bw * ENRAGE_AT), y, 1, h);
    SK.text(ctx, e.def.name + (e.enraged ? ' · nổi giận' : ''), v.w / 2, y + h + 6, 8, e.enraged ? '#ffb0a0' : '#ffffff', 'center', '#000');
    return { x, y, w: bw, h };
  }

  SK.on('hud', (ctx, G) => {
    const H = SK.bossHud, e = currentBoss(G);
    H.visible = false; H.intro = false;
    if (!e) return;
    const A = e.arena;
    H.name = e.def.name; H.hp = Math.max(0, e.hp); H.hpMax = e.hpMax; H.key = e.bossKey;
    if (A.introT < INTRO) {
      H.intro = true;
      focusCam(G, e, smooth(Math.min(A.introT / 0.4, (INTRO - A.introT) / 0.5)));
      drawIntro(ctx, G, e, A.introT);
      return;
    }
    if (e.st === 'dead' || e.deathDone) return;
    H.visible = true;
    H.rect = drawBar(ctx, G, e);
  });
})();
