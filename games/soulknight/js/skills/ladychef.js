// Kỹ năng Nữ Đầu Bếp (c41): mystic_stewpot. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ ctrlFields của SK_SKILLS86.heroes.ladychef, MonoBehaviour c42StewPot / c42StewPotWave (ExplodeHammer) / c42IngredientUsing và mã C42Controller,
// C42StewPot, C42DungeonGourmetRuntime (sk_method.py: OnChefHitEnemy, AddHeat, FindBounceTarget, GetDungeonStewProjectileDamage) [ĐO]. "max 3" trong config không
// phải số lượt: skillType 0 không thuộc {4, 6, 9, 12} nên SkillInfo.hasMultiCount = false [ĐO SkillInfo.get_hasMultiCount].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, W = SK.world;
  const { ec, inRadius, hit, fx, stopFx, CTRL, layer, hurtMods, timers } = K;
  const C = (k, d) => CTRL('ladychef', k, d);
  // [ĐO c41/skill 1: cd 10, args "4;5;5;10;1;1;1"; ctrl: stewPotSearchRadius 7, stewPotBounceCount 4, stewPotBounceDamage 12,
  // stewPotBounceMoveDuration 0.8, stewPotBounceArcHeight 4, dungeonStewPickupLifeTime 20, dungeonStewPickupPopDuration 0.5,
  // dungeonStewPickupPopHeight 2, dungeonStewDuration 5, dungeonStewProjectileCount 3 / SpreadAngle 30 / Speed 15 / Repel 2 /
  // DamageFactor 0.5 / FallbackDamage 1 / Duration 5 / Cooldown 0.25, dreamStewInvincibleDuration 5, maxHeat 100,
  // heatGainOnHitEnemy 5 (hồi 1 s); triggerRadius 0.45 / 0.5 ô]. Độ Lửa chỉ tăng ở OnChefHitEnemy (đạn của bếp trưởng trúng quái, +5, hồi 1 s) và
  // OnEatDungeonIngredient (+20); nguyên liệu chỉ do thiên phú Dungeon Gourmet tạo (C42DungeonGourmetRuntime.Ensure ← TalentBuff.InitBuffDungeonGourmet,
  // rớt 15% khi quái chết) nên bản mặc định không có nguồn thứ hai. Nồi nảy tới quái NGẪU NHIÊN trong stewPotSearchRadius trừ quái vừa rơi
  // [ĐO FindBounceTarget]; sóng xung kích c42StewPotWave (ExplodeHammer) gắn buff_ele [ĐO MB targetbuff]; sát thương viên = ceil(đòn × factor) [ĐO].
  const LC = { hitR: 1.5 * T, scatter: 3 * T, pick: 8 };   // bán kính sóng nồi rơi, tầm rải món hầm (config 8 chưa rõ đơn vị), tầm nhặt [ƯỚC LƯỢNG]
  const st = p => p._lc || (p._lc = { heat: 0, tastyT: 0, dreamT: 0, hitCd: 0, projCd: 0, stews: [], pot: null });

  // ---------------------------------------------------------------- nồi hầm nảy giữa các quái
  function stewAt(G, p, x, y, dream) {
    const s = st(p), q = { x, y, t: 0, dream, gone: false };
    const key = dream ? 'c42DreamStew' : 'c42DungeonStew';
    q.tx = x; q.ty = y;
    for (let k = 0; k < 8; k++) {   // rải quanh điểm nồi rơi, bỏ điểm nằm trong tường
      const sx = x + SK.randf(-LC.scatter, LC.scatter), sy = y + SK.randf(-LC.scatter, LC.scatter);
      if (!W.solidAt(G.map, sx, sy)) { q.tx = sx; q.ty = sy; break; }
    }
    s.stews.push(q);
    G.props.push({
      x, y, t: 0,
      update(G2, pr, dt) {
        q.t += dt;
        const k = Math.min(1, q.t / C('dungeonStewPickupPopDuration', 0.5));
        q.x = x + (q.tx - x) * k; q.y = y + (q.ty - y) * k; pr.x = q.x; pr.y = q.y;
        if (q.t > C('dungeonStewPickupLifeTime', 20) || q.gone) { pr.gone = true; q.gone = true; return; }
        if (k >= 1 && p.st !== 'dead' && Math.hypot(p.x - q.x, p.y - 4 - q.y) < LC.pick) { q.gone = true; pr.gone = true; eat(G2, p, q.dream); }
      },
      draw(ctx) {
        const k = Math.min(1, q.t / C('dungeonStewPickupPopDuration', 0.5)), pop = Math.sin(k * Math.PI) * C('dungeonStewPickupPopHeight', 2) * U;
        const bob = k >= 1 ? Math.sin(q.t * 4) * 1.2 : 0;
        SK.draw(ctx, key, q.x, q.y - 4 - pop - bob, { sx: dream ? 1.15 : 1, sy: dream ? 1.15 : 1 });
      }
    });
  }
  // Nhặt món hầm: đòn đánh thành "ngon miệng" dungeonStewDuration giây; món Ảo Mộng còn miễn sát thương dreamStewInvincibleDuration giây.
  function eat(G, p, dream) {
    const s = st(p);
    s.tastyT = C('dungeonStewDuration', 5);
    if (dream) { s.dreamT = C('dreamStewInvincibleDuration', 5); hurtMods(p).dream = () => 0; }
    fx(G, 'effect_health_skill', p.x, p.y - 2, { follow: p, dy: -2, layer: 'ground' });
    SK.num(G, p.x, p.y - 26, dream ? 'Ảo Mộng' : 'Ngon miệng', dream ? '#ff9af0' : '#ffd65a');
  }
  S.mystic_stewpot = {
    start(G, p) {
      layer(G);
      const s = st(p), dream = s.heat >= C('maxHeat', 100);
      if (dream) s.heat = 0;   // đủ Độ Lửa: món hầm nâng cấp thành Ảo Mộng, Độ Lửa về 0
      const hops = C('stewPotBounceCount', 4), search = C('stewPotSearchRadius', 7) * U, dur = C('stewPotBounceMoveDuration', 0.8), arc = C('stewPotBounceArcHeight', 4) * U;
      const { e, ang } = K.targetAng(G, p, 14 * T);
      const pot = { x: p.x, y: p.y - 10, gx: p.x, gy: p.y, x0: p.x, y0: p.y, t: 0, left: hops, to: null, e, dream };
      pot.to = e ? ec(e) : [p.x + Math.cos(ang) * 5 * T, p.y + Math.sin(ang) * 5 * T];
      pot.h = fx(G, 'c42StewPot', pot.x, pot.y, { follow: pot, dur: 999 });
      s.pot = pot;
      G.props.push({
        x: 0, y: 1e9, t: 0, draw() {},
        update(G2, q, dt) {
          pot.t += dt;
          const k = Math.min(1, pot.t / dur);
          pot.gx = pot.x0 + (pot.to[0] - pot.x0) * k; pot.gy = pot.y0 + (pot.to[1] - pot.y0) * k;
          pot.x = pot.gx; pot.y = pot.gy - 8 - Math.sin(k * Math.PI) * arc;   // vòng cung cao arcHeight ô
          if (k < 1) return;
          // Rơi xuống: 12 sát thương quanh điểm rơi, sinh một món hầm, tìm quái kế tiếp trong stewPotSearchRadius.
          fx(G2, 'c42StewPotWave', pot.gx, pot.gy - 4, { layer: 'ground' });
          G2.shake = Math.max(G2.shake, 2);
          for (const t of inRadius(G2, pot.gx, pot.gy - 6, LC.hitR)) { hit(G2, p, t, C('stewPotBounceDamage', 12), { tag: 'skill', repel: 2, fx: 'hit_red', noMul: true }); K.debuff(G2, t, 'ele'); }
          stewAt(G2, p, pot.gx, pot.gy, dream);
          if (--pot.left <= 0) { stopFx(pot.h); s.pot = null; q.gone = true; return; }
          const near = inRadius(G2, pot.gx, pot.gy, search), pool = near.filter(t => t !== pot.e), nx = pool.length ? SK.pick(pool) : near[0];
          if (!nx) { stopFx(pot.h); s.pot = null; q.gone = true; return; }
          pot.e = nx; pot.x0 = pot.gx; pot.y0 = pot.gy; pot.to = ec(nx); pot.t = 0;
        }
      });
    }
  };

  // ---------------------------------------------------------------- Độ Lửa và đòn "ngon miệng"
  SK.on('enemyHit', G => {
    const p = G.player; if (!p || p.hero !== 'ladychef' || G._skHit) return;
    const s = st(p);
    if (s.hitCd <= 0) { s.hitCd = C('heatGainOnHitEnemyCooldown', 1); s.heat = Math.min(C('maxHeat', 100), s.heat + C('heatGainOnHitEnemy', 5)); }
  });
  SK.on('fire', (G, p, w) => {
    if (p.hero !== 'ladychef') return;
    const s = st(p);
    if (s.tastyT <= 0 || s.projCd > 0) return;
    s.projCd = C('dungeonStewProjectileCooldown', 0.25); s.volleys = (s.volleys || 0) + 1;
    const n = C('dungeonStewProjectileCount', 3), spread = SK.deg(C('dungeonStewProjectileSpreadAngle', 30)), d = w && w.def;
    const dmg = Math.max(C('dungeonStewProjectileFallbackDamage', 1), Math.ceil(((d && d.dmg) || 0) * C('dungeonStewProjectileDamageFactor', 0.5)));
    for (let i = 0; i < n; i++) {
      const a = p.aim + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      K.shoot(G, p, p.x + Math.cos(p.aim) * 8, p.y - 7 + Math.sin(p.aim) * 8, a, { dmg, speed: C('dungeonStewProjectileSpeed', 15), sprite: 'c42StewProjectile_0', life: C('dungeonStewProjectileDuration', 5), repel: C('dungeonStewProjectileRepel', 2), hit: 'hit_red', critChance: p.crit });
    }
  });
  timers.ladychef = (G, p, dt) => {
    if (p.hero !== 'ladychef' || !p._lc) return;
    const s = p._lc;
    s.hitCd = Math.max(0, s.hitCd - dt); s.projCd = Math.max(0, s.projCd - dt); s.tastyT = Math.max(0, s.tastyT - dt);
    if (s.dreamT > 0) { s.dreamT -= dt; if (s.dreamT <= 0) delete hurtMods(p).dream; }
  };
  // Thanh Độ Lửa dưới thanh năng lượng.
  SK.on('hud', (ctx, G) => {
    const p = G.player; if (!p || p.hero !== 'ladychef' || !p._lc || G.state !== 'stage') return;
    const s = p._lc, x = 46, y = 47, w = 44;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = s.heat >= C('maxHeat', 100) ? '#ffb03a' : '#e2623a'; ctx.fillRect(x, y, Math.round(w * s.heat / C('maxHeat', 100)), 4);
    if (s.tastyT > 0) { ctx.fillStyle = '#ffd65a'; ctx.fillRect(x, y + 5, Math.round(w * s.tastyT / C('dungeonStewDuration', 5)), 2); }
  });
  SK.on('runStart', G => { const p = G.player; if (p && p.hero === 'ladychef') { p._lc = null; } });
  SK.on('stageEnter', G => { const p = G.player; if (p && p._lc) { for (const q of p._lc.stews) q.gone = true; p._lc.stews = []; p._lc.pot = null; } });
})();
