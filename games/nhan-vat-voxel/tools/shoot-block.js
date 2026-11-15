// Evidence run for the blocky style (default view): 120 line-up (fps idle + walk), zombies, close-ups (front and 3/4,
// idle / walk / attack), reference cell | blocky pairs for 20 survivors + 10 zombies, phone width, console errors.
// Usage: node tools/shoot-block.js [outDir=shots/block] [sections=grid,zombies,close,ref,phone]
//   env PW = playwright-core path, REF = folder with the owner's cells (default D:/lf-humanoid/ref)
'use strict';
const path = require('path'), fs = require('fs');
const PW = process.env.PW || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'shots', 'block'));
const SECT = new Set((process.argv[3] || 'grid,zombies,close,ref,phone').split(','));
const REF = process.env.REF || 'D:/lf-humanoid/ref';
const PORT = 8794, BASE = `http://127.0.0.1:${PORT}/index.html`;
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 560000);
const CLOSE = (process.env.CLOSE || 'r1c3,r1c11,r2c7,r4c15,r5c12,z3').split(',');
const ANIMS = ['idle', 'walk', 'attack'];
const REFIDS = (process.env.REFIDS || 'r1c1,r1c3,r1c7,r1c11,r1c14,r1c19,r2c2,r2c7,r2c10,r2c16,r3c4,r3c9,r3c15,r4c5,r4c11,r4c15,r5c4,r5c12,r6c1,r6c17').split(',');
const ZIDS = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8', 'z9', 'z10'];

async function compose(br, files, cols, cw, ch, labels, out) {
  const page = await br.newPage({ viewport: { width: 400, height: 300 } });
  const imgs = files.map((f) => 'data:image/' + (f.endsWith('.webp') ? 'webp' : 'png') + ';base64,' + fs.readFileSync(f).toString('base64'));
  const data = await page.evaluate(async ({ imgs, cols, cw, ch, labels }) => {
    const rows = Math.ceil(imgs.length / cols), c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
    const g = c.getContext('2d'); g.fillStyle = '#101116'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < imgs.length; i++) {
      const im = new Image(); im.src = imgs[i]; await im.decode();
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch, k = Math.min(cw / im.width, ch / im.height);
      g.drawImage(im, x + (cw - im.width * k) / 2, y + (ch - im.height * k) / 2, im.width * k, im.height * k);
      if (labels && labels[i]) { g.font = '600 13px system-ui'; g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x + 4, y + 4, g.measureText(labels[i]).width + 10, 19); g.fillStyle = '#fff'; g.fillText(labels[i], x + 9, y + 18); }
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { imgs, cols, cw, ch, labels });
  fs.writeFileSync(out, Buffer.from(data, 'base64')); await page.close();
}

(async () => {
  fs.mkdirSync(path.join(OUT, 'parts'), { recursive: true });
  const srv = require('child_process').spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT), '550'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  const br = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const errors = [], warnings = new Set(), report = {};
  const open = async (q, w = 1400, h = 900) => {
    const page = await br.newPage({ viewport: { width: w, height: h } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(q + ' :: ' + m.text()); if (m.type() === 'warning') warnings.add(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errors.push(q + ' :: pageerror ' + e.message));
    await page.goto(BASE + q, { timeout: 60000 });
    await page.waitForFunction('window.__vc && (window.__vc.ready() || window.__vc.cur())', null, { timeout: 180000 });
    return page;
  };
  const shotInspect = async (page, id, a, orbit, file, wait = 800) => {
    await page.evaluate(({ id, a, orbit }) => { window.__vc.inspect(id); window.__vc.anim(a); window.__vc.orbit(...orbit); }, { id, a, orbit });
    await page.waitForTimeout(wait); await page.locator('#icv').screenshot({ path: file });
  };
  try {
    if (SECT.has('grid')) {
      const page = await open('?tab=survivors&fit=1', 1600, 1000); await page.waitForTimeout(3500);
      report.fitIdle = await page.evaluate(() => window.__stats);
      await page.screenshot({ path: path.join(OUT, 'grid-120-idle.png') });
      await page.evaluate(() => window.__vc.gridAnim('walk')); await page.waitForTimeout(3000);
      report.fitWalk = await page.evaluate(() => window.__stats);
      await page.screenshot({ path: path.join(OUT, 'grid-120-walk.png') });
      await page.evaluate(() => window.__vc.gridAnim('attack')); await page.waitForTimeout(1700);
      report.fitAttack = await page.evaluate(() => window.__stats);
      await page.screenshot({ path: path.join(OUT, 'grid-120-attack.png') });
      await page.close();
      const p2 = await open('?tab=survivors', 1400, 900); await p2.waitForTimeout(1500);
      await p2.screenshot({ path: path.join(OUT, 'tab-survivors.png') }); report.tab = await p2.evaluate(() => window.__stats); await p2.close();
    }
    if (SECT.has('zombies')) {
      const page = await open('?tab=zombies', 1400, 700); await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, 'zombies-idle.png') });
      await page.evaluate(() => window.__vc.gridAnim('walk')); await page.waitForTimeout(1300);
      await page.screenshot({ path: path.join(OUT, 'zombies-walk.png') });
      report.zombies = await page.evaluate(() => window.__stats); await page.close();
    }
    if (SECT.has('close')) {
      const page = await open('?tab=zombies', 640, 720); const files = [], labels = [];
      for (const id of CLOSE) {
        for (const [view, orbit] of [['front', [0, 0.1, 3.6, 1.0]], ['3/4', [0.7, 0.18, 3.6, 1.0]]]) {
          for (const a of ANIMS) {
            if (view === 'front' && a !== 'idle') continue;
            const f = path.join(OUT, 'parts', `close-${id}-${view.replace('/', '')}-${a}.png`);
            await shotInspect(page, id, a, orbit, f, a === 'attack' ? 560 : a === 'walk' ? 700 : 900); files.push(f); labels.push(`${id} · ${view} · ${a}`);
          }
        }
      }
      await compose(br, files, 4, 420, 470, labels, path.join(OUT, 'closeups.png'));
      // faces
      const ff = [];
      for (const id of ['r1c11', 'r2c16', 'r5c12', 'r3c9']) { const f = path.join(OUT, 'parts', `face-${id}.png`); await shotInspect(page, id, 'idle', [0.25, 0.05, 1.6, 1.66], f, 500); ff.push(f); }
      await compose(br, ff, 4, 400, 440, ['r1c11', 'r2c16', 'r5c12', 'r3c9'], path.join(OUT, 'faces.png'));
      await page.close();
    }
    if (SECT.has('ref')) {
      const page = await open('?tab=zombies', 420, 640);
      for (const [ids, dir, out] of [[REFIDS, 'cells', 'ref-vs-block.png'], [ZIDS, 'zcells', 'ref-vs-block-zombies.png']]) {
        const files = [], labels = [];
        for (const id of ids) {
          const f = path.join(OUT, 'parts', `ref-${id}.png`); await shotInspect(page, id, 'idle', [0.18, 0.08, 3.5, 1.0], f, 450);
          files.push(path.join(REF, dir, id + '.png'), f);
          labels.push(id + ' ' + (await page.evaluate(() => document.getElementById('iname').textContent)), 'khối');
        }
        await compose(br, files, 8, 210, 320, labels, path.join(OUT, out));
      }
      await page.close();
    }
    if (SECT.has('phone')) {
      const page = await open('?tab=survivors', 390, 844); await page.waitForTimeout(1500);
      report.phoneOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      report.phone = await page.evaluate(() => window.__stats);
      await page.screenshot({ path: path.join(OUT, 'phone-grid.png') });
      await page.evaluate(() => window.__vc.inspect('r2c7')); await page.waitForTimeout(800);
      report.phoneInspectOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: path.join(OUT, 'phone-inspect.png') });
      await page.close();
      const p3 = await open('?style=vox&tab=survivors&n=24', 1400, 900); await p3.waitForTimeout(1200);
      await p3.screenshot({ path: path.join(OUT, 'toggle-voxel.png') }); report.voxToggle = await p3.evaluate(() => window.__stats); await p3.close();
      const p4 = await open('?tab=bz-heroes', 1400, 900); await p4.waitForTimeout(1200);
      await p4.screenshot({ path: path.join(OUT, 'tab-bz-heroes.png') }); report.bzHeroes = await p4.evaluate(() => window.__stats); await p4.close();
    }
  } finally {
    report.errors = errors; report.warnings = [...warnings];
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    await br.close(); srv.kill(); clearTimeout(kill);
  }
})().catch((e) => { console.error(e); process.exit(1); });
