// Films a solo boss fight as an mp4: an orbit intro around the boss, a bot-driven fight in third person
// (aims at the boss, strafes, uses F, C and Q when ready), then a slow kill-cam when it falls.
// Every frame is stepped with __sim and screenshotted, so the clip is smooth however slow the machine renders.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [BOSS=dragon] [HERO=sam] [VIEW=fp] [SECS=40] [TOD=0.7] [FFMPEG=ffmpeg] node games/blockade-z/tools/film.js [out.mp4]
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const BOSS = process.env.BOSS || 'dragon'; const HERO = process.env.HERO || 'sam'; const VIEW = process.env.VIEW === 'fp' ? 'fp=1' : 'tp=1';
const SECS = +(process.env.SECS || 40); const TOD = process.env.TOD || '0.6'; const FPS = 30;
const OUTF = process.argv[2] || path.join(__dirname, '..', '..', '..', `.film-${BOSS}.mp4`);
const FR = OUTF.replace(/\.mp4$/, '') + '-frames'; fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let n = 0;
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'film@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + `/games/blockade-z/index.html?lang=vi&${VIEW}&autostart=1&nolock=1&seed=7&noaudio=1&q=high&tod=${TOD}&weather=clear&hero=${HERO}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    // the real-time loop stops; only __sim advances the game, one film frame at a time
    await page.evaluate('__G.renderer.setAnimationLoop(null)');
    await page.addStyleTag({ content: 'a.hub, #fps, .dbg, #banner, #wave { display: none !important; }' });
    const frame = async () => { await page.screenshot({ path: path.join(FR, `f${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 }); };

    await page.evaluate(`(() => { const G = __G; G.god = true; G.state = 'playing'; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
      const P = G.player; P.pos.set(0, 0, 7); P.yaw = 0; P.pitch = 0.05; P.hp = P.maxHp;
      const z = G.zombies.spawn('${BOSS}', 10, { x: 0, z: -10, dir: [0, 1], name: 'boss' }); z.pos.set(0, z.pos.y, -10);
      z.maxHp = z.hp = Math.max(z.maxHp, 26000);
      window.__film = { z, t: 0, side: 1, next: 0, hp0: z.maxHp };
      __sim(0.2); })()`);

    // intro: the camera circles the boss while it wakes up; the player is not on screen yet
    const INTRO = 3.5;
    for (let t = 0; t < INTRO; t += 1 / FPS) {
      await page.evaluate(`(() => { const G = __G; const F = __film; const z = F.z; const P = G.player; P.input.fire = false;
        __sim(${1 / FPS}); const k = ${t / INTRO}; const s = z.T.scale; const a = 1.2 - k * 1.6; const r = 8 + s * 1.6 - k * 2;
        const cx = z.pos.x; const cy = z.pos.y + 1.2 * s; const cz = z.pos.z;
        G.camera.position.set(cx + Math.sin(a) * r, 2.5 + k * 2.5 + s * 0.3, cz + Math.cos(a) * r); G.camera.lookAt(cx, cy, cz);
        G.renderer.clear(); G.renderer.render(G.scene, G.camera); })()`);
      await frame();
    }

    // fight: the bot keeps the boss in its sights, circles it, and spends every skill the moment it is ready
    let dead = -1;
    for (let i = 0; i < (SECS + 8) * FPS; i++) {
      const r = await page.evaluate(`(() => { const G = __G; const F = __film; const z = F.z; const P = G.player; const H = G.hero; F.t += ${1 / FPS};
        if (z.alive) {
          const s = z.T.scale; const ty = z.pos.y + 1.25 * s; const dx = z.pos.x - P.pos.x; const dz = z.pos.z - P.pos.z; const d = Math.hypot(dx, dz);
          const lead = z.vel ? 0.25 : 0; const ax = z.pos.x + (z.vel ? z.vel.x * lead : 0) - P.pos.x; const az = z.pos.z + (z.vel ? z.vel.z * lead : 0) - P.pos.z;
          const wy = Math.atan2(-ax, -az); let dy = wy - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy * 0.35;
          const wp = Math.atan2(ty - (P.pos.y + 1.6), Math.hypot(ax, az)); P.pitch += (wp - P.pitch) * 0.35;
          if (F.t > F.next) { F.side = -F.side; F.next = F.t + 2.5 + Math.random() * 2; }
          // world-space wish: circle the boss, stay on the open plaza, keep 9-20 m away; then into stick axes
          const sy = Math.sin(P.yaw); const cy = Math.cos(P.yaw); let mx = cy * F.side * 0.8; let mz = -sy * F.side * 0.8;
          const pr = Math.hypot(P.pos.x, P.pos.z); if (pr > 9) { mx -= (P.pos.x / pr) * 0.9; mz -= (P.pos.z / pr) * 0.9; }
          if (d < 9) { mx -= (dx / d) * 0.7; mz -= (dz / d) * 0.7; } else if (d > 20) { mx += (dx / d) * 0.6; mz += (dz / d) * 0.6; }
          P.touch.x = mx * cy - mz * sy; P.touch.y = mx * sy + mz * cy;
          P.input.jump = Math.random() < 0.012; P.input.fire = Math.abs(dy) < 0.4;
          const ready = (k) => H.slots[k] && H.slots[k].n > 0;
          if (F.t > 1.5 && ready('s2')) H.use('s2');
          if (F.t > 3 && ready('s1') && d < 20) H.use('s1');
          // the film wants the ultimate on screen twice, so it is topped up at fixed beats
          if ((F.t > 12 && !F.u1) || (F.t > 27 && !F.u2)) { H.ult = 1; if (F.t > 27) F.u2 = 1; else F.u1 = 1; }
          if (H.ult >= 1) H.use('ult');
          // keeps the fight near the target length: if the boss is ahead of the schedule, a little extra damage lands with the hits
          const want = F.hp0 * Math.max(0.02, 1 - F.t / ${SECS - 2}); if (z.hp > want + F.hp0 * 0.04) z.hp -= (z.hp - want) * 0.02;
          if (F.t > ${SECS - 2}) z.hp = Math.min(z.hp, 1);
        } else { P.input.fire = false; P.touch.x = 0; P.touch.y = 0; }
        __sim(${1 / FPS}); P.hp = Math.max(P.hp, P.maxHp * 0.35); P.alive = true; if (G.state !== 'playing') G.state = 'playing';
        return { alive: z.alive, hp: Math.round(z.hp), t: +F.t.toFixed(2) }; })()`);
      await frame();
      if (i % 150 === 0) console.log('t', r.t, 'boss hp', r.hp, 'frames', n);
      if (!r.alive) { dead = r.t; break; }
    }
    console.log('boss down at', dead);

    // kill-cam: slow motion orbit around where it fell
    const OUTRO = 4.5;
    await page.evaluate('__G.player.input.fire = false; __film.at = __film.z.pos.clone(); __film.s = __film.z.T.scale');
    for (let t = 0; t < OUTRO; t += 1 / FPS) {
      await page.evaluate(`(() => { const G = __G; const F = __film; const k = ${t / OUTRO};
        __sim(${(1 / FPS) * 0.35}); const a = 0.6 + k * 1.4; const r = 8 + F.s * 2.4 + k * 4;
        G.camera.position.set(F.at.x + Math.sin(a) * r, 2.2 + k * 4, F.at.z + Math.cos(a) * r); G.camera.lookAt(F.at.x, Math.max(1, F.at.y * 0.5 + 1.2), F.at.z);
        G.renderer.clear(); G.renderer.render(G.scene, G.camera); })()`);
      await frame();
    }
    if (errs.length) console.log('page errors: ' + errs.slice(0, 3).join(' | '));
  } finally { await br.close(); srv.close(); }
  const ff = process.env.FFMPEG || 'ffmpeg';
  execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FR, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUTF], { stdio: 'inherit' });
  console.log('wrote', OUTF, n, 'frames', (n / FPS).toFixed(1) + ' s');
})().catch((e) => { console.error(e); process.exit(2); });
