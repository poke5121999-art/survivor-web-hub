// Station gear (design-inventory section 7, station_gear.json): one gear slot (HUD slot 4), key F uses it.
//   gun   pistol, 62 damage to the first foe on the line of sight, 20 shots, loud
//   bat   melee swing, 30 damage + knockback to foes within 1.7 m ahead, 12 swings
//   tranq dart, the first foe on the line sleeps 12 s (the ghost shrugs it off), 3 darts
//   pry   pry bar: hold F at a jammed door within 2.2 m for 2 s (Pick's passive: 1 s), 3 doors
//   stun  stun grenade: thrown 6 m, 1.4 s fuse, foes within 3.5 m sleep 6 s, no loot damage, 2 grenades
// Buying a different gear swaps it; the same gear adds its uses.
import * as THREE from '../vendor/three.module.min.js';

export const GEAR = {
  gun: { name: 'Súng lục', price: 9000, uses: 20, dmg: 62, range: 18, noise: 14, cd: 0.35 },
  bat: { name: 'Gậy', price: 8000, uses: 12, dmg: 30, reach: 1.7, cone: 0.7, knock: 6, cd: 0.6 },
  tranq: { name: 'Thuốc mê', price: 12000, uses: 3, sleep: 12, range: 16, cd: 0.8 },
  pry: { name: 'Xà beng', price: 5000, uses: 3, range: 2.2, hold: 2, cd: 0.3 },
  stun: { name: 'Lựu đạn choáng', price: 5500, uses: 2, throw: 6, fuse: 1.4, r: 3.5, sleep: 6, cd: 0.8 },
};
export const GEAR_IDS = Object.keys(GEAR);

export class Gear {
  constructor(G) {
    this.G = G;
    this.id = null; this.uses = 0;
    this.cdT = 0; this.pryT = 0; this.pryDoor = null;
    this.grenades = [];
    this.log = [];
    this.root = new THREE.Group(); this.root.name = 'gear'; G.scene.add(this.root);
    this.flash = new THREE.PointLight(0xffd08a, 0, 6, 2); this.root.add(this.flash);
  }

  give(id, uses = GEAR[id]?.uses) {
    if (!GEAR[id]) throw new Error('gear not found: ' + id);
    if (this.id === id) this.uses += uses; else { this.id = id; this.uses = uses; }
    this.log.push(['give', id, this.uses]);
  }
  clear() { this.id = null; this.uses = 0; }
  spend() { if (--this.uses <= 0) this.clear(); }

  /** The first awake-or-asleep foe on the view line within range, with grid line of sight. */
  aimFoe(range) {
    const G = this.G, P = G.player, p = P.position, f = P.forward(new THREE.Vector3());
    const h = Math.hypot(f.x, f.z) || 1, dx = f.x / h, dz = f.z / h;
    let best = null, bt = range;
    for (const o of G.foes?.list || []) {
      if (o.dead) continue;
      const rx = o.x - p.x, rz = o.z - p.z, t = rx * dx + rz * dz;
      if (t <= 0 || t > bt) continue;
      if (Math.abs(rx * dz - rz * dx) > o.r + 0.3) continue;
      if (o.def.beh !== 'ghost' && !G.foes.nav.los(p.x, p.z, o.x, o.z)) continue;
      bt = t; best = o;
    }
    return best;
  }

  /** Per physics tick. use: F tapped, hold: F held. */
  step(dt, use, hold) {
    const G = this.G, P = G.player;
    this.cdT = Math.max(0, this.cdT - dt);
    this.flash.intensity *= Math.exp(-dt * 30);
    this.stepGrenades(dt);
    if (!this.id || P.down) { this.pryT = 0; return; }
    const g = GEAR[this.id];
    if (this.id === 'pry') return this.stepPry(dt, hold, g);
    if (this.id === 'bat' && G.melee) return;   // the bat swings through js/melee.js (feel, timing); F there is a tap
    if (!use || this.cdT > 0) return;
    this.cdT = g.cd;
    this[this.id](g);
  }

  gun(g) {
    const G = this.G, P = G.player, f = this.aimFoe(g.range);
    this.flash.position.copy(P.camPos); this.flash.intensity = 6;
    G.noise?.emit({ x: P.position.x, z: P.position.z, r: g.noise, str: 2, src: 'gun', mine: true });
    if (f) { const d = Math.hypot(f.x - P.position.x, f.z - P.position.z) || 1; G.foes.hurtFoe(f, g.dmg, { x: (f.x - P.position.x) / d, z: (f.z - P.position.z) / d }, 1.5); if (!f.dead && f.state === 'sleep') G.foes.wake(f); }
    this.log.push(['gun', f ? f.kind : null]); G.events.emit('gear:use', { id: 'gun', hit: !!f });
    this.spend();
  }
  bat(g) {
    const G = this.G, P = G.player, p = P.position, fw = P.forward(new THREE.Vector3());
    const h = Math.hypot(fw.x, fw.z) || 1, dx = fw.x / h, dz = fw.z / h;
    const hits = (G.foes?.list || []).filter((f) => { if (f.dead) return false; const rx = f.x - p.x, rz = f.z - p.z, d = Math.hypot(rx, rz); return d < g.reach + f.r && (rx * dx + rz * dz) / (d || 1) > Math.cos(g.cone); });
    for (const f of hits) { const d = Math.hypot(f.x - p.x, f.z - p.z) || 1; G.foes.hurtFoe(f, g.dmg, { x: (f.x - p.x) / d, z: (f.z - p.z) / d }, g.knock); G.passives?.chill(f, P); }
    G.noise?.emit({ x: p.x, z: p.z, r: 4, str: 1.2, src: 'swing', mine: true });
    this.log.push(['bat', hits.length]); G.events.emit('gear:use', { id: 'bat', hit: hits.length > 0 });
    this.spend();
  }
  tranq(g) {
    const f = this.aimFoe(g.range);
    if (f && f.def.beh !== 'ghost') this.sleep(f, g.sleep);
    this.log.push(['tranq', f ? f.kind : null]); this.G.events.emit('gear:use', { id: 'tranq', hit: !!f });
    this.spend();
  }
  sleep(f, t) {
    const F = this.G.foes;
    if (f.def.boss) { F.bossStun(f, t); return; }   // bosses: stunned 1.2 s at most, then 4 s immune (bosses.js)
    f.prey = null; f.aware = 0; f.lastSeen = null; f.target = null; f.atk = 0; f.lureT = 0;
    F.setState(f, 'sleep'); f.sleep = t; f.noiseId = this.G.noise?.lastId() || 0;
  }
  stepPry(dt, hold, g) {
    const G = this.G, p = G.player.position;
    const door = G.house?.doorRecs?.filter((d) => d.jammed && Math.hypot(d.cx - p.x, d.cz - p.z) <= g.range).sort((a, b) => Math.hypot(a.cx - p.x, a.cz - p.z) - Math.hypot(b.cx - p.x, b.cz - p.z))[0];
    if (!hold || !door) { this.pryT = 0; this.pryDoor = null; return; }
    if (door !== this.pryDoor) { this.pryDoor = door; this.pryT = 0; }
    this.pryT += dt * (G.passives?.pryMul(G.player) ?? 1);   // Pick's passive: twice as fast
    if (this.pryT >= g.hold) {
      G.house.unjam(door.cx, door.cz, 0.5); G.nav?.refreshJams?.();
      G.noise?.emit({ x: door.cx, z: door.cz, r: 11, str: 1.6, src: 'door', mine: true });
      this.log.push(['pry', +this.pryT.toFixed(2)]); G.events.emit('gear:use', { id: 'pry', hit: true });
      this.pryT = 0; this.pryDoor = null; this.spend();
    }
  }
  stun(g) {
    const G = this.G, P = G.player, p = P.position, fw = P.forward(new THREE.Vector3());
    const h = Math.hypot(fw.x, fw.z) || 1, dx = fw.x / h, dz = fw.z / h, nav = G.foes?.nav;
    let k = g.throw; while (k > 0.5 && nav && !nav.okW(p.x + dx * k, p.z + dz * k)) k -= 0.25;
    const to = { x: p.x + dx * k, z: p.z + dz * k };
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.5, metalness: 0.5, emissive: 0x204020 }));
    this.root.add(mesh);
    this.grenades.push({ from: { x: p.x, y: P.camPos.y - 0.2, z: p.z }, to, t: 0, fuse: g.fuse, g, mesh });
    this.log.push(['throw', 'stun']); G.events.emit('gear:use', { id: 'stun', hit: false });
    this.spend();
  }
  stepGrenades(dt) {
    for (const n of this.grenades) {
      n.t += dt;
      const k = Math.min(1, n.t / 0.6);
      n.mesh.position.set(n.from.x + (n.to.x - n.from.x) * k, n.from.y * (1 - k) + 0.07 + Math.sin(k * Math.PI) * 1.1, n.from.z + (n.to.z - n.from.z) * k);
      if (n.t >= n.fuse) {
        const hit = (this.G.foes?.list || []).filter((f) => !f.dead && f.def.beh !== 'ghost' && Math.hypot(f.x - n.to.x, f.z - n.to.z) <= n.g.r);
        // the bang first: sleep() then marks it as heard, so the blast does not wake the foes it just put down
        this.G.noise?.emit({ x: n.to.x, z: n.to.z, r: 8, str: 1.5, src: 'bang', mine: true });
        for (const f of hit) this.sleep(f, n.g.sleep);
        this.G.skills?.burst(n.to, n.g.r, 0xd8e8ff, 0.5, 10);
        this.log.push(['bang', hit.length]); this.G.events.emit('gear:bang', { at: n.to, n: hit.length });
        this.root.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh.material.dispose(); n.dead = true;
      }
    }
    if (this.grenades.some((n) => n.dead)) this.grenades = this.grenades.filter((n) => !n.dead);
  }
}
