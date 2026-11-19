// Draws the sim's units: four Blockade Z heroes, the zombie pool in puppet mode, and a few code-built summons.
// sync(B, dt) is called once per rendered frame after the sim ticks; onEvent(e) is called for every sim event.
import { CAST_KEY, SWING_HOLDS, FLY_Y } from './keys.js?v=20261120a';
import { createMarks } from './marks.js?v=20261120a';
import { createFxMap } from './fxmap.js?v=20261120a';
import { createHorde } from './horde.js?v=20261120a';

const THREE = window.THREE;
const BZ = window.BZ;

const HERO_SCALE = 1.15;
const SPAWN_T = 0.6;           // the sim's enemy spawnT
const HEAD_SCALE = 1.18;
const ELITE_AFFIX = 2;
const STATUS_BITS = { burn: 16, slow: 32, freeze: 32, poison: 128, root: 4096, bleed: 8192 };
const SUMMON_LOOK = { drone: 2.1, turret: 0.9, cannon: 0.9, wolf: 0.5 };

const wrap = BZ.wrapAngle;
const yawOf = (face) => Math.PI / 2 - face;

export function createActors(H) {
  const { G, scene, camera } = H;
  const heroes = new Map(); const summons = new Map(); const slots = new Map();
  const pool = G.zombies.list;
  const bars = new Set();
  let B = null; let hitBudget = 0; let fxBudget = 0;
  const tmp = new THREE.Vector3(); const tip = new THREE.Vector3(); const dirV = new THREE.Vector3();
  const warned = new Set();
  const marks = createMarks(H);
  const horde = createHorde(H);
  const overflow = new Set();
  const fx = createFxMap(H, marks, {
    unit: (uid) => (B ? B.byUid.get(uid) : null), time: () => (B ? B.t : 0),
    colorOf: (uid) => { const u = B && B.byUid.get(uid); const bz = u && BZ.HEROES.find((h) => h.id === u.kind); return bz ? bz.color : 0xffffff; },
  });

  // ---- bars: a fixed on-screen size (CSS px at the 360 frame), so they never grow with the camera ----
  const BAR_GEO = new THREE.PlaneGeometry(1, 1);
  const camFwd = new THREE.Vector3();
  function makeBar(color, wpx = 34, hpx = 5) {
    const g = new THREE.Group();
    const mk = (c, order) => { const m = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: c, depthWrite: false, depthTest: false, fog: false, transparent: true })); m.renderOrder = order; return m; };
    const bg = mk(0x10141c, 8); const fg = mk(color, 9); const sh = mk(0xffffff, 10); sh.visible = false;
    g.add(bg, fg, sh); g.userData = { bg, fg, sh, wpx, hpx, color }; g.visible = false; scene.add(g); bars.add(g); return g;
  }
  function setBar(bar, x, y, z, k, shieldK = 0) {
    const d = bar.userData; bar.visible = true; bar.position.set(x, y, z); bar.quaternion.copy(camera.quaternion);
    camera.getWorldDirection(camFwd); const depth = Math.max(1, tmp.set(x, y, z).sub(camera.position).dot(camFwd));
    const wpp = 2 * depth * Math.tan(camera.fov * Math.PI / 360) / H.size.h * H.size.u;
    const W = d.wpx * wpp; const Hh = d.hpx * wpp; const bd = 1.2 * wpp;
    k = Math.max(0, Math.min(1, k)); let ss = Math.max(0, shieldK);
    if (k + ss > 1) { const t = k + ss; k /= t; ss /= t; }
    d.bg.scale.set(W + 2 * bd, Hh + 2 * bd, 1);
    d.fg.visible = k > 0.002; d.fg.scale.set(W * k, Hh, 1); d.fg.position.x = -W / 2 + (W * k) / 2;
    d.fg.material.color.setHex(d.color === 0x4cd860 ? (k < 0.3 ? 0xf04838 : 0x4cd860) : d.color);
    d.sh.visible = ss > 0.002; d.sh.scale.set(W * ss, Hh, 1); d.sh.position.x = -W / 2 + W * k + (W * ss) / 2;
  }
  const dropBar = (bar) => { scene.remove(bar); bars.delete(bar); };

  // ---- blob shadows: one instanced quad per unit, so every tier has grounded units ----
  const blobCv = document.createElement('canvas'); blobCv.width = blobCv.height = 64;
  { const c = blobCv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(10,14,30,.62)'); g.addColorStop(0.55, 'rgba(10,14,30,.38)'); g.addColorStop(1, 'rgba(10,14,30,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const BLOBS = 256;
  const blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCv), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), BLOBS);
  blobs.frustumCulled = false; blobs.renderOrder = 2; blobs.count = 0; scene.add(blobs);
  const bm = new THREE.Matrix4(); const bq = new THREE.Quaternion(); const bs = new THREE.Vector3(); const bp = new THREE.Vector3();
  let nBlob = 0;
  const addBlob = (x, z, size, y = 0) => { if (nBlob >= BLOBS) return; const fade = 1 / (1 + y * 0.35); bs.set(size * fade, 1, size * fade); bp.set(x, 0.045, z); bm.compose(bp, bq, bs); blobs.setMatrixAt(nBlob++, bm); };
  // ---- team rims on the floor: warm red under every enemy, stronger for elites and bosses (heroes wear their own disc) ----
  const RIMS = 256;
  const rims = new THREE.InstancedMesh(new THREE.RingGeometry(0.5, 0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), RIMS);
  rims.frustumCulled = false; rims.renderOrder = 2; rims.count = 0; scene.add(rims);
  const RIM_COL = { base: new THREE.Color(0xd8402a), elite: new THREE.Color(0xff7a2a), boss: new THREE.Color(0xff3020) };
  let nRim = 0;
  const addRim = (x, z, size, col) => { if (nRim >= RIMS) return; bs.set(size, 1, size); bp.set(x, 0.05, z); bm.compose(bp, bq, bs); rims.setMatrixAt(nRim, bm); rims.setColorAt(nRim++, col); };

  // ---- heroes ----
  function newHeroState(mode) { return { speed: 0, mode, swing: -1, kick: 0, kickL: 0, draw: 1, air: 0, vy: 0, pitch: 0, dead: 0, hurt: 0, hurtDir: 0, pat: 'r2l', cast: 0 }; }
  function makeHero(u) {
    const bz = BZ.HEROES.find((h) => h.id === u.kind) || BZ.HEROES[3];
    const m = BZ.heroModel(bz.id); const W = BZ.WEAPONS[bz.weapon] || {};
    const eq = BZ.equipWeapon(m, bz.weapon);
    const node = new THREE.Group(); node.scale.setScalar(HERO_SCALE); node.add(m.root); scene.add(node);
    if (m.head) m.head.scale.setScalar(HEAD_SCALE);
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 28), new THREE.MeshBasicMaterial({ color: bz.color, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; scene.add(disc);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    bubble.visible = false; scene.add(bubble);
    const a = {
      u, m, eq, W, wid: bz.weapon, node, disc, bubble, bar: makeBar(0x4cd860, 34, 5), skinKey: '', st: newHeroState(BZ.holdOf(W)),
      pos: new THREE.Vector3(u.x, 0, u.z), yaw: yawOf(u.face), swingT: 0, swingDur: 0.4, combo: 0, side: 0, deadT: 0, fastT: 0, sndT: 0, rib: null, spin: 0,
    };
    a.node.position.copy(a.pos); m.root.rotation.y = a.yaw;
    heroes.set(u.uid, a); return a;
  }

  // stealth and frozen look: the model's materials are shared through BZ.mat, so a hero gets its own copies the first time
  function skin(a, opacity, emissive) {
    const key = opacity + ':' + emissive; if (a.skinKey === key) return;
    if (!a.cloned) { a.cloned = true; a.node.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); }); }
    a.skinKey = key;
    a.node.traverse((o) => { if (!o.isMesh || !o.material) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.emissive) m.emissive.setHex(emissive); m.transparent = opacity < 1 || m.userData.wasT; if (m.userData.wasT === undefined) m.userData.wasT = m.transparent && opacity >= 1; m.opacity = opacity; m.depthWrite = opacity >= 1; m.needsUpdate = true; } });
  }

  function syncHero(a, dt) {
    const u = a.u; const st = a.st; const m = a.m;
    const dx = u.x - a.pos.x; const dz = u.z - a.pos.z; const far = Math.hypot(dx, dz);
    const lam = far > 2.2 || a.fastT > 0 ? 34 : 16; a.fastT = Math.max(0, a.fastT - dt);
    const k = 1 - Math.exp(-lam * dt); const bx = a.pos.x; const bz = a.pos.z;
    a.pos.x += dx * k; a.pos.z += dz * k;
    const sp = dt > 1e-4 ? Math.min(9, Math.hypot(a.pos.x - bx, a.pos.z - bz) / dt) : 0;
    a.yaw += wrap(yawOf(u.face) - a.yaw) * Math.min(1, dt * 12);
    a.node.position.set(a.pos.x, 0, a.pos.z); m.root.rotation.y = a.yaw;
    a.disc.position.x = a.pos.x; a.disc.position.z = a.pos.z; a.disc.visible = u.alive;
    if (!u.alive) {
      addBlob(a.pos.x, a.pos.z, 2.3);
      a.deadT = Math.max(0.001, a.deadT + dt); st.dead = a.deadT; st.speed = 0; st.swing = -1; st.kick = 0; st.kickL = 0;
      BZ.animHero(m, st, dt); BZ.heroFall(m, a.deadT, 1); a.bar.visible = false; a.bubble.visible = false; return;
    }
    if (a.deadT) { a.deadT = 0; st.dead = 0; m.root.rotation.x = 0; m.root.position.y = 0; }
    const stunned = u.status && (u.status.stun || u.status.freeze);
    st.speed = stunned ? 0 : sp;
    a.swingT = Math.max(0, a.swingT - dt); st.swing = a.swingT > 0 ? 1 - a.swingT / a.swingDur : -1;
    st.kick = Math.max(0, st.kick - dt * 30); st.kickL = Math.max(0, st.kickL - dt * 30); a.sndT -= dt;
    if (a.eq && a.eq.gun) {
      const bar = a.eq.gun.getObjectByName('barrels');
      if (bar) { a.spin = (a.spin + (u.anim === 'attack' || st.kick > 0 ? 36 * dt : 0)) % (Math.PI * 2); bar.rotation.z = a.spin; }
    }
    BZ.animHero(m, st, dt); BZ.heroGun(m, st, a.eq && a.eq.gun);
    const W = a.W;
    if (W.melee && !W.noTrail && a.eq && a.eq.tip) {
      if (!a.rib) a.rib = G.fx.ribbon();
      if (st.swing >= 0.15 && st.swing < 0.75) { a.node.updateMatrixWorld(true); a.rib.push(a.eq.tip.getWorldPosition(tip.clone()), m.handR.getWorldPosition(tmp.clone())); }
      a.rib.update(dt, W.trail || 0xffffff, 0.9);
    }
    a.bubble.visible = u.state.invuln > 0 || u.shield > 0;
    if (a.bubble.visible) { a.bubble.material.color.setHex(u.state.invuln > 0 ? 0xffd860 : 0xa8dcff); a.bubble.position.set(a.pos.x, 1.2, a.pos.z); a.bubble.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.03); }
    skin(a, u.state.stealth > 0 ? 0.35 : 1, u.status && u.status.freeze ? 0x2a6a9a : 0);
    if (H.spectateUid === u.uid) a.bar.visible = false; else setBar(a.bar, a.pos.x, 3.05, a.pos.z, u.hp / u.maxHp, u.shield > 0 ? u.shield / u.maxHp : 0);
    addBlob(a.pos.x, a.pos.z, 2.3);
  }

  // ---- summons: small code-built bodies ----
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); o.position.set(x, y, z); o.castShadow = H.quality.shadow > 0; return o; };
  const cyl = (r0, r1, h, c, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), lam(c)); o.castShadow = H.quality.shadow > 0; return o; };
  function buildDrone() {
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    body.add(box(0.55, 0.22, 0.55, 0x3c78d8)); body.add(box(0.3, 0.12, 0.3, 0xf0f4ff, 0, 0.16, 0));
    const gun = box(0.12, 0.12, 0.7, 0x2a2f3a, 0, -0.1, 0.45); body.add(gun);
    const rotors = [];
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) { const r = cyl(0.3, 0.3, 0.03, 0xe8eef8, 14); r.position.set(x, 0.18, z); body.add(r); rotors.push(r); }
    return { root: g, body, rotors, tick(a, dt, t) { for (const r of rotors) r.rotation.y += dt * 40; body.position.y = Math.sin(t * 3 + a.u.uid) * 0.12; } };
  }
  function buildTurret() {
    const g = new THREE.Group(); const head = new THREE.Group(); head.position.y = 0.85; g.add(head);
    for (let i = 0; i < 3; i++) { const l = cyl(0.04, 0.05, 0.9, 0x3a3f4a, 6); const an = i / 3 * Math.PI * 2; l.position.set(Math.cos(an) * 0.28, 0.42, Math.sin(an) * 0.28); l.rotation.set(Math.sin(an) * 0.3, 0, -Math.cos(an) * 0.3); g.add(l); }
    head.add(box(0.5, 0.36, 0.55, 0xe8a030)); head.add(box(0.12, 0.12, 0.85, 0x2a2f3a, 0, 0.04, 0.6)); head.add(box(0.2, 0.1, 0.2, 0xff5030, 0, 0.24, -0.1));
    return { root: g, aim: head, tick() {} };
  }
  function buildCannon() {
    const g = new THREE.Group(); const head = new THREE.Group(); head.position.y = 0.75; g.add(head);
    g.add(box(1.0, 0.3, 0.8, 0x5c6470, 0, 0.3, 0));
    for (const s of [-1, 1]) { const w = cyl(0.36, 0.36, 0.14, 0x22252c, 14); w.rotation.z = Math.PI / 2; w.position.set(s * 0.55, 0.36, 0); g.add(w); }
    const tube = cyl(0.2, 0.26, 1.5, 0xc84a3a, 10); tube.rotation.x = Math.PI / 2 - 0.35; tube.position.set(0, 0.15, 0.5); head.add(tube);
    head.add(box(0.5, 0.4, 0.5, 0x8a929e, 0, 0, -0.1));
    return { root: g, aim: head, tick() {} };
  }
  function buildWolf() {
    const g = new THREE.Group(); const body = new THREE.Group(); body.position.y = 0.5; g.add(body);
    body.add(box(0.42, 0.4, 0.95, 0x8d97b0)); body.add(box(0.36, 0.34, 0.4, 0xa6b0c8, 0, 0.12, 0.6)); body.add(box(0.2, 0.16, 0.24, 0x6a7390, 0, 0.06, 0.88));
    body.add(box(0.08, 0.16, 0.08, 0x6a7390, -0.12, 0.38, 0.55)); body.add(box(0.08, 0.16, 0.08, 0x6a7390, 0.12, 0.38, 0.55));
    const tail = box(0.1, 0.1, 0.5, 0x8d97b0, 0, 0.12, -0.7); tail.rotation.x = -0.5; body.add(tail);
    body.add(box(0.07, 0.07, 0.07, 0xffe060, -0.1, 0.2, 0.8)); body.add(box(0.07, 0.07, 0.07, 0xffe060, 0.1, 0.2, 0.8));
    const legs = [];
    for (const [x, z] of [[-0.15, 0.32], [0.15, 0.32], [-0.15, -0.32], [0.15, -0.32]]) { const l = new THREE.Group(); l.position.set(x, 0.5, z); l.add(box(0.12, 0.5, 0.12, 0x6a7390, 0, -0.25, 0)); g.add(l); legs.push(l); }
    return { root: g, body, legs, phase: 0, tick(a, dt) { this.phase += dt * a.speed * 2.2; legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i % 3 === 0 ? 0 : Math.PI)) * Math.min(0.9, a.speed * 0.15); }); body.rotation.z = Math.sin(this.phase) * 0.04; } };
  }
  function buildDecoy(owner) {
    const bz = BZ.HEROES.find((h) => h.id === owner.kind) || BZ.HEROES[3];
    const m = BZ.heroModel(bz.id); BZ.equipWeapon(m, bz.weapon);
    const own = (mat) => { const c = mat.clone(); c.transparent = true; c.opacity = 0.45; c.depthWrite = false; return c; };
    m.root.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
    const g = new THREE.Group(); g.scale.setScalar(HERO_SCALE); g.add(m.root);
    const st = newHeroState(BZ.holdOf(BZ.WEAPONS[bz.weapon]));
    return { root: g, tick(a, dt) { BZ.animHero(m, st, dt); } };
  }
  const BUILD = { drone: buildDrone, turret: buildTurret, cannon: buildCannon, wolf: buildWolf, decoy: buildDecoy };

  function makeSummon(u) {
    const owner = B && B.byUid.get(u.owner);
    const b = BUILD[u.kind] ? BUILD[u.kind](owner || u) : buildDrone();
    scene.add(b.root); b.root.position.set(u.x, 0, u.z);
    const a = Object.assign(b, { u, pos: new THREE.Vector3(u.x, 0, u.z), yaw: yawOf(u.face), speed: 0, age: 0, node: b.root });
    summons.set(u.uid, a); return a;
  }
  function syncSummon(a, dt) {
    const u = a.u; const bx = a.pos.x; const bz = a.pos.z; const k = 1 - Math.exp(-18 * dt);
    a.pos.x += (u.x - a.pos.x) * k; a.pos.z += (u.z - a.pos.z) * k;
    a.speed = dt > 1e-4 ? Math.hypot(a.pos.x - bx, a.pos.z - bz) / dt : 0;
    a.yaw += wrap(yawOf(u.face) - a.yaw) * Math.min(1, dt * 10);
    a.age += dt; const grow = Math.min(1, a.age / 0.25);
    a.root.position.set(a.pos.x, 0, a.pos.z); a.root.scale.setScalar(Math.max(0.01, grow));
    if (a.aim) { a.aim.rotation.y = a.yaw; a.root.rotation.y = 0; } else a.root.rotation.y = a.yaw;
    a.tick(a, dt, performance.now() / 1000);
    if (u.kind === 'drone') a.root.position.y = SUMMON_LOOK.drone;
    addBlob(a.pos.x, a.pos.z, u.kind === 'drone' ? 1.2 : 1.4, u.kind === 'drone' ? 2 : 0);
  }

  // ---- enemies: rows for the zombie pool ----
  function slotOf(e) {
    let i = slots.get(e.uid); if (i !== undefined) return i;
    const used = new Set(slots.values());
    for (let j = 0; j < pool.length; j++) if (!used.has(j) && !pool[j].alive && !pool[j].dying) { slots.set(e.uid, j); return j; }
    let best = -1; let bt = 0;
    for (let j = 0; j < pool.length; j++) if (!used.has(j) && pool[j].dying > bt) { bt = pool[j].dying; best = j; }
    if (best >= 0) { slots.set(e.uid, best); return best; }
    return -1;
  }
  function flagsOf(e) {
    let f = 0;
    if (e.anim === 'attack') f |= 4;
    if (e.status) { for (const k in e.status) if (STATUS_BITS[k]) f |= STATUS_BITS[k]; if (e.status.freeze) f |= 2; else if (e.status.stun && !e.boss) f |= 8; }
    if (e.anim === 'cast' && !e.boss) f |= 2048;
    return f;
  }
  const rows = [];
  function enemyRows() {
    rows.length = 0; overflow.clear();
    const ids = G.zombies.TYPE_IDS;
    for (const e of B.enemies) {
      if (!e.alive) continue;
      const ti = ids.indexOf(e.kind);
      if (ti < 0) { if (!warned.has(e.kind)) { warned.add(e.kind); console.warn('[actors] no zombie type for enemy kind ' + e.kind); } continue; }
      if (e.horde) continue;
      const idx = slotOf(e); if (idx < 0) { overflow.add(e.uid); continue; }
      const y = e.fly ? (FLY_Y[e.kind] || 3) : 0;
      rows.push([idx, ti, e.x, y, e.z, yawOf(e.face), Math.round(255 * Math.max(0, e.hp) / e.maxHp), flagsOf(e), e.elite ? ELITE_AFFIX : 0]);
    }
    for (const [uid, idx] of slots) { const e = B.byUid.get(uid); if (!e || !e.alive) slots.delete(uid); void idx; }
    return rows;
  }
  const enemyBars = new Map();
  function syncEnemyBars() {
    const seen = new Set();
    for (const e of B.enemies) {
      if (!e.alive || !(e.boss || e.elite)) continue;
      const idx = slots.get(e.uid); if (idx === undefined) continue; const z = pool[idx]; if (!z.alive) continue;
      let bar = enemyBars.get(e.uid); if (!bar) { bar = makeBar(0xe84030, e.boss ? 72 : 30, e.boss ? 8 : 4); enemyBars.set(e.uid, bar); }
      seen.add(e.uid); const sc = z.T.scale;
      setBar(bar, z.pos.x, z.pos.y + 2.5 * sc + 0.5, z.pos.z, e.hp / e.maxHp);
    }
    for (const [uid, bar] of enemyBars) if (!seen.has(uid)) { dropBar(bar); enemyBars.delete(uid); }
  }

  // ---- events ----
  const heroOf = (uid) => heroes.get(uid);
  const unitOf = (uid) => (B ? B.byUid.get(uid) : null);
  function muzzleOf(a) {
    a.node.updateMatrixWorld(true);
    if (a.eq && a.eq.tip) return a.eq.tip.getWorldPosition(tip);
    return a.m.handR.getWorldPosition(tip);
  }
  const ON = {
    attack(e) {
      const a = heroOf(e.uid); const tgtY = 1.0;
      if (a) {
        const W = a.W; const st = a.st;
        if (SWING_HOLDS.has(st.mode)) {
          st.pat = W.combo ? W.combo[a.combo++ % W.combo.length] : 'r2l'; a.swingDur = Math.min(0.5, W.swing || W.throwT || 0.4); a.swingT = a.swingDur;
        } else if (st.mode === 'dual') { a.side = 1 - a.side; if (a.side) st.kickL = 6; else st.kick = 6; } else st.kick = 6;
        if (a.sndT <= 0) { a.sndT = 0.14; G.audio.playAt(W.snd || 'pistol', a.pos, { gain: 0.4 }); }
        fx.attack(e, muzzleOf(a).clone(), true);
        return;
      }
      const s = summons.get(e.uid);
      if (s && (e.kind === 'shot')) { tmp.set(e.x, SUMMON_LOOK[s.u.kind] || 1, e.z); G.fx.tracer(tmp.clone(), new THREE.Vector3(e.tx, tgtY, e.tz)); G.fx.muzzle(tmp); return; }
      if (!s && fxBudget > 0) { fxBudget--; fx.attack(e, new THREE.Vector3(e.x, 1.4, e.z), false); }
    },
    hit(e) {
      if (e.dot || !e.dmg) return;
      const idx = slots.get(e.uid); const a = heroOf(e.uid);
      if (a) { a.st.hurt++; return; }
      if (idx === undefined || hitBudget <= 0) return;
      const z = pool[idx]; const u = unitOf(e.uid); if (!z || !z.alive || !u || (z.hitT || 0) > B.t) return;
      z.hitT = B.t + 0.12; hitBudget--;
      const by = unitOf(e.by);
      if (by) dirV.set(u.x - by.x, 0, u.z - by.z).normalize(); else dirV.set(0, 0, 1);
      G.zombies.damage(z, z.maxHp * Math.min(0.5, Math.max(0.03, e.dmg / u.maxHp)), 'body', dirV.clone(), 1, {});
    },
    die(e) {
      const idx = slots.get(e.uid);
      if (idx !== undefined) {
        const z = pool[idx]; const by = unitOf(e.by); const u = unitOf(e.uid);
        if (z && z.alive) {
          if (by && u) dirV.set(u.x - by.x, 0, u.z - by.z); else dirV.set(G.rng.range(-1, 1), 0, G.rng.range(-1, 1));
          dirV.normalize();
          if (z.T.fly || (u && u.fly)) z.pos.y = 0;
          G.zombies.kill(z, 'body', dirV.clone(), { credit: false });
        }
        slots.delete(e.uid); const bar = enemyBars.get(e.uid); if (bar) { dropBar(bar); enemyBars.delete(e.uid); }
      }
      if (e.expire) dropSummon(e.uid);
    },
    gone(e) { slots.delete(e.uid); dropSummon(e.uid); const h = heroes.get(e.uid); if (h) dropHero(h); },
    cast(e) {
      const a = heroOf(e.uid);
      if (a) { const key = CAST_KEY[e.key]; if (key && BZ.CAST_ANIM[key]) a.st.act = { key, t: 0 }; return; }
      const idx = slots.get(e.uid); const u = unitOf(e.uid); if (idx === undefined || !u) return;
      const sk = u.skills.find((s) => s.slot === e.slot); const move = sk && sk.def.move;
      if (move && u.boss) G.zombies.kinds.remote({ t: 'bm', i: idx, m: move, d: sk.def.lock || 1 });
    },
    ult(e) { ON.cast(e); },
    dash(e) { const a = heroOf(e.uid); if (a) a.fastT = 0.3; },
    revive(e) { const a = heroOf(e.uid); if (a) { a.deadT = 0; a.st.dead = 0; a.m.root.rotation.x = 0; a.m.root.position.y = 0; } },
  };

  function dropSummon(uid) { const s = summons.get(uid); if (s) { scene.remove(s.root); summons.delete(uid); } }
  function dropHero(a) { scene.remove(a.node); scene.remove(a.disc); scene.remove(a.bubble); dropBar(a.bar); if (a.rib) scene.remove(a.rib.mesh); heroes.delete(a.u.uid); }

  const api = {
    onEvent(e) { const h = ON[e.e]; if (h) h(e); fx.onEvent(e); horde.onEvent(e); },
    sync(batl, dt) {
      B = batl; hitBudget = 10; fxBudget = 6; nBlob = 0;
      for (const u of B.heroes) { let a = heroes.get(u.uid); if (!a) a = makeHero(u); syncHero(a, dt); }
      for (const u of B.units) {
        if (!u.summon) continue;
        if (!u.alive) { dropSummon(u.uid); continue; }
        let s = summons.get(u.uid); if (!s) s = makeSummon(u); syncSummon(s, dt);
      }
      G.zombies.adopt(enemyRows()); G.zombies.update(dt);
      // stepping out of the fog: a rim spawn rises and grows over its spawnT (the sim holds it untargetable for the same time)
      for (const e of B.enemies) {
        if (!e.alive) continue; const idx = slots.get(e.uid); const z = idx === undefined ? null : pool[idx]; if (!z || !z.alive || z.dying) continue;
        if (e.spawnT > 0) { const g = 1 - Math.pow(Math.max(0, e.spawnT) / SPAWN_T, 2); z.rising = true; z.body.root.scale.setScalar(z.T.scale * (0.35 + 0.65 * g)); z.body.root.position.y -= (1 - g) * 1.1 * z.T.scale; }
        else if (z.rising) { z.rising = false; z.body.root.scale.setScalar(z.T.scale); }
      }
      for (const z of pool) if (z.alive && !z.dying) addBlob(z.pos.x, z.pos.z, 1.7 * z.T.scale, z.pos.y);
      nRim = 0;
      horde.sync(B, dt, overflow, { blob: addBlob, rim: (x, z, size) => addRim(x, z, size, RIM_COL.base) });
      blobs.count = nBlob; blobs.instanceMatrix.needsUpdate = true;
      for (const e of B.enemies) {
        if (!e.alive) continue; const idx = slots.get(e.uid); if (idx === undefined) continue; const z = pool[idx]; if (!z || !z.alive || z.dying) continue;
        const k = e.boss ? 'boss' : e.elite ? 'elite' : 'base'; addRim(z.pos.x, z.pos.z, (e.boss ? 1.6 : e.elite ? 1.25 : 1) * z.T.scale, RIM_COL[k]);
      }
      rims.count = nRim; rims.instanceMatrix.needsUpdate = true; if (rims.instanceColor) rims.instanceColor.needsUpdate = true;
      syncEnemyBars(); fx.update(B, dt);
    },
    clear() {
      for (const a of [...heroes.values()]) dropHero(a);
      for (const uid of [...summons.keys()]) dropSummon(uid);
      for (const bar of [...enemyBars.values()]) dropBar(bar);
      enemyBars.clear(); slots.clear(); G.zombies.clear(); G.fx.clear(); fx.clear(); blobs.count = 0; rims.count = 0; horde.clear(); B = null;
    },
    fx, marks, horde,
    scaleOf(uid) { if (heroes.has(uid)) return HERO_SCALE; const i = slots.get(uid); return i !== undefined ? pool[i].T.scale : horde.scaleOf(uid); },
    nodeOf(uid) {
      const h = heroes.get(uid); if (h) return h.node;
      const s = summons.get(uid); if (s) return s.root;
      const i = slots.get(uid); return i !== undefined ? pool[i].body.root : horde.nodeOf(uid);
    },
    headPos(uid, out) {
      const h = heroes.get(uid); if (h) return out.set(h.pos.x, 2.6, h.pos.z);
      const s = summons.get(uid); if (s) return out.set(s.pos.x, 1.6, s.pos.z);
      const i = slots.get(uid); if (i !== undefined) { const z = pool[i]; return out.set(z.pos.x, z.pos.y + 2.1 * z.T.scale, z.pos.z); }
      return horde.headPos(uid, out);
    },
  };
  void lam;
  H.scaleOf = api.scaleOf;
  return api;
}
