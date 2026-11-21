import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { generateHouse } from './housegen.js';
import { buildHouse } from './house3d.js';
import { Foes } from './foes.js';
import { buildTruck } from './truck.js';
import { Traps } from './traps.js';
import { buildStation } from './station.js';
import { navFor } from './nav.js';
import { HudX, Ring } from './hudx.js';
import { Bots, matesFor } from './bots.js';
import { Cart } from './cart.js';
import { CREW } from './skills.js';
import { curve, crewMul, quotaFor } from './quota.js';

// The shift loop as one state machine. State lives in G.run (plain object, readable by tests and the HUD):
//   phase: 'lobby' | 'loading' | 'loot' | 'escape' | 'station' | 'end'
//   lobby --begin()--> loot(house 1) --last pad cashed--> escape --board--> station --depart--> loot(house n+1) ... --board at house 5--> end (win)
//   loot/escape --quota unreachable | down with nobody to revive--> end (lose)
// Numbers: design-inventory sections 1, 4, 7, 9. Everything the loop needs is in RUN; gameplay numbers of the other systems stay in config.js.
export const RUN = {
  houses: 5, themes: ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum'],
  levels: [1, 3, 6, 10, 15], startWallet: 5000, startCrew: 1,
  escapeDelay: 1, escapeDim: 0.16, dimFade: 1, hornPings: 4, hornSpan: 10, hornR: 30, pingR: 15,
  truckHeal: [50, 50, 35, 35, 25], reviveHp: 1, headRevive: 1,
  restockMargin: 1.12, restockEvery: 1.5, restockCap: 0.5,
  unreachableConfirm: 2, downLose: 2.5,
  goldPerHouse: 300, winGold: 1800, goldCap: 3000,
  bagSplit: [1100, 3200],
};
const BASE_PLAYER = { stamina: CFG.player.stamina, str: CFG.player.str, hp: CFG.player.hp };
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export { curve, crewMul, quotaFor };
export function bagSize(value) { return value < RUN.bagSplit[0] ? 'small' : value < RUN.bagSplit[1] ? 'medium' : 'big'; }

export class Runner {
  constructor(G, UI, opts = {}) {
    this.G = G; this.UI = UI;
    this.opts = { foes: opts.foes, foeSleep: opts.foeSleep, theme: opts.theme, houseSeed: opts.houseSeed, testMode: !!opts.testMode, ...opts };
    this.busy = false;
    this.overlay = null;
    G.run = { phase: 'lobby', house: 0, houses: RUN.houses };
    G.runner = this;
    this.hx = new HudX(UI);
    this.padRings = [];
  }

  get R() { return this.G.run; }
  /** Does the physics world run in this phase? */
  simulating() { return !this.busy && ['loot', 'escape', 'station'].includes(this.R.phase); }

  // ------------------------------------------------------------------ run start / end
  /** New run. opts: { seed, house (start at this house, tests), theme (fixed theme), houseSeed (fixed layout seed) } */
  async begin(o = {}) {
    const G = this.G;
    const seed = Number(o.seed ?? this.opts.seed ?? G.params.seed) || ((Math.random() * 1e6) | 0);
    const theme = o.theme ?? this.opts.theme;
    const rnd = mulberry32(seed * 2654435761 >>> 0);
    const order = RUN.themes.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    this.rng = mulberry32(seed ^ 0x5bd1e995);
    CFG.player.stamina = BASE_PLAYER.stamina; CFG.player.str = BASE_PLAYER.str;
    this.resetPlayer();
    G.extract.haul = 0;
    // crew: the lead picked in the lobby (or ?crew=), three bot mates (?bots=id:role,... | 0; tests get none unless asked)
    const lead = CREW[o.crew] ? o.crew : CREW[G.params.crew] ? G.params.crew : 'bao';
    G.player.crewId = lead;
    const mates = this.opts.testMode && G.params.bots === undefined ? [] : matesFor(lead, G.params.bots);
    G.run = {
      phase: 'loading', house: 0, houses: RUN.houses, seed, themes: theme ? order.map(() => theme) : order,
      wallet: RUN.startWallet, haul: 0, spent: 0, houseHaul: 0, quotaTotal: 0, padQuota: 0, padCount: 0, level: 1, crew: 1 + mates.length, lead, mates,
      time: 0, t: 0, downs: 0, hpMax: CREW[lead].hp, packs: [0, 0, 0], seen: new Set(), lost: null, result: null,
      restocked: 0, restockT: 0, unreachableT: 0, downT: 0, escape: null, lootSum0: 0, cleared: 0, houseSeed: o.houseSeed ?? this.opts.houseSeed ?? null,
      testMode: this.opts.testMode, log: [],
    };
    G.player.hp = G.run.hpMax;   // the picked crew member's hp (design-inventory section 6)
    this.log('begin', { seed, themes: G.run.themes, lead, hp: G.run.hpMax });
    await this.loadHouse(o.house ?? this.opts.house ?? 1);
  }

  log(kind, data) { this.R.log?.push([kind, +(this.R.time || 0).toFixed(1), data]); }

  async transition(label, fn) {
    this.busy = true;
    this.showOverlay(label);
    document.exitPointerLock?.();
    await tick();
    try { await fn(); } finally { this.hideOverlay(); this.busy = false; }
  }
  showOverlay(text) {
    if (!this.overlay) {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:#05060a;color:#cfd6e6;letter-spacing:.2em;font:700 18px system-ui;pointer-events:none';
      document.body.appendChild(d); this.overlay = d;
    }
    this.overlay.textContent = text; this.overlay.style.display = 'grid';
    this.setView(false);
  }
  hideOverlay() { if (this.overlay) this.overlay.style.display = 'none'; }
  /** Canvas only shows during play; lobby and run-end sit on the page background. */
  setView(on) { this.G.viewOn = on; this.G.renderer.domElement.style.visibility = on ? 'visible' : 'hidden';
    const xh = document.getElementById('xhair'); if (xh) xh.style.display = on ? 'block' : 'none'; }

  // ------------------------------------------------------------------ houses
  disposeWorld() {
    const G = this.G;
    if (G.grab?.held) G.grab.release(false);
    G.bots?.dispose(); G.bots = null;
    G.scan?.reset();
    G.cart?.dispose(); G.cart = null;
    G.traps?.dispose(); G.traps = null;
    G.skills?.clear();
    G.foes?.dispose(); G.foes = null;
    G.truck?.dispose(); G.truck = null;
    for (const r of this.padRings) { r.a.dispose(); r.b.dispose(); } this.padRings = [];
    if (G.station) {   // the station owns its house shell (G.house points at it) and disposes it itself
      if (G.house === G.station.house) G.house = null;
      G.station.dispose(); G.station = null;
    }
    G.house?.dispose(); G.house = null;
    for (const it of [...G.loot.items]) if (!it.dead) G.loot.destroy(it, false);
    G.loot.items = G.loot.items.filter((i) => !i.dead);
    G.noise.events.length = 0;
  }

  resetPlayer() {
    const G = this.G, P = G.player;
    if (P.down) this.reviveNow(null, true);
    P.hp = CFG.player.hp; P.stamina = CFG.player.stamina; P.str = CFG.player.str; P.hurtT = 0; P.runMul = 1;
    if (G.torch?.userData.d0 !== undefined) G.torch.userData.d0 = 14;   // light potions last one run
    G.gear?.clear(); P.lastHit = null; P.vy = 0; P.pitch = 0;
  }

  /** A spot in the truck room 2.5-5 m from the spawn with room around it for the cart. */
  parkCart(house) {
    const G = this.G, nav = G.foes?.nav || G.nav, sp = house.spawn; if (!nav) return null;
    let best = null;
    for (let r = 2.5; r <= 5 && !best; r += 0.5) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r, i = nav.nearest(x, z, 0); if (i >= 0 && nav.near[i] >= 3 && nav.floorAt(x, z) === 0) { best = nav.center(i); break; } }
    return best ? new Cart(G, best, sp.yaw + Math.PI / 2) : null;
  }

  async loadHouse(n) {
    const G = this.G;
    await this.transition(`NHÀ ${n}/${RUN.houses}…`, async () => {
      this.disposeWorld();
      const R = this.R;
      const theme = R.themes[n - 1];
      let layout = null, seed = 0, err = null;
      for (let k = 0; k < 6 && !layout; k++) {
        seed = R.houseSeed != null ? R.houseSeed + k : (R.seed * 101 + n * 7919 + k * 13) % 1000003;
        try { layout = generateHouse({ theme, houseIndex: n, seed, floors: this.opts.floors !== false }); } catch (e) { err = e; }
      }
      if (!layout) throw err;
      const house = buildHouse(G, layout, theme);
      G.house = house;
      G.truck = buildTruck(G, house);   // before nav: the truck blocks its cells in layout.block
      G.nav = navFor(layout);
      this.placePlayer(house.spawn);
      G.foes = new Foes(G, house);   // always there (tests spawn into it); foes=none only skips the roster
      if (this.opts.foes !== 'none') {
        const fp = this.opts.foes;
        G.foes.spawnRoster({ kinds: fp && fp !== 'roster' ? fp.split(',') : undefined, sleep: this.opts.foeSleep });
        if (!fp || fp === 'roster') G.foes.spawnBoss(house.theme);   // one theme boss from house 3 (bosses.js)
      }
      if (R.mates?.length) G.bots = new Bots(G, R.mates);
      G.cart = this.parkCart(house);   // one push cart by the truck (design-inventory 3)
      if (this.opts.traps !== false) G.traps = new Traps(G, house);   // floor traps from the room prefabs (traps.js)
      // quota: sum of value0 of the floor loot, split equally per pad
      const items = G.loot.items.filter((i) => !i.dead);
      const lootSum = items.reduce((s, i) => s + i.value0, 0);
      const level = RUN.levels[n - 1];
      const total = quotaFor(lootSum, level, R.crew);
      const padCount = Math.max(1, house.pads.length);
      const per = Math.round(total / padCount / 10) * 10;
      for (const p of house.pads) p.quota = per;
      G.extract.setPads(house.pads);
      this.padRings = house.pads.map((p) => ({ a: new Ring(G.scene, p.x, p.z, p.half * 1.25, p.half * 1.36, 0x43d0ff, (p.y || 0) + 0.05), b: new Ring(G.scene, p.x, p.z, p.half * 1.08, p.half * 1.2, 0xffe45e, (p.y || 0) + 0.05) }));
      Object.assign(R, { phase: 'loot', house: n, level, quotaTotal: total, padQuota: per, padCount, lootSum0: lootSum, houseHaul: 0, restocked: 0, restockT: 0, unreachableT: 0, downT: 0, escape: null, seen: new Set([0]), houseSeedUsed: seed, theme });
      this.log('house', { n, theme, seed, loot: items.length, lootSum, quotaTotal: total, padCount, per });
      G.events.emit('run:house', { n, theme });
      this.setView(true);
      this.frameOnce();
      this.UI.hud.show();
    });
  }

  placePlayer(spawn) {
    const P = this.G.player, PC = CFG.player;
    P.body.setTranslation({ x: spawn.x, y: PC.halfHeight + PC.radius + 0.02, z: spawn.z }, true);
    P.body.setNextKinematicTranslation({ x: spawn.x, y: PC.halfHeight + PC.radius + 0.02, z: spawn.z });
    P.yaw = spawn.yaw || 0; P.pitch = 0; P.vy = 0;
  }

  // ------------------------------------------------------------------ per physics tick
  step(dt) {
    const G = this.G, R = this.R, P = G.player;
    if (!this.simulating()) return;
    R.time += dt; R.t += dt;
    const pos = P.position;
    // keys 1-3: health packs
    if (!P.down && G.input) for (let i = 0; i < 3; i++) if (G.input.tap('Digit' + (i + 1))) this.usePack(i);
    if (R.phase === 'station') return this.stepStation(dt, pos);
    this.markSeen(pos);
    // down: the head on the active pad revives; with nobody to carry it the shift is over
    if (P.down) {
      // the head has to lie on the pad for headRevive s (Hook's passive halves it)
      if (G.extract.checkHead(P)) { R.headT = (R.headT || 0) + dt; if (R.headT >= (G.passives ? G.passives.reviveSec(RUN.headRevive) : RUN.headRevive)) { R.headT = 0; this.reviveNow(G.extract.pads[G.extract.active]); } }
      else {
        R.headT = 0;
        if (!R.testMode && !(G.bots?.alive().length)) { R.downT += dt; if (R.downT >= RUN.downLose) return this.finish(false, 'down'); }
      }
    } else R.downT = 0;
    if (R.phase === 'loot') this.stepLoot(dt);
    else if (R.phase === 'escape') this.stepEscape(dt, pos);
  }

  stepLoot(dt) {
    const G = this.G, R = this.R, X = G.extract;
    if (X.finished) return this.startEscape();
    if (R.testMode) return;
    // restock: top the house up when loot left < remaining quota * 1.12, one item per 1.5 s, capped (so a wiped house can still be lost)
    const need = X.remainingQuota(), have = X.lootRemaining();
    const cap = RUN.restockCap * R.quotaTotal;
    R.restockT -= dt;
    if (have < need * RUN.restockMargin && cap - R.restocked >= 400 && R.restockT <= 0) {
      R.restockT = RUN.restockEvery;
      if (this.restockOne()) { this.log('restock', { have, need, total: R.restocked }); }
    }
    // unreachable: not enough value left, nothing more can come
    const canRestock = cap - R.restocked >= 400;
    if (have < need && !canRestock) { R.unreachableT += dt; if (R.unreachableT >= RUN.unreachableConfirm) return this.finish(false, 'quota'); }
    else R.unreachableT = 0;
  }

  restockOne() {
    const G = this.G, R = this.R, L = G.house.layout, W = L.w, P = G.player.position;
    const pts = L.loot.filter((s) => Math.hypot(s.x + 0.5 - P.x, s.y + 0.5 - P.z) > 7);
    if (!pts.length) return false;
    const rng = this.rng, left = RUN.restockCap * R.quotaTotal - R.restocked;
    if (left < 400) return false;
    const items = G.loot.items;
    for (let tries = 0; tries < 12; tries++) {
      const s = pts[Math.floor(rng() * pts.length)];
      let cell = null;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const x = s.x + dx, y = s.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < L.h && L.grid[y * W + x] === 1 && !L.block[y * W + x]) { cell = [x, y]; break; }
      }
      if (!cell) continue;
      const px = cell[0] + 0.5, pz = cell[1] + 0.5;
      if (items.some((i) => !i.dead && Math.hypot(i.body.translation().x - px, i.body.translation().z - pz) < 0.8)) continue;
      const r = rng(), size = r < 0.45 ? 'small' : r < 0.82 ? 'medium' : 'big';
      const material = ['ceramic', 'wood', 'metal'][Math.floor(rng() * 3)];
      const half = CFG.loot.sizes[size].half;
      const [lo, hi] = CFG.loot.sizes[size].value;
      const value = Math.max(400, Math.min(left, Math.round((lo + (hi - lo) * rng()) / 10) * 10));
      const rec = G.loot.spawn({ material, size, pos: { x: px, y: half * 1.3 + 0.06, z: pz }, rng, value });
      rec.restock = true;
      R.restocked += rec.value0;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ pads, bags
  onPadExtract(e) {
    const R = this.R, G = this.G;
    if (R.phase !== 'loot') return;
    R.wallet += e.value; R.haul += e.value; R.houseHaul += e.value;
    this.hx.pop(e.value);
    this.log('pad', { value: e.value, surplus: e.surplus, final: e.final, wallet: R.wallet });
    if (e.surplus > 0) this.spawnBag(e.pad, e.surplus);
  }

  /** Surplus of a non-final pad becomes a money bag: a loot item sized by value, to be carried to the next pad. */
  spawnBag(pad, value) {
    const G = this.G;
    const size = bagSize(value);
    const rec = G.loot.spawn({ material: 'wood', size, value, pos: { x: pad.x, y: (pad.y || 0) + 0.7, z: pad.z } });
    const m = new THREE.MeshStandardMaterial({ color: 0xd8b448, roughness: 0.55, metalness: 0.35, emissive: 0x6a4a08, emissiveIntensity: 0.6 });
    rec.mesh.traverse((o) => { if (o.isMesh) o.material = m; });
    rec.isBag = true;
    this.log('bag', { value, size });
    return rec;
  }

  // ------------------------------------------------------------------ escape
  startEscape() {
    const G = this.G, R = this.R;
    R.phase = 'escape';
    R.escape = { t: 0, foes: false, pings: 0, dim: 1 };
    this.log('escape', {});
    G.events.emit('run:escape', {});
  }

  /** Cells of the rooms next to the truck room, where foes come back during the escape. */
  escapeSpots() {
    const L = this.G.house.layout, nav = this.G.nav, W = L.w;
    const adj = new Set();
    for (const d of L.doors) { if (d.a === 0 && d.b !== 0) adj.add(d.b); if (d.b === 0 && d.a !== 0) adj.add(d.a); }
    const spots = [];
    for (const id of adj) {
      const r = L.rooms[id]; if (!r) continue;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * W + x;
        if (nav.walk[i] && nav.near[i] >= 2) spots.push({ x: x + 0.5, z: y + 0.5 });
      }
    }
    if (!spots.length) for (let y = 0; y < L.h; y++) for (let x = 0; x < W; x++) if (nav.walk[y * W + x] && nav.near[y * W + x] >= 2 && L.rooms[0] && (x < L.rooms[0].x || y < L.rooms[0].y || x >= L.rooms[0].x + L.rooms[0].w || y >= L.rooms[0].y + L.rooms[0].h)) spots.push({ x: x + 0.5, z: y + 0.5 });
    // thin to ~60 cells so rng picks stay cheap
    if (spots.length > 60) { const step = spots.length / 60; return Array.from({ length: 60 }, (_, k) => spots[Math.floor(k * step)]); }
    return spots;
  }

  stepEscape(dt, pos) {
    const G = this.G, R = this.R, E = R.escape;
    E.t += dt;
    const k = Math.min(1, E.t / RUN.dimFade);
    const dim = 1 - (1 - RUN.escapeDim) * k;
    if (dim !== E.dim) { E.dim = dim; G.house.setDim(dim); }
    const hx = G.truck.hornPos.x, hz = G.truck.hornPos.z;
    if (!E.foes && E.t >= RUN.escapeDelay) {
      E.foes = true;
      if (G.foes) { G.foes.startEscape(this.escapeSpots(), hx, hz); G.foes.alertAll(hx, hz); }
      this.log('escape-foes', {});
    }
    // horn: 4 pings over 10 s
    while (E.pings < RUN.hornPings && E.t >= RUN.escapeDelay + E.pings * RUN.hornSpan / (RUN.hornPings - 1)) {
      G.events.emit('noise', { x: hx, z: hz, r: E.pings === 0 ? RUN.hornR : RUN.pingR, str: 2, src: 'horn' });
      E.pings++;
    }
    if (G.truck.step(dt, pos, !G.player.down)) this.board();
  }

  /** The crew is on the truck: heal, then station (houses 1-4) or the end of the shift (house 5). */
  board() {
    const G = this.G, R = this.R, P = G.player;
    if (R.phase !== 'escape') return;
    const heal = RUN.truckHeal[Math.min(R.house, RUN.houses) - 1];
    const before = P.hp;
    P.hp = Math.min(R.hpMax, P.hp + heal);
    R.cleared = R.house;
    this.log('board', { house: R.house, heal, hp: [before, P.hp] });
    if (R.house >= RUN.houses) this.finish(true, 'win');
    else this.enterStation();
  }

  // ------------------------------------------------------------------ station
  async enterStation() {
    const G = this.G, R = this.R;
    R.phase = 'loading';
    await this.transition('TRẠM DỊCH VỤ…', async () => {
      this.disposeWorld();
      G.station = buildStation(G, R);
      G.house = G.station.house;
      G.extract.setPads([]);
      this.placePlayer(G.station.spawn);
      R.phase = 'station'; R.t = 0;
      this.setView(true); this.frameOnce();
      this.UI.hud.show();
      this.log('station', { wallet: R.wallet });
    });
  }

  stepStation(dt, pos) {
    const G = this.G, R = this.R, S = G.station;
    const r = S.step(dt, pos, R.wallet, (offer) => this.buy(offer));
    if (r.depart) this.leaveStation();
  }

  buy(offer) {
    const G = this.G, R = this.R, P = G.player;
    if (R.wallet < offer.price) return false;
    R.wallet -= offer.price; R.spent += offer.price;
    this.hx.pop(-offer.price);
    if (offer.kind === 'pack') { const i = offer.hp === 25 ? 0 : offer.hp === 50 ? 1 : 2; R.packs[i]++; }
    else {
      if (offer.hpMax) { R.hpMax += offer.hpMax; P.hp = Math.min(R.hpMax, P.hp + offer.hpMax); }
      if (offer.staminaMax) { CFG.player.stamina += offer.staminaMax; P.stamina = Math.min(CFG.player.stamina, P.stamina + offer.staminaMax); }
      if (offer.str) { CFG.player.str += offer.str; P.str += offer.str; }
      if (offer.light && G.torch) { const u = G.torch.userData; u.d0 = (u.d0 ?? G.torch.distance) * (1 + offer.light); }   // torch reach (skills.step scales from d0)
      if (offer.sprint) P.runMul *= 1 + offer.sprint;
      if (offer.kind === 'gear') G.gear?.give(offer.gear);
    }
    this.log('buy', { id: offer.id, price: offer.price, wallet: R.wallet });
    return true;
  }

  usePack(i) {
    const R = this.R, P = this.G.player, amt = [25, 50, 100][i];
    if (P.down || R.packs[i] <= 0 || P.hp >= R.hpMax) return false;
    R.packs[i]--; P.hp = Math.min(R.hpMax, P.hp + amt);
    this.log('pack', { i, hp: P.hp });
    return true;
  }

  leaveStation() {
    const R = this.R;
    if (R.phase !== 'station') return;
    R.phase = 'loading';
    this.loadHouse(R.house + 1);
  }

  // ------------------------------------------------------------------ revive / down
  /** The head reached the pad (or a run reset): the player stands up with 1 hp. */
  reviveNow(pad, silent) {
    const G = this.G, P = G.player;
    if (!P.down) return;
    const head = P.head;
    if (G.grab.held === head) G.grab.release(false);
    if (head && !head.dead) { head.dead = true; G.scene.remove(head.mesh); G.phys.remove(head); }
    P.head = null; P.down = false; P.hp = RUN.reviveHp; P.hurtT = 0;
    P.col.setEnabled?.(true);
    const x = pad ? pad.x : P.position.x, z = pad ? pad.z : P.position.z;
    this.placePlayer({ x, z, yaw: P.yaw });
    if (!silent) { this.log('revive', {}); G.events.emit('run:revive', {}); }
  }

  // ------------------------------------------------------------------ end
  finish(win, reason) {
    const G = this.G, R = this.R;
    if (R.phase === 'end') return;
    R.phase = 'end'; R.lost = win ? null : reason; R.win = win; R.reason = reason;
    document.exitPointerLock?.();
    const cleared = R.cleared;
    const gold = Math.min(RUN.goldCap, RUN.goldPerHouse * cleared) + (win ? RUN.winGold : 0);
    const secs = Math.floor(R.time), time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const notes = {
      win: 'Cả tổ lên xe, mang theo tất cả những gì đã giao lên bệ.',
      quota: 'Trượt chỉ tiêu: đồ còn lại không đủ để giao đủ. Cả ca làm lại từ đầu.',
      down: 'Bạn gục và không còn ai mang đầu về bệ. Cả ca làm lại từ đầu.',
      quit: 'Bỏ ca giữa chừng: chỉ giữ phần đã giao lên bệ.',
    };
    R.result = {
      win, houses: RUN.houses, reached: win ? RUN.houses : R.house, haul: R.haul, quota: win ? 0 : R.quotaTotal, time, downs: R.downs,
      gains: { gold }, crew: [{ id: 'mai', at: win ? RUN.houses : R.house, value: R.haul }], note: notes[reason] || notes.quit,
      onClose: () => this.toLobby(),
    };
    this.log('end', { win, reason, haul: R.haul, wallet: R.wallet });
    G.events.emit('run:end', R.result);
    this.setView(false);
    this.hx.hide();
    this.UI.showRunEnd(R.result);
  }

  async toLobby() {
    const G = this.G;
    this.disposeWorld();
    G.extract.setPads([]);
    CFG.player.stamina = BASE_PLAYER.stamina; CFG.player.str = BASE_PLAYER.str;
    this.resetPlayer();
    this.R.phase = 'lobby';
    this.setView(false);
    this.UI.hud.hide(); this.hx.hide();
    this.UI.showLobby((o) => this.begin({ ...o, seed: undefined }));
  }

  // ------------------------------------------------------------------ rendering side (every frame)
  markSeen(pos) {
    const R = this.R, L = this.G.house?.layout; if (!L) return;
    for (const r of L.rooms) if (pos.x >= r.x && pos.x < r.x + r.w && pos.z >= r.y && pos.z < r.y + r.h) R.seen.add(r.id);
    for (const d of this.G.house.doors) if (Math.hypot(d.x - pos.x, d.z - pos.z) < 5) { R.seen.add(d.a); R.seen.add(d.b); }
  }

  frameOnce() { this.G.house?.update(this.G.camera.position); }

  frame(dtMs) {
    const G = this.G, R = this.R;
    G.truck?.update(dtMs);
    G.station?.update(dtMs);
    if (R.phase === 'loot' || R.phase === 'escape' || R.phase === 'station') { this.rings(); this.hud(); this.hudx(); } else this.hx.hide();
  }

  rings() {
    const X = this.G.extract;
    this.padRings.forEach((r, i) => {
      const p = X.pads[i];
      const act = p && !p.done && i === X.active;
      r.a.set(act ? p.value / p.quota : 0); r.b.set(act ? p.hold / CFG.extract.hold : 0);
      r.a.bg.visible = r.b.bg.visible = !!p && !p.done;
    });
  }

  hudx() {
    const G = this.G, R = this.R, P = G.player, X = G.extract;
    let aware = 0, chase = false;
    for (const f of G.foes?.list || []) {
      if (f.dead || f.state === 'sleep' || f.quiet) continue;   // quiet: a disguised impostor
      if (f.state === 'chase' || f.state === 'attack') { chase = true; aware = 1; }
      else aware = Math.max(aware, Math.min(1, f.aware || 0));
    }
    let escape = null;
    if (R.phase === 'escape' && G.truck) {
      const b = G.truck.button, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), dx = b.x - P.position.x, dz = b.z - P.position.z;
      escape = { angle: Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) };
    }
    const held = G.grab.held;
    this.hx.update({
      pips: { n: RUN.houses, cur: R.house },
      pads: R.phase === 'station' ? [] : X.pads.map((p, i) => (p.done ? 'done' : i === X.active ? 'active' : 'locked')),
      escape, aware, chase, down: P.down,
      weight: held && !held.isHead ? Math.min(1, P.speedMul ?? 1) : null,
      carry: held && !held.isHead && held.value != null ? { value: held.value, value0: held.value0 } : null,
      skill: G.skills ? { color: CREW[P.crewId]?.color ?? 0xffffff, cd: G.skills.cdFrac(P), on: P.invisT > 0 || P.gongT > 0 || P.noDownT > 0 } : null,
      mates: (G.bots?.list || []).map((b) => ({ hp: b.hp / b.maxHp, down: b.down, color: CREW[b.crew].color, cd: G.skills.cdFrac(b) })),
    });
  }

  hud() {
    const G = this.G, R = this.R, P = G.player, X = G.extract;
    const held = G.grab.held;
    let pad = null;
    if (R.phase === 'loot') {
      const p = X.pads[X.active];
      if (p && !p.done && (Math.hypot(p.x - P.position.x, p.z - P.position.z) < 9 || p.value > 0)) pad = { value: p.value, quota: p.quota, hold: p.hold / CFG.extract.hold };
    } else if (R.phase === 'station') {
      const S = G.station;
      if (S.total > 0 || S.payHold > 0) pad = { value: S.total, quota: R.wallet, hold: S.payHold / S.payHoldSec };
    }
    const slots = R.packs.map((c) => (c > 0 ? { count: c, on: true } : null));
    slots.push(G.gear?.id ? { count: G.gear.uses, on: true } : null);   // slot 4: gear, key F
    this.UI.hud.update({
      hp: P.hp, hpMax: R.hpMax, stamina: P.stamina / CFG.player.stamina,
      carry: held && !held.isHead && held.value != null && held.value0 != null ? { value: held.value, value0: held.value0 } : null,
      pad, haul: R.phase === 'station' ? R.wallet : R.houseHaul, quota: R.phase === 'station' ? 0 : R.quotaTotal,
      noise: Math.min(1, G.noise.level() / 12), slots, hint: '',
      minimap: (ctx, w, h) => this.drawMinimap(ctx, w, h),
    });
  }

  drawMinimap(ctx, w, h) {
    const G = this.G, R = this.R, L = G.house?.layout; if (!L) return;
    const P = G.player.position, S = 1.7, vw = w / S, vh = h / S;
    const ox = P.x - vw / 2, oz = P.z - vh / 2;
    const X = (x) => (x - ox) * S, Z = (z) => (z - oz) * S;
    ctx.fillStyle = '#0c3b1d'; ctx.fillRect(0, 0, w, h);
    // floors: only the floor the player stands on (a stair room shows on both of its floors); no text, a dot stack says
    // which floor this is and the ramps carry an arrow up or down
    const nav = G.foes?.nav || G.nav, lv = nav?.floorAt ? nav.floorAt(P.x, P.z) : 0, levels = G.house?.levels || [0];
    const stairs = L.stairs || [], onLv = (r) => (r.floor || 0) === lv || stairs.some((st) => st.room === r.id && st.floors?.includes(lv));
    const here = (x, z) => !nav?.floorAt || nav.floorAt(x, z) === lv || stairs.some((st) => x >= st.x0 - 1 && x < st.x1 + 1 && z >= st.y0 - 1 && z < st.y1 + 1);
    const rooms = (R.phase === 'station' ? L.rooms : L.rooms.filter((r) => R.seen.has(r.id))).filter(onLv);
    ctx.fillStyle = '#17a14a';
    for (const r of rooms) ctx.fillRect(X(r.x), Z(r.y), r.w * S, r.h * S);
    ctx.fillStyle = '#10733a';
    for (const d of L.doors) if (R.seen.has(d.a) && R.seen.has(d.b) && here(d.x, d.y)) ctx.fillRect(X(d.x0), Z(d.y0), d.zw * S, d.zh * S);
    for (const st of stairs) {
      if (!R.seen.has(st.room) || !st.floors?.includes(lv)) continue;
      ctx.fillStyle = '#5fe08a'; ctx.fillRect(X(st.x0), Z(st.y0), (st.x1 - st.x0) * S, (st.y1 - st.y0) * S);
      // arrow towards the far end of the ramp when it leads up from here, towards the door when it leads down
      const other = st.floors[0] === lv ? st.floors[1] : st.floors[0], up = other > lv;
      const cx = X((st.x0 + st.x1) / 2), cz = Z((st.y0 + st.y1) / 2), toS = (st.hS > st.hD) === up ? 1 : -1, k = st.sgn * toS;
      const ax = st.axis === 0 ? k : 0, az = st.axis === 1 ? k : 0, L2 = 5;
      ctx.fillStyle = up ? '#ffffff' : '#0c3b1d'; ctx.beginPath();
      ctx.moveTo(cx + ax * L2, cz + az * L2); ctx.lineTo(cx - ax * L2 + az * L2 * 0.8, cz - az * L2 + ax * L2 * 0.8); ctx.lineTo(cx - ax * L2 - az * L2 * 0.8, cz - az * L2 - ax * L2 * 0.8); ctx.closePath(); ctx.fill();
    }
    if (R.phase === 'loot' || R.phase === 'escape') {
      G.extract.pads.forEach((p, i) => {
        const room = L.rooms.find((r) => p.x >= r.x && p.x < r.x + r.w && p.z >= r.y && p.z < r.y + r.h);
        if (!(room && R.seen.has(room.id)) || !here(p.x, p.z)) return;
        ctx.fillStyle = p.done ? '#2a5a3a' : i === G.extract.active ? ((performance.now() / 300 | 0) % 2 ? '#ffe45e' : '#ffffff') : '#bff0d0';
        ctx.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4);
      });
      if (G.truck) { ctx.fillStyle = '#7ad0ff'; ctx.fillRect(X(G.truck.button.x) - 1.5, Z(G.truck.button.z) - 1.5, 3, 3); }
    }
    // bots (crew colour), foes a scout marked or Oracle's reveal shows
    const SK = G.skills;
    for (const f of G.foes?.list || []) if (!f.dead && here(f.x, f.z) && (SK?.revealT > 0 || f.markT > 0 || G.passives?.heard(f))) { ctx.fillStyle = '#ff3a2a'; ctx.fillRect(X(f.x) - 2, Z(f.z) - 2, 4, 4); }
    for (const b of G.bots?.list || []) { if (!here(b.x, b.z)) continue; ctx.fillStyle = b.down ? '#777' : '#' + CREW[b.crew].color.toString(16).padStart(6, '0'); ctx.beginPath(); ctx.arc(X(b.x), Z(b.z), 2.4, 0, Math.PI * 2); ctx.fill(); }
    if (SK?.revealT > 0) { ctx.fillStyle = '#ffe45e'; for (const it of G.loot.items) if (!it.dead) { const t = it.body.translation(); if (!here(t.x, t.z)) continue; ctx.fillRect(X(t.x) - 1, Z(t.z) - 1, 2, 2); } }
    ctx.fillStyle = '#fff'; ctx.fillRect(w / 2 - 1.5, h / 2 - 1.5, 3, 3);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 - Math.sin(G.player.yaw) * 6, h / 2 - Math.cos(G.player.yaw) * 6); ctx.stroke();
    if (levels.length > 1) {   // floor stack, top floor first: the current one bright and larger
      const order = [...levels].sort((a, b) => b - a);
      order.forEach((l, i) => { const y = 7 + i * 8, cur = l === lv; ctx.fillStyle = cur ? '#ffffff' : 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(w - 7, y, cur ? 3 : 2, 0, Math.PI * 2); ctx.fill(); });
    }
    this.mapFloor = lv;
  }

  // ------------------------------------------------------------------ TEST HOOKS (tools/run.js only; not used by the game)
  /** TEST HOOK: cash in every remaining pad of this house as if the loot had been delivered (houses 3-5 fast-forward). */
  testCompletePads() {
    const X = this.G.extract;
    while (X.active < X.pads.length) { const p = X.pads[X.active]; p.value = p.quota; p.items = []; X.fire(p); }
    if (X.finished && this.R.phase === 'loot') this.startEscape();   // what the next stepLoot would do; the page may be paused
  }
  /** TEST HOOK: put the player on the truck button until boarding completes. */
  testBoard() {
    const G = this.G; if (this.R.phase !== 'escape') return false;
    this.board(); return true;
  }
}
