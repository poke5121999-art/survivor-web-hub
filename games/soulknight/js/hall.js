// Sảnh (phòng khách) của Soul Knight: nền + mặt nạ đi được từ tools/hall/build_hall.py (data/sk-hall.js), nội thất là
// prefab <ô>_0_normal (tools/extra/hall.json). Hai chế độ như bản gốc [THẤY https://youtu.be/rhNuFTPktF4?t=74]:
//   select: thấy cả phòng, dải "Chọn nhân vật" trên đỉnh, chạm nhân vật → màn chọn nhân vật (SK.lobby).
//   walk:   điều khiển nhân vật vừa chọn, camera bám theo; bước vào cửa function/door_enter → bảng chế độ chơi.
// hall = {mode, t, me: {id, x, y, face, moving}, npcs: [{id, x, y, face}], doorT}  (x, y: đv thế giới Unity, y hướng lên)
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, H = window.SK_HALL, U = SK.PPU;
  SK.QUICK = /[?&]quick=1\b/.test(location.search);
  if (!H) return;
  const [X0, Y0, X1, Y1] = H.bounds;
  const img = new Image(), top = new Image();
  img.src = H.img + '?v=' + H.v;
  top.src = H.top + '?v=' + H.v;
  // Đồ nằm sàn vẽ dưới lớp trang trí (bàn ống nghiệm, vòng phép nằm trên thảm như bản gốc).
  const FLAT = { carpet: 1 };
  const skipIa = p => !!p.ia;

  // Nhân vật đứng cạnh đồ trang trí mang tên mình trong prefab hall_0_normal [SUY]; lệch xuống 1,2 đv [ƯỚC LƯỢNG].
  const DECO = { mage: 'magic_circle', vampire: 'cofin', engineer: 'toolbox', alchemist: 'tube', airbender: 'decorate_airbender',
    warlock: 'decorate_warlock' };
  const hall = { mode: 'select', t: 0, me: null, npcs: [], doorT: 0 };
  SK.hallState = hall;

  const furniture = H.slots.map(s => ({ s, parts: D.prefabs[s.slot + '_0_normal'] })).filter(f => f.parts);
  // Khối chặn của đồ đạc: collider không phải trigger trong prefab (px, y lên) → hộp đv thế giới [x0, y0, x1, y1].
  const blocks = [];
  for (const f of furniture) for (const p of f.parts) {
    if (!p.col || p.ia) continue;
    for (const c of Object.values(p.col)) {
      if (c.trig) continue;
      const cx = f.s.x + (p.at[0] + c.off[0]) / U, cy = f.s.y + (p.at[1] + c.off[1]) / U;
      const hw = (c.size ? c.size[0] / 2 : c.r) / U, hh = (c.size ? c.size[1] / 2 : c.r) / U;
      blocks.push([cx - hw, cy - hh, cx + hw, cy + hh]);
    }
  }
  const walkable = (x, y) => {
    const i = Math.floor((x - X0) * H.mask), j = Math.floor((Y1 - y) * H.mask), row = H.walk[j];
    return !!row && row[i] === '.' && !blocks.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3]);
  };

  // Ô trống cho nhân vật không có đồ trang trí riêng: lưới 2,5 đv, cách nội thất ≥ 2 đv, cách cửa ≥ 4 đv [ƯỚC LƯỢNG].
  function freeSpots() {
    const out = [];
    for (let y = Y1 - 3; y > Y0 + 1; y -= 2.5) {
      for (let x = X0 + 2; x < X1 - 1; x += 2.5) {
        if (!walkable(x, y) || !walkable(x - 0.5, y) || !walkable(x + 0.5, y)) continue;
        if (H.slots.some(s => Math.hypot(s.x - x, s.y - y) < 2)) continue;
        if (Object.values(H.deco).some(d => Math.hypot(d[0] - x, d[1] - y) < 2)) continue;
        if (Math.hypot(H.door.x - x, H.door.y - y) < 4) continue;
        out.push([x, y]);
      }
    }
    return out.sort((a, b) => Math.hypot(a[0] + 3, a[1]) - Math.hypot(b[0] + 3, b[1]));
  }

  function placeNpcs() {
    const spots = freeSpots();
    hall.npcs = SK.profile.unlocked.filter(id => DS.heroes[id] && D.heroes[id]).map(id => {
      const d = H.deco[DECO[id]];
      const [x, y] = d ? [d[0], d[1] - 1.2] : (spots.shift() || [0, 0]);
      return { id, x, y, face: x > 0 ? -1 : 1 };
    });
  }

  function enter(mode, id) {
    const G = SK.G;
    G.state = 'hall'; G.player = null; G.map = null;
    SK.setOverlay(null);
    lobbyEl().classList.remove('only-modes');
    hall.mode = mode; hall.t = 0; hall.doorT = 0;
    placeNpcs();
    if (mode === 'walk') {
      const npc = hall.npcs.find(n => n.id === id) || { x: H.door.x, y: H.door.y - 4, face: 1 };
      hall.npcs = hall.npcs.filter(n => n !== npc);
      hall.me = { id, x: npc.x, y: npc.y, face: npc.face, moving: false };
      hall.pet = { x: npc.x - 1, y: npc.y - 0.3, face: 1, st: 'ide', t: 0 };
    } else { hall.me = null; hall.pet = null; }
  }

  function step(dt) {
    hall.t += dt;
    const I = SK.input, me = hall.me;
    if (hall.mode === 'select') {
      if (I.hit('confirm') && hall.npcs.length) pick(hall.npcs[0].id);
      return;
    }
    const ov = lobbyEl().classList.contains('only-modes');
    if (ov && document.getElementById('hs-modes').hidden) modesClosed();
    if (!me || ov) return;
    const mv = I.moveVec(), spd = ((DS.heroes[me.id] || {}).speed || 6) * dt;
    me.moving = Math.hypot(mv.x, mv.y) > 0.1;
    if (me.moving) {
      const nx = me.x + mv.x * spd, ny = me.y - mv.y * spd;
      if (walkable(nx, me.y) && walkable(nx - 0.4 * Math.sign(mv.x || 1), me.y)) me.x = nx;
      if (walkable(me.x, ny)) me.y = ny;
      if (Math.abs(mv.x) > 0.05) me.face = mv.x > 0 ? 1 : -1;
    }
    // Thú cưng bám chủ như trong hầm (min_follow 2 đv, tốc 8 đv/s) [ĐO Pet0Controller, RoleAttributePet].
    const pt = hall.pet;
    if (pt) {
      pt.t += dt;
      const dx = me.x - me.face * 0.8 - pt.x, dy = me.y - 0.3 - pt.y, d = Math.hypot(dx, dy);
      if (d > 2 || (pt.st === 'run' && d > 0.3)) {
        const k = Math.min(1, 8 * dt / d), nx = pt.x + dx * k, ny = pt.y + dy * k;
        if (walkable(nx, ny)) { pt.x = nx; pt.y = ny; } else { pt.x += dx * k; pt.y += dy * k; }
        if (Math.abs(dx) > 0.05) pt.face = dx > 0 ? 1 : -1;
        if (pt.st !== 'run') { pt.st = 'run'; pt.t = 0; }
      } else if (pt.st !== 'ide') { pt.st = 'ide'; pt.t = 0; }
    }
    // Cửa là trigger nằm sát mép tường trên: tới hàng sàn cuối dưới cửa là vào [ĐO door_enter BoxCollider2D].
    const dr = H.door, atDoor = Math.abs(me.x - dr.x) < dr.w / 2 && me.y > dr.y - dr.h / 2 - 1.2;
    if (atDoor && hall.doorT <= 0) { hall.doorT = 1; openModes(); }
    if (!atDoor) hall.doorT = 0;
  }

  // Bảng chế độ chơi nằm trong lớp phủ #sk-lobby: hiện lớp phủ nhưng chỉ để lộ bảng (lớp only-modes).
  const lobbyEl = () => document.getElementById('sk-lobby');
  function openModes() {
    SK.setOverlay('sk-lobby');
    lobbyEl().classList.add('only-modes');
    SK.lobby.openModes();
  }
  function modesClosed() {
    lobbyEl().classList.remove('only-modes');
    if (SK.G.state === 'hall') SK.setOverlay(null);
  }

  function pick(id) {
    lobbyEl().classList.remove('only-modes');
    SK.profile.select(id);
    SK.lobby.enter();
  }

  // ---------------------------------------------------------------- vẽ (trên canvas HUD, điểm ảnh thật)
  function view() {
    const ctx = SK.hudCtx, W = ctx.canvas.width, Hh = ctx.canvas.height, v = SK.view;
    const iw = (X1 - X0) * U, ih = (Y1 - Y0) * U;
    if (hall.mode === 'select') {
      const bar = Hh * 0.075, z = Math.min(W / iw, (Hh - bar) / ih);
      return { z, ox: (W - iw * z) / 2, oy: bar + (Hh - bar - ih * z) / 2, bar };
    }
    const z = v.scale * v.dpr, me = hall.me;
    const cx = SK.clamp((me.x - X0) * U * z - W / 2, Math.min(0, iw * z - W), Math.max(0, iw * z - W));
    const cy = SK.clamp((Y1 - me.y) * U * z - Hh / 2, Math.min(0, ih * z - Hh), Math.max(0, ih * z - Hh));
    return { z, ox: -cx, oy: -cy, bar: 0 };
  }
  const px = (x, y) => [(x - X0) * U, (Y1 - y) * U];

  function drawHero(ctx, id, x, y, face, moving, t) {
    const hd = D.heroes[id] && D.heroes[id].s0;
    if (!hd) return;
    const [hx, hy] = px(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(hx, hy, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    SK.draw(ctx, SK.animFrame(moving ? hd.run : hd.idle, t), hx, hy, { flip: face < 0 });
  }

  function render(mainCtx) {
    const v = SK.view;
    mainCtx.fillStyle = '#0b0d12'; mainCtx.fillRect(0, 0, v.w, v.h);
    const ctx = SK.hudCtx, { z, ox, oy, bar } = view();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(z, 0, 0, z, ox, oy);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0);
    const drawF = f => { const [x, y] = px(f.s.x, f.s.y); SK.drawPrefab(ctx, f.parts, x, y, { t: hall.t, skip: skipIa }); };
    for (const f of furniture) if (FLAT[f.s.slot]) drawF(f);
    if (top.complete && top.naturalWidth) ctx.drawImage(top, 0, 0);
    const list = furniture.filter(f => !FLAT[f.s.slot]).map(f => ({ y: f.s.y, fn: () => drawF(f) }));
    for (const n of hall.npcs) list.push({ y: n.y, fn: () => drawHero(ctx, n.id, n.x, n.y, n.face, false, hall.t + n.x) });
    const me = hall.me;
    if (me) list.push({ y: me.y, fn: () => drawHero(ctx, me.id, me.x, me.y, me.face, me.moving, hall.t) });
    const pt = hall.pet, petParts = D.prefabs.pet0;
    if (pt && petParts) list.push({ y: pt.y, fn: () => { const [x, y] = px(pt.x, pt.y); SK.drawPrefab(ctx, petParts, x, y, { state: pt.st, t: pt.t, flip: pt.face < 0 }); } });
    list.sort((a, b) => b.y - a.y);
    for (const e of list) e.fn();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bar) {
      ctx.fillStyle = 'rgba(20,22,28,0.92)'; ctx.fillRect(0, 0, ctx.canvas.width, bar);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = Math.round(bar * 0.5) + 'px "Be Vietnam Pro", sans-serif';
      ctx.fillText('Chọn nhân vật', ctx.canvas.width / 2, bar / 2);
    }
    const g = gems();
    if (g) { g.q('w/Bg/Text').txt.s = String(SK.profile.gems); g.draw(ctx, ctx.canvas.width, ctx.canvas.height); }
  }
  // Ô đá quý góc trên phải như sảnh gốc [THẤY ?t=74]: cây nút show_currency_widget của màn chọn nhân vật (prefab gốc).
  let GEMS = null;
  function gems() {
    if (GEMS || !SK.ugui || !SK.ugui.ok || !window.SK_UI) return GEMS;
    const find = (n, name) => { if (n.n === name) return n; for (const c of n.k || []) { const r = find(c, name); if (r) return r; } return null; };
    const w = JSON.parse(JSON.stringify(find(window.SK_UI.prefabs.choose_hero, 'show_currency_widget')));
    Object.assign(w, { n: 'w', a: [1, 1, 1, 1], pv: [1, 1], p: [-24, -8], sz: [185, 52] });
    window.SK_UI.prefabs._hall_gems = { n: 'root', k: [w] };
    GEMS = SK.ugui.inst('_hall_gems');
    GEMS.q('w/Bg/Image/Icon').img.sp = 'ui_102';
    return GEMS;
  }

  // Chạm nhân vật trong chế độ chọn (toạ độ CSS → điểm ảnh HUD → đv thế giới).
  addEventListener('pointerdown', e => {
    if (SK.G.state !== 'hall' || hall.mode !== 'select') return;
    const ctx = SK.hudCtx, r = ctx.canvas.getBoundingClientRect(), dpr = ctx.canvas.width / r.width;
    const { z, ox, oy } = view();
    const wx = ((e.clientX - r.left) * dpr - ox) / z / U + X0, wy = Y1 - ((e.clientY - r.top) * dpr - oy) / z / U;
    const hit = hall.npcs.find(n => Math.abs(n.x - wx) < 0.8 && wy > n.y - 0.3 && wy < n.y + 1.8);
    if (hit) pick(hit.id);
  });

  SK.MODES = SK.MODES || {};
  SK.MODES.hall = { step, render };
  SK.hall = {
    enter,
    // Móc kiểm thử: toạ độ CSS của nhân vật trong chế độ chọn, và đặt nhân vật tới chỗ.
    npcScreen(id) {
      const n = hall.npcs.find(q => q.id === id); if (!n) return null;
      const ctx = SK.hudCtx, r = ctx.canvas.getBoundingClientRect(), dpr = ctx.canvas.width / r.width, { z, ox, oy } = view();
      const [x, y] = px(n.x, n.y + 0.6);
      return { x: r.left + (x * z + ox) / dpr, y: r.top + (y * z + oy) / dpr };
    },
    get state() { return { mode: hall.mode, me: hall.me && Object.assign({}, hall.me), npcs: hall.npcs.map(n => n.id), door: H.door }; }
  };
})();
