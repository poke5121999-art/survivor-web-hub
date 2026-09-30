// Kỹ năng Bậc Thầy Cạm Bẫy (c25): telecontrolled_bomb, master_s_trick, hat_trick. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS;
  const { cfg, CTRL, fx, hit, inRadius, nearest, ec, alive, setMul, hurtMods, layer, DUR_UI, debuff } = K;
  const U = SK.PPU, T = SK.TILE, I = SK.input;
  const C = (f, d) => CTRL('trapmaster', f, d);   // ctrlFields của C26Controller [ĐO hero.json]
  const kill = h => { if (h) { if (h.stop) h.stop(); if (h.kill) h.kill(); } };
  const lerp = (a, b, k) => a + (b - a) * k;

  // ================================================================ BOM ĐIỀU KHIỂN (skill 0)
  // [ĐO c25/skill 1: cd 10, dur 5; C26Controller skill1BombNum 3, initSkill1BombDamage 16, aroundRadius 4, throwingRadius 5,5 ± 1,5;
  // TrapMasterBombCtrl.explodeDelay 0,5 s từ lúc ra lệnh nổ tới lúc nổ thật; BtnSkillDown: ném 1 bom đang quay + nổ toàn bộ bom dính +
  // kết thúc kỹ năng (ExplodeBombs → RoleSkillEnd); Skill1_End (hết giờ): ném hết bom đang quay ra rồi nổ cả loạt]
  // + [WIKI]: quái chạm bom thì bị dính (quái thường hút 1 quả, tinh anh 3, trùm hút hết), nổ 16 + cháy.
  // [ƯỚC LƯỢNG]: tốc quay và độ dẹt của vòng bom, tầm chạm, bán kính nổ (Explode clean_bullet không có bán kính trong dữ liệu), thời gian ném.
  const BM = { spin: 2.4, squash: 0.75, touch: 5, blast: 2.5 * T, fly: 0.3, fuse: 0.5 };
  const bombOf = e => e._bombs || 0;
  const bombCap = e => (e.boss ? 99 : e.elite ? 3 : 1);   // [WIKI]
  function bombFx(G, b, state) {
    kill(b.h);
    b.h = fx(G, 'trapmaster_bomb', b.x, b.y, { follow: b, dy: -6, dur: 1e6, state, layer: 'top' });
  }
  // Điểm ném: quái đang nhắm (không có thì một điểm ngẫu nhiên quanh người, bán kính throwingRadius ± throwingRandomRadius).
  function throwSpot(G, p) {
    const e = (p.target && alive(p.target) && p.target) || nearest(G, p.x, p.y - 6, 12 * U);
    if (e) return ec(e);
    const a = SK.rand() * Math.PI * 2, d = (C('throwingRadius', 5.5) + SK.randf(-1, 1) * C('throwingRandomRadius', 1.5)) * U;
    return [p.x + Math.cos(a) * d, p.y - 6 + Math.sin(a) * d];
  }
  // Ra lệnh nổ: sau BM.fuse thì nổ tại chỗ bom (đang dính quái thì theo quái; đang ném thì ở điểm rơi). Chạy độc lập với kỹ năng.
  function fuse(G, p, b, land) {
    if (b.e) b.e._bombs = Math.max(0, bombOf(b.e) - 1);
    const e = b.e;
    b.state = 'boom';
    bombFx(G, b, 'explode');
    G.props.push({ x: b.x, y: -1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt;
        if (land) {
          const k = Math.min(1, q.t / BM.fly);
          b.x = lerp(land.x0, land.tx, k); b.y = lerp(land.y0, land.ty, k) - Math.sin(k * Math.PI) * 14;
        } else if (e && alive(e)) { const [cx, cy] = ec(e); b.x = cx; b.y = cy - 4; }
        if (q.t >= BM.fuse) { q.gone = true; blast(G2, p, b.x, b.y, b); }
      } });
  }
  S.telecontrolled_bomb = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'telecontrolled_bomb').dur || 5;
      const n = C('skill1BombNum', 3);
      const st = p._bomb = { t: 0, list: [] };
      for (let i = 0; i < n; i++) {
        const b = { x: p.x, y: p.y, a: i * Math.PI * 2 / n, state: 'idle', e: null };
        st.list.push(b); bombFx(G, b, 'showUp');
      }
    },
    update(G, p, dt) {
      const st = p._bomb; if (!st) return;
      st.t += dt;
      const ring = C('aroundRadius', 4) * U;
      for (const b of st.list) {
        if (b.state === 'idle') {
          b.a += BM.spin * dt;
          b.x = p.x + Math.cos(b.a) * ring; b.y = p.y - 8 + Math.sin(b.a) * ring * BM.squash;
          // Quái chạm bom thì bị dính, tối đa theo cấp quái.
          for (const e of G.enemies) {
            if (!alive(e) || bombOf(e) >= bombCap(e) || !K.inRoom(G, e)) continue;
            const [cx, cy] = ec(e);
            if (Math.hypot(cx - b.x, cy - b.y) < e.r + BM.touch) { b.state = 'stuck'; b.e = e; e._bombs = bombOf(e) + 1; bombFx(G, b, 'active'); break; }
          }
        } else if (b.state === 'stuck') {
          if (!alive(b.e)) { b.e._bombs = Math.max(0, bombOf(b.e) - 1); b.e = null; b.state = 'idle'; bombFx(G, b, 'ide'); continue; }
          const [cx, cy] = ec(b.e); b.x = cx; b.y = cy - 4;
        }
      }
    },
    // Bấm lần nữa: nổ toàn bộ bom dính và kết thúc kỹ năng; bom còn quay bị ném ra nổ cùng (end).
    press(G, p) { p.skillT = 0; },
    end(G, p) {
      const st = p._bomb; p._bomb = null;
      if (!st) return;
      for (const b of st.list) {
        if (b.state === 'idle') { const [tx, ty] = throwSpot(G, p); fuse(G, p, b, { x0: b.x, y0: b.y, tx, ty }); }
        else fuse(G, p, b, null);
      }
    }
  };
  DUR_UI.telecontrolled_bomb = 5;
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
  // initStealthDuration 3; SetStealthEffect: speed_rate +0,5 trên RoleAttributePlayer.speed_rate 0,5 (tốc × (1 + speed_rate) → x4/3);
  // AppearingPersonCtrl.get_EnemyLockDistance = initLockEnemyDistance − 1; hookCd 1,2 s tính từ lúc mỗi móc thu về, maxHookNum 3,
  // hookData damage 2 / maxDistance 12 / recoveryBackSpeed 20 / recoveryDistance 0,75; TarpMasterSkill2StingCtrl damage 2, hitCd 0,5,
  // gai hiện showTime 0,5 s rồi ẩn hideTime 0,2 s; ảo ảnh chỉ đánh (canAtk) sau hoạt ảnh bốc lên] + [WIKI]: tàng hình + bất tử 3 s,
  // không tan khi đánh; mỗi quái bị móc hồi 2 năng lượng; hết 10 s thì nổ 30.
  // [ƯỚC LƯỢNG]: thời gian bốc lên (độ dài clip, không có trong dữ liệu đã bóc), lực dụ quái (trong mã đã đọc chỉ thấy móc kéo, không
  // có lực hút riêng), bán kính nổ, thời gian móc bay ra, nửa cạnh ô gai.
  const TR = { move: (1 + 0.5 + 0.5) / (1 + 0.5), rise: 1.7, lure: 40, blast: 4 * T, hookOut: 0.18, hitR: 10, hookCd: 1.2, stingShow: 0.5, stingHide: 0.2, stingCd: 0.5 };
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
      const st = p._trick = { t: 0, stealth: C('initStealthDuration', 3), x: p.x, y: p.y, hooks: [], ready: [], hitAt: new Map(), dead: false };
      for (let i = 0; i < C('initHookNum', 2); i++) st.ready.push(0);
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
    const shown = q => (q.t - TR.rise) % (TR.stingShow + TR.stingHide) < TR.stingShow;
    G.props.push({ x: st.x, y: st.y, t: 0,
      update(G2, q, dt) {
        if (st.dead || p._trick !== st) { q.gone = true; return; }
        q.t += dt;
        if (q.t < TR.rise) return;
        const lock = (C('initLockEnemyDistance', 12) - 1) * U;
        // Dụ quái lại gần (quái không thấy người chơi đang tàng hình).
        for (const e of G2.enemies) {
          if (!alive(e) || e.boss || !K.inRoom(G2, e)) continue;
          const d = Math.hypot(e.x - st.x, e.y - st.y);
          if (d < lock && d > 14) { e.kx += (st.x - e.x) / d * TR.lure * dt * 6; e.ky += (st.y - e.y) / d * TR.lure * dt * 6; }
        }
        // Móc: mỗi ô móc (initHookNum) nghỉ hookCd sau khi thu về rồi bắn ra quái gần nhất chưa bị móc.
        st.hooks = st.hooks.filter(h => !h.done);
        for (let i = 0; i < st.ready.length; i++) {
          if (st.hooks.some(h => h.slot === i) || st.ready[i] > q.t) continue;
          const e = nearest(G2, st.x, st.y - 8, lock, { skip: t => t._hooked });
          if (e) { e._hooked = true; st.hooks.push({ e, t: 0, hit: false, slot: i }); }
        }
        for (const h of st.hooks) {
          h.t += dt;
          const e = h.e;
          const stop = () => { h.done = true; e._hooked = false; st.ready[h.slot] = q.t + TR.hookCd; };
          if (!alive(e)) { stop(); continue; }
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
            else stop();
          } else if (h.t > 0.8) stop();
        }
        // Gai: hiện 0,5 s / ẩn 0,2 s, đâm 2 mỗi hitCd 0,5 s lúc hiện.
        if (shown(q)) for (const e of G2.enemies) {
          if (!alive(e) || (st.hitAt.get(e) || 0) > G2.t) continue;
          const [cx, cy] = ec(e);
          if (stings.some(s => Math.hypot(st.x + s.x - cx, st.y + s.y - cy) < TR.hitR + e.r * 0.5)) {
            st.hitAt.set(e, G2.t + TR.stingCd);
            hit(G2, p, e, 2, { critChance: 0, tag: 'sting' });
          }
        }
      },
      draw(ctx, G2, q) {
        const up = FR.up, idle = FR.idle;
        const rising = q.t < TR.rise;
        const name = rising ? up[Math.min(up.length - 1, Math.floor(q.t / TR.rise * up.length))] : idle[Math.floor(q.t * 8) % idle.length];
        if (!rising) {
          for (const s of stings) {
            SK.draw(ctx, 'tarpMaster_0_skill2_sting_0', st.x + s.x, st.y + s.y, { alpha: 0.7 });
            if (shown(q) && SK.frame('tarpMaster_0_skill2_sting_1')) SK.draw(ctx, 'tarpMaster_0_skill2_sting_1', st.x + s.x, st.y + s.y);
          }
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
  // [ĐO c25/skill 3: cd 8, dur 5; C26Skill3Ctrl (tarpMaster_skill3): initPigeonNumLimit 5, initCreatePigeonNumPreTime 2 (mỗi đợt), initPigeonDamage 1,
  // initPigeonExplodeDamage 5, initBigPigeonExplodeDamage 20, initLoftDamage 10, initLoftAtkDuration 3 (nón gây sát thương 3 s sau khi hạ);
  // initPigeonNum 10 chỉ là số chim dựng sẵn để tái dùng, số chim ra thật ≤ limit, không bù chim mất; PigeonCtrl attackRadius 5,
  // spiralParameters (quay quanh người: targetPosRadius 3, tốc 10–15 đơn vị/s), pursueParameters (đuổi mục tiêu ngoài attackRadius: 20–25),
  // atkParameters (trong attackRadius, lao vào: 20–30); chế độ tấn công chỉ bật khi có mục tiêu (OnSkillBtnDown), nhả nút về quay;
  // C26S3HatCtrl.ThrowOutHat: DOJump tới mục tiêu (không có thì rơi tại chỗ, defaultThrowDistance 0) jumpPower 5 đơn vị, 1 s, ease OutQuint;
  // chim lớn (AnimaOnLetBigPigeonOut): xuất hiện trên nón, bay lên cao 6 đơn vị trên mục tiêu trong 1 s (OutQuad) rồi lao xuống trong 0,8 s
  // (InBack) và nổ bigPigeonExplodeDamage 20 với prefab nổ phóng 1,2 lần; kỹ năng dừng thì chim lớn biến mất không nổ; hết giờ mọi chim nhỏ nổ 5]
  // + [WIKI]: nón nổ đều theo nhịp trong vùng lớn; bồ câu chặn đạn địch.
  // [ƯỚC LƯỢNG]: vùng và nhịp sát thương của nón (bullet của nón bật theo hoạt ảnh, không có trong dữ liệu đã bóc), thời điểm từng đợt chim
  // nhỏ và chim lớn ra (sự kiện anim hat_pigeonOut), độ dẹt vòng quay, nhịp mổ, chim chặn đạn thì nổ, bán kính nổ chim.
  const HT = { limit: 5, per: 2, loft: 10, loftT: 3, boom: 5, big: 20, peck: 1, hatT: 1, hatArc: 5 * U, orbitR: 3 * U, orbit: [10, 15], pursue: [20, 25], atk: [20, 30], atkR: 5 * U,
    bigRise: 1, bigDive: 0.8, bigUp: 6 * U, bigK: 1.2,
    area: 4 * T, tick: 0.5, batchAt: 0.2, batchGap: 0.4, bigAt: 0.6, squash: 0.6, peckGap: 0.25, blockR: 6, blast: 1.5 * T, hold: 0.2 };
  const easeOutQuad = k => 1 - (1 - k) * (1 - k);
  const easeOutQuint = k => 1 - Math.pow(1 - k, 5);
  const easeInBack = k => 2.70158 * k * k * k - 1.70158 * k * k;
  S.hat_trick = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'hat_trick').dur || 5;
      const e = (p.target && alive(p.target) && p.target) || nearest(G, p.x, p.y - 6, 14 * U, { los: true });
      const to = e ? ec(e) : [p.x, p.y];
      const st = p._hat = { t: 0, pigeons: [], out: 0, atk: false, big: null };
      throwHat(G, p, st, p.x, p.y - 12, to[0], to[1]);
    },
    update(G, p, dt) {
      const st = p._hat; if (!st) return;
      st.t += dt;
      // Chế độ tấn công: giữ nút và có mục tiêu.
      const tgt = (p.target && alive(p.target) && p.target) || nearest(G, p.x, p.y - 6, 14 * U);
      st.atk = I.down('skill') && st.t > HT.hold && !!tgt;
      for (const b of st.pigeons) {
        b.t += dt;
        // Chặn đạn địch: chim nào đỡ đạn thì nổ.
        for (const bl of G.bullets) {
          if (bl.side !== 'e' || bl.dead) continue;
          if (Math.hypot(bl.x - b.x, bl.y - b.y) < HT.blockR + bl.r) { bl.dead = true; b.dead = true; break; }
        }
        if (b.dead) { pigeonBlast(G, p, b); continue; }
        let tx, ty, sp;
        if (st.atk) {
          [tx, ty] = ec(tgt); tx += Math.cos(b.t * 9 + b.a) * 6; ty += Math.sin(b.t * 9 + b.a) * 4 - 6;
          sp = Math.hypot(tx - b.x, ty - b.y) > HT.atkR ? b.pv : b.av;
          if (Math.hypot(tx - b.x, ty - b.y) < 12 && b.hitAt <= st.t) { b.hitAt = st.t + HT.peckGap; hit(G, p, tgt, HT.peck, { critChance: 0, tag: 'pigeon', noMul: true }); }
        } else {
          b.a += b.ov / (HT.orbitR / U) * dt;
          tx = p.x + Math.cos(b.a) * HT.orbitR; ty = p.y - 12 + Math.sin(b.a) * HT.orbitR * HT.squash;
          sp = Math.max(b.ov, Math.hypot(tx - b.x, ty - b.y) / U * 8);
        }
        const d = Math.hypot(tx - b.x, ty - b.y), s = Math.min(d, sp * U * dt);
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
  // Chim nhỏ bay ra từ nón; sau đó tự bay về quỹ đạo quanh người.
  function releasePigeons(G, p, st, x, y) {
    for (let i = 0; i < HT.per && st.out < HT.limit; i++) {
      st.out++;
      const rnd = ([a, b]) => SK.randf(a, b);
      const b = { x, y, a: SK.rand() * Math.PI * 2, t: 0, hitAt: 0, ov: rnd(HT.orbit), pv: rnd(HT.pursue), av: rnd(HT.atk) };
      b.h = fx(G, 'trapMaster_skill3_pigeon', b.x, b.y, { follow: b, dur: 1e6, layer: 'top' });
      st.pigeons.push(b);
    }
  }
  // Chim lớn: bay lên 6 đơn vị trên mục tiêu rồi lao xuống nổ 20.
  function bigPigeon(G, p, st, hx, hy) {
    const e = (p.target && alive(p.target) && p.target) || nearest(G, p.x, p.y - 6, 14 * U);
    const [tx, ty] = e ? ec(e) : [hx, hy];
    const bp = st.big = { x: hx, y: hy - U, phase: 'rise', h: null };
    bp.h = fx(G, 'trapMaster_skill3_bigPigeon', bp.x, bp.y, { follow: bp, dur: 1e6, layer: 'top', state: 'pigeon_fly' });
    const from = [bp.x, bp.y], mid = [tx, ty - HT.bigUp];
    G.props.push({ x: tx, y: -1e9, t: 0, draw() {},
      update(G2, q, dt) {
        if (p._hat !== st) { q.gone = true; kill(bp.h); st.big = null; return; }
        q.t += dt;
        if (q.t < HT.bigRise) {
          const k = easeOutQuad(q.t / HT.bigRise);
          bp.x = lerp(from[0], mid[0], k); bp.y = lerp(from[1], mid[1], k);
          return;
        }
        if (bp.phase === 'rise') { bp.phase = 'dive'; kill(bp.h); bp.h = fx(G2, 'trapMaster_skill3_bigPigeon', bp.x, bp.y, { follow: bp, dur: 1e6, layer: 'top', state: 'pigeon_atk' }); }
        const k = Math.min(1, (q.t - HT.bigRise) / HT.bigDive), kk = easeInBack(k);
        bp.x = lerp(mid[0], tx, kk); bp.y = lerp(mid[1], ty, kk);
        if (k < 1) return;
        q.gone = true; kill(bp.h); st.big = null;
        fx(G2, 'explode_hit_enemy', tx, ty, { layer: 'top', scale: 0.6 * HT.bigK });
        G2.shake = Math.max(G2.shake, 2);
        for (const en of inRadius(G2, tx, ty, HT.blast * HT.bigK)) hit(G2, p, en, HT.big, { critChance: 0, ang: Math.atan2(en.y - ty, en.x - tx), tag: 'bigPigeon', noMul: true });
      } });
  }
  // Nón bay theo cung tới đích, đáp xuống rồi gây sát thương diện rộng theo nhịp; thả chim nhỏ từng đợt và chim lớn.
  function throwHat(G, p, st, x0, y0, x1, y1) {
    let landed = false, n = 0, fxh = null, big = false;
    G.props.push({ x: x1, y: y1, t: 0,
      update(G2, q, dt) {
        if (p._hat !== st) { q.gone = true; kill(fxh); return; }
        q.t += dt;
        if (!landed && q.t >= HT.hatT) { landed = true; fxh = fx(G2, 'tarpMaster_skill3', x1, y1, { layer: 'ground', dur: HT.loftT + 0.5 }); }
        if (!landed) return;
        const lt = q.t - HT.hatT;
        while (n < HT.loftT / HT.tick && lt >= (n + 1) * HT.tick) {
          n++;
          for (const e of inRadius(G2, x1, y1, HT.area)) hit(G2, p, e, HT.loft, { critChance: 0, tag: 'hat', noMul: true, fx: 'hit_white' });
        }
        while (st.out < HT.limit && lt >= HT.batchAt + Math.floor(st.out / HT.per) * HT.batchGap) releasePigeons(G2, p, st, x1, y1 - 8);
        if (!big && lt >= HT.bigAt) { big = true; bigPigeon(G2, p, st, x1, y1 - 8); }
        if (lt >= HT.loftT) { q.gone = true; kill(fxh); }
      },
      draw(ctx, G2, q) {
        if (landed) return;
        const k = q.t / HT.hatT, kk = easeOutQuint(k), x = x0 + (x1 - x0) * kk, y = y0 + (y1 - y0) * kk - Math.sin(kk * Math.PI) * HT.hatArc;
        ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(q.t * 14);
        ctx.fillStyle = '#1d1d24'; ctx.fillRect(-4, -4, 8, 7); ctx.fillRect(-6, 2, 12, 2);
        ctx.fillStyle = '#c93b3b'; ctx.fillRect(-4, 0, 8, 2);
        ctx.restore();
      } });
  }
})();
