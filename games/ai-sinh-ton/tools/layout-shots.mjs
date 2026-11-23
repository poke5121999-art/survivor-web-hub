// Overview shots for layout-test --shots: for each layout kind and each biome one stage, the whole map from high above (every
// section built, fog off) beside the first wave's pad at the game's own camera. Files and the sheet go to .chk/a10/maps/.
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'a10', 'maps'); fs.mkdirSync(OUT, { recursive: true });

const OVER = () => {
  const G = window.__G; const H = G.host; const W = H.world; const T = H.THREE;
  const cs = W.overview(); let x0 = 1e9; let x1 = -1e9; let z0 = 1e9; let z1 = -1e9; let y = 0;
  for (const c of cs) { x0 = Math.min(x0, c.x - 14); x1 = Math.max(x1, c.x + 14); z0 = Math.min(z0, c.z - 9); z1 = Math.max(z1, c.z + 9); y = Math.max(y, c.y); }
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2; const span = Math.max(x1 - x0, (z1 - z0) * 2.1);
  const cam = new T.PerspectiveCamera(30, H.camera.aspect, 1, 900); const d = span / (2 * Math.tan((15 * Math.PI) / 180) * H.camera.aspect) + 10;
  cam.position.set(cx, y + d * 0.8, cz + d * 0.62); cam.lookAt(cx, y * 0.5, cz); cam.updateMatrixWorld(true);
  const fog = H.scene.fog; H.scene.fog = null; H.scene.updateMatrixWorld(true);
  H.renderer.render(H.scene, cam); const url = H.renderer.domElement.toDataURL('image/png'); H.scene.fog = fog;
  return { url, n: cs.length, draws: H.renderer.info.render.calls };
};

export async function shots(check, plans) {
  const pick = {}; for (const p of plans) { if (!pick['layout-' + p.layout]) pick['layout-' + p.layout] = p.n; if (!pick['biome-' + p.biome]) pick['biome-' + p.biome] = p.n; }
  const want = Object.entries(pick).filter(([k]) => k.startsWith('layout-') || /forest|swamp|street|crypt|factory|void/.test(k));
  const srv = await serve(); const br = await launch(); const files = [];
  try {
    for (const [name, n] of want) {
      const { ctx, page, problems } = await open(br, srv.base, 's22', `autostart=1&stage=${n}&noaudio=1&seed=3&q=low&autopick=1`, { freeze: true });
      await page.evaluate(() => { window.__G.paused = true; window.__step(3); });
      const fa = path.join(OUT, `${name}-s${n}-pad.png`);
      await page.evaluate(() => { const W = window.__G.host.world; W.travelTo(0); W.settle(); window.__step(4); });
      await page.locator('#frame').screenshot({ path: fa });
      const O = await page.evaluate(OVER); const fo = path.join(OUT, `${name}-s${n}-map.png`);
      fs.writeFileSync(fo, Buffer.from(O.url.split(',')[1], 'base64'));
      check(O.n === plans[n - 1].rooms.length + 1 && problems.length === 0, `${name} (stage ${n}): overview of ${O.n} sections (the start room and ${plans[n - 1].rooms.length} rooms), no page errors (${problems.slice(0, 1).join('') || 'none'})`);
      files.push(fo, fa); await ctx.close();
    }
  } finally { await br.close(); srv.close(); }
  sheet(files, path.join(OUT, 'overview.png'), 2, 780); console.log('sheet: ' + path.join(OUT, 'overview.png'));
}
