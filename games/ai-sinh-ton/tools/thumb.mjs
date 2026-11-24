// Hub card thumbnail (assets/thumbnails/ai-sinh-ton.png, 640x360) rendered from the game: a boss fight in the landscape
// frame, cut to 16:9 around the middle (the HUD strips at the top and bottom stay in), with the world map in a corner inset.
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
  await home.ctx.close();
} finally { await br.close(); srv.close(); }

const py = `
import sys
from PIL import Image, ImageDraw
dest=sys.argv[1]; fight, home = sys.argv[2], sys.argv[3]
im=Image.open(fight).convert('RGB'); w=int(im.height*16/9); x0=(im.width-w)//2
card=im.crop((x0,0,x0+w,im.height)).resize((640,360),Image.LANCZOS)
hm=Image.open(home).convert('RGB'); iw=int(hm.width*0.42); ih=int(hm.height*0.62)
ins=hm.crop((int(hm.width*0.20),int(hm.height*0.30),int(hm.width*0.20)+iw,int(hm.height*0.30)+ih)).resize((200,int(200*ih/iw)),Image.LANCZOS)
d=ImageDraw.Draw(card); X,Y=430,250-ins.height+100
d.rounded_rectangle((X-4,Y-4,X+ins.width+4,Y+ins.height+4),8,fill=(255,200,90))
card.paste(ins,(X,Y)); card.save(dest); print('thumb', card.size, dest)`;
console.log(execFileSync('python3', ['-c', py, DEST, shots[0], shots[1]]).toString().trim());
