// Upgrade pick between waves: a modal over the frozen fight. One hero at a time, three rarity-framed card buttons,
// a progress row of the four heroes and an auto-pick button. The sim decides what is open (B.phase, B.picked);
// this screen only mirrors it, so an auto pick from anywhere closes it as well.
import { HERO } from '../data/heroes.js';
import { CARD, CARD_RARITY } from '../data/cards.js';
import { clamp, easeOut, heroColor, kill, roundPlane } from './hud.js';

const CARD_W = 316, CARD_H = 106, CARD_PITCH = 136, CARDS_Y = 102, OUT_T = 0.34, IN_T = 0.3;
const dark = (hex, k) => { const r = ((hex >> 16) & 255) * k, g = ((hex >> 8) & 255) * k, b = (hex & 255) * k; return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b); };

export function createPick(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE;
  const scr = ui.screen('pick', { modal: true });
  let open = false, leaving = 0, shown = -1, locked = false, anim = null, sig = '';
  let content = null, cardNodes = [], progress = [], autoOn = true;

  const dim = new THREE.Mesh(new THREE.PlaneGeometry(420, 900), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.66, depthWrite: false, toneMapped: false }));
  scr.put(dim, 180, 390, 0);
  scr.put(ui.panel({ w: 344, h: 820, r: 26, color: 0x33286a, depth: 6, bevel: 3 }), 8, -30, 2);
  const title = ui.text('CHỌN NÂNG CẤP', { size: 27, align: 'center', valign: 'mid' }); scr.put(title, 180, 58, 14);
  const sub = ui.text('', { size: 13, align: 'center', valign: 'mid', color: 0xffe9a6 }); scr.put(sub, 180, 90, 14);
  const auto = ui.button({ id: 'autopick', w: 200, h: 46, r: 16, color: PAL.teal, label: 'TỰ CHỌN', size: 18, onTap: () => { if (!locked) game.autoPick(); } });
  scr.put(auto, 80, 664, 14);

  function buildProgress(B) {
    for (const p of progress) kill(p.node); progress = [];
    const n = B.heroes.length, size = 44, gap = 10, x0 = 180 - (n * size + (n - 1) * gap) / 2;
    B.heroes.forEach((u, i) => {
      const node = ui.group({ w: size, h: size }); scr.put(node, x0 + i * (size + gap), 106, 14);
      const halo = ui.panel({ w: size + 8, h: size + 8, r: 14, color: PAL.gold, depth: 3, bevel: 2, gloss: false, shadow: false, ow: 2.4 }); node.put(halo, -4, -4, -2); halo.setVisible(false);
      node.put(ui.portrait(u.kind, { size, color: heroColor(u.kind), fps: 6 }), 0, 0, 0);
      const wait = roundPlane(THREE, size - 7.5, size - 7.5, 5, 'rgba(18,14,32,0.62)'); wait.position.set(size / 2, -size / 2, 17); node.add(wait);
      const check = ui.icon('check', { size: 24, sway: false }); node.put(check, size - 16, size - 16, 20); check.setVisible(false);
      progress.push({ node, halo, wait, check });
    });
  }

  function heldRow(u) {
    const g = ui.group({ w: 220, h: 30 }), max = 6, ids = u.cards.slice(-max);
    ids.forEach((id, i) => { const c = CARD[id]; g.put(ui.tile({ size: 30, color: CARD_RARITY[c.rar].color, icon: c.icon, sway: false }), i * 34, 0, 0); });
    if (u.cards.length > max) g.put(ui.text('+' + (u.cards.length - max), { size: 13, valign: 'mid' }), max * 34 + 2, 15, 2);
    return g;
  }

  function cardButton(slot, k, id) {
    const c = CARD[id], rar = CARD_RARITY[c.rar], own = !!c.hero;
    const btn = ui.button({ id: 'card' + k, w: CARD_W, h: CARD_H, r: 18, color: rar.color, onTap: () => choose(slot, k) });
    btn.put(ui.panel({ w: CARD_W - 14, h: CARD_H - 14, r: 13, color: dark(rar.color, 0.3), depth: 2, bevel: 1.6, gloss: false, shadow: false, ow: 0 }), 7, 7, 1);
    btn.put(ui.tile({ size: 70, color: rar.color, icon: c.icon }), 18, 18, 3);
    btn.put(ui.text(c.name, { size: 17, align: 'left', valign: 'mid', maxW: 0 }), 100, 30, 9);
    btn.put(ui.text(c.desc, { size: 12, align: 'left', maxW: 196, lineH: 15, color: 0xfff1cf, outlineW: 1.3 }), 100, 46, 9);
    const tag = (text, color, x, w) => { const p = ui.panel({ w, h: 20, r: 10, color, depth: 3, bevel: 1.6, ow: 2, shadow: false }); p.put(ui.text(text, { size: 10, align: 'center', valign: 'mid', outlineW: 1.3 }), w / 2, 11, 2); btn.put(p, x, -11, 8); };
    tag(rar.name.toLocaleUpperCase('vi'), dark(rar.color, 0.75), CARD_W - 84, 70);
    if (own) tag('RIÊNG', PAL.orange, CARD_W - 84 - 58, 50);
    return btn;
  }

  function buildHero(B, slot) {
    if (content) { kill(content); content = null; }
    const u = B.heroes[slot], def = HERO[u.kind];
    content = ui.group({ w: 360, h: 560 }); scr.put(content, 0, 148, 14);
    content.put(ui.portrait(u.kind, { size: 84, color: heroColor(u.kind) }), 24, 0, 0);
    content.put(ui.text(def.name, { size: 23, align: 'left', valign: 'mid' }), 124, 14, 2);
    content.put(ui.text(def.title, { size: 12, align: 'left', valign: 'mid', color: 0xcdbfff, outlineW: 1.4 }), 124, 38, 2);
    if (u.cards.length) { content.put(ui.text('Đang có:', { size: 11, align: 'left', valign: 'mid', color: 0xffe9a6, outlineW: 1.3 }), 124, 58, 2); content.put(heldRow(u), 124, 66, 0); }
    else content.put(ui.text('Chưa có thẻ nào', { size: 11, align: 'left', valign: 'mid', color: 0xb9b3cc, outlineW: 1.3 }), 124, 64, 2);
    cardNodes = B.offers[slot].map((id, k) => { const b = cardButton(slot, k, id); content.put(b, 22, CARDS_Y + k * CARD_PITCH, 0); b.homeY = CARDS_Y + k * CARD_PITCH; return b; });
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
    if (game.settings.autoPick) game.autoPick();
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
        if (k === anim.k) { const s = Math.max(0.05, 1 - 0.9 * q); b.scale.set(s, s, 1); b.pos(22 + (66 - 22 - CARD_W / 2) * q + CARD_W / 2 * (1 - s), b.homeY + (42 - b.homeY - CARD_H / 2) * q + CARD_H / 2 * (1 - s)); }
        else b.pos(22 + 400 * easeOut(e), b.homeY);
      });
      if (e >= 1) { anim = null; const B = game.B; shown = -1; if (B && B.phase === 'pick') { locked = false; } }
    } else if (anim.kind === 'in') {
      const e = clamp(anim.t / IN_T, 0, 1); content.pos(380 * (1 - easeOut(e)), 148, 14);
      if (e >= 1) { anim = null; content.pos(0, 148, 14); }
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
      if (cur >= 0 && cur !== shown) { buildHero(B, cur); anim = { kind: 'in', t: 0 }; content.pos(380, 148, 14); }
    }
    animate(dt);
    progress.forEach((p, i) => { const done = B.picked[i] >= 0; p.check.setVisible(done); p.halo.setVisible(i === cur); p.wait.visible = i > cur && !done; });
    if (autoOn === locked) { autoOn = !locked; auto.setEnabled(autoOn); }
  }

  return {
    name: 'pick',
    show() { const B = game.B; if (B && B.phase === 'pick' && !open) openIt(B); },
    hide() { if (open) closeIt(); },
    update,
    dbg() { return { open, shown, locked, anim: anim && anim.kind }; },
  };
}
