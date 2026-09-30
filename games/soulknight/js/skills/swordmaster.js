// Kỹ năng Kiếm Tông (c28): tempest_blade, wisps_of_clouds, blinkblade_codex + nội tại Kiếm Khí. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ hero.json C29SkillSetting (nút `setting` của C29Controller) và mã C29Controller / SwordMasterFlySword đọc bằng
// tools/sk_method.py [ĐO <Lớp.Method>]. Chỗ mã không chứa số (bán kính vùng chém, tầm trúng của vệt) là hộp va chạm trong prefab đạn nên
// ghi [ƯỚC LƯỢNG]. Đơn vị Unity 1 = 1 ô = 16 px. Kiếm Khí (SwordPower) đầy → chiêu "đại kiếm" (isFullPower): xem QI bên dưới.
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, I = SK.input;
  const { alive, ec, hit } = K;
  const BODY = 7;                                      // tâm thân cách chân [ƯỚC LƯỢNG]
  const rad = d => -d * Math.PI / 180;                 // angleZ Unity (y hướng lên) → canvas (y hướng xuống)
  const solid = (G, x, y) => W.solidAt(G.map, x, y);
  const setFace = (p, a) => { if (Math.abs(Math.cos(a)) > 0.1) p.face = Math.cos(a) > 0 ? 1 : -1; };
  const outExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));   // DOTween Ease 18 của IESkill0

  // ---------------------------------------------------------------- nội tại Kiếm Khí (SwordPower)
  // [ĐO C29Controller] MaxSwordPower 30 (get_MaxSwordPower); ctor đặt _skillGetPower = _skillGetPower1 = 5; AddPower bỏ qua khi đã đầy;
  // set_SwordPower(0) khi tung chiêu lúc IsPowerFull (tempest ngay đầu IESkill0, wisps ở IESkillLast1, blink cuối IESkillLast2).
  // Nội tại chỉ chạy khi Active = HasBuff(1012) — bản web coi luôn bật, tắt được bằng SK.passiveOn.
  const QI = { max: 30, gain: 5 };
  const on = p => p.hero === 'swordmaster' && (SK.passiveOn ? SK.passiveOn(p) : true);
  const qi = p => p._smQi || 0;
  const full = p => on(p) && qi(p) >= QI.max;
  function setQi(G, p, v) {
    const was = full(p);
    p._smQi = Math.max(0, Math.min(QI.max, v));
    if (!was && full(p)) K.fx(G, 'effect_sword_power', p.x, p.y, { follow: p, dy: -BODY });   // đầy: phát tia (PlayBuffClip)
  }
  const gain = (G, p, n) => { if (on(p) && !full(p)) setQi(G, p, qi(p) + n); };
  // Thanh Kiếm Khí (RefreshSkillUI) vẽ trên nút kỹ năng: prefab UI của nó không có trong data/sk-ui.js nên vẽ bằng mã.
  SK.on('hud', (ctx, G) => {
    const p = G.player;
    if (!p || p.hero !== 'swordmaster' || G.state !== 'stage' || !on(p)) return;
    const v = SK.view, cx = v.w - 16, cy = v.h - 17, w = 30, f = qi(p) / QI.max;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - w / 2, cy - 22, w, 4);
    ctx.fillStyle = f >= 1 ? '#ffffff' : '#48fff4'; ctx.fillRect(cx - w / 2, cy - 22, Math.round(w * f), 4);
  });

  // Bất tử + đạn xuyên qua trong lúc lướt; sau khi xong còn `after` giây (unProtectedTime).
  function guard(p, on_, after) {
    if (on_) { K.ghost(p, true); K.hurtMods(p).sm = () => 0; return; }
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
  // Khung của atlas SK.vfx ('sword' = c28_2_sword_point.nail, 'swordmaster_big_sword' = đại kiếm) vẽ tại (x,y) mũi hướng ang.
  function swordSprite(ctx, x, y, ang, sc, alpha, name) {
    const V = window.SK_VFX, f = V && V.atlas.f[name || 'sword'], img = f && SK.vfx && SK.vfx.pages[f[0]];
    if (!img) { if (f && SK.vfx && !SK.vfx.loaded) SK.vfx.load(); return; }   // trang atlas nạp lười
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2); if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.drawImage(img, f[1], f[2], f[3], f[4], -f[3] * sc / 2, -f[4] * sc / 2, f[3] * sc, f[4] * sc);
    ctx.restore();
  }
  // Nhóm trạng thái theo ván: phi kiếm đang có, điểm kiếm đang cắm.
  const bag = G => G._sm || (G._sm = { swords: [], pts: [] });

  // ================================================================ 1. Lưỡi Kiếm Tật Phong (tempest_blade)
  // [ĐO IESkill0 + C29SkillSetting]: cd 8; lướt tối đa maxMoveDistance 5.5 ô, thời gian = quãng/5.5 × moveTime 0.2 s (DOMove ease OutExpo),
  // chém baseSlashCount 6 nhát theo Frames.angleZ {60,300,180,120,0,240} cách defaultTriggerTime 0.08 s (baseDamage 6), rồi lùi backDistance 4 ô
  // trong backTime 0.1 s (InOutQuad). [ĐO IEAfterSlash] sau backTriggerTime 0.15 s một nhát "chém lùi" (CreateBackSlash, backSize 1.25), rồi
  // backSlashCount 2 nhát theo Frames[0..1] cách 0.15 s. Bất tử suốt kỹ năng + unProtectedTime 0.25 s ("Trong lúc chém sẽ không phải chịu DMG").
  // Đầy Kiếm Khí (isFullPower; tiêu hết ngay đầu kỹ năng, cuối kỹ năng +5): nhát chém ×upgradeScale 1.25, chém lùi thêm upgradeAdd 2 nhát, sau nhát
  // cuối HolyAttack đại kiếm (c28_skill_1_big_sword) sát thương flySlashDamage 8 × bigSwordDamageFactor 1.5 ở quái gần nhất trong 10 ô
  // (chậm bigSworddelayShow 0.2 s), và (IESkill0 trạng thái 5) sóng kiếm: 1 + 2×(flySlashCount 2 − 1) = 3 sóng lệch 0/±15°, dmg 8, tốc flySpeed 20 ô/s,
  // sống 3 s (Bullet03 destroy_time). Không đầy thì KHÔNG có sóng kiếm (mã bỏ qua nhánh này khi isFull = false).
  const TB = { dash: 5.5 * T, dashT: 0.2, frames: [60, 300, 180, 120, 0, 240], gap: 0.08, dmg: 6, back: 4 * T, backT: 0.1, backTrig: 0.15,
    backN: 2, backAdd: 2, backSize: 1.25, up: 1.25, after: 0.25,
    waveDmg: 8, waveV: 20 * T, waveLife: 3, waveW: 1.5 * T, waveStep: 15, waveN: 2, bigF: 1.5, bigDelay: 0.2, bigFind: 10 * T,
    reach: 2.6 * T, bigR: 2.2 * T, backHalf: 1.1 };   // tầm chém, bán kính đại kiếm, nửa góc chém lùi: hộp va chạm prefab [ƯỚC LƯỢNG]
  K.DUR_UI.tempest_blade = TB.dashT + TB.frames.length * TB.gap + 2 * TB.backTrig + TB.backN * TB.backTrig;
  function flyWave(G, p, ang, dmgAcc) {
    const s = { x: p.x, y: p.y - BODY, d: 0, seen: new Set() };
    G.props.push({ x: s.x, y: s.y, update(G2, q, dt) {
      const step = TB.waveV * dt; s.d += step;
      s.x += Math.cos(ang) * step; s.y += Math.sin(ang) * step; q.x = s.x; q.y = s.y;
      segHit(G2, p, s.x - Math.cos(ang) * 6, s.y - Math.sin(ang) * 6, s.x, s.y, TB.waveW, dmgAcc, s.seen, { fx: 'hit_blue2', repel: 2 });
      if (s.d > TB.waveV * TB.waveLife || solid(G2, s.x, s.y)) { q.gone = true; K.fx(G2, 'c28_fly_slash_effect', s.x, s.y, { ang, scale: 0.8 }); }
    }, draw(ctx, G2, q) { SK.drawRip(ctx, SK.prefab('c28_fly_slash'), s.x, s.y, { rot: ang, t: G2.t }); } });
  }
  // HolyAttack: đại kiếm rơi xuống chỗ quái gần nhất trong 10 ô (không có quái: trước mặt 4 ô [ƯỚC LƯỢNG]).
  function bigSword(G, p, ang) {
    const e = K.nearest(G, p.x, p.y - BODY, TB.bigFind, {});
    const tx = e ? ec(e)[0] : p.x + Math.cos(ang) * 4 * T, ty = e ? ec(e)[1] : p.y - BODY + Math.sin(ang) * 4 * T, s = { t: 0, hit: false };
    G.props.push({ x: tx, y: ty, update(G2, q, dt) {
      s.t += dt;
      if (!s.hit && s.t >= TB.bigDelay) {
        s.hit = true;
        for (const en of K.inRadius(G2, tx, ty, TB.bigR)) hit(G2, p, en, TB.waveDmg * TB.bigF, { critChance: p.crit, repel: 3, fx: 'hit_blue2' });
        K.fx(G2, 'c28_fly_slash_effect', tx, ty, { scale: 1.4, layer: 'ground' });
        G2.shake = Math.max(G2.shake, 3);
      }
      if (s.t >= TB.bigDelay + 0.5) q.gone = true;
    }, draw(ctx) {
      const k = Math.min(1, s.t / TB.bigDelay);
      swordSprite(ctx, tx, ty - (1 - k) * 90, Math.PI / 2, 1, s.hit ? Math.max(0, 1 - (s.t - TB.bigDelay) / 0.5) : 1, 'swordmaster_big_sword');
    } });
  }
  S.tempest_blade = {
    start(G, p) {
      K.layer(G);
      const a = aim(G, p, TB.dash + 2 * T), fl = full(p);
      const dist = Math.min(TB.dash, Math.max(2 * T, a.d - T));   // fixMoveEnd 1 ô: dừng trước quái 1 ô
      const dT = dist / TB.dash * TB.dashT, n = TB.backN + (fl ? TB.backAdd : 0), t1 = dT + TB.frames.length * TB.gap;
      p.skillT = t1 + 2 * TB.backTrig + n * TB.backTrig;
      p._tb = { ang: a.ang, dist, dT, t1, n, full: fl, t: 0, slashes: 0, bk: 0, back: false, wave: false, backSlash: false };
      setFace(p, a.ang);
      guard(p, true);
      if (fl) setQi(G, p, 0);
      K.fx(G, 'c28_buff', p.x, p.y, { follow: p, dy: -BODY, dur: 0.6 });
    },
    update(G, p, dt) {
      const s = p._tb; if (!s) return;
      const reach = TB.reach * (s.full ? TB.up : 1);
      if (s.t < s.dT) {
        const x0 = s.t / s.dT;
        s.t += dt;
        slide(G, p, s.ang, s.dist * (outExpo(Math.min(1, s.t / s.dT)) - outExpo(x0)) / dt, dt);
        return;
      }
      s.t += dt;
      // Chém: mỗi nhát một đường thẳng xuyên tâm theo góc Frames; mỗi quái chịu mỗi nhát một lần.
      const due = Math.min(TB.frames.length, Math.floor((s.t - s.dT) / TB.gap) + 1);
      while (s.slashes < due) {
        const a = rad(TB.frames[s.slashes]), cx = p.x, cy = p.y - BODY;
        K.fx(G, 'c28_skill_1_1', cx, cy, { ang: a, dur: 0.3 });
        segHit(G, p, cx - Math.cos(a) * reach, cy - Math.sin(a) * reach, cx + Math.cos(a) * reach, cy + Math.sin(a) * reach, 14, TB.dmg, new Set(), { fx: 'hit_blue2' });
        s.slashes++;
      }
      const t1 = s.t1;
      if (s.t >= t1 && s.t < t1 + TB.backT) slide(G, p, s.ang + Math.PI, TB.back / TB.backT, dt);   // lùi về sau
      if (!s.wave && s.t >= t1 + TB.backT) {
        s.wave = true;
        gain(G, p, QI.gain);
        if (s.full) {
          for (let i = 0; i < 2 * TB.waveN - 1; i++) {   // 0, +15, −15
            const k = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * TB.waveStep;
            flyWave(G, p, s.ang + k * Math.PI / 180, TB.waveDmg);
          }
          G.shake = Math.max(G.shake, 2);
        }
      }
      if (!s.backSlash && s.t >= t1 + TB.backTrig) {   // CreateBackSlash
        s.backSlash = true;
        K.fx(G, 'c28_skill_1_1', p.x, p.y - BODY, { ang: s.ang, dur: 0.3, scale: TB.backSize });
        coneHit(G, p, s.ang, reach * TB.backSize, TB.backHalf, TB.dmg, new Set(), { fx: 'hit_blue2' });
      }
      while (s.bk < s.n && s.t >= t1 + 2 * TB.backTrig + s.bk * TB.backTrig) {   // CreateIndexSlash(loại lùi, chỉ số bk)
        const a = rad(TB.frames[s.bk]), cx = p.x, cy = p.y - BODY, r = reach * TB.backSize;
        K.fx(G, 'c28_skill_1_1', cx, cy, { ang: a, dur: 0.3, scale: TB.backSize });
        segHit(G, p, cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 14, TB.dmg, new Set(), { fx: 'hit_blue2' });
        if (s.full && s.bk === s.n - 1) { bigSword(G, p, s.ang); G.shake = Math.max(G.shake, 3); }
        s.bk++;
      }
    },
    end(G, p) { p._tb = null; guard(p, false, TB.after); }
  };

  // ---------------------------------------------------------------- phi kiếm (SwordMasterFlySword)
  // [ĐO] Takeoff bay moveTime 0.2 s với tốc flySwordSpeed 38 ô/s (CreateOneFlySword ghi startSpeed) → Waitting đứng tại chỗ tối đa 10 s (totalTime)
  // hoặc tới khi bị triệu hồi → BackAttack quay backTime 0.3 s về quái gần nhất trong 6 ô (không có thì về người chơi) rồi bay về. Sát thương mỗi
  // lần chạm _flySwordDamage 3 (CheckSkillData1). Tốc độ bay về (backSpeed) và đường bay sau lượt quay mã không nêu rõ [ƯỚC LƯỢNG = 38 ô/s, thẳng về người].
  const WS = { dmg: 3, v: 38 * T, end: 8 * T, fwdN: 3, endN: 3, fwdStep: 90, fwd: 1.5 * T, endDis: 8 * T, life: 10, turn: 0.3, seek: 6 * T, r: 11, back: 38 * T };
  function newSword(G, p, x, y, ang, maxD) {
    const B = bag(G), s = { x, y, ang, st: 'fly', t: 0, d: 0, maxD: maxD == null ? WS.end : maxD, seen: new Set(), bob: SK.rand() * 6 };
    s.trail = K.fx(G, 'c28_1_fly_sword', x, y, { follow: s, dur: 30 });
    B.swords.push(s);
    G.props.push({ x, y, update(G2, q, dt) {
      s.t += dt;
      if (s.st === 'turn') {
        if (s.t >= WS.turn) { s.st = 'back'; s.seen = new Set(); }
        else s.ang = s.look;
      }
      if (s.st === 'fly' || s.st === 'back') {
        if (s.st === 'back') { s.ang = Math.atan2(p.y - BODY - s.y, p.x - s.x); }
        const step = (s.st === 'fly' ? WS.v : WS.back) * dt;
        s.x += Math.cos(s.ang) * step; s.y += Math.sin(s.ang) * step; s.d += step;
        for (const e of G2.enemies) {
          if (!alive(e) || s.seen.has(e)) continue;
          const [cx, cy] = ec(e);
          if (Math.hypot(cx - s.x, cy - s.y) < WS.r + e.r) { s.seen.add(e); hit(G2, p, e, WS.dmg, { critChance: p.crit, ang: s.ang, repel: 2, fx: 'hit_white' }); }
        }
        if (s.st === 'fly' && (s.d >= s.maxD || solid(G2, s.x, s.y))) { s.st = 'stand'; s.t = 0; K.stopFx(s.trail); }
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
  // Triệu hồi mọi phi kiếm đang đứng (OnSwordBackAct → SetSwordBack): quay về quái gần trong 6 ô hoặc về người rồi bay về.
  function recall(G, p) {
    for (const s of bag(G).swords) {
      if (s.st !== 'stand') continue;
      const e = K.nearest(G, s.x, s.y, WS.seek, {});
      s.look = e ? Math.atan2(ec(e)[1] - s.y, ec(e)[0] - s.x) : Math.atan2(p.y - BODY - s.y, p.x - s.x);
      s.st = 'turn'; s.t = 0;
      s.trail = K.fx(G, 'c28_1_fly_sword', s.x, s.y, { follow: s, dur: 30 });
    }
  }

  // ================================================================ 2. Kiếm Lưu Vân (wisps_of_clouds)
  // [ĐO IESkill1/IESkillLast1 + CheckSkillData1; config max 3, cd 6 mỗi lượt]: lượt 1-2 lướt tối đa baseMoveDistance1 7.5 ô trong quãng/7.5 × moveTime1
  // 0.2 s (dừng trước quái fixMoveEnd 1 ô), rồi chém slashSize1 1.5 với _slashDamage 8 và CreateFlySwordForward: flySwordCount 3 phi kiếm xoè
  // 30° (góc = (−(n/2)×90 + i×90)/n) từ trước mặt flySwordForwardOffset 1.5 ô; sau flyDelayCreateTime 0.4 s CreateFlySwordEnd: flySwordEndCount 3
  // phi kiếm xếp vòng quanh tâm lướt (giữa quãng lướt), mỗi thanh bắt đầu cách tâm flySwordEndDis 8 ô và bay vào tâm rồi đứng lại. Phi kiếm chạm
  // gây 3. Bất tử noDamageTime 0.4 s. Lượt 3 (IESkillLast1): triệu hồi mọi phi kiếm ngay khi bắt đầu lướt, tiêu hết Kiếm Khí nếu đầy, +5 (+5 lúc
  // xong), rồi trailCount 6 vệt chém (_tailDamage 6) cách trailCreateTime 0.05 s quanh tâm lướt, vị trí/góc theo bảng _trailPosAngles của ctor
  // {(0.06,1.31,325°),(0.02,−1.15,45°),(−1.16,0.06,45°),(1.63,0.33,225°)} xoay vòng. Đầy Kiếm Khí (CheckSkillData1): +1 phi kiếm tới, +1 phi kiếm
  // vòng, +2 vệt chém.
  const WC = { dash: 7.5 * T, dashT: 0.2, stop: T, slash: 1.5, dmg: 8, noDmg: 0.4, delay: 0.4, trailN: 6, trailGap: 0.05, trailDmg: 6,
    trails: [[0.06, 1.31, 325], [0.02, -1.15, 45], [-1.16, 0.06, 45], [1.63, 0.33, 225]], slashR: 3.2 * T, half: 1.2, trailR: 1.6 * T };   // vùng chém, vùng vệt: hộp va chạm prefab [ƯỚC LƯỢNG]
  K.DUR_UI.wisps_of_clouds = WC.delay;
  // Đặt phi kiếm vòng: xuất phát cách tâm endDis (dừng sớm nếu vướng tường), bay vào tâm.
  function ringSword(G, p, cx, cy, a) {
    let d = 0;
    while (d < WS.endDis && !solid(G, cx - Math.cos(a) * (d + 4), cy - Math.sin(a) * (d + 4))) d += 4;
    if (d < 12) return;
    newSword(G, p, cx - Math.cos(a) * d, cy - Math.sin(a) * d, a, d);
  }
  S.wisps_of_clouds = {
    start(G, p) {
      K.layer(G);
      const ch = K.charges(p, 'wisps_of_clouds'), stage = Math.min(3, ch.max - ch.n + 1);
      K.useCharge(p, 'wisps_of_clouds');
      const a = aim(G, p, WC.dash + 2 * T), fl = full(p);
      const dist = Math.min(WC.dash, Math.max(2 * T, a.d - WC.stop)), dT = dist / WC.dash * WC.dashT;
      const cx = p.x + Math.cos(a.ang) * dist / 2, cy = p.y - BODY + Math.sin(a.ang) * dist / 2;   // _centerPos
      const nT = WC.trailN + (fl ? 2 : 0);
      p.skillT = stage === 3 ? Math.max(dT, (nT - 1) * WC.trailGap) + 0.1 : WC.delay + 0.1;
      p._wc = { stage, ang: a.ang, dist, dT, v: dist / dT, t: 0, full: fl, cx, cy, nT, slashed: false, ring: false, trail: 0, unguard: false };
      setFace(p, a.ang);
      guard(p, true);
      K.fx(G, 'c28_buff', p.x, p.y, { follow: p, dy: -BODY, dur: 0.6 });
      if (stage === 3) {
        if (fl) setQi(G, p, 0);
        gain(G, p, QI.gain);
        recall(G, p);
        G.shake = Math.max(G.shake, 2);
      }
    },
    update(G, p, dt) {
      const s = p._wc; if (!s) return;
      s.t += dt;
      if (!s.unguard && s.t >= WC.noDmg) { s.unguard = true; guard(p, false, 0); }
      if (s.t < s.dT) slide(G, p, s.ang, s.v, dt);
      if (s.stage === 3) {
        // CreatSlashTrail: vệt chém quanh tâm lướt, mỗi vệt trúng mỗi quái một lần.
        while (s.trail < s.nT && s.trail * WC.trailGap <= s.t) {
          const tr = WC.trails[s.trail % 4], tx = s.cx + tr[0] * T, ty = s.cy - tr[1] * T;
          K.fx(G, 'c28_1_sword_trail', tx, ty, { ang: rad(tr[2]), dur: 0.3 });
          for (const e of K.inRadius(G, tx, ty, WC.trailR)) hit(G, p, e, WC.trailDmg, { critChance: p.crit, ang: s.ang, repel: 1, fx: 'hit_white' });
          s.trail++;
        }
        return;
      }
      if (!s.slashed && s.t >= s.dT) {
        s.slashed = true;
        K.fx(G, 'c28_1_sword', p.x, p.y - BODY, { ang: s.ang, scale: WC.slash, dur: 0.3 });   // CreateSlashSkill1
        coneHit(G, p, s.ang, WC.slashR, WC.half, WC.dmg, new Set(), { fx: 'hit_blue2' });
        const n = WS.fwdN + (s.full ? 1 : 0), fx0 = p.x + Math.cos(s.ang) * WS.fwd, fy0 = p.y - BODY + Math.sin(s.ang) * WS.fwd;
        for (let i = 0; i < n; i++) newSword(G, p, fx0, fy0, s.ang + ((-(n >> 1) * WS.fwdStep + i * WS.fwdStep) / n) * Math.PI / 180);
      }
      if (!s.ring && s.t >= WC.delay) {
        s.ring = true;
        const n = WS.endN + (s.full ? 1 : 0);
        for (let i = 0; i < n; i++) ringSword(G, p, s.cx, s.cy, s.ang + (i - (n >> 1)) * 2 * Math.PI / n);
      }
    },
    end(G, p) {
      const s = p._wc; p._wc = null;
      guard(p, false, s && !s.unguard ? Math.max(0, WC.noDmg - s.t) : 0);
      if (s && s.stage === 3) gain(G, p, QI.gain);   // AddPower thứ hai cuối IESkillLast1
    }
  };

  // ================================================================ 3. Kiếm Quyết Tức Thời (blinkblade_codex)
  // [ĐO IESkill2/IESkillLast2 + C29SkillSetting; config max 3, cd 7]: lượt 1-2 tìm quái trong findEnmeyRange3 5 ô, lao tối đa baseMoveDistance3
  // 2 ô trong quãng/2 × moveTime3 0.15 s, chém ngang slashSize3 1.75 (baseDamage3 3; đầy Kiếm Khí ×upgradeScale 1.25) và gọi một thanh kiếm rơi
  // xuống (điểm kiếm sát thương swordPointDamage 3, tối đa maxSwordPointCount 7 điểm, quá thì bỏ điểm cũ). Lượt 3 thả thêm một điểm ngay chỗ đứng,
  // lao lần lượt tới mọi điểm trong maxSwordPointDistance 25 ô (gần trước): bước đầu mất endMoveTime3 0.2 s, mỗi điểm sau ×0.8, sàn 0.4×0.2 s
  // (IESkillLast2 trạng thái 1), không có thời gian dừng giữa hai điểm; mỗi điểm nhận nhát chém 3 + vệt cắt swordCutComboDamage 2
  // (cutComboSize 0.7); cuối cùng về chỗ cũ, sau delaySwordLineComboTime 0.4 s tung các đường chém nối điểm (swordLineDamage 3, dizzyProbability 50 %);
  // đầy Kiếm Khí thì 0.4 s sau tung thêm một loạt đường chém rộng thêm addLineScale 0.5, tiêu hết Kiếm Khí sau lượt lao rồi +5. Bất tử noDamageTime
  // 0.4 s mỗi bước lao (StartHitTrigger) nên phủ cả lượt 3.
  const BB = { find: 5 * T, dash: 2 * T, dashT: 0.15, slashDmg: 3, landDmg: 3, landT: 0.2, max: 7, far: 25 * T, up: 1.25,
    ptDmg: 3, cutDmg: 2, lineDmg: 3, lineW: 14, lineAdd: 0.5, lineDelay: 0.4, dizzy: 50, hop: 0.2, hopMul: 0.8, hopMin: 0.4 * 0.2,
    slashR: 2.8 * T, half: 1.1, landR: 2 * T, cutR: 1.6 * T, fall: 3 * T };   // tầm chém, bán kính rơi/cắt, điểm rơi khi không có quái: hộp va chạm prefab [ƯỚC LƯỢNG]
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
  // Một loạt đường chém nối các điểm đã đi qua; w = độ rộng.
  function lineCombo(G, p, L, w) {
    const seen = new Set();
    for (let i = 0; i + 1 < L.length; i++) {
      streak(G, L[i].x, L[i].y - BODY, L[i + 1].x, L[i + 1].y - BODY, 0.3, w * 0.43);
      segHit(G, p, L[i].x, L[i].y - BODY, L[i + 1].x, L[i + 1].y - BODY, w, BB.lineDmg, seen, { fx: 'hit_white' });
    }
    for (const e of seen) if (SK.rand() * 100 < BB.dizzy) K.debuff(G, e, 'dizzy');
    G.shake = Math.max(G.shake, 2);
  }
  S.blinkblade_codex = {
    start(G, p) {
      K.layer(G);
      const ch = K.charges(p, 'blinkblade_codex'), stage = Math.min(3, ch.max - ch.n + 1);
      K.useCharge(p, 'blinkblade_codex');
      const a = aim(G, p, BB.find), o = { x: p.x, y: p.y };
      p._smBb = { stage, ang: a.ang, e: a.e, t: 0, ph: 0, o, full: full(p) };
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
        Object.assign(p._smBb, { route, i: 0, from: { x: p.x, y: p.y }, hop: 0, hopT: BB.hop, line: [{ x: o.x, y: o.y }] });
        let tot = BB.landT, h = BB.hop;
        for (let i = 0; i <= route.length; i++) { tot += h; h = Math.max(BB.hopMin, h * BB.hopMul); }
        p.skillT = tot + BB.lineDelay * (p._smBb.full ? 2 : 1) + 0.3;
      }
    },
    update(G, p, dt) {
      const s = p._smBb; if (!s) return;
      s.t += dt;
      if (s.stage < 3) {
        if (s.t < BB.dashT) { slide(G, p, s.ang, BB.dash / BB.dashT, dt); return; }
        if (s.ph === 0) {
          s.ph = 1;
          K.fx(G, 'c28_2_sword', p.x, p.y - BODY, { ang: s.ang, scale: 1.75 * (s.full ? BB.up : 1), dur: 0.3 });
          coneHit(G, p, s.ang, BB.slashR * (s.full ? BB.up : 1), BB.half, BB.slashDmg, new Set(), { fx: 'hit_blue2' });
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
        const k = Math.min(1, s.hop / s.hopT);
        p.x = s.from.x + (goal.x - s.from.x) * k; p.y = s.from.y + (goal.y - s.from.y) * k;
        setFace(p, Math.atan2(goal.y - s.from.y, goal.x - s.from.x));
        if (k >= 1) {
          s.hop = 0; s.from = { x: goal.x, y: goal.y }; s.hopT = Math.max(BB.hopMin, s.hopT * BB.hopMul);
          if (goal === s.o) {
            s.ph = 2; s.lineT = 0;
            if (s.full) setQi(G, p, 0);
            gain(G, p, QI.gain);
          } else {
            s.i++; s.line.push({ x: goal.x, y: goal.y });
            for (const e of K.inRadius(G, goal.x, goal.y - BODY, BB.cutR)) hit(G, p, e, BB.ptDmg, { critChance: p.crit, repel: 1, fx: 'hit_white' });
            // c28_2_sword_cut_combo_small: ba đường cắt xoay ngẫu nhiên quanh điểm (prefab dựng bằng TransformRandomRotation nên vẽ tay).
            for (let j = 0; j < 3; j++) {
              const a = SK.rand() * Math.PI, r = BB.cutR * 0.7;
              streak(G, goal.x - Math.cos(a) * r, goal.y - BODY - Math.sin(a) * r, goal.x + Math.cos(a) * r, goal.y - BODY + Math.sin(a) * r, 0.25, 3);
            }
            for (const e of K.inRadius(G, goal.x, goal.y - BODY, BB.cutR)) hit(G, p, e, BB.cutDmg, { critChance: p.crit, repel: 0, fx: 'hit_white' });
            takePoint(G, goal);
          }
        }
      } else if (s.ph === 2) {
        s.lineT += dt;
        if (s.lineT >= BB.lineDelay && !s.lined) { s.lined = true; lineCombo(G, p, s.line, BB.lineW); }
        if (s.full && s.lineT >= 2 * BB.lineDelay && !s.lined2) { s.lined2 = true; lineCombo(G, p, s.line, BB.lineW * (1 + BB.lineAdd)); }
      }
    },
    end(G, p) { p._smBb = null; guard(p, false, 0); }
  };
})();
