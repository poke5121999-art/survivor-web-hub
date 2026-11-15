// Page-side half of tools/bake-bz.js. Evaluated inside the running Blockade Z page (voxel mode); defines window.BAKE.
// Everything here uses the game's own code (BZ.heroModel / BZ.animHero / G.zombies / boss kits) and only reads the result.
(() => {
  const G = window.__G; const TH = window.THREE;
  const EMIS = 1 << 25; const FPS = 15; const DT = 1 / 60;

  // ---------------------------------------------------------------- encoding helpers
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  // a weapon's grid went through Object3D.clone (JSON copy of userData): its typed array became {"0":..,"1":..}
  const gridData = (g) => { const n = g.nx * g.ny * g.nz; const d = g.data; if (d instanceof Uint32Array && d.length === n) return d; const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = d[i] | 0; return a; };
  const gridOf = (o) => o.userData.voxOwn || (o.userData.voxS && o.userData.voxS.grid) || o.userData.voxGrid || null;
  const shown = (o, root) => { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; };

  function encodeGrid(g) {
    const data = gridData(g); const n = data.length; const map = new Map(); const pal = [0]; const idx = new Uint16Array(n); let count = 0;
    const lo = [1e9, 1e9, 1e9]; const hi = [-1, -1, -1]; const nxz = g.nx * g.nz;
    for (let i = 0; i < n; i++) {
      const v = data[i]; if (!v) continue; count++;
      const x = i % g.nx; const y = (i / nxz) | 0; const z = ((i / g.nx) | 0) % g.nz; if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
      const k = (v & 0xffffff) | (v & EMIS); let id = map.get(k);
      if (id === undefined) { id = pal.length; if (id > 65535) throw new Error('palette overflow'); map.set(k, id); pal.push(k); }
      idx[i] = id;
    }
    const out = []; let i = 0;
    while (i < n) { const v = idx[i]; let j = i + 1; while (j < n && idx[j] === v && j - i < 65535) j++; out.push(j - i, v); i = j; }
    const u16 = new Uint16Array(out); // little-endian on x86 / arm
    return { pal, rle: b64(new Uint8Array(u16.buffer)), count, lo, hi };
  }

  // ---------------------------------------------------------------- surface voxelizer for meshes the game does not voxelize (hands...)
  const S2L = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L2S = (v) => { v = v < 0 ? 0 : v > 1 ? 1 : v; return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };
  const texAvg = (map) => {
    try { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d'); x.drawImage(map.image, 0, 0, 4, 4); const d = x.getImageData(0, 0, 4, 4).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; r += S2L(d[i]); g += S2L(d[i + 1]); b += S2L(d[i + 2]); n++; } n = n || 1; return [r / n, g / n, b / n]; } catch (e) { return [1, 1, 1]; }
  };
  function surfaceVoxelize(mesh, vs) {
    const geo = mesh.geometry; const pos = geo.attributes.position; if (!pos) return null; const ix = geo.index; const cnt = ix ? ix.count : pos.count; if (cnt < 3) return null;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material; const col = geo.attributes.color; const useVc = !!(col && mat && mat.vertexColors);
    const mc = mat && mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [1, 1, 1]; const ta = mat && mat.map ? texAvg(mat.map) : [1, 1, 1];
    const mn = [1e9, 1e9, 1e9]; const mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < pos.count; i++) for (let k = 0; k < 3; k++) { const v = pos.getComponent(i, k); if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const o = mn.map((v) => Math.floor(v / vs - 0.01)); const d = [0, 1, 2].map((k) => Math.max(1, Math.ceil(mx[k] / vs + 0.01) - o[k]));
    if (d[0] * d[1] * d[2] > 4e6) return null;
    const data = new Uint32Array(d[0] * d[1] * d[2]); const idx = (t) => (ix ? ix.getX(t) : t);
    const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; const C = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
    for (let t = 0; t + 2 < cnt; t += 3) {
      for (let q = 0; q < 3; q++) { const vi = idx(t + q); P[q] = [pos.getX(vi), pos.getY(vi), pos.getZ(vi)]; C[q] = useVc ? [col.getX(vi), col.getY(vi), col.getZ(vi)] : [1, 1, 1]; }
      let me = 0; for (let a = 0; a < 3; a++) { const b = (a + 1) % 3; me = Math.max(me, Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1], P[a][2] - P[b][2])); }
      const n = Math.max(1, Math.ceil(me / (vs * 0.4)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n; const v = j / n; const w = 1 - u - v; const p = [0, 1, 2].map((k) => P[0][k] * w + P[1][k] * u + P[2][k] * v);
        const cx = Math.floor(p[0] / vs) - o[0]; const cy = Math.floor(p[1] / vs) - o[1]; const cz = Math.floor(p[2] / vs) - o[2];
        if (cx < 0 || cy < 0 || cz < 0 || cx >= d[0] || cy >= d[1] || cz >= d[2]) continue;
        const rgb = [0, 1, 2].map((k) => (C[0][k] * w + C[1][k] * u + C[2][k] * v) * mc[k] * ta[k]);
        data[cx + d[0] * (cz + d[2] * cy)] = (L2S(rgb[0]) << 16) | (L2S(rgb[1]) << 8) | L2S(rgb[2]) | (1 << 24);
      }
    }
    const g = { nx: d[0], ny: d[1], nz: d[2], vs, ox: o[0] * vs, oy: o[1] * vs, oz: o[2] * vs, data, count: 0 };
    for (let i = 0; i < data.length; i++) if (data[i]) g.count++;
    return g;
  }
  const meshKind = (m) => { const mt = Array.isArray(m.material) ? m.material[0] : m.material; const g = m.geometry; return (m.isSprite ? 'sprite' : m.isLine ? 'line' : m.isPoints ? 'points' : g ? g.type : '?') + (mt ? (mt.blending === TH.AdditiveBlending ? '+additive' : '') + (mt.transparent ? '+transparent' : '') : ''); };
  const fallbackOk = (m) => {
    if (!m.isMesh || m.isInstancedMesh || !m.geometry || !m.geometry.attributes || !m.geometry.attributes.position) return false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) if (!mt || mt.blending === TH.AdditiveBlending || (mt.transparent && !(mt.alphaTest > 0)) || mt.wireframe) return false;
    return true;
  };

  // ---------------------------------------------------------------- node tree + parts
  function collect(root, vsOf) {
    const nodes = []; const parent = []; const idx = new Map(); const parts = []; const skipped = [];
    const add = (obj) => { if (idx.has(obj)) return idx.get(obj); const pi = obj === root ? -1 : add(obj.parent); const i = nodes.length; nodes.push(obj); parent.push(pi); idx.set(obj, i); return i; };
    add(root); const metas = []; const proxies = [];
    root.traverse((o) => {
      if (o === root || !(o.isMesh || o.isSprite || o.isLine || o.isPoints)) return; if (!shown(o, root)) return;
      const g = o.isMesh ? gridOf(o) : null;
      if (g && g.nx && o.isInstancedMesh) {
        // each instance becomes its own node (child of the instanced mesh's node) carrying that instance's matrix
        add(o); const base = idx.get(o);
        for (let i = 0; i < o.count; i++) { const pr = new TH.Object3D(); pr.name = (o.name || 'inst') + '#' + i; o.add(pr); proxies.push({ proxy: pr, mesh: o, i }); const ni = nodes.length; nodes.push(pr); parent.push(base); idx.set(pr, ni); metas.push({ mesh: pr, grid: g, fb: false, node: ni, inst: true }); }
        return;
      }
      if (g && g.nx) { metas.push({ mesh: o, grid: g, fb: false }); return; }
      if (fallbackOk(o)) { const gg = surfaceVoxelize(o, vsOf(o)); if (gg && gg.count) { metas.push({ mesh: o, grid: gg, fb: true }); return; } }
      skipped.push((o.name || '?') + ':' + meshKind(o) + (o.isInstancedMesh ? ':instanced' + o.count : ''));
    });
    for (const m of metas) { if (!m.inst) m.node = add(m.mesh); parts.push(m); }
    return { nodes, parent, parts, skipped, proxies };
  }

  // ---------------------------------------------------------------- pose recording
  const _M = new TH.Matrix4();
  function Rec(nodes, fix, proxies) { this.nodes = nodes; this.fix = fix; this.f = []; this.proxies = proxies || []; }
  Rec.prototype.sample = function () {
    for (const q of this.proxies) { q.mesh.getMatrixAt(q.i, _M); _M.decompose(q.proxy.position, q.proxy.quaternion, q.proxy.scale); }
    const N = this.nodes.length; const a = new Float32Array(N * 10); const prev = this.f.length ? this.f[this.f.length - 1] : null;
    for (let i = 0; i < N; i++) {
      const o = this.nodes[i]; const b = i * 10; a[b] = o.position.x; a[b + 1] = o.position.y; a[b + 2] = o.position.z;
      a[b + 3] = o.quaternion.x; a[b + 4] = o.quaternion.y; a[b + 5] = o.quaternion.z; a[b + 6] = o.quaternion.w; a[b + 7] = o.scale.x; a[b + 8] = o.scale.y; a[b + 9] = o.scale.z;
    }
    if (this.fix) this.fix(a);
    if (prev) for (let i = 0; i < N; i++) { const b = i * 10; if (a[b + 3] * prev[b + 3] + a[b + 4] * prev[b + 4] + a[b + 5] * prev[b + 5] + a[b + 6] * prev[b + 6] < 0) for (let k = 3; k < 7; k++) a[b + k] = -a[b + k]; }
    this.f.push(a);
  };
  const _qa = new TH.Quaternion(); const _qb = new TH.Quaternion();
  function blend(A, B, t, N) {
    const o = new Float32Array(N * 10);
    for (let i = 0; i < N; i++) {
      const b = i * 10; for (const k of [0, 1, 2, 7, 8, 9]) o[b + k] = A[b + k] + (B[b + k] - A[b + k]) * t;
      _qa.set(A[b + 3], A[b + 4], A[b + 5], A[b + 6]); _qb.set(B[b + 3], B[b + 4], B[b + 5], B[b + 6]); if (_qa.dot(_qb) < 0) { _qb.x = -_qb.x; _qb.y = -_qb.y; _qb.z = -_qb.z; _qb.w = -_qb.w; } _qa.slerp(_qb, t);
      o[b + 3] = _qa.x; o[b + 4] = _qa.y; o[b + 5] = _qa.z; o[b + 6] = _qa.w;
    }
    return o;
  }
  const at = (dense, f, N) => { const i0 = Math.max(0, Math.min(dense.length - 1, Math.floor(f))); const i1 = Math.min(dense.length - 1, i0 + 1); return blend(dense[i0], dense[i1], Math.max(0, Math.min(1, f - i0)), N); };
  const dist2 = (A, B, N) => { let s = 0; for (let i = 0; i < N; i++) { const b = i * 10; for (let k = 0; k < 7; k++) { const d = A[b + k] - B[b + k]; s += d * d; } } return s; };
  function findPeriod(dense, N, lo, hi) {
    const maxLag = Math.min(Math.round(hi * 60), Math.floor(dense.length * 0.6)); const minLag = Math.max(8, Math.round(lo * 60)); const win = dense.length - maxLag;
    if (win < 20 || maxLag <= minLag) return { lag: Math.max(8, maxLag), err: -1, base: -1 };
    const errs = []; let best = 1e30; let base = 0;
    for (let lag = minLag; lag <= maxLag; lag++) { let e = 0; for (let f = 0; f < win; f += 2) e += dist2(dense[f], dense[f + lag], N); e /= Math.ceil(win / 2); errs[lag] = e; if (e < best) best = e; }
    for (let f = 0; f < win; f += 4) base += dist2(dense[f], dense[0], N); base /= Math.ceil(win / 4);
    let pick = minLag; for (let lag = minLag; lag <= maxLag; lag++) if (errs[lag] <= best * 1.25 + 1e-9 && (lag === minLag || errs[lag] <= errs[lag - 1]) && (lag === maxLag || errs[lag] <= errs[lag + 1])) { pick = lag; break; }
    return { lag: pick, err: errs[pick], base };
  }
  // dense (60 Hz) -> 15 fps. mode 'loop': one period (searched in lo..hi seconds, or o.period fixed; o.xfade seconds of closing crossfade);
  // mode 'fixed': the first o.dur seconds, played once.
  function clip(dense, restF, N, o) {
    const frames = []; let loop = false; let info = {};
    if (o.mode === 'loop') {
      const P = o.period ? { lag: Math.round(o.period * 60), err: -1, base: -1 } : findPeriod(dense, N, o.lo, o.hi);
      const n = Math.max(2, Math.round(P.lag / 60 * FPS)); const stepF = P.lag / n; const K = o.xfade ? Math.round(o.xfade * FPS) : 0; const raw = [];
      for (let i = 0; i < n + K; i++) raw.push(at(dense, i * stepF, N));
      for (let i = 0; i < n; i++) frames.push(i < K ? blend(raw[i + n], raw[i], i / K, N) : raw[i]);
      loop = true; info = { period: +(P.lag / 60).toFixed(3), err: +P.err.toExponential(2), spread: +P.base.toExponential(2) };
    } else { const n = Math.max(2, Math.round(o.dur * FPS) + 1); for (let i = 0; i < n; i++) frames.push(at(dense, i * 60 / FPS, N)); }
    const mv = []; const E = 2.5e-4;
    for (let i = 0; i < N; i++) { const b = i * 10; let m = false; for (const F of frames) { for (let k = 0; k < 10; k++) if (Math.abs(F[b + k] - restF[b + k]) > E) { m = true; break; } if (m) break; } if (m) mv.push(i); }
    const q = new Int16Array(frames.length * mv.length * 10); let clamped = 0; const qz = (v, sc) => { let r = Math.round(v * sc); if (r > 32767) { r = 32767; clamped++; } else if (r < -32768) { r = -32768; clamped++; } return r; };
    let w = 0; for (const F of frames) for (const i of mv) { const b = i * 10; for (let k = 0; k < 3; k++) q[w++] = qz(F[b + k], 2000); for (let k = 3; k < 7; k++) q[w++] = qz(F[b + k], 32767); for (let k = 7; k < 10; k++) q[w++] = qz(F[b + k], 1000); }
    return { fps: FPS, frames: frames.length, loop, nodes: mv, data: b64(new Uint8Array(q.buffer)), _info: { ...info, clamped, moving: mv.length } };
  }
  // a clip with no moving node says nothing: dropped (idle is kept even when static)
  function clipsOut(raw, keep) { const clips = {}; const info = {}; const dropped = []; for (const k in raw) { const c = raw[k]; if (!c) continue; if (!c._info.moving && k !== keep) { dropped.push(k + ': no node moves'); continue; } info[k] = c._info; clips[k] = { fps: c.fps, frames: c.frames, loop: c.loop, nodes: c.nodes, data: c.data }; } return { clips, info, dropped }; }

  // ---------------------------------------------------------------- assemble one character
  function assemble(id, name, group, root, col, rest, clips, extra) {
    // apply the rest pose to the live nodes (also for the height)
    col.nodes.forEach((o, i) => { const b = i * 10; o.position.set(rest[b], rest[b + 1], rest[b + 2]); o.quaternion.set(rest[b + 3], rest[b + 4], rest[b + 5], rest[b + 6]); o.scale.set(rest[b + 7], rest[b + 8], rest[b + 9]); });
    const nodes = col.nodes.map((o, i) => { const b = i * 10; return { name: (o.name || '') + '', parent: col.parent[i], p: [rest[b], rest[b + 1], rest[b + 2]].map((v) => +v.toFixed(5)), q: [rest[b + 3], rest[b + 4], rest[b + 5], rest[b + 6]].map((v) => +v.toFixed(6)), s: [rest[b + 7], rest[b + 8], rest[b + 9]].map((v) => +v.toFixed(5)) }; });
    let vox = 0; const tight = new Map(); const parts = col.parts.map((pt) => { const g = pt.grid; const e = encodeGrid(g); vox += e.count; tight.set(pt, e); return { node: pt.node, vs: +g.vs.toPrecision(7), ox: +g.ox.toFixed(6), oy: +g.oy.toFixed(6), oz: +g.oz.toFixed(6), nx: g.nx, ny: g.ny, nz: g.nz, m: null, pal: e.pal, rle: e.rle, ...(pt.fb ? { surface: true } : {}) }; });
    const prevParent = root.parent; let tmpParent = null; if (!prevParent) { tmpParent = new TH.Group(); tmpParent.add(root); }
    root.updateMatrixWorld(true); const bb = new TH.Box3(); const tmp = new TH.Box3();
    for (const pt of col.parts) { const g = pt.grid; const e = tight.get(pt); if (!e.count) continue; tmp.set(new TH.Vector3(g.ox + e.lo[0] * g.vs, g.oy + e.lo[1] * g.vs, g.oz + e.lo[2] * g.vs), new TH.Vector3(g.ox + (e.hi[0] + 1) * g.vs, g.oy + (e.hi[1] + 1) * g.vs, g.oz + (e.hi[2] + 1) * g.vs)).applyMatrix4(pt.mesh.matrixWorld); bb.union(tmp); }
    if (tmpParent) tmpParent.remove(root);
    const wp = new TH.Vector3(); root.parent && root.getWorldPosition(wp);
    return { id, name, group, height: +(bb.max.y - bb.min.y).toFixed(3), vox, weapon: extra.weapon || null, nodes, parts, clips, _skipped: col.skipped, _info: extra.info || {}, _clipInfo: extra.clipInfo, _bbox: [bb.min.toArray().map((v) => +v.toFixed(2)), bb.max.toArray().map((v) => +v.toFixed(2))] };
  }

  // ================================================================ HEROES
  const SIG = { thep: 'longsword', yta: 'dualpistol', mua: 'minigun', bong: 'shuriken', phao: 'bazooka', bang: 'spear', sam: 'javelin', doc: 'glaive', hoa: 'fists', gio: 'katana', ky: 'shotgun', soi: 'claws', nhen: 'webbow' };
  function hero(id) {
    const h = BZ.HEROES.find((q) => q.id === id); const wid = SIG[id] || 'rifle'; const W = BZ.WEAPONS[wid] || {}; const hold = BZ.holdOf(W);
    const m = BZ.heroModel(id); G.scene.add(m.root); m.root.position.set(0, 0, 0); const eq = BZ.equipWeapon(m, wid); Object.assign(m, { tip: eq.tip, tipL: eq.tipL, gun: eq.gun, shield: eq.shield });
    const swingDur = W.throwT || W.swing || 0.5; const isSwing = !!(W.melee || W.thrown); const st = { trav: 0 };
    const mk = () => ({ speed: 0, mode: hold, pitch: 0, draw: 1, vy: 0, wall: 0, air: 0, sprint: false, back: false, pat: (W.combo && W.combo[0]) || 'r2l', kick: 0, kickL: 0, swing: -1, reload: 0, cast: 0, hurt: 0, hurtDir: 0 });
    let s = mk(); let kick = BZ.spring(180, 14); let kickL = BZ.spring(180, 14);
    const step = () => { m.root.position.set(0, 0, st.trav); m.root.rotation.set(0, 0, 0); s.kick = kick.step(DT); s.kickL = kickL.step(DT); BZ.animHero(m, s, DT); BZ.heroGun(m, s, m.gun); st.trav += s.speed * DT; };
    for (let i = 0; i < 120; i++) step();
    // hands / fingers are not voxel in the game: surface-voxelized at the idle pose (1/64 m)
    const col = collect(m.root, (o) => (o.name === 'hand' ? 1 / 64 : 1 / 32)); const N = col.nodes.length; const fix = (a) => { a[2] -= st.trav; };
    const clipsRaw = {};
    const record = (warm, frames, setup, per) => {
      s = mk(); kick = BZ.spring(180, 14); kickL = BZ.spring(180, 14); st.trav = 0; setup && setup(); for (let i = 0; i < warm; i++) step();
      const rec = new Rec(col.nodes, fix, col.proxies); for (let i = 0; i < frames; i++) { per && per(i); step(); rec.sample(); } return rec;
    };
    const rIdle = record(120, 252); const rest = rIdle.f[0]; clipsRaw.idle = clip(rIdle.f, rest, N, { mode: 'loop', period: 3.0, xfade: 0.4 });
    clipsRaw.walk = clip(record(90, 240, () => { s.speed = 2.6; }).f, rest, N, { mode: 'loop', lo: 0.5, hi: 2.0, xfade: 0.2 });
    clipsRaw.run = clip(record(90, 240, () => { s.speed = 5.8; s.sprint = true; }).f, rest, N, { mode: 'loop', lo: 0.3, hi: 1.6, xfade: 0.2 });
    clipsRaw.attack = clip(record(120, 108, null, (i) => {
      const t = i * DT; if (isSwing) { const t0 = 0.2; s.swing = t >= t0 && t < t0 + swingDur ? (t - t0) / swingDur : -1; }
      else for (const ts of [0.2, 0.5, 0.8]) if (i === Math.round(ts * 60)) (W.dual && ts === 0.5 ? kickL : kick).v += 9;
    }).f, rest, N, { mode: 'fixed', dur: 1.7 });
    clipsRaw.hit = clip(record(120, 66, null, (i) => { if (i === 6) { s.hurt = 1; s.hurtDir = 0; } }).f, rest, N, { mode: 'fixed', dur: 1.0 });
    {
      s = mk(); st.trav = 0; for (let i = 0; i < 120; i++) step();
      const rec = new Rec(col.nodes, fix, col.proxies); for (let i = 0; i < 150; i++) { const t = i * DT; m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0); s.dead = t; s.speed = 0; s.swing = -1; s.kick = 0; BZ.animHero(m, s, DT); BZ.heroGun(m, s, m.gun); BZ.heroFall(m, t, 1); rec.sample(); }
      clipsRaw.death = clip(rec.f, rest, N, { mode: 'fixed', dur: 2.4 });
    }
    const co = clipsOut(clipsRaw, 'idle');
    const out = assemble(id, h.name, 'heroes', m.root, col, rest, co.clips, { weapon: wid, clipInfo: co.info, info: { dropped: co.dropped } });
    G.scene.remove(m.root); return out;
  }

  // ================================================================ ZOMBIES, MONSTERS, BOSSES
  const VN = { walker: 'Xác sống', runner: 'Xác chạy', flyer: 'Xác bay', brute: 'Xác to' };
  const BOSSES = new Set(['giant', 'thrower', 'phantom', 'queen', 'brood']);
  const ATTACK_MOVE = { dragon: 'tailspin', pharaoh: 'curse', vampire: 'blooddash', alien: 'plasma', ufo: 'salvo', guardian: 'slam' };
  let stagedZ = false;
  function stageZ() {
    if (stagedZ) return; stagedZ = true; const P = G.player;
    G.god = true; G.tps.on = false; G.state = 'paused'; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
    const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
    const W = G.world; W.flowDir = () => false; W.lineOfSight = () => true; W.updateFlow = () => {};
    W.moveBox = (pos, vel, dt, r, hh, out) => { pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt; out.ground = false; out.hitX = out.hitZ = false; if (pos.y <= 0) { pos.y = 0; vel.y = 0; out.ground = true; } return out; };
    G.fx.floorY = () => 0;
    window.__tick = (n) => { G.state = 'playing'; for (let i = 0; i < n; i++) { P.hp = P.maxHp; P.alive = true; P.vel.set(0, 0, 0); __sim(DT * 0.99); } G.state = 'paused'; };
  }
  function zombie(t) {
    stageZ(); const P = G.player; const T = BZ.ZOMBIES[t]; const isKit = !!BZ.BOSS_KITS[t]; const grp = (isKit || BOSSES.has(t)) ? 'bosses' : 'zombies'; const name = T.name || VN[t] || t;
    const calm = (z) => { z.speed = 0.0001; z.attackT = 99; z.cd = z.cd2 = z.hatch = 99; if (z.bs) { z.bs.queue = []; z.bs.cur = null; z.bs.rest = 99; } };
    let R = null;
    const spawnAt = (x, zz) => {
      G.zombies.clear(); if (G.vox && G.vox.pool) G.vox.pool.reset(); const q = G.zombies.spawn(t, 1, { x: 0, z: 0, dir: [0, 1], name: 'b' });
      q.pos.set(x, T.fly ? q.pos.y : 0, zz); q.yaw = 0; q.vel.set(0, 0, 0); q.hp = q.maxHp = 1e7; q.voiceT = 1e9; q.stuck = 0; q.stillT = 0; q.body.root.position.copy(q.pos); q.body.root.rotation.set(0, 0, 0); window.__z = q;
      P.pos.set(0, 0, 400); __tick(2); q.attackT = 99; q.cd = q.cd2 = q.hatch = 99; if (q.bs) { q.bs.queue = []; q.bs.cur = null; q.bs.rest = 99; }
      if (R && q.body.root !== R) throw new Error('pooled zombie body changed between spawns');
      return q;
    };
    let z = spawnAt(0, -30); calm(z); __tick(40);
    const info = { rig: !!T.rig, kit: isKit, flies: !!T.fly };
    R = z.body.root;
    const col = collect(R, (o) => { let s = 1; for (let p = o; p && p !== R; p = p.parent) { const k = Math.max(Math.abs(p.scale.x), Math.abs(p.scale.y), Math.abs(p.scale.z)); if (k > 1e-3) s *= k; } return (1 / 32) / Math.min(4, Math.max(0.25, Math.round(s * 8) / 8)); });
    const yawQ = new TH.Quaternion(); const rq = new TH.Quaternion(); const UP = new TH.Vector3(0, 1, 0);
    // the body root relative to the zombie's own frame: x/z as an offset from z.pos turned back by the yaw, y as is, rotation without the yaw
    const fix = (a) => {
      const dx = a[0] - z.pos.x; const dz = a[2] - z.pos.z; const c = Math.cos(-z.yaw); const s = Math.sin(-z.yaw); a[0] = dx * c + dz * s; a[2] = -dx * s + dz * c;
      yawQ.setFromAxisAngle(UP, -z.yaw); rq.set(a[3], a[4], a[5], a[6]); rq.premultiply(yawQ); a[3] = rq.x; a[4] = rq.y; a[5] = rq.z; a[6] = rq.w;
    };
    const N = col.nodes.length; const clipsRaw = {}; const noted = [];
    const record = (frames, per) => { const rec = new Rec(col.nodes, fix, col.proxies); for (let i = 0; i < frames; i++) { per && per(i); __tick(1); rec.sample(); } return rec; };
    const far = (zz) => { P.pos.set(0, 0, zz); };
    // idle
    const rIdle = record(240); const rest = rIdle.f[0]; clipsRaw.idle = clip(rIdle.f, rest, N, { mode: 'loop', lo: 2.0, hi: 3.0, xfade: 0.4 });
    // walk: a player far down +z, the zombie chases; root travel is dropped by recording relative to z.pos
    if (T.speed > 0.5) {
      z = spawnAt(0, -80); far(1000); __tick(60);
      clipsRaw.walk = clip(record(240).f, rest, N, { mode: 'loop', lo: 0.35, hi: 2.4, xfade: 0.2 });
    }
    // attack
    z = spawnAt(0, -20); const reach = 1.25 * T.scale;
    if (isKit) {
      const kit = BZ.BOSS_KITS[t]; const mv = ATTACK_MOVE[t] || Object.keys(kit.moves)[0]; const M = kit.moves[mv]; const B = G.zombies.kinds.bosses(); const S = z.bs;
      far(400); calm(z); __tick(30); P.pos.set(z.pos.x + 9, 0, z.pos.z + 9);
      const dur = Math.min(2.6, (M.dur || 1.5) + 0.4); let started = false; const rec = new Rec(col.nodes, fix, col.proxies);
      for (let i = 0; i < Math.round(dur * 60); i++) { if (!started) { started = true; S.cur = mv; S.t = 0; S.data = {}; S.dur = M.dur || 1.5; if (M.start) M.start(z, S, P, B.ctx); } __tick(1); S.rest = 99; rec.sample(); }
      clipsRaw.attack = clip(rec.f, rest, N, { mode: 'fixed', dur }); info.attackMove = mv;
    } else if (!T.fly) {
      z.speed = T.speed; z.attackT = 0; const dur = Math.max(1.6, Math.min(2.6, (T.rate || 1.2) + 0.6)); far(z.pos.z + reach * 0.55); __tick(5);
      clipsRaw.attack = clip(record(Math.round(dur * 60), () => { P.pos.set(z.pos.x, 0, z.pos.z + reach * 0.55); }).f, rest, N, { mode: 'fixed', dur });
    } else {
      z.attackT = 0; far(z.pos.z + 9); __tick(10);
      clipsRaw.attack = clip(record(150, () => { P.pos.set(z.pos.x, 0, z.pos.z + 3); }).f, rest, N, { mode: 'fixed', dur: 2.4 });
    }
    // hit: the spring impulses the game's own damage code applies (no carve, no limb loss, no knock-down)
    z = spawnAt(0, -20); calm(z); far(200); __tick(40);
    if (z.fp) { const rec = new Rec(col.nodes, fix, col.proxies); for (let i = 0; i < 75; i++) { if (i === 6) { z.fp.v -= 30; z.fr.v += 12; z.hs.v -= 40; } __tick(1); rec.sample(); } clipsRaw.hit = clip(rec.f, rest, N, { mode: 'fixed', dur: 1.2 }); }
    else noted.push('hit: no flinch springs on this kind (z.fp missing)');
    // death: the game's own kill; the voxel collapse into debris is switched off so the fall stays visible
    z = spawnAt(0, -20); calm(z); far(200); __tick(40);
    {
      const rec = new Rec(col.nodes, fix, col.proxies); z.hp = 1; G.zombies.kill(z, 'body', new TH.Vector3(0, 0, 1), { gore: null, net: true }); z.vox = false;
      for (let i = 0; i < 150; i++) { z.vox = false; __tick(1); rec.sample(); }
      clipsRaw.death = clip(rec.f, rest, N, { mode: 'fixed', dur: 2.4 }); info.deathBodyVisible = z.body.root.visible;
    }
    const co = clipsOut(clipsRaw, 'idle');
    const out = assemble(t, name, grp, R, col, rest, co.clips, { clipInfo: co.info, info: { ...info, notes: noted, dropped: co.dropped } });
    G.zombies.clear(); return out;
  }

  window.BAKE = { hero, zombie };
  return 'ok';
})();
