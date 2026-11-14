// headless sanity run of the simulation core in node (no renderer)
import { World, GY } from '../lib/sim/world.js';
import tower from '../lib/build/office-tower.js';
import house from '../lib/build/brick-house.js';
const t0 = performance.now();
const W = new World();
console.log('world ms', (performance.now() - t0).toFixed(0), 'solid', W.grid.solid);
const which = process.argv[2] || 'tower';
const c = (which === 'tower' ? tower : house).build(1);
let t = performance.now();
const st = W.place(c, 200, 100, 0, which);
console.log('place ms', (performance.now() - t).toFixed(0), 'size', c.sx, c.sy, c.sz, 'S', st.S.toFixed(4), 'ratio', W.evalStruct(st, st.S).toFixed(2));
for (let i = 0; i < 30; i++) W.tick();
console.log('idle: bodies', W.bodies.list.length, 'debris', W.d.n, 'ledger', JSON.stringify(W.ledger()));
const cx = (200 + c.sx / 2) * 0.1, cz = (100 + c.sz / 2) * 0.1;
t = performance.now();
if (which === 'tower') { for (const [dx, dz] of [[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) W.explode(cx + dx, 2.0, cz + dz, 3.5, 2); }
else { W.explode(cx, 1.5, cz, 2.5, 1.5); }
console.log('explode ms', (performance.now() - t).toFixed(0));
let worst = 0;
for (let i = 0; i < 480; i++) {
  const a = performance.now(); W.tick(); const d = performance.now() - a; worst = Math.max(worst, d);
  W.events.length = 0;
  if (i % 40 === 0) { let top = 0; for (const b of W.bodies.list) top = Math.max(top, b.y + b.radius); console.log(i, 'bodies', W.bodies.list.length, 'awake', W.bodies.awake(), 'debris', W.d.n, 'frac', W.stats.fractures, 'det', W.stats.detached, 'ratio', W.stats.maxRatio.toFixed(2), 'tick ms', d.toFixed(1), 'biggest', Math.max(0, ...W.bodies.list.map(b => b.voxels)), 'top', top.toFixed(1)); }
}
// height of what still stands
let hy = 0; for (let y = 380; y > GY; y--) { let any = false; for (let z = 100; z < 100 + c.sz && !any; z += 3) for (let x = 200; x < 200 + c.sx; x += 3) if (W.grid.get(x, y, z)) { any = true; break; } if (any) { hy = y; break; } }
console.log('worst tick ms', worst.toFixed(0), 'standing height m', ((hy - GY) * 0.1).toFixed(1), 'of', (c.sy * 0.1).toFixed(1), 'ledger', JSON.stringify(W.ledger()), 'digest', W.digest());
