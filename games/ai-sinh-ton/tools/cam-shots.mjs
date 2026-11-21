// Side-by-side pictures, Minecraft Dungeons frame | this game's frame, in the same three situations: walking over a
// bridge to the next area, a crowded fight, the boss arena. MCD frames come from the owner's clip
// (~/handoff/ast-par/cam/mcd/f<min>_<sec>.png, see mcd-camera.md); ours are taken at s22 with the HUD on.
// Out: .chk/cam/cmp-walk.png, cmp-fight.png, cmp-boss.png (and the raw frames, tagged).
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/cam-shots.mjs [--tag=after] [--phone=s22]
//        AST_BASE=http://... takes the frames from another build (pass --tag=before).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'cam'); fs.mkdirSync(OUT, { recursive: true });
const MCD_DIR = path.join(os.homedir(), 'handoff', 'ast-par', 'cam', 'mcd');
const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const TAG = arg('tag') || 'after'; const PHONE = arg('phone') || 's22';
const SHOTS = [
  { name: 'walk', mcd: 'f12_55.png', label: 'MCD 12:55 qua cầu sang khu kế', q: 'stage=1&wave=1&seed=1', how: 'walk' },
  { name: 'fight', mcd: 'f13_05.png', label: 'MCD 13:05 đánh đông quái', q: 'stage=15&wave=3&seed=15', how: 'fight' },
  { name: 'boss', mcd: 'f43_17.png', label: 'MCD 43:17 sân boss', q: 'stage=8&wave=5&seed=8', how: 'boss' },
];

// the run from pad 1 to pad 2 before the first wave comes out (the sim's own run snaps under __sim, so the tool starts
// it the way the host does and steps frames until the team is a little past the middle of the bridge)
const WALK = () => {
  const G = window.__G; const H = G.host; const W = H.world; H.sectionLock = true;
  W.travelTo(W.sec + 1); const b = W.walkBridge(); let m = 0;
  while (W.busy && m < 600 && b && Math.hypot(W.shift.x, W.shift.z) < b.midAt * 0.6) { window.__step(1); m++; }
  return { m, busy: W.busy, sec: W.sec };
};

const srv = await serve();
const br = await launch();
try {
  for (const S of SHOTS) {
    const r = await openPage(br, srv.base, PHONE, `autostart=1&${S.q}&autoult=1&autopick=1&noaudio=1&q=low`, { freeze: true });
    let info = {};
    if (S.how === 'walk') info = await r.page.evaluate(WALK);
    else if (S.how === 'fight') { await r.page.evaluate(() => window.__sim(14)); await r.page.evaluate(() => window.__step(30)); }
    else { await r.page.evaluate(() => window.__sim(9)); await r.page.evaluate(() => window.__step(200)); }
    info.cam = await r.page.evaluate(() => { const C = window.__G.cam; return { dist: +(C.dist || 0).toFixed(1), bossK: C.bossK, alive: window.__G.B.enemies.filter((e) => e.alive).length }; });
    const raw = path.join(OUT, `${TAG}-${S.name}.png`); await r.page.locator('#frame').screenshot({ path: raw });
    console.log(`${S.name}: ${JSON.stringify(info)} -> ${raw}`);
    await r.ctx.close();
    const py = `
import sys
from PIL import Image, ImageDraw, ImageFont
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB'); H=540
a=a.resize((int(a.width*H/a.height),H)); b=b.resize((int(b.width*H/b.height),H))
s=Image.new('RGB',(a.width+b.width+12,H+40),(16,16,20)); s.paste(a,(0,40)); s.paste(b,(a.width+12,40))
d=ImageDraw.Draw(s)
try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
except Exception: f=None
d.text((10,8),sys.argv[4],fill=(255,255,255),font=f); d.text((a.width+22,8),sys.argv[5],fill=(255,255,255),font=f)
s.save(sys.argv[3])`;
    const out = path.join(OUT, `cmp-${S.name}${TAG === 'after' ? '' : '-' + TAG}.png`);
    execFileSync('python3', ['-c', py, path.join(MCD_DIR, S.mcd), raw, out, S.label, `Ải Sinh Tồn (${TAG}) ${S.q.replace(/&/g, ' ')}`]);
    console.log('sheet: ' + out);
  }
} finally { await br.close(); srv.close(); }
