// The stage diorama on the Ra Trận tab: a floating round chunk of the arena with the stage's boss as a turning
// miniature, a few small zombies, fog at the rim and light rain. One instance, re-dressed with dress(stage).
// The boss is the battle's own model (bossacts.bossModel: a pool body dressed by the pool's spawn and copied), scaled to the
// chunk, idling and now and then playing one of its skill poses; the small zombies are boxed figures built here.
import { stageDef, CHAPTERS } from '../data/stages.js?v=20261121c';
import { bossModel, idlePose, stepAct, skillPoses } from '../view/bossacts.js?v=20261121c';

const INK = 0x1a1420;

// the boss stands this tall and at most this wide in world units, whatever its battle scale
const BOSS_FIT = { h: 2.7, w: 3.4 };
const BOSS_SHOW = { every: 3.2, first: 1.2 };
const MINION_SHIRTS = [[0xc0392b, 0x8e44ad], [0x2e86c1, 0xd68910], [0x27ae60, 0xcb4335], [0xa04000, 0x1f618d], [0x7d3c98, 0x148f77], [0xb03a2e, 0x34495e]];

export function createDiorama(ui, { w = 318, h = 212 } = {}) {
  const THREE = ui.THREE;
  const root = new THREE.Group(), world = new THREE.Group(); root.add(world);
  const mats = new Map();
  const std = (color, o = {}) => {
    const k = color + '|' + (o.emi || 0) + '|' + (o.op || 1) + '|' + (o.flat ? 1 : 0); let m = mats.get(k);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.62, emissive: o.emi || 0x000000, emissiveIntensity: o.emi ? 1.1 : 0, transparent: (o.op || 1) < 1, opacity: o.op || 1, flatShading: !!o.flat }); mats.set(k, m); }
    return m;
  };
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const hull = (mesh, k = 1.07) => { const o = new THREE.Mesh(mesh.geometry, inkMat); o.scale.setScalar(k); mesh.add(o); return mesh; };
  const box = (w2, h2, d, color, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d), std(color, o)); m.position.set(x, y, z); if (!(o && o.nohull)) hull(m); return m; };
  const ball = (r, color, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), std(color, o)); m.position.set(x, y, z); if (!(o && o.nohull)) hull(m, 1.08); return m; };

  // ---- one boxed body: legs, torso, raised arms, head with glowing eyes; returns the group and its idle ticker ----
  function figure(look, scale = 1) {
    const g = new THREE.Group(), f = look.fat;
    const legs = [-1, 1].map((s) => { const l = box(0.3 * f, 0.72, 0.34 * f, look.pants, s * 0.19 * f, 0.36, 0); g.add(l); return l; });
    const torso = box(0.78 * f, 0.86, 0.44 * f, look.cloth, 0, 1.15, 0); g.add(torso);
    torso.add(box(0.8 * f, 0.1, 0.46 * f, 0x1a1420, 0, -0.3, 0, { nohull: true }));
    const arms = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.54 * f, 1.5, 0); const a = box(0.24 * f, 0.78, 0.26 * f, look.skin, 0, -0.32, 0); p.add(a);
      p.add(box(0.28 * f, 0.26, 0.3 * f, look.cloth, 0, -0.04, 0)); p.rotation.x = -1.25; g.add(p); return p;
    });
    const head = new THREE.Group(); head.position.set(0, 1.9, 0.04); g.add(head);
    head.add(box(0.62 * Math.min(f, 1.2), 0.6, 0.58 * Math.min(f, 1.2), look.skin, 0, 0, 0));
    const hz = 0.31 * Math.min(f, 1.2);
    for (const s of [-1, 1]) head.add(box(0.14, 0.1, 0.05, look.eye, s * 0.15, 0.05, hz, { emi: look.eye, nohull: true }));
    head.add(box(0.3, 0.07, 0.05, 0x2a0a14, 0, -0.14, hz, { nohull: true }));
    g.userData = { legs, arms, head, torso, t0: Math.random() * 6 };
    g.scale.setScalar(scale * look.h / 2.5);
    return g;
  }

  // the battle model fitted to the chunk; a flyer hangs a little above it
  function boss(id) {
    const m = bossModel(id); if (!m) { console.warn('[diorama] no boss model for ' + id); return null; }
    idlePose(m, 0);
    const g = new THREE.Group(); g.add(m.root); m.root.updateMatrixWorld(true);
    const bb = new THREE.Box3(); m.root.traverseVisible((o) => { if (o.isMesh && !o.isInstancedMesh) bb.expandByObject(o); });
    const sz = bb.getSize(new THREE.Vector3()); const k = Math.min(BOSS_FIT.h / Math.max(0.1, sz.y), BOSS_FIT.w / Math.max(0.1, sz.x, sz.z));
    m.root.scale.multiplyScalar(k); m.root.position.y = -bb.min.y * k;
    g.userData = { m, hover: m.T.fly ? 0.35 : 0, act: null, next: BOSS_SHOW.first, skill: 0, poses: skillPoses(id) };
    return g;
  }
  function minion(i, chapter) {
    const [cloth, pants] = MINION_SHIRTS[(i + chapter) % MINION_SHIRTS.length];
    return figure({ skin: 0x8bc36a, cloth, pants, eye: 0xff3020, h: 2.5, fat: 1, extras: [] }, 0.42);
  }

  // ---- floating base ----
  const baseG = new THREE.Group(); world.add(baseG);
  const floorCan = document.createElement('canvas'); floorCan.width = floorCan.height = 256;
  const floorTex = new THREE.CanvasTexture(floorCan); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = 4;
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 0.3, 48), [new THREE.MeshStandardMaterial({ color: 0x4a3a66, roughness: 0.7 }), floorMat, new THREE.MeshStandardMaterial({ color: 0x4a3a66, roughness: 0.7 })]);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.09, 8, 64), std(0xfff1cf, { nohull: true })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.15;
  const topHull = new THREE.Mesh(top.geometry, inkMat); topHull.scale.set(1.04, 1.25, 1.04); top.add(topHull);
  const under = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.3, 9, 1), std(0x5a4a7a, { flat: true })); under.rotation.x = Math.PI; under.position.y = -1.25; hull(under, 1.05);
  baseG.add(top, rim, under);
  const pebbles = [];
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + (i % 2) * 0.1), std(0x6a5a8a, { flat: true })); hull(p, 1.1); baseG.add(p); pebbles.push({ p, a: i * 1.6, r: 3.5 + (i % 2) * 0.4, y: -1.4 - i * 0.3, s: 0.4 + i * 0.1 }); }

  function paintFloor(color) {
    const c = floorCan.getContext('2d'), hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const dark = new THREE.Color(color).multiplyScalar(0.72).getHex(), light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.18).getHex();
    c.fillStyle = hex(color); c.fillRect(0, 0, 256, 256);
    c.strokeStyle = hex(dark); c.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, 256); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(256, i * 32); c.stroke(); }
    c.fillStyle = hex(light); for (let i = 0; i < 16; i++) { const x = (i * 97) % 224, y = (i * 61) % 224; c.globalAlpha = 0.45; c.fillRect(x + 4, y + 4, 22, 10); }
    c.globalAlpha = 1; c.fillStyle = hex(dark); c.globalAlpha = 0.5; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(30 + i * 40, 40 + (i * 53) % 190, 14, 8, i, 0, 7); c.fill(); }
    c.globalAlpha = 1; floorTex.needsUpdate = true;
  }

  // ---- fog at the rim, rain, backdrop ----
  const wispCan = document.createElement('canvas'); wispCan.width = wispCan.height = 64;
  { const c = wispCan.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const wispTex = new THREE.CanvasTexture(wispCan);
  const wisps = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshBasicMaterial({ map: wispTex, transparent: true, opacity: 0.5, depthWrite: false }));
    world.add(m); wisps.push({ m, a: (i / 12) * 6.283, r: 3.05 + (i % 3) * 0.28, s: 0.12 + (i % 4) * 0.04, y: 0.45 + (i % 3) * 0.25 });
  }
  const RAIN = 70, rainPos = new Float32Array(RAIN * 6), rainGeo = new THREE.BufferGeometry(), rainSeed = [];
  for (let i = 0; i < RAIN; i++) rainSeed.push({ x: (Math.random() - 0.5) * 7.4, z: (Math.random() - 0.5) * 5, y: Math.random() * 5, v: 7 + Math.random() * 3 });
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.55 })); rain.frustumCulled = false; world.add(rain);

  const bgCan = document.createElement('canvas'); bgCan.width = 8; bgCan.height = 128;
  const bgTex = new THREE.CanvasTexture(bgCan); bgTex.colorSpace = THREE.SRGBColorSpace;
  const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshBasicMaterial({ map: bgTex, depthWrite: false })); bgPlane.position.set(0, 3, -9); root.add(bgPlane);
  function paintBg(fog) {
    const c = bgCan.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128), hex = (n) => '#' + n.toString(16).padStart(6, '0');
    g.addColorStop(0, hex(new THREE.Color(0x3a2a86).lerp(new THREE.Color(fog), 0.12).getHex())); g.addColorStop(0.6, hex(new THREE.Color(0x6a3aa8).lerp(new THREE.Color(fog), 0.3).getHex())); g.addColorStop(1, hex(new THREE.Color(0xa8508a).lerp(new THREE.Color(fog), 0.4).getHex()));
    c.fillStyle = g; c.fillRect(0, 0, 8, 128); bgTex.needsUpdate = true;
  }

  // ---- dressing: boss and minions are rebuilt when the stage changes ----
  let bossG = null, minions = [], cur = 0, t = 0, bossBase = 0;
  const cast = new THREE.Group(); world.add(cast); cast.position.y = 0.15;
  // the boss copy owns its materials (its geometries are the pool's and stay)
  function clearCast() {
    if (bossG) { const seen = new Set(); bossG.traverse((o) => { for (const m of [].concat(o.material || [])) if (!seen.has(m)) { seen.add(m); m.dispose(); } }); }
    while (cast.children.length) cast.remove(cast.children[0]); minions = []; bossG = null;
  }
  function dress(n) {
    if (n === cur) return; cur = n;
    const def = stageDef(n), ch = CHAPTERS[def.chapter];
    paintFloor(def.floor); paintBg(def.fog);
    for (const w2 of wisps) w2.m.material.color.setHex(def.fog);
    clearCast();
    bossG = boss(def.boss); bossBase = bossG ? bossG.userData.hover : 0; if (bossG) cast.add(bossG);
    const spots = [[-2.0, 0.6, 0.5], [1.9, 1.1, -0.4], [0.5, 2.0, 0.2]];
    const nMin = def.spike ? 3 : 2 + (n % 2);
    for (let i = 0; i < nMin; i++) { const z = minion(i, def.chapter); z.position.set(spots[i][0], 0, spots[i][1]); z.rotation.y = Math.atan2(-spots[i][0], -spots[i][1]) + spots[i][2]; cast.add(z); minions.push(z); }
    rim.material.color.setHex(ch.fog);
  }

  function tickFigure(g, tt) {
    const u = g.userData, p = tt + u.t0;
    if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = Math.sin(p * 2.2 + i * 3.14) * 0.12; });
    if (u.arms) u.arms.forEach((a, i) => { a.rotation.x = -1.25 + Math.sin(p * 2.6 + i * 1.7) * 0.22; });
    if (u.head) u.head.rotation.y = Math.sin(p * 1.1) * 0.25;
    if (u.wings) u.wings.forEach((w2, i) => { w2.rotation.y = (i ? -1 : 1) * (0.5 + Math.sin(p * 7) * 0.35); });
    if (u.spiderLegs) u.spiderLegs.forEach((l, i) => { l.rotation.z = Math.sin(p * 3 + i) * 0.08; });
    if (u.rock) u.rock.rotation.y += 0.02;
  }

  // idle, and every few seconds the next of the boss's skill poses, the same ones it plays in battle
  function tickBoss(u, dt) {
    u.t = (u.t || 0) + dt; idlePose(u.m, u.t);
    if (!u.act && u.poses.length && u.t >= u.next) { u.act = { pose: u.poses[u.skill++ % u.poses.length], t: 0, lock: 1, dur: 1.3 }; }
    if (u.act && !stepAct(u.act, u.m, dt)) { u.act = null; u.next = u.t + BOSS_SHOW.every; }
  }
  function step(dt) {
    t += dt;
    world.position.y = Math.sin(t * 1.3) * 0.1; baseG.rotation.y = t * 0.05;
    if (bossG) { bossG.rotation.y = t * 0.55; bossG.position.y = bossBase + (bossBase ? Math.sin(t * 2.2) * 0.08 : 0); tickBoss(bossG.userData, dt); }
    for (const m of minions) { tickFigure(m, t * 0.8); m.position.y = Math.abs(Math.sin(t * 2.3 + m.userData.t0)) * 0.04; }
    for (const p of pebbles) { p.a += dt * p.s * 0.35; p.p.position.set(Math.cos(p.a) * p.r * 0.75, p.y, Math.sin(p.a) * p.r * 0.75); p.p.rotation.y += dt; }
    for (const wp of wisps) { wp.a += dt * wp.s; wp.m.position.set(Math.cos(wp.a) * wp.r, wp.y + Math.sin(t + wp.a * 3) * 0.08, Math.sin(wp.a) * wp.r); wp.m.lookAt(0, wp.m.position.y + 0.3, 14); wp.m.material.opacity = 0.34 + 0.16 * Math.sin(t * 0.8 + wp.a * 5); }
    for (let i = 0; i < RAIN; i++) {
      const r = rainSeed[i]; r.y -= r.v * dt; if (r.y < 0.2) { r.y = 4.8; r.x = (Math.random() - 0.5) * 7.4; r.z = (Math.random() - 0.5) * 5; }
      rainPos.set([r.x, r.y, r.z, r.x - 0.12, r.y + 0.5, r.z], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  cam.position.set(0, 3.7, 11.2); cam.lookAt(0, 0.9, 0);
  const node = ui.viewport(root, { w, h, r: 17, camera: cam, fps: 24, bg: 0x4e3aa0, key: 2.4, amb: 1.7, update: step });
  node.camera = cam;
  const api = { node, dress, step, get stage() { return cur; }, get boss() { return bossG; } };
  if (typeof window !== 'undefined') window.__dio = api;
  return api;
}
