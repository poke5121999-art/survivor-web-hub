// Before | after pictures of the fight camera at the same moments, one stage per map layout, S22 and Xiaomi, HUD on.
// "before" is another build served at AST_BEFORE (for W-cam2: `git archive` of the commit before the cluster camera,
// served with any static server); "after" is this tree. Each moment also prints the camera distance and the on-screen
// height of the four beasts. Out: .chk/a10/<AB_SUB or cam2>/ab-<phone>-<moment>.png (before left, after right) and the raw frames.
// Usage: AST_BEFORE=http://127.0.0.1:8123 PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/cam-ab.mjs [--phones=s22] [--only=maze,boss]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'a10', process['env'].AB_SUB || 'cam2'); fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const PHONES = arg('phones') ? arg('phones').split(',') : ['s22', 'xiaomi'];
const BEFORE = (process['env'].AST_BEFORE || '').replace(/\/$/, '');
const MOMENTS = [
  { name: 'arena', stage: 1, wave: 2, secs: 8 },
  { name: 'islands', stage: 4, wave: 2, secs: 8 },
  { name: 'maze', stage: 5, wave: 2, secs: 8 },
  { name: 'cave', stage: 6, wave: 2, secs: 8 },
  { name: 'rail', stage: 9, wave: 2, secs: 8 },
  { name: 'horde', stage: 15, wave: 3, secs: 14 },
  { name: 'boss', stage: 8, wave: 5, secs: 9 },
  { name: 'forest', stage: 2, wave: 1, secs: 6 },
  { name: 'chase-snow', stage: 27, wave: 2, secs: 5 },
  { name: 'swamp-rail', stage: 16, wave: 1, secs: 4 },
].filter((m) => !arg('only') || arg('only').split(',').includes(m.name));

const LOOK = () => {
  const G = window.__G; const H = G.host; const V = new H.THREE.Vector3(); const px = [];
  for (const u of G.B.heroes) {
    if (!u.alive) continue; const b = G.actors.beastOf(u.uid); const n = G.actors.nodeOf(u.uid); if (!b || !n) continue;
    V.set(n.position.x, n.position.y, n.position.z).project(H.camera); const a = V.y; V.set(n.position.x, n.position.y + b.height, n.position.z).project(H.camera);
    px.push(+(Math.abs(V.y - a) / 2 * H.size.h).toFixed(1));
  }
  return { dist: +(G.cam.dist || 0).toFixed(1), alive: G.B.enemies.filter((e) => e.alive).length, layout: G.B.plan && G.B.plan.layout, px };
};

async function shot(br, base, phone, M, tag) {
  const r = await openPage(br, base, phone, `autostart=1&stage=${M.stage}&wave=${M.wave}&seed=${M.stage}&autoult=1&autopick=1&noaudio=1`, { freeze: true });
  await r.page.evaluate((s) => window.__sim(s), M.secs); await r.page.evaluate(() => window.__step(30));
  const info = await r.page.evaluate(LOOK);
  const f = path.join(OUT, `raw-${tag}-${phone}-${M.name}.png`); await r.page.locator('#frame').screenshot({ path: f });
  await r.ctx.close();
  console.log(`${tag} ${phone} ${M.name} (stage ${M.stage} ${info.layout}): camera ${info.dist} m, ${info.alive} zombies, beasts ${info.px.join(' / ')} px`);
  return f;
}

const srv = await serve();
const br = await launch();
try {
  for (const phone of PHONES) for (const M of MOMENTS) {
    const files = [];
    if (BEFORE) files.push(await shot(br, BEFORE, phone, M, 'before'));
    files.push(await shot(br, srv.base, phone, M, 'after'));
    const out = path.join(OUT, `ab-${phone}-${M.name}.png`); sheet(files, out, files.length, phone === 's22' ? 780 : 1002);
    console.log('  sheet ' + out);
  }
} finally { await br.close(); srv.close(); }
