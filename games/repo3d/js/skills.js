// Active skills of the 14 crew members (design-inventory section 6, SqContent.cs). 1 tile = 1 m.
// A caster is the player (G.player, crew id in P.crewId) or a bot (js/bots.js). Status timers live on the actors and foes:
//   actors: invisT (vanish), noDownT (angel), gongT (gong)        foes: stunT, vulnT, lureT + lure {x, z}
// Zones the foes read: cages [{x, z, r, t}]. Everything else is applied on the spot.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

// stats: hp, atk, spd (speed x), carry; skill: cd s, r m, dur s and the skill's own numbers
export const CREW = {
  bao: { hp: 105, atk: 9, spd: 1.0, carry: 32, skill: 'flash', cd: 16, r: 5.5, dur: 3, color: 0xfff1a0 },
  hue: { hp: 120, atk: 7, spd: 0.97, carry: 28, skill: 'healring', cd: 20, r: 4.2, dur: 6, hps: 9, color: 0x6dff9a },
  tam: { hp: 135, atk: 8, spd: 0.94, carry: 46, skill: 'gong', cd: 18, dur: 8, run: 1.3, color: 0xffc04a },
  ky: { hp: 100, atk: 10, spd: 1.02, carry: 30, skill: 'unlock', cd: 22, r: 9, heal: 15, color: 0x8ad0ff },
  linh: { hp: 96, atk: 12, spd: 1.08, carry: 30, skill: 'vanish', cd: 24, dur: 6, color: 0xb08aff },
  dung: { hp: 150, atk: 16, spd: 0.95, carry: 40, skill: 'shock', cd: 22, r: 3.5, dmg: 40, dur: 1.5, color: 0xff8a3a },
  mai: { hp: 104, atk: 11, spd: 1.05, carry: 30, skill: 'decoy', cd: 19, r: 16, dur: 9, throw: 4, color: 0xff7ad0 },
  phuc: { hp: 128, atk: 10, spd: 1.02, carry: 34, skill: 'rescue', cd: 26, r: 9, color: 0x5ae0ff },
  son: { hp: 140, atk: 9, spd: 0.96, carry: 36, skill: 'cage', cd: 21, r: 1.8, dur: 9, color: 0xc8d0d8 },
  nga: { hp: 112, atk: 18, spd: 1.12, carry: 34, skill: 'blink', cd: 12, r: 6.5, dur: 3, color: 0x9a7aff },
  khoi: { hp: 108, atk: 15, spd: 1.04, carry: 32, skill: 'reveal', cd: 25, dur: 12, torch: 1.5, color: 0x7affe0 },
  van: { hp: 116, atk: 17, spd: 1.03, carry: 32, skill: 'freeze', cd: 23, r: 8, dur: 4.5, vuln: 1.5, color: 0x9ae8ff },
  hai: { hp: 110, atk: 14, spd: 1.02, carry: 44, skill: 'pull', cd: 35, r: 5, n: 2, color: 0xffd84a },
  tuyet: { hp: 125, atk: 16, spd: 1.05, carry: 34, skill: 'angel', cd: 30, dur: 5, color: 0xfff6d8 },
};
export const CREW_IDS = Object.keys(CREW);

const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
const shieldGeo = new THREE.BoxGeometry(1.1, 1.6, 0.08);
const boxGeo = new THREE.BoxGeometry(0.34, 0.26, 0.34);

export class Skills {
  /** Floors: the floor height under a point (markers and zones sit on the floor the caster stands on). */
  gy(x, z) { return this.G.house?.heightAt ? this.G.house.heightAt(x, z) : 0; }
  constructor(G) {
    this.G = G;
    this.cd = new Map();       // actor -> seconds left
    this.cages = [];
    this.rings = [];           // heal rings {x, z, r, t, hps, mesh}
    this.decoys = [];          // {x, z, t, mesh, light}
    this.fx = [];
    this.revealT = 0;
    this.log = [];
    this.root = new THREE.Group(); this.root.name = 'skills'; G.scene.add(this.root);
  }

  // ---- actors
  allies() { const b = this.G.bots?.list || []; return [this.G.player, ...b]; }
  isBot(a) { return !!a.isBot; }
  pos(a) {
    if (a.isBot) return { x: a.x, z: a.z };
    const P = this.G.player;
    if (P.down && P.head && !P.head.dead) { const t = P.head.body.translation(); return { x: t.x, z: t.z }; }
    const t = P.position; return { x: t.x, z: t.z };
  }
  fwd(a) { return a.isBot ? { x: Math.sin(a.yaw), z: Math.cos(a.yaw) } : { x: -Math.sin(a.yaw), z: -Math.cos(a.yaw) }; }
  crewOf(a) { return a.isBot ? a.crew : (this.G.player.crewId || 'bao'); }
  maxHp(a) { return a.isBot ? a.maxHp : (this.G.run?.hpMax ?? CFG.player.hp); }
  heal(a, n) { if (a.down || !(n > 0)) return 0; const m = this.maxHp(a), h0 = a.hp; a.hp = Math.min(m, a.hp + n); return a.hp - h0; }
  revive(a, at, hpK = 0.35) {
    if (!a.down) return false;
    if (a.isBot) { this.G.bots.revive(a, at, hpK); return true; }
    const R = this.G.runner;
    if (R) { R.reviveNow(null, true); if (at) R.placePlayer({ x: at.x, z: at.z, yaw: this.G.player.yaw }); }
    this.G.player.hp = Math.max(this.G.player.hp, Math.round(this.maxHp(a) * hpK));
    this.G.events.emit('run:revive', { by: 'skill' });
    return true;
  }
  foesNear(p, r, filter = () => true) {
    return (this.G.foes?.list || []).filter((f) => !f.dead && Math.hypot(f.x - p.x, f.z - p.z) <= r && filter(f));
  }

  // ---- cooldowns
  ready(a) { return (this.cd.get(a) || 0) <= 0; }
  cdLeft(a) { return this.cd.get(a) || 0; }
  cdFrac(a) { const c = CREW[this.crewOf(a)]; return c ? Math.max(0, Math.min(1, this.cdLeft(a) / c.cd)) : 0; }

  /** Cast a's skill. Returns { ok, skill, why?, ...detail }. Cooldown starts only on success. */
  cast(a, opts = {}) {
    const id = this.crewOf(a), c = CREW[id];
    if (!c) return { ok: false, why: 'crew not found: ' + id };
    if (a.down) return { ok: false, skill: c.skill, why: 'caster down' };
    if (!opts.force && !this.ready(a)) return { ok: false, skill: c.skill, why: 'cooldown' };
    const fn = this['s_' + c.skill];
    const res = Object.assign({ ok: true, skill: c.skill }, fn.call(this, a, c, opts) || {});
    if (res.ok) {
      this.cd.set(a, c.cd * (a.R?.cdK || 1));   // support role: -15 %
      this.log.push(['cast', id, c.skill, a.isBot ? 'bot' : 'player', +(this.G.time || 0).toFixed(2)]);
      this.G.events.emit('skill:cast', { actor: a, crew: id, skill: c.skill, res });
    }
    return res;
  }

  // ---- the 14 skills
  /** Flare: foes within 5.5 m stand still 3 s and forget whom they hunted. */
  s_flash(a, c) {
    const p = this.pos(a), hit = this.foesNear(p, c.r);
    for (const f of hit) { this.stun(f, c.dur); f.aware = 0; f.lastSeen = null; f.target = null; f.prey = null; if (f.state === 'chase') this.G.foes.setState(f, 'patrol'); }
    this.burst(p, c.r, c.color, 0.5, 6);
    return { n: hit.length };
  }
  /** Halo: a ring on the floor heals 9 hp/s for 6 s to everyone inside r 4.2. */
  s_healring(a, c) {
    const p = this.pos(a);
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(p.x, this.gy(p.x, p.z) + 0.05, p.z); mesh.scale.setScalar(c.r); this.root.add(mesh);
    this.rings.push({ x: p.x, z: p.z, r: c.r, t: c.dur, hps: c.hps, mesh });
  }
  /** Atlas: 8 s with no weight penalty and +30 % run. */
  s_gong(a, c) { a.gongT = c.dur; this.burst(this.pos(a), 1.5, c.color, 0.4); }
  /** Pick: every jammed door within 9 m opens; allies in range are cleansed and healed 15. */
  s_unlock(a, c) {
    const p = this.pos(a);
    const doors = this.G.house?.unjam ? this.G.house.unjam(p.x, p.z, c.r) : 0;
    if (doors) this.G.nav?.refreshJams?.();
    let healed = 0;
    for (const o of this.allies()) if (!o.down && dist(this.pos(o), p) <= c.r) { healed += this.heal(o, c.heal); o.stuckT = 0; }
    this.burst(p, c.r, c.color, 0.6);
    return { doors, healed };
  }
  /** Shade: 6 s unseen and unheard. */
  s_vanish(a, c) {
    a.invisT = c.dur;
    for (const f of this.G.foes?.list || []) if (!f.dead && (f.prey === a || (!a.isBot && f.state === 'chase'))) { f.prey = f.prey === a ? null : f.prey; if (!a.isBot) { f.aware = 0; f.lastSeen = null; } }
    this.burst(this.pos(a), 1.2, c.color, 0.4);
  }
  /** Quake: 40 damage and a 1.5 s stun to foes within 3.5 m. */
  s_shock(a, c) {
    const p = this.pos(a), hit = this.foesNear(p, c.r), F = this.G.foes;
    for (const f of hit) {
      const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 1;
      F.hurtFoe(f, c.dmg, { x: dx / d, z: dz / d }, 3);
      if (!f.dead) this.stun(f, c.dur);
    }
    this.burst(p, c.r, c.color, 0.45, 10);
    return { n: hit.length };
  }
  /** Lure: a noisy box lands 4 m ahead and pulls every foe within 16 m to it for 9 s. */
  s_decoy(a, c) {
    const p = this.pos(a), d = this.fwd(a);
    let q = { x: p.x + d.x * c.throw, z: p.z + d.z * c.throw };
    const nav = this.G.nav;
    if (nav && !nav.okW(q.x, q.z)) { let k = c.throw; while (k > 0.5 && !nav.okW(p.x + d.x * k, p.z + d.z * k)) k -= 0.25; q = { x: p.x + d.x * k, z: p.z + d.z * k }; }
    this.dropDecoy(q, c.dur, c.color);
    const hit = this.lureAt(q, c.r, c.dur);
    return { n: hit.length, at: q };
  }
  /** Hook: pulls the nearest downed ally within 9 m to the caster and stands it up. */
  s_rescue(a, c) {
    const p = this.pos(a);
    let best = null, bd = c.r;
    for (const o of this.allies()) if (o !== a && o.down) { const d = dist(this.pos(o), p); if (d <= bd) { bd = d; best = o; } }
    if (!best) return { ok: false, why: 'no downed ally in range' };
    const f = this.fwd(a);
    this.revive(best, { x: p.x + f.x * 0.9, z: p.z + f.z * 0.9 });
    this.burst(p, 1.4, c.color, 0.4);
    return { who: best.isBot ? best.crew : 'player' };
  }
  /** Barb: four shields around the caster keep foes out for 9 s; foes inside are shoved out. */
  s_cage(a, c) {
    const p = this.pos(a);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.8, roughness: 0.35, emissive: 0x203040, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(shieldGeo, mat); const ang = i * Math.PI / 2 + Math.PI / 4; m.position.set(Math.sin(ang) * c.r, 0.8, Math.cos(ang) * c.r); m.rotation.y = ang; g.add(m); }
    g.position.set(p.x, this.gy(p.x, p.z), p.z); this.root.add(g);
    this.cages.push({ x: p.x, z: p.z, r: c.r, t: c.dur, mesh: g });
    let shoved = 0;
    for (const f of this.foesNear(p, c.r + 0.3)) { const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 1; f.knock.x += dx / d * 6; f.knock.z += dz / d * 6; shoved++; }
    return { shoved };
  }
  /** Blink: jump up to 6.5 m along the view, through walls, to the farthest walkable spot; a clone stays behind as a decoy. */
  s_blink(a, c) {
    const p = this.pos(a), d = this.fwd(a), nav = this.G.nav;
    let to = null;
    for (let k = c.r; k >= 1; k -= 0.25) { const x = p.x + d.x * k, z = p.z + d.z * k; if (!nav || nav.okW(x, z)) { to = { x, z }; break; } }
    if (!to) return { ok: false, why: 'no walkable spot ahead' };
    this.dropDecoy(p, c.dur, c.color, true);
    this.lureAt(p, 6, c.dur);
    if (a.isBot) this.G.bots.teleport(a, to.x, to.z);
    else this.G.runner ? this.G.runner.placePlayer({ x: to.x, z: to.z, yaw: this.G.player.yaw }) : this.G.player.body.setTranslation({ x: to.x, y: this.G.player.position.y, z: to.z }, true);
    this.burst(to, 1.2, c.color, 0.35);
    if (this.G.passives?.mine(a, 'nga')) a.invulnT = 3.5;   // Blink's passive: untouchable after the step
    return { from: p, to, dist: +dist(p, to).toFixed(2) };
  }
  /** Oracle: 12 s of every foe, loot and pad on the minimap, torch reach x1.5. */
  s_reveal(a, c) { this.revealT = c.dur; this.burst(this.pos(a), 2, c.color, 0.5); }
  /** Frost: foes within 8 m frozen 4.5 s and take 50 % more damage meanwhile. */
  s_freeze(a, c) {
    const p = this.pos(a), hit = this.foesNear(p, c.r);
    for (const f of hit) { this.stun(f, c.dur); f.vulnT = c.dur; f.frozen = true; }
    this.burst(p, c.r, c.color, 0.6, 8);
    return { n: hit.length };
  }
  /** Magnet: the 2 nearest loose items within 5 m fly in and fuse into one gold bag at the caster's feet. */
  s_pull(a, c) {
    const p = this.pos(a), G = this.G;
    const items = G.loot.items.filter((it) => !it.dead && !it.held && !it.isHead && !it.carrier && dist(it.body.translation(), p) <= c.r)
      .sort((u, v) => dist(u.body.translation(), p) - dist(v.body.translation(), p)).slice(0, c.n);
    if (!items.length) return { ok: false, why: 'no loose loot in range' };
    const value = items.reduce((s, it) => s + it.value, 0);
    for (const it of items) G.loot.destroy(it, false);
    const f = this.fwd(a), at = { x: p.x + f.x * 0.8, z: p.z + f.z * 0.8 };
    const size = value < 1100 ? 'small' : value < 3200 ? 'medium' : 'big';
    const bag = G.loot.spawn({ material: 'metal', size, value, pos: { x: at.x, y: (G.house?.heightAt ? G.house.heightAt(at.x, at.z) : 0) + 0.6, z: at.z } });
    const m = new THREE.MeshStandardMaterial({ color: 0xd8b448, roughness: 0.55, metalness: 0.35, emissive: 0x6a4a08, emissiveIntensity: 0.6 });
    bag.mesh.traverse((o) => { if (o.isMesh) o.material = m; });
    bag.isBag = true;
    this.burst(p, c.r, c.color, 0.45);
    return { n: items.length, value, bag };
  }
  /** Seraph: everyone downed stands up, and nobody in the crew can go down for 5 s. */
  s_angel(a, c) {
    const p = this.pos(a);
    let revived = 0;
    for (const o of this.allies()) { if (o.down && this.revive(o, o.isBot ? null : p)) revived++; o.noDownT = c.dur; }
    this.burst(p, 3, c.color, 0.6, 9);
    return { revived };
  }

  // ---- shared effects
  stun(f, t) { if (f.def.boss) return; f.stunT = Math.max(f.stunT || 0, t); f.atk = 0; if (f.state === 'attack') { f.swingT = 0; this.G.foes.setState(f, 'recover'); } if (f.state === 'sleep') f.sleep = Math.max(f.sleep, t); }
  lureAt(q, r, t) {
    const F = this.G.foes; const hit = this.foesNear(q, r, (f) => f.def.speed > 0);
    for (const f of hit) { F.wake(f); f.lure = { x: q.x, z: q.z }; f.lureT = t; f.aware = 0; f.lastSeen = null; f.prey = null; }
    this.G.noise?.emit({ x: q.x, z: q.z, r: Math.min(r, 12), str: 1.5, src: 'decoy' });
    return hit;
  }
  dropDecoy(q, t, color, clone = false) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(clone ? new THREE.CapsuleGeometry(0.22, 0.7, 4, 10) : boxGeo, new THREE.MeshStandardMaterial({ color: clone ? color : 0xb07a3a, transparent: clone, opacity: clone ? 0.55 : 1, roughness: 0.6, emissive: clone ? color : 0x000000, emissiveIntensity: clone ? 0.6 : 0 }));
    box.position.y = clone ? 0.6 : 0.13; box.castShadow = true; g.add(box);
    const light = new THREE.PointLight(color, 2.5, 4, 2); light.position.y = 0.6; g.add(light);
    g.position.set(q.x, this.gy(q.x, q.z), q.z); this.root.add(g);
    this.decoys.push({ x: q.x, z: q.z, t, mesh: g, light, ph: 0 });
  }
  burst(p, r, color, life = 0.5, rise = 0) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(p.x, this.gy(p.x, p.z) + 0.08, p.z); this.root.add(mesh);
    const light = new THREE.PointLight(color, rise || 4, r * 1.6, 2); light.position.set(p.x, 1.2, p.z); this.root.add(light);
    this.fx.push({ mesh, light, r, t: 0, life });
  }

  // ---- per physics tick
  step(dt) {
    for (const [a, t] of this.cd) if (t > 0) this.cd.set(a, Math.max(0, t - dt));
    for (const a of this.allies()) {
      if (a.invisT > 0) a.invisT = Math.max(0, a.invisT - dt);
      if (a.noDownT > 0) a.noDownT = Math.max(0, a.noDownT - dt);
      if (a.gongT > 0) a.gongT = Math.max(0, a.gongT - dt);
      if (a.invulnT > 0) a.invulnT = Math.max(0, a.invulnT - dt);
    }
    if (this.revealT > 0) this.revealT = Math.max(0, this.revealT - dt);
    const torch = this.G.torch;
    if (torch) { if (torch.userData.d0 === undefined) torch.userData.d0 = torch.distance; torch.distance = torch.userData.d0 * (this.revealT > 0 ? CREW.khoi.torch : 1) * (this.G.passives?.seeMul() ?? 1); }   // Oracle: reveal x1.5, passive x1.15
    for (const z of this.rings) {
      z.t -= dt;
      for (const o of this.allies()) if (!o.down && dist(this.pos(o), z) <= z.r) this.heal(o, z.hps * dt);
    }
    for (const c of this.cages) c.t -= dt;
    for (const d of this.decoys) d.t -= dt;
    this.prune();
  }
  prune() {
    const gone = (arr) => arr.filter((z) => { if (z.t > 0) return true; this.root.remove(z.mesh); return false; });
    this.rings = gone(this.rings); this.cages = gone(this.cages); this.decoys = gone(this.decoys);
  }
  /** Render-rate animation of the visual effects. */
  render(dt) {
    for (const x of this.fx) {
      x.t += dt; const k = Math.min(1, x.t / x.life);
      x.mesh.scale.setScalar(0.2 + x.r * Math.sqrt(k)); x.mesh.material.opacity = 0.9 * (1 - k); x.light.intensity *= 0.85;
      if (k >= 1) { this.root.remove(x.mesh, x.light); x.mesh.material.dispose(); x.dead = true; }
    }
    if (this.fx.some((x) => x.dead)) this.fx = this.fx.filter((x) => !x.dead);
    for (const z of this.rings) z.mesh.material.opacity = 0.35 + 0.25 * Math.sin(performance.now() / 160);
    for (const d of this.decoys) { d.ph += dt; d.light.intensity = Math.sin(d.ph * 14) > 0 ? 3 : 0.4; }
  }
  /** House change: drop zones and effects, keep cooldowns. */
  clear() {
    for (const arr of [this.rings, this.cages, this.decoys]) for (const z of arr) this.root.remove(z.mesh);
    for (const x of this.fx) this.root.remove(x.mesh, x.light);
    this.rings = []; this.cages = []; this.decoys = []; this.fx = []; this.revealT = 0;
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
