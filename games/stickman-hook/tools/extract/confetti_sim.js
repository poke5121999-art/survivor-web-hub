// node confetti_sim.js <A|B> <speed scale> [1 = limit scaled]: offline ConfettisLeft cloud vs the player under the finish
// slow motion. A = dampen per real 60 fps frame, B = per particle time. Chose A with scale 1 (js/main.js CONF).
// Offline sim of ConfettisLeft under the finish slow motion, two damping models, positions relative to the player.
const model = process.argv[2] || 'A';
const scale = +(process.argv[3] || 0.3); // scale applied to speed (and limit if argv[4])
const limScaled = process.argv[4] === '1';
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pv = [8.1, 1.3], sp = Math.hypot(...pv), dir = [pv[0] / sp, pv[1] / sp];
const ps = []; let player = [0, 0], emitAcc = 0, gtime = 0;
const lim = limScaled ? 1 * scale : 1;
const report = (t) => {
  const rel = ps.map((p) => [p.x - player[0], p.y - player[1]]);
  const xs = rel.map((r) => r[0]).sort((a, b) => a - b), ys = rel.map((r) => r[1]).sort((a, b) => a - b);
  const q = (a, f) => a[Math.floor(f * (a.length - 1))]?.toFixed(2);
  console.log(`t=${t.toFixed(2)} n=${ps.length} game=${gtime.toFixed(3)} relx[10,50,90]=${q(xs, .1)},${q(xs, .5)},${q(xs, .9)} rely=${q(ys, .1)},${q(ys, .5)},${q(ys, .9)}`);
};
for (let f = 0; f < 120; f++) {
  const t = f / 60, k = Math.min(1, t / 0.6), ts = 1 - 0.95 * Math.sqrt(1 - (k - 1) * (k - 1));
  const dt = (1 / 60) * ts; gtime += dt;
  emitAcc += 400 * dt;
  while (emitAcc >= 1 && ps.length < 70) {
    emitAcc -= 1;
    const a = Math.atan2(dir[1], dir[0]) + (rnd() * 2 - 1) * (20 * Math.PI / 180) * Math.sqrt(rnd());
    const v = (50 + rnd() * 50) * scale;
    ps.push({ x: pv[0] * (1 / 60) * 2 * 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 9.81 * (1.4 + rnd() * 0.6) });
  }
  for (const p of ps) {
    p.vy -= p.g * dt;
    const s = Math.hypot(p.vx, p.vy);
    if (s > lim) {
      const d = model === 'A' ? 0.1 : 1 - Math.pow(0.9, dt * 30);
      const ns = s - (s - lim) * d; p.vx *= ns / s; p.vy *= ns / s;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  player = [player[0] + pv[0] * dt, player[1] + pv[1] * dt];
  if ([27, 48, 60, 96].includes(f)) report(t);
}
