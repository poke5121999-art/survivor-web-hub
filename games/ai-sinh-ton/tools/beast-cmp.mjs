// Old | new | reference sheets for the block beasts (Addendum 11 item 5). Shoots every beast's forms side by side on
// beast-demo.html at two cameras (a 3/4 portrait view at lod portrait, a high battle-like view at lod battle) into
// .chk/a11/bbeast/<tag>/, then, with --sheet, tiles <old> | <new> | a Minecraft Dungeons crop per beast into
// .chk/a11/bbeast/cmp-<id>.png. Point AST_BASE at a server of another checkout to shoot the old build.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/beast-cmp.mjs --tag=new [--only=tegiap,nhim]
//        node games/ai-sinh-ton/tools/beast-cmp.mjs --sheet
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { serve, launch, open, ROOT, sheet } from './pw.mjs';

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const OUT = path.join(ROOT, '.chk', 'a11', 'bbeast');
const IDS = ['tegiap', 'nhim', 'loc', 'chon', 'ech', 'cu', 'duoi', 'kyda', 'oc', 'haily', 'bosat', 'bao', 'nhen', 'muc'];
const ONLY = arg('only') ? arg('only').split(',') : IDS;
const DEMO = '/games/ai-sinh-ton/beast-demo.html';

if (process.argv.includes('--stats')) {
  // draw calls (meshes) and triangles per form at both lods, as JSON lines into .chk/a11/bbeast/stats-<tag>.json
  const tag = arg('tag') || 'new'; const srv = await serve(); const br = await launch();
  try {
    const d = await open(br, srv.base, 'desktop', 'shot=1&freeze=1&keys=tegiap.1', { path: DEMO, fresh: true });
    const rows = await d.page.evaluate(async () => {
      const src = [...document.scripts].map((s) => s.textContent).join('').match(/beast\/index\.js\?v=(\w+)/)[1];
      const { buildBeast } = await import(`/games/ai-sinh-ton/js/view/beast/index.js?v=${src}`);
      return window.__demo.keys.map((k) => {
        const [id, f] = k.split('.'); const r = { key: k };
        for (const lod of ['battle', 'portrait']) {
          const b = buildBeast({ id, form: +f[0], branch: f[1] || null }, { lod }); let tri = 0;
          for (const m of b.root.children) if (m.geometry) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
          r[lod] = { calls: b.drawCalls, tri }; b.dispose();
        }
        return r;
      });
    });
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `stats-${tag}.json`), JSON.stringify(rows, null, 1));
    console.log(rows.map((r) => `${r.key} battle ${r.battle.calls}dc ${r.battle.tri}t portrait ${r.portrait.calls}dc ${r.portrait.tri}t`).join('\n'));
  } finally { await br.close(); srv.close(); }
} else if (process.argv.includes('--sheet')) {
  const ref = path.join(OUT, 'ref-mcd.png');
  // a crop of the reference horde: block mobs seen from the same high three-quarter camera
  execFileSync('python3', ['-c', `from PIL import Image; Image.open('${os.homedir()}/handoff/ai-sinh-ton-refs/look-9-horde-grass.webp').convert('RGB').crop((860,400,1300,700)).save('${ref}')`]);
  for (const id of ONLY) {
    const files = [];
    for (const v of ['front', 'high']) for (const t of ['old', 'new']) files.push(path.join(OUT, t, `cmp-${id}-${v}.png`));
    files.splice(2, 0, ref); files.push(ref);
    if (files.every((f) => fs.existsSync(f))) sheet(files, path.join(OUT, `cmp-${id}.png`), 3, 640);
  }
  console.log(`sheets in ${OUT}`);
} else {
  const tag = arg('tag') || 'new'; const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const srv = await serve(); const br = await launch();
  try {
    for (const [v, lod] of [['front', 'portrait'], ['high', 'battle']]) {
      const d = await open(br, srv.base, 'desktop', `shot=1&freeze=1&lod=${lod}&keys=tegiap.1`, { path: DEMO, fresh: true });
      for (const id of ONLY) {
        await d.page.evaluate(([id, lod, v]) => {
          const D = window.__demo; const ks = D.keys.filter((k) => k.startsWith(id + '.'));
          D.layout(ks, { lod, cols: ks.length, gap: 2.0 });
          const w = ks.length * 2.0; D.view(v === 'front' ? 0.55 : 0.75);
          if (v === 'high') { D.camera.position.set(0, w * 0.9 + 1, w * 0.7 + 0.8); D.camera.lookAt(0, 0.4, 0); } else { D.camera.position.set(0, 1.4, w * 0.95 + 1.2); D.camera.lookAt(0, 0.6, 0); }
          D.set({ anim: 'idle' }); D.step(1 / 30, 6);
        }, [id, lod, v]);
        await d.page.screenshot({ path: path.join(dir, `cmp-${id}-${v}.png`) });
      }
      await d.ctx.close();
    }
  } finally { await br.close(); srv.close(); }
  console.log(`shots in ${dir}`);
}
