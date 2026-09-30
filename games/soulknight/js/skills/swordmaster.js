// Kỹ năng Kiếm Tông (c28): tempest_blade, wisps_of_clouds, blinkblade_codex. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ hero.json C29SkillSetting (nút `setting` của C29Controller) [ĐO]; khung pha theo tên coroutine trong dump.cs
// (IESkill0/1/2, IESkillLast1/2, IEAfterSlash, SwordMasterFlySword.Takeoff/Waitting/BackAttack) [ĐO]. Thứ không có trong
// dữ liệu (sát thương phi kiếm, tầm chém, đơn vị thời gian giữa hai đòn) ghi [ƯỚC LƯỢNG]. Đơn vị Unity 1 = 1 ô = 16 px.
// Chưa làm: nội tại Kiếm Khí (SwordPower đầy → biến thể "isFullPower" / đại kiếm c28_skill_1_big_sword) vì thuộc buff 1012.
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, I = SK.input;
  const { alive, ec, hit } = K;
  const BODY = 7;                                      // tâm thân cách chân [ƯỚC LƯỢNG]
  const rad = d => -d * Math.PI / 180;                 // angleZ Unity (y hướng lên) → canvas (y hướng xuống)
  const solid = (G, x, y) => W.solidAt(G.map, x, y);
  const setFace = (p, a) => { if (Math.abs(Math.cos(a)) > 0.1) p.face = Math.cos(a) > 0 ? 1 : -1; };

  // Bất tử + đạn xuyên qua trong lúc lướt; sau khi xong còn `after` giây (unProtectedTime).
  function guard(p, on, after) {
    if (on) { K.ghost(p, true); K.hurtMods(p).sm = () => 0; return; }
    delete K.hurtMods(p).sm;
    if (after > 0) { K.hurtMods(p).after = () => 0; p._immuneT = after; } else K.ghost(p, false);
    p._alpha = null;
  }
  // Lướt theo ang với tốc độ spd (px/s), bù phần đi bộ để giữ đúng hướng.
  function slide(G, p, ang, spd, dt) {
    const mv = I.moveVec(), w = p.h.speed * SK.PPU * (p.moveMul || 1) * dt;
    SK.moveBox(G.map, p, Math.cos(ang) * spd * dt - mv.x * w, Math.sin(ang) * spd * dt - mv.y * w, p.h.body.r);
  }
  // Trúng mọi quái cách đoạn (x0,y0)-(x1,y1) không quá w/2; `seen` giữ mỗi quái một lần.
  function segHit(G, p, x0, y0, x1, y1, w, dmg, seen, o) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    let n = 0;
    for (const e of G.enemies) {
      if (!alive(e) || (seen && seen.has(e))) continue;
      const [cx, cy] = ec(e), u = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L2));
      if (Math.hypot(cx - (x0 + dx * u), cy - (y0 + dy * u)) < w / 2 + e.r) {
        if (seen) seen.add(e);
        hit(G, p, e, dmg, Object.assign({ critChance: p.crit, ang: Math.atan2(dy, dx), repel: 2, fx: 'hit_white' }, o));
        n++;
      }
    }
    return n;
  }
  // Hình quạt phía trước ang: bán kính r, nửa góc half.
  function coneHit(G, p, ang, r, half, dmg, seen, o) {
    let n = 0;
    for (const e of G.enemies) {
      if (!alive(e) || (seen && seen.has(e))) continue;
      const [cx, cy] = ec(e), d = Math.hypot(cx - p.x, cy - (p.y - BODY));
      if (d > r + e.r) continue;
      let da = Math.atan2(cy - (p.y - BODY), cx - p.x) - ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d > 8 && Math.abs(da) > half) continue;
      if (seen) seen.add(e);
      hit(G, p, e, dmg, Object.assign({ critChance: p.crit, ang, repel: 2, fx: 'hit_white' }, o));
      n++;
    }
    return n;
  }
  // Hướng lướt: về phía quái gần (trong tầm) không thì hướng đang đi / ngắm; trả cả khoảng cách tới quái.
  function aim(G, p, range) {
    const t = K.targetAng(G, p, range);
    return { ang: t.ang, e: t.e, d: t.e ? Math.hypot(ec(t.e)[0] - p.x, ec(t.e)[1] - (p.y - BODY)) : Infinity };
  }
  // Vệt sáng (đường nối các điểm kiếm, phát chém) vẽ tay: sprite trail_0 của prefab bị kéo giãn bởi animator nên không dùng lại.
  function streak(G, x0, y0, x1, y1, dur, w) {
    G.props.push({ x: 0, y: 1e9, t: 0, update(G2, q, dt) { q.t += dt; if (q.t >= dur) q.gone = true; },
      draw(ctx, G2, q) {
        const a = 1 - q.t / dur;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(72,255,244,' + (0.55 * a) + ')'; ctx.lineWidth = (w || 5) * a + 2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = Math.max(1, (w || 5) * 0.35 * a);
        ctx.stroke(); ctx.restore();
      } });
  }
  // Khung kiếm ('sword' của atlas SK.vfx: c28_2_sword_point.nail) vẽ tại (x,y) mũi hướng ang.
  function swordSprite(ctx, x, y, ang, sc, alpha) {
    const V = window.SK_VFX, f = V && V.atlas.f.sword, img = f && SK.vfx && SK.vfx.pages[f[0]];
    if (!img) { if (f && SK.vfx && !SK.vfx.loaded) SK.vfx.load(); return; }   // trang atlas nạp lười
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2); if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.drawImage(img, f[1], f[2], f[3], f[4], -f[3] * sc / 2, -f[4] * sc / 2, f[3] * sc, f[4] * sc);
    ctx.restore();
  }
  // Nhóm trạng thái theo ván: phi kiếm đang có, điểm kiếm đang cắm.
  const bag = G => G._sm || (G._sm = { swords: [], pts: [] });

  // ================================================================ 1. Lưỡi Kiếm Tật Phong (tempest_blade)
  // [ĐO IESkill0 + C29SkillSetting]: cd 8; lướt tối đa maxMoveDistance 5.5 ô trong moveTime 0.2 s, chém baseSlashCount 6 nhát
  // theo Frames.angleZ {60,300,180,120,0,240} cách defaultTriggerTime 0.08 s (baseDamage 6), rồi lùi backDistance 4 ô trong
  // backTime 0.1 s và bắn flySlashCount 2 sóng kiếm (flySlashDamage 8, flySpeed 20 ô/s, flySlashSize 1.5) ở backTriggerTime 0.15 s;
  // bất tử suốt kỹ năng + unProtectedTime 0.25 s sau đó ("Trong lúc chém sẽ không phải chịu DMG").
  const TB = { dash: 5.5 * T, dashT: 0.2, frames: [60, 300, 180, 120, 0, 240], gap: 0.08, dmg: 6, back: 4 * T, backT: 0.1, waveAt: 0.15,
    waveDmg: 8, waveV: 20 * T, waves: 2, after: 0.25, reach: 2.6 * T, wave: { spread: 12, range: 11 * T, w: 1.5 * T } };   // tầm chém, độ xoè sóng [ƯỚC LƯỢNG]
  TB.total = TB.dashT + TB.frames.length * TB.gap + TB.waveAt;
  K.DUR_UI.tempest_blade = TB.total;
  function flyWave(G, p, ang, dmgAcc) {
    const s = { x: p.x, y: p.y - BODY, d: 0, seen: new Set() };
    G.props.push({ x: s.x, y: s.y, update(G2, q, dt) {
      const step = TB.waveV * dt; s.d += step;
      s.x += Math.cos(ang) * step; s.y += Math.sin(ang) * step; q.x = s.x; q.y = s.y;
      segHit(G2, p, s.x - Math.cos(ang) * 6, s.y - Math.sin(ang) * 6, s.x, s.y, TB.wave.w, dmgAcc, s.seen, { fx: 'hit_blue2', repel: 2 });
      if (s.d > TB.wave.range || solid(G2, s.x, s.y)) { q.gone = true; K.fx(G2, 'c28_fly_slash_effect', s.x, s.y, { ang, scale: 0.8 }); }
    }, draw(ctx, G2, q) { SK.drawRip(ctx, SK.prefab('c28_fly_slash'), s.x, s.y, { rot: ang, t: G2.t }); } });
  }
  S.tempest_blade = {
    start(G, p) {
      K.layer(G);
      const a = aim(G, p, TB.dash + 2 * T);
      const dist = Math.min(TB.dash, Math.max(2 * T, a.d - T));   // fixMoveEnd 1 ô: dừng trước quái 1 ô
      p.skillT = TB.total;
      p._tb = { ang: a.ang, v: dist / TB.dashT, t: 0, slashes: 0, back: false, wave: false, ox: p.x, oy: p.y, seen: new Set() };
      setFace(p, a.ang);
      guard(p, true);
      K.fx(G, 'c28_buff', p.x, p.y, { follow: p, dy: -BODY, dur: 0.6 });
    },
    update(G, p, dt) {
      const s = p._tb; if (!s) return;
      s.t += dt;
      if (s.t < TB.dashT) { slide(G, p, s.ang, s.v, dt); return; }
      // Chém: mỗi nhát một đường thẳng xuyên tâm theo góc Frames; mỗi quái chịu mỗi nhát một lần.
      const due = Math.min(TB.frames.length, Math.floor((s.t - TB.dashT) / TB.gap) + 1);
      while (s.slashes < due) {
        const a = rad(TB.frames[s.slashes]), cx = p.x, cy = p.y - BODY;
        K.fx(G, 'c28_skill_1_1', cx, cy, { ang: a, dur: 0.3 });
        segHit(G, p, cx - Math.cos(a) * TB.reach, cy - Math.sin(a) * TB.reach, cx + Math.cos(a) * TB.reach, cy + Math.sin(a) * TB.reach, 14, TB.dmg, new Set(), { fx: 'hit_blue2' });
        s.slashes++;
      }
      const tb = TB.dashT + TB.frames.length * TB.gap;
      if (s.t >= tb && s.t < tb + TB.backT) slide(G, p, s.ang + Math.PI, TB.back / TB.backT, dt);   // IEAfterSlash: lui về sau
      if (!s.wave && s.t >= tb + TB.waveAt - 0.001) {
        s.wave = true;
        for (let i = 0; i < TB.waves; i++) flyWave(G, p, s.ang + (i - (TB.waves - 1) / 2) * TB.wave.spread * Math.PI / 180, TB.waveDmg);
        G.shake = Math.max(G.shake, 2);
      }
    },
    end(G, p) { p._tb = null; guard(p, false, TB.after); }
  };

  // ---------------------------------------------------------------- phi kiếm (SwordMasterFlySword)
  // Takeoff → BulletMove (startSpeed 35 ô/s theo prefab; flySwordSpeed 38) → Waitting (đứng tại chỗ) → BackAttack (bay về người,
  // chém quái dọc đường). Sát thương mỗi lần chạm 6 [ƯỚC LƯỢNG = baseDamage]; kiếm đứng tối đa 15 s [ƯỚC LƯỢNG].
  const WS = { dmg: 6, v: 38 * T, end: 8 * T, count: 3, spread: 15, fwd: 1.5 * T, delay: 0.4, r: 11, life: 15, back: 38 * T };
  function newSword(G, p, x, y, ang) {
    const B = bag(G), s = { x, y, ang, st: 'fly', t: 0, d: 0, seen: new Set(), bob: SK.rand() * 6 };
    s.trail = K.fx(G, 'c28_1_fly_sword', x, y, { follow: s, dur: 30 });
    B.swords.push(s);
    G.props.push({ x, y, update(G2, q, dt) {
      s.t += dt;
      if (s.st === 'fly' || s.st === 'back') {
        if (s.st === 'back') { s.ang = Math.atan2(p.y - BODY - s.y, p.x - s.x); }
        const step = (s.st === 'fly' ? WS.v : WS.back) * dt;
        s.x += Math.cos(s.ang) * step; s.y += Math.sin(s.ang) * step; s.d += step;
        for (const e of G2.enemies) {
          if (!alive(e) || s.seen.has(e)) continue;
          const [cx, cy] = ec(e);
          if (Math.hypot(cx - s.x, cy - s.y) < WS.r + e.r) { s.seen.add(e); hit(G2, p, e, WS.dmg, { critChance: p.crit, ang: s.ang, repel: 2, fx: 'hit_white' }); }
        }
        if (s.st === 'fly' && (s.d >= WS.end || solid(G2, s.x, s.y))) { s.st = 'stand'; s.t = 0; K.stopFx(s.trail); }
        if (s.st === 'back' && Math.hypot(p.x - s.x, p.y - BODY - s.y) < 10) { s.st = 'gone'; }
      } else if (s.st === 'stand' && s.t > WS.life) s.st = 'gone';
      q.x = s.x; q.y = s.y;
      if (s.st === 'gone') { q.gone = true; K.stopFx(s.trail); B.swords.splice(B.swords.indexOf(s), 1); }
    }, draw(ctx, G2, q) {
      const bob = s.st === 'stand' ? Math.sin(s.t * 4 + s.bob) * 1.5 : 0;
      swordSprite(ctx, s.x, s.y + bob, s.ang, 0.7);
    } });
    return s;
  }
  // Triệu hồi mọi phi kiếm đang đứng về phía người (giai đoạn 3).
  function recall(G) { for (const s of bag(G).swords) if (s.st === 'stand') { s.st = 'back'; s.seen = new Set(); s.trail = K.fx(G, 'c28_1_fly_sword', s.x, s.y, { follow: s, dur: 30 }); } }

  // ================================================================ 2. Kiếm Lưu Vân (wisps_of_clouds)
  // [ĐO IESkill1/IESkillLast1 + C29SkillSetting; config max 3, cd 6 mỗi lượt]: lượt 1-2 lướt baseMoveDistance1 7.5 ô trong moveTime1
  // 0.2 s (dừng trước quái fixMoveEnd 1 ô), chém slashSize1 1.5 (baseDamage 6) rồi flyDelayCreateTime 0.4 s sau bắn 3 phi kiếm xoè
  // addAnglePreCircle 15° tới flySwordEndDis 8 ô thì đứng lại; lượt 3 lướt cùng quãng, mỗi trailCreateTime 0.05 s để lại một
  // vệt chém (c28_1_sword_trail, bán kính trailSize 1 ô) rồi triệu hồi mọi phi kiếm (BackAttack). noDamageTime 0.4 s bất tử (skillT dài hơn).
  const WC = { dash: 7.5 * T, dashT: 0.2, stop: T, slash: 1.5, slashR: 3.2 * T, half: 1.2, dmg: 6, trailGap: 0.05, trailR: 1.6 * T, trailDmg: 6 };   // tầm chém, sát thương vệt [ƯỚC LƯỢNG]
  K.DUR_UI.wisps_of_clouds = WC.dashT + WS.delay;
  S.wisps_of_clouds = {
    start(G, p) {
      K.layer(G);
      const ch = K.charges(p, 'wisps_of_clouds'), stage = Math.min(3, ch.max - ch.n + 1);
      K.useCharge(p, 'wisps_of_clouds');
      const a = aim(G, p, WC.dash + 2 * T);
      const dist = Math.min(WC.dash, Math.max(2 * T, a.d - WC.stop));
      p.skillT = WC.dashT + (stage === 3 ? 0.25 : WS.delay - WC.dashT + 0.1);
      p._wc = { stage, ang: a.ang, v: dist / WC.dashT, t: 0, slashed: false, fired: false, trail: 0 };
      setFace(p, a.ang);
      guard(p, true);
      K.fx(G, 'c28_buff', p.x, p.y, { follow: p, dy: -BODY, dur: 0.6 });
    },
    update(G, p, dt) {
      const s = p._wc; if (!s) return;
      s.t += dt;
      if (s.t < WC.dashT) {
        slide(G, p, s.ang, s.v, dt);
        if (s.stage === 3) while (s.trail * WC.trailGap <= s.t) {
          // CreatSlashTrail: vệt chém quanh vị trí đang đi qua, mỗi vệt trúng mỗi quái một lần.
          const cx = p.x, cy = p.y - BODY;
          K.fx(G, 'c28_1_sword_trail', cx, cy, { ang: s.ang + rad((s.trail % 2 ? 1 : -1) * 25), dur: 0.3 });
          for (const e of K.inRadius(G, cx, cy, WC.trailR)) hit(G, p, e, WC.trailDmg, { critChance: p.crit, ang: s.ang, repel: 1, fx: 'hit_white' });
          s.trail++;
        }
        return;
      }
      if (!s.slashed) {
        s.slashed = true;
        if (s.stage === 3) { recall(G); G.shake = Math.max(G.shake, 2); return; }
        K.fx(G, 'c28_1_sword', p.x, p.y - BODY, { ang: s.ang, scale: WC.slash, dur: 0.3 });   // CreateSlashSkill1
        coneHit(G, p, s.ang, WC.slashR, WC.half, WC.dmg, new Set(), { fx: 'hit_blue2' });
      }
      if (s.stage < 3 && !s.fired && s.t >= WS.delay) {
        s.fired = true;
        const cx = p.x + Math.cos(s.ang) * WS.fwd, cy = p.y - BODY + Math.sin(s.ang) * WS.fwd;
        for (let i = 0; i < WS.count; i++) newSword(G, p, cx, cy, s.ang + (i - (WS.count - 1) / 2) * WS.spread * Math.PI / 180);
      }
    },
    end(G, p) { p._wc = null; guard(p, false, 0); }
  };

  // ================================================================ 3. Kiếm Quyết Tức Thời (blinkblade_codex)
  // [ĐO IESkill2/IESkillLast2 + C29SkillSetting; config max 3, cd 7]: lượt 1-2 tìm quái trong findEnmeyRange3 5 ô, lao baseMoveDistance3
  // 2 ô trong moveTime3 0.15 s, chém ngang slashSize3 1.75 (baseDamage3 3) và gọi một thanh kiếm rơi xuống chỗ quái (ExplodeHammer
  // damage 6, tối đa maxSwordPointCount 7 điểm, quá thì bỏ điểm cũ). Lượt 3 thả thêm một điểm ngay chỗ đứng, lao lần lượt tới
  // mọi điểm trong maxSwordPointDistance 25 ô (gần trước): mỗi điểm nhận swordPointDamage 3 + vệt cắt swordCutComboDamage 2
  // (cutComboSize 0.7); cuối cùng về chỗ cũ, sau delaySwordLineComboTime 0.4 s tung các đường chém nối điểm
  // (swordLineDamage 3, dizzyProbability 50 %).
  const BB = { find: 5 * T, dash: 2 * T, dashT: 0.15, slashR: 2.8 * T, half: 1.1, slashDmg: 3, landDmg: 6, landT: 0.2, landR: 2 * T, max: 7, far: 25 * T,
    ptDmg: 3, cutDmg: 2, cutR: 1.6 * T, lineDmg: 3, lineW: 14, lineDelay: 0.4, dizzy: 50, hop: 0.15, stay: 0.1, fall: 3 * T };   // tầm chém, bán kính rơi, thời gian dừng mỗi điểm [ƯỚC LƯỢNG]
  K.DUR_UI.blinkblade_codex = 1.2;
  function addPoint(G, p, x, y) {
    const B = bag(G), pt = { x, y, t: 0, landed: false };
    pt.h = K.fx(G, 'c28_2_sword_point', x, y, { dur: 1e9 });
    B.pts.push(pt);
    if (B.pts.length > BB.max) { const o = B.pts.shift(); if (o.h) o.h.kill(); o.gone = true; }
    G.props.push({ x, y, update(G2, q, dt) {
      pt.t += dt;
      if (!pt.landed && pt.t >= BB.landT) {
        pt.landed = true;
        for (const e of K.inRadius(G2, x, y, BB.landR)) hit(G2, p, e, BB.landDmg, { critChance: p.crit, repel: 2, fx: 'hit_blue2' });
        G2.shake = Math.max(G2.shake, 1.5);
      }
      if (pt.gone) q.gone = true;
    }, draw() {} });
    return pt;
  }
  function takePoint(G, pt) { pt.gone = true; if (pt.h) pt.h.kill(); bag(G).pts.splice(bag(G).pts.indexOf(pt), 1); }
  S.blinkblade_codex = {
    start(G, p) {
      K.layer(G);
      const ch = K.charges(p, 'blinkblade_codex'), stage = Math.min(3, ch.max - ch.n + 1);
      K.useCharge(p, 'blinkblade_codex');
      const a = aim(G, p, BB.find), o = { x: p.x, y: p.y };
      p._smBb = { stage, ang: a.ang, e: a.e, t: 0, ph: 0, o };
      setFace(p, a.ang);
      guard(p, true);
      if (stage < 3) p.skillT = BB.dashT + 0.5;
      else {
        // Điểm thả tại chỗ, rồi tính hành trình: các điểm trong tầm gần trước (SelectSwordPoints), điểm cuối là chỗ cũ.
        addPoint(G, p, p.x, p.y);
        const rest = bag(G).pts.slice(), route = [];
        let cx = p.x, cy = p.y;
        while (rest.length) {
          let bi = -1, bd = BB.far;
          rest.forEach((q, i) => { const d = Math.hypot(q.x - cx, q.y - cy); if (d <= bd) { bd = d; bi = i; } });
          if (bi < 0) break;
          const q = rest.splice(bi, 1)[0]; route.push(q); cx = q.x; cy = q.y;
        }
        Object.assign(p._smBb, { route, i: 0, from: { x: p.x, y: p.y }, hop: 0, stay: 0, line: [{ x: o.x, y: o.y }] });
        p.skillT = BB.landT + route.length * (BB.hop + BB.stay) + BB.hop + BB.lineDelay + 0.3;
      }
    },
    update(G, p, dt) {
      const s = p._smBb; if (!s) return;
      s.t += dt;
      if (s.stage < 3) {
        if (s.t < BB.dashT) { slide(G, p, s.ang, BB.dash / BB.dashT, dt); return; }
        if (s.ph === 0) {
          s.ph = 1;
          K.fx(G, 'c28_2_sword', p.x, p.y - BODY, { ang: s.ang, scale: 1.75, dur: 0.3 });
          coneHit(G, p, s.ang, BB.slashR, BB.half, BB.slashDmg, new Set(), { fx: 'hit_blue2' });
        }
        if (s.ph === 1 && s.t >= BB.dashT + 0.15) {
          s.ph = 2;
          // Kiếm rơi xuống chỗ quái bị nhắm (không có quái: trước mặt BB.fall).
          const e = s.e && alive(s.e) ? s.e : null;
          const tx = e ? ec(e)[0] : p.x + Math.cos(s.ang) * BB.fall, ty = e ? e.y : p.y + Math.sin(s.ang) * BB.fall;
          addPoint(G, p, tx, ty);
        }
        return;
      }
      // Lượt 3: chờ điểm tại chỗ chạm đất, lao qua từng điểm, về chỗ cũ, tung các đường chém.
      if (s.t < BB.landT) return;
      p._alpha = 0.35;
      if (s.ph === 0) {
        const goal = s.i < s.route.length ? s.route[s.i] : s.o;
        s.hop += dt;
        const k = Math.min(1, s.hop / BB.hop);
        p.x = s.from.x + (goal.x - s.from.x) * k; p.y = s.from.y + (goal.y - s.from.y) * k;
        setFace(p, Math.atan2(goal.y - s.from.y, goal.x - s.from.x));
        if (k >= 1) {
          s.stay = 0; s.hop = 0; s.from = { x: goal.x, y: goal.y };
          if (goal === s.o) { s.ph = 2; s.lineT = 0; }
          else {
            s.ph = 1; s.cur = goal; s.line.push({ x: goal.x, y: goal.y });
            for (const e of K.inRadius(G, goal.x, goal.y - BODY, BB.cutR)) hit(G, p, e, BB.ptDmg, { critChance: p.crit, repel: 1, fx: 'hit_white' });
            // c28_2_sword_cut_combo_small: ba đường cắt xoay ngẫu nhiên quanh điểm (prefab dựng bằng TransformRandomRotation nên vẽ tay).
            for (let k = 0; k < 3; k++) {
              const a = SK.rand() * Math.PI, r = BB.cutR * 0.7;
              streak(G, goal.x - Math.cos(a) * r, goal.y - BODY - Math.sin(a) * r, goal.x + Math.cos(a) * r, goal.y - BODY + Math.sin(a) * r, 0.25, 3);
            }
            for (const e of K.inRadius(G, goal.x, goal.y - BODY, BB.cutR)) hit(G, p, e, BB.cutDmg, { critChance: p.crit, repel: 0, fx: 'hit_white' });
            takePoint(G, goal);
          }
        }
      } else if (s.ph === 1) {
        s.stay += dt;
        if (s.stay >= BB.stay) { s.ph = 0; s.i++; }
      } else if (s.ph === 2) {
        s.lineT += dt;
        if (s.lineT >= BB.lineDelay && !s.lined) {
          s.lined = true;
          const L = s.line, seen = new Set();
          for (let i = 0; i + 1 < L.length; i++) {
            streak(G, L[i].x, L[i].y - BODY, L[i + 1].x, L[i + 1].y - BODY, 0.3, 6);
            segHit(G, p, L[i].x, L[i].y - BODY, L[i + 1].x, L[i + 1].y - BODY, BB.lineW, BB.lineDmg, seen, { fx: 'hit_white' });
          }
          for (const e of seen) if (SK.rand() * 100 < BB.dizzy) K.debuff(G, e, 'dizzy');
          G.shake = Math.max(G.shake, 2);
        }
      }
    },
    end(G, p) { p._smBb = null; guard(p, false, 0); }
  };
})();
