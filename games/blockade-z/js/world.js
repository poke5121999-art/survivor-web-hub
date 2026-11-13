// The arena: a hand-placed walled town plaza with four gates. Layout is a table;
// the seed only varies tints. Also owns collision (AABBs), the walk grid and raycasts.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const HALF = 36;          // inner wall line
  const GRID_HALF = 46;     // walk grid covers the gate corridors too
  const CELL = 1;

  const LAYOUT = {
    houses: [
      { x: -24, z: -24, w: 10, d: 8, h: 5, wall: 'brick', roof: 'roof_red', door: 'pz' },
      { x: -14, z: -28, w: 6, d: 6, h: 4, wall: 'plank', roof: 'roof_green', door: 'pz' },
      { x: 22, z: -22, w: 8, d: 10, h: 5, wall: 'plank', roof: 'roof_blue', door: 'nx' },
      { x: 28, z: -10, w: 6, d: 5, h: 4, wall: 'brick', roof: 'roof_red', door: 'nx' },
      { x: -22, z: 22, w: 9, d: 9, h: 6, wall: 'stone', roof: 'roof_green', door: 'px' },
      { x: -28, z: 11, w: 5, d: 6, h: 4, wall: 'plank', roof: 'roof_red', door: 'px' },
      { x: 24, z: 24, w: 10, d: 8, h: 5, wall: 'brick', roof: 'roof_blue', door: 'nz' },
      { x: 13, z: 28, w: 6, d: 6, h: 4, wall: 'stone', roof: 'roof_red', door: 'nz' },
    ],
    crates: [
      [6, -12, 'crate', 1], [7, -12, 'crate', 2], [6, -13, 'crate', 1],
      [-7, 12, 'crate_metal', 1], [-8, 12, 'crate_metal', 1], [-8, 13, 'crate', 2],
      [12, 7, 'crate', 1], [13, 7, 'crate', 1], [13, 6, 'crate_metal', 2],
      [-12, -7, 'crate_metal', 1], [-13, -7, 'crate', 1], [-13, -6, 'crate', 2],
      [3, 26, 'crate', 1], [-3, -26, 'crate_metal', 1], [26, -3, 'crate', 1], [-26, 3, 'crate_metal', 1],
      [16, 16, 'crate', 1], [-16, -16, 'crate', 1], [17, -16, 'crate_metal', 1], [-17, 16, 'crate', 1],
    ],
    barricades: [
      // low plank walls (0.9 m) you can shoot over
      { min: [-6, 0, 9], max: [-3, 0.9, 9.6] }, { min: [3, 0, -9.6], max: [6, 0.9, -9] },
      { min: [9, 0, 3], max: [9.6, 0.9, 6] }, { min: [-9.6, 0, -6], max: [-9, 0.9, -3] },
    ],
    cars: [
      [6, 20, 0, 'car_red'], [-19, 4, 1, 'car_blue'], [18, -5, 1, 'car_yellow'], [-7, -22, 0, 'car_red'],
    ],
    trees: [
      [-32, -32, 4], [-31, -16, 3], [-32, 30, 4], [-18, 32, 3], [32, 32, 4], [31, 14, 3],
      [32, -31, 4], [18, -32, 3], [-8, 32, 3], [8, -32, 4], [-32, -4, 3], [32, 4, 3],
    ],
    lamps: [[-10.5, -10.5], [10.5, -10.5], [-10.5, 10.5], [10.5, 10.5], [2.8, 22], [-2.8, -22], [22, -2.8], [-22, 2.8]],
    gates: [
      { name: 'BẮC', dir: [0, -1] }, { name: 'NAM', dir: [0, 1] }, { name: 'TÂY', dir: [-1, 0] }, { name: 'ĐÔNG', dir: [1, 0] },
    ],
  };

  BZ.makeWorld = (G) => {
    const solids = [];
    const solid = (min, max, tag = 'stone') => { solids.push({ min, max, tag }); };
    const B = new BZ.Builder('world');
    const scene = G.scene;

    // Ground: grass everywhere, cobble plaza and streets on top.
    B.box([-90, -1, -90], [90, 0, 90], { top: 'grass_top', side: 'dirt' }, { skip: ['ny', 'px', 'nx', 'pz', 'nz'], vary: 0 });
    B.box([-10, -0.5, -10], [10, 0.02, 10], 'cobble', { vary: 0, skip: ['ny'] });
    for (const [x0, z0, x1, z1] of [[-2, 10, 2, 46], [-2, -46, 2, -10], [10, -2, 46, 2], [-46, -2, -10, 2]]) {
      B.box([x0, -0.5, z0], [x1, 0.02, z1], 'asphalt', { vary: 0, skip: ['ny'] });
      const alongZ = x1 - x0 < z1 - z0; const lo = alongZ ? z0 : x0; const hi = alongZ ? z1 : x1;
      for (let t = lo + 0.75; t < hi - 1.5; t += 3) {
        if (alongZ) B.box([-0.09, 0.02, t], [0.09, 0.03, t + 1.5], 'road_line', { uv: 'fit', vary: 0, skip: ['ny'] });
        else B.box([t, 0.02, -0.09], [t + 1.5, 0.03, 0.09], 'road_line', { uv: 'fit', vary: 0, skip: ['ny'] });
      }
    }

    // Fountain
    const ring = [[-2.5, -2.5, 2.5, -2], [-2.5, 2, 2.5, 2.5], [-2.5, -2, -2, 2], [2, -2, 2.5, 2]];
    for (const [x0, z0, x1, z1] of ring) { B.box([x0, 0, z0], [x1, 0.8, z1], 'stone'); }
    B.box([-2, 0, -2], [2, 0.5, 2], { top: 'water', side: 'stone' }, { vary: 0, flat: true });
    B.box([-0.5, 0, -0.5], [0.5, 2.6, 0.5], 'stone');
    B.box([-0.9, 2.6, -0.9], [0.9, 2.9, 0.9], 'stone');
    solid([-2.5, 0, -2.5], [2.5, 0.8, 2.5]);
    solid([-0.5, 0.8, -0.5], [0.5, 2.9, 0.5]);

    // Perimeter wall with four 4 m gates and corridors out to the spawn points.
    const WALL_H = 4.5;
    const wallSeg = (min, max) => { B.box(min, max, { top: 'stone', side: 'stone' }); solid(min, max); };
    for (const s of [-1, 1]) {
      wallSeg([-HALF - 1, 0, s > 0 ? HALF : -HALF - 1], [-2, WALL_H, s > 0 ? HALF + 1 : -HALF]);
      wallSeg([2, 0, s > 0 ? HALF : -HALF - 1], [HALF + 1, WALL_H, s > 0 ? HALF + 1 : -HALF]);
      wallSeg([s > 0 ? HALF : -HALF - 1, 0, -HALF], [s > 0 ? HALF + 1 : -HALF, WALL_H, -2]);
      wallSeg([s > 0 ? HALF : -HALF - 1, 0, 2], [s > 0 ? HALF + 1 : -HALF, WALL_H, HALF]);
      // corridors
      wallSeg([-3, 0, s > 0 ? HALF + 1 : -GRID_HALF], [-2, 3.2, s > 0 ? GRID_HALF : -HALF - 1]);
      wallSeg([2, 0, s > 0 ? HALF + 1 : -GRID_HALF], [3, 3.2, s > 0 ? GRID_HALF : -HALF - 1]);
      wallSeg([s > 0 ? HALF + 1 : -GRID_HALF, 0, -3], [s > 0 ? GRID_HALF : -HALF - 1, 3.2, -2]);
      wallSeg([s > 0 ? HALF + 1 : -GRID_HALF, 0, 2], [s > 0 ? GRID_HALF : -HALF - 1, 3.2, 3]);
    }
    // battlements
    for (let i = -HALF; i < HALF; i += 2) {
      for (const [x, z] of [[i, -HALF - 1], [i, HALF], [-HALF - 1, i], [HALF, i]]) {
        if (Math.abs(i + 0.5) < 3) continue;
        B.box([x, WALL_H, z], [x + 1, WALL_H + 0.6, z + 1], 'stone');
      }
    }
    // gate arches
    for (const g of LAYOUT.gates) {
      const [dx, dz] = g.dir;
      const cx = dx * (HALF + 0.5); const cz = dz * (HALF + 0.5);
      const ax = dz !== 0 ? 2.5 : 0.7; const az = dx !== 0 ? 2.5 : 0.7;
      B.box([cx - ax, WALL_H - 0.6, cz - az], [cx + ax, WALL_H + 0.9, cz + az], 'brick');
    }

    // Houses
    for (const h of LAYOUT.houses) {
      const min = [h.x - h.w / 2, 0, h.z - h.d / 2]; const max = [h.x + h.w / 2, h.h, h.z + h.d / 2];
      B.box(min, max, { side: h.wall, top: h.roof });
      solid(min, max, h.wall);
      // corner posts
      for (const [x, z] of [[min[0], min[2]], [max[0] - 0.4, min[2]], [min[0], max[2] - 0.4], [max[0] - 0.4, max[2] - 0.4]]) {
        B.box([x - 0.05, 0, z - 0.05], [x + 0.45, h.h + 0.05, z + 0.45], { side: 'log', top: 'log_top' });
      }
      // stepped roof
      let inset = -0.5; let y = h.h;
      for (let i = 0; i < 3; i++) {
        const rmin = [min[0] - inset, y, min[2] - inset]; const rmax = [max[0] + inset, y + 0.7, max[2] + inset];
        if (rmax[0] - rmin[0] < 1 || rmax[2] - rmin[2] < 1) break;
        B.box(rmin, rmax, h.roof);
        inset += 1.1; y += 0.7;
      }
      // door and windows on each face
      const faces = { px: [max[0], 'z'], nx: [min[0], 'z'], pz: [max[2], 'x'], nz: [min[2], 'x'] };
      for (const [f, [plane, axis]] of Object.entries(faces)) {
        const sign = f[0] === 'p' ? 1 : -1;
        const lo = axis === 'z' ? min[2] : min[0]; const hi = axis === 'z' ? max[2] : max[0];
        const mid = (lo + hi) / 2;
        const put = (a0, a1, y0, y1, key) => {
          const p0 = plane + (sign > 0 ? 0 : -0.06); const p1 = plane + (sign > 0 ? 0.06 : 0);
          const bmin = axis === 'z' ? [p0, y0, a0] : [a0, y0, p0];
          const bmax = axis === 'z' ? [p1, y1, a1] : [a1, y1, p1];
          B.box(bmin, bmax, key, { uv: 'fit', vary: 0 });
        };
        if (f === h.door) put(mid - 0.6, mid + 0.6, 0, 2.2, 'door');
        for (let a = lo + 1.4; a < hi - 1.4; a += 2.6) {
          if (f === h.door && Math.abs(a + 0.5 - mid) < 1.3) continue;
          put(a, a + 1, 2.6, 3.6, B.rng.chance(0.45) ? 'glass_lit' : 'glass');
        }
      }
    }

    // Crates
    for (const [x, z, key, stack] of LAYOUT.crates) {
      for (let i = 0; i < stack; i++) B.box([x, i, z], [x + 1, i + 1, z + 1], key, { uv: 'fit' });
      solid([x, 0, z], [x + 1, stack, z + 1], key === 'crate' ? 'wood' : 'metal');
    }
    for (const b of LAYOUT.barricades) { B.box(b.min, b.max, 'plank'); solid(b.min, b.max, 'wood'); }

    // Cars (rot 0 = long along x, 1 = long along z)
    for (const [x, z, rot, paint] of LAYOUT.cars) {
      const L = 4.2; const W = 2;
      const hx = rot ? W / 2 : L / 2; const hz = rot ? L / 2 : W / 2;
      B.box([x - hx, 0.35, z - hz], [x + hx, 1.15, z + hz], paint);
      const cx = rot ? W / 2 - 0.1 : 1.15; const cz = rot ? 1.15 : W / 2 - 0.1;
      B.box([x - cx, 1.15, z - cz], [x + cx, 1.85, z + cz], { side: 'glass', top: paint }, { uv: 'fit' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wx = x + sx * (rot ? W / 2 : L / 2 - 0.8); const wz = z + sz * (rot ? L / 2 - 0.8 : W / 2);
        B.box([wx - 0.35, 0, wz - 0.35], [wx + 0.35, 0.7, wz + 0.35], 'tire', { uv: 'fit' });
      }
      solid([x - hx, 0, z - hz], [x + hx, 1.85, z + hz], 'metal');
    }

    // Trees
    for (const [x, z, h] of LAYOUT.trees) {
      B.box([x, 0, z], [x + 1, h, z + 1], { side: 'log', top: 'log_top' });
      B.box([x - 1.5, h - 0.5, z - 1.5], [x + 2.5, h + 2, z + 2.5], 'leaves');
      B.box([x - 0.5, h + 2, z - 0.5], [x + 1.5, h + 3, z + 1.5], 'leaves');
      solid([x, 0, z], [x + 1, h, z + 1], 'wood');
      solid([x - 1.5, h - 0.5, z - 1.5], [x + 2.5, h + 2, z + 2.5], 'leaves');
    }
    // Distant trees outside the wall (visual only)
    const far = BZ.rng('far-trees');
    for (let i = 0; i < 46; i++) {
      const ang = far.next() * Math.PI * 2; const r = far.range(42, 70);
      const x = Math.round(Math.cos(ang) * r); const z = Math.round(Math.sin(ang) * r);
      if (Math.abs(x) < 5 || Math.abs(z) < 5) continue;
      const h = far.int(3, 6);
      B.box([x, 0, z], [x + 1, h, z + 1], { side: 'log', top: 'log_top' });
      B.box([x - 1.5, h - 0.5, z - 1.5], [x + 2.5, h + 2.5, z + 2.5], 'leaves');
    }

    // Lamp posts
    for (const [x, z] of LAYOUT.lamps) {
      B.box([x - 0.12, 0, z - 0.12], [x + 0.12, 3.6, z + 0.12], 'metal_dark');
      B.box([x - 0.3, 3.6, z - 0.3], [x + 0.3, 4.0, z + 0.3], 'lamp', { flat: true, vary: 0 });
      solid([x - 0.12, 0, z - 0.12], [x + 0.12, 4, z + 0.12], 'metal');
    }

    const BRAZIERS = [[-7, -7], [7, -7], [-7, 7], [7, 7]];
    for (const [x, z] of BRAZIERS) {
      B.box([x - 0.5, 0, z - 0.5], [x + 0.5, 0.25, z + 0.5], 'stone');
      B.box([x - 0.25, 0.25, z - 0.25], [x + 0.25, 0.75, z + 0.25], 'stone');
      B.box([x - 0.6, 0.75, z - 0.6], [x + 0.6, 1.1, z + 0.6], 'metal_dark');
      solid([x - 0.6, 0, z - 0.6], [x + 0.6, 1.1, z + 0.6], 'metal');
    }
    const group = B.build({ cast: G.quality.shadow > 0, recv: true, matOpts: { lamp: { emissive: 0xffe9a0 }, water: { emissive: 0x0a1a30 }, glass_lit: { emissive: 0xffd080 } } });
    group.name = 'world';
    scene.add(group);

    // Warm light pools: lamps and braziers, the only warm colour in a cold night.
    const lights = [];
    const glowMat = new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const nLamps = G.quality.name === 'low' ? 0 : LAYOUT.lamps.length;
    LAYOUT.lamps.forEach(([x, z], i) => {
      const s = new THREE.Sprite(glowMat); s.position.set(x, 3.8, z); s.scale.set(2.6, 2.6, 1); scene.add(s);
      if (i < nLamps) { const l = new THREE.PointLight(0xffb060, 9, 13, 1.6); l.position.set(x, 3.4, z); scene.add(l); lights.push({ l, base: 9, ph: i }); }
    });
    const fireMat = new THREE.MeshBasicMaterial({ map: BZ.tex('fire'), fog: false });
    const fires = [];
    BRAZIERS.forEach(([x, z], i) => {
      const f = new THREE.Group();
      for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), fireMat); c.position.set((k % 3 - 1) * 0.25, 0.2, (k > 2 ? 0.2 : -0.12)); f.add(c); }
      f.position.set(x, 1.1, z); scene.add(f); fires.push(f);
      const s = new THREE.Sprite(glowMat); s.position.set(x, 1.6, z); s.scale.set(3.2, 3.2, 1); scene.add(s);
      const l = new THREE.PointLight(0xff8a30, 12, 11, 1.6); l.position.set(x, 1.9, z); scene.add(l); lights.push({ l, base: 12, ph: 10 + i * 3, fire: true });
    });
    const flicker = (t) => {
      for (const o of lights) if (o.fire) o.l.intensity = o.base * (0.82 + 0.12 * Math.sin(t * 9 + o.ph) + 0.08 * Math.sin(t * 23 + o.ph * 2));
      fires.forEach((f, i) => f.children.forEach((c, k) => { c.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(t * 7 + k * 1.7 + i)); c.position.y = 0.2 * c.scale.y; }));
    };

    // Sky dome + pixel clouds
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x0a1534) }, horizon: { value: new THREE.Color(0x2c4366) }, sunDir: { value: new THREE.Vector3(-0.45, 0.42, -0.62).normalize() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.6));
        vec2 g = floor(d.xz / max(d.y, 0.05) * 40.0); float st = hash(g);
        if (st > 0.985 && d.y > 0.12) c += vec3(0.75, 0.8, 1.0) * (st - 0.985) * 50.0 * h;
        vec3 sd = normalize(sunDir); vec3 ux = normalize(cross(sd, vec3(0.0, 1.0, 0.0))); vec3 uy = cross(ux, sd);
        float fwd = dot(d, sd); vec2 m = vec2(dot(d, ux), dot(d, uy)) / max(fwd, 0.01);
        c += vec3(0.55, 0.65, 1.0) * pow(max(fwd, 0.0), 300.0) * 0.6;
        if (fwd > 0.0 && max(abs(m.x), abs(m.y)) < 0.032) c = (abs(m.x) > 0.022 || abs(m.y) > 0.022) ? vec3(0.8, 0.85, 0.95) : vec3(0.97, 0.98, 1.0);
        if (d.y < 0.0) c = horizon * 0.9; gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat);
    sky.name = 'sky';
    scene.add(sky);
    const CB = new BZ.Builder('clouds');
    const cr = BZ.rng('clouds');
    for (let i = 0; i < 22; i++) {
      const x = cr.range(-180, 180); const z = cr.range(-180, 180); const w = cr.range(10, 26); const d = cr.range(6, 16);
      CB.box([x, 60, z], [x + w, 62, z + d], 'cloud', { flat: true, vary: 0.03 });
      if (cr.chance(0.6)) CB.box([x + w * 0.2, 62, z + d * 0.2], [x + w * 0.7, 63.5, z + d * 0.7], 'cloud', { flat: true });
    }
    const clouds = CB.build();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0x5d6f96, fog: false, transparent: true, opacity: 0.85 });
    clouds.traverse((m) => { if (m.isMesh) m.material = cloudMat; });
    scene.add(clouds);

    // ---- walk grid (for zombie flow field) ----
    const N = GRID_HALF * 2;
    const blocked = new Uint8Array(N * N);
    const idx = (cx, cz) => cz * N + cx;
    const toCell = (v) => Math.floor((v + GRID_HALF) / CELL);
    for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) {
      const x = cx - GRID_HALF + 0.5; const z = cz - GRID_HALF + 0.5;
      const inside = Math.abs(x) < HALF && Math.abs(z) < HALF;
      const corridor = (Math.abs(x) < 2 && Math.abs(z) < GRID_HALF) || (Math.abs(z) < 2 && Math.abs(x) < GRID_HALF);
      if (!inside && !corridor) blocked[idx(cx, cz)] = 1;
    }
    const R = 0.35;
    for (const s of solids) {
      if (s.min[1] > 1.6) continue;
      for (let cz = toCell(s.min[2] - R); cz <= toCell(s.max[2] + R); cz++) for (let cx = toCell(s.min[0] - R); cx <= toCell(s.max[0] + R); cx++) {
        if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
        const x = cx - GRID_HALF + 0.5; const z = cz - GRID_HALF + 0.5;
        if (x > s.min[0] - R && x < s.max[0] + R && z > s.min[2] - R && z < s.max[2] + R) blocked[idx(cx, cz)] = 1;
      }
    }

    // Flow field: BFS distance from the player's cell, 8-way without corner cutting.
    const dist = new Float32Array(N * N);
    const queue = new Int32Array(N * N);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    function updateFlow(px, pz) {
      dist.fill(1e9);
      let head = 0; let tail = 0;
      const seed = (cx, cz) => { if (cx < 0 || cz < 0 || cx >= N || cz >= N) return; const i = idx(cx, cz); if (!blocked[i] && dist[i] > 0) { dist[i] = 0; queue[tail++] = i; } };
      const pcx = toCell(px); const pcz = toCell(pz);
      seed(pcx, pcz);
      if (!tail) for (let r = 1; r < 4 && !tail; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) seed(pcx + dx, pcz + dz);
      // Dijkstra-lite: BFS by rings is fine at this size; diagonal cost handled by relaxation re-queue.
      while (head < tail) {
        const i = queue[head++]; const cx = i % N; const cz = (i / N) | 0; const d0 = dist[i];
        for (const [dx, dz, c] of DIRS) {
          const nx = cx + dx; const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const j = idx(nx, nz);
          if (blocked[j]) continue;
          if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue;
          if (d0 + c < dist[j] - 1e-3) { dist[j] = d0 + c; if (tail < queue.length) queue[tail++] = j; else { queue.copyWithin(0, head, tail); tail -= head; head = 0; queue[tail++] = j; } }
        }
      }
    }
    // Direction to walk from (x,z): toward the lowest-distance neighbour.
    const flowDir = (x, z, out) => {
      const cx = toCell(x); const cz = toCell(z);
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) { out[0] = -x; out[1] = -z; return false; }
      let best = dist[idx(cx, cz)]; let bx = 0; let bz = 0;
      for (const [dx, dz, c] of DIRS) {
        const nx = cx + dx; const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = idx(nx, nz);
        if (blocked[j]) continue;
        if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue;
        if (dist[j] < best) { best = dist[j]; bx = dx; bz = dz; }
      }
      if (!bx && !bz) { out[0] = 0; out[1] = 0; return false; }
      const tx = cx + bx - GRID_HALF + 0.5; const tz = cz + bz - GRID_HALF + 0.5;
      out[0] = tx - x; out[1] = tz - z;
      return true;
    };

    // ---- collision helpers ----
    function overlaps(min, max) {
      for (const s of solids) {
        if (max[0] > s.min[0] && min[0] < s.max[0] && max[1] > s.min[1] && min[1] < s.max[1] && max[2] > s.min[2] && min[2] < s.max[2]) return s;
      }
      return null;
    }
    // Move an upright box (radius r, height h, feet at pos.y) by vel*dt, axis by axis.
    function moveBox(pos, vel, dt, r, h, out) {
      out.ground = false; out.hitX = false; out.hitZ = false; out.ceil = false;
      const min = [0, 0, 0]; const max = [0, 0, 0];
      const set = () => { min[0] = pos.x - r; min[1] = pos.y; min[2] = pos.z - r; max[0] = pos.x + r; max[1] = pos.y + h; max[2] = pos.z + r; };
      const axis = (a, d) => {
        if (!d) return;
        pos[a] += d; set();
        const s = overlaps(min, max);
        if (!s) return;
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

    // Ray vs every solid and the ground. Returns {t, normal, tag} or null.
    const rayBox = (o, d, s, maxT) => {
      let t0 = 0; let t1 = maxT; let axisHit = -1; let sign = 0;
      for (let k = 0; k < 3; k++) {
        const ok = k === 0 ? 'x' : k === 1 ? 'y' : 'z';
        const oo = o[ok]; const dd = d[ok];
        if (Math.abs(dd) < 1e-9) { if (oo < s.min[k] || oo > s.max[k]) return null; continue; }
        let a = (s.min[k] - oo) / dd; let b = (s.max[k] - oo) / dd; let sg = -1;
        if (a > b) { const tt = a; a = b; b = tt; sg = 1; }
        if (a > t0) { t0 = a; axisHit = k; sign = sg; }
        if (b < t1) t1 = b;
        if (t0 > t1) return null;
      }
      if (axisHit < 0) return null;
      const n = [0, 0, 0]; n[axisHit] = sign;
      return { t: t0, n };
    };
    function raycast(o, d, maxT) {
      let best = null;
      for (const s of solids) {
        const h = rayBox(o, d, s, best ? best.t : maxT);
        if (h && (!best || h.t < best.t)) best = { t: h.t, normal: h.n, tag: s.tag };
      }
      if (d.y < -1e-6) {
        const t = -o.y / d.y;
        if (t > 0 && t < (best ? best.t : maxT)) best = { t, normal: [0, 1, 0], tag: Math.abs(o.x + d.x * t) < 10 && Math.abs(o.z + d.z * t) < 10 ? 'stone' : 'grass' };
      }
      return best;
    }
    const lineOfSight = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); d.divideScalar(len);
      const h = raycast(a, d, len);
      return !h || h.t >= len - 0.05;
    };

    const spawns = LAYOUT.gates.map((g) => ({ name: g.name, x: g.dir[0] * (GRID_HALF - 1.5), z: g.dir[1] * (GRID_HALF - 1.5), dir: g.dir }));

    return { flicker, solids, raycast, lineOfSight, moveBox, overlaps, updateFlow, flowDir, spawns, HALF, group, sky, clouds, isBlocked: (x, z) => { const cx = toCell(x); const cz = toCell(z); return cx < 0 || cz < 0 || cx >= N || cz >= N || !!blocked[idx(cx, cz)]; } };
  };
})();
