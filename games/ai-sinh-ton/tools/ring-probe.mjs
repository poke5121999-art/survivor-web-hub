// Team rings frame by frame, in the game's own real-time loop (no frozen clock): on every rendered fight frame, counts
// living heroes against their visible floor discs (RingGeometry 0.62..0.8) and living, landed enemies against instances of
// the enemy rim batch (InstancedMesh, RingGeometry 0.5..0.62) within 2 m. A ring that blinks out for one frame shows as a
// miss. Then replays arena-look-test's old "rings off" toggle and reports what stays on screen.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/ring-probe.mjs [--stages=11,1] [--frames=2400]
import { serve, launch, open as openPage, checker } from './pw.mjs';

const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const STAGES = (arg('stages') || '11,1').split(',').map(Number); const FRAMES = +(arg('frames') || 2400);
const { check, done } = checker();

const INSTALL = ([want]) => {
  const G = window.__G; const H = G.host; const R = { frames: 0, heroMiss: 0, heroFrames: 0, rimZero: 0, enemyMiss: 0, enemyChecked: 0, minCount: 1e9, maxCount: 0, missAt: [] };
  const geo = (o) => (o.geometry && o.geometry.type === 'RingGeometry' && o.geometry.parameters) || null;
  const orig = H.render.bind(H); const p = new H.THREE.Vector3(); const M = new H.THREE.Matrix4();
  H.render = (...a) => {
    const B = G.B;
    if (B && B.phase === 'fight' && R.frames < want) {
      R.frames++;
      const rims = H.scene.children.find((o) => o.isInstancedMesh && geo(o) && Math.abs(geo(o).innerRadius - 0.5) < 1e-3);
      const discs = H.scene.children.filter((o) => o.isMesh && !o.isInstancedMesh && geo(o) && Math.abs(geo(o).innerRadius - 0.62) < 1e-3 && Math.abs(geo(o).outerRadius - 0.8) < 1e-3);
      const alive = B.heroes.filter((u) => u.alive);
      // a disc sits under the drawn hero (actors.js syncHero), which trails the sim spot and runs the bridge path while the
      // world travels between sections: the reference is the hero's drawn node (actors.nodeOf), within 0.3 m
      const vis = discs.filter((d) => d.visible).length;
      const off = alive.filter((u) => { const n = G.actors.nodeOf(u.uid); return !n || !discs.some((d) => d.visible && Math.hypot(d.position.x - n.position.x, d.position.z - n.position.z) < 0.3); }).length;
      R.heroFrames++; if (off) R.offStill = (R.offStill || 0) + 1;
      if (vis < alive.length) { R.heroMiss++; if (R.missAt.length < 6) R.missAt.push({ f: R.frames, kind: 'hero', alive: alive.length, discs: discs.length, discsVisible: vis }); }
      const n = rims ? rims.count : 0; R.minCount = Math.min(R.minCount, n); R.maxCount = Math.max(R.maxCount, n);
      const pts = []; for (let i = 0; i < n; i++) { rims.getMatrixAt(i, M); p.setFromMatrixPosition(M); pts.push([p.x, p.z]); }
      const landed = B.enemies.filter((e) => e.alive && !(e.spawnT > 0));
      if (landed.length && n === 0) R.rimZero++;
      for (const e of landed) { R.enemyChecked++; if (!pts.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 2)) { R.enemyMiss++; if (R.missAt.length < 6) R.missAt.push({ f: R.frames, kind: 'enemy', uid: e.uid, n, landed: landed.length }); } }
    }
    return orig(...a);
  };
  window.__ring = R;
};

// arena-look-test's RINGS toggle before this fix: hide every top-level RingGeometry mesh, step one frame, count what is still drawn
const OLD_OFF = () => {
  const H = window.__G.host; const geo = (o) => (o.geometry && o.geometry.type === 'RingGeometry' && o.geometry.parameters) || null;
  const isRing = (o) => { const p = geo(o); return !!p && (Math.abs(p.innerRadius - 0.5) < 1e-3 || Math.abs(p.innerRadius - 0.62) < 1e-3); };
  window.__G.paused = true; const rings = H.scene.children.filter(isRing); rings.forEach((o) => { o.visible = false; }); window.__step(1);
  return { rings: rings.length, stillVisible: rings.filter((o) => o.visible).map((o) => (o.isInstancedMesh ? 'enemy-rims' : 'hero-disc')) };
};

const srv = await serve(); const br = await launch();
try {
  for (const st of STAGES) {
    const r = await openPage(br, srv.base, 's22', `autostart=1&stage=${st}&autoult=1&autopick=1&noaudio=1&seed=${st}`);
    const { page } = r;
    await page.evaluate(INSTALL, [FRAMES]);
    const t0 = Date.now();
    await page.waitForFunction((n) => window.__ring.frames >= n || (window.__G.B && window.__G.B.phase !== 'fight'), FRAMES, { timeout: 600000, polling: 500 });
    const R = await page.evaluate(() => window.__ring);
    console.log(`stage ${st}: ${R.frames} fight frames in ${((Date.now() - t0) / 1000).toFixed(0)} s; fewer visible hero discs than living heroes on ${R.heroMiss} of ${R.heroFrames} frames, a living hero with no visible disc under its drawn body on ${R.offStill || 0} frames; enemy rim batch empty while enemies stand on ${R.rimZero} frames; landed enemy without a rim within 2 m ${R.enemyMiss} of ${R.enemyChecked} checks; rim count ${R.minCount}..${R.maxCount} ${R.missAt.length ? JSON.stringify(R.missAt) : ''}`);
    check(R.frames >= Math.min(FRAMES, 2000), `stage ${st}: >= 2000 fight frames recorded (${R.frames})`);
    check(R.heroMiss === 0 && !R.offStill, `stage ${st}: every living hero has a visible disc on every frame (${R.heroMiss} frames short, ${R.offStill || 0} frames a hero without a disc under it)`);
    check(R.rimZero === 0 && R.enemyMiss === 0, `stage ${st}: every landed enemy has a rim instance on every frame (${R.enemyMiss} misses, ${R.rimZero} empty-batch frames)`);
    const o = await page.evaluate(OLD_OFF);
    console.log(`stage ${st}: old arena-look-test "rings off": ${o.rings} ring meshes hidden, still visible after one step: ${o.stillVisible.join(', ') || 'none'}`);
    await r.ctx.close();
  }
} finally { await br.close(); srv.close(); }
done();
