/*
 * Lưới đi lại (NavMesh) và vùng an toàn của sự kiện thế giới, cho quái / tàu ma / vòi rồng / cá đuối (MONSTERS.md §0.1, §5, §3.1 S2).
 *
 * DRNav: bản gốc chạy NavMesh của Unity (agent 0 = GenericNavMeshSurface cho angler, tàu ma, vòi rồng; RayNavMeshSurface cho cá đuối, chỉ vùng nông).
 * tools/navmesh.py giải mã các tile Detour 'DNAV' của hai tệp NavMesh-*.asset thành bitmap 1 m (art/world/navmask-generic.png, navmask-ray.png) cùng lưới với
 * landmask.png. Ở đây ô đi được = navmesh VÀ không phải đất của landmask: navmesh gốc vẫn phủ một phần đất nông/bờ (5.287 ô đất trong vùng Marrows) mà
 * thuyền không qua được, và quái dựng trên thuyền không được cắt đất.
 *
 *   DRNav.kinds                'generic' | 'ray'  (kind mặc định 'generic')
 *   DRNav.ready / DRNav.whenReady()   bitmap đã nạp (tự nạp lúc tệp chạy; trước đó walkable() rơi về luật SDF đất > 2 m [ĐỀ XUẤT])
 *   DRNav.mode                 'navmesh' hoặc 'sdf'
 *   DRNav.walkable(x, z, kind) có đứng được không (tọa độ three.js)
 *   DRNav.sample(p, r, kind)   NavMesh.SamplePosition: điểm đi được gần p = {x, z} nhất trong bán kính r (m), hoặc null
 *   DRNav.path(a, b, kind)     [{x, z}, ...] từ a tới b qua A* lưới 1 m (8 hướng) rồi kéo thẳng bằng kiểm tra tầm nhìn; null nếu không có đường
 *   DRNav.ray(a, b, kind)      NavMesh.Raycast: null nếu đường thẳng a→b không chạm biên, ngược lại { x, z, t, d } (t 0..1, d mét) tại ô đầu tiên bị chặn
 *   DRNav.stats()              { mode, cells: { generic, ray } }
 *   DRNav.compare(cx, cz, r, kind)   đếm ô navmesh so với landmask trong đĩa (để kiểm độ khớp)
 *
 * DRSafeZones: 38 collider layer 27 (data/safezones.js; tools/safezones.py). hit(x, z) = WorldEventManager.DoesHitSafeZone: tia xuống từ y = 9999 trúng
 * collider nào thì true, nên chỉ cần hình chiếu XZ của hộp / cầu / capsule / mesh (trigger cũng tính).
 *   DRSafeZones.hit(x, z) → bool   DRSafeZones.which(x, z) → tên đường dẫn (path) của vùng đầu tiên trúng hoặc null   DRSafeZones.zones
 */
(function (root) {
  'use strict';
  // ---------------------------------------------------------------- vùng an toàn
  const SZ = root.DR_SAFEZONES;
  const zones = [];
  if (SZ) for (const z of SZ.zones) {
    if (z.active === false) continue;                       // collider của object không hoạt động không bị raycast
    const s = z.scale, c = z.center || [0, 0, 0], cos = Math.cos(z.rotY), sin = Math.sin(z.rotY);
    // R·(S·c): tâm collider trong thế giới (three.js xoay quanh Y: x' = x·cos + z·sin, z' = −x·sin + z·cos)
    const lx = c[0] * s[0], lz = c[2] * s[2];
    const o = { z, cx: z.pos[0] + lx * cos + lz * sin, cz: z.pos[2] - lx * sin + lz * cos, cos, sin };
    if (z.shape === 'sphere') o.r = z.radius * Math.max(s[0], s[1], s[2]);
    else if (z.shape === 'box') { o.hx = z.size[0] * s[0] / 2; o.hz = z.size[2] * s[2] / 2; }
    else if (z.shape === 'capsule') {
      const ax = z.direction;                                 // trục dọc của capsule
      if (ax === 'y') o.r = z.radius * Math.max(s[0], s[2]);
      else {
        const r = z.radius * Math.max(s[1], ax === 'x' ? s[2] : s[0]), half = Math.max(0, z.height * s[ax === 'x' ? 0 : 2] / 2 - r);
        o.r = r; o.axis = ax; o.half = half;
      }
    } else if (z.shape === 'mesh' && z.outlineXZ && z.outlineXZ.length > 2) o.poly = z.outlineXZ;
    else continue;
    zones.push(o);
  }
  function inPoly(poly, x, z) {
    let in_ = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) in_ = !in_;
    }
    return in_;
  }
  function zoneHit(o, x, z) {
    const dx = x - o.cx, dz = z - o.cz;
    if (o.poly) return inPoly(o.poly, x, z);
    if (o.hx !== undefined) {                                  // R⁻¹·d
      const u = dx * o.cos - dz * o.sin, v = dx * o.sin + dz * o.cos;
      return Math.abs(u) <= o.hx && Math.abs(v) <= o.hz;
    }
    if (o.axis) {
      const u = dx * o.cos - dz * o.sin, v = dx * o.sin + dz * o.cos, t = o.axis === 'x' ? u : v, w = o.axis === 'x' ? v : u;
      const e = Math.max(0, Math.abs(t) - o.half);
      return e * e + w * w <= o.r * o.r;
    }
    return dx * dx + dz * dz <= o.r * o.r;
  }
  root.DRSafeZones = {
    zones,
    which(x, z) { for (const o of zones) if (zoneHit(o, x, z)) return o.z.path; return null; },
    hit(x, z) { for (const o of zones) if (zoneHit(o, x, z)) return true; return false; }
  };

  // ---------------------------------------------------------------- lưới đi lại
  const KINDS = ['generic', 'ray'];
  const REV = ((document.currentScript && document.currentScript.src || '').match(/[?&]v=([^&]+)/) || [])[1] || '';
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/js\/nav\.js.*$/, '');
  const N = { kinds: KINDS, ready: false, mode: 'sdf', box: null };
  const grids = {}, raws = {};                                  // kind -> Uint8Array (1 = đi được); raws = navmesh gốc chưa trừ đất
  let readyP = null, LB = null;

  function decode(url) {
    return fetch(url + (REV ? '?v=' + REV : '')).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.blob(); })
      .then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then(bmp => {
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
        return { w: bmp.width, h: bmp.height, d: x.getImageData(0, 0, bmp.width, bmp.height).data };
      });
  }
  function build() {
    return new Promise((res, rej) => {                          // chờ landmask của DRWorld (texture bọt: 0 = đất, > 0 = nước)
      let n = 0;
      const t = setInterval(() => {
        const W = root.DRWorld;
        if (W && W.landBox && W.landTex && W.landTex.image && W.landTex.image.data) { clearInterval(t); res(W); }
        else if (++n > 2400) { clearInterval(t); rej(new Error('DRWorld chưa nạp landmask sau 2 phút')); }
      }, 50);
    });
  }
  function load() {
    if (readyP) return readyP;
    readyP = Promise.all([build(), ...KINDS.map(k => decode(BASE + 'art/world/navmask-' + k + '.png'))]).then(([W, ...imgs]) => {
      LB = W.landBox; N.box = { x0: LB.x0, z0: LB.z0, cols: LB.cols, rows: LB.rows, res: LB.res };
      const foam = W.landTex.image.data;                       // foam = round(max(0, sdf)/64·255); ô nước có sdf ≥ 0,5 nên foam ≥ 2, đất = 0
      imgs.forEach((im, i) => {
        if (im.w !== LB.cols || im.h !== LB.rows) throw new Error('navmask ' + KINDS[i] + ' ' + im.w + 'x' + im.h + ' lệch landmask ' + LB.cols + 'x' + LB.rows);
        const g = new Uint8Array(im.w * im.h), rw = new Uint8Array(im.w * im.h);
        for (let k = 0; k < g.length; k++) { rw[k] = im.d[k * 4] > 127 ? 1 : 0; g[k] = rw[k] && foam[k] > 0 ? 1 : 0; }
        grids[KINDS[i]] = g; raws[KINDS[i]] = rw;
      });
      N.mode = 'navmesh'; N.ready = true;
      return N;
    }).catch(e => { console.warn('[nav] không nạp được navmask, dùng luật SDF đất > 2 m:', e && e.message || e); return N; });
    return readyP;
  }
  N.whenReady = load;
  load();

  function cell(x, z) {
    const i = Math.floor((x - LB.x0) / LB.res), j = Math.floor((z - LB.z0) / LB.res);
    return (i < 0 || j < 0 || i >= LB.cols || j >= LB.rows) ? -1 : j * LB.cols + i;
  }
  function walkable(x, z, kind) {
    if (N.ready) { const k = cell(x, z); return k >= 0 && grids[kind || 'generic'][k] === 1; }
    const W = root.DRWorld;
    return !!(W && W.sdf && W.landBox && W.sdf(x, z) > 2);     // [ĐỀ XUẤT] luật dự phòng: cách đất hơn 2 m
  }
  function walk(i, j, g) { return i >= 0 && j >= 0 && i < LB.cols && j < LB.rows && g[j * LB.cols + i] === 1; }

  // NavMesh.SamplePosition: quét vòng vuông tăng dần, lấy ô đi được gần nhất theo khoảng cách Euclid
  function sample(p, r, kind) {
    r = r == null ? 5 : r;
    if (walkable(p.x, p.z, kind)) return { x: p.x, z: p.z };
    if (!N.ready) return null;
    const g = grids[kind || 'generic'], ci = Math.floor((p.x - LB.x0) / LB.res), cj = Math.floor((p.z - LB.z0) / LB.res), R = Math.ceil(r / LB.res);
    let best = null, bd = Infinity;
    for (let d = 1; d <= R; d++) {
      if (best && d * d > bd) break;
      for (let a = -d; a <= d; a++) for (const [i, j] of [[ci + a, cj - d], [ci + a, cj + d], [ci - d, cj + a], [ci + d, cj + a]]) {
        if (!walk(i, j, g)) continue;
        const x = LB.x0 + (i + 0.5) * LB.res, z = LB.z0 + (j + 0.5) * LB.res, dd = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
        if (dd < bd && dd <= r * r) { bd = dd; best = { x, z }; }
      }
    }
    return best;
  }

  // đường thẳng a→b trên ô: Bresenham (DDA) có kiểm cả hai ô kề ở bước chéo, trả về chỉ số ô đầu tiên bị chặn hoặc -1
  function lineBlocked(g, a, b) {
    let i = a[0], j = a[1];
    const di = Math.abs(b[0] - i), dj = Math.abs(b[1] - j), si = i < b[0] ? 1 : -1, sj = j < b[1] ? 1 : -1;
    let err = di - dj;
    for (;;) {
      if (!walk(i, j, g)) return [i, j];
      if (i === b[0] && j === b[1]) return null;
      const e2 = 2 * err;
      let ni = i, nj = j;
      if (e2 > -dj) { err -= dj; ni += si; }
      if (e2 < di) { err += di; nj += sj; }
      if (ni !== i && nj !== j && (!walk(ni, j, g) || !walk(i, nj, g))) return [ni, j];  // không lách qua góc đất
      i = ni; j = nj;
    }
  }
  function ray(a, b, kind) {
    if (!N.ready) return null;
    const g = grids[kind || 'generic'];
    const A = [Math.floor((a.x - LB.x0) / LB.res), Math.floor((a.z - LB.z0) / LB.res)], B = [Math.floor((b.x - LB.x0) / LB.res), Math.floor((b.z - LB.z0) / LB.res)];
    const hit = lineBlocked(g, A, B);
    if (!hit) return null;
    const x = LB.x0 + (hit[0] + 0.5) * LB.res, z = LB.z0 + (hit[1] + 0.5) * LB.res, d = Math.hypot(x - a.x, z - a.z), L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x, z, d, t: Math.min(1, d / L) };
  }

  // ---- A* trong cửa sổ quanh hai đầu mút (nới dần), heap nhị phân
  const SQ2 = Math.SQRT2, NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
  function astar(g, si, sj, ti, tj, i0, j0, w, h) {
    const n = w * h, G = new Float32Array(n).fill(Infinity), par = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = [], push = (f, k) => {
      heap.push([f, k]); let c = heap.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
    }, pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1; let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
        }
      }
      return top;
    };
    const hf = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return dx + dz + (SQ2 - 2) * Math.min(dx, dz); };
    const s = (sj - j0) * w + (si - i0), t = (tj - j0) * w + (ti - i0);
    G[s] = 0; push(hf(si, sj), s);
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === t) {
        const out = []; for (let c = t; c !== -1; c = par[c]) out.push([i0 + c % w, j0 + (c / w | 0)]);
        return out.reverse();
      }
      closed[k] = 1;
      const i = i0 + k % w, j = j0 + (k / w | 0);
      for (const [di, dj, c] of NB) {
        const ni = i + di, nj = j + dj;
        if (ni < i0 || nj < j0 || ni >= i0 + w || nj >= j0 + h || !walk(ni, nj, g)) continue;
        if (di && dj && (!walk(i + di, j, g) || !walk(i, j + dj, g))) continue;   // không cắt góc đất
        const nk = (nj - j0) * w + (ni - i0), ng = G[k] + c;
        if (ng < G[nk]) { G[nk] = ng; par[nk] = k; push(ng + hf(ni, nj), nk); }
      }
    }
    return null;
  }
  function path(a, b, kind) {
    if (!N.ready) return null;
    kind = kind || 'generic';
    const g = grids[kind];
    const sa = sample(a, 8, kind), sb = sample(b, 8, kind);
    if (!sa || !sb) return null;
    const ci = p => [Math.floor((p.x - LB.x0) / LB.res), Math.floor((p.z - LB.z0) / LB.res)];
    const [si, sj] = ci(sa), [ti, tj] = ci(sb);
    let cells = null;
    for (const margin of [48, 160, 480, 4000]) {
      const i0 = Math.max(0, Math.min(si, ti) - margin), j0 = Math.max(0, Math.min(sj, tj) - margin);
      const i1 = Math.min(LB.cols - 1, Math.max(si, ti) + margin), j1 = Math.min(LB.rows - 1, Math.max(sj, tj) + margin);
      cells = astar(g, si, sj, ti, tj, i0, j0, i1 - i0 + 1, j1 - j0 + 1);
      if (cells || (i0 === 0 && j0 === 0 && i1 === LB.cols - 1 && j1 === LB.rows - 1)) break;
    }
    if (!cells) return null;
    // kéo thẳng: từ mỗi điểm nhảy tới điểm xa nhất còn thấy được
    const keep = [cells[0]];
    let at = 0;
    while (at < cells.length - 1) {
      let far = at + 1;
      for (let k = cells.length - 1; k > at + 1; k--) if (!lineBlocked(g, cells[at], cells[k])) { far = k; break; }
      keep.push(cells[far]); at = far;
    }
    const pts = keep.map(c => ({ x: LB.x0 + (c[0] + 0.5) * LB.res, z: LB.z0 + (c[1] + 0.5) * LB.res }));
    pts[0] = { x: sa.x, z: sa.z }; pts[pts.length - 1] = { x: sb.x, z: sb.z };
    return pts;
  }

  // So bitmap navmesh với landmask trong đĩa (cx, cz, r): ô nước = landmask không đặc; 'far' = nước cách đất hơn 2 m (sdf > 2)
  function compare(cx, cz, r, kind) {
    kind = kind || 'generic';
    const W = root.DRWorld, o = { cells: 0, water: 0, waterFar: 0, waterFarWalkable: 0, waterWalkable: 0, land: 0, rawLandWalkable: 0 };
    if (!N.ready) return null;
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 > r * r) continue;
      const k = cell(x + 0.5, z + 0.5); if (k < 0) continue;
      o.cells++;
      if (W.sdf(x + 0.5, z + 0.5) > 0) {
        o.water++; if (grids[kind][k]) o.waterWalkable++;
        if (W.sdf(x + 0.5, z + 0.5) > 2) { o.waterFar++; if (grids[kind][k]) o.waterFarWalkable++; }
      } else { o.land++; if (raws[kind][k]) o.rawLandWalkable++; }
    }
    return o;
  }
  N.compare = compare;
  N.walkable = walkable; N.sample = sample; N.path = path; N.ray = ray;
  N.stats = () => ({ mode: N.mode, cells: N.ready ? { generic: grids.generic.reduce((s, v) => s + v, 0), ray: grids.ray.reduce((s, v) => s + v, 0) } : null });
  root.DRNav = N;
})(window);
