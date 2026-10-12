// Thần Khí Lục Địa Cổ, đợt 2 (js/artifacts.js là lõi): Thần Uy 12 loại, Bà Lão Ngàn Tuổi (tiến cấp / tăng cấp / đúc lại), bảng chọn bậc Dũng Sĩ, HUD,
// đá quý cuối ván. Nguồn: [ĐO cfg] artifact_mode_config.asset; [WIKI SW] Sacred_Weapons_of_the_Old_Continent; [LOC] artifact/*; số khác [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, W = SK.world, A = SK.artifacts;
  if (!A) return;
  const C = A.C, DATA = A.DATA;
  const on = A.on, alive = A.alive, eMid = A.eMid, say = A.say;

  // ---------------------------------------------------------------- Thần Uy [WIKI SW "God's wrath"; LOC artifact/pwr_*]
  // Tên + mô tả: [LOC pwr_<khoá>, pwr_<khoá>_desc]. Con số lấy từ wiki (7 sao băng, 9 lốc xoáy, 6 bão táp, 80 hủy diệt, 35-50 cầu sét);
  // thời lượng, nhịp và bán kính [ƯỚC LƯỢNG].
  const WN = {
    fff: ['Sao Băng Lửa', 'Triệu hồi ở gần địch 1 trận mưa sao băng liên tục tấn công địch'],
    ffw: ['Lan Rộng', 'Địch bị tấn công đi đến đâu lửa cháy đến đó'],
    fft: ['Sao Mới', 'Thi triển 1 trận đạn phép thuật có thể xuyên qua địch và thiêu đốt địch'],
    www: ['Lốc Xoáy', 'Triệu hồi 1 Gió Xoáy, liên tục hút địch và gây DMG'],
    wwt: ['Bão Táp', 'Bắn ra xung quanh nhiều nhóm Sóng Xung Kích'],
    wwf: ['Khí Nổ', 'Lấy bản thân làm trung tâm bắn ra xung quanh khí nổ cực nhanh, đẩy lùi tất cả địch và gây DMG mạnh và khiến địch choáng'],
    ttt: ['Nhóm Hạt Căn Bản', 'Triệu hồi 1 Nhóm Hạt Căn Bản, bắn Sấm Chớp tấn công'],
    ttw: ['Cầu Sấm Chớp', 'Phóng 2 cầu sáng di chuyển nhanh va đập kẻ địch'],
    ttf: ['Hủy Diệt', 'Sấm Chớp oanh tạc tất cả địch và gây nổ 1 lần, để lại khu vực lửa cháy'],
    sword: ['Loạn Vũ', 'Tấn công nhanh xung quanh và phóng lượng lớn kiếm khí'],
    bow: ['Chí Mạng', 'Tấn công sẽ tạo một luồng Sóng Xung Kích'],
    staff: ['Năng Lượng Huyền Bí', 'Trong thời gian ngắn DMG tăng gấp đôi, vũ khí tiêu hao còn 0']
  };
  A.WRATH_NAMES = WN;
  const MIX = { FFW: 'ffw', FFT: 'fft', WWF: 'wwf', WWT: 'wwt', TTF: 'ttf', TTW: 'ttw' };
  // Ghép loại Thần Uy từ nguyên tố ba bộ phận: 3 giống nhau, 2+1, hoặc 3 khác nhau = loại gốc của vũ khí; thứ tự không ảnh hưởng [WIKI SW]
  A.wrathOf = function (els, cat) {
    const n = { F: 0, W: 0, T: 0 }; for (const e of els) n[e]++;
    for (const k of ['F', 'W', 'T']) if (n[k] === 3) return { F: 'fff', W: 'www', T: 'ttt' }[k];
    for (const k of ['F', 'W', 'T']) if (n[k] === 2) { const o = ['F', 'W', 'T'].find(q => n[q] === 1); return MIX[k + k + o]; }
    return cat;
  };
  A.currentWrath = G => { const a = G.artifacts; return A.wrathOf(a.parts.map(p => p ? p.el : 'F'), a.cat || 'sword'); };
  A.wrathName = k => WN[k][0];

  const ent = (G, o) => { const e = Object.assign({ t: 0, life: 1, x: 0, y: 0, draw() {} }, o); e.update = (g2, pr, dt) => { pr.t += dt; if (pr.t >= pr.life) { pr.gone = true; if (pr.end) pr.end(g2, pr); return; } if (pr.tick) pr.tick(g2, pr, dt); }; G.props.push(e); return e; };
  const hit = (G, e, d, ang, o) => A.hitE(G, e, d, ang, Object.assign({ noProc: true, noCharge: true, crit: false, repel: 1 }, o));
  const inR = (G, x, y, r, fn) => { for (const e of G.enemies) { if (!alive(e)) continue; const [ex, ey] = eMid(e); if (Math.hypot(ex - x, ey - y) < r + e.r) fn(e, ex, ey); } };
  const vis = G => G.enemies.filter(e => { if (!alive(e)) return false; const p = G.player, [ex, ey] = eMid(e); return Math.hypot(ex - p.x, ey - p.y) < 230 && W.los(G.map, p.x, p.y - 6, ex, ey); });
  const meteor = (G, x, y, dmg) => ent(G, { x, y, life: 0.4, dmg, draw(ctx, g2, pr) { const k = pr.t / pr.life; ctx.fillStyle = '#ff7a3a'; ctx.beginPath(); ctx.arc(pr.x + 20 * (1 - k), pr.y - 90 * (1 - k), 3, 0, 6.28); ctx.fill(); }, end(g2, pr) { A.blast(g2, pr.x, pr.y, 24, pr.dmg, { col: '#ff7a3a', noCharge: true }); } });

  const WR = {
    fff: { dur: 5, tick(G, w, dt) { w.k = (w.k || 0) + dt; if (w.k >= 0.22 - 0.1 * (w.t / w.dur)) { w.k = 0; const t = SK.pick(vis(G).concat(G.enemies.filter(alive).slice(0, 3))); if (t) { const [x, y] = eMid(t); meteor(G, x + SK.randf(-14, 14), y + SK.randf(-10, 10), 7); } } } },   // 7 sát thương mỗi sao băng [WIKI SW]
    ffw: { dur: 8, tick(G, w, dt) { w.k = (w.k || 0) + dt; if (w.k >= 0.4) { w.k = 0; for (const e of G.enemies) { if (!alive(e) || !e._atf || !e._atf.burn) continue; const [ex, ey] = eMid(e); inR(G, ex, ey, 20, q => A.status(G, q, 'burn')); } } } },
    fft: { dur: 0.1, start(G, w) { const p = G.player; for (let i = 0; i < 12; i++) A.shot(G, { x: p.x, y: p.y - 8, ang: i * Math.PI / 6, spd: 150, dmg: 6, r: 4, life: 1.1, pierce: 999, wall: true, ret: 0.55, col: '#ff8a3a', noCharge: true, noProc: true, noSize: true, burn: true }); } },
    www: { dur: 10, start(G, w) { const p = G.player; w.tx = p.x + 30; w.ty = p.y; w.ang = SK.rand() * 6.28; w.k = 0; }, tick(G, w, dt) {
      w.ang += SK.randf(-1.5, 1.5) * dt; const nx = w.tx + Math.cos(w.ang) * 24 * dt, ny = w.ty + Math.sin(w.ang) * 24 * dt;
      if (W.solidAt(G.map, nx, ny + 6)) w.ang += Math.PI * 0.7; else { w.tx = nx; w.ty = ny; }
      w.k += dt; inR(G, w.tx, w.ty, 55, (e, ex, ey) => { const d = Math.hypot(w.tx - ex, w.ty - ey) || 1; e.kx = (e.kx || 0) + (w.tx - ex) / d * 140 * dt; e.ky = (e.ky || 0) + (w.ty - ey) / d * 140 * dt; });
      if (w.k >= 0.5) { w.k = 0; inR(G, w.tx, w.ty, 22, e => hit(G, e, 9, 0)); } },   // hút và 9 sát thương [WIKI SW]
      draw(ctx, G, w) { ctx.strokeStyle = 'rgba(190,230,255,0.8)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(w.tx, w.ty - i * 5, 6 + i * 3, 3, 0, 0, 6.28); ctx.stroke(); } } },
    wwt: { dur: 4, tick(G, w, dt) { w.k = (w.k || 0) + dt; if (w.k >= 0.28) { w.k = 0; const p = G.player, t = SK.pick(vis(G)), [bx, by] = t ? eMid(t) : [p.x, p.y - 4], j = t ? 8 : 24, x = bx + SK.randf(-j, j), y = by + SK.randf(-j, j);   // lốc đứng yên rải quanh người, ưu tiên chỗ có quái: bán kính hút chỉ 12 nên đặt sát chân người thì quái cách vài chục px không bao giờ trúng
      ent(G, { x, y, life: 4, tk: 0, tick(g2, pr, d2) { pr.tk += d2; if (pr.tk >= 0.45) { pr.tk = 0; inR(g2, pr.x, pr.y, 12, e => hit(g2, e, 6, 0)); } }, draw(ctx, g2, pr) { ctx.strokeStyle = 'rgba(160,230,255,0.7)'; ctx.beginPath(); ctx.ellipse(pr.x, pr.y, 8, 4, g2.t * 6, 0, 6.28); ctx.stroke(); } }); } } },
    wwf: { dur: 1.4, tick(G, w, dt) { const p = G.player; if (w.t < 1 || w.done) return; w.done = true; const r = 84; inR(G, p.x, p.y - 8, r, (e, ex, ey) => { hit(G, e, 14, Math.atan2(ey - p.y, ex - p.x), { repel: 8 }); A.status(G, e, 'slow'); });
      ent(G, { x: p.x, y: p.y - 8, life: 0.4, draw(ctx, g2, pr) { const k = pr.t / pr.life; ctx.strokeStyle = 'rgba(210,245,255,' + (1 - k) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pr.x, pr.y, r * k, 0, 6.28); ctx.stroke(); } }); },
      draw(ctx, G, w) { if (w.t < 1) { const p = G.player; ctx.strokeStyle = 'rgba(210,245,255,0.7)'; ctx.beginPath(); ctx.arc(p.x, p.y - 8, 8 + 30 * w.t, 0, 6.28); ctx.stroke(); } } },
    ttt: { dur: 7, start(G, w) { w.pt = [0, 1, 2, 3].map(i => ({ x: G.player.x, y: G.player.y - 10, st: 0, cd: 0.4 * i, ang: i * 1.57 })); }, tick(G, w, dt) { const p = G.player;
      for (const q of w.pt) { q.cd -= dt;
        if (q.tg && alive(q.tg)) { const [ex, ey] = eMid(q.tg), d = Math.hypot(ex - q.x, ey - q.y) || 1, s = Math.min(d, 230 * dt); q.x += (ex - q.x) / d * s; q.y += (ey - q.y) / d * s; if (d < 8) { hit(G, q.tg, 4, 0); q.tg = null; q.cd = 0.5; } }
        else { q.ang += 3 * dt; q.x += (p.x + Math.cos(q.ang) * 16 - q.x) * Math.min(1, 6 * dt); q.y += (p.y - 10 + Math.sin(q.ang) * 16 - q.y) * Math.min(1, 6 * dt); if (q.cd <= 0) q.tg = A.nearest(G, q.x, q.y, 150); } } },
      draw(ctx, G, w) { ctx.fillStyle = '#ffe85a'; for (const q of w.pt) { ctx.beginPath(); ctx.arc(q.x, q.y, 2.5, 0, 6.28); ctx.fill(); } } },
    ttw: { dur: 0.1, start(G, w) { const p = G.player; for (let i = -1; i <= 1; i++) A.shot(G, { x: p.x, y: p.y - 8, ang: p.aim + i * 0.25, spd: 150, dmg: SK.randi(35, 50), r: 6, life: 8, pierce: 9999, bounce: 99, col: '#ffe85a', noCharge: true, noProc: true, noSize: true, wall: false }); } },   // 35-50 sát thương, nảy tường [WIKI SW]
    ttf: { dur: 1.6, start(G, w) { w.tg = vis(G).slice(0, 14); w.fired = false; }, tick(G, w) { if (w.t < 1.2 || w.fired) return; w.fired = true;
      const list = w.tg.filter(alive); const bolts = list.length === 1 ? 4 : 1;
      for (const e of list) { const [ex, ey] = eMid(e); for (let i = 0; i < bolts; i++) ent(G, { x: ex, y: ey, life: 0.01 + i * 0.12, end(g2, pr) { A.blast(g2, pr.x, pr.y, 16, 80, { col: '#fff27a', noCharge: true }); } });   // 80 sát thương mỗi tia [WIKI SW]
        ent(G, { x: ex, y: ey, life: 3, tk: 0, tick(g2, pr, d2) { pr.tk += d2; if (pr.tk >= 0.5) { pr.tk = 0; inR(g2, pr.x, pr.y, 14, q => hit(g2, q, 3, 0, { repel: 0 })); } }, draw(ctx, g2, pr) { ctx.fillStyle = 'rgba(255,120,40,0.35)'; ctx.beginPath(); ctx.ellipse(pr.x, pr.y + 4, 14, 8, 0, 0, 6.28); ctx.fill(); } }); } },
      draw(ctx, G, w) { if (w.fired) return; for (const e of w.tg) if (alive(e)) { const [ex, ey] = eMid(e); ctx.strokeStyle = 'rgba(255,240,90,' + (0.3 + 0.5 * Math.sin(w.t * 14)) + ')'; ctx.beginPath(); ctx.arc(ex, ey, 10, 0, 6.28); ctx.stroke(); } } },
    sword: { dur: 5, tick(G, w, dt) { const p = G.player, s = A.weaponStats(G); w.k = (w.k || 0) + dt; if (w.k >= 0.1) { w.k = 0; inR(G, p.x, p.y - 8, 30, (e, ex, ey) => hit(G, e, Math.max(1, Math.round(s.atk * 0.25)), Math.atan2(ey - p.y, ex - p.x)));
      for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - p.x, b.y - p.y + 8) < 30) b.dead = true;
      A.shot(G, { x: p.x, y: p.y - 8, ang: SK.rand() * 6.28, spd: 150, dmg: Math.max(1, Math.round(s.atk * 0.3)), r: 3, life: 0.7, col: '#e8f4ff', noCharge: true, noProc: true }); } },
      draw(ctx, G, w) { const p = G.player; ctx.strokeStyle = 'rgba(230,245,255,0.7)'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p.x, p.y - 8, 24 + (G.t * 40 + i * 4) % 8, G.t * 12 + i * 2, G.t * 12 + i * 2 + 1.6); ctx.stroke(); } } },
    bow: { dur: 6, tick() { } },    // mỗi mũi tên thêm một luồng gió xuyên: xử lý ở sự kiện artifactFire
    staff: { dur: 6, start(G, w) { const p = G.player; w.dm = p.dmgMul == null ? 1 : p.dmgMul; p.dmgMul = w.dm * 2; }, end(G, w) { const p = G.player; p.dmgMul = (p.dmgMul || 2) / 2; } }   // DMG gấp đôi, tốn 0 năng lượng [LOC pwr_staff_desc]
  };
  A.WR = WR;
  A.castWrath = function (G) {
    const a = G.artifacts, w = a.wrath;
    if (!on(G) || G.player.st === 'dead' || w.active || w.e < C.rechargeFull - 1e-6) return false;
    const kind = A.currentWrath(G), D0 = WR[kind];
    w.e = 0; w.active = { kind, t: 0, dur: D0.dur * (1 + ((a.ag && a.ag.wrathpow) || 0) / 100) }; w.used[kind] = 1; a.stats.wraths++;
    say(G, 'Thần Uy: ' + WN[kind][0], 2.2);
    if (D0.start) D0.start(G, w.active);
    SK.emit('artifactWrath', G, kind);
    return true;
  };
  A.tickWrath = function (G, dt) {
    const a = G.artifacts, w = a.wrath.active; if (!w) return;
    w.t += dt;
    const D0 = WR[w.kind];
    if (D0.tick) D0.tick(G, w, dt);
    if (w.t >= w.dur) { if (D0.end) D0.end(G, w); a.wrath.active = null; a.wrath.last = w.kind; }
  };
  A.drawWrath = function (ctx, G) { const w = G.artifacts.wrath.active; if (w && WR[w.kind].draw) WR[w.kind].draw(ctx, G, w); };
  // Cung Chí Mạng: mỗi mũi tên kèm một luồng gió xuyên [LOC pwr_bow_desc]; Gậy Huyền Bí: không tốn năng lượng
  SK.on('artifactFire', (G, cat) => {
    const a = G.artifacts, w = a.wrath.active, p = G.player; if (!w) return;
    if (w.kind === 'bow') A.shot(G, { x: p.x, y: p.y - 8, ang: p.aim, spd: 170, dmg: Math.max(1, Math.round(A.weaponStats(G).atk * 0.8)), r: 8, life: 0.7, pierce: 999, wall: true, col: 'rgba(200,240,255,0.8)', noCharge: true, noProc: true, noSize: true });
    if (w.kind === 'staff') { p.energy = Math.min(p.energyMax, p.energy + A.weaponStats(G).cost); }
  });

  // ---------------------------------------------------------------- Bà Lão Ngàn Tuổi: tiến cấp bộ phận / tăng cấp thuộc tính / đúc lại [WIKI SW "Between levels"; ĐO cfg]
  A.upgradePart = function (G, slot) {
    const a = G.artifacts, p = G.player, q = a.parts[slot];
    if (!q) return { ok: false, why: 'không có bộ phận' };
    if (q.rar >= C.maxRarity) return { ok: false, why: q.rar >= 5 ? 'bộ phận Đỏ không tiến cấp được' : 'đã đạt phẩm chất cao nhất' };
    const cost = C.upCost[q.rar];
    if (p.gold < cost) return { ok: false, why: 'thiếu vàng', cost };
    p.gold -= cost; a.stats.spent += cost;
    const prob = Math.min(100, C.upProb[q.rar] + C.upInc[q.rar] * q.fails), roll = SK.randi(0, 99);
    if (roll < prob) {
      q.rar++; q.fails = 0;
      const t = SK.randi(0, Math.min(q.rar, 4)), existing = q.mods;
      const pool = A.MODS.filter(m => m.v[t] != null && !existing.some(e => e.id === m.id));
      if (existing.length < C.modCount[q.rar] && pool.length) existing.push({ id: SK.pick(pool).id, t });
      A.recalc(G); SK.emit('artifactUpgrade', G, q);
      return { ok: true, success: true, cost, prob, rar: q.rar };
    }
    q.fails++;
    return { ok: true, success: false, cost, prob, fails: q.fails };
  };
  A.upgradeMod = function (G, slot, i) {
    const a = G.artifacts, p = G.player, q = a.parts[slot], m = q && q.mods[i];
    if (!m) return { ok: false, why: 'không có thuộc tính' };
    const cap = Math.min(q.rar, 4), D0 = A.MODS.find(x => x.id === m.id);
    if (m.t >= 5 || m.t >= cap || !D0 || D0.v[m.t + 1] == null) return { ok: false, why: 'thuộc tính đã đạt phẩm chất bộ phận' };
    const cost = C.compUpCost[m.t];
    if (p.gold < cost) return { ok: false, why: 'thiếu vàng', cost };
    p.gold -= cost; a.stats.spent += cost; m.t++; A.recalc(G);
    return { ok: true, cost, t: m.t };
  };
  A.reforgeMod = function (G, slot, i) {
    const a = G.artifacts, p = G.player, q = a.parts[slot], m = q && q.mods[i];
    if (!m) return { ok: false, why: 'không có thuộc tính' };
    if (a.reforge >= C.refreshLimit) return { ok: false, why: 'hết lượt đúc lại ở ải này' };
    const cost = C.refreshCost[a.reforge];
    if (p.gold < cost) return { ok: false, why: 'thiếu vàng', cost };
    const pool = m.t >= 5 ? A.LEG.filter(x => x.id !== m.id) : A.MODS.filter(x => x.v[m.t] != null && !q.mods.some(e => e.id === x.id));
    if (!pool.length) return { ok: false, why: 'không có thuộc tính khác' };
    p.gold -= cost; a.stats.spent += cost; a.reforge++;
    m.id = SK.pick(pool).id; A.recalc(G); SK.emit('artifactReforge', G, q);
    return { ok: true, cost, id: m.id };
  };

  // ---------------------------------------------------------------- giao diện DOM (Bà Lão, bậc Dũng Sĩ)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function box() {
    let el = document.getElementById('atf-ui');
    if (!el) {
      el = document.createElement('div'); el.id = 'atf-ui';
      el.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(5,10,20,.55);font-family:"VT323",ui-monospace,monospace;color:#e8eef8';
      document.body.appendChild(el);
    }
    return el;
  }
  A.closeUi = () => { const el = document.getElementById('atf-ui'); if (el) el.remove(); const G = SK.G; if (G) G.hold = false; };
  const css = 'background:#1c2a3c;border:2px solid #5a7aa0;border-radius:6px;padding:14px 18px;max-width:760px;max-height:92vh;overflow:auto;font-size:19px;line-height:1.25';
  const btn = (id, label, dis) => '<button data-a="' + id + '" ' + (dis ? 'disabled' : '') + ' style="font:inherit;margin:2px 4px 2px 0;padding:2px 9px;background:' + (dis ? '#3a4452' : '#2f6a4a') + ';color:#fff;border:1px solid #8fd0a8;border-radius:4px;cursor:' + (dis ? 'default' : 'pointer') + '">' + esc(label) + '</button>';
  A.openGranny = function (G) {
    const a = G.artifacts, p = G.player; if (!on(G) || !a.cat) return false;
    const el = box(), rows = a.parts.map((q, s) => {
      if (!q) return '';
      const col = C.colors[q.rar], nxt = q.rar < C.maxRarity ? C.upCost[q.rar] : 0, prob = q.rar < C.maxRarity ? Math.min(100, C.upProb[q.rar] + C.upInc[q.rar] * q.fails) : 0;
      const mods = q.mods.map((m, i) => '<div style="margin-left:14px;color:' + C.colors[m.t] + '">- ' + esc(A.modText(m)) + ' ' +
        btn('mu:' + s + ':' + i, 'Tăng cấp (' + (m.t < 5 && m.t < Math.min(q.rar, 4) ? C.compUpCost[m.t] : '-') + ')', p.gold < (C.compUpCost[m.t] || 1e9) || m.t >= Math.min(q.rar, 4)) +
        btn('mr:' + s + ':' + i, 'Đúc lại (' + (a.reforge < C.refreshLimit ? C.refreshCost[a.reforge] : '-') + ')', a.reforge >= C.refreshLimit || p.gold < (C.refreshCost[a.reforge] || 1e9)) + '</div>').join('');
      return '<div style="margin:8px 0;padding:6px;border:1px solid #3a5070"><b style="color:' + col + '">' + esc(A.partName(q)) + '</b> <span style="color:' + C.elCols[q.el] + '">[' + C.elNames[q.el] + ']</span> · ' + C.rarNames[q.rar] +
        ' ' + btn('pu:' + s, q.rar < C.maxRarity ? 'Tiến cấp (' + nxt + ' vàng, ' + prob + '%)' : 'Phẩm chất tối đa', q.rar >= C.maxRarity || p.gold < nxt) + (mods || (q.rar ? '' : '<div style="margin-left:14px;color:#8aa0b8">Phẩm chất Trắng không có thuộc tính</div>')) + '</div>';
    }).join('');
    el.innerHTML = '<div style="' + css + '"><h3 style="margin:0 0 6px;color:#ffd84a">Bà Lão Ngàn Tuổi</h3><div>Vàng: <b id="atf-gold">' + p.gold + '</b> · Thần Uy: <b>' + WN[A.currentWrath(G)][0] + '</b> · Đúc lại ' + a.reforge + '/' + C.refreshLimit + '</div>' + rows +
      '<div id="atf-msg" style="min-height:22px;color:#ffe08a"></div><div style="text-align:right">' + btn('close', 'Đóng') + '</div></div>';
    G.hold = true;
    for (const b of el.querySelectorAll('button[data-a]')) b.onclick = () => {
      const [k, s, i] = b.dataset.a.split(':'); let r = null;
      if (k === 'close') { A.closeUi(); return; }
      if (k === 'pu') r = A.upgradePart(G, +s); else if (k === 'mu') r = A.upgradeMod(G, +s, +i); else if (k === 'mr') r = A.reforgeMod(G, +s, +i);
      A.openGranny(G);
      const m = document.getElementById('atf-msg');
      if (m && r) m.textContent = !r.ok ? 'Không được: ' + r.why : k === 'pu' ? (r.success ? 'Chúc mừng! Tiến cấp thành công!' : 'Tiến cấp thất bại! Đừng nản, hãy thử lại xem sao!') : k === 'mu' ? 'Tăng cấp hoàn thành!' : 'Đúc lại hoàn thành!';
    };
    return true;
  };
  // Bà Lão đứng ở phòng đầu mỗi ải (từ ải 2)
  A.placeGranny = function (G) {
    const [cx, cy] = W.roomCenter(G.map.rooms[0]), x = cx + 40, y = cy - 10;
    G.interactables.push({ atf: 1, granny: 1, x, y: y + 4, r: 18, labelY: 38, get gone() { return false; }, label: 'Bà Lão Ngàn Tuổi: tiến cấp / tăng cấp / đúc lại', use(G2) { A.openGranny(G2); } });
    G.props.push({ atfGranny: 1, x, y, draw(ctx, g2) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 2, 0, 0, 6.28); ctx.fill();
      const pf = SK.prefab('grandma_thousands');
      if (!pf || !SK.drawPrefab(ctx, pf, x, y, { state: 'ide', t: g2.t })) { ctx.fillStyle = '#b08ad0'; ctx.fillRect(x - 5, y - 14, 10, 14); }
    } });
  };
  A.openLevel = function (G, keys) {
    const el = box();
    el.innerHTML = '<div style="' + css + '"><h3 style="margin:0 0 6px;color:#ffd84a">Chúc phúc của Dũng Sĩ</h3><div>Chọn một phần thưởng:</div><div style="margin-top:8px">' +
      keys.map(k => btn('lv:' + k, A.LVNAME[k])).join('') + '</div></div>';
    for (const b of el.querySelectorAll('button[data-a]')) b.onclick = () => { A.levelPick(G, b.dataset.a.split(':')[1]); A.closeUi(); };
  };

  // ---------------------------------------------------------------- HUD
  SK.on('hud', (ctx, G) => {
    if (!on(G) || !G.map || (G.state !== 'stage' && G.state !== 'pause')) return;
    const a = G.artifacts, v = SK.view, w = a.wrath;
    let y = 50;
    if (a.cat) for (const q of a.parts) {
      if (!q) continue;
      ctx.save(); A.drawPart(ctx, q, 12, y + 1, 1.2, false); ctx.restore();
      SK.text(ctx, A.partName(q), 22, y + 2, 7, C.colors[q.rar], 'left', 'rgba(0,0,0,0.9)'); y += 11;
    }
    const x0 = 6, y0 = v.h - 22, k = Math.min(1, w.e / C.rechargeFull), nm = a.cat ? WN[A.currentWrath(G)][0] : '';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0, y0, 70, 7);
    ctx.fillStyle = w.active ? '#ffd84a' : k >= 1 ? '#7affb0' : '#58a8ff'; ctx.fillRect(x0 + 1, y0 + 1, 68 * (w.active ? 1 - w.active.t / w.active.dur : k), 5);
    SK.text(ctx, 'Thần Uy ' + nm + (k >= 1 && !w.active ? ' [L]' : ''), x0, y0 - 2, 7, '#e8f4ff', 'left', 'rgba(0,0,0,0.9)');
    if (a.ped && !a.locked && G.stageIdx === 0) SK.text(ctx, 'Chọn một Thần Khí ở bệ (E) trước khi vào phòng chiến đấu', v.w / 2, 40, 8, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
  });

  // ---------------------------------------------------------------- cuối ván
  // Đá quý chế độ này: số tầng x 50 + vàng / 20 + quái / 2, mỗi số làm tròn xuống [WIKI SW "Gem calculation"]; ép bằng gemMul so với công thức chung của sảnh.
  SK.on('runEnd', (G, r) => {
    if (!on(G) || !r) return;
    const floors = r.won ? SK.STAGES.length : G.stageIdx, target = Math.floor(floors * 50) + Math.floor(Math.max(0, r.gold | 0) / 20) + Math.floor((r.kills | 0) / 2);
    const base = (r.kills | 0) + floors * 10 + (r.won ? 100 : 0) + Math.max(0, r.gold | 0);
    r.artifactGems = target;
    if (base > 0) r.gemMul = (r.gemMul || 1) * (target / base);
  });
})();
