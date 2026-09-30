// Kỹ năng Đạo Sĩ Âm Dương (c39): duskbell_talisman_dawnflare_fist (hai nửa: Phù Chuông Đêm = Âm, Quyền Minh Trú = Dương).
// Số lấy từ ctrlFields của SK_SKILLS86.heroes.yinyang, MonoBehaviour yin_bullet (WobbleHomingRb2D) / buff_yin (BuffYin) và mã C40Controller
// (sk_method.py: SetUpChar, UpdateYinYangValue, Skill0Yin/Yang, CreateYinFu, SkillYangPunch, AddBulletBuff, BuffYin.OnTargetGotHurt) [ĐO].
// Gốc có hai nút (skill0Btns = ButtonGroup): K = Phù Chuông Đêm (Âm), nút đặc biệt L = Quyền Minh Trú (Dương), mỗi bên một hồi chiêu
// riêng (skill0YinBaseCooldown 4, skill0YangBaseCooldown 6). "max 3" trong config không phải số lượt: skillType 0 không thuộc {4, 6, 9, 12}
// nên SkillInfo.hasMultiCount = false [ĐO SkillInfo.get_hasMultiCount].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU;
  const { alive, ec, nearest, inRadius, hit, fx, ripFx, stopFx, CTRL, layer, timers, hurtMods, setMul } = K;
  const C = (k, d) => CTRL('yinyang', k, d);
  const Y = {
    fu: () => C('yinFuCount', 3), fuMax: () => C('yinFuCountMax', 9), fuDmg: () => C('skill0YinFuDamage', 1),
    dash: () => C('skill0DashDamage', 4), punch: () => C('skill0PunchDamage', 3) + C('skill0PunchDamageStrengthenAdd', 3),
    combo: () => C('skill0ComboDamage', 6), punches: () => C('punchMaxCount', 7),
    yinCd: () => C('skill0YinBaseCooldown', 4), yangCd: () => C('skill0YangBaseCooldown', 6),
    speed: 15 * U, turn: 480 * Math.PI / 180, recall: 2,   // [ĐO WobbleHomingRb2D _speed 15, _turnRateDegPerSec 480, _maxRecallDuration 2]
    dashT: () => C('punchDelay', 0.1),                     // quyền đánh sau punchDelay [ĐO SkillYangPunch: WaitForSeconds(punchDelay)]
    step: 10, buffT: 1, fuLife: 12, lockR: 20 * U,         // ±10 mỗi lần dùng [ĐO UpdateYinYangValue(10, −10)], buff phù/quyền 1 s [ĐO AddBulletBuff Timer.Register(1)], phù sống 12 s [ĐO buff_yin buff_time], FindEnemies(20)
    cap: 60, speedUp: 0.5, speedUpT: 1,                    // phù nổ khi tổng sát thương nhận ≥ triggerDamageThreshold 60, nổ bằng đúng tổng đó [ĐO BuffYin]; +50% tốc chạy 1 s sau quyền [ĐO YinYangSkill0SpeedUp]
    aoeR: () => C('punchSize', 1.75) * 2 * U, dashDist: 6 * T, stormR: 2.5 * T, stormTick: 0.25
  };   // aoeR, dashDist, stormR, stormTick: [ƯỚC LƯỢNG] (bán kính là size của prefab đạn, lực lao force 80 chưa quy ra khoảng cách)
  // Âm / Dương bắt đầu 50/50 [ĐO SetUpChar]; chỉ đổi khi dùng chiêu: Phù +10 Âm −10 Dương, Quyền ngược lại; vượt 100 thì cả hai về 50 [ĐO UpdateYinYangValue].
  const st = p => p._yy || (p._yy = { yin: 50, yang: 50, yangCd: 0, fus: [], dash: null, storm: null, winT: 0, swordT: 0 });
  function shift(s, dYin, dYang) {
    s.yin += dYin; s.yang += dYang;
    if (s.yin > 100 || s.yang > 100) s.yin = s.yang = 50;
  }
  const hy = e => e.hb.off[1] * e.scale;
  const melee = w => !!(w && w.def && (w.def.w86 ? w.def.w86.melee : w.def.kind === 'melee'));

  // ---------------------------------------------------------------- phù (Âm)
  function fireFu(G, p, n) {
    const s = st(p), en = G.enemies.filter(e => alive(e) && Math.hypot(e.x - p.x, e.y - p.y) <= Y.lockR).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (let i = 0; i < n; i++) {
      while (s.fus.filter(f => f.st !== 'gone').length >= Y.fuMax()) dropFu(s.fus.find(f => f.st !== 'gone'));
      const tgt = en[i % Math.max(1, en.length)] || null;
      const a = tgt ? Math.atan2(ec(tgt)[1] - (p.y - 8), tgt.x - p.x) + SK.randf(-0.5, 0.5) : p.aim + (i - (n - 1) / 2) * 0.4;
      const f = { x: p.x, y: p.y - 8, ang: a, st: 'fly', e: tgt, t: 0 };
      f.h = fx(G, 'yin_bullet', f.x, f.y, { follow: f, dur: 999 });
      s.fus.push(f);
    }
  }
  function dropFu(f) { if (!f) return; f.st = 'gone'; if (f.h) stopFx(f.h); f.h = null; if (f.e && f.e._fu) f.e._fu = f.e._fu.filter(q => q !== f); }
  function steer(f, tx, ty, dt) {
    let d = Math.atan2(ty - f.y, tx - f.x) - f.ang;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    f.ang += Math.max(-Y.turn * dt, Math.min(Y.turn * dt, d));
  }
  function fuTick(G, p, dt) {
    const s = st(p);
    for (const f of s.fus) {
      f.t += dt;
      if (f.st === 'fly') {
        if (!f.e || !alive(f.e)) f.e = nearest(G, f.x, f.y, 12 * T);
        if (f.e) { const [cx, cy] = ec(f.e); steer(f, cx, cy, dt); }
        f.x += Math.cos(f.ang) * Y.speed * dt; f.y += Math.sin(f.ang) * Y.speed * dt;
        if (f.e && alive(f.e)) {
          const [cx, cy] = ec(f.e);
          if (Math.hypot(cx - f.x, cy - f.y) < f.e.r + 4) {
            f.st = 'stuck'; f.dx = f.x - f.e.x; f.dy = f.y - f.e.y; f.until = G.t + Y.fuLife;
            hit(G, p, f.e, Y.fuDmg(), { tag: 'yin', repel: 1, fx: 'hit_blue' });
            (f.e._fu = f.e._fu || []).push(f);
            if (f.h) stopFx(f.h);
            f.h = fx(G, 'buff_yin', f.e.x, f.e.y, { follow: f.e, dy: -hy(f.e) - 2 * U, dur: 999 });   // nút icon của buff_yin lệch −2 đơn vị so với gốc
          }
        } else if (f.t > 3) dropFu(f);
      } else if (f.st === 'stuck') {
        if (!f.e || !alive(f.e) || G.t > f.until) dropFu(f);
      } else if (f.st === 'recall') {
        f.orb += 80 * Math.PI / 180 * dt;   // [ĐO _recallOrbitSpeed 80 độ/s]
        f.r = Math.min(Y.stormR, f.r + 60 * dt);
        f.x = p.x + Math.cos(f.orb) * f.r; f.y = p.y - 8 + Math.sin(f.orb) * f.r * 0.8;
      }
    }
    s.fus = s.fus.filter(f => f.st !== 'gone');
    if (s.storm) {   // bão phù: quét mọi quái quanh người rồi tan [ĐO thời gian _maxRecallDuration 2]
      s.storm.t += dt; s.storm.tick -= dt;
      if (s.storm.tick <= 0) {
        s.storm.tick = Y.stormTick;
        for (const e of inRadius(G, p.x, p.y - 8, Y.stormR)) hit(G, p, e, Math.max(1, s.storm.n * Y.fuDmg()), { tag: 'yin_storm', repel: 1, fx: 'hit_blue' });
      }
      if (s.storm.t >= Y.recall) { for (const f of s.fus.slice()) dropFu(f); s.storm = null; }
    }
  }
  function startStorm(G, p) {
    const s = st(p);
    if (!s.fus.length) fireFu(G, p, Y.fu());   // chưa có phù: vẫn tụ ba lá quanh người
    let i = 0;
    for (const f of s.fus) {
      if (f.e && f.e._fu) f.e._fu = f.e._fu.filter(q => q !== f);
      f.e = null; f.st = 'recall'; f.orb = i++ / s.fus.length * Math.PI * 2; f.r = Math.hypot(f.x - p.x, f.y - p.y);
      if (f.h) stopFx(f.h); f.h = fx(G, 'yin_bullet', f.x, f.y, { follow: f, dur: 999 });
    }
    s.storm = { t: 0, tick: 0, n: s.fus.length };
  }

  // ---------------------------------------------------------------- quyền (Dương)
  function punchAoe(G, p, x, y, dmg) {
    fx(G, 'hit_red', x, y - 6, { scale: 1.5 });
    ripFx(G, 'yang_punch', x, y, { top: true, dur: 0.4 });
    for (const e of inRadius(G, x, y - 6, Y.aoeR())) {
      const marked = !!(e._fu && e._fu.length), fresh = marked && !e._fuAct;
      hit(G, p, e, dmg, { tag: 'yang', repel: 4, critChance: p.crit });
      if (marked) { activate(e); st(p).yangCd = 0; }   // đánh trúng quái có phù: làm mới hồi chiêu Dương, kích phù
      if (fresh) hit(G, p, e, Y.combo(), { tag: 'yang_combo', repel: 2 });   // phù mới kích: thêm nhát tổ hợp skill0ComboDamage [ĐO OnYangPunchHitEnemy → CreateSKill0YinYangCombo]
    }
    setMul(p, 'moveMul', 'yy_speed', 1 + Y.speedUp); st(p).speedT = Y.speedUpT;
    G.shake = Math.max(G.shake, 2);
  }
  function startDash(G, p, n) {
    const s = st(p), { ang } = K.targetAng(G, p, 12 * T);
    s.dash = { ang, t: 0, v: Y.dashDist / Y.dashT(), left: n, dmg: Y.dash(), wait: 0 };
    if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
    ripFx(G, 'yang_dash', p.x, p.y - 6, { top: true, rot: ang, dur: 0.3 });
    s.yangCd = Y.yangCd();
    if (n > 1) hurtMods(p).yang = () => 0;   // chuỗi quyền nhiều nhịp: không bị đánh chen ngang [ƯỚC LƯỢNG]
  }
  function dashTick(G, p, dt) {
    const s = st(p), d = s.dash; if (!d) return;
    if (d.wait > 0) { d.wait -= dt; return; }
    d.t += dt;
    SK.moveBox(G.map, p, Math.cos(d.ang) * d.v * dt, Math.sin(d.ang) * d.v * dt, p.h.body.r);
    if (d.t < Y.dashT()) return;
    punchAoe(G, p, p.x, p.y, d.dmg);
    if (--d.left <= 0) { s.dash = null; delete hurtMods(p).yang; return; }
    // chuỗi nhiều quyền: nhịp trễ giảm dần [ĐO punchDelayCountinue 0.25, punchDelayCountinueDec 0.075]
    const k = Y.punches() - d.left;
    d.wait = Math.max(0, (k <= 1 ? C('punchDelay', 0.1) : C('punchDelayCountinue', 0.25) - (k - 2) * C('punchDelayCountinueDec', 0.075)));
    const nx = nearest(G, p.x, p.y - 6, 12 * T);
    if (nx) d.ang = Math.atan2(ec(nx)[1] - (p.y - 6), nx.x - p.x);
    d.t = 0;
  }
  // Phù kích hoạt bởi quyền: cất một phần sát thương quái nhận, nổ khi quái chết hoặc đủ giới hạn.
  function activate(e) { e._fuAct = e._fuAct || { stored: 0 }; }
  function detonate(G, p, e) {
    const a = e._fuAct; if (!a) return;
    e._fuAct = null;
    const [cx, cy] = ec(e);
    ripFx(G, 'yinyang_explode_skill0', cx, cy, { top: true, dur: 0.5 });
    for (const q of inRadius(G, cx, cy, Y.stormR)) if (q !== e) hit(G, p, q, Math.max(1, a.stored), { tag: 'fu_boom', repel: 3 });
    for (const f of (e._fu || []).slice()) dropFu(f);
    G.shake = Math.max(G.shake, 3);
  }
  SK.on('enemyHit', (G, e, d) => {
    const p = G.player; if (!p || p.hero !== 'yinyang') return;
    const s = st(p);
    if (e._fuAct && G._skHit !== 'fu_boom') {
      e._fuAct.stored += d;
      if (e._fuAct.stored >= Y.cap && alive(e)) detonate(G, p, e);
    }
    if (G._skHit) return;
    if (melee(p.weapons[p.cur]) && s.swordT > 0) {   // Dương trên 50: quyền cường hóa đòn cận chiến kế tiếp (SwordStrength, một lần)
      s.swordT = 0; ripFx(G, 'yang_punch', e.x, e.y, { top: true, dur: 0.4 }); hit(G, p, e, Y.punch(), { tag: 'yang_punch', repel: 3 });
    }
  });
  SK.on('enemyKill', (G, e) => { const p = G.player; if (p && p.hero === 'yinyang') detonate(G, p, e); });
  // Âm trên 50 sau khi dùng Phù: trong 1 s, vũ khí tầm xa mỗi lần bắn thêm một lá phù (BulletExtraFu qua onBulletCreate).
  SK.on('fire', (G, p, w) => { if (p.hero === 'yinyang' && st(p).winT > 0 && !melee(w)) fireFu(G, p, 1); });

  // ---------------------------------------------------------------- kỹ năng
  timers.yinyang = (G, p, dt) => {
    if (p.hero !== 'yinyang' || !p._yy) return;
    const s = p._yy;
    s.yangCd = Math.max(0, s.yangCd - dt); s.winT = Math.max(0, s.winT - dt); s.swordT = Math.max(0, s.swordT - dt);
    if (s.speedT > 0 && (s.speedT -= dt) <= 0) setMul(p, 'moveMul', 'yy_speed', 1);
    p._ultReady = s.yang >= 99;   // khung chiêu cuối trên nút đặc biệt khi Dương đầy
    fuTick(G, p, dt); dashTick(G, p, dt);
  };
  // K = Phù. Âm ≥ 99: thu mọi phù thành bão (CreateYinFuMax); sau đó Âm +10 thì vượt 100 và cả hai về 50.
  function doYin(G, p) {
    const s = st(p);
    if (s.yin >= 99) startStorm(G, p); else fireFu(G, p, Y.fu());
    shift(s, Y.step, -Y.step);
    if (s.yin > 50) s.winT = Y.buffT;
    p._cdAfter = Y.yinCd();
  }
  // L = Quyền. Dương ≥ 99: chuỗi punchMaxCount quyền (SkillYangPunchContinue).
  function doYang(G, p) {
    const s = st(p);
    if (s.dash || s.yangCd > 0) return;
    const chain = s.yang >= 99;
    shift(s, -Y.step, Y.step);
    if (s.yang > 50) s.swordT = Y.buffT;
    startDash(G, p, chain ? Y.punches() : 1);
  }
  S.duskbell_talisman_dawnflare_fist = {
    start(G, p) { layer(G); doYin(G, p); },
    special(G, p) { doYang(G, p); }
  };

  // Vị trí nút kỹ năng trên HUD uGUI (đơn vị khung nhìn); không có thì góc phải dưới.
  function skillBtn() {
    const v = SK.view, r = SK.hud && SK.hud.rect && SK.hud.rect('control/btn_skill');
    return r ? { x: r.x / v.scale, y: r.y / v.scale, w: r.w / v.scale } : { x: v.w - 46, y: v.h - 40, w: 32 };
  }
  // Thanh Âm / Dương trên nút kỹ năng.
  SK.on('hud', (ctx, G) => {
    const p = G.player; if (!p || p.hero !== 'yinyang' || !p._yy || G.state !== 'stage') return;
    const b = skillBtn(), w = Math.round(b.w);
    [['yin', '#8a6bff'], ['yang', '#ffb03a']].forEach(([k, col], i) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(b.x), Math.round(b.y) - 12 + i * 5, w, 4);
      ctx.fillStyle = col; ctx.fillRect(Math.round(b.x), Math.round(b.y) - 12 + i * 5, Math.round(w * p._yy[k] / 100), 4);
    });
  });
  SK.on('runStart', G => { const p = G.player; if (p && p.hero === 'yinyang') { p._yy = null; layer(G); } });
  SK.on('stageEnter', G => { const p = G.player; if (p && p._yy) { for (const f of p._yy.fus) dropFu(f); p._yy.fus = []; p._yy.dash = null; p._yy.storm = null; } });
})();
