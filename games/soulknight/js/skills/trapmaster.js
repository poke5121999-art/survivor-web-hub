// Kỹ năng Bậc Thầy Cạm Bẫy (c25): telecontrolled_bomb, master_s_trick, hat_trick. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS;
  const { cfg, CTRL, fx, hit, inRadius, nearest, ec, alive, setMul, hurtMods, layer, DUR_UI, debuff } = K;
  const U = SK.PPU, T = SK.TILE, I = SK.input;
  const C = (f, d) => CTRL('trapmaster', f, d);   // ctrlFields của C26Controller [ĐO hero.json]
  const kill = h => { if (h) { if (h.stop) h.stop(); if (h.kill) h.kill(); } };

  // ================================================================ BOM ĐIỀU KHIỂN (skill 0)
  // [ĐO c25/skill 1: cd 10, dur 5; C26Controller skill1BombNum 3, initSkill1BombDamage 16, aroundRadius 4, throwingRadius 5,5 ± 1,5]
  // + [WIKI]: 3 bom quay quanh người 5 s; quái chạm bom thì bị dính (quái thường hút 1 quả, tinh anh 3, trùm hút hết), nổ 16 + cháy;
  // bấm lại: nổ lần lượt từng quả đang dính, hết quả dính thì ném một quả đang quay ra nổ ngay; hết thời lượng nổ cả loạt.
  const BM = { spin: 2.4, squash: 0.75, touch: 5, blast: 2.5 * T, fly: 0.3, fuse: 0.12 };   // tốc quay, dẹt theo phối cảnh, tầm chạm, bán kính nổ [ƯỚC LƯỢNG], thời gian ném
  const bombOf = e => e._bombs || 0;
  const bombCap = e => (e.boss ? 99 : e.elite ? 3 : 1);   // [WIKI]
  function bombFx(G, b, state) {
    kill(b.h);
    b.h = fx(G, 'trapmaster_bomb', b.x, b.y, { follow: b, dy: -6, dur: 1e6, state, layer: 'top' });
  }
  S.telecontrolled_bomb = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'telecontrolled_bomb').dur || 5;
      const n = C('skill1BombNum', 3);
      const st = p._bomb = { t: 0, list: [] };
      for (let i = 0; i < n; i++) {
        const b = { x: p.x, y: p.y, a: i * Math.PI * 2 / n, state: 'idle', e: null, t: 0 };
        st.list.push(b); bombFx(G, b, 'showUp');
      }
    },
    update(G, p, dt) {
      const st = p._bomb; if (!st) return;
      st.t += dt;
      const ring = C('aroundRadius', 4) * U;
      for (const b of st.list) {
        b.t += dt;
        if (b.state === 'idle') {
          b.a += BM.spin * dt;
          b.x = p.x + Math.cos(b.a) * ring; b.y = p.y - 8 + Math.sin(b.a) * ring * BM.squash;
          // Quái chạm bom thì bị dính, tối đa theo cấp quái.
          for (const e of G.enemies) {
            if (!alive(e) || bombOf(e) >= bombCap(e) || !K.inRoom(G, e)) continue;
            const [cx, cy] = ec(e);
            if (Math.hypot(cx - b.x, cy - b.y) < e.r + BM.touch) { b.state = 'stuck'; b.e = e; e._bombs = bombOf(e) + 1; b.stuckAt = st.t; bombFx(G, b, 'active'); break; }
          }
        } else if (b.state === 'stuck') {
          if (!alive(b.e)) { b.e._bombs = Math.max(0, bombOf(b.e) - 1); b.e = null; b.state = 'idle'; bombFx(G, b, 'ide'); continue; }
          const [cx, cy] = ec(b.e); b.x = cx; b.y = cy - 4;
        } else if (b.state === 'throw') {
          const k = Math.min(1, (st.t - b.t0) / BM.fly);
          b.x = b.x0 + (b.tx - b.x0) * k; b.y = b.y0 + (b.ty - b.y0) * k - Math.sin(k * Math.PI) * 14;
          if (k >= 1) { b.state = 'gone'; blast(G, p, b.tx, b.ty, b); }
        }
      }
      st.list = st.list.filter(b => b.state !== 'gone');
    },
    press(G, p) {
      const st = p._bomb; if (!st) return;
      const stuck = st.list.filter(b => b.state === 'stuck').sort((a, b) => a.stuckAt - b.stuckAt)[0];
      if (stuck) { detonate(G, p, stuck); return; }
      const idle = st.list.find(b => b.state === 'idle');
      if (!idle) return;
      // Ném quả đang quay tới quái gần nhất (không có thì hướng ngẫu nhiên) cách 5,5 ± 1,5 đơn vị rồi nổ [ĐO throwingRadius].
      const e = nearest(G, p.x, p.y - 6, 12 * U);
      const ang = e ? Math.atan2(ec(e)[1] - p.y, ec(e)[0] - p.x) : SK.rand() * Math.PI * 2;
      const d = e ? Math.min(Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y), C('throwingRadius', 5.5) * U) : (C('throwingRadius', 5.5) + SK.randf(-1, 1) * C('throwingRandomRadius', 1.5)) * U;
      Object.assign(idle, { state: 'throw', t0: st.t, x0: idle.x, y0: idle.y, tx: p.x + Math.cos(ang) * d, ty: p.y - 6 + Math.sin(ang) * d });
    },
    end(G, p) {
      const st = p._bomb; p._bomb = null;
      if (!st) return;
      for (const b of st.list) if (b.state !== 'gone') { b.state = 'gone'; detonate(G, p, b); }
    }
  };
  DUR_UI.telecontrolled_bomb = 5;
  function detonate(G, p, b) {
    if (b.e) b.e._bombs = Math.max(0, bombOf(b.e) - 1);
    b.state = 'gone';
    blast(G, p, b.x, b.y, b);
  }
  function blast(G, p, x, y, b) {
    kill(b.h);
    fx(G, 'explode_hit_enemy_clean_bullet', x, y, { layer: 'top' });
    G.shake = Math.max(G.shake, 2);
    for (const e of inRadius(G, x, y, BM.blast)) {
      debuff(G, e, 'fire');
      hit(G, p, e, C('initSkill1BombDamage', 16), { critChance: 0, repel: 2, ang: Math.atan2(e.y - y, e.x - x), tag: 'skill' });
    }
  }

  // ================================================================ NGƯỜI KHỔNG LỒ / MÀN ẢO THUẬT (skill 1)
  // [ĐO c25/skill 2: cd 5, dur 10; C26Controller initHookNum 2, initExplodeDamage 30, initAbsorbEnergyNum 2, initLockEnemyDistance 12,
  // initStealthDuration 3; AppearingPersonCtrl hookCd 1,2, maxHookNum 3, hookData damage 2 / maxDistance 12 / recoveryBackSpeed 20 /
  // recoveryDistance 0,75; TarpMasterSkill2StingCtrl damage 2, hitCd 0,5] + [WIKI]: tàng hình + bất tử 3 s, chạy +33,33%, không tan khi
  // đánh; hình nộm ở chỗ đứng (bốc lên 1,7 s) kéo quái bằng móc, mỗi quái bị móc hồi 2 năng lượng, gai quanh nó đâm 2 mỗi 0,5 s,
  // hết 10 s thì nổ 30.
  const TR = { move: 4 / 3, rise: 1.7, lure: 40, blast: 4 * T, hookOut: 0.18, hitR: 10 };   // chạy [WIKI], thời gian bốc lên [WIKI], lực dụ [ƯỚC LƯỢNG], bán kính nổ [ƯỚC LƯỢNG], thời gian móc bay ra
  const HOOK_DMG = 2;   // AppearingPersonCtrl.hookData.damage [ĐO]
  const dollFrames = () => {
    const f = SK.D.extra && SK.D.extra.sprites || {};
    const up = (f['^trapMaster_0_skill2'] || []).filter(n => /show_up_0_\d+$/.test(n));
    const idle = (f['^tarpMaster_0_skill2'] || []).filter(n => /idle_\d+$/.test(n));
    return { up, idle };
  };
  S.master_s_trick = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'master_s_trick').dur || 10;
      const st = p._trick = { t: 0, stealth: C('initStealthDuration', 3), x: p.x, y: p.y, hooks: [], hookT: 0, hitAt: new Map(), dead: false };
      p.hidden = true; p._alpha = 0.35;   // [ĐO buff_stealth: alpha 0,297] nhưng vẫn cần thấy chính mình khi chơi
      hurtMods(p).trick = () => 0;
      setMul(p, 'moveMul', 'trick', TR.move);
      fx(G, 'explode_hit_enemy_only', p.x, p.y - 4, { layer: 'top', scale: 0.6 });
      doll(G, p, st);
    },
    update(G, p, dt) {
      const st = p._trick; if (!st) return;
      st.stealth -= dt;
      if (st.stealth <= 0 && p.hidden) { p.hidden = false; p._alpha = null; delete hurtMods(p).trick; setMul(p, 'moveMul', 'trick', 1); }
    },
    end(G, p) {
      const st = p._trick; p._trick = null;
      p.hidden = false; p._alpha = null; delete hurtMods(p).trick; setMul(p, 'moveMul', 'trick', 1);
      if (!st) return;
      st.dead = true;
      fx(G, 'explode_hit_enemy_clean_bullet', st.x, st.y - 8, { layer: 'top', scale: 1.4 });
      G.shake = Math.max(G.shake, 3);
      for (const e of inRadius(G, st.x, st.y - 8, TR.blast)) hit(G, p, e, C('initExplodeDamage', 30), { critChance: 0, repel: 4, ang: Math.atan2(e.y - st.y, e.x - st.x), tag: 'skill' });
    }
  };
  DUR_UI.master_s_trick = 10;
  // Hình nộm: prop riêng (bốc lên → móc kéo quái → gai) chạy theo p._trick.
  function doll(G, p, st) {
    const parts = SK.prefab('trapmaster_magic_show') || [];
    const stings = parts.filter(q => /\/Base$/.test(q.n) && /stings\//.test(q.n) && q.f).map(q => ({ x: q.at[0], y: -q.at[1] }));   // vị trí gai quanh hình nộm [ĐO prefab]
    const FR = dollFrames();
    G.props.push({ x: st.x, y: st.y, t: 0,
      update(G2, q, dt) {
        if (st.dead || p._trick !== st) { q.gone = true; return; }
        q.t += dt;
        if (q.t < TR.rise) return;
        const max = C('initHookNum', 2), lock = C('initLockEnemyDistance', 12) * U;
        // Dụ quái lại gần (quái không thấy người chơi đang tàng hình).
        for (const e of G2.enemies) {
          if (!alive(e) || e.boss || !K.inRoom(G2, e)) continue;
          const d = Math.hypot(e.x - st.x, e.y - st.y);
          if (d < lock && d > 14) { e.kx += (st.x - e.x) / d * TR.lure * dt * 6; e.ky += (st.y - e.y) / d * TR.lure * dt * 6; }
        }
        // Móc: mỗi hookCd một móc mới (tối đa initHookNum móc cùng lúc) bắn ra quái gần nhất chưa bị móc.
        st.hookT -= dt;
        st.hooks = st.hooks.filter(h => !h.done);
        if (st.hookT <= 0 && st.hooks.length < max) {
          const e = nearest(G2, st.x, st.y - 8, lock, { skip: t => t._hooked });
          if (e) { st.hookT = 1.2; e._hooked = true; st.hooks.push({ e, t: 0, hit: false }); }   // hookCd 1,2 [ĐO]
        }
        for (const h of st.hooks) {
          h.t += dt;
          const e = h.e;
          if (!alive(e)) { h.done = true; e._hooked = false; continue; }
          if (h.t < TR.hookOut) continue;
          if (!h.hit) {
            h.hit = true;
            hit(G2, p, e, HOOK_DMG, { critChance: 0, ang: Math.atan2(st.y - e.y, st.x - e.x), tag: 'skill', fx: 'hit_white' });
            p.energy = Math.min(p.energyMax, p.energy + C('initAbsorbEnergyNum', 2));
            SK.num(G2, p.x, p.y - 26, '+' + C('initAbsorbEnergyNum', 2), '#5ab4ff');
          }
          if (!e.boss) {
            const d = Math.hypot(st.x - e.x, st.y - e.y), rec = 0.75 * U;
            if (d > rec) SK.moveBox(G2.map, e, (st.x - e.x) / d * Math.min(d - rec, 20 * U * dt), (st.y - e.y) / d * Math.min(d - rec, 20 * U * dt), e.r);
            else { h.done = true; e._hooked = false; }
          } else if (h.t > 0.8) { h.done = true; e._hooked = false; }
        }
        // Gai: đâm 2 mỗi hitCd 0,5 s [ĐO TarpMasterSkill2StingCtrl].
        for (const e of G2.enemies) {
          if (!alive(e) || (st.hitAt.get(e) || 0) > G2.t) continue;
          const [cx, cy] = ec(e);
          if (stings.some(s => Math.hypot(st.x + s.x - cx, st.y + s.y - cy) < TR.hitR + e.r * 0.5)) {
            st.hitAt.set(e, G2.t + 0.5);
            hit(G2, p, e, 2, { critChance: 0, tag: 'sting' });
          }
        }
      },
      draw(ctx, G2, q) {
        const up = FR.up, idle = FR.idle;
        const rising = q.t < TR.rise;
        const name = rising ? up[Math.min(up.length - 1, Math.floor(q.t / TR.rise * up.length))] : idle[Math.floor(q.t * 8) % idle.length];
        if (!rising) {
          const a = 0.55 + 0.25 * Math.sin(q.t * 6);
          for (const s of stings) SK.draw(ctx, 'tarpMaster_0_skill2_sting_0', st.x + s.x, st.y + s.y, { alpha: a });
        }
        if (name) SK.draw(ctx, name, st.x, st.y);
        for (const h of st.hooks) {
          if (!alive(h.e)) continue;
          const [cx, cy] = ec(h.e), k = Math.min(1, h.t / TR.hookOut);
          ctx.save(); ctx.strokeStyle = '#f2d16b'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(st.x, st.y - 24); ctx.lineTo(st.x + (cx - st.x) * k, st.y - 24 + (cy - st.y + 24) * k); ctx.stroke(); ctx.restore();
        }
      } });
  }

  // ================================================================ CÁCH CHƠI NÓN (skill 2)
  // [ĐO c25/skill 3: cd 8, dur 5; C26Skill3Ctrl (tarpMaster_skill3) initPigeonNum 10 → total, initPigeonNumLimit 5 → limit, createPigeonNumPreTime 2 → batch,
  // initPigeonDamage 1 → peckDmg, initPigeonExplodeDamage 5 → boom, initPigeonLifeTime 5 → life, initLoftDamage 10 → loft, initLoftAtkDuration 3; PigeonCtrl attackRadius 5 → attackR] + [WIKI]:
  // ném nón tới quái gần nhất trong tầm nhìn (không có thì rơi tại chỗ), sau 1 s nón chạm đất và gây 10 mỗi 0,5 s trong 2 s (tổng 40) ở
  // vùng lớn; bồ câu bay quanh người, chặn đạn địch; giữ nút thì bồ câu lao vào quái, nhả nút thì về quỹ đạo.
  const HT = { total: 10, limit: 5, batch: 2, attackR: 5, peckDmg: 1, boom: 5, loft: 10, life: 5, fly: 1, area: 4 * T, tick: 0.5, ticks: 4, orbit: 30, spin: 3.2, atkSpeed: 14 * U, peck: 0.25, spawnGap: 0.12, hold: 0.2, blockR: 6, blast: 1.5 * T };   // vùng nón, thời gian bay, quỹ đạo, tốc lao, nhịp mổ, nhịp ra chim [ƯỚC LƯỢNG]
  S.hat_trick = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'hat_trick').dur || 5;
      const e = nearest(G, p.x, p.y - 6, 14 * U, { los: true });
      const to = e ? ec(e) : [p.x, p.y];
      const st = p._hat = { t: 0, pigeons: [], total: HT.total, spawnT: 0.3, atk: false, life: HT.life };
      throwHat(G, p, st, p.x, p.y - 12, to[0], to[1]);
    },
    update(G, p, dt) {
      const st = p._hat; if (!st) return;
      st.t += dt; st.spawnT -= dt;
      st.atk = I.down('skill') && st.t > HT.hold;
      // Ra bồ câu từng đợt createPigeonNumPreTime, tối đa initPigeonNumLimit con cùng lúc, tổng initPigeonNum con [ĐO].
      if (st.spawnT <= 0 && st.pigeons.length < HT.limit && st.total > 0) {
        st.spawnT = HT.spawnGap;
        for (let i = 0; i < HT.batch && st.pigeons.length < HT.limit && st.total > 0; i++) {
          st.total--;
          const b = { x: p.x, y: p.y - 10, a: SK.rand() * Math.PI * 2, t: 0, hitAt: 0, life: st.life, tgt: null };
          b.h = fx(G, 'trapMaster_skill3_pigeon', b.x, b.y, { follow: b, dur: 1e6, layer: 'top' });
          st.pigeons.push(b);
        }
      }
      const R = HT.attackR * U;
      for (const b of st.pigeons) {
        b.t += dt; b.life -= dt;
        // Chặn đạn địch: chim nào đỡ đạn thì nổ.
        for (const bl of G.bullets) {
          if (bl.side !== 'e' || bl.dead) continue;
          if (Math.hypot(bl.x - b.x, bl.y - b.y) < HT.blockR + bl.r) { bl.dead = true; b.life = 0; break; }
        }
        if (b.life <= 0) { b.dead = true; pigeonBlast(G, p, b); continue; }
        if (st.atk) {
          if (!b.tgt || !alive(b.tgt)) b.tgt = nearest(G, p.x, p.y - 6, R + 8);
        } else b.tgt = null;
        let tx, ty;
        if (b.tgt) {
          [tx, ty] = ec(b.tgt); tx += Math.cos(b.t * 9 + b.a) * 6; ty += Math.sin(b.t * 9 + b.a) * 4 - 6;
          if (Math.hypot(tx - b.x, ty - b.y) < 12 && b.hitAt <= st.t) { b.hitAt = st.t + HT.peck; hit(G, p, b.tgt, HT.peckDmg, { critChance: 0, tag: 'pigeon', noMul: true }); }
        } else {
          b.a += HT.spin * dt;
          tx = p.x + Math.cos(b.a) * HT.orbit; ty = p.y - 12 + Math.sin(b.a) * HT.orbit * 0.6;
        }
        const d = Math.hypot(tx - b.x, ty - b.y), s = Math.min(d, (b.tgt ? HT.atkSpeed : Math.max(HT.atkSpeed * 0.7, d * 8)) * dt);
        if (d > 0.01) { b.x += (tx - b.x) / d * s; b.y += (ty - b.y) / d * s; }
      }
      st.pigeons = st.pigeons.filter(b => !b.dead);
    },
    end(G, p) {
      const st = p._hat; p._hat = null;
      if (!st) return;
      for (const b of st.pigeons) { b.dead = true; pigeonBlast(G, p, b); }
    }
  };
  DUR_UI.hat_trick = 5;
  function pigeonBlast(G, p, b) {
    kill(b.h);
    fx(G, 'explode_hit_enemy', b.x, b.y, { layer: 'top', scale: 0.6 });
    for (const e of inRadius(G, b.x, b.y, HT.blast)) hit(G, p, e, HT.boom, { critChance: 0, ang: Math.atan2(e.y - b.y, e.x - b.x), tag: 'pigeonBoom', noMul: true });
  }
  // Nón bay theo cung tới đích trong HT.fly s, đáp xuống rồi gây sát thương diện rộng theo nhịp.
  function throwHat(G, p, st, x0, y0, x1, y1) {
    const dmg = HT.loft;
    let landed = false, n = 0, fxh = null;
    G.props.push({ x: x1, y: y1, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        if (!landed && q.t >= HT.fly) { landed = true; fxh = fx(G2, 'tarpMaster_skill3', x1, y1, { layer: 'ground', dur: HT.ticks * HT.tick + 0.5 }); }
        if (landed) {
          while (n < HT.ticks && q.t >= HT.fly + (n + 1) * HT.tick) {
            n++;
            for (const e of inRadius(G2, x1, y1, HT.area)) hit(G2, p, e, dmg, { critChance: 0, tag: 'hat', noMul: true, fx: 'hit_white' });
          }
          if (n >= HT.ticks) { q.gone = true; kill(fxh); }
        }
      },
      draw(ctx, G2, q) {
        if (landed) return;
        const k = q.t / HT.fly, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 36;
        ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(q.t * 14);
        ctx.fillStyle = '#1d1d24'; ctx.fillRect(-4, -4, 8, 7); ctx.fillRect(-6, 2, 12, 2);
        ctx.fillStyle = '#c93b3b'; ctx.fillRect(-4, 0, 8, 2);
        ctx.restore();
      } });
  }
})();
