// The evolution screen (SCOPE section 4): the beast on a pedestal, the old/new comparison (health, attack, movement, the
// skills that change, the new passive) and the price; TIẾN HOÁ runs the change in meta, then the moment plays: a glowing
// cocoon closes over the beast, cracks, bursts into shards, and the new form poses while the camera circles it. After
// that the new form runs laps of the pedestal in its own gait. A tap anywhere skips to the end. "Giảm chớp sáng" dims
// every flash. At a fork (form 2 -> 3) the player picks the path first; at form 3 the other path can be bought (ĐỔI NHÁNH).
// openEvolve(heroId) is what the beast screen's TIẾN HOÁ button calls. Every drawn string is registered in
// game.evolveUi (texts, phase, phases seen) so tools/evolve-test.mjs can read and audit the screen.
import { HERO, ELEMENTS } from '../data/heroes.js?v=20261122a';
import { heroDef, branchesOf, maxForm } from '../data/beasts.js?v=20261122a';
import { levelMul } from '../data/economy.js?v=20261122a';
import { buildBeast } from '../view/beast/index.js?v=20261122a';

export const MOVE_NAME = { walk: 'Đi bộ', gallop: 'Phi nước đại', hop: 'Nhảy cóc', leap: 'Nhảy xa', roll: 'Lăn tròn', slither: 'Trườn', fly: 'Bay', glide: 'Lướt', swimAir: 'Bơi trong không khí', blink: 'Dịch chuyển', burrow: 'Đào đất', stomp: 'Dậm đất' };
// the moment, in order; `dur` in seconds
const PHASES = [{ k: 'cocoon', dur: 1.3 }, { k: 'crack', dur: 1.0 }, { k: 'burst', dur: 0.5 }, { k: 'pose', dur: 1.8 }];
const AIR = new Set(['fly', 'glide', 'swimAir']);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// with no beast named (or one the account does not own) the screen opens on the team's lead
const leadOf = (acc, id) => (id && HERO[id] && acc.heroes[id] ? id : [...(acc.team || []), ...Object.keys(acc.heroes)].find((k) => HERO[k] && acc.heroes[k]));

export function openEvolve(heroId, o = {}) {
  const game = o.game || (typeof window !== 'undefined' ? window.__G : null);
  if (!game || !game.screens || !game.screens.evolve || !game.meta) return false;
  const id = leadOf(game.meta.acc, heroId); if (!id) return false;
  game.goto('evolve', { id, branch: o.branch, over: true });
  return true;
}

export function createEvolve(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE;
  const scr = ui.screen('evolve', { modal: true });
  const reg = game.evolveUi = { phase: 'closed', seen: [], texts: [], id: '', from: null, to: null, skipped: false };
  const S = { id: '', branch: null, mode: 'evolve', phase: 'closed', t: 0, prev: 'heroes', lapT: 0, orbit: 0 };
  const flashK = () => (game.settings && game.settings.reduceFlash ? 0.25 : 1);

  // ---------- frame ----------
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(1200, 700), new THREE.MeshBasicMaterial({ color: 0x0c0718, transparent: true, opacity: 0.82, depthWrite: false })); scr.put(m, 390, 180, -10); }
  const L = { lx: 24, ly: 30, lw: 356, lh: 300, rx: 392, rw: 364 };
  const left = ui.panel({ w: L.lw, h: L.lh, r: 18, color: 0x2a2150, depth: 5, bevel: 3 }); scr.put(left, L.lx, L.ly, 2);
  const right = ui.panel({ w: L.rw, h: L.lh, r: 18, color: PAL.panel, depth: 5, bevel: 3, gloss: false }); scr.put(right, L.rx, L.ly, 2);
  // text ink against its panel, in the panel's frame: the strings that stick out
  const _v = new THREE.Vector3();
  reg.audit = () => {
    const bad = [], inks = [];
    for (const t of reg.texts) {
      const n = t.node, b = t.box; if (!n.parent || !n.str) continue; let on = true; for (let a = n; a; a = a.parent) if (a.visible === false) on = false; if (!on) continue;
      const slot = b.slot || b; n.updateWorldMatrix(true, false); slot.updateWorldMatrix(true, false);
      const w = n.w, h = n.h, x0 = t.align === 'right' ? -w : t.align === 'center' ? -w / 2 : 0;
      let lo = [1e9, 1e9], hi = [-1e9, -1e9];
      for (const [cx, cy] of [[x0, 0], [x0 + w, 0], [x0, -h], [x0 + w, -h]]) { _v.set(cx, cy, 0); n.localToWorld(_v); slot.worldToLocal(_v); lo = [Math.min(lo[0], _v.x), Math.min(lo[1], _v.y)]; hi = [Math.max(hi[0], _v.x), Math.max(hi[1], _v.y)]; }
      // a text sunk behind its panel's face is hidden however well it fits
      if (b.top !== undefined && n.position.z < b.top) bad.push(`${n.str}: at depth ${n.position.z.toFixed(1)}, behind the panel face at ${b.top.toFixed(1)}`);
      if (b === right && n !== skipHint && -lo[1] > BUTTON_TOP - 1 && closeB.visible) bad.push(`${n.str}: reaches y ${(-lo[1]).toFixed(1)}, under the buttons at ${BUTTON_TOP}`);
      if (lo[0] < -0.6 || hi[0] > b.w + 0.6 || hi[1] > 0.6 || lo[1] < -b.h - 0.6) bad.push(`${n.str}: x ${lo[0].toFixed(1)}..${hi[0].toFixed(1)} of 0..${b.w}, y ${(-hi[1]).toFixed(1)}..${(-lo[1]).toFixed(1)} of 0..${b.h}`);
      if (b === right) inks.push({ s: n.str, x0: lo[0], x1: hi[0], y0: -hi[1], y1: -lo[1] });
    }
    // no two texts of the comparison share ink (a wrapped title line once fell on the line under it)
    for (let i = 0; i < inks.length; i++) for (let j = i + 1; j < inks.length; j++) {
      const A = inks[i], B = inks[j], ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      if (ox > 1.5 && oy > 1.5) bad.push(`"${A.s}" and "${B.s}" overlap by ${ox.toFixed(1)}x${oy.toFixed(1)}`);
    }
    // the title is one line: a name too long for the panel is drawn smaller, never wrapped or clipped
    if (title.str && (title.h > 17 * 1.25 * 1.15 || title.w > TITLE_W + 0.5)) bad.push(`title "${title.str}" is ${title.w.toFixed(1)} wide, ${title.h.toFixed(1)} high: not one line inside ${TITLE_W}`);
    return bad;
  };
  const T = (parent, str, o, x, y, z = 6) => { const n = ui.text(str, o); parent.put(n, x, y, z); reg.texts.push({ node: n, box: parent, align: o.align }); return n; };
  // the title in three sizes, one line each: the largest that fits the panel is shown (a long pair of names gets smaller)
  const TITLE_W = 336, titles = [17, 15, 13].map((sz) => T(right, '', { size: sz, outlineW: sz * 0.153 }, 14, 10 + (17 - sz) * 0.6));
  let title = titles[0];
  function setTitle(str) {
    for (const n of titles) n.set(str);
    title = titles.find((n) => n.w <= TITLE_W) || titles[titles.length - 1];
    for (const n of titles) n.setVisible(n === title);
  }
  const sub = T(right, '', { size: 11, color: 0xc8c0f0, maxW: 336 }, 14, 34);
  const ROWS = ['Máu', 'Công', 'Di chuyển'].map((lab, i) => {
    const y = 54 + i * 21;
    return { l: T(right, lab, { size: 12, color: 0xc8c0f0 }, 14, y), a: T(right, '', { size: 12, maxW: 118 }, 84, y), arrow: T(right, '→', { size: 12, color: 0xffd25a }, 204, y), b: T(right, '', { size: 12, color: 0x8dff9a, maxW: 132 }, 220, y) };
  });
  const skillHead = T(right, 'Chiêu mới', { size: 12, color: 0xffd25a }, 14, 120);
  const skillLines = [0, 1, 2].map((i) => T(right, '', { size: 11, maxW: 336 }, 14, 137 + i * 15));
  const passHead = T(right, '', { size: 12, color: 0xffd25a, maxW: 336 }, 14, 184);
  const passDesc = T(right, '', { size: 11, maxW: 336, lineH: 13 }, 14, 200);
  const costT = T(right, '', { size: 11, maxW: 336, lineH: 13, color: 0xffe9b0 }, 14, 228);
  const closeB = ui.button({ id: 'evolve-close', w: 104, h: 44, r: 12, color: PAL.blue, label: 'ĐÓNG', size: 15, onTap: () => close() }); right.put(closeB, 12, 246, 6);
  const goB = ui.button({ id: 'evolve-go', w: 226, h: 44, r: 12, color: PAL.orange, label: 'TIẾN HOÁ', size: 16, onTap: () => start() }); right.put(goB, 126, 246, 6);
  const branchB = ['a', 'b'].map((b, i) => { const n = ui.button({ id: 'evolve-branch-' + b, w: 164, h: 40, r: 12, color: PAL.purple, label: '', size: 12, onTap: () => pickBranch(b) }); left.put(n, 10 + i * 172, 252, 8); return n; });
  // the whole screen is the skip button while the moment plays
  const skipB = ui.button({ id: 'evolve-skip', w: 780, h: 360, flat: true, alpha: 0.001, label: '', onTap: () => skip() }); scr.put(skipB, 0, 0, 30); skipB.setVisible(false);
  const skipHint = T(scr, 'Chạm để bỏ qua', { size: 11, color: 0xc8c0f0, align: 'center' }, L.lx + L.lw / 2, L.ly + L.lh - 22, 12);

  // ---------- the 3D stage ----------
  const root = new THREE.Group();
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x5a4a8a, roughness: 0.55, metalness: 0.15, flatShading: true });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 0.32, 28), pedMat); ped.position.y = -0.16; root.add(ped);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.045, 8, 56), new THREE.MeshStandardMaterial({ color: 0x9a7aff, emissive: 0x6a3aff, emissiveIntensity: 0.6 })); rune.rotation.x = Math.PI / 2; rune.position.y = 0.01; root.add(rune);
  const cocoonMat = new THREE.MeshStandardMaterial({ color: 0xe8a040, emissive: 0x7a3a08, emissiveIntensity: 0.6, roughness: 0.45, metalness: 0.1, transparent: true, opacity: 0.95, flatShading: true });
  const cocoon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), cocoonMat); root.add(cocoon);
  // cracks: thin glowing strips laid over the shell, grown during the crack beat
  const crackMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 1, toneMapped: false });
  const cracks = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), crackMat); const a = i * 2.4, b = (i % 3 - 1) * 0.6;
    const el = b * 0.7; c.position.set(Math.cos(a) * Math.cos(el) * 0.74, Math.sin(el) * 0.74 + 0.15, Math.sin(a) * Math.cos(el) * 0.74); c.lookAt(0, 0, 0); c.rotateZ(b * 1.3); c.userData.k = 0; cocoon.add(c); cracks.push(c);
  }
  // shards: tetrahedra thrown out at the burst
  const N_SHARD = 36, shardGeo = new THREE.TetrahedronGeometry(0.12), shards = new THREE.InstancedMesh(shardGeo, cocoonMat, N_SHARD); root.add(shards);
  const shardV = []; for (let i = 0; i < N_SHARD; i++) { const a = (i / N_SHARD) * 6.283 * 3.1, u = (i % 7) / 6 - 0.5; shardV.push(new THREE.Vector3(Math.cos(a) * (1 - Math.abs(u)), u * 1.6 + 0.6, Math.sin(a) * (1 - Math.abs(u))).multiplyScalar(2.4 + (i % 5) * 0.5)); }
  // a cool light from behind outlines dark beasts against the dark stage
  const rim = new THREE.DirectionalLight(0xb9a2ff, 1.4); rim.position.set(0.5, 2.2, -3); root.add(rim);
  const glow = new THREE.PointLight(0xffd27a, 0, 8); glow.position.set(0, 0.9, 0.6); root.add(glow);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  // between the two forms: a gold chevron pointing at the new one
  const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0xffd25a, emissive: 0xc07a10, emissiveIntensity: 0.9, flatShading: true }));
  chevron.rotation.z = -Math.PI / 2; root.add(chevron);
  // a soft blob shadow under each form, as in battle, so a flyer reads as off the ground
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); return t;
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  // bits of earth (burrow, landing) and sparks (blink): low-poly pieces with a short life
  const N_BIT = 28, bits = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), N_BIT);
  bits.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N_BIT * 3), 3); bits.count = 0; root.add(bits);
  const BIT = []; const col = new THREE.Color();
  function spray(x, y, z, color, n, sp = 1.4) {
    for (let i = 0; i < n; i++) { if (BIT.length >= N_BIT) BIT.shift(); const a = Math.random() * 6.283, u = Math.random(); BIT.push({ x, y, z, vx: Math.cos(a) * sp * (0.4 + u), vy: sp * (0.8 + Math.random()), vz: Math.sin(a) * sp * (0.4 + u), t: 0, c: color, s: 0.7 + Math.random() * 0.8 }); }
  }
  function tickBits(dt) {
    for (let i = BIT.length - 1; i >= 0; i--) { const p = BIT[i]; p.t += dt; if (p.t > 0.55) { BIT.splice(i, 1); continue; } p.vy -= 6 * dt; p.x += p.vx * dt; p.y = Math.max(0.03, p.y + p.vy * dt); p.z += p.vz * dt; }
    BIT.forEach((p, i) => { v3.set(p.x, p.y, p.z); q.setFromAxisAngle(one, p.t * 9); const s = p.s * (1 - p.t / 0.55); m4.compose(v3, q, new THREE.Vector3(s, s, s)); bits.setMatrixAt(i, m4); bits.setColorAt(i, col.set(p.c)); });
    bits.count = BIT.length; bits.instanceMatrix.needsUpdate = true; bits.instanceColor.needsUpdate = true;
  }
  // the burrower's mound: a ridge of earth lumps that runs where the beast is underground
  const mound = new THREE.Group(); const lumpMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11 + (i % 3) * 0.03), lumpMat); l.position.set((i % 2 - 0.5) * 0.14, 0.02, (i - 2.5) * 0.09); mound.add(l); }
  mound.visible = false; root.add(mound);

  const cam = new THREE.PerspectiveCamera(30, (L.lw - 12) / (L.lh - 60), 0.1, 50);
  const TAN = Math.tan(cam.fov * Math.PI / 360);
  // the camera frames a box of half-width w and half-height h centred at height cy, from angle a around the pedestal
  function frame(a, w, h, cy, elev = 0.3) {
    const d = Math.max(h / TAN, w / (TAN * cam.aspect)) + w * 0.35;
    cam.position.set(Math.sin(a) * d * Math.cos(elev), cy + Math.sin(elev) * d, Math.cos(a) * d * Math.cos(elev)); cam.lookAt(0, cy, 0);
  }

  const READY_YAW = 0.45;
  // a form on the stage: the model inside a holder that sets its size and place, its rest box measured from the mesh
  let oldS = null, newS = null, K = 1, SEP = 0, vp = null;
  function stand(spec) {
    const b = buildBeast(spec, { lod: 'portrait', color: HERO[spec.id].color });
    const holder = new THREE.Group(); holder.add(b.root); root.add(holder);
    const box = new THREE.Box3();
    for (const m of b.root.children) if (m.geometry) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
    box.min.multiplyScalar(b.scale); box.max.multiplyScalar(b.scale);
    // the pivot goes to the middle of the footprint: long fish and spiders turn about their centre
    b.root.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
    const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.position.y = 0.012; root.add(sh);
    const wx = box.max.x - box.min.x, lz = box.max.z - box.min.z;
    return { b, holder, sh, h: Math.max(0.2, box.max.y), span: Math.max(0.2, wx, lz), wide: (yaw) => Math.max(0.2, wx * Math.cos(yaw) + lz * Math.abs(Math.sin(yaw))) };
  }
  function drop(s) { if (!s) return; root.remove(s.holder); root.remove(s.sh); s.sh.material.dispose(); s.b.dispose(); }
  function setBeasts(spec0, spec1) {
    drop(oldS); drop(newS);
    oldS = stand(spec0); newS = spec1 ? stand(spec1) : null;
    // one scale for both, so the new form shows how much it grew; side by side each gets half the pedestal
    // sized by how wide each form shows turned to its ready angle: a long lizard faces the camera and keeps its size
    const hMax = Math.max(oldS.h, newS ? newS.h : 0), wide = Math.max(oldS.wide(READY_YAW), newS ? newS.wide(READY_YAW) : 0);
    K = Math.min(1.25 / hMax, (newS ? 1.15 : 1.7) / wide);
    for (const s of [oldS, newS]) if (s) s.holder.scale.setScalar(K);
    SEP = newS ? Math.max(0.5, (wide * K) / 2 + 0.12) : 0;
    const r = Math.max(0.5, Math.max(oldS.h, oldS.span * 0.8) * K * 0.62);
    cocoon.userData.s = r / 0.75; cocoon.scale.setScalar(cocoon.userData.s); cocoon.position.set(0, r * 0.85, 0);
    mound.scale.setScalar(Math.max(0.8, (newS || oldS).span * K * 0.9));
    BIT.length = 0;
  }
  // drives one form for a frame; a flyer's height from the rig is capped so it hovers over the pedestal, not out of frame
  function drive(s, st, at, maxLift = 0.3) {
    s.b.update({ air: 0, face: 0, move: s.b.move, speed: 0, ...st }, st.dt);
    const lift = s.b.lift * K, keep = Math.min(Math.max(0, lift), maxLift);
    s.holder.position.set(at.x || 0, (at.y || 0) + keep - lift, at.z || 0); s.holder.rotation.y = at.yaw || 0; s.holder.visible = at.vis !== false;
    const up = Math.max(0, keep + (at.y || 0)), w = s.span * K * 0.75 / (1 + up * 0.8);
    s.sh.visible = s.holder.visible && (at.y || 0) > -0.05; s.sh.position.set(at.x || 0, 0.012, at.z || 0); s.sh.scale.set(w, 1, w * 0.8); s.sh.material.opacity = 0.55 / (1 + up * 1.5);
    return up;
  }
  function ensureVp() {
    if (vp) return;
    vp = ui.viewport(root, { w: L.lw - 12, h: L.lh - 60, r: 14, camera: cam, bg: 0x1a1236, fps: 30, update: (dt) => tick3d(dt), key: 2.4, amb: 1.3 });
    left.put(vp, 6, 6, 3);
  }
  // ---------- the comparison ----------
  const formSpec = (f, b) => ({ id: S.id, form: f, branch: f === 3 ? b : null });
  function stats(spec) {
    const h = meta.acc.heroes[S.id], cur = meta.heroStats(S.id), mul = levelMul(Math.max(1, h.level)), d = heroDef(spec);
    return { hp: d.hp * mul + cur.hpFlat, atk: d.atk * mul + cur.atkFlat, move: MOVE_NAME[d.move.kind] || d.move.kind, def: d };
  }
  function check() {
    if (S.mode === 'rebranch') return meta.canRebranch(S.id, S.branch);
    return meta.canEvolve(S.id, S.branch);
  }
  function costLine(c) {
    if (!c.cost) return c.why;
    const k = c.cost, parts = [];
    if (k.level) parts.push('Cấp ' + k.level);
    parts.push(k.shards + ' mảnh', fmt(k.gold) + ' vàng', k.stones + ' Đá Mầm ' + ELEMENTS[k.element].name);
    if (k.cores) parts.push(k.cores + ' Lõi Cổ');
    if (k.cleared && meta.acc.cleared < k.cleared) parts.push('qua ải ' + k.cleared);
    // one item never breaks across lines: its own spaces are non-breaking
    return parts.map((x) => x.replace(/ /g, '\u00a0')).join(' · ') + (c.ok ? '' : '  (' + c.why + ')');
  }
  function fill(from, to) {
    const a = stats(from), b = to ? stats(to) : null;
    const nameA = a.def.formName, nameB = b ? b.def.formName : '';
    setTitle(b ? `${nameA} → ${nameB}` : nameA);
    sub.set(b ? `${HERO[S.id].name} · Dạng ${from.form}${from.branch ? from.branch.toUpperCase() : ''} → Dạng ${to.form}${to.branch ? to.branch.toUpperCase() : ''}` : `${HERO[S.id].name} · Dạng ${from.form} (dạng cuối)`);
    const vals = [[fmt(a.hp), b && fmt(b.hp)], [fmt(a.atk), b && fmt(b.atk)], [a.move, b && b.move]];
    ROWS.forEach((r, i) => { r.a.set(vals[i][0]); r.b.set(b ? vals[i][1] : ''); r.arrow.setVisible(!!b); });
    const changed = b ? ['s1', 's2', 'ult'].filter((k) => a.def[k].name !== b.def[k].name).map((k) => `${a.def[k].name} → ${b.def[k].name}`) : [];
    skillHead.setVisible(changed.length > 0);
    skillLines.forEach((n, i) => n.set(changed[i] || ''));
    const p = b ? b.def.passive : a.def.passive;
    passHead.set(`${b ? 'Nội tại mới' : 'Nội tại'}: ${p.name}`); passDesc.set(p.desc);
    layoutText(changed.length);
    reg.from = { name: nameA, hp: Math.round(a.hp), atk: Math.round(a.atk), move: a.def.move.kind };
    reg.to = b ? { name: nameB, hp: Math.round(b.hp), atk: Math.round(b.atk), move: b.def.move.kind, skills: changed, passive: p.name } : null;
  }
  // the lower block follows what is above it: skills used, then the passive, then the price, all above the buttons
  const BUTTON_TOP = 246;
  reg.buttonTop = BUTTON_TOP;
  function layoutText(nSkills) {
    const z = right.top + 6;
    // below the stat rows, whose values may wrap (a long gait name on the left of a final form)
    const last = ROWS[ROWS.length - 1], rowsEnd = 96 + Math.max(13, last.a.h, last.b.h) + 6;
    let y = Math.max(120, rowsEnd);
    skillHead.pos(14, y, z); skillLines.forEach((n, i) => n.pos(14, y + 17 + i * 15, z));
    y += (nSkills ? 17 + nSkills * 15 : 0) + 4;
    passHead.pos(14, y, z); y += 16;
    passDesc.pos(14, y, z); y += Math.max(13, passDesc.h) + 4;
    costT.pos(14, y, z);
  }
  function target() {
    const h = meta.acc.heroes[S.id];
    if (S.mode === 'rebranch') return { from: formSpec(3, h.branch), to: formSpec(3, S.branch) };
    if (h.form >= maxForm(S.id)) return { from: formSpec(h.form, h.branch), to: null };
    return { from: formSpec(h.form, h.branch), to: formSpec(h.form + 1, S.branch) };
  }
  function refresh() {
    const h = meta.acc.heroes[S.id], br = branchesOf(S.id);
    const fork = br.length && (h.form === 2 || h.form === 3);
    branchB.forEach((n, i) => {
      const b = br[i]; n.setVisible(!!fork && S.phase === 'ready');
      if (!fork) return;
      const d = heroDef(formSpec(3, b)); n.setLabel(`${S.branch === b ? '» ' : ''}${b.toUpperCase()} · ${d.formName}`);
      n.setEnabled(!(h.form === 3 && h.branch === b));
    });
    const tg = target(); fill(tg.from, tg.to);
    if (S.phase === 'done') { costT.set(S.mode === 'rebranch' ? 'Đã đổi nhánh!' : 'Tiến hoá thành công!'); goB.setVisible(false); closeB.setLabel('XONG'); return; }
    goB.setVisible(true); closeB.setLabel('ĐÓNG');
    if (!tg.to) { costT.set('Đã ở dạng cuối.'); goB.setEnabled(false); goB.setLabel('TIẾN HOÁ'); return; }
    const c = check(); costT.set(costLine(c)); goB.setEnabled(c.ok); reg.goLabel = S.mode === 'rebranch' ? 'ĐỔI NHÁNH' : 'TIẾN HOÁ'; goB.setLabel(reg.goLabel);
    reg.ok = c.ok; reg.why = c.why;
  }
  function pickBranch(b) {
    const h = meta.acc.heroes[S.id];
    S.branch = b; S.mode = h.form === 3 ? 'rebranch' : 'evolve';
    const tg = target(); setBeasts(tg.from, tg.to); refresh();
  }

  // ---------- the moment ----------
  function setPhase(k) { S.phase = k; S.t = 0; reg.phase = k; reg.seen.push(k); }
  function start() {
    const tg = target(); if (!tg.to) return;
    const r = S.mode === 'rebranch' ? meta.rebranch(S.id, S.branch) : meta.evolve(S.id, S.branch);
    if (!r.ok) { ui.toast(r.why); refresh(); return; }
    reg.result = r; reg.skipped = false;
    branchB.forEach((n) => n.setVisible(false)); goB.setVisible(false); closeB.setVisible(false);
    skipB.setVisible(true); skipHint.setVisible(true);
    game.vibrate && game.vibrate(30);
    setPhase('cocoon');
  }
  function skip() { if (S.phase === 'ready' || S.phase === 'done' || S.phase === 'closed') return; reg.skipped = true; finish(); }
  function finish() {
    setPhase('done'); skipB.setVisible(false); skipHint.setVisible(false); closeB.setVisible(true);
    cocoon.visible = false; shards.visible = false; glow.intensity = 0; chevron.visible = false;
    if (oldS) { oldS.holder.visible = false; oldS.sh.visible = false; }
    S.lapT = 0; S.lapP = 0; refreshDone();
  }
  function refreshDone() {
    // the comparison stays on the change just made: from what it was to what it is
    const r = reg.result, h = meta.acc.heroes[S.id];
    const from = S.mode === 'rebranch' ? formSpec(3, r.from) : formSpec(r.from, null), to = formSpec(h.form, h.branch);
    fill(from, to);
    costT.set(S.mode === 'rebranch' ? 'Đã đổi nhánh!' : 'Tiến hoá thành công!'); goB.setVisible(false); closeB.setLabel('XONG');
    branchB.forEach((n) => n.setVisible(false));
  }
  function tick3d(dt) {
    tick3dInner(dt); tickBits(dt);
    reg.glowMax = Math.max(reg.glowMax || 0, glow.intensity);
    if (newS) { const p = newS.holder.position; reg.newPos = [p.x, p.y, p.z, newS.holder.visible]; }
  }
  // the lap of the pedestal in the new gait: where the form is at time T, and what it shows
  const LAP_R = 0.85, LAP_W = { gallop: 1.45, stomp: 0.75, roll: 1.5, fly: 1.2, glide: 1.0, swimAir: 0.9, slither: 0.9 };
  function lap(kind, T) {
    const w = LAP_W[kind] || 1.1; let a = T * w, y = 0, vis = true, under = false, pop = null;
    if (kind === 'hop') y = Math.abs(Math.sin(T * 6.5)) * 0.16;
    else if (kind === 'leap') {
      // walk, crouch, then one long arc that lands with a puff of earth
      const n = Math.floor(T / 1.7), p = (T % 1.7) / 1.7, q = Math.max(0, (p - 0.5) / 0.5);
      a = T * 0.6 + n * 1.3 + 1.3 * (q * q * (3 - 2 * q)); y = Math.sin(q * Math.PI) * 0.6;
      if (q > 0.96) pop = 'land';
    } else if (kind === 'burrow') {
      // walk, dive, a mound runs under the pedestal, then the beast bursts out
      const p = (T % 3) / 3, d = (newS.h * K) + 0.1;
      if (p > 0.45 && p < 0.58) y = -d * ((p - 0.45) / 0.13);
      else if (p >= 0.58 && p < 0.86) { y = -d; vis = false; under = true; }
      else if (p >= 0.86 && p < 0.94) y = -d * (1 - (p - 0.86) / 0.08);
      pop = p >= 0.45 && p < 0.47 ? 'dive' : p >= 0.86 && p < 0.88 ? 'out' : null;
    } else if (kind === 'blink') {
      // a run, a flash of sparks, gone, and back a quarter lap further on
      const n = Math.floor(T / 2), p = (T % 2) / 2;
      a = T * w + 1.4 * (n + (p >= 0.84 ? 1 : 0));
      vis = !(p >= 0.76 && p < 0.84); pop = p >= 0.76 && p < 0.78 ? 'out' : p >= 0.84 && p < 0.86 ? 'in' : null;
    }
    return { a, y, vis, under, pop, speed: LAP_R * w };
  }
  function tick3dInner(dt) {
    const k = flashK(), ph = S.phase, t = S.t;
    const hO = oldS ? oldS.h * K : 1, hN = newS ? newS.h * K : hO, sp = (s) => s.span * K;
    if (ph !== 'ready') chevron.visible = false;
    if (ph !== 'done') mound.visible = false;
    if (ph === 'ready') {
      S.orbit += dt * 0.25;
      cocoon.visible = false; shards.visible = false; glow.intensity = 0; rune.material.emissiveIntensity = 0.5 + Math.sin(ui.t * 2) * 0.15;
      const wd = (s) => s.wide(READY_YAW) * K, top = Math.max(hO, hN) + (S.upMax || 0), W = newS ? SEP + Math.max(wd(oldS), wd(newS)) / 2 + 0.05 : wd(oldS) / 2 + 0.05;
      frame(Math.sin(S.orbit) * 0.22, W + 0.04, top / 2 + 0.1, top * 0.5, 0.26);
      const u0 = oldS ? drive(oldS, { anim: 'idle', animT: ui.t, dt }, { x: -SEP, yaw: READY_YAW }) : 0;
      const u1 = newS ? drive(newS, { anim: 'idle', animT: ui.t + 0.7, dt }, { x: SEP, yaw: -READY_YAW }) : 0;
      S.upMax = Math.max(u0, u1);
      chevron.visible = !!newS; chevron.position.set(Math.sin(ui.t * 4) * 0.05, Math.min(hO + u0, hN + u1) * 0.45, 0.25); chevron.scale.setScalar(0.9 + Math.sin(ui.t * 4) * 0.1);
      return;
    }
    const focus = (h, s) => { h += S.up || 0; frame(S.cam, Math.max(h, s * 1.2) * 0.5 + 0.12, Math.max(h, s) * 0.5 + 0.14, Math.max(h * 0.5, 0.4)); };
    if (ph === 'cocoon') {
      const e = ease(t / PHASES[0].dur), slide = ease(t / 0.45);
      if (newS) { newS.holder.visible = false; newS.sh.visible = false; }
      cocoon.visible = slide > 0.6; cocoon.material.opacity = 0.2 + 0.72 * e; cocoon.scale.setScalar(cocoon.userData.s * (0.3 + 0.7 * e));
      cocoon.rotation.y += dt * 1.6; glow.intensity = 1.5 * e * k; cocoonMat.emissiveIntensity = 0.4 + 0.5 * e * k;
      S.up = oldS ? drive(oldS, { anim: 'evolve', animT: t, dt }, { x: -SEP * (1 - slide), yaw: READY_YAW * (1 - slide), vis: e < 0.85 }) : 0;
      for (const c of cracks) c.scale.set(1, 0.001, 1);
      S.cam = t * 0.4; focus(hO, sp(oldS));
    } else if (ph === 'crack') {
      const e = t / PHASES[1].dur;
      cocoon.rotation.y += dt * 0.4; cocoon.position.x = Math.sin(t * 60) * 0.03 * e;
      if (oldS) { oldS.holder.visible = false; oldS.sh.visible = false; }
      cracks.forEach((c, i) => { const g = Math.min(1, Math.max(0, e * 1.6 - i * 0.07)); c.scale.set(1, 0.001 + g, 1); });
      crackMat.opacity = 0.6 + 0.4 * k; glow.intensity = (1.5 + 2.5 * e) * k; cocoonMat.emissiveIntensity = 0.9 + 0.4 * e * k;
      S.cam = 0.52 + t * 0.3; frame(S.cam, cocoon.userData.s * 0.75 + 0.35, cocoon.userData.s * 0.75 + 0.3, cocoon.position.y);
    } else if (ph === 'burst') {
      const e = t / PHASES[2].dur;
      cocoon.visible = false; shards.visible = true; cocoon.position.x = 0;
      for (let i = 0; i < N_SHARD; i++) { v3.copy(shardV[i]).multiplyScalar(e * 0.9); v3.y += cocoon.position.y - 2.2 * e * e; q.setFromAxisAngle(one, e * 8 + i); m4.compose(v3, q, one.clone().multiplyScalar(Math.max(0.05, 1 - e * 0.8))); shards.setMatrixAt(i, m4); }
      shards.instanceMatrix.needsUpdate = true;
      glow.intensity = 6 * (1 - e) * k;
      S.up = newS ? drive(newS, { anim: 'evolve', animT: 0.2 + t, dt }, { yaw: e * 3 }) : 0;
      S.cam = 0.82; focus(hN, newS ? sp(newS) : 1);
    } else if (ph === 'pose') {
      const e = ease(t / PHASES[3].dur);
      shards.visible = false; glow.intensity = 2 * (1 - e) * k;
      S.up = newS ? drive(newS, { anim: 'evolve', animT: 1 + t, dt }, { yaw: 3 + e * 3.1 }) : 0;
      // the camera circles the new form once
      S.cam = 0.82 + e * 6.283; focus(hN, newS ? sp(newS) : 1);
    } else if (ph === 'done' && newS) {
      const h = meta.acc.heroes[S.id], kind = heroDef(formSpec(h.form, h.branch)).move.kind;
      S.lapT += dt; const L1 = lap(kind, S.lapT);
      const x = Math.cos(L1.a) * LAP_R, z = Math.sin(L1.a) * LAP_R;
      const up = drive(newS, { anim: 'run', animT: S.lapT, move: newS.b.move, speed: L1.speed / K, air: AIR.has(kind) ? 1 : 0, dt }, { x, y: L1.y, z, yaw: -L1.a, vis: L1.vis }, 0.55);
      if (L1.pop && L1.pop !== S.lapP) {
        if (L1.pop === 'land' || L1.pop === 'dive' || L1.pop === 'out' && kind === 'burrow') spray(x, 0.05, z, 0x8a6a42, 10, 1.6);
        else spray(x, hN * 0.5, z, 0xc8a8ff, 9, 1.1);
      }
      S.lapP = L1.pop;
      mound.visible = L1.under || (kind === 'burrow' && L1.y < -0.02); mound.position.set(x, 0, z); mound.rotation.y = -L1.a;
      mound.children.forEach((l, i) => { l.position.y = 0.02 + Math.abs(Math.sin(S.lapT * 14 + i)) * 0.04; });
      frame(0.35 + Math.sin(S.lapT * 0.2) * 0.25, LAP_R + sp(newS) / 2, (hN + up) / 2 + 0.3, (hN + up) * 0.45, 0.42);
    }
  }
  // ---------- open and close ----------
  function open(a) {
    S.id = leadOf(meta.acc, a.id); S.prev = game.screen && game.screen !== 'evolve' ? game.screen : S.prev;
    const h = meta.acc.heroes[S.id], br = branchesOf(S.id);
    S.mode = 'evolve'; S.branch = null;
    if (br.length && h.form === 2) S.branch = br.includes(a.branch) ? a.branch : br[0];
    if (br.length && h.form === 3) { const other = br.find((b) => b !== h.branch); S.branch = br.includes(a.branch) && a.branch !== h.branch ? a.branch : other; S.mode = 'rebranch'; }
    reg.id = S.id; reg.seen = []; reg.result = null; reg.skipped = false; reg.glowMax = 0;
    setPhase('ready'); reg.seen = ['ready'];
    ensureVp(); const tg = target(); setBeasts(tg.from, tg.to); S.cam = 0;
    skipB.setVisible(false); skipHint.setVisible(false); closeB.setVisible(true);
    refresh();
  }
  function close() {
    if (S.phase !== 'ready' && S.phase !== 'done') return;
    setPhase('closed');
    ui.hide('evolve', { transition: 'pop' });
    game.goto(S.prev || 'home', { id: S.id });
  }

  return {
    name: 'evolve',
    show(a) { open(a || {}); ui.show('evolve', { transition: 'pop' }); },
    hide() { ui.hide('evolve', { transition: 'none' }); if (S.phase !== 'closed') setPhase('closed'); },
    update(dt) {
      if (!ui.isShown('evolve')) return;
      S.t += dt;
      const i = PHASES.findIndex((p) => p.k === S.phase);
      if (i >= 0 && S.t >= PHASES[i].dur) { if (i + 1 < PHASES.length) setPhase(PHASES[i + 1].k); else finish(); }
    },
  };
}
