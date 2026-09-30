// Kỹ năng Chuyên Gia Súng Đạn (c40): call_to_arms. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ ctrlFields của SK_SKILLS86.heroes.gunsexpert, prefab gunsexper_mercenary (RoleAttribute, C41Mercenary, PhantomSplitProcessor
// damageFactor 0.5), gunsexper_0_shock_hammer (ExplodeHammer) và mã C41Controller / C41Mercenary (sk_method.py: SpawnSupportUnitsRoutine,
// HandleRoleAttack, BuildLocalWeaponCache, SpawnShockwave) [ĐO]. "max 3" trong config không phải số lượt: skillType 1 không thuộc {4, 6, 9, 12}
// nên SkillInfo.hasMultiCount = false [ĐO SkillInfo.get_hasMultiCount].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, DS = SK.DS;
  const { ec, nearest, inRadius, hit, fx, CTRL, layer, addAlly, hpBar, timers } = K;
  const C = (k, d) => CTRL('gunsexpert', k, d);
  // [ĐO ctrl: supportCount 3, supportHp 20, supportDuration 5, spawnRadius 5, spawnMinRadius 2, orbitRadius 2.6, orbitAngleSpeed 180,
  // scatterSpeed 12, scatterDuration 0.5, supportAttackInterval 1.5 (Ex 1), weaponDamageFactor 0.5, supportAttackRange 12,
  // supportDropBatchInterval 0.2, shockwaveDamage 8, shockwaveSize 1.2, extraAttackDuration 3, extraAttackInterval 0.5,
  // extraAttackWeaponAppearTime 0.2, extraAttackWeaponHideTime 0.25, extraAttackWeaponCount 3, extraWeaponPosList; clip show 0.29 s
  // rơi từ 142.56 px] Gọi 3 tùy tùng rơi từ trời (sóng xung kích 8 sát thương), quanh người 5 s bắn mỗi 1.5 s bằng vũ khí ngẫu nhiên
  // (50% sát thương), rồi bay đi; sau đó 3 vũ khí của chúng bám bên người 3 s, mỗi lần người bắn (cách ≥ 0.5 s) chúng bắn theo.
  // Sóng xung kích ExplodeHammer damage 6 (bị supportDamage config 8 thay), repel 3, gắn buff_ele lên quái trúng [ĐO MB gunsexper_0_shock_hammer]; tùy tùng rơi theo
  // lô supportDropBatchCount 5 cách supportDropBatchInterval 0.2 s [ĐO SpawnSupportUnitsRoutine] nên 3 tùy tùng rơi cùng lúc.
  const GX = { shockR: 48, drop: 0.29, hand: [0, 8] };   // shockR: bán kính sóng xung kích [ƯỚC LƯỢNG: collider prefab chưa bóc]; drop 0.29 s clip show [ĐO]
  const RANGED = ['single', 'fan', 'spray', 'burst'];
  const pool = p => {
    const own = p.weapons.map(w => w && w.id);
    return Object.keys(DS.weapons).filter(k => { const d = DS.weapons[k]; return d.w86 && RANGED.indexOf(d.w86.fam) >= 0 && !d.w86.melee && d.sprite && SK.frame(d.sprite) && own.indexOf(k) < 0; });
  };
  function tickQ(w, dt) {
    if (!w.q.length) return;
    for (const q of w.q) q.t -= dt;
    const due = w.q.filter(q => q.t <= 0);
    if (due.length) { w.q = w.q.filter(q => q.t > 0); for (const q of due) q.fn(); }
  }
  // Bắn vũ khí `w` từ (x, y) hướng ang với sát thương nhân weaponDamageFactor (0.5 như PhantomSplitProcessor.damageFactor).
  function fireWeapon(G, p, w, x, y, ang) {
    const d = w.def, k = (SK.WEAPON_KINDS[d.kind] || SK.WEAPON_KINDS.gun), f = C('weaponDamageFactor', 0.5), old = p.dmgMul;
    p.dmgMul = (old || 1) * f;
    w.lastMz = { x, y, ang }; w.lastAng = ang;
    try { k.fire(G, p, w, { x, y, ang, side: 1, charge: 1, fn: 'Attack' }); } finally { p.dmgMul = old; }
  }
  function drawMerc(ctx, a, moving) {
    const key = a.landT < GX.drop ? 'gunsexper_mercenary/show' : a.leaving ? 'gunsexper_mercenary/gunsexper_fly' : moving ? 'gunsexper_mercenary/run' : 'gunsexper_mercenary/gunsexper_show_end';
    const t = a.landT < GX.drop ? a.landT : a.t, fr = SK.animFrame(key, t), f = a.face < 0 ? -1 : 1;
    const xf = SK.animPose(key, t, 'img/body');
    const shadow = SK.frame('shadow3');
    if (shadow) SK.draw(ctx, 'shadow3', a.x, a.y, { alpha: 0.5 });
    if (fr) SK.draw(ctx, fr, a.x + (0.96 + xf.dx) * 0.9 * f, a.y + xf.dy * 0.9 - 1.6 * 0.9, { flip: f < 0, sx: 0.9, sy: 0.9, pages: a.flash > 0 ? SK.pagesWhite : null });
  }
  function drawWeapon(ctx, w, x, y, ang) { if (w && w.def.sprite) SK.drawGun(ctx, w.def.sprite, x, y, ang, null, {}); }

  S.call_to_arms = {
    start(G, p) {
      layer(G);
      const n = C('supportCount', 3), life = C('supportDuration', 5), ids = pool(p);
      p.skillT = life;
      p._gx = null;
      const sup = [];
      for (let i = 0; i < n; i++) {
        // Điểm rơi: quanh người trong [spawnMinRadius, spawnRadius] ô; tùy tùng đầu rơi lên quái gần nhất trong tầm (tránh sóng xung kích trượt).
        let x, y;
        const tgt = i === 0 ? nearest(G, p.x, p.y, C('spawnRadius', 5) * U) : null;
        if (tgt) { x = tgt.x; y = tgt.y; } else {
          const a = SK.rand() * Math.PI * 2, r = SK.randf(C('spawnMinRadius', 2), C('spawnRadius', 5)) * U;
          x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
        }
        for (let k = 0; k < 8 && SK.world.solidAt(G.map, x, y); k++) { x += (p.x - x) * 0.3; y += (p.y - y) * 0.3; }
        const w = SK.makeWeapon(SK.pick(ids)), hp = C('supportHp', 20);
        const a = addAlly(G, {
          merc: true, x, y, hp, hpMax: hp, face: 1, aim: 0, landT: -Math.floor(i / C('supportDropBatchCount', 5)) * C('supportDropBatchInterval', 0.2), cd: C('supportAttackInterval', 1.5), orbit: (i / n) * Math.PI * 2, w, box: [12.8, 16, 8], leaving: false, moving: false, landed: false,
          onZero(G2, q) { q.gone = true; fx(G2, 'hit_white', q.x, q.y - 8, {}); },
          update(G2, q, dt) {
            if (q.leaving) { q.t2 = (q.t2 || 0) + dt; q.x += Math.cos(q.fly) * C('scatterSpeed', 12) * U * dt; q.y += Math.sin(q.fly) * C('scatterSpeed', 12) * U * dt; if (q.t2 >= C('scatterDuration', 0.5)) q.gone = true; return; }
            q.landT += dt; tickQ(q.w, dt);
            if (q.landT < 0) { q.hide = true; return; }
            q.hide = false;
            if (q.landT < GX.drop) return;
            if (!q.landed) {   // vừa hạ cánh: sóng xung kích quanh chân
              q.landed = true;
              fx(G2, 'gunsexper_0_shock_hammer', q.x, q.y, { layer: 'ground' });
              for (const e of inRadius(G2, q.x, q.y - 6, GX.shockR * C('shockwaveSize', 1.2) / 1.2)) { hit(G2, p, e, C('shockwaveDamage', 8), { tag: 'skill', repel: 3, fx: 'hit_orange', noMul: true }); K.debuff(G2, e, 'ele'); }
              G2.shake = Math.max(G2.shake, 2);
            }
            // Bay vòng quanh người bán kính orbitRadius, 180°/s.
            q.orbit += C('orbitAngleSpeed', 180) * Math.PI / 180 * dt;
            const tx = p.x + Math.cos(q.orbit) * C('orbitRadius', 2.6) * U, ty = p.y + Math.sin(q.orbit) * C('orbitRadius', 2.6) * U * 0.8;
            const d = K.walk(G2, q, tx, ty, Math.max(60, Math.hypot(tx - q.x, ty - q.y) * 6), dt);
            q.moving = d > 3;
            const e = nearest(G2, q.x, q.y - 8, C('supportAttackRange', 12) * U, { los: true });
            if (e) { const [cx, cy] = ec(e); q.aim = Math.atan2(cy - (q.y - 8), cx - q.x); q.face = Math.cos(q.aim) >= 0 ? 1 : -1; }
            q.cd -= dt;
            if (e && q.cd <= 0) {
              q.cd = C('supportAttackInterval', 1.5);
              fireWeapon(G2, p, q.w, q.x + Math.cos(q.aim) * 8, q.y - 8 + Math.sin(q.aim) * 8, q.aim);
              SK.fx(G2, 'muzzle', q.x + Math.cos(q.aim) * 8, q.y - 8 + Math.sin(q.aim) * 8, { ang: q.aim, dur: 0.05 });
            }
          },
          draw(ctx, G2, q) {
            if (q.hide) return;
            drawMerc(ctx, q, q.moving);
            if (q.landT >= GX.drop && !q.leaving) drawWeapon(ctx, q.w, q.x + GX.hand[0] * q.face, q.y - GX.hand[1] - 2, q.aim);
            hpBar(ctx, q, 26, '#3cb4e0');
          }
        });
        sup.push(a);
      }
      p._gxSup = sup;
    },
    end(G, p) {
      // Tùy tùng rời sân (bay tán ra), rồi chọn ngẫu nhiên tối đa 3 vũ khí của chúng vào trạng thái Âm Vang Súng Đạn.
      const sup = p._gxSup || [];
      for (const a of sup) if (!a.gone && !a.leaving) { a.leaving = true; a.down = true; a.fly = SK.rand() * Math.PI * 2; a.t2 = 0; }
      const ids = sup.map(a => a.w.id);
      if (!ids.length) return;
      const left = ids.slice(), pick = [];   // chọn ngẫu nhiên không lặp khi còn đủ vũ khí
      for (let i = 0; i < C('extraAttackWeaponCount', 3); i++) { const k = Math.floor(SK.rand() * left.length); pick.push(left[k]); if (left.length > 1) left.splice(k, 1); }
      const s = p._gx = { t: 0, life: C('extraAttackDuration', 3), last: -1e9, ws: pick.map(id => SK.makeWeapon(id)) };
      p._gxSup = null;
      G.props.push({ x: 0, y: 1e9 - 2, update(G2, q) { if (p._gx !== s) q.gone = true; }, draw(ctx, G2) { drawExtra(ctx, G2); } });
    }
  };
  // Âm Vang Súng Đạn: mỗi lần người bắn (cách ≥ extraAttackInterval) mọi vũ khí phụ bên người cùng bắn.
  timers.gunsexpert = (G, p, dt) => {
    const s = p._gx; if (!s) return;
    s.t += dt;
    for (const w of s.ws) tickQ(w, dt);
    if (s.t >= s.life + C('extraAttackWeaponHideTime', 0.25)) p._gx = null;
  };
  SK.on('fire', (G, p) => {
    const s = p._gx;
    if (!s || s.t >= s.life || s.t < C('extraAttackWeaponAppearTime', 0.2) || s.t - s.last < C('extraAttackInterval', 0.5)) return;
    s.last = s.t;
    const pos = C('extraWeaponPosList', []);
    s.ws.forEach((w, i) => {
      const o = pos[i] || { x: 0, y: 0 }, f = p.face >= 0 ? 1 : -1;
      const x = p.x + o.x * U * f, y = p.y - 8 - o.y * U;
      fireWeapon(G, p, w, x + Math.cos(p.aim) * 8, y + Math.sin(p.aim) * 8, p.aim);
      s.shots = (s.shots || 0) + 1;
    });
  });
  SK.on('stageEnter', G => { const p = G.player; if (p) { p._gx = null; p._gxSup = null; } });
  // Vẽ vũ khí Âm Vang bên người: hiện 0.2 s rồi ẩn 0.25 s khi hết thời gian.
  const drawExtra = (ctx, G) => {
    const p = G.player, s = p && p._gx; if (!s) return;
    const a = Math.min(1, s.t / C('extraAttackWeaponAppearTime', 0.2)) * (s.t > s.life ? Math.max(0, 1 - (s.t - s.life) / C('extraAttackWeaponHideTime', 0.25)) : 1);
    const pos = C('extraWeaponPosList', []), f = p.face >= 0 ? 1 : -1;
    ctx.save(); ctx.globalAlpha = a;
    s.ws.forEach((w, i) => { const o = pos[i] || { x: 0, y: 0 }; drawWeapon(ctx, w, p.x + o.x * U * f, p.y - 8 - o.y * U, p.aim); });
    ctx.restore();
  };
})();
