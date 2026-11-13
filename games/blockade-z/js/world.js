// The arena: a walled, ruined city block with six enterable buildings, each its own architecture.
// Layout is hand-placed; the seed only varies tints and rubble. Also owns collision (AABBs in a
// spatial hash), the zombie walk grid (flow field) and raycasts.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const HALF = 36;          // inner wall line
  const GRID_HALF = 46;     // walk grid covers the gate corridors too
  const GATES = [
    { name: 'BẮC', dir: [0, -1] }, { name: 'NAM', dir: [0, 1] }, { name: 'TÂY', dir: [-1, 0] }, { name: 'ĐÔNG', dir: [1, 0] },
  ];

  BZ.makeWorld = (G) => {
    const solids = [];
    const B = new BZ.Builder('world');
    const rr = BZ.rng('ruins');
    const scene = G.scene;
    const fires = [];   // {pos, size, smoke}
    const lights = [];  // {pos, base, ph, fire|flicker, dist}
    const glows = [];   // sprite [x, y, z, scale]

    const solid = (min, max, tag = 'stone') => { solids.push({ min, max, tag }); };
    const box = (min, max, mats, opt) => B.box(min, max, mats, opt);
    const block = (min, max, mats, tag = 'stone', opt) => { box(min, max, mats, opt); solid(min, max, tag); };

    // Wall along `axis` ('x' or 'z') from a0 to a1, thickness t starting at c, base y0, height h.
    // openings: [[s0, s1, y0, y1]] in wall coordinates. ruin(s0, s1) returns how much to bite off the top.
    function wall(axis, a0, a1, c, t, y0, h, mat, openings = [], o = {}) {
      const put = (s0, s1, h0, h1) => {
        if (s1 - s0 < 0.01 || h1 - h0 < 0.01) return;
        const min = axis === 'x' ? [s0, y0 + h0, c] : [c, y0 + h0, s0];
        const max = axis === 'x' ? [s1, y0 + h1, c + t] : [c + t, y0 + h1, s1];
        block(min, max, mat, o.tag || 'stone', o.opt);
      };
      const full = (s0, s1) => {
        if (!o.ruin) return put(s0, s1, 0, h);
        for (let s = s0; s < s1 - 0.01; s += 1) { const e = Math.min(s1, s + 1); put(s, e, 0, h - Math.min(h, o.ruin(s, e))); }
      };
      let cur = a0;
      for (const [p0, p1, q0, q1] of openings.slice().sort((p, q) => p[0] - q[0])) {
        full(cur, p0); put(p0, p1, 0, q0); put(p0, p1, q1, h); cur = p1;
      }
      full(cur, a1);
    }
    // Four walls of a rectangular storey. op = { s, n, w, e } openings per side
    // (s = +z face, n = -z face, w = -x face, e = +x face), in world coordinates along the wall.
    function storey(x0, z0, x1, z1, y0, h, mat, op = {}, o = {}) {
      const t = o.t || 0.3;
      wall('x', x0, x1, z1 - t, t, y0, h, mat, op.s || [], { ...o, ruin: o.ruin && o.ruin.s });
      wall('x', x0, x1, z0, t, y0, h, mat, op.n || [], { ...o, ruin: o.ruin && o.ruin.n });
      wall('z', z0 + t, z1 - t, x0, t, y0, h, mat, op.w || [], { ...o, ruin: o.ruin && o.ruin.w });
      wall('z', z0 + t, z1 - t, x1 - t, t, y0, h, mat, op.e || [], { ...o, ruin: o.ruin && o.ruin.e });
    }
    function slab(x0, z0, x1, z1, y, th, mat, hole, tag = 'stone') {
      if (!hole) return block([x0, y, z0], [x1, y + th, z1], mat, tag);
      const [hx0, hz0, hx1, hz1] = hole;
      const part = (a, b) => { if (b[0] - a[0] > 0.01 && b[2] - a[2] > 0.01) block(a, b, mat, tag); };
      part([x0, y, z0], [x1, y + th, hz0]); part([x0, y, hz1], [x1, y + th, z1]);
      part([x0, y, hz0], [hx0, y + th, hz1]); part([hx1, y, hz0], [x1, y + th, hz1]);
    }
    // Straight stair: starts at (x, z), climbs `rise` over n steps toward dir ([dx, dz]), width w across.
    function stairs(x, z, dir, w, rise, n, mat) {
      const run = 0.34; const hstep = rise / n;
      for (let i = 0; i < n; i++) {
        const a = i * run; const b = (i + 1) * run; const top = (i + 1) * hstep;
        let min; let max;
        if (dir[0]) { const s0 = x + dir[0] * a; const s1 = x + dir[0] * b; min = [Math.min(s0, s1), 0, z]; max = [Math.max(s0, s1), top, z + w]; }
        else { const s0 = z + dir[1] * a; const s1 = z + dir[1] * b; min = [x, 0, Math.min(s0, s1)]; max = [x + w, top, Math.max(s0, s1)]; }
        block(min, max, { top: mat, side: 'concrete_dark' }, 'stone');
      }
      return n * run;
    }
    const sign = (min, max, key, face) => box(min, max, { px: face === 'px' ? key : 'metal_dark', nx: face === 'nx' ? key : 'metal_dark', pz: face === 'pz' ? key : 'metal_dark', nz: face === 'nz' ? key : 'metal_dark', top: 'metal_dark', bottom: 'metal_dark' }, { uv: 'fit', vary: 0, flat: true });
    const rubble = (x, z, r, hmax) => {
      for (let i = 0; i < 7; i++) {
        const a = rr.next() * Math.PI * 2; const d = rr.next() * r; const s = rr.range(0.35, 0.9); const h = rr.range(0.2, hmax);
        const cx = x + Math.cos(a) * d; const cz = z + Math.sin(a) * d;
        box([cx - s / 2, 0, cz - s / 2], [cx + s / 2, h, cz + s / 2], i % 3 ? 'rubble' : 'brick', { vary: 0.1 });
      }
      solid([x - r * 0.5, 0, z - r * 0.5], [x + r * 0.5, Math.min(hmax, 0.6), z + r * 0.5], 'stone');
    };
    const crate = (x, z, n, key = 'crate') => { for (let i = 0; i < n; i++) box([x, i, z], [x + 1, i + 1, z + 1], key, { uv: 'fit' }); solid([x, 0, z], [x + 1, n, z + 1], key === 'crate' ? 'wood' : 'metal'); };
    const sandbags = (min, max) => block(min, max, 'sandbag', 'stone');
    const fire = (x, y, z, size = 1, smoke = true, light = true) => {
      fires.push({ pos: new THREE.Vector3(x, y, z), size, smoke, t: rr.next() });
      glows.push([x, y + 0.6 * size, z, 2.5 * size]);
      if (light) lights.push({ pos: [x, y + 1, z], base: 10 * size, fire: true, ph: rr.next() * 9, dist: 9 + 4 * size });
    };
    const scorch = (x, z, s) => box([x - s, 0.045, z - s], [x + s, 0.05, z + s], 'scorch', { uv: 'fit', vary: 0, skip: ['ny', 'px', 'nx', 'pz', 'nz'] });

    // ---------- ground ----------
    box([-120, -1, -120], [120, 0, 120], { top: 'dirt' }, { skip: ['ny', 'px', 'nx', 'pz', 'nz'], vary: 0 });
    box([-HALF, -0.5, -HALF], [HALF, 0.01, HALF], 'concrete', { vary: 0, skip: ['ny'] });
    box([-12, -0.5, -12], [12, 0.02, 12], 'tile', { vary: 0, skip: ['ny'] });
    for (const [x0, z0, x1, z1] of [[-3, 12, 3, 46], [-3, -46, 3, -12], [12, -3, 46, 3], [-46, -3, -12, 3]]) {
      box([x0, -0.5, z0], [x1, 0.03, z1], 'asphalt', { vary: 0, skip: ['ny'] });
      const alongZ = x1 - x0 < z1 - z0; const lo = alongZ ? z0 : x0; const hi = alongZ ? z1 : x1;
      for (let t = lo + 0.75; t < hi - 1.5; t += 3) {
        if (rr.chance(0.25)) continue;
        if (alongZ) box([-0.09, 0.03, t], [0.09, 0.04, t + 1.5], 'road_line', { uv: 'fit', vary: 0, skip: ['ny'] });
        else box([t, 0.03, -0.09], [t + 1.5, 0.04, 0.09], 'road_line', { uv: 'fit', vary: 0, skip: ['ny'] });
      }
    }
    box([-33, -0.5, 6], [-13, 0.025, 30], { top: 'grass_top', side: 'dirt' }, { vary: 0, skip: ['ny'] });

    // ---------- perimeter: military concrete barrier, barbed wire, four gates with corridors ----------
    const WALL_H = 4.5;
    const wallSeg = (min, max) => { block(min, max, 'concrete'); box([min[0] - 0.02, 0, min[2] - 0.02], [max[0] + 0.02, 0.6, max[2] + 0.02], 'hazard', { vary: 0 }); };
    for (const s of [-1, 1]) {
      wallSeg([-HALF - 1, 0, s > 0 ? HALF : -HALF - 1], [-3, WALL_H, s > 0 ? HALF + 1 : -HALF]);
      wallSeg([3, 0, s > 0 ? HALF : -HALF - 1], [HALF + 1, WALL_H, s > 0 ? HALF + 1 : -HALF]);
      wallSeg([s > 0 ? HALF : -HALF - 1, 0, -HALF], [s > 0 ? HALF + 1 : -HALF, WALL_H, -3]);
      wallSeg([s > 0 ? HALF : -HALF - 1, 0, 3], [s > 0 ? HALF + 1 : -HALF, WALL_H, HALF]);
      wallSeg([-4, 0, s > 0 ? HALF + 1 : -GRID_HALF], [-3, 3.2, s > 0 ? GRID_HALF : -HALF - 1]);
      wallSeg([3, 0, s > 0 ? HALF + 1 : -GRID_HALF], [4, 3.2, s > 0 ? GRID_HALF : -HALF - 1]);
      wallSeg([s > 0 ? HALF + 1 : -GRID_HALF, 0, -4], [s > 0 ? GRID_HALF : -HALF - 1, 3.2, -3]);
      wallSeg([s > 0 ? HALF + 1 : -GRID_HALF, 0, 3], [s > 0 ? GRID_HALF : -HALF - 1, 3.2, 4]);
    }
    for (let i = -HALF; i < HALF; i += 1.5) {
      for (const [x, z] of [[i, -HALF - 0.5], [i, HALF + 0.5], [-HALF - 0.5, i], [HALF + 0.5, i]]) {
        if (Math.abs(i) < 4) continue;
        box([x - 0.35, WALL_H, z - 0.35], [x + 0.35, WALL_H + 0.45, z + 0.35], 'metal_dark', { vary: 0.2, skip: ['ny'] });
      }
    }
    for (const g of GATES) {
      const [dx, dz] = g.dir; const cx = dx * (HALF + 0.5); const cz = dz * (HALF + 0.5);
      const ax = dz !== 0 ? 3.6 : 0.6; const az = dx !== 0 ? 3.6 : 0.6;
      box([cx - ax, WALL_H, cz - az], [cx + ax, WALL_H + 0.6, cz + az], 'hazard', { vary: 0 });
    }

    // ---------- 1. Apartment block: brick, two floors, inner stair, balcony, collapsed north-east corner ----------
    {
      const x0 = -30; const z0 = -32; const x1 = -16; const z1 = -20; const H1 = 3.2; const TH = 0.2;
      const win = (a) => [a, a + 1, 1.2, 2.3];
      storey(x0, z0, x1, z1, 0, H1, 'brick', {
        s: [[-22, -20.6, 0, 2.4], win(-28), win(-18.6)], e: [[-27, -25.6, 0, 2.4], win(-30.5), win(-23)],
        n: [win(-28), win(-23), win(-19)], w: [win(-30), win(-24.5)],
      });
      stairs(-29.7, -20.4, [0, -1], 1.2, H1 + TH, 12, 'plank');
      slab(x0, z0, x1, z1, H1, TH, { top: 'plank', side: 'concrete', bottom: 'concrete' }, [-29.7, -24.6, -28.4, -20.3]);
      storey(x0, z0, x1, z1, H1 + TH, 3.2, 'brick', {
        s: [[-22.5, -21.3, 0, 2.4], win(-28), win(-18.6)], e: [win(-24)], n: [win(-28), win(-24)], w: [win(-30), win(-24.5)],
      }, { ruin: { n: (s0, s1) => Math.max(0, (s1 + 20) * 0.8), e: (s0) => Math.max(0, (-28 - s0) * 0.9) } });
      slab(-25, z1, -19, z1 + 1.4, H1, TH, 'concrete');
      for (let x = -25; x <= -19.1; x += 0.6) box([x, H1 + TH, z1 + 1.3], [x + 0.08, H1 + TH + 0.9, z1 + 1.38], 'metal_dark', { vary: 0 });
      block([-25, H1 + TH + 0.9, z1 + 1.28], [-19, H1 + TH + 1.0, z1 + 1.4], 'metal_dark', 'metal');
      slab(x0, z0, x1, z1, 6.6, 0.25, 'concrete_dark', [-20, -32, -16, -28]);
      rubble(-15, -33.5, 2.2, 1.0); rubble(-14, -29, 1.6, 0.7);
      block([-25, 0, -30], [-23, 0.8, -29], 'plank', 'wood'); block([-19.5, 0, -31.6], [-17, 1.9, -31], 'plank', 'wood');
    }

    // ---------- 2. Shophouse row: three narrow two-storey shops, painted plaster, signboards ----------
    const SHOPS = [['plaster_yellow', 'sign_taphoa', 1.9], ['plaster_teal', 'sign_caphe', 2.6], ['plaster_pink', 'sign_pho', 2.2]];
    SHOPS.forEach(([mat, sg, shutter], i) => {
      const x0 = -31 + i * 4.6; const x1 = x0 + 4.6; const z0 = -14; const z1 = -5;
      storey(x0, z0, x1, z1, 0, 3.2, mat, { s: [[x0 + 0.5, x1 - 0.5, 0, 2.7]], n: [[x0 + 1.6, x0 + 2.8, 1.2, 2.2]] });
      block([x0 + 0.5, shutter, z1 - 0.3], [x1 - 0.5, 2.7, z1 - 0.1], 'shutter', 'metal');
      slab(x0, z0, x1, z1, 3.2, 0.2, { top: 'concrete', side: mat, bottom: 'concrete' });
      storey(x0, z0, x1, z1, 3.4, 3.4 + i * 0.6, mat, { s: [[x0 + 1.2, x1 - 1.2, 1.0, 2.5]] });
      box([x0 + 1.2, 4.4, z1 - 0.32], [x1 - 1.2, 5.9, z1 - 0.3], 'glass_lit', { uv: 'fit', vary: 0 });
      slab(x0 + 0.4, z1, x1 - 0.4, z1 + 0.9, 3.4, 0.15, 'concrete');
      for (let x = x0 + 0.4; x < x1 - 0.4; x += 0.45) box([x, 3.55, z1 + 0.8], [x + 0.07, 4.35, z1 + 0.88], 'metal_dark', { vary: 0 });
      sign([x0 + 0.4, 2.85, z1], [x1 - 0.4, 3.35, z1 + 0.12], sg, 'pz');
      slab(x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, 6.8 + i * 0.6, 0.2, 'roof_red');
      block([x0 + 0.35, 0, z0 + 0.35], [x1 - 0.35, 1.9, z0 + 0.9], 'plank', 'wood');
      block([x0 + 0.35, 0, z1 - 3.2], [x0 + 1.9, 1.0, z1 - 2.5], 'crate', 'wood', { uv: 'fit' });
    });

    // ---------- 3. Guard post: concrete, barred windows, outside stair to a sandbagged roof ----------
    {
      const x0 = 14; const z0 = -32; const x1 = 28; const z1 = -22; const H = 4.2;
      const win = (a) => [a, a + 1.6, 1.2, 2.6];
      storey(x0, z0, x1, z1, 0, H, 'concrete', { w: [[-28, -26.4, 0, 2.5], win(-31), win(-24.5)], s: [win(16), win(20), win(24.5)], n: [win(18), win(23)], e: [win(-25)] });
      for (const [a0, a1] of [[16, 17.6], [20, 21.6], [24.5, 26.1]]) for (let a = a0 + 0.2; a < a1; a += 0.3) box([a, 1.2, z1 - 0.2], [a + 0.05, 2.6, z1 - 0.15], 'metal_dark', { vary: 0 });
      slab(x0, z0, x1, z1, H, 0.3, 'concrete_dark');
      const R = H + 0.3;
      wall('x', x0, x1, z0, 0.25, R, 0.9, 'concrete'); wall('x', x0, x1, z1 - 0.25, 0.25, R, 0.9, 'concrete');
      wall('z', z0, z1, x0, 0.25, R, 0.9, 'concrete'); wall('z', z0, z1, x1 - 0.25, 0.25, R, 0.9, 'concrete', [[-29.6, -28.1, 0, 0.9]]);
      const len = stairs(28.1, -22.2, [0, -1], 1.3, R, 15, 'metal_dark');
      block([28.1, 0, -22.2 - len - 1.4], [29.4, R, -22.2 - len], { top: 'metal_dark', side: 'concrete_dark' });
      for (let z = -22.2; z > -22.2 - len; z -= 0.8) box([29.36, 0, z - 0.06], [29.42, (-z - 22.2) / len * R + 1, z], 'metal_dark', { vary: 0 });
      sandbags([21, R, -27.5], [22, R + 0.9, -24]); sandbags([17, R, -24.5], [21, R + 0.9, -23.5]);
      box([25, R, -30], [25.12, R + 3.5, -29.88], 'metal_dark', { vary: 0 });
      sign([x0 - 0.12, 2.7, -28.6], [x0, 3.3, -25.8], 'sign_trambac', 'nx');
      block([17, 0, -30], [19.5, 0.8, -29], 'plank', 'wood'); block([22, 0, -31.6], [26, 2, -31.1], 'metal_dark', 'metal');
      for (let z = -27.5; z < -23.5; z += 0.3) block([24, 0, z], [24.07, 2.4, z + 0.07], 'metal_dark', 'metal');
    }

    // ---------- 4. Gas station: canopy on pillars, pump islands, a kiosk with an open glass front ----------
    {
      for (const [x, z] of [[15.5, -14.5], [26.1, -14.5], [15.5, -6.9], [26.1, -6.9]]) block([x, 0, z], [x + 0.4, 4, z + 0.4], 'concrete', 'stone');
      block([15, 4, -15], [27, 4.45, -6.4], { top: 'concrete_dark', side: 'plaster_white', bottom: 'plaster_white' });
      sign([18, 3.6, -6.42], [24, 4.0, -6.3], 'sign_xang', 'pz');
      for (const z of [-12, -9]) {
        block([19, 0, z], [23, 0.2, z + 1], 'concrete', 'stone');
        for (const x of [19.6, 21.8]) block([x, 0.2, z + 0.2], [x + 0.6, 1.6, z + 0.8], { top: 'metal_dark', side: 'car_red' }, 'metal');
      }
      const x0 = 28.5; const z0 = -15.5; const x1 = 34.5; const z1 = -6.5;
      storey(x0, z0, x1, z1, 0, 3.4, 'plaster_white', { w: [[-14.5, -12.8, 0, 2.5], [-12.4, -7.5, 0.9, 2.8]], n: [[30.5, 32, 1.3, 2.3]] });
      slab(x0, z0, x1, z1, 3.4, 0.25, 'concrete_dark');
      for (let z = -14; z < -7.5; z += 1.6) block([31.5, 0, z], [33.8, 1.7, z + 0.5], 'plank', 'wood');
      block([29.2, 0, -8.6], [30.6, 1.0, -7], 'crate_metal', 'metal', { uv: 'fit' });
    }

    // ---------- 5. Stone church: nave with stained glass, pews, altar, bell tower ----------
    {
      const x0 = -30; const z0 = 9; const x1 = -19; const z1 = 27; const H = 7;
      const tall = (a) => [a, a + 1, 2, 5.2];
      storey(x0, z0, x1, z1, 0, H, 'stone', { e: [[16.5, 19.5, 0, 4], tall(14), tall(22.5), tall(24.8)], w: [tall(11.5), tall(15), tall(19), tall(22.5)], n: [[-25.2, -23.8, 3, 6]] });
      for (const [a, side] of [[14, 'e'], [22.5, 'e'], [24.8, 'e'], [11.5, 'w'], [15, 'w'], [19, 'w'], [22.5, 'w']]) {
        const x = side === 'e' ? x1 - 0.18 : x0 + 0.12;
        block([x, 2, a], [x + 0.06, 5.2, a + 1], 'stained', 'stone', { uv: 'fit', vary: 0, flat: true });
      }
      box([-25.2, 3, z0 + 0.12], [-23.8, 6, z0 + 0.18], 'stained', { uv: 'fit', vary: 0, flat: true });
      for (let i = 0; i < 6; i++) block([x0 - 0.5 + i, H + i * 0.75, z0 - 0.4], [x1 + 0.5 - i, H + (i + 1) * 0.75, z1 + 0.4], 'concrete_dark');
      block([x0 + 0.3, H - 0.3, z0 + 0.3], [x1 - 0.3, H, z1 - 0.3], 'plank', 'wood');
      for (let z = 13; z < 25; z += 1.7) {
        block([-29.4, 0, z], [-25.9, 0.5, z + 0.5], 'plank', 'wood'); box([-29.4, 0.5, z + 0.4], [-25.9, 1.1, z + 0.5], 'plank');
        block([-23.1, 0, z], [-19.6, 0.5, z + 0.5], 'plank', 'wood'); box([-23.1, 0.5, z + 0.4], [-19.6, 1.1, z + 0.5], 'plank');
      }
      block([-26, 0, 9.4], [-23, 1.1, 10.6], { top: 'plaster_white', side: 'stone' }); block([-24.8, 1.1, 9.8], [-24.2, 2.6, 10.2], 'gold', 'metal', { vary: 0 });
      const tx0 = -19; const tz0 = 9; const tx1 = -14.6; const tz1 = 13.4;
      storey(tx0, tz0, tx1, tz1, 0, 3.4, 'stone', { e: [[10.6, 11.8, 0, 2.6]], w: [[10.6, 11.8, 0, 2.6]] });
      slab(tx0, tz0, tx1, tz1, 3.4, 0.3, 'stone');
      block([tx0, 3.7, tz0], [tx1, 11, tz1], 'stone');
      storey(tx0, tz0, tx1, tz1, 11, 2.6, 'stone', { s: [[-17.6, -16, 0, 2]], n: [[-17.6, -16, 0, 2]], e: [[10.6, 11.8, 0, 2]], w: [[10.6, 11.8, 0, 2]] });
      block([-17.3, 12.3, 10.9], [-16.3, 13.2, 11.5], 'gold', 'metal', { vary: 0 });
      for (let i = 0; i < 4; i++) { const k = i * 0.55; block([tx0 - 0.2 + k, 13.6 + i * 0.9, tz0 - 0.2 + k], [tx1 + 0.2 - k, 14.5 + i * 0.9, tz1 + 0.2 - k], 'concrete_dark'); }
      lights.push({ pos: [-24.5, 4, 18], base: 5, ph: 1, dist: 12, color: 0xffb070 });
    }

    // ---------- 6. Warehouse: corrugated metal, wide loading door, crate stacks, a container ----------
    {
      const x0 = 10; const z0 = 12; const x1 = 32; const z1 = 30; const H = 7;
      const strip = (a) => [a, a + 2, 5, 6];
      storey(x0, z0, x1, z1, 0, H, 'corrugated', { w: [[17.5, 24.5, 0, 5.2], strip(13), strip(26)], n: [[20, 21.4, 0, 2.4], strip(13), strip(26)], s: [strip(14), strip(24)], e: [strip(16), strip(22)] }, { tag: 'metal' });
      slab(x0, z0, x1, z1, H, 0.3, 'corrugated', [22, 18, 26, 22], 'metal');
      block([x0 - 0.1, 5.25, 17.3], [x0 + 0.05, 5.6, 24.7], 'hazard', 'metal', { vary: 0 });
      sign([x0 - 0.14, 5.7, 19.5], [x0 - 0.02, 6.5, 22.5], 'sign_kho', 'nx');
      for (const [x, z, n] of [[13, 14, 3], [14, 14, 2], [13, 15, 1], [28, 14, 3], [29, 14, 2], [28.5, 26, 2], [14, 26.5, 3], [15, 26.5, 1], [24, 26.5, 2]]) crate(x, z, n, n > 2 ? 'crate_metal' : 'crate');
      block([19, 0, 25.5], [24, 2.6, 28], 'corrugated', 'metal');
      box([18.95, 0, 25.45], [24.05, 0.25, 28.05], 'car_red', { vary: 0 });
      block([26, 0, 18], [27.4, 1.2, 20.4], { top: 'metal_dark', side: 'car_yellow' }, 'metal');
      box([26.1, 1.2, 18.1], [26.3, 2.8, 20.3], 'metal_dark'); box([25.4, 0.05, 18.4], [26, 0.15, 20], 'metal_dark');
      lights.push({ pos: [21, 5.5, 21], base: 6, ph: 2, dist: 14, color: 0xc8d8ff });
    }

    // ---------- plaza: crater, broken monument, sandbags, wrecked tanks ----------
    scorch(0, 0, 4.2);
    block([-1.1, 0, -1.1], [1.1, 1.2, 1.1], 'stone'); block([-0.5, 1.2, -0.5], [0.1, 2.6, 0.5], 'stone'); block([0.1, 1.2, -0.3], [0.5, 1.9, 0.4], 'stone');
    rubble(2.4, 2.6, 1.2, 0.5); rubble(-2.6, -2.4, 1.2, 0.5);
    sandbags([-9, 0, 4.5], [-5, 0.9, 5.3]); sandbags([4.5, 0, -10], [5.3, 0.9, -5.5]); sandbags([-6, 0, -4.4], [-5.2, 0.9, -1.2]); sandbags([5, 0, 10.2], [8.5, 0.9, 11]);
    function tank(x, z, alongX, turretYaw, mat) {
      const L = 6.4; const W = 3.4; const hx = alongX ? L / 2 : W / 2; const hz = alongX ? W / 2 : L / 2;
      for (const s of [-1, 1]) {
        const tmin = alongX ? [x - hx, 0, s > 0 ? z + hz - 0.8 : z - hz] : [s > 0 ? x + hx - 0.8 : x - hx, 0, z - hz];
        const tmax = alongX ? [x + hx, 1.0, tmin[2] + 0.8] : [tmin[0] + 0.8, 1.0, z + hz];
        box(tmin, tmax, 'track', { uvScale: 2 });
      }
      box([x - hx + 0.3, 0.9, z - hz + 0.3], [x + hx - 0.3, 1.8, z + hz - 0.3], mat);
      solid([x - hx, 0, z - hz], [x + hx, 1.8, z + hz], 'metal');
      B.push(new THREE.Matrix4().makeTranslation(x, 1.8, z).multiply(new THREE.Matrix4().makeRotationY(turretYaw)));
      box([-1.3, 0, -1.2], [1.3, 0.9, 1.2], mat); box([-0.14, 0.32, -4.4], [0.14, 0.6, -1.2], 'metal_dark'); box([-0.5, 0.9, 0.1], [0.1, 1.1, 0.7], 'metal_dark');
      B.pop();
      solid([x - 1.3, 1.8, z - 1.3], [x + 1.3, 2.7, z + 1.3], 'metal');
    }
    tank(8.6, 7.2, true, 0.6, 'tank');
    tank(-8.2, -8.4, false, -2.2, 'burnt');
    fire(-8.2, 2.7, -8.4, 0.8);

    // ---------- crashed helicopter in front of the guard post ----------
    {
      const hx = 7.6; const hz = -17;
      B.push(new THREE.Matrix4().makeTranslation(hx, 1.1, hz).multiply(new THREE.Matrix4().makeRotationZ(0.45)).multiply(new THREE.Matrix4().makeRotationY(0.2)));
      box([-1.2, -1, -2.6], [1.2, 1.1, 2.4], 'heli'); box([-1.0, -0.6, -3.4], [1.0, 0.9, -2.6], 'glass'); box([-0.3, 1.1, -0.6], [0.3, 1.5, 0.6], 'metal_dark');
      box([-0.35, 0.1, 2.4], [0.35, 0.7, 6.4], 'heli'); box([-0.08, 0.4, 6.0], [0.08, 1.8, 6.6], 'heli');
      B.pop();
      solid([hx - 1.9, 0, hz - 3.6], [hx + 1.9, 2.6, hz + 2.6], 'metal');
      solid([hx - 0.8, 0, hz + 2.6], [hx + 1.4, 1.6, hz + 6.6], 'metal');
      for (const [x, z, a, l] of [[3.5, -20.5, 0.4, 4.6], [10.5, -21, -0.9, 3.8], [5.2, -12.4, 1.3, 4.2]]) {
        B.push(new THREE.Matrix4().makeTranslation(x, 0.06, z).multiply(new THREE.Matrix4().makeRotationY(a)));
        box([-0.18, 0, -l / 2], [0.18, 0.08, l / 2], 'metal_dark');
        B.pop();
      }
      scorch(hx, hz, 3.6);
      fire(hx + 0.4, 2.2, hz - 1, 1.3); fire(hx + 0.2, 1.0, hz + 4.2, 0.6, true, false);
    }

    // ---------- burnt cars along the streets ----------
    const CARS = [[-1.7, -20, 1, 'burnt', true], [1.8, 24, 1, 'car_yellow'], [-18, -1.6, 0, 'burnt', true], [21, 1.7, 0, 'car_blue'], [-24, 1.8, 0, 'car_red'], [1.6, -27, 1, 'burnt']];
    for (const [x, z, rot, paint, burning] of CARS) {
      const L = 4.2; const W = 2; const hx = rot ? W / 2 : L / 2; const hz = rot ? L / 2 : W / 2;
      box([x - hx, 0.35, z - hz], [x + hx, 1.15, z + hz], paint);
      const cx = rot ? W / 2 - 0.1 : 1.15; const cz = rot ? 1.15 : W / 2 - 0.1;
      box([x - cx, 1.15, z - cz], [x + cx, 1.85, z + cz], { side: paint === 'burnt' ? 'burnt' : 'glass', top: paint }, { uv: 'fit' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wx = x + sx * (rot ? W / 2 : L / 2 - 0.8); const wz = z + sz * (rot ? L / 2 - 0.8 : W / 2);
        box([wx - 0.35, 0, wz - 0.35], [wx + 0.35, 0.7, wz + 0.35], paint === 'burnt' ? 'burnt' : 'tire', { uv: 'fit' });
      }
      solid([x - hx, 0, z - hz], [x + hx, 1.85, z + hz], 'metal');
      if (burning) { scorch(x, z, 2.4); fire(x, 1.9, z, 0.7); }
    }

    // ---------- rubble, lamp posts ----------
    for (const [x, z, r, h] of [[-12, -18, 1.4, 0.8], [8, 30, 1.6, 0.9], [27, 4.8, 1.2, 0.6], [-27, -3.6, 1.0, 0.5], [-8, 31, 1.4, 0.8], [33, -20, 1.2, 0.7]]) rubble(x, z, r, h);
    const LAMPS = [[-11.5, -11.5, true], [11.5, -11.5, false], [-11.5, 11.5, true], [11.5, 11.5, false]];
    for (const [x, z, lit] of LAMPS) {
      if (lit) {
        block([x - 0.12, 0, z - 0.12], [x + 0.12, 3.6, z + 0.12], 'metal_dark', 'metal');
        box([x - 0.3, 3.6, z - 0.3], [x + 0.3, 4.0, z + 0.3], 'lamp', { flat: true, vary: 0 });
        glows.push([x, 3.8, z, 2.4]); lights.push({ pos: [x, 3.4, z], base: 8, ph: x, dist: 12, flicker: true });
      } else {
        B.push(new THREE.Matrix4().makeTranslation(x, 0.15, z).multiply(new THREE.Matrix4().makeRotationY(x > 0 ? 0.7 : -0.9)));
        box([-0.12, 0, 0], [0.12, 0.24, 3.4], 'metal_dark'); B.pop();
        block([x - 0.12, 0, z - 0.12], [x + 0.12, 0.8, z + 0.12], 'metal_dark', 'metal');
      }
    }

    // ---------- rooftop clutter: parapets, water tanks, AC units, vents, aerials, laundry lines ----------
    const parapet = (x0, z0, x1, z1, y, h = 0.6, mat = 'concrete') => {
      wall('x', x0, x1, z0, 0.2, y, h, mat); wall('x', x0, x1, z1 - 0.2, 0.2, y, h, mat);
      wall('z', z0 + 0.2, z1 - 0.2, x0, 0.2, y, h, mat); wall('z', z0 + 0.2, z1 - 0.2, x1 - 0.2, 0.2, y, h, mat);
    };
    const tankOnRoof = (x, y, z) => { block([x - 0.6, y, z - 0.6], [x + 0.6, y + 0.3, z + 0.6], 'metal_dark', 'metal'); block([x - 0.5, y + 0.3, z - 0.5], [x + 0.5, y + 1.5, z + 0.5], { side: 'plaster_white', top: 'metal' }, 'metal'); };
    const ac = (x, y, z) => { block([x, y, z], [x + 0.9, y + 0.6, z + 0.6], { side: 'metal', top: 'metal_dark' }, 'metal'); box([x + 0.1, y + 0.1, z + 0.6], [x + 0.5, y + 0.5, z + 0.62], 'tire', { uv: 'fit', vary: 0 }); };
    const vent = (x, y, z) => { block([x - 0.2, y, z - 0.2], [x + 0.2, y + 0.7, z + 0.2], 'metal', 'metal'); box([x - 0.3, y + 0.7, z - 0.3], [x + 0.3, y + 0.8, z + 0.3], 'metal_dark'); };
    const aerial = (x, y, z, h) => { box([x - 0.04, y, z - 0.04], [x + 0.04, y + h, z + 0.04], 'metal_dark', { vary: 0 }); for (let k = 0; k < 3; k++) box([x - 0.5 + k * 0.1, y + h * (0.55 + k * 0.15), z - 0.03], [x + 0.5 - k * 0.1, y + h * (0.55 + k * 0.15) + 0.05, z + 0.03], 'metal_dark', { vary: 0 }); };
    // apartment roof (6.85)
    parapet(-30, -32, -20, -20, 6.85, 0.7, 'brick');
    tankOnRoof(-27, 6.85, -23); ac(-24, 6.85, -30.5); ac(-22.6, 6.85, -30.5); vent(-21.5, 6.85, -25); aerial(-28.5, 6.85, -30, 3);
    for (let x = -26; x < -22; x += 0.25) box([x, 7.9, -26.02], [x + 0.18, 8.1 - (x % 0.5 ? 0.15 : 0), -25.98], ['plaster_pink', 'plaster_teal', 'plaster_white'][Math.abs(Math.round(x * 4)) % 3], { vary: 0 });
    box([-26.2, 6.85, -26.05], [-26.1, 8.2, -25.95], 'metal_dark'); box([-22, 6.85, -26.05], [-21.9, 8.2, -25.95], 'metal_dark'); box([-26.2, 8.15, -26.01], [-21.9, 8.17, -25.99], 'metal_dark', { vary: 0 });
    // shophouse roofs
    SHOPS.forEach((_, i) => {
      const x0 = -31 + i * 4.6; const y = 7.0 + i * 0.6;
      parapet(x0 - 0.1, -14.1, x0 + 4.7, -4.9, y, 0.45);
      if (i === 0) tankOnRoof(x0 + 2.3, y, -11); else if (i === 1) { ac(x0 + 1, y, -12); vent(x0 + 3.4, y, -8); } else { aerial(x0 + 3.5, y, -12.5, 2.4); ac(x0 + 0.8, y, -8.5); }
    });
    // guard post roof already has sandbags; add a searchlight and a vent
    block([15.2, 4.5, -31.4], [16, 5.2, -30.6], 'metal_dark', 'metal'); box([15.25, 5.2, -31.35], [15.95, 5.6, -30.65], 'lamp', { flat: true, vary: 0 }); vent(26.6, 4.5, -23.4);
    // kiosk, warehouse and church tower tops
    parapet(28.5, -15.5, 34.5, -6.5, 3.65, 0.4); ac(30, 3.65, -14.8); vent(33.4, 3.65, -9);
    parapet(10, 12, 32, 30, 7.3, 0.5, 'corrugated'); for (const x of [13, 17, 28]) vent(x, 7.3, 15); tankOnRoof(29.5, 7.3, 27.5); aerial(12, 7.3, 28.5, 4);

    const group = B.build({ cast: G.quality.shadow > 0, recv: true, matOpts: {
      lamp: { emissive: 0xffe9a0 }, glass_lit: { emissive: 0xffd080 }, stained: { emissive: 0x7a5a50 }, scorch: { transparent: true },
    } });
    group.name = 'world';
    scene.add(group);

    // ---------- distant ruined skyline (fog-free silhouettes, a few still burning) ----------
    const SK = new BZ.Builder('skyline'); const sk = BZ.rng('skyline');
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + sk.range(-0.05, 0.05); const r = sk.range(70, 120);
      const x = Math.cos(a) * r; const z = Math.sin(a) * r; const w = sk.range(8, 18); const d = sk.range(8, 16); const h = sk.range(14, 55);
      SK.box([x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2], 'skyline', { uvScale: 0.25, vary: 0.15 });
      if (sk.chance(0.6)) SK.box([x - w / 2, h, z - d / 2], [x - w / 2 + w * sk.range(0.3, 0.7), h + sk.range(2, 8), z + d / 2], 'skyline', { uvScale: 0.25 });
      if (sk.chance(0.25)) glows.push([x, h + 1, z, 14]);
    }
    const skyline = SK.build();
    skyline.traverse((m) => { if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ map: m.material.map, color: 0x9098a8, fog: false }); });
    scene.add(skyline);

    // ---------- light pools and fire glows ----------
    const glowMat = new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: 0xffa050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const [x, y, z, s] of glows) { const sp = new THREE.Sprite(glowMat); sp.position.set(x, y, z); sp.scale.set(s, s, 1); scene.add(sp); }
    const maxLights = G.quality.name === 'low' ? 3 : G.quality.name === 'medium' ? 7 : 10;
    lights.sort((a, b) => (b.fire ? 1 : 0) - (a.fire ? 1 : 0));
    lights.slice(0, maxLights).forEach((o) => { o.l = new THREE.PointLight(o.color || (o.fire ? 0xff8a30 : 0xffb060), o.base, o.dist, 1.6); o.l.position.set(...o.pos); scene.add(o.l); });

    // ---------- sky dome with a fire-lit horizon, smoke clouds ----------
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x0a1230) }, horizon: { value: new THREE.Color(0x30384e) }, sunDir: { value: new THREE.Vector3(-0.45, 0.42, -0.62).normalize() },
        bodyCol: { value: new THREE.Color(0xf2f0e6) }, bodySize: { value: 0.032 }, starK: { value: 1 }, glowK: { value: 1 }, flash: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 bodyCol; uniform float bodySize; uniform float starK; uniform float glowK; uniform float flash; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.6));
        float az = atan(d.x, d.z); c += vec3(0.55, 0.22, 0.06) * glowK * pow(1.0 - h, 7.0) * (0.45 + 0.55 * max(0.0, sin(az * 3.0 + 1.0)));
        vec2 g = floor(d.xz / max(d.y, 0.05) * 40.0); float st = hash(g);
        if (st > 0.988 && d.y > 0.18) c += vec3(0.75, 0.8, 1.0) * (st - 0.988) * 45.0 * h * starK;
        vec3 sd = normalize(sunDir); vec3 ux = normalize(cross(sd, vec3(0.0, 1.0, 0.0))); vec3 uy = cross(ux, sd);
        float fwd = dot(d, sd); vec2 m = vec2(dot(d, ux), dot(d, uy)) / max(fwd, 0.01);
        c += bodyCol * 0.6 * pow(max(fwd, 0.0), 300.0 * (0.032 / bodySize)) * 0.6 + bodyCol * 0.25 * pow(max(fwd, 0.0), 30.0) * (bodySize > 0.04 ? 1.0 : 0.0);
        if (fwd > 0.0 && max(abs(m.x), abs(m.y)) < bodySize) c = (abs(m.x) > bodySize * 0.69 || abs(m.y) > bodySize * 0.69) ? bodyCol * 0.86 : bodyCol;
        if (d.y < 0.0) c = horizon * 0.9; c = mix(c, vec3(0.85, 0.9, 1.0), flash); gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat);
    sky.name = 'sky';
    scene.add(sky);
    const CB = new BZ.Builder('clouds'); const cr = BZ.rng('clouds');
    for (let i = 0; i < 22; i++) {
      const x = cr.range(-180, 180); const z = cr.range(-180, 180); const w = cr.range(10, 26); const d = cr.range(6, 16);
      CB.box([x, 60, z], [x + w, 62, z + d], 'cloud', { flat: true, vary: 0.03 });
      if (cr.chance(0.6)) CB.box([x + w * 0.2, 62, z + d * 0.2], [x + w * 0.7, 63.5, z + d * 0.7], 'cloud', { flat: true });
    }
    const clouds = CB.build();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0x4a4e5e, fog: false, transparent: true, opacity: 0.85 });
    clouds.traverse((m) => { if (m.isMesh) m.material = cloudMat; });
    scene.add(clouds);

    // ---------- spatial hash for collision ----------
    const HC = 4; const hash = new Map(); let stamp = 1;
    const cellsOf = (min, max, fn) => {
      for (let cx = Math.floor(min[0] / HC); cx <= Math.floor(max[0] / HC); cx++) for (let cz = Math.floor(min[2] / HC); cz <= Math.floor(max[2] / HC); cz++) fn(cx * 4096 + cz);
    };
    for (const s of solids) { s.mark = 0; cellsOf(s.min, s.max, (k) => { if (!hash.has(k)) hash.set(k, []); hash.get(k).push(s); }); }
    function overlaps(min, max) {
      stamp++; let hit = null;
      cellsOf(min, max, (k) => {
        if (hit) return; const list = hash.get(k); if (!list) return;
        for (const s of list) {
          if (s.mark === stamp) continue; s.mark = stamp;
          if (max[0] > s.min[0] && min[0] < s.max[0] && max[1] > s.min[1] && min[1] < s.max[1] && max[2] > s.min[2] && min[2] < s.max[2]) { hit = s; return; }
        }
      });
      return hit;
    }

    // ---------- walk grid (for zombie flow field) ----------
    const N = GRID_HALF * 2;
    const blocked = new Uint8Array(N * N);
    const idx = (cx, cz) => cz * N + cx;
    const toCell = (v) => Math.floor(v + GRID_HALF);
    for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) {
      const x = cx - GRID_HALF + 0.5; const z = cz - GRID_HALF + 0.5;
      const inside = Math.abs(x) < HALF && Math.abs(z) < HALF;
      const corridor = (Math.abs(x) < 3 && Math.abs(z) < GRID_HALF) || (Math.abs(z) < 3 && Math.abs(x) < GRID_HALF);
      if (!inside && !corridor) blocked[idx(cx, cz)] = 1;
    }
    const RZ = 0.3;
    for (const s of solids) {
      if (s.min[1] > 1.6) continue;
      for (let cz = toCell(s.min[2] - RZ); cz <= toCell(s.max[2] + RZ); cz++) for (let cx = toCell(s.min[0] - RZ); cx <= toCell(s.max[0] + RZ); cx++) {
        if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
        const x = cx - GRID_HALF + 0.5; const z = cz - GRID_HALF + 0.5;
        if (x > s.min[0] - RZ && x < s.max[0] + RZ && z > s.min[2] - RZ && z < s.max[2] + RZ) blocked[idx(cx, cz)] = 1;
      }
    }
    const dist = new Float32Array(N * N);
    const queue = new Int32Array(N * N * 2);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    function updateFlow(px, pz) {
      dist.fill(1e9);
      let head = 0; let tail = 0;
      const seed = (cx, cz) => { if (cx < 0 || cz < 0 || cx >= N || cz >= N) return; const i = idx(cx, cz); if (!blocked[i] && dist[i] > 0) { dist[i] = 0; queue[tail++] = i; } };
      const pcx = toCell(px); const pcz = toCell(pz);
      seed(pcx, pcz);
      for (let r = 1; r < 6 && !tail; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) seed(pcx + dx, pcz + dz);
      while (head < tail) {
        const i = queue[head++]; const cx = i % N; const cz = (i / N) | 0; const d0 = dist[i];
        for (const [dx, dz, c] of DIRS) {
          const nx = cx + dx; const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const j = idx(nx, nz);
          if (blocked[j]) continue;
          if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue;
          if (d0 + c < dist[j] - 1e-3) {
            dist[j] = d0 + c;
            if (tail >= queue.length) { queue.copyWithin(0, head, tail); tail -= head; head = 0; }
            queue[tail++] = j;
          }
        }
      }
    }
    const flowDir = (x, z, out) => {
      const cx = toCell(x); const cz = toCell(z);
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) { out[0] = -x; out[1] = -z; return false; }
      let best = dist[idx(cx, cz)]; let bx = 0; let bz = 0;
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx; const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = idx(nx, nz);
        if (blocked[j]) continue;
        if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue;
        if (dist[j] < best) { best = dist[j]; bx = dx; bz = dz; }
      }
      if (!bx && !bz) { out[0] = 0; out[1] = 0; return false; }
      out[0] = cx + bx - GRID_HALF + 0.5 - x; out[1] = cz + bz - GRID_HALF + 0.5 - z;
      return true;
    };

    // Move an upright box (radius r, height h, feet at pos.y) by vel*dt, axis by axis.
    // stepH lets the mover climb ledges up to that height (stairs); out.stepUp reports the rise.
    function moveBox(pos, vel, dt, r, h, out, stepH = 0) {
      out.ground = false; out.hitX = false; out.hitZ = false; out.ceil = false; out.stepUp = 0;
      const min = [0, 0, 0]; const max = [0, 0, 0];
      const set = () => { min[0] = pos.x - r; min[1] = pos.y; min[2] = pos.z - r; max[0] = pos.x + r; max[1] = pos.y + h; max[2] = pos.z + r; };
      const axis = (a, d) => {
        if (!d) return;
        pos[a] += d; set();
        const s = overlaps(min, max);
        if (!s) return;
        if (a !== 'y' && stepH) {
          const rise = s.max[1] - pos.y;
          if (rise > 0 && rise <= stepH) {
            const oy = pos.y; pos.y = s.max[1] + 1e-3; set();
            if (!overlaps(min, max)) { out.stepUp += pos.y - oy; return; }
            pos.y = oy; set();
          }
        }
        const k = a === 'x' ? 0 : a === 'y' ? 1 : 2;
        if (d > 0) pos[a] = s.min[k] - (a === 'y' ? h : r) - 1e-4;
        else pos[a] = s.max[k] + (a === 'y' ? 0 : r) + 1e-4;
        if (a === 'y') { if (d < 0) out.ground = true; else out.ceil = true; vel.y = 0; } else { out['hit' + a.toUpperCase()] = true; }
      };
      const steps = Math.max(1, Math.ceil((Math.abs(vel.x) + Math.abs(vel.z) + Math.abs(vel.y)) * dt / (r * 0.8)));
      const h2 = dt / steps;
      for (let i = 0; i < steps; i++) { axis('x', vel.x * h2); axis('z', vel.z * h2); axis('y', vel.y * h2); }
      if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; out.ground = true; }
      return out;
    }

    // Ray vs the solids in the hash cells along the ray, and the ground. Returns {t, normal, tag} or null.
    const rayBox = (o, d, s, maxT) => {
      let t0 = 0; let t1 = maxT; let axisHit = -1; let sgn = 0;
      for (let k = 0; k < 3; k++) {
        const oo = k === 0 ? o.x : k === 1 ? o.y : o.z; const dd = k === 0 ? d.x : k === 1 ? d.y : d.z;
        if (Math.abs(dd) < 1e-9) { if (oo < s.min[k] || oo > s.max[k]) return null; continue; }
        let a = (s.min[k] - oo) / dd; let b = (s.max[k] - oo) / dd; let sg = -1;
        if (a > b) { const tt = a; a = b; b = tt; sg = 1; }
        if (a > t0) { t0 = a; axisHit = k; sgn = sg; }
        if (b < t1) t1 = b;
        if (t0 > t1) return null;
      }
      if (axisHit < 0) return null;
      const n = [0, 0, 0]; n[axisHit] = sgn;
      return { t: t0, n };
    };
    function raycast(o, d, maxT) {
      let best = null;
      stamp++;
      const len = Math.min(maxT, 160); const stepLen = HC * 0.5;
      for (let t = 0; t <= len + stepLen; t += stepLen) {
        if (best && t > best.t + HC) break;
        const tt = Math.min(t, len);
        const cx0 = Math.floor((o.x + d.x * tt) / HC); const cz0 = Math.floor((o.z + d.z * tt) / HC);
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const list = hash.get((cx0 + ox) * 4096 + (cz0 + oz)); if (!list) continue;
          for (const s of list) {
            if (s.mark === stamp) continue; s.mark = stamp;
            const h = rayBox(o, d, s, best ? best.t : maxT);
            if (h && (!best || h.t < best.t)) best = { t: h.t, normal: h.n, tag: s.tag };
          }
        }
      }
      if (d.y < -1e-6) {
        const t = -o.y / d.y;
        if (t > 0 && t < (best ? best.t : maxT)) best = { t, normal: [0, 1, 0], tag: 'stone' };
      }
      return best;
    }
    const lineOfSight = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); d.divideScalar(len);
      const h = raycast(a, d, len);
      return !h || h.t >= len - 0.05;
    };

    // ---------- fires: flicker lights, emit flame and smoke ----------
    const FIRE_COL = [0xfff0a0, 0xffc040, 0xff7a20, 0xe04a18]; const SMOKE_COL = [0x2a2a2e, 0x3a3a3e, 0x4a4a4e];
    const up = new THREE.Vector3(0, 1, 0); const tmp = new THREE.Vector3(); let clock = 0; let nightK = 1;
    function update(dt) {
      clock += dt;
      for (const o of lights) if (o.l) o.l.intensity = o.fire ? o.base * (0.75 + 0.15 * Math.sin(clock * 9 + o.ph) + 0.1 * Math.sin(clock * 23 + o.ph * 2))
        : (o.flicker ? o.base * (Math.sin(clock * 13 + o.ph) > -0.85 ? 1 : 0.15) : o.base) * nightK;
      const k = G.quality.particles;
      for (const f of fires) {
        f.t += dt * k;
        while (f.t > 0.07) {
          f.t -= 0.07;
          tmp.set(f.pos.x + G.rng.range(-0.5, 0.5) * f.size, f.pos.y, f.pos.z + G.rng.range(-0.5, 0.5) * f.size);
          G.fx.burst(tmp, 1, FIRE_COL, { dir: up, push: 1.6 * f.size, speed: 0.6, size: 0.18 * f.size, life: 0.55, grav: -2, bounce: 0 });
          if (f.smoke && G.rng.chance(0.45)) G.fx.burst(tmp.add(up), 1, SMOKE_COL, { dir: up, push: 1.2, speed: 0.4, size: 0.42 * f.size, life: 3, grav: -0.6, bounce: 0, drag: 0.4 });
        }
      }
    }

    const spawns = GATES.map((g) => ({ name: g.name, x: g.dir[0] * (GRID_HALF - 1.5), z: g.dir[1] * (GRID_HALF - 1.5), dir: g.dir }));
    // what the day/night cycle turns down by day: street lamps, lit windows, lamp glass
    const nightMats = []; group.traverse((m) => { if (m.isMesh) for (const mt of [].concat(m.material)) if (/^(lamp|glass_lit)/.test(mt.name)) nightMats.push({ mt, base: mt.emissive.clone() }); });
    function setNight(k) {
      nightK = k;
      for (const o of nightMats) o.mt.emissive.copy(o.base).multiplyScalar(0.15 + 0.85 * k);
      // by day the far skyline sits in the smog: let fog take it so it reads as distant haze, not black towers
      skyline.traverse((m) => { if (!m.isMesh) return; const f = k < 0.5; if (m.material.fog !== f) { m.material.fog = f; m.material.needsUpdate = true; } m.material.color.setHex(f ? 0xb8c2d0 : 0x9098a8); });
    }
    return { update, solids, raycast, lineOfSight, moveBox, overlaps, updateFlow, flowDir, spawns, HALF, group, sky, clouds, setNight, cloudMat,
      isBlocked: (x, z) => { const cx = toCell(x); const cz = toCell(z); return cx < 0 || cz < 0 || cx >= N || cz >= N || !!blocked[idx(cx, cz)]; } };
  };
})();
