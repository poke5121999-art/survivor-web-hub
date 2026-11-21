// Melee for the player: bare robot fists (the 2D game's empty hand: damage = the character's atk) and any melee gear
// (the bat now; later melee weapons pass their own numbers). Right mouse: tap = a jab, hold = charge a power hit.
// Fists alternate left / right, the third hit of a chain lands harder. While holding loot the hands are busy.
//   numbers from the source: fist damage = CREW[id].atk (design-inventory 6), plain punch knock 106.67 px/s = 4.44 m/s
//   (plainHitKnock, 3), light foes knockMul 3. Not in the inventory (parity.md "chưa xác định"): per-character melee
//   reach atkR and cooldown atkCd (the bots' 1.15 m / 0.9 s are used), which foes are "light" (hp <= 50 used here).
// Feel (new, every melee hit): a windup / strike / recover rhythm on first-person Lóc Cóc arms in the character's colours,
// hit-stop 50-90 ms (heavier on a power hit), camera kick and FOV punch along the blow, sparks and metal flakes, the foe
// flashes white, staggers and spins back (light foes fly; slamming a wall adds a second beat), synthesized whoosh /
// clank + thud / wall thump / door knock, gamepad rumble. No text and no damage numbers.
import * as THREE from '../vendor/three.module.min.js';
import { crewColors } from './robots.js';
import { CREW } from './skills.js';
import { GEAR } from './gear.js';

export const MELEE = {
  // 3D feel (batch 6f, owner: "đấm như đấm vào không khí"): reach from the eye 1.6 m + the foe's radius, a 0.9 rad cone, a
  // jab every 0.4 s; the 2D game's damage per second is kept (a hit = atk x 0.4 / 0.9, atkCd 0.9 in the source), every blow
  // answers: foe, loot, cart, door, decor (light things on it jump), wall, and a miss swings through with a whoosh
  fist: { reach: 1.6, cd: 0.4, cone: 0.9, knock: 106.67 / 24, noise: 3, srcCd: 0.9, ball: 0.12 },
  // a punched item leaves at lootLaunch / sqrt(kg) m/s along the floor (small 2 kg: 6 m/s, medium 6 kg: 3.5, big 14.5 kg: 2.2)
  // plus a hop up (0.45 x that + lootHop): light things fly, heavy ones bounce (R.E.P.O.-like)
  lootLaunch: 8.5, lootMinH: 1.6, lootMaxH: 7, lootHop: 1.8,
  bat: { cone: 0.7 },                     // reach, damage, knock come from GEAR.bat (gear.js)
  lightKnockMul: 3, lightHp: 50,
  chainWindow: 1.4, chainMul: 1.5,       // the 3rd hit of a chain inside the window
  chargeAfter: 0.2, chargeFull: 1.0, chargeDmg: 1.5, chargeKnock: 1.2,   // power hit: x(1 + k * mul), k 0..1
  windup: 0.07, strike: 0.09, recover: 0.24,
  stop: [0.05, 0.09],                    // hit-stop s: plain .. full power
};
const isLight = (f) => f.maxHp <= MELEE.lightHp && !f.def.immune;

export class Melee {
  constructor(G) {
    this.G = G;
    this.cdT = 0; this.side = 0; this.chain = 0; this.chainT = 0;
    this.holdT = -1; this.swing = null; this.log = [];
    this.kick = { x: 0, y: 0, roll: 0, fov: 0, shake: 0 };
    this.fov0 = G.camera.fov;
    this.buildArms();
    this.fx = new HitFx(G.scene);
  }

  // ---------------------------------------------------------------- arms (camera space)
  buildArms() {
    const G = this.G, vm = this.vm = new THREE.Group(); vm.name = 'viewmodel';
    G.camera.add(vm);
    this.mats = { m: mat(0xe07a1f, 0.45, 0.35), s: mat(0x30343a, 0.6, 0.55), a: mat(0xf2c230, 0.4, 0.3), bolt: mat(0x9aa0a6, 0.3, 0.9) };
    this.mats.g = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb040, emissiveIntensity: 1.6, roughness: 0.5, depthTest: false, depthWrite: false });
    this.arms = [-1, 1].map((sd) => {
      const pivot = new THREE.Group(), M = this.mats;
      // forearm: a tapered can with a top plate, rivets and a glow strip (the Lóc Cóc worker look), a dark wrist joint
      const fore = part(new THREE.CylinderGeometry(0.058, 0.07, 0.34, 14), M.m); fore.rotation.x = Math.PI / 2; fore.position.z = 0.12;
      const plate = part(new THREE.BoxGeometry(0.075, 0.022, 0.24), M.a); plate.position.set(0, 0.062, 0.12);
      const strip = part(new THREE.BoxGeometry(0.012, 0.012, 0.2), M.g); strip.position.set(sd * 0.05, 0.035, 0.12);
      const wrist = part(new THREE.CylinderGeometry(0.052, 0.056, 0.05, 14), M.s); wrist.rotation.x = Math.PI / 2; wrist.position.z = -0.065;
      const cuff = part(new THREE.TorusGeometry(0.066, 0.01, 6, 18), M.a); cuff.position.z = -0.045;
      const rivets = [[0.03, 0.074, 0.03], [-0.03, 0.074, 0.03], [0.03, 0.074, 0.2], [-0.03, 0.074, 0.2]].map(([x, y, z]) => { const r = part(new THREE.SphereGeometry(0.008, 6, 4), M.bolt); r.position.set(x, y, z); return r; });
      // fist: a rounded mitt with four knuckle caps, a thumb and a back plate
      const fist = new THREE.Group(); fist.position.z = -0.15;
      const mitt = part(new THREE.SphereGeometry(1, 16, 12), M.s); mitt.scale.set(0.068, 0.058, 0.07); fist.add(mitt);
      for (let k = 0; k < 4; k++) { const n = part(new THREE.CapsuleGeometry(0.014, 0.012, 4, 8), M.m); n.rotation.z = Math.PI / 2; n.position.set(-0.039 + k * 0.026, 0.018, -0.06); fist.add(n); }
      const thumb = part(new THREE.CapsuleGeometry(0.016, 0.035, 4, 8), M.m); thumb.rotation.x = Math.PI / 2; thumb.position.set(-sd * 0.052, -0.022, -0.035); fist.add(thumb);
      const back = part(new THREE.BoxGeometry(0.07, 0.012, 0.055), M.a); back.position.set(0, 0.055, 0.005); fist.add(back);
      pivot.add(fore, plate, strip, wrist, cuff, ...rivets, fist);
      pivot.position.set(sd * 0.21, -0.235, -0.44); pivot.rotation.y = -sd * 0.22;
      vm.add(pivot);
      return { pivot, fist, sd, rest: pivot.position.clone(), restY: -sd * 0.22, t: 0 };
    });
    // the bat: a turned grip, taped handle, thick head
    const bat = this.bat = new THREE.Group();
    const wood = mat(0x8a5a32, 0.7, 0.05), tape = mat(0x23262a, 0.9, 0.0);
    const head = part(new THREE.CylinderGeometry(0.05, 0.03, 0.62, 12), wood); head.position.y = 0.36;
    const grip = part(new THREE.CylinderGeometry(0.024, 0.026, 0.2, 10), tape); grip.position.y = -0.02;
    const knob = part(new THREE.CylinderGeometry(0.036, 0.03, 0.03, 10), tape); knob.position.y = -0.13;
    const nail = part(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), this.mats.bolt); nail.rotation.z = Math.PI / 2; nail.position.y = 0.55;
    bat.add(head, grip, knob, nail); bat.visible = false;
    this.arms[1].fist.add(bat); bat.position.set(0, 0.02, -0.02); bat.rotation.x = -1.1;
    this.crew = null;
  }
  dress() {
    const id = this.G.player.crewId; if (id === this.crew) return; this.crew = id;
    const c = crewColors(id); this.mats.m.color.setHex(c.m); this.mats.s.color.setHex(c.s); this.mats.a.color.setHex(c.a); this.mats.g.emissive.setHex(c.g);
  }

  // ---------------------------------------------------------------- input (sim step)
  /** hold = right mouse held this tick; tap = the gear key (F) on a melee gear: an immediate swing. */
  step(dt, hold, tap) {
    const G = this.G, P = G.player;
    this.cdT = Math.max(0, this.cdT - dt); this.chainT = Math.max(0, this.chainT - dt);
    if (this.chainT <= 0) this.chain = 0;
    if (this.swing) this.advance(dt);
    const busy = P.down || !!G.grab?.held;
    if (busy) { this.holdT = -1; return; }
    if (tap && !this.swing && this.cdT <= 0) { this.start(0); return; }
    if (hold) { if (this.holdT < 0) this.holdT = 0; else this.holdT += dt; return; }
    if (this.holdT >= 0) {   // released
      const k = this.holdT < MELEE.chargeAfter ? 0 : Math.min(1, (this.holdT - MELEE.chargeAfter) / (MELEE.chargeFull - MELEE.chargeAfter));
      this.holdT = -1;
      if (!this.swing && this.cdT <= 0) this.start(k);
    }
  }
  get weapon() { return this.G.gear?.id === 'bat' ? 'bat' : 'fist'; }
  /** Charge 0..1 of the hit being held (for the arm pose and tests). */
  get charge() { return this.holdT < MELEE.chargeAfter ? 0 : Math.min(1, (this.holdT - MELEE.chargeAfter) / (MELEE.chargeFull - MELEE.chargeAfter)); }

  start(k) {
    const G = this.G, w = this.weapon, gd = w === 'bat' ? GEAR.bat : null;
    this.chain = this.chainT > 0 ? this.chain + 1 : 1; this.chainT = MELEE.chainWindow;
    const third = this.chain % 3 === 0;
    this.side = w === 'bat' ? 1 : 1 - this.side;
    this.swing = { w, gd, k, third, t: 0, hitDone: false, side: this.side };
    this.cdT = w === 'bat' ? gd.cd : MELEE.fist.cd;
    G.audio?.play(w === 'bat' ? 'whoosh_bat' : 'whoosh', null, 0.55 + 0.4 * k, (w === 'bat' ? 0.85 : 1.05) - 0.15 * k);
    G.events.emit('melee:swing', { w, k, third });
    if (w === 'bat') G.gear.spend();
  }
  advance(dt) {
    const s = this.swing; s.t += dt;
    if (!s.hitDone && s.t >= MELEE.windup + MELEE.strike * 0.8) { s.hitDone = true; this.impact(s); }
    if (s.t >= MELEE.windup + MELEE.strike + MELEE.recover) this.swing = null;
  }

  // ---------------------------------------------------------------- the blow
  impact(s) {
    const G = this.G, P = G.player, p = P.position, cam = P.camPos, fw = P.forward(new THREE.Vector3());
    const h = Math.hypot(fw.x, fw.z) || 1, dx = fw.x / h, dz = fw.z / h;
    const bat = s.w === 'bat', gd = s.gd;
    const reach = bat ? gd.reach : MELEE.fist.reach, cone = bat ? MELEE.bat.cone : MELEE.fist.cone;
    const atk = bat ? gd.dmg : (CREW[P.crewId]?.atk ?? 9) * MELEE.fist.cd / MELEE.fist.srcCd;   // same damage per second as the 2D fist
    const mul = (s.third ? MELEE.chainMul : 1) * (1 + MELEE.chargeDmg * s.k);
    const knock0 = (bat ? gd.knock : MELEE.fist.knock) * (1 + MELEE.chargeKnock * s.k) * (s.third ? 1.25 : 1);
    G.noise?.emit({ x: p.x, z: p.z, r: bat ? 4 : MELEE.fist.noise, str: 1.2, src: 'swing', mine: true });
    // caged by the pharaoh: every blow goes into the bones of the cage (bosses.js cageHit)
    if (P.heldBy && P.heldBy.owner && G.foes?.cageHit?.(atk * mul)) {
      const at = new THREE.Vector3(cam.x + dx * 0.55, cam.y - 0.2, cam.z + dz * 0.55); this.fx.burst(at, new THREE.Vector3(-dx, 0.3, -dz), 8, 3); this.feel(MELEE.stop[0], 0.8, s.side);
      const rc = { w: s.w, k: +s.k.toFixed(2), third: s.third, foes: [], target: 'cage' }; this.log.push(rc); G.events.emit('melee:hit', rc); return;
    }
    // foes in the cone (fists: the nearest one, the bat: all of them)
    const R0 = G.phys.R, world0 = G.phys.world;
    const behindWall = (f) => { const tx = f.x - cam.x, ty = (f.gy || 0) + f.h * 0.5 - cam.y, tz = f.z - cam.z, tl = Math.hypot(tx, ty, tz) || 1;
      const h = world0.castRay(new R0.Ray(cam, { x: tx / tl, y: ty / tl, z: tz / tl }), Math.max(0, tl - f.r - 0.05), true, R0.QueryFilterFlags.EXCLUDE_SENSORS | R0.QueryFilterFlags.EXCLUDE_DYNAMIC | R0.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, P.col);
      return !!h; };
    const hits = (G.foes?.list || []).filter((f) => {
      if (f.dead) return false; const rx = f.x - p.x, rz = f.z - p.z, d = Math.hypot(rx, rz);
      return d < reach + f.r && (d < f.r + 0.2 || (rx * dx + rz * dz) / (d || 1) > Math.cos(cone)) && G.foes.reachY(f, P) && !behindWall(f);
    }).sort((a, b) => { const sc = (f) => { const rx = f.x - p.x, rz = f.z - p.z, d = Math.hypot(rx, rz) || 1; return d * (2 - (rx * dx + rz * dz) / d); }; return sc(a) - sc(b); });   // nearest to the aim first
    const struck = bat ? hits : hits.slice(0, 1);
    const rec = { w: s.w, k: +s.k.toFixed(2), third: s.third, foes: [], target: null };
    if (struck.length) {
      for (const f of struck) {
        const d = Math.hypot(f.x - p.x, f.z - p.z) || 1, dir = { x: (f.x - p.x) / d, z: (f.z - p.z) / d };
        const dmg = atk * mul, knock = knock0 * (isLight(f) ? MELEE.lightKnockMul : 1);
        const hp0 = f.hp;
        G.foes.hurtFoe(f, dmg, dir, knock);
        if (!f.dead && f.state === 'sleep') G.foes.wake?.(f);
        G.passives?.chill?.(f, P);
        f.spin = (f.spin || 0) + (s.side ? -1 : 1) * (2.5 + 3 * s.k) * (isLight(f) ? 2 : 1);   // the stagger spins it (foes.js render)
        f.flyT = knock > 6 ? 0.6 : 0; f.wallHit = false;
        f.robot?.body?.act?.(s.k > 0.5 || s.third ? 'knock' : 'hitF', { k: 1 + s.k });
        const at = new THREE.Vector3(f.x - dir.x * f.r, (f.gy || 0) + f.h * 0.6, f.z - dir.z * f.r);
        this.fx.burst(at, new THREE.Vector3(-dir.x, 0.4, -dir.z), 14 + 20 * s.k, 4 + 6 * s.k);
        rec.foes.push({ kind: f.kind, dmg: +(hp0 - f.hp).toFixed(2), knock: +knock.toFixed(2), light: isLight(f) });
      }
      const stop = MELEE.stop[0] + (MELEE.stop[1] - MELEE.stop[0]) * Math.max(s.k, s.third ? 0.5 : 0, bat ? 0.4 : 0);
      this.feel(stop, 1 + s.k + (bat ? 0.4 : 0), s.side);
      G.audio?.play(bat ? 'bat_hit' : 'punch_hit', { x: struck[0].x, y: (struck[0].gy || 0) + 1, z: struck[0].z }, 0.8 + 0.3 * s.k, 1.05 - 0.2 * s.k);
      rec.target = 'foe'; rec.stop = +stop.toFixed(3);
    } else {
      // nothing alive in reach: what is in front of the fist (loot, a door leaf, a wall)
      const R = G.phys.R, ball = bat ? 0.15 : MELEE.fist.ball, sc = G.phys.world.castShape(cam, { x: 0, y: 0, z: 0, w: 1 }, fw, new R.Ball(ball), 0, reach + 0.2, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.col);
      const hit = sc ? { collider: sc.collider, toi: sc.time_of_impact ?? sc.timeOfImpact } : null;
      if (hit) {
        const pt = { x: cam.x + fw.x * (hit.toi + ball), y: cam.y + fw.y * (hit.toi + ball), z: cam.z + fw.z * (hit.toi + ball) }, at = new THREE.Vector3(pt.x, pt.y, pt.z), body = hit.collider.parent();
        const item = G.phys.props.find((q) => q.col === hit.collider || (q.cols && q.cols.some((c) => c.handle === hit.collider.handle)));
        const door = G.house?.doorRecs?.find((d) => d.leaves.some((l) => l.body.handle === body.handle));
        const prop = !item && !door && G.house?.props?.find((q) => q.bodies.some((b) => b.handle === body.handle));
        if (item && item.isCart) {   // the cart rolls off the blow
          const v = (bat ? 3.2 : 2.2) * (1 + 0.8 * s.k), m = item.kg; item.body.applyImpulseAtPoint({ x: fw.x * v * m, y: 0, z: fw.z * v * m }, pt, true);
          G.audio?.play('punch_door', at, 0.8, 1.35); this.fx.burst(at, fw.clone().negate(), 8, 3); this.feel(MELEE.stop[0] * 0.8, 0.7, s.side);
          rec.target = 'cart';
        } else if (item && item.grabbable) {   // loot flies off the blow (light items far, heavy ones hop), spinning, with the item's own knock
          const kg = item.kg, fl = Math.hypot(fw.x, fw.z) || 1, hx = fw.x / fl, hz = fw.z / fl, pw = (bat ? 1.5 : 1) * (1 + 0.8 * s.k);
          const vh = THREE.MathUtils.clamp(MELEE.lootLaunch / Math.sqrt(kg), MELEE.lootMinH, MELEE.lootMaxH) * pw, vu = (0.45 * vh + MELEE.lootHop) * Math.min(1.4, pw);
          const v0 = item.body.linvel(); item.body.setLinvel({ x: v0.x + hx * vh, y: Math.max(v0.y, 0) + vu, z: v0.z + hz * vh }, true);
          item.body.setAngvel({ x: (Math.random() - 0.5) * 12 / Math.sqrt(kg), y: (s.side ? -1 : 1) * 8 / Math.sqrt(kg), z: (Math.random() - 0.5) * 12 / Math.sqrt(kg) }, true);
          G.audio?.play('hit_' + (item.material || 'wood'), at, 0.9, 1); G.audio?.play('punch_wall', at, 0.45, 1.4);
          this.fx.burst(at, fw.clone().negate(), 8, 3); this.feel(MELEE.stop[0] * 0.7, 0.6, s.side);
          rec.target = 'loot'; rec.item = item.material; rec.launch = { h: +vh.toFixed(2), up: +vu.toFixed(2), kg: +kg.toFixed(2) };
        } else if (door) {   // a door bangs open away from the blow; a jammed one rattles (only a bat breaks it, design-inventory: force)
          const side = ((door.door.dir === 0 ? fw.x : fw.z) >= 0) ? 1 : -1;
          if (door.jammed && bat) { G.house.unjam(door.cx, door.cz, 0.5); G.events.emit('door:slam', { x: door.cx, z: door.cz }); G.noise?.emit({ x: door.cx, z: door.cz, r: 11, str: 1.5, src: 'door', mine: true }); }
          if (!door.jammed) { if (door.open < 0.2) door.side = side; door.target = 1; door.slamT = 0.35; G.events.emit('door:open', { x: door.cx, z: door.cz }); }
          else door.rattleT = 0.35;
          G.noise?.emit({ x: door.cx, z: door.cz, r: 6, str: 1.2, src: 'door', mine: true });
          G.audio?.play('punch_door', at, 1, door.jammed ? 1 : 0.85);
          this.fx.burst(at, fw.clone().negate(), 8, 3); this.feel(MELEE.stop[0], 0.8, s.side);
          rec.target = door.jammed ? 'door-jammed' : 'door';
        } else if (G.traps?.hitVent(at.x, at.z)) {   // a smoke trap's vent hole: the blow switches it off
          this.fx.burst(at, fw.clone().negate(), 8, 2); this.feel(MELEE.stop[0], 0.7, s.side); rec.target = 'vent';
        } else if (prop) {   // furniture: a hollow thump, dust, a kick; light loot resting on or by it jumps
          G.audio?.play('punch_door', at, 0.75, 0.8); this.fx.burst(at, fw.clone().negate(), 10, 3); this.feel(MELEE.stop[0] * 0.8, 0.65, s.side);
          let n = 0; for (const it of G.loot?.items || []) { if (it.dead || it.held || it.mass > 30) continue; const q = it.body.translation(); if (Math.hypot(q.x - pt.x, q.z - pt.z) > 0.9 || Math.abs(q.y - pt.y) > 0.9) continue; it.body.applyImpulse({ x: fw.x * 0.6 * it.kg, y: 1.6 * it.kg, z: fw.z * 0.6 * it.kg }, true); n++; }
          rec.target = 'decor'; rec.prop = prop.n; rec.jolted = n;
        } else {
          G.audio?.play('punch_wall', at, 0.8, bat ? 0.8 : 1);
          this.fx.burst(at, fw.clone().negate(), 8, 2); this.feel(MELEE.stop[0] * 0.7, 0.6, s.side);
          rec.target = 'wall';
        }
      } else { rec.target = 'miss'; G.audio?.play('whiff', null, 0.4, 1.2); this.feel(0, 0.25, s.side); }   // a miss: the swing goes through, a whoosh tail and a small sway
    }
    this.log.push(rec);
    G.events.emit('melee:hit', rec);
  }

  /** Hit-stop (the sim pauses, frames keep drawing), camera kick along the blow, FOV punch, rumble. */
  feel(stop, k, side) {
    const G = this.G;
    G.hitStopT = Math.max(G.hitStopT || 0, stop); this.lastStop = stop;
    this.kick.x += (side ? -1 : 1) * 0.012 * k; this.kick.y -= 0.01 * k; this.kick.roll += (side ? 1 : -1) * 0.025 * k; this.kick.fov -= 2.2 * k; this.kick.shake = Math.max(this.kick.shake, 0.012 * k);
    try { for (const gp of navigator.getGamepads?.() || []) gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 60 + 70 * Math.min(1, k / 2), strongMagnitude: Math.min(1, 0.35 * k), weakMagnitude: Math.min(1, 0.5 * k) }); } catch (e) { /* no pad */ }
  }

  /** A knocked foe slammed a wall (foes.js): a second, smaller beat. */
  wallSlam(f, speed) {
    const G = this.G, at = new THREE.Vector3(f.x, (f.gy || 0) + f.h * 0.5, f.z);
    G.audio?.play('punch_wall', at, Math.min(1.2, 0.4 + speed * 0.08), 0.7);
    this.fx.burst(at, new THREE.Vector3(0, 1, 0), 10, 5);
    G.foes.hurtFoe(f, Math.min(10, speed * 0.6), null, 0);
    this.feel(0.04, 0.6, 0);
    this.log.push({ wallSlam: f.kind, speed: +speed.toFixed(2) });
  }

  // ---------------------------------------------------------------- per frame
  render(dt) {
    const G = this.G, cam = G.camera, P = G.player;
    this.dress();
    const busy = P.down || !!G.grab?.held, bat = this.weapon === 'bat';
    this.vm.visible = !P.down && G.viewOn !== false;
    this.bat.visible = bat;
    const t = performance.now() / 1000, bob = Math.sin(P.bob || 0) * 0.012 * Math.min(1, (P.horizSpeed || 0) / 3);
    const ch = this.charge;
    for (const a of this.arms) {
      const pos = a.pivot.position.copy(a.rest), rot = a.pivot.rotation;
      rot.set(0.08, a.restY, 0);   // guard: knuckles up, angled in
      pos.y += bob + Math.sin(t * 1.6 + a.sd) * 0.004 - (busy ? 0.35 : 0);   // hands drop out of view while the beam holds
      if (bat) { if (a.sd < 0) { pos.x = 0.06; pos.y -= 0.03; pos.z -= 0.02; } else { pos.x = 0.16; } }
      const s = this.swing, mine = s && (bat || (s.side === (a.sd > 0 ? 1 : 0)));
      if (this.holdT >= 0 && !s && (bat || a.sd > 0 === (this.side === 0))) {   // charging: pull back and tremble
        pos.z += 0.06 + 0.1 * ch; pos.y -= 0.03 * ch; rot.x = 0.2 * ch; pos.x += (Math.random() - 0.5) * 0.006 * ch;
      }
      if (mine) {
        const w1 = MELEE.windup, w2 = w1 + MELEE.strike, w3 = w2 + MELEE.recover, k = s.t;
        let e;   // 0 rest .. -1 pulled back .. +1 extended
        if (k < w1) e = -(k / w1); else if (k < w2) e = -1 + 2.2 * ease((k - w1) / MELEE.strike); else e = 1.2 * (1 - ease((k - w2) / MELEE.recover));
        if (bat) { rot.z = -1.2 * Math.max(-0.4, e) * (e > 0 ? 1 : 0.3); rot.x = -0.5 * e; pos.x -= 0.25 * Math.max(0, e); pos.z -= 0.1 * Math.max(0, e); }
        else { pos.z -= 0.3 * e * (1 + 0.3 * s.k); pos.x -= a.sd * 0.09 * Math.max(0, e); pos.y += 0.05 * Math.max(0, e); rot.z = a.sd * 0.25 * Math.max(0, e); rot.x = -0.15 * e; }
      }
    }
    // camera kick (after player.updateCamera has set the base pose)
    const K = this.kick, damp = Math.exp(-dt * 14);
    if (K.shake > 0.0005 || Math.abs(K.fov) > 0.01 || Math.abs(K.roll) > 1e-4) {
      cam.rotateZ(K.roll); cam.rotateX(K.y * 2); cam.rotateY(K.x * 2);
      cam.position.x += (Math.random() - 0.5) * K.shake; cam.position.y += (Math.random() - 0.5) * K.shake;
      cam.fov = this.fov0 + K.fov; cam.updateProjectionMatrix();
    } else if (cam.fov !== this.fov0) { cam.fov = this.fov0; cam.updateProjectionMatrix(); }
    K.x *= damp; K.y *= damp; K.roll *= damp; K.fov *= Math.exp(-dt * 9); K.shake *= Math.exp(-dt * 18);
    this.fx.update(dt, G.house);
  }
  dispose() { this.G.camera.remove(this.vm); this.fx.dispose(); }
}

const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
// The arms sit 0.3-0.5 m from the torch, so plain lighting blows them out and they lift the whole frame (floors.js luma
// band 30-55 failed in vietnam/asylum, +9 luma from the arms alone). Their light is scaled to what a thing 1.5 m into the
// torch cone gets and compressed softly at the hot end.
function mat(c, rough, metal) {
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, depthTest: false, depthWrite: false });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = outgoingLight * 0.3 / (1.0 + outgoingLight * 0.8);\n#include <opaque_fragment>'); };
  m.customProgramCacheKey = () => 'vm-soft';
  return m;
}
function part(g, m) { const o = new THREE.Mesh(g, m); o.renderOrder = 20; o.castShadow = false; o.frustumCulled = false; return o; }

// sparks (additive points) and metal flakes (small boxes that tumble, fall and settle on the floor)
class HitFx {
  constructor(scene) {
    const N = this.N = 160;
    this.sp = []; this.fl = [];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.pts.frustumCulled = false; scene.add(this.pts);
    this.flakes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.008, 0.025), new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.35, metalness: 0.85 }), 64);
    this.flakes.count = 0; this.flakes.frustumCulled = false; scene.add(this.flakes);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.one = new THREE.Vector3(1, 1, 1);
    this.scene = scene;
  }
  burst(at, dir, nSpark, nFlake) {
    for (let i = 0; i < nSpark && this.sp.length < this.N; i++) {
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 1.6, dir.y + Math.random() * 0.9, dir.z + (Math.random() - 0.5) * 1.6).multiplyScalar(2.5 + Math.random() * 3.5);
      this.sp.push({ p: at.clone(), v, life: 0.18 + Math.random() * 0.25, t: 0 });
    }
    for (let i = 0; i < nFlake && this.fl.length < 64; i++) {
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.2, dir.z + (Math.random() - 0.5) * 1.2).multiplyScalar(1.4 + Math.random() * 1.6);
      this.fl.push({ p: at.clone(), v, r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), t: 0, life: 2.5 + Math.random() });
    }
  }
  update(dt, house) {
    const pa = this.pts.geometry.attributes.position, ca = this.pts.geometry.attributes.color;
    this.sp = this.sp.filter((s) => (s.t += dt) < s.life);
    this.sp.forEach((s, i) => { s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt); const k = 1 - s.t / s.life; pa.setXYZ(i, s.p.x, s.p.y, s.p.z); ca.setXYZ(i, 1.6 * k, (0.9 + 0.3 * k) * k, 0.35 * k * k); });
    this.pts.geometry.setDrawRange(0, this.sp.length); pa.needsUpdate = true; ca.needsUpdate = true;
    this.fl = this.fl.filter((f) => (f.t += dt) < f.life);
    this.fl.forEach((f, i) => {
      const floor = (house?.heightAt ? house.heightAt(f.p.x, f.p.z) : 0) + 0.005;
      if (f.p.y > floor) { f.v.y -= 9.8 * dt; f.p.addScaledVector(f.v, dt); f.r.addScaledVector(f.w, dt); }
      if (f.p.y <= floor) { f.p.y = floor; f.v.set(0, 0, 0); f.r.x = 0; f.r.z = 0; }
      this.m.compose(f.p, this.q.setFromEuler(this.e.set(f.r.x, f.r.y, f.r.z)), this.one); this.flakes.setMatrixAt(i, this.m);
    });
    this.flakes.count = this.fl.length; this.flakes.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.pts, this.flakes); this.pts.geometry.dispose(); this.pts.material.dispose(); this.flakes.geometry.dispose(); this.flakes.material.dispose(); }
}
