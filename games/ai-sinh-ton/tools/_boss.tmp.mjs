import { serve, launch, open } from './pw.mjs';
const out = process.argv[2]; const stages = process.argv.slice(3);
const srv = await serve(); const br = await launch();
{ const { page, ctx } = await open(br, srv.base, 's22', 'autostart=1&stage=21&noaudio=1');
  const url = await page.evaluate(async () => { const m = await import('./js/view/voxtex.js?v=20261121a'); return m.voxAtlas().tex.image.toDataURL(); });
  (await import('node:fs')).writeFileSync(out + '/atlas.png', Buffer.from(url.split(',')[1], 'base64')); await ctx.close(); }
for (const st of stages) {
  for (const w of [4, 5]) {
    const { page, ctx, problems } = await open(br, srv.base, 's22', `autostart=1&stage=${st}&wave=${w}&noaudio=1&seed=${st}`);
    await page.evaluate(() => window.__sim(8)); await page.evaluate(() => window.__step(4)); await page.waitForTimeout(300);
    await page.locator('#frame').screenshot({ path: `${out}/s${st}-w${w}.png` });
    if (problems.length) console.log(st, w, problems.join(' | '));
    await ctx.close();
  }
}
await br.close(); srv.close(); process.exit(0);
