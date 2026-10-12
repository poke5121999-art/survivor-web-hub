// Đại Đại Chỉ Huy đợt 2 (nạp sau js/troopgc.js): 18 kỹ năng diễn viên. Số theo sao ★1/★2/★3 lấy từ wiki GC_Performers [WIKI GC];
// chỗ wiki không ghi sát thương hoặc thời gian ghi [ƯỚC LƯỢNG]. Đăng ký vào SK.tgc.SKILL[mã]: fn(G, a, rec, d, mục tiêu, rt) trả thời gian
// thi triển (giây) hoặc false; upd/end chạy trong lúc thi triển. NL không hồi khi đang thi triển, hết thì về 0 [WIKI GC "Performers"].
(function () {
  'use strict';
  const SK = window.SK, W = SK.world, U = SK.PPU, Tg = SK.tgc;
  if (!Tg) return;
  const K = () => SK.skillKit, S = Tg.SKILL, rnd = () => SK.rand();
  const i3 = (rec, a, b, c) => [a, b, c][rec.star - 1];
  const foes = (G, x, y, r) => Tg.foesIn(G, x, y, r);
  const ctr = e => K().ec(e);
  const stunFor = (d, base) => base * (1 + d.ctrl);
  const living = G => Tg.stage(G).filter(r => !r.dead);
  const pickFoe = (G, a, r) => { const l = foes(G, a.x, a.y - 7, r); return l.length ? l[Math.floor(rnd() * l.length)] : null; };
  const later = (a, t, fn) => { (a.vq = a.vq || []).push({ t, fn }); a.vq.sort((p, q) => p.t - q.t); };
  const area = (G, a, rec, d, x, y, r, v, o) => {
    o = o || {};
    for (const e of foes(G, x, y, r)) { Tg.skHit(G, a, rec, d, e, v, o.fx === undefined ? 'hit_white' : o.fx); if (o.stun) K().stun(e, o.stun); if (o.debuff) { try { K().debuff(G, e, o.debuff, o.dt ? { t: o.dt } : null); } catch (er) { /* thiếu hiệu ứng thì bỏ */ } } }
    SK.fx(G, 'ring', x, y - 2, { dur: 0.3, color: o.color || '#ffd84a' });
  };
  // đặt chân gần một điểm (không vào tường)
  const blink = (G, a, x, y) => { if (!W.solidAt(G.map, x, y)) { a.x = x; a.y = y; return true; } return false; };

  // 1. Mở Hết Hỏa Lực (Thao Thiết): cầm hai vũ khí 5 s, vũ khí chép nhận 100% / 130% / 160% sát thương
  S.dual = { fn(G, a, rec) { a.dualT = 5; a.dualMul = i3(rec, 1, 1.3, 1.6); return 5; } };

  // 2. Mưa Tên (Tất Phương): 11/10/10 sát thương vùng, 1/1/2 loạt, 4/6/6 tên mỗi loạt; vùng nổ theo cỡ đạn
  S.arrow = { fn(G, a, rec, d, tg) {
    const V = i3(rec, 1, 1, 2) + Math.floor(d.combo), A = i3(rec, 4, 6, 6) + Math.floor(d.split), v = i3(rec, 11, 10, 10);
    for (let k = 0; k < V; k++) later(a, 0.2 + 0.45 * k, () => {
      const e = tg.st === 'dead' ? pickFoe(G, a, 20 * U) : tg; if (!e) return;
      const [ex, ey] = ctr(e);
      for (let j = 0; j < A; j++) {
        const x = ex + (rnd() - 0.5) * 50, y = ey + (rnd() - 0.5) * 34;
        Tg.line(G, x, y - 70, x, y, '#cfe8ff', 0.2);
        later(a, 0.15, () => area(G, a, rec, d, x, y, 12 * (1 + d.bsize), v, { fx: 'hit_blue', color: '#cfe8ff' }));
      }
    });
    return 0.5 + 0.45 * V;
  } };

  // 3. Bình Thuốc Nguyên Tố (Ngao Nhân): ném bình khí độc / lửa / băng tạo vòng nguyên tố; có tỉ lệ độc/cháy/đóng băng 0,4/0,5/0,75 s
  S.potion = { fn(G, a, rec, d, tg) {
    const kind = SK.pick(['poison', 'fire', 'ice']), [ex, ey] = ctr(tg), R = 26 * (1 + d.bsize), dt = i3(rec, 0.4, 0.5, 0.75) * (1 + d.ctrl);
    const col = kind === 'fire' ? '#ff8a3a' : kind === 'ice' ? '#7fd3ff' : '#7bd36a';
    const z = { x: ex, y: ey, t: 0, acc: 0 };
    G.props.push({ tg2: 1, x: ex, y: ey, update(G2, pr, dtt) {
      z.t += dtt; z.acc += dtt;
      if (z.acc >= 0.5) { z.acc -= 0.5; for (const e of foes(G2, z.x, z.y, R)) { Tg.skHit(G2, a, rec, d, e, 3, 'hit_white'); if (rnd() < 0.6) { try { K().debuff(G2, e, kind, { t: Math.max(dt, kind === 'ice' ? 0.5 : dt) }); } catch (er) { /* bỏ */ } } } }
      if (z.t >= 3) pr.gone = true;
    }, draw(ctx) { const k = Math.min(1, (3 - z.t) / 0.4); ctx.save(); ctx.globalAlpha = 0.35 * k; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(z.x, z.y, R, R * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } });
    return 0.8;
  } };

  // 4. Sói Băng Lửa (Bạch Trạch): bầy sói đánh 10/15/100 sát thương mỗi nhát trong 5 s, bạo phát nguyên tố: hồi máu, vòng băng đóng băng 0,5/0,75/1,25 s
  S.wolf = { fn(G, a, rec) { a.wolfT = 5; return 5; },
    upd(G, a, rec, d, dt, c) {
      c.acc = (c.acc || 0) + dt; c.ring = (c.ring || 0) + dt;
      const v = i3(rec, 10, 15, 100);
      if (c.acc >= 0.45) { c.acc = 0; const e = Tg.nearestFoe(G, a.x, a.y - 7, 14 * U); if (e) { Tg.skHit(G, a, rec, d, e, v, 'hit_white'); rec.hp = Math.min(d.hp, rec.hp + d.hp * 0.01); } }
      if (c.ring >= 1.2) { c.ring = 0; const e = Tg.nearestFoe(G, a.x, a.y - 7, 14 * U); if (e) { const [ex, ey] = ctr(e); area(G, a, rec, d, ex, ey, 22 * (1 + d.bsize), v * 0.5, { debuff: 'ice', dt: i3(rec, 0.5, 0.75, 1.25) * (1 + d.ctrl), color: '#7fd3ff', fx: 'hit_blue' }); } }
    } };

  // 5. Xung Điện (Tượng Moai): 10 xung, mỗi xung 12/18/24 sát thương và choáng 0,5 s; phá đạn địch trong vùng
  S.emp = { fn(G, a, rec, d) {
    const n = 10 + Math.floor(d.split);
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - a.x, b.y - a.y) < 12 * U) b.dead = true;
    for (let k = 0; k < n; k++) later(a, 0.04 * k, () => { const e = pickFoe(G, a, 12 * U); if (!e) return; Tg.skHit(G, a, rec, d, e, i3(rec, 12, 18, 24), 'hit_blue'); K().stun(e, stunFor(d, 0.5)); const [ex, ey] = ctr(e); Tg.line(G, a.x, a.y - 8, ex, ey, '#7fe0ff', 0.15); });
    SK.fx(G, 'ring', a.x, a.y - 6, { dur: 0.4, color: '#7fe0ff' });
    return 0.8;
  } };

  // 6. Cầu Nguyện (Phi Thiên): cả đội +1/2/4 giáp, +2/4/8 máu, tốc chạy +15/20/25% trong 3 s
  S.pray = { fn(G, a, rec) {
    for (const r of living(G)) {
      const d2 = Tg.stat(G, r), q = Tg.allyOf(G, r); if (!q) continue;
      r.armor = Math.min(d2.armor, r.armor + i3(rec, 1, 2, 4)); r.hp = Math.min(d2.hp, r.hp + i3(rec, 2, 4, 8));
      q.praiseT = 3; q.praiseV = i3(rec, 0.15, 0.2, 0.25); SK.num(G, q.x, q.y - 24, '+' + i3(rec, 2, 4, 8), '#6cff8a');
    }
    return 1;
  } };

  // 7. Nuốt Chửng (Thần Gấu Gió Bắc): nuốt địch gần để hồi máu và cộng dồn công tốc, máu, cỡ đạn (tối đa 5/5/10 tầng) [sát thương nuốt: ƯỚC LƯỢNG]
  S.devour = { fn(G, a, rec, d, tg) {
    const e = Tg.nearestFoe(G, a.x, a.y - 7, 8 * U); if (!e) return false;
    const cap = 60 * rec.star, before = Tg.stat(G, rec).hp, hpBefore = e.hp;
    Tg.skHit(G, a, rec, d, e, e.boss ? cap * 0.5 : cap, 'hit_white');
    const maxS = i3(rec, 5, 5, 10);
    if (e.hp <= 0 || e.st === 'dead' || hpBefore <= cap) { rec.devour = Math.min(maxS, (rec.devour || 0) + 1); }
    rec.d = null; const after = Tg.stat(G, rec).hp; rec.hp = Math.min(after, rec.hp + (after - before) + after * 0.2);
    SK.num(G, a.x, a.y - 26, 'Nuốt ' + (rec.devour || 0), '#ffb04a');
    return 1;
  } };

  // 8. Kiếm Khai Thiên (Makisenro): 1/1/2 kiếm bay tới các địch khác nhau, 6/12/36 sát thương dọc đường + sét 8/16/20 gây choáng
  S.swords = { fn(G, a, rec, d, tg) {
    const n = i3(rec, 1, 1, 2) + Math.floor(d.split), es = foes(G, a.x, a.y - 7, 16 * U).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
    if (!es.length) es.push(tg);
    for (let k = 0; k < n; k++) {
      const e = es[k % es.length], [ex, ey] = ctr(e), x0 = a.x, y0 = a.y - 8;
      Tg.line(G, x0, y0, ex, ey, '#e8d27a', 0.3);
      const L = Math.hypot(ex - x0, ey - y0) || 1, ux = (ex - x0) / L, uy = (ey - y0) / L;
      for (const q of G.enemies) {
        if (q.st === 'dead' || q.st === 'spawn') continue; const [qx, qy] = ctr(q), t = Math.max(0, Math.min(L, (qx - x0) * ux + (qy - y0) * uy));
        if (Math.hypot(x0 + ux * t - qx, y0 + uy * t - qy) < 10) Tg.skHit(G, a, rec, d, q, i3(rec, 6, 12, 36), 'hit_white');
      }
      for (let j = 0; j < 3; j++) { const q = pickFoe(G, a, 16 * U) || e; const [qx, qy] = ctr(q); Tg.line(G, qx, qy - 60, qx, qy, '#fff08a', 0.2); Tg.skHit(G, a, rec, d, q, i3(rec, 8, 16, 20), 'hit_blue'); K().stun(q, stunFor(d, 0.5)); }
    }
    return 1;
  } };

  // 9. Khiên Năng Lượng (Trư Ngộ Năng): hút mọi sát thương 1,5/2,5/4 s, mỗi lần hút hồi 2/3/5 NL cho đồng đội
  S.shield = { fn(G, a, rec) { a.shieldT = i3(rec, 1.5, 2.5, 4); a.shieldGain = i3(rec, 2, 3, 5); return a.shieldT; } };

  // 10. Bão Lửa (Khổng Tước Công Chúa): 2/3/4 cầu lửa quét sân, mỗi quả 6/8/10 sát thương nguyên tố và gây cháy
  S.fire = { fn(G, a, rec, d) {
    const n = i3(rec, 2, 3, 4) + Math.floor(d.combo);
    for (let k = 0; k < n; k++) later(a, 0.25 * k, () => {
      const e = pickFoe(G, a, 18 * U); if (!e) return; const [ex, ey] = ctr(e);
      Tg.line(G, a.x, a.y - 8, ex, ey, '#ff8a3a', 0.2);
      area(G, a, rec, d, ex, ey, 16 * (1 + d.bsize), i3(rec, 6, 8, 10), { debuff: 'fire', color: '#ff8a3a', fx: 'hit_white' });
    });
    return 0.25 * n + 0.2;
  } };

  // 11. Bạt Đao Trảm (Ngọc Long): lao chém 1/2/3 lần, mỗi lần 1/1/2 nhát, mỗi nhát 16/20/24 sát thương
  S.iaido = { lockMove: true, fn(G, a, rec, d) {
    const D = i3(rec, 1, 2, 3) + Math.floor(d.combo), Sl = i3(rec, 1, 1, 2) + Math.floor(d.split), v = i3(rec, 16, 20, 24);
    for (let k = 0; k < D; k++) later(a, 0.05 + 0.32 * k, () => {
      const e = pickFoe(G, a, 16 * U); if (!e) return; const [ex, ey] = ctr(e);
      blink(G, a, ex - a.face * 8, e.y); a.face = ex >= a.x ? 1 : -1;
      for (let j = 0; j < Sl; j++) later(a, 0.08 * j, () => area(G, a, rec, d, a.x + a.face * 8, a.y - 6, 18 * (1 + d.bsize), v, { fx: 'hit_white' }));
    });
    return 0.32 * D + 0.25;
  } };

  // 12. Tàng Hình (Lục Nhĩ Mị Hầu): 2 s không chịu sát thương, tỉ lệ bạo +100%; không tăng theo sao [WIKI]
  S.stealth = { fn(G, a) { a.invT = 2; a.critT = 2; return 2; } };

  // 13. Bão Sâu Cát (Thỏ Ngọc): gọi thỏ chui lên liên tục, mỗi lần 1/2/4 thỏ, 16/20/24 sát thương [thời gian 4 s: ƯỚC LƯỢNG]
  S.rabbits = { fn() { return 4; },
    upd(G, a, rec, d, dt, c) {
      c.acc = (c.acc || 0) + dt; if (c.acc < 0.5) return; c.acc = 0;
      const n = i3(rec, 1, 2, 4) + Math.floor(d.split);
      for (let k = 0; k < n; k++) { const e = pickFoe(G, a, 14 * U); const x = e ? ctr(e)[0] + (rnd() - 0.5) * 12 : a.x + (rnd() - 0.5) * 60, y = e ? e.y : a.y + (rnd() - 0.5) * 40; area(G, a, rec, d, x, y, 12 * (1 + d.bsize), i3(rec, 16, 20, 24), { fx: 'hit_white', color: '#d9b88a' }); }
    } };

  // 14. Bầy Dơi (Tư Mã Ý): thả 10/12/18 con dơi đánh địch và hút máu [sát thương mỗi con: ƯỚC LƯỢNG]
  S.bats = { fn(G, a, rec, d) {
    const n = i3(rec, 10, 12, 18) + Math.floor(d.split);
    for (let k = 0; k < n; k++) later(a, 0.05 * k, () => { const e = pickFoe(G, a, 14 * U); if (!e) return; Tg.skHit(G, a, rec, d, e, 4, 'hit_white'); rec.hp = Math.min(d.hp, rec.hp + 0.4); const [ex, ey] = ctr(e); Tg.line(G, a.x, a.y - 8, ex, ey, '#7a2a8a', 0.15); });
    return 0.05 * n + 0.3;
  } };

  // 15. Cuồng Phong Kiếm (Tôn Thượng Hương): lao tới chém 8 nhát rồi lùi lại, không chịu sát thương khi chém; không tăng theo sao [WIKI; sát thương nhát: ƯỚC LƯỢNG]
  S.tempest = { lockMove: true, fn(G, a, rec, d, tg) {
    const [ex, ey] = ctr(tg); a.o = { x: a.x, y: a.y }; a.invT = 8 * 0.12 + 0.3; blink(G, a, ex - a.face * 8, tg.y);
    for (let k = 0; k < 8; k++) later(a, 0.12 * (k + 1), () => area(G, a, rec, d, a.x + a.face * 8, a.y - 6, 18 * (1 + d.bsize), 6, { fx: 'hit_white', color: '#ff8a3a' }));
    return 8 * 0.12 + 0.2;
  }, end(G, a) { if (a.o) { blink(G, a, a.o.x, a.o.y); a.o = null; } } };

  // 16. Long Trụy (Triệu Vân): nhảy tới địch, 30/60/120 sát thương lên mục tiêu và 10/20/40 lên địch quanh; hạ mục tiêu thì đầy NL
  S.lance = { fn(G, a, rec, d, tg) {
    const e = Tg.nearestFoe(G, a.x, a.y - 7, 20 * U) || tg; const [ex, ey] = ctr(e);
    blink(G, a, ex - a.face * 8, e.y); a.face = ex >= a.x ? 1 : -1;
    Tg.skHit(G, a, rec, d, e, i3(rec, 30, 60, 120), 'hit_white');
    const killed = e.hp <= 0 || e.st === 'dead';
    for (const q of foes(G, ex, ey, 24 * (1 + d.bsize))) if (q !== e) Tg.skHit(G, a, rec, d, q, i3(rec, 10, 20, 40), 'hit_white');
    SK.fx(G, 'ring', ex, ey - 2, { dur: 0.35, color: '#cfe8ff' });
    if (killed) a.refill = true;
    return 0.5;
  } };

  // 17. Tự Do Chiến (Quan Vũ): 2/2,5/3 s đạn của vũ khí phân tán, mỗi đòn thêm 1/2/3 luồng
  S.scatter = { fn(G, a, rec) { a.scatterT = i3(rec, 2, 2.5, 3); a.scatterN = i3(rec, 1, 2, 3); return a.scatterT; } };

  // 18. Đá Báo Điềm (Điêu Thuyền): đá rơi vùng rộng, 20/80/333 sát thương nguyên tố và choáng 0,5/0,75/1 s
  S.omen = { fn(G, a, rec, d, tg) {
    const es = foes(G, a.x, a.y - 7, 18 * U); let best = tg, bn = -1;
    for (const e of es) { const n = es.filter(q => Math.hypot(q.x - e.x, q.y - e.y) < 40).length; if (n > bn) { bn = n; best = e; } }
    const [ex, ey] = ctr(best);
    Tg.line(G, ex, ey - 80, ex, ey, '#b05cf0', 0.3);
    later(a, 0.3, () => area(G, a, rec, d, ex, ey, 40 * (1 + d.bsize), i3(rec, 20, 80, 333), { stun: stunFor(d, i3(rec, 0.5, 0.75, 1)), fx: 'hit_blue', color: '#b05cf0' }));
    return 1;
  } };
})();
