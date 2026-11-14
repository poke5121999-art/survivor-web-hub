// Records a short clip of a bot fight as frames, an mp4 and a contact sheet, to judge motion and feedback.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [QUERY="fp=1&hero=mua&wave=4"] [SECS=6] [FPS=20] [WARM=8] [EVERY=5] node games/blockade-z/tools/clip.js <outDir>
// WARM = seconds of fight simulated before recording starts; EVERY = one sheet tile per that many frames.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const OUT = process.argv[2] || '.chk-polish/clip'; fs.mkdirSync(OUT, { recursive: true });
const SECS = +(process.env.SECS || 6); const FPS = +(process.env.FPS || 20); const WARM = +(process.env.WARM || 8); const EVERY = +(process.env.EVERY || 5);
const QUERY = process.env.QUERY || 'fp=1&hero=mua&wave=4';
const BOT = `(() => { const G = __G; const P = G.player; let t = null; let best = 1e9;
  for (const z of G.zombies.list) { if (!z.alive) continue; const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z); if (d < best) { best = d; t = z; } }
  P.input.fire = false;
  if (t) { const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, dy = t.pos.y + 1.2 * t.T.scale - (P.pos.y + 1.6); const yaw = Math.atan2(-dx, -dz); let d = yaw - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    P.yaw += d * 0.35; P.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - P.pitch) * 0.35; P.input.fire = Math.abs(d) < 0.2; }
})()`;
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: process.env.BZ_CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'clip@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror ' + e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&' + QUERY + '&autostart=1&nolock=1&god=1&noaudio=1&seed=' + (process.env.SEED || 5));
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    await page.evaluate("__setShot('plaza')");
    if (process.env.SETUP) await page.evaluate(process.env.SETUP);
    for (let i = 0; i < WARM * 10; i++) { await page.evaluate(BOT); await page.evaluate('__sim(0.1)'); }
    for (const f of fs.readdirSync(OUT)) if (/^f\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(OUT, f));
    const n = Math.round(SECS * FPS);
    for (let i = 0; i < n; i++) {
      await page.evaluate(BOT); await page.evaluate(`__sim(${1 / FPS}, ${1 / FPS / 2})`);
      await page.screenshot({ path: path.join(OUT, 'f' + String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 80 });
    }
    console.log('frames ' + n);
  } finally { await br.close(); srv.close(); }
  const ff = process.env.FFMPEG || 'ffmpeg';
  try {
    execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, 'f%04d.jpg'), '-pix_fmt', 'yuv420p', path.join(OUT, 'clip.mp4')]);
    execFileSync(ff, ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'f%04d.jpg'), '-vf', `select=not(mod(n\\,${EVERY})),scale=480:-1,tile=4x6`, '-frames:v', '1', path.join(OUT, 'sheet.jpg')]);
    console.log('wrote clip.mp4 and sheet.jpg');
  } catch (e) { console.log('ffmpeg not run (' + e.message.split('\n')[0] + '); frames are in ' + OUT); }
})().catch((e) => { console.error(e); process.exit(2); });
