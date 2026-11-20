// Floor traps (parity.md priority 4): the 8 kinds the room prefabs place (housegen.js traps[]: cell, kind, dir 0..3 =
// +x/-x/+z/-z, len cells). docs/design-inventory.md section 7: spike cycles sleep -> warn -> strike (loot 3 %/tick),
// laser beam (2 %), fire jet 4-6 tiles (FIRE_DMG 7 per tick, 1.5 %), gas jet 5-7 tiles (poison 2 dps for 3 s), ice
// (BANG_DMG 5, freeze 1 s, slow, 5 %), poison puddle (2/s), mud (slows), smoke (blinds, room-wide, turns on when someone
// enters; the only one you can switch off: hit its vent hole). Traps are loud when they hit someone; they cycle by time with
// a phase from their cell. Loot already on a pad is immune. The joker rushes whoever a trap touches.
// New rule for the 3D jump (trail.tsv jump): a trap only works on someone standing on the floor, you can jump over it.
// Every number not quoted above is "chưa xác định" (parity.md): set so the trap works, to be checked against Unity.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

export const TRAP = {
  tick: 0.5,   // damage tick (chưa xác định)
  spike: { period: 3.2, warn: 0.7, on: 0.5, dmg: 15, loot: 0.03, half: 0.8 },
  laser: { period: 4, warn: 0.6, on: 1.6, dmg: 6, loot: 0.02, y: 0.55 },
  fire: { period: 4, warn: 0.6, on: 1.8, dmg: 7, loot: 0.015, y: 0.5 },
  gas: { period: 5, warn: 0.6, on: 1.8, poisonDps: 2, poisonT: 3, y: 0.5 },
  ice: { period: 4.5, warn: 0.6, on: 0.6, dmg: 5, freeze: 1, slow: 0.6, slowT: 2, loot: 0.05, half: 0.9 },
  poison: { dps: 2, r: 1.1 },
  mud: { slow: 0.5, r: 1.2 },
  smoke: { blind: 0.85, ventR: 0.9 },
  noiseR: 8,
};
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Traps {
  constructor(G, house) {
    this.G = G; this.house = house; this.time = 0; this.log = [];
    const L = house.layout;
    this.root = new THREE.Group(); this.root.name = 'traps'; G.scene.add(this.root);
    this.list = (L.traps || []).map((t, i) => this.build(t, i)).filter(Boolean);
    this.acc = 0;
  }
  hAt(x, z) { return this.house.heightAt ? this.house.heightAt(x, z) : 0; }

  build(t, i) {
    const cx = t.x + 0.5, cz = t.y + 0.5, d = DIRS[t.dir] || DIRS[0], C = TRAP[t.kind]; if (!C) return null;
    const y = this.hAt(cx, cz);
    // the phase comes from the cell (the same for every player in co-op)
    const phase = ((t.x * 73856093) ^ (t.y * 19349663)) >>> 0;
    const tr = { ...t, i, cx, cz, y, d, len: Math.max(2, t.len || 4), C, phase: (phase % 1000) / 1000, room: this.house.layout.rooms?.[t.roomId], on: t.kind !== 'smoke', state: 'sleep', g: new THREE.Group() };
    // a beam stops at the first wall
    if (t.kind === 'laser' || t.kind === 'fire' || t.kind === 'gas') { let n = 0; for (let k = 1; k <= tr.len; k++) { const x = cx + d[0] * k, z = cz + d[1] * k; if (!this.walk(x, z)) break; n = k; } tr.reach = n + 0.45; }
    this.mesh(tr); tr.g.position.set(cx, y, cz); this.root.add(tr.g);
    return tr;
  }
  walk(x, z) { const L = this.house.layout, gx = Math.floor(x), gz = Math.floor(z); const g = L.grid[gz * L.w + gx]; return (g === 1 || g === 3) && !L.block[gz * L.w + gx]; }

  mesh(tr) {
    const g = tr.g, M = (o) => new THREE.MeshStandardMaterial(o), B = (o) => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, ...o });
    const steel = M({ color: 0x5a5f66, roughness: 0.5, metalness: 0.7 });
    const yaw = Math.atan2(tr.d[0], tr.d[1]);
    switch (tr.kind) {
      case 'spike': {
        const h = tr.C.half;
        g.add(new THREE.Mesh(new THREE.BoxGeometry(h * 2, 0.04, h * 2), steel));
        tr.glow = new THREE.Mesh(new THREE.PlaneGeometry(h * 2 - 0.1, h * 2 - 0.1).rotateX(-Math.PI / 2), B({ color: 0xff3020, opacity: 0 })); tr.glow.position.y = 0.025; g.add(tr.glow);
        tr.spikes = new THREE.Group(); const sp = M({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 }), cone = new THREE.ConeGeometry(0.05, 0.42, 6);
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const m = new THREE.Mesh(cone, sp); m.position.set(a * h * 0.38, 0.21, b * h * 0.38); tr.spikes.add(m); }
        tr.spikes.position.y = -0.45; g.add(tr.spikes); break;
      }
      case 'laser': case 'fire': case 'gas': {
        const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.25, 10), steel); nz.rotation.x = Math.PI / 2; nz.rotation.z = 0; nz.position.y = tr.C.y;
        const holder = new THREE.Group(); holder.rotation.y = yaw; holder.add(nz); g.add(holder);
        const col = tr.kind === 'laser' ? 0xff2020 : tr.kind === 'fire' ? 0xff8a20 : 0x7aff60;
        // a jet: narrow at the nozzle, wide at the end (the cone's tip turned to the nozzle), a hotter core inside
        const jet = (r) => { const g2 = new THREE.ConeGeometry(r, 1, 14, 1, true); g2.rotateX(Math.PI); g2.translate(0, 0.5, 0); g2.rotateX(Math.PI / 2); return g2; };
        const geo = tr.kind === 'laser' ? new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2) : jet(0.45);
        tr.beam = new THREE.Mesh(geo, B({ color: col, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        tr.beam.position.y = tr.C.y; tr.beam.scale.set(1, 1, tr.reach); holder.add(tr.beam);
        if (tr.kind !== 'laser') { tr.core = new THREE.Mesh(jet(0.2), B({ color: tr.kind === 'fire' ? 0xfff0a0 : 0xd8ffc0, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); tr.core.position.y = tr.C.y; tr.core.scale.set(1, 1, tr.reach * 0.7); holder.add(tr.core); }
        tr.tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), B({ color: col, opacity: 0 })); tr.tip.position.set(0, tr.C.y, 0.14); holder.add(tr.tip);
        break;
      }
      case 'ice': {
        const h = tr.C.half;
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 12), steel));
        tr.burst = new THREE.Mesh(new THREE.CylinderGeometry(h, h * 0.6, 0.6, 16, 1, true), B({ color: 0xa8e8ff, opacity: 0, side: THREE.DoubleSide })); tr.burst.position.y = 0.3; g.add(tr.burst);
        tr.glow = new THREE.Mesh(new THREE.CircleGeometry(h, 24).rotateX(-Math.PI / 2), B({ color: 0x60c8ff, opacity: 0 })); tr.glow.position.y = 0.02; g.add(tr.glow);
        break;
      }
      case 'poison': case 'mud': {
        const r = tr.C.r, col = tr.kind === 'poison' ? 0x24602a : 0x4a3220;
        const pd = new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), M({ color: col, roughness: tr.kind === 'poison' ? 0.08 : 0.95, metalness: tr.kind === 'poison' ? 0.3 : 0, emissive: tr.kind === 'poison' ? 0x0a2a0c : 0, transparent: true, opacity: 0.88 }));
        pd.position.y = 0.012; pd.scale.set(1, 1, 0.75 + 0.2 * tr.phase); g.add(pd); tr.puddle = pd;
        break;
      }
      case 'smoke': {
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.1, 14), steel); v.position.y = 0.05; g.add(v);
        const grate = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14).rotateX(-Math.PI / 2), M({ color: 0x111214, roughness: 0.9 })); grate.position.y = 0.105; g.add(grate);
        tr.puff = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), B({ color: 0x9aa0a6, opacity: 0 })); tr.puff.position.y = 0.6; g.add(tr.puff);
        tr.on = false; tr.broken = false; break;
      }
    }
  }

  /** Where in its cycle: 'sleep' | 'warn' | 'on' (spike, laser, fire, gas, ice). Puddles are always on; smoke on/off. */
  cycle(tr) {
    const C = tr.C; if (!C.period) return 'on';
    const t = (this.time + tr.phase * C.period) % C.period, a = C.period - C.warn - C.on;
    return t < a ? 'sleep' : t < a + C.warn ? 'warn' : 'on';
  }
  /** Is (x, z) in the trap's area (beams: along the jet up to the first wall). */
  inside(tr, x, z, pad = 0) {
    const dx = x - tr.cx, dz = z - tr.cz;
    if (tr.kind === 'spike' || tr.kind === 'ice') return Math.max(Math.abs(dx), Math.abs(dz)) < tr.C.half + pad;
    if (tr.kind === 'poison' || tr.kind === 'mud') return Math.hypot(dx, dz) < tr.C.r + pad;
    if (tr.kind === 'smoke') { const r = tr.room; return r ? x >= r.x && x < r.x + r.w && z >= r.y && z < r.y + r.h : false; }
    const along = dx * tr.d[0] + dz * tr.d[1], side = Math.abs(dx * tr.d[1] - dz * tr.d[0]), w = tr.kind === 'laser' ? 0.12 : 0.35 + 0.1 * Math.max(0, along);
    return along > 0.1 && along < tr.reach && side < w + pad;
  }

  step(dt) {
    const G = this.G, P = G.player; this.time += dt;
    this.acc += dt; const tick = this.acc >= TRAP.tick; if (tick) this.acc -= TRAP.tick;
    const p = P && !P.down ? P.position : null, feet = p ? p.y - CFG.player.halfHeight - CFG.player.radius : 0;
    // player effects are set fresh each step by the traps the player stands in
    if (P) { P.inMud = false; P.inSmoke = false; }
    // the gas jet's poison: 2 hp/s for 3 s after it touched you
    if (P && P.poisonT > 0) { P.poisonT = Math.max(0, P.poisonT - dt); if (tick && !P.down) P.hurt(TRAP.gas.poisonDps * TRAP.tick, { x: 0, z: 0, kind: 'trap:gas' }); }
    for (const tr of this.list) {
      const prev = tr.state; tr.state = tr.kind === 'smoke' ? (tr.on ? 'on' : 'sleep') : this.cycle(tr);
      if (tr.state === 'warn' && prev !== 'warn' && p && Math.hypot(p.x - tr.cx, p.z - tr.cz) < 9) G.audio?.play(tr.kind === 'spike' ? 'aim_beep' : 'hum', { x: tr.cx, y: tr.y + 0.3, z: tr.cz }, 0.25, tr.kind === 'spike' ? 0.8 : 1.6);
      if (tr.state === 'on' && prev !== 'on' && p && Math.hypot(p.x - tr.cx, p.z - tr.cz) < 12) G.audio?.play(tr.kind === 'spike' ? 'punch_wall' : tr.kind === 'ice' ? 'break_ceramic' : 'whoosh', { x: tr.cx, y: tr.y + 0.3, z: tr.cz }, 0.6, tr.kind === 'spike' ? 1.4 : 1);
      // the smoke trap switches on when someone walks into its room
      if (tr.kind === 'smoke' && !tr.broken && !tr.on && p && this.inside(tr, p.x, p.z) && Math.abs(feet - tr.y) < 1.2) { tr.on = true; this.log.push(['smoke', 'on', tr.i]); G.events.emit('trap:smoke', { trap: tr, on: true }); }
      // on someone standing on the floor (not in the air: you can jump over a trap)
      if (p && P.grounded && Math.abs(feet - tr.y) < 0.6 && this.inside(tr, p.x, p.z)) this.affect(tr, P, tick);
      if (tick && (tr.state === 'on') && tr.C.loot) this.lootHit(tr);
    }
  }
  affect(tr, P, tick) {
    const G = this.G, C = tr.C, k = tr.kind;
    if (k === 'mud') { P.inMud = true; return; }
    if (k === 'smoke') { if (tr.on) P.inSmoke = true; return; }
    if (k === 'poison') { if (tick) this.hurt(tr, C.dps * TRAP.tick, P); return; }
    if (tr.state !== 'on') return;
    if (k === 'spike') { if (tr.struck !== Math.floor((this.time + tr.phase * C.period) / C.period)) { tr.struck = Math.floor((this.time + tr.phase * C.period) / C.period); this.hurt(tr, C.dmg, P); } return; }
    if (k === 'ice') { if (tr.struck !== Math.floor((this.time + tr.phase * C.period) / C.period)) { tr.struck = Math.floor((this.time + tr.phase * C.period) / C.period); this.hurt(tr, C.dmg, P); P.freezeT = C.freeze; P.iceSlowT = C.freeze + C.slowT; } return; }
    if (k === 'gas') { if (!(P.poisonT > 0)) this.touched(tr, P); P.poisonT = C.poisonT; return; }
    if (tick) this.hurt(tr, C.dmg, P);   // laser, fire: per tick in the beam
  }
  hurt(tr, dmg, P) {
    const G = this.G;
    P.hurt(dmg, { x: tr.cx, z: tr.cz, kind: 'trap:' + tr.kind });
    this.touched(tr, P);
    this.log.push(['hit', tr.kind, +dmg.toFixed(1), +this.time.toFixed(2)]);
  }
  /** Someone got touched by a trap: loud, and the joker comes. */
  touched(tr, P) {
    const G = this.G;
    if ((tr.loudAt || -9) < this.time - 1) { tr.loudAt = this.time; G.noise?.emit({ x: tr.cx, z: tr.cz, r: TRAP.noiseR, str: 1.5, src: 'trap' }); }
    G.foes?.jokerRush?.('P');
    G.events.emit('trap:touch', { trap: tr, who: 'P' });
  }
  /** Loot in an active trap loses a share of its first value each tick (frag scales it); loot on a pad is immune. */
  lootHit(tr) {
    const G = this.G, pads = G.extract?.pads || [];
    for (const it of G.loot?.items || []) {
      if (it.dead || it.held && false) continue;
      const t = it.body.translation(); if (Math.abs(t.y - tr.y) > 1.2 || !this.inside(tr, t.x, t.z, 0.15)) continue;
      if (pads.some((pd) => Math.abs(t.x - pd.x) <= pd.half && Math.abs(t.z - pd.z) <= pd.half)) continue;
      if (tr.kind === 'spike' && tr.lootStruck?.get(it) === Math.floor((this.time + tr.phase * tr.C.period) / tr.C.period)) continue;
      if (tr.kind === 'spike') (tr.lootStruck ||= new Map()).set(it, Math.floor((this.time + tr.phase * tr.C.period) / tr.C.period));
      const mat = CFG.loot.materials[it.material]; if (!mat) continue;
      const lost = Math.min(it.value, Math.max(1, Math.round(it.value0 * mat.frag * tr.C.loot)));
      it.value -= lost; it.hitAt = G.loot.time;
      G.events.emit('loot:hit', { item: it, lost, dv: 0, point: { x: t.x, y: t.y, z: t.z }, by: 'trap:' + tr.kind });
      this.log.push(['loot', tr.kind, lost, mat.frag]);
      if (it.value <= 0) G.loot.destroy(it, true);
    }
  }
  /** A blow on a smoke trap's vent hole switches it off for good (melee.js asks). */
  hitVent(x, z) {
    for (const tr of this.list) if (tr.kind === 'smoke' && !tr.broken && Math.hypot(x - tr.cx, z - tr.cz) < TRAP.smoke.ventR) {
      tr.broken = true; tr.on = false; this.log.push(['smoke', 'off', tr.i]); this.G.events.emit('trap:smoke', { trap: tr, on: false });
      this.G.audio?.play('punch_wall', { x: tr.cx, y: tr.y + 0.1, z: tr.cz }, 0.9, 0.8); return true;
    }
    return false;
  }

  render(dt) {
    const t = this.time, P = this.G.player;
    for (const tr of this.list) {
      const st = tr.state, C = tr.C;
      if (tr.kind === 'spike') { tr.spikes.position.y = st === 'on' ? -0.03 : st === 'warn' ? -0.36 : -0.45; tr.glow.material.opacity = st === 'warn' ? 0.35 + 0.3 * Math.sin(t * 30) : 0; }
      else if (tr.beam) {
        const on = st === 'on', warn = st === 'warn';
        tr.beam.material.opacity = on ? (tr.kind === 'laser' ? 0.9 : 0.22 + 0.12 * Math.random()) : 0;
        if (tr.core) { tr.core.material.opacity = on ? 0.35 + 0.2 * Math.random() : 0; tr.core.scale.set(0.8 + 0.4 * Math.random(), 0.8 + 0.4 * Math.random(), tr.reach * (0.55 + 0.2 * Math.random())); }
        if (tr.kind !== 'laser') tr.beam.scale.set(0.8 + 0.4 * Math.random(), 0.8 + 0.4 * Math.random(), tr.reach * (0.9 + 0.1 * Math.random()));
        tr.tip.material.opacity = warn ? 0.5 + 0.5 * Math.sin(t * 25) : on ? 0.9 : 0.15;
      } else if (tr.kind === 'ice') { tr.burst.material.opacity = st === 'on' ? 0.5 : 0; tr.glow.material.opacity = st === 'warn' ? 0.3 + 0.3 * Math.sin(t * 25) : st === 'on' ? 0.6 : 0.05; }
      else if (tr.kind === 'smoke') { tr.puff.material.opacity = tr.on ? 0.25 + 0.1 * Math.sin(t * 3) : 0; tr.puff.scale.setScalar(tr.on ? 1.4 + 0.3 * Math.sin(t * 2) : 1); }
    }
    // smoke blinds: a grey veil over the screen while you stand in a smoking room (DOM, no words)
    const root = document.querySelector('.hx');
    if (root) {
      if (!this.veil) { const e = this.veil = document.createElement('div'); e.className = 'hx-smoke'; Object.assign(e.style, { position: 'absolute', inset: '0', pointerEvents: 'none', background: 'radial-gradient(circle at 50% 55%, rgba(150,155,160,0.75), rgba(120,124,128,0.95))', opacity: '0', transition: 'opacity 0.4s' }); root.appendChild(e); }
      this.veil.style.opacity = P?.inSmoke ? String(TRAP.smoke.blind) : '0';
    }
  }
  dispose() { this.G.scene.remove(this.root); this.veil?.remove(); }
}
