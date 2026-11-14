// behaviour + perf checks: cut-base topple, laser on tower, determinism digest, live loop fps (SwiftShader or GPU), phone UI shot
import { withLab } from './serve.mjs';
const gpu = process.argv.includes('--gpu');
await withLab(async (page, logs) => {
  const r = await page.evaluate(() => {
    const L = __lab, out = {};
    const top = (i) => { let y = 0; const g = L.world.grid; for (let yy = 380; yy > 8 && !y; yy--) for (let z = Math.floor(i.z0 * 10); z < (i.z0 + i.sz) * 10 && !y; z += 2) for (let x = Math.floor(i.x0 * 10); x < (i.x0 + i.sx) * 10; x += 2) if (g.get(x, yy, z)) { y = yy; break; } return +((y - 8) * 0.1).toFixed(1); };
    // 1. water tower: cut two legs on one side with the gun-free "laser" restricted by aiming a small carve at each leg
    let i = L.spawn('water-tower', 1); const h0 = top(i);
    for (const dz of [-1, 1]) for (let k = 0; k < 6; k++) L.world.carve(i.x - i.sx * 0.5 + 0.5 + k * 0.25, i.y + 1.5, i.z + dz * (i.sz * 0.5 - 0.6), 0.7, 1.5);
    L.step(420); out.waterTower = { before: h0, after: top(i), bodiesNow: L.world.bodies.list.length, fractures: L.stats().fractures, detached: L.stats().detached };
    // 2. laser cut at the base of the office tower
    i = L.spawn('office-tower', 1); const t0 = top(i);
    L.tool('laser', i.x, 3, i.z - 20, 0, -0.02, 1); L.step(480); out.towerLaser = { before: t0, after: top(i), detached: L.stats().detached, fractures: L.stats().fractures };
    // 3. determinism: same commands twice -> same digest
    const run = () => { const j = L.spawn('brick-house', 2); L.explode(j.x, 2, j.z - 3, 2.5, 1.5); L.step(200); return L.world.digest(); };
    out.digest = [run(), run()];
    // 4. fire: hut burns
    i = L.spawn('hut', 1); const v0 = L.world.ledger(); L.world.ignite(i.x, i.y + 3, i.z, 2.5, 4); L.step(900); const fs = L.world.fireStats; out.fire = { lit: fs.lit, charred: fs.charred, consumed: fs.consumed, burning: fs.burning, heightBefore: i.sy, heightAfter: top(i), leak: L.world.ledger().leak };
    // 5. gas station: rocket into the drums
    i = L.spawn('gas-station', 1); let n = 0; const g = L.world.grid, pos = [0, 0, 0]; g.forEach((x, y, z, m) => { if (m === 33) { n++; pos[0] += x; pos[1] += y; pos[2] += z; } });
    L.explode(pos[0] / n * 0.1, pos[1] / n * 0.1 + 0.5, pos[2] / n * 0.1 - 1.5, 1.6, 1); L.step(240); out.fuel = { fuelVoxels: n, setOff: L.world.fireStats.explosives };
    // 6. wrecking ball through the brick house
    i = L.spawn('brick-house', 0); const w0 = L.world.grid.solid; L.tool('ball', i.x, 4, i.z - 20, 0, 0, 1); L.step(420); out.ball = { removed: w0 - L.world.grid.solid, leak: L.world.ledger().leak };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', JSON.stringify(await page.evaluate(() => __lab.errors)), logs.length, logs.slice(0, 5).join('\n'));
}, { query: 'harness&quality=low', timeoutMs: 280000, gpu: true });
// live loop fps
for (const [name, q, w, h, query] of [['desktop-med', 'med', 1280, 720, 'model=office-tower'], ['row-med', 'med', 1280, 720, 'row=1'], ['phone-low', 'low', 390, 844, 'model=tube-house']]) {
  await withLab(async (page, logs) => {
    await page.waitForTimeout(3000);
    await page.mouse.click(w / 2, h * 0.55); // first gesture: starts audio, throws a grenade
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({ s: __lab.stats(), a: __lab.audio.stats(), e: __lab.errors }));
    await page.screenshot({ path: `shots/ui_${name}${gpu ? '' : '_swiftshader'}.png` });
    console.log(name, gpu ? 'GPU' : 'SwiftShader', 'fps', s.s.fps, 'simMs', s.s.simMs, 'quads', s.s.quads, 'draws', s.s.draws, 'audio', JSON.stringify(s.a).slice(0, 120), 'errors', JSON.stringify(s.e), 'console', logs.length, logs.slice(0, 3).join(' | '));
  }, { query: query + '&quality=' + q, width: w, height: h, timeoutMs: 120000, gpu });
}
