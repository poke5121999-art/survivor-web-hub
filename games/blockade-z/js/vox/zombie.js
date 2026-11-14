// Voxel zombies (?vox=1): one zombie type (default walker) is rebuilt part by part from its own boxes and pixel textures,
// on the existing skeleton, so every walk / attack / crawl / death animation still drives it.
// - Every zombie of the type shares one geometry per body part (per clothes texture); a part gets its own copy of the
//   voxel grid only when it is first hit.
// - A hit carves voxels where the shot struck (meat and bone show inside), chips fly off as debris.
// - When the voxels around a limb's joint are gone the limb comes off (the game's own sever on the host; a shin or a
//   forearm just drops as debris).
// - Death: the body starts its fall, then collapses into voxel chunks that drop, settle and fade.
const BZ = window.BZ; const THREE = window.THREE; const V = BZ.vox;

V.register('zombie', (G) => {
  const Z = G.zombies; const X = G.vox; const VS = X.low ? 1 / 16 : 1 / 32; // low tier: one voxel per texel of the 8 px / 0.5 m zombie textures; else two per texel
  const PARTS = ['legL', 'legR', 'kneeL', 'kneeR', 'torso', 'armL', 'armR', 'elbowL', 'elbowR', 'head'];
  const CLASS = { legL: 'pants', legR: 'pants', kneeL: 'pants', kneeR: 'pants', torso: 'shirt', armL: 'skin', armR: 'skin', elbowL: 'skin', elbowR: 'skin', head: 'skin' };
  const CHILD = { legL: 'kneeL', legR: 'kneeR', armL: 'elbowL', armR: 'elbowR' };
  const HITS = { head: ['head'], leg: ['legL', 'kneeL', 'legR', 'kneeR'], body: ['torso', 'armL', 'elbowL', 'armR', 'elbowR'] };
  const keyOf = (mat) => (mat.map && mat.map.name ? mat.map.name.replace(/^bz_/, '') : 'z_skin');
  const EYES = [1, 2, 5, 6];
  const cache = new Map(); const stats = { shared: 0, own: 0, carves: 0, severed: 0, collapsed: 0, tris: 0 };

  // the shared grid + geometry of one part in one outfit
  function shared(boxes, tex, face) {
    const id = (boxes.__vid || (boxes.__vid = cache.size + 1 + Math.random())) + '|' + tex + '|' + face;
    let s = cache.get(id);
    if (!s) {
      const list = boxes.map(([a, b, k = 1, grp = 0]) => ({ a, b, k, uv: grp === 1 ? 'fit' : 'dens', tex: (f) => (grp === 1 && f === 'pz' ? face : tex),
        emis: (key, u, v, f) => f === 'pz' && key.startsWith('z_face') && Math.floor((1 - v) * 8) === 3 && EYES.includes(Math.floor(u * 8)) }));
      const grid = V.rasterize(list, VS, { interior: 'flesh' });
      // the voxels around the pivot hold the part on: the top slice for limbs, the neck for the head
      grid.joint = jointCount(grid);
      s = { grid, geo: V.meshGrid(grid) }; cache.set(id, s); stats.shared++;
    }
    return s;
  }
  function jointCount(g) { let n = 0; const j0 = Math.max(0, Math.floor((-0.085 - g.oy) / g.vs)); const j1 = Math.min(g.ny - 1, Math.floor((0.085 - g.oy) / g.vs)); for (let j = j0; j <= j1; j++) for (let i = 0; i < g.nx * g.nz; i++) if (g.data[i + g.nx * g.nz * j]) n++; return n; }

  // ---- put the voxel body on a zombie that just entered play (or give the boxes back to another type) ----
  function dress(z) {
    const b = z.body; const want = z.type === V.ztype && !z.T.rig && !z.T.quad;
    for (const name of PARTS) {
      const mesh = b[name]; if (!mesh) continue;
      if (!mesh.userData.vox0) mesh.userData.vox0 = { g: mesh.geometry, m: mesh.material };
      const own = mesh.userData.voxOwn; if (own) { mesh.geometry.dispose(); mesh.userData.voxOwn = null; stats.own--; }
      const child = name === 'kneeL' || name === 'kneeR' || name === 'elbowL' || name === 'elbowR';
      if (!want || !mesh.userData.vox0.g.userData.boxes) { mesh.geometry = mesh.userData.vox0.g; mesh.material = mesh.userData.vox0.m; mesh.userData.voxS = null; if (child) mesh.scale.set(1, 1, 1); continue; }
      if (!z.voxMat) z.voxMat = V.material(VS);
      const s = shared(mesh.userData.vox0.g.userData.boxes, keyOf(b.mats[CLASS[name]]), keyOf(b.mats.face));
      mesh.geometry = s.geo; mesh.material = z.voxMat; mesh.userData.voxS = s;
      if (child) { mesh.visible = true; mesh.scale.set(0.93, 1, 0.93); } // a hair thinner than the thigh / upper arm so the faces never share a plane; // (a shin or forearm dropped in its last life)
    }
    z.vox = want; z.voxHp = z.hp; z.voxAcc = 0; z.voxDie = 0;
  }

  // ---- a hit: find the voxel the shot struck and carve around it ----
  const inv = new THREE.Matrix4(); const o = new THREE.Vector3(); const d = new THREE.Vector3(); const w = new THREE.Vector3(); const fwd = new THREE.Vector3(); const tmp = new THREE.Vector3();
  function gridOf(mesh) { return mesh.userData.voxOwn || (mesh.userData.voxS && mesh.userData.voxS.grid); }
  function strike(z, names, O, D) {
    let best = null;
    for (const name of names) {
      const mesh = z.body[name]; if (!mesh || !mesh.visible || !mesh.userData.voxS) continue; if (mesh.parent && !mesh.parent.visible) continue;
      const g = gridOf(mesh); inv.copy(mesh.matrixWorld).invert();
      o.copy(O).applyMatrix4(inv); d.copy(D).transformDirection(inv);
      const h = V.rayGrid(g, (o.x - g.ox) / g.vs, (o.y - g.oy) / g.vs, (o.z - g.oz) / g.vs, d.x, d.y, d.z);
      if (h && (!best || h[3] < best.t)) best = { t: h[3], name, mesh, x: h[0], y: h[1], z: h[2], dx: d.x, dy: d.y, dz: d.z };
    }
    return best;
  }
  function hitCarve(z, amount, part, dir, opt = {}) {
    const b = z.body; if (!b.root.visible) return; b.root.updateMatrixWorld(true);
    const s = z.T.scale; const names = HITS[part] || HITS.body; let h = null;
    // your own shot: the crosshair ray, so the hole is where you aimed
    if (!opt.net && !opt.blast && !opt.cut) { G.camera.getWorldDirection(fwd); if (fwd.dot(dir) > 0.96) h = strike(z, names, G.camera.getWorldPosition(w), fwd) || strike(z, PARTS, w, fwd); }
    if (!h) { // anything else: a line through the part along the hit direction, a little off centre so holes spread
      const seed = V.hash3(z.hp | 0, amount * 10 | 0, stats.carves, 3); const jx = ((seed & 255) / 255 - 0.5) * 0.3 * s; const jy = (((seed >> 8) & 255) / 255 - 0.5) * 0.36 * s;
      const y = part === 'head' ? 1.7 : part === 'leg' ? 0.42 : 1.1; D0.copy(dir); if (D0.lengthSq() < 1e-6) D0.set(0, 0, 1); D0.normalize();
      w.set(z.pos.x - D0.z * jx, z.pos.y + y * s + jy, z.pos.z + D0.x * jx).addScaledVector(D0, -2);
      h = strike(z, names, w, D0) || strike(z, PARTS, w.set(z.pos.x, z.pos.y + y * s, z.pos.z).addScaledVector(D0, -2), D0);
    }
    if (!h) return;
    const mesh = h.mesh; let g = mesh.userData.voxOwn;
    if (!g) { g = mesh.userData.voxOwn = V.cloneGrid(mesh.userData.voxS.grid); g.joint0 = mesh.userData.voxS.grid.joint; stats.own++; }
    const k = Math.min(1, amount / Math.max(1, z.maxHp)); let r = (1.3 + 3.4 * Math.sqrt(k) + (opt.blast ? 1.5 : 0)) * (VS < 0.05 ? 1 : 0.55);
    const out = V.carve(g, h.x + 0.5 + h.dx * r * 0.5, h.y + 0.5 + h.dy * r * 0.5, h.z + 0.5 + h.dz * r * 0.5, r, stats.carves++);
    if (!out.length) return;
    if (mesh.geometry !== mesh.userData.voxS.geo) mesh.geometry.dispose();
    mesh.geometry = V.meshGrid(g);
    // chips: a few of the voxels that came off, thrown back at the shooter and out of the far side
    const n = out.length / 4; const step = Math.max(1, Math.ceil(n / (X.low ? 5 : 12))); const vs = VS * s;
    for (let i = 0; i < n; i += step) {
      tmp.set(g.ox + (out[i * 4] + 0.5) * g.vs, g.oy + (out[i * 4 + 1] + 0.5) * g.vs, g.oz + (out[i * 4 + 2] + 0.5) * g.vs).applyMatrix4(mesh.matrixWorld);
      const back = (i / step) % 3 === 0 ? 1 : -1; const sp = 1.5 + ((i * 7) % 5) * 0.7;
      X.pool.spawn(tmp.x, tmp.y, tmp.z, -dir.x * sp * back + ((i * 13) % 7 - 3) * 0.35, 1.5 + ((i * 5) % 6) * 0.5, -dir.z * sp * back + ((i * 11) % 7 - 3) * 0.35, vs * (1 + (i % 3) * 0.5), out[i * 4 + 3], 2.2 + (i % 4) * 0.4, z.pos.y);
    }
    tmp.set(g.ox + (h.x + 0.5) * g.vs, g.oy + (h.y + 0.5) * g.vs, g.oz + (h.z + 0.5) * g.vs).applyMatrix4(mesh.matrixWorld);
    if (X.fx && X.fx.impact) X.fx.impact({ point: tmp.clone(), normal: [-dir.x, 0, -dir.z], dir, surface: 'flesh', color: out[3], power: k });
    if (X.audio && X.audio.impact) X.audio.impact({ surface: 'flesh', point: tmp, mag: Math.min(1, 0.3 + k * 2) });
    if (X.ui && X.ui.hit && !opt.net) X.ui.hit({ kill: !z.alive, head: part === 'head' });
    // the joint: with most of its voxels gone the part lets go
    const left = jointCount(g) / Math.max(1, g.joint0);
    if (left < 0.3 && h.name !== 'torso') dropPart(z, h.name, dir);
  }
  const D0 = new THREE.Vector3();
  function dropPart(z, name, dir) {
    const mesh = z.body[name]; if (!mesh.visible) return; stats.severed++;
    const limb = name === 'legL' || name === 'legR' || name === 'armL' || name === 'armR' || name === 'head';
    if (limb) { if (!(G.coop && G.coop.guest) && z.alive && !z.T.boss) Z.sever(z, name, dir, {}); return; } // the game's own sever: gib, stump, crawl, co-op event
    crumble(z, mesh, dir, 0.5); mesh.visible = false;
  }
  // a part falls apart into chunks of 2x2x2 voxels (bigger on the low tier), each in the colour of its corner voxel
  function crumble(z, mesh, dir, keep = 1) {
    const g = gridOf(mesh); if (!g) return 0; const s = z.T.scale; const B = VS < 0.05 ? 4 : 2; const size = g.vs * B * s * 0.92; let n = 0;
    for (let j = 0; j < g.ny; j += B) for (let k = 0; k < g.nz; k += B) for (let i = 0; i < g.nx; i += B) {
      let c = 0; let solid = 0; let surf = 0;
      for (let q = 0; q < B * B * B; q++) { const x = i + (q % B); const y = j + (((q / B) | 0) % B); const zz = k + ((q / (B * B)) | 0); if (x >= g.nx || y >= g.ny || zz >= g.nz) continue; const v = g.data[x + g.nx * (zz + g.nz * y)]; if (!v) continue; solid++; if (!(v & (1 << 26))) { surf++; if (!c) c = v; } else if (!c) c = v; }
      if (solid < B * B * B * 0.3) continue;
      if (keep < 1 && (V.hash3(i, j, k, 5) & 255) / 255 > keep) continue;
      tmp.set(g.ox + (i + B / 2) * g.vs, g.oy + (j + B / 2) * g.vs, g.oz + (k + B / 2) * g.vs).applyMatrix4(mesh.matrixWorld);
      const hh = V.hash3(i, j, k, 9); const a = (hh & 1023) / 1023 * 6.283; const sp = 0.4 + ((hh >> 10) & 255) / 255 * 1.6;
      X.pool.spawn(tmp.x, tmp.y, tmp.z, Math.cos(a) * sp + dir.x * 1.2, 0.6 + ((hh >> 18) & 255) / 255 * 2.2, Math.sin(a) * sp + dir.z * 1.2, size, c & 0xffffff, 3.2 + ((hh >> 4) & 15) * 0.14, z.pos.y);
      n++;
    }
    return n;
  }
  function collapse(z) {
    const b = z.body; if (!b.root.visible) return; b.root.updateMatrixWorld(true); stats.collapsed++;
    const dir = D0.set(Math.sin(b.root.rotation.y), 0, Math.cos(b.root.rotation.y)).multiplyScalar(-0.6); let n = 0; const busy = X.pool.count() > X.pool.cap * 0.7;
    for (const name of PARTS) { const mesh = b[name]; if (!mesh || !mesh.visible || !mesh.userData.voxS || (mesh.parent !== b.hips && !mesh.parent.visible)) continue; n += crumble(z, mesh, dir, busy ? 0.4 : X.low ? 0.6 : 1); }
    const at = new THREE.Vector3(z.pos.x, z.pos.y + 0.6 * z.T.scale, z.pos.z);
    G.fx.burst(at, X.low ? 8 : 16, [0x8a1410, 0x5a0a08, 0x9db08a], { speed: 2.5, size: 0.1, life: 0.7 });
    if (X.audio && X.audio.rubble) X.audio.rubble({ surface: 'flesh', point: at, n });
    b.root.visible = false; b.root.rotation.x = 0; z.dying = 0; b.barBg.visible = false;
  }

  // ---- hooks: the game's damage, and a per-frame watch on every pooled zombie ----
  const damage0 = Z.damage;
  Z.damage = (z, amount, part, dir, imp, opt) => {
    const vox = z.vox && z.alive; const r = damage0(z, amount, part, dir, imp, opt);
    if (vox && !(opt && opt.dot) && amount > 0) { try { hitCarve(z, amount, part, dir || D0.set(0, 0, 1), opt || {}); } catch (e) { if (!stats.err) { stats.err = String(e && e.stack || e); console.error('[vox] zombie carve threw', e); } } z.voxHp = z.hp; }
    return r;
  };
  function update(dt) {
    for (const z of Z.list) {
      if (z.alive && !z.voxLive) { z.voxLive = true; dress(z); }
      else if (!z.alive && z.voxLive) { z.voxLive = false; if (z.vox && z.body.root.visible && z.dying > 0) z.voxDie = 0.42; }
      if (!z.vox) continue;
      if (z.voxDie > 0) { z.voxDie -= dt; if (z.voxDie <= 0) collapse(z); }
      if (!z.body.root.visible) continue;
      if (z.voxMat) z.voxMat.emissive.copy(z.body.mats.skin.emissive);
      // damage that did not come through a hit here (a guest's view of other players' shots, burn and poison ticks): wounds open as the health drops
      if (z.alive && z.hp < z.voxHp) { z.voxAcc += z.voxHp - z.hp; z.voxHp = z.hp; if (z.voxAcc > z.maxHp * 0.12) { const a = (V.hash3(z.hp | 0, stats.carves, 1, 1) & 1023) / 1023 * 6.283; hitCarve(z, z.voxAcc, ['body', 'body', 'leg', 'head'][stats.carves & 3], D0.set(Math.cos(a), 0, Math.sin(a)).clone(), { net: true }); z.voxAcc = 0; } }
      else if (z.hp > z.voxHp) z.voxHp = z.hp;
    }
  }
  return { update, stats, dress, hitCarve, collapse, VS, debug: () => ({ ...stats, vs: VS, cache: cache.size }) };
});
