// The five theme bosses (parity.md section 5, priority 3), mixed into Foes.prototype. One boss per house from house 3
// (bossFromHouse 3), by theme: vampire castle -> vampire, pyramid -> pharaoh, vietnam -> joker, spacestation -> alien,
// asylum -> nurse. Bosses: no respawn, stunned only by the sledgehammer / tranq gun / stun grenade, capped 1.2 s with 4 s
// immunity after, little knockback. Behaviour text and hp/dmg/cd/speed from docs/design-inventory.md section 5; every
// other number is "chưa xác định" (set so the boss works; listed in parity.md).
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

export const BOSS = { fromHouse: 3, stunCap: 1.2, stunImmune: 4, knockMul: 0.15, byTheme: { vampire: 'vampire', pyramid: 'pharaoh', vietnam: 'joker', spacestation: 'alien', asylum: 'nurse' } };
// vampire: "hidden 5 s -> bats scatter -> reappear 3-3.8 tiles from a player -> red ring (4.6 tiles) -> grab/drain 2.2 s
// (heals what it drains) -> throw (extra damage on wall) -> vanish". chưa xác định: ring warning 1.2 s, drain 12 hp/s,
// thrown at 9 m/s, 10 more when the throw ends on a wall
export const VAMP = { hide: 5, bats: 0.6, near: [3, 3.8], ringR: 4.6, warn: 1.2, drain: 2.2, dps: 12, throwV: 9, wallDmg: 10 };
// nurse: "screams on sight: all foes nearby run to her; throws a tranquillizer syringe (pink line telegraph) -> limp/slow;
// keeps distance". chưa xác định: scream reaches 14 m, once per 20 s; slow x0.6 for 4 s
export const NURSE = { screamR: 14, screamCd: 20, slow: 0.6, slowT: 4 };
// alien: "shoots ink (purple line) -> screen blinded with black ink for a few seconds; chases at normal speed".
// chưa xác định: blind 4 s, one ink shot per 8 s
export const ALIEN = { blind: 4, cd: 8 };
// pharaoh: "marks a player with a lock shadow, drops a bone cage if you stay; break the cage (66 hp) or be hit when it
// raises its staff; slow". chưa xác định: mark from 9 m every 10 s, 2 s to step out of 1.2 m, staff 3 s after the cage
export const PHAR = { every: 10, range: 9, mark: 2, stayR: 1.2, cageHp: 66, staff: 3 };
// joker: "rushes to anyone who touches a trap (rush x2.2, max 10 s); lays fake loot with price tags that explode in a clown
// box when picked up; chases and melees". chưa xác định: a fake every 20 s (at most 3), blast r 2.5 m pow 0.7
export const JOKER = { rush: 2.2, rushMax: 10, fakeEvery: 20, fakeMax: 3, boomR: 2.5, boomPow: 0.7 };

export const moves4 = {
  /** One boss for the house, by theme, from house 3 on; far from the truck. */
  spawnBoss(theme) {
    if (this.houseIndex < BOSS.fromHouse) return null;
    const kind = BOSS.byTheme[theme]; if (!kind) return null;
    const st = this.house.spawn, pts = this.L.foes.filter((p) => Math.hypot(p.x + 0.5 - st.x, p.y + 0.5 - st.z) > 14);
    const p = (pts.length ? pts : this.L.foes)[Math.floor(this.rng() * Math.max(1, (pts.length ? pts : this.L.foes).length))];
    if (!p) return null;
    const f = this.spawn(kind, p.x + 0.5, p.y + 0.5, { sleep: 0 });
    this.log.push(['boss', kind]); return f;
  },
  /** The only way a boss is stunned (gear.js sleep: sledgehammer, tranq, stun grenade). */
  bossStun(f, t) {
    if ((f.stunImmT || 0) > this.time) return false;
    f.stunT = Math.min(BOSS.stunCap, t); f.stunImmT = this.time + Math.min(BOSS.stunCap, t) + BOSS.stunImmune; f.atk = 0;
    this.log.push(['bossStun', f.kind, f.stunT]); return true;
  },

  // ------------------------------------------------------------------ vampire
  bVampire(f, dt) {
    const P = this.player, G = this.G;
    if (f.state === 'patrol' || f.state === 'chase' || f.state === 'investigate') this.setState(f, 'hidden');
    if (f.state === 'hidden') { if (f.col) f.col.setEnabled(false); if (f.stateT >= VAMP.hide && this.playerAlive()) this.vampAppear(f); return [null, 0, null]; }
    if (f.state === 'bats') { if (f.stateT >= VAMP.bats) { this.setState(f, 'ring'); if (f.col) f.col.setEnabled(true); } return [null, 0, this.playerAlive() ? P.position : null]; }
    if (f.state === 'ring') {
      if (f.stateT >= VAMP.warn) {
        const p = P.position;
        // it holds you: its own body goes soft (touching capsules jam the player's character controller, toi 0)
        if (this.playerAlive() && Math.hypot(p.x - f.x, p.z - f.z) < VAMP.ringR && this.reachY(f, P)) { this.holdOn(f, 'P'); if (f.col) f.col.setEnabled(false); this.setState(f, 'drain'); }
        else this.vampVanish(f);
      }
      return [null, 0, this.playerAlive() ? P.position : null];
    }
    if (f.state === 'drain') {
      if (!this.playerAlive()) { this.letGo(f, 'down'); this.vampVanish(f); return [null, 0, null]; }
      const p = P.position, dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.9) P.push = { x: dx / d * 6, z: dz / d * 6 };   // pulled in to its grip
      f.tickT = (f.tickT || 0) + dt;
      if (f.tickT >= 0.25) { f.tickT -= 0.25; const got = P.hurt(VAMP.dps * 0.25, { x: f.x, z: f.z, kind: f.kind }); f.hp = Math.min(f.maxHp, f.hp + (got || 0)); f.drained = (f.drained || 0) + (got || 0); }
      if (f.stateT >= VAMP.drain) {
        this.letGo(f, 'throw'); const fw = d > 0.01 ? { x: -dx / d, z: -dz / d } : { x: Math.sin(f.yaw), z: Math.cos(f.yaw) };
        P.shove(fw.x * VAMP.throwV, fw.z * VAMP.throwV); f.thrown = { t: 0, from: { x: p.x, z: p.z } };
        this.log.push(['vamp', 'throw', +(f.drained || 0).toFixed(1)]); f.drained = 0; this.setState(f, 'throw');
      }
      return [null, 0, p];
    }
    if (f.state === 'throw') {
      // a throw that stops short (a wall in the way) hurts more
      const T = f.thrown; T.t += dt; const p = P.position, moved = Math.hypot(p.x - T.from.x, p.z - T.from.z);
      if (T.t > 0.25 && !T.done) { T.done = true; if (moved < VAMP.throwV * 0.25 * 0.55) { P.hurt(VAMP.wallDmg * this.roster.dmgMul, { x: f.x, z: f.z, kind: f.kind }); this.log.push(['vamp', 'wall']); } }
      if (T.t > 0.5) this.vampVanish(f);
      return [null, 0, null];
    }
    return [null, 0, null];
  },
  vampAppear(f) {
    const P = this.player, p = P.position, nav = this.nav;
    for (let k = 0; k < 24; k++) {
      const a = this.rng() * Math.PI * 2, r = VAMP.near[0] + (VAMP.near[1] - VAMP.near[0]) * this.rng(), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!nav.okW(x, z) || !nav.los(x, z, p.x, p.z) || Math.abs(nav.heightAt(x, z) - nav.heightAt(p.x, p.z)) > 0.3) continue;
      f.x = x; f.z = z; f.gy = nav.heightAt(x, z); f.y = f.y0 + f.gy; f.yaw = Math.atan2(p.x - x, p.z - z);
      if (f.body) { f.body.setTranslation({ x, y: f.y, z }, true); f.body.setNextKinematicTranslation({ x, y: f.y, z }); }
      this.batsFx(x, f.gy + 1.2, z); this.setState(f, 'bats'); this.G.audio?.play('whoosh', { x, y: f.gy + 1.2, z }, 1, 1.6);
      this.log.push(['vamp', 'appear', +r.toFixed(2)]); return;
    }
    f.stateT = VAMP.hide - 1;   // nowhere to stand: try again in a second
  },
  vampVanish(f) { this.batsFx(f.x, f.gy + 1.2, f.z); this.setState(f, 'hidden'); this.log.push(['vamp', 'vanish']); },
  batsFx(x, y, z) {
    if (!this.batGeo) { this.batGeo = new THREE.PlaneGeometry(0.22, 0.1); this.batMat = new THREE.MeshBasicMaterial({ color: 0x0c0608, side: THREE.DoubleSide }); this.bats = []; }
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(this.batGeo, this.batMat); m.position.set(x, y, z); this.root.add(m); const a = Math.random() * Math.PI * 2; this.bats.push({ m, v: new THREE.Vector3(Math.cos(a) * (2 + 3 * Math.random()), 1 + 2.5 * Math.random(), Math.sin(a) * (2 + 3 * Math.random())), t: 0 }); }
  },

  // ------------------------------------------------------------------ nurse and alien: ranged bosses on the gunner's aim
  bNurse(f, dt) {
    if (f.seen && f.aware >= 1 && !(f.screamAt > this.time - NURSE.screamCd)) this.nurseScream(f);
    return this.bGunner(f, dt);
  },
  nurseScream(f) {
    const G = this.G, P = this.player, p = P.position; f.screamAt = this.time; let n = 0;
    for (const o of this.list) {
      if (o === f || o.dead || o.def.boss || o.def.fixed || Math.hypot(o.x - f.x, o.z - f.z) > NURSE.screamR) continue;
      if (o.state === 'sleep') this.wake(o);
      o.aware = 1; o.lastSeen = { x: p.x, z: p.z }; o.lostT = 0; o.target = { x: f.x, z: f.z };
      if (o.def.beh === 'melee' || o.def.beh === 'gunner' || o.def.beh === 'rook' || o.def.beh === 'mummy' || o.def.beh === 'gacha') this.setState(o, 'chase'); else this.setState(o, 'investigate');
      n++;
    }
    G.noise?.emit({ x: f.x, z: f.z, r: NURSE.screamR, str: 2, src: 'scream' });
    G.audio?.play('roar', { x: f.x, y: f.gy + 1.5, z: f.z }, 1.2, 1.9);
    this.log.push(['scream', n]); G.events.emit('foe:scream', { foe: f, n });
  },
  bAlien(f, dt) {
    // ink when it can (cd 8 s), otherwise a normal melee chaser
    if (f.state === 'aim' || f.state === 'recover' && f.lastShot > this.time - 0.6) return this.bGunner(f, dt);
    if ((f.inkCd || 0) <= this.time && f.seen && f.aware >= 1 && this.playerAlive() && this.dist(f, this.player.position) <= 9 && f.cdT <= 0 && this.gunClear(f, this.gunTarget(f))) {
      this.setState(f, 'aim'); f.aimT = 0; f.aimAt = this.gunTarget(f); f.inkCd = this.time + ALIEN.cd; return [null, 0, this.player.position];
    }
    return this.bMelee(f, dt);
  },
  /** gunFire calls this after a hit on the player: the nurse's syringe slows, the alien's ink blinds. */
  rangedHit(f) {
    const P = this.player;
    if (f.def.beh === 'nurse') { P.slowT = NURSE.slowT; this.log.push(['syringe']); }
    if (f.def.beh === 'alien') { P.inkT = ALIEN.blind; this.log.push(['ink']); this.G.events.emit('player:ink', { t: ALIEN.blind }); }
    f.lastShot = this.time;
  },

  // ------------------------------------------------------------------ pharaoh
  bPharaoh(f, dt) {
    const P = this.player;
    if (f.state === 'staff') {
      if (f.stateT >= 0.6) { const c = this.cage; if (c && !c.dead && P.heldBy === c) { P.hurt(f.dmg, { x: f.x, z: f.z, kind: f.kind }); this.log.push(['staff', 'hit', +f.dmg.toFixed(1)]); this.cageEnd('staff'); } this.setState(f, 'chase'); }
      return [null, 0, P.position];
    }
    // the mark: a lock shadow on the floor where you stood; stay in it 2 s and the cage drops
    const m = f.markAt;
    if (m) {
      m.t += dt; const p = P.position;
      if (m.t >= PHAR.mark) {
        f.markAt = null;
        if (this.playerAlive() && Math.hypot(p.x - m.x, p.z - m.z) < PHAR.stayR) this.cageDrop(f, m);
        else this.log.push(['mark', 'missed']);
      }
    } else if (!this.cage && (f.nextMark || 0) <= this.time && f.seen && f.aware >= 1 && this.playerAlive() && this.dist(f, P.position) <= PHAR.range) {
      const p = P.position; f.markAt = { x: p.x, z: p.z, y: this.nav.heightAt(p.x, p.z), t: 0 }; f.nextMark = this.time + PHAR.every;
      this.log.push(['mark', 'set']); this.G.audio?.play('aim_beep', { x: p.x, y: p.y, z: p.z }, 0.8, 0.5);
    }
    if (this.cage && !this.cage.dead) { this.cage.t += dt; if (this.cage.t >= PHAR.staff && f.state !== 'staff') { this.setState(f, 'staff'); f.atkEnd = this.time + 0.6; this.log.push(['staff', 'raise']); return [null, 0, P.position]; } }
    return this.bMelee(f, dt);
  },
  cageDrop(f, m) {
    const P = this.player, G = this.G;
    const c = this.cage = { x: m.x, z: m.z, y: m.y, hp: PHAR.cageHp, t: 0, dead: false, owner: f, mesh: this.cageMesh(m.x, m.y, m.z) };
    P.heldBy = c; P.mash = 0; if (G.grab?.held) G.grab.release(false);
    G.audio?.play('stomp', { x: m.x, y: m.y + 1, z: m.z }, 1.1, 1.3); this.log.push(['cage', 'drop']); G.events.emit('foe:cage', { what: 'drop' });
  },
  /** A hit on the cage from inside (melee.js asks first while the player is caged). Returns true when it took the hit. */
  cageHit(dmg) {
    const c = this.cage, P = this.player; if (!c || c.dead || P.heldBy !== c) return false;
    c.hp -= dmg; this.G.audio?.play('punch_wall', { x: c.x, y: c.y + 1, z: c.z }, 0.9, 1.3); this.log.push(['cage', 'hit', +c.hp.toFixed(1)]);
    if (c.hp <= 0) this.cageEnd('broken');
    return true;
  },
  cageEnd(why) {
    const c = this.cage, P = this.player; if (!c) return;
    c.dead = true; if (P.heldBy === c) P.heldBy = null; this.root.remove(c.mesh); this.cage = null;
    this.G.melee?.fx?.burst?.(new THREE.Vector3(c.x, c.y + 1, c.z), new THREE.Vector3(0, 1, 0), 10, 8);
    this.log.push(['cage', why]); this.G.events.emit('foe:cage', { what: why });
  },
  cageMesh(x, y, z) {
    const g = new THREE.Group(), bone = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.7 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.1, 6), bone); b.position.set(Math.cos(a) * 0.62, 1.05, Math.sin(a) * 0.62); g.add(b); }
    for (const yy of [0.05, 2.1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 20), bone); r.rotation.x = Math.PI / 2; r.position.y = yy; g.add(r); }
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bone); sk.position.y = 2.25; g.add(sk);
    g.position.set(x, y, z); this.root.add(g); return g;
  },

  // ------------------------------------------------------------------ joker
  bJoker(f, dt) {
    const G = this.G;
    if (!f.fakes) { f.fakes = []; if (f.fakeT === undefined) f.fakeT = JOKER.fakeEvery * 0.5; }
    // fake loot: drops one where it stands every 20 s (at most 3 lying around)
    f.fakeT -= dt; f.fakes = f.fakes.filter((it) => !it.dead);
    if (f.fakeT <= 0) { f.fakeT = JOKER.fakeEvery; if (f.fakes.length < JOKER.fakeMax) this.jokerFake(f); }
    // picked up by the beam (grabbedAt is set on the grab, even if let go the same tick), loaded in a cart, or by a bot
    for (const it of [...f.fakes]) if (G.grab?.held === it || it.inCart || it.grabbedAt > -99 || (G.bots?.list || []).some((b) => b.carry === it)) this.jokerBoom(f, it);
    // a trap touched: rush the one who touched it, x2.2, up to 10 s
    if (f.rush && (f.rush.until < this.time || (f.rush.who === 'P' ? !this.playerAlive() : f.rush.who.down))) f.rush = null;
    if (f.rush) {
      const w = f.rush.who, p = w === 'P' ? this.player.position : w; f.aware = 1; f.lastSeen = { x: p.x, z: p.z };
      if (w === 'P' && this.dist(f, p) < 1.2 && f.cdT <= 0) return this.bMelee(f, dt);
      return [{ x: p.x, z: p.z }, f.speed * JOKER.rush, p];
    }
    return this.bMelee(f, dt);
  },
  /** Called by the traps (foes.js listens to 'trap:touch'). */
  jokerRush(who) {
    for (const f of this.list) if (!f.dead && f.def.beh === 'joker') { f.rush = { who, until: this.time + JOKER.rushMax }; this.log.push(['jokerRush', who === 'P' ? 'player' : who.crew]); }
  },
  jokerFake(f) {
    const G = this.G, x = f.x - Math.sin(f.yaw) * 0.7, z = f.z - Math.cos(f.yaw) * 0.7;
    const at = this.nav.okW(x, z) ? { x, z } : { x: f.x, z: f.z };
    const it = G.loot.spawn({ material: 'wood', size: 'medium', pos: { x: at.x, y: this.nav.heightAt(at.x, at.z) + 0.5, z: at.z }, value: Math.round((3000 + 4000 * this.rng()) / 100) * 100 });
    it.fake = true; it.fakeBy = f; f.fakes.push(it);
    this.log.push(['fake', it.value]);
    return it;
  },
  jokerBoom(f, it) {
    const G = this.G, t = it.body.translation();
    if (G.grab?.held === it) G.grab.release(false);
    G.loot.destroy(it, true);
    this.explode(t.x, t.z, JOKER.boomR, JOKER.boomPow, f);
    // the clown box: a striped box that pops up and a spring head
    const g = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xd02a2a, roughness: 0.5 }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x401010 })); head.position.y = 0.55; box.position.y = 0.2; g.add(box, head);
    g.position.set(t.x, this.nav.heightAt(t.x, t.z), t.z); this.root.add(g); (this.boxes ||= []).push({ g, t: 0 });
    this.log.push(['fakeBoom']); G.events.emit('foe:fakeBoom', { foe: f });
  },

  // ------------------------------------------------------------------ looks (render) and sim upkeep
  stepBosses(dt) {
    for (const b of [...(this.bats || [])]) { b.t += dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.set(Math.sin(b.t * 30) * 0.8, b.t * 3, 0); if (b.t > 0.9) { this.root.remove(b.m); this.bats.splice(this.bats.indexOf(b), 1); } }
    for (const b of [...(this.boxes || [])]) { b.t += dt; b.g.children[1].position.y = 0.55 + 0.25 * Math.sin(b.t * 12) * Math.exp(-b.t * 2); if (b.t > 4) { this.root.remove(b.g); this.boxes.splice(this.boxes.indexOf(b), 1); } }
  },
  movesFxD() {
    // vampire's red ring, pharaoh's lock shadow
    if (!this.bossRing) {
      this.bossRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })); this.root.add(this.bossRing);
      this.lockMark = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x180c00, transparent: true, opacity: 0.6, depthWrite: false })); this.root.add(this.lockMark);
    }
    const v = this.list.find((f) => !f.dead && f.def.beh === 'vampire' && f.state === 'ring');
    this.bossRing.visible = !!v; if (v) { this.bossRing.position.set(v.x, v.gy + 0.03, v.z); this.bossRing.scale.setScalar(VAMP.ringR); this.bossRing.material.opacity = 0.5 + 0.45 * Math.abs(Math.sin(this.time * 9)); }
    const ph = this.list.find((f) => !f.dead && f.markAt);
    this.lockMark.visible = !!ph; if (ph) { const m = ph.markAt; this.lockMark.position.set(m.x, m.y + 0.02, m.z); this.lockMark.scale.setScalar(PHAR.stayR * (0.5 + 0.5 * Math.min(1, m.t / PHAR.mark))); }
    // the alien's ink on the screen (DOM blots, no words)
    const P = this.player, root = document.querySelector('.hx');
    if (root) {
      if (!this.inkEl) {
        const e = this.inkEl = document.createElement('div'); e.className = 'hx-ink';
        Object.assign(e.style, { position: 'absolute', inset: '0', pointerEvents: 'none', display: 'none', background: 'radial-gradient(circle at 30% 40%, #000 0 18%, transparent 19%), radial-gradient(circle at 62% 55%, #000 0 22%, transparent 23%), radial-gradient(circle at 48% 25%, #050008 0 14%, transparent 15%), radial-gradient(circle at 75% 30%, #000 0 11%, transparent 12%), radial-gradient(circle at 40% 72%, #04000a 0 16%, transparent 17%)' });
        root.appendChild(e);
      }
      const k = Math.min(1, (P.inkT || 0) / 1); this.inkEl.style.display = (P.inkT || 0) > 0 ? 'block' : 'none'; this.inkEl.style.opacity = k.toFixed(2);
    }
  },
};
