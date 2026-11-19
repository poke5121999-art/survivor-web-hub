// Thưởng tab: the daily chest (meta.claimDaily) and the list of chapter chests (meta.claimChapter). Trang Bị lives in equip.js.
import { makeBackdrop, makeBurst, fmt, kill } from './home.js?v=20261119c';
import { HERO } from '../data/heroes.js?v=20261119c';
import { lockButton } from './guide.js?v=20261119c';
import { CHAPTERS } from '../data/stages.js?v=20261119c';
import { TIERS } from '../data/equip.js?v=20261119c';
import { ITEM_ICON } from './itemicons.js?v=20261119c';

const CHEST_ROW = 70, LIST = { x: 15, y: 402, w: 330, h: 230 };
const ROW_COLOR = { locked: 0x453a78, ready: 0xd8892a, claimed: 0x2f7a62 };


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
  const rewards = ui.screen('rewards');
  const bdR = makeBackdrop(ui, 'rewards'); rewards.put(bdR, 0, 0, -40);

  // ---- Thưởng: daily chest ----
  const tR = ui.text('THƯỞNG', { size: 26, align: 'center', upper: true, outlineW: 3.4 }); rewards.put(tR, 180, 62, 6); mui.regTitle('rewards', tR);
  const frameP = ui.panel({ w: 330, h: 150, r: 22, color: 0x6a3a98, depth: 5, bevel: 3 }); rewards.put(frameP, 15, 102, 6);
  const chest = buildChest(ui.THREE), U = chest.userData;
  const ccam = new ui.THREE.PerspectiveCamera(30, 318 / 138, 0.1, 50); ccam.position.set(0, 3.0, 10.4); ccam.lookAt(0, 0.9, 0);
  const view = ui.viewport(chest, { w: 318, h: 138, r: 17, bg: 0x7a4aa8, fps: 24, camera: ccam, update: (dt) => cu(dt) });
  frameP.put(view, 6, 6, 1);
  const daily = ui.button({ id: 'daily', w: 250, h: 66, color: PAL.green, label: 'NHẬN', sub: ' ', size: 19, pulse: true, onTap: claim }); rewards.put(daily, 55, 262, 6);
  const dailyLock = ui.icon('lock', { size: 34, sway: false }); daily.put(dailyLock, 214, -10, 14);
  const chipRow = ui.group({ w: 330, h: 44 }); rewards.put(chipRow, 15, 340, 6);
  const burst = makeBurst(ui); rewards.put(burst.node, 0, 0, 40);

  // ---- chapter chests: one scroll row per campaign chapter ----
  const head = ui.text('RƯƠNG CHƯƠNG', { size: 14, color: 0xffe9a8, outlineW: 2.2, upper: true }); rewards.put(head, 20, 382, 6);
  const sc = ui.scroll({ w: LIST.w, h: LIST.h }); rewards.put(sc, LIST.x, LIST.y, 4);
  const lockCard = ui.panel({ w: 330, h: 150, r: 22, color: 0x4a3a86, depth: 4, bevel: 3 }); rewards.put(lockCard, 15, 440, 6);
  lockCard.put(ui.icon('lock', { size: 64, sway: false }), 133, 16, 4);
  const lockTxt = ui.text('', { size: 15, align: 'center', outlineW: 2.2 }); lockCard.put(lockTxt, 165, 100, 4);
  const dim = (m, on) => { if (m.userData.c0 === undefined) m.userData.c0 = m.color.getHex(); m.color.setHex(on ? new ui.THREE.Color(m.userData.c0).multiplyScalar(0.5).getHex() : m.userData.c0); };
  const rows = CHAPTERS.map((ch, c) => {
    const g = ui.group({ w: 322, h: 64 }); sc.put(g, 4, c * CHEST_ROW + 4, 0);
    const panel = ui.panel({ w: 322, h: 64, r: 18, color: ROW_COLOR.locked, depth: 4, bevel: 2.6, ow: 2.6 }); g.put(panel, 0, 0, 0);
    const cm = buildChest(ui.THREE), cu2 = cm.userData; cm.scale.setScalar(15); cm.position.set(36, -41, 22); cm.rotation.x = 0.3; g.add(cm);
    const mats = []; cm.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) mats.push(o.material); });
    const lockI2 = ui.icon('lock', { size: 26, sway: false }); g.put(lockI2, 40, 28, 30);
    g.put(ui.text(ch.name, { size: 15, outlineW: 2.2, upper: true }), 70, 8, 8);
    g.put(ui.text('Chương ' + (c + 1) + ' - Qua ải ' + (c + 1) * 5, { size: 11.5, color: 0xffe9a8, outlineW: 1.6 }), 70, 28, 8);
    g.put(ui.text('300 ngọc, bản rèn, 1 đồ Hiếm', { size: 10, color: 0xe2d8ff, outlineW: 1.4 }), 70, 45, 8);
    const btn = ui.button({ id: 'chapter' + c, w: 84, h: 48, r: 14, color: PAL.green, label: 'NHẬN', size: 14, onTap: () => claimChapter(c) }); g.put(btn, 232, 8, 8);
    const bl = ui.icon('lock', { size: 24, sway: false }); btn.put(bl, 62, -8, 14);
    return { g, panel, cm, cu2, mats, lockI2, btn, bl, lid: 0, state: '' };
  });
  sc.setContentH(rows.length * CHEST_ROW + 8);
  mui.chapters = rows.map(() => ({ state: '' }));
  mui.chapterLock = '';
  const state = (c) => (meta.acc.chapters[c] ? 'claimed' : meta.canClaimChapter(c) ? 'ready' : 'locked');
  function paintChapters() {
    const open = meta.unlocked('chapter');
    sc.setVisible(open); head.setVisible(open); lockCard.setVisible(!open);
    mui.chapterLock = open ? '' : meta.lockText('chapter'); lockTxt.set(meta.lockText('chapter'));
    rows.forEach((r, c) => {
      const st = open ? state(c) : 'locked'; mui.chapters[c] = { state: st };
      if (st === r.state && open === r.open) return; r.state = st; r.open = open;
      r.panel.setColor(ROW_COLOR[st]); r.lockI2.setVisible(st === 'locked'); r.bl.setVisible(st === 'locked');
      r.mats.forEach((m) => dim(m, st === 'locked'));
      if (st === 'locked') lockButton(r.btn, true); else { r.btn.lockedNow = null; r.btn.setEnabled(st === 'ready'); }
      r.btn.setLabel(st === 'claimed' ? 'ĐÃ NHẬN' : 'NHẬN');
    });
  }
  function claimChapter(c) {
    if (!meta.unlocked('chapter')) { ui.toast(meta.lockText('chapter')); return; }
    if (state(c) === 'locked') { ui.toast('Qua ải ' + (c + 1) * 5 + ' để mở rương này'); return; }
    const r = meta.claimChapter(c); if (!r.ok) { ui.toast(r.why.charAt(0).toLocaleUpperCase('vi') + r.why.slice(1)); return; }
    mui.chapterReceipt = { chapter: c, gems: r.gems, mats: r.mats, item: r.item }; showChapterReceipt(r);
    burst.spawn(LIST.x + 40, LIST.y + c * CHEST_ROW + 36 - sc.getScroll(), 22, 0xffd21f, 190); game.vibrate && game.vibrate(20); paintChapters();
  }

  let lid = 0, lidT = 0, glowT = 0, t0 = 0;
  const cu = (dt) => {
    t0 += dt; lid += (lidT - lid) * (1 - Math.exp(-dt * 7)); glowT += (lidT ? 0.55 - glowT : -glowT) * (1 - Math.exp(-dt * 4));
    U.hinge.rotation.x = -lid * 1.9; U.glowM.opacity = glowT * (0.7 + 0.3 * Math.sin(t0 * 3));
    chest.rotation.y = lidT ? 0.35 + Math.sin(t0 * 0.7) * 0.1 : Math.sin(t0 * 1.1) * 0.25 + 0.2; chest.rotation.x = 0.28;
    U.inner.position.y = Math.sin(t0 * 2) * 0.05; for (const c of U.coins) c.visible = lidT > 0.5;
  };
  function animRows(dt) {
    const t = ui.t;
    for (const r of rows) {
      const want = r.state === 'claimed' ? 1 : r.state === 'ready' ? 0.28 + 0.12 * Math.sin(t * 5) : 0;
      r.lid += (want - r.lid) * (1 - Math.exp(-dt * 8));
      r.cu2.hinge.rotation.x = -r.lid * 1.9; r.cu2.glowM.opacity = r.state === 'locked' ? 0 : Math.min(1, r.lid * 1.4) * (0.7 + 0.3 * Math.sin(t * 3));
      for (const c of r.cu2.coins) c.visible = r.state === 'claimed';
      r.cm.rotation.y = r.state === 'ready' ? 0.35 + Math.sin(t * 4) * 0.2 : -0.45;
      r.cu2.inner.position.y = r.state === 'ready' ? Math.abs(Math.sin(t * 5)) * 0.18 : 0;
    }
  }
  function setClaimed(done) {
    daily.setEnabled(!done); daily.setLabel(done ? 'ĐÃ NHẬN' : 'NHẬN');
    dailyLock.setVisible(!meta.unlocked('daily'));
    if (!meta.unlocked('daily')) { daily.setEnabled(false); daily.target.enabled = true; daily.setLabel('KHOÁ'); daily.setSub(meta.lockText('daily')); mui.dailyText = meta.lockText('daily'); return; } daily.setSub(done ? 'Quay lại vào ngày mai' : 'Rương ngày: ngọc, vàng và mảnh');
    mui.dailyText = done ? 'Quay lại vào ngày mai' : 'Rương ngày: ngọc, vàng và mảnh'; lidT = done ? 1 : 0; if (done) lid = 1;
  }
  let chips = [];
  const clearChips = () => { for (const c of chips) kill(c); chips = []; };
  const chip = (ic, str, w, x) => {
    const p = ui.panel({ w, h: 34, r: 17, color: 0x2a2150, depth: 3, bevel: 2, ow: 2.2, shadow: false }); chipRow.put(p, x, 5);
    p.put(ui.icon(ic, { size: 34 }), -7, -1, 4); p.put(ui.text(str, { size: 13, valign: 'mid' }), 30, 18); chips.push(p); return p;
  };
  function showReceipt(r) {
    clearChips(); mui.chapterReceipt = null;
    chip('gem', '+' + fmt(r.gems), 92, 0); chip('gold', '+' + fmt(r.gold), 92, 100); chip('shard', '+' + r.shards + ' ' + HERO[r.hero].name, 128, 202);
  }
  function showChapterReceipt(r) {
    clearChips();
    chip('gem', '+' + fmt(r.gems), 92, 0); chip('gear', '+' + r.mats + ' bản rèn', 124, 100);
    const t = ui.tile({ size: 40, color: TIERS[r.item.tier].color, icon: ITEM_ICON(r.item.item) }); chipRow.put(t, 232, 2, 4); chips.push(t);
    const nm = ui.text(TIERS[r.item.tier].name, { size: 11, outlineW: 1.6 }); chipRow.put(nm, 278, 14, 4); chips.push(nm);
  }
  function claim() {
    if (!meta.unlocked('daily')) { ui.toast(meta.lockText('daily')); return; }
    const r = meta.claimDaily(); if (!r.ok) { ui.toast('Hôm nay đã nhận rồi'); return; }
    setClaimed(true); showReceipt(r); burst.spawn(180, 190, 26, 0xffd21f, 190); game.vibrate && game.vibrate(20);
  }
  let dirty = true; meta.on(() => { dirty = true; });
  const mk = (name, scr, bd, onShow) => ({
    name, show() { ui.show(name, { transition: 'none' }); if (onShow) onShow(); }, hide() { ui.hide(name, { transition: 'none' }); },
    update(dt) { if (!ui.isShown(name)) return; bd.tick(ui.t); if (dirty) { dirty = false; paintChapters(); } animRows(dt); burst.update(dt); },
  });
  return [mk('rewards', rewards, bdR, () => { paintChapters(); const done = !meta.canClaimDaily(); setClaimed(done); if (!done) clearChips(); })];
}
