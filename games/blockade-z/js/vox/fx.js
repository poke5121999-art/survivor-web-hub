// Blockade Z voxel prototype: hit, blast and collapse effects (?vox=1). Blocky on purpose: cubes, hard-edged square puffs, stretched cube sparks.
//
// Numbers (counts, speeds, lifetimes, sizes, colours by surface, shake and recoil) are taken from Saltline by Felix Rieseberg
// (claude.ai artifact BGY1SztrAYcJQHSsnHHGmp), as analysed in the fps-high-quality skill, line ranges of game.pretty.js:
//   impact table per surface 40842-40908 (metal 18 sparks 6-24 m/s spread .55 + 2-3 long embers + 2 flashes; concrete 8 dust + 2 fat
//   puffs + 4 chips + 4 grit + 30% 3 sparks; wood tan dust + 7 splinters; glass 12 shards + 4 chips; enemy 13 sparks; far impacts
//   >55 m halve, line 3025), muzzle flash 40930-40959 (3 flame lobes .75V/.5V, spike .9V, 3 sparks 8-22 m/s, small smoke, light .05 s),
//   tracer 40909-40929 (segment clamp(speed*.022, 2, 7) m at speed 260, thin core + 6x halo), explosion 40960-41100
//   (core flashes 1.5P and 2.6P, 13+5P fire lobes life .55-1.05 drag 4 buoyant -2.6, 11+5P smoke, min(90,34P) sparks 6-26 m/s drag 1.4,
//   10P embers, ground ring .6P -> 9P in .32 s, 12+3P dust ring 5-10 m/s, scorch 2.3P, 13+6P chunks .04-.13 m at 4-13 m/s),
//   camera shake 45170-45174 and recoil 45035-45050 (shot trauma .12, damage .22 + dmg/70, rotation noise from two sines).
// The generated port (scripts/port-sl-fx.js -> js/sl/fx-sl.js, 1790 lines) targets three r170, a sky.js contract, HDR shader
// flipbooks (colours up to x40) and a PointLight pool, so it was not shipped; the numbers above are re-implemented natively here
// on three r160 with Lambert / Basic pixel materials.
(() => {
  const BZ = (window.BZ = window.BZ || {});
  if (!BZ.vox || !BZ.vox.register) return;
  const THREE = window.THREE;

  const NOOP = () => {};
  const noopApi = () => ({ impact: NOOP, blast: NOOP, collapse: NOOP, debrisLand: NOOP, shake: NOOP, update: NOOP, hold: false, noop: true });

  const SURF = {
    stone: { c: 0x9a968e, dust: 0x9a968e }, plaster: { c: 0xd6ccb8, dust: 0xd8cfbc }, wood: { c: 0x9a7448, dust: 0xa88458 },
    metal: { c: 0x7a7e84, dust: 0x80848a }, glass: { c: 0xcfe8f0, dust: 0xdcecf2 }, flesh: { c: 0x8a1010, dust: 0x8a1210 }, dirt: { c: 0x6a7a4a, dust: 0x6a7a4a },
  };
  const TAG2SURF = { stone: 'stone', metal: 'metal', wood: 'wood', glass: 'glass', grass: 'dirt', leaves: 'dirt', dirt: 'dirt' };

  BZ.vox.register('fx', (G) => {
    if (!BZ.vox.want('fx')) return noopApi();
    const scene = G.scene;
    const rnd = Math.random;
    const rr = (a, b) => a + (b - a) * rnd();
    const FIELDS = 23; // px py pz vx vy vz age life s0 s1 len r g b a grav drag bnc shr qx qy qz qw mode
    const Zax = new THREE.Vector3(0, 0, 1); const Yax = new THREE.Vector3(0, 1, 0);
    const tc = new THREE.Color(); const tp = new THREE.Vector3(); const ts = new THREE.Vector3(); const tq = new THREE.Quaternion(); const tm = new THREE.Matrix4(); const td = new THREE.Vector3();

    // per-instance alpha for the dust and decal pools (transparent squares fade instead of shrinking)
    function withAlpha(mat) {
      mat.onBeforeCompile = (s) => {
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA;\nvarying float vAA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAA = aA;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAA;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAA;');
      };
      return mat;
    }

    // a ring-buffer-free instanced particle pool with swap-removal; mode 0 = axis-aligned cube (stored yaw), 1 = stretched along velocity, 2 = fixed orientation
    function mkPool(geo, mat, N, o = {}) {
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      mesh.frustumCulled = false; mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.renderOrder = o.order || 0;
      mesh.setColorAt(0, tc.set(0xffffff)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      let aA = null;
      if (o.alpha) { aA = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); aA.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aA', aA); }
      scene.add(mesh);
      const D = new Float32Array(N * FIELDS); let n = 0;
      const P = {
        mesh, get n() { return n; },
        add(p) {
          if (n >= N) return;
          const i = n++ * FIELDS;
          D[i] = p.x; D[i + 1] = p.y; D[i + 2] = p.z; D[i + 3] = p.vx || 0; D[i + 4] = p.vy || 0; D[i + 5] = p.vz || 0; D[i + 6] = 0; D[i + 7] = p.life || 1;
          D[i + 8] = p.s0 || 0.1; D[i + 9] = p.s1 ?? p.s0 ?? 0.1; D[i + 10] = p.len || 1;
          if (p.rgb) { D[i + 11] = p.rgb[0]; D[i + 12] = p.rgb[1]; D[i + 13] = p.rgb[2]; } else { tc.setHex(p.c ?? 0xffffff); D[i + 11] = tc.r; D[i + 12] = tc.g; D[i + 13] = tc.b; }
          D[i + 14] = p.a ?? 1; D[i + 15] = p.g || 0; D[i + 16] = p.drag || 0; D[i + 17] = p.bnc || 0; D[i + 18] = p.shr || 0;
          if (p.q) { D[i + 19] = p.q.x; D[i + 20] = p.q.y; D[i + 21] = p.q.z; D[i + 22] = p.q.w; } else if (o.yaw !== false) { const h = rnd() * 6.283 * 0.5; D[i + 19] = 0; D[i + 20] = Math.sin(h); D[i + 21] = 0; D[i + 22] = Math.cos(h); } else { D[i + 19] = 0; D[i + 20] = 0; D[i + 21] = 0; D[i + 22] = 1; }
        },
        update(dt) {
          for (let k = 0; k < n; k++) {
            const i = k * FIELDS;
            const age = (D[i + 6] += dt); const life = D[i + 7];
            if (age >= life) { // swap-remove
              n--; if (k < n) { const j = n * FIELDS; for (let f = 0; f < FIELDS; f++) D[i + f] = D[j + f]; } k--; continue;
            }
            const kk = age / life;
            const drag = D[i + 16];
            if (drag) { const e = Math.exp(-drag * dt); D[i + 3] *= e; D[i + 4] *= e; D[i + 5] *= e; }
            D[i + 4] -= D[i + 15] * dt;
            D[i] += D[i + 3] * dt; D[i + 1] += D[i + 4] * dt; D[i + 2] += D[i + 5] * dt;
            if (D[i + 17] && D[i + 1] < 0.03 && D[i + 4] < 0) { D[i + 1] = 0.03; D[i + 4] *= -0.38; D[i + 3] *= 0.6; D[i + 5] *= 0.6; if (Math.abs(D[i + 4]) < 0.8) { D[i + 4] = 0; D[i + 3] *= 0.5; D[i + 5] *= 0.5; } }
            const ease = 1 - (1 - kk) * (1 - kk);
            let sz = D[i + 8] + (D[i + 9] - D[i + 8]) * ease;
            const shr = D[i + 18]; if (shr > 0) sz *= Math.min(1, (1 - kk) / shr);
            const fade = D[i + 14] * (1 - kk * kk);
            tp.set(D[i], D[i + 1], D[i + 2]);
            const mode = o.mode || 0;
            if (mode === 1) {
              td.set(D[i + 3], D[i + 4], D[i + 5]); const sp = td.length();
              if (sp > 0.01) tq.setFromUnitVectors(Zax, td.multiplyScalar(1 / sp)); else tq.identity();
              ts.set(sz, sz, D[i + 10]);
            } else { tq.set(D[i + 19], D[i + 20], D[i + 21], D[i + 22]); ts.set(sz, sz, o.flat ? 1 : sz); }
            tm.compose(tp, tq, ts); mesh.setMatrixAt(k, tm);
            const ca = mesh.instanceColor.array; const m = o.alpha || o.plain ? 1 : fade;
            ca[k * 3] = D[i + 11] * m; ca[k * 3 + 1] = D[i + 12] * m; ca[k * 3 + 2] = D[i + 13] * m;
            if (aA) aA.array[k] = fade;
          }
          mesh.count = n; mesh.visible = n > 0;
          if (n > 0) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; if (aA) aA.needsUpdate = true; }
        },
        clear() { n = 0; mesh.count = 0; mesh.visible = false; },
      };
      mesh.visible = false;
      return P;
    }

    const cube = () => new THREE.BoxGeometry(1, 1, 1);
    const chips = mkPool(cube(), new THREE.MeshLambertMaterial({ color: 0xffffff }), 700, { plain: true });
    const dust = mkPool(cube(), withAlpha(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false })), 650, { alpha: true, order: 5 });
    const addMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const glow = mkPool(cube(), addMat(), 1100, { order: 9, mode: 1 });          // sparks, bolts (stretched along velocity)
    const blob = mkPool(cube(), addMat(), 220, { order: 9 });                    // flash and fire cubes (axis-aligned)
    const aimed = mkPool(cube(), addMat(), 120, { order: 9, mode: 2, yaw: false }); // muzzle flame lobes (fixed orientation)
    const ringG = new THREE.RingGeometry(0.8, 1, 16);
    const rings = mkPool(ringG, addMat(), 16, { order: 9, mode: 2, flat: true, yaw: false });
    const decals = mkPool(new THREE.PlaneGeometry(1, 1), (() => { const m = withAlpha(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); return m; })(), 160, { alpha: true, order: 4, mode: 2, flat: true, yaw: false });
    const POOLS = [chips, dust, glow, blob, aimed, rings, decals];
    const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

    // one light for blasts, kept in the scene at intensity 0 so no shader recompiles
    const light = new THREE.PointLight(0xffb060, 0, 14, 2); light.position.set(0, -50, 0); scene.add(light); let lightI = 0;

    // link every effect material before the first hit: the first draw of each pool otherwise stalls the frame 40-100 ms. compile() and a
    // throwaway render() do not help (the game draws into another target, so the programs differ); one zero-sized instance per pool is left
    // visible for two real frames instead, so the game's own draw links exactly the programs the effects will use.
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); let warmT = 0; let warmF = -1;
    function warming() {
      if (warmT === 2) return false;
      const fr = G.renderer ? G.renderer.info.render.frame : 0;
      if (warmT === 0) { for (const p of POOLS) { p.mesh.count = 1; p.mesh.visible = true; p.mesh.setMatrixAt(0, zero); p.mesh.instanceMatrix.needsUpdate = true; } warmF = fr; warmT = 1; return true; }
      if (fr - warmF < 2) return true;
      for (const p of POOLS) { p.mesh.count = 0; p.mesh.visible = false; } warmT = 2; return false;
    }

    const toV = (x, out) => (Array.isArray(x) ? out.set(x[0], x[1], x[2]) : out.copy(x));
    const FQ = () => (G.quality.particles || 1) * (G.vox && G.vox.low ? 0.5 : 1);
    const cnt = (base, f) => Math.max(1, Math.round(base * f));
    const shade = (hex, j) => { tc.setHex(hex); const m = 1 + rr(-j, j); tc.r = Math.min(1, tc.r * m); tc.g = Math.min(1, tc.g * m); tc.b = Math.min(1, tc.b * m); return tc.getHex(); };
    const mix = (a, b, t) => { const c1 = new THREE.Color(a); const c2 = new THREE.Color(b); return c1.lerp(c2, t).getHex(); };

    function chip(x, y, z, vx, vy, vz, size, color, life) {
      const sp = G.vox && G.vox.pool;
      if (sp && sp.spawn) { sp.spawn(x, y, z, vx, vy, vz, size, color, life); return; }
      chips.add({ x, y, z, vx, vy, vz, s0: size, s1: size, c: color, life, g: 14, bnc: 1, shr: 0.3 });
    }
    const ob = { x: 0, y: 0, z: 0 };
    function distToCam(x, y, z) { const c = G.camera.position; return Math.hypot(c.x - x, c.y - y, c.z - z); }
    const grid = { o: [0, 0, 0], s: 0.1 };

    // camera shake falling off with distance: s is 0..1 (1 = Saltline's full shake); kick springs give pitch/yaw, the roll spring the rest
    function shakeS(s) {
      const P = G.player; if (!P || !P.shake) return;
      s *= (G.settings && G.settings.shake != null ? G.settings.shake : 1); if (s < 0.01) return;
      s = Math.min(s, 1.4);
      P.shake.v += (rnd() - 0.5) * 60 * s; P.kickP.v += (rnd() - 0.5) * 1.5 * s; P.kickY.v += (rnd() - 0.5) * 1.5 * s;
    }
    const fall = (d, r0 = 9) => 1 / (1 + (d / r0) * (d / r0));
    const longShakes = [];

    let lastImpact = { t: -1, x: 0, y: 0, z: 0 };
    const N = new THREE.Vector3(); const Dd = new THREE.Vector3(); const R = new THREE.Vector3(); const T1 = new THREE.Vector3(); const T2 = new THREE.Vector3();
    function basis() { T1.crossVectors(N, Math.abs(N.y) < 0.9 ? Yax : new THREE.Vector3(1, 0, 0)).normalize(); T2.crossVectors(N, T1); }
    const tang = (s, out) => out.set(0, 0, 0).addScaledVector(T1, rr(-1, 1) * s).addScaledVector(T2, rr(-1, 1) * s);
    const tv = new THREE.Vector3();

    function sparkOut(x, y, z, dirv, n, v0, v1, spread, life0, life1, rgb, wid) {
      for (let i = 0; i < n; i++) {
        tv.copy(dirv); tv.x += rr(-spread, spread); tv.y += rr(-spread, spread); tv.z += rr(-spread, spread); tv.normalize();
        const sp = rr(v0, v1);
        glow.add({ x, y, z, vx: tv.x * sp, vy: tv.y * sp, vz: tv.z * sp, s0: wid, s1: wid * 0.5, len: Math.min(0.34, Math.max(0.07, sp * 0.013)), rgb, life: rr(life0, life1), g: 12, drag: 1.1, bnc: 1 });
      }
    }

    // ---- api.impact ----
    function impact(o) {
      if (!o || !o.point) return;
      toV(o.point, tp); const px = tp.x; const py = tp.y; const pz = tp.z;
      const cd = distToCam(px, py, pz); if (cd > 120) return;
      lastImpact = { t: performance.now(), x: px, y: py, z: pz };
      if (o.dir) toV(o.dir, Dd); else Dd.set(0, -1, 0); if (Dd.lengthSq() < 1e-6) Dd.set(0, -1, 0); Dd.normalize();
      if (o.normal) toV(o.normal, N); else N.set(0, 0, 0);
      if (N.lengthSq() < 1e-6) N.copy(Dd).negate(); N.normalize(); // the voxel block reports no normal: use the face toward the shooter
      R.copy(Dd).addScaledVector(N, -2 * Dd.dot(N)); basis();
      const surf = SURF[o.surface] ? o.surface : 'stone'; const S = SURF[surf];
      const power = o.power ?? 0.5; const col = o.color ?? S.c;
      const f = FQ() * (cd > 55 ? 0.5 : 1) * (0.7 + 0.6 * power);
      const ox = px + N.x * 0.03; const oy = py + N.y * 0.03; const oz = pz + N.z * 0.03;

      // voxel chips in the colour of what was hit, thrown off the face (concrete 4, wood 7, glass 4; ours are bigger and more of them to read at 0.1 m voxels)
      const nChip = surf === 'wood' ? 7 : surf === 'flesh' ? 8 : surf === 'metal' ? 3 : surf === 'glass' ? 4 : 7;
      for (let i = 0; i < cnt(nChip, f); i++) {
        tang(2.2, tv).addScaledVector(N, rr(1.6, 4.2 + power * 2.5)).addScaledVector(R, rr(0, 1.6));
        const cc = surf === 'flesh' ? [0x8a1010, 0xb01818, 0x5a0808][i % 3] : shade(col, 0.14);
        chip(ox, oy, oz, tv.x, tv.y, tv.z, rr(0.03, 0.075 + power * 0.02), cc, rr(1.1, 2.2));
      }
      // a hard white-hot square at the strike, then the colour of the surface: it is what makes a hit read at a distance
      if (surf !== 'flesh') { const hs = 0.16 + power * 0.16 + (surf === 'metal' ? 0.08 : 0); blob.add({ x: ox, y: oy, z: oz, s0: hs, s1: hs * 0.35, rgb: surf === 'wood' ? [1.0, 0.7, 0.35] : [1.3, 1.1, 0.75], life: 0.07 }); blob.add({ x: ox + N.x * 0.08, y: oy + N.y * 0.08, z: oz + N.z * 0.08, s0: hs * 0.9, s1: hs * 2.4, rgb: [0.5, 0.3, 0.12], life: 0.13 }); }
      // dust puffs: 8 + 2 fat in Saltline's concrete; hard squares here, tinted by the surface and the voxel
      if (surf !== 'metal' || rnd() < 0.5) {
        const dc = surf === 'flesh' ? S.dust : mix(S.dust, col, 0.5);
        const nd = surf === 'flesh' ? 3 : surf === 'glass' ? 2 : 4;
        for (let i = 0; i < cnt(nd, f); i++) {
          tang(0.7, tv).addScaledVector(N, rr(0.7, 2.0));
          dust.add({ x: ox + N.x * 0.05, y: oy + N.y * 0.05, z: oz + N.z * 0.05, vx: tv.x, vy: tv.y + 0.3, vz: tv.z, s0: rr(0.07, 0.12), s1: rr(0.22, 0.34), c: shade(dc, 0.08), a: surf === 'flesh' ? 0.7 : 0.6, life: rr(0.45, 0.85), drag: 3, g: -0.4 });
        }
        for (let i = 0; i < cnt(surf === 'flesh' ? 0 : 2, f); i++) dust.add({ x: ox, y: oy, z: oz, vx: N.x * 0.6, vy: N.y * 0.6 + 0.2, vz: N.z * 0.6, s0: 0.14, s1: rr(0.45, 0.6), c: shade(dc, 0.06), a: 0.42, life: rr(0.7, 1.1), drag: 2.4, g: -0.3 });
        if (surf === 'flesh') for (let i = 0; i < cnt(3, f); i++) dust.add({ x: ox, y: oy, z: oz, vx: N.x * 0.5 + rr(-0.4, 0.4), vy: rr(0.1, 0.8), vz: N.z * 0.5 + rr(-0.4, 0.4), s0: 0.08, s1: rr(0.3, 0.45), c: 0xa01410, a: 0.6, life: rr(0.4, 0.7), drag: 2.5, g: 1.5 });
      }
      // fast grit (concrete 4)
      if (surf === 'stone' || surf === 'plaster' || surf === 'dirt') sparkOut(ox, oy, oz, N, cnt(4, f), 5, 12, 0.7, 0.18, 0.35, (shade(col, 0.1), [tc.r * 0.9, tc.g * 0.9, tc.b * 0.9]), 0.025);
      // sparks: metal 18 at 6-24 m/s spread .55 + long embers, stone 30% 3
      if (surf === 'metal') {
        sparkOut(ox, oy, oz, R, cnt(18, f), 6, 24, 0.55, 0.25, 0.55, [1.5, 0.95, 0.4], 0.022);
        sparkOut(ox, oy, oz, N, cnt(3, f), 2, 6, 0.9, 0.7, 1.2, [1.2, 0.6, 0.15], 0.018);
        blob.add({ x: ox, y: oy, z: oz, s0: 0.18, s1: 0.06, rgb: [1.2, 1.0, 0.6], life: 0.07 }); blob.add({ x: ox, y: oy, z: oz, s0: 0.1, s1: 0.3, rgb: [1.0, 0.6, 0.2], life: 0.1 });
        for (let i = 0; i < cnt(2, f); i++) dust.add({ x: ox, y: oy, z: oz, vx: N.x * 0.6, vy: 0.5, vz: N.z * 0.6, s0: 0.06, s1: 0.2, c: 0x55565a, a: 0.4, life: 0.5, drag: 2, g: -0.4 });
      } else if ((surf === 'stone' || surf === 'plaster') && rnd() < 0.3 + power * 0.2) sparkOut(ox, oy, oz, R, 3, 5, 14, 0.5, 0.2, 0.4, [1.4, 0.85, 0.35], 0.02);
      if (surf === 'glass') sparkOut(ox, oy, oz, N, cnt(12, f), 3, 11, 0.9, 0.3, 0.7, [0.8, 1.0, 1.2], 0.03);
      if (surf === 'wood') sparkOut(ox, oy, oz, N, cnt(5, f), 2, 7, 0.9, 0.25, 0.5, [0.7, 0.45, 0.22], 0.03);
      if (surf === 'flesh') sparkOut(ox, oy, oz, R, cnt(7, f), 2, 8, 0.8, 0.3, 0.6, [0.55, 0.04, 0.03], 0.035);

      // decal snapped to the voxel face (0.1 m grid), only where nothing was carved; it dims out in 0.4 s
      if (o.decal !== false && surf !== 'flesh') {
        const ax = Math.abs(N.x) > Math.abs(N.y) ? (Math.abs(N.x) > Math.abs(N.z) ? 0 : 2) : (Math.abs(N.y) > Math.abs(N.z) ? 1 : 2);
        if (!grid.live) { const sr = scene.getObjectByName('vox-street'); if (sr) { grid.o = [sr.position.x, sr.position.y, sr.position.z]; grid.s = sr.scale.x; grid.live = true; } }
        const c = [px, py, pz]; const s = grid.s;
        const sign = N.getComponent(ax) >= 0 ? 1 : -1;
        for (let a = 0; a < 3; a++) c[a] = a !== ax ? (Math.floor((c[a] - grid.o[a]) / s) + 0.5) * s + grid.o[a] : Math.round((c[a] - sign * 0.02 - grid.o[a]) / s) * s + grid.o[a]; // the hit voxel's face plane
        c[ax] += sign * 0.008;
        tv.set(0, 0, 0).setComponent(ax, sign); tq.setFromUnitVectors(Zax, tv);
        tc.setHex(col); decals.add({ x: c[0], y: c[1], z: c[2], s0: s * 0.96, s1: s * 0.96, rgb: [tc.r * 0.28, tc.g * 0.28, tc.b * 0.28], a: surf === 'glass' ? 0.5 : 0.85, life: 0.4, q: { x: tq.x, y: tq.y, z: tq.z, w: tq.w } });
      }
      if (surf !== 'flesh' && power > 0.6) shakeS(0.05 * fall(cd, 6) * power);
    }

    // ---- api.blast ----
    function blast(o) {
      if (!o || !o.point) return;
      toV(o.point, tp); const px = tp.x; const py = tp.y; const pz = tp.z;
      const power = o.power ?? 1; const r = o.r ?? 2;
      const P = Math.min(4, Math.max(0.4, (r / 2.2) * (0.5 + power * 0.6))); const Z = Math.sqrt(P);
      const cd = distToCam(px, py, pz); const f = FQ() * (cd > 70 ? 0.6 : 1);
      // flash: white-hot, orange and a wide dim halo, as hard additive cubes
      blob.add({ x: px, y: py + 0.35 * P, z: pz, s0: 1.5 * P, s1: 2.3 * P, rgb: [1.5, 1.3, 1.0], life: 0.07 });
      blob.add({ x: px, y: py + 0.35 * P, z: pz, s0: 2.2 * P, s1: 3.2 * P, rgb: [0.9, 0.5, 0.18], life: 0.12 });
      blob.add({ x: px, y: py + 0.35 * P, z: pz, s0: 3.0 * P, s1: 2.2 * P, rgb: [0.14, 0.07, 0.03], life: 0.22 });
      lightI = 50 + 40 * P; light.position.set(px, py + 0.6, pz); light.distance = 10 + 9 * P;
      // fire lobes: 13 + 5P, life .55-1.05, drag 4, buoyant -2.6, speed 2.2-7.5
      for (let i = 0; i < cnt(22 + 8 * P, f); i++) {
        tv.set(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)).normalize().multiplyScalar(rr(2.2, 8));
        blob.add({ x: px, y: py + 0.3, z: pz, vx: tv.x, vy: tv.y, vz: tv.z, s0: 0.36 * P * rr(0.7, 1.2), s1: rr(0.5, 1.0) * P, rgb: [1.3, rr(0.4, 0.65), 0.1], life: rr(0.55, 1.05), drag: 4, g: -2.6 });
      }
      // smoke body and a rising column of square puffs
      for (let i = 0; i < cnt(11 + 5 * P, f); i++) {
        tv.set(rr(-1, 1), rr(0, 1), rr(-1, 1)).normalize().multiplyScalar(rr(1.5, 4.5 * Z));
        dust.add({ x: px, y: py + 0.3, z: pz, vx: tv.x, vy: tv.y + 1, vz: tv.z, s0: 0.4 * P, s1: rr(1.0, 1.7) * P, c: shade(0x4a4640, 0.3), a: 0.55, life: rr(1.4, 2.6), drag: 1.6, g: -0.6 });
      }
      for (let i = 0; i < cnt(8 + 3 * P, f); i++) {
        dust.add({ x: px + rr(-0.3, 0.3) * P, y: py + 0.2 + i * 0.12, z: pz + rr(-0.3, 0.3) * P, vx: rr(-0.8, 0.8), vy: rr(3, 8 + 2 * P), vz: rr(-0.8, 0.8), s0: 0.35 * P, s1: rr(0.9, 1.4) * P, c: shade(0x7a7468, 0.25), a: 0.5, life: rr(1.8, 3.2), drag: 1.5, g: -0.5 });
      }
      // sparks min(90, 34P) streaks 6-26 m/s drag 1.4, embers 10P
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < Math.min(90, cnt(34 * P, f)); i++) {
        tv.set(rr(-1, 1), rr(-0.1, 1), rr(-1, 1)).normalize(); const sp = rr(6, 26);
        glow.add({ x: px, y: py + 0.3, z: pz, vx: tv.x * sp, vy: tv.y * sp, vz: tv.z * sp, s0: 0.035, s1: 0.02, len: Math.min(0.5, sp * 0.02), rgb: [1.6, 0.9, 0.3], life: rr(0.5, 1.1), g: 14, drag: 1.4, bnc: 1 });
      }
      for (let i = 0; i < cnt(10 * P, f); i++) {
        tv.set(rr(-1, 1), rr(0.2, 1), rr(-1, 1)).normalize().multiplyScalar(rr(2, 8));
        blob.add({ x: px, y: py + 0.3, z: pz, vx: tv.x, vy: tv.y, vz: tv.z, s0: 0.06, s1: 0.03, rgb: [1.0, 0.5, 0.12], life: rr(1.4, 2.5), drag: 0.6, g: 3 });
      }
      // ground contact: shock ring, dust ring, scorch square
      const fy = G.fx && G.fx.floorY ? G.fx.floorY(px, py, pz) : 0;
      if (py - fy < 1.4 * P + 0.6) {
        rings.add({ x: px, y: fy + 0.08, z: pz, s0: 0.6 * P, s1: 9 * P * 0.8, rgb: [1.5, 1.1, 0.7], life: 0.32, q: flatQ });
        for (let i = 0; i < cnt(12 + 3 * P, f); i++) {
          const a = rnd() * 6.283; const sp = rr(5, 10);
          dust.add({ x: px, y: fy + 0.15, z: pz, vx: Math.cos(a) * sp, vy: rr(0.2, 1.2), vz: Math.sin(a) * sp, s0: 0.3 * P, s1: rr(0.8, 1.3) * P, c: shade(0x7a7468, 0.2), a: 0.7, life: rr(0.7, 1.3), drag: 3.2, g: -0.3 });
        }
        decals.add({ x: px, y: fy + 0.02, z: pz, s0: 2.3 * P, s1: 2.3 * P, rgb: [0.03, 0.025, 0.02], a: 0.6, life: 8, q: flatQ });
      }
      // chunks 13 + 6P, .04-.13 m, 4-13 m/s
      const sc = o.color ?? 0x8a8680;
      for (let i = 0; i < cnt(13 + 6 * P, f); i++) {
        tv.set(rr(-1, 1), rr(0.2, 1.3), rr(-1, 1)).normalize().multiplyScalar(rr(4, 13));
        chip(px, py + 0.3, pz, tv.x, tv.y, tv.z, rr(0.04, 0.13), shade(sc, 0.2), rr(1.4, 2.8));
      }
      const s = 0.55 * Z * fall(cd, 12) * (0.6 + power * 0.5);
      shakeS(s);
      longShakes.push({ t: 0, dur: 0.45 + 0.2 * P, amp: s * 0.5, acc: 0 });
      void up;
    }

    // ---- api.collapse ----
    function collapse(o) {
      if (!o || !o.point) return;
      toV(o.point, tp); const px = tp.x; const py = tp.y; const pz = tp.z;
      const m = Math.min(3, Math.max(0.4, (o.n || 40) / 40)); const cd = distToCam(px, py, pz); const f = FQ() * (cd > 70 ? 0.6 : 1);
      const fy = G.fx && G.fx.floorY ? G.fx.floorY(px, py, pz) : 0;
      for (let i = 0; i < cnt(10 + 10 * m, f); i++) {
        const a = rnd() * 6.283; const sp = rr(1.5, 4.5 + m);
        dust.add({ x: px + Math.cos(a) * 0.5 * m, y: fy + 0.2, z: pz + Math.sin(a) * 0.5 * m, vx: Math.cos(a) * sp, vy: rr(0.2, 1.4), vz: Math.sin(a) * sp, s0: 0.3 * m, s1: rr(1.0, 1.7) * m, c: shade(o.color ?? 0x8a847a, 0.18), a: 0.62, life: rr(1.3, 2.4), drag: 2, g: -0.2 });
      }
      for (let i = 0; i < cnt(4 + 4 * m, f); i++) dust.add({ x: px + rr(-0.5, 0.5) * m, y: py, z: pz + rr(-0.5, 0.5) * m, vx: rr(-0.5, 0.5), vy: rr(0.5, 2.5), vz: rr(-0.5, 0.5), s0: 0.4 * m, s1: rr(1.0, 1.6) * m, c: shade(o.color ?? 0x8a847a, 0.15), a: 0.55, life: rr(1.6, 2.6), drag: 1.4, g: -0.4 });
      const s = 0.4 * Math.sqrt(m) * fall(cd, 14);
      longShakes.push({ t: 0, dur: 1.1 + 0.5 * m, amp: s, acc: 0 });
    }

    // ---- api.debrisLand (rate limited) ----
    let landCool = 0;
    function debrisLand(o) {
      if (!o || !o.point || landCool > 0) return;
      toV(o.point, tp); const cd = distToCam(tp.x, tp.y, tp.z); if (cd > 60) return;
      landCool = 0.05;
      const f = FQ(); const big = (o.n || 1) > 6;
      const dc = mix(0x8a847a, o.color ?? 0x8a847a, 0.5);
      for (let i = 0; i < (big && f > 0.6 ? 2 : 1); i++) dust.add({ x: tp.x + rr(-0.1, 0.1), y: tp.y + 0.05, z: tp.z + rr(-0.1, 0.1), vx: rr(-0.4, 0.4), vy: rr(0.4, 1.0), vz: rr(-0.4, 0.4), s0: 0.08, s1: big ? 0.4 : 0.26, c: shade(dc, 0.1), a: 0.4, life: rr(0.45, 0.8), drag: 2.4, g: -0.2 });
    }

    function shake(point, amount) {
      let d = 0; if (point) { toV(point, tp); d = distToCam(tp.x, tp.y, tp.z); }
      shakeS((amount ?? 0.3) * fall(d, 10));
    }

    // ---- wrappers around the game's own fx (vox path only); originals stay reachable on api.orig ----
    const FX = G.fx; const orig = { tracer: FX.tracer, muzzle: FX.muzzle, impact: FX.impact };
    FX.tracer = function (a, b, color) {
      orig.tracer.apply(FX, arguments);
      try {
        const tr = FX.dbgTracers; if (tr) for (const t of tr) if (t.life > 0.06) t.life = 0.035; // the full-length line becomes a short flash, the bolt travels
        const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z; const dist = Math.hypot(dx, dy, dz); if (dist < 1.5) return;
        const sp = 260; const len = Math.min(7, Math.max(2, sp * 0.022)); const ux = dx / dist; const uy = dy / dist; const uz = dz / dist;
        tc.setHex(color || 0xffc070); const k = FQ() < 0.45 ? 0.8 : 1;
        const life = Math.max(0.02, (dist - len * 0.5) / sp); const x0 = a.x + ux * len * 0.5; const y0 = a.y + uy * len * 0.5; const z0 = a.z + uz * len * 0.5;
        glow.add({ x: x0, y: y0, z: z0, vx: ux * sp, vy: uy * sp, vz: uz * sp, s0: 0.03, s1: 0.03, len, rgb: [1.5 * k, 1.35 * k, 1.0 * k], life });
        glow.add({ x: x0, y: y0, z: z0, vx: ux * sp, vy: uy * sp, vz: uz * sp, s0: 0.07, s1: 0.07, len: len * 0.9, rgb: [tc.r * 0.22, tc.g * 0.22, tc.b * 0.22], life });
        blob.add({ x: b.x, y: b.y, z: b.z, s0: 0.14, s1: 0.04, rgb: [1.3, 1.0, 0.5], life: 0.06, vx: 0, vy: 0, vz: 0 });
      } catch (e) { if (!FX.__tErr) { FX.__tErr = 1; console.error('[vox/fx] tracer wrap', e); } }
    };
    const cdir = new THREE.Vector3();
    FX.muzzle = function (pos) {
      orig.muzzle.apply(FX, arguments);
      try {
        const cam = G.camera; const near = pos.distanceTo(cam.position) < 2.6; const f = FQ();
        if (near) cam.getWorldDirection(cdir); else cdir.set(rr(-1, 1), rr(0, 1), rr(-1, 1)).normalize();
        tq.setFromUnitVectors(Zax, cdir); const q = { x: tq.x, y: tq.y, z: tq.z, w: tq.w };
        const lobe = (len, w, rgb, life) => aimed.add({ x: pos.x + cdir.x * len * 0.5, y: pos.y + cdir.y * len * 0.5, z: pos.z + cdir.z * len * 0.5, s0: w, s1: w * 0.6, len, rgb, life, q });
        // Saltline: flame lobes .75V / .5V, core, forward spike .9V (scaled for a viewmodel with 0.1 m voxels)
        const V = near ? 0.5 : 0.8;
        lobe(0.75 * V, 0.1 * V, [1.4, 0.9, 0.42], 0.05); lobe(0.5 * V, 0.065 * V, [1.4, 1.1, 0.6], 0.04); lobe(0.9 * V, 0.035, [1.5, 1.3, 0.8], 0.035);
        blob.add({ x: pos.x, y: pos.y, z: pos.z, s0: 0.1 * V, s1: 0.14 * V, rgb: [1.5, 1.4, 1.0], life: 0.04 });
        sparkOut(pos.x, pos.y, pos.z, cdir, Math.max(2, Math.round(3 * f)), 8, 22, 0.35, 0.12, 0.28, [1.4, 0.8, 0.3], 0.02);
        dust.add({ x: pos.x + cdir.x * 0.3, y: pos.y + cdir.y * 0.3, z: pos.z + cdir.z * 0.3, vx: cdir.x * 0.8, vy: 0.5, vz: cdir.z * 0.8, s0: 0.05, s1: 0.2, c: 0x6a6660, a: 0.4, life: 0.5, drag: 2, g: -0.4 });
        if (near && G.player && G.player.shake && (G.state === 'playing' || !G.state)) { // Saltline shot trauma .12 on top of the weapon's own kick
          const st = G.settings && G.settings.shake != null ? G.settings.shake : 1;
          G.player.shake.v += (rnd() - 0.5) * 7 * st; G.player.kickP.v += 0.14 * st; G.player.kickY.v += (rnd() - 0.5) * 0.12 * st;
        }
      } catch (e) { if (!FX.__mErr) { FX.__mErr = 1; console.error('[vox/fx] muzzle wrap', e); } }
    };
    const NV = new THREE.Vector3();
    FX.impact = function (at, normal, tag) {
      orig.impact.apply(FX, arguments);
      try { // walls outside the voxel block get the same chips and sparks; a hit api.impact just handled is not doubled
        const now = performance.now(); const L = lastImpact;
        if (now - L.t < 30 && Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z) < 0.6) return;
        const s = TAG2SURF[tag] || 'stone'; impact({ point: at, normal, surface: s, color: SURF[s].c, power: 0.45, decal: false });
        lastImpact = L;
      } catch (e) { if (!FX.__iErr) { FX.__iErr = 1; console.error('[vox/fx] impact wrap', e); } }
    };
    void NV;

    const api = {
      impact, blast, collapse, debrisLand, shake, orig, grid, hold: false,
      pools: { chips, dust, glow, blob, aimed, rings, decals },
      debug: () => ({ chips: chips.n, dust: dust.n, glow: glow.n, blob: blob.n, aimed: aimed.n, rings: rings.n, decals: decals.n }),
      clear() { for (const p of POOLS) p.clear(); },
      update(gdt, dt) {
        if (warming()) return;
        if (api.hold) return;
        const d = Math.min(gdt, 0.05);
        landCool = Math.max(0, landCool - dt);
        if (lightI > 0.1) { lightI *= Math.exp(-dt * 7); light.intensity = lightI; } else if (light.intensity) { light.intensity = 0; light.position.y = -50; }
        for (const p of POOLS) p.update(d);
        for (let i = longShakes.length - 1; i >= 0; i--) {
          const s = longShakes[i]; s.t += dt; s.acc += dt;
          while (s.acc > 0.035) { s.acc -= 0.035; shakeS(s.amp * Math.pow(1 - Math.min(1, s.t / s.dur), 1.5)); }
          if (s.t >= s.dur) longShakes.splice(i, 1);
        }
      },
    };
    return api;
  });
})();
