// Triệu Hồi tab: a 3D gacha machine (own design: purple drum, gold trim, glass dome of two-tone pills), the pull
// animation driven by update(dt), the reveal cards, the ten-pull summary and the rates panel.
// The account changes at the moment of the pull (meta.pull); everything after that only shows what was paid out.
import { GACHA, HERO_RARITY } from '../data/economy.js?v=20261122a';
import { HERO } from '../data/heroes.js?v=20261122a';
import { ITEM as ITEM_DEF, TIERS } from '../data/equip.js?v=20261122a';
import { ITEM_ICON } from './itemicons.js?v=20261122a';
import { makeBackdrop, makeBurst, capsule3d, fmt } from './home.js?v=20261122a';

const GOLD = 0xffc21f, ITEM = 0x98a6c4;
const PILLS = [[0xff8ad0, 0x6ad8ff], [0xffd21f, 0x8f4dff], [0x8aff9a, 0xff9a5a], [0xb48aff, 0xffe27a], [0x5ad0ff, 0xff6a8a], [0xff9a5a, 0x4af0c8]];
const easeBack = (t) => { t = Math.max(0, Math.min(1, t)); const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const lighten = (c, k) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; const f = (v) => Math.round(v + (255 - v) * k); return (f(r) << 16) | (f(g) << 8) | f(b); };
const pct = (p) => String(p).replace('.', ',') + '%';

const colorOf = (r) => (r.kind === 'gold' ? GOLD : r.kind === 'item' ? ITEM : HERO_RARITY[r.rarity].color);
const rowLabel = (row) => {
  const rn = row.rarity ? HERO_RARITY[row.rarity].name : '';
  if (row.kind === 'hero') return `Thú ${rn}`; if (row.kind === 'shard') return `${row.n} mảnh của một thú ${rn}`;
  if (row.kind === 'gold') return `${row.n} vàng`; return 'Trang bị bậc Thường';
};

export function createGacha(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE, mui = game.metaUi;
  const scr = ui.screen('gacha'), rates = ui.screen('rates', { modal: true });
  const bd = makeBackdrop(ui, 'gacha'); scr.put(bd, 0, 0, -40);
  const title = ui.text('TRIỆU HỒI THÚ', { size: 24, upper: true, outlineW: 3.2 }); scr.put(title, 414, 48, 6); mui.regTitle('gacha', title);

  // ---------- the machine ----------
  const root = new THREE.Group(), machine = new THREE.Group(); root.add(machine);
  const std = (c, r = 0.4, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, emissive: e, emissiveIntensity: e ? 0.5 : 0 });
  const ink = new THREE.MeshBasicMaterial({ color: 0x1a1420, side: THREE.BackSide });
  const add = (parent, geo, mat, x, y, z, hullK) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (hullK) { const h = new THREE.Mesh(geo, ink); h.scale.setScalar(hullK); m.add(h); } parent.add(m); return m; };
  add(machine, new THREE.CylinderGeometry(1.95, 2.1, 0.4, 36), std(0x2a1f5a), 0, 0.2, 0, 1.04);
  add(machine, new THREE.CylinderGeometry(1.6, 1.8, 1.6, 36), std(0x7a45e8, 0.35), 0, 1.2, 0, 1.04);
  for (const y of [0.55, 2.0]) add(machine, new THREE.TorusGeometry(y > 1 ? 1.62 : 1.78, 0.09, 8, 40), std(GOLD, 0.25), 0, y, 0).rotation.x = Math.PI / 2;
  add(machine, new THREE.CylinderGeometry(1.5, 1.6, 0.35, 36), std(0xffa31f, 0.3), 0, 2.15, 0, 1.04);
  // front plate, crank and chute
  add(machine, new THREE.BoxGeometry(1.5, 0.9, 0.3), std(0xffc21f, 0.3), 0, 1.35, 1.68, 1.05);
  const crank = new THREE.Group(); crank.position.set(0, 1.35, 1.9); machine.add(crank);
  add(crank, new THREE.CylinderGeometry(0.34, 0.34, 0.16, 20), std(0xff4a6a, 0.3), 0, 0, 0, 1.08).rotation.x = Math.PI / 2;
  add(crank, new THREE.BoxGeometry(0.16, 0.8, 0.12), std(0xfff1cf, 0.3), 0, 0.3, 0.12, 1.1);
  add(crank, new THREE.SphereGeometry(0.2, 12, 10), std(0x35d65a, 0.3), 0, 0.7, 0.16, 1.1);
  add(machine, new THREE.BoxGeometry(1.1, 0.62, 0.7), std(0x1c1238, 0.6), 0, 0.5, 1.5, 1.05);
  add(machine, new THREE.BoxGeometry(1.3, 0.12, 0.8), std(GOLD, 0.3), 0, 0.2, 1.62);
  // dome with a pile of pills
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 32, 20), new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.08, transparent: true, opacity: 0.22, depthWrite: false })); dome.position.y = 3.55; dome.renderOrder = 3; machine.add(dome);
  const pills = []; let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * 1.0, y = 2.65 + rnd() * 1.1 - rr * 0.1, [ca, cb] = PILLS[i % PILLS.length];
    const c = capsule3d(THREE, ca, cb); c.scale.setScalar(0.52); c.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr * 0.9); c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); machine.add(c); pills.push({ c, bx: c.position.x, by: y, bz: c.position.z, ph: rnd() * 6 });
  }
  add(machine, new THREE.TorusGeometry(1.5, 0.12, 8, 40), std(GOLD, 0.25), 0, 2.45, 0).rotation.x = Math.PI / 2;
  add(machine, new THREE.CylinderGeometry(0.55, 0.8, 0.3, 24), std(GOLD, 0.25), 0, 5.0, 0, 1.06);
  add(machine, new THREE.SphereGeometry(0.2, 12, 10), std(0xff4a6a, 0.3), 0, 5.28, 0, 1.1);
  const glowCan = document.createElement('canvas'); glowCan.width = glowCan.height = 64;
  { const c = glowCan.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const glowM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCan), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowM); glow.visible = false; glow.renderOrder = 9; root.add(glow);
  const cam = new THREE.PerspectiveCamera(32, 268 / 326, 0.1, 60); cam.position.set(0, 3.2, 14.2); cam.lookAt(0, 2.5, 0);
  let t0 = 0, crankSpeed = 0, shake = 0, cap = null;
  const frameP = ui.panel({ w: 280, h: 338, r: 24, color: 0x5a2f9a, depth: 5, bevel: 3 }); scr.put(frameP, 112, 10, 6);
  const view = ui.viewport(root, { w: 268, h: 326, r: 19, camera: cam, fps: 24, bg: 0x6a3aa8, key: 2.2, amb: 1.7, update: (dt) => machineStep(dt) });
  frameP.put(view, 6, 6, 1);
  function machineStep(dt) {
    t0 += dt; crank.rotation.z -= crankSpeed * dt; shake += (0 - shake) * (1 - Math.exp(-dt * 6));
    const amp = (S && S.phase === 'crank' ? 1 : 0), idle = Math.sin(t0 * 1.2) * 0.1;
    machine.rotation.y = idle * (1 - amp); machine.position.x = Math.sin(t0 * 55) * 0.06 * amp; machine.position.y = Math.abs(Math.sin(t0 * 38)) * 0.05 * amp;
    for (const p of pills) { const j = 0.04 + amp * 0.12; p.c.position.set(p.bx + Math.sin(t0 * 2 + p.ph) * j, p.by + Math.abs(Math.sin(t0 * (3 + amp * 12) + p.ph)) * (0.03 + amp * 0.18), p.bz + Math.cos(t0 * 2.2 + p.ph) * j); p.c.rotation.z += dt * (0.4 + amp * 5); }
    if (!S) crankSpeed = 0.9 + Math.sin(t0) * 0.3;
    if (cap) capStep(dt);
  }

  // ---------- idle controls: rates button, compact hero rates, pity, pull buttons bottom-right ----------
  const idleG = ui.group(); scr.put(idleG, 0, 0, 6);
  const rBtn = ui.button({ id: 'rates', w: 78, h: 36, r: 12, color: PAL.blue, label: 'TỈ LỆ', size: 14, shadow: false, onTap: openRates }); idleG.put(rBtn, 674, 52, 6);
  idleG.put(ui.text('TỈ LỆ RA THÚ', { size: 11.5, color: 0xe8d8ff, outlineW: 1.8 }), 414, 94);
  GACHA.table.filter((r) => r.kind === 'hero').forEach((row, i) => {
    const chip = ui.panel({ w: 108, h: 50, r: 14, color: 0x2a2150, depth: 3, bevel: 2, ow: 2, shadow: false }); idleG.put(chip, 414 + i * 115, 110, 2);
    chip.put(ui.panel({ w: 6, h: 32, r: 3, color: HERO_RARITY[row.rarity].color, depth: 1, bevel: 0.8, ow: 1, shadow: false, gloss: false }), 8, 9, 2);
    chip.put(ui.text(HERO_RARITY[row.rarity].name, { size: 11, outlineW: 1.6 }), 22, 7, 2); chip.put(ui.text(pct(row.p), { size: 18, color: 0xffe27a, outlineW: 2.4 }), 22, 22, 2);
  });
  const pityBar = ui.bar({ w: 338, h: 20, color: PAL.purple, r: 10, ghost: true, value: 0 }); idleG.put(pityBar, 414, 182, 2);
  const pityBarT = ui.text('', { size: 11.5, align: 'center', valign: 'mid', outlineW: 1.8 }); pityBar.put(pityBarT, 169, 10.5, 2);
  const pity = ui.text('', { size: 12, align: 'center', color: 0xfff0b8, maxW: 338, lineH: 15 }); idleG.put(pity, 583, 212, 2);
  const p1 = ui.button({ id: 'pull1', w: 160, h: 64, r: 18, color: PAL.blue, label: '1 LƯỢT', sub: '100 ngọc', size: 22, onTap: () => startPull(1) }); idleG.put(p1, 414, 284, 6);
  const p10 = ui.button({ id: 'pull10', w: 170, h: 64, r: 18, color: PAL.orange, label: '10 LƯỢT', sub: '900 ngọc', size: 22, pulse: true, onTap: () => startPull(10) }); idleG.put(p10, 582, 284, 6);
  let lastKey = '';
  function refreshIdle() {
    const g = meta.acc.gems, free = meta.acc.freePull, key = g + '|' + meta.acc.pity + '|' + free; if (key === lastKey) return; lastKey = key;
    if (free) {
      pity.set('Lượt đầu tiên miễn phí, chắc chắn có thú mới!'); pityBar.setVisible(false);
      p1.setEnabled(true); p1.setLabel('MIỄN PHÍ'); p1.setSub('Lượt đầu tiên'); p10.setEnabled(false); p10.setSub('Dùng lượt miễn phí trước');
      mui.pullText = { p1: 'MIỄN PHÍ', p10: 'Dùng lượt miễn phí trước' }; return;
    }
    pity.set(`Còn ${GACHA.pity - meta.acc.pity} lượt chắc chắn ra thú Huyền Thoại`); pityBar.setVisible(true); pityBar.set(Math.min(1, meta.acc.pity / GACHA.pity)); pityBarT.set(`Bảo hiểm ${meta.acc.pity}/${GACHA.pity}`);
    p1.setLabel('1 LƯỢT'); p1.setEnabled(g >= GACHA.cost); p1.setSub(g >= GACHA.cost ? GACHA.cost + ' ngọc' : 'Thiếu ngọc');
    p10.setEnabled(g >= GACHA.cost10); p10.setSub(g >= GACHA.cost10 ? GACHA.cost10 + ' ngọc' : 'Thiếu ngọc');
    mui.pullText = { p1: g >= GACHA.cost ? '' : 'Thiếu ngọc', p10: g >= GACHA.cost10 ? '' : 'Thiếu ngọc' };
  }
  meta.on(() => { lastKey = ''; });

  // ---------- rates panel: wide and short, two columns of rows ----------
  { const dimM = new THREE.Mesh(new THREE.PlaneGeometry(780, 440), new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.6, depthWrite: false })); rates.put(dimM, 390, 180, -10); }
  const rp = ui.panel({ w: 600, h: 304, r: 22, color: 0x4a3a86, depth: 6, bevel: 3 }); rates.put(rp, 90, 28, 6);
  const rT = ui.text('TỈ LỆ TRIỆU HỒI', { size: 20, align: 'center', upper: true }); rp.put(rT, 300, 10); mui.regTitle('rates', rT);
  GACHA.table.forEach((row, i) => {
    const x = 12 + Math.floor(i / 4) * 292, y = 44 + (i % 4) * 34, col = row.kind === 'gold' ? GOLD : row.kind === 'item' ? ITEM : HERO_RARITY[row.rarity].color;
    const strip = ui.panel({ w: 284, h: 30, r: 10, color: 0x2a2150, depth: 2, bevel: 1.4, ow: 2, shadow: false, gloss: false }); rp.put(strip, x, y);
    strip.put(ui.panel({ w: 6, h: 18, r: 3, color: col, depth: 1, bevel: 0.8, ow: 1, shadow: false, gloss: false }), 8, 6);
    strip.put(ui.text(rowLabel(row), { size: 12, valign: 'mid', outlineW: 1.8 }), 22, 16); strip.put(ui.text(pct(row.p), { size: 14, align: 'right', valign: 'mid', color: 0xffe27a, outlineW: 2 }), 274, 16);
    mui.rates.push({ label: rowLabel(row), p: row.p });
  });
  const sum = GACHA.table.reduce((s, r) => s + r.p, 0);
  rp.put(ui.text('Tổng ' + pct(Math.round(sum * 10) / 10), { size: 12, align: 'right', color: 0xcfd0e0 }), 588, 184);
  rp.put(ui.text(`Bảo hiểm: ${GACHA.pity - 1} lượt liền không ra thú Huyền Thoại thì lượt thứ ${GACHA.pity} chắc chắn ra.\nMười lượt: chắc chắn có ít nhất một kết quả Sử Thi trở lên.\nTrùng thú: đổi thành mảnh. Trang bị: cất vào túi đồ ở tab Trang Bị.`, { size: 11.5, maxW: 420, lineH: 15, color: 0xe4def8 }), 14, 206);
  const rClose = ui.button({ id: 'rates-close', w: 130, h: 48, r: 14, color: PAL.red, label: 'ĐÓNG', size: 17, onTap: () => ui.hide('rates', { transition: 'pop' }) }); rp.put(rClose, 456, 244);
  function openRates() { ui.show('rates', { transition: 'pop' }); }

  // ---------- pull sequence ----------
  const ov = ui.group(); scr.put(ov, 0, 0, 30);
  const scrim = new THREE.Mesh(new THREE.PlaneGeometry(780, 440), new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0, depthWrite: false })); ov.add(scrim); scrim.position.set(390, -180, 0);
  const rayCan = document.createElement('canvas'); rayCan.width = rayCan.height = 256;
  { const c = rayCan.getContext('2d'); c.translate(128, 128); for (let i = 0; i < 14; i++) { c.rotate(Math.PI / 7); const g = c.createLinearGradient(0, 0, 0, -128); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(-13, -128); c.lineTo(13, -128); c.fill(); } }
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rayCan), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); ov.add(rays); rays.position.set(390, -170, 1);
  const skip = ui.button({ id: 'skip', w: 140, h: 48, r: 14, color: PAL.disabled, label: 'BỎ QUA', size: 17, shadow: false, onTap: doSkip }); scr.put(skip, 612, 296, 60); skip.setVisible(false);
  const done = ui.button({ id: 'done', w: 180, h: 52, r: 16, color: PAL.green, label: 'XONG', size: 24, pulse: true, onTap: doDone }); scr.put(done, 572, 292, 60); done.setVisible(false);
  const burst = makeBurst(ui); scr.put(burst.node, 0, 0, 32); // above the scrim, below the reveal card: sparks never cover its labels
  let S = null, card = null, cardT = 0, sumNodes = [];

  function startPull(n) {
    const r = meta.pull(n); if (!r.ok) { ui.toast(r.why === 'thiếu ngọc' ? 'Thiếu ngọc' : r.why); return; }
    S = { results: r.results, i: 0, phase: 'crank', t: 0, ten: n === 10, first: true };
    idleG.setVisible(false); skip.setVisible(true); game.chrome && game.chrome.setNav(false);
    startCap();
  }
  const dur = (ph) => { const f = game.settings.reduceFlash ? 0.8 : 1, k = S.ten ? 0.5 : 1; return ({ crank: S.first ? 0.9 : 0.35, drop: 0.6 * k + 0.1, crack: 0.55 * k + 0.1, reveal: S.ten ? 0.95 : 1e9 }[ph]) * (ph === 'reveal' ? 1 : f); };
  function startCap() {
    frameP.setVisible(true); clearCap(); const r = S.results[S.i], c = colorOf(r);
    const cp = capsule3d(THREE, c, lighten(c, 0.62)); cp.scale.setScalar(0); cp.position.set(0, 0.5, 1.7); root.add(cp);
    cap = { g: cp, color: c, vy: 0, y: 1.0, z: 1.9, bounce: 0 };
  }
  function clearCap() { if (cap) { root.remove(cap.g); cap = null; } glow.visible = false; glowM.opacity = 0; }
  function clearCard() { if (card) { card.dispose(); card = null; } scrim.material.opacity = 0; rays.material.opacity = 0; }
  const peak = () => (game.settings.reduceFlash ? 0.26 : 0.55);

  function capStep(dt) {
    if (!S || !cap) return; const p = S.phase, k = Math.min(1, S.t / dur(p)), u = cap;
    if (p === 'crank') { u.g.scale.setScalar(0); }
    else if (p === 'drop') {
      u.vy -= 14 * dt; u.y += u.vy * dt; u.z += (3.0 - u.z) * Math.min(1, dt * 4);
      if (u.y < 0.5) { u.y = 0.5; u.vy = Math.abs(u.vy) * 0.38; if (u.vy < 0.8) u.vy = 0; }
      u.g.scale.setScalar(Math.min(1, k * 7) * 0.85); u.g.position.set(0, u.y, u.z); u.g.rotation.set(0.5, S.t * 3, 0.9 + Math.sin(S.t * 9) * 0.1);
    } else if (p === 'crack') {
      const e = easeBack(k * 1.4); u.g.position.set(0, 0.5 + 1.2 * Math.min(1, k * 2), 3.0 + 0.5 * Math.min(1, k * 2));
      u.g.rotation.set(0.2, S.t * 9 * (1 - k), 0.5 * (1 - k)); u.g.scale.setScalar(0.85 + 0.2 * Math.sin(k * 3.1));
      const d = Math.max(0, k - 0.45) * 2.2, ud = u.g.userData; ud.top.position.y = d * 1.4; ud.top.rotation.z = -d * 0.8; ud.bot.position.y = -d * 1.4; ud.bot.rotation.z = d * 0.8;
      if (k > 0.45) { glow.visible = true; glow.position.set(0, u.g.position.y, u.g.position.z + 0.5); glow.scale.setScalar(2.5 + (k - 0.45) * 9); glowM.color.setHex(u.color); glowM.opacity = peak() * (1 - Math.max(0, k - 0.75) * 4) * Math.min(1, (k - 0.45) * 8); }
      if (k > 0.8) u.g.scale.setScalar(Math.max(0.01, 0.9 * (1 - (k - 0.8) * 5)));
    } else { u.g.visible = false; glow.visible = false; }
  }

  function showCard(r) {
    clearCard(); frameP.setVisible(false); card = ui.group(); ov.add(card); card.pos(390, 168, 14); cardT = 0; // z 44: above the burst's sparks (32 + their own 4)
    const c = colorOf(r), nm = r.hero ? HERO[r.hero].name : '';
    const isHero = r.kind === 'hero' || r.isNew;
    scrim.material.color.setHex(0x120a24); rays.material.color.setHex(c);
    if (r.hero) {
      const sz = isHero ? 136 : 116, p = ui.portrait(r.hero, { size: sz, color: c }); card.put(p, -200, -sz / 2 + 4);
      card.put(ui.text(nm, { size: 28, upper: true, color: 0xffffff, outlineW: 3 }), -44, -52);
      const rr = ui.panel({ w: 150, h: 28, r: 14, color: c, depth: 3, bevel: 2, ow: 2.4, shadow: false }); card.put(rr, -44, -12); rr.put(ui.text(HERO_RARITY[HERO[r.hero].rarity].name, { size: 13, align: 'center', valign: 'mid', upper: true }), 75, 15.5);
      if (isHero) { const rb = ui.panel({ w: 210, h: 38, r: 19, color: 0xe0242e, depth: 4, bevel: 2.6, ow: 3, shadow: false }); card.put(rb, -44, -104); rb.put(ui.text('THÚ MỚI!', { size: 21, align: 'center', valign: 'mid', upper: true }), 105, 20); }
      else card.put(ui.text('+' + r.n + ' mảnh', { size: 30, color: 0xffe27a, outlineW: 3.6 }), -44, 32);
    } else if (r.kind === 'gold') {
      for (let i = 0; i < 3; i++) card.put(ui.icon('gold', { size: 84, sway: i === 2 }), -190 + i * 40, -42 - i * 5 + (i === 1 ? 20 : 0));
      card.put(ui.text('+' + fmt(r.n) + ' vàng', { size: 32, color: 0xffe27a, outlineW: 3.6 }), 6, -18);
    } else {
      const it = r.item;
      card.put(ui.icon(it ? ITEM_ICON(it.item) : 'bag', { size: 112 }), -190, -56);
      card.put(ui.text(it ? ITEM_DEF[it.item].name : 'Trang bị', { size: 26, outlineW: 3 }), -56, -36);
      card.put(ui.text(it ? 'Bậc ' + TIERS[it.tier].name + ' · đã cất vào túi đồ' : 'Đã cất vào túi đồ', { size: 12, color: 0xe4def8 }), -56, 6);
    }
    burst.spawn(390, 168, r.hero || r.kind === 'gold' ? 22 : 8, c, 200);
  }
  function advance() {
    clearCard(); S.i++; S.first = false;
    if (S.i >= S.results.length) { if (S.ten) buildSummary(); else finishSingle(); return; }
    S.phase = 'crank'; S.t = 0; startCap();
  }
  function finishSingle() { S.i = 0; S.phase = 'reveal'; showCard(S.results[0]); skip.setVisible(false); done.setVisible(true); S.t = 0; clearCap(); }
  function doSkip() {
    if (!S) return;
    if (S.ten) { clearCard(); buildSummary(); } else { clearCap(); finishSingle(); }
  }
  function buildSummary() {
    clearCap(); clearCard(); frameP.setVisible(false); S.phase = 'summary'; skip.setVisible(false); done.setVisible(true); scrim.material.opacity = 0.7;
    const sp = ui.panel({ w: 646, h: 244, r: 22, color: 0x4a3a86, depth: 5, bevel: 3 }); ov.put(sp, 106, 48, 6); sumNodes.push(sp);
    const t = ui.text('KẾT QUẢ', { size: 18, align: 'center', upper: true }); sp.put(t, 323, 5); mui.regTitle('gacha', t);
    S.results.forEach((r, i) => {
      const x = 9 + (i % 5) * 127, y = 32 + Math.floor(i / 5) * 105, c = colorOf(r);
      const cellN = ui.panel({ w: 120, h: 100, r: 14, color: 0x2a2150, depth: 3, bevel: 2, ow: 2, shadow: false }); sp.put(cellN, x, y, 2);
      if (r.hero) cellN.put(ui.portrait(r.hero, { size: 56, color: c, shadow: false, fps: 8 }), 32, 5, 2);
      else cellN.put(ui.tile({ size: 56, color: r.item ? TIERS[r.item.tier].color : c, icon: r.kind === 'gold' ? 'gold' : r.item ? ITEM_ICON(r.item.item) : 'bag', shadow: false, sway: false }), 32, 5, 2);
      const head = r.kind === 'hero' || r.isNew ? 'THÚ MỚI' : r.kind === 'shard' ? '+' + r.n + ' mảnh' : r.kind === 'gold' ? '+' + r.n + ' vàng' : 'Trang bị';
      cellN.put(ui.text(head, { size: 12, align: 'center', color: r.isNew || r.kind === 'hero' ? 0xffe27a : 0xffffff, outlineW: 2 }), 60, 65);
      cellN.put(ui.text(r.hero ? HERO[r.hero].name : r.item ? ITEM_DEF[r.item.item].name : '', { size: 11, align: 'center', color: lighten(c, 0.3), outlineW: 1.8, maxW: 112 }), 60, 81);
    });
    sp.tick = 0; ov.userData.sum = sp;
  }
  function doDone() {
    if (!S) return; clearCard(); clearCap(); for (const n of sumNodes) n.dispose(); sumNodes = []; scrim.material.opacity = 0;
    S = null; frameP.setVisible(true); done.setVisible(false); skip.setVisible(false); idleG.setVisible(true); lastKey = ''; game.chrome && game.chrome.setNav(true);
  }
  mui.gachaPhase = () => (S ? S.phase : 'idle');

  // tap anywhere on empty space: finish the current step
  const fr = document.getElementById('frame');
  fr.addEventListener('pointerup', (e) => {
    if (!S || !ui.isShown('gacha') || ui.hitAt(e.clientX, e.clientY)) return;
    if (S.phase === 'reveal' && S.ten) advance(); else if (S.phase === 'crank' || S.phase === 'drop' || S.phase === 'crack') S.t = dur(S.phase);
  });

  function updateSeq(dt) {
    S.t += dt; const p = S.phase, d = dur(p);
    if (p === 'crank') { crankSpeed = 9; if (S.t >= d) { S.phase = 'drop'; S.t = 0; cap.vy = 0; } }
    else if (p === 'drop') { if (S.t >= d) { S.phase = 'crack'; S.t = 0; } }
    else if (p === 'crack') { if (S.t >= d) { S.phase = 'reveal'; S.t = 0; clearCap(); showCard(S.results[S.i]); if (!S.ten) { skip.setVisible(false); done.setVisible(true); } } }
    else if (p === 'reveal') { if (S.ten && S.t >= d) advance(); }
    if (card) {
      // the pop scales x and y only: a squashed z let the labels sink into their ribbon's face while the card grew
      cardT += dt; const k = Math.max(0.01, easeBack(cardT / 0.38)); card.scale.set(k, k, 1);
      scrim.material.opacity = Math.min(0.62, cardT * 3); rays.material.opacity = Math.min(game.settings.reduceFlash ? 0.25 : 0.5, cardT * 2); rays.rotation.z -= dt * 0.35;
    }
  }

  return {
    name: 'gacha',
    show() { ui.show('gacha', { transition: 'none' }); if (!S) { idleG.setVisible(true); lastKey = ''; } },
    hide() { ui.hide('gacha', { transition: 'none' }); ui.hide('rates', { transition: 'none' }); if (S) { clearCard(); clearCap(); for (const n of sumNodes) n.dispose(); sumNodes = []; S = null; frameP.setVisible(true); done.setVisible(false); skip.setVisible(false); idleG.setVisible(true); } },
    update(dt) {
      if (!ui.isShown('gacha')) return;
      title.visible = scrim.material.opacity < 0.05; // the reveal scrim would dim it into a half-covered title
      bd.tick(ui.t); burst.update(dt); if (S) updateSeq(dt); else refreshIdle();
    },
  };
}
