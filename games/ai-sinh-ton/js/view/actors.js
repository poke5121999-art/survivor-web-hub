// Draws the sim's units: the four beasts of the team (beast/ kit), the zombie pool in puppet mode, and a few code-built summons.
// sync(B, dt) is called once per rendered frame after the sim ticks; onEvent(e) is called for every sim event.
import { FLY_Y } from './keys.js?v=20261124a';
import { createMarks } from './marks.js?v=20261124a';
import { createFxMap } from './fxmap.js?v=20261124a';
import { createHorde } from './horde.js?v=20261124a';
import { arrive } from './arrival.js?v=20261124a';
import { buildBeast, LEGACY } from './beast/index.js?v=20261124a';
import { actFor, stepAct, usePool } from './bossacts.js?v=20261124a';
import { dressBoss } from './foe/bosses.js?v=20261124a';
import { createWarn } from './foe/warn.js?v=20261124a';

const THREE = window.THREE;
const BZ = window.BZ;

const ELITE_AFFIX = 2;
const STATUS_BITS = { burn: 16, slow: 32, freeze: 32, poison: 128, root: 4096, bleed: 8192 };
const SUMMON_LOOK = { drone: 2.1, turret: 0.9, cannon: 0.9, wolf: 0.5 };
// old hero id per beast id: the attack sound still comes from the Blockade Z weapon the beast's skill set came from
const OLD_ID = Object.fromEntries(Object.entries(LEGACY).map(([o, n]) => [n, o]));
const specOf = (u) => { const d = u.def || {}; return { id: d.id || u.kind, form: d.form || 1, branch: d.branch || null }; };

const wrap = BZ.wrapAngle;

const yawOf = (face) => Math.PI / 2 - face;

export function createActors(H) {
  const { G, scene, camera } = H;
  const heroes = new Map(); const summons = new Map(); const slots = new Map();
  const pool = G.zombies.list;
  usePool(G.zombies);
  const bars = new Set();
  let B = null; let hitBudget = 0; let fxBudget = 0;
  const tmp = new THREE.Vector3(); const tip = new THREE.Vector3(); const dirV = new THREE.Vector3();
  const warned = new Set();
  const marks = createMarks(H);
  const horde = createHorde(H);
  const warn = createWarn(H);
  const overflow = new Set();
  // Lốc Xoáy: enemies in the column are thrown up and spun, visually only; the offsets are zero again when the column ends
  const lifts = new Map();
  function startLift(e) {
    const BB = B || (window.__G && window.__G.B); if (!BB) return;
    const dur = fx.WHIRL_DUR;
    for (const f of BB.enemies) {
      if (!f.alive || f.boss || f.fly || Math.hypot(f.x - e.x, f.z - e.z) > e.r + 0.4) continue;
      lifts.set(f.uid, { t: 0, dur, h: G.rng.range(1.3, 2.3), spin: G.rng.range(7, 11) * (G.rng.chance(0.5) ? 1 : -1), ang: G.rng.range(0, 6.28), y: 0, ox: 0, oz: 0, yaw: 0, tilt: 0 });
    }
  }
  const smoothK = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  function stepLifts(dt) {
    for (const [uid, L] of lifts) {
      L.t += dt; if (L.t >= L.dur) { lifts.delete(uid); const i = slots.get(uid); if (i !== undefined) { const b = pool[i].body.root; b.rotation.z = 0; } continue; }
      const env = smoothK(L.t / 0.22) * (1 - smoothK((L.t - (L.dur - 0.3)) / 0.3));
      L.y = L.h * env + Math.sin(L.t * 9) * 0.12 * env; L.yaw = L.spin * L.t; L.tilt = Math.sin(L.t * 7 + L.ang) * 0.5 * env;
      L.ox = Math.cos(L.ang + L.t * 8) * 0.4 * env; L.oz = Math.sin(L.ang + L.t * 8) * 0.4 * env;
    }
  }
  const fx = createFxMap(H, marks, {
    unit: (uid) => (B ? B.byUid.get(uid) : null), time: () => (B ? B.t : 0),
    colorOf: (uid) => { const u = B && B.byUid.get(uid); if (u && u.def && u.def.color !== undefined) return u.def.color; const bz = u && BZ.HEROES.find((h) => h.id === u.kind); return bz ? bz.color : 0xffffff; },
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
  // ---- team marks on the floor (Addendum 9.3: the side reads at a glance, without loud rings) ----
  // Under every enemy a blood-tinted scuff: a ragged stain darker at its heart with three claw scratches, stronger for elites
  // and bosses. Under every hero a chevron in the hero's colour on a dark backing, pointing where the hero faces.
  const RIMS = 256;
  const scuffCv = document.createElement('canvas'); scuffCv.width = 128; scuffCv.height = 128;
  {
    const c = scuffCv.getContext('2d'); const img = c.createImageData(128, 128); let sd = 5; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const ph = [0, 1, 2, 3].map(() => rnd() * 6.283); const edgeAt = (t) => 0.78 + 0.07 * Math.sin(3 * t + ph[0]) + 0.05 * Math.sin(5 * t + ph[1]) + 0.04 * Math.sin(9 * t + ph[2]) + 0.03 * Math.sin(14 * t + ph[3]);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const dx = (x - 63.5) / 63.5; const dy = (y - 63.5) / 63.5; const r = Math.hypot(dx, dy); const t = Math.atan2(dy, dx); const R = edgeAt(t);
      let a = Math.max(0, Math.min(1, (R - r) / 0.22)); a = a * (0.3 + 0.24 * Math.min(1, r / R)) * (0.85 + 0.15 * rnd());
      // three claw scratches across the front half, brighter than the stain
      for (let k = 0; k < 3; k++) { const ox = -0.34 + k * 0.34; const u = dx - ox - dy * 0.35; if (Math.abs(u) < 0.045 && dy > -0.62 && dy < 0.05 + k * 0.08) a = Math.max(a, 0.85 * (1 - Math.abs(u) / 0.045)); }
      const o = (y * 128 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(255 * a);
    }
    c.putImageData(img, 0, 0);
  }
  const scuffTex = new THREE.CanvasTexture(scuffCv); scuffTex.colorSpace = THREE.SRGBColorSpace;
  const rims = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: scuffTex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), RIMS);
  rims.name = 'enemyMarks'; rims.userData.teamMark = true; rims.frustumCulled = false; rims.renderOrder = 2; rims.count = 0; scene.add(rims);
  const RIM_COL = { base: new THREE.Color(0xd83824), elite: new THREE.Color(0xff6a20), boss: new THREE.Color(0xff2418) };
  let nRim = 0;
  const addRim = (x, z, size, col) => { if (nRim >= RIMS) return; bs.set(size * 1.2, 1, size * 1.2); bp.set(x, 0.05, z); bm.compose(bp, bq, bs); rims.setMatrixAt(nRim, bm); rims.setColorAt(nRim++, col); };
  // hero chevrons: a thick V pointing +z round the feet (its arms reach out past the body on both sides), and the same V a size up behind it in near-black
  const chevGeo = (() => {
    const L = [-0.7, -0.02]; const T = [0, 0.82]; const R = [0.7, -0.02]; const th = 0.26; const L2 = [-0.7, -0.02 - th]; const T2 = [0, 0.82 - th * 1.35]; const R2 = [0.7, -0.02 - th];
    const pts = [L, T, R, L2, T2, R2]; const pos = []; for (const [x, z] of pts) pos.push(x, 0, z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex([0, 4, 1, 0, 3, 4, 1, 5, 2, 1, 4, 5]); return g;
  })();
  const CHEV = 16; const chevQ = new THREE.Quaternion(); const UPY = new THREE.Vector3(0, 1, 0);
  const chevMat = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...o });
  const chevBack = new THREE.InstancedMesh(chevGeo, chevMat({ color: 0x0c1016, opacity: 0.6 }), CHEV); const chev = new THREE.InstancedMesh(chevGeo, chevMat({ opacity: 0.95 }), CHEV);
  for (const [m, n, o] of [[chevBack, 'heroMarksBack', 2], [chev, 'heroMarks', 3]]) { m.name = n; m.userData.teamMark = true; m.frustumCulled = false; m.renderOrder = o; m.count = 0; scene.add(m); }
  chev.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHEV * 3), 3);
  function flushChevrons() {
    let n = 0;
    for (const a of heroes.values()) {
      if (!a.disc.visible || n >= CHEV) continue; const p = a.disc.position; chevQ.setFromAxisAngle(UPY, a.yaw);
      bp.set(p.x, p.y + 0.02, p.z); bs.set(1, 1, 1); bm.compose(bp, chevQ, bs); chev.setMatrixAt(n, bm); chev.setColorAt(n, a.disc.userData.color);
      bp.set(p.x, p.y + 0.015, p.z); bs.set(1.22, 1, 1.22); bm.compose(bp, chevQ, bs); chevBack.setMatrixAt(n, bm); n++;
    }
    chev.count = n; chevBack.count = n; chev.instanceMatrix.needsUpdate = true; chevBack.instanceMatrix.needsUpdate = true; chev.instanceColor.needsUpdate = true;
  }
  // world points along the hero's chevron (the tools sample the floor mark there)
  function markPts(uid) { const a = heroes.get(uid); if (!a) return []; const c = Math.cos(a.yaw); const s2 = Math.sin(a.yaw); const p = a.disc.position; return [[-0.6, -0.03], [-0.48, 0.1], [0, 0.66], [0.48, 0.1], [0.6, -0.03]].map(([x, z]) => [p.x + x * c + z * s2, p.z - x * s2 + z * c]); }

  // ---- heroes: one kit-built beast each (js/view/beast), animated from the sim's anim, movement kind and ground speed ----
  function makeHero(u) {
    const sp = specOf(u); const color = u.def && u.def.color !== undefined ? u.def.color : 0xc0a070;
    const beast = buildBeast(sp, { lod: 'battle', size: 1.35, color, shadow: H.quality.shadow > 0 });
    const node = new THREE.Group(); node.add(beast.root); scene.add(node);
    // where the hero's chevron is drawn (flushChevrons): a holder for position, visibility and colour, not in the scene
    const disc = new THREE.Object3D(); disc.position.y = 0.03; disc.userData.color = new THREE.Color(color);
    const bubble = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    bubble.visible = false; scene.add(bubble);
    const bz = BZ.HEROES.find((h) => h.id === (OLD_ID[sp.id] || sp.id)); const W = (bz && BZ.WEAPONS[bz.weapon]) || {};
    const a = {
      u, beast, node, disc, bubble, bar: makeBar(0x4cd860, 34, 5), snd: W.snd || 'pistol',
      pos: new THREE.Vector3(u.x, 0, u.z), yaw: yawOf(u.face), deadT: 0, fastT: 0, sndT: 0, hurtT: 0, anim: 'idle', animT: 0, blinkT: 0, sink: 0,
    };
    a.node.position.copy(a.pos); beast.root.rotation.y = a.yaw;
    heroes.set(u.uid, a); return a;
  }

  function syncHero(a, dt) {
    const u = a.u; const bst = a.beast;
    const run = H.world && u.alive ? H.world.heroAt(u.slot, u.x, u.z) : null;
    const dx = (run ? run.x : u.x) - a.pos.x; const dz = (run ? run.z : u.z) - a.pos.z; const far = Math.hypot(dx, dz);
    const lam = run ? 14 : far > 2.2 || a.fastT > 0 ? 34 : 16; a.fastT = Math.max(0, a.fastT - dt);
    const k = 1 - Math.exp(-lam * dt); const bx = a.pos.x; const bz = a.pos.z;
    a.pos.x += dx * k; a.pos.z += dz * k;
    // speed over the ground: during a run between pads the scene slides under the group (world.js `vel`), so the drawn
    // position barely moves while the hero covers 8 to 12 m/s of bridge; the gait follows the ground, not the scene
    const wv = H.world && H.world.vel; const gx = a.pos.x - bx + (wv ? wv.x * dt : 0); const gz = a.pos.z - bz + (wv ? wv.z * dt : 0);
    const sp = dt > 1e-4 ? Math.min(12, Math.hypot(gx, gz) / dt) : 0;
    const lift = run ? run.y : 0; a.lift = (a.lift || 0) + (lift - (a.lift || 0)) * Math.min(1, dt * 14);
    const was = a.yaw;
    a.yaw += wrap((run && run.w > 0.3 ? yawOf(Math.atan2(run.dz, run.dx)) : yawOf(u.face)) - a.yaw) * Math.min(1, dt * 12);
    // burrowing: the beast sinks under the floor while the sim holds it underground
    a.sink += ((u.under ? 1 : 0) - a.sink) * Math.min(1, dt * 8);
    a.node.position.set(a.pos.x, a.lift - a.sink * bst.height * 1.1, a.pos.z); bst.root.rotation.y = a.yaw;
    a.disc.position.x = a.pos.x; a.disc.position.z = a.pos.z; a.disc.position.y = 0.03 + a.lift; a.disc.visible = u.alive && a.sink < 0.5;
    const stunned = u.status && (u.status.stun || u.status.freeze);
    let anim = !u.alive ? 'die' : stunned ? 'stun' : u.anim === 'dead' ? 'idle' : (u.anim || 'idle');
    if (u.alive && a.hurtT > 0 && (anim === 'idle' || anim === 'run')) anim = 'hit';
    if (anim !== a.anim) { a.anim = anim; a.animT = 0; } else a.animT += dt;
    a.hurtT = Math.max(0, a.hurtT - dt); a.blinkT = Math.max(0, a.blinkT - dt); a.sndT -= dt;
    const move = (u.def && u.def.move && u.def.move.kind) || bst.move;
    bst.update({ anim, animT: a.animT, move, speed: stunned || !u.alive ? 0 : sp, air: !!u.air, turn: wrap(a.yaw - was) / Math.max(dt, 1e-3) }, dt);
    // blink: gone for a moment, then back; stealth: see-through; frozen: blue; hit: a white flash
    const blinkK = a.blinkT > 0 ? Math.abs(a.blinkT - 0.16) / 0.16 : 1;
    bst.setTint({ opacity: Math.min(u.alive && u.state.stealth > 0 ? 0.35 : 1, blinkK), freeze: !!(u.status && u.status.freeze), flash: a.hurtT > 0.12 ? (a.hurtT - 0.12) / 0.13 : 0 });
    const top = bst.height + a.lift + bst.lift;
    if (!u.alive) {
      a.deadT += dt; addBlob(a.pos.x, a.pos.z, 1.8 * Math.max(0, 1 - a.deadT / 2)); a.bar.visible = false; a.bubble.visible = false; return;
    }
    a.deadT = 0;
    a.bubble.visible = u.state.invuln > 0 || u.shield > 0;
    if (a.bubble.visible) { a.bubble.material.color.setHex(u.state.invuln > 0 ? 0xffd860 : 0xa8dcff); a.bubble.position.set(a.pos.x, a.lift + bst.lift + bst.height * 0.5, a.pos.z); a.bubble.scale.setScalar(Math.max(0.9, bst.height * 0.85) * (1 + Math.sin(performance.now() / 160) * 0.03)); }
    if (H.spectateUid === u.uid) a.bar.visible = false; else setBar(a.bar, a.pos.x, top + 0.45, a.pos.z, u.hp / u.maxHp, u.shield > 0 ? u.shield / u.maxHp : 0);
    addBlob(a.pos.x, a.pos.z, 1.9 * (a.sink > 0.5 ? 0.6 : 1), bst.lift);
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
  // Bóng's decoy: a see-through copy of its owner's beast
  function buildDecoy(owner) {
    const beast = buildBeast(specOf(owner), { lod: 'battle', color: owner.def && owner.def.color });
    beast.setTint({ opacity: 0.45 });
    return { root: beast.root, beast, tick(a, dt) { beast.update({ anim: 'run', animT: 0, speed: a.speed, move: beast.move }, dt); } };
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
    // during a run between pads a summon runs along beside its hero (world.heroAt), and its speed over the ground counts the
    // scene sliding under the group (world.vel), so its walk cycle plays instead of a glide
    const o = H.world && B ? B.byUid.get(u.owner) : null; const run = o && o.hero && o.alive ? H.world.heroAt(o.slot, o.x, o.z) : null;
    let tx = u.x; let tz = u.z; let ty = 0;
    if (run) { let ox = u.x - o.x; let oz = u.z - o.z; const ol = Math.hypot(ox, oz); if (ol > 1.6) { ox *= 1.6 / ol; oz *= 1.6 / ol; } tx = run.x + ox; tz = run.z + oz; ty = run.y; }
    a.pos.x += (tx - a.pos.x) * k; a.pos.z += (tz - a.pos.z) * k;
    const wv = run && H.world.vel; const gx = a.pos.x - bx + (wv ? wv.x * dt : 0); const gz = a.pos.z - bz + (wv ? wv.z * dt : 0);
    a.speed = dt > 1e-4 ? Math.hypot(gx, gz) / dt : 0; a.lift = (a.lift || 0) + (ty - (a.lift || 0)) * Math.min(1, dt * 14);
    a.yaw += wrap(yawOf(u.face) - a.yaw) * Math.min(1, dt * 10);
    a.age += dt; const grow = Math.min(1, a.age / 0.25);
    a.root.position.set(a.pos.x, a.lift, a.pos.z); a.root.scale.setScalar(Math.max(0.01, grow));
    if (a.aim) { a.aim.rotation.y = a.yaw; a.root.rotation.y = 0; } else a.root.rotation.y = a.yaw;
    a.tick(a, dt, performance.now() / 1000);
    if (u.kind === 'drone') a.root.position.y = SUMMON_LOOK.drone + a.lift;
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
      if (!e.boss) continue;
      const idx = slotOf(e); if (idx < 0) { overflow.add(e.uid); continue; }
      const y = e.fly ? (FLY_Y[e.kind] || 3) : 0;
      const L = lifts.get(e.uid);
      rows.push([idx, ti, e.x + (L ? L.ox : 0), y + (L ? L.y : 0), e.z + (L ? L.oz : 0), yawOf(e.face) + (L ? L.yaw : 0), Math.round(255 * Math.max(0, e.hp) / e.maxHp), flagsOf(e), e.elite ? ELITE_AFFIX : 0]);
    }
    for (const [uid, idx] of slots) { const e = B.byUid.get(uid); if (!e || !e.alive) slots.delete(uid); void idx; }
    return rows;
  }
  const widthBox = new THREE.Box3(); const widthSize = new THREE.Vector3();
  const bossActs = new Map(); // enemy uid -> { pose, t, dur }: the cast pose an older boss is in
  // boss shells (foe/bosses.js) per pool slot: the new body hung on the pool body's joints; phase 2 under half life
  const shells = new Map();
  function syncShells(dt) {
    for (const [uid, idx] of slots) {
      const e = B.byUid.get(uid); if (!e || !e.boss) continue; const z = pool[idx]; if (!z || !z.alive) continue;
      let sh = shells.get(idx);
      if (sh && (sh.kind !== e.kind || sh.uid !== uid)) { sh.dispose(); shells.delete(idx); sh = null; }
      if (!sh) { sh = dressBoss(z.body, e.kind); if (!sh) continue; sh.uid = uid; shells.set(idx, sh); }
      const p2 = e.hp < e.maxHp * 0.5 ? 1 : 0;
      if (p2 !== sh.phase) { sh.setPhase(p2); if (p2 && !e.spawnT) phaseBurst(z, sh); }
    }
    for (const [idx, sh] of shells) { const z = pool[idx]; sh.tick(dt); if (!z.alive && !z.dying) { sh.dispose(); shells.delete(idx); } }
  }
  const shellOf = (uid) => { for (const sh of shells.values()) if (sh.uid === uid) return sh; return null; };
  // the second phase breaks out: a flash and chips of the old shell in the phase colour
  function phaseBurst(z, sh) {
    const s = z.T.scale; const p = z.body.root.position; const at = new THREE.Vector3(p.x, p.y + 1.1 * s, p.z);
    G.fx.pop(at, 1.4 * s, [0xffffff, sh.burst]); G.fx.burst(at, 40, [sh.burst, 0x5a5048, 0xffffff], { speed: 7, size: 0.2 * s, life: 1 });
    if (G.audio && G.audio.playAt) G.audio.playAt('roar', at, { gain: 0.8 });
  }
  const enemyBars = new Map();
  function syncEnemyBars() {
    const seen = new Set();
    for (const e of B.enemies) {
      if (!e.alive || !(e.boss || e.elite)) continue;
      let x; let y; let zz;
      if (e.boss) { const idx = slots.get(e.uid); if (idx === undefined) continue; const z = pool[idx]; if (!z.alive) continue; x = z.pos.x; y = z.pos.y + 2.5 * z.T.scale + 0.5; zz = z.pos.z; }
      else { if (!horde.headPos(e.uid, tmp)) continue; x = tmp.x; y = tmp.y + 0.45; zz = tmp.z; }
      let bar = enemyBars.get(e.uid); if (!bar) { bar = makeBar(0xe84030, e.boss ? 72 : 30, e.boss ? 8 : 4); enemyBars.set(e.uid, bar); }
      seen.add(e.uid);
      setBar(bar, x, y, zz, e.hp / e.maxHp);
    }
    for (const [uid, bar] of enemyBars) if (!seen.has(uid)) { dropBar(bar); enemyBars.delete(uid); }
  }

  // ---- events ----
  const heroOf = (uid) => heroes.get(uid);
  const unitOf = (uid) => (B ? B.byUid.get(uid) : null);
  function muzzleOf(a) {
    a.node.updateMatrixWorld(true);
    return a.beast.muzzle.getWorldPosition(tip);
  }
  const ON = {
    attack(e) {
      const a = heroOf(e.uid); const tgtY = 1.0;
      if (a) {
        if (a.sndT <= 0) { a.sndT = 0.14; G.audio.playAt(a.snd, a.pos, { gain: 0.4 }); }
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
      if (a) { a.hurtT = 0.25; return; }
      const sh = shellOf(e.uid); if (sh) sh.flash();
      if (idx === undefined || hitBudget <= 0) return;
      const z = pool[idx]; const u = unitOf(e.uid); if (!z || !z.alive || !u || (z.hitT || 0) > B.t) return;
      z.hitT = B.t + 0.12; hitBudget--;
      const by = unitOf(e.by);
      if (by) dirV.set(u.x - by.x, 0, u.z - by.z).normalize(); else dirV.set(0, 0, 1);
      G.zombies.damage(z, z.maxHp * Math.min(0.5, Math.max(0.03, e.dmg / u.maxHp)), 'body', dirV.clone(), 1, {});
    },
    fx(e) { if (e.key === 'gust' && e.part === 'burst' && e.team === 0) startLift(e); },
    die(e) {
      const sh = shellOf(e.uid); if (sh) sh.die();
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
      if (a) return;
      const idx = slots.get(e.uid); const u = unitOf(e.uid); if (idx === undefined || !u) return;
      if (!u.boss) return;
      const sk = u.skills.find((s) => s.slot === e.slot); if (!sk) return;
      const z = pool[idx]; const lock = sk.def.lock || 1;
      const kit = z.T.kind === 'boss2';
      if (kit && sk.def.move) G.zombies.kinds.remote({ t: 'bm', i: idx, m: sk.def.move, d: lock });
      const act = actFor(u, sk, kit, bossActs.get(e.uid)); if (act) bossActs.set(e.uid, act);
    },
    ult(e) { ON.cast(e); },
    dash(e) { const a = heroOf(e.uid); if (a) a.fastT = 0.3; },
    revive(e) { const a = heroOf(e.uid); if (a) { a.deadT = 0; a.anim = ''; } },
    move(e) { const a = heroOf(e.uid); if (a && e.k === 'blink') a.blinkT = 0.32; },
  };

  function dropSummon(uid) { const s = summons.get(uid); if (s) { scene.remove(s.root); if (s.beast) s.beast.dispose(); summons.delete(uid); } }
  function dropHero(a) { scene.remove(a.node); scene.remove(a.disc); scene.remove(a.bubble); dropBar(a.bar); a.beast.dispose(); heroes.delete(a.u.uid); }

  const api = {
    onEvent(e) { const h = ON[e.e]; if (h) h(e); fx.onEvent(e); horde.onEvent(e); warn.onEvent(e, B); },
    sync(batl, dt) {
      B = batl; hitBudget = 10; fxBudget = 6; nBlob = 0;
      for (const u of B.heroes) { let a = heroes.get(u.uid); if (!a) a = makeHero(u); syncHero(a, dt); }
      for (const u of B.units) {
        if (!u.summon) continue;
        if (!u.alive) { dropSummon(u.uid); continue; }
        let s = summons.get(u.uid); if (!s) s = makeSummon(u); syncSummon(s, dt);
      }
      stepLifts(dt);
      G.zombies.adopt(enemyRows()); G.zombies.update(dt); syncShells(dt);
      for (const [uid, L] of lifts) { const i = slots.get(uid); if (i !== undefined && pool[i].alive) pool[i].body.root.rotation.z = L.tilt; }
      for (const [uid, a] of bossActs) {
        const i = slots.get(uid); const z = i === undefined ? null : pool[i];
        if (!z || !z.alive || z.dying || !stepAct(a, z.body, dt)) bossActs.delete(uid);
      }
      // arriving: a rim spawn climbs over the island's edge (arrival.js) over its spawnT (the sim holds it untargetable for the same time)
      for (const e of B.enemies) {
        if (!e.alive) continue; const idx = slots.get(e.uid); const z = idx === undefined ? null : pool[idx]; if (!z || !z.alive || z.dying) continue;
        if (e.spawnT > 0) { const ar = arrive(H, e, z.pos.x, z.pos.z); z.rising = true; z.body.root.scale.setScalar(z.T.scale * ar.s); z.body.root.position.x += ar.ox; z.body.root.position.z += ar.oz; z.body.root.position.y += ar.y * z.T.scale; }
        else if (z.rising) { z.rising = false; z.body.root.scale.setScalar(z.T.scale); }
      }
      for (const z of pool) if (z.alive && !z.dying) addBlob(z.pos.x, z.pos.z, 1.7 * z.T.scale, z.pos.y);
      nRim = 0;
      horde.sync(B, dt, overflow, { lift: (uid) => lifts.get(uid), blob: addBlob, rim: (x, z, size, elite) => addRim(x, z, size, elite ? RIM_COL.elite : RIM_COL.base) });
      blobs.count = nBlob; blobs.instanceMatrix.needsUpdate = true;
      for (const e of B.enemies) {
        if (!e.alive) continue; const idx = slots.get(e.uid); if (idx === undefined) continue; const z = pool[idx]; if (!z || !z.alive || z.dying) continue;
        const k = e.boss ? 'boss' : e.elite ? 'elite' : 'base'; addRim(z.pos.x, z.pos.z, (e.boss ? 1.6 : e.elite ? 1.25 : 1) * z.T.scale, RIM_COL[k]);
      }
      rims.count = nRim; rims.instanceMatrix.needsUpdate = true; if (rims.instanceColor) rims.instanceColor.needsUpdate = true;
      flushChevrons();
      syncEnemyBars(); fx.update(B, dt); warn.update(dt);
    },
    clear() {
      for (const a of [...heroes.values()]) dropHero(a);
      for (const uid of [...summons.keys()]) dropSummon(uid);
      for (const bar of [...enemyBars.values()]) dropBar(bar);
      for (const sh of shells.values()) sh.dispose(); shells.clear(); warn.clear();
      enemyBars.clear(); bossActs.clear(); slots.clear(); lifts.clear(); G.zombies.clear(); G.fx.clear(); fx.clear(); blobs.count = 0; rims.count = 0; chev.count = 0; chevBack.count = 0; horde.clear(); B = null;
    },
    fx, marks, horde, bossActs, lifts, markPts, shells,
    beastOf(uid) { const h = heroes.get(uid); return h ? h.beast : null; },
    scaleOf(uid) { if (heroes.has(uid)) return 1; const i = slots.get(uid); return i !== undefined ? pool[i].T.scale : horde.scaleOf(uid); },
    nodeOf(uid) {
      const h = heroes.get(uid); if (h) return h.node;
      const s = summons.get(uid); if (s) return s.root;
      const i = slots.get(uid); return i !== undefined ? pool[i].body.root : horde.nodeOf(uid);
    },
    // how tall the unit stands in metres: the camera sizes its chase distance from it
    heightOf(uid) {
      const h = heroes.get(uid); if (h) return h.beast.height + h.beast.lift; if (summons.has(uid)) return 1.6;
      const i = slots.get(uid); return 2.2 * (i !== undefined ? pool[i].T.scale : horde.scaleOf(uid) || 1);
    },
    // sideways extent of the unit's meshes in metres (wings, a saucer): the camera keeps it inside the frame width
    widthOf(uid) {
      const n = api.nodeOf(uid); if (!n) return 0;
      n.updateMatrixWorld(true); widthBox.setFromObject(n); widthBox.getSize(widthSize); return Math.max(widthSize.x, widthSize.z);
    },
    headPos(uid, out) {
      const h = heroes.get(uid); if (h) return out.set(h.pos.x, (h.lift || 0) + h.beast.height + h.beast.lift, h.pos.z);
      const s = summons.get(uid); if (s) return out.set(s.pos.x, 1.6, s.pos.z);
      const i = slots.get(uid); if (i !== undefined) { const z = pool[i]; return out.set(z.pos.x, z.pos.y + 2.1 * z.T.scale, z.pos.z); }
      return horde.headPos(uid, out);
    },
  };
  void lam;
  H.scaleOf = api.scaleOf; H.heightOf = api.heightOf; H.widthOf = api.widthOf;
  return api;
}
