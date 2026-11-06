// Bản đồ nhỏ: vòng tròn góc phải trên như ảnh Steam, M mở bản đồ lớn.
// Nền ghép từ ảnh minimap gốc (remote_texture_assets_minimap, tên = Sector.Id → art/object/minimap/<id>.webp);
// ô không có ảnh thì vẽ hộp va chạm của sector. Vùng chưa đi qua bị che (sương mù khám phá).
// Dấu: người chơi, lối thoát (Phonebooth), mục tiêu (Quest), trùm (Boss), cổng (Portal), ping, chữ TextMarker.
(function (VD) {
  'use strict';
  const S = 4;                 // px mỗi mét trên canvas nền
  const FOG = 1;               // ô sương mù 1 m
  const VIEW_R = 26;           // bán kính nhìn của vòng nhỏ, mét — không có trong bảng: chọn theo ảnh Steam (~1 sector)
  const REVEAL_R = 11;         // bán kính mở sương quanh người chơi — không có trong bảng

  const M = { on: false, big: false, markers: new Map(), pings: [], labels: [], bg: null, fog: null, W: null };
  const icon = n => ((VD.ASSETS && VD.ASSETS.icon && VD.ASSETS.icon.common && VD.ASSETS.icon.common.dir) || 'art/ui/icon_common/') + n + '.webp';
  const imgCache = new Map();
  function img(url) {
    if (!imgCache.has(url)) { const i = new Image(); i.src = url; imgCache.set(url, i); }
    return imgCache.get(url);
  }
  const MARK_ICON = { exit: 'Phonebooth', quest: 'Quest', QuestMarker: 'Quest', SubQuestMarker: 'Quest', boss: 'Boss', portal: 'Portal',
    PortalMarker: 'Portal', npc: 'Npc', sanctuary: 'Sanctuary', box: 'Box', player: 'PlayerPointMarker' };

  function build() {
    const ui = document.getElementById('ui') || document.body;
    const root = document.createElement('div');
    root.className = 'vd-minimap';
    root.innerHTML = '<canvas class="small"></canvas><div class="vd-map-big"><canvas></canvas><div class="legend"></div></div>';
    ui.appendChild(root);
    M.root = root;
    M.small = root.querySelector('canvas.small');
    M.bigWrap = root.querySelector('.vd-map-big');
    M.bigCanvas = M.bigWrap.querySelector('canvas');
    M.legend = M.bigWrap.querySelector('.legend');
    const T = VD.TEXT || {};
    M.legend.innerHTML = [['exit', 'UInGameMiniMapPanel_Exit_Text'], ['quest', 'UInGameMiniMapPanel_Quest_Text'], ['boss', 'UInGameMiniMapPanel_Boss_Text'],
      ['portal', 'UInGameMiniMapPanel_Portal_Text'], ['npc', 'UInGameMiniMapPanel_Npc_Text']]
      .map(([k, t]) => `<span><img src="${icon(MARK_ICON[k])}">${T[t] || k}</span>`).join('');
  }

  // world: VD.world sau khi load; cells: [{cx, cy, id, rot}] (đã dời hàng biên); play: {minX,maxX,minZ,maxZ} vùng chơi.
  M.setup = function (world, cells, play) {
    if (!M.root) build();
    M.W = world; M.play = play;
    M.markers.clear(); M.pings.length = 0; M.labels.length = 0;
    const w = Math.ceil((world.maxX - world.minX) * S), h = Math.ceil((world.maxZ - world.minZ) * S);
    const bg = document.createElement('canvas'); bg.width = w; bg.height = h;
    const g = bg.getContext('2d');
    g.fillStyle = '#0b0d12'; g.fillRect(0, 0, w, h);
    const pending = [];
    for (const sec of world.sectors) {
      const c = sec.cell, url = VD.OBJECTS && VD.OBJECTS.minimap && VD.OBJECTS.minimap[c.id];
      const drawBoxes = () => {
        g.save();
        g.fillStyle = 'rgba(120,130,150,0.55)';
        for (const col of sec.json.colliders || []) {
          if (col.trigger || col.active === false || col.kind !== 'high') continue;
          const [x, z] = sec.xf.pt(col.center[0], col.center[2]);
          g.save();
          g.translate((x - world.minX) * S, (z - world.minZ) * S);
          g.rotate(((col.yaw || 0) * Math.PI / 180) - sec.xf.ang);
          g.fillRect(-col.size[0] / 2 * S, -col.size[2] / 2 * S, col.size[0] * S, col.size[2] * S);
          g.restore();
        }
        g.restore();
      };
      if (!url) { drawBoxes(); continue; }
      pending.push(new Promise(res => {
        const im = new Image();
        im.onload = () => {
          // Ảnh 256² phủ đúng ô 30×30: hàng ảnh 0 ở z nhỏ nhất (xa camera), không lật. Xoay theo số lần xoay của ô.
          const cxp = (sec.xf.ox + 15 - world.minX) * S, czp = (sec.xf.oz - 15 - world.minZ) * S;
          g.save(); g.translate(cxp, czp); g.rotate(-sec.xf.ang);
          g.drawImage(im, -15 * S, -15 * S, 30 * S, 30 * S);
          g.restore();
          res();
        };
        im.onerror = () => { drawBoxes(); res(); };
        im.src = url;
      }));
    }
    M.bg = bg;
    // sương mù khám phá: 1 = chưa thấy
    M.fogW = Math.ceil((world.maxX - world.minX) / FOG); M.fogH = Math.ceil((world.maxZ - world.minZ) / FOG);
    M.fog = new Uint8Array(M.fogW * M.fogH).fill(1);
    M.fogCanvas = document.createElement('canvas'); M.fogCanvas.width = M.fogW; M.fogCanvas.height = M.fogH;
    M.fogCtx = M.fogCanvas.getContext('2d');
    M.fogCtx.fillStyle = '#000'; M.fogCtx.fillRect(0, 0, M.fogW, M.fogH);
    M.on = true;
    M.root.style.display = '';
    return Promise.all(pending);
  };

  M.show = function (on) { M.on = on; if (M.root) M.root.style.display = on ? '' : 'none'; if (!on) M.toggleBig(false); };
  M.toggleBig = function (on) {
    M.big = on == null ? !M.big : !!on;
    if (M.bigWrap) M.bigWrap.classList.toggle('on', M.big);
  };
  // kind: exit|quest|boss|portal|npc|box|sanctuary|QuestMarker|…; pos: {x,z} (three) hoặc hàm trả {x,z}.
  M.mark = function (id, kind, pos, label) { M.markers.set(id, { kind, pos, label }); };
  M.unmark = function (id) { M.markers.delete(id); };
  M.ping = function (pos, type) { M.pings.push({ pos, type, t: 0, life: VD.combatDB ? VD.combatDB().c('MiniMapPingDuration', 7) : 7 }); };
  M.label = function (pos, text) { M.labels.push({ pos, text }); };

  function reveal(x, z) {
    const W = M.W; if (!W || !M.fog) return;
    const ci = Math.floor((x - W.minX) / FOG), cj = Math.floor((z - W.minZ) / FOG), r = Math.ceil(REVEAL_R / FOG);
    const ctx = M.fogCtx;
    let dirty = false;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= M.fogW || j >= M.fogH) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 > r * r) continue;
      const k = j * M.fogW + i;
      if (M.fog[k]) { M.fog[k] = 0; dirty = true; ctx.clearRect(i, j, 1, 1); }
    }
    return dirty;
  }
  M.revealAll = function () { if (!M.fog) return; M.fog.fill(0); M.fogCtx.clearRect(0, 0, M.fogW, M.fogH); };

  function posOf(m) { return typeof m.pos === 'function' ? m.pos() : m.pos; }

  // Vẽ bản đồ vào ctx: tâm (x,z), bán kính r mét → hình tròn/khung w×h px. rotate: xoay để "lên" màn hình = hướng camera.
  function draw(ctx, w, h, cx, cz, rM, rotate, round) {
    const W = M.W;
    const k = Math.min(w, h) / (2 * rM);          // px mỗi mét trên màn
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    if (round) { ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, Math.PI * 2); ctx.clip(); }
    ctx.fillStyle = '#050608'; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    // camera nhìn theo (−1, −1) trong three: xoay −135° để hướng đó chỉ lên trên màn hình
    if (rotate) ctx.rotate(Math.PI / 4);   // camera nhìn theo (−1, −1) của three: xoay +45° để hướng đó chỉ lên trên
    ctx.scale(k, k);
    ctx.translate(-(cx - W.minX), -(cz - W.minZ));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(M.bg, 0, 0, M.bg.width / S, M.bg.height / S);
    ctx.globalAlpha = 0.88;
    ctx.drawImage(M.fogCanvas, 0, 0, M.fogW * FOG, M.fogH * FOG);
    ctx.globalAlpha = 1;
    // viền vùng chơi
    if (M.play) {
      ctx.strokeStyle = 'rgba(160,40,40,0.8)'; ctx.lineWidth = 0.6;
      ctx.strokeRect(M.play.minX - W.minX, M.play.minZ - W.minZ, M.play.maxX - M.play.minX, M.play.maxZ - M.play.minZ);
    }
    const unrot = a => { if (rotate) ctx.rotate(a); };
    const iconAt = (x, z, name, sz) => {
      const im = img(icon(name));
      ctx.save(); ctx.translate(x - W.minX, z - W.minZ); unrot(-Math.PI / 4);
      const s = sz / k;
      if (im.complete && im.naturalWidth) ctx.drawImage(im, -s / 2, -s / 2, s, s);
      else { ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(0, 0, s / 3, 0, 6.283); ctx.fill(); }
      ctx.restore();
    };
    if (M.big) for (const l of M.labels) {
      ctx.save(); ctx.translate(l.pos.x - W.minX, l.pos.z - W.minZ); unrot(-Math.PI / 4);
      ctx.scale(1 / k, 1 / k); ctx.font = '12px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(l.text, 1, 1); ctx.fillStyle = '#e8e2cf'; ctx.fillText(l.text, 0, 0);
      ctx.restore();
    }
    for (const m of M.markers.values()) {
      const p = posOf(m); if (!p) continue;
      iconAt(p.x, p.z, MARK_ICON[m.kind] || 'Quest', m.kind === 'box' ? 14 : 20);
    }
    for (const pg of M.pings) {
      const a = 1 - pg.t / pg.life, R = (0.5 + (pg.t * 1.5 % 1)) * 3;
      ctx.strokeStyle = pg.type === 31 ? `rgba(255,80,80,${a})` : `rgba(255,220,90,${a})`; ctx.lineWidth = 2 / k;
      ctx.beginPath(); ctx.arc(pg.pos.x - W.minX, pg.pos.z - W.minZ, R, 0, 6.283); ctx.stroke();
    }
    const p = VD.stage && VD.stage.player;
    if (p) {
      ctx.save(); ctx.translate(p.pos.x - W.minX, p.pos.z - W.minZ);
      const a = Math.atan2(p.aim.z, p.aim.x);
      ctx.rotate(a);
      ctx.fillStyle = '#7fe3ff'; ctx.beginPath();
      const s = 7 / k;
      ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.6); ctx.lineTo(-s * 0.35, 0); ctx.lineTo(-s * 0.7, -s * 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    if (round) { ctx.strokeStyle = 'rgba(200,210,230,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, 6.283); ctx.stroke(); }
  }

  M.update = function (dt) {
    if (!M.on || !M.W || !M.bg) return;
    const p = VD.stage && VD.stage.player;
    if (p) reveal(p.pos.x, p.pos.z);
    for (let i = M.pings.length - 1; i >= 0; i--) { M.pings[i].t += dt; if (M.pings[i].t > M.pings[i].life) M.pings.splice(i, 1); }
    const c = M.small, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = c.clientWidth || 160;
    if (c.width !== Math.round(cw * dpr)) { c.width = c.height = Math.round(cw * dpr); }
    if (p) draw(c.getContext('2d'), c.width, c.height, p.pos.x, p.pos.z, VIEW_R, true, true);
    if (M.big) {
      const b = M.bigCanvas, bw = b.clientWidth || 600, bh = b.clientHeight || 400;
      if (b.width !== Math.round(bw * dpr) || b.height !== Math.round(bh * dpr)) { b.width = Math.round(bw * dpr); b.height = Math.round(bh * dpr); }
      const W = M.W, pl = M.play || W;
      const cx = (pl.minX + pl.maxX) / 2, cz = (pl.minZ + pl.maxZ) / 2;
      const span = Math.max(pl.maxX - pl.minX, pl.maxZ - pl.minZ) * 0.75;
      draw(b.getContext('2d'), b.width, b.height, cx, cz, span, true, false);
    }
  };

  M.clear = function () { M.markers.clear(); M.pings.length = 0; M.labels.length = 0; M.W = null; M.bg = null; if (M.root) M.root.style.display = 'none'; M.toggleBig(false); };

  VD.minimap = M;
})(window.VD = window.VD || {});
