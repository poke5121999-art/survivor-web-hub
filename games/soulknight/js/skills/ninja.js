// Kỹ năng Ninja Xuyên Không (c20): time_space_shuriken, chrono_hunt. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Nguồn: config/skills 8.6, ctrlFields của C21Controller (c20), mã đọc bằng tools/sk_method.py (C21Controller.*, NinjaTimeStopCircle,
// BuffNinjaTimeStop, Bullet04) và MonoBehaviour trong bullet.ab / common.ab.
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world, U = SK.PPU;
  const C = (f, d) => K.CTRL('ninja', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const layerProp = (G, upd) => G.props.push({ x: 0, y: 1e9, draw() {}, update: upd });

  // ---------------------------------------------------------------- Shuriken Không-Thời Gian
  // [ĐO config] cd 6, dur 3. bullet_skill_ninja_jump = Bullet04: tốc đầu 40, mỗi rate 0,1 s nhân speed_value 0,4 (bậc thang, không
  // mịn), quay 1440°/s, dừng khi chạm tường [BulletHitWallStopMove], sống destroy_time 4 s; IntervalCreateBullet: mỗi 0,1 s một
  // Phi Kim bullet_81_ninja theo góc đang quay (tốc 33, sát thương 4, bạo kích 40, đẩy 3, sống 5 s, gắn buff chậm). Sát thương
  // Shuriken skill0ShurikenDmg 4. Vùng ngưng đọng TimeStopCircleNinja (RGAutoDestory 3 s, CircleCollider2D bán kính 5 ô) sinh 0,5 s
  // sau khi thả [ReleaseShuriken → CreateStopCircle], lúc sinh gắn buff_speed_down_ninja (tốc chạy −0,5, tốc đánh −0,5, 6 s) cho
  // quái trong vùng [NinjaTimeStopCircle.Start]; đạn địch vào vùng bị chia 5 vận tốc, ra khỏi vùng trả lại [OnTriggerEnter2D/Exit2D].
  // Phát động lại [JumpToShuriken, DoJumpToShurikenRgController]: quái trong findEnemyRange 5 ô quanh trung điểm người–Shuriken, xếp
  // theo khoảng cách tới người, tối đa maxDashCount 4 con; người tốc biến lần lượt tới từng con và chém (skill0SlashDmg 4, bạo kích 50,
  // dính điện 1 s [skill_ninja_slash RGSwordBuffTrigger]), rồi tới Shuriken kèm vệt chém vũ trụ; khi tốc biến xong mọi quái đang
  // mang buff chậm nhận một nhát kiếm bullet_7_ninja_skill [BuffNinjaTimeStop.OnJumpEnd → CreateSword: sát thương 4, bạo kích 50].
  // [ƯỚC LƯỢNG] thời gian mỗi bước tốc biến 0,1 s và bề rộng vệt chém cuối 14 px (DOTween trong coroutine, prefab void_slash không có
  // số đọc được). Chưa làm: kỹ năng năng lượng (maxNinjaSkill0Energy 1000, +15 mỗi lần: tầm ×1,5, Phi Kim mỗi 0,05 s, vùng có
  // CreatePhantomSlash mỗi 0,25 s) và nội tại Tengu (skill0Passive*).
  const TS = {
    dmg: C('skill0ShurikenDmg', 4), slash: C('skill0SlashDmg', 4), sword: C('skill0SwordDmg', 4), crit: 50,
    speed: 40 * T, stepEvery: 0.1, stepMul: 0.4, spin: 1440 * Math.PI / 180, every: 0.1,
    needle: { speed: 33 * T, dmg: 4, crit: 40, repel: 3, life: 5 },
    zoneDelay: 0.5, zoneR: 5 * T, zoneLife: 3, bulletDiv: 5, slow: 0.5, slowT: 6,
    range: C('findEnemyRange', 5) * T, dashMax: C('maxDashCount', 4), hop: 0.1, pathW: 14
  };
  const slowed = e => e._nzT > 0;
  function slowEnemy(e, t) {
    if (!K.alive(e)) return;
    if (!slowed(e)) { e._nzMul0 = e.moveMul || 1; e.moveMul = e._nzMul0 * (1 - TS.slow); }
    e._nzT = Math.max(e._nzT || 0, t);
  }
  // Mỗi khung: đếm buff của quái, trả tốc chạy khi hết; hãm tốc đánh bằng cách hoàn lại nửa nhịp hồi chiêu.
  K.timers.ninjaSlow = (G, p, dt) => {
    for (const e of G.enemies) {
      if (!slowed(e)) continue;
      e._nzT -= dt;
      if (K.alive(e) && e.cd > 0) e.cd += dt * TS.slow;
      if (e._nzT <= 0 || !K.alive(e)) { e.moveMul = e._nzMul0 || 1; e._nzT = 0; }
    }
  };

  function needle(G, x, y, ang, st) {
    const n = { x, y, ang, life: TS.needle.life, gone: false, hit: new Set() };
    n.h = fx(G, 'bullet_81_ninja', x, y, { follow: n, ang, dur: TS.needle.life });
    st.needles.push(n);
  }
  function stepNeedle(G, p, n, dt) {
    n.life -= dt;
    const d = TS.needle.speed * dt;
    n.x += Math.cos(n.ang) * d; n.y += Math.sin(n.ang) * d;
    if (n.life <= 0 || W.solidAt(G.map, n.x, n.y + 6)) { n.gone = true; K.stopFx(n.h); return; }
    for (const e of G.enemies) {
      if (!K.alive(e) || n.hit.has(e)) continue;
      const [cx, cy] = K.ec(e);
      if (Math.hypot(cx - n.x, cy - n.y) < e.r + 3) {
        n.hit.add(e); n.gone = true; K.stopFx(n.h);
        K.hit(G, p, e, TS.needle.dmg, { critChance: TS.needle.crit, ang: n.ang, repel: TS.needle.repel, fx: 'hit_blue2', tag: 'needle' });
        slowEnemy(e, TS.slowT);
        return;
      }
    }
  }

  S.time_space_shuriken = {
    start(G, p) {
      K.layer(G);
      const dur = K.cfg(p, 'time_space_shuriken').dur || 3;
      p.skillT = dur;
      const { ang } = K.targetAng(G, p, 14 * T);
      const sh = { x: p.x + Math.cos(ang) * 8, y: p.y - 7 + Math.sin(ang) * 8, ang, v: TS.speed, spin: 0, t: 0, tick: 0, stepT: TS.stepEvery, hit: new Set(), needles: [], bullets: new Map(), zone: null };
      sh.h = fx(G, 'bullet_skill_ninja_jump', sh.x, sh.y, { follow: sh, dur });
      p._shu = sh;
      layerProp(G, (G2, q, dt) => { if (p._shu !== sh) { q.gone = true; return; } stepShuriken(G2, p, sh, dt); });
    },
    // Bấm lần nữa: phát động lại sớm (tốc biến chém xuyên + tới Shuriken).
    press(G, p) { if (p._shu) p.skillT = 1e-4; },
    end(G, p) { if (p._shu) recall(G, p, p._shu); }
  };

  function stepShuriken(G, p, sh, dt) {
    sh.t += dt; sh.spin += TS.spin * dt;
    for (const n of sh.needles) stepNeedle(G, p, n, dt);
    sh.needles = sh.needles.filter(n => !n.gone);
    sh.tick -= dt;
    while (sh.tick <= 0) { sh.tick += TS.every; needle(G, sh.x, sh.y, sh.spin, sh); }
    if (sh.v > 0) {
      sh.stepT -= dt;
      const d = sh.v * dt;
      sh.x += Math.cos(sh.ang) * d; sh.y += Math.sin(sh.ang) * d;
      if (sh.stepT <= 0) { sh.stepT += TS.stepEvery; sh.v *= TS.stepMul; }
      for (const e of G.enemies) {
        if (!K.alive(e) || sh.hit.has(e)) continue;
        const [cx, cy] = K.ec(e);
        if (Math.hypot(cx - sh.x, cy - sh.y) < e.r + 6) { sh.hit.add(e); K.hit(G, p, e, TS.dmg, { ang: sh.ang, repel: 2, fx: 'hit_blue2', tag: 'shuriken' }); slowEnemy(e, TS.slowT); }
      }
      if (W.solidAt(G.map, sh.x, sh.y + 6)) { sh.x -= Math.cos(sh.ang) * 8; sh.y -= Math.sin(sh.ang) * 8; sh.v = 0; }
    }
    if (!sh.zone && sh.t >= TS.zoneDelay) {
      sh.zone = { t: 0 };
      sh.h2 = fx(G, 'TimeStopCircleNinja', sh.x, sh.y, { dur: TS.zoneLife });
      for (const e of G.enemies) if (K.alive(e) && Math.hypot(K.ec(e)[0] - sh.x, K.ec(e)[1] - sh.y) < TS.zoneR) slowEnemy(e, TS.slowT);
    }
    if (sh.zone) zoneTick(G, sh, dt);
  }
  // Vùng ngưng đọng: đạn địch chia 5 vận tốc khi vào, trả lại khi ra hoặc khi vùng tắt (sau 3 s).
  function zoneTick(G, sh, dt) {
    sh.zone.t += dt;
    const on = sh.zone.t < TS.zoneLife;
    for (const b of G.bullets) {
      if (b.side !== 'e' || b.dead) continue;
      const inside = on && Math.hypot(b.x - sh.x, b.y - sh.y) < TS.zoneR, has = sh.bullets.has(b);
      if (inside && !has) { sh.bullets.set(b, 1); b.vx /= TS.bulletDiv; b.vy /= TS.bulletDiv; }
      else if (!inside && has) { sh.bullets.delete(b); b.vx *= TS.bulletDiv; b.vy *= TS.bulletDiv; }
    }
    if (!on && sh.h2) { K.stopFx(sh.h2); sh.h2 = null; }
  }
  // Phát động lại: tốc biến qua từng quái (tối đa maxDashCount), chém, tới Shuriken; xong thì mọi quái đang chậm nhận nhát kiếm.
  function recall(G, p, sh) {
    p._shu = null;
    K.stopFx(sh.h); K.stopFx(sh.h2);
    for (const [b] of sh.bullets) if (!b.dead) { b.vx *= TS.bulletDiv; b.vy *= TS.bulletDiv; }
    for (const n of sh.needles) K.stopFx(n.h);
    const mx = (p.x + sh.x) / 2, my = (p.y + sh.y + 7) / 2;
    const targets = K.inRadius(G, mx, my - 7, TS.range).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, TS.dashMax);
    const stops = targets.map(e => ({ e, x: e.x, y: e.y })).concat([{ e: null, x: sh.x, y: sh.y + 7 }]);
    K.ghost(p, true); K.hurtMods(p).ninja_dash = () => 0;
    let i = 0, t = 0, x0 = p.x, y0 = p.y;
    layerProp(G, (G2, q, dt) => {
      t += dt;
      const s = stops[i], k = Math.min(1, t / TS.hop), nx = x0 + (s.x - x0) * k, ny = y0 + (s.y - y0) * k;
      if (!W.boxHits(G2.map, nx - p.h.body.r, ny - p.h.body.r, nx + p.h.body.r, ny)) { p.x = nx; p.y = ny; }
      const a = Math.atan2(s.y - y0, s.x - x0);
      if (Math.abs(Math.cos(a)) > 0.1) p.face = Math.cos(a) > 0 ? 1 : -1;
      if (k < 1) return;
      const seg = [x0, y0, s.x, s.y];
      if (s.e && K.alive(s.e)) {
        K.hit(G2, p, s.e, TS.slash, { critChance: TS.crit, ang: a, repel: 2, fx: 'hit_blue2', tag: 'slash' });
        K.debuff(G2, s.e, 'ele');
        fx(G2, 'skill_ninja_slash', s.e.x, s.e.y - 7, { ang: a, dur: 0.35 });
      } else voidSlash(G2, p, seg);
      x0 = s.x; y0 = s.y; t = 0; i++;
      if (i < stops.length) return;
      q.gone = true;
      K.ghost(p, false); delete K.hurtMods(p).ninja_dash;
      for (const e of G2.enemies) {
        if (!K.alive(e) || !slowed(e)) continue;
        K.hit(G2, p, e, TS.sword, { critChance: TS.crit, ang: 0, repel: 3, fx: 'hit_blue2', tag: 'sword' });
        fx(G2, 'skill_ninja_void_slash', e.x, e.y - 7, { dur: 0.35 });
      }
      G2.shake = Math.max(G2.shake, 3);
    });
  }
  // Vệt chém vũ trụ dọc đoạn đường cuối tới Shuriken.
  function voidSlash(G, p, [x0, y0, x1, y1]) {
    const ang = Math.atan2(y1 - y0, x1 - x0), dist = Math.hypot(x1 - x0, y1 - y0), c = Math.cos(ang), s = Math.sin(ang);
    for (const e of G.enemies) {
      if (!K.alive(e)) continue;
      const [ex, ey] = K.ec(e), dx = ex - x0, dy = ey - (y0 - 7), u = dx * c + dy * s, v = -dx * s + dy * c;
      if (u > -8 && u < dist + 8 && Math.abs(v) < TS.pathW / 2 + e.r) {
        K.hit(G, p, e, TS.slash, { critChance: TS.crit, ang, repel: 2, fx: 'hit_blue2', tag: 'void_slash' });
        K.debuff(G, e, 'ele');
      }
    }
    fx(G, 'skill_ninja_phantom', (x0 + x1) / 2, (y0 + y1) / 2 - 7, { ang, dur: 0.35 });
  }

  // ---------------------------------------------------------------- Săn Giết Siêu Thời Không
  // [ĐO config + C21Controller] cd 8, dur 3 = GetSkill1HyperSpaceDuration (skill1HyperSpaceDuration 3; chỉ chế độ Phòng Thủ /
  // ARAM mới cộng skill1ModeDurationBonusPerStep 0,5 theo cấp mỗi 7 / 10, port không có nên là 3 s); miễn mọi sát thương
  // (StartHitTrigger), thân mờ 0,5 [skin0.hyperSpaceBodyAlpha]. Mỗi lần bấm chém mục tiêu hiện tại (không có thì quái gần nhất trong
  // skill1SlashTargetRange 14 ô) nếu qua skill1SlashMinInterval 0,25 s và không đang chém dở [TryStartSkill1Slash,
  // FindSkill1SlashTarget]; đòn trúng sau skill1SlashPlaceholderDelay 0,2 s, sát thương skill1SlashDamage 10 [ApplySkill1SlashHit]
  // [ƯỚC LƯỢNG: mã coroutine đặt thời điểm trúng trong khoảng 0,2–0,32 s, chọn 0,2 s]. Mỗi nhát chém (kể cả nhát trượt) ghi một
  // bản ghi; khi hết thời gian, theo thứ tự ngược mỗi bản ghi triệu ra một bóng ninja cách nhau skill1PhantomSpawnInterval 0,3 s,
  // đứng cạnh mục tiêu (lệch skill1PhantomSameTargetOffset 0,45 ô luân phiên hai bên, nhiễu 0,12 ô) và tấn công
  // skill1PhantomAttackDuration 1,5 s bằng vũ khí của người lúc đó [ReleaseSkill1Phantoms, CreateSkill1Phantom,
  // GetSkill1PhantomTargetPos]. Bóng đánh bằng sát thương vũ khí, nhịp theo tốc bắn của vũ khí [ƯỚC LƯỢNG: mã chạy vũ khí thật
  // của NpcMercenaryController, port đánh trực tiếp]. Chưa làm: các phần Tengu / Expert Pet của bóng.
  const CH = {
    dmg: C('skill1SlashDamage', 10), gap: C('skill1SlashMinInterval', 0.25), range: C('skill1SlashTargetRange', 14) * T, dur: C('skill1HyperSpaceDuration', 3),
    delay: C('skill1SlashPlaceholderDelay', 0.2), alpha: 0.5,
    ph: { every: C('skill1PhantomSpawnInterval', 0.3), life: C('skill1PhantomAttackDuration', 1.5), off: C('skill1PhantomSameTargetOffset', 0.45) * T, jitter: C('skill1PhantomSameTargetJitter', 0.12) * T }
  };
  function targetOf(G, p) { return (p.target && K.alive(p.target) && p.target) || K.nearest(G, p.x, p.y - 6, CH.range); }
  S.chrono_hunt = {
    start(G, p) {
      K.layer(G);
      p.skillT = CH.dur;
      p._chr = { next: 0, busy: false, recs: [], pend: [] };
      K.ghost(p, true); K.hurtMods(p).chrono = () => 0;
      p._alpha = CH.alpha;
      fx(G, 'ninja_0_skill_1_effect', p.x, p.y, { follow: p, dur: 0.8 });
    },
    press(G, p) {
      const s = p._chr; if (!s || s.busy || G.t < s.next) return;
      s.next = G.t + CH.gap; s.busy = true;
      const e = targetOf(G, p);
      const [cx, cy] = e ? K.ec(e) : [p.x + p.face * 2 * T, p.y - 6], ang = Math.atan2(cy - (p.y - 6), cx - p.x);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      s.recs.push({ e, x: cx, y: cy });
      s.pend.push({ t: CH.delay, e, ang, x: cx, y: cy });
    },
    update(G, p, dt) {
      const s = p._chr; if (!s) return;
      for (const q of s.pend) {
        q.t -= dt;
        if (q.t > 0) continue;
        s.busy = false;
        fx(G, 'ninja_0_skill_1_slash', q.x, q.y, { ang: q.ang, dur: 0.4 });
        fx(G, 'skill_ninja_phantom', q.x - Math.cos(q.ang) * 2 * T, q.y - Math.sin(q.ang) * 2 * T, { ang: q.ang, dur: 0.35 });
        if (q.e && K.alive(q.e)) K.hit(G, p, q.e, CH.dmg, { critChance: p.crit, ang: q.ang, repel: 2, fx: 'hit_blue2', tag: 'chrono' });
        G.shake = Math.max(G.shake, 2);
      }
      s.pend = s.pend.filter(q => q.t > 0);
    },
    end(G, p) {
      const s = p._chr;
      p._chr = null; p._alpha = null; K.ghost(p, false); delete K.hurtMods(p).chrono;
      fx(G, 'ninja_0_skill_1_effect_1', p.x, p.y, { follow: p, dur: 0.6 });
      if (s) releasePhantoms(G, p, s.recs.slice().reverse());
    }
  };

  // Bóng ninja: một bóng cho mỗi nhát chém, triệu ra cách nhau 0,3 s, đánh 1,5 s bằng vũ khí đang cầm.
  function releasePhantoms(G, p, recs) {
    const w = p.weapons[p.cur], d = w && w.def;
    const same = new Map();
    recs.forEach((r, i) => {
      const key = r.e ? r.e : 'empty' + i, n = same.get(key) || 0;
      same.set(key, n + 1);
      const side = n % 2 ? -1 : 1, off = side * CH.ph.off * Math.ceil(n / 2 + 0.01) + SK.randf(-CH.ph.jitter, CH.ph.jitter);
      let t = i * CH.ph.every;
      layerProp(G, (G2, q, dt) => {
        t -= dt;
        if (t > 0) return;
        q.gone = true;
        spawnPhantom(G2, p, d, r, off);
      });
    });
  }
  function spawnPhantom(G, p, d, r, off) {
    const e0 = r.e && K.alive(r.e) ? r.e : K.nearest(G, r.x, r.y, 4 * T);
    const [tx, ty] = e0 ? K.ec(e0) : [r.x, r.y];
    const ph = { x: tx + off, y: ty + 7, t: 0, cd: 0, life: CH.ph.life, face: p.face };
    fx(G, 'ninja_skill_1_phantom', ph.x, ph.y - 7, { dur: 0.5 });
    G.props.push({
      x: ph.x, y: ph.y, t: 0,
      update(G2, q, dt) {
        ph.t += dt; ph.cd -= dt; q.y = ph.y;
        if (ph.t >= ph.life) { q.gone = true; return; }
        const e = e0 && K.alive(e0) ? e0 : K.nearest(G2, ph.x, ph.y - 7, 4 * T);
        if (!e) return;
        const [cx, cy] = K.ec(e), ang = Math.atan2(cy - (ph.y - 7), cx - ph.x);
        ph.face = Math.cos(ang) >= 0 ? 1 : -1;
        if (ph.cd <= 0 && d) {
          ph.cd = 1 / Math.max(0.5, d.rps || 2);
          K.hit(G2, p, e, Math.max(1, d.dmg || 3), { critChance: (d.crit || 0) + (p.crit || 0), ang, repel: 1, fx: 'hit_blue2', tag: 'phantom' });
        }
      },
      draw(ctx) {
        const fr = SK.animFrame(p.anims.idle, ph.t);
        ctx.save(); ctx.globalAlpha *= 0.6 * Math.min(1, (ph.life - ph.t) / 0.3 + 0.2);
        if (fr) SK.drawTinted(ctx, fr, ph.x, ph.y, [0.1, 0.2, 0.45, 1], { flip: ph.face < 0 });
        ctx.restore();
      }
    });
  }
  S.time_space_shuriken.TS = TS; S.chrono_hunt.CH = CH;
})();
