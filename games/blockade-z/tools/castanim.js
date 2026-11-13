// Skill body animation review: every hero, every slot (F, C, Q), cast on the real game, frozen at three moments and
// photographed from a side camera that frames the body. Writes one PNG sheet per hero (rows = slot, columns = moment).
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/castanim.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.castanim-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const MOMENTS = [0.25, 0.5, 0.75];
const SHEET_PY = [
  'from PIL import Image, ImageDraw',
  'import sys, os',
  'fs = sys.argv[2:]',
  'W, H = 300, 450',
  'im = Image.new("RGB", (W * 3, H * 3), (20, 20, 24))',
  'for n, f in enumerate(fs):',
  '    if f == "-": continue',
  '    t = Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS)',
  '    im.paste(t, ((n % 3) * W, (n // 3) * H))',
  '    ImageDraw.Draw(im).text(((n % 3) * W + 6, (n // 3) * H + 6), os.path.basename(f), fill=(255, 255, 0))',
  'im.save(sys.argv[1])',
].join('\n');

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'castanim@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?tp=1&autostart=1&nolock=1&seed=4&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const heroes = await page.evaluate(() => BZ.HEROES.map((h) => [h.id, h.s1.key, h.s2.key, h.ult.key]));
    for (let i = 0; i < heroes.length; i++) {
      if (ONLY && !ONLY.includes(heroes[i][0])) continue;
      const files = [];
      for (const [si, slot] of ['s1', 's2', 'ult'].entries()) {
        const key = heroes[i][si + 1];
        const entry = await page.evaluate(`(() => { const C = BZ.CAST_ANIM['${key}']; return C ? { dur: C.dur, prop: C.prop || null } : null; })()`);
        check(!!entry, `${heroes[i][0]}.${key} has a cast animation` + (entry ? ` (${entry.dur}s${entry.prop ? ', ' + entry.prop : ''})` : ''));
        if (!entry) { for (let c = 0; c < MOMENTS.length; c++) files.push(null); continue; }
        await page.evaluate(`(() => { const G = __G; __select.open(); __select.pick(${i}); __select.go(); __sim(0.2);
          G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear(); while (G.gear.turrets.length) G.gear.removeTurret(0);
          G.god = true; const P = G.player; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.08; P.vel.set(0, 0, 0); P.hp = 60; __sim(0.1);
          for (const zz of [-3, -5, -7]) for (const x of [-1.2, 0, 1.2]) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(x, 0, zz); z.hp = z.maxHp = 800; z.speed = 0; z.attackT = 99; if ('${key}' === 'drain') G.zombies.applyStatus(z, 'poison', 1); }
          G.hero.ult = 1; G.hero.t.ultOn = 0; G.hero.use('${slot}'); })()`);
        let t = 0;
        for (let c = 0; c < MOMENTS.length; c++) {
          const want = entry.dur * MOMENTS[c];
          // step the game to the moment, freeze it, and put a three-quarter camera (front-right, 4.3 m)
          await page.evaluate(`(() => { const G = __G; G.state = 'playing'; __sim(${Math.max(1 / 60, want - t)}); G.state = 'paused';
            const P = G.player; const c = G.camera; const sg = '${key}' === 'artillery' ? -1 : 1; const rx = Math.cos(P.yaw) * sg, rz = -Math.sin(P.yaw) * sg;
            c.fov = 50; c.updateProjectionMatrix(); const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); c.position.set(P.pos.x + rx * 3.6 + fx * 2.4, P.pos.y + 1.1, P.pos.z + rz * 3.6 + fz * 2.4); c.lookAt(P.pos.x, P.pos.y + 0.95, P.pos.z); c.updateMatrixWorld(); __sim(0);
            for (const id of ['banner', 'announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); } })()`);
          t = want;
          await page.waitForTimeout(150);
          const f = path.join(OUT, `${heroes[i][0]}-${slot}-${c}.png`);
          await page.screenshot({ path: f, clip: { x: 400, y: 0, width: 480, height: 720 } });
          files.push(f);
        }
      }
      const sheet = path.join(OUT, `sheet-${heroes[i][0]}.png`);
      const py = path.join(OUT, '_sheet.py'); fs.writeFileSync(py, SHEET_PY);
      execFileSync('python', [py, sheet, ...files.map((f) => f || '-')]);
      console.log('sheet ' + sheet);
    }
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
