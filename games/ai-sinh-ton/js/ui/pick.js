// Upgrade pick between waves: a modal over the frozen fight. One hero at a time, three rarity-framed card buttons,
// a progress row of the four heroes and an auto-pick button. The sim decides what is open (B.phase, B.picked);
// this screen only mirrors it, so an auto pick from anywhere closes it as well.
import { HERO } from '../data/heroes.js?v=20261120c';
import { CARD, CARD_RARITY } from '../data/cards.js?v=20261120c';
import { clamp, easeOut, heroColor, kill, roundPlane } from './hud.js?v=20261120c';

// 780 x 360: hero being upgraded at the left, three cards side by side in the middle, the auto button at the right
const CARD_W = 152, CARD_H = 222, CARD_GAP = 8, CARDS_X = 166, CARDS_Y = 70, OUT_T = 0.34, IN_T = 0.3;
const dark = (hex, k) => { const r = ((hex >> 16) & 255) * k, g = ((hex >> 8) & 255) * k, b = (hex & 255) * k; return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b); };

export function createPick(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE, W = ui.W;
  const scr = ui.screen('pick', { modal: true });
  let open = false, leaving = 0, shown = -1, locked = false, anim = null, sig = '';
  let content = null, cardNodes = [], progress = [], autoOn = true;

  const dim = new THREE.Mesh(new THREE.PlaneGeometry(1200, 700), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.66, depthWrite: false, toneMapped: false }));
  scr.put(dim, W / 2, 180, 0);
  scr.put(ui.panel({ w: 744, h: 336, r: 26, color: 0x33286a, depth: 6, bevel: 3, gloss: false }), 18, 12, 2);
  const title = ui.text('CHỌN NÂNG CẤP', { size: 22, align: 'center', valign: 'mid' }); scr.put(title, W / 2, 34, 14);
  const sub = ui.text('', { size: 12, align: 'center', valign: 'mid', color: 0xffe9a6 }); scr.put(sub, W / 2, 56, 14);
  const auto = ui.button({ id: 'autopick', w: 104, h: 56, r: 16, color: PAL.teal, label: 'TỰ CHỌN', size: 15, onTap: () => { if (!game.meta.unlocked('autopick')) { ui.toast(game.meta.lockText('autopick')); return; } if (!locked) game.autoPick(); } });
  const autoLock = ui.icon('lock', { size: 26, sway: false }); auto.put(autoLock, 80, -10, 14);
  scr.put(auto, 640, 276, 14);
  scr.put(ui.text('Tự chọn thẻ tốt nhất cho cả đội', { size: 11, align: 'center', maxW: 104, lineH: 13, color: 0xcdbfff, outlineW: 1.3 }), 692, 246, 14);

  function buildProgress(B) {
    for (const p of progress) kill(p.node); progress = [];
    const n = B.heroes.length, size = 28, gap = 6, x0 = 28 + (128 - (n * size + (n - 1) * gap)) / 2;
    B.heroes.forEach((u, i) => {
      const node = ui.group({ w: size, h: size }); scr.put(node, x0 + i * (size + gap), 306, 14);
      const halo = ui.panel({ w: size + 6, h: size + 6, r: 11, color: PAL.gold, depth: 3, bevel: 2, gloss: false, shadow: false, ow: 2.2 }); node.put(halo, -3, -3, -2); halo.setVisible(false);
      node.put(ui.portrait(u.kind, { size, color: heroColor(u.kind), fps: 6 }), 0, 0, 0);
      const wait = roundPlane(THREE, size - 5, size - 5, 4, 'rgba(18,14,32,0.62)'); wait.position.set(size / 2, -size / 2, 17); node.add(wait);
      const check = ui.icon('check', { size: 18, sway: false }); node.put(check, size - 12, size - 12, 20); check.setVisible(false);
      progress.push({ node, halo, wait, check });
    });
  }

  function heldRow(u) {
    const g = ui.group({ w: 128, h: 64 }), max = 8, ids = u.cards.slice(-max);
    ids.forEach((id, i) => { const c = CARD[id]; g.put(ui.tile({ size: 28, color: CARD_RARITY[c.rar].color, icon: c.icon, sway: false }), (i % 4) * 33, Math.floor(i / 4) * 33, 0); });
    return g;
  }

  function cardButton(slot, k, id) {
    const c = CARD[id], rar = CARD_RARITY[c.rar], own = !!c.hero;
    const btn = ui.button({ id: 'card' + k, w: CARD_W, h: CARD_H, r: 18, color: rar.color, onTap: () => choose(slot, k) });
    btn.put(ui.panel({ w: CARD_W - 12, h: CARD_H - 12, r: 13, color: dark(rar.color, 0.3), depth: 2, bevel: 1.6, gloss: false, shadow: false, ow: 0 }), 6, 6, 1);
    btn.put(ui.tile({ size: 64, color: rar.color, icon: c.icon }), (CARD_W - 64) / 2, 16, 3);
    btn.put(ui.text(c.name, { size: 16, align: 'center', valign: 'mid', maxW: CARD_W - 20, lineH: 17 }), CARD_W / 2, 104, 9);
    btn.put(ui.text(c.desc, { size: 13, align: 'center', maxW: CARD_W - 20, lineH: 16, color: 0xfff1cf, outlineW: 1.3 }), CARD_W / 2, 122, 9);
    const tag = (text, color, x, w) => { const p = ui.panel({ w, h: 20, r: 10, color, depth: 3, bevel: 1.6, ow: 2, shadow: false }); p.put(ui.text(text, { size: 11, align: 'center', valign: 'mid', outlineW: 1.3 }), w / 2, 11, 2); btn.put(p, x, CARD_H - 30, 8); };
    const rn = rar.name.toLocaleUpperCase('vi'), rw = 78;
    if (own) { tag(rn, dark(rar.color, 0.75), 8, rw); tag('RIÊNG', PAL.orange, CARD_W - 8 - 54, 54); } else tag(rn, dark(rar.color, 0.75), (CARD_W - rw) / 2, rw);
    return btn;
  }

  function buildHero(B, slot) {
    if (content) { kill(content); content = null; }
    const u = B.heroes[slot], def = HERO[u.kind];
    content = ui.group({ w: W, h: 360 }); scr.put(content, 0, 0, 14);
    content.put(ui.portrait(u.kind, { size: 84, color: heroColor(u.kind) }), 50, 74, 0);
    content.put(ui.text(def.name, { size: 18, align: 'center', valign: 'mid', maxW: 0 }), 92, 176, 2);
    content.put(ui.text(def.title, { size: 11, align: 'center', color: 0xcdbfff, outlineW: 1.4, maxW: 124, lineH: 13 }), 92, 192, 2);
    if (u.cards.length) { content.put(ui.text('Đang có:', { size: 11, align: 'left', valign: 'mid', color: 0xffe9a6, outlineW: 1.3 }), 28, 226, 2); content.put(heldRow(u), 28, 236, 0); }
    else content.put(ui.text('Chưa có thẻ nào', { size: 11, align: 'center', valign: 'mid', color: 0xb9b3cc, outlineW: 1.3 }), 92, 232, 2);
    cardNodes = B.offers[slot].map((id, k) => { const b = cardButton(slot, k, id); b.homeX = CARDS_X + k * (CARD_W + CARD_GAP); content.put(b, b.homeX, CARDS_Y, 0); return b; });
    shown = slot; sub.set(`Sau đợt ${B.wave}  ·  Tướng ${slot + 1}/${B.heroes.length}`);
  }

  function choose(slot, k) {
    if (locked || !open || !game.B || shown !== slot) return;
    if (!game.pick(slot, k)) return;
    locked = true; anim = { kind: 'out', t: 0, k };
  }

  function openIt(B) {
    open = true; leaving = 0; locked = false; anim = null; shown = -1;
    const s = B.heroes.map((u) => u.kind).join(','); if (s !== sig) { sig = s; buildProgress(B); }
    ui.show('pick', { transition: 'pop' });
    const lk = !game.meta.unlocked('autopick'); autoLock.setVisible(lk);
    if (lk) { auto.setEnabled(false); auto.target.enabled = true; autoOn = false; }
    if (game.settings.autoPick && !lk) game.autoPick();
  }
  function closeIt() {
    open = false; leaving = 0; anim = null; locked = false; shown = -1;
    if (content) { kill(content); content = null; } cardNodes = [];
    ui.hide('pick', { transition: 'pop' });
  }

  function animate(dt) {
    if (!anim || !content) return;
    anim.t += dt;
    if (anim.kind === 'out') {
      const e = clamp(anim.t / OUT_T, 0, 1), q = e * e;
      cardNodes.forEach((b, k) => {
        if (k === anim.k) { const s = Math.max(0.05, 1 - 0.9 * q); b.scale.set(s, s, 1); b.pos(b.homeX + (92 - b.homeX - CARD_W / 2) * q + CARD_W / 2 * (1 - s), CARDS_Y + (110 - CARDS_Y - CARD_H / 2) * q + CARD_H / 2 * (1 - s)); }
        else b.pos(b.homeX + 700 * easeOut(e), CARDS_Y);
      });
      if (e >= 1) { anim = null; const B = game.B; shown = -1; if (B && B.phase === 'pick') { locked = false; } }
    } else if (anim.kind === 'in') {
      const e = clamp(anim.t / IN_T, 0, 1); content.pos(W * (1 - easeOut(e)), 0, 14);
      if (e >= 1) { anim = null; content.pos(0, 0, 14); }
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const B = game.B;
    if (!B) { if (open) closeIt(); return; }
    if (B.phase === 'pick' && !open) openIt(B);
    if (!open) return;
    if (B.phase !== 'pick') { leaving += dt; if (!anim || anim.kind !== 'out' || leaving > OUT_T + 0.05) closeIt(); else animate(dt); return; }
    const cur = B.picked.findIndex((p) => p < 0);
    if (!anim || anim.kind !== 'out') {
      if (cur >= 0 && cur !== shown) { buildHero(B, cur); anim = { kind: 'in', t: 0 }; content.pos(W, 0, 14); }
    }
    animate(dt);
    progress.forEach((p, i) => { const done = B.picked[i] >= 0; p.check.setVisible(done); p.halo.setVisible(i === cur); p.wait.visible = i > cur && !done; });
    if (!autoLock.visible && autoOn === locked) { autoOn = !locked; auto.setEnabled(autoOn); }
  }

  return {
    name: 'pick',
    show() { const B = game.B; if (B && B.phase === 'pick' && !open) openIt(B); },
    hide() { if (open) closeIt(); },
    update,
    dbg() { return { open, shown, locked, anim: anim && anim.kind }; },
  };
}
