// Xâm Nhập Hư Không độ 2 "Hư Không Hỗn Độn" và độ 3 "Hư Không Hủy Diệt" (G.void.tier 2 và 3), tiếp js/void.js.
// Nhãn: [WIKI VI] trang Void_Invasion, [LOC] chuỗi gốc (ui/void_invasion_enemy_guide_N, void_invasion_tier2/tier3), [ƯỚC LƯỢNG] không có nguồn.
// Số máu quái, sát thương từng đòn, khiên 120/160 mỗi tầng lấy từ bảng wiki; AI gốc nằm trong IL2CPP nên viết lại theo mô tả
// wiki + LOC, còn nhịp thời gian, tầm, tốc độ là [ƯỚC LƯỢNG].
//   Độ 2: Huyết Vệ (e_void_blood), Tế Tư (e_void_priest), Cấm Vệ (e_void_imperial: tên gốc Sentinel, khiên đỏ);
//         người chơi nhận thêm 1 sát thương mọi nguồn trừ Rãnh Nứt (rãnh tự mất 2) [WIKI VI General]; Rãnh Nứt mất 2.
//   Độ 3: Thiền Vệ Trượng + Châu (e_void_staffmonk/beadsmonk, chung một ô Tinh Anh), Triệu Hồi Sư (e_void_summoner),
//         Hộ Pháp (e_void_sentinel: tên gốc Warden), Đao Phủ (e_void_killer: chỉ ở ải 4-x, web chưa có tầng 4 trong chế độ này);
//         người chơi vào ván có Khiên Hư Không 12 tầng (3004) và Lệnh Truy Sát (3003) [WIKI VI General; Chrono Wanderer web chưa có].
//   Đầu ván bốc 3 loại hợp lệ của độ đó (độ 1: cố định Thủ Vệ/Ảnh Vệ/Linh Vệ).
// Thiên phú 3001-3007 [WIKI buff N; data/sk-buffs86.js]: 3001-3003 từ độ 2 (qua Thương Nhân Hư Không), 3005-3007 từ độ 3.
(function () {
  const SK = window.SK, V = SK.voidMode;
  if (!V) return;
  const { C, KINDS, AI, make, move, shoot, setAct, lockDir, dist, angTo, on } = V;
  const C2 = {
    chaoticDmgAdd: 1,                  // độ 2: người chơi +1 sát thương mọi nguồn [WIKI VI General]
    openWin: 2.5,                      // giây khiên mở khi bị đồng bạn đánh trúng (Thiền Vệ) [ƯỚC LƯỢNG]
    pool0: 30, poolGrow: 14, poolMax: 90, poolDps: 3, poolSpeed: 60,   // Huyết Vệ: huyết trì 3 sát thương/giây, to dần mỗi lần đánh [WIKI VI]; cỡ [ƯỚC LƯỢNG]
    priestArrow: 6, priestBall: 9, priestChan: 3, ballLife: 4.5,       // Tế Tư: tên + vệt tròn 6, cầu đen 9 [WIKI VI]
    sentinelAtk: 5, sentinelQuake: 7,                                  // Cấm Vệ: 5 mỗi đòn, sóng xung kích 7 [WIKI VI]
    staffHit: 5, staffQuake: 6, beadHit: 3, beadQuake: 5, beads: 8, beadBounce: 2,   // Thiền Vệ: 8 châu bật 2 lần [WIKI VI]; sát thương [ƯỚC LƯỢNG]
    graspHp: 12, graspN: 3, graspHit: 2, sumOpen: 3, slowK: 0.5,       // Triệu Hồi Sư: 3 Bàn Tay 12 máu [WIKI VI]
    wardenOrbs: 3, wardenOpen: 1.5, circleR: 28, circleLife: 5, circleWarm: 0.6, orbRegen: 4,   // Hộ Pháp: 3 pháp cầu [LOC guide_7]
    killerDaggers: 3, killerStrike: 4, killerThrow: 5, killerLife: 40,  // Đao Phủ: 3 dao găm, biến mất sau 40 giây [WIKI VI]
    vshMax: 12, vshCountdown: 10,      // Khiên Hư Không người chơi 12 tầng [WIKI VI]; đếm ngược Hủy Diệt chưa có số [ƯỚC LƯỢNG 10 s]
    vshBreakGain: 3, vshStageGain: 1, vshBossGain: 5, vshPotion: 1, vshBigPotion: 2,
    blessExtra: 1, supportNow: 3, supportEach: 1,                       // 3005 +1 giây; 3006 hồi 3 rồi 1 mỗi lần tương tác [LOC buff 3006]
    imgCd: 15, imgLife: 3, imgHide: 1.5, imgEvery: 0.5                  // 3007: CD "??s" [ƯỚC LƯỢNG 15]
  };
  V.C2 = C2;

  // ---------------------------------------------------------------- loại mới và bể Tinh Anh theo độ
  Object.assign(KINDS, {
    blood: { id: 'e_void_blood', hp: [350], name: 'Hư Không Huyết Vệ', elite: true },
    priest: { id: 'e_void_priest', hp: [300], name: 'Hư Không Tế Tư', elite: true },
    sentinel: { id: 'e_void_imperial', hp: [350], name: 'Hư Không Cấm Vệ', elite: true },
    staff: { id: 'e_void_staffmonk', hp: [300], name: 'Thiền Vệ Hư Không-Trượng Tướng', elite: true },
    bead: { id: 'e_void_beadsmonk', hp: [300], name: 'Thiền Vệ Hư Không-Châu Tướng', elite: true },
    summoner: { id: 'e_void_summoner', hp: [300], name: 'Hư Không Triệu Hồi Sư', elite: true },
    warden: { id: 'e_void_sentinel', hp: [300], name: 'Hư Không Hộ Pháp', elite: true },
    killer: { id: 'e_void_killer', hp: [300], name: 'Hư Không Đao Phủ', elite: true },
    grasp: { id: 'e_void_summoner', hp: [C2.graspHp], name: 'Bàn Tay Hư Không', elite: false }
  });
  V.GROUPS = { zentinel: ['staff', 'bead'] };
  // [khoá ô Tinh Anh, độ khó nhỏ nhất, chỉ ải 4-x]  [LOC ui/void_invasion_enemy_debut; WIKI VI]
  V.POOL = [['guard', 1], ['assassin', 1], ['mage', 1], ['blood', 2], ['priest', 2], ['sentinel', 2], ['zentinel', 3], ['summoner', 3], ['warden', 3], ['killer', 3, true]];
  V.floor4 = false;
  V.eligible = (tier, floor4) => V.POOL.filter(r => r[1] <= tier && (!r[2] || floor4 === true)).map(r => r[0]);
  V.pickRoster = function (tier) {
    if (tier <= 1) return V.ELITES.slice();
    const left = V.eligible(tier, V.floor4), out = [];
    while (out.length < 3 && left.length) out.push(left.splice(Math.floor(SK.rand() * left.length), 1)[0]);
    return out;
  };
  for (const k of ['blood', 'priest', 'sentinel', 'staff', 'bead', 'summoner', 'warden', 'killer']) SK.CUSTOM_ENEMIES[KINDS[k].id] = (g, x, y, room) => make(g, k, x, y, room);

  // ---------------------------------------------------------------- tiện ích
  const alive = g => g.player.st !== 'dead';
  const face = (g, e) => { e.face = g.player.x >= e.x ? 1 : -1; };
  const hurtP = (g, dmg, x, y) => SK.hurtPlayer(g, dmg, x, y);
  const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;
  const partner = (g, e) => g.enemies.find(o => o !== e && o.room === e.room && o.st !== 'dead' && o.voidKind === (e.voidKind === 'staff' ? 'bead' : 'staff'));
  const openShield = (o, t) => { if (o && o.vs && o.vs.stacks > 0) o.vs.openT = Math.max(o.vs.openT || 0, t); };
  const redShield = (e, t) => { if (e.vs && e.vs.stacks > 0) e.vs.redT = Math.max(e.vs.redT || 0, t); };
  const ring = (ctx, x, y, r, col, a, fill) => {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.stroke(); ctx.restore();
  };
  // Làm chậm người chơi: nhân p.moveMul rồi gỡ đúng hệ số đã nhân
  function slow(g, t) {
    const v = g.void, p = g.player;
    if (!v.slowOn) { v.slowOn = true; v.slowK = C2.slowK; p.moveMul = (p.moveMul == null ? 1 : p.moveMul) * v.slowK; }
    v.slowT = Math.max(v.slowT || 0, t);
  }
  function slowEnd(g) {
    const v = g.void;
    if (v.slowOn) { v.slowOn = false; g.player.moveMul = g.player.moveMul / (v.slowK || 1); v.slowK = 1; }
    v.slowT = 0;
  }
  function slowTick(g, dt) {
    const v = g.void;
    if (v.slowOn) { v.slowT -= dt; if (v.slowT <= 0) slowEnd(g); }
  }
  // Kịch bản đòn: e.steps = [{at, fn}], e.sT là giờ của đòn, e.sTotal là độ dài
  function script(e, steps, total) { e.steps = steps; e.sT = 0; e.sTotal = total; }
  function runScript(e, dt) {
    e.sT += dt;
    for (const st of e.steps) if (!st.done && e.sT >= st.at) { st.done = true; st.fn(); }
    return e.sT >= e.sTotal;
  }
  const strike = (g, e, r, dmg) => { if (alive(g) && near(e, g.player, r)) return hurtP(g, dmg, e.x, e.y); return false; };
  const teleFx = (x, y, r, life) => ({ kind: 'tele', x, y, done: false, t: 0, update(g2, en, f, dt2) { f.t += dt2; if (f.t >= life) f.done = true; }, draw(ctx, g2, f) { ring(ctx, f.x, f.y, r, '#ff3030', 0.7, 'rgba(255,40,40,0.15)'); } });
  function waveFx(x, y, r) {
    return { kind: 'wave', x, y, r, t: 0, done: false, update(g, e, f, dt) { f.t += dt; if (f.t > 0.4) f.done = true; },
      draw(ctx, g, f) { ring(ctx, f.x, f.y, f.r * Math.min(1, f.t / 0.3), '#ff7a7a', 0.7 * (1 - f.t / 0.4)); } };
  }

  // ---------------------------------------------------------------- Huyết Vệ: huyết trì
  // Không di chuyển khi đã bắt đầu đánh; vòng đỏ sáng loang ra rồi thành vòng đỏ sẫm, trong đó mất 3 sát thương/giây; vòng to hơn sau mỗi đòn.
  // Trước đòn khiên tắt ngắn: đánh trúng lúc đó thì vỡ [WIKI VI Bloodguard; LOC guide_3].
  function poolFx(e) {
    return {
      kind: 'pool', x: e.x, y: e.y, rd: 0, r: 0, rt: 0, tick: 0, done: false,
      grow(rt) { this.rt = rt; this.r = this.rd; },
      update(g, en, f, dt) {
        if (f.r < f.rt) { f.r = Math.min(f.rt, f.r + C2.poolSpeed * dt); if (f.r >= f.rt) f.rd = f.rt; }
        f.tick -= dt;
        if (alive(g) && f.rd > 0 && near(g.player, f, f.rd) && f.tick <= 0) { if (hurtP(g, C2.poolDps, f.x, f.y)) f.tick = 1; }
      },
      draw(ctx, g, f) {
        if (f.rd > 0) ring(ctx, f.x, f.y, f.rd, '#5a0a14', 0.7, 'rgba(90,10,20,0.45)');
        if (f.r > f.rd) ring(ctx, f.x, f.y, f.r, '#ff4a4a', 0.8);
      }
    };
  }
  AI.blood = function (g, e, dt) {
    const d = dist(e, g.player);
    if (e.act === 'wind') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0) {
        e.nAtk = (e.nAtk || 0) + 1;
        let f = e.fx.find(q => q.kind === 'pool');
        if (!f) { f = poolFx(e); e.fx.push(f); }
        f.grow(Math.min(C2.poolMax, C2.pool0 + C2.poolGrow * (e.nAtk - 1)));
        setAct(e, 'rest', 1.4, 'skill_1_end');
      }
    } else if (e.act === 'rest') {
      e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 3.2; }
    } else {
      e.cd -= dt; face(g, e); e.as = 'idle';
      if (!e.still && d > 100 && alive(g)) { move(g, e, g.player.x - e.x, g.player.y - e.y, 28, dt); e.as = 'run'; }
      if (e.cd <= 0 && alive(g) && d < 150) { e.still = true; setAct(e, 'wind', 0.9, 'skill_1_start'); openShield(e, 0.9); }
    }
  };

  // ---------------------------------------------------------------- Tế Tư: tên có vệt, niệm phép nối quái, cầu đen
  function arrowFx(e, ang) {
    return {
      kind: 'arrow', x: e.x, y: e.y - 10, a: ang, t: 0, trail: 0, dots: [], done: false,
      update(g, en, f, dt) {
        f.t += dt;
        if (f.t < 1.6) {
          f.x += Math.cos(f.a) * 90 * dt; f.y += Math.sin(f.a) * 90 * dt;
          f.trail -= dt; if (f.trail <= 0) { f.trail = 0.15; f.dots.push({ x: f.x, y: f.y, life: 2.2 }); }
          if (alive(g) && near(g.player, { x: f.x, y: f.y + 6 }, 7)) hurtP(g, C2.priestArrow, f.x, f.y);
        }
        for (const q of f.dots) { q.life -= dt; if (q.life > 0 && alive(g) && near(g.player, { x: q.x, y: q.y + 6 }, 4)) hurtP(g, C2.priestArrow, q.x, q.y); }
        f.dots = f.dots.filter(q => q.life > 0);
        if (f.t >= 1.6 && !f.dots.length) f.done = true;
      },
      draw(ctx, g, f) {
        ctx.fillStyle = '#c070ff';
        for (const q of f.dots) { ctx.globalAlpha = Math.min(1, q.life); ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill(); }
        if (f.t < 1.6) { ctx.globalAlpha = 1; ctx.fillStyle = '#e8d4ff'; ctx.beginPath(); ctx.arc(f.x, f.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
      }
    };
  }
  // Cầu đen: đuổi người chơi xuyên tường, nổ sau ballLife giây hoặc khi chạm người: 9 sát thương; chạm chính Tế Tư thì vỡ khiên.
  function ballFx(e) {
    return {
      kind: 'ball', x: e.x, y: e.y - 14, t: 0, done: false, spd: 36,
      update(g, en, f, dt) {
        f.t += dt;
        const p = g.player;
        if (alive(g)) { const a = Math.atan2(p.y - 8 - f.y, p.x - f.x); f.x += Math.cos(a) * f.spd * dt; f.y += Math.sin(a) * f.spd * dt; }
        if (alive(g) && Math.hypot(p.x - f.x, p.y - 8 - f.y) < 8) { f.done = true; hurtP(g, C2.priestBall, f.x, f.y); return; }
        if (f.t > 0.8 && en.st !== 'dead' && en.vs && en.vs.stacks > 0 && Math.hypot(en.x - f.x, en.y - en.hb.off[1] - f.y) < en.r + 6) { f.done = true; V.breakLayer(g, en, 'ball'); return; }
        if (f.t >= C2.ballLife) { f.done = true; if (alive(g) && Math.hypot(p.x - f.x, p.y - 8 - f.y) < 16) hurtP(g, C2.priestBall, f.x, f.y); }
      },
      draw(ctx, g, f) { ctx.fillStyle = '#1a0030'; ctx.strokeStyle = '#d07bff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + Math.sin(g.t * 10), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    };
  }
  V.ballFx = ballFx;
  V.linkable = (g, e) => g.enemies.filter(o => o !== e && o.room === e.room && o.st !== 'dead' && !o.isVoid && !o.bossKey && o.hp > 0);
  function linkFx(e, targets) {
    return {
      kind: 'link', targets, t: 0, done: false,
      update(g, en, f, dt) {
        f.t += dt;
        if (en.st === 'dead') { f.done = true; return; }
        if (f.targets.every(o => o.st === 'dead' || o.hp <= 0 || g.enemies.indexOf(o) < 0)) {   // quái bị nối chết hết khi đang niệm: mất 1 tầng khiên và bỏ đi
          f.done = true; en.act = null; en.cd = 2.5;
          V.breakLayer(g, en, 'link');
          return;
        }
        if (f.t >= C2.priestChan) { f.done = true; en.fx.push(ballFx(en)); }
      },
      draw(ctx, g, f, en) {
        ctx.strokeStyle = '#b06bff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
        for (const o of f.targets) if (o.st !== 'dead') { ctx.beginPath(); ctx.moveTo(en.x, en.y - 14); ctx.lineTo(o.x, o.y - 10); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.fillStyle = '#1a0030'; ctx.beginPath(); ctx.arc(en.x, en.y - 30, 2 + f.t * 2, 0, Math.PI * 2); ctx.fill();
      }
    };
  }
  AI.priest = function (g, e, dt) {
    const p = g.player, d = dist(e, p);
    if (e.act === 'arrow') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0.35 && !e.shot) { e.shot = true; e.fx.push(arrowFx(e, angTo(e, p))); }
      if (e.actT <= 0) setAct(e, 'rest', 1, 'idle');
    } else if (e.act === 'chan') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0) setAct(e, 'rest', 1.2, 'idle');
    } else if (e.act === 'rest') {
      e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.8; }
    } else {
      e.cd -= dt; face(g, e); e.as = 'idle';
      if (d < 70) move(g, e, e.x - p.x, e.y - p.y, 28, dt);
      if (e.cd <= 0 && alive(g)) {
        const t = V.linkable(g, e).slice(0, 3);
        if (t.length && !e.fx.some(f => f.kind === 'link' || f.kind === 'ball') && SK.chance(0.5)) V.priestLink(g, e, t);
        else { e.shot = false; setAct(e, 'arrow', 0.8, 'skill_2'); }
      }
    }
  };
  V.priestLink = function (g, e, targets) {
    setAct(e, 'chan', C2.priestChan + 0.2, 'skill_1_loop');
    openShield(e, 0.5);   // trước khi đánh khiên tắt ngắn
    e.fx.push(linkFx(e, targets));
  };

  // ---------------------------------------------------------------- Cấm Vệ: khiên đỏ, ba đòn liên tiếp
  // Lao kiếm 5, đập chuôi 5, chém lên 5 rồi chém xuống 5 rồi nhảy đập đất tạo sóng xung kích 7 [WIKI VI Sentinel].
  const SEQ = ['lunge', 'pommel', 'slash'];
  V.sentinelCombo = function (g, e, seq) {
    seq = seq || [SK.pick(SEQ), SK.pick(SEQ), SK.pick(SEQ)];
    const steps = [];
    let t = 0.35;
    for (const k of seq) {
      if (k === 'lunge') { const at = t; steps.push({ at, fn: () => { lockDir(g, e); e.lunge = 0.22; e.lh = false; e.as = 'skill_strike'; } }); t += 0.65; }
      else if (k === 'pommel') { steps.push({ at: t, fn: () => { e.as = 'skill_spike'; strike(g, e, 26, C2.sentinelAtk); } }); t += 0.55; }
      else {
        steps.push({ at: t, fn: () => { e.as = 'skill_slash'; strike(g, e, 28, C2.sentinelAtk); } });
        steps.push({ at: t + 0.3, fn: () => { e.as = 'skill_slash_r'; strike(g, e, 28, C2.sentinelAtk); } });
        steps.push({ at: t + 0.75, fn: () => { e.as = 'skill_fall'; g.shake = Math.max(g.shake, 3); e.fx.push(waveFx(e.x, e.y, 44)); strike(g, e, 44, C2.sentinelQuake); } });
        t += 1.1;
      }
    }
    script(e, steps, t);
    redShield(e, t + 1);   // khiên đổi từ tím sang đỏ khi tấn công, giữ thêm một lúc sau [WIKI VI]
    setAct(e, 'combo', t + 0.1, 'skill_start');
    e.seq = seq;
  };
  function lungeTick(g, e, dt) {
    if (e.lunge > 0) {
      e.lunge -= dt; move(g, e, Math.cos(e.dir), Math.sin(e.dir), 200, dt);
      if (!e.lh && alive(g) && near(e, g.player, 20)) { e.lh = true; hurtP(g, C2.sentinelAtk, e.x, e.y); }
    }
  }
  AI.sentinel = function (g, e, dt) {
    const p = g.player, d = dist(e, p);
    if (e.act === 'combo') {
      lungeTick(g, e, dt);
      if (runScript(e, dt)) setAct(e, 'rest', 0.9, 'idle');
    } else if (e.act === 'rest') {
      e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.8; }
    } else {
      e.cd -= dt; face(g, e); e.as = 'idle';
      if (d > 28 && alive(g)) { move(g, e, p.x - e.x, p.y - e.y, 38, dt); e.as = 'run'; }
      if (e.cd <= 0 && d < 100 && alive(g)) V.sentinelCombo(g, e);
    }
  };

  // ---------------------------------------------------------------- Thiền Vệ Trượng + Châu: khiên rơi khi bị đồng bạn đánh trúng
  // Khiên của hai người chỉ mở khi dính đòn của người kia [LOC guide_8-9]; mỗi đòn khiên chuyển đỏ [WIKI VI].
  AI.staff = function (g, e, dt) {
    const p = g.player, d = dist(e, p), pt = partner(g, e);
    if (e.act === 'tele') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0) {
        if (e.kind2 === 'jump') {
          e.fx.push(waveFx(e.jx, e.jy, 36)); g.shake = Math.max(g.shake, 3);
          e.x = e.jx; e.y = e.jy;
          if (alive(g) && near({ x: e.jx, y: e.jy }, p, 36)) hurtP(g, C2.staffQuake, e.jx, e.jy);
          if (pt && near({ x: e.jx, y: e.jy }, pt, 36)) openShield(pt, C2.openWin);
          setAct(e, 'rest', 1, 'idle');
        } else { lockDir(g, e); e.ph = false; setAct(e, 'dash', 0.4, 'skill_1'); }
      }
    } else if (e.act === 'dash') {
      e.actT -= dt;
      move(g, e, Math.cos(e.dir), Math.sin(e.dir), 170, dt);
      if (!e.hit && alive(g) && near(e, p, 22)) { e.hit = true; hurtP(g, C2.staffHit, e.x, e.y); }
      if (!e.ph && pt && near(e, pt, 24)) { e.ph = true; openShield(pt, C2.openWin); }
      if (e.actT <= 0) setAct(e, 'rest', 1, 'idle');
    } else if (e.act === 'rest') {
      e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.4; }
    } else {
      e.cd -= dt; face(g, e); e.as = 'idle';
      if (d > 40 && alive(g)) { move(g, e, p.x - e.x, p.y - e.y, 32, dt); e.as = 'run'; }
      if (e.cd <= 0 && alive(g) && d < 160) {
        e.n = (e.n || 0) + 1;
        if (e.n % 2) { e.kind2 = 'dash'; setAct(e, 'tele', 0.6, 'skill_1'); redShield(e, 1.4); }
        else { e.kind2 = 'jump'; e.jx = p.x; e.jy = p.y; setAct(e, 'tele', 0.8, 'skill_2'); redShield(e, 1.6); e.fx.push(teleFx(p.x, p.y, 36, 0.85)); }
      }
    }
  };
  function beadFx(e, ang) {
    return {
      kind: 'bead', x: e.x, y: e.y - 8, vx: Math.cos(ang) * 70, vy: Math.sin(ang) * 70, b: 0, t: 0, done: false,
      update(g, en, f, dt) {
        f.t += dt;
        if (SK.moveBox(g.map, f, f.vx * dt, 0, 2)) { f.vx = -f.vx; f.b++; }
        if (SK.moveBox(g.map, f, 0, f.vy * dt, 2)) { f.vy = -f.vy; f.b++; }
        if (f.b > C2.beadBounce || f.t > 8) { f.done = true; return; }
        if (alive(g) && near({ x: f.x, y: f.y + 6 }, g.player, 7)) { f.done = true; hurtP(g, C2.beadHit, f.x, f.y); return; }
        const pt = partner(g, en);
        if (pt && near({ x: f.x, y: f.y + 8 }, pt, 14)) { f.done = true; openShield(pt, C2.openWin); }
      },
      draw(ctx, g, f) { ctx.fillStyle = '#d9b3ff'; ctx.strokeStyle = '#5a1fa0'; ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    };
  }
  AI.bead = function (g, e, dt) {
    const p = g.player, d = dist(e, p);
    if (e.act === 'wind') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0) {
        if (e.kind2 === 'beads') for (let i = 0; i < C2.beads; i++) e.fx.push(beadFx(e, i * Math.PI / 4 + Math.PI / 8));
        else { e.fx.push(waveFx(e.x, e.y, 40)); g.shake = Math.max(g.shake, 3); strike(g, e, 40, C2.beadQuake); }
        setAct(e, 'rest', 1.2, 'idle');
      }
    } else if (e.act === 'rest') {
      e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.5; }
    } else {
      e.cd -= dt; face(g, e); e.as = 'idle';
      if (d < 60 && alive(g)) { move(g, e, e.x - p.x, e.y - p.y, 24, dt); e.as = 'run'; }
      if (e.cd <= 0 && alive(g)) {
        e.n = (e.n || 0) + 1;
        if (e.n % 2) { e.kind2 = 'beads'; setAct(e, 'wind', 0.6, 'skill_1'); }
        else { e.kind2 = 'quake'; setAct(e, 'wind', 0.8, 'skill_2'); redShield(e, 1.6); e.fx.push(teleFx(e.x, e.y, 40, 0.85)); }
      }
    }
  };

  // ---------------------------------------------------------------- Triệu Hồi Sư: Bàn Tay Hư Không
  // 3 Bàn Tay 12 máu; đánh trúng một bàn tay thì nó bị ném về chủ, tới nơi làm khiên chủ tắt sumOpen giây [LOC guide_6; WIKI VI Summoner].
  V.spawnGrasp = function (g, owner, x, y) {
    const c = make(g, 'grasp', x, y, owner.room, { hp: C2.graspHp, clone: true });
    c.grasp = true; c.owner = owner; c.st = 'idle'; c.stT = 0; c.cd = 0; c.hb = { size: [10, 10], off: [0, 5] }; c.r = 4;
    c.draw = drawGrasp;
    g.enemies.push(c);
    return c;
  };
  AI.grasp = function (g, e, dt) {
    const p = g.player, o = e.owner;
    if (!o || o.st === 'dead' || e.st === 'dead') { if (e.st !== 'dead') { e.st = 'dead'; e.stT = 9; e.leave = true; } return; }
    if (e.thrown) {
      const tg = { x: o.x, y: o.y - o.hb.off[1] * 0.5 }, a = angTo(e, tg);   // bay về ngực chủ
      e.x += Math.cos(a) * 140 * dt; e.y += Math.sin(a) * 140 * dt;
      if (near(e, tg, 8)) { openShield(o, C2.sumOpen); e.st = 'dead'; e.stT = 9; e.leave = true; SK.emit('voidGraspReturn', g, e, o); }
      return;
    }
    e.cd -= dt;
    if (alive(g)) {
      const a = angTo(e, p); e.x += Math.cos(a) * 26 * dt; e.y += Math.sin(a) * 26 * dt;
      if (e.cd <= 0 && near(e, p, 10)) { e.cd = 1.5; if (hurtP(g, C2.graspHit, e.x, e.y)) slow(g, 1.2); }
    }
  };
  function drawGrasp(ctx, g, e) {
    if (e.st === 'dead' && !e.leave) return;
    ctx.save(); ctx.globalAlpha = e.st === 'dead' ? Math.max(0, 1 - e.stT / 0.8) : 1;
    ctx.fillStyle = e.thrown ? '#ffd0ff' : '#7a2fd0'; ctx.strokeStyle = '#e8d4ff';
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 5, 5, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(e.x + i * 3, e.y - 9); ctx.lineTo(e.x + i * 4, e.y - 14); ctx.stroke(); }
    ctx.restore();
  }
  function slowPoolFx(x, y) {
    return { kind: 'slowpool', x, y, t: 0, done: false,
      update(g, e, f, dt) { f.t += dt; if (f.t > 0.5 && alive(g) && near(g.player, f, 20)) slow(g, 0.3); if (f.t > 5.5) f.done = true; },
      draw(ctx, g, f) { ring(ctx, f.x, f.y, 20 * Math.min(1, f.t / 0.5), '#7a2fd0', 0.8, 'rgba(110,40,190,0.25)'); } };
  }
  const graspsOf = (g, e) => g.enemies.filter(o => o.grasp && o.owner === e && o.st !== 'dead').length;
  AI.summoner = function (g, e, dt) {
    const p = g.player, d = dist(e, p);
    if (e.act === 'sum') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0.3 && !e.did) { e.did = true; for (let i = graspsOf(g, e); i < C2.graspN; i++) V.spawnGrasp(g, e, e.x + (i - 1) * 16, e.y + 4); }
      if (e.actT <= 0) setAct(e, 'rest', 1, 'idle');
    } else if (e.act === 'spit') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0.3 && !e.did) { e.did = true; for (let i = -1; i <= 1; i++) e.fx.push(slowPoolFx(p.x + i * 22, p.y + (i === 0 ? 0 : 8))); }
      if (e.actT <= 0) setAct(e, 'rest', 1, 'idle');
    } else if (e.act === 'rest') {
      e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.6; }
    } else {
      e.cd -= dt; face(g, e); e.as = 'idle';
      if (d < 90) move(g, e, e.x - p.x, e.y - p.y, 28, dt);
      if (e.cd <= 0 && alive(g)) {
        e.did = false;
        if (graspsOf(g, e) < C2.graspN) setAct(e, 'sum', 1, 'skill_1'); else setAct(e, 'spit', 0.9, 'skill_2');
      }
    }
  };

  // ---------------------------------------------------------------- Hộ Pháp: pháp cầu cấm kỹ năng
  // 3 pháp cầu; mỗi lần người chơi dùng kỹ năng thì một cầu bay tới chỗ đó mở vòng cấm: kỹ năng đang chạy bị cắt và không dùng được
  // trong vòng; ngay lúc cầu rời thân khiên Hộ Pháp tắt [LOC guide_7; WIKI VI Warden].
  AI.warden = function (g, e, dt) {
    const p = g.player, d = dist(e, p);
    e.face = p.x >= e.x ? 1 : -1; e.as = 'idle';
    if (e.orbs == null) e.orbs = C2.wardenOrbs;
    if (e.orbs < C2.wardenOrbs) { e.orbT = (e.orbT || 0) + dt; if (e.orbT >= C2.orbRegen) { e.orbT = 0; e.orbs++; } }
    if (d < 80 && alive(g)) { move(g, e, e.x - p.x, e.y - p.y, 30, dt); e.as = 'run'; }
    else if (d > 130 && alive(g)) { move(g, e, p.x - e.x, p.y - e.y, 24, dt); e.as = 'run'; }
  };
  SK.on('skill', (g, p) => {
    if (!on(g)) return;
    for (const e of g.enemies) {
      if (e.voidKind !== 'warden' || e.st === 'dead' || e.st === 'spawn' || e.room !== g.room) continue;
      if (e.orbs == null) e.orbs = C2.wardenOrbs;
      if (!(e.orbs > 0)) continue;
      e.orbs--; e.orbT = 0;
      openShield(e, C2.wardenOpen);
      g.void.circles.push({ x: p.x, y: p.y, t: 0, r: C2.circleR });
      SK.emit('voidWardenCircle', g, e);
      break;
    }
  });
  function circlesTick(g, dt) {
    const v = g.void, p = g.player;
    for (const c of v.circles) {
      c.t += dt;
      if (c.t >= C2.circleWarm && alive(g) && near(p, c, c.r)) {
        if (p.skillT > 0) SK.endSkill(g, p);
        p.skillCd = Math.max(p.skillCd, 0.4);
      }
    }
    v.circles = v.circles.filter(c => c.t < C2.circleLife);
  }

  // ---------------------------------------------------------------- Đao Phủ: dấu săn, dao găm
  // Dấu ấn hiện trên người chơi trước khi xuất hiện; rải 3 dao găm, lao tới từng dao (mỗi lần nhặt xoay chém 4, khiên tắt 0,6 giây),
  // nhặt hết thì ném dao 5; biến mất sau 40 giây [WIKI VI Executioner; LOC guide_10].
  function daggerFx(x, y) {
    return { kind: 'dagger', x, y, t: 0, done: false, update(g, e, f, dt) { f.t += dt; },
      draw(ctx, g, f) { ctx.strokeStyle = '#e8d4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x - 3, f.y + 2); ctx.lineTo(f.x + 3, f.y - 2); ctx.stroke(); ring(ctx, f.x, f.y, 5, '#ff4a4a', 0.5 + 0.3 * Math.sin(f.t * 8)); } };
  }
  AI.killer = function (g, e, dt) {
    const p = g.player;
    if (e.life == null) e.life = C2.killerLife;
    e.life -= dt;
    if (e.life <= 0) { V.leave(g, e); return; }
    if (e.act === 'mark') {
      e.actT -= dt; e.hidden = true;
      if (e.actT <= 0) {
        const a = SK.rand() * Math.PI * 2;
        [e.x, e.y] = SK.freeNear([p.x + Math.cos(a) * 50, p.y + Math.sin(a) * 50]);
        e.hidden = false; e.daggers = [];
        for (let i = 0; i < C2.killerDaggers; i++) {
          const b = SK.rand() * Math.PI * 2, r = SK.randf(35, 90), [dx, dy] = SK.freeNear([e.x + Math.cos(b) * r, e.y + Math.sin(b) * r]);
          const f = daggerFx(dx, dy); e.fx.push(f); e.daggers.push(f);
        }
        e.di = 0; setAct(e, 'collect', 99, 'run');
      }
    } else if (e.act === 'collect') {
      const f = e.daggers[e.di];
      if (!f) { setAct(e, 'throw', 0.6, 'skill_3'); return; }
      if (dist(e, f) > 5) move(g, e, f.x - e.x, f.y - e.y, 200, dt);
      else { f.done = true; e.di++; e.as = 'skill_2'; openShield(e, 0.6); e.fx.push(waveFx(e.x, e.y, 26)); strike(g, e, 26, C2.killerStrike); }
    } else if (e.act === 'throw') {
      e.actT -= dt; face(g, e);
      if (e.actT <= 0) { shoot(g, e, angTo(e, p), { spd: 9, dmg: C2.killerThrow, h: 8 }); setAct(e, 'rest', 1.5, 'idle'); }
    } else if (e.act === 'rest') {
      e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 2.5; }
    } else {
      e.cd -= dt; e.as = 'idle';
      if (e.cd <= 0 && alive(g)) {
        setAct(e, 'mark', 1.2, 'idle');
        e.fx.push({ kind: 'mark', t: 0, done: false, update(g2, en, f, dt2) { f.t += dt2; if (f.t > 1.2) f.done = true; },
          draw(ctx, g2, f) { const q = g2.player; ring(ctx, q.x, q.y, 10 + 6 * Math.sin(f.t * 12), '#ff2020', 0.9); } });
      }
    }
  };

  // ---------------------------------------------------------------- hook đánh quái
  const hurt0 = SK.hurtEnemy;
  SK.hurtEnemy = function (g, e, dmg, ...rest) {
    if (e && e.hidden) return false;   // Đao Phủ đang ẩn trước khi hiện thân
    if (e && e.grasp && e.st !== 'dead' && !e.thrown) { e.thrown = true; e.flash = 0.1; return true; }   // đánh trúng Bàn Tay thì nó bị ném về chủ
    return hurt0(g, e, dmg, ...rest);
  };

  // ---------------------------------------------------------------- thiên phú Hư Không 3001-3007
  const R = SK.ROOMS;
  const def = (id, o) => { if (R && R.DEF) R.DEF[id] = Object.assign({ active: true }, o); };
  def(3001, { note: 'Tay không gây 2 sát thương lên Khiên Hư Không (20 lên khiên đỏ) [WIKI buff 3001]' });
  def(3002, { note: 'Miễn sát thương Rãnh Nứt [WIKI buff 3002]' });
  def(3003, { note: 'Hạ hết quái nhỏ thì Tinh Anh Hư Không không bỏ chạy [WIKI buff 3003]' });
  def(3004, { note: 'Khiên Hư Không người chơi 12 tầng [WIKI buff 3004]', apply(p) { p.vsh = p.vsh || { stacks: C2.vshMax, max: C2.vshMax, cd: null, imgCd: 0 }; } });
  def(3005, { note: 'Còn khiên thì bất tử sau khi trúng đòn dài thêm 1 giây [WIKI buff 3005]' });
  def(3006, { note: 'Hồi 3 tầng khiên; mỗi lần tương tác Nhân Vật hỗ trợ hồi 1 tầng [LOC buff 3006]', apply() { V.vshGain(SK.G, C2.supportNow); } });
  def(3007, { note: 'Còn khiên: dùng kỹ năng thì tàng hình + bất tử ngắn và để lại Tàn Tượng đánh bằng vũ khí hiện tại [WIKI buff 3007]' });

  V.EXCLUSIVE = { 2: [3001, 3002, 3003], 3: [3001, 3002, 3003, 3005, 3006, 3007] };
  // Bộ thẻ của Thương Nhân Hư Không: bể thường cộng một thẻ thiên phú riêng của độ (nếu còn); độ 1 không có thiên phú riêng.
  V.offerIds = function (g) {
    const t = g.void.tier;
    if (t < 2 || !R) return undefined;
    const ex = (V.EXCLUSIVE[t] || []).filter(id => R.DEF[id] && !V.has(g, id));
    if (!ex.length) return undefined;
    const base = R.offerIds(Math.max(1, R.buffChoices() - 1));
    base.splice(Math.floor(SK.rand() * (base.length + 1)), 0, SK.pick(ex));
    return base;
  };

  // Khiên Hư Không của người chơi (3004)
  const inv = () => (SK.DS && SK.DS.rules && SK.DS.rules.hurtInvuln) || 0.8;
  V.vshGain = function (g, n) {
    const p = g.player, s = p && p.vsh;
    if (!s || !(n > 0)) return 0;
    const before = s.stacks;
    s.stacks = Math.min(s.max, s.stacks + n);
    if (s.stacks > 0) s.cd = null;
    if (s.stacks > before) SK.num(g, p.x, p.y - 34, '+' + (s.stacks - before) + ' khiên', '#b57bff', false);
    return s.stacks - before;
  };
  const hurt1 = SK.hurtPlayer;
  SK.hurtPlayer = function (g, dmg, ...rest) {
    const v = on(g), p = g.player;
    if (v && v.tier === 2 && !v.riftHit && dmg > 0) dmg += C2.chaoticDmgAdd;   // độ 2: +1 sát thương mọi nguồn trừ Rãnh Nứt
    if (v && p && p.vsh && V.has(g, 3004) && p.st !== 'dead' && !(p.invulT > 0) && dmg > 0 && p.vsh.stacks > 0) {
      const s = p.vsh;
      s.stacks--; s.hits = (s.hits || 0) + 1;
      p.invulT = inv() + (V.has(g, 3005) ? C2.blessExtra : 0);   // 3005: kéo dài khung bất tử
      p.flash = 0.1; g.shake = Math.max(g.shake, 3); g.hurtT = 0.35;
      SK.num(g, p.x, p.y - 26, '-1 khiên', '#b57bff', false);
      if (s.stacks <= 0) s.cd = C2.vshCountdown;   // hết khiên: đếm ngược Hủy Diệt
      SK.emit('voidShieldHurt', g, p, s.stacks);
      return true;
    }
    return hurt1(g, dmg, ...rest);
  };
  function vshTick(g, dt) {
    const p = g.player, s = p && p.vsh;
    if (!s) return;
    if (s.imgCd > 0) s.imgCd -= dt;
    if (s.hideT > 0) { s.hideT -= dt; if (s.hideT <= 0) { p.hidden = false; p._alpha = null; } }
    if (s.cd != null && p.st !== 'dead') {
      s.cd -= dt;
      if (s.cd <= 0) {   // ngã xuống bất kể bất tử
        s.cd = 0; p.god = false; p.hp = 0; p.st = 'dead'; p.stT = 0;
        if (p.skillT > 0) SK.endSkill(g, p);
        g.onPlayerDead();
        SK.emit('voidCountdownDeath', g, p);
      }
    }
  }
  SK.on('voidShieldBreak', g => { if (on(g) && g.player.vsh) V.vshGain(g, C2.vshBreakGain); });
  SK.on('enemyKill', (g, e) => { if (on(g) && e.voidKind === 'voidboss' && e.deadByKill) V.vshGain(g, C2.vshBossGain); });
  SK.on('pickup', (g, kind) => {
    if (!on(g) || !g.player.vsh) return;
    if (/^(hp|en)_pot/.test(kind)) V.vshGain(g, /big|large/.test(kind) ? C2.vshBigPotion : C2.vshPotion);
  });
  // Nhân Vật hỗ trợ (NPC trong ải): 3006 hồi 1 tầng mỗi lần tương tác, tính một lần mỗi NPC mỗi ải
  V.supportUse = function (g, key) {
    const v = g.void;
    if (!V.has(g, 3006) || !g.player.vsh) return 0;
    v.supported = v.supported || {};
    if (v.supported[key]) return 0;
    v.supported[key] = 1;
    return V.vshGain(g, C2.supportEach);
  };
  // 3007: Tàn Tượng
  SK.on('skill', (g, p) => {
    if (!on(g) || !V.has(g, 3007) || !p.vsh || p.vsh.stacks <= 0 || p.vsh.imgCd > 0) return;
    const s = p.vsh, w = p.weapons[p.cur];
    s.imgCd = C2.imgCd; s.hideT = C2.imgHide;
    p.hidden = true; p._alpha = 0.35; p.invulT = Math.max(p.invulT || 0, C2.imgHide);
    const dmg = Math.max(1, Math.round((w && (w.dmg || (w.def && (w.def.damage || w.def.dmg))) || 4)));
    const img = { x: p.x, y: p.y, t: 0, nT: 0, hits: 0, dmg,
      draw(ctx, g2, pr) { ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#b06bff'; ctx.fillRect(pr.x - 5, pr.y - 16, 10, 16); ctx.restore(); },
      update(g2, pr, dt) {
        pr.t += dt; pr.nT -= dt;
        if (pr.nT <= 0) {
          pr.nT = C2.imgEvery;
          let best = null, bd = 110;
          for (const e of g2.enemies) if (e.st !== 'dead' && e.st !== 'spawn' && !e.hidden && e.hp > 0) { const d = Math.hypot(e.x - pr.x, e.y - pr.y); if (d < bd) { bd = d; best = e; } }
          if (best) { pr.hits++; SK.hurtEnemy(g2, best, pr.dmg, false, Math.atan2(best.y - pr.y, best.x - pr.x), 0); }
        }
        if (pr.t >= C2.imgLife) pr.gone = true;
      } };
    g.props.push(img);
    g.void.afterimage = img;
    SK.emit('voidAfterimage', g, img);
  });

  // ---------------------------------------------------------------- vào ải, vào ván, HUD
  SK.on('stageEnter', g => {
    if (!on(g)) return;
    const v = g.void;
    if (g.player) slowEnd(g);   // sang ải mới: trả tốc chạy đã bị làm chậm
    v.circles = []; v.supported = {};
    g.props.push({ x: 0, y: 0, ctl: true, update: (g2, pr, dt) => { circlesTick(g2, dt); slowTick(g2, dt); vshTick(g2, dt); }, draw() {} });
    g.props.push({ x: 0, y: 1e5, circles: true, draw: ctx => {
      for (const c of v.circles) { const a = Math.min(1, c.t / C2.circleWarm); ring(ctx, c.x, c.y, c.r, '#9a4dff', 0.4 + 0.4 * a, 'rgba(120,50,200,' + (0.1 + 0.15 * a) + ')'); }
    } });
    if (v.tier >= 3 && g.stageIdx > 0 && g.player && g.player.vsh) V.vshGain(g, C2.vshStageGain);
  });
  SK.on('runStart', g => {
    if (!on(g) || g.void.tier < 3 || !R) return;
    g.mods = g.mods || {};
    g.mods.buffSlots = (g.mods.buffSlots || 0) + 2;   // hai thiên phú cấp sẵn không chiếm ô
    R.takeBuff(3004); R.takeBuff(3003);
    g.toast('Khiên Hư Không ' + C2.vshMax + ' tầng', 2.5);
  });
  const render1 = SK.hud.render;
  SK.hud.render = function (g) {
    render1(g);
    if (!on(g) || !g.player || !g.map) return;
    const ctx = SK.hudCtx, vw = SK.view, k = vw.scale * vw.dpr, s = g.player.vsh;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (s) SK.text(ctx, 'Khiên Hư Không ' + s.stacks + '/' + s.max + (s.cd != null ? '   Hủy Diệt ' + Math.max(0, s.cd).toFixed(1) + ' giây' : ''), vw.w - 6, 58, 9, s.cd != null ? '#ff6a6a' : '#cfa8ff', 'right', 'rgba(0,0,0,0.9)');
  };
})();
