// Film a scripted moment: step the match by hand, screenshot every frame, encode an mp4 and a contact sheet for review.
//   node tools/film.js <name> <query> <startTick> <frames> [evalJS] [shotJSON] [every=1] [sheetDir=clips] [tiles=9]
// Opens ?manual&noaudio&autostart&<query>, steps <startTick> ticks (drawing the last 600 so effects have aged as in play),
// runs evalJS once, then for each frame steps <every> ticks and draws one frame. If evalJS defines window.__filmUser(i), it runs
// before each frame (follow a unit with __setShot, keep a tower's hp low, ...).
// Writes .chk/clips/<name>.mp4 (30 fps) and .chk/<sheetDir>/<name>.png: <tiles> evenly spaced frames in a 3-column grid.
// The HUD is hidden (FILM_HUD=1 keeps it). Helpers for evalJS: __film.follow(id, dist), __film.hot(dist) (follow the closest enemy
// pair), __film.at(x, z, dist), __film.nearestFoe(id).
'use strict';
const { session, open, CHK, fs, path } = require('./lib.js');
const { execFileSync } = require('child_process');

const [name = 'film', query = '', start = '300', count = '60', js = '', shot = '', every = '1', sheetDir = 'clips', tiles = '9'] = process.argv.slice(2);
const FFMPEG = '/usr/bin/ffmpeg';

session(async (br, base) => {
  const g = await open(br, base, 'manual&noaudio&autostart&' + query);
  const fatal = await g.page.evaluate(() => { const f = document.getElementById('fatal'); return f && f.style.display === 'block' ? f.textContent : ''; });
  if (fatal) { console.log('FATAL', fatal); process.exitCode = 1; return; }
  const tmp = path.join(CHK, 'clips', '.frames-' + name);
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const ok = await g.page.evaluate(({ start, shot, js }) => {
    try {
      const G = window.__G;
      let each = null;
      const pose = (x, z, dist) => window.__setShot({ x, z, dist, pitch: 57 });
      window.__film = {
        at: (x, z, dist = 34) => { each = null; pose(x, z, dist); },
        follow: (id, dist = 30) => { each = () => { const u = G.match.units[id]; pose(u.x, u.z, dist); }; each(); },
        nearestFoe: (id) => { const m = G.match, u = m.units[id]; let b = null, bd = 1e9; for (const o of m.units) if (o.alive && o.team !== u.team) { const d = Math.hypot(o.x - u.x, o.z - u.z); if (d < bd) { bd = d; b = o; } } return b; },
        hot: (dist = 30) => { let fx = 0, fz = 0; each = () => { const m = G.match; let bd = 1e9, x = fx, z = fz; for (const a of m.units) for (const b of m.units) if (a.alive && b.alive && a.team < b.team) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; x = (a.x + b.x) / 2; z = (a.z + b.z) / 2; } } if (!fx && !fz) { fx = x; fz = z; } fx += (x - fx) * 0.08; fz += (z - fz) * 0.08; pose(fx, fz, dist); }; each(); },
        // A test shot from unit `from` that lands on (x, z) next tick. The sim resolves the hit, so events are the real ones.
        shootAt: (from, x, z, dmg = 99999, vis = 'shell') => { const m = G.match, u = m.units[from], a = Math.atan2(z - u.z, x - u.x), dx = Math.cos(a), dz = Math.sin(a), sx = x - dx * 3, sz = z - dz * 3;
          m.shots.push({ id: m.nextId++, team: u.team, owner: u.id, color: u.color, x: sx, z: sz, px: sx, pz: sz, dx, dz, speed: 40, left: 6, dmg, splash: 0, knock: 0, slow: 0, slowDur: 0, r: 0.3, vis, over: true }); },
        kill: (id) => { const m = G.match, v = m.units[id], f = window.__film.nearestFoe(id); window.__film.shootAt(f.id, v.x, v.z); },
        // Put up to n enemies of unit `id` in a loose cluster `d` ahead of it, facing it.
        gather: (id, d = 5.5, n = 3) => { const m = G.match, u = m.units[id], a = u.team ? Math.PI : 0, cx = u.x + Math.cos(a) * d, cz = u.z + Math.sin(a) * d; let k = 0;
          for (const o of m.units) if (o.team !== u.team && o.alive && k < n) { const b = k * 2.1 - 2.1; o.x = o.px = cx + Math.cos(a) * (k % 2) * 1.2; o.z = o.pz = cz + b; k++; } return [cx, cz]; },
        // The player casts its ultimate at a gathered cluster, then keeps firing.
        ult: (dist = 30) => { const m = G.match, u = m.units[G.me], [cx, cz] = window.__film.gather(G.me); u.cd.ult = 0; let t = 0;
          window.__input(() => { t++; return { mx: 0, mz: 0, aim: Math.atan2(cz - u.z, cx - u.x), fire: t > 4, s1: false, s2: false, ult: t < 4, heal: false, tx: cx, tz: cz }; });
          pose((u.x + cx) / 2, (u.z + cz) / 2, dist); },
      };
      window.__filmEach = (i) => { if (each) each(i); if (window.__filmUser) window.__filmUser(i); };
      // Effects only age when a frame is drawn, so the last 20 s before the clip are drawn tick by tick.
      window.__step(Math.max(0, start - 600), false);
      for (let i = 0; i < Math.min(600, start); i++) window.__step(1, true);
      if (shot) window.__setShot(JSON.parse(shot));
      if (js) (0, eval)(js);
      return '';
    } catch (e) { return String(e && e.stack || e); }
  }, { start: Number(start), shot, js });
  if (!process.env.FILM_HUD) await g.page.addStyleTag({ content: 'body > *:not(#view) { visibility: hidden !important; }' });
  if (ok) { console.log('evalJS threw:', ok); process.exitCode = 1; await g.close(); return; }
  const n = Number(count), ev = Math.max(1, Number(every));
  for (let i = 0; i < n; i++) {
    await g.page.evaluate(({ i, ev }) => { if (window.__filmEach) window.__filmEach(i); window.__step(ev - 1, false); window.__step(1, true); }, { i, ev });
    await g.page.screenshot({ path: path.join(tmp, String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 88 });
  }
  const info = await g.page.evaluate(() => ({ tick: window.__G.match && window.__G.match.tick, errors: window.__errors.slice(0, 5) }));
  await g.close();

  fs.mkdirSync(path.join(CHK, 'clips'), { recursive: true }); fs.mkdirSync(path.join(CHK, sheetDir), { recursive: true });
  const mp4 = path.join(CHK, 'clips', name + '.mp4'), sheet = path.join(CHK, sheetDir, name + '.png');
  const q = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  q(['-framerate', String(Math.round(30 / ev)), '-i', path.join(tmp, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4]);
  const k = Math.min(n, Number(tiles)), cols = 3, rows = Math.ceil(k / cols);
  const picks = Array.from({ length: k }, (_, j) => Math.round(j * (n - 1) / Math.max(1, k - 1)));
  const inputs = picks.flatMap((p) => ['-i', path.join(tmp, String(p).padStart(4, '0') + '.jpg')]);
  const scaled = picks.map((_, j) => `[${j}:v]scale=640:360,drawbox=x=0:y=0:w=46:h=20:color=black@0.6:t=fill,drawtext=text='${picks[j]}':x=4:y=3:fontsize=15:fontcolor=white[s${j}]`);
  const fill = rows * cols - k;
  const pad = fill ? [`color=c=black:s=640x360:d=1[pad]`, `[pad]split=${fill}${Array.from({ length: fill }, (_, j) => `[p${j}]`).join('')}`] : [];
  const cells = picks.map((_, j) => `[s${j}]`).concat(Array.from({ length: fill }, (_, j) => `[p${j}]`)).join('');
  const layout = Array.from({ length: rows * cols }, (_, j) => `${(j % cols) * 640}_${Math.floor(j / cols) * 360}`).join('|');
  const graph = scaled.concat(pad, [`${cells}xstack=inputs=${rows * cols}:layout=${layout}[out]`]).join(';');
  try { q([...inputs, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', sheet]); }
  catch (e) { // drawtext needs a font; fall back to unlabelled tiles.
    const g2 = picks.map((_, j) => `[${j}:v]scale=640:360[s${j}]`).concat(pad, [`${cells}xstack=inputs=${rows * cols}:layout=${layout}[out]`]).join(';');
    q([...inputs, '-filter_complex', g2, '-map', '[out]', '-frames:v', '1', sheet]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(mp4); console.log(sheet, JSON.stringify(info));
});
