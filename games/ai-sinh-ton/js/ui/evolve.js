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

export function openEvolve(heroId, o = {}) {
  const game = o.game || (typeof window !== 'undefined' ? window.__G : null);
  if (!game || !game.screens || !game.screens.evolve || !HERO[heroId]) return false;
  game.goto('evolve', { id: heroId, branch: o.branch, over: true });
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
  const right = ui.panel({ w: L.rw, h: L.lh, r: 18, color: PAL.panel, depth: 5, bevel: 3 }); scr.put(right, L.rx, L.ly, 2);
  // text ink against its panel, in the panel's frame: the strings that stick out
  const _v = new THREE.Vector3();
  reg.audit = () => {
    const bad = [];
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
    }
    return bad;
  };
  const T = (parent, str, o, x, y, z = 6) => { const n = ui.text(str, o); parent.put(n, x, y, z); reg.texts.push({ node: n, box: parent, align: o.align }); return n; };
  const title = T(right, '', { size: 17, maxW: 336, outlineW: 2.6 }, 14, 10);
  const sub = T(right, '', { size: 11, color: 0xc8c0f0, maxW: 336 }, 14, 34);
  const ROWS = ['Máu', 'Công', 'Di chuyển'].map((lab, i) => {
    const y = 54 + i * 21;
    return { l: T(right, lab, { size: 12, color: 0xc8c0f0 }, 14, y), a: T(right, '', { size: 12, maxW: 96 }, 96, y), arrow: T(right, '→', { size: 12, color: 0xffd25a }, 196, y), b: T(right, '', { size: 12, color: 0x8dff9a, maxW: 140 }, 214, y) };
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
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.32, 24), pedMat); ped.position.y = -0.16; root.add(ped);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.045, 8, 48), new THREE.MeshStandardMaterial({ color: 0x9a7aff, emissive: 0x6a3aff, emissiveIntensity: 0.6 })); rune.rotation.x = Math.PI / 2; rune.position.y = 0.01; root.add(rune);
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
  const glow = new THREE.PointLight(0xffd27a, 0, 8); glow.position.set(0, 0.9, 0.6); root.add(glow);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const cam = new THREE.PerspectiveCamera(30, L.lw / (L.lh - 60), 0.1, 50);
  let oldB = null, newB = null, vp = null;
  function aimCam(a, h = 1.15, d = 4.6) { cam.position.set(Math.sin(a) * d, h + 0.9, Math.cos(a) * d); cam.lookAt(0, 0.5, 0); }

  function setBeasts(spec0, spec1) {
    for (const b of [oldB, newB]) if (b) { root.remove(b.root); b.dispose(); }
    oldB = buildBeast(spec0, { lod: 'portrait', color: HERO[spec0.id].color }); root.add(oldB.root);
    newB = spec1 ? buildBeast(spec1, { lod: 'portrait', color: HERO[spec1.id].color }) : null; if (newB) { root.add(newB.root); newB.root.visible = false; }
    const h = Math.max(oldB.height || 1, newB ? newB.height || 1 : 0); const k = 1.3 / h;
    oldB.root.scale.setScalar(k); if (newB) newB.root.scale.setScalar(k);
    cocoon.scale.setScalar(Math.max(0.9, (oldB.height || 1) * k * 0.95));
  }
  function ensureVp() {
    if (vp) return;
    vp = ui.viewport(root, { w: L.lw - 12, h: L.lh - 60, r: 14, camera: cam, bg: 0x1a1236, fps: 30, update: (dt) => tick3d(dt) });
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
    title.set(b ? `${nameA} → ${nameB}` : nameA);
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
    let y = 120 + (nSkills ? 17 + nSkills * 15 : 0) + 4;
    const z = right.top + 6;
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
    cocoon.visible = false; shards.visible = false; glow.intensity = 0;
    if (oldB) oldB.root.visible = false; if (newB) newB.root.visible = true;
    S.lapT = 0; refreshDone();
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
    tick3dInner(dt);
    reg.glowMax = Math.max(reg.glowMax || 0, glow.intensity);
    if (newB) reg.newPos = [newB.root.position.x, newB.root.position.y, newB.root.position.z, newB.root.visible];
  }
  function tick3dInner(dt) {
    const k = flashK(), ph = S.phase, t = S.t;
    const spin = (b, a) => { if (b) b.root.rotation.y = a; };
    if (ph === 'ready') {
      S.orbit += dt * 0.25; aimCam(0.5 + Math.sin(S.orbit) * 0.25);
      cocoon.visible = false; shards.visible = false; glow.intensity = 0; rune.material.emissiveIntensity = 0.5 + Math.sin(ui.t * 2) * 0.15;
      if (oldB) { oldB.root.visible = true; oldB.root.position.set(0, 0, 0); spin(oldB, 0.4); oldB.update({ anim: 'idle', animT: ui.t, move: 'walk', speed: 0, air: 0, face: 0 }, dt); }
      if (newB) newB.root.visible = false;
      return;
    }
    if (ph === 'cocoon') {
      const e = ease(t / PHASES[0].dur);
      cocoon.visible = true; cocoon.material.opacity = 0.2 + 0.72 * e; const s = cocoon.userData.s || (cocoon.userData.s = cocoon.scale.x); cocoon.scale.setScalar(s * (0.3 + 0.7 * e)); cocoon.position.y = 0.25;
      cocoon.rotation.y += dt * 1.6; glow.intensity = 1.5 * e * k; cocoonMat.emissiveIntensity = 0.4 + 0.5 * e * k;
      if (oldB) { oldB.root.visible = e < 0.85; oldB.update({ anim: 'evolve', animT: t, move: 'walk', speed: 0, air: 0, face: 0 }, dt); }
      for (const c of cracks) c.scale.set(1, 0.001, 1);
      aimCam(0.5 + t * 0.4, 1.0, 4.4 - e * 0.6);
    } else if (ph === 'crack') {
      const e = t / PHASES[1].dur;
      cocoon.rotation.y += dt * 0.4; cocoon.position.x = Math.sin(t * 60) * 0.03 * e;
      cracks.forEach((c, i) => { const g = Math.min(1, Math.max(0, e * 1.6 - i * 0.07)); c.scale.set(1, 0.001 + g, 1); });
      crackMat.opacity = 0.6 + 0.4 * k; glow.intensity = (1.5 + 2.5 * e) * k; cocoonMat.emissiveIntensity = 0.9 + 0.4 * e * k;
      aimCam(0.9 + t * 0.3, 1.0, 3.8);
    } else if (ph === 'burst') {
      const e = t / PHASES[2].dur;
      cocoon.visible = false; shards.visible = true; cocoon.position.x = 0;
      for (let i = 0; i < N_SHARD; i++) { v3.copy(shardV[i]).multiplyScalar(e * 0.9); v3.y += 0.75 - 2.2 * e * e; q.setFromAxisAngle(one, e * 8 + i); m4.compose(v3, q, one.clone().multiplyScalar(Math.max(0.05, 1 - e * 0.8))); shards.setMatrixAt(i, m4); }
      shards.instanceMatrix.needsUpdate = true;
      glow.intensity = 6 * (1 - e) * k;
      if (newB) { newB.root.visible = true; newB.root.rotation.y = e * 3; }
      aimCam(1.2, 1.0, 3.8 + e * 0.5);
    } else if (ph === 'pose') {
      const e = ease(t / PHASES[3].dur);
      shards.visible = false; glow.intensity = 2 * (1 - e) * k;
      if (newB) { newB.root.visible = true; newB.root.rotation.y = 3 + e * 3.1; newB.update({ anim: 'evolve', animT: 1 + t, move: 'walk', speed: 0, air: 0, face: 0 }, dt); }
      // the camera circles the new form once
      aimCam(1.2 + e * 6.283, 1.1, 4.3);
    } else if (ph === 'done' && newB) {
      // the new gait: laps of the pedestal
      S.lapT += dt; const kind = heroDef(formSpec(meta.acc.heroes[S.id].form, meta.acc.heroes[S.id].branch)).move.kind;
      const a = S.lapT * 1.1, R = 0.85; let y = 0; let vis = true;
      if (AIR.has(kind)) y = 0.45 + Math.sin(S.lapT * 3) * 0.06;
      else if (kind === 'hop' || kind === 'leap') y = Math.abs(Math.sin(S.lapT * (kind === 'hop' ? 9 : 3.5))) * (kind === 'hop' ? 0.18 : 0.5);
      else if (kind === 'burrow') { const p = (S.lapT % 3) / 3; y = p > 0.6 && p < 0.85 ? -0.8 : 0; }
      else if (kind === 'blink') vis = (S.lapT % 2) > 0.18;
      newB.root.visible = vis; newB.root.position.set(Math.cos(a) * R, y, Math.sin(a) * R); newB.root.rotation.y = -a;
      newB.update({ anim: 'run', animT: S.lapT, move: kind, speed: 4, air: AIR.has(kind) ? 1 : 0, face: -a }, dt);
      aimCam(0.5 + Math.sin(S.lapT * 0.2) * 0.3);
    }
  }

  // ---------- open and close ----------
  function open(a) {
    S.id = a.id; S.prev = game.screen && game.screen !== 'evolve' ? game.screen : S.prev;
    const h = meta.acc.heroes[S.id], br = branchesOf(S.id);
    S.mode = 'evolve'; S.branch = null;
    if (br.length && h.form === 2) S.branch = br.includes(a.branch) ? a.branch : br[0];
    if (br.length && h.form === 3) { const other = br.find((b) => b !== h.branch); S.branch = br.includes(a.branch) && a.branch !== h.branch ? a.branch : other; S.mode = 'rebranch'; }
    reg.id = S.id; reg.seen = []; reg.result = null; reg.skipped = false; reg.glowMax = 0;
    setPhase('ready'); reg.seen = ['ready'];
    ensureVp(); const tg = target(); setBeasts(tg.from, tg.to); delete cocoon.userData.s; cocoon.scale.setScalar(cocoon.scale.x);
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
