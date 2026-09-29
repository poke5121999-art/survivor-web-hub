// HUD kiểu SK, vẽ trên canvas phân giải thật (chữ sắc) nhưng toạ độ tính bằng pixel game.
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS;

  const ICONS = {
    heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    shield: ['XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    gem: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
  };
  function icon(ctx, name, x, y, color, dark) {
    const rows = ICONS[name];
    ctx.fillStyle = dark;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'X') ctx.fillRect(x + i + 0.5, y + j + 0.5, 1, 1); });
    ctx.fillStyle = color;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'X') ctx.fillRect(x + i, y + j, 1, 1); });
  }

  // Bố cục nút (pixel game) — dùng chung cho vẽ và bấm chạm.
  function layout() {
    const v = SK.view, W = v.w, H = v.h;
    return {
      attack: { cx: W - 46, cy: H - 34, r: 20 },
      skill: { cx: W - 16, cy: H - 17, r: 12 },
      slot: { x: W - 78, y: H - 76, w: 48, h: 18 },
      map: { x: W - 58, y: 16, w: 54, h: 54 }
    };
  }

  const hud = SK.hud = {};
  hud.hitButton = function (xCss, yCss) {
    const v = SK.view, x = xCss / v.scale, y = yCss / v.scale, L = layout();
    const G = SK.G;
    if (G.state !== 'stage') return null;
    const inC = c => Math.hypot(x - c.cx, y - c.cy) <= c.r + 3;
    if (inC(L.skill)) return 'skill';
    const s = L.slot;
    if (x >= s.x && x <= s.x + s.w && y >= s.y - 12 && y <= s.y + s.h) return 'swap';
    if (SK.input.touchMode && inC(L.attack)) return 'attack';
    return null;
  };

  function bar(ctx, x, y, w, h, cur, max, color, dark, iconName) {
    icon(ctx, iconName, x, y + 1, color, '#1a0f08');
    const bx = x + 9;
    ctx.fillStyle = '#1b120b'; ctx.fillRect(bx, y, w, h);
    ctx.fillStyle = '#3a2a1e'; ctx.fillRect(bx + 1, y + 1, w - 2, h - 2);
    const k = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
    ctx.fillStyle = dark; ctx.fillRect(bx + 1, y + 1, Math.round((w - 2) * k), h - 2);
    ctx.fillStyle = color; ctx.fillRect(bx + 1, y + 1, Math.round((w - 2) * k), h - 4);
    SK.text(ctx, Math.ceil(cur) + '/' + max, bx + w / 2, y + h / 2 + 0.5, 8, '#ffffff', 'center', 'rgba(0,0,0,0.85)');
  }

  function statusPanel(ctx, p) {
    const x = 3, y = 3, w = 92, h = 37;
    ctx.fillStyle = '#2a1b10'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#7a5433'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#4b3220'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    bar(ctx, x + 4, y + 4, 75, 9, p.hp, p.hpMax, '#e8453c', '#a8231d', 'heart');
    bar(ctx, x + 4, y + 14, 75, 9, p.armor, p.armorMax, '#a3acb9', '#6b7280', 'shield');
    bar(ctx, x + 4, y + 24, 75, 9, p.energy, p.energyMax, '#3d8fe8', '#1f5aa8', 'gem');
  }

  function goldAndMap(ctx, G) {
    const L = layout(), m = L.map, v = SK.view;
    const gx = v.w - 8;
    SK.text(ctx, String(G.player.gold), gx, 8, 10, '#ffffff', 'right', 'rgba(0,0,0,0.8)');
    ctx.font = '10px ' + SK.FONT;
    const tw = ctx.measureText(String(G.player.gold)).width;
    const coin = SK.art.object('coin');
    if (!SK.drawPrefab(ctx, coin, gx - tw - 6, 12, { t: G.t, state: 'coin_gold' })) {
      ctx.fillStyle = '#f5c542'; ctx.fillRect(gx - tw - 9, 5, 5, 6);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(m.x, m.y, m.w, m.h);
    const map = G.map, cell = 10, ox = m.x + 2, oy = m.y + 2;
    const cpos = r => [ox + r.gx * cell + cell / 2, oy + r.gy * cell + cell / 2];
    ctx.fillStyle = '#c9d1db';
    for (const r of map.rooms) {
      if (!r.seen) continue;
      for (const l of r.links) {
        const o = map.rooms[l]; if (!o.seen || l < r.id) continue;
        const [ax, ay] = cpos(r), [bx, by] = cpos(o);
        ctx.fillRect(Math.min(ax, bx) - 1, Math.min(ay, by) - 1, Math.abs(bx - ax) + 2, Math.abs(by - ay) + 2);
      }
    }
    const COLORS = { chest: '#ffd23a', end: '#5aa8ff', boss: '#ff4a4a', special: '#6fdc6a' };
    for (const r of map.rooms) {
      if (!r.seen) continue;
      const [cx, cy] = cpos(r), s = r.type === 'battle' || r.type === 'boss' ? 7 : 6;
      const cur = G.room === r;
      ctx.fillStyle = cur ? '#ffffff' : r.visited ? '#9aa6b4' : '#4a5563';
      ctx.fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
      if (COLORS[r.type]) { ctx.fillStyle = COLORS[r.type]; ctx.fillRect(Math.round(cx - 1.5), Math.round(cy - 1.5), 3, 3); }
      if (cur) { ctx.strokeStyle = '#ffe06a'; ctx.lineWidth = 0.6; ctx.strokeRect(Math.round(cx - s / 2) - 0.8, Math.round(cy - s / 2) - 0.8, s + 1.6, s + 1.6); }
    }
    SK.text(ctx, G.stage.label, m.x + m.w / 2, m.y + m.h + 8, 12, '#ffffff', 'center', 'rgba(0,0,0,0.85)');
  }

  function weaponAndSkill(ctx, G) {
    const L = layout(), p = G.player, s = L.slot, touch = SK.input.touchMode;
    if (touch) {
      const a = L.attack;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(a.cx, a.cy, a.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(a.cx, a.cy, 7, 0, Math.PI * 2); ctx.moveTo(a.cx - 11, a.cy); ctx.lineTo(a.cx + 11, a.cy); ctx.moveTo(a.cx, a.cy - 11); ctx.lineTo(a.cx, a.cy + 11); ctx.stroke();
      if (G.interactTarget) SK.text(ctx, 'Nhặt', a.cx, a.cy + a.r + 5, 8, '#ffe06a', 'center', '#000');
    }
    const w = p.weapons[p.cur], other = p.weapons[1 - p.cur];
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6; ctx.strokeRect(s.x + 0.3, s.y + 0.3, s.w - 0.6, s.h - 0.6);
    SK.drawGun(ctx, w.def.sprite, s.x + s.w / 2 - 6, s.y + s.h / 2 + 1, 0, null, {});
    icon(ctx, 'gem', s.x + 2, s.y + 2, '#3d8fe8', '#000');
    SK.text(ctx, String(w.def.cost || 0), s.x + 12, s.y + 5.5, 8, '#ffffff', 'left', '#000');
    if (other) {
      ctx.save(); ctx.globalAlpha = 0.75;
      SK.drawGun(ctx, other.def.sprite, s.x + s.w - 14, s.y - 6, 0, null, { scale: 0.75 });
      ctx.restore();
      SK.text(ctx, touch ? '⇄' : 'Q', s.x + s.w - 2, s.y - 6, 8, '#ffe06a', 'right', '#000');
    }
    const k = L.skill, sk = p.h.skill;
    ctx.fillStyle = 'rgba(20,40,80,0.75)'; ctx.beginPath(); ctx.arc(k.cx, k.cy, k.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.skillT > 0 ? '#ffe06a' : '#7fd3ff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = p.skillCd > 0 ? '#6b7c95' : '#ffe04a';
    ctx.beginPath();
    ctx.moveTo(k.cx + 1.5, k.cy - 7); ctx.lineTo(k.cx - 4, k.cy + 1); ctx.lineTo(k.cx - 0.5, k.cy + 1);
    ctx.lineTo(k.cx - 1.5, k.cy + 7); ctx.lineTo(k.cx + 4, k.cy - 1); ctx.lineTo(k.cx + 0.5, k.cy - 1); ctx.closePath(); ctx.fill();
    if (p.skillCd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.moveTo(k.cx, k.cy);
      ctx.arc(k.cx, k.cy, k.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.skillCd / sk.cd)); ctx.closePath(); ctx.fill();
      SK.text(ctx, String(Math.ceil(p.skillCd)), k.cx, k.cy, 10, '#ffffff', 'center', '#000');
    } else if (p.skillT > 0) {
      ctx.strokeStyle = '#ffe06a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(k.cx, k.cy, k.r + 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.skillT / sk.dur)); ctx.stroke();
    }
    if (!touch) SK.text(ctx, 'K', k.cx + k.r - 1, k.cy - k.r + 1, 7, '#ffe06a', 'center', '#000');
  }

  function joystick(ctx) {
    const st = SK.input.stick, v = SK.view;
    if (!SK.input.touchMode) return;
    const ox = st.active ? st.ox / v.scale : 40, oy = st.active ? st.oy / v.scale : v.h - 40;
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(ox, oy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    let kx = ox, ky = oy;
    if (st.active) {
      const dx = (st.x - st.ox) / v.scale, dy = (st.y - st.oy) / v.scale, m = Math.hypot(dx, dy), R = 16;
      kx += m > R ? dx / m * R : dx; ky += m > R ? dy / m * R : dy;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(kx, ky, 9, 0, Math.PI * 2); ctx.fill();
  }

  function worldText(ctx, G) {
    const cam = G.view || G.cam;
    for (const n of G.nums) {
      const k = n.t / 0.8;
      const y = n.y - cam.y - 10 * Math.min(1, k * 3);
      ctx.save(); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      SK.text(ctx, String(n.val), n.x - cam.x, y, n.big ? 12 : 9, n.color, 'center', 'rgba(0,0,0,0.9)');
      ctx.restore();
    }
    const it = G.interactTarget;
    if (it) SK.text(ctx, (SK.input.touchMode ? '' : '[E] ') + it.label, it.x - cam.x, it.y - cam.y, 8, '#ffe06a', 'center', 'rgba(0,0,0,0.9)');
  }

  function overlays(ctx, G) {
    const v = SK.view;
    if (G.hurtT > 0) {
      const g = ctx.createRadialGradient(v.w / 2, v.h / 2, v.h * 0.35, v.w / 2, v.h / 2, v.w * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(200,0,0,' + (G.hurtT * 1.1) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.h);
    }
    if (G.phase === 'enter' && G.phaseT < 1.8) {
      const t = G.phaseT;
      if (t < 0.35) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - t / 0.35) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
      const a = t < 0.3 ? t / 0.3 : t > 1.4 ? (1.8 - t) / 0.4 : 1;
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, v.h * 0.32, v.w, 40);
      SK.text(ctx, G.stage.label, v.w / 2, v.h * 0.32 + 15, 22, '#ffffff', 'center', '#000');
      SK.text(ctx, DS.themeNames[G.stage.theme] || G.stage.theme, v.w / 2, v.h * 0.32 + 32, 10, '#bfe3ff', 'center', '#000');
      ctx.restore();
    }
    if (G.phase === 'portal') { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, G.phaseT / 0.8) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    if (G.banner) SK.text(ctx, G.banner.text, v.w / 2, 22, 14, '#ff5a4a', 'center', '#000');
    if (G.toastT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, G.toastT * 3);
      SK.text(ctx, G.toastMsg, v.w / 2, v.h - 30, 10, '#ffffff', 'center', 'rgba(0,0,0,0.9)');
      ctx.restore();
    }
  }

  hud.render = function (G) {
    const ctx = SK.hudCtx, v = SK.view, k = v.scale * v.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (G.state === 'lobby' || !G.player || !G.map) return;
    worldText(ctx, G);
    statusPanel(ctx, G.player);
    goldAndMap(ctx, G);
    weaponAndSkill(ctx, G);
    joystick(ctx);
    SK.emit('hud', ctx, G);
    overlays(ctx, G);
  };
})();
