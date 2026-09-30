// Kỹ năng Thuyền Trưởng (c38): barrel_blowout, onward_wavecutter. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ ctrlFields của SK_SKILLS86.heroes.captain, MonoBehaviour RGCaptainBox / CaptainSkillBoat và mã C39Controller (sk_method.py) [ĐO]. "max 3" trong config
// không phải số lượt: skillType 1 và 0 không thuộc {4, 6, 9, 12} nên SkillInfo.hasMultiCount = false [ĐO SkillInfo.get_hasMultiCount].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, W = SK.world;
  const { alive, ec, nearest, inRadius, hit, fx, stopFx, cfg, CTRL, layer, setMul, hurtMods, debuff } = K;
  const C = (k, d) => CTRL('captain', k, d);
  const TYPES = ['ice', 'fire', 'eletric'];   // RGCaptainBox.BoxType 0 / 1 / 2 [ĐO]

  // ================================================================ Tiệc Thùng Nổ
  // [ĐO c38/skill 1: cd 8, duration 8; ctrl: Skill0BasePlacementPerCast 4 (tối đa 6), MaxCaptainBoxCount 12, IceBoxDamage 18,
  // FireBoxDamage 25, EletricBoxDamage 12, IceBoxBuffProbability 50, BoxDamagePercent 0.25, BoxFullEffectDistance 4,
  // CaptainBoxConnectedExplodeRangeIncreaseRatioPerBox 0.1, CaptainBoxLinkRangeRadius 10, explodeChainTime 0.33, Skill0IgniteCooldown 1,
  // Skill0DetonateBirdFlyDuration 0.25, Skill0BoxDropAnimSpeed 3; RGCaptainBox hp 2; nổ Explode circle r 48 px]: bấm để vào chế độ đặt (8 s),
  // mỗi lần bấm rơi một thùng (đủ 4 thì thôi); thùng nối nhau trong 10 ô. Kích nổ là NÚT RIÊNG (ButtonCaptainSkill1, UpdateSkill0IgniteButton) →
  // `special` (phím L): chim bay 0.25 s tới thùng sẵn sàng gần người nhất rồi cả chuỗi nổ, mỗi thùng nổ cách 0.33 s, nút chờ 1 s sau khi bấm.
  // Sát thương mỗi thùng = Damage × GetCaptainBoxAttackPercent: còn thùng khác cách < 4 ô thì chỉ BoxDamagePercent = 25%, không thì 100%;
  // bán kính nổ × (1 + 0.1 n) khi cụm nối n ≥ 2 thùng [ĐO GetCaptainBoxConnectedExplodeSizeMultiplier].
  // [ƯỚC LƯỢNG: thứ tự nổ theo khoảng cách (gốc xếp hàng theo đợt), chỗ đặt (gốc là chạm màn hình), màn không zoom-out như Skill0CameraSize 11]
  const BB = { r0: 48, bird: 0.25, ignCd: 1 };   // bán kính nổ 48 px [ĐO prefab]; chim bay Skill0DetonateBirdFlyDuration, chờ Skill0IgniteCooldown
  const boxes = G => G._cbox || (G._cbox = []);
  const dmgOf = t => C(t === 'ice' ? 'IceBoxDamage' : t === 'fire' ? 'FireBoxDamage' : 'EletricBoxDamage', 10);
  const link = () => C('CaptainBoxLinkRangeRadius', 10) * U;
  function group(G, b0) {
    const g = [b0];
    for (let i = 0; i < g.length; i++) for (const q of boxes(G)) if (g.indexOf(q) < 0 && Math.hypot(q.x - g[i].x, q.y - g[i].y) <= link()) g.push(q);
    return g;
  }
  const sizeK = n => n >= 2 ? 1 + C('CaptainBoxConnectedExplodeRangeIncreaseRatioPerBox', 0.1) * n : 1;   // [ĐO GetCaptainBoxConnectedExplodeSizeMultiplier]
  function place(G, p) {
    const bs = boxes(G), reach = C('skill1AimRange', 8) * U;
    // Đặt cạnh quái gần nhất chưa có thùng (như chạm vào quái trên màn hình), lệch một ô về phía người; không có quái thì rơi trước mặt
    // Skill1BoxDistance ô.
    const e = nearest(G, p.x, p.y - 6, reach, { skip: q => bs.some(b => Math.hypot(b.x - q.x, b.y - q.y) < 2 * T) });
    let x, y;
    if (e) { const a = Math.atan2(p.y - e.y, p.x - e.x); x = e.x + Math.cos(a) * T; y = e.y + Math.sin(a) * T; }
    else { const a = K.aimDir(p), d = C('Skill1BoxDistance', 6) * U; x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d; }
    for (let k = 0; k < 8 && W.solidAt(G.map, x, y); k++) { x += (p.x - x) * 0.25; y += (p.y - y) * 0.25; }
    while (bs.length >= C('MaxCaptainBoxCount', 12)) bs.shift().gone = true;
    const b = { x, y, type: TYPES[Math.floor(SK.rand() * 3)], t: 0 };
    bs.push(b);
    G.props.push({   // thùng xếp lớp theo y như quái/nhân vật
      x, y, t: 0,
      update(G2, q, dt) { if (b.gone) q.gone = true; },
      draw(ctx, G2) {
        const pr = SK.prefab(b.type + '_box'); if (!pr) return;
        const fall = Math.max(0, 1 - b.t * C('Skill0BoxDropAnimSpeed', 3) / 0.75);   // rơi từ trên xuống 0.25 s
        ctx.save();
        if (b.lit) ctx.globalAlpha = 0.85 + 0.15 * Math.sin(G2.t * 40);
        K.drawRip(ctx, pr, b.x, b.y - fall * 60, { t: b.t });
        ctx.restore();
      }
    });
  }
  function explodeBox(G, p, b, n) {
    const k = sizeK(n), R = BB.r0 * k;
    const close = boxes(G).some(q => q !== b && !q.done && Math.hypot(q.x - b.x, q.y - b.y) < C('BoxFullEffectDistance', 4) * U);
    const dmg = Math.round(dmgOf(b.type) * (close ? C('BoxDamagePercent', 0.25) : 1));
    fx(G, b.type === 'ice' ? 'ice_explode' : b.type === 'fire' ? 'fire_explode' : 'eletric_explode', b.x, b.y - 6, { state: 'explode_big', scale: k });
    const hits = inRadius(G, b.x, b.y - 6, R);
    for (const e of hits) {
      hit(G, p, e, dmg, { tag: 'bb', noMul: true, repel: 3, ang: Math.atan2(e.y - b.y, e.x - b.x) });
      if (b.type === 'ice' && SK.rand() * 100 < C('IceBoxBuffProbability', 50)) debuff(G, e, 'ice');
      else if (b.type === 'fire') debuff(G, e, 'fire');
      else if (b.type === 'eletric') { debuff(G, e, 'ele'); K.boltProp(G, [b.x, b.y - 30], () => ec(e), 0.25); }
    }
    G.shake = Math.max(G.shake, 3);
    return hits.length;
  }
  function detonate(G, p) {
    const bs = boxes(G).filter(b => !b.lit);
    if (!bs.length || G.t < (p._capIgn || 0)) return false;
    p._capIgn = G.t + BB.bird + BB.ignCd;
    bs.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const g = group(G, bs[0]).filter(b => !b.lit), o = bs[0];
    g.sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y));
    g.forEach((b, i) => { b.lit = true; b.at = BB.bird + i * C('explodeChainTime', 0.33); });
    const n = g.length, t0 = G.t;
    G.props.push({
      x: 0, y: -1e9, draw() {},
      update(G2, q) {
        for (const b of g) if (!b.done && G2.t - t0 >= b.at) { b.done = true; b.gone = true; explodeBox(G2, p, b, n); }
        if (g.every(b => b.done)) { G2._cbox = boxes(G2).filter(b => !b.gone); q.gone = true; }
      }
    });
    return true;
  }
  S.barrel_blowout = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'barrel_blowout').dur || 8;
      p._bb = { left: C('Skill0BasePlacementPerCast', 4) };
      barrelLayer(G);
    },
    press(G, p) {
      const s = p._bb; if (!s) return;
      place(G, p);
      if (--s.left <= 0) p.skillT = Math.min(p.skillT, 1e-4);
    },
    special(G, p) { detonate(G, p); },   // nút kích nổ riêng, dùng được cả khi hết chế độ đặt
    end(G, p) { p._bb = null; }
  };
  function barrelLayer(G) {
    if (G._cboxLayer && G.props.indexOf(G._cboxLayer) >= 0) return;
    G._cboxLayer = {
      x: 0, y: 0, t: 0,
      update(G2, q, dt) { q.t += dt; for (const b of boxes(G2)) b.t += dt; },
      draw(ctx, G2) {
        const bs = boxes(G2);
        // vòng phạm vi nổ (nhấp nháy nhẹ) và dây nối các thùng trong tầm nối
        ctx.save(); ctx.lineWidth = 1;
        for (const b of bs) {
          if (b.lit) continue;
          const n = group(G2, b).length, R = BB.r0 * sizeK(n);
          ctx.strokeStyle = 'rgba(255,200,90,' + (0.55 + 0.3 * Math.sin(b.t * C('CaptainBoxExplodeRangeCirclePulseSpeed', 2.5) * 2)) * Math.min(1, b.t / 0.4) + ')';
          ctx.beginPath(); ctx.ellipse(b.x, b.y - 2, R, R * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
          for (const q of bs) if (!q.lit && bs.indexOf(q) > bs.indexOf(b) && Math.hypot(q.x - b.x, q.y - b.y) <= link()) {
            ctx.strokeStyle = 'rgba(255,140,40,0.7)'; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(b.x, b.y - 8); ctx.lineTo(q.x, q.y - 8); ctx.stroke(); ctx.setLineDash([]);
          }
        }
        ctx.restore();
      }
    };
    G._cboxLayer.y = -1e9 + 1;
    G.props.push(G._cboxLayer);
  }
  SK.on('stageEnter', G => { G._cbox = []; G._cboxLayer = null; });

  // ================================================================ Xông lên! Tàu Cưỡi Sóng!
  // [ĐO c38/skill 2: cd 9, duration 1.5; ctrl: Skill2BoatSpeed 12.5, Skill2BoatLifeTime 7, Skill2BoatCollisionDamage 8,
  // Skill2BoatCollisionDamageCooldown 0.5; prefab CaptainSkillBoat: box 133×37 px, boardingAnchor (26, −20.75), scale 0.8]:
  // 1.5 s gọi tàu (bất tử, đứng yên), rồi lái tàu 7 s với tốc 12.5 ô/s, thân tàu húc quái 8 sát thương (0.5 s mỗi quái); vẫn bắn được;
  // bấm lại để xuống tàu sớm. Pha gọi tàu (Appear) khoá cả di chuyển lẫn tấn công: CaptainSkillBoat.CanOwnerOperate chỉ đúng khi ở pha Idle,
  // ngoài đó CaptainSkillBoatBoardingModule đặt _skill2BoatOperationLocked → RoleAtk bị chặn [ĐO] → p.noFire. Bất tử lúc gọi tàu là [ƯỚC LƯỢNG]
  // (mã chỉ thấy miễn nhiễm hazard, _skill2BoatHazardImmune). Chưa làm: các module nâng cấp (Skill2BoatModules), rương xác tàu.
  const BT = { w: 133 * 0.8, h: 37 * 0.8, ox: 9.8 * 0.8, oy: 10.84 * 0.8, ax: 26 * 0.8, ay: 20.75 * 0.8 };
  S.onward_wavecutter = {
    start(G, p) {
      layer(G);
      const summon = cfg(p, 'onward_wavecutter').dur || 1.5, life = C('Skill2BoatLifeTime', 7);
      p.skillT = summon + life;
      const b = p._boat = { t: 0, summon, x: p.x, y: p.y, seen: new Map() };
      hurtMods(p).boat = (G2, pl, d) => (b.t < b.summon ? 0 : d);   // bất tử khi gọi tàu, sau đó nhận đòn bình thường
      setMul(p, 'moveMul', 'boat', 1e-6);   // actors.js đọc (moveMul || 1) nên 0 thành 1
      p.noFire = true;
      b.h = fx(G, 'CaptainSkillBoat', p.x, p.y, { follow: b, dur: 999, layer: 'ground' });
      b.h.flip = p.face < 0;
    },
    update(G, p, dt) {
      const b = p._boat; if (!b) return;
      b.t += dt;
      if (b.t >= b.summon) { p.noFire = false; setMul(p, 'moveMul', 'boat', C('Skill2BoatSpeed', 12.5) / p.h.speed); }   // hết pha gọi tàu: tốc thật 12.5 ô/s, bắn được
      const f = p.face > 0 ? 1 : -1;
      b.x = p.x - BT.ax * f; b.y = p.y - BT.ay; if (b.h) b.h.flip = f < 0;
      if (b.t < b.summon) return;
      const cx0 = b.x + BT.ox * f, cy0 = b.y + BT.oy;   // hộp va chạm của thân tàu (off 9.8, −10.84 nhân tỉ lệ 0.8)
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [cx, cy] = ec(e);
        if (Math.abs(cx - cx0) < BT.w / 2 + e.r && Math.abs(cy - cy0) < BT.h / 2 + e.r && (b.seen.get(e) || 0) <= b.t) {
          b.seen.set(e, b.t + C('Skill2BoatCollisionDamageCooldown', 0.5));
          hit(G, p, e, C('Skill2BoatCollisionDamage', 8), { tag: 'boat', repel: 4, ang: Math.atan2(cy - p.y, cx - p.x), fx: 'hit_blue', noMul: true });
        }
      }
    },
    press(G, p) { if (p._boat && p._boat.t >= p._boat.summon) p.skillT = Math.min(p.skillT, 1e-4); },
    end(G, p) {
      const b = p._boat; p._boat = null;
      setMul(p, 'moveMul', 'boat', 1); delete hurtMods(p).boat; p.noFire = false;
      if (b && b.h) stopFx(b.h);
    }
  };
})();
