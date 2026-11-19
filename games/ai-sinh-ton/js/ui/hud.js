// Battle HUD: top band (pause, wave, timer, kills, speed, boss bar), four hero cards (live portrait, hp, ultimate
// charge, flame, eye) and the transient pieces (damage numbers, banners, ultimate bursts, spectate controls).
// Everything is drawn by the 3D UI kit; the sim is only ever read here, the player never steers a unit.
import { HERO } from '../data/heroes.js';
import { ENEMY } from '../data/enemies.js';
import { HERO_RARITY } from '../data/economy.js';
import { lockButton } from './guide.js';

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

const CARD_W = 80, CARD_GAP = 6, CARD_TOP_FROM_BOTTOM = 126;
const HP_COLORS = { ok: 0x35d65a, mid: 0xff9a1f, low: 0xff3b52 };
const MERGE = 0.15, MAX_NUMBERS = 30, NUMBER_LIFE = 0.95;
const BANNER = { wave: { color: 0x4a3a86, y: 196, kind: 'pop' }, boss: { color: 0xc4203a, y: 196, kind: 'pop' }, rage: { color: 0xe2641a, y: 196, kind: 'pop' }, ult: { color: 0x8f4dff, y: 262, kind: 'slide' } };

export function createHud(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE;
  const scr = ui.screen('hud');
  let visible = false, clock = 0, cards = [], teamSig = '';
  const top = {};

  // ---------- top band ----------
  top.pause = ui.button({ id: 'pause', w: 46, h: 38, r: 11, color: 0x5a55a0, icon: 'pause', onTap: () => { game.setPaused(true); game.goto('result', { mode: 'pause', over: true }); } });
  scr.put(top.pause, 8, 8);
  const plate = ui.panel({ w: 150, h: 46, r: 14, color: 0x2a2150, depth: 4, bevel: 2.4 }); scr.put(plate, 105, 6);
  top.wave = ui.text('ĐỢT 1/5', { size: 19, align: 'center', valign: 'mid' }); plate.put(top.wave, 75, 17, 1);
  top.stage = ui.text('', { size: 10, align: 'center', valign: 'mid', color: 0xd9ccff, outlineW: 1.2 }); plate.put(top.stage, 75, 36, 1);
  top.speed = ui.button({ id: 'speed', w: 64, h: 38, r: 11, color: PAL.blue, icon: 'speed', label: 'x1', size: 15, onTap: () => { if (!game.meta.unlocked('speed')) { ui.toast(game.meta.lockText('speed')); return; } game.setSpeed(game.speed === 1 ? 2 : 1); } });
  scr.put(top.speed, 288, 8);
  top.speedLock = ui.icon('lock', { size: 22, sway: false }); top.speed.put(top.speedLock, 46, -9, 14);
  // small chip while the auto-ultimate switch is on
  top.auto = ui.panel({ w: 46, h: 30, r: 10, color: 0x6a3ad0, depth: 3, bevel: 2, ow: 2.2, shadow: false }); scr.put(top.auto, 58, 12);
  top.auto.put(ui.icon('bolt', { size: 20, sway: false }), 3, 5, 4); top.auto.put(ui.text('TỰ', { size: 13, valign: 'mid' }), 26, 16, 2); top.auto.setVisible(false);
  top.timerPlate = ui.panel({ w: 66, h: 24, r: 12, color: 0x2a2150, depth: 3, bevel: 2, gloss: false, ow: 2.4 }); scr.put(top.timerPlate, 8, 56);
  top.timer = ui.text('00:00', { size: 14, align: 'center', valign: 'mid' }); top.timerPlate.put(top.timer, 33, 13, 1);
  top.killPlate = ui.panel({ w: 76, h: 24, r: 12, color: 0x2a2150, depth: 3, bevel: 2, gloss: false, ow: 2.4 }); scr.put(top.killPlate, 276, 56);
  top.killIcon = ui.icon('skull', { size: 26, sway: false }); top.killPlate.put(top.killIcon, -5, -1, 4);
  top.kills = ui.text('0', { size: 14, align: 'right', valign: 'mid' }); top.killPlate.put(top.kills, 70, 13, 1);
  top.pips = [];
  { // four pills and a skull pill for the boss wave
    const widths = [28, 28, 28, 28, 34], gap = 6, total = widths.reduce((a, b) => a + b, 0) + gap * 4; let x = 180 - total / 2;
    widths.forEach((w, i) => {
      const boss = i === 4, p = ui.panel({ w, h: boss ? 18 : 12, r: boss ? 9 : 6, color: 0x4a4f68, depth: 2, bevel: 1.4, shadow: false, ow: 2 }); scr.put(p, x, boss ? 59 : 62);
      if (boss) { const s = ui.icon('skull', { size: 18, sway: false }); p.put(s, 8, 0, 2); }
      top.pips.push(p); x += w + gap;
    });
  }
  // boss bar under the band
  const boss = ui.group({ w: 360, h: 40 }); scr.put(boss, 0, -60);
  boss.put(ui.icon('skull', { size: 32 }), 8, 1, 2);
  boss.name = ui.text('', { size: 13, align: 'left', valign: 'mid', upper: true }); boss.put(boss.name, 46, 8, 3);
  boss.bar = ui.bar({ w: 302, h: 18, color: PAL.red, ghost: true }); boss.put(boss.bar, 46, 18, 0);
  boss.sh = 0; boss.y = -60; boss.shown = false; boss.uid = 0; boss.label = '';

  // ---------- spectate controls ----------
  const spec = ui.group({ w: 360, h: 96 }); scr.put(spec, 0, 98); spec.setVisible(false);
  const specPlate = ui.panel({ w: 210, h: 44, r: 14, color: 0x1f6f8f, depth: 4, bevel: 2.4 }); spec.put(specPlate, 75, 0);
  spec.title = ui.text('ĐANG XEM', { size: 15, align: 'center', valign: 'mid', upper: true }); specPlate.put(spec.title, 105, 15, 1);
  spec.sub = ui.text('chỉ xem, không điều khiển', { size: 10, align: 'center', valign: 'mid', color: 0xcdf3ff, outlineW: 1.2 }); specPlate.put(spec.sub, 105, 33, 1);
  spec.put(ui.button({ id: 'spec-prev', w: 50, h: 38, r: 12, color: 0x2f9bc0, icon: 'left', onTap: () => cycle(-1) }), 18, 3);
  spec.put(ui.button({ id: 'spec-next', w: 50, h: 38, r: 12, color: 0x2f9bc0, icon: 'right', onTap: () => cycle(1) }), 292, 3);
  spec.put(ui.button({ id: 'spec-all', w: 132, h: 34, r: 12, color: PAL.orange, label: 'TOÀN CẢNH', size: 14, onTap: () => game.spectate(-1) }), 114, 54);
  spec.y = 98;

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
  function buildCards(B) {
    const had = cards.map((c) => c.kind);
    disposeCards();
    const n = B.heroes.length, x0 = 180 - (n * CARD_W + (n - 1) * CARD_GAP) / 2;
    B.heroes.forEach((u, i) => {
      const col = ui.group({ w: CARD_W, h: 120 }); scr.holder.add(col); col.anchor(x0 + i * (CARD_W + CARD_GAP), 'bottom', -CARD_TOP_FROM_BOTTOM);
      const lift = new THREE.Group(), inner = new THREE.Group(); lift.position.set(CARD_W / 2, -CARD_W / 2, 0); inner.position.set(-CARD_W / 2, CARD_W / 2, 0); col.add(lift); lift.add(inner);
      const add = (node, x, y, z) => { inner.add(node); node.pos(x, y, z); return node; };
      const card = { i, col, lift, inner, ready: false, readyT: 0, shake: 0, hpShown: 1, kind: u.kind, slide: had.length && !had.includes(u.kind) ? 0 : 1 };
      card.halo = add(ui.panel({ w: 90, h: 90, r: 22, color: PAL.gold, depth: 3, bevel: 2, gloss: false, shadow: false, ow: 2.4 }), -5, -5, -3); card.halo.setVisible(false);
      card.portrait = add(ui.portrait(u.kind, { size: CARD_W, color: heroColor(u.kind), id: 'ult' + i, onTap: () => tapUlt(i) }), 0, 0, 0);
      const t = card.portrait.target, press = t.press; t.press = (on) => { press(on); if (on && !t.enabled) card.shake = 0.32; };
      t.enabled = false;
      card.down = roundPlane(THREE, 66.4, 66.4, 9.6, 'rgba(18,14,32,0.72)'); card.down.position.set(6.8 + 33.2, -(6.8 + 33.2), 10); inner.add(card.down); card.down.visible = false;
      card.skull = add(ui.icon('skull', { size: 34 }), 23, 23, 13); card.skull.setVisible(false);
      card.name = ui.text(HERO[u.kind].name, { size: 12, align: 'center', valign: 'mid' }); add(card.name, CARD_W / 2, 68, 12);
      card.bar = add(ui.bar({ w: CARD_W, h: 12, color: HP_COLORS.ok, ghost: true }), 0, 86, 0);
      const ins = 1.68, iw = CARD_W - ins * 2;
      card.shield = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
      card.shield.position.z = 6.4; card.shield.visible = false; card.bar.add(card.shield); card.shieldW = iw; card.shieldIns = ins;
      card.ring = add(ui.ring({ r: 14, width: 6, color: PAL.purple }), -5, -7, 14); card.ring.put(ui.icon('bolt', { size: 14, sway: false }), 7, 7, 1);
      card.flame = add(ui.icon('flame', { size: 50 }), -13, -30, 16); card.flame.setVisible(false);
      card.eyeHalo = add(ui.panel({ w: 44, h: 36, r: 13, color: 0x58e0ff, depth: 3, bevel: 2, gloss: false, shadow: false, ow: 2.4 }), 41, -37, -3); card.eyeHalo.setVisible(false);
      card.eye = add(ui.button({ id: 'eye' + i, w: 36, h: 28, r: 11, color: 0x4a4f7a, icon: 'eye', shadow: false, onTap: () => tapEye(i) }), 45, -33, 0);
      card.eyeLock = add(ui.icon('lock', { size: 20, sway: false }), 58, -41, 6);
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
    const w = Math.min(344, Math.max(190, t.w + 56)), h = sub ? 58 : 46, g = ui.group({ w, h });
    const p = ui.panel({ w, h, r: 17, color: spec0.color, depth: 5, bevel: 3 }); g.put(p, 0, 0, 0);
    g.put(t, w / 2, sub ? 22 : 24, 8);
    if (sub) g.put(ui.text(sub, { size: 11, align: 'center', valign: 'mid', color: 0xfff1b0, outlineW: 1.4 }), w / 2, 44, 8);
    const cx = (360 - w) / 2; scr.put(g, spec0.kind === 'slide' ? 380 : cx, spec0.y, 30);
    banners.push({ g, kind, spec: spec0, t: 0, w, h, cx });
  }
  function updateBanners(dt) {
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i]; b.t += dt; const dur = b.spec.kind === 'slide' ? 1.9 : 1.5, tin = 0.3, tout = 0.26;
      if (b.t >= dur) { kill(b.g); banners.splice(i, 1); continue; }
      if (b.spec.kind === 'slide') {
        const x = b.t < tin ? 380 + (b.cx - 380) * easeBack(b.t / tin) : b.t > dur - tout ? b.cx - (b.cx + b.w + 20) * easeOut((b.t - (dur - tout)) / tout) : b.cx;
        b.g.pos(x, b.spec.y, 30); b.g.scale.set(1, 1, 1);
      } else {
        const s = b.t < tin ? easeBack(b.t / tin) : b.t > dur - tout ? 1 - easeOut((b.t - (dur - tout)) / tout) : 1, k = Math.max(0.01, s);
        b.g.pos(b.cx + b.w / 2 * (1 - k), b.spec.y + b.h / 2 * (1 - k), 30); b.g.scale.set(k, k, 1);
      }
    }
  }
  function burst(slot) {
    const c = cards[slot]; if (!c) return;
    const cx = c.col.ux + CARD_W / 2, cy = c.col.uy + CARD_W / 2;
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
    pending.clear(); live.length = 0;
  }

  // ---------- damage and heal numbers ----------
  const pending = new Map(), live = [];
  function note(e, heal) {
    if (!visible || !game.B) return;
    const amount = heal ? e.amt : e.dmg; if (!(amount > 0)) return;
    const key = e.uid * 2 + (heal ? 1 : 0), p = pending.get(key);
    if (p) { p.sum += amount; p.crit = p.crit || !!e.crit; p.x = e.x; p.z = e.z; } else pending.set(key, { sum: amount, crit: !!e.crit, x: e.x, z: e.z, t0: clock, heal, uid: e.uid });
  }
  function flushNumbers() {
    for (let i = live.length - 1; i >= 0; i--) if (live[i].until <= clock) live.splice(i, 1);
    const B = game.B;
    if (!B || B.phase !== 'fight') { pending.clear(); return; }
    for (const [key, p] of pending) {
      if (clock - p.t0 < MERGE) continue; pending.delete(key);
      if (live.length >= MAX_NUMBERS && !p.crit) continue;
      const u = B && B.byUid.get(p.uid), hero = !!(u && u.hero), at = game.project(p.x, p.z, hero ? 1.9 : (u && u.boss ? 3.2 : 1.6));
      if (at.behind || at.x < -10 || at.x > 370 || at.y < 60) continue;
      const o = p.heal ? { color: PAL.green, size: 18 } : hero ? { color: 0xff7468, size: 15 } : p.crit ? { color: PAL.gold, size: 27 } : { color: 0xffffff, size: 17 };
      let nx = at.x, ny = at.y;
      for (let tries = 0; tries < 5 && live.some((q) => Math.abs(q.x - nx) < 38 && Math.abs(q.y - ny) < 18); tries++) { ny -= 19; nx += tries % 2 ? -9 : 9; }
      ui.fly((p.heal ? '+' : '') + fmt(p.sum), nx, ny, o); live.push({ until: clock + NUMBER_LIFE, x: nx, y: ny });
    }
  }

  // ---------- events ----------
  const on = (name, fn) => game.events.on(name, fn);
  on('sim:hit', (e) => note(e, false)); on('sim:heal', (e) => note(e, true));
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
    if (c.shield.visible) { const w = Math.max(2, c.shieldW * sf), ih = 12 - c.shieldIns * 2; c.shield.scale.set(w, ih * 0.42, 1); c.shield.position.set(c.shieldIns + w / 2, -c.shieldIns - ih * 0.25, 6.4); }
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
      if (ready || watching) { c.halo.setColor(ready ? PAL.gold : 0x58e0ff); const p = 1 + Math.sin(clock * 9) * (ready ? 0.035 : 0.015); c.halo.scale.set(p, p, 1); c.halo.pos(-5 - 45 * (p - 1), -5 - 45 * (p - 1)); }
      c.eyeHalo.setVisible(watching);
      c.down.visible = !u.alive; c.skull.setVisible(!u.alive); c.name.setColor(u.alive ? 0xffffff : 0xb9b3cc);
      const up = ready ? easeBack(c.readyT / 0.35) : 0, pulse = ready ? 1 + Math.sin(clock * 8.5) * 0.04 : 1;
      if (c.slide < 1) { if (B.phase === 'fight') c.slide = Math.min(1, c.slide + dt / 0.5); }
      const drop = (1 - easeBack(c.slide)) * 150;
      c.lift.position.y = -CARD_W / 2 + up * 9 - drop; c.lift.scale.set(pulse, pulse, 1);
      if (c.shake > 0) { c.shake -= dt; c.inner.position.x = -CARD_W / 2 + Math.sin(c.shake * 60) * 4 * (c.shake / 0.32); } else c.inner.position.x = -CARD_W / 2;
    }
  }
  function updateTop(B) {
    const waves = B.stage.waves.length;
    top.wave.set('ĐỢT ' + clamp(B.wave, 1, waves) + '/' + waves); top.stage.set(B.stage.name || '');
    const s = Math.floor(B.t); top.timer.set(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
    top.kills.set(fmt(B.kills));
    top.speed.setLabel('x' + game.speed);
    top.pips.forEach((p, i) => { const done = i < B.wave - 1 || B.phase === 'won', cur = i === B.wave - 1 && B.phase !== 'won'; const col = done ? PAL.green : cur ? (i === 4 ? PAL.red : PAL.gold) : 0x4a4f68; if (p.col !== col) { p.col = col; p.setColor(col); } });
  }
  function updateBoss(B, dt) {
    const bu = B.boss ? B.byUid.get(B.boss) : null, on = !!(bu && bu.alive);
    if (on && boss.uid !== bu.uid) { boss.uid = bu.uid; boss.label = unitName(bu); boss.name.set(boss.label); boss.bar.set(1, true); }
    boss.shown = on; const want = on ? 92 : -60;
    boss.y += (want - boss.y) * (1 - Math.exp(-dt * 9)); if (Math.abs(want - boss.y) < 0.2) boss.y = want;
    boss.pos(0, boss.y, 0); boss.visible = boss.y > -50;
    if (bu) boss.bar.set(clamp(bu.hp / (bu.maxHp || bu.base.hp), 0, 1));
    return on;
  }
  function updateSpectate(B, bossOn, dt) {
    const u = game.watching ? B.byUid.get(game.watching) : null;
    spec.setVisible(!!u);
    if (!u) { spec.lostT = 0; return; }
    spec.title.set('ĐANG XEM: ' + unitName(u).toLocaleUpperCase('vi'));
    const wy = bossOn ? 134 : 98; spec.y += (wy - spec.y) * (1 - Math.exp(-dt * 10)); spec.pos(0, spec.y, 0);
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
    const bossOn = updateBoss(B, dt); updateSpectate(B, bossOn, dt);
    updateBanners(dt); updateBursts(dt); flushNumbers();
  }

  const hud = {
    name: 'hud',
    show() {
      visible = true; ui.show('hud', { transition: 'none' }); clearTransient();
      const B = game.B; boss.uid = 0; boss.y = -60; boss.pos(0, -60, 0); boss.visible = false;
      if (B) { teamSig = B.heroes.map((u) => u.kind).join(','); buildCards(B); if (B.wave === 1 && B.t < 1) banner('wave', 'ĐỢT 1'); }
    },
    hide() { visible = false; ui.hide('hud', { transition: 'none' }); clearTransient(); },
    update,
    // what the test needs to read without guessing from pixels
    dbg() {
      return { visible, bossShown: boss.shown, bossName: boss.label, bossY: boss.y, flames: cards.map((c) => c.flame.visible), ready: cards.map((c) => c.ready), banners: banners.map((b) => b.kind), numbers: live.length, specShown: spec.visible };
    },
  };
  return hud;
}
