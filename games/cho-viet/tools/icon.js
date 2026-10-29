#!/usr/bin/env node
/* HUD icon for an item the original never drew one for: the game's own item mesh, toon shader and outline, rendered
 * on a transparent background, trimmed and saved as a 128 px webp like art/items/icons/*.
 *   node games/cho-viet/tools/icon.js <item type> <out.webp>
 *   node games/cho-viet/tools/icon.js 126 games/cho-viet/art/icons/banh-mi.webp
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const [type, out] = process.argv.slice(2);
if (!type || !out) { console.error('usage: node icon.js <item type> <out.webp>'); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(b); });
}).listen(0, async () => {
  const kill = setTimeout(() => { console.error('timeout'); process.exit(1); }, 180000);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 400 } })).newPage();
    await page.goto(`http://localhost:${srv.address().port}/games/casual-farm/index.html?fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 120000 });
    const url = await page.evaluate(async type => {
      const THREE = await import('three');
      const g = window.__mmGame;
      const item = g.view.makeItem(type);
      const scene = new THREE.Scene();
      // Three-quarter view from above, as the original icons are drawn.
      const holder = new THREE.Group();
      holder.add(item);
      item.position.set(0, 0, 0);
      holder.rotation.set(0.55, -0.75, 0);
      scene.add(holder);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(item), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
      const cam = new THREE.OrthographicCamera(-r, r, r, -r, -100, 100);
      cam.position.set(c.x, c.y, c.z + 10); cam.lookAt(c);
      const S = 256, rt = g.renderer, old = new THREE.Vector2(); rt.getSize(old);
      const pr = rt.getPixelRatio(), bg = scene.background;
      rt.setPixelRatio(1); rt.setSize(S, S, false); rt.setClearColor(0x000000, 0);
      rt.render(scene, cam);
      const data = rt.domElement.toDataURL('image/png');
      rt.setPixelRatio(pr); rt.setSize(old.x, old.y, false); rt.setClearColor(0x000000, 1);
      return data;
    }, +type);
    const png = path.join(path.dirname(out), `.${path.basename(out)}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
    require('child_process').execFileSync('py', ['-3.12', '-c', `
from PIL import Image, ImageFilter
im = Image.open(r'''${png}''').convert('RGBA')
# The thick black rim of the original icons.
a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(11))
rim = Image.new('RGBA', im.size, (0, 0, 0, 255)); rim.putalpha(a)
im = Image.alpha_composite(rim, im)
im = im.crop(im.getbbox())
im.thumbnail((128, 128), Image.LANCZOS)
im.save(r'''${out}''', 'WEBP', quality=90)
print(im.size)`], { stdio: 'inherit' });
    fs.unlinkSync(png);
    console.log(`wrote ${out}`);
  } finally {
    clearTimeout(kill);
    await browser.close();
    srv.close();
  }
});
