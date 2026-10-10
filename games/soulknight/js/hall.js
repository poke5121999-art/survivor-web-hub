// Sảnh (phòng khách) của Soul Knight: nền + mặt nạ đi được từ tools/hall/build_hall.py (data/sk-hall.js), nội thất là
// prefab <ô>_0_normal (tools/extra/hall.json). Hai chế độ như bản gốc [THẤY https://youtu.be/rhNuFTPktF4?t=74]:
//   select: thấy cả phòng, dải "Chọn nhân vật" trên đỉnh, chạm nhân vật → màn chọn nhân vật (SK.lobby).
//   walk:   điều khiển nhân vật vừa chọn, camera bám theo; bước vào cửa function/door_enter → bảng chế độ chơi.
//   tương tác (walk): đứng gần món nội thất (vùng trigger của prefab) hiện tên Việt chính thức; E / Enter / chạm để dùng →
//   SK.HALL_USE[slot](zone) (js/hall_use.js), món chưa làm hiện tên + "Chưa có ở bản web".
// hall = {mode, t, me: {id, x, y, face, moving}, npcs: [{id, x, y, face}], doorT, near}  (x, y: đv thế giới Unity, y hướng lên)
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, H = window.SK_HALL, U = SK.PPU;
  SK.QUICK = /[?&]quick=1\b/.test(location.search);
  if (!H) return;
  const [X0, Y0, X1, Y1] = H.bounds;
  // Phòng chính (khung nhìn chế độ chọn, chỗ đặt nhân vật); H.bounds còn gồm Khu Vườn bên trái (tools/hall/build_hall.py).
  const [MX0, MY0, MX1, MY1] = H.main || H.bounds;
  const img = new Image(), top = new Image();
  img.src = H.img + '?v=' + H.v;
  top.src = H.top + '?v=' + H.v;
  // Đồ nằm sàn vẽ dưới lớp trang trí (bàn ống nghiệm, vòng phép nằm trên thảm như bản gốc).
  const FLAT = { carpet: 1 };
  const skipIa = p => !!p.ia;

  // Nhân vật đứng cạnh đồ trang trí mang tên mình trong prefab hall_0_normal [SUY]; lệch xuống 1,2 đv [ƯỚC LƯỢNG].
  const DECO = { mage: 'magic_circle', vampire: 'cofin', engineer: 'toolbox', alchemist: 'tube', airbender: 'decorate_airbender',
    warlock: 'decorate_warlock' };
  const hall = { mode: 'select', t: 0, me: null, npcs: [], doorT: 0, near: null };
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

  // ---------------------------------------------------------------- tương tác với nội thất
  // Tên Việt chính thức [LOC <khoá>]; Hộp Thư và Máy Đổi/Máy Game theo HALL.md. Ô không có tên (carpet, table, sofa, hire_board trùng
  // vị trí với gallery) không tương tác được.
  const NAME = {
    fridge: ['Tủ Lạnh', 'Object_fridge'], plutus_cat: ['Mèo Chiêu Tài', 'Object_plutus'], trash_can: ['Thùng Rác', 'object/trash_can'],
    hostess: ['Du Lịch Lợi Hại', 'Object_hostess'], gallery: ['Standee', 'object/gallery'], mail_box: ['Hộp Thư', 'HALL.md'],
    chest: ['Rương', 'Object_chest'], safe: ['Két Sắt', 'Object_safe'], plant: ['Cây Cảnh', 'Object_plant'], books: ['Sách', 'Object_book'],
    tv: ['Xem tivi', 'Object_tv'], postman: ['Nhân Viên Chuyển Phát', 'Object_postman'], egg_machine: ['Máy Quay Trứng', 'object/gashapon_machines'],
    pet_food: ['Thức Ăn Mèo', 'Object_petfood'], handbook_entry: ['Hầm', 'Object_cellar'], arcade_machine: ['Máy Game', 'arcade_machine/name'],
    drink_seller: ['Máy Bán Nước Uống Tự Động', 'object/drink_seller'], fish_bowl: ['Hồ Cá', 'object/fishbowl'],
    token_machine: ['Máy Đổi', 'object/token_machine'], forge: ['Bàn Rèn', 'object/forge'], station: ['Bàn Thiết Kế', 'object/weapon_station']
  };
  const REACH = 1.0;      // đứng cách vùng trigger tới 1 đv vẫn dùng được (≈ 2 đv tính từ tâm món nhỏ) [ƯỚC LƯỢNG]
  const LABEL_H = 2.5;    // nhãn cao 2,5 đv trên gốc ô [ĐO mbs Item*.label_height, hall_0_normal prefabs]
  // Máy Đổi nằm ở khu Xưởng gốc (chưa có ở web): đặt ở sàn trống, Máy Game không có prefab: cả hai vẽ khối giữ chỗ [ƯỚC LƯỢNG].
  const KIOSK = { token_machine: { col: '#2f7a5a', screen: '#9dffcb' }, arcade_machine: { col: '#5b3f94', screen: '#7ff0ff' } };
  // Khu Xưởng gốc (bên phải) chưa có ở web: Bàn Rèn, Bàn Thiết Kế, Máy Đổi là prefab gốc hero_room/common (workshop/common/*.prefab)
  // đặt ở hàng sàn dưới của phòng chính; vị trí [ƯỚC LƯỢNG], thử lần lượt tới chỗ đi được.
  const WORKSHOP = { forge: { pf: 'forge', at: [[-3.2, -7.6], [-3.2, -6.6]] }, station: { pf: 'station', at: [[3.2, -8.2], [3.2, -7.2]] },
    token_machine: { pf: 'token_machine', at: [[6.6, -8.2], [6.6, -7.2], [7.6, -8.2]] } };
  const zones = [];
  // extra: mô tả do module khác thêm (js/garden.js): name (có thể là getter), loc, use(z), draw(ctx, px, py, t), tag... — chép nguyên vào vùng.
  function addZone(slot, x, y, pf, extra) {
    const nm = NAME[slot] || [extra && extra.name, extra && extra.loc || 'ext'], parts = D.prefabs[pf || slot + '_0_normal'] || [];
    let box = null;
    for (const p of parts) {
      if (p.ia || !p.col) continue;
      const c = Object.values(p.col).find(q => q.trig && q.size);
      if (c) { const cx = x + (p.at[0] + c.off[0]) / U, cy = y + (p.at[1] + c.off[1]) / U, w = c.size[0] / U, h = c.size[1] / U; box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; break; }
    }
    if (!box) box = [x - 1, y - 1, x + 1, y + 1];   // chưa có prefab/trigger: 2 × 2 đv quanh gốc ô [ƯỚC LƯỢNG]
    const z = { slot, name: nm[0], loc: nm[1], x, y, box, parts: pf && parts.length ? parts : null, kiosk: !(pf && parts.length) && KIOSK[slot] || null };
    if (extra) Object.defineProperties(z, Object.getOwnPropertyDescriptors(extra));
    zones.push(z);
    if (pf) for (const p of parts) for (const c of Object.values(p.col || {})) {   // khối chặn của prefab Xưởng
      if (c.trig) continue;
      const cx = x + (p.at[0] + c.off[0]) / U, cy = y + (p.at[1] + c.off[1]) / U, hw = (c.size ? c.size[0] / 2 : c.r) / U, hh = (c.size ? c.size[1] / 2 : c.r) / U;
      blocks.push([cx - hw, cy - hh, cx + hw, cy + hh]);
    }
  }
  for (const s of H.slots) if (NAME[s.slot]) addZone(s.slot, s.x, s.y);
  // Hồ Cá treo sát tường dưới, vùng trigger của prefab nằm hẳn trong tường (cách hàng sàn cuối 1,5 đv, ngoài tầm với): kéo vùng lên tới sàn
  // để đứng ở hàng sàn cuối dưới bể là dùng được [ĐO mặt nạ đi được; ƯỚC LƯỢNG chiều cao vùng].
  const BOX_FIX = { fish_bowl: [11.4, -10.1, 13.6, -8.0] };
  for (const z of zones) if (BOX_FIX[z.slot]) z.box = BOX_FIX[z.slot].slice();
  function addWorkshop() {
    for (const [slot, w] of Object.entries(WORKSHOP)) {
      const at = w.at.find(([x, y]) => walkable(x, y) && walkable(x + 1, y) && walkable(x - 1, y)) || w.at[0];
      addZone(slot, at[0], at[1], w.pf);
    }
  }
  const rectDist = (z, x, y) => Math.hypot(Math.max(z.box[0] - x, 0, x - z.box[2]), Math.max(z.box[1] - y, 0, y - z.box[3]));
  // Món gần nhất trong tầm, theo khoảng cách tới vùng trigger rồi tới tâm vùng.
  function nearest(x, y) {
    let best = null, bd = 1e9;
    for (const z of zones) {
      const d = rectDist(z, x, y);
      if (d > REACH) continue;
      const k = d * 10 + Math.hypot((z.box[0] + z.box[2]) / 2 - x, (z.box[1] + z.box[3]) / 2 - y) * 0.01;
      if (k < bd) { bd = k; best = z; }
    }
    return best;
  }
  SK.HALL_USE = SK.HALL_USE || {};   // {slot: fn(zone)}: js/hall_use.js điền các món đã làm
  let useCd = 0, dlgWas = false, labelBox = null, labelsAll = false;
  function use(z) {
    if (!z || !SK.lobby || !SK.lobby.dialog) return;
    SK.setOverlay('sk-lobby');
    lobbyEl().classList.add('only-modes');
    const fn = z.use || SK.HALL_USE[z.slot];
    if (fn) fn(z); else notYet(z);
    if (!SK.lobby.dialogOpen) modesClosed();
    else setTimeout(() => { const b = document.querySelector('#hs-dlg .hs-btn.ok:not([disabled])') || document.querySelector('#hs-dlg .hs-btn:not([disabled])'); if (b && document.activeElement !== b && !document.querySelector('#hs-dlg :focus')) b.focus(); }, 0);
  }
  function notYet(z) {
    SK.lobby.dialog('<h3>' + SK.lobby.esc(z.name) + '</h3><p>Chưa có ở bản web.</p>', [{ label: 'Đóng', id: 'hs-close', cls: 'ok' }]);
  }

  // Ô trống cho nhân vật không có đồ trang trí riêng: lưới 2,5 đv, cách nội thất ≥ 2 đv, cách cửa ≥ 4 đv [ƯỚC LƯỢNG].
  function freeSpots() {
    const out = [];
    for (let y = MY1 - 3; y > MY0 + 1; y -= 2.5) {
      for (let x = MX0 + 2; x < MX1 - 1; x += 2.5) {
        if (!walkable(x, y) || !walkable(x - 0.5, y) || !walkable(x + 0.5, y)) continue;
        if (H.slots.some(s => Math.hypot(s.x - x, s.y - y) < 2) || zones.some(q => q.parts && Math.hypot(q.x - x, q.y - y) < 5)) continue;
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
      if (SK.profile.skinOf(id)) SK.loadPack(id);
      const d = H.deco[DECO[id]];
      const [x, y] = d ? [d[0], d[1] - 1.2] : (spots.shift() || [0, 0]);
      return { id, x, y, face: x > 0 ? -1 : 1 };
    });
  }

  addWorkshop();

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
    const ov = lobbyEl().classList.contains('only-modes'), dlg = !!(SK.lobby && SK.lobby.dialogOpen);
    if (ov && document.getElementById('hs-modes').hidden && !dlg) modesClosed();
    // Vừa đóng hộp thoại bằng Enter: bỏ phím còn đọng để khỏi mở lại ngay.
    if (dlgWas && !dlg) { useCd = 0.3; I.clearEdges(); }
    dlgWas = dlg;
    useCd = Math.max(0, useCd - dt);
    if (!me || ov) { hall.near = null; if (ov) I.clearEdges(); return; }
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
    hall.near = nearest(me.x, me.y);
    // Đến gần thú cưng đang theo chủ thì bấm E mở bảng chọn thú cưng (cùng việc với ô Thức Ăn Mèo, js/hall_pet.js); tầm 1,3 đv [ƯỚC LƯỢNG].
    // Chỉ khi không có món nội thất trong tầm (thú cưng luôn lẽo đẽo sau chủ, không được giành tương tác của món).
    if (!hall.near && pt && Math.hypot(pt.x - me.x, pt.y - me.y) < 1.3 && SK.HALL_USE.pet_food) {
      const pi = SK.petInfo && SK.petInfo(SK.profile.pet());
      hall.near = { slot: 'pet_food', name: (pi && pi.vi) || 'Thú cưng', x: pt.x, y: pt.y, box: [pt.x - 0.6, pt.y - 0.6, pt.x + 0.6, pt.y + 0.6], pet: true };
    }
    if ((I.hit('interact') || I.hit('confirm')) && hall.near && useCd <= 0) use(hall.near);
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
      const mw = (MX1 - MX0) * U, mh = (MY1 - MY0) * U, bar = Hh * 0.075, z = Math.min(W / mw, (Hh - bar) / mh);
      return { z, ox: (W - mw * z) / 2 - (MX0 - X0) * U * z, oy: bar + (Hh - bar - mh * z) / 2 - (Y1 - MY1) * U * z, bar };
    }
    const z = v.scale * v.dpr, me = hall.me;
    const cx = SK.clamp((me.x - X0) * U * z - W / 2, Math.min(0, iw * z - W), Math.max(0, iw * z - W));
    const cy = SK.clamp((Y1 - me.y) * U * z - Hh / 2, Math.min(0, ih * z - Hh), Math.max(0, ih * z - Hh));
    return { z, ox: -cx, oy: -cy, bar: 0 };
  }
  const px = (x, y) => [(x - X0) * U, (Y1 - y) * U];

  function drawHero(ctx, id, x, y, face, moving, t) {
    const hd = SK.heroSkin(id, SK.profile.skinOf(id));
    if (!hd) return;
    const [hx, hy] = px(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(hx, hy, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    SK.draw(ctx, SK.animFrame(moving ? hd.run : hd.idle, t), hx, hy, { flip: face < 0 });
  }

  // Khối giữ chỗ cho món chưa có prefab (Máy Game, Máy Đổi): thân máy + màn hình sáng, vẽ tay.
  function drawKiosk(ctx, z) {
    const [x, y] = px(z.x, z.y), k = z.kiosk, W = 15, Hh = 24;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14161c'; ctx.fillRect(x - W / 2 - 1, y - Hh - 1, W + 2, Hh + 1);
    ctx.fillStyle = k.col; ctx.fillRect(x - W / 2, y - Hh, W, Hh);
    ctx.fillStyle = k.screen; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(hall.t * 4); ctx.fillRect(x - 5, y - Hh + 3, 10, 8); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - W / 2, y - Hh, W, 1);
    ctx.fillStyle = '#14161c'; ctx.fillRect(x - 4, y - 8, 8, 2); ctx.fillRect(x - 5, y - 5, 3, 2); ctx.fillRect(x + 2, y - 5, 3, 2);
  }
  // Khung nét đứt quanh vùng món chưa có bản vẽ + chữ "Cần bản vẽ".
  function drawLock(ctx, z) {
    if (!z) return;
    const [x0, y0] = px(z.box[0] - 0.25, z.box[3] + 0.25), [x1, y1] = px(z.box[2] + 0.25, z.box[1] - 0.25);
    ctx.save();
    ctx.setLineDash([3, 2]); ctx.lineWidth = 1; ctx.strokeStyle = '#aab2bf'; ctx.fillStyle = 'rgba(40,46,58,0.45)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]); ctx.font = '7px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e6ebf3'; ctx.fillText('Cần bản vẽ', (x0 + x1) / 2, (y0 + y1) / 2);
    ctx.restore();
  }
  // Nhãn tên món (điểm ảnh HUD thật): ô tối bo tròn, tên Việt, dòng phím dùng bên dưới; kẹp trong khung hình.
  function drawLabel(ctx, z, z0, ox, oy, main) {
    const [wx, wy] = px(z.x, z.y + LABEL_H), sx = wx * z0 + ox, sy = wy * z0 + oy;
    const W = ctx.canvas.width, fs = Math.max(13, Math.round(ctx.canvas.height / 46));
    ctx.font = fs + 'px "Be Vietnam Pro", sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const hint = SK.input && SK.input.touchMode ? 'Chạm để dùng' : 'E · Dùng';
    const nm = z.name + (SK.HALL_LOCK && SK.HALL_LOCK(z.slot) ? ' (cần bản vẽ)' : '');
    const tw = ctx.measureText(nm).width, hw = main ? ctx.measureText(hint).width * 0.8 : 0;
    const w = Math.max(tw, hw) + fs, h = fs * (main ? 2.3 : 1.45);
    const x = SK.clamp(sx, w / 2 + 4, W - w / 2 - 4), y = Math.max(h / 2 + 4, sy - h / 2);
    ctx.fillStyle = main ? 'rgba(14,17,24,0.92)' : 'rgba(14,17,24,0.75)';
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, fs * 0.45); ctx.fill();
    if (main) { ctx.strokeStyle = '#ffd452'; ctx.lineWidth = Math.max(1, fs / 12); ctx.stroke(); }
    ctx.fillStyle = main ? '#ffd452' : '#fff';
    ctx.fillText(nm, x, y - (main ? fs * 0.45 : 0));
    if (main) { ctx.font = Math.round(fs * 0.8) + 'px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = '#c9d1dc'; ctx.fillText(hint, x, y + fs * 0.62); }
    return { x: x - w / 2, y: y - h / 2, w, h };
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
    // Chế độ chọn chỉ thấy phòng chính: cắt bỏ Khu Vườn nằm ngoài khung.
    ctx.save();
    if (hall.mode === 'select') { ctx.beginPath(); ctx.rect((MX0 + 1 - X0) * U, (Y1 - MY1) * U, (MX1 - MX0 - 1) * U, (MY1 - MY0) * U); ctx.clip(); }   // cột đệm trái của phòng chính nằm sát sàn vườn: bỏ
    if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0);
    // Nội thất cần bản vẽ (SK.HALL_LOCK(slot) trả chuỗi khoá, js/hall_ext.js) vẽ xám mờ trong khung nét đứt "Cần bản vẽ".
    const drawF = f => {
      const [x, y] = px(f.s.x, f.s.y), lk = SK.HALL_LOCK && SK.HALL_LOCK(f.s.slot);
      if (lk) { ctx.save(); ctx.globalAlpha = 0.3; }
      SK.drawPrefab(ctx, f.parts, x, y, { t: hall.t, skip: skipIa });
      if (lk) { ctx.restore(); drawLock(ctx, zones.find(q => q.slot === f.s.slot)); }
    };
    for (const f of furniture) if (FLAT[f.s.slot]) drawF(f);
    if (top.complete && top.naturalWidth) ctx.drawImage(top, 0, 0);
    const list = furniture.filter(f => !FLAT[f.s.slot]).map(f => ({ y: f.s.y, fn: () => drawF(f) }));
    for (const n of hall.npcs) list.push({ y: n.y, fn: () => drawHero(ctx, n.id, n.x, n.y, n.face, false, hall.t + n.x) });
    for (const z of zones) {
      if (z.draw) list.push({ y: z.y, fn: () => { const [x, y] = px(z.x, z.y); z.draw(ctx, x, y, hall.t, z); } });
      else if (z.kiosk) list.push({ y: z.y, fn: () => drawKiosk(ctx, z) });
      else if (z.parts) list.push({ y: z.y, fn: () => { const [x, y] = px(z.x, z.y); SK.drawPrefab(ctx, z.parts, x, y, { t: hall.t, state: 'closed' }); } });
    }
    const me = hall.me;
    if (me) list.push({ y: me.y, fn: () => drawHero(ctx, me.id, me.x, me.y, me.face, me.moving, hall.t) });
    const pt = hall.pet, petParts = D.prefabs[SK.profile.pet()] || D.prefabs.pet0;
    if (pt && petParts) list.push({ y: pt.y, fn: () => { const [x, y] = px(pt.x, pt.y); SK.drawPrefab(ctx, petParts, x, y, { state: pt.st, t: pt.t, flip: pt.face < 0 }); } });
    list.sort((a, b) => b.y - a.y);
    for (const e of list) e.fn();
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    labelBox = null;
    if (hall.mode === 'walk' && hall.me) {
      if (labelsAll) for (const q of zones) if (q !== hall.near) drawLabel(ctx, q, z, ox, oy, false);
      if (hall.near) labelBox = drawLabel(ctx, hall.near, z, ox, oy, true);
    }
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

  // Chạm nhãn hoặc chính món đang đứng gần (chế độ đi) = bấm E.
  addEventListener('pointerdown', e => {
    if (SK.G.state !== 'hall' || hall.mode !== 'walk' || !hall.near || useCd > 0 || lobbyEl().classList.contains('only-modes')) return;
    const ctx = SK.hudCtx, r = ctx.canvas.getBoundingClientRect(), dpr = ctx.canvas.width / r.width;
    const cxp = (e.clientX - r.left) * dpr, cyp = (e.clientY - r.top) * dpr;
    const { z, ox, oy } = view();
    const wx = (cxp - ox) / z / U + X0, wy = Y1 - (cyp - oy) / z / U, q = hall.near;
    const onLabel = labelBox && cxp >= labelBox.x && cxp <= labelBox.x + labelBox.w && cyp >= labelBox.y && cyp <= labelBox.y + labelBox.h;
    const onItem = wx > q.box[0] - 0.6 && wx < q.box[2] + 0.6 && wy > q.box[1] - 0.6 && wy < q.box[3] + 1.6;
    if (onLabel || onItem) use(q);
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
    // Móc kiểm thử: vùng tương tác của từng món, món đang gần, dùng thẳng một món, bật nhãn mọi món, toạ độ CSS của nhãn.
    zones: () => zones.map(q => ({ slot: q.slot, name: q.name, loc: q.loc, x: q.x, y: q.y, box: q.box.slice(), kiosk: !!q.kiosk, idx: q.idx })),
    // Thêm món nội thất từ module khác (Khu Vườn): addZone(slot, x, y, prefab?, {name, loc, use(z), draw(ctx, px, py, t, z), ...}).
    addZone, px, bounds: H.bounds, drawLock,
    near: () => hall.near && { slot: hall.near.slot, name: hall.near.name },
    petPos: () => hall.pet && { x: hall.pet.x, y: hall.pet.y },
    nearAt: (x, y) => { const q = nearest(x, y); return q && q.slot; },
    use: slot => use(zones.find(q => q.slot === slot)),
    labelsAll: on => { labelsAll = on !== false; },
    walkable,
    labelScreen() {
      if (!labelBox) return null;
      const ctx = SK.hudCtx, r = ctx.canvas.getBoundingClientRect(), dpr = ctx.canvas.width / r.width;
      return { x: r.left + (labelBox.x + labelBox.w / 2) / dpr, y: r.top + (labelBox.y + labelBox.h / 2) / dpr };
    },
    get state() { return { mode: hall.mode, me: hall.me && Object.assign({}, hall.me), npcs: hall.npcs.map(n => n.id), door: H.door, near: hall.near && hall.near.slot }; }
  };
})();
