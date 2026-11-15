// Voxel zombies, monsters and bosses: every body is rebuilt from its own boxes and pixel textures, piece by piece on the
// existing skeleton, so every walk / attack / crawl / death animation (and every boss kit's pose) still drives it.
// - The humanoid body parts (legs, shins, torso, arms, forearms, head) go through the per-part path below; everything
//   else hanging on the body (special parts, boss garb, wings, stumps, the spider and egg rigs, the big bosses' own
//   bodies) is voxelized from its mesh (js/vox/voxelize.js V.voxShared).
// - Every body of a type shares one geometry per piece (per texture); a piece gets its own copy of the grid only when hit.
// - A hit carves voxels where the shot struck (meat and bone show inside a zombie), chips fly off as debris.
// - When the voxels around a limb's joint are gone the limb comes off (the game's own sever on the host; a shin or a
//   forearm just drops as debris). Bosses only lose voxels.
// - Death: the body starts its fall, then collapses into voxel chunks that drop, settle and fade; a boss or a rig
//   monster collapses at once (from js/bosses.js / js/zkinds.js).
const BZ = window.BZ; const THREE = window.THREE; const V = BZ.vox;

V.register('zombie', (G) => {
  const Z = G.zombies; const X = G.vox; const VS = X.low ? 1 / 16 : 1 / 32; // low tier: one voxel per texel of the 8 px / 0.5 m zombie textures; else two per texel
  const PARTS = ['legL', 'legR', 'kneeL', 'kneeR', 'torso', 'armL', 'armR', 'elbowL', 'elbowR', 'head'];
  const CLASS = { legL: 'pants', legR: 'pants', kneeL: 'pants', kneeR: 'pants', torso: 'shirt', armL: 'skin', armR: 'skin', elbowL: 'skin', elbowR: 'skin', head: 'skin' };
  const HITS = { head: ['head'], leg: ['legL', 'kneeL', 'legR', 'kneeR'], body: ['torso', 'armL', 'elbowL', 'armR', 'elbowR'] };
  const LIMB = new Set(['legL', 'legR', 'armL', 'armR', 'head']);
  const keyOf = (mat) => (mat.map && mat.map.name ? mat.map.name.replace(/^bz_/, '') : 'z_skin');
  const EYES = [1, 2, 5, 6];
  // a skin whose bright texels glow in the box look (emissiveMap = map): those texels become glowing voxels instead
  const GLOWSKIN = new Set(['z_skin_burn']);
  // ?voxzoff=a,b keeps those types on the old box look (a per-type fallback for bisecting)
  const OFF = new Set(String((BZ.params || {}).voxzoff || new URLSearchParams(location.search).get('voxzoff') || '').split(',').filter(Boolean));
  const cache = new Map(); const stats = { shared: 0, own: 0, carves: 0, severed: 0, collapsed: 0, pieces: 0, skipped: 0 };

  // the shared grid + geometry of one humanoid part in one outfit
  function shared(boxes, tex, face) {
    const id = (boxes.__vid || (boxes.__vid = cache.size + 1 + Math.random())) + '|' + tex + '|' + face;
    let s = cache.get(id);
    if (!s) {
      const list = boxes.map(([a, b, k = 1, grp = 0]) => ({ a, b, k, uv: grp === 1 ? 'fit' : 'dens', tex: (f) => (grp === 1 && f === 'pz' ? face : tex),
        emis: (key, u, v, f) => (f === 'pz' && key.startsWith('z_face') && Math.floor((1 - v) * 8) === 3 && EYES.includes(Math.floor(u * 8))) || (GLOWSKIN.has(key) && ((V.sample(key, u, v, 1) >> 16) & 255) > 200) }));
      const grid = V.rasterize(list, VS, { interior: 'flesh' });
      // the voxels around the pivot hold the part on: the top slice for limbs, the neck for the head
      grid.joint = jointCount(grid);
      s = { grid, geo: V.meshGrid(grid) }; cache.set(id, s); stats.shared++;
    }
    return s;
  }
  function jointCount(g) { let n = 0; const j0 = Math.max(0, Math.floor((-0.085 - g.oy) / g.vs)); const j1 = Math.min(g.ny - 1, Math.floor((0.085 - g.oy) / g.vs)); for (let j = j0; j <= j1; j++) for (let i = 0; i < g.nx * g.nz; i++) if (g.data[i + g.nx * g.nz * j]) n++; return n; }

  // one voxel material per zombie and voxel size (the bevel is drawn in the mesh's own units); the flash / elite glow is copied onto all of them
  function matOf(z, vs) { const M = z.voxMats || (z.voxMats = {}); return M[vs] || (M[vs] = V.material(vs)); }
  // the scale between a piece and the body's root, snapped to eighths so pieces of the same size share their grids
  function relScale(o, root) { let s = 1; for (let p = o; p && p !== root; p = p.parent) { const k = Math.max(Math.abs(p.scale.x), Math.abs(p.scale.y), Math.abs(p.scale.z)); if (k > 1e-3) s *= k; } return Math.min(4, Math.max(0.25, Math.round(s * 8) / 8)); }
  function restore(o) { if (o.userData.voxOwn) { o.geometry.dispose(); o.userData.voxOwn = null; stats.own--; } if (o.userData.vox0) { o.geometry = o.userData.vox0.g; o.material = o.userData.vox0.m; } o.userData.voxS = null; }
  function convert(o, z, root, interior) {
    if (o.userData.noVox) return;
    if (o.userData.voxOwn) { o.geometry.dispose(); o.userData.voxOwn = null; stats.own--; }
    if (!o.userData.vox0) o.userData.vox0 = { g: o.geometry, m: o.material };
    const vs = VS / relScale(o, root); const s = V.voxShared(o, vs, { interior });
    if (!s) { restore(o); stats.skipped++; return; }
    o.geometry = s.geo; o.material = matOf(z, vs); o.userData.voxS = s; stats.pieces++;
  }

  // ---- put the voxel body on a zombie that just entered play ----
  function dress(z) {
    const b = z.body; const T = z.T; const off = OFF.has(z.type); const hum = !T.rig && !off; const partSet = new Set();
    for (const name of PARTS) {
      const mesh = b[name]; if (!mesh) continue; partSet.add(mesh);
      if (!mesh.userData.vox0) mesh.userData.vox0 = { g: mesh.geometry, m: mesh.material };
      if (mesh.userData.voxOwn) { mesh.geometry.dispose(); mesh.userData.voxOwn = null; stats.own--; }
      const child = name === 'kneeL' || name === 'kneeR' || name === 'elbowL' || name === 'elbowR';
      if (!hum || !mesh.userData.vox0.g.userData.boxes) { mesh.geometry = mesh.userData.vox0.g; mesh.material = mesh.userData.vox0.m; mesh.userData.voxS = null; if (child) mesh.scale.set(1, 1, 1); continue; }
      const s = shared(mesh.userData.vox0.g.userData.boxes, keyOf(b.mats[CLASS[name]]), keyOf(b.mats.face));
      mesh.geometry = s.geo; mesh.material = matOf(z, VS); mesh.userData.voxS = s;
      if (child) { mesh.visible = true; mesh.scale.set(0.93, 1, 0.93); } // a hair thinner than the thigh / upper arm so the faces never share a plane; (a shin or forearm dropped in its last life)
    }
    // everything else on the body whose parents show: walk the tree, converting each mesh (hidden ones too, so a stump or a
    // garb piece that appears later is already voxel), but not descending into hidden groups
    const walk = (o) => {
      for (const c of o.children) {
        if (c.isMesh && !partSet.has(c)) { if (off) restore(c); else convert(c, z, b.root, c.parent === b.hips && Object.values(b.stumps).includes(c) ? 'flesh' : 'own'); }
        if (c.visible) walk(c);
      }
    };
    walk(b.root);
    z.vox = !off; z.voxHum = hum; z.voxHp = z.hp; z.voxAcc = 0; z.voxDie = 0;
  }
  // the pieces that show right now (whole chain visible)
  function shown(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return root.visible; }
  function pieces(z, names) {
    const b = z.body; const out = [];
    if (names) { for (const n of names) { const m = b[n]; if (m && m.userData.voxS && shown(m, b.root)) out.push(m); } return out; }
    b.root.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.userData.voxS && shown(o, b.root)) out.push(o); });
    return out;
  }

  // ---- a hit: find the voxel the shot struck and carve around it ----
  const inv = new THREE.Matrix4(); const o = new THREE.Vector3(); const d = new THREE.Vector3(); const w = new THREE.Vector3(); const fwd = new THREE.Vector3(); const tmp = new THREE.Vector3();
  const D0 = new THREE.Vector3(); const Mi = new THREE.Matrix4(); const Sc = new THREE.Vector3(); const Qd = new THREE.Quaternion();
  // where loose voxels land: the floor under the body (a flyer or a boss in the air drops its pieces to the ground)
  function groundUnder(z) { return G.fx.floorY ? G.fx.floorY(z.pos.x, z.pos.y + 0.2, z.pos.z) : Math.max(0, z.pos.y); }
  function gridOf(mesh) { return mesh.userData.voxOwn || (mesh.userData.voxS && mesh.userData.voxS.grid); }
  function strike(list, O, D) {
    let best = null;
    for (const mesh of list) {
      if (mesh.isInstancedMesh) continue;
      const g = gridOf(mesh); inv.copy(mesh.matrixWorld).invert();
      o.copy(O).applyMatrix4(inv); d.copy(D).transformDirection(inv);
      const h = V.rayGrid(g, (o.x - g.ox) / g.vs, (o.y - g.oy) / g.vs, (o.z - g.oz) / g.vs, d.x, d.y, d.z);
      // compare in world distance (pieces have different scales)
      if (h) { tmp.set(g.ox + (h[0] + 0.5) * g.vs, g.oy + (h[1] + 0.5) * g.vs, g.oz + (h[2] + 0.5) * g.vs).applyMatrix4(mesh.matrixWorld); const t = tmp.distanceTo(O); if (!best || t < best.t) best = { t, mesh, x: h[0], y: h[1], z: h[2], dx: d.x, dy: d.y, dz: d.z }; }
    }
    return best;
  }
  function hitCarve(z, amount, part, dir, opt = {}) {
    const b = z.body; if (!b.root.visible) return; b.root.updateMatrixWorld(true);
    const s = z.T.scale; const all = pieces(z); if (!all.length) return;
    const named = z.voxHum ? pieces(z, HITS[part] || HITS.body) : all; let h = null;
    // your own shot: the crosshair ray, so the hole is where you aimed
    if (!opt.net && !opt.blast && !opt.cut) { G.camera.getWorldDirection(fwd); if (fwd.dot(dir) > 0.96) h = strike(named, G.camera.getWorldPosition(w), fwd) || strike(all, w, fwd); }
    if (!h) { // anything else: a line through the body along the hit direction, a little off centre so holes spread
      const seed = V.hash3(z.hp | 0, amount * 10 | 0, stats.carves, 3); const jx = ((seed & 255) / 255 - 0.5) * 0.3 * s; const jy = (((seed >> 8) & 255) / 255 - 0.5) * 0.36 * s;
      D0.copy(dir); if (D0.lengthSq() < 1e-6) D0.set(0, 0, 1); D0.normalize();
      let cy;
      if (z.voxHum) cy = z.pos.y + (part === 'head' ? 1.7 : part === 'leg' ? 0.42 : 1.1) * s;
      else { const m = named[(seed >>> 16) % named.length]; m.getWorldPosition(tmp); cy = tmp.y; }
      w.set(z.pos.x - D0.z * jx, cy + jy, z.pos.z + D0.x * jx).addScaledVector(D0, -2 * Math.max(1, s));
      h = strike(named, w, D0) || strike(all, w.set(z.pos.x, cy, z.pos.z).addScaledVector(D0, -2 * Math.max(1, s)), D0);
    }
    if (!h) return;
    const mesh = h.mesh; let g = mesh.userData.voxOwn;
    if (!g) { g = mesh.userData.voxOwn = V.cloneGrid(mesh.userData.voxS.grid); g.joint0 = mesh.userData.voxS.grid.joint; stats.own++; }
    const k = Math.min(1, amount / Math.max(1, z.maxHp)); let r = (1.3 + 3.4 * Math.sqrt(k) + (opt.blast ? 1.5 : 0)) * (g.vs < 0.05 ? 1 : 0.55);
    if (z.T.boss) r = Math.max(r, g.vs < 0.05 ? 1.9 : 1.2); // a boss's hit still leaves a hole you can see
    const out = V.carve(g, h.x + 0.5 + h.dx * r * 0.5, h.y + 0.5 + h.dy * r * 0.5, h.z + 0.5 + h.dz * r * 0.5, r, stats.carves++);
    if (!out.length) return;
    if (mesh.geometry !== mesh.userData.voxS.geo) mesh.geometry.dispose();
    mesh.geometry = V.meshGrid(g);
    if (!g.count) mesh.visible = false;
    // chips: a few of the voxels that came off, thrown back at the shooter and out of the far side
    const ws = mesh.matrixWorld.getMaxScaleOnAxis(); const n = out.length / 4; const step = Math.max(1, Math.ceil(n / (X.low ? 5 : 12))); const vs = g.vs * ws; const floor = groundUnder(z);
    for (let i = 0; i < n; i += step) {
      tmp.set(g.ox + (out[i * 4] + 0.5) * g.vs, g.oy + (out[i * 4 + 1] + 0.5) * g.vs, g.oz + (out[i * 4 + 2] + 0.5) * g.vs).applyMatrix4(mesh.matrixWorld);
      const back = (i / step) % 3 === 0 ? 1 : -1; const sp = 1.5 + ((i * 7) % 5) * 0.7;
      X.pool.spawn(tmp.x, tmp.y, tmp.z, -dir.x * sp * back + ((i * 13) % 7 - 3) * 0.35, 1.5 + ((i * 5) % 6) * 0.5, -dir.z * sp * back + ((i * 11) % 7 - 3) * 0.35, vs * (1 + (i % 3) * 0.5), out[i * 4 + 3], 2.2 + (i % 4) * 0.4, floor);
    }
    tmp.set(g.ox + (h.x + 0.5) * g.vs, g.oy + (h.y + 0.5) * g.vs, g.oz + (h.z + 0.5) * g.vs).applyMatrix4(mesh.matrixWorld);
    if (X.fx && X.fx.impact) X.fx.impact({ point: tmp.clone(), normal: [-dir.x, 0, -dir.z], dir, surface: 'flesh', color: out[3], power: k });
    if (X.audio && X.audio.impact) X.audio.impact({ surface: 'flesh', point: tmp, mag: Math.min(1, 0.3 + k * 2) });
    if (X.ui && X.ui.hit && !opt.net) X.ui.hit({ kill: !z.alive, head: part === 'head' });
    // the joint: with most of its voxels gone a limb lets go (humanoid bodies only; bosses keep theirs)
    const name = z.voxHum ? PARTS.find((q) => b[q] === mesh) : null;
    if (name && name !== 'torso' && g.joint0) { const left = jointCount(g) / Math.max(1, g.joint0); if (left < 0.3) dropPart(z, name, dir); }
  }
  function dropPart(z, name, dir) {
    const mesh = z.body[name]; if (!mesh.visible) return; stats.severed++;
    if (LIMB.has(name)) { if (!(G.coop && G.coop.guest) && z.alive && !z.T.boss) Z.sever(z, name, dir, {}); return; } // the game's own sever: gib, stump, crawl, co-op event
    crumble(z, mesh, dir, 0.5); mesh.visible = false;
  }
  // a piece falls apart into chunks of BxBxB voxels, each in the colour of its first surface voxel
  function crumble(z, mesh, dir, keep = 1, B0 = 0) {
    const g = gridOf(mesh); if (!g || !g.count) return 0; const B = B0 || (g.vs < 0.05 ? 4 : 2); let n = 0;
    const insts = mesh.isInstancedMesh ? mesh.count : 1; const floor = groundUnder(z);
    for (let q0 = 0; q0 < insts; q0++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(q0, Mi); Mi.premultiply(mesh.matrixWorld); } else Mi.copy(mesh.matrixWorld);
      Mi.decompose(tmp, Qd, Sc); const size = g.vs * B * Math.max(Sc.x, Sc.y, Sc.z) * 0.92;
      for (let j = 0; j < g.ny; j += B) for (let k = 0; k < g.nz; k += B) for (let i = 0; i < g.nx; i += B) {
        let c = 0; let solid = 0;
        for (let q = 0; q < B * B * B; q++) { const x = i + (q % B); const y = j + (((q / B) | 0) % B); const zz = k + ((q / (B * B)) | 0); if (x >= g.nx || y >= g.ny || zz >= g.nz) continue; const v = g.data[x + g.nx * (zz + g.nz * y)]; if (!v) continue; solid++; if (!(v & (1 << 26))) { if (!c || (c & (1 << 26))) c = v; } else if (!c) c = v; }
        if (solid < B * B * B * 0.3) continue;
        if (keep < 1 && (V.hash3(i, j, k, 5 + q0) & 255) / 255 > keep) continue;
        tmp.set(g.ox + (i + B / 2) * g.vs, g.oy + (j + B / 2) * g.vs, g.oz + (k + B / 2) * g.vs).applyMatrix4(Mi);
        const hh = V.hash3(i, j, k, 9 + q0); const a = (hh & 1023) / 1023 * 6.283; const sp = 0.4 + ((hh >> 10) & 255) / 255 * 1.6;
        X.pool.spawn(tmp.x, tmp.y, tmp.z, Math.cos(a) * sp + dir.x * 1.2, 0.6 + ((hh >> 18) & 255) / 255 * 2.2, Math.sin(a) * sp + dir.z * 1.2, size, c & 0xffffff, 3.2 + ((hh >> 4) & 15) * 0.14, floor);
        n++;
      }
    }
    return n;
  }
  // the whole body falls into chunks; big bodies (bosses) use bigger chunks so the pool is not flooded
  function collapse(z, dirIn) {
    const b = z.body; if (!b.root.visible) return; b.root.updateMatrixWorld(true); stats.collapsed++;
    const dir = dirIn ? D0.copy(dirIn).setY(0).multiplyScalar(0.6) : D0.set(Math.sin(b.root.rotation.y), 0, Math.cos(b.root.rotation.y)).multiplyScalar(-0.6);
    const list = pieces(z); let total = 0;
    for (const m of list) { const g = gridOf(m); if (g) total += g.count * (m.isInstancedMesh ? m.count : 1); }
    const busy = X.pool.count() > X.pool.cap * 0.7; const budget = (X.low ? 260 : 600) * (busy ? 0.5 : 1);
    const base = VS < 0.05 ? 4 : 2; let B = base; while (B < 12 && total / (B * B * B) > budget) B++;
    let n = 0; const dd = dir.clone();
    for (const m of list) n += crumble(z, m, dd, busy ? 0.5 : X.low && B === base ? 0.6 : 1, B);
    const at = new THREE.Vector3(z.pos.x, z.pos.y + 0.6 * z.T.scale, z.pos.z);
    G.fx.burst(at, X.low ? 8 : 16, [0x8a1410, 0x5a0a08, 0x9db08a], { speed: 2.5, size: 0.1, life: 0.7 });
    if (X.audio && X.audio.rubble) X.audio.rubble({ surface: 'flesh', point: at, n });
    b.root.visible = false; b.root.rotation.x = 0; z.dying = 0; b.barBg.visible = false;
    return n;
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
      if (z.alive && !z.voxLive) { z.voxLive = true; try { dress(z); } catch (e) { if (!stats.err) { stats.err = String(e && e.stack || e); console.error('[vox] zombie dress threw', e); } } }
      else if (!z.alive && z.voxLive) { z.voxLive = false; if (z.vox && z.body.root.visible && z.dying > 0) z.voxDie = 0.42; }
      if (!z.vox) continue;
      if (z.voxDie > 0) { z.voxDie -= dt; if (z.voxDie <= 0) collapse(z); }
      if (!z.body.root.visible) continue;
      if (z.voxMats) { const e = z.body.mats.skin.emissive; const base = e.getHex() === (z.T.glow || -1); for (const k in z.voxMats) { if (base) z.voxMats[k].emissive.setHex(0); else z.voxMats[k].emissive.copy(e); } } // the type's own glow is in its voxels; a flash or an elite glow lights the whole body
      // damage that did not come through a hit here (a guest's view of other players' shots, burn and poison ticks): wounds open as the health drops
      if (z.alive && z.hp < z.voxHp) { z.voxAcc += z.voxHp - z.hp; z.voxHp = z.hp; if (z.voxAcc > z.maxHp * (z.T.boss ? 0.03 : 0.12)) { const a = (V.hash3(z.hp | 0, stats.carves, 1, 1) & 1023) / 1023 * 6.283; hitCarve(z, z.voxAcc, ['body', 'body', 'leg', 'head'][stats.carves & 3], D0.set(Math.cos(a), 0, Math.sin(a)).clone(), { net: true }); z.voxAcc = 0; } }
      else if (z.hp > z.voxHp) z.voxHp = z.hp;
    }
  }
  return { update, stats, dress, hitCarve, collapse, pieces, VS, debug: () => ({ ...stats, vs: VS, cache: cache.size, meshCache: V.meshCacheSize() }) };
});
