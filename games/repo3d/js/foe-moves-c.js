// Angel and mirror (parity.md section 5, priority 2), mixed into Foes.prototype like foe-moves.js.
// Behaviour text and numbers from docs/design-inventory.md section 5; others are marked "chưa xác định".
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

const PX = 1 / 24;
// angel: "appears every 30-60 s in front of someone: aim the torch at it for 5 s to fill (drains 6 s); filled = it flies
// away and leaves light 30 s (r 7 tiles); otherwise after 6 s it blinks next to you and swipes 30 dmg, then 6 s of no
// torch + heavy legs. Bots hold it 15 s total". chưa xác định: it stands 3.5 m in front; heavy legs = x0.5 speed
export const ANGEL = { away: [30, 60], fill: 5, drain: 6, watch: 6, light: 30, lightR: 7, debuff: 6, heavy: 0.5, botHold: 15, dist: 3.5, cone: 0.62, range: 14 };
// mirror: "paired mirrors (A -> B): a ghost emerges after 2 s and walks to the nearest standing player (slower the farther
// from mirror, x0.32 min), x0.42 under torch; grabs within 20 px and drags you through the other mirror; 2 pistol shots or
// torch break it". 84 hp per mirror. chưa xác định: seen from 9 m, speed falls to x0.32 at 12 m from its mirror, 8 s
// between drags, the torch breaks a mirror after 3 s on its glass, mirrors at least 10 m apart
export const MIRROR = { emerge: 2, see: 9, grab: 20 * PX, minK: 0.32, torchK: 0.42, farR: 12, cd: 8, torchBreak: 3, apart: 10 };

export const moves3 = {
  // ------------------------------------------------------------------ angel
  /** Is the player's torch on this point (cone, range, nothing in between)? */
  torchOn(x, y, z) {
    const G = this.G, P = this.player;
    if (!this.playerAlive() || (P.torchOffT || 0) > 0 || !G.torch || G.torch.intensity <= 0) return false;
    const c = P.camPos, fw = P.forward(new THREE.Vector3()), dx = x - c.x, dy = y - c.y, dz = z - c.z, L = Math.hypot(dx, dy, dz);
    if (L > ANGEL.range || (dx * fw.x + dy * fw.y + dz * fw.z) / L < Math.cos(ANGEL.cone)) return false;
    const hit = G.phys.world.castRay(new this.R.Ray(c, { x: dx / L, y: dy / L, z: dz / L }), L, true, this.R.QueryFilterFlags.EXCLUDE_DYNAMIC | this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.col, undefined, (cl) => !this.isActorCollider(cl));
    return !hit || hit.timeOfImpact > L - 0.45;
  },
  bAngel(f, dt) {
    const P = this.player;
    if (f.awayT === undefined) { f.awayT = this.angelWait(); this.setState(f, 'away'); }
    if (f.state === 'away') {
      if (f.col) f.col.setEnabled(false);
      f.awayT -= dt; if (f.awayT <= 0) this.angelAppear(f);
      return [null, 0, null];
    }
    if (f.state === 'strike') { if (f.stateT > 0.6) { f.awayT = this.angelWait(); this.setState(f, 'away'); } return [null, 0, this.playerAlive() ? P.position : null]; }
    // watch: it stands still and stares; light fills it, darkness drains it; the player has 6 s
    const v = f.victim, vp = v === 'P' ? P.position : v;
    if (!vp || (v === 'P' ? !this.playerAlive() : v.down)) { f.awayT = this.angelWait(); this.setState(f, 'away'); return [null, 0, null]; }
    const lit = v === 'P' ? this.torchOn(f.x, f.gy + 1.3, f.z) : true;   // a crew bot keeps its torch on it
    f.lit = lit;
    f.fill = Math.max(0, Math.min(1, (f.fill || 0) + (lit ? dt / (v === 'P' ? ANGEL.fill : ANGEL.botHold) : -dt / ANGEL.drain)));
    if (f.fill >= 1) { this.angelFlee(f); return [null, 0, null]; }
    if (v === 'P' && f.stateT >= ANGEL.watch) { this.angelStrike(f); return [null, 0, vp]; }
    return [null, 0, vp];
  },
  angelWait() { return ANGEL.away[0] + (ANGEL.away[1] - ANGEL.away[0]) * this.rng(); },
  /** In front of someone: 3.5 m along their facing, on a walkable spot they can see. */
  angelAppear(f) {
    const P = this.player, nav = this.nav;
    let v = null, at = null;
    const tryFor = (who, x, z, yaw) => {
      for (const tw of [0, 0.35, -0.35, 0.7, -0.7]) for (const d of [ANGEL.dist, ANGEL.dist - 1, ANGEL.dist + 1]) {
        const a = yaw + tw, px = x - Math.sin(a) * d, pz = z - Math.cos(a) * d;
        if (nav.okW(px, pz) && nav.los(x, z, px, pz) && Math.abs(nav.heightAt(px, pz) - nav.heightAt(x, z)) < 0.3) return { x: px, z: pz };
      }
      return null;
    };
    if (this.playerAlive()) { const p = P.position; at = tryFor('P', p.x, p.z, P.yaw); if (at) v = 'P'; }
    if (!at) for (const b of this.G.bots?.list || []) { if (b.down) continue; at = tryFor(b, b.x, b.z, Math.atan2(-Math.sin(b.yaw || 0), -Math.cos(b.yaw || 0))); if (at) { v = b; break; } }
    if (!at) { f.awayT = 3; return; }
    const vp = v === 'P' ? P.position : v;
    f.x = at.x; f.z = at.z; f.gy = nav.heightAt(at.x, at.z); f.y = f.y0 + f.gy; f.yaw = Math.atan2(vp.x - at.x, vp.z - at.z);
    if (f.body) { f.body.setTranslation({ x: f.x, y: f.y, z: f.z }, true); f.body.setNextKinematicTranslation({ x: f.x, y: f.y, z: f.z }); }
    if (f.col) f.col.setEnabled(true);
    f.victim = v; f.fill = 0; this.setState(f, 'watch');
    this.G.audio?.play('roar', { x: f.x, y: f.gy + 1.5, z: f.z }, 0.35, 1.6);
    this.log.push(['angel', 'appear', v === 'P' ? 'player' : v.crew, +this.time.toFixed(2)]); this.G.events.emit('foe:angel', { foe: f, what: 'appear' });
  },
  angelFlee(f) {
    const G = this.G, light = new THREE.PointLight(0xdfe8ff, 7, ANGEL.lightR, 1.6); light.position.set(f.x, f.gy + 1.8, f.z); G.scene.add(light);
    (this.angelLights ||= []).push({ light, t: 0, i0: 7 });
    G.audio?.play('whoosh', { x: f.x, y: f.gy + 1.5, z: f.z }, 0.9, 1.5);
    this.log.push(['angel', 'fled', +this.time.toFixed(2)]); G.events.emit('foe:angel', { foe: f, what: 'fled' });
    f.victim = null; f.fill = 0; f.awayT = this.angelWait(); this.setState(f, 'away');
  },
  angelStrike(f) {
    const G = this.G, P = this.player, p = P.position, fw = P.forward(new THREE.Vector3()), L = Math.hypot(fw.x, fw.z) || 1;
    const x = p.x + fw.x / L * 0.9, z = p.z + fw.z / L * 0.9;
    if (this.nav.okW(x, z)) { f.x = x; f.z = z; } else { f.x = p.x - fw.x / L * 0.9; f.z = p.z - fw.z / L * 0.9; }   // blinks next to you
    f.yaw = Math.atan2(p.x - f.x, p.z - f.z); f.atkEnd = this.time;
    P.hurt(f.dmg, { x: f.x, z: f.z, kind: f.kind }); P.torchOffT = ANGEL.debuff; P.heavyT = ANGEL.debuff;
    G.audio?.play('punch_hit', { x: f.x, y: f.gy + 1.2, z: f.z }, 1, 0.8);
    this.log.push(['angel', 'strike', +f.dmg.toFixed(1)]); G.events.emit('foe:angel', { foe: f, what: 'strike' });
    f.victim = null; this.setState(f, 'strike');
  },

  // ------------------------------------------------------------------ mirror
  /** A mirror foe is one glass in a wall; the first of a pair owns the ghost. Placed and paired on spawn. */
  mirrorSetup(f, partnerOf) {
    const spot = this.wallSpot(f.home, partnerOf ? { x: partnerOf.x, z: partnerOf.z, min: MIRROR.apart } : null);
    f.x = spot.x; f.z = spot.z; f.yaw = spot.yaw; f.gy = this.nav.heightAt(spot.x + Math.sin(spot.yaw) * 0.5, spot.z + Math.cos(spot.yaw) * 0.5); f.y = f.y0 + f.gy;
    if (f.body) { f.body.setTranslation({ x: f.x, y: f.y, z: f.z }, true); f.body.setNextKinematicTranslation({ x: f.x, y: f.y, z: f.z }); }
    if (f.col) f.col.setEnabled(false);
    f.hp = f.maxHp = f.def.hp; f.noRespawn = true; f.state = 'glass'; f.torchT = 0;
    f.glass = this.mirrorMesh(f);
    if (partnerOf) { f.partner = partnerOf; partnerOf.partner = f; f.isB = true; }
    else { f.ghost = { out: false, x: f.x, z: f.z, yaw: f.yaw, cdT: 0, seeT: 0, path: null, pi: 0 }; this.spawn('mirror', f.home.x, f.home.z, { sleep: 0, partnerOf: f }); }
    this.log.push(['mirror', f.isB ? 'B' : 'A', +f.x.toFixed(1), +f.z.toFixed(1)]);
  },
  /** A wall spot beside a walkable cell (the hand/mirror faces out); far from 'away' when given. */
  wallSpot(home, away) {
    const nav = this.nav, out = [];
    for (let i = 0; i < nav.W * nav.H; i++) {
      if (!nav.walk[i] || nav.near[i] < 1) continue;
      const c = nav.center(i); if (Math.hypot(c.x - home.x, c.z - home.z) > 30) continue;
      if (away && Math.hypot(c.x - away.x, c.z - away.z) < away.min) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const gx = Math.floor(c.x) + dx, gz = Math.floor(c.z) + dz; if (this.L.grid[gz * this.L.w + gx] === 2 && nav.okW(c.x - dx, c.z - dz)) { out.push({ x: c.x + dx * 0.45, z: c.z + dz * 0.45, yaw: Math.atan2(-dx, -dz) }); break; } }
    }
    return out.length ? out[Math.floor(this.rng() * out.length)] : { x: home.x, z: home.z, yaw: 0 };
  },
  mirrorMesh(f) {
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fb0c0, roughness: 0.08, metalness: 1, emissive: 0x203040, emissiveIntensity: 0.6 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(0.95, 1.75, 0.06), frame, 0, 1.15, -0.02);
    f.glassMesh = add(new THREE.BoxGeometry(0.8, 1.6, 0.02), glass, 0, 1.15, 0.02);
    f.glassMesh.material = glass;
    add(new THREE.BoxGeometry(1.05, 0.08, 0.1), frame, 0, 2.06, 0); add(new THREE.BoxGeometry(1.05, 0.08, 0.1), frame, 0, 0.3, 0);
    g.position.set(f.x, f.gy, f.z); g.rotation.y = f.yaw; this.root.add(g);
    return g;
  },
  bMirror(f, dt) {
    if (!f.glass) return [null, 0, null];
    if (f.dead) return [null, 0, null];
    // the torch on its glass for 3 s breaks it (chưa xác định)
    if (this.torchOn(f.x + Math.sin(f.yaw) * 0.05, f.gy + 1.15, f.z + Math.cos(f.yaw) * 0.05)) { f.torchT += dt; if (f.torchT >= MIRROR.torchBreak) { this.hurtFoe(f, f.hp + 1, null, 0); return [null, 0, null]; } }
    if (f.isB || !f.ghost) return [null, 0, null];
    const g = f.ghost, B = f.partner, P = this.player;
    if (!B || B.dead) { g.out = false; return [null, 0, null]; }   // a broken pair: no way through
    g.cdT = Math.max(0, g.cdT - dt);
    const mirrors = [f, B];
    if (!g.out) {
      if (g.cdT > 0 || !this.playerAlive()) { g.seeT = 0; return [null, 0, null]; }
      const p = P.position; let near = null;
      for (const m of mirrors) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < MIRROR.see && this.nav.los(m.x + Math.sin(m.yaw) * 0.6, m.z + Math.cos(m.yaw) * 0.6, p.x, p.z) && (!near || d < near.d)) near = { m, d }; }
      if (!near) { g.seeT = 0; return [null, 0, null]; }
      g.seeT += dt;
      if (g.seeT >= MIRROR.emerge) {
        const m = near.m; g.from = m; g.out = true; g.x = m.x + Math.sin(m.yaw) * 0.6; g.z = m.z + Math.cos(m.yaw) * 0.6; g.yaw = m.yaw; g.path = null; g.repath = 0; g.seeT = 0;
        this.G.audio?.play('roar', { x: g.x, y: m.gy + 1.4, z: g.z }, 0.5, 1.8);
        this.log.push(['mirror', 'emerge', m.isB ? 'B' : 'A', +this.time.toFixed(2)]); this.G.events.emit('foe:mirror', { foe: f, what: 'emerge' });
      }
      return [null, 0, null];
    }
    // out: walk to the nearest standing crew member; slower far from its mirror and in the torch
    let tgt = null, td = 1e9;
    if (this.playerAlive()) { const p = P.position, d = Math.hypot(p.x - g.x, p.z - g.z); tgt = 'P'; td = d; }
    for (const b of this.G.bots?.list || []) { if (b.down) continue; const d = Math.hypot(b.x - g.x, b.z - g.z); if (d < td) { tgt = b; td = d; } }
    if (!tgt) { g.out = false; return [null, 0, null]; }
    const tp = tgt === 'P' ? P.position : tgt;
    if (td < MIRROR.grab) { this.mirrorDrag(f, tgt); return [null, 0, null]; }
    const away = Math.hypot(g.x - g.from.x, g.z - g.from.z), k = Math.max(MIRROR.minK, 1 - away / MIRROR.farR);
    const lit = this.torchOn(g.x, g.from.gy + 1.2, g.z); g.lit = lit;
    const sp = f.def.speed * PX * k * (lit ? MIRROR.torchK : 1); g.speed = sp;
    g.repath -= dt;
    if (!g.path || g.repath <= 0) { g.path = this.nav.path(g.x, g.z, tp.x, tp.z) || [{ x: tp.x, z: tp.z }]; g.pi = 0; g.repath = 0.5; }
    let w = g.path[g.pi]; while (w && Math.hypot(w.x - g.x, w.z - g.z) < 0.25 && g.pi < g.path.length - 1) w = g.path[++g.pi];
    if (!w) w = tp;
    const dx = w.x - g.x, dz = w.z - g.z, L = Math.hypot(dx, dz) || 1, step = Math.min(L, sp * dt);
    g.x += dx / L * step; g.z += dz / L * step; g.yaw = Math.atan2(tp.x - g.x, tp.z - g.z);
    return [null, 0, null];
  },
  mirrorDrag(f, who) {
    const G = this.G, P = this.player, g = f.ghost, to = g.from === f ? f.partner : f;
    const x = to.x + Math.sin(to.yaw) * 0.8, z = to.z + Math.cos(to.yaw) * 0.8;
    if (who === 'P') {
      const y = this.nav.heightAt(x, z) + CFG.player.halfHeight + CFG.player.radius + 0.02;
      if (G.grab?.held) G.grab.release(false);
      P.body.setTranslation({ x, y, z }, true); P.body.setNextKinematicTranslation({ x, y, z }); P.yaw = Math.atan2(-Math.sin(to.yaw), -Math.cos(to.yaw)); P.vy = 0;
      P.hurt(f.dmg, { x: g.x, z: g.z, kind: f.kind });
    } else { G.bots.teleport(who, x, z); G.bots.hurt(who, f.dmg, f); }
    G.audio?.play('whoosh', { x, y: to.gy + 1.2, z }, 1, 0.6);
    this.log.push(['mirror', 'drag', who === 'P' ? 'player' : who.crew, to.isB ? 'B' : 'A']); G.events.emit('foe:mirror', { foe: f, what: 'drag', who });
    g.out = false; g.cdT = MIRROR.cd;
  },
  /** A broken glass: the glass goes, shards fly, the frame stays. */
  mirrorBreak(f) {
    if (!f.glassMesh || f.broken) return;
    f.broken = true; f.glassMesh.visible = false;
    const at = new THREE.Vector3(f.x + Math.sin(f.yaw) * 0.1, f.gy + 1.15, f.z + Math.cos(f.yaw) * 0.1);
    this.G.melee?.fx?.burst?.(at, new THREE.Vector3(Math.sin(f.yaw), 0.3, Math.cos(f.yaw)), 26, 10);
    this.G.audio?.play('break_ceramic', { x: at.x, y: at.y, z: at.z }, 1.2, 1.3);
    this.log.push(['mirror', 'broken', f.isB ? 'B' : 'A']); this.G.events.emit('foe:mirror', { foe: f, what: 'broken' });
    const A = f.isB ? f.partner : f; if (A?.ghost) A.ghost.out = false;
  },

  // ------------------------------------------------------------------ looks
  /** Sim step: the light an angel leaves lasts 30 s (fades over the last 2 s). */
  stepAngelLights(dt) {
    for (const L of [...(this.angelLights || [])]) { L.t += dt; L.light.intensity = L.i0 * Math.min(1, (ANGEL.light - L.t) / 2); if (L.t >= ANGEL.light) { this.G.scene.remove(L.light); this.angelLights.splice(this.angelLights.indexOf(L), 1); } }
  },
  movesFxC(dt) {
    for (const f of this.list) {
      if (f.def.beh === 'angel' && f.state === 'watch') {   // the fill: a cold glow that grows over the statue
        if (!f.aura) { f.aura = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); f.aura.scale.y = 1.6; this.root.add(f.aura); }
        f.aura.visible = true; f.aura.position.set(f.x, f.gy + 1.15, f.z); f.aura.material.opacity = 0.05 + 0.4 * (f.fill || 0) * (f.lit ? 1 : 0.6);
      } else if (f.aura) f.aura.visible = false;
      if (f.glassMesh && !f.broken) f.glassMesh.material.emissiveIntensity = 0.45 + 0.25 * Math.sin(this.time * 2 + f.id) + (f.partner?.ghost?.out || f.ghost?.out ? 0.6 : 0);
    }
  },
};
