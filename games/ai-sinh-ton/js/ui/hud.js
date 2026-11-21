// Battle HUD: top band (pause, wave, timer, kills, speed, boss bar), four hero cards (live portrait, hp, ultimate
// charge, flame, eye) and the transient pieces (damage numbers, banners, ultimate bursts, spectate controls).
// Everything is drawn by the 3D UI kit; the sim is only ever read here, the player never steers a unit.
import { HERO } from '../data/heroes.js?v=20261120f';
import { ENEMY } from '../data/enemies.js?v=20261120f';
import { HERO_RARITY } from '../data/economy.js?v=20261120f';
import { lockButton } from './guide.js?v=20261120f';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeBack = (t) => { t = clamp(t, 0, 1); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
export const fmt = (n) => { n = Math.round(n); try { return n.toLocaleString('vi-VN'); } catch (e) { return String(n); } };
export const heroColor = (kind) => (HERO_RARITY[HERO[kind] && HERO[kind].rarity] || HERO_RARITY.R).color;
export const unitName = (u) => (u.hero ? HERO[u.kind].name : ENEMY[u.kind] ? ENEMY[u.kind].name : u.kind);

// the kit's node.dispose walks its children while they remove themselves: collect first, then dispose leaves up
export function kill(node) {
  const all = []; node.traverse((o) => all.push(o));
  for (let i = all.length - 1; i >= 0; i--) if (all[i] !== node && typeof all[i].dispose === 'function') all[i].dispose();
  node.dispose();
}

// a rounded translucent rectangle texture, used to grey out a portrait
export function roundPlane(THREE, w, h, r, rgba) {
  const c = document.createElement('canvas'); c.width = 128; c.height = Math.max(16, Math.round(128 * h / w));
  const g = c.getContext('2d'), k = 128 / w, rr = r * k;
  g.fillStyle = rgba; g.beginPath(); g.moveTo(rr, 0); g.arcTo(c.width, 0, c.width, c.height, rr); g.arcTo(c.width, c.height, 0, c.height, rr); g.arcTo(0, c.height, 0, 0, rr); g.arcTo(0, 0, c.width, 0, rr); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  return m;
}

// 780 x 360 landscape: a 40 high top bar and one compact row of hero cards at the bottom centre (at most 300 x 68, 12 above the
// bottom edge); everything else is the fight
const SAFE = 28, BAR_Y = 3, CARD_W = 72, CARD_PITCH = 75, CARD_H = 68, PW = 48, PX = 3, PY = 0, BOTTOM = 12, FLAME_UP = 24;
const CX = CARD_W / 2, CY = PY + PW / 2;
const rowW = (n) => n * CARD_PITCH - (CARD_PITCH - CARD_W);
const HP_COLORS = { ok: 0x35d65a, mid: 0xff9a1f, low: 0xff3b52 };
const MERGE = 0.15, MERGE_GROUP = 0.3, NUMBER_LIFE = 0.95, BIG_HIT = 3, STREAK_MIN = 8;
const BANNER = { wave: { color: 0x4a3a86, y: 80, kind: 'pop' }, boss: { color: 0xc4203a, y: 80, kind: 'pop' }, rage: { color: 0xe2641a, y: 80, kind: 'pop' }, ult: { color: 0x8f4dff, y: 132, kind: 'slide' } };
const BOSS_BAR = { x: 240, w: 300, h: 24, y: 44, hidden: -40 };

export function createHud(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE, W = ui.W;
  const scr = ui.screen('hud');
  let visible = false, clock = 0, cards = [], teamSig = '';
  const top = {};

  // ---------- top bar ----------
  top.pause = ui.button({ id: 'pause', w: 44, h: 34, r: 11, color: 0x5a55a0, icon: 'pause', onTap: () => { game.setPaused(true); game.goto('result', { mode: 'pause', over: true }); } });
  scr.put(top.pause, SAFE, BAR_Y);
  const plate = ui.panel({ w: 400, h: 38, r: 14, color: 0x2a2150, depth: 4, bevel: 2.4 }); scr.put(plate, (W - 400) / 2, BAR_Y - 1);
  top.wave = ui.text('ĐỢT 1/5', { size: 16, align: 'left', valign: 'mid' }); plate.put(top.wave, 14, 12, 1);
  top.stage = ui.text('', { size: 11, align: 'left', valign: 'mid', color: 0xd9ccff, outlineW: 1.2 }); plate.put(top.stage, 14, 27, 1);
  top.speed = ui.button({ id: 'speed', w: 64, h: 34, r: 11, color: PAL.blue, icon: 'speed', label: 'x1', size: 15, onTap: () => { if (!game.meta.unlocked('speed')) { ui.toast(game.meta.lockText('speed')); return; } game.setSpeed(game.speed === 1 ? 2 : 1); } });
  scr.put(top.speed, W - SAFE - 64, BAR_Y);
  top.speedLock = ui.icon('lock', { size: 22, sway: false }); top.speed.put(top.speedLock, 46, -9, 14);
  // small chip while the auto-ultimate switch is on
  top.auto = ui.panel({ w: 46, h: 30, r: 10, color: 0x6a3ad0, depth: 3, bevel: 2, ow: 2.2, shadow: false }); scr.put(top.auto, SAFE + 52, BAR_Y + 2);
  top.auto.put(ui.icon('bolt', { size: 20, sway: false }), 3, 5, 4); top.auto.put(ui.text('TỰ', { size: 13, valign: 'mid' }), 26, 16, 2); top.auto.setVisible(false);
  top.timerPlate = ui.panel({ w: 66, h: 24, r: 12, color: 0x1a1340, depth: 3, bevel: 2, gloss: false, ow: 2.4, shadow: false }); plate.put(top.timerPlate, 254, 7, 1);
  top.timer = ui.text('00:00', { size: 14, align: 'center', valign: 'mid' }); top.timerPlate.put(top.timer, 33, 13, 1);
  top.killPlate = ui.panel({ w: 72, h: 24, r: 12, color: 0x1a1340, depth: 3, bevel: 2, gloss: false, ow: 2.4, shadow: false }); plate.put(top.killPlate, 324, 7, 1);
  top.killIcon = ui.icon('skull', { size: 26, sway: false }); top.killPlate.put(top.killIcon, -5, -1, 4);
  top.kills = ui.text('0', { size: 14, align: 'right', valign: 'mid' }); top.killPlate.put(top.kills, 66, 13, 1);
  top.pips = [];
  { // four pills and a skull pill for the boss wave
    const widths = [24, 24, 24, 24, 30], gap = 5, total = widths.reduce((a, b) => a + b, 0) + gap * 4; let x = 104 + (146 - total) / 2;
    widths.forEach((w, i) => {
      const boss = i === 4, p = ui.panel({ w, h: boss ? 18 : 12, r: boss ? 9 : 6, color: 0x4a4f68, depth: 2, bevel: 1.4, shadow: false, ow: 2 }); plate.put(p, x, boss ? 10 : 13, 1);
      if (boss) { const s = ui.icon('skull', { size: 18, sway: false }); p.put(s, 6, 0, 2); }
      top.pips.push(p); x += w + gap;
    });
  }
  // boss bar under the top bar, centred, never wider than 300
  const boss = ui.group({ w: BOSS_BAR.w, h: BOSS_BAR.h }); scr.put(boss, BOSS_BAR.x, BOSS_BAR.hidden);
  boss.put(ui.icon('skull', { size: 26 }), -2, -1, 2);
  boss.name = ui.text('', { size: 11, align: 'left', valign: 'mid', upper: true }); boss.put(boss.name, 28, 6, 3);
  boss.bar = ui.bar({ w: 272, h: 13, color: PAL.red, ghost: true }); boss.put(boss.bar, 28, 11, 0);
  boss.sh = 0; boss.y = BOSS_BAR.hidden; boss.shown = false; boss.uid = 0; boss.label = '';

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
  function disposeCards() { for (const c of cards) kill(c.col); cards = []; }
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
  function banner(kind, str, sub) {
    const spec0 = BANNER[kind];
    for (let k = banners.length - 1; k >= 0; k--) if (banners[k].kind === kind) { kill(banners[k].g); banners.splice(k, 1); }
    const t = ui.text(str, { size: kind === 'ult' ? 27 : 24, align: 'center', valign: 'mid', upper: true });
    const w = Math.min(430, Math.max(220, t.w + 64)), h = sub ? 56 : 44, g = ui.group({ w, h });
    const p = ui.panel({ w, h, r: 17, color: spec0.color, depth: 5, bevel: 3 }); g.put(p, 0, 0, 0);
    g.put(t, w / 2, sub ? 21 : 23, 8);
    if (sub) g.put(ui.text(sub, { size: 11, align: 'center', valign: 'mid', color: 0xfff1b0, outlineW: 1.4 }), w / 2, 43, 8);
    const cx = (W - w) / 2; scr.put(g, spec0.kind === 'slide' ? W + 20 : cx, spec0.y, 30);
    banners.push({ g, kind, spec: spec0, t: 0, w, h, cx });
  }
  function updateBanners(dt) {
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i]; b.t += dt; const dur = b.spec.kind === 'slide' ? 1.9 : 1.5, tin = 0.3, tout = 0.26;
      if (b.t >= dur) { kill(b.g); banners.splice(i, 1); continue; }
      if (b.spec.kind === 'slide') {
        const x = b.t < tin ? W + 20 + (b.cx - W - 20) * easeBack(b.t / tin) : b.t > dur - tout ? b.cx - (b.cx + b.w + 20) * easeOut((b.t - (dur - tout)) / tout) : b.cx;
        b.g.pos(x, b.spec.y, 30); b.g.scale.set(1, 1, 1);
      } else {
        const s = b.t < tin ? easeBack(b.t / tin) : b.t > dur - tout ? 1 - easeOut((b.t - (dur - tout)) / tout) : 1, k = Math.max(0.01, s);
        b.g.pos(b.cx + b.w / 2 * (1 - k), b.spec.y + b.h / 2 * (1 - k), 30); b.g.scale.set(k, k, 1);
      }
    }
  }
  function burst(slot) {
    const c = cards[slot]; if (!c) return;
    const cx = c.col.ux + PX + PW / 2, cy = c.col.uy + CY;
    for (let k = 0; k < 8; k++) { const f = ui.icon('flame', { size: 26 }); scr.put(f, cx - 13, cy - 13, 40); bursts.push({ f, x: cx - 13, y: cy - 13, a: (k / 8) * 6.283 + 0.3, t: 0 }); }
  }
  function updateBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.t += dt; const k = b.t / 0.55;
      if (k >= 1) { kill(b.f); bursts.splice(i, 1); continue; }
      const d = easeOut(k) * 62, s = Math.max(0.01, 1.25 * (1 - k * k));
      b.f.pos(b.x + Math.cos(b.a) * d - 0, b.y + Math.sin(b.a) * d - 20 * k, 40); b.f.scale.set(s, s, s);
    }
  }
  function clearTransient() {
    for (const b of banners) kill(b.g); banners.length = 0;
    for (const b of bursts) kill(b.f); bursts.length = 0;
    pending.clear(); for (const q of live) kill(q.node); live.length = 0; deaths.length = 0; avgHit = 0;
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
    const out = banners.map((b) => ({ x: b.cx, y: b.spec.y, w: b.w, h: b.h, age: b.t }));
    if (boss.visible) out.push({ x: BOSS_BAR.x, y: boss.y, w: BOSS_BAR.w, h: BOSS_BAR.h, age: 99 });
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
  const sizeOf = (str, size) => ({ w: str.length * size * 0.62 + 10, h: size + 6 });
  const shownY = (q) => q.y - easeOut(q.age / NUMBER_LIFE) * RISE;
  // identical text close to another live number is the same number drawn twice: keep the older one
  const twin = (q) => live.find((o) => o !== q && o.text === q.text && Math.abs(o.x - q.x) < 40 && Math.abs(o.y - q.y) < RISE + 40);
  function spawn(key, str, nx, ny, o, w, h) {
    const node = ui.text(str, { size: o.size ?? 20, color: o.color ?? PAL.gold, align: 'center', valign: 'mid', outlineW: 2.6 }); scr.put(node, nx, ny, 50);
    const q = { node, key, text: str, x: nx, y: ny, w, h, age: 0, born: clock, base: o.size ?? 20, size: o.size ?? 20, sum: o.sum, n: o.n, heal: o.heal, merged: o.merged, color: o.color };
    live.push(q); drawNumber(q); return q;
  }
  function drawNumber(q) {
    const k = q.age / NUMBER_LIFE, e = easeOut(k);
    const sc = (k < 0.15 ? 0.6 + easeBack(k / 0.15) * 0.5 : 1.1 - 0.1 * Math.min(1, (k - 0.15) * 4)) * (q.size / q.base);
    q.node.pos(q.x, q.y - e * RISE); q.node.scale.setScalar(sc); q.node.setOpacity(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
  }
  function updateNumbers(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i]; q.age += dt;
      if (q.age >= NUMBER_LIFE) { kill(q.node); live.splice(i, 1); continue; }
      drawNumber(q);
    }
  }
  function place(key, str, x, y, o) {
    const dup = live.find((q) => q.text === str && Math.abs(q.x - x) < 40 && Math.abs(q.y - y) < RISE + 40);
    if (dup) { dup.age = Math.min(dup.age, NUMBER_LIFE * 0.4); return true; }
    if (live.length >= capOf()) return false;
    const size = o.size ?? 20, { w, h } = sizeOf(str, size), bottom = ui.H - BOTTOM - h / 2, minX = w / 2 + EDGE, maxX = W - w / 2 - EDGE;
    const inBand = (ny) => ny - RISE - h / 2 >= BAND_TOP && ny <= bottom;
    const hit = (nx, ny) => live.some((q) => Math.abs(q.x - nx) < 38 && Math.abs(q.y - ny) < 18);
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
    if (dup2) { dup2.age = Math.min(dup2.age, NUMBER_LIFE * 0.4); return true; }
    spawn(key, str, nx, ny, o, w, h); return true;
  }
  // later hits of a burst grow the number that is still on screen
  function refresh(q, p) {
    q.sum += p.sum; q.n += p.n; q.text = numStr(q);
    const size = p.heal ? 18 : clamp(17 + 2.2 * Math.log2(q.n), 17, 29); q.size = Math.max(q.size, size);
    q.node.set(q.text); Object.assign(q, sizeOf(q.text, q.size)); q.age = Math.min(q.age, NUMBER_LIFE * 0.45);
    const t = twin(q); if (t) { const drop = t.age > q.age ? t : q; kill(drop.node); live.splice(live.indexOf(drop), 1); if (drop === q) return; }
    // grown or made young again where it stands, it may now reach out of the play band or sit on a banner that came up
    // after it: then it is placed again like a new number
    const s = sweep(q);
    if (s.y < BAND_TOP || q.y + q.h / 2 > ui.H - BOTTOM || [...bannerRects(), ...blockRects()].some((r) => meets(s, r))) {
      kill(q.node); live.splice(live.indexOf(q), 1);
      place(q.key, q.text, q.x, q.y, { color: q.color, size: q.size, sum: q.sum, n: q.n, heal: q.heal, merged: q.merged });
    }
  }
  function flushNumbers() {
    const B = game.B;
    if (!B || B.phase !== 'fight') { pending.clear(); deaths.length = 0; return; }
    for (const [key, p] of pending) {
      if (clock - p.t0 < (p.merged ? MERGE_GROUP : MERGE)) continue; pending.delete(key);
      const u = B.byUid.get(p.uid), hero = !!(u && u.hero);
      const at = p.merged ? game.project(p.sx / p.n, p.sz / p.n, 1.6) : game.project(p.x, p.z, hero ? 1.9 : (u && u.boss ? 3.2 : 1.6));
      if (at.behind || at.x < -10 || at.x > W + 10 || at.y < 40) continue;
      const o = p.heal ? { color: PAL.green, size: 18 } : hero ? { color: 0xff7468, size: 15 } : p.merged ? { color: 0xffffff, size: clamp(17 + 2.2 * Math.log2(p.n), 17, 29) } : p.crit ? { color: PAL.gold, size: 27 } : { color: 0xffffff, size: 17 };
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
  on('sim:wave', (e) => { if (!visible) return; if (e.boss) banner('boss', 'BOSS: ' + e.name); else banner('wave', 'ĐỢT ' + e.n); });
  on('sim:enrage', () => { if (visible) banner('rage', 'CUỒNG NỘ!'); });
  on('sim:ult', (e) => { if (!visible) return; banner('ult', e.name + '!', HERO[e.hero] ? HERO[e.hero].name : ''); burst(e.slot); });
  on('battle:end', () => { hud.hide(); });

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
    top.wave.set('ĐỢT ' + clamp(B.wave, 1, waves) + '/' + waves); top.stage.set(B.stage.name || ''); if (top.stage.w > 92) top.stage.scale.setScalar(92 / top.stage.w); else top.stage.scale.setScalar(1);
    const s = Math.floor(B.t); top.timer.set(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
    top.kills.set(fmt(B.kills));
    top.speed.setLabel('x' + game.speed);
    top.pips.forEach((p, i) => { const done = i < B.wave - 1 || B.phase === 'won', cur = i === B.wave - 1 && B.phase !== 'won'; const col = done ? PAL.green : cur ? (i === 4 ? PAL.red : PAL.gold) : 0x4a4f68; if (p.col !== col) { p.col = col; p.setColor(col); } });
  }
  function updateBoss(B, dt) {
    const bu = B.boss ? B.byUid.get(B.boss) : null, on = !!(bu && bu.alive);
    if (on && boss.uid !== bu.uid) { boss.uid = bu.uid; boss.label = unitName(bu); boss.name.set(boss.label); boss.bar.set(1, true); }
    boss.shown = on; const want = on ? BOSS_BAR.y : BOSS_BAR.hidden;
    boss.y += (want - boss.y) * (1 - Math.exp(-dt * 9)); if (Math.abs(want - boss.y) < 0.2) boss.y = want;
    boss.pos(BOSS_BAR.x, boss.y, 0); boss.visible = boss.y > BOSS_BAR.hidden + 8;
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
    updateBoss(B, dt); updateSpectate(B, dt);
    updateBanners(dt); updateBursts(dt); updateNumbers(dt); flushNumbers();
  }

  // every fixed piece of the HUD as a rectangle, read from the live nodes (the tool checks them against the fight area)
  function hudBoxes() {
    const box = (id, n, w = n.w, h = n.h) => ({ id, x: n.ux, y: n.uy, w, h });
    const out = [box('pause', top.pause), box('plate', plate), box('speed', top.speed)];
    if (top.auto.visible) out.push(box('auto', top.auto));
    if (spec.visible) out.push(box('spec', spec));
    cards.forEach((c) => out.push({ id: 'card' + c.i, x: c.col.ux, y: c.col.uy - (c.flame.visible ? FLAME_UP + 4 : 0), w: CARD_W, h: CARD_H + (c.flame.visible ? FLAME_UP + 4 : 0) }));
    return out;
  }

  const hud = {
    name: 'hud',
    show() {
      visible = true; ui.show('hud', { transition: 'none' }); clearTransient();
      const B = game.B; boss.uid = 0; boss.y = BOSS_BAR.hidden; boss.pos(BOSS_BAR.x, BOSS_BAR.hidden, 0); boss.visible = false;
      if (B) { teamSig = B.heroes.map((u) => u.kind).join(','); buildCards(B); if (B.wave === 1 && B.t < 1) banner('wave', 'ĐỢT 1'); }
    },
    hide() { visible = false; ui.hide('hud', { transition: 'none' }); clearTransient(); },
    update,
    // what the test needs to read without guessing from pixels
    dbg() {
      return { visible, bossShown: boss.shown, bossName: boss.label, bossY: boss.y, flames: cards.map((c) => c.flame.visible), ready: cards.map((c) => c.ready), banners: banners.map((b) => b.kind), numbers: live.length, cap: capOf(), numberPos: live.map((q) => [q.x, q.y]), numberRects: live.map((q) => ({ ...sweep(q), age: q.age })), numberList: live.map((q) => ({ text: q.text, x: q.x, y: shownY(q) })), bannerRects: bannerRects(), block: blockRects(), boxes: hudBoxes(), band: [BAND_TOP, ui.H - BOTTOM], specShown: spec.visible };
    },
  };
  return hud;
}
