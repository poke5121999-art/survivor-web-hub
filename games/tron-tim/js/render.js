// Vẽ thế giới: sàn, vật cản, bụi, nhân vật xếp theo y, vùng an toàn, vòng cứu, cổng. Camera bám người chơi (hoặc đồng đội khi gục).
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, D = SK.D, W = SK.world, MU = TT.mapUtil, C = TT.C;
  const T = 16, G = TT.G = {};   // G của SK.vfx: chỉ cần một đối tượng rỗng
  const cam = TT.cam = { x: 0, y: 0, snap: true };
  const floaters = [];

  // ---------------------------------------------------------------- người đang xem
  TT.viewerOf = m => {
    const h = m.human;
    if (h.life === 'alive' || h.life === 'escaped') return h;
    return m.actors.find(a => a.role === h.role && a.life === 'alive') || m.actors.find(a => a.life === 'alive') || h;
  };

  // ---------------------------------------------------------------- hiệu ứng theo sự kiện
  const vfxAt = (name, x, y, o) => SK.vfx.has(name) && SK.vfx.spawn(G, name, x * T, y * T, Object.assign({ layer: 'top' }, o));
  function bind(m) {
    const A = id => m().actors[id];
    TT.onEvent('catch', e => { const v = A(e.id); vfxAt('hit_red', v.x, v.y - 0.8); });
    TT.onEvent('attack', e => { const a = A(e.id); vfxAt('hit_yellow', a.x + Math.cos(e.ang) * 1, a.y - 0.6 + Math.sin(e.ang) * 1, { ang: e.ang }); });
    TT.onEvent('miss', e => floaters.push({ x: e.x, y: e.y - 1.8, text: 'MISS', until: m().now + 1.2, color: '#ffd84a' }));
    TT.onEvent('revive', e => { const v = A(e.id); vfxAt('reborn_smoke', v.x, v.y); vfxAt('effect_health_skill', v.x, v.y); });
    TT.onEvent('transform', e => { const a = A(e.id); vfxAt('smoke', a.x, a.y); });
    TT.onEvent('escape', e => { const a = A(e.id); vfxAt('explode_energy2_orange', a.x, a.y); });
    TT.onEvent('box', e => vfxAt(e.kind === 'buff' ? 'buff_atkspeedup' : 'buff_dizzy', A(e.id).x, A(e.id).y));
  }
  TT.bindRenderEvents = bind;

  // ---------------------------------------------------------------- bộ vẽ lẻ
  function drawBush(ctx, a, b) {
    const w = a, x = b.tx * T + 8, y = (b.ty + 1) * T;
    SK.draw(ctx, w.front, x, y);
    if (w.top) SK.draw(ctx, w.top, x, y - w.atTop);
  }

  const tinted = {};
  function itemSprite(kind) {
    if (tinted[kind]) return tinted[kind];
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 40;
    const c = cv.getContext('2d');
    SK.drawPrefab(c, D.prefabs.box05, 16, 36, {});
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = kind === 'buff' ? 'rgba(60,255,120,0.55)' : 'rgba(255,50,60,0.55)';
    c.fillRect(0, 0, 32, 40);
    return (tinted[kind] = cv);
  }
  function drawItem(ctx, it, m) {
    const bob = Math.sin(m.now * 3 + it.x) * 2, x = Math.round(it.x * T), y = Math.round(it.y * T) + 6;
    ctx.fillStyle = it.kind === 'buff' ? 'rgba(60,255,120,0.35)' : 'rgba(255,50,60,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y, 10, 4, 0, 0, 7); ctx.fill();
    ctx.drawImage(itemSprite(it.kind), x - 16, y - 36 - bob);
  }

  function drawBomb(ctx, b, m) {
    const x = Math.round(b.x * T), y = Math.round(b.y * T);
    ctx.fillStyle = '#1b1b24'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
    ctx.fillStyle = (m.now * 4 | 0) % 2 ? '#ff4040' : '#ffd84a'; ctx.fillRect(x - 1, y - 7, 2, 3);
  }

  function drawGate(ctx, m) {
    const g = m.gate, x = Math.round(g.x * T), y = Math.round(g.y * T) + 8;
    const open = g.state === 'open', st = open ? 'transfer_gate' : g.state === 'counting' ? 'create_gate' : 'close_gate';
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.globalAlpha = open ? 1 : g.state === 'counting' ? 0.8 : 0.45;
    SK.drawPrefab(ctx, D.prefabs.transfer_gate, x, y, { t: m.now, state: st, scale: 0.5 });
    ctx.restore();
  }

  function drawGateGlow(ctx, m) {
    const g = m.gate;
    if (g.state === 'closed') return;
    const x = g.x * T, y = g.y * T, r = TT.MATCH.GATE_RADIUS * T, k = g.state === 'open' ? 1 : 0.4;
    const grd = ctx.createRadialGradient(x, y, 2, x, y, r);
    grd.addColorStop(0, 'rgba(120,200,255,' + 0.5 * k + ')'); grd.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }

  function drawFootprints(ctx, m) {
    for (const p of m.prints) {
      const age = (m.now - p.at) / 15;
      ctx.fillStyle = 'rgba(40,90,150,' + (0.55 * (1 - age)) + ')';
      ctx.fillRect(Math.round(p.x * T) - 2, Math.round(p.y * T) + 3, 3, 2);
      ctx.fillRect(Math.round(p.x * T) + 1, Math.round(p.y * T) + 1, 3, 2);
    }
  }

  function drawReviveCircles(ctx, m, viewer) {
    for (const d of m.actors) {
      if (d.role !== 'hide' || d.life !== 'downed' || viewer.role !== 'hide') continue;
      const x = d.x * T, y = d.y * T + 5, r = C.REVIVE_RADIUS * T;
      ctx.save();
      ctx.fillStyle = 'rgba(80,255,140,0.12)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6dff9a'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      const left = Math.max(0, 1 - (m.now - d.downedAt) / C.REVIVE_WINDOW);
      ctx.strokeStyle = left < 0.27 ? '#ff5a4a' : '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - 22, 6, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * left); ctx.stroke();
      if (d.revive.t > 0) {
        ctx.strokeStyle = '#6dff9a'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * d.revive.t / C.REVIVE_TIME); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawSwing(ctx, a) {
    if (!a.swing) return;
    const k = a.swing.t / 0.3, x = a.x * T, y = a.y * T - 4;
    ctx.save();
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, C.ATTACK_RANGE * T * (0.6 + 0.4 * k), a.swing.ang - C.ATTACK_ARC, a.swing.ang + C.ATTACK_ARC); ctx.stroke();
    ctx.restore();
  }

  function drawScanMark(ctx, a, m, viewer) {
    if (a.role === viewer.role || !TT.hasEffect(a, 'reveal', m.now)) return;
    const x = Math.round(a.x * T), y = Math.round(a.y * T);
    ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 5, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x - 4, y - 40); ctx.lineTo(x + 4, y - 40); ctx.fill();
  }

  // ---------------------------------------------------------------- vùng an toàn
  function drawZone(ctx, m, vw, vh) {
    const z = m.zone, c = z.cur;
    ctx.save();
    ctx.fillStyle = 'rgba(40,10,60,0.38)';
    ctx.beginPath();
    ctx.rect(cam.x - 8, cam.y - 8, vw + 16, vh + 16);
    ctx.arc(c.x * T, c.y * T, c.r * T, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#d6b3ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x * T, c.y * T, c.r * T, 0, 7); ctx.stroke();
    if (z.next) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(z.next.x * T, z.next.y * T, z.next.r * T, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFloaters(ctx, m) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      if (f.until <= m.now) { floaters.splice(i, 1); continue; }
      SK.text(ctx, f.text, Math.round(f.x * T), Math.round((f.y - (1.2 - (f.until - m.now)) * 0.6) * T), 10, f.color, 'center', '#000');
    }
  }

  // mũi tên chỉ cổng khi cổng đã mở mà đang ở ngoài màn hình (toạ độ màn hình lôgic)
  function drawGateArrow(ctx, m, vw, vh) {
    if (m.gate.state !== 'open') return;
    const sx = m.gate.x * T - cam.x, sy = m.gate.y * T - cam.y, mg = 14;
    if (sx > mg && sx < vw - mg && sy > mg && sy < vh - mg) return;
    const cx = vw / 2, cy = vh / 2, dx = sx - cx, dy = sy - cy, k = Math.min((vw / 2 - mg) / Math.abs(dx || 1e-6), (vh / 2 - mg) / Math.abs(dy || 1e-6));
    const x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#8fd8ff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- khung hình
  function followCamera(m, viewer, vw, vh) {
    const tx = Math.round(viewer.x * T - vw / 2), ty = Math.round(viewer.y * T - vh / 2 - 8);
    if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; return; }
    cam.x += (tx - cam.x) * 0.18; cam.y += (ty - cam.y) * 0.18;
    if (Math.abs(tx - cam.x) < 0.5) cam.x = tx;
    if (Math.abs(ty - cam.y) < 0.5) cam.y = ty;
  }

  function gather(m, viewer, vw, vh) {
    const map = m.map, list = [];
    W.collect(list, map, { x: Math.round(cam.x), y: Math.round(cam.y) }, vw, vh, m.now);
    const x0 = Math.max(0, Math.floor(cam.x / T) - 1), x1 = Math.min(map.W - 1, Math.floor((cam.x + vw) / T) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / T) - 1), y1 = Math.min(map.H - 1, Math.floor((cam.y + vh) / T) + 2);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
      if (map.grass[ty * map.W + tx]) list.push({ y: (ty + 1) * T, fn: drawBush, a: map.bush, b: { tx, ty } });
    for (const it of m.items) if (it.readyAt <= m.now) list.push({ y: it.y * T, fn: (c) => drawItem(c, it, m) });
    for (const b of m.bombs) list.push({ y: b.y * T - 1e6, fn: (c) => drawBomb(c, b, m) });
    list.push({ y: m.gate.y * T - 8, fn: (c) => drawGate(c, m) });
    for (const a of m.actors) {
      const alpha = TT.alphaFor(m, viewer, a);
      if (alpha <= 0) continue;
      list.push({ y: a.y * T, fn: c => { drawScanMark(c, a, m, viewer); TT.drawActor(c, m, viewer, a, alpha); drawSwing(c, a); } });
    }
    return list.sort((p, q) => p.y - q.y);
  }

  // Lớp vẽ thêm trong toạ độ thế giới (px), sau nhân vật, trước vùng an toàn: kỹ năng, UI gắn đầu nhân vật.
  TT.worldLayers = [];

  TT.render = function (ctx, m, dt) {
    const v = SK.view, vw = v.w, vh = v.h, viewer = TT.viewerOf(m);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = m.map.bg || '#051f28'; ctx.fillRect(0, 0, vw, vh);
    followCamera(m, viewer, vw, vh);
    SK.vfx.update(G, dt);
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    W.drawFloor(ctx, m.map, { x: Math.round(cam.x), y: Math.round(cam.y) }, vw, vh);
    SK.vfx.draw(ctx, G, 'ground');
    drawFootprints(ctx, m); drawGateGlow(ctx, m); drawReviveCircles(ctx, m, viewer);
    for (const e of gather(m, viewer, vw, vh)) e.fn(ctx, e.a, e.b);
    for (const a of m.actors) { const al = TT.alphaFor(m, viewer, a); if (al > 0) TT.nameTag(ctx, m, viewer, a, al); }
    for (const f of TT.worldLayers) f(ctx, m, viewer);
    drawZone(ctx, m, vw, vh);
    SK.vfx.draw(ctx, G, 'top');
    drawFloaters(ctx, m);
    ctx.restore();
    drawGateArrow(ctx, m, vw, vh);
  };
})();
