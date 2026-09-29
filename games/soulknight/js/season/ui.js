// Season Mode: HUD 4 thanh, nút Quest/Map/Backpack, ô tiêu hao, Sprint, các bảng (SK.SEASON.ui).
// Vẽ trên canvas HUD (phân giải thật). Đơn vị "UI" = 1 pixel sprite; màn cao ~320 đơn vị như ảnh chụp 8.6
// (1386x640 chia 2), nên số đo bố cục lấy thẳng từ ảnh chụp của chủ dự án (xem tools/season/RESEARCH.md mục c).
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS;
  const SS = SK.SEASON = SK.SEASON || {};
  const inv = SS.inv, Q = () => SS.quests;
  const I = SK.input;
  const DATA = window.SK_SEASON_ITEMS || { maps: {} };

  // Chữ game 8.x là chữ tròn đậm; Nunito có dấu tiếng Việt. Không tải được thì rơi về sans-serif.
  const FONT = '"Nunito", "Segoe UI", Arial, sans-serif';
  try {
    if (!document.getElementById('sk-season-font')) {
      const l = document.createElement('link');
      l.id = 'sk-season-font'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap';
      document.head.appendChild(l);
    }
  } catch (_) { /* không có DOM */ }

  const ui = SS.ui = { panel: null, tab: 'bag', mode: null, filter: 0, sel: null, msg: '', msgT: 0 };
  const KEYS = { bag: 'B', map: 'N', quest: 'U', sprint: 'Shift', pause: 'Esc' };
  ui.keys = KEYS;

  // ---------------------------------------------------------------- vẽ cơ bản
  let ctx = null, d = 2, UW = 693, UH = 320, dpr = 1;
  const C = {
    frame: '#396baa', frameHi: '#4f86c8', frameDk: '#24497f', ink: '#0b1020',
    barBg: '#234990', hp: '#d1545a', hpDk: '#b8362f', ar: '#8c9bb5', arDk: '#5f6f8f',
    en: '#7a9df3', enDk: '#5f68c6', hu: '#dcc04c', huDk: '#a8973a',
    body: 'rgba(28,34,37,0.78)', slot: 'rgba(38,46,48,0.92)', slotLine: '#7d98ad', label: '#aab1b3',
    title: '#3d70b4', titleHi: '#5b8fe0', white: '#ffffff', green: '#5ee05a', red: '#ff5147',
    yellow: '#f2df6b', blueSel: '#4c86d6'
  };
  const RAR_COL = ['#d7dde2', '#62d86a', '#58a6ff', '#c170ff', '#ff9d2e', '#ff4b4b'];

  function fr(name) { return SK.frame(name); }
  // Vẽ khung atlas sao cho TÂM khung nằm ở (cx,cy), bất kể điểm neo.
  function spr(name, cx, cy, s, o) {
    const f = fr(name); if (!f) return false;
    s = s || 1;
    return SK.draw(ctx, name, cx - (f[3] / 2 - f[5]) * s, cy - (f[4] / 2 - f[6]) * s,
      Object.assign({ sx: s, sy: s }, o || {}));
  }
  function fitSpr(name, cx, cy, box, o) {
    const f = fr(name); if (!f) return false;
    const s = Math.min(1, box / Math.max(f[3], f[4]));
    return spr(name, cx, cy, s, o);
  }
  // 9 mảnh: b = viền nguồn (px sprite), đích tính bằng đơn vị UI.
  function nine(name, x, y, w, h, b) {
    const f = fr(name); if (!f) return false;
    const img = SK.pages[f[0]]; if (!img) return false;
    const sx = f[1], sy = f[2], sw = f[3], sh = f[4];
    const xs = [[sx, x, b, b], [sx + b, x + b, sw - 2 * b, w - 2 * b], [sx + sw - b, x + w - b, b, b]];
    const ys = [[sy, y, b, b], [sy + b, y + b, sh - 2 * b, h - 2 * b], [sy + sh - b, y + h - b, b, b]];
    for (const [a, dx, s1, d1] of xs) for (const [c, dy, s2, d2] of ys) {
      if (d1 > 0 && d2 > 0) ctx.drawImage(img, a, c, s1, s2, dx, dy, d1, d2);
    }
    return true;
  }
  function text(str, x, y, size, color, align, outline, weight) {
    ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.fillStyle = outline;
      const o = Math.max(0.6, size / 11);
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) ctx.fillText(str, x + dx, y + dy);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  function textW(str, size, weight) { ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT; return ctx.measureText(str).width; }
  function wrap(str, width, size) {
    const out = []; let line = '';
    for (const w of str.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (textW(t, size, 700) > width && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }
  function rrect(x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function circle(cx, cy, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  // Thanh tiêu đề xanh của bảng (title_bar 9x12 kéo giãn, sáng dần sang phải như ảnh f).
  function titleBar(x, y, w, h, label, icon) {
    rrect(x, y + 1.5, w, h, 3, 'rgba(10,20,40,0.55)');
    nine('sui/title_bar', x, y, w, h, 4) || rrect(x, y, w, h, 3, C.title);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(120,170,255,0.10)'); g.addColorStop(1, 'rgba(140,190,255,0.28)');
    rrect(x + 1, y + 1, w - 2, h - 2, 2.5, g);
    let tx = x + 7;
    if (icon) { fitSpr(icon, x + 13, y + h / 2, 15); tx = x + 24; }
    if (label) text(label, tx, y + h / 2 + 0.5, 11, C.white, 'left', null, 800);
  }
  function body(x, y, w, h) { rrect(x, y, w, h, 3, C.body); }
  // Khung bảng Nhiệm vụ / Bản đồ: xám xanh trong, sáng dần xuống dưới (ảnh g, h).
  function fog(x, y, w, h, line, lw) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(38,52,72,0.78)'); g.addColorStop(1, 'rgba(110,140,170,0.55)');
    rrect(x, y, w, h, 4, g, line, lw);
  }
  function closeBtn(x, y) { spr('sui/button_close', x, y, 1) || text('X', x, y, 12, C.red, 'center'); }
  function smallBtn(x, y, w, h, label, on) {
    rrect(x, y, w, h, 2.5, on === false ? '#8a96a3' : '#dfe6ee');
    rrect(x + 1, y + h - 3, w - 2, 2, 1, on === false ? '#707b88' : '#b6c6d8');
    text(label, x + w / 2, y + h / 2, 8.5, on === false ? '#4f5a66' : '#2c64b0', 'center', null, 800);
  }
  function greenBtn(x, y, w, h, label) {
    rrect(x, y + 1.5, w, h, 3, '#1c5a2a');
    rrect(x, y, w, h, 3, '#3fbf5a');
    rrect(x + 1, y + 1, w - 2, h / 2 - 1, 2, 'rgba(255,255,255,0.18)');
    text(label, x + w / 2, y + h / 2 + 0.5, 9.5, C.white, 'center', 'rgba(0,40,0,0.55)', 800);
  }
  function slotBox(cx, cy, size, hi) {
    const x = cx - size / 2, y = cy - size / 2;
    rrect(x, y, size, size, 4.5, C.slot);
    rrect(x + 0.75, y + 0.75, size - 1.5, size - 1.5, 4, null, hi === 'sel' ? C.yellow : hi === 'drop' ? '#8fe0ff' : C.slotLine, 1.5);
  }
  function itemIcon(id, cx, cy, box) {
    const dd = SS.itemDef(id); if (!dd || !dd.icon) return;
    if (dd.type === 'weapon') {
      const f = fr(dd.icon); if (!f) return;
      spr(dd.icon, cx, cy, Math.min(1.2, box / Math.max(f[3], f[4])));
    } else fitSpr(dd.icon, cx, cy, box);
  }
  function rarityMark(id, x, y) {
    const dd = SS.itemDef(id); if (!dd || !(dd.rarityIdx > 0)) return;
    ctx.fillStyle = RAR_COL[dd.rarityIdx];
    ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 9, y + 2); ctx.lineTo(x + 2, y + 9); ctx.closePath(); ctx.fill();
  }
  function stackCell(st, cx, cy, size, hi) {
    slotBox(cx, cy, size, hi);
    if (!st) return;
    rarityMark(st.id, cx - size / 2, cy - size / 2);
    itemIcon(st.id, cx, cy, size - 7);
    if (st.n > 1) text(String(st.n), cx + size / 2 - 3, cy + size / 2 - 5, 8, C.white, 'right', '#000', 800);
    const dd = SS.itemDef(st.id);
    if (dd && dd.type === 'armor') {
      const k = st.dur / (st.max || dd.durability);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - size / 2 + 4, cy + size / 2 - 4, size - 8, 2);
      ctx.fillStyle = k > 0.5 ? '#6fd46a' : k > 0.2 ? '#f2c14e' : '#ff5a4a';
      ctx.fillRect(cx - size / 2 + 4, cy + size / 2 - 4, (size - 8) * k, 2);
    }
  }

  // ---------------------------------------------------------------- vùng bấm (làm mới mỗi khung)
  let hits = [];
  const hit = (x, y, w, h, act, extra) => hits.push(Object.assign({ x, y, w, h, act }, extra));
  const hitC = (cx, cy, r, act, extra) => hit(cx - r, cy - r, r * 2, r * 2, act, Object.assign({ round: r, cx, cy }, extra));
  // Vùng "under" (nền cuộn, nền bản đồ, nền thẻ) chỉ nhận khi không trúng nút nào khác.
  function hitAt(x, y) {
    const inside = h => (h.round ? Math.hypot(x - h.cx, y - h.cy) <= h.round : x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    for (const under of [false, true]) {
      for (let i = hits.length - 1; i >= 0; i--) if (!!hits[i].under === under && inside(hits[i])) return hits[i];
    }
    return null;
  }

  // ---------------------------------------------------------------- HUD chơi
  function bar(x, y, w, h, cur, max, col, dk, str) {
    rrect(x - 1, y - 1, w + 2, h + 2, 2, C.ink);
    ctx.fillStyle = C.barBg; ctx.fillRect(x, y, w, h);
    const k = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
    if (k > 0) {
      ctx.fillStyle = dk; ctx.fillRect(x, y, w * k, h);
      ctx.fillStyle = col; ctx.fillRect(x, y, w * k, Math.round(h * 0.5));
    }
    ctx.font = '13px ' + SK.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(str, x + w / 2 + dx, y + h / 2 + dy);
    ctx.fillStyle = C.white; ctx.fillText(str, x + w / 2, y + h / 2);
  }
  function statFrame(x, y, w, h) {
    rrect(x - 1, y - 1, w + 2, h + 2.5, 3, C.ink);
    rrect(x, y, w, h, 2.5, C.frameDk);
    rrect(x, y, w, h - 1.5, 2.5, C.frame);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 2, y + 1, w - 4, 1);
  }
  const ICON_PIX = {
    shield: ['.XXXXX.', 'XWWXGGX', 'XWWXGGX', 'XWWXGGX', '.XWXGX.', '.XWXGX.', '..XXX..'],
    gem: ['...X...', '..XWX..', '.XWWBX.', 'XWWWBBX', '.XBBBX.', '..XBX..', '...X...']
  };
  function pix(name, cx, cy, s) {
    const rows = ICON_PIX[name], col = { X: '#0b1020', W: '#e9eef5', G: '#a7b1bf', B: '#79b8ff' };
    const x0 = cx - rows[0].length * s / 2, y0 = cy - rows.length * s / 2;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (col[r[i]]) { ctx.fillStyle = col[r[i]]; ctx.fillRect(x0 + i * s, y0 + j * s, s, s); } });
  }
  function drawStatus(G) {
    const p = G.player, S = inv.state;
    statFrame(12, 5, 109, 48);
    spr('sui/icon_mark_1', 24.5, 15, 1.1) || text('♥', 24, 15, 10, C.red, 'center');
    fitSpr('sui/armor', 24.5, 30, 15) || pix('shield', 24.5, 30, 1.45);
    fitSpr('sui/icon_types_5', 24.5, 45.5, 12) || pix('gem', 24.5, 45.5, 1.45);
    bar(36, 10, 79, 10, p.hp, p.hpMax, C.hp, C.hpDk, Math.ceil(p.hp) + '/' + p.hpMax);
    bar(36, 25, 79, 10, p.armor, p.armorMax, C.ar, C.arDk, Math.ceil(p.armor) + '/' + p.armorMax);
    bar(36, 40.5, 79, 10, p.energy, p.energyMax, C.en, C.enDk, Math.floor(p.energy) + '/' + p.energyMax);
    statFrame(12, 59, 109, 17.5);
    spr('sui/icon_food', 24, 67.5, 1.1);
    bar(36, 62, 79, 10, S.hunger, SS.RULES.hungerMax, C.hu, C.huDk, Math.ceil(S.hunger) + '/100');
    const t = inv.tier();
    if (t.i >= 2) text(t.i >= 4 ? 'Quá tải!' : 'Nặng', 124, 67.5, 8, t.i >= 3 ? C.red : C.yellow, 'left', '#000');
    if (S.hunger <= 0) text('Đói!', 124, 58, 8, C.red, 'left', '#000');
  }
  function leftButtons() {
    const L = [['quest', 'sui/icon_mission', 'Nhiệm vụ', 115], ['map', 'sui/icon_map', 'Bản đồ', 159], ['bag', 'sui/icon_bag', 'Balô', 210]];
    for (const [id, ic, lab, cy] of L) {
      spr(ic, 68, cy, 1);
      text(lab, 68, cy + 16, 8.5, C.white, 'center', '#1a1a1a', 800);
      if (!I.touchMode) text(KEYS[id], 84, cy - 10, 7, C.yellow, 'center', '#000');
      hit(50, cy - 14, 36, 36, 'open', { tab: id });
    }
  }
  function coinBox(x, y) {
    const S = inv.state, s = fmt(S.coins), w = Math.max(55, 24 + textW(s, 11));
    rrect(x, y, w, 19, 5, 'rgba(20,24,30,0.45)');
    spr('sui/icon_coin', x + 11, y + 9.5, 1);
    text(s, x + 21, y + 10, 11, C.white, 'left', null, 900);
  }
  function pauseBtn() {
    const x = UW - 27, y = 22.5;
    spr('sui/btn_pause', x, y, 2) || rrect(x - 18, y - 16, 36, 32, 4, C.frame);
    ctx.fillStyle = '#0b1020'; ctx.fillRect(x - 7, y - 9, 5, 16); ctx.fillRect(x + 2, y - 9, 5, 16);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 7, y - 10, 4, 15); ctx.fillRect(x + 2, y - 10, 4, 15);
    hit(x - 19, y - 17, 38, 34, 'pause');
  }
  function quickSlots(G) {
    const S = inv.state, cx = UW / 2, cy = UH - 49;
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 50.5, id = S.quick[i];
      spr('sui/Qucik_using_item_base1', x, cy, 1) || circle(x, cy, 16, 'rgba(40,40,40,0.6)');
      spr(drag && drag.overQuick === i ? 'sui/Qucik_using_item_outline2' : 'sui/Qucik_using_item_outline1', x, cy, 1);
      if (id) {
        const n = inv.count(id);
        ctx.save(); if (!n) ctx.globalAlpha = 0.35;
        itemIcon(id, x, cy, 22);
        ctx.restore();
        text(String(n), x + 12, cy + 11, 8, C.white, 'right', '#000');
      }
      if (!I.touchMode) text(String(i + 1), x - 13, cy - 13, 7, C.yellow, 'center', '#000');
      hitC(x, cy, 18, 'quick', { i });
    }
    text('Tiêu hao', cx, UH - 21.5, 12, C.white, 'center', '#1a1a1a', 800);
  }
  const sprint = SS.sprint = { cd: 0, max: 5, t: 0, inv: 0.2, dist: 44 };   // [WIKI] 0,2 s bất tử, hồi 5 s; quãng lướt [ƯỚC LƯỢNG]
  function sprintBtn() {
    const cx = UW - 33, cy = 134, r = 20;
    circle(cx, cy, r, 'rgba(60,70,90,0.35)', 'rgba(255,255,255,0.92)', 2.2);
    spr('sui/icon_dash', cx, cy, 1.25);
    if (sprint.cd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (sprint.cd / sprint.max)); ctx.closePath(); ctx.fill();
      text(sprint.cd.toFixed(1), cx, cy, 10, C.white, 'center', '#000');
    }
    text('Lướt', cx, cy + r + 6, 11, C.white, 'center', '#1a1a1a', 800);
    if (!I.touchMode) text('Shift', cx - r, cy - r + 2, 7, C.yellow, 'center', '#000');
    hitC(cx, cy, r + 3, 'sprint');
  }
  // Nút đánh / kỹ năng / đổi vũ khí (bản season không gọi hud.js nên tự vẽ, bố cục theo ảnh e).
  function combatBtns(G) {
    const p = G.player, touch = I.touchMode;
    const ax = UW - 117, ay = UH - 61, ar = 37;
    if (touch) {
      circle(ax, ay, ar, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.5)', 2);
      circle(ax, ay, 9, null, 'rgba(255,255,255,0.75)', 1.5);
      ctx.beginPath(); ctx.moveTo(ax - 16, ay); ctx.lineTo(ax + 16, ay); ctx.moveTo(ax, ay - 16); ctx.lineTo(ax, ay + 16); ctx.stroke();
      hitC(ax, ay, ar, 'btn', { btn: 'attack' });
    }
    const wx = UW - 45, wy = UH - 50, wr = 25;
    circle(wx, wy, wr, 'rgba(20,20,20,0.55)', 'rgba(255,255,255,0.45)', 1.5);
    const w = p.weapons[p.cur];
    if (w && w.def) { const f = fr(w.def.sprite); if (f) spr(w.def.sprite, wx, wy, Math.min(2.4, 38 / Math.max(f[3], f[4]))); }
    if (w && w.def && w.def.cost) text(String(w.def.cost), wx - wr + 4, wy - wr + 6, 8, '#9cd0ff', 'left', '#000');
    if (!touch) text('Q', wx + wr - 4, wy - wr + 5, 7, C.yellow, 'center', '#000');
    hitC(wx, wy, wr, 'btn', { btn: 'swap' });
    const kx = UW - 48, ky = UH - 120, kr = 25, sk = p.h && p.h.skill;
    circle(kx, ky, kr, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.35)', 1.5);
    const sdef = sk && SK.SKILLS && SK.SKILLS[sk.id], ico = sdef && sdef.icon && fr(sdef.icon) ? sdef.icon : null;
    if (ico) fitSpr(ico, kx, ky, 30);
    else text('★', kx, ky, 16, p.skillCd > 0 ? '#6b7c95' : '#ffe04a', 'center', '#000');
    if (p.skillCd > 0 && sk && sk.cd) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.arc(kx, ky, kr - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.skillCd / sk.cd)); ctx.closePath(); ctx.fill();
      text(String(Math.ceil(p.skillCd)), kx, ky, 11, C.white, 'center', '#000');
    }
    if (!touch) text('K', kx + kr - 4, ky - kr + 5, 7, C.yellow, 'center', '#000');
    hitC(kx, ky, kr, 'btn', { btn: 'skill' });
  }
  function joystick() {
    if (!I.touchMode) return;
    const st = I.stick, k = dpr / d;
    const ox = st.active ? st.ox * k : 116, oy = st.active ? st.oy * k : UH - 62;
    circle(ox, oy, 39, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.3)', 1.5);
    let kx = ox, ky = oy;
    if (st.active) {
      const dx = (st.x - st.ox) * k, dy = (st.y - st.oy) * k, m = Math.hypot(dx, dy), R = 28;
      kx += m > R ? dx / m * R : dx; ky += m > R ? dy / m * R : dy;
    }
    circle(kx, ky, 13, 'rgba(255,255,255,0.6)');
  }
  // Số sát thương + nhãn tương tác (hud.js không chạy trong mode mùa).
  function worldText(G) {
    const cam = G.view || G.cam, k = SK.view.scale * dpr / d;
    if (!cam) return;
    for (const n of G.nums || []) {
      const t = n.t / 0.8, y = n.y - cam.y - 10 * Math.min(1, t * 3);
      ctx.save(); ctx.globalAlpha = t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1;
      text(String(n.val), (n.x - cam.x) * k, y * k, n.big ? 14 : 11, n.color, 'center', 'rgba(0,0,0,0.9)', 900);
      ctx.restore();
    }
    const it = G.interactTarget;
    if (it && !ui.panel) text((I.touchMode ? '' : '[E] ') + it.label, (it.x - cam.x) * k, (it.y - cam.y) * k, 10, C.yellow, 'center', 'rgba(0,0,0,0.9)');
  }
  function toast(G) {
    const m = ui.msgT > 0 ? ui.msg : G.toastT > 0 ? G.toastMsg : '';
    if (!m) return;
    const a = Math.min(1, (ui.msgT > 0 ? ui.msgT : G.toastT) * 3);
    ctx.save(); ctx.globalAlpha = a;
    const w = textW(m, 10) + 16, y = !ui.panel ? UH - 104 : ui.tab === 'bag' ? UH - 80 : UH - 13;   // bảng mở: chỗ trống, khỏi che nội dung
    rrect(UW / 2 - w / 2, y - 8, w, 16, 4, 'rgba(0,0,0,0.7)');
    text(m, UW / 2, y, 10, C.white, 'center', null);
    ctx.restore();
  }
  function say(m) { ui.msg = m; ui.msgT = 1.8; }
  ui.say = say;
  const fmt = n => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // ---------------------------------------------------------------- bảng: thanh tab chung
  function tabBar() {
    const cx = UW / 2, tabs = [['quest', 'sui/icon_mission', -61.5], ['bag', 'sui/icon_bag', 0], ['map', 'sui/icon_map', 63]];
    const g = ctx.createLinearGradient(cx - 95, 0, cx + 95, 0);
    g.addColorStop(0, 'rgba(76,134,214,0)'); g.addColorStop(0.2, 'rgba(76,134,214,0.9)'); g.addColorStop(0.8, 'rgba(76,134,214,0.9)'); g.addColorStop(1, 'rgba(76,134,214,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 95, 38.5, 190, 1.2);
    for (const [id, ic, dx] of tabs) {
      spr(ic, cx + dx, 24, 1);
      if (ui.tab === id) { ctx.fillStyle = C.blueSel; ctx.fillRect(cx + dx - 18, 37.5, 36, 2.5); }
      hit(cx + dx - 22, 6, 44, 34, 'tab', { tab: id });
    }
    if (!I.touchMode) text('Tab/Esc: đóng', cx + 100, 24, 7, 'rgba(255,255,255,0.7)', 'left', '#000');
  }

  // ---------------------------------------------------------------- bảng Balô / Trang bị / Kho / Cửa hàng
  const EQ = [['backpack', 'Balô', 'sui/inventory_gray'], ['armor', 'Giáp', 'sui/armor_gray'], ['weapon1', 'Vũ khí', 'sui/weapon_gray'], ['weapon2', 'Vũ khí', 'sui/weapon_gray']];
  const FILTERS = [
    ['sui/icon_types_0', 'Tất cả', () => true],
    ['sui/icon_types_1', 'Balô, bùa', d => d.type === 'backpack' || d.type === 'amulet'],
    ['sui/icon_types_2', 'Giáp', d => d.type === 'armor'],
    ['sui/icon_types_3', 'Thuốc, đồ ăn', d => d.type === 'potion' || d.type === 'food'],
    ['sui/icon_types_4', 'Vũ khí', d => d.type === 'weapon'],
    ['sui/icon_types_5', 'Vật liệu, đồ quý', d => d.type === 'material' || d.type === 'valuable' || d.type === 'quest']
  ];
  const scroll = { bag: 0, wh: 0, vend: 0 };
  const same = (a, b) => a && b && a.c === b.c && a.i === b.i && a.k === b.k;
  function hiOf(ref) { return drag && drag.over && same(drag.over, ref) ? 'drop' : ui.sel && same(ui.sel, ref) ? 'sel' : null; }
  function filtered(st) { return !st || FILTERS[ui.filter][2](SS.itemDef(st.id)); }

  function gridCells(list, c, x0, y0, cols, stepX, stepY, rows, key, clipY0, clipY1) {
    const total = Math.ceil(list.length / cols), maxS = Math.max(0, total - rows);
    scroll[key] = Math.max(0, Math.min(maxS, scroll[key]));
    const off = scroll[key];
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - stepX / 2, clipY0, stepX * cols, clipY1 - clipY0); ctx.clip();
    for (let i = off * cols; i < Math.min(list.length, (off + rows + 1) * cols); i++) {
      const r = Math.floor(i / cols) - off, cc = i % cols, cx = x0 + cc * stepX, cy = y0 + r * stepY;
      if (cy - 15 > clipY1) continue;
      const ref = { c, i };
      ctx.save(); if (!filtered(list[i])) ctx.globalAlpha = 0.25;
      stackCell(drag && same(drag.from, ref) ? null : list[i], cx, cy, 29, hiOf(ref));
      ctx.restore();
      if (cy + 14 < clipY1) hit(cx - 14.5, cy - 14.5, 29, 29, 'slot', { ref });
    }
    ctx.restore();
    if (total > rows) {   // thanh cuộn
      const h = clipY1 - clipY0, x = x0 + stepX * (cols - 0.5) + 2;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, clipY0, 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x, clipY0 + h * off / total, 2, h * rows / total);
    }
    hit(x0 - stepX / 2, clipY0, stepX * cols, clipY1 - clipY0, 'scrollArea', { key, under: true });
  }

  function drawBag(G) {
    const S = inv.state, ox = UW / 2 - 346.5;   // bố cục ảnh f căn giữa theo bề ngang 693
    // Trang bị
    titleBar(ox + 56, 44, 210, 17, 'Trang bị', 'sui/Equipmenttitle_icon');
    closeBtn(ox + 250, 52.5); hit(ox + 240, 44, 22, 17, 'close');
    body(ox + 59, 63, 204, 86);
    EQ.forEach(([k, lab, ghost], j) => {
      const cx = ox + 90 + j * 47, cy = 82.5, ref = { c: 'equip', k }, st = S.equip[k];
      stackCell(drag && same(drag.from, ref) ? null : st, cx, cy, 29, hiOf(ref));
      if (!st || (drag && same(drag.from, ref))) { ctx.save(); ctx.globalAlpha = 0.45; fitSpr(ghost, cx, cy, 22); ctx.restore(); }
      text(lab, cx, cy + 19, 8, C.label, 'center', null, 800);
      hit(cx - 14.5, cy - 14.5, 29, 29, 'slot', { ref });
    });
    for (let j = 0; j < 4; j++) {
      const cx = ox + 90 + j * 47, cy = 125, ref = { c: 'equip', k: 'amulet' + j }, st = S.equip.amulets[j];
      stackCell(drag && same(drag.from, ref) ? null : st, cx, cy, 29, hiOf(ref));
      if (j >= inv.amuletOpen()) spr('sui/lock', cx, cy, 1);
      else if (!st) { ctx.save(); ctx.globalAlpha = 0.45; fitSpr('sui/design_gray', cx, cy, 22); ctx.restore(); }
      text('Bùa', cx, cy + 19, 8, C.label, 'center', null, 800);
      hit(cx - 14.5, cy - 14.5, 29, 29, 'slot', { ref });
    }
    // Hộp an toàn
    titleBar(ox + 271.5, 44, 43.5, 17, '', null);
    spr('sui/Pet_package_icon', ox + 293, 52.5, 1);
    body(ox + 273, 63, 40, 34);
    const sref = { c: 'secure' };
    stackCell(drag && same(drag.from, sref) ? null : S.secure, ox + 293, 80, 29, hiOf(sref));
    hit(ox + 278.5, 65.5, 29, 29, 'slot', { ref: sref });
    text('Hộp an toàn', ox + 293, 111.5, 9, C.white, 'center', '#1a1a1a', 800);
    // Balô
    const used = S.backpack.filter(Boolean).length;
    titleBar(ox + 56, 152, 210, 17, 'Balô(' + used + '/' + S.backpack.length + ')', 'sui/Package_title_icon');
    smallBtn(ox + 170, 154.5, 42.5, 12, 'Cất hết', !!inv.atWarehouse);
    hit(ox + 170, 153, 42.5, 15, 'storeAll');
    smallBtn(ox + 219, 154.5, 42.5, 12, 'Sắp xếp');
    hit(ox + 219, 153, 42.5, 15, 'sort', { where: 'bag' });
    body(ox + 59, 172, 204, 131);
    gridCells(S.backpack, 'bag', ox + 81, 195, 5, 39.75, 39, 3, 'bag', 176, 286);
    // Tải trọng
    const wt = inv.weight(), cap = inv.capacity(), tier = inv.tier();
    text('Tải:', ox + 71, 295.5, 9, C.white, 'left', null, 800);
    ctx.fillStyle = '#111'; ctx.fillRect(ox + 121, 294, 118, 3.5);
    ctx.fillStyle = ['#63d86b', '#63d86b', '#f2c14e', '#ff8a3a', '#ff4a4a'][tier.i];
    ctx.fillRect(ox + 121, 294, 118 * Math.min(1, wt / (cap * 1.2)), 3.5);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(ox + 121 + 118 / 1.2, 293, 0.8, 5.5);
    text('Tổng tải: ' + wt + '/' + cap, ox + 238, 288.5, 6.5, tier.i >= 2 ? C.yellow : C.green, 'right', null, 800);
    // Cột lọc
    rrect(ox + 425, 65, 30, 166, 3, C.body);
    FILTERS.forEach(([ic], i) => {
      const cy = 78.5 + i * 27.6;
      if (ui.filter === i) rrect(ox + 428, cy - 11, 24, 22, 3, 'rgba(76,134,214,0.35)', C.blueSel, 1);
      spr(ic, ox + 440, cy, 1);
      hit(ox + 427, cy - 12, 26, 24, 'filter', { i });
    });
    // Cột phải: Kho / Máy bán hàng / chi tiết
    if (ui.mode === 'warehouse') drawWarehouse(ox);
    else if (ui.mode === 'store') drawVending(ox);
    drawDetail(ox);
  }
  function drawWarehouse(ox) {
    const S = inv.state, used = S.warehouse.filter(Boolean).length;
    titleBar(ox + 456, 44, 180, 17, 'Kho(' + used + '/' + S.warehouse.length + ')', 'sui/title_text');
    smallBtn(ox + 571, 45.5, 38, 13, 'Sắp xếp'); hit(ox + 571, 44, 38, 17, 'sort', { where: 'wh' });
    closeBtn(ox + 622, 52.5); hit(ox + 612, 44, 22, 17, 'close');
    body(ox + 459, 63, 175, 240);
    gridCells(S.warehouse, 'wh', ox + 482.5, 83.5, 4, 42.5, 38.8, 5, 'wh', 66, 280);
    const up = inv.warehouseUpgrade();
    if (up) {
      const need = 'Nâng cấp kho: ' + fmt(up[0]) + ' xu + ' + up[1].map(([id, n]) => n + ' ' + SS.itemDef(id).name).join(', ');
      smallBtn(ox + 466, 287, 162, 12, 'Nâng kho lên cấp ' + (S.warehouseLv + 1));
      hit(ox + 466, 286, 162, 14, 'upgradeWh', { tip: need });
    }
  }
  function drawVending(ox) {
    titleBar(ox + 456, 44, 180, 17, 'Máy bán hàng', 'sui/icon_coin');
    text('giá 200%', ox + 606, 52.5, 7, '#dfe7f3', 'right', null, 700);
    closeBtn(ox + 622, 52.5); hit(ox + 612, 44, 22, 17, 'close');
    body(ox + 459, 63, 175, 240);
    SS.VENDING.forEach((id, i) => {
      const y = 67 + i * 22.2, dd = SS.itemDef(id), pr = inv.buyPrice(id);
      rrect(ox + 463, y, 167, 21, 3, 'rgba(255,255,255,0.05)');
      stackCell({ id, n: 1 }, ox + 476, y + 10.5, 19);
      text(dd.name, ox + 489, y + 7, 8, RAR_COL[dd.rarityIdx], 'left', null, 800);
      text(dd.desc.length > 34 ? dd.desc.slice(0, 33) + '…' : dd.desc, ox + 489, y + 15.5, 6.5, C.label, 'left', null, 700);
      spr('sui/icon_coin', ox + 590, y + 10.5, 0.8);
      text(fmt(pr), ox + 598, y + 10.5, 8, inv.state.coins >= pr ? C.white : C.red, 'left', null, 800);
      hit(ox + 463, y, 167, 21, 'buy', { id });
    });
    text('Nhấp món trong balô rồi bấm Bán / Sửa.', ox + 546, 298, 7, C.label, 'center');
  }
  // Thẻ chi tiết món đang chọn + nút hành động.
  function drawDetail(ox) {
    const ref = ui.sel, st = ref && inv.get(ref);
    if (!st) { ui.sel = null; return; }
    const dd = SS.itemDef(st.id);
    const right = ui.mode === 'warehouse' || ui.mode === 'store';
    const x = right ? ox + 272 : ox + 459, y = right ? 118 : 63, w = right ? 150 : 175;
    const acts = [];
    const S = inv.state;
    if (ui.mode === 'store') {
      const pr = inv.sellPrice(st);
      if (pr > 0) acts.push(['sell', 'Bán +' + fmt(pr)]);
      if (dd.type === 'armor' && st.dur < (st.max || dd.durability)) acts.push(['repair', 'Sửa -' + fmt(inv.repairCost(st))]);
    }
    if (inv.usable(st.id) && ref.c === 'bag') acts.push(['use', 'Dùng']);
    if (ref.c === 'bag' && (dd.type === 'potion' || dd.type === 'food') && S.quick.indexOf(st.id) < 0) acts.push(['toQuick', 'Gắn ô nhanh']);
    if (ref.c === 'bag') {
      if (inv.atWarehouse) acts.push(['quick', 'Cất vào kho']);
      else if (['weapon', 'armor', 'backpack', 'amulet'].includes(dd.type)) acts.push(['quick', 'Trang bị']);
    } else acts.push(['quick', ref.c === 'equip' ? 'Tháo ra' : 'Lấy ra balô']);
    if (ref.c !== 'wh') acts.push(['drop', 'Vứt bỏ']);
    const lines = wrap(dd.desc || '', w - 12, 7.5);
    const h = 44 + lines.length * 9 + Math.ceil(acts.length / 2) * 16;
    rrect(x, y, w, h, 4, 'rgba(18,24,30,0.94)', RAR_COL[dd.rarityIdx] || C.slotLine, 1.2);
    stackCell(st, x + 17, y + 17, 25);
    text(dd.name, x + 34, y + 10, 9.5, RAR_COL[dd.rarityIdx], 'left', null, 900);
    const kg = dd.weight * st.n;
    text((dd.weight ? kg.toFixed(kg % 1 ? 1 : 0) + ' kg' : '') + (dd.value ? '  ·  giá ' + fmt(dd.value * (dd.type === 'armor' ? 1 : st.n)) : ''), x + 34, y + 21, 7.5, C.label, 'left', null, 700);
    if (dd.type === 'armor') text('Độ bền ' + st.dur + '/' + (st.max || dd.durability), x + 34, y + 30, 7.5, '#9fd6ff', 'left', null, 700);
    lines.forEach((l, i) => text(l, x + 6, y + 40 + i * 9, 7.5, '#dfe6ee', 'left', null, 700));
    acts.forEach(([a, lab], i) => {
      const bx = x + 6 + (i % 2) * ((w - 12) / 2 + 1), by = y + 44 + lines.length * 9 + Math.floor(i / 2) * 16, bw = (w - 14) / 2;
      smallBtn(bx, by, bw, 13, lab);
      hit(bx, by, bw, 13, 'act', { a });
    });
    hit(x, y, w, h, 'none', { under: true });
  }
  function doAct(a) {
    const ref = ui.sel; if (!ref) return;
    let why = null;
    const st = inv.get(ref);
    if (a === 'use') why = inv.use(SK.G, st.id);
    else if (a === 'quick') why = inv.quickMove(ref);
    else if (a === 'drop') inv.drop(ref);
    else if (a === 'sell') why = inv.sell(ref);
    else if (a === 'repair') why = inv.repair(ref);
    else if (a === 'toQuick') { const S = inv.state, q = S.quick.indexOf(null); S.quick[q >= 0 ? q : 2] = st.id; }
    if (why) say(why);
    if (!inv.get(ref)) ui.sel = null;
  }

  // ---------------------------------------------------------------- bảng Bản đồ
  const maps = {};
  function mapImg(key) {
    const m = DATA.maps && DATA.maps[key]; if (!m) return null;
    if (!maps[key]) { const im = new Image(); im.src = m.src; maps[key] = im; }
    return maps[key].complete && maps[key].naturalWidth ? maps[key] : null;
  }
  const mapView = { zoom: 1, cx: null, cy: null, key: null };
  // world.mapInfo(): {imgW, imgH, scale} — ảnh tổng quan phủ imgW*scale x imgH*scale px thế giới.
  const MAP_IMG = { base: 'Init', s1: 'Scene1' }, MAP_NAME = { base: 'Căn cứ', s1: 'Ngoại ô căn cứ' };
  function mapInfo(G) {
    const w = SS.world, zone = (G && G.season && G.season.map) || (inv.inBase() ? 'base' : 's1');
    const info = w && typeof w.mapInfo === 'function' ? w.mapInfo(zone) : null;
    const key = MAP_IMG[zone] || 'Scene1', m = DATA.maps[key] || { w: 512, h: 512, scale: 0.5 };
    return {
      key, name: MAP_NAME[zone] || zone,
      w: info && info.imgW ? info.imgW * info.scale : m.w / m.scale,
      h: info && info.imgH ? info.imgH * info.scale : m.h / m.scale
    };
  }
  const MARK = { portal: 'sui/point_gate', gate: 'sui/point_gate', exit: 'sui/point_escape', escape: 'sui/point_escape',
    task: 'sui/point_task', npc: 'sui/point_task', treasure: 'sui/point_treasure', crate: 'sui/point_chestbox',
    chest: 'sui/point_chestbox', building: 'sui/point_white', camp: 'sui/point_white', white: 'sui/point_white' };
  function drawMap(G) {
    const cx = UW / 2, X0 = cx - 250.5, Y0 = 36, W = 501.5;
    const info = mapInfo(G);
    titleBar(X0, Y0, W, 22, 'Bản đồ - ' + info.name, 'sui/title_text');
    closeBtn(X0 + 479, Y0 + 11); hit(X0 + 468, Y0, 24, 22, 'close');
    const bx = X0 + 4, by = 62, bw = W - 8, bh = 244;
    fog(bx, by, bw, bh, '#b7c6db', 1.2);
    const img = mapImg(info.key), m = DATA.maps[info.key] || { scale: 0.5 };
    if (mapView.key !== info.key || mapView.cx == null || ui.mapFresh) {
      ui.mapFresh = false;
      mapView.key = info.key; mapView.zoom = Math.min((bw - 40) / info.w, (bh - 10) / info.h);
      mapView.cx = G.player ? G.player.x : info.w / 2; mapView.cy = G.player ? G.player.y : info.h / 2;
    }
    const z = mapView.zoom, vw = bw - 30, vx = bx + vw / 2, vy = by + bh / 2;
    // không cho kéo ảnh ra khỏi khung: ảnh to hơn khung thì kẹp mép, nhỏ hơn thì đặt giữa
    const clampC = (c, size, span) => size * z <= span ? size / 2 : Math.max(span / 2 / z, Math.min(size - span / 2 / z, c));
    mapView.cx = clampC(mapView.cx, info.w, vw); mapView.cy = clampC(mapView.cy, info.h, bh);
    const toS = (x, y) => [vx + (x - mapView.cx) * z, vy + (y - mapView.cy) * z];
    ctx.save(); ctx.beginPath(); ctx.rect(bx + 1, by + 1, bw - 2, bh - 2); ctx.clip();
    if (img) {
      const [sx, sy] = toS(0, 0);
      ctx.imageSmoothingEnabled = z * (1 / m.scale) < 1.5;
      ctx.drawImage(img, sx, sy, info.w * z, info.h * z);
      ctx.imageSmoothingEnabled = false;
      // viền mờ dần như ảnh g
      const e = 26;
      for (const [gx, gy, gw, gh, x0, y0, x1, y1] of [[sx, sy, info.w * z, e, 0, sy, 0, sy + e], [sx, sy + info.h * z - e, info.w * z, e, 0, sy + info.h * z, 0, sy + info.h * z - e],
        [sx, sy, e, info.h * z, sx, 0, sx + e, 0], [sx + info.w * z - e, sy, e, info.h * z, sx + info.w * z, 0, sx + info.w * z - e, 0]]) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(20,30,45,1)'); g.addColorStop(1, 'rgba(20,30,45,0)');
        ctx.fillStyle = g; ctx.fillRect(gx, gy, gw, gh);
      }
    } else text('Đang tải bản đồ…', vx, vy, 10, C.white, 'center');
    const marks = SS.world && typeof SS.world.markers === 'function' ? (SS.world.markers() || []) : [];
    for (const mk of marks) {
      if (mk.kind === 'self' || mk.kind === 'crate_open') continue;
      // thùng chỉ hiện khi đã ở gần (coi như đã thấy), tránh rắc kín bản đồ
      if (mk.kind === 'crate' && (!G.player || Math.hypot(mk.x - G.player.x, mk.y - G.player.y) > 200)) continue;
      const [x, y] = toS(mk.x, mk.y);
      spr(MARK[mk.kind] || MARK.white, x, y, 1);
      if (mk.label) text(mk.label, x, y + 11, mk.kind === 'building' || mk.kind === 'camp' ? 7 : 8, mk.locked ? '#aab1b3' : C.white, 'center', '#000');
    }
    if (G.player) {
      const [x, y] = toS(G.player.x, G.player.y);
      spr('sui/point_self', x, y - 3, 1);
      text('Bạn', x, y + 10, 9, C.white, 'center', '#000', 800);
    }
    ctx.restore();
    // thanh phóng
    const zx = X0 + W - 20;
    spr('sui/icon_scales_0', zx, by + 24, 1); hit(zx - 10, by + 14, 20, 20, 'zoom', { k: 1 / 1.25 });
    spr('sui/icon_scales_1', zx, by + bh - 20, 1); hit(zx - 10, by + bh - 30, 20, 20, 'zoom', { k: 1.25 });
    const t0 = by + 40, t1 = by + bh - 38;
    rrect(zx - 1.5, t0, 3, t1 - t0, 1.5, 'rgba(200,210,225,0.6)');
    const zmin = zoomMin(info), zmax = zmin * 6, kz = Math.log(z / zmin) / Math.log(zmax / zmin);
    spr('sui/icon_scales_2', zx, t0 + (t1 - t0) * (1 - Math.max(0, Math.min(1, kz))), 1);
    hit(zx - 10, t0 - 5, 20, t1 - t0 + 10, 'zoomBar', { t0, t1, info });
    hit(bx, by, bw - 30, bh, 'mapPan', { under: true });
  }
  function zoomMin(info) { return Math.min(460 / info.w, 240 / info.h) * 0.6; }
  function setZoom(z, info) { const a = zoomMin(info); mapView.zoom = Math.max(a, Math.min(a * 6, z)); }

  // ---------------------------------------------------------------- bảng Nhiệm vụ
  const questView = { tab: 'acc', sel: null };
  function drawQuest(G) {
    const qs = Q(); if (!qs) return;
    const cx = UW / 2, X0 = cx - 272.5;
    titleBar(X0, 36, 546, 22, 'Nhiệm vụ', 'sui/title_text');
    closeBtn(X0 + 532, 47); hit(X0 + 520, 36, 24, 22, 'close');
    // cột trái
    fog(X0 + 3.5, 62, 209, 245, '#9aa9bf', 1);
    const tabs = [['acc', 'Đã nhận'], ['fin', 'Đã xong']];
    tabs.forEach(([id, lab], i) => {
      const x = X0 + 7 + i * 102, on = questView.tab === id;
      rrect(x, 68, 99, 21, 3, on ? '#4f86d6' : '#3b5f96');
      text(lab, x + 49.5, 78.5, 9.5, on ? C.white : '#dfe7f3', 'center', null, 800);
      hit(x, 68, 99, 21, 'qtab', { tab: id });
    });
    const list = questView.tab === 'acc' ? qs.accepted() : qs.finished();
    if (!list.some(q => q.id === questView.sel)) questView.sel = list[0] ? list[0].id : null;
    list.slice(0, 9).forEach((q, i) => {
      const y = 96 + i * 26, on = q.id === questView.sel, lk = questView.tab === 'acc' && qs.locked(q);
      rrect(X0 + 7, y, 202, 19, 3, on ? '#4c86d6' : lk ? 'rgba(138,160,179,0.45)' : '#8aa0b3', on ? '#f2df6b' : null, 1.3);
      text(q.title, X0 + 18, y + 10, 9, lk && !on ? '#dfe6ee' : C.white, 'left', null, 800);
      if (questView.tab === 'acc' && qs.complete(q)) spr('sui/finished', X0 + 196, y + 9.5, 0.8);
      hit(X0 + 7, y, 202, 19, 'qsel', { id: q.id });
    });
    if (!list.length) text(questView.tab === 'acc' ? 'Không còn nhiệm vụ.' : 'Chưa xong nhiệm vụ nào.', X0 + 108, 110, 9, C.label, 'center');
    // cột phải
    const RX = X0 + 218.5, RW = 324;
    fog(RX, 62, RW, 245, '#e8d86a', 1.4);
    const q = qs.defs.find(x => x.id === questView.sel);
    if (!q) return;
    text(q.title, RX + 8, 76, 10.5, C.white, 'left', null, 800);
    const lines = wrap(q.text, RW - 20, 9.3);
    lines.forEach((l, i) => text(l, RX + 8, 92 + i * 11.8, 9.3, '#f4f6f8', 'left', null, 700));
    const sy = 92 + lines.length * 11.8 + 5;
    text('---- ' + q.from, RX + RW - 9, sy, 9.5, C.white, 'right', null, 800);
    const l1 = sy + 16;
    ctx.fillStyle = '#7d98ad'; ctx.fillRect(RX + 5, l1, RW - 10, 1.2);
    const done = qs.isDone(q.id);
    q.obj.forEach((o, i) => {
      const y = l1 + 11 + i * 13.5, pr = done ? o.n : qs.progress(q.id, i);
      text(o.label + (o.kind === 'locked' && !done ? ' (' + o.why + ')' : ''), RX + 5, y, 9.3, o.kind === 'locked' && !done ? '#aab1b3' : C.white, 'left', null, 700);
      const tot = '/' + o.n, tw = textW(tot, 9.3);
      text(tot, RX + RW - 9, y, 9.3, C.white, 'right', null, 800);
      text(String(pr), RX + RW - 9 - tw, y, 9.3, pr >= o.n ? C.green : C.red, 'right', null, 800);
    });
    const l2 = l1 + 11 + q.obj.length * 13.5;
    ctx.fillStyle = '#7d98ad'; ctx.fillRect(RX + 5, l2, RW - 10, 1.2);
    text('Phần thưởng:', RX + 8, l2 + 19, 9.5, C.white, 'left', null, 800);
    q.rewards.forEach(([id, n], i) => {
      const x = RX + 24 + i * 43, y = l2 + 51;
      stackCell({ id, n: 1 }, x, y, 29);
      text(fmt(n), x + 12, y + 9, 8, C.white, 'right', '#000', 900);
    });
    if (questView.tab === 'acc' && qs.complete(q)) {
      greenBtn(RX + RW - 88, 280, 80, 20, 'Nhận thưởng');
      hit(RX + RW - 88, 280, 80, 20, 'claim', { id: q.id });
    }
  }

  // ---------------------------------------------------------------- bảng tạm dừng + Cửa hàng mùa (thanh toán giả)
  const SEASON_PACKS = [[0.99, 500, 0], [2.99, 1500, 200], [4.99, 3000, 500], [10.99, 7000, 1000]];   // [WIKI: Season Coins]
  function drawPause() {
    const cx = UW / 2, cy = UH / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, UW, UH);
    titleBar(cx - 110, cy - 70, 220, 20, 'Tạm dừng', 'sui/title_text');
    body(cx - 107, cy - 48, 214, 120);
    const S = inv.state;
    text('Xu mùa: ' + fmt(S.seasonCoins || 0), cx, cy - 36, 9, '#ffd65a', 'center');
    const B = [['resume', 'Tiếp tục'], ['shop', 'Cửa hàng mùa'], ['help', 'Luật chết / sơ tán'], ['exit', 'Về sảnh (lưu)']];
    B.forEach(([a, lab], i) => { smallBtn(cx - 80, cy - 24 + i * 22, 160, 17, lab); hit(cx - 80, cy - 24 + i * 22, 160, 17, 'pauseAct', { a }); });
    if (ui.help) {
      rrect(cx - 170, cy + 76, 340, 34, 4, 'rgba(0,0,0,0.8)');
      text('Chết: mất balô + đồ đang đeo, giữ Hộp an toàn và Kho (luật đoán, wiki không ghi).', cx, cy + 86, 7.5, C.white, 'center');
      text('Sơ tán: đứng trong vòng xanh ở điểm sơ tán đủ 5 giây (đoán).', cx, cy + 99, 7.5, C.white, 'center');
    }
  }
  // Cửa hàng mùa: thứ duy nhất bán bằng tiền thật trong game gốc -> hộp thanh toán GIẢ, bấm là nhận.
  function drawShop() {
    const cx = UW / 2, cy = UH / 2, S = inv.state, sh = ui.shop;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, UW, UH);
    titleBar(cx - 150, cy - 96, 300, 20, 'Cửa hàng mùa', 'sui/icon_coin');
    closeBtn(cx + 136, cy - 86); hit(cx + 124, cy - 96, 24, 20, 'shopClose');
    body(cx - 147, cy - 74, 294, 168);
    if (sh.step === 'list') {
      text('Xu mùa dùng chung cho mọi mùa. Đang có: ' + fmt(S.seasonCoins || 0), cx, cy - 62, 8.5, '#ffd65a', 'center');
      SEASON_PACKS.forEach(([usd, c, b], i) => {
        const x = cx - 138 + (i % 2) * 140, y = cy - 50 + Math.floor(i / 2) * 58;
        rrect(x, y, 134, 52, 4, 'rgba(255,255,255,0.07)', '#7d98ad', 1);
        spr('sui/Coin', x + 20, y + 22, 1.6);
        text(fmt(c) + (b ? ' +' + fmt(b) : ''), x + 38, y + 17, 11, C.white, 'left');
        text('xu mùa', x + 38, y + 30, 8, C.label, 'left');
        greenBtn(x + 80, y + 32, 48, 15, '$' + usd.toFixed(2));
        hit(x, y, 134, 52, 'shopPick', { i });
      });
      text('Mọi gói đều mua giả lập — không trừ tiền thật.', cx, cy + 84, 8, C.label, 'center');
    } else {
      const [usd, c, b] = SEASON_PACKS[sh.pack];
      text('Thanh toán giả lập — không trừ tiền thật', cx, cy - 56, 10.5, '#ffb34a', 'center');
      text(fmt(c + b) + ' xu mùa', cx, cy - 30, 12, C.white, 'center');
      text('$' + usd.toFixed(2), cx, cy - 8, 18, C.yellow, 'center', '#000', 900);
      text('Bản web làm lại: không nối cổng thanh toán nào, bấm mua là nhận ngay.', cx, cy + 16, 8, C.label, 'center');
      greenBtn(cx - 110, cy + 40, 100, 22, 'Xác nhận mua'); hit(cx - 110, cy + 40, 100, 22, 'shopPay');
      smallBtn(cx + 10, cy + 42, 100, 18, 'Huỷ'); hit(cx + 10, cy + 40, 100, 22, 'shopBack');
    }
  }
  ui.openSeasonShop = () => { ui.paused = true; ui.shop = { step: 'list' }; setWorldPause(true); };

  // ---------------------------------------------------------------- mở / đóng
  // world.js gọi ui.open('warehouse'|'store'|'quest'|'training'|'design', G) khi bấm E ở công trình.
  const NOT_YET = { training: 'Khu huấn luyện chưa có ở bản web', design: 'Bàn thiết kế chưa có ở bản web' };
  ui.open = function (tab, mode) {
    if (NOT_YET[tab]) { say(NOT_YET[tab]); return false; }
    if (tab === 'warehouse' || tab === 'store') { mode = tab; tab = 'bag'; }
    else if (typeof mode !== 'string') mode = ui.panel ? ui.mode : null;
    ui.panel = true; ui.tab = tab || 'bag'; ui.mode = mode;
    if (ui.tab === 'map') ui.mapFresh = true;
    inv.atWarehouse = ui.mode === 'warehouse';
    I.held = {}; I.btn = {}; I.stick.active = false;
    return true;
  };
  ui.openWarehouse = () => ui.open('bag', 'warehouse');
  ui.openStore = () => ui.open('bag', 'store');
  function setWorldPause(on) { const S = SK.G && SK.G.season; if (S) S.paused = !!on; }
  ui.close = function () {
    if (ui.paused) setWorldPause(false); ui.panel = null; ui.mode = null; ui.sel = null; inv.atWarehouse = false; drag = null; ui.paused = false; ui.help = false; ui.shop = null; };
  ui.isOpen = () => !!(ui.panel || ui.paused);
  ui.openPause = () => { ui.paused = true; setWorldPause(true); };

  // ---------------------------------------------------------------- render
  ui.render = function (_ctx, G) {
    G = G || SK.G;
    ctx = SK.hudCtx; if (!ctx || !G) return;
    const cv = ctx.canvas;
    dpr = SK.view.dpr || 1;
    // đủ chỗ cho bố cục 693 x 320 của ảnh chụp; màn khác tỉ lệ thì dư ra ở cạnh (nút bám theo mép)
    d = Math.max(0.75, Math.min(cv.height / 320, cv.width / 693));
    UW = cv.width / d; UH = cv.height / d;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.imageSmoothingEnabled = false;
    hits = [];
    if (!G.player) return;
    worldText(G);
    if (G.hurtT > 0) {
      const g = ctx.createRadialGradient(UW / 2, UH / 2, UH * 0.35, UW / 2, UH / 2, UW * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(200,0,0,' + Math.min(0.6, G.hurtT * 1.1) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, UW, UH);
    }
    if (ui.panel) {
      coinBox(UW - 147, 12);
      if (ui.tab === 'bag') drawBag(G); else if (ui.tab === 'map') drawMap(G); else drawQuest(G);
      tabBar();
      if (ui.tab === 'bag') quickSlots(G);
    } else {
      drawStatus(G);
      leftButtons();
      coinBox(UW - 141, 12);
      pauseBtn();
      quickSlots(G);
      sprintBtn();
      combatBtns(G);
      joystick();
    }
    if (ui.paused) { if (ui.shop) drawShop(); else drawPause(); }
    if (drag && drag.moved) {
      const st = inv.get(drag.from);
      if (st) { ctx.save(); ctx.globalAlpha = 0.85; itemIcon(st.id, drag.x, drag.y, 26); ctx.restore(); }
    }
    const tip = hover && hover.tip;
    if (tip) { const w = textW(tip, 7.5) + 10; rrect(hoverX - w / 2, hoverY - 20, w, 12, 3, 'rgba(0,0,0,0.85)'); text(tip, hoverX, hoverY - 14, 7.5, C.white, 'center'); }
    toast(G);
    SK.emit('seasonHud', ctx, G, { d, UW, UH });
  };
  // cho kiểm thử / world: số đo hiện tại
  ui.metrics = () => ({ d, UW, UH, dpr });
  ui.hits = () => hits.slice();

  // ---------------------------------------------------------------- input
  const keyQ = [];
  addEventListener('keydown', e => {
    if (!SK.G || SK.G.state !== 'season') return;
    const k = e.code;
    // bảng tạm dừng làm đứng cả step() nên Esc phải xử lý ngay tại đây
    if (k === 'Escape' && ui.paused) { if (ui.shop) ui.shop = null; else ui.close(); return; }
    if ((k === 'Escape' || k === 'KeyP') && !ui.panel && !ui.paused) { ui.openPause(); return; }
    if (k === 'Tab' || k === 'Escape' || k === 'KeyB' || k === 'KeyN' || k === 'KeyU' || k === 'ShiftLeft' || k === 'ShiftRight' ||
      k === 'Digit1' || k === 'Digit2' || k === 'Digit3') {
      if (!e.repeat) keyQ.push(k);
      if (k === 'Tab') e.preventDefault();
    }
  });
  let drag = null, hover = null, hoverX = 0, hoverY = 0, pan = null;
  const ptrs = {};
  function toUI(e) { return [e.clientX * dpr / d, e.clientY * dpr / d]; }
  function onDown(e) {
    const G = SK.G;
    if (!G || G.state !== 'season' || !G.player) return;
    if (e.target && e.target.id !== 'sk-hud') return;
    const [x, y] = toUI(e);
    const h = hitAt(x, y);
    if (e.pointerType === 'touch') I.touchMode = true;
    if (!ui.isOpen() && !h) return;   // để engine lo cần điều khiển / bắn
    e.stopImmediatePropagation(); e.preventDefault();
    ptrs[e.pointerId] = { h, x, y };
    if (!h) return;
    if (h.act === 'btn') { I.btn[h.btn] = true; I.edge[h.btn] = true; return; }
    if (h.act === 'slot') { drag = { from: h.ref, x, y, sx: x, sy: y, moved: false, pid: e.pointerId }; return; }
    if (h.act === 'mapPan') { pan = { x, y, cx: mapView.cx, cy: mapView.cy }; return; }
    if (h.act === 'scrollArea') { pan = { x, y, key: h.key, s0: scroll[h.key] }; return; }
    if (h.act === 'zoomBar') { zoomBarAt(h, y); pan = { zoomBar: h }; return; }
    click(h);
  }
  function zoomBarAt(h, y) {
    const k = 1 - Math.max(0, Math.min(1, (y - h.t0) / (h.t1 - h.t0))), a = zoomMin(h.info);
    setZoom(a * Math.pow(6, k), h.info);
  }
  function onMove(e) {
    const [x, y] = toUI(e);
    hoverX = x; hoverY = y;
    hover = ui.isOpen() ? hitAt(x, y) : null;
    if (drag && drag.pid === e.pointerId) {
      drag.x = x; drag.y = y;
      if (Math.hypot(x - drag.sx, y - drag.sy) > 4) drag.moved = true;
      const h = hitAt(x, y);
      drag.over = h && h.act === 'slot' ? h.ref : null;
      drag.overQuick = h && h.act === 'quick' ? h.i : null;
      e.stopImmediatePropagation();
    } else if (pan && ptrs[e.pointerId]) {
      if (pan.zoomBar) zoomBarAt(pan.zoomBar, y);
      else if (pan.key) scroll[pan.key] = Math.round(pan.s0 - (y - pan.y) / 39);
      else { mapView.cx = pan.cx - (x - pan.x) / mapView.zoom; mapView.cy = pan.cy - (y - pan.y) / mapView.zoom; }
      e.stopImmediatePropagation();
    }
  }
  function onUp(e) {
    const p = ptrs[e.pointerId]; if (!p) return;
    delete ptrs[e.pointerId];
    e.stopImmediatePropagation();
    if (p.h && p.h.act === 'btn' && !Object.values(ptrs).some(q => q.h && q.h.btn === p.h.btn)) I.btn[p.h.btn] = false;
    if (pan) { const wasTap = pan.key && Math.abs(toUI(e)[1] - pan.y) < 4; pan = null; if (wasTap) { const h = hitAt(...toUI(e)); if (h && h.act === 'slot') click(h); } return; }
    if (drag && drag.pid === e.pointerId) {
      const [x, y] = toUI(e), dr = drag; drag = null;
      if (!dr.moved) { click({ act: 'slot', ref: dr.from }); return; }
      const h = hitAt(x, y);
      if (h && h.act === 'slot') { const why = inv.move(dr.from, h.ref); if (why) say(why); else ui.sel = inv.get(h.ref) ? h.ref : null; }
      else if (h && h.act === 'quick') { const st = inv.get(dr.from); if (st && inv.usable(st.id)) inv.state.quick[h.i] = st.id; else say('Chỉ gắn được thuốc / đồ ăn'); }
    }
  }
  function onWheel(e) {
    if (!ui.panel) return;
    const [x, y] = toUI(e), h = hitAt(x, y);
    if (ui.tab === 'map') { const info = mapInfo(SK.G); setZoom(mapView.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), info); }
    else if (h && (h.key || h.act === 'slot')) { const key = h.key || (h.ref.c === 'wh' ? 'wh' : 'bag'); scroll[key] += e.deltaY > 0 ? 1 : -1; }
    e.preventDefault();
  }
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', onMove, true);
  addEventListener('pointerup', onUp, true);
  addEventListener('pointercancel', onUp, true);
  addEventListener('wheel', onWheel, { capture: true, passive: false });

  function click(h) {
    const G = SK.G;
    switch (h.act) {
      case 'open': ui.open(h.tab, null); break;
      case 'tab': ui.tab = h.tab; ui.sel = null; if (h.tab === 'map') ui.mapFresh = true; break;
      case 'close': ui.close(); break;
      case 'pause': ui.openPause(); break;
      case 'quick':
        if (ui.panel) { if (ui.sel && inv.get(ui.sel) && inv.usable(inv.get(ui.sel).id)) inv.state.quick[h.i] = inv.get(ui.sel).id; else inv.state.quick[h.i] = null; }
        else { const why = inv.useQuick(G, h.i); if (why) say(why); }
        break;
      case 'sprint': doSprint(G); break;
      case 'slot': {
        const st = inv.get(h.ref);
        if (!st) { if (ui.sel && inv.get(ui.sel)) { const why = inv.move(ui.sel, h.ref); if (why) say(why); ui.sel = null; } break; }
        if (ui.sel && same(ui.sel, h.ref)) { const why = inv.quickMove(h.ref); if (why) say(why); ui.sel = null; }
        else ui.sel = h.ref;
        break;
      }
      case 'act': doAct(h.a); break;
      case 'filter': ui.filter = h.i; break;
      case 'sort': inv.sort(h.where); ui.sel = null; break;
      case 'storeAll': { const why = inv.storeAll(); if (why) say(why); break; }
      case 'buy': { const why = inv.buy(h.id); say(why || 'Đã mua ' + SS.itemDef(h.id).name); break; }
      case 'upgradeWh': { const why = inv.upgradeWarehouse(); say(why ? why + ' — ' + h.tip : 'Kho đã lên cấp ' + inv.state.warehouseLv); break; }
      case 'zoom': setZoom(mapView.zoom * h.k, mapInfo(G)); break;
      case 'qtab': questView.tab = h.tab; questView.sel = null; break;
      case 'qsel': questView.sel = h.id; break;
      case 'claim': { const why = Q().claim(h.id); say(why || 'Đã nhận thưởng'); break; }
      case 'pauseAct':
        if (h.a === 'resume') ui.close();
        else if (h.a === 'shop') ui.shop = { step: 'list' };
        else if (h.a === 'help') ui.help = !ui.help;
        else if (h.a === 'exit') { inv.save(); ui.close(); if (SS.exit) SS.exit(); else if (SK.lobby) SK.lobby.enter(); }
        break;
      case 'shopClose': ui.shop = null; break;
      case 'shopPick': ui.shop = { step: 'pay', pack: h.i }; break;
      case 'shopBack': ui.shop = { step: 'list' }; break;
      case 'shopPay': {
        const [, c, b] = SEASON_PACKS[ui.shop.pack], S = inv.state;
        S.seasonCoins = (S.seasonCoins || 0) + c + b; inv.save();
        say('Đã nhận ' + fmt(c + b) + ' xu mùa'); ui.shop = { step: 'list' };
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- lướt (Sprint)
  function doSprint(G) {
    const p = G && G.player;
    if (!p || p.st === 'dead' || ui.isOpen()) return false;
    if (sprint.cd > 0) return false;
    const mv = I.moveVec();
    let dx = mv.x, dy = mv.y;
    if (Math.hypot(dx, dy) < 0.1) { dx = p.face || 1; dy = 0; }
    const m = Math.hypot(dx, dy); dx /= m; dy /= m;
    sprint.t = sprint.inv; sprint.cd = sprint.max; sprint.dx = dx; sprint.dy = dy;
    if (!p._sprintHook) {
      const prev = p.onHurt;
      p.onHurt = (G2, p2, dmg) => (sprint.t > 0 ? 0 : prev ? prev(G2, p2, dmg) : dmg);
      p._sprintHook = true;
    }
    SK.fx && SK.fx(G, 'dust', p.x, p.y, { dur: 0.3 });
    SK.emit('seasonSprint', G, p);
    return true;
  }
  ui.sprint = () => doSprint(SK.G);

  // Mỗi bước; true = đang mở bảng (world tạm ngưng điều khiển nhân vật).
  ui.update = function (dt) {
    const G = SK.G;
    ui.msgT = Math.max(0, ui.msgT - dt);
    if (G && G.player) inv.tick(G, dt);
    const p = G && G.player;
    sprint.cd = Math.max(0, sprint.cd - dt);
    if (sprint.t > 0 && p) {
      const step = Math.min(dt, sprint.t), v = sprint.dist / sprint.inv;
      if (G.map && SK.moveBox) SK.moveBox(G.map, p, sprint.dx * v * step, sprint.dy * v * step, (p.h.body && p.h.body.r) || 4);
      sprint.t -= dt;
      if (Math.random() < 0.6 && SK.fx) SK.fx(G, 'dust', p.x, p.y, { dur: 0.2 });
    }
    while (keyQ.length) {
      const k = keyQ.shift();
      if (k === 'Escape') { if (ui.isOpen()) ui.close(); }
      else if (k === 'Tab' || k === 'KeyB') { if (ui.panel && ui.tab === 'bag') ui.close(); else ui.open('bag', ui.panel ? ui.mode : null); }
      else if (k === 'KeyN') { if (ui.panel && ui.tab === 'map') ui.close(); else ui.open('map', ui.panel ? ui.mode : null); }
      else if (k === 'KeyU') { if (ui.panel && ui.tab === 'quest') ui.close(); else ui.open('quest', ui.panel ? ui.mode : null); }
      else if (k === 'ShiftLeft' || k === 'ShiftRight') doSprint(G);
      else if (k.startsWith('Digit') && !ui.isOpen() && G) { const why = inv.useQuick(G, +k.slice(5) - 1); if (why) say(why); }
    }
    return ui.isOpen();
  };
})();
