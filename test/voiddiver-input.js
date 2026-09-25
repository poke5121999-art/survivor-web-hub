/*
 * VOID DIVER — kiểm chuột/phím THẬT (Playwright mouse/keyboard), không gọi VD.input.down trong mã.
 * Sinh ra vì 2026-09-25 mọi bài kiểm khác bấm bằng VD.input.down nên không thấy lớp HUD nuốt cú bấm:
 * trên Pages chuột trái/phải không ra đòn.
 *
 * Chạy:  node test/voiddiver-input.js            (server cục bộ)
 *        VD_BASE=https://poke5121999-art.github.io/survivor-web-hub node test/voiddiver-input.js
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.atlas': 'text/plain', '.css': 'text/css', '.woff2': 'font/woff2' };

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : '')); };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// Phần tử trên cùng tại các điểm rải khắp vùng chơi (tránh dải HUD dưới cùng và góc bản đồ nhỏ).
const topAt = page => page.evaluate(() => {
  const pts = [[0.5, 0.5], [0.3, 0.35], [0.7, 0.35], [0.3, 0.7], [0.7, 0.7], [0.15, 0.5], [0.85, 0.5]];
  return pts.map(([fx, fy]) => { const e = document.elementFromPoint(innerWidth * fx, innerHeight * fy); return e ? e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '') : 'null'; });
});

async function dive(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/games/voiddiver/index.html?campaign=101&seed=3&char=100001');
  const ok = await page.waitForFunction(() => window.VD && VD.dive && VD.dive.state === 'play', null, { timeout: 120000 }).then(() => true, () => false);
  check('[lặn] vào trạng thái play', ok);
  if (!ok) { await page.close(); return; }
  await page.waitForTimeout(1200);
  const tops = await topAt(page);
  check('[lặn] canvas nằm trên cùng ở mọi điểm vùng chơi', tops.every(t => t === 'CANVAS#view'), tops.join(', '));
  // Ngắm: di chuột thật sang hai phía, hướng ngắm của nhân vật phải đổi theo.
  await page.mouse.move(900, 300); await page.waitForTimeout(150);
  const a1 = await page.evaluate(() => VD.stage.player.input.aim);
  await page.mouse.move(300, 500); await page.waitForTimeout(150);
  const a2 = await page.evaluate(() => VD.stage.player.input.aim);
  check('[lặn] di chuột đổi hướng ngắm', !!(a1 && a2 && (a1.x * a2.x + a1.z * a2.z) < 0), JSON.stringify({ a1, a2 }));
  // Chuột trái: ra đòn đánh thường.
  await page.mouse.down({ button: 'left' });
  const lmb = await page.waitForFunction(() => { const p = VD.stage.player; return !!(p.run && p.run.id === VD.Skill.slotSkill(p, 'attack')); }, null, { timeout: 2000 }).then(() => true, () => false);
  await page.mouse.up({ button: 'left' });
  check('[lặn] chuột trái ra đòn đánh thường', lmb);
  await page.waitForFunction(() => !VD.stage.player.run, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  // Chuột phải: skill ô RMB (SkillOne).
  const rmbId = await page.evaluate(() => { const p = VD.stage.player, lo = VD.stage.loadout; return lo && lo.SkillOne >= 0 ? VD.Skill.slotSkill(p, 'skill' + lo.SkillOne) : 0; });
  await page.mouse.down({ button: 'right' });
  const rmb = await page.waitForFunction(id => { const p = VD.stage.player; return !!(p.run && p.run.id === id) || (p.cd[id] || 0) > VD.stage.A.time; }, rmbId, { timeout: 2000 }).then(() => true, () => false);
  await page.mouse.up({ button: 'right' });
  check('[lặn] chuột phải ra skill ô RMB', rmb, 'skill ' + rmbId);
  // Phím thật: Space lướt.
  await page.waitForFunction(() => !VD.stage.player.run, null, { timeout: 4000 }).catch(() => {});
  await page.keyboard.down('Space'); await page.waitForTimeout(80);
  const dash = await page.evaluate(() => { const p = VD.stage.player; return !!(p.run && p.run.id === VD.Skill.slotSkill(p, 'dash')); });
  await page.keyboard.up('Space');
  check('[lặn] Space lướt', dash);
  check('[lặn] không pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();
}

async function lounge(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base + '/games/voiddiver/index.html?lounge=1');
  const ok = await page.waitForFunction(() => window.VD && VD.stage && VD.stage.player && VD.stage.mode === 'lounge' && !document.querySelector('.vd-loading'), null, { timeout: 120000 }).then(() => true, () => false);
  check('[sảnh] nạp xong', ok);
  if (ok) {
    await page.waitForTimeout(1500);
    const tops = await topAt(page);
    // Sảnh có nhãn tên NPC nổi trên cảnh; chúng không được chặn chuột.
    check('[sảnh] canvas nằm trên cùng ở mọi điểm vùng chơi', tops.every(t => t === 'CANVAS#view'), tops.join(', '));
  }
  await page.close();
}

(async () => {
  let srv = null, base = process.env.VD_BASE;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
  try { await dive(browser, base); await lounge(browser, base); }
  catch (e) { fail++; console.log('  FAIL exception: ' + e.message); }
  await browser.close();
  if (srv) srv.close();
  console.log(`==> ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
