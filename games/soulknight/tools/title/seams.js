// Chụp phóng to khúc khăn quàng trước/sau khi nở tam giác (node tools/title/seams.js <url> <thư mục ra>), lấy thẳng từ canvas #sk-title.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await p.goto(process.argv[2] + '?title=1');
  await p.waitForFunction(() => window.SK && SK.title && SK.title.ready, null, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1200));
  for (const [name, nd] of [['before', true], ['after', false]]) {
    await p.evaluate(v => { SK.title.noDilate = v; }, nd);
    await new Promise(r => setTimeout(r, 400));
    const url = await p.evaluate(() => {
      const c = document.getElementById('sk-title'), k = c.width / 1280, o = document.createElement('canvas');
      o.width = 260 * k * 2; o.height = 160 * k * 2;
      const x = o.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(c, 760 * k, 180 * k, 260 * k, 160 * k, 0, 0, o.width, o.height);   // phóng 2x thêm
      return o.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(process.argv[3], 'scarf-' + name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close();
})();
