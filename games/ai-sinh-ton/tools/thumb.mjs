// Hub card thumbnail (assets/thumbnails/ai-sinh-ton.png, 640x360) rendered from the game: three portrait shots
// side by side (a boss fight, the home screen, the gacha), each cropped to a third of the card.
// Usage: node games/ai-sinh-ton/tools/thumb.mjs
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { serve, launch, open, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'thumb'); fs.mkdirSync(OUT, { recursive: true });
const DEST = path.join(ROOT, 'assets', 'thumbnails', 'ai-sinh-ton.png');
const srv = await serve(); const br = await launch();
const shots = [];
try {
  const fight = await open(br, srv.base, 's22', 'noaudio=1&q=high&autostart=1&stage=5&seed=11&wave=5&autoult=1&autopick=1');
  await fight.page.evaluate(() => { __sim(9); __step(4); });
  shots.push(path.join(OUT, 'fight.png')); await fight.page.screenshot({ path: shots[0] }); await fight.ctx.close();

  const home = await open(br, srv.base, 's22', 'noaudio=1&q=high');
  await home.page.evaluate(() => { __step(30); });
  shots.push(path.join(OUT, 'home.png')); await home.page.screenshot({ path: shots[1] });
  await home.page.evaluate(() => { __G.goto('gacha', {}); __step(40); });
  shots.push(path.join(OUT, 'gacha.png')); await home.page.screenshot({ path: shots[2] }); await home.ctx.close();
} finally { await br.close(); srv.close(); }

const py = `
import sys
from PIL import Image
dest=sys.argv[1]; files=sys.argv[2:]
W=[214,213,213]; card=Image.new('RGB',(640,360),(16,14,22)); x=0
for f,w in zip(files,W):
    im=Image.open(f).convert('RGB')
    h=int(im.width*360/w); top=max(0,int((im.height-h)*0.42))
    card.paste(im.crop((0,top,im.width,top+h)).resize((w,360),Image.LANCZOS),(x,0)); x+=w
card.save(dest); print('thumb', card.size, dest)`;
console.log(execFileSync('python3', ['-c', py, DEST, ...shots]).toString().trim());
