import { withLab } from './serve.mjs';
await withLab(async (page, logs) => {
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => { const g = __lab.R.gl3.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return { gl: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?', fps: __lab.stats().fps }; });
  console.log('default headless:', JSON.stringify(r));
}, { query: 'row=1&quality=med', timeoutMs: 60000 });
await withLab(async (page, logs) => {
  const r = await page.evaluate(() => {
    const L = __lab, out = {}, g = L.world.grid;
    const top = (i) => { let y = 0; for (let yy = 380; yy > 8 && !y; yy--) for (let z = Math.floor(i.z0 * 10); z < (i.z0 + i.sz) * 10 && !y; z += 2) for (let x = Math.floor(i.x0 * 10); x < (i.x0 + i.sx) * 10; x += 2) if (g.get(x, yy, z)) { y = yy; break; } return +((y - 8) * 0.1).toFixed(1); };
    let i = L.spawn('water-tower', 1); const G = L.world.grid;
    // remove every voxel of the two -x legs between 1.0 and 1.6 m (a cut through two legs on one side)
    let cut = 0; for (let y = 18; y < 24; y++) for (let z = Math.floor(i.z0 * 10); z < (i.z0 + i.sz) * 10; z++) for (let x = Math.floor(i.x0 * 10); x < i.x * 10; x++) { const m = G.get(x, y, z); if (m) { L.world.crushVoxel(x, y, z, m, cut++); } }
    const x0 = i.x; let maxTilt = 0, bx = 0;
    for (let s = 0; s < 480; s++) { L.step(1); for (const b of L.world.bodies.list) if (b.voxels > 5000) { maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, b.R[4])) * 57.3); bx = b.x - x0; } }
    out.waterTower = { cut, heightBefore: i.sy, heightAfter: top(i), maxTiltDeg: +maxTilt.toFixed(0), bodyDriftX: +bx.toFixed(1), fractures: L.stats().fractures, detached: L.stats().detached };
    i = L.spawn('brick-house', 0); const w0 = L.world.grid.solid; L.tool('ball', i.x - 12, 6, i.z - 12, 12, -3.5, 10.5); L.step(300); out.ball = { removedFromWorld: w0 - L.world.grid.solid - 0, ledger: L.world.ledger() };
    return out;
  });
  console.log(JSON.stringify(r)); console.log('errors', JSON.stringify(await page.evaluate(() => __lab.errors)), logs.length);
}, { query: 'harness&quality=low', timeoutMs: 120000, gpu: true });
