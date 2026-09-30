// Kỹ năng Kẻ Lãng Du (c01): cartwheel. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, W = SK.world, I = SK.input;
  const { cfg, layer, ghost, hurtMods, swapAnims, pngAnim, charges, useCharge, alive, ec, hit, fx, ripFx, setMul, timers, CTRL } = K;

  // Dao Địa Đường [ĐO c01/skill 3: cd 12, duration 5 (maxTime), maxCount 2; C02Controller.RoleSkillStart2/Rolling/RollingEnd/AxeAttack, ctrl rollSpeed 1]:
  // lăn trong lúc bất tử (StartHitTrigger = maxTime lúc bắt đầu, thêm 0.5 s lúc kết thúc), tốc độ = tốc chạy × (1 + rollSpeed), lăn theo
  // cần đang chạm, không chạm thì bật gương khi tia dài 0.75 chạm tường; nhả nút sau tối thiểu 0.5 s (MinRollingTime) thì chém ba
  // rìu cách nhau 120°, cạn thanh 5 s thì không chém mà dính buff_ele. Thanh cd là this_skill_time: mở đầu trừ BaseRollTime 1.5 s,
  // lăn trừ cd/maxTime mỗi giây [ĐO RoleAttributePlayer.SkillReload], nên lượt hồi 1.5 + 2.4 × giây lăn (tối đa 12 s).
  const CW = {
    min: 0.5,              // [ĐO C02Controller..cctor MinRollingTime]
    rollSpeed: 1,          // [ĐO ctrl rollSpeed] tốc lăn = chạy × (1 + rollSpeed) [ĐO SetVelocity: speed × (FinalSpeedRate + 1)]
    probe: 0.75 * U,       // [ĐO Rolling.MoveNext: Physics2D.Raycast dài 0.75 từ thân + 0.5]
    baseRoll: 1.5,         // [ĐO C02Controller.BaseRollTime = CalculateCooldown(1.5)]
    bump: 5, bumpEvery: 0.3,   // sát thương va chạm [ĐO RoleSkillStart2: ProcessSkillDamage(5, 0.05), cấp 0]; nhịp hit trên mỗi quái là [ƯỚC LƯỢNG] (nằm trong prefab đạn lăn)
    base: 24,              // [ĐO AxeAttack: ProcessSkillDamage(24, 0.05)] tổng sát thương chém, cấp 0
    axes: 3, axeStep: 120, // [ĐO AxeAttack: vòng lặp 3 rìu, lệch -120/0/+120°]; tổng chia 3 [ĐO smmul 0x5556]
    scale0: 1.5, scaleGrow: 2.75, critMax: 66,   // [ĐO AxeAttack: scale = 1.5 + 2.75 t, tỉ lệ bạo = 66 t (%)], t = giây lăn / (maxTime - BaseRollTime)
    rPerScale: 2.5 * T / 1.5,   // bán kính chém mỗi đơn vị scale [ƯỚC LƯỢNG]: collider rìu nằm trong prefab, chưa đọc
    stun: 2,               // [ĐO mb buff_ele buff_time, bản 2 s khớp WIKI]
    afterInvuln: 0.5       // [ĐO RollingEnd: StartHitTrigger(…, 0.5)]
  };

  S.cartwheel = {
    start(G, p) {
      layer(G);
      const c = cfg(p, 'cartwheel');
      charges(p, 'cartwheel'); useCharge(p, 'cartwheel');
      p.skillT = c.dur || 5;
      const mv = I.moveVec(), ang = Math.hypot(mv.x, mv.y) > 0.1 ? Math.atan2(mv.y, mv.x) : K.aimDir(p);
      p._cw = { ang, t: 0, bar: p.skillT, hit: new Map(), fxT: 0, early: false };
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      ghost(p, true);
      hurtMods(p).cartwheel = () => 0;
      swapAnims(p, pngAnim('rogue_roll'));
      G.props.push({ x: p.x, y: 1e9, update(G2, q) { if (!p._cw) q.gone = true; }, draw(ctx) { drawBar(ctx, p); } });
    },
    update(G, p, dt) {
      const s = p._cw; if (!s) return;
      s.t += dt;
      const mv = I.moveVec(), touched = Math.hypot(mv.x, mv.y) > 0.1;
      if (touched) s.ang = Math.atan2(mv.y, mv.x);
      const walkPx = p.h.speed * SK.PPU * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      const spd = walkPx * (1 + CTRL('ranger', 'rollSpeed', CW.rollSpeed)), cx = Math.cos(s.ang), cy = Math.sin(s.ang);
      // Cần không chạm: tia chạm tường thì bật gương hướng lăn.
      if (!touched) {
        const bx = W.solidAt(G.map, p.x + cx * CW.probe, p.y), by = W.solidAt(G.map, p.x, p.y + cy * CW.probe);
        if (bx && by) s.ang += Math.PI;
        else if (bx) s.ang = Math.atan2(cy, -cx);
        else if (by) s.ang = Math.atan2(-cy, cx);
      }
      if (Math.abs(Math.cos(s.ang)) > 0.1) p.face = Math.cos(s.ang) > 0 ? 1 : -1;
      // Huỷ phần đi bộ của cần để giữ đúng hướng lăn.
      SK.moveBox(G.map, p, Math.cos(s.ang) * spd - mv.x * walkPx, Math.sin(s.ang) * spd - mv.y * walkPx, p.h.body.r);
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [x, y] = ec(e);
        if (Math.hypot(x - p.x, y - (p.y - 7)) > 10 + e.r || (s.hit.get(e) || 0) > G.t) continue;
        s.hit.set(e, G.t + CW.bumpEvery);
        hit(G, p, e, CW.bump, { critChance: p.crit, ang: s.ang, repel: 2, fx: 'hit_white', tag: 'roll' });
      }
      s.fxT -= dt;
      if (s.fxT <= 0) { s.fxT = 0.34; ripFx(G, 'effect_ranger_roll', p.x, p.y, { ground: true, flip: p.face < 0, dur: 0.34 }); }
      // Nhả nút (hoặc bấm K lần nữa) thì thôi lăn, nhưng không sớm hơn MinRollingTime [ĐO RoleSkillEnd2].
      if (s.t >= CW.min && (s.early || !I.down('skill'))) p.skillT = 0;
    },
    press(G, p) { if (p._cw) p._cw.early = true; },
    end(G, p) {
      const s = p._cw; p._cw = null;
      ghost(p, false); delete hurtMods(p).cartwheel; swapAnims(p, null);
      if (!s) return;
      p._cwLast = s.t;
      p.invulT = Math.max(p.invulT || 0, CW.afterInvuln);
      const c = cfg(p, 'cartwheel'), dur = c.dur || 5, ch = p._ch;
      const empty = s.t >= dur - 0.05;   // fullyRollEnd: thanh cạn thì không chém
      if (ch && ch.id === 'cartwheel') {
        ch.cd = Math.min(c.cd, CW.baseRoll + s.t * c.cd / dur);
        p._cdAfter = ch.n > 0 ? 0.25 : Math.max(0.01, ch.cd - ch.t);
      }
      if (empty) {
        p._cwStun = CW.stun; setMul(p, 'moveMul', 'cwStun', 0);
        fx(G, 'fx_buff_dizzy', p.x, p.y - 22, { follow: p, dy: -22, dur: CW.stun });
        return;
      }
      const t = Math.min(1, s.t / (dur - CW.baseRoll)), sc = CW.scale0 + CW.scaleGrow * t, r = CW.rPerScale * sc;
      const total = Math.round(CW.base / CW.axes + (CW.base - CW.base / CW.axes) * t), per = Math.trunc(total / CW.axes);
      const crit = Math.round(CW.critMax * t) + (p.crit || 0), step = CW.axeStep * Math.PI / 180;
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [x, y] = ec(e), dx = x - p.x, dy = y - (p.y - 7);
        if (Math.hypot(dx, dy) > r + e.r) continue;
        hit(G, p, e, per, { critChance: crit, ang: Math.atan2(dy, dx), repel: 3, fx: 'hit_white', tag: 'roll_slash' });
      }
      const f = SK.frame('effect_axe_2');
      for (let k = -1; k <= 1; k++) {
        const a = s.ang + k * step, c1 = Math.cos(a), s1 = Math.sin(a);
        ripFx(G, 'axe_ranger', p.x + c1 * 6, p.y - 7 + s1 * 6, { top: true, rot: c1 < 0 ? a + Math.PI : a, flip: c1 < 0, scale: r / (f ? f[3] * 0.75 : 37), dur: 0.27 });
      }
      G.shake = Math.max(G.shake, 2);
    }
  };
  timers.cartwheel = (G, p, dt) => {
    if (!(p._cwStun > 0)) return;
    p._cwStun -= dt;
    if (p._cwStun <= 0) setMul(p, 'moveMul', 'cwStun', 1);
  };
  // Thanh lăn trên đầu: đầy khi mới lăn, cạn dần theo giây (maxTime) [ĐO SkillReload].
  function drawBar(ctx, p) {
    const s = p._cw; if (!s) return;
    const w = 22, x = Math.round(p.x - w / 2), y = Math.round(p.y - 34), k = Math.max(0, 1 - s.t / s.bar);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = k > 0.3 ? '#ffd24a' : '#ff5a3a'; ctx.fillRect(x, y, Math.round(w * k), 3);
  }
})();
