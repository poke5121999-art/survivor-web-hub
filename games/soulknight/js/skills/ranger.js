// Kỹ năng Kẻ Lãng Du (c01): cartwheel. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world, I = SK.input;
  const { cfg, layer, ghost, hurtMods, swapAnims, pngAnim, charges, useCharge, alive, ec, hit, fx, ripFx, setMul, timers, CTRL } = K;

  // Dao Địa Đường [ĐO c01/skill 3: cd 12, duration 5 (thanh lăn), maxCount 2; C02Controller.rollSpeed 1; prefab effect_ranger_roll,
  // axe_ranger (RGSword, SwordBulletSplitProcessor)]: lăn trong lúc bất tử, trúng quái thì gây sát thương va chạm; bấm nhẹ lăn
  // 1 ô thanh, giữ nút thì lăn tới khi nhả, cạn thanh thì choáng 2 s và không chém [WIKI]. Cuối lăn chém một nhát: tầm chém và
  // thời gian hồi tăng theo quãng đã lăn [ĐO info]; chưa nhả nút thì tự bật lại khi chạm tường nếu không chạm cần [WIKI].
  const CW = {
    section: 1,            // một ô thanh = 1 s lăn [ƯỚC LƯỢNG]
    speed: 6 * T,          // px/s, nhân rollSpeed [ƯỚC LƯỢNG]
    bump: 3, bumpEvery: 0.3,   // sát thương va chạm và nhịp trên mỗi quái [ƯỚC LƯỢNG]
    slash: 12, r0: 2.5 * T, rGrow: 0.6 * T,   // sát thương, tầm chém = r0 + rGrow × giây lăn [ƯỚC LƯỢNG]
    stun: 2,               // [WIKI]
    cdMin: 0.4             // hồi chiêu ít nhất = 40% khi chỉ lăn 1 ô [ƯỚC LƯỢNG]
  };

  S.cartwheel = {
    start(G, p) {
      layer(G);
      const c = cfg(p, 'cartwheel');
      charges(p, 'cartwheel'); useCharge(p, 'cartwheel');
      p.skillT = c.dur || 5;
      const mv = I.moveVec(), ang = Math.hypot(mv.x, mv.y) > 0.1 ? Math.atan2(mv.y, mv.x) : K.aimDir(p);
      p._cw = { ang, t: 0, bar: p.skillT, hit: new Map(), fxT: 0, fin: false };
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
      const spd = CW.speed * CTRL('ranger', 'rollSpeed', 1) * dt, cx = Math.cos(s.ang), cy = Math.sin(s.ang);
      // Cần không chạm mà đầu lăn chạm tường thì bật ngược thành phần bị chặn.
      if (!touched) {
        if (W.solidAt(G.map, p.x + cx * 7, p.y)) s.ang = Math.atan2(cy, -cx);
        else if (W.solidAt(G.map, p.x, p.y + cy * 7)) s.ang = Math.atan2(-cy, cx);
      }
      if (Math.abs(Math.cos(s.ang)) > 0.1) p.face = Math.cos(s.ang) > 0 ? 1 : -1;
      const walkPx = p.h.speed * SK.PPU * (p.speedMul || 1) * (p.moveMul || 1) * dt;   // huỷ phần đi bộ để giữ đúng hướng lăn
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
      // Nhả nút sau khi đủ 1 ô thì thôi lăn.
      if (s.t >= CW.section && !I.down('skill')) p.skillT = 0;
    },
    press(G, p) { if (p._cw && p._cw.t >= CW.section) SK.endSkill(G, p); },
    end(G, p) {
      const s = p._cw; p._cw = null;
      ghost(p, false); delete hurtMods(p).cartwheel; swapAnims(p, null);
      if (!s) return;
      const c = cfg(p, 'cartwheel'), dur = c.dur || 5, ch = p._ch;
      const empty = s.t >= dur - 0.05;
      if (ch && ch.id === 'cartwheel') {
        ch.cd = c.cd * Math.max(CW.cdMin, Math.min(1, s.t / dur));
        p._cdAfter = ch.n > 0 ? 0.25 : Math.max(0.01, ch.cd - ch.t);
      }
      if (empty) {
        p._cwStun = CW.stun; setMul(p, 'moveMul', 'cwStun', 0);
        fx(G, 'fx_buff_dizzy', p.x, p.y - 22, { follow: p, dy: -22, dur: CW.stun });
        return;
      }
      const r = CW.r0 + CW.rGrow * s.t, ang = s.ang, c1 = Math.cos(ang), s1 = Math.sin(ang);
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [x, y] = ec(e), dx = x - p.x, dy = y - (p.y - 7);
        if (Math.hypot(dx, dy) > r + e.r || dx * c1 + dy * s1 < -e.r) continue;   // nửa vòng phía trước
        hit(G, p, e, CW.slash, { critChance: p.crit, ang, repel: 3, fx: 'hit_white', tag: 'roll_slash' });
      }
      const f = SK.frame('effect_axe_2');
      ripFx(G, 'axe_ranger', p.x + c1 * 6, p.y - 7 + s1 * 6, { top: true, rot: c1 < 0 ? ang + Math.PI : ang, flip: c1 < 0, scale: r / (f ? f[3] * 0.75 : 37), dur: 0.27 });
      G.shake = Math.max(G.shake, 2);
    }
  };
  timers.cartwheel = (G, p, dt) => {
    if (!(p._cwStun > 0)) return;
    p._cwStun -= dt;
    if (p._cwStun <= 0) setMul(p, 'moveMul', 'cwStun', 1);
  };
  // Thanh lăn trên đầu: đầy khi mới lăn, cạn dần theo giây [WIKI "charging bar"].
  function drawBar(ctx, p) {
    const s = p._cw; if (!s) return;
    const w = 22, x = Math.round(p.x - w / 2), y = Math.round(p.y - 34), k = Math.max(0, 1 - s.t / s.bar);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = k > 0.3 ? '#ffd24a' : '#ff5a3a'; ctx.fillRect(x, y, Math.round(w * k), 3);
    ctx.fillStyle = '#000';
    for (let i = 1; i < s.bar / CW.section; i++) ctx.fillRect(x + Math.round(w * i * CW.section / s.bar), y, 1, 3);
  }
})();
