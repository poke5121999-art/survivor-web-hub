// Battle HUD: top band (pause, wave, timer, kills, speed, boss bar), four hero cards (live portrait, hp, ultimate
// charge, flame, eye) and the transient pieces (damage numbers, banners, ultimate bursts, spectate controls).
// Everything is drawn by the 3D UI kit; the sim is only ever read here, the player never steers a unit.
import { HERO } from '../data/heroes.js?v=20261124b';
import { ENEMY } from '../data/enemies.js?v=20261124b';
import { HERO_RARITY } from '../data/economy.js?v=20261124b';
import { lockButton } from './guide.js?v=20261124b';
import { MODES } from '../sim/maprules.js?v=20261124b';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeBack = (t) => { t = clamp(t, 0, 1); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
export const fmt = (n) => { n = Math.round(n); try { return n.toLocaleString('vi-VN'); } catch (e) { return String(n); } };
export const heroColor = (kind) => (HERO_RARITY[HERO[kind] && HERO[kind].rarity] || HERO_RARITY.R).color;
export const unitName = (u) => (u.hero ? HERO[u.kind].name : ENEMY[u.kind] ? ENEMY[u.kind].name : u.kind);

// pick.js still imports this name; the kit's own dispose() frees the whole subtree
export const kill = (node) => node.dispose();

// a rounded translucent rectangle texture, used to grey out a portrait
export function roundPlane(THREE, w, h, r, rgba) {
  const c = document.createElement('canvas'); c.width = 128; c.height = Math.max(16, Math.round(128 * h / w));
  const g = c.getContext('2d'), k = 128 / w, rr = r * k;
  g.fillStyle = rgba; g.beginPath(); g.moveTo(rr, 0); g.arcTo(c.width, 0, c.width, c.height, rr); g.arcTo(c.width, c.height, 0, c.height, rr); g.arcTo(0, c.height, 0, 0, rr); g.arcTo(0, 0, c.width, 0, rr); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  return m;
}

// 780 x 360 landscape: two low see-through clusters in the top corners (at most 33 high, nothing across the top middle) and
// one compact row of hero cards at the bottom centre (at most 300 x 68, 12 above the bottom edge); everything else is the fight
const SAFE = 28, BAR_Y = 3, CARD_W = 72, CARD_PITCH = 75, CARD_H = 68, PW = 48, PX = 3, PY = 0, BOTTOM = 12, FLAME_UP = 24;
const CX = CARD_W / 2, CY = PY + PW / 2;
const rowW = (n) => n * CARD_PITCH - (CARD_PITCH - CARD_W);
const HP_COLORS = { ok: 0x35d65a, mid: 0xff9a1f, low: 0xff3b52 };
const CRIT_SHAKE = 0.25, MERGE = 0.15, MERGE_GROUP = 0.3, NUMBER_LIFE = 0.95, BIG_HIT = 3, STREAK_MIN = 8;
// Wave, boss, rage and ultimate names: one line each, a chip in the bottom-right corner beside the hero cards, the part of
// the frame units reach least (measured over six stages: under 0.1 unit boxes per sample there, 1 to 2 in the middle); the
// newest at the bottom, older ones pushed up, at most three, the oldest leaves first
const CALL = { gap: 4, h: 26, minW: 96, maxW: 200, max: 3, tin: 0.2, tout: 0.22, slide: 22 };
const CALL_LIFE = { wave: 1.9, boss: 2.1, rage: 1.6, ult: 1.5, mode: 3.2, rule: 3.2 }, CALL_COL = { wave: 0xffc93a, boss: 0xff4a5e, rage: 0xff8a2a, mode: 0x6dffb0, rule: 0x6dffb0 };
const BTN = { w: 40, sw: 58, h: 30 }, ROW = { y: 5, h: 26, bossH: 30, pad: 9 }, BOSS = { w: 132, h: 24 }, STATS = { w: 120, skullX: 56 };
const GHOST_A = 0.3; // a top cluster over the boss fades to this opacity

export function createHud(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE, W = ui.W;
  const scr = ui.screen('hud');
  let visible = false, clock = 0, cards = [], teamSig = '';
  const top = {};

  // ---------- top bar ----------
  // Light and low: two see-through clusters in the top corners, nothing across the top middle, so units walking at the
  // far edge of the arena stay in view. Left: pause, then the wave (ĐỢT n/5 and five thin segments, the last one the
  // boss); in the boss wave the segments give way to the boss's name over its health bar. Right: time and kills, then
  // speed. The stage name rides on the wave banner instead of sitting in the bar.
  top.pause = ui.button({ id: 'pause', w: BTN.w, h: BTN.h, r: 10, color: 0x120d22, flat: true, alpha: 0.5, icon: 'pause', onTap: () => { game.setPaused(true); game.goto('result', { mode: 'pause', over: true }); } });
  scr.put(top.pause, SAFE, BAR_Y);
  top.speed = ui.button({ id: 'speed', w: BTN.sw, h: BTN.h, r: 10, color: 0x120d22, flat: true, alpha: 0.5, icon: 'speed', label: 'x1', size: 14, onTap: () => { if (!game.meta.unlocked('speed')) { ui.toast(game.meta.lockText('speed')); return; } game.setSpeed(game.speed === 1 ? 2 : 1); } });
  scr.put(top.speed, W - SAFE - BTN.sw, BAR_Y);
  top.speedLock = ui.icon('lock', { size: 18, sway: false }); top.speed.put(top.speedLock, BTN.sw - 12, -7, 14);

  // a see-through rounded strip drawn into one canvas texture, repainted only when its content changes
  function strip(w, h) {
    const g = ui.group({ w, h }), c = document.createElement('canvas'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })); g.add(m);
    g.paint = (w2, h2, fn) => {
      const k = clamp(Math.ceil(ui.dpr * ui.u), 2, 4); c.width = Math.ceil(w2 * k); c.height = Math.ceil(h2 * k);
      const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, w2, h2); fn(x);
      tex.dispose(); tex.needsUpdate = true; m.scale.set(w2, h2, 1); m.position.set(w2 / 2, -h2 / 2, 0); g.w = w2; g.h = h2;
    };
    return g;
  }
  const rr = (x, X, Y, w, h, r, fill) => { x.fillStyle = fill; x.beginPath(); x.roundRect(X, Y, w, h, r); x.fill(); };
  const BACK = 'rgba(12,9,24,0.42)';
  const SEG = { w: 15, boss: 21, h: 7, gap: 3 }, segW = SEG.w * 4 + SEG.boss + SEG.gap * 4;
  const waveTxtW = Math.ceil(ui.measure('ĐỢT 5/5', 13)) + 2;

  // left cluster: wave
  const left = ui.group({ w: 0, h: ROW.h }); scr.put(left, SAFE + BTN.w + 8, ROW.y, 0);
  top.waveBg = strip(10, 10); left.put(top.waveBg, 0, 0, 0);
  top.wave = ui.text('ĐỢT 1/5', { size: 13, align: 'left', valign: 'mid' }); left.put(top.wave, ROW.pad, ROW.h / 2, 2);
  top.segs = strip(segW, SEG.h + 4); left.put(top.segs, ROW.pad + waveTxtW + 6, (ROW.h - SEG.h - 4) / 2, 1);
  top.bossSkull = ui.icon('skull', { size: 15, sway: false }); left.put(top.bossSkull, ROW.pad + waveTxtW + 6 + segW - SEG.boss / 2 - 7.5, ROW.h / 2 - 7.5, 3);
  // boss: name over a slim bar, in place of the segments
  const boss = ui.group({ w: BOSS.w, h: BOSS.h }); left.put(boss, ROW.pad + waveTxtW + 6, 3, 1);
  boss.skull = ui.icon('skull', { size: 13, sway: false }); boss.put(boss.skull, 0, 0, 2);
  boss.name = ui.text('', { size: 11, align: 'left', valign: 'mid', upper: true, color: 0xffd9d9 }); boss.put(boss.name, 16, 6.5, 2);
  boss.bar = ui.bar({ w: BOSS.w, h: 8, color: 0xff3b52, ghost: true, ow: 1.4 }); boss.put(boss.bar, 0, 15, 0);
  boss.setVisible(false); boss.shown = false; boss.uid = 0; boss.label = ''; boss.y = 0;
  let leftMode = '';
  function layoutLeft(bossOn) {
    const mode = bossOn ? 'boss' : 'wave'; if (mode === leftMode) return; leftMode = mode;
    const inner = bossOn ? Math.max(BOSS.w, 16 + Math.ceil(boss.name.w)) : segW, w = ROW.pad + waveTxtW + 6 + inner + ROW.pad, h = bossOn ? ROW.bossH : ROW.h;
    left.w = w; left.h = h; top.wave.pos(ROW.pad, h / 2, left.top + 2);
    top.segs.setVisible(!bossOn); top.bossSkull.setVisible(!bossOn); boss.setVisible(bossOn);
    top.waveBg.paint(w, h, (x) => { rr(x, 0, 0, w, h, Math.min(10, h / 2), BACK); });
  }
  let segSig = '';
  function paintSegs(cols) {
    const sig = cols.join(','); if (sig === segSig) return; segSig = sig;
    top.segs.paint(segW, SEG.h + 4, (x) => {
      let X = 0;
      cols.forEach((c, i) => { const w = i === 4 ? SEG.boss : SEG.w; rr(x, X, 2, w, SEG.h, SEG.h / 2, 'rgba(0,0,0,0.55)'); rr(x, X + 1, 3, w - 2, SEG.h - 2, (SEG.h - 2) / 2, c); X += w + SEG.gap; });
    });
  }

  // right cluster: time and kills
  const right = ui.group({ w: STATS.w, h: ROW.h }); scr.put(right, W - SAFE - BTN.sw - 8 - STATS.w, ROW.y, 0);
  top.statBg = strip(10, 10); right.put(top.statBg, 0, 0, 0);
  top.statBg.paint(STATS.w, ROW.h, (x) => { rr(x, 0, 0, STATS.w, ROW.h, 10, BACK); });
  top.timer = ui.text('00:00', { size: 13, align: 'left', valign: 'mid', color: 0xe8e4f4 }); right.put(top.timer, ROW.pad, ROW.h / 2, 2);
  top.killIcon = ui.icon('skull', { size: 15, sway: false }); right.put(top.killIcon, STATS.skullX, ROW.h / 2 - 7.5, 3);
  top.kills = ui.text('0', { size: 13, align: 'right', valign: 'mid' }); right.put(top.kills, STATS.w - ROW.pad, ROW.h / 2, 2);
  // small mark while the auto-ultimate switch is on: a bolt and TỰ left of the time
  top.auto = ui.group({ w: 38, h: ROW.h }); scr.put(top.auto, right.ux - 42, ROW.y, 0);
  top.auto.put(ui.icon('bolt', { size: 16, sway: false }), 2, ROW.h / 2 - 8, 2); top.auto.put(ui.text('TỰ', { size: 12, valign: 'mid', color: 0xd8c8ff }), 20, ROW.h / 2, 2); top.auto.setVisible(false);

  // A cluster with the boss under it fades to see-through, so the boss is never hidden by the bar (brief Addendum 9).
  // The boss is a column of its radius, 4.2 radii high, projected to design units.
  const ghosts = [{ id: 'wave', node: left, f: 0, a: 1 }, { id: 'stats', node: right, also: [top.auto], f: 0, a: 1 }];
  function fadeTo(node, a) {
    node.traverse((m) => {
      if (!m.isMesh) return;
      const one = (mat) => {
        let x = mat;
        if (mat.userData.shared && !mat.userData.ghost) { x = mat.clone(); x.userData = { shared: true, ghost: true }; } // kept for the HUD's lifetime
        if (x.userData.a0 === undefined) { x.userData.a0 = x.opacity; if (!x.transparent) { x.transparent = true; x.needsUpdate = true; } }
        x.opacity = x.userData.a0 * a; return x;
      };
      m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
    });
  }
  function bossBox(B) {
    const bu = B.boss ? B.byUid.get(B.boss) : null; if (!bu || !bu.alive) return null;
    const r = bu.r || 1, h = Math.max(3.2, r * 4.2); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const dx of [-r, r]) for (const dz of [-r, r]) for (const y of [0, h]) { const p = game.project(bu.x + dx, bu.z + dz, y); if (p.behind) continue; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  function updateGhosts(B, dt) {
    const bb = bossBox(B);
    for (const g of ghosts) {
      const n = g.node, want = bb && meets({ x: n.ux, y: n.uy, w: n.w, h: n.h }, bb) ? 1 : 0;
      g.f += (want - g.f) * (1 - Math.exp(-dt * 10)); if (Math.abs(want - g.f) < 0.01) g.f = want;
      const a = 1 - (1 - GHOST_A) * g.f;
      if (Math.abs(a - g.a) > 0.01 || (a !== g.a && (a === 1 || a === GHOST_A))) { g.a = a; fadeTo(n, a); for (const o of g.also || []) fadeTo(o, a); }
    }
  }
  layoutLeft(false);

  // ---------- spectate indicator: a block on the left edge, clear of the fight ----------
  const SPEC = { x: SAFE, y: 74, w: 140 };
  const spec = ui.group({ w: SPEC.w, h: 118 }); scr.put(spec, SPEC.x, SPEC.y); spec.setVisible(false);
  const specPlate = ui.panel({ w: SPEC.w, h: 38, r: 13, color: 0x1f6f8f, depth: 4, bevel: 2.4 }); spec.put(specPlate, 0, 0);
  spec.title = ui.text('ĐANG XEM', { size: 12, align: 'center', valign: 'mid', upper: true }); specPlate.put(spec.title, SPEC.w / 2, 11, 1);
  spec.sub = ui.text('', { size: 11, align: 'center', valign: 'mid', color: 0xcdf3ff, outlineW: 1.2 }); specPlate.put(spec.sub, SPEC.w / 2, 27, 1);
  spec.put(ui.button({ id: 'spec-prev', w: 66, h: 36, r: 12, color: 0x2f9bc0, icon: 'left', onTap: () => cycle(-1) }), 0, 44);
  spec.put(ui.button({ id: 'spec-next', w: 66, h: 36, r: 12, color: 0x2f9bc0, icon: 'right', onTap: () => cycle(1) }), 74, 44);
  spec.put(ui.button({ id: 'spec-all', w: SPEC.w, h: 34, r: 12, color: PAL.orange, label: 'TOÀN CẢNH', size: 13, onTap: () => game.spectate(-1) }), 0, 86);

  // ---------- spectate helpers ----------
  const liveUnits = () => { const B = game.B; return B ? B.units.filter((u) => u.alive) : []; };
  function watchUnit(u) { if (u.hero) game.spectate(u.slot); else game.spectate(u.uid); }
  function cycle(dir) {
    const list = liveUnits(); if (list.length < 2) return;
    const heroes = list.filter((u) => u.hero), others = list.filter((u) => !u.hero).sort((a, b) => a.uid - b.uid), order = [...heroes, ...others];
    const at = order.findIndex((u) => u.uid === game.watching);
    watchUnit(order[(at < 0 ? 0 : at + dir + order.length) % order.length]);
  }

  // ---------- hero cards ----------
  function disposeCards() { for (const c of cards) c.col.dispose(); cards = []; }
  const cardX = (i, n) => W / 2 - rowW(n) / 2 + i * CARD_PITCH;
  const cardTop = () => ui.H - BOTTOM - CARD_H;
  function buildCards(B) {
    const had = cards.map((c) => c.kind);
    disposeCards();
    const n = B.heroes.length, k = PW / 80;
    B.heroes.forEach((u, i) => {
      const col = ui.group({ w: CARD_W, h: CARD_H }); scr.holder.add(col); col.anchor(cardX(i, n), 'bottom', -(BOTTOM + CARD_H));
      const lift = new THREE.Group(), inner = new THREE.Group(); lift.position.set(CX, -CY, 0); inner.position.set(-CX, CY, 0); col.add(lift); lift.add(inner);
      const add = (node, x, y, z) => { inner.add(node); node.pos(x, y, z); return node; };
      const card = { i, col, lift, inner, ready: false, readyT: 0, shake: 0, hpShown: 1, kind: u.kind, slide: had.length && !had.includes(u.kind) ? 0 : 1 };
      card.halo = add(ui.panel({ w: PW + 10, h: PW + 10, r: 18, color: PAL.gold, depth: 3, bevel: 2, gloss: false, shadow: false, ow: 2.4 }), PX - 5, PY - 5, -3); card.halo.setVisible(false);
      card.portrait = add(ui.portrait(u.kind, { size: PW, color: heroColor(u.kind), id: 'ult' + i, onTap: () => tapUlt(i) }), PX, PY, 0);
      const t = card.portrait.target, press = t.press; t.press = (on) => { press(on); if (on && !t.enabled) card.shake = 0.32; };
      t.enabled = false;
      const dw = 66.4 * k;
      card.down = roundPlane(THREE, dw, dw, 9.6 * k, 'rgba(18,14,32,0.72)'); card.down.position.set(PX + 6.8 * k + dw / 2, -(PY + 6.8 * k + dw / 2), 10); inner.add(card.down); card.down.visible = false;
      card.skull = add(ui.icon('skull', { size: 26 }), PX + PW / 2 - 13, PY + PW / 2 - 13, 13); card.skull.setVisible(false);
      const BW = PW + 12;
      card.bar = add(ui.bar({ w: BW, h: 10, color: HP_COLORS.ok, ghost: true }), PX - 6, PW + 4, 0);
      const ins = 1.6, iw = BW - ins * 2;
      card.shield = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
      card.shield.position.z = 6.4; card.shield.visible = false; card.bar.add(card.shield); card.shieldW = iw; card.shieldIns = ins;
      card.ring = add(ui.ring({ r: 11, width: 5, color: PAL.purple }), PX - 3, -4, 14); card.ring.put(ui.icon('bolt', { size: 11, sway: false }), 5.5, 5.5, 1);
      card.flame = add(ui.icon('flame', { size: 36 }), PX + PW / 2 - 24, -FLAME_UP - 4, 16); card.flame.setVisible(false);
      card.eyeHalo = add(ui.panel({ w: 34, h: 28, r: 11, color: 0x58e0ff, depth: 3, bevel: 2, gloss: false, shadow: false, ow: 2.4 }), PX + PW - 17, -16, 12); card.eyeHalo.setVisible(false);
      card.eye = add(ui.button({ id: 'eye' + i, w: 24, h: 20, r: 9, color: 0x4a4f7a, icon: 'eye', shadow: false, onTap: () => tapEye(i) }), PX + PW - 12, -12, 14);
      card.eyeLock = add(ui.icon('lock', { size: 16, sway: false }), PX + PW + 2, -20, 20);
      cards.push(card);
    });
  }
  function tapUlt(i) {
    const c = cards[i]; if (!c || !c.ready) return;
    if (game.castUlt(i)) game.vibrate(30);
  }
  function tapEye(i) {
    const B = game.B; if (!B || !B.heroes[i]) return;
    if (!game.meta.unlocked('spectate')) { ui.toast(game.meta.lockText('spectate')); return; }
    if (game.watching === B.heroes[i].uid) game.spectate(-1); else game.spectate(i);
  }

  // ---------- banners and bursts ----------
  const banners = [], bursts = [];
  function banner(kind, str, sub, slot) {
    for (let k = banners.length - 1; k >= 0; k--) { const q = banners[k]; if (q.kind === kind && (kind !== 'ult' || q.str === str)) drop(q); }
    const B = game.B, u = kind === 'ult' && B && slot !== undefined ? B.heroes[slot] : null;
    const col = u ? heroColor(u.kind) : CALL_COL[kind] ?? PAL.purple;
    const t = ui.text(str, { size: 13, align: 'left', valign: 'mid', upper: true });
    let st = sub ? ui.text(sub, { size: 11, align: 'left', valign: 'mid', color: 0xd8c8ff, outlineW: 1.2 }) : null;
    // a second part that does not fit is left out rather than shrunk under 11 units
    if (st && t.w + 6 + st.w + 22 > CALL.maxW) { st.dispose(); st = null; }
    if (t.w + 22 > CALL.maxW) t.scale.setScalar((CALL.maxW - 22) / t.w);
    const tw = t.w * t.scale.x, w = Math.round(clamp(tw + (st ? 6 + st.w : 0) + 22, CALL.minW, CALL.maxW)), h = CALL.h;
    const g = ui.group({ w, h }), bg = strip(w, h); g.put(bg, 0, 0, 0);
    const css = '#' + new THREE.Color(col).getHexString();
    bg.paint(w, h, (x) => { rr(x, 0, 0, w, h, 9, 'rgba(14,10,30,0.64)'); x.save(); x.beginPath(); x.roundRect(0, 0, w, h, 9); x.clip(); x.fillStyle = css; x.fillRect(0, 0, 4, h); x.restore(); });
    g.put(t, 12, h / 2, 2); if (st) g.put(st, 12 + tw + 6, h / 2 + 0.5, 2);
    const cx = W - SAFE - w, y = ui.H - BOTTOM - h;
    scr.put(g, cx + CALL.slide, y, 30); fadeTo(g, 0); if (!chipsUp) g.setVisible(false);
    banners.push({ g, kind, str, t: 0, w, h, cx, x: cx + CALL.slide, y, a: 0, off: !chipsUp });
    while (banners.length > CALL.max) drop(banners[0]);
    // the older chips step up a row at once, so two chips never cross while one moves
    banners.forEach((b, i) => { b.y = rowOf(i); b.g.pos(b.x, b.y, 30); });
    dropCrossed();
  }
  function drop(q) { q.g.dispose(); banners.splice(banners.indexOf(q), 1); }
  function dropCrossed() {
    // numbers already flying whose remaining path crosses a banner would hide its text (they draw above it): drop them
    const rs = bannerRects();
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i], y0 = q.y - easeOut(q.age / NUMBER_LIFE) * RISE, y1 = q.y - RISE;
      const path = { x: q.x - q.w / 2, y: y1 - q.h / 2, w: q.w, h: y0 - y1 + q.h };
      if (rs.some((r) => meets(path, r))) { q.node.dispose(); live.splice(i, 1); }
    }
  }
  // the row of chip i: the newest sits just above the bottom edge, every older one a row higher
  const rowOf = (i) => { let y = ui.H - BOTTOM - CALL.h; for (let k = banners.length - 1; k > i; k--) y -= banners[k].h + CALL.gap; return y; };
  const sliding = (b) => b.t < CALL.tin || b.t > CALL_LIFE[b.kind] - CALL.tout;
  // chips show only while the fight runs: the card pick and the end screens have the frame to themselves
  // and a chip under the tutorial's speech panel steps aside (the panel's words come first; the wave is also in the top-left)
  let chipsUp = true, guideAt = null, guideT = 0;
  function guidePanel(dt) {
    guideT -= dt; if (guideT > 0) return guideAt; guideT = 0.1; guideAt = null;
    const gd = game.guide && game.guide.dbg ? game.guide.dbg() : null; if (!gd || !gd.active || !gd.panel) return null;
    const fr = document.getElementById('frame').getBoundingClientRect(), k = fr.width / 780, p = gd.panel;
    guideAt = { x: (p.x - fr.left) / k - 4, y: (p.y - fr.top) / k - 4, w: p.w / k + 8, h: p.h / k + 8 }; return guideAt;
  }
  function showChips(on, dt) {
    chipsUp = on; const gp = on ? guidePanel(dt) : null;
    for (const b of banners) { b.off = !on || !!(gp && meets({ x: b.cx, y: b.y, w: b.w + CALL.slide, h: b.h }, gp)); b.g.setVisible(!b.off); }
  }
  function updateBanners(dt) {
    for (let i = banners.length - 1; i >= 0; i--) { const b = banners[i]; b.t += dt; if (b.t >= CALL_LIFE[b.kind]) { b.g.dispose(); banners.splice(i, 1); } }
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i], dur = CALL_LIFE[b.kind];
      b.y = rowOf(i);
      // fades in while it slides a little from the right, fades out the same way; it stays inside the frame all along
      const k = b.t < CALL.tin ? easeOut(b.t / CALL.tin) : b.t > dur - CALL.tout ? 1 - easeOut((b.t - (dur - CALL.tout)) / CALL.tout) : 1;
      b.x = b.cx + CALL.slide * (1 - k); b.g.pos(b.x, b.y, 30);
      if (Math.abs(k - b.a) > 0.02 || (k !== b.a && (k === 0 || k === 1))) { b.a = k; fadeTo(b.g, k); }
    }
  }
  function burst(slot) {
    const c = cards[slot]; if (!c) return;
    const cx = c.col.ux + PX + PW / 2, cy = c.col.uy + CY;
    for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i].slot === slot) { bursts[i].f.dispose(); bursts.splice(i, 1); }
    const f = ui.icon('flame', { size: 36, sway: false }); const x = cx - 18, y = c.col.uy - FLAME_UP - 4; scr.put(f, x, y, 40); bursts.push({ f, x, y, slot, t: 0 });
  }
  function updateBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.t += dt; const k = b.t / 0.45;
      if (k >= 1) { b.f.dispose(); bursts.splice(i, 1); continue; }
      const s = 1 + 0.5 * easeOut(k);
      b.f.pos(b.x - 18 * (s - 1), b.y - 18 * (s - 1) - 14 * easeOut(k), 40); b.f.scale.set(s, s, s); if (b.f.setOpacity) b.f.setOpacity(1 - k * k);
    }
  }
  function clearTransient() {
    for (const b of banners) b.g.dispose(); banners.length = 0;
    for (const b of bursts) b.f.dispose(); bursts.length = 0;
    pending.clear(); for (const q of live) q.node.dispose(); live.length = 0; deaths.length = 0; avgHit = 0;
  }

  // ---------- damage and heal numbers ----------
  // Up to ~180 hits a second land on a horde, so a number is shown per hit only for crits, bosses, elites and hits well above
  // the running average; every other hit on the horde folds into one rolling total per attacker (with a hit count), shown
  // near the middle of what it hit. A burst is one number: later hits of the same attacker update it in place instead of
  // drawing a second one beside it. Live numbers never exceed the cap of the quality tier and never overlap.
  const pending = new Map(), live = [], deaths = [];
  const capOf = () => { const q = game.host && game.host.quality && game.host.quality.name; return q === 'high' ? 24 : q === 'medium' ? 18 : 14; };
  let avgHit = 0, lastStreak = -9;
  function note(e, heal) {
    if (!visible || !game.B) return;
    const amount = heal ? e.amt : e.dmg; if (!(amount > 0)) return;
    const u = game.B.byUid.get(e.uid);
    const single = heal || !u || u.hero || e.crit || u.boss || u.elite || (avgHit > 0 && amount > BIG_HIT * avgHit);
    if (!heal && u && !u.hero && !u.boss && !e.crit) avgHit = avgHit ? avgHit * 0.97 + amount * 0.03 : amount;
    const key = single ? e.uid * 2 + (heal ? 1 : 0) : 'g' + (e.by || 0), p = pending.get(key);
    if (p) { p.sum += amount; p.n++; p.sx += e.x; p.sz += e.z; p.crit = p.crit || !!e.crit; p.x = e.x; p.z = e.z; }
    else pending.set(key, { key, sum: amount, n: 1, sx: e.x, sz: e.z, crit: !!e.crit, x: e.x, z: e.z, t0: clock, heal, uid: e.uid, merged: !single });
  }
  // A number is drawn at y and rises RISE units, so its swept rectangle is what must stay clear of banners, the corner
  // blocks and the top bar.
  const RISE = 46, BAND_TOP = 46, EDGE = 4;
  const numStr = (q) => (q.heal ? '+' : '') + fmt(q.sum) + (q.merged && q.n >= 3 ? ' x' + q.n : '');
  function bannerRects() {
    // a banner still gliding to its row covers the whole stretch between where it is and where it is going
    const out = banners.filter((b) => !b.off).map((b) => ({ x: b.cx, y: b.y, w: b.w + (sliding(b) ? CALL.slide : 0), h: b.h, age: b.t, kind: b.kind }));
    if (boss.shown) out.push({ x: left.ux + boss.ux, y: left.uy + boss.uy, w: left.w - boss.ux, h: BOSS.h, age: 99 });
    return out;
  }
  // the bottom-centre card block (with the flame's headroom) and the spectate block: numbers go around them
  function blockRects() {
    const out = [], n = cards.length;
    if (n) out.push({ x: W / 2 - rowW(n) / 2 - 2, y: cardTop() - FLAME_UP - 4, w: rowW(n) + 4, h: CARD_H + FLAME_UP + 4 + BOTTOM, block: true });
    if (spec.visible) out.push({ x: SPEC.x - 2, y: SPEC.y - 2, w: SPEC.w + 4, h: 124, corner: true });
    return out;
  }
  const sweep = (n) => ({ x: n.x - n.w / 2, y: n.y - RISE - n.h / 2, w: n.w, h: RISE + n.h });
  const meets = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // a number's box: its measured advance width plus the outline on both sides
  const NUM_GAP = 2, NUM_OUTLINE = 2.6, NUM_POP = 1.1; // a new number pops to 1.1 of its size for a moment
  const sizeOf = (str, size) => ({ w: ui.measure(str, size) * NUM_POP + NUM_OUTLINE * 2 + 2, h: size + 6 });
  const shownY = (q) => q.y - easeOut(q.age / NUMBER_LIFE) * RISE;
  // identical text close to another live number is the same number drawn twice: keep the older one
  const twin = (q) => live.find((o) => o !== q && o.text === q.text && Math.abs(o.x - q.x) < 40 && Math.abs(o.y - q.y) < RISE + 40);
  function spawn(key, str, nx, ny, o, w, h) {
    const node = ui.text(str, { size: o.size ?? 20, color: o.color ?? PAL.gold, align: 'center', valign: 'mid', outlineW: 2.6 }); scr.put(node, nx, ny, 50);
    const q = { node, key, text: str, x: nx, y: ny, w, h, age: 0, born: clock, base: o.size ?? 20, size: o.size ?? 20, sum: o.sum, n: o.n, heal: o.heal, merged: o.merged, color: o.color, crit: !!o.crit };
    live.push(q); drawNumber(q); return q;
  }
  function drawNumber(q) {
    const k = q.age / NUMBER_LIFE, e = easeOut(k);
    const sc = (k < 0.15 ? 0.6 + easeBack(k / 0.15) * 0.5 : 1.1 - 0.1 * Math.min(1, (k - 0.15) * 4)) * (q.size / q.base);
    // a critical shakes for its first CRIT_SHAKE seconds, a few px side to side and dying out
    const jx = q.crit && q.age < CRIT_SHAKE ? Math.sin(q.age * 90) * 2.2 * (1 - q.age / CRIT_SHAKE) : 0;
    q.node.pos(q.x + jx, q.y - e * RISE); q.node.scale.setScalar(sc); q.node.setOpacity(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
  }
  function updateNumbers(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i]; q.age += dt;
      if (q.age >= NUMBER_LIFE) { q.node.dispose(); live.splice(i, 1); continue; }
      drawNumber(q);
    }
  }
  // two rising numbers must stay apart for the whole life of both: compare their boxes at every moment from now on,
  // each at the height it will have then (the older one is further along its rise), plus the plain base-position rule
  function crowds(nx, ny, w, h, age, skip) {
    return live.some((q) => {
      if (q === skip) return false;
      if (Math.abs(q.x - nx) < 38 && Math.abs(q.y - ny) < 18) return true;
      for (let s = 0; s < NUMBER_LIFE - Math.max(q.age, age); s += 0.05) {
        const ya = ny - easeOut((age + s) / NUMBER_LIFE) * RISE, yb = q.y - easeOut((q.age + s) / NUMBER_LIFE) * RISE;
        if (Math.abs(q.x - nx) < (q.w + w) / 2 + NUM_GAP && Math.abs(yb - ya) < (q.h + h) / 2 * 1.1) return true;
      }
      return false;
    });
  }
  // an identical number is made young again where it stands, unless dropping back down its rise would land it on another number
  function rejuvenate(q) { const age = Math.min(q.age, NUMBER_LIFE * 0.4); if (!crowds(q.x, q.y, q.w, q.h, age, q)) q.age = age; }
  function place(key, str, x, y, o) {
    const dup = live.find((q) => q.text === str && Math.abs(q.x - x) < 40 && Math.abs(q.y - y) < RISE + 40);
    if (dup) { rejuvenate(dup); return true; }
    if (live.length >= capOf()) return false;
    const size = o.size ?? 20, { w, h } = sizeOf(str, size), bottom = ui.H - BOTTOM - h / 2, minX = w / 2 + EDGE, maxX = W - w / 2 - EDGE;
    const inBand = (ny) => ny - RISE - h / 2 >= BAND_TOP && ny <= bottom;
    const hit = (nx, ny) => crowds(nx, ny, w, h, 0, null);
    const rects = [...bannerRects(), ...blockRects()];
    const clash = (nx, ny) => rects.find((r) => meets(sweep({ x: nx, y: ny, w, h }), r));
    const fit = (nx, ny) => {
      ny = clamp(ny, BAND_TOP + RISE + h / 2, bottom);
      for (let pass = 0; pass < 4; pass++) {
        const r = clash(nx, ny); if (!r) break;
        if (r.block) ny = r.y - h / 2 - 1;
        else if (r.corner) nx = clamp(r.x + r.w / 2 < W / 2 ? r.x + r.w + w / 2 + 1 : r.x - w / 2 - 1, minX, maxX);
        else ny = r.y + r.h + RISE + h / 2 + 2;
      }
      return [nx, ny];
    };
    let [nx, ny] = fit(clamp(x, minX, maxX), y);
    for (let tries = 0; tries < 5 && inBand(ny) && hit(nx, ny); tries++) [nx, ny] = fit(clamp(nx + (tries % 2 ? -9 : 9), minX, maxX), ny - 19);
    if (!inBand(ny) || hit(nx, ny) || clash(nx, ny)) return false;
    const dup2 = live.find((q) => q.text === str && Math.abs(q.x - nx) < 40 && Math.abs(q.y - ny) < RISE + 40);
    if (dup2) { rejuvenate(dup2); return true; }
    spawn(key, str, nx, ny, o, w, h); return true;
  }
  // later hits of a burst grow the number that is still on screen
  function refresh(q, p) {
    q.sum += p.sum; q.n += p.n; q.text = numStr(q);
    const size = p.heal ? 18 : clamp(17 + 2.2 * Math.log2(q.n), 17, 29); q.size = Math.max(q.size, size);
    q.node.set(q.text); Object.assign(q, sizeOf(q.text, q.size)); q.age = Math.min(q.age, NUMBER_LIFE * 0.45);
    const t = twin(q); if (t) { const drop = t.age > q.age ? t : q; drop.node.dispose(); live.splice(live.indexOf(drop), 1); if (drop === q) return; }
    // grown or made young again where it stands, it may now reach out of the play band or sit on a banner that came up
    // after it: then it is placed again like a new number
    const s = sweep(q);
    if (s.y < BAND_TOP || q.y + q.h / 2 > ui.H - BOTTOM || [...bannerRects(), ...blockRects()].some((r) => meets(s, r)) || crowds(q.x, q.y, q.w, q.h, q.age, q)) {
      q.node.dispose(); live.splice(live.indexOf(q), 1);
      place(q.key, q.text, q.x, q.y, { color: q.color, size: q.size, sum: q.sum, n: q.n, heal: q.heal, merged: q.merged });
    }
  }
  function flushNumbers() {
    const B = game.B;
    if (!B || B.phase !== 'fight') { pending.clear(); deaths.length = 0; return; }
    // an ultimate winding up (ultcam.js) holds the world: its hits show when the impact lands, not before it
    if (game.juice && game.juice.ult && game.juice.ult.holding()) { for (const p of pending.values()) p.t0 = clock; return; }
    for (const [key, p] of pending) {
      if (clock - p.t0 < (p.merged ? MERGE_GROUP : MERGE)) continue; pending.delete(key);
      const u = B.byUid.get(p.uid), hero = !!(u && u.hero);
      const at = p.merged ? game.project(p.sx / p.n, p.sz / p.n, 1.6) : game.project(p.x, p.z, hero ? 1.9 : (u && u.boss ? 3.2 : 1.6));
      if (at.behind || at.x < -10 || at.x > W + 10 || at.y < 40) continue;
      const o = p.heal ? { color: PAL.green, size: 18 } : hero ? { color: 0xff7468, size: 15 } : p.merged ? { color: 0xffffff, size: clamp(17 + 2.2 * Math.log2(p.n), 17, 29) } : p.crit ? { color: PAL.gold, size: 27, crit: true } : { color: 0xffffff, size: 17 };
      Object.assign(o, { sum: p.sum, n: p.n, heal: p.heal, merged: p.merged });
      const old = p.merged ? live.find((q) => q.key === key) : null;
      if (old) { refresh(old, p); continue; }
      place(key, (p.heal ? '+' : '') + fmt(p.sum) + (p.merged && p.n >= 3 ? ' x' + p.n : ''), at.x, at.y, o);
    }
    // a kill streak: many bodies falling inside half a second
    while (deaths.length && clock - deaths[0] > 0.5) deaths.shift();
    if (deaths.length >= STREAK_MIN && clock - lastStreak > 1.1 && place('streak', 'x' + deaths.length, W / 2, 230, { color: PAL.gold, size: 32, sum: 0, n: 0 })) lastStreak = clock;
  }

  // ---------- events ----------
  const on = (name, fn) => game.events.on(name, fn);
  on('sim:hit', (e) => note(e, false)); on('sim:heal', (e) => note(e, true));
  on('sim:die', (e) => { const u = visible && game.B && game.B.byUid.get(e.uid); if (u && u.team === 1 && !u.summon && !u.hero && !e.expire) deaths.push(clock); });
  on('sim:wave', (e) => { if (!visible) return; if (e.boss) banner('boss', 'BOSS', e.name); else banner('wave', 'ĐỢT ' + e.n, stageName()); });
  on('sim:enrage', () => { if (visible) banner('rage', 'CUỒNG NỘ!'); });
  // a special stage (maprules.js MODES): its name and rule when each of its waves begins, then what happens to it
  const modeOf = () => { const B = game.B; return B && B.plan && B.plan.mode ? B.plan.mode : null; };
  const modeCall = (str, rule) => { banner('mode', str); if (rule) banner('rule', rule); };
  on('sim:wave', (e) => { const m = modeOf(); if (!visible || !m || (e.boss && m !== 'defend')) return; const R = MODES[m]; modeCall(R.title, R.rule); });
  on('sim:egg', (e) => { if (visible && e.s === 'broke') modeCall('TRỨNG ĐÃ VỠ'); });
  on('sim:survived', () => { if (visible) modeCall('ĐÃ TRỤ VỮNG'); });
  on('sim:survive_left', (e) => { if (visible) modeCall(`CÒN ${e.left} GIÂY`); });
  on('sim:core', (e) => { if (!visible) return; if (e.s === 'gate') modeCall(`LÕI QUA CỔNG ${e.leg}/${MODES.chase.legs}`); else if (e.s === 'down') modeCall('ĐÃ GIÀNH LẠI LÕI'); else if (e.s === 'out') modeCall('LÕI ĐÃ THOÁT'); });
  on('sim:ult', (e) => { if (!visible) return; banner('ult', e.name + '!', HERO[e.hero] ? HERO[e.hero].name : '', e.slot); burst(e.slot); });
  on('battle:end', () => { hud.hide(); });

  const stageName = () => (game.B && game.B.stage && game.B.stage.name) || '';

  // ---------- per frame ----------
  function setHp(c, u) {
    const f = u.maxHp > 0 ? clamp(u.hp / u.maxHp, 0, 1) : 0; c.bar.set(f);
    const col = f < 0.25 ? HP_COLORS.low : f < 0.5 ? HP_COLORS.mid : HP_COLORS.ok; if (c.hpCol !== col) { c.hpCol = col; c.bar.setColor2(col); }
    const sf = u.shield > 0 && u.maxHp > 0 ? clamp(u.shield / u.maxHp, 0, 1) : 0;
    c.shield.visible = sf > 0.002;
    if (c.shield.visible) { const w = Math.max(2, c.shieldW * sf), ih = 10 - c.shieldIns * 2; c.shield.scale.set(w, ih * 0.42, 1); c.shield.position.set(c.shieldIns + w / 2, -c.shieldIns - ih * 0.25, 6.4); }
  }
  function updateCards(B, dt) {
    for (const c of cards) {
      const u = B.heroes[c.i]; if (!u) continue;
      setHp(c, u);
      const ready = u.alive && u.ult >= 1 && B.phase === 'fight';
      if (ready !== c.ready) { c.ready = ready; c.readyT = 0; }
      c.readyT += dt;
      c.ring.set(clamp(u.ult, 0, 1)); c.ring.setVisible(!ready && u.alive);
      c.flame.setVisible(ready); c.portrait.target.enabled = ready;
      const watching = game.watching === u.uid;
      c.halo.setVisible(ready || watching);
      if (ready || watching) { c.halo.setColor(ready ? PAL.gold : 0x58e0ff); const p = 1 + Math.sin(clock * 9) * (ready ? 0.035 : 0.015); c.halo.scale.set(p, p, 1); const hs = (PW + 10) / 2; c.halo.pos(PX - 5 - hs * (p - 1), PY - 5 - hs * (p - 1)); }
      c.eyeHalo.setVisible(watching);
      c.down.visible = !u.alive; c.skull.setVisible(!u.alive);
      const up = ready ? easeBack(c.readyT / 0.35) : 0, pulse = ready ? 1 + Math.sin(clock * 8.5) * 0.04 : 1;
      if (c.slide < 1) { if (B.phase === 'fight') c.slide = Math.min(1, c.slide + dt / 0.5); }
      const drop = (1 - easeBack(c.slide)) * 120;
      c.lift.position.y = -CY + up * 9 - drop; c.lift.scale.set(pulse, pulse, 1);
      if (c.shake > 0) { c.shake -= dt; c.inner.position.x = -CX + Math.sin(c.shake * 60) * 4 * (c.shake / 0.32); } else c.inner.position.x = -CX;
    }
  }
  function updateTop(B) {
    const waves = B.stage.waves.length;
    top.wave.set('ĐỢT ' + clamp(B.wave, 1, waves) + '/' + waves);
    const s = Math.floor(B.t); top.timer.set(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
    top.kills.set(fmt(B.kills));
    top.speed.setLabel('x' + game.speed);
    paintSegs([0, 1, 2, 3, 4].map((i) => { const done = i < B.wave - 1 || B.phase === 'won', cur = i === B.wave - 1 && B.phase !== 'won'; return done ? '#3ddc68' : cur ? (i === 4 ? '#ff4a5e' : '#ffc93a') : 'rgba(255,255,255,0.24)'; }));
  }
  function updateBoss(B) {
    const bu = B.boss ? B.byUid.get(B.boss) : null, on = !!(bu && bu.alive);
    if (on && boss.uid !== bu.uid) { boss.uid = bu.uid; boss.label = unitName(bu); boss.name.set(boss.label); boss.bar.set(1, true); leftMode = ''; }
    boss.shown = on; layoutLeft(on);
    if (bu) boss.bar.set(clamp(bu.hp / (bu.maxHp || bu.base.hp), 0, 1));
    return on;
  }
  function updateSpectate(B, dt) {
    const u = game.watching ? B.byUid.get(game.watching) : null;
    spec.setVisible(!!u);
    if (!u) { spec.lostT = 0; return; }
    const nm = unitName(u).toLocaleUpperCase('vi'); spec.sub.set(nm); spec.sub.scale.setScalar(spec.sub.w > 128 ? 128 / spec.sub.w : 1);
    if (!u.alive) { spec.lostT = (spec.lostT || 0) + dt; if (spec.lostT > 1.4) { spec.lostT = 0; cycle(1); } } else spec.lostT = 0;
  }
  function update(dt) {
    if (!visible) return;
    const B = game.B; if (!B) return;
    dt = Math.min(dt, 0.05); clock += dt;
    if (cards.length !== B.heroes.length || teamSig !== B.heroes.map((u) => u.kind).join(',')) { teamSig = B.heroes.map((u) => u.kind).join(','); buildCards(B); }
    updateTop(B); updateCards(B, dt);
    const locks = { speed: !game.meta.unlocked('speed'), eye: !game.meta.unlocked('spectate') };
    lockButton(top.speed, locks.speed); top.speedLock.setVisible(locks.speed);
    for (const c of cards) { lockButton(c.eye, locks.eye); c.eyeLock.setVisible(locks.eye); }
    top.auto.setVisible(!!game.settings.autoUlt && game.meta.unlocked('autoult'));
    updateBoss(B); updateGhosts(B, dt); updateSpectate(B, dt);
    updateBanners(dt); showChips(B.phase === 'fight', dt); updateBursts(dt); updateNumbers(dt); flushNumbers();
  }

  // the top HUD as rectangles (buttons, both clusters, the auto mark): what may cover a unit at the top of the fight
  function topHud() {
    const box = (id, n, w = n.w, h = n.h) => ({ id, x: n.ux, y: n.uy, w, h });
    const out = [box('pause', top.pause, BTN.w, BTN.h), box('wave', left), box('stats', right), box('speed', top.speed, BTN.sw, BTN.h)];
    if (top.auto.visible) out.push(box('auto', top.auto));
    // a faded cluster is drawn at GHOST_A: what is under it stays in view
    for (const g of ghosts) for (const r of out) if ((r.id === g.id || (g.id === 'stats' && r.id === 'auto')) && g.f > 0.5) r.see = true;
    return out;
  }
  // every fixed piece of the HUD as a rectangle, read from the live nodes (the tool checks them against the fight area)
  function hudBoxes() {
    const box = (id, n, w = n.w, h = n.h) => ({ id, x: n.ux, y: n.uy, w, h });
    const out = topHud();
    if (spec.visible) out.push(box('spec', spec));
    cards.forEach((c) => out.push({ id: 'card' + c.i, x: c.col.ux, y: c.col.uy - (c.flame.visible ? FLAME_UP + 4 : 0), w: CARD_W, h: CARD_H + (c.flame.visible ? FLAME_UP + 4 : 0) }));
    return out;
  }

  const hud = {
    name: 'hud',
    show() {
      visible = true; ui.show('hud', { transition: 'none' }); clearTransient();
      const B = game.B; boss.uid = 0; boss.shown = false; leftMode = ''; layoutLeft(false);
      for (const g of ghosts) { g.f = 0; if (g.a !== 1) { g.a = 1; fadeTo(g.node, 1); for (const o of g.also || []) fadeTo(o, 1); } }
      if (B) { teamSig = B.heroes.map((u) => u.kind).join(','); buildCards(B); if (B.wave === 1 && B.t < 1) { banner('wave', 'ĐỢT 1', stageName()); const m = modeOf(); if (m) modeCall(MODES[m].title, MODES[m].rule); } }
    },
    hide() { visible = false; ui.hide('hud', { transition: 'none' }); clearTransient(); },
    update,
    // where the wave, boss and ult banners are (design units), read by the guide's speech panel to stay off them
    bannerRects,
    // the play band the fight camera frames into (js/view/camera.js), read from the live nodes so the two cannot drift:
    // the lowest edge of the top corner pieces with the left cluster in its wave row and in its boss row, and the hero card
    // block of a full team with the flame headroom
    band() {
      const tops = [top.pause.uy + BTN.h, top.speed.uy + BTN.h, right.uy + ROW.h, top.auto.uy + ROW.h], n = Math.max(4, cards.length);
      return { top: Math.max(...tops, left.uy + ROW.h), topBoss: Math.max(...tops, left.uy + ROW.bossH), cards: { x0: W / 2 - rowW(n) / 2, x1: W / 2 + rowW(n) / 2, y: cardTop() - FLAME_UP - 4 } };
    },
    // what the test needs to read without guessing from pixels
    dbg() {
      return { visible, bossShown: boss.shown, bossName: boss.label, bossY: left.uy + boss.uy, topHud: topHud(), flames: cards.map((c) => c.flame.visible), ready: cards.map((c) => c.ready), banners: banners.filter((b) => !b.off).map((b) => b.kind), numbers: live.length, cap: capOf(), numberPos: live.map((q) => [q.x, q.y]), numberRects: live.map((q) => ({ ...sweep(q), age: q.age })), numberList: live.map((q) => ({ text: q.text, x: q.x, y: shownY(q) })), bannerRects: bannerRects(), block: blockRects(), boxes: hudBoxes(), band: [BAND_TOP, ui.H - BOTTOM], specShown: spec.visible };
    },
  };
  return hud;
}
