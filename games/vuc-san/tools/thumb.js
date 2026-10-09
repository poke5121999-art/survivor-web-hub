#!/usr/bin/env node
/*
 * Chụp ảnh thẻ hub (assets/thumbnails/vuc-san.png, 640x360) từ một trận thật: thợ lặn soi đèn vào một cá mập.
 * Dùng:  node games/vuc-san/tools/thumb.js [--seed 7] [--map B01] [--out <tệp.png>]
 * Chụp ở 1280x720 rồi thu nhỏ một nửa bằng Python PIL (canvas WebGL không chụp được ở deviceScaleFactor < 1).
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const T = require(path.join(__dirname, '..', '..', '..', 'test', 'vuc-san-lib.js'));

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

async function main() {
  const seed = arg('seed', '7'), map = arg('map', 'B01');
  const out = path.resolve(arg('out', path.join(T.ROOT, 'assets', 'thumbnails', 'vuc-san.png')));
  const srv = await T.serve(), br = await T.browser();
  const { page, problems } = await T.open(br, srv.base, 'index.html?go=match&manual=1&team=diver&seed=' + seed + '&map=' + map,
    { width: 1280, height: 720 });
  await page.waitForFunction(() => window.__ready && window.VS_DEBUG.match(), null, { timeout: 120000 });
  const pose = await page.evaluate(() => {
    const D = window.VS_DEBUG, m = D.match();
    while (m.phase !== 'play') D.step(60);
    D.step(60 * 12);
    const me = m.actors.find((a) => a.ctrl === 'human') || m.actors[0];
    const shark = m.actors.find((a) => a.team === 'shark');
    const dir = me.face || 1;
    D.teleport(shark.id, me.x + dir * 6, me.y + 0.5);
    D.intent(me.id, { aimX: me.x + dir * 6, aimY: me.y + 0.5, light: false });
    shark.intent.mx = -dir; shark.intent.my = 0;
    D.step(20);
    return { me: me.id, shark: shark.defId, x: me.x.toFixed(1), y: me.y.toFixed(1), t: m.t.toFixed(1) };
  });
  await page.waitForTimeout(1500);
  const raw = out.replace(/\.png$/, '.raw.png');
  await page.screenshot({ path: raw });
  execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").resize((640, 360), Image.LANCZOS).save(sys.argv[2], optimize=True)', raw, out]);
  require('fs').unlinkSync(raw);
  console.log('ảnh thẻ: ' + out + '  ' + JSON.stringify(pose));
  if (problems.length) { console.error('lỗi trang:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
  await br.close(); srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
