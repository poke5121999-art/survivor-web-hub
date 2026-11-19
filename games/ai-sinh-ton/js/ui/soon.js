// Trang Bị and Thưởng tabs for drop 1. Equipment is not in yet (a proper "SẮP CÓ" screen with the six slots shown
// locked); the daily chest on Thưởng already works through meta.claimDaily().
import { makeBackdrop, makeBurst, fmt, kill } from './home.js?v=20261119b';
import { HERO } from '../data/heroes.js?v=20261119b';
import { lockButton } from './guide.js?v=20261119b';

const SLOT_TILES = [['weapon', 'Vũ Khí'], ['necklace', 'Dây Chuyền'], ['gloves', 'Găng Tay'], ['armor', 'Giáp'], ['belt', 'Thắt Lưng'], ['boots', 'Giày']];

function buildChest(THREE) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const m = (c, r = 0.55) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const ink = new THREE.MeshBasicMaterial({ color: 0x1a1420, side: THREE.BackSide });
  const hull = (mesh, k = 1.05) => { const o = new THREE.Mesh(mesh.geometry, ink); o.scale.setScalar(k); mesh.add(o); return mesh; };
  const wood = 0xb8662a, gold = 0xffc21f;
  const body = hull(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.5), m(wood))); body.position.y = 0.6; inner.add(body);
  for (const x of [-0.85, 0.85]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.24, 1.56), m(gold, 0.3)); band.position.set(x, 0.6, 0); inner.add(band); }
  const glowM = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), glowM); glow.rotation.x = -Math.PI / 2; glow.position.y = 1.18; inner.add(glow);
  const hinge = new THREE.Group(); hinge.position.set(0, 1.2, -0.75); inner.add(hinge);
  const lid = hull(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 24, 1, false, 0, Math.PI), m(wood))); lid.rotation.z = Math.PI / 2; lid.rotation.y = -Math.PI / 2; lid.position.set(0, 0, 0.75); hinge.add(lid);
  for (const x of [-0.85, 0.85]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.26, 24, 1, false, 0, Math.PI), m(gold, 0.3)); band.rotation.z = Math.PI / 2; band.rotation.y = -Math.PI / 2; band.position.set(x, 0, 0.75); hinge.add(band); }
  const lock = hull(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.14), m(gold, 0.25))); lock.position.set(0, 1.14, 0.78); inner.add(lock);
  const coins = [];
  for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), m(gold, 0.25)); c.rotation.x = Math.PI / 2 + 0.5; c.position.set(-0.8 + (i % 4) * 0.5, 1.12 + (i > 3 ? 0.1 : 0), -0.2 + (i > 3 ? 0.3 : -0.1)); c.visible = false; inner.add(c); coins.push(c); }
  g.userData = { inner, hinge, glowM, lock, coins };
  return g;
}

export function createSoon(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, mui = game.metaUi;
  const equip = ui.screen('equip'), rewards = ui.screen('rewards');
  const bdE = makeBackdrop(ui, 'equip'), bdR = makeBackdrop(ui, 'rewards'); equip.put(bdE, 0, 0, -40); rewards.put(bdR, 0, 0, -40);

  // ---- Trang Bị ----
  const tE = ui.text('TRANG BỊ', { size: 26, align: 'center', upper: true, outlineW: 3.4 }); equip.put(tE, 180, 62, 6); mui.regTitle('equip', tE);
  const big = ui.icon('armor', { size: 118 }); equip.put(big, 121, 104, 6);
  const rib = ui.panel({ w: 220, h: 46, r: 23, color: 0xe0242e, depth: 5, bevel: 3, ow: 3 }); equip.put(rib, 70, 230, 6);
  const sTxt = ui.text('SẮP CÓ', { size: 28, align: 'center', upper: true, valign: 'mid', outlineW: 3.4 }); rib.put(sTxt, 110, 25, 4); mui.regTitle('equip', sTxt);
  equip.put(ui.text('Mỗi tướng mặc một bộ riêng sáu món,\nnâng cấp và ghép lên bậc cao hơn.', { size: 14, align: 'center', lineH: 20, color: 0xfff6dc }), 180, 290, 6);
  SLOT_TILES.forEach(([icon, name], i) => {
    const c = i % 3, r = Math.floor(i / 3), x = 38 + c * 106, y = 372 + r * 112;
    const t = ui.tile({ size: 76, color: 0x8d7ad8, icon, sway: false }); equip.put(t, x, y, 6);
    t.put(ui.icon('lock', { size: 26 }), 76 - 22, 76 - 22, 12);
    equip.put(ui.text(name, { size: 12, align: 'center' }), x + 38, y + 82, 6);
  });

  // ---- Thưởng ----
  const tR = ui.text('THƯỞNG', { size: 26, align: 'center', upper: true, outlineW: 3.4 }); rewards.put(tR, 180, 62, 6); mui.regTitle('rewards', tR);
  const frameP = ui.panel({ w: 330, h: 236, r: 22, color: 0x6a3a98, depth: 5, bevel: 3 }); rewards.put(frameP, 15, 104, 6);
  const chest = buildChest(ui.THREE), U = chest.userData;
  const ccam = new ui.THREE.PerspectiveCamera(30, 318 / 224, 0.1, 50); ccam.position.set(0, 3.3, 8.8); ccam.lookAt(0, 1.0, 0);
  const view = ui.viewport(chest, { w: 318, h: 224, r: 17, bg: 0x7a4aa8, fps: 24, camera: ccam, update: (dt) => cu(dt) });
  frameP.put(view, 6, 6, 1);
  const daily = ui.button({ id: 'daily', w: 250, h: 74, color: PAL.green, label: 'NHẬN', sub: ' ', size: 19, pulse: true, onTap: claim }); rewards.put(daily, 55, 352, 6);
  const dailyLock = ui.icon('lock', { size: 34, sway: false }); daily.put(dailyLock, 214, -10, 14);
  const chipRow = ui.group({ w: 330, h: 44 }); rewards.put(chipRow, 15, 448, 6);
  const card = ui.panel({ w: 330, h: 92, r: 18, color: 0x4a3a86, depth: 4, bevel: 3 }); rewards.put(card, 15, 540, 6);
  card.put(ui.icon('chest', { size: 54 }), 12, 18, 4);
  card.put(ui.text('Rương chương', { size: 16 }), 78, 14);
  const chapTxt = ui.text('Qua đủ 5 ải để nhận.', { size: 12, color: 0xffe9a8 }); card.put(chapTxt, 78, 40);
  const chap = ui.button({ id: 'chapter0', w: 84, h: 48, r: 14, color: PAL.green, label: 'NHẬN', size: 16, onTap: claimChapter }); card.put(chap, 238, 22, 6);
  const chapLock = ui.icon('lock', { size: 26, sway: false }); chap.put(chapLock, 62, -8, 14);
  function claimChapter() {
    if (!meta.unlocked('chapter')) { ui.toast(meta.lockText('chapter')); return; }
    const r = meta.claimChapter(0); if (!r.ok) { ui.toast(r.why.charAt(0).toLocaleUpperCase('vi') + r.why.slice(1)); return; }
    ui.toast('Rương chương: +' + r.gems + ' ngọc'); burst.spawn(180, 590, 22, 0xffd21f, 190); game.vibrate && game.vibrate(20);
  }
  function paintChapter() {
    const lk = !meta.unlocked('chapter'); chapLock.setVisible(lk);
    const got = !!meta.acc.chapters[0], ready = meta.canClaimChapter(0);
    lockButton(chap, lk); if (!lk) { chap.lockedNow = null; chap.setEnabled(ready); chap.target.enabled = true; }
    chap.setLabel(got ? 'ĐÃ NHẬN' : 'NHẬN'); chapTxt.set(lk ? meta.lockText('chapter') : got ? 'Đã nhận rương chương 1.' : 'Qua đủ 5 ải để nhận.');
  }
  const burst = makeBurst(ui); rewards.put(burst.node, 0, 0, 40);

  let lid = 0, lidT = 0, glowT = 0, t0 = 0;
  const cu = (dt) => {
    t0 += dt; lid += (lidT - lid) * (1 - Math.exp(-dt * 7)); glowT += (lidT ? 0.55 - glowT : -glowT) * (1 - Math.exp(-dt * 4));
    U.hinge.rotation.x = -lid * 1.9; U.glowM.opacity = glowT * (0.7 + 0.3 * Math.sin(t0 * 3));
    chest.rotation.y = lidT ? 0.35 + Math.sin(t0 * 0.7) * 0.1 : Math.sin(t0 * 1.1) * 0.25 + 0.2; chest.rotation.x = 0.28;
    U.inner.position.y = Math.sin(t0 * 2) * 0.05; for (const c of U.coins) c.visible = lidT > 0.5;
  };
  function setClaimed(done) {
    daily.setEnabled(!done); daily.setLabel(done ? 'ĐÃ NHẬN' : 'NHẬN');
    dailyLock.setVisible(!meta.unlocked('daily'));
    if (!meta.unlocked('daily')) { daily.setEnabled(false); daily.target.enabled = true; daily.setLabel('KHOÁ'); daily.setSub(meta.lockText('daily')); mui.dailyText = meta.lockText('daily'); return; } daily.setSub(done ? 'Quay lại vào ngày mai' : 'Rương ngày: ngọc, vàng và mảnh');
    mui.dailyText = done ? 'Quay lại vào ngày mai' : 'Rương ngày: ngọc, vàng và mảnh'; lidT = done ? 1 : 0; if (done) lid = 1;
  }
  let chips = [];
  function showReceipt(r) {
    for (const c of chips) kill(c); chips = [];
    const items = [['gem', '+' + fmt(r.gems)], ['gold', '+' + fmt(r.gold)], ['shard', '+' + r.shards + ' ' + HERO[r.hero].name]];
    items.forEach(([ic, s], i) => {
      const p = ui.panel({ w: i === 2 ? 128 : 92, h: 34, r: 17, color: 0x2a2150, depth: 3, bevel: 2, ow: 2.2, shadow: false }); const x = i === 0 ? 0 : i === 1 ? 100 : 200; chipRow.put(p, x + (i === 2 ? 2 : 0), 5);
      p.put(ui.icon(ic, { size: 34 }), -7, -1, 4); p.put(ui.text(s, { size: 13, valign: 'mid' }), 30, 18); chips.push(p);
    });
  }
  function claim() {
    if (!meta.unlocked('daily')) { ui.toast(meta.lockText('daily')); return; }
    const r = meta.claimDaily(); if (!r.ok) { ui.toast('Hôm nay đã nhận rồi'); return; }
    setClaimed(true); showReceipt(r); burst.spawn(180, 220, 26, 0xffd21f, 190); game.vibrate && game.vibrate(20);
  }
  const mk = (name, scr, bd, onShow) => ({
    name, show() { ui.show(name, { transition: 'none' }); if (onShow) onShow(); }, hide() { ui.hide(name, { transition: 'none' }); },
    update(dt) { if (!ui.isShown(name)) return; bd.tick(ui.t); if (name === 'rewards') burst.update(dt); },
  });
  return [mk('equip', equip, bdE), mk('rewards', rewards, bdR, () => { paintChapter(); const done = !meta.canClaimDaily(); setClaimed(done); if (!done) { for (const c of chips) kill(c); chips = []; } })];
}
