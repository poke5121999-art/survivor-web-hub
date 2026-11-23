// Replays one fight with the cam-test sampler and prints the camera's state (G.cam.dbg) at the first samples where a hero
// or an ally box reaches the hero cards. Usage: PLAYWRIGHT_PATH=... timeout 600 node games/ai-sinh-ton/tools/cam-probe.mjs --stage=1 [--phone=s22]
import { serve, launch, open as openPage } from './pw.mjs';
const argv = process.argv.slice(2); const arg = (k, d) => (argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const STAGE = +arg('stage', 1); const PHONE = arg('phone', 's22');
const srv = await serve(); const br = await launch();
try {
  const r = await openPage(br, srv.base, PHONE, `autostart=1&stage=${STAGE}&autoult=1&autopick=1&noaudio=1&seed=${STAGE}&q=low`, { freeze: true });
  const out = await r.page.evaluate(() => {
    const G = window.__G; const H = G.host; const B = G.B; const V = new H.THREE.Vector3(); const hits = []; let t = 0;
    const px = (x, y, z) => { V.set(x, y, z).project(H.camera); const u = H.size.u || 1; return [(V.x + 1) / 2 * H.size.w / u, (1 - V.y) / 2 * H.size.h / u]; };
    while (t < 900 && (B.phase === 'fight' || B.phase === 'pick') && hits.length < 6) {
      window.__sim(0.25); t += 0.25;
      const cards = G.screens.hud.dbg().boxes.filter((q) => /^card/.test(q.id));
      for (const u of B.units) {
        if (!u.alive || u.team !== 0) continue; const n = G.actors.nodeOf(u.uid); if (!n) continue; const f = px(n.position.x, n.position.y, n.position.z);
        if (cards.some((q) => f[0] > q.x && f[0] < q.x + q.w && f[1] > q.y + 2)) hits.push({ node: [+n.position.x.toFixed(1), +n.position.y.toFixed(2), +n.position.z.toFixed(1)], busy: H.world.busy, t, wave: B.wave, uid: u.uid, hero: !!u.hero, at: [+u.x.toFixed(1), +u.z.toFixed(1)], feet: f.map((x) => +x.toFixed(0)), cardTop: Math.min(...cards.map((q) => q.y)), band: G.cam.band, dbg: G.cam.dbg, dist: +G.cam.dist.toFixed(2), juice: G.host.juice ? { push: G.host.juice.push, shake: G.host.juice.shake.px } : null, cine: !!G.cine });
      }
    }
    return { hits, t, phase: B.phase, wave: B.wave };
  });
  console.log(`ran ${out.t} s, ${out.phase} at wave ${out.wave}`); for (const h of out.hits) console.log(JSON.stringify(h));
  await r.ctx.close();
} finally { await br.close(); srv.close(); }
